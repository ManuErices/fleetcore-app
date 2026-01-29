import React, { useState } from "react";
import * as XLSX from 'xlsx';
import { getEmployeeByRut, upsertEmployee, upsertEmployeeMonthlyData, getEmployeeMonthlyData } from "../lib/db";

export default function PayrollImporter({ projectId, onImportComplete }) {
  const [file, setFile] = useState(null);
  const [importing, setImporting] = useState(false);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState(null);
  const [results, setResults] = useState(null);

  const handleFileChange = async (e) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setError(null);
    setResults(null);

    try {
      const data = await selectedFile.arrayBuffer();
      const workbook = XLSX.read(data);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet);

      const processed = processExcelData(jsonData);
      setPreview(processed);
    } catch (err) {
      console.error("Error reading file:", err);
      setError("Error al leer el archivo Excel");
    }
  };

  const processExcelData = (rows) => {
    const employees = [];
    let operadoresCount = 0;
    let gastosGeneralesCount = 0;
    let totalCostoOperadores = 0;
    let totalCostoGastos = 0;

    rows.forEach((row, index) => {
      try {
        const year = row['Año'];
        const month = row['Mes'];
        const rut = row['Rut del Trabajador'];
        const nombre = row['Nombre'];
        const apellidoP = row['Apellido Paterno'];
        const apellidoM = row['Apellido Materno'];
        const cargo = row['Cargo'];
        const gerencia = row['Gerencia'];
        const centroCosto = row['Centro de Costo'];
        
        // Datos de liquidación
        const diasTrabajados = row['Días Trabajados'] || 0;
        const sueldoBase = parseFloat(row['Sueldo Base']) || 0;
        const sueldoBruto = parseFloat(row['Sueldo Bruto']) || 0;
        const descuentosLegales = parseFloat(row['Descuentos Legales']) || 0;
        const otrosDescuentos = parseFloat(row['Otros Descuentos']) || 0;
        const impuestos = parseFloat(row['Impuestos']) || 0;
        const sueldoLiquido = parseFloat(row['Sueldo Liquido']) || 0;
        const aporteEmpresa = parseFloat(row['Aporte Empresa']) || 0;
        const finiquitos = parseFloat(row['Finiquitos']) || 0;
        const totalCosto = parseFloat(row['Total Costo Empresa']) || 0;

        if (!rut || !nombre) {
          console.warn(`Fila ${index + 2}: Falta RUT o nombre`);
          return;
        }

        const nombreCompleto = `${nombre} ${apellidoP || ''} ${apellidoM || ''}`.trim();
        
        // Clasificar: DPTO. DE OPERACIONES = Operadores, resto = Gastos Generales
        const isOperador = gerencia && gerencia.toUpperCase().includes('OPERACIONES');
        const tipo = isOperador ? 'OPERADOR' : 'GASTO_GENERAL';

        if (isOperador) {
          operadoresCount++;
          totalCostoOperadores += totalCosto;
        } else {
          gastosGeneralesCount++;
          totalCostoGastos += totalCosto;
        }

        employees.push({
          year: year || new Date().getFullYear(),
          month: month || new Date().getMonth() + 1,
          rut: rut.trim(),
          nombre: nombreCompleto,
          cargo: cargo || '',
          gerencia: gerencia || '',
          centroCosto: centroCosto || '',
          tipo: tipo,
          
          // Datos de liquidación completos
          diasTrabajados,
          sueldoBase,
          sueldoBruto,
          descuentosLegales,
          otrosDescuentos,
          impuestos,
          sueldoLiquido,
          aporteEmpresa,
          finiquitos,
          totalCosto
        });
      } catch (err) {
        console.error(`Error processing row ${index + 2}:`, err);
      }
    });

    return {
      employees,
      operadoresCount,
      gastosGeneralesCount,
      totalCostoOperadores,
      totalCostoGastos,
      totalRows: rows.length
    };
  };

  const handleImport = async () => {
    if (!preview || !projectId) {
      setError("No hay datos para importar o no hay proyecto seleccionado");
      return;
    }

    setImporting(true);
    setError(null);

    try {
      const importResults = {
        employeesCreated: 0,
        employeesUpdated: 0,
        monthlyDataCreated: 0,
        monthlyDataUpdated: 0,
        operadores: 0,
        gastosGenerales: 0,
        errors: []
      };

      console.log("🚀 Importando empleados...");

      // Agrupar por mes/año para procesar
      const dataByMonth = {};
      preview.employees.forEach(emp => {
        const key = `${emp.year}-${emp.month}`;
        if (!dataByMonth[key]) {
          dataByMonth[key] = [];
        }
        dataByMonth[key].push(emp);
      });

      for (const [monthKey, employees] of Object.entries(dataByMonth)) {
        const [year, month] = monthKey.split('-').map(Number);
        console.log(`\n📅 Procesando ${monthKey}...`);

        for (const emp of employees) {
          try {
            // PASO 1: Buscar o crear empleado (datos base)
            let employee = await getEmployeeByRut(projectId, emp.rut);
            
            if (employee) {
              // Empleado existe - actualizar datos base
              await upsertEmployee({
                id: employee.id,
                projectId: projectId,
                rut: emp.rut,
                nombre: emp.nombre,
                cargo: emp.cargo,
                gerencia: emp.gerencia,
                centroCosto: emp.centroCosto,
                tipo: emp.tipo
              });
              importResults.employeesUpdated++;
              console.log(`  ✅ Empleado actualizado: ${emp.nombre}`);
            } else {
              // Empleado nuevo - crear
              const newEmployeeId = await upsertEmployee({
                projectId: projectId,
                rut: emp.rut,
                nombre: emp.nombre,
                cargo: emp.cargo,
                gerencia: emp.gerencia,
                centroCosto: emp.centroCosto,
                tipo: emp.tipo
              });
              employee = { id: newEmployeeId };
              importResults.employeesCreated++;
              console.log(`  🆕 Empleado creado: ${emp.nombre}`);
            }

            // PASO 2: Crear/actualizar datos mensuales CON TODOS LOS CAMPOS
            const existingMonthlyData = await getEmployeeMonthlyData(employee.id, year, month);
            
            const monthlyDataPayload = {
              projectId: projectId,
              employeeId: employee.id,
              year: year,
              month: month,
              
              // Haberes
              diasTrabajados: emp.diasTrabajados,
              sueldoBase: emp.sueldoBase,
              sueldoBruto: emp.sueldoBruto,
              
              // Descuentos
              descuentosLegales: emp.descuentosLegales,
              otrosDescuentos: emp.otrosDescuentos,
              impuestos: emp.impuestos,
              
              // Líquido y totales
              sueldoLiquido: emp.sueldoLiquido,
              aporteEmpresa: emp.aporteEmpresa,
              finiquitos: emp.finiquitos,
              totalCosto: emp.totalCosto
            };
            
            if (existingMonthlyData) {
              // Actualizar datos del mes
              monthlyDataPayload.id = existingMonthlyData.id;
              await upsertEmployeeMonthlyData(monthlyDataPayload);
              importResults.monthlyDataUpdated++;
              console.log(`    📅 Datos mensuales actualizados: ${year}-${month}`);
            } else {
              // Crear datos del mes
              await upsertEmployeeMonthlyData(monthlyDataPayload);
              importResults.monthlyDataCreated++;
              console.log(`    📅 Datos mensuales creados: ${year}-${month}`);
            }

            if (emp.tipo === 'OPERADOR') {
              importResults.operadores++;
            } else {
              importResults.gastosGenerales++;
            }

          } catch (err) {
            console.error(`❌ Error:`, err);
            importResults.errors.push(`${emp.nombre}: ${err.message}`);
          }
        }
      }

      console.log("🎉 IMPORTACIÓN COMPLETADA");
      console.log(`✅ Empleados creados: ${importResults.employeesCreated}`);
      console.log(`✅ Empleados actualizados: ${importResults.employeesUpdated}`);
      console.log(`📅 Datos mensuales creados: ${importResults.monthlyDataCreated}`);
      console.log(`📅 Datos mensuales actualizados: ${importResults.monthlyDataUpdated}`);

      setResults(importResults);
      
      if (onImportComplete) {
        onImportComplete();
      }
    } catch (err) {
      console.error("Error general:", err);
      setError(err.message);
    } finally {
      setImporting(false);
    }
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('es-CL', {
      style: 'currency',
      currency: 'CLP',
      minimumFractionDigits: 0
    }).format(value);
  };

  return (
    <div className="space-y-6">
      <div className="glass-card rounded-2xl p-6">
        <h3 className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
              <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
            </svg>
          </div>
          Importar Remuneraciones
        </h3>

        <input
          type="file"
          accept=".xlsx,.xls"
          onChange={handleFileChange}
          className="block w-full text-sm text-slate-600 file:mr-4 file:py-3 file:px-6 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 transition-all cursor-pointer"
          disabled={importing}
        />

        <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-xl">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="text-sm text-blue-800">
              <strong>Formato esperado:</strong>
              <ul className="mt-2 space-y-1 ml-4 list-disc">
                <li>Columnas: Año, Mes, RUT, Nombre, Apellidos, Cargo</li>
                <li>Liquidación: Sueldo Base, Sueldo Bruto, Descuentos, Impuestos</li>
                <li>Costos: Aporte Empresa, Total Costo Empresa</li>
                <li><strong>DPTO. DE OPERACIONES</strong> = Operadores asignables</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {preview && !results && (
        <div className="glass-card rounded-2xl p-6">
          <h3 className="text-lg font-bold text-slate-900 mb-4">Vista Previa</h3>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
              <div className="text-sm font-semibold text-blue-600">Total Empleados</div>
              <div className="text-2xl font-black text-blue-700">{preview.employees.length}</div>
            </div>
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
              <div className="text-sm font-semibold text-emerald-600">Operadores</div>
              <div className="text-2xl font-black text-emerald-700">{preview.operadoresCount}</div>
              <div className="text-xs text-emerald-600 mt-1">{formatCurrency(preview.totalCostoOperadores)}</div>
            </div>
            <div className="p-4 bg-violet-50 border border-violet-200 rounded-xl">
              <div className="text-sm font-semibold text-violet-600">Gastos Generales</div>
              <div className="text-2xl font-black text-violet-700">{preview.gastosGeneralesCount}</div>
              <div className="text-xs text-violet-600 mt-1">{formatCurrency(preview.totalCostoGastos)}</div>
            </div>
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
              <div className="text-sm font-semibold text-amber-600">Costo Total</div>
              <div className="text-xl font-black text-amber-700">
                {formatCurrency(preview.totalCostoOperadores + preview.totalCostoGastos)}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleImport}
              disabled={importing}
              className="btn-primary flex items-center gap-2"
            >
              <span className="relative z-10 flex items-center gap-2">
                {importing ? (
                  <>
                    <div className="spinner w-4 h-4 border-white" />
                    Importando...
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Importar Empleados
                  </>
                )}
              </span>
            </button>
            <button
              onClick={() => {
                setFile(null);
                setPreview(null);
                setError(null);
              }}
              disabled={importing}
              className="px-6 py-3 rounded-xl font-semibold text-slate-700 bg-white border-2 border-slate-200 hover:bg-slate-50 transition-all"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {results && (
        <div className="glass-card rounded-2xl p-6 space-y-6">
          <div className="flex items-center gap-4 p-6 bg-gradient-to-r from-emerald-50 to-teal-50 border-2 border-emerald-200 rounded-2xl">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-600 flex items-center justify-center flex-shrink-0 shadow-lg">
              <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="text-xl font-black text-emerald-900">
                ✅ Importación Exitosa
              </h3>
              <p className="text-emerald-700 mt-1 font-semibold">
                Los datos de remuneraciones se importaron correctamente con todos los detalles de liquidación.
              </p>
            </div>
          </div>

          <div>
            <h4 className="text-lg font-bold text-slate-900 mb-4">📊 Resumen de Importación</h4>
            
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-5 bg-blue-50 border-2 border-blue-200 rounded-xl">
                <div className="text-xs font-bold text-blue-600 uppercase tracking-wider mb-2">Empleados Nuevos</div>
                <div className="text-3xl font-black text-blue-700">{results.employeesCreated}</div>
              </div>
              
              <div className="p-5 bg-teal-50 border-2 border-teal-200 rounded-xl">
                <div className="text-xs font-bold text-teal-600 uppercase tracking-wider mb-2">Empleados Actualizados</div>
                <div className="text-3xl font-black text-teal-700">{results.employeesUpdated}</div>
              </div>
              
              <div className="p-5 bg-emerald-50 border-2 border-emerald-200 rounded-xl">
                <div className="text-xs font-bold text-emerald-600 uppercase tracking-wider mb-2">Datos Mensuales Nuevos</div>
                <div className="text-3xl font-black text-emerald-700">{results.monthlyDataCreated}</div>
              </div>
              
              <div className="p-5 bg-violet-50 border-2 border-violet-200 rounded-xl">
                <div className="text-xs font-bold text-violet-600 uppercase tracking-wider mb-2">Datos Actualizados</div>
                <div className="text-3xl font-black text-violet-700">{results.monthlyDataUpdated}</div>
              </div>
            </div>
          </div>

          <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
            <div className="text-sm font-semibold text-blue-700">
              ℹ️ Los empleados se mantienen para otros meses con 0 días trabajados. Todos los datos de liquidación están disponibles para consulta y edición.
            </div>
          </div>

          {results.errors.length > 0 && (
            <div className="p-5 bg-red-50 border-2 border-red-200 rounded-xl">
              <div className="text-sm font-bold text-red-800 mb-3">
                ❌ Errores encontrados ({results.errors.length})
              </div>
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {results.errors.map((error, idx) => (
                  <div key={idx} className="text-xs text-red-800">• {error}</div>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center gap-3 pt-4 border-t border-slate-200">
            <button
              onClick={() => {
                setFile(null);
                setPreview(null);
                setResults(null);
                setError(null);
              }}
              className="flex-1 px-6 py-3 rounded-xl font-bold text-slate-700 bg-white border-2 border-slate-300 hover:bg-slate-50 transition-all"
            >
              Nueva Importación
            </button>
            <button
              onClick={() => {
                if (onImportComplete) onImportComplete();
              }}
              className="flex-1 btn-primary"
            >
              <span className="relative z-10">Ver Empleados Importados</span>
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700">
          {error}
        </div>
      )}
    </div>
  );
}
