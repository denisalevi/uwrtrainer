import "server-only";
import { prisma } from "@/lib/db";
import { addWeeks } from "@/lib/dates";
import {
  DEFAULT_TOURNAMENT_EXEMPTION,
  TOURNAMENT_CATEGORY,
  TOURNAMENT_EXEMPTION_KEY,
  exemptWeekStarts,
  isTournamentExemption,
  type TournamentExemption,
} from "@/lib/tournament";

/** The team-wide tournament exemption mode (Setting), defaulting to the week of the game. */
export async function getTournamentExemptionMode(): Promise<TournamentExemption> {
  const row = await prisma.setting.findUnique({ where: { key: TOURNAMENT_EXEMPTION_KEY } });
  return isTournamentExemption(row?.value) ? row.value : DEFAULT_TOURNAMENT_EXEMPTION;
}

/**
 * Per user: the set of week starts (epoch ms) in [start, end) windows whose goals are exempt
 * because the user played a tournament (see exemptWeekStarts). Queries one week further back
 * than `start` so a tournament in the previous week can exempt the first requested week under
 * WEEK_OF_AND_AFTER. One query for all users — call sites are already batched per team/window.
 */
export async function loadExemptWeeks(
  userIds: string[],
  start: Date,
  end: Date,
): Promise<Map<string, Set<number>>> {
  const out = new Map<string, Set<number>>();
  if (userIds.length === 0) return out;
  const mode = await getTournamentExemptionMode();
  if (mode === "NONE") return out;
  const logs = await prisma.sessionLog.findMany({
    where: {
      userId: { in: userIds },
      category: TOURNAMENT_CATEGORY,
      status: "DONE",
      date: { gte: addWeeks(start, -1), lt: end },
    },
    select: { userId: true, date: true },
  });
  const datesByUser = new Map<string, Date[]>();
  for (const l of logs) {
    const arr = datesByUser.get(l.userId) ?? [];
    arr.push(l.date);
    datesByUser.set(l.userId, arr);
  }
  for (const [userId, dates] of datesByUser) {
    out.set(userId, exemptWeekStarts(dates, mode));
  }
  return out;
}

/** Is ONE user's week (starting `weekStart`) tournament-exempt? */
export async function isWeekExempt(userId: string, weekStart: Date): Promise<boolean> {
  const map = await loadExemptWeeks([userId], weekStart, addWeeks(weekStart, 1));
  return map.get(userId)?.has(weekStart.getTime()) ?? false;
}

/** The subset of `userIds` whose week (starting `weekStart`) is tournament-exempt. */
export async function exemptUsersForWeek(
  userIds: string[],
  weekStart: Date,
): Promise<Set<string>> {
  const map = await loadExemptWeeks(userIds, weekStart, addWeeks(weekStart, 1));
  const out = new Set<string>();
  for (const [userId, weeks] of map) {
    if (weeks.has(weekStart.getTime())) out.add(userId);
  }
  return out;
}
