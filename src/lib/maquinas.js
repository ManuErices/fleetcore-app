/**
 * src/lib/maquinas.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Maestro único de máquinas y activos (`empresas/{id}/machines`).
 *
 * Toda pantalla o importador que crea o edita una máquina pasa por aquí:
 *
 *   · guardarMaquina(empresaId, cambios, { id, original, origen })
 *       Escribe con merge y SOLO los campos que cambiaron respecto de
 *       `original` (la máquina tal como la pantalla la cargó). Así una pantalla
 *       que no conoce un campo, o que lo tiene con un valor por defecto, nunca
 *       pisa lo que escribió otro módulo (la obra que fijó Oficina Técnica, el
 *       valor de compra que puso Finanzas, el horómetro de Maquinaria…).
 *       Al crear, revisa en TODA la empresa si ya existe una máquina con la
 *       misma patente (o código, si no tiene patente) y, si existe, no crea
 *       otra: lanza MaquinaDuplicada con la existente.
 *
 *   · asegurarMaquina(empresaId, datos, origen)
 *       Para procesos automáticos (importadores, formulario de combustible):
 *       devuelve la máquina existente con esa patente/código o la crea.
 *
 * Vocabulario normalizado (lo que se guarda):
 *   ownership: OWN (propia) | LEASING | CREDITO_AUTO | RENTED (arrendada a
 *              terceros / subcontrato). OWNED y PROPIA → OWN; SUBCONTRATO y
 *              ARRENDADA → RENTED.
 *   active:    booleano. `activo` (como lo escribían Finanzas y Contabilidad)
 *              se traduce a `active`.
 *   patente:   en mayúsculas. La llave de comparación ignora guiones,
 *              puntos y espacios ("TRRH-10" = "TRRH10").
 */
import {
  collection, doc, getDoc, getDocs, addDoc, setDoc, serverTimestamp, writeBatch, deleteDoc, deleteField,
} from "firebase/firestore";
import { db, auth } from "./firebase";
import { hoyISO } from "./fechas";

const col = (empresaId) => collection(db, "empresas", empresaId, "machines");

// ─── Vocabulario ────────────────────────────────────────────────────────────

const PROPIEDAD = {
  OWN: "OWN", OWNED: "OWN", PROPIA: "OWN", PROPIO: "OWN",
  LEASING: "LEASING",
  CREDITO_AUTO: "CREDITO_AUTO", CREDITO: "CREDITO_AUTO",
  RENTED: "RENTED", ARRENDADA: "RENTED", ARRENDADO: "RENTED", SUBCONTRATO: "RENTED",
};

export const PROPIEDADES = [
  { id: "OWN",          nombre: "Propia" },
  { id: "LEASING",      nombre: "Leasing" },
  { id: "CREDITO_AUTO", nombre: "Crédito automotriz" },
  { id: "RENTED",       nombre: "Arrendada / subcontrato" },
];

export const TIPOS_ACTIVO = ["maquinaria", "vehiculo", "herramienta", "otro"];

/** Valor normalizado de `ownership` (vacío si no viene). */
export function propiedadNormal(v) {
  const k = String(v ?? "").trim().toUpperCase().replace(/\s+/g, "_");
  return k ? (PROPIEDAD[k] || k) : "";
}

/** Propia en sentido amplio: es de la empresa (aunque se esté pagando). */
export const esPropia = (m) => ["OWN", "LEASING", "CREDITO_AUTO"].includes(propiedadNormal(m?.ownership) || "OWN");
export const esArrendada = (m) => propiedadNormal(m?.ownership) === "RENTED";
export const estaActiva = (m) => m?.active !== false && m?.activo !== false;

/**
 * ¿Estaba operativa la máquina en `fecha` (AAAA-MM-DD)? Con `fechaBaja`, sí
 * hasta ese día inclusive (aunque hoy esté inactiva): así los reportes y la
 * depreciación de meses pasados la siguen contando. Sin fechaBaja, una
 * máquina inactiva no cuenta en ninguna fecha (no se sabe desde cuándo).
 */
