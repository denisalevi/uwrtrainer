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
