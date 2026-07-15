-- CreateTable
CREATE TABLE "Routine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "teamId" TEXT,
    "name" TEXT NOT NULL,
    "exercises" TEXT NOT NULL DEFAULT '[]',
    "copiedFromId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Routine_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_StrengthProgram" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "equipment" TEXT NOT NULL DEFAULT 'NONE',
    "daysPerWeek" INTEGER NOT NULL DEFAULT 2,
    "minutesPerSession" INTEGER NOT NULL DEFAULT 45,
    "trainingMaxPct" REAL NOT NULL DEFAULT 0.9,
    "rounding" REAL NOT NULL DEFAULT 2.5,
    "movements" TEXT NOT NULL,
    "days" TEXT NOT NULL DEFAULT '[]',
    "weightedLayout" TEXT NOT NULL DEFAULT 'ROTATE',
    "notes" TEXT,
    "cycle" INTEGER NOT NULL DEFAULT 1,
    "week" INTEGER NOT NULL DEFAULT 1,
    "consecutiveHolds" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "paused" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "StrengthProgram_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_StrengthProgram" ("active", "consecutiveHolds", "createdAt", "cycle", "days", "daysPerWeek", "equipment", "id", "minutesPerSession", "mode", "movements", "notes", "rounding", "trainingMaxPct", "updatedAt", "userId", "week", "weightedLayout") SELECT "active", "consecutiveHolds", "createdAt", "cycle", "days", "daysPerWeek", "equipment", "id", "minutesPerSession", "mode", "movements", "notes", "rounding", "trainingMaxPct", "updatedAt", "userId", "week", "weightedLayout" FROM "StrengthProgram";
DROP TABLE "StrengthProgram";
ALTER TABLE "new_StrengthProgram" RENAME TO "StrengthProgram";
CREATE INDEX "StrengthProgram_userId_idx" ON "StrengthProgram"("userId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Routine_userId_idx" ON "Routine"("userId");

-- CreateIndex
CREATE INDEX "Routine_teamId_idx" ON "Routine"("teamId");
