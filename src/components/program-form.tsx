"use client";

import { useState } from "react";
import { useT } from "@/components/i18n-provider";
import type { DictKey } from "@/lib/i18n/dictionaries";
import {
  EQUIPMENT_TOOLS,
  SESSION_TIME_OPTIONS,
  MOVEMENTS,
  MOVEMENT_LEVELS,
} from "@/lib/constants";
import { hasLoadable } from "@/lib/strength";
import { Button, Card, CardBody, Input, Label, Select, SectionTitle, cn } from "@/components/ui";

type Day = { id: string; name: string; tools: string[]; minutes: number };
type Maxima = Record<string, { trainingMax?: number; repMax?: number; levelIndex?: number }>;
let counter = 0;
const newDay = (): Day => ({ id: `d${Date.now()}_${counter++}`, name: "", tools: [], minutes: 45 });

/** Shared days+maxima form used both to set up a program and to edit its settings. */
export function ProgramForm({
  action,
  mode,
  submitLabelKey,
  programId,
  initialDays,
  initialMaxima = {},
}: {
  action: (formData: FormData) => void | Promise<void>;
  mode: "create" | "edit";
  submitLabelKey: DictKey;
  programId?: string;
  initialDays: Day[];
  initialMaxima?: Maxima;
}) {
  const { t } = useT();
  const [days, setDays] = useState<Day[]>(initialDays.length ? initialDays : [newDay()]);
  const anyLoadable = days.some((d) => hasLoadable(d.tools));

  const updateDay = (i: number, patch: Partial<Day>) =>
    setDays((ds) => ds.map((d, j) => (j === i ? { ...d, ...patch } : d)));
  const toggleTool = (i: number, tool: string) =>
    setDays((ds) =>
      ds.map((d, j) =>
        j === i
          ? { ...d, tools: d.tools.includes(tool) ? d.tools.filter((x) => x !== tool) : [...d.tools, tool] }
          : d,
      ),
    );
  const addDay = () => setDays((ds) => (ds.length >= 7 ? ds : [...ds, newDay()]));
  const removeDay = (i: number) => setDays((ds) => (ds.length <= 1 ? ds : ds.filter((_, j) => j !== i)));

  const daysPayload = JSON.stringify(
    days.map((d, i) => ({ ...d, name: d.name.trim() || `${t("strength.session")} ${i + 1}` })),
  );

  return (
    <form action={action} className="space-y-5">
      {programId && <input type="hidden" name="programId" value={programId} />}
      <input type="hidden" name="days" value={daysPayload} />

      <SectionTitle>{t("strength.daysTitle")}</SectionTitle>
      {days.map((d, i) => (
        <Card key={d.id}>
          <CardBody className="space-y-3">
            <div className="flex items-center gap-2">
              <Input
                placeholder={`${t("strength.dayName")} ${i + 1}`}
                value={d.name}
                onChange={(e) => updateDay(i, { name: e.target.value })}
              />
              {days.length > 1 && (
                <Button type="button" variant="ghost" size="sm" onClick={() => removeDay(i)}>
                  ✕
                </Button>
              )}
            </div>
            <div>
              <Label>{t("strength.equipment")}</Label>
              <div className="mt-1 grid grid-cols-2 gap-2">
                {EQUIPMENT_TOOLS.map((tool) => (
                  <button
                    type="button"
                    key={tool}
                    onClick={() => toggleTool(i, tool)}
                    className={cn(
                      "rounded-xl border px-3 py-2 text-sm",
                      d.tools.includes(tool)
                        ? "border-teal-600 bg-teal-50 text-teal-800"
                        : "border-slate-200 bg-white text-slate-600",
                    )}
                  >
                    {t(`tool.${tool}` as DictKey)}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-xs text-slate-400">{t("strength.bodyweightAlways")}</p>
            </div>
            <div>
              <Label>{t("strength.minutes")}</Label>
              <Select
                value={String(d.minutes)}
                onChange={(e) => updateDay(i, { minutes: Number(e.target.value) })}
              >
                {SESSION_TIME_OPTIONS.map((m) => (
                  <option key={m} value={m}>
                    {m} {t("common.minutes")}
                  </option>
                ))}
              </Select>
            </div>
          </CardBody>
        </Card>
      ))}
      <Button type="button" variant="secondary" onClick={addDay} className="w-full">
        + {t("strength.addDay")}
      </Button>

      <SectionTitle>{t("strength.maxima")}</SectionTitle>
      <p className="text-sm text-slate-500">{t("strength.startHintBody")}</p>
      <Card>
        <CardBody className="space-y-3">
          {MOVEMENTS.map((m) => {
            const mx = initialMaxima[m] ?? {};
            return (
              <div key={m} className="space-y-1">
                <Label>{t(`mv.${m}` as DictKey)}</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Select name={`level_${m}`} defaultValue={String(mx.levelIndex ?? 0)}>
                    {MOVEMENT_LEVELS[m].map((lvl, idx) => (
                      <option key={idx} value={idx}>
                        {t(lvl as DictKey)}
                      </option>
                    ))}
                  </Select>
                  <Input
                    name={`repmax_${m}`}
                    type="number"
                    min={0}
                    inputMode="numeric"
                    placeholder={t("strength.repMax")}
                    defaultValue={mx.repMax ?? ""}
                  />
                </div>
                {anyLoadable &&
                  (mode === "edit" ? (
                    <Input
                      name={`tm_${m}`}
                      type="number"
                      min={0}
                      inputMode="decimal"
                      placeholder={`${t(`lift.${m}` as DictKey)}: ${t("strength.tmPct")}`}
                      defaultValue={mx.trainingMax ?? ""}
                    />
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        name={`weight_${m}`}
                        type="number"
                        min={0}
                        inputMode="decimal"
                        placeholder={`${t(`lift.${m}` as DictKey)}: ${t("strength.weight")}`}
                      />
                      <Input name={`reps_${m}`} type="number" min={0} inputMode="numeric" placeholder={t("strength.reps")} />
                    </div>
                  ))}
              </div>
            );
          })}
        </CardBody>
      </Card>

      <Button type="submit" className="w-full">
        {t(submitLabelKey)}
      </Button>
    </form>
  );
}
