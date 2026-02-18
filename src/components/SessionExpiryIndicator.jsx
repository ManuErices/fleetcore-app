import React, { useState, useEffect } from 'react';
import { getSessionDaysRemaining, renewSession } from '../lib/firebase';

/**
 * Componente: SessionExpiryIndicator
 * 
 * Muestra cuántos días quedan de sesión offline
 * Alerta cuando quedan menos de 5 días
 * Permite renovar sesión si hay internet
 */
function SessionExpiryIndicator() {
  const [sessionInfo, setSessionInfo] = useState(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    // Actualizar info de sesión
    const updateSessionInfo = () => {
      const info = getSessionDaysRemaining();
      setSessionInfo(info);
    };

    updateSessionInfo();
    
    // Actualizar cada hora
    const interval = setInterval(updateSessionInfo, 60 * 60 * 1000);

    // Detectar conexión
    const handleOnline = () => {
      setIsOnline(true);
      // Auto-renovar cuando se conecta
      const renewed = renewSession();
      if (renewed) {
        updateSessionInfo();
      }
    };
    
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      clearInterval(interval);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (!sessionInfo) return null;

  const { daysRemaining, isExpired } = sessionInfo;

  // Si quedan más de 5 días, no mostrar nada (todo OK)
  if (daysRemaining > 5 && !isExpired) return null;

  // Si está expirada
  if (isExpired && !isOnline) {
    return (
      <div className="fixed bottom-4 right-4 z-50 max-w-sm bg-red-600 text-white rounded-lg shadow-xl p-4 animate-pulse">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <div className="flex-1">
            <p className="font-bold text-sm">⚠️ Sesión Expirada</p>
            <p className="text-xs mt-1 opacity-90">
              Conéctate a internet para renovar tu sesión y seguir usando la app offline.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Si quedan pocos días (advertencia)
  if (daysRemaining <= 5 && daysRemaining > 0) {
    return (
      <div className={`fixed bottom-4 right-4 z-50 max-w-sm rounded-lg shadow-xl p-4 ${
        isOnline 
          ? 'bg-green-600 text-white' 
          : 'bg-yellow-600 text-white'
      }`}>
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0">
            {isOnline ? (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            ) : (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
          </div>
          <div className="flex-1">
            <p className="font-bold text-sm">
              {isOnline ? '✅ Sesión Renovada' : `⏰ ${daysRemaining} ${daysRemaining === 1 ? 'día' : 'días'} restantes`}
            </p>
            <p className="text-xs mt-1 opacity-90">
              {isOnline 
                ? 'Tu sesión se ha renovado automáticamente por 20 días más.'
                : 'Conéctate pronto a internet para renovar tu sesión offline.'
              }
            </p>
          </div>
          {!isOnline && (
            <button
              onClick={() => {
                alert('Conéctate a WiFi o datos móviles para renovar tu sesión automáticamente.');
              }}
              className="flex-shrink-0 text-xs bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-full transition-colors"
            >
              Info
            </button>
          )}
        </div>
      </div>
    );
  }

  return null;
}

export default SessionExpiryIndicator;
