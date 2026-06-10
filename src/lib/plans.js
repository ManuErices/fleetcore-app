// ============================================================
// FLEETCORE — CONFIGURACIÓN DE MÓDULOS Y PRECIOS
// src/lib/plans.js
//
// Modelo: precio por módulo individual + descuentos por cantidad
// ============================================================

// ── Módulos disponibles con precios en UF ───────────────────────
export const MODULES = {
  finanzas: {
    id:          'finanzas',
    name:        'Finanzas y Contabilidad',
    description: 'Flujo de caja, costos, activos, plan de cuentas y balances',
    priceUf:     0,
    color:       'purple',
    appKey:      'finanzas',
    image:       'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=600&auto=format&fit=crop&q=60',
    features: [
      'Flujo de caja real y proyectado',
      'Costos fijos y variables',
      'Gestión de activos y proveedores',
      'Plan de cuentas IFRS/SII',
      'Libro diario y balance 8 columnas',
      'Estado de Situación Financiera',
    ],
  },
  fleetcore: {
    id:          'fleetcore',
    name:        'Oficina Técnica',
    description: 'Dashboard central, equipos, órdenes de compra y logs',
    priceUf:     3,
    color:       'orange',
    appKey:      'fleetcore',
    image:       'https://images.unsplash.com/photo-1581094288338-2314dddb7ecc?w=600&auto=format&fit=crop&q=60',
    features: [
      'Dashboard gerencial de flota',
      'Gestión de equipos y horómetros',
      'Calendario y diario de obra',
      'Órdenes de compra y repuestos',
      'Remuneraciones y costos',
    ],
  },
  rrhh: {
    id:          'rrhh',
    name:        'Recursos Humanos',
    description: 'Gestión de trabajadores, contratos, asistencia y liquidación',
    priceUf:     3,
    color:       'emerald',
    appKey:      'rrhh',
    image:       'https://images.unsplash.com/photo-1521791136064-7986c2920216?w=600&auto=format&fit=crop&q=60',
    features: [
      'Fichas de trabajadores y cargas',
      'Contratos, anexos y finiquitos',
      'Liquidaciones de sueldo y nómina',
      'Asistencia, turnos y permisos',
      'Impuestos mensuales y Previred',
      'Portal de autogestión de trabajadores',
    ],
  },
  workfleet: {
    id:          'workfleet',
    name:        'WorkFleet Mobile',
    description: 'Aplicación para operadores en terreno y reportes',
    priceUf:     3,
    color:       'blue',
    appKey:      'workfleet',
    image:       'https://images.unsplash.com/photo-1526738549149-8e07eca6c147?w=600&auto=format&fit=crop&q=60',
    features: [
      'App PWA instalable para operadores',
      'Reporte diario de maquinaria',
      'Registro de cargas de combustible',
      'Escaneo QR para login rápido',
      'Modo Offline para faenas aisladas',
      'Sincronización automática',
    ],
  },
};

// ── Helpers de cálculo en UF y CLP ─────────────────────────────
export function calculateTotal(moduleIds) {
  const ids = Array.isArray(moduleIds) ? moduleIds : [];
  
  // Finanzas es gratis, los otros módulos cuestan 3 UF cada uno
  const totalUf = ids.reduce((sum, id) => {
    return sum + (MODULES[id]?.priceUf || 0);
  }, 0);

  return {
    totalUf,
  };
}

export function formatPrice(amountUf) {
  if (amountUf === 0) return 'Gratis';
  return `${amountUf} UF`;
}

// ── Compatibilidad con usePlan (espera .modules y .features) ──
export function buildPlanData(moduleIds = []) {
  const modules  = { fleetcore: false, workfleet: false, rrhh: false, reportes: false, finanzas: false, contabilidad: false };
  const features = [];
  moduleIds.forEach(id => {
    if (id in modules) modules[id] = true;
    if (id === 'fleetcore' || id === 'workfleet') {
      modules.reportes = true;
    }
    if (id === 'finanzas') {
      modules.finanzas = true;
      modules.contabilidad = true; // Finanzas gives access to Contabilidad as well
    }
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

// ── Estructura de Planes de Suscripción de 3 Tiers ─────────────
export const PLANS = {
  free: {
    id:          'free',
    name:        'Plan Inicial',
    priceUf:     0,
    priceClp:    0,
    planId:      'workfleet',
    description: 'Acceso básico para operadores en terreno.',
    badge:       'Gratis',
    features: [
      'App móvil WorkFleet para operadores',
      'Reporte diario de maquinaria',
      'Control de combustible básico en terreno',
      'Escaneo QR para inicio de sesión',
      'Modo Offline con auto-sincronización',
      'Hasta 2 maquinarias y 1 operador',
    ],
    color: 'slate',
  },
  pro: {
    id:          'pro',
    name:        'Plan Profesional',
    priceUf:     10,
    priceClp:    380000, // Referencia aproximada
    planId:      'fleetcore,workfleet',
    description: 'El núcleo de control operativo para tu flota.',
    badge:       'Recomendado',
    features: [
      'Todo lo del Plan Inicial',
      'Dashboard y reportes en tiempo real',
      'Gestión de equipos y maquinarias ilimitada',
      'Órdenes de compra y control de costos',
      'Reportes consolidados de combustible',
      'Soporte técnico preferente',
    ],
    color: 'blue',
  },
  enterprise: {
    id:          'enterprise',
    name:        'Plan Minero / Enterprise',
    priceUf:     25,
    priceClp:    950000, // Referencia aproximada
    planId:      'rrhh,finanzas,fleetcore,workfleet',
    description: 'Gestión corporativa integral de flotas grandes.',
    badge:       'Completo',
    features: [
      'Todo lo del Plan Profesional',
      'Módulo de Finanzas (Flujo de Caja)',
      'Módulo de Recursos Humanos (Nóminas y Contratos)',
      'Gestión de activos y proveedores',
      'Integraciones a medida vía API/ERP',
      'Soporte prioritario 24/7',
    ],
    color: 'purple',
  },
};

export function formatUf(amount) {
  return amount === 0 ? 'Gratis' : `${amount} UF`;
}
