# Scheduler robustness fixes

Two robustness bugs, fixed independently (ship whichever is done):

## 1. Weekly reconcile skips weeks across downtime
- [ ] `runWeeklyReconcileIfDue` (src/lib/missed.ts): instead of only reconciling the single
      most-recently-closed week, walk back from the last completed week to the stored
      `missed.lastReconciledWeek` guard (bounded: at most 8 weeks back when no guard exists or
      the guard is older than the window) and reconcile every closed week after it, oldest
      first, advancing the guard after each week completes.
- [ ] Keep read-then-write guard semantics (same race window as today; note it in a comment —
      multi-instance locking is out of scope).
- [ ] Test (src/lib/missed.test.ts, in-memory fake): a two-week downtime gap reconciles both
      closed weeks, each with its own frozen targets.

## 2. Duplicate-attendance race backstop
- [ ] Check for legitimate same-(user, slot, date) multi-DONE rows — audit updateSession /
      logSession / strength paths.
- [ ] Additive migration `prisma/migrations/<ts>_attendance_dedup_index/migration.sql`:
      first delete pre-existing duplicate slot-tied DONE rugby rows (keep oldest per group),
      then `CREATE UNIQUE INDEX IF NOT EXISTS "SessionLog_attendance_dedup" ON
      "SessionLog"("userId","practiceSlotId","date") WHERE "practiceSlotId" IS NOT NULL AND
      "status"='DONE';`
- [ ] `logPracticeAttendance` (src/app/actions/training.ts): tolerate the unique violation
      (catch P2002 and fall through — the row already exists, which is the desired end state).

## Verification
- [ ] `npx vitest run` and `npm run build` after each item.
