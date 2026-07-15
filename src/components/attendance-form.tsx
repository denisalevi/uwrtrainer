"use client";

import { useState } from "react";
import { useT } from "@/components/i18n-provider";
import type { DictKey } from "@/lib/i18n/dictionaries";
import { logPracticeAttendance, logTournament } from "@/app/actions/training";
import { EXTRA_PRACTICE_ID } from "@/lib/extra-practice";
import { Button, Card, CardBody, Input, Label, Select } from "@/components/ui";

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
 *
 * `tournament` mode (#31) reuses the same flow for a tournament / league game: no practice
 * slot, an optional event label, and any date (incl. upcoming — pre-logging a game already
 * pauses the running week's goals). Submits to `logTournament`.
 */
export function AttendanceForm({
  slots,
  members,
  currentUserId,
  defaultSlotId,
  defaultDate,
  editMode,
  initialPresentIds,
  tournament,
  defaultLabel,
  defaultNote,
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
  /** Tournament / league game mode: no practice slot, optional label, free date. */
  tournament?: boolean;
  /** Tournament / extra-practice mode: prefilled event label (edit). */
  defaultLabel?: string;
  /** Prefilled shared event note (edit). */
  defaultNote?: string;
}) {
  const { t } = useT();
  const initialSlot = slots.find((s) => s.id === defaultSlotId) ?? slots[0];
  const [slotId, setSlotId] = useState(
    defaultSlotId === EXTRA_PRACTICE_ID ? EXTRA_PRACTICE_ID : initialSlot?.id ?? EXTRA_PRACTICE_ID,
  );
  const [date, setDate] = useState(
    defaultDate ?? (tournament ? dayKey(new Date()) : initialSlot ? mostRecentWeekday(initialSlot.dayOfWeek) : dayKey(new Date())),
  );
  const [checked, setChecked] = useState<Record<string, boolean>>(() =>
    initialPresentIds
      ? Object.fromEntries(initialPresentIds.map((id) => [id, true]))
      : { [currentUserId]: true },
  );

  const toggle = (id: string) =>
    setChecked((c) => ({ ...c, [id]: !c[id] }));

  const extra = !tournament && slotId === EXTRA_PRACTICE_ID;
  const slot = tournament || extra ? undefined : slots.find((s) => s.id === slotId);
  const dateWeekday = weekdayOf(date);
  const mismatch = slot != null && dateWeekday != null && dateWeekday !== slot.dayOfWeek;

  const onSlotChange = (id: string) => {
    setSlotId(id);
    const next = slots.find((s) => s.id === id);
    if (next) setDate(mostRecentWeekday(next.dayOfWeek));
  };

  return (
    <form action={tournament ? logTournament : logPracticeAttendance} className="space-y-5">
      {editMode && <input type="hidden" name="editMode" value="1" />}
      <Card>
        <CardBody className="space-y-4">
          {tournament ? (
            <div>
              <Label htmlFor="label">{t("tournament.label")}</Label>
              <Input
                id="label"
                name="label"
                maxLength={80}
                defaultValue={defaultLabel}
                placeholder={t("tournament.labelPlaceholder")}
              />
            </div>
          ) : (
            <>
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
                  {/* One-off session with a free name — e.g. an extra practice some week. */}
                  <option value={EXTRA_PRACTICE_ID}>{t("attendance.extraPractice")}</option>
                </Select>
              </div>
              {extra && (
                <div>
                  <Label htmlFor="extraLabel">{t("attendance.extraName")}</Label>
                  <Input
                    id="extraLabel"
                    name="extraLabel"
                    required
                    maxLength={80}
                    defaultValue={defaultLabel}
                    placeholder={t("attendance.extraNamePlaceholder")}
                  />
                </div>
              )}
            </>
          )}
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
            {tournament && <p className="mt-1 text-xs text-slate-500">{t("tournament.goalsHint")}</p>}
          </div>
          {/* Optional shared note about the event — shows wherever the session is displayed. */}
          <div>
            <Label htmlFor="att-note">{t("log.note")}</Label>
            <Input id="att-note" name="note" maxLength={300} defaultValue={defaultNote} />
          </div>
        </CardBody>
      </Card>

      <div className="space-y-2">
        <Label>{t(tournament ? "tournament.whoPlayed" : "attendance.whoCame")}</Label>
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
