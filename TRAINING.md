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

## Equipment & days

Setup starts with **one choice**: **"I have weights"** or **"Bodyweight only"** (bodyweight
assumes a pull-up bar). That preselects a default exercise for each movement — the classic
barbell lifts (squat / bench / deadlift / overhead press, and a row if the trainer enables a
pull), or the bodyweight ladders.

You then set up **training days** (e.g. "Gym", "Home"). Each day is a list of **exercise slots**,
one per movement, each shown with the exercise and the tool it needs (e.g. *Bench press
(Barbell)*). **Adding a day copies the previous day**, so you only adjust what's different.

Any slot has a **Modify** button opening a picker of alternatives for that movement, grouped
**With weights** (barbell / dumbbell / kettlebell) and **Without weights** (the bodyweight
ladder), plus a *type-your-own* option. So a weights program can drop a single exercise to
bodyweight (or vice-versa) — e.g. you have a barbell for squats but only do push-ups for chest.

**Maxima are per movement, shared across all days**: you enter one working weight (kg) for each
weighted movement and one rep target for each bodyweight movement, inline on the slot.

The five movement patterns are squat / hinge (deadlift) / push (bench) / press (overhead) and an
optional pull (row / pull-up). The **bodyweight ladders** go easiest → hardest at a realistic
starting point, e.g. push: *knee push-up → push-up → feet-elevated → archer → one-arm*; picking
a harder variation in Modify sets your starting rung. Exercise names are shown in English and
German.

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

## How many days per week?

You choose **days (1–4)** and **minutes per session**; the app maps that to a schedule
(`pickTemplate()`):

| Days | Schedule |
|------|----------|
| 4 | one movement per day |
| 3 | movements rotate across sessions |
| 2 | two movements per session |
| 1 | one short full-body session |

**Extra volume (Boring But Big).** Pick a session length per day. Sessions of **60 min or more**
add Wendler's optional "Boring But Big" assistance — **5 sets of 10** at about **50 %** of the
training max — to build muscle on top of the main work. Shorter sessions (e.g. 30–45 min)
**drop it automatically** and keep just the main 5/3/1 sets; those sets are what drive progress,
so a short day still "counts". Most UWR players also train rugby 1–3×/week, so **2 strength
days** is a sensible default — and the rugby practices stay the priority.
