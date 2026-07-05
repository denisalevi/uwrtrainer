# Multi-team support + account-less roster members (issue #12 + owner request)

Implementation plan. Self-contained: a fresh agent can resume from the checkboxes below.
Branch: `claude/multi-team-roster` (based on `claude/github-repo-pr-review-pm3thx`).

## Feature summary

**A. Account-less roster members** — `User` rows with `passwordHash = NULL` (and `email = NULL`).
All existing FKs (SessionLog.userId, Plan.userId, StrengthProgram.userId) keep working. Trainers
create them by name; attendance can be ticked for them. On signup, a new person can **claim** an
unclaimed member of the team whose registration code they used — claiming sets
email/passwordHash/locale on the existing row and keeps all history. Guard: claim only allowed
when the row's `passwordHash IS NULL`.

**B. Multiple teams** — `Team` (id, name, registrationCode) + `TeamMembership` (userId, teamId,
unique pair). Users may belong to several teams; active team persisted on `User.activeTeamId`
(fallback: first membership), switched via a dropdown in a new app header. Team-scoped data:
roster, leaderboards, feed, practice slots, attendance. Everyone can see the list of all teams
(name only) and join one by entering that team's registration code; admins can add any user to
any team and create teams.

## Decisions (chosen answers to open questions)

1. **Settings stay GLOBAL for v1** (scoring/leaderboard-config/strength settings in the `Setting`
   table and `Leaderboard` rows are instance-wide, not per-team). Documented trade-off: fewest
   moving parts; per-team settings can later add a `teamId` column to `Setting`. Leaderboard
   *data* (who is ranked) IS team-scoped; only the config (which metrics are on) is global.
2. **Default team** — migration creates a team with fixed id `team-default`, name `My Team`
   (owner can rename later / v1: rename not critical), `registrationCode = NULL`, and attaches
   ALL existing users to it. **Env `REGISTRATION_CODE` acts as the default team's code fallback**:
   wherever a team code is checked, `effectiveCode(team) = team.registrationCode ?? (team.id ===
   'team-default' ? env.REGISTRATION_CODE : null)`. (Migrations can't read env, so the env var
   keeps its old meaning at runtime instead of being copied into the DB.)
3. **Signup + team resolution**: the signup form always shows an (optional) code field. If a code
   is entered, it must match some team's effective code → the user joins that team. If empty, the
   user joins the default team only if the default team's effective code is empty (open instance);
   otherwise `auth.badCode`. First-ever user still becomes ADMIN.
4. **Claim UI**: client-side — when the code field changes (debounced) the form calls server
   action `listClaimableMembers(code)` → unclaimed members `{id,name}` of the matched team; a
   radio list "I am … / None of these" appears. Submitting with `claimMemberId` updates that row
   (guarded server-side: member belongs to matched team AND `passwordHash IS NULL`).
5. **Login**: users with `passwordHash = NULL` cannot log in (`invalidCredentials`). `email` is
   nullable+unique (SQLite allows many NULLs).
6. **Practice slots are per-team**: `PracticeSlot.teamId` (required, backfilled to
   `team-default`). Slot CRUD scoped to the trainer's active team.
7. **Isolation rule**: every team-scoped query filters by the viewer's **active team** via
   `TeamMembership`. `/team/[userId]` additionally requires the target to share a team with the
   viewer.
8. **Cross-team users**: a user's own logs/plans/strength are personal (not team-scoped) — they
   follow the user everywhere. Only *aggregated/social* views (feed, leaderboards, roster,
   attendance) are scoped.

## Schema diff (prisma/schema.prisma)

- `User`: `email String? @unique`, `passwordHash String?`, `activeTeamId String?`,
  relations `memberships TeamMembership[]`.
- New `Team { id, name, registrationCode String?, createdAt, memberships[], practiceSlots[] }`.
- New `TeamMembership { id, userId, teamId, createdAt, @@unique([userId, teamId]) }`
  (both FKs `onDelete: Cascade`).
- `PracticeSlot`: `teamId String`, `team Team @relation(...)`, `@@index([teamId])`.

## Migration (`prisma/migrations/<ts>_multi_team_roster/migration.sql`, hand-edited)

1. CREATE TABLE Team, TeamMembership (+ indexes).
2. `INSERT INTO Team (id, name) VALUES ('team-default', 'My Team');`
3. Rebuild `User` (nullable email/passwordHash, add activeTeamId).
4. Rebuild `PracticeSlot` with `teamId` — INSERT SELECT uses literal `'team-default'`.
5. `INSERT INTO TeamMembership … SELECT … FROM User;` (all existing users → default team).

## Files to touch (enumerated by grep over prisma queries)

- `src/lib/dal.ts` — CurrentUser gains `email: string | null`, `activeTeamId: string | null`
  (persisted id if still a member, else first membership), `teamIds: string[]`.
