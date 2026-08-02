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
- **`npm i <pkg>` prunes packages that aren't in package.json.** `playwright-core`
  is installed ad hoc; reinstall with `npm i --no-save playwright-core` if it
  disappears.
- The Cloudflare Worker is **deployed manually by the owner** (`wrangler deploy`
  from `worker/`). Changing `worker/src/index.ts` in the repo does NOT deploy it —
  always tell the owner a deploy is needed, and give them the exact steps.

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
- **Login is mandatory** (Google OAuth + email/password). Accepted alongside the
  kids-safety trade-off, which was raised and acknowledged: it means collecting
  an email, so COPPA/GDPR-K obligations apply and the privacy policy must be
  updated when auth ships.
- **Some hosting cost is acceptable** (~$5/mo Workers Paid at scale), on the
  expectation that ad revenue covers it. Still prefer checkpoint-based syncing
  over per-tick requests.
- Anti-cheat target is "too expensive to bother", not perfection. Client-side
  HMAC keys are extractable; the real defence is server re-simulation plus
  wall-clock plausibility caps. Never claim more than that.

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
