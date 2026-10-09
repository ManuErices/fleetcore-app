import { TASAS, TASAS_AFP, MESES, CAUSALES_TERMINO,
  CAUSALES_CON_INDEMNIZACION, TOPE_ANIOS_INDEMNIZACION, TIPOS_PERIODO,
  TRAMOS_IUT, normalizarItemsPago } from './shared';
// IMM, UTM, UF y jornada máxima legal ya no son constantes: dependen del
// período que se está liquidando. Ver parametros.js.
import { paramsDe, montoAsignacionFamiliar, tramoSugerido, valorPlanSalud } from './parametros';

/**
 * Redondeo "bancario" (mitad al par): 190.312,5 → 190.312 y 83.317,5 → 83.318.
 * Es el que usa Talana. Solo importa en montos que terminan exactamente en ,5,
 * que en la práctica aparecen al sacar el 25% de la gratificación.
 */
function redondearPar(x) {
  const n = Number(x) || 0;
  const piso = Math.floor(n);
  const dif = n - piso;
  if (Math.abs(dif - 0.5) < 1e-9) return piso % 2 === 0 ? piso : piso + 1;
  return Math.round(n);
}

function diasEntre(desde, hasta) {
  if (!desde || !hasta) return 0;
  return Math.max(0, Math.round((new Date(hasta) - new Date(desde)) / 86400000));
}
function alertaVencimiento(fechaFin) {
  if (!fechaFin) return null;
  const dias = diasEntre(new Date().toISOString().split('T')[0], fechaFin);
  if (dias < 0)  return { tipo: 'vencido',   texto: 'Contrato vencido',       color: 'bg-red-100 text-red-700 border-red-200' };
  if (dias <= 7)  return { tipo: 'urgente',   texto: `Vence en ${dias} días`,  color: 'bg-red-100 text-red-700 border-red-200' };
  if (dias <= 30) return { tipo: 'proximo',   texto: `Vence en ${dias} días`,  color: 'bg-amber-100 text-amber-700 border-amber-200' };
  if (dias <= 60) return { tipo: 'advertencia',texto:`Vence en ${dias} días`,  color: 'bg-yellow-100 text-yellow-700 border-yellow-200' };
  return null;
}
function labelPeriodo(rem) {
  const mes  = MESES[parseInt(rem.mes)-1] || rem.mes || '';
  const anio = rem.anio || '';
  switch (rem.tipoPeriodo) {
    case 'quincenal':
      return `${rem.quincena === '1' ? '1ra quincena' : '2da quincena'} ${mes} ${anio}`;
    case 'semanal':
      return `Semana ${rem.semana || '?'} — ${mes} ${anio}`;
    case 'turno':
      return `Turno ${rem.fechaInicioTurno||'?'} / ${rem.fechaFinTurno||'?'}`;
    default:
      return `${mes} ${anio}`;
  }
}
function factorPeriodo(tipoPeriodo) {
  switch (tipoPeriodo) {
    case 'quincenal': return 0.5;
    case 'semanal':   return 7/30;
    case 'turno':     return 0.5; // default turno ≈ 15 días
    default:          return 1;   // mensual
  }
}
/**
 * Días del período que el contrato estuvo vigente, en base 30.
 *
 * Quien entra el 21 de septiembre trabaja 10 días, no 30, y su sueldo base es
 * proporcional (Art. 44 inc. 3 CT: la remuneración se paga por el tiempo
 * efectivamente servido). Antes el motor asumía 30 días siempre que nadie los
 * escribiera a mano, así que un ingreso a mitad de mes pagaba el mes completo
 * y nadie lo notaba: la liquidación se veía correcta.
 *
 * Se usa el mes comercial de 30 días, que es la convención previsional chilena
 * y la que ya usa el resto del motor. Días 31 se cuentan como 30.
 *
 * Devuelve null cuando no hay fechas con qué calcular: ahí manda el default.
 */
function diasVigentesEnPeriodo(contrato, mes, anio) {
  const m = parseInt(mes), a = parseInt(anio);
  if (!m || !a) return null;

  const ini = contrato?.fechaInicio ? new Date(`${contrato.fechaInicio}T12:00:00`) : null;
  const fin = contrato?.fechaFin    ? new Date(`${contrato.fechaFin}T12:00:00`)    : null;
  if ((!ini || isNaN(ini)) && (!fin || isNaN(fin))) return null;

  const primero = new Date(a, m - 1, 1, 12);
  const ultimo  = new Date(a, m, 0, 12);          // último día real del mes

  // Fuera del período: el contrato no alcanza a tocar este mes.
  if (ini && !isNaN(ini) && ini > ultimo) return 0;
  if (fin && !isNaN(fin) && fin < primero) return 0;

  const desde = ini && !isNaN(ini) && ini > primero ? ini.getDate() : 1;
  // Si el contrato sigue vigente al último día real del mes, en mes comercial
  // ese día es el 30 — también en febrero. Antes se tomaba el 28: quien entraba
  // el 15 de febrero quedaba con 14 días en vez de 16.
  const cubreFinDeMes = !(fin && !isNaN(fin) && fin < ultimo);
  const hasta = cubreFinDeMes ? 30 : fin.getDate();

  // Mes comercial: el día 31 se funde con el 30, en los dos extremos. Sin
  // topear también el `desde`, quien entra un 31 daba 0 días trabajados y su
  // liquidación salía en cero.
  const dias = Math.min(30, Math.max(0, Math.min(hasta, 30) - Math.min(desde, 30) + 1));
  return desde === 1 && cubreFinDeMes ? 30 : dias;
}

/** Fonasa cotiza el 7% parejo; el plan pactado solo existe en isapre. */
function esFonasa(rem) {
  const p = String(rem?.prevision || '').toLowerCase();
  return !p || p.includes('fonasa');
}

/**
 * Ausencias que caen dentro de un período, con sus días recortados al mes.
 *
 * Una ausencia del 28 de marzo al 4 de abril aporta 3 días a marzo y 4 a
 * abril, no 8 a cada uno. Se usa el mes comercial de 30 días, igual que el
 * resto del motor.
 *
 * Lo consume `RemuneracionesSection` para armar `ausenciasRegistradas`; vive
 * acá y no en la pantalla para que el recorte sea el mismo en la liquidación,
 * en el PDF y en cualquier reporte que lo necesite.
 */
export function ausenciasDePeriodo(ausencias, mes, anio) {
  const m = parseInt(mes), a = parseInt(anio);
  if (!m || !a || !Array.isArray(ausencias)) return [];

  const primero = new Date(a, m - 1, 1, 12);
  const ultimo  = new Date(a, m, 0, 12);

  return ausencias.reduce((acc, aus) => {
    if (!aus?.fechaDesde) return acc;
    const d = new Date(`${aus.fechaDesde}T12:00:00`);
    // Sin fecha de término se asume un solo día: es lo que pasa con un permiso
    // de una jornada, que es el caso más común.
    const h = aus.fechaHasta ? new Date(`${aus.fechaHasta}T12:00:00`) : d;
    if (isNaN(d) || isNaN(h) || h < primero || d > ultimo) return acc;

    const desde = d > primero ? d : primero;
    const hasta = h < ultimo  ? h : ultimo;
    const diasEnPeriodo = Math.min(30,
      Math.round((hasta - desde) / 86400000) + 1);

    acc.push({ ...aus, diasEnPeriodo });
    return acc;
  }, []);
}

/**
 * Parámetros con que se calcula un documento.
 *
 * Parte de la tabla de vigencias del período y encima aplica el snapshot que
 * el documento trae congelado (`rem.parametros`), pero SOLO los valores que se
 * congelaron cargados de verdad: un snapshot hecho con la UTM de respaldo no
 * debe ganarle a la UTM real que se cargó después.
 *
 * Antes el snapshot se guardaba y nadie lo leía: reabrir una liquidación
 * recalculaba todo con lo que hubiera en memoria ese día.
 */
function parametrosEfectivos(rem) {
  const P = { ...paramsDe({ mes: rem.mes, anio: rem.anio }) };
  const snap = rem.parametros;
  if (!snap || typeof snap !== 'object') return P;
  // Un snapshot de otro mes no aplica: pasa si alguien edita la liquidación y
  // le cambia el período.
  if (snap.periodo && snap.periodo !== P.periodo) return P;

  if (snap.utmCargada && Number(snap.utm) > 0) {
    P.utm = Number(snap.utm); P.utmCargada = true;
  }
  if (snap.ufFinCargada && Number(snap.ufFin) > 0) {
    const ufFin = Number(snap.ufFin);
    P.ufFin = ufFin; P.ufFinCargada = true;
    P.topeImponible   = Math.round(P.topeImponibleUF * ufFin);
    P.topeCesantia    = Math.round(P.topeCesantiaUF * ufFin);
    P.topeRebajaSalud = Math.round(P.topeImponibleUF * ufFin * 0.07);
  }
  ['tasaSIS', 'tasaCEV', 'tasaCRP', 'tasaCIEmp'].forEach(k => {
    if (snap[k] != null && Number(snap[k]) >= 0) P[k] = Number(snap[k]);
  });
  return P;
}

