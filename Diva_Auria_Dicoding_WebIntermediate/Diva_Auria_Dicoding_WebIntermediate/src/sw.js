const CACHE_NAME = 'dicoding-story-v2';
const urlsToCache = [
  '/',
  '/index.html',
  '/bundle.js',
  '/styles.css',
  '/manifest.json',
  '/sw.js',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png'
];

self.addEventListener('install', (event) => {
  console.log('Service Worker: Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Service Worker: Caching app shell and icons');
        return cache.addAll(urlsToCache);
      })
      .catch(error => {
        console.error('Service Worker: Cache failed:', error);
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  
  if (request.method !== 'GET') return;
  
  if (request.url.includes('story-api.dicoding.dev')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseClone);
          });
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }
  
  event.respondWith(
    caches.match(request)
      .then((response) => response || fetch(request))
  );
});

self.addEventListener('push', (event) => {
  console.log('Service Worker: Push notification received', event);
  
  let notificationData = {};
  
  if (event.data) {
    try {
      notificationData = event.data.json();
    } catch (e) {
      console.error('Failed to parse push data:', e);
      notificationData = {
        title: 'New Notification',
        options: {
          body: event.data.text(),
          icon: 'icons/icon-192.png', 
          badge: 'icons/icon-192.png' 
        }
      };
    }
  }

  const title = notificationData.title || 'Story App Notification';
  const options = {
    body: notificationData.options?.body || 'You have a new story notification',
    icon: notificationData.options?.icon || 'icons/icon-192.png', 
    badge: notificationData.options?.badge || 'icons/icon-192.png', 
    vibrate: [200, 100, 200],
    tag: 'story-notification',
    data: {
      url: notificationData.options?.data?.url || '/#home',
      storyId: notificationData.options?.data?.storyId
    },
    actions: [
      {
        action: 'view',
        title: 'View Story'
      },
      {
        action: 'close',
        title: 'Close'
      }
    ]
  };
  
  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

self.addEventListener('notificationclick', (event) => {
  console.log('Notification clicked:', event);
  
  event.notification.close();
  
  if (event.action === 'view' || !event.action) {
    const url = event.notification.data?.url || '/#home';
    event.waitUntil(
      clients.openWindow(url)
    );
  }
});