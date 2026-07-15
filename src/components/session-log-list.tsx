import Link from "next/link";
import { getServerT } from "@/lib/i18n/server";
import { prisma } from "@/lib/db";
import { startOfWeek, addDays } from "@/lib/dates";
import { getWeekItemsForWeeks, getExemptWeekSet } from "@/lib/stats";
import { TOURNAMENT_CATEGORY, tournamentLabel } from "@/lib/tournament";
import { extraPracticeLabel } from "@/lib/extra-practice";
import { StrengthWorkoutView } from "@/components/strength-workout-view";
import { WeekReasonForm } from "@/components/week-reason-form";
import { Badge, Button } from "@/components/ui";
import type { DictKey } from "@/lib/i18n/dictionaries";

export type SessionLogListItem = {
  id: string;
  category: string;
  status: string;
  date: Date;
  durationMin: number | null;
  auto: boolean;
  practiceSlotId: string | null;
  details: string | null;
  missReason: string | null;
  practiceSlot: { label: string } | null;
};

type T = Awaited<ReturnType<typeof getServerT>>["t"];

/** Local yyyy-mm-dd for a date (day-granular; matches how attendance keys slot+date). */
function localDayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Week-header tone. The framing is positive ("n of m done") and never loud:
 *  - green   → every goal of that week was reached (celebrated with 🎉)
 *  - grey    → a past week that fell short — calmly subdued, no red box. The only red left is
 *              a small "no reason given" tag inside, gone as soon as a week reason is typed.
 *  - neutral → current (still open) week, or no plan data available for that week
 */
type WeekTone = "green" | "grey" | "neutral";

const TONE_STYLES: Record<WeekTone, { box: string; head: string; count: string }> = {
  green: { box: "border-emerald-200", head: "bg-emerald-50 text-emerald-900", count: "text-emerald-700" },
  grey: { box: "border-slate-200", head: "bg-slate-50 text-slate-500", count: "text-slate-400" },
  neutral: { box: "border-slate-200", head: "bg-teal-50/60 text-slate-800", count: "text-teal-700" },
};

/**
 * Shared read-only session-log list used by the dashboard (home) and the team member view.
 *
 * Layout: sessions are grouped into **week boxes (Mon–Sun)**, newest week first. Each week is one
 * bordered box with a colour-coded header (see `WeekTone`) showing "n of m sessions done" for that
 * week's plan; tapping the header expands the per-plan-item breakdown with a link to log a session.
 * Within a week, entries sit in per-**day** boxes, and any **auto-MISSED** rows are collected at
 * the **end of that week**. Every entry is a bounded card that stays **collapsed by default** and
 * expands on tap into the same detail view (strength workouts via `StrengthWorkoutView`, everything
 * else a small definition list).
 *
 *  - `canGiveReason` gates the owner-only "Give a reason" form on auto-MISSED rows.
 *  - `editable` adds an Edit button inside the expanded detail for the viewer's own non-auto rows.
 *  - `planUserId` enables the per-week achievement headers (plan-vs-done for that user).
 */
