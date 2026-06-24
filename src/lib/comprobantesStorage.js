import { storage, db, auth } from "./firebase";
import {
  ref,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
} from "firebase/storage";
import { doc, updateDoc, arrayUnion, arrayRemove } from "firebase/firestore";
import { registrarCambio } from "./deudaAuditoria";

/*
 * ════════════════════════════════════════════════════════════════════════
 *  COMPROBANTES DE DEUDA — Firebase Storage
 * ════════════════════════════════════════════════════════════════════════
 * Primer uso de Storage en FleetCore (storage ya estaba inicializado en
 * firebase.js pero nunca se había usado). Sigue el mismo patrón de manejo
 * de errores que el resto de lib/ (try/catch + console.error + devolver
 * null/false en vez de relanzar, para que la UI decida qué mostrar).
 *
 * Convención de carpetas en el bucket:
 *   empresas/{empresaId}/deuda_comprobantes/{documentoId}/{timestamp}_{nombreArchivo}
 *
 * Cada documento de deuda_proveedores guarda un array `comprobantes`:
 *   [{ url, path, nombre, tipo, tamano, subidoPor, subidoEn }]
 *
 * `path` (la ruta dentro del bucket) se guarda además de `url` porque
 * la URL de descarga puede expirar/rotar — para eliminar el archivo de
 * Storage se necesita el path, no la URL.
 * ════════════════════════════════════════════════════════════════════════
 */

const TIPOS_PERMITIDOS = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
];
const TAMANO_MAXIMO_MB = 15;

export function validarArchivo(file) {
  if (!TIPOS_PERMITIDOS.includes(file.type)) {
    return { ok: false, error: "Solo se aceptan PDF, PNG, JPG o WEBP." };
  }
  if (file.size > TAMANO_MAXIMO_MB * 1024 * 1024) {
    return { ok: false, error: `El archivo supera ${TAMANO_MAXIMO_MB}MB.` };
  }
  return { ok: true };
}

/**
 * Sube un comprobante a Storage y lo registra en el array `comprobantes`
 * del documento en deuda_proveedores. onProgress(pct) es opcional.
 */
export async function subirComprobante({ empresaId, documentoId, file, usuarioEmail, onProgress }) {
  const validacion = validarArchivo(file);
  if (!validacion.ok) return { ok: false, error: validacion.error };

  const timestamp = Date.now();
  const nombreSeguro = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `empresas/${empresaId}/deuda_comprobantes/${documentoId}/${timestamp}_${nombreSeguro}`;

  try {
    const storageRef = ref(storage, path);
    const task = uploadBytesResumable(storageRef, file, { contentType: file.type });

    await new Promise((resolve, reject) => {
      task.on(
        "state_changed",
        (snapshot) => {
          if (onProgress) {
            const pct = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
            onProgress(pct);
          }
        },
        reject,
        resolve
      );
    });

    const url = await getDownloadURL(storageRef);

    const comprobante = {
      url,
      path,
      nombre: file.name,
      tipo: file.type,
      tamano: file.size,
      subidoPor: usuarioEmail || "desconocido",
      subidoEn: new Date().toISOString(),
    };

    const docRef = doc(db, "empresas", empresaId, "deuda_proveedores", documentoId);
    await updateDoc(docRef, {
      comprobantes: arrayUnion(comprobante),
    });

    await registrarCambio({
      empresaId,
      documentoId,
      coleccion: "deuda_proveedores",
      accion: "adjuntar_comprobante",
      campo: "comprobantes",
      valorAnterior: null,
      valorNuevo: comprobante.nombre,
      origen: "manual",
    });

    return { ok: true, comprobante };
  } catch (err) {
    console.error("Error subiendo comprobante:", err);
    return { ok: false, error: "No se pudo subir el archivo. Intenta de nuevo." };
  }
}

/**
 * Elimina un comprobante de Storage Y de la lista en Firestore.
 * Si falla el borrado en Storage (ej. ya no existe el archivo) igual
 * se intenta limpiar la referencia en Firestore para no dejar links rotos.
 */
export async function eliminarComprobante({ empresaId, documentoId, comprobante }) {
  let storageOk = true;
  try {
    await deleteObject(ref(storage, comprobante.path));
  } catch (err) {
    console.error("Error eliminando archivo de Storage (se limpia igual la referencia):", err);
    storageOk = false;
  }

  try {
    const docRef = doc(db, "empresas", empresaId, "deuda_proveedores", documentoId);
    await updateDoc(docRef, {
      comprobantes: arrayRemove(comprobante),
    });

    await registrarCambio({
      empresaId,
      documentoId,
      coleccion: "deuda_proveedores",
      accion: "eliminar_comprobante",
      campo: "comprobantes",
      valorAnterior: comprobante.nombre,
      valorNuevo: null,
      origen: "manual",
    });

    return { ok: true, storageOk };
  } catch (err) {
    console.error("Error eliminando referencia de comprobante en Firestore:", err);
    return { ok: false, error: "No se pudo eliminar el comprobante." };
  }
}

export function formatTamano(bytes) {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
