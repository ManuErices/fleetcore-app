import React, { useState, useEffect } from 'react';
import { auth, getSessionDaysRemaining, renewSession } from '../lib/firebase';

/**
 * Componente: SessionExpiryIndicator
 * 
 * Muestra cuántos días quedan de sesión offline
 * Alerta cuando quedan menos de 5 días
 * Permite renovar sesión si hay internet
 * Desaparece automáticamente después de renovarse o al cerrarlo
 */
function SessionExpiryIndicator() {
  const [sessionInfo, setSessionInfo] = useState(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showSuccess, setShowSuccess] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    let successTimeout;

    // Actualizar info de sesión
    const updateSessionInfo = () => {
      const info = getSessionDaysRemaining();
      setSessionInfo(info);
      return info;
    };

    // Intentar renovar sesión
    const tryRenew = () => {
      if (navigator.onLine) {
        const infoBefore = getSessionDaysRemaining();
        const wasWarning = infoBefore && (infoBefore.daysRemaining <= 5 || infoBefore.isExpired);

        const renewed = renewSession();
        if (renewed) {
          updateSessionInfo();
          
          // Solo mostrar éxito si veníamos de un estado de advertencia/expirado
          if (wasWarning) {
            setShowSuccess(true);
            clearTimeout(successTimeout);
            successTimeout = setTimeout(() => {
              setShowSuccess(false);
            }, 5000); // Se oculta tras 5 segundos
          }
        } else {
          updateSessionInfo();
        }
      } else {
        updateSessionInfo();
      }
    };

    tryRenew();

    // Escuchar cambios de autenticación para auto-renovar una vez que cargue el usuario
    const unsubscribeAuth = auth.onAuthStateChanged((user) => {
      if (user) {
        tryRenew();
      } else {
        updateSessionInfo();
      }
    });

    // Actualizar cada hora
    const interval = setInterval(tryRenew, 60 * 60 * 1000);

    // Detectar conexión
    const handleOnline = () => {
      setIsOnline(true);
      setIsDismissed(false); // Resetear dismiss al reconectar para alertar si es necesario
      tryRenew();
    };

    const handleOffline = () => {
      setIsOnline(false);
      setIsDismissed(false); // Resetear dismiss al desconectar
      updateSessionInfo();
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      clearInterval(interval);
      unsubscribeAuth();
      clearTimeout(successTimeout);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (isDismissed) return null;
  if (!sessionInfo) return null;

  const { daysRemaining, isExpired } = sessionInfo;

  // 1. Mostrar banner de éxito temporal si acaba de ser renovada y estamos online
  if (showSuccess && isOnline) {
    return (
      <div className="fixed bottom-4 right-4 z-50 max-w-sm bg-green-600 text-white rounded-lg shadow-xl p-4 transition-all duration-300 transform translate-y-0 ease-out">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="flex-1">
            <p className="font-bold text-sm">✅ Sesión Renovada</p>
            <p className="text-xs mt-1 opacity-90">
              Tu sesión se ha renovado automáticamente por 20 días más.
            </p>
          </div>
          <button
            onClick={() => setIsDismissed(true)}
            className="flex-shrink-0 text-white/70 hover:text-white transition-colors"
            aria-label="Cerrar"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    );
  }

  // Si quedan más de 5 días (y no está en modo éxito temporal), no mostrar nada
  if (daysRemaining > 5 && !isExpired) return null;

  // 2. Si está expirada y offline
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
          <button
            onClick={() => setIsDismissed(true)}
            className="flex-shrink-0 text-white/70 hover:text-white transition-colors"
            aria-label="Cerrar"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    );
  }

  // 3. Si quedan pocos días (advertencia offline / cargando renovación)
  if (daysRemaining <= 5 && daysRemaining > 0) {
    return (
      <div className="fixed bottom-4 right-4 z-50 max-w-sm rounded-lg shadow-xl p-4 bg-yellow-600 text-white">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="flex-1">
            <p className="font-bold text-sm">
              ⏰ {daysRemaining} {daysRemaining === 1 ? 'día' : 'días'} restantes
            </p>
            <p className="text-xs mt-1 opacity-90">
              {isOnline 
                ? 'Conectando con el servidor para renovar tu sesión...'
                : 'Conéctate pronto a internet para renovar tu sesión offline.'
              }
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {!isOnline && (
              <button
                onClick={() => {
                  alert('Conéctate a WiFi o datos móviles para renovar tu sesión automáticamente.');
                }}
                className="text-xs bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-full transition-colors"
              >
                Info
              </button>
            )}
            <button
              onClick={() => setIsDismissed(true)}
              className="text-white/70 hover:text-white transition-colors"
              aria-label="Cerrar"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}

export default SessionExpiryIndicator;
