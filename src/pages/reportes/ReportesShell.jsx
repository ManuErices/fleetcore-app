import React, { useState, useEffect } from "react";
import AppShellLayout from "../../components/AppShellLayout";
import ReporteCombustible from "./ReporteCombustible";
import ReporteWorkFleet from "./ReporteWorkFleet";
import AdminPanel from "./AdminPanel";

/*
 * ReportesShell — contenedor del módulo Reportes.
 *
 * La barra lateral la dibuja AppShellLayout, igual que RRHH, Finanzas y
 * Contabilidad. Este archivo se quedó con lo único propio del módulo: qué
 * pestañas existen, quién puede ver cuáles, y cuál se recuerda entre recargas.
 */

// Clave para recordar la pestaña abierta entre recargas.
// Sin esto, cualquier window.location.reload() (por ejemplo al terminar de
// crear un reporte) devolvía al usuario a "combustible", que es el valor
// inicial del estado.
const VISTA_KEY = "reportes:vistaActiva";
const VISTAS_VALIDAS = ["combustible", "maquinaria", "admin"];

const ICONOS = {
  combustible: (
    <>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 16.121A3 3 0 1012.015 11L11 14H9c0 .768.293 1.536.879 2.121z" />
    </>
  ),
  maquinaria: (
    <>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1a1 1 0 001-1v-4a1 1 0 011-1h2m0 0a1 1 0 001-1V9a1 1 0 00-1-1h-3m4 0h2a1 1 0 011 1v4a1 1 0 01-1 1h-1m-5 1v-5a1 1 0 00-1-1H9a1 1 0 00-1 1v5" />
    </>
  ),
  admin: (
    <>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </>
  ),
};

export default function ReportesShell({
  user, userRole, onLogout, onBackToSelector, onAdminPanel, onAdminEmpresaPanel,
}) {
  const [activeView, setActiveViewState] = useState(() => {
    try {
      const guardada = localStorage.getItem(VISTA_KEY);
      if (guardada && VISTAS_VALIDAS.includes(guardada)) return guardada;
    } catch { /* localStorage puede no estar disponible */ }
    return "combustible";
  });

  // Se persiste en cada cambio para sobrevivir a un refresh
  const setActiveView = (vista) => {
    setActiveViewState(vista);
    try { localStorage.setItem(VISTA_KEY, vista); } catch { /* ignorar */ }
  };

  const isAdmin = ["superadmin", "admin_contrato", "administrativo"].includes(userRole);

  // Si la vista recordada es "admin" pero el rol ya no lo permite, volver a
  // combustible. Puede pasar tras un cambio de rol con la pestaña persistida.
  useEffect(() => {
    if (activeView === "admin" && !isAdmin) setActiveView("combustible");
  }, [activeView, isAdmin]);

  const navGroups = [{
    label: "",
    tabs: [
      { id: "combustible", label: "Reporte Combustible", icon: ICONOS.combustible },
      { id: "maquinaria",  label: "Reporte Maquinaria",  icon: ICONOS.maquinaria },
      ...(isAdmin ? [{ id: "admin", label: "Administración", icon: ICONOS.admin }] : []),
    ],
  }];

  return (
    <AppShellLayout
      navGroups={navGroups}
      activeId={activeView}
      onSelect={setActiveView}
      marca={{
        titulo: "Fleet", resalte: "Core", subtitulo: "Reportes",
        gradiente: "linear-gradient(135deg,#0d9488,#0f766e)",
        iconoPath: "M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
      }}
      user={user} userRole={userRole} onLogout={onLogout}
      onBackToSelector={onBackToSelector}
      onAdminPanel={onAdminPanel} onAdminEmpresaPanel={onAdminEmpresaPanel}
    >
      <div className="px-4 sm:px-6 lg:px-8 py-6 w-full max-w-[1500px] mx-auto">
        {activeView === "combustible" && <ReporteCombustible />}
        {activeView === "maquinaria" && <ReporteWorkFleet />}
        {activeView === "admin" && isAdmin && <AdminPanel hideSystem={true} />}
      </div>
    </AppShellLayout>
  );
}
