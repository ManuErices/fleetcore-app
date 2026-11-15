/**
 * src/lib/finanzas/referencias.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Lógica PURA (sin Firestore) de las referencias que se muestran al lado del
 * flujo de caja: lo que se espera cobrar (estados de pago de Rental y lo
 * facturable a mandantes según Oficina Técnica) y lo que se espera pagar en
 * sueldos, Previred e impuesto único según RRHH.
 *
 * Decisión del usuario: el flujo de caja se llena A MANO. Nada de esto se
 * escribe en `flujo_pagos`; solo se muestra para que quien anota el flujo
 * tenga a la vista lo que dicen los otros módulos. La carga desde Firestore
 * vive en referenciasDatos.js; aquí todo es testeable con node.
 *
 * Semanas: la clave es el lunes "AAAA-MM-DD", la misma que usa la planilla
 * (getWeekColumns en FinanzasFlujoCaja.jsx) para "<cuentaId>-<lunes>".
 */
import { desdeISO, isoLocal, sumarDias, partesISO, limitesMes } from "../fechas.js";

const pad = (n) => String(n).padStart(2, "0");

/** Lunes ("AAAA-MM-DD") de la semana de una fecha "AAAA-MM-DD". */
export function lunesDeISO(iso) {
  const d = desdeISO(iso);
  if (!d) return "";
  const dow = d.getDay();
  d.setDate(d.getDate() + (dow === 0 ? -6 : 1 - dow));
  return isoLocal(d);
}

/** "AAAA-MM" desplazado n meses. */
export function sumarMeses(mes, n) {
  const p = partesISO(`${mes}-01`);
  if (!p) return "";
  const total = p.anio * 12 + (p.mes - 1) + n;
  return `${Math.floor(total / 12)}-${pad((total % 12) + 1)}`;
}

/**
 * Nombre comparable: sin tildes, signos ni sufijos societarios (SpA, Ltda,
 * S.A., EIRL…), para cruzar el cliente de Rental con una cuenta del flujo
 * escrita a mano ("Constructora Pérez" vs "CONSTRUCTORA PEREZ SPA").
 */
const SUFIJOS = new Set(["SPA", "LTDA", "LIMITADA", "SA", "EIRL", "CIA", "Y", "DE", "LA", "EL", "LOS", "LAS"]);
export function nombreComparable(s) {
  const p = String(s || "").toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
  // "S.A." queda como "S A" al final: se quita solo ahí, para no borrar una "A" con sentido
  if (p.length > 2 && p[p.length - 2] === "S" && p[p.length - 1] === "A") p.splice(-2);
  return p.filter(x => !SUFIJOS.has(x)).join(" ");
}

/**
 * ¿El nombre del cliente calza con el texto de la cuenta? Todas las palabras
 * del más corto deben estar en el más largo (así "Pérez" no calza con
 * "Pérez Hermanos" por accidente si la cuenta dice "Hermanos Soto").
 */
export function nombresCalzan(a, b) {
  const x = nombreComparable(a).split(" ").filter(Boolean);
  const y = nombreComparable(b).split(" ").filter(Boolean);
  if (!x.length || !y.length) return false;
  const [corto, largo] = x.length <= y.length ? [x, new Set(y)] : [y, new Set(x)];
  // Una sola palabra de 3 letras o menos ("MPF") es demasiado ambigua salvo que sea igual
  if (corto.length === 1 && corto[0].length <= 3) return x.join(" ") === y.join(" ");
  return corto.every(p => largo.has(p));
}

// ─── Por cobrar: Rental ─────────────────────────────────────────────────────

/**
 * Estados de pago de Rental pendientes de cobro.
 *
 * @param pagos      docs de `rentalPayments` (ya normalizados por listRentalPayments)
 * @param saldoDe    (p) => saldo por cobrar en pesos. En la app es saldoEEPP de
 *                   rental.js (0 si pagado/anulado; en abonado, total − abonos).
 *                   Se recibe como parámetro para no traer Firestore aquí.
 * @param diasPagoDe (clienteId) => días de pago del cliente (30 por defecto)
 *
 * Fecha de cobro: el vencimiento de la factura; si no, el del EEPP; si no
 * hay ninguno, emisión + días de pago del cliente, marcada como estimada.
 */
export function cobrosRental(pagos, { saldoDe, diasPagoDe = () => 30 } = {}) {
  return (pagos || [])
    .filter(p => p && p.estado !== "anulado")
    .map(p => {
      const saldo = Math.round(Number(saldoDe ? saldoDe(p) : p.saldo) || 0);
      let fecha = p.factura?.fechaVencimiento || p.fechaVencimiento || "";
      let estimada = false;
      const emision = p.factura?.fechaEmision || p.fechaEmision || "";
      if (!fecha && emision) {
        const dias = Number(diasPagoDe(p.clienteId));
        fecha = sumarDias(emision, Number.isFinite(dias) && dias >= 0 ? dias : 30);
        estimada = true;
      }
      return {
        id: p.id, origen: "rental",
        cliente: p.clienteNombre || "", clienteId: p.clienteId || null,
        numero: p.numero || "", concepto: p.concepto || p.periodo || "",
        estado: p.estado || "pendiente", factura: p.factura?.numero || "",
        moneda: p.moneda === "UF" ? "UF" : "CLP",
        saldo, fecha, estimada, emision,
      };
    })
    .filter(c => c.saldo > 0)
    .sort((a, b) => String(a.fecha || "9999").localeCompare(String(b.fecha || "9999")));
}

