import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/dal";
import { getServerT } from "@/lib/i18n/server";
import { prisma } from "@/lib/db";
import { parseRoutineItems } from "@/lib/routines";
import { RoutineForm, RoutineDeleteButton } from "@/components/routine-form";

export default async function EditRoutinePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const { t } = await getServerT();

  // Only the owner edits a routine — teammates copy it instead (see-it → copy-it).
  const [routine, ownRoutines] = await Promise.all([
    prisma.routine.findFirst({ where: { id, userId: user.id } }),
    // Nested-routine picker: other ACTIVE own routines (a ref to an archived one would be
    // invisible to teammates); the routine itself is excluded to avoid self-reference.
    prisma.routine.findMany({
      where: { userId: user.id, active: true, NOT: { id } },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true },
    }),
  ]);
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
        initialItems={parseRoutineItems(routine.exercises)}
        routineOptions={ownRoutines}
      />
      <RoutineDeleteButton id={routine.id} />
    </div>
  );
}
