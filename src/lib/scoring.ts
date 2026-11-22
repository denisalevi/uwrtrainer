import type { Category, PracticeTier } from "@/lib/constants";

/**
 * Scoring philosophy (per coach Nando): reward *adherence to your agreed plan*
 * more than raw volume. A player who commits to little and keeps it should score
 * similarly to a player who commits to lots and keeps it. So full adherence is
 * worth a fixed BASE regardless of plan size; doing more than planned earns nothing
 * extra (no bonus points — the score is plain adherence, 0–100). Missing a mandatory practice hurts more than an optional one,
 * but committing only to the mandatory practice can still reach 100%.
 *
 * All numbers live here so the team can tune them.
 */
export type ScoringConfig = {
  basePoints: number;
  tierWeights: Record<PracticeTier, number>;
  categoryWeight: number;
  fullAdherenceThreshold: number; // counts as a "full" week for streaks
};

export const DEFAULT_SCORING: ScoringConfig = {
  basePoints: 100,
  tierWeights: { PRIMARY: 1.5, SECONDARY: 1, OPTIONAL: 0.75 },
  categoryWeight: 1,
  fullAdherenceThreshold: 0.999,
};

export type ScoreItem = {
  category: Category;
  /** Practice tier when the item is a committed team practice (rugby). */
  tier?: PracticeTier | null;
  /** Sessions committed to per week. */
  target: number;
  /** Sessions actually completed (status DONE) this week. */
  done: number;
};

export type WeekScore = {
  adherencePct: number; // 0..1
  basePoints: number;
  points: number;
  hasPlan: boolean;
};

function itemWeight(item: ScoreItem, config: ScoringConfig): number {
  if (item.tier) return config.tierWeights[item.tier];
  return config.categoryWeight;
}

/** Score one week from a player's plan items + their completed counts. */
export function scoreWeek(
  items: ScoreItem[],
  config: ScoringConfig = DEFAULT_SCORING,
): WeekScore {
  const planned = items.filter((i) => i.target > 0);
  if (planned.length === 0) {
    return { adherencePct: 0, basePoints: 0, points: 0, hasPlan: false };
  }

  let weightedTarget = 0;
  let weightedDone = 0;

  for (const item of planned) {
    const w = itemWeight(item, config);
    const counted = Math.min(item.done, item.target);
    weightedTarget += w * item.target;
    weightedDone += w * counted;
  }

  const adherencePct = weightedTarget > 0 ? weightedDone / weightedTarget : 0;
  const basePoints = Math.round(adherencePct * config.basePoints);

  return {
    adherencePct,
    basePoints,
    points: basePoints,
    hasPlan: true,
  };
}

/**
 * A tournament-exempt week (issue #31) counts as fully adherent for the players who played:
 * full base points and a kept streak, so a game weekend never costs ground on the month/year
 * leaderboards. Weeks without a plan stay untouched — there is nothing to exempt.
 */
export function applyWeekExemption(
  score: WeekScore,
  config: ScoringConfig = DEFAULT_SCORING,
): WeekScore {
  if (!score.hasPlan) return score;
  const basePoints = Math.max(score.basePoints, config.basePoints);
  return {
    adherencePct: Math.max(score.adherencePct, 1),
    basePoints,
    points: basePoints,
    hasPlan: true,
  };
}

/**
 * Trailing streak of consecutive "full adherence" weeks.
 * `weeklyPcts` is chronological (oldest first); the last entry is the most
 * recent completed week.
 */
export function fullAdherenceStreak(
  weeklyPcts: number[],
  config: ScoringConfig = DEFAULT_SCORING,
): number {
  let streak = 0;
  for (let i = weeklyPcts.length - 1; i >= 0; i--) {
    if (weeklyPcts[i] >= config.fullAdherenceThreshold) streak++;
    else break;
  }
  return streak;
}
