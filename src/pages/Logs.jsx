import React, { useEffect, useMemo, useState } from "react";
import { listActiveProjects, listMachines, listLogsByRange, upsertDailyLog } from "../lib/db";
import { useOperatorAssignments } from "../lib/useOperatorAssignments";

function isoToday() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatDateDisplay(isoDate) {
  // Para evitar problemas de zona horaria, parseamos manualmente
  const [year, month, day] = isoDate.split('-').map(Number);
  const date = new Date(year, month - 1, day); // month es 0-indexed
  return date.toLocaleDateString('es-CL', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });
}

export default function Logs() {
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState("");
  const [machines, setMachines] = useState([]);
  const [date, setDate] = useState(isoToday());
  const [rows, setRows] = useState([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Obtener operadores asignados
  const selectedDate = new Date(date + 'T00:00:00');
  const { operatorsByMachine } = useOperatorAssignments(
    projectId, 
    selectedDate.getFullYear(), 
    selectedDate.getMonth() + 1
  );

  useEffect(() => {
    (async () => {
      const p = await listActiveProjects();
      setProjects(p);
      if (p[0]) setProjectId(p[0].id);
    })();
  }, []);

  useEffect(() => {
    if (!projectId) return;
    (async () => {
      const m = await listMachines(projectId);
      setMachines(m);

      const logs = await listLogsByRange(projectId, date, date);
      const byMachine = {};
      for (const l of logs) byMachine[l.machineId] = l;

      setRows(
        m.filter(x => x.active !== false).map(mm => {
          const existing = byMachine[mm.id];
          return {
            id: existing?.id || "",
            machineId: mm.id,
            productiveHours: existing?.productiveHours ?? 0,
            standbyHours: 0, // Mantenemos en 0 para compatibilidad con DB
            downtimeHours: 0, // Mantenemos en 0 para compatibilidad con DB
            kilometraje: existing?.kilometraje ?? 0,
            notes: existing?.notes ?? "",
          };
        })
      );
    })();
  }, [projectId, date]);

  const machineById = useMemo(() => {
    const map = {};
    for (const m of machines) map[m.id] = m;
    return map;
  }, [machines]);

  const onSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      for (const r of rows) {
        const payload = {
          ...r,
          projectId,
          date,
          productiveHours: Number(r.productiveHours) || 0,
          standbyHours: 0, // Siempre 0
          downtimeHours: 0, // Siempre 0
          kilometraje: Number(r.kilometraje) || 0,
        };
        await upsertDailyLog(payload);
      }
      
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (error) {
      alert("Error al guardar: " + error.message);
    } finally {
      setSaving(false);
    }
  };

  const setRow = (idx, patch) => {
    setRows(prev => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const totalProductive = rows.reduce((sum, r) => sum + (Number(r.productiveHours) || 0), 0);

  return (
    <div className="space-y-6">
      {/* Header - AZUL FLEETCORE */}
      <div className="glass-card rounded-2xl p-6 animate-fadeInUp">
        <div className="flex flex-col lg:flex-row lg:items-end gap-4 lg:justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-900 to-blue-700 flex items-center justify-center shadow-lg">
                <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                </svg>
              </div>
              <div>
                <h1 className="text-3xl font-black text-slate-900 tracking-tight">
                  Registro Diario
                </h1>
                <p className="text-slate-600 mt-1 text-sm">
                  Carga horas productivas por equipo
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <select 
              value={projectId} 
              onChange={(e) => setProjectId(e.target.value)} 
              className="input-modern"
            >
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>

            <input 
              type="date" 
              value={date} 
              onChange={(e) => setDate(e.target.value)} 
              className="input-modern"
            />

            <button 
              onClick={onSave} 
              disabled={saving || !projectId} 
              className={`px-6 py-3 rounded-xl font-semibold text-white shadow-lg hover:shadow-xl transition-all flex items-center gap-2 whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed ${
                saved 
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-600' 
                  : 'bg-gradient-to-r from-blue-900 to-blue-700 hover:from-blue-800 hover:to-blue-600'
              }`}
            >
              <span className="flex items-center gap-2">
                {saved ? (
                  <>
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Guardado
                  </>
                ) : saving ? (
                  <>
                    <div className="spinner w-4 h-4 border-white" />
                    Guardando...
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                    </svg>
                    Guardar día
                  </>
                )}
              </span>
            </button>
          </div>
        </div>

        {/* Quick stats - AZUL FLEETCORE */}
        <div className="mt-6 pt-6 border-t border-slate-200 grid grid-cols-2 sm:grid-cols-3 gap-4">
          <StatBadge label="Equipos activos" value={rows.length} color="blue" />
          <StatBadge label="Horas productivas" value={totalProductive.toFixed(1)} color="emerald" />
          <StatBadge label="Equipos con registro" value={rows.filter(r => r.productiveHours > 0).length} color="orange" />
        </div>
      </div>

      {/* Tabla moderna - AZUL FLEETCORE */}
      <div className="glass-card rounded-2xl overflow-hidden animate-fadeInUp stagger-2">
        <div className="p-6 border-b border-slate-200 bg-gradient-to-r from-blue-50 to-sky-50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-900 to-blue-700 flex items-center justify-center shadow-lg">
                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <h2 className="text-xl font-bold text-blue-900">Horas por Equipo</h2>
                <p className="text-sm text-blue-700">
                  {formatDateDisplay(date)}
                </p>
              </div>
            </div>
            <div className="px-4 py-2 rounded-xl bg-blue-100 border border-blue-200">
              <span className="text-sm font-bold text-blue-700">{rows.length} equipos</span>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left px-6 py-4 text-xs font-bold text-slate-600 uppercase tracking-wider">Equipo</th>
                <th className="text-center px-4 py-4 text-xs font-bold text-slate-600 uppercase tracking-wider">Horas Productivas</th>
                <th className="text-center px-4 py-4 text-xs font-bold text-slate-600 uppercase tracking-wider">Kilometraje</th>
                <th className="text-left px-6 py-4 text-xs font-bold text-slate-600 uppercase tracking-wider">Observaciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r, idx) => {
                const m = machineById[r.machineId];
                
                return (
                  <tr key={`${r.machineId}-${idx}`} className="hover:bg-slate-50 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-600 to-slate-800 flex items-center justify-center shadow-md flex-shrink-0">
                          <span className="text-white text-xs font-bold">
                            {m?.code?.substring(0, 2).toUpperCase() || m?.name?.substring(0, 2).toUpperCase() || 'EQ'}
                          </span>
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-slate-900">{m?.name}</div>
                          {m?.code && (
                            <div className="text-xs text-slate-600 mt-0.5">
                              Código: {m?.code}
                            </div>
                          )}
                          {m?.patente && (
                            <div className="text-xs text-slate-500">
                              Patente: {m?.patente}
                            </div>
                          )}
                          {operatorsByMachine[r.machineId] && (
                            <div className="flex items-center gap-1 mt-1">
                              <svg className="w-3 h-3 text-emerald-600" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                              </svg>
                              <span className="text-xs text-emerald-600 font-medium">
                                {operatorsByMachine[r.machineId].nombre.split(' ').slice(0, 2).join(' ')}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    
                    <td className="px-4 py-4">
                      <input 
                        type="number" 
                        step="0.5"
                        value={r.productiveHours} 
                        onChange={(e) => setRow(idx, { productiveHours: e.target.value })} 
                        className="w-28 text-center px-3 py-2 rounded-xl border-2 border-slate-200 bg-white text-slate-900 font-semibold focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/20 focus:outline-none transition-all hover:border-slate-300"
                        placeholder="0"
                      />
                    </td>
                    
                    <td className="px-4 py-4">
                      <input 
                        type="number" 
                        step="1"
                        value={r.kilometraje} 
                        onChange={(e) => setRow(idx, { kilometraje: e.target.value })} 
                        className="w-28 text-center px-3 py-2 rounded-xl border-2 border-slate-200 bg-white text-slate-900 font-semibold focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20 focus:outline-none transition-all hover:border-slate-300"
                        placeholder="0"
                      />
                    </td>
                    
                    <td className="px-6 py-4">
                      <input 
                        value={r.notes} 
                        onChange={(e) => setRow(idx, { notes: e.target.value })} 
                        className="w-full px-3 py-2 rounded-xl border-2 border-slate-200 bg-white text-slate-900 text-sm focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20 focus:outline-none transition-all hover:border-slate-300"
                        placeholder="Observaciones, actividades realizadas..."
                      />
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td className="px-6 py-16 text-center text-slate-500" colSpan={4}>
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-16 h-16 rounded-2xl bg-blue-100 flex items-center justify-center">
                        <svg className="w-8 h-8 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                        </svg>
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-slate-900 mb-1">No hay equipos activos</div>
                        <div className="text-sm text-slate-500">Agrega equipos en la sección de Equipos y Servicios</div>
                      </div>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Footer con total - VERDE */}
        {rows.length > 0 && (
          <div className="p-6 bg-gradient-to-r from-emerald-50 to-teal-50 border-t-2 border-emerald-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-600 to-teal-600 flex items-center justify-center shadow-lg">
                  <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
                <div className="text-sm font-bold text-emerald-900 uppercase tracking-wider">Total del día</div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-xs font-semibold text-emerald-700 uppercase tracking-wider">Horas Productivas</div>
                <div className="text-3xl font-black text-emerald-700">{totalProductive.toFixed(1)}h</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// STATBADGE CON BRANDING FLEETCORE
function StatBadge({ label, value, color }) {
  const colors = {
    blue: 'from-blue-900 to-blue-700',
    orange: 'from-orange-600 to-red-600',
    emerald: 'from-emerald-600 to-teal-600',
  };

  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-slate-50">
      <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${colors[color]} flex items-center justify-center shadow-md flex-shrink-0`}>
        <span className="text-white text-lg font-black">{value}</span>
      </div>
      <span className="text-sm font-semibold text-slate-600">{label}</span>
    </div>
  );
}
