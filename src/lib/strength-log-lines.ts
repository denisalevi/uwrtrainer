// Pure state logic for the strength workout logger's exercise lines (extracted from the
// client component so the no-data-loss guarantees below are unit-testable).
//
// The invariant that matters most: values the athlete typed must survive switching an
// exercise picker back and forth (plan exercise ↔ custom ↔ another plan exercise). Each
// line therefore carries a per-exercise `stash` of the rows last shown for that choice.

import type { MovementKey } from "@/lib/constants";

export type SetKind = "warmup" | "main" | "bbb";
export type SetTarget = { reps: number; weight: number | null; amrap: boolean; kind?: SetKind; pct?: number | null };
export type Suggestion = {
  id: string;
  /** Which movement pattern this preloads (drives per-lift progression on finish). */
  movement?: MovementKey;
  /** The lift's own wave week these sets were built from — recorded so finishing advances it. */
  week?: number;
  /** The lift's own cycle when the sets were built — recorded so the saved session shows the
   * true per-lift position (issue #32), not the program's legacy shared pointer. */
  cycle?: number;
  label: string;
  trainingMax?: number;
  sets: SetTarget[];
  /** Pre-filled weight for one "Boring But Big" set on this lift; null on non-weighted lifts. */
  bbbWeight?: number | null;
};
export type LoggerDay = { id: string; name: string; minutes: number; suggestions: Suggestion[] };

export type SetVal = { weight: string; reps: string; kind: SetKind; amrap?: boolean };
/** Everything a picker choice displays — snapshotted into the stash when switching away. */
type Snapshot = {
  name: string;
  sets: SetVal[];
  done?: boolean;
  trainingMax?: number;
  movement?: MovementKey;
  week?: number;
  cycle?: number;
};
export type Line = Snapshot & {
  key: string;
  exerciseId: string;
  /** Rows previously shown per picker choice, so switching back restores what was typed. */
  stash?: Record<string, Snapshot>;
};

let uid = 0;
export const nextKey = () => `l${Date.now()}_${uid++}`;

export const CUSTOM_LINE_ID = "custom";

/** Display/order rank for set kinds; used to keep a line grouped warm-up → working → BBB. */
const KIND_RANK: Record<SetKind, number> = { warmup: 0, main: 1, bbb: 2 };
/** Stable sort by kind (Array.sort is stable in V8), preserving within-group order. */
export function sortByKind(sets: SetVal[]): SetVal[] {
  return [...sets].sort((a, b) => KIND_RANK[a.kind] - KIND_RANK[b.kind]);
}

/** Build the editable set rows for a suggestion (weights pre-filled, reps blank, kind carried). */
export function seedSets(sug: Suggestion): SetVal[] {
  return sug.sets.map((s) => ({
    weight: s.weight != null ? String(s.weight) : "",
    reps: "",
    kind: s.kind ?? "main",
    amrap: s.amrap,
  }));
}

/** Preselect one editable line per configured exercise on the day. */
export function seedLines(day: LoggerDay | undefined): Line[] {
  if (!day) return [];
  return day.suggestions.map((sug) => ({
    key: nextKey(),
    exerciseId: sug.id,
    name: sug.label,
    trainingMax: sug.trainingMax,
    movement: sug.movement,
    week: sug.week,
    cycle: sug.cycle,
    sets: seedSets(sug),
  }));
}

/** True when the athlete has typed anything worth protecting (reps, or a custom name). */
export function hasUserInput(lines: Line[]): boolean {
  return lines.some(
    (l) =>
      l.sets.some((s) => s.reps.trim() !== "") ||
      (l.exerciseId === CUSTOM_LINE_ID && l.name.trim() !== ""),
  );
}

/**
 * Change which exercise a line logs, WITHOUT losing anything typed:
 * - the rows being switched away from are stashed under the old choice, and restored
 *   verbatim if the athlete switches back later;
 * - switching to "custom" carries the current rows (and name) along, so nothing visibly
 *   resets — only movement/week are dropped, because a custom exercise must never drive
 *   progression;
 * - switching to a plan exercise seen before restores its stashed rows; a first visit
 *   seeds its prescribed sets.
 */
export function switchExercise(l: Line, exerciseId: string, suggestions: Suggestion[]): Line {
  if (exerciseId === l.exerciseId) return l;
  const stash: Record<string, Snapshot> = {
    ...l.stash,
    [l.exerciseId]: {
      name: l.name,
      sets: l.sets,
      done: l.done,
      trainingMax: l.trainingMax,
      movement: l.movement,
      week: l.week,
      cycle: l.cycle,
    },
  };
  const kept = l.stash?.[exerciseId];
  if (kept) return { ...l, ...kept, exerciseId, stash };
  if (exerciseId === CUSTOM_LINE_ID) {
    return {
      ...l,
      exerciseId,
      movement: undefined,
      week: undefined,
      cycle: undefined,
      trainingMax: undefined,
      sets: l.sets.length > 0 ? l.sets : [{ weight: "", reps: "", kind: "main" }],
      stash,
    };
  }
  const sug = suggestions.find((s) => s.id === exerciseId);
  if (!sug) return { ...l, exerciseId, stash };
  return {
    ...l,
    exerciseId,
    name: sug.label,
    trainingMax: sug.trainingMax,
    movement: sug.movement,
    week: sug.week,
    cycle: sug.cycle,
    done: false,
    sets: seedSets(sug),
    stash,
  };
}

/**
 * Rebuild editable lines from a saved session's details JSON (resume/edit). Lines are
 * re-linked to the day's plan exercises via the saved exerciseId — falling back to a label
 * match for sessions saved before exerciseId existed — so the picker and the %-of-max
 * display survive a reload instead of everything degrading to "custom".
 */
export function restoreLines(details: Record<string, unknown>, day: LoggerDay | undefined): Line[] {
  const ex = Array.isArray(details.exercises) ? details.exercises : [];
  return (
    ex as Array<{
      exerciseId?: string;
      name?: string;
      done?: boolean;
      trainingMax?: number;
      movement?: MovementKey;
      week?: number;
      cycle?: number;
      sets?: Array<Record<string, unknown>>;
    }>
  ).map((e) => {
    const name = String(e.name ?? "");
    const savedId = typeof e.exerciseId === "string" ? e.exerciseId : undefined;
    // An explicit saved choice is respected (including "custom"); only legacy saves without
    // one fall back to matching the label. A stale id (program changed) degrades to custom.
    const sug = savedId
      ? savedId === CUSTOM_LINE_ID
        ? undefined
        : day?.suggestions.find((s) => s.id === savedId)
      : day?.suggestions.find((s) => s.label === name);
    return {
      key: nextKey(),
      exerciseId: sug?.id ?? CUSTOM_LINE_ID,
      name,
      done: !!e.done,
      trainingMax: typeof e.trainingMax === "number" ? e.trainingMax : undefined,
      // Preserve the movement + logged week/cycle so re-finishing an edited session advances the
      // right lift and the saved details keep showing the true per-lift position.
      movement: e.movement,
      week: typeof e.week === "number" ? e.week : undefined,
      cycle: typeof e.cycle === "number" ? e.cycle : undefined,
      sets: (e.sets ?? []).map((s) => ({
        weight: s.weight != null ? String(s.weight) : "",
        reps: s.reps != null ? String(s.reps) : "",
        kind: (s.kind === "warmup" || s.kind === "bbb" ? s.kind : "main") as SetKind,
        amrap: s.amrap === true,
      })),
    };
  });
}
