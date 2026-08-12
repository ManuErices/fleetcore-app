import React, { useEffect, useState } from "react";
import { useEmpresa } from "../../lib/useEmpresa";
import {
  listActiveProjects,
  listCombustibleRegistros,
  saveCombustibleRegistros,
  deleteAllCombustibleRegistros,
  getCombustiblePrecioMensual,
  upsertCombustiblePrecioMensual
} from "../../lib/db";
import CombustibleImporter from "../../components/CombustibleImporter";

const MONTHS = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

function fmt(n) {
  return `$${Math.round(Number(n) || 0).toLocaleString("es-CL")}`;
}

export default function Combustible() {
  const { empresaId } = useEmpresa();
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState("");
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [registros, setRegistros] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showImporter, setShowImporter] = useState(false);

  const [precioDoc, setPrecioDoc] = useState(null);
  const [precioForm, setPrecioForm] = useState("");
  const [savingPrecio, setSavingPrecio] = useState(false);
  const [litrosTotalForm, setLitrosTotalForm] = useState("");
  const [savingTotal, setSavingTotal] = useState(false);

  useEffect(() => {
    if (!empresaId) return;
    (async () => {
      const p = await listActiveProjects(empresaId);
      setProjects(p);
      if (p[0] && !projectId) setProjectId(p[0].id);
    })();
  }, [empresaId]);

  useEffect(() => {
    if (!empresaId || !projectId) return;
    loadData();
  }, [empresaId, projectId]);

  useEffect(() => {
    if (!empresaId || !projectId) return;
    loadPrecio();
  }, [empresaId, projectId, year, month]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const regs = await listCombustibleRegistros(empresaId, projectId);
      setRegistros(regs);
    } catch (err) {
      console.error("Error cargando combustible:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const loadPrecio = async () => {
    const doc = await getCombustiblePrecioMensual(empresaId, projectId, year, month);
    setPrecioDoc(doc);
    setPrecioForm(doc ? String(doc.precioLitro) : "");
  };

  const handleSavePrecio = async () => {
    setSavingPrecio(true);
    try {
      await upsertCombustiblePrecioMensual(empresaId, {
        id: precioDoc?.id,
        projectId, year, month,
        precioLitro: precioForm
      });
      await loadPrecio();
    } catch (err) {
      console.error("Error guardando precio:", err);
      alert("Error al guardar el precio del mes");
    } finally {
      setSavingPrecio(false);
    }
  };

  // Carga rápida: un solo registro con el total de litros del mes, sin desglose por equipo
  // (útil para meses de los que no se tiene el detalle, ej. antes de usar este importador)
  const handleAddTotalMensual = async () => {
    const litros = parseFloat(litrosTotalForm);
    if (!litros || litros <= 0) {
      alert("Ingresa un total de litros válido");
      return;
    }
    setSavingTotal(true);
    try {
      await saveCombustibleRegistros(empresaId, [{
        centroGestion: "Manual",
        fecha: `${year}-${String(month).padStart(2, "0")}-01`,
        codigoPatente: "TOTAL MENSUAL",
        equipo: "Sin detalle",
        empresaPropietaria: "",
        operador: "",
        horometro: null,
        kilometraje: null,
        litros,
        observaciones: "Total mensual sin desglose por equipo (mes sin detalle disponible)"
      }], projectId);
      setLitrosTotalForm("");
      await loadData();
    } catch (err) {
      console.error("Error guardando total mensual:", err);
      alert("Error al guardar: " + err.message);
    } finally {
      setSavingTotal(false);
    }
  };

  const handleDeleteAll = async () => {
    if (!confirm(`¿Eliminar TODOS los registros de combustible importados para este proyecto? Esta acción no se puede deshacer.`)) return;
    setIsLoading(true);
    try {
      await deleteAllCombustibleRegistros(empresaId, projectId);
      await loadData();
    } catch (err) {
      alert("Error al eliminar: " + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const monthPrefix = `${year}-${String(month).padStart(2, "0")}`;
  const registrosDelMes = registros.filter(r => r.fecha && r.fecha.startsWith(monthPrefix));
  const litrosDelMes = registrosDelMes.reduce((s, r) => s + (r.litros || 0), 0);
  const precioLitro = precioDoc?.precioLitro || 0;
  const valorTotalMes = litrosDelMes * precioLitro;

  const projectName = projects.find(p => p.id === projectId)?.name || "";

  return (
    <div className="space-y-6">
      <div className="glass-card rounded-2xl p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-600 to-orange-600 flex items-center justify-center shadow-lg">
              <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
              </svg>
            </div>
            <div>
              <h1 className="text-3xl font-black text-slate-900 tracking-tight">Combustible</h1>
              <p className="text-slate-600 mt-1 text-sm">Control de entradas y salidas — cuenta contable 4.1 Diésel</p>
            </div>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={() => setShowImporter(!showImporter)}
              className="px-6 py-3 rounded-xl font-semibold text-white bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 shadow-lg transition-all flex items-center gap-2"
            >
              {showImporter ? "Ocultar Importador" : "Importar Excel"}
            </button>
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="input-modern">
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        </div>

        {showImporter && (
          <div className="mt-6 pt-6 border-t border-slate-200">
            <CombustibleImporter
              empresaId={empresaId}
              projectId={projectId}
              onImportComplete={() => { setShowImporter(false); loadData(); }}
            />
          </div>
        )}

        <div className="flex items-end gap-4 mt-6 pt-6 border-t border-slate-100 flex-wrap">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">Mes</label>
            <select value={month} onChange={(e) => setMonth(parseInt(e.target.value))} className="input-modern">
              {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">Año</label>
            <select value={year} onChange={(e) => setYear(parseInt(e.target.value))} className="input-modern">
              {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">Precio Diésel del mes ($/L)</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={precioForm}
                onChange={(e) => setPrecioForm(e.target.value)}
                placeholder="0"
                className="input-modern w-32"
              />
              <button
                onClick={handleSavePrecio}
                disabled={savingPrecio}
                className="px-4 py-3 rounded-xl font-bold text-sm text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50"
              >
                {savingPrecio ? "..." : "Guardar"}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Total del mes sin detalle (L)
              <span className="ml-1 text-slate-400 font-normal" title="Para meses de los que no tienes el Excel detallado — carga solo el total de litros">ⓘ</span>
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={litrosTotalForm}
                onChange={(e) => setLitrosTotalForm(e.target.value)}
                placeholder="Ej: 33347"
                className="input-modern w-36"
              />
              <button
                onClick={handleAddTotalMensual}
                disabled={savingTotal}
                className="px-4 py-3 rounded-xl font-bold text-sm text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-50"
              >
                {savingTotal ? "..." : "Agregar"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Resumen del mes */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-card rounded-2xl p-6">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Registros del mes</div>
          <div className="text-2xl font-black text-slate-900">{registrosDelMes.length}</div>
        </div>
        <div className="glass-card rounded-2xl p-6">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Litros del mes</div>
          <div className="text-2xl font-black text-amber-700">{litrosDelMes.toLocaleString("es-CL")} L</div>
        </div>
        <div className="glass-card rounded-2xl p-6">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Precio vigente</div>
          <div className="text-2xl font-black text-slate-900">{precioLitro > 0 ? fmt(precioLitro) + "/L" : "Sin fijar"}</div>
        </div>
        <div className="glass-card rounded-2xl p-6 bg-gradient-to-br from-amber-50 to-orange-50">
          <div className="text-xs font-bold text-amber-700 uppercase tracking-wider mb-1">Valor Total (4.1)</div>
          <div className="text-2xl font-black text-amber-800">{fmt(valorTotalMes)}</div>
        </div>
      </div>

      {precioLitro === 0 && registrosDelMes.length > 0 && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
          ⚠️ No has fijado el precio del diésel para {MONTHS[month - 1]} {year} — el valor total se calculará en $0 hasta que lo ingreses arriba.
        </div>
      )}

      {/* Tabla de registros */}
      <div className="glass-card rounded-2xl overflow-hidden">
        <div className="px-6 py-4 flex items-center justify-between border-b border-slate-100">
          <h3 className="text-lg font-bold text-slate-900">Registros — {MONTHS[month - 1]} {year}</h3>
          {registros.length > 0 && (
            <button onClick={handleDeleteAll} className="text-xs font-semibold text-red-600 hover:bg-red-50 px-3 py-1.5 rounded-lg transition-colors">
              Eliminar todos los registros del proyecto
            </button>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-bold text-slate-600 uppercase">Fecha</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-slate-600 uppercase">Cod./Patente</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-slate-600 uppercase">Equipo</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-slate-600 uppercase">Empresa</th>
                <th className="text-right px-4 py-3 text-xs font-bold text-slate-600 uppercase">Litros</th>
                <th className="text-right px-4 py-3 text-xs font-bold text-slate-600 uppercase">Valor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {registrosDelMes.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-slate-400">
                    {isLoading ? "Cargando..." : `No hay registros para ${MONTHS[month - 1]} ${year}. Importa un Excel para comenzar.`}
                  </td>
                </tr>
              )}
              {registrosDelMes.map(r => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-sm text-slate-600">{r.fecha}</td>
                  <td className="px-4 py-3 text-sm font-semibold text-slate-800">{r.codigoPatente}</td>
                  <td className="px-4 py-3 text-sm text-slate-600">{r.equipo}</td>
                  <td className="px-4 py-3 text-sm text-slate-600">{r.empresaPropietaria}</td>
                  <td className="px-4 py-3 text-sm text-right text-slate-700">{r.litros} L</td>
                  <td className="px-4 py-3 text-sm text-right font-semibold text-amber-700">{fmt(r.litros * precioLitro)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
