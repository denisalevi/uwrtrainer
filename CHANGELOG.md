# Changelog

All notable changes to UWR Trainer are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/), and the project
uses [Semantic Versioning](https://semver.org/). While we're pre-1.0, a new **minor**
(0.**x**.0) marks a shipped feature batch and a **patch** (0.x.**y**) marks fixes/tweaks.
`1.0.0` is reserved for the first "team-ready" release.

Release process: `npm version <patch|minor>` (bumps `package.json` and creates the
`vX.Y.Z` git tag), then `git push --follow-tags`.

## [Unreleased]

## [0.19.0] - 2026-07-06

### Added
- **Colour-coded week boxes on home** (and the team-member view). Each week of the session
  history is now one bordered box with per-day boxes inside and an achievement header framed
  positively — "n of m done", never "n missed": **green** when every planned session was done,
  **grey** when something was missed but every miss has a reason, a gentle **red** when a miss
  has no reason yet, and neutral for the still-open current week. Tapping the header expands
  the per-plan-item breakdown (with over-target sessions shown as `+n`) and a shortcut to log
  a session; giving a reason still works on the flagged entries inside the box.

### Changed
- **The feed now scrolls back forever** — it shows the team's whole logged history (newest
  first) instead of only the last 7 days.

## [0.18.1] - 2026-07-06

### Changed
- Editing a **rugby team-practice** session (from home or the log detail) now opens the **group
  attendance dialogue** for that practice + date — where you can add/remove people — instead of a
  detached personal log form. They were always the same record (your attendance tick); now editing
  reflects that.

## [0.18.0] - 2026-07-06

### Added
- **Seasonal practices (date ranges).** Each team practice can now carry an optional **From / Until**
  date window (`/team/practices`), plus a manual **Deactivate / Activate** toggle that pauses it even
  inside the window. Out-of-season practices are hidden from the logging & attendance pickers,
  generate **no auto-miss**, and **don't count against weekly adherence** — so summer/winter
  schedules stop penalising players for practices that aren't running. (#28)

### Changed
- **Session lists on home and a teammate's profile redesigned.** Sessions are grouped into **weeks
  (Mon–Sun)** under a labelled separator, split by **day** with clear day headings, and each week's
  **auto-missed** rows are collected at the **end** of that week. Every entry is now a bounded card
  that stays **collapsed by default** (previously auto-missed rows expanded on load).

## [0.17.2] - 2026-07-05

### Changed
- Dropped the unused `output: "standalone"` Next config. The container runs via `next start`
  with the full `node_modules`, so the standalone bundle was built and ignored — and it emitted a
  start-up warning. Removing it silences the warning with no runtime change.

## [0.17.1] - 2026-07-05

### Changed
- Renamed the **"Mandatory"** practice tier to **"1st-team league"** (German **"1. Liga"**)
  everywhere it appears — the tier badge, the plan note, and the "…practices attended"
  leaderboard — so it reads as the first team's league practice.

## [0.17.0] - 2026-07-05

### Added
- Home now lists your **full session history**, not just the five most recent entries.
- Strength workouts render with **colour-coded sets** — warm-up, working, and Boring But Big sets
  are visually distinct, the **AMRAP** top set is emphasised, and a small legend plus the
  **cycle/week** are shown. Applies on both the home history and a teammate's profile.

