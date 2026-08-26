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
  maquinaria: {
    id:          'maquinaria',
    name:        'Maquinaria',
    description: 'Mantenimiento preventivo, taller, órdenes de trabajo y repuestos',
    priceUf:     3, // referencia UF; el cobro real se maneja en CLP (250.000)
    priceClp:    250000,
    color:       'red',
    appKey:      'maquinaria',
    image:       'https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?w=600&auto=format&fit=crop&q=60',
    features: [
      'Ficha de mantenimiento por equipo',
      'Órdenes de trabajo de taller',
      'Registro de fallas y diagnósticos',
      'Control de stock de repuestos',
      'Alertas de mantención y stock bajo',
    ],
  },
};

// ============================================================
// FUENTE ÚNICA — PERMISOS A NIVEL DE USUARIO
//
// Estas claves son las que consultan hasModulo() en AppSelector.jsx
// y en el gating por URL de App.jsx. Cualquier formulario que asigne
// `users/{uid}.modulos` DEBE consumir USER_MODULOS y nada más.
// Agregar un módulo nuevo = agregar una línea aquí.
// ============================================================

export const USER_MODULOS = [
  { value: 'fleetcore',    label: 'Oficina Técnica',       desc: 'Dashboard, equipos y control de costos' },
  { value: 'maquinaria',   label: 'Maquinaria',            desc: 'Taller, órdenes de trabajo y repuestos' },
  { value: 'rrhh',         label: 'Recursos Humanos',      desc: 'Trabajadores, contratos y nómina' },
  { value: 'finanzas',     label: 'Finanzas',              desc: 'Flujo de caja y activos' },
  { value: 'contabilidad', label: 'Contabilidad',          desc: 'Libro diario, balance y tributario' },
  { value: 'reportes',     label: 'Work Fleet (Reportes)', desc: 'Informes de maquinaria y combustible' },
  { value: 'workfleet',    label: 'WorkFleet Mobile',      desc: 'App de terreno para operadores' },
];

export const USER_MODULO_VALUES = USER_MODULOS.map(m => m.value);

export const USER_MODULO_LABELS = Object.fromEntries(
  USER_MODULOS.map(m => [m.value, m.label])
);

// FleetCore-I no tiene clave propia: se gatea con 'fleetcore'.
// Se declara aparte solo para listados informativos (ej. capacitaciones).
export const PSEUDO_MODULOS = [
  { value: 'documentos', label: 'FleetCore-I (Documentos)', desc: 'Libro de obras y firma digital', gatedBy: 'fleetcore' },
];

// Claves heredadas que quedaron en Firestore → clave canónica.
// 'workfleet_m' nunca fue consultada por ningún gate; el gate real es 'workfleet'.
export const MODULO_ALIASES = {
  workfleet_m: 'workfleet',
  'workfleet-m': 'workfleet',
};

/**
 * Normaliza un array de módulos leído de Firestore:
 * resuelve alias heredados, descarta claves inexistentes y deduplica.
 * Usar SIEMPRE al leer `users/{uid}.modulos`.
 */
export function normalizeModulos(modulos = []) {
  if (!Array.isArray(modulos)) return [];
  const validas = new Set(USER_MODULO_VALUES);
  return [...new Set(
    modulos
      .map(m => MODULO_ALIASES[m] || m)
      .filter(m => validas.has(m))
  )];
}

// ── Roles del sistema ──────────────────────────────────────────
export const ROLES = [
  { value: 'superadmin',     label: 'Super Admin',       desc: '⚡ Acceso total al sistema. Solo para el propietario.',      scope: 'global'  },
  { value: 'admin_contrato', label: 'Administrador',     desc: '🏗️ Acceso completo dentro de su empresa.',                   scope: 'empresa' },
  { value: 'administrativo', label: 'Administrativo',    desc: '📋 Acceso según módulos asignados.',                         scope: 'empresa' },
  { value: 'operador',       label: 'Operador',          desc: '🔧 WorkFleet-M según cargo + módulos asignados.',            scope: 'empresa' },
  { value: 'jefe_taller',    label: 'Jefe de Taller',    desc: '🛠️ Maquinaria: órdenes de trabajo, fallas y repuestos.',     scope: 'empresa' },
  { value: 'mecanico',       label: 'Mecánico',          desc: '⚙️ Maquinaria: ejecución de órdenes de trabajo.',            scope: 'empresa' },
  { value: 'mandante_admin', label: 'Mandante Admin',    desc: '👥 Gestiona usuarios mandante de su empresa.',               scope: 'empresa' },
  { value: 'mandante',       label: 'Mandante',          desc: '👁️ Solo lectura de reportes. Sin edición.',                  scope: 'empresa' },
  { value: 'revisor_admin',  label: 'Revisor Admin',     desc: '📁 FleetCore-I: gestiona revisores.',                        scope: 'empresa' },
  { value: 'revisor',        label: 'Revisor',           desc: '📄 FleetCore-I: solo lectura de documentos.',                scope: 'empresa' },
  { value: 'trabajador',     label: 'Trabajador',        desc: '👤 Solo Portal Trabajadores (liquidaciones, contratos).',    scope: 'empresa' },
];

