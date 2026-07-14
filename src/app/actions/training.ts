"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/dal";
import { isTrainer, CATEGORIES, SESSION_STATUSES } from "@/lib/constants";
import { reconcileRugbyMissed, selfHealCountWeek } from "@/lib/missed";
import { isSlotAvailableOn } from "@/lib/practice-window";
import { planItemsEqual } from "@/lib/plan-version";
import { TOURNAMENT_CATEGORY, exemptWeekStarts } from "@/lib/tournament";
import { getTournamentExemptionMode } from "@/lib/exempt-weeks";
import { addWeeks } from "@/lib/dates";

/**
 * A tournament exemption just went away for `userIds` in the weeks starting at `weekStarts` —
 * restore what should exist: re-reconcile every ticked practice in those weeks (bucket-1
 * auto-MISSED rows return) and self-heal the weekly count summaries (bucket 2).
 */
async function restorePenaltiesForWeeks(userIds: string[], weekStarts: Date[]) {
  for (const ws of weekStarts) {
    const events = await prisma.sessionLog.findMany({
      where: {
        category: "RUGBY",
        NOT: { practiceSlotId: null },
        date: { gte: ws, lt: addWeeks(ws, 1) },
      },
      select: { practiceSlotId: true, date: true },
      distinct: ["practiceSlotId", "date"],
    });
    for (const ev of events) await reconcileRugbyMissed(ev.practiceSlotId!, ev.date);
    for (const userId of userIds) await selfHealCountWeek(userId, ws);
  }
}

/** Reject a slot-tied log whose date falls outside the practice's season (or the slot is paused).
 *  The UI already filters these out; this guards the public server actions against stale forms. */
async function assertSlotInSeason(practiceSlotId: string, date: Date) {
  const slot = await prisma.practiceSlot.findUnique({
    where: { id: practiceSlotId },
    select: { active: true, validFrom: true, validTo: true },
  });
  if (!slot) throw new Error("Practice not found");
  if (!isSlotAvailableOn(slot, date)) throw new Error("Practice is not offered on this date");
}

const LogSchema = z.object({
  category: z.enum(CATEGORIES),
  status: z.enum(SESSION_STATUSES),
  date: z.string().min(1),
  durationMin: z.coerce.number().int().min(0).max(1000).optional(),
  practiceSlotId: z.string().optional(),
  missReason: z.string().max(300).optional(),
  // type-specific
  zone: z.string().optional(),
  activity: z.string().max(80).optional(),
  note: z.string().max(300).optional(),
});

type LogData = z.infer<typeof LogSchema>;

/** Build the type-specific JSON detail payload + the column values shared by create/update. */
function sessionFields(d: LogData) {
  // Strength DONE sessions are created by the workout logger (saveStrengthWorkout), not here.
  let details: Record<string, unknown> | undefined;
  if (d.category === "CARDIO" && d.zone) details = { zone: d.zone };
  if (d.category === "CARDIO" && d.activity?.trim())
    details = { ...(details ?? {}), activity: d.activity.trim() };
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

  const fields = sessionFields(parsed.data);
  if (fields.practiceSlotId) await assertSlotInSeason(fields.practiceSlotId, fields.date);
  await prisma.sessionLog.create({
    data: { userId: user.id, ...fields },
  });

  // A rugby log tied to a practice slot is an attendance event: reconcile that practice so the
  // new DONE (or manual MISSED) row displaces its auto-missed twin instead of coexisting with it.
  if (fields.practiceSlotId) await reconcileRugbyMissed(fields.practiceSlotId, fields.date);

  // Self-heal: a DONE log for a past, already-reconciled week shrinks that week's missed count.
  if (parsed.data.status === "DONE") await selfHealCountWeek(user.id, fields.date);

  revalidatePath("/dashboard");
  revalidatePath("/leaderboards");
  redirect("/dashboard");
}

