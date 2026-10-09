/**
 * periodo.js — src/pages/rrhh/periodo.js
 * ─────────────────────────────────────────────────────────────────────────────
 * UNA sola forma de calcular la liquidación de un período.
 *
 * El motor (`liquidacionDe`) recibe como contexto los anticipos, las licencias
 * y las ausencias del mes. Cada pantalla le pasaba una combinación distinta:
 *
 *   tabla y PDF ............ anticipos + ausencias   (sin licencias)
 *   modal de liquidación ... anticipos + licencias   (sin ausencias)
 *   archivo de pago ........ anticipos + licencias   (sin ausencias)
 *   LRE y reliquidación .... anticipos + licencias   (sin ausencias)
 *   contabilidad, Previred . nada
 *
 * Resultado: el PDF que firma el trabajador decía un líquido y el banco
 * transfería otro. Este módulo junta el contexto en un solo lugar y TODAS las
 * pantallas que muestran, pagan o declaran plata deben pasar por acá.
 *
 * Uso:
 *   const ctx = useContextoPeriodo(empresaId);
 *   const calc = liquidacionDelPeriodo(trabajador, contrato, liq, ctx);
 *   calc.liquidoFinal  → lo que se transfiere (ya con IUT)
 */

import { useEffect, useMemo, useState } from 'react';
import { db } from '../../lib/firebase';
import { collection, onSnapshot, doc, getDoc, setDoc } from 'firebase/firestore';
import { useAnticipos, anticiposDe, totalAnticipos } from './anticipos';
import { useLicencias, licenciasDe } from './licencias';
import { ausenciasDePeriodo, liquidacionDe } from './calculo';
import { asegurarIndicadores, paramsDe } from './parametros';

/** Ausencias de la empresa, en vivo. Se recortan por período en memoria. */
export function useAusencias(empresaId) {
  const [ausencias, setAusencias] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!empresaId) { setAusencias([]); setLoading(false); return; }
    setLoading(true);
    const unsub = onSnapshot(
      collection(db, 'empresas', empresaId, 'ausencias'),
      snap => { setAusencias(snap.docs.map(d => ({ id: d.id, ...d.data() }))); setLoading(false); },
      () => { setAusencias([]); setLoading(false); }   // sin permiso: se calcula sin ausencias
    );
    return unsub;
  }, [empresaId]);
  return { ausencias, loading };
}

/** Anticipos + licencias + ausencias de la empresa, en vivo. */
export function useContextoPeriodo(empresaId) {
  const { anticipos, loading: la } = useAnticipos(empresaId);
  const { licencias, loading: ll } = useLicencias(empresaId);
  const { ausencias, loading: lu } = useAusencias(empresaId);
  return useMemo(
    () => ({ anticipos, licencias, ausencias, loading: la || ll || lu }),
    [anticipos, licencias, ausencias, la, ll, lu]
  );
}

/**
 * Lo que el motor necesita saber del período para un trabajador.
 * Cada campo es `undefined` cuando no hay registro, y en ese caso el motor
 * respeta el campo manual de la liquidación (comportamiento heredado).
 */
export function extrasDelPeriodo(ctx, trabajadorId, mes, anio) {
  if (!ctx || !trabajadorId || !mes || !anio) return {};
  const ants = anticiposDe(ctx.anticipos, trabajadorId, mes, anio);
  const lics = licenciasDe(ctx.licencias, trabajadorId, mes, anio);
  const aus  = ausenciasDePeriodo(
    (ctx.ausencias || []).filter(a => a.trabajadorId === trabajadorId), mes, anio);
  return {
    anticiposRegistrados: ants.length ? totalAnticipos(ctx.anticipos, trabajadorId, mes, anio) : undefined,
    licenciasRegistradas: lics.length ? lics : undefined,
    ausenciasRegistradas: aus.length ? aus : undefined,
  };
}

/**
 * Liquidación completa del período, con el contexto resuelto.
 * Devuelve el `calc` del motor: `liquido` (antes de IUT), `iut`,
 * `liquidoFinal` (lo que se transfiere), aportes del empleador, etc.
 */
export function liquidacionDelPeriodo(trabajador, contrato, liq, ctx) {
  const tid = trabajador?.id || liq?.trabajadorId;
  return liquidacionDe(trabajador, contrato, liq, extrasDelPeriodo(ctx, tid, liq?.mes, liq?.anio));
}

/**
 * Asegura que UTM y UF del período estén cargadas (Firestore → mindicador.cl)
 * y fuerza un re-render cuando llegan. Devuelve el estado para mostrar un aviso
 * si el período se está calculando con valores de respaldo.
 *
 *   const ind = useIndicadoresPeriodo(empresaId, mes, anio);
 *   ind.version  → incluir en dependencias de useMemo que calculen liquidaciones
 *   ind.utmCargada / ind.ufFinCargada → mostrar aviso si es false
 */
export function useIndicadoresPeriodo(empresaId, mes, anio) {
  const [estado, setEstado] = useState(() => {
    const P = paramsDe({ mes, anio });
    return { cargando: !P.utmCargada || !P.ufFinCargada, utmCargada: P.utmCargada, ufFinCargada: P.ufFinCargada, version: 0 };
  });
  useEffect(() => {
    if (!mes || !anio) return;
    let vivo = true;
    setEstado(e => ({ ...e, cargando: true }));
    asegurarIndicadores({ db, doc, getDoc, setDoc }, empresaId, { mes, anio })
      .then(r => { if (vivo) setEstado(e => ({ cargando: false, utmCargada: r.utmCargada, ufFinCargada: r.ufFinCargada, version: e.version + 1 })); })
      .catch(() => { if (vivo) setEstado(e => ({ ...e, cargando: false })); });
    return () => { vivo = false; };
  }, [empresaId, mes, anio]);
  return estado;
}

/** Estados que no se pagan ni se declaran: el borrador todavía no está revisado. */
export const esBorrador = (liq) => liq?.estado === 'borrador';
