import { describe, expect, it } from "vitest";
import { competitionRanks } from "./rank";

describe("competitionRanks", () => {
  it("returns 1..n for strictly decreasing values", () => {
    expect(competitionRanks([30, 20, 10])).toEqual([1, 2, 3]);
  });

  it("gives every member of a tied top group rank 1 and skips ranks after it", () => {
    // Issue #29: three players tied on points all get gold; the fourth gets rank 4 (no medal).
    expect(competitionRanks([10, 10, 10, 7])).toEqual([1, 1, 1, 4]);
  });

  it("handles ties below the top", () => {
    expect(competitionRanks([12, 9, 9, 5, 5, 5, 1])).toEqual([1, 2, 2, 4, 4, 4, 7]);
  });

  it("handles empty and single-entry lists", () => {
    expect(competitionRanks([])).toEqual([]);
    expect(competitionRanks([42])).toEqual([1]);
  });
});
