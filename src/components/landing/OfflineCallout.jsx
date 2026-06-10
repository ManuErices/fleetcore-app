import React from 'react';

export default function OfflineCallout() {
  return (
    <section id="offline" className="py-24 bg-gradient-to-r from-blue-950/10 to-slate-950/10">
      <div 
        className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 border rounded-3xl p-8 sm:p-12 flex flex-col md:flex-row items-center gap-8 shadow-xl relative overflow-hidden"
        style={{ 
          backgroundColor: '#0F1C2E', 
          borderColor: 'rgba(255, 255, 255, 0.05)' 
        }}
      >
        <div className="absolute top-0 right-0 w-64 h-64 bg-blue-600/5 rounded-full blur-3xl pointer-events-none" />

        <div 
          className="w-16 h-16 rounded-2xl flex items-center justify-center flex-shrink-0 text-3xl"
          style={{ backgroundColor: 'rgba(37, 99, 235, 0.15)' }}
        >
          📶
        </div>
        <div className="flex-1 text-center md:text-left space-y-2">
          <div 
            className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold"
            style={{ backgroundColor: 'rgba(16, 185, 129, 0.15)', color: '#34d399' }}
          >
            <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full" />
            Sincronización Inteligente
          </div>
          <h3 className="text-white font-bold text-2xl">Diseñado para faenas aisladas y sin cobertura</h3>
          <p className="text-slate-400 text-sm leading-relaxed max-w-xl">
            Como Progressive Web App (PWA), FleetCore almacena localmente los reportes de combustible y diarios de obra del operador. Al recuperar conexión, los datos se sincronizan automáticamente con el servidor sin pérdidas de datos.
          </p>
        </div>
        <div 
          className="text-slate-300 text-xs font-semibold whitespace-nowrap px-5 py-3 rounded-xl border"
          style={{ 
            backgroundColor: 'rgba(30, 41, 59, 0.8)', 
            borderColor: 'rgba(255, 255, 255, 0.05)' 
          }}
        >
          Modo 100% Offline PWA
        </div>
      </div>
    </section>
  );
}
