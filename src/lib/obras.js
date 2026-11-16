/**
 * src/lib/obras.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Obras (Oficina Técnica, `projects`) y centros de costo (RRHH, `centros_costo`)
 * como una sola dimensión.
 *
 * Cada centro de costo puede apuntar a su obra con `projectId`. Así un
 * trabajador (que tiene centro de costo), una rendición (que tiene unidad de
 * rendición con código) o una máquina se pueden llevar a la misma obra, y el
 * costo por obra sale de los datos reales y no de un Excel aparte.
 */
import { collection, getDocs } from "firebase/firestore";
import { db } from "./firebase";

const norm = (v) => String(v ?? "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export async function cargarObrasYCentros(empresaId) {
  const leer = async (c) => {
    try { return (await getDocs(collection(db, "empresas", empresaId, c))).docs.map(d => ({ id: d.id, ...d.data() })); }
    catch { return []; }
  };
  const [obras, centros] = await Promise.all([leer("projects"), leer("centros_costo")]);
  return { obras, centros };
}

/**
 * Obra para un código o nombre de centro de costo / unidad: primero el centro
 * de costo con ese código que esté vinculado a una obra, después una obra con
 * ese nombre. Devuelve el id de la obra o null.
 */
export function obraDe({ obras = [], centros = [] }, { codigo, nombre } = {}) {
  const c = norm(codigo), n = norm(nombre);
  if (c) {
    const cc = centros.find(x => norm(x.codigo) === c && x.projectId);
    if (cc) return cc.projectId;
  }
  if (n) {
    const cc = centros.find(x => norm(x.nombre) === n && x.projectId);
    if (cc) return cc.projectId;
    const o = obras.find(x => norm(x.name || x.nombre) === n);
    if (o) return o.id;
  }
  return null;
}

// ─── Obras duplicadas ──────────────────────────────────────────────────────

/** Nombre o código comparable: sin tildes, mayúsculas, signos ni espacios repetidos. */
export function normalizarObra(v) {
  return norm(v).replace(/[^a-z0-9ñ]+/g, " ").trim();
}

/**
 * Obra ya existente con el mismo código o el mismo nombre (normalizados),
 * distinta de `id` (la que se está editando). null si no hay choque.
 * Se usa antes de crear una obra desde cualquier pantalla (Proyectos,
 * Admin, combustible, agente): dos obras con el mismo nombre dividían los
 * costos y los reportes en dos.
 */
export function obraDuplicada(obras, { codigo, nombre, name, id } = {}) {
  const c = normalizarObra(codigo), n = normalizarObra(nombre ?? name);
  if (!c && !n) return null;
  return (obras || []).find(o => o.id !== id && (
    (c && normalizarObra(o.codigo) === c) ||
    (n && normalizarObra(o.name ?? o.nombre) === n)
  )) || null;
}

/** Mensaje para el usuario cuando obraDuplicada encuentra una. */
export function mensajeObraDuplicada(o) {
  const nombre = o?.name || o?.nombre || "(sin nombre)";
  const inactiva = o?.active === false ? " (desactivada: actívala en lugar de crear otra)" : "";
  return `Ya existe la obra "${nombre}"${o?.codigo ? ` (código ${o.codigo})` : ""}${inactiva}.`;
}
