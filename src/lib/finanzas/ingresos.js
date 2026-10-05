/**
 * src/lib/finanzas/ingresos.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Los ingresos salen del flujo de caja: de las cuentas de categoría INGRESOS,
 * que es donde realmente se anotan. (La colección finanzas_ingresos que leían
 * Dashboard, Obras y Reportes nunca se llenó.)
 * Cada monto se asigna al mes del lunes de su semana (para reportes de meses
 * cerrados; una semana que cruza de mes cuenta en el mes en que empieza).
 */
import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebase";

const normal = (s) => String(s || "").toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Z0-9]/g, "");

/**
 * { porMes: { "yyyy-mm": total }, porCuenta: [{ cuenta, porMes }], cuentas }
 * Solo montos positivos de cuentas de ingreso.
 */
export async function cargarIngresosDelFlujo(empresaId) {
  const [snapC, snapP] = await Promise.all([
    getDocs(collection(db, "empresas", empresaId, "flujo_cuentas")),
    getDocs(collection(db, "empresas", empresaId, "flujo_pagos")),
  ]);
  const cuentas = snapC.docs.map(d => ({ id: d.id, ...d.data() })).filter(c => c.categoria === "INGRESOS");
  const porId = new Map(cuentas.map(c => [c.id, { cuenta: c, porMes: {} }]));
  const porMes = {};
  for (const d of snapP.docs) {
    const valor = d.data().valor;
    if (!(valor > 0)) continue;
    const semana = d.id.slice(-10), cuentaId = d.id.slice(0, -11);
    const item = porId.get(cuentaId);
    if (!item || !/^\d{4}-\d{2}-\d{2}$/.test(semana)) continue;
    const mes = semana.slice(0, 7);
    porMes[mes] = (porMes[mes] || 0) + valor;
    item.porMes[mes] = (item.porMes[mes] || 0) + valor;
  }
  return { porMes, porCuenta: [...porId.values()], cuentas };
}

/**
 * ¿La cuenta del flujo es de esta obra? Las cuentas guardan el proyecto como
 * texto libre (proyectoId); se compara contra el código, el nombre y el id del
 * proyecto, sin mayúsculas, tildes ni signos.
 */
export function cuentaEsDeObra(cuenta, proyecto) {
  const p = normal(cuenta.proyectoId);
  if (!p) return false;
  return [proyecto.code, proyecto.codigo, proyecto.name, proyecto.nombre, proyecto.id].some(x => x && normal(x) === p);
}
