// ============================================================
// FLEETCORE — PÁGINA DE PRICING
// src/pages/PricingPage.jsx
//
// Modelo: selección de módulos + descuento por cantidad
// ============================================================

import React, { useState } from 'react';
import { auth } from '../lib/firebase';
import { MODULES, BUNDLE_DISCOUNTS, calculateTotal, formatPrice } from '../lib/plans';

// ── Iconos por módulo ─────────────────────────────────────────
const MODULE_ICONS = {
  rrhh: (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
  finanzas: (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  ),
  fleetcore: (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
    </svg>
  ),
  workfleet: (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
    </svg>
  ),
};

// ── Colores por módulo ────────────────────────────────────────
const MODULE_COLORS = {
  rrhh:      { bg: 'bg-emerald-500', light: 'bg-emerald-50',  border: 'border-emerald-400', text: 'text-emerald-700', ring: 'ring-emerald-400' },
  finanzas:  { bg: 'bg-purple-500',  light: 'bg-purple-50',   border: 'border-purple-400',  text: 'text-purple-700',  ring: 'ring-purple-400'  },
  fleetcore: { bg: 'bg-orange-500',  light: 'bg-orange-50',   border: 'border-orange-400',  text: 'text-orange-700',  ring: 'ring-orange-400'  },
  workfleet: { bg: 'bg-blue-500',    light: 'bg-blue-50',     border: 'border-blue-400',    text: 'text-blue-700',    ring: 'ring-blue-400'    },
};

const MODULE_ORDER = ['rrhh', 'finanzas', 'fleetcore', 'workfleet'];

export default function PricingPage({ onBack }) {
  const [selected, setSelected] = useState([]);
  const [loading,  setLoading]  = useState(false);

  const toggle = (id) => {
    setSelected(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const { base, discount, savings, total } = calculateTotal(selected);
  const count = selected.length;

  const handleSubscribe = async () => {
    if (count === 0) return;
    const user = auth.currentUser;
    if (!user) return alert('Debes iniciar sesión primero');

    setLoading(true);
    try {
      const FUNCTIONS_URL = import.meta.env.VITE_FUNCTIONS_URL
        || 'https://us-central1-mpf-maquinaria.cloudfunctions.net';

      const res = await fetch(`${FUNCTIONS_URL}/createSubscription`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          planId:    selected.join(','),
          userId:    user.uid,
          userEmail: user.email,
          userName:  user.displayName || '',
          modules:   selected,
          total,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Error desconocido');
      window.location.href = data.initPoint;
    } catch (err) {
      alert('Error al procesar el pago: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Header */}
      <div className="relative border-b border-slate-800 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-900/40 via-transparent to-transparent" />
        <div className="relative max-w-5xl mx-auto px-4 py-14 text-center">
          {onBack && (
            <button onClick={onBack} className="absolute top-6 left-4 flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-sm font-medium">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Volver
            </button>
          )}
          <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-blue-500/10 border border-blue-500/30 rounded-full text-blue-400 text-xs font-bold uppercase tracking-widest mb-5">
            Precios
          </div>
          <h1 className="text-4xl sm:text-5xl font-black tracking-tight mb-3">
            Arma tu plan
          </h1>
          <p className="text-slate-400 text-base max-w-lg mx-auto">
            Selecciona solo los módulos que necesitas. Más módulos, mayor descuento.
          </p>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-12">

        {/* Banner de descuentos */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-10">
          {[
            { qty: 1, label: '1 módulo',   disc: '0%',  active: count === 1 },
            { qty: 2, label: '2 módulos',  disc: '10%', active: count === 2 },
            { qty: 3, label: '3 módulos',  disc: '15%', active: count === 3 },
            { qty: 4, label: '4 módulos',  disc: '25%', active: count === 4 },
          ].map(item => (
            <div key={item.qty} className={`rounded-2xl border p-3 text-center transition-all ${item.active ? 'border-blue-500 bg-blue-500/10' : 'border-slate-800 bg-slate-900'}`}>
              <div className={`text-2xl font-black ${item.active ? 'text-blue-400' : item.disc === '0%' ? 'text-slate-500' : 'text-emerald-400'}`}>
                {item.disc === '0%' ? '—' : `-${item.disc}`}
              </div>
              <div className={`text-xs mt-1 font-semibold ${item.active ? 'text-blue-300' : 'text-slate-500'}`}>{item.label}</div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">

          {/* Columna de módulos */}
          <div className="lg:col-span-2 space-y-4">
            {MODULE_ORDER.map(id => {
              const mod       = MODULES[id];
              const isSelected = selected.includes(id);
              const c         = MODULE_COLORS[id];

              return (
                <button
                  key={id}
                  onClick={() => toggle(id)}
                  className={`w-full text-left rounded-2xl border-2 p-5 transition-all ${
                    isSelected
                      ? `${c.border} bg-slate-900 ring-2 ${c.ring} ring-offset-2 ring-offset-slate-950`
                      : 'border-slate-800 bg-slate-900 hover:border-slate-600'
                  }`}
                >
                  <div className="flex items-start gap-4">
                    {/* Checkbox visual */}
                    <div className={`mt-0.5 w-6 h-6 rounded-lg flex-shrink-0 flex items-center justify-center transition-all ${isSelected ? `${c.bg}` : 'bg-slate-800 border-2 border-slate-700'}`}>
                      {isSelected && (
                        <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>

                    {/* Ícono */}
                    <div className={`w-11 h-11 rounded-xl flex-shrink-0 flex items-center justify-center ${isSelected ? c.bg : 'bg-slate-800'} transition-colors`}>
                      <span className="text-white">{MODULE_ICONS[id]}</span>
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <span className="font-black text-white text-base">{mod.name}</span>
                        <span className={`text-sm font-black ${isSelected ? c.text.replace('700','400') : 'text-slate-300'}`}>
                          {formatPrice(mod.price)}<span className="text-xs font-normal text-slate-500 ml-1">/ mes · IVA inc.</span>
                        </span>
                      </div>
                      <p className="text-slate-400 text-sm mt-1 mb-3">{mod.description}</p>
                      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
                        {mod.features.map((f, i) => (
                          <li key={i} className="flex items-center gap-2 text-xs text-slate-400">
                            <svg className={`w-3 h-3 flex-shrink-0 ${isSelected ? c.text : 'text-slate-600'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                            </svg>
                            {f}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Panel resumen — sticky */}
          <div className="lg:sticky lg:top-6">
            <div className="rounded-2xl border border-slate-800 bg-slate-900 overflow-hidden">
              <div className="p-5 border-b border-slate-800">
                <h3 className="font-black text-white text-base">Resumen</h3>
              </div>

              <div className="p-5 space-y-3">
                {count === 0 ? (
                  <p className="text-slate-500 text-sm text-center py-4">Selecciona al menos un módulo</p>
                ) : (
                  <>
                    {/* Lista de módulos seleccionados */}
                    {selected.map(id => {
                      const mod = MODULES[id];
                      const c   = MODULE_COLORS[id];
                      return (
                        <div key={id} className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full ${c.bg}`} />
                            <span className="text-slate-300 font-medium">{mod.name}</span>
                          </div>
                          <span className="text-slate-400">{formatPrice(mod.price)}</span>
                        </div>
                      );
                    })}

                    <div className="h-px bg-slate-800 my-1" />

                    {/* Subtotal */}
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-400">Subtotal</span>
                      <span className="text-slate-300">{formatPrice(base)}</span>
                    </div>

                    {/* Descuento */}
                    {discount > 0 && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-emerald-400 font-semibold flex items-center gap-1.5">
                          <span className="px-1.5 py-0.5 bg-emerald-500/15 rounded-md text-xs font-bold">
                            -{Math.round(discount * 100)}%
                          </span>
                          Descuento bundle
                        </span>
                        <span className="text-emerald-400 font-semibold">-{formatPrice(savings)}</span>
                      </div>
                    )}

                    <div className="h-px bg-slate-800 my-1" />

                    {/* Total */}
                    <div className="flex items-center justify-between">
                      <span className="font-black text-white">Total mensual</span>
                      <div className="text-right">
                        <div className="text-xl font-black text-white">{formatPrice(total)}</div>
                        <div className="text-xs text-slate-500">IVA incluido</div>
                      </div>
                    </div>

                    {/* Badge de ahorro */}
                    {savings > 0 && (
                      <div className="mt-1 px-3 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-center">
                        <span className="text-emerald-400 text-xs font-bold">
                          Ahorras {formatPrice(savings)} al mes con el bundle
                        </span>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Botón */}
              <div className="p-5 pt-0">
                <button
                  onClick={handleSubscribe}
                  disabled={count === 0 || loading}
                  className="w-full py-4 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white font-black text-sm transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20"
                >
                  {loading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Procesando...
                    </>
                  ) : count === 0 ? (
                    'Selecciona módulos'
                  ) : (
                    <>
                      Suscribirse · {formatPrice(total)}
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                      </svg>
                    </>
                  )}
                </button>

                <p className="text-center text-xs text-slate-600 mt-3">
                  Sin contratos · Cancela cuando quieras
                </p>
              </div>
            </div>

            {/* Nota módulos */}
            {count > 0 && count < 4 && (
              <div className="mt-4 p-4 rounded-xl bg-slate-900 border border-slate-800">
                <p className="text-xs text-slate-400 text-center">
                  Agrega {4 - count} módulo{4 - count > 1 ? 's' : ''} más y obtén{' '}
                  <span className="text-emerald-400 font-bold">
                    {Math.round(BUNDLE_DISCOUNTS[Math.min(count + 1, 4)] * 100)}% de descuento
                    {count + 1 < 4 ? ` (o ${Math.round(BUNDLE_DISCOUNTS[4] * 100)}% con los 4)` : ''}
                  </span>
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
