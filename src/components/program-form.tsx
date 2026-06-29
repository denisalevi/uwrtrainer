"use client";

import { useState } from "react";
import { useT } from "@/components/i18n-provider";
import type { DictKey } from "@/lib/i18n/dictionaries";
import {
  MOVEMENTS,
  SESSION_TIME_OPTIONS,
  PROGRAM_EQUIPMENT,
  WEIGHTED_LAYOUTS,
  type MovementKey,
  type ProgramEquipment,
  type SlotMode,
  type WeightedLayout,
} from "@/lib/constants";
import {
  EXERCISE_CATALOG,
  catalogEntry,
  defaultExerciseId,
  programSlotMovements,
  suggestedMinutes,
  buildSchedule,
  estimateOneRepMax,
  trainingMaxFromOneRepMax,
  CUSTOM_EXERCISE_ID,
  type DayPlan,
  type ProgramState,
  type CatalogEntry,
} from "@/lib/strength";
import { Button, Card, CardBody, Input, Label, Select, Textarea, SectionTitle, cn } from "@/components/ui";

type Maxima = Record<string, { trainingMax?: number; repMax?: number; levelIndex?: number; weightedExerciseId?: string; bodyweightExerciseId?: string; weightedCustom?: string; bodyweightCustom?: string }>;
type Mx = { tm: string; reps: string; estWeight: string; estReps: string; wex: string; bex: string; wcustom: string; bcustom: string };

let counter = 0;
const freshId = () => `d${Date.now()}_${counter++}`;

