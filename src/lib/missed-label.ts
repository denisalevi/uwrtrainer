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

/** yyyy-mm-dd (local) for a date, used to prefill loggers from a missed row's date. */
function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * The primary resolve action (href + i18n label key) for an auto-MISSED row.
 *  - Ticked-practice row (bucket 1: RUGBY + practiceSlotId): "Add yourself" → /attendance prefilled
 *    for that slot+date; logging present removes the row via reconcile.
 *  - Count-shortfall summary (bucket 2: no practiceSlotId): "Log the session" → the right logger
 *    for that category, prefilled with a date in that week (the row's date):
 *      STRENGTH → /strength/log, everything else → /log?category=…&date=…
 */
export function missedResolveAction(log: {
  category: string;
  practiceSlotId: string | null;
  date: Date;
}): { href: string; labelKey: DictKey } {
  if (log.practiceSlotId && log.category === "RUGBY") {
    return {
      href: `/attendance?slot=${log.practiceSlotId}&date=${dayKey(log.date)}`,
      labelKey: "missed.addYourself",
    };
  }
  if (log.category === "STRENGTH") {
    // Carry the missed row's date so the logged workout lands in (and heals) the missed week.
    return { href: `/strength/log?date=${dayKey(log.date)}`, labelKey: "missed.logSession" };
  }
  return {
    href: `/log?category=${log.category}&date=${dayKey(log.date)}`,
    labelKey: "missed.logSession",
  };
}
