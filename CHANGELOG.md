# Changelog

All notable changes to UWR Trainer are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/), and the project
uses [Semantic Versioning](https://semver.org/). While we're pre-1.0, a new **minor**
(0.**x**.0) marks a shipped feature batch and a **patch** (0.x.**y**) marks fixes/tweaks.
`1.0.0` is reserved for the first "team-ready" release.

Release process: `npm version <patch|minor>` (bumps `package.json` and creates the
`vX.Y.Z` git tag), then `git push --follow-tags`.

## [Unreleased]

## [0.8.0] - 2026-06-03

### Changed
- **Auto-laid-out training week.** You no longer hand-build each day. You set **how many days**
  and each day's **equipment** + **length**, and the app distributes the four Wendler lifts for
  you, following two rules: **weighted days are split** (each lift loaded once a week, using the
  spreadsheet's squat+bench / deadlift+press pairing), while **bodyweight days are full-body**
  (all four patterns every session, because bodyweight gains from frequency, not heavy singles).
- **Equipment is now per day**, so you can mix — e.g. one weighted day + one bodyweight day. A
  quick top choice still sets every day at once.
- A live **plan preview** shows exactly what each day becomes as you edit.

### Added
- **One-weighted-day layouts:** *Alternate (2-week)* — squat+bench then deadlift+press, each lift
  loaded biweekly (the plan shows week A / week B) — or *All-in-one*, all four loaded in one long
  session weekly.
- **Pull rides a pressing day** automatically (the lightest one, never the deadlift day) instead
  of taking its own session.
- **Comfortable session-length suggestions** per schedule.
- **Notes for your trainer** — a free-text box on the plan for things the settings can't capture.

## [0.7.0] - 2026-06-03

### Changed
- **Much simpler strength setup.** Replaced the per-day multi-select of seven tools with a single
  top-level choice — **"I have weights"** or **"Bodyweight only"** — that preselects a sensible
  default exercise for every movement (the classic barbell Wendler lifts, or the bodyweight
  ladders). Bodyweight assumes a pull-up bar.
- **Exercise slots with a Modify picker.** Each training day is now a list of preselected
  exercise slots. Any slot's **Modify** button opens alternatives grouped *With weights*
  (barbell / dumbbell / kettlebell) and *Without weights* (bodyweight), plus *type-your-own* — so
  you can swap a single exercise (even from weighted to bodyweight) without changing the rest.
- **Maxima are inline and shared per movement.** One clearly-labelled field per movement
  (working weight in kg, or rep target) right on the slot — no more cramped double-rows or a
  separate maxima block. The same movement on two days stays in sync.
- **Adding a day copies the previous day** (exercises + length), so you don't re-enter everything.
- **Clearer "extra volume".** Sessions of 60 min+ add Boring But Big (5×10 at ~50 %); shorter
  ones drop it and keep the main 5/3/1 sets — explained inline and in the help panel.

### Added
- **Trainer setting: include a pull movement.** A team-wide toggle (on by default) controls
  whether default plans add a row / pull-up, or stick to the classic four-lift Wendler
  (squat / bench / deadlift / press).
- **Dumbbell & kettlebell exercise variants** for every movement, in English and German.

### Removed
- The per-day tool multi-select and the standalone "Your maxima" section.

## [0.6.0] - 2026-06-03

### Changed
- **Per-day, flexible strength setup.** Equipment is now a **multi-select of tools** (pull-up
  bar, kettlebell, dumbbells, barbell, bands, medicine ball, bench) chosen **per training day**
  (e.g. "Gym", "Home"), each with its own session length. Replaces the single equipment level.
- **Flexible workout logging.** Per session you now add exercise lines — **pick from a dropdown**
  of tool-appropriate suggestions **or type your own** — and log your sets. Still auto-saves.
- Suggestions adapt to each day's tools (weighted where you have load, bodyweight otherwise);
  pulls only appear when you have a bar.
- Settings now edit the full setup (days, tools, time, maxima) via the same form.



### Added
- **Bilingual exercise names** — every movement, lift and bodyweight variation is now in
  the dictionary in English and German.

### Changed
- **Simplified the bodyweight ladders** — start at a realistic level (push begins at the
  knee push-up, nothing easier) with fewer variations.
- **Pull-ups only when you have a bar** — pure-bodyweight programs no longer show a pull
  movement (they train push / squat / hinge / overhead instead).

## [0.4.0] - 2026-06-03

### Added
- **Log a whole strength workout at once** (`/strength/log`): pick a day from your cycle,
  every movement/set pre-shows its target, and you type what you actually did. **Auto-saves
  as you type** (debounced) into one session log, so a dead phone loses nothing and you can
  resume.
- **Full strength settings**: edit everything from setup — equipment, days, minutes,
  training-max %, rounding, and the per-movement maxima — plus a **Reset program** button.
- **Dashboard reflects the leaderboards**: the fixed "weekly points / adherence" cards are
  gone; instead each **enabled** leaderboard (that you're allowed to see) gets a card with
  your current value. The streak badge follows the streak board.

### Changed
- Logging *Strength* with an active program now points to the whole-workout logger.

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
