// ============================================================
// FLEETCORE — PÁGINA DE RESULTADO DE PAGO
// src/pages/PaymentResult.jsx
//
// MercadoPago redirige aquí después del checkout.
// URL: /payment-result?status=approved&payment_id=xxx
// ============================================================

import React, { useEffect, useState } from 'react';

export default function PaymentResult({ onBack }) {
  const [status, setStatus] = useState(null);

  useEffect(() => {
    const params  = new URLSearchParams(window.location.search);
    const st      = params.get('status') || params.get('collection_status');
    setStatus(st);

    // Limpiar la URL sin recargar
    window.history.replaceState({}, '', '/payment-result');
  }, []);

  const config = {
    approved: {
      icon:    '✓',
      color:   'text-emerald-600',
      bg:      'bg-emerald-50',
      border:  'border-emerald-200',
      title:   '¡Suscripción activada!',
      msg:     'Tu plan ya está activo. Los módulos se desbloquearán automáticamente en unos segundos.',
      btn:     'Ir a FleetCore',
    },
    pending: {
      icon:    '⏳',
      color:   'text-amber-600',
      bg:      'bg-amber-50',
      border:  'border-amber-200',
      title:   'Pago pendiente',
      msg:     'Tu pago está siendo procesado. Recibirás un email cuando se confirme y los módulos se activarán automáticamente.',
      btn:     'Volver al inicio',
    },
    failure: {
      icon:    '✕',
      color:   'text-red-600',
      bg:      'bg-red-50',
      border:  'border-red-200',
      title:   'Pago no completado',
      msg:     'Hubo un problema con el pago. Puedes intentarlo nuevamente o contactarnos si el problema persiste.',
      btn:     'Intentar de nuevo',
    },
  };

  const c = config[status] || config.pending;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-blue-900 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-3xl shadow-2xl overflow-hidden">
        <div className="bg-gradient-to-r from-blue-900 to-blue-700 p-8 text-center">
          <img src="/favicon.svg" alt="FleetCore" className="w-16 h-16 mx-auto mb-3 object-contain" />
          <h1 className="text-2xl font-black text-white">Fleet<span className="text-blue-200">Core</span></h1>
        </div>

        <div className="p-8 text-center">
          <div className={`w-20 h-20 mx-auto mb-6 rounded-full ${c.bg} border-2 ${c.border} flex items-center justify-center`}>
            <span className={`text-3xl font-black ${c.color}`}>{c.icon}</span>
          </div>

          <h2 className="text-2xl font-black text-slate-900 mb-3">{c.title}</h2>
          <p className="text-slate-600 text-sm leading-relaxed mb-8">{c.msg}</p>

          <button
            onClick={onBack}
            className="w-full py-4 bg-gradient-to-r from-blue-900 to-blue-700 hover:from-blue-800 hover:to-blue-600 text-white font-bold rounded-2xl transition-all shadow-lg hover:shadow-xl"
          >
            {c.btn}
          </button>

          {status === 'failure' && (
            <button
              onClick={() => { localStorage.setItem('selectedApp', 'pricing'); window.location.reload(); }}
              className="w-full mt-3 py-3 border-2 border-slate-200 hover:bg-slate-50 text-slate-700 font-bold rounded-2xl transition-all text-sm"
            >
              Ver planes
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
