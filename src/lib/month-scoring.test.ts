import { describe, it, expect } from "vitest";
import { combineMonths, monthTargetForPart, monthTargetFromWeekly, scoreMonthGoals } from "./month-scoring";

describe("monthTargetFromWeekly", () => {
  it("rounds weekly target × days / 7 down", () => {
    expect(monthTargetFromWeekly([{ target: 2, days: 30 }])).toBe(8); // 8.57
    expect(monthTargetFromWeekly([{ target: 2, days: 31 }])).toBe(8); // 8.86
    expect(monthTargetFromWeekly([{ target: 3, days: 28 }])).toBe(12); // exact, no float slip
    expect(monthTargetFromWeekly([{ target: 1, days: 31 }])).toBe(4);
  });

  it("adds up per-week shares (plan change, exempt week left out)", () => {
    // 2/week for 14 days, then 4/week for 16 days.
    expect(monthTargetFromWeekly([{ target: 2, days: 7 }, { target: 2, days: 7 }, { target: 4, days: 16 }])).toBe(13);
    expect(monthTargetFromWeekly([])).toBe(0);
  });
});

describe("scoreMonthGoals", () => {
  it("is reached / target with each goal capped, 100 points when fully kept", () => {
    const s = scoreMonthGoals([
      { target: 8, done: 7 },
      { target: 3, done: 3 },
    ]);
    expect(s.target).toBe(11);
    expect(s.reached).toBe(10);
    expect(s.adherencePct).toBeCloseTo(10 / 11);
    expect(s.points).toBe(91);
    expect(s.hasPlan).toBe(true);
    expect(scoreMonthGoals([{ target: 8, done: 8 }]).points).toBe(100);
  });

  it("overshoot can't cover another goal's gap and earns no bonus", () => {
    const s = scoreMonthGoals([
      { target: 4, done: 10 },
      { target: 4, done: 2 },
    ]);
    expect(s.reached).toBe(6);
    expect(s.adherencePct).toBe(0.75);
    expect(s.points).toBe(75);
  });

  it("no plan → 0", () => {
    expect(scoreMonthGoals([]).hasPlan).toBe(false);
    expect(scoreMonthGoals([{ target: 0, done: 3 }]).points).toBe(0);
  });
});

describe("combineMonths", () => {
  it("weights the % by planned sessions; points = that %, max 100", () => {
    const c = combineMonths([scoreMonthGoals([{ target: 8, done: 8 }]), scoreMonthGoals([{ target: 2, done: 0 }])]);
    expect(c.points).toBe(80);
    expect(combineMonths([scoreMonthGoals([{ target: 8, done: 9 }]), scoreMonthGoals([{ target: 2, done: 2 }])]).points).toBe(100);
    expect(c.target).toBe(10);
    expect(c.reached).toBe(8);
    expect(c.adherencePct).toBe(0.8);
    expect(combineMonths([]).adherencePct).toBeNull();
  });
});

describe("monthTargetForPart (season edges)", () => {
  it("keeps the full target for a whole month and rounds a part down", () => {
    expect(monthTargetForPart(6, 31, 31)).toBe(6);
    expect(monthTargetForPart(6, 12, 31)).toBe(2); // 2.32
    expect(monthTargetForPart(3, 0, 30)).toBe(0);
  });
});
