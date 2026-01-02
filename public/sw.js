// Service Worker for Flownote PWA
// v3: Improved session persistence for PWA auto-login

const CACHE_NAME = 'flownote-v3';
// Only cache static pages, not protected routes
const urlsToCache = [
  '/',
  '/manifest.json'
];

// Install event - cache resources
self.addEventListener('install', (event) => {
  // 새 서비스 워커 즉시 활성화
  self.skipWaiting();

  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
  );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip service worker for API routes and auth callbacks
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/')) {
    return;
  }

  // For protected routes (dashboard, history, settings, onboarding), always use network
  // to ensure authentication is checked
  const protectedRoutes = ['/dashboard', '/history', '/settings', '/onboarding'];
  const isProtectedRoute = protectedRoutes.some(route => url.pathname.startsWith(route));

  if (isProtectedRoute) {
    event.respondWith(
      fetch(request, {
        redirect: 'follow',
        credentials: 'include'
      }).catch(() => {
        // Fallback to cache if network fails
        return caches.match(request);
      })
    );
    return;
  }

  // For other routes, try cache first, then network
  event.respondWith(
    caches.match(request)
      .then((response) => {
        // Cache hit - return response
        if (response) {
          return response;
        }
        // Network request with redirect follow
        return fetch(request, {
          redirect: 'follow',
          credentials: 'include'
        });
      })
      .catch(() => {
        // If both cache and network fail, return a fallback
        return new Response('Offline', { status: 503 });
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    Promise.all([
      // 이전 캐시 삭제
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheWhitelist.indexOf(cacheName) === -1) {
              return caches.delete(cacheName);
            }
          })
        );
      }),
      // 새 서비스 워커가 즉시 모든 클라이언트 제어
      self.clients.claim()
    ])
  );
});
