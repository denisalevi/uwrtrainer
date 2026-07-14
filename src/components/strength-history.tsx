import { getServerT } from "@/lib/i18n/server";
import { prisma } from "@/lib/db";
import { MOVEMENT_LEVELS, type MovementKey, MOVEMENTS } from "@/lib/constants";
import type { MovementState } from "@/lib/strength";
import type { DictKey } from "@/lib/i18n/dictionaries";
import { Card, CardBody, SectionTitle } from "@/components/ui";

function parseState(raw: string): MovementState {
  try {
    return JSON.parse(raw) as MovementState;
  } catch {
    return {};
  }
}

const DECISION_TONE: Record<string, string> = {
  INCREASE: "bg-teal-50 text-teal-700",
  HOLD: "bg-amber-50 text-amber-700",
  REDUCE: "bg-rose-50 text-rose-700",
};

/**
 * Recent per-lift progression history (#30): every time a lift's stored maxima were overwritten —
 * a cycle closing or a manual settings edit — the old and new values are kept and shown here, so
 * development stays visible instead of vanishing with each new cycle.
 */
export async function StrengthHistory({ userId }: { userId: string }) {
  const { locale, t } = await getServerT();
  const events = await prisma.strengthProgressionEvent.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  if (events.length === 0) return null;

  const rows = events.map((ev) => {
    const before = parseState(ev.before);
    const after = parseState(ev.after);
    const m = (MOVEMENTS as readonly string[]).includes(ev.movement)
      ? (ev.movement as MovementKey)
      : null;

    const changes: string[] = [];
    if ((before.trainingMax ?? 0) !== (after.trainingMax ?? 0)) {
      changes.push(`${t("strength.tmShort")} ${before.trainingMax ?? 0} → ${after.trainingMax ?? 0} kg`);
    }
    if (m && (before.levelIndex ?? 0) !== (after.levelIndex ?? 0)) {
      const key = MOVEMENT_LEVELS[m][after.levelIndex ?? 0];
      if (key) changes.push(t(key as DictKey));
    }
    if ((before.repMax ?? 0) !== (after.repMax ?? 0)) {
      changes.push(`${t("strength.historyReps")} ${before.repMax ?? 0} → ${after.repMax ?? 0}`);
    }

    return {
      id: ev.id,
      date: ev.createdAt.toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" }),
      lift: m ? t(`mv.${m}` as DictKey) : ev.movement,
      what:
        ev.source === "CYCLE"
          ? t("strength.historyCycleClosed", { n: ev.cycle ?? 1 })
          : t("strength.historyManualEdit"),
      decision: ev.source === "CYCLE" ? ev.decision : null,
      changes: changes.join(" · "),
    };
  });

  return (
    <section className="space-y-2">
      <SectionTitle>{t("strength.history")}</SectionTitle>
      <Card>
        <CardBody className="divide-y divide-slate-100 p-0">
          {rows.map((r) => (
            <div key={r.id} className="flex items-center gap-2 px-4 py-2.5 text-sm">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-medium text-slate-800">{r.lift}</span>
                  <span className="text-xs text-slate-400">{r.what}</span>
                </div>
                <div className="text-xs text-slate-500 tabular-nums">
                  {r.changes || t("strength.historyNoChange")}
                </div>
              </div>
              {r.decision && (
                <span
                  className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium ${DECISION_TONE[r.decision] ?? "bg-slate-100 text-slate-600"}`}
                >
                  {t(`strength.decision.${r.decision}` as DictKey)}
                </span>
              )}
              <span className="shrink-0 text-xs text-slate-400">{r.date}</span>
            </div>
          ))}
        </CardBody>
      </Card>
    </section>
  );
}
