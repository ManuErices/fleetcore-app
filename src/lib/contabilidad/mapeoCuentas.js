/**
 * mapeoCuentas.js — src/lib/contabilidad/mapeoCuentas.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Une el plan de cuentas de COSTO de Oficina Técnica (códigos "1.1" … "5.25" de
 * src/lib/planCuentas.js, con que se clasifican OC, subcontratos y
 * rendiciones) con el plan de cuentas CONTABLE (chart_of_accounts del Libro
 * Diario). Lógica pura, sin Firebase.
 *
 * El mapeo se guarda en empresas/{id}/config/mapeoCuentas como
 *   { mapeo: { "1.1": cuentaId, "3.2": cuentaId, ... } }
 * y lo usa el importador de compras (iConstruye / RCV) para llevar al gasto
 * correcto lo que Oficina Técnica ya clasificó.
 */

const STOP = new Set(["de", "del", "la", "las", "el", "los", "y", "e", "en", "a", "por", "para", "con", "sin", "otros", "otro", "mpf", "x"]);

/** "ÁRIDOS, Botadero" → ["arido", "botadero"] (sin tildes, raíz simple). */
export function tokens(texto) {
  return String(texto || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(t => t.length > 2 && !STOP.has(t) && !/^\d+$/.test(t))
    // raíz simple: plurales y género ("materiales"→"material", "equipos"→"equipo")
    .map(t => t.replace(/(es|s)$/, "").slice(0, 7));
}

/** Código OT normalizado: " 3.2 MATERIALES" → "3.2"; "03.02" → "3.2". */
export function normalizarCodigoOT(codigo) {
  const m = String(codigo ?? "").trim().match(/^(\d+)(?:[.,](\d+))?/);
  if (!m) return "";
  const a = String(parseInt(m[1], 10));
  return m[2] !== undefined ? `${a}.${parseInt(m[2], 10)}` : a;
}

// Pistas por categoría (primer dígito del código OT): qué nombre de cuenta
// contable suele recibir esos costos cuando el nombre exacto no coincide.
const PISTAS_CATEGORIA = {
  1: /mano de obra|remuneraci|sueldo|personal/i,
  2: /maquinari|equipo|arriendo.*maq|flete|mantenci/i,
  3: /material|suministro/i,
  4: /combustible|lubricante|petroleo|petróleo|diesel|diésel/i,
  5: /gastos? generales|gastos? de obra|varios/i,
};

// Excepciones de tipo dentro de la categoría 5 (gastos generales de obra)
const TIPO_PREFERIDO = {
  "5.22": ["gasto_fin"],          // gastos bancarios y financieros
  "5.23": ["gasto_adm"],          // oficina central
  "5.7":  ["gasto_adm", "costo"], // gastos administrativos
  "5.10": ["gasto_adm", "costo"], // insumos de oficina
};

/** Tipos de cuenta que pueden recibir un costo de Oficina Técnica. */
export const TIPOS_CUENTA_COSTO = ["costo", "gasto_adm", "gasto_fin", "otro_resultado"];

/** Cuentas activas del plan contable que pueden recibir un costo (gasto/costo). */
export function cuentasDeCosto(cuentas = []) {
  return (cuentas || []).filter(c => c && c.activa !== false && TIPOS_CUENTA_COSTO.includes(c.tipo));
}

/**
 * Sugiere la cuenta contable para un código de costo de Oficina Técnica, por
 * parecido de nombre. Devuelve la cuenta (objeto de `cuentas`) o null.
 *
 * Puntaje: 3 por cada palabra en común con el nombre de la cuenta (+1 si es
 * la primera palabra del nombre OT, el sustantivo), 2 si la
 * cuenta calza con la pista de la categoría (1 mano de obra, 2 maquinaria,
 * 3 materiales, 4 combustible, 5 gastos generales) y 1 si es del tipo
 * esperado (costo de ventas, salvo gastos financieros y oficina central).
 * Se exige al menos una palabra en común o la pista de categoría.
 */
export function sugerirCuenta(codigoOT, nombreOT, cuentas = []) {
  const codigo = normalizarCodigoOT(codigoOT);
  const categoria = codigo.split(".")[0];
  const pista = PISTAS_CATEGORIA[categoria];
  const tiposPref = TIPO_PREFERIDO[codigo] || ["costo"];
  const listaPalabras = tokens(nombreOT);
  const palabras = new Set(listaPalabras);
  const nucleo = listaPalabras[0]; // en castellano el sustantivo va primero: "FLETES de maquinaria"

  let mejor = null, mejorPuntaje = 0;
  for (const c of cuentasDeCosto(cuentas)) {
    const deCuenta = tokens(c.nombre);
    const enComun = deCuenta.filter(t => palabras.has(t)).length;
    const calzaPista = !!(pista && pista.test(c.nombre || ""));
    if (!enComun && !calzaPista) continue;
    // Una cuenta financiera solo recibe lo que es financiero (y viceversa)
    if ((c.tipo === "gasto_fin") !== tiposPref.includes("gasto_fin") && !enComun) continue;
    const puntaje = enComun * 3 + (nucleo && deCuenta.includes(nucleo) ? 1 : 0)
      + (calzaPista ? 2 : 0) + (tiposPref.includes(c.tipo) ? 1 : 0);
    if (puntaje > mejorPuntaje) { mejor = c; mejorPuntaje = puntaje; }
  }
  return mejor;
}

/**
 * Sugerencias para todo el plan OT. Respeta lo ya guardado: solo completa los
 * códigos sin cuenta (o cuya cuenta ya no existe).
 * `planOT`: [{ codigo, subcategoria }] (PLAN_CUENTAS de src/lib/planCuentas.js).
 */
export function sugerirMapeoOT(planOT = [], cuentas = [], guardado = {}) {
  const ids = new Set(cuentasDeCosto(cuentas).map(c => c.id));
  const out = {};
  for (const p of planOT) {
    const actual = guardado?.[p.codigo];
    if (actual && ids.has(actual)) { out[p.codigo] = actual; continue; }
    const s = sugerirCuenta(p.codigo, p.subcategoria, cuentas);
    if (s) out[p.codigo] = s.id;
  }
  return out;
}

/**
 * Cuenta contable (id) de un código OT según el mapeo guardado, o null.
 * Acepta el código con nombre ("3.2 MATERIALES OBRAS CIVILES") o con ceros.
 */
export function cuentaDeCodigoOT(mapeo, codigo) {
  if (!mapeo) return null;
  const k = normalizarCodigoOT(codigo);
  if (!k) return null;
  return mapeo[k] || null;
}

/**
 * Código OT dominante de un conjunto de registros [{ codigo, monto }]: el que
 * concentra al menos `umbral` del monto. Si los costos se reparten entre
 * varias cuentas, no hay uno solo y devuelve null (no se adivina).
 */
export function codigoDominante(registros = [], umbral = 0.8) {
  const porCodigo = {};
  let total = 0;
  for (const r of registros) {
    const k = normalizarCodigoOT(r.codigo);
    const m = Math.abs(Number(r.monto) || 0);
    if (!m) continue;
    // Lo que no trae un código "x.y" válido igual cuenta en el total: si la
    // mitad del gasto no está clasificada, no hay código dominante.
    total += m;
    if (k.includes(".")) porCodigo[k] = (porCodigo[k] || 0) + m;
  }
  if (!total || !Object.keys(porCodigo).length) return null;
  const [codigo, monto] = Object.entries(porCodigo).sort((a, b) => b[1] - a[1])[0];
  const participacion = monto / total;
  return participacion >= umbral ? { codigo, participacion } : null;
}

const rutClave = (rut) => String(rut || "").replace(/[-.\s]/g, "").toUpperCase();

/**
 * Código OT por proveedor (RUT) a partir de lo que Oficina Técnica ya
 * clasificó: líneas de OC (`codigoCC`, ponderadas por lo facturado o, si no
 * hay, el subtotal) y estados de pago de subcontratos (`codigoCuentaCosto`,
 * por `montoEP`). Solo queda el proveedor cuyo costo cae casi todo
 * (≥ umbral) en un mismo código.
 * Devuelve { [rutNormalizado]: { codigo, participacion, fuente } }.
 */
export function codigosOTPorRut({ ordenes = [], subcontratos = [] } = {}, umbral = 0.8) {
  const regs = {};
  const add = (rut, codigo, monto, fuente) => {
    const k = rutClave(rut);
    if (!k) return;
    (regs[k] ||= { lista: [], fuentes: new Set() }).lista.push({ codigo, monto });
    regs[k].fuentes.add(fuente);
  };
  for (const oc of ordenes) {
    for (const it of oc.items || []) {
      const codigo = it.codigoCC || it.cuentasCosto;
      add(oc.rutProveedor, codigo, Number(it.facturado) || Number(it.subTotal) || 0, "OC");
    }
  }
  for (const s of subcontratos) {
    add(s.rutSubcontratista, s.codigoCuentaCosto, Number(s.montoEP) || Number(s.precioTotal) || 0, "subcontrato");
  }
  const out = {};
  for (const [rut, { lista, fuentes }] of Object.entries(regs)) {
    const d = codigoDominante(lista, umbral);
    if (d) out[rut] = { ...d, fuente: [...fuentes].join(" y ") };
  }
  return out;
}

/**
 * Lleva la línea de gasto principal de un asiento de compra (o de NC) a
 * `cuenta`. También mueve las demás líneas que estaban en esa misma cuenta
 * (exento, impuestos no recuperables), así el documento no queda partido.
 * Devuelve el asiento sin cambios si no hay línea de gasto.
 */
export function aplicarCuentaAsiento(asiento, cuenta, descripcion) {
  if (!asiento || !cuenta) return asiento;
  const lado = asiento._esNC ? "haber" : "debe";
  const esGasto = (l) => parseFloat(l[lado]) > 0 && !/(iva|impuesto|pagar)/i.test(l.cuentaNombre || "");
  const candidatas = (asiento.lineas || []).filter(esGasto);
  if (!candidatas.length) return asiento;
  const principal = candidatas.reduce((a, b) => (parseFloat(b[lado]) > parseFloat(a[lado]) ? b : a));
  const idOriginal = principal.cuentaId;
  const lineas = asiento.lineas.map(l =>
    l === principal || (idOriginal && l.cuentaId === idOriginal && esGasto(l))
      ? { ...l, cuentaId: cuenta.id, cuentaNombre: cuenta.nombre, ...(l === principal && descripcion ? { descripcion } : {}) }
      : l);
  return { ...asiento, lineas };
}

/**
 * Código OT de un grupo de documentos de compra de un proveedor, en orden de
 * certeza:
 *   1. el código de costo que trae cada documento (columna del archivo,
 *      `_codigoOT`), o el de la OC que cita (`_numeroOC` → líneas de la OC);
 *   2. el código dominante del proveedor en OC y subcontratos de Oficina
 *      Técnica (`porRut`, de codigosOTPorRut).
 * Devuelve { codigo, fuente } o null.
 */
export function resolverCodigoOT({ facturas = [], rut } = {}, { ordenesPorNumero = {}, porRut = {} } = {}, umbral = 0.8) {
  const regs = [];
  let fuente = "";
  for (const f of facturas) {
    const monto = (Math.abs(Number(f._neto) || 0) + Math.abs(Number(f._exento) || 0)) || Math.abs(Number(f._total) || 0);
    if (normalizarCodigoOT(f._codigoOT).includes(".")) {
      regs.push({ codigo: f._codigoOT, monto }); fuente ||= "documento";
      continue;
    }
    const oc = f._numeroOC ? ordenesPorNumero[String(f._numeroOC).trim()] : null;
    const d = oc && codigoDominante((oc.items || []).map(it => ({
      codigo: it.codigoCC || it.cuentasCosto, monto: Number(it.facturado) || Number(it.subTotal) || 0,
    })), umbral);
    if (d) { regs.push({ codigo: d.codigo, monto }); fuente ||= `OC ${oc.numeroOC || f._numeroOC}`; }
  }
  const delDoc = codigoDominante(regs, umbral);
  if (delDoc) return { codigo: delDoc.codigo, fuente };
  const p = porRut[rutClave(rut)];
  return p ? { codigo: p.codigo, fuente: `${p.fuente} del proveedor` } : null;
}
