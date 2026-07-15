import { describe, it, expect } from "vitest";
import {
  AUTH_MAIL_COOLDOWN_MS,
  AUTH_TOKEN_TTL_MS,
  cooldownOver,
  generateRawToken,
  hashToken,
  tokenExpiry,
  tokenIsValid,
} from "./auth-tokens";

describe("generateRawToken", () => {
  it("is long, URL-safe, and unique per call", () => {
    const a = generateRawToken();
    const b = generateRawToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(40); // 32 bytes base64url ≈ 43 chars
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/); // no chars that need URL encoding
  });
});

describe("hashToken", () => {
  it("is deterministic and never echoes the raw token", () => {
    const raw = generateRawToken();
    expect(hashToken(raw)).toBe(hashToken(raw));
    expect(hashToken(raw)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(raw)).not.toContain(raw);
    expect(hashToken(raw)).not.toBe(hashToken(raw + "x"));
  });
});

describe("tokenExpiry", () => {
  const now = new Date("2026-07-15T12:00:00Z");

  it("verification links live 24h, reset links 1h", () => {
    expect(tokenExpiry("VERIFY_EMAIL", now).getTime() - now.getTime()).toBe(
      AUTH_TOKEN_TTL_MS.VERIFY_EMAIL,
    );
    expect(tokenExpiry("RESET_PASSWORD", now).toISOString()).toBe("2026-07-15T13:00:00.000Z");
  });
});

describe("tokenIsValid", () => {
  const now = new Date("2026-07-15T12:00:00Z");
  const future = new Date("2026-07-15T13:00:00Z");
  const past = new Date("2026-07-15T11:00:00Z");

  it("accepts an unused, unexpired token", () => {
    expect(tokenIsValid({ expiresAt: future, usedAt: null }, now)).toBe(true);
  });
  it("rejects a used token", () => {
    expect(tokenIsValid({ expiresAt: future, usedAt: past }, now)).toBe(false);
  });
  it("rejects an expired token (boundary: expiry == now)", () => {
    expect(tokenIsValid({ expiresAt: past, usedAt: null }, now)).toBe(false);
    expect(tokenIsValid({ expiresAt: now, usedAt: null }, now)).toBe(false);
  });
});

describe("cooldownOver", () => {
  const now = new Date("2026-07-15T12:00:00Z");

  it("allows the first email (no previous token)", () => {
    expect(cooldownOver(null, now)).toBe(true);
  });
  it("blocks within the cooldown, allows at/after it", () => {
    const justNow = new Date(now.getTime() - 1000);
    const atLimit = new Date(now.getTime() - AUTH_MAIL_COOLDOWN_MS);
    expect(cooldownOver(justNow, now)).toBe(false);
    expect(cooldownOver(atLimit, now)).toBe(true);
  });
});
