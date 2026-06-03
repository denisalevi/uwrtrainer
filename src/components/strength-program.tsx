import Link from "next/link";
import { getServerT } from "@/lib/i18n/server";
import type { DictKey } from "@/lib/i18n/dictionaries";
import { Badge, Button, Card, CardBody, Input, Label, Select, SectionTitle } from "@/components/ui";
import {
  setStrengthWeek,
  finishStrengthCycle,
  updateStrengthSettings,
  resetStrengthProgram,
} from "@/app/actions/strength";
import {
  EQUIPMENT_LEVELS,
  SESSION_DAY_OPTIONS,
  SESSION_TIME_OPTIONS,
  MOVEMENT_LEVELS,
  type StrengthMode,
} from "@/lib/constants";
import {
  currentWorkout,
  programMovements,
  movementLabel,
  incrementFor,
  pickTemplate,
  waveWeek,
  type ProgramState,
} from "@/lib/strength";

type Program = {
  id: string;
  mode: string;
  equipment: string;
  daysPerWeek: number;
  minutesPerSession: number;
  trainingMaxPct: number;
  rounding: number;
  movements: string;
  cycle: number;
  week: number;
};

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += Math.max(1, size)) out.push(arr.slice(i, i + size));
  return out;
}

export async function StrengthProgramView({ program }: { program: Program }) {
  const { t } = await getServerT();
  const mode = program.mode as StrengthMode;
  const state: ProgramState = JSON.parse(program.movements);
  const template = pickTemplate(program.daysPerWeek, program.minutesPerSession);
  const movements = programMovements(mode);
  const sessions = chunk(movements, template.movementsPerSession);
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
        <span className="ml-auto text-xs text-slate-500">{t(`strength.template.${template.key}` as DictKey)}</span>
      </div>

      {/* Primary CTA: log the whole workout */}
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

      {/* Sessions → movements → sets */}
      {sessions.map((session, si) => (
        <Card key={si}>
          <CardBody className="space-y-4">
            {template.daysPerWeek > 1 && (
              <SectionTitle>
                {t("strength.session")} {si + 1}
              </SectionTitle>
            )}
            {session.map((m) => {
              const w = currentWorkout(mode, m, state[m] ?? {}, program.week, {
                increment: incrementFor(m),
                withAssistance: template.withAssistance,
              });
              return (
                <div key={m} className="space-y-1.5">
                  <div className="flex items-baseline justify-between">
                    <p className="font-semibold text-slate-900">{t(w.movementLabel as DictKey)}</p>
                    <span className="text-xs text-slate-500">
                      {t(`mv.${m}` as DictKey)} · {w.scheme}
                    </span>
                  </div>
                  <ul className="space-y-1">
                    {w.sets.map((s, i) => (
                      <li
                        key={i}
                        className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-1.5 text-sm"
                      >
                        <span className="text-slate-500">
                          {t("strength.set")} {i + 1}
                        </span>
                        <span className="font-medium text-slate-900">
                          {s.weight != null ? `${s.weight} kg × ` : ""}
                          {s.amrap ? `${s.reps}+ (${t("strength.amrapSet")})` : `${s.reps}`}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {w.assistance && (
                    <p className="text-xs text-slate-500">
                      {t("strength.assistance")}: {w.assistance.sets}×{w.assistance.reps}
                      {w.assistance.weight != null ? ` · ${w.assistance.weight} kg` : ""}
                    </p>
                  )}
                </div>
              );
            })}
          </CardBody>
        </Card>
      ))}

      {/* Finish cycle */}
      <Card>
        <CardBody>
          <SectionTitle>{t("strength.finishCycle")}</SectionTitle>
          <p className="mt-1 text-sm text-slate-500">{t("strength.finishHint")}</p>
          <form action={finishStrengthCycle} className="mt-3 space-y-3">
            <input type="hidden" name="programId" value={program.id} />
            {movements.map((m) => (
              <div key={m} className="flex items-center justify-between gap-3">
                <Label className="flex-1" htmlFor={`amrap_${m}`}>
                  {t(currentWorkout(mode, m, state[m] ?? {}, 3).movementLabel as DictKey)}
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

      {/* Program settings */}
      <details className="rounded-2xl border border-slate-200 bg-white p-4">
        <summary className="cursor-pointer text-sm font-semibold text-slate-700">
          ⚙️ {t("strength.programSettings")}
        </summary>
        <form action={updateStrengthSettings} className="mt-3 space-y-3">
          <input type="hidden" name="programId" value={program.id} />
          <p className="text-xs text-slate-500">{t("strength.settingsHint")}</p>
          <div>
            <Label htmlFor="equipment">{t("strength.equipment")}</Label>
            <Select id="equipment" name="equipment" defaultValue={program.equipment}>
              {EQUIPMENT_LEVELS.map((eq) => (
                <option key={eq} value={eq}>
                  {t(`strength.eq.${eq}` as DictKey)}
                </option>
              ))}
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="daysPerWeek">{t("strength.days")}</Label>
              <Select id="daysPerWeek" name="daysPerWeek" defaultValue={String(program.daysPerWeek)}>
                {SESSION_DAY_OPTIONS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="minutesPerSession">{t("strength.minutes")}</Label>
              <Select
                id="minutesPerSession"
                name="minutesPerSession"
                defaultValue={String(program.minutesPerSession)}
              >
                {SESSION_TIME_OPTIONS.map((m) => (
                  <option key={m} value={m}>
                    {m} {t("common.minutes")}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          {/* Per-movement maxima + (weighted) % and rounding */}
          <div className="space-y-3 border-t border-slate-100 pt-3">
            <p className="text-xs font-medium text-slate-600">{t("strength.maxima")}</p>
            {mode === "WEIGHTED" ? (
              <>
                {movements.map((m) => (
                  <div key={m} className="flex items-center justify-between gap-3">
                    <Label className="flex-1" htmlFor={`tm_${m}`}>
                      {t(movementLabel(mode, m) as DictKey)}
                    </Label>
                    <Input
                      id={`tm_${m}`}
                      name={`tm_${m}`}
                      type="number"
                      min={0}
                      inputMode="decimal"
                      className="w-28"
                      defaultValue={state[m]?.trainingMax ?? 0}
                    />
                  </div>
                ))}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="trainingMaxPct">{t("strength.tmPct")}</Label>
                    <Input
                      id="trainingMaxPct"
                      name="trainingMaxPct"
                      type="number"
                      step="0.05"
                      min={0.7}
                      max={1}
                      defaultValue={program.trainingMaxPct}
                    />
                  </div>
                  <div>
                    <Label htmlFor="rounding">{t("strength.rounding")}</Label>
                    <Input
                      id="rounding"
                      name="rounding"
                      type="number"
                      step="0.5"
                      min={0.5}
                      max={5}
                      defaultValue={program.rounding}
                    />
                  </div>
                </div>
              </>
            ) : (
              movements.map((m) => (
                <div key={m} className="space-y-1">
                  <Label>{t(`mv.${m}` as DictKey)}</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {mode === "LEVELS" ? (
                      <Select name={`level_${m}`} defaultValue={String(state[m]?.levelIndex ?? 0)}>
                        {MOVEMENT_LEVELS[m].map((lvl, i) => (
                          <option key={i} value={i}>
                            {t(lvl as DictKey)}
                          </option>
                        ))}
                      </Select>
                    ) : (
                      <div className="flex items-center text-sm text-slate-600">
                        {t(movementLabel(mode, m) as DictKey)}
                      </div>
                    )}
                    <Input
                      name={`repmax_${m}`}
                      type="number"
                      min={0}
                      inputMode="numeric"
                      placeholder={t("strength.repMax")}
                      defaultValue={state[m]?.repMax ?? ""}
                    />
                  </div>
                </div>
              ))
            )}
          </div>

          <Button type="submit" variant="secondary" className="w-full">
            {t("strength.updateSettings")}
          </Button>
        </form>

        {/* Full reset */}
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
