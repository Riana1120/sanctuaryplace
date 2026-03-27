// Sanctuary Service Worker v4
const CACHE_NAME = 'sanctuary-v4';
const CORE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png'
];
const BG_ASSETS = [
  '/bg/drizzle.jpg',
  '/bg/drizzle1.jpg',
  '/bg/drizzle2.jpg',
  '/bg/drizzle3.jpg',
  '/bg/sunny.jpg'
];

// Install: cache core assets first, bg images are optional
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Background images cached individually - failures don't block install
      BG_ASSETS.forEach(url => cache.add(url).catch(() => {}));
      // Core assets must succeed
      return cache.addAll(CORE_ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate: clean old caches immediately
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      );
    })
  );
  self.clients.claim();
});

// Fetch: network-first with timeout, fallback to cache
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  if (!event.request.url.startsWith(self.location.origin)) return;
  if (event.request.url.includes('/undefined')) return;

  const isNavigation = event.request.mode === 'navigate';
  const isHTML = event.request.url.endsWith('.html') || event.request.url.endsWith('/');

  // HTML / navigation: race network vs cache with 3s timeout
  if (isNavigation || isHTML) {
    event.respondWith(
      new Promise((resolve) => {
        let settled = false;
        // Timeout: serve cache after 3s if network is slow
        const timer = setTimeout(() => {
          if (settled) return;
          settled = true;
          caches.match(event.request).then(cached => {
            if (cached) resolve(cached);
            // If no cache either, keep waiting for network
          });
        }, 3000);

        fetch(event.request).then((response) => {
          if (settled && !response.ok) return; // already served cache
          settled = true;
          clearTimeout(timer);
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(c => {
              c.put(event.request, clone);
              // Also cache as /index.html if navigating to /
              if (event.request.url.endsWith('/')) {
                c.put(new Request(event.request.url + 'index.html'), response.clone());
              }
            });
          }
          resolve(response);
        }).catch(() => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          caches.match(event.request).then(cached => {
            resolve(cached || new Response('Offline - please check your network', {
              status: 503, headers: { 'Content-Type': 'text/plain' }
            }));
          });
        });
      })
    );
    return;
  }

  // Other assets: network first, cache fallback (no timeout needed)
  event.respondWith(
    fetch(event.request).then((response) => {
      if (response.ok) {
        const clone = response.clone();
        caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
      }
      return response;
    }).catch(() => {
      return caches.match(event.request);
    })
  );
});
