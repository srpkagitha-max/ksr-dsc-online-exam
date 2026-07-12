const CACHE_NAME = 'ksr-examos-shell-v2-performance-20260712';
const APP_SHELL = [
  './', './index.html', './login.html', './style.css', './manifest.json',
  './icon-192.png', './icon-512.png', './offline.html'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Never intercept Firebase / Google API requests. Exam data must always be live.
  if (url.hostname.includes('firebase') || url.hostname.includes('googleapis') || url.hostname.includes('gstatic')) return;
  if (url.origin !== self.location.origin) return;

  // HTML/navigation: network first, offline page only when disconnected.
  if (req.mode === 'navigate' || req.destination === 'document') {
    event.respondWith(
      fetch(req, { cache: 'no-store' })
        .then(res => res)
        .catch(async () => (await caches.match(req)) || caches.match('./offline.html'))
    );
    return;
  }

  // JS and JSON: network first so new releases appear immediately.
  if (req.destination === 'script' || url.pathname.endsWith('.json')) {
    event.respondWith(
      fetch(req, { cache: 'no-store' }).catch(() => caches.match(req))
    );
    return;
  }

  // CSS/images/fonts: stale-while-revalidate for speed.
  event.respondWith(
    caches.match(req).then(cached => {
      const fresh = fetch(req).then(res => {
        if (res && res.ok) caches.open(CACHE_NAME).then(cache => cache.put(req, res.clone()));
        return res;
      }).catch(() => cached);
      return cached || fresh;
    })
  );
});
