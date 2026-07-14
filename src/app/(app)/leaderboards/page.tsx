import Link from "next/link";
import { requireUser } from "@/lib/dal";
import { getServerT } from "@/lib/i18n/server";
import { prisma } from "@/lib/db";
import { getLeaderboard } from "@/lib/stats";
import { competitionRanks } from "@/lib/rank";
import { isTrainer, type LeaderboardMetric } from "@/lib/constants";
import type { Period } from "@/lib/dates";
import type { DictKey } from "@/lib/i18n/dictionaries";
import { Card, Badge, SectionTitle, cn } from "@/components/ui";

const PERIODS: Period[] = ["week", "month", "year"];

export default async function LeaderboardsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const user = await requireUser();
  const { t } = await getServerT();
  const trainer = isTrainer(user.role);

  const sp = await searchParams;
  const period: Period = PERIODS.includes(sp.period as Period) ? (sp.period as Period) : "week";

  const boardConfigs = await prisma.leaderboard.findMany({
    where: { enabled: true, ...(trainer ? {} : { visibility: "EVERYONE" }) },
    orderBy: { sortOrder: "asc" },
  });
  const boards = await Promise.all(
    boardConfigs.map(async (board) => ({
      board,
      ranked: (await getLeaderboard(board.metric as LeaderboardMetric, period, user.activeTeamId)).filter(
        (r) => r.value > 0,
      ),
    })),
  );

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-slate-900">{t("lb.title")}</h1>

      <div className="flex gap-1 rounded-xl bg-slate-200 p-1">
        {PERIODS.map((p) => (
          <Link
            key={p}
            href={`/leaderboards?period=${p}`}
            className={cn(
              "flex-1 rounded-lg py-2 text-center text-sm font-medium",
              period === p ? "bg-white text-slate-900 shadow-sm" : "text-slate-600",
            )}
          >
            {t(`common.${p}` as DictKey)}
          </Link>
        ))}
      </div>

      {boards.length === 0 ? (
        <p className="text-sm text-slate-500">{t(trainer ? "lb.noneTrainer" : "lb.none")}</p>
      ) : (
        boards.map(({ board, ranked }) => {
          // Competition ranking: everyone tied on points shares the same rank/medal.
          const ranks = competitionRanks(ranked.map((r) => r.value));
          return (
            <section key={board.id} className="space-y-2">
              <div className="flex items-center justify-between">
                <SectionTitle>{t(`lb.metric.${board.metric}` as DictKey)}</SectionTitle>
                {board.visibility === "TRAINERS_ONLY" && (
                  <Badge tone="amber">{t("lb.hiddenFromPlayers")}</Badge>
                )}
              </div>
              {ranked.length === 0 ? (
                <p className="text-sm text-slate-500">{t("lb.empty")}</p>
              ) : (
                <Card>
                  <ul className="divide-y divide-slate-100">
                    {ranked.map((row, i) => (
                      <li
                        key={row.userId}
                        className={cn(
                          "flex items-center gap-3 px-4 py-3 text-sm",
                          row.userId === user.id && "bg-teal-50",
                        )}
                      >
                        <span className="w-6 text-center font-semibold text-slate-400">
                          {ranks[i] === 1 ? "🥇" : ranks[i] === 2 ? "🥈" : ranks[i] === 3 ? "🥉" : ranks[i]}
                        </span>
                        <span className="flex-1 font-medium text-slate-800">{row.name}</span>
                        <span className="font-bold text-teal-700">
                          {board.metric === "STREAK" ? `🔥 ${row.value}` : row.value}
                        </span>
                      </li>
                    ))}
                  </ul>
                </Card>
              )}
            </section>
          );
        })
      )}
    </div>
  );
}
