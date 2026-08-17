/**
 * Minimal installable PWA shell. Bump CACHE_NAME when you need to force-refresh
 * cached HTML after a deploy (or rely on users getting fresh navigations online).
 */
const CACHE_NAME = 'techflash-shell-v2';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) =>
        cache.addAll(['/index.html', '/manifest.webmanifest', '/techflash-favicon.png'])
      )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((key) => (key !== CACHE_NAME ? caches.delete(key) : undefined)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  // Only intercept page navigations. Wrapping API/asset fetches in respondWith(fetch())
  // turns network blips into failed requests and can leave signup stuck on "Please wait…".
  if (request.mode !== 'navigate') return;
  event.respondWith(
    fetch(request).catch(async () => {
      const cache = await caches.open(CACHE_NAME);
      return (await cache.match('/index.html')) || Response.error();
    })
  );
});
