/**
 * vacaciones.js — src/pages/rrhh/vacaciones.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Saldo de feriado legal calculado, no guardado.
 *
 * Antes la ficha tenía `diasVacacionesDisponibles`, que partía en 15 para todo
 * el mundo, se restaba al aprobar una solicitud y nunca sumaba nada. El
 * finiquito tomaba ese número como "días pendientes": alguien con dos meses en
 * la empresa salía con 15 días más el proporcional, y alguien con cinco años
 * con lo que quedara de esos 15 (o negativo).
 *
 * Ahora el saldo es:
 *
 *     saldo inicial (a una fecha de corte, p. ej. el que traía de Talana)
 *   + devengado desde la fecha de corte (o desde el ingreso, si no hay corte)
 *   − días hábiles de vacaciones aprobadas y ya iniciadas desde esa fecha
 *
 * Reglas del Código del Trabajo:
 *   · Art. 67: 15 días hábiles por año de servicio.
 *   · Art. 68: feriado progresivo, 1 día más por cada 3 años nuevos sobre 10
 *     (con este u otros empleadores; de los anteriores valen hasta 10 años).
 *   · Art. 69: el sábado es siempre inhábil, igual que domingos y festivos.
 *   · Proporcional del año en curso: igual que el finiquito (Art. 73), días
 *     desde el último aniversario / 30 × (feriado anual / 12).
 */

import { useEffect, useState } from 'react';
import { db } from '../../lib/firebase';
import { collection, onSnapshot } from 'firebase/firestore';
import { festivosChile, mesesComerciales } from './calculo';

const aFecha = (s) => { const d = new Date(`${String(s || '').slice(0, 10)}T12:00:00`); return isNaN(d) ? null : d; };
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Días hábiles entre dos fechas, inclusivo: sin sábados, domingos ni festivos (Art. 69). */
export function diasHabilesEntre(desde, hasta) {
  const a = aFecha(desde), b = aFecha(hasta);
  if (!a || !b || b < a) return 0;
  const fest = new Set();
  for (let y = a.getFullYear(); y <= b.getFullYear(); y++) festivosChile(y).forEach(f => fest.add(f));
  let n = 0;
  for (const d = new Date(a); d <= b; d.setDate(d.getDate() + 1)) {
    const w = d.getDay();
    if (w !== 0 && w !== 6 && !fest.has(iso(d))) n++;
  }
  return n;
}

/** Feriado anual según años totales de servicio (Art. 67 y 68). */
export function diasFeriadoAnual(aniosEmpresa, aniosPrevios = 0) {
  const total = Math.min(10, Math.max(0, Number(aniosPrevios) || 0)) + Math.max(0, aniosEmpresa);
  return 15 + (total >= 13 ? Math.floor((total - 10) / 3) : 0);
}

/**
 * Feriado devengado entre el ingreso y una fecha, en días hábiles.
 * Años completos al feriado que regía en cada uno; el año en curso, proporcional.
 */
export function devengadoFeriado(fechaIngreso, fecha, aniosPrevios = 0) {
  const ing = aFecha(fechaIngreso), fin = aFecha(fecha);
  if (!ing || !fin || fin < ing) return { anios: 0, diasAniosCompletos: 0, proporcional: 0, total: 0, diasAnual: 15, ultimoAniversario: null };
  let anios = 0, diasCompletos = 0;
  const aniv = new Date(ing);
  while (true) {
    const sig = new Date(aniv); sig.setFullYear(aniv.getFullYear() + 1);
    if (sig > fin) break;
    anios++; diasCompletos += diasFeriadoAnual(anios, aniosPrevios);
    aniv.setFullYear(aniv.getFullYear() + 1);
  }
  const diasAnual = diasFeriadoAnual(anios + 1, aniosPrevios);
  // Meses comerciales desde el último aniversario (igual que el finiquito).
  const proporcional = Math.round(Math.min(12, mesesComerciales(aniv, fin)) * diasAnual / 12 * 100) / 100;
  return { anios, diasAniosCompletos: diasCompletos, proporcional, total: Math.round((diasCompletos + proporcional) * 100) / 100, diasAnual, ultimoAniversario: iso(aniv) };
}

/** Días hábiles de una solicitud: los guardados, o recalculados con festivos si faltan. */
const diasDe = (v) => Number(v.diasSolicitados) > 0 ? Number(v.diasSolicitados) : diasHabilesEntre(v.desde, v.hasta);

/**
 * Saldo de feriado de un trabajador a una fecha.
 *
 * @param p.trabajador  ficha: vacSaldoInicial, vacFechaCorte, aniosServicioPrevios
 * @param p.fechaIngreso inicio del contrato vigente (o el de la ficha)
 * @param p.vacaciones  colección `vacaciones` (se filtra por trabajador)
 * @param p.fecha       fecha de corte del cálculo (hoy, o el término del contrato)
 */
export function resumenVacaciones({ trabajador, fechaIngreso, vacaciones = [], fecha }) {
  const ingreso = fechaIngreso || trabajador?.fechaIngreso || '';
  const hasta = fecha || iso(new Date());
  const previos = Number(trabajador?.aniosServicioPrevios) || 0;
  const corte = trabajador?.vacFechaCorte && trabajador.vacFechaCorte >= ingreso ? trabajador.vacFechaCorte : '';
  const saldoInicial = corte ? (Number(trabajador?.vacSaldoInicial) || 0) : 0;

  const devHasta = devengadoFeriado(ingreso, hasta, previos);
  const devCorte = corte ? devengadoFeriado(ingreso, corte, previos) : { total: 0 };
  const devengado = Math.round((devHasta.total - devCorte.total) * 100) / 100;

  const desdeTomados = corte || ingreso;
  const propias = (vacaciones || []).filter(v =>
    v.trabajadorId === trabajador?.id && v.estado === 'aprobado' &&
    v.desde && v.desde >= desdeTomados && v.desde <= hasta);
  const tomados = propias.reduce((s, v) => s + diasDe(v), 0);

  const saldo = Math.round((saldoInicial + devengado - tomados) * 100) / 100;
  return {
    fechaIngreso: ingreso, fecha: hasta, corte, saldoInicial,
    devengado, tomados, saldo,
    diasAnual: devHasta.diasAnual,
    proporcionalActual: devHasta.proporcional,
    // Para el finiquito: el proporcional del período en curso se calcula allá
    // aparte; lo que queda de saldo son días de años anteriores. Si sale
    // negativo, la persona tomó por adelantado y eso descuenta del proporcional.
    pendienteAnteriores: Math.round((saldo - devHasta.proporcional) * 100) / 100,
    sinSaldoInicial: !corte,
    solicitudes: propias.length,
  };
}

/** Solicitudes de vacaciones de la empresa, en vivo. */
export function useVacaciones(empresaId) {
  const [vacaciones, setVacaciones] = useState([]);
  useEffect(() => {
    if (!empresaId) { setVacaciones([]); return; }
    return onSnapshot(collection(db, 'empresas', empresaId, 'vacaciones'),
      snap => setVacaciones(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      () => setVacaciones([]));
  }, [empresaId]);
  return vacaciones;
}
