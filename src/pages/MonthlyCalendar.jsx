import React, { useEffect, useMemo, useState } from "react";
import { listActiveProjects, listMachines, listLogsByRange } from "../lib/db";
import { useOperatorAssignments } from "../lib/useOperatorAssignments";

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

export default function MonthlyCalendar() {
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState("");
  const [dateFrom, setDateFrom] = useState(addDays(isoToday(), -6));
  const [dateTo, setDateTo] = useState(isoToday());
  
  const [machines, setMachines] = useState([]);
  const [logs, setLogs] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const fromDate = new Date(dateFrom + 'T00:00:00');
  const { operatorsByMachine } = useOperatorAssignments(
    selectedProject,
    fromDate.getFullYear(),
    fromDate.getMonth() + 1
  );

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

  useEffect(() => {
    if (!selectedProject) return;

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
      
      const totalProductiveHours = machineLogs.reduce((sum, l) => 
        sum + (Number(l.productiveHours) || 0), 0
      );
      const totalStandbyHours = machineLogs.reduce((sum, l) => 
        sum + (Number(l.standbyHours) || 0), 0
      );
      const totalDowntimeHours = machineLogs.reduce((sum, l) => 
        sum + (Number(l.downtimeHours) || 0), 0
      );
      
      const daysProductive = machineLogs.filter(l => (Number(l.productiveHours) || 0) > 0).length;
      const daysStandby = machineLogs.filter(l => (Number(l.standbyHours) || 0) > 0).length;
      const daysDowntime = machineLogs.filter(l => (Number(l.downtimeHours) || 0) > 0).length;
      
      const totalHours = totalProductiveHours + totalStandbyHours + totalDowntimeHours;
      const availableHours = totalProductiveHours + totalStandbyHours;
      
      const availability = totalHours > 0 ? (availableHours / totalHours) * 100 : 0;
      const utilization = availableHours > 0 ? (totalProductiveHours / availableHours) * 100 : 0;
      const standbyRate = totalHours > 0 ? (totalStandbyHours / totalHours) * 100 : 0;
      const downtimeRate = totalHours > 0 ? (totalDowntimeHours / totalHours) * 100 : 0;
      
      const minHoursProportional = 180 * (daysInRange / 30);
      
      stats[machine.id] = {
        productiveHours: totalProductiveHours,
        standbyHours: totalStandbyHours,
        downtimeHours: totalDowntimeHours,
        totalHours: totalHours,
        availableHours: availableHours,
        daysProductive: daysProductive,
        daysStandby: daysStandby,
        daysDowntime: daysDowntime,
        totalDays: machineLogs.length,
        availability: availability,
        utilization: utilization,
        standbyRate: standbyRate,
        downtimeRate: downtimeRate,
        total: totalProductiveHours,
        min: minHoursProportional,
        diff: totalProductiveHours - minHoursProportional,
        days: daysProductive
      };
    });
    return stats;
  }, [machines, logs, daysInRange]);

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
    <div className="space-y-4 sm:space-y-6 p-4 sm:p-6">
      {/* Header - Responsive */}
      <div className="glass-card rounded-xl sm:rounded-2xl p-4 sm:p-6">
        <div className="flex flex-col lg:flex-row gap-4 lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl bg-gradient-to-br from-blue-900 to-blue-700 flex items-center justify-center shadow-lg flex-shrink-0">
                <svg className="w-5 h-5 sm:w-6 sm:h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl lg:text-3xl font-black text-slate-900 tracking-tight">
                  Detalle Flota
                </h1>
                <p className="text-slate-600 mt-0.5 sm:mt-1 text-xs sm:text-sm">
                  Vista de horas productivas (máx. 31 días)
                </p>
              </div>
            </div>
          </div>

          <select
            value={selectedProject}
            onChange={(e) => setSelectedProject(e.target.value)}
            className="input-modern w-full lg:w-64 text-sm sm:text-base"
            disabled={isLoading}
          >
            <option value="">Seleccionar proyecto...</option>
            {projects.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        {/* Filtros de fecha - Responsive */}
        <div className="mt-4 sm:mt-6 pt-4 sm:pt-6 border-t border-slate-200">
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div>
                <label className="block text-xs sm:text-sm font-semibold text-slate-700 mb-2">
                  Desde
                </label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="input-modern text-sm sm:text-base"
                  disabled={isLoading}
                />
              </div>
              <div>
                <label className="block text-xs sm:text-sm font-semibold text-slate-700 mb-2">
                  Hasta
                </label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="input-modern text-sm sm:text-base"
                  disabled={isLoading}
                />
              </div>
            </div>

            {/* Botones rápidos - Responsive */}
            <div className="flex gap-2 lg:items-end">
              <button
                onClick={() => setPreset(7)}
                className="flex-1 sm:flex-none px-3 sm:px-4 py-2 text-xs sm:text-sm font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg sm:rounded-xl transition-all disabled:opacity-50"
                disabled={isLoading}
              >
                7 días
              </button>
              <button
                onClick={setWeek}
                className="flex-1 sm:flex-none px-3 sm:px-4 py-2 text-xs sm:text-sm font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg sm:rounded-xl transition-all disabled:opacity-50"
                disabled={isLoading}
              >
                Semana
              </button>
              <button
                onClick={setMonth}
                className="flex-1 sm:flex-none px-3 sm:px-4 py-2 text-xs sm:text-sm font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg sm:rounded-xl transition-all disabled:opacity-50"
                disabled={isLoading}
              >
                Mes
              </button>
            </div>
          </div>

          {/* Info del rango - Responsive */}
          <div className="mt-3 sm:mt-4 flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4 text-xs sm:text-sm">
            <div className="flex items-center gap-2 text-slate-600">
              <svg className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span className="font-medium">{daysInRange} días en el rango</span>
            </div>
            <div className="flex items-center gap-2 text-blue-700">
              <svg className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="font-bold">Hrs mín: {(180 * daysInRange / 30).toFixed(1)} hrs</span>
            </div>
          </div>

          {/* Mensajes de estado */}
          {error && (
            <div className="mt-3 sm:mt-4 p-3 sm:p-4 bg-red-50 border border-red-200 rounded-lg sm:rounded-xl">
              <div className="flex items-center gap-2 text-red-700 text-xs sm:text-sm font-medium">
                <svg className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" />
                </svg>
                {error}
              </div>
            </div>
          )}

          {isLoading && (
            <div className="mt-3 sm:mt-4 flex items-center gap-2 sm:gap-3 text-xs sm:text-sm text-blue-600">
              <div className="spinner w-3 h-3 sm:w-4 sm:h-4 border-blue-600" />
              Cargando datos...
            </div>
          )}
        </div>
      </div>

      {/* Panel de Métricas - Responsive */}
      {!isLoading && machines.length > 0 && (
        <div className="glass-card rounded-xl sm:rounded-2xl p-4 sm:p-6 animate-fadeInUp">
          <h2 className="text-base sm:text-lg lg:text-xl font-bold text-slate-900 mb-4 sm:mb-6 flex items-center gap-2">
            <svg className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <span className="text-sm sm:text-base lg:text-xl">Métricas de Disponibilidad</span>
          </h2>

          {(() => {
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
                {/* Cards de métricas - Responsive Grid */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-4 sm:mb-6">
                  <MetricCard
                    label="Disponibilidad"
                    value={`${fleetAvailability.toFixed(1)}%`}
                    subtitle={`${Math.round(availableHours).toLocaleString()} hrs`}
                    icon="✅"
                    color="from-emerald-500 to-teal-600"
                  />
                  <MetricCard
                    label="Utilización"
                    value={`${fleetUtilization.toFixed(1)}%`}
                    subtitle={`${Math.round(totalStats.productiveHours).toLocaleString()} hrs`}
                    icon="⚡"
                    color="from-blue-500 to-cyan-600"
                  />
                  <MetricCard
                    label="Standby"
                    value={`${fleetStandbyRate.toFixed(1)}%`}
                    subtitle={`${Math.round(totalStats.standbyHours).toLocaleString()} hrs`}
                    icon="🟡"
                    color="from-amber-500 to-orange-600"
                  />
                  <MetricCard
                    label="Downtime"
                    value={`${fleetDowntimeRate.toFixed(1)}%`}
                    subtitle={`${Math.round(totalStats.downtimeHours).toLocaleString()} hrs`}
                    icon="🔴"
                    color="from-red-500 to-pink-600"
                  />
                </div>

                {/* Días - Responsive Grid */}
                <div className="grid grid-cols-3 gap-3 sm:gap-4">
                  <div className="p-3 sm:p-4 bg-blue-50 border border-blue-200 rounded-lg sm:rounded-xl">
                    <div className="text-xs sm:text-sm font-semibold text-blue-600 mb-1 sm:mb-2">Días Productivos</div>
                    <div className="text-xl sm:text-2xl font-black text-blue-700">{totalStats.daysProductive}</div>
                    <div className="text-[10px] sm:text-xs text-blue-600 mt-1">Trabajaron</div>
                  </div>
                  <div className="p-3 sm:p-4 bg-amber-50 border border-amber-200 rounded-lg sm:rounded-xl">
                    <div className="text-xs sm:text-sm font-semibold text-amber-600 mb-1 sm:mb-2">Días Standby</div>
                    <div className="text-xl sm:text-2xl font-black text-amber-700">{totalStats.daysStandby}</div>
                    <div className="text-[10px] sm:text-xs text-amber-600 mt-1">Sin uso</div>
                  </div>
                  <div className="p-3 sm:p-4 bg-red-50 border border-red-200 rounded-lg sm:rounded-xl">
                    <div className="text-xs sm:text-sm font-semibold text-red-600 mb-1 sm:mb-2">Días Downtime</div>
                    <div className="text-xl sm:text-2xl font-black text-red-700">{totalStats.daysDowntime}</div>
                    <div className="text-[10px] sm:text-xs text-red-600 mt-1">Fuera</div>
                  </div>
                </div>
              </>
            );
          })()}
        </div>
      )}

      {/* Tabla del calendario - Scroll horizontal */}
      {!error && selectedProject && (
        <div className="glass-card rounded-xl sm:rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-max">
              {/* Header */}
              <thead className="bg-gradient-to-r from-blue-50 to-sky-50 sticky top-0 z-20">
                <tr>
                  <th className="sticky left-0 z-30 bg-gradient-to-r from-blue-50 to-sky-50 text-left px-3 sm:px-6 py-3 sm:py-4 text-[10px] sm:text-xs font-bold text-blue-900 uppercase tracking-wider border-r-2 border-blue-300 shadow-[2px_0_5px_-2px_rgba(30,58,138,0.15)]">
                    Equipo
                  </th>
                  
                  {dates.map(date => {
                    const isToday = date.iso === isoToday();
                    return (
                      <th
                        key={date.iso}
                        className={`text-center px-2 sm:px-3 py-2 sm:py-3 border-r border-blue-200 min-w-[60px] sm:min-w-[80px] ${
                          isToday ? 'bg-blue-100' : ''
                        }`}
                      >
                        <div className={`text-[10px] sm:text-xs font-bold uppercase ${
                          isToday ? 'text-blue-900' : 'text-blue-700'
                        }`}>
                          {date.weekday}
                        </div>
                        <div className={`text-base sm:text-lg font-black mt-0.5 sm:mt-1 ${
                          isToday ? 'text-blue-900' : 'text-slate-900'
                        }`}>
                          {date.day}
                        </div>
                      </th>
                    );
                  })}
                  
                  {/* Resumen - Hidden en mobile */}
                  <th className="hidden lg:table-cell sticky right-0 z-30 bg-gradient-to-r from-blue-50 to-sky-50 text-center px-4 py-4 text-xs font-bold text-blue-900 uppercase tracking-wider border-l-2 border-blue-300 shadow-[-2px_0_5px_-2px_rgba(30,58,138,0.15)]">
                    <div className="flex items-center justify-center gap-3 min-w-[520px]">
                      <div className="flex-1">Disponib. (%)</div>
                      <div className="flex-1">Utiliz. (%)</div>
                      <div className="flex-1">Hrs Prod.</div>
                      <div className="flex-1">Standby</div>
                      <div className="flex-1">Días</div>
                    </div>
                  </th>
                </tr>
              </thead>

              {/* Body */}
              <tbody className="divide-y divide-slate-100 bg-white">
                {isLoading ? (
                  Array.from({ length: 3 }).map((_, idx) => (
                    <tr key={idx} className="animate-pulse">
                      <td className="sticky left-0 z-20 bg-white px-3 sm:px-6 py-3 sm:py-4 border-r-2 border-blue-300">
                        <div className="h-3 sm:h-4 bg-slate-200 rounded w-16 sm:w-24" />
                      </td>
                      {dates.map((_, dayIdx) => (
                        <td key={dayIdx} className="px-2 sm:px-3 py-3 sm:py-4 text-center border-r border-slate-200">
                          <div className="h-3 sm:h-4 bg-slate-200 rounded w-6 sm:w-8 mx-auto" />
                        </td>
                      ))}
                      <td className="hidden lg:table-cell sticky right-0 z-20 bg-white px-4 py-4 border-l-2 border-blue-300">
                        <div className="flex gap-3 min-w-[520px]">
                          {[...Array(5)].map((_, i) => (
                            <div key={i} className="flex-1"><div className="h-4 bg-slate-200 rounded w-12 mx-auto" /></div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))
                ) : machines.length === 0 ? (
                  <tr>
                    <td colSpan={dates.length + 2} className="py-12 sm:py-16 text-center">
                      <div className="text-xs sm:text-sm text-slate-500">No hay equipos activos</div>
                    </td>
                  </tr>
                ) : (
                  machines.map(machine => {
                    const stats = machineStats[machine.id] || {};
                    const machineLogs = logsByMachineDate[machine.id] || {};
                    const operators = operatorsByMachine?.[machine.id] || [];

                    return (
                      <tr key={machine.id} className="hover:bg-slate-50 transition-colors">
                        <td className="sticky left-0 z-20 bg-white hover:bg-slate-50 px-3 sm:px-6 py-3 sm:py-4 border-r-2 border-blue-300 shadow-[2px_0_5px_-2px_rgba(30,58,138,0.1)]">
                          <div className="min-w-0">
                            <div className="text-xs sm:text-sm font-bold text-slate-900 truncate">
                              {machine.code}
                            </div>
                            <div className="text-[10px] sm:text-xs text-slate-600 truncate">
                              {machine.name}
                            </div>
                            {operators.length > 0 && (
                              <div className="text-[10px] text-blue-600 mt-1 truncate">
                                {operators[0].name}
                              </div>
                            )}
                          </div>
                        </td>
                        
                        {dates.map(date => {
                          const log = machineLogs[date.iso];
                          const isToday = date.iso === isoToday();
                          const productiveHrs = Number(log?.productiveHours) || 0;
                          
                          return (
                            <td
                              key={date.iso}
                              className={`px-2 sm:px-3 py-2 sm:py-3 text-center border-r border-slate-200 ${
                                isToday ? 'bg-blue-50/30' : ''
                              }`}
                            >
                              {productiveHrs > 0 ? (
                                <div className="inline-flex items-center justify-center px-2 py-1 rounded-lg text-xs sm:text-sm font-bold bg-blue-100 text-blue-700">
                                  {productiveHrs.toFixed(1)}
                                </div>
                              ) : (
                                <span className="text-slate-300 text-xs sm:text-sm">—</span>
                              )}
                            </td>
                          );
                        })}
                        
                        {/* Resumen - Hidden mobile */}
                        <td className="hidden lg:table-cell sticky right-0 z-20 bg-white hover:bg-slate-50 px-4 py-4 border-l-2 border-blue-300 shadow-[-2px_0_5px_-2px_rgba(30,58,138,0.1)]">
                          <div className="flex items-center justify-center gap-3 min-w-[520px]">
                            <div className="flex-1 text-center">
                              <div className="text-lg font-black text-emerald-700">
                                {stats.availability?.toFixed(1) || '0.0'}%
                              </div>
                            </div>
                            <div className="flex-1 text-center">
                              <div className="text-lg font-black text-blue-700">
                                {stats.utilization?.toFixed(1) || '0.0'}%
                              </div>
                            </div>
                            <div className="flex-1 text-center">
                              <div className="text-lg font-black text-slate-900">
                                {Math.round(stats.productiveHours || 0)}
                              </div>
                            </div>
                            <div className="flex-1 text-center">
                              <div className="text-lg font-black text-amber-700">
                                {Math.round(stats.standbyHours || 0)}
                              </div>
                            </div>
                            <div className="flex-1 text-center">
                              <div className="text-lg font-black text-blue-700">
                                {stats.daysProductive || 0}
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

          {/* Resumen Mobile - Solo visible en mobile */}
          {!isLoading && machines.length > 0 && (
            <div className="lg:hidden border-t-2 border-blue-300 bg-gradient-to-r from-blue-50 to-sky-50 p-4">
              <h3 className="text-sm font-bold text-blue-900 mb-3">Resumen por Equipo</h3>
              <div className="space-y-3">
                {machines.map(machine => {
                  const stats = machineStats[machine.id] || {};
                  return (
                    <div key={machine.id} className="bg-white rounded-lg p-3 border border-blue-200">
                      <div className="font-bold text-sm text-slate-900 mb-2">{machine.code}</div>
                      <div className="grid grid-cols-3 gap-2 text-center text-xs">
                        <div>
                          <div className="font-black text-emerald-700">{stats.availability?.toFixed(1) || '0'}%</div>
                          <div className="text-[10px] text-slate-500">Disponib.</div>
                        </div>
                        <div>
                          <div className="font-black text-blue-700">{stats.utilization?.toFixed(1) || '0'}%</div>
                          <div className="text-[10px] text-slate-500">Utiliz.</div>
                        </div>
                        <div>
                          <div className="font-black text-slate-900">{Math.round(stats.productiveHours || 0)}</div>
                          <div className="text-[10px] text-slate-500">Hrs Prod.</div>
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

// Componente MetricCard - Responsive
function MetricCard({ label, value, subtitle, icon, color }) {
  return (
    <div className="glass-card rounded-lg sm:rounded-xl p-3 sm:p-4 hover:shadow-lg transition-shadow">
      <div className="flex items-center justify-between mb-2 sm:mb-3">
        <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-gradient-to-br ${color} flex items-center justify-center shadow-lg text-base sm:text-xl`}>
          {icon}
        </div>
      </div>
      <div className="text-xl sm:text-2xl lg:text-3xl font-black text-slate-900 mb-1 break-words">
        {value}
      </div>
      <div className="text-xs sm:text-sm font-semibold text-slate-600 leading-tight">{label}</div>
      {subtitle && <div className="text-[10px] sm:text-xs text-slate-500 mt-1 leading-tight">{subtitle}</div>}
    </div>
  );
}
