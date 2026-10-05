import React, { useState, useEffect } from "react";
import FinanzasFlujoCaja from "./FinanzasFlujoCaja";
import FinanzasCostos from "./FinanzasCostos";
import FinanzasActivos from "./FinanzasActivos";
import FinanzasProveedores from "./FinanzasProveedores";
import FinanzasObras from "./FinanzasObras";
import FinanzasReportes from "./FinanzasReportes";
import FinanzasDeuda from "./FinanzasDeuda";
import FinanzasBancos from "./FinanzasBancos";
import FinanzasSemana from "./FinanzasSemana";
import FinanzasPagos from "./FinanzasPagos";
import { FinanzasProvider, NotificacionesBtn, useFinanzas } from "./FinanzasContext";
import NotificacionesDrawer from "./NotificacionesDrawer";
import AppShellLayout from "../../components/AppShellLayout";

const NAV_ITEMS = [
  {
    id: "semana",
    label: "La semana",
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
        d="M8 7V3m8 4V3M4 11h16M5 5h14a1 1 0 011 1v13a1 1 0 01-1 1H5a1 1 0 01-1-1V6a1 1 0 011-1zm4 10l2 2 4-4" />
    ),
  },
  {
    id: "pagos",
    label: "Pagos",
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
        d="M3 7h18M3 7v10a1 1 0 001 1h16a1 1 0 001-1V7M3 7l2-3h14l2 3M7 14h4" />
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
    id: "bancos",
    label: "Bancos",
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
        d="M3 10l9-6 9 6M5 10v8m4-8v8m6-8v8m4-8v8M3 20h18" />
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
  semana:      null,            // resume todo; no filtra
  pagos:       null,
  flujo:       "Flujo de Caja",
  bancos:      "Bancos",
  costos:      "Costos",
  activos:     "Activos",
  proveedores: "Proveedores",
  deuda:       "Deuda",
  obras:       "Obras",
  reportes:    "Reportes",
};

function FinanzasAppInner({ user, userRole, onLogout, onBackToSelector, onAdminPanel, onAdminEmpresaPanel }) {
  // Finanzas abre en "La semana": caja, programación de pagos y lo disponible.
  const [activeView, setActiveView] = useState("semana");
  const { alertas } = useFinanzas();

  // Tema cuaderno: el papel también va bajo <html>, para que no asome el fondo
  // gris de la app al desplazar más allá del borde. Se retira al salir del
  // módulo, así RRHH o Maquinaria no lo heredan.
  useEffect(() => {
    document.documentElement.classList.add("cuaderno-activo");
    return () => document.documentElement.classList.remove("cuaderno-activo");
  }, []);

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
      case "semana":       return <FinanzasSemana />;
      case "pagos":        return <FinanzasPagos />;
      case "flujo":        return <FinanzasFlujoCaja />;
      case "bancos":       return <FinanzasBancos />;
      case "costos":       return <FinanzasCostos />;
      case "activos":      return <FinanzasActivos />;
      case "proveedores":  return <FinanzasProveedores />;
      case "deuda":        return <FinanzasDeuda />;
      case "obras":        return <FinanzasObras />;
      case "reportes":     return <FinanzasReportes />;
      default:             return <FinanzasSemana />;
    }
  }

  return (
    <>
      <AppShellLayout
        navGroups={navGroups}
        activeId={activeView}
        onSelect={setActiveView}
        variante="cuaderno"
        marca={{ titulo: "Fleet", resalte: "Core", subtitulo: "Finanzas", logoSrc: "/logo-fleetcore-f.png" }}
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
            "Flujo de Caja": "flujo",
            "Bancos":        "bancos",
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
