import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  getDocs,
  query,
  where,
  Timestamp,
  writeBatch,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";
import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { db, storage } from "./firebase";

// ============================================================
// MPF RENTAL — CAPA DE DATOS ADMINISTRATIVA
//
// Sigue el flujo comercial real del arriendo de maquinaria:
//
//   1. Cliente          se crea con el certificado de estatutos adjunto
//   2. Cotización       se emite al cliente
//   3. Aceptación       el mandante envía su OC; se adjunta y la cotización
//                       queda aceptada (o rechazada, y ahí termina)
//   4. Contrato         se genera desde la cotización y su OC
//   5. Estados de pago  descuentan del monto autorizado del contrato;
//                       cuando se agota, se amplía con una enmienda (otra OC)
//   6. Facturación      con el OK del mandante se adjunta la factura y el
//                       estado de pago pasa a facturado
//   7. Cobranza         vencimiento, factoring y bitácora de gestiones
//
// Reglas que este archivo garantiza:
//  - Folios correlativos asignados dentro de una transacción.
//  - Todo monto guardado como neto + IVA 19% + total.
//  - El monto autorizado de un contrato es la suma de sus OC (original más
//    enmiendas); los estados de pago no pueden superarlo.
//  - Los borrados liberan las máquinas y se bloquean si dejan huérfanos.
// ============================================================

const EMPRESA_COL = (empresaId, colName) => collection(db, "empresas", empresaId, colName);
const EMPRESA_DOC = (empresaId, colName, docId) => doc(db, "empresas", empresaId, colName, docId);

export const IVA_TASA = 0.19;

export const ESTADOS_COTIZACION = {
  borrador: { label: "Borrador", color: "bg-slate-100 text-slate-600 border-slate-200" },
  enviada: { label: "Pendiente", color: "bg-blue-100 text-blue-700 border-blue-200" },
  aceptada: { label: "Aceptada", color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  rechazada: { label: "Rechazada", color: "bg-red-100 text-red-700 border-red-200" },
  vencida: { label: "Vencida", color: "bg-amber-100 text-amber-700 border-amber-200" },
};

export const ESTADOS_CONTRATO = {
  borrador: { label: "Borrador", color: "bg-slate-100 text-slate-600 border-slate-200" },
  activo: { label: "Activo", color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  finalizado: { label: "Finalizado", color: "bg-blue-100 text-blue-700 border-blue-200" },
  cancelado: { label: "Cancelado", color: "bg-red-100 text-red-700 border-red-200" },
};

export const ESTADOS_EEPP = {
  pendiente: { label: "Pendiente", color: "bg-slate-100 text-slate-600 border-slate-200" },
  aprobado: { label: "Aprobado", color: "bg-indigo-100 text-indigo-700 border-indigo-200" },
  facturado: { label: "Facturado", color: "bg-blue-100 text-blue-700 border-blue-200" },
  pagado: { label: "Pagado", color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  vencido: { label: "Vencido", color: "bg-red-100 text-red-700 border-red-200" },
  anulado: { label: "Anulado", color: "bg-slate-100 text-slate-400 border-slate-200" },
};

export const ESTADOS_OC = {
  vigente: { label: "Vigente", color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  agotada: { label: "Agotada", color: "bg-amber-100 text-amber-700 border-amber-200" },
  cerrada: { label: "Cerrada", color: "bg-blue-100 text-blue-700 border-blue-200" },
  anulada: { label: "Anulada", color: "bg-red-100 text-red-700 border-red-200" },
};

// Documentos que se le piden al cliente al darlo de alta.
export const TIPOS_DOC_CLIENTE = {
  certificado_estatutos: "Certificado de estatutos",
  e_rut: "e-RUT / inicio de actividades",
  poderes: "Escritura de poderes",
  cedula_representante: "Cédula del representante legal",
  otro: "Otro documento",
};

export const MEDIOS_PAGO = ["Transferencia", "Cheque", "Vale vista", "Efectivo", "Factoring"];

// ============================================================
// FORMATO Y CÁLCULO
// ============================================================

export const CLP = (n) => "$" + Math.round(Number(n || 0)).toLocaleString("es-CL");

// Normaliza cualquier tarifa a un ingreso mensual neto estimado.
// Supuestos: mes = 1, día ≈ 30/mes, hora ≈ horasMesReferencia (default 180).
export function ingresoMensualLinea(linea, horasMesReferencia = 180) {
  const v = Number(linea?.tarifaValor || 0);
  const cant = Number(linea?.cantidadEstimada || 0);
  switch (linea?.tarifaTipo) {
    case "mes": return v * (cant || 1);
    case "dia": return v * (cant || 30);
    case "hora": return v * (cant || horasMesReferencia);
    default: return 0;
  }
}

// Único lugar donde se aplica el 19%.
export function desglosarIVA(neto, { afectoIVA = true } = {}) {
  const n = Math.round(Number(neto || 0));
  const iva = afectoIVA ? Math.round(n * IVA_TASA) : 0;
  return { neto: n, iva, total: n + iva };
}

export function totalesDocumento(lineas, opts = {}) {
  const neto = (lineas || []).reduce((s, l) => s + ingresoMensualLinea(l), 0);
  return desglosarIVA(neto, opts);
}

// ============================================================
// RUT — validación módulo 11 y formato
// ============================================================

export function limpiarRut(rut) {
  return String(rut || "").replace(/[^0-9kK]/g, "").toUpperCase();
}

export function formatRut(rut) {
  const limpio = limpiarRut(rut);
  if (limpio.length < 2) return limpio;
  const cuerpo = limpio.slice(0, -1);
  const dv = limpio.slice(-1);
  return `${cuerpo.replace(/\B(?=(\d{3})+(?!\d))/g, ".")}-${dv}`;
}

export function validaRut(rut) {
  const limpio = limpiarRut(rut);
  if (limpio.length < 2) return false;
  const cuerpo = limpio.slice(0, -1);
  const dv = limpio.slice(-1);
  if (!/^\d+$/.test(cuerpo)) return false;

  let suma = 0;
  let mult = 2;
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += Number(cuerpo[i]) * mult;
    mult = mult === 7 ? 2 : mult + 1;
  }
  const resto = 11 - (suma % 11);
  const dvEsperado = resto === 11 ? "0" : resto === 10 ? "K" : String(resto);
  return dv === dvEsperado;
}

// ============================================================
// FOLIOS CORRELATIVOS
// ============================================================
// Contador en /empresas/{id}/counters/rentalFolios
// { "COT-2026": 14, "CTR-2026": 3, "EP-2026": 47 }

const PREFIJO_FOLIO = { cotizacion: "COT", contrato: "CTR", eepp: "EP" };

export async function siguienteFolio(empresaId, tipo, anio = new Date().getFullYear()) {
  const prefijo = PREFIJO_FOLIO[tipo];
  if (!prefijo) throw new Error(`Tipo de folio desconocido: ${tipo}`);
  if (!empresaId) throw new Error("Falta empresaId para asignar folio");

  const clave = `${prefijo}-${anio}`;
  const ref = EMPRESA_DOC(empresaId, "counters", "rentalFolios");

  const numero = await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists() ? snap.data() : {};
    const siguiente = Number(data[clave] || 0) + 1;
    tx.set(ref, { [clave]: siguiente, updatedAt: Timestamp.now() }, { merge: true });
    return siguiente;
  });

  return `${clave}-${String(numero).padStart(4, "0")}`;
}

// Deja el correlativo por encima del folio más alto ya existente.
export async function sincronizarFolio(empresaId, tipo, foliosExistentes, anio = new Date().getFullYear()) {
  const prefijo = PREFIJO_FOLIO[tipo];
  const clave = `${prefijo}-${anio}`;
  let max = 0;
  for (const f of foliosExistentes || []) {
    const m = String(f || "").match(new RegExp(`^${prefijo}-${anio}-(\\d+)$`));
    if (m) max = Math.max(max, Number(m[1]));
  }
  if (!max) return;
  const ref = EMPRESA_DOC(empresaId, "counters", "rentalFolios");
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const actual = Number((snap.exists() ? snap.data() : {})[clave] || 0);
    if (actual >= max) return;
    tx.set(ref, { [clave]: max, updatedAt: Timestamp.now() }, { merge: true });
  });
}

