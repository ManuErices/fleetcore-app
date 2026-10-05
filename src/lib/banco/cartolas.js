/**
 * src/lib/banco/cartolas.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Lee las cartolas que exportan los bancos y las deja en un formato único.
 * No toca Firestore ni pantallas: recibe el archivo y devuelve datos.
 *
 * Bancos soportados (formatos reales, oct 2026):
 *  · Banco de Chile: .xls con encabezado (empresa, cuenta, saldos, línea de
 *    crédito) y movimientos con saldo después de cada uno. Más nuevo arriba.
 *  · BICE ("Cartola Provisoria"): .xls sin saldo, fechas yyyymmdd como texto,
 *    desordenadas, y la contraparte con RUT dentro de la descripción.
 *
 * Uso:
 *   const cartola = leerCartola(await archivo.arrayBuffer());
 *   cartola.movimientos.forEach(m => clasificar(m, { empresa }));
 */
import * as XLSX from "xlsx";

// ─── Utilidades ───────────────────────────────────────────────────────────────
const txt = (v) => (v === null || v === undefined ? "" : String(v)).trim();

/** Número desde celda: acepta número, "1.234.567", "1.234,50" o vacío. */
export function numero(v) {
  if (typeof v === "number") return v;
  const s = txt(v);
  if (!s) return 0;
  const limpio = s.replace(/\$/g, "").replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  const n = Number(limpio);
  return Number.isFinite(n) ? n : 0;
}

