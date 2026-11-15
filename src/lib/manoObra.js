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
 */
import { listEmployeeMonthlyData, listEmployeeMonthlyDataByYear } from "./db";

async function deRRHH(empresaId, year) {
  try {
    const { costosManoObraRRHH } = await import("../pages/rrhh/resumenContable");
    return await costosManoObraRRHH(empresaId, Number(year));
  } catch (e) {
    console.error("Mano de obra desde RRHH:", e);
    return [];
  }
}

export async function manoObraMes(empresaId, projectId, year, month) {
  const rrhh = (await deRRHH(empresaId, year)).filter(r => r.projectId === projectId && r.month === Number(month));
  if (rrhh.length) return rrhh;
  return (await listEmployeeMonthlyData(empresaId, projectId, year, month)).map(x => ({ ...x, fuente: "excel" }));
}

export async function manoObraAnio(empresaId, projectId, year) {
  const [rrhh, excel] = await Promise.all([
    deRRHH(empresaId, year).then(r => r.filter(x => x.projectId === projectId)),
    listEmployeeMonthlyDataByYear(empresaId, projectId, year),
  ]);
  const mesesRRHH = new Set(rrhh.map(r => r.month));
  return [
    ...rrhh,
    ...excel.filter(x => !mesesRRHH.has(Number(x.month))).map(x => ({ ...x, fuente: "excel" })),
  ];
}
