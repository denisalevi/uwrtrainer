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
  type PullPrefs,
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

// ────────────────────────────────────────────── Per-user display rounding ──

/** How planned working weights are rounded for display/logging (per-user preference). */
export const WEIGHT_ROUNDING_MODES = ["EXACT", "DOWN", "NEAREST", "UP"] as const;
export type WeightRoundingMode = (typeof WEIGHT_ROUNDING_MODES)[number];
export type RoundingPref = { mode: WeightRoundingMode; increment: number };
export const DEFAULT_WEIGHT_ROUNDING: WeightRoundingMode = "DOWN";
export const DEFAULT_WEIGHT_INCREMENT = 2.5;

export function isWeightRoundingMode(v: unknown): v is WeightRoundingMode {
  return (WEIGHT_ROUNDING_MODES as readonly unknown[]).includes(v);
}

/**
 * Round a planned weight per the user's preference. EXACT keeps the exact percentage
 * (to 0.01 kg against float noise) — the athlete rounds down at the rack (Wendler).
 * DOWN never loads more than prescribed (the default); tiny epsilons keep float noise
 * from flooring/ceiling a clean multiple the wrong way.
 */
export function roundWeight(value: number, pref?: RoundingPref): number {
  if (!pref) return value;
  if (pref.mode === "EXACT" || pref.increment <= 0) return Math.round(value * 100) / 100;
  const q = value / pref.increment;
  const steps =
    pref.mode === "DOWN" ? Math.floor(q + 1e-9) : pref.mode === "UP" ? Math.ceil(q - 1e-9) : Math.round(q);
  return steps * pref.increment;
}

/**
 * The "training max" is what every working set is calculated from — deliberately set
 * below your true max (default 90%) so training never grinds to a true limit and you
 * have room to grow. Rounded DOWN to a loadable increment (Wendler): rounding to nearest
 * can round UP and erase the submaximal margin at light loads (e.g. 10 kg × 1 would give
 * a 10 kg TM — the weight actually lifted).
 */
