import Link from "next/link";
import { requireUser } from "@/lib/dal";
import { getServerT } from "@/lib/i18n/server";
import { prisma } from "@/lib/db";
import { AttendanceForm } from "@/components/attendance-form";

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ slot?: string; date?: string; edit?: string }>;
}) {
  const user = await requireUser();
  const { t } = await getServerT();
  const { slot, date, edit } = await searchParams;

  const [slots, members] = await Promise.all([
    prisma.practiceSlot.findMany({
      where: { active: true, teamId: user.activeTeamId ?? "" },
      orderBy: { dayOfWeek: "asc" },
      select: { id: true, label: true, tier: true, dayOfWeek: true },
    }),
    prisma.user.findMany({
      where: { memberships: { some: { teamId: user.activeTeamId ?? "" } } },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  // Edit mode (feed "Edit attendance" link): prefill the checkboxes with who is already
  // recorded as DONE for that slot+date, and let the submit reconcile removals too.
  const editMode = edit === "1" && !!slot && !!date && /^\d{4}-\d{2}-\d{2}$/.test(date);
  let initialPresentIds: string[] | undefined;
  if (editMode) {
    const [y, m, d] = date!.split("-").map(Number);
    const dayStart = new Date(y, m - 1, d);
    const dayEnd = new Date(y, m - 1, d + 1);
    const done = await prisma.sessionLog.findMany({
      where: {
        category: "RUGBY",
        status: "DONE",
        practiceSlotId: slot,
        date: { gte: dayStart, lt: dayEnd },
      },
      select: { userId: true },
    });
    initialPresentIds = done.map((l) => l.userId);
  }

  return (
    <div className="space-y-5">
      <Link href="/feed" className="text-sm text-teal-700">
        ← {t("nav.feed")}
      </Link>
      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-slate-900">{t("attendance.title")}</h1>
        <p className="text-sm text-slate-500">{t("attendance.subtitle")}</p>
      </div>
      <AttendanceForm
        slots={slots}
        members={members}
        currentUserId={user.id}
        defaultSlotId={slot}
        defaultDate={date}
        editMode={editMode}
        initialPresentIds={initialPresentIds}
      />
    </div>
  );
}
