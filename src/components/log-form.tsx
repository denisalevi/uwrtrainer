"use client";

import { useState } from "react";
import { useT } from "@/components/i18n-provider";
import type { DictKey } from "@/lib/i18n/dictionaries";
import { logSession, updateSession, deleteSession } from "@/app/actions/training";
import {
  CATEGORIES,
  CARDIO_ZONES,
  STRENGTH_LIFTS,
  type Category,
  type SessionStatus,
} from "@/lib/constants";
import { Button, Card, CardBody, Input, Label, Select, Textarea, cn } from "@/components/ui";

type Slot = { id: string; label: string; tier: string };

/** A pre-fillable movement from the player's strength program (this week's working sets). */
export type StrengthSuggestion = {
  label: string; // exercise name (e.g. "Full push-up" / "Back squat")
  liftEnum: string; // mapped STRENGTH_LIFTS value
  sets: number;
  reps: number;
  weight?: number;
};

export type ExistingSession = {
  id: string;
  category: Category;
  status: SessionStatus;
  date: string; // yyyy-mm-dd
  durationMin?: number | null;
  practiceSlotId?: string | null;
  zone?: string | null;
  lift?: string | null;
  sets?: number | null;
  reps?: number | null;
  weight?: number | null;
  note?: string | null;
  missReason?: string | null;
};

