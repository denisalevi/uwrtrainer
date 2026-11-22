import "server-only";
// DB side of the team season (see season.ts).
import { prisma } from "@/lib/db";
import { SEASON_END_KEY, SEASON_START_KEY, resolveSeason, type Season } from "@/lib/season";

export async function getSeason(now: Date = new Date()): Promise<Season> {
  const rows = await prisma.setting.findMany({
    where: { key: { in: [SEASON_START_KEY, SEASON_END_KEY] } },
  });
  const get = (k: string) => rows.find((r) => r.key === k)?.value ?? null;
  return resolveSeason(get(SEASON_START_KEY), get(SEASON_END_KEY), now);
}
