import {
  collection, doc, addDoc, updateDoc, getDocs, onSnapshot,
  query, where, orderBy,
} from "firebase/firestore";
import { db, auth } from "./firebase";

/*
 * ════════════════════════════════════════════════════════════════════════
 *  MAESTRO DE PROVEEDORES
 *  empresas/{empresaId}/proveedores/{proveedorId}
 * ════════════════════════════════════════════════════════════════════════
 * Ficha única por proveedor o beneficiario: cómo se le paga y a quién
 * contactar. Las cuentas del flujo de caja la referencian con `proveedorId`
 * en vez de copiar los datos, así un proveedor con varias cuentas se
 * mantiene en un solo lugar.
 *
 * Es el primer paso del maestro de vendors del plan de integración: hoy el
 * mismo proveedor vive como texto libre en rendiciones, OC, subcontratos,
 * deuda y costos fijos. Más adelante esas colecciones pueden apuntar aquí.
 *
 * Esquema:
 *   razonSocial      string (obligatorio)
 *   rut              string formateado "76.123.456-7" ("" si no tiene, ej. extranjeros)
 *   rutNormalizado   string "761234567" — llave para detectar duplicados
 *   medioPago        "transferencia" | "web" | "automatico" | ""
 *   transferencia    { titular, rutTitular, banco, tipoCuenta, numeroCuenta, emailComprobante }
 *   web              { url, numeroCliente }
 *   automatico       { cargoEn }
 *   contacto         { email, telefono }
 *   ejecutivo        { nombre, email, telefono }
 *   notas            string
 *   creadoEn/Por, actualizadoEn/Por
 *
 * Solo se persiste el bloque del medio de pago activo: si cambia de
 * transferencia a web, los datos bancarios viejos no quedan escondidos.
 * Nunca se guardan contraseñas de portales.
 * ════════════════════════════════════════════════════════════════════════
 */

export const MEDIOS_PAGO = [
  { id: "transferencia", label: "Transferencia" },
  { id: "web",           label: "Portal web" },
  { id: "automatico",    label: "Cargo automático" },
];

export const BANCOS = [
  "Banco de Chile", "BancoEstado", "Banco Santander", "BCI", "Scotiabank",
  "Itaú", "Banco BICE", "Banco Security", "Banco Falabella", "Banco Ripley",
  "Banco Consorcio", "Banco Internacional", "Coopeuch", "Mercado Pago", "Tenpo",
];

export const TIPOS_CUENTA = [
  "Cuenta corriente", "Cuenta vista", "Cuenta RUT", "Cuenta de ahorro", "Chequera electrónica",
];

const VACIO_TRANSFERENCIA = { titular: "", rutTitular: "", banco: "", tipoCuenta: "", numeroCuenta: "", emailComprobante: "" };
const VACIO_WEB           = { url: "", numeroCliente: "" };
const VACIO_AUTOMATICO    = { cargoEn: "" };
const VACIO_CONTACTO      = { email: "", telefono: "" };
const VACIO_EJECUTIVO     = { nombre: "", email: "", telefono: "" };

export const PROVEEDOR_VACIO = {
  razonSocial: "", rut: "", medioPago: "",
  transferencia: VACIO_TRANSFERENCIA, web: VACIO_WEB, automatico: VACIO_AUTOMATICO,
  contacto: VACIO_CONTACTO, ejecutivo: VACIO_EJECUTIVO, notas: "",
};

// Rellena los bloques que falten en una ficha leída de Firestore, para que
// el formulario nunca trabaje con undefined.
export function completarProveedor(p = {}) {
  return {
    ...PROVEEDOR_VACIO,
    ...p,
    transferencia: { ...VACIO_TRANSFERENCIA, ...(p.transferencia || {}) },
    web:           { ...VACIO_WEB,           ...(p.web || {}) },
    automatico:    { ...VACIO_AUTOMATICO,    ...(p.automatico || {}) },
    contacto:      { ...VACIO_CONTACTO,      ...(p.contacto || {}) },
    ejecutivo:     { ...VACIO_EJECUTIVO,     ...(p.ejecutivo || {}) },
  };
}

// ─── RUT ────────────────────────────────────────────────────────────────────
export function normalizarRut(rut) {
  return String(rut || "").replace(/[^0-9kK]/g, "").toUpperCase();
}

export function formatearRut(rut) {
  const limpio = normalizarRut(rut);
  if (limpio.length < 2) return limpio;
  const cuerpo = limpio.slice(0, -1);
  const dv = limpio.slice(-1);
  return `${cuerpo.replace(/\B(?=(\d{3})+(?!\d))/g, ".")}-${dv}`;
}

// Valida el dígito verificador con módulo 11.
export function validarRut(rut) {
  const limpio = normalizarRut(rut);
  if (limpio.length < 2) return false;
  const cuerpo = limpio.slice(0, -1);
  const dv = limpio.slice(-1);
  if (!/^\d+$/.test(cuerpo)) return false;
  let suma = 0, multiplo = 2;
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += Number(cuerpo[i]) * multiplo;
    multiplo = multiplo === 7 ? 2 : multiplo + 1;
  }
  const resto = 11 - (suma % 11);
  const esperado = resto === 11 ? "0" : resto === 10 ? "K" : String(resto);
  return dv === esperado;
}

// ─── URL y contacto ─────────────────────────────────────────────────────────
// Agrega https:// si falta y rechaza cualquier esquema que no sea http(s):
// la URL se usa como href, y un "javascript:" ahí sería un riesgo real.
export function normalizarUrl(url) {
  const t = String(url || "").trim();
  if (!t) return "";
  const conProtocolo = /^[a-z][a-z0-9+.-]*:/i.test(t) ? t : `https://${t}`;
  try {
    const u = new URL(conProtocolo);
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : null;
  } catch {
    return null;
  }
}

