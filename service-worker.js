const CACHE_NAME = 'uniprint-cache-v2';
const urlsToCache = [
  '/',
  '/index.html',
  '/upload.html',
  '/orders.html',
  '/success.html',
  '/css/styles.css',
  '/js/app.js',
  '/manifest.json'
];

// Install Event - caches the core assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
  );
});

// Fetch Event - serves cached assets if offline
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Cache hit - return the cached response
        if (response) {
          return response;
        }

        // If not in cache, fetch from network
        return fetch(event.request).catch(error => {
            console.error('Fetch failed; returning offline fallback if available.', error);
        });
      })
  );
});

// Activate Event - clean up obsolete caches
self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});
