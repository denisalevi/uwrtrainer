import { getServerT } from "@/lib/i18n/server";
import { Card, CardBody } from "@/components/ui";

type ViewSet = { weight: number | null; reps: number | null; amrap?: boolean };
type ViewExercise = { name?: string; done?: boolean; trainingMax?: number; sets?: ViewSet[] };
type ViewDetails = {
  kind?: string;
  dayName?: string;
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

/**
 * Read-only display of a saved STRENGTH workout (`details` JSON of shape
 * { kind, dayName, warmup, stretch, exercises:[{ name, done, sets:[{ weight, reps }] }] }).
 * Accepts either the raw JSON string or a parsed object. Handles malformed/empty input.
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

  return (
    <div className="space-y-2">
      {data.dayName && (
        <p className="text-sm font-medium text-slate-800">{data.dayName}</p>
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
                        className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-600"
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
