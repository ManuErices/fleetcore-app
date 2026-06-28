import React, { useState } from "react";
import { ContabilidadProvider, useContabilidad } from "./ContabilidadContext";
import UserMenuDropdown from "../../components/UserMenuDropdown";
import { useEmpresa } from "../../lib/useEmpresa";
import ContabilidadPlanCuentas from "./ContabilidadPlanCuentas";
import ContabilidadLibroDiario from "./ContabilidadLibroDiario";
import ContabilidadEstados from "./ContabilidadEstados";
import ContabilidadTributario from "./ContabilidadTributario";
import ContabilidadActivos from "./ContabilidadActivos";
import ContabilidadFlujoMensual from "./ContabilidadFlujoMensual";

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
  {
    id: "flujo",
    label: "Flujo Mensual",
    short: "Flujo",
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
        d="M3 17l6-6 4 4 8-8M21 7v4m0-4h-4" />
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
function ContabilidadAppInner({ user, userRole, onBackToSelector, onLogout, onAdminPanel, onAdminEmpresaPanel }) {
  const [activeView, setActiveView] = useState("plan");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { empresa } = useEmpresa();

  const currentNav = NAV_ITEMS.find(n => n.id === activeView);

  function renderView() {
    switch (activeView) {
      case "plan":       return <ContabilidadPlanCuentas />;
      case "diario":     return <ContabilidadLibroDiario />;
      case "estados":    return <ContabilidadEstados />;
      case "tributario": return <ContabilidadTributario />;
      case "activos":    return <ContabilidadActivos />;
      case "flujo":      return <ContabilidadFlujoMensual />;
      default:           return <ContabilidadPlanCuentas />;
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex">

      {/* ── Sidebar desktop ── */}
      <aside className="hidden lg:flex flex-col w-64 bg-white border-r border-slate-200 shadow-sm sticky top-0 h-screen">
        <div className="flex flex-col items-center px-4 py-4 border-b border-slate-100 gap-3">
          <img src="/logo-fleetcore-f.png" alt="FleetCore Contabilidad" className="h-20 w-auto object-contain" />
          {empresa && (
            <div className="w-full flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-50 border border-slate-200">
              {empresa.logoUrl
                ? <img src={empresa.logoUrl} alt="" className="w-5 h-5 rounded object-contain flex-shrink-0" />
                : <div className="w-5 h-5 rounded bg-slate-300 flex items-center justify-center text-[9px] font-black text-slate-600 flex-shrink-0">{empresa.nombre?.[0]}</div>
              }
              <span className="text-xs font-semibold text-slate-700 truncate">{empresa.nombre}</span>
            </div>
          )}
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

        <div className="px-3 py-3 border-t border-slate-100">
          <UserMenuDropdown
            user={user}
            userRole={userRole}
            onLogout={onLogout}
            onBackToSelector={onBackToSelector}
            onAdminPanel={onAdminPanel}
            onAdminEmpresaPanel={onAdminEmpresaPanel}
            placement="top-left"
          />
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
              {empresa && (
                <div className="hidden sm:flex items-center gap-1.5 ml-1 pl-3 border-l border-slate-200">
                  {empresa.logoUrl
                    ? <img src={empresa.logoUrl} alt="" className="w-4 h-4 rounded object-contain" />
                    : <div className="w-4 h-4 rounded bg-slate-200 flex items-center justify-center text-[8px] font-black text-slate-500">{empresa.nombre?.[0]}</div>
                  }
                  <span className="text-xs font-semibold text-slate-600 max-w-[100px] truncate">{empresa.nombre}</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <UserMenuDropdown
                user={user}
                userRole={userRole}
                onLogout={onLogout}
                onBackToSelector={onBackToSelector}
                onAdminPanel={onAdminPanel}
                onAdminEmpresaPanel={onAdminEmpresaPanel}
              />
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
