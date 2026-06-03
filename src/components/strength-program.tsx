import Link from "next/link";
import { getServerT } from "@/lib/i18n/server";
import type { DictKey } from "@/lib/i18n/dictionaries";
import { Badge, Button, Card, CardBody, Input, Label, SectionTitle } from "@/components/ui";
import {
  setStrengthWeek,
  finishStrengthCycle,
  updateStrengthSettings,
  resetStrengthProgram,
} from "@/app/actions/strength";
import { MOVEMENTS } from "@/lib/constants";
import {
  suggestionsForTools,
  waveWeek,
  type ProgramState,
  type DayConfig,
  type WorkoutSuggestion,
} from "@/lib/strength";
import { ProgramForm } from "@/components/program-form";

type Program = {
  id: string;
  trainingMaxPct: number;
  rounding: number;
  movements: string;
  days: string;
  cycle: number;
  week: number;
};

function setSummary(s: WorkoutSuggestion): string {
  const top = s.sets[s.sets.length - 1];
  const reps = `${s.sets.length}×${top.reps}${top.amrap ? "+" : ""}`;
  return top.weight != null ? `${reps} · ${top.weight} kg` : reps;
}

export async function StrengthProgramView({ program }: { program: Program }) {
  const { t } = await getServerT();
  const state: ProgramState = JSON.parse(program.movements);
  const days: DayConfig[] = JSON.parse(program.days || "[]");
  const wave = waveWeek(program.week);

  return (
    <div className="space-y-4">
      {/* Status line */}
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="teal">
          {t("strength.cycle")} {program.cycle}
        </Badge>
        <Badge tone={wave.deload ? "amber" : "slate"}>{t("strength.weekN", { n: program.week })}</Badge>
        {wave.deload ? (
          <span className="text-sm text-amber-700">{t("strength.deload")}</span>
        ) : program.week === 3 ? (
          <span className="text-sm text-teal-700">{t("strength.testWeek")}</span>
        ) : null}
      </div>

      <Link href="/strength/log" className="block">
        <Button className="w-full">➕ {t("strength.logWorkout")}</Button>
      </Link>

      {/* Week selector */}
      <div className="grid grid-cols-4 gap-2">
        {[1, 2, 3, 4].map((w) => (
          <form key={w} action={setStrengthWeek}>
            <input type="hidden" name="programId" value={program.id} />
            <input type="hidden" name="week" value={w} />
            <button
              type="submit"
              className={
                "w-full rounded-xl border px-2 py-2 text-sm font-medium " +
                (program.week === w
                  ? "border-teal-600 bg-teal-50 text-teal-800"
                  : "border-slate-200 bg-white text-slate-600")
              }
            >
              {t("strength.weekN", { n: w })}
            </button>
          </form>
        ))}
      </div>

      {/* Per-day suggestions for the current week */}
      {days.map((day) => {
        const suggestions = suggestionsForTools(day.tools, state, program.week, {
          rounding: program.rounding,
        });
        return (
          <Card key={day.id}>
            <CardBody className="space-y-2">
              <div className="flex items-baseline justify-between">
                <p className="font-semibold text-slate-900">{day.name}</p>
                <span className="text-xs text-slate-500">
                  {day.minutes} {t("common.minutes")}
                </span>
              </div>
              <div className="flex flex-wrap gap-1">
                {day.tools.length === 0 ? (
                  <Badge tone="slate">{t("strength.bodyweightOnly")}</Badge>
                ) : (
                  day.tools.map((tool) => (
                    <Badge key={tool} tone="slate">
                      {t(`tool.${tool}` as DictKey)}
                    </Badge>
                  ))
                )}
              </div>
              <ul className="space-y-1 pt-1">
                {suggestions.map((s) => (
                  <li
                    key={s.id}
                    className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-1.5 text-sm"
                  >
                    <span className="text-slate-800">{t(s.labelKey as DictKey)}</span>
                    <span className="font-medium text-slate-900">{setSummary(s)}</span>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        );
      })}

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
            initialDays={days}
            initialMaxima={state as Record<string, { trainingMax?: number; repMax?: number; levelIndex?: number }>}
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
    "strength.explainTrainingMax",
    "strength.explainAmrap",
    "strength.explainWave",
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
