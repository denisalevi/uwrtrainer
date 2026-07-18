"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/dal";
import {
  isTrainer,
  PRACTICE_TIERS,
  LEADERBOARD_VISIBILITY,
} from "@/lib/constants";
import { TOURNAMENT_EXEMPTION_KEY, isTournamentExemption } from "@/lib/tournament";

async function requireTrainerAction() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isTrainer(user.role)) throw new Error("Not authorized");
  return user;
}

// A yyyy-mm-dd form value, or null when blank/malformed.
const DateStr = z
  .string()
  .optional()
  .transform((s) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null));

const SlotSchema = z.object({
  label: z.string().min(1).max(80).trim(),
  dayOfWeek: z.coerce.number().int().min(0).max(6),
  time: z.string().max(10).optional(),
  tier: z.enum(PRACTICE_TIERS),
  validFrom: DateStr,
  validTo: DateStr,
});

/** Parse a yyyy-mm-dd string into a local-midnight Date (matches how availability is compared). */
function toLocalDate(s: string | null): Date | null {
  if (!s) return null;
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Shared create/update payload from the validated slot form. */
function slotData(parsed: z.infer<typeof SlotSchema>) {
  return {
    label: parsed.label,
    dayOfWeek: parsed.dayOfWeek,
    tier: parsed.tier,
    time: parsed.time || null,
    validFrom: toLocalDate(parsed.validFrom),
    validTo: toLocalDate(parsed.validTo),
  };
}

export async function addSlot(formData: FormData) {
  const user = await requireTrainerAction();
  const parsed = SlotSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error("Invalid practice");
  if (!user.activeTeamId) throw new Error("No active team");
  await prisma.practiceSlot.create({
    data: { ...slotData(parsed.data), teamId: user.activeTeamId },
  });
  revalidatePath("/settings");
}

export async function updateSlot(formData: FormData) {
  const user = await requireTrainerAction();
  const slotId = formData.get("slotId") as string;
  if (!slotId) throw new Error("Invalid practice");
  const parsed = SlotSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error("Invalid practice");
  await prisma.practiceSlot.update({
    where: { id: slotId, teamId: user.activeTeamId ?? undefined },
    data: slotData(parsed.data),
  });
  revalidatePath("/settings");
}

/**
 * Delete a practice slot. Only allowed while nothing references it (no plan items, no logged
 * sessions) — the UI hides the button otherwise; deactivating is the tool for retired slots.
 */
export async function deleteSlot(formData: FormData) {
  const user = await requireTrainerAction();
  const id = formData.get("slotId") as string;
  if (!id) throw new Error("Invalid practice");
  const slot = await prisma.practiceSlot.findFirst({
    where: { id, teamId: user.activeTeamId ?? "" },
    include: { _count: { select: { planItems: true, sessionLogs: true } } },
  });
  if (!slot) throw new Error("Invalid practice");
  if (slot._count.planItems > 0 || slot._count.sessionLogs > 0)
    throw new Error("Practice has history — deactivate it instead");
  await prisma.practiceSlot.delete({ where: { id } });
  revalidatePath("/settings");
}

export async function setSlotActive(formData: FormData) {
  const user = await requireTrainerAction();
  const id = formData.get("slotId") as string;
  const active = formData.get("active") === "true";
  await prisma.practiceSlot.update({
    where: { id, teamId: user.activeTeamId ?? undefined },
    data: { active },
  });
  revalidatePath("/settings");
}

export async function updateLeaderboards(formData: FormData) {
  await requireTrainerAction();
  const boards = await prisma.leaderboard.findMany();
  await prisma.$transaction(
    boards.map((b) => {
      const enabled = formData.get(`enabled_${b.id}`) === "on";
      const vis = formData.get(`visibility_${b.id}`) as string;
      const visibility = (LEADERBOARD_VISIBILITY as readonly string[]).includes(vis)
        ? vis
        : b.visibility;
      return prisma.leaderboard.update({ where: { id: b.id }, data: { enabled, visibility } });
    }),
  );
  revalidatePath("/settings");
  revalidatePath("/leaderboards");
  redirect("/settings");
}

/**
 * Team-wide tournament exemption (#31): how much a logged tournament / league game pauses the
 * selected players' weekly goals — nothing, the week of the game, or that week plus the next.
 */
export async function setTournamentExemption(formData: FormData) {
  await requireTrainerAction();
  const v = String(formData.get("tournamentExemption") ?? "");
  if (!isTournamentExemption(v)) throw new Error("Invalid setting");
  await prisma.setting.upsert({
    where: { key: TOURNAMENT_EXEMPTION_KEY },
    create: { key: TOURNAMENT_EXEMPTION_KEY, value: v },
    update: { value: v },
  });
  revalidatePath("/settings");
  revalidatePath("/dashboard");
  revalidatePath("/leaderboards");
  redirect("/settings");
}

const RoleSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(["PLAYER", "TRAINER"]),
});

export async function setRole(formData: FormData) {
  await requireTrainerAction();
  const parsed = RoleSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error("Invalid role");
  const target = await prisma.user.findUnique({ where: { id: parsed.data.userId } });
  if (!target || target.role === "ADMIN") throw new Error("Cannot change this user");
  await prisma.user.update({ where: { id: parsed.data.userId }, data: { role: parsed.data.role } });
  revalidatePath(`/team/${parsed.data.userId}`);
  revalidatePath("/team");
}

const RosterMemberSchema = z.object({ name: z.string().min(2).max(80).trim() });

/**
 * Create an account-less roster member (no email/password) in the trainer's active team.
 * They appear on rosters/attendance immediately and can be claimed at signup later.
 */
