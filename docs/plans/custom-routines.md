# Custom routines — design plan

Status: **agreed, not yet built** (decisions locked with Denis, 2026-07-14). The quick patch that
precedes this (session notes + hiding the bodyweight program variant) shipped separately.

## Goal

Flexibility next to the 5/3/1 preset: a player who just wants to log "my Monday routine" builds a
named routine once, then taps through it in the existing strength logger. The 5/3/1 engine stays
untouched as one *source* of loggable days; routines become a second source feeding the same
logger UI (no parallel logging path).

## Decisions (from discussion)

- **Bodyweight program variant is retired** (hidden — nobody runs one). Existing bodyweight state
  still renders; the pull-up repMax path on weighted days survives. Dead code gets deleted when
  the routine-based bodyweight workouts below replace it.
- **Routines are per-user**, plus:
  - a **trainer can publish routines** that players can pick from ("team routines");
  - **any player's routines are visible to teammates** (team → member page) and can be **copied**
    ("import into mine") from there — and from anywhere a routine-based session shows up (e.g. the
    feed): *see it → copy it*.
  - Copying = deep snapshot into the copier's own routines (no live link; later edits by the
    original owner don't propagate).
- **Per-exercise measurement type**: a dropdown per routine exercise, defaulting to
  **kg × reps**. Initial option set:
  - `KG_REPS` (default) — weight + reps per set
  - `REPS` — reps only (push-ups, pull-ups)
  - `SECONDS` — timed set where the seconds ARE what you log (plank, holds, e.g. 3×30 s)
  - `KG_SECONDS` — weighted hold (farmer carry, weighted plank) — cheap to include since the two
    axes already exist
- **Per-exercise tempo (separate from measurement type!).** A tempo like `3-0-3` — 3 s down,
  0 s pause, 3 s up **per rep** — is a *prescription for how to perform the reps*, not a thing
  you log. Optional free-text `tempo` field on a routine exercise (accepts `3-0-3`, `30X1`-style
  4-digit notation, whatever the author writes), shown as a badge next to the exercise in the
  logger and in the saved workout view. Logging is unchanged (still reps / kg × reps); the tempo
  is carried into the session details for display.
- Future bodyweight workouts will be built as (team-)routines using `REPS` + `SECONDS` + `tempo`
  (e.g. "Push-ups 3×8 @ 3-0-3", "Plank 3×30 s") — no separate engine.

## Data model

```prisma
model Routine {
  id        String   @id @default(cuid())
  userId    String?              // owner; NULL = team routine
  user      User?    @relation(fields: [userId], references: [id], onDelete: Cascade)
  teamId    String?              // set on trainer-published team routines
  name      String
  exercises String               // JSON: [{ name, measure, tempo?, sets: [{ reps?, weight?, seconds? }], restSeconds? }]
  copiedFromId String?           // provenance only (display "copied from X"); not a live link
  active    Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  @@index([userId])
  @@index([teamId])
}
```

- `measure` is a string union in `constants.ts` (`MEASURE_TYPES`), validated with Zod — same
  pattern as every other SQLite "enum".
- Exercise names are free text (no catalog dependency); a routine exercise never carries
  movement/week/cycle, so logging one **never touches 5/3/1 progression**.

## Logger integration

- `LoggerDay` grows per-suggestion `measure` + `tempo`; `SetVal` gets an optional `seconds`
  field. The set row renders inputs per measure (kg+reps / reps / seconds / kg+seconds); the
  tempo shows as a badge on the exercise line (next to the name, like the TM hint today). The
  details JSON stores `seconds` next to weight/reps and `tempo` on the exercise;
  `StrengthWorkoutView` formats accordingly (`3 × 30 s`, `24 kg × 40 s`, `@ 3-0-3`).
- `/strength/log` day picker shows three groups: **plan days** (5/3/1), **my routines**,
  **team routines**. Picking a routine preloads lines like a plan day does today.
- Prefill from history: when preloading a routine, prefill each exercise's weights/reps/seconds
  from the **last logged session of that routine** (poor-man's progressive overload). Falls back
  to the routine's stored targets.
- Rest timer: optional per-routine `restSeconds` feeds the existing rest-timer bar.

## Sharing & copying surfaces

- **Routine editor** at `/strength` (or `/strength/routines`): list + create/edit/archive.
  Trainers get a "publish to team" toggle (writes `teamId`, clears `userId` or keeps both —
  decide at build time; permission via `requireTrainer`).
- **Team member page**: show the member's active routines (read-only) with a **Copy** button.
- **Feed / session views**: a session logged from a routine records `routineId` + name in its
  details; the read-only view shows "Routine: X ⧉ Copy" for viewers who don't own it.
- Copy action: `copyRoutine(routineId)` — auth: any team member may copy any visible routine
  (same team). Snapshots name + exercises, sets `copiedFromId`.

## Build order

1. Schema + constants + Zod, `actions/routines.ts` (CRUD + copy), unit tests for the
   (pure) prefill-from-last-log helper.
2. Routine editor UI + measure dropdown.
3. Logger integration (picker groups, measure-aware set rows, seconds in details/view).
4. Copy surfaces: team member page, then feed.
5. Later: build the team bodyweight workouts as published routines; delete the LEVELS engine
   code once no active program uses it.
