import { db, auth } from "./firebase";
import { collection, addDoc, writeBatch, doc } from "firebase/firestore";

/*
 * ════════════════════════════════════════════════════════════════════════
 *  AUDITORÍA DE DEUDA — deuda_auditoria (colección global)
 * ════════════════════════════════════════════════════════════════════════
 * Cada cambio relevante sobre un documento de deuda (creación,
 * actualización, eliminación, adjuntar/quitar comprobante, cambios en
 * acuerdos de pago) genera UNA entrada aquí. Es una colección plana,
 * no una subcolección por documento, para poder responder tanto:
 *   - "¿qué pasó con ESTE documento?"        → query con where('documentoId', '==', x)
 *   - "¿qué cambió hoy en toda la empresa?"  → query con where('empresaId', '==', x) + orderBy(fecha)
 * sin tener que recorrer cada documento de deuda_proveedores uno por uno.
 *
 * Esquema de una entrada:
 *   {
 *     empresaId, documentoId, coleccion: "deuda_proveedores"|"deuda_acuerdos",
 *     accion: "crear" | "actualizar" | "eliminar" | "adjuntar_comprobante" | "eliminar_comprobante",
 *     campo: string | null,        // qué campo cambió (null si es la entidad completa)
 *     valorAnterior: any | null,
 *     valorNuevo: any | null,
 *     usuarioEmail: string,
 *     origen: "importador" | "manual" | "edicion",
 *     fecha: ISO string,
 *   }
 *
 * NOTA DE DISEÑO: registrarCambio() nunca lanza — si falla el log de
 * auditoría, la operación de negocio (guardar el documento) ya se hizo
 * y no debe revertirse ni bloquearse por un problema de logging. Se
 * loguea el error a consola y se sigue.
 * ════════════════════════════════════════════════════════════════════════
 */

function usuarioActual() {
  return auth.currentUser?.email || "desconocido";
}

/**
 * Registra UNA entrada de auditoría. Uso directo para casos simples
 * (comprobantes, eliminación de acuerdo).
 */
export async function registrarCambio({
  empresaId,
  documentoId,
  coleccion,
  accion,
  campo = null,
  valorAnterior = null,
  valorNuevo = null,
  origen = "manual",
}) {
  try {
    await addDoc(collection(db, "empresas", empresaId, "deuda_auditoria"), {
      empresaId,
      documentoId,
      coleccion,
      accion,
      campo,
      valorAnterior,
      valorNuevo,
      usuarioEmail: usuarioActual(),
      origen,
      fecha: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Error registrando auditoría (la operación principal ya se aplicó):", err);
  }
}

/**
 * Compara documentoAnterior vs documentoNuevo campo por campo y registra
 * UNA entrada de auditoría por cada campo que cambió. Pensado para
 * updateDoc/set completos donde no sabes de antemano qué cambió.
 *
 * Ignora campos de control que no son negocio (id, comprobantes — eso
 * tiene su propio log vía adjuntar/eliminar_comprobante).
 */
const CAMPOS_IGNORADOS = new Set(["id", "comprobantes", "claveUpsert"]);

export async function registrarCambiosDocumento({
  empresaId,
  documentoId,
  coleccion,
  documentoAnterior, // null si es creación
  documentoNuevo,
  origen = "manual",
}) {
  const usuarioEmail = usuarioActual();
  const fecha = new Date().toISOString();
  const entradas = [];

  if (!documentoAnterior) {
    // Creación: una sola entrada resumen, no campo por campo
    entradas.push({
      empresaId, documentoId, coleccion,
      accion: "crear", campo: null, valorAnterior: null, valorNuevo: null,
      usuarioEmail, origen, fecha,
    });
  } else {
    const camposRevisar = new Set([...Object.keys(documentoAnterior), ...Object.keys(documentoNuevo)]);
    camposRevisar.forEach((campo) => {
      if (CAMPOS_IGNORADOS.has(campo)) return;
      const anterior = documentoAnterior[campo] ?? null;
      const nuevo = documentoNuevo[campo] ?? null;
      // Comparación simple por valor serializado — suficiente para tipos
      // primitivos (strings, números, booleanos, fechas ISO) que son
      // los que se usan en deuda_proveedores y deuda_acuerdos.
      if (JSON.stringify(anterior) !== JSON.stringify(nuevo)) {
        entradas.push({
          empresaId, documentoId, coleccion,
          accion: "actualizar", campo, valorAnterior: anterior, valorNuevo: nuevo,
          usuarioEmail, origen, fecha,
        });
      }
    });
  }

  if (entradas.length === 0) return;

  try {
    // writeBatch porque puede ser 1 a N entradas (N campos cambiados) por
    // un solo guardado — se escriben juntas, no una por una con N round-trips
    const batch = writeBatch(db);
    entradas.forEach((entrada) => {
      const ref = doc(collection(db, "empresas", empresaId, "deuda_auditoria"));
      batch.set(ref, entrada);
    });
    await batch.commit();
  } catch (err) {
    console.error("Error registrando auditoría de cambios (la operación principal ya se aplicó):", err);
  }
}

/**
 * Auditoría de un borrado completo de documento (ej. eliminarAcuerdo).
 * Guarda el documento completo como valorAnterior para poder
 * reconstruirlo si alguien pregunta "¿qué tenía esto antes de borrarse?".
 */
export async function registrarEliminacion({ empresaId, documentoId, coleccion, documentoEliminado, origen = "manual" }) {
  await registrarCambio({
    empresaId,
    documentoId,
    coleccion,
    accion: "eliminar",
    campo: null,
    valorAnterior: documentoEliminado,
    valorNuevo: null,
    origen,
  });
}