export async function addRosterMember(formData: FormData) {
  const user = await requireTrainerAction();
  if (!user.activeTeamId) throw new Error("No active team");
  const parsed = RosterMemberSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error("Invalid name");
  await prisma.user.create({
    data: {
      name: parsed.data.name,
      role: "PLAYER",
      memberships: { create: { teamId: user.activeTeamId } },
      activeTeamId: user.activeTeamId,
    },
  });
  revalidatePath("/team");
  revalidatePath("/attendance");
}

const TeamSchema = z.object({
  name: z.string().min(2).max(80).trim(),
  registrationCode: z.string().max(80).trim().optional(),
});

/** Admin: create a new team (optionally with a registration code). */
export async function createTeam(formData: FormData) {
  const user = await requireTrainerAction();
  if (user.role !== "ADMIN") throw new Error("Not authorized");
  const parsed = TeamSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error("Invalid team");
  const team = await prisma.team.create({
    data: { name: parsed.data.name, registrationCode: parsed.data.registrationCode || null },
  });
  await prisma.teamMembership.create({ data: { userId: user.id, teamId: team.id } });
  revalidatePath("/settings");
  redirect("/settings");
}

/** Admin: add any user to any team. */
export async function addUserToTeam(formData: FormData) {
  const user = await requireTrainerAction();
  if (user.role !== "ADMIN") throw new Error("Not authorized");
  const userId = formData.get("userId") as string;
  const teamId = formData.get("teamId") as string;
  const [target, team] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.team.findUnique({ where: { id: teamId } }),
  ]);
  if (!target || !team) throw new Error("Invalid user or team");
  await prisma.teamMembership.upsert({
    where: { userId_teamId: { userId, teamId } },
    update: {},
    create: { userId, teamId },
  });
  revalidatePath("/settings");
  revalidatePath("/team");
  revalidatePath(`/team/${userId}`);
}

/**
 * Admin: permanently delete a user account and all of its data (logs, plans, strength
 * programs, memberships all cascade; plans they authored for others keep the history with
 * a null author). Cannot delete yourself or another admin — demote an admin first.
 */
export async function deleteUserAccount(formData: FormData) {
  const user = await requireTrainerAction();
  if (user.role !== "ADMIN") throw new Error("Not authorized");
  const userId = formData.get("userId") as string;
  if (!userId) throw new Error("Invalid user");
  if (userId === user.id) throw new Error("Cannot delete your own account");
  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  if (!target) throw new Error("Invalid user");
  if (target.role === "ADMIN") throw new Error("Cannot delete an admin — demote them first");
  await prisma.user.delete({ where: { id: userId } });
  revalidatePath("/settings");
  revalidatePath("/team");
  revalidatePath("/attendance");
}

/**
 * Admin: move a login (email/password/verification/locale/role) from one member row to an
 * account-less roster row — the fix for "ticked the wrong name when signing up". All tracking
 * data stays with its rows; only the identity moves. The source row becomes an account-less
 * PLAYER (re-claimable), both rows' sessions are revoked, and pending email tokens die.
 */
export async function reassignAccount(formData: FormData) {
  const user = await requireTrainerAction();
  if (user.role !== "ADMIN") throw new Error("Not authorized");
  const sourceId = formData.get("sourceId") as string;
  const targetId = formData.get("targetId") as string;
  if (!sourceId || !targetId || sourceId === targetId) throw new Error("Invalid selection");

  const [source, target] = await Promise.all([
    prisma.user.findUnique({ where: { id: sourceId } }),
    prisma.user.findUnique({ where: { id: targetId } }),
  ]);
  if (!source?.passwordHash) throw new Error("Source has no login to move");
  if (!target || target.passwordHash !== null) throw new Error("Target already has a login");

  await prisma.$transaction([
    prisma.authToken.deleteMany({ where: { userId: { in: [sourceId, targetId] } } }),
    // Free the unique email first, then attach it to the target.
    prisma.user.update({
      where: { id: sourceId },
      data: {
        email: null,
        passwordHash: null,
        emailVerifiedAt: null,
        role: "PLAYER",
        sessionVersion: { increment: 1 },
      },
    }),
    prisma.user.update({
      where: { id: targetId },
      data: {
        email: source.email,
        passwordHash: source.passwordHash,
        emailVerifiedAt: source.emailVerifiedAt,
        locale: source.locale,
        role: source.role,
        activeTeamId: target.activeTeamId ?? source.activeTeamId,
        sessionVersion: { increment: 1 },
      },
    }),
  ]);

  revalidatePath("/settings");
  revalidatePath("/team");
  redirect("/settings");
}

/** Admin: remove a user from a team. Their active team falls back to another membership. */
export async function removeUserFromTeam(formData: FormData) {
  const user = await requireTrainerAction();
  if (user.role !== "ADMIN") throw new Error("Not authorized");
  const userId = formData.get("userId") as string;
  const teamId = formData.get("teamId") as string;
  if (!userId || !teamId) throw new Error("Invalid user or team");
  await prisma.teamMembership.deleteMany({ where: { userId, teamId } });
  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      activeTeamId: true,
      memberships: { select: { teamId: true }, orderBy: { createdAt: "asc" } },
    },
  });
  if (target && target.activeTeamId === teamId) {
    await prisma.user.update({
      where: { id: userId },
      data: { activeTeamId: target.memberships[0]?.teamId ?? null },
    });
  }
  revalidatePath("/settings");
  revalidatePath("/team");
  revalidatePath("/attendance");
}