function calcularLiquidacion(rem) {
  // ── Parámetros legales del período que se está liquidando ──
  // IMM (tope de gratificación), UTM (IUT), UF (topes de APV) y jornada
  // ordinaria máxima. Todo lo que la ley cambia con el tiempo entra por acá.
  const P = parametrosEfectivos(rem);

  // ── Factor 1: tipo de período (mensual / quincenal / semanal / turno) ──
  const fp = factorPeriodo(rem.tipoPeriodo);

  // ── Factor 2: días trabajados (Art. 55 CT — prorrateo por ausentismo) ──
  // Si el trabajador no trabajó los 30 días del mes, el sueldo base y los
  // haberes fijos se reducen proporcionalmente: valor_día = sueldo / 30.
  // Los bonos variables (producción, HE) NO se prorratean — corresponden
  // a lo efectivamente ganado. Colación y movilización sí se prorratean
  // porque son un apoyo al asistir al trabajo (criterio DT y Talana).
  //
  // ── Licencias médicas ──
  //
  // Modelo: la empresa NO paga los días de reposo. El subsidio lo paga la
  // isapre, Fonasa o la CCAF directo al trabajador, y esa misma entidad entera
  // las cotizaciones de pensiones y salud por todo el período de reposo. Por
  // eso los días de licencia salen de la base imponible del empleador: si se
  // cotizara por ellos se pagaría dos veces la misma cotización.
  //
  // Carencia: si la licencia dura 10 días o menos, los tres primeros no dan
  // derecho a subsidio y el empleador tampoco está obligado a pagarlos — el
  // trabajador simplemente los pierde. Si dura 11 o más, el subsidio corre
  // desde el primer día. Las cotizaciones sí se pagan por los días de carencia,
  // y las paga la entidad de subsidio, no la empresa.
  //
  // `pagarCarencia` permite que la empresa cubra esos días por decisión propia
  // o por convenio colectivo; entonces cuentan como trabajados y sí cotizan.
  //
  // La fuente puede ser la colección `licencias` (inyectada por remDe como
  // `licenciasRegistradas`) o el campo manual de la liquidación, igual que
  // los anticipos. Si hay registro, ese manda.
  const licRegistradas = rem.licenciasRegistradas;
  const licencias = Array.isArray(licRegistradas)
    ? licRegistradas
    : (parseInt(rem.diasLicencia) > 0
        ? [{ dias: parseInt(rem.diasLicencia), diasEnPeriodo: parseInt(rem.diasLicencia),
             tipo: rem.tipoLicencia || 'comun' }]
        : []);

  const detalleLic = licencias.map(l => {
    // `dias` es la duración de esta licencia y `diasParaCarencia` la de toda la
    // cadena continua por el mismo cuadro clínico, que es lo que la ley manda
    // sumar para decidir si aplica carencia. `diasEnPeriodo` es cuántos de esos
    // días caen en este mes, que es lo que efectivamente se descuenta.
    // Una licencia de 12 días a caballo entre dos meses no tiene carencia en
    // ninguno de los dos, porque depende del total, no del trozo.
    const total     = parseInt(l.dias) || 0;
    const paraCar   = parseInt(l.diasParaCarencia ?? l.dias) || 0;
    const enPeriodo = parseInt(l.diasEnPeriodo ?? l.dias) || 0;
    // Sin carencia en accidente del trabajo ni licencia maternal.
    const aplicaCarencia = paraCar > 0 && paraCar <= 10
      && !['maternal', 'accidente', 'profesional'].includes(String(l.tipo || 'comun'));
    return { ...l, dias: total, diasParaCarencia: paraCar, diasEnPeriodo: enPeriodo,
             diasCarencia: aplicaCarencia ? Math.min(3, enPeriodo) : 0 };
  });

  const diasLicencia = detalleLic.reduce((s, l) => s + l.diasEnPeriodo, 0);
  const diasCarencia = detalleLic.reduce((s, l) => s + l.diasCarencia, 0);
  const pagarCarencia = rem.pagarCarencia === true;
  // Días que la empresa efectivamente no paga
  const diasLicNoPagados = pagarCarencia ? diasLicencia - diasCarencia : diasLicencia;

  // ── Ausencias y permisos sin goce ──
  //
  // Hasta acá el motor solo sabía de licencias médicas. Las inasistencias y
  // los permisos sin goce de sueldo se registraban en la pantalla de
  // Asistencia y no llegaban nunca a la liquidación: el trabajador faltaba una
  // semana y cobraba el mes completo.
  //
  // Qué descuenta y qué no:
  //   · sin goce            → descuenta. Es la definición del permiso.
  //   · falta injustificada → descuenta (Art. 54 CT: se paga el tiempo servido).
  //   · permiso con goce    → NO descuenta. Es con goce de remuneraciones.
  //   · licencia médica     → NO se cuenta acá. Viene por `licenciasRegistradas`,
  //                           y contarla dos veces dejaría al trabajador en cero.
  //   · accidente           → NO descuenta. Lo cubre la mutual (Ley 16.744).
  const TIPOS_QUE_DESCUENTAN = ['sin goce', 'falta injustificada'];
  const ausRegistradas = Array.isArray(rem.ausenciasRegistradas) ? rem.ausenciasRegistradas : [];
  const detalleAus = ausRegistradas.filter(a => TIPOS_QUE_DESCUENTAN.includes(String(a.tipo || '')));
  const diasAusencia = Math.max(0, detalleAus.reduce(
    (s, a) => s + (parseInt(a.diasEnPeriodo ?? a.dias) || 0), 0));

  // Prioridad: los días escritos a mano en la liquidación, y si no, los que el
  // contrato estuvo vigente dentro del período. El default de 30 queda solo
  // para cuando no hay fechas con qué calcular.
  const diasPorContrato = diasVigentesEnPeriodo(rem, rem.mes, rem.anio);
  const diasBase   = parseInt(rem.diasTrabajados) >= 0
    ? parseInt(rem.diasTrabajados)
    : (diasPorContrato ?? 30);
  // Si la liquidación ya trae los días trabajados netos (el modal los calcula
  // al registrar la licencia) no se descuenta de nuevo. El tope evita el doble
  // descuento cuando alguien baja los días a mano Y registra la licencia.
  //
  // Las ausencias se restan además del tope: son días no trabajados que se
  // suman a los de licencia, no se solapan con ellos.
  const diasTrab   = Math.max(0, Math.min(diasBase, 30 - diasLicNoPagados) - diasAusencia);
  const fdias      = diasTrab / 30; // factor días: 1.0 cuando trabaja el mes completo

  // Sueldo base prorrateable
  const baseCompleto = parseInt(rem.sueldoBase) || 0;
  const base         = Math.round(baseCompleto * fp * fdias);

  // Bonos variables: no se prorratean por días (ya reflejan lo trabajado)
  const bProd  = parseInt(rem.bonoProduccion) || 0;
  // Horas extra: `horasExtra` es el TOTAL del período, no un promedio semanal.
  // Antes se multiplicaba por 4 en período mensual, así que escribir "1" pagaba
  // cuatro horas. Nadie que anote horas extra de un mes piensa en semanas.
  const hExtra = parseFloat(rem.horasExtra) || 0;
  // El valor hora legal tiene decimales (5.909,09), pero la pantalla guarda el
  // entero (5.909). Si lo guardado coincide con el legal redondeado, se usa el
  // exacto: 15 horas × 5.909 dejaba la línea $1 corta respecto de Talana. Si
  // alguien escribió otro valor (un recargo pactado mayor), se respeta ese.
  const vHEguardado = parseFloat(rem.valorHoraExtra) || 0;
  const vHElegal    = hExtra > 0 ? valorHoraExtra(rem.sueldoBase, rem, { mes: rem.mes, anio: rem.anio }) : 0;
  const vHE = vHEguardado && Math.round(vHElegal) === Math.round(vHEguardado) ? vHElegal : vHEguardado;
  const montoHE    = Math.round(hExtra * vHE);

  // No imponibles fijos: proporcionales a días asistidos
  const bColacion  = Math.round((parseInt(rem.bonoColacion) || 0)       * fp * fdias);
  const bMovil     = Math.round((parseInt(rem.bonoMovilizacion) || 0)   * fp * fdias);
  const viaticos   = parseInt(rem.viaticos) || 0;   // se ingresa por período directo
  const otrosImp   = parseInt(rem.otrosImponibles) || 0;
  const otrosNoImp = parseInt(rem.otrosNoImponibles) || 0;

  // ── Ítems de pago personalizados ──
  // Bonos y descuentos con nombre libre que la empresa define en su catálogo
  // (`empresas/{id}/items_pago`). Viven en `rem.items` con su nombre y tipo ya
  // congelados, y se suman al bucket que les corresponde. No inventan reglas:
  // un ítem imponible se comporta exactamente igual que "Otros Imponibles".
  //
  // `prorratea` es opt-in por ítem: un bono fijo mensual (responsabilidad,
  // zona) se reduce por días no trabajados; uno variable ya viene calculado
  // sobre lo efectivamente ganado y no debe tocarse.
  const itemsDetalle = normalizarItemsPago(rem.items).map(it => ({
    ...it,
    montoCalc: it.prorratea ? Math.round(it.monto * fp * fdias) : it.monto,
  }));
  const sumaItems = (tipo) => itemsDetalle
    .filter(i => i.tipo === tipo)
    .reduce((s, i) => s + i.montoCalc, 0);
  const itemsImp   = sumaItems('imponible');
  const itemsNoImp = sumaItems('noImponible');
  const itemsDesc  = sumaItems('descuento');

  // Gratificación legal (Art. 50 CT): 25% de lo devengado por el trabajador,
  // CON TOPE de 4,75 ingresos mínimos mensuales al año (4,75 × IMM ÷ 12 al mes).
  //
  // Es un mínimo entre ambos, no el tope directo. Antes se pagaba siempre el
  // tope: un trabajador con sueldo base de $600.000 recibía $213.354 de
  // gratificación cuando le corresponden $150.000. El error inflaba el
  // imponible y con él AFP, salud, cesantía e impuesto de todos.
  //
  // El IMM se resuelve por el período de la liquidación, no por la fecha de
  // hoy: reabrir en septiembre una liquidación de marzo debe seguir usando el
  // mínimo de marzo. Antes era la constante IMM_2026, congelada en el valor de
  // enero, y el reajuste retroactivo de mayo (Ley 21.830) quedaba fuera.
  // Tope sin redondear (4,75 × IMM ÷ 12 = 219.114,73): prorratearlo ya
  // redondeado descuadraba en $1 contra Talana.
  const topeGrat  = P.imm * 4.75 / 12;
  // Los ítems imponibles del catálogo son remuneración devengada, así que
  // entran a la base de gratificación igual que "Otros Imponibles".
  // Las horas extra también: el Art. 50 habla del 25% de lo devengado por
  // concepto de remuneraciones, y el sobresueldo lo es (Art. 42 b). Antes
  // quedaban fuera y quien hacía horas extra bajo el tope recibía menos.
  const baseGrat  = base + bProd + montoHE + otrosImp + itemsImp;   // remuneración devengada del mes
  // El tope se prorratea SOLO por los días no trabajados dentro del mes del
  // contrato (licencias y ausencias), no por ingresar o egresar a mitad de mes.
  // Así lo calcula Talana: un egreso el día 17 recibe el 25% de lo devengado con
  // tope mensual completo; una licencia de 27 días topea a 3/30 del tope.
  const factorTope = Math.max(0, 30 - diasLicNoPagados - diasAusencia) / 30;
  // Contratos sin gratificación pactada (`gratificacion: 'ninguna'`).
  const sinGrat = rem.gratificacion === false || rem.gratificacion === 'ninguna';
  const gratMensual = sinGrat ? 0
    : redondearPar(Math.min(baseGrat * 0.25, topeGrat * fp * factorTope));

  // ── Asignación familiar (DFL 150) ──
  //
  // No constituye remuneración: no es imponible, no tributa, y el empleador la
  // paga junto al sueldo para después descontarla de las cotizaciones que
  // entera en la caja de compensación o el IPS. Por eso entra al líquido pero
  // NO a `imponible` ni a la renta tributable.
  //
  // El tramo y las cargas ya se registraban en la ficha para el TXT de
  // Previred (posiciones 14, 18 y 19), pero nunca se pagaban en la liquidación.
  //
  // Las cargas con invalidez acreditada valen el doble en todos los tramos.
  // Las maternales usan la misma escala que las simples.
  // No se prorratean por días trabajados: se devengan por mes completo.
  const tramoAF     = rem.tramoAsignacion || '';
  const montoPorAF  = montoAsignacionFamiliar(tramoAF, { mes: rem.mes, anio: rem.anio });
  const cargasSimp  = parseInt(rem.cargas)           || 0;
  const cargasMat   = parseInt(rem.cargasMaternales) || 0;
  const cargasInv   = parseInt(rem.cargasInvalidez)  || 0;
  const cargasEquiv = cargasSimp + cargasMat + (cargasInv * 2);
  // Durante el reposo la asignación familiar la paga la entidad de subsidio,
  // no el empleador. Se prorratea solo por días de licencia — no por otras
  // ausencias, donde el empleador la sigue debiendo por mes completo.
  const fAsig = diasLicencia > 0 ? Math.max(0, 30 - diasLicencia) / 30 : 1;
  const asigFamiliar = Math.round(montoPorAF * cargasEquiv * fAsig);

  // ── Base imponible previsional ──
  const imponible   = base + bProd + montoHE + otrosImp + itemsImp + gratMensual;
  // ── No imponible ──
  const noImponible = bColacion + bMovil + viaticos + otrosNoImp + itemsNoImp + asigFamiliar;

  // ── Descuentos legales (cargo trabajador) ──
  // rem.afp viene de la FICHA del trabajador, no del contrato ni de la liquidación.
  // Si no llega, se cae a una tasa por defecto y la cotización queda mal: por eso
  // se expone `afpResuelta` para que la UI pueda advertirlo en vez de callar.
  //
  // Un trabajador PENSIONADO que sigue trabajando está exento de:
  //   · cotización obligatoria de AFP (ya está pensionado)
  //   · SIS — "no aplica para trabajador pensionado" (Previred)
  //   · seguro de cesantía — por ley no puede ser beneficiario activo (AFC)
  // Sigue cotizando el 7% de salud.
  const esPensionado = rem.esPensionado === true;

  const afpResuelta = !!TASAS_AFP[rem.afp];
  const tasaAfp = esPensionado ? 0 : (TASAS_AFP[rem.afp] || 0.1137);

  // ── Tope imponible (DL 3.500 Art. 16) ──
  //
  // Las cotizaciones se calculan sobre la renta imponible TOPEADA, no sobre la
  // total. Son dos topes: 90 UF para AFP y salud, 135,2 UF para cesantía
  // (valores 2026, Res. ex. 236 de la Superintendencia de Pensiones).
  //
  // No estaba aplicado. Un sueldo sobre ~$3,7 millones cotizaba por el total:
  // el trabajador pagaba AFP y salud de más, y la empresa pagaba de más el SIS,
  // la mutual y su parte de la cesantía.
  const baseCotiza = Math.min(imponible, P.topeImponible);
  const baseCesantia = Math.min(imponible, P.topeCesantia);
  const sobreTope = imponible > P.topeImponible;

  const afpM  = Math.round(baseCotiza * tasaAfp);

  // ── Salud: el 7% es el MÍNIMO, no el monto ──
  //
  // Quien tiene isapre cotiza lo que pactó en su plan, y el 7% legal es solo el
  // piso (DL 3.500 Art. 84). El motor cobraba el 7% y listo, así que a todo
  // afiliado a isapre con plan sobre el mínimo se le pagaba de más: en un plan
  // de 6,311 UF sobre $1.919.115 imponibles, $124.774 al mes.
  //
  // El valor del plan ya estaba en la ficha (`planIsapre`), se imprimía en el
  // PDF y nunca entraba al cálculo.
  const salLegal = Math.round(baseCotiza * TASAS.salud);
  const planSaludM = esFonasa(rem) ? 0 : valorPlanSalud(rem.planIsapre, { mes: rem.mes, anio: rem.anio });
  const salM = Math.max(salLegal, planSaludM);
  const salAdicional = Math.max(0, salM - salLegal);
  const esCt  = rem.tipoContrato && (
    rem.tipoContrato.toLowerCase().includes('plazo') || 
    rem.tipoContrato.toLowerCase().includes('obra')
  );
  // AFC: indefinido 0,6% trabajador; plazo fijo/obra 0% (lo paga íntegro el empleador)
  // La cesantía tiene su propio tope, más alto que el previsional.
  // No afectos al seguro de cesantía: pensionados y quien la ficha marque con
  // `afectoAFC: false` (p. ej. contratos anteriores a oct-2002 sin opción).
  const sinAFC = esPensionado || rem.afectoAFC === false;
  const cesM  = sinAFC ? 0
    : Math.round(baseCesantia * (esCt ? TASAS.ces_trab_pf : TASAS.ces_trab));
  // SIS: cargo empleador (referencial, no descuenta al trabajador). Va sobre
  // el tope previsional, igual que AFP y salud. La tasa es la del período.
  const sisM  = esPensionado ? 0 : Math.round(baseCotiza * P.tasaSIS);
  // Aportes del empleador de la reforma previsional (Ley 21.735), sobre la
  // misma base topeada. El pensionado no cotiza AFP, así que tampoco genera
  // el aporte a cuenta individual ni los del Seguro Social.
  const ciEmpM  = esPensionado ? 0 : Math.round(baseCotiza * P.tasaCIEmp);
  const cevEmpM = esPensionado ? 0 : Math.round(baseCotiza * P.tasaCEV);
  const crpEmpM = esPensionado ? 0 : Math.round(baseCotiza * P.tasaCRP);
  // ── APV — Ahorro Previsional Voluntario (Art. 20 DL 3.500) ──
  // Régimen A: el trabajador recibe la bonificación fiscal del 15%, y el aporte
  //            NO rebaja la base del impuesto único.
  // Régimen B: el aporte SÍ rebaja la renta tributable, con tope de 50 UF
  //            mensuales. El tope se aplica en calcularRentaTributable.
  // Se descuenta del líquido en ambos casos: la plata sale igual.
  const apvMonto    = Math.max(0, parseInt(rem.apvMonto) || 0);
  const apvRegimen  = apvMonto > 0 ? (rem.apvRegimen || 'B') : '';
  const apvM        = esPensionado ? 0 : apvMonto;

  const totalDescuentos = afpM + salM + cesM + apvM;

  // ── Descuentos manuales ──
  const descAdicional = parseInt(rem.descuentoAdicional) || 0;

  // Anticipos: si el período tiene anticipos registrados en su colección, esos
  // mandan y el campo manual se ignora. Sumar ambos descontaría dos veces el
  // mismo dinero en cuanto alguien migre un anticipo antiguo al nuevo proceso.
  // `anticiposRegistrados` lo inyecta remDe(); undefined = no hay registro y
  // se respeta lo que se haya escrito a mano.
  const anticipoRegistrado = rem.anticiposRegistrados;
  const anticipo = (anticipoRegistrado !== undefined && anticipoRegistrado !== null)
    ? Math.max(0, Math.round(anticipoRegistrado))
    : (parseInt(rem.anticipo) || 0);

  // ── Pago ya efectuado del mismo período (reliquidación) ──
  //
  // Una reliquidación recalcula el MES COMPLETO, no el diferencial. Tiene que
  // ser así porque el impuesto único es progresivo: calcularlo sobre un
  // diferencial aislado lo dejaría en un tramo más bajo del que corresponde.
  // Lo ya transferido entra entonces como un descuento, y lo que queda es
  // exactamente la diferencia por pagar.
  //
  // Se resta ANTES del IUT sin alterar el impuesto: la renta tributable se
  // calcula desde el imponible, no desde el líquido, así que el resultado es
  // idéntico a restarlo después y el PDF puede mostrarlo como una línea más.
  const pagoAnterior = Math.max(0, parseInt(rem.pagoAnterior) || 0);

  const liquido = imponible - totalDescuentos + noImponible - descAdicional - anticipo - itemsDesc - pagoAnterior;

  const tasaMutualEf = Number(rem.tasaMutual) > 0 ? Number(rem.tasaMutual) : TASAS.mutual;
  const cesEmpM  = sinAFC ? 0 : Math.round(baseCesantia * (esCt ? TASAS.ces_pf_emp : TASAS.ces_emp));
  const mutualM  = Math.round(baseCotiza * tasaMutualEf);
  // Todo lo que paga la empresa por sobre la remuneración. La asignación
  // familiar no entra al costo: se recupera descontándola de lo que se entera.
  const aportesEmpleador = sisM + ciEmpM + cevEmpM + crpEmpM + cesEmpM + mutualM;

  const out = {
    base, bProd, montoHE, bColacion, bMovil, viaticos, otrosImp, otrosNoImp, gratMensual,
    asigFamiliar, tramoAF, montoPorAF, cargasSimp, cargasMat, cargasInv, cargasEquiv,
    imponible, noImponible,
    itemsDetalle, itemsImp, itemsNoImp, itemsDesc,
    afpM, salM, sisM, cesM, apvM, apvRegimen, apvInstitucion: rem.apvInstitucion || '',
    // Desglose de salud y topes, para el PDF y la pantalla.
    salLegal, salAdicional, planSaludM,
    baseCotiza, baseCesantia, sobreTope,
    topeImponible: P.topeImponible, topeRebajaSalud: P.topeRebajaSalud,
    totalDescuentos,
    descAdicional, anticipo, pagoAnterior, liquido,
    esReliquidacion: pagoAnterior > 0 || rem.tipo === 'reliquidacion',
    anticipoDesdeRegistro: anticipoRegistrado !== undefined && anticipoRegistrado !== null,
    diasTrab, fdias, diasPorContrato, diasAusencia, detalleAus,   // expuestos para auditoría / PDF
    diasLicencia, diasCarencia, diasLicNoPagados, pagarCarencia, detalleLic,
    baseCompleto, gratCompleto: Math.round(P.topeGratMensual * fp),
    // Snapshot de los parámetros con que se calculó. Se guarda en el documento
    // al emitir: una liquidación de agosto no debe recalcularse sola cuando en
    // enero se actualice la tabla. Mismo criterio que el anticipo recurrente.
    parametros: {
      periodo:       P.periodo,
      imm:           P.imm,
      immNorma:      P.immNorma,
      topeGratMensual: P.topeGratMensual,
      jornadaMaxima: P.jornadaMaxima,
      jornadaSemanal: horasOrdinariasSemanales(rem, { mes: rem.mes, anio: rem.anio }),
      utm:           P.utm,
      uf:            P.uf,
      ufFin:         P.ufFin,
      utmCargada:    P.utmCargada,
      ufCargada:     P.ufCargada,
      ufFinCargada:  P.ufFinCargada,
      topeImponible: P.topeImponible,
      topeCesantia:  P.topeCesantia,
      tasaSIS:       P.tasaSIS,
      tasaCEV:       P.tasaCEV,
      tasaCRP:       P.tasaCRP,
      tasaCIEmp:     P.tasaCIEmp,
    },
    uf: P.uf,   // lo consume calcularRentaTributable para el tope de APV
    tasaAfp, afpResuelta,
    esPensionado, sinAFC, sinGrat,
    cesEmpM,
    sisEmpM: sisM,
    // Reforma previsional (Ley 21.735) — cargo empleador
    ciEmpM, cevEmpM, crpEmpM,
    tasaSIS: P.tasaSIS, tasaCEV: P.tasaCEV, tasaCRP: P.tasaCRP, tasaCIEmp: P.tasaCIEmp,
    // Aporte del empleador Ley 16.744 (accidentes del trabajo y Ley SANNA).
    // La tasa es PROPIA DE CADA EMPRESA: cotización básica más la adicional
    // diferenciada según su siniestralidad. `TASAS.mutual` está fijada a la de
    // MPF, así que se acepta `rem.tasaMutual` para que la empresa la configure
    // sin editar código. Es columna obligatoria del LRE (cód. 4152).
    tasaMutual: tasaMutualEf,
    mutualM,
    aportesEmpleador,
    costoEmpresa: imponible + (noImponible - asigFamiliar) + aportesEmpleador,
    utm: P.utm, utmCargada: P.utmCargada, ufFinCargada: P.ufFinCargada,
  };

  // ── Impuesto único dentro del motor ──
  // Antes cada pantalla calculaba el IUT por su cuenta, con la UTM que tuviera
  // a mano (una constante, un input manual, la del período): el PDF, la
  // nómina bancaria y la contabilidad podían retener montos distintos para la
  // misma liquidación. Ahora sale de acá, con la UTM efectiva del documento.
  out.rentaTrib    = calcularRentaTributable(out);
  out.iut          = calcularIUT(out.rentaTrib, P.utm);
  out.liquidoFinal = out.liquido - out.iut;
  return out;
}
function calcularAntiguedad(fechaIngreso, fechaTermino) {
  if (!fechaIngreso || !fechaTermino) return { anios:0, meses:0, dias:0, totalMeses:0 };
  const ini = new Date(fechaIngreso);
  const fin = new Date(fechaTermino);
  let anios  = fin.getFullYear() - ini.getFullYear();
  let meses  = fin.getMonth()    - ini.getMonth();
  let dias   = fin.getDate()     - ini.getDate();
  if (dias < 0)  { meses--; }
  if (meses < 0) { anios--; meses += 12; }
  const totalMeses = anios * 12 + Math.max(0, meses);
  return { anios, meses: Math.max(0,meses), dias: Math.max(0,dias), totalMeses };
}
/**
 * Base de cálculo de la indemnización — Art. 172 CT.
 *
 * "Última remuneración mensual" NO es el sueldo base. El artículo manda incluir
 * toda cantidad que el trabajador estuviere percibiendo por la prestación de
 * sus servicios: sueldo base, gratificación, y las asignaciones permanentes
 * —colación, movilización, viáticos, bonos fijos—. La DT ha sostenido que
 * colación y movilización se incluyen, porque el artículo solo excluye tres
 * cosas:
 *
 *   · asignación familiar legal
 *   · pagos por sobretiempo (horas extra)
 *   · beneficios esporádicos o de una vez al año
 *
 * Antes se usaba solo `contrato.sueldoBase`. Con un sueldo de $1.600.000 más
 * gratificación y asignaciones, la base real puede ser casi el doble, y la
 * indemnización salía a la mitad de lo que corresponde. Es una diferencia que
 * el trabajador reclama y la Inspección ordena pagar, con reajuste e intereses.
 */
