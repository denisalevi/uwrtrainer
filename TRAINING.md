# Training logic — the strength program

This explains the strength program model the app uses, in plain terms. The maths lives in
[`src/lib/strength.ts`](src/lib/strength.ts) (pure & unit-tested in `strength.test.ts`); the
data model is the `StrengthProgram` table in [`prisma/schema.prisma`](prisma/schema.prisma).

It's based on **Wendler 5/3/1**, adapted so it can also work for people with **no equipment at
all** — not even a pull-up bar. No AI is involved: it's deterministic arithmetic.

> **Status note:** the all-bodyweight *program* variant described in parts of this document is
> currently **hidden in the app** — nobody on the team used it, and a more flexible
> routine-based replacement is planned (see
> [`docs/plans/custom-routines.md`](docs/plans/custom-routines.md)). The engine still supports
> it, existing bodyweight programs keep working, and individual bodyweight *exercises* (e.g.
> pull-ups on a weighted day) remain available everywhere.

## The core idea (in plain words)

- **Training max** — we don't train against your true one-rep maximum. We use about **90 %**
  of it, the "training max". Every working set is a percentage of *that*. This keeps training
  off the true limit, so it's safer and you always have room to grow.
- **The last set is "as many good reps as possible" (AMRAP).** Beating the target rep count
  is how the app knows you're getting stronger — and it's what drives your next step up.
- **A 4-week wave.** Three weeks get gradually heavier; the fourth is an easy *deload* week to
  recover. Then it repeats, slightly stronger.

| Week | Scheme | Top set (% of training max) |
|------|--------|-----------------------------|
| 1 | 3×5+ | 85 % |
| 2 | 3×3+ | 90 % |
| 3 | 5/3/1+ | 95 % (the "test" week) |
| 4 | deload | 60 % (easy) |

## Equipment, days & the auto-layout

The four "core" lifts are **squat / hinge (deadlift) / push (bench) / press (overhead)**, plus an
optional **pull (row / pull-up)**. You don't hand-place them — the app **lays them out across
your week automatically** from a few inputs, following two rules grounded in Wendler (the maths
is `buildSchedule()` in `src/lib/strength.ts`, unit-tested):

**Rule 1 — weighted days are *split*; each lift is loaded once a week.** Heavy barbell work is
recovery-limited, so you never do all four loaded lifts in one ordinary session. The spreadsheet's
own pairing is lower + upper-push: **{squat, bench}** and **{deadlift, press}**. So:

| Weighted days/week | Layout |
|--------------------|--------|
| 4 | one lift per day |
| 3 | squat+bench · deadlift · press |
| 2 | squat+bench · deadlift+press |
| 1 | *see "one weighted day" below* |

**Rule 2 — bodyweight days are *full-body*; all four patterns, every time.** Bodyweight work
isn't recovery-limited and gains come from **frequency and volume**, not from one heavy session.
So every bodyweight day trains all four patterns, and **session length controls the number of
sets**, not which movements you do (the bodyweight equivalent of Boring But Big scaling).

This is why a 2-day all-bodyweight plan still does the full body each session, while a 2-day
weighted plan splits the lifts — the "once a week" rule is a *loading* constraint that simply
doesn't apply without load.

**Equipment is per day.** A quick top choice ("I have weights" / "Bodyweight only") sets every
day, but you can flip any single day. That's how the mixed athlete works — e.g. **one weighted
day + one bodyweight day**: the weighted day runs the split (or rotates, below), and the
bodyweight day is the full-body volume session.

