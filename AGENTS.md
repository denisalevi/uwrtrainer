<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version (Next.js 16) has breaking changes — APIs, conventions, and file structure may all
differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before
writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

# UWR Trainer — contributor / agent guide

Self-hosted training tracker for an amateur underwater-rugby team (generic enough for any team).
User-facing docs and deploy steps are in [README.md](README.md). This file is for whoever
continues development. **`CLAUDE.md` just `@`-includes this file.**

## Running & developing (no Node.js on the host)

This machine has **no host Node** — everything runs in a `node:22-slim` (Debian) container under
**rootless Docker**. Container root maps to the host user, so files created in the container are
owned correctly. A named volume `uwr-npm-cache-deb` caches npm downloads.

```bash
# Run any tooling command:
docker run --rm -v "$PWD":/app -v uwr-npm-cache-deb:/root/.npm -w /app node:22-slim <cmd>

# Common ones:
#   npm ci
#   npx prisma generate           # after editing prisma/schema.prisma
#   npx prisma migrate dev --name <x>
#   npm run db:seed               # demo data (dev only)
#   npm test                      # vitest (scoring)
#   npm run build                 # production build — MUST be webpack (see gotchas)

# Dev server (cookies work over http because NODE_ENV=development):
docker run -d --name uwr-dev -p 3000:3000 -v "$PWD":/app -v uwr-npm-cache-deb:/root/.npm \
  -w /app node:22-slim sh -c "npx next dev -H 0.0.0.0 -p 3000"
```

> Use **Debian (`node:22-slim`), not Alpine** — the libSQL native binary needs glibc prebuilts.

### Running in the Claude Code cloud/web sandbox (agents)

If you're an agent in the **cloud/web execution environment** (ephemeral container, fresh clone),
the Docker workflow above does **not** apply — there's no Docker daemon. Instead **Node 22 is on the
PATH directly** (`/opt/node22/bin`: `node npm npx tsx`). Run tooling commands directly. Key gotchas
(all discovered the hard way — don't rediscover them):

- **Outbound network goes through the agent proxy.** Two independent fixes are needed:
  - **npm**: `registry.npmjs.org` is in the proxy's `noProxy` list (reachable directly), but npm's
    configured `https-proxy` forces it through the proxy and the connection resets. Unset it per
    command: `npm_config_proxy= npm_config_https_proxy= npm ci --no-audit --no-fund`.
  - **Package postinstalls** (e.g. `@prisma/engines` downloading engine binaries) use Node's
    built-in `fetch`, which **ignores `HTTPS_PROXY` unless `NODE_USE_ENV_PROXY=1`** and needs the
    proxy CA. So prefix any network-touching node/npm/prisma command with:
    `NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt`.
  - Full first-time install that works: `NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt npm_config_proxy= npm_config_https_proxy= npm ci --no-audit --no-fund --maxsockets=3 --fetch-retries=5`
- **`.env`** doesn't exist on a fresh clone. Create one (it's gitignored via `.env*`): `SESSION_SECRET`
  (`openssl rand -base64 32`), `DATABASE_URL=file:./dev.db`, empty `REGISTRATION_CODE`. Unquoted, and
  **never set `NODE_ENV`** (cookies work over http in dev).
- **DB setup**: `npx prisma generate` → `npx prisma migrate deploy` → `npm run db:seed` (tsx; demo
  users, password `password123`). Prefix with the proxy env vars above for `generate`/`seed`.
  With `DATABASE_URL=file:./dev.db` the database lands at the **repo root** (relative to the
  process cwd), NOT `prisma/dev.db` — point standalone tsx scripts at the root file.
- **Playwright in scripts**: the project has no playwright dep; import the global one **by path**
  (`import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs"`) — a bare
  `import "playwright"` won't resolve. Standalone tsx/mjs scripts must live in the repo root
  (not `/tmp`) for `node_modules` resolution; name them `*.local.*` and delete before committing.
- **Dev server**: `npx next dev -H 127.0.0.1 -p 3000` (Turbopack). `npm test` (vitest) and
  `npm run build` (webpack) need no network once deps are installed.
- **There is NO public URL the user can reach** — this container is isolated and ephemeral. To show
  the user a change "live", either **open a PR** (they merge → their own deploy serves it) or run the
  dev server here and **screenshot it** with the pre-installed Chromium.
- **Browser/Playwright**: Chromium is pre-installed at
  `/opt/pw-browsers/chromium-1194/chrome-linux/chrome` (`PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`).
  Use the global `playwright` module; **never** run `playwright install`. Launch with that explicit
  `executablePath`.
