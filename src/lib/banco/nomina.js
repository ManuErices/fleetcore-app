/**
 * src/lib/banco/nomina.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Arma la nómina de pagos en el formato de la plantilla "Pago Fácil" del Banco
 * de Chile (v4), y lee nóminas ya subidas para completar el maestro de
 * proveedores. Puro: no toca Firestore.
 *
 * Reglas de la plantilla:
 *  · Hoja "Nomina", columnas en este orden, con estos encabezados exactos.
 *  · RUT sin puntos, con guion. Cuenta sin guiones ni puntos. Código de banco
 *    de 3 dígitos. Tipo de cuenta CTD (corriente), AHB (ahorro), JUV (vista).
 *  · Sin tildes ni caracteres especiales en ningún campo.
 *  · Nombre de archivo solo con letras, números y espacios.
 * Y la práctica de MPF: los pagos de más de $5.000.000 van partidos en líneas
 * de $5.000.000 (así aparecen en las nóminas y en la cartola).
 */
import * as XLSX from "xlsx";
import { rutValido } from "./cartolas.js";

export const MAXIMO_POR_LINEA = 5_000_000;

export const ENCABEZADOS = [
  "Rut Beneficiario *", "Nombre Beneficiario*", "Cuenta beneficiario*", "Cod Banco *", "Monto*",
  "Tipo de Cuenta*", "Identificador ", "Descripcion del Pago", "Mail destinatario",
  "Campo Libre 1  (Glosa 1)", "Campo Libre 2 (Glosa 2)",
];

// ─── Bancos ───────────────────────────────────────────────────────────────────
// codigo: el de la plantilla. maestro: el nombre que usa el maestro de
// proveedores (src/lib/proveedores.js, BANCOS). patron: cómo reconocerlo en
// textos libres (certificados, fichas antiguas).
export const BANCOS_NOMINA = [
  { codigo: "001", nombre: "Banco de Chile",           maestro: "Banco de Chile",      patron: /banco de chile|^chile$|edwards|citi/ },
  { codigo: "009", nombre: "Banco Internacional",      maestro: "Banco Internacional", patron: /internacional/ },
  { codigo: "012", nombre: "Banco Estado",             maestro: "BancoEstado",         patron: /estado/ },
  { codigo: "014", nombre: "ScotiaBank",               maestro: "Scotiabank",          patron: /scotia/ },
  { codigo: "016", nombre: "Banco de Credito e Inversiones", maestro: "BCI",           patron: /\bbci\b|credito e inversiones|mach/ },
  { codigo: "028", nombre: "Banco Bice",               maestro: "Banco BICE",          patron: /bice/ },
  { codigo: "031", nombre: "HSBC",                     maestro: "",                    patron: /hsbc/ },
  { codigo: "037", nombre: "Banco Santander",          maestro: "Banco Santander",     patron: /santander/ },
  { codigo: "039", nombre: "Banco Itau",               maestro: "Itaú",                patron: /itau|corpbanca/ },
  { codigo: "041", nombre: "JP Morgan Chase Bank N.A.", maestro: "",                   patron: /morgan/ },
  { codigo: "049", nombre: "Banco Security",           maestro: "Banco Security",      patron: /security/ },
  { codigo: "051", nombre: "Banco Falabella",          maestro: "Banco Falabella",     patron: /falabella/ },
  { codigo: "053", nombre: "Banco Ripley",             maestro: "Banco Ripley",        patron: /ripley/ },
  { codigo: "055", nombre: "Banco Consorcio",          maestro: "Banco Consorcio",     patron: /consorcio/ },
  { codigo: "059", nombre: "Banco BTG Pactual",        maestro: "",                    patron: /btg/ },
  { codigo: "062", nombre: "Tanner",                   maestro: "",                    patron: /tanner/ },
  { codigo: "672", nombre: "Coopeuch",                 maestro: "Coopeuch",            patron: /coopeuch/ },
  { codigo: "697", nombre: "Inversiones La Polar",     maestro: "",                    patron: /polar/ },
  { codigo: "729", nombre: "Prepago los heroes",       maestro: "",                    patron: /heroes/ },
  { codigo: "730", nombre: "Tenpo Prepago",            maestro: "Tenpo",               patron: /tenpo/ },
  { codigo: "732", nombre: "Caja Los Andes",           maestro: "",                    patron: /los andes/ },
  { codigo: "738", nombre: "Global66",                 maestro: "",                    patron: /global ?66/ },
  { codigo: "741", nombre: "CopecPay",                 maestro: "",                    patron: /copec ?pay/ },
  { codigo: "743", nombre: "Prex",                     maestro: "",                    patron: /prex/ },
  { codigo: "746", nombre: "Fintual",                  maestro: "",                    patron: /fintual/ },
  { codigo: "747", nombre: "Metromuv",                 maestro: "",                    patron: /metromuv/ },
  { codigo: "875", nombre: "Mercado Pago",             maestro: "Mercado Pago",        patron: /mercado ?pago/ },
];

const sinTildes = (s) => String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const plano = (s) => sinTildes(s).toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

