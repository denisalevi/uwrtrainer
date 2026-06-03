// UWR Trainer — strength program engine (pure, unit-tested; no DB, no React).
//
// A Wendler 5/3/1-style model that ALSO works with no equipment. Everything here is
// deterministic maths — no AI needed. User-facing wording lives in i18n; this file uses
// clear internal names and explains the model in plain terms in TRAINING.md.
//
// Three progression modes, picked from the athlete's equipment:
//   WEIGHTED  – loaded barbell/dumbbells. Progress by adding kilos (classic 5/3/1).
//   REPS      – a fixed bodyweight movement (e.g. pull-ups). Progress by adding reps.
//   LEVELS    – no/!minimal equipment. Progress by reps, then by a harder variation.
//
// Shared spine for all three: a 4-week "wave" (3 build weeks + 1 easy week), where the
// last working set is "as many good reps as possible" (AMRAP). That AMRAP set both
// estimates your max and drives the adjustment rule.

import {
  STRENGTH_MODES,
  type StrengthMode,
  type EquipmentLevel,
  MOVEMENT_LEVELS,
  type MovementKey,
} from "@/lib/constants";

// ────────────────────────────────────────────────────────────── Estimating a max ──

/**
 * Estimate a one-rep max from a set of `reps` at `weight` (Brzycki — same formula the
 * source spreadsheet uses). Valid up to ~12 reps; we clamp to keep it sane.
 *   1RM = weight / (1.0278 − 0.0278 × reps)
 */
export function estimateOneRepMax(weight: number, reps: number): number {
  const r = Math.max(1, Math.min(12, Math.round(reps)));
  if (weight <= 0) return 0;
  return weight / (1.0278 - 0.0278 * r);
}

/** Round to the nearest loadable increment (e.g. 2.5 kg). */
export function roundToIncrement(value: number, increment: number): number {
  if (increment <= 0) return value;
  return Math.round(value / increment) * increment;
}

/**
 * The "training max" is what every working set is calculated from — deliberately set
 * below your true max (default 90%) so training never grinds to a true limit and you
 * have room to grow. Rounded to a loadable increment.
 */
export function trainingMaxFromOneRepMax(
  oneRepMax: number,
  pct = 0.9,
  increment = 2.5,
): number {
  return roundToIncrement(oneRepMax * pct, increment);
}

// ──────────────────────────────────────────────────────────────────── The wave ──

export type WaveSet = {
  /** Fraction of the training max (WEIGHTED) or of the rep max (REPS/LEVELS). */
  pct: number;
  /** Prescribed reps for this set. */
  reps: number;
  /** "As many reps as possible" — only the last build-week set. */
  amrap?: boolean;
};

export type WaveWeek = {
  week: 1 | 2 | 3 | 4;
  /** Short scheme label, e.g. "3×5". Deload week is the easy one. */
  scheme: string;
  deload: boolean;
  sets: WaveSet[];
};

/** Wendler's classic percentages. Week 3 is the heavy "test" week; week 4 is the deload. */
export const WAVE: Record<1 | 2 | 3 | 4, WaveWeek> = {
  1: {
    week: 1,
    scheme: "3×5+",
    deload: false,
    sets: [
      { pct: 0.65, reps: 5 },
      { pct: 0.75, reps: 5 },
      { pct: 0.85, reps: 5, amrap: true },
    ],
  },
  2: {
    week: 2,
    scheme: "3×3+",
    deload: false,
    sets: [
      { pct: 0.7, reps: 3 },
      { pct: 0.8, reps: 3 },
      { pct: 0.9, reps: 3, amrap: true },
    ],
  },
  3: {
    week: 3,
    scheme: "5/3/1+",
    deload: false,
    sets: [
      { pct: 0.75, reps: 5 },
      { pct: 0.85, reps: 3 },
      { pct: 0.95, reps: 1, amrap: true },
    ],
  },
  4: {
    week: 4,
    scheme: "Deload",
    deload: true,
    sets: [
      { pct: 0.4, reps: 5 },
      { pct: 0.5, reps: 5 },
      { pct: 0.6, reps: 5 },
    ],
  },
};

