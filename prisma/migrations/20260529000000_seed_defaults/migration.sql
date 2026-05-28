-- Default leaderboards + settings, applied on every deploy (idempotent).
-- Booleans are stored as 0/1 in SQLite.
INSERT OR IGNORE INTO "Leaderboard" ("id","metric","title","enabled","visibility","sortOrder") VALUES
  ('lb_points','ADHERENCE_POINTS','Plan adherence points',1,'EVERYONE',0),
  ('lb_rugby','RUGBY_PRACTICES','Rugby practices attended',1,'EVERYONE',1),
  ('lb_primary','PRIMARY_PRACTICES','Mandatory practices attended',0,'TRAINERS_ONLY',2),
  ('lb_streak','STREAK','Best streak',0,'TRAINERS_ONLY',3);

INSERT OR IGNORE INTO "Setting" ("key","value") VALUES ('teamName','UWR Team');