export function activaEn(m, fecha) {
  if (!m) return false;
  if (m.fechaBaja) return !fecha || fecha <= m.fechaBaja;
  return estaActiva(m);
}

/** Llave de comparación: patente sin guiones/espacios; si no hay, el código. */
export const normalizarPatente = (p) => String(p ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
export function llaveMaquina(m) {
  const p = normalizarPatente(m?.patente);
  if (p.length >= 4) return `P:${p}`;
  const c = normalizarPatente(m?.code);
  return c.length >= 2 ? `C:${c}` : "";
}

/** Máquina existente con la misma llave (patente, o código si no hay patente). */
export function buscarMaquina(maquinas, datos, excluirId) {
  const p = normalizarPatente(datos?.patente);
  const c = normalizarPatente(datos?.code);
  if (p.length < 4 && c.length < 2) return null;
  const otras = (maquinas || []).filter(m => m.id !== excluirId);
  if (p.length >= 4) {
    const porPatente = otras.find(m => normalizarPatente(m.patente) === p);
    if (porPatente) return porPatente;
    // Equipos cuyo código es la patente (ej. "TRRH10") y que no tienen patente cargada
    const porCodigo = otras.find(m => !normalizarPatente(m.patente) && normalizarPatente(m.code) === p);
    if (porCodigo) return porCodigo;
    return null;
  }
  return otras.find(m => !normalizarPatente(m.patente) && normalizarPatente(m.code) === c) || null;
}

/** Texto para mostrar: "CODIGO · Marca Modelo (PATENTE)". */
export function nombreMaquina(m) {
  if (!m) return "";
  const desc = m.name || [m.marca, m.modelo].filter(Boolean).join(" ") || m.type || m.tipo || "";
  const id = m.code || m.patente || "";
  return [id, desc].filter(Boolean).join(" · ") + (m.patente && m.patente !== m.code ? ` (${m.patente})` : "");
}

/** Deja los datos con el vocabulario del maestro. No agrega campos que no vengan. */
export function normalizarMaquina(datos) {
  const d = { ...datos };
  delete d.id;
  if ("activo" in d) { if (!("active" in d)) d.active = d.activo !== false; delete d.activo; }
  if ("ownership" in d) d.ownership = propiedadNormal(d.ownership) || "OWN";
  if ("patente" in d) d.patente = String(d.patente ?? "").trim().toUpperCase();
  if ("code" in d) d.code = String(d.code ?? "").trim();
  if ("name" in d && typeof d.name === "string") d.name = d.name.trim();
  // `tipo` es la clase de activo (maquinaria/vehiculo/herramienta/otro, la
  // usan Finanzas y Contabilidad); la clase de equipo ("Excavadora") va en
  // `type`. Combustible escribía la clase de equipo en `tipo`.
  if (d.tipo && !TIPOS_ACTIVO.includes(String(d.tipo).toLowerCase())) {
    if (!d.type) d.type = String(d.tipo).trim();
    delete d.tipo;
  }
  Object.keys(d).forEach(k => { if (d[k] === undefined) delete d[k]; });
  return d;
}

const igual = (a, b) => {
  if (a === b) return true;
  const vacio = (x) => x === undefined || x === null || x === "";
  if (vacio(a) && vacio(b)) return true;
  if (typeof a === "object" || typeof b === "object") return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  return String(a) === String(b);
};

/** Solo los campos de `nuevos` que difieren de `original`. */
export function camposCambiados(nuevos, original) {
  if (!original) return nuevos;
  const orig = normalizarMaquina(original);
  const salida = {};
  Object.entries(nuevos).forEach(([k, v]) => { if (!igual(v, orig[k])) salida[k] = v; });
  return salida;
}

// ─── Historial de obras ────────────────────────────────────────────────────
//
// `projectId` es la obra ACTUAL. `historialObras` guarda por dónde ha pasado
// la máquina: [{ projectId, desde: "AAAA-MM-DD" | null, hasta: … | null }]
// (hasta null = sigue ahí; desde null = desde antes de que existiera el
// historial). guardarMaquina lo mantiene solo cada vez que cambia la obra,
// venga el cambio de Admin, Maquinaria, Oficina Técnica, Finanzas o el agente.

// Fecha de hoy en Chile (la del dispositivo podía ser otra zona horaria).
export { hoyISO };

/** Historial tras mover la máquina de `anterior` a `nueva` en `fecha`. */
export function moverDeObra(historial, anterior, nueva, fecha = hoyISO()) {
  if ((anterior || null) === (nueva || null)) return historial || [];
  let h = (historial || []).map(e => ({ ...e }));
  if (!h.length && anterior) h.push({ projectId: anterior, desde: null, hasta: null });
  h.forEach(e => { if (!e.hasta) e.hasta = fecha; });
  // Un tramo abierto y cerrado el mismo día era una corrección: se descarta
  h = h.filter(e => !(e.desde && e.desde === e.hasta && e.desde === fecha));
  if (nueva) h.push({ projectId: nueva, desde: fecha, hasta: null });
  return h;
}

/** Tramos de obra de la máquina (si no hay historial, la obra actual sin fechas). */
export function tramosObra(m) {
  if (m?.historialObras?.length) return m.historialObras;
  return m?.projectId ? [{ projectId: m.projectId, desde: null, hasta: null }] : [];
}

/** ¿Estuvo en la obra en algún momento entre desde y hasta (AAAA-MM-DD, opcionales)? */
export function estuvoEnObra(m, projectId, desde, hasta) {
  if (!projectId) return true;
  if (m?.projectId === projectId && (!hasta || !m.historialObras?.length ||
    tramosObra(m).some(e => e.projectId === projectId && !e.hasta && (!e.desde || e.desde <= hasta)))) return true;
  return tramosObra(m).some(e => e.projectId === projectId
    && (!hasta || !e.desde || e.desde <= hasta)
    && (!desde || !e.hasta || e.hasta >= desde));
}

/** Obra en que estaba la máquina en una fecha (AAAA-MM-DD). */
export function obraEnFecha(m, fecha) {
  const t = tramosObra(m).filter(e => (!e.desde || e.desde <= fecha) && (!e.hasta || e.hasta >= fecha));
  return (t[t.length - 1] || {}).projectId || (m?.historialObras?.length ? null : m?.projectId || null);
}

// ─── Lectura ────────────────────────────────────────────────────────────────

export async function listarMaquinas(empresaId) {
  const snap = await getDocs(col(empresaId));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ─── Escritura ──────────────────────────────────────────────────────────────

export class MaquinaDuplicada extends Error {
  constructor(existente) {
    super(`Ya existe una máquina con esa ${normalizarPatente(existente.patente) ? "patente" : "código"}: ${nombreMaquina(existente)}. Edita esa ficha en vez de crear otra.`);
    this.name = "MaquinaDuplicada";
    this.existente = existente;
  }
}

/**
 * Crea o actualiza una máquina.
 *   id        → actualiza esa ficha (merge).
 *   original  → la ficha como la cargó la pantalla; solo se escriben los
 *               campos que cambiaron respecto de ella.
 *   origen    → quién escribe ("oficina-tecnica", "admin", "finanzas"…), queda
 *               en `actualizadoDesde`.
 *   maquinas  → lista ya cargada (evita releer la colección al crear).
 * Devuelve el id.
 */
export async function guardarMaquina(empresaId, datos, { id, original, origen = "", maquinas, fechaObra } = {}) {
  if (!empresaId) throw new Error("Falta la empresa");
  const limpios = normalizarMaquina(datos);
  const usuario = auth.currentUser?.email || null;
  const lista = (limpios.patente !== undefined || limpios.code !== undefined)
    ? (maquinas || await listarMaquinas(empresaId)) : null;

  if (id) {
    const cambios = camposCambiados(limpios, original);
    if (lista && (cambios.patente !== undefined || cambios.code !== undefined)) {
      const otra = buscarMaquina(lista, { patente: limpios.patente ?? original?.patente, code: limpios.code ?? original?.code }, id);
      if (otra) throw new MaquinaDuplicada(otra);
    }
    if (!Object.keys(cambios).length) return id;
    if (cambios.projectId !== undefined && cambios.historialObras === undefined) {
      // Se lee la ficha actual (no la que tenía la pantalla) para no perder tramos
      let actual = original || {};
      try { const snap = await getDoc(doc(col(empresaId), id)); if (snap.exists()) actual = snap.data(); } catch { /* sin conexión: lo de la pantalla */ }
      if ((actual.projectId || null) === (cambios.projectId || null)) delete cambios.projectId;
      else cambios.historialObras = moverDeObra(actual.historialObras, actual.projectId, cambios.projectId, fechaObra || hoyISO());
      if (!Object.keys(cambios).length) return id;
    }
    await setDoc(doc(col(empresaId), id), {
      ...cambios, updatedAt: serverTimestamp(), actualizadoPor: usuario, actualizadoDesde: origen,
    }, { merge: true });
    return id;
  }

  const existente = buscarMaquina(lista || [], limpios);
  if (existente) throw new MaquinaDuplicada(existente);
  const ref = await addDoc(col(empresaId), {
    ownership: "OWN", active: true,
    ...limpios,
    ...(limpios.projectId && !limpios.historialObras
      ? { historialObras: [{ projectId: limpios.projectId, desde: fechaObra || hoyISO(), hasta: null }] } : {}),
    createdAt: serverTimestamp(), creadoPor: usuario, creadoDesde: origen,
  });
  return ref.id;
}

/**
 * Para procesos automáticos: devuelve { id, creada } de la máquina con esa
 * patente/código, creándola si no existe. Si existe, solo completa los campos
 * que estén vacíos en la ficha (nunca reemplaza datos).
 */
export async function asegurarMaquina(empresaId, datos, { origen = "", maquinas } = {}) {
  const lista = maquinas || await listarMaquinas(empresaId);
  const limpios = normalizarMaquina(datos);
  const existente = buscarMaquina(lista, limpios);
  if (existente) {
    const faltantes = {};
    Object.entries(limpios).forEach(([k, v]) => {
      const actual = existente[k];
      if ((actual === undefined || actual === null || actual === "") && v !== "" && v != null) faltantes[k] = v;
    });
    // La propiedad por defecto de un importador no reemplaza la de la ficha
    delete faltantes.ownership; delete faltantes.active;
    if (Object.keys(faltantes).length) {
      await setDoc(doc(col(empresaId), existente.id), {
        ...faltantes, updatedAt: serverTimestamp(), actualizadoDesde: origen,
      }, { merge: true });
    }
    return { id: existente.id, creada: false, maquina: { ...existente, ...faltantes } };
  }
  const id = await guardarMaquina(empresaId, limpios, { origen, maquinas: lista });
  const maquina = { id, ownership: "OWN", active: true, ...limpios };
  lista.push(maquina);
  return { id, creada: true, maquina };
}

// ─── Baja ───────────────────────────────────────────────────────────────────

const ESTADOS_CONTRATO_CERRADO = ["finalizado", "terminado", "anulado", "cancelado", "cerrado"];

/**
 * Da de baja una máquina (venta, siniestro, fin de vida útil…) sin borrar su
 * historia: queda `active: false`, `fechaBaja` ("AAAA-MM-DD") y `motivoBaja`,
 * y se cierra su tramo de obra en esa fecha. Contabilidad la deprecia hasta
 * el mes de la baja; los reportes de antes de la fecha la siguen mostrando.
 * Se rechaza si la máquina está arrendada en un contrato de rental activo:
 * primero hay que finalizar ese contrato.
 */
export async function darDeBajaMaquina(empresaId, machine, { fecha, motivo = "" } = {}) {
  if (!empresaId || !machine?.id) throw new Error("Falta la máquina");
  const f = fecha || hoyISO();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f)) throw new Error(`Fecha de baja inválida: "${f}" (usa AAAA-MM-DD)`);
  let actual = machine;
  try { const snap = await getDoc(doc(col(empresaId), machine.id)); if (snap.exists()) actual = { id: machine.id, ...snap.data() }; } catch { /* sin conexión: lo de la pantalla */ }
  if (actual.contratoActivoId) {
    let contrato = null;
    try {
      const c = await getDoc(doc(db, "empresas", empresaId, "rentalContracts", actual.contratoActivoId));
      contrato = c.exists() ? c.data() : null;
    } catch { contrato = { estado: "activo" }; }
    if (contrato && !ESTADOS_CONTRATO_CERRADO.includes(String(contrato.estado || "").toLowerCase())) {
      const e = new Error(`La máquina está arrendada en el contrato ${contrato.folio || contrato.numero || actual.contratoActivoId}${contrato.clienteNombre ? ` (${contrato.clienteNombre})` : ""}. Finaliza ese contrato en Rental antes de darla de baja.`);
      e.code = "maquina-arrendada";
      throw e;
    }
  }
  const cambios = { active: false, fechaBaja: f, motivoBaja: String(motivo || "").trim() };
  if (actual.projectId) {
    // Cierra el tramo abierto en la fecha de la baja (no hoy)
    cambios.projectId = null;
    cambios.historialObras = moverDeObra(actual.historialObras, actual.projectId, null, f);
  }
  await guardarMaquina(empresaId, cambios, { id: machine.id, original: actual, origen: "baja", fechaObra: f });
  return { id: machine.id, ...cambios };
}

