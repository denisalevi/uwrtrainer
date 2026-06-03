-- Default strength program settings, applied on every deploy (idempotent).
-- Whether default plans include a pull/row movement (on by default).
INSERT OR IGNORE INTO "Setting" ("key","value") VALUES ('strength.includePull','true');
