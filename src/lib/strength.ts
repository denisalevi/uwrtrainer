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
  MOVEMENTS,
  MOVEMENT_LEVELS,
  type MovementKey,
  type StrengthLift,
  type ProgramEquipment,
  type SlotMode,
  type SlotTool,
  type WeightedLayout,
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
  /** Fraction of the training/rep max this set is based on (from the wave), e.g. 0.65. */
  pct?: number;
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
    pct: s.pct,
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
    pct: s.pct,
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

/**
 * Per-movement stored state, shared across every day/session. Holds BOTH a weighted training
 * max and a bodyweight rep max/level (a movement can be trained loaded on one day and as
 * bodyweight on another), plus which exercise variant represents the movement in each mode.
 */
export type MovementState = {
  trainingMax?: number;
  repMax?: number;
  levelIndex?: number;
  /** Chosen weighted variant id (catalog id or "custom"). Defaults to the barbell lift. */
  weightedExerciseId?: string;
  /** Chosen bodyweight variant id (catalog id or "custom"). Defaults to a ladder rung. */
  bodyweightExerciseId?: string;
  weightedCustom?: string;
  bodyweightCustom?: string;
};
export type ProgramState = Partial<Record<MovementKey, MovementState>>;

/**
 * Which movements a program trains. WEIGHTED mirrors classic 5/3/1. With a pull-up bar
 * (REPS) we add PULL. Pure bodyweight (LEVELS) has no pull option, so it trains the press
 * instead — fixes "pull-ups shown with no equipment".
 */
export function programMovements(mode: StrengthMode): MovementKey[] {
  if (mode === "WEIGHTED") return ["SQUAT", "HINGE", "PUSH", "PRESS"];
  if (mode === "REPS") return ["PUSH", "PULL", "SQUAT", "HINGE"];
  return ["PUSH", "SQUAT", "HINGE", "PRESS"]; // LEVELS — bodyweight only, no pull
}

// i18n keys (translated in the UI). Weighted lifts have their own names; rep movements map
// to a representative bodyweight exercise key.
const WEIGHTED_LABELS: Record<MovementKey, string> = {
  SQUAT: "lift.SQUAT",
  HINGE: "lift.HINGE",
  PUSH: "lift.PUSH",
  PRESS: "lift.PRESS",
  PULL: "lift.PULL",
};
const REPS_LABELS: Record<MovementKey, string> = {
  PUSH: "ex.push.full",
  PULL: "ex.pull.full",
  SQUAT: "ex.squat.bw",
  HINGE: "ex.hinge.slrdl",
  PRESS: "ex.press.pike",
};

/** i18n key for a movement's label given the mode (and, for LEVELS, the current variation). */
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

/** Map a movement pattern to the closest entry in the generic STRENGTH_LIFTS log enum. */
export function movementToLift(movement: MovementKey): StrengthLift {
  switch (movement) {
    case "SQUAT":
      return "SQUAT";
    case "HINGE":
      return "DEADLIFT";
    case "PUSH":
      return "BENCH";
    case "PRESS":
      return "PRESS";
    default:
      return "OTHER";
  }
}

/** Sensible zero-input starting state so anyone can begin today with nothing. */
export function defaultStartState(mode: StrengthMode): ProgramState {
  const out: ProgramState = {};
  for (const m of programMovements(mode)) {
    if (mode === "WEIGHTED") out[m] = { trainingMax: 0 };
    // Start at the easiest variation we offer (already a sensible baseline), 5-rep base.
    else out[m] = { repMax: 5, levelIndex: 0 };
  }
  return out;
}

/** Starting state covering all five movement patterns (both weighted + bodyweight fields). */
export function defaultFullState(): ProgramState {
  const out: ProgramState = {};
  for (const m of MOVEMENTS) out[m] = { trainingMax: 0, repMax: 5, levelIndex: 0 };
  return out;
}

// ───────────────────────────────────── Exercise slots & catalog ──
//
// Setup is slot-based: the player makes ONE top-level choice (weights vs bodyweight) which
// preselects a default exercise per movement, and can then swap any individual slot to a
// different tool (down to bodyweight, or a typed-in custom exercise) via the Modify picker.
// Maxima stay per-movement in ProgramState and are shared across every slot/day.

