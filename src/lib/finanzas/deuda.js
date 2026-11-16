/**
 * src/lib/finanzas/deuda.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Agregación pura de la deuda con proveedores (deuda_proveedores), compartida
 * por Finanzas → Deuda y la herramienta deuda_proveedores del agente. Antes el
 * agente sumaba solo saldos positivos y agrupaba por nombre, mientras la
 * pantalla neteaba los anticipos (saldos negativos) y agrupaba por proveedor:
 * el mismo acreedor daba dos cifras.
 *
 * Los documentos deben venir con estado y mora a hoy (conEstadoAlDia).
 */

const num = (v) => Number(v) || 0;

/** Llave del acreedor: su slug de importación, la ficha del maestro o el nombre. */
export const llaveAcreedor = (d) => d?.proveedorSlug || d?.proveedorId || d?.proveedorNombre || "Acreedor";

/**
 * Acreedores con saldo NETO (los anticipos o excedentes, saldo negativo,
 * rebajan), saldo vencido, mora máxima y próximo vencimiento no vencido.
 */
export function agruparDeudaPorAcreedor(documentos = []) {
  const mapa = new Map();
  for (const d of documentos) {
    const key = llaveAcreedor(d);
    if (!mapa.has(key)) {
      mapa.set(key, {
        key, nombre: d.proveedorNombre || "Acreedor", rut: d.rut || "", tipoDeuda: d.tipoDeuda || "proveedor",
        documentos: 0, saldoPendiente: 0, saldoVencido: 0, anticipos: 0, maxDiasMora: 0,
        proximoVencimiento: null, cedidoAFactoring: false, entidadFactoring: null,
      });
    }
    const a = mapa.get(key);
    const saldo = num(d.saldoPendiente);
    a.documentos += 1;
    a.saldoPendiente += saldo;
    if (d.estado === "vencido") a.saldoVencido += saldo;
    if (saldo < 0) a.anticipos += saldo;
    if (num(d.diasMora) > a.maxDiasMora) a.maxDiasMora = num(d.diasMora);
    if (saldo > 0 && d.estado !== "vencido" && d.fechaVencimiento
      && (!a.proximoVencimiento || d.fechaVencimiento < a.proximoVencimiento)) a.proximoVencimiento = d.fechaVencimiento;
    if (d.cedidoAFactoring) { a.cedidoAFactoring = true; a.entidadFactoring = d.entidadFactoring; }
  }
  return [...mapa.values()];
}

/** Totales de la deuda (mismos KPIs que la pantalla Deuda). */
export function totalesDeuda(documentos = []) {
  const t = { saldoTotal: 0, saldoVencido: 0, saldoAnticipos: 0, deudaBruta: 0, montoPagadoTotal: 0, docsVencidos: 0, docsPendientes: 0 };
  for (const d of documentos) {
    const saldo = num(d.saldoPendiente);
    t.saldoTotal += saldo;
    t.montoPagadoTotal += num(d.montoPagado);
    t.deudaBruta += num(d.valorDoc);
    if (d.estado === "vencido") { t.saldoVencido += saldo; t.docsVencidos++; }
    if (d.estado === "pendiente" || d.estado === "parcial") t.docsPendientes++;
    if (d.estado === "anticipo_excedente") t.saldoAnticipos += saldo;
  }
  return t;
}
