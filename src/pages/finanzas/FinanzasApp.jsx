import React, { useState } from "react";
import FinanzasDashboard from "./FinanzasDashboard";
import FinanzasFlujoCaja from "./FinanzasFlujoCaja";
import FinanzasCostos from "./FinanzasCostos";
import FinanzasActivos from "./FinanzasActivos";
import FinanzasProveedores from "./FinanzasProveedores";
import FinanzasObras from "./FinanzasObras";
import FinanzasReportes from "./FinanzasReportes";
import FinanzasDeuda from "./FinanzasDeuda";
import { FinanzasProvider, NotificacionesBtn, useFinanzas } from "./FinanzasContext";
import NotificacionesDrawer from "./NotificacionesDrawer";
import UserMenuDropdown from "../../components/UserMenuDropdown";
import { useEmpresa } from "../../lib/useEmpresa";

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
    id: "deuda",
    label: "Deuda & Plan de Pagos",
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
        d="M9 14l6-6m-5.5-.5h.01M14.5 14.5h.01M21 12c0 4.97-4.03 9-9 9s-9-4.03-9-9 4.03-9 9-9 9 4.03 9 9z" />
    ),
  },

  {
    id: "obras",
    label: "Obras",
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
        d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
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

function FinanzasAppInner({ user, userRole, onLogout, onBackToSelector }) {
  const [activeView, setActiveView] = useState("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { alertas } = useFinanzas();
  const { empresa } = useEmpresa();

  // Badge para Activos: docs vencidos/por vencer + activos sin datos financieros
  const badgeActivos = alertas.filter(a =>
    a.categoria === "activo_doc" || a.categoria === "activo_sin_datos"
  ).length;
  const badgeActivosCritico = alertas.filter(a =>
    a.categoria === "activo_doc" && a.tipo === "danger"
  ).length > 0;

  // Badge para Deuda: documentos/proveedores con deuda vencida
  const badgeDeuda = alertas.filter(a => a.categoria === "deuda_vencida").length;
  const badgeDeudaCritico = badgeDeuda > 0;

  const currentNav = NAV_ITEMS.find((n) => n.id === activeView);

  function getBadgeFor(itemId) {
    if (itemId === "activos" && badgeActivos > 0) {
      return { count: badgeActivos, critico: badgeActivosCritico };
    }
    if (itemId === "deuda" && badgeDeuda > 0) {
      return { count: badgeDeuda, critico: badgeDeudaCritico };
    }
    return null;
  }

  function renderView() {
    switch (activeView) {
      case "dashboard":    return <FinanzasDashboard onNavigate={setActiveView} />;
      case "flujo":        return <FinanzasFlujoCaja />;
      case "costos":       return <FinanzasCostos />;
      case "activos":      return <FinanzasActivos />;
      case "proveedores":  return <FinanzasProveedores />;
      case "deuda":        return <FinanzasDeuda />;
      case "obras":        return <FinanzasObras />;
      case "reportes":     return <FinanzasReportes />;
      default:             return <FinanzasDashboard onNavigate={setActiveView} />;
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex">

      {/* ── Sidebar desktop ── */}
      <aside className="hidden lg:flex flex-col w-64 bg-white border-r border-slate-200 shadow-sm sticky top-0 h-screen">
        {/* Logo + empresa */}
        <div className="flex flex-col items-center px-4 py-4 border-b border-slate-100 gap-3">
          <img src="/logo-fleetcore-f.png" alt="FleetCore Finanzas" className="h-20 w-auto object-contain" />
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

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const active = activeView === item.id;
            const badge = getBadgeFor(item.id);
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
                <span className="flex-1 text-left">{item.label}</span>
                {badge && (
                  <span className={`min-w-4 h-4 px-1 rounded-full text-white text-[10px] font-black flex items-center justify-center ${
                    badge.critico ? "bg-red-500" : "bg-amber-500"
                  }`}>
                    {badge.count > 9 ? "9+" : badge.count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Footer usuario */}
        <div className="px-3 py-3 border-t border-slate-100">
          <div className="flex items-center gap-2 mb-2">
            <NotificacionesBtn />
          </div>
          <UserMenuDropdown
            user={user}
            userRole={userRole}
            onLogout={onLogout}
            onBackToSelector={onBackToSelector}
            placement="top-left"
          />
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
                const badge = getBadgeFor(item.id);
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
                    <span className="flex-1 text-left">{item.label}</span>
                    {badge && (
                      <span className={`min-w-4 h-4 px-1 rounded-full text-white text-[10px] font-black flex items-center justify-center ${
                        badge.critico ? "bg-red-500" : "bg-amber-500"
                      }`}>
                        {badge.count > 9 ? "9+" : badge.count}
                      </span>
                    )}
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
              <NotificacionesBtn />
              <UserMenuDropdown
                user={user}
                userRole={userRole}
                onLogout={onLogout}
                onBackToSelector={onBackToSelector}
              />
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
            "Flujo de Caja": "flujo",
            "Costos":        "costos",
            "Activos":       "activos",
            "Proveedores":   "proveedores",
            "Deuda":         "deuda",
            "Obras":         "obras",
            "Reportes":      "reportes",
          };
          if (mapa[vista]) { setActiveView(mapa[vista]); setSidebarOpen(false); }
        }}
      />
    </div>
  );
}

export default function FinanzasApp(props) {
  return (
    <FinanzasProvider>
      <FinanzasAppInner {...props} />
    </FinanzasProvider>
  );
}