/** One exercise option for a movement: an id, its i18n label, the tool it needs, and mode. */
export type CatalogEntry = {
  id: string;
  labelKey: string;
  tool: SlotTool;
  mode: SlotMode;
};

/**
 * A configured exercise on a training day. `exerciseId` is a CatalogEntry id (or "custom",
 * where `custom` holds the typed name). `mode` decides whether the slot reads the movement's
 * weighted training max or its bodyweight rep max from the shared ProgramState.
 */
export type Slot = {
  movement: MovementKey;
  exerciseId: string;
  mode: SlotMode;
  tool: SlotTool;
  custom?: string;
};

export const CUSTOM_EXERCISE_ID = "custom";

/**
 * Exercise options per movement (weighted variants first, then the bodyweight ladder) — the
 * choices shown in the Modify picker. Barbell entries reuse the classic `lift.*` keys;
 * dumbbell/kettlebell variants have their own keys; bodyweight entries reuse `MOVEMENT_LEVELS`.
 */
export const EXERCISE_CATALOG: Record<MovementKey, CatalogEntry[]> = {
  SQUAT: [
    { id: "SQUAT_BB", labelKey: "lift.SQUAT", tool: "BARBELL", mode: "WEIGHTED" },
    { id: "SQUAT_DB", labelKey: "lift.SQUAT.db", tool: "DUMBBELLS", mode: "WEIGHTED" },
    { id: "SQUAT_KB", labelKey: "lift.SQUAT.kb", tool: "KETTLEBELL", mode: "WEIGHTED" },
    { id: "SQUAT_BW", labelKey: "ex.squat.bw", tool: "BODYWEIGHT", mode: "BODYWEIGHT" },
    { id: "SQUAT_BULG", labelKey: "ex.squat.bulgarian", tool: "BODYWEIGHT", mode: "BODYWEIGHT" },
    { id: "SQUAT_PISTOL", labelKey: "ex.squat.pistol", tool: "BODYWEIGHT", mode: "BODYWEIGHT" },
  ],
  HINGE: [
    { id: "HINGE_BB", labelKey: "lift.HINGE", tool: "BARBELL", mode: "WEIGHTED" },
    { id: "HINGE_DB", labelKey: "lift.HINGE.db", tool: "DUMBBELLS", mode: "WEIGHTED" },
    { id: "HINGE_KB", labelKey: "lift.HINGE.kb", tool: "KETTLEBELL", mode: "WEIGHTED" },
    { id: "HINGE_SLRDL", labelKey: "ex.hinge.slrdl", tool: "BODYWEIGHT", mode: "BODYWEIGHT" },
    { id: "HINGE_BRIDGE", labelKey: "ex.hinge.bridge", tool: "BODYWEIGHT", mode: "BODYWEIGHT" },
    { id: "HINGE_NORDIC", labelKey: "ex.hinge.nordic", tool: "BODYWEIGHT", mode: "BODYWEIGHT" },
  ],
  PUSH: [
    { id: "PUSH_BB", labelKey: "lift.PUSH", tool: "BARBELL", mode: "WEIGHTED" },
    { id: "PUSH_DB", labelKey: "lift.PUSH.db", tool: "DUMBBELLS", mode: "WEIGHTED" },
    { id: "PUSH_KB", labelKey: "lift.PUSH.kb", tool: "KETTLEBELL", mode: "WEIGHTED" },
    { id: "PUSH_FULL", labelKey: "ex.push.full", tool: "BODYWEIGHT", mode: "BODYWEIGHT" },
    { id: "PUSH_KNEE", labelKey: "ex.push.knee", tool: "BODYWEIGHT", mode: "BODYWEIGHT" },
    { id: "PUSH_ARCHER", labelKey: "ex.push.archer", tool: "BODYWEIGHT", mode: "BODYWEIGHT" },
  ],
  PRESS: [
    { id: "PRESS_BB", labelKey: "lift.PRESS", tool: "BARBELL", mode: "WEIGHTED" },
    { id: "PRESS_DB", labelKey: "lift.PRESS.db", tool: "DUMBBELLS", mode: "WEIGHTED" },
    { id: "PRESS_KB", labelKey: "lift.PRESS.kb", tool: "KETTLEBELL", mode: "WEIGHTED" },
    { id: "PRESS_PIKE", labelKey: "ex.press.pike", tool: "BODYWEIGHT", mode: "BODYWEIGHT" },
    { id: "PRESS_WALL", labelKey: "ex.press.wallhspu", tool: "BODYWEIGHT", mode: "BODYWEIGHT" },
    { id: "PRESS_HSPU", labelKey: "ex.press.hspu", tool: "BODYWEIGHT", mode: "BODYWEIGHT" },
  ],
  PULL: [
    { id: "PULL_BB", labelKey: "lift.PULL", tool: "BARBELL", mode: "WEIGHTED" },
    { id: "PULL_DB", labelKey: "lift.PULL.db", tool: "DUMBBELLS", mode: "WEIGHTED" },
    { id: "PULL_KB", labelKey: "lift.PULL.kb", tool: "KETTLEBELL", mode: "WEIGHTED" },
    { id: "PULL_FULL", labelKey: "ex.pull.full", tool: "BODYWEIGHT", mode: "BODYWEIGHT" },
    { id: "PULL_BAND", labelKey: "ex.pull.band", tool: "BODYWEIGHT", mode: "BODYWEIGHT" },
    { id: "PULL_WEIGHTED", labelKey: "ex.pull.weighted", tool: "BODYWEIGHT", mode: "BODYWEIGHT" },
  ],
};

