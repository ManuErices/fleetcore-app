import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, setDoc } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useFinanzas, ProyectoSelector } from "./FinanzasContext";

// ─── Design tokens ─────────────────────────────────────────────────────────
// Paleta: blanco base + slate neutros + purple brand + verde/rojo funcionales
// Regla: color solo comunica estado — nunca como decoración

// ─── Utilidades ─────────────────────────────────────────────────────────────
const MESES      = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
const MESES_FULL = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const SUBCATS_EGRESO  = ["REMUNERACIONES","AUTOMOTRIZ","OPERACIONAL","FINANCIERO","ADMINISTRATIVO","OTRO"];
const SUBCATS_INGRESO = ["VENTAS","CONTRATOS","ANTICIPOS","OTRO"];

// Color de acento por subcategoría — solo borde izquierdo, muy sutil
const SUBCAT_ACCENT = {
  REMUNERACIONES: "#6366f1", AUTOMOTRIZ: "#f59e0b", OPERACIONAL: "#0ea5e9",
  FINANCIERO: "#ef4444", ADMINISTRATIVO: "#8b5cf6", VENTAS: "#10b981",
  CONTRATOS: "#14b8a6", ANTICIPOS: "#f97316", OTRO: "#94a3b8", DEFAULT: "#94a3b8",
};
function subAccent(sub) { return SUBCAT_ACCENT[sub] || SUBCAT_ACCENT.DEFAULT; }

function fmtCLP(n) {
  if (!n && n !== 0) return "";
  const abs = Math.abs(Math.round(n));
  return (n < 0 ? "-$" : "$") + abs.toLocaleString("es-CL");
}
function fmtInput(val) {
  const nums = val.toString().replace(/\D/g, "");
  return nums ? parseInt(nums).toLocaleString("es-CL") : "";
}
function parseInput(val) {
  const nums = val.toString().replace(/\D/g, "");
  return nums ? parseInt(nums) : 0;
}
function fmtCompact(n) {
  const a = Math.abs(n || 0);
  if (a >= 1e9) return (n < 0 ? "-$" : "$") + (a/1e9).toFixed(1).replace(".",",") + "B";
  if (a >= 1e6) return (n < 0 ? "-$" : "$") + (a/1e6).toFixed(1).replace(".",",") + "M";
  if (a >= 1e3) return (n < 0 ? "-$" : "$") + (a/1e3).toFixed(0) + "K";
  return fmtCLP(n);
}

function getWeekColumns() {
  const cols = [], seen = new Set();
  const today = new Date();
  let wNum = 1;
  const months = [
    new Date(today.getFullYear(), today.getMonth() - 1, 1),
    new Date(today.getFullYear(), today.getMonth(),     1),
    new Date(today.getFullYear(), today.getMonth() + 1, 1),
  ];
  months.forEach((monthDate, monthIdx) => {
    const first = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
    const last  = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);
    const start = new Date(first);
    const dow = start.getDay();
    start.setDate(first.getDate() + (dow === 0 ? -6 : 1 - dow));
    start.setHours(0, 0, 0, 0);
    let cur = new Date(start);
    while (cur <= last) {
      const ws = new Date(cur);
      const we = new Date(ws); we.setDate(ws.getDate() + 6);
      const key = `${ws.getFullYear()}-${String(ws.getMonth()+1).padStart(2,"0")}-${String(ws.getDate()).padStart(2,"0")}`;
      if (!seen.has(key)) {
        seen.add(key);
        const isCurrentWeek = today >= ws && today <= we;
        cols.push({
          key, label: `S${wNum}`,
          monthLabel: MESES[monthDate.getMonth()],
          monthIndex: monthIdx,
          monthName: MESES_FULL[monthDate.getMonth()],
          startDate: ws, endDate: we,
          dateRange: `${ws.getDate()}/${ws.getMonth()+1}–${we.getDate()}/${we.getMonth()+1}`,
          isCurrentWeek,
        });
        wNum++;
      }
      cur.setDate(cur.getDate() + 7);
    }
  });
  return cols;
}

