// Runtime configuration.
//
// LEADERBOARD_API: the URL of your deployed Cloudflare Worker (see /worker).
// Leave it EMPTY to keep the leaderboard on-device only (the default). Once you
// deploy the Worker, paste its URL here (e.g. "https://blorbo-leaderboard.
// your-subdomain.workers.dev") and the leaderboard becomes global.
export const LEADERBOARD_API = 'https://api.bl-or-bo.com';

// AUTH_API: the same Worker's /auth/* routes (accounts + sessions, PR 3a).
// Leave it EMPTY to disable every auth feature — src/net/auth.ts and
// src/ui/AuthGate.tsx no-op cleanly with nothing configured.
export const AUTH_API = 'https://api.bl-or-bo.com';

// AUTH_REQUIRED: the gate flag (see src/ui/AuthGate.tsx / src/App.tsx). This
// is the ONLY thing separating "you can create an account" from "you must".
//
// MUST default to `false`. Flipping it to `true` locks every player out
// behind sign-in — that is only safe once the Worker above is actually
// deployed *and* its Google OAuth secrets are set (see worker/README.md);
// ship this `true` one minute too early and the game is unplayable for
// everyone until the owner notices. The owner flips this by hand, after
// verifying the backend is live, never as a side effect of a routine PR.
// Before flipping this to `true`, re-read public/privacy.html: it describes what
// signing up stores, and it is written to stay accurate either way — but any
// wording that implies playing without an account is possible must go in the
// SAME commit. A privacy policy that lies to a parent is not a small bug.
export const AUTH_REQUIRED = false;
