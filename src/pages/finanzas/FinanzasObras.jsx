import React, { useState, useEffect, useCallback, useMemo } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useEmpresa } from "../../lib/useEmpresa";

// ─── Utilidades ───────────────────────────────────────────────────────────────
const MESES_FULL  = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const MESES_SHORT = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];

function fmt(n)  { return "$" + Math.abs(Math.round(n||0)).toLocaleString("es-CL"); }
function fmtM(n) {
  if (!n && n!==0) return "$0";
  const abs = Math.abs(n);
  if (abs >= 1000000) return (n<0?"-":"") + "$" + (abs/1000000).toFixed(1).replace(".",",") + "M";
  return (n<0?"-":"") + "$" + Math.round(abs).toLocaleString("es-CL");
}
function mesKey(fecha) {
  if (!fecha) return null;
  try {
    const d = new Date(fecha.includes("T") ? fecha : fecha+"T12:00:00");
    if (isNaN(d)) return null;
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
  } catch { return null; }
}

// ─── Gráfico barras SVG ───────────────────────────────────────────────────────
function BarChart({ data, height=110 }) {
  if (!data?.length) return (
    <div style={{height}} className="flex items-center justify-center text-slate-300 text-xs">Sin datos</div>
  );
  const maxVal = Math.max(...data.map(d => Math.max(d.ingresos||0, d.egresos||0)), 1);
  const W = 100 / data.length;
  return (
    <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className="w-full" style={{height}}>
      {data.map((d,i) => {
        const ih = ((d.ingresos||0)/maxVal)*(height-18);
        const eh = ((d.egresos ||0)/maxVal)*(height-18);
        return (
          <g key={i}>
            <rect x={i*W+W*0.05} y={height-18-ih} width={W*0.42} height={Math.max(ih,0)} rx="1" fill="#7c3aed" opacity="0.85"/>
            <rect x={i*W+W*0.52} y={height-18-eh} width={W*0.42} height={Math.max(eh,0)} rx="1" fill="#f59e0b" opacity="0.75"/>
            <text x={i*W+W/2} y={height-4} textAnchor="middle" fontSize="3.8" fill="#94a3b8">{d.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({ icon, label, value, sub, gradient, tag, tagColor }) {
  return (
    <div className="glass-card rounded-xl p-4 hover:shadow-lg transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center shadow-md text-xl`}>{icon}</div>
        {tag && <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${tagColor}`}>{tag}</span>}
      </div>
      <div className="text-xl font-black text-slate-900 break-words">{value}</div>
      <div className="text-xs font-semibold text-slate-600 mt-0.5">{label}</div>
      {sub && <div className="text-[11px] text-slate-400 mt-1">{sub}</div>}
    </div>
  );
}

// ─── Panel de un proyecto ─────────────────────────────────────────────────────
function ProyectoPanel({ proyecto, datos, mes, anio }) {
  const { ingresos, egresos, egrPorFuente, proveedores, flujoPorMes } = datos;
  const neto   = ingresos - egresos;
  const margen = ingresos > 0 ? ((neto/ingresos)*100).toFixed(1) : null;
  const maxProv = proveedores[0]?.total || 1;

  return (
    <div className="glass-card rounded-xl overflow-hidden">
      {/* Header del proyecto */}
      <div className="bg-gradient-to-r from-purple-700 to-violet-600 px-5 py-4 flex items-center justify-between">
        <div>
          <h2 className="text-white font-black text-base leading-tight">
            {proyecto.name || proyecto.nombre || proyecto.id}
          </h2>
          {proyecto.code && <p className="text-purple-200 text-xs mt-0.5">{proyecto.code}</p>}
        </div>
        <div className={`px-3 py-1.5 rounded-xl text-xs font-black ${
          neto >= 0 ? "bg-emerald-400/20 text-emerald-100" : "bg-red-400/20 text-red-100"
        }`}>
          {neto >= 0 ? "▲" : "▼"} {fmtM(Math.abs(neto))} neto
        </div>
      </div>

      <div className="p-5 space-y-5">
        {/* KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KpiCard icon="💰" label="Ingresos"  value={fmtM(ingresos)} gradient="from-purple-700 to-violet-600" sub={`${MESES_SHORT[mes]} ${anio}`} />
          <KpiCard icon="📤" label="Egresos"   value={fmtM(egresos)}  gradient="from-amber-500 to-orange-600"  sub="Rend + OC + Sub" />
          <KpiCard
            icon={neto>=0?"📈":"📉"}
            label="Flujo neto"
            value={fmtM(Math.abs(neto))}
            gradient={neto>=0?"from-emerald-500 to-teal-600":"from-red-500 to-red-600"}
            tag={neto>=0?"▲":"▼"}
            tagColor={neto>=0?"bg-emerald-100 text-emerald-700":"bg-red-100 text-red-700"}
          />
          <KpiCard
            icon="📊"
            label="Margen bruto"
            value={margen !== null ? `${margen}%` : "—"}
            gradient={margen===null?"from-slate-400 to-slate-500":parseFloat(margen)>=0?"from-emerald-500 to-teal-600":"from-red-500 to-red-600"}
            sub={ingresos===0?"Sin ingresos registrados":undefined}
          />
        </div>

        {/* Gráfico + Distribución egresos */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

          {/* Evolución mensual */}
          <div className="bg-slate-50 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-black text-slate-700">Evolución 6 meses</p>
              <div className="flex gap-3 text-[10px] text-slate-400">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-purple-600 inline-block"/>Ing.</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-amber-500 inline-block"/>Egr.</span>
              </div>
            </div>
            <BarChart data={flujoPorMes} height={100} />
          </div>

          {/* Distribución egresos */}
          <div className="bg-slate-50 rounded-xl p-4">
            <p className="text-xs font-black text-slate-700 mb-3">Distribución egresos</p>
            {egresos === 0 ? (
              <p className="text-xs text-slate-400 text-center py-4">Sin egresos este período</p>
            ) : (
              <div className="space-y-2.5">
                {[
                  { label: "Rendiciones",      val: egrPorFuente.rendicion,  color: "from-violet-500 to-purple-600" },
                  { label: "Órdenes de Compra",val: egrPorFuente.oc,         color: "from-amber-400 to-orange-500"  },
                  { label: "Subcontratos",     val: egrPorFuente.subcontrato,color: "from-emerald-400 to-teal-500"  },
                ].map(({ label, val, color }) => (
                  <div key={label}>
                    <div className="flex justify-between mb-1">
                      <span className="text-[11px] font-semibold text-slate-600">{label}</span>
                      <span className="text-[11px] font-black text-slate-800">
                        {fmtM(val)} {egresos>0?`(${((val/egresos)*100).toFixed(0)}%)`:""}
                      </span>
                    </div>
                    <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                      <div className={`h-full bg-gradient-to-r ${color} rounded-full`}
                        style={{width: egresos>0?`${(val/egresos)*100}%`:"0%"}} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Top proveedores */}
        {proveedores.length > 0 && (
          <div className="bg-slate-50 rounded-xl p-4">
            <p className="text-xs font-black text-slate-700 mb-3">Top Proveedores</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {proveedores.slice(0,6).map((p,i) => (
                <div key={i} className="flex items-center gap-2.5">
                  <span className={`w-5 h-5 rounded-lg flex items-center justify-center text-[10px] font-black flex-shrink-0 ${
                    i===0?"bg-amber-100 text-amber-700":"bg-slate-100 text-slate-500"
                  }`}>{i+1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between mb-0.5">
                      <p className="text-[11px] font-bold text-slate-700 truncate">{p.nombre}</p>
                      <p className="text-[11px] font-black text-slate-900 ml-1 flex-shrink-0">{fmtM(p.total)}</p>
                    </div>
                    <div className="h-1 bg-slate-200 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-purple-600 to-violet-500 rounded-full"
                        style={{width:`${(p.total/maxProv)*100}%`}}/>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function FinanzasObras() {
  const hoy = new Date();
  const { empresaId } = useEmpresa();
  const [mes,  setMes]  = useState(hoy.getMonth());
  const [anio, setAnio] = useState(hoy.getFullYear());
  const [proyectos, setProyectos] = useState([]);
  const [rawData,   setRawData]   = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [busqueda,  setBusqueda]  = useState("");

  const keyActual = `${anio}-${String(mes+1).padStart(2,"0")}`;
  const anios = Array.from({length:5}, (_,i) => hoy.getFullYear()-2+i);

  // Últimos 6 meses para gráfico
  const ultimos6 = useMemo(() => Array.from({length:6}, (_,i) => {
    const d = new Date(anio, mes-5+i, 1);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
  }), [mes, anio]);

  const cargar = useCallback(async () => {
    if (!empresaId) { setLoading(false); return; }
    setLoading(true);
    try {
      // Proyectos
      const snapP = await getDocs(collection(db,"empresas",empresaId,"projects"));
      const listaP = snapP.docs.map(d => ({id:d.id,...d.data()}));
      setProyectos(listaP);

      // Datos financieros: acumular por projectId
      const acum = {}; // { [projectId]: { ingresos, egresos, egrPorFuente, proveedores:{}, flujo:{} } }

      const init = () => ({
        ingresos: 0, egresos: 0,
        egrPorFuente: { rendicion:0, oc:0, subcontrato:0 },
        proveedores: {},
        flujo: Object.fromEntries(ultimos6.map(k=>[k,{ingresos:0,egresos:0}])),
      });
      const get = (pid) => { if (!acum[pid]) acum[pid]=init(); return acum[pid]; };

      // Ingresos
      const snapI = await getDocs(collection(db,"empresas",empresaId,"finanzas_ingresos"));
      snapI.docs.forEach(d => {
        const r=d.data(); if(!r.projectId) return;
        const a=get(r.projectId); const k=mesKey(r.fecha);
        const m=parseFloat(r.monto)||0;
        if(k===keyActual) a.ingresos+=m;
        if(ultimos6.includes(k)) a.flujo[k].ingresos+=m;
      });

      // Rendiciones
      const snapR = await getDocs(collection(db,"empresas",empresaId,"rendiciones"));
      snapR.docs.forEach(d => {
        const r=d.data(); if(!r.projectId) return;
        const a=get(r.projectId); const k=mesKey(r.fechaEmision||r.fechaAprobacion);
        const m=parseFloat(r.montoAprobado)||parseFloat(r.montoSolicitado)||0;
        if(k===keyActual){ a.egresos+=m; a.egrPorFuente.rendicion+=m; }
        if(ultimos6.includes(k)) a.flujo[k].egresos+=m;
        if(r.proveedor&&m>0) a.proveedores[r.proveedor]=(a.proveedores[r.proveedor]||0)+m;
      });

      // Órdenes de compra
      const snapOC = await getDocs(collection(db,"empresas",empresaId,"purchaseOrders"));
      snapOC.docs.forEach(d => {
        const o=d.data(); if(!o.projectId) return;
        const a=get(o.projectId); const k=mesKey(o.fecha);
        const m=parseFloat(o.totalMonto)||0;
        if(k===keyActual){ a.egresos+=m; a.egrPorFuente.oc+=m; }
        if(ultimos6.includes(k)) a.flujo[k].egresos+=m;
        if(o.proveedor&&m>0) a.proveedores[o.proveedor]=(a.proveedores[o.proveedor]||0)+m;
      });

      // Subcontratos
      const snapS = await getDocs(collection(db,"empresas",empresaId,"subcontratos"));
      snapS.docs.forEach(d => {
        const s=d.data(); if(!s.projectId) return;
        const a=get(s.projectId);
        const fecha=s.fechaEP||s.createdAt?.toDate?.()?.toISOString?.()?.slice(0,10)||"";
        const k=mesKey(fecha); const m=parseFloat(s.saldoPorPagarSC)||parseFloat(s.totalPagoNeto)||0;
        if(k===keyActual){ a.egresos+=m; a.egrPorFuente.subcontrato+=m; }
        if(ultimos6.includes(k)) a.flujo[k].egresos+=m;
        if(s.razonSocialSubcontratista&&m>0) a.proveedores[s.razonSocialSubcontratista]=(a.proveedores[s.razonSocialSubcontratista]||0)+m;
      });

      setRawData(acum);
    } catch(e) { console.error(e); }
    finally { setLoading(false); }
  }, [empresaId, keyActual, ultimos6]);

  useEffect(() => { cargar(); }, [cargar]);

  // Proyectos con actividad o todos
  const proyectosFiltrados = useMemo(() => {
    if (!rawData) return [];
    return proyectos
      .filter(p => {
        const nombre = (p.name||p.nombre||p.id||"").toLowerCase();
        if (busqueda && !nombre.includes(busqueda.toLowerCase())) return false;
        return true;
      })
      .map(p => {
        const d = rawData[p.id] || { ingresos:0,egresos:0,egrPorFuente:{rendicion:0,oc:0,subcontrato:0},proveedores:{},flujo:{} };
        return { proyecto: p, datos: d, actividad: d.ingresos+d.egresos };
      })
      .sort((a,b) => b.actividad - a.actividad);
  }, [proyectos, rawData, busqueda]);

  // Transformar datos para renderizado
  const procesarDatos = (d) => ({
    ...d,
    proveedores: Object.entries(d.proveedores)
      .map(([nombre,total])=>({nombre,total}))
      .sort((a,b)=>b.total-a.total),
    flujoPorMes: ultimos6.map(k => ({
      label: MESES_SHORT[parseInt(k.split("-")[1])-1],
      ingresos: d.flujo[k]?.ingresos || 0,
      egresos:  d.flujo[k]?.egresos  || 0,
    })),
  });

  const sinActividad  = proyectosFiltrados.filter(p => p.actividad === 0);
  const conActividad  = proyectosFiltrados.filter(p => p.actividad > 0);

  return (
    <div className="space-y-4 sm:space-y-5 p-4 sm:p-6">

      {/* Header */}
      <div className="glass-card rounded-xl sm:rounded-2xl p-4 sm:p-6 animate-fadeInUp">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              Resumen por <span className="text-purple-700">Obra</span>
            </h1>
            <p className="text-slate-500 text-xs sm:text-sm mt-0.5">Ingresos, egresos y márgenes por proyecto</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Buscador */}
            <div className="relative">
              <svg className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0" />
              </svg>
              <input
                type="text" placeholder="Buscar obra…" value={busqueda}
                onChange={e=>setBusqueda(e.target.value)}
                className="pl-8 pr-3 py-2 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-purple-400 text-xs bg-white w-40"
              />
            </div>
            {/* Selector mes */}
            <select value={mes} onChange={e=>setMes(Number(e.target.value))}
              className="px-3 py-2 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-purple-400 text-sm font-bold bg-white text-slate-700">
              {MESES_FULL.map((m,i)=><option key={i} value={i}>{m}</option>)}
            </select>
            {/* Selector año */}
            <select value={anio} onChange={e=>setAnio(Number(e.target.value))}
              className="px-3 py-2 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-purple-400 text-sm font-bold bg-white text-slate-700">
              {anios.map(a=><option key={a} value={a}>{a}</option>)}
            </select>
            {/* Refresh */}
            <button onClick={cargar} disabled={loading}
              className="w-9 h-9 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-700 flex items-center justify-center transition-all disabled:opacity-40">
              <svg className={`w-4 h-4 ${loading?"animate-spin":""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <span className="px-3 py-1 bg-purple-100 text-purple-700 text-xs font-black rounded-full">
            {MESES_FULL[mes]} {anio}
          </span>
          {!loading && (
            <span className="px-3 py-1 bg-slate-100 text-slate-600 text-xs font-semibold rounded-full">
              {conActividad.length} obra{conActividad.length!==1?"s":""} con actividad · {proyectos.length} totales
            </span>
          )}
          {loading && <span className="text-xs text-slate-400 animate-pulse">Cargando...</span>}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="spinner w-10 h-10 border-purple-600" />
        </div>
      ) : proyectosFiltrados.length === 0 ? (
        <div className="glass-card rounded-xl p-12 flex flex-col items-center gap-3 text-center">
          <span className="text-4xl">🏗️</span>
          <p className="text-sm font-black text-slate-600">Sin proyectos</p>
          <p className="text-xs text-slate-400">No se encontraron proyectos con los filtros actuales</p>
        </div>
      ) : (
        <div className="space-y-5">

          {/* Proyectos con actividad */}
          {conActividad.length > 0 && (
            <div className="space-y-4">
              {conActividad.map(({proyecto, datos}) => (
                <ProyectoPanel
                  key={proyecto.id}
                  proyecto={proyecto}
                  datos={procesarDatos(datos)}
                  mes={mes}
                  anio={anio}
                />
              ))}
            </div>
          )}

          {/* Proyectos sin actividad — colapsados */}
          {sinActividad.length > 0 && (
            <details className="glass-card rounded-xl overflow-hidden group">
              <summary className="px-5 py-3.5 flex items-center justify-between cursor-pointer select-none hover:bg-slate-50 transition-colors">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-black text-slate-500">
                    Sin actividad en {MESES_FULL[mes]}
                  </span>
                  <span className="px-2 py-0.5 bg-slate-100 text-slate-500 text-xs font-bold rounded-full">
                    {sinActividad.length} proyecto{sinActividad.length!==1?"s":""}
                  </span>
                </div>
                <svg className="w-4 h-4 text-slate-400 transition-transform group-open:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </summary>
              <div className="px-5 pb-4 pt-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {sinActividad.map(({proyecto}) => (
                  <div key={proyecto.id} className="flex items-center gap-3 px-3 py-2.5 bg-slate-50 rounded-xl">
                    <div className="w-7 h-7 rounded-lg bg-slate-200 flex items-center justify-center flex-shrink-0">
                      <span className="text-xs text-slate-500 font-black">{(proyecto.name||proyecto.nombre||"?")[0]}</span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-600 truncate">{proyecto.name||proyecto.nombre||proyecto.id}</p>
                      {proyecto.code && <p className="text-[10px] text-slate-400">{proyecto.code}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </details>
          )}

        </div>
      )}
    </div>
  );
}
