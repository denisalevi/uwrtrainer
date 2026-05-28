# UWR Trainer

A small, self-hosted web app for amateur sports teams (built for underwater rugby, but
generic) to **agree training plans, log what you actually do, and stay motivated** with
adherence-based leaderboards.

The guiding principle (from coach feedback): **reward keeping to your agreed plan more than
raw volume.** A laid-back player who commits to little and keeps it scores similarly to a
highly-committed player who keeps a big plan — so everyone stays in the game.

It's an installable mobile web app (PWA), works in English and German (per user), and runs
from a single Docker Compose stack.

## Features

- **Accounts & roles** — email + password sign-in; players, trainers, and an admin.
  The first account created becomes the admin.
- **Team practice schedule** — trainers define weekly practices in tiers: one **mandatory**
  (everyone), one **aim-to-attend**, and **optional** extras.
- **Plans** — each player commits to which practices they'll attend plus weekly targets for
  strength / cardio / mobility. Players set their own, or a trainer sets it with them.
- **Logging** — quick session logging (rugby attendance, strength sets/reps/weight, cardio
  heart-rate zone), including logging a *missed* session with a reason.
- **Adherence scoring** — full adherence is worth a fixed weekly base regardless of plan
  size; missing a mandatory practice hurts more than an optional one; overshoot earns a small
  capped bonus. All tunable in [`src/lib/scoring.ts`](src/lib/scoring.ts).
- **Multiple leaderboards** — adherence points, rugby practices, mandatory practices, and
  streaks. Each can be turned **on/off** independently and set **trainers-only** or
  **everyone**, by week / month / year.
- **Installable PWA** — add to your phone's home screen; cached app shell.

## Tech stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS · Prisma 7 with SQLite (libSQL
driver adapter) · custom session auth (jose JWT + bcrypt) · serwist (PWA) · Docker + Caddy.

## Deploy with Docker (recommended)

Requirements: Docker + Docker Compose (works with rootless Docker).

```bash
# 1. Configure environment
cp .env.example .env
# edit .env:
#   SESSION_SECRET=<output of: openssl rand -base64 32>
#   APP_DOMAIN=uwr.example.com    # your domain (omit/localhost for local testing)

# 2. Build and start (app + Caddy with automatic HTTPS)
docker compose up -d --build
```

- Open `https://APP_DOMAIN` and **sign up** — the first account becomes the admin/trainer.
- Migrations run automatically on start; the SQLite DB persists in the `db-data` volume.
- Default leaderboards are created automatically (two on for everyone, two off for trainers).

> **Rootless Docker & ports 80/443:** Caddy needs ports 80/443 for HTTPS + ACME. Rootless
> Docker may not bind privileged ports by default. Either allow it
> (`sudo setcap cap_net_bind_service=+ep $(which rootlesskit)` or lower
> `net.ipv4.ip_unprivileged_port_start`), or run the app behind your existing reverse proxy:
> comment out the `caddy` service in `docker-compose.yml` and uncomment the app `ports:` block.

### Backups

The whole database is one file inside the `db-data` volume:

```bash
docker compose cp app:/data/uwrtrainer.db ./backup-$(date +%F).db
```

## Local development

No Node.js on the host? Everything runs in a container:

```bash
# install deps + generate client + migrate + seed demo data
docker run --rm -v "$PWD":/app -w /app node:22-slim sh -c \
  "npm ci && npx prisma generate && npx prisma migrate deploy && npm run db:seed"

# run the dev server
docker run --rm -it -p 3000:3000 -v "$PWD":/app -w /app node:22-slim \
  npx next dev -H 0.0.0.0 -p 3000
```

Then open http://localhost:3000. Demo logins (password `password123`):
`nando@example.com` (admin/trainer), `linus@example.com`, `denis@example.com`, `mia@example.com`.

With Node installed locally you can instead use `npm run dev`, `npm test`, `npm run db:seed`.

### Useful scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Dev server (Turbopack) |
| `npm run build` | Production build (webpack, for the serwist service worker) |
| `npm test` | Scoring unit tests (Vitest) |
| `npm run db:seed` | Seed demo data |
| `node scripts/gen-icons.mjs` | Regenerate PWA icons |

## Roadmap (not yet built)

- Offline logging + background sync (log at the pool with no signal).
- Goals & countdowns (e.g. tournament dates, weeks-until timers).
- Activity feed / notifications ("who did what when") for peer motivation.
- Postgres option + multi-team support.

## Project layout

- `src/lib/scoring.ts` — adherence/points logic (pure, unit-tested).
- `src/lib/stats.ts` — week/period aggregation and leaderboards.
- `src/lib/{session,dal}.ts` — auth session + data-access layer.
- `src/lib/i18n/` — `en`/`de` dictionaries and helpers.
- `src/app/` — App Router pages; `src/app/actions/` — server actions.
- `prisma/schema.prisma` — data model; `prisma/migrations/` — schema + default seed.
