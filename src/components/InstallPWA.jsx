import React, { useState, useEffect } from 'react';

function isIOS() {
  return (
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

function isInstalled() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true ||
    document.referrer.includes('android-app://')
  );
}

function isAndroid() {
  return /android/i.test(navigator.userAgent);
}

export default function InstallPWA() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showBanner, setShowBanner] = useState(false);
  const [platform, setPlatform] = useState(null);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    if (isInstalled()) return;

    const dismissed = localStorage.getItem('pwa-install-dismissed');
    if (dismissed) {
      const days = (Date.now() - parseInt(dismissed)) / (1000 * 60 * 60 * 24);
      if (days < 7) return;
    }

    if (isIOS()) {
      const isSafari = /safari/i.test(navigator.userAgent) &&
                       !/chrome|crios|fxios/i.test(navigator.userAgent);
      if (isSafari) {
        setPlatform('ios');
        setTimeout(() => setShowBanner(true), 3000);
      }
      return;
    }

    if (isAndroid()) {
      // Intentar capturar el prompt automático
      const handler = (e) => {
        e.preventDefault();
        setDeferredPrompt(e);
        setPlatform('android-prompt');
        setTimeout(() => setShowBanner(true), 2000);
      };
      window.addEventListener('beforeinstallprompt', handler);

      // Si no llega en 4s, mostrar instrucciones manuales igual
      const timeout = setTimeout(() => {
        setPlatform('android-manual');
        setShowBanner(true);
      }, 4000);

      return () => {
        window.removeEventListener('beforeinstallprompt', handler);
        clearTimeout(timeout);
      };
    }

    // Desktop
    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setPlatform('desktop');
      setTimeout(() => setShowBanner(true), 2000);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

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
    if (outcome === 'accepted') setShowBanner(false);
    setDeferredPrompt(null);
    setInstalling(false);
  };

  const handleDismiss = () => {
    setShowBanner(false);
    localStorage.setItem('pwa-install-dismissed', Date.now().toString());
  };

  if (!showBanner || isInstalled()) return null;

  // ─── iOS Safari ───────────────────────────────────────────────
  if (platform === 'ios') {
    return (
      <div className="fixed bottom-0 left-0 right-0 z-50 p-4">
        <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden max-w-md mx-auto">
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-5 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img src="/icon-192x192.png" alt="FleetCore" className="w-10 h-10 object-contain" style={{mixBlendMode:'screen'}} />
              <div>
                <p className="text-white font-bold text-sm">Instalar FleetCore</p>
                <p className="text-blue-100 text-xs">Acceso rápido desde inicio</p>
              </div>
            </div>
            <button onClick={handleDismiss} className="p-1.5 rounded-lg hover:bg-white/20">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="px-5 py-4 space-y-3">
            <p className="text-xs text-slate-500 font-semibold uppercase tracking-wide">Cómo instalar en iPhone / iPad</p>
            {[
              <span>Toca el botón <strong>Compartir</strong> <span className="inline-flex items-center justify-center w-6 h-6 bg-blue-50 border border-blue-200 rounded mx-1"><svg className="w-3.5 h-3.5 text-blue-600" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8M16 6l-4-4-4 4M12 2v13"/></svg></span> en Safari</span>,
              <span>Toca <strong>"Agregar a pantalla de inicio"</strong></span>,
              <span>Toca <strong>"Agregar"</strong> arriba a la derecha</span>,
            ].map((text, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                  <span className="text-blue-700 font-black text-xs">{i + 1}</span>
                </div>
                <div className="text-sm text-slate-700">{text}</div>
              </div>
            ))}
          </div>
          <div className="px-5 pb-4">
            <button onClick={handleDismiss} className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold rounded-xl text-sm transition-colors">
              Ahora no
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Android con prompt automático ───────────────────────────
  if (platform === 'android-prompt' && deferredPrompt) {
    return (
      <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-80 z-50">
        <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
          <div className="bg-gradient-to-r from-violet-600 to-purple-700 px-5 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img src="/icon-192x192.png" alt="FleetCore" className="w-10 h-10 object-contain" style={{mixBlendMode:'screen'}} />
              <div>
                <p className="text-white font-bold text-sm">Instalar FleetCore</p>
                <p className="text-purple-100 text-xs">Funciona sin internet</p>
              </div>
            </div>
            <button onClick={handleDismiss} className="p-1.5 rounded-lg hover:bg-white/20">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="px-5 py-4 space-y-2">
            {['Acceso rápido desde pantalla de inicio', 'Funciona a 4000m sin señal', 'Sincronización automática al volver'].map((t, i) => (
              <div key={i} className="flex items-center gap-2 text-sm text-slate-700">
                <svg className="w-4 h-4 text-emerald-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
                {t}
              </div>
            ))}
          </div>
          <div className="px-5 pb-4 flex gap-2">
            <button onClick={handleDismiss} className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold rounded-xl text-sm transition-colors">
              Después
            </button>
            <button onClick={handleInstall} disabled={installing}
              className="flex-1 py-2.5 bg-gradient-to-r from-violet-600 to-purple-700 text-white font-bold rounded-xl text-sm flex items-center justify-center gap-1.5 disabled:opacity-60 transition-all">
              {installing ? (
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
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

  // ─── Android instrucciones manuales (cuando Chrome no dispara el evento) ──
  if (platform === 'android-manual') {
    return (
      <div className="fixed bottom-0 left-0 right-0 z-50 p-4">
        <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden max-w-md mx-auto">
          <div className="bg-gradient-to-r from-violet-600 to-purple-700 px-5 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img src="/icon-192x192.png" alt="FleetCore" className="w-10 h-10 object-contain" style={{mixBlendMode:'screen'}} />
              <div>
                <p className="text-white font-bold text-sm">Instalar FleetCore</p>
                <p className="text-purple-100 text-xs">Funciona sin internet a 4000m</p>
              </div>
            </div>
            <button onClick={handleDismiss} className="p-1.5 rounded-lg hover:bg-white/20">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="px-5 py-4 space-y-3">
            <p className="text-xs text-slate-500 font-semibold uppercase tracking-wide">Cómo instalar en Android</p>
            {[
              <span>Toca los <strong>3 puntos</strong> <span className="inline-flex flex-col gap-0.5 mx-1">{[0,1,2].map(i=><span key={i} className="w-1 h-1 bg-slate-600 rounded-full"/>)}</span> arriba a la derecha</span>,
              <span>Toca <strong>"Instalar app"</strong> o <strong>"Añadir a pantalla de inicio"</strong></span>,
              <span>Toca <strong>"Instalar"</strong> para confirmar</span>,
            ].map((text, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-full bg-violet-100 flex items-center justify-center flex-shrink-0">
                  <span className="text-violet-700 font-black text-xs">{i + 1}</span>
                </div>
                <div className="text-sm text-slate-700">{text}</div>
              </div>
            ))}
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-2">
              <svg className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-xs text-emerald-800">Una vez instalada, funciona sin internet. Ideal para la mina.</p>
            </div>
          </div>
          <div className="px-5 pb-4">
            <button onClick={handleDismiss} className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold rounded-xl text-sm transition-colors">
              Ahora no
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}

export function InstallButton() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [installed, setInstalled] = useState(isInstalled());

  useEffect(() => {
    if (installed) return;
    const handler = (e) => { e.preventDefault(); setDeferredPrompt(e); };
    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', () => { setInstalled(true); setDeferredPrompt(null); });
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
    <button onClick={handleInstall}
      className="px-3 py-1.5 bg-gradient-to-r from-violet-600 to-purple-700 text-white text-sm font-semibold rounded-lg flex items-center gap-1.5 shadow">
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
      </svg>
      <span className="hidden sm:inline">Instalar App</span>
    </button>
  );
}

export function InstalledBadge() {
  if (!isInstalled()) return null;
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-100 text-emerald-700 rounded-lg text-sm font-semibold">
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/>
      </svg>
      App Instalada
    </div>
  );
}
