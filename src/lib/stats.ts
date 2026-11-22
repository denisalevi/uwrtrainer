import "server-only";
import { prisma } from "@/lib/db";
import {
  scoreWeek,
  applyWeekExemption,
  fullAdherenceStreak,
  type ScoreItem,
  type WeekScore,
} from "@/lib/scoring";
import { loadExemptWeeks } from "@/lib/exempt-weeks";
import { otherSessions, rugbyPracticesAttended, tournamentDays } from "@/lib/tournament";
import {
  startOfWeek,
  addWeeks,
  addDays,
  periodRange,
  weekStartsInRange,
  monthStartsInRange,
  nextMonth,
  type LeaderboardPeriod,
} from "@/lib/dates";
import { getSeason } from "@/lib/season-store";
import {
  monthTargetFromWeekly,
  monthTargetForPart,
  scoreMonthGoals,
  combineMonths,
  type MonthScore,
  type WeeklyShare,
} from "@/lib/month-scoring";
import type { Category, LeaderboardMetric, PlanCadence, PracticeTier } from "@/lib/constants";
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
    /** WEEK goals score per Mon–Sun week; MONTH goals only in the month view (month-scoring.ts). */
    cadence: PlanCadence;
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
): (ScoreItem & {
  note: string | null;
  label: string | null;
  practiceSlotId: string | null;
  slotDayOfWeek: number | null;
  inSeason: boolean;
})[] {
  // The weekly score (weekly board, streak, dashboard week) only knows weekly goals.
  return items.filter((it) => it.cadence !== "MONTH").map((it) => {
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
    let inSeason = true;
    if (it.practiceSlotId && it.slotDayOfWeek != null) {
      inSeason = isSlotInSeasonForWeek(
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
      // Committed-practice metadata, so the weekly breakdown can render the specific practice
      // with an attended/missed mark (a slot marker has target 0 and is invisible to scoring).
      practiceSlotId: it.practiceSlotId,
      slotDayOfWeek: it.slotDayOfWeek,
      inSeason,
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
      // Practice-slot markers are weekly by definition, whatever the column says.
      cadence: (it.cadence === "MONTH" && !it.practiceSlotId ? "MONTH" : "WEEK") as PlanCadence,
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
  /** Tournament-exempt week (#31): goals are paused, the score counts as fully adherent. */
  exempt: boolean;
};

/** Full detail for one player's current week — used by the dashboard. */
export async function getCurrentWeekDetail(userId: string): Promise<WeekDetail> {
  const weekStart = startOfWeek(new Date());
  const plans = await loadPlans([userId]);
  const logsByUser = await loadLogs([userId], weekStart, addWeeks(weekStart, 1));
  const exempt = (await loadExemptWeeks([userId], weekStart, addWeeks(weekStart, 1)))
    .get(userId)
    ?.has(weekStart.getTime()) ?? false;
  const ref = addDays(weekStart, 6);
  const items = buildScoreItems(activeItems(plans, userId, ref), logsByUser.get(userId) ?? [], weekStart);
  const score = scoreWeek(items);
  return { weekStart, score: exempt ? applyWeekExemption(score) : score, items, exempt };
}

export type WeekPlanItem = ScoreItem & {
  note: string | null;
  label: string | null;
  practiceSlotId: string | null;
  slotDayOfWeek: number | null;
  inSeason: boolean;
};

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

/** Which of the requested weeks are tournament-exempt for `userId` (keyed by weekStart ms). */
export async function getExemptWeekSet(userId: string, weekStarts: Date[]): Promise<Set<number>> {
  if (weekStarts.length === 0) return new Set();
  const sorted = [...weekStarts].sort((a, b) => a.getTime() - b.getTime());
  const map = await loadExemptWeeks([userId], sorted[0], addWeeks(sorted[sorted.length - 1], 1));
  const weeks = map.get(userId);
  if (!weeks) return new Set();
  return new Set(weekStarts.map((ws) => ws.getTime()).filter((ms) => weeks.has(ms)));
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
  const exemptWeeks = (await loadExemptWeeks([userId], windowStart, thisWeekStart)).get(userId);

  const pcts: number[] = [];
  for (const ws of weekStartsInRange(windowStart, thisWeekStart)) {
    const items = buildScoreItems(activeItems(plans, userId, addDays(ws, 6)), logsInWeek(logs, ws), ws);
    let s = scoreWeek(items);
    if (exemptWeeks?.has(ws.getTime())) s = applyWeekExemption(s); // tournament week keeps the streak
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
  const exempt = (await loadExemptWeeks([userId], weekStart, addWeeks(weekStart, 1)))
    .get(userId)
    ?.has(weekStart.getTime()) ?? false;
  const items = buildScoreItems(activeItems(plans, userId, addDays(weekStart, 6)), logs, weekStart);
  let score = scoreWeek(items);
  if (exempt) score = applyWeekExemption(score);
  return {
    ADHERENCE_POINTS: score.points,
    RUGBY_PRACTICES: rugbyPracticesAttended(logs),
    PRIMARY_PRACTICES: logs.filter((l) => l.status === "DONE" && l.tier === "PRIMARY").length,
    TOURNAMENT_DAYS: tournamentDays(logs),
    OTHER_SESSIONS: otherSessions(logs),
    STREAK: await getStreak(userId),
  };
}

export type ScoredWeek = {
  weekStart: Date;
  score: WeekScore;
  exempt: boolean;
  items: WeekPlanItem[];
};

/**
 * Every week overlapping [start, end) scored for each user, exactly as the WEEKLY adherence
 * leaderboard does it: logs are counted only inside [start, end), the plan active at each
 * week's Sunday applies, weekly goals only, and tournament-exempt weeks count as fully
 * adherent. Month/year boards use the calendar-month view instead (scoreMonthsForUsers).
 * Shared by getLeaderboard and the read-only goals API so both always agree.
 */
export async function scoreWeeksForUsers(
  userIds: string[],
  start: Date,
  end: Date,
): Promise<Map<string, ScoredWeek[]>> {
  const out = new Map<string, ScoredWeek[]>();
  if (userIds.length === 0) return out;
  const plans = await loadPlans(userIds);
  const logsByUser = await loadLogs(userIds, start, end);
  const exemptByUser = await loadExemptWeeks(userIds, start, end);
  const weeks = weekStartsInRange(start, end);
  for (const id of userIds) {
    const logs = logsByUser.get(id) ?? [];
    const exemptWeeks = exemptByUser.get(id);
    out.set(
      id,
      weeks.map((ws) => {
        const items = buildScoreItems(activeItems(plans, id, addDays(ws, 6)), logsInWeek(logs, ws), ws);
        const exempt = exemptWeeks?.has(ws.getTime()) ?? false;
        let score = scoreWeek(items);
        if (exempt) score = applyWeekExemption(score);
        return { weekStart: ws, score, exempt, items };
      }),
    );
  }
  return out;
}

/**
 * Rugby practices attended (DONE rugby sessions + one per tournament day) and DONE
 * primary-tier practices per user in [start, end) — the
 * RUGBY_PRACTICES / PRIMARY_PRACTICES leaderboard values — plus tournament days, DONE
 * sessions besides rugby/tournaments (TOURNAMENT_DAYS / OTHER_SESSIONS) and all DONE sessions.
 */
export type PracticeCounts = {
  rugby: number;
  primary: number;
  tournamentDays: number;
  otherSessions: number;
  sessions: number;
};

export async function countPracticesForUsers(
  userIds: string[],
  start: Date,
  end: Date,
): Promise<Map<string, PracticeCounts>> {
  const logsByUser = await loadLogs(userIds, start, end);
  const out = new Map<string, PracticeCounts>();
  for (const id of userIds) {
    const logs = logsByUser.get(id) ?? [];
    out.set(id, {
      rugby: rugbyPracticesAttended(logs),
      primary: logs.filter((l) => l.status === "DONE" && l.tier === "PRIMARY").length,
      tournamentDays: tournamentDays(logs),
      otherSessions: otherSessions(logs),
      sessions: logs.filter((l) => l.status === "DONE").length,
    });
  }
  return out;
}

// ---- Month view (month-scoring.ts has the rules) ----

export type MonthGoalRow = {
  category: Category;
  /** The custom activity name for OTHER goals, else null. */
  label: string | null;
  cadence: PlanCadence;
  /** The goal as planned: per week, or per month. */
  planned: number;
  /** Target for this calendar month (weekly goals: × days / 7, rounded down). */
  target: number;
  /** DONE sessions dated in the month. */
  done: number;
};

export type ScoredMonth = {
  monthStart: Date;
  goals: MonthGoalRow[];
  score: MonthScore;
};

/** Same matching as the weekly count goals: rugby counts every DONE rugby session. */
function countGoalDone(logs: LogRow[], category: string): number {
  return logs.filter(
    (l) => l.status === "DONE" && l.category === category && (category === "RUGBY" || !l.practiceSlotId),
  ).length;
}

function scoreOneMonth(
  plans: PlanWithItems[],
  userId: string,
  logs: LogRow[],
  exemptWeeks: Set<number> | undefined,
  ms: Date,
  window: { start: Date; end: Date },
): ScoredMonth {
  const monthEnd = nextMonth(ms);
  // A season can start/end mid-month: only the part of the month inside the range counts.
  const from0 = window.start > ms ? window.start : ms;
  const me = window.end < monthEnd ? window.end : monthEnd;
  const daysOf = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / 86_400_000);
  const partDays = daysOf(from0, me);
  const monthDays = daysOf(ms, monthEnd);
  const monthLogs = logs.filter((l) => l.date >= from0 && l.date < me);
  type Acc = { category: string; label: string | null; cadence: PlanCadence; planned: number; shares: WeeklyShare[]; target: number };
  const goals = new Map<string, Acc>();
  const keyOf = (category: string, note: string | null) =>
    `${category}|${category === "OTHER" ? (note ?? "").trim() : ""}`;

  // Weekly goals: each week overlapping the month contributes target × its days in the month
  // (exempt weeks contribute nothing), using the plan of that week (active at its Sunday).
  for (const ws of weekStartsInRange(from0, me)) {
    if (exemptWeeks?.has(ws.getTime())) continue;
    const we = addWeeks(ws, 1);
    const from = ws < from0 ? from0 : ws;
    const to = we > me ? me : we;
    const days = Math.round((to.getTime() - from.getTime()) / 86_400_000);
    for (const it of activeItems(plans, userId, addDays(ws, 6))) {
      if (it.cadence === "MONTH" || it.practiceSlotId || it.target <= 0) continue;
      const k = keyOf(it.category, it.note);
      const acc = goals.get(k) ?? {
        category: it.category,
        label: it.category === "OTHER" ? it.note : null,
        cadence: "WEEK" as PlanCadence,
        planned: it.target,
        shares: [],
        target: 0,
      };
      acc.planned = it.target; // latest weekly target wins for display
      acc.shares.push({ target: it.target, days });
      goals.set(k, acc);
    }
  }
  // Monthly goals: the plan active on the month's last (counted) day, target as entered —
  // scaled down (rounded down) when only part of the month is in the range.
  for (const it of activeItems(plans, userId, addDays(me, -1))) {
    if (it.cadence !== "MONTH" || it.target <= 0) continue;
    const k = keyOf(it.category, it.note);
    goals.set(k, {
      category: it.category,
      label: it.category === "OTHER" ? it.note : null,
      cadence: "MONTH",
      planned: it.target,
      shares: [],
      target: it.target,
    });
  }

  const rows: MonthGoalRow[] = [...goals.values()]
    .map((g) => ({
      category: g.category as Category,
      label: g.label,
      cadence: g.cadence,
      planned: g.planned,
      target:
        g.cadence === "MONTH"
          ? monthTargetForPart(g.target, partDays, monthDays)
          : monthTargetFromWeekly(g.shares),
      done: countGoalDone(monthLogs, g.category),
    }))
    .filter((g) => g.target > 0);
  return { monthStart: ms, goals: rows, score: scoreMonthGoals(rows) };
}

/**
 * The month view for each user: every calendar month overlapping [start, end) — one for the
 * month leaderboard, all the season's months for the season board (edge months clipped to
 * the range). Shared by getLeaderboard, the dashboard and the
 * read-only goals API so all three always show the same numbers.
 */
export async function scoreMonthsForUsers(
  userIds: string[],
  start: Date,
  end: Date,
  now: Date = new Date(),
): Promise<Map<string, ScoredMonth[]>> {
  const out = new Map<string, ScoredMonth[]>();
  if (userIds.length === 0) return out;
  // Months that haven't started carry no data; leaving them out keeps a season's % honest.
  const months = monthStartsInRange(start, end).filter((ms) => ms <= now);
  if (months.length === 0) return out;
  const from = months[0];
  const to = nextMonth(months[months.length - 1]);
  const plans = await loadPlans(userIds);
  const logsByUser = await loadLogs(userIds, from, to);
  const exemptByUser = await loadExemptWeeks(userIds, startOfWeek(from), addWeeks(startOfWeek(to), 1));
  for (const id of userIds) {
    const logs = logsByUser.get(id) ?? [];
    out.set(
      id,
      months.map((ms) => scoreOneMonth(plans, id, logs, exemptByUser.get(id), ms, { start, end })),
    );
  }
  return out;
}

/** This calendar month for one player (dashboard month card). */
export async function getCurrentMonth(userId: string): Promise<ScoredMonth> {
  const { start, end } = periodRange("month");
  return (await scoreMonthsForUsers([userId], start, end)).get(userId)![0];
}

export type LeaderRow = {
  userId: string;
  name: string;
  value: number;
  /** Month/season adherence board only: sessions reached / planned in the month view. */
  reached?: number;
  target?: number;
};

/** Compute a leaderboard for a metric over a period, sorted descending. */
export async function getLeaderboard(
  metric: LeaderboardMetric,
  period: LeaderboardPeriod,
  teamId: string | null,
): Promise<LeaderRow[]> {
  if (!teamId) return [];
  const { start, end } = period === "season" ? await getSeason() : periodRange(period);
  const users = await prisma.user.findMany({
    where: { memberships: { some: { teamId } } },
    select: { id: true, name: true },
  });
  const userIds = users.map((u) => u.id);
  if (userIds.length === 0) return [];

  const values = new Map<string, number>();
  const extra = new Map<string, { reached: number; target: number }>();

  if (
    metric === "RUGBY_PRACTICES" ||
    metric === "PRIMARY_PRACTICES" ||
    metric === "TOURNAMENT_DAYS" ||
    metric === "OTHER_SESSIONS"
  ) {
    const counts = await countPracticesForUsers(userIds, start, end);
    const field = {
      RUGBY_PRACTICES: "rugby",
      PRIMARY_PRACTICES: "primary",
      TOURNAMENT_DAYS: "tournamentDays",
      OTHER_SESSIONS: "otherSessions",
    } as const;
    for (const u of users) {
      values.set(u.id, counts.get(u.id)?.[field[metric]] ?? 0);
    }
  } else if (metric === "ADHERENCE_POINTS" && period !== "week") {
    // Month/year: the calendar-month view, 100 points per fully kept month (month-scoring.ts).
    const monthsByUser = await scoreMonthsForUsers(userIds, start, end);
    for (const u of users) {
      const c = combineMonths((monthsByUser.get(u.id) ?? []).map((m) => m.score));
      values.set(u.id, c.points);
      extra.set(u.id, { reached: c.reached, target: c.target });
    }
  } else if (metric === "ADHERENCE_POINTS") {
    const weeksByUser = await scoreWeeksForUsers(userIds, start, end);
    for (const u of users) {
      values.set(u.id, (weeksByUser.get(u.id) ?? []).reduce((sum, w) => sum + w.score.points, 0));
    }
  } else {
    // STREAK — current streak, independent of the selected period.
    for (const u of users) {
      values.set(u.id, await getStreak(u.id));
    }
  }

  return users
    .map((u) => ({ userId: u.id, name: u.name, value: values.get(u.id) ?? 0, ...extra.get(u.id) }))
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
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
  const exemptByUser = await loadExemptWeeks(userIds, weekStart, addWeeks(weekStart, 1));
  const ref = addDays(weekStart, 6);

  return users.map((u) => {
    const items = buildScoreItems(activeItems(plans, u.id, ref), logsByUser.get(u.id) ?? [], weekStart);
    let s = scoreWeek(items);
    if (exemptByUser.get(u.id)?.has(weekStart.getTime())) s = applyWeekExemption(s);
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
