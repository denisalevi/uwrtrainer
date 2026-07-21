// Custom workout routines (docs/plans/custom-routines.md) — pure helpers shared by the
// server actions, the editor UI and the strength logger. A routine is a named list of
// ITEMS: exercises with per-exercise measure type (kg×reps / reps / seconds / kg×seconds),
// an optional tempo prescription and optional rest seconds, plus target sets — and, since
// the nested-routines feature, references to OTHER routines ("do my stretching routine
// here", shown collapsed and ticked off, never expanded set-by-set) and named web links
// (a warm-up video; rendered as their label, never the raw URL). Routine exercises never
// carry movement/week/cycle, so logging one never touches 5/3/1 progression.

import { z } from "zod";
import { isMeasureType, type MeasureType } from "@/lib/constants";

export type RoutineSet = {
  reps?: number;
  weight?: number;
  seconds?: number;
};

export type RoutineExercise = {
  /** Absent on legacy documents — an item without a type IS an exercise. */
  type?: "exercise";
  name: string;
  measure: MeasureType;
  /** Free-text tempo prescription ("3-0-3", "30X1", …) — displayed, never logged. */
  tempo?: string;
  /** Rest between this exercise's sets, feeding the logger's rest-timer bar. */
  restSeconds?: number;
  /** Free-text hint ("focus on depth") — displayed wherever the exercise is. */
  note?: string;
  sets: RoutineSet[];
};

/** A collapsed reference to another routine (one level — refs are never expanded). The
 *  name is a snapshot for display; the id links to the live routine's read-only view. */
export type RoutineRef = {
  type: "routine";
  routineId: string;
  name: string;
  note?: string;
};

/** A named web link (warm-up video etc.) — shown as its label, never the raw URL. */
export type RoutineLink = {
  type: "link";
  url: string;
  label?: string;
  note?: string;
};

export type RoutineItem = RoutineExercise | RoutineRef | RoutineLink;

export function isRoutineRef(item: RoutineItem): item is RoutineRef {
  return (item as { type?: string }).type === "routine";
}
export function isRoutineLink(item: RoutineItem): item is RoutineLink {
  return (item as { type?: string }).type === "link";
}
export function isRoutineExercise(item: RoutineItem): item is RoutineExercise {
  return !isRoutineRef(item) && !isRoutineLink(item);
}

// ── Validation (server actions) ──────────────────────────────────────────────

const setSchema = z.object({
  reps: z.number().int().min(0).max(1000).optional(),
  weight: z.number().min(0).max(2000).optional(),
  seconds: z.number().int().min(0).max(36000).optional(),
});

const exerciseSchema = z.object({
  type: z.literal("exercise").optional(),
  name: z.string().trim().min(1).max(80),
  measure: z.string().refine(isMeasureType, "invalid measure"),
  tempo: z.string().trim().max(20).optional(),
  restSeconds: z.number().int().min(0).max(3600).optional(),
  note: z.string().trim().max(500).optional(),
  sets: z.array(setSchema).min(1).max(30),
});

// Only http(s) — anything else (javascript:, data:, …) must never become an <a href>.
export const isSafeHttpUrl = (u: string): boolean => /^https?:\/\/\S+$/i.test(u);

const refSchema = z.object({
  type: z.literal("routine"),
  routineId: z.string().min(1).max(64),
  // The server re-snapshots the name from the DB on save; the client value is a hint only.
  name: z.string().trim().max(60).optional(),
  note: z.string().trim().max(500).optional(),
});

const linkSchema = z.object({
  type: z.literal("link"),
  url: z.string().trim().max(500).refine(isSafeHttpUrl, "invalid url"),
  label: z.string().trim().max(60).optional(),
  note: z.string().trim().max(500).optional(),
});

// Typed refs/links first — an untyped (or "exercise"-typed) item falls through to exercise.
const itemSchema = z.union([refSchema, linkSchema, exerciseSchema]);
export const RoutineItemsSchema = z.array(itemSchema).min(1).max(30);
export const RoutineNameSchema = z.string().trim().min(1).max(60);

/** Which value axes a measure uses — drives set inputs, targets and display everywhere. */
export function measureAxes(measure: MeasureType): { weight: boolean; reps: boolean; seconds: boolean } {
  return {
    weight: measure === "KG_REPS" || measure === "KG_SECONDS",
    reps: measure === "KG_REPS" || measure === "REPS",
    seconds: measure === "SECONDS" || measure === "KG_SECONDS",
  };
}

/** Normalize a validated item list: exercises are stripped down to the axes their measure
 *  uses (drops stray values); refs/links keep only their known fields. */
