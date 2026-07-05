# Fix: plan versioning is dead code — plan edits rewrite history

## Problem

`Plan.validFrom`/`validTo` exist and `stats.ts` (`activeItems`) + `missed.ts`
(`reconcileWeekForUser`/`reconcileNonRugbyWeek`) already select the plan version active at
`ref = weekStart + 6d`. But `savePlan` (`src/app/actions/training.ts`) always mutates the single
`validTo: null` plan's items in place — so there is only ever ONE version and editing a plan
retroactively rewrites all historical scores (leaderboards, streaks, week history), visibly
disagreeing with the frozen auto-missed rows (`missed.ts` freeze design).

## Fix

1. **`src/lib/plan-version.ts` (new, pure, unit-testable — no `server-only`)**
   - `planItemsEqual(a, b)`: order-insensitive comparison of item sets
     (`category | practiceSlotId | targetPerWeek | note`).
   - `selectActivePlan(plans, userId, ref)`: the version-selection rule
     (`validFrom <= ref && (validTo == null || validTo >= ref)`, newest `validFrom` wins) —
     extracted from `stats.ts` `activeItems` so it is shared and testable.
2. **`savePlan`**: inside the existing transaction, load the current (`validTo: null`) plan with
   items. If the submitted items equal the current ones → only update user notes (no noise
   version). Otherwise close the current plan (`validTo = now`) and create a new plan
   (`validFrom = now`, `validTo = null`) with the new items. Authorization unchanged (self-only).
   - Boundary note: `stats.ts`/`missed.ts` pick the plan active at `ref = weekStart + 6d`
     (end of week). With `validTo = validFrom = now`, a mid-week edit means the OLD version no
     longer covers the current week's ref (`now < ref`) and the NEW one does — so a mid-week
     change applies to the whole current week, while every past week (`ref < now`) keeps the old
     version. That matches the freeze design.
3. **`src/lib/stats.ts`**: `activeItems` delegates to `selectActivePlan` (behavior identical).
4. **Other consumers** (`plan-editor.tsx`, `team/[userId]/page.tsx`, `missed.ts:58`) already read
   the current version via `validTo: null` (+ `orderBy validFrom desc`); still exactly one open
   plan per user after this change → no code change needed (verified by grep).
5. **Tests `src/lib/plan-version.test.ts`**: `planItemsEqual` cases + regression proving a plan
   edit "today" does not change last week's selected items / `scoreWeek` result, and does apply
   to the current week.

## Checklist

- [x] Plan doc committed
- [x] `src/lib/plan-version.ts` + tests
- [x] `stats.ts` uses shared selector
- [x] `savePlan` versions properly (one transaction, no noise versions)
- [x] `npx vitest run` green
- [x] `npm run build` (webpack) green
