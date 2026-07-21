import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/dal";
import { getServerT } from "@/lib/i18n/server";
import { findVisibleRoutine } from "@/lib/routine-visibility";
import {
  formatTargetSets,
  isRoutineLink,
  isRoutineRef,
  linkLabel,
  parseRoutineItems,
} from "@/lib/routines";
import { copyRoutine } from "@/app/actions/routines";
import { Badge, Button, Card, CardBody } from "@/components/ui";

/**
 * Read-only view of any routine the viewer may SEE (their own, a teammate's active one, or a
 * team-published one) — no copying required just to look at it. Linked from the team member
 * page, the feed and routine refs; owners get an edit link, everyone else a copy button.
 */
export default async function RoutineViewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await requireUser();
  const { t } = await getServerT();

  const routine = await findVisibleRoutine(viewer, id);
  if (!routine) notFound();
  const own = routine.userId === viewer.id;
  const items = parseRoutineItems(routine.exercises);

  return (
    <div className="space-y-4">
      <Link href="/strength" className="text-sm text-slate-500 hover:text-slate-700">
        ← {t("strength.title")}
      </Link>
      <header className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold text-slate-900">{routine.name}</h1>
          {routine.teamId && <Badge tone="teal">{t("routines.publishedBadge")}</Badge>}
          {!routine.active && <Badge tone="slate">{t("routines.archived")}</Badge>}
        </div>
        {!own && (
          <p className="text-sm text-slate-500">{t("routines.byAuthor", { name: routine.user.name })}</p>
        )}
      </header>

      <div className="flex flex-wrap items-center gap-2">
        {own ? (
          <Link href={`/strength/routines/${routine.id}`}>
            <Button type="button" variant="secondary" size="sm">
              ✏️ {t("common.edit")}
            </Button>
          </Link>
        ) : (
          <form action={copyRoutine}>
            <input type="hidden" name="id" value={routine.id} />
            <Button type="submit" variant="secondary" size="sm">
              ⧉ {t("routines.copyToMine")}
            </Button>
          </form>
        )}
      </div>

      <div className="space-y-3">
        {items.length === 0 && <p className="text-sm text-slate-500">{t("routines.empty")}</p>}
        {items.map((item, i) => (
          <Card key={i}>
            <CardBody className="space-y-1.5">
              {isRoutineRef(item) ? (
                <>
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/strength/routines/${item.routineId}/view`}
                      className="text-sm font-medium text-teal-700 underline decoration-dotted"
                    >
                      ↪ {item.name || t("routines.badge")}
                    </Link>
                    <Badge tone="slate">{t("routines.badge")}</Badge>
                  </div>
                  {item.note && <p className="text-xs text-slate-500">{item.note}</p>}
                </>
              ) : isRoutineLink(item) ? (
                <>
                  <div className="flex items-center gap-2">
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-medium text-teal-700 underline decoration-dotted"
                    >
                      🔗 {linkLabel(item)}
                    </a>
                    <Badge tone="slate">{t("routines.linkBadge")}</Badge>
                  </div>
                  {item.note && <p className="text-xs text-slate-500">{item.note}</p>}
                </>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-slate-800">{item.name}</span>
                    {item.tempo && (
                      <span className="text-xs text-slate-400 tabular-nums">
                        🕐 {t("routines.tempo")}: {item.tempo}
                      </span>
                    )}
                    {item.restSeconds != null && (
                      <span className="text-xs text-slate-400 tabular-nums">
                        ⏱ {item.restSeconds} {t("routines.secondsShort")}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {formatTargetSets(item).map((s, j) => (
                      <span
                        key={j}
                        className="rounded-md bg-slate-100 px-2 py-0.5 text-xs tabular-nums text-slate-700"
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                  {item.note && <p className="text-xs text-slate-500">{item.note}</p>}
                </>
              )}
            </CardBody>
          </Card>
        ))}
      </div>
    </div>
  );
}
