import React, { useState, useMemo } from "react";
import { useContabilidad, PeriodoSelector, TIPOS_MAP, fmt, MESES } from "./ContabilidadContext";

// ─── Modal asiento ────────────────────────────────────────────────────────────
const LINEA_EMPTY = { cuentaId: "", cuentaNombre: "", debe: "", haber: "", descripcion: "" };
const ASIENTO_EMPTY = {
  fecha: new Date().toISOString().slice(0, 10),
  glosa: "",
  tipo: "manual",
  lineas: [{ ...LINEA_EMPTY }, { ...LINEA_EMPTY }],
};

function LineaAsiento({ linea, idx, cuentas, onChange, onRemove, canRemove }) {
  const set = (k, v) => onChange(idx, { ...linea, [k]: v });
  const cuenta = cuentas.find(c => c.id === linea.cuentaId);
  return (
    <div className="grid grid-cols-12 gap-2 items-start py-2 border-b border-slate-100 last:border-0">
      <div className="col-span-5">
        <select value={linea.cuentaId} onChange={e => {
          const c = cuentas.find(x => x.id === e.target.value);
          set("cuentaId", e.target.value);
          set("cuentaNombre", c?.nombre || "");
        }}
          className="w-full px-2 py-1.5 border-2 border-slate-200 rounded-lg focus:outline-none focus:border-purple-500 text-xs">
          <option value="">— Seleccionar cuenta —</option>
          {cuentas.filter(c => c.activa !== false).map(c => (
            <option key={c.id} value={c.id}>{c.codigo} — {c.nombre}</option>
          ))}
        </select>
        <input value={linea.descripcion} onChange={e => set("descripcion", e.target.value)} placeholder="Detalle..." className="w-full mt-1 px-2 py-1 border border-slate-100 rounded-lg text-xs text-slate-500 focus:outline-none focus:border-purple-300" />
      </div>
      <div className="col-span-3">
        <input type="number" value={linea.debe} onChange={e => set("debe", e.target.value)} placeholder="0"
          className="w-full px-2 py-1.5 border-2 border-slate-200 rounded-lg focus:outline-none focus:border-emerald-500 text-xs text-right font-mono"
          onFocus={() => { if (linea.haber) set("haber", ""); }} />
      </div>
      <div className="col-span-3">
        <input type="number" value={linea.haber} onChange={e => set("haber", e.target.value)} placeholder="0"
          className="w-full px-2 py-1.5 border-2 border-slate-200 rounded-lg focus:outline-none focus:border-red-400 text-xs text-right font-mono"
          onFocus={() => { if (linea.debe) set("debe", ""); }} />
      </div>
      <div className="col-span-1 flex justify-center pt-1.5">
        {canRemove && (
          <button onClick={() => onRemove(idx)} className="w-6 h-6 rounded-lg bg-red-50 hover:bg-red-100 text-red-400 flex items-center justify-center transition-all">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        )}
      </div>
    </div>
  );
}

