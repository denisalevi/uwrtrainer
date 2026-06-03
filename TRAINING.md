# Training logic — the strength program

This explains the strength program model the app uses, in plain terms. The maths lives in
[`src/lib/strength.ts`](src/lib/strength.ts) (pure & unit-tested in `strength.test.ts`); the
data model is the `StrengthProgram` table in [`prisma/schema.prisma`](prisma/schema.prisma).

It's based on **Wendler 5/3/1**, adapted so it also works for people with **no equipment at
all** — not even a pull-up bar. No AI is involved: it's deterministic arithmetic.

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

**Choosing exercises.** Each lift has a **Modify** picker: a weighted variant (barbell / dumbbell
/ kettlebell) and a bodyweight variant (the ladder), or *type-your-own*. The same lift can be
loaded on one day and bodyweight on another — its **maxima are stored per lift and shared**: one
working weight (kg) and one rep target, used wherever that lift appears. The **bodyweight ladders**
go easiest → hardest (push: *knee push-up → push-up → feet-elevated → archer → one-arm*); the
variant you pick sets your starting rung. A live **preview** shows exactly what each day becomes.

**One weighted day.** Four lifts don't fit one session every week, so you choose:
- **Alternate (2-week):** squat+bench one week, deadlift+press the next — each lift loaded
  biweekly, ~50-min sessions. (The plan shows which half this is: *week A / week B*.)
- **All-in-one:** all four loaded in one long (~2 h) session, every lift every week.

When logging, the day's exercises are **preselected** as lines — you just type the sets you did
(or swap an exercise / type your own), and it auto-saves as you go.

## Starting out — how the first numbers are set

- **You know a recent set:** enter "*X kg for Y reps*" (or, bodyweight, your max clean reps).
  We estimate your one-rep max with the **Brzycki** formula — the same one the source
  spreadsheet uses — and take 90 % of it as your training max:

  ```
  one-rep max ≈ weight ÷ (1.0278 − 0.0278 × reps)
  ```

- **You don't know:** just start light (or one rung up from the easiest variation). It's
  *meant* to feel easy for the first cycle — better too light than too heavy.

## What if you can't keep up? — the adjustment rule (no "failing")

Falling short is built into the system, not a failure:

- **Missed a session** → just log it. The plan and weights don't change.
- **Came up short on the test set** → the app **holds** the same numbers for the next cycle.
- **Short two cycles in a row** → it **eases back about 10 %** and rebuilds (Wendler's reset).
- **Short on time** → drop the extra "Boring But Big" volume and do just the main sets, or
  take a deload week.

In code these are the three outcomes of `decideAdjustment()`: **increase / hold / reduce**.

## Days, time & extra volume

You set up **1–4 days**, each with its **equipment** (weights / bodyweight) and a **session
length**. Day count and time are two views of the same total weekly work — spread the lifts over
more days and each session shrinks. The app **suggests a comfortable length** per day (more lifts
= longer): roughly 4 days ≈ 45 min, 2 days ≈ 60 min, an all-in-one weighted day ≈ 2 h. You can
shorten any day.

**Extra volume (Boring But Big).** On longer weighted sessions the app adds Wendler's optional
"Boring But Big" assistance — **5 sets of 10** at about **50 %** of the training max — to build
muscle on top of the main work. Short on time? It's **dropped automatically**; the main 5/3/1
sets are what drive progress, so a short day still "counts". On bodyweight days the same idea
applies as more or fewer sets of each pattern.

Most UWR players also train rugby 1–3×/week, so **2 strength days** is a sensible default — and
the rugby practices stay the priority.

## Notes for the trainer

The plan setup has a free-text **notes** box — use it to tell your trainer anything the settings
can't capture (no barbell at home, an injury to work around, days you can't make). It shows on
your strength plan where a trainer can see it.
