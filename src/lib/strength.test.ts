import { describe, it, expect } from "vitest";
import {
  estimateOneRepMax,
  roundToIncrement,
  roundWeight,
  trainingMaxFromOneRepMax,
  waveWeek,
  weightedWorkout,
  warmupSets,
  bbbSet,
  bodyweightWorkout,
  levelLabel,
  decideAdjustment,
  advanceMovementState,
  prescribedTestReps,
  nextTrainingMax,
  nextBodyweight,
  modeForEquipment,
  pickTemplate,
  EXERCISE_CATALOG,
  catalogEntry,
  programSlotMovements,
  defaultExerciseId,
  workoutForSlot,
  suggestedMinutes,
  weightedAssignment,
  pullRiderDays,
  buildSchedule,
  rotationWaveWeek,
  programCycleWeeks,
  normWeek,
  effectiveWeek,
  effectiveCycle,
  advanceAfterSession,
  advanceStateAfterSession,
  inferCycleDecision,
  carryProgression,
  deloadNowState,
  setMovementWeekState,
  daysBetween,
  isStale,
  WAVE,
  type ProgramState,
  type DayPlan,
  type MovementState,
} from "./strength";
import { MOVEMENTS } from "./constants";

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

  it("roundWeight honours the per-user mode and increment", () => {
    expect(roundWeight(61.2, { mode: "DOWN", increment: 2.5 })).toBe(60);
    expect(roundWeight(61.2, { mode: "UP", increment: 2.5 })).toBe(62.5);
    expect(roundWeight(61.2, { mode: "NEAREST", increment: 2.5 })).toBe(60);
    expect(roundWeight(61.3, { mode: "NEAREST", increment: 2.5 })).toBe(62.5);
    expect(roundWeight(61.2, { mode: "DOWN", increment: 5 })).toBe(60);
    // EXACT keeps the exact percentage (trimmed to 0.01 kg against float noise).
    expect(roundWeight(61.23456, { mode: "EXACT", increment: 2.5 })).toBe(61.23);
    // Float noise must not floor/ceil a clean multiple the wrong way.
    expect(roundWeight(0.1 + 0.2, { mode: "DOWN", increment: 0.3 })).toBeCloseTo(0.3, 9);
    expect(roundWeight(62.5, { mode: "DOWN", increment: 2.5 })).toBe(62.5);
    expect(roundWeight(62.5, { mode: "UP", increment: 2.5 })).toBe(62.5);
    // No pref → passthrough (legacy callers).
    expect(roundWeight(61.2)).toBe(61.2);
  });
  it("training max is 90% of the 1RM by default, rounded DOWN to the increment (Wendler)", () => {
    expect(trainingMaxFromOneRepMax(100)).toBe(90);
    expect(trainingMaxFromOneRepMax(102, 0.9, 2.5)).toBe(90); // 91.8 floors to 90, never 92.5
    expect(trainingMaxFromOneRepMax(105, 0.9, 2.5)).toBe(92.5); // 94.5 → 92.5
  });
});

