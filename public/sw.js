// Service Worker para MPF Maquinaria - Nuevo Cobre
// Optimizado para funcionar offline a 4000m
// v1.0.1 - Fix: manejo de errores en fetch para no bloquear instalación PWA

const CACHE_NAME = 'mpf-maquinaria-v1.0.1';
const RUNTIME_CACHE = 'mpf-runtime-v1';

const CRITICAL_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
];

// ==========================================
// INSTALACIÓN
// ==========================================
self.addEventListener('install', (event) => {
  console.log('[SW] 🔧 Instalando Service Worker v1.0.1');

  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(CRITICAL_ASSETS))
      .then(() => {
        console.log('[SW] ✅ Service Worker instalado');
        return self.skipWaiting();
      })
      .catch((error) => {
        // No lanzar el error: un fallo de instalación no debe romper la PWA
        console.error('[SW] ❌ Error en instalación:', error);
      })
  );
});

// ==========================================
// ACTIVACIÓN
// ==========================================
self.addEventListener('activate', (event) => {
  console.log('[SW] 🚀 Activando Service Worker');

  event.waitUntil(
    caches.keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter((name) => name !== CACHE_NAME && name !== RUNTIME_CACHE)
            .map((name) => {
              console.log('[SW] 🗑️ Eliminando caché antiguo:', name);
              return caches.delete(name);
            })
        )
      )
      .then(() => {
        console.log('[SW] ✅ Service Worker activado');
        return self.clients.claim();
      })
  );
});

// ==========================================
// FETCH
// ==========================================
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Solo manejar GET
  if (request.method !== 'GET') return;

  // ── Firebase / APIs externas: Network only, con fallback silencioso ──
  // IMPORTANTE: envolver en try/catch para no romper el SW si no hay red
  if (
    url.hostname.includes('firestore.googleapis.com') ||
    url.hostname.includes('firebase') ||
    url.hostname.includes('googleapis.com') ||
    url.pathname.includes('__/auth/')
  ) {
    event.respondWith(
      fetch(request).catch(() =>
        // Respuesta vacía válida para que el SW no explote sin red
        new Response(null, { status: 503, statusText: 'Offline' })
      )
    );
    return;
  }

  // ── Google Fonts y CDN externos: Network first, sin guardar en caché ──
  if (
    url.hostname.includes('fonts.googleapis.com') ||
    url.hostname.includes('fonts.gstatic.com') ||
    url.hostname.includes('cdnjs.cloudflare.com')
  ) {
    event.respondWith(
      fetch(request).catch(() => caches.match(request))
    );
    return;
  }

  // ── Archivos estáticos: Cache first ──
  if (
    request.destination === 'image' ||
    request.destination === 'font' ||
    request.destination === 'style' ||
    url.pathname.match(/\.(png|jpg|jpeg|svg|gif|webp|ico|woff|woff2|ttf|css)$/)
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;

        return fetch(request)
          .then((response) => {
            if (response && response.status === 200) {
              const clone = response.clone();
              caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, clone));
            }
            return response;
          })
          .catch(() => {
            // Fallback SVG para imágenes no disponibles
            if (request.destination === 'image') {
              return new Response(
                '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="#e2e8f0"/><text x="50%" y="50%" text-anchor="middle" dy=".3em" fill="#94a3b8" font-size="14">Sin imagen</text></svg>',
                { headers: { 'Content-Type': 'image/svg+xml' } }
              );
            }
            return new Response(null, { status: 503 });
          });
      })
    );
    return;
  }

  // ── HTML / JS / otros: Network first, fallback a caché ──
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(() =>
        caches.match(request).then((cached) => {
          if (cached) {
            console.log('[SW] 📦 Sirviendo desde caché:', request.url);
            return cached;
          }
          // SPA fallback: siempre devolver index.html para rutas de la app
          if (request.destination === 'document' || request.mode === 'navigate') {
            return caches.match('/index.html');
          }
          return new Response('Offline - Recurso no disponible', {
            status: 503,
            headers: { 'Content-Type': 'text/plain' },
          });
        })
      )
  );
});

// ==========================================
// MENSAJES DESDE LA APP
// ==========================================
self.addEventListener('message', (event) => {
  if (!event.data) return;

  if (event.data.type === 'SKIP_WAITING') {
    console.log('[SW] ⭐ Activando nueva versión');
    self.skipWaiting();
  }

  if (event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys()
        .then((names) => Promise.all(names.map((n) => caches.delete(n))))
        .then(() => {
          self.clients.matchAll().then((clients) =>
            clients.forEach((c) => c.postMessage({ type: 'CACHE_CLEARED' }))
          );
        })
    );
  }
});

// ==========================================
// BACKGROUND SYNC
// ==========================================
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-fuel-reports') {
    event.waitUntil(Promise.resolve());
  }
});

// ==========================================
// PUSH NOTIFICATIONS
// ==========================================
self.addEventListener('push', (event) => {
  const options = {
    body: event.data ? event.data.text() : 'Nueva actualización disponible',
    icon: '/icon-192x192.png',
    badge: '/icon-96x96.png',
    vibrate: [200, 100, 200],
  };
  event.waitUntil(
    self.registration.showNotification('FleetCore - MPF Maquinaria', options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow('/'));
});

console.log('[SW] FleetCore Service Worker v1.0.1 cargado ✅');
