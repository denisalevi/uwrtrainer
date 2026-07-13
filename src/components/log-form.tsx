"use client";

import { useState } from "react";
import { useT } from "@/components/i18n-provider";
import type { DictKey } from "@/lib/i18n/dictionaries";
import { logSession, updateSession, deleteSession } from "@/app/actions/training";
import {
  CATEGORIES,
  CARDIO_ZONES,
  type Category,
  type SessionStatus,
} from "@/lib/constants";
import { Button, Card, CardBody, Input, Label, Select, Textarea, cn } from "@/components/ui";

type Slot = { id: string; label: string; tier: string };

export type ExistingSession = {
  id: string;
  category: Category;
  status: SessionStatus;
  date: string; // yyyy-mm-dd
  durationMin?: number | null;
  practiceSlotId?: string | null;
  zone?: string | null;
  activity?: string | null;
  note?: string | null;
  missReason?: string | null;
};

export function LogForm({
  slots,
  existing,
  defaultCategory,
  defaultDate,
}: {
  slots: Slot[];
  existing?: ExistingSession;
  /** Prefill a fresh (non-editing) log, e.g. from a count-shortfall "Log the session" link. */
  defaultCategory?: Category;
  defaultDate?: string;
}) {
  const { t } = useT();
  const editing = !!existing;
  const [category, setCategory] = useState<Category>(
    existing?.category ?? defaultCategory ?? "RUGBY",
  );
  const [status, setStatus] = useState<SessionStatus>(existing?.status ?? "DONE");
  const today = new Date().toISOString().slice(0, 10);

  const [note, setNote] = useState<string>(existing?.note ?? "");
  // Controlled so the chosen date can be forwarded to the strength logger (the strength link
  // navigates away from this form, so the value must be readable at click time, not just on submit).
  const [date, setDate] = useState<string>(existing?.date ?? defaultDate ?? today);

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
              <Input
                id="date"
                name="date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
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
                    defaultValue={existing ? existing.practiceSlotId ?? "" : slots[0]?.id}
                  >
                    <option value="">{t("log.ownTraining")}</option>
                    {slots.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label} · {t(`tier.${s.tier}` as DictKey)}
                      </option>
                    ))}
                  </Select>
                )}
              </div>
            )}

            {status === "DONE" && category === "STRENGTH" && (
              <a
                href={`/strength/log?date=${date}`}
                className="flex items-center justify-between rounded-xl border border-teal-600 bg-teal-50 px-3 py-3 text-sm font-medium text-teal-800"
              >
                <span>
                  💪 {t("strength.logWorkout")}
                  <span className="block text-xs font-normal text-teal-700">{t("strength.logCardHint")}</span>
                </span>
                <span>›</span>
              </a>
            )}

            {status === "DONE" && category !== "STRENGTH" && (
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
                  <>
                    <div>
                      <Label htmlFor="activity">{t("log.activity")}</Label>
                      <Input
                        id="activity"
                        name="activity"
                        placeholder={t("log.activityPlaceholder")}
                        defaultValue={existing?.activity ?? ""}
                      />
                    </div>
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
                  </>
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

            {!(category === "STRENGTH" && status === "DONE") && (
              <div>
                <Label htmlFor="note">{t("log.note")}</Label>
                <Input id="note" name="note" value={note} onChange={(e) => setNote(e.target.value)} />
              </div>
            )}
          </CardBody>
        </Card>

        {!(category === "STRENGTH" && status === "DONE") && (
          <Button type="submit" className="w-full">
            {editing ? t("log.saveChanges") : t("log.save")}
          </Button>
        )}
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
