import Link from "next/link";
import { getServerT } from "@/lib/i18n/server";
import { startOfWeek, addDays } from "@/lib/dates";
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
 * Shared read-only session-log list used by the dashboard (home) and the team member view.
 *
 * Layout: sessions are grouped into **weeks (Mon–Sun)**, newest week first, each under a labelled
 * separator. Within a week they're grouped by **day** (a day heading marks where one day ends and
 * the next begins), and any **auto-MISSED** rows are collected at the **end of that week**. Every
 * entry is a bounded card that stays **collapsed by default** and expands on tap into the same
 * detail view (strength workouts via `StrengthWorkoutView`, everything else a small definition
 * list) — so an opened entry is clearly its own box, not blended into its neighbours.
 *
 *  - `canGiveReason` gates the owner-only "Give a reason" form on auto-MISSED rows.
 *  - `editable` adds an Edit button inside the expanded detail for the viewer's own non-auto rows.
 */
export async function SessionLogList({
  logs,
  canGiveReason,
  editable = false,
}: {
  logs: SessionLogListItem[];
  canGiveReason: boolean;
  editable?: boolean;
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

  const dateFmt = (d: Date, opts: Intl.DateTimeFormatOptions) => d.toLocaleDateString(undefined, opts);

  return (
    <div className="space-y-6">
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

        return (
          <section key={wk} className="space-y-3">
            <div className="flex items-center gap-3">
              <h3 className="shrink-0 text-sm font-semibold text-slate-600">{weekLabel}</h3>
              <div className="h-px flex-1 bg-slate-200" />
            </div>

            {dayKeys.map((dk) => (
              <div key={dk} className="space-y-2">
                <p className="px-1 text-xs font-medium uppercase tracking-wide text-slate-400">
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
              <div className="space-y-2">
                <p className="px-1 text-xs font-medium uppercase tracking-wide text-amber-500">
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
  const title = summaryLabel ?? log.practiceSlot?.label ?? t(`cat.${log.category}` as DictKey);
  // A rugby session tied to a practice slot IS a team-practice attendance tick — edit it in the
  // group attendance dialogue (add/remove people), not the detached personal log form.
  const editHref = isStrength
    ? `/strength/log?id=${log.id}`
    : log.category === "RUGBY" && log.practiceSlotId
      ? `/attendance?slot=${log.practiceSlotId}&date=${localDayKey(log.date)}&edit=1`
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
            <div className="flex gap-2">
              <dt className="text-slate-400">{t("log.chooseCategory")}</dt>
              <dd>{title}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-slate-400">{t("log.date")}</dt>
              <dd>{log.date.toLocaleDateString()}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-slate-400">{t("log.status")}</dt>
              <dd>{t(log.status === "DONE" ? "log.done" : "log.missed")}</dd>
            </div>
            {log.durationMin != null && (
              <div className="flex gap-2">
                <dt className="text-slate-400">{t("log.duration")}</dt>
                <dd>
                  {log.durationMin} {t("common.minutes")}
                </dd>
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
