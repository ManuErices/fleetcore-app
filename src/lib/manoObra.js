/**
 * src/lib/manoObra.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Costo de mano de obra por obra para Oficina Técnica (Dashboard, Consolidado,
 * Estado de pago).
 *
 * Fuente principal: las liquidaciones de RRHH (src/pages/rrhh/resumenContable.js
 * → costosManoObraRRHH), la obra según el centro de costo del trabajador.
 * Respaldo: el Excel de sueldos de Oficina Técnica (employeeMonthlyData), solo
 * en los meses en que RRHH no tiene liquidaciones para la obra, mientras se
 * termina de cargar RRHH. Cada fila trae `fuente`: "rrhh" | "excel".
 * El costo de la obra es totalCosto × porcentajeIncidencia (costoObraFila).
 */
import { listEmployeeMonthlyData, listEmployeeMonthlyDataByYear } from "./db";
import { mesesEntre, limitesMes, desdeISO } from "./fechas";

async function deRRHH(empresaId, year) {
  try {
    const { costosManoObraRRHH } = await import("../pages/rrhh/resumenContable");
    return await costosManoObraRRHH(empresaId, Number(year));
  } catch (e) {
    console.error("Mano de obra desde RRHH:", e);
    return [];
  }
}

// Respaldo del Excel POR TRABAJADOR y mes: antes bastaba que RRHH tuviera a
// UN trabajador ese mes para descartar todo el Excel de la obra. Una fila del
// Excel se descarta solo si RRHH ya tiene a ese mismo trabajador (misma ficha
// de `trabajadores`) en ese mes, en cualquier obra, para no contarlo dos veces.
export function combinarRRHHyExcel(rrhhTodas, excel, projectId) {
  const conRRHH = new Set(rrhhTodas.map(r => `${r.employeeId}|${Number(r.month)}`));
  return [
    ...rrhhTodas.filter(r => r.projectId === projectId),
    ...(excel || [])
      .filter(x => !x.employeeId || !conRRHH.has(`${x.employeeId}|${Number(x.month)}`))
      .map(x => ({ ...x, fuente: "excel" })),
  ];
}

export async function manoObraMes(empresaId, projectId, year, month) {
  const [rrhh, excel] = await Promise.all([
    deRRHH(empresaId, year).then(r => r.filter(x => x.month === Number(month))),
    listEmployeeMonthlyData(empresaId, projectId, year, month),
  ]);
  return combinarRRHHyExcel(rrhh, excel, projectId);
}

export async function manoObraAnio(empresaId, projectId, year) {
  const [rrhh, excel] = await Promise.all([
    deRRHH(empresaId, year),
    listEmployeeMonthlyDataByYear(empresaId, projectId, year),
  ]);
  return combinarRRHHyExcel(rrhh, excel, projectId);
}

/** Costo de la obra de una fila: totalCosto × % de incidencia (100 si no trae). */
export const costoObraFila = (f) => {
  const pct = f?.porcentajeIncidencia != null ? Number(f.porcentajeIncidencia) : 100;
  return (Number(f?.totalCosto) || 0) * (pct / 100);
};

/**
 * Fracción de cada mes que cae dentro de [desde, hasta] (por días).
 * { "AAAA-MM": 0..1 }. Un rango del 15 al 14 del mes siguiente toma la
 * mitad de cada liquidación en vez de una sola completa.
 */
export function fraccionesMeses(desde, hasta) {
  const salida = {};
  mesesEntre(desde, hasta).forEach(ym => {
    const [a, m] = ym.split("-").map(Number);
    const { desde: ini, hasta: fin } = limitesMes(a, m);
    const d0 = desde > ini ? desde : ini;
    const d1 = hasta < fin ? hasta : fin;
    const dias = (desdeISO(d1) - desdeISO(d0)) / 86400000;
    const diasMes = Number(fin.slice(8, 10));
    salida[ym] = Math.max(0, Math.round(dias) + 1) / diasMes;
  });
  return salida;
}

/**
 * Mano de obra de un rango de fechas: todas las liquidaciones de los meses
 * que toca, cada una con `factorRango` (la parte del mes dentro del rango).
 */
export async function manoObraRango(empresaId, projectId, desde, hasta) {
  const fracciones = fraccionesMeses(desde, hasta);
  const anios = [...new Set(Object.keys(fracciones).map(k => Number(k.slice(0, 4))))];
  const porAnio = await Promise.all(anios.map(a => manoObraAnio(empresaId, projectId, a)));
  return porAnio.flat()
    .map(f => ({ ...f, factorRango: fracciones[`${f.year}-${String(f.month).padStart(2, "0")}`] || 0 }))
    .filter(f => f.factorRango > 0);
}
