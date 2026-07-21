"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useT } from "@/components/i18n-provider";
import { saveStrengthWorkout, finishStrengthWorkout } from "@/app/actions/strength";
import { deleteSession } from "@/app/actions/training";
import { Button, Card, CardBody, Input, Label, Select, Textarea, cn } from "@/components/ui";
import { useRestTimer, RestTimerBar, type RestTimerSettings } from "@/components/rest-timer";
import {
  ACTIVE_WORKOUT_MAX_AGE_MS,
  clearActiveWorkout,
  readActiveWorkout,
  writeActiveWorkout,
} from "@/lib/active-workout";
// Line/set state logic is pure and unit-tested (switching exercises must never lose input).
import {
  CUSTOM_LINE_ID,
  hasUserInput,
  nextKey,
  restoreLines,
  seedLines,
  seedSets,
  sortByKind,
  switchExercise,
  type Line,
  type LoggerDay,
  type LoggerDayGroup,
  type SetKind,
  type SetVal,
  type Suggestion,
} from "@/lib/strength-log-lines";
import { isSafeHttpUrl, linkLabel, measureAxes, routineIdFromDayId } from "@/lib/routines";

export type { LoggerDay } from "@/lib/strength-log-lines";

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

/** An ad-hoc warm-up/cool-down item added while logging: a routine (done on the fly) or a
 *  named link (e.g. a YouTube warm-up video). Persisted in the session details. */
export type SectionItem = {
  key: string;
  type: "routine" | "link";
  name: string;
  routineId?: string;
  url?: string;
  done: boolean;
};

/**
 * Warm-up / cool-down section: the familiar tap-to-done toggle, plus attachable detail —
 * routines picked from your list, named links, and a free-text note ("what I did").
 */
