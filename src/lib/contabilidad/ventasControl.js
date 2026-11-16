/**
 * ventasControl.js — src/lib/contabilidad/ventasControl.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Control (solo lectura) de Ventas: lo que el RCV de ventas dejó en la fila
 * Ingresos del Flujo Mensual contra lo devengado en FleetCore. NO cambia la
 * base imponible: sirve para detectar estados de pago sin factura o facturas
 * en otro mes.
 *
 * Ventas devengadas en FleetCore, por mes:
 *   · Rental de maquinaria (`rentalPayments`): neto en pesos de cada estado
 *     de pago por su `fechaEmision`. Los anulados no cuentan. Los EEPP en UF
 *     también guardan `neto` en pesos (a su `valorUF`), así que se suman tal
 *     cual. Si ya tiene factura se informa su número y, si la factura es de
 *     otro mes, se marca (el RCV la pone en el mes de la factura).
 *   · Oficina Técnica (`estadoPagoIngresos`, uno por obra y mes, month 1-12):
 *     estados de pago + reajuste + reajuste polinómico + multas (las multas se
 *     ingresan con signo y rebajan lo facturado). Las retenciones NO: son
 *     garantía que el mandante retiene, la factura va por el monto completo.
 */

import { indiceClientes, clienteDe, claveCliente, nombreCliente, rutDeCliente } from "../clientesBase.js";

const num = (v) => Number(v) || 0;
const mesDe = (iso) => {
  const m = String(iso || "").match(/^(\d{4})-(\d{2})/);
  return m ? { anio: Number(m[1]), mes: Number(m[2]) - 1 } : null;
};

/** Neto en pesos de un EEPP de Rental (los antiguos solo guardaban `monto` con IVA). */
export function netoEEPPRental(p) {
  if (p?.neto != null) return num(p.neto);
  const total = num(p?.monto);
  return p?.afectoIVA === false ? total : Math.round(total / 1.19);
}

/** Monto facturable de un registro de ingresos de Oficina Técnica. */
// Misma regla que src/lib/costosObra.js (venta bruta, sin retención)
// Misma regla que ventaOT en src/lib/costosObra.js (venta bruta, sin retención).
// Se escribe aquí porque costosObra.js carga Firestore (subcontratosEP) y este
// archivo debe seguir siendo puro (centralizacion.test.js lo prueba con node).
// Antes era `export { ventaOT as ventaEstadoPagoOT } from …`, que no crea el
// nombre local: controlVentas fallaba con ReferenceError.
export function ventaEstadoPagoOT(i) {
  return num(i?.estadosPago) + num(i?.reajuste) + num(i?.reajustePolinomico) + num(i?.multas);
}

/**
 * @param rentalPayments  docs de rentalPayments
 * @param ingresosOT      docs de estadoPagoIngresos
 * @param anio            año a resumir
 * @param ventasRCV       [12] lo que hoy hay en la fila Ingresos (pesos)
 * @param opts.clientes   fichas del maestro de clientes (rentalClients), opcional:
 *                        el cliente de cada EEPP se toma de su ficha (clienteId,
 *                        luego RUT; el nombre escrito solo como respaldo)
 * @returns Array(12) de { mes, rcv, rental, ot, fleetcore, diferencia,
 *   rentalDocs, sinFactura: [{numero, cliente, neto}], facturaOtroMes: [...] }
 */
export function controlVentas(rentalPayments = [], ingresosOT = [], anio, ventasRCV = [], { clientes = [] } = {}) {
  const ix = indiceClientes(clientes);
  const meses = Array.from({ length: 12 }, (_, mes) => ({
    mes, rcv: num(ventasRCV[mes]), rental: 0, ot: 0, rentalDocs: 0,
    sinFactura: [], facturaOtroMes: [],
  }));
  rentalPayments.forEach(p => {
    if (!p || p.estado === "anulado" || p.estado === "borrador") return;
    const f = mesDe(p.fechaEmision);
    if (!f || f.anio !== Number(anio)) return;
    const m = meses[f.mes];
    const neto = netoEEPPRental(p);
    m.rental += neto;
    m.rentalDocs++;
    const fac = p.factura;
    const c = clienteDe(ix, { clienteId: p.clienteId, rut: p.clienteRut || p.clienteManual?.rut, nombre: p.clienteNombre || p.clienteManual?.nombre });
    const ref = {
      numero: p.numero || p.id || "", cliente: c ? nombreCliente(c) : (p.clienteNombre || ""),
      clienteId: c?.id || p.clienteId || null, clienteRut: c ? rutDeCliente(c) : "", neto, factura: fac?.numero || "",
    };
    if (!fac?.numero) m.sinFactura.push(ref);
    else {
      const fm = mesDe(fac.fechaEmision);
      if (fm && (fm.anio !== f.anio || fm.mes !== f.mes)) m.facturaOtroMes.push({ ...ref, mesFactura: fm });
    }
  });
  ingresosOT.forEach(i => {
    if (Number(i?.year) !== Number(anio)) return;
    const mes = Number(i.month) - 1;
    if (!(mes >= 0 && mes < 12)) return;
    meses[mes].ot += ventaEstadoPagoOT(i);
  });
  return meses.map(m => {
    const fleetcore = Math.round(m.rental + m.ot);
    return { ...m, rental: Math.round(m.rental), ot: Math.round(m.ot), fleetcore, diferencia: Math.round(m.rcv - fleetcore) };
  });
}

/**
 * Ventas devengadas en FleetCore por cliente en el año (para la hoja Control
 * de ventas). El cliente se resuelve contra el maestro (rentalClients):
 *   · Rental: el `clienteId` del EEPP (o su RUT; el nombre solo de respaldo).
 *   · Oficina Técnica: el cliente es el de la OBRA (`project.clienteId`); si
 *     la obra aún no está vinculada, su texto `mandante` (por nombre).
 * @returns [{ clave, clienteId, rut, nombre, rental, ot, total, sinFicha }]
 *   ordenado de mayor a menor. `sinFicha`: no se encontró en el maestro.
 */
export function ventasPorCliente(rentalPayments = [], ingresosOT = [], anio, { clientes = [], proyectos = [] } = {}) {
  const ix = indiceClientes(clientes);
  const obras = new Map((proyectos || []).map(p => [p.id, p]));
  const por = new Map();
  const sumar = (datos, k, monto) => {
    const c = claveCliente(ix, datos);
    const e = por.get(c.clave) || { ...c, rental: 0, ot: 0 };
    e[k] += monto;
    por.set(c.clave, e);
  };
  rentalPayments.forEach(p => {
    if (!p || p.estado === "anulado" || p.estado === "borrador") return;
    const f = mesDe(p.fechaEmision);
    if (!f || f.anio !== Number(anio)) return;
    sumar({ clienteId: p.clienteId, rut: p.clienteRut || p.clienteManual?.rut, nombre: p.clienteNombre || p.clienteManual?.nombre }, "rental", netoEEPPRental(p));
  });
  ingresosOT.forEach(i => {
    if (Number(i?.year) !== Number(anio)) return;
    const mes = Number(i.month) - 1;
    if (!(mes >= 0 && mes < 12)) return;
    const obra = obras.get(i.projectId);
    sumar({ clienteId: obra?.clienteId, nombre: obra?.mandante }, "ot", ventaEstadoPagoOT(i));
  });
  return [...por.values()]
    .map(e => ({ ...e, rental: Math.round(e.rental), ot: Math.round(e.ot), total: Math.round(e.rental + e.ot), sinFicha: !e.clienteId }))
    .filter(e => e.total !== 0)
    .sort((a, b) => b.total - a.total);
}