/** Deshace una baja: vuelve a quedar activa (sin obra; se asigna aparte). */
export async function revertirBajaMaquina(empresaId, machine) {
  await setDoc(doc(col(empresaId), machine.id), {
    active: true, fechaBaja: deleteField(), motivoBaja: deleteField(),
    updatedAt: serverTimestamp(), actualizadoPor: auth.currentUser?.email || null, actualizadoDesde: "baja",
  }, { merge: true });
}

// ─── Duplicados y fusión ───────────────────────────────────────────────────

/**
 * Colecciones que guardan el id de una máquina. Se recorre cada documento y
 * se reemplaza cualquier campo `machineId` / `maquinaId` / `activoVinculadoId`
 * (también dentro de objetos y listas, como `datosEntrega.machineId` o
 * `lineas[].machineId`).
 */
export const REFERENCIAS_MAQUINA = [
  "dailyLogs", "fuelLogs", "reportes_combustible", "reportes_detallados",
  "maintenancePlans", "maintenanceEvents", "workOrders", "failures",
  "machineDocuments", "machineHistory", "employeeAssignments", "sparePartMovements",
  "rentalQuotes", "rentalPurchaseOrders", "rentalContracts", "rentalPayments",
  "costos_fijos", "finanzas_activos",
];
const CAMPOS_ID = new Set(["machineId", "maquinaId", "activoVinculadoId", "equipoSurtidorId", "maquinaProveedorId"]);

