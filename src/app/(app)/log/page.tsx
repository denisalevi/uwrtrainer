import { requireUser } from "@/lib/dal";
import { getServerT } from "@/lib/i18n/server";
import { prisma } from "@/lib/db";
import { LogForm } from "@/components/log-form";

export default async function LogPage() {
  await requireUser();
  const { t } = await getServerT();

  const slots = await prisma.practiceSlot.findMany({
    where: { active: true },
    orderBy: { dayOfWeek: "asc" },
    select: { id: true, label: true, tier: true },
  });

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-slate-900">{t("log.title")}</h1>
      <LogForm slots={slots} />
    </div>
  );
}
