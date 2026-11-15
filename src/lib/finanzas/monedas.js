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
import { hoyISO } from "../fechas";

// Caché por fecha "AAAA-MM-DD". Antes había un solo valor en memoria para
// siempre: una pestaña abierta varios días seguía usando la UF del primer día.
// El valor de "hoy" se descarta cuando cambia el día (en Chile).
let deHoy = null;                 // { dia, valor }
const porFecha = new Map();       // fecha pasada → { uf, dolar, fecha, fuente }

/**
 * { uf, dolar, fecha, fuente: "mindicador" | "guardado" } o null si no hay ningún valor.
 * Con `fecha` ("AAAA-MM-DD") devuelve los valores de ese día (p. ej. la UF con
 * que se emite un estado de pago). Si para esa fecha aún no hay valor
 * publicado (fecha futura) o la fuente no responde, devuelve los de hoy.
 */
export async function obtenerIndicadores(empresaId, fecha) {
  const hoy = hoyISO();
  if (fecha && /^\d{4}-\d{2}-\d{2}$/.test(fecha) && fecha !== hoy) {
    if (porFecha.has(fecha)) return porFecha.get(fecha);
    const enFecha = await indicadoresEnFecha(fecha);
    if (enFecha) {
      if (!enFecha.dolar) enFecha.dolar = (await indicadoresDeHoy(empresaId, hoy))?.dolar ?? null;
      porFecha.set(fecha, enFecha);
      return enFecha;
    }
    // Sin valor publicado para esa fecha: no se guarda en caché (puede publicarse después).
  }
  return indicadoresDeHoy(empresaId, hoy);
}

// mindicador.cl/api/{indicador}/DD-MM-AAAA → { serie: [{ fecha, valor }] } (vacía si no hay valor ese día)
async function valorEnFecha(indicador, fecha) {
  const [a, m, d] = fecha.split("-");
  const r = await fetch(`https://mindicador.cl/api/${indicador}/${d}-${m}-${a}`);
  if (!r.ok) throw new Error(`mindicador ${r.status}`);
  const j = await r.json();
  const v = Number(j?.serie?.[0]?.valor);
  return v > 0 ? v : null;
}

async function indicadoresEnFecha(fecha) {
  try {
    const uf = await valorEnFecha("uf", fecha);
    if (!uf) return null;
    // El dólar no se publica fines de semana ni feriados: puede venir vacío.
    const dolar = await valorEnFecha("dolar", fecha).catch(() => null);
    return { uf, dolar, fecha, fuente: "mindicador" };
  } catch (e) {
    console.warn(`Sin UF del ${fecha} en mindicador.cl:`, e.message);
    return null;
  }
}

async function indicadoresDeHoy(empresaId, hoy) {
  if (deHoy && deHoy.dia === hoy) return deHoy.valor;
  const ref = empresaId ? doc(db, "empresas", empresaId, "flujo_config", "indicadores") : null;
  try {
    const r = await fetch("https://mindicador.cl/api");
    if (!r.ok) throw new Error(`mindicador ${r.status}`);
    const j = await r.json();
    const uf = Number(j?.uf?.valor), dolar = Number(j?.dolar?.valor);
    if (!(uf > 0) || !(dolar > 0)) throw new Error("mindicador sin valores");
    const valor = { uf, dolar, fecha: String(j.uf.fecha || "").slice(0, 10), fuente: "mindicador" };
    deHoy = { dia: hoy, valor };
    if (ref) setDoc(ref, { uf, dolar, fecha: valor.fecha, actualizadoEn: new Date().toISOString() }).catch(() => {});
    return valor;
  } catch (e) {
    console.warn("Sin conexión a mindicador.cl, uso el último valor guardado:", e.message);
    if (!ref) return null;
    try {
      const snap = await getDoc(ref);
      if (snap.exists() && snap.data().uf > 0) {
        // Valor de respaldo: no se fija en caché, para reintentar la fuente en la próxima consulta.
        return { uf: snap.data().uf, dolar: snap.data().dolar, fecha: snap.data().fecha, fuente: "guardado" };
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
