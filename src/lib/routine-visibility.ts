// Shared routine visibility rule (see-it → copy-it, docs/plans/custom-routines.md), used by
// both the server actions (copy) and the read-only routine view page.

import { prisma } from "@/lib/db";
import type { CurrentUser } from "@/lib/dal";

/**
 * Load a routine the viewer may SEE: their own always; someone else's only while ACTIVE and
 * either published to one of the viewer's teams or owned by a teammate. Returns null otherwise.
 */
export async function findVisibleRoutine(viewer: CurrentUser, routineId: string) {
  const routine = await prisma.routine.findUnique({
    where: { id: routineId },
    include: { user: { select: { name: true, memberships: { select: { teamId: true } } } } },
  });
  if (!routine) return null;
  if (routine.userId === viewer.id) return routine;
  if (!routine.active) return null;
  const publishedToMyTeam = routine.teamId != null && viewer.teamIds.includes(routine.teamId);
  const ownerSharesTeam = routine.user.memberships.some((m) => viewer.teamIds.includes(m.teamId));
  return publishedToMyTeam || ownerSharesTeam ? routine : null;
}
