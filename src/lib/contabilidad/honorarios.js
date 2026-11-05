/**
 * Boletas de honorarios recibidas (SII) → fila Honorarios del Flujo Mensual.
 * Lógica pura.
 *
 * Acepta los dos informes que entrega el SII en "Consultar boletas recibidas":
 *  · Informe anual: un renglón por mes (PERIODOS, Vigentes, Anuladas,
 *    HONORARIO BRUTO, RETENCION DE TERCEROS, RETENCION CONTRIBUYENTE,
 *    TOTAL LIQUIDO). Viene como .xls que por dentro es una tabla HTML en
 *    Windows-1252: hay que decodificarlo antes de pasarlo a XLSX.
 *  · Informe mensual: una boleta por renglón (N°, Estado, Fecha, Rut, Nombre,
 *    Brutos, Retenido, Pagado).
 *
 * Gasto = honorario BRUTO de las boletas vigentes (las anuladas no cuentan).
 * La retención es parte del bruto: la empresa se la paga al SII (F29, código
 * 151) en vez de al prestador. En 14 A va en el mes de la boleta.
 */

const MESES_SII = ["ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"];
const norm = s => String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
const num = v => { const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/\./g, "").replace(",", ".").replace(/[^0-9.-]/g, "")); return Number.isFinite(n) ? n : 0; };

function fechaMes(v) {
  if (typeof v === "number" && v > 30000 && v < 80000) {
    const d = new Date(Math.round((v - 25569) * 86400000));
    return { anio: d.getUTCFullYear(), mes: d.getUTCMonth() };
  }
  const s = String(v ?? "");
  let m = s.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (m) return { anio: +m[3], mes: +m[2] - 1 };
  m = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return { anio: +m[1], mes: +m[2] - 1 };
  return null;
}

/** "anual" | "detalle" | null, y la fila de encabezados. */
export function detectarHonorarios(filas) {
  for (let i = 0; i < Math.min(filas?.length || 0, 20); i++) {
    const celdas = (filas[i] || []).map(norm);
    if (celdas.includes("periodos") && celdas.some(c => c.includes("honorariobruto"))) return { tipo: "anual", encabezado: i };
    if (celdas.some(c => c === "brutos" || c === "bruto") && celdas.some(c => c.includes("fecha")) && celdas.some(c => c.includes("rut"))) {
      return { tipo: "detalle", encabezado: i };
    }
  }
  return null;
}

export function resumirHonorarios(filas) {
  const det = detectarHonorarios(filas);
  if (!det) return null;
  const meses = Array.from({ length: 12 }, (_, mes) => ({ mes, boletas: 0, anuladas: 0, bruto: 0, retencionTerceros: 0, retencionContribuyente: 0, liquido: 0 }));
  const enc = (filas[det.encabezado] || []).map(norm);
  const col = (...pruebas) => enc.findIndex(c => pruebas.some(p => typeof p === "string" ? c === p : p.test(c)));
  let anio = null;

  if (det.tipo === "anual") {
    // El año va en la celda de título: "Informe correspondiente al año 2026"
    for (const fila of filas.slice(0, det.encabezado + 1)) {
      const m = String(fila?.[0] ?? "").match(/a[nñ]o\s+(\d{4})/i);
      if (m) { anio = +m[1]; break; }
    }
    const iBruto = col(/honorariobruto/), iRetT = col(/retenciondeterceros/), iRetC = col(/retencioncontribuyente/), iLiq = col(/totalliquido/);
    // "EMISIONES" ocupa dos columnas (Vigentes / Anuladas) con su propia fila de subtítulo
    const sub = (filas[det.encabezado + 1] || []).map(norm);
    const iVig = sub.findIndex(c => c.includes("vigentes")), iAnu = sub.findIndex(c => c.includes("anuladas"));
    filas.slice(det.encabezado + 1).forEach(f => {
      const m = MESES_SII.indexOf(String(f?.[0] ?? "").trim().toUpperCase());
      if (m < 0) return;
      const r = meses[m];
      r.boletas = iVig >= 0 ? num(f[iVig]) : 0;
      r.anuladas = iAnu >= 0 ? num(f[iAnu]) : 0;
      r.bruto = num(f[iBruto]);
      r.retencionTerceros = iRetT >= 0 ? num(f[iRetT]) : 0;
      r.retencionContribuyente = iRetC >= 0 ? num(f[iRetC]) : 0;
      r.liquido = iLiq >= 0 ? num(f[iLiq]) : 0;
    });
  } else {
    const iEst = col(/^estado/), iFecha = col(/^fecha/), iBruto = col("brutos", "bruto"), iRet = col(/^retenid/), iPag = col(/^pagado|^liquido/);
    const anios = {};
    filas.slice(det.encabezado + 1).forEach(f => {
      const bruto = num(f?.[iBruto]);
      const fm = fechaMes(f?.[iFecha]);
      if (!fm || (!bruto && !String(f?.[iEst] ?? "").trim())) return;
      anios[fm.anio] = (anios[fm.anio] || 0) + 1;
      const r = meses[fm.mes];
      if (/nul/i.test(String(f?.[iEst] ?? ""))) { r.anuladas++; return; }
      r.boletas++;
      r.bruto += bruto;
      r.retencionTerceros += iRet >= 0 ? num(f[iRet]) : 0;
      r.liquido += iPag >= 0 ? num(f[iPag]) : 0;
    });
    anio = +(Object.entries(anios).sort((a, b) => b[1] - a[1])[0]?.[0]) || null;
  }

  const tot = k => meses.reduce((s, r) => s + r[k], 0);
  // Control: bruto − retenciones = líquido
  const descuadre = meses.reduce((s, r) => s + Math.abs(r.bruto - r.retencionTerceros - r.retencionContribuyente - r.liquido), 0);
  return {
    tipo: det.tipo, anio, meses,
    // Meses que el archivo informa: el anual trae los 12 (un mes vacío deja
    // la fila en cero); el mensual solo los que tienen boletas.
    mesesInformados: det.tipo === "anual" ? meses.map(r => r.mes) : meses.filter(r => r.boletas || r.anuladas).map(r => r.mes),
    boletas: tot("boletas"), anuladas: tot("anuladas"), bruto: tot("bruto"),
    retencionTerceros: tot("retencionTerceros"), retencionContribuyente: tot("retencionContribuyente"),
    liquido: tot("liquido"), descuadre: Math.round(descuadre),
  };
}
