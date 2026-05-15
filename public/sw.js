const CACHE_NAME = 'posho-mill-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/favicon.svg',
  '/icons.svg'
];

// Install: Cache static assets and force activation
self.addEventListener('install', (event) => {
  self.skipWaiting(); // Force update to new version
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
});

// Fetch Strategy: 
// 1. Stale-While-Revalidate for JS/CSS/Data
// 2. Cache-First for static assets
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET requests (Supabase writes)
  if (event.request.method !== 'GET') return;

  // Skip Supabase API routes and Vite HMR
  if (url.pathname.startsWith('/rest/v1/') || url.hostname.includes('supabase.co') || url.pathname.includes('@vite')) return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        // VALIDATION: Only cache successful basic responses
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
          return networkResponse;
        }

        // IMPORTANT: Clone the response! 
        const responseToCache = networkResponse.clone();
        
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });
        
        return networkResponse;
      }).catch(() => cachedResponse); // Fallback to cache on network failure

      return cachedResponse || fetchPromise;
    })
  );
});

// Activate: Cleanup old caches and take control immediately
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)));
    }).then(() => self.clients.claim()) // Take control of all tabs immediately
  );
});
