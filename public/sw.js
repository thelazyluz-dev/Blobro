// Minimal, dependency-free service worker for offline play.
// - The HTML document is network-first so new deploys reach testers promptly
//   (the family test is a tuning loop — stale bundles would break it).
// - Hashed build assets are cache-first (their URL changes when they change).
// - Everything is same-origin and local: no third-party requests, ever.

const CACHE = 'blorbo-v124';

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
    // Network-first, fall back to cached shell when offline.
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('./', copy));
          return res;
        })
        .catch(() => caches.match('./').then((r) => r ?? caches.match(request))),
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
