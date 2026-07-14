-- CreateTable
CREATE TABLE "StrengthProgressionEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "movement" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "decision" TEXT,
    "cycle" INTEGER,
    "before" TEXT NOT NULL,
    "after" TEXT NOT NULL,
    "sessionLogId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StrengthProgressionEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "StrengthProgressionEvent_userId_movement_createdAt_idx" ON "StrengthProgressionEvent"("userId", "movement", "createdAt");
