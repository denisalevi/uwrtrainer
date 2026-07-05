import { describe, it, expect } from "vitest";
import { selectActivePlan, planItemsEqual, type PlanItemInput } from "./plan-version";
import { scoreWeek } from "./scoring";

// Mirrors savePlan's versioning: close the current version at `now`, open a new one at `now`.
function editPlan<T extends { userId: string; validFrom: Date; validTo: Date | null }>(
  plans: (T & { items: PlanItemInput[] })[],
  userId: string,
  now: Date,
  items: PlanItemInput[],
) {
  const active = plans.find((p) => p.userId === userId && p.validTo === null);
  if (active && planItemsEqual(active.items, items)) return;
  if (active) active.validTo = now;
  plans.push({ userId, validFrom: now, validTo: null, items } as T & {
    items: PlanItemInput[];
  });
}

const cardio = (n: number): PlanItemInput => ({
  category: "CARDIO",
  practiceSlotId: null,
  targetPerWeek: n,
});

describe("selectActivePlan (version selection at ref = weekStart + 6d)", () => {
  it("a plan edit today does NOT change last week's items/score, but governs the current week", () => {
    const userId = "u1";
    // June plan: 4 cardio/week. Player only did 2 → poor June scores.
    const plans: { userId: string; validFrom: Date; validTo: Date | null; items: PlanItemInput[] }[] = [
      { userId, validFrom: new Date(2026, 5, 1), validTo: null, items: [cardio(4)] },
    ];

    // Refs: stats.ts uses the END of the week (weekStart + 6d).
    const lastWeekRef = new Date(2026, 5, 28); // Sunday of a June week
    const currentWeekRef = new Date(2026, 6, 5); // Sunday of the week containing the edit

    const before = selectActivePlan(plans, userId, lastWeekRef)!.items;
    const scoreBefore = scoreWeek(
      before.map((i) => ({ category: "CARDIO" as const, target: i.targetPerWeek, done: 2 })),
    );

    // July 1 (mid current week): player lowers the target to 2/week.
    editPlan(plans, userId, new Date(2026, 6, 1, 12, 0), [cardio(2)]);

    // Last week still resolves to the OLD version — score/target unchanged.
    const afterLastWeek = selectActivePlan(plans, userId, lastWeekRef)!.items;
    expect(afterLastWeek).toEqual(before);
    expect(afterLastWeek[0].targetPerWeek).toBe(4);
    const scoreAfter = scoreWeek(
      afterLastWeek.map((i) => ({ category: "CARDIO" as const, target: i.targetPerWeek, done: 2 })),
    );
    expect(scoreAfter).toEqual(scoreBefore);

    // The CURRENT week (ref = end of week, after the edit) sees the new version.
    const current = selectActivePlan(plans, userId, currentWeekRef)!.items;
    expect(current[0].targetPerWeek).toBe(2);
  });

  it("re-saving identical items creates no new version", () => {
    const userId = "u1";
    const plans = [
      { userId, validFrom: new Date(2026, 5, 1), validTo: null as Date | null, items: [cardio(3)] },
    ];
    editPlan(plans, userId, new Date(2026, 6, 1), [cardio(3)]);
    expect(plans).toHaveLength(1);
    expect(plans[0].validTo).toBeNull();
  });

  it("picks nothing before the first version and the newest on overlap; ignores other users", () => {
    const plans = [
      { userId: "u1", validFrom: new Date(2026, 0, 10), validTo: null, items: [cardio(1)] },
      { userId: "u2", validFrom: new Date(2026, 0, 1), validTo: null, items: [cardio(9)] },
    ];
    expect(selectActivePlan(plans, "u1", new Date(2026, 0, 5))).toBeUndefined();
    expect(selectActivePlan(plans, "u1", new Date(2026, 0, 20))?.items[0].targetPerWeek).toBe(1);
  });
});

describe("planItemsEqual", () => {
  const a: PlanItemInput[] = [
    { category: "RUGBY", practiceSlotId: "s1", targetPerWeek: 0 },
    { category: "OTHER", practiceSlotId: null, targetPerWeek: 2, note: "Climbing" },
  ];
  it("is order-insensitive and treats missing note as null", () => {
    expect(planItemsEqual(a, [{ ...a[1] }, { ...a[0], note: null }])).toBe(true);
  });
  it("detects target, note, slot and length changes", () => {
    expect(planItemsEqual(a, [a[0], { ...a[1], targetPerWeek: 3 }])).toBe(false);
    expect(planItemsEqual(a, [a[0], { ...a[1], note: "Yoga" }])).toBe(false);
    expect(planItemsEqual(a, [{ ...a[0], practiceSlotId: "s2" }, a[1]])).toBe(false);
    expect(planItemsEqual(a, [a[0]])).toBe(false);
  });
});
