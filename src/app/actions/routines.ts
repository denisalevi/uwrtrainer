"use server";

// Custom workout routines — CRUD, duplicate, teammate copy and trainer team-publishing
// (docs/plans/custom-routines.md). Server Actions are public endpoints: every mutation
// re-checks ownership/visibility here, never relying on UI gating.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser, requireTrainer, type CurrentUser } from "@/lib/dal";
import { getServerT } from "@/lib/i18n/server";
import {
  normalizeExercises,
  RoutineExercisesSchema,
  RoutineNameSchema,
} from "@/lib/routines";

/** Load a routine the caller owns (throws if missing / not theirs). */
async function requireOwnRoutine(userId: string, routineId: string) {
  const routine = await prisma.routine.findFirst({ where: { id: routineId, userId } });
  if (!routine) throw new Error("Routine not found");
  return routine;
}

/**
 * Visibility rule for copying (see-it → copy-it): your own routines always; someone else's
 * only while ACTIVE and either published to one of your teams or owned by a teammate.
 */
async function findVisibleRoutine(viewer: CurrentUser, routineId: string) {
  const routine = await prisma.routine.findUnique({
    where: { id: routineId },
    include: { user: { select: { memberships: { select: { teamId: true } } } } },
  });
  if (!routine) return null;
  if (routine.userId === viewer.id) return routine;
  if (!routine.active) return null;
  const publishedToMyTeam = routine.teamId != null && viewer.teamIds.includes(routine.teamId);
  const ownerSharesTeam = routine.user.memberships.some((m) => viewer.teamIds.includes(m.teamId));
  return publishedToMyTeam || ownerSharesTeam ? routine : null;
}

/** Parse + validate the editor's payload (name + exercises JSON). Throws on invalid input. */
function readRoutinePayload(formData: FormData): { name: string; exercises: string } {
  const name = RoutineNameSchema.parse(String(formData.get("name") ?? ""));
  const raw = String(formData.get("exercises") ?? "");
  if (raw.length > 20000) throw new Error("Routine too large");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Invalid exercises");
  }
  const exercises = normalizeExercises(RoutineExercisesSchema.parse(parsed));
  return { name, exercises: JSON.stringify(exercises) };
}

/** Create (no id) or update (id) a routine from the editor form, then return to the hub. */
export async function saveRoutine(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const id = String(formData.get("id") ?? "");
  const data = readRoutinePayload(formData);

  if (id) {
    await requireOwnRoutine(user.id, id);
    await prisma.routine.update({ where: { id }, data });
  } else {
    await prisma.routine.create({ data: { ...data, userId: user.id } });
  }
  revalidatePath("/strength");
  redirect("/strength");
}

export async function deleteRoutine(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const routine = await requireOwnRoutine(user.id, String(formData.get("id") ?? ""));
  await prisma.routine.delete({ where: { id: routine.id } });
  revalidatePath("/strength");
  redirect("/strength");
}

/** Archive/unarchive: inactive routines leave the log picker and stop being visible to others. */
export async function setRoutineActive(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const routine = await requireOwnRoutine(user.id, String(formData.get("id") ?? ""));
  const active = String(formData.get("active")) === "true";
  await prisma.routine.update({ where: { id: routine.id }, data: { active } });
  revalidatePath("/strength");
}

/**
 * Copy a visible routine into the caller's own list — used both for "duplicate my routine"
 * and for "copy a teammate's / team routine". Deep snapshot, provenance only (no live link).
 */
export async function copyRoutine(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const source = await findVisibleRoutine(user, String(formData.get("id") ?? ""));
  if (!source) throw new Error("Routine not found");
  const { t } = await getServerT();
  // A self-duplicate needs a distinguishing name; a teammate copy keeps the original name.
  const name =
    source.userId === user.id ? `${source.name} (${t("routines.copySuffix")})`.slice(0, 60) : source.name;
  await prisma.routine.create({
    data: {
      userId: user.id,
      name,
      exercises: source.exercises,
      copiedFromId: source.id,
    },
  });
  revalidatePath("/strength");
  // Copying can happen from the team/feed pages too — send the copier to their routines.
  redirect("/strength");
}

/**
 * Trainer-only: publish one of your routines to your active team (it appears in everyone's
 * "team routines" log-picker group and on the strength hub), or take it back.
 */
export async function setRoutinePublished(formData: FormData) {
  const trainer = await requireTrainer();
  const routine = await requireOwnRoutine(trainer.id, String(formData.get("id") ?? ""));
  const publish = String(formData.get("publish")) === "true";
  if (publish && !trainer.activeTeamId) throw new Error("No active team");
  await prisma.routine.update({
    where: { id: routine.id },
    data: { teamId: publish ? trainer.activeTeamId : null },
  });
  revalidatePath("/strength");
}

/**
 * Pause/resume the 5/3/1 program: paused keeps all state and stays on the hub with a
 * "resume" control, but its plan days disappear from the log picker. (Distinct from the
 * full reset, which deactivates the program and brings the setup wizard back.)
 */
export async function setStrengthProgramPaused(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const programId = String(formData.get("programId") ?? "");
  const paused = String(formData.get("paused")) === "true";
  const program = await prisma.strengthProgram.findFirst({ where: { id: programId, userId: user.id } });
  if (!program) throw new Error("Program not found");
  await prisma.strengthProgram.update({ where: { id: program.id }, data: { paused } });
  revalidatePath("/strength");
}
