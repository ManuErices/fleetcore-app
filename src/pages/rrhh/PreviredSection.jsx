/**
 * PreviredSection.jsx — src/pages/rrhh/PreviredSection.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Archivo de carga Previred (105 campos, v100) del período.
 *
 * Igual que el LRE, valida ANTES de generar: Previred rechaza el archivo
 * completo por un solo error, y el plazo de pago (día 10, o 13 si es
 * electrónico) no espera.
 *
 * Usa exactamente el mismo cálculo que la liquidación, el PDF y la nómina
 * bancaria (periodo.js): lo que se declara es lo que se pagó.
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { db } from '../../lib/firebase';
import { useEmpresa } from '../../lib/useEmpresa';
import { collection, getDocs, doc, getDoc, setDoc } from 'firebase/firestore';
import { inp, MESES, TASAS } from './shared';
import { liquidacionDe, liquidacionesVigentes, contratoAlPeriodo } from './calculo';
import { useContextoPeriodo, extrasDelPeriodo, useIndicadoresPeriodo, esBorrador } from './periodo';
import { lineasTrabajador, nombreArchivoPrevired, descargarPrevired } from './previred';
import { COD_CCAF, COD_MUTUAL } from './lre';

const fmt = n => `$${Math.round(n || 0).toLocaleString('es-CL')}`;
const mesAnterior = (mes, anio) => {
  const m = parseInt(mes), a = parseInt(anio);
  return m === 1 ? { mes: '12', anio: String(a - 1) } : { mes: String(m - 1).padStart(2, '0'), anio: String(a) };
};

export default function PreviredSection() {
  const { empresaId, empresa } = useEmpresa();
  const ctx = useContextoPeriodo(empresaId);

  const [mes,  setMes]  = useState(String(new Date().getMonth() + 1).padStart(2, '0'));
  const [anio, setAnio] = useState(String(new Date().getFullYear()));
  const ind = useIndicadoresPeriodo(empresaId, mes, anio);
  const ant = mesAnterior(mes, anio);
  const indAnt = useIndicadoresPeriodo(empresaId, ant.mes, ant.anio);

  const [liquidaciones, setLiquidaciones] = useState([]);
  const [trabajadores, setTrabajadores]   = useState([]);
  const [contratos, setContratos]         = useState([]);
  const [loading, setLoading] = useState(true);

  // Misma configuración que el LRE (mutual, CCAF), más lo propio de Previred.
  const [config, setConfig] = useState({ mutual: 2, tasaMutual: TASAS.mutual, ccaf: 0, sucursalMutual: '0', centroCosto: '' });
  const [guardandoCfg, setGuardandoCfg] = useState(false);
  const [cfgOk, setCfgOk] = useState(false);
  const [detalle, setDetalle] = useState(null);

  const load = useCallback(async () => {
    if (!empresaId) return;
    setLoading(true);
    try {
      const [lSnap, tSnap, cSnap, cfgSnap] = await Promise.all([
        getDocs(collection(db, 'empresas', empresaId, 'remuneraciones')),
        getDocs(collection(db, 'empresas', empresaId, 'trabajadores')),
        getDocs(collection(db, 'empresas', empresaId, 'contratos')),
        getDoc(doc(db, 'empresas', empresaId, 'config', 'lre')),
      ]);
      setLiquidaciones(lSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setTrabajadores(tSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setContratos(cSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      if (cfgSnap.exists()) setConfig(c => ({ ...c, ...cfgSnap.data() }));
    } catch (e) { console.error('[Previred] carga:', e); }
    setLoading(false);
  }, [empresaId]);
  useEffect(() => { load(); }, [load]);

  const guardarConfig = async () => {
    setGuardandoCfg(true); setCfgOk(false);
    try {
      await setDoc(doc(db, 'empresas', empresaId, 'config', 'lre'), config, { merge: true });
      setCfgOk(true); setTimeout(() => setCfgOk(false), 2500);
    } catch (e) { alert('No se pudo guardar: ' + e.message); }
    setGuardandoCfg(false);
  };

  // ── Filas del período ──
  const { filas, borradores } = useMemo(() => {
    const vigentes = liquidacionesVigentes(liquidaciones);
    const delMes = vigentes.filter(l => l.mes === mes && l.anio === anio);
    const borradores = delMes.filter(esBorrador).length;
    const config2 = { ...config, tasaMutual: Number(config.tasaMutual) || TASAS.mutual };

    const filas = delMes.filter(l => !esBorrador(l)).map(l => {
      const trabajador = trabajadores.find(t => t.id === l.trabajadorId);
      const contratoDoc = contratos.find(c => c.id === l.contratoId)
        || contratos.find(c => c.trabajadorId === l.trabajadorId && c.estado === 'vigente');
      // Condiciones del mes declarado: tipo de contrato, término y jornada
      // según los anexos que ya regían (y no los posteriores).
      const contrato = contratoDoc ? contratoAlPeriodo(contratoDoc, mes, anio) : null;
      const nombre = `${trabajador?.apellidoPaterno || ''} ${trabajador?.nombre || ''}`.trim() || '(sin ficha)';
      if (!trabajador || !contrato) {
        return { nombre, rut: trabajador?.rut || '—', errores: [!trabajador ? 'sin ficha de trabajador' : 'sin contrato'], avisos: [], lineas: [], resumen: null };
      }
      const calc = liquidacionDe(trabajador, contrato, { ...l, tasaMutual: config2.tasaMutual },
        extrasDelPeriodo(ctx, trabajador.id, mes, anio, { trabajador, contrato }));
      // La RIMA (licencias) la resuelve el motor desde la liquidación del mes
      // anterior; un `rima` escrito en la liquidación manda.
      const rimaMensual = calc.rimaMensual || 0;
      const r = lineasTrabajador({ trabajador, contrato, liq: l, calc, rimaMensual, config: config2, mes, anio });
      return { nombre, rut: trabajador.rut, calc, ...r };
    });
    return { filas, borradores };
  }, [liquidaciones, trabajadores, contratos, ctx, mes, anio, config, ind.version, indAnt.version]);

  const conErrores = filas.filter(f => f.errores.length);
  const listo = filas.length > 0 && conErrores.length === 0 && ind.utmCargada && ind.ufFinCargada;
  const lineas = useMemo(() => filas.flatMap(f => f.lineas), [filas]);

  // ── Totales por institución (lo que se paga en la planilla) ──
  const totales = useMemo(() => {
    const porAfp = {}, porIsapre = {};
    let sis = 0, fonasa = 0, ccaf = 0, accidentes = 0, seguroSocial = 0, cesantia = 0, apv = 0, asig = 0;
    filas.forEach(f => {
      const r = f.resumen; if (!r) return;
      porAfp[r.afpNombre || '—'] = (porAfp[r.afpNombre || '—'] || 0) + r.afp;
      if (r.isapre) porIsapre[r.isapreNombre] = (porIsapre[r.isapreNombre] || 0) + r.isapre;
      sis += r.sis; fonasa += r.fonasa; ccaf += r.ccaf; accidentes += r.accidentes;
      seguroSocial += r.seguroSocial; cesantia += r.cesantia; apv += r.apv; asig += r.asigFamiliar;
    });
    const total = Object.values(porAfp).reduce((s, v) => s + v, 0) + Object.values(porIsapre).reduce((s, v) => s + v, 0)
      + sis + fonasa + ccaf + accidentes + seguroSocial + cesantia + apv - asig;
    return { porAfp, porIsapre, sis, fonasa, ccaf, accidentes, seguroSocial, cesantia, apv, asig, total };
  }, [filas]);

  const nombreArchivo = nombreArchivoPrevired(empresa?.rut, mes, anio);
  const conMutual = String(config.mutual ?? 0) !== '0';

  return (
    <div className="space-y-5">
      {/* ── Período y descarga ── */}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Mes</p>
          <select className={inp} value={mes} onChange={e => setMes(e.target.value)}>
            {MESES.map((m, i) => <option key={m} value={String(i + 1).padStart(2, '0')}>{m}</option>)}
          </select>
        </div>
        <div>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Año</p>
          <select className={inp} value={anio} onChange={e => setAnio(e.target.value)}>
            {[2025, 2026, 2027].map(y => <option key={y}>{y}</option>)}
          </select>
        </div>
        <div className="flex-1" />
        <button onClick={() => descargarPrevired(lineas, nombreArchivo)} disabled={!listo}
          className="px-5 py-2.5 rounded-xl text-sm font-bold bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:opacity-90 disabled:opacity-40 shadow-sm">
          Descargar {nombreArchivo}
        </button>
      </div>

      {/* ── Estado ── */}
      {!ind.cargando && (!ind.utmCargada || !ind.ufFinCargada) && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-xs font-bold text-red-800">
          Los indicadores de {MESES[parseInt(mes) - 1]} {anio} no están cargados (UTM / UF del último día). Los topes
          imponibles saldrían con un valor de respaldo: la descarga queda bloqueada hasta que se carguen.
        </div>
      )}
      {borradores > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-800">
          <strong>{borradores} liquidación(es) en borrador</strong> no se incluyen. Apruébalas en Remuneraciones si corresponde declararlas.
        </div>
      )}

      {/* ── Configuración ── */}
      <div className="rounded-2xl border border-blue-100 bg-blue-50/40 p-4 space-y-3">
        <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest">Datos de la empresa en Previred</p>
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Ley 16.744</p>
            <select className={inp} value={config.mutual} onChange={e => setConfig(c => ({ ...c, mutual: Number(e.target.value) }))}>
              {Object.entries(COD_MUTUAL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Tasa total (%)</p>
            <input className={inp} inputMode="decimal" value={String((Number(config.tasaMutual) || 0) * 100).replace('.', ',')}
              onChange={e => { const v = parseFloat(e.target.value.replace(',', '.')); setConfig(c => ({ ...c, tasaMutual: v > 0 ? v / 100 : 0 })); }} />
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">CCAF</p>
            <select className={inp} value={config.ccaf} onChange={e => setConfig(c => ({ ...c, ccaf: Number(e.target.value) }))}>
              {Object.entries(COD_CCAF).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Sucursal mutual</p>
            <input className={inp} value={config.sucursalMutual || ''} disabled={!conMutual}
              onChange={e => setConfig(c => ({ ...c, sucursalMutual: e.target.value.replace(/\D/g, '').slice(0, 3) }))} />
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Centro de costo</p>
            <input className={inp} value={config.centroCosto || ''} maxLength={20}
              onChange={e => setConfig(c => ({ ...c, centroCosto: e.target.value }))} />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={guardarConfig} disabled={guardandoCfg}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-40">
            {guardandoCfg ? 'Guardando…' : 'Guardar configuración'}
          </button>
          {cfgOk && <span className="text-[11px] font-bold text-emerald-600">Guardado</span>}
        </div>
        <p className="text-[11px] text-slate-400 leading-snug">
          La tasa de accidentes es la total que informa la mutual (básica + adicional + Ley SANNA). El código de mutual,
          la CCAF, la sucursal y el centro de costo deben coincidir con lo inscrito en Previred: si no, rechaza el archivo.
          Esta configuración la comparte el Libro de Remuneraciones.
        </p>
      </div>

      {/* ── Validación ── */}
      {loading ? (
        <p className="text-xs text-slate-400 py-6 text-center">Cargando…</p>
      ) : filas.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-slate-400 bg-slate-50 rounded-2xl">
          <p className="font-semibold">Sin liquidaciones aprobadas en {MESES[parseInt(mes) - 1]} {anio}</p>
        </div>
      ) : conErrores.length > 0 ? (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <p className="text-xs font-black text-amber-800 mb-1.5">
            {conErrores.length} {conErrores.length === 1 ? 'trabajador tiene' : 'trabajadores tienen'} datos que Previred rechazaría
          </p>
          <div className="space-y-1.5">
            {conErrores.map((f, i) => (
              <div key={i} className="text-[11px]">
                <span className="font-bold text-amber-900">{f.nombre}</span>
                <span className="text-amber-700"> — {f.errores.join(' · ')}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-xs font-bold text-emerald-800">
          {filas.length} trabajadores, {lineas.length} líneas de 105 campos. Revisa los totales contra la planilla
          que muestre Previred antes de pagar.
        </div>
      )}

      {/* ── Totales a pagar ── */}
      {filas.length > 0 && (
        <div className="rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-4 py-2.5 bg-slate-50 text-[10px] font-black text-slate-500 uppercase tracking-widest">Total a pagar por institución</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-slate-100 text-sm">
            {[
              ...Object.entries(totales.porAfp).map(([k, v]) => [`AFP ${k}`, v]),
              ['SIS', totales.sis],
              ['Seguro Social (EV + RP)', totales.seguroSocial],
              ['Fonasa', totales.fonasa],
              ...Object.entries(totales.porIsapre).map(([k, v]) => [`Isapre ${k}`, v]),
              ...(totales.ccaf ? [['CCAF', totales.ccaf]] : []),
              [conMutual ? 'Mutual' : 'ISL', totales.accidentes],
              ['Seguro de cesantía', totales.cesantia],
              ...(totales.apv ? [['APV', totales.apv]] : []),
              ...(totales.asig ? [['− Asignación familiar', -totales.asig]] : []),
            ].map(([k, v]) => (
              <div key={k} className="bg-white px-4 py-2.5">
                <p className="text-[10px] font-bold text-slate-400 uppercase">{k}</p>
                <p className="font-black text-slate-700">{fmt(v)}</p>
              </div>
            ))}
            <div className="bg-indigo-50 px-4 py-2.5">
              <p className="text-[10px] font-bold text-indigo-500 uppercase">Total</p>
              <p className="font-black text-indigo-800">{fmt(totales.total)}</p>
            </div>
          </div>
        </div>
      )}

      {/* ── Detalle por trabajador ── */}
      {filas.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-slate-100">
          <table className="w-full text-xs min-w-[1000px]">
            <thead>
              <tr style={{ background: '#1e1b4b' }}>
                {['Trabajador', 'Días', 'Mov.', 'Renta imp.', 'AFP + 0,1%', 'SIS', 'Salud', 'EV', 'RP', 'Accid.', 'AFC trab.', 'AFC emp.', ''].map(h => (
                  <th key={h} className="px-3 py-2.5 text-[10px] font-black text-slate-300 uppercase tracking-widest text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filas.map((f, i) => {
                const c = (f.lineas[0] || '').split(';');
                const v = n => Number(c[n - 1] || 0);
                return (
                  <tr key={i} className={`hover:bg-slate-50 ${f.errores.length ? 'bg-amber-50/50' : ''}`}>
                    <td className="px-3 py-2 font-bold text-slate-800">{f.nombre}<div className="font-mono font-normal text-[10px] text-slate-400">{f.rut}</div></td>
                    <td className="px-3 py-2 font-mono">{c[12] || '—'}</td>
                    <td className="px-3 py-2 font-mono">{(f.movimientos || []).map(m => m.codigo).join(', ') || '0'}</td>
                    <td className="px-3 py-2 font-mono">{fmt(v(27))}</td>
                    <td className="px-3 py-2 font-mono">{fmt(v(28))}</td>
                    <td className="px-3 py-2 font-mono">{fmt(v(29))}</td>
                    <td className="px-3 py-2 font-mono">{fmt(v(70) + v(79))}</td>
                    <td className="px-3 py-2 font-mono">{fmt(v(94))}</td>
                    <td className="px-3 py-2 font-mono">{fmt(v(95))}</td>
                    <td className="px-3 py-2 font-mono">{fmt(v(98) || v(71))}</td>
                    <td className="px-3 py-2 font-mono">{fmt(v(101))}</td>
                    <td className="px-3 py-2 font-mono">{fmt(v(102))}</td>
                    <td className="px-3 py-2">
                      <button onClick={() => setDetalle(f)} className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800">105 campos</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Avisos ── */}
      {filas.some(f => f.avisos.length) && (
        <div className="bg-sky-50 border border-sky-200 rounded-xl px-4 py-3">
          <p className="text-xs font-black text-sky-900 mb-1">Revisar en el portal antes de pagar</p>
          {filas.filter(f => f.avisos.length).map((f, i) => (
            <p key={i} className="text-[11px] text-sky-800"><strong>{f.nombre}</strong> — {f.avisos.join(' · ')}</p>
          ))}
        </div>
      )}

      {/* ── Línea completa de un trabajador ── */}
      {detalle && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" onClick={() => setDetalle(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl p-5 max-w-3xl w-full max-h-[80vh] overflow-auto">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-black text-slate-800">{detalle.nombre} — {detalle.lineas.length} línea(s)</h3>
              <button onClick={() => setDetalle(null)} className="text-slate-400 hover:text-slate-700 text-lg">×</button>
            </div>
            {detalle.lineas.map((ln, j) => (
              <div key={j} className="mb-4">
                <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Línea {j + 1}</p>
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-1 text-[11px] font-mono">
                  {ln.split(';').map((v, n) => (
                    <div key={n} className={`px-2 py-1 rounded ${v ? 'bg-slate-50' : 'bg-white text-slate-300'}`}>
                      <span className="text-slate-400">{n + 1}:</span> {v || '·'}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="text-[11px] text-slate-400 leading-snug">
        Plazo: día 10 del mes siguiente (13 si se declara y paga en forma electrónica). El archivo sale en texto plano,
        separado por «;», sin encabezado y con 105 campos por línea. No lo abras en Excel antes de subirlo.
      </p>
    </div>
  );
}
