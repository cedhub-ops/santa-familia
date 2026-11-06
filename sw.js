// Service worker : rend l'application installable et rapide à ouvrir.
// Les données (API Google) ne sont jamais mises en cache : elles restent toujours à jour.
const CACHE = 'santa-familia-v6';
const SHELL = ['./', 'index.html', 'config.js?v=6', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/apple-touch-icon.png', 'vendor/qrcode.js'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return; // API : réseau direct
  // Réseau d'abord (pour avoir toujours la dernière version), cache si hors ligne.
  e.respondWith(
    // no-cache : toujours vérifier auprès de GitHub qu'on a la dernière version (config.js compris).
    fetch(e.request, { cache: 'no-cache' })
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request).then(r => r || caches.match('index.html')))
  );
});