/** Banco desde un nombre libre ("BCI MACHBANK", "Banco Santander") o un código ("37", "037"). */
export function bancoDe(texto) {
  const t = String(texto ?? "").trim();
  if (/^\d{1,3}$/.test(t)) return BANCOS_NOMINA.find(b => b.codigo === t.padStart(3, "0")) || null;
  const p = plano(t);
  if (!p) return null;
  return BANCOS_NOMINA.find(b => b.patron.test(p)) || null;
}

// ─── Tipos de cuenta ──────────────────────────────────────────────────────────
/** Código del banco (CTD/AHB/JUV) desde el tipo del maestro o un texto libre. */
export function tipoCuentaDe(texto) {
  const p = plano(texto);
  if (["ctd", "ahb", "juv"].includes(p)) return p.toUpperCase();
  if (/ahorro/.test(p)) return "AHB";
  if (/vista|rut|chequera|prepago|juv/.test(p)) return "JUV";
  if (/corriente|cte/.test(p)) return "CTD";
  return "";
}
/** Del código del banco al nombre que usa el maestro. */
export const tipoMaestroDe = (codigo) => ({ CTD: "Cuenta corriente", AHB: "Cuenta de ahorro", JUV: "Cuenta vista" }[codigo] || "");

// ─── Limpieza de campos ───────────────────────────────────────────────────────
/** Texto para la plantilla: sin tildes ni caracteres especiales, recortado. */
export function limpiar(texto, maximo) {
  const t = sinTildes(texto).replace(/[ñÑ]/g, m => (m === "ñ" ? "n" : "N"))
    .replace(/[^A-Za-z0-9 .,\-]/g, " ").replace(/\s+/g, " ").trim();
  return maximo ? t.slice(0, maximo).trim() : t;
}
/** RUT como lo pide la plantilla: sin puntos, con guion, K mayúscula. */
export function rutNomina(rut) {
  const s = String(rut ?? "").replace(/[^0-9kK]/g, "").toUpperCase();
  return s.length >= 2 ? `${s.slice(0, -1)}-${s.slice(-1)}` : "";
}
const soloDigitos = (s) => String(s ?? "").replace(/\D/g, "");
const emailOk = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s ?? "").trim());

/** Parte un monto en líneas de a lo más `maximo`. */
export function dividirMonto(monto, maximo = MAXIMO_POR_LINEA) {
  const m = Math.round(monto);
  if (!(m > 0)) return [];
  if (!maximo || m <= maximo) return [m];
  const partes = Array(Math.floor(m / maximo)).fill(maximo);
  if (m % maximo) partes.push(m % maximo);
  return partes;
}

// ─── Armar la nómina ──────────────────────────────────────────────────────────
/**
 * Datos de pago desde una ficha del maestro. Devuelve el beneficiario listo
 * para la plantilla y la lista de lo que falta para poder pagarle.
 */
export function beneficiarioDesdeFicha(ficha) {
  const t = ficha?.transferencia || {};
  const banco = bancoDe(t.banco);
  const b = {
    rut: rutNomina(t.rutTitular || ficha?.rut),
    nombre: limpiar(t.titular || ficha?.razonSocial, 50),
    cuenta: soloDigitos(t.numeroCuenta),
    codBanco: banco?.codigo || "",
    banco: banco?.nombre || t.banco || "",
    tipoCuenta: tipoCuentaDe(t.tipoCuenta),
    mail: emailOk(t.emailComprobante) ? t.emailComprobante.trim() : (emailOk(ficha?.contacto?.email) ? ficha.contacto.email.trim() : ""),
  };
  const faltan = [];
  if (!ficha) faltan.push("ficha del proveedor");
  else if (ficha.medioPago && ficha.medioPago !== "transferencia") {
    // Se paga por otro medio: no va a la nómina, y no falta nada más que decir.
    faltan.push(ficha.medioPago === "web" ? "se paga por portal web" : "se paga con cargo automático");
  } else {
    if (!b.rut || !rutValido(b.rut)) faltan.push("RUT válido");
    if (!b.cuenta) faltan.push("número de cuenta");
    if (!b.codBanco) faltan.push("banco");
    if (!b.tipoCuenta) faltan.push("tipo de cuenta");
  }
  return { beneficiario: b, faltan, listo: faltan.length === 0 };
}

/**
 * pagos: [{ beneficiario, monto, descripcion, glosa1, glosa2, identificador }]
 * Devuelve las líneas de la plantilla (montos ya partidos), el total y los
 * errores por pago. Un pago con errores no genera líneas.
 */
