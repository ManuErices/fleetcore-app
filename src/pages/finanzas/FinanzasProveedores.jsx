import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  collection, getDocs, addDoc, updateDoc, deleteDoc,
  doc, serverTimestamp, query, orderBy
} from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useEmpresa } from "../../lib/useEmpresa";
import { useFinanzas, ProyectoSelector } from "./FinanzasContext";

// ─── Constantes ───────────────────────────────────────────────────────────────
const FUENTES = {
  rendicion:    { label: "Rendición",      color: "from-blue-500 to-blue-700",     badge: "bg-blue-100 text-blue-700",     dot: "bg-blue-500"    },
  subcontrato:  { label: "Subcontrato",    color: "from-violet-500 to-purple-700", badge: "bg-violet-100 text-violet-700", dot: "bg-violet-500"  },
  oc:           { label: "Orden de Compra",color: "from-amber-500 to-orange-600",  badge: "bg-amber-100 text-amber-700",   dot: "bg-amber-500"   },
  manual:       { label: "Manual",         color: "from-emerald-500 to-teal-600",  badge: "bg-emerald-100 text-emerald-700",dot: "bg-emerald-500"},
};

const ESTADOS_PAGO = ["Pendiente", "Pagado", "Parcial", "Vencido"];

const EMPTY_MANUAL = {
  razonSocial: "", rut: "", descripcion: "", monto: 0, moneda: "CLP",
  fecha: "", projectId: "", estado: "Pendiente", notas: "",
};

// ─── Utilidades ───────────────────────────────────────────────────────────────
function fmtM(n) {
  if (!n && n !== 0) return "—";
  if (Math.abs(n) >= 1000000) return "$" + (n / 1000000).toFixed(1).replace(".", ",") + "M";
  if (Math.abs(n) >= 1000) return "$" + Math.round(n).toLocaleString("es-CL");
  return "$" + Math.round(n).toLocaleString("es-CL");
}
function fmt(n) {
  return "$" + Math.round(n || 0).toLocaleString("es-CL");
}
function normalizar(str) {
  return (str || "").trim().toUpperCase();
}

