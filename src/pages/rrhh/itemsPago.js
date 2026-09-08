/**
 * itemsPago.js — src/pages/rrhh/itemsPago.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Catálogo de ítems de pago (haberes y descuentos) por empresa.
 *
 * Hasta ahora los ítems eran un arreglo fijo de 10 entradas en el código, cada
 * una apuntando a un campo que el motor de cálculo ya conocía. Agregar un bono
 * nuevo requería tocar el código, así que en la práctica todo terminaba en
 * "Otros Imponibles" y la liquidación no decía qué se estaba pagando.
 *
 * Ahora conviven dos clases de ítem:
 *
 *   · FIJOS   — los 10 de siempre. Escriben en su campo propio del documento
 *               (`bonoProduccion`, `viaticos`, …). No se pueden borrar ni
 *               renombrar: el cálculo, el PDF y Previred los tratan aparte.
 *
 *   · CUSTOM  — creados por la empresa en `empresas/{id}/items_pago`. Escriben
 *               en el arreglo `items` de la liquidación, con nombre y tipo
 *               congelados en el momento de la carga.
 *
 * El nombre se congela a propósito: si alguien renombra un ítem del catálogo,
 * las liquidaciones ya emitidas siguen diciendo lo que decían cuando se
 * firmaron. Un documento laboral no puede cambiar retroactivamente.
 */

import { useEffect, useMemo, useState } from 'react';
import { db } from '../../lib/firebase';
import {
  collection, doc, onSnapshot, addDoc, updateDoc,
  query, orderBy, serverTimestamp,
} from 'firebase/firestore';
import { TIPOS_ITEM_PAGO, normalizarItemsPago } from './shared';

export { TIPOS_ITEM_PAGO, normalizarItemsPago };

// ─── Ítems fijos ──────────────────────────────────────────────────────────────
// `campo` es el campo del documento de remuneración que el motor ya consume.
// `tipo` los alinea con la clasificación de los personalizados para poder
// mostrarlos juntos en la UI.
export const ITEMS_FIJOS = [
  { id: 'horasExtra',         label: 'Horas Extra',         campo: 'horasExtra',         tipo: 'imponible',   unidad: 'horas', fijo: true, auxiliar: { campo: 'valorHoraExtra', label: 'Valor hora', unidad: '$' } },
  { id: 'bonoProduccion',     label: 'Bono de Producción',  campo: 'bonoProduccion',     tipo: 'imponible',   unidad: '$',     fijo: true },
  { id: 'otrosImponibles',    label: 'Otros Imponibles',    campo: 'otrosImponibles',    tipo: 'imponible',   unidad: '$',     fijo: true },
  { id: 'bonoColacion',       label: 'Colación',            campo: 'bonoColacion',       tipo: 'noImponible', unidad: '$',     fijo: true },
  { id: 'bonoMovilizacion',   label: 'Movilización',        campo: 'bonoMovilizacion',   tipo: 'noImponible', unidad: '$',     fijo: true },
  { id: 'viaticos',           label: 'Viáticos',            campo: 'viaticos',           tipo: 'noImponible', unidad: '$',     fijo: true },
  { id: 'otrosNoImponibles',  label: 'Otros No Imponibles', campo: 'otrosNoImponibles',  tipo: 'noImponible', unidad: '$',     fijo: true },
  { id: 'anticipo',           label: 'Anticipo',            campo: 'anticipo',           tipo: 'descuento',   unidad: '$',     fijo: true },
  { id: 'descuentoAdicional', label: 'Descuento Adicional', campo: 'descuentoAdicional', tipo: 'descuento',   unidad: '$',     fijo: true },
];

// Días trabajados no es un haber ni un descuento: es la base del prorrateo.
// Se mantiene en la carga masiva pero fuera de la clasificación de ítems.
export const ITEM_DIAS = {
  id: 'diasTrabajados', label: 'Días Trabajados', campo: 'diasTrabajados',
  tipo: 'base', unidad: 'días', fijo: true,
};

export const COLOR_GRUPO = {
  Imponible:      { bg: TIPOS_ITEM_PAGO.imponible.bg,   text: TIPOS_ITEM_PAGO.imponible.text },
  'No imponible': { bg: TIPOS_ITEM_PAGO.noImponible.bg, text: TIPOS_ITEM_PAGO.noImponible.text },
  Descuento:      { bg: TIPOS_ITEM_PAGO.descuento.bg,   text: TIPOS_ITEM_PAGO.descuento.text },
  Base:           { bg: '#f1f5f9', text: '#475569' },
};

export const grupoDe   = (tipo) => TIPOS_ITEM_PAGO[tipo]?.grupo || 'Base';
export const colorDe   = (tipo) => COLOR_GRUPO[grupoDe(tipo)] || COLOR_GRUPO.Base;

