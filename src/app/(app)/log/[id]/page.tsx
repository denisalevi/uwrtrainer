import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/dal";
import { getServerT } from "@/lib/i18n/server";
import { prisma } from "@/lib/db";
import { isTrainer, type Category, type SessionStatus } from "@/lib/constants";
import { LogForm, type ExistingSession } from "@/components/log-form";

export default async function EditLogPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const { t } = await getServerT();

  const log = await prisma.sessionLog.findUnique({ where: { id } });
  if (!log) notFound();
  if (log.userId !== user.id && !isTrainer(user.role)) notFound();

  // A logged strength workout is edited in the full-session logger, not the generic form.
  if (log.category === "STRENGTH" && log.status === "DONE") redirect(`/strength/log?id=${log.id}`);

  // Auto rows (auto-MISSED penalties) are system-owned and not editable — resolve them from the
  // dashboard ("Add yourself" / "Log the session" / "Give a reason") instead.
  if (log.auto) redirect("/dashboard");

  const slots = await prisma.practiceSlot.findMany({
    where: { active: true },
    orderBy: { dayOfWeek: "asc" },
    select: { id: true, label: true, tier: true },
  });

  // Corrupt details JSON must not 500 the edit page — fall back to an empty payload.
  let details: Record<string, unknown> = {};
  if (log.details) {
    try {
      details = JSON.parse(log.details) as Record<string, unknown>;
    } catch {
      details = {};
    }
  }
  const existing: ExistingSession = {
    id: log.id,
    category: log.category as Category,
    status: log.status as SessionStatus,
    date: log.date.toISOString().slice(0, 10),
    durationMin: log.durationMin,
    practiceSlotId: log.practiceSlotId,
    missReason: log.missReason,
    zone: (details.zone as string) ?? null,
    note: (details.note as string) ?? null,
  };

  return (
    <div className="space-y-5">
      <Link href="/dashboard" className="text-sm text-slate-500">
        ← {t("common.back")}
      </Link>
      <h1 className="text-2xl font-bold text-slate-900">{t("log.edit")}</h1>
      <LogForm slots={slots} existing={existing} />
    </div>
  );
}
