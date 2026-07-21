# Changelog

All notable changes to UWR Trainer are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/), and the project
uses [Semantic Versioning](https://semver.org/). While we're pre-1.0, a new **minor**
(0.**x**.0) marks a shipped feature batch and a **patch** (0.x.**y**) marks fixes/tweaks.
`1.0.0` is reserved for the first "team-ready" release.

Release process: `npm version <patch|minor>` (bumps `package.json` and creates the
`vX.Y.Z` git tag), then `git push --follow-tags`.

## [Unreleased]

## [0.35.0] - 2026-07-21

### Added
- **Read-only routine view** (`/strength/routines/<id>/view`): view any routine you're allowed
  to see — a teammate's, a team-published one, or your own — without copying it first. Linked
  from the team member page (routine names are now clickable), the team-routine cards on the
  strength hub, and the "Routine" badge on feed entries. Owners get an edit shortcut, everyone
  else a "Copy to my routines" button.
- **Routines inside routines**: a routine entry can now be a reference to another of your own
  routines (e.g. a stretching routine as warm-up/cool-down). It stays collapsed — in the logger
  it's one line with its name (tap to open the read-only view) and a done-tick, and the feed
  shows "↪ <name> ✓" instead of set-by-set clutter. One level deep; copying a routine
  deep-copies referenced routines you don't own and repoints the reference, so copies stay
  self-contained.
- **Link entries**: a routine entry can be a named web link (YouTube warm-up video etc.).
  Links always render as their name — never the raw URL — with a sensible fallback (e.g.
  "YouTube") when no name is given. http(s) URLs only.
- **Warm-up & cool-down sections in the logger**: the warm-up / stretching checkboxes can now
  carry detail — attach one or more routines (picked from your list, done on the fly) and/or
  links, plus a free-text note ("what I did"). Ticking an attached item off ticks the section.
  Everything shows compactly on the feed and team views.
- **Notes everywhere**: routine exercises, routine references and links each take an optional
  note, shown in the editor, logger, read-only view and feed.

### Changed
- The stretching checkbox is now labeled "Cool-down / stretching".

## [0.34.1] - 2026-07-21

### Changed
- Auth emails: the "we've sent you a link" screens (check-email, resend verification, and
  password reset) now tell users to check their **spam folder** if the mail doesn't show up —
  outbound mail can land there on first contact. Both languages.

## [0.34.0] - 2026-07-18

### Added
- **Delete my account** (Settings → Personal): removes your login (email + password) but keeps
  all tracking data — you become an account-less roster member again, re-claimable at signup.
  The UI states explicitly that data is NOT deleted and names the admin email to contact for
  full deletion (which remains an admin action). All your sessions are signed out; the last
  remaining admin is blocked from self-deleting.
- **Reassign account** (Settings → Admin): move a login to a different account-less roster
  member — the fix for "ticked the wrong name at signup". Email, password, verification,
  language and role move; all training data stays with its rows; both affected members are
  signed out everywhere.

## [0.33.0] - 2026-07-18

### Added
- **Signup notifications**: admins get an email when a new member verifies their signup
  (fires on the unverified→verified transition, so abandoned signups stay silent; also when a
  first-time verification happens via a password reset). New admin setting toggles whether
  trainers are notified too (default: admins only). Localized per recipient; requires SMTP to
  be configured, silently off otherwise.

## [0.32.0] - 2026-07-16

### Added
- **Email verification & password reset** (optional, on when `SMTP_HOST` is configured — see
  README / `.env.example`; any SMTP submission service works, e.g. Brevo's free tier).
  - Signup (including roster claims) now emails a confirmation link (valid 24 h) and blocks
    login until it's clicked; the check-your-inbox page and the sign-in error both offer a
    rate-limited resend. Accounts created before this release are grandfathered as verified.
  - "Forgot password?" on the sign-in page emails a single-use reset link (valid 1 h). The
    response never reveals whether an account exists. Completing a reset revokes all existing
    sessions (new `User.sessionVersion` claim in the session JWT) and counts as email
    verification, since it proves inbox access.
  - Tokens are stored hashed (SHA-256), single-use, and superseded by newer ones; localized
    (en/de) emails via the existing dictionaries; new public pages `/forgot-password`,
    `/reset-password`, `/verify`, `/check-email`.
  - With `SMTP_HOST` empty everything behaves as before (signup auto-verifies, reset hidden) —
    nothing to configure for local/trusted deployments.

### Fixed
- Signup no longer fails with "Something went wrong" on instances with **open registration**
  (no invite code): the absent code field submitted `null`, which the validator rejected.

## [0.31.0] - 2026-07-15

### Added
- **Custom workout routines** (docs/plans/custom-routines.md). Build named routines from free-text
  exercises, each with a measure type (kg × reps, reps only, seconds, kg × seconds), an optional
  tempo prescription (shown, never logged), per-exercise rest seconds and target sets. The
  strength page is now a hub: the guided program — finally named **5/3/1 Wendler**, with a short
  explainer — sits next to your routines, where you create, edit, duplicate, archive/activate and
  delete them. Active routines appear as pickable days in the strength logger (grouped: 5/3/1 plan
  days · my routines · team routines) and prefill from the last logged session of that routine.
  Trainers can publish routines to the team; teammates' active routines are visible on their
  member page and copyable from there and from routine sessions in the feed ("see it → copy it" —
  a deep snapshot, never a live link). The 5/3/1 program itself can now be **paused** (its days
  leave the log picker; maxima and progress kept) and resumed from the hub.

## [0.30.0] - 2026-07-15

### Added
- **Extra practices with a custom name.** The attendance flow has a new "Extra practice" choice:
  type what it was (e.g. "beach training"), pick any past date, tick off who came. It counts
  toward everyone's weekly rugby goal, aggregates in the feed like a scheduled practice
  ("{n} went to {name}") and is editable from there.
- **Rest timer: set a custom time for one countdown.** Pause (or reset) the timer, then tap the
  time itself — a quiet dotted underline marks it editable — and type `90` or `1:30`. Resume
  starts the new countdown; your per-set defaults in Settings are untouched.
- **Committed practices show up by name in the weekly breakdown** — "Tuesday pool ✓ attended" /
  "✗ missed it" (or "still ahead" during the running week), alongside the count goals.
- **One reason per week.** An incomplete past week takes a single free-text reason ("sick",
  "work trip") right in the week box — visible to the team, replacing per-missed-row reasons.

- **A note on every group session.** The attendance flow (scheduled practice, extra practice AND
  tournament) has an optional note describing the event — shown in the feed event, the week list
  and the team view, and editable via "Edit attendance".
- **Extras are visible.** Sessions beyond your plan show as "+N" on the week header and an
  "Extras" line in the breakdown (e.g. "+1 Cardio") — overshoot on a planned goal keeps its
  per-row "+N".

### Changed
- **Committed practices never block your goals.** Going to a *different* rugby session than the
  one you aimed for still fulfils the weekly rugby goal — the skipped practice shows as
  "✗ missed it" info in the week breakdown (with the optional reason box), but 🎉 and the green
  box are decided by the count goals alone.
- **Team member page reordered**: planned-per-week counts → practices they're aiming for →
  availability note → recent sessions; the trainer's promote/demote control moved to the bottom.
- **Softer wording**: "Team practices I commit to" → "I'm aiming for" (de: "die ich mir
  vorgenommen habe"), and the week counts consistently say "erledigt" in German ("5 von 8 erledigt").
- **The Log page is reorganised.** Rugby is always recorded through the attendance flow — even
  when you trained alone (you're pre-ticked; just save). On top: "Record a rugby practice" and
  "Record a tournament / league game" (no longer highlighted in yellow); below: "Record a solo
  session" with strength / cardio / mobility / other.
- **Weekly goal boxes are positively framed.** All goals reached → green with a 🎉. Fell short →
  a calm grey box that simply states how far you got — no more red/amber boxes. The only red left
  is a small "no reason given" tag on an incomplete past week, and it disappears the moment you
  type a reason.

### Removed
- **Missed-session logging is retired.** The Done/Missed toggle is gone from the log form and
  auto-missed rows (both the per-practice ones and the end-of-week "Missed N of M" summaries) are
  no longer generated or shown — the weekly boxes carry that information now. Scores never read
  missed rows, so nobody's points/streaks change. The whole mechanism is kept in code (kill
  switch in `src/lib/missed.ts`, still fully tested) in case it returns for mandatory practices.

## [0.29.0] - 2026-07-15

### Changed
- **Account deletion moved out of the per-team view into a new User management section.** The
  admin "Team members" view is now only for team membership (add/remove); its "Delete account"
  button is gone. A new **User management** section (Settings → Admin) lists *every* user with the
  teams they're in, an add-to-team picker, and the account-delete button. This fixes the case where
  a user removed from all teams became unreachable — team-less users now show a "No team" badge and
  can be deleted directly, without first re-adding them to a team.

## [0.28.0] - 2026-07-14

### Added
- **Session notes on strength workouts.** Every strength session (including an empty one) has a
  free-text notes field at the bottom — describe exercises the structured fields can't capture, or
  just write down what you did. Notes autosave with the session and show on the workout card in
  the feed, dashboard and team views; a notes-only session renders its text instead of "no detail".

### Changed
- **The bodyweight program variant is hidden.** New programs can no longer pick "Bodyweight only"
  days (nobody uses them; a routine-based replacement is planned — see
  `docs/plans/custom-routines.md`). Existing programs with bodyweight days keep working and still
  show the equipment switch so they can be moved back to weights.
- **Descriptions brought up to date.** The strength intro, onboarding text, settings hint and the
  "How this works" explainer no longer mention the hidden bodyweight variant, the removed
  per-session time, or the old automatic Boring-But-Big rule (it's the one-tap opt-in with
  per-user settings). README and TRAINING.md refreshed to match what the app actually offers
  (feed, group attendance, tournaments, multi-team, per-lift progression), and the roadmap
  pruned to what's genuinely not built yet.

## [0.27.0] - 2026-07-14

### Added
- **Tournament / league game logging (#31).** New entry on the Log page: tick off who played,
  like practice attendance (anyone can submit, editable from the feed), with an optional event
  label and a free date — upcoming games can be pre-logged. Tournaments don't count as rugby
  practices anywhere; instead they **pause the selected players' weekly goals**: no auto-missed
  entries, full base points, streak kept. How much is paused is a team setting (⚙️ → Tournaments):
  the week leading up to the game (default), that week + the week after, or nothing.
- **Per-lift progression history (#30).** Whenever a lift's maxima are overwritten — a cycle
  closing or a manual edit in Program settings — the old and new state are recorded (including
  the increase/hold/reset decision), shown under "Progression history" on the Strength page and
  stored for later analysis/plotting.
- **Workout in progress follows you (#33).** Leaving the strength logger no longer hides a
  running session: a persistent bar (on every page) shows the session clock and the rest
  countdown and taps back into the exact session; returning picks the rest timer up mid-count.
  The Log page also offers "Continue today's workout" while an unfinished draft exists.

### Changed
- **Leaderboards: tied scores share the medal (#29).** Everyone with the same points gets the
  same rank — three tied at the top are all gold, the next distinct score is rank 4.
- **Logged strength sessions show each lift's own cycle/week (#32)** (e.g. "C3 · W2" per lift)
  instead of the program's old session-level pointer, in the feed, dashboard and team views.

### Fixed
- **Out-of-season practices are rejected server-side too (#28).** The season window was already
  enforced in the UI, auto-missed generation and scoring; now stale/crafted submissions can't
  log or take attendance for a practice outside its window either.
- **Switching an exercise in the strength logger no longer wipes what you typed.** Each line now
  remembers the rows you entered per picker choice: switching to "Custom exercise" carries your
  current sets (and the exercise name) along, and switching back restores exactly what you had —
  in both directions, as often as you like.
- **Resuming/editing a strength session keeps the exercise picker and the %-of-max display.**
  Saved sessions now record which plan exercise each line was on, so reopening a draft no longer
  degrades every line to "Custom exercise" with the percentages gone.
- **The debounced autosave saved stale state.** The save fired with the state from one render
  earlier, so the last change before leaving the page (a final rep, an exercise switch) was
  silently never persisted. It now always saves the latest state, and a pending save is flushed
  immediately when the app goes to the background (phone locked, app switched).
- **Day switching no longer silently discards entered sets.** Re-picking the already-selected day
  is a no-op, and switching to another day (or "Empty session") asks for confirmation first when
  you've already entered something.

## [0.26.0] - 2026-07-14

### Added
- **Admins can delete a user account entirely (not just remove it from a team).** In
  ⚙️ Settings → Team members, each member now has a red **Delete account** action next to the
  (now neutral) team **Remove** button. Deleting cascades all of that user's data — session logs,
  plans, strength programs and team memberships — while plans they authored for other players are
  kept (their author is cleared). It asks for confirmation, names the member, and refuses to
  delete your own account or another admin (demote an admin first).

## [0.25.3] - 2026-07-14

### Fixed
- **Saving Program settings no longer resets your weeks.** Editing the plan (a session name, a
  training max, the day layout, …) rebuilt each lift's state from the form and dropped its live
  progression, snapping every lift back to the default week. Settings edits now preserve each
  lift's own week/cycle (and its wave bookkeeping) — only the maxima/exercises/days you changed are
  updated.

## [0.25.2] - 2026-07-14

### Changed
- Trimmed the per-lift week-change note to just "Resets where this lift goes from here." (dropped
  the confusing "This isn't the next step —" lead-in).

## [0.25.1] - 2026-07-14

### Fixed
- **Half-kilo weights are accepted again.** Weight and training-max inputs no longer force whole
  numbers — you can enter 37.5, 42.5, etc. (they were rejecting decimals with "the two nearest
  valid values are 37 and 38").
- **Lifts use their real names in the settings/session editor.** The session lift editor and the
  per-lift setup now say "Deadlift", "Bench press", "Overhead press", "Back squat" (matching the
  plan) instead of the internal pattern names "Hinge", "Push", etc.

## [0.25.0] - 2026-07-14

### Added
- **Customize which lifts go on each session.** The auto-layout (which spreads your lifts across
  your sessions) is still the default, but in ⚙️ Program settings you can now take over: pick which
  lifts belong to each session, reorder them, and put a lift on one session, several, or none. A
  "Reset to automatic layout" button restores the default. Renaming sessions works as before.

### Changed
- **Removed the per-session time (the "60 min").** It's gone from onboarding, the session cards,
  the logger and the plan preview — it was arbitrary and just noise. You still **log actual
  duration** when you train (the useful part). The number of sessions is unchanged.
- **Trainer notes hint** now suggests you can jot down how much time you want to spend per session
  (handy when a trainer builds your plan) — replacing the removed structured time field.

## [0.24.1] - 2026-07-13

### Changed
- **`/strength` is now one list, grouped by session.** The separate per-lift overview and the
  per-day plan are merged: each session card lists its lifts, and every lift shows its own
  cycle/week + test/deload/stale status, its prescribed sets, and its week control in one place —
  no more duplicated lists.
- **Deload is now just week 4 in the week selector.** Removed the separate "Deload" button; the
  per-lift control is `1 · 2 · 3 · 4 (Deload)`, and picking **4** does the deload and restarts
  that lift's cycle at the same weights (same behaviour as before, one control instead of two).

## [0.24.0] - 2026-07-13

### Added
- **Each lift progresses on its own automatic wave.** Every core lift (squat, deadlift, bench,
  overhead — plus your enabled pulls) now runs its OWN 4-week cycle and moves to the next week
  **automatically when you log it** — no more hand-picking an "active week". Lifts you train
  together advance together; a lift you skip just waits where it is (5/3/1-style per-lift
  progression). The training-max bump at the end of a cycle is applied automatically from the
  week-3 AMRAP you already log — the manual "Finish cycle" step is gone.
- **A per-lift overview on `/strength`.** See each lift's current cycle + week at a glance, with
  its test-week / deload / "not trained in a while" status.
- **"Deload" any lift, any time.** A per-lift button gives you an easy (deload) week and then
  restarts that cycle at the same weights (no bump) — a re-sync / back-off tool, e.g. to line a
  lift back up with the others.
- **Manual week override, behind a warning.** You can still set a lift to a specific week; it
  warns that it resets where the lift goes from there.
- **Stale-return hint.** A lift you haven't trained in a while suggests stepping back (deload or
  a week back) instead of silently serving up the next heavy week.

### Changed
- **The strength logger now has its own date field.** You can see and change the session date
  right in the logger — on both new sessions (the date you picked in `/log` is carried through,
  no longer thrown away) and when editing an existing strength session (previously the date was
  invisible and uneditable there).
- Removed the global "active week" selector and the manual "Finish cycle" card — both are
  superseded by the automatic per-lift progression above.

## [0.23.2] - 2026-07-08

### Changed
- **New app icon** — a muscular shark flexing over a ball, underwater. Replaces the old
  placeholder PWA icons (home-screen icon on Android/iOS, favicon, maskable variant).

## [0.23.1] - 2026-07-07

### Changed
- Cardio session cards keep the "Cardio" title; the activity shows as its own row when the
  card is opened (and alongside the note in the feed line) instead of replacing the title.

## [0.23.0] - 2026-07-07

### Added
- **Cardio sessions have an activity name.** The log form asks what the cardio was (running,
  cycling, …) and that name becomes the session's title on home, the team member view and the
  feed — instead of a generic "Cardio".

### Changed
- **Cleaner expanded session cards.** The expanded view no longer repeats "What did you do?",
  "Date" and "Did it happen?" (all visible at a glance already) and instead shows what's
  actually useful: duration, heart-rate zone (cardio) and the note.

## [0.22.0] - 2026-07-07

### Added
- **Two separate pull slots: pull-ups and rows.** The single pull movement split into a
  vertical pull (`PULLV` — band/full/weighted pull-ups; the weighted variant progresses in
  *added* kg like any 5/3/1 lift) and a horizontal pull (`PULL` — barbell/dumbbell/kettlebell
  rows, or inverted rows without weights). Each has its own exercise choice, maxima and
  progression, and with two weighted days each pull rides its **own** day: pull-ups join the
  squat+bench day, rows the deadlift+press day. Bodyweight days include every enabled pull.

### Changed
- **The pull toggle is per user now** (was a trainer/team setting) and there are two of them:
  "Pull-ups (vertical pull)" and "Rows (horizontal pull)" in Settings → Strength program, both
  on by default. Existing programs were migrated: the old pull's row training max stayed on the
  row, its pull-up rep max moved to the new vertical pull (weighted pull-up max starts empty —
  set it after your next assessment).

## [0.21.0] - 2026-07-07

### Added
- **Practices can be deleted.** Inside a practice's edit fold there is now a Delete button — as
  long as nothing references the practice yet. Once sessions were logged against it (or it sits
  in a plan) the button gives way to a hint to deactivate instead, so no history is ever lost.

### Changed
- **Warm-up sets and Boring But Big are now personal settings.** They moved out of the trainer
  section into your own settings and apply only to you (existing team values were carried over
  for everyone). Settings now has a **Strength program** group bundling all four per-user
  strength-logging prefs: rest timer, weight rounding, warm-up sets and Boring But Big. The
  trainer section keeps only the team-wide pull-exercise default.

## [0.20.0] - 2026-07-07

### Added
- **Click-to-join teams.** The Teams section in Settings now lists every team; tapping a team
  you're not in folds open a join-code field for exactly that team (with a clear "wrong code"
  message on a typo). Admins can join any team directly, no code needed.
- **Join codes are visible now.** Members see their own team's join code right in the teams
  list (to share with new teammates), and admins see every team's code. Teams without a code
  say so ("ask an admin to add you"); an open default team says no code is needed.
- **Admin member management.** A new admin-only "Team members" section in Settings lists every
  team with its members — remove someone from a team, or add any existing user via a dropdown.
  A removed user's active team falls back to their next membership.

### Changed
- **The Settings page is reorganised into collapsible groups**: *Personal* (language, rest
  timer, weight rounding, account), *Teams*, *Trainer* (amber-accented, badge "trainers only")
  and *Administration* (red-accented, "admins only"). Every card folds open/closed, so the page
  is a short scannable list instead of one long wall of forms.
- **Team practices management moved into Settings** (Trainer group) instead of hiding behind a
  separate page — the weekly slots and the add-practice form now fold open in place.
  `/team/practices` redirects to Settings.

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
