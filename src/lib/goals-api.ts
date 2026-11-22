// Pure helpers for GET /api/v1/goals: period resolution and the per-member payload.
// Like the feed API, only what teammates already see in the app (plans, adherence, streaks on
// the team pages and leaderboards) — no ids, emails, plan notes, trainer notes or miss reasons.
// Unit-tested in goals-api.test.ts.
import { addDays, periodRange, startOfWeek } from "@/lib/dates";
import { localDayKey, parseFeedRange } from "@/lib/api-tokens";
import { DEFAULT_SCORING } from "@/lib/scoring";
import { competitionRanks } from "@/lib/rank";

export const GOALS_PERIODS = ["week", "month", "year"] as const;
export type GoalsPeriod = (typeof GOALS_PERIODS)[number];

export type GoalsRange = {
  /** "week" | "month" | "year", or "custom" for since/until. */
  period: GoalsPeriod | "custom";
  /** Inclusive local-midnight start, exclusive end — the same [start, end) the leaderboard uses. */
  start: Date;
  end: Date;
  since: string;
  until: string;
};

function parseDay(v: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(y, mo - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return null;
  return date;
}

/**
 * Resolve the query: either `period` (week | month | year, default week) around `date`
 * (YYYY-MM-DD, default today) — exactly the leaderboard's periodRange — or an explicit
 * `since`/`until` window (inclusive days, max 92 like the feed). Mixing both is an error.
 */
export function parseGoalsRange(
  params: { period: string | null; date: string | null; since: string | null; until: string | null },
  now: Date,
): GoalsRange | { error: string } {
  const custom = params.since != null || params.until != null;
  if (custom && (params.period != null || params.date != null)) {
    return { error: "use either period/date or since/until, not both" };
  }
  if (custom) {
    const r = parseFeedRange(params.since, params.until, now);
    if ("error" in r) return r;
    return { period: "custom", ...r };
  }
  const period = (params.period ?? "week") as GoalsPeriod;
  if (!GOALS_PERIODS.includes(period)) return { error: "period must be week, month or year" };
  const ref = params.date != null ? parseDay(params.date) : now;
  if (!ref) return { error: "date must be a date in YYYY-MM-DD format" };
  const { start, end } = periodRange(period, ref);
  return { period, start, end, since: localDayKey(start), until: localDayKey(addDays(end, -1)) };
}

// ---- Payload ----

export type GoalsSourceWeek = {
  weekStart: Date;
  exempt: boolean;
  score: { adherencePct: number; points: number; hasPlan: boolean };
  items: Array<{
    category: string;
    tier?: string | null;
    target: number;
    done: number;
    label: string | null;
  }>;
};

export type GoalsApiGoal = {
  category: string;
  /** Always "WEEK" here: weekly views only hold weekly goals (monthly ones: period=month). */
  cadence: "WEEK";
  /** Committed practice name ("Tuesday pool"), null for a plain per-category goal. */
  practice: string | null;
  /** PRIMARY | SECONDARY | OPTIONAL for committed practices, else null. */
  tier: string | null;
  target: number;
  done: number;
};

export type GoalsApiWeek = {
  /** Monday, yyyy-mm-dd. */
  weekStart: string;
  /** False while the week is still running (it can still improve). */
  complete: boolean;
  hasPlan: boolean;
  /** Tournament week: goals paused, counted as fully achieved. */
  exempt: boolean;
  /** 0–100, rounded; null when there was no plan that week. */
  adherencePct: number | null;
  points: number;
  goals: GoalsApiGoal[];
};

export type GoalsApiMember = {
  member: string;
  /** Sum of weekly points = the in-app "adherence points" leaderboard for this period. */
  points: number;
  /** Mean weekly adherence over weeks with a plan (0–100, rounded); null without any plan. */
  avgAdherencePct: number | null;
  weeksWithPlan: number;
  /** Weeks at 100% (exempt weeks included). */
  fullWeeks: number;
  /** Current streak of completed 100% weeks (independent of the period, as in the app). */
  streak: number;
  /** DONE rugby practices + one per tournament day in the period (the "Rugby practices attended" leaderboard). */
  rugbyPractices: number;
  /** DONE primary-tier practices in the period (the "1st-team league practices" leaderboard). */
  primaryPractices: number;
  /** All DONE sessions in the period, any category, planned or not. */
  totalSessions: number;
  /** Sum of weekly targets over the started weeks (how much was planned)… */
  plannedSessions: number;
  /** …and how much of that was reached (done capped at each target). */
  reachedSessions: number;
  /** Weekly plan vs. done, oldest first. */
  weeks: GoalsApiWeek[];
};

const pct = (v: number) => Math.round(v * 100);

export function toGoalsApiMember(
  name: string,
  weeks: GoalsSourceWeek[],
  extra: { streak: number; rugbyPractices: number; primaryPractices: number; totalSessions: number },
  now: Date,
): GoalsApiMember {
  const thisWeek = startOfWeek(now).getTime();
  // Weeks that haven't started yet carry no data (and 0 points) — leave them out so they
  // don't drag the average down. The running week stays, marked complete: false.
  weeks = weeks.filter((w) => w.weekStart.getTime() <= thisWeek);
  const planned = weeks.filter((w) => w.score.hasPlan);
  const out: GoalsApiWeek[] = weeks.map((w) => ({
    weekStart: localDayKey(w.weekStart),
    complete: w.weekStart.getTime() < thisWeek,
    hasPlan: w.score.hasPlan,
    exempt: w.exempt,
    adherencePct: w.score.hasPlan ? pct(w.score.adherencePct) : null,
    points: w.score.points,
    // Only real goals: out-of-season practices (target 0) aren't expected that week.
    goals: w.items
      .filter((it) => it.target > 0)
      .map((it) => ({
        category: it.category,
        cadence: "WEEK" as const,
        practice: it.label,
        tier: it.tier ?? null,
        target: it.target,
        done: it.done,
      })),
  }));
  const goalItems = weeks.flatMap((w) => w.items.filter((it) => it.target > 0));
  return {
    member: name,
    points: weeks.reduce((s, w) => s + w.score.points, 0),
    avgAdherencePct: planned.length
      ? pct(planned.reduce((s, w) => s + Math.min(w.score.adherencePct, 1), 0) / planned.length)
      : null,
    weeksWithPlan: planned.length,
    fullWeeks: planned.filter((w) => w.score.adherencePct >= DEFAULT_SCORING.fullAdherenceThreshold).length,
    streak: extra.streak,
    rugbyPractices: extra.rugbyPractices,
    primaryPractices: extra.primaryPractices,
    totalSessions: extra.totalSessions,
    plannedSessions: goalItems.reduce((sum, it) => sum + it.target, 0),
    reachedSessions: goalItems.reduce((sum, it) => sum + Math.min(it.done, it.target), 0),
    weeks: out,
  };
}

// ---- Month view (period=month|year): calendar months, no weeks (month-scoring.ts) ----

export type GoalsSourceMonth = {
  monthStart: Date;
  goals: Array<{
    category: string;
    label: string | null;
    cadence: "WEEK" | "MONTH";
    planned: number;
    target: number;
    done: number;
  }>;
  score: { adherencePct: number; target: number; reached: number; points: number; hasPlan: boolean };
};

export type GoalsApiMonthGoal = {
  category: string;
  /** Custom activity name for OTHER goals, else null. */
  label: string | null;
  /** "WEEK" = a weekly goal converted to the month, "MONTH" = a monthly goal. */
  cadence: "WEEK" | "MONTH";
  /** As planned: sessions per week (WEEK) or per month (MONTH). */
  planned: number;
  /** Target for this month (weekly goals: planned × days / 7, rounded down). */
  target: number;
  /** DONE sessions dated in the month. */
  done: number;
  /** done >= target. */
  reached: boolean;
};

export type GoalsApiMonth = {
  /** yyyy-mm */
  month: string;
  /** False while the month is still running. */
  complete: boolean;
  hasPlan: boolean;
  /** The month %: reached / target over all goals, each capped at its target. 0–100, null without plan. */
  adherencePct: number | null;
  /** Σ targets and Σ done capped per goal ("7 of 8"). */
  target: number;
  reached: number;
  /** = the month % (100 for a fully kept month, no bonus). */
  points: number;
  goals: GoalsApiMonthGoal[];
};

export type GoalsApiMonthMember = {
  member: string;
  /** The in-app month/year "adherence points" leaderboard value (sum of month points). */
  points: number;
  /** Final % for the period: reachedSessions / plannedSessions, 0–100; null without plan. */
  adherencePct: number | null;
  /** Σ month targets over the period… */
  plannedSessions: number;
  /** …and Σ done capped per goal. */
  reachedSessions: number;
  totalSessions: number;
  rugbyPractices: number;
  primaryPractices: number;
  streak: number;
  /** Calendar months, oldest first (months not started yet are left out). */
  months: GoalsApiMonth[];
};

export function toGoalsApiMonthMember(
  name: string,
  months: GoalsSourceMonth[],
  extra: { streak: number; rugbyPractices: number; primaryPractices: number; totalSessions: number },
  now: Date,
): GoalsApiMonthMember {
  const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  months = months.filter((m) => m.monthStart.getTime() <= thisMonth);
  const planned = months.reduce((s, m) => s + m.score.target, 0);
  const reached = months.reduce((s, m) => s + m.score.reached, 0);
  return {
    member: name,
    points: months.reduce((s, m) => s + m.score.points, 0),
    adherencePct: planned > 0 ? pct(reached / planned) : null,
    plannedSessions: planned,
    reachedSessions: reached,
    totalSessions: extra.totalSessions,
    rugbyPractices: extra.rugbyPractices,
    primaryPractices: extra.primaryPractices,
    streak: extra.streak,
    months: months.map((m) => ({
      month: localDayKey(m.monthStart).slice(0, 7),
      complete: m.monthStart.getTime() < thisMonth,
      hasPlan: m.score.hasPlan,
      adherencePct: m.score.hasPlan ? pct(m.score.adherencePct) : null,
      target: m.score.target,
      reached: m.score.reached,
      points: m.score.points,
      goals: m.goals.map((g) => ({
        category: g.category,
        label: g.label,
        cadence: g.cadence,
        planned: g.planned,
        target: g.target,
        done: g.done,
        reached: g.done >= g.target,
      })),
    })),
  };
}

/** Leaderboard order: points desc, then name. */
export function sortGoalsMembers<M extends { points: number; member: string }>(members: M[]): M[] {
  return [...members].sort((a, b) => b.points - a.points || a.member.localeCompare(b.member));
}

// ---- Leaderboards, as the app's Ranglisten page shows them ----

export const LEADERBOARD_FIELDS = {
  ADHERENCE_POINTS: "points",
  RUGBY_PRACTICES: "rugbyPractices",
  PRIMARY_PRACTICES: "primaryPractices",
  STREAK: "streak",
} as const satisfies Record<string, keyof GoalsApiMember & keyof GoalsApiMonthMember>;

type LeaderboardSource = Pick<GoalsApiMember, "member" | (typeof LEADERBOARD_FIELDS)[keyof typeof LEADERBOARD_FIELDS]>;

export type GoalsLeaderboardRow = { rank: number; member: string; value: number };

/**
 * One ranked list per metric, like the leaderboard page: value > 0 only, sorted desc then
 * by name, competition ranks (ties share a rank).
 */
export function buildLeaderboards(
  members: LeaderboardSource[],
): Record<keyof typeof LEADERBOARD_FIELDS, GoalsLeaderboardRow[]> {
  const out = {} as Record<keyof typeof LEADERBOARD_FIELDS, GoalsLeaderboardRow[]>;
  for (const [metric, field] of Object.entries(LEADERBOARD_FIELDS) as Array<
    [keyof typeof LEADERBOARD_FIELDS, (typeof LEADERBOARD_FIELDS)[keyof typeof LEADERBOARD_FIELDS]]
  >) {
    const rows = members
      .map((m) => ({ member: m.member, value: m[field] }))
      .filter((r) => r.value > 0)
      .sort((a, b) => b.value - a.value || a.member.localeCompare(b.member));
    const ranks = competitionRanks(rows.map((r) => r.value));
    out[metric] = rows.map((r, i) => ({ rank: ranks[i], ...r }));
  }
  return out;
}
