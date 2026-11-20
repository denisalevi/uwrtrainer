// Pure helpers for read-only API tokens (machine clients such as a team chat bot).
// DB access lives in api-token-store.ts; these are unit-tested in api-tokens.test.ts.
import { createHash, randomBytes } from "crypto";
import { addDays } from "@/lib/dates";

/** Every raw token starts with this, so a leaked one is recognisable (and greppable). */
export const API_TOKEN_PREFIX = "uwr_";

/** Scopes a token can carry. Only the feed exists today; the column leaves room for more. */
export const API_SCOPES = ["feed:read"] as const;
export type ApiScope = (typeof API_SCOPES)[number];

/** How many characters of the raw token the settings list shows (prefix + 4). */
const DISPLAY_PREFIX_LEN = API_TOKEN_PREFIX.length + 4;

export const API_TOKEN_NAME_MAX = 60;

/** A fresh raw token: "uwr_" + 32 random bytes as base64url. Only its hash is stored. */
export function generateApiToken(): { raw: string; hash: string; prefix: string } {
  const raw = API_TOKEN_PREFIX + randomBytes(32).toString("base64url");
  return { raw, hash: hashApiToken(raw), prefix: raw.slice(0, DISPLAY_PREFIX_LEN) };
}

/** SHA-256 hex of a raw token — what the ApiToken row stores and is looked up by. */
export function hashApiToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/** Whether a string has the shape of one of our raw tokens (cheap pre-check before the DB). */
export function looksLikeApiToken(raw: string): boolean {
  return /^uwr_[A-Za-z0-9_-]{40,60}$/.test(raw);
}

/** The token from an `Authorization: Bearer <token>` header, or null. */
export function parseBearer(header: string | null | undefined): string | null {
  if (!header) return null;
  const m = /^Bearer\s+(\S+)\s*$/i.exec(header);
  return m ? m[1] : null;
}

/** Whether a token row may be used right now for `scope`. */
export function apiTokenUsable(
  token: { revokedAt: Date | null; scope: string },
  scope: ApiScope,
): boolean {
  return token.revokedAt === null && token.scope === scope;
}

/** Don't write lastUsedAt on every request — once per this interval is plenty for the list. */
export const LAST_USED_WRITE_INTERVAL_MS = 5 * 60 * 1000;

export function shouldTouchLastUsed(lastUsedAt: Date | null, now: Date): boolean {
  return !lastUsedAt || now.getTime() - lastUsedAt.getTime() >= LAST_USED_WRITE_INTERVAL_MS;
}

// ---- Feed date range ----

export const FEED_DEFAULT_DAYS = 7;
export const FEED_MAX_DAYS = 92;

export type FeedRange = {
  /** Inclusive local-midnight start. */
  start: Date;
  /** Exclusive local-midnight end (the day after `until`). */
  end: Date;
  /** Echoed back as yyyy-mm-dd. */
  since: string;
  until: string;
};

/** yyyy-mm-dd in local time — the same day grouping the feed page uses. */
export function localDayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseDay(v: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(y, mo - 1, d);
  // Reject rollovers like 2026-02-31.
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return null;
  return date;
}

/**
 * Resolve the `since` / `until` query params (yyyy-mm-dd, both inclusive, local days).
 * Defaults: until = today, since = until − 6 days (one week). The window is capped at
 * FEED_MAX_DAYS so one call can't pull the whole history.
 */
export function parseFeedRange(
  sinceParam: string | null,
  untilParam: string | null,
  now: Date,
): FeedRange | { error: string } {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  const until = untilParam ? parseDay(untilParam) : today;
  if (!until) return { error: "until must be a date in YYYY-MM-DD format" };
  const since = sinceParam ? parseDay(sinceParam) : addDays(until, -(FEED_DEFAULT_DAYS - 1));
  if (!since) return { error: "since must be a date in YYYY-MM-DD format" };
  if (since.getTime() > until.getTime()) return { error: "since must not be after until" };

  const end = addDays(until, 1);
  const days = Math.round((end.getTime() - since.getTime()) / 86_400_000);
  if (days > FEED_MAX_DAYS) return { error: `range too long (max ${FEED_MAX_DAYS} days)` };

  return { start: since, end, since: localDayKey(since), until: localDayKey(until) };
}

// ---- Rate limiting ----

/**
 * Fixed-window, in-memory request counter per key (token id). Good enough for one app
 * process and a handful of tokens; it resets on restart, which is fine for an abuse brake.
 */
export class RateLimiter {
  private hits = new Map<string, { windowStart: number; count: number }>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  /** Count one request; returns whether it is allowed and, if not, seconds until reset. */
  check(key: string, nowMs: number): { ok: true } | { ok: false; retryAfterSec: number } {
    const cur = this.hits.get(key);
    if (!cur || nowMs - cur.windowStart >= this.windowMs) {
      this.hits.set(key, { windowStart: nowMs, count: 1 });
      return { ok: true };
    }
    if (cur.count >= this.limit) {
      return { ok: false, retryAfterSec: Math.ceil((cur.windowStart + this.windowMs - nowMs) / 1000) };
    }
    cur.count += 1;
    return { ok: true };
  }
}