const DEFAULT_WEIGHTED_ID: Record<MovementKey, string> = {
  SQUAT: "SQUAT_BB", HINGE: "HINGE_BB", PUSH: "PUSH_BB", PRESS: "PRESS_BB", PULL: "PULL_BB",
};
const DEFAULT_BODYWEIGHT_ID: Record<MovementKey, string> = {
  SQUAT: "SQUAT_BW", HINGE: "HINGE_SLRDL", PUSH: "PUSH_FULL", PRESS: "PRESS_PIKE", PULL: "PULL_FULL",
};

/** Look up a catalog entry by movement + id. */
export function catalogEntry(movement: MovementKey, exerciseId: string): CatalogEntry | undefined {
  return EXERCISE_CATALOG[movement]?.find((e) => e.id === exerciseId);
}

/** The movements a program trains, in order. PULL only when the trainer enables it. */
export function programSlotMovements(includePull: boolean): MovementKey[] {
  const base: MovementKey[] = ["SQUAT", "HINGE", "PUSH", "PRESS"];
  return includePull ? [...base, "PULL"] : base;
}

/** The default exercise id for a movement in a given mode (barbell lift / first ladder rung). */
export function defaultExerciseId(movement: MovementKey, mode: SlotMode): string {
  return mode === "WEIGHTED" ? DEFAULT_WEIGHTED_ID[movement] : DEFAULT_BODYWEIGHT_ID[movement];
}

/** The i18n key for a slot's exercise label ("" for custom — the UI shows slot.custom). */
export function slotLabelKey(slot: Slot): string {
  if (slot.exerciseId === CUSTOM_EXERCISE_ID) return "";
  return catalogEntry(slot.movement, slot.exerciseId)?.labelKey ?? "";
}

export type SlotWorkout = { labelKey: string; mode: SlotMode; sets: WorkoutSet[] };

/**
 * Build the current week's working sets for a configured slot from the shared per-movement
 * state. WEIGHTED slots read the movement's training max (kg); BODYWEIGHT slots its rep max.
 */
