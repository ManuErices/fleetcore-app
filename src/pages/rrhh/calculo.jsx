import { IMM_2026, IMM_2024, TASAS, TASAS_AFP, MESES, CAUSALES_TERMINO,
  CAUSALES_CON_INDEMNIZACION, TOPE_ANIOS_INDEMNIZACION, TIPOS_PERIODO,
  UTM_DEFAULT, TRAMOS_IUT } from './shared';

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
function calcularLiquidacion(rem) {
  // ── Factor 1: tipo de período (mensual / quincenal / semanal / turno) ──
  const fp = factorPeriodo(rem.tipoPeriodo);

  // ── Factor 2: días trabajados (Art. 55 CT — prorrateo por ausentismo) ──
  // Si el trabajador no trabajó los 30 días del mes, el sueldo base y los
  // haberes fijos se reducen proporcionalmente: valor_día = sueldo / 30.
  // Los bonos variables (producción, HE) NO se prorratean — corresponden
  // a lo efectivamente ganado. Colación y movilización sí se prorratean
  // porque son un apoyo al asistir al trabajo (criterio DT y Talana).
  const diasTrab   = parseInt(rem.diasTrabajados) >= 0 ? parseInt(rem.diasTrabajados) : 30;
  const fdias      = diasTrab / 30; // factor días: 1.0 cuando trabaja el mes completo

  // Sueldo base prorrateable
  const baseCompleto = parseInt(rem.sueldoBase) || 0;
  const base         = Math.round(baseCompleto * fp * fdias);

  // Bonos variables: no se prorratean por días (ya reflejan lo trabajado)
  const bProd  = parseInt(rem.bonoProduccion) || 0;
  const hExtra = parseInt(rem.horasExtra) || 0;
  const vHE    = parseInt(rem.valorHoraExtra) || 0;
  const semanasMap = { mensual:4, quincenal:2, semanal:1, turno:2 };
  const semanas    = semanasMap[rem.tipoPeriodo || 'mensual'] || 4;
  const montoHE    = hExtra * vHE * semanas;

  // No imponibles fijos: proporcionales a días asistidos
  const bColacion  = Math.round((parseInt(rem.bonoColacion) || 0)       * fp * fdias);
  const bMovil     = Math.round((parseInt(rem.bonoMovilizacion) || 0)   * fp * fdias);
  const viaticos   = parseInt(rem.viaticos) || 0;   // se ingresa por período directo
  const otrosImp   = parseInt(rem.otrosImponibles) || 0;
  const otrosNoImp = parseInt(rem.otrosNoImponibles) || 0;

  // Gratificación legal (Art. 50 CT): 25% de lo devengado por el trabajador,
  // CON TOPE de 4,75 ingresos mínimos mensuales al año (4,75 × IMM ÷ 12 al mes).
  //
  // Es un mínimo entre ambos, no el tope directo. Antes se pagaba siempre el
  // tope: un trabajador con sueldo base de $600.000 recibía $213.354 de
  // gratificación cuando le corresponden $150.000. El error inflaba el
  // imponible y con él AFP, salud, cesantía e impuesto de todos.
  const topeGrat  = IMM_2026 * 4.75 / 12;
  const baseGrat  = base + bProd + otrosImp;   // remuneración devengada del mes
  const gratMensual = Math.round(Math.min(baseGrat * 0.25, topeGrat * fp * fdias));

  // ── Base imponible previsional ──
  const imponible   = base + bProd + montoHE + otrosImp + gratMensual;
  // ── No imponible ──
  const noImponible = bColacion + bMovil + viaticos + otrosNoImp;

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
  const afpM  = Math.round(imponible * tasaAfp);
  const salM  = Math.round(imponible * TASAS.salud);
  const esCt  = rem.tipoContrato && (
    rem.tipoContrato.toLowerCase().includes('plazo') || 
    rem.tipoContrato.toLowerCase().includes('obra')
  );
  // AFC: indefinido 0,6% trabajador; plazo fijo/obra 0% (lo paga íntegro el empleador)
  const cesM  = esPensionado ? 0
    : Math.round(imponible * (esCt ? TASAS.ces_trab_pf : TASAS.ces_trab));
  // SIS: cargo empleador (referencial, no descuenta al trabajador)
  const sisM  = esPensionado ? 0 : Math.round(imponible * TASAS.sis);
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
  const anticipo      = parseInt(rem.anticipo) || 0;

  const liquido = imponible - totalDescuentos + noImponible - descAdicional - anticipo;

  return {
    base, bProd, montoHE, bColacion, bMovil, viaticos, otrosImp, otrosNoImp, gratMensual,
    imponible, noImponible,
    afpM, salM, sisM, cesM, apvM, apvRegimen, apvInstitucion: rem.apvInstitucion || '',
    totalDescuentos,
    descAdicional, anticipo, liquido,
    diasTrab, fdias,          // expuestos para auditoría / PDF
    baseCompleto, gratCompleto: Math.round(IMM_2026 * 4.75 / 12 * fp),
    tasaAfp, afpResuelta,
    esPensionado,
    cesEmpM: esPensionado ? 0 : Math.round(imponible * (esCt ? TASAS.ces_pf_emp : TASAS.ces_emp)),
    sisEmpM: esPensionado ? 0 : Math.round(imponible * TASAS.sis),
  };
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
function calcularFiniquito(fin, contrato, trabajador) {
  const ult      = parseInt(fin.ultimaRemuneracion || contrato?.sueldoBase) || 0;
  const causal   = fin.causal || '';
  const fechaIng = contrato?.fechaInicio || trabajador?.fechaIngreso || '';
  const fechaTerm= fin.fechaTermino || '';
  const { anios, meses, dias, totalMeses } = calcularAntiguedad(fechaIng, fechaTerm);

  // ── Feriado proporcional (Art. 73 CT) ──
  // 15 días hábiles anuales. Proporcional = (15/12) × meses trabajados en el año de término
  const dtTerm             = new Date(fechaTerm);
  const mesesEnAnioActual  = dtTerm.getMonth() + 1; // 1–12
  const diasEnMesActual    = dtTerm.getDate();
  // Fracción del mes actual: días trabajados / 30
  const fraccionMesActual  = Math.min(1, diasEnMesActual / 30);
  const mesesFeriado       = mesesEnAnioActual - 1 + fraccionMesActual;
  const feriadoPropDias    = Math.round((15 / 12) * mesesFeriado * 10) / 10;
  const feriadoPropMonto   = Math.round(ult / 30 * feriadoPropDias);
  const feriadoPendiente   = parseInt(fin.diasFeriadoPendiente || 0);
  const feriadoPendMonto   = Math.round(ult / 30 * feriadoPendiente);
  const totalFeriado       = feriadoPropMonto + feriadoPendMonto;

  // ── Gratificación proporcional (Art. 50 CT) ──
  // 25% de lo devengado en el año, tope 4.75 IMM anual. Proporcional a meses.
  // Usamos IMM_2026 vigente
  const gratAnualTope      = IMM_2026 * 4.75;
  const gratPropMonto      = Math.round(gratAnualTope / 12 * mesesFeriado);

  // ── Remuneración del mes en curso (proporcional si no está pagada) ──
  const remMesEnCurso      = parseInt(fin.remMesEnCurso || 0);

  // ── Indemnización por años de servicio (Art. 163 CT) ──
  const tieneIndemnizacion = CAUSALES_CON_INDEMNIZACION.includes(causal)
    && (!contrato?.tipoContrato || contrato.tipoContrato.toLowerCase().includes('indefinido'))
    && anios >= 1;
  const aniosIndemnizacion = Math.min(anios, TOPE_ANIOS_INDEMNIZACION);
  // Base indemnización = última remuneración mensual imponible (tope 90 UF ≈ referencial)
  const indemMonto         = tieneIndemnizacion ? ult * aniosIndemnizacion : 0;

  // ── Indemnización sustitutiva aviso previo (Art. 161 CT) ──
  const indемAvisoPrevio   = fin.pagoAvisoPrevio === 'si' ? ult : 0;

  // ── Remuneraciones pendientes (períodos anteriores no pagados) ──
  const remPendiente       = parseInt(fin.remuneracionesPendientes || 0);

  // ── Otros haberes manuales ──
  const otrosHaberes       = parseInt(fin.otrosHaberes || 0);

  // ── Descuentos previsionales del mes de término ──
  // Sobre la remuneración del mes en curso (si se está liquidando aquí)
  const tasaAfp  = TASAS_AFP[trabajador?.afp] || TASAS.afp;
  const descAfp  = fin.aplicarDescuentos === 'si' ? Math.round((remMesEnCurso || ult) * tasaAfp) : parseInt(fin.descAfp || 0);
  const descSalud= fin.aplicarDescuentos === 'si' ? Math.round((remMesEnCurso || ult) * TASAS.salud) : parseInt(fin.descSalud || 0);
  const esCt     = contrato?.tipoContrato === 'Plazo Fijo' || contrato?.tipoContrato === 'Obra o Faena';
  const descCes  = fin.aplicarDescuentos === 'si' ? Math.round((remMesEnCurso || ult) * (esCt ? TASAS.ces_trab_pf : TASAS.ces_trab)) : parseInt(fin.descCes || 0);
  const totalDescPrev = descAfp + descSalud + descCes;

  // ── Otros descuentos ──
  const anticipoPend       = parseInt(fin.anticipoPendiente || 0);
  const otrosDescuentos    = parseInt(fin.otrosDescuentos || 0);

  // ── Totales ──
  const totalHaberes    = totalFeriado + gratPropMonto + remMesEnCurso + remPendiente + indemMonto + indемAvisoPrevio + otrosHaberes;
  const totalDescuentos = totalDescPrev + anticipoPend + otrosDescuentos;
  const totalFiniquito  = totalHaberes - totalDescuentos;

  return {
    anios, meses, dias, totalMeses,
    mesesEnAnioActual, mesesFeriado,
    feriadoPropDias, feriadoPropMonto,
    feriadoPendiente, feriadoPendMonto, totalFeriado,
    gratPropMonto, gratAnualTope,
    remMesEnCurso, remPendiente, otrosHaberes,
    tieneIndemnizacion, aniosIndemnizacion, indemMonto,
    indемAvisoPrevio,
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

  const ultimaRemuneracion = liqMesAnt?.sueldoBase || contrato.sueldoBase || '';

  // ── 2. Remuneración del mes en curso (si no está liquidada) ──
  const liqMesActual = liqs.find(r => parseInt(r.mes) === mesTerm && parseInt(r.anio) === anioTerm);
  let remMesEnCurso = 0;
  if (!liqMesActual && ultimaRemuneracion) {
    // Proporcional: días trabajados en el mes hasta la fecha de término
    const diasTrab = dtTerm.getDate();
    remMesEnCurso = Math.round(parseInt(ultimaRemuneracion) * diasTrab / 30);
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
// Valor de la UF de referencia para el tope de APV en régimen B.
// El módulo no tenía ninguna constante de UF: revisar contra el valor vigente,
// o pasarlo por `calc.uf` cuando exista una fuente de indicadores en línea.
const UF_REFERENCIA = 39500;

function calcularRentaTributable(calc) {
  // El APV en régimen B rebaja la base del impuesto único, con tope de 50 UF
  // mensuales. En régimen A no rebaja nada: la franquicia llega como
  // bonificación fiscal, no como menor impuesto.
  const topeApvB = Math.round(50 * (calc.uf || UF_REFERENCIA));
  const rebajaApv = calc.apvRegimen === 'B' ? Math.min(calc.apvM || 0, topeApvB) : 0;
  return Math.max(0, calc.imponible - calc.afpM - calc.salM - calc.sisM - calc.cesM - rebajaApv);
}
function calcularLiquidacionConIUT(rem, utm) {
  const calc     = calcularLiquidacion(rem);
  const rentaTrib= calcularRentaTributable(calc);
  const iut      = calcularIUT(rentaTrib, utm || UTM_DEFAULT);
  const liquidoFinal = calc.liquido - iut;
  return { ...calc, rentaTrib, iut, liquidoFinal, utm: utm || UTM_DEFAULT };
}
function horasOrdinariasSemanales(jornada) {
  if (!jornada) return 45;
  if (jornada.includes('45')) return 45;
  if (jornada.includes('30')) return 30;
  if (jornada.includes('20')) return 20;
  if (jornada.includes('7x7'))   return 49; // 7 días × 7 hrs
  if (jornada.includes('14x14')) return 98; // referencial turno
  if (jornada.includes('4x3'))   return 28;
  return 45;
}
function horasDiarias(jornada) {
  return Math.round(horasOrdinariasSemanales(jornada) / 5);
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
    const diasLic      = 0;

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
function exportarAsistenciaCSV(trabajador, contrato, registros, mes, anio) {
  const dias = diasDelMes(anio, mes);
  const header = 'FECHA;DIA;ESTADO;HORAS_TRAB;HORAS_EXTRA;OBSERVACION\n';
  const rows = dias.map(d => {
    const r = registros[d.fecha] || {};
    const { extra } = analizarDia(r, contrato?.jornada);
    return [
      d.fecha,
      DIAS_SEMANA[d.diaSemana],
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
function remDe(trabajador, contrato, liq) {
  return {
    ...(contrato || {}),
    ...(liq || {}),
    afp:          trabajador?.afp          ?? contrato?.afp ?? liq?.afp,
    esPensionado: trabajador?.esPensionado === true,
    apvMonto:      liq?.apvMonto      ?? trabajador?.apvMonto,
    apvRegimen:    liq?.apvRegimen    ?? trabajador?.apvRegimen,
    apvInstitucion:liq?.apvInstitucion?? trabajador?.apvInstitucion,
    prevision:    trabajador?.prevision    ?? contrato?.prevision,
    isapre:       trabajador?.isapre       ?? contrato?.isapre,
    planIsapre:   trabajador?.planIsapre   ?? contrato?.planIsapre,
  };
}

/** Atajo: calcula la liquidación resolviendo la AFP desde la ficha. */
function liquidacionDe(trabajador, contrato, liq) {
  return calcularLiquidacion(remDe(trabajador, contrato, liq));
}

export { diasEntre, alertaVencimiento, labelPeriodo, factorPeriodo,
  calcularLiquidacion, remDe, liquidacionDe, calcularAntiguedad, calcularFiniquito, calcularHaberesDesdeRemuneraciones,
  calcularIUT, calcularRentaTributable, calcularLiquidacionConIUT,
  horasOrdinariasSemanales, horasDiarias, analizarDia, resumenSemana, diasDelMes,
  generarTXTPrevired, exportarAsistenciaCSV };
