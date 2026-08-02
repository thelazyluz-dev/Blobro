// Client-side tests for net/auth.ts. fetch and localStorage are mocked here —
// nothing in this file touches the real network or a real Worker.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function makeLocalStorageMock() {
  let store: Record<string, string> = {};
  return {
    getItem: (k: string) => (k in store ? store[k] : null),
    setItem: (k: string, v: string) => {
      store[k] = v;
    },
    removeItem: (k: string) => {
      delete store[k];
    },
    clear: () => {
      store = {};
    },
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('net/auth', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('localStorage', makeLocalStorageMock());
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('reports a configured backend (AUTH_API is set in src/config.ts)', async () => {
    const { hasAuthBackend } = await import('./auth');
    expect(hasAuthBackend()).toBe(true);
  });

  it('register: success caches the user and sends credentials: include', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ user: { id: '1', email: 'a@b.com', displayName: 'A' } }, 201));
    const { register, cachedUser } = await import('./auth');
    const res = await register({ email: 'a@b.com', password: 'longenough' });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.user).toEqual({ id: '1', email: 'a@b.com', displayName: 'A' });
    expect(cachedUser()?.id).toBe('1');
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.credentials).toBe('include');
    expect(init.method).toBe('POST');
  });

  it('login: success caches the user and sends credentials: include', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ user: { id: '2', email: 'x@y.com', displayName: null } }));
    const { login, cachedUser } = await import('./auth');
    const res = await login({ email: 'x@y.com', password: 'longenough' });
    expect(res.ok).toBe(true);
    expect(cachedUser()?.id).toBe('2');
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.credentials).toBe('include');
  });

  it('login: a 401 surfaces as a typed error, never throws', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'invalid-credentials' }, 401));
    const { login } = await import('./auth');
    await expect(login({ email: 'no@one.com', password: 'wrongwrong' })).resolves.toEqual({
      ok: false,
      error: 'invalid-credentials',
    });
  });

  it('register: a 409 (email already registered) surfaces as a typed error', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'email-taken' }, 409));
    const { register } = await import('./auth');
    await expect(register({ email: 'dupe@e.com', password: 'longenough' })).resolves.toEqual({
      ok: false,
      error: 'email-taken',
    });
  });

  it('login: a 429 (throttled) surfaces as a typed error', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'too-many-attempts' }, 429));
    const { login } = await import('./auth');
    await expect(login({ email: 'a@b.com', password: 'longenough' })).resolves.toEqual({
      ok: false,
      error: 'too-many-attempts',
    });
  });

  it('a network failure surfaces as an error result, never throws', async () => {
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    const { login } = await import('./auth');
    await expect(login({ email: 'a@b.com', password: 'longenough' })).resolves.toEqual({
      ok: false,
      error: 'network',
    });
  });

  it('fetchMe sends credentials: include', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ user: { id: '3', email: 'z@z.com', displayName: null } }));
    const { fetchMe } = await import('./auth');
    await fetchMe();
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.credentials).toBe('include');
  });

  it('logout clears the cache immediately and sends credentials: include', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 200 }));
    const mod = await import('./auth');
    localStorage.setItem('blorbo.authUser', JSON.stringify({ id: '9', email: 'q@q.com', displayName: null }));
    await mod.logout();
    expect(mod.cachedUser()).toBeNull();
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.credentials).toBe('include');
  });

  it('logout clears the cache even when the network call fails', async () => {
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    const mod = await import('./auth');
    localStorage.setItem('blorbo.authUser', JSON.stringify({ id: '9', email: 'q@q.com', displayName: null }));
    await mod.logout();
    expect(mod.cachedUser()).toBeNull();
  });

  it('a network error while revalidating keeps the cached user (offline play must survive)', async () => {
    const mod = await import('./auth');
    localStorage.setItem('blorbo.authUser', JSON.stringify({ id: '5', email: 'k@k.com', displayName: 'K' }));
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    const user = await mod.fetchMe();
    expect(user?.id).toBe('5');
    expect(mod.cachedUser()?.id).toBe('5');
  });

  it('a 5xx while revalidating also keeps the cached user (ambiguous, not definitive)', async () => {
    const mod = await import('./auth');
    localStorage.setItem('blorbo.authUser', JSON.stringify({ id: '7', email: 'p@p.com', displayName: null }));
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'db' }, 500));
    const user = await mod.fetchMe();
    expect(user?.id).toBe('7');
    expect(mod.cachedUser()?.id).toBe('7');
  });

  it('a definitive 401 while revalidating clears the cached user', async () => {
    const mod = await import('./auth');
    localStorage.setItem('blorbo.authUser', JSON.stringify({ id: '6', email: 'm@m.com', displayName: null }));
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'unauthenticated' }, 401));
    const user = await mod.fetchMe();
    expect(user).toBeNull();
    expect(mod.cachedUser()).toBeNull();
  });

  it('googleSignInUrl points at the backend start endpoint', async () => {
    const { googleSignInUrl } = await import('./auth');
    expect(googleSignInUrl()).toBe('https://api.bl-or-bo.com/auth/google/start');
  });

  describe('without a configured backend', () => {
    beforeEach(() => {
      vi.doMock('../config', () => ({ AUTH_API: '' }));
    });

    afterEach(() => {
      vi.doUnmock('../config');
    });

    it('no-ops everywhere and never touches the network', async () => {
      const { hasAuthBackend, fetchMe, login, register, logout } = await import('./auth');
      expect(hasAuthBackend()).toBe(false);
      expect(await fetchMe()).toBeNull();
      expect((await login({ email: 'a@b.com', password: 'longenough' })).ok).toBe(false);
      expect((await register({ email: 'a@b.com', password: 'longenough' })).ok).toBe(false);
      await logout();
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});
