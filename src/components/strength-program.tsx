import Link from "next/link";
import { getServerT } from "@/lib/i18n/server";
import type { DictKey } from "@/lib/i18n/dictionaries";
import { Badge, Button, Card, CardBody, SectionTitle } from "@/components/ui";
import {
  deloadMovement,
  setMovementWeek,
  updateStrengthSettings,
  resetStrengthProgram,
} from "@/app/actions/strength";
import { PROGRAM_EQUIPMENT, WEIGHTED_LAYOUTS, type ProgramEquipment, type WeightedLayout, type PullPrefs } from "@/lib/constants";
import {
  buildSchedule,
  CUSTOM_EXERCISE_ID,
  programCycleWeeks,
  rotationWaveWeek,
  waveWeek,
  effectiveWeek,
  effectiveCycle,
  isStale,
  programSlotMovements,
  type ProgramState,
  type DayPlan,
  type PlannedExercise,
  type WorkoutSet,
} from "@/lib/strength";
import type { RoundingPref } from "@/lib/strength";
import { ProgramForm } from "@/components/program-form";

type Program = {
  id: string;
  equipment: string;
  weightedLayout: string;
  notes: string | null;
  trainingMaxPct: number;
  rounding: number;
  movements: string;
  days: string;
  cycle: number;
  week: number;
};

function setLine(set: WorkoutSet): string {
  const pct = set.pct != null ? `${Math.round(set.pct * 100)}%` : "";
  const reps = `${set.reps}${set.amrap ? "+" : ""}`;
  const head = pct ? `${pct} · ${reps}` : reps;
  return set.weight != null ? `${head} (${set.weight} kg)` : head;
}

