import { requireUser } from "@/lib/dal";
import { getServerT } from "@/lib/i18n/server";
import { prisma } from "@/lib/db";
import { LogForm, type StrengthSuggestion } from "@/components/log-form";
import type { DictKey } from "@/lib/i18n/dictionaries";
import type { StrengthMode } from "@/lib/constants";
import {
  currentWorkout,
  programMovements,
  incrementFor,
  movementToLift,
  pickTemplate,
  type ProgramState,
} from "@/lib/strength";

export default async function LogPage() {
  const user = await requireUser();
  const { t } = await getServerT();

  const [slots, program] = await Promise.all([
    prisma.practiceSlot.findMany({
      where: { active: true },
      orderBy: { dayOfWeek: "asc" },
      select: { id: true, label: true, tier: true },
    }),
    prisma.strengthProgram.findFirst({
      where: { userId: user.id, active: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  // Build pre-fill suggestions from this week's working sets (top set per movement).
  let suggestions: StrengthSuggestion[] = [];
  if (program) {
    const mode = program.mode as StrengthMode;
    const state: ProgramState = JSON.parse(program.movements);
    const template = pickTemplate(program.daysPerWeek, program.minutesPerSession);
    suggestions = programMovements(mode).map((m) => {
      const w = currentWorkout(mode, m, state[m] ?? {}, program.week, {
        increment: incrementFor(m),
        withAssistance: template.withAssistance,
      });
      const top = w.sets[w.sets.length - 1];
      return {
        label: t(w.movementLabel as DictKey),
        liftEnum: movementToLift(m),
        sets: w.sets.length,
        reps: top.reps,
        weight: top.weight,
      };
    });
  }

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-slate-900">{t("log.title")}</h1>
      <LogForm slots={slots} suggestions={suggestions} />
    </div>
  );
}
