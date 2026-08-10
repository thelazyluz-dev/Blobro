// Minimal, dependency-free service worker for offline play.
// - The HTML document is network-first so new deploys reach testers promptly
//   (the family test is a tuning loop — stale bundles would break it).
// - Hashed build assets are cache-first (their URL changes when they change).
// - Everything is same-origin and local: no third-party requests, ever.

const CACHE = 'blorbo-v217';

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then((c) => c.add('./')));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // never touch cross-origin

  const isDocument =
    request.mode === 'navigate' ||
    request.destination === 'document' ||
    request.headers.get('accept')?.includes('text/html');

  if (isDocument) {
    // Network-first. Only the GAME'S OWN shell (the root) is stored under the
    // './' offline-fallback key — other same-origin pages (admin.html,
    // privacy.html, how-to-play.html) are cached under their OWN url. The old
    // code cached EVERY document under './', so visiting /admin.html once
    // poisoned the shell and the next offline game load served the admin page
    // instead of the game. Now each page falls back to itself, and only a root
    // navigation can ever fall back to the game shell.
    const isAppShell = url.pathname === '/' || url.pathname === '/index.html';
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(isAppShell ? './' : request, copy));
          return res;
        })
        .catch(async () => {
          const own = await caches.match(request); // this exact page, if we have it
          if (own) return own;
          if (isAppShell) {
            const shell = await caches.match('./');
            if (shell) return shell;
          }
          return Response.error(); // offline & uncached → a real network error, never the wrong page
        }),
    );
    return;
  }

  // Cache-first for assets (hashed filenames make this safe).
  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ??
        fetch(request).then((res) => {
          if (res.ok && res.type === 'basic') {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(request, copy));
          }
          return res;
        }),
    ),
  );
});

// ── Web Push ───────────────────────────────────────────────────────────────
// The Worker sends an encrypted JSON payload { title, body, tag?, url? }. Show
// it as a notification; a tap focuses an open tab or opens the app.
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  const title = data.title || 'בלורבו';
  const options = {
    body: data.body || '',
    icon: './icon-192.png',
    badge: './icon-192.png',
    tag: data.tag, // same tag replaces an older notification of the same kind
    data: { url: data.url || './' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || './';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) return client.focus();
      }
      return self.clients.openWindow ? self.clients.openWindow(url) : undefined;
    }),
  );
});