function baseArt172(liq, contrato) {
  if (!liq) return parseInt(contrato?.sueldoBase) || 0;

  const n = (v) => parseInt(v) || 0;

  // Imponibles permanentes. Las horas extra quedan fuera por mandato expreso.
  const sueldo   = n(liq.sueldoBase) || n(contrato?.sueldoBase);
  const bono     = n(liq.bonoProduccion);
  const otrosImp = n(liq.otrosImponibles);

  // Gratificación: la que se paga mes a mes. Si es anual, es un beneficio
  // "por una sola vez al año" y el propio Art. 172 la excluye.
  const grat = liq.gratificacion === false ? 0
    : Math.min(Math.round(sueldo * 0.25), n(paramsDe(liq)?.topeGratMensual) || Math.round(sueldo * 0.25));

  // No imponibles permanentes. La asignación familiar se excluye por ley y no
  // entra acá porque no es un campo del formulario: la calcula el motor.
  // Los campos de la liquidación se llaman bonoColacion / bonoMovilizacion.
  // Se leía `colacion` y `movilizacion`, que no existen: la base salía sin ellos.
  const colacion    = n(liq.bonoColacion ?? liq.colacion);
  const movilizacion = n(liq.bonoMovilizacion ?? liq.movilizacion);
  const viaticos    = n(liq.viaticos);
  const otrosNoImp  = n(liq.otrosNoImponibles);

  return sueldo + bono + otrosImp + grat + colacion + movilizacion + viaticos + otrosNoImp;
}

