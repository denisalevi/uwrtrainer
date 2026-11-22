import Link from "next/link";
import { requireUser } from "@/lib/dal";
import { getServerT } from "@/lib/i18n/server";
import { getCurrentMonth, getCurrentWeekDetail, getCurrentWeekMetrics } from "@/lib/stats";
import { prisma } from "@/lib/db";
import { isTrainer, type LeaderboardMetric } from "@/lib/constants";
import { Card, CardBody, Button, Badge, ProgressBar, SectionTitle } from "@/components/ui";
import type { DictKey } from "@/lib/i18n/dictionaries";
import { SessionLogList } from "@/components/session-log-list";

export default async function DashboardPage() {
  const user = await requireUser();
  const { t, locale } = await getServerT();
  const trainer = isTrainer(user.role);
  const [detail, month, metrics, boards, recent] = await Promise.all([
    getCurrentWeekDetail(user.id),
    getCurrentMonth(user.id),
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

      {detail.exempt && (
        <Card>
          <CardBody className="flex items-center gap-2">
            <span className="text-xl">🏆</span>
            <div>
              <p className="text-sm font-medium text-slate-800">{t("dash.tournamentWeek")}</p>
              <p className="text-xs text-slate-500">{t("dash.tournamentWeekHint")}</p>
            </div>
          </CardBody>
        </Card>
      )}

      {detail.score.hasPlan && (
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
      )}

      {month.score.hasPlan && (
        <section className="space-y-2">
          <SectionTitle>
            {t("dash.monthGoals", {
              month: month.monthStart.toLocaleDateString(locale, { month: "long" }),
            })}
          </SectionTitle>
          <Card>
            <CardBody className="space-y-4">
              {month.goals.map((g, i) => (
                <div key={i}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="font-medium text-slate-800">
                      {g.category === "OTHER" && g.label ? g.label : t(`cat.${g.category}` as DictKey)}
                      <span className="ml-2 text-xs font-normal text-slate-400">
                        {g.planned} {t(g.cadence === "MONTH" ? "plan.perMonth" : "plan.perWeek")}
                      </span>
                    </span>
                    <span className="text-slate-500">
                      {t("dash.targetProgress", { done: g.done, target: g.target })}
                    </span>
                  </div>
                  <ProgressBar value={g.done / g.target} />
                </div>
              ))}
              <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
                <span className="min-w-0 text-xs text-slate-500">{t("dash.monthGoalsHint")}</span>
                <span className="shrink-0 whitespace-nowrap text-sm text-slate-500">
                  {month.score.reached} / {month.score.target}
                  <span className="ml-2 font-semibold text-teal-700">
                    {Math.round(month.score.adherencePct * 100)} %
                  </span>
                </span>
              </div>
            </CardBody>
          </Card>
        </section>
      )}

      {!detail.score.hasPlan && !month.score.hasPlan && (
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
