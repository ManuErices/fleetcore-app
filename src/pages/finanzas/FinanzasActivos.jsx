import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  collection, query, where, getDocs,
  addDoc, updateDoc, deleteDoc, doc, serverTimestamp
} from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useFinanzas, ProyectoSelector } from "./FinanzasContext";

const TIPOS = [
  { id: "maquinaria",  label: "Maquinaria",  color: "from-orange-500 to-amber-600",  badge: "bg-orange-100 text-orange-700",  dot: "bg-orange-500",  icon: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z" },
  { id: "vehiculo",    label: "Vehículo",    color: "from-blue-500 to-blue-700",      badge: "bg-blue-100 text-blue-700",      dot: "bg-blue-500",    icon: "M8 17a2 2 0 100-4 2 2 0 000 4zm8 0a2 2 0 100-4 2 2 0 000 4zM3 9l1.5-4.5A2 2 0 016.4 3h11.2a2 2 0 011.9 1.5L21 9M3 9h18M3 9l-1 6h20l-1-6" },
  { id: "herramienta", label: "Herramienta", color: "from-slate-500 to-slate-700",    badge: "bg-slate-100 text-slate-700",    dot: "bg-slate-500",   icon: "M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-1a2 2 0 10-4 0v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 00-1-1H4a2 2 0 110-4h1a1 1 0 001-1V7a1 1 0 011-1h3a1 1 0 001-1V4z" },
  { id: "otro",        label: "Otro",        color: "from-purple-500 to-violet-600",  badge: "bg-purple-100 text-purple-700",  dot: "bg-purple-500",  icon: "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" },
];
const TIPO_MAP = Object.fromEntries(TIPOS.map(t => [t.id, t]));
const OWN_LABELS = { OWNED: "Propio", RENTED: "Arrendado", LEASING: "Leasing" };
const DOCS_DEF = [
  { key: "vencPermisoCirculacion", label: "Permiso Circulación" },
  { key: "vencSeguro",             label: "Seguro"               },
  { key: "vencRevisionTecnica",    label: "Rev. Técnica"         },
  { key: "vencSoapCivil",          label: "SOAP / Civil"         },
];
const EMPTY = {
  nombre:"", tipo:"maquinaria", code:"", marca:"", modelo:"", patente:"",
  ownership:"OWNED", propietario:"", projectId:"",
  valorCompra:"", valorLibros:"", fechaCompra:"", vidaUtilAnios:"", moneda:"CLP",
  depreciacionAnual:"", vencPermisoCirculacion:"", vencSeguro:"",
  vencRevisionTecnica:"", vencSoapCivil:"", notasDoc:"", notas:"", activo:true, machineId:null,
};

function fmt(n, moneda="CLP") {
  if (!n && n!==0) return "—";
  if (moneda==="UF")  return `UF ${Number(n).toLocaleString("es-CL",{minimumFractionDigits:2})}`;
  if (moneda==="USD") return `US$${Number(n).toLocaleString("es-CL",{minimumFractionDigits:2})}`;
  return `$${Math.round(Number(n)).toLocaleString("es-CL")}`;
}
function fmtM(n) {
  if (!n) return "$0";
  if (Math.abs(n)>=1000000) return "$"+(n/1000000).toFixed(1).replace(".",","  )+"M";
  return "$"+Math.round(n).toLocaleString("es-CL");
}
function diasR(f) { if(!f) return null; return Math.ceil((new Date(f)-new Date())/86400000); }
function estadoDoc(f) {
  const d=diasR(f); if(d===null) return null;
  if(d<0) return "vencido"; if(d<=30) return "urgente"; if(d<=90) return "pronto"; return "ok";
}
function depAnual(a) {
  if(a.depreciacionAnual) return parseFloat(a.depreciacionAnual)||0;
  const v=parseFloat(a.valorCompra)||0, y=parseFloat(a.vidaUtilAnios)||0;
  return (!v||!y)?0:v/y;
}
function valorLibros(a) {
  if(a.valorLibros) return parseFloat(a.valorLibros)||0;
  const v=parseFloat(a.valorCompra)||0;
  if(!v||!a.fechaCompra) return v;
  const yrs=(new Date()-new Date(a.fechaCompra))/(365.25*86400000);
  return Math.max(0,v-depAnual(a)*yrs);
}
function tieneAlerta(a) {
  return DOCS_DEF.some(({key})=>{ const e=estadoDoc(a[key]); return e==="vencido"||e==="urgente"; });
}

function BadgeDoc({fecha,label}) {
  const e=estadoDoc(fecha); if(!e) return null;
  const d=diasR(fecha);
  const s={vencido:"bg-red-100 text-red-700",urgente:"bg-amber-100 text-amber-700",pronto:"bg-yellow-50 text-yellow-700",ok:"bg-emerald-50 text-emerald-600"}[e];
  return (
    <div className={`flex items-center justify-between px-3 py-2 rounded-xl ${s}`}>
      <span className="text-xs font-bold">{label}</span>
      <span className="text-xs font-semibold">{e==="vencido"?"Vencido":`${d}d`}{e==="ok"&&<span className="ml-1">✓</span>}</span>
    </div>
  );
}

function ModalActivo({isOpen,onClose,onSave,editando,projects}) {
  const [form,setForm]=useState(EMPTY);
  const [step,setStep]=useState(1);
  const [saving,setSaving]=useState(false);
  useEffect(()=>{ setForm(editando?{...EMPTY,...editando}:EMPTY); setStep(1); },[editando,isOpen]);
  if(!isOpen) return null;
  const set=(k,v)=>setForm(f=>({...f,[k]:v}));
  const tipo=TIPO_MAP[form.tipo]||TIPOS[0];
  const submit=async()=>{
    if(!form.nombre) return;
    setSaving(true); await onSave(form); setSaving(false); onClose();
  };
  const depEst=depAnual(form); const vlEst=valorLibros(form);
  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-auto overflow-hidden">
        <div className="bg-gradient-to-r from-purple-700 to-violet-600 p-6 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d={tipo.icon}/></svg>
              </div>
              <div>
                <h2 className="text-lg font-black">{editando?"Editar Activo":"Nuevo Activo"}</h2>
                <p className="text-white/70 text-sm">{editando?editando.nombre:"Registra un activo de la empresa"}</p>
              </div>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          </div>
          <div className="flex items-center gap-2 mt-5">
            {["Identificación","Financiero","Documentos"].map((label,i)=>{
              const s=i+1;
              return (<React.Fragment key={s}>
                <button onClick={()=>step>s?setStep(s):null} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${step===s?"bg-white text-slate-800 shadow-md":step>s?"bg-white/30 text-white":"bg-white/10 text-white/50"}`}>
                  <span className={`w-4 h-4 rounded-full flex items-center justify-center text-xs font-black ${step===s?"bg-purple-700 text-white":step>s?"bg-white/60 text-slate-700":"bg-white/20 text-white/60"}`}>{s}</span>
                  {label}
                </button>
                {s<3&&<div className={`flex-1 h-0.5 rounded ${step>s?"bg-white/50":"bg-white/20"}`}/>}
              </React.Fragment>);
            })}
          </div>
        </div>

        <div className="p-6 space-y-5">
          {step===1&&(<>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Tipo de activo</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {TIPOS.map(t=>(
                  <button key={t.id} onClick={()=>set("tipo",t.id)} className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all ${form.tipo===t.id?"border-purple-700 bg-purple-50 shadow-md":"border-slate-200 hover:border-slate-300"}`}>
                    <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${t.color} flex items-center justify-center`}><svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d={t.icon}/></svg></div>
                    <span className="text-xs font-bold text-slate-700">{t.label}</span>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1.5">Nombre <span className="text-red-500">*</span></label>
              <input value={form.nombre} onChange={e=>set("nombre",e.target.value)} placeholder="Ej: Excavadora Caterpillar 320..." className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 text-sm"/>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div><label className="block text-sm font-bold text-slate-700 mb-1.5">Código</label><input value={form.code} onChange={e=>set("code",e.target.value)} placeholder="MN-02" className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 text-sm"/></div>
              <div><label className="block text-sm font-bold text-slate-700 mb-1.5">Marca</label><input value={form.marca} onChange={e=>set("marca",e.target.value)} placeholder="Caterpillar" className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 text-sm"/></div>
              <div><label className="block text-sm font-bold text-slate-700 mb-1.5">Modelo</label><input value={form.modelo} onChange={e=>set("modelo",e.target.value)} placeholder="320" className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 text-sm"/></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block text-sm font-bold text-slate-700 mb-1.5">Patente</label><input value={form.patente} onChange={e=>set("patente",e.target.value.toUpperCase())} placeholder="TYRH70" className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 text-sm uppercase"/></div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5">Propiedad</label>
                <select value={form.ownership} onChange={e=>set("ownership",e.target.value)} className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 text-sm">
                  <option value="OWNED">Propio</option><option value="RENTED">Arrendado</option><option value="LEASING">Leasing</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block text-sm font-bold text-slate-700 mb-1.5">Propietario</label><input value={form.propietario} onChange={e=>set("propietario",e.target.value)} placeholder="Nombre propietario" className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 text-sm"/></div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5">Proyecto asignado</label>
                <select value={form.projectId} onChange={e=>set("projectId",e.target.value)} className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 text-sm">
                  <option value="">Sin proyecto</option>
                  {projects.map(p=><option key={p.id} value={p.id}>{p.name||p.nombre}</option>)}
                </select>
              </div>
            </div>
            <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border-2 border-slate-200">
              <div><p className="text-sm font-bold text-slate-700">Activo en uso</p><p className="text-xs text-slate-500 mt-0.5">Los inactivos se excluyen del valor total</p></div>
              <button onClick={()=>set("activo",!form.activo)} className={`relative w-12 h-6 rounded-full transition-colors ${form.activo?"bg-purple-600":"bg-slate-300"}`}>
                <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${form.activo?"translate-x-7":"translate-x-1"}`}/>
              </button>
            </div>
          </>)}

          {step===2&&(<>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5">Moneda</label>
                <select value={form.moneda} onChange={e=>set("moneda",e.target.value)} className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 text-sm">
                  <option value="CLP">CLP $</option><option value="UF">UF</option><option value="USD">USD</option>
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-bold text-slate-700 mb-1.5">Valor de compra</label>
                <input type="number" value={form.valorCompra} onChange={e=>set("valorCompra",e.target.value)} placeholder="0" className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 text-sm"/>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block text-sm font-bold text-slate-700 mb-1.5">Fecha de compra</label><input type="date" value={form.fechaCompra} onChange={e=>set("fechaCompra",e.target.value)} className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 text-sm"/></div>
              <div><label className="block text-sm font-bold text-slate-700 mb-1.5">Vida útil (años)</label><input type="number" min="1" max="50" value={form.vidaUtilAnios} onChange={e=>set("vidaUtilAnios",e.target.value)} placeholder="10" className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 text-sm"/></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5">Dep. anual <span className="text-xs font-normal text-slate-400">(opcional)</span></label>
                <input type="number" value={form.depreciacionAnual} onChange={e=>set("depreciacionAnual",e.target.value)} placeholder="Auto" className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 text-sm"/>
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5">Valor libros actual <span className="text-xs font-normal text-slate-400">(opcional)</span></label>
                <input type="number" value={form.valorLibros} onChange={e=>set("valorLibros",e.target.value)} placeholder="Auto" className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 text-sm"/>
              </div>
            </div>
            {form.valorCompra&&form.vidaUtilAnios&&(
              <div className="rounded-xl p-4 bg-gradient-to-br from-purple-50 to-violet-50 border border-purple-100">
                <p className="text-xs font-black text-purple-600 uppercase tracking-wider mb-2">Estimación depreciación</p>
                <div className="grid grid-cols-3 gap-3 text-sm">
                  <div><p className="text-xs text-slate-500">Dep. anual</p><p className="font-black text-slate-800">{fmt(depEst,form.moneda)}</p></div>
                  <div><p className="text-xs text-slate-500">Dep. mensual</p><p className="font-black text-slate-800">{fmt(depEst/12,form.moneda)}</p></div>
                  <div><p className="text-xs text-slate-500">Valor libros hoy</p><p className="font-black text-purple-700">{fmt(vlEst,form.moneda)}</p></div>
                </div>
              </div>
            )}
            <div><label className="block text-sm font-bold text-slate-700 mb-1.5">Notas</label><textarea value={form.notas} onChange={e=>set("notas",e.target.value)} rows={2} placeholder="Condiciones de financiamiento, garantías..." className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 text-sm resize-none"/></div>
          </>)}

          {step===3&&(<>
            <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Vencimientos de documentos</p>
            <div className="grid grid-cols-2 gap-3">
              {DOCS_DEF.map(({key,label})=>(
                <div key={key}>
                  <label className="block text-sm font-bold text-slate-700 mb-1.5">{label}</label>
                  <input type="date" value={form[key]||""} onChange={e=>set(key,e.target.value)} className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 text-sm"/>
                  {form[key]&&(()=>{const d=diasR(form[key]); if(d<0) return <p className="text-xs text-red-600 font-bold mt-1">⚠ Vencido hace {Math.abs(d)}d</p>; if(d<=30) return <p className="text-xs text-amber-600 font-bold mt-1">⚠ Vence en {d}d</p>; return <p className="text-xs text-emerald-600 font-semibold mt-1">✓ Vigente ({d}d)</p>;})()}
                </div>
              ))}
            </div>
            <div><label className="block text-sm font-bold text-slate-700 mb-1.5">Notas de documentos</label><textarea value={form.notasDoc} onChange={e=>set("notasDoc",e.target.value)} rows={2} placeholder="N° de póliza, observaciones..." className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 text-sm resize-none"/></div>
            <div className="rounded-xl p-4 bg-gradient-to-br from-purple-50 to-violet-50 border border-purple-100">
              <p className="text-xs font-black text-purple-600 uppercase tracking-wider mb-2">Resumen</p>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-slate-500">Nombre:</span><span className="font-bold text-slate-800 ml-1">{form.nombre||"—"}</span></div>
                <div><span className="text-slate-500">Tipo:</span><span className="font-bold text-slate-800 ml-1">{TIPO_MAP[form.tipo]?.label}</span></div>
                <div><span className="text-slate-500">Valor compra:</span><span className="font-bold text-slate-800 ml-1">{fmt(form.valorCompra,form.moneda)}</span></div>
                <div><span className="text-slate-500">Valor libros:</span><span className="font-bold text-purple-700 ml-1">{fmt(vlEst,form.moneda)}</span></div>
              </div>
            </div>
          </>)}
        </div>

        <div className="px-6 pb-6 flex gap-3">
          {step>1&&<button onClick={()=>setStep(s=>s-1)} className="px-5 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-sm">← Anterior</button>}
          <button onClick={onClose} className="px-5 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-sm">Cancelar</button>
          <div className="flex-1"/>
          {step<3
            ?<button onClick={()=>setStep(s=>s+1)} disabled={step===1&&!form.nombre} className="px-6 py-3 bg-gradient-to-r from-purple-700 to-violet-600 disabled:opacity-40 text-white font-bold rounded-xl text-sm">Siguiente →</button>
            :<button onClick={submit} disabled={saving||!form.nombre} className="px-6 py-3 bg-gradient-to-r from-purple-700 to-violet-600 disabled:opacity-40 text-white font-bold rounded-xl text-sm flex items-center gap-2 shadow-lg">
              {saving?<><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"/>Guardando...</>:<><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>{editando?"Guardar cambios":"Crear activo"}</>}
            </button>}
        </div>
      </div>
    </div>
  );
}

function PanelDetalle({activo,onClose,onEdit,projects}) {
  if(!activo) return null;
  const tipo=TIPO_MAP[activo.tipo]||TIPOS[3];
  const vl=valorLibros(activo); const dep=depAnual(activo);
  const proyecto=projects.find(p=>p.id===activo.projectId);
  return (
    <div className="glass-card rounded-xl overflow-hidden animate-fadeInUp">
      <div className={`bg-gradient-to-r ${tipo.color} px-6 py-4 flex items-center justify-between`}>
        <div>
          <h3 className="text-white font-black text-lg">{activo.nombre}</h3>
          <p className="text-white/70 text-sm">{activo.code&&`${activo.code} · `}{activo.marca} {activo.modelo}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onEdit} className="px-3 py-1.5 bg-white/20 hover:bg-white/30 text-white text-xs font-bold rounded-lg flex items-center gap-1">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
            Editar
          </button>
          <button onClick={onClose} className="w-7 h-7 bg-white/20 hover:bg-white/30 rounded-lg flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>
      </div>
      <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="space-y-3">
          <p className="text-xs font-black text-slate-400 uppercase tracking-wider">Identificación</p>
          {[["Tipo",TIPO_MAP[activo.tipo]?.label||"—"],["Patente",activo.patente||"—"],["Propiedad",OWN_LABELS[activo.ownership]||activo.ownership||"—"],["Propietario",activo.propietario||"—"],["Proyecto",proyecto?(proyecto.name||proyecto.nombre):"Sin proyecto"]].map(([l,v])=>(
            <div key={l}><p className="text-xs text-slate-400 font-semibold">{l}</p><p className="font-bold text-slate-800 text-sm">{v}</p></div>
          ))}
        </div>
        <div className="space-y-3">
          <p className="text-xs font-black text-slate-400 uppercase tracking-wider">Financiero</p>
          {[["Valor compra",fmt(activo.valorCompra,activo.moneda)],["Valor libros",fmt(vl,activo.moneda)],["Dep. anual",dep>0?fmt(dep,activo.moneda):"—"],["Dep. mensual",dep>0?fmt(dep/12,activo.moneda):"—"],["Vida útil",activo.vidaUtilAnios?`${activo.vidaUtilAnios} años`:"—"],["Fecha compra",activo.fechaCompra||"—"]].map(([l,v])=>(
            <div key={l}><p className="text-xs text-slate-400 font-semibold">{l}</p><p className="font-bold text-slate-800 text-sm">{v}</p></div>
          ))}
        </div>
        <div className="space-y-3">
          <p className="text-xs font-black text-slate-400 uppercase tracking-wider">Documentos</p>
          <div className="space-y-2">
            {DOCS_DEF.map(({key,label})=>(
              activo[key]
                ?<BadgeDoc key={key} fecha={activo[key]} label={label}/>
                :<div key={key} className="flex items-center justify-between px-3 py-2 rounded-xl bg-slate-50 text-slate-400 text-xs"><span className="font-bold">{label}</span><span>Sin fecha</span></div>
            ))}
          </div>
          {activo.notasDoc&&<p className="text-xs text-slate-500 bg-slate-50 rounded-xl p-3">{activo.notasDoc}</p>}
        </div>
      </div>
      {activo.notas&&<div className="px-6 pb-5"><p className="text-xs text-slate-400 font-semibold uppercase mb-1">Notas</p><p className="text-slate-600 text-sm bg-slate-50 rounded-xl p-3">{activo.notas}</p></div>}
    </div>
  );
}

