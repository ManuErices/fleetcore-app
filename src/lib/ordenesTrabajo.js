/**
 * src/lib/ordenesTrabajo.js
 * Qué cuenta como "OT abierta", igual en el selector de módulos y en el
 * dashboard de Maquinaria.
 */
import { estaActiva } from "./maquinas";

/** Estados en que la OT ya no tiene trabajo pendiente. "Terminada" = trabajo hecho, falta solo el cierre administrativo. */
export const ESTADOS_OT_SIN_TRABAJO = ["terminada", "cerrada", "cancelada"];

/**
 * OT con trabajo pendiente: estado abierto y de una máquina que existe y está
 * activa (una OT de una máquina eliminada o dada de baja no se puede atender).
 * Sin lista de máquinas, solo mira el estado.
 */
export function otAbiertas(workOrders = [], machines = null) {
  const activas = machines ? new Set(machines.filter(estaActiva).map((m) => m.id)) : null;
  return workOrders.filter((o) =>
    !ESTADOS_OT_SIN_TRABAJO.includes(String(o.estado || "pendiente").toLowerCase())
    && (!activas || activas.has(o.machineId))
  );
}
