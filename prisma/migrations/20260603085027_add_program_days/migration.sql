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
    "cycle" INTEGER NOT NULL DEFAULT 1,
    "week" INTEGER NOT NULL DEFAULT 1,
    "consecutiveHolds" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "StrengthProgram_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_StrengthProgram" ("active", "consecutiveHolds", "createdAt", "cycle", "daysPerWeek", "equipment", "id", "minutesPerSession", "mode", "movements", "rounding", "trainingMaxPct", "updatedAt", "userId", "week") SELECT "active", "consecutiveHolds", "createdAt", "cycle", "daysPerWeek", "equipment", "id", "minutesPerSession", "mode", "movements", "rounding", "trainingMaxPct", "updatedAt", "userId", "week" FROM "StrengthProgram";
DROP TABLE "StrengthProgram";
ALTER TABLE "new_StrengthProgram" RENAME TO "StrengthProgram";
CREATE INDEX "StrengthProgram_userId_idx" ON "StrengthProgram"("userId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
