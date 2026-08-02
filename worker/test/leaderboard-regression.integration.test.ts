// Architect's independent check for PR 3a: the auth work edited src/index.ts,
// so this proves the PRE-EXISTING leaderboard surface — including the
// anti-cheat clamps added earlier — did not regress.
import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import worker from '../src/index';

async function call(path: string, init: RequestInit = {}): Promise<Response> {
  const ctx = createExecutionContext();
  const res = await worker.fetch(new Request('https://api.bl-or-bo.com' + path, init), env as never, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}
const post = (body: unknown) =>
  call('/submit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

describe('leaderboard still works after auth was added', () => {
  it('/health still returns {ok:true}', async () => {
    const r = await call('/health');
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true });
  });

  it('/top still returns entries for both metrics', async () => {
    for (const by of ['clicks', 'goo']) {
      const r = await call(`/top?by=${by}&limit=5`);
      expect(r.status, by).toBe(200);
      const j = (await r.json()) as any;
      expect(j.by, by).toBe(by);
      expect(Array.isArray(j.entries), by).toBe(true);
    }
  });

  it('a normal submit is accepted and ranked', async () => {
    const r = await post({ code: 'regressABC123', name: 'regress', clicks: 50, goo: 500 });
    expect(r.status).toBe(200);
    const j = (await r.json()) as any;
    expect(j.ok).toBe(true);
    expect(j.clicks.best).toBe(50);
  });

  it('ANTI-CHEAT: impossible clicks are still hard-rejected', async () => {
    const r = await post({ code: 'cheaterAAA111', name: 'x', clicks: 9_000_000, goo: 1 });
    expect(r.status).toBe(400);
    expect((await r.json() as any).error).toBe('clicks-out-of-range');
  });

  it('ANTI-CHEAT: impossible goo is still hard-rejected', async () => {
    const r = await post({ code: 'cheaterBBB222', name: 'x', clicks: 1, goo: 1e29 });
    expect(r.status).toBe(400);
    expect((await r.json() as any).error).toBe('goo-out-of-range');
  });

  it('ANTI-CHEAT: a brand-new code cannot claim a huge tap count in one shot', async () => {
    const r = await post({ code: 'driveByCCC333', name: 'x', clicks: 4_000_000, goo: 1 });
    expect(r.status).toBe(200);
    const j = (await r.json()) as any;
    expect(j.clicks.best).toBeLessThan(100_000); // clamped by the elapsed-time cap
  });

  it('ANTI-CHEAT: a brand-new code cannot claim huge goo in one shot', async () => {
    const r = await post({ code: 'driveByDDD444', name: 'x', clicks: 1, goo: 1e15 });
    expect(r.status).toBe(200);
    expect(((await r.json()) as any).goo.best).toBeLessThanOrEqual(1_000_000);
  });

  it('the recovery code is NEVER returned by /top', async () => {
    await post({ code: 'secretEEE555', name: 'leaky', clicks: 10, goo: 10 });
    const body = await (await call('/top?by=clicks&limit=100')).text();
    expect(body).not.toContain('secretEEE555');
    expect(body).not.toContain('code');
  });

  it('the nickname filter boundary (server-side length cap) still applies', async () => {
    const r = await post({ code: 'longnameFFF66', name: 'x'.repeat(50), clicks: 5, goo: 5 });
    expect(r.status).toBe(200);
    const top = (await (await call('/top?by=clicks&limit=100')).json()) as any;
    const row = top.entries.find((e: any) => e.name.startsWith('x'));
    expect(row.name.length).toBeLessThanOrEqual(12);
  });
});
