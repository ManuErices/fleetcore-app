/**
 * reliquidacion.js — src/pages/rrhh/reliquidacion.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Reliquidación de un mes ya pagado.
 *
 * El ciclo real de la empresa es: las remuneraciones de agosto se transfieren
 * el último día de agosto, hasta el 5 de septiembre se corrigen y se pagan las
 * diferencias, y recién entonces se declara Previred (que se paga el 12). O
 * sea: cuando se reliquida, las cotizaciones todavía NO se han enterado. Por
 * eso no hace falta un archivo de reliquidación aparte — el Previred normal
 * del mes toma el período ya corregido.
 *
 * Modelo del documento:
 *
 *   · La reliquidación es una liquidación NUEVA del mismo período, con el mes
 *     completo recalculado. No guarda un diferencial.
 *   · `liquidacionOriginalId` apunta a la que reemplaza.
 *   · `pagoAnterior` es lo que ya se transfirió, y actúa como descuento. Lo
 *     que queda por pagar es la diferencia.
 *
 * Se recalcula el mes entero y no el diferencial porque el impuesto único es
 * progresivo: un diferencial de $50.000 mirado en aislado cae en el tramo
 * exento, cuando sobre el mes completo esa misma plata puede estar tributando.
 * La gratificación con tope y los topes imponibles tienen el mismo problema.
 */

import { db } from '../../lib/firebase';
import {
  collection, doc, getDoc, addDoc, updateDoc, deleteDoc, serverTimestamp,
} from 'firebase/firestore';
import { liquidacionDe, calcularIUT, calcularRentaTributable } from './calculo';
import { paramsDe } from './parametros';

// La UTM se resuelve por el período del documento, no por una constante: el
// impuesto único es progresivo y con una UTM vieja el sueldo equivale a más
// UTM de las que corresponde, así que sale sobrestimado.
const utmDe = (liq, utm) => utm || paramsDe({ mes: liq?.mes, anio: liq?.anio }).utm;

/** Campos que NO se copian al reliquidar: pertenecen al documento original. */
const NO_COPIAR = new Set([
  'id', 'createdAt', 'updatedAt', 'estado', 'montoPagado', 'fechaPago',
  'nominaId', 'tipo', 'liquidacionOriginalId', 'pagoAnterior', '_trabajador',
  '_contrato', '_calc', '_anticipoReg',
]);

/**
 * Lo que efectivamente se transfirió por una liquidación.
 *
 * Se prefiere `montoPagado`, que es lo que quedó registrado al emitir la
 * nómina. Si el documento es anterior al registro de pagos, se recalcula: es
 * una estimación, y la UI lo advierte para que alguien lo confirme antes de
 * emitir la diferencia.
 */
export function montoYaPagado(liq, trabajador, contrato, { utm, anticiposRegistrados, licenciasRegistradas } = {}) {
  if (liq?.montoPagado != null) {
    return { monto: Math.max(0, Math.round(liq.montoPagado)), estimado: false };
  }
  const c   = liquidacionDe(trabajador, contrato, liq, { anticiposRegistrados, licenciasRegistradas });
  const iut = calcularIUT(calcularRentaTributable(c), utmDe(liq, utm));
  return { monto: Math.max(0, Math.round(c.liquido - iut)), estimado: true };
}

/**
 * Borrador de la reliquidación a partir de la liquidación original.
 * Copia todos los haberes y descuentos para que se corrija lo que haga falta
 * y el resto quede idéntico.
 */
export function borradorDeReliquidacion(original, pagoAnterior) {
  const copia = {};
  Object.entries(original || {}).forEach(([k, v]) => {
    if (!NO_COPIAR.has(k)) copia[k] = v;
  });
  return {
    ...copia,
    tipo: 'reliquidacion',
    liquidacionOriginalId: original?.id || '',
    pagoAnterior: Math.max(0, Math.round(pagoAnterior) || 0),
    estado: 'pendiente',
    observaciones: '',
  };
}

/**
 * Diferencia por pagar de una reliquidación ya armada.
 * Puede salir negativa: significa que se pagó de más y hay que recuperarlo por
 * fuera de la nómina, porque un archivo de transferencia no admite montos
 * negativos.
 */
export function diferencialDe(rel, trabajador, contrato, { utm, anticiposRegistrados, licenciasRegistradas } = {}) {
  const c   = liquidacionDe(trabajador, contrato, rel, { anticiposRegistrados, licenciasRegistradas });
  const iut = calcularIUT(calcularRentaTributable(c), utmDe(rel, utm));
  const dif = c.liquido - iut;             // `liquido` ya trae restado pagoAnterior
  return {
    calc: c,
    iut,
    diferencial: Math.round(dif),
    aFavorEmpresa: dif < 0,
    liquidoMesCompleto: Math.round(c.liquido + (c.pagoAnterior || 0) - iut),
  };
}

export async function guardarReliquidacion(empresaId, datos, id) {
  const payload = { ...datos, updatedAt: serverTimestamp() };
  delete payload.id;
  if (id) {
    await updateDoc(doc(db, 'empresas', empresaId, 'remuneraciones', id), payload);
    return id;
  }
  const ref = await addDoc(collection(db, 'empresas', empresaId, 'remuneraciones'), {
    ...payload, createdAt: serverTimestamp(),
  });
  return ref.id;
}

/**
 * Elimina una reliquidación y devuelve el período a su estado anterior.
 * La original vuelve a ser la liquidación vigente del mes sin que haya que
 * tocarla: basta con que deje de existir el documento que la reemplazaba.
 */
export async function eliminarReliquidacion(empresaId, rel) {
  if (rel?.estado === 'pagado') {
    throw new Error('Esta reliquidación ya fue pagada. Corrígela con una nueva reliquidación en vez de borrarla.');
  }
  await deleteDoc(doc(db, 'empresas', empresaId, 'remuneraciones', rel.id));
}

/** Verifica que la original siga existiendo antes de reliquidar sobre ella. */
export async function existeOriginal(empresaId, id) {
  if (!id) return false;
  const snap = await getDoc(doc(db, 'empresas', empresaId, 'remuneraciones', id));
  return snap.exists();
}
