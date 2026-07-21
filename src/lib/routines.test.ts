import { describe, expect, it } from "vitest";
import {
  linkLabel,
  measureAxes,
  parseRoutineExercises,
  parseRoutineItems,
  prefillSets,
  remapRoutineRefs,
  routineDayId,
  routineIdFromDayId,
  summarizeExercise,
  summarizeItem,
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

describe("routine items — refs and links", () => {
  const doc = JSON.stringify([
    { type: "routine", routineId: "r1", name: "Stretching", note: "after every workout" },
    { name: "Bench", measure: "KG_REPS", sets: [{ weight: 60, reps: 5 }], note: "pause on chest" },
    { type: "link", url: "https://youtu.be/abc", note: "follow along" },
    { type: "link", url: "https://example.com/warmup", label: "Mobility flow" },
  ]);

  it("parseRoutineItems round-trips refs, links and exercises in order", () => {
    const items = parseRoutineItems(doc);
    expect(items).toHaveLength(4);
    expect(items[0]).toEqual({ type: "routine", routineId: "r1", name: "Stretching", note: "after every workout" });
    expect(items[1]).toMatchObject({ name: "Bench", measure: "KG_REPS", note: "pause on chest" });
    expect(items[2]).toEqual({ type: "link", url: "https://youtu.be/abc", note: "follow along" });
    expect(items[3]).toMatchObject({ label: "Mobility flow" });
  });

  it("drops refs without id and links with unsafe/non-http urls", () => {
    const items = parseRoutineItems(
      JSON.stringify([
        { type: "routine", name: "no id" },
        { type: "link", url: "javascript:alert(1)" },
        { type: "link", url: "ftp://x" },
        { type: "link", url: "https://ok.example" },
      ]),
    );
    expect(items).toEqual([{ type: "link", url: "https://ok.example" }]);
  });

  it("parseRoutineExercises filters to exercises only (prefill compatibility)", () => {
    const exercises = parseRoutineExercises(doc);
    expect(exercises).toHaveLength(1);
    expect(exercises[0].name).toBe("Bench");
  });

  it("remapRoutineRefs repoints only mapped refs", () => {
    const items = parseRoutineItems(doc);
    const out = remapRoutineRefs(items, { r1: "copy1", other: "x" });
    expect((out[0] as { routineId: string }).routineId).toBe("copy1");
    expect(out[1]).toEqual(items[1]);
  });

  it("linkLabel prefers the label, then a friendly host, never the raw path", () => {
    expect(linkLabel({ type: "link", url: "https://x.test/p", label: "Warm-up" })).toBe("Warm-up");
    expect(linkLabel({ type: "link", url: "https://www.youtube.com/watch?v=1" })).toBe("YouTube");
    expect(linkLabel({ type: "link", url: "https://youtu.be/1" })).toBe("YouTube");
    expect(linkLabel({ type: "link", url: "https://www.example.org/a/b" })).toBe("example.org");
  });

  it("summarizeItem covers all three kinds", () => {
    const items = parseRoutineItems(doc);
    expect(summarizeItem(items[0])).toBe("↪ Stretching");
    expect(summarizeItem(items[1])).toContain("Bench");
    expect(summarizeItem(items[2])).toBe("🔗 YouTube");
  });
});