// ─── Firestore ────────────────────────────────────────────────────────────────

const colRef = (empresaId) => collection(db, 'empresas', empresaId, 'items_pago');

/**
 * Ítems del catálogo de la empresa, en vivo.
 * Devuelve los personalizados activos ya normalizados y ordenados por nombre.
 */
export function useItemsPago(empresaId) {
  const [custom,  setCustom]  = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  useEffect(() => {
    if (!empresaId) { setCustom([]); setLoading(false); return; }
    setLoading(true);
    // Sin orderBy en la query: los documentos antiguos podrían no tener el
    // campo y quedarían fuera del resultado. Se ordena en memoria.
    const unsub = onSnapshot(
      colRef(empresaId),
      snap => {
        setCustom(
          snap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .filter(i => i.activo !== false)
            .map(i => ({
              id:        i.id,
              label:     i.nombre || 'Sin nombre',
              nombre:    i.nombre || 'Sin nombre',
              tipo:      TIPOS_ITEM_PAGO[i.tipo] ? i.tipo : 'imponible',
              prorratea: i.prorratea === true,
              unidad:    '$',
              fijo:      false,
            }))
            .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
        );
        setLoading(false);
      },
      err => { setError(err); setLoading(false); }
    );
    return unsub;
  }, [empresaId]);

  // Fijos primero (es el orden en que la gente los busca), luego los propios
  const todos = useMemo(() => [...ITEMS_FIJOS, ...custom], [custom]);

  return { items: todos, itemsCustom: custom, loading, error };
}

export async function crearItemPago(empresaId, { nombre, tipo, prorratea = false }) {
  const limpio = String(nombre || '').trim();
  if (!limpio) throw new Error('El nombre del ítem es obligatorio');
  if (!TIPOS_ITEM_PAGO[tipo]) throw new Error('Tipo de ítem inválido');
  const ref = await addDoc(colRef(empresaId), {
    nombre: limpio,
    tipo,
    prorratea: prorratea === true,
    activo: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function actualizarItemPago(empresaId, id, cambios) {
  const patch = { updatedAt: serverTimestamp() };
  if (cambios.nombre !== undefined) {
    const limpio = String(cambios.nombre).trim();
    if (!limpio) throw new Error('El nombre del ítem es obligatorio');
    patch.nombre = limpio;
  }
  if (cambios.tipo !== undefined) {
    if (!TIPOS_ITEM_PAGO[cambios.tipo]) throw new Error('Tipo de ítem inválido');
    patch.tipo = cambios.tipo;
  }
  if (cambios.prorratea !== undefined) patch.prorratea = cambios.prorratea === true;
  await updateDoc(doc(db, 'empresas', empresaId, 'items_pago', id), patch);
}

/**
 * Los ítems no se borran: se archivan.
 * Un ítem eliminado de verdad dejaría liquidaciones apuntando a un `itemId`
 * inexistente y rompería cualquier reporte agrupado por ítem.
 */
export async function archivarItemPago(empresaId, id) {
  await updateDoc(doc(db, 'empresas', empresaId, 'items_pago', id), {
    activo: false, updatedAt: serverTimestamp(),
  });
}

// ─── Aplicar un ítem a una liquidación ────────────────────────────────────────

/** Snapshot que se guarda dentro de `items` para un ítem del catálogo. */
export function snapshotItem(item, monto) {
  return {
    itemId:    item.id,
    nombre:    item.nombre || item.label,
    tipo:      item.tipo,
    monto:     Math.max(0, Math.round(Number(monto) || 0)),
    prorratea: item.prorratea === true,
  };
}

/**
 * Inserta o reemplaza un ítem personalizado dentro del arreglo `items`.
 * Un monto en 0 lo saca de la liquidación en vez de dejar una línea vacía.
 */
export function upsertItemEnLista(itemsActuales, item, monto) {
  const lista = normalizarItemsPago(itemsActuales).filter(i => i.itemId !== item.id);
  const nuevo = snapshotItem(item, monto);
  return nuevo.monto > 0 ? [...lista, nuevo] : lista;
}

/**
 * Patch de Firestore para aplicar un ítem (fijo o personalizado) a un
 * documento de remuneración ya existente.
 *
 * Es el único lugar donde se decide "campo propio vs arreglo items": la carga
 * masiva y el modal de liquidación lo llaman los dos, así que la regla no se
 * puede desincronizar entre pantallas.
 */
export function patchItem(remActual, item, valor, valorAux) {
  if (item.fijo) {
    const patch = { [item.campo]: Number(valor) || 0 };
    if (item.auxiliar) patch[item.auxiliar.campo] = Number(valorAux) || 0;
    return patch;
  }
  return { items: upsertItemEnLista(remActual?.items, item, valor) };
}
