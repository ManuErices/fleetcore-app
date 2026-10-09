/**
 * anexos.js — src/pages/rrhh/anexos.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Un anexo modifica el contrato. Hasta acá solo se guardaba en su colección y
 * el contrato nunca se enteraba: un aumento de sueldo no llegaba a la
 * liquidación, una prórroga dejaba el contrato "vencido", y un plazo fijo
 * convertido a indefinido seguía cotizando cesantía como plazo fijo y, si se
 * le despedía por Art. 161, el finiquito no calculaba indemnización.
 *
 * Modelo:
 *   · El documento del contrato tiene las condiciones ACTUALES.
 *   · `historialAnexos` guarda, por anexo, cada campo cambiado con su valor
 *     anterior y posterior, y desde cuándo rige (`vigenteDesde`).
 *   · `contratoAlPeriodo` (calculo.jsx) reconstruye las condiciones de un mes
 *     pasado deshaciendo los cambios que todavía no regían.
 *   · Anular o borrar un anexo revierte sus cambios, salvo que un anexo
 *     posterior haya tocado el mismo campo: ahí se bloquea, porque revertir
 *     pisaría el cambio más nuevo.
 */

import { db } from '../../lib/firebase';
import { doc, runTransaction } from 'firebase/firestore';

const vacio = (v) => v === undefined || v === null || String(v).trim() === '';

/** Campos del contrato que cambia un anexo, según su tipo. */
export function cambiosDeAnexo(anexo) {
  const c = {};
  const set = (campo, v) => { if (!vacio(v)) c[campo] = v; };
  switch (anexo?.tipo) {
    case 'aumento_sueldo_base':
      set('sueldoBase', anexo.sueldoBase); break;
    case 'aumento_haberes':
      set('sueldoBase', anexo.sueldoBase); set('bonoColacion', anexo.bonoColacion);
      set('bonoMovilizacion', anexo.bonoMovilizacion); set('viaticos', anexo.viaticos); break;
    case 'aumento_sueldo':
      set('sueldoBase', anexo.nuevoSueldo || anexo.sueldoBase); set('bonoProduccion', anexo.bonoProduccion); break;
    case 'cambio_cargo':
      set('cargo', anexo.nuevoCargo); set('centroCosto', anexo.centroCosto); break;
    case 'cambio_jornada':
      set('jornada', anexo.jornada); set('jornadaHorasSemanales', anexo.jornadaHorasSemanales);
      set('jornadaHoraEntrada', anexo.jornadaHoraEntrada); set('jornadaHoraSalida', anexo.jornadaHoraSalida);
      set('jornadaDescripcion', anexo.jornadaDescripcion);
      if (Array.isArray(anexo.jornadaDias) && anexo.jornadaDias.length) c.jornadaDias = anexo.jornadaDias;
      break;
    case 'cambio_lugar':
      set('lugarTrabajo', anexo.lugarTrabajo); break;
    case 'cambio_empresa':
      set('empresa', anexo.nuevaEmpresa); break;
    case 'prorroga':
      set('fechaFin', anexo.fechaFin); if (!vacio(anexo.fechaFin)) c.estado = 'vigente'; break;
    case 'conversion_indefinido':
      c.tipoContrato = 'Indefinido'; c.fechaFin = ''; c.estado = 'vigente'; break;
    case 'otros_bonos':
      set('bonoColacion', anexo.bonoColacionOtros); set('bonoMovilizacion', anexo.bonoMovilizacionOtros);
      set('viaticos', anexo.viaticosOtros); break;
    default: break;   // 'otro' y tipos sin efecto en las condiciones
  }
  return c;
}

/**
 * Desde cuándo rige el cambio. La prórroga rige desde el término original:
 * así el mes en que vencía el contrato ya ve la nueva fecha y no se informa
 * un retiro que no ocurrió (Previred, LRE, días trabajados).
 */
function vigenciaDe(anexo, contrato) {
  if (anexo?.tipo === 'prorroga' && contrato?.fechaFin) {
    return contrato.fechaFin < anexo.fechaAnexo ? contrato.fechaFin : anexo.fechaAnexo;
  }
  return anexo?.fechaAnexo || new Date().toISOString().slice(0, 10);
}

/** Cuántas prórrogas tiene el contrato (para la advertencia del Art. 159 N°4). */
export function prorrogasDe(contrato) {
  return (contrato?.historialAnexos || []).filter(h => h.tipo === 'prorroga').length;
}

