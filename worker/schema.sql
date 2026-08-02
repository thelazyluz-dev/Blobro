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

-- ────────────────────────────────────────────────────────────────────────
-- PR 3a: accounts + sessions (identity only — no game data lives here yet).
-- ADDITIVE ONLY. `scores` above is completely untouched by this migration:
-- no ALTER, no DROP, nothing that could lose an existing player's row. Every
-- statement below is safe to re-run against the existing production DB
-- (IF NOT EXISTS throughout).
-- ────────────────────────────────────────────────────────────────────────

-- One row per account. `email` is required in practice (Google always
-- returns one, and password signup requires one) but is nullable in the
-- schema rather than NOT NULL so a future pure-OAuth provider that doesn't
-- guarantee an email isn't blocked by this table shape.
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,           -- random id (crypto.randomUUID())
  email         TEXT UNIQUE,                -- lowercased
  password_hash TEXT,                       -- pbkdf2$sha256$iter$saltB64$hashB64; NULL for Google-only accounts
  google_sub    TEXT UNIQUE,                -- Google's stable "sub" claim; NULL for password-only accounts
  display_name  TEXT,
  created       INTEGER NOT NULL DEFAULT 0, -- ms since epoch
  last_login    INTEGER NOT NULL DEFAULT 0  -- ms since epoch
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
CREATE INDEX IF NOT EXISTS idx_users_google_sub ON users (google_sub);

-- One row per active session. Only the SHA-256 hash of the session token is
-- ever stored — the raw token lives solely in the player's HttpOnly cookie,
-- so a DB read (backup, dump, injection) can't be replayed as a session.
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,   -- SHA-256(token), base64url
  user_id    TEXT NOT NULL,
  created    INTEGER NOT NULL,   -- ms since epoch
  expires    INTEGER NOT NULL    -- ms since epoch; expired rows are rejected and may be swept
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions (user_id);

-- Simple per-email login throttle. See worker/src/auth.ts `isThrottled` for
-- the honest limitations (no IP dimension, no cleanup sweep).
CREATE TABLE IF NOT EXISTS login_throttle (
  email        TEXT PRIMARY KEY,
  attempts     INTEGER NOT NULL DEFAULT 0,
  window_start INTEGER NOT NULL DEFAULT 0
);
