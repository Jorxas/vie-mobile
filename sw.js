/* VIE mobile — service worker (hors ligne).
   Gabarit : mobile/build-mobile.cjs y inscrit la version (empreinte du contenu) et la liste des fichiers à la construction.
   - Met en cache les fichiers de l'appli (jamais les données : elles restent dans le stockage local du téléphone).
   - Cache d'abord : l'appli s'ouvre sans réseau.
   - Nouvelle version : installée en arrière-plan, appliquée seulement quand l'utilisateur touche « Mettre à jour ». */
'use strict';
const VERSION = "d9de4abb3693";
const CACHE = 'vie-mobile-' + VERSION;
const FILES = ["./","./index.html","./styles.css","./mobile.css","./core.js","./app.js","./pwa.js","./manifest.webmanifest","./icons/icon-192.png","./icons/icon-512.png","./icons/icon-maskable-192.png","./icons/icon-maskable-512.png","./icons/apple-touch-icon.png","./icons/favicon-48.png"];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES.map(f => new Request(f, { cache: 'reload' })))));
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

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    event.respondWith(caches.open(CACHE).then(c => c.match('./index.html')).then(r => r || fetch(req)));
    return;
  }
  event.respondWith(caches.open(CACHE).then(c => c.match(req, { ignoreSearch: true })).then(r => r || fetch(req)));
});
