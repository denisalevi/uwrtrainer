import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/dal";
import { getServerT } from "@/lib/i18n/server";
import { prisma } from "@/lib/db";
import type { DictKey } from "@/lib/i18n/dictionaries";
import { suggestionsForTools, type ProgramState, type DayConfig } from "@/lib/strength";
import { StrengthWorkoutLogger, type LoggerDay } from "@/components/strength-workout-logger";

export default async function StrengthLogPage() {
  const user = await requireUser();
  const { t } = await getServerT();

  const program = await prisma.strengthProgram.findFirst({
    where: { userId: user.id, active: true },
    orderBy: { createdAt: "desc" },
  });
  if (!program || !program.days || program.days === "[]") redirect("/strength");

  const state: ProgramState = JSON.parse(program.movements);
  const days: DayConfig[] = JSON.parse(program.days);

  const loggerDays: LoggerDay[] = days.map((day) => ({
    id: day.id,
    name: day.name,
    minutes: day.minutes,
    suggestions: suggestionsForTools(day.tools, state, program.week, {
      rounding: program.rounding,
    }).map((s) => ({
      id: s.id,
      label: t(s.labelKey as DictKey),
      sets: s.sets.map((x) => ({ reps: x.reps, weight: x.weight ?? null, amrap: !!x.amrap })),
    })),
  }));

  // Resume today's workout draft, if any.
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const todays = await prisma.sessionLog.findFirst({
    where: { userId: user.id, category: "STRENGTH", date: { gte: start } },
    orderBy: { createdAt: "desc" },
  });
  const resume =
    todays && todays.details && todays.details.includes('"strengthWorkout"')
      ? { id: todays.id, details: todays.details, durationMin: todays.durationMin }
      : null;

  return (
    <div className="space-y-4">
      <Link href="/strength" className="text-sm text-slate-500 hover:text-slate-700">
        ← {t("strength.title")}
      </Link>
      <header>
        <h1 className="text-2xl font-bold text-slate-900">{t("strength.logWorkout")}</h1>
        <p className="mt-1 text-sm text-slate-500">{t("strength.logWorkoutHint")}</p>
      </header>
      <StrengthWorkoutLogger
        programId={program.id}
        cycle={program.cycle}
        week={program.week}
        days={loggerDays}
        resume={resume}
        today={start.toISOString().slice(0, 10)}
      />
    </div>
  );
}