/** Edit an existing session. Owner (or a trainer) only. */
export async function updateSession(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const id = String(formData.get("id") ?? "");

  const existing = await prisma.sessionLog.findUnique({
    where: { id },
    select: { userId: true, date: true, auto: true, practiceSlotId: true },
  });
  if (!existing) throw new Error("Session not found");
  if (existing.userId !== user.id && !isTrainer(user.role)) throw new Error("Not authorized");

  // Auto rows (auto-MISSED penalties with their frozen {missed,target} snapshot) are system-owned:
  // they are resolved via "Add yourself" / "Log the session" or recompute, never edited directly.
  if (existing.auto) throw new Error("Auto entries cannot be edited");

  const parsed = LogSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error("Invalid session data");

  const fields = sessionFields(parsed.data);
  // Only newly slot-tied/moved edits need the season check — an unchanged slot+date stays valid.
  if (
    fields.practiceSlotId &&
    (fields.practiceSlotId !== existing.practiceSlotId ||
      fields.date.getTime() !== existing.date.getTime())
  ) {
    await assertSlotInSeason(fields.practiceSlotId, fields.date);
  }
  await prisma.sessionLog.update({ where: { id }, data: fields });

  // Rugby practice dedup: reconcile every practice this edit touched — the old slot+date (the
  // row may have moved away from it) and the new one (a DONE/manual-MISSED row must displace
  // its auto-missed twin).
  if (existing.practiceSlotId) {
    await reconcileRugbyMissed(existing.practiceSlotId, existing.date);
  }
  if (
    fields.practiceSlotId &&
    (fields.practiceSlotId !== existing.practiceSlotId ||
      fields.date.getTime() !== existing.date.getTime())
  ) {
    await reconcileRugbyMissed(fields.practiceSlotId, fields.date);
  }

  // Self-heal both the old and the new date's week (the edit may have moved the session, or
  // flipped DONE↔MISSED) so any reconciled past week's missed count self-corrects.
  await selfHealCountWeek(existing.userId, existing.date);
  if (fields.date.getTime() !== existing.date.getTime()) {
    await selfHealCountWeek(existing.userId, fields.date);
  }

  revalidatePath("/dashboard");
  revalidatePath("/leaderboards");
  redirect("/dashboard");
}

/** Delete a session. Owner (or a trainer) only. */
export async function deleteSession(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const id = String(formData.get("id") ?? "");

  const existing = await prisma.sessionLog.findUnique({
    where: { id },
    select: { userId: true, date: true, status: true, auto: true, practiceSlotId: true, category: true },
  });
  if (!existing) throw new Error("Session not found");
  if (existing.userId !== user.id && !isTrainer(user.role)) throw new Error("Not authorized");

  // Auto-MISSED rows are NOT manually deletable. They're resolved only via "Add yourself" /
  // "Log the session" (which flips them to DONE / shrinks the count) or cleared by recompute.
  if (existing.auto && existing.status === "MISSED") {
    throw new Error("Auto-missed entries cannot be deleted");
  }

  await prisma.sessionLog.delete({ where: { id } });

  // Rugby practice dedup: deleting a DONE/manual-MISSED row for a practice means the user is no
  // longer accounted for — reconcile so a committed absence gets its auto-missed row back.
  if (existing.practiceSlotId) {
    await reconcileRugbyMissed(existing.practiceSlotId, existing.date);
  }

  // Self-heal: deleting a DONE log in a reconciled past week may re-open a shortfall.
  if (existing.status === "DONE") await selfHealCountWeek(existing.userId, existing.date);

  // Deleting a tournament revokes its goal exemption — restore that player's penalties in the
  // weeks it had exempted (unless another tournament still covers them; the reconcilers re-check).
  if (existing.category === TOURNAMENT_CATEGORY && existing.status === "DONE") {
    const mode = await getTournamentExemptionMode();
    const weekStarts = Array.from(exemptWeekStarts([existing.date], mode)).map((ms) => new Date(ms));
    if (weekStarts.length > 0) await restorePenaltiesForWeeks([existing.userId], weekStarts);
  }

  revalidatePath("/dashboard");
  revalidatePath("/leaderboards");
  revalidatePath("/feed");
  revalidatePath(`/team/${existing.userId}`);
  redirect("/dashboard");
}

