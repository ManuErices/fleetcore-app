import React, { useRef, useState, useEffect } from 'react';

export default function SignaturePad({ onSave, label = "Firma", color = "blue" }) {
  const canvasRef = useRef(null);
  const dprRef = useRef(1);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isEmpty, setIsEmpty] = useState(true);
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    
    // Configurar canvas con resolución alta para móviles
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    dprRef.current = dpr;
    
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    
    ctx.scale(dpr, dpr);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#1e293b'; // slate-800
    
    // Fondo blanco
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }, []);

  const startDrawing = (e) => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    
    setIsDrawing(true);
    setIsEmpty(false);
    
    const x = (e.clientX || e.touches[0].clientX) - rect.left;
    const y = (e.clientY || e.touches[0].clientY) - rect.top;
    
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e) => {
    if (!isDrawing) return;
    
    e.preventDefault(); // Prevenir scroll en móvil
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    
    const x = (e.clientX || e.touches?.[0]?.clientX) - rect.left;
    const y = (e.clientY || e.touches?.[0]?.clientY) - rect.top;
    
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    if (isDrawing) {
      setIsDrawing(false);
      // Guardar automáticamente después de cada trazo
      const canvas = canvasRef.current;
      const signatureData = canvas.toDataURL('image/png');
      onSave(signatureData);
      setIsSaved(true);
    }
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const dpr = dprRef.current;
    // Resetear transform, limpiar todo el canvas físico, restaurar transform
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#1e293b';
    setIsEmpty(true);
    setIsSaved(false);
    onSave(null);
  };

  const colorClasses = {
    blue: 'from-blue-600 to-indigo-600',
    green: 'from-green-600 to-emerald-600',
    orange: 'from-orange-600 to-amber-600'
  };

  return (
    <div className={`bg-gradient-to-br ${colorClasses[color] || colorClasses.blue} bg-opacity-5 border-2 border-${color}-200 rounded-xl p-6`}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <svg className={`w-6 h-6 text-${color}-600`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
          </svg>
          <h3 className={`text-lg font-black text-${color}-900`}>{label}</h3>
          {!isEmpty && !isSaved && (
            <span className="ml-2 px-2 py-1 bg-yellow-100 text-yellow-700 text-xs font-bold rounded-full">
              ✏️ Dibujando...
            </span>
          )}
          {isSaved && (
            <span className="ml-2 px-2 py-1 bg-yellow-100 text-yellow-700 text-xs font-bold rounded-full">
              ✏️ Pendiente confirmar
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={clearSignature}
          className={`px-4 py-2 bg-${color}-100 hover:bg-${color}-200 text-${color}-700 rounded-lg transition-all text-sm font-semibold flex items-center gap-2`}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
          Limpiar
        </button>
      </div>

      <div className="bg-white rounded-lg border-3 border-slate-300 overflow-hidden shadow-inner mb-4">
        <canvas
          ref={canvasRef}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
          className="w-full h-48 touch-none cursor-crosshair"
          style={{ touchAction: 'none' }}
        />
      </div>

      <div className={`bg-${color}-50 border border-${color}-200 rounded-lg p-3 flex items-start gap-3`}>
        <svg className={`w-5 h-5 text-${color}-600 flex-shrink-0 mt-0.5`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <div className="text-xs text-slate-700">
          <p className="font-semibold mb-1">Instrucciones:</p>
          <ul className="list-disc list-inside space-y-1">
            <li>Firma con el mouse (desktop) o con el dedo (móvil)</li>
            <li>Puedes seguir dibujando hasta quedar conforme</li>
            <li>Presiona <strong>"Confirmar firma"</strong> cuando estés listo</li>
            <li>Usa "Limpiar" si necesitas corregir la firma</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
