/**
 * LicenciasSection.jsx — src/pages/rrhh/LicenciasSection.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Registro de licencias médicas.
 *
 * Los días de reposo no los paga la empresa: el subsidio lo entera la isapre,
 * Fonasa o la CCAF directo al trabajador, y esa misma entidad paga las
 * cotizaciones de pensiones y salud de todo el reposo. Registrar la licencia
 * acá saca esos días de la base imponible de la liquidación del mes y los
 * declara en la posición 13 del archivo de Previred.
 *
 * Los días se derivan de las fechas, nunca se escriben a mano: una licencia a
 * caballo entre dos meses aporta a cada uno lo que le corresponde sin que
 * nadie tenga que repartirla.
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { db } from '../../lib/firebase';
import { useEmpresa } from '../../lib/useEmpresa';
import { collection, getDocs } from 'firebase/firestore';
import { inp, MESES } from './shared';
import {
  useLicencias, crearLicencia, actualizarLicencia, eliminarLicencia,
  licenciasDe, diasCorridos, diasEnPeriodo, diasParaCarencia,
  TIPOS_LICENCIA, ENTIDADES_PAGADORAS, ESTADOS_LICENCIA,
} from './licencias';

const hoy = () => new Date().toISOString().slice(0, 10);

export default function LicenciasSection() {
  const { empresaId } = useEmpresa();
  const { licencias, loading } = useLicencias(empresaId);

  const [trabajadores, setTrabajadores] = useState([]);
  const [mes,  setMes]  = useState(String(new Date().getMonth() + 1).padStart(2, '0'));
  const [anio, setAnio] = useState(String(new Date().getFullYear()));
  const [busqueda, setBusqueda] = useState('');

  // Formulario de alta
  const [form, setForm] = useState({
    trabajadorId: '', folio: '', tipo: 'comun',
    desde: hoy(), hasta: hoy(), entidad: 'isapre', continuaDeId: '',
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);
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

  // Licencias previas del trabajador elegido, para encadenar por mismo cuadro
  // clínico. Solo las que terminaron hace poco: encadenar con una de hace un
  // año no tiene sentido y solo ensucia el selector.
  const previas = useMemo(() => {
    if (!form.trabajadorId || !form.desde) return [];
    const limite = new Date(`${form.desde}T12:00:00`);
    limite.setDate(limite.getDate() - 45);
    return licencias
      .filter(l => l.trabajadorId === form.trabajadorId
        && l.hasta && new Date(`${l.hasta}T12:00:00`) >= limite
        && l.hasta < form.desde)
      .sort((a, b) => String(b.hasta).localeCompare(String(a.hasta)));
  }, [licencias, form.trabajadorId, form.desde]);

  const delPeriodo = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return licencias
      .map(l => ({
        ...l,
        _t: trabajadores.find(t => t.id === l.trabajadorId),
        _dias: diasCorridos(l.desde, l.hasta),
        _enPeriodo: diasEnPeriodo(l, mes, anio),
        _cadena: diasParaCarencia(l, licencias.filter(x => x.trabajadorId === l.trabajadorId)),
      }))
      .filter(l => l._enPeriodo > 0)
      .filter(l => {
        if (!q) return true;
        const t = l._t;
        return `${t?.nombre} ${t?.apellidoPaterno} ${t?.rut} ${l.folio}`.toLowerCase().includes(q);
      })
      .sort((a, b) => String(b.desde || '').localeCompare(String(a.desde || '')));
  }, [licencias, trabajadores, mes, anio, busqueda]);

  const totales = useMemo(() => {
    const vigentes = delPeriodo.filter(l => l.estado !== 'rechazada');
    return {
      dias:     vigentes.reduce((s, l) => s + l._enPeriodo, 0),
      personas: new Set(vigentes.map(l => l.trabajadorId)).size,
      carencia: vigentes.filter(l =>
        (TIPOS_LICENCIA[l.tipo || 'comun']?.carencia) && l._cadena > 0 && l._cadena <= 10).length,
    };
  }, [delPeriodo]);

  // Vista previa de lo que va a pasar con la licencia que se está escribiendo
  const preview = useMemo(() => {
    const dias = diasCorridos(form.desde, form.hasta);
    if (!dias) return null;
    const cadena = form.continuaDeId
      ? dias + (previas.find(p => p.id === form.continuaDeId)
          ? diasParaCarencia(previas.find(p => p.id === form.continuaDeId), licencias) : 0)
      : dias;
    const tieneCarencia = TIPOS_LICENCIA[form.tipo]?.carencia && cadena <= 10;
    return { dias, cadena, tieneCarencia, enPeriodo: diasEnPeriodo(form, mes, anio) };
  }, [form, previas, licencias, mes, anio]);

  const agregar = async () => {
    setError(null);
    setGuardando(true);
    try {
      await crearLicencia(empresaId, { ...form, continuaDeId: form.continuaDeId || null }, licencias);
      setForm(f => ({ ...f, folio: '', continuaDeId: '' }));
    } catch (e) { setError(e.message); }
    setGuardando(false);
  };

  const cambiarEstado = async (l, estado) => {
    setError(null);
    try { await actualizarLicencia(empresaId, l.id, { estado }, licencias); }
    catch (e) { setError(e.message); }
  };

  const quitar = async (l) => {
    setError(null);
    try { await eliminarLicencia(empresaId, l, l.estado === 'aprobada'); }
    catch (e) { setError(e.message); }
    setConfirmar(null);
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
          <input className={inp} placeholder="Nombre, RUT o folio…" value={busqueda}
            onChange={e => setBusqueda(e.target.value)} />
        </div>
      </div>

      {/* ── KPIs ── */}
      <div className="grid grid-cols-3 gap-3">
        {[
          ['Días de reposo', totales.dias,     'text-sky-700',    'bg-sky-50'],
          ['Personas',       totales.personas, 'text-violet-700', 'bg-violet-50'],
          ['Con carencia',   totales.carencia, 'text-amber-700',  'bg-amber-50'],
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
          Nueva licencia médica
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-[2fr_1fr_1.4fr] gap-2">
          <select className={inp} value={form.trabajadorId}
            onChange={e => set('trabajadorId', e.target.value)}>
            <option value="">Trabajador…</option>
            {activos.map(t => (
              <option key={t.id} value={t.id}>{t.apellidoPaterno} {t.nombre}</option>
            ))}
          </select>
          <input className={inp} placeholder="Folio" value={form.folio}
            onChange={e => set('folio', e.target.value)} />
          <select className={inp} value={form.tipo} onChange={e => set('tipo', e.target.value)}>
            {Object.entries(TIPOS_LICENCIA).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_1.4fr_auto] gap-2">
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Desde</p>
            <input type="date" className={inp} value={form.desde}
              onChange={e => set('desde', e.target.value)} />
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Hasta</p>
            <input type="date" className={inp} value={form.hasta}
              onChange={e => set('hasta', e.target.value)} />
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Entidad pagadora</p>
            <select className={inp} value={form.entidad} onChange={e => set('entidad', e.target.value)}>
              {Object.entries(ENTIDADES_PAGADORAS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button onClick={agregar} disabled={guardando}
              className="px-4 py-2.5 rounded-xl text-sm font-bold bg-violet-600 hover:bg-violet-700 text-white disabled:opacity-40 whitespace-nowrap transition-colors">
              Agregar
            </button>
          </div>
        </div>

        {/* Encadenamiento por mismo cuadro clínico */}
        {previas.length > 0 && (
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">
              ¿Continúa una licencia anterior?
            </p>
            <select className={inp} value={form.continuaDeId}
              onChange={e => set('continuaDeId', e.target.value)}>
              <option value="">No — es un cuadro clínico distinto</option>
              {previas.map(p => (
                <option key={p.id} value={p.id}>
                  Folio {p.folio || 's/n'} · {p.desde} al {p.hasta} · {diasCorridos(p.desde, p.hasta)} días
                </option>
              ))}
            </select>
            <p className="text-[11px] text-slate-400 mt-1 leading-snug">
              Las licencias continuas por el mismo diagnóstico suman sus días para decidir si aplica
              carencia. Dos de 6 días encadenadas son 12: no hay carencia.
            </p>
          </div>
        )}

        {error && <p className="text-[11px] font-bold text-red-600">{error}</p>}

        {/* Vista previa del efecto */}
        {preview && (
          <div className="rounded-xl bg-white border border-violet-100 px-3 py-2.5 text-[11px] text-slate-600 leading-snug">
            <strong>{preview.dias} días</strong> de reposo
            {preview.cadena !== preview.dias && <> ({preview.cadena} contando la cadena)</>}
            {preview.enPeriodo > 0
              ? <>, de los cuales <strong>{preview.enPeriodo}</strong> caen en {MESES[parseInt(mes) - 1]} {anio}.</>
              : <>, ninguno en {MESES[parseInt(mes) - 1]} {anio}.</>}
            {preview.tieneCarencia
              ? <span className="text-amber-700"> Los primeros 3 días no dan derecho a subsidio y la empresa
                  tampoco está obligada a pagarlos.</span>
              : <span className="text-emerald-700"> Sin carencia: el subsidio corre desde el primer día.</span>}
          </div>
        )}

        <p className="text-[11px] text-slate-400 leading-snug">
          Los días se descuentan solos en la liquidación del período y se declaran en Previred.
          La empresa no paga el reposo ni cotiza por él: eso lo hace la entidad pagadora del subsidio.
        </p>
      </div>

      {/* ── Listado ── */}
      {loading ? (
        <p className="text-xs text-slate-400 py-6 text-center">Cargando…</p>
      ) : delPeriodo.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-slate-400 bg-slate-50 rounded-2xl">
          <span className="text-4xl mb-3">🩺</span>
          <p className="font-semibold">Sin licencias en {MESES[parseInt(mes) - 1]} {anio}</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-100">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: '#1e1b4b' }}>
                {['Trabajador', 'Folio', 'Tipo', 'Reposo', 'Días', 'En el mes', 'Entidad', 'Estado', ''].map(h => (
                  <th key={h} className="px-3 py-2.5 text-[10px] font-black text-slate-300 uppercase tracking-widest text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {delPeriodo.map(l => {
                const tipo = TIPOS_LICENCIA[l.tipo || 'comun'] || TIPOS_LICENCIA.comun;
                const est  = ESTADOS_LICENCIA[l.estado || 'ingresada'] || ESTADOS_LICENCIA.ingresada;
                const conCarencia = tipo.carencia && l._cadena > 0 && l._cadena <= 10;
                return (
                  <tr key={l.id} className={`hover:bg-slate-50 ${l.estado === 'rechazada' ? 'opacity-50' : ''}`}>
                    <td className="px-3 py-2.5 font-bold text-slate-800">
                      {l._t?.nombre} {l._t?.apellidoPaterno}
                      <span className="block font-mono font-normal text-slate-400 text-[11px]">{l._t?.rut || '—'}</span>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-slate-500 text-xs">{l.folio || '—'}</td>
                    <td className="px-3 py-2.5">
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${tipo.bg} ${tipo.color}`}>
                        {tipo.label}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-slate-500 text-xs whitespace-nowrap">
                      {l.desde} → {l.hasta}
                    </td>
                    <td className="px-3 py-2.5 font-black text-slate-700">
                      {l._dias}
                      {l.continuaDeId && (
                        <span className="block text-[10px] font-bold text-slate-400">cadena: {l._cadena}</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="font-black text-sky-700">{l._enPeriodo}</span>
                      {conCarencia && (
                        <span className="block text-[10px] font-bold text-amber-600">3 de carencia</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-slate-500 text-xs">
                      {ENTIDADES_PAGADORAS[l.entidad] || '—'}
                    </td>
                    <td className="px-3 py-2.5">
                      <select value={l.estado || 'ingresada'}
                        onChange={e => cambiarEstado(l, e.target.value)}
                        className={`text-[10px] font-black px-2 py-1 rounded-full border-0 cursor-pointer ${est.bg} ${est.color}`}>
                        {Object.entries(ESTADOS_LICENCIA).map(([k, v]) => (
                          <option key={k} value={k}>{v.label}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap">
                      <button onClick={() => setConfirmar(l)}
                        className="text-[11px] font-bold text-slate-400 hover:text-red-600 px-2">
                        Eliminar
                      </button>
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
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setConfirmar(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full">
            <h3 className="text-base font-black text-slate-900">
              {confirmar.estado === 'aprobada' ? '¿Rechazar esta licencia?' : '¿Eliminar esta licencia?'}
            </h3>
            <p className="text-xs text-slate-500 mt-2 leading-snug">
              {confirmar.estado === 'aprobada'
                ? 'Está aprobada, así que no se borra: queda como rechazada y deja de descontar días. El registro se conserva porque esos días ya se declararon en Previred.'
                : 'Se elimina por completo y los días vuelven a la liquidación del período.'}
            </p>
            <div className="flex gap-2 mt-4">
              <button onClick={() => quitar(confirmar)}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold bg-red-600 hover:bg-red-700 text-white">
                {confirmar.estado === 'aprobada' ? 'Rechazar' : 'Eliminar'}
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