export const ROLE_VALUES = ROLES.map(r => r.value);

export const ROLE_LABELS = Object.fromEntries(ROLES.map(r => [r.value, r.label]));

/**
 * Roles cuyo acceso depende de `users/{uid}.modulos`.
 * Si un rol está acá, el formulario que lo asigna DEBE mostrar el selector
 * de módulos — si no, el usuario queda sin acceso a nada.
 * jefe_taller y mecanico dependen de 'maquinaria' (ver AppSelector.jsx).
 */
export const ROLES_WITH_MODULOS = ['administrativo', 'operador', 'jefe_taller', 'mecanico'];

export function roleNeedsModulos(role) {
  return ROLES_WITH_MODULOS.includes(role);
}

/** Roles que ven la vista reducida de FleetCore-I en AppSelector. */
export const ROLES_REVISOR = ['revisor_admin', 'revisor', 'mandante_admin', 'mandante'];

export function isRevisorRole(role) {
  return ROLES_REVISOR.includes(role);
}

/**
 * Roles que un usuario dado puede asignar a otros.
 * superadmin asigna todo; admin_contrato no puede crear pares ni superadmins.
 */
export function assignableRoles(byRole) {
  if (byRole === 'superadmin') return ROLES;
  if (byRole === 'admin_contrato' || byRole === 'mandante_admin') {
    return ROLES.filter(r => r.value !== 'superadmin' && r.value !== 'admin_contrato');
  }
  return [];
}

/** Rol principal → rol interno del módulo Documentos (FleetCore-I). */
export function mapDocRole(mainRole) {
  switch (mainRole) {
    case 'superadmin':     return 'admin';
    case 'admin_contrato': return 'supervisor';
    case 'revisor_admin':  return 'supervisor';
    case 'jefe_taller':    return 'supervisor';
    case 'revisor':        return 'mandante';
    case 'mandante_admin': return 'mandante';
    case 'mandante':       return 'mandante';
    case 'operador':       return 'operador';
    case 'mecanico':       return 'operador';
    default:               return 'supervisor';
  }
}

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
  const modules  = { fleetcore: false, workfleet: false, rrhh: false, reportes: false, finanzas: false, contabilidad: false, maquinaria: false };
  const features = [];
  moduleIds.forEach(id => {
    if (id in modules) modules[id] = true;
    if (id === 'workfleet') {
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
  let moduleStr = planId || '';
  if (planId === 'free' || planId === 'starter' || planId === 'trial') {
    moduleStr = 'workfleet';
  } else if (PLANS[planId]) {
    moduleStr = PLANS[planId].planId;
  }

  const moduleIds = moduleStr ? moduleStr.split(',').filter(Boolean) : [];
  if (!moduleIds.includes('finanzas')) {
    moduleIds.unshift('finanzas');
  }
  return buildPlanData(moduleIds);
}

export function canAccessModule(planId, moduleId) {
  if (moduleId === 'finanzas' || moduleId === 'contabilidad') return true;
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

export function getPlanTier(activeModules = []) {
  if (!activeModules.length) return { label: 'Sin plan', id: 'none' };
  const allFour = ['finanzas', 'fleetcore', 'rrhh', 'workfleet'].every(m => activeModules.includes(m));
  if (allFour) return { label: 'Enterprise', id: 'enterprise' };
  if (activeModules.length >= 2) return { label: 'Pro', id: 'pro' };
  return { label: 'Básico', id: 'basic' };
}
