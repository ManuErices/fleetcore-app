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
 * matchMachine: búsqueda flexible en tipo, patente, código, marca y modelo.
 */
export function matchMachine(m, search) {
  if (!search?.trim()) return true;
  const hay  = normalize([m.tipo, m.type, m.patente, m.codigo, m.code, m.marca, m.modelo, m.name, m.nombre].join(' '));
  const words = normalize(search).split(/\s+/).filter(Boolean);
  return words.every(w => hay.includes(w));
}

/**
 * machineTitulo: nombre "humano" del equipo (Bulldozer, Motoniveladora, Camioneta…).
 * Las máquinas creadas desde Administración guardan el tipo en `type`; las creadas
 * desde el módulo de combustible lo guardan en `tipo`. Se usan ambos, y si no hay
 * tipo se cae al nombre / marca+modelo antes de mostrar "Sin tipo".
 */
export function machineTitulo(m) {
  if (!m) return 'Sin tipo';
  const tipo = (m.tipo || m.type || '').trim();
  if (tipo) return tipo;
  const nombre = (m.name || m.nombre || '').trim();
  if (nombre) return nombre;
  const marcaModelo = [m.marca, m.modelo].filter(Boolean).join(' ').trim();
  return marcaModelo || 'Sin tipo';
}

/**
 * machinePatente: patente (o código) de la máquina.
 */
export function machinePatente(m) {
  if (!m) return 'S/P';
  const patente = (m.patente || '').trim();
  const codigo = (m.codigo || m.code || '').trim();
  if (patente && codigo && patente !== codigo) return `${codigo} · ${patente}`;
  return patente || codigo || (m.modelo || '').trim() || 'S/P';
}

/**
 * machineLabel: "TIPO · PATENTE" en una sola línea (listas compactas, vouchers).
 */
export function machineLabel(m) {
  if (!m) return '';
  const titulo = machineTitulo(m);
  const patente = machinePatente(m);
  return patente && patente !== 'S/P' ? `${titulo} · ${patente}` : titulo;
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
