-- Blorbo global leaderboard — a single tiny table.
--
-- One row per player, identified by a random recovery code that lives only on
-- their device (localStorage). No personal data: just a made-up nickname and
-- two scores. Safe for kids by design.
--
--   clicks  — physical taps (INTEGER)
--   goo     — total goo earned; can be very large, so REAL (float)
--   created — first-seen time (ms). Set once, never changed. Used to cap clicks
--             to a humanly-plausible rate, so a drive-by can't post a top score.
--
-- `code` is the primary key so re-submitting updates the same row. The recovery
-- code is a SECRET: accepted on write, NEVER returned.

CREATE TABLE IF NOT EXISTS scores (
  code    TEXT PRIMARY KEY,           -- secret per-device recovery code (never returned)
  name    TEXT NOT NULL,              -- chosen nickname (not a real name)
  clicks  INTEGER NOT NULL DEFAULT 0, -- best physical-tap count
  goo     REAL    NOT NULL DEFAULT 0, -- best total goo earned
  created INTEGER NOT NULL DEFAULT 0, -- first-seen, ms since epoch (never updated)
  updated INTEGER NOT NULL DEFAULT 0  -- last update, ms since epoch
);

CREATE INDEX IF NOT EXISTS idx_scores_clicks ON scores (clicks DESC);
CREATE INDEX IF NOT EXISTS idx_scores_goo ON scores (goo DESC);
