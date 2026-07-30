/**
 * Blorbo global leaderboard — a Cloudflare Worker backed by D1 (SQLite).
 *
 * Free tier forever at family scale → ₪0/month.
 *
 * Privacy (kids' app): stores only a nickname, two scores, and a random
 * per-device recovery code. No email, no real name, no IP, no location. The
 * code is a write-only secret — never returned.
 *
 * Anti-cheat (pragmatic — you can't fully secure a client-side game, the goal
 * is "annoying enough nobody bothers"):
 *   • Sane ceilings on both metrics (the old 1e30 goo ceiling let junk in).
 *   • CLICKS are capped to a humanly-plausible rate since the code's first-seen
 *     time (server-stamped), so a drive-by can't post a top tap score. This is
 *     the "fair" board and it's now well protected.
 *   • GOO grows exponentially (idle income), so a time-rate cap would reject
 *     legit deep play — it relies on the flat ceiling. Softer by nature; honest
 *     about that.
 * Values are CLAMPED (not rejected) so a legit near-boundary score still saves.
 *
 * Endpoints
 *   GET  /top?by=clicks|goo&limit=N → { by, entries: [{ name, score }, ...] }
 *   GET  /rank?code=C&by=clicks|goo → { by, rank, score, name, total } | { rank: null }
 *   POST /submit                    → { ok, total, clicks:{best,rank}, goo:{best,rank} }
 *        body: { code, name, clicks, goo }
 *   GET  /health                    → { ok: true }
 */

export interface Env {
  DB: D1Database;
}

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

const MAX_NAME_LEN = 12;
const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 50;

// Sane ceilings. Clicks are physical taps; goo is total earned.
const MAX_CLICKS = 5_000_000; // ~weeks of nonstop tapping — no human exceeds this
const MAX_GOO = 1e18; // a quintillion: generous for deep play, blocks absurd junk

// Clicks plausibility: at most this many taps per second since first-seen, plus
// a grace baseline for taps made before joining the board.
const CLICK_RATE_PER_SEC = 25; // well above a human's ~10/s
const CLICK_BASELINE = 100_000;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

