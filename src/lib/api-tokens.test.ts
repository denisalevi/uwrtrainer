import { describe, it, expect } from "vitest";
import {
  FEED_MAX_DAYS,
  RateLimiter,
  apiTokenUsable,
  generateApiToken,
  hashApiToken,
  looksLikeApiToken,
  parseBearer,
  parseFeedRange,
  shouldTouchLastUsed,
  LAST_USED_WRITE_INTERVAL_MS,
} from "./api-tokens";

describe("generateApiToken", () => {
  it("is prefixed, URL-safe, unique, and stores only a matching hash", () => {
    const a = generateApiToken();
    const b = generateApiToken();
    expect(a.raw).not.toBe(b.raw);
    expect(a.raw).toMatch(/^uwr_[A-Za-z0-9_-]{43}$/);
    expect(a.hash).toBe(hashApiToken(a.raw));
    expect(a.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(a.hash).not.toContain(a.raw.slice(4));
    expect(a.prefix).toBe(a.raw.slice(0, 8));
    expect(looksLikeApiToken(a.raw)).toBe(true);
  });
});

describe("looksLikeApiToken", () => {
  it("rejects other shapes", () => {
    expect(looksLikeApiToken("")).toBe(false);
    expect(looksLikeApiToken("uwr_short")).toBe(false);
    expect(looksLikeApiToken("abc_" + "x".repeat(43))).toBe(false);
    expect(looksLikeApiToken("uwr_" + "x".repeat(42) + "!")).toBe(false);
  });
});

describe("parseBearer", () => {
  it("extracts the token from a Bearer header", () => {
    expect(parseBearer("Bearer uwr_abc")).toBe("uwr_abc");
    expect(parseBearer("bearer   uwr_abc ")).toBe("uwr_abc");
  });
  it("returns null for anything else", () => {
    expect(parseBearer(null)).toBeNull();
    expect(parseBearer("")).toBeNull();
    expect(parseBearer("Basic dXNlcjpwYXNz")).toBeNull();
    expect(parseBearer("Bearer")).toBeNull();
    expect(parseBearer("Bearer a b")).toBeNull();
  });
});

describe("apiTokenUsable", () => {
  it("requires not revoked and the right scope", () => {
    expect(apiTokenUsable({ revokedAt: null, scope: "feed:read" }, "feed:read")).toBe(true);
    expect(apiTokenUsable({ revokedAt: new Date(), scope: "feed:read" }, "feed:read")).toBe(false);
    expect(apiTokenUsable({ revokedAt: null, scope: "other" }, "feed:read")).toBe(false);
  });
});

describe("shouldTouchLastUsed", () => {
  const now = new Date(2026, 10, 20, 12, 0, 0);
  it("writes when never used or stale, skips when fresh", () => {
    expect(shouldTouchLastUsed(null, now)).toBe(true);
    expect(shouldTouchLastUsed(new Date(now.getTime() - LAST_USED_WRITE_INTERVAL_MS), now)).toBe(true);
    expect(shouldTouchLastUsed(new Date(now.getTime() - 1000), now)).toBe(false);
  });
});

describe("parseFeedRange", () => {
  const now = new Date(2026, 10, 20, 15, 30); // Fri 2026-11-20, local

  it("defaults to the last 7 days including today", () => {
    const r = parseFeedRange(null, null, now);
    if ("error" in r) throw new Error(r.error);
    expect(r.since).toBe("2026-11-14");
    expect(r.until).toBe("2026-11-20");
    expect(r.start).toEqual(new Date(2026, 10, 14));
    expect(r.end).toEqual(new Date(2026, 10, 21));
  });

  it("takes explicit inclusive since/until", () => {
    const r = parseFeedRange("2026-11-16", "2026-11-18", now);
    if ("error" in r) throw new Error(r.error);
    expect(r.start).toEqual(new Date(2026, 10, 16));
    expect(r.end).toEqual(new Date(2026, 10, 19));
  });

  it("since alone runs up to today", () => {
    const r = parseFeedRange("2026-11-16", null, now);
    if ("error" in r) throw new Error(r.error);
    expect(r.until).toBe("2026-11-20");
  });

  it("rejects bad dates, reversed and too-long ranges", () => {
    expect(parseFeedRange("16.11.2026", null, now)).toHaveProperty("error");
    expect(parseFeedRange("2026-02-31", "2026-03-01", now)).toHaveProperty("error");
    expect(parseFeedRange(null, "nope", now)).toHaveProperty("error");
    expect(parseFeedRange("2026-11-19", "2026-11-18", now)).toHaveProperty("error");
    expect(parseFeedRange("2026-01-01", "2026-11-20", now)).toHaveProperty("error");
  });

  it("allows exactly the maximum window", () => {
    const until = new Date(2026, 10, 20);
    const since = new Date(until);
    since.setDate(since.getDate() - (FEED_MAX_DAYS - 1));
    const key = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    expect(parseFeedRange(key(since), "2026-11-20", now)).not.toHaveProperty("error");
    since.setDate(since.getDate() - 1);
    expect(parseFeedRange(key(since), "2026-11-20", now)).toHaveProperty("error");
  });
});

describe("RateLimiter", () => {
  it("allows `limit` requests per window per key, then reports retry-after", () => {
    const rl = new RateLimiter(2, 60_000);
    expect(rl.check("a", 0)).toEqual({ ok: true });
    expect(rl.check("a", 1000)).toEqual({ ok: true });
    expect(rl.check("a", 2000)).toEqual({ ok: false, retryAfterSec: 58 });
    expect(rl.check("b", 2000)).toEqual({ ok: true }); // separate key
    expect(rl.check("a", 60_000)).toEqual({ ok: true }); // new window
  });
});
