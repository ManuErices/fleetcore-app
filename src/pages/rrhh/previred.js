/**
 * previred.js — src/pages/rrhh/previred.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Archivo de carga Previred: formato estándar de largo variable por separador,
 * 105 campos, versión 100 (septiembre 2026).
 *
 * Hasta acá el sistema no tenía archivo declarable: el botón "Previred" de
 * Remuneraciones llamaba a una función que no existía y "Previred avanzado"
 * bajaba un CSV resumen de 15 columnas que Previred no acepta.
 *
 * Reglas que vale la pena tener a la vista (todas del documento oficial):
 *
 *   · Una línea principal (tipo 00) por trabajador. Un segundo movimiento de
 *     personal va en una línea adicional (tipo 01) inmediatamente después.
 *   · Campo 28 = renta imponible × (tasa AFP del trabajador + 0,1% del
 *     empleador a la cuenta individual): es la columna "total a pagar" de los
 *     Indicadores Previred y así lo declara Talana.
 *   · SIS (29) y Expectativa de Vida (94) son del empleador INCLUSO con
 *     licencia: se calculan sobre la renta de los días trabajados más la RIMA
 *     proporcional a los días de licencia (92). Rentabilidad Protegida (95)
 *     solo por días trabajados.
 *   · Fecha desde/hasta solo con código de movimiento: si se informa fecha sin
 *     código, Previred rechaza el archivo completo.
 *   · Seguro de cesantía (100): renta topeada a 135,2 UF. Con licencia se
 *     informa la renta del mes anterior y el aporte del empleador va sobre ella.
 *
 * El formato de los campos que no aplican (vacío vs. 0) replica el archivo
 * real de Talana que la empresa ya sube a Previred.
 */

import { TASAS_AFP } from './shared';
import { paramsDe } from './parametros';

// ─── Tablas de equivalencia (documento oficial, v100) ────────────────────────

/** Tabla N°10 */
export const COD_AFP = {
  'Cuprum': '03', 'Habitat': '05', 'ProVida': '08', 'Provida': '08',
  'PlanVital': '29', 'Planvital': '29', 'Capital': '33', 'Modelo': '34', 'Uno': '35',
};

/** Tabla N°11 — instituciones APV que son AFP (3 dígitos). */
export const COD_APV_AFP = {
  'Cuprum': '003', 'Habitat': '005', 'ProVida': '008', 'Provida': '008',
  'PlanVital': '029', 'Planvital': '029', 'Capital': '033', 'Modelo': '034', 'Uno': '035',
};

/** Tabla N°16 */
export const COD_SALUD = {
  'Fonasa': '07', 'FONASA': '07',
  'Banmédica': '01', 'Banmedica': '01', 'Consalud': '02', 'Vida Tres': '03', 'VidaTres': '03',
  'Colmena': '04', 'Cruz Blanca': '05', 'Nueva Masvida': '10', 'Masvida': '10',
  'Isalud': '11', 'Fundación': '12', 'Cruz del Norte': '25', 'Esencial': '28',
};

/** Tabla N°20 — RUT de pagadores de subsidio. */
export const RUT_PAGADOR = {
  '07': '61603000-0',                                  // Fonasa
  '01': '96572800-7', '02': '96856780-2', '03': '96502530-8', '04': '76296619-0',
  '05': '96501450-0', '28': '96936100-0', '10': '96504160-5', '11': '76334370-7',
  '12': '71235700-2', '25': '79906120-1',
  'mutual1': '70360100-6', 'mutual2': '70285100-9', 'mutual3': '70015580-3', 'mutual0': '61533000-0',
};

/** Tasa de la cotización de salud que va a la CCAF para afiliados a Fonasa. */
const TASA_CCAF_FONASA = 0.006;

// ─── Utilidades de formato ───────────────────────────────────────────────────

