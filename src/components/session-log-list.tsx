import Link from "next/link";
import { getServerT } from "@/lib/i18n/server";
import { startOfWeek, addDays } from "@/lib/dates";
import { getWeekItemsForWeeks, getExemptWeekSet } from "@/lib/stats";
import { TOURNAMENT_CATEGORY, tournamentLabel } from "@/lib/tournament";
import { StrengthWorkoutView } from "@/components/strength-workout-view";
import { MissedActions } from "@/components/missed-actions";
import { weeklySummaryLabel, missedResolveAction } from "@/lib/missed-label";
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
 * Week-header tone. The framing is positive ("n of m done"), the colour carries the verdict:
 *  - green   → every planned session of that week was done
 *  - grey    → something was missed but every miss has a reason (excused, calm colour)
 *  - red     → missed with no reason given (gently alarming)
 *  - neutral → current (still open) week, or no plan data available for that week
 */
type WeekTone = "green" | "grey" | "red" | "neutral";

const TONE_STYLES: Record<WeekTone, { box: string; head: string; count: string }> = {
  green: { box: "border-emerald-200", head: "bg-emerald-50 text-emerald-900", count: "text-emerald-700" },
  grey: { box: "border-slate-200", head: "bg-slate-100 text-slate-700", count: "text-slate-500" },
  red: { box: "border-rose-200", head: "bg-rose-50 text-rose-900", count: "text-rose-700" },
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

  const dateFmt = (d: Date, opts: Intl.DateTimeFormatOptions) => d.toLocaleDateString(undefined, opts);

  return (
    <div className="space-y-4">
      {weekKeys.map((wk) => {
        const weekLogs = weeks.get(wk)!;
        const autos = weekLogs.filter((l) => l.auto && l.status === "MISSED");
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
        const items = weekItems?.get(wk)?.filter((i) => i.target > 0) ?? null;
        const total = items?.reduce((s, i) => s + i.target, 0) ?? 0;
        // Cap per item so overshooting one category can't mask a miss in another.
        const done = items?.reduce((s, i) => s + Math.min(i.done, i.target), 0) ?? 0;
        const excusedAll = autos.length > 0 && autos.every((a) => a.missReason);
        const exempt = exemptWeeks?.has(wk) ?? false;
        let tone: WeekTone;
        if (exempt) tone = "green"; // tournament week — counts as fully adherent
        else if (!items || total === 0) tone = "neutral";
        else if (done >= total) tone = "green";
        else if (wk === currentWeekKey) tone = "neutral"; // week still open — don't judge it yet
        else tone = excusedAll ? "grey" : "red";
        const s = TONE_STYLES[tone];
        const hasBreakdown = !!items && total > 0;

        const header = (
          <>
            <span className="text-sm font-semibold">{weekLabel}</span>
            <span className={`flex shrink-0 items-center gap-1.5 text-xs font-medium ${s.count}`}>
              {exempt ? (
                <span>🏆 {t("week.goalsPaused")}</span>
              ) : (
                hasBreakdown && (
                  <span>
                    {tone === "green" && "✓ "}
                    {t("week.sessionsDone", { done, total })}
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
                  {items!.map((it, i) => (
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
                      <SessionRow
                        key={log.id}
                        log={log}
                        t={t}
                        canGiveReason={canGiveReason}
                        editable={editable}
                        showDate={false}
                      />
                    ))}
                  </div>
                </div>
              ))}

              {autos.length > 0 && (
                <div className="rounded-lg bg-amber-50/60 p-2">
                  <p className="px-1 pb-1.5 text-xs font-medium uppercase tracking-wide text-amber-600">
                    {t("dash.autoFlagged")}
                  </p>
                  <div className="space-y-2">
                    {autos.map((log) => (
                      <SessionRow
                        key={log.id}
                        log={log}
                        t={t}
                        canGiveReason={canGiveReason}
                        editable={editable}
                        showDate
                      />
                    ))}
                  </div>
                </div>
              )}
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
  canGiveReason,
  editable,
  showDate,
}: {
  log: SessionLogListItem;
  t: T;
  canGiveReason: boolean;
  editable: boolean;
  showDate: boolean;
}) {
  const isStrength = log.category === "STRENGTH" && log.status === "DONE";
  const isAutoMissed = log.auto && log.status === "MISSED";
  const summaryLabel =
    isAutoMissed && !log.practiceSlotId ? weeklySummaryLabel(t, log.category, log.details) : null;
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
  const title =
    summaryLabel ??
    log.practiceSlot?.label ??
    (isTournament ? tournamentLabel(log.details) ?? t("cat.TOURNAMENT") : null) ??
    t(`cat.${log.category}` as DictKey);
  // A rugby session tied to a practice slot IS a team-practice attendance tick — edit it in the
  // group attendance dialogue (add/remove people), not the detached personal log form. Same for
  // tournaments (they're group events keyed by date).
  const editHref = isStrength
    ? `/strength/log?id=${log.id}`
    : log.category === "RUGBY" && log.practiceSlotId
      ? `/attendance?slot=${log.practiceSlotId}&date=${localDayKey(log.date)}&edit=1`
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
          {log.auto && <Badge tone="amber">{t("missed.autoBadge")}</Badge>}
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

        {isAutoMissed && (
          <>
            <p className="mt-2 text-xs text-amber-700">
              {t(summaryLabel ? "missed.weeklyHint" : "missed.autoHint")}
            </p>
            <MissedActions
              logId={log.id}
              resolveHref={missedResolveAction(log).href}
              resolveLabel={t(missedResolveAction(log).labelKey)}
              reason={log.missReason}
              canGiveReason={canGiveReason}
            />
          </>
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
