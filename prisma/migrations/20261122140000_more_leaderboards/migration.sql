-- Two absolute-count leaderboards after the rugby ones: tournament days, sessions besides rugby.
INSERT OR IGNORE INTO "Leaderboard" ("id","metric","title","enabled","visibility","sortOrder") VALUES
  ('lb_tournaments','TOURNAMENT_DAYS','Tournament days',1,'EVERYONE',3),
  ('lb_other','OTHER_SESSIONS','Sessions besides rugby',1,'EVERYONE',4);
-- Keep the streak board last (only if it still has its default position).
UPDATE "Leaderboard" SET "sortOrder" = 5 WHERE "metric" = 'STREAK' AND "sortOrder" = 3;
