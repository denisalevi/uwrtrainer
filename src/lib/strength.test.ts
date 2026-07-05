import { describe, it, expect } from "vitest";
import {
  estimateOneRepMax,
  roundToIncrement,
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
  pullRiderDay,
  buildSchedule,
  rotationWaveWeek,
  programCycleWeeks,
  WAVE,
  type ProgramState,
  type DayPlan,
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
  it("training max is a rounded 90% of the 1RM by default", () => {
    expect(trainingMaxFromOneRepMax(100)).toBe(90);
    expect(trainingMaxFromOneRepMax(102, 0.9, 2.5)).toBe(92.5); // 91.8 → 92.5
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
  it("weighted entries are loadable tools, bodyweight entries are BODYWEIGHT", () => {
    for (const m of MOVEMENTS) {
      for (const e of EXERCISE_CATALOG[m]) {
        if (e.mode === "WEIGHTED") expect(e.tool).not.toBe("BODYWEIGHT");
        else expect(e.tool).toBe("BODYWEIGHT");
      }
    }
  });
  it("catalogEntry resolves known ids and rejects unknown", () => {
    expect(catalogEntry("PUSH", "PUSH_BB")?.tool).toBe("BARBELL");
    expect(catalogEntry("PUSH", "nope")).toBeUndefined();
  });
});

describe("defaults & program movements", () => {
  it("includes PULL only when enabled", () => {
    expect(programSlotMovements(true)).toContain("PULL");
    expect(programSlotMovements(false)).not.toContain("PULL");
    expect(programSlotMovements(false)).toEqual(["SQUAT", "HINGE", "PUSH", "PRESS"]);
  });
  it("default exercise ids are the barbell lift / first bodyweight rung", () => {
    expect(defaultExerciseId("PUSH", "WEIGHTED")).toBe("PUSH_BB");
    expect(defaultExerciseId("PULL", "BODYWEIGHT")).toBe("PULL_FULL"); // pull-up assumed
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

describe("pullRiderDay (lighter pressing day, never the deadlift day)", () => {
  it("4 days → the overhead-press day", () => {
    const a = weightedAssignment(4, "ROTATE", 1); // [[SQUAT],[PUSH],[HINGE],[PRESS]]
    expect(pullRiderDay(a)).toBe(3); // PRESS
  });
  it("3 days → the press day, not the squat+bench day", () => {
    const a = weightedAssignment(3, "ROTATE", 1); // [[SQUAT,PUSH],[HINGE],[PRESS]]
    expect(pullRiderDay(a)).toBe(2); // PRESS, the single-lift pressing day
  });
  it("2 days → the squat+bench day (keeps rows off the deadlift day)", () => {
    const a = weightedAssignment(2, "ROTATE", 1); // [[SQUAT,PUSH],[HINGE,PRESS]]
    expect(pullRiderDay(a)).toBe(0);
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
      includePull: false, layout: "ROTATE", week: 1,
    });
    expect(plan[0].exercises.map((e) => e.movement)).toEqual(["SQUAT", "PUSH"]);
    expect(plan[1].exercises.map((e) => e.movement)).toEqual(["HINGE", "PRESS"]);
    expect(plan[0].exercises.every((e) => e.mode === "WEIGHTED")).toBe(true);
  });

  it("a bodyweight day is full-body (all four patterns) regardless of day count", () => {
    const plan = buildSchedule([day("a", "BODYWEIGHT"), day("b", "BODYWEIGHT")], state, {
      includePull: false, layout: "ROTATE", week: 1,
    });
    for (const d of plan) {
      expect(d.exercises.map((e) => e.movement)).toEqual(["SQUAT", "HINGE", "PUSH", "PRESS"]);
      expect(d.exercises.every((e) => e.mode === "BODYWEIGHT")).toBe(true);
    }
  });

  it("pull rides one weighted pressing day when enabled", () => {
    const plan = buildSchedule([day("a", "WEIGHTS"), day("b", "WEIGHTS")], state, {
      includePull: true, layout: "ROTATE", week: 1,
    });
    const pulls = plan.flatMap((d) => d.exercises).filter((e) => e.movement === "PULL");
    expect(pulls).toHaveLength(1);
    expect(plan[0].exercises.map((e) => e.movement)).toContain("PULL"); // squat+bench day
  });

  it("mixed: 1 weighted (rotating) + 1 bodyweight — weighted alternates, bodyweight full-body", () => {
    const days = [day("w", "WEIGHTS"), day("b", "BODYWEIGHT")];
    const wkA = buildSchedule(days, state, { includePull: false, layout: "ROTATE", week: 1 });
    const wkB = buildSchedule(days, state, { includePull: false, layout: "ROTATE", week: 2 });
    expect(wkA[0].exercises.map((e) => e.movement)).toEqual(["SQUAT", "PUSH"]);
    expect(wkA[0].rotation).toBe("A");
    expect(wkB[0].exercises.map((e) => e.movement)).toEqual(["HINGE", "PRESS"]);
    expect(wkB[0].rotation).toBe("B");
    // bodyweight day is full-body both weeks
    expect(wkA[1].exercises.map((e) => e.movement)).toEqual(["SQUAT", "HINGE", "PUSH", "PRESS"]);
  });

  it("all-in-one: a single weighted day loads all four weekly", () => {
    const plan = buildSchedule([day("w", "WEIGHTS")], state, {
      includePull: false, layout: "ALL_IN_ONE", week: 1,
    });
    expect(plan[0].exercises.map((e) => e.movement)).toEqual(["SQUAT", "HINGE", "PUSH", "PRESS"]);
    expect(plan[0].rotation).toBeUndefined();
  });

  it("weighted sets come off the training max (week-1 top set = 85%)", () => {
    const plan = buildSchedule([day("a", "WEIGHTS")], state, {
      includePull: false, layout: "ALL_IN_ONE", week: 1,
    });
    const squat = plan[0].exercises.find((e) => e.movement === "SQUAT")!;
    expect(squat.sets[squat.sets.length - 1].weight).toBe(100); // 85% of 120 = 102 → round to 5
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
      const plan = buildSchedule(days, state, { includePull: false, layout: "ROTATE", week });
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
    const plan = buildSchedule(days, state, { includePull: false, layout: "ROTATE", week: 6 });
    expect(plan[0].rotation).toBe("B");
    expect(plan[0].exercises.map((e) => e.movement)).toEqual(["HINGE", "PRESS"]);
    for (const e of plan[0].exercises) {
      expect(waveOf(e.sets)).toBe(3);
      expect(e.sets.at(-1)).toMatchObject({ reps: 1, amrap: true, pct: 0.95 });
    }
  });

  it("pair A (squat+bench) reaches its deload — on program week 7", () => {
    const plan = buildSchedule(days, state, { includePull: false, layout: "ROTATE", week: 7 });
    expect(plan[0].rotation).toBe("A");
    expect(plan[0].exercises.map((e) => e.movement)).toEqual(["SQUAT", "PUSH"]);
    for (const e of plan[0].exercises) expect(waveOf(e.sets)).toBe(4);
  });

  it("a bodyweight day alongside the rotation keeps its plain 4-week wave off the program week", () => {
    const mixed: DayPlan[] = [...days, { id: "b", name: "b", equipment: "BODYWEIGHT", minutes: 45 }];
    const wk5 = buildSchedule(mixed, { ...state, SQUAT: { trainingMax: 120, repMax: 10 } }, {
      includePull: false, layout: "ROTATE", week: 5,
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
