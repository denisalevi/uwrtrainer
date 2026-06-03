import { getServerT } from "@/lib/i18n/server";
import type { DictKey } from "@/lib/i18n/dictionaries";
import { Badge, Button, Card, CardBody, Input, Label, SectionTitle } from "@/components/ui";
import { setStrengthWeek, finishStrengthCycle } from "@/app/actions/strength";
import { type StrengthMode } from "@/lib/constants";
import {
  currentWorkout,
  programMovements,
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
                    <p className="font-semibold text-slate-900">{w.movementLabel}</p>
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
                  {currentWorkout(mode, m, state[m] ?? {}, 3).movementLabel}
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
