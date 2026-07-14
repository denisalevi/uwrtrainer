// Client-side "active workout" marker (issue #33). The strength logger's DATA already survives
// navigation via the server-draft autosave; what used to die with the page were the timers. The
// logger keeps this little record in localStorage while a session is live, and a global bar in
// the app shell (ActiveWorkoutBar) renders the session clock + rest countdown on every page,
// linking back to the logger. Same-tab updates are broadcast via a custom window event;
// cross-tab updates ride the native "storage" event.

export type ActiveWorkout = {
  /** SessionLog id once the first autosave created it — makes the resume link precise. */
  logId?: string;
  /** yyyy-mm-dd of the session (always "today" — only live sessions are marked). */
  date: string;
  dayName?: string;
  /** Wall-clock session start (ms epoch) — the logger's session clock. */
  startedAt: number;
  /** Running rest countdown, wall-clock deadline; null/absent when idle. */
  rest?: { endsAt: number; vibrate: boolean } | null;
  updatedAt: number;
};

const KEY = "uwr.activeWorkout";
const EVENT = "uwr:active-workout";
/** A marker untouched for this long is stale (an abandoned draft) — ignore and drop it. */
export const ACTIVE_WORKOUT_MAX_AGE_MS = 12 * 60 * 60 * 1000;

export function readActiveWorkout(): ActiveWorkout | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ActiveWorkout;
    if (typeof parsed?.startedAt !== "number" || typeof parsed?.date !== "string") return null;
    if (Date.now() - (parsed.updatedAt ?? parsed.startedAt) > ACTIVE_WORKOUT_MAX_AGE_MS) {
      clearActiveWorkout();
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/** Merge `patch` into the stored marker (creating it when `startedAt`/`date` are supplied). */
export function writeActiveWorkout(patch: Partial<ActiveWorkout>): void {
  if (typeof window === "undefined") return;
  try {
    const cur = readActiveWorkout();
    const startedAt = patch.startedAt ?? cur?.startedAt;
    const date = patch.date ?? cur?.date;
    if (startedAt == null || !date) return; // nothing live to describe
    const next: ActiveWorkout = { ...cur, ...patch, startedAt, date, updatedAt: Date.now() };
    window.localStorage.setItem(KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(EVENT));
  } catch {
    /* storage unavailable — the in-page timers still work */
  }
}

export function clearActiveWorkout(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY);
    window.dispatchEvent(new Event(EVENT));
  } catch {
    /* ignore */
  }
}

/** Re-run `cb` whenever the marker changes (same tab or another tab). Returns an unsubscribe. */
export function subscribeActiveWorkout(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}
