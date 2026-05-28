import Link from "next/link";
import { notFound } from "next/navigation";
import { getServerT } from "@/lib/i18n/server";
import { prisma } from "@/lib/db";
import { setRole } from "@/app/actions/trainer";
import { PlanEditor } from "@/components/plan-editor";
import type { DictKey } from "@/lib/i18n/dictionaries";
import { Card, Badge, Button, SectionTitle } from "@/components/ui";

export default async function PlayerDetailPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  const { t } = await getServerT();

  const [player, recent] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, email: true, role: true } }),
    prisma.sessionLog.findMany({
      where: { userId },
      orderBy: { date: "desc" },
      take: 8,
      include: { practiceSlot: { select: { label: true } } },
    }),
  ]);
  if (!player) notFound();

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <Link href="/team" className="text-sm text-teal-700">
          ← {t("team.title")}
        </Link>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold text-slate-900">{player.name}</h1>
          {player.role !== "PLAYER" && <Badge tone="teal">{player.role}</Badge>}
        </div>
        <p className="text-sm text-slate-500">{player.email}</p>
      </header>

      {player.role !== "ADMIN" && (
        <form action={setRole}>
          <input type="hidden" name="userId" value={player.id} />
          <input type="hidden" name="role" value={player.role === "PLAYER" ? "TRAINER" : "PLAYER"} />
          <Button type="submit" variant="secondary" size="sm">
            {t(player.role === "PLAYER" ? "team.promote" : "team.demote")}
          </Button>
        </form>
      )}

      <section className="space-y-2">
        <SectionTitle>{t("team.recentLogs")}</SectionTitle>
        {recent.length === 0 ? (
          <p className="text-sm text-slate-500">{t("dash.nothingLogged")}</p>
        ) : (
          <Card>
            <ul className="divide-y divide-slate-100">
              {recent.map((log) => (
                <li key={log.id} className="px-4 py-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-slate-800">
                      {log.practiceSlot?.label ?? t(`cat.${log.category}` as DictKey)}
                    </span>
                    <Badge tone={log.status === "DONE" ? "green" : "red"}>
                      {t(log.status === "DONE" ? "log.done" : "log.missed")}
                    </Badge>
                  </div>
                  <div className="mt-0.5 text-slate-400">
                    {log.date.toLocaleDateString()}
                    {log.missReason ? ` · ${log.missReason}` : ""}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>

      <section className="space-y-2">
        <SectionTitle>{t("team.editPlan")}</SectionTitle>
        <PlanEditor userId={player.id} />
      </section>
    </div>
  );
}