export function normalizeItems(items: z.infer<typeof RoutineItemsSchema>): RoutineItem[] {
  return items.map((item): RoutineItem => {
    if (item.type === "routine") {
      return {
        type: "routine",
        routineId: item.routineId,
        name: item.name ?? "",
        ...(item.note ? { note: item.note } : {}),
      };
    }
    if (item.type === "link") {
      return {
        type: "link",
        url: item.url,
        ...(item.label ? { label: item.label } : {}),
        ...(item.note ? { note: item.note } : {}),
      };
    }
    const ex = item;
    const axes = measureAxes(ex.measure as MeasureType);
    return {
      name: ex.name,
      measure: ex.measure as MeasureType,
      ...(ex.tempo ? { tempo: ex.tempo } : {}),
      ...(ex.restSeconds != null && ex.restSeconds > 0 ? { restSeconds: ex.restSeconds } : {}),
      ...(ex.note ? { note: ex.note } : {}),
      sets: ex.sets.map((s) => ({
        ...(axes.weight && s.weight != null ? { weight: s.weight } : {}),
        ...(axes.reps && s.reps != null ? { reps: s.reps } : {}),
        ...(axes.seconds && s.seconds != null ? { seconds: s.seconds } : {}),
      })),
    };
  });
}

// ── Tolerant read (display/logger — stored JSON must never 500 a page) ───────

/** Parse a stored `Routine.exercises` JSON string into items; malformed input yields []. */
export function parseRoutineItems(raw: string | null | undefined): RoutineItem[] {
  if (!raw) return [];
  let arr: unknown;
  try {
    arr = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(arr)) return [];
  return arr.flatMap((e): RoutineItem[] => {
    const o = (e ?? {}) as Record<string, unknown>;
    const str = (v: unknown, max: number): string | undefined =>
      typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined;
    if (o.type === "routine") {
      const routineId = str(o.routineId, 64);
      if (!routineId) return [];
      return [
        {
          type: "routine",
          routineId,
          name: str(o.name, 60) ?? "",
          ...(str(o.note, 500) ? { note: str(o.note, 500) } : {}),
        },
      ];
    }
    if (o.type === "link") {
      const url = str(o.url, 500);
      if (!url || !isSafeHttpUrl(url)) return [];
      return [
        {
          type: "link",
          url,
          ...(str(o.label, 60) ? { label: str(o.label, 60) } : {}),
          ...(str(o.note, 500) ? { note: str(o.note, 500) } : {}),
        },
      ];
    }
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
        ...(str(o.note, 500) ? { note: str(o.note, 500) } : {}),
        sets: sets.length ? sets : [{}],
      },
    ];
  });
}

/** Just the exercises of a routine document (prefill, summaries — refs/links have no sets). */
export function parseRoutineExercises(raw: string | null | undefined): RoutineExercise[] {
  return parseRoutineItems(raw).filter(isRoutineExercise);
}

/** Remap routine-ref targets after a deep copy (source routine id → the copier's copy). */
export function remapRoutineRefs(items: RoutineItem[], map: Record<string, string>): RoutineItem[] {
  return items.map((item) =>
    isRoutineRef(item) && map[item.routineId] ? { ...item, routineId: map[item.routineId] } : item,
  );
}

/** Display label for a link item: its label, else a friendly host name, never the raw URL. */
export function linkLabel(link: RoutineLink): string {
  if (link.label && link.label.trim()) return link.label.trim();
  try {
    const host = new URL(link.url).hostname.replace(/^www\./, "");
    const known: Record<string, string> = {
      "youtube.com": "YouTube",
      "youtu.be": "YouTube",
      "vimeo.com": "Vimeo",
      "instagram.com": "Instagram",
    };
    return known[host] ?? host;
  } catch {
    return link.url;
  }
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

/** One-line summary of any item, for routine cards ("Bench 3×5 @ 60 kg · ↪ Stretching · 🔗 YouTube"). */
export function summarizeItem(item: RoutineItem): string {
  if (isRoutineRef(item)) return `↪ ${item.name || "…"}`;
  if (isRoutineLink(item)) return `🔗 ${linkLabel(item)}`;
  return `${item.name} ${summarizeExercise(item)}`;
}

/** Target sets of one exercise as short strings ("60 kg × 5", "30 s", "8"), for read-only views. */
export function formatTargetSets(ex: RoutineExercise): string[] {
  const axes = measureAxes(ex.measure);
  return ex.sets.map((s) => {
    const amount = axes.seconds
      ? s.seconds != null
        ? `${s.seconds} s`
        : "—"
      : s.reps != null
        ? String(s.reps)
        : "—";
    return axes.weight && s.weight != null ? `${s.weight} kg × ${amount}` : amount;
  });
}

/** The log-picker prefix marking a routine-backed logger day ("routine:<id>"). */
export const ROUTINE_DAY_PREFIX = "routine:";
export function routineDayId(routineId: string): string {
  return `${ROUTINE_DAY_PREFIX}${routineId}`;
}
export function routineIdFromDayId(dayId: string | undefined | null): string | null {
  return dayId && dayId.startsWith(ROUTINE_DAY_PREFIX) ? dayId.slice(ROUTINE_DAY_PREFIX.length) : null;
}
