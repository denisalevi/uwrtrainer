import { describe, it, expect } from "vitest";
import { formatSet, toFeedApiEntry, type FeedApiSourceRow } from "./feed-api";

const base: FeedApiSourceRow = {
  date: new Date(2026, 10, 18, 19, 0),
  category: "CARDIO",
  status: "DONE",
  durationMin: 30,
  details: null,
  user: { name: "Anna" },
  practiceSlot: null,
};

describe("formatSet", () => {
  it("matches the in-app rendering", () => {
    expect(formatSet({ weight: 40, reps: 5 })).toBe("40 kg × 5");
    expect(formatSet({ weight: 60, reps: 8, amrap: true })).toBe("60 kg × 8+");
    expect(formatSet({ weight: null, reps: 12 })).toBe("12");
    expect(formatSet({ seconds: 30 })).toBe("30 s");
    expect(formatSet({ weight: 24, seconds: 40 })).toBe("24 kg × 40 s");
    expect(formatSet({})).toBe("—");
  });
});

describe("toFeedApiEntry", () => {
  it("maps a plain session with only feed-visible fields", () => {
    const e = toFeedApiEntry({ ...base, details: JSON.stringify({ zone: "Z2", secret: "x" }) });
    expect(e).toEqual({
      date: "2026-11-18",
      member: "Anna",
      category: "CARDIO",
      status: "DONE",
      durationMin: 30,
      title: null,
      note: "Z2",
    });
    expect(JSON.stringify(e)).not.toContain("secret");
  });

  it("titles a practice by its slot label and an extra practice by its name", () => {
    expect(
      toFeedApiEntry({ ...base, category: "RUGBY", practiceSlot: { label: "Tue pool" } }).title,
    ).toBe("Tue pool");
    expect(
      toFeedApiEntry({
        ...base,
        category: "RUGBY",
        details: JSON.stringify({ kind: "extraPractice", label: "Lake session" }),
      }).title,
    ).toBe("Lake session");
  });

  it("titles a tournament and an OTHER activity", () => {
    expect(
      toFeedApiEntry({ ...base, category: "TOURNAMENT", details: JSON.stringify({ label: "Bundesliga 3" }) })
        .title,
    ).toBe("Bundesliga 3");
    expect(
      toFeedApiEntry({ ...base, category: "OTHER", details: JSON.stringify({ activity: "Climbing", note: "fun" }) }),
    ).toMatchObject({ title: "Climbing", note: "fun" });
  });

  it("includes strength exercises with sets, warm-ups first", () => {
    const e = toFeedApiEntry({
      ...base,
      category: "STRENGTH",
      details: JSON.stringify({
        routineName: "Core A",
        notes: "felt strong",
        exercises: [
          {
            name: "Squat",
            sets: [
              { weight: 80, reps: 5, kind: "main" },
              { weight: 40, reps: 5, kind: "warmup" },
            ],
          },
          { itemType: "link", name: "Mobility video", url: "https://example.com" },
          { sets: [{ reps: 10 }] },
        ],
      }),
    });
    expect(e.title).toBe("Core A");
    expect(e.note).toBe("felt strong");
    expect(e.exercises).toEqual([
      { name: "Squat", sets: ["40 kg × 5", "80 kg × 5"] },
      { name: "Mobility video", sets: [] },
      { name: "Exercise", sets: ["10"] },
    ]);
  });

  it("falls back to the 5/3/1 day name and tolerates malformed details", () => {
    expect(
      toFeedApiEntry({ ...base, category: "STRENGTH", details: JSON.stringify({ dayName: "Day A" }) }),
    ).toMatchObject({ title: "Day A", exercises: [] });
    expect(toFeedApiEntry({ ...base, details: "{not json" })).toMatchObject({ title: null, note: null });
  });

  it("adds miss reasons only when the token opted in", () => {
    const row = { ...base, category: "RUGBY", status: "MISSED", missReason: " sick " };
    expect(toFeedApiEntry(row)).not.toHaveProperty("missReason");
    expect(toFeedApiEntry(row, true).missReason).toBe("sick");
    expect(toFeedApiEntry({ ...row, status: "DONE" }, true)).not.toHaveProperty("missReason");
  });

  it("omits exercises on a missed strength session", () => {
    const e = toFeedApiEntry({ ...base, category: "STRENGTH", status: "MISSED" });
    expect(e.exercises).toBeUndefined();
  });
});
