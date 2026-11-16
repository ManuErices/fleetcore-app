/**
 * src/lib/costosObra.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Fuente única de los montos de costo e ingreso de una obra que usan Oficina
 * Técnica (Dashboard, Consolidado, Estado de pago), Finanzas (Obras, Reportes,
 * Proveedores) y el agente. Antes cada pantalla tenía su fórmula y la misma
 * obra mostraba cifras distintas. Criterios definidos por la empresa:
 *
 *  · OC: cuenta lo FACTURADO contra la orden (no lo comprometido), en el mes
 *    de la OC. Por ítem: `item.facturado`.
 *  · Subcontratos: costo = monto bruto del EP (`montoEP`, las retenciones no
 *    bajan el costo) en el MES ASOCIADO al trabajo; si el EP no tiene mes
 *    asociado, el de su fecha. El saldo por pagar se cuenta UNA vez por
 *    contrato (cada fila de EP repite el saldo del contrato completo).
 *  · Ingresos del mandante (estadoPagoIngresos): venta BRUTA = estados de
 *    pago + reajustes + multas (con su signo: se ingresan en negativo). La
 *    retención no rebaja la venta: se muestra aparte, por cobrar al final.
 */
import { agruparEPs } from "./subcontratosEP";

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto",
  "septiembre", "octubre", "noviembre", "diciembre"];
const sinTilde = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** "Mayo 2026", "2026-05" o "05/2026" → "2026-05"; "" si no se reconoce. */
export function mesClave(texto) {
  const t = sinTilde(texto).trim();
  if (!t) return "";
  let m = t.match(/^(\d{4})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}`;
  m = t.match(/^(\d{1,2})[/-](\d{4})$/);
  if (m) return `${m[2]}-${m[1].padStart(2, "0")}`;
  m = t.match(/^([a-z]+)\s+(\d{4})$/);
  if (m) {
    const i = MESES.indexOf(m[1]);
    if (i >= 0) return `${m[2]}-${String(i + 1).padStart(2, "0")}`;
  }
  return "";
}

// ─── Subcontratos ───────────────────────────────────────────────────────────

/** Mes ("AAAA-MM") en que cuenta el costo de una fila de EP. */
export function mesSubcontrato(s) {
  return mesClave(s?.mesAsociadoManual) || mesClave(s?.mesAsociado)
    || String(s?.fechaEP || "").slice(0, 7);
}

/** Costo de subcontratos (montoEP) de las filas cuyo mes cae entre desde y hasta ("AAAA-MM-DD" o "AAAA-MM"). */
export function costoSubcontratos(filas, { desde, hasta } = {}) {
  const d = desde ? String(desde).slice(0, 7) : "", h = hasta ? String(hasta).slice(0, 7) : "";
  return (filas || []).reduce((t, s) => {
    const m = mesSubcontrato(s);
    if ((d && (!m || m < d)) || (h && (!m || m > h))) return t;
    return t + num(s.montoEP);
  }, 0);
}

/** Filtro de filas de EP por mes (mismo criterio que costoSubcontratos). */
export function subcontratosDelPeriodo(filas, { desde, hasta } = {}) {
  const d = desde ? String(desde).slice(0, 7) : "", h = hasta ? String(hasta).slice(0, 7) : "";
  return (filas || []).filter(s => {
    const m = mesSubcontrato(s);
    return !((d && (!m || m < d)) || (h && (!m || m > h)));
  });
}

/** Saldo por pagar de subcontratos: una vez por contrato (N° SC). */
export function saldoSubcontratos(filas) {
  const { saldoSC } = agruparEPs(filas || []);
  return [...saldoSC.values()].reduce((t, v) => t + num(v), 0);
}

// ─── Órdenes de compra ─────────────────────────────────────────────────────

/** Costo de una OC = lo facturado contra ella. */
export function costoOC(oc) {
  if (!oc) return 0;
  if (oc.totalFacturado != null) return num(oc.totalFacturado);
  if (oc.montoFacturado != null) return num(oc.montoFacturado);
  return (oc.items || []).reduce((t, it) => t + num(it.facturado), 0);
}

/** Costo de un ítem de OC (para repartir por cuenta de costo). */
export const costoItemOC = (item) => num(item?.facturado);

/** Comprometido (total de la OC) y pendiente de facturar, como información aparte. */
export function comprometidoOC(oc) {
  const total = num(oc?.totalMonto) || (oc?.items || []).reduce((t, it) => t + num(it.subTotal), 0);
  return { comprometido: total, facturado: costoOC(oc), porFacturar: Math.max(0, total - costoOC(oc)) };
}

// ─── Ingresos del mandante (Oficina Técnica) ───────────────────────────────

/** Venta bruta del mes: EP + reajustes + multas (con signo). Sin retención. */
export function ventaOT(i) {
  return num(i?.estadosPago) + num(i?.reajuste) + num(i?.reajustePolinomico) + num(i?.multas);
}

/** Retención del mes como monto positivo (se guarda con signo −). */
export const retencionOT = (i) => Math.abs(num(i?.retenciones));