// ─── Feriado: conversión de días hábiles a días a pagar ──────────────────────
//
// El Art. 69 manda que el feriado comprenda los sábados, domingos y festivos
// que caigan DENTRO del período. La DT lo aplica corriendo el calendario desde
// el día siguiente al término del contrato, contando los días hábiles uno a uno
// y sumando los inhábiles que aparezcan en medio.
//
// Antes acá había un factor fijo de 21/15 = 1,4. Es una aproximación: el
// resultado real depende del día de la semana en que termina el contrato y de
// los festivos del tramo. En el ejemplo oficial de la DT —10,08 hábiles desde
// el 17-11-2021— el calendario da 14,08 y el factor da 14,11. En otros casos
// la diferencia es mucho mayor: 7,4 hábiles desde un 02-07-2026 dan 11,4 días
// por calendario contra 10,36 por factor, más de $55.000 en un sueldo de
// $1.600.000.
//
// Fuente: DT, "¿Cómo se calcula el feriado proporcional?" y Ord. 826/13.

/** Domingo de Pascua (algoritmo de Meeus/Jones/Butcher). */
function domingoPascua(anio) {
  const a = anio % 19, b = Math.floor(anio / 100), c = anio % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(anio, mes - 1, dia, 12);
}

const _iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * Festivos legales de un año.
 *
 * NO incluye los feriados regionales (Arica, Chillán, Ñuble) ni los electorales,
 * que se fijan por ley cada vez. Si un tramo de feriado cae sobre uno de esos,
 * el cálculo queda corto por un día y hay que ajustarlo a mano.
 */
function festivosChile(anio) {
  const F = new Set([
    '01-01', // Año Nuevo
    '05-01', // Día del Trabajo
    '05-21', // Glorias Navales
    '06-20', // Pueblos Indígenas
    '06-29', // San Pedro y San Pablo
    '07-16', // Virgen del Carmen
    '08-15', // Asunción
    '09-18', '09-19', // Fiestas Patrias
    '10-12', // Encuentro de Dos Mundos
    '10-31', // Iglesias Evangélicas
    '11-01', // Todos los Santos
    '12-08', // Inmaculada Concepción
    '12-25', // Navidad
  ].map((md) => `${anio}-${md}`));

  const p = domingoPascua(anio);
  const viernesSanto = new Date(p); viernesSanto.setDate(p.getDate() - 2);
  const sabadoSanto  = new Date(p); sabadoSanto.setDate(p.getDate() - 1);
  F.add(_iso(viernesSanto));
  F.add(_iso(sabadoSanto));
  return F;
}

/**
 * Días a pagar por un saldo de feriado expresado en días hábiles.
 *
 * Se cuenta desde el día siguiente al término. La fracción de día ocupa un día
 * hábil completo del calendario, pero se paga como fracción (Ord. 826/13).
 */
function diasFeriadoAPagar(diasHabiles, fechaTermino) {
  const n = Number(diasHabiles) || 0;
  if (n <= 0) return 0;
  const inicio = new Date(`${fechaTermino}T12:00:00`);
  if (isNaN(inicio)) return Math.round(n * (21 / 15) * 100) / 100;  // sin fecha, la aproximación

  const anio = inicio.getFullYear();
  const F = new Set([...festivosChile(anio), ...festivosChile(anio + 1)]);
  const inhabil = (d) => d.getDay() === 0 || d.getDay() === 6 || F.has(_iso(d));

  const enteros = Math.ceil(n);
  const d = new Date(inicio);
  let habiles = 0, inhabiles = 0;
  // Tope de seguridad: 400 iteraciones cubren cualquier saldo razonable.
  for (let i = 0; habiles < enteros && i < 400; i++) {
    d.setDate(d.getDate() + 1);
    if (inhabil(d)) inhabiles++; else habiles++;
  }
  return Math.round((n + inhabiles) * 100) / 100;
}

