import type { DictKey } from "@/lib/i18n/dictionaries";

type TFn = (key: DictKey, vars?: Record<string, string | number>) => string;

type WeeklySummary = { missed: number; target: number; note: string | null };

/**
 * Parse the `details` JSON of a weekly summary auto-MISSED row into its counts.
 * Weekly summary rows carry `{ missed, target, note? }` (see `reconcileNonRugbyWeek`).
 * Returns null when the row isn't a weekly summary (no count payload).
 */
export function parseWeeklySummary(details: string | null): WeeklySummary | null {
  if (!details) return null;
  try {
    const d = JSON.parse(details) as { missed?: number; target?: number; note?: string };
    if (typeof d.missed !== "number" || typeof d.target !== "number") return null;
    return { missed: d.missed, target: d.target, note: (d.note ?? "").trim() || null };
  } catch {
    return null;
  }
}

/**
 * Build the count-based label for a weekly auto-MISSED summary row, e.g.
 * "Missed 2 of 3 Cardio sessions". `{activity}` is the OTHER note label when present,
 * otherwise the translated category name. Returns null if the row isn't a summary.
 */
export function weeklySummaryLabel(
  t: TFn,
  category: string,
  details: string | null,
): string | null {
  const s = parseWeeklySummary(details);
  if (!s) return null;
  const activity =
    category === "OTHER" && s.note ? s.note : t(`cat.${category}` as DictKey);
  return t("missed.weeklySummary", { missed: s.missed, target: s.target, activity });
}
