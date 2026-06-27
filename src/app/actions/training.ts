"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/dal";
import { isTrainer, CATEGORIES, SESSION_STATUSES } from "@/lib/constants";
import { reconcileRugbyMissed } from "@/lib/missed";

const LogSchema = z.object({
  category: z.enum(CATEGORIES),
  status: z.enum(SESSION_STATUSES),
  date: z.string().min(1),
  durationMin: z.coerce.number().int().min(0).max(1000).optional(),
  practiceSlotId: z.string().optional(),
  missReason: z.string().max(300).optional(),
  // type-specific
  zone: z.string().optional(),
  note: z.string().max(300).optional(),
});

type LogData = z.infer<typeof LogSchema>;

/** Build the type-specific JSON detail payload + the column values shared by create/update. */
function sessionFields(d: LogData) {
  // Strength DONE sessions are created by the workout logger (saveStrengthWorkout), not here.
  let details: Record<string, unknown> | undefined;
  if (d.category === "CARDIO" && d.zone) details = { zone: d.zone };
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
  revalidatePath("/feed");
  revalidatePath(`/team/${existing.userId}`);
  redirect("/dashboard");
}

/**
 * Record group rugby attendance for a practice slot + date.
 * Any logged-in member may use this (not just trainers). Additive + de-duplicated:
 * for each checked user, if they have no existing DONE rugby SessionLog for that slot+date,
 * create one `{ category:"RUGBY", status:"DONE", practiceSlotId, date }`. Then reconcile
 * auto-MISSED for that practice (present users lose their auto-missed; committed-but-absent
 * users gain one — see reconcileRugbyMissed).
 *
 * Form: practiceSlotId, date (yyyy-mm-dd), and `present_<userId>` = "on" for each attendee.
 */
export async function logPracticeAttendance(formData: FormData) {
  const me = await getCurrentUser();
  if (!me) redirect("/login");

  const practiceSlotId = String(formData.get("practiceSlotId") ?? "");
  const dateStr = String(formData.get("date") ?? "");
  if (!practiceSlotId || !dateStr) throw new Error("Missing practice or date");

  const slot = await prisma.practiceSlot.findUnique({
    where: { id: practiceSlotId },
    select: { id: true },
  });
  if (!slot) throw new Error("Practice not found");

  // Normalize to local midnight so dedup compares whole-day.
  const date = new Date(dateStr);
  date.setHours(0, 0, 0, 0);
  const dayEnd = new Date(date);
  dayEnd.setDate(dayEnd.getDate() + 1);

  // Checked user ids.
  const checkedIds = new Set<string>();
  for (const [key, value] of formData.entries()) {
    const m = /^present_(.+)$/.exec(key);
    if (m && value) checkedIds.add(m[1]);
  }

  if (checkedIds.size > 0) {
    // Validate against real users, and find who already has a DONE rugby log for slot+date.
    const validUsers = await prisma.user.findMany({
      where: { id: { in: Array.from(checkedIds) } },
      select: { id: true },
    });
    const validIds = validUsers.map((u) => u.id);

    const alreadyDone = await prisma.sessionLog.findMany({
      where: {
        userId: { in: validIds },
        category: "RUGBY",
        status: "DONE",
        practiceSlotId,
        date: { gte: date, lt: dayEnd },
      },
      select: { userId: true },
    });
    const alreadyDoneIds = new Set(alreadyDone.map((l) => l.userId));

    const toCreate = validIds.filter((id) => !alreadyDoneIds.has(id));
    if (toCreate.length > 0) {
      await prisma.sessionLog.createMany({
        data: toCreate.map((userId) => ({
          userId,
          category: "RUGBY",
          status: "DONE",
          practiceSlotId,
          date,
        })),
      });
    }
  }

  // Reconcile auto-MISSED for this practice (present wins; committed-absent get auto-missed).
  await reconcileRugbyMissed(practiceSlotId, date);

  revalidatePath("/feed");
  revalidatePath("/dashboard");
  revalidatePath("/leaderboards");
  for (const userId of checkedIds) revalidatePath(`/team/${userId}`);

  redirect("/feed");
}

/**
 * Replace a player's active plan from a simple form:
 *  - cat_RUGBY = number -> authoritative weekly rugby target (a single RUGBY count item)
 *  - slot_<id> = "on"  -> a marker (target 0) for the specific practice(s) committed to
 *  - cat_<CATEGORY> = number (times/week, 0 = not committed)
 *  - other_name_<i> + other_n_<i> -> custom OTHER activities (label + times/week)
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
  const trainerNote = ((formData.get("trainerNote") as string) || "").slice(0, 500);

  type Item = {
    category: string;
    practiceSlotId: string | null;
    targetPerWeek: number;
    note?: string | null;
  };

  // Rugby is now an authoritative weekly NUMBER (cat_RUGBY). The committed practice slots are
  // stored as pure markers (targetPerWeek 0 → ignored by scoreWeek) so the UI can still show
  // which specific practice(s) the player aims for, without inflating the rugby target.
  const rugbyN = Number(formData.get("cat_RUGBY") ?? 0);
  const rugbyItem: Item[] =
    Number.isFinite(rugbyN) && rugbyN > 0
      ? [{ category: "RUGBY", practiceSlotId: null, targetPerWeek: Math.min(rugbyN, 21) }]
      : [];

  const slots = await prisma.practiceSlot.findMany({ where: { active: true }, select: { id: true } });
  const slotItems: Item[] = slots
    .filter((s) => formData.get(`slot_${s.id}`))
    .map((s) => ({ category: "RUGBY", practiceSlotId: s.id, targetPerWeek: 0 }));

  // Count-based commitments for the non-rugby fixed categories (excluding OTHER, which is custom).
  const catItems: Item[] = CATEGORIES.filter((c) => c !== "RUGBY" && c !== "OTHER")
    .map((c) => ({ c, n: Number(formData.get(`cat_${c}`) ?? 0) }))
    .filter((x) => Number.isFinite(x.n) && x.n > 0)
    .map((x) => ({ category: x.c, targetPerWeek: Math.min(x.n, 21), practiceSlotId: null }));

  // Custom "Other" activities: indexed label + number pairs (other_name_<i> / other_n_<i>).
  const otherItems: Item[] = [];
  for (const [key, value] of formData.entries()) {
    const m = /^other_name_(\d+)$/.exec(key);
    if (!m) continue;
    const label = String(value ?? "").trim().slice(0, 60);
    const n = Number(formData.get(`other_n_${m[1]}`) ?? 0);
    if (label && Number.isFinite(n) && n > 0) {
      otherItems.push({
        category: "OTHER",
        practiceSlotId: null,
        targetPerWeek: Math.min(n, 21),
        note: label,
      });
    }
  }

  const items = [...rugbyItem, ...slotItems, ...catItems, ...otherItems];

  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: targetUserId }, data: { availabilityNote, trainerNote } });

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
