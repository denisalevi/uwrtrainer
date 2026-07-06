import Link from "next/link";
import { requireUser } from "@/lib/dal";
import { getServerT } from "@/lib/i18n/server";
import { getCurrentWeekDetail, getCurrentWeekMetrics } from "@/lib/stats";
import { prisma } from "@/lib/db";
import { isTrainer, type LeaderboardMetric } from "@/lib/constants";
import { Card, CardBody, Button, Badge, ProgressBar, SectionTitle } from "@/components/ui";
import type { DictKey } from "@/lib/i18n/dictionaries";
import { SessionLogList } from "@/components/session-log-list";

export default async function DashboardPage() {
  const user = await requireUser();
  const { t } = await getServerT();
  const trainer = isTrainer(user.role);
  const [detail, metrics, boards, recent] = await Promise.all([
    getCurrentWeekDetail(user.id),
    getCurrentWeekMetrics(user.id),
    prisma.leaderboard.findMany({ where: { enabled: true }, orderBy: { sortOrder: "asc" } }),
    prisma.sessionLog.findMany({
      where: { userId: user.id },
      orderBy: { date: "desc" },
      include: { practiceSlot: { select: { label: true } } },
    }),
  ]);

  // Only surface a card for boards that are enabled AND visible to this user.
  const visibleBoards = boards.filter((b) => trainer || b.visibility === "EVERYONE");
  const streakBoard = visibleBoards.find((b) => b.metric === "STREAK");
  const streak = metrics.STREAK;

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-500">{t("dash.hello", { name: user.name })}</p>
          <h1 className="text-2xl font-bold text-slate-900">{t("dash.title")}</h1>
        </div>
        {streakBoard && streak > 0 && (
          <Badge tone="amber">🔥 {t("dash.streakWeeks", { n: streak })}</Badge>
        )}
      </header>

      {visibleBoards.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          {visibleBoards.map((b) => (
            <Card key={b.id}>
              <CardBody>
                <p className="text-xs text-slate-500">{t(`lb.metric.${b.metric}` as DictKey)}</p>
                <p className="mt-1 text-3xl font-bold text-teal-700">
                  {metrics[b.metric as LeaderboardMetric] ?? 0}
                </p>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      {detail.score.hasPlan ? (
        <section className="space-y-2">
          <SectionTitle>{t("dash.title")}</SectionTitle>
          <Card>
            <CardBody className="space-y-4">
              {detail.items.filter((item) => item.target > 0).map((item, i) => (
                <div key={i}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="font-medium text-slate-800">
                      {item.label ??
                        (item.category === "OTHER" && item.note
                          ? item.note
                          : t(`cat.${item.category}` as DictKey))}
                      {item.tier && (
                        <span className="ml-2 align-middle">
                          <Badge tone={item.tier === "PRIMARY" ? "teal" : "slate"}>
                            {t(`tier.${item.tier}` as DictKey)}
                          </Badge>
                        </span>
                      )}
                    </span>
                    <span className="text-slate-500">
                      {t("dash.targetProgress", { done: item.done, target: item.target })}
                    </span>
                  </div>
                  <ProgressBar value={item.target ? item.done / item.target : 0} />
                </div>
              ))}
            </CardBody>
          </Card>
        </section>
      ) : (
        <Card>
          <CardBody>
            <p className="font-medium text-slate-800">{t("dash.noPlan")}</p>
            <p className="mt-1 text-sm text-slate-500">{t("dash.askTrainer")}</p>
          </CardBody>
        </Card>
      )}

      <Link href="/log" className="block">
        <Button className="w-full">➕ {t("dash.logSession")}</Button>
      </Link>

      <section className="space-y-2">
        <SectionTitle>{t("dash.allLogs")}</SectionTitle>
        {recent.length === 0 ? (
          <p className="text-sm text-slate-500">{t("dash.nothingLogged")}</p>
        ) : (
          <SessionLogList logs={recent} canGiveReason editable planUserId={user.id} />
        )}
      </section>
    </div>
  );
}