- **Auth for automated screenshots**: the signup/login **server-action forms submit empty FormData
  under Playwright** in Next 16 dev (the typed fields never reach the action), so UI sign-up fails.
  Bypass it by **injecting a session cookie**: create/find a user via a `tsx` script using the
  generated Prisma client + `PrismaLibSql`, sign an **HS256 JWT** (`jose`) with `SESSION_SECRET`,
  payload `{userId, role}`, and add it as the `session` cookie to the browser context (see
  `src/lib/session.ts` for the exact shape). tsx scripts need an async IIFE (no top-level await).

## Architecture

- **Next.js 16 App Router**, React 19, TypeScript, Tailwind v4 (hand-rolled UI primitives in
  `src/components/ui.tsx`, no component library).
- **Server Components + Server Actions** for all data flow; no REST API layer. Mutations live in
  `src/app/actions/{auth,training,trainer,settings}.ts` (each `"use server"`).
- **Prisma 7 + SQLite via the libSQL driver adapter** (`PrismaLibSql`). Client singleton in
  `src/lib/db.ts`; generated client in `src/generated/prisma` (gitignored — run `prisma generate`).
- **Auth**: custom sessions — `src/lib/session.ts` (jose JWT in an httpOnly cookie) +
  `src/lib/dal.ts` (`getCurrentUser`/`requireUser`/`requireTrainer`, the authoritative checks).
  `src/proxy.ts` does only optimistic redirect gating.
- **Scoring** (pure, unit-tested): `src/lib/scoring.ts`. **Aggregation** (plans+logs → week
  scores, leaderboards, team summary): `src/lib/stats.ts`. Leaderboards are computed **on the
  fly** — there is no cache table, by design (robustness over micro-perf for a small team).
- **Strength program** (pure, unit-tested): `src/lib/strength.ts` — a Wendler 5/3/1 engine
  that also works with zero equipment. Six movement patterns: push/squat/hinge/press cores plus
  two optional pulls — `PULL` (horizontal, rows) and `PULLV` (vertical, pull-ups; its weighted
  variant progresses in ADDED kg). Setup is **auto-laid-out**: the player sets day count + each
  day's `equipment` (`"WEIGHTS"|"BODYWEIGHT"`) + length, and
  `buildSchedule(days, state, {pulls,layout,week})` distributes the four cores. Two rules (unit-tested): **weighted days split** the cores (each
  lift once/week, spreadsheet pairing squat+bench / deadlift+press via `weightedAssignment()`);
  **bodyweight days are full-body** (all patterns). A single weighted day uses `weightedLayout`
  (`ROTATE` 2-week pairs by week parity, or `ALL_IN_ONE`). Each enabled pull rides its own
  weighted pressing day where possible (`pullRiderDays()`, vertical on the lightest), never the
  deadlift day. The `StrengthProgram` model holds
  `days` (JSON `[{id,name,equipment,minutes}]` — what each day *contains* is derived, not stored),
  `weightedLayout`, `notes` (trainer-visible free text), and `movements` (JSON per-movement state
  `{trainingMax?,repMax?,levelIndex?, weighted/bodyweightExerciseId, *Custom}`, **shared across
  all days**). `EXERCISE_CATALOG` lists each movement's variants for the Modify picker;
  `resolveExercise()`/`workoutForSlot()` build a movement's sets (weighted reads `trainingMax`,
  bodyweight reads `repMax`). A lift's chosen exercise can be either kind regardless of the day —
  `resolveExercise` returns the mode from the exercise, so a weighted day can hold a bodyweight
  lift (e.g. pull-ups for the row). Which pulls a plan includes is **per user**
  (`User.strengthPullups` / `User.strengthRows`, both default on), set in Settings alongside the
  other per-user strength prefs (`strengthWarmup`/`strengthBbb` JSON, rest timer, rounding).
  Exercise/lift names are **i18n keys** (`ex.*`/`lift.*`) the engine returns and the UI
  translates. Actions: `actions/strength.ts` (+ per-user prefs in `actions/settings.ts`). UI: `/strength` (view + `program-form`
  for setup/settings — per-day equipment, per-lift Modify + inline shared maxima, live plan
  preview, notes box). `/strength/log` (`strength-workout-logger`) is the **only** strength-logging
  UI: pick a plan day to preload its exercises or start empty, debounced autosave via
  `saveStrengthWorkout`; `?id=` edits an existing session (the generic `/log/[id]` redirects
  STRENGTH-DONE here, and the old single-lift strength fields in `log-form`/`logSession` are
  gone). Model
  + reasoning in `TRAINING.md`. Server-action files export **only async functions** (pure helpers
  like `buildSchedule`/`weightedAssignment`/`resolveExercise` live in `strength.ts`) — webpack
  build enforces this.
