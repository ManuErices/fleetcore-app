import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { collection, getDocs, query, where, orderBy } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useFinanzas, ProyectoSelector } from "./FinanzasContext";

// ─── Utilidades ───────────────────────────────────────────────────────────────
const fmt  = (n) => "$" + Math.round(n || 0).toLocaleString("es-CL");
const fmtM = (n) => {
  if (!n && n !== 0) return "$0";
  if (Math.abs(n) >= 1000000) return "$" + (n / 1000000).toFixed(1).replace(".", ",") + "M";
  return "$" + Math.round(n).toLocaleString("es-CL");
};
const MESES = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
const MESES_FULL = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

function mesKey(fecha) {
  if (!fecha) return null;
  const d = new Date(fecha.includes("T") ? fecha : fecha + "T12:00:00");
  if (isNaN(d)) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function parseFecha(f) {
  if (!f) return null;
  if (f?.toDate) return f.toDate();
  const d = new Date(f.includes("T") ? f : f + "T12:00:00");
  return isNaN(d) ? null : d;
}

// ─── Mini bar chart SVG ───────────────────────────────────────────────────────
function BarChart({ data, height = 120 }) {
  if (!data?.length) return null;
  const maxVal = Math.max(...data.map(d => Math.max(d.ingresos || 0, d.egresos || 0)), 1);
  const W = 100 / data.length;
  return (
    <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className="w-full" style={{ height }}>
      {data.map((d, i) => {
        const ih = ((d.ingresos || 0) / maxVal) * (height - 20);
        const eh = ((d.egresos  || 0) / maxVal) * (height - 20);
        const x  = i * W;
        return (
          <g key={i}>
            <rect x={x + W * 0.05} y={height - 20 - ih} width={W * 0.4} height={ih} rx="1" fill="#7c3aed" opacity="0.85" />
            <rect x={x + W * 0.5}  y={height - 20 - eh} width={W * 0.4} height={eh} rx="1" fill="#f59e0b" opacity="0.75" />
            <text x={x + W / 2} y={height - 4} textAnchor="middle" fontSize="4" fill="#94a3b8">{d.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

// ─── Mini line chart SVG ─────────────────────────────────────────────────────
function LineChart({ data, height = 80, color = "#7c3aed" }) {
  if (!data?.length) return null;
  const vals = data.map(d => d.value || 0);
  const maxV = Math.max(...vals, 1);
  const minV = Math.min(...vals.filter(v => v > 0), 0);
  const range = maxV - minV || 1;
  const pts = vals.map((v, i) => {
    const x = (i / (vals.length - 1 || 1)) * 90 + 5;
    const y = height - 15 - ((v - minV) / range) * (height - 25);
    return `${x},${y}`;
  }).join(" ");
  return (
    <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className="w-full" style={{ height }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      {vals.map((v, i) => {
        const x = (i / (vals.length - 1 || 1)) * 90 + 5;
        const y = height - 15 - ((v - minV) / range) * (height - 25);
        return <circle key={i} cx={x} cy={y} r="1.5" fill={color} />;
      })}
      {data.map((d, i) => {
        const x = (i / (vals.length - 1 || 1)) * 90 + 5;
        return <text key={i} x={x} y={height - 3} textAnchor="middle" fontSize="4" fill="#94a3b8">{d.label}</text>;
      })}
    </svg>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function FinanzasReportes() {
  const { proyectoId } = useFinanzas();
  const [loading, setLoading]   = useState(true);
  const [anio, setAnio]         = useState(new Date().getFullYear());
  const [rawData, setRawData]   = useState({ ingresos: [], egresos: [], costosFijos: [], proveedores: [] });
  const [exporting, setExporting] = useState(false);
  const reportRef = useRef(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    const resultado = { ingresos: [], egresos: [], costosFijos: [], proveedores: [] };

    // 1. Ingresos manuales
    try {
      const snap = await getDocs(collection(db, "finanzas_ingresos"));
      snap.docs.forEach(d => {
        const r = { ...d.data(), id: d.id };
        if (proyectoId !== "todos" && r.projectId !== proyectoId) return;
        resultado.ingresos.push(r);
      });
    } catch (e) {}

    // 2. Egresos: rendiciones
    try {
      const snap = await getDocs(collection(db, "rendiciones"));
      snap.docs.forEach(d => {
        const r = d.data();
        if (proyectoId !== "todos" && r.projectId !== proyectoId) return;
        resultado.egresos.push({
          fuente: "rendicion", monto: parseFloat(r.montoAprobado) || 0,
          fecha: r.fechaEmision || r.fechaAprobacion || "",
          proveedor: r.proveedor || "", projectId: r.projectId || "",
        });
        if (r.proveedor) resultado.proveedores.push({ nombre: r.proveedor, monto: parseFloat(r.montoAprobado) || 0 });
      });
    } catch (e) {}

    // 3. Egresos: subcontratos
    try {
      const snap = await getDocs(collection(db, "subcontratos"));
      snap.docs.forEach(d => {
        const s = d.data();
        if (proyectoId !== "todos" && s.projectId !== proyectoId) return;
        const monto = parseFloat(s.saldoPorPagarSC) || parseFloat(s.totalPagoNeto) || 0;
        const fecha = s.fechaEP || s.createdAt?.toDate?.()?.toISOString?.()?.slice(0, 10) || "";
        resultado.egresos.push({ fuente: "subcontrato", monto, fecha, proveedor: s.razonSocialSubcontratista || "", projectId: s.projectId || "" });
        if (s.razonSocialSubcontratista) resultado.proveedores.push({ nombre: s.razonSocialSubcontratista, monto });
      });
    } catch (e) {}

    // 4. Egresos: órdenes de compra
    try {
      const snap = await getDocs(collection(db, "purchaseOrders"));
      snap.docs.forEach(d => {
        const o = d.data();
        if (proyectoId !== "todos" && o.projectId !== proyectoId) return;
        const monto = parseFloat(o.totalMonto) || 0;
        resultado.egresos.push({ fuente: "oc", monto, fecha: o.fecha || "", proveedor: o.proveedor || "", projectId: o.projectId || "" });
        if (o.proveedor) resultado.proveedores.push({ nombre: o.proveedor, monto });
      });
    } catch (e) {}

    // 5. Costos fijos (globales, no filtrar por proyecto)
    try {
      const snap = await getDocs(collection(db, "costos_fijos"));
      snap.docs.forEach(d => resultado.costosFijos.push({ ...d.data(), id: d.id }));
    } catch (e) {}

    setRawData(resultado);
    setLoading(false);
  }, [proyectoId]);

  useEffect(() => { cargar(); }, [cargar]);

  // ── Datos por mes del año seleccionado ────────────────────────────────────
  const mesesData = useMemo(() => {
    return Array.from({ length: 12 }, (_, m) => {
      const key = `${anio}-${String(m + 1).padStart(2, "0")}`;
      const ing = rawData.ingresos
        .filter(i => mesKey(i.fecha) === key)
        .reduce((s, i) => s + (parseFloat(i.monto) || 0), 0);
      const egr = rawData.egresos
        .filter(e => mesKey(e.fecha) === key)
        .reduce((s, e) => s + e.monto, 0);
      // costos fijos mensualizados
      const cfMes = rawData.costosFijos
        .filter(c => c.activo !== false)
        .reduce((s, c) => {
          if (c.frecuencia === "mensual") return s + (parseFloat(c.monto) || 0);
          if (c.frecuencia === "trimestral") return s + (parseFloat(c.monto) || 0) / 3;
          if (c.frecuencia === "semestral") return s + (parseFloat(c.monto) || 0) / 6;
          if (c.frecuencia === "anual") return s + (parseFloat(c.monto) || 0) / 12;
          return s;
        }, 0);
      const totalEgr = egr + cfMes;
      return { mes: m, key, label: MESES[m], ingresos: ing, egresos: totalEgr, margen: ing - totalEgr, costosFijos: cfMes, egresosVar: egr };
    });
  }, [rawData, anio]);

  // ── Proyección próximos 6 meses ───────────────────────────────────────────
  const proyeccion = useMemo(() => {
    const hoy = new Date();
    const promIngresos = mesesData.filter(m => m.ingresos > 0).reduce((s, m) => s + m.ingresos, 0) / (mesesData.filter(m => m.ingresos > 0).length || 1);
    const promEgresos  = mesesData.filter(m => m.egresos > 0).reduce((s, m) => s + m.egresos, 0)  / (mesesData.filter(m => m.egresos > 0).length || 1);
    const cfFijo = rawData.costosFijos.filter(c => c.activo !== false).reduce((s, c) => {
      if (c.frecuencia === "mensual") return s + (parseFloat(c.monto) || 0);
      if (c.frecuencia === "trimestral") return s + (parseFloat(c.monto) || 0) / 3;
      if (c.frecuencia === "semestral") return s + (parseFloat(c.monto) || 0) / 6;
      if (c.frecuencia === "anual") return s + (parseFloat(c.monto) || 0) / 12;
      return s;
    }, 0);
    return Array.from({ length: 6 }, (_, i) => {
      const d = new Date(hoy.getFullYear(), hoy.getMonth() + i + 1, 1);
      return {
        label: MESES[d.getMonth()],
        mes: MESES_FULL[d.getMonth()] + " " + d.getFullYear(),
        ingresos: promIngresos,
        egresos: Math.max(promEgresos, cfFijo),
        costosFijos: cfFijo,
        value: promIngresos - Math.max(promEgresos, cfFijo),
      };
    });
  }, [mesesData, rawData]);

  // ── Ranking proveedores ───────────────────────────────────────────────────
  const rankingProveedores = useMemo(() => {
    const mapa = {};
    rawData.proveedores.forEach(({ nombre, monto }) => {
      const k = (nombre || "").trim().toUpperCase();
      if (!k) return;
      mapa[k] = (mapa[k] || 0) + monto;
    });
    return Object.entries(mapa)
      .map(([nombre, total]) => ({ nombre, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);
  }, [rawData]);

  // ── Costos fijos vs variables ─────────────────────────────────────────────
  const cfPorCategoria = useMemo(() => {
    const mapa = {};
    rawData.costosFijos.filter(c => c.activo !== false).forEach(c => {
      const cat = c.categoria || "otro";
      const mensual = (() => {
        const m = parseFloat(c.monto) || 0;
        if (c.frecuencia === "mensual") return m;
        if (c.frecuencia === "trimestral") return m / 3;
        if (c.frecuencia === "semestral") return m / 6;
        if (c.frecuencia === "anual") return m / 12;
        return 0;
      })();
      mapa[cat] = (mapa[cat] || 0) + mensual;
    });
    return Object.entries(mapa).sort((a, b) => b[1] - a[1]);
  }, [rawData]);

  const totalCF  = useMemo(() => cfPorCategoria.reduce((s, [, v]) => s + v, 0), [cfPorCategoria]);
  const totalVar = useMemo(() => rawData.egresos.reduce((s, e) => s + e.monto, 0), [rawData]);

  // ── Totales anuales ───────────────────────────────────────────────────────
  const totalIngresos = useMemo(() => mesesData.reduce((s, m) => s + m.ingresos, 0), [mesesData]);
  const totalEgresos  = useMemo(() => mesesData.reduce((s, m) => s + m.egresos,  0), [mesesData]);
  const margenTotal   = totalIngresos - totalEgresos;

  // ── Export PDF ────────────────────────────────────────────────────────────
  const exportPDF = async () => {
    setExporting(true);
    try {
      const el = reportRef.current;
      if (!el) return;
      // Usamos print CSS
      const style = document.createElement("style");
      style.id = "print-style";
      style.innerHTML = `
        @media print {
          body > *:not(#print-root) { display: none !important; }
          #print-root { display: block !important; position: static !important; }
          .no-print { display: none !important; }
          .glass-card { box-shadow: none !important; border: 1px solid #e2e8f0 !important; }
          @page { margin: 1.5cm; size: A4; }
        }
      `;
      document.head.appendChild(style);
      const orig = el.id;
      el.id = "print-root";
      window.print();
      el.id = orig;
      document.head.removeChild(style);
    } catch (e) { console.error(e); }
    setExporting(false);
  };

  const anios = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i);

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="spinner w-10 h-10 border-purple-600" />
    </div>
  );

  return (
    <div className="space-y-4 sm:space-y-6 p-4 sm:p-6" ref={reportRef}>

      {/* Header */}
      <div className="glass-card rounded-xl sm:rounded-2xl p-4 sm:p-6 animate-fadeInUp">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br from-purple-700 to-violet-600 flex items-center justify-center shadow-lg flex-shrink-0">
              <svg className="w-5 h-5 sm:w-6 sm:h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">Reportes <span className="text-purple-700">Financieros</span></h1>
              <p className="text-slate-500 text-xs sm:text-sm mt-0.5">Resumen ejecutivo, proyección y análisis de costos</p>
            </div>
          </div>
          <div className="flex items-center gap-3 no-print">
            <ProyectoSelector />
            <select value={anio} onChange={e => setAnio(Number(e.target.value))}
              className="px-4 py-2.5 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-purple-400 text-sm font-bold bg-white">
              {anios.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
            <button onClick={exportPDF} disabled={exporting}
              className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-purple-700 to-violet-600 text-white text-sm font-bold rounded-xl hover:from-purple-600 hover:to-violet-500 transition-all shadow-md disabled:opacity-50">
              {exporting
                ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Exportando...</>
                : <><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>Exportar PDF</>
              }
            </button>
          </div>
        </div>
      </div>

      {/* ── 1. RESUMEN EJECUTIVO ── */}
      <div className="glass-card rounded-xl p-5 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-black text-slate-900 flex items-center gap-2">
            <span className="w-6 h-6 rounded-lg bg-gradient-to-br from-purple-700 to-violet-600 flex items-center justify-center text-white text-xs font-black">1</span>
            Resumen Ejecutivo {anio}
          </h2>
          <span className="text-xs text-slate-400 font-semibold">Ingresos vs Egresos mensuales</span>
        </div>

        {/* KPIs anuales */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          {[
            { label: "Ingresos totales",  value: fmtM(totalIngresos), color: "text-purple-700",  bg: "bg-purple-50"  },
            { label: "Egresos totales",   value: fmtM(totalEgresos),  color: "text-amber-600",   bg: "bg-amber-50"   },
            { label: "Margen neto",       value: fmtM(margenTotal),   color: margenTotal >= 0 ? "text-emerald-600" : "text-red-600", bg: margenTotal >= 0 ? "bg-emerald-50" : "bg-red-50" },
            { label: "Margen %",          value: totalIngresos > 0 ? ((margenTotal / totalIngresos) * 100).toFixed(1) + "%" : "—", color: "text-slate-700", bg: "bg-slate-50" },
          ].map((k, i) => (
            <div key={i} className={`rounded-xl p-3 ${k.bg}`}>
              <p className="text-xs text-slate-500 font-semibold mb-1">{k.label}</p>
              <p className={`text-lg sm:text-xl font-black ${k.color}`}>{k.value}</p>
            </div>
          ))}
        </div>

        {/* Gráfico */}
        <div className="mb-3">
          <BarChart data={mesesData.map(m => ({ label: m.label, ingresos: m.ingresos, egresos: m.egresos }))} height={130} />
        </div>
        <div className="flex gap-4 justify-center">
          <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-purple-600 opacity-85"/><span className="text-xs text-slate-500">Ingresos</span></div>
          <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-amber-500 opacity-75"/><span className="text-xs text-slate-500">Egresos</span></div>
        </div>

        {/* Tabla mes a mes */}
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-slate-100">
                <th className="text-left py-2 text-xs font-black text-slate-500 uppercase">Mes</th>
                <th className="text-right py-2 text-xs font-black text-slate-500 uppercase">Ingresos</th>
                <th className="text-right py-2 text-xs font-black text-slate-500 uppercase">Egresos</th>
                <th className="text-right py-2 text-xs font-black text-slate-500 uppercase">Margen</th>
                <th className="text-right py-2 text-xs font-black text-slate-500 uppercase hidden sm:table-cell">%</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {mesesData.map(m => (
                <tr key={m.mes} className="hover:bg-slate-50 transition-colors">
                  <td className="py-2.5 font-semibold text-slate-700">{MESES_FULL[m.mes]}</td>
                  <td className="py-2.5 text-right font-bold text-purple-700">{m.ingresos > 0 ? fmt(m.ingresos) : <span className="text-slate-300">—</span>}</td>
                  <td className="py-2.5 text-right font-bold text-amber-600">{m.egresos > 0 ? fmt(m.egresos) : <span className="text-slate-300">—</span>}</td>
                  <td className={`py-2.5 text-right font-black ${m.margen >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                    {m.ingresos > 0 || m.egresos > 0 ? fmt(m.margen) : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="py-2.5 text-right text-slate-500 text-xs hidden sm:table-cell">
                    {m.ingresos > 0 ? ((m.margen / m.ingresos) * 100).toFixed(1) + "%" : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-slate-200">
              <tr>
                <td className="py-2.5 font-black text-slate-900">TOTAL</td>
                <td className="py-2.5 text-right font-black text-purple-700">{fmt(totalIngresos)}</td>
                <td className="py-2.5 text-right font-black text-amber-600">{fmt(totalEgresos)}</td>
                <td className={`py-2.5 text-right font-black ${margenTotal >= 0 ? "text-emerald-600" : "text-red-500"}`}>{fmt(margenTotal)}</td>
                <td className="py-2.5 text-right text-xs font-bold text-slate-500 hidden sm:table-cell">
                  {totalIngresos > 0 ? ((margenTotal / totalIngresos) * 100).toFixed(1) + "%" : "—"}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* ── 2. RANKING PROVEEDORES ── */}
      <div className="glass-card rounded-xl p-5 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-black text-slate-900 flex items-center gap-2">
            <span className="w-6 h-6 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-white text-xs font-black">2</span>
            Ranking de Proveedores
          </h2>
          <span className="text-xs text-slate-400 font-semibold">Top 10 por gasto acumulado</span>
        </div>

        {rankingProveedores.length === 0 ? (
          <p className="text-sm text-slate-400 py-8 text-center">Sin datos de proveedores</p>
        ) : (
          <div className="space-y-3">
            {rankingProveedores.map((p, i) => {
              const maxTotal = rankingProveedores[0].total || 1;
              const pct = (p.total / maxTotal) * 100;
              return (
                <div key={p.nombre} className="flex items-center gap-3">
                  <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-black flex-shrink-0 ${i === 0 ? "bg-amber-100 text-amber-700" : i === 1 ? "bg-slate-100 text-slate-600" : i === 2 ? "bg-orange-50 text-orange-600" : "bg-slate-50 text-slate-400"}`}>{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm font-bold text-slate-800 truncate">{p.nombre}</p>
                      <p className="text-sm font-black text-slate-900 ml-2 flex-shrink-0">{fmtM(p.total)}</p>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-purple-600 to-violet-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── 3. COSTOS FIJOS VS VARIABLES ── */}
      <div className="glass-card rounded-xl p-5 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-black text-slate-900 flex items-center gap-2">
            <span className="w-6 h-6 rounded-lg bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white text-xs font-black">3</span>
            Costos Fijos vs Variables
          </h2>
          <span className="text-xs text-slate-400 font-semibold">Mensualizado</span>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-5">
          <div className="rounded-xl p-4 bg-blue-50">
            <p className="text-xs font-semibold text-blue-500 mb-1">Costos Fijos / mes</p>
            <p className="text-2xl font-black text-blue-700">{fmtM(totalCF)}</p>
            <p className="text-xs text-blue-400 mt-1">{rawData.costosFijos.filter(c => c.activo !== false).length} registros activos</p>
          </div>
          <div className="rounded-xl p-4 bg-amber-50">
            <p className="text-xs font-semibold text-amber-500 mb-1">Egresos Variables</p>
            <p className="text-2xl font-black text-amber-700">{fmtM(totalVar)}</p>
            <p className="text-xs text-amber-400 mt-1">OC + rendiciones + subcontratos</p>
          </div>
        </div>

        {/* Barra proporcional */}
        {(totalCF + totalVar) > 0 && (
          <div className="mb-5">
            <div className="flex h-4 rounded-full overflow-hidden gap-0.5 mb-2">
              <div className="bg-gradient-to-r from-blue-500 to-blue-600 rounded-l-full" style={{ width: `${(totalCF / (totalCF + totalVar)) * 100}%` }} />
              <div className="bg-gradient-to-r from-amber-400 to-orange-500 rounded-r-full flex-1" />
            </div>
            <div className="flex gap-6 text-xs text-slate-500">
              <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-blue-500" /><span>Fijos {((totalCF / (totalCF + totalVar)) * 100).toFixed(1)}%</span></div>
              <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-amber-500" /><span>Variables {((totalVar / (totalCF + totalVar)) * 100).toFixed(1)}%</span></div>
            </div>
          </div>
        )}

        {/* Desglose costos fijos por categoría */}
        {cfPorCategoria.length > 0 && (
          <div>
            <p className="text-xs font-black text-slate-400 uppercase tracking-wider mb-3">Desglose costos fijos por categoría</p>
            <div className="space-y-2">
              {cfPorCategoria.map(([cat, val]) => (
                <div key={cat} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
                  <span className="text-sm font-semibold text-slate-700 capitalize">{cat}</span>
                  <div className="flex items-center gap-3">
                    <div className="w-24 h-2 bg-slate-100 rounded-full overflow-hidden hidden sm:block">
                      <div className="h-full bg-gradient-to-r from-blue-500 to-blue-400 rounded-full" style={{ width: `${(val / totalCF) * 100}%` }} />
                    </div>
                    <span className="text-sm font-black text-slate-900">{fmt(val)}/mes</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── 4. PROYECCIÓN ── */}
      <div className="glass-card rounded-xl p-5 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-black text-slate-900 flex items-center gap-2">
            <span className="w-6 h-6 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white text-xs font-black">4</span>
            Flujo de Caja Proyectado
          </h2>
          <span className="text-xs text-slate-400 font-semibold">Próximos 6 meses (promedio histórico)</span>
        </div>

        <div className="mb-4">
          <LineChart data={proyeccion.map(p => ({ label: p.label, value: p.value }))} height={100} color={proyeccion[0]?.value >= 0 ? "#10b981" : "#ef4444"} />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-slate-100">
                <th className="text-left py-2 text-xs font-black text-slate-500 uppercase">Mes</th>
                <th className="text-right py-2 text-xs font-black text-slate-500 uppercase">Ing. estimado</th>
                <th className="text-right py-2 text-xs font-black text-slate-500 uppercase">Egr. estimado</th>
                <th className="text-right py-2 text-xs font-black text-slate-500 uppercase">CF incluido</th>
                <th className="text-right py-2 text-xs font-black text-slate-500 uppercase">Saldo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {proyeccion.map((p, i) => (
                <tr key={i} className="hover:bg-slate-50 transition-colors">
                  <td className="py-2.5 font-semibold text-slate-700">{p.mes}</td>
                  <td className="py-2.5 text-right text-purple-700 font-bold">{fmtM(p.ingresos)}</td>
                  <td className="py-2.5 text-right text-amber-600 font-bold">{fmtM(p.egresos)}</td>
                  <td className="py-2.5 text-right text-blue-600 font-semibold text-xs">{fmtM(p.costosFijos)}</td>
                  <td className={`py-2.5 text-right font-black ${p.value >= 0 ? "text-emerald-600" : "text-red-500"}`}>{fmtM(p.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 p-3 bg-slate-50 rounded-xl">
          <p className="text-xs text-slate-500 leading-relaxed">
            <span className="font-bold text-slate-600">Metodología:</span> La proyección usa el promedio de meses con datos del año {anio}. Los costos fijos se incluyen íntegros en los egresos estimados. Los valores son referenciales.
          </p>
        </div>
      </div>

    </div>
  );
}
