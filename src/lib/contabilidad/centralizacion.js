/**
 * centralizacion.js — src/lib/contabilidad/centralizacion.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Centralización contable de las remuneraciones de un mes (lógica pura, sin
 * Firebase). Recibe los códigos del Libro de Remuneraciones Electrónico ya
 * sumados para el mes (los arma `codigosLREMes` en src/pages/rrhh/
 * resumenContable.js con el mismo motor que la liquidación y el LRE) y el
 * mapeo concepto → cuenta, y devuelve las líneas de UN asiento cuadrado.
 *
 * Asiento (centralización típica en Chile):
 *
 *   DEBE  Remuneraciones (gasto)        5201 − 2311
 *         Leyes sociales (gasto)        5410 (SIS + reforma, AFC empleador,
 *                                             mutual/Ley 16.744, Art. 164…)
 *         Asignación familiar           2311 — la paga el empleador pero la
 *                                             recupera rebajándola de lo que
 *                                             entera en Previred (DFL 150): no
 *                                             es gasto. Se carga a una cuenta
 *                                             "por recuperar" o directamente
 *                                             al pasivo de Previred.
 *   HABER Remuneraciones por pagar      5501 líquido (+ ajuste de redondeo)
 *         AFP por pagar                 3141 + APV (3155-3158) + 4155 (SIS y
 *                                             aportes de la reforma, que se
 *                                             enteran en la AFP) + 4154/4157/4131
 *         Fonasa por pagar / Isapre     3143 + 3144, separados por la
 *                                             previsión de cada trabajador
 *         AFC por pagar                 3151 trabajador + 4151 empleador
 *         Mutual por pagar              4152
 *         Impuesto único por pagar      3161-3165 (IUT, se declara en el F29)
 *         Crédito social CCAF           3110
 *         Anticipos y préstamos         3188 (rebaja la cuenta de activo
 *                                             "anticipos al personal")
 *         Otros descuentos              resto del 5301 (cuotas sindicales,
 *                                             Art. 58, pensión de alimentos…)
 *
 * Cuadratura: Debe = 5201 + 5410; Haber = 5501 + 5301 + 5410. Como el LRE
 * define 5501 = 5201 − 5301, cuadra salvo cuando un líquido negativo se
 * informa en 0 (el LRE no admite montos negativos). Esa diferencia se suma a
 * Remuneraciones por pagar y se informa como `ajuste` para que se vea.
 */

const n = (v) => Math.round(Number(v) || 0);
const s = (c, ...cods) => cods.reduce((t, k) => t + n(c?.[k]), 0);

/**
 * Conceptos del asiento. `patrones` sugieren la cuenta por nombre (primera
 * coincidencia en orden), `tipos` restringen el tipo de cuenta sugerida.
 */
