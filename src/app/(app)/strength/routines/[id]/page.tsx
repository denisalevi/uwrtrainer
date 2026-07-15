import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/dal";
import { getServerT } from "@/lib/i18n/server";
import { prisma } from "@/lib/db";
import { parseRoutineExercises } from "@/lib/routines";
import { RoutineForm, RoutineDeleteButton } from "@/components/routine-form";

export default async function EditRoutinePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const { t } = await getServerT();

  // Only the owner edits a routine — teammates copy it instead (see-it → copy-it).
  const routine = await prisma.routine.findFirst({ where: { id, userId: user.id } });
  if (!routine) notFound();

  return (
    <div className="space-y-4">
      <Link href="/strength" className="text-sm text-slate-500 hover:text-slate-700">
        ← {t("strength.title")}
      </Link>
      <header>
        <h1 className="text-2xl font-bold text-slate-900">{t("routines.edit")}</h1>
        <p className="mt-1 text-sm text-slate-500">{t("routines.editorIntro")}</p>
      </header>
      <RoutineForm
        id={routine.id}
        initialName={routine.name}
        initialExercises={parseRoutineExercises(routine.exercises)}
      />
      <RoutineDeleteButton id={routine.id} />
    </div>
  );
}
