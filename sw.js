// Offline support. Bump VERSION whenever app files change, so phones pick up the new version.
const VERSION = 'wk-v2';
const FILES = [
  './', 'index.html', 'styles.css', 'manifest.webmanifest',
  'src/ui/app.js', 'src/ui/store.js',
  'src/logic/dates.js', 'src/logic/dishes.js', 'src/logic/suggest.js', 'src/logic/plan.js', 'src/logic/backup.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  const own = url.origin === self.location.origin;
  // Own files: cache first, refresh in the background. Fonts: cached once fetched.
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((hit) => {
      const net = fetch(e.request).then((res) => {
        if (res && (res.ok || res.type === 'opaque') && (own || /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname))) {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(e.request, copy));
        }
        return res;
      });
      if (hit) { net.catch(() => {}); return hit; }
      return net.catch(() => (e.request.mode === 'navigate' ? caches.match('index.html') : Response.error()));
    }),
  );
});
