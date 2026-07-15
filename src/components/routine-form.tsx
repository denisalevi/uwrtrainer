"use client";

// Editor for one custom routine (docs/plans/custom-routines.md): name + ordered exercises,
// each with a measure type (kg×reps / reps / seconds / kg×seconds), optional tempo
// prescription and rest seconds, and target sets. The form serializes its state into a
// hidden `exercises` JSON field for the saveRoutine/deleteRoutine server actions.

import { useState } from "react";
import { useT } from "@/components/i18n-provider";
import { saveRoutine, deleteRoutine } from "@/app/actions/routines";
import { MEASURE_TYPES, type MeasureType } from "@/lib/constants";
import { measureAxes, type RoutineExercise } from "@/lib/routines";
import { Button, Card, CardBody, Input, Label, Select } from "@/components/ui";

type SetDraft = { reps: string; weight: string; seconds: string };
type ExerciseDraft = {
  key: string;
  name: string;
  measure: MeasureType;
  tempo: string;
  restSeconds: string;
  sets: SetDraft[];
};

let uid = 0;
const nextKey = () => `re${Date.now()}_${uid++}`;

const emptySet = (): SetDraft => ({ reps: "", weight: "", seconds: "" });
const emptyExercise = (): ExerciseDraft => ({
  key: nextKey(),
  name: "",
  measure: "KG_REPS",
  tempo: "",
  restSeconds: "",
  sets: [emptySet(), emptySet(), emptySet()],
});

function toDrafts(exercises: RoutineExercise[]): ExerciseDraft[] {
  if (!exercises.length) return [emptyExercise()];
  return exercises.map((ex) => ({
    key: nextKey(),
    name: ex.name,
    measure: ex.measure,
    tempo: ex.tempo ?? "",
    restSeconds: ex.restSeconds != null ? String(ex.restSeconds) : "",
    sets: (ex.sets.length ? ex.sets : [{}]).map((s) => ({
      reps: s.reps != null ? String(s.reps) : "",
      weight: s.weight != null ? String(s.weight) : "",
      seconds: s.seconds != null ? String(s.seconds) : "",
    })),
  }));
}

/** Serialize drafts back into the exercises JSON the server action validates. */
function toPayload(drafts: ExerciseDraft[]): RoutineExercise[] {
  const num = (v: string): number | undefined => {
    const n = Number(v);
    return v.trim() !== "" && Number.isFinite(n) && n >= 0 ? n : undefined;
  };
  return drafts
    .filter((d) => d.name.trim() !== "")
    .map((d) => {
      const axes = measureAxes(d.measure);
      return {
        name: d.name.trim(),
        measure: d.measure,
        ...(d.tempo.trim() ? { tempo: d.tempo.trim() } : {}),
        ...(num(d.restSeconds) ? { restSeconds: Math.round(num(d.restSeconds)!) } : {}),
        sets: d.sets.map((s) => ({
          ...(axes.weight && num(s.weight) != null ? { weight: num(s.weight) } : {}),
          ...(axes.reps && num(s.reps) != null ? { reps: Math.round(num(s.reps)!) } : {}),
          ...(axes.seconds && num(s.seconds) != null ? { seconds: Math.round(num(s.seconds)!) } : {}),
        })),
      };
    });
}