// The onboarding calculator: a user enters a real set (weight × clean reps) and we derive a
// submaximal training max. The whole point is that it never overshoots — typing a tested set must
// never produce a TM at or above what they actually lifted, and never above the estimated 1RM.
describe("onboarding calculator never overshoots", () => {
  const tm = (w: number, r: number) => trainingMaxFromOneRepMax(estimateOneRepMax(w, r), 0.9, 2.5);

  it("a tested 3-rep max of 120 kg yields a TM well below 120 kg (the bug this fixes)", () => {
    // Entering 120 directly as the TM breaks the wave by week 1; the calculator keeps it submaximal.
    expect(tm(120, 3)).toBeLessThan(120);
  });

  it("the derived TM never exceeds the estimated 1RM, across a grid of inputs", () => {
    for (const w of [40, 60, 85, 100, 142.5]) {
      for (const r of [1, 3, 5, 8, 12]) {
        const oneRm = estimateOneRepMax(w, r);
        expect(tm(w, r)).toBeLessThanOrEqual(oneRm);
      }
    }
  });

  it("at a single clean rep the TM is ~90% of the lifted weight (still submaximal)", () => {
    expect(tm(100, 1)).toBe(90);
  });

  it("light dumbbell weights: flooring keeps the TM below the tested single (nearest rounded UP)", () => {
    // The old nearest-rounding bug: 10 kg × 1 → 1RM 10 → 90% = 9 → NEAREST 2.5 gives 10 kg,
    // i.e. a TM at the weight actually lifted. Rounding down keeps the margin.
    for (const w of [5, 7.5, 10, 12.5, 15]) {
      expect(tm(w, 1)).toBeLessThan(w);
    }
    expect(tm(10, 1)).toBe(7.5);
  });

  it("flooring never lifts the TM above the estimated 1RM at light loads either", () => {
    for (const w of [4, 6, 9, 11]) {
      for (const r of [1, 3, 5, 8]) {
        expect(tm(w, r)).toBeLessThanOrEqual(estimateOneRepMax(w, r));
      }
    }
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
  it("carries each set's percentage from the wave (only the last set is AMRAP)", () => {
    const w = weightedWorkout(90, 1, { movementLabel: "Squat" });
    expect(w.sets.map((s) => s.pct)).toEqual([0.65, 0.75, 0.85]);
    expect(w.sets.map((s) => s.amrap)).toEqual([false, false, true]);
  });
  it("deload week (4) has no AMRAP set but still carries percentages", () => {
    const w = weightedWorkout(90, 4, { movementLabel: "Squat" });
    expect(w.sets.map((s) => s.pct)).toEqual([0.4, 0.5, 0.6]);
    expect(w.sets.some((s) => s.amrap)).toBe(false);
  });
  it("adds Boring But Big assistance only when asked", () => {
    const plain = weightedWorkout(90, 1, { movementLabel: "Squat" });
    const big = weightedWorkout(90, 1, { movementLabel: "Squat", withAssistance: true });
    expect(plain.assistance).toBeUndefined();
    expect(big.assistance).toEqual({ sets: 5, reps: 10, weight: 45 }); // 50% of 90
  });
});

describe("warmupSets (configurable ramp before the working sets)", () => {
  const scheme = [
    { pct: 0.4, reps: 5 },
    { pct: 0.5, reps: 5 },
    { pct: 0.6, reps: 3 },
  ];
  it("ramps as a percentage of the training max, rounded, never AMRAP, tagged warmup", () => {
    const sets = warmupSets(100, 2.5, scheme);
    expect(sets.map((s) => s.weight)).toEqual([40, 50, 60]);
    expect(sets.map((s) => s.reps)).toEqual([5, 5, 3]);
    expect(sets.every((s) => s.amrap === false)).toBe(true);
    expect(sets.every((s) => s.kind === "warmup")).toBe(true);
  });
  it("returns an empty ramp when there's no loaded max to ramp against", () => {
    expect(warmupSets(0, 2.5, scheme)).toEqual([]);
  });
});

describe("bbbSet (one Boring But Big set, configurable %/reps)", () => {
  it("defaults to 50% of the training max for 10 reps, tagged bbb", () => {
    const s = bbbSet(90, 2.5);
    expect(s).toMatchObject({ weight: 45, reps: 10, amrap: false, kind: "bbb" });
  });
  it("honours a custom percentage and rep count", () => {
    const s = bbbSet(100, 5, 0.6, 8);
    expect(s.weight).toBe(60);
    expect(s.reps).toBe(8);
  });
});

describe("bodyweightWorkout", () => {
  it("scales reps off the rep max, with an AMRAP last set", () => {
    const w = bodyweightWorkout(10, 1, { movementLabel: "Full push-up" });
    // 10 * .65/.75/.85 → 7 / 8 / 9 (rounded), last is AMRAP
    expect(w.sets.map((s) => s.reps)).toEqual([7, 8, 9]);
    expect(w.sets[2].amrap).toBe(true);
    expect(w.sets[0].weight).toBeUndefined();
    expect(w.sets.map((s) => s.pct)).toEqual([0.65, 0.75, 0.85]);
  });
  it("never prescribes fewer than 1 rep", () => {
    const w = bodyweightWorkout(1, 1, { movementLabel: "Pull-up" });
    expect(Math.min(...w.sets.map((s) => s.reps))).toBeGreaterThanOrEqual(1);
  });
});

describe("levelLabel", () => {
  it("resolves a movement variation (i18n key) and clamps out-of-range indices", () => {
    expect(levelLabel("PUSH", 0)).toBe("ex.push.knee");
    expect(levelLabel("PUSH", 999)).toBe("ex.push.onearm");
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

describe("prescribedTestReps (what the week-3 AMRAP is judged against)", () => {
  it("a weighted lift tests against the wave's fixed top-set rep count (1)", () => {
    expect(prescribedTestReps("WEIGHTED", { trainingMax: 100, repMax: 20 })).toBe(1);
  });
  it("a bodyweight lift tests against ~95% of its CURRENT rep max", () => {
    // Same numbers bodyweightWorkout prescribes for the week-3 top set.
    expect(prescribedTestReps("BODYWEIGHT", { repMax: 10 })).toBe(10); // round(0.95×10)
    expect(prescribedTestReps("BODYWEIGHT", { repMax: 8 })).toBe(8); // round(7.6)
    expect(prescribedTestReps("BODYWEIGHT", { repMax: 5 })).toBe(5); // round(4.75)
  });
  it("bodyweight defaults to the 5-rep base and never prescribes below 1", () => {
    expect(prescribedTestReps("BODYWEIGHT", {})).toBe(5);
    expect(prescribedTestReps("BODYWEIGHT", { repMax: 1 })).toBe(1);
  });
  it("so merely matching the weighted prescription no longer auto-increases a bodyweight lift", () => {
    // The old bug: prescribed was always 1, so ANY bodyweight AMRAP ≥ 1 rep increased.
    const prescribed = prescribedTestReps("BODYWEIGHT", { repMax: 12 });
    expect(decideAdjustment(5, prescribed)).toBe("HOLD"); // 5 reps < round(0.95×12)=11
    expect(decideAdjustment(11, prescribed)).toBe("INCREASE");
  });
});

describe("advanceMovementState (closing out a cycle for one lift)", () => {
  const cur = {
    trainingMax: 90,
    repMax: 8,
    levelIndex: 1,
    estWeight: 85,
    estReps: 5,
    weightedExerciseId: "PUSH_DB",
    bodyweightExerciseId: "PUSH_ARCHER",
    weightedCustom: undefined,
    bodyweightCustom: undefined,
  };

  it("preserves the chosen exercise variants — only the progression fields change", () => {
    const next = advanceMovementState("PUSH", { ...cur, weightedExerciseId: "custom", weightedCustom: "Ring dips" }, 3, 1, { rounding: 2.5 });
    expect(next.weightedExerciseId).toBe("custom");
    expect(next.weightedCustom).toBe("Ring dips");
    expect(next.bodyweightExerciseId).toBe("PUSH_ARCHER");
    expect(next.trainingMax).toBe(92.5); // INCREASE by the upper-body increment
    expect(next.repMax).toBe(9);
  });

  it("drops the first-cycle estimate inputs (they described the pre-adjustment max)", () => {
    const next = advanceMovementState("PUSH", cur, 3, 1, { rounding: 2.5 });
    expect(next.estWeight).toBeUndefined();
    expect(next.estReps).toBeUndefined();
    // …and they don't survive a JSON round-trip either.
    expect(JSON.parse(JSON.stringify(next))).not.toHaveProperty("estWeight");
  });

  it("HOLD keeps every max as-is (first shortfall)", () => {
    const next = advanceMovementState("PUSH", cur, 0, 1, { rounding: 2.5 });
    expect(next.trainingMax).toBe(90);
    expect(next.repMax).toBe(8);
    expect(next.levelIndex).toBe(1);
  });

  it("tracks short cycles per lift: hold → reduce → fresh start, all in the lift's own state", () => {
    const short1 = advanceMovementState("SQUAT", { trainingMax: 100 }, 0, 1, { rounding: 2.5 });
    expect(short1.trainingMax).toBe(100); // first shortfall = HOLD
    expect(short1.holds).toBe(1);
    const short2 = advanceMovementState("SQUAT", short1, 0, 1, { rounding: 2.5 });
    expect(short2.trainingMax).toBe(90); // second in a row = REDUCE ~10%
    expect(short2.holds).toBe(0); // …and the slate is wiped
    const ok = advanceMovementState("SQUAT", short2, 3, 1, { rounding: 2.5 });
    expect(ok.trainingMax).toBe(95); // lower-body increment
    expect(ok.holds).toBe(0);
  });

  it("one lift's holds never affect another lift (rows without the field start at 0)", () => {
    // PUSH is mid-hold; SQUAT (legacy row, no holds field) falls short for the FIRST time.
    const squat = advanceMovementState("SQUAT", { trainingMax: 100 }, 0, 1, { rounding: 2.5 });
    expect(squat.trainingMax).toBe(100); // HOLD, not a 10% reduce
    expect(squat.holds).toBe(1);
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

describe("EXERCISE_CATALOG", () => {
  it("every movement has at least one weighted and one bodyweight option", () => {
    for (const m of MOVEMENTS) {
      const entries = EXERCISE_CATALOG[m];
      expect(entries.some((e) => e.mode === "WEIGHTED")).toBe(true);
      expect(entries.some((e) => e.mode === "BODYWEIGHT")).toBe(true);
    }
  });
  it("entry ids are unique within a movement", () => {
    for (const m of MOVEMENTS) {
      const ids = EXERCISE_CATALOG[m].map((e) => e.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
  it("weighted entries are loadable tools, bodyweight entries are unloaded", () => {
    for (const m of MOVEMENTS) {
      for (const e of EXERCISE_CATALOG[m]) {
        // The weighted pull-up is the one loadable exercise on an "unloaded" tool.
        if (e.mode === "WEIGHTED" && e.id !== "PULLV_WEIGHTED") expect(e.tool).not.toBe("BODYWEIGHT");
        if (e.mode === "BODYWEIGHT") expect(["BODYWEIGHT", "PULLUP_BAR"]).toContain(e.tool);
      }
    }
  });
  it("catalogEntry resolves known ids and rejects unknown", () => {
    expect(catalogEntry("PUSH", "PUSH_BB")?.tool).toBe("BARBELL");
    expect(catalogEntry("PUSH", "nope")).toBeUndefined();
  });
});

describe("defaults & program movements", () => {
  it("includes the pulls only when enabled (vertical first)", () => {
    expect(programSlotMovements({ pullups: true, rows: true })).toEqual([
      "SQUAT", "HINGE", "PUSH", "PRESS", "PULLV", "PULL",
    ]);
    expect(programSlotMovements({ pullups: true, rows: false })).toEqual([
      "SQUAT", "HINGE", "PUSH", "PRESS", "PULLV",
    ]);
    expect(programSlotMovements({ pullups: false, rows: false })).toEqual(["SQUAT", "HINGE", "PUSH", "PRESS"]);
  });
  it("default exercise ids are the barbell lift / first bodyweight rung", () => {
    expect(defaultExerciseId("PUSH", "WEIGHTED")).toBe("PUSH_BB");
    expect(defaultExerciseId("PULLV", "BODYWEIGHT")).toBe("PULL_FULL"); // pull-up
    expect(defaultExerciseId("PULLV", "WEIGHTED")).toBe("PULLV_WEIGHTED");
    expect(defaultExerciseId("PULL", "BODYWEIGHT")).toBe("PULL_INV"); // inverted row
  });
});

describe("weightedAssignment (spreadsheet pairing)", () => {
  it("4 days = one lift each", () => {
    expect(weightedAssignment(4, "ROTATE", 1)).toEqual([["SQUAT"], ["PUSH"], ["HINGE"], ["PRESS"]]);
  });
  it("2 days = squat+bench / deadlift+press", () => {
    expect(weightedAssignment(2, "ROTATE", 1)).toEqual([["SQUAT", "PUSH"], ["HINGE", "PRESS"]]);
  });
  it("3 days = squat+bench, deadlift, press", () => {
    expect(weightedAssignment(3, "ROTATE", 1)).toEqual([["SQUAT", "PUSH"], ["HINGE"], ["PRESS"]]);
  });
  it("1 day rotates pairs by week parity", () => {
    expect(weightedAssignment(1, "ROTATE", 1)).toEqual([["SQUAT", "PUSH"]]);
    expect(weightedAssignment(1, "ROTATE", 2)).toEqual([["HINGE", "PRESS"]]);
  });
  it("1 day all-in-one = all four", () => {
    expect(weightedAssignment(1, "ALL_IN_ONE", 1)).toEqual([["SQUAT", "HINGE", "PUSH", "PRESS"]]);
  });
});

describe("pullRiderDays (pressing days, lightest first, one per pull)", () => {
  it("4 days → overhead-press day first, then bench day", () => {
    const a = weightedAssignment(4, "ROTATE", 1); // [[SQUAT],[PUSH],[HINGE],[PRESS]]
    expect(pullRiderDays(a, 1)).toEqual([3]); // PRESS
    expect(pullRiderDays(a, 2)).toEqual([3, 1]); // PRESS, then PUSH
  });
  it("3 days → the press day, not the squat+bench day", () => {
    const a = weightedAssignment(3, "ROTATE", 1); // [[SQUAT,PUSH],[HINGE],[PRESS]]
    expect(pullRiderDays(a, 1)).toEqual([2]);
  });
  it("2 days → squat+bench day first, deadlift+press day second", () => {
    const a = weightedAssignment(2, "ROTATE", 1); // [[SQUAT,PUSH],[HINGE,PRESS]]
    expect(pullRiderDays(a, 2)).toEqual([0, 1]);
  });
  it("more pulls than pressing days wrap onto the same day", () => {
    const a = weightedAssignment(1, "ALL_IN_ONE", 1);
    expect(pullRiderDays(a, 2)).toEqual([0, 0]);
  });
});

describe("suggestedMinutes", () => {
  it("scales with weighted lifts; bodyweight day is light", () => {
    expect(suggestedMinutes(0)).toBe(45);
    expect(suggestedMinutes(1)).toBe(45);
    expect(suggestedMinutes(2)).toBe(60);
    expect(suggestedMinutes(4)).toBe(120);
  });
});

describe("buildSchedule", () => {
  const state: ProgramState = {
    SQUAT: { trainingMax: 120, repMax: 5 },
    HINGE: { trainingMax: 140, repMax: 5 },
    PUSH: { trainingMax: 100, repMax: 12 },
    PRESS: { trainingMax: 60, repMax: 5 },
    PULL: { trainingMax: 70, repMax: 8 },
  };
  const day = (id: string, equipment: "WEIGHTS" | "BODYWEIGHT"): DayPlan => ({
    id, name: id, equipment, minutes: 60,
  });

  it("2 weighted days split the cores, each lift once", () => {
    const plan = buildSchedule([day("a", "WEIGHTS"), day("b", "WEIGHTS")], state, {
      pulls: { pullups: false, rows: false }, layout: "ROTATE", week: 1,
    });
    expect(plan[0].exercises.map((e) => e.movement)).toEqual(["SQUAT", "PUSH"]);
    expect(plan[1].exercises.map((e) => e.movement)).toEqual(["HINGE", "PRESS"]);
    expect(plan[0].exercises.every((e) => e.mode === "WEIGHTED")).toBe(true);
  });

  it("a bodyweight day is full-body (all four patterns) regardless of day count", () => {
    const plan = buildSchedule([day("a", "BODYWEIGHT"), day("b", "BODYWEIGHT")], state, {
      pulls: { pullups: false, rows: false }, layout: "ROTATE", week: 1,
    });
    for (const d of plan) {
      expect(d.exercises.map((e) => e.movement)).toEqual(["SQUAT", "HINGE", "PUSH", "PRESS"]);
      expect(d.exercises.every((e) => e.mode === "BODYWEIGHT")).toBe(true);
    }
  });

  it("with both pulls on, pull-ups and rows ride DIFFERENT weighted days", () => {
    const plan = buildSchedule([day("a", "WEIGHTS"), day("b", "WEIGHTS")], state, {
      pulls: { pullups: true, rows: true }, layout: "ROTATE", week: 1,
    });
    expect(plan[0].exercises.map((e) => e.movement)).toEqual(["SQUAT", "PUSH", "PULLV"]);
    expect(plan[1].exercises.map((e) => e.movement)).toEqual(["HINGE", "PRESS", "PULL"]);
  });

  it("a single enabled pull rides one weighted pressing day", () => {
    const plan = buildSchedule([day("a", "WEIGHTS"), day("b", "WEIGHTS")], state, {
      pulls: { pullups: false, rows: true }, layout: "ROTATE", week: 1,
    });
    const pulls = plan.flatMap((d) => d.exercises).filter((e) => e.movement === "PULL");
    expect(pulls).toHaveLength(1);
    expect(plan[0].exercises.map((e) => e.movement)).toContain("PULL"); // squat+bench day
  });

  it("bodyweight days include every enabled pull", () => {
    const plan = buildSchedule([day("a", "BODYWEIGHT")], state, {
      pulls: { pullups: true, rows: true }, layout: "ROTATE", week: 1,
    });
    expect(plan[0].exercises.map((e) => e.movement)).toEqual([
      "SQUAT", "HINGE", "PUSH", "PRESS", "PULLV", "PULL",
    ]);
  });

  it("mixed: 1 weighted (rotating) + 1 bodyweight — weighted alternates, bodyweight full-body", () => {
    const days = [day("w", "WEIGHTS"), day("b", "BODYWEIGHT")];
    const wkA = buildSchedule(days, state, { pulls: { pullups: false, rows: false }, layout: "ROTATE", week: 1 });
    const wkB = buildSchedule(days, state, { pulls: { pullups: false, rows: false }, layout: "ROTATE", week: 2 });
    expect(wkA[0].exercises.map((e) => e.movement)).toEqual(["SQUAT", "PUSH"]);
    expect(wkA[0].rotation).toBe("A");
    expect(wkB[0].exercises.map((e) => e.movement)).toEqual(["HINGE", "PRESS"]);
    expect(wkB[0].rotation).toBe("B");
    // bodyweight day is full-body both weeks
    expect(wkA[1].exercises.map((e) => e.movement)).toEqual(["SQUAT", "HINGE", "PUSH", "PRESS"]);
  });

  it("all-in-one: a single weighted day loads all four weekly", () => {
    const plan = buildSchedule([day("w", "WEIGHTS")], state, {
      pulls: { pullups: false, rows: false }, layout: "ALL_IN_ONE", week: 1,
    });
    expect(plan[0].exercises.map((e) => e.movement)).toEqual(["SQUAT", "HINGE", "PUSH", "PRESS"]);
    expect(plan[0].rotation).toBeUndefined();
  });

  it("weighted sets come off the training max (week-1 top set = 85%)", () => {
    const plan = buildSchedule([day("a", "WEIGHTS")], state, {
      pulls: { pullups: false, rows: false }, layout: "ALL_IN_ONE", week: 1,
    });
    const squat = plan[0].exercises.find((e) => e.movement === "SQUAT")!;
    expect(squat.sets[squat.sets.length - 1].weight).toBe(100); // 85% of 120 = 102 → round to 5
  });
});

describe("custom layout (explicit per-day movement lists override the auto split)", () => {
  const state: ProgramState = {
    SQUAT: { trainingMax: 120 }, HINGE: { trainingMax: 140 },
    PUSH: { trainingMax: 100 }, PRESS: { trainingMax: 60 },
  };
  it("uses each day's movements verbatim, in order, when any day defines them", () => {
    const days: DayPlan[] = [
      { id: "a", name: "A", equipment: "WEIGHTS", minutes: 60, movements: ["HINGE", "SQUAT"] },
      { id: "b", name: "B", equipment: "WEIGHTS", minutes: 60, movements: ["PRESS", "PUSH"] },
    ];
    const plan = buildSchedule(days, state, { pulls: { pullups: false, rows: false }, layout: "ROTATE", week: 1 });
    expect(plan[0].exercises.map((e) => e.movement)).toEqual(["HINGE", "SQUAT"]); // custom order, not auto
    expect(plan[1].exercises.map((e) => e.movement)).toEqual(["PRESS", "PUSH"]);
  });
  it("dedupes within a day and tolerates an empty day; a lift may sit on several days", () => {
    const days: DayPlan[] = [
      { id: "a", name: "A", equipment: "WEIGHTS", minutes: 60, movements: ["SQUAT", "SQUAT", "PUSH"] },
      { id: "b", name: "B", equipment: "WEIGHTS", minutes: 60, movements: ["SQUAT"] }, // same lift, another day
      { id: "c", name: "C", equipment: "WEIGHTS", minutes: 60, movements: [] }, // empty day → no lifts
    ];
    const plan = buildSchedule(days, state, { pulls: { pullups: false, rows: false }, layout: "ROTATE", week: 1 });
    expect(plan[0].exercises.map((e) => e.movement)).toEqual(["SQUAT", "PUSH"]); // deduped
    expect(plan[1].exercises.map((e) => e.movement)).toEqual(["SQUAT"]);
    expect(plan[2].exercises).toEqual([]);
  });
  it("falls back to the auto split when NO day defines movements (unchanged default)", () => {
    const days: DayPlan[] = [
      { id: "a", name: "A", equipment: "WEIGHTS", minutes: 60 },
      { id: "b", name: "B", equipment: "WEIGHTS", minutes: 60 },
    ];
    const plan = buildSchedule(days, state, { pulls: { pullups: false, rows: false }, layout: "ROTATE", week: 1 });
    expect(plan[0].exercises.map((e) => e.movement)).toEqual(["SQUAT", "PUSH"]); // auto pairing
    expect(plan[1].exercises.map((e) => e.movement)).toEqual(["HINGE", "PRESS"]);
  });
});

describe("ROTATE runs an 8-week super-cycle (each pair walks its own 4-week wave)", () => {
  const state: ProgramState = {
    SQUAT: { trainingMax: 120 },
    HINGE: { trainingMax: 140 },
    PUSH: { trainingMax: 100 },
    PRESS: { trainingMax: 60 },
  };
  const days: DayPlan[] = [{ id: "w", name: "w", equipment: "WEIGHTS", minutes: 60 }];
  /** Identify which wave week a planned exercise's sets came from, by their % signature. */
  const waveOf = (sets: { pct?: number }[]): number => {
    const key = sets.map((s) => s.pct).join(",");
    const found = ([1, 2, 3, 4] as const).find(
      (w) => WAVE[w].sets.map((s) => s.pct).join(",") === key,
    );
    expect(found).toBeDefined();
    return found!;
  };

  it("rotationWaveWeek: program weeks 1..8 map each pair to waves 1,2,3,4 in turn", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8].map(rotationWaveWeek)).toEqual([1, 1, 2, 2, 3, 3, 4, 4]);
    expect(rotationWaveWeek(9)).toBe(1); // wraps into the next super-cycle
    expect(rotationWaveWeek(16)).toBe(4);
  });

  it("every lift sees all four wave weeks across weeks 1-8 (incl. the test and the deload)", () => {
    const seen: Partial<Record<string, number[]>> = {};
    for (let week = 1; week <= 8; week++) {
      const plan = buildSchedule(days, state, { pulls: { pullups: false, rows: false }, layout: "ROTATE", week });
      for (const e of plan[0].exercises) {
        (seen[e.movement] ??= []).push(waveOf(e.sets));
      }
    }
    for (const m of ["SQUAT", "PUSH", "HINGE", "PRESS"]) {
      // 4 sessions per super-cycle, walking the pair's own wave in order.
      expect(seen[m]).toEqual([1, 2, 3, 4]);
    }
  });

  it("pair B (deadlift+press) reaches its week-3 AMRAP test — on program week 6", () => {
    const plan = buildSchedule(days, state, { pulls: { pullups: false, rows: false }, layout: "ROTATE", week: 6 });
    expect(plan[0].rotation).toBe("B");
    expect(plan[0].exercises.map((e) => e.movement)).toEqual(["HINGE", "PRESS"]);
    for (const e of plan[0].exercises) {
      expect(waveOf(e.sets)).toBe(3);
      expect(e.sets.at(-1)).toMatchObject({ reps: 1, amrap: true, pct: 0.95 });
    }
  });

  it("pair A (squat+bench) reaches its deload — on program week 7", () => {
    const plan = buildSchedule(days, state, { pulls: { pullups: false, rows: false }, layout: "ROTATE", week: 7 });
    expect(plan[0].rotation).toBe("A");
    expect(plan[0].exercises.map((e) => e.movement)).toEqual(["SQUAT", "PUSH"]);
    for (const e of plan[0].exercises) expect(waveOf(e.sets)).toBe(4);
  });

  it("a bodyweight day alongside the rotation keeps its plain 4-week wave off the program week", () => {
    const mixed: DayPlan[] = [...days, { id: "b", name: "b", equipment: "BODYWEIGHT", minutes: 45 }];
    const wk5 = buildSchedule(mixed, { ...state, SQUAT: { trainingMax: 120, repMax: 10 } }, {
      pulls: { pullups: false, rows: false }, layout: "ROTATE", week: 5,
    });
    // Program week 5 ≡ wave week 1 for the bodyweight day (mod 4), while the weighted pair tests.
    expect(waveOf(wk5[1].exercises[0].sets)).toBe(1);
    expect(waveOf(wk5[0].exercises[0].sets)).toBe(3);
  });

  it("programCycleWeeks: 8 only for a single rotating weighted day", () => {
    expect(programCycleWeeks(days, "ROTATE")).toBe(8);
    expect(programCycleWeeks(days, "ALL_IN_ONE")).toBe(4);
    expect(programCycleWeeks([...days, { id: "w2", name: "w2", equipment: "WEIGHTS", minutes: 60 }], "ROTATE")).toBe(4);
    expect(programCycleWeeks([{ id: "b", name: "b", equipment: "BODYWEIGHT", minutes: 45 }], "ROTATE")).toBe(4);
  });
});

describe("per-movement auto-progression (each lift its own wave)", () => {
  it("normWeek folds any number into the 1..4 wave position", () => {
    expect([1, 2, 3, 4, 5, 8, 0, -1].map(normWeek)).toEqual([1, 2, 3, 4, 1, 4, 4, 3]);
  });

  it("effective week/cycle prefer the lift's own values, else fall back to the program's", () => {
    expect(effectiveWeek({ week: 3 }, 1)).toBe(3);
    expect(effectiveWeek({}, 2)).toBe(2); // untouched lift reads the global pointer
    expect(effectiveWeek(undefined, 2)).toBe(2);
    expect(effectiveCycle({ cycle: 5 }, 1)).toBe(5);
    expect(effectiveCycle({}, 2)).toBe(2);
  });

  it("weeks 1→2→3 just step the wave (no bump, cycle unchanged)", () => {
    const { next, event } = advanceAfterSession("SQUAT", { trainingMax: 100, week: 1, cycle: 2 }, 1, 5, 1, {
      rounding: 2.5,
    });
    expect(event).toBe("advanced");
    expect(next.week).toBe(2);
    expect(next.cycle).toBe(2);
    expect(next.trainingMax).toBe(100); // no bump mid-cycle
  });

  it("week 3 captures the AMRAP and moves to the deload; the bump lands after week 4", () => {
    const afterW3 = advanceAfterSession("SQUAT", { trainingMax: 100, week: 3, cycle: 1 }, 3, 6, 1, {
      rounding: 2.5,
    });
    expect(afterW3.next.week).toBe(4);
    expect(afterW3.next.cycle).toBe(1); // still the same cycle for the deload
    expect(afterW3.next.trainingMax).toBe(100); // not yet
    expect(afterW3.next.pendingAmrap).toBe(6);

    const afterW4 = advanceAfterSession("SQUAT", afterW3.next, 4, 0, 1, { rounding: 2.5 });
    expect(afterW4.event).toBe("cycleFinished");
    expect(afterW4.next.week).toBe(1);
    expect(afterW4.next.cycle).toBe(2); // new cycle
    expect(afterW4.next.trainingMax).toBe(105); // INCREASE by the lower-body increment (5 kg)
    expect(afterW4.next.pendingAmrap).toBeUndefined();
  });

  it("a blank/absent week-3 AMRAP closes the cycle as a successful test (increase)", () => {
    // No pendingAmrap and 0 reps at week 4 ⇒ treat as a pass, not a failure.
    const { next, event } = advanceAfterSession("PUSH", { trainingMax: 100, week: 4, cycle: 1 }, 4, 0, 1, {
      rounding: 2.5,
    });
    expect(event).toBe("cycleFinished");
    expect(next.trainingMax).toBe(102.5); // upper-body increment, not a HOLD
  });

  it("manual 'deload now' → do the deload, then restart the SAME cycle at week 1, no bump", () => {
    const armed = deloadNowState({ trainingMax: 120, week: 3, cycle: 4 }, 4);
    expect(armed.week).toBe(4);
    expect(armed.deloadReset).toBe(true);
    const { next, event } = advanceAfterSession("SQUAT", armed, 4, 0, 1, { rounding: 2.5 });
    expect(event).toBe("deloadReset");
    expect(next.week).toBe(1);
    expect(next.cycle).toBe(4); // SAME cycle
    expect(next.trainingMax).toBe(120); // NO bump — repeats the same weights
    expect(next.deloadReset).toBeUndefined();
  });

  it("stamps the session date and detects staleness on return", () => {
    const { next } = advanceAfterSession("SQUAT", { trainingMax: 100, week: 1 }, 1, 5, 1, {
      date: "2026-07-01",
    });
    expect(next.lastTrainedAt).toBe("2026-07-01");
    expect(daysBetween("2026-07-01", "2026-07-13")).toBe(12);
    expect(isStale(next, "2026-07-13")).toBe(false); // 12 < 16
    expect(isStale(next, "2026-07-20")).toBe(true); // 19 ≥ 16
    expect(isStale({}, "2026-07-20")).toBe(false); // never trained ⇒ not "stale"
  });

  it("manual week override clears any pending test / deload flag", () => {
    const cur: MovementState = { trainingMax: 100, week: 3, cycle: 2, pendingAmrap: 5, deloadReset: true };
    const next = setMovementWeekState(cur, 1, 2);
    expect(next.week).toBe(1);
    expect(next.cycle).toBe(2);
    expect(next.pendingAmrap).toBeUndefined();
    expect(next.deloadReset).toBeUndefined();
  });

  it("advanceStateAfterSession advances only the DONE, movement-tagged lifts (the 2-day case)", () => {
    // Main-user shape: Session 1 = squat+bench, both at week 1, logged done. Deadlift/press aren't
    // in this session, so they must NOT move. A custom (no-movement) line is ignored.
    const state: ProgramState = {
      SQUAT: { trainingMax: 120, week: 1, cycle: 1 },
      PUSH: { trainingMax: 100, week: 1, cycle: 1 },
      HINGE: { trainingMax: 140, week: 1, cycle: 1 },
      PRESS: { trainingMax: 60, week: 1, cycle: 1 },
    };
    const exercises = [
      { movement: "SQUAT" as const, week: 1, done: true, sets: [{ reps: 5 }, { reps: 5 }, { amrap: true, reps: 8 }] },
      { movement: "PUSH" as const, week: 1, done: true, sets: [{ amrap: true, reps: 10 }] },
      { movement: undefined, week: undefined, done: true, sets: [{ reps: 12 }] }, // custom line → ignored
    ];
    const { state: next, advanced } = advanceStateAfterSession(state, exercises, {
      rounding: 2.5, fallbackCycle: 1, dayEquipment: "WEIGHTS",
    });
    expect(advanced.sort()).toEqual(["PUSH", "SQUAT"]);
    expect(next.SQUAT?.week).toBe(2); // stepped
    expect(next.PUSH?.week).toBe(2);
    expect(next.HINGE?.week).toBe(1); // untouched — different day
    expect(next.PRESS?.week).toBe(1);
    expect(next.SQUAT?.trainingMax).toBe(120); // no bump mid-cycle
  });

  it("advanceStateAfterSession skips lifts not marked done, and dedupes a repeated movement", () => {
    const state: ProgramState = { SQUAT: { trainingMax: 120, week: 2, cycle: 1 } };
    const { state: next, advanced } = advanceStateAfterSession(
      state,
      [
        { movement: "SQUAT" as const, week: 2, done: false, sets: [] }, // not done → skip
        { movement: "SQUAT" as const, week: 2, done: true, sets: [{ amrap: true, reps: 3 }] },
        { movement: "SQUAT" as const, week: 2, done: true, sets: [{ amrap: true, reps: 3 }] }, // dup → ignored
      ],
      { rounding: 2.5, fallbackCycle: 1, dayEquipment: "WEIGHTS" },
    );
    expect(advanced).toEqual(["SQUAT"]);
    expect(next.SQUAT?.week).toBe(3); // advanced exactly once (2→3)
  });

  it("advanceStateAfterSession reports before/after transitions for the history log (#30)", () => {
    // A week-4 (deload) completion closes the cycle and overwrites the training max — the
    // transition must carry the pre-overwrite snapshot so nothing is lost.
    const state: ProgramState = {
      SQUAT: { trainingMax: 120, week: 4, cycle: 2, pendingAmrap: 8 },
      PUSH: { trainingMax: 100, week: 1, cycle: 2 },
    };
    const { transitions } = advanceStateAfterSession(
      state,
      [
        { movement: "SQUAT" as const, week: 4, done: true, sets: [{ reps: 5 }] },
        { movement: "PUSH" as const, week: 1, done: true, sets: [{ amrap: true, reps: 10 }] },
      ],
      { rounding: 2.5, fallbackCycle: 2, dayEquipment: "WEIGHTS" },
    );
    const squat = transitions.find((tr) => tr.movement === "SQUAT")!;
    expect(squat.event).toBe("cycleFinished");
    expect(squat.before.trainingMax).toBe(120);
    expect(squat.after.trainingMax).toBe(125); // squat increment +5
    expect(squat.after.cycle).toBe(3);
    const push = transitions.find((tr) => tr.movement === "PUSH")!;
    expect(push.event).toBe("advanced"); // mid-cycle week step, nothing overwritten
  });

  it("inferCycleDecision reconstructs INCREASE / HOLD / REDUCE from the snapshots", () => {
    expect(
      inferCycleDecision({ trainingMax: 120, holds: 0 }, { trainingMax: 125, holds: 0 }),
    ).toBe("INCREASE");
    expect(
      inferCycleDecision({ trainingMax: 120, holds: 0 }, { trainingMax: 120, holds: 1 }),
    ).toBe("HOLD");
    expect(
      inferCycleDecision({ trainingMax: 120, holds: 1 }, { trainingMax: 107.5, holds: 0 }),
    ).toBe("REDUCE");
    // Bodyweight lifts: a dropped level (or rep max at the same level) is the reduce.
    expect(inferCycleDecision({ repMax: 12, levelIndex: 1 }, { repMax: 5, levelIndex: 2 })).toBe(
      "INCREASE", // graduated a level — rep reset is part of moving up
    );
    expect(inferCycleDecision({ repMax: 12, levelIndex: 1 }, { repMax: 9, levelIndex: 1 })).toBe(
      "REDUCE",
    );
  });

  it("carryProgression keeps each lift's week/cycle across a settings rebuild (the reset bug)", () => {
    // `prev` = live state (mid-progression). `next` = freshly rebuilt from the settings form
    // (readMaxima) — has the new maxima/exercises but NO progression fields.
    const prev: ProgramState = {
      SQUAT: { trainingMax: 120, week: 3, cycle: 2, holds: 1, lastTrainedAt: "2026-07-10" },
      PUSH: { trainingMax: 100, week: 4, cycle: 2, pendingAmrap: 6, deloadReset: true },
    };
    const next: ProgramState = {
      SQUAT: { trainingMax: 125, weightedExerciseId: "SQUAT_DB" }, // edited TM + exercise, no week
      PUSH: { trainingMax: 100 },
    };
    const merged = carryProgression(prev, next);
    // Progression carried over…
    expect(merged.SQUAT).toMatchObject({ week: 3, cycle: 2, holds: 1, lastTrainedAt: "2026-07-10" });
    expect(merged.PUSH).toMatchObject({ week: 4, cycle: 2, pendingAmrap: 6, deloadReset: true });
    // …while the edited maxima/exercise from the form win.
    expect(merged.SQUAT?.trainingMax).toBe(125);
    expect(merged.SQUAT?.weightedExerciseId).toBe("SQUAT_DB");
  });

  it("carryProgression leaves a lift alone when prev has no progression for it", () => {
    const merged = carryProgression({ SQUAT: {} }, { SQUAT: { trainingMax: 100 } });
    expect(merged.SQUAT).toEqual({ trainingMax: 100 });
  });

  it("buildSchedule builds each lift's sets from ITS OWN week when present", () => {
    // SQUAT at its own week 3 (test week), PUSH falling back to the schedule week 1.
    const state: ProgramState = { SQUAT: { trainingMax: 120, week: 3 }, PUSH: { trainingMax: 100 } };
    const plan = buildSchedule([{ id: "a", name: "a", equipment: "WEIGHTS", minutes: 60 }], state, {
      pulls: { pullups: false, rows: false }, layout: "ALL_IN_ONE", week: 1,
    });
    const squat = plan[0].exercises.find((e) => e.movement === "SQUAT")!;
    const push = plan[0].exercises.find((e) => e.movement === "PUSH")!;
    expect(squat.week).toBe(3);
    expect(squat.sets.map((s) => s.pct)).toEqual([0.75, 0.85, 0.95]); // wave week 3
    expect(push.week).toBe(1);
    expect(push.sets.map((s) => s.pct)).toEqual([0.65, 0.75, 0.85]); // wave week 1 (fallback)
  });
});

describe("workoutForSlot", () => {
  const state: ProgramState = { PUSH: { trainingMax: 100, repMax: 8 } };
  it("weighted slot builds kg sets off the movement training max", () => {
    const w = workoutForSlot({ movement: "PUSH", exerciseId: "PUSH_BB", mode: "WEIGHTED", tool: "BARBELL" }, state, 1);
    expect(w.mode).toBe("WEIGHTED");
    expect(w.sets[w.sets.length - 1].weight).toBe(85); // week 1 top set = 85% of 100
  });
  it("bodyweight slot builds rep sets off the rep max (cross-mode from a weights program)", () => {
    const w = workoutForSlot({ movement: "PUSH", exerciseId: "PUSH_FULL", mode: "BODYWEIGHT", tool: "BODYWEIGHT" }, state, 1);
    expect(w.mode).toBe("BODYWEIGHT");
    expect(w.sets.every((s) => s.weight === undefined)).toBe(true);
    expect(w.labelKey).toBe("ex.push.full");
  });
});