/**
 * Set / clear the `missReason` on the caller's OWN auto-MISSED row (either bucket: a ticked-practice
 * row or a count-shortfall summary). This is the "Give a reason" resolve action — the row is not
 * deletable, but the person can explain it, and the reason is team-visible on their profile/feed.
 *
 * Auth: OWNER only — a user may only annotate their own missed rows (`targetUserId === me.id`),
 * even trainers can't write someone else's reason. No redirect: this is called inline (the page
 * is revalidated so the reason shows immediately).
 */
export async function setMissedReason(formData: FormData) {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  const id = String(formData.get("id") ?? "");
  const reason = String(formData.get("missReason") ?? "").slice(0, 300).trim() || null;

  const existing = await prisma.sessionLog.findUnique({
    where: { id },
    select: { userId: true, status: true, auto: true },
  });
  if (!existing) throw new Error("Session not found");
  // Owner-only, and only on the auto-MISSED rows this affordance is meant for.
  if (existing.userId !== me.id) throw new Error("Not authorized");
  if (!(existing.auto && existing.status === "MISSED")) throw new Error("Not a missed entry");

  await prisma.sessionLog.update({ where: { id }, data: { missReason: reason } });

  revalidatePath("/dashboard");
  revalidatePath("/feed");
  revalidatePath(`/team/${existing.userId}`);
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
    select: { id: true, dayOfWeek: true, teamId: true, active: true, validFrom: true, validTo: true },
  });
  if (!slot) throw new Error("Practice not found");
  // Only members of the slot's team may record its attendance.
  const callerMembership = await prisma.teamMembership.findUnique({
    where: { userId_teamId: { userId: me.id, teamId: slot.teamId } },
  });
  if (!callerMembership) throw new Error("Not authorized");

  // Parse yyyy-mm-dd as LOCAL midnight (new Date("yyyy-mm-dd") would be UTC midnight, which can
  // shift the day — and the weekday — in non-UTC timezones). Whole-day granularity for dedup.
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  const date = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(NaN);
  if (Number.isNaN(date.getTime())) throw new Error("Invalid date");

  // A practice can only be recorded for a day that already happened (attendance creates
  // undeletable auto-missed rows for absent committed players — a future or wrong-weekday date
  // would mint phantom penalties for the whole roster).
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  if (date > todayStart) throw new Error("Date cannot be in the future");
  if (date.getDay() !== slot.dayOfWeek) {
    throw new Error("Date does not match the practice's weekday");
  }
  // Season guard: a paused or out-of-window practice can't take attendance (mirrors the UI filter;
  // stops stale forms from minting DONE rows — and thus auto-missed penalties — out of season).
  if (!isSlotAvailableOn(slot, date)) throw new Error("Practice is not offered on this date");

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
      where: {
        id: { in: Array.from(checkedIds) },
        memberships: { some: { teamId: slot.teamId } },
      },
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
      // Race backstop: this read-then-create can race a simultaneous submitter, so the DB has a
      // partial unique index on (userId, practiceSlotId, date) for DONE rows (migration
      // `attendance_dedup_index`; SQLite createMany has no skipDuplicates). If the batch hits it,
      // fall back to per-user creates and swallow P2002 — the row already existing IS the goal.
      const rows = toCreate.map((userId) => ({
        userId,
        category: "RUGBY",
        status: "DONE",
        practiceSlotId,
        date,
      }));
      try {
        await prisma.sessionLog.createMany({ data: rows });
      } catch (e) {
        if ((e as { code?: string }).code !== "P2002") throw e;
        for (const row of rows) {
          try {
            await prisma.sessionLog.create({ data: row });
          } catch (e2) {
            if ((e2 as { code?: string }).code !== "P2002") throw e2;
          }
        }
      }
    }
  }

  // Edit-mode submit (feed "Edit attendance"): the checkbox list is authoritative — roster
  // members explicitly UNTICKED lose their attendance-created DONE row for this practice
  // (slot-tied DONE rugby rows only; other logs are untouched). Normal submits stay additive.
  const editMode = String(formData.get("editMode") ?? "") === "1";
  const removedUserIds: string[] = [];
  if (editMode) {
    const roster = await prisma.user.findMany({
      where: { memberships: { some: { teamId: slot.teamId } } },
      select: { id: true },
    });
    const untickedIds = roster.map((u) => u.id).filter((id) => !checkedIds.has(id));
    if (untickedIds.length > 0) {
      const toRemove = await prisma.sessionLog.findMany({
        where: {
          userId: { in: untickedIds },
          category: "RUGBY",
          status: "DONE",
          practiceSlotId,
          date: { gte: date, lt: dayEnd },
        },
        select: { id: true, userId: true },
      });
      if (toRemove.length > 0) {
        await prisma.sessionLog.deleteMany({ where: { id: { in: toRemove.map((r) => r.id) } } });
        removedUserIds.push(...toRemove.map((r) => r.userId));
      }
    }
  }

  // Reconcile auto-MISSED for this practice (present wins; committed-absent get auto-missed).
  await reconcileRugbyMissed(practiceSlotId, date);

  // Self-heal: if this practice falls in a past, already-reconciled week, recompute each touched
  // user's rugby count summary (newly-present users shrink it; newly-absent ticked users are
  // already counted via their bucket-1 row, so the remainder math stays consistent).
  const touchedUserIds = new Set<string>([...checkedIds, ...removedUserIds]);
  for (const userId of touchedUserIds) await selfHealCountWeek(userId, date);

  revalidatePath("/feed");
  revalidatePath("/dashboard");
  revalidatePath("/leaderboards");
  for (const userId of touchedUserIds) revalidatePath(`/team/${userId}`);

  redirect("/feed");
}

