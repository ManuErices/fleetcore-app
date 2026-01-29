import React, { useEffect, useMemo, useState } from "react";
import { listActiveProjects, listMachines, listFuelLogsByRange } from "../lib/db";
import FuelImporter from "../components/FuelImporter";
import FuelPriceWidget from "../components/FuelPriceWidget";

// Utilidades de fecha (sin cambios)
function isoToday() {
  const d = new Date();
  return d.toISOString().split('T')[0];
}

function addDays(dateStr, days) {
  const date = new Date(dateStr + 'T00:00:00');
  date.setDate(date.getDate() + days);
  return date.toISOString().split('T')[0];
}

function getDateRange(start, end) {
  const dates = [];
  let current = start;
  
  while (current <= end) {
    const date = new Date(current + 'T00:00:00');
    dates.push({
      iso: current,
      day: date.getDate(),
      weekday: date.toLocaleDateString('es-CL', { weekday: 'short' })
    });
    current = addDays(current, 1);
  }
  
  return dates;
}

function getDaysDiff(start, end) {
  const startDate = new Date(start + 'T00:00:00');
  const endDate = new Date(end + 'T00:00:00');
  return Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;
}

export default function Fuel() {
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState("");
  const [dateFrom, setDateFrom] = useState(addDays(isoToday(), -6));
  const [dateTo, setDateTo] = useState(isoToday());
  
  const [machines, setMachines] = useState([]);
  const [fuelLogs, setFuelLogs] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showImporter, setShowImporter] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const p = await listActiveProjects();
        setProjects(p);
        if (p.length > 0 && !selectedProject) {
          setSelectedProject(p[0].id);
        }
      } catch (err) {
        console.error("Error cargando proyectos:", err);
        setError("Error al cargar proyectos");
      }
    })();
  }, []);

  useEffect(() => {
    if (!selectedProject || !dateFrom || !dateTo) return;
    
    const daysDiff = getDaysDiff(dateFrom, dateTo);
    if (daysDiff > 31) {
      setError("El rango no puede ser mayor a 31 días");
      return;
    }
    
    if (dateFrom > dateTo) {
      setError("La fecha inicial debe ser anterior a la fecha final");
      return;
    }
    
    setError(null);
    let active = true;

    (async () => {
      setIsLoading(true);
      try {
        const m = await listMachines(selectedProject);
        if (active) setMachines(m.filter(x => x.active !== false));

        const logs = await listFuelLogsByRange(selectedProject, dateFrom, dateTo);
        if (active) setFuelLogs(logs);
      } catch (err) {
        console.error("Error cargando datos:", err);
        if (active) setError("Error al cargar datos");
      }
      finally {
        if (active) setIsLoading(false);
      }
    })();

    return () => { active = false; };
  }, [selectedProject, dateFrom, dateTo]);

  const dates = useMemo(() => getDateRange(dateFrom, dateTo), [dateFrom, dateTo]);

  const logsByMachineDate = useMemo(() => {
    const map = {};
    fuelLogs.forEach(log => {
      if (!map[log.machineId]) map[log.machineId] = {};
      if (map[log.machineId][log.date]) {
        map[log.machineId][log.date].liters += log.liters || 0;
        map[log.machineId][log.date].count += 1;
      } else {
        map[log.machineId][log.date] = {
          liters: log.liters || 0,
          count: 1,
          origin: log.origin
        };
      }
    });
    return map;
  }, [fuelLogs]);

  const machineStats = useMemo(() => {
    const stats = {};
    machines.forEach(machine => {
      const machineLogs = fuelLogs.filter(l => l.machineId === machine.id);
      const totalLiters = machineLogs.reduce((sum, l) => sum + (Number(l.liters) || 0), 0);
      const refuelCount = machineLogs.length;
      
      stats[machine.id] = {
        totalLiters,
        refuelCount,
        avgPerRefuel: refuelCount > 0 ? totalLiters / refuelCount : 0
      };
    });
    return stats;
  }, [machines, fuelLogs]);

  const setPreset = (days) => {
    const today = isoToday();
    setDateTo(today);
    setDateFrom(addDays(today, -(days - 1)));
  };

  const setThisWeek = () => {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const monday = addDays(isoToday(), -(dayOfWeek === 0 ? 6 : dayOfWeek - 1));
    const sunday = addDays(monday, 6);
    setDateFrom(monday);
    setDateTo(sunday);
  };

  const setThisMonth = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth() + 1;
    const firstDay = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = `${year}-${String(month).padStart(2, '0')}-${new Date(year, month, 0).getDate()}`;
    setDateFrom(firstDay);
    setDateTo(lastDay);
  };

  const handleImportComplete = async () => {
    if (selectedProject && dateFrom && dateTo) {
      setIsLoading(true);
      try {
        const logs = await listFuelLogsByRange(selectedProject, dateFrom, dateTo);
        setFuelLogs(logs);
      } catch (err) {
        console.error("Error recargando datos:", err);
      } finally {
        setIsLoading(false);
      }
    }
    setShowImporter(false);
  };

  return (
    <div className="space-y-4 sm:space-y-6 p-4 sm:p-6">
      {/* Header - Responsive */}
      <div className="glass-card rounded-xl sm:rounded-2xl p-4 sm:p-6 animate-fadeInUp">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4 sm:mb-6">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl bg-gradient-to-br from-orange-600 to-red-600 flex items-center justify-center shadow-lg flex-shrink-0">
                <svg className="w-5 h-5 sm:w-6 sm:h-6 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M12.395 2.553a1 1 0 00-1.45-.385c-.345.23-.614.558-.822.88-.214.33-.403.713-.57 1.116-.334.804-.614 1.768-.84 2.734a31.365 31.365 0 00-.613 3.58 2.64 2.64 0 01-.945-1.067c-.328-.68-.398-1.534-.398-2.654A1 1 0 005.05 6.05 6.981 6.981 0 003 11a7 7 0 1011.95-4.95c-.592-.591-.98-.985-1.348-1.467-.363-.476-.724-1.063-1.207-2.03zM12.12 15.12A3 3 0 017 13s.879.5 2.5.5c0-1 .5-4 1.25-4.5.5 1 .786 1.293 1.371 1.879A2.99 2.99 0 0113 13a2.99 2.99 0 01-.879 2.121z" clipRule="evenodd" />
                </svg>
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl lg:text-3xl font-black text-slate-900 tracking-tight">
                  Combustible
                </h1>
                <p className="text-slate-600 mt-0.5 sm:mt-1 text-xs sm:text-sm">
                  Control de recargas diarias
                </p>
              </div>
            </div>
          </div>
          
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
            <button
              onClick={() => setShowImporter(!showImporter)}
              className="px-4 sm:px-6 py-2.5 sm:py-3 rounded-lg sm:rounded-xl font-semibold text-sm sm:text-base text-white bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-500 hover:to-red-500 shadow-lg hover:shadow-xl transition-all flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <span className="whitespace-nowrap">{showImporter ? 'Ocultar' : 'Importar Excel'}</span>
            </button>
            
            <select
              value={selectedProject}
              onChange={(e) => setSelectedProject(e.target.value)}
              className="input-modern text-sm sm:text-base"
            >
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        </div>

        {/* Importador */}
        {showImporter && (
          <div className="mb-4 sm:mb-6 pb-4 sm:pb-6 border-b border-slate-200 animate-fadeIn">
            <FuelImporter 
              projectId={selectedProject} 
              onImportComplete={handleImportComplete}
              setShowImporter={setShowImporter}
            />
          </div>
        )}

        {/* Selector de rango - Responsive */}
        <div className="pt-4 sm:pt-6 border-t border-slate-200">
          <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-end">
            {/* Inputs de fecha */}
            <div className="w-full flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div>
                <label className="block text-xs sm:text-sm font-semibold text-slate-700 mb-2">
                  Fecha Inicial
                </label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="input-modern text-sm sm:text-base"
                />
              </div>
              <div>
                <label className="block text-xs sm:text-sm font-semibold text-slate-700 mb-2">
                  Fecha Final
                </label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="input-modern text-sm sm:text-base"
                />
              </div>
            </div>

            {/* Atajos rápidos - Responsive */}
            <div className="w-full lg:w-auto flex flex-wrap gap-2">
              <button
                onClick={() => setPreset(7)}
                className="flex-1 sm:flex-none px-3 sm:px-4 py-2 rounded-lg sm:rounded-xl bg-orange-50 hover:bg-orange-100 border border-orange-200 text-orange-700 text-xs sm:text-sm font-semibold transition-all whitespace-nowrap"
              >
                7 días
              </button>
              <button
                onClick={setThisWeek}
                className="flex-1 sm:flex-none px-3 sm:px-4 py-2 rounded-lg sm:rounded-xl bg-orange-50 hover:bg-orange-100 border border-orange-200 text-orange-700 text-xs sm:text-sm font-semibold transition-all whitespace-nowrap"
              >
                Esta semana
              </button>
              <button
                onClick={setThisMonth}
                className="flex-1 sm:flex-none px-3 sm:px-4 py-2 rounded-lg sm:rounded-xl bg-orange-50 hover:bg-orange-100 border border-orange-200 text-orange-700 text-xs sm:text-sm font-semibold transition-all whitespace-nowrap"
              >
                Este mes
              </button>
            </div>
          </div>

          {/* Info del rango */}
          <div className="mt-3 sm:mt-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
            {error ? (
              <div className="flex items-center gap-2 text-red-600 text-xs sm:text-sm font-semibold">
                <svg className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>{error}</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-orange-700 text-xs sm:text-sm">
                <svg className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M12.395 2.553a1 1 0 00-1.45-.385c-.345.23-.614.558-.822.88-.214.33-.403.713-.57 1.116-.334.804-.614 1.768-.84 2.734a31.365 31.365 0 00-.613 3.58 2.64 2.64 0 01-.945-1.067c-.328-.68-.398-1.534-.398-2.654A1 1 0 005.05 6.05 6.981 6.981 0 003 11a7 7 0 1011.95-4.95c-.592-.591-.98-.985-1.348-1.467-.363-.476-.724-1.063-1.207-2.03zM12.12 15.12A3 3 0 017 13s.879.5 2.5.5c0-1 .5-4 1.25-4.5.5 1 .786 1.293 1.371 1.879A2.99 2.99 0 0113 13a2.99 2.99 0 01-.879 2.121z" clipRule="evenodd" />
                </svg>
                <span className="font-bold">
                  {dates.length} {dates.length === 1 ? 'día' : 'días'} • {fuelLogs.length} recargas
                </span>
              </div>
            )}
            
            {isLoading && (
              <div className="flex items-center gap-2 sm:gap-3 text-xs sm:text-sm text-orange-600">
                <div className="spinner w-3 h-3 sm:w-4 sm:h-4 border-orange-600" />
                <span>Cargando...</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Widget de Precios */}
      <div className="hidden sm:block">
        <FuelPriceWidget />
      </div>
      
      {/* Widget compacto para mobile */}
      <div className="block sm:hidden">
        <FuelPriceWidget compact />
      </div>

      {/* Tabla del calendario - Responsive con scroll horizontal */}
      {!error && selectedProject && (
        <div className="glass-card rounded-xl sm:rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-max">
              {/* Header */}
              <thead className="bg-gradient-to-r from-orange-50 to-red-50 sticky top-0 z-20">
                <tr>
                  {/* Columna Equipo - Sticky left */}
                  <th className="sticky left-0 z-30 bg-gradient-to-r from-orange-50 to-red-50 text-left px-3 sm:px-6 py-3 sm:py-4 text-[10px] sm:text-xs font-bold text-orange-900 uppercase tracking-wider border-r-2 border-orange-300 shadow-[2px_0_5px_-2px_rgba(234,88,12,0.15)]">
                    Equipo
                  </th>
                  
                  {/* Columnas de días */}
                  {dates.map(date => {
                    const isToday = date.iso === isoToday();
                    return (
                      <th
                        key={date.iso}
                        className={`text-center px-2 sm:px-3 py-2 sm:py-3 border-r border-orange-200 min-w-[60px] sm:min-w-[80px] ${
                          isToday ? 'bg-orange-100' : ''
                        }`}
                      >
                        <div className={`text-[10px] sm:text-xs font-bold uppercase ${
                          isToday ? 'text-orange-900' : 'text-orange-700'
                        }`}>
                          {date.weekday}
                        </div>
                        <div className={`text-base sm:text-lg font-black mt-0.5 sm:mt-1 ${
                          isToday ? 'text-orange-900' : 'text-slate-900'
                        }`}>
                          {date.day}
                        </div>
                      </th>
                    );
                  })}
                  
                  {/* Columnas de resumen - Sticky right - Hidden en mobile */}
                  <th className="hidden lg:table-cell sticky right-0 z-30 bg-gradient-to-r from-orange-50 to-red-50 text-center px-4 py-4 text-xs font-bold text-orange-900 uppercase tracking-wider border-l-2 border-orange-300 shadow-[-2px_0_5px_-2px_rgba(234,88,12,0.15)]">
                    <div className="flex items-center justify-center gap-4 min-w-[400px]">
                      <div className="flex-1 text-center">Total Litros</div>
                      <div className="flex-1 text-center">Recargas</div>
                      <div className="flex-1 text-center">Promedio</div>
                    </div>
                  </th>
                </tr>
              </thead>

              {/* Body */}
              <tbody className="divide-y divide-slate-100 bg-white">
                {isLoading ? (
                  // Skeleton
                  Array.from({ length: 3 }).map((_, idx) => (
                    <tr key={idx} className="animate-pulse">
                      <td className="sticky left-0 z-20 bg-white px-3 sm:px-6 py-3 sm:py-4 border-r-2 border-orange-300">
                        <div className="flex items-center gap-2 sm:gap-3">
                          <div className="w-8 h-8 sm:w-10 sm:h-10 bg-slate-200 rounded-lg sm:rounded-xl" />
                          <div className="flex-1">
                            <div className="h-3 sm:h-4 bg-slate-200 rounded w-16 sm:w-24 mb-1 sm:mb-2" />
                            <div className="h-2 sm:h-3 bg-slate-200 rounded w-20 sm:w-32" />
                          </div>
                        </div>
                      </td>
                      {dates.map((_, dayIdx) => (
                        <td key={dayIdx} className="px-2 sm:px-3 py-3 sm:py-4 text-center border-r border-slate-200">
                          <div className="h-3 sm:h-4 bg-slate-200 rounded w-8 sm:w-12 mx-auto" />
                        </td>
                      ))}
                      <td className="hidden lg:table-cell sticky right-0 z-20 bg-white px-4 py-4 border-l-2 border-orange-300">
                        <div className="flex items-center justify-center gap-4 min-w-[400px]">
                          <div className="flex-1"><div className="h-4 bg-slate-200 rounded w-12 mx-auto" /></div>
                          <div className="flex-1"><div className="h-4 bg-slate-200 rounded w-12 mx-auto" /></div>
                          <div className="flex-1"><div className="h-4 bg-slate-200 rounded w-12 mx-auto" /></div>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : machines.length === 0 ? (
                  <tr>
                    <td colSpan={dates.length + 2} className="px-4 sm:px-6 py-8 sm:py-12 text-center text-slate-500 text-sm sm:text-base">
                      No hay equipos registrados en este proyecto
                    </td>
                  </tr>
                ) : (
                  machines.map(machine => {
                    const stats = machineStats[machine.id] || { totalLiters: 0, refuelCount: 0, avgPerRefuel: 0 };
                    
                    return (
                      <tr key={machine.id} className="hover:bg-slate-50/50 transition-colors">
                        {/* Columna Equipo - Sticky left */}
                        <td className="sticky left-0 z-20 bg-white px-3 sm:px-6 py-3 sm:py-4 border-r-2 border-orange-300 shadow-[2px_0_5px_-2px_rgba(234,88,12,0.05)] hover:bg-slate-50/50">
                          <div className="flex items-center gap-2 sm:gap-3">
                            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-gradient-to-br from-orange-100 to-red-100 flex items-center justify-center flex-shrink-0">
                              <span className="text-xs sm:text-sm font-black text-orange-700">
                                {machine.code?.substring(0, 3)}
                              </span>
                            </div>
                            <div className="min-w-0">
                              <div className="text-xs sm:text-sm font-bold text-slate-900 truncate">
                                {machine.code}
                              </div>
                              <div className="text-[10px] sm:text-xs text-slate-600 truncate">
                                {machine.name}
                              </div>
                            </div>
                          </div>
                        </td>
                        
                        {/* Celdas de días */}
                        {dates.map(date => {
                          const data = logsByMachineDate[machine.id]?.[date.iso];
                          const isToday = date.iso === isoToday();
                          
                          return (
                            <td
                              key={date.iso}
                              className={`px-2 sm:px-3 py-2 sm:py-3 text-center border-r border-slate-200 ${
                                isToday ? 'bg-orange-50/30' : ''
                              }`}
                            >
                              {data ? (
                                <div className={`inline-flex items-center justify-center px-2 py-1 rounded-lg text-xs sm:text-sm font-bold ${
                                  data.origin === 'excel' 
                                    ? 'bg-emerald-100 text-emerald-700' 
                                    : 'bg-orange-100 text-orange-700'
                                }`}>
                                  {Math.round(data.liters)}L
                                  {data.count > 1 && (
                                    <span className="ml-1 text-[10px] opacity-75">×{data.count}</span>
                                  )}
                                </div>
                              ) : (
                                <span className="text-slate-300 text-xs sm:text-sm">—</span>
                              )}
                            </td>
                          );
                        })}
                        
                        {/* Columnas resumen - Hidden en mobile */}
                        <td className="hidden lg:table-cell sticky right-0 z-20 bg-white px-4 py-4 border-l-2 border-orange-300 shadow-[-2px_0_5px_-2px_rgba(234,88,12,0.05)] hover:bg-slate-50/50">
                          <div className="flex items-center justify-center gap-4 min-w-[400px]">
                            <div className="flex-1 text-center">
                              <div className="text-lg font-black text-slate-900">
                                {Math.round(stats.totalLiters).toLocaleString('es-CL')}
                              </div>
                              <div className="text-xs text-slate-500">litros</div>
                            </div>
                            <div className="flex-1 text-center">
                              <div className="text-lg font-black text-orange-700">
                                {stats.refuelCount}
                              </div>
                              <div className="text-xs text-slate-500">recargas</div>
                            </div>
                            <div className="flex-1 text-center">
                              <div className="text-lg font-black text-blue-700">
                                {Math.round(stats.avgPerRefuel)}
                              </div>
                              <div className="text-xs text-slate-500">L/recarga</div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Resumen mobile - Solo visible en pantallas pequeñas */}
          {!isLoading && machines.length > 0 && (
            <div className="lg:hidden border-t-2 border-orange-300 bg-gradient-to-r from-orange-50 to-red-50 p-4">
              <h3 className="text-sm font-bold text-orange-900 mb-3">Resumen por Equipo</h3>
              <div className="space-y-3">
                {machines.map(machine => {
                  const stats = machineStats[machine.id] || { totalLiters: 0, refuelCount: 0, avgPerRefuel: 0 };
                  return (
                    <div key={machine.id} className="bg-white rounded-lg p-3 border border-orange-200">
                      <div className="font-bold text-sm text-slate-900 mb-2">{machine.code}</div>
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div>
                          <div className="text-base font-black text-slate-900">{Math.round(stats.totalLiters)}</div>
                          <div className="text-[10px] text-slate-500">litros</div>
                        </div>
                        <div>
                          <div className="text-base font-black text-orange-700">{stats.refuelCount}</div>
                          <div className="text-[10px] text-slate-500">recargas</div>
                        </div>
                        <div>
                          <div className="text-base font-black text-blue-700">{Math.round(stats.avgPerRefuel)}</div>
                          <div className="text-[10px] text-slate-500">L/rec</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
