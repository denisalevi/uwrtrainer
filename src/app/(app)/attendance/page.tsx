import Link from "next/link";
import { requireUser } from "@/lib/dal";
import { getServerT } from "@/lib/i18n/server";
import { prisma } from "@/lib/db";
import { AttendanceForm } from "@/components/attendance-form";

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ slot?: string; date?: string }>;
}) {
  const user = await requireUser();
  const { t } = await getServerT();
  const { slot, date } = await searchParams;

  const [slots, members] = await Promise.all([
    prisma.practiceSlot.findMany({
      where: { active: true },
      orderBy: { dayOfWeek: "asc" },
      select: { id: true, label: true, tier: true, dayOfWeek: true },
    }),
    prisma.user.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

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
      />
    </div>
  );
}
