import Link from "next/link";
import { requireUser } from "@/lib/dal";
import { getServerT } from "@/lib/i18n/server";
import { prisma } from "@/lib/db";
import type { DictKey } from "@/lib/i18n/dictionaries";
import { SETTING_INCLUDE_PULL, DEFAULT_INCLUDE_PULL, WEIGHTED_LAYOUTS, type WeightedLayout } from "@/lib/constants";
import {
  buildSchedule,
  CUSTOM_EXERCISE_ID,
  type ProgramState,
  type DayPlan,
  type PlannedExercise,
} from "@/lib/strength";
import { StrengthWorkoutLogger, type LoggerDay } from "@/components/strength-workout-logger";

export default async function StrengthLogPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const { id } = await searchParams;
  const user = await requireUser();
  const { t } = await getServerT();

  const [program, pullSetting] = await Promise.all([
    prisma.strengthProgram.findFirst({
      where: { userId: user.id, active: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.setting.findUnique({ where: { key: SETTING_INCLUDE_PULL } }),
  ]);
  const includePull = pullSetting ? pullSetting.value !== "false" : DEFAULT_INCLUDE_PULL;

  // Build the day options to preload from (empty if there's no active program — you can still
  // start a blank session and add exercises by hand).
  let loggerDays: LoggerDay[] = [];
  if (program && program.days && program.days !== "[]") {
    const state: ProgramState = JSON.parse(program.movements);
    const days: DayPlan[] = JSON.parse(program.days);
    const layout: WeightedLayout = (WEIGHTED_LAYOUTS as readonly string[]).includes(program.weightedLayout)
      ? (program.weightedLayout as WeightedLayout)
      : "ROTATE";
    const schedule = buildSchedule(days, state, { includePull, layout, week: program.week });
    const exLabel = (e: PlannedExercise): string =>
      e.exerciseId === CUSTOM_EXERCISE_ID ? e.custom || t("strength.exerciseName") : t(e.labelKey as DictKey);
    loggerDays = schedule.map((day) => ({
      id: day.id,
      name: day.rotation ? `${day.name} (${t("strength.rotationWeek")} ${day.rotation})` : day.name,
      minutes: day.minutes,
      suggestions: day.exercises.map((e, i) => ({
        id: `slot-${i}`,
        label: exLabel(e),
        trainingMax: state[e.movement]?.trainingMax,
        sets: e.sets.map((x) => ({ reps: x.reps, weight: x.weight ?? null, amrap: !!x.amrap })),
      })),
    }));
  }

  // Resume: a specific session to edit (?id=), otherwise today's in-progress draft.
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  let resume: { id: string; details: string; durationMin: number | null } | null = null;
  let date = start.toISOString().slice(0, 10);
  if (id) {
    const log = await prisma.sessionLog.findUnique({ where: { id } });
    if (log && log.userId === user.id && log.details?.includes('"strengthWorkout"')) {
      resume = { id: log.id, details: log.details, durationMin: log.durationMin };
      date = log.date.toISOString().slice(0, 10);
    }
  } else {
    const todays = await prisma.sessionLog.findFirst({
      where: { userId: user.id, category: "STRENGTH", date: { gte: start } },
      orderBy: { createdAt: "desc" },
    });
    if (todays && todays.details && todays.details.includes('"strengthWorkout"')) {
      resume = { id: todays.id, details: todays.details, durationMin: todays.durationMin };
    }
  }

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
        programId={program?.id ?? ""}
        cycle={program?.cycle ?? 0}
        week={program?.week ?? 1}
        days={loggerDays}
        resume={resume}
        today={date}
      />
    </div>
  );
}
