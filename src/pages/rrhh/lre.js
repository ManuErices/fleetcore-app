/**
 * lre.js — src/pages/rrhh/lre.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Libro de Remuneraciones Electrónico (Art. 62 CT).
 *
 * Obligatorio para empleadores con 5 o más trabajadores. Reemplaza íntegra e
 * irrevocablemente al Libro Auxiliar de Remuneraciones desde el primer día del
 * año calendario de incorporación. Se declara en el portal Mi DT antes de la
 * medianoche del día 15 del mes siguiente a aquel en que se pagó la
 * remuneración; si cae domingo o festivo, corre al día hábil siguiente.
 *
 * Requisitos del archivo, según el Manual de Usuarios del LRE (v8.0, DT):
 *
 *   · Nombre: rutempleador_aaaamm  (extensión .csv o .txt)
 *   · Delimitador: punto y coma «;»
 *   · Codificación: ANSI — NO UTF-8. Un archivo UTF-8 se rechaza.
 *   · Headers obligatorios con el nombre exacto de cada concepto.
 *   · No se puede eliminar ni agregar columnas. Los campos opcionales que no
 *     apliquen van vacíos, pero la columna tiene que estar.
 *   · Montos: numéricos, positivos y enteros. Sin separador de miles.
 *   · Fechas: dd/mm/aaaa.
 *   · RUT: entre 9 y 10 caracteres con guion y DV, sin puntos y sin ceros
 *     a la izquierda. Ej: 12345678-9.
 *   · Decimales solo en 1115, 1116 y 1132, con coma.
 *
 * Base normativa: Art. 62 CT, Dictamen ORD N° 877/006 (2021) DT,
 * Res. Ex. N° 285 (2021) DT, Res. Ex. N° 29 (2021) SII, Decreto N° 14 (2023)
 * del Ministerio del Trabajo.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Tablas de validación (Anexo N°2 del manual)
// ─────────────────────────────────────────────────────────────────────────────

/** Causal de término (cód 1104). Mapea desde CAUSALES_TERMINO de shared.jsx. */
export const COD_CAUSAL = {
  '159-1': 3,  '159-2': 4,  '159-3': 5,  '159-4': 6,  '159-5': 7,  '159-6': 8,
  '160-1': 24, '160-3': 26, '160-4': 27, '160-7': 16,
  '161':   18, '161-2': 19, '163bis': 20,
};

/** Región de prestación de los servicios (cód 1105). */
export const REGIONES = [
  { cod: 15, nombre: 'Arica y Parinacota' },
  { cod: 1,  nombre: 'Tarapacá' },
  { cod: 2,  nombre: 'Antofagasta' },
  { cod: 3,  nombre: 'Atacama' },
  { cod: 4,  nombre: 'Coquimbo' },
  { cod: 5,  nombre: 'Valparaíso' },
  { cod: 13, nombre: 'Metropolitana' },
  { cod: 6,  nombre: "Libertador General Bernardo O'Higgins" },
  { cod: 7,  nombre: 'Maule' },
  { cod: 16, nombre: 'Ñuble' },
  { cod: 8,  nombre: 'Biobío' },
  { cod: 9,  nombre: 'Araucanía' },
  { cod: 14, nombre: 'Los Ríos' },
  { cod: 10, nombre: 'Los Lagos' },
  { cod: 11, nombre: 'Aysén' },
  { cod: 12, nombre: 'Magallanes' },
];

/** Tipo de impuesto a la renta (cód 1170). */
export const TIPO_IMPUESTO = {
  1: 'Impuesto de Segunda Categoría',
  2: 'Impuesto Único Obrero Agrícola',
  3: 'Impuesto Adicional',
};

/**
 * Código tipo de jornada (cód 1107). Ojo: NO es el mismo catálogo que usa
 * Previred — acá se declara el artículo del Código del Trabajo que rige la
 * jornada, no su duración. Los turnos de faena van como jornada excepcional
 * del Art. 38 inciso final, que es la que autoriza la DT.
 */
