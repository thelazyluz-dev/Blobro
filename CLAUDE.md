# Blorbo (בלורבו) — project guide

A Hebrew (RTL, with nikud) idle/clicker PWA for kids and families.
Live at **https://bl-or-bo.com** (GitHub Pages). Global leaderboard runs on a
Cloudflare Worker + D1.

---

## Working model (do not skip)

**Claude Opus is the architect and runs the work; Sonnet 5 agents do the
implementation.** For any task big enough to delegate:

1. **Plan** — the architect decides the approach, the file-level scope, and the
   acceptance criteria before any agent is spawned.
2. **Delegate** — hand a Sonnet 5 agent a precise brief: what to change, which
   files, what must NOT change, and how it will be verified.
3. **Verify — this gate is mandatory.** When an agent reports back, the
   architect independently confirms, and never takes the agent's word for it:
   - `npm run build` passes (this is the real typecheck — see below)
   - `npm test` passes
   - the behaviour is verified in a real headless browser (see below), not just
     "it compiles"
   - no regression to adjacent features
   - the diff is actually what was asked for, and the code reads like the
     surrounding code
4. **Only then integrate** — bump the service-worker cache, commit, push.

If an agent's work fails verification, fix it or re-delegate. Never integrate
unverified work. Report failures honestly, with the output.

---

## Hard-won tripwires

- **`npx tsc --noEmit` at the root is a NO-OP.** The root `tsconfig.json` has
  `files: []` plus project references. The real typecheck is **`npm run build`**
  (runs `tsc -b`) or `npm run typecheck`. A "clean" root tsc means nothing.
- **Bump the service-worker cache on every deploy**: `const CACHE = 'blorbo-vNN'`
  in `public/sw.js`. Users get a stale bundle otherwise.
- **Headless verification**: `playwright-core` with
  `executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'`.
  Run scripts **from the project root** so the package resolves. In dev,
  `window.__game` exposes the Zustand store (`getState` / `setState`).
  - Set `page.emulateMedia({ reducedMotion: 'reduce' })` for stable screenshots.
  - Celebration overlays (milestone / unlock / confetti) love to cover
    screenshots — clear them (`setState({ milestone: null, unlockReveal: null })`)
    right before capturing.
  - For layout claims, **measure `getBoundingClientRect()` overlaps at several
    viewport sizes** rather than eyeballing one screenshot.
  - **AUTH_REQUIRED means the game does not mount for an anonymous page** — a
    headless probe against localhost sees the sign-in gate, `window.__game`
    still exists, and measurements silently return zeros that look like
    results. Stub `/auth/me` first, exactly like `e2e/helpers.ts` does.
- **`npm i <pkg>` prunes packages that aren't in package.json.** `playwright-core`
  is installed ad hoc; reinstall with `npm i --no-save playwright-core` if it
  disappears.
- **`git checkout <file>` cannot revert an UNTRACKED file** — it fails with
  "pathspec did not match". When mutation-testing a brand-new file (deliberately
  breaking it to prove a test catches it), the revert silently does nothing and
  the mutation stays. Undo it explicitly, then re-run the suite and confirm green
  before committing. This nearly shipped a corrupted PRNG.
- **Two deploy paths, and they differ.** The client (the game) **auto-deploys**
  to GitHub Pages on every push to a deploy branch — `.github/workflows/deploy.yml`
  triggers on `main` and `claude/new-session-6f5k8n`, so *a push IS the deploy*;
  bump the SW cache before pushing. The **Worker does NOT auto-deploy** (it talks
  to the live D1): it ships via a manual button — GitHub → Actions → **Deploy
  Worker → Run workflow** (`deploy-worker.yml`, `workflow_dispatch`, runs from a
  phone; gates on root build + unit tests + worker integration tests, then
  `wrangler deploy`). Tick **`apply_schema` only when a PR added a table/column** —
  a pure code change (e.g. an in-memory cache) needs the deploy alone. Editing
  `worker/src/index.ts` and only pushing changes nothing in production — tell the
  owner to run that workflow, and whether the schema box is needed.

## Conventions

- Branch: `claude/new-session-6f5k8n`. Push with `git push -u origin <branch>`.
- Commit footer:
  ```
  Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01FUpLehrZUYkMZWaX4vz3PX
  ```
  Never put a raw model id (e.g. `claude-opus-5`) in code, commits or PRs.
- Code comments are in English and explain **why**, not what. Match the density
  and idiom of the surrounding file.
- UI copy is Hebrew **with nikud** (kids read it). RTL throughout — use
  `start`/`end`, never `left`/`right`.

## Architecture

- `src/game/*` — **pure** logic (no `window`, no React, no store). Safe to unit
  test and, later, to share with the server. All numbers live in `balance.ts`.
- `src/store.ts` — Zustand: persistent save fields + transient UI state.
  Selectors at the bottom fold in events, ad boosts and creature abilities.
- `src/ui/*` — components; `src/ui/screens/*` — the five tabs.
- `src/net/*` — leaderboard client and the H5 rewarded-ads wrapper. Both degrade
  gracefully to no-ops when the backend/API is unavailable.
- `worker/` — Cloudflare Worker + D1. **Outside** the app tsconfig on purpose.
  - Leaderboard: each player's **rank is computed LIVE and exact** on every board
    open, but the shared **"total players" number is cached in-isolate for 60s**
    (`cachedTotalScores` in `index.ts`). It used to run `SELECT COUNT(*) FROM
    scores` — a full-table scan — on *every* open, which was the single biggest
    source of D1 rows-read. A cold isolate simply does the old scan, so the cache
    can only help; it adds **zero writes**. Player-visible effect: none, beyond the
    total being up to 60s stale. If you ever need it exact/global, move it to KV.