export const CONCEPTOS_CENTRALIZACION = [
  { id: "gasto_remuneraciones", label: "Remuneraciones (gasto)", lado: "debe",
    ayuda: "Total haberes (LRE 5201) sin la asignación familiar",
    tipos: ["costo", "gasto_adm"], patrones: [/remuneraci/i, /mano de obra/i, /sueldo/i] },
  { id: "gasto_leyes_sociales", label: "Leyes sociales (aportes del empleador)", lado: "debe",
    ayuda: "LRE 5410: SIS, aportes de la reforma, AFC empleador, mutual",
    tipos: ["costo", "gasto_adm"], patrones: [/leyes sociales/i, /aporte.*(patronal|empleador)/i, /previsi/i, /remuneraci/i, /mano de obra/i] },
  { id: "asignacion_familiar", label: "Asignación familiar por recuperar", lado: "debe",
    ayuda: "LRE 2311. Se recupera rebajándola de Previred",
    tipos: ["activo_corriente", "pasivo_corriente"], patrones: [/asignaci[oó]n familiar/i, /previred/i, /leyes sociales.*pagar/i, /imposiciones/i] },
  { id: "remuneraciones_por_pagar", label: "Remuneraciones por pagar", lado: "haber",
    ayuda: "Líquido a pagar (LRE 5501)",
    tipos: ["pasivo_corriente"], patrones: [/remuneraciones? (por|x) pagar/i, /sueldos? (por|x) pagar/i] },
  { id: "afp_por_pagar", label: "AFP por pagar", lado: "haber",
    ayuda: "Cotización trabajador + APV + SIS y aportes de la reforma",
    tipos: ["pasivo_corriente"], patrones: [/afp/i, /previred/i, /leyes sociales.*pagar/i, /imposiciones/i] },
  { id: "fonasa_por_pagar", label: "Fonasa por pagar", lado: "haber",
    ayuda: "7% salud de quienes están en Fonasa",
    tipos: ["pasivo_corriente"], patrones: [/fonasa/i, /salud/i, /previred/i, /leyes sociales.*pagar/i, /imposiciones/i] },
  { id: "isapre_por_pagar", label: "Isapre por pagar", lado: "haber",
    ayuda: "Cotización de salud (7% + adicional) de quienes están en Isapre",
    tipos: ["pasivo_corriente"], patrones: [/isapre/i, /salud/i, /previred/i, /leyes sociales.*pagar/i, /imposiciones/i] },
  { id: "afc_por_pagar", label: "Seguro de cesantía (AFC) por pagar", lado: "haber",
    ayuda: "AFC trabajador (3151) + empleador (4151)",
    tipos: ["pasivo_corriente"], patrones: [/cesant/i, /\bafc\b/i, /previred/i, /leyes sociales.*pagar/i, /imposiciones/i] },
  { id: "mutual_por_pagar", label: "Mutual por pagar", lado: "haber",
    ayuda: "Seguro de accidentes Ley 16.744 (4152)",
    tipos: ["pasivo_corriente"], patrones: [/mutual/i, /16\.?744/i, /previred/i, /leyes sociales.*pagar/i, /imposiciones/i] },
  { id: "iut_por_pagar", label: "Impuesto único por pagar", lado: "haber",
    ayuda: "Impuesto único de segunda categoría retenido (3161-3165)",
    tipos: ["pasivo_corriente"], patrones: [/impuesto [uú]nico/i, /\biut\b/i, /segunda categor/i, /retenci[oó]n.*impuesto/i, /impuestos? por pagar/i] },
  { id: "ccaf_por_pagar", label: "Crédito social CCAF por pagar", lado: "haber",
    ayuda: "Descuento crédito social CCAF (3110)",
    tipos: ["pasivo_corriente"], patrones: [/ccaf/i, /caja de compensaci/i, /previred/i] },
  { id: "anticipos", label: "Anticipos y préstamos al personal", lado: "haber",
    ayuda: "Descuentos por anticipos y préstamos (3188): rebajan el activo",
    tipos: ["activo_corriente"], patrones: [/anticipo/i, /pr[eé]stamo.*personal/i, /cuenta corriente.*personal/i] },
  { id: "otros_descuentos", label: "Otros descuentos por pagar", lado: "haber",
    ayuda: "Resto de los descuentos: cuotas sindicales, Art. 58, pensión de alimentos…",
    tipos: ["pasivo_corriente"], patrones: [/otros descuentos/i, /descuentos? (por|x) pagar/i, /retenciones? (por|x) pagar/i, /remuneraciones? (por|x) pagar/i] },
];

/**
 * Montos por concepto desde los códigos LRE sumados del mes. `codigos` puede
 * traer además `saludIsapre` (parte de 3143+3144 de trabajadores en Isapre).
 */
export function montosCentralizacion(codigos = {}) {
  const c = codigos;
  const asigFam = s(c, 2311);
  const saludTotal = s(c, 3143, 3144);
  const saludIsapre = Math.min(saludTotal, n(c.saludIsapre));
  const afpTrab = s(c, 3141, 3155, 3156, 3157, 3158);
  const afcTrab = s(c, 3151);
  const iut = s(c, 3161, 3162, 3163, 3164, 3165);
  const ccaf = s(c, 3110);
  const anticipos = s(c, 3188);
  // Lo que no tiene concepto propio cae en "otros": así la suma de los
  // descuentos del asiento es siempre el 5301 del LRE.
  const otros = s(c, 5301) - afpTrab - saludTotal - afcTrab - iut - ccaf - anticipos;
  return {
    gasto_remuneraciones: s(c, 5201) - asigFam,
    gasto_leyes_sociales: s(c, 5410),
    asignacion_familiar: asigFam,
    remuneraciones_por_pagar: s(c, 5501),
    afp_por_pagar: afpTrab + s(c, 4155, 4154, 4157, 4131),
    fonasa_por_pagar: saludTotal - saludIsapre,
    isapre_por_pagar: saludIsapre,
    afc_por_pagar: afcTrab + s(c, 4151),
    mutual_por_pagar: s(c, 4152),
    iut_por_pagar: iut,
    ccaf_por_pagar: ccaf,
    anticipos,
    otros_descuentos: otros,
  };
}

