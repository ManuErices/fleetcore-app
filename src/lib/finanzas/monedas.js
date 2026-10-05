/**
 * src/lib/finanzas/monedas.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Valor del día de la UF y del dólar, para no sumar UF y dólares como si
 * fueran pesos. Fuente: mindicador.cl (publica los valores del Banco Central).
 * El último valor conocido queda en flujo_config/indicadores, para seguir
 * funcionando si un día la fuente no responde.
 */
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../firebase";

let enMemoria = null;   // { uf, dolar, fecha, fuente } — una consulta por sesión

/** { uf, dolar, fecha, fuente: "mindicador" | "guardado" } o null si no hay ningún valor. */
export async function obtenerIndicadores(empresaId) {
  if (enMemoria) return enMemoria;
  const ref = empresaId ? doc(db, "empresas", empresaId, "flujo_config", "indicadores") : null;
  try {
    const r = await fetch("https://mindicador.cl/api");
    if (!r.ok) throw new Error(`mindicador ${r.status}`);
    const j = await r.json();
    const uf = Number(j?.uf?.valor), dolar = Number(j?.dolar?.valor);
    if (!(uf > 0) || !(dolar > 0)) throw new Error("mindicador sin valores");
    enMemoria = { uf, dolar, fecha: String(j.uf.fecha || "").slice(0, 10), fuente: "mindicador" };
    if (ref) setDoc(ref, { uf, dolar, fecha: enMemoria.fecha, actualizadoEn: new Date().toISOString() }).catch(() => {});
    return enMemoria;
  } catch (e) {
    console.warn("Sin conexión a mindicador.cl, uso el último valor guardado:", e.message);
    if (!ref) return null;
    try {
      const snap = await getDoc(ref);
      if (snap.exists() && snap.data().uf > 0) {
        enMemoria = { uf: snap.data().uf, dolar: snap.data().dolar, fecha: snap.data().fecha, fuente: "guardado" };
        return enMemoria;
      }
    } catch (e2) { console.warn(e2); }
    return null;
  }
}

/**
 * Monto en pesos. Devuelve null si la moneda no es pesos y no hay valor del
 * día: en ese caso es mejor dejarlo fuera de un total que sumarlo mal.
 */
export function aPesos(monto, moneda, indicadores) {
  const m = Number(monto) || 0;
  if (!moneda || moneda === "CLP") return m;
  if (moneda === "UF") return indicadores?.uf ? m * indicadores.uf : null;
  if (moneda === "USD") return indicadores?.dolar ? m * indicadores.dolar : null;
  return null;
}