// ============================================================
// ARCHIVOS ADJUNTOS (Storage)
// ============================================================

const MAX_ARCHIVO_MB = 15;
const TIPOS_PERMITIDOS = ["application/pdf", "image/jpeg", "image/png", "image/webp"];

async function subirArchivo(empresaId, carpeta, entidadId, file, meta = {}) {
  if (!file) throw new Error("No se seleccionó ningún archivo");
  if (file.size > MAX_ARCHIVO_MB * 1024 * 1024) {
    throw new Error(`El archivo supera los ${MAX_ARCHIVO_MB} MB`);
  }
  if (file.type && !TIPOS_PERMITIDOS.includes(file.type)) {
    throw new Error("Formato no permitido. Sube un PDF o una imagen (JPG, PNG, WEBP).");
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `empresas/${empresaId}/${carpeta}/${entidadId}/${Date.now()}_${safeName}`;
  const r = storageRef(storage, path);
  await uploadBytes(r, file);
  const url = await getDownloadURL(r);
  return {
    url, path,
    nombre: file.name,
    tamano: file.size,
    tipo: file.type || "",
    categoria: meta.categoria || "otro",
    descripcion: meta.descripcion || "",
    subidoEn: new Date().toISOString(),
  };
}

async function borrarArchivo(path) {
  if (!path) return;
  try { await deleteObject(storageRef(storage, path)); }
  catch (e) { console.warn("No se pudo borrar el archivo de Storage:", e.message); }
}

// Agrega un adjunto a cualquier documento con campo `archivos`.
async function adjuntar(empresaId, coleccion, entidadId, file, meta) {
  const archivo = await subirArchivo(empresaId, coleccion, entidadId, file, meta);
  const ref = EMPRESA_DOC(empresaId, coleccion, entidadId);
  const snap = await getDoc(ref);
  const actuales = snap.exists() ? snap.data().archivos || [] : [];
  await updateDoc(ref, { archivos: [...actuales, archivo], updatedAt: serverTimestamp() });
  return archivo;
}

async function quitarAdjunto(empresaId, coleccion, entidadId, archivo) {
  const ref = EMPRESA_DOC(empresaId, coleccion, entidadId);
  const snap = await getDoc(ref);
  const actuales = snap.exists() ? snap.data().archivos || [] : [];
  await updateDoc(ref, {
    archivos: actuales.filter((a) => a.path !== archivo.path),
    updatedAt: serverTimestamp(),
  });
  await borrarArchivo(archivo.path);
}

export const uploadClientFile = (empresaId, clientId, file, meta) =>
  adjuntar(empresaId, "rentalClients", clientId, file, meta);
export const deleteClientFile = (empresaId, clientId, archivo) =>
  quitarAdjunto(empresaId, "rentalClients", clientId, archivo);

export const uploadPurchaseOrderFile = (empresaId, ocId, file, meta) =>
  adjuntar(empresaId, "rentalPurchaseOrders", ocId, file, meta);
export const deletePurchaseOrderFile = (empresaId, ocId, archivo) =>
  quitarAdjunto(empresaId, "rentalPurchaseOrders", ocId, archivo);

export const uploadContractFile = (empresaId, contratoId, file, meta) =>
  adjuntar(empresaId, "rentalContracts", contratoId, file, meta);
export const deleteContractFile = (empresaId, contratoId, archivo) =>
  quitarAdjunto(empresaId, "rentalContracts", contratoId, archivo);

export const uploadPaymentFile = (empresaId, paymentId, file, meta) =>
  adjuntar(empresaId, "rentalPayments", paymentId, file, meta);
export const deletePaymentFile = (empresaId, paymentId, archivo) =>
  quitarAdjunto(empresaId, "rentalPayments", paymentId, archivo);

export const uploadQuoteFile = (empresaId, quoteId, file, meta) =>
  adjuntar(empresaId, "rentalQuotes", quoteId, file, meta);
export const deleteQuoteFile = (empresaId, quoteId, archivo) =>
  quitarAdjunto(empresaId, "rentalQuotes", quoteId, archivo);

// ============================================================
// 1. CLIENTES
// ============================================================

export async function listRentalClients(empresaId, { incluirInactivos = false } = {}) {
  if (!empresaId) return [];
  const snap = await getDocs(EMPRESA_COL(empresaId, "rentalClients"));
  const filas = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const visibles = incluirInactivos ? filas : filas.filter((c) => c.activo !== false);
  return visibles.sort((a, b) => String(a.nombre || "").localeCompare(String(b.nombre || ""), "es"));
}

export async function getRentalClient(empresaId, clientId) {
  if (!empresaId || !clientId) return null;
  const snap = await getDoc(EMPRESA_DOC(empresaId, "rentalClients", clientId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function upsertRentalClient(empresaId, client) {
  const nombre = (client.nombre || "").trim();
  if (!nombre) throw new Error("El nombre o razón social del cliente es obligatorio");

  const rutLimpio = limpiarRut(client.rut);
  if (rutLimpio && !validaRut(rutLimpio)) throw new Error("El RUT ingresado no es válido");

  // Un RUT no se repite dentro de la empresa: evita clientes duplicados que
  // después rompen la consolidación de deuda.
  if (rutLimpio) {
    const existentes = await listRentalClients(empresaId, { incluirInactivos: true });
    const choque = existentes.find((c) => limpiarRut(c.rut) === rutLimpio && c.id !== client.id);
    if (choque) throw new Error(`El RUT ya está registrado en el cliente "${choque.nombre}"`);
  }

  const data = {
    nombre,
    rut: rutLimpio ? formatRut(rutLimpio) : "",
    giro: (client.giro || "").trim(),
    // Datos que se extraen del certificado de estatutos
    representanteNombre: (client.representanteNombre || "").trim(),
    representanteRut: (client.representanteRut || "").trim(),
    contacto: (client.contacto || "").trim(),
    contactoCargo: (client.contactoCargo || "").trim(),
    email: (client.email || "").trim(),
    telefono: (client.telefono || "").trim(),
    direccion: (client.direccion || "").trim(),
    comuna: (client.comuna || "").trim(),
    ciudad: (client.ciudad || "").trim(),
    diasPago: client.diasPago === "" || client.diasPago == null ? 30 : Number(client.diasPago),
    emailFacturacion: (client.emailFacturacion || "").trim(),
    emailEstadosPago: (client.emailEstadosPago || "").trim(),
    requiereOC: client.requiereOC !== false,
    notas: (client.notas || "").trim(),
    activo: client.activo !== false,
    updatedAt: serverTimestamp(),
  };

  if (client.id) {
    await updateDoc(EMPRESA_DOC(empresaId, "rentalClients", client.id), data);
    return client.id;
  }
  data.archivos = [];
  data.createdAt = serverTimestamp();
  const ref = await addDoc(EMPRESA_COL(empresaId, "rentalClients"), data);
  return ref.id;
}

export async function desactivarRentalClient(empresaId, clientId, activo = false) {
  await updateDoc(EMPRESA_DOC(empresaId, "rentalClients", clientId), {
    activo, updatedAt: serverTimestamp(),
  });
}

export async function deleteRentalClient(empresaId, clientId) {
  const [contratos, cotizaciones, pagos, ocs] = await Promise.all([
    listRentalContracts(empresaId, { clienteId: clientId }),
    listRentalQuotes(empresaId, { clienteId: clientId }),
    listRentalPayments(empresaId, { clienteId: clientId }),
    listRentalPurchaseOrders(empresaId, { clienteId: clientId }),
  ]);

  const bloqueos = [];
  if (contratos.length) bloqueos.push(`${contratos.length} contrato(s)`);
  if (cotizaciones.length) bloqueos.push(`${cotizaciones.length} cotización(es)`);
  if (pagos.length) bloqueos.push(`${pagos.length} estado(s) de pago`);
  if (ocs.length) bloqueos.push(`${ocs.length} orden(es) de compra`);

  if (bloqueos.length) {
    throw new Error(`No se puede eliminar: el cliente tiene ${bloqueos.join(", ")}. Desactívalo en lugar de borrarlo.`);
  }

  const snap = await getDoc(EMPRESA_DOC(empresaId, "rentalClients", clientId));
  for (const a of (snap.exists() ? snap.data().archivos || [] : [])) await borrarArchivo(a.path);
  await deleteDoc(EMPRESA_DOC(empresaId, "rentalClients", clientId));
}

// Documentos legales pendientes, para avisar en la ficha del cliente.
export function documentosFaltantes(client) {
  const cargadas = new Set((client?.archivos || []).map((a) => a.categoria));
  return ["certificado_estatutos", "e_rut"].filter((t) => !cargadas.has(t));
}

// Resumen 360 del cliente, sobre datos ya cargados en memoria.
export function resumenCliente(clienteId, { contracts = [], quotes = [], payments = [], purchaseOrders = [] }) {
  const mio = (arr) => arr.filter((x) => x.clienteId === clienteId);
  const contratos = mio(contracts);
  const cotizaciones = mio(quotes);
  const pagos = mio(payments).filter((p) => p.estado !== "anulado");
  const ocs = mio(purchaseOrders);

  const porCobrar = pagos
    .filter((p) => estadoEfectivoEEPP(p) !== "pagado")
    .reduce((s, p) => s + montoTotalEEPP(p), 0);
  const vencido = pagos
    .filter((p) => estadoEfectivoEEPP(p) === "vencido")
    .reduce((s, p) => s + montoTotalEEPP(p), 0);

  return {
    contratos, cotizaciones, pagos, ocs,
    contratosActivos: contratos.filter((c) => c.estado === "activo").length,
    ocsVigentes: ocs.filter((o) => o.estado === "vigente").length,
    porCobrar,
    vencido,
    facturadoTotal: pagos.reduce((s, p) => s + montoTotalEEPP(p), 0),
    saldoOC: ocs
      .filter((o) => o.estado === "vigente")
      .reduce((s, o) => s + saldoOC(o, pagos).saldo, 0),
  };
}

// ============================================================
// 2. COTIZACIONES
// ============================================================

export async function listRentalQuotes(empresaId, filters = {}) {
  if (!empresaId) return [];
  let q = EMPRESA_COL(empresaId, "rentalQuotes");
  const clauses = [];
  if (filters.clienteId) clauses.push(where("clienteId", "==", filters.clienteId));
  if (filters.estado) clauses.push(where("estado", "==", filters.estado));
  if (clauses.length) q = query(q, ...clauses);
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => new Date(b.fecha || 0) - new Date(a.fecha || 0));
}

export async function upsertRentalQuote(empresaId, quote) {
  if (!quote.clienteId) throw new Error("Selecciona un cliente");
  const lineas = (quote.lineas || []).filter((l) => l.machineId && Number(l.tarifaValor) > 0);
  if (!lineas.length) throw new Error("Agrega al menos un equipo con su tarifa");

  const { neto, iva, total } = totalesDocumento(lineas, { afectoIVA: quote.afectoIVA !== false });
  const fecha = quote.fecha || new Date().toISOString();
  const validezDias = Number(quote.validezDias) || 15;

  const data = {
    clienteId: quote.clienteId,
    clienteNombre: quote.clienteNombre || "",
    lineas: lineas.map(normalizarLinea),
    fecha,
    validezDias,
    fechaVencimiento: sumarDias(fecha, validezDias),
    plazoMeses: quote.plazoMeses == null || quote.plazoMeses === "" ? null : Number(quote.plazoMeses),
    estado: quote.estado || "borrador",
    condiciones: (quote.condiciones || "").trim(),
    afectoIVA: quote.afectoIVA !== false,
    neto, iva, total,
    monto: total,
    ocId: quote.ocId || null,
    ocNumero: quote.ocNumero || "",
    contratoGeneradoId: quote.contratoGeneradoId || null,
    motivoRechazo: quote.motivoRechazo || "",
    updatedAt: serverTimestamp(),
  };

  if (quote.id) {
    const actual = await getDoc(EMPRESA_DOC(empresaId, "rentalQuotes", quote.id));
    if (actual.exists() && actual.data().contratoGeneradoId) {
      throw new Error("Esta cotización ya generó un contrato y no se puede modificar");
    }
    if (quote.numero) data.numero = quote.numero; // el folio nunca se reasigna
    await updateDoc(EMPRESA_DOC(empresaId, "rentalQuotes", quote.id), data);
    return quote.id;
  }

  data.numero = quote.numero?.trim() || (await siguienteFolio(empresaId, "cotizacion"));
  data.archivos = [];
  data.createdAt = serverTimestamp();
  const ref = await addDoc(EMPRESA_COL(empresaId, "rentalQuotes"), data);
  return ref.id;
}

export async function deleteRentalQuote(empresaId, quoteId) {
  const snap = await getDoc(EMPRESA_DOC(empresaId, "rentalQuotes", quoteId));
  if (!snap.exists()) return;
  const q = snap.data();
  if (q.contratoGeneradoId) throw new Error("Esta cotización ya generó un contrato. Elimina primero el contrato.");
  if (q.ocId) throw new Error("Esta cotización tiene una OC asociada. Elimina primero la orden de compra.");
  for (const a of q.archivos || []) await borrarArchivo(a.path);
  await deleteDoc(EMPRESA_DOC(empresaId, "rentalQuotes", quoteId));
}

export function estadoEfectivoCotizacion(quote) {
  if (["aceptada", "rechazada"].includes(quote?.estado)) return quote.estado;
  if (quote?.fechaVencimiento && new Date(quote.fechaVencimiento) < hoy()) return "vencida";
  return quote?.estado || "borrador";
}

export function diasVigenciaCotizacion(quote) {
  if (!quote?.fechaVencimiento) return null;
  return Math.ceil((parseFechaLocal(quote.fechaVencimiento) - hoy()) / 86400000);
}

// ============================================================
// 3. ACEPTACIÓN — llega la OC del mandante
// ============================================================
// Un solo acto: se registra la OC (número, fecha, monto y archivo) y la
// cotización queda aceptada y vinculada a ella.

export async function aceptarCotizacion(empresaId, quote, ocData = {}, file = null) {
  if (!quote?.id) throw new Error("Cotización inválida");
  if (quote.estado === "aceptada" || quote.ocId) throw new Error("Esta cotización ya fue aceptada");
  if (quote.estado === "rechazada") throw new Error("Esta cotización fue rechazada");

  const ocId = await upsertRentalPurchaseOrder(empresaId, {
    numeroOC: ocData.numeroOC,
    clienteId: quote.clienteId,
    clienteNombre: quote.clienteNombre,
    cotizacionId: quote.id,
    cotizacionNumero: quote.numero || "",
    fechaEmision: ocData.fechaEmision,
    fechaVencimiento: ocData.fechaVencimiento || "",
    montoNeto: ocData.montoNeto,
    afectoIVA: quote.afectoIVA !== false,
    tipo: "original",
    observaciones: ocData.observaciones || "",
  });

  if (file) await uploadPurchaseOrderFile(empresaId, ocId, file, { categoria: "orden_compra" });

  await updateDoc(EMPRESA_DOC(empresaId, "rentalQuotes", quote.id), {
    estado: "aceptada",
    ocId,
    ocNumero: String(ocData.numeroOC || "").trim(),
    fechaAceptacion: new Date().toISOString().slice(0, 10),
    updatedAt: serverTimestamp(),
  });

  return ocId;
}

export async function rechazarCotizacion(empresaId, quoteId, motivo = "") {
  await updateDoc(EMPRESA_DOC(empresaId, "rentalQuotes", quoteId), {
    estado: "rechazada",
    motivoRechazo: motivo,
    fechaRechazo: new Date().toISOString().slice(0, 10),
    updatedAt: serverTimestamp(),
  });
}

// ============================================================
// ÓRDENES DE COMPRA DEL CLIENTE
// ============================================================
// La OC la emite el mandante. `tipo: 'original'` abre el monto autorizado
// del contrato; `tipo: 'enmienda'` lo amplía cuando se agota.

export async function listRentalPurchaseOrders(empresaId, filters = {}) {
  if (!empresaId) return [];
  let q = EMPRESA_COL(empresaId, "rentalPurchaseOrders");
  const clauses = [];
  if (filters.clienteId) clauses.push(where("clienteId", "==", filters.clienteId));
  if (filters.contratoId) clauses.push(where("contratoId", "==", filters.contratoId));
  if (filters.cotizacionId) clauses.push(where("cotizacionId", "==", filters.cotizacionId));
  if (filters.estado) clauses.push(where("estado", "==", filters.estado));
  if (clauses.length) q = query(q, ...clauses);
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => String(a.fechaEmision || "").localeCompare(String(b.fechaEmision || "")));
}

export async function upsertRentalPurchaseOrder(empresaId, oc) {
  const numeroOC = String(oc.numeroOC || "").trim();
  if (!numeroOC) throw new Error("El número de OC del cliente es obligatorio");
  if (!oc.clienteId) throw new Error("La OC debe estar asociada a un cliente");

  const neto = Math.round(Number(oc.montoNeto || 0));
  if (neto <= 0) throw new Error("El monto neto de la OC debe ser mayor a cero");

  // Una misma OC no se carga dos veces para el mismo cliente.
  const existentes = await listRentalPurchaseOrders(empresaId, { clienteId: oc.clienteId });
  const choque = existentes.find(
    (o) => String(o.numeroOC).trim().toLowerCase() === numeroOC.toLowerCase() && o.id !== oc.id
  );
  if (choque) throw new Error(`Ya existe una OC N° ${numeroOC} para este cliente`);

  // Al editar, el neto no puede bajar de lo ya consumido.
  if (oc.id) {
    const pagos = await listRentalPayments(empresaId, { ocId: oc.id });
    const consumido = pagos
      .filter((p) => p.estado !== "anulado")
      .reduce((s, p) => s + Number(p.neto || 0), 0);
    if (neto < consumido) {
      throw new Error(`El neto no puede ser menor a lo ya consumido por sus estados de pago (${CLP(consumido)})`);
    }
  }

  const { iva, total } = desglosarIVA(neto, { afectoIVA: oc.afectoIVA !== false });

  const data = {
    numeroOC,
    tipo: oc.tipo === "enmienda" ? "enmienda" : "original",
    clienteId: oc.clienteId,
    clienteNombre: oc.clienteNombre || "",
    cotizacionId: oc.cotizacionId || null,
    cotizacionNumero: oc.cotizacionNumero || "",
    contratoId: oc.contratoId || null,
    contratoNumero: oc.contratoNumero || "",
    fechaEmision: oc.fechaEmision || new Date().toISOString().slice(0, 10),
    fechaVencimiento: oc.fechaVencimiento || "",
    montoNeto: neto,
    montoIva: iva,
    montoTotal: total,
    afectoIVA: oc.afectoIVA !== false,
    estado: oc.estado || "vigente",
    observaciones: (oc.observaciones || "").trim(),
    updatedAt: serverTimestamp(),
  };

  if (oc.id) {
    await updateDoc(EMPRESA_DOC(empresaId, "rentalPurchaseOrders", oc.id), data);
    return oc.id;
  }
  data.archivos = [];
  data.createdAt = serverTimestamp();
  const ref = await addDoc(EMPRESA_COL(empresaId, "rentalPurchaseOrders"), data);
  return ref.id;
}

export async function deleteRentalPurchaseOrder(empresaId, ocId) {
  const pagos = await listRentalPayments(empresaId, { ocId });
  if (pagos.length) {
    throw new Error(`No se puede eliminar: hay ${pagos.length} estado(s) de pago respaldados por esta OC. Anúlala en lugar de borrarla.`);
  }

  const snap = await getDoc(EMPRESA_DOC(empresaId, "rentalPurchaseOrders", ocId));
  if (!snap.exists()) return;
  const oc = snap.data();
  if (oc.contratoId) throw new Error("Esta OC respalda un contrato vigente. Elimina primero el contrato.");

  // Devuelve la cotización a pendiente para poder rehacer la aceptación.
  if (oc.cotizacionId) {
    try {
      await updateDoc(EMPRESA_DOC(empresaId, "rentalQuotes", oc.cotizacionId), {
        estado: "enviada", ocId: null, ocNumero: "", updatedAt: serverTimestamp(),
      });
    } catch { /* la cotización pudo borrarse antes */ }
  }

  for (const a of oc.archivos || []) await borrarArchivo(a.path);
  await deleteDoc(EMPRESA_DOC(empresaId, "rentalPurchaseOrders", ocId));
}

// Saldo de una OC concreta (neto contra neto).
export function saldoOC(oc, payments = []) {
  const netoOC = Number(oc?.montoNeto || 0);
  const consumido = payments
    .filter((p) => p.ocId === oc?.id && p.estado !== "anulado")
    .reduce((s, p) => s + Number(p.neto || 0), 0);
  const saldo = netoOC - consumido;
  return {
    neto: netoOC,
    consumido,
    saldo,
    pct: netoOC > 0 ? Math.min(100, Math.round((consumido / netoOC) * 100)) : 0,
    agotada: saldo <= 0,
  };
}

// Monto autorizado de un contrato: la OC original más todas sus enmiendas.
// Es el tope contra el que se descuentan los estados de pago.
export function saldoContrato(contrato, purchaseOrders = [], payments = []) {
  const ocs = purchaseOrders.filter((o) => o.contratoId === contrato?.id && o.estado !== "anulada");
  const autorizado = ocs.reduce((s, o) => s + Number(o.montoNeto || 0), 0);
  const consumido = payments
    .filter((p) => p.contratoId === contrato?.id && p.estado !== "anulado")
    .reduce((s, p) => s + Number(p.neto || 0), 0);
  const saldo = autorizado - consumido;
  const pct = autorizado > 0 ? Math.round((consumido / autorizado) * 100) : 0;

  return {
    ocs,
    original: ocs.find((o) => o.tipo !== "enmienda") || null,
    enmiendas: ocs.filter((o) => o.tipo === "enmienda"),
    autorizado,
    consumido,
    saldo,
    pct: Math.min(100, pct),
    agotado: saldo <= 0,
    // Aviso temprano: sobre el 90% conviene pedir la enmienda antes de frenar.
    requiereEnmienda: autorizado > 0 && pct >= 90,
  };
}

// Registra una enmienda: otra OC del mandante que amplía el contrato.
export async function agregarEnmiendaContrato(empresaId, contrato, ocData = {}, file = null) {
  if (!contrato?.id) throw new Error("Contrato inválido");
  const ocId = await upsertRentalPurchaseOrder(empresaId, {
    numeroOC: ocData.numeroOC,
    clienteId: contrato.clienteId,
    clienteNombre: contrato.clienteNombre,
    contratoId: contrato.id,
    contratoNumero: contrato.numero || "",
    fechaEmision: ocData.fechaEmision,
    fechaVencimiento: ocData.fechaVencimiento || "",
    montoNeto: ocData.montoNeto,
    afectoIVA: contrato.afectoIVA !== false,
    tipo: "enmienda",
    observaciones: ocData.observaciones || "",
  });
  if (file) await uploadPurchaseOrderFile(empresaId, ocId, file, { categoria: "enmienda" });
  return ocId;
}

// ============================================================
// 4. CONTRATOS DE ARRIENDO
// ============================================================

export async function listRentalContracts(empresaId, filters = {}) {
  if (!empresaId) return [];
  let q = EMPRESA_COL(empresaId, "rentalContracts");
  const clauses = [];
  if (filters.clienteId) clauses.push(where("clienteId", "==", filters.clienteId));
  if (filters.estado) clauses.push(where("estado", "==", filters.estado));
  if (clauses.length) q = query(q, ...clauses);
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => new Date(b.fechaInicio || 0) - new Date(a.fechaInicio || 0));
}

export async function upsertRentalContract(empresaId, contract) {
  if (!contract.clienteId) throw new Error("Selecciona un cliente");
  const lineas = (contract.lineas || []).filter((l) => l.machineId && Number(l.tarifaValor) > 0);
  if (!lineas.length) throw new Error("Agrega al menos un equipo con su tarifa");
  if (contract.fechaFin && contract.fechaInicio && contract.fechaFin < contract.fechaInicio) {
    throw new Error("La fecha de término no puede ser anterior a la de inicio");
  }
  if (contract.estado === "activo" && !contract.fechaInicio) {
    throw new Error("Un contrato activo necesita fecha de inicio para poder facturar");
  }

  const { neto, iva, total } = totalesDocumento(lineas, { afectoIVA: contract.afectoIVA !== false });

  // Estado anterior: necesario para liberar las máquinas que se quitaron.
  let lineasPrevias = [];
  if (contract.id) {
    const prev = await getDoc(EMPRESA_DOC(empresaId, "rentalContracts", contract.id));
    if (prev.exists()) lineasPrevias = prev.data().lineas || [];
  }

  const data = {
    clienteId: contract.clienteId,
    clienteNombre: contract.clienteNombre || "",
    lineas: lineas.map(normalizarLinea),
    fechaInicio: contract.fechaInicio || "",
    fechaFin: contract.fechaFin || "",
    estado: contract.estado || "borrador",
    condiciones: (contract.condiciones || "").trim(),
    proyectoDestino: contract.proyectoDestino || "",
    afectoIVA: contract.afectoIVA !== false,
    cotizacionId: contract.cotizacionId || null,
    cotizacionNumero: contract.cotizacionNumero || "",
    ocId: contract.ocId || null,
    ocNumero: contract.ocNumero || "",
    netoMensual: neto, ivaMensual: iva, totalMensual: total,
    updatedAt: serverTimestamp(),
  };

  let contratoId;
  if (contract.id) {
    if (contract.numero) data.numero = contract.numero;
    await updateDoc(EMPRESA_DOC(empresaId, "rentalContracts", contract.id), data);
    contratoId = contract.id;
  } else {
    data.numero = contract.numero?.trim() || (await siguienteFolio(empresaId, "contrato"));
    data.archivos = [];
    data.createdAt = serverTimestamp();
    const ref = await addDoc(EMPRESA_COL(empresaId, "rentalContracts"), data);
    contratoId = ref.id;
  }

  const idsActuales = new Set(lineas.map((l) => l.machineId));
  const idsLiberar = (lineasPrevias || [])
    .map((l) => l.machineId)
    .filter((id) => id && !idsActuales.has(id));

  await syncMachineRentalStatus(empresaId, { ...data, id: contratoId }, idsLiberar);
  return contratoId;
}

// Genera el contrato desde la cotización aceptada y su OC.
export async function crearContratoDesdeCotizacion(empresaId, quote, extra = {}) {
  if (!quote?.id) throw new Error("Cotización inválida");
  if (quote.contratoGeneradoId) throw new Error("Esta cotización ya generó un contrato");
  if (quote.estado !== "aceptada" || !quote.ocId) {
    throw new Error("Primero registra la orden de compra del cliente para aceptar la cotización");
  }
  if (!extra.fechaInicio) throw new Error("Indica la fecha de inicio del contrato");
  if (extra.fechaFin && extra.fechaFin < extra.fechaInicio) {
    throw new Error("La fecha de término no puede ser anterior a la de inicio");
  }

  const contratoId = await upsertRentalContract(empresaId, {
    clienteId: quote.clienteId,
    clienteNombre: quote.clienteNombre,
    lineas: quote.lineas || [],
    fechaInicio: extra.fechaInicio,
    fechaFin: extra.fechaFin || "",
    estado: extra.estado || "activo",
    condiciones: extra.condiciones || quote.condiciones || "",
    proyectoDestino: extra.proyectoDestino || "",
    afectoIVA: quote.afectoIVA !== false,
    cotizacionId: quote.id,
    cotizacionNumero: quote.numero || "",
    ocId: quote.ocId,
    ocNumero: quote.ocNumero || "",
  });

  // La OC pasa a respaldar el contrato: ahí es donde controla el saldo.
  await updateDoc(EMPRESA_DOC(empresaId, "rentalPurchaseOrders", quote.ocId), {
    contratoId,
    updatedAt: serverTimestamp(),
  });

  await updateDoc(EMPRESA_DOC(empresaId, "rentalQuotes", quote.id), {
    contratoGeneradoId: contratoId,
    updatedAt: serverTimestamp(),
  });

  return contratoId;
}

// Alias del nombre anterior, por si quedó alguna llamada suelta.
export const convertQuoteToContract = crearContratoDesdeCotizacion;

export async function finalizarRentalContract(empresaId, contractId, estado = "finalizado") {
  const snap = await getDoc(EMPRESA_DOC(empresaId, "rentalContracts", contractId));
  if (!snap.exists()) throw new Error("El contrato no existe");
  const contrato = { id: snap.id, ...snap.data() };
  await updateDoc(EMPRESA_DOC(empresaId, "rentalContracts", contractId), {
    estado, updatedAt: serverTimestamp(),
  });
  await syncMachineRentalStatus(empresaId, { ...contrato, estado });
}

export async function deleteRentalContract(empresaId, contractId) {
  const pagos = await listRentalPayments(empresaId, { contratoId: contractId });
  if (pagos.length) {
    throw new Error(`No se puede eliminar: el contrato tiene ${pagos.length} estado(s) de pago. Finalízalo o cancélalo.`);
  }

  const snap = await getDoc(EMPRESA_DOC(empresaId, "rentalContracts", contractId));
  const contrato = snap.exists() ? { id: snap.id, ...snap.data() } : null;

  // Suelta las OC y devuelve la cotización a aceptada, para poder rehacerlo.
  const ocs = await listRentalPurchaseOrders(empresaId, { contratoId: contractId });
  for (const oc of ocs) {
    await updateDoc(EMPRESA_DOC(empresaId, "rentalPurchaseOrders", oc.id), {
      contratoId: null, contratoNumero: "", updatedAt: serverTimestamp(),
    });
  }
  if (contrato?.cotizacionId) {
    try {
      await updateDoc(EMPRESA_DOC(empresaId, "rentalQuotes", contrato.cotizacionId), {
        contratoGeneradoId: null, updatedAt: serverTimestamp(),
      });
    } catch { /* la cotización pudo borrarse antes */ }
  }

  for (const a of contrato?.archivos || []) await borrarArchivo(a.path);
  await deleteDoc(EMPRESA_DOC(empresaId, "rentalContracts", contractId));

  if (contrato) {
    await liberarMaquinas(empresaId, (contrato.lineas || []).map((l) => l.machineId));
  }
}

export async function syncMachineRentalStatus(empresaId, contract, machineIdsALiberar = []) {
  const batch = writeBatch(db);
  const arrendando = contract.estado === "activo";

  for (const linea of contract.lineas || []) {
    if (!linea.machineId) continue;
    batch.set(
      EMPRESA_DOC(empresaId, "machines", linea.machineId),
      {
        disponibilidad: arrendando ? "arrendado" : "disponible",
        contratoActivoId: arrendando ? contract.id : null,
        clienteArriendoNombre: arrendando ? contract.clienteNombre || "" : "",
        updatedAt: Timestamp.now(),
      },
      { merge: true }
    );
  }

  for (const machineId of machineIdsALiberar) {
    if (!machineId) continue;
    batch.set(
      EMPRESA_DOC(empresaId, "machines", machineId),
      { disponibilidad: "disponible", contratoActivoId: null, clienteArriendoNombre: "", updatedAt: Timestamp.now() },
      { merge: true }
    );
  }

  await batch.commit();
}

export async function liberarMaquinas(empresaId, machineIds = []) {
  const ids = machineIds.filter(Boolean);
  if (!ids.length) return;
  const batch = writeBatch(db);
  for (const machineId of ids) {
    batch.set(
      EMPRESA_DOC(empresaId, "machines", machineId),
      { disponibilidad: "disponible", contratoActivoId: null, clienteArriendoNombre: "", updatedAt: Timestamp.now() },
      { merge: true }
    );
  }
  await batch.commit();
}

// ============================================================
// 5. ESTADOS DE PAGO
// ============================================================

export async function listRentalPayments(empresaId, filters = {}) {
  if (!empresaId) return [];
  let q = EMPRESA_COL(empresaId, "rentalPayments");
  const clauses = [];
  if (filters.contratoId) clauses.push(where("contratoId", "==", filters.contratoId));
  if (filters.clienteId) clauses.push(where("clienteId", "==", filters.clienteId));
  if (filters.ocId) clauses.push(where("ocId", "==", filters.ocId));
  if (filters.estado) clauses.push(where("estado", "==", filters.estado));
  if (clauses.length) q = query(q, ...clauses);
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => ({ id: d.id, ...normalizarEEPP(d.data()) }))
    .sort((a, b) => String(a.fechaVencimiento || "").localeCompare(String(b.fechaVencimiento || "")));
}