/** Reemplaza los ids viejos por el nuevo dentro de un valor; devuelve [nuevoValor, cambió]. */
export function reemplazarIds(valor, viejos, nuevo) {
  if (Array.isArray(valor)) {
    let cambio = false;
    const arr = valor.map(v => { const [x, c] = reemplazarIds(v, viejos, nuevo); cambio ||= c; return x; });
    return [cambio ? arr : valor, cambio];
  }
  if (valor && typeof valor === "object" && !(valor instanceof Date) && typeof valor.toDate !== "function") {
    let cambio = false;
    const obj = {};
    Object.entries(valor).forEach(([k, v]) => {
      if (CAMPOS_ID.has(k) && typeof v === "string" && viejos.has(v)) { obj[k] = nuevo; cambio = true; return; }
      const [x, c] = reemplazarIds(v, viejos, nuevo);
      obj[k] = x; cambio ||= c;
    });
    return [cambio ? obj : valor, cambio];
  }
  return [valor, false];
}

/** Grupos de fichas que parecen la misma máquina (misma llave). */
export function gruposDuplicados(maquinas) {
  const grupos = new Map();
  (maquinas || []).forEach(m => {
    const k = llaveMaquina(m);
    if (!k) return;
    // Un código que es una patente se compara como patente
    const kp = k.startsWith("C:") && k.length >= 6 ? `P:${k.slice(2)}` : k;
    grupos.set(kp, [...(grupos.get(kp) || []), m]);
  });
  return [...grupos.entries()].filter(([, ms]) => ms.length > 1)
    .map(([llave, ms]) => ({ llave, maquinas: ms.sort((a, b) => cuantosDatos(b) - cuantosDatos(a)) }));
}
const cuantosDatos = (m) => Object.values(m).filter(v => v !== "" && v != null && v !== 0).length;

