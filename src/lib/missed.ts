import "server-only";
import { prisma } from "@/lib/db";
import { startOfWeek, addWeeks, addDays } from "@/lib/dates";

/**
 * Auto-MISSED reconciliation. Two mechanisms, both producing
 * `SessionLog { status: "MISSED", auto: true }` rows (user-deletable, badged "auto"):
 *
 *  1. Rugby, event-driven (`reconcileRugbyMissed`): driven by attendance recording.
 *  2. Non-rugby, weekly (`reconcileWeek` / scheduler): committed count shortfalls.
 *
 * Dedup invariant: for a (user, slot, date) rugby pair there is never BOTH a DONE
 * and an auto-MISSED row — being marked present removes the auto-MISSED.
 */

/** Local-day [start, end) bounds for a given date (the SessionLog `date` is stored at day granularity). */
function dayBounds(date: Date): { dayStart: Date; dayEnd: Date } {
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  return { dayStart, dayEnd: addDays(dayStart, 1) };
}

/**
 * Event-driven rugby missed reconciliation for one practice slot on one date.
 *
 * For practice `slotId` on `date`:
 *  - Every user with a committed marker for that slot (a PlanItem category=RUGBY +
 *    practiceSlotId=slotId, from their active plan) who is NOT present (has no DONE rugby
 *    log for slot+date) gets ONE auto-MISSED rugby log for slot+date (created if absent).
 *  - Any user who IS present has any auto-MISSED for slot+date removed (present wins).
 *
 * Idempotent: safe to call repeatedly; never creates duplicates, never leaves both DONE and
 * auto-MISSED for the same user+slot+date. Returns the set of touched user ids for revalidation.
 */
