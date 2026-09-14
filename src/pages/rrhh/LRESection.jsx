/**
 * LRESection.jsx — src/pages/rrhh/LRESection.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Libro de Remuneraciones Electrónico (Art. 62 CT).
 *
 * Obligatorio para empleadores con 5 o más trabajadores. Se declara en el
 * portal Mi DT antes de la medianoche del día 15 del mes siguiente a aquel en
 * que se pagó la remuneración.
 *
 * La pantalla valida ANTES de generar. La DT rechaza el archivo completo si un
 * solo campo obligatorio viene vacío, y el proceso de validación puede tardar
 * 48 horas: descubrir el error acá cuesta un minuto, descubrirlo allá cuesta
 * dos días y el plazo no se detiene.
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { db } from '../../lib/firebase';
import { useEmpresa } from '../../lib/useEmpresa';
import { collection, getDocs, doc, getDoc, setDoc } from 'firebase/firestore';
import { inp, MESES } from './shared';
import { liquidacionDe, calcularIUT, calcularRentaTributable, liquidacionesVigentes } from './calculo';
import { useAnticipos, anticiposDe, totalAnticipos } from './anticipos';
import { useLicencias, licenciasDe } from './licencias';
import { paramsDe } from './parametros';
import {
  filaLRE, validarLRE, csvLRE, descargarLRE, nombreArchivoLRE,
  COLUMNAS_LRE, REGIONES, COD_CCAF, COD_MUTUAL,
} from './lre';

const fmt = n => `$${Math.round(n || 0).toLocaleString('es-CL')}`;

export default function LRESection() {
  const { empresaId, empresa } = useEmpresa();
  const { anticipos } = useAnticipos(empresaId);
  const { licencias } = useLicencias(empresaId);

  const [mes,  setMes]  = useState(String(new Date().getMonth() + 1).padStart(2, '0'));
  const [anio, setAnio] = useState(String(new Date().getFullYear()));

  const [liquidaciones, setLiquidaciones] = useState([]);
  const [trabajadores, setTrabajadores]   = useState([]);
  const [contratos, setContratos]         = useState([]);
  const [finiquitos, setFiniquitos]       = useState([]);
  const [loading, setLoading] = useState(true);

  // Configuración LRE de la empresa
  const [config, setConfig] = useState({ region: '', comuna: '', ccaf: 0, mutual: 2 });
  const [guardandoCfg, setGuardandoCfg] = useState(false);
  const [cfgOk, setCfgOk] = useState(false);

  const load = useCallback(async () => {
    if (!empresaId) return;
    setLoading(true);
    try {
      const [lSnap, tSnap, cSnap, fSnap, cfgSnap] = await Promise.all([
        getDocs(collection(db, 'empresas', empresaId, 'remuneraciones')),
        getDocs(collection(db, 'empresas', empresaId, 'trabajadores')),
        getDocs(collection(db, 'empresas', empresaId, 'contratos')),
        getDocs(collection(db, 'empresas', empresaId, 'finiquitos')),
        getDoc(doc(db, 'empresas', empresaId, 'config', 'lre')),
      ]);
      setLiquidaciones(lSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setTrabajadores(tSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setContratos(cSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setFiniquitos(fSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      if (cfgSnap.exists()) setConfig(c => ({ ...c, ...cfgSnap.data() }));
    } catch (e) {
      console.error('[LRE] carga:', e);
    }
    setLoading(false);
  }, [empresaId]);
  useEffect(() => { load(); }, [load]);

  const guardarConfig = async () => {
    setGuardandoCfg(true); setCfgOk(false);
    try {
      await setDoc(doc(db, 'empresas', empresaId, 'config', 'lre'), config, { merge: true });
      setCfgOk(true);
      setTimeout(() => setCfgOk(false), 2500);
    } catch (e) { console.error(e); }
    setGuardandoCfg(false);
  };

  // ── Filas del período ──
  const filas = useMemo(() => {
    // Una liquidación reemplazada por una reliquidación no va al libro: el mes
    // quedaría declarado dos veces para la misma persona.
    const delMes = liquidacionesVigentes(
      liquidaciones.filter(l => l.mes === mes && l.anio === anio)
    );

    return delMes.map(l => {
      const trabajador = trabajadores.find(t => t.id === l.trabajadorId);
      const contrato   = contratos.find(c => c.id === l.contratoId);
      if (!contrato) return null;

      const lics = licenciasDe(licencias, trabajador?.id, mes, anio);
      const calc = liquidacionDe(trabajador, contrato, { ...l, tasaMutual: config.tasaMutual }, {
        anticiposRegistrados: anticiposDe(anticipos, trabajador?.id, mes, anio).length
          ? totalAnticipos(anticipos, trabajador?.id, mes, anio)
          : undefined,
        licenciasRegistradas: lics.length ? lics : undefined,
      });
      const iut = calcularIUT(calcularRentaTributable(calc), paramsDe({ mes, anio }).utm);

      // Término de contrato dentro del período: la DT exige fecha y causal
      // juntas, y solo se declaran en el mes en que efectivamente ocurrió.
      const fin = finiquitos.find(f =>
        f.trabajadorId === trabajador?.id &&
        String(f.fechaTermino || '').slice(0, 7) === `${anio}-${mes}`);

      return {
        nombre: `${trabajador?.nombre || ''} ${trabajador?.apellidoPaterno || ''}`.trim() || '(sin ficha)',
        rut: trabajador?.rut || '—',
        liquido: calc.liquido - iut,
        fila: filaLRE({ trabajador, contrato, liq: l, calc, iut, finiquito: fin, config }),
      };
    }).filter(Boolean);
  }, [liquidaciones, trabajadores, contratos, finiquitos, licencias, anticipos, mes, anio, config]);

  const problemas = useMemo(() => validarLRE(filas), [filas]);
  const listo = filas.length > 0 && problemas.length === 0;

  const totales = useMemo(() => ({
    trabajadores: filas.length,
    haberes:  filas.reduce((s, f) => s + (Number(f.fila[5201]) || 0), 0),
    liquido:  filas.reduce((s, f) => s + (Number(f.fila[5501]) || 0), 0),
  }), [filas]);

  const descargar = () => descargarLRE(filas, empresa?.rut, mes, anio);

  const nombreArchivo = nombreArchivoLRE(empresa?.rut, mes, anio);

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
            {[2024, 2025, 2026, 2027].map(y => <option key={y}>{y}</option>)}
          </select>
        </div>
        <div className="flex-1" />
        <button onClick={descargar} disabled={!listo}
          className="px-5 py-2.5 rounded-xl text-sm font-bold bg-gradient-to-r from-emerald-500 to-teal-600 text-white hover:opacity-90 disabled:opacity-40 shadow-sm">
          Descargar {nombreArchivo}
        </button>
      </div>

      {/* ── KPIs ── */}
      <div className="grid grid-cols-3 gap-3">
        {[
          ['Trabajadores', totales.trabajadores, 'text-violet-700', 'bg-violet-50'],
          ['Total haberes', fmt(totales.haberes), 'text-slate-700', 'bg-slate-50'],
          ['Total líquido', fmt(totales.liquido), 'text-emerald-700', 'bg-emerald-50'],
        ].map(([l, v, c, bg]) => (
          <div key={l} className={`${bg} rounded-xl px-3 py-3 border border-slate-100`}>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{l}</p>
            <p className={`text-base font-black ${c} mt-0.5`}>{v}</p>
          </div>
        ))}
      </div>

      {/* ── Configuración ── */}
      <div className="rounded-2xl border border-violet-100 bg-violet-50/40 p-4 space-y-3">
        <p className="text-[10px] font-black text-violet-500 uppercase tracking-widest">
          Configuración del libro
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Región</p>
            <select className={inp} value={config.region}
              onChange={e => setConfig(c => ({ ...c, region: e.target.value }))}>
              <option value="">Seleccionar…</option>
              {REGIONES.map(r => <option key={r.cod} value={r.cod}>{r.nombre}</option>)}
            </select>
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Código comuna</p>
            <input className={inp} value={config.comuna} inputMode="numeric" placeholder="Ej: 13101"
              onChange={e => setConfig(c => ({ ...c, comuna: e.target.value.replace(/\D/g, '') }))} />
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">CCAF</p>
            <select className={inp} value={config.ccaf}
              onChange={e => setConfig(c => ({ ...c, ccaf: Number(e.target.value) }))}>
              {Object.entries(COD_CCAF).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Ley 16.744</p>
            <select className={inp} value={config.mutual}
              onChange={e => setConfig(c => ({ ...c, mutual: Number(e.target.value) }))}>
              {Object.entries(COD_MUTUAL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={guardarConfig} disabled={guardandoCfg}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-violet-600 hover:bg-violet-700 text-white disabled:opacity-40">
            {guardandoCfg ? 'Guardando…' : 'Guardar configuración'}
          </button>
          {cfgOk && <span className="text-[11px] font-bold text-emerald-600">Guardado</span>}
        </div>
        <p className="text-[11px] text-slate-400 leading-snug">
          Región y comuna son de <strong>prestación de los servicios</strong>, no del domicilio de la
          empresa. Si un contrato tiene faena en otra región, se define en el contrato
          (<code>lreRegion</code>, <code>lreComuna</code>) y manda sobre esto. Los códigos de comuna
          están en el CSV base que se descarga desde el portal Mi DT.
        </p>
      </div>

      {/* ── Validación previa ── */}
      {loading ? (
        <p className="text-xs text-slate-400 py-6 text-center">Cargando…</p>
      ) : filas.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-slate-400 bg-slate-50 rounded-2xl">
          <span className="text-4xl mb-3">📘</span>
          <p className="font-semibold">Sin liquidaciones en {MESES[parseInt(mes) - 1]} {anio}</p>
        </div>
      ) : problemas.length > 0 ? (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <p className="text-xs font-black text-amber-800 mb-1.5">
            {problemas.length} {problemas.length === 1 ? 'trabajador tiene' : 'trabajadores tienen'} datos incompletos
          </p>
          <p className="text-[11px] text-amber-700 mb-3 leading-snug">
            La DT rechaza el archivo completo si un solo campo obligatorio viene vacío, y la
            validación puede tardar 48 horas. Completa esto antes de generar.
          </p>
          <div className="space-y-2">
            {problemas.map((p, i) => (
              <div key={i} className="text-[11px]">
                <span className="font-bold text-amber-900">{p.nombre}</span>
                <span className="text-amber-600"> — falta: {p.faltan.join(' · ')}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
          <p className="text-xs font-bold text-emerald-800 leading-snug">
            {filas.length} {filas.length === 1 ? 'trabajador listo' : 'trabajadores listos'} para declarar.
            El archivo sale en ANSI con delimitador «;» y {COLUMNAS_LRE.length} columnas, como exige la DT.
            No lo abras en Excel antes de subirlo: al guardarlo cambia el formato y la carga falla.
          </p>
        </div>
      )}

      {/* ── Detalle ── */}
      {filas.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-slate-100">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: '#1e1b4b' }}>
                {['Trabajador', 'RUT', 'Días trab.', 'Días lic.', 'Total haberes', 'Descuentos', 'Líquido'].map(h => (
                  <th key={h} className="px-3 py-2.5 text-[10px] font-black text-slate-300 uppercase tracking-widest text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filas.map((f, i) => (
                <tr key={i} className="hover:bg-slate-50">
                  <td className="px-3 py-2.5 font-bold text-slate-800">{f.nombre}</td>
                  <td className="px-3 py-2.5 font-mono text-slate-500 text-xs">{f.fila[1101] || f.rut}</td>
                  <td className="px-3 py-2.5 font-mono text-slate-500 text-xs">{f.fila[1115]}</td>
                  <td className="px-3 py-2.5 font-mono text-sky-600 text-xs">{f.fila[1116] || '—'}</td>
                  <td className="px-3 py-2.5 font-black text-slate-700">{fmt(f.fila[5201])}</td>
                  <td className="px-3 py-2.5 font-black text-red-500">-{fmt(f.fila[5301])}</td>
                  <td className="px-3 py-2.5 font-black text-emerald-600">{fmt(f.fila[5501])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[11px] text-slate-400 leading-snug">
        Plazo: hasta la medianoche del día 15 del mes siguiente al pago de la remuneración. Si cae
        domingo o festivo, corre al día hábil siguiente. Se puede rectificar sin límite mientras no
        haya otra carga del mismo mes en proceso, salvo entre el 14/02 y el 31/05 respecto de las
        declaraciones del año calendario anterior.
      </p>
    </div>
  );
}
