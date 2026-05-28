import Link from "next/link";
import { requireUser } from "@/lib/dal";
import { getServerT } from "@/lib/i18n/server";
import { getCurrentWeekDetail, getStreak } from "@/lib/stats";
import { prisma } from "@/lib/db";
import { Card, CardBody, Button, Badge, ProgressBar, SectionTitle } from "@/components/ui";
import type { DictKey } from "@/lib/i18n/dictionaries";

export default async function DashboardPage() {
  const user = await requireUser();
  const { t } = await getServerT();
  const [detail, streak, recent] = await Promise.all([
    getCurrentWeekDetail(user.id),
    getStreak(user.id),
    prisma.sessionLog.findMany({
      where: { userId: user.id },
      orderBy: { date: "desc" },
      take: 5,
      include: { practiceSlot: { select: { label: true } } },
    }),
  ]);

  const pct = Math.round(detail.score.adherencePct * 100);

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-500">{t("dash.hello", { name: user.name })}</p>
          <h1 className="text-2xl font-bold text-slate-900">{t("dash.title")}</h1>
        </div>
        {streak > 0 && <Badge tone="amber">🔥 {t("dash.streakWeeks", { n: streak })}</Badge>}
      </header>

      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardBody>
            <p className="text-xs text-slate-500">{t("dash.weeklyPoints")}</p>
            <p className="mt-1 text-3xl font-bold text-teal-700">{detail.score.points}</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-xs text-slate-500">{t("dash.adherence")}</p>
            <p className="mt-1 text-3xl font-bold text-slate-900">{detail.score.hasPlan ? `${pct}%` : "—"}</p>
          </CardBody>
        </Card>
      </div>

      {detail.score.hasPlan ? (
        <section className="space-y-2">
          <SectionTitle>{t("dash.title")}</SectionTitle>
          <Card>
            <CardBody className="space-y-4">
              {detail.items.map((item, i) => (
                <div key={i}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="font-medium text-slate-800">
                      {item.label ?? t(`cat.${item.category}` as DictKey)}
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
        <SectionTitle>{t("dash.recentLogs")}</SectionTitle>
        {recent.length === 0 ? (
          <p className="text-sm text-slate-500">{t("dash.nothingLogged")}</p>
        ) : (
          <Card>
            <ul className="divide-y divide-slate-100">
              {recent.map((log) => (
                <li key={log.id} className="flex items-center justify-between px-4 py-3 text-sm">
                  <div>
                    <span className="font-medium text-slate-800">
                      {log.practiceSlot?.label ?? t(`cat.${log.category}` as DictKey)}
                    </span>
                    <span className="ml-2 text-slate-400">
                      {log.date.toLocaleDateString()}
                    </span>
                  </div>
                  <Badge tone={log.status === "DONE" ? "green" : "red"}>
                    {t(log.status === "DONE" ? "log.done" : "log.missed")}
                  </Badge>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>
    </div>
  );
}