function metricCol(by: string | null): 'clicks' | 'goo' {
  return by === 'goo' ? 'goo' : 'clicks';
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    const url = new URL(request.url);

    if (url.pathname === '/health') {
      return json({ ok: true });
    }

    // ── Public leaderboard (by metric) ────────────────────────────────────
    if (url.pathname === '/top' && request.method === 'GET') {
      const col = metricCol(url.searchParams.get('by'));
      const raw = Number(url.searchParams.get('limit'));
      const limit = Math.min(MAX_LIMIT, Math.max(1, Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : DEFAULT_LIMIT));
      try {
        const { results } = await env.DB.prepare(
          `SELECT name, ${col} AS score FROM scores ORDER BY ${col} DESC, updated ASC LIMIT ?1`,
        )
          .bind(limit)
          .all<{ name: string; score: number }>();
        return json({ by: col, entries: results ?? [] });
      } catch {
        return json({ error: 'db' }, 500);
      }
    }

    // ── A player's own rank in a metric ───────────────────────────────────
    if (url.pathname === '/rank' && request.method === 'GET') {
      const col = metricCol(url.searchParams.get('by'));
      const code = (url.searchParams.get('code') ?? '').trim();
      if (!/^[A-Za-z0-9]{6,40}$/.test(code)) return json({ error: 'bad-code' }, 400);
      try {
        const me = await env.DB.prepare(`SELECT name, ${col} AS v FROM scores WHERE code = ?1`)
          .bind(code)
          .first<{ name: string; v: number }>();
        if (!me) return json({ rank: null });
        const above = await env.DB.prepare(`SELECT COUNT(*) AS c FROM scores WHERE ${col} > ?1`)
          .bind(me.v)
          .first<{ c: number }>();
        const total = await env.DB.prepare('SELECT COUNT(*) AS c FROM scores').first<{ c: number }>();
        return json({ by: col, rank: (above?.c ?? 0) + 1, score: me.v, name: me.name, total: total?.c ?? 1 });
      } catch {
        return json({ error: 'db' }, 500);
      }
    }

    // ── Submit both scores (validated + clamped) ──────────────────────────
    if (url.pathname === '/submit' && request.method === 'POST') {
      let body: { code?: unknown; name?: unknown; clicks?: unknown; goo?: unknown };
      try {
        body = await request.json();
      } catch {
        return json({ error: 'bad-json' }, 400);
      }

      const code = typeof body.code === 'string' ? body.code.trim() : '';
      const name = typeof body.name === 'string' ? body.name.trim().slice(0, MAX_NAME_LEN) : '';
      const rawClicks = typeof body.clicks === 'number' && Number.isFinite(body.clicks) ? Math.floor(body.clicks) : NaN;
      const rawGoo = typeof body.goo === 'number' && Number.isFinite(body.goo) ? body.goo : NaN;

      if (!/^[A-Za-z0-9]{6,40}$/.test(code)) return json({ error: 'bad-code' }, 400);
      if (!name) return json({ error: 'bad-name' }, 400);
      if (!Number.isFinite(rawClicks) || !Number.isFinite(rawGoo)) return json({ error: 'bad-score' }, 400);

      try {
        const now = Date.now();
        const existing = await env.DB.prepare('SELECT clicks, goo, created FROM scores WHERE code = ?1')
          .bind(code)
          .first<{ clicks: number; goo: number; created: number }>();

        // First-seen: keep the original if we have it, else now. Grandfathered
        // rows (pre-anti-cheat, created = 0) skip the time cap so their existing
        // legit score isn't clamped; from now on they're tracked.
        const grandfathered = !!existing && !(existing.created > 0);
        const created = existing && existing.created > 0 ? existing.created : now;
        const elapsedSec = Math.max(0, (now - created) / 1000);
        const clickCap = grandfathered
          ? MAX_CLICKS
          : Math.min(MAX_CLICKS, Math.floor(CLICK_RATE_PER_SEC * elapsedSec + CLICK_BASELINE));

        const clicks = clamp(rawClicks, 0, clickCap);
        const goo = clamp(rawGoo, 0, MAX_GOO);

        await env.DB.prepare(
          `INSERT INTO scores (code, name, clicks, goo, created, updated)
           VALUES (?1, ?2, ?3, ?4, ?5, ?5)
           ON CONFLICT(code) DO UPDATE SET
             name    = excluded.name,
             clicks  = MAX(scores.clicks, excluded.clicks),
             goo     = MAX(scores.goo, excluded.goo),
             created = CASE WHEN scores.created > 0 THEN scores.created ELSE excluded.created END,
             updated = excluded.updated`,
        )
          .bind(code, name, clicks, goo, now)
          .run();

        const row = await env.DB.prepare('SELECT clicks, goo FROM scores WHERE code = ?1')
          .bind(code)
          .first<{ clicks: number; goo: number }>();
        const bestClicks = row?.clicks ?? clicks;
        const bestGoo = row?.goo ?? goo;
        const cAbove = await env.DB.prepare('SELECT COUNT(*) AS c FROM scores WHERE clicks > ?1')
          .bind(bestClicks)
          .first<{ c: number }>();
        const gAbove = await env.DB.prepare('SELECT COUNT(*) AS c FROM scores WHERE goo > ?1')
          .bind(bestGoo)
          .first<{ c: number }>();
        const total = await env.DB.prepare('SELECT COUNT(*) AS c FROM scores').first<{ c: number }>();
        return json({
          ok: true,
          total: total?.c ?? 1,
          clicks: { best: bestClicks, rank: (cAbove?.c ?? 0) + 1 },
          goo: { best: bestGoo, rank: (gAbove?.c ?? 0) + 1 },
        });
      } catch {
        return json({ error: 'db' }, 500);
      }
    }

    return json({ error: 'not-found' }, 404);
  },
};
