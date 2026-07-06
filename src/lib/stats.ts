import "server-only";
import { prisma } from "@/lib/db";
import {
  scoreWeek,
  fullAdherenceStreak,
  type ScoreItem,
  type WeekScore,
} from "@/lib/scoring";
import {
  startOfWeek,
  addWeeks,
  addDays,
  periodRange,
  weekStartsInRange,
  type Period,
} from "@/lib/dates";
import type { Category, LeaderboardMetric, PracticeTier } from "@/lib/constants";
import { selectActivePlan } from "@/lib/plan-version";
import { isSlotInSeasonForWeek } from "@/lib/practice-window";

type LogRow = {
  status: string;
  category: string;
  practiceSlotId: string | null;
  tier: string | null; // practice slot tier, if any
  date: Date;
};

type PlanWithItems = {
  id: string;
  userId: string;
  validFrom: Date;
  validTo: Date | null;
  items: {
    category: string;
    target: number;
    practiceSlotId: string | null;
    tier: PracticeTier | null;
    note: string | null;
    label: string | null; // practice slot label, if any
    // Seasonal window of the committed practice slot (null slot => not a specific practice).
    slotActive: boolean;
    slotValidFrom: Date | null;
    slotValidTo: Date | null;
    slotDayOfWeek: number | null;
  }[];
};

/** The plan items active for `userId` at `ref`, with practice tier resolved. */
function activeItems(plans: PlanWithItems[], userId: string, ref: Date) {
  return selectActivePlan(plans, userId, ref)?.items ?? [];
}

function buildScoreItems(
  items: PlanWithItems["items"],
  logs: LogRow[],
  weekStart: Date,
): (ScoreItem & { note: string | null; label: string | null })[] {
  return items.map((it) => {
    let done: number;
    if (it.practiceSlotId) {
      // A specific committed practice slot — count completions of that slot.
      done = logs.filter((l) => l.status === "DONE" && l.practiceSlotId === it.practiceSlotId).length;
    } else if (it.category === "RUGBY") {
      // Authoritative weekly rugby count: any DONE rugby session counts, whether or not it
      // was logged against a specific practice slot.
      done = logs.filter((l) => l.status === "DONE" && l.category === "RUGBY").length;
    } else {
      // Generic count-based commitment (STRENGTH/CARDIO/MOBILITY/OTHER).
      done = logs.filter(
        (l) => l.status === "DONE" && l.category === it.category && !l.practiceSlotId,
      ).length;
    }
    // A committed practice that's out of season this week (deactivated or outside its date
    // window) isn't expected: drop its target to 0 so it neither counts nor penalises adherence.
    let target = it.target;
    if (it.practiceSlotId && it.slotDayOfWeek != null) {
      const inSeason = isSlotInSeasonForWeek(
        {
          active: it.slotActive,
          validFrom: it.slotValidFrom,
          validTo: it.slotValidTo,
          dayOfWeek: it.slotDayOfWeek,
        },
        weekStart,
      );
      if (!inSeason) target = 0;
    }
    return {
      category: it.category as Category,
      tier: it.tier,
      target,
      done,
      note: it.note,
      label: it.label,
    };
  });
}

async function loadPlans(userIds?: string[]): Promise<PlanWithItems[]> {
  const plans = await prisma.plan.findMany({
    where: userIds ? { userId: { in: userIds } } : undefined,
    include: { items: { include: { practiceSlot: true } } },
  });
  return plans.map((p) => ({
    id: p.id,
    userId: p.userId,
    validFrom: p.validFrom,
    validTo: p.validTo,
    items: p.items.map((it) => ({
      category: it.category,
      target: it.targetPerWeek,
      practiceSlotId: it.practiceSlotId,
      tier: (it.practiceSlot?.tier as PracticeTier | undefined) ?? null,
      note: it.note,
      label: it.practiceSlot?.label ?? null,
      slotActive: it.practiceSlot?.active ?? true,
      slotValidFrom: it.practiceSlot?.validFrom ?? null,
      slotValidTo: it.practiceSlot?.validTo ?? null,
      slotDayOfWeek: it.practiceSlot?.dayOfWeek ?? null,
    })),
  }));
}

