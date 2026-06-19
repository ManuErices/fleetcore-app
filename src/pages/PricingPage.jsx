// ============================================================
// FLEETCORE — PÁGINA INTERNA DE PRICING (MODULAR & DRY)
// src/pages/PricingPage.jsx
// ============================================================

import React from 'react';
import { auth } from '../lib/firebase';
import PricingSection from '../components/landing/PricingSection';

export default function PricingPage({ onBack }) {
  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col relative">
      {/* Header bar with Back button */}
      <div className="border-b border-slate-900 bg-slate-950/80 backdrop-blur sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/favicon.svg" alt="FleetCore Logo" className="h-8 w-8 object-contain" />
            <span className="text-lg font-black text-white tracking-tight">
              Fleet<span className="text-blue-400">Core</span>
            </span>
          </div>
          {onBack && (
            <button 
              onClick={onBack} 
              className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-sm font-semibold bg-slate-900 hover:bg-slate-800 px-4 py-2 rounded-xl border border-slate-800"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
              </svg>
              Volver al Dashboard
            </button>
          )}
        </div>
      </div>

      {/* Main Pricing Selection Area */}
      <div className="flex-1 max-w-7xl w-full mx-auto px-4 py-6">
        <PricingSection 
          currentUser={auth.currentUser}
          onAuthRequired={() => {}} // User is already logged in, so this won't be triggered
        />
      </div>

      {/* Corporate Footer */}
      <div className="py-6 border-t border-slate-900 text-center bg-slate-950 shrink-0">
        <p className="text-xs text-slate-500 font-medium">
          Pagos procesados de forma segura mediante Transbank Webpay Plus. Respaldo técnico de SAER TI.
        </p>
      </div>
    </div>
  );
}
