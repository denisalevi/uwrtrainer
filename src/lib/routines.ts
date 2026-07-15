// Custom workout routines (docs/plans/custom-routines.md) — pure helpers shared by the
// server actions, the editor UI and the strength logger. A routine is a named list of
// exercises with per-exercise measure type (kg×reps / reps / seconds / kg×seconds), an
// optional tempo prescription and optional rest seconds, plus target sets. Routine
// exercises never carry movement/week/cycle, so logging one never touches 5/3/1 progression.

import { z } from "zod";
import { isMeasureType, type MeasureType } from "@/lib/constants";

export type RoutineSet = {
  reps?: number;
  weight?: number;
  seconds?: number;
};

export type RoutineExercise = {
  name: string;
  measure: MeasureType;
  /** Free-text tempo prescription ("3-0-3", "30X1", …) — displayed, never logged. */
  tempo?: string;
  /** Rest between this exercise's sets, feeding the logger's rest-timer bar. */
  restSeconds?: number;
  sets: RoutineSet[];
};

// ── Validation (server actions) ──────────────────────────────────────────────

const setSchema = z.object({
  reps: z.number().int().min(0).max(1000).optional(),
  weight: z.number().min(0).max(2000).optional(),
  seconds: z.number().int().min(0).max(36000).optional(),
});

const exerciseSchema = z.object({
  name: z.string().trim().min(1).max(80),
  measure: z.string().refine(isMeasureType, "invalid measure"),
  tempo: z.string().trim().max(20).optional(),
  restSeconds: z.number().int().min(0).max(3600).optional(),
  sets: z.array(setSchema).min(1).max(30),
});

export const RoutineExercisesSchema = z.array(exerciseSchema).min(1).max(30);
export const RoutineNameSchema = z.string().trim().min(1).max(60);

/** Which value axes a measure uses — drives set inputs, targets and display everywhere. */
export function measureAxes(measure: MeasureType): { weight: boolean; reps: boolean; seconds: boolean } {
  return {
    weight: measure === "KG_REPS" || measure === "KG_SECONDS",
    reps: measure === "KG_REPS" || measure === "REPS",
    seconds: measure === "SECONDS" || measure === "KG_SECONDS",
  };
}

/** Strip a validated exercise list down to the axes its measure uses (drops stray values). */
export function normalizeExercises(exercises: z.infer<typeof RoutineExercisesSchema>): RoutineExercise[] {
  return exercises.map((ex) => {
    const axes = measureAxes(ex.measure as MeasureType);
    return {
      name: ex.name,
      measure: ex.measure as MeasureType,
      ...(ex.tempo ? { tempo: ex.tempo } : {}),
      ...(ex.restSeconds != null && ex.restSeconds > 0 ? { restSeconds: ex.restSeconds } : {}),
      sets: ex.sets.map((s) => ({
        ...(axes.weight && s.weight != null ? { weight: s.weight } : {}),
        ...(axes.reps && s.reps != null ? { reps: s.reps } : {}),
        ...(axes.seconds && s.seconds != null ? { seconds: s.seconds } : {}),
      })),
    };
  });
}

// ── Tolerant read (display/logger — stored JSON must never 500 a page) ───────

/** Parse a stored `Routine.exercises` JSON string; malformed input yields []. */
export function parseRoutineExercises(raw: string | null | undefined): RoutineExercise[] {
  if (!raw) return [];
  let arr: unknown;
  try {
    arr = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(arr)) return [];
  return arr.flatMap((e): RoutineExercise[] => {
    const o = (e ?? {}) as Record<string, unknown>;
    const name = typeof o.name === "string" ? o.name.trim() : "";
    if (!name) return [];
    const measure: MeasureType = isMeasureType(o.measure) ? o.measure : "KG_REPS";
    const sets: RoutineSet[] = Array.isArray(o.sets)
      ? o.sets.map((s) => {
          const so = (s ?? {}) as Record<string, unknown>;
          const num = (v: unknown): number | undefined =>
            typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : undefined;
          return { reps: num(so.reps), weight: num(so.weight), seconds: num(so.seconds) };
        })
      : [];
    return [
      {
        name: name.slice(0, 80),
        measure,
        ...(typeof o.tempo === "string" && o.tempo.trim() ? { tempo: o.tempo.trim().slice(0, 20) } : {}),
        ...(typeof o.restSeconds === "number" && o.restSeconds > 0
          ? { restSeconds: Math.min(Math.round(o.restSeconds), 3600) }
          : {}),
        sets: sets.length ? sets : [{}],
      },
    ];
  });
}

