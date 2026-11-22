// Pure scoring for the MONTH view (month/year leaderboards, the dashboard's month card, the
// goals API) — unit-tested in month-scoring.test.ts. Rules agreed with Denis (2026-11-22):
//
//  - The month view has no weeks, only the calendar month.
//  - A weekly goal becomes a monthly target: weekly target × days / 7, ROUNDED DOWN (the
//    goodwill): 2 per week in November = 2 × 30 / 7 = 8.57 → 8. Days of tournament-exempt
//    weeks don't count, and if the plan changed mid-month each week's share uses the plan of
//    that week (the same plan the weekly score uses).
//  - A monthly goal keeps its target as entered.
//  - Done = DONE sessions dated in the calendar month.
//  - Month % = reached / target over all goals, each goal capped at its target (overshoot on
//    one goal can't cover a gap on another). Month points = round(% × 100) plus the usual small
//    overshoot bonus (2 per extra session, max 10), so a fully kept month is worth 100.
//  - The weekly leaderboard and the streak stay strictly weekly and ignore monthly goals.
import { DEFAULT_SCORING, type ScoringConfig } from "@/lib/scoring";

/** One week's share of a weekly goal: its weekly target and how many of its days are counted. */
export type WeeklyShare = { target: number; days: number };

/** Monthly target of a weekly goal: Σ target × days / 7, rounded down. */
export function monthTargetFromWeekly(shares: WeeklyShare[]): number {
  const raw = shares.reduce((s, x) => s + (x.target * x.days) / 7, 0);
  return Math.floor(raw + 1e-9);
}

export type MonthGoal = { target: number; done: number };

export type MonthScore = {
  /** 0..1, each goal's done capped at its target; 0 without goals. */
  adherencePct: number;
  /** Σ targets ("8" in "7 of 8"). */
  target: number;
  /** Σ done capped per goal ("7" in "7 of 8"). */
  reached: number;
  overshootBonus: number;
  points: number;
  hasPlan: boolean;
};

export function scoreMonthGoals(
  goals: MonthGoal[],
  config: ScoringConfig = DEFAULT_SCORING,
): MonthScore {
  const planned = goals.filter((g) => g.target > 0);
  const target = planned.reduce((s, g) => s + g.target, 0);
  if (target === 0) {
    return { adherencePct: 0, target: 0, reached: 0, overshootBonus: 0, points: 0, hasPlan: false };
  }
  const reached = planned.reduce((s, g) => s + Math.min(g.done, g.target), 0);
  const overshoot = planned.reduce((s, g) => s + Math.max(0, g.done - g.target), 0);
  const adherencePct = reached / target;
  const overshootBonus = Math.min(
    overshoot * config.overshootBonusPerSession,
    config.overshootBonusCap,
  );
  return {
    adherencePct,
    target,
    reached,
    overshootBonus,
    points: Math.round(adherencePct * config.basePoints) + overshootBonus,
    hasPlan: true,
  };
}

/**
 * Several months (a year): points add up; the % is Σ reached / Σ target, so a busy month
 * weighs more than a light one — the same "every planned session counts" idea.
 */
export function combineMonths(months: MonthScore[]): {
  adherencePct: number | null;
  target: number;
  reached: number;
  points: number;
} {
  const target = months.reduce((s, m) => s + m.target, 0);
  const reached = months.reduce((s, m) => s + m.reached, 0);
  return {
    adherencePct: target > 0 ? reached / target : null,
    target,
    reached,
    points: months.reduce((s, m) => s + m.points, 0),
  };
}