export async function StrengthProgramView({
  program,
  pulls,
  rounding,
}: {
  program: Program;
  pulls: PullPrefs;
  rounding?: RoundingPref;
}) {
  const { t } = await getServerT();
  const state: ProgramState = JSON.parse(program.movements);
  const days: DayPlan[] = JSON.parse(program.days || "[]");
  const equipment: ProgramEquipment = (PROGRAM_EQUIPMENT as readonly string[]).includes(program.equipment)
    ? (program.equipment as ProgramEquipment)
    : "WEIGHTS";
  const layout: WeightedLayout = (WEIGHTED_LAYOUTS as readonly string[]).includes(program.weightedLayout)
    ? (program.weightedLayout as WeightedLayout)
    : "ROTATE";
  // Fallback wave position for a lift that hasn't advanced on its own yet: a single rotating
  // weighted day walks the rotation's wave; every other layout uses the raw program week. Once a
  // lift is logged it carries its OWN per-movement week and this fallback no longer applies to it.
  const rotating = programCycleWeeks(days, layout) === 8;
  const fallbackWeek = rotating ? rotationWaveWeek(program.week) : program.week;
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const schedule = buildSchedule(days, state, { pulls, layout, week: program.week, rounding });
  const exLabel = (e: PlannedExercise): string =>
    e.exerciseId === CUSTOM_EXERCISE_ID ? e.custom || t("strength.exerciseName") : t(e.labelKey as DictKey);
  // Lifts this program trains, in order (cores, then the user's enabled pulls).
  const lifts = programSlotMovements(pulls);

  return (
    <div className="space-y-4">
      <Link href="/strength/log" className="block">
        <Button className="w-full">➕ {t("strength.logWorkout")}</Button>
      </Link>

      {/* Per-lift progression — each lift on its own cycle/week, advanced automatically on log. */}
      <div className="space-y-2">
        <SectionTitle>{t("strength.progressionTitle")}</SectionTitle>
        <p className="text-xs text-slate-500">{t("strength.progressionHint")}</p>
        {lifts.map((m) => {
          const cur = state[m];
          const wk = effectiveWeek(cur, fallbackWeek);
          const cyc = effectiveCycle(cur, program.cycle);
          const wave = waveWeek(wk);
          const tm = cur?.trainingMax;
          const stale = isStale(cur, today);
          return (
            <Card key={m}>
              <CardBody className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900">{t(`mv.${m}` as DictKey)}</p>
                    {tm != null && tm > 0 && (
                      <p className="text-xs text-slate-400 tabular-nums">
                        {t("strength.tmShort")} {tm} kg
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-1.5">
                    <Badge tone="teal">
                      {t("strength.cycle")} {cyc}
                    </Badge>
                    <Badge tone={wave.deload ? "amber" : "slate"}>{t("strength.weekN", { n: wk })}</Badge>
                    {wave.deload ? (
                      <span className="text-xs text-amber-700">{t("strength.deload")}</span>
                    ) : wave.week === 3 ? (
                      <span className="text-xs text-teal-700">{t("strength.testWeek")}</span>
                    ) : null}
                  </div>
                </div>

                {stale && <p className="text-xs text-amber-700">⏳ {t("strength.staleHint")}</p>}

                <div className="flex flex-wrap items-center gap-2">
                  <form action={deloadMovement}>
                    <input type="hidden" name="programId" value={program.id} />
                    <input type="hidden" name="movement" value={m} />
                    <Button type="submit" variant="secondary" size="sm" title={t("strength.deloadNowHint")}>
                      {t("strength.deloadNow")}
                    </Button>
                  </form>
                  <details className="min-w-0">
                    <summary className="cursor-pointer select-none text-xs font-medium text-slate-500">
                      {t("strength.adjustWeek")}
                    </summary>
                    <div className="mt-2 space-y-1.5">
                      <p className="text-xs text-amber-700">⚠ {t("strength.adjustWarn")}</p>
                      <form action={setMovementWeek} className="flex gap-1.5">
                        <input type="hidden" name="programId" value={program.id} />
                        <input type="hidden" name="movement" value={m} />
                        {[1, 2, 3, 4].map((w) => (
                          <Button
                            key={w}
                            type="submit"
                            name="week"
                            value={w}
                            size="sm"
                            variant={w === wk ? "primary" : "secondary"}
                            className="w-11 px-0"
                          >
                            {w}
                          </Button>
                        ))}
                      </form>
                    </div>
                  </details>
                </div>
              </CardBody>
            </Card>
          );
        })}
      </div>

      {/* Per-day exercises — each lift shown at its OWN current week (auto-laid-out) */}
      {schedule.map((day) => (
        <Card key={day.id}>
          <CardBody className="space-y-2">
            <div className="flex items-baseline justify-between">
              <p className="font-semibold text-slate-900">
                {day.name}{" "}
                <span className="text-xs font-normal text-slate-400">
                  ({t(`strength.eqChoice.${day.equipment}` as DictKey)}
                  {day.rotation ? ` · ${t("strength.rotationWeek")} ${day.rotation}` : ""})
                </span>
              </p>
              <span className="text-xs text-slate-500">
                {day.minutes} {t("common.minutes")}
              </span>
            </div>
            <ul className="space-y-1 pt-1">
              {day.exercises.map((e, i) => (
                <li
                  key={i}
                  className="rounded-lg bg-slate-50 px-3 py-1.5 text-sm"
                >
                  <span className="block min-w-0 truncate text-slate-800">
                    {exLabel(e)} <span className="text-slate-400">({t(`tool.${e.tool}` as DictKey)})</span>
                    {e.mode === "WEIGHTED" && state[e.movement]?.trainingMax != null && (
                      <span className="ml-1 text-xs text-slate-400 tabular-nums">
                        · {t("strength.tmShort")} {state[e.movement]!.trainingMax} kg
                      </span>
                    )}
                  </span>
                  <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 font-medium text-slate-900">
                    {e.sets.map((s, j) => (
                      <span key={j} className="tabular-nums">
                        {setLine(s)}
                      </span>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      ))}

      {program.notes && (
        <Card>
          <CardBody>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t("strength.notesLabel")}</p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{program.notes}</p>
          </CardBody>
        </Card>
      )}

      {/* Settings */}
      <details className="rounded-2xl border border-slate-200 bg-white p-4">
        <summary className="cursor-pointer text-sm font-semibold text-slate-700">
          ⚙️ {t("strength.programSettings")}
        </summary>
        <p className="mt-2 text-xs text-slate-500">{t("strength.settingsHint")}</p>
        <div className="mt-3">
          <ProgramForm
            action={updateStrengthSettings}
            mode="edit"
            submitLabelKey="strength.updateSettings"
            programId={program.id}
            initialEquipment={equipment}
            initialDays={days}
            initialMaxima={state}
            initialLayout={layout}
            initialNotes={program.notes ?? ""}
            pulls={pulls}
            tmPct={program.trainingMaxPct}
            rounding={program.rounding}
          />
        </div>
        <form action={resetStrengthProgram} className="mt-3 border-t border-slate-100 pt-3">
          <input type="hidden" name="programId" value={program.id} />
          <Button type="submit" variant="danger" className="w-full">
            {t("strength.reset")}
          </Button>
          <p className="mt-1 text-xs text-slate-400">{t("strength.resetHint")}</p>
        </form>
      </details>

      <ExplainPanel />
    </div>
  );
}

export async function ExplainPanel() {
  const { t } = await getServerT();
  const items: DictKey[] = [
    "strength.explain1rm",
    "strength.explainTmAcronym",
    "strength.explainTrainingMax",
    "strength.explainEstimate",
    "strength.explainAmrap",
    "strength.explainWave",
    "strength.explainAssistance",
    "strength.explainAdjust",
    "strength.explainStart",
    "strength.explainSessions",
  ];
  return (
    <details className="rounded-2xl border border-slate-200 bg-white p-4">
      <summary className="cursor-pointer text-sm font-semibold text-slate-700">
        {t("strength.explainTitle")}
      </summary>
      <ul className="mt-3 space-y-2 text-sm text-slate-600">
        {items.map((k) => (
          <li key={k}>{t(k)}</li>
        ))}
      </ul>
    </details>
  );
}
