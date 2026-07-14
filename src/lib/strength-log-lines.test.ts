import { describe, expect, it } from "vitest";
import {
  CUSTOM_LINE_ID,
  hasUserInput,
  restoreLines,
  seedLines,
  switchExercise,
  type Line,
  type LoggerDay,
  type Suggestion,
} from "./strength-log-lines";

const squat: Suggestion = {
  id: "slot-0",
  movement: "SQUAT",
  week: 2,
  cycle: 3,
  label: "Back squat",
  trainingMax: 100,
  sets: [
    { reps: 3, weight: 70, amrap: false, kind: "main", pct: 0.7 },
    { reps: 3, weight: 80, amrap: false, kind: "main", pct: 0.8 },
    { reps: 3, weight: 90, amrap: true, kind: "main", pct: 0.9 },
  ],
  bbbWeight: 60,
};
const pullup: Suggestion = {
  id: "slot-1",
  movement: "PULLV",
  week: 1,
  label: "Weighted pull-up",
  trainingMax: 10,
  sets: [
    { reps: 5, weight: 6, amrap: false, kind: "main", pct: 0.65 },
    { reps: 5, weight: 7.5, amrap: true, kind: "main", pct: 0.75 },
  ],
};
const day: LoggerDay = { id: "day-1", name: "Station 1", minutes: 45, suggestions: [squat, pullup] };
const suggestions = day.suggestions;

/** A seeded line with reps typed into every set (what an athlete mid-workout looks like). */
function filledLine(sug: Suggestion): Line {
  const [l] = seedLines({ ...day, suggestions: [sug] });
  return { ...l, sets: l.sets.map((s, i) => ({ ...s, reps: String(5 - i) })), done: true };
}

describe("switchExercise — typed values must never be lost", () => {
  it("carries the current rows into a custom exercise (nothing visibly resets)", () => {
    const l = filledLine(squat);
    const next = switchExercise(l, CUSTOM_LINE_ID, suggestions);
    expect(next.exerciseId).toBe(CUSTOM_LINE_ID);
    expect(next.sets).toEqual(l.sets);
    expect(next.name).toBe("Back squat"); // editable, but not blanked
    // custom must not drive progression
    expect(next.movement).toBeUndefined();
    expect(next.week).toBeUndefined();
    expect(next.cycle).toBeUndefined();
  });

  it("restores the exact typed rows when switching back to the plan exercise", () => {
    const l = filledLine(squat);
    const away = switchExercise(l, CUSTOM_LINE_ID, suggestions);
    // athlete edits while on custom
    const edited: Line = {
      ...away,
      name: "Front squat",
      sets: away.sets.map((s) => ({ ...s, weight: "50" })),
    };
    const back = switchExercise(edited, squat.id, suggestions);
    expect(back.exerciseId).toBe(squat.id);
    expect(back.name).toBe("Back squat");
    expect(back.sets).toEqual(l.sets); // original typed reps/weights, verbatim
    expect(back.movement).toBe("SQUAT");
    expect(back.week).toBe(2);
    expect(back.cycle).toBe(3);
    expect(back.trainingMax).toBe(100);
  });

  it("round-trips custom edits too (custom → plan → custom)", () => {
    const l = filledLine(squat);
    const custom: Line = {
      ...switchExercise(l, CUSTOM_LINE_ID, suggestions),
      name: "Zercher squat",
      sets: [{ weight: "40", reps: "12", kind: "main" }],
    };
    const away = switchExercise(custom, pullup.id, suggestions);
    expect(away.name).toBe("Weighted pull-up");
    const back = switchExercise(away, CUSTOM_LINE_ID, suggestions);
    expect(back.name).toBe("Zercher squat");
    expect(back.sets).toEqual([{ weight: "40", reps: "12", kind: "main" }]);
  });

  it("first visit to another plan exercise seeds its prescribed sets, not stale rows", () => {
    const l = filledLine(squat);
    const next = switchExercise(l, pullup.id, suggestions);
    expect(next.sets.map((s) => s.weight)).toEqual(["6", "7.5"]);
    expect(next.sets.every((s) => s.reps === "")).toBe(true);
    expect(next.done).toBe(false);
  });

  it("re-picking the same exercise is a no-op", () => {
    const l = filledLine(squat);
    expect(switchExercise(l, squat.id, suggestions)).toBe(l);
  });
});

describe("restoreLines — resume/edit re-links plan exercises", () => {
  const savedSets = [
    { weight: 70, reps: 5, kind: "main", amrap: false },
    { weight: 80, reps: null, kind: "main", amrap: true },
  ];

  it("re-links via the saved exerciseId (picker + %-of-max survive a reload)", () => {
    const [l] = restoreLines(
      { exercises: [{ exerciseId: "slot-0", name: "Back squat", movement: "SQUAT", week: 2, cycle: 3, sets: savedSets }] },
      day,
    );
    expect(l.exerciseId).toBe("slot-0");
    expect(l.movement).toBe("SQUAT");
    expect(l.week).toBe(2);
    expect(l.cycle).toBe(3);
    expect(l.sets).toEqual([
      { weight: "70", reps: "5", kind: "main", amrap: false },
      { weight: "80", reps: "", kind: "main", amrap: true },
    ]);
  });

  it("falls back to a label match for legacy saves without exerciseId", () => {
    const [l] = restoreLines({ exercises: [{ name: "Weighted pull-up", sets: savedSets }] }, day);
    expect(l.exerciseId).toBe("slot-1");
  });

  it("respects an explicitly saved custom choice even when the name matches a label", () => {
    const [l] = restoreLines(
      { exercises: [{ exerciseId: CUSTOM_LINE_ID, name: "Back squat", sets: savedSets }] },
      day,
    );
    expect(l.exerciseId).toBe(CUSTOM_LINE_ID);
  });

  it("degrades to custom when the saved id no longer exists or there is no day", () => {
    const [stale] = restoreLines({ exercises: [{ exerciseId: "slot-9", name: "X", sets: [] }] }, day);
    expect(stale.exerciseId).toBe(CUSTOM_LINE_ID);
    const [noDay] = restoreLines({ exercises: [{ exerciseId: "slot-0", name: "X", sets: [] }] }, undefined);
    expect(noDay.exerciseId).toBe(CUSTOM_LINE_ID);
  });
});

describe("hasUserInput — guards the day switcher", () => {
  it("is false for freshly seeded lines (weights are pre-filled, reps are not input yet)", () => {
    expect(hasUserInput(seedLines(day))).toBe(false);
  });

  it("is true once any reps are typed, or a custom exercise is named", () => {
    const seeded = seedLines(day);
    const withReps = seeded.map((l, i) =>
      i === 0 ? { ...l, sets: l.sets.map((s, j) => (j === 0 ? { ...s, reps: "5" } : s)) } : l,
    );
    expect(hasUserInput(withReps)).toBe(true);
    expect(
      hasUserInput([{ key: "k", exerciseId: CUSTOM_LINE_ID, name: "Dips", sets: [] }]),
    ).toBe(true);
  });
});
