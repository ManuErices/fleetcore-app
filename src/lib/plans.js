// ============================================================
// FLEETCORE — CONFIGURACIÓN DE MÓDULOS Y PRECIOS
// src/lib/plans.js
//
// Modelo: precio por módulo individual + descuentos por cantidad
// ============================================================

// ── Módulos disponibles ───────────────────────────────────────
export const MODULES = {
  rrhh: {
    id:          'rrhh',
    name:        'Recursos Humanos',
    description: 'Gestión de trabajadores, contratos, remuneraciones y nómina',
    price:       350000,
    color:       'emerald',
    appKey:      'rrhh',
    features: [
      'Gestión de trabajadores',
      'Contratos y anexos',
      'Remuneraciones y nómina',
      'Impuestos y previred',
      'Asistencia y organización',
      'Reportes de contabilidad',
    ],
  },
  finanzas: {
    id:          'finanzas',
    name:        'Finanzas',
    description: 'Flujo de caja, costos, activos y análisis financiero',
    price:       400000,
    color:       'purple',
    appKey:      'finanzas',
    features: [
      'Flujo de caja real y proyectado',
      'Costos fijos y variables',
      'Gestión de activos',
      'Proveedores y cuentas por pagar',
      'Créditos y obligaciones',
      'Reportes y análisis financiero',
    ],
  },
  fleetcore: {
    id:          'fleetcore',
    name:        'Oficina Técnica',
    description: 'Dashboard, equipos, combustible, órdenes de compra y más',
    price:       500000,
    color:       'orange',
    appKey:      'fleetcore',
    features: [
      'Dashboard y reportes',
      'Gestión de equipos',
      'Calendario y diario de obra',
      'Control de combustible',
      'Remuneraciones y costos',
      'Órdenes de compra',
    ],
  },
  workfleet: {
    id:          'workfleet',
    name:        'WorkFleet',
    description: 'App móvil para operadores en terreno',
    price:       700000,
    color:       'blue',
    appKey:      'workfleet',
    features: [
      'App móvil para operadores',
      'Reporte diario de maquinaria',
      'Registro de combustible en terreno',
      'Escaneo QR para login',
      'Modo offline',
      'Sincronización automática',
    ],
  },
};

// ── Descuentos progresivos ────────────────────────────────────
export const BUNDLE_DISCOUNTS = {
  1: 0,
  2: 0.10,
  3: 0.15,
  4: 0.25,
};

// ── Helpers de cálculo ────────────────────────────────────────

export function subtotal(moduleIds) {
  return moduleIds.reduce((sum, id) => sum + (MODULES[id]?.price || 0), 0);
}

export function discountRate(count) {
  return BUNDLE_DISCOUNTS[count] || 0;
}

export function calculateTotal(moduleIds) {
  const base     = subtotal(moduleIds);
  const discount = discountRate(moduleIds.length);
  const savings  = Math.round(base * discount);
  const total    = base - savings;
  return { base, discount, savings, total };
}

export function formatPrice(amount) {
  return new Intl.NumberFormat('es-CL', {
    style:                 'currency',
    currency:              'CLP',
    minimumFractionDigits: 0,
  }).format(amount);
}

// ── Compatibilidad con usePlan (espera .modules y .features) ──
export function buildPlanData(moduleIds = []) {
  const modules  = { fleetcore: false, workfleet: false, rrhh: false, reportes: false, finanzas: false };
  const features = [];
  moduleIds.forEach(id => {
    if (id in modules) modules[id] = true;
    if (id === 'fleetcore') modules.reportes = true;
    const mod = MODULES[id];
    if (mod) features.push(...mod.features.map(f => `${id}:${f}`));
  });
  return { modules, features };
}

// planId = módulos separados por coma: "rrhh,finanzas,workfleet"
export function getPlan(planId) {
  const moduleIds = planId ? planId.split(',').filter(Boolean) : [];
  return buildPlanData(moduleIds);
}

export function canAccessModule(planId, moduleId) {
  return getPlan(planId).modules[moduleId] === true;
}

export function hasFeature(planId, featureId) {
  return getPlan(planId).features.includes(featureId);
}
