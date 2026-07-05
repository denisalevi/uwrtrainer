# Strength logger: session timer, auto-done, weight rounding

Branch: `claude/feat-strength-logger` (base: `claude/github-repo-pr-review-pm3thx`).
Status: ALL THREE FEATURES SHIPPED (tests + webpack build green).

## 1. Session timer + duration prefill (owner request)

- [x] `strength-workout-logger.tsx`: record wall-clock `startedAt` (ms epoch) in the
      autosaved details JSON on first real interaction (day pick or first set-field edit).
      Restore it from `restoreLines`-adjacent parse on resume. Kept in a ref (autosave
      closures are debounced) + state for display.
- [x] Elapsed readout near the duration field: recompute `Date.now() - startedAt` on a 1s
      tick **and** on `visibilitychange` (phones lock between sets) — never an interval counter.
- [x] Finish: if `durationMin` empty and `startedAt` present, prefill `round(elapsed min)`.
      Also a small "use timer: NN min" tap-to-fill next to the field. Never overwrite a
      manually entered duration. Old sessions without `startedAt` behave as before.
- i18n: `strength.elapsed`, `strength.useTimer` (en+de).

## 2. Auto-mark exercise done when all sets filled (#11)

- [x] In `setField`, when a reps value is entered and afterwards every set of the line has
      reps: auto-set `done`. Only auto-set, never auto-clear (deleting a rep doesn't untick).
- [x] Manual toggles record the line key in a `doneTouched` ref (component state only);
      auto-set skips touched lines, so a manual untick sticks.

## 3. Configurable weight rounding (#4)

- [x] Schema: `User.weightRounding` String default `"DOWN"` (`EXACT|DOWN|NEAREST|UP`),
      `User.weightIncrement` Float default 2.5. Hand-written migration
      (`ALTER TABLE ... ADD COLUMN` with defaults — same pattern as rest-timer migration).
- [x] `src/lib/strength.ts`: pure `roundWeight(value, mode, increment)`; thread a
      `{ mode, increment }` rounding option through `workoutForSlot`/`buildSchedule`
      (currently unused `rounding` opt) + warm-up/BBB set builders. Unit tests.
- [x] Settings section (pattern: rest-timer section) + server action (DAL re-check).
- [x] Thread user pref into `/strength` page + `/strength/log` page set computation.
- [x] `EXACT`: unrounded weights + i18n info note (round down at the rack; below ~20 kg use
      the empty bar). Setting description keeps Wendler's round-down hint.
- Default is DOWN (owner preference), not NEAREST (old behaviour used Math.round).
- Shipped in full, including EXACT (unrounded + rack-side note on /strength and /strength/log).

## Decisions

- `startedAt` lives inside `details` JSON (survives reload/resume; no schema change).
- `doneTouched` is deliberately NOT persisted (component state only, per spec).
- Rounding default DOWN = Wendler's recommendation; existing `StrengthProgram.rounding`
  column stays the increment source only if user increment unset — we use per-user
  `weightIncrement` instead as the single source for display rounding.
