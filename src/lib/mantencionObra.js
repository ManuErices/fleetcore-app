/**
 * src/lib/mantencionObra.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Costo de mantención y repuestos por obra, para Oficina Técnica (Dashboard,
 * Consolidado, Estado de pago): línea "Mantención y repuestos (Maquinaria)"
 * en el bucket Maquinaria y equipos.
 *
 * Fuente: Maquinaria. Al cerrar una orden de trabajo, la Cloud Function
 * closeWorkOrder guarda `costoTotal` (mano de obra + repuestos) en la OT y
 * crea un `maintenanceEvents` con el mismo costo. Se cuenta el EVENTO; una OT
 * cerrada con costo y sin evento (datos antiguos) se cuenta por su cuenta.
 * Ninguno trae obra: se asigna a la obra en que estaba la máquina ese día
 * (projectId si el documento lo trae; si no, obraEnFecha(máquina, fecha)
 * según su historialObras, como partesDiarios.js y combustible.js).
 *
 * Fechas: `fecha` / `fechaCierre` son instantes ISO (UTC); se pasan a día de
 * Chile con fechaISO (cortar el texto daría el día UTC).
 */
import { collection, getDocs } from "firebase/firestore";
import { db } from "./firebase";
import { obraEnFecha, listarMaquinas } from "./maquinas";
import { fechaISO } from "./fechas";

export const LINEA_MANTENCION = "Mantención y repuestos (Maquinaria)";

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

/** Día de Chile ("AAAA-MM-DD") de un valor de fecha (texto AAAA-MM-DD, ISO con hora, Timestamp). */
export function diaChile(valor) {
  if (!valor) return "";
  if (typeof valor === "string" && /^\d{4}-\d{2}-\d{2}$/.test(valor)) return valor;
  return fechaISO(valor);
}

/**
 * Eventos + OT cerradas → costos { id, machineId, fecha, projectId, costo, tipo, origen }
 * de la obra pedida y el rango (desde/hasta "AAAA-MM-DD", opcionales).
 * Pura: recibe los documentos y las máquinas.
 */
export function costosMantencion({ eventos = [], ordenes = [], maquinas = [] }, projectId, desde, hasta) {
  const porId = Object.fromEntries((maquinas || []).map(m => [m.id, m]));
  const conEvento = new Set(eventos.map(e => e.workOrderId).filter(Boolean));
  const filas = [
    ...eventos.map(e => ({
      id: `ev_${e.id}`, machineId: e.machineId || "", fecha: diaChile(e.fecha || e.createdAt),
      projectId: e.projectId || "", costo: num(e.costoTotal), tipo: e.tipo || "", origen: "evento",
      workOrderId: e.workOrderId || null,
    })),
    ...ordenes
      .filter(o => o.estado === "cerrada" && !conEvento.has(o.id))
      .map(o => ({
        id: `ot_${o.id}`, machineId: o.machineId || "", fecha: diaChile(o.fechaCierre || o.updatedAt),
        projectId: o.projectId || "", costo: num(o.costoTotal) || (num(o.costoManoObra) + num(o.costoRepuestos)),
        tipo: o.origen || "", origen: "orden", workOrderId: o.id,
      })),
  ];
  return filas
    .filter(f => f.costo > 0 && f.fecha)
    .map(f => ({ ...f, projectId: f.projectId || (porId[f.machineId] ? obraEnFecha(porId[f.machineId], f.fecha) || "" : "") }))
    .filter(f => !projectId || f.projectId === projectId)
    .filter(f => (!desde || f.fecha >= desde) && (!hasta || f.fecha <= hasta))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
}

const leer = (empresaId, col) =>
  getDocs(collection(db, "empresas", empresaId, col))
    .then(s => s.docs.map(d => ({ id: d.id, ...d.data() })))
    .catch(() => []);

/** Costos de mantención de una obra en un rango. Trae `total` y `filas`. */
export async function costosMantencionObra(empresaId, projectId, desde, hasta) {
  if (!empresaId) return { total: 0, filas: [] };
  const [eventos, ordenes, maquinas] = await Promise.all([
    leer(empresaId, "maintenanceEvents"),
    leer(empresaId, "workOrders"),
    listarMaquinas(empresaId).catch(() => []),
  ]);
  const filas = costosMantencion({ eventos, ordenes, maquinas }, projectId, desde, hasta);
  return { total: filas.reduce((t, f) => t + f.costo, 0), filas };
}
