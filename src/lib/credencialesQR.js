/**
 * src/lib/credencialesQR.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Credenciales para los QR de acceso rápido de operadores y usuarios.
 *
 * El QR lleva email + contraseña, así que la contraseña tiene que guardarse en
 * algún lado para poder reimprimirlo. Antes quedaba en texto plano en
 * `trabajadores` (que leen todos los operadores) y en `users`. Ahora vive en
 * `empresas/{id}/credenciales_qr/{clave}`, que solo pueden leer el admin y los
 * administrativos de la empresa (firestore.rules).
 *   clave: `trab_<id de la ficha>` para operadores, `user_<uid>` para usuarios.
 */
import { doc, getDoc, setDoc, writeBatch, deleteField, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase";

const ref = (empresaId, clave) => doc(db, "empresas", empresaId, "credenciales_qr", clave);
export const claveOperador = (trabajadorId) => `trab_${trabajadorId}`;
export const claveUsuario = (uid) => `user_${uid}`;

export async function guardarCredencialQR(empresaId, clave, { email, password }) {
  if (!empresaId || !clave || !password) return;
  await setDoc(ref(empresaId, clave), { email: email || "", password, updatedAt: serverTimestamp() }, { merge: true });
}

/** { email, password } o null. */
export async function leerCredencialQR(empresaId, clave) {
  try {
    const snap = await getDoc(ref(empresaId, clave));
    return snap.exists() ? snap.data() : null;
  } catch { return null; }
}

/**
 * Mueve las contraseñas que todavía estén en texto plano en los documentos
 * dados (ficha de trabajador o usuario) a credenciales_qr y las borra de ahí.
 *   items: [{ coleccion: ["empresas", id, "trabajadores", docId] | ["users", uid], clave, email, password }]
 * Devuelve cuántas movió. Silencioso si no hay permiso.
 */
export async function migrarContrasenas(empresaId, items) {
  const pendientes = (items || []).filter(i => i.password);
  for (let k = 0; k < pendientes.length; k += 200) {
    const batch = writeBatch(db);
    pendientes.slice(k, k + 200).forEach(i => {
      batch.set(ref(empresaId, i.clave), { email: i.email || "", password: i.password, migradoEn: serverTimestamp() }, { merge: true });
      batch.update(doc(db, ...i.ruta), { password: deleteField() });
    });
    try { await batch.commit(); } catch (e) { console.warn("No se pudieron mover contraseñas:", e?.code || e?.message); return 0; }
  }
  return pendientes.length;
}