/**
 * Datos de la ficha fusionada: parte de la principal y completa con lo que
 * las otras tengan y la principal no.
 */
export function fichaFusionada(principal, otras) {
  const r = { ...principal };
  otras.forEach(o => Object.entries(o).forEach(([k, v]) => {
    if (k === "id") return;
    if ((r[k] === undefined || r[k] === null || r[k] === "") && v !== "" && v != null) r[k] = v;
  }));
  return r;
}

/**
 * Reemplaza en todas las colecciones de REFERENCIAS_MAQUINA los ids de
 * `viejos` (Set) por `nuevo`. Devuelve { coleccion: documentos cambiados }.
 */
export async function reapuntarReferencias(empresaId, viejos, nuevo, onProgreso) {
  const referencias = {};
  for (const nombre of REFERENCIAS_MAQUINA) {
    onProgreso?.(nombre);
    let snap;
    try { snap = await getDocs(collection(db, "empresas", empresaId, nombre)); } catch { continue; }
    const cambios = [];
    snap.docs.forEach(d => {
      const nuevos = {};
      Object.entries(d.data()).forEach(([k, v]) => {
        if (CAMPOS_ID.has(k) && typeof v === "string" && viejos.has(v)) { nuevos[k] = nuevo; return; }
        const [x, c] = reemplazarIds(v, viejos, nuevo);
        if (c) nuevos[k] = x;
      });
      if (Object.keys(nuevos).length) cambios.push([d.ref, nuevos]);
    });
    for (let i = 0; i < cambios.length; i += 400) {
      const batch = writeBatch(db);
      cambios.slice(i, i + 400).forEach(([ref, nuevos]) => batch.update(ref, nuevos));
      await batch.commit();
    }
    if (cambios.length) referencias[nombre] = cambios.length;
  }
  return referencias;
}

