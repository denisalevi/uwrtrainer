# Changelog

All notable changes to UWR Trainer are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/), and the project
uses [Semantic Versioning](https://semver.org/). While we're pre-1.0, a new **minor**
(0.**x**.0) marks a shipped feature batch and a **patch** (0.x.**y**) marks fixes/tweaks.
`1.0.0` is reserved for the first "team-ready" release.

Release process: `npm version <patch|minor>` (bumps `package.json` and creates the
`vX.Y.Z` git tag), then `git push --follow-tags`.

## [Unreleased]

## [0.3.0] - 2026-06-03

### Added
- **Edit & delete logged sessions** — recent sessions on the dashboard are now tappable,
  opening an editable form (`/log/[id]`) with a delete option.
- **Strength pre-fill when logging** — picking *Strength* offers this week's movements from
  your program and fills in sets/reps/weight (works for weighted and bodyweight).
- **Strength page navigation** — back-to-plan and settings links, plus an in-place
  **program settings** editor (equipment / days / session length).

## [0.2.0] - 2026-06-03

### Added
- **Strength program engine** (`src/lib/strength.ts`): a Wendler 5/3/1-style training
  model that also works with **no equipment at all**. Pure & unit-tested. Supports three
  progression modes — loaded barbell (weights), bodyweight reps, and bodyweight difficulty
  levels — a 4-week wave, an AMRAP test set that estimates your max, and an adjustment rule
  (increase / hold / reduce) instead of a hard "pass/fail".
- **`StrengthProgram` data model** storing per-movement training maxima, equipment, and the
  current cycle/week.
- **Strength setup wizard** with day-count and session-length dropdowns and a true
  zero-equipment quick start, plus a per-session workout view.
- **In-app version** shown in Settings.
- Training-logic documentation: [`TRAINING.md`](TRAINING.md), linked from the README.

## [0.1.0] - 2026-05-29

Initial build (pre-versioning baseline): auth, plans, session logging, adherence scoring,
leaderboards, trainer tools, PWA, i18n (en/de), Docker deployment.
