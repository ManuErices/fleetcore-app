import React, { useState, useEffect, useMemo } from "react";
import {
  collection, query, orderBy, getDocs,
  addDoc, updateDoc, deleteDoc, doc, serverTimestamp
} from "firebase/firestore";
import { db } from "../lib/firebase";
import CostosFijosModal from "../components/CostosFijosModal";

// ─── Constantes ────────────────────────────────────────────────────────────────
const CATEGORIAS = {
  credito:  { label: "Crédito Bancario",     color: "from-blue-500 to-blue-700",      badge: "bg-blue-100 text-blue-700",      dot: "bg-blue-500",     icon: "M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" },
  leasing:  { label: "Leasing",              color: "from-violet-500 to-purple-700",  badge: "bg-violet-100 text-violet-700",  dot: "bg-violet-500",   icon: "M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" },
  arriendo: { label: "Arriendo",             color: "from-emerald-500 to-teal-700",   badge: "bg-emerald-100 text-emerald-700",dot: "bg-emerald-500",  icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" },
  seguro:   { label: "Seguro",               color: "from-amber-500 to-orange-600",   badge: "bg-amber-100 text-amber-700",    dot: "bg-amber-500",    icon: "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" },
  servicio: { label: "Servicio / Suscripción", color: "from-sky-500 to-cyan-600",    badge: "bg-sky-100 text-sky-700",         dot: "bg-sky-500",      icon: "M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" },
  otro:     { label: "Crédito Automotriz",                 color: "from-slate-500 to-slate-700",    badge: "bg-slate-100 text-slate-700",    dot: "bg-slate-400",    icon: "M8 17a2 2 0 100-4 2 2 0 000 4zm8 0a2 2 0 100-4 2 2 0 000 4zM3 9l1.5-4.5A2 2 0 016.4 3h11.2a2 2 0 011.9 1.5L21 9M3 9h18M3 9l-1 6h20l-1-6" },
};

const FRECUENCIAS = { mensual:"Mensual", trimestral:"Trimestral", semestral:"Semestral", anual:"Anual", unico:"Pago único" };

function montoMensual(costo) {
  const m = parseFloat(costo.monto) || 0;
  if (costo.frecuencia === "mensual")     return m;
  if (costo.frecuencia === "trimestral")  return m / 3;
  if (costo.frecuencia === "semestral")   return m / 6;
  if (costo.frecuencia === "anual")       return m / 12;
  return 0;
}

function formatMonto(n, moneda = "CLP") {
  if (moneda === "CLP") return `$${Math.round(n).toLocaleString("es-CL")}`;
  if (moneda === "UF")  return `UF ${n.toLocaleString("es-CL", { minimumFractionDigits:2, maximumFractionDigits:2 })}`;
  return `US$${n.toLocaleString("es-CL", { minimumFractionDigits:2, maximumFractionDigits:2 })}`;
}

function diasRestantes(fechaTermino) {
  if (!fechaTermino) return null;
  const diff = new Date(fechaTermino) - new Date();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

// ─── Componente principal ──────────────────────────────────────────────────────
export default function CostosFijos() {
  const [costos, setCostos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingCosto, setEditingCosto] = useState(null);
  const [filtroCategoria, setFiltroCategoria] = useState("todos");
  const [filtroEstado, setFiltroEstado] = useState("activos");
  const [busqueda, setBusqueda] = useState("");
  const [vistaDetalle, setVistaDetalle] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [sortCol, setSortCol] = useState("nombre");
  const [sortDir, setSortDir] = useState("asc");

  const handleSort = (col) => {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("asc"); }
  };

  // ── Cargar datos ──
  const cargarCostos = async () => {
    setLoading(true);
    try {
      const q = query(collection(db, "costos_fijos"), orderBy("fechaCreacion", "desc"));
      const snap = await getDocs(q);
      setCostos(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error("Error cargando costos:", e);
    }
    setLoading(false);
  };

  useEffect(() => { cargarCostos(); }, []);

  // ── Guardar ──
  const handleSave = async (form) => {
    const data = { ...form, monto: parseFloat(form.monto) || 0 };
    if (editingCosto) {
      await updateDoc(doc(db, "costos_fijos", editingCosto.id), data);
    } else {
      await addDoc(collection(db, "costos_fijos"), { ...data, fechaCreacion: serverTimestamp() });
    }
    setEditingCosto(null);
    await cargarCostos();
  };

  // ── Eliminar ──
  const handleEliminar = async (id) => {
    if (!window.confirm("¿Eliminar este costo? Esta acción no se puede deshacer.")) return;
    setDeletingId(id);
    await deleteDoc(doc(db, "costos_fijos", id));
    setDeletingId(null);
    if (vistaDetalle?.id === id) setVistaDetalle(null);
    await cargarCostos();
  };

  // ── Toggle activo ──
  const toggleActivo = async (costo) => {
    await updateDoc(doc(db, "costos_fijos", costo.id), { activo: !costo.activo });
    await cargarCostos();
  };

  // ── Filtrado ──
  const costosSinOrdenar = useMemo(() => {
    return costos.filter(c => {
      if (filtroEstado === "activos"   && !c.activo) return false;
      if (filtroEstado === "inactivos" &&  c.activo) return false;
      if (filtroCategoria !== "todos" && c.categoria !== filtroCategoria) return false;
      if (busqueda) {
        const b = busqueda.toLowerCase();
        return (c.nombre||"").toLowerCase().includes(b)
            || (c.proveedor||"").toLowerCase().includes(b)
            || (c.descripcion||"").toLowerCase().includes(b);
      }
      return true;
    });
  }, [costos, filtroEstado, filtroCategoria, busqueda]);

  const costosFiltrados = useMemo(() => {
    return [...costosSinOrdenar].sort((a, b) => {
      let va, vb;
      if      (sortCol === "nombre") { va = (a.nombre||"").toLowerCase();   vb = (b.nombre||"").toLowerCase(); }
      else if (sortCol === "cat")    { va = (a.categoria||"");              vb = (b.categoria||""); }
      else if (sortCol === "prov")   { va = (a.proveedor||"").toLowerCase();vb = (b.proveedor||"").toLowerCase(); }
      else if (sortCol === "monto")  { va = parseFloat(a.monto)||0;         vb = parseFloat(b.monto)||0; }
      else if (sortCol === "mens")   { va = montoMensual(a);                vb = montoMensual(b); }
      else if (sortCol === "frec")   { va = (a.frecuencia||"");             vb = (b.frecuencia||""); }
      else if (sortCol === "dia")    { va = parseInt(a.diaPago)||0;         vb = parseInt(b.diaPago)||0; }
      else if (sortCol === "venc")   { va = a.fechaTermino||"9999";         vb = b.fechaTermino||"9999"; }
      else { va = ""; vb = ""; }
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ?  1 : -1;
      return 0;
    });
  }, [costosSinOrdenar, sortCol, sortDir]);

  // ── KPIs ──
  const activos = useMemo(() => costos.filter(c => c.activo), [costos]);
  const totalMensual = useMemo(() => activos.reduce((s, c) => s + montoMensual(c), 0), [activos]);
  const totalAnual   = useMemo(() => totalMensual * 12, [totalMensual]);
  const porCategoria = useMemo(() => {
    const res = {};
    activos.forEach(c => {
      if (!res[c.categoria]) res[c.categoria] = 0;
      res[c.categoria] += montoMensual(c);
    });
    return res;
  }, [activos]);

  const topCategoria = useMemo(() => {
    const entries = Object.entries(porCategoria);
    if (!entries.length) return null;
    const [cat, monto] = entries.sort((a,b) => b[1]-a[1])[0];
    return { cat, monto };
  }, [porCategoria]);


  // ── Helper icono de sort ──
  const SortIcon = ({ col }) => {
    if (sortCol !== col) return (
      <svg className="w-3 h-3 text-white/30 ml-1 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4" />
      </svg>
    );
    return sortDir === "asc"
      ? <svg className="w-3 h-3 text-white ml-1 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" /></svg>
      : <svg className="w-3 h-3 text-white ml-1 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>;
  };

  // ─────────────────────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-slate-800 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-slate-600 font-semibold">Cargando costos fijos...</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-slate-100 to-blue-50 p-4 sm:p-6 lg:p-8">

      {/* ── HEADER ── */}
      <div className="max-w-7xl mx-auto mb-8">
        <div className="bg-gradient-to-r from-slate-800 via-slate-900 to-blue-950 rounded-2xl shadow-2xl p-8 relative overflow-hidden">
          {/* Decorativo */}
          <div className="absolute inset-0 opacity-10">
            <div className="absolute top-0 right-0 w-96 h-96 bg-blue-400 rounded-full blur-3xl -translate-y-1/2 translate-x-1/4" />
            <div className="absolute bottom-0 left-1/3 w-64 h-64 bg-slate-400 rounded-full blur-2xl translate-y-1/2" />
          </div>
          <div className="relative flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-white/10 backdrop-blur-sm border border-white/20 flex items-center justify-center">
                <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 11h.01M12 11h.01M15 11h.01M4 19h16a2 2 0 002-2V7a2 2 0 00-2-2H4a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-slate-400 text-xs font-semibold uppercase tracking-widest">Administración</span>
                  <svg className="w-3 h-3 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                </div>
                <h1 className="text-3xl font-black text-white tracking-tight">Costos Fijos</h1>
                <p className="text-slate-400 text-sm mt-0.5">Gestión de créditos, leasings, arriendos y compromisos recurrentes</p>
              </div>
            </div>
            <button
              onClick={() => { setEditingCosto(null); setShowModal(true); }}
              className="flex items-center gap-2 px-6 py-3 bg-white hover:bg-slate-50 text-slate-900 font-bold rounded-xl transition-all shadow-lg hover:shadow-xl text-sm"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Nuevo Costo
            </button>
          </div>
        </div>
      </div>

      {/* ── KPI CARDS ── */}
      <div className="max-w-7xl mx-auto grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {/* Total mensual */}
        <div className="bg-white rounded-2xl shadow-md border border-slate-100 p-5 col-span-2 lg:col-span-1">
          <p className="text-xs font-black text-slate-400 uppercase tracking-wider mb-1">Costo mensual total</p>
          <p className="text-3xl font-black text-slate-900">{formatMonto(totalMensual)}</p>
          <p className="text-xs text-slate-400 mt-1">{activos.length} costos activos</p>
        </div>
        {/* Total anual */}
        <div className="bg-white rounded-2xl shadow-md border border-slate-100 p-5">
          <p className="text-xs font-black text-slate-400 uppercase tracking-wider mb-1">Proyección anual</p>
          <p className="text-2xl font-black text-slate-900">{formatMonto(totalAnual)}</p>
          <p className="text-xs text-slate-400 mt-1">En base a activos</p>
        </div>
        {/* Mayor categoría */}
        <div className="bg-white rounded-2xl shadow-md border border-slate-100 p-5">
          <p className="text-xs font-black text-slate-400 uppercase tracking-wider mb-1">Mayor categoría</p>
          {topCategoria ? (
            <>
              <div className="flex items-center gap-1.5 mt-1">
                <div className={`w-2.5 h-2.5 rounded-full ${CATEGORIAS[topCategoria.cat]?.dot || "bg-slate-400"}`} />
                <p className="text-sm font-black text-slate-900">{CATEGORIAS[topCategoria.cat]?.label}</p>
              </div>
              <p className="text-xs text-slate-400 mt-1">{formatMonto(topCategoria.monto)}/mes</p>
            </>
          ) : <p className="text-sm text-slate-400 mt-1">Sin datos</p>}
        </div>
        {/* Total costos */}
        <div className="bg-white rounded-2xl shadow-md border border-slate-100 p-5">
          <p className="text-xs font-black text-slate-400 uppercase tracking-wider mb-1">Total registros</p>
          <p className="text-3xl font-black text-slate-900">{costos.length}</p>
          <p className="text-xs text-slate-400 mt-1">{costos.filter(c=>!c.activo).length} inactivos</p>
        </div>
      </div>

      {/* ── BARRA DISTRIBUCIÓN ── */}
      {activos.length > 0 && totalMensual > 0 && (
        <div className="max-w-7xl mx-auto mb-6">
          <div className="bg-white rounded-2xl shadow-md border border-slate-100 p-5">
            <p className="text-xs font-black text-slate-400 uppercase tracking-wider mb-3">Distribución mensual por categoría</p>
            <div className="flex h-3 rounded-full overflow-hidden gap-0.5">
              {Object.entries(porCategoria).sort((a,b)=>b[1]-a[1]).map(([cat, monto]) => {
                const pct = (monto / totalMensual) * 100;
                const meta = CATEGORIAS[cat] || CATEGORIAS.otro;
                return (
                  <div
                    key={cat}
                    className={`bg-gradient-to-r ${meta.color} rounded-full transition-all`}
                    style={{ width: `${pct}%` }}
                    title={`${meta.label}: ${formatMonto(monto)}/mes (${pct.toFixed(1)}%)`}
                  />
                );
              })}
            </div>
            <div className="flex flex-wrap gap-3 mt-3">
              {Object.entries(porCategoria).sort((a,b)=>b[1]-a[1]).map(([cat, monto]) => {
                const meta = CATEGORIAS[cat] || CATEGORIAS.otro;
                const pct = ((monto / totalMensual) * 100).toFixed(1);
                return (
                  <div key={cat} className="flex items-center gap-1.5">
                    <div className={`w-2 h-2 rounded-full ${meta.dot}`} />
                    <span className="text-xs text-slate-500">{meta.label}</span>
                    <span className="text-xs font-bold text-slate-700">{pct}%</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── FILTROS ── */}
      <div className="max-w-7xl mx-auto mb-5 flex flex-col sm:flex-row gap-3">
        {/* Búsqueda */}
        <div className="relative flex-1">
          <svg className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          <input
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre, proveedor..."
            className="w-full pl-10 pr-4 py-2.5 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-slate-400 text-sm bg-white"
          />
        </div>

        {/* Filtro estado */}
        <div className="flex gap-1 bg-white rounded-xl border-2 border-slate-200 p-1">
          {[["todos","Todos"],["activos","Activos"],["inactivos","Inactivos"]].map(([v,l]) => (
            <button
              key={v}
              onClick={() => setFiltroEstado(v)}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${filtroEstado===v ? "bg-slate-900 text-white shadow" : "text-slate-500 hover:text-slate-700"}`}
            >{l}</button>
          ))}
        </div>

        {/* Filtro categoría */}
        <select
          value={filtroCategoria}
          onChange={e => setFiltroCategoria(e.target.value)}
          className="px-4 py-2.5 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-slate-400 text-sm bg-white font-semibold text-slate-700"
        >
          <option value="todos">Todas las categorías</option>
          {Object.entries(CATEGORIAS).map(([id, c]) => (
            <option key={id} value={id}>{c.label}</option>
          ))}
        </select>
      </div>

      {/* ── TABLA ── */}
      <div className="max-w-7xl mx-auto">
        <div className="bg-white rounded-2xl shadow-lg overflow-hidden border border-slate-100">

          {costosFiltrados.length === 0 ? (
            <div className="py-20 text-center">
              <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 11h.01M12 11h.01M15 11h.01M4 19h16a2 2 0 002-2V7a2 2 0 00-2-2H4a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
              </div>
              <p className="font-bold text-slate-600">No hay costos registrados</p>
              <p className="text-sm text-slate-400 mt-1">
                {busqueda || filtroCategoria !== "todos" ? "Intenta ajustar los filtros" : "Haz click en 'Nuevo Costo' para comenzar"}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gradient-to-r from-slate-800 to-slate-900 text-white">
                  <tr>
                    {[
                      { col:"nombre", label:"Costo",          align:"text-left",   cls:"px-5 py-4" },
                      { col:"cat",    label:"Categoría",      align:"text-left",   cls:"px-4 py-4" },
                      { col:"prov",   label:"Proveedor",      align:"text-left",   cls:"px-4 py-4" },
                                      { col:"mens",   label:"Mensual equiv.", align:"text-right",  cls:"px-4 py-4" },
                      { col:"frec",   label:"Frecuencia",     align:"text-center", cls:"px-4 py-4" },
                      { col:"venc",   label:"Vencimiento",    align:"text-center", cls:"px-4 py-4" },
                      { col:"dia",    label:"Día pago",       align:"text-center", cls:"px-4 py-4" },
                    ].map(({ col, label, align, cls }) => (
                      <th
                        key={col}
                        onClick={() => handleSort(col)}
                        className={`${cls} ${align} text-xs font-black uppercase tracking-wider cursor-pointer hover:bg-white/10 select-none transition-colors`}
                      >
                        {label}<SortIcon col={col} />
                      </th>
                    ))}
                    <th className="px-4 py-4 text-center text-xs font-black uppercase tracking-wider">Estado</th>
                    <th className="px-4 py-4 text-center text-xs font-black uppercase tracking-wider">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {costosFiltrados.map((costo, idx) => {
                    const meta = CATEGORIAS[costo.categoria] || CATEGORIAS.otro;
                    const dias = diasRestantes(costo.fechaTermino);
                    const mensual = montoMensual(costo);
                    const vencimientoAlerta = dias !== null && dias <= 30;
                    return (
                      <tr
                        key={costo.id}
                        className={`hover:bg-slate-50 transition-colors cursor-pointer ${idx%2===0?"bg-white":"bg-slate-50/30"} ${!costo.activo?"opacity-60":""}`}
                        onClick={() => setVistaDetalle(vistaDetalle?.id===costo.id ? null : costo)}
                      >
                        {/* Nombre */}
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${meta.color} flex items-center justify-center flex-shrink-0`}>
                              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d={meta.icon} /></svg>
                            </div>
                            <div>
                              <p className="font-bold text-slate-900 text-sm">{costo.nombre}</p>
                              {costo.descripcion && <p className="text-xs text-slate-400 truncate max-w-[200px]">{costo.descripcion}</p>}
                            </div>
                          </div>
                        </td>
                        {/* Categoría */}
                        <td className="px-4 py-4">
                          <span className={`px-2.5 py-1 rounded-lg text-xs font-bold ${meta.badge}`}>{meta.label}</span>
                        </td>
                        {/* Proveedor */}
                        <td className="px-4 py-4 text-sm text-slate-600">{costo.proveedor || "—"}</td>

                        {/* Mensual equiv */}
                        <td className="px-4 py-4 text-right">
                          {costo.frecuencia !== "unico" ? (
                            <span className="text-sm font-semibold text-slate-500">{formatMonto(mensual)}/mes</span>
                          ) : <span className="text-xs text-slate-400">Único</span>}
                        </td>
                        {/* Frecuencia */}
                        <td className="px-4 py-4 text-center">
                          <span className="text-xs font-semibold text-slate-600 bg-slate-100 px-2 py-1 rounded-lg">{FRECUENCIAS[costo.frecuencia]||costo.frecuencia}</span>
                        </td>
                        {/* Vencimiento */}
                        <td className="px-4 py-4 text-center">
                          {costo.fechaTermino ? (
                            <div className={`text-xs font-semibold ${vencimientoAlerta?"text-red-600":"text-slate-500"}`}>
                              {dias !== null && dias < 0 ? (
                                <span className="bg-red-100 text-red-700 px-2 py-1 rounded-lg">Vencido</span>
                              ) : vencimientoAlerta ? (
                                <span className="bg-amber-100 text-amber-700 px-2 py-1 rounded-lg">{dias}d</span>
                              ) : (
                                new Date(costo.fechaTermino).toLocaleDateString("es-CL")
                              )}
                            </div>
                          ) : <span className="text-slate-300 text-xs">—</span>}
                        </td>
                        {/* Día de pago */}
                        <td className="px-4 py-4 text-center">
                          {costo.diaPago ? (
                            <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 font-black text-sm px-3 py-1 rounded-lg">
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                              Día {costo.diaPago}
                            </span>
                          ) : <span className="text-slate-300 text-xs">—</span>}
                        </td>
                        {/* Estado toggle */}
                        <td className="px-4 py-4 text-center" onClick={e => { e.stopPropagation(); toggleActivo(costo); }}>
                          <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold cursor-pointer transition-all ${costo.activo?"bg-emerald-100 text-emerald-700 hover:bg-emerald-200":"bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>
                            <div className={`w-1.5 h-1.5 rounded-full ${costo.activo?"bg-emerald-500":"bg-slate-400"}`} />
                            {costo.activo ? "Activo" : "Inactivo"}
                          </div>
                        </td>
                        {/* Acciones */}
                        <td className="px-4 py-4 text-center" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => { setEditingCosto(costo); setShowModal(true); }}
                              className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-blue-100 hover:text-blue-700 text-slate-500 flex items-center justify-center transition-all"
                              title="Editar"
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                            </button>
                            <button
                              onClick={() => handleEliminar(costo.id)}
                              disabled={deletingId === costo.id}
                              className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-red-100 hover:text-red-600 text-slate-500 flex items-center justify-center transition-all disabled:opacity-50"
                              title="Eliminar"
                            >
                              {deletingId === costo.id
                                ? <div className="w-3.5 h-3.5 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
                                : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                              }
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Footer tabla */}
          {costosFiltrados.length > 0 && (
            <div className="px-5 py-4 bg-gradient-to-r from-slate-800 to-slate-900 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-400">{costosFiltrados.length} registros mostrados</span>
              <div className="flex items-center gap-6">
                <div className="text-right">
                  <p className="text-xs text-slate-500">Total mensual equiv. (filtro)</p>
                  <p className="text-lg font-black text-white">
                    {formatMonto(costosFiltrados.filter(c=>c.activo).reduce((s,c)=>s+montoMensual(c),0))}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── DETALLE EXPANDIDO ── */}
      {vistaDetalle && (
        <div className="max-w-7xl mx-auto mt-4">
          <div className="bg-white rounded-2xl shadow-lg border border-slate-100 overflow-hidden">
            {(() => {
              const c = vistaDetalle;
              const meta = CATEGORIAS[c.categoria] || CATEGORIAS.otro;
              const dias = diasRestantes(c.fechaTermino);
              return (
                <>
                  <div className={`bg-gradient-to-r ${meta.color} px-6 py-4 flex items-center justify-between`}>
                    <h3 className="text-white font-black text-lg">{c.nombre}</h3>
                    <button onClick={() => setVistaDetalle(null)} className="w-7 h-7 bg-white/20 hover:bg-white/30 rounded-lg flex items-center justify-center">
                      <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                  <div className="p-6 grid grid-cols-2 sm:grid-cols-4 gap-5">
                    <div><p className="text-xs text-slate-400 font-semibold uppercase mb-1">Monto</p><p className="font-black text-slate-900">{formatMonto(c.monto, c.moneda)}</p></div>
                    <div><p className="text-xs text-slate-400 font-semibold uppercase mb-1">Mensual equiv.</p><p className="font-black text-slate-900">{c.frecuencia!=="unico"?formatMonto(montoMensual(c)):"Pago único"}</p></div>
                    <div><p className="text-xs text-slate-400 font-semibold uppercase mb-1">Frecuencia</p><p className="font-bold text-slate-700">{FRECUENCIAS[c.frecuencia]}</p></div>
                    <div><p className="text-xs text-slate-400 font-semibold uppercase mb-1">Proveedor</p><p className="font-bold text-slate-700">{c.proveedor||"—"}</p></div>
                    <div><p className="text-xs text-slate-400 font-semibold uppercase mb-1">Inicio</p><p className="font-bold text-slate-700">{c.fechaInicio||"—"}</p></div>
                    <div><p className="text-xs text-slate-400 font-semibold uppercase mb-1">Término</p><p className={`font-bold ${dias !== null && dias<=30?"text-red-600":"text-slate-700"}`}>{c.fechaTermino||"Sin fecha"}</p></div>
                    <div><p className="text-xs text-slate-400 font-semibold uppercase mb-1">Día de pago</p><p className="font-black text-blue-700 text-lg">{c.diaPago ? `Día ${c.diaPago}` : "—"}</p></div>
                    <div><p className="text-xs text-slate-400 font-semibold uppercase mb-1">N° Contrato</p><p className="font-bold text-slate-700 font-mono">{c.numeroContrato||"—"}</p></div>
                    <div><p className="text-xs text-slate-400 font-semibold uppercase mb-1">Estado</p><span className={`px-2.5 py-1 rounded-lg text-xs font-bold ${c.activo?"bg-emerald-100 text-emerald-700":"bg-slate-100 text-slate-500"}`}>{c.activo?"Activo":"Inactivo"}</span></div>
                    {c.descripcion && <div className="col-span-2 sm:col-span-4"><p className="text-xs text-slate-400 font-semibold uppercase mb-1">Descripción</p><p className="text-slate-700 text-sm">{c.descripcion}</p></div>}
                    {c.notas && <div className="col-span-2 sm:col-span-4"><p className="text-xs text-slate-400 font-semibold uppercase mb-1">Notas</p><p className="text-slate-600 text-sm bg-slate-50 rounded-xl p-3">{c.notas}</p></div>}
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* ── MODAL ── */}
      <CostosFijosModal
        isOpen={showModal}
        onClose={() => { setShowModal(false); setEditingCosto(null); }}
        onSave={handleSave}
        editingCosto={editingCosto}
      />
    </div>
  );
}
