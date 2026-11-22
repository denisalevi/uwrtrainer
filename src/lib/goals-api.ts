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
  /** Only for tokens with "allow reasons": the member's own words for this week. */
  reasons?: GoalsApiWeekReasons;
};

export type GoalsApiWeekReasons = {
  /** The weekly "why didn't it work out" note, if the member wrote one. */
  note: string | null;
  /** Missed sessions that carry a reason. */
  missed: Array<{ date: string; category: string; practice: string | null; reason: string }>;
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
  /** DONE rugby practices in the period (the "Rugby practices attended" leaderboard). */
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
  /** Present only for opted-in tokens; keyed by weekStart ms. */
  reasons?: Map<number, GoalsApiWeekReasons>,
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
        practice: it.label,
        tier: it.tier ?? null,
        target: it.target,
        done: it.done,
      })),
    ...(reasons ? { reasons: reasons.get(w.weekStart.getTime()) ?? { note: null, missed: [] } } : {}),
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

/** Leaderboard order: points desc, then name. */
export function sortGoalsMembers(members: GoalsApiMember[]): GoalsApiMember[] {
  return [...members].sort((a, b) => b.points - a.points || a.member.localeCompare(b.member));
}

// ---- Leaderboards, as the app's Ranglisten page shows them ----

export const LEADERBOARD_FIELDS = {
  ADHERENCE_POINTS: "points",
  RUGBY_PRACTICES: "rugbyPractices",
  PRIMARY_PRACTICES: "primaryPractices",
  STREAK: "streak",
} as const satisfies Record<string, keyof GoalsApiMember>;

export type GoalsLeaderboardRow = { rank: number; member: string; value: number };

/**
 * One ranked list per metric, like the leaderboard page: value > 0 only, sorted desc then
 * by name, competition ranks (ties share a rank).
 */
export function buildLeaderboards(
  members: GoalsApiMember[],
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