// Los EEPP antiguos guardaban solo `monto`. Se completa el desglose al leer
// para que ninguna pantalla tenga que adivinar si el monto lleva IVA.
function normalizarEEPP(p) {
  if (p.neto != null && p.total != null) return p;
  const total = Number(p.monto || 0);
  const afecto = p.afectoIVA !== false;
  const neto = afecto ? Math.round(total / (1 + IVA_TASA)) : total;
  return { ...p, neto, iva: total - neto, total, migradoDesdeMonto: true };
}

export async function upsertRentalPayment(empresaId, payment) {
  if (!payment.contratoId) throw new Error("El estado de pago debe estar asociado a un contrato");

  const neto = Math.round(Number(payment.neto || 0));
  if (neto <= 0) throw new Error("El monto neto debe ser mayor a cero");

  const contratoSnap = await getDoc(EMPRESA_DOC(empresaId, "rentalContracts", payment.contratoId));
  if (!contratoSnap.exists()) throw new Error("El contrato indicado no existe");
  const contrato = { id: contratoSnap.id, ...contratoSnap.data() };

  const afectoIVA = payment.afectoIVA !== false;
  const { iva, total } = desglosarIVA(neto, { afectoIVA });

  // Tope del contrato: OC original más enmiendas, menos lo ya emitido.
  const [ocs, todosLosPagos] = await Promise.all([
    listRentalPurchaseOrders(empresaId, { contratoId: contrato.id }),
    listRentalPayments(empresaId, { contratoId: contrato.id }),
  ]);
  const hermanos = todosLosPagos.filter((p) => p.id !== payment.id && p.estado !== "anulado");
  const autorizado = ocs
    .filter((o) => o.estado !== "anulada")
    .reduce((s, o) => s + Number(o.montoNeto || 0), 0);
  const consumido = hermanos.reduce((s, p) => s + Number(p.neto || 0), 0);
  const disponible = autorizado - consumido;

  if (payment.estado !== "anulado" && autorizado > 0 && neto > disponible) {
    throw new Error(
      `El neto supera el monto autorizado del contrato. Disponible: ${CLP(disponible)}. ` +
      "Registra una enmienda con la nueva OC del cliente para ampliarlo."
    );
  }

  // La OC concreta contra la que se imputa este estado de pago.
  let ocId = payment.ocId || null;
  let ocNumero = payment.ocNumero || "";
  if (ocId) {
    const oc = ocs.find((o) => o.id === ocId);
    if (!oc) throw new Error("La orden de compra indicada no pertenece a este contrato");
    if (oc.estado === "anulada") throw new Error("La orden de compra está anulada");
    ocNumero = oc.numeroOC;
  } else {
    // Sin elección explícita: la primera OC con saldo, en orden de emisión.
    const conSaldo = ocs
      .filter((o) => o.estado !== "anulada")
      .find((o) => saldoOC(o, hermanos).saldo > 0);
    if (conSaldo) { ocId = conSaldo.id; ocNumero = conSaldo.numeroOC; }
  }

  const data = {
    contratoId: contrato.id,
    contratoNumero: contrato.numero || "",
    clienteId: contrato.clienteId || null,
    clienteNombre: contrato.clienteNombre || "",
    ocId, ocNumero,
    periodo: payment.periodo || "",
    concepto: (payment.concepto || "").trim(),
    neto, iva, total,
    monto: total, // alias de compatibilidad
    afectoIVA,
    fechaEmision: payment.fechaEmision || new Date().toISOString().slice(0, 10),
    fechaVencimiento: payment.fechaVencimiento || "",
    fechaAprobacion: payment.fechaAprobacion || "",
    fechaPago: payment.fechaPago || "",
    medioPago: payment.medioPago || "",
    estado: payment.estado || "pendiente",
    observaciones: (payment.observaciones || "").trim(),
    // Bloque de factura y cobranza (pasos 6 y 7)
    factura: payment.factura || null,
    factorizada: payment.factorizada === true,
    factoringNombre: payment.factoringNombre || "",
    fechaCesion: payment.fechaCesion || "",
    notasCobranza: payment.notasCobranza || "",
    updatedAt: serverTimestamp(),
  };

  if (payment.id) {
    if (payment.numero) data.numero = payment.numero;
    await updateDoc(EMPRESA_DOC(empresaId, "rentalPayments", payment.id), data);
    return payment.id;
  }

  data.numero = payment.numero?.trim() || (await siguienteFolio(empresaId, "eepp"));
  data.archivos = [];
  data.gestiones = [];
  data.createdAt = serverTimestamp();
  const ref = await addDoc(EMPRESA_COL(empresaId, "rentalPayments"), data);
  return ref.id;
}

