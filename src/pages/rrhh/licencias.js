/**
 * licencias.js — src/pages/rrhh/licencias.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Licencias médicas como proceso propio.
 *
 * Antes una licencia era, a lo más, bajar los días trabajados a mano en la
 * liquidación. Eso descontaba, pero no dejaba rastro: no había folio, ni
 * fechas, ni forma de saber qué entidad pagaba el subsidio, y el archivo de
 * Previred declaraba cero días de reposo aunque los hubiera.
 *
 * Modelo de la empresa: los días de reposo NO los paga la empresa. El subsidio
 * lo entera la isapre, Fonasa o la CCAF directo al trabajador, y esa misma
 * entidad paga las cotizaciones de pensiones y salud de todo el período de
 * reposo. Por eso esos días salen de la base imponible del empleador.
 *
 * Documento en `empresas/{empresaId}/licencias/{id}`:
 *
 *   { trabajadorId, folio, tipo, desde, hasta, entidad, estado,
 *     continuaDeId, observaciones, createdAt, updatedAt }
 *
 * Lo que NO se guarda, a propósito:
 *
 *   · `dias` y `diasEnPeriodo` — se derivan de las fechas. Guardarlos permite
 *     que queden inconsistentes, y además `diasEnPeriodo` depende del mes que
 *     se esté liquidando, así que es derivado por definición. Mismo criterio
 *     que `vencido` en el resto del sistema.
 *   · `diagnostico` — es dato de salud. No se usa para calcular nada y su
 *     presencia obligaría a tratar toda la colección como información
 *     sensible. El folio basta para trazar la licencia.
 */

import { useEffect, useState } from 'react';
import { db } from '../../lib/firebase';
import {
  collection, doc, onSnapshot, addDoc, updateDoc, deleteDoc, serverTimestamp,
} from 'firebase/firestore';

export const TIPOS_LICENCIA = {
  comun:       { label: 'Enfermedad común',            carencia: true,  color: 'text-slate-700',   bg: 'bg-slate-100'   },
  maternal:    { label: 'Maternal',                    carencia: false, color: 'text-pink-700',    bg: 'bg-pink-100'    },
  accidente:   { label: 'Accidente del trabajo',       carencia: false, color: 'text-orange-700',  bg: 'bg-orange-100'  },
  profesional: { label: 'Enfermedad profesional',      carencia: false, color: 'text-orange-700',  bg: 'bg-orange-100'  },
};

export const ENTIDADES_PAGADORAS = {
  isapre: 'Isapre',
  fonasa: 'Fonasa',
  ccaf:   'Caja de compensación',
  compin: 'COMPIN',
  mutual: 'Mutual de seguridad',
};

export const ESTADOS_LICENCIA = {
  ingresada: { label: 'Ingresada', color: 'text-amber-700',   bg: 'bg-amber-100'   },
  aprobada:  { label: 'Aprobada',  color: 'text-emerald-700', bg: 'bg-emerald-100' },
  reducida:  { label: 'Reducida',  color: 'text-sky-700',     bg: 'bg-sky-100'     },
  rechazada: { label: 'Rechazada', color: 'text-slate-500',   bg: 'bg-slate-100'   },
};

/** Estados que efectivamente descuentan días de la liquidación. */
const ESTADOS_VIGENTES = ['ingresada', 'aprobada', 'reducida'];

const colRef = (empresaId) => collection(db, 'empresas', empresaId, 'licencias');

