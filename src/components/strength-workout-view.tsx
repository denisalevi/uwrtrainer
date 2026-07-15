import { getServerT } from "@/lib/i18n/server";
import { getCurrentUser } from "@/lib/dal";
import { prisma } from "@/lib/db";
import { copyRoutine } from "@/app/actions/routines";
import { Card, CardBody, Button } from "@/components/ui";

type SetKind = "warmup" | "main" | "bbb";
type ViewSet = {
  weight: number | null;
  reps: number | null;
  seconds?: number | null;
  amrap?: boolean;
  kind?: SetKind;
};
type ViewExercise = {
  name?: string;
  done?: boolean;
  trainingMax?: number;
  week?: number;
  cycle?: number;
  tempo?: string;
  sets?: ViewSet[];
};
type ViewDetails = {
  kind?: string;
  dayName?: string;
  routineId?: string;
  routineName?: string;
  cycle?: number;
  week?: number;
  warmup?: boolean;
  stretch?: boolean;
  notes?: string;
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
  // Timed sets (custom-routine SECONDS/KG_SECONDS): the seconds ARE the logged value —
  // "30 s" for a plank, "24 × 40 s" for a weighted carry.
  if (s.seconds != null) {
    const sec = `${s.seconds} s`;
    return w != null ? `${w} × ${sec}` : sec;
  }
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

  // See-it → copy-it: a session logged from a routine records routineId — viewers who don't
  // own that routine (and can still see it: active + teammate/team-published) get a copy
  // button right here. getCurrentUser is request-cached, so this is cheap.
  let copyable: { id: string; name: string } | null = null;
  if (data?.routineId && typeof data.routineId === "string") {
    const [viewer, routine] = await Promise.all([
      getCurrentUser(),
      prisma.routine.findUnique({
        where: { id: data.routineId },
        select: {
          id: true,
          name: true,
          active: true,
          userId: true,
          teamId: true,
          user: { select: { memberships: { select: { teamId: true } } } },
        },
      }),
    ]);
    if (
      viewer &&
      routine &&
      routine.active &&
      routine.userId !== viewer.id &&
      ((routine.teamId != null && viewer.teamIds.includes(routine.teamId)) ||
        routine.user.memberships.some((m) => viewer.teamIds.includes(m.teamId)))
    ) {
      copyable = { id: routine.id, name: routine.name };
    }
  }
  const exercises = Array.isArray(data?.exercises) ? data!.exercises : [];
  const notes = typeof data?.notes === "string" ? data.notes.trim() : "";

  if (!data || (exercises.length === 0 && !notes)) {
    return <p className="text-sm text-slate-500">{t("team.noWorkoutDetail")}</p>;
  }

  // A notes-only session (started empty, described in text) still deserves a card.
  if (exercises.length === 0) {
    return (
      <Card>
        <CardBody>
          <p className="whitespace-pre-wrap text-sm text-slate-600">{notes}</p>
        </CardBody>
      </Card>
    );
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
  // Routine sessions never have a 5/3/1 position — the program's legacy pointer is noise there.
  const hasPerLift = exercises.some((ex) => liftPos(ex) != null);
  const cycleWeek = hasPerLift || data.routineName
    ? ""
    : [
        data.cycle != null ? `${t("strength.cycle")} ${data.cycle}` : null,
        data.week != null ? t("strength.weekN", { n: data.week }) : null,
      ]
        .filter(Boolean)
        .join(" · ");

  return (
    <div className="space-y-2">
      {(data.dayName || cycleWeek || data.routineName) && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          {data.dayName && (
            <span className="text-sm font-medium text-slate-800">{data.dayName}</span>
          )}
          {data.routineName && (
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
              {t("routines.badge")}
            </span>
          )}
          {cycleWeek && <span className="text-xs text-slate-500">{cycleWeek}</span>}
          {copyable && (
            <form action={copyRoutine}>
              <input type="hidden" name="id" value={copyable.id} />
              <Button type="submit" variant="ghost" size="sm">
                ⧉ {t("routines.copyToMine")}
              </Button>
            </form>
          )}
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
                  {ex.tempo && (
                    <span className="text-xs text-slate-400 tabular-nums">@ {ex.tempo}</span>
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
          {notes && (
            <p className="whitespace-pre-wrap border-t border-slate-100 pt-2 text-xs text-slate-600">
              {notes}
            </p>
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
