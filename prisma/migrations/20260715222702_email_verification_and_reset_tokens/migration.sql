-- CreateTable
CREATE TABLE "AuthToken" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "usedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuthToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_User" ("activeTeamId", "availabilityNote", "createdAt", "email", "id", "locale", "name", "passwordHash", "restBbbSeconds", "restMainSeconds", "restTimerBeep", "restTimerEnabled", "restTimerVibrate", "restWarmupSeconds", "role", "strengthBbb", "strengthPullups", "strengthRows", "strengthWarmup", "trainerNote", "updatedAt", "weightIncrement", "weightRounding") SELECT "activeTeamId", "availabilityNote", "createdAt", "email", "id", "locale", "name", "passwordHash", "restBbbSeconds", "restMainSeconds", "restTimerBeep", "restTimerEnabled", "restTimerVibrate", "restWarmupSeconds", "role", "strengthBbb", "strengthPullups", "strengthRows", "strengthWarmup", "trainerNote", "updatedAt", "weightIncrement", "weightRounding" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "AuthToken_tokenHash_key" ON "AuthToken"("tokenHash");

-- CreateIndex
CREATE INDEX "AuthToken_userId_type_idx" ON "AuthToken"("userId", "type");

-- Grandfather pre-feature accounts: anyone who already has credentials signed up before
-- email verification existed and must keep being able to log in.
UPDATE "User" SET "emailVerifiedAt" = CURRENT_TIMESTAMP WHERE "passwordHash" IS NOT NULL;