/**
 * Fusiona `otrasIds` en `principalId`: re-apunta todo el historial a la
 * principal, completa su ficha con los datos que solo tenían las otras y
 * borra las otras. Devuelve { referencias: { coleccion: n } }.
 */
export async function fusionarMaquinas(empresaId, principalId, otrasIds, onProgreso) {
  const viejos = new Set(otrasIds.filter(id => id && id !== principalId));
  if (!viejos.size) return { referencias: {} };
  const todas = await listarMaquinas(empresaId);
  const principal = todas.find(m => m.id === principalId);
  if (!principal) throw new Error("No se encontró la ficha principal");
  const otras = todas.filter(m => viejos.has(m.id));

  const referencias = await reapuntarReferencias(empresaId, viejos, principalId, onProgreso);

  const { id: _id, ...ficha } = fichaFusionada(principal, otras);
  // Historial de obras: los tramos de todas las fichas, en orden
  const tramos = [principal, ...otras].flatMap(tramosObra);
  if (tramos.length > 1) ficha.historialObras = tramos.sort((a, b) => String(a.desde || "").localeCompare(String(b.desde || "")));
  await setDoc(doc(col(empresaId), principalId), {
    ...ficha,
    fusionadas: [...(principal.fusionadas || []), ...otras.map(o => ({
      id: o.id, code: o.code || "", patente: o.patente || "", name: o.name || "", projectId: o.projectId || "",
    }))],
    updatedAt: serverTimestamp(), actualizadoDesde: "fusion",
  }, { merge: true });
  for (const o of otras) await deleteDoc(doc(col(empresaId), o.id));
  return { referencias };
}

