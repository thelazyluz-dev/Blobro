-- Blorbo global leaderboard — a single tiny table.
--
-- One row per player. The player is identified by a random recovery code that
-- lives only on their device (localStorage). We never store any personal data:
-- no email, no name of a real person, no IP, no location — just a made-up
-- nickname and a click count. That keeps this safe for kids by design.
--
-- `code` is the primary key so re-submitting from the same device UPDATES the
-- same row instead of creating duplicates. The recovery code is a SECRET: it is
-- accepted on write but is NEVER returned by the public /top endpoint.

CREATE TABLE IF NOT EXISTS scores (
  code    TEXT PRIMARY KEY,           -- secret per-device recovery code (never returned)
  name    TEXT NOT NULL,              -- chosen nickname (not a real name)
  score   INTEGER NOT NULL DEFAULT 0, -- best click count
  updated INTEGER NOT NULL DEFAULT 0  -- last update, ms since epoch
);

-- The leaderboard query is "ORDER BY score DESC LIMIT N", so index score.
CREATE INDEX IF NOT EXISTS idx_scores_score ON scores (score DESC);
