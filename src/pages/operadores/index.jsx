import { useState } from 'react';
import ReportDetallado from './ReportDetallado';
import CombustiblePage from './CombustiblePage';

function getSaludo() {
  const h = new Date().getHours();
  if (h < 12) return 'Buenos días';
  if (h < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

function SubHeader({ titulo, onBack, accent }) {
  return (
    <header
      className="sticky top-0 z-40 flex items-center gap-3 px-4 py-3 border-b border-white/10"
      style={{ background: 'rgba(10,14,26,0.92)', backdropFilter: 'blur(16px)' }}
    >
      <button
        onClick={onBack}
        className="w-9 h-9 rounded-xl flex items-center justify-center transition-all active:scale-90"
        style={{ background: accent + '22', border: `1.5px solid ${accent}55` }}
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke={accent} strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
      </button>
      <span className="font-black text-white text-sm tracking-wide">{titulo}</span>
    </header>
  );
}

export default function OperadoresApp({ user, onLogout, onBackToSelector }) {
  const [vista, setVista] = useState('menu');
  const nombre = user?.displayName || user?.email?.split('@')[0] || 'Operador';
  const inicial = nombre.charAt(0).toUpperCase();

  if (vista === 'maquinaria') {
    return (
      <div className="min-h-screen" style={{ background: '#0A0E1A' }}>
        <SubHeader titulo="Reporte Maquinaria" onBack={() => setVista('menu')} accent="#818CF8" />
        <ReportDetallado onClose={() => setVista('menu')} />
      </div>
    );
  }

  if (vista === 'combustible') {
    return (
      <div className="min-h-screen" style={{ background: '#0A0E1A' }}>
        <SubHeader titulo="Reporte Combustible" onBack={() => setVista('menu')} accent="#FB923C" />
        <CombustiblePage onClose={() => setVista('menu')} />
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex flex-col overflow-hidden relative"
      style={{ background: '#0A0E1A', fontFamily: "'DM Sans', system-ui, sans-serif" }}
    >
      {/* Fondo decorativo */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-32 -right-32 w-80 h-80 rounded-full opacity-20"
          style={{ background: 'radial-gradient(circle, #6366F1 0%, transparent 70%)' }} />
        <div className="absolute -bottom-20 -left-20 w-64 h-64 rounded-full opacity-15"
          style={{ background: 'radial-gradient(circle, #FB923C 0%, transparent 70%)' }} />
        <svg className="absolute inset-0 w-full h-full opacity-[0.04]" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="white" strokeWidth="0.5"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>
      </div>

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-5 pt-12 pb-2">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #6366F1, #8B5CF6)' }}>
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
            </svg>
          </div>
          <span className="text-white font-black text-sm tracking-tight">
            WorkFleet<span style={{ color: '#818CF8' }}>-M</span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onBackToSelector}
            className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all active:scale-95"
            style={{ background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.1)' }}>
            Cambiar app
          </button>
          <button onClick={onLogout}
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-all active:scale-95"
            style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)' }}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="rgba(255,255,255,0.5)" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        </div>
      </header>

      {/* Saludo */}
      <div className="relative z-10 px-5 pt-10 pb-8">
        <p className="text-xs font-bold tracking-widest uppercase" style={{ color: '#6366F1' }}>
          {getSaludo()}
        </p>
        <div className="flex items-center gap-3 mt-2">
          <div className="w-11 h-11 rounded-2xl flex items-center justify-center font-black text-lg text-white flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)' }}>
            {inicial}
          </div>
          <div>
            <h1 className="text-white font-black text-2xl leading-tight">{nombre}</h1>
            <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>
              {new Date().toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })}
            </p>
          </div>
        </div>
      </div>

      {/* Label sección */}
      <div className="relative z-10 px-5 mb-4">
        <p className="text-xs font-bold tracking-widest uppercase" style={{ color: 'rgba(255,255,255,0.3)' }}>
          Registros disponibles
        </p>
      </div>

      {/* Tarjetas */}
      <div className="relative z-10 flex-1 px-5 flex flex-col gap-3 pb-12">

        {/* Maquinaria */}
        <button onClick={() => setVista('maquinaria')}
          className="w-full text-left rounded-2xl overflow-hidden transition-all active:scale-95 relative"
          style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.15) 0%, rgba(139,92,246,0.08) 100%)', border: '1.5px solid rgba(99,102,241,0.3)' }}>
          <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl"
            style={{ background: 'linear-gradient(180deg, #6366F1, #8B5CF6)' }} />
          <div className="flex items-center gap-4 p-5 pl-6">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)', boxShadow: '0 8px 24px rgba(99,102,241,0.4)' }}>
              <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
              </svg>
            </div>
            <div className="flex-1">
              <div className="font-black text-white text-base">Reporte Maquinaria</div>
              <div className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>Registro diario de equipos y horómetro</div>
              <div className="inline-flex items-center gap-1 mt-2 px-2 py-0.5 rounded-full text-[10px] font-bold"
                style={{ background: 'rgba(99,102,241,0.2)', color: '#818CF8' }}>
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
                Activo
              </div>
            </div>
            <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="rgba(255,255,255,0.25)" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </button>

        {/* Combustible */}
        <button onClick={() => setVista('combustible')}
          className="w-full text-left rounded-2xl overflow-hidden transition-all active:scale-95 relative"
          style={{ background: 'linear-gradient(135deg, rgba(251,146,60,0.15) 0%, rgba(245,158,11,0.08) 100%)', border: '1.5px solid rgba(251,146,60,0.3)' }}>
          <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl"
            style={{ background: 'linear-gradient(180deg, #FB923C, #F59E0B)' }} />
          <div className="flex items-center gap-4 p-5 pl-6">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'linear-gradient(135deg, #FB923C 0%, #F59E0B 100%)', boxShadow: '0 8px 24px rgba(251,146,60,0.4)' }}>
              <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 16.121A3 3 0 1012.015 11L11 14H9c0 .768.293 1.536.879 2.121z" />
              </svg>
            </div>
            <div className="flex-1">
              <div className="font-black text-white text-base">Reporte Combustible</div>
              <div className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>Registro de carga en surtidor</div>
              <div className="inline-flex items-center gap-1 mt-2 px-2 py-0.5 rounded-full text-[10px] font-bold"
                style={{ background: 'rgba(251,146,60,0.2)', color: '#FB923C' }}>
                <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />
                Activo
              </div>
            </div>
            <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="rgba(255,255,255,0.25)" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </button>

      </div>

      {/* Footer */}
      <div className="relative z-10 px-5 pb-8 text-center">
        <p className="text-[10px] font-semibold" style={{ color: 'rgba(255,255,255,0.15)' }}>
          WorkFleet-M · FleetCore © 2026
        </p>
      </div>
    </div>
  );
}