**Pull rides a pressing day.** A row/pull-up isn't a Wendler main lift, so it doesn't get its own
session — it attaches to the **lightest weighted pressing day** (never the deadlift day, to avoid
posterior overload; on bodyweight days it's just one of the patterns). The trainer toggle decides
whether it appears at all.

**Choosing exercises.** Each lift has a **Modify** picker offering **all** options — with-weights
(barbell / dumbbell / kettlebell) *and* without-weights (the bodyweight ladder), or
*type-your-own* — each shown with the tool it needs (e.g. *Back squat (Barbell)*). The chosen
exercise decides how that lift is performed, so you can do **a bodyweight exercise even on a
weighted day** — e.g. barbell everything but pull-ups for the row. The dividing line is how you
*progress*: a **barbell row** adds kilos (with-weights), a **pull-up — even a weighted one** adds
reps (without-weights, the top rung of the ladder). Maxima are **stored per lift and shared**: one
working weight (kg) and one rep target, used wherever that lift appears; the field next to each
lift follows the exercise you picked. The **bodyweight ladders** go easiest → hardest (push:
*knee push-up → push-up → feet-elevated → archer → one-arm*). A live **preview** shows exactly
what each day becomes.

**One weighted day.** Four lifts don't fit one session every week, so you choose:
- **Alternate (2-week):** squat+bench one week, deadlift+press the next — each lift loaded
  biweekly, ~50-min sessions. (The plan shows which half this is: *week A / week B*.)
  Because each pair only trains every second week, each pair steps through its **own 4-week
  wave** at its own pace — your Nth squat+bench session is that pair's wave week N. A full
  cycle therefore spans **8 program weeks**, and every lift still gets its week-3 test and its
  deload (pair A tests on program week 5 and deloads on week 7; pair B on weeks 6 and 8):

  | Program week | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
  |---|---|---|---|---|---|---|---|---|
  | Pair | A | B | A | B | A | B | A | B |
  | That pair's wave week | 1 | 1 | 2 | 2 | 3 | 3 | 4 | 4 |

- **All-in-one:** all four loaded in one long (~2 h) session, every lift every week.

**Logging a strength session** is always one full session, never a single lift. Open the workout
logger (from *Log → Strength*, or the strength page) and either **pick a day from your plan** to
preload its exercises, or **start empty** and add exercises as you go. The day's exercises are
preselected as lines — type the sets you did (or swap an exercise / type your own), and it
auto-saves. **Editing** a logged strength session reopens this same full-session view.

## Starting out — how the first numbers are set

The **training max (TM)** is the single number every working set is calculated from. To stop people
typing an all-out max straight in (which breaks the wave by week 1), setup asks for a *set you can
actually do* rather than the TM itself, and estimates the TM **submaximally** from it. The computed
TM is shown live as you type, and appears next to each lift in the plan, the logger, and your logs.

- **You know a recent set (the default):** enter the **most weight you can lift for a few clean
  reps**. We estimate your one-rep max with the **Brzycki** formula — the same one the source
  spreadsheet uses — and take the configurable training-max % (default 90 %) of it, rounded to a
  loadable increment:

  ```
  one-rep max ≈ weight ÷ (1.0278 − 0.0278 × reps)
  training max ≈ one-rep max × trainingMaxPct   (default 0.9)
  ```

- **Advanced — you already know your TM:** expand *enter training max directly* and type it in.

- **You don't know:** just start light (or one rung up from the easiest variation). It's
  *meant* to feel easy for the first cycle — better too light than too heavy.

## What if you can't keep up? — the adjustment rule (no "failing")

Falling short is built into the system, not a failure:

- **Missed a session** → just log it. The plan and weights don't change.
- **Came up short on the test set** → the app **holds** the same numbers for the next cycle.
- **Short two cycles in a row** → it **eases back about 10 %** and rebuilds (Wendler's reset).
  Short cycles are counted **per lift** — a stalling press never forces a reduce on a squat
  that only just had its first bad day.
- **Short on time** → drop the extra "Boring But Big" volume and do just the main sets, or
  take a deload week.

In code these are the three outcomes of `decideAdjustment()`: **increase / hold / reduce**.

## Days & extra volume

You set up **1–4 sessions per week** (each with a name); the app lays the lifts out across them
automatically, or you take over the per-session layout in the settings. There is no per-session
time setting any more — you log the actual duration when you train.

**Extra volume (Boring But Big).** Wendler's optional assistance is **opt-in in the logger**:
one tap adds a light high-rep set — by default **10 reps at about 50 %** of the training max,
with the percentage and reps configurable per user in Settings. The main 5/3/1 sets are what
drive progress, so skipping it is always fine.

Most UWR players also train rugby 1–3×/week, so **2 strength days** is a sensible default — and
the rugby practices stay the priority.

## Notes for the trainer

The plan setup has a free-text **notes** box — use it to tell your trainer anything the settings
can't capture (no barbell at home, an injury to work around, days you can't make). It shows on
your strength plan where a trainer can see it.
