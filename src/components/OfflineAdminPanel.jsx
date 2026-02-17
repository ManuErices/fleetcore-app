import React, { useState, useEffect } from 'react';
import { getCacheSize, clearOfflineCache } from '../lib/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';

/**
 * Panel de administración del modo offline
 * Para diagnosticar y gestionar el almacenamiento local
 */
export default function OfflineAdminPanel() {
  const [cacheInfo, setCacheInfo] = useState(null);
  const [pendingDocs, setPendingDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    loadCacheInfo();
    loadPendingDocs();
  }, []);

  const loadCacheInfo = async () => {
    setLoading(true);
    try {
      const info = await getCacheSize();
      setCacheInfo(info);
    } catch (error) {
      console.error('Error cargando info de caché:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadPendingDocs = async () => {
    try {
      // Intentar detectar documentos pendientes de sincronización
      // Nota: Esta es una aproximación, Firestore no expone directamente los pendientes
      const collections = ['fuelReports', 'logs', 'rendiciones'];
      const allPending = [];

      for (const collectionName of collections) {
        const snapshot = await getDocs(collection(db, collectionName));
        snapshot.forEach((doc) => {
          if (doc.metadata.hasPendingWrites) {
            allPending.push({
              id: doc.id,
              collection: collectionName,
              data: doc.data()
            });
          }
        });
      }

      setPendingDocs(allPending);
    } catch (error) {
      console.error('Error cargando documentos pendientes:', error);
    }
  };

  const handleClearCache = async () => {
    const confirmText = pendingDocs.length > 0
      ? `ADVERTENCIA: Hay ${pendingDocs.length} documentos sin sincronizar.\n\n¿Estás SEGURO de que quieres limpiar el caché?\n\nEsto eliminará TODOS los datos locales no sincronizados.`
      : '¿Estás seguro de que quieres limpiar el caché offline?';

    if (!confirm(confirmText)) return;

    setClearing(true);
    try {
      const success = await clearOfflineCache();
      if (success) {
        alert('✅ Caché limpiado exitosamente. La página se recargará.');
        window.location.reload();
      } else {
        alert('❌ No se pudo limpiar el caché. Intenta cerrar otras pestañas.');
      }
    } catch (error) {
      alert('❌ Error: ' + error.message);
    } finally {
      setClearing(false);
    }
  };

  const handleRefresh = () => {
    loadCacheInfo();
    loadPendingDocs();
  };

  if (loading) {
    return (
      <div className="glass-card rounded-2xl p-8">
        <div className="flex items-center justify-center gap-3">
          <div className="spinner w-6 h-6 border-blue-600" />
          <span className="text-slate-600">Cargando información del caché...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="glass-card rounded-2xl p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-600 to-indigo-600 flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
              </svg>
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900">Administración de Caché Offline</h2>
              <p className="text-sm text-slate-600">Gestiona el almacenamiento local de la aplicación</p>
            </div>
          </div>

          <button
            onClick={handleRefresh}
            className="px-4 py-2 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-lg transition-all text-sm font-semibold flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Actualizar
          </button>
        </div>
      </div>

      {/* Estadísticas de almacenamiento */}
      <div className="grid md:grid-cols-3 gap-6">
        <div className="glass-card rounded-xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
              <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
            </div>
            <div>
              <div className="text-xs text-slate-500 font-semibold uppercase">Espacio Usado</div>
              <div className="text-2xl font-black text-slate-900">
                {cacheInfo ? `${cacheInfo.usageInMB} MB` : 'N/A'}
              </div>
            </div>
          </div>
          {cacheInfo && (
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-slate-600">
                <span>Disponible: {cacheInfo.quotaInMB} MB</span>
                <span>{cacheInfo.percentUsed}%</span>
              </div>
              <div className="w-full bg-slate-200 rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all ${
                    parseFloat(cacheInfo.percentUsed) > 80
                      ? 'bg-gradient-to-r from-red-500 to-orange-500'
                      : parseFloat(cacheInfo.percentUsed) > 50
                      ? 'bg-gradient-to-r from-yellow-500 to-orange-500'
                      : 'bg-gradient-to-r from-green-500 to-emerald-500'
                  }`}
                  style={{ width: `${cacheInfo.percentUsed}%` }}
                />
              </div>
            </div>
          )}
        </div>

        <div className="glass-card rounded-xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center">
              <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <div className="text-xs text-slate-500 font-semibold uppercase">Pendientes de Sincronizar</div>
              <div className="text-2xl font-black text-slate-900">{pendingDocs.length}</div>
            </div>
          </div>
          <div className="text-xs text-slate-600">
            {pendingDocs.length === 0 ? (
              <div className="flex items-center gap-2 text-green-600">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Todo sincronizado
              </div>
            ) : (
              <div className="flex items-center gap-2 text-amber-600">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Esperando conexión
              </div>
            )}
          </div>
        </div>

        <div className="glass-card rounded-xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
              <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <div className="text-xs text-slate-500 font-semibold uppercase">Estado del Sistema</div>
              <div className="text-2xl font-black text-green-600">Activo</div>
            </div>
          </div>
          <div className="text-xs text-slate-600">
            Modo offline habilitado
          </div>
        </div>
      </div>

      {/* Documentos pendientes */}
      {pendingDocs.length > 0 && (
        <div className="glass-card rounded-2xl overflow-hidden">
          <div className="p-6 border-b border-slate-200 bg-gradient-to-r from-amber-50 to-orange-50">
            <h3 className="text-lg font-bold text-slate-900">Documentos Pendientes de Sincronización</h3>
            <p className="text-sm text-slate-600 mt-1">
              Estos documentos se sincronizarán automáticamente cuando haya conexión a internet
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50">
                <tr>
                  <th className="text-left px-6 py-4 text-xs font-bold text-slate-600 uppercase">Colección</th>
                  <th className="text-left px-6 py-4 text-xs font-bold text-slate-600 uppercase">ID</th>
                  <th className="text-left px-6 py-4 text-xs font-bold text-slate-600 uppercase">Datos</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pendingDocs.map((doc, idx) => (
                  <tr key={idx} className="hover:bg-slate-50">
                    <td className="px-6 py-4">
                      <span className="px-2 py-1 bg-amber-100 text-amber-700 text-xs font-semibold rounded">
                        {doc.collection}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-xs font-mono text-slate-600">{doc.id}</td>
                    <td className="px-6 py-4 text-xs text-slate-600">
                      {JSON.stringify(doc.data).substring(0, 100)}...
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Advertencias y acciones */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Advertencia de caché lleno */}
        {cacheInfo && parseFloat(cacheInfo.percentUsed) > 80 && (
          <div className="glass-card rounded-xl p-6 border-2 border-orange-200 bg-orange-50">
            <div className="flex items-start gap-3">
              <svg className="w-6 h-6 text-orange-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div>
                <h4 className="font-bold text-orange-900 mb-2">Almacenamiento Casi Lleno</h4>
                <p className="text-sm text-orange-800 mb-3">
                  El caché está usando más del 80% del espacio disponible. Considera limpiar datos antiguos.
                </p>
                <button
                  onClick={handleClearCache}
                  disabled={clearing}
                  className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-sm font-semibold transition-all disabled:opacity-50"
                >
                  {clearing ? 'Limpiando...' : 'Limpiar Caché'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Acción de limpiar caché */}
        <div className="glass-card rounded-xl p-6">
          <div className="flex items-start gap-3">
            <svg className="w-6 h-6 text-red-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            <div className="flex-1">
              <h4 className="font-bold text-slate-900 mb-2">Limpiar Caché Offline</h4>
              <p className="text-sm text-slate-600 mb-3">
                Elimina todos los datos almacenados localmente. Solo usa esto si hay problemas de sincronización.
              </p>
              <button
                onClick={handleClearCache}
                disabled={clearing}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-semibold transition-all disabled:opacity-50 flex items-center gap-2"
              >
                {clearing ? (
                  <>
                    <div className="spinner w-4 h-4 border-white" />
                    Limpiando...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    Limpiar Caché
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Información técnica */}
      <div className="glass-card rounded-xl p-6">
        <h3 className="text-lg font-bold text-slate-900 mb-4">Información Técnica</h3>
        <div className="grid sm:grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-slate-500 font-semibold mb-1">Tecnología</div>
            <div className="text-slate-900">IndexedDB + Firestore Offline Persistence</div>
          </div>
          <div>
            <div className="text-slate-500 font-semibold mb-1">Sincronización</div>
            <div className="text-slate-900">Automática al detectar conexión</div>
          </div>
          <div>
            <div className="text-slate-500 font-semibold mb-1">Capacidad Máxima</div>
            <div className="text-slate-900">{cacheInfo ? `${cacheInfo.quotaInMB} MB` : 'N/A'}</div>
          </div>
          <div>
            <div className="text-slate-500 font-semibold mb-1">Duración del Caché</div>
            <div className="text-slate-900">Indefinida (hasta sincronización)</div>
          </div>
        </div>
      </div>
    </div>
  );
}
