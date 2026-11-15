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
 *   Remuneraciones del mes = Total haberes (LRE 5201) + Total aportes del
 *                            empleador (LRE 5410: AFC, mutual, SIS y aportes
 *                            de la reforma previsional)
 *   Finiquitos del mes     = total haberes del finiquito (indemnizaciones,
 *                            feriado, gratificación proporcional…), en el mes
 *                            de la fecha de término. Si ese mes además tiene
 *                            liquidación, no se suman la remuneración del mes
 *                            en curso ni las pendientes del finiquito, porque
 *                            ya están en la liquidación.
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

/**
 * @returns {Promise<{ anio, meses: Array<{ mes, liquidaciones, borradores,
 *   haberes, aportes, remuneraciones, finiquitos, nFiniquitos }>,
 *   totalBorradores, sinContrato }>}
 *   mes va de 0 a 11.
 */
export async function resumenRRHHAnio(empresaId, anio, { incluirBorradores = false } = {}) {
  const [liquidaciones, trabajadores, contratos, finiquitos, anticipos, licencias, ausencias] = await Promise.all([
    leer(empresaId, 'remuneraciones'), leer(empresaId, 'trabajadores'), leer(empresaId, 'contratos'),
    leer(empresaId, 'finiquitos'), leer(empresaId, 'anticipos'), leer(empresaId, 'licencias'), leer(empresaId, 'ausencias'),
  ]);
  let config = {};
  try { const s = await getDoc(doc(db, 'empresas', empresaId, 'config', 'lre')); if (s.exists()) config = s.data(); } catch { /* sin config */ }
  const ctx = { anticipos, licencias, ausencias, liquidaciones };
  const anioStr = String(anio);
  let totalBorradores = 0, sinContrato = 0;

  const meses = [];
  for (let m = 1; m <= 12; m++) {
    const mes = pad(m);
    const delMes = liquidacionesVigentes(
      liquidaciones.filter(l => pad(l.mes) === mes && String(l.anio) === anioStr));
    const borradores = delMes.filter(esBorrador).length;
    totalBorradores += borradores;
    const aCalcular = incluirBorradores ? delMes : delMes.filter(l => !esBorrador(l));

    // UTM y UF del mes: el impuesto y los topes dependen de ellas
    if (aCalcular.length) {
      try { await asegurarIndicadores({ db, doc, getDoc, setDoc }, empresaId, { mes, anio: anioStr }); } catch { /* respaldo */ }
    }

    let haberes = 0, aportes = 0, n = 0;
    const conLiquidacion = new Set();
    aCalcular.forEach(l => {
      const trabajador = trabajadores.find(t => t.id === l.trabajadorId);
      const contratoDoc = contratos.find(c => c.id === l.contratoId);
      const contrato = contratoDoc ? contratoAlPeriodo(contratoDoc, mes, anioStr) : null;
      if (!contrato) { sinContrato++; return; }
      const calc = liquidacionDe(trabajador, contrato, { ...l, tasaMutual: config.tasaMutual },
        extrasDelPeriodo(ctx, trabajador?.id, mes, anioStr, { trabajador, contrato }));
      const fila = filaLRE({ trabajador, contrato, liq: l, calc, iut: calc.iut, config });
      haberes += Number(fila[5201]) || 0;
      aportes += Number(fila[5410]) || 0;
      n++;
      conLiquidacion.add(l.trabajadorId);
    });

    let montoFiniquitos = 0, nFiniquitos = 0;
    finiquitos
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
      mes: m - 1, liquidaciones: n, borradores,
      haberes: Math.round(haberes), aportes: Math.round(aportes),
      remuneraciones: Math.round(haberes + aportes),
      finiquitos: Math.round(montoFiniquitos), nFiniquitos,
    });
  }
  return { anio: Number(anio), meses, totalBorradores, sinContrato };
}