export function esEmailValido(email) {
  return !email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim());
}

export function hrefTelefono(tel) {
  const limpio = String(tel || "").replace(/[^\d+]/g, "");
  return limpio ? `tel:${limpio}` : null;
}

// ─── Texto listo para pegar en el banco ─────────────────────────────────────
export function textoTransferencia(p) {
  const t = p?.transferencia || {};
  return [
    `Nombre: ${t.titular || p?.razonSocial || ""}`,
    `RUT: ${t.rutTitular || p?.rut || ""}`,
    `Banco: ${t.banco || ""}`,
    `Tipo de cuenta: ${t.tipoCuenta || ""}`,
    `N° de cuenta: ${t.numeroCuenta || ""}`,
    t.emailComprobante ? `Correo: ${t.emailComprobante}` : null,
  ].filter(Boolean).join("\n");
}

// ─── Validación previa al guardado ──────────────────────────────────────────
// Devuelve { campo: mensaje } con los errores; objeto vacío si está todo bien.
export function validarProveedor(form) {
  const errores = {};
  if (!form.razonSocial?.trim()) errores.razonSocial = "Escribe la razón social o el nombre";
  if (form.rut?.trim() && !validarRut(form.rut)) errores.rut = "El RUT no es válido. Revisa el dígito verificador";

  if (form.medioPago === "transferencia") {
    const t = form.transferencia;
    if (!t.banco?.trim()) errores.banco = "Indica el banco";
    if (!t.numeroCuenta?.trim()) errores.numeroCuenta = "Indica el número de cuenta";
    if (t.rutTitular?.trim() && !validarRut(t.rutTitular)) errores.rutTitular = "El RUT del titular no es válido";
    if (!esEmailValido(t.emailComprobante)) errores.emailComprobante = "El correo no es válido";
  }
  if (form.medioPago === "web") {
    if (!form.web.url?.trim()) errores.url = "Indica la URL de pago";
    else if (normalizarUrl(form.web.url) === null) errores.url = "La URL no es válida. Debe empezar con https://";
  }
  if (form.medioPago === "automatico" && !form.automatico.cargoEn?.trim()) {
    errores.cargoEn = "Indica dónde se hace el cargo";
  }
  if (!esEmailValido(form.contacto.email))  errores.contactoEmail  = "El correo no es válido";
  if (!esEmailValido(form.ejecutivo.email)) errores.ejecutivoEmail = "El correo no es válido";
  return errores;
}

// Arma el documento que se persiste: recorta espacios, normaliza RUT y URL,
// y deja solo el bloque del medio de pago activo.
function prepararDocumento(form) {
  const limpiar = obj => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, String(v ?? "").trim()]));
  const rut = form.rut?.trim() ? formatearRut(form.rut) : "";
  const docu = {
    razonSocial: form.razonSocial.trim(),
    rut,
    rutNormalizado: normalizarRut(rut),
    medioPago: form.medioPago || "",
    transferencia: null, web: null, automatico: null,
    contacto: limpiar(form.contacto),
    ejecutivo: limpiar(form.ejecutivo),
    notas: String(form.notas || "").trim(),
  };
  if (form.medioPago === "transferencia") {
    const t = limpiar(form.transferencia);
    docu.transferencia = { ...t, rutTitular: t.rutTitular ? formatearRut(t.rutTitular) : "" };
  }
  if (form.medioPago === "web") {
    docu.web = { url: normalizarUrl(form.web.url) || "", numeroCliente: String(form.web.numeroCliente || "").trim() };
  }
  if (form.medioPago === "automatico") docu.automatico = limpiar(form.automatico);
  return docu;
}

// ─── Firestore ──────────────────────────────────────────────────────────────
const col = empresaId => collection(db, "empresas", empresaId, "proveedores");

// Suscripción en vivo, ordenada por nombre. Devuelve la función para cortarla.
export function escucharProveedores(empresaId, onDatos, onError) {
  if (!empresaId) return () => {};
  return onSnapshot(
    query(col(empresaId), orderBy("razonSocial")),
    snap => onDatos(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
    err => { console.error("Error escuchando proveedores:", err); onError?.(err); }
  );
}

/**
 * Crea o actualiza una ficha. Si el RUT ya pertenece a otro proveedor se
 * rechaza con un error legible en vez de crear un duplicado.
 * Devuelve el id del proveedor.
 */
export async function guardarProveedor(empresaId, form, proveedorId = null) {
  const docu = prepararDocumento(form);
  const ahora = new Date().toISOString();
  const usuario = auth.currentUser?.email || null;

  if (docu.rutNormalizado) {
    const snap = await getDocs(query(col(empresaId), where("rutNormalizado", "==", docu.rutNormalizado)));
    const otro = snap.docs.find(d => d.id !== proveedorId);
    if (otro) {
      const err = new Error(`Ya existe un proveedor con el RUT ${docu.rut}: ${otro.data().razonSocial}`);
      err.code = "rut-duplicado";
      throw err;
    }
  }

  if (proveedorId) {
    await updateDoc(doc(col(empresaId), proveedorId), { ...docu, actualizadoEn: ahora, actualizadoPor: usuario });
    return proveedorId;
  }
  const ref = await addDoc(col(empresaId), { ...docu, creadoEn: ahora, creadoPor: usuario });
  return ref.id;
}
