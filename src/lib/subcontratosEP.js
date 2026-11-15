/**
 * src/lib/subcontratosEP.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Estados de pago (EP) de subcontratistas de Oficina Técnica, para mostrarlos
 * como REFERENCIA en el flujo de caja de Finanzas. No escribe nada: el flujo
 * se sigue llenando a mano.
 *
 * La colección `subcontratos` guarda una fila por línea de EP (importada de
 * iConstruye). Aquí se agrupa por contrato (N° SC) y N° EP, y se cruza con el
 * maestro de terceros por `proveedorId` (o por RUT si la fila es anterior a
 * la vinculación).
 */
import { collection, getDocs } from "firebase/firestore";
import { db } from "./firebase";
import { rutLlave } from "./terceros";

/** Filas de subcontratos → EP agrupados { numeroSC, numeroEP, fechaEP, … }. */
export function agruparEPs(filas) {
  const porEP = new Map();
  const saldoSC = new Map();
  (filas || []).forEach(s => {
    const sc = s.numeroSC || "SIN-SC";
    saldoSC.set(sc, Number(s.saldoPorPagarSC) || 0);
    if (!s.numeroEP) return;
    const k = `${sc}|${s.numeroEP}`;
    const e = porEP.get(k) || {
      numeroSC: sc, nombreSC: s.nombreSC || "", numeroEP: s.numeroEP,
      fechaEP: s.fechaEP || "", mesAsociado: s.mesAsociadoManual || s.mesAsociado || "",
      estado: s.estadoDocumento || "", projectId: s.projectId || "",
      proveedorId: s.proveedorId || null,
      rut: s.rutSubcontratista || "", razonSocial: s.razonSocialSubcontratista || "",
      montoEP: 0, totalPagoNeto: 0, retenciones: 0,
    };
    e.montoEP += Number(s.montoEP) || 0;
    e.totalPagoNeto += Number(s.totalPagoNeto) || 0;
    e.retenciones += Number(s.retenciones) || 0;
    if (s.fechaEP && s.fechaEP > e.fechaEP) e.fechaEP = s.fechaEP;
    porEP.set(k, e);
  });
  const eps = [...porEP.values()].sort((a, b) => String(b.fechaEP).localeCompare(String(a.fechaEP)));
  return { eps, saldoSC };
}

export async function cargarSubcontratos(empresaId) {
  const snap = await getDocs(collection(db, "empresas", empresaId, "subcontratos"));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/** EP de un tercero (ficha del maestro), más recientes primero. */
export function epsDeTercero(filas, proveedor) {
  if (!proveedor) return { eps: [], saldoPorPagar: 0 };
  const rut = rutLlave(proveedor.rutNormalizado || proveedor.rut);
  const propias = (filas || []).filter(s =>
    s.proveedorId === proveedor.id || (rut && rutLlave(s.rutSubcontratista) === rut));
  const { eps, saldoSC } = agruparEPs(propias);
  return { eps, saldoPorPagar: [...saldoSC.values()].reduce((t, v) => t + v, 0) };
}

/**
 * Subcontratistas con EP desde `desde` (AAAA-MM-DD), con el total de esos EP.
 * Clave del grupo: RUT (o proveedorId / nombre si no hay RUT).
 */
export function subcontratistasConEPs(filas, desde) {
  const { eps } = agruparEPs(filas);
  const grupos = new Map();
  eps.filter(e => !desde || String(e.fechaEP) >= desde).forEach(e => {
    // Por RUT primero: filas antiguas sin proveedorId son del mismo tercero
    const k = rutLlave(e.rut) || e.proveedorId || e.razonSocial;
    const g = grupos.get(k) || { clave: k, proveedorId: e.proveedorId, rut: e.rut, razonSocial: e.razonSocial, eps: [], total: 0 };
    g.eps.push(e);
    g.total += e.totalPagoNeto;
    if (!g.proveedorId && e.proveedorId) g.proveedorId = e.proveedorId;
    grupos.set(k, g);
  });
  return [...grupos.values()].sort((a, b) => b.total - a.total);
}
