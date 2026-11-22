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
- **Logging** — quick session logging (rugby attendance, whole strength workouts, cardio
  heart-rate zone, free-text session notes). You only log what you *did* — each week box
  shows how far you got ("2 of 3 done", 🎉 when everything's reached) and takes one
  free-text reason when a week fell short.
- **Group attendance & games** — tick off who came to a practice (scheduled or a one-off
  with a custom name), and log tournament / league games (which pause the selected
  players' weekly goals instead of counting against them).
- **Activity feed** — everything the team logged, newest first, with practice attendance
  editable in place.
- **Strength program** — a guided Wendler 5/3/1-style plan: it picks weights/reps for you,
  every lift progresses on its own automatic 4-week wave as you log it, and it explains
  itself in-app. Sessions are logged in a workout logger with autosave, rest timer, session
  clock and per-lift history. Pausable any time (state kept). Full model in
  [`TRAINING.md`](TRAINING.md).
- **Custom routines** — build your own named workouts next to the 5/3/1 program: free-text
  exercises measured in kg × reps, reps only, seconds (planks/holds) or kg × seconds, with
  optional tempo prescriptions and per-exercise rest. Active routines show up in the workout
  logger (prefilled from your last session of that routine), trainers can publish routines to
  the team, and teammates' routines can be copied with one tap.
- **Saved links** — name a warm-up or cool-down link once (a video, a mobility routine) and
  it's saved to your link library: pick it from a dropdown next time and tap it. Manage the
  library in Settings, share a link with the team so it appears in everyone's dropdown (shown
  with who shared it), and switch team links off if you'd rather only see your own.
- **Multi-team** — several teams in one instance, with join codes, an account-less roster
  (claim your entry when you sign up), and per-team feeds/leaderboards.
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

## Deploy with Docker

Requirements: Docker + Docker Compose (works with rootless Docker).

```bash
# 1. Configure environment
cp .env.example .env
# edit .env: set SESSION_SECRET=<output of: openssl rand -base64 32>
#            (optionally change APP_PORT; default 3000, bound to 127.0.0.1)

# 2. Build and start the app (published on 127.0.0.1:${APP_PORT})
docker compose up -d --build
```

Migrations run automatically on start; the SQLite DB persists in the `db-data` volume.
Default leaderboards are created automatically (two on for everyone, two off for trainers).
**Sign up** to create the first account — it becomes the admin/trainer.

> **Protect signup on a public URL.** With Funnel the app is on the public internet, so set
> `REGISTRATION_CODE` in `.env` (e.g. `openssl rand -hex 4`) before sharing the link. Every
> signup — including the first/admin — then requires that code, so randoms can't register or
> grab the admin account. Share the code with teammates; leave it empty only on a trusted/local
> network.

> **Email verification & password reset (optional).** Fill the `SMTP_*` block in `.env`
> (any SMTP submission service — e.g. Brevo's free tier: host `smtp-relay.brevo.com`, port
> `587`, login + key from *Brevo → Settings → SMTP & API*) plus `MAIL_FROM` and `APP_URL`
> (your public URL, used in the emailed links), then `docker compose up -d`. New signups must
> then confirm their email before they can log in, and "Forgot password?" appears on the
> sign-in page. With `SMTP_HOST` empty the app behaves as before: signup works without
> verification and password reset is unavailable (existing accounts are unaffected either way).

The app listens on an **unprivileged port (3000 by default)** bound to localhost, so there's
nothing special to do under rootless Docker. Put HTTPS in front of it one of two ways:

### Option A — Tailscale Funnel (recommended; no certificates to manage)

Funnel provisions and auto-renews a Let's Encrypt cert for your machine's `*.ts.net` name and
terminates TLS for you — you just point it at the local port. On the host (where `tailscaled`
runs, *not* in the container):

```bash
# One-time tailnet setup:
#  - Admin console → DNS: enable MagicDNS and HTTPS certificates
#  - Admin console → Access controls: give this node the "funnel" nodeAttr
tailscale funnel --bg 3000        # use your APP_PORT if you changed it
tailscale funnel status           # shows the public https://<host>.<tailnet>.ts.net URL
```

Open the printed `https://<host>.<tailnet>.ts.net` URL. That's it — Tailscale handles the SSL.
(Funnel forwards plain HTTP to localhost, but the public connection is HTTPS, so the app's
secure session cookies work correctly.) To stop: `tailscale funnel --bg off`.

> If you changed `APP_PORT`, point Funnel at that same port. Keep `APP_BIND=127.0.0.1` so the
> app is only reachable via Funnel, not directly on your LAN.

### Option B — Built-in Caddy (public domain, automatic HTTPS)

Only if you're *not* using Funnel. Set `APP_DOMAIN` in `.env`, then:

```bash
docker compose --profile caddy up -d --build
```

> **Rootless Docker & ports 80/443:** Caddy needs 80/443 for HTTPS + ACME, which rootless
> Docker may not bind by default. Either allow it
> (`sudo setcap cap_net_bind_service=+ep $(which rootlesskit)` or lower
> `net.ipv4.ip_unprivileged_port_start`), or set `HTTP_PORT`/`HTTPS_PORT` in `.env` (e.g.
> `8080`/`8443`) and front it with something that can.

### Backups

The whole database is one file inside the `db-data` volume:

```bash
docker compose cp app:/data/uwrtrainer.db ./backup-$(date +%F).db
```

## Read-only feed API (for bots)

An admin can create **API tokens** in Settings → Admin → API tokens. A token is bound to one
team and can only read that team's activity feed — nothing else, and it can't change anything.
The raw token (`uwr_…`) is shown once at creation; the app stores only its SHA-256 hash.
Revoke it in the same place (takes effect immediately).

```bash
curl -H "Authorization: Bearer uwr_…" \
  "https://<your-app>/api/v1/feed?since=2026-11-16&until=2026-11-20"
```

- `since` / `until`: inclusive days, `YYYY-MM-DD`, server-local. Default: the last 7 days.
  Max window 92 days. Future-dated entries are never returned.
- Rate limit: 30 requests/minute per token (`429` + `Retry-After`).
- Errors: `401` bad/missing/revoked token, `400` bad range.

Response (only what teammates already see in the feed; auto-generated "missed" rows, miss
reasons, emails and ids are left out):

```json
{
  "team": "My Team",
  "since": "2026-11-16",
  "until": "2026-11-20",
  "count": 2,
  "entries": [
    { "date": "2026-11-19", "member": "Anna", "category": "RUGBY", "status": "DONE",
      "durationMin": 90, "title": "Thursday pool", "note": null },
    { "date": "2026-11-18", "member": "Linus", "category": "STRENGTH", "status": "DONE",
      "durationMin": 50, "title": "Day A", "note": null,
      "exercises": [ { "name": "Squat", "sets": ["40 kg × 5", "80 kg × 5", "90 kg × 6+"] } ] }
  ]
}
```

`category` is one of RUGBY, STRENGTH, CARDIO, MOBILITY, OTHER, TOURNAMENT; `status` is DONE or
MISSED; `title` is the practice / tournament / routine / 5/3/1 day name or the free-text
activity; `exercises` appears on done strength sessions only.

### Goals and leaderboards: `GET /api/v1/goals`

Same token, same rules. Everything the leaderboards page shows, plus each member's plan
against what they did. Two shapes, matching the two views in the app:

- `?period=week` (default; optional `&date=YYYY-MM-DD` picks the week) or a custom
  `?since=…&until=…` window (max 92 days): the **week view**. `members[].weeks` holds the weekly
  goals per Mon–Sun week, exactly like the weekly leaderboard (tournament-exempt weeks count as
  100%). Monthly goals are not part of it.
- `?period=month|year` (optional `&date=`): the **month view**, no weeks. Every goal becomes a
  target for the calendar month: a weekly goal is `planned × days in the month / 7`, rounded down
  (2 per week in November → 8), leaving out days of tournament-exempt weeks; a monthly goal keeps
  its target. Done = sessions dated in the month. The month % is reached / target over all goals,
  each capped at its target. A fully kept month is worth 100 points (+ up to 10 overshoot
  bonus); a year adds up its months.
- Rate limit 10 requests/minute per token. Don't mix `period`/`date` with `since`/`until`.

Month view (`period=month&date=2026-10-15`):

```json
{
  "team": "My Team", "period": "month", "since": "2026-10-01", "until": "2026-10-31",
  "leaderboards": {
    "ADHERENCE_POINTS":  [ { "rank": 1, "member": "Denis", "value": 96 } ],
    "RUGBY_PRACTICES":   [ { "rank": 1, "member": "Denis", "value": 9 } ],
    "PRIMARY_PRACTICES": [],
    "STREAK":            [ { "rank": 1, "member": "Denis", "value": 2 } ]
  },
  "members": [
    { "member": "Denis", "points": 96, "adherencePct": 94,
      "plannedSessions": 17, "reachedSessions": 16, "totalSessions": 17,
      "rugbyPractices": 9, "primaryPractices": 0, "streak": 2,
      "months": [
        { "month": "2026-10", "complete": true, "hasPlan": true, "adherencePct": 94,
          "target": 17, "reached": 16, "points": 96,
          "goals": [
            { "category": "RUGBY", "label": null, "cadence": "WEEK", "planned": 2, "target": 8, "done": 9, "reached": true },
            { "category": "CARDIO", "label": null, "cadence": "MONTH", "planned": 6, "target": 6, "done": 6, "reached": true },
            { "category": "OTHER", "label": "Climbing", "cadence": "MONTH", "planned": 3, "target": 3, "done": 2, "reached": false } ] } ] }
  ]
}
```

`adherencePct` (0–100) is the final % for the whole period = `reachedSessions / plannedSessions`.
`cadence` says whether a goal was planned per week (`WEEK`, `planned` = per week) or per month
(`MONTH`). Months that haven't started are left out; the running month has `complete: false`.

Week view (`period=week`):

```json
{
  "team": "My Team", "period": "week", "since": "2026-11-16", "until": "2026-11-22",
  "leaderboards": { "ADHERENCE_POINTS": [ { "rank": 1, "member": "Linus", "value": 50 } ], "…": [] },
  "members": [
    { "member": "Linus", "points": 50, "avgAdherencePct": 50, "weeksWithPlan": 1, "fullWeeks": 0,
      "streak": 0, "rugbyPractices": 1, "primaryPractices": 1,
      "totalSessions": 1, "plannedSessions": 3, "reachedSessions": 1,
      "weeks": [
        { "weekStart": "2026-11-16", "complete": false, "hasPlan": true, "exempt": false,
          "adherencePct": 50, "points": 50,
          "goals": [
            { "category": "RUGBY", "cadence": "WEEK", "practice": "Tuesday pool", "tier": "PRIMARY", "target": 1, "done": 1 },
            { "category": "STRENGTH", "cadence": "WEEK", "practice": null, "tier": null, "target": 2, "done": 0 } ] } ] }
  ]
}
```

Both: `totalSessions` = all DONE sessions in the period, planned or not; `plannedSessions` /
`reachedSessions` = sum of targets / done capped at each target — enough to tell "big plan, half
reached, lots done" from "small plan, fully kept". `leaderboards` lists every metric (including
ones disabled or trainer-only on the page), value > 0 only, ties share a rank. `members` is
sorted by points; `points` is that period's "Plan adherence points" exactly as the app shows
them. `streak` is the current streak of completed 100% weeks (independent of the period, as in
the app). Plan notes and miss reasons are not included.

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
- Notifications for peer motivation.
- Postgres option.

## Project layout

- `src/lib/scoring.ts` — adherence/points logic (pure, unit-tested).
- `src/lib/stats.ts` — week/period aggregation and leaderboards.
- `src/lib/{session,dal}.ts` — auth session + data-access layer.
- `src/lib/i18n/` — `en`/`de` dictionaries and helpers.
- `src/app/` — App Router pages; `src/app/actions/` — server actions.
- `prisma/schema.prisma` — data model; `prisma/migrations/` — schema + default seed.
