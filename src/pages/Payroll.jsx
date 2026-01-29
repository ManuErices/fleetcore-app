import React, { useEffect, useState } from "react";
import { listActiveProjects, listEmployees, listMachines, listEmployeeMonthlyData, upsertEmployeeMonthlyData, upsertEmployeeAssignment, getEmployeeAssignment } from "../lib/db";
import PayrollImporter from "../components/PayrollImporter";
import EmployeeDetailModal from "../components/EmployeeDetailModal";

export default function Payroll() {
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState("");
  const [employees, setEmployees] = useState([]);
  const [monthlyData, setMonthlyData] = useState([]);
  const [machines, setMachines] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showImporter, setShowImporter] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [editingCell, setEditingCell] = useState(null);
  
  // Modal
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

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
      }
    })();
  }, []);

  const loadData = async () => {
    if (!selectedProject) return;
    
    setIsLoading(true);
    try {
      const [emp, mach, monthly] = await Promise.all([
        listEmployees(selectedProject),
        listMachines(selectedProject),
        listEmployeeMonthlyData(selectedProject, selectedYear, selectedMonth)
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

  // Combinar empleados con sus datos mensuales
  const employeesWithMonthlyData = React.useMemo(() => {
    return employees.map(emp => {
      const monthly = monthlyData.find(m => m.employeeId === emp.id) || {
        diasTrabajados: 0,
        sueldoBase: 0,
        sueldoBruto: 0,
        descuentosLegales: 0,
        otrosDescuentos: 0,
        impuestos: 0,
        sueldoLiquido: 0,
        aporteEmpresa: 0,
        finiquitos: 0,
        totalCosto: 0
      };
      
      return {
        ...emp,
        diasTrabajados: monthly.diasTrabajados || 0,
        sueldoBase: monthly.sueldoBase || 0,
        sueldoBruto: monthly.sueldoBruto || 0,
        descuentosLegales: monthly.descuentosLegales || 0,
        otrosDescuentos: monthly.otrosDescuentos || 0,
        impuestos: monthly.impuestos || 0,
        sueldoLiquido: monthly.sueldoLiquido || 0,
        aporteEmpresa: monthly.aporteEmpresa || 0,
        finiquitos: monthly.finiquitos || 0,
        totalCosto: monthly.totalCosto || 0,
        monthlyDataId: monthly.id || null
      };
    });
  }, [employees, monthlyData]);

  const handleAssignMachine = async (employeeId, machineId) => {
    try {
      const existing = await getEmployeeAssignment(employeeId, selectedYear, selectedMonth);
      
      if (existing) {
        await upsertEmployeeAssignment({
          id: existing.id,
          projectId: selectedProject,
          employeeId: employeeId,
          machineId: machineId || null,
          year: selectedYear,
          month: selectedMonth
        });
      } else {
        await upsertEmployeeAssignment({
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

  const handleUpdateMonthlyData = async (employeeId, field, value) => {
    try {
      const employee = employeesWithMonthlyData.find(e => e.id === employeeId);
      if (!employee) return;

      const monthlyDataToSave = {
        projectId: selectedProject,
        employeeId: employeeId,
        year: selectedYear,
        month: selectedMonth,
        diasTrabajados: employee.diasTrabajados,
        sueldoBase: employee.sueldoBase,
        sueldoBruto: employee.sueldoBruto,
        descuentosLegales: employee.descuentosLegales,
        otrosDescuentos: employee.otrosDescuentos,
        impuestos: employee.impuestos,
        sueldoLiquido: employee.sueldoLiquido,
        aporteEmpresa: employee.aporteEmpresa,
        finiquitos: employee.finiquitos,
        totalCosto: employee.totalCosto,
        [field]: parseFloat(value) || 0
      };

      if (employee.monthlyDataId) {
        monthlyDataToSave.id = employee.monthlyDataId;
      }

      await upsertEmployeeMonthlyData(monthlyDataToSave);
      
      // Recargar datos
      await loadData();
      setEditingCell(null);
    } catch (err) {
      console.error("Error actualizando datos:", err);
      alert("Error al actualizar datos");
    }
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
        const { listEmployeeAssignments } = await import("../lib/db");
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

  const operadores = employeesWithMonthlyData.filter(e => e.tipo === 'OPERADOR');
  const gastosGenerales = employeesWithMonthlyData.filter(e => e.tipo === 'GASTO_GENERAL');
  
  const totalCostoOperadores = operadores.reduce((sum, e) => sum + (e.totalCosto || 0), 0);
  const totalCostoGastos = gastosGenerales.reduce((sum, e) => sum + (e.totalCosto || 0), 0);

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
              projectId={selectedProject}
              onImportComplete={() => {
                setShowImporter(false);
                loadData();
              }}
            />
          </div>
        )}

        {/* Filtros */}
        <div className="flex items-center gap-4">
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
          <div className="text-3xl font-black text-slate-900">{employees.length}</div>
        </div>

        <div className="glass-card rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-600 to-teal-600 flex items-center justify-center shadow-lg">
              <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M6 6V5a3 3 0 013-3h2a3 3 0 013 3v1h2a2 2 0 012 2v3.57A22.952 22.952 0 0110 13a22.95 22.95 0 01-8-1.43V8a2 2 0 012-2h2zm2-1a1 1 0 011-1h2a1 1 0 011 1v1H8V5zm1 5a1 1 0 011-1h.01a1 1 0 110 2H10a1 1 0 01-1-1z" clipRule="evenodd" />
                <path d="M2 13.692V16a2 2 0 002 2h12a2 2 0 002-2v-2.308A24.974 24.974 0 0110 15c-2.796 0-5.487-.46-8-1.308z" />
              </svg>
            </div>
            <div className="text-sm font-bold text-slate-600">Operadores</div>
          </div>
          <div className="text-3xl font-black text-emerald-700">{operadores.length}</div>
          <div className="text-xs text-emerald-600 mt-2">{formatCurrency(totalCostoOperadores)}</div>
        </div>

        <div className="glass-card rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-600 to-red-600 flex items-center justify-center shadow-lg">
              <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M4 4a2 2 0 012-2h8a2 2 0 012 2v12a1 1 0 110 2h-3a1 1 0 01-1-1v-2a1 1 0 00-1-1H9a1 1 0 00-1 1v2a1 1 0 01-1 1H4a1 1 0 110-2V4zm3 1h2v2H7V5zm2 4H7v2h2V9zm2-4h2v2h-2V5zm2 4h-2v2h2V9z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="text-sm font-bold text-slate-600">Gastos Generales</div>
          </div>
          <div className="text-3xl font-black text-orange-700">{gastosGenerales.length}</div>
          <div className="text-xs text-orange-600 mt-2">{formatCurrency(totalCostoGastos)}</div>
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
                  👷 Operadores - Asignación a Equipos
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
                  <th className="text-left px-6 py-4 text-xs font-bold text-slate-600 uppercase">Nombre</th>
                  <th className="text-left px-6 py-4 text-xs font-bold text-slate-600 uppercase">Cargo</th>
                  <th className="text-center px-6 py-4 text-xs font-bold text-slate-600 uppercase">Días</th>
                  <th className="text-right px-6 py-4 text-xs font-bold text-slate-600 uppercase">Costo Total</th>
                  <th className="text-left px-6 py-4 text-xs font-bold text-slate-600 uppercase">Equipo Asignado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {operadores.map(emp => (
                  <tr key={emp.id} className="hover:bg-slate-50">
                    <td className="px-6 py-4">
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
                          <div className="font-semibold text-slate-900 group-hover:text-blue-600 transition-colors">
                            {emp.nombre}
                            <svg className="w-4 h-4 inline-block ml-2 text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                            </svg>
                          </div>
                          <div className="text-xs text-slate-500">{emp.rut}</div>
                        </div>
                      </button>
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
                  💼 Gastos Generales
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
                  <th className="text-left px-6 py-4 text-xs font-bold text-slate-600 uppercase">Nombre</th>
                  <th className="text-left px-6 py-4 text-xs font-bold text-slate-600 uppercase">Cargo</th>
                  <th className="text-left px-6 py-4 text-xs font-bold text-slate-600 uppercase">Departamento</th>
                  <th className="text-center px-6 py-4 text-xs font-bold text-slate-600 uppercase">Días</th>
                  <th className="text-right px-6 py-4 text-xs font-bold text-slate-600 uppercase">Costo Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {gastosGenerales.map(emp => (
                  <tr key={emp.id} className="hover:bg-slate-50">
                    <td className="px-6 py-4">
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
                          <div className="font-semibold text-slate-900 group-hover:text-blue-600 transition-colors">
                            {emp.nombre}
                            <svg className="w-4 h-4 inline-block ml-2 text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                            </svg>
                          </div>
                          <div className="text-xs text-slate-500">{emp.rut}</div>
                        </div>
                      </button>
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
          monthlyData={monthlyData.find(m => m.employeeId === selectedEmployee.id)}
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
