"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/dal";
import { isLocale, DEFAULT_LOCALE } from "@/lib/constants";

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