/**
 * Record a tournament / league game (#31): tick off who played, like practice attendance but
 * with no practice slot. One `{ category: TOURNAMENT, status: DONE }` row per selected player
 * (details: { kind:"tournament", label? }). Tournaments count as NO practice anywhere — their
 * effect is the goal EXEMPTION: per the team's tournament setting, the selected players' week
 * (and optionally the next) owes no goals. Any team member may submit; future dates are allowed
 * (a known upcoming game already pauses the running week's goals).
 *
 * Form: date (yyyy-mm-dd), optional label, `present_<userId>` checkboxes, optional editMode
 * (the checkbox list becomes authoritative for that date — unticked players lose their row).
 */
export async function logTournament(formData: FormData) {
  const me = await getCurrentUser();
  if (!me) redirect("/login");

  const teamId = me.activeTeamId;
  if (!teamId) throw new Error("No active team");
  const membership = await prisma.teamMembership.findUnique({
    where: { userId_teamId: { userId: me.id, teamId } },
  });
  if (!membership) throw new Error("Not authorized");

  const dateStr = String(formData.get("date") ?? "");
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  const date = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(NaN);
  if (Number.isNaN(date.getTime())) throw new Error("Invalid date");
  // Sanity horizon (± ~1 year): tournaments may be logged in advance, but not absurdly so.
  const now = new Date();
  if (Math.abs(date.getTime() - now.getTime()) > 370 * 86400000) throw new Error("Invalid date");

  const label = String(formData.get("label") ?? "").trim().slice(0, 80);
  const dayEnd = new Date(date);
  dayEnd.setDate(dayEnd.getDate() + 1);

  const checkedIds = new Set<string>();
  for (const [key, value] of formData.entries()) {
    const pm = /^present_(.+)$/.exec(key);
    if (pm && value) checkedIds.add(pm[1]);
  }

  const validUsers = await prisma.user.findMany({
    where: { id: { in: Array.from(checkedIds) }, memberships: { some: { teamId } } },
    select: { id: true },
  });
  const validIds = validUsers.map((u) => u.id);

  const existing = await prisma.sessionLog.findMany({
    where: {
      category: TOURNAMENT_CATEGORY,
      status: "DONE",
      user: { memberships: { some: { teamId } } },
      date: { gte: date, lt: dayEnd },
    },
    select: { id: true, userId: true },
  });
  const existingByUser = new Map(existing.map((l) => [l.userId, l.id]));

  const toCreate = validIds.filter((id) => !existingByUser.has(id));
  if (toCreate.length > 0) {
    await prisma.sessionLog.createMany({
      data: toCreate.map((userId) => ({
        userId,
        category: TOURNAMENT_CATEGORY,
        status: "DONE",
        date,
        details: JSON.stringify({ kind: "tournament", ...(label ? { label } : {}) }),
      })),
    });
  }

  // Edit mode: unticked players lose their row for this date (mirrors attendance editing).
  const removedUserIds: string[] = [];
  if (String(formData.get("editMode") ?? "") === "1") {
    const toRemove = existing.filter((l) => !checkedIds.has(l.userId));
    if (toRemove.length > 0) {
      await prisma.sessionLog.deleteMany({ where: { id: { in: toRemove.map((l) => l.id) } } });
      removedUserIds.push(...toRemove.map((l) => l.userId));
    }
  }

  // The exemption just changed — clean up / restore auto-MISSED rows in the affected weeks.
  const mode = await getTournamentExemptionMode();
  const weekStarts = Array.from(exemptWeekStarts([date], mode)).map((ms) => new Date(ms));
  // Newly exempt players: their auto-MISSED rows (both buckets) in the exempt weeks are void.
  if (validIds.length > 0 && weekStarts.length > 0) {
    await prisma.sessionLog.deleteMany({
      where: {
        userId: { in: validIds },
        status: "MISSED",
        auto: true,
        OR: weekStarts.map((ws) => ({ date: { gte: ws, lt: addWeeks(ws, 1) } })),
      },
    });
  }
  // Players removed in an edit lose the exemption again: restore what should exist (ticked
  // practices re-reconcile; the weekly count summaries self-heal).
  if (removedUserIds.length > 0 && weekStarts.length > 0) {
    await restorePenaltiesForWeeks(removedUserIds, weekStarts);
  }
  // Weekly summaries in already-reconciled weeks self-heal for the newly exempt too (the
  // exemption check inside reconcileWeekForUser clears them).
  for (const userId of validIds) {
    for (const ws of weekStarts) await selfHealCountWeek(userId, ws);
  }

  revalidatePath("/feed");
  revalidatePath("/dashboard");
  revalidatePath("/leaderboards");
  for (const userId of new Set([...validIds, ...removedUserIds])) {
    revalidatePath(`/team/${userId}`);
  }
  redirect("/feed");
}

