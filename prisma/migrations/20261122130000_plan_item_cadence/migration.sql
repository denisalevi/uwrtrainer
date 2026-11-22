-- Monthly goals: a plan item's target is per week (default) or per calendar month.
ALTER TABLE "PlanItem" ADD COLUMN "cadence" TEXT NOT NULL DEFAULT 'WEEK';
