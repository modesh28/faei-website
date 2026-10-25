// FAEI caching: built files and images come from the cache and refresh in the background.
// Everything else (settings, offer, update checks, analytics) always goes to the network.
const CACHE = 'faei-v4';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== location.origin || request.cache === 'no-store') return;

  // Pages always load straight from the network, untouched. In-app browsers (Instagram)
  // show "There was a problem while loading this website" if a worker answers a page load badly.
  if (request.mode === 'navigate') return;

  const isStatic = url.pathname.startsWith('/assets/') || url.pathname.startsWith('/images/') || /\.(png|jpe?g|webp|svg|woff2?)$/.test(url.pathname);
  if (!isStatic) return;
  event.respondWith(caches.open(CACHE).then(async (cache) => {
    const cached = await cache.match(request);
    const fresh = fetch(request).then((response) => { if (response.ok) cache.put(request, response.clone()).catch(() => {}); return response; });
    if (cached) { fresh.catch(() => {}); return cached; }
    return fresh;
  }).catch(() => fetch(request)));
});
