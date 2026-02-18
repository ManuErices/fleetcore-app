import React from 'react';

/**
 * Componente: OfflineLoginWarning
 * 
 * Muestra una advertencia cuando el usuario intenta hacer login sin conexión
 * Explica que necesita internet para autenticarse la primera vez
 */
function OfflineLoginWarning() {
  const [isOffline, setIsOffline] = React.useState(!navigator.onLine);

  React.useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (!isOffline) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-gradient-to-r from-red-600 to-orange-600 text-white px-4 py-3 shadow-lg">
      <div className="max-w-4xl mx-auto flex items-center gap-3">
        <div className="flex-shrink-0">
          <svg 
            className="w-6 h-6" 
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              strokeWidth={2} 
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" 
            />
          </svg>
        </div>
        
        <div className="flex-1">
          <p className="font-bold text-sm sm:text-base">
            📵 Sin Conexión a Internet
          </p>
          <p className="text-xs sm:text-sm opacity-90 mt-0.5">
            Necesitas conexión para iniciar sesión. Una vez autenticado, podrás usar la app sin internet.
          </p>
        </div>

        <div className="flex-shrink-0 hidden sm:block">
          <div className="animate-pulse flex items-center gap-2 text-xs bg-white/20 px-3 py-1.5 rounded-full">
            <div className="w-2 h-2 bg-white rounded-full"></div>
            <span>Esperando conexión...</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default OfflineLoginWarning;
