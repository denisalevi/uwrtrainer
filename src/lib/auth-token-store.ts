import "server-only";
import { prisma } from "@/lib/db";
import type { AuthTokenType } from "@/lib/constants";
import {
  cooldownOver,
  generateRawToken,
  hashToken,
  tokenExpiry,
  tokenIsValid,
} from "@/lib/auth-tokens";

/**
 * Issue a fresh single-use token for a user, voiding any still-unused older tokens of the
 * same type (only the newest emailed link works). Returns the RAW token for the email link —
 * it is never stored; the row keeps only the SHA-256 hash.
 */
export async function issueAuthToken(userId: string, type: AuthTokenType): Promise<string> {
  const raw = generateRawToken();
  const now = new Date();
  await prisma.$transaction([
    prisma.authToken.deleteMany({ where: { userId, type, usedAt: null } }),
    prisma.authToken.create({
      data: { userId, type, tokenHash: hashToken(raw), expiresAt: tokenExpiry(type, now) },
    }),
  ]);
  return raw;
}

/**
 * Redeem a raw token of the expected type. Marks it used and returns its userId, or null if
 * the token is unknown, the wrong type, expired, or already used. The guarded updateMany
 * (usedAt null) makes double-redemption race-safe.
 */
export async function consumeAuthToken(
  raw: string,
  type: AuthTokenType,
): Promise<string | null> {
  if (!raw) return null;
  const now = new Date();
  const token = await prisma.authToken.findUnique({ where: { tokenHash: hashToken(raw) } });
  if (!token || token.type !== type || !tokenIsValid(token, now)) return null;
  const claimed = await prisma.authToken.updateMany({
    where: { id: token.id, usedAt: null },
    data: { usedAt: now },
  });
  return claimed.count === 1 ? token.userId : null;
}

/** Whether the per-user email cooldown for this token type has passed (abuse brake). */
export async function mailCooldownOver(userId: string, type: AuthTokenType): Promise<boolean> {
  const last = await prisma.authToken.findFirst({
    where: { userId, type },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  return cooldownOver(last?.createdAt ?? null, new Date());
}
