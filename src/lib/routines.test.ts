import { describe, expect, it } from "vitest";
import {
  measureAxes,
  parseRoutineExercises,
  prefillSets,
  routineDayId,
  routineIdFromDayId,
  summarizeExercise,
  type RoutineExercise,
} from "./routines";

const pushups: RoutineExercise = { name: "Push-ups", measure: "REPS", sets: [{ reps: 8 }, { reps: 8 }, { reps: 8 }] };
const bench: RoutineExercise = {
  name: "Bench",
  measure: "KG_REPS",
  sets: [
    { weight: 60, reps: 5 },
    { weight: 60, reps: 5 },
  ],
};
const plank: RoutineExercise = { name: "Plank", measure: "SECONDS", tempo: "3-0-3", sets: [{ seconds: 30 }] };

describe("parseRoutineExercises", () => {
  it("round-trips a well-formed document", () => {
    const parsed = parseRoutineExercises(JSON.stringify([pushups, bench, plank]));
    expect(parsed).toHaveLength(3);
    expect(parsed[0]).toMatchObject({ name: "Push-ups", measure: "REPS" });
    expect(parsed[2]).toMatchObject({ tempo: "3-0-3" });
  });

  it("survives garbage: bad JSON, wrong shapes, unknown measures", () => {
    expect(parseRoutineExercises("{nope")).toEqual([]);
    expect(parseRoutineExercises(JSON.stringify({ a: 1 }))).toEqual([]);
    expect(parseRoutineExercises(null)).toEqual([]);
    const parsed = parseRoutineExercises(
      JSON.stringify([{ name: "X", measure: "WAT", sets: "no" }, { measure: "REPS" }, 42]),
    );
    // Nameless/non-object entries drop; unknown measure falls back to the default; a missing
    // sets array yields one empty placeholder set.
    expect(parsed).toEqual([{ name: "X", measure: "KG_REPS", sets: [{}] }]);
  });

  it("drops negative/non-numeric set values", () => {
    const parsed = parseRoutineExercises(
      JSON.stringify([{ name: "X", measure: "KG_REPS", sets: [{ weight: -5, reps: "3" }] }]),
    );
    expect(parsed[0].sets).toEqual([{ weight: undefined, reps: undefined, seconds: undefined }]);
  });
});

describe("prefillSets", () => {
  it("falls back to the routine's stored targets with no history", () => {
    expect(prefillSets(bench, 0, null)).toEqual(bench.sets);
    expect(prefillSets(bench, 0, [])).toEqual(bench.sets);
  });

  it("prefers last-logged values set-by-set, filling gaps from targets", () => {
    const out = prefillSets(bench, 0, [
      { name: "bench", sets: [{ weight: 62.5, reps: 5 }, { weight: null, reps: null }] },
    ]);
    expect(out).toEqual([
      { weight: 62.5, reps: 5 },
      { weight: 60, reps: 5 }, // null logged values fall back to the target
    ]);
  });

  it("keeps an extra set the athlete added last time", () => {
    const out = prefillSets(pushups, 0, [
      { name: "Push-ups", sets: [{ reps: 9 }, { reps: 9 }, { reps: 8 }, { reps: 6 }] },
    ]);
    expect(out).toEqual([{ reps: 9 }, { reps: 9 }, { reps: 8 }, { reps: 6 }]);
  });

  it("matches by name case-insensitively before falling back to position", () => {
    const logged = [
      { name: "Bench", sets: [{ weight: 70, reps: 3 }] },
      { name: "push-UPS", sets: [{ reps: 12 }] },
    ];
    // pushups is at index 0 here but must match the second logged entry by name.
    expect(prefillSets(pushups, 0, logged)[0]).toEqual({ reps: 12 });
  });

  it("falls back to position when names changed", () => {
    const logged = [{ name: "Old name", sets: [{ reps: 11 }] }];
    expect(prefillSets(pushups, 0, logged)[0]).toEqual({ reps: 11 });
  });

  it("only carries the axes the measure uses", () => {
    const out = prefillSets(plank, 0, [{ name: "Plank", sets: [{ seconds: 40, reps: 99, weight: 99 }] }]);
    expect(out).toEqual([{ seconds: 40 }]);
  });
});

describe("measureAxes / summarizeExercise", () => {
  it("maps each measure to its input axes", () => {
    expect(measureAxes("KG_REPS")).toEqual({ weight: true, reps: true, seconds: false });
    expect(measureAxes("REPS")).toEqual({ weight: false, reps: true, seconds: false });
    expect(measureAxes("SECONDS")).toEqual({ weight: false, reps: false, seconds: true });
    expect(measureAxes("KG_SECONDS")).toEqual({ weight: true, reps: false, seconds: true });
  });

  it("summarizes targets compactly", () => {
    expect(summarizeExercise(pushups)).toBe("3×8");
    expect(summarizeExercise(bench)).toBe("2×5 @ 60 kg");
    expect(summarizeExercise(plank)).toBe("1×30 s");
  });
});

describe("routine day ids", () => {
  it("round-trips and rejects non-routine ids", () => {
    expect(routineIdFromDayId(routineDayId("abc"))).toBe("abc");
    expect(routineIdFromDayId("d0")).toBeNull();
    expect(routineIdFromDayId(undefined)).toBeNull();
  });
});
