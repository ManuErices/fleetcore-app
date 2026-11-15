import { db, auth } from "./firebase";
import { doc, collection, getDoc, updateDoc, getDocs, runTransaction } from "firebase/firestore";
import { registrarCambio } from "./deudaAuditoria";
import { hoyISO, partesISO } from "./fechas";

/*
 * ════════════════════════════════════════════════════════════════════════
 *  PAGOS — registro individual contra un documento de deuda_proveedores
 * ════════════════════════════════════════════════════════════════════════
 * A diferencia del importador (que sobreescribe saldoPendiente/estado con
 * los valores que trae el Excel), esto es para el día a día: "hoy le pagué
 * tanto a este proveedor por esta factura específica".
 *
 * Cada pago se guarda en la subcolección:
 *   deuda_proveedores/{documentoId}/pagos/{pagoId}
 *     { monto, fecha, cuentaOrigen, nota, comprobanteUrl, comprobantePath,
 *       registradoPor, registradoEn }
 *
 * Y recalcula en el documento padre:
 *   montoPagado = suma de todos los pagos de la subcolección
 *   saldoPendiente = valorDoc - montoPagado
 *   estado = recalculado con la MISMA lógica que el importador
 *            (vencido / parcial / pendiente / pagado / anticipo_excedente)
 *
 * REGLA DE NEGOCIO (confirmada con Manu): el monto de un pago nunca puede
 * superar el saldo pendiente actual del documento — se bloquea con error,
 * no se permite que el documento quede en negativo desde este flujo.
 * (Los anticipo_excedente siguen existiendo, pero solo vía importador/Excel,
 * no se generan desde "registrar pago".)
 * ════════════════════════════════════════════════════════════════════════
 */

/**
 * Días de mora a hoy (en Chile), contando días de calendario entre dos
 * "AAAA-MM-DD" (sin horas: no depende de a qué hora se mire).
 */
export function diasMoraDesdeHoy(fechaVencISO, hoy = hoyISO()) {
  const v = partesISO(fechaVencISO), h = partesISO(hoy);
  if (!v || !h) return 0;
  const dias = Math.round((Date.UTC(h.anio, h.mes - 1, h.dia) - Date.UTC(v.anio, v.mes - 1, v.dia)) / 86400000);
  return dias > 0 ? dias : 0;
}

// La misma regla de estado para el importador, los pagos y la pantalla Deuda.
export function calcularEstado(saldoPendiente, valorDoc, diasMora) {
  if (saldoPendiente < 0) return "anticipo_excedente";
  if (saldoPendiente === 0) return "pagado";
  if (diasMora > 0) return "vencido";
  if (saldoPendiente < valorDoc) return "parcial";
  return "pendiente";
}

/**
 * Documento de deuda con diasMora y estado calculados HOY. Los guardados se
 * congelaban en la fecha de importación o del último pago: un documento
 * importado "pendiente" nunca pasaba a "vencido". Se recalcula al leer.
 */
export function conEstadoAlDia(d, hoy = hoyISO()) {
  const saldo = Number(d.saldoPendiente) || 0;
  const diasMora = saldo > 0 ? diasMoraDesdeHoy(d.fechaVencimiento, hoy) : 0;
  return { ...d, diasMora, estado: calcularEstado(saldo, Number(d.valorDoc) || 0, diasMora) };
}

/**
 * Lee la lista de cuentas bancarias configuradas para la empresa.
 * Devuelve [] si no hay ninguna configurada (el formulario debe caer a
 * texto libre en ese caso, no bloquear al usuario).
 */
export async function obtenerCuentasBancarias(empresaId) {
  try {
    const snap = await getDoc(doc(db, "empresas", empresaId, "config", "finanzas"));
    if (!snap.exists()) return [];
    return snap.data().cuentasBancarias || [];
  } catch (err) {
    console.error("Error obteniendo cuentas bancarias:", err);
    return [];
  }
}

/**
 * Agrega una cuenta bancaria nueva a la lista configurada (alta simple,
 * sin pantalla de administración dedicada — se agrega "sobre la marcha"
 * la primera vez que alguien la escribe).
 */
export async function agregarCuentaBancaria(empresaId, nombreCuenta) {
  const nombre = (nombreCuenta || "").trim();
  if (!nombre) return;
  try {
    const ref = doc(db, "empresas", empresaId, "config", "finanzas");
    const snap = await getDoc(ref);
    const actuales = snap.exists() ? (snap.data().cuentasBancarias || []) : [];
    if (actuales.includes(nombre)) return;
    await updateDoc(ref, { cuentasBancarias: [...actuales, nombre] }).catch(async () => {
      // Si el doc no existe aún, updateDoc falla — se crea con setDoc en su lugar
      const { setDoc } = await import("firebase/firestore");
      await setDoc(ref, { cuentasBancarias: [...actuales, nombre] });
    });
  } catch (err) {
    console.error("Error agregando cuenta bancaria:", err);
  }
}

