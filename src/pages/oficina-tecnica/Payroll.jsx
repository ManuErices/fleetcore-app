import React, { useEffect, useState } from "react";
import { listActiveProjects, listEmployees, listMachines, listEmployeeMonthlyData, upsertEmployeeMonthlyData, upsertEmployeeAssignment, getEmployeeAssignment, upsertEmployee } from "../../lib/db";
import { useEmpresa } from "../../lib/useEmpresa";
import PayrollImporter from "../../components/PayrollImporter";
import EmployeeDetailModal from "../../components/EmployeeDetailModal";

const EMPTY_LINE = {
  diasTrabajados: 0,
  sueldoBase: 0,
  sueldoBruto: 0,
  descuentosLegales: 0,
  otrosDescuentos: 0,
  impuestos: 0,
  sueldoLiquido: 0,
  aporteEmpresa: 0,
  finiquitos: 0,
  totalCosto: 0,
  porcentajeIncidencia: 100,
  centroCosto: '',
  id: null
};

export default function Payroll() {
  const { empresaId } = useEmpresa();
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState("");
  const [employees, setEmployees] = useState([]);
  const [monthlyData, setMonthlyData] = useState([]);
  const [machines, setMachines] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showImporter, setShowImporter] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedEmployees, setExpandedEmployees] = useState(new Set());
  const [sortKey, setSortKey] = useState("nombre");
  const [sortDir, setSortDir] = useState("asc");

  // Modal
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  useEffect(() => {
    if (!empresaId) return;
    (async () => {
      try {
        const p = await listActiveProjects(empresaId);
        setProjects(p);
        if (p.length > 0 && !selectedProject) {
          setSelectedProject(p[0].id);
        }
      } catch (err) {
        console.error("Error cargando proyectos:", err);
      }
    })();
  }, [empresaId]);

  const loadData = async () => {
    if (!empresaId || !selectedProject) return;
    
    setIsLoading(true);
    try {
      const [emp, mach, monthly] = await Promise.all([
        listEmployees(empresaId, selectedProject),
        listMachines(empresaId, selectedProject),
        listEmployeeMonthlyData(empresaId, selectedProject, selectedYear, selectedMonth)
      ]);
      
      setEmployees(emp);
      setMachines(mach.filter(m => m.active !== false));
      setMonthlyData(monthly);
    } catch (err) {
      console.error("Error cargando datos:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedProject, selectedYear, selectedMonth]);

  // Combinar empleados con TODAS sus liquidaciones del mes (puede haber más de una,
  // por ejemplo cuando trabajaron en distintos Centros de Costo el mismo mes)
  const employeesWithMonthlyData = React.useMemo(() => {
    return employees.map(emp => {
      const empLines = monthlyData.filter(m => m.employeeId === emp.id);
      const hasDataForMonth = empLines.length > 0;
      const rawLines = hasDataForMonth ? empLines : [{ ...EMPTY_LINE, employeeId: emp.id, centroCosto: emp.centroCosto || '' }];

      const lines = rawLines.map(l => {
        const totalCosto = l.totalCosto || 0;
        const porcentajeIncidencia = l.porcentajeIncidencia != null ? l.porcentajeIncidencia : 100;
        return {
          ...l,
          employeeId: emp.id,
          totalCosto,
          porcentajeIncidencia,
          costoObra: totalCosto * (porcentajeIncidencia / 100)
        };
      });

      const diasTrabajados = lines.reduce((s, l) => s + (l.diasTrabajados || 0), 0);
      const totalCosto = lines.reduce((s, l) => s + (l.totalCosto || 0), 0);
      const costoObra = lines.reduce((s, l) => s + (l.costoObra || 0), 0);
      const porcentajeIncidencia = totalCosto > 0 ? (costoObra / totalCosto) * 100 : 100;

      return {
        ...emp,
        // Clasificación por cuenta contable — usa la reclasificación manual si existe,
        // si no cae al campo "tipo" legado (OPERADOR→Directo, GASTO_GENERAL→Indirecto)
        tipoManoObra: emp.tipoManoObra || (emp.tipo === 'OPERADOR' ? 'DIRECTO' : 'INDIRECTO'),
        diasTrabajados,
        totalCosto,
        costoObra,
        porcentajeIncidencia,
        lines,
        hasMultipleLines: lines.length > 1,
        hasDataForMonth
      };
    });
  }, [employees, monthlyData]);

  const handleAssignMachine = async (employeeId, machineId) => {
    try {
      const existing = await getEmployeeAssignment(empresaId, employeeId, selectedYear, selectedMonth);
      
      if (existing) {
        await upsertEmployeeAssignment(empresaId, {
          id: existing.id,
          projectId: selectedProject,
          employeeId: employeeId,
          machineId: machineId || null,
          year: selectedYear,
          month: selectedMonth
        });
      } else {
        await upsertEmployeeAssignment(empresaId, {
          projectId: selectedProject,
          employeeId: employeeId,
          machineId: machineId || null,
          year: selectedYear,
          month: selectedMonth
        });
      }
      
      console.log("✅ Asignación guardada");
    } catch (err) {
      console.error("Error asignando máquina:", err);
      alert("Error al asignar máquina");
    }
  };

  // Actualiza el % de incidencia de UNA liquidación específica (una fila de la tabla expandida,
  // o la única liquidación del empleado si no tiene varias)
  const handleUpdateLinePorcentaje = async (line, rawValue) => {
    const pct = Math.max(0, Math.min(100, parseFloat(rawValue)));
    if (isNaN(pct)) return;

    try {
      // Actualización optimista para que se sienta instantáneo
      if (line.id) {
        setMonthlyData(prev => prev.map(m => m.id === line.id ? { ...m, porcentajeIncidencia: pct } : m));
      }

      const payload = {
        projectId: selectedProject,
        employeeId: line.employeeId,
        year: selectedYear,
        month: selectedMonth,
        centroCosto: line.centroCosto || '',
        diasTrabajados: line.diasTrabajados || 0,
        sueldoBase: line.sueldoBase || 0,
        sueldoBruto: line.sueldoBruto || 0,
        descuentosLegales: line.descuentosLegales || 0,
        otrosDescuentos: line.otrosDescuentos || 0,
        impuestos: line.impuestos || 0,
        sueldoLiquido: line.sueldoLiquido || 0,
        aporteEmpresa: line.aporteEmpresa || 0,
        finiquitos: line.finiquitos || 0,
        totalCosto: line.totalCosto || 0,
        porcentajeIncidencia: pct
      };
      if (line.id) payload.id = line.id;

      await upsertEmployeeMonthlyData(empresaId, payload);

      // Si la liquidación no existía todavía (empleado sin datos del mes), recargamos para tomar el id nuevo
      if (!line.id) await loadData();
    } catch (err) {
      console.error("Error actualizando % de incidencia:", err);
      alert("Error al actualizar el % de incidencia");
      await loadData();
    }
  };

  // Reclasifica manualmente a un empleado entre Mano de Obra Directo (1.1) e Indirecto (1.2)
  const handleReclasificar = async (employeeId, nuevoTipo) => {
    // Actualización optimista
    setEmployees(prev => prev.map(e => e.id === employeeId ? { ...e, tipoManoObra: nuevoTipo } : e));
    try {
      await upsertEmployee(empresaId, {
        id: employeeId,
        tipoManoObra: nuevoTipo,
        tipo: nuevoTipo === 'DIRECTO' ? 'OPERADOR' : 'GASTO_GENERAL' // se mantiene el campo legado en sincro
      });
    } catch (err) {
      console.error("Error reclasificando empleado:", err);
      alert("Error al reclasificar. Intenta de nuevo.");
      await loadData();
    }
  };

  const toggleExpanded = (employeeId) => {
    setExpandedEmployees(prev => {
      const next = new Set(prev);
      if (next.has(employeeId)) next.delete(employeeId);
      else next.add(employeeId);
      return next;
    });
  };

  const handleOpenEmployeeDetail = (employee) => {
    setSelectedEmployee(employee);
    setShowDetailModal(true);
  };

  const [assignments, setAssignments] = useState({});

  useEffect(() => {
    if (!selectedProject) return;
    
    (async () => {
      try {
        const { listEmployeeAssignments } = await import("../../lib/db");
        const assigns = await listEmployeeAssignments(selectedProject, selectedYear, selectedMonth);
        
        const assignMap = {};
        assigns.forEach(a => {
          assignMap[a.employeeId] = a.machineId;
        });
        setAssignments(assignMap);
      } catch (err) {
        console.error("Error cargando asignaciones:", err);
      }
    })();
  }, [selectedProject, selectedYear, selectedMonth]);

  const getMachineForEmployee = (employeeId) => {
    return assignments[employeeId] || '';
  };

  // Filtro de búsqueda (nombre, RUT o cargo)
  const matchesSearch = (emp) => {
    if (!searchTerm.trim()) return true;
    const q = searchTerm.trim().toLowerCase();
    return (
      emp.nombre?.toLowerCase().includes(q) ||
      emp.rut?.toLowerCase().includes(q) ||
      emp.cargo?.toLowerCase().includes(q)
    );
  };

  // Ordenamiento (compartido entre la tabla de Operadores y la de Gastos Generales)
  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const ordenar = (lista) => {
    const sorted = [...lista].sort((a, b) => {
      let va = a[sortKey];
      let vb = b[sortKey];
      if (typeof va === "string") va = va.toLowerCase();
      if (typeof vb === "string") vb = vb.toLowerCase();
      if (va == null) va = "";
      if (vb == null) vb = "";
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return sorted;
  };

  const operadores = ordenar(employeesWithMonthlyData.filter(e => e.tipoManoObra === 'DIRECTO' && e.hasDataForMonth && matchesSearch(e)));
  const gastosGenerales = ordenar(employeesWithMonthlyData.filter(e => e.tipoManoObra === 'INDIRECTO' && e.hasDataForMonth && matchesSearch(e)));
  const totalEmpleadosDelMes = employeesWithMonthlyData.filter(e => e.hasDataForMonth).length;

  const totalCostoOperadores = operadores.reduce((sum, e) => sum + (e.totalCosto || 0), 0);
  const totalCostoGastos = gastosGenerales.reduce((sum, e) => sum + (e.totalCosto || 0), 0);
  const totalCostoObraOperadores = operadores.reduce((sum, e) => sum + (e.costoObra || 0), 0);
  const totalCostoObraGastos = gastosGenerales.reduce((sum, e) => sum + (e.costoObra || 0), 0);

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('es-CL', {
      style: 'currency',
      currency: 'CLP',
      minimumFractionDigits: 0
    }).format(value);
  };

  const months = [
    { value: 1, label: 'Enero' },
    { value: 2, label: 'Febrero' },
    { value: 3, label: 'Marzo' },
    { value: 4, label: 'Abril' },
    { value: 5, label: 'Mayo' },
    { value: 6, label: 'Junio' },
    { value: 7, label: 'Julio' },
    { value: 8, label: 'Agosto' },
    { value: 9, label: 'Septiembre' },
    { value: 10, label: 'Octubre' },
    { value: 11, label: 'Noviembre' },
    { value: 12, label: 'Diciembre' }
  ];

  const years = [2024, 2025, 2026];

  // Celda de % Obra: si tiene una sola liquidación, editable directo.
  // Si tiene varias, muestra el % promedio ponderado (solo lectura) + botón para expandir y editar cada una.
  // Encabezado de columna clickeable para ordenar la tabla
  const SortableHeader = ({ label, sortField, align = "left" }) => {
    const active = sortKey === sortField;
    return (
      <th
        onClick={() => handleSort(sortField)}
        className={`px-6 py-4 text-${align} text-xs font-bold uppercase cursor-pointer select-none transition-colors ${active ? "text-blue-700" : "text-slate-600 hover:text-slate-900"}`}
      >
        <span className={`inline-flex items-center gap-1 ${align === "right" ? "flex-row-reverse" : align === "center" ? "justify-center w-full" : ""}`}>
          {label}
          <svg
            className={`w-3 h-3 transition-transform ${active ? "opacity-100" : "opacity-30"} ${active && sortDir === "desc" ? "rotate-180" : ""}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
          </svg>
        </span>
      </th>
    );
  };

  const PorcentajeCell = ({ emp }) => {
    if (emp.hasMultipleLines) {
      return (
        <button
          onClick={() => toggleExpanded(emp.id)}
          className="text-xs font-semibold text-slate-500 hover:text-blue-600 underline decoration-dotted"
          title="Esta persona tiene varias liquidaciones este mes — haz clic para ver el detalle"
        >
          ~{Math.round(emp.porcentajeIncidencia)}% prom.
        </button>
      );
    }
    const line = emp.lines[0];
    return (
      <input
        type="number"
        min="0"
        max="100"
        step="1"
        defaultValue={Math.round(line.porcentajeIncidencia)}
        onBlur={(e) => {
          if (parseFloat(e.target.value) !== line.porcentajeIncidencia) {
            handleUpdateLinePorcentaje(line, e.target.value);
          }
        }}
        onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
        className="w-20 text-center input-modern py-1.5"
        title="% del costo empresa que corresponde a esta obra"
      />
    );
  };

  // Filas expandidas con el detalle de cada liquidación (una por Centro de Costo)
  const ExpandedLines = ({ emp, colSpan, accentClass }) => (
    <tr className="bg-slate-50">
      <td colSpan={colSpan} className="px-6 py-3">
        <div className="text-xs font-bold text-slate-500 uppercase mb-2 ml-12">
          {emp.lines.length} liquidaciones este mes
        </div>
        <div className="ml-12 rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-100">
              <tr>
                <th className="text-left px-4 py-2 text-xs font-bold text-slate-500 uppercase">Centro de Costo</th>
                <th className="text-center px-4 py-2 text-xs font-bold text-slate-500 uppercase">Días</th>
                <th className="text-right px-4 py-2 text-xs font-bold text-slate-500 uppercase">Costo Empresa</th>
                <th className="text-center px-4 py-2 text-xs font-bold text-slate-500 uppercase">% Obra</th>
                <th className="text-right px-4 py-2 text-xs font-bold text-slate-500 uppercase">Costo Obra</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {emp.lines.map((line, i) => (
                <tr key={line.id || i}>
                  <td className="px-4 py-2 text-sm text-slate-700">{line.centroCosto || '—'}</td>
                  <td className="px-4 py-2 text-center text-sm text-slate-700">{line.diasTrabajados}</td>
                  <td className="px-4 py-2 text-right text-sm font-semibold text-slate-700">{formatCurrency(line.totalCosto)}</td>
                  <td className="px-4 py-2 text-center">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="1"
                      defaultValue={Math.round(line.porcentajeIncidencia)}
                      onBlur={(e) => {
                        if (parseFloat(e.target.value) !== line.porcentajeIncidencia) {
                          handleUpdateLinePorcentaje(line, e.target.value);
                        }
                      }}
                      onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
                      className="w-20 text-center input-modern py-1"
                    />
                  </td>
                  <td className={`px-4 py-2 text-right text-sm font-bold ${accentClass}`}>{formatCurrency(line.costoObra)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </td>
    </tr>
  );

  return (
    <div className="space-y-6">
      {/* Header - AZUL FLEETCORE */}
      <div className="glass-card rounded-2xl p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-900 to-blue-700 flex items-center justify-center shadow-lg">
                <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
                </svg>
              </div>
              <div>
                <h1 className="text-3xl font-black text-slate-900 tracking-tight">
                  Remuneraciones
                </h1>
                <p className="text-slate-600 mt-1 text-sm">
                  Gestión de personal, liquidaciones y asignación a equipos
                </p>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowImporter(!showImporter)}
              className="px-6 py-3 rounded-xl font-semibold text-white bg-gradient-to-r from-blue-900 to-blue-700 hover:from-blue-800 hover:to-blue-600 shadow-lg hover:shadow-xl transition-all flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              {showImporter ? 'Ocultar Importador' : 'Importar Excel'}
            </button>
            
            <select
              value={selectedProject}
              onChange={(e) => setSelectedProject(e.target.value)}
              className="input-modern"
            >
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        </div>

        {/* Importador */}
        {showImporter && (
          <div className="mb-6 pb-6 border-b border-slate-200">
            <PayrollImporter 
              empresaId={empresaId}
              projectId={selectedProject}
              onImportComplete={() => {
                setShowImporter(false);
                loadData();
              }}
            />
          </div>
        )}

        {/* Filtros */}
        <div className="flex items-end gap-4 flex-wrap">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">Mes</label>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
              className="input-modern"
            >
              {months.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">Año</label>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(parseInt(e.target.value))}
              className="input-modern"
            >
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div className="flex-1 min-w-[220px]">
            <label className="block text-sm font-semibold text-slate-700 mb-2">Buscar persona</label>
            <div className="relative">
              <svg className="w-5 h-5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Nombre, RUT o cargo..."
                className="input-modern w-full pl-10"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Resumen - AZUL FLEETCORE */}
      <div className="grid md:grid-cols-3 gap-4">
        <div className="glass-card rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-900 to-blue-700 flex items-center justify-center shadow-lg">
              <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
              </svg>
            </div>
            <div className="text-sm font-bold text-slate-600">Total Empleados</div>
          </div>
          <div className="text-3xl font-black text-slate-900">{totalEmpleadosDelMes}</div>
        </div>

        <div className="glass-card rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-600 to-teal-600 flex items-center justify-center shadow-lg">
              <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M6 6V5a3 3 0 013-3h2a3 3 0 013 3v1h2a2 2 0 012 2v3.57A22.952 22.952 0 0110 13a22.95 22.95 0 01-8-1.43V8a2 2 0 012-2h2zm2-1a1 1 0 011-1h2a1 1 0 011 1v1H8V5zm1 5a1 1 0 011-1h.01a1 1 0 110 2H10a1 1 0 01-1-1z" clipRule="evenodd" />
                <path d="M2 13.692V16a2 2 0 002 2h12a2 2 0 002-2v-2.308A24.974 24.974 0 0110 15c-2.796 0-5.487-.46-8-1.308z" />
              </svg>
            </div>
            <div className="text-sm font-bold text-slate-600">Mano de Obra Directo (1.1)</div>
          </div>
          <div className="text-3xl font-black text-emerald-700">{operadores.length}</div>
          <div className="text-xs text-emerald-600 mt-2">Costo Empresa: {formatCurrency(totalCostoOperadores)}</div>
          <div className="text-xs font-bold text-emerald-800 mt-0.5">Costo Obra: {formatCurrency(totalCostoObraOperadores)}</div>
        </div>

        <div className="glass-card rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-600 to-red-600 flex items-center justify-center shadow-lg">
              <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M4 4a2 2 0 012-2h8a2 2 0 012 2v12a1 1 0 110 2h-3a1 1 0 01-1-1v-2a1 1 0 00-1-1H9a1 1 0 00-1 1v2a1 1 0 01-1 1H4a1 1 0 110-2V4zm3 1h2v2H7V5zm2 4H7v2h2V9zm2-4h2v2h-2V5zm2 4h-2v2h2V9z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="text-sm font-bold text-slate-600">Mano de Obra Indirecto (1.2)</div>
          </div>
          <div className="text-3xl font-black text-orange-700">{gastosGenerales.length}</div>
          <div className="text-xs text-orange-600 mt-2">Costo Empresa: {formatCurrency(totalCostoGastos)}</div>
          <div className="text-xs font-bold text-orange-800 mt-0.5">Costo Obra: {formatCurrency(totalCostoObraGastos)}</div>
        </div>
      </div>

      {/* Tabla de Operadores - VERDE */}
      {operadores.length > 0 && (
        <div className="glass-card rounded-2xl overflow-hidden">
          <div className="px-6 py-4 bg-gradient-to-r from-emerald-50 to-teal-50 border-b border-emerald-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-600 to-teal-600 flex items-center justify-center shadow-lg">
                <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-bold text-emerald-900">
                  👷 Mano de Obra Directo (1.1) - Asignación a Equipos
                </h3>
                <p className="text-sm text-emerald-700 mt-1">
                  Click en el nombre para ver liquidación completa
                </p>
              </div>
            </div>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50">
                <tr>
                  <SortableHeader label="Nombre" sortField="nombre" />
                  <SortableHeader label="Cargo" sortField="cargo" />
                  <SortableHeader label="Días" sortField="diasTrabajados" align="center" />
                  <SortableHeader label="Costo Empresa" sortField="totalCosto" align="right" />
                  <SortableHeader label="% Obra" sortField="porcentajeIncidencia" align="center" />
                  <SortableHeader label="Costo Obra" sortField="costoObra" align="right" />
                  <th className="text-left px-6 py-4 text-xs font-bold text-slate-600 uppercase">Equipo Asignado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {operadores.map(emp => (
                  <React.Fragment key={emp.id}>
                    <tr className="hover:bg-slate-50">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1">
                          <div className="w-6 flex-shrink-0 flex items-center justify-center">
                            {emp.hasMultipleLines && (
                              <button
                                onClick={() => toggleExpanded(emp.id)}
                                className="p-1 rounded text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors"
                                title={`${emp.lines.length} liquidaciones este mes`}
                              >
                                <svg className={`w-4 h-4 transition-transform ${expandedEmployees.has(emp.id) ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                </svg>
                              </button>
                            )}
                          </div>
                          <button
                            onClick={() => handleOpenEmployeeDetail(emp)}
                            className="group flex items-center gap-3 text-left w-full hover:bg-blue-50 -mx-2 px-2 py-2 rounded-lg transition-all"
                          >
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-md flex-shrink-0">
                              <span className="text-white text-sm font-bold">
                                {emp.nombre.split(' ')[0][0]}{emp.nombre.split(' ')[1]?.[0] || ''}
                              </span>
                            </div>
                            <div>
                              <div className="font-semibold text-slate-900 group-hover:text-blue-600 transition-colors flex items-center gap-2">
                                {emp.nombre}
                                {emp.hasMultipleLines && (
                                  <span className="text-[10px] font-bold uppercase tracking-wide bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">
                                    {emp.lines.length} liquidaciones
                                  </span>
                                )}
                                <svg className="w-4 h-4 text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                                </svg>
                              </div>
                              <div className="text-xs text-slate-500">{emp.rut}</div>
                            </div>
                          </button>
                          <select
                            value={emp.tipoManoObra}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => handleReclasificar(emp.id, e.target.value)}
                            className="text-[10px] font-semibold text-slate-500 border border-slate-200 rounded-lg px-1.5 py-1 bg-white cursor-pointer hover:border-slate-300 flex-shrink-0"
                            title="Reclasificar manualmente"
                          >
                            <option value="DIRECTO">1.1 Directo</option>
                            <option value="INDIRECTO">1.2 Indirecto</option>
                          </select>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">{emp.cargo}</td>
                      <td className="px-6 py-4 text-center">
                        <span className="text-sm font-semibold text-slate-700">
                          {emp.diasTrabajados}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className="text-sm font-bold text-emerald-700">
                          {formatCurrency(emp.totalCosto)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <PorcentajeCell emp={emp} />
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className="text-sm font-bold text-emerald-800">
                          {formatCurrency(emp.costoObra)}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <select
                          value={getMachineForEmployee(emp.id)}
                          onChange={(e) => {
                            handleAssignMachine(emp.id, e.target.value);
                            setAssignments({...assignments, [emp.id]: e.target.value});
                          }}
                          className="input-modern w-full max-w-xs"
                        >
                          <option value="">Sin asignar</option>
                          {machines.map(m => (
                            <option key={m.id} value={m.id}>
                              {m.code || m.patente} - {m.name}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                    {emp.hasMultipleLines && expandedEmployees.has(emp.id) && (
                      <ExpandedLines emp={emp} colSpan={7} accentClass="text-emerald-800" />
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tabla de Gastos Generales - NARANJA */}
      {gastosGenerales.length > 0 && (
        <div className="glass-card rounded-2xl overflow-hidden">
          <div className="px-6 py-4 bg-gradient-to-r from-orange-50 to-red-50 border-b border-orange-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-600 to-red-600 flex items-center justify-center shadow-lg">
                <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M4 4a2 2 0 012-2h8a2 2 0 012 2v12a1 1 0 110 2h-3a1 1 0 01-1-1v-2a1 1 0 00-1-1H9a1 1 0 00-1 1v2a1 1 0 01-1 1H4a1 1 0 110-2V4zm3 1h2v2H7V5zm2 4H7v2h2V9zm2-4h2v2h-2V5zm2 4h-2v2h2V9z" clipRule="evenodd" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-bold text-orange-900">
                  💼 Mano de Obra Indirecto (1.2)
                </h3>
                <p className="text-sm text-orange-700 mt-1">
                  Personal administrativo y de soporte (click en el nombre para ver liquidación)
                </p>
              </div>
            </div>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50">
                <tr>
                  <SortableHeader label="Nombre" sortField="nombre" />
                  <SortableHeader label="Cargo" sortField="cargo" />
                  <SortableHeader label="Departamento" sortField="gerencia" />
                  <SortableHeader label="Días" sortField="diasTrabajados" align="center" />
                  <SortableHeader label="Costo Empresa" sortField="totalCosto" align="right" />
                  <SortableHeader label="% Obra" sortField="porcentajeIncidencia" align="center" />
                  <SortableHeader label="Costo Obra" sortField="costoObra" align="right" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {gastosGenerales.map(emp => (
                  <React.Fragment key={emp.id}>
                    <tr className="hover:bg-slate-50">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1">
                          <div className="w-6 flex-shrink-0 flex items-center justify-center">
                            {emp.hasMultipleLines && (
                              <button
                                onClick={() => toggleExpanded(emp.id)}
                                className="p-1 rounded text-slate-400 hover:text-orange-600 hover:bg-orange-50 transition-colors"
                                title={`${emp.lines.length} liquidaciones este mes`}
                              >
                                <svg className={`w-4 h-4 transition-transform ${expandedEmployees.has(emp.id) ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                </svg>
                              </button>
                            )}
                          </div>
                          <button
                            onClick={() => handleOpenEmployeeDetail(emp)}
                            className="group flex items-center gap-3 text-left w-full hover:bg-blue-50 -mx-2 px-2 py-2 rounded-lg transition-all"
                          >
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center shadow-md flex-shrink-0">
                              <span className="text-white text-sm font-bold">
                                {emp.nombre.split(' ')[0][0]}{emp.nombre.split(' ')[1]?.[0] || ''}
                              </span>
                            </div>
                            <div>
                              <div className="font-semibold text-slate-900 group-hover:text-blue-600 transition-colors flex items-center gap-2">
                                {emp.nombre}
                                {emp.hasMultipleLines && (
                                  <span className="text-[10px] font-bold uppercase tracking-wide bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded">
                                    {emp.lines.length} liquidaciones
                                  </span>
                                )}
                                <svg className="w-4 h-4 text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                                </svg>
                              </div>
                              <div className="text-xs text-slate-500">{emp.rut}</div>
                            </div>
                          </button>
                          <select
                            value={emp.tipoManoObra}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => handleReclasificar(emp.id, e.target.value)}
                            className="text-[10px] font-semibold text-slate-500 border border-slate-200 rounded-lg px-1.5 py-1 bg-white cursor-pointer hover:border-slate-300 flex-shrink-0"
                            title="Reclasificar manualmente"
                          >
                            <option value="DIRECTO">1.1 Directo</option>
                            <option value="INDIRECTO">1.2 Indirecto</option>
                          </select>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">{emp.cargo}</td>
                      <td className="px-6 py-4 text-sm text-slate-600">{emp.gerencia}</td>
                      <td className="px-6 py-4 text-center">
                        <span className="text-sm font-semibold text-slate-700">
                          {emp.diasTrabajados}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className="text-sm font-bold text-orange-700">
                          {formatCurrency(emp.totalCosto)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <PorcentajeCell emp={emp} />
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className="text-sm font-bold text-orange-800">
                          {formatCurrency(emp.costoObra)}
                        </span>
                      </td>
                    </tr>
                    {emp.hasMultipleLines && expandedEmployees.has(emp.id) && (
                      <ExpandedLines emp={emp} colSpan={7} accentClass="text-orange-800" />
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Sin resultados (búsqueda o mes sin datos) */}
      {!isLoading && employees.length > 0 && operadores.length === 0 && gastosGenerales.length === 0 && (
        <div className="glass-card rounded-2xl p-12 text-center text-slate-400">
          {searchTerm.trim() ? (
            <>No se encontraron personas que coincidan con "{searchTerm}".</>
          ) : (
            <>No hay liquidaciones cargadas para {months.find(m => m.value === selectedMonth)?.label} {selectedYear}. Importa el Excel de ese mes para ver los datos.</>
          )}
        </div>
      )}

      {/* Estado vacío - AZUL FLEETCORE */}
      {!isLoading && employees.length === 0 && (
        <div className="glass-card rounded-2xl p-16 text-center">
          <div className="w-20 h-20 mx-auto rounded-2xl bg-blue-100 flex items-center justify-center mb-4">
            <svg className="w-10 h-10 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
              <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
            </svg>
          </div>
          <h3 className="text-lg font-bold text-slate-900 mb-2">
            No hay empleados registrados
          </h3>
          <p className="text-slate-600 mb-4">
            Importa un archivo Excel con las remuneraciones para comenzar
          </p>
          <button
            onClick={() => setShowImporter(true)}
            className="px-6 py-3 rounded-xl font-semibold text-white bg-gradient-to-r from-blue-900 to-blue-700 hover:from-blue-800 hover:to-blue-600 shadow-lg hover:shadow-xl transition-all"
          >
            Importar Excel
          </button>
        </div>
      )}

      {/* Modal de detalle */}
      {showDetailModal && selectedEmployee && (
        <EmployeeDetailModal
          employee={selectedEmployee}
          monthlyData={selectedEmployee.lines?.[0]}
          year={selectedYear}
          month={selectedMonth}
          onClose={() => {
            setShowDetailModal(false);
            setSelectedEmployee(null);
          }}
          onSave={async () => {
            await loadData();
          }}
        />
      )}
    </div>
  );
}
