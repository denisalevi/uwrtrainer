"use server";

// Read-only API tokens (Settings → Admin → API tokens). Admin-only: a token reads a whole
// team's feed. Server Actions are public endpoints, so the role is re-checked here.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/dal";
import { API_TOKEN_NAME_MAX, generateApiToken } from "@/lib/api-tokens";

export type CreateApiTokenState =
  | undefined
  | { error: "name" | "team" }
  | { token: string; name: string };

/**
 * Create a token for one of the admin's teams. Returns the raw token ONCE (to show in the
 * form); only its hash is stored, so it can't be shown again later.
 */
export async function createApiToken(
  _prev: CreateApiTokenState,
  formData: FormData,
): Promise<CreateApiTokenState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") throw new Error("Forbidden");

  const name = String(formData.get("name") ?? "").trim().slice(0, API_TOKEN_NAME_MAX);
  if (!name) return { error: "name" };
  const teamId = String(formData.get("teamId") ?? "");
  const team = await prisma.team.findUnique({ where: { id: teamId }, select: { id: true } });
  if (!team) return { error: "team" };

  const { raw, hash, prefix } = generateApiToken();
  await prisma.apiToken.create({
    data: { name, tokenHash: hash, prefix, scope: "feed:read", teamId, createdById: user.id },
  });
  revalidatePath("/settings");
  return { token: raw, name };
}

/** Revoke a token immediately (the row stays, marked revoked, for the record). */
export async function revokeApiToken(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") throw new Error("Forbidden");

  const id = String(formData.get("id") ?? "");
  await prisma.apiToken.updateMany({
    where: { id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  revalidatePath("/settings");
  redirect("/settings");
}

/**
 * Opt a token in/out of members' free-text reasons (miss reasons, weekly "why not reached"
 * notes). Those can be health data, so it's an explicit per-token switch, off by default.
 */
export async function setApiTokenReasons(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") throw new Error("Forbidden");

  const id = String(formData.get("id") ?? "");
  const on = String(formData.get("on")) === "true";
  await prisma.apiToken.updateMany({ where: { id, revokedAt: null }, data: { includeReasons: on } });
  revalidatePath("/settings");
  redirect("/settings");
}
