import "server-only";
// DB side of read-only API tokens. Pure helpers (generation, hashing, parsing) live in
// api-tokens.ts.
import { prisma } from "@/lib/db";
import {
  apiTokenUsable,
  hashApiToken,
  looksLikeApiToken,
  shouldTouchLastUsed,
  type ApiScope,
} from "@/lib/api-tokens";

export type AuthenticatedToken = { id: string; teamId: string };

/**
 * Resolve a raw bearer token to its (non-revoked, correctly scoped) row, or null.
 * Lookup is by SHA-256 hash on a unique index, so there is no timing oracle on the raw value.
 */
export async function authenticateApiToken(
  raw: string | null,
  scope: ApiScope,
  now: Date = new Date(),
): Promise<AuthenticatedToken | null> {
  if (!raw || !looksLikeApiToken(raw)) return null;
  const token = await prisma.apiToken.findUnique({
    where: { tokenHash: hashApiToken(raw) },
    select: { id: true, teamId: true, scope: true, revokedAt: true, lastUsedAt: true },
  });
  if (!token || !apiTokenUsable(token, scope)) return null;
  if (shouldTouchLastUsed(token.lastUsedAt, now)) {
    await prisma.apiToken.update({ where: { id: token.id }, data: { lastUsedAt: now } });
  }
  return { id: token.id, teamId: token.teamId };
}

/** All tokens (newest first) for the admin list, with team + creator names. */
export async function listApiTokens() {
  return prisma.apiToken.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      prefix: true,
      scope: true,
      createdAt: true,
      lastUsedAt: true,
      revokedAt: true,
      team: { select: { name: true } },
      createdBy: { select: { name: true } },
    },
  });
}
