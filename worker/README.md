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

It prints something like:

```
[[d1_databases]]
binding = "DB"
database_name = "blorbo-leaderboard"
database_id = "abc123-your-real-id-here"
```

Copy the `database_id` value and paste it into **`wrangler.toml`**, replacing
`PASTE_DATABASE_ID_HERE`.

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
