// FAEI caching: built files and images come from the cache and refresh in the background.
// Everything else (settings, offer, update checks, analytics) always goes to the network.
const CACHE = 'faei-v4';

self.addEventListener('install', () => self.skipWaiting());
// The panel's last downloaded menu is kept by the page itself (localStorage), so only files are cached here.
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
  // The admin panel (/faei-website/admin) is the exception: the counter must open it with no internet too.
  // It loads from the network when it can (a few seconds at most) and from the last saved copy otherwise.
  if (request.mode === 'navigate') {
    if (!url.pathname.startsWith('/faei-website/admin')) return;
    event.respondWith(caches.open(CACHE).then(async (cache) => {
      const key = '/faei-website/admin/';
      try {
        const response = await Promise.race([fetch(request), new Promise((_, fail) => setTimeout(fail, 4000))]);
        if (response.ok) cache.put(key, response.clone()).catch(() => {});
        return response;
      } catch {
        return (await cache.match(key, { ignoreVary: true })) || fetch(request);
      }
    }));
    return;
  }

  const isStatic = url.pathname.startsWith('/faei-website/assets/') || url.pathname.startsWith('/faei-website/images/') || /\.(png|jpe?g|webp|svg|woff2?)$/.test(url.pathname);
  if (!isStatic) return;
  event.respondWith(caches.open(CACHE).then(async (cache) => {
    const cached = await cache.match(request, { ignoreVary: true });
    const fresh = fetch(request).then((response) => { if (response.ok) cache.put(request, response.clone()).catch(() => {}); return response; });
    if (cached) { fresh.catch(() => {}); return cached; }
    return fresh;
  }).catch(() => fetch(request)));
});