- `src/app/actions/auth.ts` — login guard; signup team+claim logic; `listClaimableMembers`.
- `src/app/actions/trainer.ts` — slot CRUD team-scoped; `addRosterMember` (credential-less user
  in active team); admin `createTeam`, `addUserToTeam`.
- `src/app/actions/settings.ts` — `switchTeam` (validate membership), `joinTeamByCode`.
- `src/lib/stats.ts` — `getLeaderboard(metric, period, teamId)`, `getTeamSummary(teamId)`
  (users filtered via membership).
- Team-scoped pages: `feed/page.tsx` (both sessionLog queries filter
  `user.memberships.some.teamId`), `leaderboards/page.tsx`, `team/page.tsx`,
  `team/[userId]/page.tsx` (shared-team guard), `team/practices/page.tsx`,
  `attendance/page.tsx` (slots+members), `log/page.tsx` + `log/[id]/page.tsx` (slots),
  `components/plan-editor.tsx` (slots), `actions/training.ts` (savePlan slots,
  saveAttendance member validation scoped to slot's team).
- `src/app/(app)/layout.tsx` + new `src/components/team-switcher.tsx` — header with active-team
  dropdown (top right).
- `src/app/(app)/settings/page.tsx` — "Teams" card: my teams, join-by-code form; admin: create
  team. `src/app/(app)/team/page.tsx` — trainer: add roster member form; unclaimed badge.
- `src/components/auth-form.tsx` — claim list UI.
- `src/lib/i18n/dictionaries.ts` — new keys in BOTH en and de.
- Not touched: `src/lib/missed.ts` (per-user), scoring, strength (personal data).

## Testing plan

- `npx vitest run` (existing pure-lib tests must stay green; no schema coupling).
- `npm run build` (webpack) at every commit.
- Manual (dev server + seeded DB): signup/claim, switch team, isolation spot-checks.

## Phased checklist (update as you go)

- [x] **Phase 0** — this plan committed.
- [x] **Phase 1** — schema + hand-edited migration + `prisma generate`; migration applies cleanly
  to a DB with existing data (verified via seeded dev.db: 4 users → 4 memberships, activeTeamId
  backfilled).
- [x] **Phase 2** — core plumbing: dal (activeTeamId/teamIds, nullable email), auth actions
  (login guard, team-aware signup + claim action, `listClaimableMembers`), settings actions
  (switchTeam, joinTeamByCode), trainer actions (slot CRUD scoping, addRosterMember, createTeam,
  addUserToTeam). Build green.
- [x] **Phase 3** — team scoping of reads: stats.ts signatures, feed, leaderboards, team pages
  (incl. shared-team guard on /team/[userId]), attendance, log/plan slot queries, training.ts
  (attendance restricted to the slot's team). Build green.
- [x] **Phase 4** — UI: header team switcher, settings Teams card (join by code; admin create
  team), roster-member add form + "no account" badge on /team, signup claim UI (debounced
  `listClaimableMembers`), i18n keys (en+de). Build + vitest green.
- [ ] **Phase 5** — polish (REMAINING): README/AGENTS/CHANGELOG notes, manual browser
  verification pass, admin rename-team / set-team-code UI, admin "add user to team" UI (the
  `addUserToTeam` action exists but has no form yet), surface join errors (joinTeamByCode
  silently redirects on a bad code), update `prisma/seed` to create team memberships for demo
  users (fresh-seeded users currently rely on the migration backfill only if seeded before
  migrating — verify and fix ordering).

## Remaining work if interrupted

Whatever phase boxes are unchecked above; each phase leaves the branch buildable.

## Future work / integration with uwr-planner (reference project)

The owner's reference implementation (git.pabr.de/uwr/uwr-planner, Node/Express/Mongoose) models
the same ideas with different shapes; mapping for a future convergence:

- Their **`Player`** (roster member without login, linked from `User.linkedPlayers[]`) ≈ our
  **`User` row with NULL credentials**. We merge the two entities and "link" by setting
  email/passwordHash on the same row (claim), so history needs no re-parenting. A future
  many-to-one link (one account managing several roster members, e.g. a parent) would need a
  separate link table — our claim flow is the 1:1 special case.
- Their **`organizations[]`** array on the user ≈ our **`TeamMembership`** join table (ours also
  gives us a place to later hang a per-team `role` — e.g. team-scoped TRAINER — instead of the
  current global `User.role`).
- Their **`managedOrganizations[]`** ≈ a future `TeamMembership.role = "MANAGER"`.
- Their **`pendingOrganizations[]`** (join request + manager approval, with note) is an
  alternative join flow to our join-by-code. Our `joinTeamByCode` is deliberately a thin action —
  a request/approve mode can be added as a parallel action plus a `TeamMembership.status`
  ("ACTIVE" | "PENDING") without schema upheaval.
