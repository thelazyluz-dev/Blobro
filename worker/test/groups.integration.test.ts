// Groups (friend / family / class boards). A group is created with a kid-safe
// name, shared by an opaque code, and shows a MEMBER-ONLY leaderboard. These
// tests pin: the name gate (length + profanity), the join flow (idempotent,
// no format/existence oracle, full-group refusal), the caps (10 groups per
// user, 60 members per group), last-member-out deleting the group row, and —
// most importantly — that the board is refused to non-members and never leaks
// a user id, a code, or anything beyond nickname + score + a `me` flag.

import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import worker from '../src/index';

// Password auth is disabled in production (Google-only); the suite enables it to
// mint sessions without a real Google round-trip. No save-interval throttle so
// a save can land right before a /submit.
(env as { ALLOW_PASSWORD_AUTH?: string }).ALLOW_PASSWORD_AUTH = '1';
(env as { MIN_SAVE_INTERVAL_MS?: string }).MIN_SAVE_INTERVAL_MS = '0';

async function call(path: string, init: RequestInit = {}): Promise<Response> {
  const request = new Request(`http://worker.example${path}`, init);
  const ctx = createExecutionContext();
  const res = await worker.fetch(request, env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

let n = 0;
async function signUp(): Promise<string> {
  const res = await call('/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: `group${++n}-${Date.now()}@example.com`, password: 'hunter22' }),
  });
  expect(res.status).toBe(201);
  return (res.headers.get('Set-Cookie') ?? '').split(';')[0];
}

/** The account's internal id — what the board must NEVER leak. */
async function userIdOf(cookie: string): Promise<string> {
  const res = await call('/auth/me', { headers: { Cookie: cookie } });
  expect(res.status).toBe(200);
  const body = (await res.json()) as { user: { id: string } };
  return body.user.id;
}

function save(over: Record<string, unknown> = {}) {
  return {
    version: 12, goo: 10, lifetimeGoo: 2_500, clicks: 120,
    upgrades: { finger: 1, power: 0, autoTap: 0, nurture: 0, crit: 0, luck: 0 },
    characters: {}, eggs: 0, totalHatches: 0, sinceRare: 0, bonusesCollected: 0,
    leaderboard: [], achievements: [], ownedCosmetics: [],
    equippedBlob: 'blob-goo', equippedBackground: 'bg-aurora',
    equippedAccessory: 'acc-none', equippedSound: 'sound-classic',
    equippedMain: null, milestonesShown: [], lastSeen: Date.now(), muted: false,
    rng: { seed: 1, cursor: 0 }, ...over,
  };
}

const putSave = (cookie: string, s: unknown, baseRev = 0) =>
  call('/save', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ baseRev, save: s }),
  });

const submit = (cookie: string, name: string) =>
  call('/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ name }),
  });

const post = (path: string, cookie: string, body: unknown) =>
  call(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify(body),
  });

const create = (cookie: string, name: string) => post('/group/create', cookie, { name });
const join = (cookie: string, code: string) => post('/group/join', cookie, { code });
const leave = (cookie: string, id: string) => post('/group/leave', cookie, { id });
const mine = (cookie: string) => call('/group/mine', { headers: { Cookie: cookie } });
const board = (cookie: string, id: string, by?: string) =>
  call(`/group/board?id=${encodeURIComponent(id)}${by ? `&by=${by}` : ''}`, { headers: { Cookie: cookie } });

interface Created { ok: boolean; id: string; code: string; name: string }
async function createdGroup(cookie: string, name: string): Promise<Created> {
  const res = await create(cookie, name);
  expect(res.status).toBe(201);
  return (await res.json()) as Created;
}

beforeEach(async () => {
  // A shared D1 persists across tests in a file; wipe both group tables so each
  // test's assertions see only its own groups.
  await env.DB.prepare('DELETE FROM group_members').run();
  await env.DB.prepare('DELETE FROM groups').run();
});