function ModalAsiento({ isOpen, onClose, editando, onSave, cuentas, periodoActivo }) {
  const [form, setForm]   = useState(ASIENTO_EMPTY);
  const [saving, setSaving] = useState(false);
  React.useEffect(() => {
    setForm(editando
      ? { ...ASIENTO_EMPTY, ...editando, lineas: editando.lineas?.length ? editando.lineas : [{ ...LINEA_EMPTY }, { ...LINEA_EMPTY }] }
      : { ...ASIENTO_EMPTY, fecha: new Date().toISOString().slice(0, 10) }
    );
  }, [editando, isOpen]);
  if (!isOpen) return null;

  const totalDebe  = form.lineas.reduce((s, l) => s + (parseFloat(l.debe)  || 0), 0);
  const totalHaber = form.lineas.reduce((s, l) => s + (parseFloat(l.haber) || 0), 0);
  const diferencia = Math.abs(totalDebe - totalHaber);
  const cuadrado   = diferencia < 0.01 && totalDebe > 0;

  const setLinea    = (idx, val) => setForm(f => ({ ...f, lineas: f.lineas.map((l, i) => i === idx ? val : l) }));
  const addLinea    = () => setForm(f => ({ ...f, lineas: [...f.lineas, { ...LINEA_EMPTY }] }));
  const removeLinea = (idx) => setForm(f => ({ ...f, lineas: f.lineas.filter((_, i) => i !== idx) }));

  const handleSubmit = async () => {
    if (!cuadrado || !form.glosa) return;
    setSaving(true);
    const lineasValidas = form.lineas.filter(l => l.cuentaId && (parseFloat(l.debe) || parseFloat(l.haber)));
    const [anio, mes] = form.fecha.split("-");
    await onSave({
      ...form,
      lineas: lineasValidas,
      periodo: `${anio}-${mes}`,
      totalDebe,
    });
    setSaving(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl my-auto overflow-hidden">
        <div className="bg-gradient-to-r from-purple-700 to-violet-600 p-5 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <h2 className="font-black text-base">{editando ? "Editar Asiento" : "Nuevo Asiento"}</h2>
              <p className="text-white/70 text-xs">Libro Diario</p>
            </div>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Cabecera del asiento */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5">Fecha <span className="text-red-500">*</span></label>
              <input type="date" value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} className="w-full px-3 py-2 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5">Tipo</label>
              <select value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))} className="w-full px-3 py-2 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 text-sm">
                <option value="manual">Manual</option>
                <option value="ajuste">Ajuste</option>
                <option value="apertura">Apertura</option>
                <option value="cierre">Cierre</option>
                <option value="depreciacion">Depreciación</option>
                <option value="iva">IVA</option>
              </select>
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-xs font-bold text-slate-600 mb-1.5">Glosa <span className="text-red-500">*</span></label>
              <input value={form.glosa} onChange={e => setForm(f => ({ ...f, glosa: e.target.value }))} placeholder="Descripción del asiento..." className="w-full px-3 py-2 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 text-sm" />
            </div>
          </div>

          {/* Tabla de líneas */}
          <div className="border-2 border-slate-100 rounded-xl overflow-hidden">
            <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-slate-50 border-b border-slate-100">
              <div className="col-span-5 text-xs font-black text-slate-500 uppercase">Cuenta / Detalle</div>
              <div className="col-span-3 text-xs font-black text-slate-500 uppercase text-right">Debe</div>
              <div className="col-span-3 text-xs font-black text-slate-500 uppercase text-right">Haber</div>
              <div className="col-span-1" />
            </div>
            <div className="px-3 divide-y divide-slate-50">
              {form.lineas.map((linea, idx) => (
                <LineaAsiento key={idx} linea={linea} idx={idx} cuentas={cuentas}
                  onChange={setLinea} onRemove={removeLinea} canRemove={form.lineas.length > 2} />
              ))}
            </div>
            {/* Totales */}
            <div className="px-3 py-3 bg-slate-50 border-t-2 border-slate-100 grid grid-cols-12 gap-2">
              <div className="col-span-5 flex items-center">
                <button onClick={addLinea} className="flex items-center gap-1.5 text-xs font-bold text-purple-600 hover:text-purple-700 transition-colors">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                  Agregar línea
                </button>
              </div>
              <div className="col-span-3 text-right">
                <p className="text-xs text-slate-400 font-semibold">Total Debe</p>
                <p className="text-sm font-black text-emerald-600 font-mono">{fmt(totalDebe)}</p>
              </div>
              <div className="col-span-3 text-right">
                <p className="text-xs text-slate-400 font-semibold">Total Haber</p>
                <p className="text-sm font-black text-red-500 font-mono">{fmt(totalHaber)}</p>
              </div>
              <div className="col-span-1 flex items-center justify-center">
                {totalDebe > 0 && (
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center ${cuadrado ? "bg-emerald-100" : "bg-red-100"}`}>
                    {cuadrado
                      ? <svg className="w-3.5 h-3.5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                      : <svg className="w-3.5 h-3.5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                    }
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Aviso diferencia */}
          {totalDebe > 0 && !cuadrado && (
            <div className="flex items-center gap-2 px-4 py-2.5 bg-red-50 border border-red-200 rounded-xl">
              <svg className="w-4 h-4 text-red-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              <p className="text-xs font-bold text-red-600">El asiento no cuadra — diferencia de {fmt(diferencia)}</p>
            </div>
          )}
        </div>

        <div className="px-5 pb-5 flex gap-3">
          <button onClick={onClose} className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-sm">Cancelar</button>
          <div className="flex-1" />
          <button onClick={handleSubmit} disabled={saving || !cuadrado || !form.glosa}
            className="px-5 py-2.5 bg-gradient-to-r from-purple-700 to-violet-600 disabled:opacity-40 text-white font-bold rounded-xl text-sm flex items-center gap-2 shadow-md">
            {saving ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Guardando...</> : <>{editando ? "Guardar cambios" : "Registrar asiento"}</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Badge tipo asiento ───────────────────────────────────────────────────────
const TIPO_COLORS = {
  manual:       "bg-slate-100 text-slate-600",
  ajuste:       "bg-blue-100 text-blue-700",
  apertura:     "bg-emerald-100 text-emerald-700",
  cierre:       "bg-slate-700 text-white",
  depreciacion: "bg-amber-100 text-amber-700",
  iva:          "bg-purple-100 text-purple-700",
  automatico:   "bg-violet-100 text-violet-700",
};

// ─── Componente principal ─────────────────────────────────────────────────────
export default function ContabilidadLibroDiario() {
  const { asientos, cuentas, loadingAsientos, guardarAsiento, eliminarAsiento, periodoActivo } = useContabilidad();
  const [showModal, setShowModal]   = useState(false);
  const [editando, setEditando]     = useState(null);
  const [expandido, setExpandido]   = useState(null);
  const [busqueda, setBusqueda]     = useState("");
  const [filtroTipo, setFiltroTipo] = useState("todos");
  const [deletingId, setDeletingId] = useState(null);

  const asientosFiltrados = useMemo(() => {
    return asientos.filter(a => {
      if (filtroTipo !== "todos" && a.tipo !== filtroTipo) return false;
      if (busqueda) {
        const b = busqueda.toLowerCase();
        return a.glosa?.toLowerCase().includes(b) ||
          a.lineas?.some(l => l.cuentaNombre?.toLowerCase().includes(b));
      }
      return true;
    });
  }, [asientos, filtroTipo, busqueda]);

  const totales = useMemo(() => ({
    debe:  asientosFiltrados.reduce((s, a) => s + (a.totalDebe || 0), 0),
    count: asientosFiltrados.length,
  }), [asientosFiltrados]);

  const handleEliminar = async (id) => {
    if (!window.confirm("¿Eliminar este asiento? Esta acción no se puede deshacer.")) return;
    setDeletingId(id);
    await eliminarAsiento(id);
    setDeletingId(null);
    if (expandido === id) setExpandido(null);
  };

  return (
    <div className="p-4 sm:p-6 space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div>
          <h1 className="text-xl font-black text-slate-900">Libro Diario</h1>
          <p className="text-xs text-slate-500 mt-0.5">Asientos del período</p>
        </div>
        <div className="flex items-center gap-2 sm:ml-auto">
          <PeriodoSelector />
          <button
            onClick={() => { setEditando(null); setShowModal(true); }}
            className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-purple-700 to-violet-600 text-white font-bold rounded-xl text-sm shadow-md shadow-purple-200 hover:shadow-lg transition-all"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            Nuevo asiento
          </button>
        </div>
      </div>

      {/* KPIs rápidos */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Asientos",       value: totales.count,        color: "text-slate-800"   },
          { label: "Total Debe",     value: fmt(totales.debe),    color: "text-emerald-600" },
          { label: "Total Haber",    value: fmt(totales.debe),    color: "text-red-500"     },
        ].map(k => (
          <div key={k.label} className="glass-card rounded-xl p-3 sm:p-4">
            <p className="text-xs text-slate-400 font-semibold">{k.label}</p>
            <p className={`text-base sm:text-lg font-black mt-0.5 ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="glass-card rounded-xl p-4 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <svg className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar por glosa o cuenta..." className="w-full pl-9 pr-4 py-2 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-purple-400 text-sm" />
        </div>
        <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)} className="px-3 py-2 border-2 border-slate-200 rounded-xl text-sm font-semibold focus:outline-none focus:border-purple-400">
          <option value="todos">Todos los tipos</option>
          <option value="manual">Manual</option>
          <option value="ajuste">Ajuste</option>
          <option value="depreciacion">Depreciación</option>
          <option value="iva">IVA</option>
          <option value="automatico">Automático</option>
        </select>
      </div>

      {/* Lista de asientos */}
      {loadingAsientos ? (
        <div className="flex items-center justify-center h-40">
          <div className="w-8 h-8 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : asientosFiltrados.length === 0 ? (
        <div className="glass-card rounded-xl py-16 text-center">
          <p className="text-3xl mb-3">📒</p>
          <p className="text-slate-600 font-bold">Sin asientos en este período</p>
          <p className="text-slate-400 text-sm mt-1">Registra el primer asiento contable</p>
        </div>
      ) : (
        <div className="space-y-2">
          {asientosFiltrados.map((a, idx) => (
            <div key={a.id} className="glass-card rounded-xl overflow-hidden">
              {/* Cabecera del asiento */}
              <div
                onClick={() => setExpandido(expandido === a.id ? null : a.id)}
                className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-purple-50/30 transition-colors"
              >
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-700 to-violet-600 flex items-center justify-center flex-shrink-0">
                  <span className="text-white text-xs font-black">{idx + 1}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-bold text-slate-800 truncate">{a.glosa}</p>
                    <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-md flex-shrink-0 ${TIPO_COLORS[a.tipo] || "bg-slate-100 text-slate-600"}`}>
                      {a.tipo || "manual"}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-0.5">
                    <p className="text-xs text-slate-400">{a.fecha}</p>
                    <p className="text-xs text-slate-400">{a.lineas?.length || 0} líneas</p>
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-black text-slate-800">{fmt(a.totalDebe)}</p>
                  <p className="text-[10px] text-slate-400">Debe / Haber</p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={e => { e.stopPropagation(); setEditando(a); setShowModal(true); }}
                    className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-purple-100 hover:text-purple-700 text-slate-500 flex items-center justify-center transition-all">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                  </button>
                  <button onClick={e => { e.stopPropagation(); handleEliminar(a.id); }}
                    disabled={deletingId === a.id}
                    className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-red-100 hover:text-red-600 text-slate-500 flex items-center justify-center transition-all disabled:opacity-40">
                    {deletingId === a.id
                      ? <div className="w-3 h-3 border border-slate-400 border-t-transparent rounded-full animate-spin" />
                      : <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>}
                  </button>
                  <svg className={`w-4 h-4 text-slate-400 transition-transform ${expandido === a.id ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>

              {/* Detalle expandido */}
              {expandido === a.id && (
                <div className="border-t border-slate-100 px-4 pb-3">
                  <table className="w-full mt-2">
                    <thead>
                      <tr className="text-[10px] font-black text-slate-400 uppercase">
                        <th className="text-left py-1.5 pr-2">Cuenta</th>
                        <th className="text-left py-1.5 hidden sm:table-cell">Detalle</th>
                        <th className="text-right py-1.5 px-2">Debe</th>
                        <th className="text-right py-1.5">Haber</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(a.lineas || []).map((l, i) => (
                        <tr key={i} className="border-t border-slate-50">
                          <td className="py-1.5 pr-2">
                            <p className="text-xs font-semibold text-slate-700">{l.cuentaNombre || l.cuentaId}</p>
                          </td>
                          <td className="py-1.5 hidden sm:table-cell">
                            <p className="text-xs text-slate-400">{l.descripcion}</p>
                          </td>
                          <td className="py-1.5 px-2 text-right">
                            {parseFloat(l.debe) > 0 && <span className="text-xs font-mono font-bold text-emerald-600">{fmt(l.debe)}</span>}
                          </td>
                          <td className="py-1.5 text-right">
                            {parseFloat(l.haber) > 0 && <span className="text-xs font-mono font-bold text-red-500">{fmt(l.haber)}</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="border-t-2 border-slate-200">
                      <tr>
                        <td colSpan={2} className="py-1.5 text-xs font-black text-slate-500">TOTALES</td>
                        <td className="py-1.5 px-2 text-right text-xs font-black font-mono text-emerald-600">{fmt(a.totalDebe)}</td>
                        <td className="py-1.5 text-right text-xs font-black font-mono text-red-500">{fmt(a.totalDebe)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <ModalAsiento isOpen={showModal} onClose={() => { setShowModal(false); setEditando(null); }}
        editando={editando} onSave={guardarAsiento} cuentas={cuentas} periodoActivo={periodoActivo} />
    </div>
  );
}
