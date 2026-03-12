import React, { useState, useEffect, useCallback } from "react";
import {
  collection, query, where, getDocs,
  addDoc, updateDoc, deleteDoc, doc, orderBy
} from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useFinanzas, ProyectoSelector } from "./FinanzasContext";

// ─── Utilidades ───────────────────────────────────────────────────────────────
function fmt(n) {
  return "$" + Math.abs(Math.round(n || 0)).toLocaleString("es-CL");
}
function fmtM(n) {
  const abs = Math.abs(n || 0);
  if (abs >= 1000000) return (n < 0 ? "-$" : "$") + (abs / 1000000).toFixed(1).replace(".", ",") + "M";
  return (n < 0 ? "-" : "") + fmt(abs);
}
function getMesActual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function mesLabel(ym) {
  const [y, m] = ym.split("-");
  const meses = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
  return `${meses[parseInt(m) - 1]} ${y}`;
}
function primerDia(ym) { return `${ym}-01`; }
function ultimoDia(ym) {
  const [y, m] = ym.split("-");
  return new Date(parseInt(y), parseInt(m), 0).toISOString().split("T")[0];
}
function mesesRange(desde, hasta) {
  const result = [];
  let [y, m] = desde.split("-").map(Number);
  const [hy, hm] = hasta.split("-").map(Number);
  while (y < hy || (y === hy && m <= hm)) {
    result.push(`${y}-${String(m).padStart(2, "0")}`);
    m++; if (m > 12) { m = 1; y++; }
  }
  return result;
}
function sumarMes(ym, n) {
  let [y, m] = ym.split("-").map(Number);
  m += n;
  while (m > 12) { m -= 12; y++; }
  while (m < 1)  { m += 12; y--; }
  return `${y}-${String(m).padStart(2, "0")}`;
}

// ─── Colores de categoría egreso ──────────────────────────────────────────────
const CAT_COLORS = {
  rendiciones:    "bg-orange-100 text-orange-700",
  purchaseOrders: "bg-blue-100 text-blue-700",
  subcontratos:   "bg-amber-100 text-amber-700",
  remuneraciones: "bg-emerald-100 text-emerald-700",
  costos_fijos:   "bg-slate-100 text-slate-700",
  ingreso:        "bg-purple-100 text-purple-700",
  proyeccion:     "bg-violet-100 text-violet-700",
};
const CAT_LABELS = {
  rendiciones:    "Rendiciones",
  purchaseOrders: "Órdenes de Compra",
  subcontratos:   "Subcontratos",
  remuneraciones: "Remuneraciones",
  costos_fijos:   "Costos Fijos",
  ingreso:        "Ingreso",
  proyeccion:     "Proyección",
};

