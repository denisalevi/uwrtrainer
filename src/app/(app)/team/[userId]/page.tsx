import Link from "next/link";
import { notFound } from "next/navigation";
import { getServerT } from "@/lib/i18n/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/dal";
import { isTrainer, CATEGORIES } from "@/lib/constants";
import { setRole } from "@/app/actions/trainer";
import { copyRoutine } from "@/app/actions/routines";
import { parseRoutineExercises, summarizeExercise } from "@/lib/routines";
import { SessionLogList } from "@/components/session-log-list";
import type { DictKey } from "@/lib/i18n/dictionaries";
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

  const [player, recent, activePlan, slots, routines] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        availabilityNote: true,
        trainerNote: true,
        memberships: { select: { teamId: true } },
      },
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
    prisma.practiceSlot.findMany({
      where: { active: true, teamId: viewer.activeTeamId ?? "" },
      orderBy: { dayOfWeek: "asc" },
    }),
    // Active routines are visible to teammates (see-it → copy-it, custom-routines.md).
    prisma.routine.findMany({
      where: { userId, active: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  if (!player) notFound();
  // Data isolation: only members sharing a team with the viewer are visible.
  const sharesTeam =
    player.id === viewer.id || player.memberships.some((m) => viewer.teamIds.includes(m.teamId));
  if (!sharesTeam) notFound();

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

      {/* Order: what they're planning (counts → practices → availability) first, then what
          they actually did; admin controls live at the very bottom. */}
      <PlanReadOnly
        t={t}
        slots={slots}
        plan={activePlan}
        availabilityNote={player.availabilityNote}
      />

      {routines.length > 0 && (
        <section className="space-y-2">
          <SectionTitle>{t("routines.memberRoutines")}</SectionTitle>
          <Card>
            <CardBody className="space-y-3">
              {routines.map((r) => {
                const exercises = parseRoutineExercises(r.exercises);
                return (
                  <div key={r.id} className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-800">
                        {r.name}
                        {r.teamId && (
                          <Badge tone="teal" className="ml-2">
                            {t("routines.publishedBadge")}
                          </Badge>
                        )}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-slate-500">
                        {exercises.map((ex) => `${ex.name} ${summarizeExercise(ex)}`).join(" · ")}
                      </p>
                    </div>
                    {viewer.id !== player.id && (
                      <form action={copyRoutine} className="shrink-0">
                        <input type="hidden" name="id" value={r.id} />
                        <Button type="submit" variant="secondary" size="sm">
                          ⧉ {t("routines.copy")}
                        </Button>
                      </form>
                    )}
                  </div>
                );
              })}
            </CardBody>
          </Card>
        </section>
      )}

      <section className="space-y-2">
        <SectionTitle>{t("team.recentLogs")}</SectionTitle>
        {recent.length === 0 ? (
          <p className="text-sm text-slate-500">{t("dash.nothingLogged")}</p>
        ) : (
          <SessionLogList logs={recent} canGiveReason={viewer.id === player.id} planUserId={player.id} />
        )}
      </section>

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

      {viewerIsTrainer && player.role !== "ADMIN" && (
        <form action={setRole}>
          <input type="hidden" name="userId" value={player.id} />
          <input type="hidden" name="role" value={player.role === "PLAYER" ? "TRAINER" : "PLAYER"} />
          <Button type="submit" variant="secondary" size="sm">
            {t(player.role === "PLAYER" ? "team.promote" : "team.demote")}
          </Button>
        </form>
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
      {/* 1. How much they plan per week; 2. which practices they aim for; 3. availability. */}
      <div className="space-y-2">
        <SectionTitle>{t("team.plannedPerWeek")}</SectionTitle>
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
    </section>
  );
}
