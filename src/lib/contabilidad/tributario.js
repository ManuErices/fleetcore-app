/**
 * Reglas tributarias del Flujo Mensual (lógica pura, sin Firestore ni React).
 *
 * Todo lo que depende de la ley vive aquí para poder corregirlo en un solo
 * lugar cuando cambie. Las tasas y criterios están anotados con su fuente;
 * conviene revisarlos con la contadora al cierre de cada año.
 *
 *  · Tasa de Primera Categoría por régimen y año comercial.
 *  · Tasa de PPM del régimen Pro Pyme General (14 D N°3).
 *  · Impuesto calculado sobre la base ACUMULADA del año (un mes con pérdida
 *    compensa a otro con utilidad, como en el F22).
 *  · Resumen de los CSV del Registro de Compras y Ventas (RCV) del SII:
 *    qué columnas son costo, cuáles son crédito recuperable y qué queda sin
 *    explicar.
 */

// ─── Régimen y tasa de Primera Categoría ──────────────────────────────────────
// 14 D N°3: 10% en 2020-2022 (Ley 21.256), 25% en 2023-2024, 12,5% en
// 2025-2027, 15% en 2028 y 25% desde 2029 (Ley 21.755). La rebaja 2025-2028
// está condicionada a cumplir con la cotización del empleador de la reforma
// previsional al cierre de cada ejercicio.
export const REGIMENES_TRIBUTARIOS = [
  { id: "14A",  label: "Régimen General (14 A, semi integrado)" },
  { id: "14D3", label: "Pro Pyme General (14 D N°3)" },
  { id: "14D8", label: "Pro Pyme Transparente (14 D N°8)" },
];

export function tasaPrimeraCategoria(regimen, anio) {
  const a = Number(anio) || new Date().getFullYear();
  if (regimen === "14D8") return 0; // tributan los dueños, no la empresa
  if (regimen === "14D3") {
    if (a >= 2020 && a <= 2022) return 0.10;
    if (a >= 2025 && a <= 2027) return 0.125;
    if (a === 2028) return 0.15;
    return 0.25;
  }
  return 0.27;
}

// PPM 14 D N°3: 0,25% si los ingresos del año anterior no superaron 50.000 UF
// y 0,5% si los superaron. Rebajados a la mitad en 2025-2027 (Ley 21.755).
// 14 A: la tasa sale del F22 del año anterior (no se puede deducir aquí).
export function tasaPPMPropyme(anio, sobre50milUF) {
  const a = Number(anio) || new Date().getFullYear();
  const base = sobre50milUF ? 0.005 : 0.0025;
  return a >= 2025 && a <= 2027 ? base / 2 : base;
}

export function tasaPPMSugerida(config, anio) {
  if (config?.regimen === "14A") return (Number(config?.tasaPPM14A) || 0) / 100;
  return tasaPPMPropyme(anio, !!config?.ingresosSobre50milUF);
}

// regimen vacío = sin definir: se usa 27% (14 A) y la planilla pide elegirlo.
// ─── Proveedores que no son "Compras" ─────────────────────────────────────────
// Las cuotas de leasing y las comisiones de bancos y factoring llegan con
// factura, así que vienen en el RCV de compras. Al importar se mueven a su
// propia fila (reclasificación: la Base Imponible no cambia). Llave = RUT sin
// puntos ni guion. Se editan desde el resumen de importación.
export const FILAS_DESTINO_RCV = {
  compras: "Compras",
  leasing: "Leasing",
  gastos_financieros: "Gastos financieros",
  arriendos: "Arriendos",
};
export const REGLAS_FILA_RCV_DEFECTO = {
  "778266059": { fila: "leasing", nombre: "XCMG Finance Chile S.A." },
  "901460000": { fila: "leasing", nombre: "Servicios Financieros Progreso S.A." },
  "761776215": { fila: "gastos_financieros", nombre: "Cumplo Chile SpA" },
  "763815706": { fila: "gastos_financieros", nombre: "Interfactor S.A." },
  "970040005": { fila: "gastos_financieros", nombre: "Banco de Chile" },
  "97080000K": { fila: "gastos_financieros", nombre: "Banco BICE" },
  "97036000K": { fila: "gastos_financieros", nombre: "Banco Santander-Chile" },
  "970180001": { fila: "gastos_financieros", nombre: "Scotiabank Chile" },
  "970300007": { fila: "gastos_financieros", nombre: "BancoEstado" },
  "970060006": { fila: "gastos_financieros", nombre: "Banco BCI" },
  "970230009": { fila: "gastos_financieros", nombre: "Banco Itaú" },
  "970530002": { fila: "gastos_financieros", nombre: "Banco Security" },
};
// Nombres que suenan a financiamiento: se sugieren si no tienen regla.
const PATRON_FINANCIERO = /leasing|factor|banco|bank|financ|cumplo|tanner|credito/i;

