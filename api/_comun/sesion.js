// ============================================================
// FLEETCORE — Sesión del usuario en las funciones de Vercel
// api/_comun/sesion.js  (el "_" evita que Vercel lo publique como ruta)
//
// Sin firebase-admin, a propósito (ver api/clientes/extraer-estatutos.js):
//   · El idToken se valida contra Identity Toolkit.
//   · Los documentos se leen con la API REST de Firestore usando el mismo
//     idToken, así que las reglas de seguridad aplican igual que en el
//     navegador: el servidor nunca ve más de lo que el usuario puede ver.
// ============================================================

const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY
  || 'AIzaSyByzRUHnLrxAaZOS9Dap1Kl0ZH5STWWzKE';
const FIREBASE_PROJECT = process.env.FIREBASE_PROJECT_ID || 'mpf-maquinaria';

/** Saca el idToken del header Authorization. */
export function tokenDe(req) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7) : null;
}

/** Valida el idToken contra Firebase. Devuelve { uid, email } o null. */
export async function validarToken(idToken) {
  if (!idToken) return null;
  const r = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_API_KEY}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken }) }
  );
  if (!r.ok) {
    console.error('Token rechazado por Identity Toolkit:', r.status, await r.text());
    return null;
  }
  const usuario = (await r.json())?.users?.[0];
  return usuario ? { uid: usuario.localId, email: usuario.email || '' } : null;
}

// Valor tipado de la API REST → valor JS plano.
function desempacar(v) {
  if (!v) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('nullValue' in v) return null;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(desempacar);
  if ('mapValue' in v) {
    return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, desempacar(x)]));
  }
  return null;
}

/**
 * Lee un documento de Firestore con los permisos del usuario.
 * Devuelve el objeto, null si no existe, o lanza si las reglas lo niegan.
 */
export async function leerDocumento(idToken, ruta) {
  const r = await fetch(
    `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT}/databases/(default)/documents/${ruta}`,
    { headers: { Authorization: `Bearer ${idToken}` } }
  );
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`Firestore negó la lectura de ${ruta} (${r.status}).`);
  const data = await r.json();
  return Object.fromEntries(Object.entries(data.fields || {}).map(([k, v]) => [k, desempacar(v)]));
}