export async function SessionLogList({
  logs,
  canGiveReason,
  editable = false,
  planUserId,
}: {
  logs: SessionLogListItem[];
  canGiveReason: boolean;
  editable?: boolean;
  planUserId?: string;
}) {
  const { t } = await getServerT();

  // Group by week (Monday start), newest first. `logs` arrives newest-first already.
  const weeks = new Map<number, SessionLogListItem[]>();
  for (const log of logs) {
    const key = startOfWeek(log.date).getTime();
    const arr = weeks.get(key);
    if (arr) arr.push(log);
    else weeks.set(key, [log]);
  }
  const weekKeys = [...weeks.keys()].sort((a, b) => b - a);
  const currentWeekKey = startOfWeek(new Date()).getTime();

  const weekItems = planUserId
    ? await getWeekItemsForWeeks(planUserId, weekKeys.map((k) => new Date(k)))
    : null;
  // Tournament-exempt weeks (#31): goals are paused, the header says so instead of judging.
  const exemptWeeks = planUserId
    ? await getExemptWeekSet(planUserId, weekKeys.map((k) => new Date(k)))
    : null;
  // The ONE per-week reason (replaces per-missed-row reasons; auto-missed rows are retired).
  const weekNotes = new Map<number, string>();
  if (planUserId) {
    const notes = await prisma.weekNote.findMany({
      where: { userId: planUserId, weekStart: { in: weekKeys.map((k) => new Date(k)) } },
      select: { weekStart: true, reason: true },
    });
    for (const n of notes) weekNotes.set(n.weekStart.getTime(), n.reason);
  }

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const dateFmt = (d: Date, opts: Intl.DateTimeFormatOptions) => d.toLocaleDateString(undefined, opts);

  return (
    <div className="space-y-4">
      {weekKeys.map((wk) => {
        const weekLogs = weeks.get(wk)!;
        // Auto-MISSED rows are retired from the UI (kept in the DB) — never rendered.
        const entries = weekLogs.filter((l) => !(l.auto && l.status === "MISSED"));

        // Group non-auto entries by calendar day, newest day first (input is newest-first).
        const days = new Map<number, SessionLogListItem[]>();
        for (const e of entries) {
          const dk = new Date(e.date).setHours(0, 0, 0, 0);
          const arr = days.get(dk);
          if (arr) arr.push(e);
          else days.set(dk, [e]);
        }
        const dayKeys = [...days.keys()].sort((a, b) => b - a);

        const weekStart = new Date(wk);
        const weekEnd = addDays(weekStart, 6);
        const weekLabel = `${dateFmt(weekStart, { day: "numeric", month: "short" })} – ${dateFmt(
          weekEnd,
          { day: "numeric", month: "short" },
        )}`;

        // Plan achievement for this week (only when planUserId was given and a plan existed).
        const allItems = weekItems?.get(wk) ?? null;
        const items = allItems?.filter((i) => i.target > 0) ?? null;
        // Committed practice slots (target-0 markers) — shown by name with an attended/missed
        // mark. A slot whose day hasn't happened yet this week is "pending", never "missed".
        const markers =
          allItems
            ?.filter((i) => i.practiceSlotId && i.target === 0 && i.inSeason)
            .map((i) => {
              const slotDate =
                i.slotDayOfWeek != null ? addDays(weekStart, (i.slotDayOfWeek + 6) % 7) : null;
              return {
                label: i.label ?? t("cat.RUGBY"),
                attended: i.done > 0,
                pending: wk === currentWeekKey && slotDate != null && slotDate >= todayStart,
              };
            }) ?? [];
        const total = items?.reduce((s, i) => s + i.target, 0) ?? 0;
        // Cap per item so overshooting one category can't mask a miss in another.
        const done = items?.reduce((s, i) => s + Math.min(i.done, i.target), 0) ?? 0;
        const exempt = exemptWeeks?.has(wk) ?? false;
        const hasBreakdown = !!allItems && (total > 0 || markers.length > 0);
        // "All goals reached" is about the COUNT goals only. A committed practice you skipped
        // for a different session that week is pure information (✗ row below), never a
        // goal-killer — the training goal is how much you trained, not which slot you hit.
        const hasGoals = total > 0;
        const allDone = hasGoals && done >= total;
        let tone: WeekTone;
        if (exempt || allDone) tone = "green"; // tournament week counts as fully adherent
        else if (!hasGoals || wk === currentWeekKey) tone = "neutral"; // open week: don't judge
        else tone = "grey"; // fell short — calm, positive framing; the count says how far you got
        const s = TONE_STYLES[tone];
        const weekReason = weekNotes.get(wk) ?? "";
        // The one loud element left: a small tag on a fallen-short PAST week with no reason yet.
        const needsReason = hasGoals && !exempt && !allDone && wk !== currentWeekKey;
        const showNoReasonTag = needsReason && !weekReason;
        // A skipped committed practice also OFFERS the reason box (purely optional, no tag).
        const missedMarker = markers.some((m) => !m.attended && !m.pending);
        const offerReason =
          needsReason || (missedMarker && !exempt && wk !== currentWeekKey);

        // Extras beyond the plan: overshoot inside planned goals (+N on their rows) plus DONE
        // sessions in categories with no goal at all — surfaced, never hidden by the cap.
        const plannedCats = new Set<string>(items?.map((i) => i.category) ?? []);
        if (markers.length > 0) plannedCats.add("RUGBY");
        const extraCounts = new Map<string, number>();
        for (const l of entries) {
          if (l.status !== "DONE" || l.category === TOURNAMENT_CATEGORY) continue;
          if (!plannedCats.has(l.category))
            extraCounts.set(l.category, (extraCounts.get(l.category) ?? 0) + 1);
        }
        const extrasTotal =
          (items?.reduce((sum, i) => sum + Math.max(0, i.done - i.target), 0) ?? 0) +
          [...extraCounts.values()].reduce((a, b) => a + b, 0);

        const header = (
          <>
            <span className="text-sm font-semibold">{weekLabel}</span>
            <span className={`flex shrink-0 items-center gap-1.5 text-xs font-medium ${s.count}`}>
              {showNoReasonTag && <Badge tone="red">{t("week.noReason")}</Badge>}
              {exempt ? (
                <span>🏆 {t("week.goalsPaused")}</span>
              ) : (
                hasBreakdown && (
                  <span>
                    {allDone && "🎉 "}
                    {total > 0 && t("week.sessionsDone", { done, total })}
                    {extrasTotal > 0 && ` +${extrasTotal}`}
                  </span>
                )
              )}
              {hasBreakdown && (
                <span className="text-slate-400 transition-transform group-open:rotate-90">›</span>
              )}
            </span>
          </>
        );

        return (
          <section key={wk} className={`overflow-hidden rounded-xl border ${s.box}`}>
            {hasBreakdown ? (
              <details className="group">
                <summary
                  className={`flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 ${s.head}`}
                >
                  {header}
                </summary>
                <div className={`space-y-1.5 border-t px-3 py-2.5 text-sm ${s.box} ${s.head}`}>
                  {items?.map((it, i) => (
                    <div key={i} className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate">
                        {it.label ??
                          (it.category === "OTHER" && it.note
                            ? it.note
                            : t(`cat.${it.category}` as DictKey))}
                      </span>
                      <span className={`shrink-0 text-xs font-medium ${s.count}`}>
                        {t("week.sessionsDone", { done: Math.min(it.done, it.target), total: it.target })}
                        {it.done > it.target ? ` +${it.done - it.target}` : ""}
                      </span>
                    </div>
                  ))}
                  {/* Committed practices, by name: attended ✓ / missed ✗ / still ahead this week. */}
                  {markers.map((m, i) => (
                    <div key={`m${i}`} className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate">{m.label}</span>
                      <span
                        className={`shrink-0 text-xs font-medium ${
                          m.attended ? "text-emerald-700" : m.pending ? "text-slate-400" : s.count
                        }`}
                      >
                        {m.attended
                          ? `✓ ${t("week.attended")}`
                          : m.pending
                            ? t("week.upcoming")
                            : `✗ ${t("week.missedIt")}`}
                      </span>
                    </div>
                  ))}
                  {/* Sessions beyond the plan — categories without a goal that week. */}
                  {extraCounts.size > 0 && (
                    <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate">{t("week.extras")}</span>
                      <span className={`shrink-0 text-xs font-medium ${s.count}`}>
                        {[...extraCounts.entries()]
                          .map(([c, n]) => `+${n} ${t(`cat.${c}` as DictKey)}`)
                          .join(" · ")}
                      </span>
                    </div>
                  )}
                  {/* One reason for everything missed that week (owner edits; teammates read).
                      Also offered when only a committed practice was skipped — fully optional. */}
                  {offerReason &&
                    (canGiveReason ? (
                      <div className="pt-1">
                        <p className="text-xs text-slate-500">{t("week.reasonLabel")}</p>
                        <WeekReasonForm weekStart={localDayKey(weekStart)} initialReason={weekReason} />
                      </div>
                    ) : (
                      weekReason && (
                        <p className="pt-1 text-xs text-slate-500">
                          {t("week.reasonLabel")}: {weekReason}
                        </p>
                      )
                    ))}
                  <Link
                    href="/log"
                    className="inline-block pt-1 text-sm font-medium text-teal-700 underline"
                  >
                    ➕ {t("dash.logSession")}
                  </Link>
                </div>
              </details>
            ) : (
              <div className={`flex items-center justify-between gap-2 px-3 py-2.5 ${s.head}`}>
                {header}
              </div>
            )}

            <div className="space-y-2 border-t border-slate-200 bg-white p-2">
              {dayKeys.map((dk) => (
                <div key={dk} className="rounded-lg bg-slate-50 p-2">
                  <p className="px-1 pb-1.5 text-xs font-medium uppercase tracking-wide text-slate-400">
                    {dateFmt(new Date(dk), { weekday: "short", day: "numeric", month: "short" })}
                  </p>
                  <div className="space-y-2">
                    {days.get(dk)!.map((log) => (
                      <SessionRow key={log.id} log={log} t={t} editable={editable} showDate={false} />
                    ))}
                  </div>
                </div>
              ))}

            </div>
          </section>
        );
      })}
    </div>
  );
}

