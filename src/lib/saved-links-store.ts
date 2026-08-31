import "server-only";

// Saved-link library — the DB side (pure helpers live in saved-links.ts). Used by the link
// server actions, the settings section and the pages that feed the warm-up/cool-down dropdown.

import { prisma } from "@/lib/db";
import type { CurrentUser } from "@/lib/dal";
import { buildLinkOptions, normalizeLinkUrl, savedLinkName, type LinkOption } from "@/lib/saved-links";

/**
 * Remember a link in the owner's library. Idempotent per URL: adding a link that's already
 * saved just refreshes its name (and never touches its sharing). Invalid/unsafe URLs are
 * ignored silently — remembering is a side effect of adding a link somewhere else and must
 * never break that flow.
 */
export async function rememberSavedLink(
  userId: string,
  rawUrl: string,
  label?: string | null,
): Promise<void> {
  const url = normalizeLinkUrl(rawUrl);
  if (!url) return;
  const name = savedLinkName(label, url);
  await prisma.savedLink.upsert({
    where: { userId_url: { userId, url } },
    update: { label: name },
    create: { userId, url, label: name },
  });
}

/** The viewer's library: their own links plus the ones teammates shared with their teams. */
export async function getLinkLibrary(user: CurrentUser) {
  const own = await prisma.savedLink.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
  });
  const shared = user.teamIds.length
    ? await prisma.savedLink.findMany({
        where: { teamId: { in: user.teamIds }, userId: { not: user.id } },
        include: { user: { select: { name: true } } },
        orderBy: { createdAt: "asc" },
      })
    : [];
  return { own, shared };
}

/** The dropdown list for the warm-up/cool-down link fields (own + team, per the user's toggle). */
export async function getLinkOptions(user: CurrentUser): Promise<LinkOption[]> {
  const { own, shared } = await getLinkLibrary(user);
  return buildLinkOptions(
    own,
    shared.map((l) => ({ id: l.id, label: l.label, url: l.url, ownerName: l.user.name })),
    user.showTeamLinks,
  );
}
