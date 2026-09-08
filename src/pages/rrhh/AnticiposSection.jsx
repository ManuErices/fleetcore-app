/**
 * AnticiposSection.jsx — src/pages/rrhh/AnticiposSection.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Registro de anticipos de remuneración del período.
 *
 * Un trabajador puede tener varios en un mismo mes (quincenas, adelantos
 * puntuales). Cada uno se paga con su propia nómina y la liquidación del mes
 * los descuenta todos automáticamente: nadie tiene que volver a escribir el
 * monto a mano.
 *
 * Los anticipos NO llevan cotizaciones ni impuesto — son un adelanto contra la
 * remuneración que se devengará, no una remuneración en sí.
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { db } from '../../lib/firebase';
import { useEmpresa } from '../../lib/useEmpresa';
import { collection, getDocs } from 'firebase/firestore';
import { inp, MESES } from './shared';
import {
  useAnticipos, crearAnticipo, actualizarAnticipo, eliminarAnticipo, ESTADOS_ANTICIPO,
} from './anticipos';

const fmt = n => `$${Math.round(n || 0).toLocaleString('es-CL')}`;
const soloNum = v => String(v ?? '').replace(/[^\d]/g, '');
const formatCLP = v => { const n = soloNum(v); return n ? Number(n).toLocaleString('es-CL') : ''; };

export default function AnticiposSection() {
  const { empresaId } = useEmpresa();
  const { anticipos, loading } = useAnticipos(empresaId);

  const [trabajadores, setTrabajadores] = useState([]);
  const [mes,  setMes]  = useState(String(new Date().getMonth() + 1).padStart(2, '0'));
  const [anio, setAnio] = useState(String(new Date().getFullYear()));
  const [busqueda, setBusqueda] = useState('');

  // Formulario de alta
  const [trabajadorId, setTrabajadorId] = useState('');
  const [monto, setMonto]   = useState('');
  const [glosa, setGlosa]   = useState('');
  const [fecha, setFecha]   = useState(() => new Date().toISOString().slice(0, 10));
  const [guardando, setGuardando] = useState(false);
  const [error, setError]   = useState(null);
  const [confirmar, setConfirmar] = useState(null);

  const load = useCallback(async () => {
    if (!empresaId) return;
    const snap = await getDocs(collection(db, 'empresas', empresaId, 'trabajadores'));
    setTrabajadores(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  }, [empresaId]);
  useEffect(() => { load(); }, [load]);

  const activos = useMemo(
    () => trabajadores.filter(t => t.estado === 'activo')
      .sort((a, b) => (a.apellidoPaterno || '').localeCompare(b.apellidoPaterno || '')),
    [trabajadores]
  );

  const delPeriodo = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return anticipos
      .filter(a => a.mes === mes && a.anio === anio)
      .map(a => ({ ...a, _t: trabajadores.find(t => t.id === a.trabajadorId) }))
      .filter(a => {
        if (!q) return true;
        const t = a._t;
        return `${t?.nombre} ${t?.apellidoPaterno} ${t?.rut}`.toLowerCase().includes(q);
      })
      .sort((a, b) => String(b.fecha || '').localeCompare(String(a.fecha || '')));
  }, [anticipos, trabajadores, mes, anio, busqueda]);

  const totales = useMemo(() => ({
    pendiente: delPeriodo.filter(a => a.estado === 'pendiente').reduce((s, a) => s + (a.monto || 0), 0),
    pagado:    delPeriodo.filter(a => a.estado === 'pagado').reduce((s, a) => s + (a.monto || 0), 0),
    personas:  new Set(delPeriodo.filter(a => a.estado !== 'anulado').map(a => a.trabajadorId)).size,
  }), [delPeriodo]);

  const agregar = async () => {
    setError(null);
    if (!trabajadorId || !soloNum(monto)) { setError('Selecciona el trabajador e ingresa un monto.'); return; }
    setGuardando(true);
    try {
      await crearAnticipo(empresaId, { trabajadorId, mes, anio, monto: soloNum(monto), glosa, fecha });
      setTrabajadorId(''); setMonto(''); setGlosa('');
    } catch (e) { setError(e.message); }
    setGuardando(false);
  };

  const quitar = async (a) => {
    try { await eliminarAnticipo(empresaId, a); } catch (e) { setError(e.message); }
    setConfirmar(null);
  };

  const restaurar = async (a) => {
    try { await actualizarAnticipo(empresaId, a.id, { estado: 'pendiente' }); }
    catch (e) { setError(e.message); }
  };

  return (
    <div className="space-y-5">

      {/* ── Filtros de período ── */}
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
        <div className="flex-1 min-w-[200px]">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Buscar</p>
          <input className={inp} placeholder="Nombre o RUT…" value={busqueda}
            onChange={e => setBusqueda(e.target.value)} />
        </div>
      </div>

      {/* ── KPIs ── */}
      <div className="grid grid-cols-3 gap-3">
        {[
          ['Por pagar', fmt(totales.pendiente), 'text-amber-700',   'bg-amber-50'],
          ['Pagado',    fmt(totales.pagado),    'text-emerald-700', 'bg-emerald-50'],
          ['Personas',  totales.personas,       'text-violet-700',  'bg-violet-50'],
        ].map(([l, v, c, bg]) => (
          <div key={l} className={`${bg} rounded-xl px-3 py-3 border border-slate-100`}>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{l}</p>
            <p className={`text-base font-black ${c} mt-0.5`}>{v}</p>
          </div>
        ))}
      </div>

      {/* ── Alta ── */}
      <div className="rounded-2xl border border-violet-100 bg-violet-50/40 p-4 space-y-3">
        <p className="text-[10px] font-black text-violet-500 uppercase tracking-widest">
          Nuevo anticipo — {MESES[parseInt(mes) - 1]} {anio}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-[2fr_1fr_1fr_1.5fr_auto] gap-2">
          <select className={inp} value={trabajadorId} onChange={e => setTrabajadorId(e.target.value)}>
            <option value="">Trabajador…</option>
            {activos.map(t => (
              <option key={t.id} value={t.id}>{t.apellidoPaterno} {t.nombre}</option>
            ))}
          </select>
          <input className={inp} placeholder="Monto" value={formatCLP(monto)}
            onChange={e => setMonto(soloNum(e.target.value))} />
          <input type="date" className={inp} value={fecha} onChange={e => setFecha(e.target.value)} />
          <input className={inp} placeholder="Glosa — ej: 1ª quincena" maxLength={30}
            value={glosa} onChange={e => setGlosa(e.target.value)} />
          <button onClick={agregar} disabled={guardando}
            className="px-4 py-2.5 rounded-xl text-sm font-bold bg-violet-600 hover:bg-violet-700 text-white disabled:opacity-40 whitespace-nowrap transition-colors">
            Agregar
          </button>
        </div>
        {error && <p className="text-[11px] font-bold text-red-600">{error}</p>}
        <p className="text-[11px] text-slate-400 leading-snug">
          Se descuenta automáticamente en la liquidación del período, sin cotizaciones ni impuesto.
          Una persona puede tener varios anticipos en el mismo mes. El pago se emite desde
          Archivo de Pago, pestaña Anticipos.
        </p>
      </div>

      {/* ── Listado ── */}
      {loading ? (
        <p className="text-xs text-slate-400 py-6 text-center">Cargando…</p>
      ) : delPeriodo.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-slate-400 bg-slate-50 rounded-2xl">
          <span className="text-4xl mb-3">💵</span>
          <p className="font-semibold">Sin anticipos en {MESES[parseInt(mes) - 1]} {anio}</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-100">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: '#1e1b4b' }}>
                {['Trabajador', 'RUT', 'Fecha', 'Glosa', 'Monto', 'Estado', ''].map(h => (
                  <th key={h} className="px-3 py-2.5 text-[10px] font-black text-slate-300 uppercase tracking-widest text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {delPeriodo.map(a => {
                const est = ESTADOS_ANTICIPO[a.estado] || ESTADOS_ANTICIPO.pendiente;
                return (
                  <tr key={a.id} className={`hover:bg-slate-50 ${a.estado === 'anulado' ? 'opacity-50' : ''}`}>
                    <td className="px-3 py-2.5 font-bold text-slate-800">
                      {a._t?.nombre} {a._t?.apellidoPaterno}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-slate-500 text-xs">{a._t?.rut || '—'}</td>
                    <td className="px-3 py-2.5 font-mono text-slate-500 text-xs">{a.fecha || '—'}</td>
                    <td className="px-3 py-2.5 text-slate-500 text-xs">{a.glosa || '—'}</td>
                    <td className="px-3 py-2.5 font-black text-slate-700">{fmt(a.monto)}</td>
                    <td className="px-3 py-2.5">
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${est.bg} ${est.color}`}>
                        {est.label}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap">
                      {a.estado === 'anulado' ? (
                        <button onClick={() => restaurar(a)}
                          className="text-[11px] font-bold text-violet-600 hover:text-violet-800 px-2">
                          Restaurar
                        </button>
                      ) : (
                        <button onClick={() => setConfirmar(a)}
                          className="text-[11px] font-bold text-slate-400 hover:text-red-600 px-2">
                          {a.estado === 'pagado' ? 'Anular' : 'Eliminar'}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Confirmación ── */}
      {confirmar && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setConfirmar(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full">
            <h3 className="text-base font-black text-slate-900">
              {confirmar.estado === 'pagado' ? '¿Anular este anticipo?' : '¿Eliminar este anticipo?'}
            </h3>
            <p className="text-xs text-slate-500 mt-2 leading-snug">
              {confirmar.estado === 'pagado'
                ? 'Ya fue pagado en una nómina, así que no se borra: queda anulado y deja de descontarse en la liquidación del período. El registro del pago se conserva.'
                : 'Todavía no se ha pagado, así que se elimina por completo.'}
            </p>
            <div className="flex gap-2 mt-4">
              <button onClick={() => quitar(confirmar)}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold bg-red-600 hover:bg-red-700 text-white">
                {confirmar.estado === 'pagado' ? 'Anular' : 'Eliminar'}
              </button>
              <button onClick={() => setConfirmar(null)}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold bg-slate-100 hover:bg-slate-200 text-slate-600">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
