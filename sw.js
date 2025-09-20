// sw.js - minimal install/activate so it’s a valid PWA
self.addEventListener('install', (e) => self.skipWaiting());
self.addEventListener('activate', (e) => self.clients.claim());

// Optional: cache the shell so it opens offline
const CACHE = 'qa-shell-v1';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './assets/surah_names.json',
  './assets/pashto-farsi.json',
  './assets/juznames.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).catch(()=>{}));
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  // Cache-first for same-origin GETs
  if (req.method === 'GET' && new URL(req.url).origin === location.origin) {
    event.respondWith(
      caches.match(req).then(hit => hit || fetch(req))
    );
  }
});
