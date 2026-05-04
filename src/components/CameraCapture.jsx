import React, { useRef, useState, useEffect } from 'react';

const GRADIENTS = {
  green: 'from-green-600 to-emerald-600',
  blue: 'from-blue-600 to-indigo-600',
};

export default function CameraCapture({ onCapture, onClose, color = 'green', title = 'Foto de Identificación' }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const [capturedPhoto, setCapturedPhoto] = useState(null);
  const [cameraError, setCameraError] = useState(null);
  const [cameraReady, setCameraReady] = useState(false);

  const gradient = GRADIENTS[color] || GRADIENTS.green;

  useEffect(() => {
    startCamera();
    return () => stopCamera();
  }, []);

  const startCamera = async () => {
    setCameraError(null);
    setCameraReady(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch {
      setCameraError('No se pudo acceder a la cámara. Verifica los permisos del navegador.');
    }
  };

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  };

  const handleCapture = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    // Mirror para efecto selfie natural
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0);
    setCapturedPhoto(canvas.toDataURL('image/jpeg', 0.85));
    stopCamera();
  };

  const handleRetake = () => {
    setCapturedPhoto(null);
    startCamera();
  };

  const handleConfirm = () => {
    onCapture(capturedPhoto);
    onClose();
  };

  const handleClose = () => {
    stopCamera();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[70] bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl max-w-lg w-full sm:my-auto">
        {/* Header */}
        <div className={`bg-gradient-to-r ${gradient} text-white p-5 sm:p-6 rounded-t-3xl sm:rounded-t-2xl`}>
          <div className="flex justify-between items-start">
            <div>
              <h3 className="text-lg sm:text-xl font-black">📷 {title}</h3>
              <p className="text-white/80 text-sm mt-0.5">Mira a la cámara y presiona Sacar foto</p>
            </div>
            <button onClick={handleClose} className="p-2 hover:bg-white/20 rounded-lg transition-all flex-shrink-0">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-5 sm:p-6 space-y-4">
          {cameraError ? (
            <div className="text-center py-8">
              <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-3">
                <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="text-red-600 font-semibold text-sm">{cameraError}</p>
              <button
                onClick={startCamera}
                className="mt-4 px-6 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-xl transition-all"
              >
                Reintentar
              </button>
            </div>
          ) : capturedPhoto ? (
            <div className="space-y-4">
              <img
                src={capturedPhoto}
                alt="Foto capturada"
                className="w-full rounded-xl object-cover max-h-72"
              />
              <div className="flex gap-3">
                <button
                  onClick={handleRetake}
                  className="flex-1 px-4 py-3 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-xl transition-all"
                >
                  🔄 Tomar de nuevo
                </button>
                <button
                  onClick={handleConfirm}
                  className={`flex-1 px-4 py-3 bg-gradient-to-r ${gradient} text-white font-bold rounded-xl transition-all shadow-lg`}
                >
                  ✓ Confirmar
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Preview cámara */}
              <div className="relative bg-black rounded-xl overflow-hidden aspect-[4/3]">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  onCanPlay={() => setCameraReady(true)}
                  className="w-full h-full object-cover"
                  style={{ transform: 'scaleX(-1)' }}
                />
                {!cameraReady && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                    <div className="w-8 h-8 border-4 border-white/30 border-t-white rounded-full animate-spin" />
                  </div>
                )}
                {/* Guía de encuadre */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-36 h-44 border-2 border-white/60 rounded-full" />
                </div>
              </div>
              <button
                onClick={handleCapture}
                disabled={!cameraReady}
                className={`w-full py-4 bg-gradient-to-r ${gradient} disabled:from-slate-300 disabled:to-slate-400 text-white font-black rounded-xl transition-all shadow-lg hover:shadow-xl disabled:cursor-not-allowed text-base`}
              >
                📷 Sacar foto
              </button>
            </div>
          )}
        </div>

        <canvas ref={canvasRef} className="hidden" />
      </div>
    </div>
  );
}
