// ─────────────────────────────────────────────────────────────────────────────
// PARÁMETROS LEGALES DE REMUNERACIONES — RESUELTOS POR PERÍODO
// ─────────────────────────────────────────────────────────────────────────────
//
// Regla central del módulo: el valor correcto de un parámetro depende del
// PERÍODO DE LA LIQUIDACIÓN, no de la fecha de hoy. Si en septiembre se reabre
// una liquidación de marzo, tiene que seguir usando el IMM, la UTM y la jornada
// legal de marzo. Por eso nada acá es una constante suelta: todo son tablas de
// vigencia que se consultan con `paramsDe(periodo)`.
//
// Antes estos valores vivían como constantes en shared.jsx (IMM_2026,
// UTM_DEFAULT, UF_REFERENCIA). Quedaban congelados en el valor del día que se
// escribieron y no había forma de calcular un mes pasado correctamente.
//
// Mantención:
//   · IMM  → cambia por ley una o dos veces al año. Se agrega una fila arriba.
//   · Jornada máxima → gradualidad de la Ley 21.561, ya está toda cargada.
//   · UTM / UF → cambian cada mes (la UF cada día). NO se mantienen a mano:
//     se cargan a `INDICADORES` desde Firestore o desde mindicador.cl.
//
// ─────────────────────────────────────────────────────────────────────────────

// ── Ingreso Mínimo Mensual (Art. 44 CT) ──────────────────────────────────────
// `noRemun` es el IMM para fines no remuneracionales (asignaciones, tramos de
// beneficios); no se usa para calcular sueldos.
const IMM = [
  { desde: '2026-05-01', mayor18: 553553, menor18: 412938, noRemun: 356815, norma: 'Ley 21.830' },
  { desde: '2026-01-01', mayor18: 539000, menor18: 402082, noRemun: 347434, norma: 'Ley 21.751' },
  { desde: '2025-05-01', mayor18: 529000, menor18: null,   noRemun: null,   norma: 'Ley 21.751' },
  { desde: '2025-01-01', mayor18: 510636, menor18: null,   noRemun: null,   norma: 'Ley 21.687' },
  { desde: '2024-07-01', mayor18: 500000, menor18: null,   noRemun: null,   norma: 'Ley 21.578' },
  // Piso heredado: es el valor que traía `IMM_2024` en shared.jsx. Se conserva
  // para que las liquidaciones antiguas no cambien de resultado al migrar.
  // Verificar contra la DT antes de recalcular cualquier período anterior a 2024.
  { desde: '1900-01-01', mayor18: 501787, menor18: null,   noRemun: null,   norma: 'valor heredado — sin verificar' },
];

// ── Jornada ordinaria máxima semanal (Art. 22 CT / Ley 21.561) ───────────────
// La rebaja se incorpora a los contratos por el solo ministerio de la ley: un
// contrato que dice 45 hrs tiene tope legal de 42 desde el 26/04/2026 sin
// necesidad de anexo. Por eso el cálculo topea, no exige editar los contratos.
const JORNADA_MAXIMA = [
  { desde: '2028-04-26', horas: 40 },
  { desde: '2026-04-26', horas: 42 },
  { desde: '2024-04-26', horas: 44 },
  { desde: '1900-01-01', horas: 45 },
];

// ── UTM y UF por período ─────────────────────────────────────────────────────
// Semilla mínima. Lo normal es que estos valores lleguen desde Firestore
// (`empresas/{id}/parametros_legales/{YYYY-MM}`) o desde mindicador.cl vía
// `aplicarIndicadores`. La UF se guarda como valor del día 1 del mes: sirve
// para topes en UF (APV 50 UF, indemnización 90 UF), que no exigen el valor
// exacto del día de pago.
// UF anotada: 07-09-2026 (Banco Central). Sirve para topes en UF, no para
// convertir montos exactos a la fecha de pago.
const INDICADORES = {
  '2026-09': { utm: 71721, uf: 40883 },
  '2026-08': { utm: 71649, uf: null  },
};

// Último recurso si se pide un período sin UTM/UF cargada ni override.
// El valor anterior de UF en calculo.jsx era 39.500 y el de UTM 64.085: ambos
// quedaron años atrás y sesgaban el IUT y los topes. Estos son de sept-2026 y
// también van a envejecer — la solución real es cargarlos, no editarlos acá.
const UTM_FALLBACK = 71721;
const UF_FALLBACK  = 40883;

// ─────────────────────────────────────────────────────────────────────────────
// Normalización de período
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Acepta lo que llegue y devuelve 'YYYY-MM-DD' para comparar contra las tablas.
 *   '2026-08'            → '2026-08-01'
 *   '2026-08-15'         → '2026-08-15'
 *   { mes:'08', anio:'2026' } → '2026-08-01'
 *   Date                 → su fecha
 *   null / undefined     → hoy
 */
export function normalizarPeriodo(p) {
  if (!p) return new Date().toISOString().slice(0, 10);
  if (p instanceof Date) return p.toISOString().slice(0, 10);
  if (typeof p === 'object') {
    const anio = String(p.anio || p.year || '').padStart(4, '0');
    const mes  = String(p.mes  || p.month || '').padStart(2, '0');
    if (anio.length === 4 && mes !== '00') return `${anio}-${mes}-01`;
    return new Date().toISOString().slice(0, 10);
  }
  const s = String(p).trim();
  if (/^\d{4}-\d{2}$/.test(s))       return `${s}-01`;
  if (/^\d{4}-\d{2}-\d{2}/.test(s))  return s.slice(0, 10);
  return new Date().toISOString().slice(0, 10);
}