// ─── Modal ingreso manual ─────────────────────────────────────────────────────
function ModalIngreso({ onClose, onSave, editando, proyectos, mesActual }) {
  const [form, setForm] = useState(
    editando || { descripcion: "", monto: "", fecha: primerDia(mesActual), tipo: "ingreso", projectId: "global", notas: "" }
  );
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.descripcion.trim() || !form.monto) return;
    setSaving(true);
    await onSave({ ...form, monto: Number(form.monto) });
    setSaving(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-700 to-violet-600 p-5 text-white">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-black">{editando ? "Editar Ingreso" : "Registrar Ingreso"}</h2>
              <p className="text-white/70 text-xs mt-0.5">Los egresos se toman automáticamente de Firebase</p>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="p-5 space-y-4">
          {/* Tipo */}
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">Tipo</label>
            <div className="grid grid-cols-2 gap-2">
              {["ingreso", "proyeccion"].map(t => (
                <button
                  key={t}
                  onClick={() => set("tipo", t)}
                  className={`py-2.5 rounded-xl border-2 text-sm font-bold transition-all ${
                    form.tipo === t ? "border-purple-700 bg-purple-50 text-purple-700" : "border-slate-200 text-slate-500 hover:border-slate-300"
                  }`}
                >
                  {t === "ingreso" ? "💵 Ingreso Real" : "🔮 Proyección"}
                </button>
              ))}
            </div>
          </div>

          {/* Descripción */}
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1.5">Descripción <span className="text-red-500">*</span></label>
            <input
              value={form.descripcion}
              onChange={e => set("descripcion", e.target.value)}
              placeholder="Ej: Cobro Proyecto Los Andes"
              className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 text-sm"
            />
          </div>

          {/* Monto */}
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1.5">Monto <span className="text-red-500">*</span></label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">$</span>
              <input
                type="number"
                value={form.monto}
                onChange={e => set("monto", e.target.value)}
                placeholder="0"
                className="w-full pl-7 pr-4 py-2.5 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 text-sm"
              />
            </div>
          </div>

          {/* Fecha */}
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1.5">Fecha</label>
            <input
              type="date"
              value={form.fecha}
              onChange={e => set("fecha", e.target.value)}
              className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 text-sm"
            />
          </div>

          {/* Proyecto */}
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1.5">Proyecto</label>
            <select
              value={form.projectId}
              onChange={e => set("projectId", e.target.value)}
              className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 text-sm"
            >
              <option value="global">Global (sin proyecto)</option>
              {proyectos.map(p => <option key={p.id} value={p.id}>{p.nombre || p.name || p.id}</option>)}
            </select>
          </div>

          {/* Notas */}
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1.5">Notas</label>
            <textarea
              value={form.notas}
              onChange={e => set("notas", e.target.value)}
              rows={2}
              placeholder="Opcional..."
              className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 text-sm resize-none"
            />
          </div>
        </div>

        <div className="px-5 pb-5 flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 border-2 border-slate-200 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-50 transition-colors">
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !form.descripcion.trim() || !form.monto}
            className="flex-1 py-3 bg-gradient-to-r from-purple-700 to-violet-600 text-white rounded-xl text-sm font-bold hover:from-purple-600 hover:to-violet-500 disabled:opacity-50 transition-all"
          >
            {saving ? "Guardando..." : editando ? "Guardar cambios" : "Registrar"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Mini gráfico de barras ───────────────────────────────────────────────────
function GraficoFlujo({ meses, datos }) {
  const maxVal = Math.max(1, ...meses.flatMap(m => [datos[m]?.ingresos || 0, datos[m]?.egresos || 0]));
  return (
    <div className="flex items-end justify-between gap-1 h-32">
      {meses.map((m, i) => {
        const ing = datos[m]?.ingresos || 0;
        const egr = datos[m]?.egresos  || 0;
        const flujo = ing - egr;
        const hI = (ing / maxVal) * 100;
        const hE = (egr / maxVal) * 100;
        return (
          <div key={i} className="flex-1 flex flex-col items-center gap-0.5 group relative">
            <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-[10px] rounded-lg px-2 py-1.5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10 shadow-xl">
              <div className="font-bold text-emerald-400">▲ {fmtM(ing)}</div>
              <div className="font-bold text-red-400">▼ {fmtM(egr)}</div>
              <div className={`font-black ${flujo >= 0 ? "text-purple-300" : "text-red-300"}`}>
                {flujo >= 0 ? "+" : ""}{fmtM(flujo)}
              </div>
            </div>
            <div className="w-full flex gap-0.5 items-end" style={{ height: "112px" }}>
              <div className="flex-1 bg-gradient-to-t from-purple-700 to-purple-500 rounded-t-sm" style={{ height: `${hI}%`, minHeight: ing > 0 ? "3px" : "0" }} />
              <div className="flex-1 bg-gradient-to-t from-slate-400 to-slate-300 rounded-t-sm" style={{ height: `${hE}%`, minHeight: egr > 0 ? "3px" : "0" }} />
            </div>
            <span className="text-[9px] font-bold text-slate-500">{mesLabel(m).split(" ")[0]}</span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function FinanzasFlujoCaja() {
  const { proyectoId: proyectoFiltro, proyectos } = useFinanzas();
  const [mesSeleccionado, setMesSeleccionado] = useState(getMesActual());
  const [loading, setLoading]                 = useState(false);

  // Datos
  const [ingresos, setIngresos]         = useState([]);
  const [egresos, setEgresos]           = useState([]);
  const [historial, setHistorial]       = useState({}); // { "2026-03": { ingresos, egresos } }

  // UI
  const [showModal, setShowModal]       = useState(false);
  const [editando, setEditando]         = useState(null);
  const [tabActivo, setTabActivo]       = useState("resumen"); // resumen | movimientos
  const [deletingId, setDeletingId]     = useState(null);

  // Cargar datos del mes seleccionado
  const cargarDatos = useCallback(async () => {
    setLoading(true);
    const desde = primerDia(mesSeleccionado);
    const hasta = ultimoDia(mesSeleccionado);

    try {
      // ── Ingresos manuales (colección finanzas_ingresos) ──
      let qIng = query(
        collection(db, "finanzas_ingresos"),
        where("fecha", ">=", desde),
        where("fecha", "<=", hasta)
      );
      if (proyectoFiltro !== "todos") {
        qIng = query(
          collection(db, "finanzas_ingresos"),
          where("fecha", ">=", desde),
          where("fecha", "<=", hasta),
          where("projectId", "==", proyectoFiltro)
        );
      }
      const ingSnap = await getDocs(qIng);
      const ingData = ingSnap.docs.map(d => ({ id: d.id, fuente: d.data().tipo || "ingreso", ...d.data() }));

      // ── Egresos automáticos ──
      const proyFilter = proyectoFiltro !== "todos" ? proyectoFiltro : null;

      const fetchCol = async (colName, fechaField, montoField, labelField) => {
        let q = proyFilter
          ? query(collection(db, colName), where("projectId", "==", proyFilter), where(fechaField, ">=", desde), where(fechaField, "<=", hasta))
          : query(collection(db, colName), where(fechaField, ">=", desde), where(fechaField, "<=", hasta));
        const snap = await getDocs(q);
        return snap.docs.map(d => ({
          id: d.id,
          fuente: colName,
          descripcion: d.data()[labelField] || d.data().descripcion || d.data().nombre || colName,
          monto: Number(d.data()[montoField]) || 0,
          fecha: d.data()[fechaField] || desde,
          projectId: d.data().projectId || "global",
        }));
      };

      const [rend, ocs, subs, remu, costos] = await Promise.all([
        fetchCol("rendiciones",    "fechaEmision", "monto",       "descripcion"),
        fetchCol("purchaseOrders", "fecha",        "monto",       "descripcion"),
        fetchCol("subcontratos",   "fechaEP",      "montoPagado", "nombreSubcontrato"),
        fetchCol("remuneraciones", "fechaPago",    "totalCosto",  "trabajadorNombre"),
        fetchCol("costos_fijos",   "fechaInicio",  "monto",       "nombre"),
      ]);

      const egresosData = [...rend, ...ocs, ...subs, ...remu, ...costos];

      setIngresos(ingData);
      setEgresos(egresosData);

      // ── Historial 6 meses para gráfico ──
      const hist = {};
      const meses6 = mesesRange(sumarMes(mesSeleccionado, -5), mesSeleccionado);
      await Promise.all(meses6.map(async (m) => {
        const d1 = primerDia(m), d2 = ultimoDia(m);
        // ingresos
        const iSnap = await getDocs(query(collection(db, "finanzas_ingresos"), where("fecha", ">=", d1), where("fecha", "<=", d2)));
        const totalI = iSnap.docs.reduce((s, d) => s + (Number(d.data().monto) || 0), 0);
        // egresos (solo rendiciones para no sobrecargar, expandir luego)
        const eSnap = await getDocs(query(collection(db, "rendiciones"), where("fechaEmision", ">=", d1), where("fechaEmision", "<=", d2)));
        const totalE = eSnap.docs.reduce((s, d) => s + (Number(d.data().monto) || 0), 0);
        hist[m] = { ingresos: totalI, egresos: totalE };
      }));
      setHistorial(hist);

    } catch (err) {
      console.error("Error cargando flujo de caja:", err);
    } finally {
      setLoading(false);
    }
  }, [mesSeleccionado, proyectoFiltro]);

  useEffect(() => { cargarDatos(); }, [cargarDatos]);

  // ── CRUD ingresos ──
  const handleSaveIngreso = async (data) => {
    if (data.id) {
      const ref = doc(db, "finanzas_ingresos", data.id);
      const { id, ...rest } = data;
      await updateDoc(ref, rest);
    } else {
      await addDoc(collection(db, "finanzas_ingresos"), { ...data, creadoEn: new Date().toISOString() });
    }
    cargarDatos();
  };

  const handleDelete = async (id) => {
    setDeletingId(id);
    await deleteDoc(doc(db, "finanzas_ingresos", id));
    setDeletingId(null);
    cargarDatos();
  };

  // ── Cálculos ──
  const totalIngresos  = ingresos.reduce((s, i) => s + (i.tipo === "proyeccion" ? 0 : i.monto), 0);
  const totalProyectado = ingresos.reduce((s, i) => s + (i.tipo === "proyeccion" ? i.monto : 0), 0);
  const totalEgresos   = egresos.reduce((s, e) => s + e.monto, 0);
  const flujoReal      = totalIngresos - totalEgresos;
  const flujoProyectado = (totalIngresos + totalProyectado) - totalEgresos;

  const meses6 = mesesRange(sumarMes(mesSeleccionado, -5), mesSeleccionado);

  // Movimientos mezclados para tabla
  const movimientos = [
    ...ingresos.map(i => ({ ...i, esIngreso: true })),
    ...egresos.map(e => ({ ...e, esIngreso: false })),
  ].sort((a, b) => (b.fecha || "").localeCompare(a.fecha || ""));

  return (
    <div className="space-y-4 sm:space-y-6 p-4 sm:p-6">

      {/* Header */}
      <div className="glass-card rounded-xl sm:rounded-2xl p-4 sm:p-6 animate-fadeInUp">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br from-purple-700 to-violet-600 flex items-center justify-center shadow-lg flex-shrink-0">
              <svg className="w-5 h-5 sm:w-6 sm:h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                Flujo de <span className="text-purple-700">Caja</span>
              </h1>
              <p className="text-slate-500 text-xs sm:text-sm mt-0.5">Real y proyectado · {mesLabel(mesSeleccionado)}</p>
            </div>
          </div>

          {/* Filtros */}
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="month"
              value={mesSeleccionado}
              onChange={e => setMesSeleccionado(e.target.value)}
              className="input-modern text-sm px-3 py-2"
            />
            <ProyectoSelector />
            <button
              onClick={() => { setEditando(null); setShowModal(true); }}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-700 to-violet-600 text-white text-sm font-bold rounded-xl hover:from-purple-600 hover:to-violet-500 transition-all shadow-md"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Registrar Ingreso
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="spinner w-10 h-10 border-purple-600" />
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {[
              { icon: "💵", label: "Ingresos Reales",    value: fmtM(totalIngresos),   gradient: "from-purple-700 to-violet-600", positive: true  },
              { icon: "📉", label: "Egresos del Mes",    value: fmtM(totalEgresos),    gradient: "from-red-500 to-rose-600",     positive: false },
              { icon: "⚖️", label: "Flujo Real",         value: (flujoReal >= 0 ? "+" : "") + fmtM(flujoReal),       gradient: flujoReal >= 0 ? "from-emerald-600 to-teal-600" : "from-red-600 to-rose-600", positive: flujoReal >= 0 },
              { icon: "🔮", label: "Flujo Proyectado",   value: (flujoProyectado >= 0 ? "+" : "") + fmtM(flujoProyectado), gradient: "from-violet-600 to-purple-500", positive: flujoProyectado >= 0 },
            ].map((k, i) => (
              <div key={i} className="glass-card rounded-xl p-4 sm:p-5 hover:shadow-lg transition-shadow">
                <div className="flex items-start justify-between mb-3">
                  <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${k.gradient} flex items-center justify-center shadow-md text-xl`}>{k.icon}</div>
                  {k.positive !== undefined && (
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${k.positive ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                      {k.positive ? "▲" : "▼"}
                    </span>
                  )}
                </div>
                <div className="text-xl sm:text-2xl font-black text-slate-900 break-words">{k.value}</div>
                <div className="text-xs sm:text-sm font-semibold text-slate-600 mt-0.5">{k.label}</div>
              </div>
            ))}
          </div>

          {/* Gráfico + desglose egresos */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">

            {/* Gráfico 6 meses */}
            <div className="glass-card rounded-xl p-4 sm:p-6">
              <div className="flex items-center gap-2 mb-4">
                <span className="text-xl">📊</span>
                <h3 className="text-base font-bold text-slate-900">Flujo — Últimos 6 meses</h3>
              </div>
              <div className="flex items-center gap-4 mb-3">
                <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-purple-600"/><span className="text-xs text-slate-500">Ingresos</span></div>
                <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-slate-300"/><span className="text-xs text-slate-500">Egresos</span></div>
              </div>
              <GraficoFlujo meses={meses6} datos={historial} />
            </div>

            {/* Desglose egresos por fuente */}
            <div className="glass-card rounded-xl p-4 sm:p-6">
              <div className="flex items-center gap-2 mb-4">
                <span className="text-xl">📦</span>
                <h3 className="text-base font-bold text-slate-900">Desglose de Egresos</h3>
              </div>
              {(() => {
                const porFuente = {};
                egresos.forEach(e => {
                  porFuente[e.fuente] = (porFuente[e.fuente] || 0) + e.monto;
                });
                const total = Object.values(porFuente).reduce((s, v) => s + v, 0) || 1;
                return Object.entries(porFuente).length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-6">Sin egresos registrados este mes</p>
                ) : (
                  <div className="space-y-3">
                    {Object.entries(porFuente).sort((a,b) => b[1]-a[1]).map(([fuente, monto]) => (
                      <div key={fuente}>
                        <div className="flex items-center justify-between mb-1">
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${CAT_COLORS[fuente] || "bg-slate-100 text-slate-600"}`}>
                            {CAT_LABELS[fuente] || fuente}
                          </span>
                          <span className="text-xs font-black text-slate-800">{fmtM(monto)}</span>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-2">
                          <div className="h-2 rounded-full bg-gradient-to-r from-purple-600 to-violet-500" style={{ width: `${(monto/total)*100}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          </div>

          {/* Tabs movimientos */}
          <div className="glass-card rounded-xl overflow-hidden">
            {/* Tab bar */}
            <div className="flex border-b border-slate-200">
              {[
                { id: "resumen",      label: "Resumen" },
                { id: "ingresos",     label: `Ingresos (${ingresos.length})` },
                { id: "egresos",      label: `Egresos (${egresos.length})` },
                { id: "movimientos",  label: "Todos" },
              ].map(t => (
                <button
                  key={t.id}
                  onClick={() => setTabActivo(t.id)}
                  className={`px-4 py-3 text-xs sm:text-sm font-bold transition-colors border-b-2 -mb-px ${
                    tabActivo === t.id
                      ? "border-purple-700 text-purple-700"
                      : "border-transparent text-slate-500 hover:text-slate-700"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="p-4 sm:p-6">

              {/* Tab: Resumen */}
              {tabActivo === "resumen" && (
                <div className="space-y-2">
                  {[
                    { label: "Ingresos reales",      valor: totalIngresos,   color: "text-emerald-700" },
                    { label: "Proyecciones",          valor: totalProyectado, color: "text-violet-700"  },
                    { label: "Rendiciones",           valor: egresos.filter(e=>e.fuente==="rendiciones").reduce((s,e)=>s+e.monto,0),    color: "text-red-700" },
                    { label: "Órdenes de Compra",     valor: egresos.filter(e=>e.fuente==="purchaseOrders").reduce((s,e)=>s+e.monto,0), color: "text-red-700" },
                    { label: "Subcontratos",          valor: egresos.filter(e=>e.fuente==="subcontratos").reduce((s,e)=>s+e.monto,0),   color: "text-red-700" },
                    { label: "Remuneraciones",        valor: egresos.filter(e=>e.fuente==="remuneraciones").reduce((s,e)=>s+e.monto,0), color: "text-red-700" },
                    { label: "Costos Fijos",          valor: egresos.filter(e=>e.fuente==="costos_fijos").reduce((s,e)=>s+e.monto,0),   color: "text-red-700" },
                  ].map((row, i) => (
                    <div key={i} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                      <span className="text-sm text-slate-600">{row.label}</span>
                      <span className={`text-sm font-black ${row.color}`}>{fmtM(row.valor)}</span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between pt-3 mt-1">
                    <span className="text-sm font-black text-slate-800">Flujo Neto Real</span>
                    <span className={`text-lg font-black ${flujoReal >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                      {flujoReal >= 0 ? "+" : ""}{fmtM(flujoReal)}
                    </span>
                  </div>
                </div>
              )}

              {/* Tab: Ingresos */}
              {tabActivo === "ingresos" && (
                <TablaMovimientos
                  items={ingresos.map(i => ({ ...i, esIngreso: true }))}
                  onEdit={item => { setEditando(item); setShowModal(true); }}
                  onDelete={handleDelete}
                  deletingId={deletingId}
                  soloIngresos
                />
              )}

              {/* Tab: Egresos */}
              {tabActivo === "egresos" && (
                <TablaMovimientos
                  items={egresos.map(e => ({ ...e, esIngreso: false }))}
                  soloEgresos
                />
              )}

              {/* Tab: Todos */}
              {tabActivo === "movimientos" && (
                <TablaMovimientos
                  items={movimientos}
                  onEdit={item => { if(item.esIngreso) { setEditando(item); setShowModal(true); }}}
                  onDelete={handleDelete}
                  deletingId={deletingId}
                />
              )}
            </div>
          </div>
        </>
      )}

      {/* Modal */}
      {showModal && (
        <ModalIngreso
          onClose={() => { setShowModal(false); setEditando(null); }}
          onSave={handleSaveIngreso}
          editando={editando}
          proyectos={proyectos}
          mesActual={mesSeleccionado}
        />
      )}
    </div>
  );
}

// ─── Tabla de movimientos ─────────────────────────────────────────────────────
function TablaMovimientos({ items, onEdit, onDelete, deletingId, soloIngresos, soloEgresos }) {
  if (items.length === 0) {
    return <p className="text-sm text-slate-400 text-center py-8">Sin movimientos para mostrar</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200">
            <th className="text-left py-2 px-2 text-xs font-black text-slate-500 uppercase tracking-wider">Fecha</th>
            <th className="text-left py-2 px-2 text-xs font-black text-slate-500 uppercase tracking-wider">Descripción</th>
            <th className="text-left py-2 px-2 text-xs font-black text-slate-500 uppercase tracking-wider hidden sm:table-cell">Fuente</th>
            <th className="text-right py-2 px-2 text-xs font-black text-slate-500 uppercase tracking-wider">Monto</th>
            {(onEdit || onDelete) && <th className="py-2 px-2 w-16" />}
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => (
            <tr key={item.id || i} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
              <td className="py-2.5 px-2 text-slate-500 text-xs whitespace-nowrap">{item.fecha || "—"}</td>
              <td className="py-2.5 px-2 font-semibold text-slate-800 max-w-[180px] truncate">{item.descripcion || "—"}</td>
              <td className="py-2.5 px-2 hidden sm:table-cell">
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${CAT_COLORS[item.fuente] || "bg-slate-100 text-slate-600"}`}>
                  {CAT_LABELS[item.fuente] || item.fuente || "—"}
                </span>
              </td>
              <td className={`py-2.5 px-2 text-right font-black text-sm ${item.esIngreso ? "text-emerald-700" : "text-red-700"}`}>
                {item.esIngreso ? "+" : "-"}{fmtM(item.monto)}
              </td>
              {(onEdit || onDelete) && (
                <td className="py-2.5 px-2">
                  <div className="flex items-center justify-end gap-1">
                    {onEdit && item.esIngreso && (
                      <button onClick={() => onEdit(item)} className="p-1.5 hover:bg-purple-50 rounded-lg transition-colors text-slate-400 hover:text-purple-700">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                    )}
                    {onDelete && item.esIngreso && (
                      <button
                        onClick={() => onDelete(item.id)}
                        disabled={deletingId === item.id}
                        className="p-1.5 hover:bg-red-50 rounded-lg transition-colors text-slate-400 hover:text-red-600 disabled:opacity-40"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    )}
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