export default function FinanzasActivos() {
  const { proyectoId } = useFinanzas();
  const [activos,setActivos]=useState([]);
  const [projects,setProjects]=useState([]);
  const [loading,setLoading]=useState(true);
  const [showModal,setShowModal]=useState(false);
  const [editando,setEditando]=useState(null);
  const [detalle,setDetalle]=useState(null);
  const [deletingId,setDeletingId]=useState(null);
  const [filtroTipo,setFiltroTipo]=useState("todos");
  const [filtroEstado,setFiltroEstado]=useState("activos");
  const [filtroDoc,setFiltroDoc]=useState("todos");
  const [busqueda,setBusqueda]=useState("");
  const [sortCol,setSortCol]=useState("nombre");
  const [sortDir,setSortDir]=useState("asc");

  const cargar=useCallback(async()=>{
    setLoading(true);
    try {
      const snapM=await getDocs(query(collection(db,"machines"),where("empresa","==","MPF Ingeniería Civil")));
      const maquinas=snapM.docs.map(d=>({
        id:d.id,machineId:d.id,_source:"machines",
        nombre:d.data().name||"",
        tipo:["camion","camión","vehículo","vehiculo"].some(k=>(d.data().type||"").toLowerCase().includes(k))?"vehiculo":"maquinaria",
        code:d.data().code||"",marca:d.data().marca||"",modelo:d.data().modelo||"",
        patente:d.data().patente||"",ownership:d.data().ownership||"OWNED",
        propietario:d.data().propietario||"",projectId:d.data().projectId||"",
        activo:d.data().active!==false,moneda:"CLP",
        valorCompra:"",valorLibros:"",fechaCompra:"",vidaUtilAnios:"",depreciacionAnual:"",
        vencPermisoCirculacion:"",vencSeguro:"",vencRevisionTecnica:"",vencSoapCivil:"",
        notasDoc:"",notas:"",
      }));
      const snapFA=await getDocs(collection(db,"finanzas_activos"));
      const financieros=snapFA.docs.map(d=>({id:d.id,_source:"finanzas_activos",...d.data()}));
      const mapaEnr={};
      financieros.forEach(fa=>{ if(fa.machineId) mapaEnr[fa.machineId]=fa; });
      const merged=maquinas.map(m=>({...m,...(mapaEnr[m.machineId]?{...mapaEnr[m.machineId],id:m.id}:{})}));
      const solos=financieros.filter(fa=>!fa.machineId);
      const todos=[...merged,...solos];
      setActivos(proyectoId!=="todos" ? todos.filter(a=>a.projectId===proyectoId) : todos);
    } catch(e){console.error(e);}
    try {
      const snapP=await getDocs(collection(db,"projects"));
      setProjects(snapP.docs.map(d=>({id:d.id,...d.data()})));
    } catch(e){}
    setLoading(false);
  },[proyectoId]);
  useEffect(()=>{cargar();},[cargar]);

  const handleSave=async(form)=>{
    const {id,_source,machineId,...data}=form;
    if(editando){
      if(editando._source==="machines"){
        const q=query(collection(db,"finanzas_activos"),where("machineId","==",editando.machineId));
        const snap=await getDocs(q);
        if(!snap.empty) await updateDoc(doc(db,"finanzas_activos",snap.docs[0].id),{...data,machineId:editando.machineId,updatedAt:serverTimestamp()});
        else await addDoc(collection(db,"finanzas_activos"),{...data,machineId:editando.machineId,createdAt:serverTimestamp()});
      } else {
        await updateDoc(doc(db,"finanzas_activos",editando.id),{...data,updatedAt:serverTimestamp()});
      }
    } else {
      await addDoc(collection(db,"finanzas_activos"),{...data,createdAt:serverTimestamp()});
    }
    setEditando(null); await cargar();
  };

  const handleEliminar=async(a)=>{
    if(!window.confirm("¿Eliminar este activo?")) return;
    setDeletingId(a.id);
    if(a._source==="finanzas_activos"){
      await deleteDoc(doc(db,"finanzas_activos",a.id));
    } else {
      const q=query(collection(db,"finanzas_activos"),where("machineId","==",a.machineId));
      const snap=await getDocs(q);
      if(!snap.empty) await deleteDoc(doc(db,"finanzas_activos",snap.docs[0].id));
    }
    setDeletingId(null); if(detalle?.id===a.id) setDetalle(null); await cargar();
  };

  const handleSort=(col)=>{ if(sortCol===col) setSortDir(d=>d==="asc"?"desc":"asc"); else{setSortCol(col);setSortDir("asc");} };

  const activosFiltrados=useMemo(()=>{
    const f=activos.filter(a=>{
      if(filtroEstado==="activos"&&!a.activo) return false;
      if(filtroEstado==="inactivos"&&a.activo) return false;
      if(filtroTipo!=="todos"&&a.tipo!==filtroTipo) return false;
      if(filtroDoc==="alertas"&&!tieneAlerta(a)) return false;
      if(busqueda){const b=busqueda.toLowerCase();return(a.nombre||"").toLowerCase().includes(b)||(a.code||"").toLowerCase().includes(b)||(a.patente||"").toLowerCase().includes(b)||(a.marca||"").toLowerCase().includes(b);}
      return true;
    });
    return [...f].sort((a,b)=>{
      const map={nombre:[(a.nombre||"").toLowerCase(),(b.nombre||"").toLowerCase()],tipo:[a.tipo||"",b.tipo||""],valor:[valorLibros(a),valorLibros(b)],dep:[depAnual(a),depAnual(b)]};
      const [va,vb]=map[sortCol]||["",""];
      if(va<vb) return sortDir==="asc"?-1:1; if(va>vb) return sortDir==="asc"?1:-1; return 0;
    });
  },[activos,filtroEstado,filtroTipo,filtroDoc,busqueda,sortCol,sortDir]);

  const activosActivos=useMemo(()=>activos.filter(a=>a.activo),[activos]);
  const valorTotal=useMemo(()=>activosActivos.reduce((s,a)=>s+valorLibros(a),0),[activosActivos]);
  const depTotal=useMemo(()=>activosActivos.reduce((s,a)=>s+depAnual(a),0),[activosActivos]);
  const conAlertas=useMemo(()=>activosActivos.filter(tieneAlerta).length,[activosActivos]);

  const SortIcon=({col})=>{
    if(sortCol!==col) return <svg className="w-3 h-3 text-white/30 ml-1 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4"/></svg>;
    return sortDir==="asc"
      ?<svg className="w-3 h-3 text-white ml-1 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7"/></svg>
      :<svg className="w-3 h-3 text-white ml-1 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/></svg>;
  };

  if(loading) return <div className="flex items-center justify-center h-64"><div className="spinner w-10 h-10 border-purple-600"/></div>;

  return (
    <div className="space-y-4 sm:space-y-6 p-4 sm:p-6">
      {/* Header */}
      <div className="glass-card rounded-xl sm:rounded-2xl p-4 sm:p-6 animate-fadeInUp">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br from-purple-700 to-violet-600 flex items-center justify-center shadow-lg flex-shrink-0">
              <svg className="w-5 h-5 sm:w-6 sm:h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/></svg>
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">Activos <span className="text-purple-700">MPF</span></h1>
              <p className="text-slate-500 text-xs sm:text-sm mt-0.5">Maquinaria, vehículos y equipos — valorización y documentos</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ProyectoSelector />
            <button onClick={()=>{setEditando(null);setShowModal(true);}} className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-purple-700 to-violet-600 text-white text-sm font-bold rounded-xl hover:from-purple-600 hover:to-violet-500 transition-all shadow-md">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/></svg>
              Nuevo Activo
            </button>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {[
          {icon:"🏗️",label:"Activos en uso",value:activosActivos.length,sub:`${activos.filter(a=>!a.activo).length} inactivos`,gradient:"from-purple-700 to-violet-600"},
          {icon:"💰",label:"Valor Libros Total",value:fmtM(valorTotal),sub:"Suma activos activos",gradient:"from-violet-600 to-purple-500"},
          {icon:"📉",label:"Dep. Anual Total",value:fmtM(depTotal),sub:`${fmtM(depTotal/12)}/mes`,gradient:"from-purple-600 to-violet-500"},
          {icon:"⚠️",label:"Doc. con alerta",value:conAlertas,sub:conAlertas>0?"Revisar urgente":"Todo al día",gradient:conAlertas>0?"from-red-500 to-red-600":"from-emerald-500 to-teal-600"},
        ].map((k,i)=>(
          <div key={i} className="glass-card rounded-xl p-4 sm:p-5 hover:shadow-lg transition-shadow">
            <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${k.gradient} flex items-center justify-center shadow-md text-xl mb-3`}>{k.icon}</div>
            <div className="text-xl sm:text-2xl font-black text-slate-900 break-words">{k.value}</div>
            <div className="text-xs sm:text-sm font-semibold text-slate-600 mt-0.5">{k.label}</div>
            <div className="text-[11px] text-slate-400 mt-1">{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <svg className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
          <input value={busqueda} onChange={e=>setBusqueda(e.target.value)} placeholder="Buscar por nombre, código, patente..." className="w-full pl-10 pr-4 py-2.5 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-purple-400 text-sm bg-white"/>
        </div>
        <div className="flex gap-1 bg-white rounded-xl border-2 border-slate-200 p-1">
          {[["todos","Todos"],["activos","Activos"],["inactivos","Inactivos"]].map(([v,l])=>(
            <button key={v} onClick={()=>setFiltroEstado(v)} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${filtroEstado===v?"bg-purple-700 text-white shadow":"text-slate-500 hover:text-slate-700"}`}>{l}</button>
          ))}
        </div>
        <select value={filtroTipo} onChange={e=>setFiltroTipo(e.target.value)} className="px-4 py-2.5 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-purple-400 text-sm bg-white font-semibold text-slate-700">
          <option value="todos">Todos los tipos</option>
          {TIPOS.map(t=><option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
        <div className="flex gap-1 bg-white rounded-xl border-2 border-slate-200 p-1">
          {[["todos","Todos"],["alertas","⚠ Alertas"]].map(([v,l])=>(
            <button key={v} onClick={()=>setFiltroDoc(v)} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${filtroDoc===v?(v==="alertas"?"bg-amber-500 text-white shadow":"bg-purple-700 text-white shadow"):"text-slate-500 hover:text-slate-700"}`}>{l}</button>
          ))}
        </div>
      </div>

      {/* Tabla */}
      <div className="glass-card rounded-xl overflow-hidden">
        {activosFiltrados.length===0?(
          <div className="py-16 text-center">
            <div className="w-14 h-14 bg-purple-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-purple-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/></svg>
            </div>
            <p className="font-bold text-slate-600">No hay activos registrados</p>
            <p className="text-sm text-slate-400 mt-1">{busqueda||filtroTipo!=="todos"?"Ajusta los filtros":"Haz click en 'Nuevo Activo' para comenzar"}</p>
          </div>
        ):(
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gradient-to-r from-purple-700 to-violet-600 text-white">
                <tr>
                  {[{col:"nombre",label:"Activo",align:"text-left",cls:"px-5 py-4"},{col:"tipo",label:"Tipo",align:"text-left",cls:"px-4 py-4"},{col:"valor",label:"Valor libros",align:"text-right",cls:"px-4 py-4"},{col:"dep",label:"Dep. anual",align:"text-right",cls:"px-4 py-4 hidden md:table-cell"}].map(({col,label,align,cls})=>(
                    <th key={col} onClick={()=>handleSort(col)} className={`${cls} ${align} text-xs font-black uppercase tracking-wider cursor-pointer hover:bg-white/10 select-none transition-colors`}>{label}<SortIcon col={col}/></th>
                  ))}
                  <th className="px-4 py-4 text-center text-xs font-black uppercase tracking-wider hidden lg:table-cell">Documentos</th>
                  <th className="px-4 py-4 text-center text-xs font-black uppercase tracking-wider hidden sm:table-cell">Propiedad</th>
                  <th className="px-4 py-4 text-center text-xs font-black uppercase tracking-wider">Estado</th>
                  <th className="px-4 py-4 text-center text-xs font-black uppercase tracking-wider">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {activosFiltrados.map((a,idx)=>{
                  const tipo=TIPO_MAP[a.tipo]||TIPOS[3];
                  const vl=valorLibros(a); const dep=depAnual(a); const alerta=tieneAlerta(a);
                  const esMachine=a._source==="machines";
                  return (
                    <tr key={a.id} onClick={()=>setDetalle(detalle?.id===a.id?null:a)} className={`cursor-pointer hover:bg-purple-50/40 transition-colors ${idx%2===0?"bg-white":"bg-slate-50/30"} ${!a.activo?"opacity-60":""}`}>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${tipo.color} flex items-center justify-center flex-shrink-0`}>
                            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d={tipo.icon}/></svg>
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <p className="font-bold text-slate-900 text-sm">{a.nombre}</p>
                              {esMachine&&<span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-bold">FleetCore</span>}
                            </div>
                            <p className="text-xs text-slate-400">{[a.code,a.patente].filter(Boolean).join(" · ")||(a.marca&&`${a.marca} ${a.modelo||""}`)}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4"><span className={`px-2.5 py-1 rounded-lg text-xs font-bold ${tipo.badge}`}>{tipo.label}</span></td>
                      <td className="px-4 py-4 text-right">{vl>0?<span className="text-sm font-bold text-slate-800">{fmt(vl,a.moneda)}</span>:<span className="text-xs text-slate-300">—</span>}</td>
                      <td className="px-4 py-4 text-right hidden md:table-cell">{dep>0?<span className="text-sm text-slate-500">{fmt(dep,a.moneda)}/año</span>:<span className="text-xs text-slate-300">—</span>}</td>
                      <td className="px-4 py-4 text-center hidden lg:table-cell">
                        {alerta?<span className="inline-flex items-center gap-1 bg-red-100 text-red-700 text-xs font-bold px-2.5 py-1 rounded-full">⚠ Vence pronto</span>:<span className="text-emerald-500 text-xs font-semibold">✓ Al día</span>}
                      </td>
                      <td className="px-4 py-4 text-center hidden sm:table-cell">
                        <span className={`text-xs font-bold px-2.5 py-1 rounded-lg ${a.ownership==="OWNED"?"bg-purple-100 text-purple-700":a.ownership==="RENTED"?"bg-amber-100 text-amber-700":"bg-blue-100 text-blue-700"}`}>{OWN_LABELS[a.ownership]||a.ownership||"—"}</span>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${a.activo?"bg-purple-100 text-purple-700":"bg-slate-100 text-slate-500"}`}>
                          <div className={`w-1.5 h-1.5 rounded-full ${a.activo?"bg-purple-600":"bg-slate-400"}`}/>
                          {a.activo?"Activo":"Inactivo"}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-center" onClick={e=>e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-1.5">
                          <button onClick={()=>{setEditando(a);setShowModal(true);}} className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-purple-100 hover:text-purple-700 text-slate-500 flex items-center justify-center transition-all" title="Editar">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                          </button>
                          {!esMachine&&(
                            <button onClick={()=>handleEliminar(a)} disabled={deletingId===a.id} className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-red-100 hover:text-red-600 text-slate-500 flex items-center justify-center transition-all disabled:opacity-50" title="Eliminar">
                              {deletingId===a.id?<div className="w-3.5 h-3.5 border-2 border-slate-400 border-t-transparent rounded-full animate-spin"/>:<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="px-5 py-4 bg-gradient-to-r from-purple-700 to-violet-600 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
              <span className="text-xs font-semibold text-white/70">{activosFiltrados.length} activos mostrados</span>
              <div className="text-right">
                <p className="text-xs text-white/60">Valor libros total (filtro)</p>
                <p className="text-lg font-black text-white">{fmtM(activosFiltrados.filter(a=>a.activo).reduce((s,a)=>s+valorLibros(a),0))}</p>
              </div>
            </div>
          </div>
        )}
      </div>

      <PanelDetalle activo={detalle} onClose={()=>setDetalle(null)} onEdit={()=>{setEditando(detalle);setShowModal(true);setDetalle(null);}} projects={projects}/>

      <ModalActivo isOpen={showModal} onClose={()=>{setShowModal(false);setEditando(null);}} onSave={handleSave} editando={editando} projects={projects}/>
    </div>
  );
}