/** One session entry — a bounded, collapsed-by-default disclosure card. */
async function SessionRow({
  log,
  t,
  editable,
  showDate,
}: {
  log: SessionLogListItem;
  t: T;
  editable: boolean;
  showDate: boolean;
}) {
  const isStrength = log.category === "STRENGTH" && log.status === "DONE";
  // Type-specific extras stored in the details JSON (cardio: activity name + HR zone; note: any).
  let extras: { zone?: string; activity?: string; note?: string } = {};
  if (log.details) {
    try {
      extras = JSON.parse(log.details) as typeof extras;
    } catch {
      extras = {};
    }
  }
  const isTournament = log.category === TOURNAMENT_CATEGORY;
  const extraLabel =
    log.category === "RUGBY" && !log.practiceSlotId ? extraPracticeLabel(log.details) : null;
  const title =
    log.practiceSlot?.label ??
    extraLabel ??
    (isTournament ? tournamentLabel(log.details) ?? t("cat.TOURNAMENT") : null) ??
    t(`cat.${log.category}` as DictKey);
  // A rugby session tied to a practice slot IS a team-practice attendance tick — edit it in the
  // group attendance dialogue (add/remove people), not the detached personal log form. Same for
  // tournaments and free-named extra practices (group events keyed by date/label).
  const editHref = isStrength
    ? `/strength/log?id=${log.id}`
    : log.category === "RUGBY" && log.practiceSlotId
      ? `/attendance?slot=${log.practiceSlotId}&date=${localDayKey(log.date)}&edit=1`
      : extraLabel
        ? `/attendance?slot=__extra__&label=${encodeURIComponent(extraLabel)}&date=${localDayKey(log.date)}&edit=1`
        : isTournament
          ? `/attendance?mode=tournament&date=${localDayKey(log.date)}&edit=1`
          : `/log/${log.id}`;
  const showEdit = editable && !log.auto;

  const subtitle = [
    showDate ? log.date.toLocaleDateString() : null,
    log.durationMin ? `${log.durationMin} ${t("common.minutes")}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <details className="group overflow-hidden rounded-lg border border-slate-200 bg-white text-sm open:border-slate-300 open:bg-slate-50 open:shadow-sm">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 active:bg-slate-50">
        <span className="min-w-0">
          <span className="block truncate font-medium text-slate-800">{title}</span>
          {subtitle && <span className="mt-0.5 block text-xs text-slate-400">{subtitle}</span>}
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <Badge tone={log.status === "DONE" ? "green" : "red"}>
            {t(log.status === "DONE" ? "log.done" : "log.missed")}
          </Badge>
          <span className="text-slate-400 transition-transform group-open:rotate-90">›</span>
        </span>
      </summary>
      <div className="border-t border-slate-200 px-3 py-3">
        {isStrength ? (
          <StrengthWorkoutView details={log.details} />
        ) : (
          <dl className="space-y-1 text-slate-600">
            {extras.activity?.trim() && (
              <div className="flex gap-2">
                <dt className="text-slate-400">{t("log.activity")}</dt>
                <dd>{extras.activity}</dd>
              </div>
            )}
            {log.durationMin != null && (
              <div className="flex gap-2">
                <dt className="text-slate-400">{t("log.duration")}</dt>
                <dd>
                  {log.durationMin} {t("common.minutes")}
                </dd>
              </div>
            )}
            {extras.zone && (
              <div className="flex gap-2">
                <dt className="text-slate-400">{t("log.zone")}</dt>
                <dd>{extras.zone}</dd>
              </div>
            )}
            {extras.note && (
              <div className="flex gap-2">
                <dt className="text-slate-400">{t("log.note")}</dt>
                <dd>{extras.note}</dd>
              </div>
            )}
            {log.missReason && (
              <div className="flex gap-2">
                <dt className="text-slate-400">{t("log.missReason")}</dt>
                <dd>{log.missReason}</dd>
              </div>
            )}
          </dl>
        )}

        {showEdit && (
          <div className="mt-3">
            <Link href={editHref}>
              <Button variant="secondary" size="sm">
                ✏️ {t("log.edit")}
              </Button>
            </Link>
          </div>
        )}
      </div>
    </details>
  );
}
