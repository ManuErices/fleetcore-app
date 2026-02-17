/**
 * Registro y gestión del Service Worker para PWA
 * Maneja instalación, actualizaciones y eventos
 */

/**
 * Registra el Service Worker para funcionalidad PWA
 */
export function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/sw.js')
        .then((registration) => {
          console.log('✅ Service Worker registrado:', registration.scope);
          
          // Verificar actualizaciones cada 1 hora
          setInterval(() => {
            registration.update();
          }, 60 * 60 * 1000);
          
          // Listener para actualizaciones
          registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                // Hay una nueva versión disponible
                console.log('🆕 Nueva versión de la app disponible');
                
                // Mostrar notificación al usuario
                showUpdateNotification(newWorker);
              }
            });
          });
        })
        .catch((error) => {
          console.error('❌ Error registrando Service Worker:', error);
        });

      // Listener para cuando el Service Worker controla la página
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        console.log('🔄 Service Worker actualizado, recargando página...');
        window.location.reload();
      });
    });
  } else {
    console.warn('⚠️ Service Worker no soportado en este navegador');
  }
}

/**
 * Muestra notificación de actualización disponible
 */
function showUpdateNotification(newWorker) {
  // Crear elemento de notificación
  const notification = document.createElement('div');
  notification.id = 'sw-update-notification';
  notification.style.cssText = `
    position: fixed;
    bottom: 20px;
    left: 20px;
    right: 20px;
    max-width: 400px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    padding: 20px;
    border-radius: 16px;
    box-shadow: 0 10px 40px rgba(0,0,0,0.3);
    z-index: 9999;
    animation: slideUp 0.3s ease-out;
  `;
  
  notification.innerHTML = `
    <div style="display: flex; align-items: start; gap: 16px;">
      <div style="flex-shrink: 0;">
        <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
        </svg>
      </div>
      <div style="flex: 1;">
        <div style="font-weight: 700; margin-bottom: 8px;">Nueva Versión Disponible</div>
        <div style="font-size: 14px; opacity: 0.9;">
          Hay una actualización de la aplicación. Se recomienda actualizar ahora.
        </div>
        <div style="margin-top: 16px; display: flex; gap: 8px;">
          <button id="sw-update-btn" style="
            padding: 8px 16px;
            background: white;
            color: #667eea;
            border: none;
            border-radius: 8px;
            font-weight: 600;
            cursor: pointer;
            font-size: 14px;
          ">
            Actualizar Ahora
          </button>
          <button id="sw-dismiss-btn" style="
            padding: 8px 16px;
            background: rgba(255,255,255,0.2);
            color: white;
            border: none;
            border-radius: 8px;
            font-weight: 600;
            cursor: pointer;
            font-size: 14px;
          ">
            Después
          </button>
        </div>
      </div>
    </div>
  `;

  // Agregar animación
  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideUp {
      from {
        transform: translateY(100px);
        opacity: 0;
      }
      to {
        transform: translateY(0);
        opacity: 1;
      }
    }
  `;
  document.head.appendChild(style);

  document.body.appendChild(notification);

  // Event listeners
  document.getElementById('sw-update-btn').addEventListener('click', () => {
    newWorker.postMessage({ type: 'SKIP_WAITING' });
    notification.remove();
  });

  document.getElementById('sw-dismiss-btn').addEventListener('click', () => {
    notification.remove();
  });
}

/**
 * Desregistra el Service Worker (útil para debugging)
 */
export async function unregisterServiceWorker() {
  if ('serviceWorker' in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    for (const registration of registrations) {
      await registration.unregister();
    }
    console.log('🗑️ Service Workers desregistrados');
  }
}

/**
 * Verifica si la app está instalada como PWA
 */
export function isInstalled() {
  // Detectar si está en modo standalone (instalada)
  if (window.matchMedia('(display-mode: standalone)').matches) {
    return true;
  }
  
  // iOS Safari
  if (window.navigator.standalone === true) {
    return true;
  }
  
  // Android
  if (document.referrer.includes('android-app://')) {
    return true;
  }
  
  return false;
}

/**
 * Listener para evento de instalación
 * Retorna el evento deferredPrompt para mostrar botón personalizado
 */
export function onInstallPrompt(callback) {
  let deferredPrompt = null;

  window.addEventListener('beforeinstallprompt', (e) => {
    // Prevenir el prompt automático
    e.preventDefault();
    
    // Guardar el evento para usarlo después
    deferredPrompt = e;
    
    console.log('📱 Prompt de instalación disponible');
    
    // Ejecutar callback con el prompt
    callback(deferredPrompt);
  });

  // Listener para cuando se instala la app
  window.addEventListener('appinstalled', () => {
    console.log('✅ PWA instalada exitosamente');
    deferredPrompt = null;
  });

  return deferredPrompt;
}

/**
 * Hook de React para detectar instalación PWA
 */
export function useIsInstalled() {
  const [installed, setInstalled] = React.useState(isInstalled());

  React.useEffect(() => {
    const handleAppInstalled = () => {
      setInstalled(true);
    };

    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  return installed;
}

/**
 * Obtiene información del Service Worker activo
 */
export async function getServiceWorkerInfo() {
  if (!('serviceWorker' in navigator)) {
    return { supported: false };
  }

  const registration = await navigator.serviceWorker.getRegistration();
  
  if (!registration) {
    return { supported: true, registered: false };
  }

  return {
    supported: true,
    registered: true,
    scope: registration.scope,
    active: !!registration.active,
    waiting: !!registration.waiting,
    installing: !!registration.installing,
    updateViaCache: registration.updateViaCache,
  };
}

/**
 * Fuerza actualización del Service Worker
 */
export async function updateServiceWorker() {
  if ('serviceWorker' in navigator) {
    const registration = await navigator.serviceWorker.getRegistration();
    if (registration) {
      await registration.update();
      console.log('🔄 Service Worker actualizado');
    }
  }
}

/**
 * Limpia el caché del Service Worker
 */
export async function clearServiceWorkerCache() {
  if ('caches' in window) {
    const cacheNames = await caches.keys();
    await Promise.all(
      cacheNames.map(cacheName => caches.delete(cacheName))
    );
    console.log('🗑️ Caché del Service Worker limpiado');
  }
}

/**
 * Obtiene estadísticas de caché
 */
export async function getCacheStats() {
  if (!('caches' in window)) {
    return { supported: false };
  }

  const cacheNames = await caches.keys();
  const stats = {
    supported: true,
    cacheCount: cacheNames.length,
    caches: []
  };

  for (const cacheName of cacheNames) {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();
    stats.caches.push({
      name: cacheName,
      itemCount: keys.length,
      urls: keys.map(req => req.url)
    });
  }

  return stats;
}

// Re-exportar para facilidad de uso
export default {
  registerServiceWorker,
  unregisterServiceWorker,
  isInstalled,
  onInstallPrompt,
  getServiceWorkerInfo,
  updateServiceWorker,
  clearServiceWorkerCache,
  getCacheStats
};
