-- Auto-layout strength setup: single-weighted-day layout choice + trainer-visible plan notes.
ALTER TABLE "StrengthProgram" ADD COLUMN "weightedLayout" TEXT NOT NULL DEFAULT 'ROTATE';
ALTER TABLE "StrengthProgram" ADD COLUMN "notes" TEXT;
