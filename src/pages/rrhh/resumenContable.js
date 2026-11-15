/**
 * resumenContable.js — src/pages/rrhh/resumenContable.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Lo que RRHH le entrega a Contabilidad: por cada mes de un año, el gasto en
 * remuneraciones y en finiquitos, calculado con el MISMO motor que la
 * liquidación, el archivo de pago y el Libro de Remuneraciones Electrónico.
 *
 * No usa hooks: carga todo una vez y recorre los 12 meses, así Contabilidad
 * lo puede pedir sin montar las pantallas de RRHH.
 *
 *   Remuneraciones del mes = Total haberes (LRE 5201) − asignación familiar
 *                            (LRE 2311) + Total aportes del empleador (LRE
 *                            5410: AFC, mutual, SIS y aportes de la reforma
 *                            previsional). La asignación familiar la paga el
 *                            empleador pero la recupera descontándola de las
 *                            cotizaciones que entera (DFL 150): no es costo de
 *                            la empresa. Es el mismo `costoEmpresa` del motor.
 *   Finiquitos del mes     = total haberes del finiquito (indemnizaciones,
 *                            feriado, gratificación proporcional…), en el mes
 *                            de la fecha de término. Si ese mes además tiene
 *                            liquidación, no se suman la remuneración del mes
 *                            en curso ni las pendientes del finiquito, porque
 *                            ya están en la liquidación.
 *
 * Finiquitos: los anulados no se cuentan, y de cada contrato se toma uno solo
 * (el vigente; si quedaron duplicados antiguos, el más reciente).
 *
 * Las liquidaciones reemplazadas por una reliquidación no se cuentan. Los
 * borradores tampoco, salvo que se pida (las cargas masivas desde Talana
 * entran como borrador).
 */

