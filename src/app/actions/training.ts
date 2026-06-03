"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/dal";
import { isTrainer, CATEGORIES, SESSION_STATUSES } from "@/lib/constants";

const LogSchema = z.object({
  category: z.enum(CATEGORIES),
  status: z.enum(SESSION_STATUSES),
  date: z.string().min(1),
  durationMin: z.coerce.number().int().min(0).max(1000).optional(),
  practiceSlotId: z.string().optional(),
  missReason: z.string().max(300).optional(),
  // type-specific
  zone: z.string().optional(),
  lift: z.string().optional(),
  sets: z.coerce.number().int().min(0).max(50).optional(),
  reps: z.coerce.number().int().min(0).max(100).optional(),
  weight: z.coerce.number().min(0).max(1000).optional(),
  note: z.string().max(300).optional(),
});

type LogData = z.infer<typeof LogSchema>;

/** Build the type-specific JSON detail payload + the column values shared by create/update. */
function sessionFields(d: LogData) {
  let details: Record<string, unknown> | undefined;
  if (d.category === "CARDIO" && d.zone) details = { zone: d.zone };
  if (d.category === "STRENGTH" && d.lift) {
    details = { lift: d.lift, sets: d.sets, reps: d.reps, weight: d.weight };
  }
  if (d.note) details = { ...(details ?? {}), note: d.note };
  return {
    date: new Date(d.date),
    category: d.category,
    status: d.status,
    durationMin: d.durationMin || null,
    missReason: d.status === "MISSED" ? d.missReason || null : null,
    practiceSlotId: d.category === "RUGBY" && d.practiceSlotId ? d.practiceSlotId : null,
    details: details ? JSON.stringify(details) : null,
  };
}

export async function logSession(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const parsed = LogSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error("Invalid session data");

  await prisma.sessionLog.create({
    data: { userId: user.id, ...sessionFields(parsed.data) },
  });

  revalidatePath("/dashboard");
  revalidatePath("/leaderboards");
  redirect("/dashboard");
}

/** Edit an existing session. Owner (or a trainer) only. */
export async function updateSession(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const id = String(formData.get("id") ?? "");

  const existing = await prisma.sessionLog.findUnique({ where: { id }, select: { userId: true } });
  if (!existing) throw new Error("Session not found");
  if (existing.userId !== user.id && !isTrainer(user.role)) throw new Error("Not authorized");

  const parsed = LogSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error("Invalid session data");

  await prisma.sessionLog.update({ where: { id }, data: sessionFields(parsed.data) });

  revalidatePath("/dashboard");
  revalidatePath("/leaderboards");
  redirect("/dashboard");
}

/** Delete a session. Owner (or a trainer) only. */
export async function deleteSession(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const id = String(formData.get("id") ?? "");

  const existing = await prisma.sessionLog.findUnique({ where: { id }, select: { userId: true } });
  if (!existing) throw new Error("Session not found");
  if (existing.userId !== user.id && !isTrainer(user.role)) throw new Error("Not authorized");

  await prisma.sessionLog.delete({ where: { id } });

  revalidatePath("/dashboard");
  revalidatePath("/leaderboards");
  redirect("/dashboard");
}

/**
 * Replace a player's active plan from a simple form:
 *  - slot_<id> = "on"  -> a RUGBY commitment to that practice (target 1)
 *  - cat_<CATEGORY> = number (times/week, 0 = not committed)
 *  - availabilityNote
 * If `userId` is present and differs from the caller, requires a trainer.
 */
export async function savePlan(formData: FormData) {
  const me = await getCurrentUser();
  if (!me) redirect("/login");

  const targetUserId = (formData.get("userId") as string) || me.id;
  if (targetUserId !== me.id && !isTrainer(me.role)) {
    throw new Error("Not authorized");
  }

  const availabilityNote = ((formData.get("availabilityNote") as string) || "").slice(0, 500);

  const slots = await prisma.practiceSlot.findMany({ where: { active: true }, select: { id: true } });
  const slotItems = slots
    .filter((s) => formData.get(`slot_${s.id}`))
    .map((s) => ({ category: "RUGBY", practiceSlotId: s.id, targetPerWeek: 1 }));

  const catItems = CATEGORIES.filter((c) => c !== "RUGBY")
    .map((c) => ({ c, n: Number(formData.get(`cat_${c}`) ?? 0) }))
    .filter((x) => Number.isFinite(x.n) && x.n > 0)
    .map((x) => ({ category: x.c, targetPerWeek: Math.min(x.n, 21), practiceSlotId: null as string | null }));

  const items = [...slotItems, ...catItems];

  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: targetUserId }, data: { availabilityNote } });

    const active = await tx.plan.findFirst({
      where: { userId: targetUserId, validTo: null },
      orderBy: { validFrom: "desc" },
    });

    if (active) {
      await tx.planItem.deleteMany({ where: { planId: active.id } });
      if (items.length) {
        await tx.planItem.createMany({ data: items.map((i) => ({ ...i, planId: active.id })) });
      }
    } else {
      await tx.plan.create({
        data: {
          userId: targetUserId,
          createdById: me.id,
          items: { create: items },
        },
      });
    }
  });

  revalidatePath("/plan");
  revalidatePath("/dashboard");
  if (targetUserId !== me.id) {
    redirect(`/team/${targetUserId}`);
  }
  redirect("/plan");
}
