import React from "react";
import RRHH from "./index";

export default function RRHHShell({ user, onLogout, onBackToSelector }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-[1400px] mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-600 to-teal-700 flex items-center justify-center shadow">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <div>
              <div className="text-sm font-black text-slate-800 leading-tight">Fleet<span className="text-emerald-600">Core</span></div>
              <div className="text-[9px] font-bold tracking-widest text-slate-400 uppercase leading-tight">El Núcleo de RRHH</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden sm:block text-sm text-slate-500 font-medium">{user?.displayName || user?.email?.split('@')[0]}</span>
            <button onClick={onBackToSelector} className="px-3 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors text-slate-600" title="Cambiar aplicación">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
            </button>
            <button onClick={onLogout} className="px-3 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors text-slate-600" title="Cerrar sesión">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
            </button>
          </div>
        </div>
      </header>
      <RRHH />
    </div>
  );
}
