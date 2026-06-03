import { describe, it, expect } from "vitest";
import {
  estimateOneRepMax,
  roundToIncrement,
  trainingMaxFromOneRepMax,
  waveWeek,
  weightedWorkout,
  bodyweightWorkout,
  levelLabel,
  decideAdjustment,
  nextTrainingMax,
  nextBodyweight,
  modeForEquipment,
  pickTemplate,
} from "./strength";

describe("estimateOneRepMax (Brzycki, matches source spreadsheet)", () => {
  it("returns the weight itself for a single rep", () => {
    expect(estimateOneRepMax(100, 1)).toBeCloseTo(100, 1);
  });
  it("estimates higher than the working weight for multi-rep sets", () => {
    // 80 kg × 5 ≈ 90 kg 1RM
    expect(estimateOneRepMax(80, 5)).toBeCloseTo(90, 0);
  });
  it("clamps absurd rep counts instead of dividing by ~0", () => {
    expect(Number.isFinite(estimateOneRepMax(50, 99))).toBe(true);
    expect(estimateOneRepMax(50, 99)).toBeGreaterThan(0);
  });
  it("is zero for no weight", () => {
    expect(estimateOneRepMax(0, 5)).toBe(0);
  });
});

describe("rounding & training max", () => {
  it("rounds to the loadable increment", () => {
    expect(roundToIncrement(64.0, 2.5)).toBe(65);
    expect(roundToIncrement(61.2, 2.5)).toBe(60);
  });
  it("training max is a rounded 90% of the 1RM by default", () => {
    expect(trainingMaxFromOneRepMax(100)).toBe(90);
    expect(trainingMaxFromOneRepMax(102, 0.9, 2.5)).toBe(92.5); // 91.8 → 92.5
  });
});

describe("the 4-week wave", () => {
  it("week 3 is the heavy test week, week 4 is the deload", () => {
    expect(waveWeek(3).scheme).toBe("5/3/1+");
    expect(waveWeek(4).deload).toBe(true);
    expect(waveWeek(1).deload).toBe(false);
  });
  it("cycles every 4 weeks (week 5 == week 1)", () => {
    expect(waveWeek(5).scheme).toBe(waveWeek(1).scheme);
  });
  it("only the last build-week set is AMRAP", () => {
    const sets = waveWeek(1).sets;
    expect(sets.filter((s) => s.amrap)).toHaveLength(1);
    expect(sets[sets.length - 1].amrap).toBe(true);
  });
});

describe("weightedWorkout", () => {
  it("week 1 top set is 85% of the training max, rounded", () => {
    const w = weightedWorkout(90, 1, { movementLabel: "Squat" });
    // 90 * .65/.75/.85 = 58.5 / 67.5 / 76.5 → 57.5 / 67.5 / 77.5 (nearest 2.5)
    expect(w.sets.map((s) => s.weight)).toEqual([57.5, 67.5, 77.5]);
    expect(w.sets[2].amrap).toBe(true);
  });
  it("adds Boring But Big assistance only when asked", () => {
    const plain = weightedWorkout(90, 1, { movementLabel: "Squat" });
    const big = weightedWorkout(90, 1, { movementLabel: "Squat", withAssistance: true });
    expect(plain.assistance).toBeUndefined();
    expect(big.assistance).toEqual({ sets: 5, reps: 10, weight: 45 }); // 50% of 90
  });
});

describe("bodyweightWorkout", () => {
  it("scales reps off the rep max, with an AMRAP last set", () => {
    const w = bodyweightWorkout(10, 1, { movementLabel: "Full push-up" });
    // 10 * .65/.75/.85 → 7 / 8 / 9 (rounded), last is AMRAP
    expect(w.sets.map((s) => s.reps)).toEqual([7, 8, 9]);
    expect(w.sets[2].amrap).toBe(true);
    expect(w.sets[0].weight).toBeUndefined();
  });
  it("never prescribes fewer than 1 rep", () => {
    const w = bodyweightWorkout(1, 1, { movementLabel: "Pull-up" });
    expect(Math.min(...w.sets.map((s) => s.reps))).toBeGreaterThanOrEqual(1);
  });
});

describe("levelLabel", () => {
  it("resolves a movement variation and clamps out-of-range indices", () => {
    expect(levelLabel("PUSH", 0)).toBe("Wall push-up");
    expect(levelLabel("PUSH", 999)).toBe("One-arm push-up progression");
  });
});

describe("decideAdjustment (the no-blame adjustment rule)", () => {
  it("increases when you hit or beat the prescribed reps", () => {
    expect(decideAdjustment(5, 1)).toBe("INCREASE");
  });
  it("holds the first time you fall short", () => {
    expect(decideAdjustment(0, 1, 0)).toBe("HOLD");
  });
  it("reduces after a second short cycle in a row", () => {
    expect(decideAdjustment(0, 1, 1)).toBe("REDUCE");
  });
});

describe("nextTrainingMax", () => {
  it("INCREASE adds the increment", () => {
    expect(nextTrainingMax(90, "INCREASE", { increment: 5 })).toBe(95);
  });
  it("HOLD keeps the weight", () => {
    expect(nextTrainingMax(90, "HOLD")).toBe(90);
  });
  it("REDUCE eases back ~10%, rounded", () => {
    expect(nextTrainingMax(100, "REDUCE", { increment: 2.5 })).toBe(90);
  });
});

describe("nextBodyweight", () => {
  it("INCREASE adds a rep while reps stay modest", () => {
    expect(nextBodyweight({ repMax: 8, levelIndex: 1 }, "INCREASE", { levelCount: 6 })).toEqual({
      repMax: 9,
      levelIndex: 1,
    });
  });
  it("graduates to the next harder variation once reps get high", () => {
    expect(
      nextBodyweight({ repMax: 14, levelIndex: 1 }, "INCREASE", {
        levelCount: 6,
        graduateAt: 15,
        resetReps: 5,
      }),
    ).toEqual({ repMax: 5, levelIndex: 2 });
  });
  it("does not graduate past the hardest variation", () => {
    expect(
      nextBodyweight({ repMax: 20, levelIndex: 5 }, "INCREASE", { levelCount: 6, graduateAt: 15 }),
    ).toEqual({ repMax: 21, levelIndex: 5 });
  });
});

describe("modeForEquipment", () => {
  it("no equipment → bodyweight levels (the zero-equipment path)", () => {
    expect(modeForEquipment("NONE")).toBe("LEVELS");
  });
  it("a pull-up bar → rep-based progression", () => {
    expect(modeForEquipment("PULLUP_BAR")).toBe("REPS");
  });
  it("a barbell or full gym → weighted (classic 5/3/1)", () => {
    expect(modeForEquipment("FULL_GYM")).toBe("WEIGHTED");
    expect(modeForEquipment("BARBELL")).toBe("WEIGHTED");
  });
});

describe("pickTemplate (days × minutes → schedule)", () => {
  it("4 days = one movement per day", () => {
    const t = pickTemplate(4, 60);
    expect(t.key).toBe("FOUR_DAY");
    expect(t.movementsPerSession).toBe(1);
    expect(t.withAssistance).toBe(true);
  });
  it("short sessions drop the assistance volume", () => {
    expect(pickTemplate(4, 30).withAssistance).toBe(false);
  });
  it("2 days packs two movements per session", () => {
    expect(pickTemplate(2, 60).movementsPerSession).toBe(2);
  });
  it("1 day is a minimalist full-body session, main sets only", () => {
    const t = pickTemplate(1, 60);
    expect(t.key).toBe("ONE_DAY");
    expect(t.withAssistance).toBe(false);
  });
});
