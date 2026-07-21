"use client";

// Editor for one custom routine (docs/plans/custom-routines.md): name + ordered ITEMS —
// exercises with a measure type (kg×reps / reps / seconds / kg×seconds), optional tempo,
// rest seconds and note, plus target sets; references to other own routines (collapsed
// "do that routine here" entries); and named web links (warm-up videos etc.). The form
// serializes its state into a hidden `exercises` JSON field for the saveRoutine action.

import { useState } from "react";
import { useT } from "@/components/i18n-provider";
import { saveRoutine, deleteRoutine } from "@/app/actions/routines";
import { MEASURE_TYPES, type MeasureType } from "@/lib/constants";
import {
  isRoutineLink,
  isRoutineRef,
  isSafeHttpUrl,
  measureAxes,
  type RoutineItem,
} from "@/lib/routines";
import { Button, Card, CardBody, Input, Label, Select } from "@/components/ui";

type SetDraft = { reps: string; weight: string; seconds: string };
type ExerciseDraft = {
  kind: "exercise";
  key: string;
  name: string;
  measure: MeasureType;
  tempo: string;
  restSeconds: string;
  note: string;
  sets: SetDraft[];
};
type RefDraft = { kind: "routine"; key: string; routineId: string; note: string };
type LinkDraft = { kind: "link"; key: string; url: string; label: string; note: string };
type ItemDraft = ExerciseDraft | RefDraft | LinkDraft;

let uid = 0;
const nextKey = () => `re${Date.now()}_${uid++}`;

const emptySet = (): SetDraft => ({ reps: "", weight: "", seconds: "" });
const emptyExercise = (): ExerciseDraft => ({
  kind: "exercise",
  key: nextKey(),
  name: "",
  measure: "KG_REPS",
  tempo: "",
  restSeconds: "",
  note: "",
  sets: [emptySet(), emptySet(), emptySet()],
});

function toDrafts(items: RoutineItem[]): ItemDraft[] {
  if (!items.length) return [emptyExercise()];
  return items.map((item): ItemDraft => {
    if (isRoutineRef(item))
      return { kind: "routine", key: nextKey(), routineId: item.routineId, note: item.note ?? "" };
    if (isRoutineLink(item))
      return { kind: "link", key: nextKey(), url: item.url, label: item.label ?? "", note: item.note ?? "" };
    return {
      kind: "exercise",
      key: nextKey(),
      name: item.name,
      measure: item.measure,
      tempo: item.tempo ?? "",
      restSeconds: item.restSeconds != null ? String(item.restSeconds) : "",
      note: item.note ?? "",
      sets: (item.sets.length ? item.sets : [{}]).map((s) => ({
        reps: s.reps != null ? String(s.reps) : "",
        weight: s.weight != null ? String(s.weight) : "",
        seconds: s.seconds != null ? String(s.seconds) : "",
      })),
    };
  });
}

/** Serialize drafts back into the items JSON the server action validates. Incomplete
 *  drafts (nameless exercise, unpicked routine, empty/unsafe URL) are simply dropped. */
function toPayload(drafts: ItemDraft[]): RoutineItem[] {
  const num = (v: string): number | undefined => {
    const n = Number(v);
    return v.trim() !== "" && Number.isFinite(n) && n >= 0 ? n : undefined;
  };
  return drafts.flatMap((d): RoutineItem[] => {
    if (d.kind === "routine") {
      if (!d.routineId) return [];
      return [
        {
          type: "routine",
          routineId: d.routineId,
          // The server re-snapshots the real name from the DB on save.
          name: "",
          ...(d.note.trim() ? { note: d.note.trim() } : {}),
        },
      ];
    }
    if (d.kind === "link") {
      let url = d.url.trim();
      if (!url) return [];
      if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
      if (!isSafeHttpUrl(url)) return [];
      return [
        {
          type: "link",
          url,
          ...(d.label.trim() ? { label: d.label.trim() } : {}),
          ...(d.note.trim() ? { note: d.note.trim() } : {}),
        },
      ];
    }
    if (d.name.trim() === "") return [];
    const axes = measureAxes(d.measure);
    return [
      {
        name: d.name.trim(),
        measure: d.measure,
        ...(d.tempo.trim() ? { tempo: d.tempo.trim() } : {}),
        ...(num(d.restSeconds) ? { restSeconds: Math.round(num(d.restSeconds)!) } : {}),
        ...(d.note.trim() ? { note: d.note.trim() } : {}),
        sets: d.sets.map((s) => ({
          ...(axes.weight && num(s.weight) != null ? { weight: num(s.weight) } : {}),
          ...(axes.reps && num(s.reps) != null ? { reps: Math.round(num(s.reps)!) } : {}),
          ...(axes.seconds && num(s.seconds) != null ? { seconds: Math.round(num(s.seconds)!) } : {}),
        })),
      },
    ];
  });
}

