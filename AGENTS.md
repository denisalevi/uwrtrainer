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
  that also works with zero equipment. Five movement patterns (push/pull/squat/hinge/press).
  Setup is **per training day**: the `StrengthProgram` model holds `days` (JSON
  `[{id,name,tools[],minutes}]` — equipment is a multi-select of tools per day) and `movements`
  (JSON per-movement maxima: `{trainingMax?, repMax?, levelIndex?}`). `suggestionsForTools()`
  builds each day's exercise options (weighted where the tools are loadable, bodyweight
  otherwise; pull only with a bar). Exercise/lift names are **i18n keys** (`ex.*`/`lift.*`) the
  engine returns and the UI translates. Actions: `actions/strength.ts`. UI: `/strength` (view +
  `program-form` for setup/settings), `/strength/log` (`strength-workout-logger` — pick a
  suggestion or type a custom exercise, debounced autosave via `saveStrengthWorkout`). Model
  explained in `TRAINING.md`. Server-action files export **only async functions** (pure helpers
  like `incrementFor`/`suggestionsForTools` live in `strength.ts`) — webpack build enforces this.
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

Offline logging + background sync · goals & countdowns (tournament dates, weeks-until) ·
activity feed / notifications · Postgres option + multi-team support. (Also mirrored in README.)
