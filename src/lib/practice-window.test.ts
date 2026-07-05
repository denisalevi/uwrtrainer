import { describe, it, expect } from "vitest";
import {
  isSlotAvailableOn,
  practiceDateInWeek,
  isSlotInSeasonForWeek,
} from "@/lib/practice-window";
import { startOfWeek } from "@/lib/dates";

const d = (s: string) => {
  const [y, m, day] = s.split("-").map(Number);
  return new Date(y, m - 1, day);
};

describe("isSlotAvailableOn", () => {
  it("is always available (when active) with an open-ended window", () => {
    expect(isSlotAvailableOn({ active: true, validFrom: null, validTo: null }, d("2026-07-06"))).toBe(
      true,
    );
  });

  it("is never available when deactivated, even inside the window", () => {
    expect(
      isSlotAvailableOn(
        { active: false, validFrom: d("2026-01-01"), validTo: d("2026-12-31") },
        d("2026-07-06"),
      ),
    ).toBe(false);
  });

  it("treats both bounds as inclusive by calendar day", () => {
    const slot = { active: true, validFrom: d("2026-06-01"), validTo: d("2026-09-30") };
    expect(isSlotAvailableOn(slot, d("2026-06-01"))).toBe(true);
    expect(isSlotAvailableOn(slot, d("2026-09-30"))).toBe(true);
    expect(isSlotAvailableOn(slot, d("2026-05-31"))).toBe(false);
    expect(isSlotAvailableOn(slot, d("2026-10-01"))).toBe(false);
  });

  it("supports open-start and open-end windows", () => {
    expect(
      isSlotAvailableOn({ active: true, validFrom: null, validTo: d("2026-03-31") }, d("2026-01-15")),
    ).toBe(true);
    expect(
      isSlotAvailableOn({ active: true, validFrom: d("2026-10-01"), validTo: null }, d("2026-09-30")),
    ).toBe(false);
  });
});

describe("practiceDateInWeek / isSlotInSeasonForWeek", () => {
  // Week of Monday 2026-07-06 .. Sunday 2026-07-12.
  const monday = startOfWeek(d("2026-07-08"));

  it("maps a weekday to the right calendar date within the week", () => {
    expect(practiceDateInWeek(monday, 1).getDate()).toBe(6); // Monday
    expect(practiceDateInWeek(monday, 2).getDate()).toBe(7); // Tuesday
    expect(practiceDateInWeek(monday, 0).getDate()).toBe(12); // Sunday
  });

  it("is in season when the week's occurrence falls inside the window", () => {
    const tue = { active: true, dayOfWeek: 2, validFrom: d("2026-07-07"), validTo: null };
    expect(isSlotInSeasonForWeek(tue, monday)).toBe(true); // Tuesday is 07-07
  });

  it("is out of season when the occurrence is before the window opens", () => {
    const tue = { active: true, dayOfWeek: 2, validFrom: d("2026-07-08"), validTo: null };
    expect(isSlotInSeasonForWeek(tue, monday)).toBe(false); // Tuesday 07-07 < 07-08
  });
});
