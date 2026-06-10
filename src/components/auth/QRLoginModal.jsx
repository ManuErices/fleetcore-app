import React, { useState, useEffect, useRef } from 'react';
import jsQR from 'jsqr';

export default function QRLoginModal({ onScan, onClose }) {
  const [scanning, setScanning] = useState(true);
  const [manualEmail, setManualEmail] = useState('');
  const [manualPassword, setManualPassword] = useState('');
  const [error, setError] = useState('');
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  useEffect(() => {
    if (scanning) {
      startCamera();
    }
    return () => stopCamera();
  }, [scanning]);

  const startCamera = async () => {
    try {
      const constraints = {
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      scanQRCode();
    } catch (err) {
      console.error('Error accediendo a la cámara:', err);
      setError('No se pudo acceder a la cámara. Usa entrada manual.');
      setScanning(false);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  };

  const scanQRCode = async () => {
    if (!videoRef.current || !scanning) return;

    try {
      const video = videoRef.current;

      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        context.drawImage(video, 0, 0, canvas.width, canvas.height);

        const imageData = context.getImageData(0, 0, canvas.width, canvas.height);

        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: "dontInvert",
        });

        if (code) {
          console.log("📱 QR detectado:", code.data);
          setScanning(false);
          stopCamera();

          try {
            const credentials = JSON.parse(code.data);
            if (credentials.email && credentials.password) {
              onScan(credentials);
            } else {
              setError('❌ QR inválido: falta email o password');
            }
          } catch (err) {
            setError('❌ QR inválido: formato incorrecto');
            console.error('Error parseando QR:', err);
          }
          return;
        }
      }

      if (scanning) {
        requestAnimationFrame(scanQRCode);
      }
    } catch (err) {
      console.error('Error escaneando:', err);
      if (scanning) {
        requestAnimationFrame(scanQRCode);
      }
    }
  };

  const handleManualSubmit = (e) => {
    e.preventDefault();
    if (manualEmail.trim() && manualPassword.trim()) {
      onScan({ email: manualEmail.trim(), password: manualPassword.trim() });
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-fadeIn"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-md relative animate-scaleIn">
        
        {/* Close Button above */}
        <button
          onClick={onClose}
          className="absolute -top-12 right-0 text-white/70 hover:text-white transition-colors flex items-center gap-1 text-sm bg-slate-900/60 px-3 py-1.5 rounded-full border border-white/10"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
          Cerrar
        </button>

        <div 
          className="relative border rounded-3xl shadow-2xl overflow-hidden"
          style={{ 
            backgroundColor: 'rgba(15, 28, 46, 0.98)', 
            borderColor: 'rgba(255, 255, 255, 0.08)' 
          }}
        >
          {/* Header */}
          <div 
            className="p-6 text-center relative border-b"
            style={{ 
              background: 'linear-gradient(135deg, rgba(88, 28, 135, 0.8) 0%, rgba(109, 40, 217, 0.8) 100%)',
              borderColor: 'rgba(255, 255, 255, 0.08)'
            }}
          >
            <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent pointer-events-none" />
            
            <div className="relative">
              <div className="w-12 h-12 mx-auto mb-2.5 rounded-xl bg-white/10 backdrop-blur-sm flex items-center justify-center shadow-lg border border-white/10">
                <svg className="w-6 h-6 text-purple-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                </svg>
              </div>
              <h3 className="text-xl font-black text-white tracking-tight">Acceso Rápido con QR</h3>
              <p className="text-purple-200 text-xs font-semibold mt-0.5">Operadores en Terreno</p>
            </div>
          </div>

          <div className="p-6 space-y-4">
            {/* Camera View */}
            {scanning && (
              <div className="relative aspect-square rounded-2xl overflow-hidden bg-slate-950 border border-slate-800">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />

                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-48 h-48 sm:w-56 sm:h-56 border-4 border-purple-500 rounded-2xl shadow-lg shadow-purple-500/30">
                    <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-white rounded-tl-lg"></div>
                    <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-white rounded-tr-lg"></div>
                    <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-white rounded-bl-lg"></div>
                    <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-white rounded-br-lg"></div>
                  </div>
                </div>

                <div className="absolute bottom-4 left-0 right-0 text-center px-3">
                  <div className="inline-block bg-black/60 backdrop-blur-sm text-white px-4 py-1.5 rounded-full text-xs font-bold border border-white/10">
                    Apunta al código QR del trabajador
                  </div>
                </div>
              </div>
            )}

            {/* Manual Entry Separator / Input */}
            <form onSubmit={handleManualSubmit} className="space-y-3 pt-2">
              <div className="text-[11px] font-bold text-slate-500 text-center uppercase tracking-wider">
                O ingresa credenciales manualmente:
              </div>
              <div className="space-y-2.5">
                <input
                  type="email"
                  value={manualEmail}
                  onChange={(e) => setManualEmail(e.target.value)}
                  placeholder="Email"
                  className="w-full px-4 py-2.5 bg-slate-950/60 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all text-sm"
                  required
                />
                <input
                  type="password"
                  value={manualPassword}
                  onChange={(e) => setManualPassword(e.target.value)}
                  placeholder="Contraseña"
                  className="w-full px-4 py-2.5 bg-slate-950/60 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all text-sm"
                  required
                />
                <button
                  type="submit"
                  className="w-full py-3 bg-purple-600 hover:bg-purple-500 text-white font-bold text-sm rounded-xl transition-all shadow-lg shadow-purple-600/25 active:scale-[0.99]"
                >
                  Iniciar Sesión Manual
                </button>
              </div>
            </form>

            {/* Error Message */}
            {error && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-center">
                <div className="text-xs font-bold text-red-400">{error}</div>
              </div>
            )}

            {/* Bottom Actions */}
            <div className="flex gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setScanning(!scanning)}
                className="flex-1 py-2.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl transition-all border border-slate-700/50"
              >
                {scanning ? '⏸️ Pausar Cámara' : '▶️ Activar Cámara'}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2.5 px-3 bg-slate-700 hover:bg-slate-600 text-white font-bold text-xs rounded-xl transition-all"
              >
                ✕ Cerrar
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