export async function reconcileRugbyMissed(slotId: string, date: Date): Promise<string[]> {
  const { dayStart, dayEnd } = dayBounds(date);

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
  if (committedUserIds.length === 0) {
    // Still need to clear stale auto-missed for anyone marked present below.
  }

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
  const autoMissedByUser = new Map<string, string[]>();
  for (const l of existing) {
    if (l.status === "MISSED" && l.auto) {
      const arr = autoMissedByUser.get(l.userId) ?? [];
      arr.push(l.id);
      autoMissedByUser.set(l.userId, arr);
    }
  }

  const touched = new Set<string>();

  // 1. Present users: remove any auto-MISSED (present wins).
  const toDelete: string[] = [];
  for (const [userId, ids] of autoMissedByUser) {
    if (presentUserIds.has(userId)) {
      toDelete.push(...ids);
      touched.add(userId);
    }
  }

  // 2. Committed-but-absent users: ensure exactly one auto-MISSED exists.
  const toCreate: string[] = [];
  for (const userId of committedUserIds) {
    if (presentUserIds.has(userId)) continue;
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

// ── Part C: weekly non-rugby reconciliation ───────────────────────────────────────────────

const LAST_RECONCILED_WEEK_KEY = "missed.lastReconciledWeek";

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

/**
 * Reconcile committed-count shortfalls for a SINGLE completed week, producing ONE summary
 * auto-MISSED row per under-met category (RUGBY included).
 *
 * For each user and each count commitment active that week — the weekly RUGBY count
 * (`category:"RUGBY", practiceSlotId:null, targetPerWeek>0`) plus the non-rugby count items
 * (STRENGTH/CARDIO/MOBILITY/OTHER) — shortfall = max(0, targetPerWeek − DONE that week). When
 * shortfall > 0 we keep exactly ONE summary auto-MISSED row carrying the counts in `details`
 * (`{ missed, target, note? }`) so the UI can render a "missed N of M …" label. The row is dated
 * on the last day (Sunday) of the week.
 *
 * Rugby de-dup: the in-week event-driven per-practice rugby auto-MISSED rows
 * (`auto:true, category:"RUGBY", practiceSlotId != null`) for the week are DELETED first, so the
 * weekly summary doesn't double-count them; they collapse into the single summary row.
 *
 * Idempotent within a week: re-running keeps a single summary row per category (updating its
 * counts), never duplicating. Pure-ish: takes the week-start explicitly so it's testable and
 * manually triggerable. Returns number of summary rows created or updated.
 */
export async function reconcileNonRugbyWeek(weekStart: Date): Promise<number> {
  const weekEnd = addWeeks(weekStart, 1);

  // Active plans overlapping the week (validFrom <= weekEnd-ish, validTo null or >= weekStart).
  const ref = addDays(weekStart, 6);
  const plans = await prisma.plan.findMany({
    where: { validFrom: { lte: ref }, OR: [{ validTo: null }, { validTo: { gte: ref } }] },
    include: { items: true },
    orderBy: { validFrom: "desc" },
  });

  // One active plan per user (most recent validFrom wins).
  const planByUser = new Map<string, (typeof plans)[number]>();
  for (const p of plans) {
    if (!planByUser.has(p.userId)) planByUser.set(p.userId, p);
  }
  if (planByUser.size === 0) return 0;

  const userIds = Array.from(planByUser.keys());
  const logs = await prisma.sessionLog.findMany({
    where: { userId: { in: userIds }, date: { gte: weekStart, lt: weekEnd } },
    select: {
      id: true,
      userId: true,
      category: true,
      status: true,
      auto: true,
      practiceSlotId: true,
      details: true,
    },
  });

  // Index logs by user.
  const logsByUser = new Map<string, typeof logs>();
  for (const l of logs) {
    const arr = logsByUser.get(l.userId) ?? [];
    arr.push(l);
    logsByUser.set(l.userId, arr);
  }

  const missedDate = addDays(weekStart, 6); // Sunday of the week.
  missedDate.setHours(12, 0, 0, 0);

  // De-dup: drop the in-week per-practice event-driven rugby auto-MISSED rows for this week.
  // They stay actionable during the week; at week close they collapse into the single summary.
  const perPracticeRugbyMissedIds = logs
    .filter((l) => l.status === "MISSED" && l.auto && l.category === "RUGBY" && l.practiceSlotId)
    .map((l) => l.id);

  // Existing weekly summary rows (auto-MISSED, no practiceSlot) we may update/delete/keep.
  const existingSummaries = logs.filter(
    (l) => l.status === "MISSED" && l.auto && !l.practiceSlotId,
  );

  type Summary = { userId: string; category: string; missed: number; target: number; note: string | null };
  const wanted: Summary[] = [];

  for (const [userId, plan] of planByUser) {
    const userLogs = logsByUser.get(userId) ?? [];
    // All count commitments (practiceSlotId null, target > 0) — RUGBY plus the others.
    const items = plan.items.filter((it) => !it.practiceSlotId && it.targetPerWeek > 0);
    for (const it of items) {
      const noteLabel = it.category === "OTHER" ? (it.note ?? "").trim() || null : null;

      // DONE for this category this week. Rugby is counted across practices (any DONE rugby log,
      // slot or not); the others are non-slot DONE logs of the matching category (+OTHER note).
      const done = userLogs.filter((l) => {
        if (l.status !== "DONE" || l.category !== it.category) return false;
        if (it.category === "RUGBY") return true;
        return !l.practiceSlotId && (it.category !== "OTHER" || matchesOtherNote(l.details, noteLabel));
      }).length;

      const shortfall = Math.max(0, it.targetPerWeek - done);
      if (shortfall > 0) {
        wanted.push({ userId, category: it.category, missed: shortfall, target: it.targetPerWeek, note: noteLabel });
      }
    }
  }

  // Match wanted summaries to existing summary rows (by user+category+OTHER-note) to update in
  // place; create the rest; delete any stale summary rows that are no longer wanted.
  const summaryKey = (userId: string, category: string, note: string | null) =>
    `${userId}|${category}|${note ?? ""}`;
  const existingByKey = new Map<string, (typeof existingSummaries)[number]>();
  for (const s of existingSummaries) {
    const note = s.category === "OTHER" ? noteFromDetails(s.details) : null;
    // Keep only the first per key; any extras are duplicates to be removed.
    const key = summaryKey(s.userId, s.category, note);
    if (!existingByKey.has(key)) existingByKey.set(key, s);
  }

  const usedSummaryIds = new Set<string>();
  const ops: ReturnType<
    typeof prisma.sessionLog.update | typeof prisma.sessionLog.create
  >[] = [];
  let changed = 0;

  for (const w of wanted) {
    const key = summaryKey(w.userId, w.category, w.note);
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
            userId: w.userId,
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

  // Stale summary rows (no longer wanted, or duplicates) get removed.
  const staleSummaryIds = existingSummaries
    .filter((s) => !usedSummaryIds.has(s.id))
    .map((s) => s.id);

  const idsToDelete = [...perPracticeRugbyMissedIds, ...staleSummaryIds];
  if (idsToDelete.length) {
    await prisma.sessionLog.deleteMany({ where: { id: { in: idsToDelete } } });
  }
  if (ops.length) await prisma.$transaction(ops);

  return changed;
}

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

/**
 * The scheduler tick: reconcile the most-recently-COMPLETED ISO week exactly once.
 * Uses the `missed.lastReconciledWeek` Setting as an idempotency guard so it runs once per week
 * even across restarts or multiple same-day checks. Never runs for the current (incomplete) week.
 * Safe to call as often as you like. Returns a small status object.
 */
export async function runWeeklyReconcileIfDue(
  now: Date = new Date(),
): Promise<{ ran: boolean; week: string; created?: number }> {
  const currentWeekStart = startOfWeek(now);
  const lastCompletedWeekStart = addWeeks(currentWeekStart, -1);
  const week = isoWeekKey(lastCompletedWeekStart);

  const guard = await prisma.setting.findUnique({ where: { key: LAST_RECONCILED_WEEK_KEY } });
  if (guard?.value === week) return { ran: false, week };

  const created = await reconcileNonRugbyWeek(lastCompletedWeekStart);

  await prisma.setting.upsert({
    where: { key: LAST_RECONCILED_WEEK_KEY },
    create: { key: LAST_RECONCILED_WEEK_KEY, value: week },
    update: { value: week },
  });

  return { ran: true, week, created };
}
