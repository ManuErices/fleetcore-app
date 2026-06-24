import { db, auth } from "./firebase";
import { doc, collection, getDoc, addDoc, updateDoc, getDocs } from "firebase/firestore";
import { registrarCambio } from "./deudaAuditoria";

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

function diasMoraDesdeHoy(fechaVencISO) {
  if (!fechaVencISO) return 0;
  const venc = new Date(fechaVencISO + "T12:00:00");
  if (isNaN(venc)) return 0;
  const hoy = new Date();
  const dias = Math.floor((hoy - venc) / 86400000);
  return dias > 0 ? dias : 0;
}

// Misma lógica de estado que FinanzasDeudaImportador.jsx — mantenerlas
// sincronizadas si alguna cambia, son la misma regla de negocio.
function calcularEstado(saldoPendiente, valorDoc, diasMora) {
  if (saldoPendiente < 0) return "anticipo_excedente";
  if (saldoPendiente === 0) return "pagado";
  if (diasMora > 0) return "vencido";
  if (saldoPendiente < valorDoc) return "parcial";
  return "pendiente";
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
  if (montoNum > documento.saldoPendiente) {
    return {
      ok: false,
      error: `El pago ($${montoNum.toLocaleString("es-CL")}) supera el saldo pendiente ($${documento.saldoPendiente.toLocaleString("es-CL")}).`,
    };
  }

  const usuarioEmail = auth.currentUser?.email || "desconocido";
  const ahora = new Date().toISOString();

  try {
    // 1. Crear el registro de pago en la subcolección
    const pagoData = {
      monto: montoNum,
      fecha: fecha || ahora.slice(0, 10),
      cuentaOrigen: cuentaOrigen || "",
      nota: nota || "",
      comprobanteUrl: comprobante?.url || null,
      comprobantePath: comprobante?.path || null,
      registradoPor: usuarioEmail,
      registradoEn: ahora,
    };
    await addDoc(collection(db, "empresas", empresaId, "deuda_proveedores", documento.id, "pagos"), pagoData);

    // 2. Recalcular saldo/estado del documento padre
    const nuevoMontoPagado = (documento.montoPagado || 0) + montoNum;
    const nuevoSaldoPendiente = documento.valorDoc - nuevoMontoPagado;
    const nuevosDiasMora = nuevoSaldoPendiente > 0 ? diasMoraDesdeHoy(documento.fechaVencimiento) : 0;
    const nuevoEstado = calcularEstado(nuevoSaldoPendiente, documento.valorDoc, nuevosDiasMora);

    await updateDoc(doc(db, "empresas", empresaId, "deuda_proveedores", documento.id), {
      montoPagado: nuevoMontoPagado,
      saldoPendiente: nuevoSaldoPendiente,
      diasMora: nuevosDiasMora,
      estado: nuevoEstado,
    });

    // 3. Auditoría del cambio (mismo patrón que el resto del módulo)
    await registrarCambio({
      empresaId,
      documentoId: documento.id,
      coleccion: "deuda_proveedores",
      accion: "registrar_pago",
      campo: "saldoPendiente",
      valorAnterior: documento.saldoPendiente,
      valorNuevo: nuevoSaldoPendiente,
      origen: "manual",
    });

    return {
      ok: true,
      documentoActualizado: {
        ...documento,
        montoPagado: nuevoMontoPagado,
        saldoPendiente: nuevoSaldoPendiente,
        diasMora: nuevosDiasMora,
        estado: nuevoEstado,
      },
    };
  } catch (err) {
    console.error("Error registrando pago:", err);
    return { ok: false, error: "No se pudo registrar el pago. Intenta de nuevo." };
  }
}