export function LogForm({
  slots,
  suggestions = [],
  existing,
}: {
  slots: Slot[];
  suggestions?: StrengthSuggestion[];
  existing?: ExistingSession;
}) {
  const { t } = useT();
  const editing = !!existing;
  const [category, setCategory] = useState<Category>(existing?.category ?? "RUGBY");
  const [status, setStatus] = useState<SessionStatus>(existing?.status ?? "DONE");
  const today = new Date().toISOString().slice(0, 10);

  // Controlled strength fields so the program selector can pre-fill them.
  const [lift, setLift] = useState<string>(existing?.lift ?? "SQUAT");
  const [sets, setSets] = useState<string>(existing?.sets != null ? String(existing.sets) : "");
  const [reps, setReps] = useState<string>(existing?.reps != null ? String(existing.reps) : "");
  const [weight, setWeight] = useState<string>(
    existing?.weight != null ? String(existing.weight) : "",
  );
  const [note, setNote] = useState<string>(existing?.note ?? "");

  function applySuggestion(s: StrengthSuggestion) {
    setLift(s.liftEnum);
    setSets(String(s.sets));
    setReps(String(s.reps));
    setWeight(s.weight != null ? String(s.weight) : "");
    if (!note) setNote(s.label);
  }

  return (
    <>
      <form action={editing ? updateSession : logSession} className="space-y-5">
        {editing && <input type="hidden" name="id" value={existing!.id} />}
        <input type="hidden" name="category" value={category} />
        <input type="hidden" name="status" value={status} />

        {/* Category */}
        <div>
          <Label>{t("log.chooseCategory")}</Label>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {CATEGORIES.map((c) => (
              <button
                type="button"
                key={c}
                onClick={() => setCategory(c)}
                className={cn(
                  "rounded-xl border px-3 py-3 text-sm font-medium",
                  category === c
                    ? "border-teal-600 bg-teal-50 text-teal-800"
                    : "border-slate-200 bg-white text-slate-700",
                )}
              >
                {t(`cat.${c}` as DictKey)}
              </button>
            ))}
          </div>
        </div>

        {/* Status */}
        <div>
          <Label>{t("log.status")}</Label>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {(["DONE", "MISSED"] as SessionStatus[]).map((s) => (
              <button
                type="button"
                key={s}
                onClick={() => setStatus(s)}
                className={cn(
                  "rounded-xl border px-3 py-3 text-sm font-medium",
                  status === s
                    ? s === "DONE"
                      ? "border-green-600 bg-green-50 text-green-800"
                      : "border-red-500 bg-red-50 text-red-700"
                    : "border-slate-200 bg-white text-slate-700",
                )}
              >
                {t(s === "DONE" ? "log.done" : "log.missed")}
              </button>
            ))}
          </div>
        </div>

        <Card>
          <CardBody className="space-y-4">
            <div>
              <Label htmlFor="date">{t("log.date")}</Label>
              <Input id="date" name="date" type="date" defaultValue={existing?.date ?? today} required />
            </div>

            {category === "RUGBY" && (
              <div>
                <Label htmlFor="practiceSlotId">{t("log.whichPractice")}</Label>
                {slots.length === 0 ? (
                  <p className="mt-1 text-sm text-slate-500">{t("log.noSlots")}</p>
                ) : (
                  <Select
                    id="practiceSlotId"
                    name="practiceSlotId"
                    defaultValue={existing?.practiceSlotId ?? slots[0]?.id}
                  >
                    {slots.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label} · {t(`tier.${s.tier}` as DictKey)}
                      </option>
                    ))}
                  </Select>
                )}
              </div>
            )}

            {status === "DONE" && (
              <>
                <div>
                  <Label htmlFor="durationMin">
                    {t("log.duration")} ({t("common.minutes")})
                  </Label>
                  <Input
                    id="durationMin"
                    name="durationMin"
                    type="number"
                    min={0}
                    inputMode="numeric"
                    defaultValue={existing?.durationMin ?? undefined}
                  />
                </div>

                {category === "CARDIO" && (
                  <div>
                    <Label htmlFor="zone">{t("log.zone")}</Label>
                    <Select id="zone" name="zone" defaultValue={existing?.zone ?? "Z2"}>
                      {CARDIO_ZONES.map((z) => (
                        <option key={z} value={z}>
                          {z}
                        </option>
                      ))}
                    </Select>
                  </div>
                )}

                {category === "STRENGTH" && (
                  <div className="space-y-3">
                    {suggestions.length > 0 && (
                      <div className="rounded-xl border border-teal-200 bg-teal-50/60 p-3">
                        <Label htmlFor="fromProgram">{t("log.fromProgram")}</Label>
                        <Select
                          id="fromProgram"
                          defaultValue=""
                          onChange={(e) => {
                            const i = Number(e.target.value);
                            if (Number.isInteger(i) && suggestions[i]) applySuggestion(suggestions[i]);
                          }}
                        >
                          <option value="">{t("log.pickMovement")}</option>
                          {suggestions.map((s, i) => (
                            <option key={i} value={i}>
                              {s.label} · {s.sets}×{s.reps}
                              {s.weight != null ? ` · ${s.weight} kg` : ""}
                            </option>
                          ))}
                        </Select>
                        <p className="mt-1 text-xs text-slate-500">{t("log.fromProgramHint")}</p>
                      </div>
                    )}
                    <div>
                      <Label htmlFor="lift">{t("log.lift")}</Label>
                      <Select id="lift" name="lift" value={lift} onChange={(e) => setLift(e.target.value)}>
                        {STRENGTH_LIFTS.map((l) => (
                          <option key={l} value={l}>
                            {l.charAt(0) + l.slice(1).toLowerCase()}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <Label htmlFor="sets">{t("log.sets")}</Label>
                        <Input
                          id="sets"
                          name="sets"
                          type="number"
                          min={0}
                          inputMode="numeric"
                          value={sets}
                          onChange={(e) => setSets(e.target.value)}
                        />
                      </div>
                      <div>
                        <Label htmlFor="reps">{t("log.reps")}</Label>
                        <Input
                          id="reps"
                          name="reps"
                          type="number"
                          min={0}
                          inputMode="numeric"
                          value={reps}
                          onChange={(e) => setReps(e.target.value)}
                        />
                      </div>
                      <div>
                        <Label htmlFor="weight">{t("log.weight")}</Label>
                        <Input
                          id="weight"
                          name="weight"
                          type="number"
                          min={0}
                          inputMode="decimal"
                          value={weight}
                          onChange={(e) => setWeight(e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}

            {status === "MISSED" && (
              <div>
                <Label htmlFor="missReason">{t("log.missReason")}</Label>
                <Textarea
                  id="missReason"
                  name="missReason"
                  placeholder={t("log.missReasonPlaceholder")}
                  defaultValue={existing?.missReason ?? ""}
                />
              </div>
            )}

            <div>
              <Label htmlFor="note">{t("log.note")}</Label>
              <Input id="note" name="note" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          </CardBody>
        </Card>

        <Button type="submit" className="w-full">
          {editing ? t("log.saveChanges") : t("log.save")}
        </Button>
      </form>

      {editing && (
        <form action={deleteSession} className="mt-3">
          <input type="hidden" name="id" value={existing!.id} />
          <Button type="submit" variant="danger" className="w-full">
            {t("log.delete")}
          </Button>
        </form>
      )}
    </>
  );
}
