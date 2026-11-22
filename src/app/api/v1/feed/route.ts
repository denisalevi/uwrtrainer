// GET /api/v1/feed — read-only team activity feed for machine clients (e.g. a chat bot).
//
//   Authorization: Bearer uwr_…        (admin-created in Settings → API tokens)
//   ?since=YYYY-MM-DD&until=YYYY-MM-DD (inclusive local days; default: the last 7 days)
//
// The token is bound to one team; the response holds that team's DONE/MISSED sessions in the
// window, with only what teammates already see in the in-app feed. Auto-generated MISSED rows
// are excluded (as in the feed), and so are miss reasons. /api is outside the session proxy
// (src/proxy.ts matcher), so this handler is the only auth check — keep it that way.
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { authenticateApiToken } from "@/lib/api-token-store";
import { RateLimiter, parseBearer, parseFeedRange } from "@/lib/api-tokens";
import { toFeedApiEntry } from "@/lib/feed-api";

// 30 requests per minute per token: plenty for a bot, a brake on a leaked token.
const limiter = new RateLimiter(30, 60_000);

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

  const params = request.nextUrl.searchParams;
  const range = parseFeedRange(params.get("since"), params.get("until"), now);
  if ("error" in range) return error(400, range.error);

  // Like the feed page: nothing dated in the future.
  const tomorrow = new Date(now);
  tomorrow.setHours(0, 0, 0, 0);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const end = range.end < tomorrow ? range.end : tomorrow;

  const [team, rows] = await Promise.all([
    prisma.team.findUnique({ where: { id: token.teamId }, select: { name: true } }),
    prisma.sessionLog.findMany({
      where: {
        date: { gte: range.start, lt: end },
        NOT: { status: "MISSED", auto: true },
        user: { memberships: { some: { teamId: token.teamId } } },
      },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      select: {
        date: true,
        category: true,
        status: true,
        durationMin: true,
        details: true,
        user: { select: { name: true } },
        practiceSlot: { select: { label: true } },
      },
    }),
  ]);

  return Response.json(
    {
      team: team?.name ?? null,
      since: range.since,
      until: range.until,
      count: rows.length,
      entries: rows.map(toFeedApiEntry),
    },
    { headers: NO_STORE },
  );
}