async function loadLogs(userIds: string[], start: Date, end: Date): Promise<Map<string, LogRow[]>> {
  const logs = await prisma.sessionLog.findMany({
    where: { userId: { in: userIds }, date: { gte: start, lt: end } },
    include: { practiceSlot: { select: { tier: true } } },
  });
  const byUser = new Map<string, LogRow[]>();
  for (const l of logs) {
    const row: LogRow = {
      status: l.status,
      category: l.category,
      practiceSlotId: l.practiceSlotId,
      tier: l.practiceSlot?.tier ?? null,
      date: l.date,
    };
    const arr = byUser.get(l.userId) ?? [];
    arr.push(row);
    byUser.set(l.userId, arr);
  }
  return byUser;
}

function logsInWeek(logs: LogRow[], weekStart: Date): LogRow[] {
  const end = addWeeks(weekStart, 1);
  return logs.filter((l) => l.date >= weekStart && l.date < end);
}

export type WeekDetail = {
  weekStart: Date;
  score: WeekScore;
  items: (ScoreItem & { note: string | null; label: string | null })[];
};

/** Full detail for one player's current week — used by the dashboard. */
export async function getCurrentWeekDetail(userId: string): Promise<WeekDetail> {
  const weekStart = startOfWeek(new Date());
  const plans = await loadPlans([userId]);
  const logsByUser = await loadLogs([userId], weekStart, addWeeks(weekStart, 1));
  const ref = addDays(weekStart, 6);
  const items = buildScoreItems(activeItems(plans, userId, ref), logsByUser.get(userId) ?? [], weekStart);
  return { weekStart, score: scoreWeek(items), items };
}

export type WeekPlanItem = ScoreItem & { note: string | null; label: string | null };

/**
 * Plan-vs-done items for each requested week (keyed by weekStart ms) — drives the
 * per-week achievement headers in the session-log list.
 */
export async function getWeekItemsForWeeks(
  userId: string,
  weekStarts: Date[],
): Promise<Map<number, WeekPlanItem[]>> {
  const out = new Map<number, WeekPlanItem[]>();
  if (weekStarts.length === 0) return out;
  const sorted = [...weekStarts].sort((a, b) => a.getTime() - b.getTime());
  const start = sorted[0];
  const end = addWeeks(sorted[sorted.length - 1], 1);
  const plans = await loadPlans([userId]);
  const logsByUser = await loadLogs([userId], start, end);
  const logs = logsByUser.get(userId) ?? [];
  for (const ws of sorted) {
    out.set(
      ws.getTime(),
      buildScoreItems(activeItems(plans, userId, addDays(ws, 6)), logsInWeek(logs, ws), ws),
    );
  }
  return out;
}

/** Current trailing full-adherence-week streak (looks back up to `weeks` weeks). */
export async function getStreak(userId: string, weeks = 26): Promise<number> {
  const thisWeekStart = startOfWeek(new Date());
  // Consider completed weeks only (exclude the in-progress current week).
  const lastCompleted = addWeeks(thisWeekStart, -1);
  const windowStart = addWeeks(lastCompleted, -(weeks - 1));
  const plans = await loadPlans([userId]);
  const logsByUser = await loadLogs([userId], windowStart, thisWeekStart);
  const logs = logsByUser.get(userId) ?? [];

  const pcts: number[] = [];
  for (const ws of weekStartsInRange(windowStart, thisWeekStart)) {
    const items = buildScoreItems(activeItems(plans, userId, addDays(ws, 6)), logsInWeek(logs, ws), ws);
    const s = scoreWeek(items);
    pcts.push(s.hasPlan ? s.adherencePct : 0);
  }
  return fullAdherenceStreak(pcts);
}

/**
 * This week's value for every leaderboard metric, for one player — used to drive the
 * dashboard cards (we only display the ones whose leaderboard is enabled/visible).
 */