/**
 * Líneas del asiento de centralización.
 * @param codigos  códigos LRE sumados del mes (+ saludIsapre)
 * @param mapeo    { [conceptoId]: cuentaId }
 * @param cuentas  plan de cuentas (para el nombre de cada línea)
 * @returns { lineas, totalDebe, totalHaber, ajuste, faltan: [conceptoId], montos }
 */
export function construirCentralizacion(codigos, mapeo = {}, cuentas = []) {
  const montos = montosCentralizacion(codigos);
  const debe0 = CONCEPTOS_CENTRALIZACION.filter(k => k.lado === "debe").reduce((t, k) => t + montos[k.id], 0);
  const haber0 = CONCEPTOS_CENTRALIZACION.filter(k => k.lado === "haber").reduce((t, k) => t + montos[k.id], 0);
  // Diferencia (líquidos negativos informados en 0): va a Remuneraciones por
  // pagar, que es donde efectivamente queda la deuda con el trabajador.
  const ajuste = debe0 - haber0;
  montos.remuneraciones_por_pagar += ajuste;

  const lineas = [];
  const faltan = [];
  CONCEPTOS_CENTRALIZACION.forEach(k => {
    const monto = montos[k.id];
    if (!monto) return;
    const cuentaId = mapeo[k.id] || "";
    if (!cuentaId) faltan.push(k.id);
    const cuenta = cuentas.find(c => c.id === cuentaId);
    // Un monto negativo (p. ej. "otros" si el LRE trae un total raro) se
    // registra al lado contrario en vez de como cifra negativa.
    const alDebe = (k.lado === "debe") === (monto > 0);
    lineas.push({
      cuentaId, cuentaNombre: cuenta?.nombre || "",
      debe: alDebe ? Math.abs(monto) : "",
      haber: alDebe ? "" : Math.abs(monto),
      descripcion: k.label + (k.id === "remuneraciones_por_pagar" && ajuste ? ` (incluye ajuste ${ajuste.toLocaleString("es-CL")})` : ""),
      concepto: k.id,
    });
  });
  const totalDebe = lineas.reduce((t, l) => t + (Number(l.debe) || 0), 0);
  const totalHaber = lineas.reduce((t, l) => t + (Number(l.haber) || 0), 0);
  return { lineas, totalDebe, totalHaber, ajuste, faltan, montos };
}

/** Cuenta sugerida por nombre para cada concepto sin mapeo. */
export function sugerirMapeo(cuentas = [], mapeo = {}) {
  const activas = cuentas.filter(c => c.activa !== false);
  const out = { ...mapeo };
  CONCEPTOS_CENTRALIZACION.forEach(k => {
    if (out[k.id] && activas.some(c => c.id === out[k.id])) return;
    // Primero entre las cuentas del tipo esperado (así "Remuneraciones" de
    // gasto no toma "Remuneraciones por pagar"); si ninguna calza, cualquiera.
    const buscar = (filtro) => {
      for (const p of k.patrones) {
        const c = activas.find(c => filtro(c) && p.test(c.nombre || ""));
        if (c) return c;
      }
      return null;
    };
    const elegida = buscar(c => k.tipos.includes(c.tipo)) || buscar(() => true);
    out[k.id] = elegida?.id || "";
  });
  return out;
}

/** Llave de idempotencia del asiento del mes. */
export const hashCentralizacion = (periodo) => `rrhh-centralizacion-${periodo}`;

/** Último día del mes "YYYY-MM" como "YYYY-MM-DD" (fecha del asiento). */
export function finDeMes(periodo) {
  const [y, m] = String(periodo).split("-").map(Number);
  const d = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${periodo}-${String(d).padStart(2, "0")}`;
}
