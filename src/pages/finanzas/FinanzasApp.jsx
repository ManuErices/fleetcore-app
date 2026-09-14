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
import AppShellLayout from "../../components/AppShellLayout";

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

// Mapa: vista activa (activeView) → valor `accion` que llevan las alertas.
// Debe coincidir con los `accion` definidos en FinanzasContext (recalcularAlertas).
const VIEW_TO_ACCION = {
  dashboard:   null,            // el dashboard resume todo; no filtra
  flujo:       "Flujo de Caja",
  costos:      "Costos",
  activos:     "Activos",
  proveedores: "Proveedores",
  deuda:       "Deuda",
  obras:       "Obras",
  reportes:    "Reportes",
};

function FinanzasAppInner({ user, userRole, onLogout, onBackToSelector, onAdminPanel, onAdminEmpresaPanel }) {
  const [activeView, setActiveView] = useState("dashboard");
  const { alertas } = useFinanzas();

  // Contadores por ítem. El módulo los calcula y el shell solo los pinta: qué
  // cuenta como alerta de Costos es asunto de Finanzas, no de la cáscara.
  const badgeActivos = alertas.filter(a => a.categoria === "activo_sin_datos").length;
  const badgeDeuda   = alertas.filter(a => a.categoria === "deuda_vencida").length;
  const badgeCostos  = alertas.filter(a =>
    a.categoria === "costo_fijo" || a.categoria === "costo_doc").length;
  const costosCritico = alertas.some(a =>
    (a.categoria === "costo_fijo" || a.categoria === "costo_doc") && a.tipo === "danger");

  const BADGES = {
    activos: { badge: badgeActivos, badgeCritico: false },          // "sin datos" es informativo
    deuda:   { badge: badgeDeuda,   badgeCritico: badgeDeuda > 0 },
    costos:  { badge: badgeCostos,  badgeCritico: costosCritico },
  };

  // Lista plana: un solo grupo sin etiqueta, así el shell no dibuja encabezados.
  const navGroups = [{
    label: "",
    tabs: NAV_ITEMS.map(item => ({ ...item, ...(BADGES[item.id] || {}) })),
  }];

  const currentNav = NAV_ITEMS.find(n => n.id === activeView);

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
    <>
      <AppShellLayout
        navGroups={navGroups}
        activeId={activeView}
        onSelect={setActiveView}
        marca={{ titulo: "Fleet", resalte: "Core-F", subtitulo: "Finanzas", logoSrc: "/logo-fleetcore-f.png" }}
        footerSlot={<NotificacionesBtn />}
        user={user} userRole={userRole} onLogout={onLogout}
        onBackToSelector={onBackToSelector}
        onAdminPanel={onAdminPanel} onAdminEmpresaPanel={onAdminEmpresaPanel}
      >
        {renderView()}
      </AppShellLayout>

      {/* Centro de notificaciones. Va fuera del shell porque es un drawer a
          pantalla completa, no contenido de la sección. */}
      <NotificacionesDrawer
        seccionActiva={VIEW_TO_ACCION[activeView] || null}
        seccionLabel={currentNav?.label}
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
          if (mapa[vista]) setActiveView(mapa[vista]);
        }}
      />
    </>
  );
}

export default function FinanzasApp(props) {
  return (
    <FinanzasProvider>
      <FinanzasAppInner {...props} />
    </FinanzasProvider>
  );
}
