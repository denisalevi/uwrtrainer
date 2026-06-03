"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/components/i18n-provider";
import { saveStrengthWorkout } from "@/app/actions/strength";
import { Button, Card, CardBody, Input, Label, Select, cn } from "@/components/ui";

type SetTarget = { reps: number; weight: number | null; amrap: boolean };
type Suggestion = { id: string; label: string; sets: SetTarget[] };
export type LoggerDay = { id: string; name: string; minutes: number; suggestions: Suggestion[] };

type SetVal = { weight: string; reps: string };
type Line = { key: string; exerciseId: string; name: string; sets: SetVal[] };

let uid = 0;
const nextKey = () => `l${Date.now()}_${uid++}`;

/** Preselect one editable line per configured exercise on the day. */
function seedLines(day: LoggerDay | undefined): Line[] {
  if (!day) return [];
  return day.suggestions.map((sug) => ({
    key: nextKey(),
    exerciseId: sug.id,
    name: sug.label,
    sets: sug.sets.map((s) => ({ weight: s.weight != null ? String(s.weight) : "", reps: "" })),
  }));
}

export function StrengthWorkoutLogger({
  programId,
  cycle,
  week,
  days,
  resume,
  today,
}: {
  programId: string;
  cycle: number;
  week: number;
  days: LoggerDay[];
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
      exercises: lines.map((l) => ({
        name: l.name,
        sets: l.sets.map((s) => ({
          weight: s.weight ? Number(s.weight) : null,
          reps: s.reps ? Number(s.reps) : null,
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
      ? {
          key: nextKey(),
          exerciseId: sug.id,
          name: sug.label,
          sets: sug.sets.map((s) => ({ weight: s.weight != null ? String(s.weight) : "", reps: "" })),
        }
      : { key: nextKey(), exerciseId: "custom", name: "", sets: [{ weight: "", reps: "" }] };
    mutate((ls) => [...ls, line]);
  }

  function pickExercise(key: string, exerciseId: string) {
    mutate((ls) =>
      ls.map((l) => {
        if (l.key !== key) return l;
        if (exerciseId === "custom") return { ...l, exerciseId, name: "", sets: [{ weight: "", reps: "" }] };
        const sug = day?.suggestions.find((s) => s.id === exerciseId);
        if (!sug) return { ...l, exerciseId };
        return {
          ...l,
          exerciseId,
          name: sug.label,
          sets: sug.sets.map((s) => ({ weight: s.weight != null ? String(s.weight) : "", reps: "" })),
        };
      }),
    );
  }

  const setField = (key: string, i: number, field: keyof SetVal, val: string) =>
    mutate((ls) =>
      ls.map((l) =>
        l.key === key ? { ...l, sets: l.sets.map((s, j) => (j === i ? { ...s, [field]: val } : s)) } : l,
      ),
    );
  const addSet = (key: string) =>
    mutate((ls) => ls.map((l) => (l.key === key ? { ...l, sets: [...l.sets, { weight: "", reps: "" }] } : l)));
  const removeLine = (key: string) => mutate((ls) => ls.filter((l) => l.key !== key));

  function suggestionFor(l: Line): Suggestion | undefined {
    return day?.suggestions.find((s) => s.id === l.exerciseId);
  }

  return (
    <div className="space-y-4">
      {/* Day selector — pick a day from your plan to preload it, or start empty. */}
      {days.length >= 1 && (
        <div>
          <Label>{t("strength.chooseDay")}</Label>
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

      {/* Exercise lines */}
      {lines.map((l) => {
        const sug = suggestionFor(l);
        const showWeight = l.exerciseId === "custom" || (sug?.sets.some((s) => s.weight != null) ?? false);
        return (
          <Card key={l.key}>
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

              <div className="space-y-2">
                {l.sets.map((s, i) => {
                  const target = sug?.sets[i];
                  return (
                    <div key={i} className="flex items-center gap-2">
                      <span className="w-12 shrink-0 text-xs text-slate-500">
                        {t("strength.set")} {i + 1}
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
                    </div>
                  );
                })}
                <Button type="button" variant="ghost" size="sm" onClick={() => addSet(l.key)}>
                  + {t("strength.addSet")}
                </Button>
              </div>
            </CardBody>
          </Card>
        );
      })}

      <Button type="button" variant="secondary" onClick={addExercise} className="w-full">
        + {t("strength.addExercise")}
      </Button>

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
  return (ex as Array<{ name?: string; sets?: Array<Record<string, unknown>> }>).map((e) => ({
    key: nextKey(),
    exerciseId: "custom",
    name: String(e.name ?? ""),
    sets: (e.sets ?? []).map((s) => ({
      weight: s.weight != null ? String(s.weight) : "",
      reps: s.reps != null ? String(s.reps) : "",
    })),
  }));
}
