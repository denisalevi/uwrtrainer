import { addDays } from "@/lib/dates";

/**
 * Seasonal availability for practice slots. A slot is bookable on a given day when it is manually
 * `active` AND that calendar day falls inside its optional `[validFrom, validTo]` window (inclusive
 * by day; a null bound is open-ended). This governs three things consistently across the app:
 * which practices are offered for logging, whether an absence produces an auto-MISSED row, and
 * whether a committed practice counts toward that week's adherence score.
 */
export type SlotWindow = {
  active: boolean;
  validFrom: Date | null;
  validTo: Date | null;
};

/** Local midnight (ms) for a date — comparisons are by calendar day, not clock time. */
function dayMs(d: Date): number {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}

/** Is the practice bookable on `date`? (active + within the seasonal window). */
export function isSlotAvailableOn(slot: SlotWindow, date: Date): boolean {
  if (!slot.active) return false;
  const day = dayMs(date);
  if (slot.validFrom && day < dayMs(slot.validFrom)) return false;
  if (slot.validTo && day > dayMs(slot.validTo)) return false;
  return true;
}

/** The calendar date a weekly practice (dayOfWeek 0=Sun..6=Sat) falls on in the week of `weekStart` (Mon). */
export function practiceDateInWeek(weekStart: Date, dayOfWeek: number): Date {
  const offset = (dayOfWeek + 6) % 7; // days after Monday: Mon=0 .. Sun=6
  return addDays(weekStart, offset);
}

/** Is the slot in season for the week starting `weekStart` — i.e. bookable on its weekly occurrence? */
export function isSlotInSeasonForWeek(
  slot: SlotWindow & { dayOfWeek: number },
  weekStart: Date,
): boolean {
  return isSlotAvailableOn(slot, practiceDateInWeek(weekStart, slot.dayOfWeek));
}
