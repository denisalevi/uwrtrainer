import Link from "next/link";
import { requireUser } from "@/lib/dal";
import { getServerT } from "@/lib/i18n/server";
import { prisma } from "@/lib/db";
import { SETTING_INCLUDE_PULL, DEFAULT_INCLUDE_PULL } from "@/lib/constants";
import { StrengthWizard } from "@/components/strength-wizard";
import { StrengthProgramView } from "@/components/strength-program";

export default async function StrengthPage() {
  const user = await requireUser();
  const { t } = await getServerT();

  const [program, pullSetting] = await Promise.all([
    prisma.strengthProgram.findFirst({
      where: { userId: user.id, active: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.setting.findUnique({ where: { key: SETTING_INCLUDE_PULL } }),
  ]);
  const includePull = pullSetting ? pullSetting.value !== "false" : DEFAULT_INCLUDE_PULL;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Link href="/plan" className="text-sm text-slate-500 hover:text-slate-700">
          ← {t("strength.backToPlan")}
        </Link>
        <Link href="/settings" className="text-sm text-slate-500 hover:text-slate-700">
          ⚙️ {t("nav.settings")}
        </Link>
      </div>
      <header>
        <h1 className="text-2xl font-bold text-slate-900">{t("strength.title")}</h1>
        <p className="mt-1 text-sm text-slate-500">{t("strength.intro")}</p>
      </header>
      {program && program.days && program.days !== "[]" ? (
        <StrengthProgramView program={program} includePull={includePull} />
      ) : (
        <StrengthWizard includePull={includePull} />
      )}
    </div>
  );
}
