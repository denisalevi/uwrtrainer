"use client";

import { useState } from "react";
import { useT } from "@/components/i18n-provider";
import type { DictKey } from "@/lib/i18n/dictionaries";
import { logSession } from "@/app/actions/training";
import {
  CATEGORIES,
  CARDIO_ZONES,
  STRENGTH_LIFTS,
  type Category,
  type SessionStatus,
} from "@/lib/constants";
import { Button, Card, CardBody, Input, Label, Select, Textarea, cn } from "@/components/ui";

type Slot = { id: string; label: string; tier: string };

export function LogForm({ slots }: { slots: Slot[] }) {
  const { t } = useT();
  const [category, setCategory] = useState<Category>("RUGBY");
  const [status, setStatus] = useState<SessionStatus>("DONE");
  const today = new Date().toISOString().slice(0, 10);

  return (
    <form action={logSession} className="space-y-5">
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
            <Input id="date" name="date" type="date" defaultValue={today} required />
          </div>

          {category === "RUGBY" && (
            <div>
              <Label htmlFor="practiceSlotId">{t("log.whichPractice")}</Label>
              {slots.length === 0 ? (
                <p className="mt-1 text-sm text-slate-500">{t("log.noSlots")}</p>
              ) : (
                <Select id="practiceSlotId" name="practiceSlotId" defaultValue={slots[0]?.id}>
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
                <Input id="durationMin" name="durationMin" type="number" min={0} inputMode="numeric" />
              </div>

              {category === "CARDIO" && (
                <div>
                  <Label htmlFor="zone">{t("log.zone")}</Label>
                  <Select id="zone" name="zone" defaultValue="Z2">
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
                  <div>
                    <Label htmlFor="lift">{t("log.lift")}</Label>
                    <Select id="lift" name="lift" defaultValue="SQUAT">
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
                      <Input id="sets" name="sets" type="number" min={0} inputMode="numeric" />
                    </div>
                    <div>
                      <Label htmlFor="reps">{t("log.reps")}</Label>
                      <Input id="reps" name="reps" type="number" min={0} inputMode="numeric" />
                    </div>
                    <div>
                      <Label htmlFor="weight">{t("log.weight")}</Label>
                      <Input id="weight" name="weight" type="number" min={0} inputMode="decimal" />
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
              />
            </div>
          )}

          <div>
            <Label htmlFor="note">{t("log.note")}</Label>
            <Input id="note" name="note" />
          </div>
        </CardBody>
      </Card>

      <Button type="submit" className="w-full">
        {t("log.save")}
      </Button>
    </form>
  );
}
