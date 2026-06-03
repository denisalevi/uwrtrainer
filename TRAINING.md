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

## Three modes — picked from your equipment

| You have… | Mode | How you progress |
|-----------|------|------------------|
| Nothing (bodyweight) | **LEVELS** | More reps, then a **harder variation** of the move |
| A pull-up bar | **REPS** | More reps on the movement |
| Dumbbells / barbell / gym | **WEIGHTED** | Add kilos (classic 5/3/1) |

The four movements trained are a push, a pull, a squat and a hinge (bodyweight), or squat /
deadlift / bench / overhead press (weighted). The **bodyweight ladders** go easiest → hardest,
e.g. push: *wall → incline → knee → full → feet-elevated → archer → one-arm*. Graduating to
the next rung is the bodyweight equivalent of adding weight. The first rungs need nothing but a
floor, a wall, or a sturdy table — so you can start **today, with nothing**.

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

Sessions of **≤ 30 min** automatically drop the extra assistance volume and keep the main work.
Most UWR players also train rugby 1–3×/week, so **2 strength days** is a sensible default — and
the rugby practices stay the priority.
