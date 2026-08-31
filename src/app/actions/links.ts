"use server";

// Saved-link library — add / share / delete, plus the "remember this one" hook the warm-up and
// cool-down link fields call when a link is added while logging. Server Actions are public
// endpoints: every mutation re-checks ownership (or trainer rights) here, never trusting the UI.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/dal";
import { isTrainer } from "@/lib/constants";
import { rememberSavedLink } from "@/lib/saved-links-store";

/** Pages whose link dropdown / library listing changes when the library does. */
function revalidateLinkPages(): void {
  revalidatePath("/settings");
  revalidatePath("/strength/log");
}

/**
 * Save a link into the caller's own library from the settings form. Same URL twice = the
 * existing entry is renamed, not duplicated (the store upserts on owner+url).
 */
export async function addSavedLink(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  await rememberSavedLink(user.id, String(formData.get("url") ?? ""), String(formData.get("label") ?? ""));
  revalidateLinkPages();
  redirect("/settings");
}

/**
 * Auto-save from the warm-up/cool-down link field (called client-side right after the link is
 * added to the section) — no redirect, and failures must stay invisible to the logger.
 */
export async function rememberLink(url: string, label?: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  await rememberSavedLink(user.id, url, label);
  revalidatePath("/settings");
}

/**
 * Share one of my links with my active team (any member may — a link is a link) or take it
 * back. Shared links show up in teammates' dropdowns, attributed to me.
 */
export async function setSavedLinkShared(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const id = String(formData.get("id") ?? "");
  const share = String(formData.get("share")) === "true";
  const link = await prisma.savedLink.findFirst({ where: { id, userId: user.id } });
  if (!link) throw new Error("Link not found");
  if (share && !user.activeTeamId) throw new Error("No active team");

  await prisma.savedLink.update({
    where: { id: link.id },
    data: { teamId: share ? user.activeTeamId : null },
  });
  revalidateLinkPages();
}

/**
 * Delete a saved link. Mine: gone for good. Someone else's: only a TRAINER of that team may
 * act on it, and only to pull it out of the team — the link stays in its owner's private
 * library, since a trainer moderates what the team sees, not what a member keeps.
 */
export async function deleteSavedLink(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const id = String(formData.get("id") ?? "");
  const link = await prisma.savedLink.findUnique({ where: { id } });
  if (!link) throw new Error("Link not found");

  if (link.userId === user.id) {
    await prisma.savedLink.delete({ where: { id: link.id } });
  } else {
    const sharedWithMyTeam = link.teamId != null && user.teamIds.includes(link.teamId);
    if (!isTrainer(user.role) || !sharedWithMyTeam) throw new Error("Not allowed");
    await prisma.savedLink.update({ where: { id: link.id }, data: { teamId: null } });
  }
  revalidateLinkPages();
}

/** Per-member toggle: whether teammates' shared links appear in my link dropdown. */
export async function setShowTeamLinks(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  await prisma.user.update({
    where: { id: user.id },
    data: { showTeamLinks: formData.get("showTeamLinks") === "on" },
  });
  revalidateLinkPages();
  redirect("/settings");
}
