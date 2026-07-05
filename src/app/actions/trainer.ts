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
  SETTING_INCLUDE_PULL,
  SETTING_WARMUP_SCHEME,
  SETTING_BBB,
  DEFAULT_WARMUP_SCHEME,
  DEFAULT_BBB,
} from "@/lib/constants";

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
  revalidatePath("/team/practices");
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
  revalidatePath("/team/practices");
}

export async function setSlotActive(formData: FormData) {
  const user = await requireTrainerAction();
  const id = formData.get("slotId") as string;
  const active = formData.get("active") === "true";
  await prisma.practiceSlot.update({
    where: { id, teamId: user.activeTeamId ?? undefined },
    data: { active },
  });
  revalidatePath("/team/practices");
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

/** Toggle whether default strength plans include a pull/row movement (team-wide). */
export async function updateStrengthIncludePull(formData: FormData) {
  await requireTrainerAction();
  const on = formData.get("includePull") === "on";
  const value = on ? "true" : "false";
  await prisma.setting.upsert({
    where: { key: SETTING_INCLUDE_PULL },
    update: { value },
    create: { key: SETTING_INCLUDE_PULL, value },
  });
  revalidatePath("/settings");
  revalidatePath("/strength");
  redirect("/settings");
}

/** Clamp a form value to an integer in [min, max]; null if it isn't a finite number. */
function clampInt(value: FormDataEntryValue | null, min: number, max: number): number | null {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return null;
  return Math.max(min, Math.min(max, n));
}

/** Set the warm-up ramp (team-wide): up to 3 percent/reps steps shown before the working sets. */
export async function updateStrengthWarmup(formData: FormData) {
  await requireTrainerAction();
  const steps: { pct: number; reps: number }[] = [];
  for (let i = 1; i <= 3; i++) {
    const pct = clampInt(formData.get(`warmupPct${i}`), 1, 100);
    const reps = clampInt(formData.get(`warmupReps${i}`), 1, 50);
    if (pct != null && reps != null) steps.push({ pct, reps });
  }
  const value = JSON.stringify(steps.length ? steps : DEFAULT_WARMUP_SCHEME);
  await prisma.setting.upsert({
    where: { key: SETTING_WARMUP_SCHEME },
    update: { value },
    create: { key: SETTING_WARMUP_SCHEME, value },
  });
  revalidatePath("/settings");
  revalidatePath("/strength");
  redirect("/settings");
}

/** Set the "Boring But Big" set the logger adds per click (team-wide): % of max and reps. */
export async function updateStrengthBbb(formData: FormData) {
  await requireTrainerAction();
  const pct = clampInt(formData.get("bbbPct"), 1, 100) ?? DEFAULT_BBB.pct;
  const reps = clampInt(formData.get("bbbReps"), 1, 50) ?? DEFAULT_BBB.reps;
  const value = JSON.stringify({ pct, reps });
  await prisma.setting.upsert({
    where: { key: SETTING_BBB },
    update: { value },
    create: { key: SETTING_BBB, value },
  });
  revalidatePath("/settings");
  revalidatePath("/strength");
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
  revalidatePath("/team");
  revalidatePath(`/team/${userId}`);
}
