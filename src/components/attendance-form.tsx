"use client";

import { useState } from "react";
import { useT } from "@/components/i18n-provider";
import type { DictKey } from "@/lib/i18n/dictionaries";
import { logPracticeAttendance } from "@/app/actions/training";
import { Button, Card, CardBody, Label, Select } from "@/components/ui";

type Slot = { id: string; label: string; tier: string };
type Member = { id: string; name: string };

/**
 * Group rugby attendance: pick a practice + date, then check off who was present.
 * Any member can submit (additive + de-duplicated server-side). `currentUserId` is
 * pre-checked so a member can quickly mark just themselves.
 */
export function AttendanceForm({
  slots,
  members,
  currentUserId,
  defaultSlotId,
  defaultDate,
}: {
  slots: Slot[];
  members: Member[];
  currentUserId: string;
  defaultSlotId?: string;
  defaultDate?: string;
}) {
  const { t } = useT();
  const today = new Date().toISOString().slice(0, 10);
  const [checked, setChecked] = useState<Record<string, boolean>>({
    [currentUserId]: true,
  });

  const toggle = (id: string) =>
    setChecked((c) => ({ ...c, [id]: !c[id] }));

  if (slots.length === 0) {
    return <p className="text-sm text-slate-500">{t("log.noSlots")}</p>;
  }

  return (
    <form action={logPracticeAttendance} className="space-y-5">
      <Card>
        <CardBody className="space-y-4">
          <div>
            <Label htmlFor="practiceSlotId">{t("attendance.whichPractice")}</Label>
            <Select
              id="practiceSlotId"
              name="practiceSlotId"
              defaultValue={defaultSlotId ?? slots[0]?.id}
            >
              {slots.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label} · {t(`tier.${s.tier}` as DictKey)}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="date">{t("attendance.date")}</Label>
            <input
              id="date"
              name="date"
              type="date"
              defaultValue={defaultDate ?? today}
              required
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
            />
          </div>
        </CardBody>
      </Card>

      <div className="space-y-2">
        <Label>{t("attendance.whoCame")}</Label>
        <Card>
          <ul className="divide-y divide-slate-100">
            {members.map((m) => {
              const on = !!checked[m.id];
              return (
                <li key={m.id}>
                  <label className="flex cursor-pointer items-center justify-between px-4 py-3 text-sm active:bg-slate-50">
                    <span className="font-medium text-slate-800">
                      {m.name}
                      {m.id === currentUserId && (
                        <span className="ml-2 text-xs text-slate-400">{t("attendance.you")}</span>
                      )}
                    </span>
                    <input
                      type="checkbox"
                      name={`present_${m.id}`}
                      checked={on}
                      onChange={() => toggle(m.id)}
                      className="h-5 w-5 rounded border-slate-300 text-teal-600"
                    />
                  </label>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>

      <Button type="submit" className="w-full">
        {t("attendance.save")}
      </Button>
    </form>
  );
}
