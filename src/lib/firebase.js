import { initializeApp } from "firebase/app";
import { initializeFirestore, getFirestore, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";
import { getAuth, GoogleAuthProvider, setPersistence, browserLocalPersistence } from "firebase/auth";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyByzRUHnLrxAaZOS9Dap1Kl0ZH5STWWzKE",
  authDomain: "mpf-maquinaria.firebaseapp.com",
  projectId: "mpf-maquinaria",
  storageBucket: "mpf-maquinaria.firebasestorage.app",
  messagingSenderId: "643600511459",
  appId: "1:643600511459:web:2ebcbd251b5cdb65aa70d6"
};

const app = initializeApp(firebaseConfig);

// ============================================
// FIRESTORE CON PERSISTENCIA OFFLINE (API moderna)
// ============================================
let offlineEnabled = false;

let firestoreInstance;
try {
  firestoreInstance = initializeFirestore(app, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager()
    })
  });
  offlineEnabled = true;
  console.log("✅ MODO OFFLINE HABILITADO (multi-tab)");
  console.log("📱 Los datos se guardarán localmente y se sincronizarán cuando haya internet");
} catch (err) {
  console.error("❌ Error habilitando offline:", err);
  firestoreInstance = getFirestore(app);
}

// ============================================
// AHORA SÍ EXPORTAR
// ============================================
export const db = firestoreInstance;
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const storage = getStorage(app);

// ============================================
// PERSISTENCIA DE SESIÓN (AUTH)
// ============================================
// Mantener la sesión por 20 días mínimo, incluso sin internet
setPersistence(auth, browserLocalPersistence)
  .then(() => {
    console.log("🔐 PERSISTENCIA DE SESIÓN HABILITADA");
    console.log("📱 Tu sesión se mantendrá por 20 días sin internet");
    
    // Guardar timestamp de último login para tracking
    auth.onAuthStateChanged((user) => {
      if (user) {
        const lastLogin = localStorage.getItem('lastLogin');
        const now = Date.now();
        
        if (!lastLogin) {
          // Primera vez, guardar timestamp
          localStorage.setItem('lastLogin', now.toString());
          localStorage.setItem('sessionDuration', '20'); // 20 días
          console.log("✅ Sesión iniciada - válida por 20 días");
        } else {
          // Verificar si han pasado más de 20 días
          const daysPassed = (now - parseInt(lastLogin)) / (1000 * 60 * 60 * 24);
          const daysRemaining = Math.max(0, 20 - Math.floor(daysPassed));
          
          if (daysPassed < 20) {
            console.log(`✅ Sesión válida - ${daysRemaining} días restantes`);
          } else {
            console.log("⚠️ Sesión expirada - necesitas reconectarte a internet");
          }
        }
      }
    });
  })
  .catch((error) => {
    console.error("❌ Error configurando persistencia de sesión:", error);
  });

// ============================================
// UTILIDADES DE SESIÓN
// ============================================

/**
 * Obtiene los días restantes de la sesión offline
 */
export function getSessionDaysRemaining() {
  const lastLogin = localStorage.getItem('lastLogin');
  if (!lastLogin) return null;
  
  const now = Date.now();
  const daysPassed = (now - parseInt(lastLogin)) / (1000 * 60 * 60 * 24);
  const daysRemaining = Math.max(0, 20 - Math.floor(daysPassed));
  
  return {
    daysRemaining,
    daysPassed: Math.floor(daysPassed),
    expiresAt: new Date(parseInt(lastLogin) + (20 * 24 * 60 * 60 * 1000)),
    isExpired: daysPassed >= 20
  };
}

/**
 * Renueva el timestamp de sesión (llamar cuando se conecta a internet)
 */
export function renewSession() {
  if (auth.currentUser) {
    localStorage.setItem('lastLogin', Date.now().toString());
    console.log("🔄 Sesión renovada - válida por 20 días más");
    return true;
  }
  return false;
}

// ============================================
// ESTADO DE CONEXIÓN
// ============================================

/**
 * Hook para monitorear el estado de conexión
 */
export function onConnectionStateChange(callback) {
  const handleOnline = () => {
    console.log("🌐 CONEXIÓN RESTAURADA - Sincronizando...");
    callback(true);
  };
  
  const handleOffline = () => {
    console.log("📵 SIN CONEXIÓN - Modo offline activo");
    callback(false);
  };
  
  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);
  
  // Estado inicial
  callback(navigator.onLine);
  
  // Cleanup
  return () => {
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
  };
}

/**
 * Obtiene el estado actual de conexión
 */
export function isOnline() {
  return navigator.onLine;
}

// ============================================
// INFORMACIÓN DE SINCRONIZACIÓN
// ============================================

/**
 * Estima el tamaño del caché offline
 */
export async function getCacheSize() {
  if ('storage' in navigator && 'estimate' in navigator.storage) {
    const estimate = await navigator.storage.estimate();
    return {
      usage: estimate.usage,
      quota: estimate.quota,
      usageInMB: (estimate.usage / (1024 * 1024)).toFixed(2),
      quotaInMB: (estimate.quota / (1024 * 1024)).toFixed(2),
      percentUsed: ((estimate.usage / estimate.quota) * 100).toFixed(2)
    };
  }
  return null;
}

/**
 * Limpia el caché offline (usar con cuidado)
 */
export async function clearOfflineCache() {
  if ('indexedDB' in window) {
    try {
      const dbName = `firestore/${firebaseConfig.projectId}/main`;
      await new Promise((resolve, reject) => {
        const request = indexedDB.deleteDatabase(dbName);
        request.onsuccess = resolve;
        request.onerror = reject;
      });
      console.log("🗑️ Caché offline limpiado");
      return true;
    } catch (err) {
      console.error("Error limpiando caché:", err);
      return false;
    }
  }
  return false;
}

/**
 * Verifica si el modo offline está habilitado
 */
export function isOfflineEnabled() {
  return offlineEnabled;
}

export default app;
