// Single source of truth for the app version is package.json.
// Bump it with `npm version <patch|minor|major>` (also creates a git tag vX.Y.Z).
import pkg from "../../package.json";

export const APP_VERSION: string = pkg.version;

/** Short commit hash, injected at build time via NEXT_PUBLIC_GIT_SHA (optional). */
export const GIT_SHA: string = process.env.NEXT_PUBLIC_GIT_SHA ?? "";

/** "v0.2.0" or "v0.2.0 · a1b2c3d" when a build SHA is present. */
export function versionLabel(): string {
  return GIT_SHA ? `v${APP_VERSION} · ${GIT_SHA.slice(0, 7)}` : `v${APP_VERSION}`;
}
