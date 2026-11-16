/**
 * src/lib/finanzas/leasingMaquinas.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Leasing mensual por máquina para Maquinaria / Rental (Dashboard, Tablero,
 * Rentabilidad), leído de Finanzas → Costos (`costos_fijos` con categoría
 * leasing y `activoVinculadoId`), en pesos con la UF del día. Antes esas
 * pantallas leían solo el campo manual `machines.leasingMensual`, que nadie
 * actualizaba cuando cambiaba la UF o el leasing terminaba. El campo manual
 * queda como respaldo para las máquinas sin leasing vinculado.
 *
 * Solo lectura. Si el usuario no puede leer los costos de Finanzas, devuelve
 * un Map vacío y las pantallas usan el campo manual.
 */
import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebase";
import { obtenerIndicadores } from "./monedas.js";
import { leasingMensualPorMaquina } from "./costosFijos.js";

export async function cargarLeasingPorMaquina(empresaId) {
  if (!empresaId) return new Map();
  try {
    const snap = await getDocs(collection(db, "empresas", empresaId, "costos_fijos"));
    const costos = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (!costos.some(c => c.categoria === "leasing" && c.activoVinculadoId)) return new Map();
    const indicadores = costos.some(c => c.moneda && c.moneda !== "CLP")
      ? await obtenerIndicadores(empresaId).catch(() => null) : null;
    return leasingMensualPorMaquina(costos, indicadores);
  } catch {
    return new Map();
  }
}
