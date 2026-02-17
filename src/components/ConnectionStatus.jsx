import React, { useState, useEffect } from 'react';
import { onConnectionStateChange, getCacheSize } from '../lib/firebase';

/**
 * Componente que muestra el estado de conexión
 * Aparece como banner cuando está offline
 */
export default function ConnectionStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showBanner, setShowBanner] = useState(!navigator.onLine);
  const [cacheInfo, setCacheInfo] = useState(null);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    // Monitorear cambios de conexión
    const unsubscribe = onConnectionStateChange((online) => {
      setIsOnline(online);
      
      if (!online) {
        // Mostrar banner cuando se pierde la conexión
        setShowBanner(true);
      } else {
        // Ocultar banner después de 3 segundos cuando se recupera
        setTimeout(() => setShowBanner(false), 3000);
      }
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    // Cargar información del caché cada 30 segundos
    const loadCacheInfo = async () => {
      const info = await getCacheSize();
      setCacheInfo(info);
    };

    loadCacheInfo();
    const interval = setInterval(loadCacheInfo, 30000);
    return () => clearInterval(interval);
  }, []);

  if (!showBanner) return null;

  return (
    <>
      {/* Banner principal */}
      <div
        className={`fixed top-0 left-0 right-0 z-50 ${
          isOnline
            ? 'bg-gradient-to-r from-emerald-600 to-green-600'
            : 'bg-gradient-to-r from-amber-600 to-orange-600'
        } text-white shadow-xl transition-all duration-500 animate-slideDown`}
      >
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              {/* Icono animado */}
              <div className="relative">
                {isOnline ? (
                  <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                    <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                ) : (
                  <div className="relative">
                    <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                      <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 2.829a4.978 4.978 0 01-1.414-2.83m-1.414 5.658a9 9 0 01-2.167-9.238m7.824 2.167a1 1 0 111.414 1.414m-1.414-1.414L3 3m8.293 8.293l1.414 1.414" />
                      </svg>
                    </div>
                    <div className="absolute -right-1 -top-1 w-3 h-3 bg-red-500 rounded-full animate-pulse" />
                  </div>
                )}
              </div>

              {/* Mensaje */}
              <div>
                <div className="font-bold text-sm">
                  {isOnline ? (
                    '🌐 Conexión Restaurada'
                  ) : (
                    '📵 Modo Offline Activo'
                  )}
                </div>
                <div className="text-xs opacity-90">
                  {isOnline ? (
                    'Sincronizando datos con la nube...'
                  ) : (
                    'Trabajando sin internet - Los datos se guardan localmente'
                  )}
                </div>
              </div>
            </div>

            {/* Botones */}
            <div className="flex items-center gap-2">
              {!isOnline && (
                <button
                  onClick={() => setShowDetails(!showDetails)}
                  className="px-3 py-1 bg-white/20 hover:bg-white/30 rounded-lg text-xs font-semibold transition-colors"
                >
                  {showDetails ? 'Ocultar detalles' : 'Ver detalles'}
                </button>
              )}
              
              <button
                onClick={() => setShowBanner(false)}
                className="p-1 hover:bg-white/20 rounded-lg transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Detalles expandibles (solo offline) */}
          {showDetails && !isOnline && (
            <div className="mt-3 pt-3 border-t border-white/20 text-xs space-y-2 animate-fadeIn">
              <div className="grid sm:grid-cols-2 gap-2">
                <div className="bg-white/10 rounded-lg p-2">
                  <div className="font-semibold mb-1">💾 Almacenamiento Local</div>
                  {cacheInfo ? (
                    <div className="space-y-1 opacity-90">
                      <div>Usado: {cacheInfo.usageInMB} MB</div>
                      <div>Disponible: {cacheInfo.quotaInMB} MB</div>
                      <div className="w-full bg-white/20 rounded-full h-2 mt-1">
                        <div 
                          className="bg-white h-2 rounded-full transition-all"
                          style={{ width: `${cacheInfo.percentUsed}%` }}
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="opacity-75">Calculando...</div>
                  )}
                </div>

                <div className="bg-white/10 rounded-lg p-2">
                  <div className="font-semibold mb-1">📋 Funcionalidad Offline</div>
                  <ul className="space-y-0.5 opacity-90">
                    <li>✓ Crear reportes de combustible</li>
                    <li>✓ Registrar horas de máquinas</li>
                    <li>✓ Ver datos cacheados</li>
                    <li>✓ Auto-sincronización al conectar</li>
                  </ul>
                </div>
              </div>

              <div className="bg-blue-500/20 border border-blue-400/30 rounded-lg p-2">
                <div className="flex items-start gap-2">
                  <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div>
                    <strong>Importante:</strong> Al volver al campamento con internet, mantén la app abierta unos minutos para que se sincronicen todos los datos automáticamente.
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Espaciador para que el contenido no quede debajo del banner */}
      <div className={`h-16 ${showDetails && !isOnline ? 'sm:h-48' : ''} transition-all duration-300`} />
    </>
  );
}

/**
 * Indicador compacto para la barra de navegación
 */
export function ConnectionIndicator() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const unsubscribe = onConnectionStateChange(setIsOnline);
    return unsubscribe;
  }, []);

  return (
    <div className="flex items-center gap-2">
      <div className={`w-2 h-2 rounded-full ${isOnline ? 'bg-green-500' : 'bg-orange-500'} animate-pulse`} />
      <span className="text-xs font-semibold text-slate-600">
        {isOnline ? 'Online' : 'Offline'}
      </span>
    </div>
  );
}

/**
 * Hook para usar en componentes que necesiten saber el estado
 */
export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const unsubscribe = onConnectionStateChange(setIsOnline);
    return unsubscribe;
  }, []);

  return isOnline;
}
