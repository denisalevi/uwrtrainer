"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/components/i18n-provider";
import { saveStrengthWorkout } from "@/app/actions/strength";
import { Button, Card, CardBody, Input, Label, SectionTitle, cn } from "@/components/ui";

type SetTarget = { targetReps: number; targetWeight?: number; amrap: boolean };
type LoggerMovement = { key: string; label: string; sets: SetTarget[] };
export type LoggerSession = { index: number; movements: LoggerMovement[] };

type Values = Record<string, { reps?: string; weight?: string }>; // key `${mvKey}:${setIdx}`

function cellKey(mvKey: string, setIdx: number) {
  return `${mvKey}:${setIdx}`;
}

export function StrengthWorkoutLogger({
  programId,
  cycle,
  week,
  sessions,
  resume,
  today,
}: {
  programId: string;
  cycle: number;
  week: number;
  sessions: LoggerSession[];
  resume: { id: string; details: string; durationMin: number | null } | null;
  today: string;
}) {
  const { t } = useT();
  const router = useRouter();

  // Restore a draft if we're resuming today's workout.
  const restored = resume ? safeParse(resume.details) : null;
  const [sessionIndex, setSessionIndex] = useState<number>(
    restored && typeof restored.sessionIndex === "number"
      ? Math.min(restored.sessionIndex, sessions.length - 1)
      : 0,
  );
  const [values, setValues] = useState<Values>(restored ? restoreValues(restored) : {});
  const [durationMin, setDurationMin] = useState<string>(
    resume?.durationMin != null ? String(resume.durationMin) : "",
  );
  const [logId, setLogId] = useState<string | undefined>(resume?.id);
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirty = useRef(false);

  const session = sessions[sessionIndex] ?? sessions[0];

  function buildDetails(): string {
    return JSON.stringify({
      kind: "strengthWorkout",
      programId,
      cycle,
      week,
      sessionIndex,
      movements: session.movements.map((mv) => ({
        key: mv.key,
        label: mv.label,
        sets: mv.sets.map((s, si) => {
          const v = values[cellKey(mv.key, si)] ?? {};
          return {
            targetReps: s.targetReps,
            targetWeight: s.targetWeight,
            amrap: s.amrap,
            reps: v.reps ? Number(v.reps) : null,
            weight: v.weight ? Number(v.weight) : null,
          };
        }),
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
      dirty.current = false;
      setStatus("saved");
    } catch {
      setStatus("idle");
    }
  }

  function scheduleSave() {
    dirty.current = true;
    setStatus("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(save, 600);
  }

  // Flush a pending save when leaving the page.
  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  function setCell(mvKey: string, setIdx: number, field: "reps" | "weight", val: string) {
    setValues((prev) => ({
      ...prev,
      [cellKey(mvKey, setIdx)]: { ...prev[cellKey(mvKey, setIdx)], [field]: val },
    }));
    scheduleSave();
  }

  return (
    <div className="space-y-4">
      {/* Day selector */}
      {sessions.length > 1 && (
        <div>
          <Label>{t("strength.chooseDay")}</Label>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {sessions.map((s) => (
              <button
                key={s.index}
                type="button"
                onClick={() => {
                  setSessionIndex(s.index);
                  scheduleSave();
                }}
                className={cn(
                  "rounded-xl border px-3 py-2 text-sm font-medium",
                  s.index === sessionIndex
                    ? "border-teal-600 bg-teal-50 text-teal-800"
                    : "border-slate-200 bg-white text-slate-600",
                )}
              >
                {t("strength.session")} {s.index + 1}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Movements with per-set inputs */}
      {session.movements.map((mv) => (
        <Card key={mv.key}>
          <CardBody className="space-y-3">
            <SectionTitle>{mv.label}</SectionTitle>
            <div className="space-y-2">
              {mv.sets.map((s, si) => {
                const v = values[cellKey(mv.key, si)] ?? {};
                const weighted = s.targetWeight != null;
                return (
                  <div key={si} className="flex items-center gap-2">
                    <span className="w-14 shrink-0 text-xs text-slate-500">
                      {t("strength.set")} {si + 1}
                    </span>
                    <span className="w-24 shrink-0 text-xs text-slate-400">
                      {t("strength.target")}: {weighted ? `${s.targetWeight}kg×` : ""}
                      {s.amrap ? `${s.targetReps}+` : s.targetReps}
                    </span>
                    {weighted && (
                      <Input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        placeholder="kg"
                        className="w-20"
                        value={v.weight ?? ""}
                        onChange={(e) => setCell(mv.key, si, "weight", e.target.value)}
                      />
                    )}
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      placeholder={t("strength.reps")}
                      className="w-20"
                      value={v.reps ?? ""}
                      onChange={(e) => setCell(mv.key, si, "reps", e.target.value)}
                    />
                  </div>
                );
              })}
            </div>
          </CardBody>
        </Card>
      ))}

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
            if (dirty.current || !logId) await save();
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

function restoreValues(details: Record<string, unknown>): Values {
  const out: Values = {};
  const movements = Array.isArray(details.movements) ? details.movements : [];
  for (const mv of movements as Array<{ key: string; sets?: Array<Record<string, unknown>> }>) {
    (mv.sets ?? []).forEach((s, si) => {
      out[cellKey(mv.key, si)] = {
        reps: s.reps != null ? String(s.reps) : undefined,
        weight: s.weight != null ? String(s.weight) : undefined,
      };
    });
  }
  return out;
}
