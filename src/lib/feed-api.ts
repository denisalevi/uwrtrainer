// Pure mapping from SessionLog rows to the JSON shape of GET /api/v1/feed.
// Deliberately minimal: only what a teammate already sees in the in-app feed — no user ids,
// emails, miss reasons, plans or trainer notes. Unit-tested in feed-api.test.ts.
import { localDayKey } from "@/lib/api-tokens";
import { TOURNAMENT_CATEGORY, tournamentLabel } from "@/lib/tournament";
import { extraPracticeLabel } from "@/lib/extra-practice";

export type FeedApiSourceRow = {
  date: Date;
  category: string;
  status: string;
  durationMin: number | null;
  details: string | null;
  user: { name: string };
  practiceSlot: { label: string } | null;
};

export type FeedApiExercise = {
  name: string;
  /** Logged sets as text, warm-ups first: "40 kg × 5", "12", "30 s", "24 kg × 40 s". */
  sets: string[];
};

export type FeedApiEntry = {
  /** Local day, yyyy-mm-dd. */
  date: string;
  member: string;
  /** RUGBY | STRENGTH | CARDIO | MOBILITY | OTHER | TOURNAMENT */
  category: string;
  /** DONE | MISSED */
  status: string;
  durationMin: number | null;
  /** What it was: practice / tournament / routine / 5/3/1 day name, or the free-text activity. */
  title: string | null;
  /** The note shown in the feed (or the cardio zone), if any. */
  note: string | null;
  /** Strength sessions only. */
  exercises?: FeedApiExercise[];
};

type Set = { weight?: unknown; reps?: unknown; seconds?: unknown; amrap?: unknown };
type Details = {
  note?: unknown;
  zone?: unknown;
  activity?: unknown;
  dayName?: unknown;
  routineName?: unknown;
  notes?: unknown;
  exercises?: unknown;
};

const str = (v: unknown): string | null =>
  typeof v === "string" && v.trim() ? v.trim() : null;
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

function parseDetails(details: string | null): Details {
  if (!details) return {};
  try {
    const d = JSON.parse(details);
    return d && typeof d === "object" ? (d as Details) : {};
  } catch {
    return {};
  }
}

/** One logged set as text — same rendering as the in-app workout view (fmtSet). */
export function formatSet(s: Set): string {
  const weight = num(s.weight);
  const w = weight != null ? `${weight} kg` : null;
  const seconds = num(s.seconds);
  if (seconds != null) return w != null ? `${w} × ${seconds} s` : `${seconds} s`;
  const repsN = num(s.reps);
  const reps = repsN != null ? `${repsN}${s.amrap ? "+" : ""}` : "—";
  return w != null ? `${w} × ${reps}` : reps;
}

function exercisesOf(d: Details): FeedApiExercise[] {
  if (!Array.isArray(d.exercises)) return [];
  const out: FeedApiExercise[] = [];
  for (const raw of d.exercises as Array<Record<string, unknown>>) {
    if (!raw || typeof raw !== "object") continue;
    const name = str(raw.name);
    // Collapsed routine refs / links logged inline: keep the name, no sets.
    if (raw.itemType === "routine" || raw.itemType === "link") {
      if (name) out.push({ name, sets: [] });
      continue;
    }
    const sets = Array.isArray(raw.sets) ? (raw.sets as Set[]).filter((s) => s && typeof s === "object") : [];
    // Warm-up sets first, matching the in-app view order.
    const ordered = [
      ...sets.filter((s) => (s as { kind?: unknown }).kind === "warmup"),
      ...sets.filter((s) => (s as { kind?: unknown }).kind !== "warmup"),
    ];
    out.push({ name: name ?? "Exercise", sets: ordered.map(formatSet) });
  }
  return out;
}

export function toFeedApiEntry(row: FeedApiSourceRow): FeedApiEntry {
  const d = parseDetails(row.details);
  const isStrength = row.category === "STRENGTH";
  const title =
    row.practiceSlot?.label ??
    (row.category === "RUGBY" ? extraPracticeLabel(row.details) : null) ??
    (row.category === TOURNAMENT_CATEGORY ? tournamentLabel(row.details) : null) ??
    (isStrength ? (str(d.routineName) ?? str(d.dayName)) : null) ??
    str(d.activity);

  const entry: FeedApiEntry = {
    date: localDayKey(row.date),
    member: row.user.name,
    category: row.category,
    status: row.status,
    durationMin: row.durationMin,
    title,
    note: str(d.note) ?? str(d.zone) ?? (isStrength ? str(d.notes) : null),
  };
  if (isStrength && row.status === "DONE") entry.exercises = exercisesOf(d);
  return entry;
}