function calcularFiniquito(fin, contrato, trabajador) {
  const ult      = parseInt(fin.ultimaRemuneracion || contrato?.sueldoBase) || 0;
  const causal   = fin.causal || '';
  const fechaIng = contrato?.fechaInicio || trabajador?.fechaIngreso || '';
  const fechaTerm= fin.fechaTermino || '';
  const { anios, meses, dias, totalMeses } = calcularAntiguedad(fechaIng, fechaTerm);

  // ── Feriado proporcional (Art. 73 CT) ──
  //
  // El período corre desde la ÚLTIMA FECHA DE ANIVERSARIO del contrato, no desde
  // enero. Antes se usaba `dtTerm.getMonth() + 1`, o sea los meses del año
  // calendario: a alguien con 3 años 2 meses que sale en agosto se le pagaban
  // 7,9 meses de feriado en vez de los 2 que le corresponden.
  const dtTerm  = new Date(fechaTerm);
  const dtIng   = fechaIng ? new Date(fechaIng) : null;

  // El aniversario se busca avanzando año a año desde el ingreso, en vez de
  // saltar con `anios`. Antes dependía de que `calcularAntiguedad` acertara: si
  // devolvía un año de menos —o si `fechaIng` venía de otra fuente que la del
  // contrato— el aniversario quedaba a más de 12 meses del término, el
  // `Math.min(12, …)` lo topeaba en silencio y el finiquito pagaba los 15 días
  // completos como si fuera un año entero sin tomar vacaciones.
  //
  // Recorrer los aniversarios no puede equivocarse: por construcción el último
  // queda siempre dentro del año previo al término.
  let mesesFeriado = 0;
  let ultimoAniversario = null;
  if (dtIng && !isNaN(dtIng) && !isNaN(dtTerm) && dtTerm >= dtIng) {
    const aniv = new Date(dtIng);
    while (true) {
      const siguiente = new Date(aniv);
      siguiente.setFullYear(aniv.getFullYear() + 1);
      if (siguiente > dtTerm) break;
      aniv.setFullYear(aniv.getFullYear() + 1);
    }
    ultimoAniversario = aniv.toISOString().slice(0, 10);
    const diasDesdeAniv = Math.max(0, Math.round((dtTerm - aniv) / 86400000));
    // El tope de 12 queda como red de seguridad, no como parche: con el
    // recorrido anterior `diasDesdeAniv` nunca debería pasar de 365.
    mesesFeriado = Math.min(12, diasDesdeAniv / 30);
  }

  // 15 días HÁBILES al año (Art. 67), que se pagan agregando los días de
  // descanso comprendidos en el período (Art. 69).

  // El feriado NO se paga sobre la base del Art. 172.
  //
  // Art. 71: durante el feriado la remuneración íntegra es el SUELDO, para el
  // trabajador de remuneración fija. Y el Art. 41 inc. 2 deja fuera del
  // concepto de remuneración a la colación, la movilización y los viáticos,
  // que son compensatorios de un gasto, no contraprestación del trabajo.
  //
  // Son dos bases distintas para dos cosas distintas: indemnizar una salida
  // (Art. 172, base amplia) y pagar vacaciones no tomadas (Art. 71, sueldo).
  // Usar la base amplia acá pagaría vacaciones de más.
  const sueldoFeriado = parseInt(fin.sueldoBaseFeriado)
    || parseInt(contrato?.sueldoBase)
    || ult;
  const feriadoPropDias    = Math.round((15 / 12) * mesesFeriado * 10) / 10;
  const feriadoPendiente   = parseFloat(fin.diasFeriadoPendiente || 0);

  // Días efectivamente pagados: los hábiles más los sábados, domingos y
  // festivos que caen en medio, contados en el calendario real desde el día
  // siguiente al término (Art. 69). Van acá y no más arriba porque dependen de
  // `feriadoPropDias` y `feriadoPendiente`, declarados en estas líneas.
  const propCorridos = diasFeriadoAPagar(feriadoPropDias, fechaTerm);
  const pendCorridos = diasFeriadoAPagar(feriadoPendiente, fechaTerm);

  const feriadoPropMonto   = Math.round(sueldoFeriado / 30 * propCorridos);
  // Sugerencia: 15 días hábiles por cada año completo cumplido. Es el techo,
  // no el dato: hay que restarle lo que la persona ya tomó. El motor no lleva
  // registro de vacaciones tomadas, así que lo propone y la pantalla pide
  // confirmarlo en vez de asumir cero — que es lo que hacía antes, y dejaba
  // fuera del finiquito el feriado de los años anteriores.
  const feriadoPendSugerido = Math.max(0, anios * 15);
  const feriadoPendMonto   = Math.round(sueldoFeriado / 30 * pendCorridos);
  const totalFeriado       = feriadoPropMonto + feriadoPendMonto;
  const mesesEnAnioActual  = dtTerm.getMonth() + 1; // se conserva por compatibilidad
  // Detalle del feriado, para que el monto se pueda auditar sin abrir el código.
  const feriadoDetalle = {
    ultimoAniversario,
    mesesDesdeAniversario: Math.round(mesesFeriado * 10) / 10,
    diasProporcionales: feriadoPropDias,
    diasCorridosProp: propCorridos,
    diasCorridosPend: pendCorridos,
    valorDiaCorrido: sueldoFeriado ? Math.round(sueldoFeriado / 30) : 0,
    sueldoFeriado,
  };

  // ── Gratificación proporcional (Art. 50 CT) ──
  // 25% de lo devengado en el año, tope 4.75 IMM anual. Proporcional a meses.
  // Mismo criterio que la liquidación mensual: 25% de lo devengado CON TOPE de
  // 4,75 IMM al año, no el tope directo. El IMM se toma al de la fecha de
  // término, que es el que rige el finiquito.
  const gratAnualTope      = paramsDe(fin.fechaTermino).topeGratAnual;
  const gratMensualPagable = Math.min(ult * 0.25, gratAnualTope / 12);
  // Si la gratificación ya se paga mes a mes (garantizada), no corresponde
  // volver a pagarla acá: se controla con `fin.gratificacionYaPagada`.
  const gratPropMonto      = fin.gratificacionYaPagada === 'si'
    ? 0
    : Math.round(gratMensualPagable * mesesFeriado);

  // ── Remuneración del mes en curso (proporcional si no está pagada) ──
  const remMesEnCurso      = parseInt(fin.remMesEnCurso || 0);

  // ── Indemnización por años de servicio (Art. 163 CT) ──
  const tieneIndemnizacion = CAUSALES_CON_INDEMNIZACION.includes(causal)
    && (!contrato?.tipoContrato || contrato.tipoContrato.toLowerCase().includes('indefinido'))
    && anios >= 1;

  // Art. 163: la fracción superior a seis meses se cuenta como año completo.
  // Antes se truncaba: 3 años 7 meses pagaban 3 años en vez de 4.
  // "Fracción superior a seis meses": 6 meses y algunos días ya lo es.
  const aniosConFraccion   = anios + ((meses > 6 || (meses === 6 && dias > 0)) ? 1 : 0);
  const aniosIndemnizacion = Math.min(aniosConFraccion, TOPE_ANIOS_INDEMNIZACION);

  // Art. 172: la base no puede exceder 90 UF. El comentario anterior lo
  // mencionaba pero el tope no se aplicaba en ninguna parte.
  const topeIndem          = Math.round(90 * (fin.uf || paramsDe(fin.fechaTermino).ufFin));
  const baseIndem          = Math.min(ult, topeIndem);
  // Se expone para que la pantalla muestre de qué se compone la base: sin el
  // desglose, un número que no calza con el de la contraparte no se puede
  // discutir, solo desconfiar.
  const desgloseBase       = fin.desgloseBase || null;
  const baseTopeada        = ult > topeIndem;
  const indemMonto         = tieneIndemnizacion ? baseIndem * aniosIndemnizacion : 0;

  // ── Indemnización sustitutiva aviso previo (Art. 161 CT) ──
  // La indemnización sustitutiva del aviso previo usa la misma base topeada.
  // (La variable se llamaba `indemAvisoPrevio`, con "ем" en cirílico.)
  const indemAvisoPrevio   = fin.pagoAvisoPrevio === 'si' ? baseIndem : 0;

  // ── Remuneraciones pendientes (períodos anteriores no pagados) ──
  const remPendiente       = parseInt(fin.remuneracionesPendientes || 0);

  // ── Otros haberes manuales ──
  const otrosHaberes       = parseInt(fin.otrosHaberes || 0);

  // ── Descuentos previsionales del mes de término ──
  // Sobre la remuneración del mes en curso (si se está liquidando aquí)
  // Solo hay cotizaciones si el finiquito incluye remuneración del mes. El
  // feriado y las indemnizaciones no son imponibles: antes, sin remuneración
  // del mes, se cotizaba sobre la "última remuneración" completa.
  // El tipo de contrato se compara sin mayúsculas: TIPOS_CONTRATO dice
  // 'Plazo fijo' y la comparación exacta contra 'Plazo Fijo' fallaba, así que
  // a un plazo fijo se le descontaba 0,6% de AFC que no corresponde.
  const tasaAfp  = TASAS_AFP[trabajador?.afp] || TASAS.afp;
  const tc       = String(contrato?.tipoContrato || '').toLowerCase();
  const esCt     = tc.includes('plazo') || tc.includes('obra');
  const baseDesc = remMesEnCurso;
  const descAfp  = fin.aplicarDescuentos === 'si' ? Math.round(baseDesc * tasaAfp) : parseInt(fin.descAfp || 0);
  const descSalud= fin.aplicarDescuentos === 'si' ? Math.round(baseDesc * TASAS.salud) : parseInt(fin.descSalud || 0);
  const descCes  = fin.aplicarDescuentos === 'si' ? Math.round(baseDesc * (esCt ? TASAS.ces_trab_pf : TASAS.ces_trab)) : parseInt(fin.descCes || 0);
  const totalDescPrev = descAfp + descSalud + descCes;

  // ── Otros descuentos ──
  const anticipoPend       = parseInt(fin.anticipoPendiente || 0);
  const otrosDescuentos    = parseInt(fin.otrosDescuentos || 0);

  // ── Totales ──
  const totalHaberes    = totalFeriado + gratPropMonto + remMesEnCurso + remPendiente + indemMonto + indemAvisoPrevio + otrosHaberes;
  const totalDescuentos = totalDescPrev + anticipoPend + otrosDescuentos;
  const totalFiniquito  = totalHaberes - totalDescuentos;

  return {
    anios, meses, dias, totalMeses,
    mesesEnAnioActual,
    feriadoDetalle, mesesFeriado,
    feriadoPropDias, feriadoPropMonto,
    feriadoPendiente, feriadoPendMonto, totalFeriado, feriadoPendSugerido,
    gratPropMonto, gratAnualTope,
    remMesEnCurso, remPendiente, otrosHaberes,
    tieneIndemnizacion, aniosIndemnizacion, aniosConFraccion, indemMonto,
    baseIndem, baseTopeada, topeIndem, gratMensualPagable, desgloseBase,
    indemAvisoPrevio,
    descAfp, descSalud, descCes, totalDescPrev,
    anticipoPend, otrosDescuentos, totalDescuentos,
    totalHaberes, totalFiniquito,
    ultimaRemuneracion: ult,
  };
}

