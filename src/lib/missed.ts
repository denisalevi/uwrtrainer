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
 * Reconcile non-rugby committed-count shortfalls for a SINGLE completed week.
 *
 * For each user and each non-rugby count commitment (STRENGTH/CARDIO/MOBILITY/OTHER count item
 * in their plan active that week), shortfall = max(0, targetPerWeek − DONE logs of that category
 * that week). Create that many generic auto-MISSED rows (no practiceSlot; category set; for OTHER
 * the note label is carried), dated on the last day (Sunday) of the week.
 *
 * Idempotent within a week: counts existing auto-MISSED of the same category (+note) already
 * created for the week and only tops up the difference. Pure-ish: takes the week-start explicitly
 * so it's testable and manually triggerable. Returns number of rows created.
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
    select: { userId: true, category: true, status: true, auto: true, practiceSlotId: true, details: true },
  });

  // Index logs by user.
  const logsByUser = new Map<string, typeof logs>();
  for (const l of logs) {
    const arr = logsByUser.get(l.userId) ?? [];
    arr.push(l);
    logsByUser.set(l.userId, arr);
  }

  type Create = { userId: string; category: string; details: string | null };
  const toCreate: Create[] = [];

  for (const [userId, plan] of planByUser) {
    const userLogs = logsByUser.get(userId) ?? [];
    // Non-rugby count commitments only (practiceSlotId null, category != RUGBY, target > 0).
    const items = plan.items.filter(
      (it) => it.category !== "RUGBY" && !it.practiceSlotId && it.targetPerWeek > 0,
    );
    for (const it of items) {
      const noteLabel = it.category === "OTHER" ? (it.note ?? "").trim() || null : null;

      const done = userLogs.filter(
        (l) =>
          l.status === "DONE" &&
          l.category === it.category &&
          !l.practiceSlotId &&
          (it.category !== "OTHER" || matchesOtherNote(l.details, noteLabel)),
      ).length;

      const existingAuto = userLogs.filter(
        (l) =>
          l.status === "MISSED" &&
          l.auto &&
          l.category === it.category &&
          !l.practiceSlotId &&
          (it.category !== "OTHER" || matchesOtherNote(l.details, noteLabel)),
      ).length;

      const shortfall = Math.max(0, it.targetPerWeek - done);
      const needed = Math.max(0, shortfall - existingAuto);
      for (let i = 0; i < needed; i++) {
        toCreate.push({
          userId,
          category: it.category,
          details: noteLabel ? JSON.stringify({ note: noteLabel }) : null,
        });
      }
    }
  }

  if (toCreate.length === 0) return 0;

  const missedDate = addDays(weekStart, 6); // Sunday of the week.
  missedDate.setHours(12, 0, 0, 0);
  await prisma.sessionLog.createMany({
    data: toCreate.map((c) => ({
      userId: c.userId,
      category: c.category,
      status: "MISSED",
      auto: true,
      practiceSlotId: null,
      details: c.details,
      date: missedDate,
    })),
  });
  return toCreate.length;
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
