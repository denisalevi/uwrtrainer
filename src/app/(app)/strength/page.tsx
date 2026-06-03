import { requireUser } from "@/lib/dal";
import { getServerT } from "@/lib/i18n/server";
import { prisma } from "@/lib/db";
import { StrengthWizard } from "@/components/strength-wizard";
import { StrengthProgramView } from "@/components/strength-program";

export default async function StrengthPage() {
  const user = await requireUser();
  const { t } = await getServerT();

  const program = await prisma.strengthProgram.findFirst({
    where: { userId: user.id, active: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">{t("strength.title")}</h1>
        <p className="mt-1 text-sm text-slate-500">{t("strength.intro")}</p>
      </header>
      {program ? <StrengthProgramView program={program} /> : <StrengthWizard />}
    </div>
  );
}