function ChecklistSection({
  done,
  icon,
  label,
  items,
  note,
  routineOptions,
  onToggle,
  setItems,
  setNote,
  markDone,
}: {
  done: boolean;
  icon: string;
  label: string;
  items: SectionItem[];
  note: string;
  routineOptions: Array<{ id: string; name: string }>;
  onToggle: () => void;
  setItems: (fn: (items: SectionItem[]) => SectionItem[]) => void;
  setNote: (v: string) => void;
  /** Ticking an item off also ticks the section itself. */
  markDone: () => void;
}) {
  const { t } = useT();
  const [pickingRoutine, setPickingRoutine] = useState(false);
  const [addingLink, setAddingLink] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkName, setLinkName] = useState("");
  const [showNote, setShowNote] = useState(false);
  const noteVisible = showNote || note.trim() !== "";

  const toggleItem = (key: string) => {
    const turningOn = items.some((it) => it.key === key && !it.done);
    setItems((xs) => xs.map((it) => (it.key === key ? { ...it, done: !it.done } : it)));
    if (turningOn) markDone();
  };
  const addLink = () => {
    let url = linkUrl.trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    if (!isSafeHttpUrl(url)) return;
    const name = linkName.trim() || linkLabel({ type: "link", url });
    setItems((xs) => [...xs, { key: nextKey(), type: "link", name, url, done: false }]);
    setLinkUrl("");
    setLinkName("");
    setAddingLink(false);
  };

  return (
    <div className="space-y-2">
      <ChecklistToggle done={done} icon={icon} label={label} onToggle={onToggle} />
      {(items.length > 0 || noteVisible || pickingRoutine || addingLink) && (
        <div className="space-y-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
          {items.map((it) => (
            <div key={it.key} className="flex items-center gap-2 text-sm">
              {it.type === "routine" && it.routineId ? (
                <Link
                  href={`/strength/routines/${it.routineId}/view`}
                  className="min-w-0 flex-1 truncate font-medium text-teal-700 underline decoration-dotted"
                >
                  ↪ {it.name}
                </Link>
              ) : it.type === "link" && it.url ? (
                <a
                  href={it.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-w-0 flex-1 truncate font-medium text-teal-700 underline decoration-dotted"
                >
                  🔗 {it.name}
                </a>
              ) : (
                <span className="min-w-0 flex-1 truncate">{it.name}</span>
              )}
              <button
                type="button"
                onClick={() => toggleItem(it.key)}
                className={cn(
                  "rounded-full border px-2 py-0.5 text-xs font-medium",
                  it.done
                    ? "border-teal-600 bg-teal-50 text-teal-800"
                    : "border-slate-200 bg-white text-slate-400",
                )}
              >
                {it.done ? "✓" : "○"}
              </button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={t("common.delete")}
                onClick={() => setItems((xs) => xs.filter((x) => x.key !== it.key))}
              >
                ✕
              </Button>
            </div>
          ))}
          {pickingRoutine && (
            <Select
              value=""
              onChange={(e) => {
                const r = routineOptions.find((o) => o.id === e.target.value);
                if (r)
                  setItems((xs) => [
                    ...xs,
                    { key: nextKey(), type: "routine", name: r.name, routineId: r.id, done: false },
                  ]);
                setPickingRoutine(false);
              }}
            >
              <option value="">{t("routines.chooseRoutine")}</option>
              {routineOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </Select>
          )}
          {addingLink && (
            <div className="space-y-2">
              <Input
                placeholder="https://…"
                inputMode="url"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
              />
              <div className="flex items-center gap-2">
                <Input
                  className="mt-0 flex-1"
                  placeholder={`${t("routines.linkLabel")} (${t("common.optional")})`}
                  maxLength={60}
                  value={linkName}
                  onChange={(e) => setLinkName(e.target.value)}
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={!linkUrl.trim()}
                  onClick={addLink}
                >
                  {t("common.add")}
                </Button>
              </div>
            </div>
          )}
          {noteVisible && (
            <Textarea
              rows={2}
              placeholder={t("routines.note")}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          )}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {routineOptions.length > 0 && (
          <Button type="button" variant="ghost" size="sm" onClick={() => setPickingRoutine((v) => !v)}>
            + {t("routines.badge")}
          </Button>
        )}
        <Button type="button" variant="ghost" size="sm" onClick={() => setAddingLink((v) => !v)}>
          + {t("routines.linkBadge")}
        </Button>
        {!noteVisible && (
          <Button type="button" variant="ghost" size="sm" onClick={() => setShowNote(true)}>
            + {t("routines.note")}
          </Button>
        )}
      </div>
    </div>
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

export function StrengthWorkoutLogger({
  programId,
  cycle,
  week,
  days,
  bbbReps,
  restTimer,
  resume,
  today,
  routineOptions = [],
}: {
  programId: string;
  cycle: number;
  week: number;
  days: LoggerDay[];
  bbbReps: number;
  restTimer: RestTimerSettings;
  resume: { id: string; details: string; durationMin: number | null } | null;
  today: string;
  /** Pickable routines for the warm-up/cool-down sections (own + team, active). */
  routineOptions?: Array<{ id: string; name: string }>;
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
    restored
      ? // Re-link only against the day the session was saved for — if that day no longer
        // exists, lines degrade to custom instead of linking to the wrong exercises.
        restoreLines(restored, days.find((d) => d.id === restored.dayId))
      : seedLines(days.find((d) => d.id === initialDayId) ?? days[0]),
  );
  const [durationMin, setDurationMin] = useState<string>(
    resume?.durationMin != null ? String(resume.durationMin) : "",
  );
  const [warmup, setWarmup] = useState<boolean>(!!restored?.warmup);
  const [stretch, setStretch] = useState<boolean>(!!restored?.stretch);
  // Warm-up / cool-down attachments (routines done on the fly, links, a note) — persisted
  // inside the details JSON alongside the plain booleans.
  const [warmupItems, setWarmupItems] = useState<SectionItem[]>(() =>
    parseSectionItems(restored?.warmupItems),
  );
  const [warmupNote, setWarmupNote] = useState<string>(
    typeof restored?.warmupNote === "string" ? (restored.warmupNote as string) : "",
  );
  const [cooldownItems, setCooldownItems] = useState<SectionItem[]>(() =>
    parseSectionItems(restored?.cooldownItems),
  );
  const [cooldownNote, setCooldownNote] = useState<string>(
    typeof restored?.cooldownNote === "string" ? (restored.cooldownNote as string) : "",
  );
  // Free-text session notes — the "just write down what I did" escape hatch (any session,
  // including an empty one). Stored inside the details JSON; no schema change needed.
  const [sessionNotes, setSessionNotes] = useState<string>(
    typeof restored?.notes === "string" ? (restored.notes as string) : "",
  );
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const day = days.find((d) => d.id === dayId); // undefined = empty session (add by hand)

  // The debounced save fires from a setTimeout whose closure is one render old — read the
  // payload through refs that are refreshed every render, or the change that TRIGGERED the
  // save (the last keystroke, an exercise switch) would itself be missing from what's saved.
  const logIdRef = useRef<string | undefined>(resume?.id);
  const buildDetailsRef = useRef<() => string>(() => "");
  buildDetailsRef.current = buildDetails;
  const dateRef = useRef(date);
  dateRef.current = date;
  const durationRef = useRef(durationMin);
  durationRef.current = durationMin;

  function buildDetails(): string {
    // A routine-backed day records which routine it came from — the read-only views show it
    // ("Routine: X") and teammates get a copy affordance; the next log of the same routine
    // prefills from this session.
    const routineId = routineIdFromDayId(dayId);
    return JSON.stringify({
      kind: "strengthWorkout",
      programId,
      cycle,
      week,
      dayId,
      dayName: day?.name,
      routineId: routineId ?? undefined,
      routineName: routineId ? day?.name : undefined,
      startedAt: startedAtRef.current ?? undefined,
      warmup,
      stretch,
      warmupItems: warmupItems.length ? warmupItems.map(stripKey) : undefined,
      warmupNote: warmupNote.trim() || undefined,
      cooldownItems: cooldownItems.length ? cooldownItems.map(stripKey) : undefined,
      cooldownNote: cooldownNote.trim() || undefined,
      notes: sessionNotes.trim() || undefined,
      exercises: lines.map((l) =>
        // Collapsed routine-ref / link lines: one ticked entry, no sets.
        l.ref
          ? {
              itemType: l.ref.type,
              name: l.name,
              routineId: l.ref.routineId,
              url: l.ref.url,
              note: l.ref.note,
              done: !!l.done,
              sets: [],
            }
          : {
              // Which picker choice the line was on — restore/edit re-links it to the plan exercise
              // (keeping the picker + %-of-max display) instead of degrading to custom.
              exerciseId: l.exerciseId,
              name: l.name,
              done: !!l.done,
              trainingMax: l.trainingMax,
              movement: l.movement,
              week: l.week,
              cycle: l.cycle,
              measure: l.measure,
              tempo: l.tempo,
              restSeconds: l.restSeconds,
              sets: l.sets.map((s) => ({
                weight: s.weight ? Number(s.weight) : null,
                reps: s.reps ? Number(s.reps) : null,
                seconds: s.seconds ? Number(s.seconds) : null,
                kind: s.kind,
                amrap: s.amrap,
              })),
            },
      ),
    });
  }

  /**
   * Keep the global "workout in progress" marker (issue #33) in sync while this session is
   * live, so the app-shell bar can show the timers on every page. Only a RECENT session start
   * counts as live — editing last week's workout must not resurrect the bar.
   */
  function syncActiveMarker() {
    const sa = startedAtRef.current;
    if (sa == null || Date.now() - sa > ACTIVE_WORKOUT_MAX_AGE_MS) return;
    writeActiveWorkout({
      startedAt: sa,
      date: dateRef.current,
      dayName: day?.name,
      logId: logIdRef.current,
    });
  }
  // A live session resumed after navigating away re-arms the marker on mount (and refreshes
  // its logId/dayName as they become known).
  useEffect(() => {
    syncActiveMarker();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayId]);

  /** Start the session clock on the first real interaction (day pick / first set edit). */
  function markStarted() {
    if (startedAtRef.current == null) {
      startedAtRef.current = Date.now();
      setStartedAt(startedAtRef.current);
    }
    syncActiveMarker();
  }

  async function save() {
    const dur = durationRef.current;
    setStatus("saving");
    try {
      const res = await saveStrengthWorkout({
        logId: logIdRef.current,
        date: dateRef.current,
        durationMin: dur ? Number(dur) : undefined,
        details: buildDetailsRef.current(),
      });
      logIdRef.current = res.id;
      setStatus("saved");
      syncActiveMarker(); // the resume link gets precise once the draft row exists
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
  // Phones lock / switch apps between sets — flush a pending debounced save right away when
  // the tab goes hidden, so the last edit isn't lost if the page never comes back.
  useEffect(() => {
    const flush = () => {
      if (document.visibilityState === "hidden" && timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
        void save();
      }
    };
    document.addEventListener("visibilitychange", flush);
    return () => document.removeEventListener("visibilitychange", flush);
    // save() reads everything through refs, so the first-render closure is safe here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Coming back to the logger mid-rest: pick the countdown back up from the persisted
  // wall-clock deadline, so the in-page bar shows exactly what the global bar was showing.
  useEffect(() => {
    const endsAt = readActiveWorkout()?.rest?.endsAt;
    if (rest.enabled && endsAt != null && endsAt > Date.now()) {
      rest.startWithSeconds(Math.ceil((endsAt - Date.now()) / 1000));
    }
    // Mount-only: restoring once is the point; rest state changes must not re-trigger it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mirror the rest countdown into the global marker (wall-clock deadline), so the app-shell
  // bar keeps counting it down after navigating away. Cleared on pause/dismiss/finish.
  useEffect(() => {
    if (startedAtRef.current == null) return;
    if (rest.running) {
      writeActiveWorkout({
        rest: { endsAt: Date.now() + rest.remaining * 1000, vibrate: restTimer.vibrate },
      });
    } else {
      writeActiveWorkout({ rest: null });
    }
    // rest.remaining is read once at flip time (the deadline); ticking must not re-run this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rest.running]);

  function mutate(fn: (ls: Line[]) => Line[]) {
    setLines((ls) => fn(ls));
    scheduleSave();
  }

  function addExercise() {
    const sug = day?.suggestions[0];
    const line: Line = sug
      ? { key: nextKey(), exerciseId: sug.id, name: sug.label, trainingMax: sug.trainingMax, movement: sug.movement, week: sug.week, cycle: sug.cycle, measure: sug.measure, tempo: sug.tempo, restSeconds: sug.restSeconds, sets: seedSets(sug) }
      : { key: nextKey(), exerciseId: CUSTOM_LINE_ID, name: "", sets: [{ weight: "", reps: "", kind: "main" }] };
    mutate((ls) => [...ls, line]);
  }

  function pickExercise(key: string, exerciseId: string) {
    markStarted();
    // switchExercise stashes the rows being switched away from and restores them on a
    // switch back — changing the picker never loses typed values (unit-tested).
    mutate((ls) => ls.map((l) => (l.key === key ? switchExercise(l, exerciseId, day?.suggestions ?? []) : l)));
  }

  /** The field that marks a set "performed": seconds on timed measures, reps otherwise. */
  const completionField = (l: Line): "reps" | "seconds" =>
    l.measure && !measureAxes(l.measure).reps ? "seconds" : "reps";

  const setField = (key: string, i: number, field: keyof SetVal, val: string) => {
    markStarted();
    mutate((ls) =>
      ls.map((l) => {
        if (l.key !== key) return l;
        const sets = l.sets.map((s, j) => (j === i ? { ...s, [field]: val } : s));
        // Auto-mark the exercise done when its LAST empty reps/seconds field gets a value.
        // Only ever auto-set — never auto-clear (a deleted rep may be intentional), and never
        // override a manual untick (doneTouched).
        const doneField = completionField(l);
        let done = l.done;
        if (
          field === doneField &&
          val.trim() !== "" &&
          !done &&
          !doneTouched.current.has(key) &&
          sets.length > 0 &&
          sets.every((s) => ((s[doneField] ?? "") as string).trim() !== "")
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

      {/* Day selector — pick a 5/3/1 plan day or a routine to preload it, or start empty.
          Sections only appear when routines exist; a pure plan picker stays one flat grid. */}
      {days.length >= 1 && (
        <div>
          <Label>{t("strength.chooseDay")}</Label>
          {(() => {
            const pickDay = (d: LoggerDay | null) => {
              const id = d?.id ?? "";
              // Re-picking the selected day must not re-seed (that would wipe input);
              // a real switch replaces the lines, so ask first if anything was typed.
              if (id === dayId) return;
              if (hasUserInput(lines) && !confirm(t("strength.switchDayConfirm"))) return;
              markStarted();
              setDayId(id);
              setLines(d ? seedLines(d) : []);
              scheduleSave();
            };
            const dayButton = (d: LoggerDay | null, label: string) => (
              <button
                key={d?.id ?? "empty"}
                type="button"
                onClick={() => pickDay(d)}
                className={cn(
                  "rounded-xl border px-3 py-2 text-sm font-medium",
                  (d?.id ?? "") === dayId
                    ? "border-teal-600 bg-teal-50 text-teal-800"
                    : "border-slate-200 bg-white text-slate-600",
                )}
              >
                {label}
              </button>
            );
            const sections: Array<{ group: LoggerDayGroup; labelKey: Parameters<typeof t>[0] }> = [
              { group: "plan", labelKey: "strength.wendlerTitle" },
              { group: "mine", labelKey: "routines.mine" },
              { group: "team", labelKey: "routines.team" },
            ];
            const grouped = sections
              .map((s) => ({ ...s, days: days.filter((d) => (d.group ?? "plan") === s.group) }))
              .filter((s) => s.days.length > 0);
            const showHeaders = grouped.length > 1 || grouped.some((s) => s.group !== "plan");
            return (
              <div className="space-y-2">
                {grouped.map((s) => (
                  <div key={s.group}>
                    {showHeaders && (
                      <p className="mb-1 mt-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                        {t(s.labelKey)}
                      </p>
                    )}
                    <div className="grid grid-cols-2 gap-2">
                      {s.days.map((d) => dayButton(d, d.name))}
                    </div>
                  </div>
                ))}
                <div className="grid grid-cols-2 gap-2">
                  {dayButton(null, t("strength.emptySession"))}
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* Warm-up reminder — with attachable routines / links / note ("what I did"). */}
      <ChecklistSection
        done={warmup}
        icon="🔥"
        label={t("strength.warmup")}
        items={warmupItems}
        note={warmupNote}
        routineOptions={routineOptions}
        onToggle={() => {
          setWarmup((v) => !v);
          scheduleSave();
        }}
        setItems={(fn) => {
          markStarted();
          setWarmupItems(fn);
          scheduleSave();
        }}
        setNote={(v) => {
          markStarted();
          setWarmupNote(v);
          scheduleSave();
        }}
        markDone={() => setWarmup(true)}
      />

      {/* Exercise lines */}
      {lines.map((l) => {
        // Collapsed routine-ref / link lines: name (tap to open), done-tick, remove — no sets.
        if (l.ref) {
          return (
            <Card key={l.key} className={cn(l.done && "border-teal-400")}>
              <CardBody className="space-y-1.5">
                <div className="flex items-center gap-2">
                  {l.ref.type === "routine" && l.ref.routineId ? (
                    <Link
                      href={`/strength/routines/${l.ref.routineId}/view`}
                      className="min-w-0 flex-1 truncate text-sm font-medium text-teal-700 underline decoration-dotted"
                    >
                      ↪ {l.name}
                    </Link>
                  ) : l.ref.type === "link" && l.ref.url && isSafeHttpUrl(l.ref.url) ? (
                    <a
                      href={l.ref.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="min-w-0 flex-1 truncate text-sm font-medium text-teal-700 underline decoration-dotted"
                    >
                      🔗 {l.name}
                    </a>
                  ) : (
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">
                      {l.name}
                    </span>
                  )}
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
                  <Button type="button" variant="ghost" size="sm" onClick={() => removeLine(l.key)}>
                    ✕
                  </Button>
                </div>
                {l.ref.note && <p className="text-xs text-slate-500">{l.ref.note}</p>}
              </CardBody>
            </Card>
          );
        }
        const sug = suggestionFor(l);
        // Which value axes this line logs: routine exercises declare a measure (kg×reps /
        // reps / seconds / kg×seconds); plan/custom lines keep the legacy weight+reps rule.
        const measure = l.measure ?? sug?.measure;
        const axes = measure
          ? measureAxes(measure)
          : {
              weight: l.exerciseId === CUSTOM_LINE_ID || (sug?.sets.some((s) => s.weight != null) ?? false),
              reps: true,
              seconds: false,
            };
        const showWeight = axes.weight;
        const tempo = l.tempo ?? sug?.tempo;
        // Per-exercise routine rest overrides the per-kind rest durations.
        const startRest = (kind: SetKind) => {
          if (!rest.enabled) return;
          const rs = l.restSeconds ?? sug?.restSeconds;
          if (rs && rs > 0) rest.startWithSeconds(rs);
          else rest.startForKind(kind);
        };
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
                  <option value={CUSTOM_LINE_ID}>{t("strength.customExercise")}</option>
                </Select>
                <Button type="button" variant="ghost" size="sm" onClick={() => removeLine(l.key)}>
                  ✕
                </Button>
              </div>

              {l.exerciseId === CUSTOM_LINE_ID && (
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

              {/* Tempo prescription (e.g. "3-0-3") — how to perform the reps, never logged. */}
              {tempo && (
                <div className="text-xs text-slate-400">
                  🕐 {t("routines.tempo")}: <span className="font-medium text-slate-500">{tempo}</span>
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
                        {axes.reps && (
                          <Input
                            type="number"
                            inputMode="numeric"
                            min={0}
                            placeholder={
                              target?.reps != null ? `${target.reps}${s.amrap ? "+" : ""}` : t("strength.reps")
                            }
                            className="w-20"
                            value={s.reps}
                            onChange={(e) => setField(l.key, i, "reps", e.target.value)}
                            // Leaving the reps field (or pressing Enter) auto-starts the rest timer
                            // for this set's kind. Read the live value to avoid a stale closure.
                            onBlur={(e) => {
                              if (e.target.value.trim() !== "") startRest(s.kind);
                            }}
                            onKeyDown={(e) => {
                              // Blur is enough — the onBlur handler above starts the timer.
                              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                            }}
                          />
                        )}
                        {axes.seconds && (
                          <span className="flex items-center gap-1">
                            <Input
                              type="number"
                              inputMode="numeric"
                              min={0}
                              placeholder={
                                target?.seconds != null ? String(target.seconds) : t("routines.secondsShort")
                              }
                              className="w-20"
                              value={s.seconds ?? ""}
                              onChange={(e) => setField(l.key, i, "seconds", e.target.value)}
                              // On timed measures the seconds field is what marks a set performed —
                              // it drives the rest timer instead of reps.
                              onBlur={(e) => {
                                if (!axes.reps && e.target.value.trim() !== "") startRest(s.kind);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                              }}
                            />
                            <span className="text-xs text-slate-400">s</span>
                          </span>
                        )}
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

      {/* Cool-down / stretching reminder — same attachable detail as the warm-up. */}
      <ChecklistSection
        done={stretch}
        icon="🧘"
        label={t("strength.stretch")}
        items={cooldownItems}
        note={cooldownNote}
        routineOptions={routineOptions}
        onToggle={() => {
          setStretch((v) => !v);
          scheduleSave();
        }}
        setItems={(fn) => {
          markStarted();
          setCooldownItems(fn);
          scheduleSave();
        }}
        setNote={(v) => {
          markStarted();
          setCooldownNote(v);
          scheduleSave();
        }}
        markDone={() => setStretch(true)}
      />

      {/* Session notes — describe anything the structured fields can't capture. */}
      <div>
        <Label htmlFor="sw-notes">{t("strength.sessionNotes")}</Label>
        <Textarea
          id="sw-notes"
          rows={3}
          placeholder={t("strength.sessionNotesPlaceholder")}
          value={sessionNotes}
          onChange={(e) => {
            markStarted();
            setSessionNotes(e.target.value);
            scheduleSave();
          }}
        />
      </div>

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
                logId: logIdRef.current,
                date,
                durationMin: dur ? Number(dur) : undefined,
                details: buildDetails(),
              });
              logIdRef.current = res.id;
            } catch {
              setStatus("idle");
              return;
            }
            clearActiveWorkout(); // the session is finished — drop the global timer bar
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
            else clearActiveWorkout();
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

/** Drop the client-only list key before persisting a section item. */
function stripKey({ key: _key, ...item }: SectionItem): Omit<SectionItem, "key"> {
  return item;
}

/** Tolerantly restore warm-up/cool-down items from a saved details JSON. */
function parseSectionItems(v: unknown): SectionItem[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((x): SectionItem[] => {
    const o = (x ?? {}) as Record<string, unknown>;
    if (o.type !== "routine" && o.type !== "link") return [];
    return [
      {
        key: nextKey(),
        type: o.type,
        name: typeof o.name === "string" ? o.name : "",
        routineId: typeof o.routineId === "string" ? o.routineId : undefined,
        url: typeof o.url === "string" ? o.url : undefined,
        done: !!o.done,
      },
    ];
  });
}
