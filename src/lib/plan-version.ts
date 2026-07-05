/**
 * Pure plan-versioning helpers (no server-only import — unit-tested).
 *
 * A user's plan history is a series of Plan rows: each has validFrom and validTo, and exactly
 * one (the current version) has validTo = null. Editing a plan must NEVER mutate a historical
 * version — `savePlan` closes the current version (validTo = now) and creates a new one
 * (validFrom = now), so week scores computed at a past ref keep seeing the old targets.
 */

export type PlanVersion = {
  userId: string;
  validFrom: Date;
  validTo: Date | null;
};

/**
 * The plan version active for `userId` at `ref` (stats/missed use ref = weekStart + 6d, i.e.
 * the END of the week). Rule: validFrom <= ref and (validTo is null or validTo >= ref);
 * newest validFrom wins on overlap.
 *
 * Boundary with savePlan (validTo = validFrom = now on edit): for a past week (ref < now) the
 * closed version still matches and the new one doesn't (validFrom > ref) — history frozen. For
 * the current week (ref = end of week >= now) the closed version no longer covers ref, so the
 * NEW version governs the whole current week. A mid-week change thus applies to the current
 * week — consistent with ref being end-of-week — and never to closed weeks.
 */
export function selectActivePlan<T extends PlanVersion>(
  plans: T[],
  userId: string,
  ref: Date,
): T | undefined {
  return plans
    .filter(
      (p) =>
        p.userId === userId &&
        p.validFrom <= ref &&
        (p.validTo === null || p.validTo >= ref),
    )
    .sort((a, b) => b.validFrom.getTime() - a.validFrom.getTime())[0];
}

export type PlanItemInput = {
  category: string;
  practiceSlotId: string | null;
  targetPerWeek: number;
  note?: string | null;
};

function itemKey(i: PlanItemInput): string {
  return [i.category, i.practiceSlotId ?? "", i.targetPerWeek, i.note ?? ""].join("|");
}

/**
 * Order-insensitive equality of two plan item sets. Used by `savePlan` to skip creating a
 * noise version when a re-save didn't actually change anything.
 */
export function planItemsEqual(a: PlanItemInput[], b: PlanItemInput[]): boolean {
  if (a.length !== b.length) return false;
  const ka = a.map(itemKey).sort();
  const kb = b.map(itemKey).sort();
  return ka.every((k, i) => k === kb[i]);
}
