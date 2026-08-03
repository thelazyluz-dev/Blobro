// The nightly housekeeping sweep (src/index.ts `scheduled`).
//
// This is the only code in the Worker that DELETES data it wasn't asked to
// delete, so what matters here is not that it removes rows but that it removes
// exactly the right ones: live sessions must survive, and flagged audit rows
// must survive forever, because they are the entire reason that table exists.

import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import worker from '../src/index';

// The email/password routes are disabled in production (Google-only sign-in).
// These tests create accounts through them because it is the only way to mint
// a session without a real Google round-trip; the disabled-by-default behaviour
// has its own tests in auth-endpoints.integration.test.ts.
(env as { ALLOW_PASSWORD_AUTH?: string }).ALLOW_PASSWORD_AUTH = '1';

const DAY = 24 * 60 * 60 * 1000;

async function runSweep(): Promise<void> {
  const ctx = createExecutionContext();
  await worker.scheduled!({ cron: '0 3 * * *', scheduledTime: Date.now(), noRetry() {} }, env, ctx);
  await waitOnExecutionContext(ctx);
}

let n = 0;
const uniq = () => `sweep-${++n}-${Date.now()}`;

describe('scheduled sweep — sessions', () => {
  it('deletes expired sessions and leaves live ones alone', async () => {
    const dead = uniq();
    const live = uniq();
    const now = Date.now();
    await env.DB.prepare('INSERT INTO sessions (token_hash, user_id, created, expires) VALUES (?1, ?2, ?3, ?4)')
      .bind(dead, 'u1', now - 40 * DAY, now - DAY)
      .run();
    await env.DB.prepare('INSERT INTO sessions (token_hash, user_id, created, expires) VALUES (?1, ?2, ?3, ?4)')
      .bind(live, 'u1', now, now + 30 * DAY)
      .run();

    await runSweep();

    const gone = await env.DB.prepare('SELECT token_hash FROM sessions WHERE token_hash = ?1').bind(dead).first();
    const kept = await env.DB.prepare('SELECT token_hash FROM sessions WHERE token_hash = ?1').bind(live).first();
    expect(gone).toBeNull();
    expect(kept).not.toBeNull();
  });
});

describe('scheduled sweep — save_audit', () => {
  const insertAudit = (userId: string, created: number, ok: number) =>
    env.DB.prepare(
      `INSERT INTO save_audit (user_id, rev, created, elapsed_sec, goo_gain, max_gain, ratio, click_gain, flags, ok)
       VALUES (?1, 1, ?2, 60, 10, 1000, 0.01, 5, '', ?3)`,
    )
      .bind(userId, created, ok)
      .run();

  it('deletes clean rows past the retention window', async () => {
    const user = uniq();
    await insertAudit(user, Date.now() - 40 * DAY, 1);

    await runSweep();

    const left = await env.DB.prepare('SELECT COUNT(*) AS c FROM save_audit WHERE user_id = ?1')
      .bind(user)
      .first<{ c: number }>();
    expect(left!.c).toBe(0);
  });

  it('KEEPS flagged rows forever, however old', async () => {
    // These are rare and are the whole point of the table — losing them to
    // housekeeping would quietly destroy the evidence PR 6 needs.
    const user = uniq();
    await insertAudit(user, Date.now() - 400 * DAY, 0);

    await runSweep();

    const left = await env.DB.prepare('SELECT COUNT(*) AS c FROM save_audit WHERE user_id = ?1')
      .bind(user)
      .first<{ c: number }>();
    expect(left!.c).toBe(1);
  });

  it('keeps recent clean rows', async () => {
    const user = uniq();
    await insertAudit(user, Date.now() - DAY, 1);

    await runSweep();

    const left = await env.DB.prepare('SELECT COUNT(*) AS c FROM save_audit WHERE user_id = ?1')
      .bind(user)
      .first<{ c: number }>();
    expect(left!.c).toBe(1);
  });
});

describe('scheduled sweep — resilience', () => {
  it('does not throw when a table is missing', async () => {
    // The owner deploys the Worker by hand, so there is necessarily a window
    // where this code is live and the schema is not. Housekeeping must never
    // be the reason anything breaks.
    await env.DB.prepare('DROP TABLE IF EXISTS save_audit').run();
    try {
      await expect(runSweep()).resolves.toBeUndefined();
    } finally {
      await env.DB.prepare(
        `CREATE TABLE IF NOT EXISTS save_audit (
           id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, rev INTEGER NOT NULL,
           created INTEGER NOT NULL, elapsed_sec REAL NOT NULL, goo_gain REAL NOT NULL,
           max_gain REAL NOT NULL, ratio REAL NOT NULL, click_gain INTEGER NOT NULL,
           flags TEXT NOT NULL, ok INTEGER NOT NULL)`,
      ).run();
    }
  });
});
