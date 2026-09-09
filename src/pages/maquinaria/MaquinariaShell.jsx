import React, { useState, useEffect, useRef } from "react";
import { Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
import { useEmpresa } from "../../lib/useEmpresa";
import AppShellLayout from "../../components/AppShellLayout";
import { MaquinariaFilterProvider, useMaquinariaFilter } from "../../components/maquinaria/MaquinariaFilterContext";
import { buildMaquinariaAlerts } from "../../components/maquinaria/maquinariaAlerts";
import OrdenesTrabajo from "./OrdenesTrabajo";
import MaquinariaDashboard from "./MaquinariaDashboard";
import Equipos from "./Equipos";
import Repuestos from "./Repuestos";
import Fallas from "./Fallas";
import MaquinariaConfig from "./MaquinariaConfig";
import RentalTablero from "./RentalTablero";
import RentalClientes from "./RentalClientes";
import RentalContratos from "./RentalContratos";
import RentalCotizaciones from "./RentalCotizaciones";
import RentalPagos from "./RentalPagos";
import RentalRentabilidad from "./RentalRentabilidad";
import MaquinariaAlertas from "./MaquinariaAlertas";

// ============================================================
// MaquinariaShell — contenedor del módulo Maquinaria
//
// La barra lateral la dibuja AppShellLayout, igual que el resto de los
// módulos. Antes eran pestañas horizontales con menús desplegables: con trece
// destinos repartidos en Rental y Taller, la barra lateral los muestra todos a
// la vez y ya no hay que abrir un dropdown para saber qué existe.
//
// Este archivo se quedó con lo propio del módulo: el catálogo de destinos, las
// rutas, el filtro de proyecto y la campana de alertas.
// ============================================================

// Los iconos son el `d` de un path; el shell acepta también nodos JSX.
const IC = {
  dashboard:    "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6",
  tablero:      "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z",
  rentabilidad: "M13 7h8m0 0v8m0-8l-8 8-4-4-6 6",
  cotizacion:   "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
  contrato:     "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4",
  pagos:        "M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z",
  clientes:     "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z",
  equipos:      "M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0zM13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1",
  ordenes:      "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
  fallas:       "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z",
  repuestos:    "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z",
  config:       "M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4",
};

export default function MaquinariaShell(props) {
  return (
    <MaquinariaFilterProvider>
      <MaquinariaShellInner {...props} />
    </MaquinariaFilterProvider>
  );
}

function MaquinariaShellInner({ user, userRole, onLogout, onBackToSelector, onAdminPanel, onAdminEmpresaPanel }) {
  const { empresaId } = useEmpresa();
  const { projectId, setProjectId, projects } = useMaquinariaFilter();
  const navigate = useNavigate();
  const [alerts, setAlerts] = useState([]);
  const canGoToAdmin = ["superadmin", "admin_contrato", "administrativo"].includes(userRole);
  const isMecanico = userRole === "mecanico";

  useEffect(() => {
    if (!empresaId || isMecanico) return;
    let cancel = false;
    (async () => {
      try {
        const { alerts } = await buildMaquinariaAlerts(empresaId);
        if (!cancel) setAlerts(alerts || []);
      } catch { /* silencioso */ }
    })();
    return () => { cancel = true; };
  }, [empresaId, isMecanico]);

  // El mecánico solo ve sus órdenes: un menú con trece destinos que no puede
  // abrir es ruido, no información.
  const navGroups = isMecanico
    ? [{ label: "", tabs: [{ id: "ordenes-trabajo", label: "Mis Órdenes de Trabajo", icon: IC.ordenes }] }]
    : [
        { label: "", tabs: [
          { id: "dashboard", label: "Dashboard", icon: IC.dashboard },
          { id: "alertas",   label: "Alertas",   icon: IC.fallas, badge: alerts.length, badgeCritico: alerts.some(a => a.severidad === "critica") },
        ]},
        { label: "Rental", tabs: [
          { id: "rental",       label: "Tablero Rental",  icon: IC.tablero },
          { id: "rentabilidad", label: "Rentabilidad",    icon: IC.rentabilidad },
          { id: "cotizaciones", label: "Cotizaciones",    icon: IC.cotizacion },
          { id: "contratos",    label: "Contratos",       icon: IC.contrato },
          { id: "pagos",        label: "Estados de pago", icon: IC.pagos },
          { id: "clientes",     label: "Clientes",        icon: IC.clientes },
          { id: "equipos",      label: "Equipos",         icon: IC.equipos },
        ]},
        { label: "Taller", tabs: [
          { id: "ordenes-trabajo", label: "Órdenes de Trabajo", icon: IC.ordenes },
          { id: "fallas",          label: "Fallas",             icon: IC.fallas },
          { id: "repuestos",       label: "Repuestos",          icon: IC.repuestos },
          { id: "config",          label: "Configuración",      icon: IC.config },
        ]},
      ];

  const inicio = isMecanico ? "/maquinaria/ordenes-trabajo" : "/maquinaria/dashboard";

  return (
    <AppShellLayout
      navGroups={navGroups}
      basePath="/maquinaria"
      marca={{
        titulo: "Fleet", resalte: "Core", subtitulo: "Maquinaria",
        gradiente: "linear-gradient(135deg,#dc2626,#e11d48)",
        iconoPath: "M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z",
      }}
      // El filtro de proyecto aplica a todo el módulo, así que vive en la barra
      // y no dentro de cada pantalla.
      headerSlot={!isMecanico && (
        <select
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          className="w-full border border-slate-200 rounded-xl px-2.5 py-2 text-xs font-semibold text-slate-700 bg-white"
          title="Filtrar el módulo por proyecto"
        >
          <option value="">Todos los proyectos</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      )}
      footerSlot={!isMecanico && <AlertBell alerts={alerts} navigate={navigate} />}
      user={user} userRole={userRole} onLogout={onLogout}
      onBackToSelector={onBackToSelector}
      onAdminPanel={canGoToAdmin ? onAdminPanel : undefined}
      onAdminEmpresaPanel={canGoToAdmin ? onAdminEmpresaPanel : undefined}
    >
      <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-[1500px] mx-auto">
        <Routes>
          <Route path="/" element={<Navigate to={inicio} replace />} />
          {!isMecanico && <Route path="/dashboard" element={<MaquinariaDashboard />} />}
          <Route path="/ordenes-trabajo" element={<OrdenesTrabajo />} />
          <Route path="/equipos" element={<Equipos />} />
          {!isMecanico && <Route path="/rental" element={<RentalTablero />} />}
          {!isMecanico && <Route path="/rentabilidad" element={<RentalRentabilidad />} />}
          {!isMecanico && <Route path="/contratos" element={<RentalContratos />} />}
          {!isMecanico && <Route path="/cotizaciones" element={<RentalCotizaciones />} />}
          {!isMecanico && <Route path="/pagos" element={<RentalPagos />} />}
          {!isMecanico && <Route path="/clientes" element={<RentalClientes />} />}
          <Route path="/repuestos" element={<Repuestos />} />
          <Route path="/fallas" element={<Fallas />} />
          {!isMecanico && <Route path="/config" element={<MaquinariaConfig />} />}
          {!isMecanico && <Route path="/alertas" element={<MaquinariaAlertas />} />}
          <Route path="*" element={<Navigate to={inicio} replace />} />
        </Routes>
      </div>
    </AppShellLayout>
  );
}

// ============================================================
function AlertBell({ alerts, navigate }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const location = useLocation();

  const SEV = {
    critica: "bg-red-500",
    alta: "bg-orange-500",
    media: "bg-amber-500",
  };
  const RUTA_POR_TIPO = {
    documento: "/maquinaria/equipos",
    contrato: "/maquinaria/contratos",
    mantencion: "/maquinaria/equipos",
    stock: "/maquinaria/repuestos",
  };

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);
  useEffect(() => { setOpen(false); }, [location.pathname]);

  const count = alerts.length;
  const visibles = alerts.slice(0, 8);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 rounded-lg hover:bg-slate-100 transition-colors"
        title="Alertas"
      >
        <svg className="w-5 h-5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-black flex items-center justify-center">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 bg-white border-2 border-slate-100 rounded-2xl shadow-xl overflow-hidden z-50">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <span className="text-sm font-black text-slate-900">Alertas</span>
            <span className="text-xs font-bold text-slate-400">{count}</span>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {count === 0 ? (
              <div className="px-4 py-8 text-center">
                <p className="text-2xl mb-1">✅</p>
                <p className="text-sm text-slate-500 font-semibold">Todo en orden</p>
              </div>
            ) : (
              visibles.map((a) => (
                <button
                  key={a.id}
                  onClick={() => { setOpen(false); navigate(RUTA_POR_TIPO[a.tipo] || "/maquinaria"); }}
                  className="w-full text-left px-4 py-3 border-b border-slate-50 last:border-0 hover:bg-slate-50 flex items-start gap-2.5"
                >
                  <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${SEV[a.severidad] || "bg-slate-400"}`} />
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-900">{a.titulo}</p>
                    <p className="text-xs text-slate-500 truncate">{a.detalle}</p>
                  </div>
                </button>
              ))
            )}
          </div>

          {count > 0 && (
            <button
              onClick={() => { setOpen(false); navigate("/maquinaria/alertas"); }}
              className="w-full px-4 py-3 text-sm font-bold text-red-600 hover:bg-red-50 border-t border-slate-100"
            >
              Ver todas las alertas{count > visibles.length ? ` (${count})` : ""}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