export function waveWeek(week: number): WaveWeek {
  const w = (((week - 1) % 4) + 4) % 4; // tolerate any 1..n cycling
  return WAVE[((w + 1) as 1 | 2 | 3 | 4)];
}

// ───────────────────────────────────────────────────────── Generating a workout ──

export type WorkoutSet = {
  /** Loaded weight in kg (WEIGHTED only). */
  weight?: number;
  reps: number;
  amrap: boolean;
};

export type MovementWorkout = {
  mode: StrengthMode;
  /** WEIGHTED/REPS: the lift name. LEVELS: the current variation's label. */
  movementLabel: string;
  scheme: string;
  deload: boolean;
  sets: WorkoutSet[];
  /** Optional "Boring But Big" assistance volume (added when there's time). */
  assistance?: { sets: number; reps: number; weight?: number };
};

const ASSISTANCE_PCT = 0.5; // Boring But Big = 5×10 at 50% of training max

/** WEIGHTED: working sets in kg from a training max. */
export function weightedWorkout(
  trainingMax: number,
  week: number,
  opts: { increment?: number; movementLabel: string; withAssistance?: boolean } = {
    movementLabel: "",
  },
): MovementWorkout {
  const inc = opts.increment ?? 2.5;
  const w = waveWeek(week);
  const sets = w.sets.map((s) => ({
    weight: roundToIncrement(trainingMax * s.pct, inc),
    reps: s.reps,
    amrap: !!s.amrap,
  }));
  return {
    mode: "WEIGHTED",
    movementLabel: opts.movementLabel,
    scheme: w.scheme,
    deload: w.deload,
    sets,
    assistance: opts.withAssistance
      ? { sets: 5, reps: 10, weight: roundToIncrement(trainingMax * ASSISTANCE_PCT, inc) }
      : undefined,
  };
}

/**
 * REPS / LEVELS: bodyweight working sets. The "rep max" plays the role of the training
 * max; each set's reps = round(pct × repMax), at least 1. The last build set is AMRAP.
 */
export function bodyweightWorkout(
  repMax: number,
  week: number,
  opts: { mode?: StrengthMode; movementLabel: string; withAssistance?: boolean } = {
    movementLabel: "",
  },
): MovementWorkout {
  const w = waveWeek(week);
  const sets = w.sets.map((s) => ({
    reps: Math.max(1, Math.round(s.pct * repMax)),
    amrap: !!s.amrap,
  }));
  return {
    mode: opts.mode ?? "LEVELS",
    movementLabel: opts.movementLabel,
    scheme: w.scheme,
    deload: w.deload,
    sets,
    assistance: opts.withAssistance ? { sets: 5, reps: 10 } : undefined,
  };
}

/** LEVELS: resolve the variation label for a movement at a given difficulty level. */
export function levelLabel(movement: MovementKey, levelIndex: number): string {
  const levels = MOVEMENT_LEVELS[movement];
  const i = Math.max(0, Math.min(levels.length - 1, levelIndex));
  return levels[i];
}

// ───────────────────────────────────────────────────────── The adjustment rule ──
//
// Not "pass/fail". After the week-3 AMRAP set we decide how to set up the NEXT cycle:
//   INCREASE – you hit (or beat) the prescribed reps → step up.
//   HOLD     – you fell short → repeat the same numbers next cycle, no shame.
//   REDUCE   – short two cycles running → ease back ~10% and rebuild (Wendler's reset).

export const ADJUSTMENTS = ["INCREASE", "HOLD", "REDUCE"] as const;
export type Adjustment = (typeof ADJUSTMENTS)[number];

/**
 * Decide the adjustment from how the heavy (week-3) AMRAP set went.
 * `consecutiveHolds` = how many cycles in a row already ended in HOLD.
 */
