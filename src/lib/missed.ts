import "server-only";
import { prisma } from "@/lib/db";
import { startOfWeek, addWeeks, addDays } from "@/lib/dates";
import { isSlotAvailableOn } from "@/lib/practice-window";
import { exemptUsersForWeek, isWeekExempt } from "@/lib/exempt-weeks";

/**
 * Auto-MISSED reconciliation. Two SEPARATE buckets, both producing
 * `SessionLog { status: "MISSED", auto: true }` rows (badged "auto", NOT manually deletable):
 *
 *  (1) Ticked-practice missed — specific, event-driven, per person, tied to a practice slot+date.
 *      Created by `reconcileRugbyMissed` when a TICKED practice (a `{RUGBY, practiceSlotId:S,
 *      target:0}` marker) gets attendance logged and the user is absent. These STAY as their own
 *      detailed rows (`practiceSlotId != null`) — they are NOT folded into the weekly summary.
 *
 *  (2) Count-shortfall missed — end-of-week, generic, one summary row per category where short>0
 *      (`practiceSlotId == null`, counts in `details`). Created by `reconcileNonRugbyWeek` only
 *      after a week has closed (+ grace). For RUGBY the shortfall subtracts the ticked misses so
 *      the two buckets never double-count.
 *
 * Dedup invariant (bucket 1): for a (user, slot, date) rugby pair there is never BOTH a DONE
 * and an auto-MISSED row — being marked present removes the auto-MISSED.
 *
 * Freeze: when `reconcileNonRugbyWeek` first creates a week's summary rows it snapshots each
 * category's `target` into the row's `details`. On any later recompute of that SAME closed week
 * we use the STORED target (not the live plan), so changing a commitment never alters closed
 * weeks — only the `done` count (and thus `missed`) may change via late logging.
 */

/**
 * RETIRED (2026-07, kill switch): auto-MISSED rows are no longer generated — the weekly goal
 * summary ("n of m done") plus ONE free-text reason per week (`WeekNote`) replaced them, and
 * scoring never read MISSED rows anyway (adherence = plan targets vs DONE logs). The whole
 * mechanism is KEPT and tested so it can come back (e.g. for mandatory practices only):
 * flip `enabled` to true. Existing auto rows stay in the DB but are hidden in the UI.
 */
export const autoMissedConfig = { enabled: false };

/** Local-day [start, end) bounds for a given date (the SessionLog `date` is stored at day granularity). */
function dayBounds(date: Date): { dayStart: Date; dayEnd: Date } {
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  return { dayStart, dayEnd: addDays(dayStart, 1) };
}

/**
 * Bucket (1): event-driven ticked-practice rugby missed reconciliation for one practice slot on
 * one date.
 *
 * For practice `slotId` on `date`:
 *  - Every user with a TICKED marker for that slot (a PlanItem category=RUGBY +
 *    practiceSlotId=slotId, from their active plan) who is NOT present (has no DONE rugby
 *    log for slot+date) gets ONE auto-MISSED rugby log for slot+date (created if absent).
 *  - Any user who IS present has any auto-MISSED for slot+date removed (present wins).
 *  - A MANUAL (non-auto) MISSED rugby log for slot+date counts as accounted-for: no auto row is
 *    created for that user, and any existing auto row is removed (no double penalty).
 *
 * Idempotent: safe to call repeatedly; never creates duplicates, never leaves both DONE and
 * auto-MISSED for the same user+slot+date. Returns the set of touched user ids for revalidation.
 */
