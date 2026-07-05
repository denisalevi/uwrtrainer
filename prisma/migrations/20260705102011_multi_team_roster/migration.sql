-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "registrationCode" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Seed the default team. Its registrationCode stays NULL: at runtime the env
-- REGISTRATION_CODE acts as this team's code until an admin sets one explicitly.
INSERT INTO "Team" ("id", "name") VALUES ('team-default', 'My Team');

-- CreateTable
CREATE TABLE "TeamMembership" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TeamMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TeamMembership_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_PracticeSlot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "teamId" TEXT NOT NULL DEFAULT 'team-default',
    "label" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "time" TEXT,
    "tier" TEXT NOT NULL DEFAULT 'SECONDARY',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PracticeSlot_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_PracticeSlot" ("active", "createdAt", "dayOfWeek", "id", "label", "tier", "time") SELECT "active", "createdAt", "dayOfWeek", "id", "label", "tier", "time" FROM "PracticeSlot";
DROP TABLE "PracticeSlot";
ALTER TABLE "new_PracticeSlot" RENAME TO "PracticeSlot";
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT,
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_User" ("availabilityNote", "createdAt", "email", "id", "locale", "name", "passwordHash", "restBbbSeconds", "restMainSeconds", "restTimerBeep", "restTimerEnabled", "restTimerVibrate", "restWarmupSeconds", "role", "trainerNote", "updatedAt") SELECT "availabilityNote", "createdAt", "email", "id", "locale", "name", "passwordHash", "restBbbSeconds", "restMainSeconds", "restTimerBeep", "restTimerEnabled", "restTimerVibrate", "restWarmupSeconds", "role", "trainerNote", "updatedAt" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "TeamMembership_teamId_idx" ON "TeamMembership"("teamId");

-- CreateIndex
CREATE UNIQUE INDEX "TeamMembership_userId_teamId_key" ON "TeamMembership"("userId", "teamId");

-- Backfill: every existing user becomes a member of the default team, and it becomes
-- their active team.
INSERT INTO "TeamMembership" ("id", "userId", "teamId")
SELECT 'tm-' || lower(hex(randomblob(12))), "id", 'team-default' FROM "User";
UPDATE "User" SET "activeTeamId" = 'team-default';
