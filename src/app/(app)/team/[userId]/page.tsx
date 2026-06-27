import Link from "next/link";
import { notFound } from "next/navigation";
import { getServerT } from "@/lib/i18n/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/dal";
import { isTrainer, CATEGORIES } from "@/lib/constants";
import { setRole } from "@/app/actions/trainer";
import { StrengthWorkoutView } from "@/components/strength-workout-view";
import { MissedActions } from "@/components/missed-actions";
import type { DictKey } from "@/lib/i18n/dictionaries";
import { weeklySummaryLabel, missedResolveAction } from "@/lib/missed-label";
import { Card, CardBody, Badge, Button, SectionTitle } from "@/components/ui";

export default async function PlayerDetailPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  const { t } = await getServerT();
  const viewer = await requireUser();
  const viewerIsTrainer = isTrainer(viewer.role);

  const [player, recent, activePlan, slots] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, role: true, availabilityNote: true, trainerNote: true },
    }),
    prisma.sessionLog.findMany({
      where: { userId },
      orderBy: { date: "desc" },
      take: 15,
      include: { practiceSlot: { select: { label: true } } },
    }),
    prisma.plan.findFirst({
      where: { userId, validTo: null },
      orderBy: { validFrom: "desc" },
      include: { items: { include: { practiceSlot: { select: { label: true } } } } },
    }),
    prisma.practiceSlot.findMany({ where: { active: true }, orderBy: { dayOfWeek: "asc" } }),
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

      {viewerIsTrainer && player.role !== "ADMIN" && (
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
              {recent.map((log) => {
                const isStrength = log.category === "STRENGTH" && log.status === "DONE";
                const summaryLabel =
                  log.auto && log.status === "MISSED" && !log.practiceSlotId
                    ? weeklySummaryLabel(t, log.category, log.details)
                    : null;
                const title = summaryLabel ?? log.practiceSlot?.label ?? t(`cat.${log.category}` as DictKey);
                return (
                  <li key={log.id} className="text-sm">
                    <details className="group">
                      <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 active:bg-slate-50">
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-slate-800">{title}</span>
                          <span className="mt-0.5 block text-slate-400">
                            {log.date.toLocaleDateString()}
                            {log.durationMin ? ` · ${log.durationMin} ${t("common.minutes")}` : ""}
                            {log.missReason ? ` · ${log.missReason}` : ""}
                          </span>
                        </span>
                        <span className="flex items-center gap-2">
                          {log.auto && <Badge tone="amber">{t("missed.autoBadge")}</Badge>}
                          <Badge tone={log.status === "DONE" ? "green" : "red"}>
                            {t(log.status === "DONE" ? "log.done" : "log.missed")}
                          </Badge>
                          <span className="text-slate-400 group-open:rotate-90">›</span>
                        </span>
                      </summary>
                      <div className="px-4 pb-3">
                        {isStrength ? (
                          <StrengthWorkoutView details={log.details} />
                        ) : (
                          <dl className="space-y-1 text-slate-600">
                            <div className="flex gap-2">
                              <dt className="text-slate-400">{t("log.chooseCategory")}</dt>
                              <dd>{title}</dd>
                            </div>
                            <div className="flex gap-2">
                              <dt className="text-slate-400">{t("log.date")}</dt>
                              <dd>{log.date.toLocaleDateString()}</dd>
                            </div>
                            <div className="flex gap-2">
                              <dt className="text-slate-400">{t("log.status")}</dt>
                              <dd>{t(log.status === "DONE" ? "log.done" : "log.missed")}</dd>
                            </div>
                            {log.durationMin != null && (
                              <div className="flex gap-2">
                                <dt className="text-slate-400">{t("log.duration")}</dt>
                                <dd>
                                  {log.durationMin} {t("common.minutes")}
                                </dd>
                              </div>
                            )}
                            {log.missReason && (
                              <div className="flex gap-2">
                                <dt className="text-slate-400">{t("log.missReason")}</dt>
                                <dd>{log.missReason}</dd>
                              </div>
                            )}
                          </dl>
                        )}
                        {log.auto && log.status === "MISSED" && (
                          <>
                            <p className="mt-2 text-xs text-amber-700">
                              {t(summaryLabel ? "missed.weeklyHint" : "missed.autoHint")}
                            </p>
                            <MissedActions
                              logId={log.id}
                              resolveHref={missedResolveAction(log).href}
                              resolveLabel={t(missedResolveAction(log).labelKey)}
                              reason={log.missReason}
                              canGiveReason={viewer.id === player.id}
                            />
                          </>
                        )}
                      </div>
                    </details>
                  </li>
                );
              })}
            </ul>
          </Card>
        )}
      </section>

      <PlanReadOnly
        t={t}
        slots={slots}
        plan={activePlan}
        availabilityNote={player.availabilityNote}
      />

      {viewerIsTrainer && player.trainerNote && (
        <section className="space-y-2">
          <SectionTitle>{t("team.trainerNotePrivate")}</SectionTitle>
          <Card>
            <CardBody className="space-y-1">
              <p className="text-xs text-amber-700">{t("team.trainerNotePrivateHint")}</p>
              <p className="whitespace-pre-wrap text-sm text-slate-700">{player.trainerNote}</p>
            </CardBody>
          </Card>
        </section>
      )}
    </div>
  );
}

