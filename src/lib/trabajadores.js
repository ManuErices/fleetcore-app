/**
 * trabajadores.js — Acceso único a la nómina de la empresa.
 *
 * POR QUÉ EXISTE
 * ──────────────
 * La lista de trabajadores/operadores se cargaba en cada pantalla con
 * `query(col, orderBy('nombre'))` o `orderBy('apellidoPaterno')`.
 *
 * En Firestore un `orderBy` NO ordena: además FILTRA. Todo documento que no
 * tenga ese campo queda fuera del resultado, sin error ni aviso. Como cada
 * pantalla crea la ficha con campos distintos (RRHH guarda nombre +
 * apellidoPaterno, el módulo de combustible guardaba solo `nombre`, el
 * importador de remuneraciones guarda el nombre completo en `nombre`), una
 * misma persona aparecía en un listado y desaparecía en otro. Para el usuario
 * eso se ve como "se borró la base de datos de los operadores".
 *
 * Aquí se lee la colección completa y el orden se hace en memoria: ningún
 * trabajador puede quedar oculto por un campo que le falte.
 */

import { collection, getDocs } from 'firebase/firestore';
import { db } from './firebase';

/** Nombre completo, venga como venga la ficha. */
export function nombreCompletoTrabajador(t) {
  if (!t) return '';
  const partes = [t.nombres || t.nombre, t.apellidoPaterno, t.apellidoMaterno]
    .filter(Boolean)
    .map(s => String(s).trim())
    .filter(Boolean);
  // `nombre` puede venir ya con los apellidos incluidos (Operadores / importador)
  if (partes.length === 1) return partes[0];
  return partes.join(' ');
}

/** Orden alfabético por apellido y, si no hay, por nombre. */
export function compararTrabajadores(a, b) {
  const clave = (t) => (
    (t?.apellidoPaterno || '').trim() ||
    (t?.nombre || '').trim() ||
    (t?.nombres || '').trim()
  ).toLocaleLowerCase('es');
  return clave(a).localeCompare(clave(b), 'es');
}

/**
 * Trae TODA la nómina de la empresa, ordenada en memoria.
 * Lanza el error si la lectura falla: quien llame debe distinguir
 * "no hay trabajadores" de "no se pudo leer".
 */
export async function fetchTrabajadores(empresaId) {
  if (!empresaId) return [];
  const snap = await getDocs(collection(db, 'empresas', empresaId, 'trabajadores'));
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort(compararTrabajadores);
}

// ─── Maestro de trabajadores por RUT ────────────────────────────────────────
//
// Una ficha por persona (RUT). RRHH es dueño de la ficha; los demás módulos
// (importador de remuneraciones de Oficina Técnica, combustible de WorkFleet,
// Admin → Operadores) solo la buscan por RUT y, si no existe, la crean con lo
// mínimo. Nunca reemplazan nombre, centro de costo ni datos previsionales que
// ya estén en la ficha: solo completan campos vacíos.

/** RUT sin puntos ni guion, con DV en mayúscula ("12345678K"); "" si no es válido. */
export function rutTrabajador(rut) {
  const n = String(rut ?? '').toUpperCase().replace(/[^0-9K]/g, '');
  if (n.length < 7) return '';
  const cuerpo = n.slice(0, -1), dv = n.slice(-1);
  let suma = 0, mul = 2;
  for (let i = cuerpo.length - 1; i >= 0; i--) { suma += Number(cuerpo[i]) * mul; mul = mul === 7 ? 2 : mul + 1; }
  const r = 11 - (suma % 11);
  const esperado = r === 11 ? '0' : r === 10 ? 'K' : String(r);
  return esperado === dv ? n : '';
}

