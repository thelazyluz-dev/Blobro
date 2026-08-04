# Blorbo global leaderboard — deploy guide

This is a tiny [Cloudflare Worker](https://workers.cloudflare.com/) + [D1](https://developers.cloudflare.com/d1/)
database that powers the shared leaderboard everyone sees. It is built to stay
on Cloudflare's **free tier forever** at family scale — no credit card needed,
**₪0/month**.

- **Free limits:** Workers = 100,000 requests/day, D1 = 5 GB + 5M reads/day.
  A few kids tapping phones will use a rounding error's worth of that.
- **Privacy:** only a nickname + click count + a random per-device recovery
  code are stored. No email, no real name, no IP, no location. The recovery
  code is a secret and is **never** returned by the public `/top` endpoint.

## One-time setup (about 5 minutes)

You only do this once. Everything runs from inside this `worker/` folder.

### 1. Create a free Cloudflare account

Go to <https://dash.cloudflare.com/sign-up> and sign up. No payment info needed
for the free plan.

### 2. Install the tools

You need [Node.js](https://nodejs.org/) installed. Then, from this folder:

```bash
cd worker
npm install
```

### 3. Log in to Cloudflare

```bash
npx wrangler login
```

This opens your browser to authorize. Approve it.

### 4. Create the database

```bash
npx wrangler d1 create blorbo-leaderboard
```

It prints a `database_id`. **This is already filled in** in `wrangler.toml` for
the existing database — you only need to paste a new one if you ever create a
fresh database. The id is an identifier, not a credential: reaching the data
still requires access to this Cloudflare account, which is why it lives in
config instead of being re-pasted on every checkout.

### 5. Create the table

```bash
npx wrangler d1 execute blorbo-leaderboard --remote --file=./schema.sql
```

### 6. Deploy the Worker

```bash
npx wrangler deploy
```

It prints your Worker's public URL, e.g.:

```
https://blorbo-leaderboard.YOUR-SUBDOMAIN.workers.dev
```

### 7. Point the app at it

Open **`src/config.ts`** (in the app root, not this folder) and paste that URL:

```ts
export const LEADERBOARD_API = 'https://blorbo-leaderboard.YOUR-SUBDOMAIN.workers.dev';
```

Commit + push. The next deploy turns the leaderboard global for everyone. ✅

## Test it quickly

```bash
# Should print {"ok":true}
curl https://blorbo-leaderboard.YOUR-SUBDOMAIN.workers.dev/health

# Submit a score
curl -X POST https://blorbo-leaderboard.YOUR-SUBDOMAIN.workers.dev/submit \
  -H 'Content-Type: application/json' \
  -d '{"code":"testcode123","name":"טסט","score":42}'

# Read the top list (note: no codes are ever returned)
curl https://blorbo-leaderboard.YOUR-SUBDOMAIN.workers.dev/top
```

## If you ever want to reset the table

```bash
npx wrangler d1 execute blorbo-leaderboard --remote \
  --command "DELETE FROM scores;"
```

That's it. If `LEADERBOARD_API` in `src/config.ts` is left empty, the app falls
back to a device-only leaderboard and nothing breaks.

---

## Auth (PR 3a) — accounts + sessions

This adds **identity only**: email/password and Google sign-in, session
cookies, `/auth/me`. It does **not** move any game logic server-side (that's a
later PR) and it does **not** touch the `scores` table or the leaderboard
endpoints above — they keep working exactly as before, with or without auth
configured.

**The app only offers Google sign-in, and the password routes are now switched
OFF.** `/auth/register` and `/auth/login` answer `404` unless
`ALLOW_PASSWORD_AUTH="1"` is set. The implementation and its tests remain — the
routes are disabled, not deleted.

Why: no UI reached them (there is no password-reset flow, so a child who forgot
one would be locked out forever — see the header comment in
`src/ui/AuthGate.tsx`), but they stayed reachable by anyone who knew the path,
and `/auth/register` answered `409 email-taken` for a registered address and
`201` otherwise. That is an email-enumeration oracle on a children's app.
Disabling removes the oracle, the password-guessing surface and the
login-throttle question in one move — the safest code is code that does not run.

`404`, not `403`: a `403` would confirm the route exists, which is the one bit
of information this is meant to withhold.

The auth endpoints are served from `api.bl-or-bo.com` (a subdomain of the app,
so the session cookie is same-site) — see `cookieDomainFor` in `src/auth.ts`.
Until that custom domain is wired up, the Worker's `*.workers.dev` URL still
works for `/auth/*` too, just with a host-only cookie instead of one shared
across the apex domain.

### 1. Apply the additive schema changes

The `users`, `sessions`, and `login_throttle` tables were added to
`schema.sql`. Re-running the whole file is safe — every statement is
`CREATE TABLE/INDEX IF NOT EXISTS`, and the existing `scores` table/rows are
never touched:

```bash
npx wrangler d1 execute blorbo-leaderboard --remote --file=./schema.sql
```

### 2. Configure environment variables and secrets

| Name | Kind | Purpose | Default if unset |
|---|---|---|---|
| `GOOGLE_CLIENT_ID` | var (in `wrangler.toml`) | OAuth client ID from Google Cloud Console. Public by design — the browser sees it in the consent URL — so it lives in config, not in a secret. | Google sign-in answers `501` |
| `GOOGLE_CLIENT_SECRET` | secret | OAuth client secret. Also used to HMAC-sign the short-lived PKCE `state` cookie — see `src/auth.ts` | Google sign-in answers `501` |
| `APP_ORIGIN` | var | Where `/auth/google/callback` redirects back to after sign-in | `https://bl-or-bo.com` |
| `SESSION_TTL_DAYS` | var | How long a session cookie/row lasts | `30` |

Only `GOOGLE_CLIENT_SECRET` is a secret. The client ID is public by design (the
browser sees it in Google's consent URL), so it lives in `wrangler.toml` — one
less thing to set by hand and one less value to lose:

```bash
npx wrangler secret put GOOGLE_CLIENT_SECRET
```

(`GOOGLE_CLIENT_ID` needs no command — it is already set in `wrangler.toml`.)

`APP_ORIGIN` and `SESSION_TTL_DAYS` are plain vars (not secret) — add them to
`wrangler.toml` if you want to override the defaults, e.g.:

```toml
[vars]
APP_ORIGIN = "https://bl-or-bo.com"
SESSION_TTL_DAYS = "30"
```

**Getting a Google OAuth client:** in
[Google Cloud Console](https://console.cloud.google.com/apis/credentials),
create an "OAuth client ID" of type "Web application", with an authorized
redirect URI of `https://api.bl-or-bo.com/auth/google/callback` (and, for
local testing, your `*.workers.dev` equivalent).

### 3. Redeploy

**From a phone, or from anywhere:** GitHub → Actions → **Deploy Worker** → Run
workflow. Tick *apply_schema* only when a change added tables.

That path runs the full test suite first and a live sanity check after, and it
cannot be run from the wrong directory or with the wrong wrangler version —
all three of which have gone wrong doing this by hand. It needs one secret,
set once: **Settings → Secrets and variables → Actions → New repository
secret**, named `CLOUDFLARE_API_TOKEN`.

Create the token at **dash.cloudflare.com → My Profile → API Tokens → Create
Token → Edit Cloudflare Workers**. It needs Workers Scripts: Edit and D1: Edit,
scoped to this account only. Treat it like a password — it can deploy code and
read the database.

By hand, if you prefer (from this folder, never from the repo root):

```bash
npx wrangler deploy
```

### Testing

- **Unit tests** for the crypto/session primitives (`worker/src/auth.ts`) live
  in `worker/test/auth.test.ts` and run under the root `npm test` (plain
  Node — WebCrypto is a global in both Node ≥18 and the Workers runtime, so
  no special environment is needed for these).
- **Real endpoint integration tests** (`worker/test/auth-endpoints.integration.test.ts`)
  run the actual `src/index.ts` `fetch` handler inside Miniflare/workerd via
  `@cloudflare/vitest-pool-workers`, against a local D1 seeded from the real
  `schema.sql`. These are **not** part of the root `npm test` (they need their
  own vitest install/pool — see `worker/vitest.config.ts` for why) and don't
  run automatically; from this folder:

  ```bash
  cd worker
  npm install   # first time only — installs @cloudflare/vitest-pool-workers
  npx vitest run
  ```

  Not covered even here: the Google OAuth callback's happy path, which needs
  a real authorization `code` from Google. What's tested instead is that both
  Google routes fail closed (`501`) when the secrets aren't configured, plus
  the PKCE/state-signing mechanics as plain unit tests.

### Security properties (and honest limits)

- Passwords: PBKDF2-HMAC-SHA256, 100,000+ iterations, random salt,
  constant-time verification. See `worker/src/auth.ts` for the exact format.
- Session tokens: 32 random bytes; only their SHA-256 hash is ever stored.
- Login throttling is **per-email only**, backed by a small D1 table, with no
  IP dimension and no cleanup sweep for probed-but-nonexistent emails — it
  stops a naive password-guessing loop against one account, nothing more.
  See `isThrottled` in `src/auth.ts`.
- Google sign-in trusts the `userinfo` endpoint reached via the server-side
  code+PKCE token exchange, rather than verifying the ID token's RS256
  signature against Google's JWKS by hand. Common and accepted, but weaker
  than local JWT verification — a candidate for later hardening.

---

## Cloud save (PR 4) — mirror a signed-in player's save

This adds two credentialed (cookie-session) endpoints so a signed-in
player's save can follow them across devices:

```
GET  /save   → { rev, updated, save } | { rev: 0, updated: 0, save: null } | 401
PUT  /save   → { rev, updated } | 409 { error: 'stale', rev, updated, save } | 401
     body: { baseRev, save }
```

**The client stays authoritative in this PR.** The server does not
re-simulate anything or check that a save's numbers were actually earned —
it only *sanitizes* an uploaded save and stores it. It does that by running
the upload through `migrate()`, the exact same pure function
(`src/game/save.ts`, imported via `worker/src/rules.ts`) the client uses to
load a save from disk, and stores the RESULT, never the raw body. The same
function runs again on the way out of `GET /save`, so a payload written by
an older deploy always comes back current. `migrate()` is total — it never
throws, a malformed upload just becomes a sane default — so a bad save can
never 500 here, only get cleaned up. Anti-cheat (checking the numbers are
plausible/earned) is a later PR; be honest with yourself that this one does
not provide it.

**Revisions.** `rev` is `0` when a player has no cloud save yet. A write
sends `baseRev` (the rev it last saw); if that still matches what's stored,
the row moves to `baseRev + 1`. If not, the write is rejected with `409` and
the response carries the **current** cloud save so the client can merge
without a second round trip. The write is a single guarded UPSERT (see the
`WHERE` clauses in `savePut` in `src/index.ts`) so two concurrent writes
against the same account can't both succeed.

**Size cap.** A save is a few KB; anything over 64 KiB is rejected with
`413` before it's even parsed — a cheap guard against using the account as
free storage.

### Schema change — apply and redeploy to go live

`schema.sql` gained one new table, `saves`. Like PR 3a, this is **purely
additive** — every statement is `CREATE TABLE IF NOT EXISTS`, and nothing
in `scores`, `users`, `sessions`, or `login_throttle` is touched. Re-running
the whole file against production is safe:

```bash
npx wrangler d1 execute blorbo-leaderboard --remote --file=./schema.sql
```

`lifetime_goo` and `clicks` are pulled out of the JSON `payload` into their
own columns on purpose — a later anti-cheat PR needs to re-simulate and
compare against exactly those two fields, and that should be a cheap
column read, not a JSON parse of every row.

**This code shipping is not the same as this feature being live.** As
always, the owner needs to run the schema command above and then:

```bash
npx wrangler deploy
```

### Testing

Integration tests for `/save` live in
`worker/test/save-endpoints.integration.test.ts`, using the same
Miniflare/`@cloudflare/vitest-pool-workers` rig as the auth tests (see
"Testing" under PR 3a above for how that rig works). Run them the same way:

```bash
cd worker
npx vitest run
```

They cover: unauthenticated access to both endpoints, the "no save yet"
shape, a PUT/GET round trip, sequential revision bumps, a stale write being
rejected with the current save attached, the 64 KiB size cap, junk-save
sanitization (unknown creature ids, negative goo, `NaN` fields, an unknown
cosmetic), that one user can't read or overwrite another's save, and
malformed bodies answering `400` rather than `500`.

---

## Save auditing (PR 5) — SHADOW MODE, records only, rejects nothing

Every successful `PUT /save` now also writes one row to a new `save_audit`
table, recording the server's opinion of whether the upload's delta was
physically achievable. **This PR observes and records. It does not reject,
block, clamp, or otherwise change a single byte of the save or the
response** — a flagged upload still returns `200` with its new `rev`, exactly
as an honest one would. Enforcement is a deliberately later PR, once real
`ratio` data from real players exists to set a threshold — see
`src/game/verify.ts` for the full reasoning.

What gets recorded per write (see `verifySaveDelta` in `src/game/verify.ts`,
imported the same way as every other shared rule — via `worker/src/rules.ts`,
never reimplemented):

- `elapsed_sec` — the gap since the account's previous write, measured by the
  **Worker's own clock** (`now - previousRow.updated`). This is intentional:
  reading the interval from anything in the uploaded save (e.g. `lastSeen`)
  would hand a cheater exactly the number that's supposed to bound them.
- `goo_gain` / `max_gain` / `ratio` — the reported `lifetimeGoo` increase,
  the ceiling it was checked against, and their quotient. The ceiling
  assumes every advantage in the game stacked simultaneously for the whole
  interval (permanent max-multiplier event, permanent ad boost, every tap a
  crit inside a permanent frenzy) — deliberately generous, so a false
  positive doesn't punish a real child for playing well.
- `click_gain` — the reported tap-count increase, checked against a
  humanly-plausible tap rate plus the account's robot-hand level.
- `flags` — a comma-joined list of what tripped (`goo-rate`, `click-rate`,
  `lifetime-goo-decreased`, `clicks-decreased`); `''` when clean.
- `ok` — `1` if nothing tripped, `0` if anything did. Never affects the HTTP
  response.

**Be honest about what this catches.** The ceiling is loose by design — it
only flags gross fabrication, roughly a thousandfold overshoot or more, not
subtle inflation. That's exactly why `ratio` (not just the pass/fail) is
stored: honest play should land orders of magnitude below `1`, and
accumulating real ratios across real saves is what lets a future PR pick an
evidence-based enforcement threshold instead of a guessed one.

**Failure isolation.** The audit insert is wrapped in its own `try`/`catch`
inside `savePut` — if it throws for any reason (bad SQL, or `save_audit` not
existing yet because the schema hasn't been re-applied to this deploy), the
error is logged and swallowed, never propagated. A player's save write must
never fail because auditing had a bad day.

### Schema change — apply and redeploy to go live

`schema.sql` gained one new table, `save_audit`, plus two indexes. Same
additive contract as PR 3a/4: every statement is `CREATE TABLE/INDEX IF NOT
EXISTS`, nothing in `scores`, `users`, `sessions`, `login_throttle`, or
`saves` is touched, and the whole file is safe to re-run against production:

```bash
npx wrangler d1 execute blorbo-leaderboard --remote --file=./schema.sql
```

As always, shipping this code is not the same as the feature being live —
run the schema command above, then:

```bash
npx wrangler deploy
```

Until the schema is re-applied, `PUT /save` keeps working exactly as before
(see "Failure isolation" above) — auditing just silently doesn't record
anything until the table exists.

### Testing

Integration tests live in `worker/test/save-audit.integration.test.ts`, same
rig as the other integration suites (see "Testing" under PR 3a above). Run
them the same way:

```bash
cd worker
npx vitest run
```

They cover: a first save (nothing to compare against) recording clean, a
modest second save recording clean with a server-measured `elapsed_sec`, an
absurd `lifetimeGoo` jump recording `goo-rate` while the write still succeeds
with `200` (the one that matters most — shadow mode never blocks), a
decreasing `lifetimeGoo` recording `lifetime-goo-decreased`, an impossible
tap-count jump recording `click-rate`, `ratio` separating honest play from
gross fabrication, two accounts' audit rows never cross-contaminating, and
that a missing `save_audit` table (the "schema not re-applied yet" window)
cannot break a save.

---

## Housekeeping, limits and cost controls

The project's first constraint is that it must not cost money, and for a while
nothing enforced that on the write path. These are the guards:

| Guard | Where | Why |
|---|---|---|
| `MIN_SAVE_INTERVAL_MS` (default 5000) | `src/index.ts` | Nothing bounded `PUT /save` at all. An account is free to create, so a signed-in caller could loop writes and burn the D1 budget three operations at a time. Honest play checkpoints once a minute, so this never touches it. |
| `Content-Length` pre-check | `src/index.ts` `savePut` | `request.text()` buffers the whole body, and a Worker has 128MB. Oversized uploads are now refused from the header, before a byte is read. |
| Nightly sweep | `scheduled` handler + `[triggers]` in `wrangler.toml` | `sessions` and `save_audit` both grew without bound. Runs 03:00 UTC, batched, failures swallowed. |
| Production CORS | `allowedOrigins()` | The dev origins used to ship to production. Not exploitable (SameSite=Lax), but a production allowlist naming localhost is one refactor away from mattering. |

A suppressed write returns **429**, never 200. Answering 200 would tell a
second device its save reached the cloud when it did not — it would clear its
dirty flag and stop retrying. 429 is what the client already handles: stay
dirty, retry at the next checkpoint, never surface anything to the player.

**Retention:** audit rows with `ok = 1` are deleted after 30 days. Flagged rows
(`ok = 0`) are kept indefinitely — they are rare, and they are the entire
reason the table exists.

Deploying this needs no schema change, just `npx wrangler deploy`. The cron
trigger is registered from `wrangler.toml` on that same deploy.

## Enforcement (PR 6, minimal) — flagged accounts are not published

The shadow-mode promise above still holds for the **save itself**: `PUT /save`
never rejects, blocks, or clamps, and a player can never lose progress on
suspicion. What changed is the consequence at the leaderboard boundary:

- `POST /submit` answers `403 {"error":"flagged"}` for an account that has a
  **rate-violation** audit flag on record: `goo-rate`, `click-rate`, or
  `first-save-cap` (a first save that arrived already rich — see
  `FIRST_SAVE_GOO_CAP` in `src/index.ts`). The account's cloud save keeps
  working; only the public board is withheld.
- Decrease flags (`lifetime-goo-decreased`, `clicks-decreased`,
  `rollback-claimed`) deliberately do **not** bar — they are what the restore
  button legitimately produces, and a decrease cannot inflate a MAX()-based
  board anyway.
- Only flags recorded **after** `SUBMIT_ENFORCE_SINCE` (2026-08-03) count.
  Rows from the shadow-only period were collected under a different contract
  and never bar anyone retroactively.

### Releasing a wrongly-barred account

Look at the evidence, then delete the flags (the nightly sweep never deletes
flagged rows, so this is the only way they go away):

```bash
npx wrangler d1 execute blorbo-leaderboard --remote \
  --command "SELECT user_id, created, elapsed_sec, goo_gain, max_gain, ratio, flags FROM save_audit WHERE ok = 0 ORDER BY created DESC LIMIT 50"
npx wrangler d1 execute blorbo-leaderboard --remote \
  --command "DELETE FROM save_audit WHERE user_id = '<id>' AND ok = 0"
```

The player's row appears on the board at their next sync — nothing else to do.

### Honest limits (unchanged in spirit)

The ceiling is deliberately generous (~three orders of magnitude above honest
play), so this blocks the *trivial* attack — one F12 paste of an absurd
number — and forces a cheater into a patient, scripted drip that stays under
the ceiling on every save. That is "too expensive to bother", which is the
stated goal; it is not proof of honesty. The data-driven threshold on `ratio`
(the real PR 6) still needs real players' distributions.

## Parent requests: see or delete a child's data (privacy runbook)

The privacy policy promises a parent can ask to SEE everything stored about
their kid, or DELETE the account entirely. These are the exact commands that
fulfill each promise — run them, don't improvise SQL under time pressure.

Step 0 — find the account id from the email the parent wrote from:

```bash
npx wrangler d1 execute blorbo-leaderboard --remote \
  --command "SELECT id, email, display_name, created FROM users WHERE email = '<parent-email>'"
```

### "Show me everything you have" (data access request)

Four tables can hold rows for an account. The scores row is keyed by the
account id with dashes stripped, first 40 chars (see leaderboardCodeFor):

```bash
npx wrangler d1 execute blorbo-leaderboard --remote --command "SELECT * FROM users WHERE id = '<id>'"
npx wrangler d1 execute blorbo-leaderboard --remote --command "SELECT rev, updated, length(payload) AS save_bytes FROM saves WHERE user_id = '<id>'"
npx wrangler d1 execute blorbo-leaderboard --remote --command "SELECT created, elapsed_sec, goo_gain, click_gain, flags, ok FROM save_audit WHERE user_id = '<id>' ORDER BY created"
npx wrangler d1 execute blorbo-leaderboard --remote --command "SELECT name, clicks, goo, cpm, created, updated FROM scores WHERE code = replace('<id>', '-', '')"
```

(The full save payload is the player's own game state; send it as-is if asked.)

### "Delete the account and everything with it" (deletion request)

Order matters only for clarity — D1 has no FK enforcement here. This removes
the email and every trace; it is NOT undoable, so confirm the request came
from the account's own email first:

```bash
npx wrangler d1 execute blorbo-leaderboard --remote --command "DELETE FROM scores WHERE code = replace('<id>', '-', '')"
npx wrangler d1 execute blorbo-leaderboard --remote --command "DELETE FROM save_audit WHERE user_id = '<id>'"
npx wrangler d1 execute blorbo-leaderboard --remote --command "DELETE FROM saves WHERE user_id = '<id>'"
npx wrangler d1 execute blorbo-leaderboard --remote --command "DELETE FROM sessions WHERE user_id = '<id>'"
npx wrangler d1 execute blorbo-leaderboard --remote --command "DELETE FROM users WHERE id = '<id>'"
```

Then verify nothing is left:

```bash
npx wrangler d1 execute blorbo-leaderboard --remote \
  --command "SELECT (SELECT COUNT(*) FROM users WHERE id='<id>') + (SELECT COUNT(*) FROM saves WHERE user_id='<id>') + (SELECT COUNT(*) FROM sessions WHERE user_id='<id>') + (SELECT COUNT(*) FROM save_audit WHERE user_id='<id>') + (SELECT COUNT(*) FROM scores WHERE code=replace('<id>','-','')) AS remaining"
```

`remaining` must be 0. The player's LOCAL save (on their device) is theirs and
is not ours to delete; if asked, point the parent at the in-game "התחל מחדש".
A self-service /account/delete endpoint is on the roadmap; until it ships,
this runbook IS the deletion mechanism the policy promises.
