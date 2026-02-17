import React, { useState, useEffect } from 'react';
import { onInstallPrompt, isInstalled } from '../registerSW';

/**
 * Componente que muestra un banner para instalar la PWA
 * Solo aparece en dispositivos móviles que no la tienen instalada
 */
export default function InstallPWA() {
  const [installPrompt, setInstallPrompt] = useState(null);
  const [showBanner, setShowBanner] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // No mostrar si ya está instalado
    if (isInstalled()) {
      console.log('✅ PWA ya instalada');
      return;
    }

    // Verificar si el usuario ya descartó el banner
    const wasDismissed = localStorage.getItem('pwa-install-dismissed');
    if (wasDismissed) {
      const dismissedDate = new Date(wasDismissed);
      const daysSinceDismissed = (Date.now() - dismissedDate.getTime()) / (1000 * 60 * 60 * 24);
      
      // Mostrar de nuevo después de 7 días
      if (daysSinceDismissed < 7) {
        return;
      }
    }

    // Esperar evento de instalación
    onInstallPrompt((prompt) => {
      setInstallPrompt(prompt);
      
      // Esperar 3 segundos antes de mostrar el banner
      setTimeout(() => {
        setShowBanner(true);
      }, 3000);
    });
  }, []);

  const handleInstall = async () => {
    if (!installPrompt) return;

    // Mostrar prompt nativo de instalación
    installPrompt.prompt();
    
    // Esperar respuesta del usuario
    const { outcome } = await installPrompt.userChoice;

    if (outcome === 'accepted') {
      console.log('✅ PWA instalada por el usuario');
      setShowBanner(false);
    } else {
      console.log('❌ Usuario rechazó instalar PWA');
    }

    // Limpiar prompt
    setInstallPrompt(null);
  };

  const handleDismiss = () => {
    setShowBanner(false);
    setDismissed(true);
    
    // Guardar fecha de descarte
    localStorage.setItem('pwa-install-dismissed', new Date().toISOString());
  };

  // No mostrar si está instalado, descartado o no hay prompt
  if (!showBanner || isInstalled() || dismissed) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96 z-50 animate-slideUp">
      <div className="glass-card rounded-2xl p-6 border-2 border-orange-300 bg-gradient-to-br from-orange-50 to-amber-50 shadow-2xl">
        <button
          onClick={handleDismiss}
          className="absolute top-3 right-3 p-1 hover:bg-slate-200 rounded-lg transition-colors"
          aria-label="Cerrar"
        >
          <svg className="w-5 h-5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-600 to-amber-600 flex items-center justify-center flex-shrink-0">
            <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
          </div>

          <div className="flex-1 pr-6">
            <h3 className="font-bold text-slate-900 mb-1 text-lg">
              📱 Instalar App en tu Dispositivo
            </h3>
            <p className="text-sm text-slate-600 mb-4 leading-relaxed">
              Trabaja sin conexión en la mina. Instala la app para acceso rápido y funcionalidad offline completa.
            </p>

            <div className="space-y-2 mb-4">
              <div className="flex items-center gap-2 text-xs text-slate-700">
                <svg className="w-4 h-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>Funciona sin internet a 4000m</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-700">
                <svg className="w-4 h-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>Acceso desde pantalla de inicio</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-700">
                <svg className="w-4 h-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>Sincronización automática al volver</span>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleInstall}
                className="flex-1 px-4 py-2.5 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white font-semibold rounded-lg transition-all shadow-lg hover:shadow-xl flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Instalar Ahora
              </button>
              <button
                onClick={handleDismiss}
                className="px-4 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold rounded-lg transition-all"
              >
                Después
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Indicador compacto de instalación para navbar
 */
export function InstallButton() {
  const [installPrompt, setInstallPrompt] = useState(null);
  const [installed, setInstalled] = useState(isInstalled());

  useEffect(() => {
    if (installed) return;

    onInstallPrompt((prompt) => {
      setInstallPrompt(prompt);
    });

    // Escuchar evento de instalación
    const handleAppInstalled = () => {
      setInstalled(true);
      setInstallPrompt(null);
    };

    window.addEventListener('appinstalled', handleAppInstalled);
    return () => window.removeEventListener('appinstalled', handleAppInstalled);
  }, [installed]);

  const handleInstall = async () => {
    if (!installPrompt) return;

    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;

    if (outcome === 'accepted') {
      setInstalled(true);
    }

    setInstallPrompt(null);
  };

  // No mostrar si ya está instalado
  if (installed) return null;

  // No mostrar si no hay prompt disponible
  if (!installPrompt) return null;

  return (
    <button
      onClick={handleInstall}
      className="px-3 py-1.5 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white text-sm font-semibold rounded-lg transition-all shadow-md hover:shadow-lg flex items-center gap-2"
      title="Instalar aplicación"
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
  const [installed] = useState(isInstalled());

  if (!installed) return null;

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-green-100 text-green-700 rounded-lg text-sm font-semibold">
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
      </svg>
      <span>App Instalada</span>
    </div>
  );
}
