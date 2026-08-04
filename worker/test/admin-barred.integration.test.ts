// Integration tests for the owner dashboard's barred-players moderation surface
// (GET /admin/barred, POST /admin/release), against the real worker inside
// workerd via @cloudflare/vitest-pool-workers on a D1 seeded from schema.sql.
//
// Run with: cd worker && npx vitest run
import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import worker from '../src/index';

const TOKEN = 'test-admin-token-xyz';
beforeAll(() => {
  (env as { ADMIN_TOKEN?: string }).ADMIN_TOKEN = TOKEN;
});

async function call(path: string, init: RequestInit = {}): Promise<Response> {
  const request = new Request(`http://worker.example${path}`, init);
  const ctx = createExecutionContext();
  const res = await worker.fetch(request, env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

const auth = (extra: Record<string, string> = {}) => ({ Authorization: `Bearer ${TOKEN}`, ...extra });

/** SUBMIT_ENFORCE_SINCE is 2026-08-03; pick a created ts safely after it that is
 * also before FIRST_SAVE_CAP_BARS_SINCE (2026-08-16), so goo-rate bars but the
 * first-save cap does not — the exact live regime. */
const FLAG_TS = Date.UTC(2026, 7, 10);

let uid = 0;
function freshUserId(): string {
  uid += 1;
  // UUID-shaped so REPLACE(user_id,'-','') → scores.code works as in production.
  return `00000000-0000-4000-8000-${String(uid).padStart(12, '0')}`;
}

async function seedAudit(userId: string, flags: string, ok: number, ratio = 5, created = FLAG_TS) {
  await env.DB.prepare(
    `INSERT INTO save_audit (user_id, rev, created, elapsed_sec, goo_gain, max_gain, ratio, click_gain, flags, ok)
     VALUES (?1, 1, ?2, 70, 2.28e10, 3.15e6, ?3, 82, ?4, ?5)`,
  )
    .bind(userId, created, ratio, flags, ok)
    .run();
}
async function seedScore(userId: string, name: string) {
  const code = userId.replace(/-/g, '').slice(0, 40);
  await env.DB.prepare(
    `INSERT INTO scores (code, name, clicks, goo, cpm, created, updated) VALUES (?1, ?2, 100, 100, 10, ?3, ?3)
     ON CONFLICT(code) DO UPDATE SET name = excluded.name`,
  )
    .bind(code, name, Date.now())
    .run();
}
async function barredList(): Promise<Array<{ userId: string; name: string | null; flags: string; worstRatio: number; flaggedWrites: number }>> {
  const res = await call('/admin/barred', { headers: auth() });
  expect(res.status).toBe(200);
  return ((await res.json()) as { barred: any[] }).barred;
}

describe('GET /admin/barred', () => {
  it('rejects a missing or wrong token with 401', async () => {
    expect((await call('/admin/barred')).status).toBe(401);
    expect((await call('/admin/barred', { headers: { Authorization: 'Bearer nope' } })).status).toBe(401);
  });

  it('lists an account barred by goo-rate, with its nickname, reason and worst ratio', async () => {
    const userId = freshUserId();
    await seedScore(userId, 'גֶּפֶן');
    await seedAudit(userId, 'goo-rate', 0, 7232);

    const row = (await barredList()).find((b) => b.userId === userId);
    expect(row).toBeTruthy();
    expect(row!.name).toBe('גֶּפֶן');
    expect(row!.flags).toContain('goo-rate');
    expect(Math.round(row!.worstRatio)).toBe(7232);
  });

  it('does NOT list a decrease-only flag (a rollback is not a barring reason)', async () => {
    const userId = freshUserId();
    await seedAudit(userId, 'lifetime-goo-decreased', 0);
    expect((await barredList()).some((b) => b.userId === userId)).toBe(false);
  });

  it('does NOT list a clean (ok=1) audit row', async () => {
    const userId = freshUserId();
    await seedAudit(userId, '', 1);
    expect((await barredList()).some((b) => b.userId === userId)).toBe(false);
  });

  it('does NOT list a goo-rate row the client marked as a cross-device merge', async () => {
    // An honest multi-device player: the huge jump is recorded (ratio kept) but
    // the merge-claimed annotation spares them the bar.
    const userId = freshUserId();
    await seedAudit(userId, 'goo-rate,merge-claimed', 0, 7232);
    expect((await barredList()).some((b) => b.userId === userId)).toBe(false);
  });

  it('STILL lists a plain goo-rate row without the merge annotation', async () => {
    const userId = freshUserId();
    await seedAudit(userId, 'goo-rate', 0, 7232);
    expect((await barredList()).some((b) => b.userId === userId)).toBe(true);
  });

  it('aggregates multiple flagged writes into one row with a count', async () => {
    const userId = freshUserId();
    await seedAudit(userId, 'goo-rate', 0, 10, FLAG_TS);
    await seedAudit(userId, 'goo-rate', 0, 40, FLAG_TS + 1000);
    const row = (await barredList()).find((b) => b.userId === userId);
    expect(row!.flaggedWrites).toBe(2);
    expect(Math.round(row!.worstRatio)).toBe(40); // MAX of the two
  });
});

describe('POST /admin/release', () => {
  it('rejects without a token', async () => {
    const res = await call('/admin/release', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: 'x' }),
    });
    expect(res.status).toBe(401);
  });

  it('clears an account\'s failed-audit rows so it drops off the barred list', async () => {
    const userId = freshUserId();
    await seedAudit(userId, 'goo-rate', 0, 7232);
    expect((await barredList()).some((b) => b.userId === userId)).toBe(true);

    const res = await call('/admin/release', {
      method: 'POST',
      headers: auth({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ user_id: userId }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()) as { ok: boolean; released: number }).toEqual({ ok: true, released: 1 });

    expect((await barredList()).some((b) => b.userId === userId)).toBe(false);
  });

  it('leaves clean (ok=1) rows untouched — release only removes the failures', async () => {
    const userId = freshUserId();
    await seedAudit(userId, '', 1); // a good row
    await seedAudit(userId, 'goo-rate', 0, 9000); // a bad row
    await call('/admin/release', {
      method: 'POST',
      headers: auth({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ user_id: userId }),
    });
    const { results } = await env.DB.prepare('SELECT ok FROM save_audit WHERE user_id = ?1').bind(userId).all<{ ok: number }>();
    expect(results.map((r) => r.ok)).toEqual([1]); // only the good row survives
  });

  it('rejects a request with no user_id', async () => {
    const res = await call('/admin/release', {
      method: 'POST',
      headers: auth({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });
});
