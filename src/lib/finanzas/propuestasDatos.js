/**
 * src/lib/finanzas/propuestasDatos.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Firestore de las propuestas de flujo de caja (empresas/{id}/flujo_propuestas).
 * Lo usan la pantalla "Propuestas" y el asistente IA.
 *
 * Mientras una propuesta no se aprueba, nada de esto toca flujo_pagos ni
 * flujo_cuentas. Al aprobarla, aplicarPropuesta escribe todos sus cambios en
 * un solo lote atómico: o entra la propuesta completa, o no entra nada.
 */
import {
  collection, doc, getDoc, getDocs, addDoc, updateDoc, writeBatch, deleteField, FieldPath,
} from "firebase/firestore";
import { db, auth } from "../firebase";
import { PREFIJO_CUENTA_NUEVA, conSigno, cuentasNuevas, esEditable, partesClave } from "./propuestas.js";

const col = (empresaId) => collection(db, "empresas", empresaId, "flujo_propuestas");
const ref = (empresaId, id) => doc(db, "empresas", empresaId, "flujo_propuestas", id);
const ahora = () => new Date().toISOString();
const quien = () => auth.currentUser?.email || "";

/** Mensaje para el usuario a partir de un error de Firestore u otro. */
export function mensajeErrorPropuesta(e) {
  if (e?.code === "permission-denied") {
    return "Firestore no permite guardar propuestas todavía. Un administrador debe publicar las reglas actualizadas (firestore.rules, regla flujo_propuestas) en la consola de Firebase.";
  }
  return e?.message || "No se pudo completar la operación.";
}

export async function listarPropuestas(empresaId) {
  const snap = await getDocs(col(empresaId));
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => String(b.actualizadaEn || b.creadaEn).localeCompare(String(a.actualizadaEn || a.creadaEn)));
}

export async function cargarPropuesta(empresaId, id) {
  const snap = await getDoc(ref(empresaId, id));
  if (!snap.exists()) throw new Error("Esa propuesta no existe.");
  return { id: snap.id, ...snap.data() };
}

export async function crearPropuesta(empresaId, { nombre, motivo = "" }) {
  const limpio = String(nombre || "").trim();
  if (!limpio) throw new Error("La propuesta necesita un nombre.");
  const r = await addDoc(col(empresaId), {
    nombre: limpio.slice(0, 120),
    motivo: String(motivo).trim().slice(0, 1000),
    estado: "borrador",
    cambios: { pagos: {}, cuentas: {} },
    creadaPor: quien(),
    creadaEn: ahora(),
    actualizadaEn: ahora(),
  });
  return r.id;
}

function exigirEditable(propuesta) {
  if (!esEditable(propuesta)) throw new Error("La propuesta ya se cerró; crea una nueva para seguir cambiando.");
}

/**
 * Propone el monto de una cuenta en una semana.
 *  monto: positivo; el signo lo pone la categoría de la cuenta.
 *  modo: "reemplazar" deja ese monto; "sumar" lo agrega al que ya tendría.
 * `datos` son los de cargarDatosCaja (para saber el monto original).
 */
export async function proponerPartida(empresaId, propuesta, datos, { cuentaId, lunes, monto, modo = "reemplazar" }) {
  exigirEditable(propuesta);
  const cuenta = [...datos.cuentas, ...cuentasNuevas(propuesta)].find(c => c.id === cuentaId);
  if (!cuenta) throw new Error("Esa cuenta no existe en el flujo ni en la propuesta.");
  const key = `${cuentaId}-${lunes}`;
  const previo = propuesta.cambios?.pagos?.[key];
  const original = datos.pagos[key] || 0;
  const base = previo ? previo.valor : original;
  const valor = modo === "sumar" ? base + conSigno(cuenta, monto) : conSigno(cuenta, monto);
  const cambio = { valor, antes: previo ? previo.antes : original };

  // Si la propuesta vuelve exactamente al original, el cambio sobra.
  const sobra = valor === original && !cuenta.esNueva;
  await updateDoc(ref(empresaId, propuesta.id),
    new FieldPath("cambios", "pagos", key), sobra ? deleteField() : cambio,
    "actualizadaEn", ahora());
  return { key, valor, original, sinCambio: sobra };
}

