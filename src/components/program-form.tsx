"use client";

import { useState } from "react";
import { useT } from "@/components/i18n-provider";
import type { DictKey } from "@/lib/i18n/dictionaries";
import {
  MOVEMENTS,
  MOVEMENT_LEVELS,
  SESSION_TIME_OPTIONS,
  PROGRAM_EQUIPMENT,
  type MovementKey,
  type ProgramEquipment,
} from "@/lib/constants";
import {
  EXERCISE_CATALOG,
  catalogEntry,
  defaultSlots,
  CUSTOM_EXERCISE_ID,
  type Day,
  type Slot,
  type CatalogEntry,
} from "@/lib/strength";
import { Button, Card, CardBody, Input, Label, Select, SectionTitle, cn } from "@/components/ui";

type Maxima = Record<string, { trainingMax?: number; repMax?: number; levelIndex?: number }>;
type MaxField = { tm: string; reps: string; level: number };

let counter = 0;
const freshId = () => `d${Date.now()}_${counter++}`;

/** Shared days+exercises form used both to set up a program and to edit its settings. */
export function ProgramForm({
  action,
  submitLabelKey,
  programId,
  initialEquipment,
  initialDays,
  initialMaxima = {},
  includePull,
}: {
  action: (formData: FormData) => void | Promise<void>;
  mode?: "create" | "edit";
  submitLabelKey: DictKey;
  programId?: string;
  initialEquipment: ProgramEquipment;
  initialDays: Day[];
  initialMaxima?: Maxima;
  includePull: boolean;
}) {
  const { t } = useT();
  const [equipment, setEquipment] = useState<ProgramEquipment>(initialEquipment);
  const [days, setDays] = useState<Day[]>(
    initialDays.length ? initialDays : [{ id: freshId(), name: "", minutes: 45, slots: defaultSlots(initialEquipment, includePull) }],
  );
  // Per-movement maxima, shared across every slot/day. One value each.
  const [maxima, setMaxima] = useState<Record<string, MaxField>>(() => {
    const out: Record<string, MaxField> = {};
    for (const m of MOVEMENTS) {
      const mx = initialMaxima[m] ?? {};
      out[m] = {
        tm: mx.trainingMax != null ? String(mx.trainingMax) : "",
        reps: mx.repMax != null ? String(mx.repMax) : "",
        level: mx.levelIndex ?? 0,
      };
    }
    return out;
  });
  // Which slot's Modify picker is open: "dayIndex:slotIndex" or null.
  const [editing, setEditing] = useState<string | null>(null);
  const [customDraft, setCustomDraft] = useState("");

  // ── Equipment choice ──
  const chooseEquipment = (eq: ProgramEquipment) => {
    setEquipment(eq);
    // Re-default each day's exercises to the new choice (maxima are kept).
    setDays((ds) => ds.map((d) => ({ ...d, slots: defaultSlots(eq, includePull) })));
    setEditing(null);
  };

  // ── Days ──
  const updateDay = (i: number, patch: Partial<Day>) =>
    setDays((ds) => ds.map((d, j) => (j === i ? { ...d, ...patch } : d)));
  const addDay = () =>
    setDays((ds) => {
      if (ds.length >= 7) return ds;
      const prev = ds[ds.length - 1];
      const slots = prev ? prev.slots.map((s) => ({ ...s })) : defaultSlots(equipment, includePull);
      const minutes = prev ? prev.minutes : 45;
      return [...ds, { id: freshId(), name: "", minutes, slots }];
    });
  const removeDay = (i: number) =>
    setDays((ds) => (ds.length <= 1 ? ds : ds.filter((_, j) => j !== i)));

  // ── Slots ──
  const updateSlot = (di: number, si: number, patch: Partial<Slot>) =>
    setDays((ds) =>
      ds.map((d, j) =>
        j === di ? { ...d, slots: d.slots.map((s, k) => (k === si ? { ...s, ...patch } : s)) } : d,
      ),
    );

  const pickEntry = (di: number, si: number, movement: MovementKey, entry: CatalogEntry) => {
    updateSlot(di, si, { exerciseId: entry.id, mode: entry.mode, tool: entry.tool, custom: undefined });
    // For bodyweight variants, start the rep ladder at the chosen variation.
    if (entry.mode === "BODYWEIGHT") {
      const idx = MOVEMENT_LEVELS[movement].indexOf(entry.labelKey);
      if (idx >= 0) setMaxima((mx) => ({ ...mx, [movement]: { ...mx[movement], level: idx } }));
    }
    setEditing(null);
  };

  const pickCustom = (di: number, si: number, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    updateSlot(di, si, { exerciseId: CUSTOM_EXERCISE_ID, custom: trimmed.slice(0, 60) });
    setEditing(null);
    setCustomDraft("");
  };

  const setMax = (m: string, field: keyof MaxField, val: string | number) =>
    setMaxima((mx) => ({ ...mx, [m]: { ...mx[m], [field]: val } }));

  // ── Submit payload ──
  const daysPayload = JSON.stringify(
    days.map((d, i) => ({
      id: d.id,
      name: d.name.trim() || `${t("strength.session")} ${i + 1}`,
      minutes: d.minutes,
      slots: d.slots,
    })),
  );

  const slotLabel = (slot: Slot): string => {
    if (slot.exerciseId === CUSTOM_EXERCISE_ID) return slot.custom || t("strength.exerciseName");
    const e = catalogEntry(slot.movement, slot.exerciseId);
    return e ? t(e.labelKey as DictKey) : slot.exerciseId;
  };

  return (
    <form action={action} className="space-y-5">
      {programId && <input type="hidden" name="programId" value={programId} />}
      <input type="hidden" name="equipment" value={equipment} />
      <input type="hidden" name="days" value={daysPayload} />
      {/* One hidden maxima input per movement (shared across all slots/days). */}
      {MOVEMENTS.map((m) => (
        <div key={`mx_${m}`}>
          <input type="hidden" name={`tm_${m}`} value={maxima[m]?.tm ?? ""} />
          <input type="hidden" name={`repmax_${m}`} value={maxima[m]?.reps ?? ""} />
          <input type="hidden" name={`level_${m}`} value={maxima[m]?.level ?? 0} />
        </div>
      ))}

      {/* Top-level equipment choice */}
      <div>
        <SectionTitle>{t("strength.eqChoice.title")}</SectionTitle>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {PROGRAM_EQUIPMENT.map((eq) => (
            <button
              type="button"
              key={eq}
              onClick={() => chooseEquipment(eq)}
              className={cn(
                "rounded-xl border px-3 py-3 text-sm font-medium",
                equipment === eq
                  ? "border-teal-600 bg-teal-50 text-teal-800"
                  : "border-slate-200 bg-white text-slate-600",
              )}
            >
              {t(`strength.eqChoice.${eq}` as DictKey)}
            </button>
          ))}
        </div>
        <p className="mt-1 text-xs text-slate-400">
          {equipment === "BODYWEIGHT" ? t("strength.eqChoice.bwNote") : t("strength.eqChoice.resetNote")}
        </p>
      </div>

      {/* Days */}
      <SectionTitle>{t("strength.daysTitle")}</SectionTitle>
      {days.map((d, di) => (
        <Card key={d.id}>
          <CardBody className="space-y-3">
            <div className="flex items-center gap-2">
              <Input
                placeholder={`${t("strength.dayName")} ${di + 1}`}
                value={d.name}
                onChange={(e) => updateDay(di, { name: e.target.value })}
              />
              {days.length > 1 && (
                <Button type="button" variant="ghost" size="sm" onClick={() => removeDay(di)}>
                  ✕
                </Button>
              )}
            </div>

            {/* Exercise slots */}
            <div className="space-y-2">
              {d.slots.map((slot, si) => {
                const key = `${di}:${si}`;
                const isEditing = editing === key;
                const m = slot.movement;
                return (
                  <div key={si} className="rounded-xl border border-slate-200 p-3">
                    <div className="flex items-baseline justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                          {t(`mv.${m}` as DictKey)}
                        </p>
                        <p className="truncate text-sm font-medium text-slate-800">
                          {slotLabel(slot)}{" "}
                          <span className="text-slate-400">({t(`tool.${slot.tool}` as DictKey)})</span>
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditing(isEditing ? null : key);
                          setCustomDraft("");
                        }}
                      >
                        {t("strength.modify")}
                      </Button>
                    </div>

                    {/* Inline maxima for this movement (shared value) */}
                    <div className="mt-2">
                      {slot.mode === "WEIGHTED" ? (
                        <>
                          <Label>{t("strength.slotWeight")}</Label>
                          <Input
                            type="number"
                            min={0}
                            inputMode="decimal"
                            placeholder="kg"
                            value={maxima[m]?.tm ?? ""}
                            onChange={(e) => setMax(m, "tm", e.target.value)}
                          />
                        </>
                      ) : (
                        <>
                          <Label>{t("strength.repMax")}</Label>
                          <Input
                            type="number"
                            min={0}
                            inputMode="numeric"
                            placeholder={t("strength.repMax")}
                            value={maxima[m]?.reps ?? ""}
                            onChange={(e) => setMax(m, "reps", e.target.value)}
                          />
                        </>
                      )}
                    </div>

                    {/* Modify picker */}
                    {isEditing && (
                      <div className="mt-3 space-y-3 border-t border-slate-100 pt-3">
                        <ExerciseGroup
                          title={t("strength.withWeights")}
                          entries={EXERCISE_CATALOG[m].filter((e) => e.mode === "WEIGHTED")}
                          current={slot.exerciseId}
                          onPick={(entry) => pickEntry(di, si, m, entry)}
                          toolLabel={(tool) => t(`tool.${tool}` as DictKey)}
                          labelOf={(e) => t(e.labelKey as DictKey)}
                        />
                        <ExerciseGroup
                          title={t("strength.withoutWeights")}
                          entries={EXERCISE_CATALOG[m].filter((e) => e.mode === "BODYWEIGHT")}
                          current={slot.exerciseId}
                          onPick={(entry) => pickEntry(di, si, m, entry)}
                          toolLabel={(tool) => t(`tool.${tool}` as DictKey)}
                          labelOf={(e) => t(e.labelKey as DictKey)}
                        />
                        <div>
                          <Label>{t("strength.typeOwn")}</Label>
                          <div className="mt-1 flex items-center gap-2">
                            <Input
                              placeholder={t("strength.exerciseName")}
                              value={customDraft}
                              onChange={(e) => setCustomDraft(e.target.value)}
                            />
                            <Button type="button" size="sm" onClick={() => pickCustom(di, si, customDraft)}>
                              {t("common.save")}
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Minutes + extra-volume hint */}
            <div>
              <Label>{t("strength.minutes")}</Label>
              <Select
                value={String(d.minutes)}
                onChange={(e) => updateDay(di, { minutes: Number(e.target.value) })}
              >
                {SESSION_TIME_OPTIONS.map((mm) => (
                  <option key={mm} value={mm}>
                    {mm} {t("common.minutes")}
                  </option>
                ))}
              </Select>
              <p className="mt-1 text-xs text-slate-400">{t("strength.minutesAssistHint")}</p>
            </div>
          </CardBody>
        </Card>
      ))}
      <Button type="button" variant="secondary" onClick={addDay} className="w-full">
        + {t("strength.addDay")}
      </Button>

      <Button type="submit" className="w-full">
        {t(submitLabelKey)}
      </Button>
    </form>
  );
}

function ExerciseGroup({
  title,
  entries,
  current,
  onPick,
  toolLabel,
  labelOf,
}: {
  title: string;
  entries: CatalogEntry[];
  current: string;
  onPick: (e: CatalogEntry) => void;
  toolLabel: (tool: string) => string;
  labelOf: (e: CatalogEntry) => string;
}) {
  if (entries.length === 0) return null;
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{title}</p>
      <div className="mt-1 grid gap-1">
        {entries.map((e) => (
          <button
            type="button"
            key={e.id}
            onClick={() => onPick(e)}
            className={cn(
              "flex items-center justify-between rounded-lg border px-3 py-2 text-left text-sm",
              current === e.id
                ? "border-teal-600 bg-teal-50 text-teal-800"
                : "border-slate-200 bg-white text-slate-700",
            )}
          >
            <span>{labelOf(e)}</span>
            <span className="text-xs text-slate-400">{toolLabel(e.tool)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
