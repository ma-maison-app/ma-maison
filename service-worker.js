const CACHE_NAME = 'ma-maison-v12-cloudinary';
const urlsToCache = [
  './',
  'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400;500;600&family=Work+Sans:wght@300;400;500&family=Allura&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js'
];

// Install event - cache resources
self.addEventListener('install', (event) => {
  console.log('Service Worker: Installing v10 (Cloudinary)...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Service Worker: Caching files');
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
  console.log('Service Worker: Activating v10...');
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
    }).then(() => {
      console.log('Service Worker: v10 activated, claiming clients');
      return self.clients.claim();
    })
  );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // ⚠️ CRITICAL: Skip ALL Firebase + Cloudinary requests - never cache them!
  if (url.hostname.includes('googleapis.com') || 
      url.hostname.includes('firebaseio.com') ||
      url.hostname.includes('firestore.googleapis.com') ||
      url.hostname.includes('identitytoolkit.googleapis.com') ||
      url.hostname.includes('cloudinary.com') ||        // ← audio uploads/playback
      url.hostname.includes('res.cloudinary.com')) {    // ← Cloudinary media CDN
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
          if (response && response.ok) {
            const responseToCache = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseToCache);
              console.log('Service Worker: Cached updated HTML:', url.pathname);
            });
          }
          return response;
        })
        .catch(() => {
          console.log('Service Worker: Network failed, serving from cache:', url.pathname);
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
        if (response) {
          return response;
        }

        const fetchRequest = request.clone();

        return fetch(fetchRequest).then((response) => {
          if (!response || !response.ok) {
            return response;
          }

          if (response.type !== 'basic' && response.type !== 'cors') {
            return response;
          }

          const responseToCache = response.clone();

          caches.open(CACHE_NAME)
            .then((cache) => {
              cache.put(request, responseToCache);
            });

          return response;
        }).catch(() => {
          return caches.match('./index.html');
        });
      })
  );
});

// Background sync for Firebase data (when online)
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-firebase') {
    event.waitUntil(Promise.resolve());
  }
});

// Push notifications
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
