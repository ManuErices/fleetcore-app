import React, { useState, useMemo } from "react";
import { useContabilidad, TIPOS_CUENTA, TIPOS_MAP, fmt } from "./ContabilidadContext";

// ─── Modal agregar/editar cuenta ─────────────────────────────────────────────
const EMPTY_CUENTA = { codigo: "", nombre: "", tipo: "activo_corriente", descripcion: "", activa: true };

function ModalCuenta({ isOpen, onClose, editando, onSave }) {
  const [form, setForm] = useState(EMPTY_CUENTA);
  const [saving, setSaving] = useState(false);
  React.useEffect(() => {
    setForm(editando ? { ...EMPTY_CUENTA, ...editando } : EMPTY_CUENTA);
  }, [editando, isOpen]);
  if (!isOpen) return null;
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const tipo = TIPOS_MAP[form.tipo] || TIPOS_CUENTA[0];

  const handleSubmit = async () => {
    if (!form.codigo || !form.nombre) return;
    setSaving(true);
    await onSave(form);
    setSaving(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        <div className="bg-gradient-to-r from-purple-700 to-violet-600 p-5 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <div>
              <h2 className="font-black text-base">{editando ? "Editar Cuenta" : "Nueva Cuenta"}</h2>
              <p className="text-white/70 text-xs">Plan de Cuentas</p>
            </div>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5">Código <span className="text-red-500">*</span></label>
              <input value={form.codigo} onChange={e => set("codigo", e.target.value)} placeholder="1-01-001" className="w-full px-3 py-2 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 text-sm font-mono" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5">Estado</label>
              <button onClick={() => set("activa", !form.activa)} className={`w-full py-2 rounded-xl text-xs font-bold border-2 transition-all ${form.activa ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-50 text-slate-500"}`}>
                {form.activa ? "✓ Activa" : "Inactiva"}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5">Nombre <span className="text-red-500">*</span></label>
            <input value={form.nombre} onChange={e => set("nombre", e.target.value)} placeholder="Ej: Caja Chica" className="w-full px-3 py-2 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-2">Tipo de cuenta</label>
            <div className="grid grid-cols-2 gap-1.5 max-h-48 overflow-y-auto pr-1">
              {TIPOS_CUENTA.map(t => (
                <button key={t.id} onClick={() => set("tipo", t.id)}
                  className={`px-3 py-2 rounded-xl text-xs font-semibold text-left transition-all border-2 ${form.tipo === t.id ? "border-purple-500 bg-purple-50 text-purple-800" : "border-slate-100 hover:border-slate-200 text-slate-600"}`}>
                  <span className="block text-[10px] font-bold text-slate-400 uppercase">{t.grupo}</span>
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5">Descripción</label>
            <textarea value={form.descripcion || ""} onChange={e => set("descripcion", e.target.value)} rows={2} placeholder="Descripción opcional..." className="w-full px-3 py-2 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 text-sm resize-none" />
          </div>
        </div>
        <div className="px-5 pb-5 flex gap-3">
          <button onClick={onClose} className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-sm">Cancelar</button>
          <div className="flex-1" />
          <button onClick={handleSubmit} disabled={saving || !form.codigo || !form.nombre}
            className="px-5 py-2.5 bg-gradient-to-r from-purple-700 to-violet-600 disabled:opacity-40 text-white font-bold rounded-xl text-sm flex items-center gap-2">
            {saving ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Guardando...</> : <>{editando ? "Guardar cambios" : "Crear cuenta"}</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Badge grupo ──────────────────────────────────────────────────────────────
const GRUPO_COLORS = {
  ACTIVO:      "bg-emerald-100 text-emerald-700",
  PASIVO:      "bg-red-100 text-red-700",
  PATRIMONIO:  "bg-blue-100 text-blue-700",
  RESULTADO:   "bg-amber-100 text-amber-700",
  TRIBUTARIO:  "bg-purple-100 text-purple-700",
};

// ─── Componente principal ─────────────────────────────────────────────────────
export default function ContabilidadPlanCuentas() {
  const { cuentas, loadingCuentas, guardarCuenta, eliminarCuenta, cargarCuentas, saldoCuenta } = useContabilidad();
  const [deduplicando, setDeduplicando] = useState(false);
  const [resultadoDedup, setResultadoDedup] = useState(null);

  // ── Eliminar cuentas duplicadas (mismo código, distintos ids) ─────────────
  const deduplicarCuentas = async () => {
    setDeduplicando(true);
    setResultadoDedup(null);
    // Agrupar por código
    const porCodigo = {};
    cuentas.forEach(c => {
      if (!c.codigo) return;
      if (!porCodigo[c.codigo]) porCodigo[c.codigo] = [];
      porCodigo[c.codigo].push(c);
    });
    let eliminadas = 0;
    for (const [codigo, lista] of Object.entries(porCodigo)) {
      if (lista.length <= 1) continue;
      // Conservar la primera (más antigua), eliminar el resto
      const aEliminar = lista.slice(1);
      for (const c of aEliminar) {
        try {
          await eliminarCuenta(c.id);
          eliminadas++;
        } catch (e) { console.error("Error eliminando cuenta duplicada:", e); }
      }
    }
    await cargarCuentas();
    setDeduplicando(false);
    setResultadoDedup(eliminadas);
    setTimeout(() => setResultadoDedup(null), 4000);
  };
  const [showModal, setShowModal]   = useState(false);
  const [editando, setEditando]     = useState(null);
  const [busqueda, setBusqueda]     = useState("");
  const [filtroGrupo, setFiltroGrupo] = useState("todos");
  const [filtroActiva, setFiltroActiva] = useState("activas");

  const cuentasFiltradas = useMemo(() => {
    return cuentas.filter(c => {
      if (filtroActiva === "activas" && !c.activa) return false;
      if (filtroActiva === "inactivas" && c.activa) return false;
      const tipo = TIPOS_MAP[c.tipo];
      if (filtroGrupo !== "todos" && tipo?.grupo !== filtroGrupo) return false;
      if (busqueda) {
        const b = busqueda.toLowerCase();
        return c.codigo?.toLowerCase().includes(b) || c.nombre?.toLowerCase().includes(b);
      }
      return true;
    });
  }, [cuentas, filtroGrupo, filtroActiva, busqueda]);

  // Totales por grupo
  const totalPorGrupo = useMemo(() => {
    const map = {};
    cuentas.forEach(c => {
      const tipo = TIPOS_MAP[c.tipo];
      if (!tipo) return;
      const g = tipo.grupo;
      if (!map[g]) map[g] = 0;
      map[g]++;
    });
    return map;
  }, [cuentas]);

  const grupos = ["ACTIVO", "PASIVO", "PATRIMONIO", "RESULTADO", "TRIBUTARIO"];

  return (
    <div className="p-4 sm:p-6 space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div>
          <h1 className="text-xl font-black text-slate-900">Plan de Cuentas</h1>
          <p className="text-xs text-slate-500 mt-0.5">{cuentas.length} cuentas registradas</p>
        </div>
        <div className="flex items-center gap-2 sm:ml-auto flex-wrap">
          {/* Botón deduplicar — solo visible si hay duplicados */}
          {cuentas.length !== new Set(cuentas.map(c => c.codigo)).size && (
            <button
              onClick={deduplicarCuentas}
              disabled={deduplicando}
              className="flex items-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-bold rounded-xl text-sm transition-all"
            >
              {deduplicando
                ? <><div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"/>Limpiando...</>
                : <>🧹 Eliminar duplicadas</>
              }
            </button>
          )}
          {resultadoDedup !== null && (
            <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-3 py-2 rounded-xl border border-emerald-200">
              ✅ {resultadoDedup} cuenta{resultadoDedup !== 1 ? "s" : ""} duplicada{resultadoDedup !== 1 ? "s" : ""} eliminada{resultadoDedup !== 1 ? "s" : ""}
            </span>
          )}
          <button
            onClick={() => { setEditando(null); setShowModal(true); }}
            className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-purple-700 to-violet-600 text-white font-bold rounded-xl text-sm shadow-md shadow-purple-200 hover:shadow-lg transition-all"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            Nueva cuenta
          </button>
        </div>
      </div>

      {/* KPIs por grupo */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {grupos.map(g => (
          <button key={g} onClick={() => setFiltroGrupo(filtroGrupo === g ? "todos" : g)}
            className={`rounded-xl p-3 border-2 transition-all text-left ${filtroGrupo === g ? "border-purple-500 bg-purple-50" : "border-slate-100 bg-white hover:border-slate-200"}`}>
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{g}</p>
            <p className="text-lg font-black text-slate-800 mt-0.5">{totalPorGrupo[g] || 0}</p>
            <p className="text-[10px] text-slate-500">cuentas</p>
          </button>
        ))}
      </div>

      {/* Filtros */}
      <div className="glass-card rounded-xl p-4 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <svg className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar por código o nombre..." className="w-full pl-9 pr-4 py-2 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-purple-400 text-sm" />
        </div>
        <select value={filtroActiva} onChange={e => setFiltroActiva(e.target.value)} className="px-3 py-2 border-2 border-slate-200 rounded-xl text-sm font-semibold focus:outline-none focus:border-purple-400">
          <option value="activas">Activas</option>
          <option value="inactivas">Inactivas</option>
          <option value="todas">Todas</option>
        </select>
      </div>

      {/* Tabla */}
      {loadingCuentas ? (
        <div className="flex items-center justify-center h-40">
          <div className="w-8 h-8 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="glass-card rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-wider text-slate-500">Código</th>
                <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-wider text-slate-500">Nombre</th>
                <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-wider text-slate-500 hidden sm:table-cell">Tipo</th>
                <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-wider text-slate-500 hidden md:table-cell">Grupo</th>
                <th className="px-4 py-3 text-right text-xs font-black uppercase tracking-wider text-slate-500">Saldo</th>
                <th className="px-4 py-3 text-center text-xs font-black uppercase tracking-wider text-slate-500">Estado</th>
                <th className="px-4 py-3 text-center text-xs font-black uppercase tracking-wider text-slate-500">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {cuentasFiltradas.map((c, i) => {
                const tipo = TIPOS_MAP[c.tipo];
                const saldo = saldoCuenta(c.id);
                return (
                  <tr key={c.id} className={`hover:bg-purple-50/30 transition-colors ${i % 2 === 0 ? "bg-white" : "bg-slate-50/20"}`}>
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-lg">{c.codigo}</span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm font-semibold text-slate-800">{c.nombre}</p>
                      {c.descripcion && <p className="text-xs text-slate-400 truncate max-w-48">{c.descripcion}</p>}
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <span className="text-xs text-slate-600">{tipo?.label || c.tipo}</span>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-lg ${GRUPO_COLORS[tipo?.grupo] || "bg-slate-100 text-slate-600"}`}>
                        {tipo?.grupo || "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`text-sm font-black ${saldo !== 0 ? (saldo > 0 ? "text-emerald-600" : "text-red-500") : "text-slate-300"}`}>
                        {saldo !== 0 ? fmt(saldo) : "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${c.activa ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-400"}`}>
                        {c.activa ? "Activa" : "Inactiva"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button onClick={() => { setEditando(c); setShowModal(true); }}
                        className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-purple-100 hover:text-purple-700 text-slate-500 flex items-center justify-center mx-auto transition-all">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {cuentasFiltradas.length === 0 && (
            <div className="py-16 text-center">
              <p className="text-slate-400 text-sm">No hay cuentas que coincidan con los filtros</p>
            </div>
          )}
          <div className="px-4 py-3 bg-gradient-to-r from-purple-700 to-violet-600 flex items-center justify-between">
            <span className="text-xs font-semibold text-white/70">{cuentasFiltradas.length} cuentas mostradas</span>
            <span className="text-xs font-black text-white">
              {filtroGrupo !== "todos" ? filtroGrupo : "Todos los grupos"}
            </span>
          </div>
        </div>
      )}

      <ModalCuenta isOpen={showModal} onClose={() => { setShowModal(false); setEditando(null); }} editando={editando} onSave={guardarCuenta} />
    </div>
  );
}
