import React, { useState, useMemo } from "react";
import { useContabilidad, TIPOS_CUENTA, TIPOS_MAP, PeriodoSelector, fmt, fmtM, MESES } from "./ContabilidadContext";
import { ModalExportEstados } from "./ContabilidadExportPDF";

// ─── Paleta corporativa ───────────────────────────────────────────────────────
const C = {
  navy:    "#0f2744",
  blue:    "#1a56a0",
  teal:    "#0d7d6b",
  amber:   "#b45309",
  slate:   "#334155",
  light:   "#f8fafc",
  border:  "#e2e8f0",
};

// ─── Encabezado corporativo ───────────────────────────────────────────────────
function ReportHeader({ titulo, subtitulo, norma, periodo }) {
  const [anio, mes] = periodo ? periodo.split("-") : ["",""];
  const mesLabel = mes ? MESES[parseInt(mes)-1] : "";
  return (
    <div className="rounded-2xl overflow-hidden mb-1" style={{ background: C.navy }}>
      <div className="flex items-center justify-between px-6 py-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center text-base"
              style={{ background: "rgba(255,255,255,0.12)" }}>📊</div>
            <span className="text-white/50 text-xs font-bold uppercase tracking-[2px]">FleetCore Contabilidad</span>
          </div>
          <h2 className="text-white font-black text-xl tracking-tight">{titulo}</h2>
          <p className="text-blue-300 text-xs mt-0.5">{subtitulo}</p>
        </div>
        <div className="text-right">
          <div className="text-white font-black text-lg">{mesLabel} {anio}</div>
          <div className="text-blue-300 text-xs mt-0.5">{norma}</div>
          <div className="text-white/40 text-[10px] mt-1">Generado: {new Date().toLocaleDateString("es-CL")}</div>
        </div>
      </div>
    </div>
  );
}

// ─── Fila de tabla financiera ─────────────────────────────────────────────────
function Fila({ label, valor, nivel = 0, negrita = false, separador = false,
                total = false, colorValor = null, signo = 1, ocultar = false }) {
  if (ocultar) return null;
  if (separador) return (
    <tr><td colSpan={2} style={{ height: nivel === 0 ? "1px" : "8px", background: nivel === 0 ? C.border : "transparent", padding: 0 }} /></tr>
  );

  const valorFmt = valor !== undefined && valor !== null ? fmt(Math.abs(valor)) : "—";
  const negativo = valor < 0;

  const bgStyle = total
    ? { background: C.navy, color: "white" }
    : negrita ? { background: C.light } : {};

  return (
    <tr style={bgStyle} className={!total && !negrita ? "hover:bg-slate-50/80" : ""}>
      <td style={{
        padding: `${total ? 10 : negrita ? 8 : 6}px 16px`,
        paddingLeft: `${16 + nivel * 20}px`,
        fontSize: total ? "12px" : "12px",
        fontWeight: total || negrita ? 800 : 500,
        color: total ? "white" : negrita ? C.slate : "#475569",
        textTransform: total ? "uppercase" : "none",
        letterSpacing: total ? "0.05em" : "normal",
        borderBottom: `1px solid ${C.border}`,
      }}>
        {label}
      </td>
      <td style={{
        padding: `${total ? 10 : negrita ? 8 : 6}px 20px`,
        textAlign: "right",
        fontFamily: "monospace",
        fontSize: "12px",
        fontWeight: total || negrita ? 800 : 600,
        color: total ? "white"
             : colorValor ? undefined
             : negativo ? "#dc2626" : C.slate,
        borderBottom: `1px solid ${C.border}`,
      }}
        className={colorValor || ""}>
        {negativo && valor !== 0 && !total ? <span style={{ color: "#dc2626" }}>({valorFmt})</span>
          : valorFmt}
      </td>
    </tr>
  );
}

