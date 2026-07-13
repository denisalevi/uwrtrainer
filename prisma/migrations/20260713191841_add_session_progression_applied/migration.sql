-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_SessionLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "category" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DONE',
    "durationMin" INTEGER,
    "missReason" TEXT,
    "practiceSlotId" TEXT,
    "details" TEXT,
    "auto" BOOLEAN NOT NULL DEFAULT false,
    "progressionApplied" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SessionLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SessionLog_practiceSlotId_fkey" FOREIGN KEY ("practiceSlotId") REFERENCES "PracticeSlot" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_SessionLog" ("auto", "category", "createdAt", "date", "details", "durationMin", "id", "missReason", "practiceSlotId", "status", "userId") SELECT "auto", "category", "createdAt", "date", "details", "durationMin", "id", "missReason", "practiceSlotId", "status", "userId" FROM "SessionLog";
DROP TABLE "SessionLog";
ALTER TABLE "new_SessionLog" RENAME TO "SessionLog";
CREATE INDEX "SessionLog_userId_date_idx" ON "SessionLog"("userId", "date");
CREATE INDEX "SessionLog_date_idx" ON "SessionLog"("date");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