// ── Auto-relleno de haberes del finiquito desde remuneraciones del sistema ──
function calcularHaberesDesdeRemuneraciones(trabajadorId, contratos, remuneraciones, fechaTermino) {
  if (!trabajadorId || !fechaTermino) return {};

  const contrato = contratos?.find(c => c.trabajadorId === trabajadorId && c.estado === 'vigente')
    || contratos?.find(c => c.trabajadorId === trabajadorId);

  if (!contrato) return {};

  const dtTerm = new Date(fechaTermino);
  const anioTerm = dtTerm.getFullYear();
  const mesTerm  = dtTerm.getMonth() + 1;

  // Liquidaciones del trabajador
  const liqs = (remuneraciones || []).filter(r => r.trabajadorId === trabajadorId || r.contratoId === contrato.id);

  // ── 1. Última remuneración (mes anterior al término) ──
  const mesAnterior = mesTerm === 1 ? 12 : mesTerm - 1;
  const anioAnterior = mesTerm === 1 ? anioTerm - 1 : anioTerm;
  const liqMesAnt = liqs
    .filter(r => parseInt(r.mes) === mesAnterior && parseInt(r.anio) === anioAnterior)
    .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))[0];

  // Art. 172: la base es la última remuneración COMPLETA, no el sueldo base.
  const ultimaRemuneracion = String(baseArt172(liqMesAnt, contrato) || '');
  const desgloseBase = liqMesAnt ? {
    sueldoBase:   parseInt(liqMesAnt.sueldoBase) || parseInt(contrato.sueldoBase) || 0,
    gratificacion: liqMesAnt.gratificacion === false ? 0
      : Math.min(Math.round((parseInt(liqMesAnt.sueldoBase) || 0) * 0.25),
                 paramsDe(liqMesAnt)?.topeGratMensual || Infinity),
    bonoProduccion:   parseInt(liqMesAnt.bonoProduccion)   || 0,
    otrosImponibles:  parseInt(liqMesAnt.otrosImponibles)  || 0,
    colacion:         parseInt(liqMesAnt.bonoColacion ?? liqMesAnt.colacion)         || 0,
    movilizacion:     parseInt(liqMesAnt.bonoMovilizacion ?? liqMesAnt.movilizacion) || 0,
    viaticos:         parseInt(liqMesAnt.viaticos)         || 0,
    otrosNoImponibles:parseInt(liqMesAnt.otrosNoImponibles)|| 0,
    periodo: `${liqMesAnt.mes}/${liqMesAnt.anio}`,
  } : null;

  // ── 2. Remuneración del mes en curso (si no está liquidada) ──
  const liqMesActual = liqs.find(r => parseInt(r.mes) === mesTerm && parseInt(r.anio) === anioTerm);
  let remMesEnCurso = 0;
  if (!liqMesActual && ultimaRemuneracion) {
    // Proporcional: días trabajados en el mes hasta la fecha de término
    // Lo que se le debe del mes en curso se prorratea sobre el SUELDO BASE,
    // no sobre la base del Art. 172: esa base existe solo para indemnizar.
    const sueldoMes = parseInt(liqMesAnt?.sueldoBase) || parseInt(contrato.sueldoBase) || 0;
    const diasTrab = Math.min(30, dtTerm.getDate());
    remMesEnCurso = Math.round(sueldoMes * diasTrab / 30);
  }

  // ── 3. Feriado legal acumulado no gozado ──
  // Reconstruir desde registros de asistencia si hay o desde fecha de ingreso
  const fechaIng = contrato.fechaInicio || '';
  let diasFeriadoPendiente = 0;
  if (fechaIng) {
    const { anios: aniosTot, totalMeses } = calcularAntiguedad(fechaIng, fechaTermino);
    // Días devengados totales: 15 días/año × años completos + proporcional
    const diasDevengados = Math.floor(15 * (totalMeses / 12));
    // Días usados: buscar en liquidaciones o asumir 0 (campo diasFeriadoUsado)
    const diasUsados = liqs.reduce((s, r) => s + (parseInt(r.diasFeriadoUsado) || 0), 0);
    diasFeriadoPendiente = Math.max(0, diasDevengados - diasUsados);
  }

  // ── 4. Remuneraciones de meses anteriores sin pagar ──
  // Detectar meses del año con estado distinto a 'pagado'
  const mesesSinPagar = liqs.filter(r => {
    const anioR = parseInt(r.anio);
    const mesR  = parseInt(r.mes);
    return r.estado !== 'pagado'
      && (anioR < anioTerm || (anioR === anioTerm && mesR < mesTerm));
  });
  const remuneracionesPendientes = mesesSinPagar.reduce((s, r) => {
    const calc = calcularLiquidacion(r);
    return s + Math.max(0, calc.liquido);
  }, 0);

  return {
    ultimaRemuneracion: String(ultimaRemuneracion),
    desgloseBase,
    diasFeriadoPendiente: String(diasFeriadoPendiente),
    remuneracionesPendientes: String(Math.round(remuneracionesPendientes)),
    remMesEnCurso: String(remMesEnCurso),
    _mesesSinPagarDetalle: mesesSinPagar.map(r => ({
      mes: r.mes, anio: r.anio, estado: r.estado,
      liquido: Math.max(0, calcularLiquidacion(r).liquido),
    })),
    _liqMesAnt: liqMesAnt ? { mes: liqMesAnt.mes, anio: liqMesAnt.anio } : null,
    _remMesActualYaPagada: !!liqMesActual,
  };
}
function calcularIUT(renImponible, utm) {
  if (!renImponible || renImponible <= 0 || !utm || utm <= 0) return 0;
  const enUTM = renImponible / utm;
  const tramo = TRAMOS_IUT.find(t => enUTM > t.desde && enUTM <= t.hasta)
    || TRAMOS_IUT.at(-1);
  const impuesto = Math.max(0, Math.round((renImponible * tramo.tasa) - (tramo.rebaja * utm)));
  return impuesto;
}
// La UF ya no es una constante del módulo: llega en `calc.uf` desde
// parametros.js, resuelta por período. Esta función solo la usa de respaldo
// cuando le pasan un `calc` armado a mano sin período.
const UF_REFERENCIA = paramsDe(null).uf;

/**
 * Nombre completo del trabajador, a prueba de campos faltantes.
 *
 * Los `${t.nombre} ${t.apellidoPaterno} ${t.apellidoMaterno}` sueltos imprimen
 * la palabra "undefined" cuando falta un apellido, y eso terminó saliendo en el
 * PDF que firma el trabajador. Además limpia el literal "undefined"/"null" que
 * quedó guardado como texto en fichas creadas por importaciones antiguas: el
 * dato malo ya está en Firestore y corregirlo registro por registro es otra
 * tarea; mientras tanto, no tiene por qué verse.
 */
function nombreTrabajador(t, { apellidoPrimero = false } = {}) {
  const limpio = (v) => {
    const s = String(v ?? '').trim();
    return (!s || s === 'undefined' || s === 'null' || s === '.') ? '' : s;
  };
  const partes = apellidoPrimero
    ? [t?.apellidoPaterno, t?.apellidoMaterno, t?.nombre]
    : [t?.nombre, t?.apellidoPaterno, t?.apellidoMaterno];
  return partes.map(limpio).filter(Boolean).join(' ');
}

function calcularRentaTributable(calc) {
  // El APV en régimen B rebaja la base del impuesto único, con tope de 50 UF
  // mensuales. En régimen A no rebaja nada: la franquicia llega como
  // bonificación fiscal, no como menor impuesto.
  const topeApvB = Math.round(50 * (calc.uf || UF_REFERENCIA));
  const rebajaApv = calc.apvRegimen === 'B' ? Math.min(calc.apvM || 0, topeApvB) : 0;
  // El SIS NO se resta: es cotización de cargo del EMPLEADOR (Art. 59 DL 3.500).
  // No se le descuenta al trabajador, así que tampoco rebaja su renta
  // tributable. Restarlo bajaba la base y el impuesto salía por debajo del
  // correcto —$35.950 de base y $1.438 de impuesto en un sueldo de 2,2 MM—,
  // diferencia que el SII cobra después con reajuste e intereses.
  //
  // Lo que sí rebaja: AFP, salud y cesantía del trabajador (Art. 42 N°1 LIR).
  // La cotización de salud rebaja la base del impuesto único, PERO con tope:
  // el 7% del tope imponible (SII, Of. 2406/2016 y respuesta frecuente
  // 001.140.1468). Lo cotizado por sobre eso es tributable.
  //
  // En la práctica solo muerde cuando el plan pactado supera ese 7%: ahí la
  // diferencia vuelve a la base y paga impuesto.
  const topeSalud = calc.topeRebajaSalud || Infinity;
  const rebajaSalud = Math.min(calc.salM, topeSalud);
  return Math.max(0, calc.imponible - calc.afpM - rebajaSalud - calc.cesM - rebajaApv);
}
function calcularLiquidacionConIUT(rem, utm) {
  // Si no llega una UTM explícita se usa la del período liquidado. Antes caía a
  // UTM_DEFAULT (64.085, un valor de 2024): con una UTM baja el sueldo "vale"
  // más UTM de las que corresponde y el impuesto sale sobrestimado.
  const calc     = calcularLiquidacion(rem);
  const utmPeriodo = utm || calc.utm;
  const rentaTrib= calcularRentaTributable(calc);
  const iut      = calcularIUT(rentaTrib, utmPeriodo);
  const liquidoFinal = calc.liquido - iut;
  return {
    ...calc, rentaTrib, iut, liquidoFinal, utm: utmPeriodo,
    parametros: { ...calc.parametros, utm: utmPeriodo },
  };
}
// Horas que declara el contrato, sin considerar el tope legal todavía.
// Acepta el string de jornada o el contrato completo (para leer la jornada
// especial del Art. 22, que se guarda en `jornadaHorasSemanales`).
function horasDeclaradas(entrada, periodo) {
  const c = typeof entrada === 'string' ? { jornada: entrada } : (entrada || {});
  const j = c.jornada || '';
  const especial = parseFloat(c.jornadaHorasSemanales);

  // Jornada especial o turno con promedio pactado: manda el número del contrato.
  if (especial > 0) return especial;

  if (!j) return paramsDe(periodo).jornadaMaxima;
  if (j.includes('45')) return 45;
  if (j.includes('44')) return 44;
  if (j.includes('42')) return 42;
  if (j.includes('40')) return 40;
  if (j.includes('30')) return 30;
  if (j.includes('20')) return 20;

  // Turnos (7x7, 14x14, 4x3): son jornadas excepcionales del Art. 38, que la DT
  // autoriza justamente porque su PROMEDIO SEMANAL sobre el ciclo no excede el
  // máximo legal. El divisor correcto es ese promedio, no las horas de una
  // semana punta: un 14x14 de turnos de 12 hrs son 168 hrs en 28 días, o sea 42
  // semanales — no 98, que es lo que decía antes y hundía el valor de la hora
  // extra a menos de la mitad.
  //
  // Si el contrato declara su promedio en `jornadaHorasSemanales` se usa ese
  // (ya se resolvió arriba). Si no, se cae al máximo legal del período, que es
  // el supuesto conservador: nunca infla el divisor.
  if (/x/i.test(j) || j.toLowerCase().includes('turno')) {
    return paramsDe(periodo).jornadaMaxima;
  }

  return paramsDe(periodo).jornadaMaxima;
}