/** Sin tildes ni caracteres especiales (Ñ → N), máximo 30. Como lo envía Talana. */
export function textoPrevired(s, largo = 30) {
  return String(s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z ]/g, ' ').replace(/\s+/g, ' ').trim()
    .slice(0, largo);
}

export function splitRut(rut) {
  const limpio = String(rut || '').replace(/[.\s]/g, '').toUpperCase();
  const i = limpio.lastIndexOf('-');
  if (i > 0) return [limpio.slice(0, i), limpio.slice(i + 1)];
  return [limpio.slice(0, -1), limpio.slice(-1)];
}

export function rutValido(rut) {
  const [num, dv] = splitRut(rut);
  if (!/^\d+$/.test(num) || !dv) return false;
  let suma = 0, mult = 2;
  for (let i = num.length - 1; i >= 0; i--) { suma += parseInt(num[i]) * mult; mult = mult === 7 ? 2 : mult + 1; }
  const r = 11 - (suma % 11);
  const esperado = r === 11 ? '0' : r === 10 ? 'K' : String(r);
  return esperado === dv;
}

/** 'YYYY-MM-DD' → 'DD/MM/YYYY' */
const fecha = (iso) => {
  const s = String(iso || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return '';
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y}`;
};

const ent = (n) => String(Math.max(0, Math.round(Number(n) || 0)));

// ─── Movimientos de personal del período ─────────────────────────────────────

/**
 * Movimientos del período, ordenados por prioridad para la línea principal.
 * Tabla N°7: 1 contratación indefinido · 2 retiro · 3 subsidios (licencia) ·
 * 4 permiso sin goce · 7 contratación plazo fijo · 8 cambio PF a indefinido ·
 * 11 otros ausentismos.
 */
export function movimientosDelPeriodo({ contrato, calc, mes, anio }) {
  const primero = `${anio}-${mes}-01`;
  const ultimo  = `${anio}-${mes}-${String(new Date(parseInt(anio), parseInt(mes), 0).getDate()).padStart(2, '0')}`;
  const dentro = (f) => f && f >= primero && f <= ultimo;
  const tc = String(contrato?.tipoContrato || '').toLowerCase();
  const esPF = tc.includes('plazo') || tc.includes('obra');
  const movs = [];

  if (dentro(contrato?.fechaInicio)) {
    movs.push({ codigo: esPF ? '7' : '1', desde: contrato.fechaInicio,
                hasta: esPF ? (contrato.fechaFin || '') : '' });
  }
  // Conversión a indefinido registrada por anexo (ver anexos.js)
  const conv = (contrato?.historialAnexos || []).find(h => h.tipo === 'conversion_indefinido' && dentro(h.vigenteDesde));
  if (conv) movs.push({ codigo: '8', desde: conv.vigenteDesde, hasta: '' });

  (calc?.detalleLic || []).forEach(l => {
    if (!(l.diasEnPeriodo > 0)) return;
    const desde = l.desde && l.desde > primero ? l.desde : primero;
    movs.push({ codigo: l.tipo === 'accidente' || l.tipo === 'profesional' ? '6' : '3',
                desde, hasta: l.hasta || ultimo, licencia: l });
  });

  (calc?.detalleAus || []).forEach(a => {
    const desde = a.fechaDesde && a.fechaDesde > primero ? a.fechaDesde : primero;
    movs.push({ codigo: String(a.tipo).includes('sin goce') ? '4' : '11',
                desde, hasta: a.fechaHasta || a.fechaDesde || desde });
  });

  if (dentro(contrato?.fechaFin) && !contrato?.renovado) {
    movs.push({ codigo: '2', desde: '', hasta: contrato.fechaFin });
  }
  return movs;
}

// ─── Línea principal ─────────────────────────────────────────────────────────

/**
 * Arma las líneas de un trabajador.
 *
 * @param p.trabajador, p.contrato, p.liq, p.calc  (calc = liquidacionDe con el contexto del período)
 * @param p.rimaMensual  renta imponible del mes anterior completo (para licencias)
 * @param p.config       { mutual, tasaMutual, ccaf, sucursalMutual, centroCosto }
 * @returns { lineas: string[], resumen, errores: string[], avisos: string[] }
 */
export function lineasTrabajador({ trabajador: t, contrato, liq, calc: c, rimaMensual, config = {}, mes, anio }) {
  const errores = [], avisos = [];
  const P = paramsDe({ mes, anio });
  const f = new Array(105).fill('');
  const F = (n, v) => { f[n - 1] = v; };   // campos numerados como en el documento

  const [rutNum, dv] = splitRut(t?.rut);
  if (!rutValido(t?.rut)) errores.push('RUT inválido (módulo 11)');
  const apPat = textoPrevired(t?.apellidoPaterno), apMat = textoPrevired(t?.apellidoMaterno), nom = textoPrevired(t?.nombre);
  if (apPat.length < 2) errores.push('apellido paterno');
  if (nom.length < 2) errores.push('nombres');
  const sexo = String(t?.sexo || '').trim().charAt(0).toUpperCase();
  if (!['M', 'F'].includes(sexo)) errores.push('sexo (M/F) en la ficha');
  const extranjero = t?.nacionalidad && !/chil/i.test(t.nacionalidad);

  const codAfp = COD_AFP[t?.afp];
  if (!codAfp) errores.push(`AFP "${t?.afp || 'vacía'}" sin código Previred`);
  const pensionado = c.esPensionado === true;
  // Tabla 5: 0 activo · 1 pensionado que cotiza · 2 pensionado que no cotiza
  const tipoTrab = pensionado ? (c.pensionadoCotiza ? '1' : '2') : '0';

  const periodo = `${mes}${anio}`;
  const movs = movimientosDelPeriodo({ contrato, calc: c, mes, anio });
  const principal = movs[0] || null;
  const dias = Math.max(0, Math.min(30, c.diasTrab ?? 30));
  if (dias === 0 && !principal) errores.push('0 días trabajados sin licencia ni movimiento registrado');

  const RI = c.baseCotiza || 0;                                       // ya topeada y proporcional
  const lic = movs.find(m => m.codigo === '3' || m.codigo === '6');
  const diasLic = c.diasLicencia || 0;
  // La RIMA proporcional la calcula el motor (y con ella SIS, EV, AFC
  // empleador y SANNA de los días de licencia): un solo número en todo el sistema.
  const rimaProp = c.rimaProp || 0;
  if (lic && diasLic > 0 && !(rimaProp > 0)) {
    errores.push('licencia sin liquidación del mes anterior para calcular la RIMA (o fíjala a mano en la liquidación)');
  }

  // ── Fonasa / isapre ──
  const isapre = !String(t?.prevision || 'fonasa').toLowerCase().includes('fonasa');
  const codSalud = isapre ? COD_SALUD[t?.isapre] : '07';
  if (isapre && !codSalud) errores.push(`isapre "${t?.isapre || 'vacía'}" sin código Previred`);
  if (isapre && !String(t?.numeroFUN || '').trim()) errores.push('N° de FUN de la isapre en la ficha');

  // ── Mutual / ISL ──
  const codMutual = String(config.mutual ?? 0).padStart(2, '0');
  const conMutual = codMutual !== '00';
  const tasaAT = Number(config.tasaMutual) > 0 ? Number(config.tasaMutual) : (c.tasaMutual || 0);
  if (!(tasaAT > 0)) errores.push('tasa de accidentes del trabajo (mutual/ISL) sin configurar');
  // Mutual: lo que calcula el motor (tasa sobre lo trabajado + SANNA sobre la RIMA).
  const cotAT = c.mutualM != null && Math.abs((c.tasaMutual || 0) - tasaAT) < 1e-9 ? c.mutualM : Math.round(RI * tasaAT + 1e-6);

  // ── CCAF ──
  const codCCAF = String(config.ccaf ?? 0).padStart(2, '0');
  const conCCAF = codCCAF !== '00';

  // ── Asignación familiar ──
  const cargas = (c.cargasSimp || 0) + (c.cargasMat || 0) + (c.cargasInv || 0);
  const tramo = cargas > 0 ? String(c.tramoAF || '').toUpperCase() : 'D';
  if (cargas > 0 && !['A', 'B', 'C'].includes(tramo)) errores.push('tramo de asignación familiar (A/B/C) con cargas registradas');
  const af = cargas > 0 ? (c.asigFamiliar || 0) : 0;

  // ── Seguro de cesantía ──
  const conSC = !c.sinAFC;
  const tc = String(contrato?.tipoContrato || '').toLowerCase();
  const esPF = tc.includes('plazo') || tc.includes('obra');
  const riSC  = conSC ? Math.min((c.baseCesantia || 0) + rimaProp, P.topeCesantia) : 0;
  const scEmp = conSC ? (c.cesEmpM || 0) : 0;

  // ── Campos ──
  F(1, rutNum); F(2, dv); F(3, apPat); F(4, apMat); F(5, nom);
  F(6, sexo); F(7, extranjero ? '1' : '0'); F(8, '01'); F(9, periodo); F(10, periodo);
  F(11, 'AFP'); F(12, tipoTrab); F(13, ent(dias)); F(14, '00');
  F(15, principal ? principal.codigo : '0');
  F(16, principal ? fecha(principal.desde) : ''); F(17, principal ? fecha(principal.hasta) : '');
  F(18, tramo);
  F(19, ent(c.cargasSimp)); F(20, ent(c.cargasMat)); F(21, ent(c.cargasInv));
  F(22, ent(af)); F(23, '0'); F(24, '0'); F(25, 'N');
  F(26, codAfp || '00');
  const cotizaAFP = !pensionado || c.pensionadoCotiza;
  F(27, ent(cotizaAFP ? RI : 0));
  // Trabajador + 0,1% del empleador; el pensionado que cotiza no genera el 0,1%.
  F(28, ent(cotizaAFP ? Math.round(RI * ((TASAS_AFP[t?.afp] || 0) + (pensionado ? 0 : (c.tasaCIEmp || 0))) + 1e-6) : 0));
  F(29, ent(pensionado ? 0 : c.sisM));
  F(30, ent(c.cuenta2M || 0));

  // APV individual (campos 40-44)
  if ((c.apvM || 0) > 0) {
    const codApv = String(t?.apvCodigoInstitucion || COD_APV_AFP[t?.apvInstitucion] || '').padStart(3, '0');
    if (!/^\d{3}$/.test(codApv) || codApv === '000') errores.push(`institución APV "${t?.apvInstitucion || 'vacía'}" sin código Previred`);
    F(40, codApv); F(41, ''); F(42, String(t?.apvFormaPago || '1'));   // Tabla 12: 1 directa (a la institución del APV), 2 indirecta (vía la AFP del trabajador)
    F(43, ent(c.apvM)); F(44, '0');
  }

  F(55, '0');
  const informaIPS = !isapre || !conMutual;                         // Fonasa o ISL
  F(64, ent(informaIPS ? RI : 0));
  F(70, ent(isapre ? 0 : RI * (conCCAF ? 0.07 - TASA_CCAF_FONASA : 0.07)));
  F(71, conMutual ? '' : ent(cotAT));
  F(73, ent(!conCCAF ? af : 0));
  F(74, '0');
  F(75, codSalud || '00');
  if (isapre) {
    F(76, String(t?.numeroFUN || '').slice(0, 16));
    F(77, ent(RI)); F(78, '1');
    F(79, ent(c.salM)); F(80, ent(c.salLegal)); F(81, ent(c.salAdicional));
  }
  F(82, '0');
  if (conCCAF) {
    F(83, codCCAF); F(84, ent(RI));
    F(90, ent(isapre ? 0 : RI * TASA_CCAF_FONASA));
    F(91, ent(af));
  }
  if (lic) F(92, ent(rimaProp));
  F(93, String(contrato?.jornada || '').toLowerCase().includes('parcial') ? '2' : '1');
  F(94, ent(pensionado ? 0 : c.cevEmpM));
  F(95, ent(pensionado ? 0 : c.crpEmpM));
  F(96, codMutual);
  F(97, ent(conMutual ? RI : 0));
  F(98, ent(conMutual ? cotAT : 0));
  F(99, String(config.sucursalMutual || '0'));
  F(100, ent(riSC));
  F(101, ent(conSC ? c.cesM : 0));
  F(102, ent(scEmp));
  if (lic) {
    const pag = lic.licencia?.entidad === 'mutual' ? RUT_PAGADOR[`mutual${parseInt(codMutual)}`]
      : RUT_PAGADOR[codSalud];
    if (pag) { const [r, d] = pag.split('-'); F(103, r); F(104, d); }
    else avisos.push('licencia: sin RUT de entidad pagadora conocido (campo 103), se deja en blanco');
  }
  F(105, String(config.centroCosto || ''));

  const lineas = [f.join(';')];

  // ── Líneas adicionales: segundo y siguientes movimientos (tipo 01) ──
  movs.slice(1).forEach(m => {
    const g = new Array(105).fill('');
    const G = (n, v) => { g[n - 1] = v; };
    G(1, rutNum); G(2, dv); G(3, apPat); G(4, apMat); G(5, nom); G(6, sexo); G(7, extranjero ? '1' : '0');
    G(8, '01'); G(9, periodo); G(10, periodo); G(11, 'AFP'); G(12, tipoTrab); G(13, '0'); G(14, '01');
    G(15, m.codigo); G(16, fecha(m.desde)); G(17, fecha(m.hasta)); G(18, tramo);
    for (let n = 19; n <= 24; n++) G(n, '0');
    G(25, 'N'); G(26, codAfp || '00'); G(27, '0'); G(28, '0'); G(30, '0');
    for (let n = 40; n <= 61; n++) G(n, '0');
    G(64, '0'); G(75, codSalud || '00');
    for (let n = 85; n <= 89; n++) G(n, '0');
    G(92, '0'); G(93, f[92]); G(96, codMutual); G(105, String(config.centroCosto || ''));
    lineas.push(g.join(';'));
  });

  if (lic) avisos.push(`licencia ${diasLic} días: SIS y Expectativa de Vida incluyen la RIMA proporcional ($${rimaProp.toLocaleString('es-CL')}); AFC empleador sobre la renta del mes anterior`);

  const resumen = {
    afp: Number(f[27]) + Number(f[29]),            // cotización + cuenta 2
    afpCodigo: codAfp, afpNombre: t?.afp,
    sis: Number(f[28]),
    fonasa: Number(f[69]), isapre: isapre ? Number(f[78]) : 0, isapreNombre: isapre ? t?.isapre : '',
    ccaf: conCCAF ? Number(f[89]) : 0,
    accidentes: conMutual ? Number(f[97]) : Number(f[70] || 0),
    seguroSocial: Number(f[93]) + Number(f[94]),
    cesantia: Number(f[100]) + Number(f[101]),
    apv: Number(f[42] || 0),
    asigFamiliar: af,
  };
  return { lineas, resumen, errores, avisos, movimientos: movs };
}

// ─── Archivo ─────────────────────────────────────────────────────────────────

export function nombreArchivoPrevired(rutEmpresa, mes, anio) {
  const rut = String(rutEmpresa || 'empresa').replace(/[.\-\s]/g, '');
  return `previred_${rut}_${anio}${mes}.txt`;
}

/** Descarga el TXT: líneas separadas por CRLF, sin encabezado, ASCII. */
export function descargarPrevired(lineas, nombre) {
  const txt = lineas.join('\r\n') + '\r\n';
  const blob = new Blob([txt], { type: 'text/plain;charset=us-ascii' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nombre; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
