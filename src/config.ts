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

// VAPID_PUBLIC_KEY: the Web Push application-server PUBLIC key (base64url). Not a
// secret — the client needs it to subscribe. Leave EMPTY to disable push
// entirely (src/net/push.ts no-ops). Generate a keypair once with
// `npx web-push generate-vapid-keys`; paste the PUBLIC key here and set the
// PRIVATE key as the Worker secret VAPID_PRIVATE_KEY (see worker/README).
export const VAPID_PUBLIC_KEY = '';

// AUTH_REQUIRED: the gate flag (see src/ui/AuthGate.tsx / src/App.tsx). This
// is the ONLY thing separating "you can create an account" from "you must".
//
// Turned ON by the owner after verifying the live Google flow end-to-end
// against the deployed Worker. While it is `true`, the game is unreachable
// without a session, so it is now load-bearing: if the Worker's Google OAuth
// secrets ever lapse (see worker/README.md), nobody can play. Flipping it back
// to `false` is the emergency valve, and takes one commit.
//
// public/privacy.html is written to match this flag and must be re-read
// whenever it changes — any wording about whether an account is optional has
// to move in the SAME commit. A privacy policy that lies to a parent is not a
// small bug.
export const AUTH_REQUIRED = true;
