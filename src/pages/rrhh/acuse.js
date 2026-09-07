/**
 * acuse.js — Acuse de recibo simple de liquidaciones de sueldo.
 *
 * Las liquidaciones NO requieren firma electrónica (FES) legalmente: basta
 * con dejar constancia de que el trabajador la recibió. Este acuse es gratis
 * (no consume créditos de ValidaFirma) y se guarda directo en el documento
 * de la remuneración.
 *
 * Multi-tenant: siempre bajo empresas/{empresaId}/remuneraciones/{id}.
 *
 * La regla de seguridad permite que el TRABAJADOR escriba solo el campo
 * acuseRecibo de SU propia remuneración (ver firestore.rules), y los admin
 * pueden escribirlo desde el panel RRHH.
 */

import { db } from '../../lib/firebase';
import { doc, updateDoc } from 'firebase/firestore';

/**
 * Registra el acuse de recibo de una liquidación. Idempotente: si ya está
 * aceptada, no la vuelve a escribir (conserva la fecha original).
 *
 * @param {string} empresaId
 * @param {object} remuneracion  el doc de remuneración (debe traer .id y .acuseRecibo?)
 * @param {object} meta          { origen:'trabajador'|'admin', uid, nombre }
 * @returns {Promise<object|null>} el objeto acuseRecibo escrito, o null si ya existía
 */
export async function registrarAcuseRecibo(empresaId, remuneracion, meta = {}) {
  if (!empresaId) throw new Error('empresaId requerido');
  if (!remuneracion?.id) throw new Error('remuneración inválida');
  if (remuneracion.acuseRecibo?.aceptado) return null; // ya aceptada, no re-escribir

  const acuseRecibo = {
    aceptado: true,
    fecha: new Date().toISOString(),
    origen: meta.origen === 'admin' ? 'admin' : 'trabajador',
    uid: meta.uid || null,
    nombre: meta.nombre || null,
    userAgent: typeof navigator !== 'undefined' ? String(navigator.userAgent || '').slice(0, 300) : null,
  };

  await updateDoc(
    doc(db, 'empresas', empresaId, 'remuneraciones', remuneracion.id),
    { acuseRecibo }
  );
  return acuseRecibo;
}

/** Formatea la fecha ISO del acuse para mostrar. */
export function fechaAcuse(acuseRecibo) {
  if (!acuseRecibo?.fecha) return '';
  try {
    const d = new Date(acuseRecibo.fecha);
    return d.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

export default { registrarAcuseRecibo, fechaAcuse };