export function armarNomina(pagos, { maximoPorLinea = MAXIMO_POR_LINEA } = {}) {
  const lineas = [], errores = [];
  pagos.forEach((p, i) => {
    const b = p.beneficiario || {};
    const e = [];
    if (!b.rut || !rutValido(b.rut)) e.push("RUT inválido");
    if (!b.nombre) e.push("falta el nombre");
    if (!b.cuenta || b.cuenta.length > 18) e.push("número de cuenta inválido");
    if (!/^\d{3}$/.test(b.codBanco || "")) e.push("banco sin código");
    if (!["CTD", "AHB", "JUV"].includes(b.tipoCuenta)) e.push("tipo de cuenta");
    if (!(Math.round(p.monto) > 0)) e.push("monto");
    const tope = b.codBanco === "001" ? 99_999_999_999 : 9_999_999_999;   // NUM(11) Banco de Chile, NUM(10) otros
    if (Math.round(p.monto) > tope) e.push("monto sobre el máximo del banco");
    if (e.length) { errores.push({ indice: i, pago: p, errores: e }); return; }
    for (const parte of dividirMonto(p.monto, maximoPorLinea)) {
      lineas.push([
        rutNomina(b.rut), limpiar(b.nombre, 50), b.cuenta, b.codBanco, parte, b.tipoCuenta,
        limpiar(p.identificador || "", 20), limpiar(p.descripcion || "", 30), (b.mail || "").slice(0, 100),
        limpiar(p.glosa1 || "", 30), limpiar(p.glosa2 || "", 30),
      ]);
    }
  });
  return { lineas, errores, total: lineas.reduce((s, l) => s + l[4], 0) };
}

/** El Excel de la nómina, listo para subir al banco (ArrayBuffer). */
export function archivoNomina(lineas) {
  const ws = XLSX.utils.aoa_to_sheet([ENCABEZADOS, ...lineas]);
  // Código de banco y cuenta como texto, para que Excel no borre los ceros a la izquierda.
  for (let r = 1; r <= lineas.length; r++) {
    for (const c of [2, 3]) {
      const ref = XLSX.utils.encode_cell({ r, c });
      if (ws[ref]) { ws[ref].t = "s"; ws[ref].v = String(ws[ref].v); ws[ref].z = "@"; }
    }
  }
  ws["!cols"] = [12, 40, 16, 9, 12, 9, 12, 30, 30, 20, 20].map(w => ({ wch: w }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Nomina");
  return XLSX.write(wb, { bookType: "xlsx", type: "array" });
}

/** Nombre de archivo permitido por el banco: letras, números y espacios. */
export function nombreArchivoNomina(empresa, fecha = new Date()) {
  const f = `${fecha.getFullYear()} ${String(fecha.getMonth() + 1).padStart(2, "0")} ${String(fecha.getDate()).padStart(2, "0")}`;
  const e = limpiar(empresa || "", 30).replace(/[^A-Za-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
  return `Nomina ${e ? e + " " : ""}${f}.xlsx`;
}

// ─── Leer nóminas ya subidas (para completar el maestro) ─────────────────────
/**
 * Lee un Excel con el formato de la plantilla (por ejemplo, una nómina ya
 * subida) y devuelve un beneficiario por RUT y cuenta.
 */
export function leerNominaAnterior(arrayBuffer) {
  const libro = XLSX.read(arrayBuffer, { type: "array" });
  const nombreHoja = libro.SheetNames.find(n => plano(n) === "nomina") || libro.SheetNames[0];
  const filas = XLSX.utils.sheet_to_json(libro.Sheets[nombreHoja], { header: 1, raw: false, defval: "" });
  const iEnc = filas.findIndex(f => f.some(c => /rut beneficiario/i.test(String(c))));
  if (iEnc < 0) throw new Error("No parece una nómina del Banco de Chile: falta la columna «Rut Beneficiario».");
  const enc = filas[iEnc].map(c => plano(c));
  const col = (re) => enc.findIndex(c => re.test(c));
  const c = { rut: col(/^rut/), nombre: col(/^nombre/), cuenta: col(/^cuenta/), banco: col(/cod banco/), tipo: col(/tipo de cuenta/), mail: col(/mail/) };
  const vistos = new Map();
  for (const f of filas.slice(iEnc + 1)) {
    const rut = rutNomina(f[c.rut]);
    if (!rut || !rutValido(rut)) continue;
    const banco = bancoDe(f[c.banco]);
    const b = {
      rut, nombre: String(f[c.nombre] || "").trim(), cuenta: soloDigitos(f[c.cuenta]),
      codBanco: banco?.codigo || "", banco: banco?.maestro || banco?.nombre || "",
      tipoCuenta: tipoCuentaDe(f[c.tipo]), mail: emailOk(f[c.mail]) ? String(f[c.mail]).trim() : "",
    };
    vistos.set(`${rut}|${b.cuenta}`, b);
  }
  return [...vistos.values()];
}

/** Beneficiarios desde un certificado de pago leído con certificados.js. */
export function beneficiariosDeCertificado(certificado) {
  const vistos = new Map();
  for (const p of certificado.pagos || []) {
    const rut = rutNomina(p.rut);
    if (!rut || !rutValido(rut)) continue;
    const banco = bancoDe(p.banco);
    vistos.set(`${rut}|${soloDigitos(p.cuenta)}`, {
      rut, nombre: p.nombre, cuenta: soloDigitos(p.cuenta),
      codBanco: banco?.codigo || "", banco: banco?.maestro || banco?.nombre || "",
      tipoCuenta: tipoCuentaDe(p.medio), mail: "",
    });
  }
  return [...vistos.values()];
}
