/**
 * src/lib/usoModulos.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Cuántas veces entra cada persona a cada módulo desde el selector, para
 * mostrar primero el que más ocupa. Se guarda en su propia ficha
 * (`users/{uid}.usoModulos.<app> = { n, ultimo }`), así el orden la sigue en
 * cualquier dispositivo; una copia en localStorage permite ordenar al tiro y
 * cubre el caso sin conexión. Las reglas dejan al usuario escribir su ficha
 * mientras no toque rol, módulos, empresas ni estado.
 */
import { doc, updateDoc, increment } from "firebase/firestore";
import { db } from "./firebase";

const llave = (uid) => `usoModulos:${uid}`;

function leerLocal(uid) {
  try { return JSON.parse(localStorage.getItem(llave(uid)) || "{}") || {}; } catch { return {}; }
}

/** Une lo guardado en la ficha con lo local (gana el mayor conteo de cada módulo). */
export function combinarUso(deFicha = {}, uid) {
  const local = uid ? leerLocal(uid) : {};
  const out = {};
  for (const id of new Set([...Object.keys(deFicha || {}), ...Object.keys(local)])) {
    const a = deFicha?.[id] || {}, b = local[id] || {};
    out[id] = {
      n: Math.max(Number(a.n) || 0, Number(b.n) || 0),
      ultimo: String(a.ultimo || "") > String(b.ultimo || "") ? a.ultimo : b.ultimo || a.ultimo || "",
    };
  }
  return out;
}

/** Suma una entrada al módulo. No bloquea ni falla: es solo para ordenar. */
export function registrarUsoModulo(uid, appId) {
  if (!uid || !appId) return;
  const ahora = new Date().toISOString();
  try {
    const local = leerLocal(uid);
    local[appId] = { n: (Number(local[appId]?.n) || 0) + 1, ultimo: ahora };
    localStorage.setItem(llave(uid), JSON.stringify(local));
  } catch { /* sin almacenamiento */ }
  updateDoc(doc(db, "users", uid), {
    [`usoModulos.${appId}.n`]: increment(1),
    [`usoModulos.${appId}.ultimo`]: ahora,
  }).catch(() => { /* sin conexión o sin permiso: queda lo local */ });
}

/**
 * Ordena de más a menos usado. Primero los que la persona puede abrir; a
 * igual uso, el más reciente; sin uso, el orden original de la lista.
 */
export function ordenarPorUso(modulos, uso = {}) {
  return modulos
    .map((m, i) => ({ m, i }))
    .sort((a, b) => {
      if (!!a.m.canAccess !== !!b.m.canAccess) return a.m.canAccess ? -1 : 1;
      const ua = uso[a.m.usoId] || {}, ub = uso[b.m.usoId] || {};
      const dn = (Number(ub.n) || 0) - (Number(ua.n) || 0);
      if (dn) return dn;
      const du = String(ub.ultimo || "").localeCompare(String(ua.ultimo || ""));
      if (du) return du;
      return a.i - b.i;
    })
    .map((x) => x.m);
}
