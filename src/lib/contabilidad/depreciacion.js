/**
 * src/lib/contabilidad/depreciacion.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Lógica pura de depreciación lineal, compartida por el asiento mensual
 * (ContabilidadDepreciacion) y el F22 (ContabilidadTributario), para que las
 * dos pantallas no vuelvan a calcular cosas distintas.
 *
 *   · Qué se deprecia: solo los bienes de la empresa (propia o crédito
 *     automotriz) que estén activos. Las máquinas arrendadas a terceros no son
 *     activo de la empresa, y las de leasing tampoco se deprecian aquí: las
 *     cuotas del leasing ya se rebajan como gasto (fila Leasing del Flujo
 *     Mensual / cuenta de gasto del leasing). Depreciarlas además sería rebajar
 *     dos veces el mismo bien. → el contador debe confirmar este criterio;
 *     si el bien en leasing se activa (NIIF 16 / criterio financiero), basta con
 *     cambiar DEPRECIAR_LEASING a true.
 *
 *   · Cuánto: cuota mensual = (valor compra − residual) / (vida útil × 12),
 *     desde el mes SIGUIENTE a la compra y hasta completar la vida útil. Un
 *     activo sin fecha de compra NO se deprecia (antes se depreciaba para
 *     siempre): se lista como "sin fecha de compra" para que alguien la ingrese.
 */
import { propiedadNormal, estaActiva } from "../maquinas";
import { partesISO } from "../fechas";

/** Cambiar a true si el contador decide depreciar los bienes en leasing. */
export const DEPRECIAR_LEASING = false;

const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };

/**
 * Por qué una máquina NO entra a la depreciación (null si sí entra).
 * Las fichas sin `ownership` se consideran propias (mismo criterio que esPropia).
 */
export function motivoNoDepreciable(m) {
  if (!estaActiva(m)) return "inactiva";
  const p = propiedadNormal(m?.ownership) || "OWN";
  if (p === "OWN" || p === "CREDITO_AUTO") return null;
  if (p === "LEASING") return DEPRECIAR_LEASING ? null : "leasing";
  if (p === "RENTED") return "arrendada";
  return "otra";   // valor de propiedad no reconocido: se corrige en Admin → Máquinas
}

/** Separa las máquinas en depreciables y excluidas (con conteo por motivo). */
export function clasificarActivos(maquinas = []) {
  const depreciables = [];
  const excluidas = { leasing: 0, arrendada: 0, inactiva: 0, otra: 0 };
  for (const m of maquinas) {
    const motivo = motivoNoDepreciable(m);
    if (motivo) excluidas[motivo] = (excluidas[motivo] || 0) + 1;
    else depreciables.push(m);
  }
  return { depreciables, excluidas };
}

/** Índice absoluto de mes (año × 12 + mes − 1) de "AAAA-MM-DD", "AAAA-MM" o "DD-MM-AAAA". */
export function indiceMes(fecha) {
  const s = String(fecha ?? "").trim();
  let p = partesISO(s);
  if (!p) {
    const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
    if (m) p = { anio: +m[3], mes: +m[2] };
  }
  if (!p || !p.anio || p.mes < 1 || p.mes > 12) return null;
  return p.anio * 12 + (p.mes - 1);
}

/**
 * Depreciación lineal de un activo entre dos períodos "AAAA-MM" (ambos incluidos).
 * Devuelve { monto, meses, motivo, mesN, totalMeses }:
 *   meses   = meses de la ventana que caen dentro de la vida útil.
 *   mesN    = número de mes de vida útil del último mes de la ventana (para mostrar).
 */
export function depreciacionEntre(activo, vidaAnios, desde, hasta) {
  const valor    = num(activo?.valorCompra);
  const residual = num(activo?.valorResidual);
  const anios    = num(vidaAnios);
  if (valor <= 0 || anios <= 0) return { monto: 0, meses: 0, motivo: "Sin valor de compra o vida útil" };
  if (residual >= valor)        return { monto: 0, meses: 0, motivo: "Valor residual ≥ valor de compra" };

  const compra = indiceMes(activo?.fechaCompra);
  if (compra === null) return { monto: 0, meses: 0, motivo: "Sin fecha de compra", sinFecha: true };

  const totalMeses = Math.round(anios * 12);
  const primero = compra + 1;              // mes siguiente a la compra
  const ultimo  = compra + totalMeses;     // último mes de vida útil
  const d = indiceMes(desde), h = indiceMes(hasta);
  if (d === null || h === null || h < d) return { monto: 0, meses: 0, motivo: "Período inválido" };

  const meses = Math.max(0, Math.min(h, ultimo) - Math.max(d, primero) + 1);
  if (meses === 0) {
    return { monto: 0, meses: 0, totalMeses,
      motivo: h < primero ? "Aún no entra en servicio" : "Totalmente depreciado" };
  }
  const cuotaMes = (valor - residual) / totalMeses;
  return {
    monto: Math.round(cuotaMes * meses),
    meses, motivo: null, totalMeses,
    mesN: Math.min(h, ultimo) - compra,
  };
}

/** Depreciación del mes "AAAA-MM". */
export const depreciacionDelMes = (activo, vidaAnios, periodo) =>
  depreciacionEntre(activo, vidaAnios, periodo, periodo);

/** Depreciación del ejercicio `anio` desde enero hasta el mes de corte (1-12). */
export const depreciacionEjercicio = (activo, vidaAnios, anio, mesCorte = 12) =>
  depreciacionEntre(activo, vidaAnios, `${anio}-01`, `${anio}-${String(mesCorte).padStart(2, "0")}`);