/**
 * Trae todos los pagos registrados de un documento, más recientes primero.
 */
export async function obtenerPagos(empresaId, documentoId) {
  try {
    const snap = await getDocs(collection(db, "empresas", empresaId, "deuda_proveedores", documentoId, "pagos"));
    return snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.fecha || "").localeCompare(a.fecha || ""));
  } catch (err) {
    console.error("Error obteniendo pagos:", err);
    return [];
  }
}

/**
 * Registra un pago nuevo contra un documento y recalcula su saldo/estado.
 * documento = el objeto completo del documento de deuda_proveedores ya
 * cargado en memoria (para no tener que volver a leerlo de Firestore).
 */
export async function registrarPago({ empresaId, documento, monto, fecha, cuentaOrigen, nota, comprobante }) {
  const montoNum = Number(monto);
  if (!montoNum || montoNum <= 0) {
    return { ok: false, error: "El monto debe ser mayor a 0." };
  }
  const fmtPesos = (n) => `$${Number(n || 0).toLocaleString("es-CL")}`;
  if (montoNum > (Number(documento.saldoPendiente) || 0)) {
    return { ok: false, error: `El pago (${fmtPesos(montoNum)}) supera el saldo pendiente (${fmtPesos(documento.saldoPendiente)}).` };
  }

  const usuarioEmail = auth.currentUser?.email || "desconocido";
  const ahora = new Date().toISOString();
  const SUPERA = "supera_saldo";

  try {
    // 1 y 2. Pago y saldo en UNA transacción que relee el documento. Antes se
    // sumaba al montoPagado de la copia en pantalla y se escribía en dos
    // pasos: dos pagos casi simultáneos (dos personas, o un doble clic)
    // dejaban solo uno reflejado en el saldo.
    const docRef = doc(db, "empresas", empresaId, "deuda_proveedores", documento.id);
    const pagoRef = doc(collection(db, "empresas", empresaId, "deuda_proveedores", documento.id, "pagos"));
    const r = await runTransaction(db, async (tx) => {
      const snap = await tx.get(docRef);
      if (!snap.exists()) throw new Error("El documento ya no existe.");
      const actual = snap.data();
      const valorDoc = Number(actual.valorDoc) || 0;
      const saldoAnterior = Number(actual.saldoPendiente) || 0;
      if (montoNum > saldoAnterior) { const e = new Error(SUPERA); e.saldo = saldoAnterior; throw e; }

      const montoPagado = (Number(actual.montoPagado) || 0) + montoNum;
      const saldoPendiente = valorDoc - montoPagado;
      const diasMora = saldoPendiente > 0 ? diasMoraDesdeHoy(actual.fechaVencimiento) : 0;
      const cambios = { montoPagado, saldoPendiente, diasMora, estado: calcularEstado(saldoPendiente, valorDoc, diasMora) };

      tx.set(pagoRef, {
        monto: montoNum,
        fecha: fecha || hoyISO(),     // hoy en Chile (ahora.slice daba el día UTC)
        cuentaOrigen: cuentaOrigen || "",
        nota: nota || "",
        comprobanteUrl: comprobante?.url || null,
        comprobantePath: comprobante?.path || null,
        registradoPor: usuarioEmail,
        registradoEn: ahora,
      });
      tx.update(docRef, cambios);
      return { actual, cambios, saldoAnterior };
    });

    // 3. Auditoría del cambio (mismo patrón que el resto del módulo)
    await registrarCambio({
      empresaId,
      documentoId: documento.id,
      coleccion: "deuda_proveedores",
      accion: "registrar_pago",
      campo: "saldoPendiente",
      valorAnterior: r.saldoAnterior,
      valorNuevo: r.cambios.saldoPendiente,
      origen: "manual",
    });

    return {
      ok: true,
      documentoActualizado: { ...documento, ...r.actual, ...r.cambios },
    };
  } catch (err) {
    if (err?.message === SUPERA) {
      return { ok: false, error: `El pago (${fmtPesos(montoNum)}) supera el saldo pendiente (${fmtPesos(err.saldo)}); alguien registró otro pago entretanto.` };
    }
    console.error("Error registrando pago:", err);
    return { ok: false, error: "No se pudo registrar el pago. Intenta de nuevo." };
  }
}
