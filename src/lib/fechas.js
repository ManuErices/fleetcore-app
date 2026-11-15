/**
 * src/lib/fechas.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Fechas de calendario en hora de Chile, para toda la app.
 *
 * Dos errores que se repetían:
 *  1. `new Date().toISOString().slice(0, 10)` da la fecha en UTC: en Chile,
 *     desde las 20:00/21:00 ya es "mañana" (un despacho de las 22:00 del 31
 *     quedaba en el mes siguiente). → usar hoyISO() / fechaISO(d).
 *  2. `new Date("2026-11-01")` se interpreta como medianoche UTC, que en
 *     Chile es el 31-10 a las 21:00: getMonth()/getDate() dan el día anterior.
 *     → usar desdeISO("2026-11-01") o partesISO("2026-11-01").
 *
 * Las fechas de calendario se guardan como texto "AAAA-MM-DD". Los instantes
 * (createdAt, fechaCreacion con hora) siguen siendo ISO completos o
 * serverTimestamp: ahí no hay problema de día.
 */

export const ZONA_CHILE = "America/Santiago";

let _fmt = null;
const formateador = () => {
  if (!_fmt) {
    try {
      _fmt = new Intl.DateTimeFormat("en-CA", { timeZone: ZONA_CHILE, year: "numeric", month: "2-digit", day: "2-digit" });
    } catch {
      _fmt = { format: (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` };
    }
  }
  return _fmt;
};

/** Fecha de calendario en Chile ("AAAA-MM-DD") de un instante (Date, ms, Timestamp de Firestore). */
export function fechaISO(valor = new Date()) {
  const d = valor?.toDate ? valor.toDate() : (valor instanceof Date ? valor : new Date(valor));
  if (isNaN(d)) return "";
  return formateador().format(d);
}

/** Hoy en Chile, "AAAA-MM-DD". */
export const hoyISO = () => fechaISO(new Date());

/** "AAAA-MM" del mes actual en Chile. */
export const mesActualISO = () => hoyISO().slice(0, 7);

/** { anio, mes (1-12), dia } de un texto "AAAA-MM-DD" (sin pasar por Date). */
export function partesISO(iso) {
  const m = String(iso ?? "").match(/^(\d{4})-(\d{2})(?:-(\d{2}))?/);
  return m ? { anio: +m[1], mes: +m[2], dia: m[3] ? +m[3] : 1 } : null;
}

/** Date a medianoche LOCAL de un texto "AAAA-MM-DD" (para aritmética de días y getMonth()). */
export function desdeISO(iso) {
  const p = partesISO(iso);
  return p ? new Date(p.anio, p.mes - 1, p.dia) : null;
}

/** "AAAA-MM-DD" de un Date construido en hora local (new Date(a, m, d)). */
export function isoLocal(d) {
  if (!(d instanceof Date) || isNaN(d)) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Suma días a un "AAAA-MM-DD" y devuelve otro "AAAA-MM-DD". */
export function sumarDias(iso, n) {
  const d = desdeISO(iso);
  if (!d) return "";
  d.setDate(d.getDate() + n);
  return isoLocal(d);
}

/** Primer y último día del mes ("AAAA-MM-DD") de un año y mes (1-12). */
export function limitesMes(anio, mes) {
  const ultimo = new Date(anio, mes, 0).getDate();
  const mm = String(mes).padStart(2, "0");
  return { desde: `${anio}-${mm}-01`, hasta: `${anio}-${mm}-${String(ultimo).padStart(2, "0")}` };
}

/** Primer día del mes actual en Chile. */
export const inicioMesISO = () => `${mesActualISO()}-01`;

/**
 * Fecha serial de Excel → "AAAA-MM-DD". El serial es un día de calendario sin
 * zona: se convierte en UTC y se lee en UTC (leerlo en hora local lo corre
 * un día atrás en Chile).
 */
export function serialExcelAISO(serial) {
  const n = Number(serial);
  if (!Number.isFinite(n) || n <= 0) return "";
  const d = new Date(Math.round((n - 25569) * 86400000));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/** Meses ("AAAA-MM") que toca un rango de fechas, en orden. */
export function mesesEntre(desde, hasta) {
  const a = partesISO(desde), b = partesISO(hasta);
  if (!a || !b) return [];
  const salida = [];
  let y = a.anio, m = a.mes;
  while (y < b.anio || (y === b.anio && m <= b.mes)) {
    salida.push(`${y}-${String(m).padStart(2, "0")}`);
    m++; if (m > 12) { m = 1; y++; }
    if (salida.length > 240) break;
  }
  return salida;
}
