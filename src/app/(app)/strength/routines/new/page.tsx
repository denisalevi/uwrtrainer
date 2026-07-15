import Link from "next/link";
import { requireUser } from "@/lib/dal";
import { getServerT } from "@/lib/i18n/server";
import { RoutineForm } from "@/components/routine-form";

export default async function NewRoutinePage() {
  await requireUser();
  const { t } = await getServerT();
  return (
    <div className="space-y-4">
      <Link href="/strength" className="text-sm text-slate-500 hover:text-slate-700">
        ← {t("strength.title")}
      </Link>
      <header>
        <h1 className="text-2xl font-bold text-slate-900">{t("routines.new")}</h1>
        <p className="mt-1 text-sm text-slate-500">{t("routines.editorIntro")}</p>
      </header>
      <RoutineForm initialName="" initialExercises={[]} />
    </div>
  );
}
