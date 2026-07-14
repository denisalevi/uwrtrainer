import { getServerT } from "@/lib/i18n/server";
import { Card, CardBody } from "@/components/ui";

type SetKind = "warmup" | "main" | "bbb";
type ViewSet = { weight: number | null; reps: number | null; amrap?: boolean; kind?: SetKind };
type ViewExercise = {
  name?: string;
  done?: boolean;
  trainingMax?: number;
  week?: number;
  cycle?: number;
  sets?: ViewSet[];
};
type ViewDetails = {
  kind?: string;
  dayName?: string;
  cycle?: number;
  week?: number;
  warmup?: boolean;
  stretch?: boolean;
  exercises?: ViewExercise[];
};

function parse(details: string | ViewDetails | null | undefined): ViewDetails | null {
  if (!details) return null;
  if (typeof details === "string") {
    try {
      return JSON.parse(details) as ViewDetails;
    } catch {
      return null;
    }
  }
  return details;
}

function fmtSet(s: ViewSet): string {
  const w = s.weight != null ? String(s.weight) : null;
  const reps = s.reps != null ? `${s.reps}${s.amrap ? "+" : ""}` : "—";
  return w != null ? `${w} × ${reps}` : reps;
}

// Set-chip colours by kind, so warm-ups, working sets and BBB read apart at a glance. The AMRAP
// top set gets an extra-emphasised solid chip (it's the one that drives progression).
const KIND_CHIP: Record<SetKind, string> = {
  warmup: "bg-amber-50 text-amber-700",
  main: "bg-teal-50 font-medium text-teal-800",
  bbb: "bg-indigo-50 text-indigo-700",
};
const AMRAP_CHIP = "bg-teal-600 font-semibold text-white ring-1 ring-teal-700";

function chipClass(s: ViewSet): string {
  if (s.amrap) return AMRAP_CHIP;
  return KIND_CHIP[s.kind ?? "main"] ?? KIND_CHIP.main;
}

/**
 * Read-only display of a saved STRENGTH workout (`details` JSON of shape
 * { kind, dayName, cycle, week, warmup, stretch,
 *   exercises:[{ name, done, trainingMax, sets:[{ weight, reps, amrap, kind }] }] }).
 * Accepts either the raw JSON string or a parsed object. Handles malformed/empty input.
 *
 * Sets are colour-coded by kind (warm-up / working / BBB) with the AMRAP set emphasised, and a
 * small legend explains the colours whenever more than one kind (or an AMRAP set) is present.
 */
export async function StrengthWorkoutView({
  details,
}: {
  details: string | ViewDetails | null | undefined;
}) {
  const { t } = await getServerT();
  const data = parse(details);
  const exercises = Array.isArray(data?.exercises) ? data!.exercises : [];

  if (!data || exercises.length === 0) {
    return <p className="text-sm text-slate-500">{t("team.noWorkoutDetail")}</p>;
  }

  // Which kinds / AMRAP actually appear — drives the legend.
  const kindsPresent = new Set<SetKind>();
  let hasAmrap = false;
  for (const ex of exercises) {
    for (const s of Array.isArray(ex.sets) ? ex.sets : []) {
      kindsPresent.add(s.kind ?? "main");
      if (s.amrap) hasAmrap = true;
    }
  }
  const legend: Array<{ cls: string; label: string }> = [];
  if (kindsPresent.has("warmup"))
    legend.push({ cls: KIND_CHIP.warmup, label: t("strength.warmupSets") });
  if (kindsPresent.has("main"))
    legend.push({ cls: KIND_CHIP.main, label: t("strength.workingSets") });
  if (kindsPresent.has("bbb")) legend.push({ cls: KIND_CHIP.bbb, label: t("strength.bbb") });
  if (hasAmrap) legend.push({ cls: AMRAP_CHIP, label: t("strength.amrapShort") });
  const showLegend = kindsPresent.size > 1 || hasAmrap;

  // Progression is per lift, so each exercise shows its OWN cycle/week (issue #32). The
  // session-level cycle/week (the legacy shared pointer) is only shown for old logs whose
  // exercises carry no per-lift position.
  const liftPos = (ex: ViewExercise): string | null => {
    const parts = [
      ex.cycle != null ? `${t("strength.cycleShort")}${ex.cycle}` : null,
      ex.week != null ? `${t("strength.weekShort")}${ex.week}` : null,
    ].filter(Boolean);
    return parts.length ? parts.join(" · ") : null;
  };
  const hasPerLift = exercises.some((ex) => liftPos(ex) != null);
  const cycleWeek = hasPerLift
    ? ""
    : [
        data.cycle != null ? `${t("strength.cycle")} ${data.cycle}` : null,
        data.week != null ? t("strength.weekN", { n: data.week }) : null,
      ]
        .filter(Boolean)
        .join(" · ");

  return (
    <div className="space-y-2">
      {(data.dayName || cycleWeek) && (
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          {data.dayName && (
            <span className="text-sm font-medium text-slate-800">{data.dayName}</span>
          )}
          {cycleWeek && <span className="text-xs text-slate-500">{cycleWeek}</span>}
        </div>
      )}
      <Card>
        <CardBody className="space-y-3">
          {exercises.map((ex, i) => {
            const sets = Array.isArray(ex.sets) ? ex.sets : [];
            return (
              <div key={i} className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-slate-800">
                    {ex.name || t("strength.exerciseName")}
                  </span>
                  {liftPos(ex) && (
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-slate-500">
                      {liftPos(ex)}
                    </span>
                  )}
                  {ex.trainingMax != null && (
                    <span className="text-xs text-slate-400 tabular-nums">
                      {t("strength.tmShort")} {ex.trainingMax} kg
                    </span>
                  )}
                  {ex.done && <span className="text-xs text-teal-700">✓</span>}
                </div>
                {sets.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {sets.map((s, j) => (
                      <span
                        key={j}
                        className={`rounded-md px-2 py-0.5 text-xs tabular-nums ${chipClass(s)}`}
                      >
                        {fmtSet(s)}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="text-xs text-slate-400">—</span>
                )}
              </div>
            );
          })}
          {showLegend && (
            <div className="flex flex-wrap gap-x-3 gap-y-1 border-t border-slate-100 pt-2 text-[11px] text-slate-500">
              {legend.map((l, i) => (
                <span key={i} className="inline-flex items-center gap-1">
                  <span className={`inline-block h-2.5 w-2.5 rounded-sm ${l.cls}`} />
                  {l.label}
                </span>
              ))}
            </div>
          )}
          {(data.warmup || data.stretch) && (
            <div className="flex gap-3 pt-1 text-xs text-slate-500">
              {data.warmup && <span>🔥 {t("strength.warmup")} ✓</span>}
              {data.stretch && <span>🧘 {t("strength.stretch")} ✓</span>}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