export const COD_JORNADA_LRE = {
  'Completa (42 hrs)': 101,  // Ordinaria - Art. 22
  'Completa (44 hrs)': 101,
  'Completa (45 hrs)': 101,
  'Parcial (30 hrs)':  201,  // Parcial - Art. 40 bis
  'Parcial (20 hrs)':  201,
  'Turno 7x7':         601,  // Jornada excepcional - Art. 38 inciso final
  'Turno 14x14':       601,
  'Turno 4x3':         601,
  'Otro':              101,
};

/** AFP (cód 1141). Códigos propios del LRE, distintos a los de Previred. */
export const COD_AFP_LRE = {
  'ProVida': 6, 'PlanVital': 11, 'Cuprum': 13, 'Habitat': 14,
  'Uno': 19, 'Capital': 31, 'Modelo': 103,
};
export const AFP_SIN_AFP = 100;   // "No está en AFP"

/** Fonasa / Isapre (cód 1143). */
export const COD_SALUD_LRE = {
  'Fonasa': 102, 'FONASA': 102,
  'Cruz Blanca': 1, 'Banmédica': 3, 'Colmena': 4, 'Consalud': 9,
  'Vida Tres': 12, 'Nueva Masvida': 43, 'Masvida': 43, 'Esencial': 44,
};
export const SALUD_SIN_ISAPRE = 99;

/** CCAF (cód 1110). */
export const COD_CCAF = {
  0: 'No', 1: 'Los Andes', 2: 'La Araucana', 3: 'Los Héroes', 4: '18 de Septiembre',
};

/** Organismo administrador Ley 16.744 (cód 1152). */
export const COD_MUTUAL = {
  0: 'Sin mutual / Instituto de Seguridad Laboral',
  1: 'Asociación Chilena de Seguridad (ACHS)',
  2: 'Mutual de Seguridad CChC',
  3: 'Instituto de Seguridad del Trabajo (IST)',
};

/** Tramo asignación familiar (cód 1114). 'S' = sin información. */
export const TRAMOS_AF_LRE = ['A', 'B', 'C', 'D', 'S'];

// ─────────────────────────────────────────────────────────────────────────────
// Estructura del archivo
// ─────────────────────────────────────────────────────────────────────────────
//
// El orden y el nombre de las columnas son los del Anexo N°1 del manual y NO
// pueden alterarse. `req` marca los obligatorios: si uno queda vacío, la DT
// rechaza el archivo completo en la validación de forma.

