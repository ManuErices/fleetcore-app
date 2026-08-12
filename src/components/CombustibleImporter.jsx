import React, { useState } from "react";
import * as XLSX from 'xlsx';
import { saveCombustibleRegistros } from "../lib/db";

// Normaliza un encabezado: sin tildes, sin espacios extra, en minúsculas
// (este Excel trae encabezados con espacios sueltos, ej. "Cod. / Patente ")
function normalizeHeader(key) {
  return String(key)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ').trim().toLowerCase();
}

function getField(row, ...candidates) {
  const normalizedCandidates = candidates.map(normalizeHeader);
  for (const key of Object.keys(row)) {
    if (normalizedCandidates.includes(normalizeHeader(key))) {
      return row[key];
    }
  }
  return '';
}

function formatDate(value) {
  if (!value) return null;
  if (value instanceof Date) {
    const y = value.getFullYear(), m = String(value.getMonth() + 1).padStart(2, '0'), d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  if (typeof value === 'number') {
    const date = new Date((value - 25569) * 86400 * 1000);
    const y = date.getFullYear(), m = String(date.getMonth() + 1).padStart(2, '0'), d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  if (typeof value === 'string') {
    const parts = value.split('-');
    if (parts.length === 3) return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
  }
  return null;
}

export default function CombustibleImporter({ empresaId, projectId, onImportComplete }) {
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
      const workbook = XLSX.read(data, { type: 'array' });
      const registros = [];

      // El archivo puede traer una o varias hojas (una por camión combustible, ej. "CC46", "CC70")
      workbook.SheetNames.forEach(sheetName => {
        const worksheet = workbook.Sheets[sheetName];
        // El encabezado real está en la fila 3 (índice 2), no en la fila 1
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { range: 2 });

        jsonData.forEach(row => {
          const fechaRaw = getField(row, 'Fecha');
          const fecha = formatDate(fechaRaw);
          const codigoPatente = String(getField(row, 'Cod. / Patente', 'Cod./Patente', 'Patente') || '').trim();
          const litros = parseFloat(getField(row, 'Litros')) || 0;

          // Filas de totales/resumen al final de cada hoja no traen fecha ni patente — se ignoran
          if (!fecha || !codigoPatente || litros <= 0) return;

          registros.push({
            centroGestion: sheetName, // ej. "CC46", "CC70" — identifica el camión combustible de origen
            fecha,
            codigoPatente,
            equipo: String(getField(row, 'Equipo') || '').trim(),
            empresaPropietaria: String(getField(row, 'Empresa') || '').trim(),
            operador: String(getField(row, 'Operador') || '').trim(),
            horometro: getField(row, 'Horometros', 'Horómetro') || null,
            kilometraje: getField(row, 'Kilometraje') || null,
            litros,
            observaciones: String(getField(row, 'OBSERVACIONES', 'Observaciones') || '').trim()
          });
        });
      });

      const totalLitros = registros.reduce((s, r) => s + r.litros, 0);
      const equiposUnicos = new Set(registros.map(r => r.codigoPatente));
      const meses = new Set(registros.map(r => r.fecha.slice(0, 7)));

      setPreview({
        registros,
        totalLitros,
        totalRegistros: registros.length,
        equiposUnicos: equiposUnicos.size,
        meses: Array.from(meses).sort()
      });
    } catch (err) {
      console.error("Error leyendo archivo:", err);
      setError("Error al leer el archivo Excel");
    }
  };

  const handleImport = async () => {
    if (!preview || !projectId) {
      setError("No hay datos para importar o no hay proyecto seleccionado");
      return;
    }
    setImporting(true);
    setError(null);
    try {
      await saveCombustibleRegistros(empresaId, preview.registros, projectId);
      setResults({ totalRegistros: preview.registros.length, totalLitros: preview.totalLitros, meses: preview.meses });
      if (onImportComplete) onImportComplete();
    } catch (err) {
      console.error("Error importando:", err);
      setError("Error al guardar los registros: " + err.message);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="glass-card rounded-2xl p-6">
        <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-600 to-orange-600 flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
            </svg>
          </div>
          Importar Combustible (Control de Entradas y Salidas)
        </h3>

        <input
          type="file"
          accept=".xlsx,.xls"
          onChange={handleFileChange}
          className="block w-full text-sm text-slate-600 file:mr-4 file:py-3 file:px-6 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-amber-50 file:text-amber-700 hover:file:bg-amber-100 transition-all cursor-pointer"
          disabled={importing}
        />

        <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
          <strong>Formato esperado:</strong> planilla de control del camión aljibe, con columnas Fecha, Cod./Patente, Horómetros,
          Kilometraje, Litros, Equipo, Empresa, Operador. Puede traer varias hojas (una por camión combustible).
          Todo se clasifica bajo la cuenta contable <strong>4.1 Diésel</strong>.
        </div>
      </div>

      {preview && !results && (
        <div className="glass-card rounded-2xl p-6">
          <h3 className="text-lg font-bold text-slate-900 mb-4">Vista Previa</h3>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
              <div className="text-sm font-semibold text-amber-600">Registros</div>
              <div className="text-2xl font-black text-amber-700">{preview.totalRegistros}</div>
            </div>
            <div className="p-4 bg-violet-50 border border-violet-200 rounded-xl">
              <div className="text-sm font-semibold text-violet-600">Equipos</div>
              <div className="text-2xl font-black text-violet-700">{preview.equiposUnicos}</div>
            </div>
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
              <div className="text-sm font-semibold text-emerald-600">Litros Totales</div>
              <div className="text-2xl font-black text-emerald-700">{preview.totalLitros.toFixed(0)} L</div>
            </div>
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
              <div className="text-sm font-semibold text-blue-600">Meses</div>
              <div className="text-sm font-bold text-blue-700 mt-1">{preview.meses.join(', ')}</div>
            </div>
          </div>
          <div className="mb-4 p-3 bg-sky-50 border border-sky-200 rounded-xl text-sm text-sky-700">
            ℹ️ Recuerda fijar el <strong>precio del diésel de cada mes</strong> en la pantalla de Combustible para que el valor total se calcule correctamente (litros × precio del mes).
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleImport} disabled={importing} className="btn-primary flex items-center gap-2">
              <span className="relative z-10 flex items-center gap-2">
                {importing ? (<><div className="spinner w-4 h-4 border-white" />Importando...</>) : "Importar Registros"}
              </span>
            </button>
            <button
              onClick={() => { setFile(null); setPreview(null); setError(null); }}
              disabled={importing}
              className="px-6 py-3 rounded-xl font-semibold text-slate-700 bg-white border-2 border-slate-200 hover:bg-slate-50 transition-all"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {results && (
        <div className="glass-card rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-4 p-6 bg-gradient-to-r from-emerald-50 to-teal-50 border-2 border-emerald-200 rounded-2xl">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-600 flex items-center justify-center flex-shrink-0 shadow-lg">
              <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h3 className="text-xl font-black text-emerald-900">✅ Importación Exitosa</h3>
              <p className="text-emerald-700 mt-1 font-semibold">
                {results.totalRegistros} registros ({results.totalLitros.toFixed(0)} L) importados para {results.meses.join(', ')}.
              </p>
            </div>
          </div>
          <button
            onClick={() => { setFile(null); setPreview(null); setResults(null); setError(null); }}
            className="w-full px-6 py-3 rounded-xl font-bold text-slate-700 bg-white border-2 border-slate-300 hover:bg-slate-50 transition-all"
          >
            Nueva Importación
          </button>
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700">{error}</div>
      )}
    </div>
  );
}
