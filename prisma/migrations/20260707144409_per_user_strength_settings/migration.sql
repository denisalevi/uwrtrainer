-- AlterTable
ALTER TABLE "User" ADD COLUMN "strengthBbb" TEXT;
ALTER TABLE "User" ADD COLUMN "strengthWarmup" TEXT;

-- These were team-wide settings before: seed every user with the current team values
-- (NULL when never customised → built-in defaults), then drop the old Setting rows.
UPDATE "User" SET "strengthWarmup" = (SELECT "value" FROM "Setting" WHERE "key" = 'strength.warmupScheme');
UPDATE "User" SET "strengthBbb" = (SELECT "value" FROM "Setting" WHERE "key" = 'strength.bbb');
DELETE FROM "Setting" WHERE "key" IN ('strength.warmupScheme', 'strength.bbb');
