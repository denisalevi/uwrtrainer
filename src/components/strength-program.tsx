import Link from "next/link";
import { getServerT } from "@/lib/i18n/server";
import type { DictKey } from "@/lib/i18n/dictionaries";
import { Badge, Button, Card, CardBody, Input, Label, SectionTitle } from "@/components/ui";
import {
  setStrengthWeek,
  setStrengthCycle,
  finishStrengthCycle,
  updateStrengthSettings,
  resetStrengthProgram,
} from "@/app/actions/strength";
import { MOVEMENTS, PROGRAM_EQUIPMENT, WEIGHTED_LAYOUTS, type ProgramEquipment, type WeightedLayout, type PullPrefs } from "@/lib/constants";
import {
  buildSchedule,
  CUSTOM_EXERCISE_ID,
  programCycleWeeks,
  rotationWaveWeek,
  waveWeek,
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
  previewWeek,
  rounding,
}: {
  program: Program;
  pulls: PullPrefs;
  previewWeek?: number;
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
  // A single rotating weighted day cycles over 8 program weeks (each pair walks its own
  // 4-week wave); everything else over 4. The status badge reflects the WEIGHTED lifts' wave
  // (test/deload), which for a rotating program is the training pair's own wave week.
  const cycleWeeks = programCycleWeeks(days, layout);
  const activeWeek = program.week;
  const viewWeek = previewWeek != null && previewWeek <= cycleWeeks ? previewWeek : activeWeek;
  const wave = waveWeek(cycleWeeks === 8 ? rotationWaveWeek(activeWeek) : activeWeek);
  const schedule = buildSchedule(days, state, { pulls, layout, week: viewWeek, rounding });
  const exLabel = (e: PlannedExercise): string =>
    e.exerciseId === CUSTOM_EXERCISE_ID ? e.custom || t("strength.exerciseName") : t(e.labelKey as DictKey);

  return (
    <div className="space-y-4">
      {/* Status line — always shows the ACTIVE state */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="teal">
            {t("strength.cycle")} {program.cycle}
          </Badge>
          <Badge tone={wave.deload ? "amber" : "slate"}>{t("strength.activeWeek", { n: activeWeek })}</Badge>
          {wave.deload ? (
            <span className="text-sm text-amber-700">{t("strength.deload")}</span>
          ) : wave.week === 3 ? (
            <span className="text-sm text-teal-700">{t("strength.testWeek")}</span>
          ) : null}
          {viewWeek !== activeWeek ? (
            <span className="text-sm font-medium text-slate-500">{t("strength.previewing", { n: viewWeek })}</span>
          ) : null}
        </div>

        {/* Editable cycle number (for a mid-program joiner) */}
        <form action={setStrengthCycle} className="flex items-center gap-2">
          <input type="hidden" name="programId" value={program.id} />
          <Label htmlFor="cycle" className="text-xs text-slate-500">
            {t("strength.cycle")}
          </Label>
          <Input
            id="cycle"
            name="cycle"
            type="number"
            min={1}
            max={99}
            inputMode="numeric"
            defaultValue={program.cycle}
            className="w-20"
          />
          <Button type="submit" variant="secondary" className="px-3 py-1.5 text-sm">
            {t("strength.setCycle")}
          </Button>
        </form>
      </div>

      <Link href="/strength/log" className="block">
        <Button className="w-full">➕ {t("strength.logWorkout")}</Button>
      </Link>

      {/* Week selector — preview-only navigation, does NOT activate */}
      <div className="space-y-2">
        <p className="text-xs text-slate-500">{t("strength.weekPreviewHint")}</p>
        <div className="grid grid-cols-4 gap-2">
          {Array.from({ length: cycleWeeks }, (_, i) => i + 1).map((w) => (
            <Link
              key={w}
              href={`/strength?week=${w}`}
              scroll={false}
              className={
                "block w-full rounded-xl border px-2 py-2 text-center text-sm font-medium " +
                (viewWeek === w
                  ? "border-teal-600 bg-teal-50 text-teal-800"
                  : "border-slate-200 bg-white text-slate-600")
              }
            >
              {t("strength.weekN", { n: w })}
            </Link>
          ))}
        </div>
        {viewWeek !== activeWeek ? (
          <form action={setStrengthWeek}>
            <input type="hidden" name="programId" value={program.id} />
            <input type="hidden" name="week" value={viewWeek} />
            <Button type="submit" className="w-full">
              {t("strength.setActiveWeek", { n: viewWeek })}
            </Button>
          </form>
        ) : null}
      </div>

      {/* Per-day exercises for the current week (auto-laid-out) */}
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

      {/* Finish cycle */}
      <Card>
        <CardBody>
          <SectionTitle>{t("strength.finishCycle")}</SectionTitle>
          <p className="mt-1 text-sm text-slate-500">{t("strength.finishHint")}</p>
          <form action={finishStrengthCycle} className="mt-3 space-y-3">
            <input type="hidden" name="programId" value={program.id} />
            {MOVEMENTS.map((m) => (
              <div key={m} className="flex items-center justify-between gap-3">
                <Label className="flex-1" htmlFor={`amrap_${m}`}>
                  {t(`mv.${m}` as DictKey)}
                </Label>
                <Input
                  id={`amrap_${m}`}
                  name={`amrap_${m}`}
                  type="number"
                  min={0}
                  inputMode="numeric"
                  className="w-24"
                  placeholder={t("strength.amrapSet")}
                />
              </div>
            ))}
            <Button type="submit" className="w-full">
              {t("strength.finishApply")}
            </Button>
          </form>
        </CardBody>
      </Card>

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
