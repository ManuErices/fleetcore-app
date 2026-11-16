/**
 * src/lib/finanzas/costosFijos.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Reglas puras de los costos fijos (empresas/{id}/costos_fijos), compartidas
 * por la pantalla Costos y las alertas de FinanzasContext. Todas las fechas
 * son texto "AAAA-MM-DD" en hora de Chile (fechas.js): comparar a medianoche
 * contra "ahora" dejaba fuera el pago que vence hoy.
 */
import { hoyISO, partesISO } from "../fechas.js";

const dos = (n) => String(n).padStart(2, "0");
const ultimoDia = (anio, mes) => new Date(anio, mes, 0).getDate();   // mes 1-12

/** Meses entre cuotas según la frecuencia; null si no se repite. */
export function mesesEntreCuotas(frecuencia) {
  return { mensual: 1, trimestral: 3, semestral: 6, anual: 12 }[frecuencia || "mensual"] ?? null;
}

/** Días de calendario de `desde` a `hasta` ("AAAA-MM-DD"), sin horas. */
export function diasEntre(desde, hasta) {
  const a = partesISO(desde), b = partesISO(hasta);
  if (!a || !b) return null;
  return Math.round((Date.UTC(b.anio, b.mes - 1, b.dia) - Date.UTC(a.anio, a.mes - 1, a.dia)) / 86400000);
}

/**
 * ¿El costo ya terminó? Todas las cuotas pagadas, o la fecha de término ya
 * pasó. Un costo terminado no suma al total mensual ni avisa pagos.
 */
export function costoTerminado(c, hoy = hoyISO()) {
  const total = parseInt(c.cuotasTotales) || 0;
  if (total > 0 && (parseInt(c.cuotasPagadas) || 0) >= total) return true;
  return !!(c.fechaTermino && /^\d{4}-\d{2}-\d{2}/.test(c.fechaTermino) && c.fechaTermino.slice(0, 10) < hoy);
}

/**
 * Próxima fecha de pago ("AAAA-MM-DD", hoy incluido) según el día de pago y
 * la frecuencia. Las cuotas trimestrales, semestrales y anuales caen en los
 * meses que cuentan desde el mes de inicio; sin fecha de inicio no se puede
 * saber cuáles son, y se devuelve null (antes se avisaban todos los meses).
 * El pago único es la fecha de inicio. null si ya terminó o no hay próxima.
 */
export function proximoPagoCosto(c, hoy = hoyISO()) {
  if (costoTerminado(c, hoy)) return null;
  const inicio = partesISO(c.fechaInicio);
  if (c.frecuencia === "unico") {
    const f = inicio ? c.fechaInicio.slice(0, 10) : null;
    return f && f >= hoy ? f : null;
  }
  const dia = parseInt(c.diaPago);
  const cada = mesesEntreCuotas(c.frecuencia);
  if (!dia || !cada) return null;
  if (cada > 1 && !inicio) return null;
  const h = partesISO(hoy);
  let anio = h.anio, mes = h.mes;
  for (let i = 0; i < 25; i++, mes++) {
    if (mes > 12) { mes = 1; anio++; }
    const indice = anio * 12 + mes;
    if (inicio) {
      const desdeInicio = indice - (inicio.anio * 12 + inicio.mes);
      if (desdeInicio < 0 || desdeInicio % cada !== 0) continue;
    }
    const fecha = `${anio}-${dos(mes)}-${dos(Math.min(dia, ultimoDia(anio, mes)))}`;
    if (fecha < hoy) continue;
    if (c.fechaTermino && fecha > c.fechaTermino.slice(0, 10)) return null;
    return fecha;
  }
  return null;
}

// ─── Monto llevado a mes y vigencia por mes ─────────────────────────────────

/** Monto equivalente mensual, en la moneda del costo (pago único: 0). */
export function montoMensual(c) {
  const cada = c?.frecuencia === "unico" ? null : mesesEntreCuotas(c?.frecuencia);
  return cada ? (parseFloat(c.monto) || 0) / cada : 0;
}

/** "AAAA-MM" + n meses. */
export function sumarMesesClave(mes, n) {
  const [a, m] = String(mes).split("-").map(Number);
  const i = a * 12 + (m - 1) + n;
  return `${Math.floor(i / 12)}-${dos((i % 12) + 1)}`;
}

/**
 * ¿El costo corre en el mes "AAAA-MM"? Activo, ya empezó (mes de inicio) y no
 * terminó (fecha de término, o la última cuota según inicio + cuotas ×
 * frecuencia). Sin fecha de inicio, un costo con todas las cuotas pagadas se
 * considera terminado desde el mes actual (no se sabe cuándo fue la última).
 * Antes Reportes sumaba todo costo con activo !== false los 12 meses del año,
 * aunque hubiera terminado o aún no empezara.
 */
