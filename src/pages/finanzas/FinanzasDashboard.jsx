import React, { useState, useEffect, useMemo, useCallback } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useFinanzas, ProyectoSelector } from "./FinanzasContext";

// ─── Constantes ───────────────────────────────────────────────────────────────
const MESES_FULL = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const MESES_SHORT = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];

// ─── Utilidades ───────────────────────────────────────────────────────────────
function fmt(n)  { return "$" + Math.abs(Math.round(n || 0)).toLocaleString("es-CL"); }
function fmtM(n) {
  if (!n && n !== 0) return "$0";
  if (Math.abs(n) >= 1000000) return "$" + (n / 1000000).toFixed(1).replace(".", ",") + "M";
  return "$" + Math.round(Math.abs(n)).toLocaleString("es-CL");
}
function mesKey(fecha) {
  if (!fecha) return null;
  try {
    const d = new Date(fecha.includes("T") ? fecha : fecha + "T12:00:00");
    if (isNaN(d)) return null;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  } catch { return null; }
}
function diasRestantes(fecha) {
  if (!fecha) return null;
  return Math.ceil((new Date(fecha) - new Date()) / 86400000);
}

// ─── Mini bar chart SVG inline ────────────────────────────────────────────────
function MiniBarChart({ data, height = 110 }) {
  if (!data?.length) return <div style={{ height }} className="flex items-center justify-center text-slate-300 text-xs">Sin datos</div>;
  const maxVal = Math.max(...data.map(d => Math.max(d.ingresos || 0, d.egresos || 0)), 1);
  const W = 100 / data.length;
  return (
    <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className="w-full" style={{ height }}>
      {data.map((d, i) => {
        const ih = ((d.ingresos || 0) / maxVal) * (height - 18);
        const eh = ((d.egresos  || 0) / maxVal) * (height - 18);
        const x  = i * W;
        return (
          <g key={i}>
            <rect x={x + W*0.05} y={height-18-ih} width={W*0.42} height={Math.max(ih,0)} rx="1" fill="#7c3aed" opacity="0.85"/>
            <rect x={x + W*0.52} y={height-18-eh} width={W*0.42} height={Math.max(eh,0)} rx="1" fill="#f59e0b" opacity="0.75"/>
            <text x={x+W/2} y={height-4} textAnchor="middle" fontSize="3.8" fill="#94a3b8">{d.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

// ─── KPI Card ────────────────────────────────────────────────────────────────
function KpiCard({ icon, label, value, sub, gradient, tag, tagColor }) {
  return (
    <div className="glass-card rounded-xl p-4 sm:p-5 hover:shadow-lg transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center shadow-md text-xl`}>{icon}</div>
        {tag && <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${tagColor}`}>{tag}</span>}
      </div>
      <div className="text-xl sm:text-2xl font-black text-slate-900 break-words">{value}</div>
      <div className="text-xs sm:text-sm font-semibold text-slate-600 mt-0.5">{label}</div>
      {sub && <div className="text-[11px] text-slate-400 mt-1">{sub}</div>}
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function FinanzasDashboard() {
  const { proyectoId } = useFinanzas();
  const hoy   = new Date();
  const [mes,  setMes]  = useState(hoy.getMonth());      // 0-11
  const [anio, setAnio] = useState(hoy.getFullYear());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const keyActual  = `${anio}-${String(mes + 1).padStart(2, "0")}`;
  const anios = Array.from({ length: 5 }, (_, i) => hoy.getFullYear() - 2 + i);

  // Últimos 6 meses para el gráfico
  const ultimos6 = useMemo(() => {
    return Array.from({ length: 6 }, (_, i) => {
      const d = new Date(anio, mes - 5 + i, 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    });
  }, [mes, anio]);

  const cargar = useCallback(async () => {
    setLoading(true);
    const resultado = {
      ingresosMes: 0, egresosMes: 0,
      costosFijosMes: 0, activosTotal: 0,
      proveedoresTop: [], alertas: [],
      flujoPorMes: [],
      egresosPorFuente: { rendicion: 0, subcontrato: 0, oc: 0 },
    };

    // ── Ingresos manuales ──────────────────────────────────────────────────
    try {
      const snap = await getDocs(collection(db, "finanzas_ingresos"));
      snap.docs.forEach(d => {
        const r = d.data();
        if (proyectoId !== "todos" && r.projectId !== proyectoId) return;
        const k = mesKey(r.fecha);
        if (k === keyActual) resultado.ingresosMes += parseFloat(r.monto) || 0;
        // para gráfico
        if (ultimos6.includes(k)) {
          resultado.flujoPorMes.push({ key: k, ingresos: parseFloat(r.monto) || 0, egresos: 0 });
        }
      });
    } catch(e) {}

    // ── Rendiciones ───────────────────────────────────────────────────────
    try {
      const snap = await getDocs(collection(db, "rendiciones"));
      snap.docs.forEach(d => {
        const r = d.data();
        if (proyectoId !== "todos" && r.projectId !== proyectoId) return;
        const monto = parseFloat(r.montoAprobado) || parseFloat(r.montoSolicitado) || 0;
        const k = mesKey(r.fechaEmision || r.fechaAprobacion);
        if (k === keyActual) {
          resultado.egresosMes += monto;
          resultado.egresosPorFuente.rendicion += monto;
        }
        if (ultimos6.includes(k)) resultado.flujoPorMes.push({ key: k, ingresos: 0, egresos: monto });
        if (r.proveedor && monto > 0) resultado.proveedoresTop.push({ nombre: r.proveedor, monto, fuente: "Rendición" });
      });
    } catch(e) {}

    // ── Subcontratos ──────────────────────────────────────────────────────
    try {
      const snap = await getDocs(collection(db, "subcontratos"));
      snap.docs.forEach(d => {
        const s = d.data();
        if (proyectoId !== "todos" && s.projectId !== proyectoId) return;
        const monto = parseFloat(s.saldoPorPagarSC) || parseFloat(s.totalPagoNeto) || 0;
        const fecha = s.fechaEP || s.createdAt?.toDate?.()?.toISOString?.()?.slice(0,10) || "";
        const k = mesKey(fecha);
        if (k === keyActual) {
          resultado.egresosMes += monto;
          resultado.egresosPorFuente.subcontrato += monto;
        }
        if (ultimos6.includes(k)) resultado.flujoPorMes.push({ key: k, ingresos: 0, egresos: monto });
        if (s.razonSocialSubcontratista && monto > 0) resultado.proveedoresTop.push({ nombre: s.razonSocialSubcontratista, monto, fuente: "Subcontrato" });
      });
    } catch(e) {}

    // ── Órdenes de compra ─────────────────────────────────────────────────
    try {
      const snap = await getDocs(collection(db, "purchaseOrders"));
      snap.docs.forEach(d => {
        const o = d.data();
        if (proyectoId !== "todos" && o.projectId !== proyectoId) return;
        const monto = parseFloat(o.totalMonto) || 0;
        const k = mesKey(o.fecha);
        if (k === keyActual) {
          resultado.egresosMes += monto;
          resultado.egresosPorFuente.oc += monto;
        }
        if (ultimos6.includes(k)) resultado.flujoPorMes.push({ key: k, ingresos: 0, egresos: monto });
        if (o.proveedor && monto > 0) resultado.proveedoresTop.push({ nombre: o.proveedor, monto, fuente: "OC" });
      });
    } catch(e) {}

    // ── Costos fijos (mensualizado) ───────────────────────────────────────
    try {
      const snap = await getDocs(collection(db, "costos_fijos"));
      snap.docs.forEach(d => {
        const c = d.data();
        if (c.activo === false) return;
        const m = parseFloat(c.monto) || 0;
        let mensual = 0;
        if (c.frecuencia === "mensual")     mensual = m;
        if (c.frecuencia === "trimestral")  mensual = m / 3;
        if (c.frecuencia === "semestral")   mensual = m / 6;
        if (c.frecuencia === "anual")       mensual = m / 12;
        resultado.costosFijosMes += mensual;
        resultado.egresosMes     += mensual;
        // alertas por día de pago
        if (c.diaPago) {
          const diasPago = parseInt(c.diaPago);
          const fechaPago = new Date(anio, mes, diasPago);
          const dias = diasRestantes(fechaPago.toISOString().slice(0,10));
          if (dias !== null && dias >= 0 && dias <= 7) {
            resultado.alertas.push({
              tipo: dias <= 3 ? "danger" : "warning",
              texto: `Pago "${c.nombre}" vence en ${dias === 0 ? "hoy" : `${dias} día${dias > 1 ? "s" : ""}`}`,
              monto: mensual,
            });
          }
        }
      });
    } catch(e) {}

    // ── Activos ───────────────────────────────────────────────────────────
    try {
      const snap = await getDocs(query(collection(db, "machines"), where("empresa", "==", "MPF Ingeniería Civil")));
      snap.docs.forEach(d => {
        if (d.data().active !== false) resultado.activosTotal++;
      });
      const snapFA = await getDocs(collection(db, "finanzas_activos"));
      // alertas de vencimiento de documentos
      snapFA.docs.forEach(d => {
        const a = d.data();
        const docs = [
          { key: "vencPermisoCirculacion", label: "Permiso Circulación" },
          { key: "vencSeguro",             label: "Seguro"               },
          { key: "vencRevisionTecnica",    label: "Rev. Técnica"         },
          { key: "vencSoapCivil",          label: "SOAP"                 },
        ];
        docs.forEach(({ key, label }) => {
          const dias = diasRestantes(a[key]);
          if (dias !== null && dias <= 30) {
            resultado.alertas.push({
              tipo: dias < 0 ? "danger" : dias <= 7 ? "danger" : "warning",
              texto: `${a.nombre || "Activo"} — ${label} ${dias < 0 ? `vencido hace ${Math.abs(dias)}d` : `vence en ${dias}d`}`,
              monto: null,
            });
          }
        });
      });
    } catch(e) {}

    // ── Agregar info de alertas sobre ingresos ────────────────────────────
    if (resultado.ingresosMes === 0) {
      resultado.alertas.push({ tipo: "info", texto: "Sin ingresos registrados este mes", monto: null });
    }

    // ── Consolidar flujo por mes ──────────────────────────────────────────
    const mapaFlujo = {};
    ultimos6.forEach(k => { mapaFlujo[k] = { key: k, ingresos: 0, egresos: 0 }; });
    // agregar costos fijos a cada mes
    ultimos6.forEach(k => { mapaFlujo[k].egresos += resultado.costosFijosMes; });
    resultado.flujoPorMes.forEach(({ key, ingresos, egresos }) => {
      if (mapaFlujo[key]) {
        mapaFlujo[key].ingresos += ingresos;
        mapaFlujo[key].egresos  += egresos;
      }
    });
    resultado.flujoPorMes = ultimos6.map(k => ({
      label: MESES_SHORT[parseInt(k.split("-")[1]) - 1],
      ingresos: mapaFlujo[k].ingresos,
      egresos:  mapaFlujo[k].egresos,
    }));

    // ── Top proveedores: agrupar y ordenar ────────────────────────────────
    const mapaP = {};
    resultado.proveedoresTop.forEach(({ nombre, monto }) => {
      const k = (nombre || "").trim().toUpperCase();
      if (!k) return;
      mapaP[k] = { nombre: nombre, total: (mapaP[k]?.total || 0) + monto };
    });
    resultado.proveedoresTop = Object.values(mapaP)
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);

    setData(resultado);
    setLoading(false);
  }, [keyActual, ultimos6, mes, anio, proyectoId]);

  useEffect(() => { cargar(); }, [cargar]);

  const flujoNeto = data ? data.ingresosMes - data.egresosMes : 0;
  const maxProv   = data?.proveedoresTop?.[0]?.total || 1;

  // Distribución egresos
  const totalEgrVar = data ? (data.egresosPorFuente.rendicion + data.egresosPorFuente.subcontrato + data.egresosPorFuente.oc) : 0;
  const totalEgr    = data ? data.egresosMes : 0;

  return (
    <div className="space-y-4 sm:space-y-5 p-4 sm:p-6">

      {/* Header + selector mes/año */}
      <div className="glass-card rounded-xl sm:rounded-2xl p-4 sm:p-6 animate-fadeInUp">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              Dashboard <span className="text-purple-700">Financiero</span>
            </h1>
            <p className="text-slate-500 text-xs sm:text-sm mt-0.5">Resumen ejecutivo en tiempo real</p>
          </div>

          {/* Selector mes + año */}
          <div className="flex items-center gap-2">
            <select value={mes} onChange={e => setMes(Number(e.target.value))}
              className="px-3 py-2.5 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-purple-400 text-sm font-bold bg-white text-slate-700">
              {MESES_FULL.map((m, i) => <option key={i} value={i}>{m}</option>)}
            </select>
            <select value={anio} onChange={e => setAnio(Number(e.target.value))}
              className="px-3 py-2.5 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-purple-400 text-sm font-bold bg-white text-slate-700">
              {anios.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
            <button onClick={cargar} disabled={loading}
              className="w-10 h-10 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-700 flex items-center justify-center transition-all disabled:opacity-40" title="Actualizar">
              <svg className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
            </button>
          </div>
        </div>

        {/* Pill mes actual + filtro proyecto */}
        <div className="mt-3 flex items-center flex-wrap gap-2">
          <span className="px-3 py-1 bg-purple-100 text-purple-700 text-xs font-black rounded-full">
            {MESES_FULL[mes]} {anio}
          </span>
          <ProyectoSelector />
          {loading && <span className="text-xs text-slate-400 animate-pulse">Cargando datos...</span>}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="spinner w-10 h-10 border-purple-600" />
        </div>
      ) : (
        <>
          {/* ── KPIs principales ── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <KpiCard icon="💰" label="Ingresos del mes"  value={fmtM(data.ingresosMes)}  gradient="from-purple-700 to-violet-600" sub={`${MESES_SHORT[mes]} ${anio}`} />
            <KpiCard icon="📤" label="Egresos del mes"   value={fmtM(data.egresosMes)}   gradient="from-amber-500 to-orange-600"  sub="OC + rend. + sub. + fijos" />
            <KpiCard
              icon={flujoNeto >= 0 ? "📈" : "📉"}
              label="Flujo neto"
              value={fmtM(Math.abs(flujoNeto))}
              gradient={flujoNeto >= 0 ? "from-emerald-500 to-teal-600" : "from-red-500 to-red-600"}
              tag={flujoNeto >= 0 ? "▲ Positivo" : "▼ Negativo"}
              tagColor={flujoNeto >= 0 ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}
            />
            <KpiCard icon="🔒" label="Costos fijos / mes" value={fmtM(data.costosFijosMes)} gradient="from-blue-500 to-blue-700" sub={`${((data.costosFijosMes / (data.egresosMes || 1)) * 100).toFixed(1)}% del egreso total`} />
          </div>

          {/* ── Fila 2: gráfico + alertas ── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

            {/* Gráfico flujo 6 meses */}
            <div className="glass-card rounded-xl p-4 sm:p-5 lg:col-span-2">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-black text-slate-700">Flujo de Caja — últimos 6 meses</p>
                <div className="flex gap-3 text-xs text-slate-400">
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-purple-600 inline-block opacity-85"/>Ingresos</span>
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-amber-500 inline-block opacity-75"/>Egresos</span>
                </div>
              </div>
              <MiniBarChart data={data.flujoPorMes} height={120} />
              {/* Totales bajo el gráfico */}
              <div className="flex gap-4 mt-3 pt-3 border-t border-slate-100">
                <div><p className="text-xs text-slate-400">Ing. {MESES_SHORT[mes]}</p><p className="text-base font-black text-purple-700">{fmtM(data.ingresosMes)}</p></div>
                <div><p className="text-xs text-slate-400">Egr. {MESES_SHORT[mes]}</p><p className="text-base font-black text-amber-600">{fmtM(data.egresosMes)}</p></div>
                <div><p className="text-xs text-slate-400">Neto</p><p className={`text-base font-black ${flujoNeto >= 0 ? "text-emerald-600" : "text-red-500"}`}>{flujoNeto >= 0 ? "+" : "-"}{fmtM(Math.abs(flujoNeto))}</p></div>
              </div>
            </div>

            {/* Alertas */}
            <div className="glass-card rounded-xl p-4 sm:p-5">
              <p className="text-sm font-black text-slate-700 mb-3">
                Alertas
                {data.alertas.length > 0 && <span className="ml-2 px-2 py-0.5 bg-red-100 text-red-600 text-xs font-black rounded-full">{data.alertas.length}</span>}
              </p>
              {data.alertas.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-6 text-center">
                  <span className="text-3xl mb-2">✅</span>
                  <p className="text-xs font-bold text-emerald-600">Todo en orden</p>
                  <p className="text-xs text-slate-400 mt-0.5">Sin alertas activas</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-52 overflow-y-auto">
                  {data.alertas.map((a, i) => {
                    const s = { danger: "bg-red-50 border-red-200 text-red-700", warning: "bg-amber-50 border-amber-200 text-amber-700", info: "bg-blue-50 border-blue-200 text-blue-600" }[a.tipo];
                    const ic = { danger: "⚠️", warning: "🔔", info: "ℹ️" }[a.tipo];
                    return (
                      <div key={i} className={`flex items-start gap-2 p-2.5 rounded-xl border ${s}`}>
                        <span className="text-sm flex-shrink-0 mt-0.5">{ic}</span>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold leading-snug">{a.texto}</p>
                          {a.monto && <p className="text-xs font-black mt-0.5">{fmt(a.monto)}</p>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* ── Fila 3: proveedores + distribución egresos ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

            {/* Top proveedores */}
            <div className="glass-card rounded-xl p-4 sm:p-5">
              <p className="text-sm font-black text-slate-700 mb-4">Top Proveedores del mes</p>
              {data.proveedoresTop.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-6">Sin transacciones este mes</p>
              ) : (
                <div className="space-y-3">
                  {data.proveedoresTop.map((p, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-black flex-shrink-0 ${i === 0 ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500"}`}>{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-xs font-bold text-slate-700 truncate">{p.nombre}</p>
                          <p className="text-xs font-black text-slate-900 ml-2 flex-shrink-0">{fmtM(p.total)}</p>
                        </div>
                        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full bg-gradient-to-r from-purple-600 to-violet-500 rounded-full" style={{ width: `${(p.total / maxProv) * 100}%` }} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Distribución egresos */}
            <div className="glass-card rounded-xl p-4 sm:p-5">
              <p className="text-sm font-black text-slate-700 mb-4">Distribución de Egresos</p>
              <div className="space-y-3">
                {[
                  { label: "Costos Fijos",   val: data.costosFijosMes,                  color: "from-blue-500 to-blue-600",    bg: "bg-blue-50",   text: "text-blue-700"   },
                  { label: "Rendiciones",     val: data.egresosPorFuente.rendicion,      color: "from-violet-500 to-purple-600",bg: "bg-violet-50", text: "text-violet-700" },
                  { label: "Subcontratos",    val: data.egresosPorFuente.subcontrato,    color: "from-amber-400 to-orange-500", bg: "bg-amber-50",  text: "text-amber-700"  },
                  { label: "Órdenes de Compra",val: data.egresosPorFuente.oc,            color: "from-emerald-400 to-teal-500", bg: "bg-emerald-50",text: "text-emerald-700"},
                ].map(({ label, val, color, bg, text }) => (
                  <div key={label}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold text-slate-600">{label}</span>
                      <span className={`text-xs font-black ${text}`}>{fmtM(val)} {totalEgr > 0 ? `(${((val/totalEgr)*100).toFixed(0)}%)` : ""}</span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className={`h-full bg-gradient-to-r ${color} rounded-full transition-all`} style={{ width: totalEgr > 0 ? `${(val/totalEgr)*100}%` : "0%" }} />
                    </div>
                  </div>
                ))}
                <div className="pt-2 border-t border-slate-100 flex justify-between">
                  <span className="text-xs font-black text-slate-600">Total egresos</span>
                  <span className="text-sm font-black text-slate-900">{fmtM(totalEgr)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* ── KPI activos + margen ── */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
            <KpiCard icon="🏗️" label="Activos en uso"  value={data.activosTotal}  gradient="from-slate-500 to-slate-700" sub="Máquinas MPF activas" />
            <KpiCard
              icon="📊"
              label="Margen bruto"
              value={data.ingresosMes > 0 ? ((flujoNeto / data.ingresosMes) * 100).toFixed(1) + "%" : "—"}
              gradient={flujoNeto >= 0 ? "from-emerald-500 to-teal-600" : "from-red-500 to-red-600"}
              sub={`Ing. ${fmtM(data.ingresosMes)} — Egr. ${fmtM(data.egresosMes)}`}
            />
            <KpiCard
              icon="📋"
              label="Alertas activas"
              value={data.alertas.filter(a => a.tipo !== "info").length}
              gradient={data.alertas.filter(a => a.tipo !== "info").length > 0 ? "from-red-500 to-red-600" : "from-emerald-500 to-teal-600"}
              sub={data.alertas.filter(a => a.tipo !== "info").length > 0 ? "Requieren atención" : "Sin alertas urgentes"}
            />
          </div>
        </>
      )}
    </div>
  );
}
