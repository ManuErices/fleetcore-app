import React, { useState, useEffect } from 'react';

/**
 * Detecta si el dispositivo es iOS
 */
function isIOS() {
  return (
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    // iPad en iOS 13+ se identifica como macOS con touch
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

/**
 * Detecta si es Android
 */
function isAndroid() {
  return /android/i.test(navigator.userAgent);
}

/**
 * Detecta si ya está instalada como PWA
 */
function isInstalled() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true ||
    document.referrer.includes('android-app://')
  );
}

/**
 * Componente principal de instalación PWA
 * Maneja correctamente iOS Safari y Android Chrome
 */
export default function InstallPWA() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showBanner, setShowBanner] = useState(false);
  const [platform, setPlatform] = useState(null); // 'ios' | 'android' | null
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    // Si ya está instalada, no mostrar nada
    if (isInstalled()) return;

    // Verificar si el usuario descartó recientemente (7 días)
    const dismissed = localStorage.getItem('pwa-install-dismissed');
    if (dismissed) {
      const days = (Date.now() - parseInt(dismissed)) / (1000 * 60 * 60 * 24);
      if (days < 7) return;
    }

    const ios = isIOS();
    const android = isAndroid();

    if (ios) {
      // iOS: no hay prompt automático, mostrar instrucciones manuales
      // Solo mostramos en Safari (en Chrome/Firefox de iOS tampoco se puede instalar bien)
      const isSafari = /safari/i.test(navigator.userAgent) && !/chrome|crios|fxios/i.test(navigator.userAgent);
      if (isSafari) {
        setPlatform('ios');
        // Pequeño delay para no interrumpir la carga
        setTimeout(() => setShowBanner(true), 4000);
      }
      return;
    }

    if (android) {
      // Android: esperar el evento beforeinstallprompt
      const handler = (e) => {
        e.preventDefault();
        setDeferredPrompt(e);
        setPlatform('android');
        setTimeout(() => setShowBanner(true), 3000);
      };

      window.addEventListener('beforeinstallprompt', handler);

      // Cleanup
      return () => window.removeEventListener('beforeinstallprompt', handler);
    }

    // Desktop Chrome/Edge: también soporta beforeinstallprompt
    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setPlatform('desktop');
      setTimeout(() => setShowBanner(true), 3000);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  // Escuchar cuando se instala exitosamente
  useEffect(() => {
    const handler = () => {
      setShowBanner(false);
      setDeferredPrompt(null);
    };
    window.addEventListener('appinstalled', handler);
    return () => window.removeEventListener('appinstalled', handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;

    setInstalling(true);
    deferredPrompt.prompt();

    const { outcome } = await deferredPrompt.userChoice;

    if (outcome === 'accepted') {
      setShowBanner(false);
    }

    setDeferredPrompt(null);
    setInstalling(false);
  };

  const handleDismiss = () => {
    setShowBanner(false);
    localStorage.setItem('pwa-install-dismissed', Date.now().toString());
  };

  if (!showBanner || isInstalled()) return null;

  // ─── Banner iOS ───────────────────────────────────────────────
  if (platform === 'ios') {
    return (
      <div className="fixed bottom-0 left-0 right-0 z-50 p-4 animate-slideUp">
        <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden max-w-md mx-auto">
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-5 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
              </div>
              <div>
                <p className="text-white font-bold text-sm">Instalar FleetCore</p>
                <p className="text-blue-100 text-xs">Acceso rápido desde tu pantalla de inicio</p>
              </div>
            </div>
            <button onClick={handleDismiss} className="p-1.5 rounded-lg hover:bg-white/20 transition-colors">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Instrucciones paso a paso */}
          <div className="px-5 py-4 space-y-3">
            <p className="text-xs text-slate-500 font-semibold uppercase tracking-wide">Cómo instalar en iPhone / iPad</p>

            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                <span className="text-blue-700 font-black text-sm">1</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-slate-700">
                <span>Toca el botón</span>
                {/* Ícono de compartir de iOS */}
                <span className="inline-flex items-center justify-center w-7 h-7 bg-blue-50 border border-blue-200 rounded-md">
                  <svg className="w-4 h-4 text-blue-600" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8M16 6l-4-4-4 4M12 2v13" />
                  </svg>
                </span>
                <span className="font-semibold">Compartir</span>
                <span>en Safari</span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                <span className="text-blue-700 font-black text-sm">2</span>
              </div>
              <div className="text-sm text-slate-700">
                Desplázate y toca <span className="font-semibold text-slate-900">"Agregar a pantalla de inicio"</span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                <span className="text-blue-700 font-black text-sm">3</span>
              </div>
              <div className="text-sm text-slate-700">
                Toca <span className="font-semibold text-slate-900">"Agregar"</span> en la esquina superior derecha
              </div>
            </div>

            <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2">
              <svg className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-xs text-amber-800">Funciona sin internet una vez instalada. Ideal para usar en la mina.</p>
            </div>
          </div>

          <div className="px-5 pb-4">
            <button
              onClick={handleDismiss}
              className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold rounded-xl text-sm transition-colors"
            >
              Ahora no
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Banner Android / Desktop ─────────────────────────────────
  return (
    <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-80 z-50 animate-slideUp">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
        <div className="bg-gradient-to-r from-violet-600 to-purple-700 px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            </div>
            <div>
              <p className="text-white font-bold text-sm">Instalar FleetCore</p>
              <p className="text-purple-100 text-xs">Funciona sin internet</p>
            </div>
          </div>
          <button onClick={handleDismiss} className="p-1.5 rounded-lg hover:bg-white/20 transition-colors">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-5 py-4 space-y-3">
          <div className="space-y-2">
            {[
              'Acceso rápido desde pantalla de inicio',
              'Funciona a 4000m sin señal',
              'Sincronización automática al volver',
            ].map((text, i) => (
              <div key={i} className="flex items-center gap-2 text-sm text-slate-700">
                <svg className="w-4 h-4 text-emerald-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
                {text}
              </div>
            ))}
          </div>
        </div>

        <div className="px-5 pb-4 flex gap-2">
          <button
            onClick={handleDismiss}
            className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold rounded-xl text-sm transition-colors"
          >
            Después
          </button>
          <button
            onClick={handleInstall}
            disabled={installing}
            className="flex-1 py-2.5 bg-gradient-to-r from-violet-600 to-purple-700 hover:from-violet-500 hover:to-purple-600 text-white font-bold rounded-xl text-sm transition-all shadow-lg disabled:opacity-60 flex items-center justify-center gap-1.5"
          >
            {installing ? (
              <>
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Instalando...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Instalar
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Botón compacto para la navbar (solo aparece cuando hay prompt disponible)
 */
export function InstallButton() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [installed, setInstalled] = useState(isInstalled());

  useEffect(() => {
    if (installed) return;

    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', () => {
      setInstalled(true);
      setDeferredPrompt(null);
    });

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, [installed]);

  if (installed || !deferredPrompt) return null;

  const handleInstall = async () => {
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') setInstalled(true);
    setDeferredPrompt(null);
  };

  return (
    <button
      onClick={handleInstall}
      className="px-3 py-1.5 bg-gradient-to-r from-violet-600 to-purple-700 text-white text-sm font-semibold rounded-lg flex items-center gap-1.5 shadow hover:shadow-md transition-all"
    >
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
      </svg>
      <span className="hidden sm:inline">Instalar App</span>
    </button>
  );
}

/**
 * Badge que indica si la app está instalada
 */
export function InstalledBadge() {
  if (!isInstalled()) return null;
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-100 text-emerald-700 rounded-lg text-sm font-semibold">
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
      </svg>
      App Instalada
    </div>
  );
}