// ¿Es jornada ordinaria completa? Solo a ellas se les aplica el tope de la Ley
// 21.561. Las parciales (Art. 40 bis) ya están bajo el máximo por definición, y
// los turnos excepcionales autorizados por la DT promedian sobre el ciclo, no
// sobre la semana: topearlos acá cambiaría mal el cálculo de sobretiempo.
function esJornadaCompleta(entrada) {
  const c = typeof entrada === 'string' ? { jornada: entrada } : (entrada || {});
  const j = (c.jornada || '').toLowerCase();
  if (!j) return true;                       // sin dato: se asume completa
  if (j.includes('parcial')) return false;
  if (j.includes('turno') || j.includes('x')) return false;
  if (j === 'otro') return false;            // jornada especial pactada
  return true;
}

/**
 * Jornada ordinaria semanal aplicable, ya topeada por la ley del período.
 *
 * Ley 21.561: la rebaja se incorpora a los contratos por el solo ministerio de
 * la ley. Un contrato que dice "Completa (45 hrs)" tiene tope de 42 desde el
 * 26/04/2026 aunque nadie haya firmado un anexo — y ese es el divisor correcto
 * para la hora extra. Por eso se topea acá en vez de exigir editar contratos.
 */
function horasOrdinariasSemanales(jornada, periodo) {
  const declarada = horasDeclaradas(jornada, periodo);
  if (!esJornadaCompleta(jornada)) return declarada;
  return Math.min(declarada, paramsDe(periodo).jornadaMaxima);
}

/**
 * Valor de una hora extraordinaria (Art. 32 CT).
 *
 * Fórmula de la Dirección del Trabajo:
 *   sueldo diario        = sueldo mensual / 30
 *   sueldo semanal       = sueldo diario × 7
 *   valor hora ordinaria = sueldo semanal / jornada semanal
 *                        = (sueldo mensual × 7) / (jornada semanal × 30)
 *   hora extraordinaria  = valor hora ordinaria × (1 + recargo)
 *
 * La base es el SUELDO CONVENIDO para la jornada ordinaria (Art. 42 a): el
 * estipendio fijo. No entran bonos, colación, movilización ni gratificación.
 *
 * Piso legal: si no hay sueldo convenido — el caso de las remuneraciones
 * variables — o si el convenido es inferior al ingreso mínimo, es el ingreso
 * mínimo el que constituye la base del recargo. En jornada parcial el mínimo
 * es proporcional a las horas pactadas (Art. 44 inc. 3), así que el piso se
 * prorratea igual: aplicarlo completo a alguien de 20 hrs lo inflaría.
 *
 * El recargo del 50% es un mínimo legal; se puede pactar mayor, nunca menor.
 * Como el divisor sale de la jornada legal vigente, al bajar la jornada sin
 * bajar el sueldo el valor de la hora sube solo, que es justamente lo que
 * ordena la Ley 21.561.
 */
function valorHoraExtra(sueldoBase, jornada, periodo, recargo = 0.5) {
  const horas = horasOrdinariasSemanales(jornada, periodo);
  if (!horas) return 0;

  const P         = paramsDe(periodo);
  const proporcion = Math.min(1, horas / P.jornadaMaxima);
  const pisoIMM    = Math.round(P.imm * proporcion);
  const base       = Math.max(parseInt(sueldoBase) || 0, pisoIMM);

  return Math.round((base * 7) / (horas * 30) * (1 + recargo) * 100) / 100;
}

/**
 * Valor de la hora ordinaria, sin recargo. Útil para descuentos por atraso.
 * NO lleva el piso del ingreso mínimo: ese es específico del recargo por
 * sobretiempo del Art. 32 inc. 3 y no se extiende a otros usos.
 */
function valorHoraOrdinaria(sueldoBase, jornada, periodo) {
  const base  = parseInt(sueldoBase) || 0;
  const horas = horasOrdinariasSemanales(jornada, periodo);
  if (base <= 0 || !horas) return 0;
  return Math.round((base * 7) / (horas * 30));
}

function horasDiarias(jornada, periodo) {
  return Math.round(horasOrdinariasSemanales(jornada, periodo) / 5);
}
function analizarDia(reg, jornadaContrato) {
  const ordinarias = horasDiarias(jornadaContrato);
  const trabajadas = parseFloat(reg.horasTrabajadas) || 0;
  const extra      = Math.max(0, trabajadas - ordinarias);
  const exceso     = extra > 2; // Art. 31 CT: máx 2 hrs extra/día
  return { trabajadas, ordinarias, extra, exceso };
}
function resumenSemana(registrosSemana, jornadaContrato) {
  const totalExtra = registrosSemana.reduce((s, r) => {
    const { extra } = analizarDia(r, jornadaContrato);
    return s + extra;
  }, 0);
  const excesoSemanal = totalExtra > 12; // Art. 31 CT: máx 12 hrs extra/semana
  return { totalExtra, excesoSemanal };
}
function diasDelMes(anio, mes) {
  const y = parseInt(anio), m = parseInt(mes) - 1;
  const diasTotal = new Date(y, m + 1, 0).getDate();
  return Array.from({ length: diasTotal }, (_, i) => {
    const d = new Date(y, m, i + 1);
    return {
      fecha: `${anio}-${String(parseInt(mes)).padStart(2,'0')}-${String(i+1).padStart(2,'0')}`,
      diaSemana: d.getDay(), // 0=Dom … 6=Sáb
      esFinSemana: d.getDay() === 0 || d.getDay() === 6,
      dia: i + 1,
    };
  });
}
function generarTXTPrevired(liquidaciones, mes, anio) {
  // ─── Tablas de códigos Previred ───────────────────────────────────────────
  // Códigos de la Tabla de Equivalencias de Previred (institución previsional AFP).
  // Capital, Cuprum, ProVida y Uno estaban con el código equivocado.
  const COD_AFP = {
    'Cuprum':   '03', 'Habitat':  '05', 'ProVida':  '08',
    'PlanVital':'29', 'Capital':  '33', 'Modelo':   '34',
    'Uno':      '35',
  };
  const COD_JORNADA = {
    'Completa (45 hrs)': '07',
    'Parcial (30 hrs)':  '02',
    'Parcial (20 hrs)':  '02',
    'Turno 7x7':         '07',
    'Turno 14x14':       '07',
    'Turno 4x3':         '07',
  };

  // Descomponer RUT en número y DV (ej: "19.519.375-4" → ["19519375","4"])
  const splitRut = (rut) => {
    if (!rut) return ['', ''];
    const clean = rut.replace(/\./g, '').replace(/-/, ';').split(';');
    return [clean[0] || '', (clean[1] || '').toUpperCase()];
  };

  // Período MMAAAA
  const mesStr  = String(parseInt(mes)).padStart(2, '0');
  const periodo = `${mesStr}${anio}`;

  // Fecha DD/MM/AAAA
  const fmtFecha = (f) => {
    if (!f) return '';
    const [y, m, d] = f.split('-');
    return `${d}/${m}/${y}`;
  };

  // Tipo contrato Previred: D=indefinido, P=plazo fijo, O=obra
  const tipoCtto = (tipo) => {
    if (!tipo) return 'D';
    const t = tipo.toLowerCase();
    if (t.includes('indefinido')) return 'D';
    if (t.includes('plazo'))      return 'P';
    if (t.includes('obra'))       return 'O';
    return 'D';
  };

  const rows = liquidaciones.map(({ trabajador: trab, contrato, calc }) => {
    if (!trab || !contrato || !calc) return null;

    const [rutNum, dv] = splitRut(trab.rut);
    const esIsapre     = trab.prevision === 'Isapre' || (trab.prevision && trab.prevision !== 'FONASA');
    const esPF         = contrato.tipoContrato && (
      contrato.tipoContrato.toLowerCase().includes('plazo') || 
      contrato.tipoContrato.toLowerCase().includes('obra')
    );
    const codAfp       = COD_AFP[trab.afp] || '05';
    const codJornada   = COD_JORNADA[contrato.jornada] || '07';
    const diasTrab     = calc.diasTrab ?? 30;
    // Previred exige declarar los días de reposo: son los días por los que el
    // empleador NO cotiza, porque los cotiza la entidad pagadora del subsidio.
    // Antes iba fijo en 0 y el archivo quedaba descuadrado con la realidad.
    const diasLic      = calc.diasLicencia ?? 0;

    const rentaImp     = Math.round(calc.imponible || 0);
    const cotAfp       = Math.round(calc.afpM || 0);
    const cotSalud     = Math.round(calc.salM || 0);
    const cesTrab      = Math.round(calc.cesM || 0);
    const cesEmp       = Math.round(calc.cesEmpM || 0);
    const sis          = Math.round(calc.sisM || 0);
    const sueldoBase   = Math.round(calc.base || 0);
    const rentaBruta   = Math.round((calc.imponible || 0) + (calc.noImponible || 0));

    // 105 columnas en el orden exacto del formato Previred
    const fila = new Array(105).fill('');
    fila[0]  = rutNum;                        // RUT sin DV
    fila[1]  = dv;                            // DV
    fila[2]  = trab.apellidoPaterno || '';    // Apellido paterno
    fila[3]  = trab.apellidoMaterno || '';    // Apellido materno
    fila[4]  = trab.nombre || '';             // Nombres
    fila[5]  = trab.sexo || 'M';             // Sexo
    fila[6]  = '0';                           // Nacionalidad (0=chileno)
    fila[7]  = '01';                          // Tipo trabajador activo
    fila[8]  = periodo;                       // Período pago
    fila[9]  = periodo;                       // Período devengado
    fila[10] = 'AFP';                         // Institución previsional
    fila[11] = esIsapre ? '1' : '0';         // 0=FONASA, 1=ISAPRE
    fila[12] = String(diasTrab);              // Días trabajados
    fila[13] = String(diasLic);              // Días licencia
    fila[14] = String(trab.tramoAsignacion || '0'); // Tramo asignación familiar
    fila[15] = fmtFecha(contrato.fechaInicio);      // Fecha inicio contrato
    fila[16] = fmtFecha(contrato.fechaFin || '');   // Fecha fin contrato
    fila[17] = tipoCtto(contrato.tipoContrato);     // Tipo contrato
    fila[18] = String(trab.cargas || '0');           // Cargas familiares
    fila[19] = String(trab.cargasMaternales || '0'); // Cargas maternales
    fila[20] = String(trab.cargasInvalidez || '0'); // Cargas invalidez
    fila[21] = '0';
    fila[22] = '0';
    fila[23] = '0';
    fila[24] = 'N';                           // Trabajador pesado
    fila[25] = codAfp;                        // Código AFP
    fila[26] = String(rentaImp);              // Renta imponible
    fila[27] = String(cotAfp);               // Cotización AFP
    fila[28] = String(cotSalud);             // Cotización salud
    fila[29] = '0';
    // [30-53] vacíos
    fila[54] = '0';                           // Descuento adicional
    // [55-62] vacíos
    fila[63] = String(sueldoBase);           // Sueldo base
    // [64-68] vacíos
    fila[69] = String(sis);                  // SIS empleador
    // [70-71] vacíos
    fila[72] = '0';                           // Cotización adicional trabajo pesado
    fila[73] = '0';
    fila[74] = codJornada;                   // Tipo jornada
    // [75-80] vacíos
    fila[81] = '0';
    // [82-91] vacíos
    fila[92] = '1';                           // AFC habilitado
    fila[93] = String(cesTrab);             // Cotización AFC trabajador
    fila[94] = '';
    fila[95] = esPF ? '01' : '02';          // Tipo AFC (02=indefinido, 01=PF)
    fila[96] = String(rentaImp);             // Base cotización AFC
    fila[97] = String(cesEmp);              // Cotización AFC empleador
    fila[98] = '0';
    fila[99] = String(rentaBruta);          // Renta bruta total
    fila[100] = '0';                          // Anticipo
    fila[101] = String(cesEmp);             // Cesantía empleador (repetido col 97)
    fila[102] = '';
    fila[103] = '';
    fila[104] = codAfp;                      // Código AFP numérico (igual col 25)

    return fila.join(';');
  }).filter(Boolean);

  // Sin cabecera — Previred no usa header en el TXT
  return rows.join('\r\n');
}
// Nombres de día para el CSV de asistencia. Antes referenciaba un
// `DIAS_SEMANA` que solo existe dentro de AsistenciaSection, así que exportar
// el CSV lanzaba ReferenceError. Se indexa por getDay(): 0 = domingo.
const NOMBRE_DIA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

