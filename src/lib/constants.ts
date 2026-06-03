// Enum-like unions (SQLite can't store Prisma enums) + shared option lists.

export const ROLES = ["PLAYER", "TRAINER", "ADMIN"] as const;
export type Role = (typeof ROLES)[number];

export const CATEGORIES = ["RUGBY", "STRENGTH", "CARDIO", "MOBILITY"] as const;
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

/** What the athlete has access to. NONE = bodyweight only, fully supported. */
export const EQUIPMENT_LEVELS = [
  "NONE",
  "PULLUP_BAR",
  "DUMBBELLS",
  "BARBELL",
  "FULL_GYM",
] as const;
export type EquipmentLevel = (typeof EQUIPMENT_LEVELS)[number];

/** The five movement patterns we train. PULL is added for UWR (Wendler omits it). */
export const MOVEMENTS = ["PUSH", "PULL", "SQUAT", "HINGE", "PRESS"] as const;
export type MovementKey = (typeof MOVEMENTS)[number];

/**
 * Bodyweight difficulty ladders (easiest → hardest) used by LEVELS mode. "Graduating"
 * to the next entry is the bodyweight equivalent of adding weight. The early entries are
 * deliberately doable with nothing at all (a floor, a wall, a sturdy table).
 */
export const MOVEMENT_LEVELS: Record<MovementKey, readonly string[]> = {
  PUSH: [
    "Wall push-up",
    "Incline push-up (on a table)",
    "Knee push-up",
    "Full push-up",
    "Feet-elevated push-up",
    "Archer push-up",
    "One-arm push-up progression",
  ],
  PULL: [
    "Table row (under a sturdy table)",
    "Inverted row (low bar/table)",
    "Band-assisted pull-up",
    "Negative pull-up",
    "Pull-up",
    "Weighted pull-up",
  ],
  SQUAT: [
    "Box/chair squat",
    "Bodyweight squat",
    "Split squat",
    "Bulgarian split squat",
    "Assisted pistol squat",
    "Pistol squat",
  ],
  HINGE: [
    "Glute bridge",
    "Single-leg glute bridge",
    "Bodyweight good morning",
    "Single-leg Romanian deadlift",
    "Assisted Nordic curl",
    "Nordic curl",
  ],
  PRESS: [
    "Pike push-up (hands elevated)",
    "Pike push-up",
    "Feet-elevated pike push-up",
    "Wall handstand hold",
    "Partial wall handstand push-up",
    "Handstand push-up",
  ],
};

/** Dropdown: how many days per week (capped at 4 — more isn't useful here). */
export const SESSION_DAY_OPTIONS = [1, 2, 3, 4] as const;
/** Dropdown: minutes available per session. */
export const SESSION_TIME_OPTIONS = [30, 45, 60, 90] as const;

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
