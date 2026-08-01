const CACHE_NAME = 'swim-timer-v1';
const urlsToCache = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './timer.html',
  './timer.css',
  './timer.js'
];

self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function(cache) {
        return cache.addAll(urlsToCache);
      })
  );
});

self.addEventListener('fetch', function(event) {
  event.respondWith(
    caches.match(event.request)
      .then(function(response) {
        // キャッシュがあればそれを返し、なければネットワークから取得する
        return response || fetch(event.request);
      })
  );
});