// Client-side tests for net/save.ts. fetch is mocked here — nothing in this
// file touches the real network or a real Worker. Follows net/auth.test.ts's
// approach.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultSaveState } from '../game/save';
import type { SaveState } from '../game/types';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function saveWithGoo(lifetimeGoo: number): SaveState {
  return { ...defaultSaveState(0), lifetimeGoo };
}

describe('net/save', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetModules();
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  describe('fetchCloudSave', () => {
    it('returns null on a 401', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'unauthenticated' }, 401));
      const { fetchCloudSave } = await import('./save');
      await expect(fetchCloudSave()).resolves.toBeNull();
    });

    it('returns null on a network rejection, never throws', async () => {
      fetchMock.mockRejectedValueOnce(new Error('offline'));
      const { fetchCloudSave } = await import('./save');
      await expect(fetchCloudSave()).resolves.toBeNull();
    });

    it('parses a 200 correctly', async () => {
      const save = saveWithGoo(500);
      fetchMock.mockResolvedValueOnce(jsonResponse({ rev: 3, updated: 12345, save }));
      const { fetchCloudSave } = await import('./save');
      await expect(fetchCloudSave()).resolves.toEqual({ rev: 3, updated: 12345, save });
      const init = fetchMock.mock.calls[0][1] as RequestInit;
      expect(init.credentials).toBe('include');
    });

    it('parses the "nothing in the cloud yet" 200 shape', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ rev: 0, updated: 0, save: null }));
      const { fetchCloudSave } = await import('./save');
      await expect(fetchCloudSave()).resolves.toEqual({ rev: 0, updated: 0, save: null });
    });
  });

  describe('pushCloudSave', () => {
    it('sends credentials: include and the right body shape', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ rev: 4, updated: 999 }));
      const { pushCloudSave } = await import('./save');
      const save = saveWithGoo(10);
      const res = await pushCloudSave(3, save);
      expect(res).toEqual({ ok: true, rev: 4, updated: 999 });
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toMatch(/\/save$/);
      expect(init.method).toBe('PUT');
      expect(init.credentials).toBe('include');
      expect(JSON.parse(init.body as string)).toEqual({ baseRev: 3, save });
    });

    it('surfaces a 409 as a conflict carrying the cloud save', async () => {
      const cloudSave = saveWithGoo(999);
      fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'stale', rev: 7, updated: 111, save: cloudSave }, 409));
      const { pushCloudSave } = await import('./save');
      const res = await pushCloudSave(3, saveWithGoo(10));
      expect(res).toEqual({ ok: false, conflict: { rev: 7, updated: 111, save: cloudSave } });
    });

    it('returns {ok:false, conflict:null} on a 500', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'db' }, 500));
      const { pushCloudSave } = await import('./save');
      await expect(pushCloudSave(3, saveWithGoo(10))).resolves.toEqual({ ok: false, conflict: null });
    });

    it('returns {ok:false, conflict:null} on a network rejection, never throws', async () => {
      fetchMock.mockRejectedValueOnce(new Error('offline'));
      const { pushCloudSave } = await import('./save');
      await expect(pushCloudSave(3, saveWithGoo(10))).resolves.toEqual({ ok: false, conflict: null });
    });
  });

  describe('without a configured backend', () => {
    beforeEach(() => {
      vi.doMock('../config', () => ({ AUTH_API: '' }));
    });

    afterEach(() => {
      vi.doUnmock('../config');
    });

    it('no-ops everywhere and never touches the network', async () => {
      const { fetchCloudSave, pushCloudSave } = await import('./save');
      await expect(fetchCloudSave()).resolves.toBeNull();
      await expect(pushCloudSave(0, saveWithGoo(10))).resolves.toEqual({ ok: false, conflict: null });
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('decideMergeWinner (the merge rule)', () => {
    it('cloud wins when its lifetimeGoo is higher', async () => {
      const { decideMergeWinner } = await import('./save');
      const local = saveWithGoo(100);
      const cloud = saveWithGoo(200);
      expect(decideMergeWinner(local, { rev: 5, save: cloud })).toEqual({ winner: 'cloud', cloudRev: 5 });
    });

    it('local wins on a tie', async () => {
      const { decideMergeWinner } = await import('./save');
      const local = saveWithGoo(100);
      const cloud = saveWithGoo(100);
      expect(decideMergeWinner(local, { rev: 5, save: cloud })).toEqual({ winner: 'local', cloudRev: 5 });
    });

    it('local wins when higher', async () => {
      const { decideMergeWinner } = await import('./save');
      const local = saveWithGoo(300);
      const cloud = saveWithGoo(100);
      expect(decideMergeWinner(local, { rev: 5, save: cloud })).toEqual({ winner: 'local', cloudRev: 5 });
    });

    it('cloud is adopted unconditionally when there is no local save', async () => {
      const { decideMergeWinner } = await import('./save');
      const cloud = saveWithGoo(1);
      expect(decideMergeWinner(null, { rev: 9, save: cloud })).toEqual({ winner: 'cloud', cloudRev: 9 });
    });

    it('local wins (default rev 0) when there is no cloud save at all', async () => {
      const { decideMergeWinner } = await import('./save');
      const local = saveWithGoo(100);
      expect(decideMergeWinner(local, null)).toEqual({ winner: 'local', cloudRev: 0 });
    });

    it('falls back to "default" (fresh game) when neither exists', async () => {
      const { decideMergeWinner } = await import('./save');
      expect(decideMergeWinner(null, null)).toEqual({ winner: 'default', cloudRev: 0 });
    });
  });

  // store.ts's loadGame calls persistence.ts's backupLocal() BEFORE adopting a
  // winning cloud save (see its "never drop a player's progress" comment).
  // store.ts itself can't be imported here (it wires up window/document at
  // module scope for the browser), so this exercises the safety net it
  // relies on directly: the backup must land under its own key, never
  // clobbering — or being clobbered by — the live save.
  describe('backupLocal / loadBackup (the merge-rule safety net)', () => {
    beforeEach(() => {
      const rows = new Map<string, unknown>();
      vi.doMock('idb', () => ({
        openDB: vi.fn().mockResolvedValue({
          get: async (_store: string, key: string) => rows.get(key),
          put: async (_store: string, val: unknown, key: string) => {
            rows.set(key, val);
          },
        }),
      }));
    });

    afterEach(() => vi.doUnmock('idb'));

    it('stores the local save under a separate key, leaving the live save untouched', async () => {
      const { persist, loadRaw, backupLocal, loadBackup } = await import('../persistence');
      const live = saveWithGoo(50);
      const displaced = saveWithGoo(30); // what was on-device before the cloud won
      await persist(live);
      await backupLocal(displaced);

      await expect(loadRaw()).resolves.toEqual(live);
      await expect(loadBackup()).resolves.toEqual(displaced);
    });

    it('loadBackup returns undefined when nothing has ever been backed up', async () => {
      const { loadBackup } = await import('../persistence');
      await expect(loadBackup()).resolves.toBeUndefined();
    });
  });
});
