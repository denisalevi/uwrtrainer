import { describe, it, expect } from "vitest";
import {
  buildLeaderboards,
  parseGoalsRange,
  sortGoalsMembers,
  toGoalsApiMember,
  type GoalsSourceWeek,
} from "./goals-api";

const now = new Date(2026, 10, 22, 12, 0); // Sun 2026-11-22, local

describe("parseGoalsRange", () => {
  const q = (o: Partial<Record<"period" | "date" | "since" | "until", string>>) => ({
    period: o.period ?? null,
    date: o.date ?? null,
    since: o.since ?? null,
    until: o.until ?? null,
  });

  it("defaults to this week (Mon–Sun)", () => {
    const r = parseGoalsRange(q({}), now);
    if ("error" in r) throw new Error(r.error);
    expect(r).toMatchObject({ period: "week", since: "2026-11-16", until: "2026-11-22" });
    expect(r.start).toEqual(new Date(2026, 10, 16));
    expect(r.end).toEqual(new Date(2026, 10, 23));
  });

  it("calendar month around a date, like the leaderboard", () => {
    const r = parseGoalsRange(q({ period: "month", date: "2026-10-15" }), now);
    if ("error" in r) throw new Error(r.error);
    expect(r).toMatchObject({ period: "month", since: "2026-10-01", until: "2026-10-31" });
    expect(r.end).toEqual(new Date(2026, 10, 1));
  });

  it("year", () => {
    const r = parseGoalsRange(q({ period: "year" }), now);
    if ("error" in r) throw new Error(r.error);
    expect(r).toMatchObject({ since: "2026-01-01", until: "2026-12-31" });
  });

  it("custom since/until", () => {
    const r = parseGoalsRange(q({ since: "2026-11-01", until: "2026-11-14" }), now);
    if ("error" in r) throw new Error(r.error);
    expect(r).toMatchObject({ period: "custom", since: "2026-11-01", until: "2026-11-14" });
  });

  it("rejects bad input and mixing", () => {
    expect(parseGoalsRange(q({ period: "decade" }), now)).toHaveProperty("error");
    expect(parseGoalsRange(q({ period: "month", date: "15.10.2026" }), now)).toHaveProperty("error");
    expect(parseGoalsRange(q({ period: "month", since: "2026-11-01" }), now)).toHaveProperty("error");
    expect(parseGoalsRange(q({ since: "2026-01-01", until: "2026-11-01" }), now)).toHaveProperty("error");
  });
});

const week = (
  d: Date,
  pct: number,
  points: number,
  opts: Partial<GoalsSourceWeek> = {},
): GoalsSourceWeek => ({
  weekStart: d,
  exempt: false,
  score: { adherencePct: pct, points, hasPlan: true },
  items: [],
  ...opts,
});

describe("toGoalsApiMember", () => {
  const extra = { streak: 2, rugbyPractices: 5, primaryPractices: 3 };

  it("sums points, averages adherence over planned weeks, flags the running week", () => {
    const m = toGoalsApiMember(
      "Anna",
      [
        week(new Date(2026, 10, 9), 1, 104, {
          items: [
            { category: "RUGBY", tier: "PRIMARY", target: 1, done: 1, label: "Tue pool" },
            { category: "STRENGTH", tier: null, target: 2, done: 3, label: null },
            { category: "RUGBY", tier: "SECONDARY", target: 0, done: 0, label: "Summer lake" },
          ],
        }),
        week(new Date(2026, 10, 16), 0.5, 50),
        { ...week(new Date(2026, 10, 2), 0, 0), score: { adherencePct: 0, points: 0, hasPlan: false } },
        week(new Date(2026, 10, 23), 0, 0), // not started yet: dropped
      ],
      extra,
      now,
    );
    expect(m).toMatchObject({
      member: "Anna",
      points: 154,
      avgAdherencePct: 75,
      weeksWithPlan: 2,
      fullWeeks: 1,
      streak: 2,
      rugbyPractices: 5,
      primaryPractices: 3,
    });
    expect(m.weeks[0]).toEqual({
      weekStart: "2026-11-09",
      complete: true,
      hasPlan: true,
      exempt: false,
      adherencePct: 100,
      points: 104,
      goals: [
        { category: "RUGBY", practice: "Tue pool", tier: "PRIMARY", target: 1, done: 1 },
        { category: "STRENGTH", practice: null, tier: null, target: 2, done: 3 },
      ],
    });
    expect(m.weeks[1].complete).toBe(false);
    expect(m.weeks[2].adherencePct).toBeNull();
    expect(m.weeks).toHaveLength(3);
  });

  it("null average without any plan", () => {
    const m = toGoalsApiMember("Bo", [], { streak: 0, rugbyPractices: 0, primaryPractices: 0 }, now);
    expect(m.avgAdherencePct).toBeNull();
    expect(m.points).toBe(0);
  });
});

describe("leaderboards", () => {
  const mk = (member: string, points: number, rugbyPractices: number, streak = 0) =>
    toGoalsApiMember(member, [week(new Date(2026, 10, 9), 1, points)], { streak, rugbyPractices, primaryPractices: 0 }, now);

  it("sorts members and ranks with ties, dropping zero values", () => {
    const members = sortGoalsMembers([mk("Cem", 50, 2), mk("Anna", 100, 2, 3), mk("Bo", 100, 0)]);
    expect(members.map((m) => m.member)).toEqual(["Anna", "Bo", "Cem"]);
    const lb = buildLeaderboards(members);
    expect(lb.ADHERENCE_POINTS).toEqual([
      { rank: 1, member: "Anna", value: 100 },
      { rank: 1, member: "Bo", value: 100 },
      { rank: 3, member: "Cem", value: 50 },
    ]);
    expect(lb.RUGBY_PRACTICES.map((r) => r.member)).toEqual(["Anna", "Cem"]);
    expect(lb.PRIMARY_PRACTICES).toEqual([]);
    expect(lb.STREAK).toEqual([{ rank: 1, member: "Anna", value: 3 }]);
  });
});
