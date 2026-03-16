import React, { useState, useEffect, useMemo } from "react";
import {
  collection, query, orderBy, getDocs,
  addDoc, updateDoc, deleteDoc, doc, serverTimestamp
} from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useEmpresa } from "../../lib/useEmpresa";
import { useFinanzas, ProyectoSelector } from "./FinanzasContext";

// ─── Constantes ───────────────────────────────────────────────────────────────
const CATEGORIAS = [
  { id: "credito",  label: "Crédito Bancario",       color: "from-blue-500 to-blue-700",    badge: "bg-blue-100 text-blue-700",      dot: "bg-blue-500",    icon: "M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" },
  { id: "leasing",  label: "Leasing",                color: "from-violet-500 to-purple-700", badge: "bg-violet-100 text-violet-700",  dot: "bg-violet-500",  icon: "M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" },
  { id: "arriendo", label: "Arriendo",               color: "from-emerald-500 to-teal-700",  badge: "bg-emerald-100 text-emerald-700",dot: "bg-emerald-500", icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" },
  { id: "seguro",   label: "Seguro",                 color: "from-amber-500 to-orange-600",  badge: "bg-amber-100 text-amber-700",    dot: "bg-amber-500",   icon: "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" },
  { id: "servicio", label: "Servicio / Suscripción", color: "from-sky-500 to-cyan-600",      badge: "bg-sky-100 text-sky-700",         dot: "bg-sky-500",     icon: "M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" },
  { id: "otro",     label: "Crédito Automotriz",     color: "from-slate-500 to-slate-700",   badge: "bg-slate-100 text-slate-700",    dot: "bg-slate-400",   icon: "M8 17a2 2 0 100-4 2 2 0 000 4zm8 0a2 2 0 100-4 2 2 0 000 4zM3 9l1.5-4.5A2 2 0 016.4 3h11.2a2 2 0 011.9 1.5L21 9M3 9h18M3 9l-1 6h20l-1-6" },
];
const CAT_MAP = Object.fromEntries(CATEGORIAS.map(c => [c.id, c]));

const FRECUENCIAS = [
  { id: "mensual",    label: "Mensual"    },
  { id: "trimestral", label: "Trimestral" },
  { id: "semestral",  label: "Semestral"  },
  { id: "anual",      label: "Anual"      },
  { id: "unico",      label: "Pago único" },
];
const FREC_MAP = Object.fromEntries(FRECUENCIAS.map(f => [f.id, f.label]));

const MONEDAS = [
  { id: "CLP", label: "CLP $" },
  { id: "UF",  label: "UF"    },
  { id: "USD", label: "USD"   },
];

const EMPTY = {
  nombre: "", categoria: "credito", descripcion: "", monto: "",
  moneda: "CLP", frecuencia: "mensual", fechaInicio: "", fechaTermino: "",
  proveedor: "", numeroContrato: "", diaPago: "", notas: "", activo: true,
};

// ─── Utilidades ───────────────────────────────────────────────────────────────
function montoMensual(c) {
  const m = parseFloat(c.monto) || 0;
  if (c.frecuencia === "mensual")    return m;
  if (c.frecuencia === "trimestral") return m / 3;
  if (c.frecuencia === "semestral")  return m / 6;
  if (c.frecuencia === "anual")      return m / 12;
  return 0;
}
function fmt(n, moneda = "CLP") {
  if (moneda === "UF")  return `UF ${n.toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (moneda === "USD") return `US$${n.toLocaleString("es-CL", { minimumFractionDigits: 2 })}`;
  return `$${Math.round(n).toLocaleString("es-CL")}`;
}
function fmtM(n) {
  if (Math.abs(n) >= 1000000) return "$" + (n / 1000000).toFixed(1).replace(".", ",") + "M";
  return "$" + Math.round(n).toLocaleString("es-CL");
}
function diasRestantes(f) {
  if (!f) return null;
  return Math.ceil((new Date(f) - new Date()) / 86400000);
}

// ─── Modal ────────────────────────────────────────────────────────────────────
function ModalCosto({ isOpen, onClose, onSave, editando }) {
  const [form, setForm] = useState(EMPTY);
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm(editando ? { ...EMPTY, ...editando } : EMPTY);
    setStep(1);
  }, [editando, isOpen]);

  if (!isOpen) return null;

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const cat = CAT_MAP[form.categoria] || CATEGORIAS[0];

  const handleSubmit = async () => {
    if (!form.nombre || !form.monto || !form.fechaInicio) return;
    setSaving(true);
    await onSave({ ...form, monto: parseFloat(form.monto) || 0 });
    setSaving(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-auto overflow-hidden">

        {/* Header */}
        <div className="bg-gradient-to-r from-purple-700 to-violet-600 p-6 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d={cat.icon} />
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-black">{editando ? "Editar Costo" : "Nuevo Costo Fijo"}</h2>
                <p className="text-white/70 text-sm">{editando ? editando.nombre : "Registra un nuevo costo recurrente"}</p>
              </div>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
          {/* Steps */}
          <div className="flex items-center gap-2 mt-5">
            {[1,2,3].map(s => (
              <React.Fragment key={s}>
                <button
                  onClick={() => (step > s || s === 1) ? setStep(s) : null}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${step === s ? "bg-white text-slate-800 shadow-md" : step > s ? "bg-white/30 text-white" : "bg-white/10 text-white/50"}`}
                >
                  <span className={`w-4 h-4 rounded-full flex items-center justify-center text-xs font-black ${step === s ? "bg-purple-700 text-white" : step > s ? "bg-white/60 text-slate-700" : "bg-white/20 text-white/60"}`}>{s}</span>
                  {s === 1 ? "Básico" : s === 2 ? "Detalles" : "Contrato"}
                </button>
                {s < 3 && <div className={`flex-1 h-0.5 rounded ${step > s ? "bg-white/50" : "bg-white/20"}`} />}
              </React.Fragment>
            ))}
          </div>
        </div>

        <div className="p-6 space-y-5">
          {step === 1 && (
            <>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Categoría</label>
                <div className="grid grid-cols-3 gap-2">
                  {CATEGORIAS.map(c => (
                    <button key={c.id} onClick={() => set("categoria", c.id)}
                      className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all text-center ${form.categoria === c.id ? "border-purple-700 bg-purple-50 shadow-md" : "border-slate-200 hover:border-slate-300"}`}
                    >
                      <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${c.color} flex items-center justify-center`}>
                        <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d={c.icon} /></svg>
                      </div>
                      <span className="text-xs font-bold text-slate-700 leading-tight">{c.label}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5">Nombre <span className="text-red-500">*</span></label>
                <input value={form.nombre} onChange={e => set("nombre", e.target.value)} placeholder="Ej: Crédito Caterpillar D8..." className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1.5">Monto <span className="text-red-500">*</span></label>
                  <div className="flex gap-2">
                    <select value={form.moneda} onChange={e => set("moneda", e.target.value)} className="px-2 py-2.5 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 text-sm font-bold bg-slate-50 w-24">
                      {MONEDAS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                    </select>
                    <input type="number" value={form.monto} onChange={e => set("monto", e.target.value)} placeholder="0" className="flex-1 px-4 py-2.5 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 text-sm" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1.5">Frecuencia</label>
                  <select value={form.frecuencia} onChange={e => set("frecuencia", e.target.value)} className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 text-sm">
                    {FRECUENCIAS.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5">Descripción</label>
                <textarea value={form.descripcion} onChange={e => set("descripcion", e.target.value)} rows={2} placeholder="Describe brevemente este costo..." className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 text-sm resize-none" />
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1.5">Fecha inicio <span className="text-red-500">*</span></label>
                  <input type="date" value={form.fechaInicio} onChange={e => set("fechaInicio", e.target.value)} className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1.5">Fecha término</label>
                  <input type="date" value={form.fechaTermino} onChange={e => set("fechaTermino", e.target.value)} className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5">Día de pago <span className="ml-2 text-xs font-normal text-slate-400">(1–31)</span></label>
                <div className="flex items-center gap-3">
                  <input type="number" min="1" max="31" value={form.diaPago} onChange={e => set("diaPago", e.target.value)} placeholder="—" className="w-28 px-4 py-2.5 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 text-sm text-center font-bold" />
                  {form.diaPago && <span className="text-sm text-slate-500">Vence el <strong className="text-purple-700">día {form.diaPago}</strong> de cada {form.frecuencia === "mensual" ? "mes" : "período"}</span>}
                </div>
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5">Proveedor / Institución</label>
                <input value={form.proveedor} onChange={e => set("proveedor", e.target.value)} placeholder="Ej: Banco BCI, Inmobiliaria X..." className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 text-sm" />
              </div>
              <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border-2 border-slate-200">
                <div>
                  <p className="text-sm font-bold text-slate-700">Estado del costo</p>
                  <p className="text-xs text-slate-500 mt-0.5">Los inactivos se excluyen del resumen mensual</p>
                </div>
                <button onClick={() => set("activo", !form.activo)} className={`relative w-12 h-6 rounded-full transition-colors ${form.activo ? "bg-purple-600" : "bg-slate-300"}`}>
                  <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${form.activo ? "translate-x-7" : "translate-x-1"}`} />
                </button>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5">N° de contrato / referencia</label>
                <input value={form.numeroContrato} onChange={e => set("numeroContrato", e.target.value)} placeholder="Ej: CTR-2024-0123" className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5">Notas adicionales</label>
                <textarea value={form.notas} onChange={e => set("notas", e.target.value)} rows={4} placeholder="Condiciones especiales, observaciones..." className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 text-sm resize-none" />
              </div>
              <div className="rounded-xl p-4 bg-gradient-to-br from-purple-50 to-violet-50 border border-purple-100">
                <p className="text-xs font-black text-purple-600 uppercase tracking-wider mb-3">Resumen</p>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div><span className="text-slate-500">Nombre:</span><span className="font-bold text-slate-800 ml-1">{form.nombre || "—"}</span></div>
                  <div><span className="text-slate-500">Categoría:</span><span className="font-bold text-slate-800 ml-1">{cat.label}</span></div>
                  <div><span className="text-slate-500">Monto:</span><span className="font-bold text-slate-800 ml-1">{form.moneda} {Number(form.monto || 0).toLocaleString("es-CL")}</span></div>
                  <div><span className="text-slate-500">Frecuencia:</span><span className="font-bold text-slate-800 ml-1">{FREC_MAP[form.frecuencia]}</span></div>
                  <div><span className="text-slate-500">Inicio:</span><span className="font-bold text-slate-800 ml-1">{form.fechaInicio || "—"}</span></div>
                  <div><span className="text-slate-500">Día pago:</span><span className="font-bold text-slate-800 ml-1">{form.diaPago ? `Día ${form.diaPago}` : "—"}</span></div>
                  <div><span className="text-slate-500">Estado:</span><span className={`font-bold ml-1 ${form.activo ? "text-purple-600" : "text-slate-400"}`}>{form.activo ? "Activo" : "Inactivo"}</span></div>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="px-6 pb-6 flex gap-3">
          {step > 1 && <button onClick={() => setStep(s => s-1)} className="px-5 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-sm transition-all">← Anterior</button>}
          <button onClick={onClose} className="px-5 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-sm transition-all">Cancelar</button>
          <div className="flex-1" />
          {step < 3
            ? <button onClick={() => setStep(s => s+1)} disabled={step === 1 && (!form.nombre || !form.monto)} className="px-6 py-3 bg-gradient-to-r from-purple-700 to-violet-600 hover:from-purple-600 hover:to-violet-500 disabled:opacity-40 text-white font-bold rounded-xl text-sm transition-all">Siguiente →</button>
            : <button onClick={handleSubmit} disabled={saving || !form.nombre || !form.monto || !form.fechaInicio} className="px-6 py-3 bg-gradient-to-r from-purple-700 to-violet-600 hover:from-purple-600 hover:to-violet-500 disabled:opacity-40 text-white font-bold rounded-xl text-sm flex items-center gap-2 shadow-lg transition-all">
                {saving ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Guardando...</> : <><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>{editando ? "Guardar cambios" : "Crear costo"}</>}
              </button>
          }
        </div>
      </div>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function FinanzasCostos() {
  const { proyectoId } = useFinanzas();
  const { empresaId } = useEmpresa();
  const [costos, setCostos]                   = useState([]);
  const [loading, setLoading]                 = useState(true);
  const [showModal, setShowModal]             = useState(false);
  const [editando, setEditando]               = useState(null);
  const [filtroCategoria, setFiltroCategoria] = useState("todos");
  const [filtroEstado, setFiltroEstado]       = useState("activos");
  const [busqueda, setBusqueda]               = useState("");
  const [vistaDetalle, setVistaDetalle]       = useState(null);
  const [deletingId, setDeletingId]           = useState(null);
  const [sortCol, setSortCol]                 = useState("nombre");
  const [sortDir, setSortDir]                 = useState("asc");

  const cargar = async () => {
    if (!empresaId) { setLoading(false); return; }
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, "empresas", empresaId, "costos_fijos"), orderBy("fechaCreacion", "desc")));
      setCostos(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error(e); }
    setLoading(false);
  };
  useEffect(() => { cargar(); }, [empresaId]);

  const handleSave = async (form) => {
    if (editando) {
      await updateDoc(doc(db, "empresas", empresaId, "costos_fijos", editando.id), form);
    } else {
      await addDoc(collection(db, "empresas", empresaId, "costos_fijos"), { ...form, fechaCreacion: serverTimestamp() });
    }
    setEditando(null);
    cargar();
  };

  const handleEliminar = async (id) => {
    if (!window.confirm("¿Eliminar este costo? Esta acción no se puede deshacer.")) return;
    setDeletingId(id);
    await deleteDoc(doc(db, "empresas", empresaId, "costos_fijos", id));
    setDeletingId(null);
    if (vistaDetalle?.id === id) setVistaDetalle(null);
    cargar();
  };

  const toggleActivo = async (c) => {
    await updateDoc(doc(db, "empresas", empresaId, "costos_fijos", c.id), { activo: !c.activo });
    cargar();
  };

  const handleSort = (col) => {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("asc"); }
  };

  const costosFiltrados = useMemo(() => {
    const filtered = costos.filter(c => {
      if (filtroEstado === "activos"   && !c.activo) return false;
      if (filtroEstado === "inactivos" &&  c.activo) return false;
      if (filtroCategoria !== "todos" && c.categoria !== filtroCategoria) return false;
      if (busqueda) {
        const b = busqueda.toLowerCase();
        return (c.nombre||"").toLowerCase().includes(b) || (c.proveedor||"").toLowerCase().includes(b) || (c.descripcion||"").toLowerCase().includes(b);
      }
      return true;
    });
    return [...filtered].sort((a, b) => {
      const map = {
        nombre: [(a.nombre||"").toLowerCase(), (b.nombre||"").toLowerCase()],
        cat:    [a.categoria||"", b.categoria||""],
        prov:   [(a.proveedor||"").toLowerCase(), (b.proveedor||"").toLowerCase()],
        monto:  [parseFloat(a.monto)||0, parseFloat(b.monto)||0],
        mens:   [montoMensual(a), montoMensual(b)],
        frec:   [a.frecuencia||"", b.frecuencia||""],
        dia:    [parseInt(a.diaPago)||0, parseInt(b.diaPago)||0],
        venc:   [a.fechaTermino||"9999", b.fechaTermino||"9999"],
      };
      const [va, vb] = map[sortCol] || ["",""];
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ?  1 : -1;
      return 0;
    });
  }, [costos, filtroEstado, filtroCategoria, busqueda, sortCol, sortDir]);

  const activos      = useMemo(() => costos.filter(c => c.activo), [costos]);
  const totalMensual = useMemo(() => activos.reduce((s, c) => s + montoMensual(c), 0), [activos]);
  const porCategoria = useMemo(() => {
    const res = {};
    activos.forEach(c => { res[c.categoria] = (res[c.categoria] || 0) + montoMensual(c); });
    return res;
  }, [activos]);
  const topCat = useMemo(() => {
    const entries = Object.entries(porCategoria);
    if (!entries.length) return null;
    return entries.sort((a,b) => b[1]-a[1])[0];
  }, [porCategoria]);

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
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">Costos <span className="text-purple-700">Fijos</span></h1>
              <p className="text-slate-500 text-xs sm:text-sm mt-0.5">Créditos, leasings, arriendos y compromisos recurrentes</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ProyectoSelector />
            <button
              onClick={() => { setEditando(null); setShowModal(true); }}
              className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-purple-700 to-violet-600 text-white text-sm font-bold rounded-xl hover:from-purple-600 hover:to-violet-500 transition-all shadow-md"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              Nuevo Costo
            </button>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {[
          { icon: "📋", label: "Costo Mensual Total", value: fmtM(totalMensual),      sub: `${activos.length} costos activos`,                          gradient: "from-purple-700 to-violet-600" },
          { icon: "📅", label: "Proyección Anual",    value: fmtM(totalMensual * 12), sub: "En base a activos",                                          gradient: "from-violet-600 to-purple-500" },
          { icon: "🏆", label: "Mayor Categoría",     value: topCat ? (CAT_MAP[topCat[0]]?.label || "—") : "—", sub: topCat ? fmtM(topCat[1]) + "/mes" : "Sin datos", gradient: "from-purple-600 to-violet-500" },
          { icon: "🗂️", label: "Total Registros",    value: costos.length,            sub: `${costos.filter(c => !c.activo).length} inactivos`,           gradient: "from-slate-600 to-slate-500"   },
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
      {activos.length > 0 && totalMensual > 0 && (
        <div className="glass-card rounded-xl p-4 sm:p-5">
          <p className="text-xs font-black text-slate-500 uppercase tracking-wider mb-3">Distribución mensual por categoría</p>
          <div className="flex h-3 rounded-full overflow-hidden gap-0.5">
            {Object.entries(porCategoria).sort((a,b) => b[1]-a[1]).map(([cat, monto]) => (
              <div key={cat} className={`bg-gradient-to-r ${CAT_MAP[cat]?.color || "from-slate-400 to-slate-500"} rounded-full`}
                style={{ width: `${(monto/totalMensual)*100}%` }} title={`${CAT_MAP[cat]?.label}: ${fmtM(monto)}/mes`} />
            ))}
          </div>
          <div className="flex flex-wrap gap-3 mt-3">
            {Object.entries(porCategoria).sort((a,b) => b[1]-a[1]).map(([cat, monto]) => (
              <div key={cat} className="flex items-center gap-1.5">
                <div className={`w-2 h-2 rounded-full ${CAT_MAP[cat]?.dot || "bg-slate-400"}`} />
                <span className="text-xs text-slate-500">{CAT_MAP[cat]?.label}</span>
                <span className="text-xs font-bold text-slate-700">{((monto/totalMensual)*100).toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <svg className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar por nombre, proveedor..." className="w-full pl-10 pr-4 py-2.5 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-purple-400 text-sm bg-white" />
        </div>
        <div className="flex gap-1 bg-white rounded-xl border-2 border-slate-200 p-1">
          {[["todos","Todos"],["activos","Activos"],["inactivos","Inactivos"]].map(([v,l]) => (
            <button key={v} onClick={() => setFiltroEstado(v)} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${filtroEstado===v ? "bg-purple-700 text-white shadow" : "text-slate-500 hover:text-slate-700"}`}>{l}</button>
          ))}
        </div>
        <select value={filtroCategoria} onChange={e => setFiltroCategoria(e.target.value)} className="px-4 py-2.5 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-purple-400 text-sm bg-white font-semibold text-slate-700">
          <option value="todos">Todas las categorías</option>
          {CATEGORIAS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
      </div>

      {/* Tabla */}
      <div className="glass-card rounded-xl overflow-hidden">
        {costosFiltrados.length === 0 ? (
          <div className="py-16 text-center">
            <div className="w-14 h-14 bg-purple-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-purple-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
            </div>
            <p className="font-bold text-slate-600">No hay costos registrados</p>
            <p className="text-sm text-slate-400 mt-1">{busqueda || filtroCategoria !== "todos" ? "Ajusta los filtros" : "Haz click en 'Nuevo Costo' para comenzar"}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gradient-to-r from-purple-700 to-violet-600 text-white">
                <tr>
                  {[
                    { col:"nombre", label:"Costo",          align:"text-left",   cls:"px-5 py-4"                        },
                    { col:"cat",    label:"Categoría",       align:"text-left",   cls:"px-4 py-4"                        },
                    { col:"prov",   label:"Proveedor",       align:"text-left",   cls:"px-4 py-4 hidden md:table-cell"   },
                    { col:"mens",   label:"Mensual equiv.",  align:"text-right",  cls:"px-4 py-4"                        },
                    { col:"frec",   label:"Frecuencia",      align:"text-center", cls:"px-4 py-4 hidden sm:table-cell"   },
                    { col:"venc",   label:"Vencimiento",     align:"text-center", cls:"px-4 py-4 hidden lg:table-cell"   },
                    { col:"dia",    label:"Día pago",        align:"text-center", cls:"px-4 py-4 hidden lg:table-cell"   },
                  ].map(({ col, label, align, cls }) => (
                    <th key={col} onClick={() => handleSort(col)} className={`${cls} ${align} text-xs font-black uppercase tracking-wider cursor-pointer hover:bg-white/10 select-none transition-colors`}>
                      {label}<SortIcon col={col} />
                    </th>
                  ))}
                  <th className="px-4 py-4 text-center text-xs font-black uppercase tracking-wider">Estado</th>
                  <th className="px-4 py-4 text-center text-xs font-black uppercase tracking-wider">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {costosFiltrados.map((c, idx) => {
                  const meta = CAT_MAP[c.categoria] || CATEGORIAS[5];
                  const dias = diasRestantes(c.fechaTermino);
                  return (
                    <tr key={c.id} onClick={() => setVistaDetalle(vistaDetalle?.id===c.id ? null : c)}
                      className={`cursor-pointer hover:bg-purple-50/40 transition-colors ${idx%2===0?"bg-white":"bg-slate-50/30"} ${!c.activo?"opacity-60":""}`}
                    >
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${meta.color} flex items-center justify-center flex-shrink-0`}>
                            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d={meta.icon} /></svg>
                          </div>
                          <div>
                            <p className="font-bold text-slate-900 text-sm">{c.nombre}</p>
                            {c.descripcion && <p className="text-xs text-slate-400 truncate max-w-[200px]">{c.descripcion}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4"><span className={`px-2.5 py-1 rounded-lg text-xs font-bold ${meta.badge}`}>{meta.label}</span></td>
                      <td className="px-4 py-4 text-sm text-slate-600 hidden md:table-cell">{c.proveedor || "—"}</td>
                      <td className="px-4 py-4 text-right">
                        {c.frecuencia !== "unico"
                          ? <span className="text-sm font-semibold text-slate-700">{fmt(montoMensual(c), c.moneda)}/mes</span>
                          : <span className="text-xs text-slate-400">Único</span>}
                      </td>
                      <td className="px-4 py-4 text-center hidden sm:table-cell"><span className="text-xs font-semibold text-slate-600 bg-slate-100 px-2 py-1 rounded-lg">{FREC_MAP[c.frecuencia]||c.frecuencia}</span></td>
                      <td className="px-4 py-4 text-center hidden lg:table-cell">
                        {c.fechaTermino
                          ? dias < 0
                            ? <span className="bg-red-100 text-red-700 text-xs font-bold px-2 py-1 rounded-lg">Vencido</span>
                            : dias <= 30
                            ? <span className="bg-amber-100 text-amber-700 text-xs font-bold px-2 py-1 rounded-lg">{dias}d</span>
                            : <span className="text-xs text-slate-500">{new Date(c.fechaTermino).toLocaleDateString("es-CL")}</span>
                          : <span className="text-slate-300 text-xs">—</span>}
                      </td>
                      <td className="px-4 py-4 text-center hidden lg:table-cell">
                        {c.diaPago ? <span className="bg-purple-50 text-purple-700 font-black text-sm px-3 py-1 rounded-lg">Día {c.diaPago}</span> : <span className="text-slate-300 text-xs">—</span>}
                      </td>
                      <td className="px-4 py-4 text-center" onClick={e => { e.stopPropagation(); toggleActivo(c); }}>
                        <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold cursor-pointer transition-all ${c.activo ? "bg-purple-100 text-purple-700 hover:bg-purple-200" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>
                          <div className={`w-1.5 h-1.5 rounded-full ${c.activo ? "bg-purple-600" : "bg-slate-400"}`} />
                          {c.activo ? "Activo" : "Inactivo"}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-center" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-1.5">
                          <button onClick={() => { setEditando(c); setShowModal(true); }} className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-purple-100 hover:text-purple-700 text-slate-500 flex items-center justify-center transition-all" title="Editar">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                          </button>
                          <button onClick={() => handleEliminar(c.id)} disabled={deletingId===c.id} className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-red-100 hover:text-red-600 text-slate-500 flex items-center justify-center transition-all disabled:opacity-50" title="Eliminar">
                            {deletingId===c.id ? <div className="w-3.5 h-3.5 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" /> : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="px-5 py-4 bg-gradient-to-r from-purple-700 to-violet-600 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
              <span className="text-xs font-semibold text-white/70">{costosFiltrados.length} registros mostrados</span>
              <div className="text-right">
                <p className="text-xs text-white/60">Total mensual equiv. (filtro activos)</p>
                <p className="text-lg font-black text-white">{fmtM(costosFiltrados.filter(c=>c.activo).reduce((s,c)=>s+montoMensual(c),0))}</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Panel detalle */}
      {vistaDetalle && (() => {
        const c = vistaDetalle;
        const meta = CAT_MAP[c.categoria] || CATEGORIAS[5];
        const dias = diasRestantes(c.fechaTermino);
        return (
          <div className="glass-card rounded-xl overflow-hidden animate-fadeInUp">
            <div className={`bg-gradient-to-r ${meta.color} px-6 py-4 flex items-center justify-between`}>
              <h3 className="text-white font-black text-lg">{c.nombre}</h3>
              <button onClick={() => setVistaDetalle(null)} className="w-7 h-7 bg-white/20 hover:bg-white/30 rounded-lg flex items-center justify-center transition-colors">
                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="p-6 grid grid-cols-2 sm:grid-cols-4 gap-5">
              <div><p className="text-xs text-slate-400 font-semibold uppercase mb-1">Monto</p><p className="font-black text-slate-900">{fmt(c.monto, c.moneda)}</p></div>
              <div><p className="text-xs text-slate-400 font-semibold uppercase mb-1">Mensual equiv.</p><p className="font-black text-slate-900">{c.frecuencia!=="unico"?fmt(montoMensual(c)):"Pago único"}</p></div>
              <div><p className="text-xs text-slate-400 font-semibold uppercase mb-1">Frecuencia</p><p className="font-bold text-slate-700">{FREC_MAP[c.frecuencia]}</p></div>
              <div><p className="text-xs text-slate-400 font-semibold uppercase mb-1">Proveedor</p><p className="font-bold text-slate-700">{c.proveedor||"—"}</p></div>
              <div><p className="text-xs text-slate-400 font-semibold uppercase mb-1">Inicio</p><p className="font-bold text-slate-700">{c.fechaInicio||"—"}</p></div>
              <div><p className="text-xs text-slate-400 font-semibold uppercase mb-1">Término</p><p className={`font-bold ${dias!==null&&dias<=30?"text-red-600":"text-slate-700"}`}>{c.fechaTermino||"Sin fecha"}</p></div>
              <div><p className="text-xs text-slate-400 font-semibold uppercase mb-1">Día de pago</p><p className="font-black text-purple-700 text-lg">{c.diaPago?`Día ${c.diaPago}`:"—"}</p></div>
              <div><p className="text-xs text-slate-400 font-semibold uppercase mb-1">N° Contrato</p><p className="font-bold text-slate-700 font-mono">{c.numeroContrato||"—"}</p></div>
              {c.descripcion && <div className="col-span-2 sm:col-span-4"><p className="text-xs text-slate-400 font-semibold uppercase mb-1">Descripción</p><p className="text-slate-700 text-sm">{c.descripcion}</p></div>}
              {c.notas && <div className="col-span-2 sm:col-span-4"><p className="text-xs text-slate-400 font-semibold uppercase mb-1">Notas</p><p className="text-slate-600 text-sm bg-slate-50 rounded-xl p-3">{c.notas}</p></div>}
            </div>
          </div>
        );
      })()}

      <ModalCosto isOpen={showModal} onClose={() => { setShowModal(false); setEditando(null); }} onSave={handleSave} editando={editando} />
    </div>
  );
}
