import Link from "next/link";
import { requireUser } from "@/lib/dal";
import { getServerT } from "@/lib/i18n/server";
import { PlanEditor } from "@/components/plan-editor";

export default async function PlanPage() {
  const user = await requireUser();
  const { t } = await getServerT();
  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">{t("plan.title")}</h1>
        <p className="mt-1 text-sm text-slate-500">{t("plan.intro")}</p>
      </header>
      <PlanEditor userId={user.id} />
      <Link
        href="/strength"
        className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
      >
        <span>
          <span className="block font-semibold text-slate-900">💪 {t("strength.title")}</span>
          <span className="mt-0.5 block text-sm text-slate-500">{t("strength.intro")}</span>
        </span>
        <span className="text-slate-400">›</span>
      </Link>
    </div>
  );
}
