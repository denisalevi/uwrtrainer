"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/components/i18n-provider";
import { saveStrengthWorkout, finishStrengthWorkout } from "@/app/actions/strength";
import { deleteSession } from "@/app/actions/training";
import type { MovementKey } from "@/lib/constants";
import { Button, Card, CardBody, Input, Label, Select, cn } from "@/components/ui";
import { useRestTimer, RestTimerBar, type RestTimerSettings } from "@/components/rest-timer";

type SetKind = "warmup" | "main" | "bbb";
type SetTarget = { reps: number; weight: number | null; amrap: boolean; kind?: SetKind; pct?: number | null };
type Suggestion = {
  id: string;
  /** Which movement pattern this preloads (drives per-lift progression on finish). */
  movement?: MovementKey;
  /** The lift's own wave week these sets were built from — recorded so finishing advances it. */
  week?: number;
  label: string;
  trainingMax?: number;
  sets: SetTarget[];
  /** Pre-filled weight for one "Boring But Big" set on this lift; null on non-weighted lifts. */
  bbbWeight?: number | null;
};
export type LoggerDay = { id: string; name: string; minutes: number; suggestions: Suggestion[] };

type SetVal = { weight: string; reps: string; kind: SetKind; amrap?: boolean };
type Line = {
  key: string;
  exerciseId: string;
  name: string;
  sets: SetVal[];
  done?: boolean;
  trainingMax?: number;
  /** Movement + logged week, carried so finishing the session advances the right lift's wave. */
  movement?: MovementKey;
  week?: number;
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

/** Small "(AMRAP)" tag, stacked under the set number, with a tap-to-reveal popover. */
function AmrapLabel({ label, hint }: { label: string; hint: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title={hint}
        className="inline-flex items-center gap-0.5 whitespace-nowrap text-[10px] leading-tight text-slate-500"
      >
        ({label})
        <span
          aria-hidden
          className="flex h-3 w-3 items-center justify-center rounded-full border border-current text-[8px] font-bold leading-none"
        >
          i
        </span>
      </button>
      {open && (
        <span className="absolute left-0 top-full z-20 mt-1 block w-44 rounded-md border border-slate-200 bg-white p-2 text-[10px] font-normal leading-snug text-slate-500 shadow-lg">
          {hint}
        </span>
      )}
    </span>
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
    amrap: s.amrap,
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
    movement: sug.movement,
    week: sug.week,
    sets: seedSets(sug),
  }));
}

