import Link from "next/link";
import { getServerT } from "@/lib/i18n/server";
import { StrengthWorkoutView } from "@/components/strength-workout-view";
import { MissedActions } from "@/components/missed-actions";
import { weeklySummaryLabel, missedResolveAction } from "@/lib/missed-label";
import { Card, Badge, Button } from "@/components/ui";
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

/**
 * Shared read-only session-log list used by the dashboard (home) and the team member view, so a
 * tapped session expands into the SAME detail view in both places (strength workouts render via
 * `StrengthWorkoutView`; everything else as a small definition list).
 *
 *  - `canGiveReason` gates the owner-only "Give a reason" form on auto-MISSED rows.
 *  - `editable` adds an Edit button inside the expanded detail for the viewer's own editable
 *    (non-auto) rows — DONE strength → the full logger, everything else → the generic edit form.
 *
 * Auto-MISSED rows open by default so their resolve actions ("Add yourself" / "Log the session" /
 * "Give a reason") stay one glance away instead of hidden behind a tap.
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

  return (
    <Card>
      <ul className="divide-y divide-slate-100">
        {logs.map((log) => {
          const isStrength = log.category === "STRENGTH" && log.status === "DONE";
          const isAutoMissed = log.auto && log.status === "MISSED";
          const summaryLabel =
            isAutoMissed && !log.practiceSlotId
              ? weeklySummaryLabel(t, log.category, log.details)
              : null;
          const title =
            summaryLabel ?? log.practiceSlot?.label ?? t(`cat.${log.category}` as DictKey);
          const editHref = isStrength ? `/strength/log?id=${log.id}` : `/log/${log.id}`;
          const showEdit = editable && !log.auto;

          return (
            <li key={log.id} className="text-sm">
              <details className="group" open={isAutoMissed}>
                <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 active:bg-slate-50">
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-slate-800">{title}</span>
                    <span className="mt-0.5 block text-slate-400">
                      {log.date.toLocaleDateString()}
                      {log.durationMin ? ` · ${log.durationMin} ${t("common.minutes")}` : ""}
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    {log.auto && <Badge tone="amber">{t("missed.autoBadge")}</Badge>}
                    <Badge tone={log.status === "DONE" ? "green" : "red"}>
                      {t(log.status === "DONE" ? "log.done" : "log.missed")}
                    </Badge>
                    <span className="text-slate-400 group-open:rotate-90">›</span>
                  </span>
                </summary>
                <div className="px-4 pb-3">
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
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
