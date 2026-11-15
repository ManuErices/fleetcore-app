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