export function decideAdjustment(
  amrapReps: number,
  prescribedReps: number,
  consecutiveHolds = 0,
): Adjustment {
  if (amrapReps >= prescribedReps) return "INCREASE";
  if (consecutiveHolds >= 1) return "REDUCE";
  return "HOLD";
}

const REDUCE_PCT = 0.9; // reset to 90% of current

/** Apply an adjustment to a WEIGHTED training max for the next cycle. */
export function nextTrainingMax(
  trainingMax: number,
  adjustment: Adjustment,
  opts: { increment?: number; rounding?: number } = {},
): number {
  const inc = opts.increment ?? 2.5;
  const round = opts.rounding ?? inc;
  if (adjustment === "INCREASE") return roundToIncrement(trainingMax + inc, round);
  if (adjustment === "REDUCE") return roundToIncrement(trainingMax * REDUCE_PCT, round);
  return trainingMax; // HOLD
}

/**
 * Apply an adjustment to a bodyweight rep max for the next cycle.
 * REPS: +1 rep on increase. LEVELS: also graduate to the next harder variation once the
 * rep max gets high (>= `graduateAt`), resetting the rep max for the new variation.
 */
export function nextBodyweight(
  state: { repMax: number; levelIndex: number },
  adjustment: Adjustment,
  opts: { mode?: StrengthMode; graduateAt?: number; levelCount?: number; resetReps?: number } = {},
): { repMax: number; levelIndex: number } {
  const mode = opts.mode ?? "LEVELS";
  const graduateAt = opts.graduateAt ?? 15;
  const resetReps = opts.resetReps ?? 5;
  let { repMax, levelIndex } = state;

  if (adjustment === "REDUCE") return { repMax: Math.max(1, repMax - 2), levelIndex };
  if (adjustment === "HOLD") return { repMax, levelIndex };

  // INCREASE
  if (
    mode === "LEVELS" &&
    repMax + 1 >= graduateAt &&
    opts.levelCount != null &&
    levelIndex < opts.levelCount - 1
  ) {
    return { repMax: resetReps, levelIndex: levelIndex + 1 }; // graduate to a harder move
  }
  return { repMax: repMax + 1, levelIndex };
}

// ───────────────────────────────────────────── Equipment → mode, and templates ──

/** Map what the athlete has to the progression mode. Nothing at all is fully supported. */
export function modeForEquipment(equipment: EquipmentLevel): StrengthMode {
  switch (equipment) {
    case "FULL_GYM":
    case "BARBELL":
    case "DUMBBELLS":
      return "WEIGHTED";
    case "PULLUP_BAR":
      return "REPS";
    case "NONE":
    default:
      return "LEVELS";
  }
}

export type SessionTemplate = {
  key: "FOUR_DAY" | "THREE_DAY" | "TWO_DAY" | "ONE_DAY";
  daysPerWeek: number;
  /** How the 4 main movements are distributed across the week's sessions. */
  movementsPerSession: number;
  /** Include Boring But Big assistance volume? Dropped when sessions are short. */
  withAssistance: boolean;
  /**
   * Calendar weeks one "program week" takes. With <4 days the 4 movements spill across
   * more than one calendar week, so a 4-week cycle takes longer in real time.
   */
  calendarWeeksPerProgramWeek: number;
};

/**
 * Pick a template from how many days/week the athlete can train and how long a session
 * lasts. Short sessions (≤30 min) drop the extra assistance volume and keep just the
 * main work. UWR players mostly also do rugby, so 2 days is a realistic default.
 */
