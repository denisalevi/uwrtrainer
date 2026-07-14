// Competition ("1224") ranking for leaderboards: tied values share the best rank, and the
// next distinct value is ranked as if the tied group occupied all the slots above it.

/** Ranks for a list of values already sorted descending. `[10,10,10,7]` → `[1,1,1,4]`. */
export function competitionRanks(values: readonly number[]): number[] {
  const ranks: number[] = [];
  for (let i = 0; i < values.length; i++) {
    ranks.push(i > 0 && values[i] === values[i - 1] ? ranks[i - 1] : i + 1);
  }
  return ranks;
}
