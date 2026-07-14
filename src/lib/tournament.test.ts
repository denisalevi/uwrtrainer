import { describe, expect, it } from "vitest";
import { startOfWeek, addWeeks } from "./dates";
import { exemptWeekStarts, tournamentLabel } from "./tournament";
import { applyWeekExemption, scoreWeek, fullAdherenceStreak, DEFAULT_SCORING } from "./scoring";

// A Saturday game — the typical case (weeks are Monday-based, so its week IS the run-up week).
const saturday = new Date(2026, 6, 18); // 2026-07-18, a Saturday
const gameWeek = startOfWeek(saturday).getTime();
const weekAfter = addWeeks(startOfWeek(saturday), 1).getTime();

describe("exemptWeekStarts", () => {
  it("NONE exempts nothing", () => {
    expect(exemptWeekStarts([saturday], "NONE").size).toBe(0);
  });

  it("WEEK_OF exempts the week leading up to the game", () => {
    const weeks = exemptWeekStarts([saturday], "WEEK_OF");
    expect(weeks.has(gameWeek)).toBe(true);
    expect(weeks.has(weekAfter)).toBe(false);
  });

  it("WEEK_OF_AND_AFTER also exempts the following week", () => {
    const weeks = exemptWeekStarts([saturday], "WEEK_OF_AND_AFTER");
    expect(weeks.has(gameWeek)).toBe(true);
    expect(weeks.has(weekAfter)).toBe(true);
    expect(weeks.size).toBe(2);
  });

  it("a Sunday game exempts the same (Mon–Sun) week as the days before it", () => {
    const sunday = new Date(2026, 6, 19);
    expect(exemptWeekStarts([sunday], "WEEK_OF").has(gameWeek)).toBe(true);
  });

  it("merges multiple tournaments", () => {
    const other = addWeeks(saturday, 3);
    const weeks = exemptWeekStarts([saturday, other], "WEEK_OF");
    expect(weeks.size).toBe(2);
    expect(weeks.has(startOfWeek(other).getTime())).toBe(true);
  });
});

describe("applyWeekExemption", () => {
  it("lifts an under-adhered week to full base points and 100% adherence", () => {
    const score = scoreWeek([{ category: "RUGBY", target: 2, done: 0 }]);
    const exempt = applyWeekExemption(score);
    expect(exempt.points).toBe(DEFAULT_SCORING.basePoints);
    expect(exempt.adherencePct).toBe(1);
    expect(exempt.hasPlan).toBe(true);
  });

  it("never makes a week WORSE — a fully adhered week keeps its overshoot bonus", () => {
    const score = scoreWeek([{ category: "RUGBY", target: 2, done: 4 }]);
    expect(score.points).toBeGreaterThan(DEFAULT_SCORING.basePoints);
    expect(applyWeekExemption(score).points).toBe(score.points);
  });

  it("does nothing for a plan-less week (there is nothing to exempt)", () => {
    const score = scoreWeek([]);
    expect(applyWeekExemption(score)).toEqual(score);
  });

  it("keeps the streak alive through a tournament week", () => {
    // 3 full weeks, then a tournament week with nothing logged (exempted), then a full week.
    const pcts = [1, 1, 1, applyWeekExemption(scoreWeek([{ category: "RUGBY", target: 2, done: 0 }])).adherencePct, 1];
    expect(fullAdherenceStreak(pcts)).toBe(5);
  });
});

describe("tournamentLabel", () => {
  it("reads the label out of the details JSON", () => {
    expect(tournamentLabel(JSON.stringify({ kind: "tournament", label: "vs Berlin" }))).toBe("vs Berlin");
    expect(tournamentLabel(JSON.stringify({ kind: "tournament" }))).toBeNull();
    expect(tournamentLabel("not json")).toBeNull();
    expect(tournamentLabel(null)).toBeNull();
  });
});