export function RoutineForm({
  id,
  initialName,
  initialExercises,
}: {
  id?: string;
  initialName: string;
  initialExercises: RoutineExercise[];
}) {
  const { t } = useT();
  const [name, setName] = useState(initialName);
  const [exercises, setExercises] = useState<ExerciseDraft[]>(() => toDrafts(initialExercises));

  const payload = toPayload(exercises);
  const valid = name.trim() !== "" && payload.length > 0;

  const mutate = (key: string, fn: (d: ExerciseDraft) => ExerciseDraft) =>
    setExercises((ds) => ds.map((d) => (d.key === key ? fn(d) : d)));
  const move = (key: string, delta: -1 | 1) =>
    setExercises((ds) => {
      const i = ds.findIndex((d) => d.key === key);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= ds.length) return ds;
      const next = [...ds];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  return (
    <form action={saveRoutine} className="space-y-4">
      {id && <input type="hidden" name="id" value={id} />}
      <input type="hidden" name="exercises" value={JSON.stringify(payload)} />

      <div>
        <Label htmlFor="routine-name">{t("routines.name")}</Label>
        <Input
          id="routine-name"
          name="name"
          value={name}
          maxLength={60}
          placeholder={t("routines.namePlaceholder")}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </div>

      {exercises.map((ex, idx) => {
        const axes = measureAxes(ex.measure);
        return (
          <Card key={ex.key}>
            <CardBody className="space-y-3">
              <div className="flex items-center gap-2">
                <Input
                  className="mt-0 flex-1"
                  placeholder={t("strength.exerciseName")}
                  value={ex.name}
                  maxLength={80}
                  onChange={(e) => mutate(ex.key, (d) => ({ ...d, name: e.target.value }))}
                />
                <Button type="button" variant="ghost" size="sm" disabled={idx === 0} onClick={() => move(ex.key, -1)} aria-label={t("routines.moveUp")}>
                  ↑
                </Button>
                <Button type="button" variant="ghost" size="sm" disabled={idx === exercises.length - 1} onClick={() => move(ex.key, 1)} aria-label={t("routines.moveDown")}>
                  ↓
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={t("routines.removeExercise")}
                  onClick={() => {
                    if (!confirm(t("routines.removeExerciseConfirm"))) return;
                    setExercises((ds) => ds.filter((d) => d.key !== ex.key));
                  }}
                >
                  ✕
                </Button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>{t("routines.measure")}</Label>
                  <Select
                    value={ex.measure}
                    onChange={(e) =>
                      mutate(ex.key, (d) => ({ ...d, measure: e.target.value as MeasureType }))
                    }
                  >
                    {MEASURE_TYPES.map((m) => (
                      <option key={m} value={m}>
                        {t(`routines.measure.${m}`)}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label>
                    {t("routines.tempo")}{" "}
                    <span className="font-normal text-slate-400">({t("common.optional")})</span>
                  </Label>
                  <Input
                    placeholder="3-0-3"
                    value={ex.tempo}
                    maxLength={20}
                    onChange={(e) => mutate(ex.key, (d) => ({ ...d, tempo: e.target.value }))}
                  />
                </div>
              </div>

              {/* Target sets — inputs follow the measure's axes. */}
              <div className="space-y-2">
                {ex.sets.map((s, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="w-14 shrink-0 text-xs text-slate-500">
                      {t("strength.set")} {i + 1}
                    </span>
                    {axes.weight && (
                      <Input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step="any"
                        placeholder="kg"
                        className="mt-0 w-20"
                        value={s.weight}
                        onChange={(e) =>
                          mutate(ex.key, (d) => ({
                            ...d,
                            sets: d.sets.map((x, j) => (j === i ? { ...x, weight: e.target.value } : x)),
                          }))
                        }
                      />
                    )}
                    {axes.reps && (
                      <Input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        placeholder={t("strength.reps")}
                        className="mt-0 w-20"
                        value={s.reps}
                        onChange={(e) =>
                          mutate(ex.key, (d) => ({
                            ...d,
                            sets: d.sets.map((x, j) => (j === i ? { ...x, reps: e.target.value } : x)),
                          }))
                        }
                      />
                    )}
                    {axes.seconds && (
                      <Input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        placeholder={t("routines.secondsShort")}
                        className="mt-0 w-20"
                        value={s.seconds}
                        onChange={(e) =>
                          mutate(ex.key, (d) => ({
                            ...d,
                            sets: d.sets.map((x, j) => (j === i ? { ...x, seconds: e.target.value } : x)),
                          }))
                        }
                      />
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label={t("strength.deleteSet")}
                      disabled={ex.sets.length <= 1}
                      onClick={() =>
                        mutate(ex.key, (d) => ({ ...d, sets: d.sets.filter((_, j) => j !== i) }))
                      }
                    >
                      ✕
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    mutate(ex.key, (d) => ({
                      ...d,
                      // A new set starts from the previous one's targets (usual case: same load).
                      sets: [...d.sets, { ...(d.sets[d.sets.length - 1] ?? emptySet()) }],
                    }))
                  }
                >
                  + {t("strength.addSet")}
                </Button>
              </div>

              <div>
                <Label>
                  {t("routines.restSeconds")}{" "}
                  <span className="font-normal text-slate-400">({t("common.optional")})</span>
                </Label>
                <Input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={3600}
                  placeholder="90"
                  className="w-28"
                  value={ex.restSeconds}
                  onChange={(e) => mutate(ex.key, (d) => ({ ...d, restSeconds: e.target.value }))}
                />
              </div>
            </CardBody>
          </Card>
        );
      })}

      <Button
        type="button"
        variant="secondary"
        className="w-full"
        onClick={() => setExercises((ds) => [...ds, emptyExercise()])}
      >
        + {t("strength.addExercise")}
      </Button>

      <Button type="submit" className="w-full" disabled={!valid}>
        {t("common.save")}
      </Button>
      {!valid && <p className="text-xs text-slate-400">{t("routines.validHint")}</p>}
    </form>
  );
}

/** Separate delete form (it can't nest inside the save form). */
export function RoutineDeleteButton({ id }: { id: string }) {
  const { t } = useT();
  return (
    <form
      action={deleteRoutine}
      onSubmit={(e) => {
        if (!confirm(t("routines.deleteConfirm"))) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <Button type="submit" variant="danger" className="w-full">
        {t("routines.delete")}
      </Button>
    </form>
  );
}