import { collection, getDocs, doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { liquidacionDe, liquidacionesVigentes, contratoAlPeriodo, calcularFiniquito } from './calculo';
import { extrasDelPeriodo, esBorrador } from './periodo';
import { asegurarIndicadores } from './parametros';
import { filaLRE } from './lre';

const pad = n => String(n).padStart(2, '0');
const lista = snap => snap.docs.map(d => ({ id: d.id, ...d.data() }));
const leer = async (empresaId, nombre) => {
  try { return lista(await getDocs(collection(db, 'empresas', empresaId, nombre))); }
  catch { return []; }   // sin permiso sobre una colección: se calcula sin ella
};

const _ms = (v) => (v?.toMillis ? v.toMillis() : (v?.seconds ? v.seconds * 1000 : (Date.parse(v) || 0)));

/**
 * Finiquitos que cuentan: sin los anulados y uno por contrato (o por
 * trabajador si no tiene contrato). Un documento sin `estado` es anterior a
 * los estados y cuenta como vigente. Si quedaron duplicados de antes de que se
 * bloquearan, gana el más reciente.
 */
export function finiquitosVigentes(finiquitos) {
  const porContrato = new Map();
  (finiquitos || []).forEach(f => {
    if (f?.estado === 'anulado') return;
    const k = f.contratoId || `t:${f.trabajadorId}`;
    const previo = porContrato.get(k);
    const fecha = (x) => Math.max(_ms(x.updatedAt), _ms(x.createdAt), _ms(x.fechaCreacion));
    if (!previo || fecha(f) >= fecha(previo)) porContrato.set(k, f);
  });
  return [...porContrato.values()];
}

/** Carga una vez todo lo que el motor de RRHH necesita. */
async function cargarRRHH(empresaId) {
  const [liquidaciones, trabajadores, contratos, finiquitos, anticipos, licencias, ausencias] = await Promise.all([
    leer(empresaId, 'remuneraciones'), leer(empresaId, 'trabajadores'), leer(empresaId, 'contratos'),
    leer(empresaId, 'finiquitos'), leer(empresaId, 'anticipos'), leer(empresaId, 'licencias'), leer(empresaId, 'ausencias'),
  ]);
  let config = {};
  try { const s = await getDoc(doc(db, 'empresas', empresaId, 'config', 'lre')); if (s.exists()) config = s.data(); } catch { /* sin config */ }
  return { liquidaciones, trabajadores, contratos, finiquitos, ctx: { anticipos, licencias, ausencias, liquidaciones }, config };
}

/**
 * Cada liquidación vigente del año, calculada con el motor de RRHH:
 * { mes (1-12), trabajador, liquidacion, haberes, aportes, descuentos, liquido, borrador }.
 */
async function calcularLiquidacionesAnio(empresaId, anio, datos, { incluirBorradores = false } = {}) {
  const { liquidaciones, trabajadores, contratos, ctx, config } = datos;
  const anioStr = String(anio);
  const salida = [];
  let borradores = 0, sinContrato = 0;
  for (let m = 1; m <= 12; m++) {
    const mes = pad(m);
    const delMes = liquidacionesVigentes(
      liquidaciones.filter(l => pad(l.mes) === mes && String(l.anio) === anioStr));
    borradores += delMes.filter(esBorrador).length;
    const aCalcular = incluirBorradores ? delMes : delMes.filter(l => !esBorrador(l));
    if (aCalcular.length) {
      try { await asegurarIndicadores({ db, doc, getDoc, setDoc }, empresaId, { mes, anio: anioStr }); } catch { /* respaldo */ }
    }
    aCalcular.forEach(l => {
      const trabajador = trabajadores.find(t => t.id === l.trabajadorId);
      const contratoDoc = contratos.find(c => c.id === l.contratoId);
      const contrato = contratoDoc ? contratoAlPeriodo(contratoDoc, mes, anioStr) : null;
      if (!contrato) { sinContrato++; return; }
      const calc = liquidacionDe(trabajador, contrato, { ...l, tasaMutual: config.tasaMutual },
        extrasDelPeriodo(ctx, trabajador?.id, mes, anioStr, { trabajador, contrato }));
      const fila = filaLRE({ trabajador, contrato, liq: l, calc, iut: calc.iut, config });
      salida.push({
        mes: m, trabajador, liquidacion: l, borrador: esBorrador(l),
        haberes: Number(fila[5201]) || 0, aportes: Number(fila[5410]) || 0,
        asignacionFamiliar: Number(fila[2311]) || 0,
        descuentos: Number(fila[5301]) || 0, liquido: Number(fila[5501]) || 0,
      });
    });
  }
  return { filas: salida, borradores, sinContrato };
}

/**
 * Costo de mano de obra por obra y mes, desde las liquidaciones de RRHH, con
 * la forma de `employeeMonthlyData` (lo que usan Dashboard, Consolidado y
 * Estado de pago de Oficina Técnica). La obra sale del centro de costo del
 * trabajador (vinculado a la obra en RRHH → Centros de costo) o, si no, de su
 * obra asignada. Incluye borradores: para costear sirven las cargas desde
 * Talana aunque no se hayan revisado para el Libro de Remuneraciones.
 */
const _cacheCostos = new Map();
export async function costosManoObraRRHH(empresaId, anio) {
  const clave = `${empresaId}|${anio}`;
  const enCache = _cacheCostos.get(clave);
  if (enCache && Date.now() - enCache.t < 5 * 60 * 1000) return enCache.v;
  const p = (async () => {
    const datos = await cargarRRHH(empresaId);
    // Obras y centros de costo: con `obras: []` obraDe nunca encontraba una obra
    // por su nombre (un centro de costo llamado igual que la obra).
    const { obraDe, cargarObrasYCentros } = await import('../../lib/obras');
    let obras = [], centros = [];
    try { ({ obras, centros } = await cargarObrasYCentros(empresaId)); } catch { obras = []; centros = []; }
    const { filas } = await calcularLiquidacionesAnio(empresaId, anio, datos, { incluirBorradores: true });
    return filas.map(f => {
      const t = f.trabajador || {};
      const l = f.liquidacion || {};
      // Centro de costo y obra del MES liquidado: la liquidación guarda una
      // copia al crearse. Leer solo la ficha cargaba todo el historial de quien
      // cambió de obra a su obra actual. Liquidaciones antiguas sin la copia
      // caen a la ficha.
      const cc = l.centroCosto != null || l.centroCostoNombre != null
        ? { codigo: l.centroCosto, nombre: l.centroCostoNombre }
        : { codigo: t.centroCosto, nombre: t.centroCostoNombre };
      const projectId = obraDe({ obras, centros }, cc) || l.projectId || t.projectId || null;
      const costo = f.haberes - f.asignacionFamiliar + f.aportes;
      return {
        id: `rrhh_${f.liquidacion.id}`,
        employeeId: t.id || f.liquidacion.trabajadorId,
        nombre: `${t.nombre || t.nombres || ''} ${t.apellidoPaterno || ''}`.trim(),
        projectId, year: Number(anio), month: f.mes,
        centroCosto: cc.nombre || cc.codigo || '',
        tipoManoObra: t.tipoManoObra || (t.tipo === 'OPERADOR' ? 'DIRECTO' : null),
        totalHaberes: f.haberes, totalDescuentos: f.descuentos, sueldoLiquido: f.liquido,
        // Costo empresa: sin la asignación familiar (2311), que no es costo.
        aporteEmpresa: f.aportes, totalCosto: costo,
        porcentajeIncidencia: 100, fuente: 'rrhh',
      };
    });
  })();
  _cacheCostos.set(clave, { t: Date.now(), v: p });
  p.catch(() => _cacheCostos.delete(clave));
  return p;
}

/**
 * @returns {Promise<{ anio, meses: Array<{ mes, liquidaciones, borradores,
 *   haberes, aportes, remuneraciones, finiquitos, nFiniquitos }>,
 *   totalBorradores, sinContrato }>}
 *   mes va de 0 a 11.
 */
export async function resumenRRHHAnio(empresaId, anio, { incluirBorradores = false } = {}) {
  const datos = await cargarRRHH(empresaId);
  const { filas, borradores: totalBorradores, sinContrato } = await calcularLiquidacionesAnio(empresaId, anio, datos, { incluirBorradores });
  const { liquidaciones, trabajadores, contratos, finiquitos } = datos;
  const anioStr = String(anio);

  const meses = [];
  for (let m = 1; m <= 12; m++) {
    const mes = pad(m);
    const delMes = filas.filter(f => f.mes === m);
    const haberes = delMes.reduce((s, f) => s + f.haberes, 0);
    const aportes = delMes.reduce((s, f) => s + f.aportes, 0);
    const asigFam = delMes.reduce((s, f) => s + f.asignacionFamiliar, 0);
    const conLiquidacion = new Set(delMes.map(f => f.liquidacion.trabajadorId));
    const borradores = liquidacionesVigentes(
      liquidaciones.filter(l => pad(l.mes) === mes && String(l.anio) === anioStr)).filter(esBorrador).length;

    let montoFiniquitos = 0, nFiniquitos = 0;
    finiquitosVigentes(finiquitos)
      .filter(f => String(f.fechaTermino || '').slice(0, 7) === `${anioStr}-${mes}`)
      .forEach(f => {
        const trabajador = trabajadores.find(t => t.id === f.trabajadorId);
        const contrato = contratos.find(c => c.id === f.contratoId)
          || contratos.find(c => c.trabajadorId === f.trabajadorId);
        let calc = null;
        try { calc = calcularFiniquito(f, contrato, trabajador); } catch { calc = null; }
        if (!calc) return;
        const yaEnLiquidacion = conLiquidacion.has(f.trabajadorId)
          ? (Number(calc.remMesEnCurso) || 0) + (Number(calc.remPendiente) || 0) : 0;
        montoFiniquitos += (Number(calc.totalHaberes) || 0) - yaEnLiquidacion;
        nFiniquitos++;
      });

    meses.push({
      mes: m - 1, liquidaciones: delMes.length, borradores,
      haberes: Math.round(haberes), aportes: Math.round(aportes),
      asignacionFamiliar: Math.round(asigFam),
      remuneraciones: Math.round(haberes - asigFam + aportes),
      finiquitos: Math.round(montoFiniquitos), nFiniquitos,
    });
  }
  return { anio: Number(anio), meses, totalBorradores, sinContrato };
}