/** Mueve lo que tendría una cuenta en una semana a otra semana, dentro de la propuesta. */
export async function proponerMovimiento(empresaId, propuesta, datos, { cuentaId, desde, hasta }) {
  exigirEditable(propuesta);
  const kDesde = `${cuentaId}-${desde}`, kHasta = `${cuentaId}-${hasta}`;
  if (kDesde === kHasta) throw new Error("Las dos fechas caen en la misma semana.");
  const pagos = propuesta.cambios?.pagos || {};
  const valorEn = (k) => (pagos[k] ? pagos[k].valor : (datos.pagos[k] || 0));
  const monto = valorEn(kDesde);
  if (!monto) throw new Error("Esa cuenta no tiene monto en la semana de origen (las recurrencias automáticas no se mueven).");
  const destino = valorEn(kHasta) + monto;
  const antesDe = (k) => (pagos[k] ? pagos[k].antes : (datos.pagos[k] || 0));
  await updateDoc(ref(empresaId, propuesta.id),
    new FieldPath("cambios", "pagos", kDesde), { valor: 0, antes: antesDe(kDesde) },
    new FieldPath("cambios", "pagos", kHasta), { valor: destino, antes: antesDe(kHasta) },
    "actualizadaEn", ahora());
  return { monto, desde, hasta, total_destino: destino };
}

/**
 * Guarda varias celdas de la propuesta de una vez, con montos ya con signo
 * (como los escribe la planilla del flujo). Es lo que usa el modo propuesta
 * del flujo de caja al editar o arrastrar.
 *  celdas:    { "<cuentaId>-<lunes>": valor }
 *  actuales:  lo que muestra el flujo hoy en cada celda (con recurrencias)
 *  guardados: lo que hay escrito en flujo_pagos (sin recurrencias)
 * Si una celda vuelve a ser igual a la actual, deja de ser un cambio.
 * Devuelve el nuevo mapa cambios.pagos, para actualizar la pantalla.
 */
export async function guardarCeldasPropuesta(empresaId, propuesta, celdas, { actuales = {}, guardados = {} } = {}) {
  exigirEditable(propuesta);
  const pagos = { ...(propuesta.cambios?.pagos || {}) };
  const args = [];
  for (const [key, valor] of Object.entries(celdas)) {
    const esNueva = partesClave(key).cuentaId.startsWith(PREFIJO_CUENTA_NUEVA);
    if (!esNueva && valor === (actuales[key] || 0)) {
      delete pagos[key];
      args.push(new FieldPath("cambios", "pagos", key), deleteField());
    } else {
      const cambio = { valor, antes: pagos[key] ? pagos[key].antes : (guardados[key] || 0) };
      pagos[key] = cambio;
      args.push(new FieldPath("cambios", "pagos", key), cambio);
    }
  }
  if (args.length) await updateDoc(ref(empresaId, propuesta.id), ...args, "actualizadaEn", ahora());
  return pagos;
}

export async function quitarCambio(empresaId, propuesta, key) {
  exigirEditable(propuesta);
  await updateDoc(ref(empresaId, propuesta.id), new FieldPath("cambios", "pagos", key), deleteField(), "actualizadaEn", ahora());
}

