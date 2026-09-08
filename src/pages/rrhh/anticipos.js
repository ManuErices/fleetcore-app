/**
 * anticipos.js — src/pages/rrhh/anticipos.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Anticipos de remuneración como proceso propio.
 *
 * Antes el anticipo era un número que alguien escribía a mano dentro de la
 * liquidación del mes. Eso descontaba bien, pero no dejaba rastro: no se sabía
 * cuándo se pagó, ni a quién se le había pagado ya, ni salía en ninguna nómina
 * bancaria. En la práctica el anticipo se transfería por fuera del sistema.
 *
 * Ahora cada anticipo es un documento con su fecha y su estado, se paga con su
 * propia nómina, y la liquidación del mes lo toma automáticamente.
 *
 * Un anticipo NO lleva cotizaciones ni impuesto: es un adelanto de dinero
 * contra la remuneración que se devengará, no una remuneración en sí. Las
 * leyes sociales se calculan una sola vez, sobre la liquidación del mes.
 */

import { useEffect, useState } from 'react';
import { db } from '../../lib/firebase';
import {
  collection, doc, onSnapshot, addDoc, updateDoc, deleteDoc, serverTimestamp,
} from 'firebase/firestore';

export const ESTADOS_ANTICIPO = {
  pendiente: { label: 'Por pagar', color: 'text-amber-700',   bg: 'bg-amber-100'   },
  pagado:    { label: 'Pagado',    color: 'text-emerald-700', bg: 'bg-emerald-100' },
  anulado:   { label: 'Anulado',   color: 'text-slate-500',   bg: 'bg-slate-100'   },
};

const colRef = (empresaId) => collection(db, 'empresas', empresaId, 'anticipos');

/** Anticipos de la empresa, en vivo. Se filtra por período en memoria. */
export function useAnticipos(empresaId) {
  const [anticipos, setAnticipos] = useState([]);
  const [loading, setLoading]     = useState(true);

  useEffect(() => {
    if (!empresaId) { setAnticipos([]); setLoading(false); return; }
    setLoading(true);
    const unsub = onSnapshot(
      colRef(empresaId),
      snap => {
        setAnticipos(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      () => setLoading(false)
    );
    return unsub;
  }, [empresaId]);

  return { anticipos, loading };
}

/**
 * Anticipos vigentes de un trabajador en un período.
 * Los anulados quedan fuera: existen solo para no perder el rastro de algo que
 * se creó por error.
 */
export function anticiposDe(anticipos, trabajadorId, mes, anio) {
  return (anticipos || []).filter(a =>
    a.trabajadorId === trabajadorId &&
    a.mes === mes && a.anio === anio &&
    a.estado !== 'anulado'
  );
}

/**
 * Total a descontar en la liquidación del período.
 *
 * Incluye los pendientes además de los pagados: un anticipo generado se va a
 * transferir antes de que se pague el sueldo, así que descontarlo recién
 * cuando esté marcado como pagado haría que la liquidación mostrara un líquido
 * que nadie va a recibir.
 */
export function totalAnticipos(anticipos, trabajadorId, mes, anio) {
  return anticiposDe(anticipos, trabajadorId, mes, anio)
    .reduce((s, a) => s + (Math.round(Number(a.monto)) || 0), 0);
}

export async function crearAnticipo(empresaId, { trabajadorId, mes, anio, monto, glosa, fecha }) {
  if (!trabajadorId) throw new Error('Falta el trabajador');
  const valor = Math.round(Number(monto) || 0);
  if (valor <= 0) throw new Error('El monto debe ser mayor a cero');
  const ref = await addDoc(colRef(empresaId), {
    trabajadorId, mes, anio,
    monto: valor,
    glosa: String(glosa || '').trim(),
    fecha: fecha || new Date().toISOString().slice(0, 10),
    estado: 'pendiente',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function actualizarAnticipo(empresaId, id, cambios) {
  const patch = { updatedAt: serverTimestamp() };
  if (cambios.monto !== undefined) {
    const valor = Math.round(Number(cambios.monto) || 0);
    if (valor <= 0) throw new Error('El monto debe ser mayor a cero');
    patch.monto = valor;
  }
  if (cambios.glosa !== undefined)  patch.glosa  = String(cambios.glosa).trim();
  if (cambios.fecha !== undefined)  patch.fecha  = cambios.fecha;
  if (cambios.estado !== undefined) patch.estado = cambios.estado;
  await updateDoc(doc(db, 'empresas', empresaId, 'anticipos', id), patch);
}

/**
 * Un anticipo ya pagado no se borra: se anula.
 * Borrarlo dejaría una línea en una nómina bancaria apuntando a nada, y la
 * liquidación del mes cambiaría de monto después de haberse emitido.
 */
export async function eliminarAnticipo(empresaId, anticipo) {
  if (anticipo.estado === 'pagado') {
    await actualizarAnticipo(empresaId, anticipo.id, { estado: 'anulado' });
    return 'anulado';
  }
  await deleteDoc(doc(db, 'empresas', empresaId, 'anticipos', anticipo.id));
  return 'eliminado';
}
