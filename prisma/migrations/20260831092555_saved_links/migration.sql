-- CreateTable
CREATE TABLE "SavedLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "teamId" TEXT,
    "label" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SavedLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT,
    "emailVerifiedAt" DATETIME,
    "sessionVersion" INTEGER NOT NULL DEFAULT 0,
    "role" TEXT NOT NULL DEFAULT 'PLAYER',
    "activeTeamId" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "availabilityNote" TEXT,
    "trainerNote" TEXT,
    "restTimerEnabled" BOOLEAN NOT NULL DEFAULT true,
    "restTimerBeep" BOOLEAN NOT NULL DEFAULT true,
    "restTimerVibrate" BOOLEAN NOT NULL DEFAULT true,
    "restWarmupSeconds" INTEGER NOT NULL DEFAULT 75,
    "restMainSeconds" INTEGER NOT NULL DEFAULT 150,
    "restBbbSeconds" INTEGER NOT NULL DEFAULT 90,
    "weightRounding" TEXT NOT NULL DEFAULT 'DOWN',
    "weightIncrement" REAL NOT NULL DEFAULT 2.5,
    "strengthWarmup" TEXT,
    "strengthBbb" TEXT,
    "strengthPullups" BOOLEAN NOT NULL DEFAULT true,
    "strengthRows" BOOLEAN NOT NULL DEFAULT true,
    "showTeamLinks" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_User" ("activeTeamId", "availabilityNote", "createdAt", "email", "emailVerifiedAt", "id", "locale", "name", "passwordHash", "restBbbSeconds", "restMainSeconds", "restTimerBeep", "restTimerEnabled", "restTimerVibrate", "restWarmupSeconds", "role", "sessionVersion", "strengthBbb", "strengthPullups", "strengthRows", "strengthWarmup", "trainerNote", "updatedAt", "weightIncrement", "weightRounding") SELECT "activeTeamId", "availabilityNote", "createdAt", "email", "emailVerifiedAt", "id", "locale", "name", "passwordHash", "restBbbSeconds", "restMainSeconds", "restTimerBeep", "restTimerEnabled", "restTimerVibrate", "restWarmupSeconds", "role", "sessionVersion", "strengthBbb", "strengthPullups", "strengthRows", "strengthWarmup", "trainerNote", "updatedAt", "weightIncrement", "weightRounding" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "SavedLink_teamId_idx" ON "SavedLink"("teamId");

-- CreateIndex
CREATE UNIQUE INDEX "SavedLink_userId_url_key" ON "SavedLink"("userId", "url");
