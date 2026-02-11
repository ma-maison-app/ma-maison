const CACHE_NAME = 'ma-maison-v7-MULTI-SELECT';
const urlsToCache = [
  './',
  'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400;500;600&family=Work+Sans:wght@300;400;500&family=Allura&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js'
];

// Install event - cache resources
self.addEventListener('install', (event) => {
  console.log('Service Worker: Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Service Worker: Caching files');
        // Cache files individually so one failure doesn't break everything
        return Promise.allSettled(
          urlsToCache.map(url => 
            cache.add(url).catch(err => {
              console.warn('Failed to cache:', url, err);
              return null;
            })
          )
        );
      })
      .then(() => {
        console.log('Service Worker: Installation complete');
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error('Service Worker: Installation failed:', error);
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('Service Worker: Activating...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Service Worker: Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // ⚠️ CRITICAL: Skip ALL Firebase API requests - don't cache them!
  if (url.hostname.includes('googleapis.com') || 
      url.hostname.includes('firebaseio.com') ||
      url.hostname.includes('firestore.googleapis.com') ||
      url.hostname.includes('identitytoolkit.googleapis.com')) {
    // Let Firebase requests pass through directly - DO NOT CACHE
    return;
  }

  // ⚠️ CRITICAL: Only cache GET requests
  if (request.method !== 'GET') {
    return;
  }

  // 🔥 HTML files: ALWAYS fetch from network first (so updates show immediately!)
  if (url.pathname.endsWith('.html') || url.pathname === '/' || url.pathname === '') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Cache the new version for offline use
          if (response && response.ok) {
            const responseToCache = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseToCache);
            });
          }
          return response;
        })
        .catch(() => {
          // Only use cache if network fails (offline)
          return caches.match(request).then((cached) => {
            return cached || caches.match('./index.html');
          });
        })
    );
    return;
  }

  event.respondWith(
    caches.match(request)
      .then((response) => {
        // Cache hit - return cached response
        if (response) {
          return response;
        }

        // Clone the request
        const fetchRequest = request.clone();

        return fetch(fetchRequest).then((response) => {
          // Check if valid response - accept both basic and cors types
          if (!response || !response.ok) {
            return response;
          }

          // Only cache basic and cors responses (not opaque)
          if (response.type !== 'basic' && response.type !== 'cors') {
            return response;
          }

          // Clone the response
          const responseToCache = response.clone();

          // Cache the fetched resource
          caches.open(CACHE_NAME)
            .then((cache) => {
              cache.put(request, responseToCache);
            });

          return response;
        }).catch(() => {
          // Return a custom offline page if available
          return caches.match('./index.html');
        });
      })
  );
});

// Background sync for Firebase data (when online)
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-firebase') {
    event.waitUntil(
      // Your Firebase sync logic here
      Promise.resolve()
    );
  }
});

// Push notifications (optional - for future features)
self.addEventListener('push', (event) => {
  const options = {
    body: event.data ? event.data.text() : 'Notification from Ma Maison',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    vibrate: [200, 100, 200]
  };

  event.waitUntil(
    self.registration.showNotification('Ma Maison', options)
  );
});

// Notification click handler
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow('/')
  );
});