/** "12.345.678-K" */
export function formatearRutTrabajador(rut) {
  const n = rutTrabajador(rut) || String(rut ?? '').toUpperCase().replace(/[^0-9K]/g, '');
  if (n.length < 2) return String(rut ?? '');
  const cuerpo = n.slice(0, -1).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${cuerpo}-${n.slice(-1)}`;
}

/** Ficha con ese RUT (ignorando puntos, guion y mayúsculas). */
export function buscarTrabajadorPorRut(lista, rut) {
  const k = rutTrabajador(rut);
  if (!k) return null;
  return (lista || []).find(t => rutTrabajador(t.rut) === k) || null;
}

/**
 * ¿La ficha está vigente? Sin campo `estado` cuenta como activa (fichas
 * antiguas); 'inactivo' y 'finiquitado' quedan fuera de los selectores.
 */
export function trabajadorActivo(t) {
  return !!t && (t.estado === undefined || t.estado === null || t.estado === '' || t.estado === 'activo');
}

/** Nombre en minúsculas, sin tildes ni espacios repetidos (para comparar). */
export function normalizarNombrePersona(s) {
  return String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9ñ ]/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Ficha cuyo nombre completo coincide con `nombre` (normalizado). Solo
 * devuelve una si hay exactamente una coincidencia: con homónimos no adivina.
 */
export function buscarTrabajadorPorNombre(lista, nombre) {
  const k = normalizarNombrePersona(nombre);
  if (!k) return null;
  const hits = (lista || []).filter(t => normalizarNombrePersona(nombreCompletoTrabajador(t)) === k);
  return hits.length === 1 ? hits[0] : null;
}

const vacio = (v) => v === undefined || v === null || v === '';

/**
 * Devuelve { id, creado, trabajador } de la ficha con ese RUT, creándola si no
 * existe. Si existe, solo completa los campos que estén vacíos.
 *   datos.rut obligatorio y válido (si no, se lanza error: sin RUT no hay maestro).
 *   opciones.lista: trabajadores ya cargados (evita releer).
 */
export async function asegurarTrabajador(empresaId, datos, { origen = '', lista } = {}) {
  const { addDoc, doc, setDoc, serverTimestamp } = await import('firebase/firestore');
  const k = rutTrabajador(datos?.rut);
  if (!k) throw new Error(`RUT inválido: "${datos?.rut ?? ''}"`);
  const todos = lista || await fetchTrabajadores(empresaId);
  const existente = buscarTrabajadorPorRut(todos, k);
  const limpios = { ...datos, rut: formatearRutTrabajador(k) };
  Object.keys(limpios).forEach(c => { if (limpios[c] === undefined) delete limpios[c]; });
  if (existente) {
    const faltantes = {};
    Object.entries(limpios).forEach(([c, v]) => { if (vacio(existente[c]) && !vacio(v)) faltantes[c] = v; });
    delete faltantes.estado;   // el estado lo maneja RRHH
    if (Object.keys(faltantes).length) {
      await setDoc(doc(db, 'empresas', empresaId, 'trabajadores', existente.id),
        { ...faltantes, actualizadoDesde: origen, updatedAt: serverTimestamp() }, { merge: true });
    }
    return { id: existente.id, creado: false, trabajador: { ...existente, ...faltantes } };
  }
  const nuevo = { estado: 'activo', ...limpios, origen, createdAt: serverTimestamp() };
  const ref = await addDoc(collection(db, 'empresas', empresaId, 'trabajadores'), nuevo);
  const trabajador = { id: ref.id, ...nuevo };
  todos.push(trabajador);
  return { id: ref.id, creado: true, trabajador };
}

// ─── Duplicados y fusión ───────────────────────────────────────────────────

/** Colecciones que guardan el id de un trabajador (en la raíz o anidado). */
export const REFERENCIAS_TRABAJADOR = [
  'remuneraciones', 'contratos', 'finiquitos', 'anticipos', 'licencias', 'ausencias', 'vacaciones',
  'asistencia', 'asignaciones_turnos', 'anexos', 'documentos_trabajadores', 'items_pago',
  'employeeMonthlyData', 'employeeAssignments', 'reportes_combustible', 'reportes_detallados',
  'workOrders', 'solicitudes_pasajes', 'trabajadores_portal',
];
const CAMPOS_TRABAJADOR = new Set(['trabajadorId', 'employeeId', 'operadorId', 'receptorId', 'repartidorId', 'mecanicoId', 'solicitanteId', 'empleadoId', 'operadorProveedorId']);

/** Reemplaza ids viejos por el nuevo dentro de un valor; [valor, cambió]. */
export function reemplazarIdsTrabajador(valor, viejos, nuevo) {
  if (Array.isArray(valor)) {
    let c = false;
    const arr = valor.map(v => { const [x, ch] = reemplazarIdsTrabajador(v, viejos, nuevo); c ||= ch; return x; });
    return [c ? arr : valor, c];
  }
  if (valor && typeof valor === 'object' && !(valor instanceof Date) && typeof valor.toDate !== 'function') {
    let c = false;
    const obj = {};
    Object.entries(valor).forEach(([k, v]) => {
      if (CAMPOS_TRABAJADOR.has(k) && typeof v === 'string' && viejos.has(v)) { obj[k] = nuevo; c = true; return; }
      const [x, ch] = reemplazarIdsTrabajador(v, viejos, nuevo);
      obj[k] = x; c ||= ch;
    });
    return [c ? obj : valor, c];
  }
  return [valor, false];
}

/** Grupos de fichas con el mismo RUT; la primera es la que tiene más datos. */
export function duplicadosTrabajadores(lista) {
  const g = new Map();
  (lista || []).forEach(t => { const k = rutTrabajador(t.rut); if (k) g.set(k, [...(g.get(k) || []), t]); });
  const datos = (t) => Object.values(t).filter(v => !vacio(v)).length;
  return [...g.entries()].filter(([, ts]) => ts.length > 1)
    .map(([rut, ts]) => ({ rut, trabajadores: ts.sort((a, b) => datos(b) - datos(a)) }));
}

/**
 * Fusiona `otrosIds` en `principalId`: re-apunta todas las referencias,
 * completa la ficha principal con lo que solo tenían las otras y las borra.
 */
export async function fusionarTrabajadores(empresaId, principalId, otrosIds, onProgreso) {
  const { doc, getDocs, writeBatch, setDoc, deleteDoc, serverTimestamp } = await import('firebase/firestore');
  const viejos = new Set(otrosIds.filter(id => id && id !== principalId));
  if (!viejos.size) return { referencias: {} };
  const todos = await fetchTrabajadores(empresaId);
  const principal = todos.find(t => t.id === principalId);
  if (!principal) throw new Error('No se encontró la ficha principal');
  const otros = todos.filter(t => viejos.has(t.id));

  const referencias = {};
  for (const nombre of REFERENCIAS_TRABAJADOR) {
    onProgreso?.(nombre);
    let snap;
    try { snap = await getDocs(collection(db, 'empresas', empresaId, nombre)); } catch { continue; }
    const cambios = [];
    snap.docs.forEach(d => {
      const nuevos = {};
      Object.entries(d.data()).forEach(([k, v]) => {
        if (CAMPOS_TRABAJADOR.has(k) && typeof v === 'string' && viejos.has(v)) { nuevos[k] = principalId; return; }
        const [x, c] = reemplazarIdsTrabajador(v, viejos, principalId);
        if (c) nuevos[k] = x;
      });
      if (Object.keys(nuevos).length) cambios.push([d.ref, nuevos]);
    });
    for (let i = 0; i < cambios.length; i += 400) {
      const batch = writeBatch(db);
      cambios.slice(i, i + 400).forEach(([ref, nuevos]) => batch.update(ref, nuevos));
      await batch.commit();
    }
    if (cambios.length) referencias[nombre] = cambios.length;
  }

  const completar = {};
  otros.forEach(o => Object.entries(o).forEach(([k, v]) => {
    if (k === 'id') return;
    if (vacio(principal[k]) && vacio(completar[k]) && !vacio(v)) completar[k] = v;
  }));
  await setDoc(doc(db, 'empresas', empresaId, 'trabajadores', principalId), {
    ...completar,
    rut: formatearRutTrabajador(principal.rut || otros[0]?.rut),
    fusionados: [...(principal.fusionados || []), ...otros.map(o => ({ id: o.id, nombre: nombreCompletoTrabajador(o), origen: o.origen || '' }))],
    updatedAt: serverTimestamp(), actualizadoDesde: 'fusion',
  }, { merge: true });
  for (const o of otros) await deleteDoc(doc(db, 'empresas', empresaId, 'trabajadores', o.id));
  return { referencias };
}
