import Link from "next/link";
import { requireUser } from "@/lib/dal";
import { getServerT } from "@/lib/i18n/server";
import { prisma } from "@/lib/db";
import { StrengthWizard } from "@/components/strength-wizard";
import { isWeightRoundingMode, type RoundingPref } from "@/lib/strength";
import { StrengthProgramView } from "@/components/strength-program";

export default async function StrengthPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const { t } = await getServerT();

  const { week: weekParam } = await searchParams;
  const rawWeek = Array.isArray(weekParam) ? weekParam[0] : weekParam;
  // Up to 8: a single rotating weighted day cycles over 8 program weeks (the program view
  // ignores previews beyond its own cycle length).
  const parsedWeek = Math.trunc(Number(rawWeek));
  const previewWeek =
    rawWeek != null && Number.isFinite(parsedWeek) && parsedWeek >= 1 && parsedWeek <= 8
      ? parsedWeek
      : undefined;

  const program = await prisma.strengthProgram.findFirst({
    where: { userId: user.id, active: true },
    orderBy: { createdAt: "desc" },
  });
  const pulls = { pullups: user.strengthPullups, rows: user.strengthRows };
  const rounding: RoundingPref = {
    mode: isWeightRoundingMode(user.weightRounding) ? user.weightRounding : "DOWN",
    increment: user.weightIncrement > 0 ? user.weightIncrement : 2.5,
  };

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
        {rounding.mode === "EXACT" && (
          <p className="mt-1 text-xs text-slate-400">{t("strength.exactNote")}</p>
        )}
      </header>
      {program && program.days && program.days !== "[]" ? (
        <StrengthProgramView program={program} pulls={pulls} previewWeek={previewWeek} rounding={rounding} />
      ) : (
        <StrengthWizard pulls={pulls} />
      )}
    </div>
  );
}
