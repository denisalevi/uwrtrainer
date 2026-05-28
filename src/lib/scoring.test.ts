import { describe, it, expect } from "vitest";
import {
  scoreWeek,
  fullAdherenceStreak,
  DEFAULT_SCORING,
  type ScoreItem,
} from "./scoring";

describe("scoreWeek", () => {
  it("gives no points and hasPlan=false when there is no plan", () => {
    const r = scoreWeek([]);
    expect(r.hasPlan).toBe(false);
    expect(r.points).toBe(0);
  });

  it("Linus (small plan, 100%) ≈ Denis (big plan, 100%) — the core requirement", () => {
    // Linus: 1 run, 1 lift, 1 rugby per week, all done.
    const linus: ScoreItem[] = [
      { category: "CARDIO", target: 1, done: 1 },
      { category: "STRENGTH", target: 1, done: 1 },
      { category: "RUGBY", tier: "PRIMARY", target: 1, done: 1 },
    ];
    // Denis: lots of sessions, all done to target.
    const denis: ScoreItem[] = [
      { category: "CARDIO", target: 5, done: 5 },
      { category: "STRENGTH", target: 4, done: 4 },
      { category: "RUGBY", tier: "PRIMARY", target: 1, done: 1 },
      { category: "RUGBY", tier: "SECONDARY", target: 1, done: 1 },
      { category: "MOBILITY", target: 3, done: 3 },
    ];

    const l = scoreWeek(linus);
    const d = scoreWeek(denis);

    expect(l.adherencePct).toBeCloseTo(1);
    expect(d.adherencePct).toBeCloseTo(1);
    // Base points identical at 100% adherence regardless of plan size.
    expect(l.basePoints).toBe(d.basePoints);
    expect(l.basePoints).toBe(DEFAULT_SCORING.basePoints);
  });

  it("partial adherence scales (roughly) linearly", () => {
    const half: ScoreItem[] = [
      { category: "CARDIO", target: 2, done: 1 },
      { category: "STRENGTH", target: 2, done: 1 },
    ];
    const r = scoreWeek(half);
    expect(r.adherencePct).toBeCloseTo(0.5);
    expect(r.basePoints).toBe(50);
  });

  it("missing a mandatory practice hurts more than missing an optional one", () => {
    const missMandatory: ScoreItem[] = [
      { category: "RUGBY", tier: "PRIMARY", target: 1, done: 0 },
      { category: "RUGBY", tier: "OPTIONAL", target: 1, done: 1 },
    ];
    const missOptional: ScoreItem[] = [
      { category: "RUGBY", tier: "PRIMARY", target: 1, done: 1 },
      { category: "RUGBY", tier: "OPTIONAL", target: 1, done: 0 },
    ];
    expect(scoreWeek(missMandatory).adherencePct).toBeLessThan(
      scoreWeek(missOptional).adherencePct,
    );
  });

  it("committing only to the mandatory practice can still reach 100%", () => {
    const onlyMandatory: ScoreItem[] = [
      { category: "RUGBY", tier: "PRIMARY", target: 1, done: 1 },
    ];
    expect(scoreWeek(onlyMandatory).adherencePct).toBeCloseTo(1);
    expect(scoreWeek(onlyMandatory).basePoints).toBe(100);
  });

  it("overshoot earns a small capped bonus that cannot dominate adherence", () => {
    const overshoot: ScoreItem[] = [{ category: "CARDIO", target: 1, done: 100 }];
    const r = scoreWeek(overshoot);
    expect(r.adherencePct).toBeCloseTo(1);
    expect(r.overshootBonus).toBe(DEFAULT_SCORING.overshootBonusCap);
    expect(r.points).toBe(100 + DEFAULT_SCORING.overshootBonusCap);
  });
});

describe("fullAdherenceStreak", () => {
  it("counts trailing full weeks only", () => {
    expect(fullAdherenceStreak([1, 0.5, 1, 1])).toBe(2);
    expect(fullAdherenceStreak([0.5, 0.5])).toBe(0);
    expect(fullAdherenceStreak([1, 1, 1])).toBe(3);
    expect(fullAdherenceStreak([])).toBe(0);
  });
});
