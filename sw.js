/* Retro Classic Games — offline cache. Bump VERSION when assets change. */
const VERSION = 'v2';
const CACHE = `rcg-${VERSION}`;
const ASSETS = [
  '/', '/snake', '/breaker', '/racer', '/stack', '/pong', '/tanks', '/crossing', '/invaders', '/flappy', '/scores',
  '/css/style.css', '/js/lcd.js', '/js/hub.js', '/js/scores.js',
  '/js/snake.js', '/js/breaker.js', '/js/racer.js', '/js/stack.js', '/js/pong.js', '/js/tanks.js',
  '/js/crossing.js', '/js/invaders.js', '/js/flappy.js',
  '/icon.svg', '/icon-192.png', '/icon-512.png', '/apple-touch-icon.png', '/manifest.webmanifest',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(caches.open(CACHE).then(async (cache) => {
    const cached = await cache.match(req, { ignoreSearch: true });
    const network = fetch(req).then((res) => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => null);
    if (cached) return cached;
    const res = await network;
    if (res) return res;
    if (req.mode === 'navigate') return cache.match('/');
    return Response.error();
  }));
});