export function RoutineForm({
  id,
  initialName,
  initialItems,
  routineOptions,
}: {
  id?: string;
  initialName: string;
  initialItems: RoutineItem[];
  /** Own routines pickable as nested entries (the routine being edited is excluded). */
  routineOptions: Array<{ id: string; name: string }>;
}) {
  const { t } = useT();
  const [name, setName] = useState(initialName);
  const [items, setItems] = useState<ItemDraft[]>(() => toDrafts(initialItems));

  const payload = toPayload(items);
  const valid = name.trim() !== "" && payload.length > 0;

  const mutate = <K extends ItemDraft["kind"]>(
    key: string,
    kind: K,
    fn: (d: Extract<ItemDraft, { kind: K }>) => ItemDraft,
  ) =>
    setItems((ds) =>
      ds.map((d) => (d.key === key && d.kind === kind ? fn(d as Extract<ItemDraft, { kind: K }>) : d)),
    );
  const move = (key: string, delta: -1 | 1) =>
    setItems((ds) => {
      const i = ds.findIndex((d) => d.key === key);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= ds.length) return ds;
      const next = [...ds];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  const remove = (key: string, confirmKey?: string) => {
    if (confirmKey && !confirm(confirmKey)) return;
    setItems((ds) => ds.filter((d) => d.key !== key));
  };

  /** Shared ↑ / ↓ / ✕ controls on every item card. */
  const orderButtons = (d: ItemDraft, idx: number, confirmMsg?: string) => (
    <>
      <Button type="button" variant="ghost" size="sm" disabled={idx === 0} onClick={() => move(d.key, -1)} aria-label={t("routines.moveUp")}>
        ↑
      </Button>
      <Button type="button" variant="ghost" size="sm" disabled={idx === items.length - 1} onClick={() => move(d.key, 1)} aria-label={t("routines.moveDown")}>
        ↓
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-label={t("routines.removeExercise")}
        onClick={() => remove(d.key, confirmMsg)}
      >
        ✕
      </Button>
    </>
  );

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

      {items.map((item, idx) => {
        if (item.kind === "routine") {
          return (
            <Card key={item.key}>
              <CardBody className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="flex-1 text-sm font-medium text-slate-700">
                    ↪ {t("routines.badge")}
                  </span>
                  {orderButtons(item, idx)}
                </div>
                <Select
                  value={item.routineId}
                  onChange={(e) => mutate(item.key, "routine", (d) => ({ ...d, routineId: e.target.value }))}
                >
                  <option value="">{t("routines.chooseRoutine")}</option>
                  {routineOptions.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </Select>
                <Input
                  placeholder={`${t("routines.note")} (${t("common.optional")})`}
                  maxLength={500}
                  value={item.note}
                  onChange={(e) => mutate(item.key, "routine", (d) => ({ ...d, note: e.target.value }))}
                />
              </CardBody>
            </Card>
          );
        }
        if (item.kind === "link") {
          return (
            <Card key={item.key}>
              <CardBody className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="flex-1 text-sm font-medium text-slate-700">
                    🔗 {t("routines.linkBadge")}
                  </span>
                  {orderButtons(item, idx)}
                </div>
                <Input
                  placeholder="https://…"
                  inputMode="url"
                  maxLength={500}
                  value={item.url}
                  onChange={(e) => mutate(item.key, "link", (d) => ({ ...d, url: e.target.value }))}
                />
                <Input
                  placeholder={`${t("routines.linkLabel")} (${t("common.optional")})`}
                  maxLength={60}
                  value={item.label}
                  onChange={(e) => mutate(item.key, "link", (d) => ({ ...d, label: e.target.value }))}
                />
                <Input
                  placeholder={`${t("routines.note")} (${t("common.optional")})`}
                  maxLength={500}
                  value={item.note}
                  onChange={(e) => mutate(item.key, "link", (d) => ({ ...d, note: e.target.value }))}
                />
              </CardBody>
            </Card>
          );
        }
        const ex = item;
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
                  onChange={(e) => mutate(ex.key, "exercise", (d) => ({ ...d, name: e.target.value }))}
                />
                {orderButtons(ex, idx, t("routines.removeExerciseConfirm"))}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>{t("routines.measure")}</Label>
                  <Select
                    value={ex.measure}
                    onChange={(e) =>
                      mutate(ex.key, "exercise", (d) => ({ ...d, measure: e.target.value as MeasureType }))
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
                    onChange={(e) => mutate(ex.key, "exercise", (d) => ({ ...d, tempo: e.target.value }))}
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
                          mutate(ex.key, "exercise", (d) => ({
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
                          mutate(ex.key, "exercise", (d) => ({
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
                          mutate(ex.key, "exercise", (d) => ({
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
                        mutate(ex.key, "exercise", (d) => ({ ...d, sets: d.sets.filter((_, j) => j !== i) }))
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
                    mutate(ex.key, "exercise", (d) => ({
                      ...d,
                      // A new set starts from the previous one's targets (usual case: same load).
                      sets: [...d.sets, { ...(d.sets[d.sets.length - 1] ?? emptySet()) }],
                    }))
                  }
                >
                  + {t("strength.addSet")}
                </Button>
              </div>

              <div className="grid grid-cols-2 gap-2">
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
                    onChange={(e) => mutate(ex.key, "exercise", (d) => ({ ...d, restSeconds: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>
                    {t("routines.note")}{" "}
                    <span className="font-normal text-slate-400">({t("common.optional")})</span>
                  </Label>
                  <Input
                    maxLength={500}
                    value={ex.note}
                    onChange={(e) => mutate(ex.key, "exercise", (d) => ({ ...d, note: e.target.value }))}
                  />
                </div>
              </div>
            </CardBody>
          </Card>
        );
      })}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          className="flex-1"
          onClick={() => setItems((ds) => [...ds, emptyExercise()])}
        >
          + {t("strength.addExercise")}
        </Button>
        {routineOptions.length > 0 && (
          <Button
            type="button"
            variant="secondary"
            className="flex-1"
            onClick={() =>
              setItems((ds) => [...ds, { kind: "routine", key: nextKey(), routineId: "", note: "" }])
            }
          >
            + {t("routines.badge")}
          </Button>
        )}
        <Button
          type="button"
          variant="secondary"
          className="flex-1"
          onClick={() =>
            setItems((ds) => [...ds, { kind: "link", key: nextKey(), url: "", label: "", note: "" }])
          }
        >
          + {t("routines.linkBadge")}
        </Button>
      </div>

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