// ─── Modal: Nueva / Editar Cuenta ──────────────────────────────────────────
function ModalCuenta({ onSave, onClose, editando }) {
  const [form, setForm] = useState(editando || {
    categoria: "EGRESOS", nombre: "", subcategoria: "OPERACIONAL",
    detalle: "", proyectoId: "", cliente: "", presupuestoMensual: "",
    recurrente: false, frecuenciaRecurrente: "mensual", montoRecurrente: "",
  });
  const isIngreso = form.categoria === "INGRESOS";
  const subcats = isIngreso ? SUBCATS_INGRESO : SUBCATS_EGRESO;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{background:"rgba(15,23,42,0.45)", backdropFilter:"blur(4px)"}}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" style={{boxShadow:"0 24px 48px -12px rgba(0,0,0,0.18)"}}>
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900">{editando ? "Editar cuenta" : "Nueva cuenta"}</h3>
            <p className="text-xs text-slate-400 mt-0.5">Completa los campos para continuar</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>
        <div className="p-6 space-y-4">
          {/* Tipo */}
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 block">Tipo</label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: "INGRESOS", label: "Ingreso", color: "", activeStyle: {color:"#065f46",borderColor:"#6ee7b7",background:"#f0fdf4"} },
                { id: "EGRESOS",  label: "Egreso",  color: "", activeStyle: {color:"#9f1239",borderColor:"#fda4af",background:"#fff1f2"} },
              ].map(t => (
                <button key={t.id} onClick={() => setForm(f => ({...f, categoria: t.id, subcategoria: t.id==="INGRESOS"?"VENTAS":"OPERACIONAL"}))}
                  className="py-2.5 rounded-xl text-xs font-semibold border-2 transition-all" style={form.categoria===t.id ? t.activeStyle : {borderColor:"#e2e8f0",color:"#64748b",background:"white"}}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          {/* Nombre */}
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Nombre *</label>
            <input value={form.nombre}
              onChange={e => setForm(f => ({...f, nombre: e.target.value.toUpperCase()}))}
              placeholder="Ej: SUELDO BASE, CONTRATO CLIENTE ABC…"
              className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-100 transition-all placeholder:text-slate-300"/>
          </div>
          {/* Subcategoría */}
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Subcategoría</label>
            <select value={form.subcategoria} onChange={e => setForm(f => ({...f, subcategoria: e.target.value}))}
              className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-100 bg-white transition-all">
              {subcats.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          {/* Detalle */}
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Detalle / Agrupador</label>
            <input value={form.detalle} onChange={e => setForm(f => ({...f, detalle: e.target.value.toUpperCase()}))}
              placeholder="Ej: SUELDOS, COMBUSTIBLE, EP01…"
              className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-100 transition-all placeholder:text-slate-300"/>
          </div>
          {!isIngreso && (
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Presupuesto mensual</label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-medium text-slate-400">$</span>
                <input value={form.presupuestoMensual}
                  onChange={e => setForm(f => ({...f, presupuestoMensual: fmtInput(e.target.value)}))}
                  placeholder="0"
                  className="w-full pl-7 pr-3.5 py-2.5 border border-slate-200 rounded-xl text-sm font-mono focus:outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-100 transition-all placeholder:text-slate-300"/>
              </div>
              <p className="text-[10px] text-slate-400 mt-1">Límite de gasto mensual para esta cuenta. Se mostrará como barra de progreso.</p>
            </div>
          )}
          {isIngreso && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Proyecto</label>
                <input value={form.proyectoId} onChange={e => setForm(f => ({...f, proyectoId: e.target.value.toUpperCase()}))}
                  className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-100 transition-all"/>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Cliente</label>
                <input value={form.cliente} onChange={e => setForm(f => ({...f, cliente: e.target.value}))}
                  className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-100 transition-all"/>
              </div>
            </div>
          )}
          {/* Recurrencia */}
          <div className="rounded-xl border overflow-hidden" style={{borderColor: form.recurrente ? "#ddd6fe" : "#e2e8f0"}}>
            <button
              onClick={() => setForm(f => ({...f, recurrente: !f.recurrente}))}
              className="w-full flex items-center justify-between px-4 py-3 transition-colors"
              style={{background: form.recurrente ? "#f5f3ff" : "#f8fafc"}}>
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{background: form.recurrente ? "#ede9fe" : "#f1f5f9"}}>
                  <svg className="w-4 h-4" style={{color: form.recurrente ? "#7c3aed" : "#94a3b8"}} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                  </svg>
                </div>
                <div className="text-left">
                  <p className="text-xs font-semibold" style={{color: form.recurrente ? "#5b21b6" : "#475569"}}>Cuenta recurrente</p>
                  <p className="text-[10px]" style={{color: form.recurrente ? "#7c3aed" : "#94a3b8"}}>
                    {form.recurrente ? "Autorrellena semanas futuras" : "Activa para autogenerar montos"}
                  </p>
                </div>
              </div>
              <div className="w-9 h-5 rounded-full flex items-center transition-all flex-shrink-0"
                style={{background: form.recurrente ? "#7c3aed" : "#cbd5e1", padding:"2px"}}>
                <div className="w-4 h-4 bg-white rounded-full transition-all"
                  style={{transform: form.recurrente ? "translateX(16px)" : "translateX(0)"}}/>
              </div>
            </button>
            {form.recurrente && (
              <div className="px-4 pb-4 pt-3 space-y-3" style={{borderTop:"0.5px solid #ede9fe", background:"white"}}>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Frecuencia</label>
                    <select value={form.frecuenciaRecurrente}
                      onChange={e => setForm(f => ({...f, frecuenciaRecurrente: e.target.value}))}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-medium focus:outline-none focus:border-purple-400 bg-white">
                      <option value="semanal">Cada semana</option>
                      <option value="quincenal">Cada 2 semanas</option>
                      <option value="mensual">Mensual (1 vez)</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Monto fijo</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-400">$</span>
                      <input value={form.montoRecurrente}
                        onChange={e => setForm(f => ({...f, montoRecurrente: fmtInput(e.target.value)}))}
                        placeholder="0"
                        className="w-full pl-6 pr-2 py-2 border border-slate-200 rounded-lg text-xs font-mono focus:outline-none focus:border-purple-400 placeholder:text-slate-300"/>
                    </div>
                  </div>
                </div>
                <p className="text-[10px] text-slate-400 leading-relaxed">
                  El monto se autorrellena en semanas futuras vacías.
                  Las celdas editadas manualmente no se sobreescriben.
                </p>
              </div>
            )}
          </div>

          <div className="flex gap-2 pt-1">
            <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition-colors">
              Cancelar
            </button>
            <button onClick={() => { if (!form.nombre.trim()) return; onSave(form); }}
              className="flex-1 py-2.5 rounded-xl bg-purple-700 hover:bg-purple-600 text-white text-sm font-semibold transition-colors shadow-sm">
              {editando ? "Guardar" : "Crear cuenta"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Modal: Saldo bancario ─────────────────────────────────────────────────
function ModalSaldo({ saldo, onSave, onClose }) {
  const [val, setVal] = useState(fmtInput(saldo || ""));
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{background:"rgba(15,23,42,0.45)", backdropFilter:"blur(4px)"}}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-100">
          <h3 className="text-sm font-bold text-slate-900">Saldo bancario inicial</h3>
          <p className="text-xs text-slate-400 mt-0.5">Punto de partida del acumulado</p>
        </div>
        <div className="p-6 space-y-4">
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-semibold">$</span>
            <input value={val}
              onChange={e => setVal(fmtInput(e.target.value))}
              onKeyDown={e => e.key === "Enter" && onSave(parseInput(val))}
              placeholder="0"
              className="w-full pl-8 pr-4 py-3 border border-slate-200 rounded-xl text-sm font-semibold text-right focus:outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-100 transition-all" autoFocus/>
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition-colors">Cancelar</button>
            <button onClick={() => onSave(parseInput(val))} className="flex-1 py-2.5 rounded-xl bg-purple-700 hover:bg-purple-600 text-white text-sm font-semibold transition-colors">Guardar</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Celda editable ─────────────────────────────────────────────────────────
function PaymentCell({ value, paid, nota, isEgreso, isCurrentWeek,
  onSave, onTogglePaid, onNota,
  isDragging, isDragOver, onDragStart, onDragOver, onDragLeave, onDrop, onDragEnd }) {

  const [editing, setEditing]   = useState(false);
  const [inputVal, setInputVal] = useState("");
  const [showNota, setShowNota] = useState(false);
  const [notaVal, setNotaVal]   = useState(nota || "");
  const inputRef = useRef(null);

  const isEmpty = !value || value === 0;

  const startEdit = () => {
    setInputVal(value ? fmtInput(Math.abs(value)) : "");
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  };
  const commit = () => {
    const n = parseInput(inputVal);
    onSave(isEgreso ? -n : n);
    setEditing(false);
  };

  // valueColor ahora se aplica inline directamente en el span

  return (
    <td
      draggable={!isEmpty}
      onDragStart={!isEmpty ? onDragStart : undefined}
      onDragOver={e => onDragOver(e)}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      className={`relative border-r border-slate-100 transition-all select-none
        "bg-white"
        ${isDragging    ? "opacity-30" : ""}
        "" 
        ${paid && !isDragOver ? "bg-slate-50" : ""}
      `}
      style={{ minWidth: "112px", height: "36px", cursor: editing ? "text" : "default", background: isDragOver ? "#ede9fe" : isCurrentWeek ? "rgba(237,233,254,0.25)" : "white", outline: isDragOver ? "2px solid #7c3aed" : "none", outlineOffset: "-2px", zIndex: isDragOver ? 10 : "auto" }}>

      {/* Indicador semana actual — línea izquierda sutil */}
      {isCurrentWeek && !isDragOver && (
        <div style={{position:"absolute",left:0,top:"4px",bottom:"4px",width:"2px",background:"#7c3aed",opacity:0.5,borderRadius:"0 2px 2px 0"}}/>
      )}

      {editing ? (
        <div className="flex items-center justify-center h-full px-1 gap-0.5">
          <span className="text-slate-400 text-[11px] font-mono">$</span>
          <input ref={inputRef} value={inputVal}
            onChange={e => setInputVal(fmtInput(e.target.value))}
            onBlur={commit}
            onKeyDown={e => { if(e.key==="Enter"||e.key==="Tab") { e.preventDefault(); commit(); } if(e.key==="Escape") setEditing(false); }}
            className="flex-1 text-center text-[11px] font-mono font-semibold bg-transparent focus:outline-none text-slate-800 min-w-0"/>
        </div>
      ) : (
        <div className="group flex items-center justify-center h-full cursor-pointer" onClick={startEdit}
          style={{position:"relative"}}>
          {/* Valor — siempre centrado, sin nada que lo desplace */}
          <span className="text-[11px] font-mono font-semibold" style={{
            color: paid ? "#cbd5e1" : isEgreso ? (isEmpty ? "#e2e8f0" : "#e11d48") : (isEmpty ? "#e2e8f0" : "#059669"),
            textDecoration: paid ? "line-through" : "none",
          }}>
            {isEmpty ? "—" : fmtCompact(value)}
          </span>
          {/* Botones — overlay absoluto, no desplazan el número */}
          {!isEmpty && (
            <div className="opacity-0 group-hover:opacity-100 transition-opacity"
              style={{position:"absolute", bottom:"2px", left:"50%", transform:"translateX(-50%)", display:"flex", gap:"2px", background:"white", borderRadius:"4px", padding:"1px", boxShadow:"0 1px 4px rgba(0,0,0,0.1)"}}>
              <button onClick={e => { e.stopPropagation(); onTogglePaid(); }}
                title={paid ? "Marcar pendiente" : "Marcar pagado"}
                className="w-4 h-4 rounded flex items-center justify-center" style={paid ? {background:"#d1fae5",color:"#059669"} : {background:"#f1f5f9",color:"#94a3b8"}}>
                <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7"/></svg>
              </button>
              <button onClick={e => { e.stopPropagation(); setNotaVal(nota||""); setShowNota(true); }}
                title="Nota"
                className="w-4 h-4 rounded flex items-center justify-center" style={nota ? {background:"#fef3c7",color:"#d97706"} : {background:"#f1f5f9",color:"#94a3b8"}}>
                <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h6"/></svg>
              </button>
            </div>
          )}
          {/* Dots indicadores — esquina superior derecha */}
          {paid && <span style={{position:"absolute", top:"3px", right:"3px", width:"5px", height:"5px", borderRadius:"50%", background:"#34d399"}}/>}
          {nota && !paid && <span style={{position:"absolute", top:"3px", right:"3px", width:"5px", height:"5px", borderRadius:"50%", background:"#fbbf24"}}/>}
        </div>
      )}

      {/* Popup nota */}
      {showNota && (
        <div className="absolute z-40 top-0 left-full ml-1 bg-white rounded-xl shadow-xl border border-slate-200 p-3 w-48" onClick={e => e.stopPropagation()}>
          <p className="text-[10px] font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">Nota</p>
          <textarea value={notaVal} onChange={e => setNotaVal(e.target.value)}
            rows={2} placeholder="Agrega una nota…" autoFocus
            className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 resize-none focus:outline-none focus:border-purple-400"/>
          <div className="flex gap-1.5 mt-2">
            <button onClick={() => setShowNota(false)} className="flex-1 py-1 text-[10px] font-medium text-slate-500 hover:text-slate-700">Cancelar</button>
            <button onClick={() => { onNota(notaVal); setShowNota(false); }}
              className="flex-1 py-1 text-[10px] font-semibold bg-purple-700 text-white rounded-lg">Guardar</button>
          </div>
        </div>
      )}
    </td>
  );
}

// ─── Fila de cuenta ─────────────────────────────────────────────────────────
function AccountRow({ account, weekColumns, payments, paymentsPaid, paymentNotas,
  onPayment, onTogglePaid, onNota, onEdit, onDelete, proyectoId,
  draggedPayment, dragOverKey, onDragStart, onDragOver, onDragLeave, onDrop, onDragEnd,
  mesActualWeeks }) {

  const isEgreso = account.categoria === "EGRESOS";
  if (proyectoId !== "todos" && account.proyectoId && account.proyectoId !== proyectoId) return null;

  const rowTotal = weekColumns.reduce((s, w) => s + (payments[`${account.id}-${w.key}`] || 0), 0);

  // ── Presupuesto vs Real ────────────────────────────────────────────────────
  const budget = parseInput(account.presupuestoMensual || "0");
  const gastoMesActual = isEgreso && budget > 0 && mesActualWeeks
    ? Math.abs(mesActualWeeks.reduce((s, w) => s + (payments[`${account.id}-${w.key}`] || 0), 0))
    : 0;
  const budgetPct   = budget > 0 ? Math.min((gastoMesActual / budget) * 100, 100) : 0;
  const budgetOver  = budget > 0 && gastoMesActual > budget;
  const budgetWarn  = budget > 0 && budgetPct >= 80 && !budgetOver;
  const showBudget  = isEgreso && budget > 0;

  return (
    <tr className="group transition-colors" style={{background:"white"}} onMouseEnter={e=>e.currentTarget.style.background="#f8fafc"} onMouseLeave={e=>e.currentTarget.style.background="white"}>
      {/* Nombre */}
      <td className="sticky left-0 z-10 border-r" style={{background:"white", borderRight:"0.5px solid #f1f5f9", minWidth:"220px", height:"36px", paddingLeft:"16px", paddingRight:"8px"}}>
        <div className="flex items-center justify-between gap-1 h-full">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <p className="text-[11px] font-medium text-slate-700 truncate leading-tight">{account.nombre}</p>
              {account.recurrente && (
                <span className="flex-shrink-0 text-[8px] font-bold px-1 rounded" style={{background:"#ede9fe",color:"#7c3aed"}} title={`Recurrente · ${account.frecuenciaRecurrente || "mensual"}`}>↺</span>
              )}
              {budgetOver && (
                <span className="flex-shrink-0 text-[8px] font-bold px-1 rounded" style={{background:"#ffe4e6",color:"#e11d48"}}>EXCEDIDO</span>
              )}
              {budgetWarn && (
                <span className="flex-shrink-0 text-[8px] font-bold px-1 rounded" style={{background:"#fef3c7",color:"#b45309"}}>80%</span>
              )}
            </div>
            {account.detalle && <p className="text-[9px] text-slate-400 truncate leading-tight">{account.detalle}</p>}
            {showBudget && (
              <div className="mt-1 flex items-center gap-1.5">
                <div className="flex-1 rounded-full overflow-hidden" style={{height:"3px",background:"#f1f5f9"}}>
                  <div className="h-full rounded-full transition-all" style={{
                    width:`${budgetPct}%`,
                    background: budgetOver ? "#e11d48" : budgetWarn ? "#f59e0b" : "#059669",
                  }}/>
                </div>
                <span className="text-[8px] font-mono flex-shrink-0" style={{color: budgetOver ? "#e11d48" : budgetWarn ? "#b45309" : "#94a3b8"}}>
                  {Math.round(budgetPct)}%
                </span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
            <button onClick={() => onEdit(account)}
              className="w-5 h-5 rounded-md bg-slate-100 hover:bg-purple-100 text-slate-400 hover:text-purple-600 flex items-center justify-center transition-colors">
              <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
            </button>
            <button onClick={() => onDelete(account.id)}
              className="w-5 h-5 rounded-md flex items-center justify-center" style={{background:"#f1f5f9",color:"#94a3b8"}} onMouseEnter={e=>{e.currentTarget.style.background="#ffe4e6";e.currentTarget.style.color="#e11d48"}} onMouseLeave={e=>{e.currentTarget.style.background="#f1f5f9";e.currentTarget.style.color="#94a3b8"}}>
              <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
            </button>
          </div>
        </div>
      </td>

      {/* Celdas semanales */}
      {weekColumns.map(week => {
        const key = `${account.id}-${week.key}`;
        return (
          <PaymentCell key={key}
            value={payments[key] || 0}
            paid={!!paymentsPaid[key]}
            nota={paymentNotas[key] || ""}
            isEgreso={isEgreso}
            isCurrentWeek={week.isCurrentWeek}
            onSave={val => onPayment(key, val)}
            onTogglePaid={() => onTogglePaid(key)}
            onNota={nota => onNota(key, nota)}
            isDragging={draggedPayment?.sourceKey === key}
            isDragOver={dragOverKey === key}
            onDragStart={() => onDragStart(account.id, week.key)}
            onDragOver={e => onDragOver(e, key)}
            onDragLeave={onDragLeave}
            onDrop={() => onDrop(account.id, week.key)}
            onDragEnd={onDragEnd}
          />
        );
      })}

      {/* Total fila */}
      <td className="sticky right-0 border-l text-center" style={{background:"white", borderLeft:"0.5px solid #f1f5f9", minWidth:"96px"}}>
        {rowTotal !== 0 ? (
          <span className="text-[11px] font-mono font-semibold" style={{color: isEgreso ? "#e11d48" : "#059669"}}>
            {fmtCompact(rowTotal)}
          </span>
        ) : (
          <span className="text-[11px] text-slate-200">—</span>
        )}
      </td>
    </tr>
  );
}

// ─── Componente principal ────────────────────────────────────────────────────
export default function FinanzasFlujoCaja() {
  const { proyectoId } = useFinanzas();
  const weekColumns = useMemo(() => getWeekColumns(), []);
  const tableRef = useRef(null);

  const [cuentas,      setCuentas]      = useState([]);
  const [payments,     setPayments]     = useState({});
  const [paymentsPaid, setPaymentsPaid] = useState({});
  const [paymentNotas, setPaymentNotas] = useState({});
  const [saldoBanco,   setSaldoBanco]   = useState(0);
  const [loading,      setLoading]      = useState(true);

  const [showModalCuenta, setShowModalCuenta] = useState(false);
  const [editandoCuenta,  setEditandoCuenta]  = useState(null);
  const [showModalSaldo,  setShowModalSaldo]  = useState(false);
  const [busqueda,        setBusqueda]        = useState("");
  const [collapsed,       setCollapsed]       = useState({});
  const [tabActiva,       setTabActiva]       = useState("tabla");
  const [draggedPayment,  setDraggedPayment]  = useState(null);
  const [dragOverKey,     setDragOverKey]     = useState(null);
  const [showExportMenu,  setShowExportMenu]  = useState(false);
  const [exportando,      setExportando]      = useState(null); // null | "excel" | "pdf"

  // ── Firebase ───────────────────────────────────────────────────────────────
  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const [snapC, snapP, snapPaid, snapNotas, snapCfg] = await Promise.all([
        getDocs(collection(db, "flujo_cuentas")),
        getDocs(collection(db, "flujo_pagos")),
        getDocs(collection(db, "flujo_pagados")),
        getDocs(collection(db, "flujo_notas")),
        getDocs(collection(db, "flujo_config")),
      ]);
      const cuentasList = snapC.docs.map(d => ({ id: d.id, ...d.data() }));
      setCuentas(cuentasList);
      const pMap = {}; snapP.docs.forEach(d => { pMap[d.id] = d.data().valor || 0; });
      // Autorrelleno recurrentes — en memoria, no persiste a Firebase
      const weeksSnap = getWeekColumns();
      const filledMap = applyRecurrentes(cuentasList, pMap, weeksSnap);
      setPayments(filledMap || pMap);
      const paidMap = {}; snapPaid.docs.forEach(d => { paidMap[d.id] = true; }); setPaymentsPaid(paidMap);
      const notaMap = {}; snapNotas.docs.forEach(d => { notaMap[d.id] = d.data().texto || ""; }); setPaymentNotas(notaMap);
      snapCfg.docs.forEach(d => { if (d.id === "saldo_banco") setSaldoBanco(d.data().valor || 0); });
    } catch(e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  // ── Autorrelleno de recurrentes ────────────────────────────────────────────
  // Se ejecuta cuando hay cuentas o payments listos
  // Rellena solo semanas FUTURAS y VACÍAS — nunca sobreescribe ediciones manuales
  const applyRecurrentes = useCallback((cuentasList, paymentsMap, weeks) => {
    const today = new Date(); today.setHours(0,0,0,0);
    const filled = { ...paymentsMap };
    let changed = false;
    cuentasList.forEach(c => {
      if (!c.recurrente || !c.montoRecurrente) return;
      const monto = -Math.abs(parseInput(c.montoRecurrente)); // egresos siempre negativos
      const isIngreso = c.categoria === "INGRESOS";
      const montoFinal = isIngreso ? Math.abs(parseInput(c.montoRecurrente)) : monto;
      const futuras = weeks.filter(w => w.startDate >= today);
      futuras.forEach((w, idx) => {
        const key = `${c.id}-${w.key}`;
        if (filled[key]) return; // ya tiene valor — no sobreescribir
        const freq = c.frecuenciaRecurrente || "mensual";
        let aplicar = false;
        if (freq === "semanal") aplicar = true;
        else if (freq === "quincenal") aplicar = idx % 2 === 0;
        else if (freq === "mensual") {
          // Solo la primera semana de cada mes
          const prevSameMes = futuras.slice(0, idx).find(pw => pw.monthIndex === w.monthIndex);
          aplicar = !prevSameMes;
        }
        if (aplicar) { filled[key] = montoFinal; changed = true; }
      });
    });
    return changed ? filled : null;
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const handlePayment = useCallback(async (key, valor) => {
    setPayments(prev => ({ ...prev, [key]: valor }));
    try { await setDoc(doc(db, "flujo_pagos", key), { valor, updatedAt: new Date().toISOString() }); } catch(e) {}
  }, []);

  const handleTogglePaid = useCallback(async (key) => {
    const nuevo = !paymentsPaid[key];
    setPaymentsPaid(prev => ({ ...prev, [key]: nuevo }));
    try {
      if (nuevo) await setDoc(doc(db, "flujo_pagados", key), { paidAt: new Date().toISOString() });
      else await deleteDoc(doc(db, "flujo_pagados", key));
    } catch(e) {}
  }, [paymentsPaid]);

  const handleNota = useCallback(async (key, texto) => {
    setPaymentNotas(prev => ({ ...prev, [key]: texto }));
    try {
      if (texto) await setDoc(doc(db, "flujo_notas", key), { texto, updatedAt: new Date().toISOString() });
      else await deleteDoc(doc(db, "flujo_notas", key));
    } catch(e) {}
  }, []);

  // ── Drag & Drop ────────────────────────────────────────────────────────────
  const handleDragStart = useCallback((cuentaId, weekKey) => {
    const key = `${cuentaId}-${weekKey}`;
    const valor = payments[key] || 0;
    if (!valor) return;
    setDraggedPayment({ cuentaId, weekKey, valor, sourceKey: key });
  }, [payments]);

  const handleDragOver = useCallback((e, key) => {
    e.preventDefault(); setDragOverKey(key);
  }, []);

  const handleDragLeave = useCallback(() => { setDragOverKey(null); }, []);

  const handleDrop = useCallback(async (cuentaId, weekKey) => {
    if (!draggedPayment) return;
    const { sourceKey, valor } = draggedPayment;
    const targetKey = `${cuentaId}-${weekKey}`;
    if (sourceKey === targetKey) { setDraggedPayment(null); setDragOverKey(null); return; }
    setPayments(prev => ({ ...prev, [targetKey]: valor, [sourceKey]: 0 }));
    if (paymentNotas[sourceKey]) {
      setPaymentNotas(prev => { const next = { ...prev, [targetKey]: prev[sourceKey] }; delete next[sourceKey]; return next; });
    }
    if (paymentsPaid[sourceKey]) {
      setPaymentsPaid(prev => { const next = { ...prev, [targetKey]: true }; delete next[sourceKey]; return next; });
    }
    try {
      await Promise.all([
        setDoc(doc(db, "flujo_pagos", targetKey), { valor, updatedAt: new Date().toISOString() }),
        setDoc(doc(db, "flujo_pagos", sourceKey), { valor: 0, updatedAt: new Date().toISOString() }),
        ...(paymentNotas[sourceKey] ? [setDoc(doc(db, "flujo_notas", targetKey), { texto: paymentNotas[sourceKey] }), deleteDoc(doc(db, "flujo_notas", sourceKey))] : []),
        ...(paymentsPaid[sourceKey] ? [setDoc(doc(db, "flujo_pagados", targetKey), { paidAt: new Date().toISOString() }), deleteDoc(doc(db, "flujo_pagados", sourceKey))] : []),
      ]);
    } catch(e) {}
    setDraggedPayment(null); setDragOverKey(null);
  }, [draggedPayment, paymentNotas, paymentsPaid]);

  const handleDragEnd = useCallback(() => { setDraggedPayment(null); setDragOverKey(null); }, []);

  // ── CRUD ───────────────────────────────────────────────────────────────────
  const handleSaveCuenta = useCallback(async (form) => {
    try {
      if (editandoCuenta) {
        await updateDoc(doc(db, "flujo_cuentas", editandoCuenta.id), form);
        setCuentas(prev => prev.map(c => c.id === editandoCuenta.id ? { ...c, ...form } : c));
      } else {
        const ref = await addDoc(collection(db, "flujo_cuentas"), { ...form, creadoEn: new Date().toISOString() });
        setCuentas(prev => [...prev, { id: ref.id, ...form }]);
      }
    } catch(e) {}
    // Re-aplicar recurrentes después de guardar/editar
    setCuentas(prev => {
      setPayments(pm => {
        const filled = applyRecurrentes(prev, pm, weekColumns);
        return filled || pm;
      });
      return prev;
    });
    setShowModalCuenta(false); setEditandoCuenta(null);
  }, [editandoCuenta, applyRecurrentes, weekColumns]);

  const handleDeleteCuenta = useCallback(async (id) => {
    if (!window.confirm("¿Eliminar esta cuenta? Se perderán todos sus montos.")) return;
    try { await deleteDoc(doc(db, "flujo_cuentas", id)); setCuentas(prev => prev.filter(c => c.id !== id)); } catch(e) {}
  }, []);

  const handleSaldoBanco = useCallback(async (val) => {
    setSaldoBanco(val); setShowModalSaldo(false);
    try { await setDoc(doc(db, "flujo_config", "saldo_banco"), { valor: val }); } catch(e) {}
  }, []);

  // ── Cálculos ───────────────────────────────────────────────────────────────
  const cuentasFiltradas = useMemo(() => {
    let lista = cuentas;
    if (busqueda) lista = lista.filter(c => c.nombre?.toLowerCase().includes(busqueda.toLowerCase()));
    if (proyectoId !== "todos") lista = lista.filter(c => !c.proyectoId || c.proyectoId === proyectoId);
    return lista;
  }, [cuentas, busqueda, proyectoId]);

  const mesActualWeeks = useMemo(() => weekColumns.filter(w => w.monthIndex === 1), [weekColumns]);

  const ingresos = useMemo(() => cuentasFiltradas.filter(c => c.categoria === "INGRESOS"), [cuentasFiltradas]);
  const egresos  = useMemo(() => cuentasFiltradas.filter(c => c.categoria === "EGRESOS"),  [cuentasFiltradas]);
  const subcatsEgreso = useMemo(() => [...new Set(egresos.map(c => c.subcategoria).filter(Boolean))], [egresos]);

  function weekTotal(weekKey, lista) {
    return lista.reduce((s, c) => s + (payments[`${c.id}-${weekKey}`] || 0), 0);
  }

  // ── Exportación ────────────────────────────────────────────────────────────
  const cargarSheetJS = () => new Promise((resolve, reject) => {
    if (window.XLSX) { resolve(window.XLSX); return; }
    const s = document.createElement("script");
    s.src = "https://cdn.sheetjs.com/xlsx-0.20.1/package/dist/xlsx.full.min.js";
    s.onload = () => resolve(window.XLSX);
    s.onerror = reject;
    document.head.appendChild(s);
  });

  const exportarExcel = useCallback(async () => {
    setExportando("excel");
    try {
      const XLSX = await cargarSheetJS();
      const wb = XLSX.utils.book_new();
      const hoy = new Date();
      const mesLabel = `${hoy.getDate()}-${hoy.getMonth()+1}-${hoy.getFullYear()}`;

      // ── Hoja 1: Flujo semanal ──────────────────────────────────────────────
      const header1 = ["CUENTA", "CATEGORÍA", "SUBCATEGORÍA", ...weekColumns.map(w => `${w.label} (${w.dateRange})`), "TOTAL"];
      const rows1 = [];
      [...ingresos, ...egresos].forEach(c => {
        const row = [c.nombre, c.categoria, c.subcategoria || ""];
        let total = 0;
        weekColumns.forEach(w => {
          const v = payments[`${c.id}-${w.key}`] || 0;
          row.push(v !== 0 ? v : "");
          total += v;
        });
        row.push(total !== 0 ? total : "");
        rows1.push(row);
      });
      // Fila neto
      const netoRow = ["NETO SEMANAL", "", ""];
      let netoTotal = 0;
      weekColumns.forEach(w => {
        const n = weekTotal(w.key, ingresos) + weekTotal(w.key, egresos);
        netoRow.push(n !== 0 ? n : "");
        netoTotal += n;
      });
      netoRow.push(netoTotal);
      rows1.push([], netoRow);
      const ws1 = XLSX.utils.aoa_to_sheet([header1, ...rows1]);
      ws1["!cols"] = [{ wch: 28 }, { wch: 12 }, { wch: 16 }, ...weekColumns.map(() => ({ wch: 14 })), { wch: 14 }];
      XLSX.utils.book_append_sheet(wb, ws1, "Flujo Semanal");

      // ── Hoja 2: Resumen mensual ────────────────────────────────────────────
      const header2 = ["MES", "SEMANA", "RANGO", "INGRESOS", "EGRESOS", "NETO"];
      const rows2 = [];
      [0, 1, 2].forEach(mIdx => {
        const sems = weekColumns.filter(w => w.monthIndex === mIdx);
        if (!sems.length) return;
        const mesNombre = sems[0].monthName + " " + sems[0].startDate.getFullYear();
        sems.forEach(w => {
          const wIng = weekTotal(w.key, ingresos);
          const wEgr = weekTotal(w.key, egresos);
          rows2.push([mesNombre, w.label, w.dateRange, wIng || "", wEgr || "", (wIng + wEgr) || ""]);
        });
        const mIng = sems.reduce((s,w) => s + weekTotal(w.key, ingresos), 0);
        const mEgr = sems.reduce((s,w) => s + weekTotal(w.key, egresos), 0);
        rows2.push([`TOTAL ${mesNombre.toUpperCase()}`, "", "", mIng, mEgr, mIng+mEgr], []);
      });
      const ws2 = XLSX.utils.aoa_to_sheet([header2, ...rows2]);
      ws2["!cols"] = [{ wch: 20 }, { wch: 8 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }];
      XLSX.utils.book_append_sheet(wb, ws2, "Resumen Mensual");

      // ── Hoja 3: Cuentas ───────────────────────────────────────────────────
      const header3 = ["NOMBRE", "CATEGORÍA", "SUBCATEGORÍA", "DETALLE", "RECURRENTE", "FRECUENCIA", "MONTO RECURRENTE", "PRESUPUESTO MENSUAL"];
      const rows3 = cuentas.map(c => [
        c.nombre, c.categoria, c.subcategoria || "", c.detalle || "",
        c.recurrente ? "Sí" : "No", c.frecuenciaRecurrente || "",
        c.montoRecurrente ? parseInput(c.montoRecurrente) : "",
        c.presupuestoMensual ? parseInput(c.presupuestoMensual) : "",
      ]);
      const ws3 = XLSX.utils.aoa_to_sheet([header3, ...rows3]);
      ws3["!cols"] = [{ wch: 28 }, { wch: 12 }, { wch: 16 }, { wch: 20 }, { wch: 12 }, { wch: 14 }, { wch: 18 }, { wch: 18 }];
      XLSX.utils.book_append_sheet(wb, ws3, "Cuentas");

      XLSX.writeFile(wb, `FlujoCaja_MPF_${mesLabel}.xlsx`);
    } catch(e) { console.error(e); alert("Error al exportar Excel"); }
    finally { setExportando(null); setShowExportMenu(false); }
  }, [ingresos, egresos, cuentas, weekColumns, payments]);

  const exportarPDF = useCallback(() => {
    setExportando("pdf");
    setShowExportMenu(false);
    const hoy = new Date();
    const mesLabel = MESES_FULL[hoy.getMonth()] + " " + hoy.getFullYear();

    // Construir tabla HTML para imprimir
    const allCuentas = [...ingresos, ...egresos];
    const filas = allCuentas.map(c => {
      const celdas = weekColumns.map(w => {
        const v = payments[`${c.id}-${w.key}`] || 0;
        const color = v > 0 ? "#059669" : v < 0 ? "#e11d48" : "#94a3b8";
        return `<td style="text-align:center;font-family:monospace;font-size:9px;padding:3px 4px;color:${color};border:0.5px solid #e2e8f0">${v !== 0 ? fmtCompact(v) : "—"}</td>`;
      }).join("");
      const total = weekColumns.reduce((s,w) => s + (payments[`${c.id}-${w.key}`]||0), 0);
      const totalColor = total > 0 ? "#059669" : total < 0 ? "#e11d48" : "#94a3b8";
      return `<tr>
        <td style="padding:3px 6px;font-size:9px;font-weight:600;color:#1e293b;border:0.5px solid #e2e8f0;white-space:nowrap;max-width:180px;overflow:hidden;text-overflow:ellipsis">${c.nombre}</td>
        <td style="padding:3px 4px;font-size:8px;color:#64748b;border:0.5px solid #e2e8f0">${c.subcategoria||""}</td>
        ${celdas}
        <td style="text-align:center;font-family:monospace;font-size:9px;font-weight:700;padding:3px 4px;color:${totalColor};border:0.5px solid #e2e8f0">${total!==0?fmtCompact(total):"—"}</td>
      </tr>`;
    }).join("");

    const headerCols = weekColumns.map(w =>
      `<th style="padding:3px 4px;font-size:8px;font-weight:600;color:#475569;text-align:center;border:0.5px solid #e2e8f0;white-space:nowrap">${w.label}<br/><span style="font-weight:400;font-size:7px">${w.dateRange}</span></th>`
    ).join("");

    // Resumen KPIs
    const resumenHtml = [0,1,2].map(mIdx => {
      const sems = weekColumns.filter(w => w.monthIndex === mIdx);
      if (!sems.length) return "";
      const mIng = sems.reduce((s,w) => s + weekTotal(w.key, ingresos), 0);
      const mEgr = sems.reduce((s,w) => s + weekTotal(w.key, egresos), 0);
      const mNeto = mIng + mEgr;
      const mesNombre = sems[0].monthName + " " + sems[0].startDate.getFullYear();
      return `<tr>
        <td style="padding:4px 8px;font-size:10px;font-weight:600;color:#1e293b;border:0.5px solid #e2e8f0">${mesNombre}</td>
        <td style="padding:4px 8px;font-size:10px;font-family:monospace;color:#059669;text-align:right;border:0.5px solid #e2e8f0">${fmtCLP(mIng)}</td>
        <td style="padding:4px 8px;font-size:10px;font-family:monospace;color:#e11d48;text-align:right;border:0.5px solid #e2e8f0">${fmtCLP(Math.abs(mEgr))}</td>
        <td style="padding:4px 8px;font-size:10px;font-family:monospace;font-weight:700;color:${mNeto>=0?"#059669":"#e11d48"};text-align:right;border:0.5px solid #e2e8f0">${fmtCLP(mNeto)}</td>
      </tr>`;
    }).join("");

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/>
    <title>Flujo de Caja MPF — ${mesLabel}</title>
    <style>
      @page { size: A4 landscape; margin: 12mm 10mm; }
      body { font-family: -apple-system, sans-serif; color: #1e293b; }
      h1 { font-size: 16px; font-weight: 700; margin: 0 0 2px; color: #1e293b; }
      .sub { font-size: 10px; color: #64748b; margin: 0 0 12px; }
      .section { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #7c3aed; margin: 12px 0 4px; }
      table { width: 100%; border-collapse: collapse; }
      @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
    </style></head><body>
    <h1>Flujo de Caja — MPF Ingeniería Civil SPA</h1>
    <p class="sub">Generado el ${hoy.toLocaleDateString("es-CL", {weekday:"long", year:"numeric", month:"long", day:"numeric"})}</p>

    <div class="section">Resumen mensual</div>
    <table><thead><tr>
      <th style="padding:4px 8px;font-size:9px;text-align:left;border:0.5px solid #e2e8f0;background:#f8fafc">Mes</th>
      <th style="padding:4px 8px;font-size:9px;text-align:right;border:0.5px solid #e2e8f0;background:#f8fafc">Ingresos</th>
      <th style="padding:4px 8px;font-size:9px;text-align:right;border:0.5px solid #e2e8f0;background:#f8fafc">Egresos</th>
      <th style="padding:4px 8px;font-size:9px;text-align:right;border:0.5px solid #e2e8f0;background:#f8fafc">Neto</th>
    </tr></thead><tbody>${resumenHtml}</tbody></table>

    <div class="section">Detalle semanal</div>
    <table><thead><tr>
      <th style="padding:3px 6px;font-size:9px;text-align:left;border:0.5px solid #e2e8f0;background:#f8fafc;min-width:140px">Cuenta</th>
      <th style="padding:3px 4px;font-size:8px;border:0.5px solid #e2e8f0;background:#f8fafc">Subcategoría</th>
      ${headerCols}
      <th style="padding:3px 4px;font-size:9px;text-align:center;border:0.5px solid #e2e8f0;background:#f8fafc;font-weight:700">Total</th>
    </tr></thead><tbody>${filas}</tbody></table>
    </body></html>`;

    const w = window.open("", "_blank", "width=900,height=700");
    w.document.write(html);
    w.document.close();
    w.onload = () => { w.print(); setExportando(null); };
    setTimeout(() => setExportando(null), 2000);
  }, [ingresos, egresos, weekColumns, payments]);

  const acumulados = useMemo(() => {
    const acc = {};
    let running = saldoBanco;
    weekColumns.forEach(w => {
      running += weekTotal(w.key, ingresos) + weekTotal(w.key, egresos);
      acc[w.key] = running;
    });
    return acc;
    // eslint-disable-next-line
  }, [weekColumns, ingresos, egresos, payments, saldoBanco]);

  const kpiIngresos = useMemo(() => ingresos.reduce((s, c) => s + weekColumns.reduce((ws, w) => ws + (payments[`${c.id}-${w.key}`] || 0), 0), 0), [ingresos, payments, weekColumns]);
  const kpiEgresos  = useMemo(() => egresos.reduce((s, c)  => s + weekColumns.reduce((ws, w) => ws + (payments[`${c.id}-${w.key}`] || 0), 0), 0), [egresos,  payments, weekColumns]);
  const kpiNeto     = kpiIngresos + kpiEgresos;
  const kpiPendiente = useMemo(() => egresos.reduce((s, c) => s + weekColumns.reduce((ws, w) => {
    const key = `${c.id}-${w.key}`;
    const v = payments[key] || 0;
    return ws + (v < 0 && !paymentsPaid[key] ? Math.abs(v) : 0);
  }, 0), 0), [egresos, weekColumns, payments, paymentsPaid]);

  const semanasNegativas = useMemo(() =>
    weekColumns.filter(w => weekTotal(w.key, ingresos) + weekTotal(w.key, egresos) < 0).length,
  // eslint-disable-next-line
  [weekColumns, ingresos, egresos, payments]);

  const toggleCollapse = (key) => setCollapsed(p => ({ ...p, [key]: !p[key] }));
  const scrollToMonth  = (idx) => {
    const target = weekColumns.find(w => w.monthIndex === idx);
    if (!target || !tableRef.current) return;
    tableRef.current.scrollTo({ left: weekColumns.indexOf(target) * 112, behavior: "smooth" });
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-purple-200 border-t-purple-600 rounded-full animate-spin"/>
    </div>
  );

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full bg-slate-50/40">

      {/* ── Topbar ──────────────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-slate-100 px-5 py-4 flex-shrink-0">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold text-slate-900 tracking-tight">
              Flujo de <span className="text-purple-700">Caja</span>
            </h1>
            <p className="text-slate-400 text-xs mt-0.5 font-medium">
              Vista semanal · {weekColumns.length} semanas · 3 meses
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ProyectoSelector />
            {/* Saldo banco */}
            <button onClick={() => setShowModalSaldo(true)}
              style={saldoBanco ? {borderColor:"#6ee7b7",background:"#f0fdf4",color:"#065f46"} : {borderColor:"#e2e8f0",background:"white",color:"#64748b"}} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${
                saldoBanco ? "border-slate-200" : "border-slate-200"}`}>
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"/></svg>
              {saldoBanco ? fmtCompact(saldoBanco) : "Saldo banco"}
            </button>
            {/* Buscador */}
            <div className="relative">
              <svg className="w-3.5 h-3.5 text-slate-300 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0"/></svg>
              <input value={busqueda} onChange={e => setBusqueda(e.target.value)}
                placeholder="Buscar…"
                className="pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-100 text-xs bg-white text-slate-700 w-32 transition-all placeholder:text-slate-300"/>
            </div>
            {/* Exportar — dropdown */}
            <div className="relative">
              <button onClick={() => setShowExportMenu(v => !v)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 text-xs font-semibold hover:bg-slate-50 transition-colors">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
                {exportando ? "Exportando…" : "Exportar"}
                <svg className="w-3 h-3 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/></svg>
              </button>
              {showExportMenu && (
                <div className="absolute right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-50 overflow-hidden w-44"
                  style={{boxShadow:"0 8px 24px -4px rgba(0,0,0,0.12)"}}>
                  <button onClick={exportarExcel}
                    className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors text-left">
                    <svg className="w-4 h-4 flex-shrink-0" style={{color:"#059669"}} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                    <div>
                      <p className="font-semibold">Excel (.xlsx)</p>
                      <p className="text-[10px] text-slate-400">3 hojas con datos completos</p>
                    </div>
                  </button>
                  <div className="border-t border-slate-100"/>
                  <button onClick={exportarPDF}
                    className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors text-left">
                    <svg className="w-4 h-4 flex-shrink-0" style={{color:"#e11d48"}} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"/></svg>
                    <div>
                      <p className="font-semibold">PDF / Imprimir</p>
                      <p className="text-[10px] text-slate-400">Resumen ejecutivo A4</p>
                    </div>
                  </button>
                </div>
              )}
            </div>
            {/* Cerrar dropdown al hacer click afuera */}
            {showExportMenu && <div className="fixed inset-0 z-40" onClick={() => setShowExportMenu(false)}/>}
            {/* Nueva cuenta */}
            <button onClick={() => { setEditandoCuenta(null); setShowModalCuenta(true); }}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-purple-700 hover:bg-purple-600 text-white text-xs font-semibold rounded-lg transition-colors shadow-sm">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4"/></svg>
              Nueva cuenta
            </button>
          </div>
        </div>

        {/* KPIs — 4 pills compactos */}
        <div className="flex flex-wrap gap-2 mt-3">
          {[
            { label: "Ingresos", val: kpiIngresos,            color: "", dot: "", style: {background:"#f0fdf4",color:"#065f46"}, dotStyle: {background:"#34d399"} },
            { label: "Egresos",  val: Math.abs(kpiEgresos),   color: "", dot: "", style: {background:"#fff1f2",color:"#9f1239"}, dotStyle: {background:"#f43f5e"} },
            { label: "Neto",     val: kpiNeto,                color: "", dot: "", style: kpiNeto >= 0 ? {background:"#f0fdf4",color:"#065f46"} : {background:"#fff1f2",color:"#9f1239"}, dotStyle: kpiNeto >= 0 ? {background:"#34d399"} : {background:"#f43f5e"} },
            { label: "Pendiente",val: kpiPendiente,            color: "", dot: "", style: {background:"#fffbeb",color:"#92400e"}, dotStyle: {background:"#fbbf24"} },
          ].map(k => (
            <div key={k.label} className="flex items-center gap-2 px-3 py-1.5 rounded-lg" style={k.style}>
              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={k.dotStyle}/>
              <span className="text-[10px] font-medium opacity-70">{k.label}</span>
              <span className="text-xs font-bold font-mono">{fmtCompact(k.val)}</span>
            </div>
          ))}
          {semanasNegativas > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 text-red-600">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>
              <span className="text-[10px] font-semibold">{semanasNegativas} sem. negativa{semanasNegativas > 1 ? "s" : ""}</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Tabs + nav meses ────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-5 py-2.5 bg-white border-b border-slate-100 flex-shrink-0">
        <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg">
          {[
            { id: "tabla",   icon: <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 6h18M3 14h18M3 18h18"/></svg>, label: "Tabla" },
            { id: "resumen", icon: <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>, label: "Resumen" },
          ].map(t => (
            <button key={t.id} onClick={() => setTabActiva(t.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                tabActiva === t.id ? "bg-white text-purple-700 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
              {t.icon}{t.label}
            </button>
          ))}
        </div>

        {tabActiva === "tabla" && (
          <div className="flex items-center gap-1 ml-auto">
            <span className="text-[10px] text-slate-400 font-medium mr-1">Ir a</span>
            {weekColumns.filter((w, i, arr) => arr.findIndex(x => x.monthIndex === w.monthIndex) === i).map(w => (
              <button key={w.monthIndex} onClick={() => scrollToMonth(w.monthIndex)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                  w.monthIndex === 1 ? "bg-purple-100 text-purple-700" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
                {w.monthLabel}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Tabla semanal ────────────────────────────────────────────────────── */}
      {tabActiva === "tabla" && (
        <div ref={tableRef} className="flex-1 overflow-auto" style={{ overflowX: "auto" }}>
          <table style={{ tableLayout: "fixed", borderCollapse: "collapse", minWidth: "100%" }}>

            {/* ── Header ── */}
            <thead className="sticky top-0 z-20">
              {/* Fila meses */}
              <tr>
                <th className="sticky left-0 z-30 bg-slate-800" style={{ minWidth: "220px", height: "22px" }}/>
                {(() => {
                  const grupos = [];
                  weekColumns.forEach(w => {
                    const last = grupos[grupos.length - 1];
                    if (!last || last.name !== w.monthName) grupos.push({ name: w.monthName, label: w.monthLabel, idx: w.monthIndex, count: 1 });
                    else last.count++;
                  });
                  return grupos.map((g, i) => (
                    <th key={i} colSpan={g.count}
                      className={`text-center border-x text-[9px] font-bold tracking-widest uppercase py-1 ${
                        g.idx === 1
                          ? "border-violet-600"
                          : "bg-slate-700 text-slate-300 border-slate-600"}`}>
                      {g.name}
                    </th>
                  ));
                })()}
                <th className="sticky right-0 z-30 bg-slate-800" style={{ minWidth: "96px" }}/>
              </tr>
              {/* Fila semanas */}
              <tr>
                <th className="sticky left-0 z-30 bg-slate-800 text-left border-r border-slate-700"
                  style={{ minWidth: "220px", height: "38px", paddingLeft: "16px" }}>
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Cuenta</span>
                </th>
                {weekColumns.map(w => (
                  <th key={w.key} style={{minWidth:"112px", textAlign:"center", borderLeft: w.isCurrentWeek ? "0.5px solid #ddd6fe" : "0.5px solid #334155", borderRight: w.isCurrentWeek ? "0.5px solid #ddd6fe" : "0.5px solid #334155", background: w.isCurrentWeek ? "#faf5ff" : "#1e293b"}}>
                    <div className="text-[11px] font-bold" style={{color: w.isCurrentWeek ? "#4c1d95" : "#e2e8f0"}}>{w.label}</div>
                    <div className={`text-[9px] font-medium ${w.isCurrentWeek ? "text-slate-500" : "text-slate-500"}`}>{w.dateRange}</div>
                  </th>
                ))}
                <th className="sticky right-0 z-30 bg-slate-800 border-l border-slate-700 text-center"
                  style={{ minWidth: "96px" }}>
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Total</span>
                </th>
              </tr>
            </thead>

            <tbody>
              {/* ────────── INGRESOS ────────── */}
              {/* Cabecera sección */}
              <tr className="cursor-pointer select-none" onClick={() => toggleCollapse("INGRESOS")}>
                <td colSpan={weekColumns.length + 2} style={{background:"#f8fafc", borderTop:"0.5px solid #e2e8f0", borderBottom:"0.5px solid #e2e8f0", paddingLeft:"16px", paddingRight:"12px", height:"30px"}}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div style={{width:"8px",height:"8px",borderRadius:"50%",background:"#10b981"}}/>
                      <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">Ingresos</span>
                      <span className="text-[10px] text-slate-400 font-medium">{ingresos.length} cuenta{ingresos.length !== 1 ? "s" : ""}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-[11px] font-mono font-semibold" style={{color:"#059669"}}>
                        {fmtCompact(weekColumns.reduce((s, w) => s + weekTotal(w.key, ingresos), 0))}
                      </span>
                      <svg className={`w-3.5 h-3.5 text-slate-400 transition-transform ${collapsed["INGRESOS"] ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/></svg>
                    </div>
                  </div>
                </td>
              </tr>

              {!collapsed["INGRESOS"] && ingresos.map(c => (
                <AccountRow key={c.id} account={c} weekColumns={weekColumns}
                  payments={payments} paymentsPaid={paymentsPaid} paymentNotas={paymentNotas}
                  onPayment={handlePayment} onTogglePaid={handleTogglePaid} onNota={handleNota}
                  onEdit={c => { setEditandoCuenta(c); setShowModalCuenta(true); }}
                  onDelete={handleDeleteCuenta} proyectoId={proyectoId}
                  draggedPayment={draggedPayment} dragOverKey={dragOverKey}
                  onDragStart={handleDragStart} onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave} onDrop={handleDrop} onDragEnd={handleDragEnd}
                  mesActualWeeks={mesActualWeeks}/>
              ))}

              {/* Subtotal ingresos */}
              {!collapsed["INGRESOS"] && (
                <tr style={{background:"rgba(240,253,244,0.7)", borderTop:"0.5px solid #d1fae5", borderBottom:"0.5px solid #d1fae5"}}>
                  <td className="sticky left-0 z-10 border-r" style={{background:"rgba(240,253,244,0.9)", borderRight:"0.5px solid #d1fae5", minWidth:"220px", height:"28px", paddingLeft:"16px"}}>
                    <span className="text-[10px] font-bold uppercase tracking-wider" style={{color:"#065f46"}}>Subtotal ingresos</span>
                  </td>
                  {weekColumns.map(w => {
                    const t = weekTotal(w.key, ingresos);
                    return (
                      <td key={w.key} style={{textAlign:"center", borderRight:"0.5px solid #d1fae5", background: w.isCurrentWeek ? "#f0fdf4" : "rgba(240,253,244,0.4)"}}>
                        {t > 0 && <span className="text-[11px] font-mono font-semibold" style={{color:"#059669"}}>{fmtCompact(t)}</span>}
                      </td>
                    );
                  })}
                  <td className="sticky right-0 text-center" style={{background:"rgba(240,253,244,0.9)", borderLeft:"0.5px solid #d1fae5"}}>
                    <span className="text-[11px] font-mono font-bold" style={{color:"#065f46"}}>
                      {fmtCompact(weekColumns.reduce((s, w) => s + weekTotal(w.key, ingresos), 0))}
                    </span>
                  </td>
                </tr>
              )}

              {/* ────────── EGRESOS ────────── */}
              <tr className="cursor-pointer select-none" onClick={() => toggleCollapse("EGRESOS")}>
                <td colSpan={weekColumns.length + 2} style={{background:"#f8fafc", borderTop:"0.5px solid #e2e8f0", borderBottom:"0.5px solid #e2e8f0", paddingLeft:"16px", paddingRight:"12px", height:"30px"}}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div style={{width:"8px",height:"8px",borderRadius:"50%",background:"#f43f5e"}}/>
                      <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">Egresos</span>
                      <span className="text-[10px] text-slate-400 font-medium">{egresos.length} cuenta{egresos.length !== 1 ? "s" : ""}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-[11px] font-mono font-semibold" style={{color:"#e11d48"}}>
                        {fmtCompact(weekColumns.reduce((s, w) => s + weekTotal(w.key, egresos), 0))}
                      </span>
                      <svg className={`w-3.5 h-3.5 text-slate-400 transition-transform ${collapsed["EGRESOS"] ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/></svg>
                    </div>
                  </div>
                </td>
              </tr>

              {!collapsed["EGRESOS"] && subcatsEgreso.map(subcat => {
                const cuentasSubcat = egresos.filter(c => c.subcategoria === subcat);
                const totSubcat = weekColumns.reduce((s, w) => s + weekTotal(w.key, cuentasSubcat), 0);
                const accent = subAccent(subcat);
                return (
                  <React.Fragment key={subcat}>
                    {/* Fila subcategoría */}
                    <tr className="cursor-pointer select-none" onClick={() => toggleCollapse("EGR-" + subcat)}>
                      <td colSpan={weekColumns.length + 2} className="border-y border-slate-100 bg-white"
                        style={{ paddingLeft: "28px", paddingRight: "12px", height: "26px", borderLeft: `3px solid ${accent}` }}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <svg className={`w-3 h-3 text-slate-300 transition-transform ${collapsed["EGR-"+subcat] ? "-rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/></svg>
                            <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: accent }}>{subcat}</span>
                            <span className="text-[9px] text-slate-400">{cuentasSubcat.length} cta{cuentasSubcat.length !== 1 ? "s." : "."}</span>
                          </div>
                          <span className="text-[10px] font-mono font-semibold mr-3" style={{color:"#f43f5e"}}>
                            {totSubcat < 0 ? fmtCLP(totSubcat) : ""}
                          </span>
                        </div>
                      </td>
                    </tr>
                    {!collapsed["EGR-" + subcat] && cuentasSubcat.map(c => (
                      <AccountRow key={c.id} account={c} weekColumns={weekColumns}
                        payments={payments} paymentsPaid={paymentsPaid} paymentNotas={paymentNotas}
                        onPayment={handlePayment} onTogglePaid={handleTogglePaid} onNota={handleNota}
                        onEdit={c => { setEditandoCuenta(c); setShowModalCuenta(true); }}
                        onDelete={handleDeleteCuenta} proyectoId={proyectoId}
                        draggedPayment={draggedPayment} dragOverKey={dragOverKey}
                        onDragStart={handleDragStart} onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave} onDrop={handleDrop} onDragEnd={handleDragEnd}/>
                    ))}
                  </React.Fragment>
                );
              })}

              {/* Egresos sin subcategoría */}
              {!collapsed["EGRESOS"] && egresos.filter(c => !c.subcategoria).map(c => (
                <AccountRow key={c.id} account={c} weekColumns={weekColumns}
                  payments={payments} paymentsPaid={paymentsPaid} paymentNotas={paymentNotas}
                  onPayment={handlePayment} onTogglePaid={handleTogglePaid} onNota={handleNota}
                  onEdit={c => { setEditandoCuenta(c); setShowModalCuenta(true); }}
                  onDelete={handleDeleteCuenta} proyectoId={proyectoId}
                  draggedPayment={draggedPayment} dragOverKey={dragOverKey}
                  onDragStart={handleDragStart} onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave} onDrop={handleDrop} onDragEnd={handleDragEnd}
                  mesActualWeeks={mesActualWeeks}/>
              ))}

              {/* Subtotal egresos */}
              {!collapsed["EGRESOS"] && (
                <tr style={{background:"rgba(255,241,242,0.7)", borderTop:"0.5px solid #ffe4e6", borderBottom:"0.5px solid #ffe4e6"}}>
                  <td className="sticky left-0 z-10 border-r" style={{background:"rgba(255,241,242,0.9)", borderRight:"0.5px solid #ffe4e6", minWidth:"220px", height:"28px", paddingLeft:"16px"}}>
                    <span className="text-[10px] font-bold uppercase tracking-wider" style={{color:"#9f1239"}}>Subtotal egresos</span>
                  </td>
                  {weekColumns.map(w => {
                    const t = weekTotal(w.key, egresos);
                    return (
                      <td key={w.key} style={{textAlign:"center", borderRight:"0.5px solid #ffe4e6", background: w.isCurrentWeek ? "#fff1f2" : "rgba(255,241,242,0.4)"}}>
                        {t < 0 && <span className="text-[11px] font-mono font-semibold" style={{color:"#e11d48"}}>{fmtCompact(t)}</span>}
                      </td>
                    );
                  })}
                  <td className="sticky right-0 text-center" style={{background:"rgba(255,241,242,0.9)", borderLeft:"0.5px solid #ffe4e6"}}>
                    <span className="text-[11px] font-mono font-bold" style={{color:"#9f1239"}}>
                      {fmtCLP(weekColumns.reduce((s, w) => s + weekTotal(w.key, egresos), 0))}
                    </span>
                  </td>
                </tr>
              )}
            </tbody>

            {/* ── Footer sticky ── */}
            <tfoot className="sticky bottom-0 z-20">
              {/* Neto semanal */}
              <tr style={{ background: "#1e293b" }}>
                <td className="sticky left-0 z-30 border-r border-slate-700"
                  style={{ background: "#1e293b", minWidth: "220px", height: "34px", paddingLeft: "16px" }}>
                  <span className="text-[10px] font-bold text-slate-300 uppercase tracking-wider">Neto semanal</span>
                </td>
                {weekColumns.map(w => {
                  const neto = weekTotal(w.key, ingresos) + weekTotal(w.key, egresos);
                  return (
                    <td key={w.key} className={`text-center border-x border-slate-700 "foot-cell"`}
                      style={{ paddingRight: "10px" }}>
                      {neto !== 0 && (
                        <span className="text-[11px] font-mono font-bold" style={{color: neto > 0 ? "#34d399" : "#f87171"}}>
                          {fmtCompact(neto)}
                        </span>
                      )}
                    </td>
                  );
                })}
                <td className="sticky right-0 z-30 border-l border-slate-700 text-right"
                  style={{ background: "#1e293b", minWidth: "96px", textAlign:"center" }}>
                  <span className="text-[11px] font-mono font-bold" style={{color: kpiNeto >= 0 ? "#34d399" : "#f87171"}}>
                    {fmtCLP(kpiNeto)}
                  </span>
                </td>
              </tr>
              {/* Acumulado */}
              <tr style={{ background: "#0f172a" }}>
                <td className="sticky left-0 z-30 border-r border-slate-800"
                  style={{ background: "#0f172a", minWidth: "220px", height: "34px", paddingLeft: "16px" }}>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Acumulado</span>
                    {saldoBanco > 0 && (
                      <span className="text-[9px] text-slate-600 font-medium">desde {fmtCompact(saldoBanco)}</span>
                    )}
                  </div>
                </td>
                {weekColumns.map(w => {
                  const ac = acumulados[w.key] || 0;
                  return (
                    <td key={w.key} className={`text-center border-x border-slate-800 "foot-cell"`}
                      style={{ paddingRight: "10px" }}>
                      <span className="text-[11px] font-mono font-bold" style={{color: ac >= 0 ? "#a78bfa" : "#f87171"}}>
                        {fmtCompact(ac)}
                      </span>
                    </td>
                  );
                })}
                <td className="sticky right-0 z-30 border-l border-slate-800 text-right"
                  style={{ background: "#0f172a", minWidth: "96px", textAlign:"center" }}>
                  <span className="text-[11px] font-mono font-bold" style={{color: (acumulados[weekColumns[weekColumns.length-1]?.key]||0) >= 0 ? "#a78bfa" : "#f87171"}}>
                    {fmtCompact(acumulados[weekColumns[weekColumns.length - 1]?.key] || 0)}
                  </span>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* ── Resumen mensual ──────────────────────────────────────────────────── */}
      {tabActiva === "resumen" && (
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {[0, 1, 2].map(mIdx => {
            const semsMes = weekColumns.filter(w => w.monthIndex === mIdx);
            if (!semsMes.length) return null;
            const mesIng  = semsMes.reduce((s, w) => s + weekTotal(w.key, ingresos), 0);
            const mesEgr  = semsMes.reduce((s, w) => s + weekTotal(w.key, egresos),  0);
            const mesNeto = mesIng + mesEgr;
            const isActual = mIdx === 1;
            return (
              <div key={mIdx} className="bg-white rounded-xl border border-slate-100 overflow-hidden shadow-sm">
                {/* Header mes */}
                <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100" style={{background: isActual ? "#f5f3ff" : "transparent"}}>
                  <div className="flex items-center gap-3">
                    {isActual && <span className="text-[10px] font-bold bg-purple-700 text-white px-2 py-0.5 rounded-full uppercase tracking-wider">Actual</span>}
                    <h2 className="text-sm font-bold" style={{color: isActual ? "#4c1d95" : "#1e293b"}}>
                      {semsMes[0].monthName} {semsMes[0].startDate.getFullYear()}
                    </h2>
                    <span className="text-xs text-slate-400 font-medium">{semsMes.length} semanas</span>
                  </div>
                  <span className="text-sm font-mono font-bold" style={{color: mesNeto >= 0 ? "#059669" : "#e11d48"}}>
                    {fmtCLP(mesNeto)}
                  </span>
                </div>
                {/* KPIs mes */}
                <div className="grid grid-cols-3 divide-x divide-slate-100 border-b border-slate-100">
                  {[
                    { label: "Ingresos", val: mesIng,              color: "#059669" },
                    { label: "Egresos",  val: Math.abs(mesEgr),    color: "#e11d48" },
                    { label: "Margen",   val: mesIng > 0 ? Math.round((mesNeto/mesIng)*100) : null, color: mesNeto >= 0 ? "#059669" : "#e11d48", suffix: "%" },
                  ].map(k => (
                    <div key={k.label} className="px-4 py-3 text-center">
                      <p className="text-sm font-mono font-bold" style={{color:k.color}}>
                        {k.val === null ? "—" : k.suffix ? `${k.val}${k.suffix}` : fmtCompact(k.val)}
                      </p>
                      <p className="text-[10px] text-slate-400 font-medium mt-0.5">{k.label}</p>
                    </div>
                  ))}
                </div>
                {/* Budget vs Real — solo mes actual y si hay cuentas con presupuesto */}
                {isActual && (() => {
                  const cuentasConBudget = egresos.filter(c => parseInput(c.presupuestoMensual || "0") > 0);
                  if (!cuentasConBudget.length) return null;
                  return (
                    <div className="border-b border-slate-100">
                      <div className="px-5 py-2.5 flex items-center gap-2" style={{background:"#f8fafc"}}>
                        <svg className="w-3 h-3 flex-shrink-0" style={{color:"#7c3aed"}} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Presupuesto vs Real</span>
                      </div>
                      <div className="px-5 py-2 space-y-2.5">
                        {cuentasConBudget.map(c => {
                          const budget = parseInput(c.presupuestoMensual || "0");
                          const gasto  = Math.abs(semsMes.reduce((s, w) => s + (payments[`${c.id}-${w.key}`] || 0), 0));
                          const pct    = budget > 0 ? Math.min((gasto / budget) * 100, 100) : 0;
                          const over   = gasto > budget;
                          const warn   = pct >= 80 && !over;
                          const barColor = over ? "#e11d48" : warn ? "#f59e0b" : "#059669";
                          return (
                            <div key={c.id}>
                              <div className="flex items-center justify-between mb-1">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[11px] font-medium text-slate-700">{c.nombre}</span>
                                  {over && <span className="text-[8px] font-bold px-1 rounded" style={{background:"#ffe4e6",color:"#e11d48"}}>EXCEDIDO</span>}
                                  {warn && <span className="text-[8px] font-bold px-1 rounded" style={{background:"#fef3c7",color:"#b45309"}}>80%</span>}
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] font-mono" style={{color:barColor}}>{fmtCompact(gasto)}</span>
                                  <span className="text-[10px] text-slate-300">/</span>
                                  <span className="text-[10px] font-mono text-slate-400">{fmtCompact(budget)}</span>
                                </div>
                              </div>
                              <div className="rounded-full overflow-hidden" style={{height:"4px",background:"#f1f5f9"}}>
                                <div className="h-full rounded-full transition-all" style={{width:`${pct}%`,background:barColor}}/>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
                {/* Compromisos futuros — solo mes siguiente */}
                {mIdx === 2 && (() => {
                  const recurrentes = [...ingresos, ...egresos].filter(c => c.recurrente && c.montoRecurrente);
                  if (!recurrentes.length) return null;
                  const totalProyectado = recurrentes.reduce((s, c) => {
                    const freq = c.frecuenciaRecurrente || "mensual";
                    const monto = Math.abs(parseInput(c.montoRecurrente));
                    const semsFuturas = semsMes.length;
                    const veces = freq === "semanal" ? semsFuturas : freq === "quincenal" ? Math.ceil(semsFuturas/2) : 1;
                    return s + monto * veces;
                  }, 0);
                  const totalEgr = recurrentes.filter(c=>c.categoria==="EGRESOS").reduce((s,c)=>{
                    const freq = c.frecuenciaRecurrente||"mensual";
                    const monto = Math.abs(parseInput(c.montoRecurrente));
                    const v = freq==="semanal"?semsMes.length:freq==="quincenal"?Math.ceil(semsMes.length/2):1;
                    return s+monto*v;
                  },0);
                  return (
                    <div className="border-b border-slate-100">
                      <div className="px-5 py-2.5 flex items-center justify-between" style={{background:"#f8fafc"}}>
                        <div className="flex items-center gap-2">
                          <svg className="w-3 h-3" style={{color:"#7c3aed"}} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
                          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Compromisos proyectados</span>
                        </div>
                        <span className="text-[11px] font-mono font-bold" style={{color:"#e11d48"}}>-{fmtCompact(totalEgr)}</span>
                      </div>
                      <div className="px-5 py-2 space-y-1.5">
                        {recurrentes.map(c => {
                          const freq = c.frecuenciaRecurrente || "mensual";
                          const monto = Math.abs(parseInput(c.montoRecurrente));
                          const veces = freq === "semanal" ? semsMes.length : freq === "quincenal" ? Math.ceil(semsMes.length/2) : 1;
                          const total = monto * veces;
                          const isEgr = c.categoria === "EGRESOS";
                          const freqLabel = freq === "semanal" ? `×${veces} sem` : freq === "quincenal" ? `×${veces} quinc` : "×1 mes";
                          return (
                            <div key={c.id} className="flex items-center justify-between py-1">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span className="text-[8px] font-bold px-1 rounded flex-shrink-0" style={{background:"#ede9fe",color:"#7c3aed"}}>↺</span>
                                <span className="text-[11px] text-slate-600 truncate">{c.nombre}</span>
                                <span className="text-[9px] text-slate-400 flex-shrink-0">{freqLabel}</span>
                              </div>
                              <span className="text-[11px] font-mono font-semibold flex-shrink-0 ml-2" style={{color: isEgr ? "#e11d48" : "#059669"}}>
                                {isEgr ? "-" : "+"}{fmtCompact(total)}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
                {/* Desglose semanas */}
                <div className="px-5 py-3 space-y-1">
                  {semsMes.map(w => {
                    const wIng  = weekTotal(w.key, ingresos);
                    const wEgr  = weekTotal(w.key, egresos);
                    const wNeto = wIng + wEgr;
                    return (
                      <div key={w.key} className="flex items-center justify-between py-1.5 px-3 rounded-lg text-xs" style={{background: w.isCurrentWeek ? "#f5f3ff" : "transparent"}}>
                        <div className="flex items-center gap-2">
                          {w.isCurrentWeek && <span style={{width:"6px",height:"6px",borderRadius:"50%",background:"#7c3aed",flexShrink:0}}/>}
                          <span className="font-bold text-slate-700">{w.label}</span>
                          <span className="text-slate-400 text-[10px]">{w.dateRange}</span>
                        </div>
                        <div className="flex items-center gap-4 font-mono">
                          {wIng > 0  && <span className="text-[11px] font-semibold" style={{color:"#059669"}}>+{fmtCompact(wIng)}</span>}
                          {wEgr < 0  && <span className="text-[11px] font-semibold" style={{color:"#e11d48"}}>{fmtCompact(wEgr)}</span>}
                          <span className="text-[11px] font-bold w-20 text-right" style={{color: wNeto >= 0 ? "#059669" : "#e11d48"}}>
                            {wNeto !== 0 ? fmtCLP(wNeto) : <span className="text-slate-300">—</span>}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modales */}
      {showModalCuenta && (
        <ModalCuenta editando={editandoCuenta} onSave={handleSaveCuenta}
          onClose={() => { setShowModalCuenta(false); setEditandoCuenta(null); }}/>
      )}
      {showModalSaldo && (
        <ModalSaldo saldo={saldoBanco} onSave={handleSaldoBanco} onClose={() => setShowModalSaldo(false)}/>
      )}
    </div>
  );
}
