import { initializeApp } from "firebase/app";
import { getFirestore, enableIndexedDbPersistence, enableMultiTabIndexedDbPersistence } from "firebase/firestore";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
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
// IMPORTANTE: Crear db PERO NO EXPORTAR AÚN
// ============================================
const firestoreInstance = getFirestore(app);

// ============================================
// HABILITAR OFFLINE INMEDIATAMENTE
// ============================================
let offlineEnabled = false;

// Intentar habilitar persistencia (single-tab primero)
enableIndexedDbPersistence(firestoreInstance)
  .then(() => {
    console.log("✅ MODO OFFLINE HABILITADO (single-tab)");
    console.log("📱 Los datos se guardarán localmente y se sincronizarán cuando haya internet");
    offlineEnabled = true;
  })
  .catch((err) => {
    if (err.code === 'failed-precondition') {
      // Múltiples tabs abiertas, intentar multi-tab
      console.warn("⚠️ Múltiples pestañas detectadas, intentando modo multi-tab...");
      
      enableMultiTabIndexedDbPersistence(firestoreInstance)
        .then(() => {
          console.log("✅ MODO OFFLINE HABILITADO (multi-tab)");
          offlineEnabled = true;
        })
        .catch((multiTabErr) => {
          console.error("❌ Error en modo multi-tab:", multiTabErr);
        });
    } else if (err.code === 'unimplemented') {
      console.error("❌ Este navegador no soporta persistencia offline");
    } else {
      console.error("❌ Error habilitando offline:", err);
    }
  });

// ============================================
// AHORA SÍ EXPORTAR
// ============================================
export const db = firestoreInstance;
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const storage = getStorage(app);

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