export const normalizarRut = (rut) => String(rut || "").replace(/[^0-9kK]/g, "").toUpperCase();

export const CONFIG_TRIBUTARIA_DEFECTO = {
  regimen: "",
  ingresosSobre50milUF: false,
  tasaPPM14A: 0,          // % — solo se usa en 14 A
  dieselRecuperablePct: 0, // % del imp. específico diésel que se recupera (Ley 18.502)
  reglasFilaRCV: REGLAS_FILA_RCV_DEFECTO,
};

/**
 * El impuesto es anual: se calcula sobre la base acumulada y cada mes muestra
 * cuánto cambia el impuesto del año con ese mes. Así un mes negativo descuenta
 * impuesto ya "devengado" en meses anteriores y la suma de los 12 meses es
 * exactamente el impuesto anual. Nunca baja de cero en el acumulado.
 */
export function impuestoMensualAcumulado(baseMensual, tasa) {
  let acum = 0, impAnterior = 0;
  return baseMensual.map(v => {
    acum += Number(v) || 0;
    // Se redondea el acumulado (no cada mes) para que la suma cuadre al peso
    const imp = Math.round(Math.max(0, acum) * tasa);
    const delta = imp - impAnterior;
    impAnterior = imp;
    return delta;
  });
}

// ─── Cómo se calcula cada fila (se muestra en la planilla) ────────────────────
export const AYUDA_FILAS = {
  ingresos: "Ventas netas: neto + exento − NC emitidas, sin IVA. En 14 A cuenta en el mes de la factura (devengado). En 14 D N°3 cuando se percibe (factura cedida en factoring = percibida al cederse).",
  compras: "RCV compras: neto + exento − NC recibidas + IVA no recuperable + otros impuestos no recuperables. El IVA crédito no es gasto. En 14 A va en el mes de la factura y el activo fijo NO entra (se deprecia); en 14 D N°3 entra completo al pagarse.",
  remuneraciones: "Bruto pagado (imponible + colación y movilización) + aportes del empleador: seguro de cesantía (2,4% indefinido / 3,0% plazo fijo u obra), mutual y aporte de la reforma previsional. Las cotizaciones del trabajador y el impuesto único ya van dentro del bruto.",
  arriendos: "Sin factura: monto pagado. Con factura afecta: solo el neto. Con factura exenta: el total. Si viene con factura ya está en Compras: no cargarla aquí.",
  honorarios: "Monto BRUTO de la boleta (la retención va al SII por F29, es parte del bruto, no un costo adicional).",
  finiquitos: "Días trabajados, feriado proporcional e indemnizaciones legales (años de servicio, mes de aviso). No repetir lo que ya está en Remuneraciones.",
  rendiciones: "Solo gastos rendidos con respaldo. Un fondo por rendir no es gasto hasta que se rinde. Las rendiciones con factura a nombre de la empresa ya están en Compras.",
  gastos_financieros: "Intereses, comisiones bancarias y comisiones/intereses de factoring pagados.",
  leasing: "Cuotas de leasing pagadas en el mes.",
  patentes: "Patente municipal, contribuciones y permisos de circulación pagados.",
  depreciacion: "Solo 14 A: depreciación tributaria del activo fijo (normal o acelerada, tabla de vida útil del SII). La compra del activo no es gasto, lo es su depreciación. En 14 D N°3 se deja en cero (el activo ya se rebajó en Compras).",
  correccion_monetaria: "Solo 14 A: corrección monetaria del capital propio tributario y de los activos (art. 41 LIR). Si el IPC sube, normalmente es un cargo (resta). La calcula la contadora al cierre; se puede cargar mensual o en diciembre.",
};

