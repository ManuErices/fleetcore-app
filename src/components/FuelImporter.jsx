import React, { useState } from "react";
import * as XLSX from 'xlsx';
import { listMachines, upsertFuelLog, listFuelLogsByRange } from "../lib/db";

export default function FuelImporter({ projectId, onImportComplete, setShowImporter }) {
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

      const processed = await processExcelData(jsonData);
      setPreview(processed);
    } catch (err) {
      console.error("Error reading file:", err);
      setError("Error al leer el archivo Excel");
    }
  };

  const processExcelData = async (rows) => {
    const fuelLogs = [];
    const machineKeys = new Set();

    rows.forEach((row, index) => {
      try {
        const proyecto = row['Proyecto'];
        const fecha = row['Fecha'];
        const origen = row['Origen'];
        const codigo = row['Codigo'];
        const patente = row['Patente'];
        const marca = row['Marca'];
        const modelo = row['Modelo'];
        const litrosMaquina = parseFloat(row['Litros Máquina']) || 0;
        const litrosEstanque = parseFloat(row['Litros Estanque']) || 0;
        const kilometraje = row['Kilometraje'];
        const horometro = row['Horometro'];

        if (!proyecto || !fecha) {
          console.warn(`Fila ${index + 2}: Falta proyecto o fecha`);
          return;
        }

        const litros = litrosMaquina || litrosEstanque || 0;

        if (litros === 0) {
          console.warn(`Fila ${index + 2}: Sin litros registrados`);
          return;
        }

        let machineKey;
        if (codigo) {
          machineKey = codigo.trim().toUpperCase();
        } else if (patente) {
          machineKey = patente.trim().toUpperCase();
        } else {
          const nombre = marca && modelo ? `${marca} ${modelo}`.trim().toUpperCase() : null;
          if (nombre) {
            machineKey = nombre;
          } else {
            console.warn(`Fila ${index + 2}: No se pudo identificar la máquina`);
            return;
          }
        }

        machineKeys.add(machineKey);

        fuelLogs.push({
          machineKey,
          codigo: codigo || '',
          patente: patente || '',
          nombre: marca && modelo ? `${marca} ${modelo}` : '',
          date: formatDate(fecha),
          liters: litros,
          origin: origen || '',
          kilometraje: kilometraje || null,
          horometro: horometro || null
        });
      } catch (err) {
        console.error(`Error processing row ${index + 2}:`, err);
      }
    });

    return {
      fuelLogs,
      machineKeys: Array.from(machineKeys),
      totalRows: rows.length
    };
  };

  const formatDate = (excelDate) => {
    if (!excelDate) return null;
    
    if (typeof excelDate === 'string') {
      const parts = excelDate.split('-');
      if (parts.length === 3) {
        return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
      }
    }
    
    if (typeof excelDate === 'number') {
      const date = new Date((excelDate - 25569) * 86400 * 1000);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
    
    if (excelDate instanceof Date) {
      const year = excelDate.getFullYear();
      const month = String(excelDate.getMonth() + 1).padStart(2, '0');
      const day = String(excelDate.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
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
        machinesMatched: 0,
        machinesNotFound: 0,
        logsCreated: 0,
        logsUpdated: 0,
        errors: [],
        notFoundMachines: []
      };

      console.log("🔍 Cargando máquinas existentes...");
      const existingMachines = await listMachines(projectId);
      console.log(`✅ ${existingMachines.length} máquinas encontradas`);

      const machineByCode = {};
      const machineByPatente = {};
      const machineByName = {};

      existingMachines.forEach(machine => {
        if (machine.code) {
          machineByCode[machine.code.trim().toUpperCase()] = machine;
        }
        if (machine.patente) {
          machineByPatente[machine.patente.trim().toUpperCase()] = machine;
        }
        if (machine.name) {
          machineByName[machine.name.trim().toUpperCase()] = machine;
        }
      });

      console.log("🗺️ Máquinas por código:", Object.keys(machineByCode));
      console.log("🗺️ Máquinas por patente:", Object.keys(machineByPatente));
      console.log("🗺️ Máquinas por nombre:", Object.keys(machineByName));

      const machineIdMap = {};

      console.log("🔍 Mapeando recargas a máquinas...");
      console.log("📊 Total de recargas a procesar:", preview.fuelLogs.length);
      
      for (const log of preview.fuelLogs) {
        let machine = null;
        let matchedBy = null;

        if (log.codigo) {
          const key = log.codigo.trim().toUpperCase();
          machine = machineByCode[key];
          if (machine) {
            matchedBy = `código "${log.codigo}"`;
          }
        }

        if (!machine && log.patente) {
          const key = log.patente.trim().toUpperCase();
          machine = machineByPatente[key];
          if (machine) {
            matchedBy = `patente "${log.patente}"`;
          }
        }

        if (!machine && log.nombre) {
          const key = log.nombre.trim().toUpperCase();
          machine = machineByName[key];
          if (machine) {
            matchedBy = `nombre "${log.nombre}"`;
          }
        }

        if (machine) {
          machineIdMap[log.machineKey] = machine.id;
          console.log(`✅ Mapeada por ${matchedBy}`);
        } else {
          console.warn(`❌ No encontrada: ${log.machineKey}`);
          if (!importResults.notFoundMachines.includes(log.machineKey)) {
            importResults.notFoundMachines.push(log.machineKey);
          }
        }
      }

      importResults.machinesMatched = Object.keys(machineIdMap).length;
      importResults.machinesNotFound = importResults.notFoundMachines.length;

      console.log("🔍 Cargando recargas existentes...");
      const dates = preview.fuelLogs.map(l => l.date).filter(Boolean);
      const minDate = dates.length > 0 ? dates.reduce((a, b) => a < b ? a : b) : null;
      const maxDate = dates.length > 0 ? dates.reduce((a, b) => a > b ? a : b) : null;
      
      let existingFuelLogs = [];
      if (minDate && maxDate) {
        existingFuelLogs = await listFuelLogsByRange(projectId, minDate, maxDate);
        console.log(`✅ ${existingFuelLogs.length} recargas existentes`);
      }

      const existingLogMap = {};
      existingFuelLogs.forEach(log => {
        const key = `${log.machineId}-${log.date}`;
        if (existingLogMap[key]) {
          existingLogMap[key].liters += log.liters || 0;
        } else {
          existingLogMap[key] = log;
        }
      });

      console.log("🚀 Importando recargas...");

      for (const log of preview.fuelLogs) {
        try {
          const machineId = machineIdMap[log.machineKey];
          
          if (!machineId) {
            continue;
          }

          const logKey = `${machineId}-${log.date}`;
          const existingLog = existingLogMap[logKey];

          const fuelLogData = {
            projectId: projectId,
            machineId: machineId,
            date: log.date,
            liters: log.liters || 0,
            origin: log.origin || '',
            kilometraje: log.kilometraje,
            horometro: log.horometro
          };

          if (existingLog) {
            fuelLogData.id = existingLog.id;
            fuelLogData.liters = (existingLog.liters || 0) + (log.liters || 0);
            await upsertFuelLog(fuelLogData);
            importResults.logsUpdated++;
          } else {
            await upsertFuelLog(fuelLogData);
            importResults.logsCreated++;
          }
        } catch (err) {
          console.error(`❌ Error:`, err);
          importResults.errors.push(`Error: ${err.message}`);
        }
      }

      console.log("🎉 IMPORTACIÓN COMPLETADA");
      console.log(`✅ Equipos mapeados: ${importResults.machinesMatched}`);
      console.log(`🆕 Recargas creadas: ${importResults.logsCreated}`);
      console.log(`🔄 Recargas actualizadas: ${importResults.logsUpdated}`);

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

  return (
    <div className="space-y-6">
      <div className="glass-card rounded-2xl p-6">
        <h3 className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-600 to-orange-600 flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
            </svg>
          </div>
          Importar Cargas de Combustible
        </h3>

        <input
          type="file"
          accept=".xlsx,.xls"
          onChange={handleFileChange}
          className="block w-full text-sm text-slate-600 file:mr-4 file:py-3 file:px-6 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-violet-50 file:text-violet-700 hover:file:bg-violet-100 transition-all cursor-pointer"
          disabled={importing}
        />

        <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-xl">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="text-sm text-amber-800">
              <strong>Formato esperado:</strong>
              <ul className="mt-2 space-y-1 ml-4 list-disc">
                <li>Columnas: Proyecto, Fecha, Origen, Codigo, Patente, Marca, Modelo</li>
                <li>Litros Máquina, Litros Estanque</li>
                <li>Se asociará automáticamente a las máquinas existentes</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {preview && !results && (
        <div className="glass-card rounded-2xl p-6">
          <h3 className="text-lg font-bold text-slate-900 mb-4">Vista Previa</h3>
          
          <div className="grid md:grid-cols-3 gap-4 mb-4">
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
              <div className="text-sm font-semibold text-amber-600">Recargas a Importar</div>
              <div className="text-2xl font-black text-amber-700">{preview.fuelLogs.length}</div>
            </div>
            <div className="p-4 bg-violet-50 border border-violet-200 rounded-xl">
              <div className="text-sm font-semibold text-violet-600">Equipos Involucrados</div>
              <div className="text-2xl font-black text-violet-700">{preview.machineKeys.length}</div>
            </div>
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
              <div className="text-sm font-semibold text-emerald-600">Litros Totales</div>
              <div className="text-2xl font-black text-emerald-700">
                {preview.fuelLogs.reduce((sum, l) => sum + l.liters, 0).toFixed(0)} L
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
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    Importar Recargas
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
          <div className="flex items-center gap-4 p-6 bg-gradient-to-r from-emerald-50 to-teal-50 border-2 border-emerald-200 rounded-2xl animate-fadeIn">
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
                Los datos de combustible se importaron correctamente.
              </p>
            </div>
          </div>

          <div>
            <h4 className="text-lg font-bold text-slate-900 mb-4">📊 Resumen de Importación</h4>
            
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-5 bg-emerald-50 border-2 border-emerald-200 rounded-xl">
                <div className="text-xs font-bold text-emerald-600 uppercase tracking-wider mb-2">Equipos Encontrados</div>
                <div className="text-3xl font-black text-emerald-700">{results.machinesMatched}</div>
              </div>
              
              {results.machinesNotFound > 0 && (
                <div className="p-5 bg-red-50 border-2 border-red-200 rounded-xl">
                  <div className="text-xs font-bold text-red-600 uppercase tracking-wider mb-2">Equipos No Encontrados</div>
                  <div className="text-3xl font-black text-red-700">{results.machinesNotFound}</div>
                </div>
              )}
              
              <div className="p-5 bg-violet-50 border-2 border-violet-200 rounded-xl">
                <div className="text-xs font-bold text-violet-600 uppercase tracking-wider mb-2">Recargas Creadas</div>
                <div className="text-3xl font-black text-violet-700">{results.logsCreated}</div>
              </div>
              
              <div className="p-5 bg-amber-50 border-2 border-amber-200 rounded-xl">
                <div className="text-xs font-bold text-amber-600 uppercase tracking-wider mb-2">Recargas Actualizadas</div>
                <div className="text-3xl font-black text-amber-700">{results.logsUpdated}</div>
              </div>
            </div>
          </div>

          {results.notFoundMachines.length > 0 && (
            <div className="p-5 bg-amber-50 border-2 border-amber-200 rounded-xl">
              <div className="text-sm font-bold text-amber-800 mb-3">
                ⚠️ Equipos no encontrados ({results.notFoundMachines.length})
              </div>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {results.notFoundMachines.map((key, idx) => (
                  <div key={idx} className="text-xs text-amber-800">• {key}</div>
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
                if (setShowImporter) setShowImporter(false);
                if (onImportComplete) onImportComplete();
              }}
              className="flex-1 btn-primary"
            >
              <span className="relative z-10">Ver Recargas Importadas</span>
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