export function StrengthWorkoutLogger({
  programId,
  cycle,
  week,
  days,
  bbbReps,
  restTimer,
  resume,
  today,
}: {
  programId: string;
  cycle: number;
  week: number;
  days: LoggerDay[];
  bbbReps: number;
  restTimer: RestTimerSettings;
  resume: { id: string; details: string; durationMin: number | null } | null;
  today: string;
}) {
  const { t } = useT();
  const router = useRouter();
  const rest = useRestTimer(restTimer);

  const restored = resume ? safeParse(resume.details) : null;
  // Wall-clock session start (ms epoch), persisted inside the details JSON so it survives
  // reload/resume. Ref = source of truth for saves (debounced closures), state = for display.
  const startedAtRef = useRef<number | null>(
    typeof restored?.startedAt === "number" ? (restored.startedAt as number) : null,
  );
  const [startedAt, setStartedAt] = useState<number | null>(startedAtRef.current);
  /** Lines whose done-tick the user touched manually — auto-done must never override them. */
  const doneTouched = useRef<Set<string>>(new Set());
  const initialDayId =
    (restored?.dayId as string) && days.some((d) => d.id === restored?.dayId)
      ? (restored!.dayId as string)
      : days[0]?.id ?? "";
  const [dayId, setDayId] = useState<string>(initialDayId);
  // Session date — first-class here so it's visible AND editable on create and edit (the old flow
  // dropped it: the /log strength link threw it away, and editing bypassed the date picker
  // entirely). `today` is just the initial value (from ?date= / the edited log / today).
  const [date, setDate] = useState<string>(today);
  // Cap the picker at the client's today (no future logs — the server also rejects them). Computed
  // after mount so SSR (server "today") and hydration (client "today") can't mismatch.
  const [maxDate, setMaxDate] = useState<string>("");
  useEffect(() => {
    const d = new Date();
    setMaxDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
  }, []);
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
      startedAt: startedAtRef.current ?? undefined,
      warmup,
      stretch,
      exercises: lines.map((l) => ({
        name: l.name,
        done: !!l.done,
        trainingMax: l.trainingMax,
        movement: l.movement,
        week: l.week,
        sets: l.sets.map((s) => ({
          weight: s.weight ? Number(s.weight) : null,
          reps: s.reps ? Number(s.reps) : null,
          kind: s.kind,
          amrap: s.amrap,
        })),
      })),
    });
  }

  /** Start the session clock on the first real interaction (day pick / first set edit). */
  function markStarted() {
    if (startedAtRef.current == null) {
      startedAtRef.current = Date.now();
      setStartedAt(startedAtRef.current);
    }
  }

  async function save(durOverride?: string) {
    const dur = durOverride ?? durationMin;
    setStatus("saving");
    try {
      const res = await saveStrengthWorkout({
        logId,
        date,
        durationMin: dur ? Number(dur) : undefined,
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
      ? { key: nextKey(), exerciseId: sug.id, name: sug.label, trainingMax: sug.trainingMax, movement: sug.movement, week: sug.week, sets: seedSets(sug) }
      : { key: nextKey(), exerciseId: "custom", name: "", sets: [{ weight: "", reps: "", kind: "main" }] };
    mutate((ls) => [...ls, line]);
  }

  function pickExercise(key: string, exerciseId: string) {
    mutate((ls) =>
      ls.map((l) => {
        if (l.key !== key) return l;
        // A custom (typed) exercise has no movement → it won't drive progression.
        if (exerciseId === "custom")
          return { ...l, exerciseId, name: "", movement: undefined, week: undefined, sets: [{ weight: "", reps: "", kind: "main" }] };
        const sug = day?.suggestions.find((s) => s.id === exerciseId);
        if (!sug) return { ...l, exerciseId };
        return { ...l, exerciseId, name: sug.label, trainingMax: sug.trainingMax, movement: sug.movement, week: sug.week, sets: seedSets(sug) };
      }),
    );
  }

  const setField = (key: string, i: number, field: keyof SetVal, val: string) => {
    markStarted();
    mutate((ls) =>
      ls.map((l) => {
        if (l.key !== key) return l;
        const sets = l.sets.map((s, j) => (j === i ? { ...s, [field]: val } : s));
        // Auto-mark the exercise done when its LAST empty reps field gets a value. Only ever
        // auto-set — never auto-clear (a deleted rep may be intentional), and never override
        // a manual untick (doneTouched).
        let done = l.done;
        if (
          field === "reps" &&
          val.trim() !== "" &&
          !done &&
          !doneTouched.current.has(key) &&
          sets.length > 0 &&
          sets.every((s) => s.reps.trim() !== "")
        )
          done = true;
        return { ...l, sets, done };
      }),
    );
  };
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
  const toggleDone = (key: string) => {
    doneTouched.current.add(key);
    mutate((ls) => ls.map((l) => (l.key === key ? { ...l, done: !l.done } : l)));
  };

  function suggestionFor(l: Line): Suggestion | undefined {
    return day?.suggestions.find((s) => s.id === l.exerciseId);
  }

  return (
    // Prime/unlock audio on the first tap so the end-of-rest beep is allowed by the
    // browser's autoplay policy when it later fires from a timer tick.
    <div className="space-y-4" onPointerDownCapture={rest.primeAudio}>
      {/* Session date — editable here (was previously fixed/invisible in this logger). */}
      <div>
        <Label htmlFor="sw-date">{t("log.date")}</Label>
        <Input
          id="sw-date"
          type="date"
          value={date}
          max={maxDate || undefined}
          onChange={(e) => {
            markStarted();
            setDate(e.target.value);
            scheduleSave();
          }}
        />
      </div>

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
                  markStarted();
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
                markStarted();
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
                        {/* "Set N" with "(AMRAP)" stacked right under it in the same cell. */}
                        <div className="flex w-16 shrink-0 flex-col text-xs leading-tight text-slate-500">
                          <span>
                            {t("strength.set")} {n}
                          </span>
                          {s.amrap && (
                            <AmrapLabel label={t("strength.amrapShort")} hint={t("strength.amrapHint")} />
                          )}
                        </div>
                        {showWeight && (
                          <Input
                            type="number"
                            inputMode="decimal"
                            min={0}
                            step="any"
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
                            target ? `${target.reps}${s.amrap ? "+" : ""}` : t("strength.reps")
                          }
                          className="w-20"
                          value={s.reps}
                          onChange={(e) => setField(l.key, i, "reps", e.target.value)}
                          // Leaving the reps field (or pressing Enter) auto-starts the rest timer
                          // for this set's kind. Read the live value to avoid a stale closure.
                          onBlur={(e) => {
                            if (rest.enabled && e.target.value.trim() !== "") rest.startForKind(s.kind);
                          }}
                          onKeyDown={(e) => {
                            // Blur is enough — the onBlur handler above starts the timer.
                            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                          }}
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

      {/* Duration (+ live session clock, wall-clock based — phones lock between sets) */}
      <div>
        <div className="flex items-center justify-between">
          <Label htmlFor="durationMin">
            {t("log.duration")} ({t("common.minutes")})
          </Label>
          {startedAt != null && (
            <SessionTimer
              startedAt={startedAt}
              canFill={durationMin.trim() === ""}
              onFill={(min) => {
                setDurationMin(String(min));
                scheduleSave();
              }}
            />
          )}
        </div>
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
            // Prefill an EMPTY duration from the session clock; never overwrite a manual value.
            let dur = durationMin;
            if (dur.trim() === "" && startedAtRef.current != null) {
              dur = String(elapsedMinutes(startedAtRef.current));
              setDurationMin(dur);
            }
            // Finishing (unlike autosave) advances each logged lift's own wave — exactly once.
            setStatus("saving");
            try {
              const res = await finishStrengthWorkout({
                logId,
                date,
                durationMin: dur ? Number(dur) : undefined,
                details: buildDetails(),
              });
              setLogId(res.id);
            } catch {
              setStatus("idle");
              return;
            }
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

      {/* Single shared rest timer, pinned above the nav. Hidden when disabled/idle. */}
      <RestTimerBar controller={rest} />
    </div>
  );
}

/** Whole elapsed minutes since `startedAt` (wall clock), at least 1. */
function elapsedMinutes(startedAt: number): number {
  return Math.max(1, Math.round((Date.now() - startedAt) / 60000));
}

/**
 * Subtle elapsed readout + optional "use timer: NN min" tap-to-fill. Recomputes from
 * Date.now() - startedAt on each tick AND on visibilitychange — an interval counter would
 * fall behind while the phone is locked between sets.
 */
function SessionTimer({
  startedAt,
  canFill,
  onFill,
}: {
  startedAt: number;
  canFill: boolean;
  onFill: (min: number) => void;
}) {
  const { t } = useT();
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const iv = setInterval(tick, 1000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(iv);
      document.removeEventListener("visibilitychange", tick);
    };
  }, []);
  const total = Math.max(0, Math.floor((now - startedAt) / 1000));
  const m = Math.floor(total / 60);
  const clock = `${m}:${String(total % 60).padStart(2, "0")}`;
  return (
    <span className="flex items-center gap-2 text-xs tabular-nums text-slate-400">
      <span>
        ⏱ {t("strength.elapsed")} {clock}
      </span>
      {canFill && (
        <button
          type="button"
          className="font-medium text-teal-700 underline decoration-dotted"
          onClick={() => onFill(elapsedMinutes(startedAt))}
        >
          {t("strength.useTimer", { n: elapsedMinutes(startedAt) })}
        </button>
      )}
    </span>
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
  return (ex as Array<{ name?: string; done?: boolean; trainingMax?: number; movement?: MovementKey; week?: number; sets?: Array<Record<string, unknown>> }>).map((e) => ({
    key: nextKey(),
    exerciseId: "custom",
    name: String(e.name ?? ""),
    done: !!e.done,
    trainingMax: typeof e.trainingMax === "number" ? e.trainingMax : undefined,
    // Preserve the movement + logged week so re-finishing an edited session advances the right lift.
    movement: e.movement,
    week: typeof e.week === "number" ? e.week : undefined,
    sets: (e.sets ?? []).map((s) => ({
      weight: s.weight != null ? String(s.weight) : "",
      reps: s.reps != null ? String(s.reps) : "",
      kind: (s.kind === "warmup" || s.kind === "bbb" ? s.kind : "main") as SetKind,
      amrap: s.amrap === true,
    })),
  }));
}
