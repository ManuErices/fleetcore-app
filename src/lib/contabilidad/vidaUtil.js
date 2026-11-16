/**
 * src/lib/contabilidad/vidaUtil.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Vida útil tributaria (tabla del SII por familia) y resumen de depreciación
 * de un activo, para que Finanzas → Activos / Contabilidad → Activos fijos
 * muestren lo mismo que Contabilidad → Depreciación (que genera el asiento).
 * El cálculo es el de depreciacion.js: lineal, con residual, desde el mes
 * siguiente a la compra y hasta completar la vida útil; leasing y arrendadas
 * no se deprecian.
 */
import {
  motivoNoDepreciable, depreciacionEntre, depreciacionDelMes, depreciacionEjercicio, indiceMes,
} from "./depreciacion.js";

// Tabla del SII, en años. El lookup se hace normalizado porque el campo `tipo`
// de /machines viene en mayúsculas y con nombres operativos ("EXCAVADORA",
// "CAMIÓN COMBUSTIBLE"), no con las claves de esta tabla.
export const VIDA_UTIL_TRIB = {
  maquinaria:  10,
  vehiculo:     7,
  herramienta:  3,
  otro:         5,
};

const norm = (s) => String(s ?? "")
  .normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };

/** Resuelve la familia tributaria de un activo a partir de su tipo o su nombre. */
export function familiaTributaria(activo) {
  const t = norm(activo?.tipo);
  const n = norm(activo?.nombre ?? activo?.name);
  if (VIDA_UTIL_TRIB[t]) return t;

  const texto = `${t} ${n}`;
  const VEHICULO = ["camioneta", "camion", "furgon", "vehiculo", "bus", "minibus",
    "suv", "jeep", "pickup", "van", "hilux", "aljibe"];
  const HERRAMIENTA = ["herramienta", "martillo", "compactador", "generador",
    "soldadora", "placa", "vibro"];
  const MAQUINARIA = ["excavadora", "bulldozer", "cargador", "motoniveladora",
    "retroexcavadora", "grua", "maquinaria", "rodillo", "tolva"];

  if (MAQUINARIA.some(k => texto.includes(k)))   return "maquinaria";
  if (VEHICULO.some(k => texto.includes(k)))     return "vehiculo";
  if (HERRAMIENTA.some(k => texto.includes(k)))  return "herramienta";
  return "otro";
}

export const vidaUtilTributaria = (a) => VIDA_UTIL_TRIB[familiaTributaria(a)];

/** Vida útil en años: la propia del activo o la del SII según su familia. */
export const vidaUtilDe = (a) => num(a?.vidaUtilAnios) || vidaUtilTributaria(a);

/** Por qué no se deprecia, en palabras para la pantalla. */
export const TEXTO_NO_DEPRECIABLE = {
  leasing:   "En leasing: no se deprecia, la cuota ya se rebaja como gasto (fila Leasing).",
  arrendada: "Arrendada a un tercero: no es activo de la empresa.",
  inactiva:  "Inactiva: no entra a la depreciación.",
  otra:      "Propiedad no reconocida: corrígela en Admin → Máquinas.",
};

/**
 * Resumen de depreciación de un activo al mes `mes` ("AAAA-MM"):
 * { depreciable, motivo, motivoTexto, vida, vidaSII, mensual, anual,
 *   acumulada, valorLibro, estado }
 *   mensual   = depreciación del mes (lo que lleva el asiento de ese mes)
 *   anual     = depreciación del ejercicio del año de `mes` (enero–diciembre)
 *   acumulada = desde la compra hasta `mes`, inclusive
 *   valorLibro = valor de compra − acumulada (nunca bajo el residual)
 *   estado    = null o el motivo de depreciacionEntre ("Totalmente depreciado", "Sin fecha de compra"…)
 */
export function resumenDepreciacion(activo, mes) {
  const valor = num(activo?.valorCompra);
  const vida = vidaUtilDe(activo);
  const vidaSII = !num(activo?.vidaUtilAnios);
  const motivo = motivoNoDepreciable(activo);
  const base = { vida, vidaSII, motivo, motivoTexto: motivo ? TEXTO_NO_DEPRECIABLE[motivo] || motivo : null };
  if (motivo) return { ...base, depreciable: false, mensual: 0, anual: 0, acumulada: 0, valorLibro: valor, estado: null };

  const delMes = depreciacionDelMes(activo, vida, mes);
  const anual = depreciacionEjercicio(activo, vida, Number(String(mes).slice(0, 4)), 12).monto;
  let acumulada = 0;
  const compra = indiceMes(activo?.fechaCompra);
  if (compra !== null) {
    const ini = `${Math.floor(compra / 12)}-${String((compra % 12) + 1).padStart(2, "0")}`;
    if (ini <= mes) acumulada = depreciacionEntre(activo, vida, ini, mes).monto;
  }
  const total = depreciacionEntre(activo, vida, "1900-01", "2999-12");
  return {
    ...base, depreciable: true,
    mensual: delMes.monto, anual, acumulada,
    valorLibro: Math.max(num(activo?.valorResidual), valor - acumulada),
    estado: delMes.monto > 0 ? null : (total.sinFecha ? "Sin fecha de compra" : delMes.motivo || total.motivo || null),
  };
}
