/**
 * Next.js instrumentation hook — runs once when a server instance starts (`next start`).
 *
 * We use it to start an in-process daily scheduler for the weekly non-rugby auto-MISSED
 * reconciliation (Part C). This keeps the scheduler part of the deployable app — no separate
 * OS cron / filesystem setup. The actual work + idempotency guard lives in `lib/missed.ts`
 * (`runWeeklyReconcileIfDue`, guarded by the `missed.lastReconciledWeek` Setting), so it runs
 * exactly once per ISO week even across restarts or multiple same-day checks.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export async function register() {
  // Only the Node.js server runtime should run the scheduler (not Edge, not the build).
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // `next build` sets this phase; never schedule during a build.
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  // Avoid double-registration if `register` is somehow called more than once.
  const g = globalThis as unknown as { __uwrMissedScheduler?: boolean };
  if (g.__uwrMissedScheduler) return;
  g.__uwrMissedScheduler = true;

  // Import lazily so the heavy DB/Prisma graph isn't pulled into the Edge bundle.
  const { runWeeklyReconcileIfDue } = await import("@/lib/missed");

  const tick = async () => {
    try {
      const res = await runWeeklyReconcileIfDue();
      if (res.ran) {
        console.log(
          `[missed-scheduler] reconciled week ${res.week}: ${res.created ?? 0} auto-missed row(s)`,
        );
      }
    } catch (err) {
      console.error("[missed-scheduler] reconciliation failed:", err);
    }
  };

  // Run shortly after boot (not blocking startup), then once per day.
  setTimeout(tick, 30_000).unref?.();
  setInterval(tick, DAY_MS).unref?.();
}
