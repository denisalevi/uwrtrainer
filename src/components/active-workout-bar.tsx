"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useT } from "@/components/i18n-provider";
import {
  clearActiveWorkout,
  readActiveWorkout,
  subscribeActiveWorkout,
  type ActiveWorkout,
} from "@/lib/active-workout";
import { cn } from "@/components/ui";

function fmt(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Global "workout in progress" bar (issue #33), mounted in the app shell so it survives
 * navigation. While the strength logger has a live session, this shows the session clock and
 * any running rest countdown on EVERY page (except the logger itself, which renders its own
 * timers) and links back to the exact session. The countdowns are wall-clock based — the data
 * itself is already safe in the server draft; this is purely the persistent timer UI.
 */
export function ActiveWorkoutBar() {
  const { t } = useT();
  const pathname = usePathname();
  const [active, setActive] = useState<ActiveWorkout | null>(null);
  const [now, setNow] = useState(() => Date.now());
  // The rest alert should fire once per deadline, even if this bar mounted mid-countdown.
  const [alertedAt, setAlertedAt] = useState<number | null>(null);

  useEffect(() => {
    const sync = () => setActive(readActiveWorkout());
    sync();
    return subscribeActiveWorkout(sync);
  }, []);

  const onLogger = pathname?.startsWith("/strength/log") ?? false;
  const visible = !!active && !onLogger;

  useEffect(() => {
    if (!visible) return;
    const tick = () => setNow(Date.now());
    tick();
    const iv = setInterval(tick, 1000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(iv);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [visible]);

  const restEndsAt = active?.rest?.endsAt ?? null;
  const restRemaining = restEndsAt != null ? Math.max(0, Math.ceil((restEndsAt - now) / 1000)) : null;
  const restOver = restEndsAt != null && restRemaining === 0 && now - restEndsAt < 30_000;

  // End-of-rest vibration when the countdown finishes while the user is on another page (the
  // logger's own beep only works while it is mounted). Audio can't reliably autoplay here.
  useEffect(() => {
    if (!visible || restEndsAt == null || alertedAt === restEndsAt) return;
    if (now < restEndsAt) return;
    setAlertedAt(restEndsAt);
    if (active?.rest?.vibrate && typeof navigator !== "undefined" && navigator.vibrate) {
      try {
        navigator.vibrate([180, 80, 180]);
      } catch {
        /* ignore */
      }
    }
  }, [visible, restEndsAt, now, alertedAt, active?.rest?.vibrate]);

  if (!visible || !active) return null;

  const elapsed = Math.max(0, Math.floor((now - active.startedAt) / 1000));
  const href = active.logId ? `/strength/log?id=${active.logId}` : "/strength/log";

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-16 z-30 flex justify-center px-4">
      <div
        className={cn(
          "pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-2xl border px-4 py-2.5 shadow-lg",
          restOver ? "border-amber-300 bg-amber-50" : "border-teal-300 bg-white",
        )}
      >
        <Link href={href} className="flex min-w-0 flex-1 items-center gap-3">
          <span className="text-lg">🏋️</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-medium text-slate-700">
              {active.dayName || t("active.workoutInProgress")}
            </span>
            <span className="block font-mono text-sm font-bold tabular-nums text-slate-900">
              ⏱ {fmt(elapsed)}
              {restRemaining != null && restRemaining > 0 && (
                <span className="ml-2 text-teal-700">
                  {t("strength.rest")} {fmt(restRemaining)}
                </span>
              )}
              {restOver && <span className="ml-2 text-amber-700">{t("strength.restOver")}</span>}
            </span>
          </span>
          <span className="shrink-0 text-xs font-medium text-teal-700 underline">
            {t("active.continue")}
          </span>
        </Link>
        <button
          type="button"
          className="shrink-0 rounded-md px-1.5 py-1 text-slate-400 active:bg-slate-100"
          aria-label={t("common.close")}
          title={t("common.close")}
          onClick={clearActiveWorkout}
        >
          ✕
        </button>
      </div>
    </div>
  );
}