export async function reconcileRugbyMissed(slotId: string, date: Date): Promise<string[]> {
  if (!autoMissedConfig.enabled) return [];
  const { dayStart, dayEnd } = dayBounds(date);

  // Seasonal guard: a practice that is deactivated or outside its date window on this day is not
  // "expected" — it must produce no auto-MISSED. If any stale auto rows exist for it (e.g. the
  // window was narrowed after they were created), clear them and stop. Missing slot => proceed
  // (backwards-compatible: treat as always-available).
  const slot = await prisma.practiceSlot.findUnique({
    where: { id: slotId },
    select: { active: true, validFrom: true, validTo: true },
  });
  if (slot && !isSlotAvailableOn(slot, date)) {
    const staleAutos = await prisma.sessionLog.findMany({
      where: {
        category: "RUGBY",
        practiceSlotId: slotId,
        status: "MISSED",
        auto: true,
        date: { gte: dayStart, lt: dayEnd },
      },
      select: { id: true, userId: true },
    });
    if (staleAutos.length) {
      await prisma.sessionLog.deleteMany({ where: { id: { in: staleAutos.map((a) => a.id) } } });
    }
    return staleAutos.map((a) => a.userId);
  }

  // Users committed to this specific practice slot via an active plan marker.
  const planItems = await prisma.planItem.findMany({
    where: {
      category: "RUGBY",
      practiceSlotId: slotId,
      plan: { validTo: null },
    },
    select: { plan: { select: { userId: true } } },
  });
  const committedUserIds = Array.from(new Set(planItems.map((p) => p.plan.userId)));

  // Existing rugby logs (DONE or auto-MISSED) for this slot on this day.
  const existing = await prisma.sessionLog.findMany({
    where: {
      category: "RUGBY",
      practiceSlotId: slotId,
      date: { gte: dayStart, lt: dayEnd },
    },
    select: { id: true, userId: true, status: true, auto: true },
  });

  const presentUserIds = new Set(
    existing.filter((l) => l.status === "DONE").map((l) => l.userId),
  );
  // A MANUAL missed row (logged via /log with this slot+date) already accounts for the absence —
  // it must suppress (and displace) the auto row, or the user carries a double penalty.
  const manualMissedUserIds = new Set(
    existing.filter((l) => l.status === "MISSED" && !l.auto).map((l) => l.userId),
  );
  const autoMissedByUser = new Map<string, string[]>();
  for (const l of existing) {
    if (l.status === "MISSED" && l.auto) {
      const arr = autoMissedByUser.get(l.userId) ?? [];
      arr.push(l.id);
      autoMissedByUser.set(l.userId, arr);
    }
  }

  const touched = new Set<string>();

  // Tournament exemption (#31): players who played a tournament that week owe no goals — they
  // must get no auto-MISSED for this practice, and any existing one is cleared.
  const exemptUsers = await exemptUsersForWeek(
    Array.from(new Set([...committedUserIds, ...autoMissedByUser.keys()])),
    startOfWeek(date),
  );

  // 1. Accounted-for users (present, manual MISSED row, or tournament-exempt): remove any auto-MISSED.
  const toDelete: string[] = [];
  for (const [userId, ids] of autoMissedByUser) {
    if (presentUserIds.has(userId) || manualMissedUserIds.has(userId) || exemptUsers.has(userId)) {
      toDelete.push(...ids);
      touched.add(userId);
    }
  }

  // 2. Committed-but-unaccounted users: ensure exactly one auto-MISSED exists.
  const toCreate: string[] = [];
  for (const userId of committedUserIds) {
    if (presentUserIds.has(userId) || manualMissedUserIds.has(userId) || exemptUsers.has(userId))
      continue;
    const hasAuto = (autoMissedByUser.get(userId)?.length ?? 0) > 0;
    if (!hasAuto) {
      toCreate.push(userId);
      touched.add(userId);
    } else {
      // Already has an auto-missed; collapse any duplicates to a single row.
      const ids = autoMissedByUser.get(userId)!;
      if (ids.length > 1) toDelete.push(...ids.slice(1));
    }
  }

  if (toDelete.length || toCreate.length) {
    await prisma.$transaction([
      ...(toDelete.length
        ? [prisma.sessionLog.deleteMany({ where: { id: { in: toDelete } } })]
        : []),
      ...(toCreate.length
        ? [
            prisma.sessionLog.createMany({
              data: toCreate.map((userId) => ({
                userId,
                category: "RUGBY",
                status: "MISSED",
                auto: true,
                practiceSlotId: slotId,
                date: dayStart,
              })),
            }),
          ]
        : []),
    ]);
  }

  return Array.from(touched);
}

// ── Bucket (2): weekly count-shortfall reconciliation ─────────────────────────────────────────

const LAST_RECONCILED_WEEK_KEY = "missed.lastReconciledWeek";

/** Days after a week ends before we reconcile it — late-logging grace period. */
export const RECONCILE_GRACE_DAYS = 3;

