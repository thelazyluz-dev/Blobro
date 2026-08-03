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
  goo     REAL    NOT NULL DEFAULT 0, -- goo held right now (may go DOWN — spending is a trade-off)
  cpm     INTEGER NOT NULL DEFAULT 0, -- record manual taps in a rolling minute (ratchets up)
  created INTEGER NOT NULL DEFAULT 0, -- first-seen, ms since epoch (never updated)
  updated INTEGER NOT NULL DEFAULT 0  -- last update, ms since epoch
);
-- NOTE: `cpm` was added after the table already existed in production.
-- CREATE TABLE IF NOT EXISTS cannot add a column to an existing table, and
-- SQLite has no "ADD COLUMN IF NOT EXISTS" — the deploy workflow's
-- apply_schema step runs the ALTER separately and tolerates "duplicate
-- column", so re-running this file stays safe. Fresh databases (and the
-- test harness, which applies this file to an empty D1) get it from the
-- CREATE above.

CREATE INDEX IF NOT EXISTS idx_scores_clicks ON scores (clicks DESC);
CREATE INDEX IF NOT EXISTS idx_scores_goo ON scores (goo DESC);
CREATE INDEX IF NOT EXISTS idx_scores_cpm ON scores (cpm DESC);

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

-- ────────────────────────────────────────────────────────────────────────
-- PR 4: cloud save (one mirrored save per account). ADDITIVE ONLY, same as
-- PR 3a above — nothing here touches `scores`, `users`, `sessions`, or
-- `login_throttle`, and every statement is safe to re-run against the
-- existing production DB (IF NOT EXISTS throughout).
--
-- The client stays authoritative in this PR: the server sanitizes an
-- uploaded save with the same pure `migrate()` the client loads with (see
-- worker/src/rules.ts) and stores the result, it does not re-simulate or
-- verify the numbers are *earned*. `lifetime_goo` and `clicks` are pulled
-- out of `payload` and duplicated as their own columns on purpose: a later
-- anti-cheat PR needs to re-simulate and compare against exactly these two
-- fields, and that should be a cheap indexed/column read, not a JSON parse
-- of every row's blob.
-- ────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS saves (
  user_id      TEXT PRIMARY KEY,           -- one save per account (references users.id)
  rev          INTEGER NOT NULL DEFAULT 0, -- optimistic-concurrency counter; 0 = no save yet
  version      INTEGER NOT NULL DEFAULT 0, -- SaveState.version at last write (CURRENT_VERSION)
  lifetime_goo REAL    NOT NULL DEFAULT 0, -- denormalized from payload — see banner above
  clicks       INTEGER NOT NULL DEFAULT 0, -- denormalized from payload — see banner above
  payload      TEXT    NOT NULL,           -- the sanitized SaveState, JSON-encoded
  updated      INTEGER NOT NULL DEFAULT 0  -- last write, ms since epoch
);

-- ────────────────────────────────────────────────────────────────────────
-- PR 5: save plausibility auditing. ADDITIVE ONLY, same as PR 3a/4 above —
-- nothing here touches `scores`, `users`, `sessions`, `login_throttle`, or
-- `saves`, and every statement is safe to re-run against the existing
-- production DB (IF NOT EXISTS throughout).
--
-- SHADOW MODE: every successful `PUT /save` writes one row here recording the
-- server's opinion of whether the upload's delta was physically achievable —
-- see `verifySaveDelta` in src/game/verify.ts (imported via
-- worker/src/rules.ts) and `savePut` in src/index.ts. It never rejects,
-- blocks, or alters the write itself; enforcement is a later PR, once real
-- data exists to set a threshold instead of a guess.
--
-- A SEPARATE table rather than new columns on `saves`: SQLite has no
-- `ADD COLUMN IF NOT EXISTS`, so altering an existing table isn't safely
-- re-runnable the way every other statement in this file is. An append-only
-- audit trail is also more useful than a single latest verdict — it's the
-- history a later PR needs to pick an evidence-based enforcement threshold.
--
-- `ratio` (goo_gain / max_gain) is the point of this table: the ceiling is
-- deliberately generous (every tap a crit, inside a permanent frenzy, under a
-- permanent ad boost and a permanent max-multiplier event, the whole
-- interval), so honest play should land orders of magnitude below 1 and only
-- gross fabrication crosses it. Accumulating real ratios from real saves is
-- what lets a future PR tighten the bound with evidence instead of a guess.
-- ────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS save_audit (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       TEXT    NOT NULL,           -- references users.id
  rev           INTEGER NOT NULL,           -- the rev this write produced
  created       INTEGER NOT NULL,           -- ms since epoch
  elapsed_sec   REAL    NOT NULL,           -- SERVER-measured gap since the previous write (never client-reported — see savePut)
  goo_gain      REAL    NOT NULL,           -- reported lifetimeGoo gain over the interval
  max_gain      REAL    NOT NULL,           -- the ceiling goo_gain was measured against
  ratio         REAL    NOT NULL,           -- goo_gain / max_gain — the tuning data this table exists to collect
  click_gain    INTEGER NOT NULL,           -- reported tap-count gain over the interval
  flags         TEXT    NOT NULL,           -- comma-joined PlausibilityFlag list; '' when clean
  ok            INTEGER NOT NULL            -- 1 = within bounds, 0 = flagged (never blocks — shadow mode)
);

CREATE INDEX IF NOT EXISTS idx_save_audit_user_created ON save_audit (user_id, created DESC);
CREATE INDEX IF NOT EXISTS idx_save_audit_ok ON save_audit (ok);
