-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'PLAYER',
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
INSERT INTO "new_User" ("availabilityNote", "createdAt", "email", "id", "locale", "name", "passwordHash", "role", "trainerNote", "updatedAt") SELECT "availabilityNote", "createdAt", "email", "id", "locale", "name", "passwordHash", "role", "trainerNote", "updatedAt" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