/** ¿Este anexo ya fue aplicado a su contrato? */
export function anexoAplicado(anexo, contrato) {
  return (contrato?.historialAnexos || []).some(h => h.anexoId === anexo?.id);
}

/**
 * Aplica (o reaplica, si se editó) un anexo a su contrato. Si el anexo quedó
 * anulado, revierte. Transaccional: el contrato y su historial cambian juntos.
 */
export async function aplicarAnexo(empresaId, anexoId, anexo) {
  if (!empresaId || !anexoId || !anexo?.contratoId) return { aplicado: false };
  if (anexo.estado === 'anulado') return revertirAnexo(empresaId, anexoId, anexo.contratoId);

  const ref = doc(db, 'empresas', empresaId, 'contratos', anexo.contratoId);
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('El contrato del anexo no existe');
    const contrato = snap.data();
    const historial = Array.isArray(contrato.historialAnexos) ? [...contrato.historialAnexos] : [];
    const previo = historial.find(h => h.anexoId === anexoId);
    const nuevos = cambiosDeAnexo(anexo);

    // Editar un anexo antiguo cuyos campos ya cambió uno posterior pisaría el
    // cambio más nuevo: se bloquea igual que al revertir.
    if (previo) {
      const posteriores = historial.filter(h => h.anexoId !== anexoId &&
        String(h.aplicadoEn || '') > String(previo.aplicadoEn || ''));
      const choque = [...Object.keys(previo.cambios || {}), ...Object.keys(nuevos)]
        .find(campo => posteriores.some(h => campo in (h.cambios || {})));
      if (choque) throw new Error(`Un anexo posterior también modifica "${choque}". Edita o anula primero ese anexo.`);
    }

    const patch = {};
    // Si el anexo se editó y dejó de tocar algún campo, ese campo vuelve a su valor anterior.
    if (previo) {
      Object.entries(previo.cambios || {}).forEach(([campo, v]) => {
        if (!(campo in nuevos)) patch[campo] = v?.antes ?? '';
      });
    }
    const cambios = {};
    Object.entries(nuevos).forEach(([campo, despues]) => {
      const antes = previo?.cambios?.[campo] ? previo.cambios[campo].antes : (contrato[campo] ?? '');
      cambios[campo] = { antes, despues };
      patch[campo] = despues;
    });

    const entrada = {
      anexoId, tipo: anexo.tipo,
      vigenteDesde: previo?.tipo === anexo.tipo && previo?.vigenteDesde && anexo.tipo === 'prorroga'
        ? previo.vigenteDesde : vigenciaDe(anexo, contrato),
      cambios, aplicadoEn: new Date().toISOString(),
    };
    const resto = historial.filter(h => h.anexoId !== anexoId);
    patch.historialAnexos = Object.keys(cambios).length ? [...resto, entrada] : resto;
    tx.update(ref, patch);
    return { aplicado: Object.keys(cambios).length > 0, cambios };
  });
}

/**
 * Revierte un anexo. Se bloquea si un anexo posterior cambió los mismos
 * campos: revertir pisaría ese cambio. Hay que anular primero el posterior.
 */
export async function revertirAnexo(empresaId, anexoId, contratoId) {
  if (!empresaId || !anexoId || !contratoId) return { revertido: false };
  const ref = doc(db, 'empresas', empresaId, 'contratos', contratoId);
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return { revertido: false };
    const contrato = snap.data();
    const historial = Array.isArray(contrato.historialAnexos) ? contrato.historialAnexos : [];
    const entrada = historial.find(h => h.anexoId === anexoId);
    if (!entrada) return { revertido: false };

    const posteriores = historial.filter(h => h.anexoId !== anexoId &&
      String(h.aplicadoEn || '') > String(entrada.aplicadoEn || ''));
    const choque = Object.keys(entrada.cambios || {}).find(campo =>
      posteriores.some(h => campo in (h.cambios || {})));
    if (choque) {
      throw new Error(`Un anexo posterior también modifica "${choque}". Anula primero ese anexo y después este.`);
    }

    const patch = {};
    Object.entries(entrada.cambios || {}).forEach(([campo, v]) => { patch[campo] = v?.antes ?? ''; });
    patch.historialAnexos = historial.filter(h => h.anexoId !== anexoId);
    tx.update(ref, patch);
    return { revertido: true };
  });
}