describe('POST /group/create', () => {
  it('creates a group and returns id + share code + name', async () => {
    const cookie = await signUp();
    const g = await createdGroup(cookie, 'הַכִּתָּה שֶׁלִּי');
    expect(g.ok).toBe(true);
    expect(g.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(g.code).toMatch(/^[A-Za-z0-9]{8}$/);
    expect(g.name).toBe('הַכִּתָּה שֶׁלִּי');
  });

  it('rejects a profane, too-short, or too-long name', async () => {
    const cookie = await signUp();
    for (const bad of ['shit', 'א', 'א'.repeat(25)]) {
      const res = await create(cookie, bad);
      expect(res.status).toBe(400);
      expect(((await res.json()) as { error: string }).error).toBe('bad-name');
    }
  });

  it('requires a session', async () => {
    const res = await call('/group/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'בְּלִי חֶשְׁבּוֹן' }),
    });
    expect(res.status).toBe(401);
  });
});

describe('POST /group/join', () => {
  it('joins by code, and shows up in BOTH members\' /group/mine', async () => {
    const a = await signUp();
    const b = await signUp();
    const g = await createdGroup(a, 'מִשְׁפָּחָה');

    const res = await join(b, g.code);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; id: string; name: string; already?: boolean };
    expect(body).toMatchObject({ ok: true, id: g.id, name: 'מִשְׁפָּחָה' });
    expect(body.already).toBeUndefined();

    for (const cookie of [a, b]) {
      const list = (await (await mine(cookie)).json()) as { groups: { id: string; members: number }[] };
      expect(list.groups).toHaveLength(1);
      expect(list.groups[0].id).toBe(g.id);
      expect(list.groups[0].members).toBe(2);
    }
  });

  it('is idempotent — re-joining answers already:true, never an error', async () => {
    const a = await signUp();
    const b = await signUp();
    const g = await createdGroup(a, 'חֲבֵרִים');
    expect((await join(b, g.code)).status).toBe(200);

    const again = await join(b, g.code);
    expect(again.status).toBe(200);
    expect((await again.json()) as object).toMatchObject({ ok: true, id: g.id, already: true });
  });

  it('answers 404 for an unknown code AND for a malformed one (no format oracle)', async () => {
    const cookie = await signUp();
    for (const code of ['AAAAbbbb', 'no', 'has spaces!']) {
      const res = await join(cookie, code);
      expect(res.status).toBe(404);
      expect(((await res.json()) as { error: string }).error).toBe('not-found');
    }
  });

  it('refuses the 61st member of a full group', async () => {
    const a = await signUp();
    const g = await createdGroup(a, 'כִּתָּה מְלֵאָה');
    // Fill to the 60-member cap cheaply: creator + 59 synthetic member rows.
    const now = Date.now();
    await env.DB.batch(
      Array.from({ length: 59 }, (_, i) =>
        env.DB.prepare('INSERT INTO group_members (group_id, user_id, joined) VALUES (?1, ?2, ?3)')
          .bind(g.id, `synthetic-${i}`, now),
      ),
    );

    const b = await signUp();
    const res = await join(b, g.code);
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: string }).error).toBe('full');
  });
});

describe('POST /group/leave', () => {
  it('removes the membership', async () => {
    const a = await signUp();
    const b = await signUp();
    const g = await createdGroup(a, 'עוֹזְבִים');
    expect((await join(b, g.code)).status).toBe(200);

    expect((await leave(b, g.id)).status).toBe(200);
    const list = (await (await mine(b)).json()) as { groups: unknown[] };
    expect(list.groups).toHaveLength(0);
    // The group itself survives — a member remains.
    const alist = (await (await mine(a)).json()) as { groups: { members: number }[] };
    expect(alist.groups[0].members).toBe(1);
  });

  it('deletes the groups row when the last member leaves (no orphans)', async () => {
    const a = await signUp();
    const g = await createdGroup(a, 'זְמַנִּי');
    expect((await leave(a, g.id)).status).toBe(200);
    const row = await env.DB.prepare('SELECT id FROM groups WHERE id = ?1').bind(g.id).first();
    expect(row).toBeNull();
  });
});

