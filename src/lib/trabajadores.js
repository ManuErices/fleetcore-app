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