export function trainingMaxFromOneRepMax(
  oneRepMax: number,
  pct = 0.9,
  increment = 2.5,
): number {
  const tm = oneRepMax * pct;
  if (increment <= 0) return tm;
  // Tiny epsilon so float noise (e.g. 90.00000000000001 / 2.5) can't floor a clean multiple down.
  return Math.floor(tm / increment + 1e-9) * increment;
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

/** Where a set sits in the session: a warm-up ramp, a main working set, or BBB volume. */
export type SetKind = "warmup" | "main" | "bbb";

export type WorkoutSet = {
  /** Loaded weight in kg (WEIGHTED only). */
  weight?: number;
  reps: number;
  amrap: boolean;
  /** Fraction of the training/rep max this set is based on (from the wave), e.g. 0.65. */
  pct?: number;
  /** Section this set belongs to. Absent ⇒ treat as "main". */
  kind?: SetKind;
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

export const ASSISTANCE_PCT = 0.5; // Boring But Big = 5×10 at 50% of training max

/**
 * Warm-up ramp for a WEIGHTED lift: each step is a fraction of the training max. The scheme is
 * configurable (a team setting); the classic Wendler default is 40/50/60% × 5/5/3. Returns an
 * empty ramp when there's no loaded max to ramp against.
 */
export function warmupSets(
  trainingMax: number,
  increment: number,
  scheme: { pct: number; reps: number }[],
  rounding?: RoundingPref,
): WorkoutSet[] {
  if (trainingMax <= 0) return [];
  return scheme.map((s) => ({
    weight: rounding ? roundWeight(trainingMax * s.pct, rounding) : roundToIncrement(trainingMax * s.pct, increment),
    reps: s.reps,
    amrap: false,
    pct: s.pct,
    kind: "warmup" as const,
  }));
}

/**
 * A single "Boring But Big" assistance set at `pct` of the training max (default 50%, 10 reps).
 * The logger adds one per click, so five clicks rebuild the classic 5×10.
 */
export function bbbSet(
  trainingMax: number,
  increment: number,
  pct: number = ASSISTANCE_PCT,
  reps = 10,
  rounding?: RoundingPref,
): WorkoutSet {
  return {
    weight: rounding ? roundWeight(trainingMax * pct, rounding) : roundToIncrement(trainingMax * pct, increment),
    reps,
    amrap: false,
    pct,
    kind: "bbb" as const,
  };
}

/** WEIGHTED: working sets in kg from a training max. */
export function weightedWorkout(
  trainingMax: number,
  week: number,
  opts: { increment?: number; movementLabel: string; withAssistance?: boolean; rounding?: RoundingPref } = {
    movementLabel: "",
  },
): MovementWorkout {
  const inc = opts.increment ?? 2.5;
  const roundW = (v: number) => (opts.rounding ? roundWeight(v, opts.rounding) : roundToIncrement(v, inc));
  const w = waveWeek(week);
  const sets = w.sets.map((s) => ({
    weight: roundW(trainingMax * s.pct),
    reps: s.reps,
    amrap: !!s.amrap,
    pct: s.pct,
    kind: "main" as const,
  }));
  return {
    mode: "WEIGHTED",
    movementLabel: opts.movementLabel,
    scheme: w.scheme,
    deload: w.deload,
    sets,
    assistance: opts.withAssistance
      ? { sets: 5, reps: 10, weight: roundW(trainingMax * ASSISTANCE_PCT) }
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
    kind: "main" as const,
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

// ─────────────────────────────────────────────── Closing out a cycle (per lift) ──

/**
 * The rep target the week-3 AMRAP test is judged against, for the mode the lift is actually
 * performed in. A WEIGHTED lift's week-3 top set prescribes the wave's fixed rep count (1 at
 * 95 % of the training max); a BODYWEIGHT lift's top set prescribes ~95 % of its CURRENT rep
 * max — so beating it must be judged against that, not against the weighted "1".
 */
export function prescribedTestReps(mode: SlotMode, cur: MovementState): number {
  const week3 = waveWeek(3);
  const top = week3.sets[week3.sets.length - 1];
  if (mode === "WEIGHTED") return top.reps;
  // Same maths bodyweightWorkout uses for the week-3 top set.
  return bodyweightWorkout(cur.repMax ?? 5, 3, { movementLabel: "" }).sets.at(-1)!.reps;
}

/**
 * Close out a cycle for ONE movement: judge its week-3 AMRAP result against its prescription,
 * advance both maxima (weighted training max + bodyweight rep/level), and return the movement's
 * next-cycle state. Everything else the state carries (chosen exercise variants, custom names)
 * is PRESERVED — only the progression fields change. The first-cycle estimate inputs
 * (`estWeight`/`estReps`) are deliberately dropped: they describe the set the very first
 * training max was derived from, which is stale once a cycle has adjusted it.
 *
 * Short cycles are tracked PER LIFT in `holds`: the first shortfall HOLDs and bumps the
 * lift's own counter; a second shortfall in a row REDUCEs (~10 %) and resets it, as does
 * any successful test. Other lifts are unaffected.
 */
export function advanceMovementState(
  movement: MovementKey,
  cur: MovementState,
  amrapReps: number,
  prescribedReps: number,
  opts: { rounding?: number } = {},
): MovementState {
  const adjustment = decideAdjustment(amrapReps, prescribedReps, cur.holds ?? 0);
  const bw = nextBodyweight(
    { repMax: cur.repMax ?? 5, levelIndex: cur.levelIndex ?? 0 },
    adjustment,
    { mode: "LEVELS", levelCount: MOVEMENT_LEVELS[movement].length, graduateAt: 15, resetReps: 5 },
  );
  return {
    ...cur,
    trainingMax: nextTrainingMax(cur.trainingMax ?? 0, adjustment, {
      increment: incrementFor(movement),
      rounding: opts.rounding,
    }),
    repMax: bw.repMax,
    levelIndex: bw.levelIndex,
    holds: adjustment === "HOLD" ? (cur.holds ?? 0) + 1 : 0,
    estWeight: undefined, // first-cycle-only; retire after the first adjustment
    estReps: undefined,
  };
}

// ─────────────────────────────── Per-movement auto-progression (each lift its own wave) ──
//
// Each lift carries its OWN wave position (`week` 1..4) and `cycle`, and advances only when ITS
// session is logged done — so lifts drift independently (miss a day, that lift just waits). This
// replaces hand-picking a shared "active week". The deload is per-lift; a lift in its deload while
// another is mid-cycle is fine — the deload manages THAT lift's fatigue, not a whole-body event.

/** Normalise any week number into the 1..4 wave position (mirrors waveWeek's mod-4). */
export function normWeek(week: number): 1 | 2 | 3 | 4 {
  return ((((Math.round(week) - 1) % 4) + 4) % 4 + 1) as 1 | 2 | 3 | 4;
}

/** The lift's current wave position — its own per-movement week, else the program's global week. */
export function effectiveWeek(cur: MovementState | undefined, fallbackWeek: number): number {
  return cur?.week ?? fallbackWeek;
}

/** The lift's current cycle — its own per-movement cycle, else the program's global cycle. */
export function effectiveCycle(cur: MovementState | undefined, fallbackCycle: number): number {
  return cur?.cycle ?? fallbackCycle;
}

export type ProgressEvent = "advanced" | "cycleFinished" | "deloadReset";

/**
 * Advance ONE lift's progression after a logged session at `loggedWeek` completes:
 *   • weeks 1→2→3 step the wave (week 3 captures the AMRAP result for the eventual bump);
 *   • week 4 (deload): a manual "deload now" (deloadReset) restarts the SAME cycle at week 1 with
 *     no bump; otherwise the cycle closes — the adjustment rule runs on the captured week-3 AMRAP
 *     (blank/absent ⇒ successful test), stepping the maxima and starting the next cycle at week 1.
 * `date` (the session's ISO date) is stamped for stale-return detection.
 */
export function advanceAfterSession(
  movement: MovementKey,
  cur: MovementState,
  loggedWeek: number,
  amrapReps: number,
  prescribedReps: number,
  opts: { rounding?: number; date?: string } = {},
): { next: MovementState; event: ProgressEvent } {
  const from = normWeek(loggedWeek);
  const cycle = cur.cycle ?? 1;
  const stamp: Partial<MovementState> = opts.date ? { lastTrainedAt: opts.date } : {};
  const pendingAmrap = from === 3 ? amrapReps : cur.pendingAmrap;

  if (from < 4) {
    return { next: { ...cur, week: from + 1, cycle, pendingAmrap, ...stamp }, event: "advanced" };
  }

  // from === 4 — the deload week just finished.
  if (cur.deloadReset) {
    const next: MovementState = { ...cur, week: 1, cycle, ...stamp };
    delete next.deloadReset;
    delete next.pendingAmrap;
    return { next, event: "deloadReset" };
  }

  // Normal cycle close: judge the captured week-3 AMRAP (blank/0 ⇒ successful test → INCREASE).
  const eff = pendingAmrap != null && pendingAmrap > 0 ? pendingAmrap : prescribedReps;
  const advanced = advanceMovementState(movement, cur, eff, prescribedReps, { rounding: opts.rounding });
  const next: MovementState = { ...advanced, week: 1, cycle: cycle + 1, ...stamp };
  delete next.pendingAmrap;
  delete next.deloadReset;
  return { next, event: "cycleFinished" };
}

/** The minimal shape of a logged exercise the finish flow reads to advance progression. */
export type LoggedSet = { amrap?: boolean; reps?: number | null };
export type LoggedExercise = { movement?: MovementKey; week?: number; done?: boolean; sets?: LoggedSet[] };

/**
 * Advance a whole program's per-movement state from ONE finished session's logged exercises. For
 * each exercise marked done that carries a movement + the week it was logged at, step that lift's
 * own wave (advanceAfterSession), reading the AMRAP reps from its logged set. Deduped per movement.
 * Pure: returns a new state + the list of lifts advanced (never mutates the input). The caller
 * guards single-application (progressionApplied) and handles the rotating-day session pointer.
 */
export function advanceStateAfterSession(
  state: ProgramState,
  exercises: LoggedExercise[],
  opts: { rounding?: number; fallbackCycle: number; dayEquipment: ProgramEquipment; date?: string },
): { state: ProgramState; advanced: MovementKey[] } {
  const next: ProgramState = { ...state };
  const advanced: MovementKey[] = [];
  const seen = new Set<MovementKey>();
  for (const ex of exercises) {
    if (!ex || ex.done !== true) continue;
    const m = ex.movement;
    if (!m || !(MOVEMENTS as readonly string[]).includes(m) || seen.has(m)) continue;
    const loggedWeek = Number(ex.week);
    if (!Number.isFinite(loggedWeek)) continue;
    const seeded: MovementState = { ...(next[m] ?? {}), cycle: next[m]?.cycle ?? opts.fallbackCycle };
    const resolved = resolveExercise(m, opts.dayEquipment, next);
    const prescribed = prescribedTestReps(resolved.mode, seeded);
    const amrapSet = (ex.sets ?? []).find((s) => s && s.amrap === true);
    const amrapReps = amrapSet && Number.isFinite(Number(amrapSet.reps)) ? Number(amrapSet.reps) : 0;
    const res = advanceAfterSession(m, seeded, loggedWeek, amrapReps, prescribed, {
      rounding: opts.rounding,
      date: opts.date,
    });
    next[m] = res.next;
    seen.add(m);
    advanced.push(m);
  }
  return { state: next, advanced };
}

/**
 * Put a lift into a manual "deload now": the next session becomes the deload (week 4), and
 * completing it restarts the SAME cycle at week 1 with no training-max bump. A re-sync / back-off
 * tool the athlete can reach for any lift at any time.
 */
export function deloadNowState(cur: MovementState, fallbackCycle: number): MovementState {
  const next: MovementState = { ...cur, week: 4, cycle: cur.cycle ?? fallbackCycle, deloadReset: true };
  delete next.pendingAmrap;
  return next;
}

/**
 * Manually set a lift's wave position (the "jump" escape hatch, shown behind a warning). Clears any
 * pending week-3 test and deload flag so the trajectory continues cleanly from the chosen week.
 */
export function setMovementWeekState(cur: MovementState, week: number, fallbackCycle: number): MovementState {
  const next: MovementState = { ...cur, week: normWeek(week), cycle: cur.cycle ?? fallbackCycle };
  delete next.pendingAmrap;
  delete next.deloadReset;
  return next;
}

/** Whole days between two yyyy-mm-dd dates (UTC midnight, so DST can't skew the count). */
export function daysBetween(fromISO: string, toISO: string): number {
  const a = Date.parse(`${fromISO}T00:00:00Z`);
  const b = Date.parse(`${toISO}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}

/** Days without training this lift → suggest stepping back on return (repeat / drop a week / deload). */
export const STALE_DAYS = 16;

/** True when a lift hasn't been trained for a while and the app should suggest going backwards. */
export function isStale(cur: MovementState | undefined, todayISO: string, thresholdDays = STALE_DAYS): boolean {
  if (!cur?.lastTrainedAt) return false;
  return daysBetween(cur.lastTrainedAt, todayISO) >= thresholdDays;
}

// ─────────────────────────────────────────────  Equipment → mode, and templates ──

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
  /** How many cycles in a row THIS lift ended short (HOLD). Two in a row triggers the ~10 %
   * REDUCE — per lift, so one stalling lift never drags the others down. Absent = 0 (also
   * covers rows written before this field existed; the old program-level counter is ignored). */
  holds?: number;
  /** Per-movement wave position (1..4; 4 = deload). Each lift runs its OWN 4-week wave and only
   * advances when its session is logged, so lifts drift independently. Absent = fall back to the
   * program's global `week` (so untouched lifts read the legacy shared pointer until first advance). */
  week?: number;
  /** Per-movement cycle number. Absent = fall back to the program's global `cycle`. */
  cycle?: number;
  /** Week-3 AMRAP reps captured, awaiting the cycle-close bump when the deload (week 4) completes. */
  pendingAmrap?: number;
  /** Set by a manual "deload now": completing the deload restarts the SAME cycle at week 1 with NO
   * training-max bump (a re-sync tool), instead of closing the cycle and stepping up. */
  deloadReset?: boolean;
  /** ISO date (yyyy-mm-dd) of the last logged session that advanced this lift — for stale-return. */
  lastTrainedAt?: string;
  /** First-cycle setup: the weight × clean reps the user entered to estimate the training max.
   * Stored so the onboarding form can show them again (and so we know the TM came from an estimate
   * rather than a direct entry). Absent when the user typed a training max in directly. */
  estWeight?: number;
  estReps?: number;
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
 * (REPS) we add the vertical pull. Pure bodyweight (LEVELS) has no pull option, so it trains
 * the press instead — fixes "pull-ups shown with no equipment".
 */
export function programMovements(mode: StrengthMode): MovementKey[] {
  if (mode === "WEIGHTED") return ["SQUAT", "HINGE", "PUSH", "PRESS"];
  if (mode === "REPS") return ["PUSH", "PULLV", "SQUAT", "HINGE"];
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
  PULLV: "ex.pull.weighted",
};
const REPS_LABELS: Record<MovementKey, string> = {
  PUSH: "ex.push.full",
  PULL: "ex.pull.invrow",
  PULLV: "ex.pull.full",
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
    { id: "PULL_INV", labelKey: "ex.pull.invrow", tool: "BODYWEIGHT", mode: "BODYWEIGHT" },
    { id: "PULL_INV_FEET", labelKey: "ex.pull.invrowfeet", tool: "BODYWEIGHT", mode: "BODYWEIGHT" },
  ],
  PULLV: [
    // Weighted pull-up progresses in added kg (its training max is the ADDED weight, not total).
    { id: "PULLV_WEIGHTED", labelKey: "ex.pull.weighted", tool: "PULLUP_BAR", mode: "WEIGHTED" },
    { id: "PULL_FULL", labelKey: "ex.pull.full", tool: "PULLUP_BAR", mode: "BODYWEIGHT" },
    { id: "PULL_BAND", labelKey: "ex.pull.band", tool: "PULLUP_BAR", mode: "BODYWEIGHT" },
  ],
};

const DEFAULT_WEIGHTED_ID: Record<MovementKey, string> = {
  SQUAT: "SQUAT_BB", HINGE: "HINGE_BB", PUSH: "PUSH_BB", PRESS: "PRESS_BB", PULL: "PULL_BB",
  PULLV: "PULLV_WEIGHTED",
};
const DEFAULT_BODYWEIGHT_ID: Record<MovementKey, string> = {
  SQUAT: "SQUAT_BW", HINGE: "HINGE_SLRDL", PUSH: "PUSH_FULL", PRESS: "PRESS_PIKE", PULL: "PULL_INV",
  PULLV: "PULL_FULL",
};

/** Look up a catalog entry by movement + id. */
export function catalogEntry(movement: MovementKey, exerciseId: string): CatalogEntry | undefined {
  return EXERCISE_CATALOG[movement]?.find((e) => e.id === exerciseId);
}

/** The enabled optional pull movements, in rider order (vertical first). */
export function enabledPulls(pulls: PullPrefs): MovementKey[] {
  const out: MovementKey[] = [];
  if (pulls.pullups) out.push("PULLV");
  if (pulls.rows) out.push("PULL");
  return out;
}

/** The movements a program trains, in order. Pulls are per-user opt-ins. */
export function programSlotMovements(pulls: PullPrefs): MovementKey[] {
  const base: MovementKey[] = ["SQUAT", "HINGE", "PUSH", "PRESS"];
  return [...base, ...enabledPulls(pulls)];
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
  opts: { rounding?: RoundingPref } = {},
): SlotWorkout {
  const s = state[slot.movement] ?? {};
  if (slot.mode === "WEIGHTED") {
    const w = weightedWorkout(s.trainingMax ?? 0, week, {
      increment: incrementFor(slot.movement),
      movementLabel: "",
      rounding: opts.rounding,
    });
    return { labelKey: slotLabelKey(slot), mode: "WEIGHTED", sets: w.sets };
  }
  const w = bodyweightWorkout(s.repMax ?? 5, week, { mode: "LEVELS", movementLabel: "" });
  return { labelKey: slotLabelKey(slot), mode: "BODYWEIGHT", sets: w.sets };
}

// ───────────────────────────────────── Weekly schedule (auto-layout) ──
//
// The four "core" lifts are squat / hinge(deadlift) / push(bench) / press(overhead); the pulls
// (PULLV pull-ups, PULL rows — per-user opt-ins) are riders on pressing days, each on its own
// day where possible. How they fill your week is DERIVED, not hand-
// built, from two rules grounded in Wendler:
//
//   • WEIGHTED days are recovery-limited, so the cores are SPLIT across them — each lift loaded
//     once a week. The spreadsheet's pairing is lower+upper-push: {squat,bench} & {deadlift,
//     press}. With only one weighted day you either ROTATE those pairs week-about (each pair
//     then walks its OWN 4-week wave → an 8-week super-cycle, see rotationWaveWeek) or do
//     ALL_IN_ONE (all four in one long session).
//   • BODYWEIGHT days aren't recovery-limited and gain from frequency, so EVERY bodyweight day
//     is full-body — all four patterns — and time controls the number of sets, not the lifts.

export const CORE_MOVEMENTS: MovementKey[] = ["SQUAT", "HINGE", "PUSH", "PRESS"];
const PAIR_A: MovementKey[] = ["SQUAT", "PUSH"]; // lower + bench (spreadsheet "Mon")
const PAIR_B: MovementKey[] = ["HINGE", "PRESS"]; // deadlift + overhead (spreadsheet "Thu")

/**
 * One training day the player sets up: a name, its equipment, and session length. `movements` is
 * an OPTIONAL explicit lift assignment — when present (on any day), the whole schedule switches to
 * that custom layout instead of the automatic split; when absent everywhere, the auto-layout applies.
 */
export type DayPlan = { id: string; name: string; equipment: ProgramEquipment; minutes: number; movements?: MovementKey[] };

export type PlannedExercise = {
  movement: MovementKey;
  mode: SlotMode;
  exerciseId: string;
  custom?: string;
  labelKey: string; // "" when custom
  tool: SlotTool;
  /** The wave week (1..4) these sets were built from — the lift's OWN per-movement week when it
   * has one, else the schedule's fallback week. Recorded with the logged session so completing it
   * can advance exactly this lift from exactly this week. */
  week: number;
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

/**
 * ROTATE (a single weighted day): which pair trains on a given program week — pair A
 * (squat+bench) on odd weeks, pair B (deadlift+press) on even weeks.
 */
export function rotationHalf(week: number): "A" | "B" {
  return week % 2 === 1 ? "A" : "B";
}

/**
 * ROTATE: the wave week the training pair is on for a given program week. Each pair walks its
 * OWN 4-week wave — its Nth session is wave week ((N-1) mod 4)+1 — so the full rotation is an
 * 8-week super-cycle and every lift sees all four wave weeks (incl. the week-3 test and the
 * deload). Program weeks 1..8 map to (pair · wave): 1=A·1, 2=B·1, 3=A·2, 4=B·2, 5=A·3, 6=B·3,
 * 7=A·4, 8=B·4. (Keying the wave straight off the program week would phase-lock the rotation:
 * 2 divides 4, so pair A would only ever see waves 1/3 and pair B waves 2/4 — deadlift+press
 * would never be tested and squat+bench never deload.)
 */
export function rotationWaveWeek(week: number): number {
  return (Math.floor((((week - 1) % 8) + 8) % 8 / 2) % 4) + 1;
}

/** ROTATE spans 8 program weeks (both pairs × their own 4-week wave); everything else 4. */
export function programCycleWeeks(days: DayPlan[], layout: WeightedLayout): 4 | 8 {
  const weighted = days.filter((d) => d.equipment === "WEIGHTS").length;
  return weighted === 1 && layout === "ROTATE" ? 8 : 4;
}

/** How the four cores are split across W weighted days (and which pair on a rotating single day). */
export function weightedAssignment(
  weightedDays: number,
  layout: WeightedLayout,
  week: number,
): MovementKey[][] {
  if (weightedDays <= 1) {
    if (layout === "ALL_IN_ONE") return [[...CORE_MOVEMENTS]];
    return [rotationHalf(week) === "A" ? [...PAIR_A] : [...PAIR_B]]; // ROTATE: odd weeks = A
  }
  if (weightedDays === 2) return [[...PAIR_A], [...PAIR_B]];
  if (weightedDays === 3) return [[...PAIR_A], ["HINGE"], ["PRESS"]];
  return [["SQUAT"], ["PUSH"], ["HINGE"], ["PRESS"]]; // 4+
}

/**
 * Which weighted days the pulls ride: pressing days (bench or overhead), ranked lightest
 * first, then non-deadlift, then the overhead day. Returns indices into `assignment` — one
 * per requested rider, each on its OWN day where possible (wrapping when there are more
 * pulls than pressing days). Empty if no weighted pressing day exists.
 */
export function pullRiderDays(assignment: MovementKey[][], count: number): number[] {
  const pressing = assignment
    .map((cores, i) => ({ i, cores }))
    .filter((x) => x.cores.includes("PUSH") || x.cores.includes("PRESS"));
  if (pressing.length === 0 || count <= 0) return [];
  pressing.sort(
    (a, b) =>
      a.cores.length - b.cores.length ||
      Number(a.cores.includes("HINGE")) - Number(b.cores.includes("HINGE")) ||
      Number(b.cores.includes("PRESS")) - Number(a.cores.includes("PRESS")),
  );
  return Array.from({ length: count }, (_, k) => pressing[k % pressing.length].i);
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
  rounding?: RoundingPref,
): PlannedExercise {
  const ex = resolveExercise(movement, dayEquipment, state);
  // The lift's OWN per-movement week wins when set; otherwise use the schedule's fallback week
  // (the raw program week, or the rotation's wave week for a single rotating weighted day).
  const wk = state[movement]?.week ?? week;
  const sets = workoutForSlot({ movement, mode: ex.mode, exerciseId: ex.exerciseId, tool: ex.tool }, state, wk, { rounding }).sets;
  return { movement, mode: ex.mode, exerciseId: ex.exerciseId, custom: ex.custom, labelKey: ex.labelKey, tool: ex.tool, week: wk, sets };
}

/**
 * Build a week's plan: for each configured day, the concrete exercises (with sets) to do.
 * Weighted days carry their split of the cores (+ the pull rider); bodyweight days carry all
 * four patterns (+ pull) as bodyweight.
 */
export function buildSchedule(
  days: DayPlan[],
  state: ProgramState,
  opts: { pulls: PullPrefs; layout: WeightedLayout; week: number; rounding?: RoundingPref },
): PlannedDay[] {
  const { pulls, layout, week, rounding } = opts;

  // Custom layout: if ANY day carries an explicit movement list, honour each day's list verbatim
  // (deduped, valid movements only, in the user's order) instead of the automatic split. It's
  // all-or-nothing — the editor seeds every day from the auto layout when you switch to custom, so
  // there's no half-custom state; each lift's sets still come off its own per-movement week.
  if (days.some((d) => Array.isArray(d.movements))) {
    return days.map((day) => {
      const seen = new Set<MovementKey>();
      const movements: MovementKey[] = [];
      for (const m of day.movements ?? []) {
        if ((MOVEMENTS as readonly string[]).includes(m) && !seen.has(m)) {
          seen.add(m);
          movements.push(m);
        }
      }
      return {
        id: day.id,
        name: day.name,
        equipment: day.equipment,
        minutes: day.minutes,
        exercises: movements.map((m) => plannedExercise(m, day.equipment, state, week, rounding)),
      };
    });
  }

  const weightedDays = days.filter((d) => d.equipment === "WEIGHTS");
  const assignment = weightedAssignment(weightedDays.length, layout, week);
  // Each enabled pull rides its own pressing day where possible (vertical on the lightest).
  const riders = enabledPulls(pulls);
  const riderIdxs = pullRiderDays(assignment, riders.length);
  // A single rotating weighted day runs an 8-week super-cycle: the training pair's sets come
  // off ITS OWN wave week (rotationWaveWeek), not the raw program week — otherwise the
  // rotation is phase-locked and half the lifts never see the test/deload weeks.
  const rotating = weightedDays.length === 1 && layout === "ROTATE";

  let w = 0; // index among weighted days
  return days.map((day) => {
    if (day.equipment === "WEIGHTS") {
      const myIdx = w++;
      const cores = assignment[myIdx] ?? [];
      const movements = [...cores];
      riders.forEach((pull, k) => {
        if (riderIdxs[k] === myIdx) movements.push(pull);
      });
      const liftWeek = rotating ? rotationWaveWeek(week) : week;
      const exercises = movements.map((m) => plannedExercise(m, "WEIGHTS", state, liftWeek, rounding));
      return {
        id: day.id,
        name: day.name,
        equipment: day.equipment,
        minutes: day.minutes,
        ...(rotating ? { rotation: rotationHalf(week) } : {}),
        exercises,
      };
    }
    // Bodyweight day: full-body, all patterns (+ the enabled pulls).
    const movements = [...CORE_MOVEMENTS, ...riders];
    const exercises = movements.map((m) => plannedExercise(m, "BODYWEIGHT", state, week, rounding));
    return { id: day.id, name: day.name, equipment: day.equipment, minutes: day.minutes, exercises };
  });
}
