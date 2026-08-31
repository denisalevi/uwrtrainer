// Saved-link library — pure helpers shared by the server actions, the settings section and
// the warm-up/cool-down link dropdown. A saved link is just a name + an http(s) URL a member
// keeps around ("Mobility warm-up video"), auto-remembered whenever they add a named link to a
// warm-up/cool-down section or a routine, and optionally shared with their team.
// DB access lives in saved-links-store.ts; everything here is data-in/data-out.

import { isSafeHttpUrl, linkLabel } from "@/lib/routines";

export const SAVED_LINK_LABEL_MAX = 60;
export const SAVED_LINK_URL_MAX = 500;

/** One entry of a member's link dropdown: their own links first, then team-shared ones. */
export type LinkOption = {
  id: string;
  label: string;
  url: string;
  /** Name of the teammate who shared it — set only on links the viewer doesn't own. */
  sharedBy?: string;
};

/**
 * Tidy a user-typed URL into something storable: trim, allow the common "youtube.com/…"
 * shorthand by assuming https, and reject anything that isn't a plain http(s) URL (the
 * `isSafeHttpUrl` rule — a saved link becomes an <a href>, so no javascript:/data: ever).
 * Returns null when the input can't be made safe.
 */
export function normalizeLinkUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  if (withScheme.length > SAVED_LINK_URL_MAX) return null;
  return isSafeHttpUrl(withScheme) ? withScheme : null;
}

/** The name to store for a link: what the user typed, else a friendly fallback ("YouTube"). */
export function savedLinkName(label: string | null | undefined, url: string): string {
  const typed = (label ?? "").trim();
  const name = typed || linkLabel({ type: "link", url });
  return name.slice(0, SAVED_LINK_LABEL_MAX);
}

/**
 * Build the dropdown list: the viewer's own links, then the team-shared ones from teammates
 * (dropped entirely when the viewer turned team links off, and never duplicating a URL the
 * viewer already has saved themselves). Each group is sorted by name, case-insensitively.
 */
export function buildLinkOptions(
  own: Array<{ id: string; label: string; url: string }>,
  shared: Array<{ id: string; label: string; url: string; ownerName: string }>,
  showTeamLinks: boolean,
): LinkOption[] {
  const byName = <T extends { label: string }>(a: T, b: T) =>
    a.label.localeCompare(b.label, undefined, { sensitivity: "base" });
  const mine = [...own].sort(byName).map((l) => ({ id: l.id, label: l.label, url: l.url }));
  if (!showTeamLinks) return mine;
  // Same URL shared by several teammates: keep the first only, so the dropdown stays short.
  const seen = new Set(mine.map((l) => l.url));
  const team: LinkOption[] = [];
  for (const l of [...shared].sort(byName)) {
    if (seen.has(l.url)) continue;
    seen.add(l.url);
    team.push({ id: l.id, label: l.label, url: l.url, sharedBy: l.ownerName });
  }
  return [...mine, ...team];
}