function exportarAsistenciaCSV(trabajador, contrato, registros, mes, anio) {
  const dias = diasDelMes(anio, mes);
  const header = 'FECHA;DIA;ESTADO;HORAS_TRAB;HORAS_EXTRA;OBSERVACION\n';
  const rows = dias.map(d => {
    const r = registros[d.fecha] || {};
    const { extra } = analizarDia(r, contrato?.jornada);
    return [
      d.fecha,
      NOMBRE_DIA[d.diaSemana] || '',
      r.estado || (d.esFinSemana ? 'fin_semana' : 'sin_registro'),
      r.horasTrabajadas || '',
      r.estado === 'trabajado' ? extra || '' : '',
      r.observacion || '',
    ].join(';');
  }).join('\n');
  const blob = new Blob(['\uFEFF' + header + rows], { type:'text/csv;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = `Asistencia_${trabajador?.apellidoPaterno}_${MESES[parseInt(mes)-1]}_${anio}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Arma el objeto que espera calcularLiquidacion() a partir de las tres piezas
 * que viven en colecciones distintas.
 *
 * Existe porque la AFP está en la ficha del trabajador, mientras que el resto
 * del cálculo sale del contrato y de la liquidación. Antes se llamaba con
 * `{ ...contrato, ...liq }` y `rem.afp` quedaba siempre undefined, así que todos
 * cotizaban a la tasa por defecto sin que nada lo advirtiera.
 *
 * Usar SIEMPRE este helper en vez de armar el objeto a mano.
 */
function remDe(trabajador, contrato, liq, extras) {
  return {
    ...(contrato || {}),
    ...(liq || {}),
    // Suma de los anticipos del período tomada de la colección `anticipos`.
    // Se pasa como extra y no dentro de `liq` para que el documento de la
    // liquidación no guarde una copia que quede desactualizada.
    ...(extras?.anticiposRegistrados !== undefined
      ? { anticiposRegistrados: extras.anticiposRegistrados }
      : {}),
    // Licencias del período tomadas de la colección `licencias`. Mismo criterio
    // que los anticipos: si hay registro manda sobre el campo manual, y no se
    // copia al documento de la liquidación para que no quede desactualizado.
    ...(extras?.licenciasRegistradas !== undefined
      ? { licenciasRegistradas: extras.licenciasRegistradas }
      : {}),
    // Ausencias del período (colección `ausencias`). Mismo criterio: viajan
    // como contexto del cálculo, no se copian al documento.
    ...(extras?.ausenciasRegistradas !== undefined
      ? { ausenciasRegistradas: extras.ausenciasRegistradas }
      : {}),
    afp:          trabajador?.afp          ?? contrato?.afp ?? liq?.afp,
    esPensionado: trabajador?.esPensionado === true,
    afectoAFC:    trabajador?.afectoAFC,
    apvMonto:      liq?.apvMonto      ?? trabajador?.apvMonto,
    apvRegimen:    liq?.apvRegimen    ?? trabajador?.apvRegimen,
    apvInstitucion:liq?.apvInstitucion?? trabajador?.apvInstitucion,
    prevision:    trabajador?.prevision    ?? contrato?.prevision,
    isapre:       trabajador?.isapre       ?? contrato?.isapre,
    planIsapre:   trabajador?.planIsapre   ?? contrato?.planIsapre,
    // Asignación familiar: el tramo y las cargas viven en la FICHA, igual que
    // la AFP. La liquidación puede sobrescribirlos si un mes hubo un cambio
    // (una carga que dejó de serlo, un cambio de tramo a mitad de período).
    tramoAsignacion:  liq?.tramoAsignacion  ?? trabajador?.tramoAsignacion,
    cargas:           liq?.cargas           ?? trabajador?.cargas,
    cargasMaternales: liq?.cargasMaternales ?? trabajador?.cargasMaternales,
    cargasInvalidez:  liq?.cargasInvalidez  ?? trabajador?.cargasInvalidez,
  };
}

/** Atajo: calcula la liquidación resolviendo la AFP desde la ficha. */
function liquidacionDe(trabajador, contrato, liq, extras) {
  return calcularLiquidacion(remDe(trabajador, contrato, liq, extras));
}

/**
 * Deja fuera las liquidaciones que fueron reemplazadas por una reliquidación.
 *
 * Una reliquidación contiene el mes completo recalculado, así que sumarla a la
 * original duplicaría el costo del período: el libro de remuneraciones, el
 * Previred, los asientos y el F29 verían dos meses de sueldo donde hay uno.
 * La original no se borra — sigue siendo el registro de lo que se transfirió
 * el día del pago — pero deja de contar para los totales.
 *
 * Si una liquidación se reliquidó más de una vez, solo sobrevive la última.
 *
 * USAR SIEMPRE antes de totalizar un período. Para listar documentos uno a
 * uno (una tabla, un historial) se usa la lista completa.
 */
function liquidacionesVigentes(liquidaciones) {
  const lista = liquidaciones || [];
  const reemplazadas = new Set();

  lista.forEach(l => {
    if (l?.liquidacionOriginalId) reemplazadas.add(l.liquidacionOriginalId);
  });

  return lista.filter(l => !reemplazadas.has(l.id));
}

/** ¿Este documento ya fue reemplazado por una reliquidación? */
function fueReliquidada(liq, liquidaciones) {
  return (liquidaciones || []).some(l => l?.liquidacionOriginalId === liq?.id);
}

export { diasEntre, alertaVencimiento, labelPeriodo, factorPeriodo,
  nombreTrabajador, diasVigentesEnPeriodo, parametrosEfectivos, baseArt172,
  calcularLiquidacion, remDe, liquidacionDe, redondearPar, liquidacionesVigentes, fueReliquidada, calcularAntiguedad, calcularFiniquito, calcularHaberesDesdeRemuneraciones,
  calcularIUT, calcularRentaTributable, calcularLiquidacionConIUT,
  horasOrdinariasSemanales, horasDeclaradas, valorHoraExtra, valorHoraOrdinaria,
  tramoSugerido, montoAsignacionFamiliar,
  horasDiarias, analizarDia, resumenSemana, diasDelMes,
  generarTXTPrevired, exportarAsistenciaCSV };
