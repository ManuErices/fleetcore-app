import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { listMaintenancePlans, listMaintenanceEvents } from '../../lib/db';

// Estandariza nombres propios a Capitalización de Título (la data suele venir
// en MAYÚSCULAS). No toca códigos/RUT.
const CONECTORES = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'e', 'da', 'do']);
function titleCase(str) {
  if (!str) return '';
  return String(str).toLowerCase().split(/\s+/)
    .map((w, i) => (i > 0 && CONECTORES.has(w)) ? w : (w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ').trim();
}
const num = (v) => parseFloat(v) || 0;

/**
 * Panel de detalle de una máquina: despliega TODA su información agregada a
 * partir de sus registros (reportes_detallados) — quién la usó, horas, km,
 * combustible, obras, horómetro actual y estado de mantenciones — con filtros.
 *
 * Multi-tenant: todo se lee bajo empresas/{empresaId}/... (nunca global).
 */
export default function MaquinaDetalleModal({ machine, empresaId, onClose }) {
  const [reportes, setReportes] = useState([]);
  const [projects, setProjects] = useState([]);
  const [planes, setPlanes] = useState([]);
  const [eventos, setEventos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtros, setFiltros] = useState({ fechaInicio: '', fechaFin: '', operador: '', proyecto: '' });

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  useEffect(() => {
    if (!empresaId || !machine?.id) return;
    let cancel = false;
    (async () => {
      setLoading(true);
      try {
        const [repSnap, projSnap, pl, ev] = await Promise.all([
          getDocs(query(collection(db, 'empresas', empresaId, 'reportes_detallados'), where('machineId', '==', machine.id))),
          getDocs(collection(db, 'empresas', empresaId, 'projects')),
          listMaintenancePlans(empresaId, machine.id),
          listMaintenanceEvents(empresaId, machine.id),
        ]);
        if (cancel) return;
        setReportes(repSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(r => r.deleted !== true));
        setProjects(projSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        setPlanes(pl);
        setEventos(ev);
      } catch (e) {
        console.error('Error cargando detalle de máquina:', e);
      }
      if (!cancel) setLoading(false);
    })();
    return () => { cancel = true; };
  }, [empresaId, machine?.id]);

  const projName = (projectId, fallback) =>
    projects.find(p => p.id === projectId)?.name || fallback || projectId || '—';

  // Horómetro actual efectivo: el más alto reportado (crece con cada registro).
  const horometroActual = useMemo(() => {
    let max = machine?.medidorActual != null ? Number(machine.medidorActual) : 0;
    reportes.forEach(r => { const hf = num(r.horometroFinal); if (hf > max) max = hf; });
    return max;
  }, [reportes, machine]);

  // Listas para los selectores de filtro
  const operadoresLista = useMemo(
    () => [...new Set(reportes.map(r => r.operador).filter(Boolean))].sort(),
    [reportes]
  );
  const proyectosLista = useMemo(
    () => [...new Set(reportes.map(r => r.projectId).filter(Boolean))]
      .map(id => ({ id, name: projName(id) }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    [reportes, projects]
  );

  const reportesFiltrados = useMemo(() => {
    return reportes.filter(r => {
      if (filtros.fechaInicio && r.fecha < filtros.fechaInicio) return false;
      if (filtros.fechaFin && r.fecha > filtros.fechaFin) return false;
      if (filtros.operador && r.operador !== filtros.operador) return false;
      if (filtros.proyecto && r.projectId !== filtros.proyecto) return false;
      return true;
    }).sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
  }, [reportes, filtros]);

  // Agregados sobre lo filtrado
  const agg = useMemo(() => {
    let horas = 0, km = 0, comb = 0;
    const porOperador = {};
    const porObra = {};
    reportesFiltrados.forEach(r => {
      const h = Math.max(0, num(r.horometroFinal) - num(r.horometroInicial));
      const k = Math.max(0, num(r.kilometrajeFinal) - num(r.kilometrajeInicial));
      const c = num(r.cargaCombustible);
      horas += h; km += k; comb += c;
      if (r.operador) {
        if (!porOperador[r.operador]) porOperador[r.operador] = { horas: 0, reportes: 0 };
        porOperador[r.operador].horas += h;
        porOperador[r.operador].reportes += 1;
      }
      const obra = projName(r.projectId, r.projectName);
      if (!porObra[obra]) porObra[obra] = { horas: 0, reportes: 0 };
      porObra[obra].horas += h;
      porObra[obra].reportes += 1;
    });
    const operadores = Object.entries(porOperador).sort((a, b) => b[1].horas - a[1].horas);
    const obras = Object.entries(porObra).sort((a, b) => b[1].horas - a[1].horas);
    return { horas, km, comb, operadores, obras };
  }, [reportesFiltrados, projects]);

  // Mantenciones tipo horómetro: horas hasta la próxima, con horómetro actual.
  const mantenciones = useMemo(() => {
    return planes
      .filter(plan => (plan.medidorTipo || machine?.medidorTipo || 'horometro') === 'horometro')
      .map(plan => {
        const medidorGuardado = machine?.medidorActual != null ? Number(machine.medidorActual) : 0;
        const eventosPlan = eventos
          .filter(e => e.planId === plan.id && e.proximaMantencionEn != null)
          .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        let objetivo = null;
        if (eventosPlan.length) objetivo = Number(eventosPlan[0].proximaMantencionEn);
        else if (Number(plan.intervalo)) objetivo = medidorGuardado + Number(plan.intervalo);
        const restante = objetivo != null ? objetivo - horometroActual : null;
        return {
          id: plan.id,
          nombre: plan.nombre || plan.descripcion || 'Mantención',
          intervalo: Number(plan.intervalo) || 0,
          objetivo,
          restante,
        };
      })
      .sort((a, b) => {
        if (a.restante == null) return 1;
        if (b.restante == null) return -1;
        return a.restante - b.restante;
      });
  }, [planes, eventos, machine, horometroActual]);

  const limpiarFiltros = () => setFiltros({ fechaInicio: '', fechaFin: '', operador: '', proyecto: '' });

  const titulo = machine?.code || machine?.patente || machine?.name || 'Máquina';
  const subtitulo = [machine?.type, machine?.marca, machine?.modelo].filter(Boolean).join(' · ');

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-start sm:items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="bg-slate-50 rounded-2xl shadow-2xl w-full max-w-5xl my-4">
        {/* Header */}
        <div className="sticky top-0 z-10 rounded-t-2xl px-5 sm:px-6 py-4 flex items-center justify-between text-white" style={{ background: 'linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)' }}>
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
              </svg>
            </div>
            <div className="min-w-0">
              <div className="text-lg sm:text-xl font-black truncate">{titulo}</div>
              <div className="text-xs text-white/80 truncate">
                {subtitulo || 'Sin datos de tipo'}
                {machine?.patente ? ` · Patente ${machine.patente}` : ''}
              </div>
            </div>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-lg hover:bg-white/20 flex items-center justify-center transition-colors shrink-0">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <div className="w-10 h-10 border-4 border-purple-200 border-t-purple-600 rounded-full animate-spin mb-3" />
            <span className="text-sm font-medium">Cargando información de la máquina…</span>
          </div>
        ) : (
          <div className="p-4 sm:p-6 space-y-5">
            {/* Ficha + Horómetro */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Info label="Empresa / Propietario" value={machine?.empresa || machine?.propietario || '—'} />
              <Info label="Tipo" value={machine?.type || '—'} />
              <Info label="Marca / Modelo" value={[machine?.marca, machine?.modelo].filter(Boolean).join(' ') || '—'} />
              <Info label="Horómetro actual" value={`${horometroActual.toLocaleString('es-CL')} hrs`} accent />
            </div>

            {/* KPIs (según filtros) */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Kpi label="Registros" value={reportesFiltrados.length} sub="reportes" />
              <Kpi label="Horas totales" value={agg.horas.toFixed(1)} sub="hrs trabajadas" color="text-emerald-600" />
              <Kpi label="Kilometraje" value={agg.km.toFixed(0)} sub="km recorridos" color="text-blue-600" />
              <Kpi label="Combustible" value={agg.comb.toFixed(0)} sub="litros" color="text-amber-600" />
            </div>

            {/* Filtros */}
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <Campo label="Desde">
                  <input type="date" value={filtros.fechaInicio} onChange={e => setFiltros(f => ({ ...f, fechaInicio: e.target.value }))} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-purple-400" />
                </Campo>
                <Campo label="Hasta">
                  <input type="date" value={filtros.fechaFin} onChange={e => setFiltros(f => ({ ...f, fechaFin: e.target.value }))} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-purple-400" />
                </Campo>
                <Campo label="Operador">
                  <select value={filtros.operador} onChange={e => setFiltros(f => ({ ...f, operador: e.target.value }))} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:border-purple-400">
                    <option value="">Todos</option>
                    {operadoresLista.map(o => <option key={o} value={o}>{titleCase(o)}</option>)}
                  </select>
                </Campo>
                <Campo label="Obra">
                  <select value={filtros.proyecto} onChange={e => setFiltros(f => ({ ...f, proyecto: e.target.value }))} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:border-purple-400">
                    <option value="">Todas</option>
                    {proyectosLista.map(p => <option key={p.id} value={p.id}>{titleCase(p.name)}</option>)}
                  </select>
                </Campo>
              </div>
              {(filtros.fechaInicio || filtros.fechaFin || filtros.operador || filtros.proyecto) && (
                <button onClick={limpiarFiltros} className="mt-3 text-xs font-semibold text-purple-600 hover:text-purple-800">Limpiar filtros</button>
              )}
            </div>

            {/* Quién la usó + Obras */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <div className="text-xs font-bold text-slate-600 uppercase tracking-wide mb-3">Quién la usó</div>
                {agg.operadores.length ? (
                  <div className="space-y-2">
                    {agg.operadores.map(([op, d]) => (
                      <div key={op} className="flex justify-between text-sm">
                        <span className="text-slate-700 truncate mr-2">{titleCase(op)}</span>
                        <span className="text-slate-500 shrink-0">{d.horas.toFixed(1)} hrs · {d.reportes} rep.</span>
                      </div>
                    ))}
                  </div>
                ) : <div className="text-sm text-slate-400 py-3 text-center">Sin registros</div>}
              </div>
              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <div className="text-xs font-bold text-slate-600 uppercase tracking-wide mb-3">Obras donde trabajó</div>
                {agg.obras.length ? (
                  <div className="space-y-2">
                    {agg.obras.map(([obra, d]) => (
                      <div key={obra} className="flex justify-between text-sm">
                        <span className="text-slate-700 truncate mr-2">{titleCase(obra)}</span>
                        <span className="text-slate-500 shrink-0">{d.horas.toFixed(1)} hrs · {d.reportes} rep.</span>
                      </div>
                    ))}
                  </div>
                ) : <div className="text-sm text-slate-400 py-3 text-center">Sin registros</div>}
              </div>
            </div>

            {/* Mantenciones */}
            {mantenciones.length > 0 && (
              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <div className="text-xs font-bold text-slate-600 uppercase tracking-wide mb-3">Mantenciones — Horas hasta la próxima</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {mantenciones.map(m => {
                    const vencida = m.restante != null && m.restante <= 0;
                    const umbral = Math.max(50, m.intervalo * 0.1);
                    const proxima = m.restante != null && m.restante > 0 && m.restante <= umbral;
                    const color = m.restante == null ? 'text-slate-400' : vencida ? 'text-red-600' : proxima ? 'text-amber-600' : 'text-emerald-600';
                    const bg = m.restante == null ? 'border-slate-200' : vencida ? 'bg-red-50 border-red-200' : proxima ? 'bg-amber-50 border-amber-200' : 'border-slate-200';
                    return (
                      <div key={m.id} className={`rounded-lg p-3 border ${bg}`}>
                        <div className="flex justify-between items-start gap-2">
                          <div className="min-w-0">
                            <div className="text-sm font-black text-slate-800 truncate">{m.nombre}</div>
                            <div className="text-[11px] text-slate-500">cada {m.intervalo.toLocaleString('es-CL')} hrs</div>
                          </div>
                          <div className={`text-right shrink-0 ${color}`}>
                            {m.restante == null ? <div className="text-xs font-bold">Sin objetivo</div>
                              : vencida ? (<><div className="text-base font-black leading-none">VENCIDA</div><div className="text-[11px] font-semibold">hace {Math.abs(m.restante).toFixed(0)} hrs</div></>)
                              : (<><div className="text-lg font-black leading-none">{m.restante.toFixed(0)}</div><div className="text-[11px] font-semibold">hrs restantes</div></>)}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Registros asociados */}
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 text-xs font-bold text-slate-600 uppercase tracking-wide">
                Registros asociados ({reportesFiltrados.length})
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-left text-[11px] font-black text-slate-400 uppercase tracking-widest">
                      <th className="px-3 py-2">N° Reporte</th>
                      <th className="px-3 py-2">Folio</th>
                      <th className="px-3 py-2">Fecha</th>
                      <th className="px-3 py-2">Operador</th>
                      <th className="px-3 py-2">Obra</th>
                      <th className="px-3 py-2 text-right">H. Ini</th>
                      <th className="px-3 py-2 text-right">H. Fin</th>
                      <th className="px-3 py-2 text-right">Hrs</th>
                      <th className="px-3 py-2 text-right">Km</th>
                      <th className="px-3 py-2 text-right">Comb.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {reportesFiltrados.length === 0 ? (
                      <tr><td colSpan="10" className="px-3 py-8 text-center text-slate-400">Sin registros para los filtros seleccionados</td></tr>
                    ) : reportesFiltrados.map(r => {
                      const horas = Math.max(0, num(r.horometroFinal) - num(r.horometroInicial));
                      const km = Math.max(0, num(r.kilometrajeFinal) - num(r.kilometrajeInicial));
                      return (
                        <tr key={r.id} className="hover:bg-purple-50/40">
                          <td className="px-3 py-2 font-bold text-indigo-600">{r.numeroReporte || '—'}</td>
                          <td className="px-3 py-2 text-slate-600">{r.folio || r.folioExterno || '—'}</td>
                          <td className="px-3 py-2 text-slate-600">{r.fecha}</td>
                          <td className="px-3 py-2 text-slate-700">{titleCase(r.operador)}</td>
                          <td className="px-3 py-2 text-slate-700">{titleCase(projName(r.projectId, r.projectName))}</td>
                          <td className="px-3 py-2 text-right text-slate-500">{r.horometroInicial || '0'}</td>
                          <td className="px-3 py-2 text-right text-slate-500">{r.horometroFinal || '0'}</td>
                          <td className="px-3 py-2 text-right font-bold text-emerald-600">{horas.toFixed(1)}</td>
                          <td className="px-3 py-2 text-right text-slate-500">{km.toFixed(0)}</td>
                          <td className="px-3 py-2 text-right text-slate-500">{r.cargaCombustible || '0'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Info({ label, value, accent }) {
  return (
    <div className={`rounded-xl p-3 border ${accent ? 'bg-purple-50 border-purple-200' : 'bg-white border-slate-200'}`}>
      <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{label}</div>
      <div className={`text-sm font-bold ${accent ? 'text-purple-700' : 'text-slate-800'} truncate`}>{value}</div>
    </div>
  );
}

function Kpi({ label, value, sub, color = 'text-slate-900' }) {
  return (
    <div className="bg-white rounded-xl p-4 border border-slate-200">
      <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">{label}</div>
      <div className={`text-2xl font-black ${color}`}>{value}</div>
      <div className="text-xs text-slate-400 mt-0.5">{sub}</div>
    </div>
  );
}

function Campo({ label, children }) {
  return (
    <div>
      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">{label}</label>
      {children}
    </div>
  );
}
