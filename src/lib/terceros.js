/**
 * src/lib/terceros.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Maestro único de terceros (proveedores, subcontratistas, acreedores) por RUT.
 *
 * La ficha vive en `empresas/{id}/proveedores` (src/lib/proveedores.js). Hoy el
 * mismo proveedor aparece como texto libre en rendiciones, OC, subcontratos y
 * deuda; aquí se:
 *   · crean las fichas que falten, una por RUT (nunca se pisa una existente),
 *   · guarda en cada documento el `proveedorId` de su ficha,
 * para que todos los módulos se refieran al mismo tercero aunque lo escriban
 * distinto ("SOC. COMERCIAL X LTDA" / "Comercial X").
 *
 * Fichas nuevas: id estable `rut_<rutNormalizado>`, así dos importaciones al
 * mismo tiempo no crean dos fichas del mismo RUT.
 */
import { collection, doc, getDocs, writeBatch } from "firebase/firestore";
import { db, auth } from "./firebase";
import { normalizarRut, formatearRut, validarRut } from "./proveedores";

/** Colecciones que nombran a un tercero, y dónde guardan su RUT y nombre. */
export const FUENTES_TERCEROS = [
  { coleccion: "purchaseOrders",    nombre: "Órdenes de compra", rut: "rutProveedor",      razon: "proveedor" },
  { coleccion: "subcontratos",      nombre: "Subcontratos",      rut: "rutSubcontratista", razon: "razonSocialSubcontratista" },
  { coleccion: "rendiciones",       nombre: "Rendiciones",       rut: "rutProveedor",      razon: "proveedor" },
  { coleccion: "deuda_proveedores", nombre: "Deuda proveedores", rut: "rut",               razon: "proveedorNombre" },
  { coleccion: "reglas_gasto",      nombre: "Reglas de gasto",   rut: "rut",               razon: "razonSocial", soloFicha: true },
];

const colProv = (empresaId) => collection(db, "empresas", empresaId, "proveedores");

/** RUT usable como llave: con dígito verificador válido. */
export function rutLlave(rut) {
  const n = normalizarRut(rut);
  return n.length >= 7 && validarRut(n) ? n : "";
}

/** Mapa rutNormalizado → id de ficha, de las fichas existentes. */
export async function mapaFichas(empresaId) {
  const snap = await getDocs(colProv(empresaId));
  const mapa = new Map();
  snap.docs.forEach(d => { const k = d.data().rutNormalizado; if (k && !mapa.has(k)) mapa.set(k, d.id); });
  return mapa;
}

/**
 * Asegura que haya ficha para cada RUT y devuelve rutNormalizado → id.
 * pares: [{ rut, razonSocial }]. No modifica fichas existentes.
 */
export async function asegurarTerceros(empresaId, pares, origen = "importacion") {
  const mapa = await mapaFichas(empresaId);
  const nuevos = new Map();
  (pares || []).forEach(({ rut, razonSocial }) => {
    const k = rutLlave(rut);
    if (!k || mapa.has(k) || nuevos.has(k)) return;
    nuevos.set(k, String(razonSocial || "").trim() || formatearRut(k));
  });
  if (nuevos.size) {
    const ahora = new Date().toISOString();
    const usuario = auth.currentUser?.email || null;
    const lista = [...nuevos];
    for (let i = 0; i < lista.length; i += 400) {
      const batch = writeBatch(db);
      lista.slice(i, i + 400).forEach(([k, razonSocial]) => {
        const ref = doc(colProv(empresaId), `rut_${k}`);
        batch.set(ref, {
          razonSocial, rut: formatearRut(k), rutNormalizado: k, medioPago: "",
          transferencia: null, web: null, automatico: null,
          contacto: { email: "", telefono: "" }, ejecutivo: { nombre: "", email: "", telefono: "" },
          notas: "", origen, creadoEn: ahora, creadoPor: usuario,
        }, { merge: true });
        mapa.set(k, ref.id);
      });
      await batch.commit();
    }
  }
  return mapa;
}

/** proveedorId para un RUT, o null. */
export const idTercero = (mapa, rut) => mapa.get(rutLlave(rut)) || null;

/**
 * Qué haría la unificación, sin escribir: fichas a crear (con el nombre más
 * usado y en qué módulos aparece), documentos a vincular y documentos sin RUT.
 */
export async function planificarUnificacion(empresaId) {
  const mapa = await mapaFichas(empresaId);
  const porRut = new Map();           // k → { nombres: Map(nombre→n), fuentes: Set }
  const porFuente = {};
  const vincular = [];                // { coleccion, id, rut }

  for (const f of FUENTES_TERCEROS) {
    let snap;
    try { snap = await getDocs(collection(db, "empresas", empresaId, f.coleccion)); }
    catch { continue; }
    const r = porFuente[f.coleccion] = { nombre: f.nombre, documentos: 0, conRut: 0, sinRut: 0, yaVinculados: 0, aVincular: 0 };
    snap.docs.forEach(d => {
      const x = d.data();
      r.documentos++;
      const k = rutLlave(f.coleccion === "reglas_gasto" ? (x[f.rut] || d.id) : x[f.rut]);
      if (!k) { r.sinRut++; return; }
      r.conRut++;
      const e = porRut.get(k) || { nombres: new Map(), fuentes: new Set() };
      const nombre = String(x[f.razon] || "").trim();
      if (nombre) e.nombres.set(nombre, (e.nombres.get(nombre) || 0) + 1);
      e.fuentes.add(f.nombre);
      porRut.set(k, e);
      if (f.soloFicha) return;
      if (x.proveedorId) { r.yaVinculados++; return; }
      r.aVincular++;
      vincular.push({ coleccion: f.coleccion, id: d.id, rut: k });
    });
  }

  const crear = [];
  porRut.forEach((e, k) => {
    if (mapa.has(k)) return;
    const [razonSocial] = [...e.nombres].sort((a, b) => b[1] - a[1])[0] || [formatearRut(k)];
    crear.push({ rut: k, razonSocial, fuentes: [...e.fuentes], variantes: e.nombres.size });
  });
  crear.sort((a, b) => a.razonSocial.localeCompare(b.razonSocial));
  return { crear, vincular, porFuente, existentes: mapa.size };
}

/** Crea las fichas y escribe `proveedorId` en cada documento. */
export async function aplicarUnificacion(empresaId, plan, onProgreso) {
  const mapa = await asegurarTerceros(empresaId, plan.crear.map(c => ({ rut: c.rut, razonSocial: c.razonSocial })), "unificacion");
  let hecho = 0;
  for (let i = 0; i < plan.vincular.length; i += 400) {
    const batch = writeBatch(db);
    plan.vincular.slice(i, i + 400).forEach(v => {
      const id = mapa.get(v.rut);
      if (id) batch.update(doc(db, "empresas", empresaId, v.coleccion, v.id), { proveedorId: id });
    });
    await batch.commit();
    hecho = Math.min(plan.vincular.length, i + 400);
    onProgreso?.(hecho, plan.vincular.length);
  }
  return { fichasCreadas: plan.crear.length, documentosVinculados: hecho };
}
