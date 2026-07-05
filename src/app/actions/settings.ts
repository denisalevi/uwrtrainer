"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/dal";
import { isLocale, DEFAULT_LOCALE, DEFAULT_TEAM_ID } from "@/lib/constants";

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

/** Join another team by entering that team's registration code. */
export async function joinTeamByCode(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const code = ((formData.get("code") as string) || "").trim();
  if (code) {
    const teams = await prisma.team.findMany({ select: { id: true, registrationCode: true } });
    const envCode = process.env.REGISTRATION_CODE?.trim() || null;
    const team = teams.find(
      (t) => (t.registrationCode?.trim() || (t.id === DEFAULT_TEAM_ID ? envCode : null)) === code,
    );
    if (team) {
      await prisma.teamMembership.upsert({
        where: { userId_teamId: { userId: user.id, teamId: team.id } },
        update: {},
        create: { userId: user.id, teamId: team.id },
      });
      await prisma.user.update({ where: { id: user.id }, data: { activeTeamId: team.id } });
      revalidatePath("/", "layout");
    }
  }
  redirect("/settings");
}