/**
 * Finanzas y Contabilidad → Activos usan una forma propia de la ficha
 * ({ nombre, activo, ownership: "OWNED" }). Esto la traduce a los campos del
 * maestro, para guardar con guardarMaquina (y comparar contra la original).
 */
export function desdeFichaActivo(ficha) {
  if (!ficha) return null;
  const { id: _id, _source, machineId: _m, nombre, activo, ...resto } = ficha;
  const d = { ...resto };
  if (nombre !== undefined) d.name = nombre || resto.name || "";
  if (activo !== undefined) d.active = activo !== false;
  return normalizarMaquina(d);
}

// ─── Normalización de fichas existentes ────────────────────────────────────

/**
 * Qué habría que corregir en las fichas ya guardadas para que usen el
 * vocabulario del maestro. Devuelve [{ id, maquina, cambios, motivos }].
 *  · ownership OWNED / PROPIA / SUBCONTRATO… → OWN / RENTED
 *  · `activo` → `active` (si alguna vez se marcó inactiva, queda inactiva)
 *  · `tipo` con la clase de equipo ("Excavadora") → `type`
 *  · patente en mayúsculas y sin espacios al borde
 */
export function planNormalizacion(maquinas) {
  const plan = [];
  (maquinas || []).forEach(m => {
    const cambios = {};
    const motivos = [];
    const own = propiedadNormal(m.ownership);
    if (m.ownership && own !== m.ownership) { cambios.ownership = own; motivos.push(`propiedad ${m.ownership} → ${own}`); }
    if ("activo" in m) {
      const activa = m.active !== false && m.activo !== false;
      if ((m.active !== false) !== activa) cambios.active = activa;
      cambios.activo = deleteField();
      motivos.push(activa ? "campo activo → active" : "estaba marcada inactiva en Finanzas/Contabilidad");
    }
    if (m.tipo && !TIPOS_ACTIVO.includes(String(m.tipo).toLowerCase())) {
      if (!m.type) cambios.type = String(m.tipo).trim();
      cambios.tipo = deleteField();
      motivos.push(`tipo "${m.tipo}" → clase de equipo`);
    }
    if (m.patente && String(m.patente).trim().toUpperCase() !== m.patente) {
      cambios.patente = String(m.patente).trim().toUpperCase();
      motivos.push("patente en mayúsculas");
    }
    if (motivos.length) plan.push({ id: m.id, maquina: m, cambios, motivos });
  });
  return plan;
}

export async function aplicarNormalizacion(empresaId, plan) {
  for (let i = 0; i < plan.length; i += 400) {
    const batch = writeBatch(db);
    plan.slice(i, i + 400).forEach(p => batch.update(doc(col(empresaId), p.id), {
      ...p.cambios, updatedAt: serverTimestamp(), actualizadoDesde: "normalizacion",
    }));
    await batch.commit();
  }
  return plan.length;
}

// ─── Camiones surtidores ───────────────────────────────────────────────────
//
// Los camiones surtidores de combustible son máquinas del maestro con
// `esSurtidor: true` (y `capacidad` en litros). Antes vivían en la colección
// `equipos_surtidores`; mientras no se migren, se leen de ambas.