export function costoVigenteEnMes(c, mes, hoy = hoyISO()) {
  if (!c || c.activo === false || !/^\d{4}-\d{2}$/.test(String(mes))) return false;
  const ini = /^\d{4}-\d{2}/.test(c.fechaInicio || "") ? c.fechaInicio.slice(0, 7) : "";
  if (c.frecuencia === "unico") return !!ini && ini === mes;
  if (ini && mes < ini) return false;
  if (/^\d{4}-\d{2}/.test(c.fechaTermino || "") && mes > c.fechaTermino.slice(0, 7)) return false;
  const total = parseInt(c.cuotasTotales) || 0;
  const cada = mesesEntreCuotas(c.frecuencia);
  if (total > 0) {
    if (ini && cada) return mes <= sumarMesesClave(ini, (total - 1) * cada);
    if ((parseInt(c.cuotasPagadas) || 0) >= total && mes >= hoy.slice(0, 7)) return false;
  }
  return true;
}

// Misma regla que aPesos (monedas.js), sin depender de Firestore: null si
// está en UF/USD y no hay valor del día (mejor fuera de un total que mal sumado).
function enPesos(monto, moneda, indicadores) {
  const m = Number(monto) || 0;
  if (!moneda || moneda === "CLP") return m;
  if (moneda === "UF") return indicadores?.uf ? m * indicadores.uf : null;
  if (moneda === "USD") return indicadores?.dolar ? m * indicadores.dolar : null;
  return null;
}

/**
 * Monto del costo en pesos para el mes "AAAA-MM": su equivalente mensual si
 * corre ese mes (el pago único, completo en su mes), 0 si no. null si está
 * en UF/USD y no hay valor del día.
 */
export function costoDelMesEnPesos(c, mes, indicadores, hoy = hoyISO()) {
  if (!costoVigenteEnMes(c, mes, hoy)) return 0;
  const monto = c.frecuencia === "unico" ? (parseFloat(c.monto) || 0) : montoMensual(c);
  return enPesos(monto, c.moneda, indicadores);
}

// ─── Leasing y créditos por máquina ─────────────────────────────────────────

/** Categorías de costo fijo que financian una máquina (leasing, crédito bancario, crédito automotriz). */
export const CATEGORIAS_FINANCIAMIENTO = ["leasing", "credito", "otro"];

/**
 * Cuota mensual en pesos por máquina, desde los costos fijos vinculados
 * (`activoVinculadoId`), llevada a mes según la frecuencia y pasada a pesos
 * con el valor del día (UF/USD). No cuenta los terminados, inactivos ni los
 * que aún no empiezan. Por defecto solo leasing (lo que Rental resta como
 * "leasing"); con `categorias` se incluyen créditos.
 *
 * @returns Map(machineId → { mensual, costos: [{ id, nombre, categoria, moneda, monto, mensual }], sinConvertir })
 */
export function leasingMensualPorMaquina(costosFijos, indicadores, { categorias = ["leasing"], hoy = hoyISO() } = {}) {
  const salida = new Map();
  for (const c of costosFijos || []) {
    if (!c?.activoVinculadoId || !categorias.includes(c.categoria)) continue;
    if (c.activo === false || costoTerminado(c, hoy)) continue;
    if (/^\d{4}-\d{2}-\d{2}/.test(c.fechaInicio || "") && c.fechaInicio.slice(0, 10) > hoy) continue;
    const pesos = enPesos(montoMensual(c), c.moneda, indicadores);
    const e = salida.get(c.activoVinculadoId) || { mensual: 0, costos: [], sinConvertir: 0 };
    if (pesos === null) e.sinConvertir++;
    else e.mensual += pesos;
    e.costos.push({ id: c.id, nombre: c.nombre || "", categoria: c.categoria, moneda: c.moneda || "CLP", monto: parseFloat(c.monto) || 0, mensual: pesos });
    salida.set(c.activoVinculadoId, e);
  }
  return salida;
}

/**
 * Leasing mensual de una máquina: el de sus costos fijos vinculados si hay
 * alguno; si no, el campo manual `leasingMensual` de la ficha (respaldo).
 * { monto, fuente: "costos_fijos" | "ficha" | null }
 */
export function leasingDeMaquina(maquina, porMaquina) {
  const e = porMaquina?.get?.(maquina?.id);
  if (e && e.costos.length) return { monto: Math.round(e.mensual), fuente: "costos_fijos" };
  const manual = Number(maquina?.leasingMensual) || 0;
  return { monto: manual, fuente: manual ? "ficha" : null };
}