/** Agrega una cuenta que solo existe en la propuesta. Devuelve su id provisorio. */
export async function agregarCuentaNueva(empresaId, propuesta, cuenta) {
  exigirEditable(propuesta);
  const nombre = String(cuenta.nombre || "").trim();
  if (!nombre) throw new Error("La cuenta necesita un nombre.");
  const categoria = cuenta.categoria === "INGRESOS" ? "INGRESOS" : "EGRESOS";
  const id = `${PREFIJO_CUENTA_NUEVA}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  await updateDoc(ref(empresaId, propuesta.id), new FieldPath("cambios", "cuentas", id), {
    nombre,
    categoria,
    subcategoria: String(cuenta.subcategoria || (categoria === "INGRESOS" ? "VENTAS" : "OPERACIONAL")).trim().toUpperCase(),
    detalle: cuenta.detalle || "",
    proyectoId: cuenta.obra || "",
    cliente: cuenta.cliente || "",
    presupuestoMensual: "",
    recurrente: !!cuenta.montoRecurrente,
    frecuenciaRecurrente: cuenta.frecuencia || "mensual",
    montoRecurrente: cuenta.montoRecurrente ? String(Math.abs(Math.round(cuenta.montoRecurrente))) : "",
    proveedorId: "",
  }, "actualizadaEn", ahora());
  return id;
}

export async function quitarCuentaNueva(empresaId, propuesta, id) {
  exigirEditable(propuesta);
  const args = [new FieldPath("cambios", "cuentas", id), deleteField()];
  for (const key of Object.keys(propuesta.cambios?.pagos || {})) {
    if (partesClave(key).cuentaId === id) args.push(new FieldPath("cambios", "pagos", key), deleteField());
  }
  await updateDoc(ref(empresaId, propuesta.id), ...args, "actualizadaEn", ahora());
}

export async function proponerColchon(empresaId, propuesta, valor) {
  exigirEditable(propuesta);
  await updateDoc(ref(empresaId, propuesta.id), "cambios.colchon", valor == null ? deleteField() : Math.abs(Math.round(valor)), "actualizadaEn", ahora());
}

/** borrador → en_revision, o cerrar sin aplicar (rechazada / descartada). */
export async function cambiarEstado(empresaId, propuesta, estado, comentario = "") {
  exigirEditable(propuesta);
  const campos = { estado, actualizadaEn: ahora() };
  if (estado === "en_revision") Object.assign(campos, { enviadaPor: quien(), enviadaEn: ahora() });
  if (estado === "rechazada" || estado === "descartada") {
    Object.assign(campos, { cerradaPor: quien(), cerradaEn: ahora(), comentarioCierre: String(comentario).slice(0, 1000) });
  }
  await updateDoc(ref(empresaId, propuesta.id), campos);
}

/**
 * Aprueba la propuesta y escribe sus cambios en el flujo, todo en un lote.
 * Las cuentas nuevas reciben su id definitivo y sus partidas se reapuntan.
 * Las partidas cambiadas pierden la marca de pagado (es otra decisión).
 * Devuelve cuántas cosas cambió.
 */
export async function aplicarPropuesta(empresaId, propuesta, comentario = "") {
  exigirEditable(propuesta);
  const batch = writeBatch(db);
  const idReal = new Map();

  for (const c of cuentasNuevas(propuesta)) {
    const nueva = doc(collection(db, "empresas", empresaId, "flujo_cuentas"));
    idReal.set(c.id, nueva.id);
    const { id: _provisorio, esNueva: _nueva, ...datosCuenta } = c;
    batch.set(nueva, { ...datosCuenta, creadoEn: ahora(), creadoPorPropuesta: propuesta.id });
  }

  let partidas = 0;
  for (const [key, c] of Object.entries(propuesta.cambios?.pagos || {})) {
    const { cuentaId, semana } = partesClave(key);
    const destino = `${idReal.get(cuentaId) || cuentaId}-${semana}`;
    batch.set(doc(db, "empresas", empresaId, "flujo_pagos", destino), { valor: c.valor || 0, updatedAt: ahora(), propuestaId: propuesta.id });
    batch.delete(doc(db, "empresas", empresaId, "flujo_pagados", destino));
    partidas++;
  }

  if (typeof propuesta.cambios?.colchon === "number") {
    batch.set(doc(db, "empresas", empresaId, "flujo_config", "colchon"), { valor: propuesta.cambios.colchon, actualizadoEn: ahora() });
  }

  batch.update(ref(empresaId, propuesta.id), {
    estado: "aplicada",
    aprobadaPor: quien(),
    aprobadaEn: ahora(),
    comentarioCierre: String(comentario).slice(0, 1000),
    actualizadaEn: ahora(),
  });
  await batch.commit();
  return { partidas, cuentas: idReal.size, colchon: typeof propuesta.cambios?.colchon === "number" };
}
