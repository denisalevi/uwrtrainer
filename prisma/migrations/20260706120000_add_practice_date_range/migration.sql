-- Optional seasonal availability window for practice slots (summer/winter schedules).
-- Both nullable; null = open-ended. Availability = active AND date within [validFrom, validTo].
ALTER TABLE "PracticeSlot" ADD COLUMN "validFrom" DATETIME;
ALTER TABLE "PracticeSlot" ADD COLUMN "validTo" DATETIME;
