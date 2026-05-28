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