export async function deleteRentalPayment(empresaId, paymentId) {
  const snap = await getDoc(EMPRESA_DOC(empresaId, "rentalPayments", paymentId));
  if (snap.exists() && snap.data().estado === "pagado") {
    throw new Error("No se puede eliminar un estado de pago ya pagado. Anúlalo en su lugar.");
  }
  for (const a of (snap.exists() ? snap.data().archivos || [] : [])) await borrarArchivo(a.path);
  await deleteDoc(EMPRESA_DOC(empresaId, "rentalPayments", paymentId));
}

// Paso 6a: el mandante aprueba el estado de pago por correo.
export async function aprobarEEPP(empresaId, paymentId, { fechaAprobacion, observaciones = "" } = {}) {
  await updateDoc(EMPRESA_DOC(empresaId, "rentalPayments", paymentId), {
    estado: "aprobado",
    fechaAprobacion: fechaAprobacion || new Date().toISOString().slice(0, 10),
    observacionesAprobacion: observaciones,
    updatedAt: serverTimestamp(),
  });
}

// ============================================================
// 6. FACTURACIÓN
// ============================================================
// La factura se emite en otra plataforma. Aquí se registra y se adjunta:
// sin número, fecha y respaldo, el estado de pago no pasa a facturado.

export async function facturarEEPP(empresaId, paymentId, factura = {}, file = null) {
  const numero = String(factura.numero || "").trim();
  if (!numero) throw new Error("Ingresa el número de factura");
  if (!factura.fechaEmision) throw new Error("Ingresa la fecha de emisión de la factura");

  const ref = EMPRESA_DOC(empresaId, "rentalPayments", paymentId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("El estado de pago no existe");
  const eepp = normalizarEEPP(snap.data());

  const diasPago = Number(factura.diasPago || 30);
  const fechaVencimiento = factura.fechaVencimiento || sumarDias(factura.fechaEmision, diasPago);

  if (file) {
    await adjuntar(empresaId, "rentalPayments", paymentId, file, { categoria: "factura" });
  } else if (!(eepp.archivos || []).some((a) => a.categoria === "factura")) {
    throw new Error("Adjunta el PDF de la factura para poder marcarlo como facturado");
  }

  await updateDoc(ref, {
    estado: "facturado",
    factura: {
      numero,
      fechaEmision: factura.fechaEmision,
      fechaVencimiento,
      neto: Number(factura.neto ?? eepp.neto ?? 0),
      iva: Number(factura.iva ?? eepp.iva ?? 0),
      total: Number(factura.total ?? eepp.total ?? 0),
      tipoDocumento: factura.tipoDocumento || "factura_afecta",
    },
    fechaVencimiento, // la cobranza se rige por el vencimiento de la factura
    updatedAt: serverTimestamp(),
  });
}

export async function registrarPagoEEPP(empresaId, paymentId, { fechaPago, medioPago = "", montoPagado } = {}) {
  const patch = {
    estado: "pagado",
    fechaPago: fechaPago || new Date().toISOString().slice(0, 10),
    medioPago,
    updatedAt: serverTimestamp(),
  };
  if (montoPagado != null) patch.montoPagado = Number(montoPagado);
  await updateDoc(EMPRESA_DOC(empresaId, "rentalPayments", paymentId), patch);
}

export async function anularEEPP(empresaId, paymentId, motivo = "") {
  await updateDoc(EMPRESA_DOC(empresaId, "rentalPayments", paymentId), {
    estado: "anulado",
    motivoAnulacion: motivo,
    updatedAt: serverTimestamp(),
  });
}

// ============================================================
// 7. CONTROL DE FACTURAS Y COBRANZA
// ============================================================

export async function registrarFactoring(empresaId, paymentId, { factorizada, factoringNombre = "", fechaCesion = "", montoCedido } = {}) {
  const patch = {
    factorizada: factorizada === true,
    factoringNombre: factorizada ? factoringNombre : "",
    fechaCesion: factorizada ? fechaCesion : "",
    updatedAt: serverTimestamp(),
  };
  if (montoCedido != null) patch.montoCedido = Number(montoCedido);
  await updateDoc(EMPRESA_DOC(empresaId, "rentalPayments", paymentId), patch);
}

// Bitácora de cobranza: cada llamada, correo o compromiso de pago.
export async function registrarGestionCobranza(empresaId, paymentId, gestion = {}) {
  if (!gestion.detalle?.trim()) throw new Error("Escribe el detalle de la gestión");
  const ref = EMPRESA_DOC(empresaId, "rentalPayments", paymentId);
  const snap = await getDoc(ref);
  const actuales = snap.exists() ? snap.data().gestiones || [] : [];
  const nueva = {
    id: `g_${Date.now()}`,
    fecha: gestion.fecha || new Date().toISOString().slice(0, 10),
    tipo: gestion.tipo || "llamada", // llamada | correo | visita | compromiso
    detalle: gestion.detalle.trim(),
    compromisoPago: gestion.compromisoPago || "",
    usuario: gestion.usuario || "",
    registradaEn: new Date().toISOString(),
  };
  await updateDoc(ref, { gestiones: [...actuales, nueva], updatedAt: serverTimestamp() });
  return nueva;
}

// "Vencido" se deriva de la fecha: nunca se guarda como estado.
export function estadoEfectivoEEPP(p) {
  if (!p) return "pendiente";
  if (["pagado", "anulado"].includes(p.estado)) return p.estado;
  const venc = p.factura?.fechaVencimiento || p.fechaVencimiento;
  if (venc && parseFechaLocal(venc) < hoy()) return "vencido";
  return p.estado || "pendiente";
}

export function montoTotalEEPP(p) {
  return Number(p?.factura?.total ?? p?.total ?? p?.monto ?? 0);
}

// Días que faltan para vencer (negativo = días de mora).
export function diasParaVencer(p) {
  const venc = p?.factura?.fechaVencimiento || p?.fechaVencimiento;
  if (!venc) return null;
  return Math.ceil((parseFechaLocal(venc) - hoy()) / 86400000);
}

export function diasVencidoEEPP(p) {
  const d = diasParaVencer(p);
  return d != null && d < 0 ? Math.abs(d) : 0;
}

// Antigüedad de la deuda por tramos, sobre lo no pagado.
export function agingCobranza(payments = []) {
  const tramos = {
    porVencer: { label: "Por vencer", monto: 0, cantidad: 0 },
    d1_30: { label: "1 a 30 días", monto: 0, cantidad: 0 },
    d31_60: { label: "31 a 60 días", monto: 0, cantidad: 0 },
    d61_90: { label: "61 a 90 días", monto: 0, cantidad: 0 },
    d90: { label: "Más de 90 días", monto: 0, cantidad: 0 },
  };

  for (const p of payments) {
    const estado = estadoEfectivoEEPP(p);
    if (estado === "pagado" || estado === "anulado") continue;
    const dias = diasVencidoEEPP(p);
    const clave = dias === 0 ? "porVencer"
      : dias <= 30 ? "d1_30"
      : dias <= 60 ? "d31_60"
      : dias <= 90 ? "d61_90"
      : "d90";
    tramos[clave].monto += montoTotalEEPP(p);
    tramos[clave].cantidad += 1;
  }
  return tramos;
}

// Genera los estados de pago mensuales sugeridos de un contrato (no los guarda).
// Prorratea el primer y el último mes según los días realmente cubiertos.
export function suggestPaymentsForContract(contract, { prorratear = true, diasPago = 30 } = {}) {
  if (!contract?.fechaInicio) return [];

  const netoMensual = (contract.lineas || []).reduce((s, l) => s + ingresoMensualLinea(l), 0);
  if (!netoMensual) return [];

  const inicio = parseFechaLocal(contract.fechaInicio);
  const fin = contract.fechaFin ? parseFechaLocal(contract.fechaFin) : null;
  const limite = fin || new Date(inicio.getFullYear(), inicio.getMonth() + 11, 1);
  const afectoIVA = contract.afectoIVA !== false;

  const cobros = [];
  let cursor = new Date(inicio.getFullYear(), inicio.getMonth(), 1);
  let guard = 0;

  while (cursor <= limite && guard < 36) {
    const anio = cursor.getFullYear();
    const mes = cursor.getMonth();
    const diasMes = new Date(anio, mes + 1, 0).getDate();

    const primerDia = inicio.getFullYear() === anio && inicio.getMonth() === mes ? inicio.getDate() : 1;
    const ultimoDia = fin && fin.getFullYear() === anio && fin.getMonth() === mes ? fin.getDate() : diasMes;
    const diasCubiertos = ultimoDia - primerDia + 1;

    if (diasCubiertos > 0) {
      const factor = prorratear ? diasCubiertos / diasMes : 1;
      const neto = Math.round(netoMensual * factor);
      const { iva, total } = desglosarIVA(neto, { afectoIVA });
      const periodo = `${anio}-${String(mes + 1).padStart(2, "0")}`;
      const cierre = new Date(anio, mes, ultimoDia);

      cobros.push({
        contratoId: contract.id,
        contratoNumero: contract.numero || "",
        clienteId: contract.clienteId,
        clienteNombre: contract.clienteNombre,
        periodo,
        concepto: `Arriendo ${periodo}${factor < 1 ? ` (${diasCubiertos} días)` : ""}`,
        neto, iva, total,
        afectoIVA,
        diasCubiertos,
        prorrateado: factor < 1,
        fechaEmision: cierre.toISOString().slice(0, 10),
        fechaVencimiento: sumarDias(cierre.toISOString(), Number(diasPago) || 30),
        estado: "pendiente",
      });
    }

    cursor = new Date(anio, mes + 1, 1);
    guard++;
  }

  return cobros;
}

// ============================================================
// RENTABILIDAD REAL POR MÁQUINA
// ============================================================
// Ingreso neto emitido − leasing − mantenciones. Se usa el NETO: el IVA no
// es ingreso de la empresa.

export function buildIngresoPorMaquina(contracts) {
  const map = {};
  for (const c of contracts) {
    if (c.estado !== "activo") continue;
    for (const l of c.lineas || []) {
      if (!l.machineId) continue;
      if (!map[l.machineId]) {
        map[l.machineId] = { ingresoMensual: 0, contratoId: c.id, clienteNombre: c.clienteNombre };
      }
      map[l.machineId].ingresoMensual += ingresoMensualLinea(l);
    }
  }
  return map;
}

export function computeRentabilidad(machines, contracts, payments, events, opts = {}) {
  const { desde = null, hasta = null } = opts;

  const enRango = (periodo) => {
    if (!periodo) return desde == null && hasta == null;
    if (desde && periodo < desde) return false;
    if (hasta && periodo > hasta) return false;
    return true;
  };
  const fechaEnRango = (fechaISO) => {
    if (!fechaISO) return desde == null && hasta == null;
    return enRango(String(fechaISO).slice(0, 7));
  };

  const contratoById = {};
  for (const c of contracts) contratoById[c.id] = c;

  let mesesLeasing = opts.mesesLeasing;
  if (mesesLeasing == null) {
    if (desde && hasta) {
      const [ay, am] = desde.split("-").map(Number);
      const [by, bm] = hasta.split("-").map(Number);
      mesesLeasing = (by - ay) * 12 + (bm - am) + 1;
    } else {
      mesesLeasing = 1;
    }
  }

  const acc = {};
  for (const m of machines) {
    acc[m.id] = {
      machineId: m.id,
      nombre: m.name || `${m.marca || ""} ${m.modelo || ""}`.trim() || m.code || m.id,
      code: m.code || "",
      ingreso: 0,
      leasing: Number(m.leasingMensual || 0) * mesesLeasing,
      mantencion: 0,
      repuestos: 0,
    };
  }

  for (const p of payments) {
    if (p.estado === "anulado") continue;
    const periodoCobro = p.periodo || (p.fechaVencimiento ? String(p.fechaVencimiento).slice(0, 7) : null);
    if (!enRango(periodoCobro)) continue;

    const contrato = contratoById[p.contratoId];
    if (!contrato || !(contrato.lineas || []).length) continue;

    const pesos = contrato.lineas.map((l) => ({ machineId: l.machineId, peso: ingresoMensualLinea(l) }));
    const totalPeso = pesos.reduce((s, x) => s + x.peso, 0);
    if (totalPeso <= 0) continue;

    const netoCobro = Number(p.neto ?? p.monto ?? 0);
    for (const { machineId, peso } of pesos) {
      if (!acc[machineId]) continue;
      acc[machineId].ingreso += netoCobro * (peso / totalPeso);
    }
  }

  for (const e of events) {
    if (!acc[e.machineId]) continue;
    if (!fechaEnRango(e.fecha)) continue;
    acc[e.machineId].mantencion += Number(e.costoTotal || 0);
  }

  return Object.values(acc)
    .map((r) => ({ ...r, margen: r.ingreso - r.leasing - r.mantencion - r.repuestos }))
    .sort((a, b) => a.margen - b.margen);
}

// ============================================================
// UTILIDADES INTERNAS
// ============================================================

function hoy() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

// Evita el corrimiento de un día que produce new Date("2026-08-01") en UTC.
function parseFechaLocal(valor) {
  const s = String(valor).slice(0, 10);
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function sumarDias(fechaISO, dias) {
  const base = parseFechaLocal(fechaISO);
  base.setDate(base.getDate() + Number(dias || 0));
  return base.toISOString().slice(0, 10);
}

function normalizarLinea(l) {
  return {
    machineId: l.machineId,
    code: l.code || "",
    descripcion: l.descripcion || "",
    tarifaTipo: l.tarifaTipo || "mes",
    tarifaValor: Number(l.tarifaValor || 0),
    cantidadEstimada: l.cantidadEstimada === "" || l.cantidadEstimada == null ? null : Number(l.cantidadEstimada),
  };
}
