-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
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
    "weightRounding" TEXT NOT NULL DEFAULT 'DOWN',
    "weightIncrement" REAL NOT NULL DEFAULT 2.5,
    "strengthWarmup" TEXT,
    "strengthBbb" TEXT,
    "strengthPullups" BOOLEAN NOT NULL DEFAULT true,
    "strengthRows" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_User" ("activeTeamId", "availabilityNote", "createdAt", "email", "id", "locale", "name", "passwordHash", "restBbbSeconds", "restMainSeconds", "restTimerBeep", "restTimerEnabled", "restTimerVibrate", "restWarmupSeconds", "role", "strengthBbb", "strengthWarmup", "trainerNote", "updatedAt", "weightIncrement", "weightRounding") SELECT "activeTeamId", "availabilityNote", "createdAt", "email", "id", "locale", "name", "passwordHash", "restBbbSeconds", "restMainSeconds", "restTimerBeep", "restTimerEnabled", "restTimerVibrate", "restWarmupSeconds", "role", "strengthBbb", "strengthWarmup", "trainerNote", "updatedAt", "weightIncrement", "weightRounding" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- The old team-wide "include pull" toggle becomes two per-user toggles; carry its value
-- over for existing users, then retire the Setting row.
UPDATE "User" SET "strengthPullups" = false, "strengthRows" = false
WHERE (SELECT "value" FROM "Setting" WHERE "key" = 'strength.includePull') = 'false';
DELETE FROM "Setting" WHERE "key" = 'strength.includePull';

-- Split the old combined PULL movement state: its bodyweight (pull-up) side seeds the new
-- vertical-pull movement PULLV; PULL keeps the weighted row and its bodyweight exercise
-- resets to the new default (inverted row).
UPDATE "StrengthProgram" SET "movements" = json_set(
  json_remove("movements", '$.PULL.bodyweightExerciseId', '$.PULL.bodyweightCustom'),
  '$.PULLV', json_object(
    'trainingMax', 0,
    'repMax', COALESCE(json_extract("movements", '$.PULL.repMax'), 5),
    'levelIndex', COALESCE(json_extract("movements", '$.PULL.levelIndex'), 0),
    'bodyweightExerciseId', json_extract("movements", '$.PULL.bodyweightExerciseId')
  )
)
WHERE json_valid("movements") AND json_extract("movements", '$.PULL') IS NOT NULL;