// ── Prefill from history (poor-man's progressive overload) ───────────────────

/** The subset of a saved strength-workout details JSON the prefill needs. */
export type LoggedRoutineExercise = {
  name?: string;
  sets?: Array<{ weight?: number | null; reps?: number | null; seconds?: number | null }>;
};

/**
 * Merge a routine exercise's target sets with what was actually logged the last time this
 * routine was done: the last session's values win set-by-set (its set count too, so an added
 * set sticks), the routine's stored targets fill the gaps. Exercises are matched by name
 * (case-insensitive), falling back to list position, so renaming one exercise doesn't
 * misalign the rest.
 */
export function prefillSets(
  exercise: RoutineExercise,
  index: number,
  lastLogged: LoggedRoutineExercise[] | null | undefined,
): RoutineSet[] {
  const logged = matchLogged(exercise, index, lastLogged);
  const loggedSets = Array.isArray(logged?.sets) ? logged.sets : null;
  const base = exercise.sets.length ? exercise.sets : [{}];
  if (!loggedSets || loggedSets.length === 0) return base;

  const axes = measureAxes(exercise.measure);
  const n = Math.max(base.length, loggedSets.length);
  const out: RoutineSet[] = [];
  for (let i = 0; i < n; i++) {
    const target = base[i] ?? base[base.length - 1] ?? {};
    const last = loggedSets[i];
    const pick = (a: number | null | undefined, b: number | undefined): number | undefined =>
      a != null && Number.isFinite(a) && a >= 0 ? a : b;
    out.push({
      ...(axes.weight ? { weight: pick(last?.weight, target.weight) } : {}),
      ...(axes.reps ? { reps: pick(last?.reps, target.reps) } : {}),
      ...(axes.seconds ? { seconds: pick(last?.seconds, target.seconds) } : {}),
    });
  }
  return out;
}

function matchLogged(
  exercise: RoutineExercise,
  index: number,
  lastLogged: LoggedRoutineExercise[] | null | undefined,
): LoggedRoutineExercise | null {
  if (!Array.isArray(lastLogged) || lastLogged.length === 0) return null;
  const wanted = exercise.name.trim().toLowerCase();
  const byName = lastLogged.find((e) => typeof e?.name === "string" && e.name.trim().toLowerCase() === wanted);
  if (byName) return byName;
  return lastLogged[index] ?? null;
}

// ── Display helpers ───────────────────────────────────────────────────────────

/** Compact target summary for a routine card, e.g. "3×8" / "3×30 s" / "5×5 @ 60 kg". */
export function summarizeExercise(ex: RoutineExercise): string {
  const n = ex.sets.length;
  const first = ex.sets[0] ?? {};
  const axes = measureAxes(ex.measure);
  const amount = axes.seconds
    ? first.seconds != null
      ? `${first.seconds} s`
      : "?"
    : first.reps != null
      ? String(first.reps)
      : "?";
  const load = axes.weight && first.weight != null ? ` @ ${first.weight} kg` : "";
  return `${n}×${amount}${load}`;
}

/** The log-picker prefix marking a routine-backed logger day ("routine:<id>"). */
export const ROUTINE_DAY_PREFIX = "routine:";
export function routineDayId(routineId: string): string {
  return `${ROUTINE_DAY_PREFIX}${routineId}`;
}
export function routineIdFromDayId(dayId: string | undefined | null): string | null {
  return dayId && dayId.startsWith(ROUTINE_DAY_PREFIX) ? dayId.slice(ROUTINE_DAY_PREFIX.length) : null;
}
