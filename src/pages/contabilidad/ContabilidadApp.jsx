import React, { useState } from "react";
import { ContabilidadProvider, useContabilidad } from "./ContabilidadContext";
import ContabilidadPlanCuentas from "./ContabilidadPlanCuentas";
import ContabilidadLibroDiario from "./ContabilidadLibroDiario";
import ContabilidadEstados from "./ContabilidadEstados";
import ContabilidadTributario from "./ContabilidadTributario";
import ContabilidadActivos from "./ContabilidadActivos";

// ─── Navegación interna ───────────────────────────────────────────────────────
const NAV_ITEMS = [
  {
    id: "plan",
    label: "Plan de Cuentas",
    short: "Plan",
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
    ),
  },
  {
    id: "diario",
    label: "Libro Diario",
    short: "Diario",
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    ),
  },
  {
    id: "estados",
    label: "Estados Financieros",
    short: "Estados",
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
        d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    ),
  },
  {
    id: "tributario",
    label: "Tributario",
    short: "Trib.",
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
        d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
    ),
  },
  {
    id: "activos",
    label: "Activos Fijos",
    short: "Activos",
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
        d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
    ),
  },
];

// ─── Badge de alertas contables ───────────────────────────────────────────────
function AlertasBadge() {
  const { asientos, cuentas } = useContabilidad();
  // Asientos descuadrados (no deberían existir, pero por si acaso)
  const alertas = asientos.filter(a => {
    const debe  = (a.lineas || []).reduce((s, l) => s + (parseFloat(l.debe)  || 0), 0);
    const haber = (a.lineas || []).reduce((s, l) => s + (parseFloat(l.haber) || 0), 0);
    return Math.abs(debe - haber) > 0.01;
  }).length;
  if (!alertas) return null;
  return (
    <span className="ml-1.5 min-w-4 h-4 px-0.5 rounded-full bg-red-500 text-white text-[9px] font-black flex items-center justify-center">
      {alertas}
    </span>
  );
}

// ─── Inner app ────────────────────────────────────────────────────────────────
function ContabilidadAppInner({ user, onBackToSelector, onLogout }) {
  const [activeView, setActiveView] = useState("plan");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const currentNav = NAV_ITEMS.find(n => n.id === activeView);

  function renderView() {
    switch (activeView) {
      case "plan":       return <ContabilidadPlanCuentas />;
      case "diario":     return <ContabilidadLibroDiario />;
      case "estados":    return <ContabilidadEstados />;
      case "tributario": return <ContabilidadTributario />;
      case "activos":    return <ContabilidadActivos />;
      default:           return <ContabilidadPlanCuentas />;
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex">

      {/* ── Sidebar desktop ── */}
      <aside className="hidden lg:flex flex-col w-64 bg-white border-r border-slate-200 shadow-sm sticky top-0 h-screen">
        <div className="flex items-center justify-center px-4 py-5 border-b border-slate-100">
          <img src="/logo-fleetcore-f.png" alt="FleetCore Contabilidad" className="h-28 w-auto object-contain" />
        </div>

        {/* Badge módulo */}
        <div className="px-4 py-3 border-b border-slate-100">
          <div className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-purple-50 to-violet-50 rounded-xl border border-purple-100">
            <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-purple-700 to-violet-600 flex items-center justify-center">
              <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <p className="text-[10px] font-black text-purple-600 uppercase tracking-wider leading-none">Módulo</p>
              <p className="text-xs font-black text-slate-800">Contabilidad</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map(item => {
            const active = activeView === item.id;
            return (
              <button key={item.id} onClick={() => setActiveView(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all ${active ? "bg-purple-700 text-white shadow-md shadow-purple-200" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"}`}>
                <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  {item.icon}
                </svg>
                <span className="flex-1 text-left">{item.label}</span>
                {item.id === "diario" && <AlertasBadge />}
              </button>
            );
          })}
        </nav>

        <div className="px-4 py-4 border-t border-slate-100">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-700 to-violet-600 flex items-center justify-center text-white text-xs font-black">
              {user?.email?.[0]?.toUpperCase() || "U"}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-bold text-slate-800 truncate">{user?.displayName || user?.email?.split("@")[0]}</div>
              <div className="text-[10px] text-slate-400 truncate">{user?.email}</div>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={onBackToSelector}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-xs font-semibold text-slate-600 transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
              Menú
            </button>
            <button onClick={onLogout}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-slate-100 hover:bg-red-50 hover:text-red-600 rounded-lg text-xs font-semibold text-slate-600 transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Salir
            </button>
          </div>
        </div>
      </aside>

      {/* ── Sidebar móvil overlay ── */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-64 bg-white shadow-2xl flex flex-col">
            <div className="px-4 py-5 border-b border-slate-100 flex items-center justify-between">
              <img src="/logo-fleetcore-f.png" alt="FleetCore" className="h-16 w-auto object-contain" />
              <button onClick={() => setSidebarOpen(false)} className="p-1.5 hover:bg-slate-100 rounded-lg">
                <svg className="w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
              {NAV_ITEMS.map(item => {
                const active = activeView === item.id;
                return (
                  <button key={item.id} onClick={() => { setActiveView(item.id); setSidebarOpen(false); }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all ${active ? "bg-purple-700 text-white shadow-md shadow-purple-200" : "text-slate-600 hover:bg-slate-100"}`}>
                    <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      {item.icon}
                    </svg>
                    <span className="flex-1 text-left">{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </aside>
        </div>
      )}

      {/* ── Contenido principal ── */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Header móvil */}
        <header className="lg:hidden sticky top-0 z-40 bg-white border-b border-slate-200 shadow-sm">
          <div className="px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button onClick={() => setSidebarOpen(true)} className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
                <svg className="w-5 h-5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              <div>
                <div className="text-sm font-black text-slate-800 leading-tight">Fleet<span className="text-purple-700">Core-C</span></div>
                <div className="text-[9px] font-bold tracking-widest text-slate-400 uppercase">{currentNav?.label}</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={onBackToSelector} className="p-2 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors text-slate-600">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              <button onClick={onLogout} className="p-2 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors text-slate-600">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </button>
            </div>
          </div>
        </header>

        {/* Vista activa */}
        <main className="flex-1 overflow-y-auto">
          {renderView()}
        </main>
      </div>
    </div>
  );
}

// ─── Export con Provider ──────────────────────────────────────────────────────
export default function ContabilidadApp(props) {
  return (
    <ContabilidadProvider>
      <ContabilidadAppInner {...props} />
    </ContabilidadProvider>
  );
}