/** ISO-week key (e.g. "2026-W26") for a Monday week-start date — used as the idempotency guard. */
export function isoWeekKey(weekStart: Date): string {
  // weekStart is a Monday (startOfWeek). ISO week number via Thursday of the same week.
  const thursday = addDays(weekStart, 3);
  const year = thursday.getFullYear();
  const jan1 = new Date(year, 0, 1);
  const dayOfYear = Math.round((thursday.getTime() - jan1.getTime()) / 86400000) + 1;
  const week = Math.ceil(dayOfYear / 7);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

type CountItem = { category: string; target: number; note: string | null };

/** Read an OTHER note label out of a log's details JSON (summary or plain note), if any. */
function noteFromDetails(details: string | null): string | null {
  if (!details) return null;
  try {
    const d = JSON.parse(details) as { note?: string };
    return (d.note ?? "").trim() || null;
  } catch {
    return null;
  }
}

/** Does a log's details JSON carry the given OTHER note label (loose match; null label matches anything)? */
function matchesOtherNote(details: string | null, noteLabel: string | null): boolean {
  if (!noteLabel) return true;
  if (!details) return false;
  try {
    const d = JSON.parse(details) as { note?: string };
    return (d.note ?? "").trim() === noteLabel;
  } catch {
    return false;
  }
}

/** The active count commitments (practiceSlotId null, target>0) for a user in the given week. */
function countItemsFromPlan(
  items: { category: string; practiceSlotId: string | null; targetPerWeek: number; note: string | null }[],
): CountItem[] {
  return items
    .filter((it) => !it.practiceSlotId && it.targetPerWeek > 0)
    .map((it) => ({
      category: it.category,
      target: it.targetPerWeek,
      note: it.category === "OTHER" ? (it.note ?? "").trim() || null : null,
    }));
}

/**
 * Reconcile committed-count shortfalls for a SINGLE completed week, producing ONE summary
 * auto-MISSED row per under-met category — for ALL users with an active plan that week.
 *
 * See `reconcileWeekForUser` for the per-user core (this just fans out over users). Returns the
 * number of summary rows created/updated/removed across all users.
 */
export async function reconcileNonRugbyWeek(weekStart: Date): Promise<number> {
  const ref = addDays(weekStart, 6);
  const plans = await prisma.plan.findMany({
    where: { validFrom: { lte: ref }, OR: [{ validTo: null }, { validTo: { gte: ref } }] },
    select: { userId: true },
    orderBy: { validFrom: "desc" },
  });
  const userIds = Array.from(new Set(plans.map((p) => p.userId)));
  let changed = 0;
  for (const userId of userIds) {
    changed += await reconcileWeekForUser(weekStart, userId);
  }
  return changed;
}

/**
 * Count-shortfall reconcile for ONE user and ONE (closed) week. Idempotent.
 *
 * For each count commitment active that week — the weekly RUGBY count
 * (`category:"RUGBY", practiceSlotId:null, target>0`) plus the non-rugby count items
 * (STRENGTH/CARDIO/MOBILITY/OTHER):
 *  - `done` = DONE logs of that category in the week (rugby across all practices; others non-slot
 *    + matching OTHER note).
 *  - non-rugby: `short = max(0, target − done)`.
 *  - RUGBY:     `short = max(0, target − rugbyDone − tickedMissesThisWeek)` so the ticked-practice
 *    bucket (1) rows are never double-counted by the summary.
 *
 * FREEZE: the `target` used is the STORED one from an existing summary row when present (the week
 * is already closed/snapshotted); only on first creation do we snapshot the live plan target.
 * This means changing a commitment never alters a closed week — only `done` (late logging) does.
 *
 * Bucket (1) ticked-practice rugby missed rows are LEFT ALONE (they stay as their own detailed
 * rows). We only count them, never delete/collapse them.
 *
 * Returns the number of summary rows created/updated/removed for this user+week.
 */
export async function reconcileWeekForUser(weekStart: Date, userId: string): Promise<number> {
  if (!autoMissedConfig.enabled) return 0;
  const weekEnd = addWeeks(weekStart, 1);
  const ref = addDays(weekStart, 6);

  // Tournament exemption (#31): the week owes no goals — no shortfall summaries may exist for
  // it. Clear any that were created before the tournament was logged, then stop.
  if (await isWeekExempt(userId, weekStart)) {
    const stale = await prisma.sessionLog.findMany({
      where: {
        userId,
        status: "MISSED",
        auto: true,
        practiceSlotId: null,
        date: { gte: weekStart, lt: weekEnd },
      },
      select: { id: true },
    });
    if (stale.length) {
      await prisma.sessionLog.deleteMany({ where: { id: { in: stale.map((s) => s.id) } } });
    }
    return stale.length;
  }

  const plan = await prisma.plan.findFirst({
    where: {
      userId,
      validFrom: { lte: ref },
      OR: [{ validTo: null }, { validTo: { gte: ref } }],
    },
    orderBy: { validFrom: "desc" },
    include: { items: true },
  });

  const logs = await prisma.sessionLog.findMany({
    where: { userId, date: { gte: weekStart, lt: weekEnd } },
    select: {
      id: true,
      category: true,
      status: true,
      auto: true,
      practiceSlotId: true,
      details: true,
    },
  });

  const missedDate = addDays(weekStart, 6); // Sunday of the week.
  missedDate.setHours(12, 0, 0, 0);

  // Existing summary rows for this user+week (auto-MISSED, no practiceSlot). These carry the
  // FROZEN target snapshot in details.
  const existingSummaries = logs.filter(
    (l) => l.status === "MISSED" && l.auto && !l.practiceSlotId,
  );
  const summaryKey = (category: string, note: string | null) => `${category}|${note ?? ""}`;
  const existingByKey = new Map<string, (typeof existingSummaries)[number]>();
  for (const s of existingSummaries) {
    const note = s.category === "OTHER" ? noteFromDetails(s.details) : null;
    const key = summaryKey(s.category, note);
    if (!existingByKey.has(key)) existingByKey.set(key, s);
  }

  // The live plan count commitments (used for FIRST creation only).
  const liveItems = plan ? countItemsFromPlan(plan.items) : [];
  const liveByKey = new Map<string, CountItem>();
  for (const it of liveItems) liveByKey.set(summaryKey(it.category, it.note), it);

  // Ticked-practice rugby misses this week (bucket 1) — counted, never collapsed.
  const tickedRugbyMisses = logs.filter(
    (l) => l.status === "MISSED" && l.auto && l.category === "RUGBY" && l.practiceSlotId,
  ).length;

  // The set of category/note keys to evaluate: union of live commitments and existing frozen
  // summary rows (a closed week keeps its frozen rows even if the plan later dropped the item).
  const keys = new Set<string>([...liveByKey.keys(), ...existingByKey.keys()]);

  type Want = { category: string; note: string | null; missed: number; target: number };
  const wanted: Want[] = [];

  for (const key of keys) {
    const existing = existingByKey.get(key);
    const live = liveByKey.get(key);
    // FREEZE: prefer the stored snapshot target; fall back to the live plan on first creation.
    const stored = existing ? parseStoredTarget(existing.details) : null;
    const target = stored ?? live?.target ?? 0;
    if (target <= 0) continue;
    const category = existing?.category ?? live!.category;
    const note =
      category === "OTHER"
        ? existing
          ? noteFromDetails(existing.details)
          : (live?.note ?? null)
        : null;

    const done = logs.filter((l) => {
      if (l.status !== "DONE" || l.category !== category) return false;
      if (category === "RUGBY") return true;
      return !l.practiceSlotId && (category !== "OTHER" || matchesOtherNote(l.details, note));
    }).length;

    const short =
      category === "RUGBY"
        ? Math.max(0, target - done - tickedRugbyMisses)
        : Math.max(0, target - done);

    if (short > 0) wanted.push({ category, note, missed: short, target });
  }

  const usedSummaryIds = new Set<string>();
  const ops: ReturnType<
    typeof prisma.sessionLog.update | typeof prisma.sessionLog.create
  >[] = [];
  let changed = 0;

  for (const w of wanted) {
    const key = summaryKey(w.category, w.note);
    const detailsObj: Record<string, unknown> = { missed: w.missed, target: w.target };
    if (w.note) detailsObj.note = w.note;
    const details = JSON.stringify(detailsObj);
    const existing = existingByKey.get(key);
    if (existing) {
      usedSummaryIds.add(existing.id);
      if (existing.details !== details) {
        ops.push(prisma.sessionLog.update({ where: { id: existing.id }, data: { details } }));
        changed++;
      }
    } else {
      ops.push(
        prisma.sessionLog.create({
          data: {
            userId,
            category: w.category,
            status: "MISSED",
            auto: true,
            practiceSlotId: null,
            details,
            date: missedDate,
          },
        }),
      );
      changed++;
    }
  }

  // Stale summary rows (shortfall self-healed to 0 via late logging, or duplicates) get removed.
  const staleSummaryIds = existingSummaries
    .filter((s) => !usedSummaryIds.has(s.id))
    .map((s) => s.id);
  if (staleSummaryIds.length) {
    await prisma.sessionLog.deleteMany({ where: { id: { in: staleSummaryIds } } });
    changed += staleSummaryIds.length;
  }
  if (ops.length) await prisma.$transaction(ops);

  return changed;
}

/** Read the FROZEN target snapshot out of an existing summary row's details, if present. */
function parseStoredTarget(details: string | null): number | null {
  if (!details) return null;
  try {
    const d = JSON.parse(details) as { target?: number };
    return typeof d.target === "number" ? d.target : null;
  } catch {
    return null;
  }
}

/**
 * Has the week starting at `weekStart` already been reconciled? A week's count summary rows only
 * exist once the scheduler has run it, which happens once `now >= weekEnd + grace`. So a week is
 * "reconciled" (has — or imminently will have — summary rows worth healing) exactly when its
 * end + grace is in the past. Pure time check; `now` is injectable for tests.
 */
export function isWeekReconciled(weekStart: Date, now: Date = new Date()): boolean {
  const due = addDays(addWeeks(weekStart, 1), RECONCILE_GRACE_DAYS);
  return now >= due;
}

/**
 * Self-heal hook: when a DONE session is added/removed for `date`, if that date falls in an
 * ALREADY-reconciled past week, re-run that week's count reconcile for `userId` (using the FROZEN
 * stored targets) so the missed count self-corrects. No-op for the current/open week (no summary
 * rows exist there yet). Safe to call unconditionally from the mutating actions.
 */
export async function selfHealCountWeek(
  userId: string,
  date: Date,
  now: Date = new Date(),
): Promise<void> {
  const ws = startOfWeek(date);
  if (ws.getTime() >= startOfWeek(now).getTime()) return; // current/future week: no summary yet.
  if (!isWeekReconciled(ws, now)) return; // closed but still in grace: nothing to heal yet.
  await reconcileWeekForUser(ws, userId);
}

/**
 * On first run (or when the guard is stale/garbage) don't backfill the whole history of an old
 * install — reconcile at most this many closed weeks back from the most recent one.
 */
export const RECONCILE_MAX_BACKFILL_WEEKS = 8;

/**
 * The scheduler tick: reconcile every COMPLETED-and-past-grace ISO week that hasn't been
 * reconciled yet, exactly once each. Uses the `missed.lastReconciledWeek` Setting as the
 * idempotency guard: when due, we walk back from the most recent reconcilable week to the guard
 * week (bounded by RECONCILE_MAX_BACKFILL_WEEKS when the guard is missing or out of range) and
 * reconcile each closed week oldest-first, advancing the guard after each week completes — so a
 * week that closed while the server was down still gets its summary rows (with targets frozen at
 * reconcile time), and a crash mid-backfill resumes where it left off.
 *
 * Concurrency note: the guard is read-then-written without a lock, same as it always was — two
 * overlapping ticks (or two app instances) can both pass the guard check and reconcile the same
 * week. That is harmless-by-design because `reconcileWeekForUser` is idempotent, but it is NOT a
 * multi-instance lock; don't rely on it for one.
 *
 * Never runs for the current (incomplete) week, nor for a closed week still in grace. Returns a
 * small status object (`week` is the most recent reconcilable week; `created` sums all weeks run).
 */
export async function runWeeklyReconcileIfDue(
  now: Date = new Date(),
): Promise<{ ran: boolean; week: string; created?: number }> {
  if (!autoMissedConfig.enabled) return { ran: false, week: "" };
  const currentWeekStart = startOfWeek(now);
  const lastCompletedWeekStart = addWeeks(currentWeekStart, -1);
  const week = isoWeekKey(lastCompletedWeekStart);

  // Grace: only reconcile the just-closed week once we're past weekEnd + grace days, so late
  // logging lands first. Until then, do nothing this tick (a later tick will pick it up).
  // (Any OLDER closed week is necessarily past grace too, so the whole tick can wait.)
  if (!isWeekReconciled(lastCompletedWeekStart, now)) {
    return { ran: false, week };
  }

  const guard = await prisma.setting.findUnique({ where: { key: LAST_RECONCILED_WEEK_KEY } });
  if (guard?.value === week) return { ran: false, week };

  // Collect every closed week after the guard week, oldest first. Walk back from the most recent
  // reconcilable week until we hit the guard; if there is no guard (first run) or it's further
  // back than the backfill window (stale/garbage value), stop at the bound.
  const pending: Date[] = [];
  for (let i = 0; i < RECONCILE_MAX_BACKFILL_WEEKS; i++) {
    const ws = addWeeks(lastCompletedWeekStart, -i);
    if (guard?.value === isoWeekKey(ws)) break;
    pending.unshift(ws);
  }

  let created = 0;
  for (const ws of pending) {
    created += await reconcileNonRugbyWeek(ws);
    // Advance the guard after EACH week so a crash mid-backfill doesn't redo finished weeks.
    const key = isoWeekKey(ws);
    await prisma.setting.upsert({
      where: { key: LAST_RECONCILED_WEEK_KEY },
      create: { key: LAST_RECONCILED_WEEK_KEY, value: key },
      update: { value: key },
    });
  }

  return { ran: true, week, created };
}
