-- Per-user planned-weight rounding preference (strength module).
ALTER TABLE "User" ADD COLUMN "weightRounding" TEXT NOT NULL DEFAULT 'DOWN';
ALTER TABLE "User" ADD COLUMN "weightIncrement" REAL NOT NULL DEFAULT 2.5;
