"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/components/i18n-provider";
import { saveStrengthWorkout } from "@/app/actions/strength";
import { deleteSession } from "@/app/actions/training";
import { Button, Card, CardBody, Input, Label, Select, cn } from "@/components/ui";

type SetKind = "warmup" | "main" | "bbb";
type SetTarget = { reps: number; weight: number | null; amrap: boolean; kind?: SetKind; pct?: number | null };
type Suggestion = {
  id: string;
  label: string;
  trainingMax?: number;
  sets: SetTarget[];
  /** Pre-filled weight for one "Boring But Big" set on this lift; null on non-weighted lifts. */
  bbbWeight?: number | null;
};
export type LoggerDay = { id: string; name: string; minutes: number; suggestions: Suggestion[] };

type SetVal = { weight: string; reps: string; kind: SetKind };
type Line = {
  key: string;
  exerciseId: string;
  name: string;
  sets: SetVal[];
  done?: boolean;
  trainingMax?: number;
};

let uid = 0;
const nextKey = () => `l${Date.now()}_${uid++}`;

/** A tap-to-done reminder (warm-up / stretching), persisted with the session. */
function ChecklistToggle({
  done,
  icon,
  label,
  onToggle,
}: {
  done: boolean;
  icon: string;
  label: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        "flex w-full items-center justify-between rounded-xl border px-3 py-3 text-sm font-medium",
        done ? "border-teal-600 bg-teal-50 text-teal-800" : "border-rose-200 bg-rose-50 text-rose-700",
      )}
    >
      <span>
        {icon} {label}
      </span>
      <span className={done ? "text-teal-700" : "text-rose-400"}>{done ? "✓" : "○"}</span>
    </button>
  );
}

/** Display/order rank for set kinds; used to keep a line grouped warm-up → working → BBB. */
const KIND_RANK: Record<SetKind, number> = { warmup: 0, main: 1, bbb: 2 };
/** Stable sort by kind (Array.sort is stable in V8), preserving within-group order. */
function sortByKind(sets: SetVal[]): SetVal[] {
  return [...sets].sort((a, b) => KIND_RANK[a.kind] - KIND_RANK[b.kind]);
}

/** Build the editable set rows for a suggestion (weights pre-filled, reps blank, kind carried). */
function seedSets(sug: Suggestion): SetVal[] {
  return sug.sets.map((s) => ({
    weight: s.weight != null ? String(s.weight) : "",
    reps: "",
    kind: s.kind ?? "main",
  }));
}

/** Preselect one editable line per configured exercise on the day. */
function seedLines(day: LoggerDay | undefined): Line[] {
  if (!day) return [];
  return day.suggestions.map((sug) => ({
    key: nextKey(),
    exerciseId: sug.id,
    name: sug.label,
    trainingMax: sug.trainingMax,
    sets: seedSets(sug),
  }));
}