type PlanWithItems = {
  items: Array<{
    category: string;
    practiceSlotId: string | null;
    targetPerWeek: number;
    note: string | null;
    practiceSlot: { label: string } | null;
  }>;
} | null;

/** Read-only plan/commitment card for non-trainer viewers. */
function PlanReadOnly({
  t,
  slots,
  plan,
  availabilityNote,
}: {
  t: Awaited<ReturnType<typeof getServerT>>["t"];
  slots: Array<{ id: string; label: string; dayOfWeek: number; time: string | null; tier: string }>;
  plan: PlanWithItems;
  availabilityNote: string | null;
}) {
  const items = plan?.items ?? [];
  const committedSlotIds = new Set(
    items.filter((i) => i.practiceSlotId).map((i) => i.practiceSlotId as string),
  );
  const rugbyTarget = items.find((i) => i.category === "RUGBY" && !i.practiceSlotId)?.targetPerWeek ?? 0;
  const catTargets = CATEGORIES.filter((c) => c !== "RUGBY" && c !== "OTHER")
    .map((c) => ({
      c,
      n: items.find((i) => i.category === c && !i.practiceSlotId)?.targetPerWeek ?? 0,
    }))
    .filter((x) => x.n > 0);
  const otherTargets = items
    .filter((i) => i.category === "OTHER" && i.targetPerWeek > 0)
    .map((i) => ({ label: i.note ?? "", n: i.targetPerWeek }))
    .filter((x) => x.label);
  const committedSlots = slots.filter((s) => committedSlotIds.has(s.id));

  return (
    <section className="space-y-4">
      <div className="space-y-2">
        <SectionTitle>{t("plan.availability")}</SectionTitle>
        <Card>
          <CardBody>
            {availabilityNote ? (
              <p className="whitespace-pre-wrap text-sm text-slate-700">{availabilityNote}</p>
            ) : (
              <p className="text-sm text-slate-400">{t("common.none")}</p>
            )}
          </CardBody>
        </Card>
      </div>

      <div className="space-y-2">
        <SectionTitle>{t("plan.committedPractices")}</SectionTitle>
        <Card>
          <CardBody className="space-y-1">
            {committedSlots.length === 0 ? (
              <p className="text-sm text-slate-400">{t("plan.noItems")}</p>
            ) : (
              committedSlots.map((s) => (
                <div key={s.id} className="flex items-center gap-3 py-1.5">
                  <span className="flex-1 text-sm text-slate-800">
                    {s.label}
                    <span className="ml-2 text-slate-400">
                      {t(`day.${s.dayOfWeek}` as DictKey)}
                      {s.time ? ` · ${s.time}` : ""}
                    </span>
                  </span>
                  <Badge tone={s.tier === "PRIMARY" ? "teal" : "slate"}>
                    {t(`tier.${s.tier}` as DictKey)}
                  </Badge>
                </div>
              ))
            )}
          </CardBody>
        </Card>
      </div>

      <div className="space-y-2">
        <SectionTitle>{t("plan.otherCommitments")}</SectionTitle>
        <Card>
          <CardBody className="space-y-1">
            {rugbyTarget === 0 && catTargets.length === 0 && otherTargets.length === 0 ? (
              <p className="text-sm text-slate-400">{t("plan.noItems")}</p>
            ) : (
              <>
                {rugbyTarget > 0 && (
                  <div className="flex items-center justify-between py-1.5">
                    <span className="text-sm text-slate-800">{t("plan.rugbyPerWeek")}</span>
                    <span className="text-sm text-slate-500">
                      {rugbyTarget} {t("plan.perWeek")}
                    </span>
                  </div>
                )}
                {catTargets.map(({ c, n }) => (
                  <div key={c} className="flex items-center justify-between py-1.5">
                    <span className="text-sm text-slate-800">{t(`cat.${c}` as DictKey)}</span>
                    <span className="text-sm text-slate-500">
                      {n} {t("plan.perWeek")}
                    </span>
                  </div>
                ))}
                {otherTargets.map(({ label, n }, i) => (
                  <div key={`other-${i}`} className="flex items-center justify-between py-1.5">
                    <span className="text-sm text-slate-800">{label}</span>
                    <span className="text-sm text-slate-500">
                      {n} {t("plan.perWeek")}
                    </span>
                  </div>
                ))}
              </>
            )}
          </CardBody>
        </Card>
      </div>
    </section>
  );
}
