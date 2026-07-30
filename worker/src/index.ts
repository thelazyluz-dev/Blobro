/**
 * Blorbo global leaderboard — a Cloudflare Worker backed by D1 (SQLite).
 *
 * Free tier forever at family scale (Workers 100k req/day, D1 5 GB) → ₪0/month.
 *
 * Privacy (kids' app): we store ONLY a nickname, two scores, and a random
 * per-device recovery code. No email, no real name, no IP, no location. The
 * code is a write-only secret — it identifies a device so re-submitting updates
 * the same row, and it is NEVER returned.
 *
 * Two ranked metrics: `clicks` (physical taps) and `goo` (total goo earned).
 *
 * Endpoints
 *   GET  /top?by=clicks|goo&limit=N → { by, entries: [{ name, score }, ...] }
 *   GET  /rank?code=C&by=clicks|goo → { by, rank, score, name, total } | { rank: null }
 *   POST /submit                    → { ok, total, clicks:{best,rank}, goo:{best,rank} }
 *        body: { code, name, clicks, goo }   (keeps the HIGHER of old/new each)
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
const MAX_CLICKS = 1e12; // no physical tapper reaches a trillion taps
const MAX_GOO = 1e30; // generous ceiling for total goo

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

// Whitelist the metric → column name (prevents any SQL injection via `by`).
function metricCol(by: string | null): 'clicks' | 'goo' {
  return by === 'goo' ? 'goo' : 'clicks';
}

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

    // ── A player's own rank in a metric (even if far down the list) ────────
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

    // ── Submit both scores ────────────────────────────────────────────────
    if (url.pathname === '/submit' && request.method === 'POST') {
      let body: { code?: unknown; name?: unknown; clicks?: unknown; goo?: unknown };
      try {
        body = await request.json();
      } catch {
        return json({ error: 'bad-json' }, 400);
      }

      const code = typeof body.code === 'string' ? body.code.trim() : '';
      const name = typeof body.name === 'string' ? body.name.trim().slice(0, MAX_NAME_LEN) : '';
      const clicks = typeof body.clicks === 'number' && Number.isFinite(body.clicks) ? Math.floor(body.clicks) : NaN;
      const goo = typeof body.goo === 'number' && Number.isFinite(body.goo) ? body.goo : NaN;

      if (!/^[A-Za-z0-9]{6,40}$/.test(code)) return json({ error: 'bad-code' }, 400);
      if (!name) return json({ error: 'bad-name' }, 400);
      if (!Number.isFinite(clicks) || clicks < 0 || clicks > MAX_CLICKS) return json({ error: 'bad-clicks' }, 400);
      if (!Number.isFinite(goo) || goo < 0 || goo > MAX_GOO) return json({ error: 'bad-goo' }, 400);

      try {
        // Upsert: create the row, or raise each metric to its new max (both are
        // monotonic — taps and total goo only ever grow). One row per device.
        await env.DB.prepare(
          `INSERT INTO scores (code, name, clicks, goo, updated)
           VALUES (?1, ?2, ?3, ?4, ?5)
           ON CONFLICT(code) DO UPDATE SET
             name    = excluded.name,
             clicks  = MAX(scores.clicks, excluded.clicks),
             goo     = MAX(scores.goo, excluded.goo),
             updated = excluded.updated`,
        )
          .bind(code, name, clicks, goo, Date.now())
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