export function pickTemplate(daysPerWeek: number, minutesPerSession: number): SessionTemplate {
  const withAssistance = minutesPerSession >= 45;
  const d = Math.max(1, Math.min(4, Math.round(daysPerWeek)));
  if (d >= 4)
    return {
      key: "FOUR_DAY",
      daysPerWeek: 4,
      movementsPerSession: 1,
      withAssistance,
      calendarWeeksPerProgramWeek: 1,
    };
  if (d === 3)
    return {
      key: "THREE_DAY",
      daysPerWeek: 3,
      movementsPerSession: 2, // rotates; ~4 movements over 3 sessions
      withAssistance: withAssistance && minutesPerSession >= 60,
      calendarWeeksPerProgramWeek: 4 / 3,
    };
  if (d === 2)
    return {
      key: "TWO_DAY",
      daysPerWeek: 2,
      movementsPerSession: 2,
      withAssistance: withAssistance && minutesPerSession >= 60,
      calendarWeeksPerProgramWeek: 1,
    };
  return {
    key: "ONE_DAY",
    daysPerWeek: 1,
    movementsPerSession: 4,
    withAssistance: false, // minimalist: main sets only
    calendarWeeksPerProgramWeek: 1,
  };
}

export function isStrengthMode(v: string): v is StrengthMode {
  return (STRENGTH_MODES as readonly string[]).includes(v);
}

// ──────────────────────────────────── Program-level helpers (state + labels) ──

/** Per-movement stored state. WEIGHTED uses trainingMax; REPS/LEVELS use repMax+level. */
export type MovementState = {
  trainingMax?: number;
  repMax?: number;
  levelIndex?: number;
};
export type ProgramState = Partial<Record<MovementKey, MovementState>>;

/** Which 4 movements a program trains. WEIGHTED mirrors classic 5/3/1; bodyweight adds PULL (key for UWR). */
export function programMovements(mode: StrengthMode): MovementKey[] {
  if (mode === "WEIGHTED") return ["SQUAT", "HINGE", "PUSH", "PRESS"];
  return ["PUSH", "PULL", "SQUAT", "HINGE"];
}

const WEIGHTED_LABELS: Record<MovementKey, string> = {
  SQUAT: "Back squat",
  HINGE: "Deadlift",
  PUSH: "Bench press",
  PRESS: "Overhead press",
  PULL: "Barbell row",
};
const REPS_LABELS: Record<MovementKey, string> = {
  PUSH: "Push-up",
  PULL: "Pull-up",
  SQUAT: "Bodyweight squat",
  HINGE: "Single-leg Romanian deadlift",
  PRESS: "Pike push-up",
};

/** Human label for a movement given the mode (and, for LEVELS, the current variation). */
export function movementLabel(
  mode: StrengthMode,
  movement: MovementKey,
  levelIndex = 0,
): string {
  if (mode === "WEIGHTED") return WEIGHTED_LABELS[movement];
  if (mode === "REPS") return REPS_LABELS[movement];
  return levelLabel(movement, levelIndex);
}

/** Build the current week's workout for one movement from the stored program state. */
export function currentWorkout(
  mode: StrengthMode,
  movement: MovementKey,
  state: MovementState,
  week: number,
  opts: { increment?: number; withAssistance?: boolean } = {},
): MovementWorkout {
  if (mode === "WEIGHTED") {
    return weightedWorkout(state.trainingMax ?? 0, week, {
      increment: opts.increment,
      movementLabel: movementLabel(mode, movement),
      withAssistance: opts.withAssistance,
    });
  }
  return bodyweightWorkout(state.repMax ?? 5, week, {
    mode,
    movementLabel: movementLabel(mode, movement, state.levelIndex ?? 0),
    withAssistance: opts.withAssistance,
  });
}

/** Lower-body lifts step up faster than upper-body (Wendler default: 5 kg / 2.5 kg). */
export function incrementFor(movement: MovementKey): number {
  return movement === "SQUAT" || movement === "HINGE" ? 5 : 2.5;
}

/** Sensible zero-input starting state so anyone can begin today with nothing. */
export function defaultStartState(mode: StrengthMode): ProgramState {
  const out: ProgramState = {};
  for (const m of programMovements(mode)) {
    if (mode === "WEIGHTED") out[m] = { trainingMax: 0 };
    // Start one rung up from the very easiest variation, a gentle 5-rep base.
    else out[m] = { repMax: 5, levelIndex: mode === "LEVELS" ? 1 : 0 };
  }
  return out;
}