/** Shared setup/settings form: day count + per-day equipment, exercise choices, and a live plan preview. */
export function ProgramForm({
  action,
  submitLabelKey,
  programId,
  initialEquipment,
  initialDays,
  initialMaxima = {},
  initialLayout,
  initialNotes = "",
  includePull,
  tmPct = 0.9,
  rounding = 2.5,
}: {
  action: (formData: FormData) => void | Promise<void>;
  mode?: "create" | "edit";
  submitLabelKey: DictKey;
  programId?: string;
  initialEquipment: ProgramEquipment;
  initialDays: DayPlan[];
  initialMaxima?: Maxima;
  initialLayout: WeightedLayout;
  initialNotes?: string;
  includePull: boolean;
  /** Submaximal buffer + loadable increment used to turn a weight×reps set into a training max — mirrors the server defaults so the live preview matches what gets stored. */
  tmPct?: number;
  rounding?: number;
}) {
  const { t } = useT();
  const movements = programSlotMovements(includePull);

  const [days, setDays] = useState<DayPlan[]>(
    initialDays.length
      ? initialDays
      : [{ id: freshId(), name: "", equipment: initialEquipment, minutes: suggestedMinutes(2) }],
  );
  const [layout, setLayout] = useState<WeightedLayout>(initialLayout);
  const [notes, setNotes] = useState(initialNotes);
  const [maxima, setMaxima] = useState<Record<string, Mx>>(() => {
    const out: Record<string, Mx> = {};
    for (const m of MOVEMENTS) {
      const x = initialMaxima[m] ?? {};
      out[m] = {
        tm: x.trainingMax != null ? String(x.trainingMax) : "",
        reps: x.repMax != null ? String(x.repMax) : "",
        estWeight: "",
        estReps: "",
        wex: x.weightedExerciseId ?? defaultExerciseId(m, "WEIGHTED"),
        bex: x.bodyweightExerciseId ?? defaultExerciseId(m, "BODYWEIGHT"),
        wcustom: x.weightedCustom ?? "",
        bcustom: x.bodyweightCustom ?? "",
      };
    }
    return out;
  });
  const [editing, setEditing] = useState<string | null>(null); // "MOVE:MODE"

  const weightedDays = days.filter((d) => d.equipment === "WEIGHTS").length;
  const anyWeighted = weightedDays > 0;
  const anyBodyweight = days.some((d) => d.equipment === "BODYWEIGHT");

  // ── Days ──
  const setAllEquipment = (eq: ProgramEquipment) =>
    setDays((ds) => ds.map((d) => ({ ...d, equipment: eq, minutes: eq === "WEIGHTS" ? d.minutes : suggestedMinutes(0) })));
  const updateDay = (i: number, patch: Partial<DayPlan>) =>
    setDays((ds) => ds.map((d, j) => (j === i ? { ...d, ...patch } : d)));
  const addDay = () =>
    setDays((ds) => {
      if (ds.length >= 4) return ds;
      const prev = ds[ds.length - 1];
      const equipment = prev?.equipment ?? initialEquipment;
      return [...ds, { id: freshId(), name: "", equipment, minutes: prev?.minutes ?? suggestedMinutes(2) }];
    });
  const removeDay = (i: number) => setDays((ds) => (ds.length <= 1 ? ds : ds.filter((_, j) => j !== i)));

  const setMax = (m: string, patch: Partial<Mx>) =>
    setMaxima((mx) => ({ ...mx, [m]: { ...mx[m], ...patch } }));

  // The training max for a lift: estimated submaximally from a weight×reps set when both are given
  // (the recommended path — mirrors the server's readMaxima precedence), else the directly-typed TM.
  const liveTm = (mx: Mx): number => {
    const w = Number(mx.estWeight);
    const r = Number(mx.estReps);
    if (w > 0 && r > 0) return trainingMaxFromOneRepMax(estimateOneRepMax(w, r), tmPct, rounding);
    return Number(mx.tm) || 0;
  };

  const pickEntry = (m: MovementKey, mode: SlotMode, entry: CatalogEntry) => {
    setMax(m, mode === "WEIGHTED" ? { wex: entry.id } : { bex: entry.id });
    setEditing(null);
  };
  const pickCustom = (m: MovementKey, mode: SlotMode, name: string) => {
    const v = name.trim().slice(0, 60);
    if (!v) return;
    setMax(m, mode === "WEIGHTED" ? { wex: CUSTOM_EXERCISE_ID, wcustom: v } : { bex: CUSTOM_EXERCISE_ID, bcustom: v });
    setEditing(null);
  };

  // The exercise currently chosen for a movement's weighted-day / bodyweight-day slot — its
  // label, the tool it needs, and how it's actually performed (the exercise decides the mode).
  const chosenExercise = (m: MovementKey, slot: SlotMode): { label: string; tool: string; mode: SlotMode } => {
    const mx = maxima[m];
    const id = slot === "WEIGHTED" ? mx.wex : mx.bex;
    if (id === CUSTOM_EXERCISE_ID) {
      const custom = slot === "WEIGHTED" ? mx.wcustom : mx.bcustom;
      return { label: custom || t("strength.exerciseName"), tool: slot === "WEIGHTED" ? "BARBELL" : "BODYWEIGHT", mode: slot };
    }
    const e = catalogEntry(m, id);
    return e ? { label: t(e.labelKey as DictKey), tool: e.tool, mode: e.mode } : { label: id, tool: "BODYWEIGHT", mode: slot };
  };

  // ── Live preview (week 1) ──
  const previewState: ProgramState = {};
  for (const m of MOVEMENTS) {
    previewState[m] = {
      trainingMax: liveTm(maxima[m]),
      repMax: Number(maxima[m].reps) || 5,
      weightedExerciseId: maxima[m].wex,
      bodyweightExerciseId: maxima[m].bex,
      weightedCustom: maxima[m].wcustom,
      bodyweightCustom: maxima[m].bcustom,
    };
  }
  const preview = buildSchedule(days, previewState, { includePull, layout, week: 1 });

  const daysPayload = JSON.stringify(
    days.map((d, i) => ({
      id: d.id,
      name: d.name.trim() || `${t("strength.session")} ${i + 1}`,
      equipment: d.equipment,
      minutes: d.minutes,
    })),
  );

  return (
    <form action={action} className="space-y-5">
      {programId && <input type="hidden" name="programId" value={programId} />}
      <input type="hidden" name="equipment" value={days[0]?.equipment ?? initialEquipment} />
      <input type="hidden" name="weightedLayout" value={layout} />
      <input type="hidden" name="days" value={daysPayload} />
      <input type="hidden" name="notes" value={notes} />
      {MOVEMENTS.map((m) => (
        <div key={`hx_${m}`}>
          <input type="hidden" name={`tm_${m}`} value={maxima[m]?.tm ?? ""} />
          <input type="hidden" name={`weight_${m}`} value={maxima[m]?.estWeight ?? ""} />
          <input type="hidden" name={`reps_${m}`} value={maxima[m]?.estReps ?? ""} />
          <input type="hidden" name={`repmax_${m}`} value={maxima[m]?.reps ?? ""} />
          <input type="hidden" name={`wex_${m}`} value={maxima[m]?.wex ?? ""} />
          <input type="hidden" name={`bex_${m}`} value={maxima[m]?.bex ?? ""} />
          <input type="hidden" name={`wcustom_${m}`} value={maxima[m]?.wcustom ?? ""} />
          <input type="hidden" name={`bcustom_${m}`} value={maxima[m]?.bcustom ?? ""} />
        </div>
      ))}

      {/* Quick equipment default */}
      <div>
        <SectionTitle>{t("strength.eqChoice.title")}</SectionTitle>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {PROGRAM_EQUIPMENT.map((eq) => {
            const active = days.every((d) => d.equipment === eq);
            return (
              <button
                type="button"
                key={eq}
                onClick={() => setAllEquipment(eq)}
                className={cn(
                  "rounded-xl border px-3 py-3 text-sm font-medium",
                  active ? "border-teal-600 bg-teal-50 text-teal-800" : "border-slate-200 bg-white text-slate-600",
                )}
              >
                {t(`strength.eqChoice.${eq}` as DictKey)}
              </button>
            );
          })}
        </div>
        <p className="mt-1 text-xs text-slate-400">{t("strength.eqChoice.perDayNote")}</p>
      </div>

      {/* Days */}
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
            <div className="grid grid-cols-2 gap-2">
              {PROGRAM_EQUIPMENT.map((eq) => (
                <button
                  type="button"
                  key={eq}
                  onClick={() => updateDay(i, { equipment: eq, minutes: eq === "WEIGHTS" ? d.minutes : suggestedMinutes(0) })}
                  className={cn(
                    "rounded-xl border px-3 py-2 text-sm",
                    d.equipment === eq ? "border-teal-600 bg-teal-50 text-teal-800" : "border-slate-200 bg-white text-slate-600",
                  )}
                >
                  {t(`strength.eqChoice.${eq}` as DictKey)}
                </button>
              ))}
            </div>
            <div>
              <Label>{t("strength.minutes")}</Label>
              <Select value={String(d.minutes)} onChange={(e) => updateDay(i, { minutes: Number(e.target.value) })}>
                {SESSION_TIME_OPTIONS.map((mm) => (
                  <option key={mm} value={mm}>
                    {mm} {t("common.minutes")}
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
      <p className="text-xs text-slate-400">{t("strength.minutesAssistHint")}</p>

      {/* Single-weighted-day layout */}
      {weightedDays === 1 && (
        <div>
          <Label>{t("strength.layout.title")}</Label>
          <div className="mt-1 grid grid-cols-1 gap-2">
            {WEIGHTED_LAYOUTS.map((l) => (
              <button
                type="button"
                key={l}
                onClick={() => setLayout(l)}
                className={cn(
                  "rounded-xl border px-3 py-2 text-left text-sm",
                  layout === l ? "border-teal-600 bg-teal-50 text-teal-800" : "border-slate-200 bg-white text-slate-600",
                )}
              >
                <span className="font-medium">{t(`strength.layout.${l}` as DictKey)}</span>
                <span className="block text-xs text-slate-400">{t(`strength.layout.${l}.hint` as DictKey)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Per-movement exercise choices + maxima */}
      <SectionTitle>{t("strength.lifts")}</SectionTitle>
      {anyWeighted && <p className="-mt-1 text-xs text-slate-500">{t("strength.startHintWeighted")}</p>}
      {movements.map((m) => (
        <Card key={m}>
          <CardBody className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t(`mv.${m}` as DictKey)}</p>
            {([anyWeighted ? "WEIGHTED" : null, anyBodyweight ? "BODYWEIGHT" : null].filter(Boolean) as SlotMode[]).map((slot) => {
              const ex = chosenExercise(m, slot);
              const weighted = ex.mode === "WEIGHTED";
              return (
                <MovementRow
                  key={slot}
                  m={m}
                  slot={slot}
                  label={ex.label}
                  tool={ex.tool}
                  showContext={anyWeighted && anyBodyweight}
                  editing={editing}
                  setEditing={setEditing}
                  valueLabel={weighted ? t("strength.estFromSet") : t("strength.repMax")}
                  field={
                    weighted ? (
                      <div className="space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <Label className="text-xs text-slate-500">{t("strength.estWeight")}</Label>
                            <Input type="number" min={0} inputMode="decimal" placeholder="kg" value={maxima[m].estWeight} onChange={(e) => setMax(m, { estWeight: e.target.value })} />
                          </div>
                          <div>
                            <Label className="text-xs text-slate-500">{t("strength.estReps")}</Label>
                            <Input type="number" min={1} inputMode="numeric" placeholder="reps" value={maxima[m].estReps} onChange={(e) => setMax(m, { estReps: e.target.value })} />
                          </div>
                        </div>
                        {Number(maxima[m].estWeight) > 0 && Number(maxima[m].estReps) > 0 && (
                          <p className="text-xs text-slate-500">
                            {t("strength.est1rm")}:{" "}
                            <span className="font-semibold text-slate-600 tabular-nums">
                              {Math.round(estimateOneRepMax(Number(maxima[m].estWeight), Number(maxima[m].estReps)) * 2) / 2} kg
                            </span>{" · "}
                            {t("strength.estTm")}:{" "}
                            <span className="font-semibold text-slate-700 tabular-nums">{liveTm(maxima[m])} kg</span>
                          </p>
                        )}
                        <details className="text-xs">
                          <summary className="cursor-pointer text-slate-400">{t("strength.enterTmDirectly")}</summary>
                          <Input className="mt-1" type="number" min={0} inputMode="decimal" placeholder="kg" value={maxima[m].tm} onChange={(e) => setMax(m, { tm: e.target.value })} />
                        </details>
                      </div>
                    ) : (
                      <Input type="number" min={0} inputMode="numeric" placeholder={t("strength.repMax")} value={maxima[m].reps} onChange={(e) => setMax(m, { reps: e.target.value })} />
                    )
                  }
                  onPick={pickEntry}
                  onCustom={pickCustom}
                  t={t}
                />
              );
            })}
          </CardBody>
        </Card>
      ))}

      {/* Live preview */}
      <SectionTitle>{t("strength.preview")}</SectionTitle>
      <p className="text-xs text-slate-400">{t("strength.previewHint")}</p>
      {preview.map((day) => (
        <Card key={day.id}>
          <CardBody className="space-y-1">
            <div className="flex items-baseline justify-between">
              <p className="font-semibold text-slate-900">
                {day.name.trim() || `${t("strength.session")}`}{" "}
                <span className="text-xs font-normal text-slate-400">
                  ({t(`strength.eqChoice.${day.equipment}` as DictKey)}
                  {day.rotation ? ` · ${t("strength.rotationWeek")} ${day.rotation}` : ""})
                </span>
              </p>
              <span className="text-xs text-slate-500">{day.minutes} {t("common.minutes")}</span>
            </div>
            <ul className="flex flex-wrap gap-1">
              {day.exercises.map((e, j) => (
                <li key={j} className="rounded-lg bg-slate-50 px-2 py-1 text-xs text-slate-700">
                  {e.exerciseId === CUSTOM_EXERCISE_ID ? e.custom : t(e.labelKey as DictKey)}{" "}
                  <span className="text-slate-400">({t(`tool.${e.tool}` as DictKey)})</span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      ))}

      {/* Notes for trainers */}
      <div>
        <Label htmlFor="planNotes">{t("strength.notesLabel")}</Label>
        <Textarea
          id="planNotes"
          rows={3}
          placeholder={t("strength.notesPlaceholder")}
          value={notes}
          onChange={(e) => setNotes(e.target.value.slice(0, 1000))}
        />
      </div>

      <Button type="submit" className="w-full">
        {t(submitLabelKey)}
      </Button>
    </form>
  );
}

function MovementRow({
  m,
  slot,
  label,
  tool,
  showContext,
  valueLabel,
  field,
  editing,
  setEditing,
  onPick,
  onCustom,
  t,
}: {
  m: MovementKey;
  slot: SlotMode; // which stored choice this row edits (weighted-day vs bodyweight-day)
  label: string;
  tool: string;
  showContext: boolean;
  valueLabel: string;
  field: React.ReactNode;
  editing: string | null;
  setEditing: (v: string | null) => void;
  onPick: (m: MovementKey, slot: SlotMode, e: CatalogEntry) => void;
  onCustom: (m: MovementKey, slot: SlotMode, name: string) => void;
  t: (k: DictKey) => string;
}) {
  const key = `${m}:${slot}`;
  const isOpen = editing === key;
  const [draft, setDraft] = useState("");
  const weighted = EXERCISE_CATALOG[m].filter((e) => e.mode === "WEIGHTED");
  const bodyweight = EXERCISE_CATALOG[m].filter((e) => e.mode === "BODYWEIGHT");
  return (
    <div className="rounded-xl border border-slate-200 p-2">
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-sm text-slate-700">
          {showContext && (
            <span className="text-slate-400">
              {slot === "WEIGHTED" ? t("strength.slotWeightedDay") : t("strength.slotBodyweightDay")}:{" "}
            </span>
          )}
          {label} <span className="text-slate-400">({t(`tool.${tool}` as DictKey)})</span>
        </p>
        <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(isOpen ? null : key)}>
          {t("strength.modify")}
        </Button>
      </div>
      <div className="mt-2">
        <Label>{valueLabel}</Label>
        {field}
      </div>
      {isOpen && (
        <div className="mt-2 space-y-3 border-t border-slate-100 pt-2">
          {([["strength.withWeights", weighted], ["strength.withoutWeights", bodyweight]] as const).map(([title, entries]) => (
            <div key={title}>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t(title)}</p>
              <div className="mt-1 grid gap-1">
                {entries.map((e) => (
                  <button
                    type="button"
                    key={e.id}
                    onClick={() => onPick(m, slot, e)}
                    className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-sm text-slate-700"
                  >
                    <span>{t(e.labelKey as DictKey)}</span>
                    <span className="text-xs text-slate-400">{t(`tool.${e.tool}` as DictKey)}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
          <div className="flex items-center gap-2">
            <Input placeholder={t("strength.exerciseName")} value={draft} onChange={(e) => setDraft(e.target.value)} />
            <Button type="button" size="sm" onClick={() => onCustom(m, slot, draft)}>
              {t("common.save")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
