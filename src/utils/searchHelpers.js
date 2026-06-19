/**
 * Helpers de búsqueda — módulo combustible/maquinaria
 * Diseñados para usuarios no técnicos (operadores 50+).
 * La búsqueda es por palabras sueltas, sin importar el orden ni acentos.
 */

const normalize = (s) =>
  (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/**
 * matchWorker: true si todas las palabras del término de búsqueda
 * aparecen en algún lugar del nombre o RUT del trabajador.
 * "Pablo Fuentealba" encuentra "PABLO GABRIEL FUENTEALBA CASTRO".
 */
export function matchWorker(emp, search) {
  if (!search?.trim()) return true;
  const hayName = normalize(emp.nombre || '');
  const hayRut  = (emp.rut || '').replace(/\D/g, '');
  const words   = normalize(search).split(/\s+/).filter(Boolean);
  return words.every(w => {
    const numW = w.replace(/\D/g, '');
    return hayName.includes(w) || (numW.length > 0 && hayRut.includes(numW));
  });
}

/**
 * matchMachine: búsqueda flexible en tipo, patente, código y modelo.
 */
export function matchMachine(m, search) {
  if (!search?.trim()) return true;
  const hay  = normalize([m.tipo, m.patente, m.codigo, m.code, m.modelo, m.name].join(' '));
  const words = normalize(search).split(/\s+/).filter(Boolean);
  return words.every(w => hay.includes(w));
}

/**
 * shortName: muestra solo primer nombre + primer apellido.
 * "PABLO GABRIEL FUENTEALBA CASTRO" → "Pablo Fuentealba"
 */
export function shortName(nombre) {
  if (!nombre) return '';
  const parts = nombre.trim().split(/\s+/);
  if (parts.length <= 2) return toTitleCase(nombre);
  const first  = parts[0];
  const family = parts.length === 3 ? parts[1] : parts[2];
  return toTitleCase(`${first} ${family}`);
}

function toTitleCase(str) {
  return str.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}
