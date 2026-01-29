import React, { useEffect, useMemo, useState } from "react";
import { listActiveProjects, listMachines, listLogsByRange } from "../lib/db";
import { useOperatorAssignments } from "../lib/useOperatorAssignments";

// Utilidades de fecha
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

export default function MonthlyCalendar() {
  // Estados básicos
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState("");
  const [dateFrom, setDateFrom] = useState(addDays(isoToday(), -6)); // Última semana
  const [dateTo, setDateTo] = useState(isoToday());
  
  // Estados de datos
  const [machines, setMachines] = useState([]);
  const [logs, setLogs] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // Obtener operadores asignados (usaremos el mes del dateFrom)
  const fromDate = new Date(dateFrom + 'T00:00:00');
  const { operatorsByMachine } = useOperatorAssignments(
    selectedProject,
    fromDate.getFullYear(),
    fromDate.getMonth() + 1
  );

  // Cargar proyectos al inicio
  useEffect(() => {
    let active = true;
    
    listActiveProjects()
      .then(p => {
        if (active) {
          setProjects(p);
          if (p.length > 0) setSelectedProject(p[0].id);
        }
      })
      .catch(err => {
        if (active) setError("Error al cargar proyectos");
        console.error(err);
      });
    
    return () => { active = false; };
  }, []);

  // Cargar datos cuando cambie proyecto o fechas
  useEffect(() => {
    if (!selectedProject) return;

    // Validaciones
    const daysDiff = getDaysDiff(dateFrom, dateTo);
    if (daysDiff > 31) {
      setError("El rango máximo es de 31 días");
      return;
    }
    if (dateFrom > dateTo) {
      setError("La fecha inicial debe ser menor a la final");
      return;
    }

    let active = true;
    setError(null);
    setIsLoading(true);

    // Cargar todo en paralelo
    Promise.all([
      listMachines(selectedProject),
      listLogsByRange(selectedProject, dateFrom, dateTo)
    ])
      .then(([machinesData, logsData]) => {
        if (active) {
          setMachines(machinesData.filter(m => m.active !== false));
          setLogs(logsData);
        }
      })
      .catch(err => {
        if (active) setError("Error al cargar datos");
        console.error(err);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => { active = false; };
  }, [selectedProject, dateFrom, dateTo]);

  // Calcular datos derivados
  const dates = useMemo(() => getDateRange(dateFrom, dateTo), [dateFrom, dateTo]);
  const daysInRange = useMemo(() => getDaysDiff(dateFrom, dateTo), [dateFrom, dateTo]);

  const logsByMachineDate = useMemo(() => {
    const map = {};
    logs.forEach(log => {
      if (!map[log.machineId]) map[log.machineId] = {};
      map[log.machineId][log.date] = log;
    });
    return map;
  }, [logs]);

  const machineStats = useMemo(() => {
    const stats = {};
    machines.forEach(machine => {
      const machineLogs = logs.filter(l => l.machineId === machine.id);
      
      // Calcular horas por tipo
      const totalProductiveHours = machineLogs.reduce((sum, l) => 
        sum + (Number(l.productiveHours) || 0), 0
      );
      const totalStandbyHours = machineLogs.reduce((sum, l) => 
        sum + (Number(l.standbyHours) || 0), 0
      );
      const totalDowntimeHours = machineLogs.reduce((sum, l) => 
        sum + (Number(l.downtimeHours) || 0), 0
      );
      
      // Días con actividad de cada tipo
      const daysProductive = machineLogs.filter(l => (Number(l.productiveHours) || 0) > 0).length;
      const daysStandby = machineLogs.filter(l => (Number(l.standbyHours) || 0) > 0).length;
      const daysDowntime = machineLogs.filter(l => (Number(l.downtimeHours) || 0) > 0).length;
      
      // Total de horas registradas
      const totalHours = totalProductiveHours + totalStandbyHours + totalDowntimeHours;
      
      // Horas disponibles (productivas + standby)
      const availableHours = totalProductiveHours + totalStandbyHours;
      
      // Calcular métricas (%) 
      const availability = totalHours > 0 ? (availableHours / totalHours) * 100 : 0;
      const utilization = availableHours > 0 ? (totalProductiveHours / availableHours) * 100 : 0;
      const standbyRate = totalHours > 0 ? (totalStandbyHours / totalHours) * 100 : 0;
      const downtimeRate = totalHours > 0 ? (totalDowntimeHours / totalHours) * 100 : 0;
      
      // Calcular horas mínimas proporcionales: 180 hrs × (días en rango / 30)
      const minHoursProportional = 180 * (daysInRange / 30);
      
      stats[machine.id] = {
        // Horas por tipo
        productiveHours: totalProductiveHours,
        standbyHours: totalStandbyHours,
        downtimeHours: totalDowntimeHours,
        totalHours: totalHours,
        availableHours: availableHours,
        
        // Días por tipo
        daysProductive: daysProductive,
        daysStandby: daysStandby,
        daysDowntime: daysDowntime,
        totalDays: machineLogs.length,
        
        // Métricas (%)
        availability: availability,
        utilization: utilization,
        standbyRate: standbyRate,
        downtimeRate: downtimeRate,
        
        // Legacy (para compatibilidad)
        total: totalProductiveHours,
        min: minHoursProportional,
        diff: totalProductiveHours - minHoursProportional,
        days: daysProductive
      };
    });
    return stats;
  }, [machines, logs, daysInRange]);

  // Handlers para cambios rápidos de fecha
  const setPreset = (days) => {
    setDateTo(isoToday());
    setDateFrom(addDays(isoToday(), -(days - 1)));
  };

  const setWeek = () => {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const monday = addDays(isoToday(), -(dayOfWeek === 0 ? 6 : dayOfWeek - 1));
    setDateFrom(monday);
    setDateTo(addDays(monday, 6));
  };

  const setMonth = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const lastDay = new Date(year, today.getMonth() + 1, 0).getDate();
    setDateFrom(`${year}-${month}-01`);
    setDateTo(`${year}-${month}-${String(lastDay).padStart(2, '0')}`);
  };

  return (
    <div className="space-y-6">
      {/* Header con controles - AZUL FLEETCORE */}
      <div className="glass-card rounded-2xl p-6">
        <div className="flex flex-col lg:flex-row gap-4 lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-900 to-blue-700 flex items-center justify-center shadow-lg">
                <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <div>
                <h1 className="text-3xl font-black text-slate-900 tracking-tight">
                  Detalle Flota
                </h1>
                <p className="text-slate-600 mt-1 text-sm">
                  Vista de horas productivas por equipo y día (máx. 31 días)
                </p>
              </div>
            </div>
          </div>

          <select
            value={selectedProject}
            onChange={(e) => setSelectedProject(e.target.value)}
            className="input-modern lg:w-64"
            disabled={isLoading}
          >
            <option value="">Seleccionar proyecto...</option>
            {projects.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        {/* Filtros de fecha */}
        <div className="mt-6 pt-6 border-t border-slate-200">
          <div className="flex flex-col lg:flex-row gap-4">
            {/* Inputs */}
            <div className="flex-1 grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Desde
                </label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="input-modern"
                  disabled={isLoading}
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Hasta
                </label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="input-modern"
                  disabled={isLoading}
                />
              </div>
            </div>

            {/* Botones rápidos - AZUL FLEETCORE */}
            <div className="flex gap-2 lg:items-end">
              <button
                onClick={() => setPreset(7)}
                className="px-4 py-2 text-sm font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-xl transition-all disabled:opacity-50"
                disabled={isLoading}
              >
                7 días
              </button>
              <button
                onClick={setWeek}
                className="px-4 py-2 text-sm font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-xl transition-all disabled:opacity-50"
                disabled={isLoading}
              >
                Semana
              </button>
              <button
                onClick={setMonth}
                className="px-4 py-2 text-sm font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-xl transition-all disabled:opacity-50"
                disabled={isLoading}
              >
                Mes
              </button>
            </div>
          </div>

          {/* Info del rango - AZUL FLEETCORE */}
          <div className="mt-4 flex items-center gap-4 text-sm">
            <div className="flex items-center gap-2 text-slate-600">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span className="font-medium">{daysInRange} días en el rango</span>
            </div>
            <div className="flex items-center gap-2 text-blue-700">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="font-bold">Hrs mín proporcional: {(180 * daysInRange / 30).toFixed(1)} hrs</span>
            </div>
          </div>

          {/* Mensajes de estado */}
          {error && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-xl">
              <div className="flex items-center gap-2 text-red-700 text-sm font-medium">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" />
                </svg>
                {error}
              </div>
            </div>
          )}

          {isLoading && (
            <div className="mt-4 flex items-center gap-3 text-sm text-blue-600">
              <div className="spinner w-4 h-4 border-blue-600" />
              Cargando datos...
            </div>
          )}
        </div>
      </div>

      {/* NUEVO: Panel de Métricas de Disponibilidad */}
      {!isLoading && machines.length > 0 && (
        <div className="glass-card rounded-2xl p-6 animate-fadeInUp">
          <h2 className="text-xl font-bold text-slate-900 mb-6 flex items-center gap-2">
            <svg className="w-6 h-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            Métricas de Disponibilidad y Utilización
          </h2>

          {(() => {
            // Calcular totales de la flota
            const totalStats = {
              productiveHours: 0,
              standbyHours: 0,
              downtimeHours: 0,
              daysProductive: 0,
              daysStandby: 0,
              daysDowntime: 0
            };

            machines.forEach(machine => {
              const stats = machineStats[machine.id] || {};
              totalStats.productiveHours += stats.productiveHours || 0;
              totalStats.standbyHours += stats.standbyHours || 0;
              totalStats.downtimeHours += stats.downtimeHours || 0;
              totalStats.daysProductive += stats.daysProductive || 0;
              totalStats.daysStandby += stats.daysStandby || 0;
              totalStats.daysDowntime += stats.daysDowntime || 0;
            });

            const totalHours = totalStats.productiveHours + totalStats.standbyHours + totalStats.downtimeHours;
            const availableHours = totalStats.productiveHours + totalStats.standbyHours;
            
            const fleetAvailability = totalHours > 0 ? (availableHours / totalHours) * 100 : 0;
            const fleetUtilization = availableHours > 0 ? (totalStats.productiveHours / availableHours) * 100 : 0;
            const fleetStandbyRate = totalHours > 0 ? (totalStats.standbyHours / totalHours) * 100 : 0;
            const fleetDowntimeRate = totalHours > 0 ? (totalStats.downtimeHours / totalHours) * 100 : 0;

            return (
              <>
                {/* Resumen de Flota */}
                <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                  <MetricCard
                    label="Disponibilidad"
                    value={`${fleetAvailability.toFixed(1)}%`}
                    subtitle={`${Math.round(availableHours).toLocaleString()} hrs disponibles`}
                    icon="✅"
                    color="from-emerald-500 to-teal-600"
                    helpText="(Productivas + Standby) / Total"
                  />
                  <MetricCard
                    label="Utilización"
                    value={`${fleetUtilization.toFixed(1)}%`}
                    subtitle={`${Math.round(totalStats.productiveHours).toLocaleString()} hrs productivas`}
                    icon="⚡"
                    color="from-blue-500 to-cyan-600"
                    helpText="Productivas / Disponibles"
                  />
                  <MetricCard
                    label="Tasa Standby"
                    value={`${fleetStandbyRate.toFixed(1)}%`}
                    subtitle={`${Math.round(totalStats.standbyHours).toLocaleString()} hrs en espera`}
                    icon="🟡"
                    color="from-amber-500 to-orange-600"
                    helpText="Disponible sin uso"
                  />
                  <MetricCard
                    label="Tiempo Muerto"
                    value={`${fleetDowntimeRate.toFixed(1)}%`}
                    subtitle={`${Math.round(totalStats.downtimeHours).toLocaleString()} hrs fuera`}
                    icon="🔴"
                    color="from-red-500 to-pink-600"
                    helpText="Mantenimiento / Averías"
                  />
                </div>

                {/* Distribución por Días */}
                <div className="grid md:grid-cols-3 gap-4 mb-6">
                  <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
                    <div className="text-sm font-semibold text-blue-600 mb-2">Días Productivos</div>
                    <div className="text-2xl font-black text-blue-700">{totalStats.daysProductive}</div>
                    <div className="text-xs text-blue-600 mt-1">Equipos trabajaron</div>
                  </div>
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
                    <div className="text-sm font-semibold text-amber-600 mb-2">Días Standby</div>
                    <div className="text-2xl font-black text-amber-700">{totalStats.daysStandby}</div>
                    <div className="text-xs text-amber-600 mt-1">Disponibles sin uso</div>
                  </div>
                  <div className="p-4 bg-red-50 border border-red-200 rounded-xl">
                    <div className="text-sm font-semibold text-red-600 mb-2">Días Downtime</div>
                    <div className="text-2xl font-black text-red-700">{totalStats.daysDowntime}</div>
                    <div className="text-xs text-red-600 mt-1">Fuera de servicio</div>
                  </div>
                </div>

                {/* Explicación */}
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
                  <div className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-slate-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div className="text-sm text-slate-600">
                      <strong>Cómo interpretar estas métricas:</strong>
                      <ul className="mt-2 space-y-1 ml-4 list-disc">
                        <li><strong>Disponibilidad alta:</strong> Los equipos están operativos (no en mantenimiento)</li>
                        <li><strong>Utilización alta:</strong> Los equipos disponibles se están usando efectivamente</li>
                        <li><strong>Standby alto:</strong> Equipos disponibles pero sin trabajo (posible sobredimensionamiento)</li>
                        <li><strong>Downtime alto:</strong> Muchas reparaciones/mantenimientos (revisar preventivos)</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </>
            );
          })()}
        </div>
      )}

      {/* Tabla del calendario con sticky columns */}
      {!error && selectedProject && (
        <div className="glass-card rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <div className="relative">
              {/* Tabla principal */}
              <table className="w-full min-w-max">
                {/* Header - AZUL FLEETCORE */}
                <thead className="bg-gradient-to-r from-blue-50 to-sky-50 sticky top-0 z-20">
                  <tr>
                    {/* Columna Equipo - Sticky izquierda */}
                    <th className="sticky left-0 z-30 bg-gradient-to-r from-blue-50 to-sky-50 text-left px-6 py-4 text-xs font-bold text-blue-900 uppercase tracking-wider border-r-2 border-blue-300 shadow-[2px_0_5px_-2px_rgba(30,58,138,0.15)]">
                      Equipo
                    </th>
                    
                    {/* Columnas de días - scroll normal */}
                    {dates.map(date => {
                      const isToday = date.iso === isoToday();
                      return (
                        <th
                          key={date.iso}
                          className={`text-center px-3 py-3 border-r border-blue-200 min-w-[80px] ${
                            isToday ? 'bg-blue-100' : ''
                          }`}
                        >
                          <div className={`text-xs font-bold uppercase ${
                            isToday ? 'text-blue-900' : 'text-blue-700'
                          }`}>
                            {date.weekday}
                          </div>
                          <div className={`text-lg font-black mt-1 ${
                            isToday ? 'text-blue-900' : 'text-slate-900'
                          }`}>
                            {date.day}
                          </div>
                        </th>
                      );
                    })}
                    
                    {/* Columnas de resumen - Sticky derecha */}
                    <th className="sticky right-0 z-30 bg-gradient-to-r from-blue-50 to-sky-50 text-center px-4 py-4 text-xs font-bold text-blue-900 uppercase tracking-wider border-l-2 border-blue-300 shadow-[-2px_0_5px_-2px_rgba(30,58,138,0.15)]">
                      <div className="flex items-center justify-center gap-3 min-w-[520px]">
                        <div className="flex-1 text-center">
                          <div>Disponib.</div>
                          <div className="text-xs font-normal normal-case text-blue-600">(%)</div>
                        </div>
                        <div className="flex-1 text-center">
                          <div>Utiliz.</div>
                          <div className="text-xs font-normal normal-case text-blue-600">(%)</div>
                        </div>
                        <div className="flex-1 text-center">
                          <div>Hrs Prod.</div>
                          <div className="text-xs font-normal normal-case text-blue-600">(real)</div>
                        </div>
                        <div className="flex-1 text-center">
                          <div>Standby</div>
                          <div className="text-xs font-normal normal-case text-amber-600">(hrs)</div>
                        </div>
                        <div className="flex-1 text-center">
                          <div>Días</div>
                          <div className="text-xs font-normal normal-case text-blue-600">(trab.)</div>
                        </div>
                      </div>
                    </th>
                  </tr>
                </thead>

                {/* Body */}
                <tbody className="divide-y divide-slate-100 bg-white">
                  {isLoading ? (
                    // Skeleton mientras carga
                    Array.from({ length: 3 }).map((_, idx) => (
                      <tr key={idx} className="animate-pulse">
                        <td className="sticky left-0 z-20 bg-white px-6 py-4 border-r-2 border-blue-300 shadow-[2px_0_5px_-2px_rgba(30,58,138,0.1)]">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-slate-200 rounded-xl" />
                            <div className="flex-1">
                              <div className="h-4 bg-slate-200 rounded w-24 mb-2" />
                              <div className="h-3 bg-slate-200 rounded w-32" />
                            </div>
                          </div>
                        </td>
                        {dates.map((_, dayIdx) => (
                          <td key={dayIdx} className="px-3 py-4 text-center border-r border-slate-200">
                            <div className="h-4 bg-slate-200 rounded w-8 mx-auto" />
                          </td>
                        ))}
                        <td className="sticky right-0 z-20 bg-white px-4 py-4 border-l-2 border-blue-300 shadow-[-2px_0_5px_-2px_rgba(30,58,138,0.1)]">
                          <div className="flex items-center justify-center gap-4 min-w-[400px]">
                            <div className="flex-1"><div className="h-4 bg-slate-200 rounded w-12 mx-auto" /></div>
                            <div className="flex-1"><div className="h-4 bg-slate-200 rounded w-12 mx-auto" /></div>
                            <div className="flex-1"><div className="h-4 bg-slate-200 rounded w-12 mx-auto" /></div>
                            <div className="flex-1"><div className="h-4 bg-slate-200 rounded w-16 mx-auto" /></div>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : machines.length === 0 ? (
                    // Estado vacío - AZUL FLEETCORE
                    <tr>
                      <td colSpan={dates.length + 2} className="py-16 text-center">
                        <div className="flex flex-col items-center gap-3">
                          <div className="w-16 h-16 rounded-2xl bg-blue-100 flex items-center justify-center">
                            <svg className="w-8 h-8 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                          </div>
                          <div>
                            <div className="text-sm font-semibold text-slate-900 mb-1">
                              No hay equipos activos
                            </div>
                            <div className="text-sm text-slate-500">
                              Agrega equipos en la sección de Maquinaria
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    // Datos reales
                    machines.map(machine => {
                      const stats = machineStats[machine.id] || { total: 0, min: 0, diff: 0, days: 0 };
                      const machineLogs = logsByMachineDate[machine.id] || {};

                      return (
                        <tr key={machine.id} className="hover:bg-slate-50 transition-colors">
                          {/* Columna equipo - Sticky izquierda */}
                          <td className="sticky left-0 z-20 bg-white hover:bg-slate-50 px-6 py-4 border-r-2 border-blue-300 shadow-[2px_0_5px_-2px_rgba(30,58,138,0.1)]">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-600 to-slate-800 flex items-center justify-center shadow-md flex-shrink-0">
                                <span className="text-white text-xs font-bold">
                                  {machine.code?.substring(0, 2).toUpperCase() || 'EQ'}
                                </span>
                              </div>
                              <div className="min-w-0">
                                <div className="font-semibold text-slate-900 text-sm truncate">
                                  {machine.code}
                                </div>
                                <div className="text-xs text-slate-500 truncate">
                                  {machine.name}
                                </div>
                                {operatorsByMachine[machine.id] && (
                                  <div className="flex items-center gap-1 mt-1">
                                    <svg className="w-3 h-3 text-emerald-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                      <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                                    </svg>
                                    <span className="text-xs text-emerald-600 font-medium truncate">
                                      {operatorsByMachine[machine.id].nombre.split(' ').slice(0, 2).join(' ')}
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* Columnas de días */}
                          {dates.map(date => {
                            const log = machineLogs[date.iso];
                            const hours = log ? (Number(log.productiveHours) || 0) : 0;
                            const hasStandby = log && (Number(log.standbyHours) || 0) > 0;
                            const hasDowntime = log && (Number(log.downtimeHours) || 0) > 0;
                            const isToday = date.iso === isoToday();

                            return (
                              <td
                                key={date.iso}
                                className={`px-3 py-4 text-center border-r border-slate-200 ${
                                  isToday ? 'bg-blue-50' : ''
                                }`}
                              >
                                {hours > 0 ? (
                                  <div className="relative inline-block">
                                    <span className="text-sm font-bold text-emerald-600">
                                      {hours.toFixed(1)}
                                    </span>
                                    {(hasStandby || hasDowntime) && (
                                      <div className="flex gap-1 justify-center mt-1">
                                        {hasStandby && (
                                          <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                                        )}
                                        {hasDowntime && (
                                          <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
                                        )}
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-slate-300 text-sm">—</span>
                                )}
                              </td>
                            );
                          })}

                          {/* Columnas de resumen - Sticky derecha */}
                          <td className="sticky right-0 z-20 bg-white hover:bg-slate-50 px-4 py-4 border-l-2 border-blue-300 shadow-[-2px_0_5px_-2px_rgba(30,58,138,0.1)]">
                            <div className="flex items-center justify-center gap-3 min-w-[520px]">
                              {/* DISPONIBILIDAD */}
                              <div className="flex-1 text-center">
                                <span className={`text-sm font-bold ${
                                  stats.availability >= 90 ? 'text-emerald-600' :
                                  stats.availability >= 75 ? 'text-blue-600' :
                                  'text-amber-600'
                                }`}>
                                  {stats.availability.toFixed(1)}%
                                </span>
                              </div>
                              {/* UTILIZACIÓN */}
                              <div className="flex-1 text-center">
                                <span className={`text-sm font-bold ${
                                  stats.utilization >= 80 ? 'text-emerald-600' :
                                  stats.utilization >= 60 ? 'text-blue-600' :
                                  stats.utilization >= 40 ? 'text-amber-600' :
                                  'text-red-600'
                                }`}>
                                  {stats.utilization.toFixed(1)}%
                                </span>
                              </div>
                              {/* HORAS PRODUCTIVAS */}
                              <div className="flex-1 text-center">
                                <span className="text-sm font-bold text-emerald-600">
                                  {stats.productiveHours.toFixed(1)}h
                                </span>
                              </div>
                              {/* STANDBY */}
                              <div className="flex-1 text-center">
                                <span className={`text-sm font-bold ${
                                  stats.standbyHours > 0 ? 'text-amber-600' : 'text-slate-300'
                                }`}>
                                  {stats.standbyHours > 0 ? `${stats.standbyHours.toFixed(1)}h` : '—'}
                                </span>
                              </div>
                              {/* DÍAS */}
                              <div className="flex-1 text-center">
                                <div className="flex flex-col items-center">
                                  <span className="text-sm font-semibold text-slate-700">
                                    {stats.daysProductive}
                                  </span>
                                  {(stats.daysStandby > 0 || stats.daysDowntime > 0) && (
                                    <div className="flex gap-1 mt-1">
                                      {stats.daysStandby > 0 && (
                                        <div className="text-xs text-amber-600" title={`${stats.daysStandby} días standby`}>
                                          🟡{stats.daysStandby}
                                        </div>
                                      )}
                                      {stats.daysDowntime > 0 && (
                                        <div className="text-xs text-red-600" title={`${stats.daysDowntime} días downtime`}>
                                          🔴{stats.daysDowntime}
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
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
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================
// COMPONENTE AUXILIAR: MetricCard
// ============================================

function MetricCard({ label, value, subtitle, icon, color, helpText }) {
  return (
    <div className="relative group">
      <div className="p-5 bg-white border-2 border-slate-200 rounded-xl hover:border-slate-300 transition-all hover:-translate-y-1 hover:shadow-lg">
        <div className="flex items-start justify-between mb-3">
          <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${color} flex items-center justify-center text-2xl shadow-md`}>
            {icon}
          </div>
          {helpText && (
            <div className="group-hover:opacity-100 opacity-0 transition-opacity">
              <div className="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center text-xs text-slate-500 cursor-help" title={helpText}>
                ?
              </div>
            </div>
          )}
        </div>
        
        <div className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
          {label}
        </div>
        
        <div className="text-3xl font-black text-slate-900 mb-1">
          {value}
        </div>
        
        {subtitle && (
          <div className="text-xs text-slate-500">
            {subtitle}
          </div>
        )}
      </div>
    </div>
  );
}
