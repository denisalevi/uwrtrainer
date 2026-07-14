"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useT } from "@/components/i18n-provider";
import { Button, cn } from "@/components/ui";

export type SetKind = "warmup" | "main" | "bbb";

export type RestTimerSettings = {
  enabled: boolean;
  beep: boolean;
  vibrate: boolean;
  warmupSeconds: number;
  mainSeconds: number;
  bbbSeconds: number;
};

export type RestTimerController = {
  enabled: boolean;
  remaining: number;
  total: number;
  running: boolean;
  finished: boolean;
  /** Start (or restart) the countdown for a given set kind. */
  startForKind: (kind: SetKind) => void;
  /** Resume a countdown with a known number of seconds left (e.g. from the persisted
   *  wall-clock deadline after navigating back to the logger mid-rest). */
  startWithSeconds: (secs: number) => void;
  pause: () => void;
  resume: () => void;
  reset: () => void;
  dismiss: () => void;
  /** Unlock audio on a real user gesture (autoplay policy). Safe to call repeatedly. */
  primeAudio: () => void;
};

function secondsForKind(kind: SetKind, s: RestTimerSettings): number {
  if (kind === "warmup") return s.warmupSeconds;
  if (kind === "bbb") return s.bbbSeconds;
  return s.mainSeconds;
}

function fmt(total: number): string {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * A single shared rest timer for the strength logger. Owns the countdown and the
 * end-of-rest beep/vibrate. The countdown starts on `startForKind`, typically from
 * leaving the reps field. Audio must be unlocked on a user gesture first (`primeAudio`).
 */
export function useRestTimer(settings: RestTimerSettings): RestTimerController {
  const [remaining, setRemaining] = useState(0);
  const [total, setTotal] = useState(0);
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);

  // Keep the alert config in refs so the fire-at-zero effect never goes stale.
  const cfg = useRef(settings);
  cfg.current = settings;
  const audioRef = useRef<AudioContext | null>(null);
  // Wall-clock deadline (epoch ms). The displayed remaining time is always recomputed from this,
  // so the countdown stays correct even when the phone locks or the tab is backgrounded and the
  // browser throttles/suspends timers — the normal state between sets at the gym.
  const deadlineRef = useRef<number | null>(null);

  const primeAudio = useCallback(() => {
    if (typeof window === "undefined") return;
    try {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      if (!audioRef.current) audioRef.current = new Ctx();
      if (audioRef.current.state === "suspended") void audioRef.current.resume();
    } catch {
      /* audio unavailable — visual + vibrate still work */
    }
  }, []);

  const beep = useCallback(() => {
    const ctx = audioRef.current;
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.3, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
      osc.start(now);
      osc.stop(now + 0.2);
    } catch {
      /* ignore */
    }
  }, []);

  // Recompute the remaining time from the deadline while running. The interval only refreshes
  // the display; correctness comes from the wall clock, and a visibility/focus change re-syncs
  // immediately after the browser throttled us in the background.
  useEffect(() => {
    if (!running) return;
    const tick = () => {
      const dl = deadlineRef.current;
      if (dl == null) return;
      setRemaining(Math.max(0, Math.ceil((dl - Date.now()) / 1000)));
    };
    tick();
    const id = setInterval(tick, 500);
    document.addEventListener("visibilitychange", tick);
    window.addEventListener("focus", tick);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
      window.removeEventListener("focus", tick);
    };
  }, [running]);

  // Fire the alert exactly when the countdown reaches zero.
  useEffect(() => {
    if (!running || remaining > 0) return;
    setRunning(false);
    setFinished(true);
    if (cfg.current.beep) beep();
    if (cfg.current.vibrate && typeof navigator !== "undefined" && navigator.vibrate) {
      try {
        navigator.vibrate([180, 80, 180]);
      } catch {
        /* ignore */
      }
    }
  }, [running, remaining, beep]);

  const startForKind = useCallback(
    (kind: SetKind) => {
      const secs = secondsForKind(kind, cfg.current);
      if (secs <= 0) return;
      primeAudio();
      deadlineRef.current = Date.now() + secs * 1000;
      setTotal(secs);
      setRemaining(secs);
      setFinished(false);
      setRunning(true);
    },
    [primeAudio],
  );

  const startWithSeconds = useCallback((secs: number) => {
    if (secs <= 0) return;
    // No primeAudio here — this runs from an effect, not a gesture; the first tap on the page
    // unlocks audio as usual, and vibrate works regardless.
    deadlineRef.current = Date.now() + secs * 1000;
    setTotal(secs);
    setRemaining(secs);
    setFinished(false);
    setRunning(true);
  }, []);

  const pause = useCallback(() => {
    const dl = deadlineRef.current;
    if (dl != null) setRemaining(Math.max(0, Math.ceil((dl - Date.now()) / 1000)));
    deadlineRef.current = null;
    setRunning(false);
  }, []);
  const resume = useCallback(() => {
    primeAudio();
    setRemaining((r) => {
      if (r > 0) {
        deadlineRef.current = Date.now() + r * 1000;
        setRunning(true);
      }
      return r;
    });
  }, [primeAudio]);
  const reset = useCallback(() => {
    deadlineRef.current = null;
    setRunning(false);
    setFinished(false);
    setRemaining(total);
  }, [total]);
  const dismiss = useCallback(() => {
    deadlineRef.current = null;
    setRunning(false);
    setFinished(false);
    setRemaining(0);
    setTotal(0);
  }, []);

  return {
    enabled: settings.enabled,
    remaining,
    total,
    running,
    finished,
    startForKind,
    startWithSeconds,
    pause,
    resume,
    reset,
    dismiss,
    primeAudio,
  };
}

/** Sticky bar pinned above the bottom nav; hidden until the timer is armed. */
export function RestTimerBar({ controller }: { controller: RestTimerController }) {
  const { t } = useT();
  const { enabled, remaining, running, finished } = controller;
  const visible = enabled && (running || finished || remaining > 0);
  if (!visible) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-16 z-30 flex justify-center px-4">
      <div
        className={cn(
          "pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-2xl border px-4 py-2.5 shadow-lg",
          finished ? "border-amber-300 bg-amber-50" : "border-teal-300 bg-white",
        )}
      >
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          {t("strength.rest")}
        </span>
        <span
          className={cn(
            "flex-1 text-center font-mono text-2xl font-bold tabular-nums",
            finished ? "text-amber-700" : "text-slate-900",
          )}
        >
          {finished ? t("strength.restOver") : fmt(remaining)}
        </span>
        {finished ? (
          <Button type="button" size="sm" variant="secondary" onClick={controller.dismiss}>
            {t("common.close")}
          </Button>
        ) : (
          <>
            {running ? (
              <Button type="button" size="sm" variant="secondary" onClick={controller.pause}>
                {t("strength.restPause")}
              </Button>
            ) : (
              <Button type="button" size="sm" variant="secondary" onClick={controller.resume}>
                {t("strength.restResume")}
              </Button>
            )}
            <Button type="button" size="sm" variant="ghost" onClick={controller.reset}>
              {t("strength.restReset")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              aria-label={t("strength.restDismiss")}
              title={t("strength.restDismiss")}
              onClick={controller.dismiss}
            >
              ✕
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