// ─── Sección con título ───────────────────────────────────────────────────────
function SeccionTitulo({ label, color = C.blue }) {
  return (
    <tr>
      <td colSpan={2} style={{
        padding: "6px 16px",
        fontSize: "10px",
        fontWeight: 800,
        letterSpacing: "1.5px",
        textTransform: "uppercase",
        color: "white",
        background: color,
        borderBottom: `2px solid ${color}`,
      }}>{label}</td>
    </tr>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({ label, valor, sub, color, bg, icon }) {
  return (
    <div className="rounded-2xl p-4 flex flex-col" style={{ background: bg, border: `1.5px solid ${color}20` }}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-black uppercase tracking-wider" style={{ color, opacity: 0.7 }}>{label}</span>
        <span className="text-lg">{icon}</span>
      </div>
      <p className="text-xl font-black tabular-nums" style={{ color }}>{valor}</p>
      {sub && <p className="text-[10px] mt-1" style={{ color, opacity: 0.6 }}>{sub}</p>}
    </div>
  );
}

// ─── Balance 8 Columnas ───────────────────────────────────────────────────────
function Balance8Col({ cuentas, saldosMap, periodo }) {
  const filas = useMemo(() => cuentas
    .filter(c => c.activa !== false)
    .map(c => {
      const s = saldosMap[c.id] || { debe: 0, haber: 0 };
      const tipo = TIPOS_MAP[c.tipo];
      const sDeudor   = s.debe > s.haber ? s.debe - s.haber : 0;
      const sAcreedor = s.haber > s.debe ? s.haber - s.debe : 0;
      const esActivo  = ["ACTIVO","TRIBUTARIO"].includes(tipo?.grupo);
      const esPasivo  = ["PASIVO","PATRIMONIO"].includes(tipo?.grupo);
      const esRes     = tipo?.grupo === "RESULTADO";
      const esIngreso = tipo?.id === "ingreso";
      return {
        ...c, s, sDeudor, sAcreedor, tipo,
        esfActivo:  esActivo ? sDeudor   : 0,
        esfPasivo:  esPasivo ? sAcreedor : 0,
        erpLoss:    (esRes && !esIngreso) ? sDeudor   : 0,
        erpGain:    (esRes &&  esIngreso) ? sAcreedor : 0,
      };
    }), [cuentas, saldosMap]);

  const tot = useMemo(() => ({
    debe:      filas.reduce((s,f)=>s+f.s.debe,0),
    haber:     filas.reduce((s,f)=>s+f.s.haber,0),
    sDeudor:   filas.reduce((s,f)=>s+f.sDeudor,0),
    sAcreedor: filas.reduce((s,f)=>s+f.sAcreedor,0),
    esfActivo: filas.reduce((s,f)=>s+f.esfActivo,0),
    esfPasivo: filas.reduce((s,f)=>s+f.esfPasivo,0),
    erpLoss:   filas.reduce((s,f)=>s+f.erpLoss,0),
    erpGain:   filas.reduce((s,f)=>s+f.erpGain,0),
  }), [filas]);

  const activas = filas.filter(f => f.s.debe > 0 || f.s.haber > 0);

  const thStyle = (color) => ({
    padding: "8px 10px", fontSize: "10px", fontWeight: 800,
    color, textAlign: "right", background: C.light,
    borderBottom: `2px solid ${C.border}`, whiteSpace: "nowrap",
  });

  return (
    <div>
      <ReportHeader titulo="Balance de Comprobación — 8 Columnas"
        subtitulo="Sumas · Saldos · Estado de Situación · Estado de Resultados"
        norma="NIC 1 / IFRS" periodo={periodo} />
      <div className="rounded-2xl overflow-hidden border border-slate-200">
        <div className="overflow-x-auto">
          <table style={{ width:"100%", minWidth:"860px", borderCollapse:"collapse" }}>
            <thead>
              <tr style={{ background: C.light }}>
                <th style={{ ...thStyle(C.slate), textAlign:"left", width:"90px" }}>Código</th>
                <th style={{ ...thStyle(C.slate), textAlign:"left" }}>Cuenta</th>
                <th colSpan={2} style={{ ...thStyle(C.teal), textAlign:"center", background:"#ecfdf5" }}>Sumas</th>
                <th colSpan={2} style={{ ...thStyle(C.blue), textAlign:"center", background:"#eff6ff" }}>Saldos</th>
                <th colSpan={2} style={{ ...thStyle(C.slate), textAlign:"center", background:"#f5f3ff" }}>E.S.F.</th>
                <th colSpan={2} style={{ ...thStyle(C.amber), textAlign:"center", background:"#fffbeb" }}>E.R.P.</th>
              </tr>
              <tr style={{ background: C.light, borderBottom: `2px solid ${C.border}` }}>
                <th style={{ padding:"4px 10px" }} />
                <th style={{ padding:"4px 10px" }} />
                {[
                  [C.teal,"Debe","#ecfdf5"],[C.teal,"Haber","#ecfdf5"],
                  [C.blue,"Deudor","#eff6ff"],["#ea580c","Acreedor","#eff6ff"],
                  [C.teal,"Activo","#f5f3ff"],["#dc2626","Pasivo","#f5f3ff"],
                  ["#dc2626","Pérdida","#fffbeb"],[C.teal,"Ganancia","#fffbeb"],
                ].map(([color, label, bg], i) => (
                  <th key={i} style={{ ...thStyle(color), background: bg }}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {activas.map((f,i) => (
                <tr key={f.id} style={{ background: i%2===0?"white":"#f8fafc", borderBottom:`1px solid ${C.border}` }}>
                  <td style={{ padding:"6px 10px", fontFamily:"monospace", fontSize:"11px", color:"#64748b" }}>{f.codigo}</td>
                  <td style={{ padding:"6px 10px", fontSize:"12px", fontWeight:600, color:C.slate, maxWidth:"200px" }} className="truncate">{f.nombre}</td>
                  {[
                    [f.s.debe,  C.teal],
                    [f.s.haber, "#dc2626"],
                    [f.sDeudor,   C.blue],
                    [f.sAcreedor, "#ea580c"],
                    [f.esfActivo, C.teal],
                    [f.esfPasivo, "#dc2626"],
                    [f.erpLoss,   "#dc2626"],
                    [f.erpGain,   C.teal],
                  ].map(([v, color], j) => (
                    <td key={j} style={{ padding:"6px 10px", textAlign:"right", fontFamily:"monospace", fontSize:"11px", fontWeight:600, color: v>0?color:"#cbd5e1" }}>
                      {v > 0 ? fmt(v) : ""}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ background: C.navy }}>
                <td colSpan={2} style={{ padding:"10px 16px", color:"white", fontSize:"11px", fontWeight:800, letterSpacing:"1px", textTransform:"uppercase" }}>Totales</td>
                {[tot.debe,tot.haber,tot.sDeudor,tot.sAcreedor,tot.esfActivo,tot.esfPasivo,tot.erpLoss,tot.erpGain].map((v,i)=>(
                  <td key={i} style={{ padding:"10px 10px", textAlign:"right", fontFamily:"monospace", fontSize:"11px", fontWeight:800, color:"white" }}>{fmt(v)}</td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Estado de Situación Financiera ──────────────────────────────────────────
function ESF({ cuentas, saldosMap, periodo }) {
  const data = useMemo(() => {
    const get = (tipos) => cuentas
      .filter(c => tipos.includes(c.tipo) && c.activa !== false)
      .map(c => {
        const s = saldosMap[c.id] || { debe: 0, haber: 0 };
        const tipo = TIPOS_MAP[c.tipo];
        const saldo = tipo?.signo === 1 ? s.debe - s.haber : s.haber - s.debe;
        return { ...c, saldo };
      })
      .filter(c => Math.abs(c.saldo) > 0);

    const activoC    = get(["activo_corriente","iva_credito","ppm","impuesto_diferido"]);
    const activoNC   = get(["activo_no_corriente"]);
    const pasivoC    = get(["pasivo_corriente","iva_debito"]);
    const pasivoNC   = get(["pasivo_no_corriente"]);
    const patrimonio = get(["patrimonio"]);

    // Resultado del período como componente de patrimonio
    const cuentasRes = cuentas.filter(c => ["costo","gasto_adm","gasto_fin","otro_resultado","ingreso"].includes(c.tipo) && c.activa !== false);
    const resultadoPeriodo = cuentasRes.reduce((acc, c) => {
      const s = saldosMap[c.id] || { debe: 0, haber: 0 };
      const tipo = TIPOS_MAP[c.tipo];
      return acc + (tipo?.signo === 1 ? -(s.debe - s.haber) : (s.haber - s.debe));
    }, 0);

    const totalAC  = activoC.reduce((s,c)=>s+c.saldo,0);
    const totalANC = activoNC.reduce((s,c)=>s+c.saldo,0);
    const totalPC  = pasivoC.reduce((s,c)=>s+c.saldo,0);
    const totalPNC = pasivoNC.reduce((s,c)=>s+c.saldo,0);
    const totalPat = patrimonio.reduce((s,c)=>s+c.saldo,0) + resultadoPeriodo;
    const totalA   = totalAC + totalANC;
    const totalP   = totalPC + totalPNC + totalPat;
    const diff     = Math.abs(totalA - totalP);

    return { activoC, activoNC, pasivoC, pasivoNC, patrimonio, resultadoPeriodo,
             totalAC, totalANC, totalPC, totalPNC, totalPat, totalA, totalP, diff };
  }, [cuentas, saldosMap]);

  const kpis = [
    { label:"Total Activos",    valor:fmtM(data.totalA),   sub:"Activos netos del período", color:C.teal, bg:"#ecfdf5", icon:"🏦" },
    { label:"Pasivos Totales",  valor:fmtM(data.totalPC+data.totalPNC), sub:"Obligaciones vigentes", color:"#dc2626", bg:"#fef2f2", icon:"📋" },
    { label:"Patrimonio Neto",  valor:fmtM(data.totalPat), sub:"Capital + Resultados", color:C.navy, bg:"#eff6ff", icon:"🏛️" },
    { label:"Resultado Período",valor:fmtM(data.resultadoPeriodo), sub:"Utilidad / (Pérdida)", color: data.resultadoPeriodo>=0?C.teal:"#dc2626", bg: data.resultadoPeriodo>=0?"#ecfdf5":"#fef2f2", icon: data.resultadoPeriodo>=0?"📈":"📉" },
  ];

  return (
    <div className="space-y-4">
      <ReportHeader titulo="Estado de Situación Financiera"
        subtitulo="Balance General — Posición patrimonial al cierre del período"
        norma="NIC 1 / IFRS" periodo={periodo} />

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {kpis.map(k => <KpiCard key={k.label} {...k} />)}
      </div>

      {/* Tabla en dos columnas */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Activos */}
        <div className="rounded-2xl overflow-hidden border border-slate-200">
          <table style={{ width:"100%", borderCollapse:"collapse" }}>
            <tbody>
              <SeccionTitulo label="Activos" color={C.teal} />
              <tr style={{ background:"#f0fdf4" }}>
                <td colSpan={2} style={{ padding:"6px 16px", fontSize:"10px", fontWeight:800, color:C.teal, letterSpacing:"1px", textTransform:"uppercase", borderBottom:`1px solid ${C.border}` }}>
                  Activo Corriente
                </td>
              </tr>
              {data.activoC.map(c=>(
                <tr key={c.id} className="hover:bg-slate-50">
                  <td style={{ padding:"6px 16px 6px 28px", fontSize:"12px", color:"#475569", borderBottom:`1px solid ${C.border}` }}>{c.nombre}</td>
                  <td style={{ padding:"6px 20px 6px 8px", fontSize:"12px", fontWeight:600, fontFamily:"monospace", textAlign:"right", color:C.slate, borderBottom:`1px solid ${C.border}` }}>{fmt(c.saldo)}</td>
                </tr>
              ))}
              <tr style={{ background:"#f0fdf4" }}>
                <td style={{ padding:"8px 16px", fontSize:"12px", fontWeight:800, color:C.teal, borderBottom:`2px solid ${C.teal}20` }}>Total Activo Corriente</td>
                <td style={{ padding:"8px 20px 8px 8px", fontSize:"12px", fontWeight:800, fontFamily:"monospace", textAlign:"right", color:C.teal, borderBottom:`2px solid ${C.teal}20` }}>{fmt(data.totalAC)}</td>
              </tr>
              <tr><td colSpan={2} style={{ height:"8px" }} /></tr>
              <tr style={{ background:"#f0fdf4" }}>
                <td colSpan={2} style={{ padding:"6px 16px", fontSize:"10px", fontWeight:800, color:C.teal, letterSpacing:"1px", textTransform:"uppercase", borderBottom:`1px solid ${C.border}` }}>
                  Activo No Corriente
                </td>
              </tr>
              {data.activoNC.length === 0 && (
                <tr><td colSpan={2} style={{ padding:"8px 16px", fontSize:"11px", color:"#94a3b8", fontStyle:"italic", borderBottom:`1px solid ${C.border}` }}>Sin activos no corrientes registrados</td></tr>
              )}
              {data.activoNC.map(c=>(
                <tr key={c.id} className="hover:bg-slate-50">
                  <td style={{ padding:"6px 16px 6px 28px", fontSize:"12px", color:"#475569", borderBottom:`1px solid ${C.border}` }}>{c.nombre}</td>
                  <td style={{ padding:"6px 20px 6px 8px", fontSize:"12px", fontWeight:600, fontFamily:"monospace", textAlign:"right", color:C.slate, borderBottom:`1px solid ${C.border}` }}>{fmt(c.saldo)}</td>
                </tr>
              ))}
              <tr style={{ background:"#f0fdf4" }}>
                <td style={{ padding:"8px 16px", fontSize:"12px", fontWeight:800, color:C.teal, borderBottom:`2px solid ${C.teal}20` }}>Total Activo No Corriente</td>
                <td style={{ padding:"8px 20px 8px 8px", fontSize:"12px", fontWeight:800, fontFamily:"monospace", textAlign:"right", color:C.teal, borderBottom:`2px solid ${C.teal}20` }}>{fmt(data.totalANC)}</td>
              </tr>
              <tr style={{ background: C.navy }}>
                <td style={{ padding:"12px 16px", fontSize:"12px", fontWeight:800, color:"white", textTransform:"uppercase", letterSpacing:"1px" }}>TOTAL ACTIVOS</td>
                <td style={{ padding:"12px 20px 12px 8px", fontSize:"14px", fontWeight:800, fontFamily:"monospace", textAlign:"right", color:"white" }}>{fmt(data.totalA)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Pasivos + Patrimonio */}
        <div className="rounded-2xl overflow-hidden border border-slate-200">
          <table style={{ width:"100%", borderCollapse:"collapse" }}>
            <tbody>
              <SeccionTitulo label="Pasivos y Patrimonio" color="#dc2626" />
              <tr style={{ background:"#fef2f2" }}>
                <td colSpan={2} style={{ padding:"6px 16px", fontSize:"10px", fontWeight:800, color:"#dc2626", letterSpacing:"1px", textTransform:"uppercase", borderBottom:`1px solid ${C.border}` }}>Pasivo Corriente</td>
              </tr>
              {data.pasivoC.map(c=>(
                <tr key={c.id} className="hover:bg-slate-50">
                  <td style={{ padding:"6px 16px 6px 28px", fontSize:"12px", color:"#475569", borderBottom:`1px solid ${C.border}` }}>{c.nombre}</td>
                  <td style={{ padding:"6px 20px 6px 8px", fontSize:"12px", fontWeight:600, fontFamily:"monospace", textAlign:"right", color:C.slate, borderBottom:`1px solid ${C.border}` }}>{fmt(c.saldo)}</td>
                </tr>
              ))}
              <tr style={{ background:"#fef2f2" }}>
                <td style={{ padding:"8px 16px", fontSize:"12px", fontWeight:800, color:"#dc2626", borderBottom:`2px solid #dc262620` }}>Total Pasivo Corriente</td>
                <td style={{ padding:"8px 20px 8px 8px", fontSize:"12px", fontWeight:800, fontFamily:"monospace", textAlign:"right", color:"#dc2626", borderBottom:`2px solid #dc262620` }}>{fmt(data.totalPC)}</td>
              </tr>
              <tr><td colSpan={2} style={{ height:"8px" }} /></tr>
              <tr style={{ background:"#fef2f2" }}>
                <td colSpan={2} style={{ padding:"6px 16px", fontSize:"10px", fontWeight:800, color:"#dc2626", letterSpacing:"1px", textTransform:"uppercase", borderBottom:`1px solid ${C.border}` }}>Pasivo No Corriente</td>
              </tr>
              {data.pasivoNC.length === 0 && (
                <tr><td colSpan={2} style={{ padding:"8px 16px", fontSize:"11px", color:"#94a3b8", fontStyle:"italic", borderBottom:`1px solid ${C.border}` }}>Sin pasivos no corrientes</td></tr>
              )}
              {data.pasivoNC.map(c=>(
                <tr key={c.id} className="hover:bg-slate-50">
                  <td style={{ padding:"6px 16px 6px 28px", fontSize:"12px", color:"#475569", borderBottom:`1px solid ${C.border}` }}>{c.nombre}</td>
                  <td style={{ padding:"6px 20px 6px 8px", fontSize:"12px", fontWeight:600, fontFamily:"monospace", textAlign:"right", color:C.slate, borderBottom:`1px solid ${C.border}` }}>{fmt(c.saldo)}</td>
                </tr>
              ))}
              <tr style={{ background:"#fef2f2" }}>
                <td style={{ padding:"8px 16px", fontSize:"12px", fontWeight:800, color:"#dc2626", borderBottom:`2px solid #dc262620` }}>Total Pasivo No Corriente</td>
                <td style={{ padding:"8px 20px 8px 8px", fontSize:"12px", fontWeight:800, fontFamily:"monospace", textAlign:"right", color:"#dc2626", borderBottom:`2px solid #dc262620` }}>{fmt(data.totalPNC)}</td>
              </tr>
              <tr><td colSpan={2} style={{ height:"8px" }} /></tr>
              <tr style={{ background:"#eff6ff" }}>
                <td colSpan={2} style={{ padding:"6px 16px", fontSize:"10px", fontWeight:800, color:C.blue, letterSpacing:"1px", textTransform:"uppercase", borderBottom:`1px solid ${C.border}` }}>Patrimonio</td>
              </tr>
              {data.patrimonio.map(c=>(
                <tr key={c.id} className="hover:bg-slate-50">
                  <td style={{ padding:"6px 16px 6px 28px", fontSize:"12px", color:"#475569", borderBottom:`1px solid ${C.border}` }}>{c.nombre}</td>
                  <td style={{ padding:"6px 20px 6px 8px", fontSize:"12px", fontWeight:600, fontFamily:"monospace", textAlign:"right", color:C.slate, borderBottom:`1px solid ${C.border}` }}>{fmt(c.saldo)}</td>
                </tr>
              ))}
              <tr className="hover:bg-slate-50">
                <td style={{ padding:"6px 16px 6px 28px", fontSize:"12px", color:"#475569", borderBottom:`1px solid ${C.border}` }}>
                  Resultado del Período
                </td>
                <td style={{ padding:"6px 20px 6px 8px", fontSize:"12px", fontWeight:600, fontFamily:"monospace", textAlign:"right", color: data.resultadoPeriodo>=0?C.teal:"#dc2626", borderBottom:`1px solid ${C.border}` }}>
                  {data.resultadoPeriodo < 0 ? `(${fmt(Math.abs(data.resultadoPeriodo))})` : fmt(data.resultadoPeriodo)}
                </td>
              </tr>
              <tr style={{ background:"#eff6ff" }}>
                <td style={{ padding:"8px 16px", fontSize:"12px", fontWeight:800, color:C.blue, borderBottom:`2px solid ${C.blue}20` }}>Total Patrimonio</td>
                <td style={{ padding:"8px 20px 8px 8px", fontSize:"12px", fontWeight:800, fontFamily:"monospace", textAlign:"right", color:C.blue, borderBottom:`2px solid ${C.blue}20` }}>{fmt(data.totalPat)}</td>
              </tr>
              <tr style={{ background: C.navy }}>
                <td style={{ padding:"12px 16px", fontSize:"12px", fontWeight:800, color:"white", textTransform:"uppercase", letterSpacing:"1px" }}>TOTAL PASIVOS + PAT.</td>
                <td style={{ padding:"12px 20px 12px 8px", fontSize:"14px", fontWeight:800, fontFamily:"monospace", textAlign:"right", color:"white" }}>{fmt(data.totalP)}</td>
              </tr>
            </tbody>
          </table>
          {data.diff > 1 && (
            <div className="px-4 py-2 bg-amber-50 border-t border-amber-200 flex items-center gap-2">
              <span className="text-amber-600 text-sm">⚠️</span>
              <p className="text-xs text-amber-700 font-semibold">Diferencia de {fmt(data.diff)} — registra asientos de apertura o ingresos del período</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Estado de Resultados ─────────────────────────────────────────────────────
function ERP({ cuentas, saldosMap, periodo }) {
  const data = useMemo(() => {
    const get = (tipos) => cuentas
      .filter(c => tipos.includes(c.tipo) && c.activa !== false)
      .map(c => {
        const s = saldosMap[c.id] || { debe: 0, haber: 0 };
        const tipo = TIPOS_MAP[c.tipo];
        const saldo = tipo?.signo === 1 ? s.debe - s.haber : s.haber - s.debe;
        return { ...c, saldo };
      })
      .filter(c => Math.abs(c.saldo) > 0);

    const ingresos  = get(["ingreso"]);
    const costos    = get(["costo"]);
    const gastosAdm = get(["gasto_adm"]);
    const gastosFin = get(["gasto_fin"]);
    const otrosRes  = get(["otro_resultado"]);

    const totalIng  = ingresos.reduce((s,c)=>s+c.saldo,0);
    const totalCosto= costos.reduce((s,c)=>s+c.saldo,0);
    const utilBruta = totalIng - totalCosto;
    const margenBruto = totalIng > 0 ? ((utilBruta/totalIng)*100).toFixed(1) : "—";
    const totalGAdm = gastosAdm.reduce((s,c)=>s+c.saldo,0);
    const utilOp    = utilBruta - totalGAdm;
    const margenOp  = totalIng > 0 ? ((utilOp/totalIng)*100).toFixed(1) : "—";
    const totalGFin = gastosFin.reduce((s,c)=>s+c.saldo,0);
    const totalOtros= otrosRes.reduce((s,c)=>s+c.saldo,0);
    const utilAntes = utilOp - totalGFin - totalOtros;
    const impuesto  = Math.max(0, utilAntes * 0.27);
    const utilNeta  = utilAntes - impuesto;
    const margenNeto= totalIng > 0 ? ((utilNeta/totalIng)*100).toFixed(1) : "—";

    return { ingresos, costos, gastosAdm, gastosFin, otrosRes, totalIng, totalCosto,
             utilBruta, margenBruto, totalGAdm, utilOp, margenOp,
             totalGFin, totalOtros, utilAntes, impuesto, utilNeta, margenNeto };
  }, [cuentas, saldosMap]);

  const kpis = [
    { label:"Ingresos",         valor:fmtM(data.totalIng),  sub:"Ingresos totales del período", color:C.teal, bg:"#ecfdf5", icon:"💰" },
    { label:"Utilidad Bruta",   valor:fmtM(data.utilBruta), sub:`Margen bruto: ${data.margenBruto}%`, color: data.utilBruta>=0?C.teal:"#dc2626", bg: data.utilBruta>=0?"#ecfdf5":"#fef2f2", icon:"📊" },
    { label:"Result. Operac.",  valor:fmtM(data.utilOp),    sub:`Margen oper.: ${data.margenOp}%`, color: data.utilOp>=0?C.blue:"#dc2626", bg:"#eff6ff", icon:"⚙️" },
    { label:"Result. del Período", valor:fmtM(data.utilNeta), sub:`Margen neto: ${data.margenNeto}%`, color: data.utilNeta>=0?C.teal:"#dc2626", bg: data.utilNeta>=0?"#ecfdf5":"#fef2f2", icon: data.utilNeta>=0?"📈":"📉" },
  ];

  const Row = ({ label, valor, nivel=0, negrita=false, total=false, separador=false }) => {
    if (separador) return <tr><td colSpan={2} style={{ height:"1px", background:C.border, padding:0 }} /></tr>;
    const neg = valor < 0;
    return (
      <tr style={{ background: total?C.navy:negrita?"#f8fafc":"white" }} className={!total&&!negrita?"hover:bg-slate-50/80":""}>
        <td style={{ padding:`${total?10:negrita?8:6}px 16px`, paddingLeft:`${16+nivel*20}px`,
          fontSize:"12px", fontWeight:total||negrita?800:500,
          color:total?"white":negrita?C.slate:"#475569",
          textTransform:total?"uppercase":"none", letterSpacing:total?"1px":"normal",
          borderBottom:`1px solid ${C.border}` }}>
          {label}
        </td>
        <td style={{ padding:`${total?10:negrita?8:6}px 20px ${total?10:negrita?8:6}px 8px`,
          textAlign:"right", fontFamily:"monospace", fontSize:total?"13px":"12px",
          fontWeight:total||negrita?800:600,
          color:total?"white":neg?"#dc2626":negrita?C.slate:"#475569",
          borderBottom:`1px solid ${C.border}` }}>
          {neg && !total ? `(${fmt(Math.abs(valor))})` : fmt(valor)}
        </td>
      </tr>
    );
  };

  return (
    <div className="space-y-4">
      <ReportHeader titulo="Estado de Resultados del Período"
        subtitulo="Rendimiento económico — Base devengada"
        norma="NIC 1 / IFRS — Art. 29–33 LIR" periodo={periodo} />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {kpis.map(k => <KpiCard key={k.label} {...k} />)}
      </div>

      <div className="rounded-2xl overflow-hidden border border-slate-200 max-w-2xl">
        <table style={{ width:"100%", borderCollapse:"collapse" }}>
          <tbody>
            <SeccionTitulo label="Ingresos de Actividades Ordinarias" color={C.teal} />
            {data.ingresos.length===0 && (
              <tr><td colSpan={2} style={{ padding:"8px 16px 8px 28px", fontSize:"11px", color:"#94a3b8", fontStyle:"italic", borderBottom:`1px solid ${C.border}` }}>Sin ingresos registrados en el período</td></tr>
            )}
            {data.ingresos.map(c => <Row key={c.id} label={c.nombre} valor={c.saldo} nivel={1} />)}
            <Row label="Total Ingresos" valor={data.totalIng} negrita />
            <Row separador />

            <SeccionTitulo label="Costo de Ventas" color="#7c3aed" />
            {data.costos.map(c => <Row key={c.id} label={c.nombre} valor={c.saldo} nivel={1} />)}
            <Row label="Total Costo de Ventas" valor={data.totalCosto} negrita />
            <Row separador />
            <Row label={`UTILIDAD BRUTA  ${data.margenBruto !== "—" ? `(Margen ${data.margenBruto}%)` : ""}`} valor={data.utilBruta} negrita />
            <Row separador />

            <SeccionTitulo label="Gastos de Administración y Ventas" color={C.amber} />
            {data.gastosAdm.map(c => <Row key={c.id} label={c.nombre} valor={c.saldo} nivel={1} />)}
            <Row label="Total Gastos Administración" valor={data.totalGAdm} negrita />
            <Row separador />
            <Row label={`RESULTADO OPERACIONAL  ${data.margenOp !== "—" ? `(Margen ${data.margenOp}%)` : ""}`} valor={data.utilOp} negrita />
            <Row separador />

            {(data.gastosFin.length > 0 || data.otrosRes.length > 0) && (
              <>
                <SeccionTitulo label="Gastos Financieros y Otros" color={C.slate} />
                {data.gastosFin.map(c => <Row key={c.id} label={c.nombre} valor={c.saldo} nivel={1} />)}
                {data.otrosRes.map(c => <Row key={c.id} label={c.nombre} valor={c.saldo} nivel={1} />)}
                <Row separador />
              </>
            )}

            <Row label="RESULTADO ANTES DE IMPUESTO" valor={data.utilAntes} negrita />
            <Row label="Impuesto a la Renta 1ª Categoría (27%)" valor={data.impuesto} nivel={1} />
            <Row separador />
            <Row label="RESULTADO DEL PERÍODO" valor={data.utilNeta} total />
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function ContabilidadEstados() {
  const { cuentas, saldos, periodoActivo } = useContabilidad();
  const [vistaActiva, setVistaActiva] = useState("esf");
  const [showExport, setShowExport]   = useState(false);
  const saldosMap = saldos();

  const VISTAS = [
    { id: "balance8", label: "Balance 8 col.",        icon: "📋" },
    { id: "esf",      label: "Estado de Situación",   icon: "🏦" },
    { id: "erp",      label: "Estado de Resultados",  icon: "📈" },
  ];

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div>
          <h1 className="text-xl font-black text-slate-900">Estados Financieros</h1>
          <p className="text-xs text-slate-500 mt-0.5">Calculados en tiempo real desde los asientos del período</p>
        </div>
        <div className="flex items-center gap-2 sm:ml-auto">
          <PeriodoSelector />
          <button
            onClick={() => setShowExport(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-teal-700 to-emerald-600 text-white font-bold rounded-xl text-sm shadow-md shadow-teal-200 hover:shadow-lg transition-all"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
            </svg>
            Exportar PDF
          </button>
        </div>
      </div>

      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
        {VISTAS.map(v => (
          <button key={v.id} onClick={() => setVistaActiva(v.id)}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5
              ${vistaActiva === v.id ? "bg-white shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
            style={vistaActiva === v.id ? { color: C.navy } : {}}>
            <span>{v.icon}</span>{v.label}
          </button>
        ))}
      </div>

      {vistaActiva === "balance8" && <Balance8Col cuentas={cuentas} saldosMap={saldosMap} periodo={periodoActivo} />}
      {vistaActiva === "esf"      && <ESF cuentas={cuentas} saldosMap={saldosMap} periodo={periodoActivo} />}
      {vistaActiva === "erp"      && <ERP cuentas={cuentas} saldosMap={saldosMap} periodo={periodoActivo} />}

      <ModalExportEstados
        isOpen={showExport}
        onClose={() => setShowExport(false)}
        vistaActiva={vistaActiva}
      />
    </div>
  );
}
