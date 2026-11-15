/**
 * src/lib/importacion.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Guardar filas importadas desde Excel sin duplicar.
 *
 * Los importadores de Oficina Técnica creaban un documento nuevo por fila en
 * cada importación: reimportar el mismo archivo duplicaba todo. Aquí cada
 * fila tiene una llave estable (las columnas que la identifican); si ya hay
 * un documento con esa llave se actualiza, y si hay varios (duplicados de
 * importaciones anteriores) se deja uno y se borran los demás.
 */
import { collection, doc, getDocs, writeBatch, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase";

const norm = (v) => String(v ?? "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const hash = (txt) => { let h = 5381; for (let i = 0; i < txt.length; i++) h = ((h * 33) ^ txt.charCodeAt(i)) >>> 0; return h.toString(36); };

/** Llave estable a partir de los valores de los campos indicados. */
export const llaveDe = (obj, campos) => campos.map(c => norm(obj?.[c])).join("|");

/**
 * items: objetos a guardar. campos: los que identifican una fila.
 * prefijo: prefijo del id de los documentos nuevos (ej. "sc").
 * Devuelve { nuevas, actualizadas, duplicadosEliminados }.
 */
export async function guardarSinDuplicar(empresaId, coleccion, items, campos, prefijo = "im") {
  const col = collection(db, "empresas", empresaId, coleccion);
  const snap = await getDocs(col);
  const porLlave = {};
  snap.docs.forEach(d => { (porLlave[llaveDe(d.data(), campos)] ||= []).push(d.id); });

  const ops = [];
  let nuevas = 0, actualizadas = 0, duplicadosEliminados = 0;
  const vistas = new Set();
  items.forEach(item => {
    const k = llaveDe(item, campos);
    if (vistas.has(k)) return;            // fila repetida dentro del mismo archivo
    vistas.add(k);
    const ids = porLlave[k] || [];
    const id = ids[0] || `${prefijo}_${hash(k)}_${hash([...k].reverse().join(""))}`;
    const ref = doc(col, id);
    if (ids.length) {
      actualizadas++;
      ops.push(b => b.set(ref, { ...item, empresaId, updatedAt: serverTimestamp() }, { merge: true }));
      ids.slice(1).forEach(extra => { duplicadosEliminados++; ops.push(b => b.delete(doc(col, extra))); });
    } else {
      nuevas++;
      ops.push(b => b.set(ref, { ...item, empresaId, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }));
    }
  });
  for (let i = 0; i < ops.length; i += 400) {
    const batch = writeBatch(db);
    ops.slice(i, i + 400).forEach(op => op(batch));
    await batch.commit();
  }
  return { nuevas, actualizadas, duplicadosEliminados };
}
