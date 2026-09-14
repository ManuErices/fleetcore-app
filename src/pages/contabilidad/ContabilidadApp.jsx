import React, { useState } from "react";
import { ContabilidadProvider, useContabilidad } from "./ContabilidadContext";
import AppShellLayout from "../../components/AppShellLayout";
import ContabilidadPlanCuentas from "./ContabilidadPlanCuentas";
import ContabilidadLibroDiario from "./ContabilidadLibroDiario";
import ContabilidadEstados from "./ContabilidadEstados";
import ContabilidadTributario from "./ContabilidadTributario";
import ContabilidadActivos from "./ContabilidadActivos";
import ContabilidadFlujoMensual from "./ContabilidadFlujoMensual";
import ContabilidadDepreciacion from "./ContabilidadDepreciacion";
import ContabilidadReglasGasto from "./ContabilidadReglasGasto";

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
    id: "reglas",
    label: "Reglas de Gasto",
    short: "Reglas",
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
        d="M7 7h.01M7 3h5a1.99 1.99 0 011.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.99 1.99 0 013 12V7a4 4 0 014-4z" />
    ),
  },
  {
    id: "depreciacion",
    label: "Depreciación",
    short: "Deprec.",
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
        d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" />
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

// ─── Asientos descuadrados ────────────────────────────────────────────────────
// No deberían existir —el editor no deja guardar uno desbalanceado— pero si
// alguno entró por importación o por una escritura directa, el contador del
// Libro Diario es donde se nota.
function contarDescuadrados(asientos) {
  return (asientos || []).filter(a => {
    const debe  = (a.lineas || []).reduce((s, l) => s + (parseFloat(l.debe)  || 0), 0);
    const haber = (a.lineas || []).reduce((s, l) => s + (parseFloat(l.haber) || 0), 0);
    return Math.abs(debe - haber) > 0.01;
  }).length;
}

// ─── Inner app ────────────────────────────────────────────────────────────────
function ContabilidadAppInner({ user, userRole, onBackToSelector, onLogout, onAdminPanel, onAdminEmpresaPanel }) {
  const [activeView, setActiveView] = useState("plan");
  const { asientos } = useContabilidad();

  const descuadrados = contarDescuadrados(asientos);

  // Lista plana: un solo grupo sin etiqueta, así el shell no dibuja encabezados.
  const navGroups = [{
    label: "",
    tabs: NAV_ITEMS.map(item => item.id === "diario"
      ? { ...item, badge: descuadrados, badgeCritico: true }
      : item),
  }];

  function renderView() {
    switch (activeView) {
      case "plan":         return <ContabilidadPlanCuentas />;
      case "diario":       return <ContabilidadLibroDiario />;
      case "estados":      return <ContabilidadEstados />;
      case "tributario":   return <ContabilidadTributario />;
      case "activos":      return <ContabilidadActivos />;
      case "reglas":       return <ContabilidadReglasGasto />;
      case "depreciacion": return <ContabilidadDepreciacion />;
      case "flujo":        return <ContabilidadFlujoMensual />;
      default:             return <ContabilidadPlanCuentas />;
    }
  }

  return (
    <AppShellLayout
      navGroups={navGroups}
      activeId={activeView}
      onSelect={setActiveView}
      marca={{ titulo: "Fleet", resalte: "Core-C", subtitulo: "Contabilidad", logoSrc: "/logo-fleetcore-f.png" }}
      user={user} userRole={userRole} onLogout={onLogout}
      onBackToSelector={onBackToSelector}
      onAdminPanel={onAdminPanel} onAdminEmpresaPanel={onAdminEmpresaPanel}
    >
      {renderView()}
    </AppShellLayout>
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
