import { describe, it, expect } from "vitest";
import {
  buildLeaderboards,
  parseGoalsRange,
  sortGoalsMembers,
  toGoalsApiMember,
  toGoalsApiMonthMember,
  type GoalsSourceMonth,
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
  const extra = { streak: 2, rugbyPractices: 5, primaryPractices: 3, totalSessions: 9 };

  it("sums points, averages adherence over planned weeks, flags the running week", () => {
    const m = toGoalsApiMember(
      "Anna",
      [
        week(new Date(2026, 10, 9), 1, 100, {
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
      points: 150,
      avgAdherencePct: 75,
      weeksWithPlan: 2,
      fullWeeks: 1,
      streak: 2,
      rugbyPractices: 5,
      primaryPractices: 3,
      totalSessions: 9,
      plannedSessions: 3,
      reachedSessions: 3,
    });
    expect(m.weeks[0]).toEqual({
      weekStart: "2026-11-09",
      complete: true,
      hasPlan: true,
      exempt: false,
      adherencePct: 100,
      points: 100,
      goals: [
        { category: "RUGBY", cadence: "WEEK", practice: "Tue pool", tier: "PRIMARY", target: 1, done: 1 },
        { category: "STRENGTH", cadence: "WEEK", practice: null, tier: null, target: 2, done: 3 },
      ],
    });
    expect(m.weeks[1].complete).toBe(false);
    expect(m.weeks[2].adherencePct).toBeNull();
    expect(m.weeks).toHaveLength(3);
  });

  it("null average without any plan", () => {
    const m = toGoalsApiMember("Bo", [], { streak: 0, rugbyPractices: 0, primaryPractices: 0, totalSessions: 0 }, now);
    expect(m.avgAdherencePct).toBeNull();
    expect(m.points).toBe(0);
  });
});

describe("leaderboards", () => {
  const mk = (member: string, points: number, rugbyPractices: number, streak = 0) =>
    toGoalsApiMember(member, [week(new Date(2026, 10, 9), 1, points)], { streak, rugbyPractices, primaryPractices: 0, totalSessions: 0 }, now);

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

describe("toGoalsApiMonthMember (month view)", () => {
  const month = (y: number, m: number, target: number, reached: number, points: number): GoalsSourceMonth => ({
    monthStart: new Date(y, m, 1),
    goals: [
      { category: "CARDIO", label: null, cadence: "WEEK", planned: 2, target: 8, done: 7 },
      { category: "OTHER", label: "Climbing", cadence: "MONTH", planned: 3, target: 3, done: 3 },
    ],
    score: { adherencePct: target ? reached / target : 0, target, reached, points, hasPlan: target > 0 },
  });
  const extra = { streak: 1, rugbyPractices: 4, primaryPractices: 2, totalSessions: 12 };

  it("maps months and goals, with the final % over the period", () => {
    const m = toGoalsApiMonthMember("Ann", [month(2026, 9, 11, 10, 91), month(2026, 10, 11, 11, 100), month(2026, 11, 11, 0, 0)], extra, now);
    expect(m.months.map((x) => x.month)).toEqual(["2026-10", "2026-11"]); // December not started
    expect(m.months[0].complete).toBe(true);
    expect(m.months[1].complete).toBe(false);
    expect(m.months[0].adherencePct).toBe(91);
    expect(m.months[0].goals[0]).toEqual({
      category: "CARDIO", label: null, cadence: "WEEK", planned: 2, target: 8, done: 7, reached: false,
    });
    expect(m.months[0].goals[1]).toMatchObject({ cadence: "MONTH", label: "Climbing", reached: true });
    expect(m).toMatchObject({
      member: "Ann",
      points: 191,
      plannedSessions: 22,
      reachedSessions: 21,
      adherencePct: 95,
      totalSessions: 12,
      streak: 1,
    });
  });

  it("null % without any plan; works in the shared leaderboards", () => {
    const empty = toGoalsApiMonthMember("Bo", [], extra, now);
    expect(empty.adherencePct).toBeNull();
    const boards = buildLeaderboards(sortGoalsMembers([empty, toGoalsApiMonthMember("Ann", [month(2026, 10, 11, 11, 100)], extra, now)]));
    expect(boards.ADHERENCE_POINTS).toEqual([{ rank: 1, member: "Ann", value: 100 }]);
  });
});
