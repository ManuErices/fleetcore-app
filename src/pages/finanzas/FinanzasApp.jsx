import React, { useState } from "react";
import FinanzasDashboard from "./FinanzasDashboard";
import FinanzasFlujoCaja from "./FinanzasFlujoCaja";
import FinanzasCostos from "./FinanzasCostos";
import FinanzasActivos from "./FinanzasActivos";
import FinanzasProveedores from "./FinanzasProveedores";
import FinanzasReportes from "./FinanzasReportes";
import { FinanzasProvider, NotificacionesBtn } from "./FinanzasContext";
import NotificacionesDrawer from "./NotificacionesDrawer";

const NAV_ITEMS = [
  {
    id: "dashboard",
    label: "Dashboard",
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
        d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    ),
  },
  {
    id: "flujo",
    label: "Flujo de Caja",
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
        d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
    ),
  },
  {
    id: "costos",
    label: "Costos",
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
        d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
    ),
  },
  {
    id: "activos",
    label: "Activos",
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
        d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
    ),
  },
  {
    id: "proveedores",
    label: "Proveedores",
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
        d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
    ),
  },

  {
    id: "reportes",
    label: "Reportes",
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
        d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    ),
  },
];

export default function FinanzasApp({ user, onLogout, onBackToSelector }) {
  const [activeView, setActiveView] = useState("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const currentNav = NAV_ITEMS.find((n) => n.id === activeView);

  function renderView() {
    switch (activeView) {
      case "dashboard":    return <FinanzasDashboard onNavigate={setActiveView} />;
      case "flujo":        return <FinanzasFlujoCaja />;
      case "costos":       return <FinanzasCostos />;
      case "activos":      return <FinanzasActivos />;
      case "proveedores":  return <FinanzasProveedores />;

      case "reportes":     return <FinanzasReportes />;
      default:             return <FinanzasDashboard onNavigate={setActiveView} />;
    }
  }

  return (
    <FinanzasProvider>
    <div className="min-h-screen bg-slate-50 flex">

      {/* ── Sidebar desktop ── */}
      <aside className="hidden lg:flex flex-col w-64 bg-white border-r border-slate-200 shadow-sm sticky top-0 h-screen">
        {/* Logo */}
        <div className="flex items-center justify-center px-4 py-5 border-b border-slate-100">
          <img src="/logo-fleetcore-f.png" alt="FleetCore Finanzas" className="h-28 w-auto object-contain" />
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const active = activeView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveView(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                  active
                    ? "bg-purple-700 text-white shadow-md shadow-purple-200"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  {item.icon}
                </svg>
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Footer usuario */}
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
            <NotificacionesBtn />
            <button
              onClick={onBackToSelector}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-xs font-semibold text-slate-600 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
              Menú
            </button>
            <button
              onClick={onLogout}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-slate-100 hover:bg-red-50 hover:text-red-600 rounded-lg text-xs font-semibold text-slate-600 transition-colors"
            >
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
            <div className="px-4 py-5 border-b border-slate-100">
              <div className="flex items-center justify-between">
                <img src="/logo-fleetcore-f.png" alt="FleetCore Finanzas" className="h-18 w-auto object-contain" />
                <button onClick={() => setSidebarOpen(false)} className="p-1.5 hover:bg-slate-100 rounded-lg">
                  <svg className="w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
              {NAV_ITEMS.map((item) => {
                const active = activeView === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => { setActiveView(item.id); setSidebarOpen(false); }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                      active
                        ? "bg-purple-700 text-white shadow-md shadow-purple-200"
                        : "text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      {item.icon}
                    </svg>
                    {item.label}
                  </button>
                );
              })}
            </nav>
          </aside>
        </div>
      )}

      {/* ── Contenido principal ── */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Header móvil/tablet */}
        <header className="lg:hidden sticky top-0 z-40 bg-white border-b border-slate-200 shadow-sm">
          <div className="px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSidebarOpen(true)}
                className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <svg className="w-5 h-5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              <div>
                <div className="text-sm font-black text-slate-800 leading-tight">
                  Fleet<span className="text-purple-700">Core-F</span>
                </div>
                <div className="text-[9px] font-bold tracking-widest text-slate-400 uppercase">{currentNav?.label}</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <NotificacionesBtn />
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

        {/* Página activa */}
        <main className="flex-1 overflow-y-auto">
          {renderView()}
        </main>

      </div>

      {/* Centro de notificaciones */}
      <NotificacionesDrawer
        onNavegar={(vista) => {
          const mapa = {
            "Dashboard":     "dashboard",
            "Flujo de Caja": "flujocaja",
            "Costos":        "costos",
            "Activos":       "activos",
            "Proveedores":   "proveedores",
            "Reportes":      "reportes",
          };
          if (mapa[vista]) { setActiveView(mapa[vista]); setSidebarOpen(false); }
        }}
      />
    </div>
    </FinanzasProvider>
  );
}
