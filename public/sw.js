// Service Worker para MPF Maquinaria - Nuevo Cobre
// Optimizado para funcionar offline a 4000m

const CACHE_NAME = 'mpf-maquinaria-v1.0.0';
const RUNTIME_CACHE = 'mpf-runtime-v1';

// Archivos críticos que SIEMPRE deben estar disponibles offline
const CRITICAL_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  // Agregar aquí otros assets críticos si es necesario
];

// Instalación: Cachear archivos críticos
self.addEventListener('install', (event) => {
  console.log('[SW] 🔧 Instalando Service Worker v1.0.0');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] 💾 Cacheando archivos críticos');
        return cache.addAll(CRITICAL_ASSETS);
      })
      .then(() => {
        console.log('[SW] ✅ Service Worker instalado');
        return self.skipWaiting(); // Activar inmediatamente
      })
      .catch((error) => {
        console.error('[SW] ❌ Error en instalación:', error);
      })
  );
});

// Activación: Limpiar cachés antiguos
self.addEventListener('activate', (event) => {
  console.log('[SW] 🚀 Activando Service Worker');
  
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            // Eliminar cachés antiguos
            if (cacheName !== CACHE_NAME && cacheName !== RUNTIME_CACHE) {
              console.log('[SW] 🗑️ Eliminando caché antiguo:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => {
        console.log('[SW] ✅ Service Worker activado');
        return self.clients.claim(); // Tomar control inmediato
      })
  );
});

// Estrategia de Fetch: Network First con fallback a Caché
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignorar requests que no sean GET
  if (request.method !== 'GET') {
    return;
  }

  // ==========================================
  // ESTRATEGIA 1: APIs de Firebase - NUNCA CACHEAR
  // ==========================================
  if (
    url.hostname.includes('firestore.googleapis.com') ||
    url.hostname.includes('firebase') ||
    url.hostname.includes('google') ||
    url.pathname.includes('/api/') ||
    url.pathname.includes('__/auth/')
  ) {
    // Solo red, sin caché (Firebase maneja su propio caché offline)
    return event.respondWith(fetch(request));
  }

  // ==========================================
  // ESTRATEGIA 2: Archivos Estáticos - CACHE FIRST
  // ==========================================
  if (
    request.destination === 'image' ||
    request.destination === 'font' ||
    request.destination === 'style' ||
    url.pathname.match(/\.(png|jpg|jpeg|svg|gif|webp|ico|woff|woff2|ttf|css)$/)
  ) {
    event.respondWith(
      caches.match(request)
        .then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          
          return fetch(request).then((response) => {
            // Solo cachear respuestas exitosas
            if (response && response.status === 200) {
              const responseToCache = response.clone();
              caches.open(RUNTIME_CACHE).then((cache) => {
                cache.put(request, responseToCache);
              });
            }
            return response;
          });
        })
        .catch(() => {
          // Fallback para imágenes si no hay red ni caché
          if (request.destination === 'image') {
            return new Response(
              '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="#e2e8f0"/><text x="50%" y="50%" text-anchor="middle" dy=".3em" fill="#94a3b8" font-size="14">Sin imagen</text></svg>',
              { headers: { 'Content-Type': 'image/svg+xml' } }
            );
          }
        })
    );
    return;
  }

  // ==========================================
  // ESTRATEGIA 3: HTML/JS - NETWORK FIRST
  // ==========================================
  event.respondWith(
    fetch(request)
      .then((response) => {
        // Si la respuesta es exitosa, clonarla y cachearla
        if (response && response.status === 200) {
          const responseToCache = response.clone();
          
          caches.open(RUNTIME_CACHE).then((cache) => {
            cache.put(request, responseToCache);
          });
        }
        
        return response;
      })
      .catch(() => {
        // Si falla la red, intentar con caché
        return caches.match(request).then((cachedResponse) => {
          if (cachedResponse) {
            console.log('[SW] 📦 Sirviendo desde caché:', request.url);
            return cachedResponse;
          }
          
          // Si tampoco está en caché y es un documento HTML
          if (request.destination === 'document') {
            return caches.match('/index.html');
          }
          
          // Si no hay nada, retornar error
          return new Response(
            'Offline - No se pudo cargar el recurso',
            { 
              status: 503,
              statusText: 'Service Unavailable',
              headers: new Headers({ 'Content-Type': 'text/plain' })
            }
          );
        });
      })
  );
});

