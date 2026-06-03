import { requireUser } from "@/lib/dal";
import { getServerT } from "@/lib/i18n/server";
import { prisma } from "@/lib/db";
import { LogForm } from "@/components/log-form";

export default async function LogPage() {
  const user = await requireUser();
  const { t } = await getServerT();

  const [slots, program] = await Promise.all([
    prisma.practiceSlot.findMany({
      where: { active: true },
      orderBy: { dayOfWeek: "asc" },
      select: { id: true, label: true, tier: true },
    }),
    prisma.strengthProgram.findFirst({
      where: { userId: user.id, active: true },
      select: { days: true },
    }),
  ]);

  const hasProgram = !!program && !!program.days && program.days !== "[]";

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-slate-900">{t("log.title")}</h1>
      <LogForm slots={slots} hasProgram={hasProgram} />
    </div>
  );
}
