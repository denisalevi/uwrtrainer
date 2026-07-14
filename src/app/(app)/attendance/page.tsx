import Link from "next/link";
import { requireUser } from "@/lib/dal";
import { getServerT } from "@/lib/i18n/server";
import { prisma } from "@/lib/db";
import { isSlotAvailableOn } from "@/lib/practice-window";
import { TOURNAMENT_CATEGORY, tournamentLabel } from "@/lib/tournament";
import { AttendanceForm } from "@/components/attendance-form";

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ slot?: string; date?: string; edit?: string; mode?: string }>;
}) {
  const user = await requireUser();
  const { t } = await getServerT();
  const { slot, date, edit, mode } = await searchParams;
  const tournament = mode === "tournament";

  const [allSlots, members] = await Promise.all([
    tournament
      ? Promise.resolve([])
      : prisma.practiceSlot.findMany({
          where: { active: true, teamId: user.activeTeamId ?? "" },
          orderBy: { dayOfWeek: "asc" },
          select: { id: true, label: true, tier: true, dayOfWeek: true, validFrom: true, validTo: true },
        }),
    prisma.user.findMany({
      where: { memberships: { some: { teamId: user.activeTeamId ?? "" } } },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  // Only practices in season on the target date are offered for attendance (active is already
  // filtered in the query; the window narrows it further).
  const refDate =
    date && /^\d{4}-\d{2}-\d{2}$/.test(date)
      ? new Date(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)))
      : new Date();
  const slots = allSlots
    .filter((s) => isSlotAvailableOn({ active: true, validFrom: s.validFrom, validTo: s.validTo }, refDate))
    .map(({ id, label, tier, dayOfWeek }) => ({ id, label, tier, dayOfWeek }));

  // Edit mode (feed "Edit attendance" link): prefill the checkboxes with who is already
  // recorded as DONE for that slot+date (or the tournament on that date), and let the submit
  // reconcile removals too.
  const editMode = edit === "1" && (tournament || !!slot) && !!date && /^\d{4}-\d{2}-\d{2}$/.test(date);
  let initialPresentIds: string[] | undefined;
  let defaultLabel: string | undefined;
  if (editMode) {
    const [y, m, d] = date!.split("-").map(Number);
    const dayStart = new Date(y, m - 1, d);
    const dayEnd = new Date(y, m - 1, d + 1);
    const done = await prisma.sessionLog.findMany({
      where: tournament
        ? {
            category: TOURNAMENT_CATEGORY,
            status: "DONE",
            user: { memberships: { some: { teamId: user.activeTeamId ?? "" } } },
            date: { gte: dayStart, lt: dayEnd },
          }
        : {
            category: "RUGBY",
            status: "DONE",
            practiceSlotId: slot,
            date: { gte: dayStart, lt: dayEnd },
          },
      select: { userId: true, details: true },
    });
    initialPresentIds = done.map((l) => l.userId);
    if (tournament) defaultLabel = done.map((l) => tournamentLabel(l.details)).find(Boolean) ?? undefined;
  }

  return (
    <div className="space-y-5">
      <Link href="/feed" className="text-sm text-teal-700">
        ← {t("nav.feed")}
      </Link>
      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-slate-900">
          {t(tournament ? "tournament.title" : "attendance.title")}
        </h1>
        <p className="text-sm text-slate-500">
          {t(tournament ? "tournament.subtitle" : "attendance.subtitle")}
        </p>
      </div>
      <AttendanceForm
        slots={slots}
        members={members}
        currentUserId={user.id}
        defaultSlotId={slot}
        defaultDate={date}
        editMode={editMode}
        initialPresentIds={initialPresentIds}
        tournament={tournament}
        defaultLabel={defaultLabel}
      />
    </div>
  );
}