- **i18n**: `src/lib/i18n/` — `en`/`de` dictionaries (flat dotted keys), server helper
  `getServerT()`, client `useT()` (`src/components/i18n-provider.tsx`). Locale is **per user**
  (`User.locale`), applied in the root layout.

Key files to read first: `prisma/schema.prisma`, `src/lib/scoring.ts`, `src/lib/stats.ts`,
`src/lib/dal.ts`, `src/app/(app)/dashboard/page.tsx`.

## Conventions & gotchas (verify before changing)

- **Build with webpack**: `package.json` `build` = `next build --webpack`. serwist (PWA) isn't
  Turbopack-ready yet, and the webpack build is also stricter (e.g. pages may only export
  `default` + Next's special exports — that's why `AuthScreen` lives in its own component). `dev`
  uses Turbopack (serwist disabled in dev).
- **Next 16 specifics**: middleware is `src/proxy.ts` (renamed); `cookies()`, `params`, and
  `searchParams` are **async** (await them). `revalidatePath`/`redirect` from the usual modules.
- **SQLite has no enums** — "enum" fields are `String` + TS unions in `src/lib/constants.ts`,
  validated with Zod. `SessionLog.details` is a JSON **string**.
- **Env**: `.env` must be **unquoted** and must **not** set `NODE_ENV`. Don't pass the app
  `--env-file` via Docker (it keeps quotes and breaks the secret/db URL); let Next load `.env`,
  or pass vars with `-e`. Note `openssl rand -base64 32` secrets contain `=`.
- **i18n parity**: every key added to `en` must be added to `de` (`de` is typed
  `Record<DictKey,string>`, so a missing key fails the build).
- **Server Actions are public endpoints** — always re-check auth inside them via the DAL; don't
  rely on UI gating.

## Versioning

SemVer, pre-1.0. `package.json` is the source of truth; a new **minor** = a shipped feature
batch, a **patch** = fixes. Release: `npm version <patch|minor>` (bumps + creates the `vX.Y.Z`
tag), update `CHANGELOG.md` (Keep a Changelog), then `git push --follow-tags`. The version is
shown in Settings via `src/lib/version.ts` (set `NEXT_PUBLIC_GIT_SHA` at build for a SHA too).

## Deployment

`docker compose up -d --build` (rootless-friendly: app on `127.0.0.1:${APP_PORT:-3000}`,
unprivileged). `docker-entrypoint.sh` runs `prisma migrate deploy` then `next start`.
HTTPS via **Tailscale Funnel** (Tailscale manages the cert; app gets plain HTTP locally — secure
cookies still work because the public side is HTTPS) or the optional **Caddy** compose profile.
Default leaderboards + settings are seeded by the migration
`prisma/migrations/20260529000000_seed_defaults`. **First signup becomes ADMIN**; set
`REGISTRATION_CODE` to gate signup on a public URL.

## Design decisions & deviations from the original plan

The approved plan named some choices that were changed during build, all for robustness on this
bleeding-edge stack:

- **Custom session auth instead of Auth.js** — it's what the Next 16 docs themselves recommend;
  avoids Auth.js compat risk on a brand-new Next.
- **libSQL adapter instead of better-sqlite3** — prebuilt binaries, no C toolchain in the image.
- **Debian `node:22-slim` instead of Alpine** — glibc prebuilts for libSQL.
- **Hand-rolled Tailwind UI instead of shadcn/ui** — avoids interactive init / Tailwind v4 friction.
- **Leaderboards computed on the fly, no `WeeklyScore` cache table** — fewer moving parts, no
  stale-cache bugs.
- **Online-first PWA**; offline sync deferred.

Scoring philosophy (from coach feedback, encoded in `scoring.ts`): reward **adherence to the
agreed plan over raw volume** — full adherence is a fixed weekly base regardless of plan size;
missing a mandatory practice hurts more than an optional one; overshoot earns a small capped
bonus. All weights are tunable in `DEFAULT_SCORING`.

## Roadmap (not yet built)

Custom workout routines (per-user + trainer-published + copy-from-teammate; design in
`docs/plans/custom-routines.md`) · offline logging + background sync · goals & countdowns
(tournament dates, weeks-until) · notifications · Postgres option. (Also mirrored in README.)
