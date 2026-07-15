// Extra (one-off) rugby practices: recorded through the same attendance flow as a scheduled
// practice, but with a free-text name instead of a PracticeSlot — e.g. a spontaneous extra
// session some week. Rows are ordinary RUGBY DONE logs (so they count toward the weekly rugby
// goal like any practice) with practiceSlotId = null and details = { kind, label }.

/** Sentinel value the attendance form's practice <select> uses for "extra practice". */
export const EXTRA_PRACTICE_ID = "__extra__";

export const EXTRA_PRACTICE_KIND = "extraPractice";

export function extraPracticeDetails(label: string): string {
  return JSON.stringify({ kind: EXTRA_PRACTICE_KIND, label });
}

/** The label of an extra-practice row, or null when the details are not one. */
export function extraPracticeLabel(details: string | null | undefined): string | null {
  if (!details) return null;
  try {
    const d = JSON.parse(details) as { kind?: unknown; label?: unknown };
    if (d?.kind === EXTRA_PRACTICE_KIND && typeof d.label === "string" && d.label) return d.label;
    return null;
  } catch {
    return null;
  }
}
