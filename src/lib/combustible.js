/**
 * src/lib/combustible.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Consumo de combustible por máquina, desde las DOS fuentes que conviven
 * mientras WorkFleet reemplaza al Excel:
 *
 *   · WorkFleet: `reportes_combustible` con tipo "entrega" (lo que se le
 *     despachó a cada máquina en terreno, con firma).
 *   · Excel:     `fuelLogs` (importado en Oficina Técnica → Combustible).
 *
 * Antes las pantallas de Oficina Técnica (Combustible, Dashboard, Consolidado,
 * Estado de pago) leían solo el Excel: lo registrado en WorkFleet no llegaba
 * a los costos. Ahora se leen las dos y un mismo despacho que está en ambas
 * (misma máquina, mismo día, mismos litros) se cuenta una sola vez.
 *
 * Cada consumo trae `fuente`: "workfleet" | "excel" | "ambas", y los de
 * WorkFleet son de solo lectura (se corrigen en WorkFleet).
 */
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "./firebase";
import { listFuelLogsByRange } from "./db";

const TOLERANCIA_LITROS = 1;

/** Entregas de WorkFleet → mismo formato que fuelLogs. */
export function entregasComoConsumos(reportes, { projectId, desde, hasta } = {}) {
  return (reportes || [])
    .filter(r => r.tipo === "entrega")
    .map(r => {
      const e = r.datosEntrega || {};
      return {
        id: `wf_${r.id}`,
        reporteId: r.id,
        machineId: e.machineId || r.machineId || "",
        date: String(e.fecha || r.fecha || r.datosControl?.fecha || "").slice(0, 10),
        liters: Number(e.cantidadLitros ?? r.cantidadLitros) || 0,
        origin: "WorkFleet",
        projectId: r.projectId || r.datosControl?.projectId || "",
        operador: r.operadorNombre || e.receptorNombre || "",
        horometro: e.horometroOdometro ?? null,
        fuente: "workfleet",
        soloLectura: true,
      };
    })
    .filter(c => c.machineId && c.date && c.liters > 0)
    .filter(c => !projectId || c.projectId === projectId)
    .filter(c => (!desde || c.date >= desde) && (!hasta || c.date <= hasta));
}

/**
 * Une Excel y WorkFleet. Un registro del Excel que coincide con una entrega
 * de WorkFleet (máquina, día y litros ±1) es el mismo despacho: queda uno,
 * marcado "ambas".
 */
export function unirConsumos(excel, workfleet) {
  const libres = [...workfleet];
  const salida = (excel || []).map(x => {
    const i = libres.findIndex(w => w.machineId === x.machineId && w.date === x.date
      && Math.abs((w.liters || 0) - (Number(x.liters) || 0)) <= TOLERANCIA_LITROS);
    if (i < 0) return { ...x, fuente: "excel" };
    const [w] = libres.splice(i, 1);
    return { ...x, fuente: "ambas", reporteId: w.reporteId };
  });
  return [...salida, ...libres].sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

/** Consumos de una obra en un rango, de las dos fuentes y sin duplicar. */
export async function listarConsumosCombustible(empresaId, projectId, desde, hasta) {
  const [excel, reportes] = await Promise.all([
    listFuelLogsByRange(empresaId, projectId, desde, hasta),
    getDocs(query(collection(db, "empresas", empresaId, "reportes_combustible"), where("tipo", "==", "entrega")))
      .then(s => s.docs.map(d => ({ id: d.id, ...d.data() })))
      .catch(() => []),
  ]);
  return unirConsumos(excel, entregasComoConsumos(reportes, { projectId, desde, hasta }));
}