/**
 * Replace a player's active plan from a simple form:
 *  - cat_RUGBY = number -> authoritative weekly rugby target (a single RUGBY count item)
 *  - slot_<id> = "on"  -> a marker (target 0) for the specific practice(s) committed to
 *  - cat_<CATEGORY> = number (times/week, 0 = not committed)
 *  - other_name_<i> + other_n_<i> -> custom OTHER activities (label + times/week)
 *  - availabilityNote
 * Self-only: a user may only save their own plan. If `userId` is present and differs
 * from the caller, the action throws (trainers cannot edit another player's plan).
 */
export async function savePlan(formData: FormData) {
  const me = await getCurrentUser();
  if (!me) redirect("/login");

  const targetUserId = (formData.get("userId") as string) || me.id;
  if (targetUserId !== me.id) {
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

  const slots = await prisma.practiceSlot.findMany({
    where: { active: true, team: { memberships: { some: { userId: me.id } } } },
    select: { id: true },
  });
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
      include: { items: true },
    });

    // VERSIONING: never mutate a plan's items in place — historical week scores are computed
    // from the plan version active at ref = weekStart + 6d (see stats.ts/missed.ts). Instead,
    // close the current version (validTo = now) and open a new one (validFrom = now). Past
    // weeks (ref < now) keep the closed version; the current week's ref (end of week) falls
    // after `now`, so a mid-week change applies to the whole current week — by design, since
    // ref is end-of-week. If nothing actually changed, skip: no noise version.
    if (active && planItemsEqual(active.items, items)) return;

    const now = new Date();
    if (active) {
      await tx.plan.update({ where: { id: active.id }, data: { validTo: now } });
    }
    await tx.plan.create({
      data: {
        userId: targetUserId,
        createdById: me.id,
        validFrom: now,
        items: { create: items },
      },
    });
  });

  revalidatePath("/plan");
  revalidatePath("/dashboard");
  if (targetUserId !== me.id) {
    redirect(`/team/${targetUserId}`);
  }
  redirect("/plan");
}
