import React, { useState } from "react";
import * as XLSX from 'xlsx';
import { upsertMachine, upsertDailyLog } from "../lib/db";

export default function ExcelImporter({ projectId, onImportComplete }) {
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
      // Leer el archivo
      const data = await selectedFile.arrayBuffer();
      const workbook = XLSX.read(data);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet);

      // Procesar y previsualizar datos
      const processed = processExcelData(jsonData);
      setPreview(processed);
    } catch (err) {
      console.error("Error reading file:", err);
      setError("Error al leer el archivo Excel");
    }
  };

  const processExcelData = (rows) => {
    const machines = new Map();
    const logs = [];

    rows.forEach((row, index) => {
      try {
        // Extraer datos de las columnas destacadas
        const proyecto = row['Proyecto'];
        const fecha = row['Fecha'];
        const tipoMaquina = row['Tipo Maquina'];
        const marca = row['Marca'];
        const modelo = row['Modelo'];
        const codigo = row['Codigo'];
        const patente = row['Patente'];
        const kmInicial = parseFloat(row['Kilometraje Inicial']) || 0;
        const kmFinal = parseFloat(row['Kilometraje Final']) || 0;
        const horometroInicial = parseFloat(row['Horometro Inicial']) || 0;
        const horometroFinal = parseFloat(row['Horometro Final']) || 0;
        const actividadesRealizadas = row['Actividades Realizadas'];

        // Validar datos mínimos
        if (!proyecto || !fecha) {
          console.warn(`Fila ${index + 2}: Falta proyecto o fecha`);
          return;
        }

        // Calcular valores
        const kilometraje = kmFinal - kmInicial;
        const horasMaquina = horometroFinal - horometroInicial;
        const nombre = marca && modelo ? `${marca} ${modelo}` : (marca || modelo || 'Sin nombre');
        
        // Generar clave única para el Map usando prioridad
        // Para la clave del Map: Codigo > Patente > Marca+Modelo
        let machineKey;
        if (codigo) {
          machineKey = codigo;
        } else if (patente) {
          machineKey = patente;
        } else {
          // Si no hay código ni patente, usar marca+modelo como clave temporal
          machineKey = `${marca || 'SIN'}_${modelo || 'MARCA'}_${index}`;
        }

        // Crear/actualizar máquina (usar clave única para el Map)
        if (!machines.has(machineKey)) {
          machines.set(machineKey, {
            code: codigo || "",  // DEJAR EN BLANCO SI NO EXISTE
            name: nombre,
            type: tipoMaquina || '',
            patente: patente || '',
            marca: marca || '',
            modelo: modelo || ''
          });
        }

        // ============================================
        // NUEVA LÓGICA: Clasificar el tipo de día
        // ============================================
        
        let productiveHours = 0;
        let standbyHours = 0;
        let downtimeHours = 0;
        
        // Normalizar actividades para análisis
        const actividadesUpper = (actividadesRealizadas || '').toUpperCase();
        
        // 1. FUERA DE SERVICIO = Downtime (equipo no disponible)
        const fueraDeServicio = 
          actividadesUpper.includes('FUERA DE SERVICIO') ||
          actividadesUpper.includes('FUERA SERVICIO') ||
          actividadesUpper.includes('MANTENIMIENTO') ||
          actividadesUpper.includes('REPARACION') ||
          actividadesUpper.includes('REPARACIÓN') ||
          actividadesUpper.includes('TALLER') ||
          actividadesUpper.includes('AVERIA') ||
          actividadesUpper.includes('AVERÍA');
        
        // 2. DISPONIBLE SIN USO = Standby (equipo disponible pero no trabajó)
        const enStandby = 
          actividadesUpper.includes('DISPONIBLE') ||
          actividadesUpper.includes('SIN OPERADOR') ||
          actividadesUpper.includes('STANDBY') ||
          actividadesUpper.includes('ESPERA') ||
          actividadesUpper.includes('EN PROYECTO') ||
          actividadesUpper.includes('ASIGNADO');
        
        // Clasificar el día
        if (fueraDeServicio) {
          // Equipo fuera de servicio = Downtime completo
          downtimeHours = 24;
          console.log(`⚠️ Fila ${index + 2}: ${codigo || patente || nombre} - FUERA DE SERVICIO`);
          
        } else if (horasMaquina > 0 || kilometraje > 0) {
          // Trabajó = Horas productivas
          productiveHours = horasMaquina;
          console.log(`✅ Fila ${index + 2}: ${codigo || patente || nombre} - TRABAJÓ ${horasMaquina}h`);
          
        } else if (enStandby) {
          // Disponible sin uso = Standby
          standbyHours = 24;
          console.log(`🟡 Fila ${index + 2}: ${codigo || patente || nombre} - STANDBY (${actividadesRealizadas})`);
          
        } else if (actividadesRealizadas && actividadesRealizadas.trim() !== '') {
          // Tiene alguna actividad pero no está en categorías conocidas = Standby por defecto
          standbyHours = 24;
          console.log(`🟠 Fila ${index + 2}: ${codigo || patente || nombre} - OTRO ESTADO (${actividadesRealizadas})`);
          
        } else {
          // Sin actividad registrada = Standby
          standbyHours = 24;
          console.log(`⚪ Fila ${index + 2}: ${codigo || patente || nombre} - SIN ACTIVIDAD`);
        }

        // SIEMPRE crear el log si hay fecha y proyecto
        logs.push({
          machineKey: machineKey,
          date: formatDate(fecha),
          productiveHours: productiveHours,
          standbyHours: standbyHours,
          downtimeHours: downtimeHours,
          kilometraje: kilometraje,
          actividades: actividadesRealizadas || '',
          fueraDeServicio: fueraDeServicio
        });
        
      } catch (err) {
        console.error(`Error processing row ${index + 2}:`, err);
      }
    });

    console.log(`\n📊 RESUMEN DE IMPORTACIÓN:`);
    console.log(`   Total filas procesadas: ${rows.length}`);
    console.log(`   Logs creados: ${logs.length}`);
    console.log(`   Máquinas únicas: ${machines.size}`);

    return {
      machines: machines,  // Retornar el Map completo, no solo los valores
      logs: logs,
      totalRows: rows.length
    };
  };

  const formatDate = (excelDate) => {
    if (!excelDate) return null;
    
    // Si ya es un objeto Date
    if (excelDate instanceof Date) {
      return excelDate.toISOString().split('T')[0];
    }
    
    // Si es un número de Excel (días desde 1900-01-01)
    if (typeof excelDate === 'number') {
      const date = new Date((excelDate - 25569) * 86400 * 1000);
      return date.toISOString().split('T')[0];
    }
    
    // Si es un string, intentar parsearlo
    if (typeof excelDate === 'string') {
      const date = new Date(excelDate);
      if (!isNaN(date)) {
        return date.toISOString().split('T')[0];
      }
    }
    
    return null;
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
        machinesCreated: 0,
        machinesUpdated: 0,
        logsCreated: 0,
        logsUpdated: 0,
        errors: []
      };

      // Crear un mapa para almacenar los IDs de las máquinas creadas
      const machineIdMap = {};

      // 🔍 PASO 1: Cargar TODAS las máquinas existentes del proyecto
      console.log("🔍 Cargando máquinas existentes del proyecto...");
      const { listMachines } = await import("../lib/db");
      const existingMachines = await listMachines(projectId);
      console.log(`✅ ${existingMachines.length} máquinas existentes encontradas`);

      // Crear un mapa de máquinas existentes por código y nombre
      const existingByCode = {};
      const existingByName = {};
      
      existingMachines.forEach(machine => {
        if (machine.code) {
          existingByCode[machine.code.trim().toUpperCase()] = machine;
        }
        if (machine.name) {
          existingByName[machine.name.trim().toUpperCase()] = machine;
        }
      });

      console.log("🗺️ Máquinas por código:", Object.keys(existingByCode));
      console.log("🗺️ Máquinas por nombre:", Object.keys(existingByName));

      // 🚀 PASO 2: Procesar máquinas del Excel
      console.log("🚀 Procesando máquinas del Excel...");
      
      // Convertir el Map a array para iterar
      const machinesArray = Array.from(preview.machines.entries());
      
      for (const [machineKey, machine] of machinesArray) {
        try {
          let existingMachine = null;
          let matchedBy = null;

          // Buscar por código (prioridad 1)
          if (machine.code) {
            const codeKey = machine.code.trim().toUpperCase();
            existingMachine = existingByCode[codeKey];
            if (existingMachine) matchedBy = `código "${machine.code}"`;
          }

          // Si no se encontró por código, buscar por nombre (prioridad 2)
          if (!existingMachine && machine.name) {
            const nameKey = machine.name.trim().toUpperCase();
            existingMachine = existingByName[nameKey];
            if (existingMachine) matchedBy = `nombre "${machine.name}"`;
          }

          if (existingMachine) {
            // ✅ Máquina YA EXISTE - usar su ID
            machineIdMap[machineKey] = existingMachine.id;
            importResults.machinesUpdated++;
            console.log(`✅ Máquina encontrada por ${matchedBy}: ${existingMachine.name} (ID: ${existingMachine.id})`);
          } else {
            // 🆕 Máquina NUEVA - crearla
            const machineData = {
              projectId: projectId,
              code: machine.code || "",
              name: machine.name,
              type: machine.type || "",
              marca: machine.marca || "",
              modelo: machine.modelo || "",
              patente: machine.patente || "",
              ownership: "RENTED",
              billingType: "hourly",
              minimumMonthlyHours: 180,
              internalRateProductive: 0,
              internalRateStandby: 0,
              clientRateProductive: 0,
              clientRateStandby: 0,
              internalRatePerDay: 0,
              clientRatePerDay: 0,
              internalRateMonthly: 0,
              clientRateMonthly: 0,
              active: true
            };
            
            // Guardar en Firebase
            const machineId = await upsertMachine(machineData);
            machineIdMap[machineKey] = machineId;
            importResults.machinesCreated++;
            console.log(`🆕 Máquina creada: ${machine.code || machine.name || 'SIN CÓDIGO'} (ID: ${machineId})`);
            
            // Agregar al mapa de existentes para evitar duplicados en este mismo import
            if (machine.code) {
              existingByCode[machine.code.trim().toUpperCase()] = { id: machineId, ...machineData };
            }
            if (machine.name) {
              existingByName[machine.name.trim().toUpperCase()] = { id: machineId, ...machineData };
            }
          }
        } catch (err) {
          console.error(`❌ Error procesando máquina ${machine.code || machine.name}:`, err);
          importResults.errors.push(`Error procesando máquina ${machine.code || machine.name}: ${err.message}`);
        }
      }

      // 🚀 PASO 3: Cargar logs existentes del proyecto
      console.log("🔍 Cargando logs existentes del proyecto...");
      const { listLogsByRange } = await import("../lib/db");
      
      // Obtener rango de fechas de los logs a importar
      const dates = preview.logs.map(l => l.date).filter(Boolean);
      const minDate = dates.length > 0 ? dates.reduce((a, b) => a < b ? a : b) : null;
      const maxDate = dates.length > 0 ? dates.reduce((a, b) => a > b ? a : b) : null;
      
      let existingLogs = [];
      if (minDate && maxDate) {
        existingLogs = await listLogsByRange(projectId, minDate, maxDate);
        console.log(`✅ ${existingLogs.length} logs existentes encontrados en rango ${minDate} a ${maxDate}`);
      }

      // Crear mapa de logs existentes: "machineId-date" -> log
      const existingLogMap = {};
      existingLogs.forEach(log => {
        const key = `${log.machineId}-${log.date}`;
        existingLogMap[key] = log;
      });

      // 🚀 PASO 4: Importar/actualizar logs
      console.log("🚀 Procesando logs del Excel...");
      console.log("📊 Total de logs a procesar:", preview.logs.length);
      
      for (const log of preview.logs) {
        try {
          console.log(`📝 Procesando log: ${log.machineKey} - ${log.date} - ${log.productiveHours}h - ${log.kilometraje}km`);
          
          // Obtener el ID de la máquina
          const machineId = machineIdMap[log.machineKey];
          
          if (!machineId) {
            console.error(`❌ No se encontró ID para máquina "${log.machineKey}"`);
            importResults.errors.push(`No se encontró máquina con clave ${log.machineKey}`);
            continue;
          }

          // Procesar logs con horas > 0 O kilometraje > 0 (para vehículos que solo registran KM)
          if (!log.fueraDeServicio && (log.productiveHours > 0 || log.kilometraje > 0)) {
            // Verificar si ya existe un log para esta máquina en esta fecha
            const logKey = `${machineId}-${log.date}`;
            const existingLog = existingLogMap[logKey];

            const logData = {
              projectId: projectId,
              machineId: machineId,
              date: log.date,
              productiveHours: log.productiveHours || 0,
              standbyHours: log.standbyHours || 0,
              downtimeHours: log.downtimeHours || 0,
              kilometraje: log.kilometraje || 0,
              notes: log.actividades || ""
            };

            console.log(`   📋 Datos a guardar:`, {
              date: logData.date,
              hours: logData.productiveHours,
              km: logData.kilometraje,
              notes: logData.notes?.substring(0, 30) + '...'
            });

            if (existingLog) {
              // ✅ Log YA EXISTE - actualizarlo
              logData.id = existingLog.id;
              console.log(`   🔄 Actualizando log existente (ID: ${existingLog.id})`);
              console.log(`      Antes: ${existingLog.productiveHours}h, ${existingLog.kilometraje || 0}km`);
              console.log(`      Ahora: ${logData.productiveHours}h, ${logData.kilometraje}km`);
              await upsertDailyLog(logData);
              importResults.logsUpdated++;
              console.log(`   ✅ Log actualizado exitosamente`);
            } else {
              // 🆕 Log NUEVO - crearlo
              console.log(`   💾 Creando nuevo log: ${logData.productiveHours}h, ${logData.kilometraje}km`);
              await upsertDailyLog(logData);
              importResults.logsCreated++;
              console.log(`   ✅ Log creado exitosamente`);
            }
          } else if (log.fueraDeServicio) {
            console.log(`   ⏭️ Saltando log - Fuera de servicio`);
          } else if (log.productiveHours <= 0) {
            console.log(`   ⏭️ Saltando log - Sin horas productivas (${log.productiveHours}h)`);
          }
        } catch (err) {
          console.error(`❌ Error procesando log:`, err);
          importResults.errors.push(`Error procesando log para ${log.machineKey} (${log.date}): ${err.message}`);
        }
      }

      console.log("✅ Importación completada:", importResults);
      setResults(importResults);
      
      if (onImportComplete) {
        onImportComplete(importResults);
      }
    } catch (err) {
      console.error("❌ Error general durante la importación:", err);
      setError("Error durante la importación: " + err.message);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="glass-card rounded-2xl p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-600 to-teal-600 flex items-center justify-center">
          <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
        </div>
        <div>
          <h2 className="text-xl font-bold text-slate-900">Importación Masiva desde Excel</h2>
          <p className="text-sm text-slate-600">Carga equipos y registros desde tu reporte de proyecto</p>
        </div>
      </div>

      {/* Selector de archivo */}
      <div className="mb-6">
        <label className="block text-sm font-semibold text-slate-700 mb-2">
          Archivo Excel (.xlsx, .xls)
        </label>
        <input
          type="file"
          accept=".xlsx,.xls"
          onChange={handleFileChange}
          className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-violet-50 file:text-violet-700 hover:file:bg-violet-100 cursor-pointer"
          disabled={importing}
        />
        
        {/* Instrucciones */}
        <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-xl">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="text-sm text-blue-800">
              <strong>Formato esperado:</strong>
              <ul className="mt-2 space-y-1 ml-4 list-disc">
                <li>Columnas: Proyecto, Fecha, Tipo Maquina, Marca, Modelo, Codigo, Patente</li>
                <li>Kilometraje Inicial/Final, Horometro Inicial/Final</li>
                <li>Actividades Realizadas (para clasificar el estado del equipo)</li>
              </ul>
              <div className="mt-3 p-3 bg-white rounded-lg border border-blue-200">
                <strong>Clasificación automática:</strong>
                <ul className="mt-2 space-y-1 ml-4 list-none text-xs">
                  <li>✅ <strong>Productivo:</strong> Si tiene horas trabajadas (Horómetro Final &gt; Inicial)</li>
                  <li>🟡 <strong>Standby:</strong> Si está "Disponible", "Sin operador" pero sin horas</li>
                  <li>🔴 <strong>Downtime:</strong> Si está "Fuera de servicio", "Mantenimiento", "Taller"</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Preview de datos */}
      {preview && !results && (
        <div className="mb-6">
          <h3 className="text-lg font-bold text-slate-900 mb-4">Vista Previa</h3>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
              <div className="text-sm font-semibold text-emerald-600">Equipos Únicos</div>
              <div className="text-2xl font-black text-emerald-700">{preview.machines.size}</div>
            </div>
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
              <div className="text-sm font-semibold text-blue-600">Días Productivos</div>
              <div className="text-2xl font-black text-blue-700">
                {preview.logs.filter(l => l.productiveHours > 0).length}
              </div>
            </div>
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
              <div className="text-sm font-semibold text-amber-600">Días Standby</div>
              <div className="text-2xl font-black text-amber-700">
                {preview.logs.filter(l => l.standbyHours > 0).length}
              </div>
            </div>
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl">
              <div className="text-sm font-semibold text-red-600">Días Downtime</div>
              <div className="text-2xl font-black text-red-700">
                {preview.logs.filter(l => l.downtimeHours > 0).length}
              </div>
            </div>
          </div>

          <div className="p-4 bg-violet-50 border border-violet-200 rounded-xl mb-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-violet-600">Total Registros</div>
                <div className="text-2xl font-black text-violet-700">{preview.logs.length}</div>
              </div>
              <div className="text-right text-sm text-violet-600">
                <div>✅ {preview.logs.filter(l => l.productiveHours > 0).length} trabajando</div>
                <div>🟡 {preview.logs.filter(l => l.standbyHours > 0).length} disponibles sin uso</div>
                <div>🔴 {preview.logs.filter(l => l.downtimeHours > 0).length} fuera de servicio</div>
              </div>
            </div>
          </div>

          {/* Muestra de equipos */}
          <div className="mb-4">
            <h4 className="text-sm font-bold text-slate-700 mb-2">Equipos a Importar (primeros 5)</h4>
            <div className="bg-slate-50 rounded-xl p-4 max-h-60 overflow-y-auto">
              {Array.from(preview.machines.values()).slice(0, 5).map((machine, idx) => (
                <div key={idx} className="flex items-center gap-3 py-2 border-b border-slate-200 last:border-0">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-slate-600 to-slate-800 flex items-center justify-center text-white text-xs font-bold">
                    {machine.code?.substring(0, 2) || machine.patente?.substring(0, 2) || 'SC'}
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-slate-900">{machine.code || '(Sin código)'}</div>
                    <div className="text-xs text-slate-500">{machine.name}</div>
                  </div>
                  <div className="text-xs text-slate-600">
                    {machine.type}
                  </div>
                </div>
              ))}
              {preview.machines.size > 5 && (
                <div className="text-xs text-slate-500 text-center pt-2">
                  Y {preview.machines.size - 5} más...
                </div>
              )}
            </div>
          </div>

          {/* Botones de acción */}
          <div className="flex gap-3">
            <button
              onClick={handleImport}
              disabled={importing}
              className="btn-primary flex-1"
            >
              <span className="relative z-10 flex items-center justify-center gap-2">
                {importing ? (
                  <>
                    <div className="spinner w-4 h-4 border-white" />
                    Importando...
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Importar {preview.machines.size} equipos y {preview.logs.filter(l => !l.fueraDeServicio).length} registros
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

      {/* Resultados */}
      {results && (
        <div className="mb-6">
          <h3 className="text-lg font-bold text-slate-900 mb-4">Resultados de la Importación</h3>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
              <div className="text-xs font-semibold text-emerald-600 uppercase tracking-wider">Equipos Creados</div>
              <div className="text-2xl font-black text-emerald-700">{results.machinesCreated}</div>
            </div>
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
              <div className="text-xs font-semibold text-blue-600 uppercase tracking-wider">Equipos Encontrados</div>
              <div className="text-2xl font-black text-blue-700">{results.machinesUpdated}</div>
            </div>
            <div className="p-4 bg-violet-50 border border-violet-200 rounded-xl">
              <div className="text-xs font-semibold text-violet-600 uppercase tracking-wider">Registros Creados</div>
              <div className="text-2xl font-black text-violet-700">{results.logsCreated}</div>
            </div>
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
              <div className="text-xs font-semibold text-amber-600 uppercase tracking-wider">Registros Actualizados</div>
              <div className="text-2xl font-black text-amber-700">{results.logsUpdated}</div>
            </div>
          </div>

          {results.errors.length > 0 && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl">
              <div className="text-sm font-semibold text-red-700 mb-2">⚠️ Errores encontrados ({results.errors.length})</div>
              <ul className="text-xs text-red-600 space-y-1 max-h-40 overflow-y-auto">
                {results.errors.map((error, idx) => (
                  <li key={idx}>• {error}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex items-center gap-2 p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
            <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span className="text-sm font-semibold text-emerald-700">
              Importación completada exitosamente
            </span>
          </div>

          <button
            onClick={() => {
              setFile(null);
              setPreview(null);
              setResults(null);
              setError(null);
            }}
            className="mt-4 w-full px-6 py-3 rounded-xl font-semibold text-slate-700 bg-white border-2 border-slate-200 hover:bg-slate-50 transition-all"
          >
            Importar Otro Archivo
          </button>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl">
          <div className="flex items-center gap-2 text-red-700 text-sm font-medium">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" />
            </svg>
            {error}
          </div>
        </div>
      )}
    </div>
  );
}