export function workoutForSlot(
  slot: Slot,
  state: ProgramState,
  week: number,
  opts: { rounding?: number } = {},
): SlotWorkout {
  void opts;
  const s = state[slot.movement] ?? {};
  if (slot.mode === "WEIGHTED") {
    const w = weightedWorkout(s.trainingMax ?? 0, week, {
      increment: incrementFor(slot.movement),
      movementLabel: "",
    });
    return { labelKey: slotLabelKey(slot), mode: "WEIGHTED", sets: w.sets };
  }
  const w = bodyweightWorkout(s.repMax ?? 5, week, { mode: "LEVELS", movementLabel: "" });
  return { labelKey: slotLabelKey(slot), mode: "BODYWEIGHT", sets: w.sets };
}

// ───────────────────────────────────── Weekly schedule (auto-layout) ──
//
// The four "core" lifts are squat / hinge(deadlift) / push(bench) / press(overhead); a pull
// (row) is an optional rider on a pressing day. How they fill your week is DERIVED, not hand-
// built, from two rules grounded in Wendler:
//
//   • WEIGHTED days are recovery-limited, so the cores are SPLIT across them — each lift loaded
//     once a week. The spreadsheet's pairing is lower+upper-push: {squat,bench} & {deadlift,
//     press}. With only one weighted day you either ROTATE those pairs over two weeks or do
//     ALL_IN_ONE (all four in one long session).
//   • BODYWEIGHT days aren't recovery-limited and gain from frequency, so EVERY bodyweight day
//     is full-body — all four patterns — and time controls the number of sets, not the lifts.

export const CORE_MOVEMENTS: MovementKey[] = ["SQUAT", "HINGE", "PUSH", "PRESS"];
const PAIR_A: MovementKey[] = ["SQUAT", "PUSH"]; // lower + bench (spreadsheet "Mon")
const PAIR_B: MovementKey[] = ["HINGE", "PRESS"]; // deadlift + overhead (spreadsheet "Thu")

/** One training day the player sets up: a name, its equipment, and session length. */
export type DayPlan = { id: string; name: string; equipment: ProgramEquipment; minutes: number };

export type PlannedExercise = {
  movement: MovementKey;
  mode: SlotMode;
  exerciseId: string;
  custom?: string;
  labelKey: string; // "" when custom
  tool: SlotTool;
  sets: WorkoutSet[];
};
export type PlannedDay = {
  id: string;
  name: string;
  equipment: ProgramEquipment;
  minutes: number;
  /** For a single rotating weighted day: which 2-week half this week is ("A"/"B"). */
  rotation?: "A" | "B";
  exercises: PlannedExercise[];
};

/** Comfortable session length for a day, from how many lifts it loads (bodyweight is lighter). */
export function suggestedMinutes(weightedLifts: number): number {
  if (weightedLifts >= 4) return 120;
  if (weightedLifts === 3) return 90;
  if (weightedLifts === 2) return 60;
  return 45; // one weighted lift, or a bodyweight day
}

/** How the four cores are split across W weighted days (and which pair on a rotating single day). */
export function weightedAssignment(
  weightedDays: number,
  layout: WeightedLayout,
  week: number,
): MovementKey[][] {
  if (weightedDays <= 1) {
    if (layout === "ALL_IN_ONE") return [[...CORE_MOVEMENTS]];
    return [week % 2 === 1 ? [...PAIR_A] : [...PAIR_B]]; // ROTATE: odd weeks = A
  }
  if (weightedDays === 2) return [[...PAIR_A], [...PAIR_B]];
  if (weightedDays === 3) return [[...PAIR_A], ["HINGE"], ["PRESS"]];
  return [["SQUAT"], ["PUSH"], ["HINGE"], ["PRESS"]]; // 4+
}

/**
 * Which weighted day the pull rides: a pressing day (has bench or overhead), preferring the
 * lightest one, then a non-deadlift day, then the overhead day. Returns an index into
 * `assignment`, or null if no weighted pressing day exists.
 */
export function pullRiderDay(assignment: MovementKey[][]): number | null {
  const pressing = assignment
    .map((cores, i) => ({ i, cores }))
    .filter((x) => x.cores.includes("PUSH") || x.cores.includes("PRESS"));
  if (pressing.length === 0) return null;
  pressing.sort(
    (a, b) =>
      a.cores.length - b.cores.length ||
      Number(a.cores.includes("HINGE")) - Number(b.cores.includes("HINGE")) ||
      Number(b.cores.includes("PRESS")) - Number(a.cores.includes("PRESS")),
  );
  return pressing[0].i;
}