### Changed
- Tapping a session on home now **expands a read-only summary** (the same detail view used on a
  teammate's profile) with an **Edit** button, instead of jumping straight into the edit form.

## [0.16.0] - 2026-07-05

### Added
- Multiple teams: `Team` + `TeamMembership` models, per-team registration codes (env
  `REGISTRATION_CODE` still acts as the default team's code), active-team switcher in the app
  header, join-a-team-by-code in Settings, admin team creation. Feed, leaderboards, roster,
  practice slots and attendance are scoped to the active team.
- Account-less roster members: trainers can add members by name only; attendance can be ticked
  for them, and they can claim their entry (keeping all history) when they sign up.
- **Rest timer between sets** in the strength logger — starts automatically, is wall-clock based
  (survives navigation), and can be dismissed.
- **Session timer** in the strength logger, with duration prefill and auto-marking the session
  done once every set is filled in.
- **Configurable weight rounding** for the strength engine (team setting; defaults to rounding
  the training max *down* to the increment).

### Fixed
- Plan edits now **version** plans instead of rewriting history, so past weeks keep the plan they
  were scored against.
- Scheduler robustness: the weekly reconcile **backfills weeks missed during downtime**, and a DB
  uniqueness backstop closes a duplicate-attendance race.
- UX batch: clearer attendance entry points, missed-reason feedback, feed labels, and editable
  practice events.
- Strength engine fixes: ROTATE layout un-phase-locked (each pair walks its own 4-week wave), short
  cycles counted per lift rather than per program, bodyweight AMRAP judged against its own
  prescription, `finishStrengthCycle` no longer wipes chosen exercises, onboarding set inputs
  persisted with a clearer training-max-vs-estimate readout, and the missed week's date carried
  into `/strength/log`.
- Validation hardening: `saveStrengthWorkout` validates target/date/payload, attendance validates
  the practice date, `/log` deduplicates rugby practice logs, and edits to auto-generated "missed"
  rows are blocked.

## [0.15.0] - 2026-06-30

### Added
- **Warm-up sets in the strength logger.** Working sets are now preceded by pre-filled warm-up sets,
  with a per-set delete and an "add warm-up" control. A uniform rule decides which warm-ups apply per
  week (the deload week keeps none). Warm-up scheme is a trainer-configurable team setting.
- **"Boring But Big" (BBB).** An optional pre-filled BBB accessory set in the logger
  (trainer-configurable reps/percentage as a team setting).
- **Clearer AMRAP set.** The top "as many reps as possible" set is now marked with a tappable
  **(AMRAP)** info tag that explains it.
- **Training-max onboarding.** A submaximal 1RM → training-max calculator during setup, with guidance
  on estimating your max and a clearer 1RM/TM readout.

## [0.14.1] - 2026-06-28

### Fixed
- Commitment page: custom-activity rows had the name box squeezed tiny and the number box stretched
  wide. The name field now takes the space and the number field stays compact.

## [0.14.0] - 2026-06-28

### Added
- **Activity feed.** A new Feed tab shows what the team did over the last 7 days, grouped by day.
  Rugby practices are aggregated into one event ("8 went to Tuesday practice", tap to expand the
  names); each practice event also lists **who committed but didn't come** (with reasons linking to
  their profile). It's an activity overview, not the leaderboard.
- **Group rugby attendance.** Anyone can record who came to a practice by ticking names off the team
  roster (de-duplicated, additive — others can add themselves later).
- **Missed-session tracking.** Commitments you don't meet are surfaced automatically, in two kinds:
  a specific *"you missed [that practice]"* for a practice you ticked (resolve by **adding
  yourself**), and an end-of-week *"Missed N of M strength/rugby/… sessions"* for your weekly counts.
  Missed entries aren't deletable — you resolve them by **logging the session** you actually did or
  **giving a reason** (reasons show on your profile). Past weeks are **frozen** to that week's
  commitment (changing your plan only affects the current/future weeks), and **logging a session
  late auto-corrects** that week. A small in-app weekly job (with a few days' grace) creates the
  end-of-week entries — no external setup.
- **Custom activities inline.** On the commitment page, custom activities (climbing, swimming, …)
  now live in the same "sessions per week" list with a **"+ Add custom activity"** button.

### Changed
- **Only you can edit your own commitments.** Trainers can no longer change another player's plan;
  the plan on a player's profile is read-only for everyone (trainers keep role promote/demote).

### Fixed
- Commitment page: the practices hint now correctly points to the availability note **below** it
  (was "above" after the section reorder).

## [0.13.0] - 2026-06-28

### Added
- **Editable practice slots.** Trainers can now edit an existing practice slot's label, day, time,
  and tier (e.g. switch a practice between mandatory/optional) — not just toggle it active or delete.
- **More flexible commitments.** Rugby is now a weekly *count* ("how many rugby sessions per week")
  at the top of the page, with the specific practices kept as an optional "which one(s)". You can
  also add your own **custom activities** (climbing, spinning, swimming, …) with a weekly count.
- **Browse training weeks without activating them.** On the strength program you can tap through
  weeks 1–4 to preview each week's sets/percentages; the active week is always shown at the top, and
  an explicit "Set as active week" button changes it. The **cycle number is now editable** too, so
  someone joining mid-program can set where they are.
- **Current training max shown in the logger**, above each lift's sets, so the per-set percentages
  have clear context.

### Changed
- The commitment page is reordered: weekly **session counts first**, then team practices, then the
  team-visible comment, then the private trainer comment.
- The plan intro no longer mentions earning points (points only apply if scoring is enabled).

## [0.12.0] - 2026-06-26

### Added
- **Team transparency for everyone.** The Team area is now visible to all members, not just
  trainers. Open a teammate to see — read-only — their plan (committed practice slots + weekly
  per-category targets), their public availability note, and their recent sessions, including a
  read-only view of each strength workout's exercises, sets, and weights.
- **Private "message to trainers"** field in the plan editor — only trainers (and you) can see it;
  other players never do. The plan editor also now makes clear that your plan and availability note
  are visible to the whole team.
- **Delete button on a logged strength session** — open an existing strength session and remove it
  from the bottom of the logger (with confirm).

### Changed
- **Clearer 5/3/1 week overview.** Each working set now shows its percentage, reps, and computed
  weight, e.g. `65% · 5 (65 kg)` and `85% · 5+ (85 kg)`. The `+` (AMRAP) marker appears only on the
  final set's reps in weeks 1–3 — never on a percentage and never in the deload week.
- **Smarter strength logger.** Shows which cycle **week** you're in, and displays a live, read-only
  **% of training max** next to each weight as you edit it.

## [0.11.0] - 2026-06-05

### Added
- **Per-exercise "done" tick** in the workout logger — tap the pill at the bottom-right of each
  exercise to mark it done (turns green; the card outlines green). Saved with the session.

### Changed
- The warm-up / stretching reminders now show **reddish** until tapped, then turn green — clearer
  "still to do" vs "done".

## [0.10.0] - 2026-06-03

### Added
- **Warm-up & stretching reminders** on each strength session — a tap-to-done checkbox for
  warm-up at the top and stretching at the bottom of the workout logger. Saved with the session.

## [0.9.0] - 2026-06-03

### Changed
- **Swap any lift to bodyweight — even on a weighted day.** Each lift's Modify picker now offers
  *all* options (with-weights and without-weights), so you can, say, barbell everything but do
  pull-ups for the row. How a lift is performed follows the exercise you pick, not the day. (A
  weighted pull-up counts as without-weights — you progress by reps.)
- **Clearer setup labels** — the chosen exercise now shows the tool it needs ("Squat (Barbell)"),
  matching the picker and plan view.
- **One way to log strength.** Strength is always logged as a full session — pick a day from your
  plan to preload it, or start empty and add exercises. Editing a logged strength session reopens
  that same full-session view (it used to open a mismatched single-lift form).

### Removed
- The old single-lift strength logging ("log squats only").

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