// ─── Modal proveedor manual ───────────────────────────────────────────────────
function ModalManual({ isOpen, onClose, onSave, editando, projects }) {
  const [form, setForm] = useState(EMPTY_MANUAL);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm(editando ? { ...EMPTY_MANUAL, ...editando } : EMPTY_MANUAL);
  }, [editando, isOpen]);

  if (!isOpen) return null;
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.razonSocial || !form.monto) return;
    setSaving(true);
    await onSave({ ...form, monto: parseFloat(form.monto) || 0 });
    setSaving(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg my-auto overflow-hidden">
        <div className="bg-gradient-to-r from-purple-700 to-violet-600 p-6 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-black">{editando ? "Editar Proveedor" : "Nuevo Proveedor Manual"}</h2>
              <p className="text-white/70 text-sm">Registro de cuenta por pagar</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1.5">Razón Social <span className="text-red-500">*</span></label>
              <input value={form.razonSocial} onChange={e => set("razonSocial", e.target.value)} placeholder="Nombre empresa o persona" className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1.5">RUT</label>
              <input value={form.rut} onChange={e => set("rut", e.target.value)} placeholder="76.321.092-8" className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 text-sm" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1.5">Descripción</label>
            <input value={form.descripcion} onChange={e => set("descripcion", e.target.value)} placeholder="Concepto del pago" className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 text-sm" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1.5">Monto <span className="text-red-500">*</span></label>
              <div className="flex gap-2">
                <select value={form.moneda} onChange={e => set("moneda", e.target.value)} className="px-2 py-2.5 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 text-sm font-bold bg-slate-50 w-20">
                  <option value="CLP">CLP</option>
                  <option value="UF">UF</option>
                  <option value="USD">USD</option>
                </select>
                <input type="number" value={form.monto} onChange={e => set("monto", e.target.value)} placeholder="0" className="flex-1 px-4 py-2.5 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 text-sm" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1.5">Fecha</label>
              <input type="date" value={form.fecha} onChange={e => set("fecha", e.target.value)} className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 text-sm" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1.5">Estado de pago</label>
              <select value={form.estado} onChange={e => set("estado", e.target.value)} className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 text-sm">
                {ESTADOS_PAGO.map(e => <option key={e} value={e}>{e}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1.5">Proyecto</label>
              <select value={form.projectId} onChange={e => set("projectId", e.target.value)} className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 text-sm">
                <option value="">Sin proyecto</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name || p.nombre}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1.5">Notas</label>
            <textarea value={form.notas} onChange={e => set("notas", e.target.value)} rows={2} placeholder="Observaciones adicionales..." className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 text-sm resize-none" />
          </div>
        </div>

        <div className="px-6 pb-6 flex gap-3">
          <button onClick={onClose} className="px-5 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-sm">Cancelar</button>
          <div className="flex-1" />
          <button onClick={submit} disabled={saving || !form.razonSocial || !form.monto}
            className="px-6 py-3 bg-gradient-to-r from-purple-700 to-violet-600 disabled:opacity-40 text-white font-bold rounded-xl text-sm flex items-center gap-2 shadow-lg">
            {saving
              ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Guardando...</>
              : <><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>{editando ? "Guardar cambios" : "Crear registro"}</>
            }
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Panel detalle proveedor ──────────────────────────────────────────────────
function PanelDetalle({ proveedor, onClose, onEditManual, onDeleteManual, projects }) {
  if (!proveedor) return null;
  const estadoBadge = { Pendiente: "bg-amber-100 text-amber-700", Pagado: "bg-emerald-100 text-emerald-700", Parcial: "bg-blue-100 text-blue-700", Vencido: "bg-red-100 text-red-700" };

  return (
    <div className="glass-card rounded-xl overflow-hidden animate-fadeInUp">
      <div className="bg-gradient-to-r from-purple-700 to-violet-600 px-6 py-4 flex items-center justify-between">
        <div>
          <h3 className="text-white font-black text-lg">{proveedor.razonSocial}</h3>
          <p className="text-white/70 text-sm">{proveedor.rut || "Sin RUT"} · {proveedor.transacciones.length} transacciones</p>
        </div>
        <button onClick={onClose} className="w-7 h-7 bg-white/20 hover:bg-white/30 rounded-lg flex items-center justify-center">
          <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>

      {/* Resumen por fuente */}
      <div className="p-5 grid grid-cols-2 sm:grid-cols-4 gap-3 border-b border-slate-100">
        {Object.entries(FUENTES).map(([key, meta]) => {
          const txs = proveedor.transacciones.filter(t => t._fuente === key);
          if (!txs.length) return null;
          const total = txs.reduce((s, t) => s + (t._monto || 0), 0);
          return (
            <div key={key} className="glass-card rounded-xl p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <div className={`w-2 h-2 rounded-full ${meta.dot}`} />
                <span className="text-xs font-bold text-slate-500">{meta.label}</span>
              </div>
              <p className="text-lg font-black text-slate-900">{fmtM(total)}</p>
              <p className="text-xs text-slate-400">{txs.length} registros</p>
            </div>
          );
        })}
      </div>

      {/* Lista de transacciones */}
      <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
        {proveedor.transacciones.map((tx, i) => {
          const meta = FUENTES[tx._fuente] || FUENTES.manual;
          const proyecto = projects.find(p => p.id === tx.projectId);
          return (
            <div key={i} className="px-5 py-3 flex items-center justify-between hover:bg-slate-50 transition-colors">
              <div className="flex items-center gap-3">
                <span className={`px-2 py-0.5 rounded-lg text-xs font-bold ${meta.badge}`}>{meta.label}</span>
                <div>
                  <p className="text-sm font-semibold text-slate-800">{tx._descripcion || tx.descripcion || tx.numeroOC || tx.numeroRendicion || "—"}</p>
                  <p className="text-xs text-slate-400">{tx._fecha} {proyecto ? `· ${proyecto.name || proyecto.nombre}` : ""}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-slate-800">{fmt(tx._monto)}</span>
                {tx._fuente === "manual" && (
                  <>
                    {tx.estado && <span className={`text-xs font-bold px-2 py-0.5 rounded-lg ${estadoBadge[tx.estado] || "bg-slate-100 text-slate-500"}`}>{tx.estado}</span>}
                    <button onClick={() => onEditManual(tx)} className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-purple-100 hover:text-purple-700 text-slate-400 flex items-center justify-center transition-all">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                    </button>
                    <button onClick={() => onDeleteManual(tx.id)} className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-red-100 hover:text-red-600 text-slate-400 flex items-center justify-center transition-all">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function FinanzasProveedores() {
  const { proyectoId } = useFinanzas();
  const [loading, setLoading]         = useState(true);
  const [projects, setProjects]       = useState([]);
  const { empresaId } = useEmpresa();
  const [proveedores, setProveedores] = useState([]); // agrupados
  const [detalle, setDetalle]         = useState(null);
  const [showModal, setShowModal]     = useState(false);
  const [editando, setEditando]       = useState(null);
  const [busqueda, setBusqueda]       = useState("");
  const [filtroFuente, setFiltroFuente] = useState("todos");
  const [sortCol, setSortCol]         = useState("total");
  const [sortDir, setSortDir]         = useState("desc");
  const [activeTab, setActiveTab]     = useState("proveedores"); // proveedores | transacciones

  const cargar = useCallback(async () => {
    if (!empresaId) { setLoading(false); return; }
    setLoading(true);
    const txs = []; // todas las transacciones normalizadas

    try {
      // 1. Rendiciones
      const snapR = await getDocs(collection(db, "empresas", empresaId, "rendiciones"));
      snapR.docs.forEach(d => {
        const r = d.data();
        const proveedor = normalizar(r.proveedor);
        if (!proveedor) return;
        txs.push({
          _fuente: "rendicion",
          _key: proveedor,
          _rut: normalizar(r.rutProveedor || ""),
          _monto: parseFloat(r.montoAprobado) || parseFloat(r.montoSolicitado) || 0,
          _fecha: r.fechaEmision || r.fechaAprobacion || "",
          _descripcion: r.categoria || r.cuentaContable || "",
          projectId: r.projectId || "",
          razonSocial: r.proveedor || "",
          rut: r.rutProveedor || "",
          id: d.id,
        });
      });
    } catch (e) { console.error("rendiciones", e); }

    try {
      // 2. Subcontratos
      const snapS = await getDocs(collection(db, "empresas", empresaId, "subcontratos"));
      snapS.docs.forEach(d => {
        const s = d.data();
        const proveedor = normalizar(s.razonSocialSubcontratista);
        if (!proveedor) return;
        txs.push({
          _fuente: "subcontrato",
          _key: proveedor,
          _rut: normalizar(s.rutSubcontratista || ""),
          _monto: parseFloat(s.saldoPorPagarSC) || parseFloat(s.totalPagoNeto) || 0,
          _fecha: s.fechaEP || s.createdAt?.toDate?.()?.toISOString?.()?.slice(0, 10) || "",
          _descripcion: s.descripcionLinea || s.descricpionCuentaCosto || "",
          projectId: s.projectId || "",
          razonSocial: s.razonSocialSubcontratista || "",
          rut: s.rutSubcontratista || "",
          id: d.id,
        });
      });
    } catch (e) { console.error("subcontratos", e); }

    try {
      // 3. Órdenes de compra
      const snapOC = await getDocs(collection(db, "empresas", empresaId, "purchaseOrders"));
      snapOC.docs.forEach(d => {
        const o = d.data();
        const proveedor = normalizar(o.proveedor);
        if (!proveedor) return;
        txs.push({
          _fuente: "oc",
          _key: proveedor,
          _rut: normalizar(o.rutProveedor || ""),
          _monto: parseFloat(o.totalMonto) || 0,
          _fecha: o.fecha || "",
          _descripcion: o.nombreOC || o.numeroOC || "",
          projectId: o.projectId || "",
          razonSocial: o.proveedor || "",
          rut: o.rutProveedor || "",
          numeroOC: o.numeroOC || "",
          id: d.id,
        });
      });
    } catch (e) { console.error("purchaseOrders", e); }

    try {
      // 4. Manuales
      const snapM = await getDocs(query(collection(db, "empresas", empresaId, "finanzas_proveedores"), orderBy("createdAt", "desc")));
      snapM.docs.forEach(d => {
        const m = d.data();
        const proveedor = normalizar(m.razonSocial);
        if (!proveedor) return;
        txs.push({
          _fuente: "manual",
          _key: proveedor,
          _rut: normalizar(m.rut || ""),
          _monto: parseFloat(m.monto) || 0,
          _fecha: m.fecha || "",
          _descripcion: m.descripcion || "",
          projectId: m.projectId || "",
          razonSocial: m.razonSocial || "",
          rut: m.rut || "",
          estado: m.estado || "Pendiente",
          notas: m.notas || "",
          moneda: m.moneda || "CLP",
          id: d.id,
        });
      });
    } catch (e) { console.error("finanzas_proveedores", e); }

    // Agrupar por proveedor
    const mapaProveedores = {};
    // Aplicar filtro de proyecto sobre las transacciones
    const txsFiltradas = proyectoId !== "todos" ? txs.filter(tx => tx.projectId === proyectoId) : txs;

    txsFiltradas.forEach(tx => {
      const key = tx._key;
      if (!mapaProveedores[key]) {
        mapaProveedores[key] = {
          razonSocial: tx.razonSocial || key,
          rut: tx._rut || tx.rut || "",
          transacciones: [],
          fuentes: new Set(),
          total: 0,
        };
      }
      mapaProveedores[key].transacciones.push(tx);
      mapaProveedores[key].fuentes.add(tx._fuente);
      mapaProveedores[key].total += tx._monto;
    });

    setProveedores(Object.values(mapaProveedores));
    setLoading(false);
  }, [empresaId, proyectoId]);

  useEffect(() => { cargar(); }, [cargar]);

  useEffect(() => {
    try {
      getDocs(collection(db, "empresas", empresaId, "projects")).then(snap => setProjects(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    } catch (e) {}
  }, []);

  const handleSaveManual = async (form) => {
    if (editando) {
      await updateDoc(doc(db, "empresas", empresaId, "finanzas_proveedores", editando.id), { ...form, updatedAt: serverTimestamp() });
    } else {
      await addDoc(collection(db, "empresas", empresaId, "finanzas_proveedores"), { ...form, createdAt: serverTimestamp() });
    }
    setEditando(null);
    await cargar();
    // Actualizar detalle si está abierto
    setDetalle(null);
  };

  const handleDeleteManual = async (id) => {
    if (!window.confirm("¿Eliminar este registro manual?")) return;
    await deleteDoc(doc(db, "empresas", empresaId, "finanzas_proveedores", id));
    await cargar();
    setDetalle(null);
  };

  const handleSort = (col) => {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("desc"); }
  };

  const proveedoresFiltrados = useMemo(() => {
    let list = proveedores.filter(p => {
      if (filtroFuente !== "todos" && !p.fuentes.has(filtroFuente)) return false;
      if (busqueda) {
        const b = busqueda.toLowerCase();
        return p.razonSocial.toLowerCase().includes(b) || p.rut.toLowerCase().includes(b);
      }
      return true;
    });
    return [...list].sort((a, b) => {
      const map = {
        nombre: [a.razonSocial.toLowerCase(), b.razonSocial.toLowerCase()],
        total:  [a.total, b.total],
        txs:    [a.transacciones.length, b.transacciones.length],
      };
      const [va, vb] = map[sortCol] || [0, 0];
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [proveedores, busqueda, filtroFuente, sortCol, sortDir]);

  // Todas las transacciones planas para la pestaña Transacciones
  const todasTxs = useMemo(() => {
    let txs = [];
    proveedores.forEach(p => p.transacciones.forEach(tx => txs.push({ ...tx, _razonSocial: p.razonSocial })));
    if (filtroFuente !== "todos") txs = txs.filter(t => t._fuente === filtroFuente);
    if (busqueda) {
      const b = busqueda.toLowerCase();
      txs = txs.filter(t => (t._razonSocial||"").toLowerCase().includes(b) || (t._descripcion||"").toLowerCase().includes(b));
    }
    return txs.sort((a, b) => (b._fecha || "").localeCompare(a._fecha || ""));
  }, [proveedores, filtroFuente, busqueda]);

  // KPIs
  const totalGeneral    = useMemo(() => proveedores.reduce((s, p) => s + p.total, 0), [proveedores]);
  const totalOC         = useMemo(() => proveedores.reduce((s, p) => s + p.transacciones.filter(t => t._fuente === "oc").reduce((a, t) => a + t._monto, 0), 0), [proveedores]);
  const totalSub        = useMemo(() => proveedores.reduce((s, p) => s + p.transacciones.filter(t => t._fuente === "subcontrato").reduce((a, t) => a + t._monto, 0), 0), [proveedores]);
  const totalRend       = useMemo(() => proveedores.reduce((s, p) => s + p.transacciones.filter(t => t._fuente === "rendicion").reduce((a, t) => a + t._monto, 0), 0), [proveedores]);

  const SortIcon = ({ col }) => {
    if (sortCol !== col) return <svg className="w-3 h-3 text-white/30 ml-1 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4" /></svg>;
    return sortDir === "asc"
      ? <svg className="w-3 h-3 text-white ml-1 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" /></svg>
      : <svg className="w-3 h-3 text-white ml-1 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>;
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="spinner w-10 h-10 border-purple-600" />
    </div>
  );

  return (
    <div className="space-y-4 sm:space-y-6 p-4 sm:p-6">

      {/* Header */}
      <div className="glass-card rounded-xl sm:rounded-2xl p-4 sm:p-6 animate-fadeInUp">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br from-purple-700 to-violet-600 flex items-center justify-center shadow-lg flex-shrink-0">
              <svg className="w-5 h-5 sm:w-6 sm:h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">Proveedores <span className="text-purple-700">& CxP</span></h1>
              <p className="text-slate-500 text-xs sm:text-sm mt-0.5">Consolidado de OC, subcontratos, rendiciones y cuentas por pagar</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ProyectoSelector />
            <button
              onClick={() => { setEditando(null); setShowModal(true); }}
              className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-purple-700 to-violet-600 text-white text-sm font-bold rounded-xl hover:from-purple-600 hover:to-violet-500 transition-all shadow-md"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              Nuevo Manual
            </button>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {[
          { icon: "🏢", label: "Proveedores únicos", value: proveedores.length,   sub: `${todasTxs.length} transacciones`,          gradient: "from-purple-700 to-violet-600" },
          { icon: "📋", label: "Órdenes de Compra",  value: fmtM(totalOC),        sub: "Total en OC",                                gradient: "from-amber-500 to-orange-600"  },
          { icon: "🔧", label: "Subcontratos",        value: fmtM(totalSub),       sub: "Saldo por pagar SC",                         gradient: "from-violet-600 to-purple-500" },
          { icon: "🧾", label: "Rendiciones",         value: fmtM(totalRend),      sub: "Montos aprobados",                           gradient: "from-blue-500 to-blue-700"     },
        ].map((k, i) => (
          <div key={i} className="glass-card rounded-xl p-4 sm:p-5 hover:shadow-lg transition-shadow">
            <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${k.gradient} flex items-center justify-center shadow-md text-xl mb-3`}>{k.icon}</div>
            <div className="text-xl sm:text-2xl font-black text-slate-900 break-words">{k.value}</div>
            <div className="text-xs sm:text-sm font-semibold text-slate-600 mt-0.5">{k.label}</div>
            <div className="text-[11px] text-slate-400 mt-1">{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Barra distribución */}
      {totalGeneral > 0 && (
        <div className="glass-card rounded-xl p-4 sm:p-5">
          <p className="text-xs font-black text-slate-500 uppercase tracking-wider mb-3">Distribución por fuente</p>
          <div className="flex h-3 rounded-full overflow-hidden gap-0.5">
            {[["oc", totalOC], ["subcontrato", totalSub], ["rendicion", totalRend]].map(([key, val]) => (
              val > 0 && <div key={key} className={`bg-gradient-to-r ${FUENTES[key].color} rounded-full`} style={{ width: `${(val/totalGeneral)*100}%` }} title={`${FUENTES[key].label}: ${fmtM(val)}`} />
            ))}
          </div>
          <div className="flex flex-wrap gap-4 mt-3">
            {[["oc","OC",totalOC],["subcontrato","Subcontratos",totalSub],["rendicion","Rendiciones",totalRend]].map(([key,label,val])=>(
              val > 0 && (
                <div key={key} className="flex items-center gap-1.5">
                  <div className={`w-2 h-2 rounded-full ${FUENTES[key].dot}`} />
                  <span className="text-xs text-slate-500">{label}</span>
                  <span className="text-xs font-bold text-slate-700">{fmtM(val)} ({((val/totalGeneral)*100).toFixed(1)}%)</span>
                </div>
              )
            ))}
          </div>
        </div>
      )}

      {/* Filtros + Tabs */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <svg className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar por razón social o RUT..." className="w-full pl-10 pr-4 py-2.5 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-purple-400 text-sm bg-white" />
        </div>
        <div className="flex gap-1 bg-white rounded-xl border-2 border-slate-200 p-1 flex-wrap">
          {[["todos","Todos"],["oc","OC"],["subcontrato","Subcontratos"],["rendicion","Rendiciones"],["manual","Manuales"]].map(([v,l])=>(
            <button key={v} onClick={() => setFiltroFuente(v)} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${filtroFuente===v?"bg-purple-700 text-white shadow":"text-slate-500 hover:text-slate-700"}`}>{l}</button>
          ))}
        </div>
      </div>

      {/* Tabs vista */}
      <div className="flex gap-1 bg-white rounded-xl border-2 border-slate-200 p-1 w-fit">
        {[["proveedores","🏢 Por Proveedor"],["transacciones","📄 Transacciones"]].map(([v,l])=>(
          <button key={v} onClick={()=>setActiveTab(v)} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${activeTab===v?"bg-purple-700 text-white shadow":"text-slate-500 hover:text-slate-700"}`}>{l}</button>
        ))}
      </div>

      {/* Vista proveedores agrupados */}
      {activeTab === "proveedores" && (
        <div className="glass-card rounded-xl overflow-hidden">
          {proveedoresFiltrados.length === 0 ? (
            <div className="py-16 text-center">
              <div className="w-14 h-14 bg-purple-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <svg className="w-7 h-7 text-purple-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
              </div>
              <p className="font-bold text-slate-600">No hay proveedores</p>
              <p className="text-sm text-slate-400 mt-1">Ajusta los filtros o agrega un registro manual</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gradient-to-r from-purple-700 to-violet-600 text-white">
                  <tr>
                    {[
                      { col:"nombre", label:"Proveedor",    align:"text-left",   cls:"px-5 py-4" },
                      { col:"total",  label:"Total",        align:"text-right",  cls:"px-4 py-4" },
                      { col:"txs",    label:"Transacciones",align:"text-center", cls:"px-4 py-4 hidden sm:table-cell" },
                    ].map(({ col, label, align, cls }) => (
                      <th key={col} onClick={() => handleSort(col)} className={`${cls} ${align} text-xs font-black uppercase tracking-wider cursor-pointer hover:bg-white/10 select-none transition-colors`}>
                        {label}<SortIcon col={col} />
                      </th>
                    ))}
                    <th className="px-4 py-4 text-left text-xs font-black uppercase tracking-wider hidden md:table-cell">Fuentes</th>
                    <th className="px-4 py-4 text-center text-xs font-black uppercase tracking-wider">Detalle</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {proveedoresFiltrados.map((p, idx) => (
                    <tr key={p.razonSocial} onClick={() => setDetalle(detalle?.razonSocial === p.razonSocial ? null : p)}
                      className={`cursor-pointer hover:bg-purple-50/40 transition-colors ${idx % 2 === 0 ? "bg-white" : "bg-slate-50/30"}`}
                    >
                      <td className="px-5 py-4">
                        <p className="font-bold text-slate-900 text-sm">{p.razonSocial}</p>
                        {p.rut && <p className="text-xs text-slate-400">{p.rut}</p>}
                      </td>
                      <td className="px-4 py-4 text-right">
                        <span className="text-sm font-black text-slate-900">{fmtM(p.total)}</span>
                      </td>
                      <td className="px-4 py-4 text-center hidden sm:table-cell">
                        <span className="text-sm font-bold text-slate-600">{p.transacciones.length}</span>
                      </td>
                      <td className="px-4 py-4 hidden md:table-cell">
                        <div className="flex flex-wrap gap-1">
                          {[...p.fuentes].map(f => (
                            <span key={f} className={`px-2 py-0.5 rounded-lg text-xs font-bold ${FUENTES[f]?.badge}`}>{FUENTES[f]?.label}</span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-center" onClick={e => e.stopPropagation()}>
                        <button onClick={() => setDetalle(detalle?.razonSocial === p.razonSocial ? null : p)}
                          className="px-3 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-700 text-xs font-bold rounded-lg transition-all">
                          {detalle?.razonSocial === p.razonSocial ? "Cerrar" : "Ver"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="px-5 py-4 bg-gradient-to-r from-purple-700 to-violet-600 flex items-center justify-between">
                <span className="text-xs font-semibold text-white/70">{proveedoresFiltrados.length} proveedores</span>
                <div className="text-right">
                  <p className="text-xs text-white/60">Total general</p>
                  <p className="text-lg font-black text-white">{fmtM(proveedoresFiltrados.reduce((s, p) => s + p.total, 0))}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Vista transacciones planas */}
      {activeTab === "transacciones" && (
        <div className="glass-card rounded-xl overflow-hidden">
          {todasTxs.length === 0 ? (
            <div className="py-16 text-center">
              <p className="font-bold text-slate-600">No hay transacciones</p>
              <p className="text-sm text-slate-400 mt-1">Ajusta los filtros</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gradient-to-r from-purple-700 to-violet-600 text-white">
                  <tr>
                    <th className="px-5 py-4 text-left text-xs font-black uppercase tracking-wider">Proveedor</th>
                    <th className="px-4 py-4 text-left text-xs font-black uppercase tracking-wider hidden md:table-cell">Descripción</th>
                    <th className="px-4 py-4 text-left text-xs font-black uppercase tracking-wider">Fuente</th>
                    <th className="px-4 py-4 text-right text-xs font-black uppercase tracking-wider">Monto</th>
                    <th className="px-4 py-4 text-center text-xs font-black uppercase tracking-wider hidden sm:table-cell">Fecha</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {todasTxs.map((tx, idx) => {
                    const meta = FUENTES[tx._fuente] || FUENTES.manual;
                    return (
                      <tr key={`${tx._fuente}-${tx.id}-${idx}`} className={`${idx % 2 === 0 ? "bg-white" : "bg-slate-50/30"}`}>
                        <td className="px-5 py-3">
                          <p className="font-bold text-slate-900 text-sm">{tx._razonSocial}</p>
                          {tx.rut && <p className="text-xs text-slate-400">{tx.rut}</p>}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-600 hidden md:table-cell">{tx._descripcion || "—"}</td>
                        <td className="px-4 py-3"><span className={`px-2.5 py-1 rounded-lg text-xs font-bold ${meta.badge}`}>{meta.label}</span></td>
                        <td className="px-4 py-3 text-right font-bold text-slate-900 text-sm">{fmt(tx._monto)}</td>
                        <td className="px-4 py-3 text-center text-xs text-slate-500 hidden sm:table-cell">{tx._fecha || "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="px-5 py-4 bg-gradient-to-r from-purple-700 to-violet-600 flex items-center justify-between">
                <span className="text-xs font-semibold text-white/70">{todasTxs.length} transacciones</span>
                <div className="text-right">
                  <p className="text-xs text-white/60">Total</p>
                  <p className="text-lg font-black text-white">{fmtM(todasTxs.reduce((s, t) => s + t._monto, 0))}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Panel detalle */}
      {detalle && (
        <PanelDetalle
          proveedor={detalle}
          onClose={() => setDetalle(null)}
          onEditManual={(tx) => { setEditando(tx); setShowModal(true); }}
          onDeleteManual={handleDeleteManual}
          projects={projects}
        />
      )}

      <ModalManual
        isOpen={showModal}
        onClose={() => { setShowModal(false); setEditando(null); }}
        onSave={handleSaveManual}
        editando={editando}
        projects={projects}
      />
    </div>
  );
}
