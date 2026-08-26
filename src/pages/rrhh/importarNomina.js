/**
 * importarNomina.js — src/pages/rrhh/importarNomina.js
 * ─────────────────────────────────────────────────────
 * Mapeo y validación de la planilla "Lista de Empleados" (export Talana)
 * hacia el esquema REAL del módulo RRHH:
 *
 *   empresas/{empresaId}/trabajadores  → ficha (mismos campos que TrabajadorModal)
 *   empresas/{empresaId}/contratos     → contrato vigente (mismos campos que ContratoModal)
 *
 * Funciones puras: no toca Firestore ni React.
 */

import { REGIONES_COMUNAS, AFPS, ISAPRES, TIPOS_CONTRATO } from './shared';

// ═══════════════════════════════════════════════════════════
// Normalización de texto
// ═══════════════════════════════════════════════════════════

/** Sin tildes, sin dobles espacios, minúsculas. Para comparar, nunca para guardar. */
const norm = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

const vacio = (v) =>
  v === null || v === undefined || (typeof v === 'string' && v.trim() === '');

/** Limpia y recorta. Devuelve '' (no null) porque los inputs del modal son controlados. */
const txt = (v) => (vacio(v) ? '' : String(v).replace(/\s+/g, ' ').trim());
const txtUp = (v) => txt(v).toUpperCase();

/** Convierte una fila cruda de SheetJS a llaves normalizadas. */
function normalizarFila(row) {
  const out = {};
  for (const k of Object.keys(row)) out[norm(k)] = row[k];
  return out;
}

/** Lee una columna de la planilla por su nombre (tolerante a tildes/mayúsculas). */
const col = (row, nombre) => row[norm(nombre)];

// ═══════════════════════════════════════════════════════════
// Parsers de valor
// ═══════════════════════════════════════════════════════════

/** "$ 1.150.000" → 1150000 · "$ " → '' · 38.5 → 38.5 */
export function montoCLP(v) {
  if (vacio(v)) return '';
  if (typeof v === 'number') return Number.isFinite(v) ? v : '';
  const limpio = String(v).replace(/\$/g, '').replace(/\s/g, '').replace(/\./g, '').replace(/,/g, '.');
  if (limpio === '' || limpio === '-') return '';
  const n = Number(limpio);
  return Number.isFinite(n) ? n : '';
}

export function numero(v) {
  if (vacio(v)) return '';
  if (typeof v === 'number') return Number.isFinite(v) ? v : '';
  const n = Number(String(v).replace(',', '.').replace(/[^\d.\-]/g, ''));
  return Number.isFinite(n) ? n : '';
}

const EPOCA_EXCEL = Date.UTC(1899, 11, 30);

/**
 * Devuelve "YYYY-MM-DD" — el formato que consumen los <input type="date"> del módulo.
 * Acepta Date (SheetJS con cellDates), serial de Excel, "17-02-2026" y "2026-02-17".
 */
