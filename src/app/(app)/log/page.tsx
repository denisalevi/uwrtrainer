import Link from "next/link";
import { requireUser } from "@/lib/dal";
import { getServerT } from "@/lib/i18n/server";
import { prisma } from "@/lib/db";
import { LogForm } from "@/components/log-form";
import { CATEGORIES, type Category } from "@/lib/constants";

export default async function LogPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; date?: string }>;
}) {
  const user = await requireUser();
  const { t } = await getServerT();
  const { category, date } = await searchParams;

  const slots = await prisma.practiceSlot.findMany({
    where: { active: true, teamId: user.activeTeamId ?? "" },
    orderBy: { dayOfWeek: "asc" },
    select: { id: true, label: true, tier: true },
  });

  // "Log the session" deep-links from a count-shortfall row carry the category + a date in that
  // week so the logger opens prefilled (status defaults to DONE so logging clears the shortfall).
  const defaultCategory =
    category && (CATEGORIES as readonly string[]).includes(category)
      ? (category as Category)
      : undefined;
  const defaultDate = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined;

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-slate-900">{t("log.title")}</h1>
      <Link
        href="/attendance"
        className="flex items-center justify-between rounded-xl border border-teal-600 bg-teal-50 px-3 py-3 text-sm font-medium text-teal-800"
      >
        <span>🏉 {t("log.teamPractice")}</span>
        <span>›</span>
      </Link>
      <LogForm slots={slots} defaultCategory={defaultCategory} defaultDate={defaultDate} />
    </div>
  );
}