/** Fecha ISO (yyyy-mm-dd) desde "dd/mm/yyyy", "dd-mm-yyyy", "yyyymmdd" o 20261001. */
export function fechaISO(v) {
  const s = typeof v === "number" ? String(Math.trunc(v)) : txt(v);
  let m = s.match(/^(\d{2})[/-](\d{2})[/-](\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
}

/** Normaliza para comparar nombres: minúsculas, sin tildes ni puntuación. */
export function normalizar(s) {
  return txt(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

/** RUT sin puntos, con guion y dígito verificador en mayúscula. */
export function normalizarRut(rut) {
  const s = txt(rut).replace(/\./g, "").toUpperCase();
  return /^\d{7,8}-[\dK]$/.test(s) ? s : "";
}

function filasDe(arrayBuffer) {
  const libro = XLSX.read(arrayBuffer, { type: "array" });
  const hoja = libro.Sheets[libro.SheetNames[0]];
  return XLSX.utils.sheet_to_json(hoja, { header: 1, raw: true, defval: "" });
}

/** Primer valor no vacío a la derecha de la etiqueta, en la misma fila. */
function valorJunto(filas, etiqueta) {
  for (const fila of filas) {
    const i = fila.findIndex(c => txt(c).toLowerCase().startsWith(etiqueta.toLowerCase()));
    if (i >= 0) {
      const v = fila.slice(i + 1).find(c => txt(c) !== "");
      if (v !== undefined) return v;
    }
  }
  return "";
}

/** Valor bajo la etiqueta (misma columna, fila siguiente). */
function valorBajo(filas, etiqueta) {
  for (let r = 0; r < filas.length - 1; r++) {
    const i = filas[r].findIndex(c => txt(c).toLowerCase() === etiqueta.toLowerCase());
    if (i >= 0) return filas[r + 1][i];
  }
  return "";
}

// ─── Detección ────────────────────────────────────────────────────────────────
export function detectarBanco(filas) {
  for (const fila of filas.slice(0, 40)) {
    const celdas = fila.map(c => txt(c).toLowerCase());
    if (celdas.includes("fecha") && celdas.some(c => c.startsWith("cargos (clp)"))) return "bancochile";
    if (celdas.includes("fecha") && celdas.includes("descripcion") && celdas.includes("cargos") && celdas.includes("abonos")) return "bice";
  }
  return null;
}

// ─── Contraparte desde la descripción ─────────────────────────────────────────
/** ¿El RUT (sin puntos ni guion) tiene dígito verificador válido? Módulo 11. */
export function rutValido(rut) {
  const s = String(rut || "").replace(/[^0-9kK]/g, "").toUpperCase();
  if (s.length < 2) return false;
  const cuerpo = s.slice(0, -1), dv = s.slice(-1);
  let suma = 0, m = 2;
  for (let i = cuerpo.length - 1; i >= 0; i--) { suma += Number(cuerpo[i]) * m; m = m === 7 ? 2 : m + 1; }
  const r = 11 - (suma % 11);
  return dv === (r === 11 ? "0" : r === 10 ? "K" : String(r));
}

function contraparteBancoChile(desc) {
  // "Pago Fácil Bch: 0778212110" trae el RUT del beneficiario con ceros a la
  // izquierda (77.821.211-0). Pago Fácil también paga convenios de servicios
  // con códigos que no son RUT: solo se acepta si el dígito verificador cuadra.
  let pf = desc.match(/^pago f[aá]cil bch:\s*0*(\d{6,8}[\dkK])\s*$/i);
  if (pf && rutValido(pf[1])) {
    const r = pf[1].toUpperCase();
    return { nombre: "", rut: `${r.slice(0, -1)}-${r.slice(-1)}`, sentido: "sale", via: "pagofacil" };
  }
  let m = desc.match(/^(?:app-)?traspaso a:\s*(.+)$/i);
  if (m) return { nombre: m[1].trim(), rut: "", sentido: "sale" };
  m = desc.match(/^traspaso de:\s*(.+)$/i);
  if (m) return { nombre: m[1].trim(), rut: "", sentido: "entra" };
  return null;
}

function contraparteBice(desc) {
  let m = desc.match(/abono por transferencia de (.+?) rut ([\d.]+-[\dkK])/i);
  if (m) return { nombre: m[1].trim(), rut: normalizarRut(m[2]), sentido: "entra" };
  m = desc.match(/transf\. a terceros.*?a cuenta (\d+)\s+([^,]+),\s*([^,]+),\s*rut ([\d.]+-[\dkK])/i);
  if (m) return { nombre: m[3].trim(), rut: normalizarRut(m[4]), cuenta: m[1], banco: m[2].trim(), sentido: "sale" };
  return null;
}

// ─── Lectores por banco ───────────────────────────────────────────────────────
function leerBancoChile(filas) {
  const iEnc = filas.findIndex(f => f.some(c => txt(c).toLowerCase().startsWith("cargos (clp)")));
  const enc = filas[iEnc].map(c => txt(c).toLowerCase());
  const col = (nombre) => enc.findIndex(c => c.startsWith(nombre));
  const c = {
    fecha: col("fecha"), desc: col("descrip"), canal: col("canal"), doc: col("nro"),
    cargo: col("cargos"), abono: col("abonos"), saldo: col("saldo"),
  };

  const movimientos = [];
  for (const fila of filas.slice(iEnc + 1)) {
    const fecha = fechaISO(fila[c.fecha]);
    if (!fecha) continue;
    const descripcion = txt(fila[c.desc]);
    movimientos.push({
      fecha, descripcion,
      canal: txt(fila[c.canal]),
      documento: txt(fila[c.doc]).replace(/\.0$/, ""),
      cargo: numero(fila[c.cargo]),
      abono: numero(fila[c.abono]),
      saldo: numero(fila[c.saldo]),
      contraparte: contraparteBancoChile(descripcion),
    });
  }

  const corte = txt(valorJunto(filas, "Saldos")).match(/(\d{2}\/\d{2}\/\d{4})/);
  return {
    banco: "bancochile",
    titular: txt(valorJunto(filas, "Nombre Empresa:")),
    rut: normalizarRut(valorJunto(filas, "Rut:")),
    cuenta: txt(valorJunto(filas, "Cuenta N°:")),
    moneda: txt(valorJunto(filas, "Moneda:")),
    fechaCorte: corte ? fechaISO(corte[1]) : null,
    saldo: {
      disponible: numero(valorBajo(filas, "Saldo Disponible")),
      contable: numero(valorBajo(filas, "Saldo Contable")),
      lineaCredito: numero(valorBajo(filas, "Línea de Crédito")),
    },
    traeSaldo: true,
    movimientos,
  };
}

function leerBice(filas) {
  const iEnc = filas.findIndex(f => f.map(c => txt(c).toLowerCase()).includes("descripcion"));
  const enc = filas[iEnc].map(c => txt(c).toLowerCase());
  const c = {
    fecha: enc.indexOf("fecha"), doc: enc.indexOf("documento"), cod: enc.indexOf("codigo"),
    desc: enc.indexOf("descripcion"), cargo: enc.indexOf("cargos"), abono: enc.indexOf("abonos"),
  };

  const movimientos = [];
  for (const fila of filas.slice(iEnc + 1)) {
    const fecha = fechaISO(fila[c.fecha]);
    if (!fecha) continue;                    // salta las líneas de aviso del pie
    const descripcion = txt(fila[c.desc]).replace(/\s+/g, " ");
    movimientos.push({
      fecha, descripcion,
      documento: txt(fila[c.doc]), codigo: txt(fila[c.cod]),
      cargo: numero(fila[c.cargo]),
      abono: numero(fila[c.abono]),
      saldo: null,                           // BICE no informa saldo
      contraparte: contraparteBice(descripcion),
    });
  }
  // BICE las entrega desordenadas: más nuevo arriba, como el Banco de Chile.
  // sort es estable, así que el orden del banco se respeta dentro de cada día.
  movimientos.sort((a, b) => b.fecha.localeCompare(a.fecha));

  return {
    banco: "bice",
    titular: txt(valorBajo(filas, "NOMBRE DEL CLIENTE")),
    rut: "",
    cuenta: txt(valorBajo(filas, "CUENTA")),
    moneda: "Pesos Chilenos (CLP)",
    desde: fechaISO(valorBajo(filas, "FECHA DESDE")),
    hasta: fechaISO(valorBajo(filas, "FECHA HASTA")),
    fechaCorte: fechaISO(valorBajo(filas, "FECHA HASTA")),
    saldo: null,
    traeSaldo: false,
    movimientos,
  };
}

// ─── Entrada principal ────────────────────────────────────────────────────────
/**
 * Lee una cartola desde el ArrayBuffer del archivo. Lanza un Error con mensaje
 * para mostrar si el formato no se reconoce.
 */
export function leerCartola(arrayBuffer) {
  const filas = filasDe(arrayBuffer);
  const banco = detectarBanco(filas);
  if (!banco) {
    throw new Error("No reconozco el formato. Por ahora se leen cartolas del Banco de Chile y de BICE exportadas en Excel.");
  }
  const cartola = banco === "bancochile" ? leerBancoChile(filas) : leerBice(filas);
  if (cartola.movimientos.length === 0) throw new Error("La cartola no trae movimientos.");

  const fechas = cartola.movimientos.map(m => m.fecha).sort();
  cartola.desde = cartola.desde || fechas[0];
  cartola.hasta = cartola.hasta || fechas[fechas.length - 1];
  cartola.totales = {
    cargos: cartola.movimientos.reduce((s, m) => s + m.cargo, 0),
    abonos: cartola.movimientos.reduce((s, m) => s + m.abono, 0),
  };
  asignarClaves(cartola);
  return cartola;
}

// ─── Claves para no duplicar ──────────────────────────────────────────────────
/**
 * Cada movimiento recibe una clave estable para que, al importar cartolas que
 * se solapan, lo ya importado no se repita. En el Banco de Chile el saldo hace
 * única la clave. En BICE casi todas las descripciones traen la hora; para dos
 * movimientos idénticos el mismo día se agrega su número de aparición.
 */
function asignarClaves(cartola) {
  const vistos = new Map();
  const cuenta = txt(cartola.cuenta).replace(/\D/g, "");
  for (const m of [...cartola.movimientos].reverse()) {          // del más antiguo al más nuevo
    const base = [cartola.banco, cuenta, m.fecha, normalizar(m.descripcion), m.cargo, m.abono, m.saldo ?? ""].join("|");
    const n = (vistos.get(base) || 0) + 1;
    vistos.set(base, n);
    m.clave = n === 1 ? base : `${base}#${n}`;
  }
}

// ─── Verificación de saldos ───────────────────────────────────────────────────
/**
 * Banco de Chile: cada saldo debe ser el anterior menos el cargo más el abono.
 * Si la cadena se rompe, falta o sobra un movimiento en el archivo.
 */
export function verificarSaldos(cartola) {
  if (!cartola.traeSaldo) return { ok: null, quiebres: [] };
  const ms = cartola.movimientos;                 // más nuevo arriba
  const quiebres = [];
  for (let i = 0; i < ms.length - 1; i++) {
    const esperado = ms[i + 1].saldo - ms[i].cargo + ms[i].abono;
    if (Math.abs(esperado - ms[i].saldo) >= 1) quiebres.push({ indice: i, fecha: ms[i].fecha, esperado, informado: ms[i].saldo });
  }
  return { ok: quiebres.length === 0, quiebres };
}

/**
 * BICE: con el saldo disponible que muestra la web del banco al cierre de la
 * cartola, se calcula hacia atrás el saldo después de cada movimiento.
 */
export function reconstruirSaldos(cartola, saldoFinal) {
  let saldo = numero(saldoFinal);
  for (const m of cartola.movimientos) {          // más nuevo arriba
    m.saldo = saldo;
    saldo = saldo + m.cargo - m.abono;
  }
  cartola.saldo = { disponible: numero(saldoFinal), contable: numero(saldoFinal), lineaCredito: 0 };
  cartola.traeSaldo = true;
  cartola.saldoReconstruido = true;
  return cartola;
}

// ─── Clasificación ────────────────────────────────────────────────────────────
export const TIPOS = {
  traspaso_interno: "Traspaso entre cuentas propias",
  factoring:        "Factoring",
  nomina_proveedores: "Nómina de proveedores",
  nomina_sueldos:   "Nómina de sueldos",
  prevision:        "Imposiciones",
  impuestos:        "Impuestos",
  linea_credito:    "Línea de crédito",
  costo_financiero: "Intereses y comisiones",
  tarjeta:          "Tarjeta de crédito",
  servicios:        "Servicios y convenios",
  devolucion:       "Devolución o rechazo",
  efectivo:         "Giro o depósito en efectivo",
  pago_tercero:     "Pago a tercero",
  abono_tercero:    "Abono de tercero",
  sin_clasificar:   "Sin clasificar",
};

// Orden importa: gana la primera que calza. Se prueban sobre la descripción
// normalizada (sin tildes, minúsculas).
const REGLAS_BASE = [
  ["factoring",          /factoring|serv financieros/],
  ["nomina_proveedores", /^provision proveedores/],
  ["nomina_sueldos",     /^provision de (sueldos|anticipo|reliquidac)/],
  ["devolucion",         /^devolucion|retorno de transf/],
  ["prevision",          /previsional|instituciones previsionales/],
  ["impuestos",          /sii cl|tesoreria cl/],
  ["costo_financiero",   /intereses|impuesto (linea|sobregiro)|comision/],   // antes que la línea: "Intereses Linea De Credito" es costo
  ["linea_credito",      /linea de credito|linea cred/],
  ["tarjeta",            /tarjeta de cr|cargo por compra/],
  ["servicios",          /pago facil|servipag|recaudacion y pagos|^pago /],
  ["efectivo",           /giro cajero|dep cheq|deposito en efectivo/],
  ["pago_tercero",       /^(app )?traspaso a |transf a terceros/],
  ["abono_tercero",      /^traspaso de |abono por transferencia de/],
];

/**
 * Clasifica un movimiento. `empresa` = { rut, nombre } de la empresa dueña de
 * la cuenta, para reconocer los traspasos entre sus propias cuentas.
 * `reglasExtra` = [{ patron, tipo }] guardadas cuando alguien clasifica a mano;
 * se prueban antes que las de base.
 */
export function clasificar(mov, { empresa = {}, reglasExtra = [] } = {}) {
  const d = normalizar(mov.descripcion);
  const rutEmpresa = normalizarRut(empresa.rut);
  const nombreEmpresa = normalizar(empresa.nombre);

  for (const r of reglasExtra) {
    if (r.patron && d.includes(normalizar(r.patron))) return r.tipo;
  }
  const cp = mov.contraparte;
  // Pago Fácil con RUT válido es un pago a un tercero, no un convenio de servicios.
  if (cp?.via === "pagofacil" && cp.rut && !(rutEmpresa && cp.rut === rutEmpresa)) return "pago_tercero";
  if (cp && ((rutEmpresa && cp.rut === rutEmpresa) || (nombreEmpresa && normalizar(cp.nombre).startsWith(nombreEmpresa.slice(0, 18))))) {
    return "traspaso_interno";
  }
  for (const [tipo, patron] of REGLAS_BASE) if (patron.test(d)) return tipo;
  return "sin_clasificar";
}
