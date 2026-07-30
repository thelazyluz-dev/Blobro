// Runtime configuration.
//
// LEADERBOARD_API: the URL of your deployed Cloudflare Worker (see /worker).
// Leave it EMPTY to keep the leaderboard on-device only (the default). Once you
// deploy the Worker, paste its URL here (e.g. "https://blorbo-leaderboard.
// your-subdomain.workers.dev") and the leaderboard becomes global.
export const LEADERBOARD_API = 'https://blorbo-leaderboard.blorbs.workers.dev';
