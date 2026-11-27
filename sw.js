/* VIE — service worker de l'appli installable (téléphone / PC par l'adresse https).
   Gabarit : vie-server.cjs (ou mobile/build-mobile.cjs) y inscrit la version (empreinte du contenu) et la liste des fichiers.
   - RÉSEAU D'ABORD : quand le serveur Vie du PC répond, on prend toujours la dernière version ; sinon (PC éteint, hors ligne)
     la copie en cache est servie après 4 s au plus, et l'appli s'ouvre quand même.
   - Ne touche JAMAIS à /api/ (chat, agent, synchronisation, connexion) ni aux données : elles restent dans le stockage local et sur le serveur. */
'use strict';
const VERSION = "62c373442c5c";
const CACHE = 'vie-mobile-' + VERSION;
const FILES = ["./","./app.js","./core.js","./demo-i18n.js","./demo-start.js","./favicon.svg","./i18n-woerterbuch.js","./manifest.webmanifest","./mobile.css","./pwa.js","./styles.css","./vie-actions.js","./vie-agent-ui.js","./vie-assistant.js","./vie-boot.js","./vitrine-neutre.js","./icons/icon-192.png","./icons/icon-512.png","./icons/icon-maskable-192.png","./icons/icon-maskable-512.png","./icons/apple-touch-icon.png","./icons/favicon-48.png"];
const TIMEOUT_MS = 4000;

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES.map(f => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('vie-mobile-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', event => {
  if (event.data === 'VIE_SKIP_WAITING') self.skipWaiting();
});

function networkFirst(request, cacheKey) {
  return caches.open(CACHE).then(cache => {
    const fromCache = () => cache.match(cacheKey, { ignoreSearch: true });
    const net = fetch(request).then(res => {
      if (res && res.ok && res.type === 'basic') cache.put(cacheKey, res.clone()).catch(() => {});
      return res;
    });
    const timer = new Promise(resolve => setTimeout(resolve, TIMEOUT_MS)).then(() => fromCache());
    return Promise.race([net.catch(() => fromCache()), timer.then(r => r || net)])
      .then(r => r || net)
      .catch(() => fromCache().then(r => r || Response.error()));
  });
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const rel = url.pathname.slice(new URL(self.registration.scope).pathname.length - 1);
  if (rel.startsWith('/api/') || rel === '/api' || rel === '/sw.js') return;
  if (req.mode === 'navigate') { event.respondWith(networkFirst(req, './index.html')); return; }
  if (FILES.indexOf('.' + rel) === -1) return;
  event.respondWith(networkFirst(req, req));
});