// ==========================================
// MENSAJES DESDE LA APP
// ==========================================
self.addEventListener('message', (event) => {
  console.log('[SW] 📨 Mensaje recibido:', event.data);
  
  if (event.data && event.data.type === 'SKIP_WAITING') {
    console.log('[SW] ⏭️ Saltando espera, activando nueva versión');
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    console.log('[SW] 🗑️ Limpiando caché por petición de la app');
    event.waitUntil(
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => caches.delete(cacheName))
        );
      }).then(() => {
        console.log('[SW] ✅ Caché limpiado');
        self.clients.matchAll().then((clients) => {
          clients.forEach((client) => {
            client.postMessage({
              type: 'CACHE_CLEARED',
              message: 'Caché limpiado exitosamente'
            });
          });
        });
      })
    );
  }
  
  if (event.data && event.data.type === 'GET_CACHE_SIZE') {
    console.log('[SW] 📊 Calculando tamaño de caché');
    event.waitUntil(
      getCacheSize().then((size) => {
        self.clients.matchAll().then((clients) => {
          clients.forEach((client) => {
            client.postMessage({
              type: 'CACHE_SIZE',
              size: size
            });
          });
        });
      })
    );
  }
});

// ==========================================
// FUNCIONES HELPER
// ==========================================

/**
 * Calcula el tamaño aproximado del caché
 */
async function getCacheSize() {
  const cacheNames = await caches.keys();
  let totalSize = 0;
  let itemCount = 0;

  for (const cacheName of cacheNames) {
    const cache = await caches.open(cacheName);
    const requests = await cache.keys();
    itemCount += requests.length;

    for (const request of requests) {
      const response = await cache.match(request);
      if (response) {
        const blob = await response.blob();
        totalSize += blob.size;
      }
    }
  }

  return {
    bytes: totalSize,
    megabytes: (totalSize / (1024 * 1024)).toFixed(2),
    itemCount: itemCount
  };
}

// ==========================================
// SINCRONIZACIÓN EN BACKGROUND (opcional)
// ==========================================

// Sync API para sincronizar cuando vuelva la conexión
self.addEventListener('sync', (event) => {
  console.log('[SW] 🔄 Sync event:', event.tag);
  
  if (event.tag === 'sync-fuel-reports') {
    event.waitUntil(
      // Aquí podrías implementar lógica de sincronización
      // Por ahora, Firestore lo maneja automáticamente
      Promise.resolve()
    );
  }
});

// ==========================================
// NOTIFICACIONES PUSH (opcional)
// ==========================================

self.addEventListener('push', (event) => {
  console.log('[SW] 🔔 Push notification recibida');
  
  const options = {
    body: event.data ? event.data.text() : 'Nueva actualización disponible',
    icon: '/icon-192x192.png',
    badge: '/icon-96x96.png',
    vibrate: [200, 100, 200],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: 1
    }
  };

  event.waitUntil(
    self.registration.showNotification('MPF Maquinaria', options)
  );
});

self.addEventListener('notificationclick', (event) => {
  console.log('[SW] 🖱️ Notificación clickeada');
  event.notification.close();

  event.waitUntil(
    clients.openWindow('/')
  );
});

// ==========================================
// LOG DE VERSION
// ==========================================
console.log(`
╔════════════════════════════════════════════╗
║   MPF MAQUINARIA - SERVICE WORKER v1.0.0   ║
║   Optimizado para Mina Nuevo Cobre         ║
║   Funcionalidad Offline Habilitada         ║
╚════════════════════════════════════════════╝
`);