// ─── RCV: lectura de columnas ─────────────────────────────────────────────────
// El SII cambia mayúsculas entre versiones ("Monto Iva No Recuperable" vs
// "Monto IVA No Recuperable"), así que las columnas se buscan sin distinguir.
function normCol(s) {
  return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
}
function lector(fila) {
  const mapa = {};
  Object.keys(fila || {}).forEach(k => { mapa[normCol(k)] = fila[k]; });
  return (...nombres) => {
    for (const n of nombres) {
      const v = mapa[normCol(n)];
      if (v !== undefined && v !== "") return v;
    }
    return "";
  };
}
const numero = v => {
  const x = parseFloat(String(v ?? "0").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(x) ? x : 0;
};
function mesDe(fechaStr) {
  if (fechaStr instanceof Date && !isNaN(fechaStr)) return { anio: fechaStr.getFullYear(), mes: fechaStr.getMonth() };
  // Número de serie de Excel (archivo .xlsx con fechas reales)
  if (typeof fechaStr === "number" && fechaStr > 30000 && fechaStr < 80000) {
    const d = new Date(Math.round((fechaStr - 25569) * 86400000));
    return { anio: d.getUTCFullYear(), mes: d.getUTCMonth() };
  }
  const m = String(fechaStr || "").match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return { anio: +m[3], mes: +m[2] - 1 };
  const iso = String(fechaStr || "").match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return { anio: +iso[1], mes: +iso[2] - 1 };
  return null;
}

export function detectarTipoRCV(filas) {
  if (!filas?.length) return null;
  const cols = Object.keys(filas[0]).map(normCol);
  if (cols.includes("rutproveedor")) return "compras";
  if (cols.includes("rutcliente")) return "ventas";
  return null;
}

// Tipos de documento: suman o restan. Los demás se ignoran y se informan.
// 39/41 boletas, 110/111 factura y ND de exportación, 112 NC de exportación
// (solo aparecen en ventas).
const DOCS_SUMA  = new Set([30, 32, 33, 34, 39, 41, 43, 45, 46, 55, 56, 110, 111, 914]);
const DOCS_RESTA = new Set([60, 61, 112]);
export const NOMBRE_DOC = {
  30: "Factura (papel)", 32: "Factura exenta (papel)", 33: "Factura", 34: "Factura exenta",
  43: "Liquidación factura", 45: "Factura de compra (papel)", 46: "Factura de compra",
  55: "Nota de débito (papel)", 56: "Nota de débito", 60: "Nota de crédito (papel)",
  61: "Nota de crédito", 914: "Declaración de ingreso (importación)",
  39: "Boleta", 41: "Boleta exenta", 110: "Factura de exportación",
  111: "Nota de débito de exportación", 112: "Nota de crédito de exportación",
};

// ─── Otros impuestos del RCV ("Codigo Otro Impuesto") ─────────────────────────
// Solo se marcan como recuperables los códigos de los que hay certeza. Todo lo
// demás se trata como COSTO (criterio conservador) y queda listado por código
// para revisarlo con la contadora.
export const OTROS_IMPUESTOS = {
  28: { nombre: "Impuesto específico diésel", tipo: "diesel" },
  35: { nombre: "Impuesto específico gasolina", tipo: "costo" },
  24: { nombre: "Licores, piscos, destilados", tipo: "costo" },
  25: { nombre: "Vinos", tipo: "costo" },
  26: { nombre: "Cervezas y bebidas alcohólicas", tipo: "costo" },
  27: { nombre: "Bebidas analcohólicas", tipo: "costo" },
  271: { nombre: "Bebidas azucaradas", tipo: "costo" },
  15: { nombre: "IVA retenido total (cambio de sujeto)", tipo: "credito" },
};

export function nombreOtroImpuesto(codigo) {
  if (!codigo) return "Sin código";
  return OTROS_IMPUESTOS[codigo]?.nombre || `Código ${codigo}`;
}

/**
 * Resume un CSV de RCV de COMPRAS en un solo número para la fila Compras, con
 * el desglose que lo explica.
 *
 * Compras = neto + exento − (neto + exento de NC)
 *         + IVA no recuperable + impuesto sin derecho a crédito
 *         + otros impuestos no recuperables
 *
 * El IVA recuperable, el IVA de uso común (factor de proporcionalidad 1) y el
 * diésel recuperable (según % configurado) no son gasto.
 */
export function resumirRCVCompras(filas, { dieselRecuperablePct = 0, regimen = "" } = {}) {
  const r = {
    tipo: "compras", documentos: 0, ignorados: {},
    neto: 0, exento: 0, ncNeto: 0, ncExento: 0,
    ivaRecuperable: 0, ivaUsoComun: 0, ivaNoRecuperable: 0, impSinDerecho: 0,
    otros: {},              // { codigo: { nombre, tipo, monto, docs } }
    otrosCosto: 0, otrosRecuperable: 0,
    activoFijoNeto: 0,
    total: 0, sinExplicar: 0,
    porTipo: {},            // { tipoDoc: { docs, neto, exento, total } }
    meses: {},              // { "2026-00": docs } para sugerir el mes
  };
  const pctDiesel = Math.min(100, Math.max(0, Number(dieselRecuperablePct) || 0)) / 100;

  for (const fila of filas || []) {
    const get = lector(fila);
    const tipoDoc = parseInt(String(get("Tipo Doc")).trim(), 10) || 0;
    const suma = DOCS_SUMA.has(tipoDoc), resta = DOCS_RESTA.has(tipoDoc);
    if (!suma && !resta) {
      if (tipoDoc) r.ignorados[tipoDoc] = (r.ignorados[tipoDoc] || 0) + 1;
      continue;
    }
    const s = resta ? -1 : 1;
    // Las NC pueden venir positivas o negativas según la exportación: el signo
    // lo pone el tipo de documento.
    const v = col => Math.abs(numero(get(...[].concat(col))));

    const neto = v("Monto Neto"), exento = v("Monto Exento"), total = v("Monto Total");
    const ivaRec = v("Monto IVA Recuperable");
    const ivaNoRec = v(["Monto Iva No Recuperable", "Monto IVA No Recuperable"]);
    const ivaUsoComun = v("IVA uso Comun");
    // El SII informa la parte sin derecho a crédito de un "otro impuesto" en
    // DOS columnas: "Impto. Sin Derecho a Credito" y "Valor Otro Impuesto"
    // (ej. gasolina, código 35: mismo monto en ambas, y el total lo incluye una
    // sola vez). Si la fila trae otro impuesto, ya se cuenta por su código.
    const sinDerechoCol = v("Impto. Sin Derecho a Credito");
    const otroValor = v("Valor Otro Impuesto");
    const otroCod = parseInt(String(get("Codigo Otro Impuesto")).split(".")[0], 10) || 0;
    const afNeto = v("Monto Neto Activo Fijo");
    const sinDerecho = otroValor ? 0 : sinDerechoCol;

    // Un documento con varios "otros impuestos" trae filas extra sin montos
    // (solo código y valor): suman el impuesto pero no son otro documento.
    if (neto || exento || total) r.documentos++;
    if (resta) { r.ncNeto += neto; r.ncExento += exento; }
    else { r.neto += neto; r.exento += exento; }
    r.ivaRecuperable  += s * ivaRec;
    r.ivaUsoComun     += s * ivaUsoComun;
    r.ivaNoRecuperable += s * ivaNoRec;
    r.impSinDerecho   += s * sinDerecho;
    r.activoFijoNeto  += s * afNeto;
    r.total           += s * total;

    if (otroValor) {
      const def = OTROS_IMPUESTOS[otroCod];
      const tipo = def?.tipo || "revisar";
      const o = r.otros[otroCod] ||= { codigo: otroCod, nombre: nombreOtroImpuesto(otroCod), tipo, monto: 0, docs: 0 };
      o.monto += s * otroValor; o.docs++;
    }

    const explicado = neto + exento + ivaRec + ivaNoRec + ivaUsoComun + sinDerecho + otroValor;
    r.sinExplicar += s * (total - explicado);

    const pt = r.porTipo[tipoDoc] ||= { docs: 0, neto: 0, exento: 0, total: 0 };
    pt.docs++; pt.neto += neto; pt.exento += exento; pt.total += total;

    const m = mesDe(get("Fecha Recepcion")) || mesDe(get("Fecha Docto"));
    if (m) { const k = `${m.anio}-${m.mes}`; r.meses[k] = (r.meses[k] || 0) + 1; }
  }

  Object.values(r.otros).forEach(o => {
    if (o.tipo === "credito") { r.otrosRecuperable += o.monto; return; }
    if (o.tipo === "diesel") {
      o.recuperable = o.monto * pctDiesel;
      r.otrosRecuperable += o.recuperable;
      r.otrosCosto += o.monto - o.recuperable;
      return;
    }
    r.otrosCosto += o.monto; // "costo" y "revisar"
  });

  r.netoNeto = r.neto + r.exento - r.ncNeto - r.ncExento;
  // 14 A: el activo fijo no es gasto del mes, se capitaliza y se deprecia
  // (art. 31 N°5 LIR). En 14 D N°3 se rebaja completo (depreciación
  // instantánea), así que queda dentro de Compras.
  r.activoFijoExcluido = regimen === "14A" ? r.activoFijoNeto : 0;
  r.monto = Math.round(r.netoNeto - r.activoFijoExcluido + r.ivaNoRecuperable + r.impSinDerecho + r.otrosCosto);
  r.sinExplicar = Math.round(r.sinExplicar);
  r.mesSugerido = mesMasFrecuente(r.meses);
  return r;
}

/**
 * Resume un CSV de RCV de VENTAS. Ingresos = neto + exento − NC emitidas.
 * Ojo: el RCV es por emisión (devengado); en 14 D N°3 la ley pide percibido.
 */
export function resumirRCVVentas(filas) {
  const r = {
    tipo: "ventas", documentos: 0, ignorados: {},
    neto: 0, exento: 0, ncNeto: 0, ncExento: 0, iva: 0, total: 0,
    otrosImpuestos: 0, creditoConstructora: 0, sinExplicar: 0,
    notasCredito: [],   // { folio, cliente, monto, refTipo, refFolio, anula }
    noDelGiro: {},      // { "Activo Fijo": { docs, monto } } ventas que no son del giro
    porTipo: {}, meses: {},
  };
  const facturas = {};  // folio → { neto, exento } para saber si una NC anula el documento
  const filasValidas = [];
  for (const fila of filas || []) {
    const get = lector(fila);
    const tipoDoc = parseInt(String(get("Tipo Doc")).trim(), 10) || 0;
    const suma = DOCS_SUMA.has(tipoDoc), resta = DOCS_RESTA.has(tipoDoc);
    if (!suma && !resta) {
      if (tipoDoc) r.ignorados[tipoDoc] = (r.ignorados[tipoDoc] || 0) + 1;
      continue;
    }
    filasValidas.push({ get, tipoDoc, resta });
    if (suma) facturas[String(get("Folio")).trim()] = { neto: Math.abs(numero(get("Monto Neto"))), exento: Math.abs(numero(get("Monto Exento"))) };
  }
  for (const { get, tipoDoc, resta } of filasValidas) {
    const s = resta ? -1 : 1;
    const v = (...cols) => Math.abs(numero(get(...cols)));
    const neto = v("Monto Neto"), exento = v("Monto Exento"), total = v("Monto total");
    const iva = v("Monto IVA"), otro = v("Valor Otro Imp.", "Valor Otro Impuesto");
    if (neto || exento || total) r.documentos++;
    if (resta) { r.ncNeto += neto; r.ncExento += exento; }
    else { r.neto += neto; r.exento += exento; }
    r.iva += s * iva;
    r.otrosImpuestos += s * otro;
    r.total += s * total;
    r.sinExplicar += s * (total - neto - exento - iva - otro);
    r.creditoConstructora += s * v("Credito empresa constructora");

    if (resta) {
      const refFolio = String(get("Folio Docto. Referencia")).trim();
      const ref = facturas[refFolio];
      r.notasCredito.push({
        folio: String(get("Folio")).trim(),
        cliente: String(get("Razon Social")).trim(),
        monto: neto + exento,
        refTipo: parseInt(String(get("Tipo Docto. Referencia")), 10) || 0,
        refFolio,
        // Anula el documento si lo rebaja completo (la NC vuelve a dejarlo en cero)
        anula: !!ref && Math.abs(ref.neto + ref.exento - neto - exento) < 1,
      });
    }

    // Venta de activo fijo o de bienes raíces: el ingreso es el precio, pero en
    // 14 A se rebaja su valor tributario no depreciado (ese costo no está aquí).
    const tipoVenta = String(get("Tipo Venta")).trim();
    if (tipoVenta && !/giro/i.test(tipoVenta)) {
      const g = r.noDelGiro[tipoVenta] ||= { docs: 0, monto: 0 };
      g.docs++; g.monto += s * (neto + exento);
    }

    const pt = r.porTipo[tipoDoc] ||= { docs: 0, neto: 0, exento: 0, total: 0 };
    pt.docs++; pt.neto += neto; pt.exento += exento; pt.total += total;
    const m = mesDe(get("Fecha Docto"));
    if (m) { const k = `${m.anio}-${m.mes}`; r.meses[k] = (r.meses[k] || 0) + 1; }
  }
  r.monto = Math.round(r.neto + r.exento - r.ncNeto - r.ncExento);
  r.sinExplicar = Math.round(r.sinExplicar);
  r.mesSugerido = mesMasFrecuente(r.meses);
  return r;
}

function mesMasFrecuente(meses) {
  let mejor = null, n = -1;
  Object.entries(meses).forEach(([k, c]) => { if (c > n) { n = c; mejor = k; } });
  if (!mejor) return null;
  const [anio, mes] = mejor.split("-").map(Number);
  return { anio, mes };
}

// ─── Reparto del RCV por mes del documento ────────────────────────────────────
// El RCV de un período trae documentos emitidos en meses anteriores (llegan
// después). En base devengada (14 A) el gasto va al mes del documento, así
// que cada fila se asigna según su "Fecha Docto". Las filas de continuación
// (un mismo documento con varios otros impuestos) no traen fecha y siguen al
// documento anterior.
export function repartirRCVPorMes(filas, tipo, opciones = {}) {
  const resumir = tipo === "compras"
    ? f => resumirRCVCompras(f, opciones)
    : f => resumirRCVVentas(f);
  const grupos = new Map();
  // Si una fila no trae fecha legible, va al mes del documento anterior o, si
  // es la primera, al período del archivo. Nunca se descarta: el reparto
  // tiene que sumar exactamente el total del archivo.
  const total = resumir(filas);
  let ultimo = null;
  for (const fila of filas || []) {
    const get = lector(fila);
    const m = mesDe(get("Fecha Docto")) || ultimo || total.mesSugerido;
    if (!m) continue;
    ultimo = m;
    const k = `${m.anio}-${m.mes}`;
    if (!grupos.has(k)) grupos.set(k, { anio: m.anio, mes: m.mes, filas: [] });
    grupos.get(k).filas.push(fila);
  }
  return [...grupos.values()]
    .sort((a, b) => a.anio - b.anio || a.mes - b.mes)
    .map(g => {
      const r = resumir(g.filas);
      return { anio: g.anio, mes: g.mes, documentos: r.documentos, monto: r.monto };
    })
    .filter(g => g.documentos > 0);
}

/**
 * Aplica lo que un período del RCV aporta a los meses de UN año del flujo,
 * reemplazando lo que ese mismo período había aportado antes (reimportar no
 * duplica). Lo que el usuario escribió a mano en la celda se conserva: solo
 * se resta el aporte anterior y se suma el nuevo.
 *
 *   doc.rcv.periodos[filaId][periodo] = { porMes: { [mes]: monto }, ...traza }
 *
 * Compatibilidad: la primera versión guardaba doc.rcv[filaId][mes] = traza y
 * cargaba el archivo completo en el mes del período; se toma como el aporte
 * anterior de ese período a ese mes.
 */
export function aplicarAporteRCV(doc, filaId, periodo, porMesNuevo, traza) {
  const [pAnio, pMes] = periodo.split("-").map(Number); // pMes 1-12
  const rcv = { ...(doc.rcv || {}) };
  const periodos = { ...(rcv.periodos || {}) };
  const deFila = { ...(periodos[filaId] || {}) };
  let anterior = deFila[periodo]?.porMes;
  const legado = { ...(rcv[filaId] || {}) };
  if (!anterior && pAnio === doc.anio && legado[pMes - 1]) {
    anterior = { [pMes - 1]: Number(legado[pMes - 1].monto) || 0 };
  }
  if (pAnio === doc.anio) delete legado[pMes - 1];
  anterior = anterior || {};

  const filas = doc.filas.map(f => {
    if (f.id !== filaId) return f;
    return {
      ...f,
      valores: f.valores.map((v, i) =>
        Math.round((Number(v) || 0) - (Number(anterior[i]) || 0) + (Number(porMesNuevo[i]) || 0))),
    };
  });
  if (Object.keys(porMesNuevo).length) deFila[periodo] = { ...traza, porMes: porMesNuevo };
  else delete deFila[periodo];
  periodos[filaId] = deFila;
  return { ...doc, filas, rcv: { ...rcv, [filaId]: legado, periodos } };
}

/** Aportes del RCV a un mes de una fila: [{ periodo, monto, archivo }]. */
export function aportesRCV(doc, filaId, mes) {
  const out = [];
  Object.entries(doc.rcv?.periodos?.[filaId] || {}).forEach(([periodo, p]) => {
    const monto = Number(p.porMes?.[mes]);
    if (monto) out.push({ periodo, monto, archivo: p.archivo, documentos: p.documentosPorMes?.[mes] });
  });
  const leg = doc.rcv?.[filaId]?.[mes];
  if (leg && typeof leg === "object" && leg.monto) {
    out.push({ periodo: `${doc.anio}-${String(mes + 1).padStart(2, "0")}`, monto: leg.monto, archivo: leg.archivo, documentos: leg.documentos });
  }
  return out;
}

/**
 * Separa las filas del RCV de compras según la fila del flujo a la que van
 * (por RUT del proveedor). Las filas de continuación sin RUT siguen al
 * documento anterior. Devuelve también los proveedores con regla y los que
 * parecen financieros pero no tienen regla (sugerencias).
 */
export function separarRCVPorFila(filas, reglas = {}) {
  const grupos = {};
  const proveedores = {}; // rut → { rut, nombre, fila, docs, conRegla, sugerido }
  let ultimaFila = "compras";
  let ultimoRut = null;
  for (const fila of filas || []) {
    const get = lector(fila);
    const rutTxt = String(get("RUT Proveedor")).trim();
    const rut = normalizarRut(rutTxt) || ultimoRut;
    const destino = rut ? (reglas[rut]?.fila || "compras") : ultimaFila;
    if (rutTxt) {
      ultimoRut = rut;
      const nombre = String(get("Razon Social")).trim();
      const p = proveedores[rut] ||= {
        rut, rutTxt, nombre, fila: destino, docs: 0,
        conRegla: !!reglas[rut], sugerido: !reglas[rut] && PATRON_FINANCIERO.test(nombre),
      };
      p.docs++;
    }
    ultimaFila = destino;
    (grupos[destino] ||= []).push(fila);
  }
  const relevantes = Object.values(proveedores).filter(p => p.conRegla || p.sugerido);
  return { grupos, proveedores: relevantes };
}
