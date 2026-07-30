-- Blorbo global leaderboard — a single tiny table.
--
-- One row per player, identified by a random recovery code that lives only on
-- their device (localStorage). We never store personal data: no email, no real
-- name, no IP, no location — just a made-up nickname and two scores. Safe for
-- kids by design.
--
-- Two ranked metrics:
--   clicks — physical taps (INTEGER)
--   goo    — total goo earned; can be astronomically large, so REAL (float)
--
-- `code` is the primary key so re-submitting from the same device UPDATES the
-- same row. The recovery code is a SECRET: accepted on write, NEVER returned.

CREATE TABLE IF NOT EXISTS scores (
  code    TEXT PRIMARY KEY,           -- secret per-device recovery code (never returned)
  name    TEXT NOT NULL,              -- chosen nickname (not a real name)
  clicks  INTEGER NOT NULL DEFAULT 0, -- best physical-tap count
  goo     REAL    NOT NULL DEFAULT 0, -- best total goo earned
  updated INTEGER NOT NULL DEFAULT 0  -- last update, ms since epoch
);

-- Each leaderboard is "ORDER BY <metric> DESC", so index both metrics.
CREATE INDEX IF NOT EXISTS idx_scores_clicks ON scores (clicks DESC);
CREATE INDEX IF NOT EXISTS idx_scores_goo ON scores (goo DESC);
