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
