/**
 * src/lib/finanzas/referenciasDatos.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Carga desde Firestore (SOLO LECTURA) de las referencias que se muestran al
 * lado del flujo de caja: cobros de Rental, estado de pago al mandante de
 * Oficina Técnica y pagos de RRHH. La forma de los datos la arma
 * referencias.js (puro). El flujo se sigue llenando a mano: nada de esto
 * escribe en flujo_pagos ni en ninguna otra colección.
 *
 * Cada carga se guarda 5 minutos en memoria: la tarjeta bajo la planilla y el
 * panel de detalle de una cuenta piden lo mismo, y el motor de RRHH es caro.
 */
import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebase";
import { listRentalPayments, listRentalClients, saldoEEPP } from "../rental";
import { fechaISO } from "../fechas";
import { cobrosRental } from "./referencias";

const cache = new Map();
function enCache(clave, cargar) {
  const previo = cache.get(clave);
  if (previo && Date.now() - previo.t < 5 * 60 * 1000) return previo.v;
  const v = cargar();
  cache.set(clave, { t: Date.now(), v });
  v.catch(() => cache.delete(clave));
  return v;
}

const leer = async (empresaId, nombre) => {
  try {
    const snap = await getDocs(collection(db, "empresas", empresaId, nombre));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch { return []; }   // sin permiso sobre la colección: se muestra vacío
};

/** Estados de pago de Rental con saldo por cobrar, con su fecha esperada. */
export function cargarCobrosRental(empresaId) {
  return enCache(`rental|${empresaId}`, async () => {
    const [pagos, clientes] = await Promise.all([
      listRentalPayments(empresaId).catch(() => []),
      listRentalClients(empresaId, { incluirInactivos: true }).catch(() => []),
    ]);
    const dias = new Map(clientes.map(c => [c.id, c.diasPago ?? 30]));
    return cobrosRental(pagos, { saldoDe: saldoEEPP, diasPagoDe: id => dias.get(id) ?? 30 });
  });
}

/** Docs de estadoPagoIngresos de todas las obras (el filtro de meses y obra lo hace facturableOT). */
export function cargarEstadoPagoIngresos(empresaId) {
  return enCache(`epi|${empresaId}`, () => leer(empresaId, "estadoPagoIngresos"));
}

/**
 * Filas de liquidaciones calculadas por RRHH para los meses pedidos, y las
 * nóminas de pago generadas (con su fecha como día de calendario de Chile:
 * `fecha` se guarda como instante UTC).
 */
export function cargarPagosRRHH(empresaId, meses) {
  return enCache(`rrhh|${empresaId}|${meses.join(",")}`, async () => {
    const { filasPagoRRHH } = await import("../../pages/rrhh/resumenContable");
    const [filas, nominas] = await Promise.all([
      filasPagoRRHH(empresaId, meses).catch(() => []),
      leer(empresaId, "nominas_pago"),
    ]);
    return {
      filas,
      nominas: nominas.map(n => ({ ...n, fechaDia: n.fecha ? fechaISO(n.fecha) : "" })),
    };
  });
}
