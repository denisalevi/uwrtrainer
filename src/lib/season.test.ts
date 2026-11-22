import { describe, it, expect } from "vitest";
import { resolveSeason, seasonLabel, validateSeason } from "./season";

const now = new Date(2026, 10, 22, 12);

describe("season", () => {
  it("resolves a configured season with an exclusive end", () => {
    const s = resolveSeason("2026-11-01", "2027-05-12", now);
    expect(s).toMatchObject({ configured: true, since: "2026-11-01", until: "2027-05-12" });
    expect(s.start).toEqual(new Date(2026, 10, 1));
    expect(s.end).toEqual(new Date(2027, 4, 13));
    expect(seasonLabel(s)).toBe("1.11.–12.5.");
  });

  it("falls back to the calendar year when unset or invalid", () => {
    for (const s of [resolveSeason(null, null, now), resolveSeason("2027-01-01", "2026-01-01", now)]) {
      expect(s).toMatchObject({ configured: false, since: "2026-01-01", until: "2026-12-31" });
    }
  });

  it("validates input", () => {
    expect(validateSeason("2026-11-01", "2027-05-12")).toEqual({ start: "2026-11-01", end: "2027-05-12" });
    expect(validateSeason("2026-11-01", "2026-11-01")).not.toBeNull();
    expect(validateSeason("2026-11-02", "2026-11-01")).toBeNull();
    expect(validateSeason("2026-02-30", "2026-11-01")).toBeNull();
    expect(validateSeason("2026-01-01", "2029-01-01")).toBeNull();
    expect(validateSeason("", "2026-11-01")).toBeNull();
  });
});
