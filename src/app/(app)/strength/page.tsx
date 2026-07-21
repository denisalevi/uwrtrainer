import Link from "next/link";
import { requireUser } from "@/lib/dal";
import { getServerT } from "@/lib/i18n/server";
import { prisma } from "@/lib/db";
import { isTrainer } from "@/lib/constants";
import { parseRoutineItems, summarizeItem } from "@/lib/routines";
import {
  copyRoutine,
  setRoutineActive,
  setRoutinePublished,
  setStrengthProgramPaused,
} from "@/app/actions/routines";
import { Badge, Button, Card, CardBody, SectionTitle } from "@/components/ui";

/**
 * The strength hub (docs/plans/custom-routines.md): pick between the 5/3/1 Wendler program
 * and your custom routines. This page is where routines are created, edited, activated,
 * duplicated and (for trainers) published — the log picker at /strength/log offers exactly
 * what is ACTIVE here.
 */
export default async function StrengthHubPage() {
  const user = await requireUser();
  const { t } = await getServerT();
  const trainer = isTrainer(user.role);

  const [program, myRoutines, teamRoutines] = await Promise.all([
    prisma.strengthProgram.findFirst({
      where: { userId: user.id, active: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.routine.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" } }),
    user.activeTeamId
      ? prisma.routine.findMany({
          where: { teamId: user.activeTeamId, active: true, NOT: { userId: user.id } },
          orderBy: { createdAt: "asc" },
          include: { user: { select: { name: true } } },
        })
      : Promise.resolve([]),
  ]);
  const hasProgram = !!(program && program.days && program.days !== "[]");

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <Link href="/plan" className="text-sm text-slate-500 hover:text-slate-700">
          ← {t("strength.backToPlan")}
        </Link>
        <Link href="/settings" className="text-sm text-slate-500 hover:text-slate-700">
          ⚙️ {t("nav.settings")}
        </Link>
      </div>
      <header>
        <h1 className="text-2xl font-bold text-slate-900">{t("strength.title")}</h1>
        <p className="mt-1 text-sm text-slate-500">{t("strength.hubIntro")}</p>
      </header>

      <Link href="/strength/log" className="block">
        <Button className="w-full">➕ {t("strength.logWorkout")}</Button>
      </Link>

      {/* ── The 5/3/1 Wendler preset ─────────────────────────────────────── */}
      <section className="space-y-2">
        <SectionTitle>{t("strength.hubPrograms")}</SectionTitle>
        <Card>
          <CardBody className="space-y-2">
            <div className="flex items-start justify-between gap-2">
              <Link href="/strength/program" className="min-w-0 flex-1">
                <p className="font-semibold text-slate-900">🏋️ {t("strength.wendlerTitle")}</p>
                <p className="mt-0.5 text-sm text-slate-500">{t("strength.wendlerBlurb")}</p>
              </Link>
              <span className="flex shrink-0 flex-col items-end gap-1">
                {hasProgram ? (
                  program!.paused ? (
                    <Badge tone="amber">{t("routines.paused")}</Badge>
                  ) : (
                    <Badge tone="green">{t("routines.active")}</Badge>
                  )
                ) : (
                  <Badge tone="slate">{t("strength.wendlerNotSetUp")}</Badge>
                )}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link href="/strength/program">
                <Button type="button" variant="secondary" size="sm">
                  {hasProgram ? t("routines.open") : t("strength.wendlerSetUp")}
                </Button>
              </Link>
              {hasProgram && (
                <form action={setStrengthProgramPaused}>
                  <input type="hidden" name="programId" value={program!.id} />
                  <input type="hidden" name="paused" value={program!.paused ? "false" : "true"} />
                  <Button type="submit" variant="ghost" size="sm">
                    {program!.paused ? `▶ ${t("routines.resume")}` : `⏸ ${t("routines.pause")}`}
                  </Button>
                </form>
              )}
            </div>
            {hasProgram && program!.paused && (
              <p className="text-xs text-amber-700">{t("strength.wendlerPausedHint")}</p>
            )}
          </CardBody>
        </Card>
      </section>

      {/* ── My routines ──────────────────────────────────────────────────── */}
      <section className="space-y-2">
        <SectionTitle>{t("routines.mine")}</SectionTitle>
        {myRoutines.length === 0 && (
          <p className="text-sm text-slate-500">{t("routines.noneYet")}</p>
        )}
        {myRoutines.map((r) => {
          const items = parseRoutineItems(r.exercises);
          return (
            <Card key={r.id} className={r.active ? undefined : "opacity-70"}>
              <CardBody className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <Link href={`/strength/routines/${r.id}`} className="min-w-0 flex-1">
                    <p className="font-semibold text-slate-900">{r.name}</p>
                    <p className="mt-0.5 truncate text-xs text-slate-500">
                      {items.map(summarizeItem).join(" · ") || t("routines.empty")}
                    </p>
                  </Link>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    {r.teamId && <Badge tone="teal">{t("routines.publishedBadge")}</Badge>}
                    {r.active ? (
                      <Badge tone="green">{t("routines.active")}</Badge>
                    ) : (
                      <Badge tone="slate">{t("routines.archived")}</Badge>
                    )}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/strength/routines/${r.id}`}>
                    <Button type="button" variant="secondary" size="sm">
                      ✏️ {t("common.edit")}
                    </Button>
                  </Link>
                  <form action={copyRoutine}>
                    <input type="hidden" name="id" value={r.id} />
                    <Button type="submit" variant="ghost" size="sm">
                      ⧉ {t("routines.duplicate")}
                    </Button>
                  </form>
                  <form action={setRoutineActive}>
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="active" value={r.active ? "false" : "true"} />
                    <Button type="submit" variant="ghost" size="sm">
                      {r.active ? `📦 ${t("routines.archive")}` : `▶ ${t("routines.activate")}`}
                    </Button>
                  </form>
                  {trainer && (
                    <form action={setRoutinePublished}>
                      <input type="hidden" name="id" value={r.id} />
                      <input type="hidden" name="publish" value={r.teamId ? "false" : "true"} />
                      <Button type="submit" variant="ghost" size="sm">
                        {r.teamId ? `🔒 ${t("routines.unpublish")}` : `📣 ${t("routines.publish")}`}
                      </Button>
                    </form>
                  )}
                </div>
              </CardBody>
            </Card>
          );
        })}
        <Link href="/strength/routines/new" className="block">
          <Button type="button" variant="secondary" className="w-full">
            + {t("routines.new")}
          </Button>
        </Link>
        <p className="text-xs text-slate-400">{t("routines.activeHint")}</p>
      </section>

      {/* ── Team routines (published by trainers) ────────────────────────── */}
      {teamRoutines.length > 0 && (
        <section className="space-y-2">
          <SectionTitle>{t("routines.team")}</SectionTitle>
          {teamRoutines.map((r) => {
            const items = parseRoutineItems(r.exercises);
            return (
              <Card key={r.id}>
                <CardBody className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    {/* Name links to the read-only view — inspect before copying. */}
                    <Link href={`/strength/routines/${r.id}/view`} className="min-w-0 flex-1">
                      <p className="font-semibold text-teal-800">{r.name}</p>
                      <p className="mt-0.5 truncate text-xs text-slate-500">
                        {items.map(summarizeItem).join(" · ")}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-400">
                        {t("routines.byAuthor", { name: r.user.name })}
                      </p>
                    </Link>
                  </div>
                  <form action={copyRoutine}>
                    <input type="hidden" name="id" value={r.id} />
                    <Button type="submit" variant="secondary" size="sm">
                      ⧉ {t("routines.copyToMine")}
                    </Button>
                  </form>
                </CardBody>
              </Card>
            );
          })}
        </section>
      )}
    </div>
  );
}
