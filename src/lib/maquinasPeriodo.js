/**
 * src/lib/maquinasPeriodo.js
 * ─────────────────────────────────────────────────────────────────────────────
 * ¿La máquina cuenta en un período? Criterio único de Oficina Técnica
 * (Calendario, Combustible, Registro diario, Sueldos, Máquinas, KPIs):
 *
 *  · `fechaBaja` ("AAAA-MM-DD", fecha de venta/baja): activa hasta ese día
 *    inclusive, aunque hoy esté inactiva.
 *  · Sin fechaBaja: activa si `estaActiva` (sin campo `active` = activa).
 *  · Inactiva sin fechaBaja: no sabemos desde cuándo, así que cuenta en los
 *    períodos que terminaron antes de hoy (los meses pasados no pierden la
 *    máquina vendida) y no en el período en curso.
 *
 * Se combina con estuvoEnObra (src/lib/maquinas.js) para la obra.
 */
import { estaActiva, estuvoEnObra } from "./maquinas";
import { hoyISO } from "./fechas";

export function activaEnPeriodo(m, desde, hasta, hoy = hoyISO()) {
  const baja = /^\d{4}-\d{2}-\d{2}$/.test(String(m?.fechaBaja || "")) ? m.fechaBaja : "";
  if (baja) return baja >= (desde || hoy);
  if (estaActiva(m)) return true;
  return !!hasta && hasta < hoy;
}

/** Máquinas que estuvieron en la obra y activas en el período. */
export const maquinasDelPeriodo = (maquinas, projectId, desde, hasta, hoy) =>
  (maquinas || []).filter(m => estuvoEnObra(m, projectId, desde, hasta) && activaEnPeriodo(m, desde, hasta, hoy));
