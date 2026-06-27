// Enum-like unions (SQLite can't store Prisma enums) + shared option lists.

export const ROLES = ["PLAYER", "TRAINER", "ADMIN"] as const;
export type Role = (typeof ROLES)[number];

export const CATEGORIES = ["RUGBY", "STRENGTH", "CARDIO", "MOBILITY", "OTHER"] as const;
export type Category = (typeof CATEGORIES)[number];

export const PRACTICE_TIERS = ["PRIMARY", "SECONDARY", "OPTIONAL"] as const;
export type PracticeTier = (typeof PRACTICE_TIERS)[number];

export const SESSION_STATUSES = ["DONE", "MISSED"] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

export const CARDIO_ZONES = ["Z2", "Z3", "Z4"] as const;
export type CardioZone = (typeof CARDIO_ZONES)[number];

export const STRENGTH_LIFTS = ["SQUAT", "BENCH", "DEADLIFT", "PRESS", "OTHER"] as const;
export type StrengthLift = (typeof STRENGTH_LIFTS)[number];

// ── Strength program (Wendler-style engine, see src/lib/strength.ts) ──

/** How progression happens: add weight, add reps, or step up to a harder variation. */
export const STRENGTH_MODES = ["WEIGHTED", "REPS", "LEVELS"] as const;
export type StrengthMode = (typeof STRENGTH_MODES)[number];

/** What the athlete has access to. NONE = bodyweight only, fully supported. (legacy) */
export const EQUIPMENT_LEVELS = [
  "NONE",
  "PULLUP_BAR",
  "DUMBBELLS",
  "BARBELL",
  "FULL_GYM",
] as const;
export type EquipmentLevel = (typeof EQUIPMENT_LEVELS)[number];

/**
 * Individual tools an athlete can have — multi-select, chosen per training day.
 * Bodyweight is always implied. KETTLEBELL/DUMBBELLS/BARBELL are "loadable" (enable
 * weighted progression); PULLUP_BAR enables pulls.
 */
export const EQUIPMENT_TOOLS = [
  "PULLUP_BAR",
  "KETTLEBELL",
  "DUMBBELLS",
  "BARBELL",
  "BANDS",
  "MEDICINE_BALL",
  "BENCH",
] as const;
export type EquipmentTool = (typeof EQUIPMENT_TOOLS)[number];

/** The five movement patterns we train. PULL is added for UWR (Wendler omits it). */
export const MOVEMENTS = ["PUSH", "PULL", "SQUAT", "HINGE", "PRESS"] as const;
export type MovementKey = (typeof MOVEMENTS)[number];

/**
 * Top-level program choice (replaces the old per-day tool multi-select). WEIGHTS preselects
 * the classic barbell Wendler lifts; BODYWEIGHT preselects the bodyweight ladders (and assumes
 * a pull-up bar). Individual exercises can still be swapped per-slot via the Modify picker.
 */
export const PROGRAM_EQUIPMENT = ["WEIGHTS", "BODYWEIGHT"] as const;
export type ProgramEquipment = (typeof PROGRAM_EQUIPMENT)[number];

/** Per-slot progression: a loaded lift (kg) or a bodyweight exercise (reps). */
export const SLOT_MODES = ["WEIGHTED", "BODYWEIGHT"] as const;
export type SlotMode = (typeof SLOT_MODES)[number];

/** The tool a single exercise variant needs — drives the "(Barbell)" label on a slot. */
export const SLOT_TOOLS = ["BARBELL", "DUMBBELLS", "KETTLEBELL", "BODYWEIGHT"] as const;
export type SlotTool = (typeof SLOT_TOOLS)[number];

/**
 * When only ONE day a week is weighted, how to cover the four lifts:
 *  - ROTATE: alternate two-lift pairs over a 2-week cycle (each lift loaded biweekly).
 *  - ALL_IN_ONE: do all four loaded in one long session (each lift loaded weekly).
 */
export const WEIGHTED_LAYOUTS = ["ROTATE", "ALL_IN_ONE"] as const;
export type WeightedLayout = (typeof WEIGHTED_LAYOUTS)[number];

/** Global (trainer) setting: whether default plans include a pull/row movement. */
export const SETTING_INCLUDE_PULL = "strength.includePull";
export const DEFAULT_INCLUDE_PULL = true;

/**
 * Bodyweight difficulty ladders (easiest → hardest) for LEVELS mode. Values are i18n keys
 * (translated in the UI); start points are realistic for an active team — push starts at the
 * knee push-up, no easier. "Graduating" to the next entry replaces adding weight.
 */
export const MOVEMENT_LEVELS: Record<MovementKey, readonly string[]> = {
  PUSH: ["ex.push.knee", "ex.push.full", "ex.push.feet", "ex.push.archer", "ex.push.onearm"],
  PULL: ["ex.pull.band", "ex.pull.full", "ex.pull.weighted"],
  SQUAT: ["ex.squat.bw", "ex.squat.split", "ex.squat.bulgarian", "ex.squat.pistol"],
  HINGE: ["ex.hinge.bridge", "ex.hinge.singlebridge", "ex.hinge.slrdl", "ex.hinge.nordic"],
  PRESS: ["ex.press.pike", "ex.press.feetpike", "ex.press.wallhspu", "ex.press.hspu"],
};

/** Dropdown: how many days per week (capped at 4 — more isn't useful here). */
export const SESSION_DAY_OPTIONS = [1, 2, 3, 4] as const;
/** Dropdown: minutes available per session. */
export const SESSION_TIME_OPTIONS = [30, 45, 60, 90, 120] as const;

export const LEADERBOARD_METRICS = [
  "ADHERENCE_POINTS",
  "RUGBY_PRACTICES",
  "PRIMARY_PRACTICES",
  "STREAK",
] as const;
export type LeaderboardMetric = (typeof LEADERBOARD_METRICS)[number];

export const LEADERBOARD_VISIBILITY = ["TRAINERS_ONLY", "EVERYONE"] as const;
export type LeaderboardVisibility = (typeof LEADERBOARD_VISIBILITY)[number];

export const LOCALES = ["en", "de"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";

export function isRole(v: string): v is Role {
  return (ROLES as readonly string[]).includes(v);
}
export function isLocale(v: string | undefined | null): v is Locale {
  return !!v && (LOCALES as readonly string[]).includes(v);
}
export function isTrainer(role: string): boolean {
  return role === "TRAINER" || role === "ADMIN";
}

// Default weekly base points awarded for 100% adherence (see scoring.ts).
export const BASE_WEEKLY_POINTS = 100;