/**
 * Reparte cobros (o pagos) por semana de la planilla.
 * @param items   [{ fecha, saldo|monto, … }]
 * @param semanas claves de las semanas visibles (lunes "AAAA-MM-DD")
 * @param hoy     "AAAA-MM-DD"
 * @returns { porSemana: { lunes: { total, items } }, vencidos, posteriores, sinFecha }
 *   Vencidos: fecha anterior a la semana actual (ya debieron cobrarse; no se
 *   ponen en una semana porque no se sabe cuándo llegarán).
 */
export function agruparPorSemana(items, semanas, hoy) {
  const visibles = new Set(semanas || []);
  const lunesHoy = lunesDeISO(hoy);
  const vacio = () => ({ total: 0, items: [] });
  const r = { porSemana: {}, vencidos: vacio(), posteriores: vacio(), sinFecha: vacio() };
  (items || []).forEach(it => {
    const monto = Number(it.saldo ?? it.monto) || 0;
    let grupo;
    if (!it.fecha) grupo = r.sinFecha;
    else {
      const lunes = lunesDeISO(it.fecha);
      if (lunes < lunesHoy) grupo = r.vencidos;
      else if (visibles.has(lunes)) grupo = (r.porSemana[lunes] ||= vacio());
      else if (lunes > lunesHoy) grupo = r.posteriores;
      else grupo = r.vencidos;
    }
    grupo.total += monto;
    grupo.items.push(it);
  });
  return r;
}

/** Cobros de Rental cuyo cliente calza con la cuenta del flujo (por nombre). */
export function cobrosDeCuenta(cobros, cuenta) {
  if (!cuenta) return [];
  const textos = [cuenta.cliente, cuenta.nombre, cuenta.detalle].filter(Boolean);
  return (cobros || []).filter(c => c.cliente && textos.some(t => nombresCalzan(c.cliente, t)));
}

// ─── Por cobrar: Oficina Técnica (estado de pago al mandante) ───────────────

/**
 * `estadoPagoIngresos` guarda por obra y mes (month 1-12) los montos del
 * estado de pago al mandante: estadosPago, retenciones, reajuste, multas,
 * reajustePolinomico. Se suman con su signo, igual que sumIngresos en
 * PaymentStatus.jsx. No tiene estado de cobro ni fecha de vencimiento, así
 * que se muestra como "facturable del mes", sin semana.
 */
export function totalEstadoPagoIngresos(d) {
  if (!d) return 0;
  return (Number(d.estadosPago) || 0) + (Number(d.retenciones) || 0) + (Number(d.reajuste) || 0)
    + (Number(d.multas) || 0) + (Number(d.reajustePolinomico) || 0);
}

/**
 * @param docs   docs de estadoPagoIngresos
 * @param desde  "AAAA-MM" (inclusive)   @param hasta "AAAA-MM" (inclusive)
 * @param projectId  si viene, solo esa obra
 * @returns [{ mes: "AAAA-MM", projectId, total, estadosPago, retenciones, … }] (más recientes primero)
 */
export function facturableOT(docs, { desde, hasta, projectId } = {}) {
  return (docs || [])
    .map(d => ({ ...d, mes: `${d.year}-${pad(d.month)}`, total: totalEstadoPagoIngresos(d) }))
    .filter(d => d.year && d.month && d.total !== 0)
    .filter(d => (!desde || d.mes >= desde) && (!hasta || d.mes <= hasta))
    .filter(d => !projectId || d.projectId === projectId)
    .sort((a, b) => b.mes.localeCompare(a.mes) || String(a.projectId).localeCompare(String(b.projectId)));
}

// ─── Por pagar: sueldos, Previred e impuesto único (RRHH) ───────────────────

/** Último día del mes "AAAA-MM". */
const finDeMes = (mes) => { const p = partesISO(`${mes}-01`); return limitesMes(p.anio, p.mes).hasta; };

/**
 * Fechas legales de pago de lo devengado en `mes`:
 *  - líquido: último día del mes (si ya hay nómina, la fecha de la nómina);
 *  - Previred (cotizaciones del trabajador + aportes del empleador): día 13
 *    del mes siguiente;
 *  - impuesto único: con el F29, día 20 del mes siguiente (se asume
 *    declaración electrónica; en papel sería el 12).
 */
