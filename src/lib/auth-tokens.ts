// Pure helpers for single-use emailed auth tokens (email verification, password reset).
// DB access lives in auth-token-store.ts; these are unit-tested in auth-tokens.test.ts.
import { createHash, randomBytes } from "crypto";
import type { AuthTokenType } from "@/lib/constants";

/** Lifetime of a freshly issued token, per type. */
export const AUTH_TOKEN_TTL_MS: Record<AuthTokenType, number> = {
  VERIFY_EMAIL: 24 * 60 * 60 * 1000, // generous — people open signup mails late
  RESET_PASSWORD: 60 * 60 * 1000, // short — the link grants account takeover
};

/** Minimum gap between two emails of the same type to the same user (simple abuse brake). */
export const AUTH_MAIL_COOLDOWN_MS = 5 * 60 * 1000;

/** Random URL-safe token. Only its hash is stored; the raw value goes into the email link. */
export function generateRawToken(): string {
  return randomBytes(32).toString("base64url");
}

/** SHA-256 hex of a raw token — what the AuthToken row stores/looks up. */
export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/** Expiry timestamp for a token of `type` issued at `now`. */
export function tokenExpiry(type: AuthTokenType, now: Date): Date {
  return new Date(now.getTime() + AUTH_TOKEN_TTL_MS[type]);
}

/** Whether a token row is currently redeemable. */
export function tokenIsValid(
  token: { expiresAt: Date; usedAt: Date | null },
  now: Date,
): boolean {
  return token.usedAt === null && token.expiresAt.getTime() > now.getTime();
}

/** Whether another email may be sent, given when the last token of that type was created. */
export function cooldownOver(lastCreatedAt: Date | null, now: Date): boolean {
  if (!lastCreatedAt) return true;
  return now.getTime() - lastCreatedAt.getTime() >= AUTH_MAIL_COOLDOWN_MS;
}