export const COLUMNAS_LRE = [
  // ── Categoría 1: Identificación del trabajador ──
  { cod: 1101, nombre: 'Rut trabajador', req: true },
  { cod: 1102, nombre: 'Fecha inicio contrato', req: true },
  { cod: 1103, nombre: 'Fecha de término de contrato' },
  { cod: 1104, nombre: 'Causal de término del contrato' },
  { cod: 1105, nombre: 'Región de prestación de los servicios', req: true },
  { cod: 1106, nombre: 'Comuna de prestación de los servicios', req: true },
  { cod: 1170, nombre: 'Tipo de impuesto a la renta', req: true },
  { cod: 1146, nombre: 'Técnico extranjero exención de cotizaciones previsionales (ley 18.156)', req: true },
  { cod: 1107, nombre: 'Código tipo de jornada', req: true },
  { cod: 1108, nombre: 'Persona con discapacidad/pensionado por invalidez', req: true },
  { cod: 1109, nombre: 'Pensionado por vejez', req: true },
  { cod: 1141, nombre: 'AFP', req: true },
  { cod: 1142, nombre: 'IPS (ExINP)', req: true },
  { cod: 1143, nombre: 'FONASA / ISAPRE', req: true },
  { cod: 1151, nombre: 'AFC', req: true },
  { cod: 1110, nombre: 'CCAF', req: true },
  { cod: 1152, nombre: 'Org. administrador ley 16.744', req: true },
  { cod: 1111, nombre: 'Número cargas familiares legales autorizadas' },
  { cod: 1112, nombre: 'Número de cargas familiares maternales' },
  { cod: 1113, nombre: 'Número de cargas familiares invalidez' },
  { cod: 1114, nombre: 'Tramo asignación familiar' },
  { cod: 1171, nombre: 'Rut organización sindical 1' },
  { cod: 1172, nombre: 'Rut organización sindical 2' },
  { cod: 1173, nombre: 'Rut organización sindical 3' },
  { cod: 1174, nombre: 'Rut organización sindical 4' },
  { cod: 1175, nombre: 'Rut organización sindical 5' },
  { cod: 1176, nombre: 'Rut organización sindical 6' },
  { cod: 1177, nombre: 'Rut organización sindical 7' },
  { cod: 1178, nombre: 'Rut organización sindical 8' },
  { cod: 1179, nombre: 'Rut organización sindical 9' },
  { cod: 1180, nombre: 'Rut organización sindical 10' },
  { cod: 1115, nombre: 'Número días trabajados en el mes', req: true },
  { cod: 1116, nombre: 'Número días de licencia médica en el mes' },
  { cod: 1117, nombre: 'Número días de vacaciones en el mes' },
  { cod: 1118, nombre: 'Subsidio trabajador joven', req: true },
  { cod: 1154, nombre: 'Puesto trabajo pesado' },
  { cod: 1155, nombre: 'Ahorro previsional voluntario individual', req: true },
  { cod: 1157, nombre: 'Ahorro previsional voluntario colectivo', req: true },
  { cod: 1131, nombre: 'Indemnización a todo evento (Art. 164)', req: true },
  { cod: 1132, nombre: 'Tasa indemnización a todo evento (Art. 164)' },

  // ── Categoría 2.1: Haberes imponibles y tributables ──
  { cod: 2101, nombre: 'Sueldo', req: true },
  { cod: 2102, nombre: 'Sobresueldo' },
  { cod: 2103, nombre: 'Comisiones (mensual)' },
  { cod: 2104, nombre: 'Semana corrida mensual (Art. 45)' },
  { cod: 2105, nombre: 'Participación (mensual)' },
  { cod: 2106, nombre: 'Gratificación (mensual)' },
  { cod: 2107, nombre: 'Recargo 30% día domingo (Art. 38)' },
  { cod: 2108, nombre: 'Remuneración variable pagada en vacaciones (Art. 71)' },
  { cod: 2109, nombre: 'Remuneración variable pagada en clausura (Art. 38 DFL 2)' },
  { cod: 2110, nombre: 'Aguinaldo' },
  { cod: 2111, nombre: 'Bonos u otras remuneraciones fijas mensuales' },
  { cod: 2112, nombre: 'Tratos (mensual)' },
  { cod: 2113, nombre: 'Bonos u otras remuneraciones variables mensuales o superiores a un mes' },
  { cod: 2114, nombre: 'Ejercicio opción no pactada en contrato (Art. 17 N°8 LIR)' },
  { cod: 2115, nombre: 'Beneficios en especie constitutivos de remuneración' },
  { cod: 2116, nombre: 'Remuneraciones bimestrales (devengo en dos meses)' },
  { cod: 2117, nombre: 'Remuneraciones trimestrales (devengo en tres meses)' },
  { cod: 2118, nombre: 'Remuneraciones cuatrimestral (devengo en cuatro meses)' },
  { cod: 2119, nombre: 'Remuneraciones semestrales (devengo en seis meses)' },
  { cod: 2120, nombre: 'Remuneraciones anuales (devengo en doce meses)' },
  { cod: 2121, nombre: 'Participación anual (devengo en doce meses)' },
  { cod: 2122, nombre: 'Gratificación anual (devengo en doce meses)' },
  { cod: 2123, nombre: 'Otras remuneraciones superiores a un mes' },
  { cod: 2124, nombre: 'Pago por horas de trabajo sindical' },
  { cod: 2161, nombre: 'Sueldo empresarial' },

  // ── Categoría 2.2: Haberes imponibles y no tributables ──
  { cod: 2201, nombre: 'Subsidio por incapacidad laboral por licencia médica - total mensual' },
  { cod: 2202, nombre: 'Beca de estudio (Art. 17 N°18 LIR)' },
  { cod: 2203, nombre: 'Gratificaciones de zona (Art. 17 N°27)' },
  { cod: 2204, nombre: 'Otros ingresos no constitutivos de renta (Art. 17 N°29 LIR)' },

  // ── Categoría 2.3: Haberes no imponibles y no tributables ──
  { cod: 2301, nombre: 'Colación total mensual (Art. 41)' },
  { cod: 2302, nombre: 'Movilización total mensual (Art. 41)' },
  { cod: 2303, nombre: 'Viáticos total mensual (Art. 41)' },
  { cod: 2304, nombre: 'Asignación de pérdida de caja total mensual (Art. 41)' },
  { cod: 2305, nombre: 'Asignación de desgaste herramienta total mensual (Art. 41)' },
  { cod: 2311, nombre: 'Asignación familiar legal total mensual (Art. 41)' },
  { cod: 2306, nombre: 'Gastos por causa del trabajo (Art. 41)' },
  { cod: 2307, nombre: 'Gastos por cambio de residencia (Art. 53)' },
  { cod: 2308, nombre: 'Sala cuna (Art. 203)' },
  { cod: 2309, nombre: 'Asignación trabajo a distancia o teletrabajo' },
  { cod: 2347, nombre: 'Depósito convenido hasta UF 900' },
  { cod: 2310, nombre: 'Alojamiento por razones de trabajo (Art. 17 N°14 LIR)' },
  { cod: 2312, nombre: 'Asignación de traslación (Art. 17 N°15 LIR)' },
  { cod: 2313, nombre: 'Indemnización por feriado legal' },
  { cod: 2314, nombre: 'Indemnización años de servicio' },
  { cod: 2315, nombre: 'Indemnización sustitutiva del aviso previo' },
  { cod: 2316, nombre: 'Indemnización fuero maternal (Art. 163 bis)' },
  { cod: 2331, nombre: 'Indemnización a todo evento (Art. 164)' },

  // ── Categoría 2.4: Haberes no imponibles y tributables ──
  { cod: 2417, nombre: 'Indemnizaciones voluntarias tributables' },
  { cod: 2418, nombre: 'Indemnizaciones contractuales tributables' },

  // ── Categoría 3: Descuentos ──
  { cod: 3141, nombre: 'Cotización obligatoria previsional (AFP o IPS)', req: true },
  { cod: 3143, nombre: 'Cotización obligatoria salud 7%', req: true },
  { cod: 3144, nombre: 'Cotización voluntaria para salud' },
  { cod: 3151, nombre: 'Cotización AFC - trabajador' },
  { cod: 3146, nombre: 'Cotizaciones técnico extranjero para seguridad social fuera de Chile' },
  { cod: 3147, nombre: 'Descuento depósito convenido hasta UF 900 anual' },
  { cod: 3155, nombre: 'Cotización ahorro previsional voluntario individual modalidad A' },
  { cod: 3156, nombre: 'Cotización ahorro previsional voluntario individual modalidad B hasta UF 50' },
  { cod: 3157, nombre: 'Cotización ahorro previsional voluntario colectivo modalidad A' },
  { cod: 3158, nombre: 'Cotización ahorro previsional voluntario colectivo modalidad B hasta UF 50' },
  { cod: 3161, nombre: 'Impuesto retenido por remuneraciones', req: true },
  { cod: 3162, nombre: 'Impuesto retenido por indemnizaciones' },
  { cod: 3163, nombre: 'Mayor retención de impuestos solicitada por el trabajador' },
  { cod: 3164, nombre: 'Impuesto retenido por reliquidación remuneraciones devengadas en otros períodos' },
  { cod: 3165, nombre: 'Diferencia de impuesto por reliquidación remuneraciones devengadas en este período' },
  { cod: 3166, nombre: 'Retención préstamo clase media 2020 (Ley 21.252)' },
  { cod: 3167, nombre: 'Rebaja zona extrema DL 889' },
  { cod: 3171, nombre: 'Cuota sindical 1' },
  { cod: 3172, nombre: 'Cuota sindical 2' },
  { cod: 3173, nombre: 'Cuota sindical 3' },
  { cod: 3174, nombre: 'Cuota sindical 4' },
  { cod: 3175, nombre: 'Cuota sindical 5' },
  { cod: 3176, nombre: 'Cuota sindical 6' },
  { cod: 3177, nombre: 'Cuota sindical 7' },
  { cod: 3178, nombre: 'Cuota sindical 8' },
  { cod: 3179, nombre: 'Cuota sindical 9' },
  { cod: 3180, nombre: 'Cuota sindical 10' },
  { cod: 3110, nombre: 'Crédito social CCAF' },
  { cod: 3181, nombre: 'Cuota vivienda o educación (Art. 58)' },
  { cod: 3182, nombre: 'Crédito cooperativas de ahorro (Art 54. Ley Coop.)' },
  { cod: 3183, nombre: 'Otros descuentos autorizados y solicitados por el trabajador' },
  { cod: 3154, nombre: 'Cotización adicional trabajo pesado - trabajador' },
  { cod: 3184, nombre: 'Donaciones culturales y de reconstrucción' },
  { cod: 3185, nombre: 'Otros descuentos (Art. 58)' },
  { cod: 3186, nombre: 'Pensiones de alimentos' },
  { cod: 3187, nombre: 'Descuento mujer casada (Art. 59)' },
  { cod: 3188, nombre: 'Descuentos por anticipos y préstamos' },

  // ── Categoría 4: Aportes del empleador ──
  { cod: 4151, nombre: 'Aporte AFC - empleador' },
  { cod: 4152, nombre: 'Aporte empleador seguro accidentes del trabajo y Ley SANNA (Ley 16.744)', req: true },
  { cod: 4131, nombre: 'Aporte empleador indemnización a todo evento (Art. 164)' },
  { cod: 4154, nombre: 'Aporte adicional trabajo pesado - empleador' },
  { cod: 4155, nombre: 'Aporte empleador seguro invalidez y sobrevivencia', req: true },
  { cod: 4157, nombre: 'Aporte empleador ahorro previsional voluntario colectivo' },

  // ── Categoría 5: Totales ──
  { cod: 5201, nombre: 'Total haberes', req: true },
  { cod: 5210, nombre: 'Total haberes imponibles y tributables', req: true },
  { cod: 5220, nombre: 'Total haberes imponibles no tributables', req: true },
  { cod: 5230, nombre: 'Total haberes no imponibles y no tributables', req: true },
  { cod: 5240, nombre: 'Total haberes no imponibles y tributables', req: true },
  { cod: 5301, nombre: 'Total descuentos', req: true },
  { cod: 5361, nombre: 'Total descuentos impuestos a las remuneraciones', req: true },
  { cod: 5362, nombre: 'Total descuentos impuestos por indemnizaciones' },
  { cod: 5341, nombre: 'Total descuentos por cotizaciones del trabajador', req: true },
  { cod: 5302, nombre: 'Total otros descuentos', req: true },
  { cod: 5410, nombre: 'Total aportes empleador', req: true },
  { cod: 5501, nombre: 'Total líquido', req: true },
  { cod: 5502, nombre: 'Total indemnizaciones' },
  { cod: 5564, nombre: 'Total indemnizaciones tributables', req: true },
  { cod: 5565, nombre: 'total indemnizaciones no tributables' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Formateo
// ─────────────────────────────────────────────────────────────────────────────

/** RUT sin puntos, con guion y DV, sin ceros a la izquierda. */
export function rutLRE(rut) {
  const limpio = String(rut || '').replace(/[.\s]/g, '').toUpperCase();
  const m = limpio.match(/^0*(\d+)-?([\dK])$/);
  return m ? `${m[1]}-${m[2]}` : '';
}

/** 'YYYY-MM-DD' → 'dd/mm/aaaa'. Devuelve '' si no hay fecha. */
export function fechaLRE(iso) {
  const s = String(iso || '').slice(0, 10);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

/** Monto entero y positivo. 0 se informa como 0, no como vacío. */
const monto = (n) => String(Math.max(0, Math.round(Number(n) || 0)));

/** Decimal con coma, solo para 1115, 1116 y 1132. */
const decimal = (n) => String(Number(n) || 0).replace('.', ',');

// ─────────────────────────────────────────────────────────────────────────────
// Mapeo de una liquidación a su fila del LRE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `config` trae lo que no vive en la ficha del trabajador y hay que declarar
 * igual: región y comuna de prestación de servicios, CCAF y mutual de la
 * empresa. Puede venir por trabajador (contrato) o por empresa.
 *
 * `calc` es el resultado de liquidacionDe(), ya con anticipos y licencias.
 * `iut` se pasa aparte porque el motor lo calcula fuera de calcularLiquidacion.
 */
export function filaLRE({ trabajador, contrato, liq, calc, iut, finiquito, config = {} }) {
  const f = {};
  const t = trabajador || {};
  const c = contrato || {};

  const region = c.lreRegion ?? config.region ?? '';
  const comuna = c.lreComuna ?? config.comuna ?? '';

  // ── Identificación ──
  f[1101] = rutLRE(t.rut);
  f[1102] = fechaLRE(c.fechaInicio);
  f[1103] = finiquito ? fechaLRE(finiquito.fechaTermino) : '';
  f[1104] = finiquito ? (COD_CAUSAL[finiquito.causal] ?? '') : '';
  f[1105] = region;
  f[1106] = comuna;
  f[1170] = 1;                                   // Impuesto de Segunda Categoría
  f[1146] = t.tecnicoExtranjero ? 1 : 0;
  f[1107] = COD_JORNADA_LRE[c.jornada] ?? 101;
  f[1108] = t.discapacidad ? 1 : (t.invalidezTotal ? 2 : (t.invalidezParcial ? 3 : 0));
  f[1109] = t.esPensionado ? 1 : 0;
  // Sin AFP se declara 100, no vacío: el campo es obligatorio.
  f[1141] = COD_AFP_LRE[t.afp] ?? AFP_SIN_AFP;
  f[1142] = 0;                                   // No pertenece al IPS
  f[1143] = t.prevision === 'Isapre'
    ? (COD_SALUD_LRE[t.isapre] ?? SALUD_SIN_ISAPRE)
    : COD_SALUD_LRE.Fonasa;
  // AFC: el trabajador cotiza salvo pensionado. En plazo fijo el aporte es
  // íntegramente del empleador, pero el seguro igual existe.
  f[1151] = t.esPensionado ? 0 : 1;
  f[1110] = config.ccaf ?? 0;
  f[1152] = config.mutual ?? 2;   // 2 = Mutual de Seguridad CChC
  f[1111] = parseInt(t.cargas) || '';
  f[1112] = parseInt(t.cargasMaternales) || '';
  f[1113] = parseInt(t.cargasInvalidez) || '';
  f[1114] = TRAMOS_AF_LRE.includes(t.tramoAsignacion) ? t.tramoAsignacion : 'S';
  for (let i = 1171; i <= 1180; i++) f[i] = '';
  f[1115] = decimal(calc?.diasTrab ?? 30);
  f[1116] = calc?.diasLicencia ? decimal(calc.diasLicencia) : '';
  f[1117] = liq?.diasVacaciones ? decimal(liq.diasVacaciones) : '';
  f[1118] = 0;                                   // Subsidio trabajador joven
  f[1154] = '';
  f[1155] = calc?.apvM > 0 ? 1 : 0;
  f[1157] = 0;
  f[1131] = 0;                                   // Indemnización Art. 164
  f[1132] = '';

  // ── Haberes imponibles y tributables ──
  COLUMNAS_LRE.filter(x => x.cod >= 2101 && x.cod <= 2161).forEach(x => { f[x.cod] = 0; });
  f[2101] = monto(calc?.base);
  f[2102] = monto(calc?.montoHE);                // Sobresueldo = horas extra
  f[2106] = monto(calc?.gratMensual);
  f[2111] = monto(calc?.itemsImp);               // Ítems imponibles de la empresa
  f[2113] = monto((calc?.bProd || 0) + (calc?.otrosImp || 0));

  // ── Haberes imponibles y no tributables ──
  [2201, 2202, 2203, 2204].forEach(k => { f[k] = 0; });

  // ── Haberes no imponibles y no tributables ──
  COLUMNAS_LRE.filter(x => x.cod >= 2301 && x.cod <= 2347).forEach(x => { f[x.cod] = 0; });
  f[2301] = monto(calc?.bColacion);
  f[2302] = monto(calc?.bMovil);
  f[2303] = monto(calc?.viaticos);
  f[2311] = monto(calc?.asigFamiliar);
  f[2306] = monto((calc?.otrosNoImp || 0) + (calc?.itemsNoImp || 0));
  f[2417] = 0;
  f[2418] = 0;

  // ── Descuentos ──
  COLUMNAS_LRE.filter(x => x.cod >= 3110 && x.cod <= 3188).forEach(x => { f[x.cod] = 0; });
  f[3141] = monto(calc?.afpM);
  f[3143] = monto(calc?.salM);
  f[3151] = monto(calc?.cesM);
  // APV: régimen A rebaja impuesto al retiro, régimen B rebaja la base ahora.
  if (calc?.apvRegimen === 'A') f[3155] = monto(calc?.apvM);
  if (calc?.apvRegimen === 'B') f[3156] = monto(calc?.apvM);
  f[3161] = monto(iut);
  f[3185] = monto(calc?.descAdicional);
  f[3188] = monto((calc?.anticipo || 0) + (calc?.itemsDesc || 0));

  // ── Aportes del empleador ──
  f[4151] = monto(calc?.cesEmpM);
  f[4152] = monto(calc?.mutualM);
  f[4131] = 0;
  f[4154] = 0;
  f[4155] = monto(calc?.sisM);
  f[4157] = 0;

  // ── Totales ──
  // Se suman las columnas ya escritas y no los campos del cálculo: si un haber
  // quedó mal clasificado arriba, el total lo delata en vez de taparlo. La DT
  // valida que los totales cuadren con el detalle.
  const suma = (desde, hasta) => COLUMNAS_LRE
    .filter(x => x.cod >= desde && x.cod <= hasta)
    .reduce((s, x) => s + (Number(f[x.cod]) || 0), 0);

  const impTrib   = suma(2101, 2161);
  const impNoTrib = suma(2201, 2204);
  const noImpNoTrib = suma(2301, 2347);
  const noImpTrib = suma(2417, 2418);
  const cotizaciones = (Number(f[3141]) || 0) + (Number(f[3143]) || 0) + (Number(f[3144]) || 0)
                     + (Number(f[3151]) || 0) + (Number(f[3155]) || 0) + (Number(f[3156]) || 0)
                     + (Number(f[3157]) || 0) + (Number(f[3158]) || 0);
  const impuestos = Number(f[3161]) || 0;
  const otrosDesc = suma(3110, 3188) - cotizaciones - impuestos - (Number(f[3162]) || 0);

  f[5201] = monto(impTrib + impNoTrib + noImpNoTrib + noImpTrib);
  f[5210] = monto(impTrib);
  f[5220] = monto(impNoTrib);
  f[5230] = monto(noImpNoTrib);
  f[5240] = monto(noImpTrib);
  f[5301] = monto(cotizaciones + impuestos + otrosDesc);
  f[5361] = monto(impuestos);
  f[5362] = monto(f[3162]);
  f[5341] = monto(cotizaciones);
  f[5302] = monto(otrosDesc);
  f[5410] = monto(suma(4131, 4157));
  f[5501] = monto(Number(f[5201]) - Number(f[5301]));
  f[5502] = 0;
  f[5564] = 0;
  f[5565] = 0;

  return f;
}

// ─────────────────────────────────────────────────────────────────────────────
// Validación previa
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Revisa las filas antes de generar. La DT rechaza el archivo COMPLETO si un
 * solo campo obligatorio viene vacío, así que conviene detectarlo acá y no
 * después de 48 horas de validación.
 */
export function validarLRE(filas) {
  const problemas = [];
  filas.forEach(({ fila, nombre }) => {
    const faltan = COLUMNAS_LRE
      .filter(c => c.req)
      .filter(c => fila[c.cod] === '' || fila[c.cod] === null || fila[c.cod] === undefined)
      .map(c => `${c.cod} ${c.nombre}`);

    if (!fila[1101]) faltan.push('1101 RUT inválido o mal formateado');
    if (fila[1103] && !fila[1104]) faltan.push('1104 Falta la causal del término declarado');

    if (faltan.length) problemas.push({ nombre, faltan });
  });
  return problemas;
}

// ─────────────────────────────────────────────────────────────────────────────
// Archivo
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Codifica a ANSI (latin-1). La DT rechaza UTF-8, y `new Blob([texto])` en el
 * navegador produce UTF-8 sin avisar: una ñ o una tilde salen como dos bytes y
 * el archivo se cae. Por eso se escribe byte a byte.
 */
function aAnsi(texto) {
  const bytes = new Uint8Array(texto.length);
  for (let i = 0; i < texto.length; i++) {
    const cp = texto.charCodeAt(i);
    bytes[i] = cp < 256 ? cp : 63;   // 63 = '?'
  }
  return bytes;
}

/** Nombre exigido por la DT: rutempleador_aaaamm (sin puntos ni DV). */
export function nombreArchivoLRE(rutEmpresa, mes, anio) {
  const soloNum = String(rutEmpresa || '').replace(/[.\-\s]/g, '').replace(/[kK]$/, '');
  return `${soloNum}_${anio}${String(mes).padStart(2, '0')}.csv`;
}

/** Arma el CSV completo: headers + una fila por liquidación. */
export function csvLRE(filas) {
  const sep = ';';
  // Un valor con «;» rompería el archivo. No debería ocurrir —todo es numérico
  // o fecha— pero se limpia por si acaso en vez de generar un CSV corrupto.
  const limpio = v => String(v ?? '').replace(/[;\r\n]/g, ' ').trim();

  const cabecera = COLUMNAS_LRE.map(c => limpio(c.nombre)).join(sep);
  const cuerpo = filas.map(({ fila }) =>
    COLUMNAS_LRE.map(c => limpio(fila[c.cod])).join(sep));

  return [cabecera, ...cuerpo].join('\r\n') + '\r\n';
}

/** Descarga el archivo ya codificado en ANSI. */
export function descargarLRE(filas, rutEmpresa, mes, anio) {
  const nombre = nombreArchivoLRE(rutEmpresa, mes, anio);
  const blob = new Blob([aAnsi(csvLRE(filas))], { type: 'text/csv;charset=windows-1252' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return nombre;
}