/** 'YYYY-MM' — la clave con que se indexan UTM y UF. */
export function claveMes(p) {
  return normalizarPeriodo(p).slice(0, 7);
}

/** Primera fila de la tabla cuya vigencia ya empezó en esa fecha. */
function vigenteEn(tabla, fecha) {
  return tabla.find(r => r.desde <= fecha) || tabla[tabla.length - 1];
}

// ─────────────────────────────────────────────────────────────────────────────
// API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Todos los parámetros legales de un período.
 *
 *   const P = paramsDe({ mes: '08', anio: '2026' });
 *   P.imm               → 553553
 *   P.topeGratMensual   → 219115
 *   P.jornadaMaxima     → 42
 */
export function paramsDe(periodo) {
  const fecha = normalizarPeriodo(periodo);
  const mes   = fecha.slice(0, 7);
  const imm   = vigenteEn(IMM, fecha);
  const jor   = vigenteEn(JORNADA_MAXIMA, fecha);
  const ind   = INDICADORES[mes] || {};

  return {
    periodo:      mes,
    fecha,
    imm:          imm.mayor18,
    immMenor18:   imm.menor18,
    immNoRemun:   imm.noRemun,
    immNorma:     imm.norma,
    // Art. 50 CT: 4,75 IMM al año → 4,75 × IMM ÷ 12 al mes.
    topeGratMensual: Math.round(imm.mayor18 * 4.75 / 12),
    topeGratAnual:   Math.round(imm.mayor18 * 4.75),
    jornadaMaxima: jor.horas,
    utm:          ind.utm || UTM_FALLBACK,
    uf:           ind.uf  || UF_FALLBACK,
    // Permite que la UI advierta cuando se está calculando con el fallback
    utmCargada:   !!ind.utm,
    ufCargada:    !!ind.uf,
  };
}

/**
 * Carga UTM/UF de uno o varios meses. Es la puerta por la que entran los
 * valores de Firestore o de mindicador.cl. Solo pisa lo que viene con valor:
 * pasar `{ utm: 71721 }` no borra la UF que ya estuviera cargada.
 *
 *   aplicarIndicadores({ '2026-08': { utm: 71649, uf: 40700 } });
 */
export function aplicarIndicadores(mapa) {
  if (!mapa || typeof mapa !== 'object') return;
  Object.entries(mapa).forEach(([mes, val]) => {
    if (!/^\d{4}-\d{2}$/.test(mes) || !val) return;
    const actual = INDICADORES[mes] || {};
    INDICADORES[mes] = {
      utm: Number(val.utm) > 0 ? Number(val.utm) : actual.utm,
      uf:  Number(val.uf)  > 0 ? Number(val.uf)  : actual.uf,
    };
  });
}

/** Lo que hay cargado, para pantallas de configuración. */
export function indicadoresCargados() {
  return { ...INDICADORES };
}

/** Tabla de IMM completa, para mostrarla en la pantalla de parámetros. */
export function tablaIMM() {
  return IMM.map(r => ({ ...r }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Fuentes externas
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Lee `empresas/{empresaId}/parametros_legales/{YYYY-MM}` y lo aplica.
 * Recibe `db` por parámetro para que este módulo no dependa de Firebase: así
 * `calculo.jsx` puede importarlo sin arrastrar el SDK.
 *
 *   import { db } from '../../lib/firebase';
 *   import { doc, getDoc } from 'firebase/firestore';
 *   await cargarIndicadoresFirestore({ doc, getDoc, db }, empresaId, '2026-08');
 */
export async function cargarIndicadoresFirestore(fs, empresaId, periodo) {
  if (!fs?.db || !fs?.doc || !fs?.getDoc || !empresaId) return null;
  const mes = claveMes(periodo);
  try {
    const snap = await fs.getDoc(fs.doc(fs.db, 'empresas', empresaId, 'parametros_legales', mes));
    if (!snap.exists()) return null;
    const d = snap.data() || {};
    aplicarIndicadores({ [mes]: { utm: d.utm, uf: d.uf } });
    return { mes, utm: d.utm || null, uf: d.uf || null };
  } catch (e) {
    console.warn('[parametros] no se pudo leer parametros_legales:', e.message);
    return null;
  }
}

/**
 * Consulta UTM y UF del día 1 del mes en mindicador.cl (gratis, sin API key).
 * Devuelve `{ utm, uf }` o `null`; nunca lanza. No aplica nada por sí sola:
 * quien la llame decide si guardar en Firestore y llamar a `aplicarIndicadores`.
 *
 * Formato de fecha de la API: DD-MM-YYYY. Respuesta: { serie: [{ valor }] }.
 */
export async function consultarIndicadoresOnline(periodo) {
  const mes = claveMes(periodo);
  const [anio, mm] = mes.split('-');
  const fecha = `01-${mm}-${anio}`;

  const pedir = async (indicador) => {
    try {
      const r = await fetch(`https://mindicador.cl/api/${indicador}/${fecha}`);
      if (!r.ok) return null;
      const j = await r.json();
      const v = Number(j?.serie?.[0]?.valor);
      return v > 0 ? v : null;
    } catch {
      return null;
    }
  };

  const [utm, uf] = await Promise.all([pedir('utm'), pedir('uf')]);
  if (!utm && !uf) return null;
  return { mes, utm, uf: uf ? Math.round(uf) : null };
}
