-- Duplicate-attendance race backstop.
--
-- `logPracticeAttendance` dedups with a read-then-createMany, so two simultaneous submitters
-- could both pass the read and create duplicate DONE rugby rows for the same (user, slot, date),
-- permanently inflating counts. Prisma's SQLite schema language can't express a partial unique
-- index, so it lives in this hand-written additive migration. Slot-tied rows are RUGBY-only by
-- construction (`sessionFields` nulls practiceSlotId for every other category), so the predicate
-- needs no category filter.
--
-- 1. Clean pre-existing duplicates: for slot-tied DONE rows sharing (userId, practiceSlotId,
--    date), keep the oldest row per group (min rowid = first inserted) and delete the rest.
DELETE FROM "SessionLog"
WHERE "practiceSlotId" IS NOT NULL
  AND "status" = 'DONE'
  AND rowid NOT IN (
    SELECT MIN(rowid)
    FROM "SessionLog"
    WHERE "practiceSlotId" IS NOT NULL
      AND "status" = 'DONE'
    GROUP BY "userId", "practiceSlotId", "date"
  );

-- 2. The backstop itself: at most one DONE row per (user, practice slot, exact date).
CREATE UNIQUE INDEX IF NOT EXISTS "SessionLog_attendance_dedup"
ON "SessionLog"("userId", "practiceSlotId", "date")
WHERE "practiceSlotId" IS NOT NULL AND "status" = 'DONE';
