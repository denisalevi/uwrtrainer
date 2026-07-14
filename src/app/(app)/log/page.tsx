import Link from "next/link";
import { requireUser } from "@/lib/dal";
import { getServerT } from "@/lib/i18n/server";
import { prisma } from "@/lib/db";
import { isSlotAvailableOn } from "@/lib/practice-window";
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

  // "Log the session" deep-links from a count-shortfall row carry the category + a date in that
  // week so the logger opens prefilled (status defaults to DONE so logging clears the shortfall).
  const defaultCategory =
    category && (CATEGORIES as readonly string[]).includes(category)
      ? (category as Category)
      : undefined;
  const defaultDate = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined;

  const allSlots = await prisma.practiceSlot.findMany({
    where: { active: true, teamId: user.activeTeamId ?? "" },
    orderBy: { dayOfWeek: "asc" },
    select: { id: true, label: true, tier: true, validFrom: true, validTo: true },
  });

  // An unfinished strength draft from today (#33): autosaved but never "finished" — offer to
  // continue it (the persistent timer bar links here too, but this also covers a fresh device).
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const tomorrow = new Date(todayStart);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const draft = await prisma.sessionLog.findFirst({
    where: {
      userId: user.id,
      category: "STRENGTH",
      status: "DONE",
      auto: false,
      progressionApplied: false,
      date: { gte: todayStart, lt: tomorrow },
    },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  // Only practices in season on the target date (the prefilled date, else today) are offered.
  const refDate = defaultDate
    ? new Date(
        Number(defaultDate.slice(0, 4)),
        Number(defaultDate.slice(5, 7)) - 1,
        Number(defaultDate.slice(8, 10)),
      )
    : new Date();
  const slots = allSlots
    .filter((s) => isSlotAvailableOn({ active: true, validFrom: s.validFrom, validTo: s.validTo }, refDate))
    .map(({ id, label, tier }) => ({ id, label, tier }));

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-slate-900">{t("log.title")}</h1>
      {draft && (
        <Link
          href={`/strength/log?id=${draft.id}`}
          className="flex items-center justify-between rounded-xl border border-teal-600 bg-white px-3 py-3 text-sm font-medium text-teal-800"
        >
          <span>⏱ {t("log.resumeWorkout")}</span>
          <span>›</span>
        </Link>
      )}
      <Link
        href="/attendance"
        className="flex items-center justify-between rounded-xl border border-teal-600 bg-teal-50 px-3 py-3 text-sm font-medium text-teal-800"
      >
        <span>🏉 {t("log.teamPractice")}</span>
        <span>›</span>
      </Link>
      <Link
        href="/attendance?mode=tournament"
        className="flex items-center justify-between rounded-xl border border-amber-500 bg-amber-50 px-3 py-3 text-sm font-medium text-amber-800"
      >
        <span>🏆 {t("log.tournament")}</span>
        <span>›</span>
      </Link>
      <LogForm slots={slots} defaultCategory={defaultCategory} defaultDate={defaultDate} />
    </div>
  );
}