describe('GET /group/mine', () => {
  it('lists every group with its member count', async () => {
    const a = await signUp();
    const b = await signUp();
    const g1 = await createdGroup(a, 'קְבוּצָה א');
    const g2 = await createdGroup(a, 'קְבוּצָה ב');
    expect((await join(b, g2.code)).status).toBe(200);

    const list = (await (await mine(a)).json()) as { groups: { id: string; name: string; code: string; members: number }[] };
    expect(list.groups).toHaveLength(2);
    const byId = new Map(list.groups.map((g) => [g.id, g]));
    expect(byId.get(g1.id)).toMatchObject({ name: 'קְבוּצָה א', code: g1.code, members: 1 });
    expect(byId.get(g2.id)).toMatchObject({ name: 'קְבוּצָה ב', code: g2.code, members: 2 });
  });
});

describe('GET /group/board', () => {
  it('is refused to a non-member (403), even for a real group', async () => {
    const a = await signUp();
    const stranger = await signUp();
    const g = await createdGroup(a, 'פְּרָטִית');
    const res = await board(stranger, g.id);
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: string }).error).toBe('not-a-member');
  });

  it('shows ALL members sorted by the metric, marks only my row, and never leaks ids', async () => {
    const a = await signUp(); // will submit a score under a nickname
    const b = await signUp(); // never submits — must still appear, at 0
    const g = await createdGroup(a, 'הַלּוּחַ שֶׁלָּנוּ');
    expect((await join(b, g.code)).status).toBe(200);

    // A on the public board with 120 clicks under a nickname.
    await putSave(a, save());
    expect((await submit(a, 'רוֹנִי')).status).toBe(200);

    const res = await board(b, g.id, 'clicks');
    expect(res.status).toBe(200);
    const text = await res.text();
    const body = JSON.parse(text) as {
      id: string; name: string; by: string;
      entries: { name: string; score: number; me: boolean }[];
    };
    expect(body).toMatchObject({ id: g.id, name: 'הַלּוּחַ שֶׁלָּנוּ', by: 'clicks' });
    expect(body.entries).toHaveLength(2);
    // Sorted by score DESC: the submitter first, the newcomer at 0 after.
    expect(body.entries[0]).toEqual({ name: 'רוֹנִי', score: 120, me: false });
    // The member who never submitted gets the kid-safe fallback name.
    expect(body.entries[1]).toEqual({ name: 'שַׂחְקָן חָדָשׁ', score: 0, me: true });
    // Entries carry nickname + score + me and NOTHING identifying: neither
    // member's internal id may appear anywhere in the raw response.
    for (const cookie of [a, b]) {
      const uid = await userIdOf(cookie);
      expect(text.includes(uid)).toBe(false);
      expect(text.includes(uid.replace(/-/g, ''))).toBe(false);
    }
  });

  it("marks `me` on the caller's own row from the other side too", async () => {
    const a = await signUp();
    const b = await signUp();
    const g = await createdGroup(a, 'שְׁנֵי צְדָדִים');
    expect((await join(b, g.code)).status).toBe(200);

    const body = (await (await board(a, g.id)).json()) as { entries: { me: boolean }[] };
    expect(body.entries.filter((e) => e.me)).toHaveLength(1);
  });
});

describe('the per-user group cap', () => {
  it('refuses an 11th group, on create and on join alike', async () => {
    const a = await signUp();
    for (let i = 0; i < 10; i++) {
      await createdGroup(a, `קְבוּצָה ${i + 1}`);
    }

    const res = await create(a, 'אַחַת יוֹתֵר מִדַּי');
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: string }).error).toBe('too-many-groups');

    const b = await signUp();
    const g = await createdGroup(b, 'שֶׁל מִישֶׁהוּ אַחֵר');
    const joinRes = await join(a, g.code);
    expect(joinRes.status).toBe(403);
    expect(((await joinRes.json()) as { error: string }).error).toBe('too-many-groups');
  });
});
