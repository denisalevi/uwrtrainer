import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/dal";
import { getServerT } from "@/lib/i18n/server";
import { prisma } from "@/lib/db";
import type { StrengthMode } from "@/lib/constants";
import {
  currentWorkout,
  programMovements,
  incrementFor,
  pickTemplate,
  type ProgramState,
} from "@/lib/strength";
import { StrengthWorkoutLogger, type LoggerSession } from "@/components/strength-workout-logger";

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += Math.max(1, size)) out.push(arr.slice(i, i + size));
  return out;
}

export default async function StrengthLogPage() {
  const user = await requireUser();
  const { t } = await getServerT();

  const program = await prisma.strengthProgram.findFirst({
    where: { userId: user.id, active: true },
    orderBy: { createdAt: "desc" },
  });
  if (!program) redirect("/strength");

  const mode = program.mode as StrengthMode;
  const state: ProgramState = JSON.parse(program.movements);
  const template = pickTemplate(program.daysPerWeek, program.minutesPerSession);
  const movements = programMovements(mode);

  const sessions: LoggerSession[] = chunk(movements, template.movementsPerSession).map(
    (group, index) => ({
      index,
      movements: group.map((m) => {
        const w = currentWorkout(mode, m, state[m] ?? {}, program.week, {
          increment: incrementFor(m),
          withAssistance: template.withAssistance,
        });
        return {
          key: m,
          label: w.movementLabel,
          sets: w.sets.map((s) => ({
            targetReps: s.reps,
            targetWeight: s.weight,
            amrap: !!s.amrap,
          })),
        };
      }),
    }),
  );

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
        sessions={sessions}
        resume={resume}
        today={start.toISOString().slice(0, 10)}
      />
    </div>
  );
}
