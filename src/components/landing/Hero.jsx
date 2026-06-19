import React from 'react';

export default function Hero({ onCTA, onExplore }) {
  const handleScroll = (e, targetId) => {
    e.preventDefault();
    const element = document.getElementById(targetId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <section className="relative pt-12 pb-20 lg:pt-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-12 gap-12 lg:gap-16 items-center">
          
          {/* Hero Left — Propuesta de valor */}
          <div className="lg:col-span-7 space-y-6 text-left">
            <div 
              className="inline-flex items-center gap-2 border rounded-full px-4 py-2 text-xs font-semibold"
              style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)', borderColor: 'rgba(59, 130, 246, 0.35)', color: '#60a5fa' }}
            >
              <span className="w-2 h-2 bg-blue-400 rounded-full animate-pulse" />
              Gestión de Maquinaria y Control de Producción · Chile 🇨🇱
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-white leading-tight">
              El núcleo digital de tu{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-400">
                flota y maquinaria
              </span>{' '}
              en terreno
            </h1>

            <p className="text-lg text-slate-400 leading-relaxed max-w-xl">
              Controla combustible, diarios de obra, costos y producción en tiempo real desde una sola plataforma modular. Diseñada para trabajar en terreno, incluso sin cobertura.
            </p>

            {/* Beneficios clave */}
            <div className="space-y-4 pt-2">
              {[
                { title: "Control de Combustible", desc: "Seguimiento de consumos y cargas por surtidor con geolocalización." },
                { title: "Diario de Obra Digital", desc: "Tus operadores reportan tareas y horas en terreno en segundos." },
                { title: "Modo Offline PWA", desc: "Guarda datos de forma segura sin señal y sincroniza al detectar internet." },
              ].map((item, idx) => (
                <div key={idx} className="flex items-start gap-3">
                  <div 
                    className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-1"
                    style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)' }}
                  >
                    <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div>
                    <h4 className="text-slate-200 font-bold text-sm">{item.title}</h4>
                    <p className="text-slate-400 text-xs mt-0.5 leading-relaxed">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-4 pt-4">
              <button 
                onClick={onCTA}
                className="px-6 py-3.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl transition-all text-sm hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-blue-600/20"
              >
                Ingresar al Dashboard
              </button>
              <a 
                href="#modulos" 
                onClick={(e) => handleScroll(e, 'modulos')}
                className="px-6 py-3.5 border border-slate-700 hover:border-slate-500 text-slate-300 hover:text-white font-semibold rounded-xl transition-all text-sm"
                style={{ backgroundColor: 'rgba(255,255,255,0.02)' }}
              >
                Ver módulos y precios
              </a>
            </div>
          </div>

          {/* Hero Right — Mock UI de FleetCore */}
          <div className="lg:col-span-5 hidden lg:block animate-fadeIn">
            <div 
              className="border rounded-2xl overflow-hidden shadow-2xl backdrop-blur-sm transition-all hover:scale-[1.01] hover:border-blue-500/30"
              style={{ 
                backgroundColor: 'rgba(15, 28, 46, 0.6)', 
                borderColor: 'rgba(255, 255, 255, 0.08)' 
              }}
            >
              {/* Window bar */}
              <div 
                className="px-4 py-3 flex items-center gap-2 border-b"
                style={{ 
                  backgroundColor: 'rgba(10, 22, 40, 0.8)', 
                  borderColor: 'rgba(255, 255, 255, 0.08)' 
                }}
              >
                <div className="w-3 h-3 rounded-full bg-red-500/70" />
                <div className="w-3 h-3 rounded-full bg-yellow-500/70" />
                <div className="w-3 h-3 rounded-full bg-green-500/70" />
                <div className="ml-4 bg-slate-800/80 rounded-md px-3 py-1 text-[10px] text-slate-400 font-mono">
                  fleetcore.app / dashboard
                </div>
              </div>

              {/* Mock Content */}
              <div className="p-5 space-y-4">
                {/* Status Bar */}
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: "Equipos Activos", value: "14 / 18", color: "text-blue-400" },
                    { label: "Consumo Hoy", value: "385 L", color: "text-amber-400" },
                    { label: "Operadores", value: "9 en turno", color: "text-emerald-400" }
                  ].map((item, i) => (
                    <div key={i} className="bg-slate-900/60 rounded-xl p-3 border border-slate-800/60 text-center">
                      <p className="text-[10px] text-slate-400 font-semibold">{item.label}</p>
                      <p className={`text-sm sm:text-base font-black mt-1 ${item.color || 'text-white'}`}>{item.value}</p>
                    </div>
                  ))}
                </div>

                {/* Active Machinery List */}
                <div className="space-y-2">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Estado de Maquinaria</p>
                  
                  {[
                    { name: "Excavadora CAT 320D", status: "Operando", details: "1.240 hrs · 85% Combustible", badgeBg: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
                    { name: "Cargador Frontal Volvo L120", status: "Operando", details: "920 hrs · Alerta filtro aire", badgeBg: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
                    { name: "Camión Tolva Mercedes-Benz", status: "Mantención", details: "Frenos · Taller Central", badgeBg: "bg-red-500/10 text-red-400 border-red-500/20" }
                  ].map((mach, i) => (
                    <div key={i} className="bg-slate-900/40 border border-slate-800/40 rounded-xl p-3 flex items-center justify-between">
                      <div>
                        <p className="text-white text-xs font-bold">{mach.name}</p>
                        <p className="text-slate-400 text-[10px] mt-0.5">{mach.details}</p>
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${mach.badgeBg}`}>
                        {mach.status}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Recent Activity / Fuel entry */}
                <div className="bg-gradient-to-r from-blue-900/20 to-slate-900/20 border border-blue-500/10 rounded-xl p-3 flex items-center gap-3">
                  <span className="text-base">⛽</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-xs font-bold truncate">Último Reporte de Combustible</p>
                    <p className="text-slate-400 text-[10px] truncate">Mochila Petromax · 120 Litros · Antonio A.</p>
                  </div>
                  <div className="text-blue-400 text-[10px] font-bold whitespace-nowrap">Hace 4 min</div>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}