/** Licencias de la empresa, en vivo. Se filtra por período en memoria. */
export function useLicencias(empresaId) {
  const [licencias, setLicencias] = useState([]);
  const [loading, setLoading]     = useState(true);

  useEffect(() => {
    if (!empresaId) { setLicencias([]); setLoading(false); return; }
    setLoading(true);
    const unsub = onSnapshot(
      colRef(empresaId),
      snap => {
        setLicencias(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      () => setLoading(false)
    );
    return unsub;
  }, [empresaId]);

  return { licencias, loading };
}

// ─────────────────────────────────────────────────────────────────────────────
// Derivaciones de fechas
// ─────────────────────────────────────────────────────────────────────────────

function aFecha(s) {
  if (!s) return null;
  // Mediodía para que ningún huso horario corra la fecha un día.
  const d = new Date(`${String(s).slice(0, 10)}T12:00:00`);
  return isNaN(d) ? null : d;
}

/** Días corridos de la licencia, inclusivos: del 1 al 5 son 5 días, no 4. */
export function diasCorridos(desde, hasta) {
  const a = aFecha(desde), b = aFecha(hasta);
  if (!a || !b || b < a) return 0;
  return Math.round((b - a) / 86400000) + 1;
}

/**
 * Cuántos días de la licencia caen dentro de un período de liquidación.
 *
 * El mes previsional se trata como de 30 días, igual que el resto del cálculo
 * (valor_día = sueldo / 30). Un reposo que cubre el 29, 30 y 31 de un mes de 31
 * días aporta 2 días, no 3: el día 31 no existe para efectos de remuneración y
 * contarlo dejaría el mes en 31/30.
 */
export function diasEnPeriodo(lic, mes, anio) {
  const m = parseInt(mes), a = parseInt(anio);
  if (!m || !a) return 0;
  const mm  = String(m).padStart(2, '0');
  const ini = aFecha(`${a}-${mm}-01`);
  const fin = aFecha(`${a}-${mm}-30`);
  const d = aFecha(lic.desde), h = aFecha(lic.hasta);
  if (!ini || !fin || !d || !h) return 0;

  const desde = d > ini ? d : ini;
  const hasta = h < fin ? h : fin;
  if (hasta < desde) return 0;
  return Math.round((hasta - desde) / 86400000) + 1;
}

/**
 * Días que cuentan para decidir si aplica carencia.
 *
 * Las licencias continuas —sin solución de continuidad y por el mismo cuadro
 * clínico— suman sus días de reposo para este efecto. Dos licencias de 6 días
 * encadenadas son 12: no hay carencia, y si a la primera ya se le aplicó, el
 * subsidio se reliquida desde el primer día.
 *
 * La cadena se sigue por `continuaDeId` hacia atrás y hacia adelante.
 */
export function diasParaCarencia(lic, todas) {
  const porId = new Map((todas || []).map(l => [l.id, l]));
  const vistos = new Set();
  let total = 0;

  let cur = lic;
  while (cur && !vistos.has(cur.id)) {
    vistos.add(cur.id);
    total += diasCorridos(cur.desde, cur.hasta);
    cur = cur.continuaDeId ? porId.get(cur.continuaDeId) : null;
  }
  let crecio = true;
  while (crecio) {
    crecio = false;
    for (const l of todas || []) {
      if (!vistos.has(l.id) && l.continuaDeId && vistos.has(l.continuaDeId)) {
        vistos.add(l.id);
        total += diasCorridos(l.desde, l.hasta);
        crecio = true;
      }
    }
  }
  return total;
}

/**
 * Licencias vigentes de un trabajador que afectan un período, en el formato
 * que espera `calcularLiquidacion` vía `licenciasRegistradas`.
 *
 * `dias` es la duración de esta licencia, `diasParaCarencia` la de toda la
 * cadena continua —que es lo que decide si hay carencia— y `diasEnPeriodo` lo
 * que efectivamente se descuenta este mes.
 */
export function licenciasDe(licencias, trabajadorId, mes, anio) {
  const propias = (licencias || []).filter(l =>
    l.trabajadorId === trabajadorId && ESTADOS_VIGENTES.includes(l.estado || 'ingresada'));

  return propias
    .map(l => ({
      id: l.id,
      folio: l.folio || '',
      tipo: l.tipo || 'comun',
      entidad: l.entidad || '',
      desde: l.desde,
      hasta: l.hasta,
      dias: diasCorridos(l.desde, l.hasta),
      diasParaCarencia: diasParaCarencia(l, propias),
      diasEnPeriodo: diasEnPeriodo(l, mes, anio),
    }))
    .filter(l => l.diasEnPeriodo > 0);
}

/** Total de días de reposo del período. Atajo para listados y KPIs. */
export function totalDiasLicencia(licencias, trabajadorId, mes, anio) {
  return licenciasDe(licencias, trabajadorId, mes, anio)
    .reduce((s, l) => s + l.diasEnPeriodo, 0);
}

/**
 * Solapamiento con otra licencia vigente del mismo trabajador.
 * Dos reposos no pueden cubrir el mismo día: se descontaría dos veces.
 * Devuelve la licencia en conflicto, o null.
 */
export function licenciaSolapada(nueva, licencias) {
  const d = aFecha(nueva.desde), h = aFecha(nueva.hasta);
  if (!d || !h) return null;
  return (licencias || []).find(l => {
    if (l.id && l.id === nueva.id) return false;
    if (l.trabajadorId !== nueva.trabajadorId) return false;
    if (!ESTADOS_VIGENTES.includes(l.estado || 'ingresada')) return false;
    const ld = aFecha(l.desde), lh = aFecha(l.hasta);
    return ld && lh && d <= lh && h >= ld;
  }) || null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Persistencia
// ─────────────────────────────────────────────────────────────────────────────

function validar({ trabajadorId, folio, desde, hasta }) {
  if (!trabajadorId)   throw new Error('Falta el trabajador');
  if (!desde || !hasta) throw new Error('Faltan las fechas de reposo');
  if (diasCorridos(desde, hasta) <= 0) throw new Error('La fecha de término es anterior al inicio');
  if (!String(folio || '').trim()) throw new Error('Falta el folio de la licencia');
}

function chequearSolape(datos, licencias) {
  const choque = licenciaSolapada(datos, licencias);
  if (choque) {
    throw new Error(
      `Se superpone con la licencia ${choque.folio || 'sin folio'} (${choque.desde} al ${choque.hasta}). ` +
      'Dos reposos no pueden cubrir el mismo día.'
    );
  }
}

export async function crearLicencia(empresaId, datos, licenciasExistentes) {
  validar(datos);
  chequearSolape(datos, licenciasExistentes);
  const ref = await addDoc(colRef(empresaId), {
    trabajadorId: datos.trabajadorId,
    folio:        String(datos.folio).trim(),
    tipo:         datos.tipo    || 'comun',
    desde:        datos.desde,
    hasta:        datos.hasta,
    entidad:      datos.entidad || '',
    estado:       datos.estado  || 'ingresada',
    continuaDeId: datos.continuaDeId || null,
    observaciones: String(datos.observaciones || '').trim(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function actualizarLicencia(empresaId, id, cambios, licenciasExistentes) {
  const patch = { updatedAt: serverTimestamp() };

  // Si cambian las fechas hay que revalidar: podrían pisar otra licencia.
  if (cambios.desde !== undefined || cambios.hasta !== undefined) {
    const actual = (licenciasExistentes || []).find(l => l.id === id) || {};
    const fusion = { ...actual, ...cambios, id };
    validar(fusion);
    chequearSolape(fusion, licenciasExistentes);
    patch.desde = fusion.desde;
    patch.hasta = fusion.hasta;
  }
  ['folio', 'tipo', 'entidad', 'estado', 'continuaDeId', 'observaciones'].forEach(k => {
    if (cambios[k] !== undefined) patch[k] = cambios[k];
  });
  await updateDoc(doc(db, 'empresas', empresaId, 'licencias', id), patch);
}

/**
 * Una licencia cuyo período ya se liquidó no se borra: se marca rechazada.
 * Borrarla cambiaría el monto de una liquidación ya emitida y dejaría el
 * archivo de Previred de ese mes sin explicación para los días declarados.
 */
export async function eliminarLicencia(empresaId, licencia, periodoLiquidado = false) {
  if (periodoLiquidado) {
    await actualizarLicencia(empresaId, licencia.id, { estado: 'rechazada' });
    return 'rechazada';
  }
  await deleteDoc(doc(db, 'empresas', empresaId, 'licencias', licencia.id));
  return 'eliminada';
}
