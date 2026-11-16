/**
 * src/lib/clientesBase.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Maestro único de clientes por RUT — parte PURA (sin Firebase), para que
 * ventasControl.js y referencias.js la usen y se prueben con node.
 * La parte con Firestore está en clientes.js.
 *
 * La ficha del cliente es la de Rental: `empresas/{id}/rentalClients` (Rental
 * ya la usa con sus ids en cotizaciones, OC, contratos y EEPP). Campos que
 * importan aquí: `nombre` (razón social, así la muestra Rental), `rut`
 * (formateado), `rutNormalizado` (fichas nuevas) y `activo`.
 *
 * Cruce de un documento con su cliente (clienteDe): primero `clienteId`,
 * después RUT, y el nombre solo como respaldo (normalizado, sin sufijos
 * societarios, y solo si calza con UN cliente).
 */
import { rutLlave, formatearRut } from "./rut.js";
import { nombreComparable } from "./finanzas/referencias.js";

/** RUT del cliente usable como llave (normalizado y válido), o "". */
export const rutCliente = (rut) => rutLlave(rut);

/** RUT genéricos del SII (consumidor final / extranjero): no identifican a un cliente. */
const RUT_GENERICOS = new Set(["666666666", "555555555", "111111111"]);
const rutUtil = (rut) => { const k = rutLlave(rut); return k && !RUT_GENERICOS.has(k) ? k : ""; };

export const nombreCliente = (c) => String(c?.nombre || c?.razonSocial || "").trim();
export const rutDeCliente = (c) => rutLlave(c?.rutNormalizado || c?.rut);
export { nombreComparable };

/** Índices para cruzar muchos documentos contra la lista de clientes. */
export function indiceClientes(lista = []) {
  const porId = new Map(), porRut = new Map(), porNombre = new Map();
  // Activos primero: si hubiera dos fichas del mismo RUT, gana la activa
  const orden = [...(lista || [])].sort((a, b) => (a?.activo === false) - (b?.activo === false));
  orden.forEach(c => {
    if (!c?.id) return;
    porId.set(c.id, c);
    const k = rutDeCliente(c);
    if (k && !porRut.has(k)) porRut.set(k, c);
    const n = nombreComparable(nombreCliente(c));
    if (n) porNombre.set(n, [...(porNombre.get(n) || []), c]);
  });
  return { porId, porRut, porNombre, lista: orden };
}

const indice = (x) => (x?.porId ? x : indiceClientes(x));

/**
 * Cliente de un documento: por clienteId, por RUT y, si no, por nombre
 * (único). Si el documento trae un RUT distinto al del cliente que calza por
 * nombre, no es ese cliente. Devuelve la ficha o null.
 */
export function clienteDe(listaOIndice, { clienteId, rut, nombre } = {}) {
  const ix = indice(listaOIndice);
  if (clienteId && ix.porId.has(clienteId)) return ix.porId.get(clienteId);
  const k = rutLlave(rut);
  if (k && ix.porRut.has(k)) return ix.porRut.get(k);
  const n = nombreComparable(nombre);
  if (!n) return null;
  const candidatos = ix.porNombre.get(n) || [];
  if (candidatos.length !== 1) return null;
  const c = candidatos[0];
  const kc = rutDeCliente(c);
  if (k && kc && k !== kc) return null;
  return c;
}

/** Lista de clientes con ese RUT (normalizado), o null. */
export const clientePorRut = (lista, rut) => (rutLlave(rut) ? indice(lista).porRut.get(rutLlave(rut)) || null : null);

/** Cliente cuyo nombre normalizado es igual (solo si es uno), o null. */
export function clientePorNombre(lista, nombre) {
  const n = nombreComparable(nombre);
  const c = n ? indice(lista).porNombre.get(n) || [] : [];
  return c.length === 1 ? c[0] : null;
}

/**
 * Llave para agrupar ventas por cliente: la ficha si se encuentra; si no, el
 * RUT; si no, el nombre normalizado. { clave, clienteId, rut, nombre }.
 */
export function claveCliente(listaOIndice, datos = {}) {
  const c = clienteDe(listaOIndice, datos);
  if (c) return { clave: `id:${c.id}`, clienteId: c.id, rut: rutDeCliente(c), nombre: nombreCliente(c) };
  const k = rutLlave(datos.rut);
  const nombre = String(datos.nombre || "").trim();
  if (k) return { clave: `rut:${k}`, clienteId: null, rut: k, nombre: nombre || formatearRut(k) };
  const n = nombreComparable(nombre);
  return n ? { clave: `nom:${n}`, clienteId: null, rut: "", nombre } : { clave: "sin", clienteId: null, rut: "", nombre: "" };
}

/**
 * Plan de "Vincular mandantes" (Admin → Proyectos): obras con texto en
 * `mandante` y sin `clienteId`. Las que calzan por nombre con una ficha van
 * a `vincular`; el resto se agrupa por mandante (normalizado) en `sinCliente`,
 * donde el usuario puede dar RUT + razón social para crear la ficha.
 */
export function planVincularMandantes(proyectos = [], clientes = []) {
  const ix = indice(clientes);
  const vincular = [], grupos = new Map();
  let yaVinculadas = 0, sinMandante = 0;
  (proyectos || []).forEach(p => {
    if (p.clienteId) { yaVinculadas++; return; }
    const mandante = String(p.mandante || "").trim();
    const n = nombreComparable(mandante);
    if (!n) { sinMandante++; return; }
    const obra = { projectId: p.id, obra: p.name || p.nombre || p.id, mandante };
    const c = clientePorNombre(ix, mandante);
    if (c) { vincular.push({ ...obra, clienteId: c.id, cliente: nombreCliente(c) }); return; }
    const g = grupos.get(n) || { clave: n, mandante, obras: [] };
    g.obras.push(obra);
    grupos.set(n, g);
  });
  const sinCliente = [...grupos.values()].sort((a, b) => a.mandante.localeCompare(b.mandante, "es"));
  return { vincular, sinCliente, yaVinculadas, sinMandante };
}

/** Normaliza un encabezado de columna ("Rut cliente" → "rutcliente"). */
const col = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");

/**
 * RUT y razón social de los clientes de un RCV de VENTAS (columnas "Rut
 * cliente" y "Razon Social"). Sin RUT genéricos (66.666.666-6 consumidor
 * final). [{ rut, razonSocial, documentos }], por razón social.
 */
export function clientesDeRCVVentas(filas = []) {
  const por = new Map();
  (filas || []).forEach(f => {
    let rut = "", razon = "";
    Object.keys(f || {}).forEach(k => {
      const c = col(k);
      if (c === "rutcliente") rut = f[k];
      else if (c === "razonsocial") razon = f[k];
    });
    const k = rutUtil(rut);
    if (!k) return;
    const e = por.get(k) || { rut: k, razonSocial: String(razon || "").trim(), documentos: 0 };
    e.documentos++;
    if (!e.razonSocial) e.razonSocial = String(razon || "").trim();
    por.set(k, e);
  });
  return [...por.values()].sort((a, b) => a.razonSocial.localeCompare(b.razonSocial, "es"));
}
