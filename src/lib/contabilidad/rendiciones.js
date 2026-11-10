/**
 * Reporte de gastos de Rindegastos ("ReporteGastos") → fila Rendiciones del
 * Flujo Mensual. Lógica pura.
 *
 * Qué entra (en el mes de la "Fecha de Emisión" del documento, 14 A):
 *  · Boletas (39, 38, 41), peajes, vouchers, tickets: monto total. No tienen
 *    IVA recuperable, así que todo el monto es gasto.
 *  · Comprobantes de egreso: transferencias sin documento tributario. Entran,
 *    pero se avisan: el SII puede rechazarlas si no hay otro respaldo.
 *
 * Qué NO entra:
 *  · Facturas (33, 34, 46, 56, 61) a nombre de la empresa: ya están en el RCV
 *    de compras (y ahí se cuenta su neto, sin IVA). Si se suman aquí, se
 *    cuentan dos veces. Las que Rindegastos marca "DTE no recibido" no
 *    aparecen en el RCV: se avisan y se pueden incluir.
 *  · Boletas de honorarios: vienen en el informe de honorarios del SII.
 *  · Gastos rechazados.
 */

const norm = s => String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
const num = v => { const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/[^0-9,.-]/g, "").replace(/\./g, "").replace(",", ".")); return Number.isFinite(n) ? n : 0; };

function fechaMes(v) {
  if (typeof v === "number" && v > 30000 && v < 80000) {
    const d = new Date(Math.round((v - 25569) * 86400000));
    return { anio: d.getUTCFullYear(), mes: d.getUTCMonth() };
  }
  const m = String(v ?? "").match(/(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  return m ? { anio: +m[3], mes: +m[2] - 1 } : null;
}

export function detectarRendiciones(filas) {
  for (let i = 0; i < Math.min(filas?.length || 0, 10); i++) {
    const c = (filas[i] || []).map(norm);
    if (c.includes("propietariodelgasto") && c.includes("montoaprobado")) return i;
  }
  return -1;
}

/** Clase de documento según "Tipo de Documento" (+ "Estado DTE" para facturas). */
function claseDocumento(tipo, estadoDte) {
  const t = norm(tipo);
  if (/honorario/.test(t)) return "honorarios";
  if (/factura|notadecredito|notadedebito/.test(t)) return /norecibido/.test(norm(estadoDte)) ? "facturaNoRecibida" : "factura";
  if (/comprobantedeegreso|transferencia/.test(t)) return "comprobante";
  return "boleta";   // boletas, peajes, vouchers, tickets, otros
}

export const CLASES_RENDICION = {
  boleta:            { nombre: "Boletas, peajes y vouchers", entra: true },
  comprobante:       { nombre: "Comprobantes de egreso (sin documento tributario)", entra: true, opcional: true },
  facturaNoRecibida: { nombre: "Facturas que no llegaron al RCV de la empresa", entra: false, opcional: true },
  factura:           { nombre: "Facturas a nombre de la empresa (ya están en Compras)", entra: false },
  honorarios:        { nombre: "Boletas de honorarios (van en Honorarios)", entra: false },
};

/**
 * opciones: { incluirEnRevision = true, incluirComprobantes = true,
 *             incluirFacturasNoRecibidas = false }
 */
export function resumirRendiciones(filas, opciones = {}) {
  const { incluirEnRevision = true, incluirComprobantes = true, incluirFacturasNoRecibidas = false } = opciones;
  const iEnc = detectarRendiciones(filas);
  if (iEnc < 0) return null;
  const enc = filas[iEnc].map(norm);
  const col = n => enc.indexOf(norm(n));
  const c = {
    estado: col("Estado del Gasto"), tipo: col("Tipo de Documento"), fecha: col("Fecha de Emisión"),
    monto: col("Monto Aprobado"), solicitado: col("Monto Solicitado"), dte: col("Estado DTE"),
    categoria: col("Categoría"), proveedor: col("Nombre Proveedor"),
  };

  const r = {
    documentos: 0, rechazados: { docs: 0, monto: 0 }, enRevision: { docs: 0, monto: 0 },
    clases: Object.fromEntries(Object.keys(CLASES_RENDICION).map(k => [k, { docs: 0, monto: 0 }])),
    porCategoria: {}, meses: {}, total: 0, opciones: { incluirEnRevision, incluirComprobantes, incluirFacturasNoRecibidas },
  };
  const entra = clase => clase === "boleta"
    || (clase === "comprobante" && incluirComprobantes)
    || (clase === "facturaNoRecibida" && incluirFacturasNoRecibidas);

  filas.slice(iEnc + 1).forEach(f => {
    if (!f || f.every(x => x === "" || x == null)) return;
    const monto = num(c.monto >= 0 ? f[c.monto] : f[c.solicitado]);
    const fm = fechaMes(f[c.fecha]);
    if (!fm || !monto) return;
    r.documentos++;
    const estado = norm(f[c.estado]);
    if (/rechaz/.test(estado)) { r.rechazados.docs++; r.rechazados.monto += monto; return; }
    const revision = /revision|pendiente/.test(estado);
    if (revision) { r.enRevision.docs++; r.enRevision.monto += monto; if (!incluirEnRevision) return; }

    const clase = claseDocumento(f[c.tipo], c.dte >= 0 ? f[c.dte] : "");
    r.clases[clase].docs++; r.clases[clase].monto += monto;
    if (!entra(clase)) return;

    const k = `${fm.anio}-${fm.mes}`;
    const m = r.meses[k] ||= { anio: fm.anio, mes: fm.mes, documentos: 0, monto: 0 };
    m.documentos++; m.monto += monto;
    const cat = String(f[c.categoria] ?? "").trim() || "Sin categoría";
    r.porCategoria[cat] = (r.porCategoria[cat] || 0) + monto;
    r.total += monto;
  });

  r.reparto = Object.values(r.meses).sort((a, b) => a.anio - b.anio || a.mes - b.mes)
    .map(m => ({ ...m, monto: Math.round(m.monto) }));
  // Período del reporte = el mes con más documentos (sirve de llave para reimportar)
  const todos = {};
  filas.slice(iEnc + 1).forEach(f => { const fm = f && fechaMes(f[c.fecha]); if (fm) { const k = `${fm.anio}-${fm.mes}`; todos[k] = (todos[k] || 0) + 1; } });
  const top = Object.entries(todos).sort((a, b) => b[1] - a[1])[0];
  r.periodo = top ? { anio: +top[0].split("-")[0], mes: +top[0].split("-")[1] } : null;
  r.total = Math.round(r.total);
  return r;
}
