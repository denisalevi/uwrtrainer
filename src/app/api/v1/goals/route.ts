// GET /api/v1/goals — read-only goal attainment per team member, for machine clients.
//
//   Authorization: Bearer uwr_…   (same feed:read tokens as /api/v1/feed)
//   ?period=week|month[&date=YYYY-MM-DD] | period=season   (the leaderboard's periods; default: this week)
//   ?since=YYYY-MM-DD&until=YYYY-MM-DD          (custom window, max 92 days)
//
// period=week and since/until: weekly goals per Mon–Sun week (members[].weeks), from
// scoreWeeksForUsers — the weekly board's function. period=month|season: the calendar-month view
// without weeks (members[].months, weekly goals converted × days / 7 rounded down, plus monthly
// goals), from scoreMonthsForUsers — the month/season boards' function. Either way `points`
// equals the in-app leaderboard 1:1. Members already see each
// other's plans and adherence in the app; still no ids, emails, plan notes, trainer notes or
// miss reasons.
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { authenticateApiToken } from "@/lib/api-token-store";
import { getSeason } from "@/lib/season-store";
import { RateLimiter, parseBearer } from "@/lib/api-tokens";
import { countPracticesForUsers, getStreak, scoreMonthsForUsers, scoreWeeksForUsers } from "@/lib/stats";
import {
  buildLeaderboards,
  parseGoalsRange,
  sortGoalsMembers,
  toGoalsApiMember,
  toGoalsApiMonthMember,
} from "@/lib/goals-api";

// Heavier than the feed (plans + scoring per member): 10 requests per minute per token.
const limiter = new RateLimiter(10, 60_000);

const NO_STORE = { "Cache-Control": "no-store" };

function error(status: number, message: string, headers: Record<string, string> = {}) {
  return Response.json({ error: message }, { status, headers: { ...NO_STORE, ...headers } });
}

export async function GET(request: NextRequest) {
  const now = new Date();
  const token = await authenticateApiToken(
    parseBearer(request.headers.get("authorization")),
    "feed:read",
    now,
  );
  if (!token) return error(401, "invalid or missing API token", { "WWW-Authenticate": "Bearer" });

  const rl = limiter.check(token.id, now.getTime());
  if (!rl.ok) return error(429, "rate limit exceeded", { "Retry-After": String(rl.retryAfterSec) });

  const p = request.nextUrl.searchParams;
  const range = parseGoalsRange(
    { period: p.get("period"), date: p.get("date"), since: p.get("since"), until: p.get("until") },
    now,
    await getSeason(now),
  );
  if ("error" in range) return error(400, range.error);

  const [team, users] = await Promise.all([
    prisma.team.findUnique({ where: { id: token.teamId }, select: { name: true } }),
    prisma.user.findMany({
      where: { memberships: { some: { teamId: token.teamId } } },
      select: { id: true, name: true },
    }),
  ]);
  const ids = users.map((u) => u.id);
  const monthView = range.period === "month" || range.period === "season";
  const [weeksByUser, monthsByUser, practices, streaks] = await Promise.all([
    monthView ? null : scoreWeeksForUsers(ids, range.start, range.end),
    monthView ? scoreMonthsForUsers(ids, range.start, range.end) : null,
    countPracticesForUsers(ids, range.start, range.end),
    Promise.all(users.map((u) => getStreak(u.id))),
  ]);
  const extra = (id: string, i: number) => ({
    streak: streaks[i],
    rugbyPractices: practices.get(id)?.rugby ?? 0,
    primaryPractices: practices.get(id)?.primary ?? 0,
    tournamentDays: practices.get(id)?.tournamentDays ?? 0,
    otherSessions: practices.get(id)?.otherSessions ?? 0,
    totalSessions: practices.get(id)?.sessions ?? 0,
  });

  const members = monthsByUser
    ? sortGoalsMembers(
        users.map((u, i) => toGoalsApiMonthMember(u.name, monthsByUser.get(u.id) ?? [], extra(u.id, i), now)),
      )
    : sortGoalsMembers(
        users.map((u, i) => toGoalsApiMember(u.name, weeksByUser?.get(u.id) ?? [], extra(u.id, i), now)),
      );

  return Response.json(
    {
      team: team?.name ?? null,
      period: range.period,
      since: range.since,
      until: range.until,
      leaderboards: buildLeaderboards(members),
      members,
    },
    { headers: NO_STORE },
  );
}
