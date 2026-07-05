import Link from "next/link";
import { requireUser } from "@/lib/dal";
import { getServerT } from "@/lib/i18n/server";
import { prisma } from "@/lib/db";
import type { DictKey } from "@/lib/i18n/dictionaries";
import {
  SETTING_INCLUDE_PULL,
  DEFAULT_INCLUDE_PULL,
  SETTING_WARMUP_SCHEME,
  SETTING_BBB,
  parseWarmupScheme,
  parseBbbConfig,
  WEIGHTED_LAYOUTS,
  type WeightedLayout,
} from "@/lib/constants";
import {
  buildSchedule,
  warmupSets,
  bbbSet,
  incrementFor,
  CUSTOM_EXERCISE_ID,
  type ProgramState,
  type DayPlan,
  type PlannedExercise,
} from "@/lib/strength";
import { StrengthWorkoutLogger, type LoggerDay } from "@/components/strength-workout-logger";

/**
 * Parse a `?date=yyyy-mm-dd` param into local midnight. Returns null when malformed, not a real
 * date, or in the future — callers fall back to today.
 */
function parseDateParam(raw: string | undefined): Date | null {
  if (!raw) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (Number.isNaN(d.getTime())) return null;
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  return d > todayStart ? null : d;
}

export default async function StrengthLogPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; date?: string }>;
}) {
  const { id, date: dateParam } = await searchParams;
  const user = await requireUser();
  const { t } = await getServerT();

  const [program, pullSetting, warmupSetting, bbbSetting] = await Promise.all([
    prisma.strengthProgram.findFirst({
      where: { userId: user.id, active: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.setting.findUnique({ where: { key: SETTING_INCLUDE_PULL } }),
    prisma.setting.findUnique({ where: { key: SETTING_WARMUP_SCHEME } }),
    prisma.setting.findUnique({ where: { key: SETTING_BBB } }),
  ]);
  const includePull = pullSetting ? pullSetting.value !== "false" : DEFAULT_INCLUDE_PULL;
  // Warm-up + BBB are team settings; percentages are stored as whole numbers → convert to
  // the engine's fraction form. Warm-ups are skipped on the deload week (its sets are already light).
  const warmupScheme = parseWarmupScheme(warmupSetting?.value).map((s) => ({
    pct: s.pct / 100,
    reps: s.reps,
  }));
  const bbb = parseBbbConfig(bbbSetting?.value);

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
      suggestions: day.exercises.map((e, i) => {
        const tm = state[e.movement]?.trainingMax ?? 0;
        const weighted = e.mode === "WEIGHTED" && tm > 0;
        const inc = incrementFor(e.movement);
        // Uniform rule: a warm-up step only counts if it's lighter than the exercise's first
        // working set (per exercise — a rotating weighted day may be on a different wave week
        // than the raw program week). Build weeks (first set ≥65%) keep all warm-ups; the
        // deload (first set = 40%) keeps none.
        const firstMainPct = e.sets[0]?.pct ?? 0;
        const warm = weighted ? warmupSets(tm, inc, warmupScheme.filter((s) => s.pct < firstMainPct)) : [];
        const sets = [...warm, ...e.sets].map((x) => ({
          reps: x.reps,
          weight: x.weight ?? null,
          amrap: !!x.amrap,
          kind: x.kind ?? "main",
          pct: x.pct ?? null,
        }));
        return {
          id: `slot-${i}`,
          label: exLabel(e),
          trainingMax: state[e.movement]?.trainingMax,
          sets,
          bbbWeight: weighted ? bbbSet(tm, inc, bbb.pct / 100, bbb.reps).weight ?? null : null,
        };
      }),
    }));
  }

  // Resume: a specific session to edit (?id=), otherwise the target day's in-progress draft.
  // A validated ?date= (e.g. from a missed row's "Log the session") backdates the session so it
  // lands in — and heals — the missed week; invalid/future dates fall back to today.
  const requested = parseDateParam(dateParam);
  const start = requested ?? new Date();
  start.setHours(0, 0, 0, 0);
  const dayEnd = new Date(start);
  dayEnd.setDate(dayEnd.getDate() + 1);
  let resume: { id: string; details: string; durationMin: number | null } | null = null;
  let date = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(
    start.getDate(),
  ).padStart(2, "0")}`;
  if (id) {
    const log = await prisma.sessionLog.findUnique({ where: { id } });
    if (log && log.userId === user.id && log.details?.includes('"strengthWorkout"')) {
      resume = { id: log.id, details: log.details, durationMin: log.durationMin };
      date = log.date.toISOString().slice(0, 10);
    }
  } else {
    const draft = await prisma.sessionLog.findFirst({
      where: { userId: user.id, category: "STRENGTH", date: { gte: start, lt: dayEnd } },
      orderBy: { createdAt: "desc" },
    });
    if (draft && draft.details && draft.details.includes('"strengthWorkout"')) {
      resume = { id: draft.id, details: draft.details, durationMin: draft.durationMin };
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
        bbbReps={bbb.reps}
        restTimer={{
          enabled: user.restTimerEnabled,
          beep: user.restTimerBeep,
          vibrate: user.restTimerVibrate,
          warmupSeconds: user.restWarmupSeconds,
          mainSeconds: user.restMainSeconds,
          bbbSeconds: user.restBbbSeconds,
        }}
        resume={resume}
        today={date}
      />
    </div>
  );
}
