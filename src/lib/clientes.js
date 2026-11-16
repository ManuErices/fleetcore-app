/**
 * src/lib/clientes.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Maestro único de clientes por RUT (mismo patrón que terceros.js).
 *
 * La ficha es la de Rental: `empresas/{id}/rentalClients`. No hay otra
 * colección de clientes: Rental, las obras de Oficina Técnica (`clienteId`
 * del proyecto, antes solo el texto `mandante`), el Control de ventas, las
 * referencias de Finanzas y el RCV de ventas apuntan a la misma ficha.
 *
 *   · asegurarClientes crea las fichas que falten, una por RUT (buscando el
 *     RUT normalizado en TODAS las fichas, cualquiera sea su id), con id
 *     estable `rut_<rutNormalizado>`; nunca modifica una ficha existente.
 *   · El cruce (clienteDe…) es puro y vive en clientesBase.js.
 */
import { collection, doc, getDocs, writeBatch, serverTimestamp } from "firebase/firestore";
import { db, auth } from "./firebase";
import { formatearRut } from "./rut.js";
import {
  rutCliente, indiceClientes, clientePorRut, clientePorNombre, nombreCliente,
} from "./clientesBase.js";

export * from "./clientesBase.js";

const colClientes = (empresaId) => collection(db, "empresas", empresaId, "rentalClients");

/** Todas las fichas (activas e inactivas), con id. */
export async function listarClientes(empresaId) {
  if (!empresaId) return [];
  const snap = await getDocs(colClientes(empresaId));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => nombreCliente(a).localeCompare(nombreCliente(b), "es"));
}

/** Ficha con ese RUT (normalizado, cualquiera sea su id), o null. */
export async function buscarClientePorRut(empresaId, rut, lista = null) {
  if (!rutCliente(rut)) return null;
  return clientePorRut(lista || await listarClientes(empresaId), rut);
}

/** Ficha cuyo nombre normalizado es igual, solo si es única; o null. */
export async function buscarClientePorNombre(empresaId, nombre, lista = null) {
  return clientePorNombre(lista || await listarClientes(empresaId), nombre);
}

/** Datos de una ficha nueva, con la forma que Rental espera (upsertRentalClient). */
export function fichaClienteNueva(k, razonSocial, origen) {
  const nombre = String(razonSocial || "").trim() || formatearRut(k);
  return {
    nombre, rut: formatearRut(k), rutNormalizado: k, giro: "",
    representanteNombre: "", representanteRut: "", contacto: "", contactoCargo: "",
    email: "", telefono: "", direccion: "", comuna: "", ciudad: "",
    diasPago: 30, emailFacturacion: "", emailEstadosPago: "", requiereOC: true,
    notas: "", activo: true, archivos: [], origen,
    creadoPor: auth.currentUser?.email || null,
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  };
}

/**
 * Asegura que haya ficha para cada RUT y devuelve Map rutNormalizado → id
 * (con `.creados` = cuántas fichas se crearon). pares: [{ rut, razonSocial }].
 * RUT inválidos se ignoran. No modifica fichas existentes.
 */
export async function asegurarClientes(empresaId, pares, origen = "importacion") {
  const lista = await listarClientes(empresaId);
  const ix = indiceClientes(lista);
  const mapa = new Map();
  ix.porRut.forEach((c, k) => mapa.set(k, c.id));
  const ids = new Set(lista.map(c => c.id));
  const nuevos = new Map();
  (pares || []).forEach(({ rut, razonSocial }) => {
    const k = rutCliente(rut);
    if (!k || mapa.has(k) || nuevos.has(k)) return;
    nuevos.set(k, razonSocial);
  });
  const lote = [...nuevos].filter(([k]) => !ids.has(`rut_${k}`));
  for (let i = 0; i < lote.length; i += 400) {
    const batch = writeBatch(db);
    lote.slice(i, i + 400).forEach(([k, razonSocial]) => {
      const ref = doc(colClientes(empresaId), `rut_${k}`);
      // set sin merge: es una creación (la regla de creación aplica)
      batch.set(ref, fichaClienteNueva(k, razonSocial, origen));
      mapa.set(k, ref.id);
    });
    await batch.commit();
  }
  mapa.creados = lote.length;
  return mapa;
}

/** Cliente para un par { rut, razonSocial }: el existente o uno nuevo. Devuelve { id, nombre, creado }. */
export async function asegurarCliente(empresaId, { rut, razonSocial }, origen = "manual") {
  const k = rutCliente(rut);
  if (!k) throw new Error("El RUT del cliente no es válido");
  const lista = await listarClientes(empresaId);
  const existe = clientePorRut(lista, k);
  if (existe) return { id: existe.id, nombre: nombreCliente(existe), creado: false };
  const mapa = await asegurarClientes(empresaId, [{ rut: k, razonSocial }], origen);
  return { id: mapa.get(k), nombre: String(razonSocial || "").trim() || formatearRut(k), creado: true };
}

/**
 * Aplica el plan de "Vincular mandantes": escribe `clienteId` en cada obra
 * (no toca el texto `mandante`). `nuevos`: [{ clave, rut, razonSocial }] de
 * los grupos sin cliente a los que el usuario les dio RUT; se crean (o se
 * reusan si el RUT ya existe) y se vinculan sus obras.
 */
export async function aplicarVinculoMandantes(empresaId, plan, nuevos = []) {
  const mapa = nuevos.length
    ? await asegurarClientes(empresaId, nuevos.map(n => ({ rut: n.rut, razonSocial: n.razonSocial })), "mandante")
    : new Map();
  const escrituras = plan.vincular.map(v => ({ projectId: v.projectId, clienteId: v.clienteId }));
  nuevos.forEach(n => {
    const id = mapa.get(rutCliente(n.rut));
    const g = plan.sinCliente.find(x => x.clave === n.clave);
    if (id && g) g.obras.forEach(o => escrituras.push({ projectId: o.projectId, clienteId: id }));
  });
  for (let i = 0; i < escrituras.length; i += 400) {
    const batch = writeBatch(db);
    escrituras.slice(i, i + 400).forEach(e =>
      batch.update(doc(db, "empresas", empresaId, "projects", e.projectId), { clienteId: e.clienteId, updatedAt: serverTimestamp() }));
    await batch.commit();
  }
  return { obrasVinculadas: escrituras.length, clientesCreados: mapa.creados || 0 };
}