export function StrengthWorkoutLogger({
  programId,
  cycle,
  week,
  days,
  bbbReps,
  resume,
  today,
}: {
  programId: string;
  cycle: number;
  week: number;
  days: LoggerDay[];
  bbbReps: number;
  resume: { id: string; details: string; durationMin: number | null } | null;
  today: string;
}) {
  const { t } = useT();
  const router = useRouter();

  const restored = resume ? safeParse(resume.details) : null;
  const initialDayId =
    (restored?.dayId as string) && days.some((d) => d.id === restored?.dayId)
      ? (restored!.dayId as string)
      : days[0]?.id ?? "";
  const [dayId, setDayId] = useState<string>(initialDayId);
  const [lines, setLines] = useState<Line[]>(
    restored ? restoreLines(restored) : seedLines(days.find((d) => d.id === initialDayId) ?? days[0]),
  );
  const [durationMin, setDurationMin] = useState<string>(
    resume?.durationMin != null ? String(resume.durationMin) : "",
  );
  const [warmup, setWarmup] = useState<boolean>(!!restored?.warmup);
  const [stretch, setStretch] = useState<boolean>(!!restored?.stretch);
  const [logId, setLogId] = useState<string | undefined>(resume?.id);
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const day = days.find((d) => d.id === dayId); // undefined = empty session (add by hand)

  function buildDetails(): string {
    return JSON.stringify({
      kind: "strengthWorkout",
      programId,
      cycle,
      week,
      dayId,
      dayName: day?.name,
      warmup,
      stretch,
      exercises: lines.map((l) => ({
        name: l.name,
        done: !!l.done,
        trainingMax: l.trainingMax,
        sets: l.sets.map((s) => ({
          weight: s.weight ? Number(s.weight) : null,
          reps: s.reps ? Number(s.reps) : null,
          kind: s.kind,
        })),
      })),
    });
  }

  async function save() {
    setStatus("saving");
    try {
      const res = await saveStrengthWorkout({
        logId,
        date: today,
        durationMin: durationMin ? Number(durationMin) : undefined,
        details: buildDetails(),
      });
      setLogId(res.id);
      setStatus("saved");
    } catch {
      setStatus("idle");
    }
  }
  function scheduleSave() {
    setStatus("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(save, 600);
  }
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  function mutate(fn: (ls: Line[]) => Line[]) {
    setLines((ls) => fn(ls));
    scheduleSave();
  }

  function addExercise() {
    const sug = day?.suggestions[0];
    const line: Line = sug
      ? { key: nextKey(), exerciseId: sug.id, name: sug.label, trainingMax: sug.trainingMax, sets: seedSets(sug) }
      : { key: nextKey(), exerciseId: "custom", name: "", sets: [{ weight: "", reps: "", kind: "main" }] };
    mutate((ls) => [...ls, line]);
  }

  function pickExercise(key: string, exerciseId: string) {
    mutate((ls) =>
      ls.map((l) => {
        if (l.key !== key) return l;
        if (exerciseId === "custom")
          return { ...l, exerciseId, name: "", sets: [{ weight: "", reps: "", kind: "main" }] };
        const sug = day?.suggestions.find((s) => s.id === exerciseId);
        if (!sug) return { ...l, exerciseId };
        return { ...l, exerciseId, name: sug.label, trainingMax: sug.trainingMax, sets: seedSets(sug) };
      }),
    );
  }

  const setField = (key: string, i: number, field: keyof SetVal, val: string) =>
    mutate((ls) =>
      ls.map((l) =>
        l.key === key ? { ...l, sets: l.sets.map((s, j) => (j === i ? { ...s, [field]: val } : s)) } : l,
      ),
    );
  /** Append a set of a given kind, then keep the line grouped warm-up → working → BBB. */
  const addSetOfKind = (key: string, kind: SetKind, prefill: Partial<SetVal> = {}) =>
    mutate((ls) =>
      ls.map((l) =>
        l.key === key
          ? { ...l, sets: sortByKind([...l.sets, { weight: "", reps: "", kind, ...prefill }]) }
          : l,
      ),
    );
  const addWarmup = (key: string) => addSetOfKind(key, "warmup");
  const addSet = (key: string) => addSetOfKind(key, "main");
  /** Append one pre-filled "Boring But Big" set (configured % × reps). */
  const addBbb = (key: string, weight: number) =>
    addSetOfKind(key, "bbb", { weight: String(weight), reps: String(bbbReps) });
  /** Delete a single set row (confirm first, so a mis-tap doesn't lose it). */
  const removeSet = (key: string, i: number) => {
    if (!confirm(t("strength.deleteSetConfirm"))) return;
    mutate((ls) => ls.map((l) => (l.key === key ? { ...l, sets: l.sets.filter((_, j) => j !== i) } : l)));
  };
  const removeLine = (key: string) => mutate((ls) => ls.filter((l) => l.key !== key));
  const toggleDone = (key: string) =>
    mutate((ls) => ls.map((l) => (l.key === key ? { ...l, done: !l.done } : l)));

  function suggestionFor(l: Line): Suggestion | undefined {
    return day?.suggestions.find((s) => s.id === l.exerciseId);
  }

  return (
    <div className="space-y-4">
      {/* Day selector — pick a day from your plan to preload it, or start empty. */}
      {days.length >= 1 && (
        <div>
          <div className="flex items-center justify-between">
            <Label>{t("strength.chooseDay")}</Label>
            <span className="rounded-full bg-teal-50 px-2.5 py-0.5 text-xs font-medium text-teal-700">
              {t("strength.weekN", { n: week })}
            </span>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {days.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => {
                  setDayId(d.id);
                  setLines(seedLines(d));
                  scheduleSave();
                }}
                className={cn(
                  "rounded-xl border px-3 py-2 text-sm font-medium",
                  d.id === dayId
                    ? "border-teal-600 bg-teal-50 text-teal-800"
                    : "border-slate-200 bg-white text-slate-600",
                )}
              >
                {d.name}
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                setDayId("");
                setLines([]);
                scheduleSave();
              }}
              className={cn(
                "rounded-xl border px-3 py-2 text-sm font-medium",
                dayId === ""
                  ? "border-teal-600 bg-teal-50 text-teal-800"
                  : "border-slate-200 bg-white text-slate-600",
              )}
            >
              {t("strength.emptySession")}
            </button>
          </div>
        </div>
      )}

      {/* Warm-up reminder */}
      <ChecklistToggle
        done={warmup}
        icon="🔥"
        label={t("strength.warmup")}
        onToggle={() => {
          setWarmup((v) => !v);
          scheduleSave();
        }}
      />

      {/* Exercise lines */}
      {lines.map((l) => {
        const sug = suggestionFor(l);
        const showWeight = l.exerciseId === "custom" || (sug?.sets.some((s) => s.weight != null) ?? false);
        return (
          <Card key={l.key} className={cn(l.done && "border-teal-400")}>
            <CardBody className="space-y-3">
              <div className="flex items-center gap-2">
                <Select
                  className="flex-1"
                  value={l.exerciseId}
                  onChange={(e) => pickExercise(l.key, e.target.value)}
                >
                  {day?.suggestions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                  <option value="custom">{t("strength.customExercise")}</option>
                </Select>
                <Button type="button" variant="ghost" size="sm" onClick={() => removeLine(l.key)}>
                  ✕
                </Button>
              </div>

              {l.exerciseId === "custom" && (
                <Input
                  placeholder={t("strength.exerciseName")}
                  value={l.name}
                  onChange={(e) =>
                    mutate((ls) => ls.map((x) => (x.key === l.key ? { ...x, name: e.target.value } : x)))
                  }
                />
              )}

              {showWeight && sug?.trainingMax != null && (
                <div className="text-xs text-slate-400">
                  {t("strength.currentMax")}: {sug.trainingMax} kg
                </div>
              )}

              <div className="space-y-2">
                {(() => {
                  // Sets are grouped warm-up → working → BBB; only show section labels when the
                  // line actually mixes kinds. Numbering resets within each section.
                  const grouped = new Set(l.sets.map((s) => s.kind)).size > 1;
                  const headerFor = (kind: SetKind) =>
                    kind === "warmup"
                      ? t("strength.warmupSets")
                      : kind === "bbb"
                        ? t("strength.bbb")
                        : t("strength.workingSets");
                  const rows: ReactNode[] = [];
                  let lastKind: SetKind | null = null;
                  let n = 0;
                  l.sets.forEach((s, i) => {
                    if (s.kind !== lastKind) {
                      if (grouped)
                        rows.push(
                          <div
                            key={`h-${i}`}
                            className="pt-1 text-xs font-semibold uppercase tracking-wide text-slate-400"
                          >
                            {headerFor(s.kind)}
                          </div>,
                        );
                      lastKind = s.kind;
                      n = 0;
                    }
                    n += 1;
                    const target = sug?.sets[i];
                    const tm = sug?.trainingMax;
                    const w = Number(s.weight);
                    const pct = tm && tm > 0 && w > 0 ? Math.round((w / tm) * 100) : null;
                    rows.push(
                      <div key={i} className="flex items-center gap-2">
                        <span className="w-12 shrink-0 text-xs text-slate-500">
                          {t("strength.set")} {n}
                        </span>
                        {showWeight && (
                          <Input
                            type="number"
                            inputMode="decimal"
                            min={0}
                            placeholder="kg"
                            className="w-20"
                            value={s.weight}
                            onChange={(e) => setField(l.key, i, "weight", e.target.value)}
                          />
                        )}
                        {showWeight && pct != null && (
                          <span className="shrink-0 text-xs text-slate-400">{pct}%</span>
                        )}
                        <Input
                          type="number"
                          inputMode="numeric"
                          min={0}
                          placeholder={
                            target ? `${target.reps}${target.amrap ? "+" : ""}` : t("strength.reps")
                          }
                          className="w-20"
                          value={s.reps}
                          onChange={(e) => setField(l.key, i, "reps", e.target.value)}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          aria-label={t("strength.deleteSet")}
                          title={t("strength.deleteSet")}
                          onClick={() => removeSet(l.key, i)}
                        >
                          ✕
                        </Button>
                      </div>,
                    );
                  });
                  return rows;
                })()}
                <div className="flex flex-wrap gap-2">
                  {showWeight && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => addWarmup(l.key)}>
                      + {t("strength.addWarmupSet")}
                    </Button>
                  )}
                  <Button type="button" variant="ghost" size="sm" onClick={() => addSet(l.key)}>
                    + {t("strength.addSet")}
                  </Button>
                  {sug?.bbbWeight != null && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => addBbb(l.key, sug.bbbWeight as number)}
                    >
                      + {t("strength.addBBB")}
                    </Button>
                  )}
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => toggleDone(l.key)}
                  className={cn(
                    "flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium",
                    l.done
                      ? "border-teal-600 bg-teal-50 text-teal-800"
                      : "border-rose-200 bg-rose-50 text-rose-600",
                  )}
                >
                  {l.done ? "✓" : "○"} {t("log.done")}
                </button>
              </div>
            </CardBody>
          </Card>
        );
      })}

      <Button type="button" variant="secondary" onClick={addExercise} className="w-full">
        + {t("strength.addExercise")}
      </Button>

      {/* Stretching reminder */}
      <ChecklistToggle
        done={stretch}
        icon="🧘"
        label={t("strength.stretch")}
        onToggle={() => {
          setStretch((v) => !v);
          scheduleSave();
        }}
      />

      {/* Duration */}
      <div>
        <Label htmlFor="durationMin">
          {t("log.duration")} ({t("common.minutes")})
        </Label>
        <Input
          id="durationMin"
          type="number"
          min={0}
          inputMode="numeric"
          value={durationMin}
          onChange={(e) => {
            setDurationMin(e.target.value);
            scheduleSave();
          }}
        />
      </div>

      {/* Save status + finish */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-500">
          {status === "saving"
            ? t("strength.saving")
            : status === "saved"
              ? `✓ ${t("strength.saved")}`
              : t("strength.autosaveHint")}
        </span>
        <Button
          type="button"
          onClick={async () => {
            if (timer.current) clearTimeout(timer.current);
            await save();
            router.push("/dashboard");
          }}
        >
          {t("strength.finishWorkout")}
        </Button>
      </div>

      {/* Delete — only for an existing (already-saved) session opened via ?id= / resume. */}
      {resume?.id && (
        <form
          action={deleteSession}
          onSubmit={(e) => {
            if (!confirm(t("log.delete"))) e.preventDefault();
          }}
        >
          <input type="hidden" name="id" value={resume.id} />
          <Button type="submit" variant="danger" className="w-full">
            {t("log.delete")}
          </Button>
        </form>
      )}
    </div>
  );
}

function safeParse(s: string): Record<string, unknown> | null {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function restoreLines(details: Record<string, unknown>): Line[] {
  const ex = Array.isArray(details.exercises) ? details.exercises : [];
  return (ex as Array<{ name?: string; done?: boolean; trainingMax?: number; sets?: Array<Record<string, unknown>> }>).map((e) => ({
    key: nextKey(),
    exerciseId: "custom",
    name: String(e.name ?? ""),
    done: !!e.done,
    trainingMax: typeof e.trainingMax === "number" ? e.trainingMax : undefined,
    sets: (e.sets ?? []).map((s) => ({
      weight: s.weight != null ? String(s.weight) : "",
      reps: s.reps != null ? String(s.reps) : "",
      kind: (s.kind === "warmup" || s.kind === "bbb" ? s.kind : "main") as SetKind,
    })),
  }));
}