export function fechasPagoRRHH(mes) {
  const sig = sumarMeses(mes, 1);
  return { liquido: finDeMes(mes), previred: `${sig}-13`, impuestoUnico: `${sig}-20` };
}

/**
 * ¿Qué parte del dinero de RRHH representa una cuenta del flujo? Por nombre,
 * subcategoría o detalle. Devuelve "previred", "impuesto", "sueldos" o null.
 */
export function tipoCuentaRRHH(cuenta) {
  if (!cuenta || cuenta.categoria === "INGRESOS") return null;
  const t = nombreComparable([cuenta.nombre, cuenta.subcategoria, cuenta.detalle].filter(Boolean).join(" "));
  if (/PREVIRED|IMPOSICION|COTIZACION|LEYES SOCIALES|AFP|ISAPRE|FONASA|MUTUAL/.test(t)) return "previred";
  if (/IMPUESTO UNICO|\bIUT\b|SEGUNDA CATEGORIA/.test(t)) return "impuesto";
  if (/SUELDO|REMUNERACION|NOMINA|PLANILLA/.test(t)) return "sueldos";
  return null;
}

/**
 * Resume por mes las filas de liquidaciones calculadas por RRHH
 * (filasPagoRRHH en resumenContable.js) y las nóminas de pago generadas.
 *
 * @param filas    [{ mes: "AAAA-MM", projectId, borrador, liquido, pagado,
 *                    cotizaciones, aportes, asignacionFamiliar, impuestoUnico, anticipos }]
 * @param nominas  docs de nominas_pago { tipo, mes, anio, fecha, total, cantidad }
 * @param meses    ["AAAA-MM", …] a mostrar
 * @param projectId  filtro de obra (opcional)
 *
 * Previred = cotizaciones del trabajador (LRE 5341) + aportes del empleador
 * (5410) − asignación familiar (2311), que el empleador recupera rebajándola
 * de lo que entera (DFL 150).
 *
 * Si un mes aún no tiene liquidaciones, se estima con el último mes anterior
 * que sí tenga (marcado `estimadoCon`), porque a mitad de mes lo normal es
 * que las del mes en curso todavía no estén hechas.
 */
export function resumirSueldos(filas, nominas, meses, { projectId } = {}) {
  const propias = (filas || []).filter(f => !projectId || f.projectId === projectId);
  const sumar = (mes) => {
    const delMes = propias.filter(f => f.mes === mes);
    const s = (k) => Math.round(delMes.reduce((t, f) => t + (Number(f[k]) || 0), 0));
    const liquido = s("liquido");
    const liquidoPagado = Math.round(delMes.filter(f => f.pagado).reduce((t, f) => t + (Number(f.liquido) || 0), 0));
    return {
      liquidaciones: delMes.length,
      borradores: delMes.filter(f => f.borrador).length,
      liquido, liquidoPagado, liquidoPendiente: liquido - liquidoPagado,
      previred: s("cotizaciones") + s("aportes") - s("asignacionFamiliar"),
      impuestoUnico: s("impuestoUnico"),
      anticipos: s("anticipos"),
    };
  };
  const conDatos = [...new Set(propias.map(f => f.mes))].sort();
  return (meses || []).map(mes => {
    let base = sumar(mes);
    let estimadoCon = null;
    if (!base.liquidaciones) {
      const previo = conDatos.filter(m => m < mes).pop();
      if (previo) {
        const e = sumar(previo);
        // En la estimación nada está pagado todavía
        base = { ...e, liquidoPagado: 0, liquidoPendiente: e.liquido, liquidaciones: 0, borradores: 0 };
        estimadoCon = previo;
      }
    }
    const p = partesISO(`${mes}-01`);
    const nominasMes = (nominas || [])
      .filter(n => n && n.tipo !== "anticipo" && Number(n.mes) === p.mes && Number(n.anio) === p.anio)
      .map(n => ({ fecha: n.fechaDia || String(n.fecha || "").slice(0, 10), total: Number(n.total) || 0, cantidad: Number(n.cantidad) || 0 }))
      .sort((a, b) => a.fecha.localeCompare(b.fecha));
    const fechas = fechasPagoRRHH(mes);
    // Si ya se pagó por nómina, la fecha real del líquido es la de la última nómina
    if (nominasMes.length) fechas.liquido = nominasMes[nominasMes.length - 1].fecha || fechas.liquido;
    const pagos = [
      { concepto: "liquido", fecha: fechas.liquido, monto: base.liquidoPendiente },
      { concepto: "previred", fecha: fechas.previred, monto: base.previred },
      { concepto: "impuestoUnico", fecha: fechas.impuestoUnico, monto: base.impuestoUnico },
    ].map(x => ({ ...x, semana: lunesDeISO(x.fecha) }));
    return { mes, ...base, estimadoCon, nominas: nominasMes, fechas, pagos };
  });
}
