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

/**
 * Cuenta un turno del asistente para el usuario, en
 * agente_uso/{uid}_{AAAA-MM-DD} (día en Chile). Se escribe con el idToken del
 * usuario: las reglas solo aceptan sumar de a 1 y hasta el tope diario
 * (firestore.rules → match /agente_uso), así que nadie puede reiniciar su
 * contador ni pasarse del tope. Devuelve { ok, n } o { ok:false, limite:true }.
 * Si Firestore falla por otra razón, deja pasar (no se corta el asistente por
 * un problema de red) y lo registra.
 */
export async function contarUsoAgente(idToken, uid) {
  const dia = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date());
  const base = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT}/databases/(default)/documents`;
  const ruta = `agente_uso/${uid}_${dia}`;
  const headers = { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' };
  try {
    const g = await fetch(`${base}/${ruta}`, { headers });
    let n = 0, precondicion = 'currentDocument.exists=false';
    if (g.ok) {
      const d = await g.json();
      n = Number(d.fields?.n?.integerValue || 0);
      precondicion = `currentDocument.updateTime=${encodeURIComponent(d.updateTime)}`;
    } else if (g.status !== 404) {
      console.error('agente_uso lectura:', g.status);
      return { ok: true, n: null };
    }
    const p = await fetch(`${base}/${ruta}?updateMask.fieldPaths=n&${precondicion}`, {
      method: 'PATCH', headers,
      body: JSON.stringify({ fields: { n: { integerValue: String(n + 1) } } }),
    });
    if (p.ok) return { ok: true, n: n + 1 };
    if (p.status === 403) return { ok: false, limite: true, n };
    // 400/409: otra pestaña contó al mismo tiempo; no se bloquea por eso
    console.warn('agente_uso escritura:', p.status);
    return { ok: true, n: null };
  } catch (e) {
    console.error('agente_uso:', e.message);
    return { ok: true, n: null };
  }
}