export function fechaISO(v) {
  if (vacio(v)) return '';

  if (v instanceof Date && !isNaN(v)) {
    return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`;
  }

  if (typeof v === 'number' && Number.isFinite(v)) {
    if (v < 25569 || v > 73415) return ''; // fuera de 1970–2100: no es una fecha
    return new Date(EPOCA_EXCEL + Math.round(v) * 86400000).toISOString().slice(0, 10);
  }

  const s = String(v).trim();
  const dmy = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  const ymd = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (ymd) return `${ymd[1]}-${ymd[2].padStart(2, '0')}-${ymd[3].padStart(2, '0')}`;
  return '';
}

export function siNo(v) {
  if (vacio(v)) return null;
  if (typeof v === 'boolean') return v;
  const s = norm(v);
  if (['si', 's', 'true', '1', 'x'].includes(s)) return true;
  if (['no', 'n', 'false', '0'].includes(s)) return false;
  return null;
}

// ── RUT ────────────────────────────────────────────────────
// El TrabajadorModal guarda el RUT CON puntos ("12.306.683-9"). La planilla lo
// trae sin ellos. Guardamos en el formato del modal para que la búsqueda, la
// ficha y Previred vean siempre lo mismo.

/** Solo dígitos + DV, sin puntos ni guión. Se usa como clave de comparación. */
export function rutPlano(v) {
  if (vacio(v)) return '';
  const limpio = String(v).replace(/[.\s-]/g, '').toUpperCase();
  return /^\d{6,9}[\dK]$/.test(limpio) ? limpio : '';
}

/** "12306683-9" → "12.306.683-9" (idéntico a formatRut() del TrabajadorModal). */
export function formatRut(v) {
  const plano = rutPlano(v);
  if (!plano) return '';
  const cuerpo = plano.slice(0, -1);
  const dv = plano.slice(-1);
  return `${cuerpo.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}-${dv}`;
}

/** Verifica el dígito verificador (módulo 11). */
export function rutValido(v) {
  const plano = rutPlano(v);
  if (!plano) return false;
  const cuerpo = plano.slice(0, -1);
  let suma = 0, mult = 2;
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += Number(cuerpo[i]) * mult;
    mult = mult === 7 ? 2 : mult + 1;
  }
  const resto = 11 - (suma % 11);
  const esperado = resto === 11 ? '0' : resto === 10 ? 'K' : String(resto);
  return esperado === plano.slice(-1);
}

// ═══════════════════════════════════════════════════════════
// Normalizadores de dominio
// ═══════════════════════════════════════════════════════════

/**
 * La planilla escribe "Planvital" y "Provida"; TASAS_AFP y COD_AFP usan
 * "PlanVital" y "ProVida". Sin esta traducción, TASAS_AFP[afp] da undefined
 * y el cálculo cae al fallback de Habitat.
 */
export function normalizarAfp(v) {
  const s = norm(v);
  if (!s || s === 'sin afp') return '';
  const exacta = AFPS.find((a) => norm(a) === s);
  return exacta || txt(v); // si es una AFP nueva, se conserva tal cual y se avisa
}

/** "Fonasa"/"Colmena"/"Banmedica" → { prevision, isapre } del esquema del modal. */
export function normalizarSalud(isapreCol, moneda, monto) {
  const s = norm(isapreCol);
  if (!s || s === 'fonasa') return { prevision: 'FONASA', isapre: '', planIsapre: '' };

  const exacta = ISAPRES.find((i) => norm(i) === s);
  const nombre = exacta || txt(isapreCol);

  // El plan viene partido en dos columnas: "UF" + 6.42 → "6,42 UF"
  const m = numero(monto);
  const u = txt(moneda);
  const plan = m !== '' && u && u !== '%' ? `${String(m).replace('.', ',')} ${u}`.trim() : '';

  return { prevision: 'Isapre', isapre: nombre, planIsapre: plan };
}

/** Resuelve la región contra REGIONES_COMUNAS, que usa nombres oficiales. */
export function normalizarRegion(regionCol, comunaCol) {
  const regiones = Object.keys(REGIONES_COMUNAS);
  const r = norm(regionCol).replace(/^(de la|de los|de las|del|de)\s+/, '');

  // 1. Coincidencia por contención en cualquier sentido
  //    ("metropolitana" ⊂ "metropolitana de santiago", "araucania" ⊂ "la araucania")
  if (r) {
    const hit = regiones.find((k) => {
      const nk = norm(k).replace(/^(la|los|las|el)\s+/, '');
      return nk === r || nk.includes(r) || r.includes(nk);
    });
    if (hit) return hit;
  }

  // 2. La planilla trae basura como "Chile" en la columna región.
  //    Se deduce la región a partir de la comuna, que sí es confiable.
  const c = norm(comunaCol);
  if (c) {
    const hit = regiones.find((k) => REGIONES_COMUNAS[k].some((x) => norm(x) === c));
    if (hit) return hit;
  }
  return '';
}

/** Devuelve la comuna con la ortografía exacta de REGIONES_COMUNAS, o '' si no calza. */
export function normalizarComuna(region, comunaCol) {
  const c = norm(comunaCol);
  if (!c || !region || !REGIONES_COMUNAS[region]) return '';
  return REGIONES_COMUNAS[region].find((x) => norm(x) === c) || '';
}

/** "Plazo Fijo" → "Plazo fijo" (el valor exacto de TIPOS_CONTRATO). */
export function normalizarTipoContrato(v) {
  const s = norm(v);
  const exacto = TIPOS_CONTRATO.find((t) => norm(t) === s);
  if (exacto) return exacto;
  if (s.includes('obra') || s.includes('faena')) return 'Por obra o faena';
  if (s.includes('plazo')) return 'Plazo fijo';
  return 'Indefinido';
}

/**
 * La planilla usa vocabulario de Talana ("Jornada Excepcional", "Artículo 22")
 * y las horas/días reales van en columnas aparte. JORNADAS del sistema usa otro
 * vocabulario, y COD_JORNADA de Previred depende de él.
 */
export function normalizarJornada(jornadaCol, diasCol, horasCol) {
  const s = norm(jornadaCol);
  const dias = numero(diasCol);
  const horas = numero(horasCol);
  const original = txt(jornadaCol);

  const extra = {
    jornadaOriginal: original,
    jornadaHorasSemanales: horas === '' ? '' : String(horas),
    jornadaDescripcion: '',
  };

  // Turnos: los días de la jornada mandan sobre la etiqueta
  if (s.includes('excepcional') || s.includes('turno')) {
    if (dias === 14 || dias === 13) return { jornada: 'Turno 14x14', ...extra };
    if (dias === 7) return { jornada: 'Turno 7x7', ...extra };
    if (dias === 4) return { jornada: 'Turno 4x3', ...extra };
    return {
      jornada: 'Otro',
      ...extra,
      jornadaDescripcion: `${original}${dias !== '' ? ` — ${dias} días` : ''} (Art. 38 inc. 7 y 8 CT)`,
    };
  }

  if (s.includes('articulo 22') || s.includes('art. 22')) {
    return {
      jornada: 'Otro',
      ...extra,
      jornadaDescripcion: 'Art. 22 CT — trabajador excluido del límite de jornada',
    };
  }

  if (s.includes('lunes a viernes') || s.includes('lunes a sabado')) {
    if (horas !== '' && horas <= 30) return { jornada: 'Parcial (30 hrs)', ...extra };
    return { jornada: 'Completa (45 hrs)', ...extra, jornadaDescripcion: '' };
  }

  return { jornada: 'Otro', ...extra, jornadaDescripcion: original };
}

/** "+56956686995" o "951784306" → { codigoPais, telefono } como los guarda el modal. */
export function normalizarTelefono(v) {
  const d = String(v ?? '').replace(/\D/g, '');
  if (!d) return { codigoPais: '+56', telefono: '' };
  if (d.startsWith('56') && d.length >= 10) return { codigoPais: '+56', telefono: `+${d}` };
  return { codigoPais: '+56', telefono: `+56${d}` };
}

/** "MOD"/"MOI" → clasificación que consumen Payroll y Consolidado. */
export function normalizarManoObra(v) {
  const s = norm(v);
  if (s === 'mod' || s.includes('directa')) return { tipoManoObra: 'DIRECTO', tipo: 'OPERADOR' };
  if (s === 'moi' || s.includes('indirecta')) return { tipoManoObra: 'INDIRECTO', tipo: 'GASTO_GENERAL' };
  return { tipoManoObra: '', tipo: 'OPERADOR' };
}

export function normalizarSexo(v) {
  const s = norm(v);
  if (s === 'm' || s === 'masculino') return 'masculino';
  if (s === 'f' || s === 'femenino') return 'femenino';
  return '';
}

/** La planilla mezcla "Soltero"/"Soltera". Se unifica al masculino, como el resto del módulo. */
export function normalizarEstadoCivil(v) {
  const s = norm(v);
  const mapa = {
    soltero: 'Soltero', soltera: 'Soltero',
    casado: 'Casado', casada: 'Casado',
    viudo: 'Viudo', viuda: 'Viudo',
    divorciado: 'Divorciado', divorciada: 'Divorciado',
    separado: 'Separado', separada: 'Separado',
  };
  return mapa[s] || txt(v);
}

/** Arma el string plano de dirección que espera la ficha. */
function armarDireccion(calle, numero, depto) {
  const linea1 = [txt(calle), txt(numero)].filter(Boolean).join(' ');
  const d = txt(depto);
  return [linea1, d].filter(Boolean).join(', ');
}

// ═══════════════════════════════════════════════════════════
// Fila → { ficha, contrato }
// ═══════════════════════════════════════════════════════════

export function filaAFicha(rowCruda, indice) {
  const row = normalizarFila(rowCruda);
  const errores = [];
  const avisos = [];

  const rutCrudo = col(row, 'RUT');
  const rut = formatRut(rutCrudo);

  const nombre = txt(col(row, 'Nombre'));
  const apePat = txt(col(row, 'Apellido Paterno'));
  const apeMat = txt(col(row, 'Apellido Materno'));

  const region = normalizarRegion(col(row, 'Región'), col(row, 'Comuna'));
  const comuna = normalizarComuna(region, col(row, 'Comuna'));
  const { codigoPais, telefono } = normalizarTelefono(col(row, 'Celular'));

  const afpCruda = txt(col(row, 'AFP'));
  const afp = normalizarAfp(afpCruda);
  const salud = normalizarSalud(col(row, 'Isapre'), col(row, 'Moneda Isapre'), col(row, 'Monto Pactado Isapre'));
  const mo = normalizarManoObra(col(row, 'MO Directa O Indirecta'));

  const cargo = txtUp(col(row, 'Cargo'));
  const empresa = txt(col(row, 'Razón Social'));
  const fechaIngreso = fechaISO(col(row, 'Fecha de Ingreso'));
  const emailCorp = txt(col(row, 'Email')).toLowerCase();
  const emailPers = txt(col(row, 'Email Personal')).toLowerCase();

  const vigente = siNo(col(row, 'Vigente'));
  const motivoEgreso = txt(col(row, 'Motivo de Egreso'));

  // ── FICHA: campos idénticos a los del TrabajadorModal ────
  const ficha = {
    // Datos personales
    nombre,
    apellidoPaterno: apePat,
    apellidoMaterno: apeMat,
    rut,
    fechaNacimiento: fechaISO(col(row, 'Fecha nacimiento')),
    nacionalidad: txt(col(row, 'Nacionalidad')) || 'Chilena',
    direccion: armarDireccion(col(row, 'Calle'), col(row, 'Número'), col(row, 'Departamento')),
    region,
    comuna,
    codigoPais,
    telefono,
    email: emailCorp || emailPers,

    // Datos laborales
    empresa,
    area: txt(col(row, 'Gerencia 1')),
    cargo,
    fechaIngreso,
    estado: motivoEgreso ? 'finiquitado' : vigente === false ? 'inactivo' : 'activo',
    observaciones: '',

    // Previsión y salud
    afp,
    prevision: salud.prevision,
    isapre: salud.isapre,
    planIsapre: salud.planIsapre,

    // Compatibilidad WorkFleet / Payroll
    tipo: mo.tipo,
    tipoManoObra: mo.tipoManoObra,
    esSurtidor: /combustible/i.test(cargo),
    projectId: null,

    // ── Campos nuevos que el módulo ya consume o necesita ──
    // Archivo de Pago lee banco + nroCuenta y hoy no hay dónde cargarlos
    banco: txtUp(col(row, 'Sueldo - Banco')),
    tipoCuenta: txt(col(row, 'Sueldo - Tipo de Cuenta')),
    nroCuenta: txt(col(row, 'Sueldo - Cuenta Corriente')),
    formaPago: txt(col(row, 'Forma de Pago')),

    // Centro de costo — lo usan Payroll y Consolidado
    centroCosto: txt(col(row, 'Nombre Centro Costo 1')),
    codigoCentroCosto: txt(col(row, 'Código Centro Costo 1')),

    // Ficha ampliada
    subArea: txt(col(row, 'Gerencia 2')),
    sucursal: txt(col(row, 'Sucursal')),
    sexo: normalizarSexo(col(row, 'Sexo')),
    estadoCivil: normalizarEstadoCivil(col(row, 'Estado Civíl')),
    profesion: txt(col(row, 'Profesión')),
    emailPersonal: emailPers,
    telefonoAlternativo: txt(col(row, 'Otro Teléfono')),
    jefeDirecto: txt(col(row, 'Jefe')),
    rutJefeDirecto: formatRut(col(row, 'Rut Jefe')),
    esPensionado: norm(col(row, '¿es pensionado?')) === 's' || norm(col(row, '¿es pensionado?')) === 'c',
    afpDescuentoAdicional: numero(col(row, '% Descuento Adicional AFP')),
    contactoEmergencia: txt(col(row, 'CONTACTO DE EMERGENCIA')),
    telefonoEmergencia: txt(col(row, 'N° DE EMERGENCIA')),
    tallaChaleco: txtUp(col(row, 'Talla chaleco')),
    numeroCalzado: txt(col(row, 'Numero de calzado')),
    calificacionManoObra: txt(col(row, 'Mano de obra')),
    origenTrabajador: txt(col(row, 'Indicar si el trabajador es local o externo')),
    firmaDigitalEnrolada: siNo(col(row, 'Enrolado Firma Digital')) === true,

    // Trazabilidad del import
    importadoDesde: 'planilla_talana',
  };

  // ── CONTRATO: campos idénticos a los del ContratoModal ───
  const j = normalizarJornada(col(row, 'Jornada'), col(row, 'Días de la Jornada'), col(row, 'Horas de la Jornada'));
  const tipoContrato = normalizarTipoContrato(col(row, 'Tipo de Contrato'));
  const fechaFin = fechaISO(col(row, 'Contrato hasta'));

  const contrato = {
    trabajadorId: '', // lo completa el importador con el id del doc recién creado
    tipoContrato,
    fechaInicio: fechaIngreso,
    fechaFin: tipoContrato === 'Indefinido' ? '' : fechaFin,
    cargo,
    empresa,
    jornada: j.jornada,
    jornadaHorasSemanales: j.jornadaHorasSemanales,
    jornadaHoraEntrada: '',
    jornadaHoraSalida: '',
    jornadaDias: [],
    jornadaDescripcion: j.jornadaDescripcion,
    jornadaOriginal: j.jornadaOriginal,
    sueldoBase: montoCLP(col(row, 'Sueldo Base')),
    bonoColacion: montoCLP(col(row, 'Colación')),
    bonoMovilizacion: montoCLP(col(row, 'Movilización')),
    viatico: montoCLP(col(row, 'Viatico')),
    liquidoPactado: montoCLP(col(row, 'Sueldo Liquido')),
    horarioColacion: '',
    lugarTrabajo: txt(col(row, 'Sucursal')) || txt(col(row, 'Lugar prestación de servicios')),
    estado: 'vigente',
    observaciones: `Importado desde planilla · jornada original: ${j.jornadaOriginal || '—'}`,
    importadoDesde: 'planilla_talana',
  };

  // ── Validaciones bloqueantes ─────────────────────────────
  if (vacio(rutCrudo)) errores.push('Falta el RUT');
  else if (!rut) errores.push(`RUT ilegible: "${rutCrudo}"`);
  else if (!rutValido(rut)) errores.push(`Dígito verificador incorrecto en ${rut}`);

  if (!nombre) errores.push('Falta el nombre');
  if (!apePat) errores.push('Falta el apellido paterno');

  // El ContratoModal exige trabajador + fecha inicio + sueldo base
  if (!fechaIngreso) errores.push('Sin fecha de ingreso — no se puede crear el contrato');
  if (contrato.sueldoBase === '' || contrato.sueldoBase === 0) {
    errores.push('Sin sueldo base — no se puede crear el contrato');
  }

  // ── Avisos: se importa igual, pero conviene revisarlo ────
  if (afpCruda && !afp) avisos.push('Sin AFP (queda vacío en la ficha)');
  else if (afpCruda && !AFPS.some((a) => norm(a) === norm(afp))) {
    avisos.push(`AFP "${afpCruda}" no está en el catálogo — falta agregarla a AFPS, TASAS_AFP y COD_AFP`);
  }
  if (!region) avisos.push(`Región "${txt(col(row, 'Región'))}" no reconocida`);
  else if (!comuna) avisos.push(`Comuna "${txt(col(row, 'Comuna'))}" no existe en ${region}`);
  if (!ficha.email) avisos.push('Sin correo — no podrá tener cuenta de portal');
  if (!ficha.banco || !ficha.nroCuenta) avisos.push('Sin datos bancarios — quedará fuera del Archivo de Pago');
  if (!cargo) avisos.push('Sin cargo');
  if (tipoContrato !== 'Indefinido' && !fechaFin) avisos.push('Contrato a plazo con fecha de término vacía');
  if (j.jornada === 'Otro') avisos.push(`Jornada "${j.jornadaOriginal}" quedó como "Otro"`);

  return { ficha, contrato, errores, avisos, fila: indice + 2 };
}

// ═══════════════════════════════════════════════════════════
// Planilla completa
// ═══════════════════════════════════════════════════════════

/**
 * @param filas            filas crudas de XLSX.utils.sheet_to_json
 * @param rutsExistentes   Map rutPlano → docId de trabajadores ya en Firestore
 * @param empresasValidas  string[] de sub-empresas existentes (subEmpresasNames)
 */
export function procesarPlanilla(filas, rutsExistentes = new Map(), empresasValidas = []) {
  const resultados = [];
  const vistos = new Map();
  const validas = empresasValidas.map(norm);

  filas.forEach((row, i) => {
    if (Object.values(row).every(vacio)) return; // fila en blanco al final de la hoja

    const r = filaAFicha(row, i);
    const plano = rutPlano(r.ficha.rut);

    if (plano) {
      if (vistos.has(plano)) r.errores.push(`RUT repetido en el archivo (fila ${vistos.get(plano)})`);
      else vistos.set(plano, r.fila);
    }

    if (r.ficha.empresa && validas.length && !validas.includes(norm(r.ficha.empresa))) {
      r.avisos.push(`"${r.ficha.empresa}" no existe como sub-empresa`);
      r.empresaFaltante = r.ficha.empresa;
    }

    r.docIdExistente = plano ? rutsExistentes.get(plano) || null : null;
    r.accion = r.errores.length ? 'omitir' : r.docIdExistente ? 'actualizar' : 'crear';
    resultados.push(r);
  });

  return {
    filas: resultados,
    resumen: {
      total: resultados.length,
      nuevos: resultados.filter((r) => r.accion === 'crear').length,
      actualizables: resultados.filter((r) => r.accion === 'actualizar').length,
      conError: resultados.filter((r) => r.accion === 'omitir').length,
      conAviso: resultados.filter((r) => r.accion !== 'omitir' && r.avisos.length).length,
      empresas: [...new Set(resultados.map((r) => r.ficha.empresa).filter(Boolean))],
      empresasFaltantes: [...new Set(resultados.map((r) => r.empresaFaltante).filter(Boolean))],
      areas: [...new Set(resultados.map((r) => r.ficha.area).filter(Boolean))],
      afpsDesconocidas: [...new Set(
        resultados.map((r) => r.ficha.afp).filter((a) => a && !AFPS.some((x) => norm(x) === norm(a)))
      )],
    },
  };
}
