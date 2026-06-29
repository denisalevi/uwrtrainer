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

const SlotSchema = z.object({
  label: z.string().min(1).max(80).trim(),
  dayOfWeek: z.coerce.number().int().min(0).max(6),
  time: z.string().max(10).optional(),
  tier: z.enum(PRACTICE_TIERS),
});

export async function addSlot(formData: FormData) {
  await requireTrainerAction();
  const parsed = SlotSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error("Invalid practice");
  await prisma.practiceSlot.create({
    data: { ...parsed.data, time: parsed.data.time || null },
  });
  revalidatePath("/team/practices");
}

export async function updateSlot(formData: FormData) {
  await requireTrainerAction();
  const slotId = formData.get("slotId") as string;
  if (!slotId) throw new Error("Invalid practice");
  const parsed = SlotSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error("Invalid practice");
  await prisma.practiceSlot.update({
    where: { id: slotId },
    data: { ...parsed.data, time: parsed.data.time || null },
  });
  revalidatePath("/team/practices");
}

export async function setSlotActive(formData: FormData) {
  await requireTrainerAction();
  const id = formData.get("slotId") as string;
  const active = formData.get("active") === "true";
  await prisma.practiceSlot.update({ where: { id }, data: { active } });
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
