// Tournament / league game support (issue #31). A tournament is logged like a group practice
// (tick off who played) but is NOT a rugby practice: it has its own log category, counts on no
// leaderboard, and instead EXEMPTS the selected players' weekly goals — a game weekend shouldn't
// cost anyone adherence points. Which weeks are exempt is a team-wide trainer setting.

import { startOfWeek, addWeeks } from "@/lib/dates";

/** SessionLog.category for tournament / league game rows (deliberately NOT in CATEGORIES —
 *  it is not a plannable commitment and must never count as a rugby practice). */
export const TOURNAMENT_CATEGORY = "TOURNAMENT";

/** Setting key for the team-wide exemption mode. */
export const TOURNAMENT_EXEMPTION_KEY = "tournament.exemption";

/**
 * How much a logged tournament exempts, for the players who played:
 *  - NONE              — tournaments are recorded but exempt nothing.
 *  - WEEK_OF           — the week leading up to the game (the Mon–Sun week containing it).
 *  - WEEK_OF_AND_AFTER — that week AND the following one (hard to start a strength session on
 *                        Monday after a Sunday tournament).
 */
export const TOURNAMENT_EXEMPTIONS = ["NONE", "WEEK_OF", "WEEK_OF_AND_AFTER"] as const;
export type TournamentExemption = (typeof TOURNAMENT_EXEMPTIONS)[number];
export const DEFAULT_TOURNAMENT_EXEMPTION: TournamentExemption = "WEEK_OF";

export function isTournamentExemption(v: string | null | undefined): v is TournamentExemption {
  return !!v && (TOURNAMENT_EXEMPTIONS as readonly string[]).includes(v);
}

/**
 * The week starts (Monday, local, as epoch ms) exempted by tournaments on `dates`, under the
 * given mode. Pure — the server helpers feed it the player's tournament log dates.
 */
export function exemptWeekStarts(dates: Date[], mode: TournamentExemption): Set<number> {
  const out = new Set<number>();
  if (mode === "NONE") return out;
  for (const d of dates) {
    const ws = startOfWeek(d);
    out.add(ws.getTime());
    if (mode === "WEEK_OF_AND_AFTER") out.add(addWeeks(ws, 1).getTime());
  }
  return out;
}

/** Read the optional event label out of a tournament row's details JSON. */
export function tournamentLabel(details: string | null): string | null {
  if (!details) return null;
  try {
    const d = JSON.parse(details) as { label?: string };
    return (d.label ?? "").trim() || null;
  } catch {
    return null;
  }
}