/**
 * Resolve the chosen exercise for a movement on a given kind of day. The day's equipment picks
 * WHICH stored choice to use (the weighted-day one or the bodyweight-day one), but the chosen
 * exercise itself can be either kind — so a "weighted day" can hold a bodyweight lift (e.g. the
 * row swapped for pull-ups). The returned `mode` follows the exercise, not the day.
 */
export function resolveExercise(
  movement: MovementKey,
  dayEquipment: ProgramEquipment,
  state: ProgramState,
): { exerciseId: string; custom?: string; labelKey: string; tool: SlotTool; mode: SlotMode } {
  const s = state[movement] ?? {};
  const onWeighted = dayEquipment === "WEIGHTS";
  const chosen = onWeighted ? s.weightedExerciseId : s.bodyweightExerciseId;
  const custom = onWeighted ? s.weightedCustom : s.bodyweightCustom;
  if (chosen === CUSTOM_EXERCISE_ID) {
    const mode: SlotMode = onWeighted ? "WEIGHTED" : "BODYWEIGHT";
    return { exerciseId: CUSTOM_EXERCISE_ID, custom: custom || "", labelKey: "", tool: mode === "WEIGHTED" ? "BARBELL" : "BODYWEIGHT", mode };
  }
  const id = chosen ?? defaultExerciseId(movement, onWeighted ? "WEIGHTED" : "BODYWEIGHT");
  const entry = catalogEntry(movement, id) ?? EXERCISE_CATALOG[movement][0];
  return { exerciseId: entry.id, labelKey: entry.labelKey, tool: entry.tool, mode: entry.mode };
}

function plannedExercise(
  movement: MovementKey,
  dayEquipment: ProgramEquipment,
  state: ProgramState,
  week: number,
): PlannedExercise {
  const ex = resolveExercise(movement, dayEquipment, state);
  const sets = workoutForSlot({ movement, mode: ex.mode, exerciseId: ex.exerciseId, tool: ex.tool }, state, week).sets;
  return { movement, mode: ex.mode, exerciseId: ex.exerciseId, custom: ex.custom, labelKey: ex.labelKey, tool: ex.tool, sets };
}

/**
 * Build a week's plan: for each configured day, the concrete exercises (with sets) to do.
 * Weighted days carry their split of the cores (+ the pull rider); bodyweight days carry all
 * four patterns (+ pull) as bodyweight.
 */
export function buildSchedule(
  days: DayPlan[],
  state: ProgramState,
  opts: { includePull: boolean; layout: WeightedLayout; week: number },
): PlannedDay[] {
  const { includePull, layout, week } = opts;
  const weightedDays = days.filter((d) => d.equipment === "WEIGHTS");
  const assignment = weightedAssignment(weightedDays.length, layout, week);
  const riderIdx = includePull ? pullRiderDay(assignment) : null;

  let w = 0; // index among weighted days
  return days.map((day) => {
    if (day.equipment === "WEIGHTS") {
      const myIdx = w++;
      const cores = assignment[myIdx] ?? [];
      const movements = [...cores];
      if (riderIdx === myIdx) movements.push("PULL");
      const exercises = movements.map((m) => plannedExercise(m, "WEIGHTS", state, week));
      const single = weightedDays.length <= 1;
      return {
        id: day.id,
        name: day.name,
        equipment: day.equipment,
        minutes: day.minutes,
        ...(single && layout === "ROTATE" ? { rotation: (week % 2 === 1 ? "A" : "B") as "A" | "B" } : {}),
        exercises,
      };
    }
    // Bodyweight day: full-body, all patterns (+ pull).
    const movements = includePull ? [...CORE_MOVEMENTS, "PULL" as MovementKey] : [...CORE_MOVEMENTS];
    const exercises = movements.map((m) => plannedExercise(m, "BODYWEIGHT", state, week));
    return { id: day.id, name: day.name, equipment: day.equipment, minutes: day.minutes, exercises };
  });
}