export const esSurtidor = (m) => m?.esSurtidor === true || m?.categoria === "surtidor_combustible";

const desdeSurtidorAntiguo = (s) => normalizarMaquina({
  name: s.nombre || s.name || "", nombre: undefined,
  patente: s.patente || "", code: s.code || s.patente || "",
  type: s.tipo || s.type || "Camión surtidor",
  marca: s.marca || "", modelo: s.modelo || "",
  capacidad: s.capacidad ?? "",
  esSurtidor: true,
});

/** Surtidores: máquinas marcadas + los de la colección antigua aún no migrados. */
export async function cargarSurtidores(empresaId, maquinas) {
  const lista = maquinas || await listarMaquinas(empresaId);
  const delMaestro = lista.filter(esSurtidor);
  let antiguos = [];
  try { antiguos = (await getDocs(collection(db, "empresas", empresaId, "equipos_surtidores"))).docs.map(d => ({ id: d.id, ...d.data() })); }
  catch { antiguos = []; }
  const ids = new Set(delMaestro.map(m => m.id));
  const pendientes = antiguos.filter(s => !ids.has(s.id))
    .map(s => ({ ...s, nombre: s.nombre || s.name || "", name: s.name || s.nombre || "", _antiguo: true }));
  return [...delMaestro.map(m => ({ ...m, nombre: m.nombre || m.name || "" })), ...pendientes];
}

/** Qué haría la migración: [{ antiguo, destino: maquina existente | null }]. */
export async function planSurtidores(empresaId, maquinas) {
  const lista = maquinas || await listarMaquinas(empresaId);
  let antiguos = [];
  try { antiguos = (await getDocs(collection(db, "empresas", empresaId, "equipos_surtidores"))).docs.map(d => ({ id: d.id, ...d.data() })); }
  catch { antiguos = []; }
  return antiguos.map(s => ({
    antiguo: s,
    destino: lista.find(m => m.id === s.id) || buscarMaquina(lista, { patente: s.patente, code: s.code || s.patente }) || null,
  }));
}

/**
 * Pasa los surtidores de `equipos_surtidores` al maestro:
 *  · si ya hay una máquina con su patente, se marca como surtidor, se completa
 *    y se re-apuntan los reportes de combustible al id de esa máquina;
 *  · si no, se crea la máquina CON EL MISMO ID (los reportes siguen sirviendo).
 * Luego se borra el documento antiguo.
 */
export async function migrarSurtidores(empresaId, plan, onProgreso) {
  let creados = 0, unidos = 0, reapuntados = 0;
  const usuario = auth.currentUser?.email || null;
  for (const { antiguo, destino } of plan) {
    onProgreso?.(antiguo.nombre || antiguo.patente || antiguo.id);
    const datos = desdeSurtidorAntiguo(antiguo);
    if (destino) {
      const faltantes = { esSurtidor: true };
      Object.entries(datos).forEach(([k, v]) => {
        if ((destino[k] === undefined || destino[k] === null || destino[k] === "") && v !== "" && v != null) faltantes[k] = v;
      });
      await setDoc(doc(col(empresaId), destino.id), { ...faltantes, updatedAt: serverTimestamp(), actualizadoDesde: "migracion-surtidores" }, { merge: true });
      if (destino.id !== antiguo.id) {
        const r = await reapuntarReferencias(empresaId, new Set([antiguo.id]), destino.id);
        reapuntados += Object.values(r).reduce((a, b) => a + b, 0);
      }
      unidos++;
    } else {
      await setDoc(doc(col(empresaId), antiguo.id), {
        ownership: "OWN", active: true, ...datos,
        createdAt: serverTimestamp(), creadoPor: usuario, creadoDesde: "migracion-surtidores",
      }, { merge: true });
      creados++;
    }
    await deleteDoc(doc(db, "empresas", empresaId, "equipos_surtidores", antiguo.id));
  }
  return { creados, unidos, reapuntados };
}
