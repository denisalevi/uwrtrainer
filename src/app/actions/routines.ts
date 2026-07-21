"use server";

// Custom workout routines — CRUD, duplicate, teammate copy and trainer team-publishing
// (docs/plans/custom-routines.md). Server Actions are public endpoints: every mutation
// re-checks ownership/visibility here, never relying on UI gating.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser, requireTrainer } from "@/lib/dal";
import { getServerT } from "@/lib/i18n/server";
import { findVisibleRoutine } from "@/lib/routine-visibility";
import {
  isRoutineRef,
  normalizeItems,
  parseRoutineItems,
  remapRoutineRefs,
  RoutineItemsSchema,
  RoutineNameSchema,
  type RoutineItem,
} from "@/lib/routines";

/** Load a routine the caller owns (throws if missing / not theirs). */
async function requireOwnRoutine(userId: string, routineId: string) {
  const routine = await prisma.routine.findFirst({ where: { id: routineId, userId } });
  if (!routine) throw new Error("Routine not found");
  return routine;
}

/** Parse + validate the editor's payload (name + items JSON). Throws on invalid input. */
function readRoutinePayload(formData: FormData): { name: string; items: RoutineItem[] } {
  const name = RoutineNameSchema.parse(String(formData.get("name") ?? ""));
  const raw = String(formData.get("exercises") ?? "");
  if (raw.length > 20000) throw new Error("Routine too large");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Invalid exercises");
  }
  return { name, items: normalizeItems(RoutineItemsSchema.parse(parsed)) };
}

/**
 * Routine refs may only point at routines the caller OWNS (a ref to someone else's would break
 * the moment they archive it — copying snapshots instead, see copyRoutine). Non-owned/vanished
 * refs and self-references are dropped; surviving refs get their name re-snapshotted from the DB.
 */
async function resolveOwnRefs(
  userId: string,
  items: RoutineItem[],
  selfId: string | null,
): Promise<RoutineItem[]> {
  const ids = [...new Set(items.filter(isRoutineRef).map((r) => r.routineId))];
  if (ids.length === 0) return items;
  const owned = await prisma.routine.findMany({
    where: { id: { in: ids }, userId },
    select: { id: true, name: true },
  });
  const names = new Map(owned.map((r) => [r.id, r.name]));
  return items.flatMap((item): RoutineItem[] => {
    if (!isRoutineRef(item)) return [item];
    if (item.routineId === selfId) return [];
    const name = names.get(item.routineId);
    return name ? [{ ...item, name }] : [];
  });
}

/** Create (no id) or update (id) a routine from the editor form, then return to the hub. */
export async function saveRoutine(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const id = String(formData.get("id") ?? "");
  const payload = readRoutinePayload(formData);
  const items = await resolveOwnRefs(user.id, payload.items, id || null);
  if (items.length === 0) throw new Error("Invalid exercises");
  const data = { name: payload.name, exercises: JSON.stringify(items) };

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
 * DEEP also across routine refs: a referenced routine the caller can see (but doesn't own)
 * is copied too and the ref repointed to the copy, so the result stays self-contained when
 * the original is later archived. Refs to the caller's own routines are kept as-is; refs the
 * caller can't see stay pointing at the original (they render as unavailable).
 */
export async function copyRoutine(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const source = await findVisibleRoutine(user, String(formData.get("id") ?? ""));
  if (!source) throw new Error("Routine not found");
  const { t } = await getServerT();

  const items = parseRoutineItems(source.exercises);
  const map: Record<string, string> = {};
  for (const refId of new Set(items.filter(isRoutineRef).map((r) => r.routineId))) {
    const sub = await findVisibleRoutine(user, refId);
    if (!sub) continue;
    if (sub.userId === user.id) continue; // already the caller's — the ref stays live
    const copy = await prisma.routine.create({
      data: { userId: user.id, name: sub.name, exercises: sub.exercises, copiedFromId: sub.id },
    });
    map[refId] = copy.id;
  }
  const exercises = Object.keys(map).length
    ? JSON.stringify(remapRoutineRefs(items, map))
    : source.exercises;

  // A self-duplicate needs a distinguishing name; a teammate copy keeps the original name.
  const name =
    source.userId === user.id ? `${source.name} (${t("routines.copySuffix")})`.slice(0, 60) : source.name;
  await prisma.routine.create({
    data: {
      userId: user.id,
      name,
      exercises,
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
