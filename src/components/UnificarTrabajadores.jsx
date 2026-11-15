/**
 * Revisión del maestro de trabajadores (Admin → Operadores → "Revisar duplicados").
 *
 * Fichas con el mismo RUT (aunque esté escrito con o sin puntos/guion). Al
 * fusionar se elige la ficha que queda; todas las referencias de las otras
 * (liquidaciones, contratos, finiquitos, licencias, combustible, partes
 * diarios, OT…) pasan a ella, se completan los datos que solo tenían las
 * otras y éstas se borran.
 */
import React, { useEffect, useMemo, useState } from "react";
import {
  fetchTrabajadores, duplicadosTrabajadores, fusionarTrabajadores,
  nombreCompletoTrabajador, formatearRutTrabajador,
} from "../lib/trabajadores";

const fecha = (t) => {
  const d = t?.toDate ? t.toDate() : (t ? new Date(t) : null);
  return d && !isNaN(d) ? d.toLocaleDateString("es-CL") : "—";
};

export default function UnificarTrabajadores({ empresaId, onClose, onCambio }) {
  const [lista, setLista] = useState(null);
  const [error, setError] = useState("");
  const [resultado, setResultado] = useState("");
  const [trabajando, setTrabajando] = useState("");
  const [principal, setPrincipal] = useState({});

  const cargar = async () => {
    setError("");
    try { setLista(await fetchTrabajadores(empresaId)); } catch (e) { setError(e.message); }
  };
  useEffect(() => { cargar(); }, [empresaId]); // eslint-disable-line react-hooks/exhaustive-deps

  const grupos = useMemo(() => duplicadosTrabajadores(lista || []), [lista]);

  const fusionar = async (g) => {
    const idP = principal[g.rut] || g.trabajadores[0].id;
    const queda = g.trabajadores.find(t => t.id === idP);
    const otros = g.trabajadores.filter(t => t.id !== idP);
    if (!window.confirm(`Queda la ficha de ${nombreCompletoTrabajador(queda)}.\n\nTodo lo de las otras ${otros.length} ficha(s) (liquidaciones, contratos, combustible, partes…) pasa a ella y las otras se borran. ¿Continuar?`)) return;
    setTrabajando(g.rut);
    try {
      const { referencias } = await fusionarTrabajadores(empresaId, idP, otros.map(t => t.id),
        (c) => setTrabajando(`${g.rut}|${c}`));
      const total = Object.values(referencias).reduce((a, b) => a + b, 0);
      setResultado(`${nombreCompletoTrabajador(queda)}: ${otros.length} ficha(s) fusionada(s), ${total} registro(s) re-apuntado(s).`);
      await cargar(); onCambio?.();
    } catch (e) { setError(e.message); }
    setTrabajando("");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Trabajadores registrados más de una vez</h2>
            <p className="text-xs text-slate-500">Una ficha por RUT para RRHH, Oficina Técnica, WorkFleet y combustible.</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-2xl leading-none" aria-label="Cerrar">×</button>
        </div>
        <div className="p-6 space-y-4">
          {error && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
          {resultado && <p className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">{resultado}</p>}
          {!lista && !error && <p className="text-sm text-slate-500">Cargando fichas…</p>}
          {lista && grupos.length === 0 && <p className="text-sm text-slate-500">{lista.length} fichas y ningún RUT repetido.</p>}
          {grupos.map(g => {
            const sel = principal[g.rut] || g.trabajadores[0].id;
            const ocupado = trabajando.startsWith(g.rut);
            return (
              <div key={g.rut} className="border border-amber-200 rounded-xl overflow-hidden">
                <div className="bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-900">RUT {formatearRutTrabajador(g.rut)} · {g.trabajadores.length} fichas</div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="text-slate-500"><tr><th className="p-2 text-left">Queda</th><th className="p-2 text-left">Nombre</th><th className="p-2 text-left">Cargo</th><th className="p-2 text-left">Estado</th><th className="p-2 text-left">Creada desde</th><th className="p-2 text-left">Fecha</th></tr></thead>
                    <tbody>
                      {g.trabajadores.map(t => (
                        <tr key={t.id} className={`border-t border-slate-100 ${t.id === sel ? "bg-purple-50" : ""}`}>
                          <td className="p-2"><input type="radio" name={g.rut} checked={t.id === sel} onChange={() => setPrincipal(p => ({ ...p, [g.rut]: t.id }))} /></td>
                          <td className="p-2">{nombreCompletoTrabajador(t) || "—"}</td>
                          <td className="p-2">{t.cargo || "—"}</td>
                          <td className="p-2">{t.estado || "—"}</td>
                          <td className="p-2">{t.origen || "RRHH / manual"}</td>
                          <td className="p-2">{fecha(t.createdAt || t.fechaCreacion)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="px-4 py-2 border-t border-slate-100 flex items-center justify-between gap-2">
                  <span className="text-xs text-slate-500">{ocupado && trabajando.includes("|") ? `Re-apuntando ${trabajando.split("|")[1]}…` : ""}</span>
                  <button disabled={!!trabajando} onClick={() => fusionar(g)} className="px-4 py-1.5 rounded-lg bg-amber-600 text-white text-sm font-semibold disabled:opacity-50">
                    {ocupado ? "Fusionando…" : "Fusionar"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
