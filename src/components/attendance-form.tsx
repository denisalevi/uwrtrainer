"use client";

import { useState } from "react";
import { useT } from "@/components/i18n-provider";
import type { DictKey } from "@/lib/i18n/dictionaries";
import { logPracticeAttendance } from "@/app/actions/training";
import { Button, Card, CardBody, Label, Select } from "@/components/ui";

type Slot = { id: string; label: string; tier: string; dayOfWeek: number };
type Member = { id: string; name: string };

/** yyyy-mm-dd (local) for a Date. */
function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** The most recent date (today or earlier) that falls on the given weekday (0=Sun..6=Sat). */
function mostRecentWeekday(dayOfWeek: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() - dayOfWeek + 7) % 7));
  return dayKey(d);
}

/** Weekday (0=Sun..6=Sat) of a yyyy-mm-dd string, parsed as a LOCAL date. Null if malformed. */
function weekdayOf(dateStr: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d.getDay();
}

/**
 * Group rugby attendance: pick a practice + date, then check off who was present.
 * Any member can submit (additive + de-duplicated server-side). `currentUserId` is
 * pre-checked so a member can quickly mark just themselves.
 *
 * Selecting a practice auto-fills the date with the most recent matching weekday
 * (today if it matches), and the picked date's weekday is shown — with a warning when
 * it doesn't match the practice's weekday (the server rejects such dates).
 */
export function AttendanceForm({
  slots,
  members,
  currentUserId,
  defaultSlotId,
  defaultDate,
  editMode,
  initialPresentIds,
}: {
  slots: Slot[];
  members: Member[];
  currentUserId: string;
  defaultSlotId?: string;
  defaultDate?: string;
  /** Edit mode: submit reconciles removals too (unticked members lose their DONE row). */
  editMode?: boolean;
  /** Pre-check these members (edit mode: who is currently recorded as present). */
  initialPresentIds?: string[];
}) {
  const { t } = useT();
  const initialSlot = slots.find((s) => s.id === defaultSlotId) ?? slots[0];
  const [slotId, setSlotId] = useState(initialSlot?.id ?? "");
  const [date, setDate] = useState(
    defaultDate ?? (initialSlot ? mostRecentWeekday(initialSlot.dayOfWeek) : ""),
  );
  const [checked, setChecked] = useState<Record<string, boolean>>(() =>
    initialPresentIds
      ? Object.fromEntries(initialPresentIds.map((id) => [id, true]))
      : { [currentUserId]: true },
  );

  const toggle = (id: string) =>
    setChecked((c) => ({ ...c, [id]: !c[id] }));

  if (slots.length === 0) {
    return <p className="text-sm text-slate-500">{t("log.noSlots")}</p>;
  }

  const slot = slots.find((s) => s.id === slotId);
  const dateWeekday = weekdayOf(date);
  const mismatch = slot != null && dateWeekday != null && dateWeekday !== slot.dayOfWeek;

  const onSlotChange = (id: string) => {
    setSlotId(id);
    const next = slots.find((s) => s.id === id);
    if (next) setDate(mostRecentWeekday(next.dayOfWeek));
  };

  return (
    <form action={logPracticeAttendance} className="space-y-5">
      {editMode && <input type="hidden" name="editMode" value="1" />}
      <Card>
        <CardBody className="space-y-4">
          <div>
            <Label htmlFor="practiceSlotId">{t("attendance.whichPractice")}</Label>
            <Select
              id="practiceSlotId"
              name="practiceSlotId"
              value={slotId}
              onChange={(e) => onSlotChange(e.target.value)}
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
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
            />
            {dateWeekday != null && (
              <p className={`mt-1 text-xs ${mismatch ? "text-amber-600" : "text-slate-500"}`}>
                {t(`day.${dateWeekday}` as DictKey)}
                {mismatch && slot && (
                  <> · {t("attendance.wrongWeekday", { day: t(`day.${slot.dayOfWeek}` as DictKey) })}</>
                )}
              </p>
            )}
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

      <Button type="submit" className="w-full" disabled={mismatch}>
        {t("attendance.save")}
      </Button>
    </form>
  );
}
