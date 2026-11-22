// The team's season (Settings → Trainer → Season): the "Saison" leaderboard tab and the goals
// API's period=season use it instead of a calendar year. A new season = the trainers set new
// dates, which "resets" the season board. Pure helpers (unit-tested in season.test.ts); the DB
// read lives in season-store.ts.
import { addDays } from "@/lib/dates";

export const SEASON_START_KEY = "season.start";
export const SEASON_END_KEY = "season.end";

export type Season = {
  /** Local midnight of the first day. */
  start: Date;
  /** Local midnight AFTER the last day (exclusive end, like every other range). */
  end: Date;
  /** yyyy-mm-dd, inclusive. */
  since: string;
  until: string;
  /** False when no season is configured and the calendar year stands in. */
  configured: boolean;
};

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseDayKey(v: string | null | undefined): Date | null {
  const m = DAY_RE.exec(v ?? "");
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(y, mo - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return null;
  return date;
}

const key = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Validate a start/end pair (inclusive days, end ≥ start, at most ~2 years). */
export function validateSeason(start: string, end: string): { start: string; end: string } | null {
  const s = parseDayKey(start);
  const e = parseDayKey(end);
  if (!s || !e || e < s) return null;
  if (e.getTime() - s.getTime() > 731 * 86_400_000) return null;
  return { start: key(s), end: key(e) };
}

/** The configured season, or the calendar year of `now` when none (or an invalid one) is set. */
export function resolveSeason(start: string | null, end: string | null, now: Date): Season {
  const v = start && end ? validateSeason(start, end) : null;
  if (v) {
    const s = parseDayKey(v.start)!;
    const e = parseDayKey(v.end)!;
    return { start: s, end: addDays(e, 1), since: v.start, until: v.end, configured: true };
  }
  const s = new Date(now.getFullYear(), 0, 1);
  const e = new Date(now.getFullYear() + 1, 0, 1);
  return { start: s, end: e, since: key(s), until: key(addDays(e, -1)), configured: false };
}

/** "1.11.–12.5." for the tab label (day.month., no years). */
export function seasonLabel(season: Season): string {
  const last = addDays(season.end, -1);
  const f = (d: Date) => `${d.getDate()}.${d.getMonth() + 1}.`;
  return `${f(season.start)}–${f(last)}`;
}
