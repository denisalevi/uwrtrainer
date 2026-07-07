"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/dal";
import {
  isLocale,
  DEFAULT_LOCALE,
  DEFAULT_TEAM_ID,
  DEFAULT_WARMUP_SCHEME,
  DEFAULT_BBB,
} from "@/lib/constants";
import {
  isWeightRoundingMode,
  DEFAULT_WEIGHT_ROUNDING,
  DEFAULT_WEIGHT_INCREMENT,
} from "@/lib/strength";

export async function setLocale(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const value = formData.get("locale") as string;
  const locale = isLocale(value) ? value : DEFAULT_LOCALE;
  await prisma.user.update({ where: { id: user.id }, data: { locale } });

  // Refresh the whole tree so the new dictionary is applied everywhere.
  revalidatePath("/", "layout");
  redirect("/settings");
}

/** Clamp a seconds value from a form field to a sane range (default-aware). */
function clampSeconds(raw: FormDataEntryValue | null, fallback: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(900, Math.max(0, Math.round(n)));
}

export async function setRestTimerSettings(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  await prisma.user.update({
    where: { id: user.id },
    data: {
      restTimerEnabled: formData.get("restTimerEnabled") === "on",
      restTimerBeep: formData.get("restTimerBeep") === "on",
      restTimerVibrate: formData.get("restTimerVibrate") === "on",
      restWarmupSeconds: clampSeconds(formData.get("restWarmupSeconds"), 75),
      restMainSeconds: clampSeconds(formData.get("restMainSeconds"), 150),
      restBbbSeconds: clampSeconds(formData.get("restBbbSeconds"), 90),
    },
  });

  revalidatePath("/settings");
  revalidatePath("/strength/log");
  redirect("/settings");
}

/** Per-user planned-weight rounding for the strength module (mode + increment). */
export async function setWeightRounding(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const rawMode = formData.get("weightRounding");
  const mode = isWeightRoundingMode(rawMode) ? rawMode : DEFAULT_WEIGHT_ROUNDING;
  const rawInc = Number(formData.get("weightIncrement"));
  const increment =
    Number.isFinite(rawInc) && rawInc > 0 ? Math.min(25, rawInc) : DEFAULT_WEIGHT_INCREMENT;

  await prisma.user.update({
    where: { id: user.id },
    data: { weightRounding: mode, weightIncrement: increment },
  });

  revalidatePath("/settings");
  revalidatePath("/strength");
  revalidatePath("/strength/log");
  redirect("/settings");
}

/** Clamp a form value to an integer in [min, max]; null if it isn't a finite number. */
function clampInt(value: FormDataEntryValue | null, min: number, max: number): number | null {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return null;
  return Math.max(min, Math.min(max, n));
}

/** Set the user's warm-up ramp: up to 3 percent/reps steps shown before the working sets. */
export async function setStrengthWarmup(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const steps: { pct: number; reps: number }[] = [];
  for (let i = 1; i <= 3; i++) {
    const pct = clampInt(formData.get(`warmupPct${i}`), 1, 100);
    const reps = clampInt(formData.get(`warmupReps${i}`), 1, 50);
    if (pct != null && reps != null) steps.push({ pct, reps });
  }
  const value = JSON.stringify(steps.length ? steps : DEFAULT_WARMUP_SCHEME);
  await prisma.user.update({ where: { id: user.id }, data: { strengthWarmup: value } });
  revalidatePath("/settings");
  revalidatePath("/strength/log");
  redirect("/settings");
}

/** Set the user's "Boring But Big" set the logger adds per click: % of max and reps. */
export async function setStrengthBbb(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const pct = clampInt(formData.get("bbbPct"), 1, 100) ?? DEFAULT_BBB.pct;
  const reps = clampInt(formData.get("bbbReps"), 1, 50) ?? DEFAULT_BBB.reps;
  const value = JSON.stringify({ pct, reps });
  await prisma.user.update({ where: { id: user.id }, data: { strengthBbb: value } });
  revalidatePath("/settings");
  revalidatePath("/strength/log");
  redirect("/settings");
}

/** Switch the active team (must be a team the user belongs to). */
export async function switchTeam(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const teamId = formData.get("teamId") as string;
  const membership = await prisma.teamMembership.findUnique({
    where: { userId_teamId: { userId: user.id, teamId } },
  });
  if (!membership) throw new Error("Not a member of this team");

  await prisma.user.update({ where: { id: user.id }, data: { activeTeamId: teamId } });
  revalidatePath("/", "layout");
}

/**
 * Join a specific team by entering its join code. The default team is open when no code is
 * configured (team code and env REGISTRATION_CODE both empty); other teams without a code can
 * only be joined by an admin adding the user.
 */
export async function joinTeam(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const teamId = (formData.get("teamId") as string) || "";
  const code = ((formData.get("code") as string) || "").trim();
  const team = await prisma.team.findUnique({ where: { id: teamId } });
  if (!team) redirect("/settings");

  const envCode = process.env.REGISTRATION_CODE?.trim() || null;
  const effective =
    team.registrationCode?.trim() || (team.id === DEFAULT_TEAM_ID ? envCode : null);
  const allowed =
    user.role === "ADMIN" ||
    (effective !== null ? code === effective : team.id === DEFAULT_TEAM_ID);
  if (!allowed) redirect(`/settings?joinError=${encodeURIComponent(team.id)}`);

  await prisma.teamMembership.upsert({
    where: { userId_teamId: { userId: user.id, teamId: team.id } },
    update: {},
    create: { userId: user.id, teamId: team.id },
  });
  await prisma.user.update({ where: { id: user.id }, data: { activeTeamId: team.id } });
  revalidatePath("/", "layout");
  redirect("/settings");
}