- Save migrations: bump `CURRENT_VERSION` in `game/save.ts`, default the new
  field in `defaultSaveState` **and** `migrate`, and add a test. Never drop a
  player's progress.

## Direction: server-authoritative rebuild (owner-approved)

The game is moving from fully client-side to a server-authoritative product, in
11 incremental PRs, so that scores can be trusted and a monetization system
(ads + shop + future payments) can be built on top.

**The preservation mechanism:** `src/game/*` is pure, so the server runs the
*same functions* rather than reimplementing the rules. Golden-vector contract
tests prove client and server agree. Never let the two drift apart.

**Golden vectors (PR 1) — how the lock works:**
`src/game/__golden__/vectors.json` pins hundreds of concrete
input → expected-output pairs across the whole rule surface (economy,
hatching, abilities, achievements, milestones, events, offline). Two test
files assert against the SAME file: `src/game/golden.test.ts` (direct client
imports) and `worker/test/golden.test.ts` (through `worker/src/rules.ts`, the
Worker's one import surface onto the shared core). If both pass, the Worker
is provably running the exact rules the client ships.
- If you **intentionally** change a rule in `src/game/*`, run
  `npm run golden:generate` and the changed expected values MUST show up as a
  reviewable diff in `vectors.json` in the same PR, with the change explained.
- **Never** run `golden:generate` just to turn a red test green. A failing
  golden test after a balance-file edit means "you just changed a business
  rule" — stop and confirm that was intended before regenerating anything.
- The generator (`scripts/generate-golden.mjs`/`.ts`) is the only place a test
  PRNG (mulberry32) exists — it bakes the exact random draws each seeded call
  consumed into the JSON, so `src/game/*` itself never needs a PRNG.

Owner decisions (do not revisit without asking):
- **Login is mandatory**, and it is **Google OAuth only** — the Worker's
  email/password endpoints stay implemented and tested but are not offered in
  the UI, because there is no password-reset flow (a child who forgets one is
  locked out forever). Accepted alongside the
  kids-safety trade-off, which was raised and acknowledged: it means collecting
  an email, so COPPA/GDPR-K obligations apply and the privacy policy must be
  updated when auth ships.
- **Some hosting cost is acceptable** (~$5/mo Workers Paid at scale), on the
  expectation that ad revenue covers it. Still prefer checkpoint-based syncing
  over per-tick requests.
- Anti-cheat target is "too expensive to bother", not perfection. Client-side
  HMAC keys are extractable; the real defence is server re-simulation plus
  wall-clock plausibility caps. Never claim more than that.

## Scale & cost (simulated — a model, not a guess)

A Monte-Carlo run over **20,000 daily active users**, driven by the real cadences
in the code (60s checkpoint save, 20s exit-push throttle, `auth/me` + `save` GET
per load, event-driven leaderboard, `rankPayload` = 3 range `COUNT`s + 1 total
per open). Re-run it (`node scripts/scale-cost-sim.mjs`) before quoting numbers —
they move with the cadences and the assumptions written at the top of that file.

- **Load:** ~17M Worker requests/mo, ~12M D1 writes/mo, ~20B D1 rows read/mo.
- **Infra ≈ $7/mo** — Workers Paid $5 + ~$2 request overage; D1 stays within the
  included allowance. The owner's "~$5/mo at scale" estimate held.
- **Ad revenue** (rewarded, child-directed, non-personalised, ~70% fill):
  ~$2.4k–$7.2k/mo. This is the **least certain** number — child-directed inventory
  pays less and fills worse; budget on the low end, not the middle.
- **Free-tier ceiling ≈ 2–3k DAU** (requests/writes/reads hit it first, and the
  leaderboard's `COUNT`s exhaust the free D1 read budget early). Past that,
  Workers Paid covers you comfortably to ~25k DAU.
- **Runs smoothly at 20k:** edge Workers + a SW-cached static PWA mean peak is
  ~tens of requests/sec and ~10GB/mo Pages egress — nowhere near any limit.
- **The one thing to fix before ~25–30k DAU:** the per-player rank `COUNT`s (still
  live) become the hot path. Approximate ranks from a **once-a-minute score
  histogram** (cheap reads, tiny writes). Do **NOT** recompute-and-write every
  player's rank each minute — that's ~650M writes/mo ≈ **$600/mo**, a trap.
- Reminder: D1 bills **rows read** = rows a query *scans*. `COUNT(*)` over the
  board scans the whole table — which is exactly why the total is cached (above).

## Product rules (these came from the owner — don't quietly change them)

- **Kids-safe, no PII**: no accounts, no email, no location. The leaderboard
  stores only a nickname, scores, and a random per-device code (never returned).
  Ad requests are tagged child-directed (`data-tag-for-age-treatment="1"`).
- **It must not cost money.** Everything sits on free tiers by design.
- Passive income comes from **creatures only**; the robot hand is an
  auto-clicker on the tap side.
- Milestone facts are celebrated **once each, ever** (`milestonesShown`).
- The starter green blob is always available and is the first entry in the
  בלובים tab; blob skins are retired from the shop.
- Ads: **rewarded only**, opt-in behind the bonus button. No Auto ads, no
  banners, no interstitials, nothing that can be tapped by accident.
