import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";

export default function CameraCapture({ onCapture, onClose, title = "Capturar Foto", color = "blue" }) {
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);

  const colors = {
    blue: "from-blue-600 to-indigo-600",
    green: "from-green-600 to-emerald-600",
    amber: "from-amber-600 to-orange-600"
  };

  const startCamera = async () => {
    try {
      setError(null);
      const constraints = {
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setStreaming(true);
      }
    } catch (err) {
      console.error("Error accessing camera:", err);
      setError("No se pudo acceder a la cámara. Asegúrate de dar los permisos necesarios.");
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setStreaming(false);
  };

  const takePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext("2d");

    const MAX_DIM = 600;
    const sw = video.videoWidth || 1280;
    const sh = video.videoHeight || 720;
    const scale = Math.min(1, MAX_DIM / Math.max(sw, sh));
    canvas.width = Math.round(sw * scale);
    canvas.height = Math.round(sh * scale);

    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    const photoData = canvas.toDataURL("image/jpeg", 0.5);
    onCapture(photoData);
    stopCamera();
    onClose();
  };

  useEffect(() => {
    startCamera();
    
    // Prevenir doble scroll al abrir el modal
    const originalStyle = window.getComputedStyle(document.body).overflow;
    document.body.style.overflow = 'hidden';
    
    return () => {
      stopCamera();
      document.body.style.overflow = originalStyle;
    };
  }, []);

  const modalContent = (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-300" style={{ zIndex: 99999 }}>
      <div className="bg-white rounded-[2.5rem] shadow-2xl max-w-lg w-full overflow-hidden flex flex-col max-h-[90dvh]">
        {/* Header */}
        <div className={`bg-gradient-to-r ${colors[color] || colors.blue} p-6 flex items-center justify-between`}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center backdrop-blur-md">
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <div>
              <h3 className="text-xl font-black text-white uppercase tracking-tight">{title}</h3>
              <p className="text-white/70 text-[10px] font-bold uppercase tracking-widest">Captura de validación</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-all text-white"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 flex flex-col items-center">
          {error ? (
            <div className="bg-red-50 border-2 border-red-100 p-8 rounded-3xl text-center space-y-4">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto text-red-600">
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <p className="text-red-800 font-bold">{error}</p>
              <button 
                onClick={startCamera}
                className="px-6 py-2 bg-red-600 text-white rounded-xl font-black text-sm uppercase"
              >
                Reintentar
              </button>
            </div>
          ) : (
            <div className="relative w-full aspect-square md:aspect-video bg-slate-900 rounded-3xl overflow-hidden shadow-inner group">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
              {!streaming && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-12 h-12 border-4 border-white/30 border-t-white rounded-full animate-spin"></div>
                </div>
              )}
              {/* Overlay guides */}
              <div className="absolute inset-0 pointer-events-none border-[3rem] border-black/40">
                <div className="w-full h-full border-2 border-white/50 rounded-2xl"></div>
              </div>
            </div>
          )}

          {/* Hidden canvas for capture */}
          <canvas ref={canvasRef} className="hidden" />

          {/* Footer Controls */}
          <div className="mt-8 flex items-center justify-center gap-6 w-full">
            <button
              onClick={onClose}
              className="flex-1 py-4 bg-slate-100 hover:bg-slate-200 text-slate-500 font-black rounded-2xl transition-all uppercase text-xs tracking-widest"
            >
              Cancelar
            </button>
            <button
              onClick={takePhoto}
              disabled={!streaming}
              className={`flex-[2] py-4 bg-gradient-to-r ${colors[color] || colors.blue} text-white font-black rounded-2xl transition-all uppercase text-xs tracking-widest shadow-xl shadow-blue-100 active:scale-95 disabled:grayscale disabled:opacity-50`}
            >
              Capturar Foto
            </button>
          </div>
        </div>

        <div className="bg-slate-50 p-4 text-center">
          <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">
            Asegúrate de que la identificación sea legible
          </p>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : null;
}
