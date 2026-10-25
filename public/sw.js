// FAEI offline support: pages load from the network first and fall back to the
// last copy; built files and images come from the cache and refresh in the background.
// Settings, offer and analytics always go to the network.
const CACHE = 'faei-v2';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.endsWith('.json') || url.pathname.startsWith('/_vercel')) return;

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request)
      .then((response) => { const copy = response.clone(); caches.open(CACHE).then((cache) => cache.put('/', copy)); return response; })
      .catch(() => caches.match('/')));
    return;
  }

  event.respondWith(caches.open(CACHE).then(async (cache) => {
    const cached = await cache.match(request);
    const fresh = fetch(request).then((response) => { if (response.ok) cache.put(request, response.clone()); return response; });
    if (cached) { fresh.catch(() => {}); return cached; }
    return fresh;
  }));
});