export async function getCurrentWeekMetrics(
  userId: string,
): Promise<Record<LeaderboardMetric, number>> {
  const weekStart = startOfWeek(new Date());
  const plans = await loadPlans([userId]);
  const logsByUser = await loadLogs([userId], weekStart, addWeeks(weekStart, 1));
  const logs = logsByUser.get(userId) ?? [];
  const items = buildScoreItems(activeItems(plans, userId, addDays(weekStart, 6)), logs, weekStart);
  const score = scoreWeek(items);
  return {
    ADHERENCE_POINTS: score.points,
    RUGBY_PRACTICES: logs.filter((l) => l.status === "DONE" && l.category === "RUGBY").length,
    PRIMARY_PRACTICES: logs.filter((l) => l.status === "DONE" && l.tier === "PRIMARY").length,
    STREAK: await getStreak(userId),
  };
}

export type LeaderRow = { userId: string; name: string; value: number };

/** Compute a leaderboard for a metric over a period, sorted descending. */
export async function getLeaderboard(
  metric: LeaderboardMetric,
  period: Period,
  teamId: string | null,
): Promise<LeaderRow[]> {
  if (!teamId) return [];
  const { start, end } = periodRange(period);
  const users = await prisma.user.findMany({
    where: { memberships: { some: { teamId } } },
    select: { id: true, name: true },
  });
  const userIds = users.map((u) => u.id);
  if (userIds.length === 0) return [];

  let values = new Map<string, number>();

  if (metric === "RUGBY_PRACTICES" || metric === "PRIMARY_PRACTICES") {
    const logsByUser = await loadLogs(userIds, start, end);
    for (const u of users) {
      const logs = logsByUser.get(u.id) ?? [];
      const count = logs.filter((l) => {
        if (l.status !== "DONE") return false;
        if (metric === "RUGBY_PRACTICES") return l.category === "RUGBY";
        return l.tier === "PRIMARY";
      }).length;
      values.set(u.id, count);
    }
  } else if (metric === "ADHERENCE_POINTS") {
    const plans = await loadPlans(userIds);
    const logsByUser = await loadLogs(userIds, start, end);
    const weeks = weekStartsInRange(start, end);
    for (const u of users) {
      const logs = logsByUser.get(u.id) ?? [];
      let total = 0;
      for (const ws of weeks) {
        const items = buildScoreItems(activeItems(plans, u.id, addDays(ws, 6)), logsInWeek(logs, ws), ws);
        total += scoreWeek(items).points;
      }
      values.set(u.id, total);
    }
  } else {
    // STREAK — current streak, independent of the selected period.
    for (const u of users) {
      values.set(u.id, await getStreak(u.id));
    }
  }

  return users
    .map((u) => ({ userId: u.id, name: u.name, value: values.get(u.id) ?? 0 }))
    .sort((a, b) => b.value - a.value);
}

/** Compact per-player summary for the trainer team view (current week). */
export async function getTeamSummary(teamId: string | null): Promise<
  { userId: string; name: string; role: string; adherencePct: number; points: number; hasPlan: boolean; claimed: boolean }[]
> {
  if (!teamId) return [];
  const users = await prisma.user.findMany({
    where: { memberships: { some: { teamId } } },
    select: { id: true, name: true, role: true, passwordHash: true },
  });
  const userIds = users.map((u) => u.id);
  if (userIds.length === 0) return [];
  const weekStart = startOfWeek(new Date());
  const plans = await loadPlans(userIds);
  const logsByUser = await loadLogs(userIds, weekStart, addWeeks(weekStart, 1));
  const ref = addDays(weekStart, 6);

  return users.map((u) => {
    const items = buildScoreItems(activeItems(plans, u.id, ref), logsByUser.get(u.id) ?? [], weekStart);
    const s = scoreWeek(items);
    return {
      userId: u.id,
      name: u.name,
      role: u.role,
      adherencePct: s.adherencePct,
      points: s.points,
      hasPlan: s.hasPlan,
      claimed: u.passwordHash !== null,
    };
  });
}
