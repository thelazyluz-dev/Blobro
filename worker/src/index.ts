/**
 * Blorbo global leaderboard — a Cloudflare Worker backed by D1 (SQLite).
 *
 * Cost: designed to stay inside Cloudflare's FREE tier forever at family scale.
 * Workers free = 100,000 requests/day; D1 free = 5 GB storage + 5M reads/day.
 * A handful of kids tapping a phone will never come close, so this is ₪0/month.
 *
 * Privacy (this is a kids' app): we store ONLY a made-up nickname, a click
 * count, and a random per-device recovery code. No email, no real name, no IP,
 * no location. The recovery code is a write-only secret — it identifies a device
 * so re-submitting updates the same row, and it is NEVER returned to anyone.
 *
 * Endpoints
 *   GET  /top?limit=N   → { entries: [{ name, score }, ...] }  (codes stripped)
 *   GET  /rank?code=C   → { rank, score, name, total } | { rank: null }
 *   POST /submit        → { ok: true, best, rank, total } | 4xx on bad input
 *        body: { code, name, score }   (keeps the HIGHER of old/new score)
 *   GET  /health        → { ok: true }
 */

export interface Env {
  DB: D1Database;
}

const CORS: Record<string, string> = {
  // The PWA is served from GitHub Pages (a different origin), so the browser
  // needs permissive CORS to call this Worker. There is nothing secret to
  // protect here — reads are public and writes carry their own secret code.
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

const MAX_NAME_LEN = 12; // must match leaderboardNameMaxLen on the client
const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 50;
const MAX_SCORE = 1e15; // sanity ceiling — no legit run reaches this

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
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

    // ── Public leaderboard ────────────────────────────────────────────────
    if (url.pathname === '/top' && request.method === 'GET') {
      const raw = Number(url.searchParams.get('limit'));
      const limit = Math.min(MAX_LIMIT, Math.max(1, Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : DEFAULT_LIMIT));
      try {
        // Select ONLY name + score. The recovery code never leaves the DB.
        const { results } = await env.DB.prepare(
          'SELECT name, score FROM scores ORDER BY score DESC, updated ASC LIMIT ?1',
        )
          .bind(limit)
          .all<{ name: string; score: number }>();
        return json({ entries: results ?? [] });
      } catch {
        return json({ error: 'db' }, 500);
      }
    }

    // ── A player's own rank (even if far down the list) ───────────────────
    if (url.pathname === '/rank' && request.method === 'GET') {
      const code = (url.searchParams.get('code') ?? '').trim();
      if (!/^[A-Za-z0-9]{6,40}$/.test(code)) return json({ error: 'bad-code' }, 400);
      try {
        const me = await env.DB.prepare('SELECT name, score FROM scores WHERE code = ?1')
          .bind(code)
          .first<{ name: string; score: number }>();
        if (!me) return json({ rank: null });
        const above = await env.DB.prepare('SELECT COUNT(*) AS c FROM scores WHERE score > ?1')
          .bind(me.score)
          .first<{ c: number }>();
        const total = await env.DB.prepare('SELECT COUNT(*) AS c FROM scores').first<{ c: number }>();
        return json({ rank: (above?.c ?? 0) + 1, score: me.score, name: me.name, total: total?.c ?? 1 });
      } catch {
        return json({ error: 'db' }, 500);
      }
    }

    // ── Submit a score ────────────────────────────────────────────────────
    if (url.pathname === '/submit' && request.method === 'POST') {
      let body: { code?: unknown; name?: unknown; score?: unknown };
      try {
        body = await request.json();
      } catch {
        return json({ error: 'bad-json' }, 400);
      }

      const code = typeof body.code === 'string' ? body.code.trim() : '';
      const name = typeof body.name === 'string' ? body.name.trim().slice(0, MAX_NAME_LEN) : '';
      const score = typeof body.score === 'number' && Number.isFinite(body.score) ? Math.floor(body.score) : NaN;

      // Validate. The code must look like our generated codes (alnum, bounded).
      if (!/^[A-Za-z0-9]{6,40}$/.test(code)) return json({ error: 'bad-code' }, 400);
      if (!name) return json({ error: 'bad-name' }, 400);
      if (!Number.isFinite(score) || score < 0 || score > MAX_SCORE) return json({ error: 'bad-score' }, 400);

      try {
        // Upsert: create the row, or update it only when the new score is higher
        // (or the name changed). Keeps a single row per device and never lowers
        // a best score. `excluded` is the row we tried to insert.
        await env.DB.prepare(
          `INSERT INTO scores (code, name, score, updated)
           VALUES (?1, ?2, ?3, ?4)
           ON CONFLICT(code) DO UPDATE SET
             name    = excluded.name,
             score   = MAX(scores.score, excluded.score),
             updated = excluded.updated`,
        )
          .bind(code, name, score, Date.now())
          .run();

        const row = await env.DB.prepare('SELECT score FROM scores WHERE code = ?1')
          .bind(code)
          .first<{ score: number }>();
        const best = row?.score ?? score;
        const above = await env.DB.prepare('SELECT COUNT(*) AS c FROM scores WHERE score > ?1')
          .bind(best)
          .first<{ c: number }>();
        const total = await env.DB.prepare('SELECT COUNT(*) AS c FROM scores').first<{ c: number }>();
        return json({ ok: true, best, rank: (above?.c ?? 0) + 1, total: total?.c ?? 1 });
      } catch {
        return json({ error: 'db' }, 500);
      }
    }

    return json({ error: 'not-found' }, 404);
  },
};
