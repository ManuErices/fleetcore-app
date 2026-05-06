import React, { useState, useMemo } from "react";
import { useContabilidad, TIPOS_CUENTA, TIPOS_MAP, PeriodoSelector, fmt, fmtM, MESES } from "./ContabilidadContext";

// ─── Utilidades ───────────────────────────────────────────────────────────────
function SectionHeader({ title, subtitle, color = "from-purple-700 to-violet-600" }) {
  return (
    <div className={`bg-gradient-to-r ${color} px-4 py-3 flex items-center justify-between`}>
      <p className="text-white font-black text-sm">{title}</p>
      {subtitle && <p className="text-white/70 text-xs">{subtitle}</p>}
    </div>
  );
}

function FilaEstado({ label, valor, nivel = 0, negrita = false, separador = false, colorValor = null }) {
  if (separador) return <tr><td colSpan={2} className="h-px bg-slate-100" /></tr>;
  return (
    <tr className={`${negrita ? "bg-slate-50" : "hover:bg-purple-50/20"}`}>
      <td className={`px-4 py-2 text-sm ${negrita ? "font-black text-slate-800" : "font-medium text-slate-600"}`}
        style={{ paddingLeft: `${16 + nivel * 20}px` }}>
        {label}
      </td>
      <td className={`px-4 py-2 text-right text-sm font-mono ${colorValor || (negrita ? "font-black text-slate-900" : "font-semibold text-slate-700")}`}>
        {valor !== null && valor !== undefined ? fmt(valor) : "—"}
      </td>
    </tr>
  );
}

// ─── Balance de 8 columnas ────────────────────────────────────────────────────
function Balance8Col({ cuentas, saldosMap }) {
  const filas = useMemo(() => {
    return cuentas
      .filter(c => c.activa !== false)
      .map(c => {
        const s = saldosMap[c.id] || { debe: 0, haber: 0 };
        const tipo = TIPOS_MAP[c.tipo];
        // Saldo deudor / acreedor
        const sDeudor  = s.debe > s.haber ? s.debe - s.haber : 0;
        const sAcreedor = s.haber > s.debe ? s.haber - s.debe : 0;
        // Clasificación en estados
        const esActivo  = tipo?.grupo === "ACTIVO" || tipo?.grupo === "TRIBUTARIO";
        const esPasivo  = tipo?.grupo === "PASIVO" || tipo?.grupo === "PATRIMONIO";
        const esResultado = tipo?.grupo === "RESULTADO";
        const resultadoPositivo = tipo?.id === "ingreso";
        return {
          ...c, s, sDeudor, sAcreedor,
          invDeudor:   sDeudor,
          invAcreedor: sAcreedor,
          esfActivo:   esActivo  ? (sDeudor  || 0) : 0,
          esfPasivo:   esPasivo  ? (sAcreedor || 0) : 0,
          erpLoss:     (esResultado && !resultadoPositivo) ? (sDeudor || 0) : 0,
          erpGain:     (esResultado && resultadoPositivo) ? (sAcreedor || 0) : 0,
          tipo,
        };
      });
  }, [cuentas, saldosMap]);

  const totales = useMemo(() => ({
    debe:  filas.reduce((s, f) => s + f.s.debe, 0),
    haber: filas.reduce((s, f) => s + f.s.haber, 0),
    sDeudor:    filas.reduce((s, f) => s + f.sDeudor, 0),
    sAcreedor:  filas.reduce((s, f) => s + f.sAcreedor, 0),
    esfActivo:  filas.reduce((s, f) => s + f.esfActivo, 0),
    esfPasivo:  filas.reduce((s, f) => s + f.esfPasivo, 0),
    erpLoss:    filas.reduce((s, f) => s + f.erpLoss, 0),
    erpGain:    filas.reduce((s, f) => s + f.erpGain, 0),
  }), [filas]);

  const cols = [
    { key: "codigo",      label: "Código",    cls: "text-left w-24"  },
    { key: "nombre",      label: "Cuenta",    cls: "text-left"       },
    { key: "sdebe",       label: "Debe",      cls: "text-right w-28 text-emerald-700" },
    { key: "shaber",      label: "Haber",     cls: "text-right w-28 text-red-600" },
    { key: "sDeudor",     label: "Deudor",    cls: "text-right w-28 text-blue-700" },
    { key: "sAcreedor",   label: "Acreedor",  cls: "text-right w-28 text-orange-600" },
    { key: "esfActivo",   label: "Activo",    cls: "text-right w-28 text-emerald-700" },
    { key: "esfPasivo",   label: "Pasivo",    cls: "text-right w-28 text-red-600" },
    { key: "erpLoss",     label: "Pérdida",   cls: "text-right w-28 text-red-600" },
    { key: "erpGain",     label: "Ganancia",  cls: "text-right w-28 text-emerald-700" },
  ];

  return (
    <div className="glass-card rounded-xl overflow-hidden">
      <SectionHeader title="Balance de Comprobación — 8 Columnas" subtitle="Sumas · Saldos · ESF · ERP" />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px]">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="px-3 py-2 text-left text-xs font-black text-slate-500 uppercase w-24">Código</th>
              <th className="px-3 py-2 text-left text-xs font-black text-slate-500 uppercase">Cuenta</th>
              {/* Sumas */}
              <th colSpan={2} className="px-3 py-2 text-center text-xs font-black text-emerald-700 uppercase bg-emerald-50/50 border-x border-emerald-100">Sumas</th>
              {/* Saldos */}
              <th colSpan={2} className="px-3 py-2 text-center text-xs font-black text-blue-700 uppercase bg-blue-50/50 border-x border-blue-100">Saldos</th>
              {/* ESF */}
              <th colSpan={2} className="px-3 py-2 text-center text-xs font-black text-slate-700 uppercase bg-purple-50/50 border-x border-purple-100">ESF</th>
              {/* ERP */}
              <th colSpan={2} className="px-3 py-2 text-center text-xs font-black text-amber-700 uppercase bg-amber-50/50 border-x border-amber-100">ERP</th>
            </tr>
            <tr className="bg-slate-50 border-b-2 border-slate-200 text-xs font-bold text-slate-500">
              <th className="px-3 py-1" />
              <th className="px-3 py-1" />
              <th className="px-3 py-1 text-right bg-emerald-50/30 text-emerald-600">Debe</th>
              <th className="px-3 py-1 text-right bg-emerald-50/30 text-red-500 border-r border-emerald-100">Haber</th>
              <th className="px-3 py-1 text-right bg-blue-50/30 text-blue-600">Deudor</th>
              <th className="px-3 py-1 text-right bg-blue-50/30 text-orange-500 border-r border-blue-100">Acreedor</th>
              <th className="px-3 py-1 text-right bg-purple-50/30 text-emerald-600">Activo</th>
              <th className="px-3 py-1 text-right bg-purple-50/30 text-red-500 border-r border-purple-100">Pasivo</th>
              <th className="px-3 py-1 text-right bg-amber-50/30 text-red-500">Pérdida</th>
              <th className="px-3 py-1 text-right bg-amber-50/30 text-emerald-600 border-r border-amber-100">Ganancia</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {filas.filter(f => f.s.debe > 0 || f.s.haber > 0).map((f, i) => (
              <tr key={f.id} className={`text-xs hover:bg-purple-50/20 ${i % 2 === 0 ? "bg-white" : "bg-slate-50/30"}`}>
                <td className="px-3 py-1.5 font-mono text-slate-500">{f.codigo}</td>
                <td className="px-3 py-1.5 font-semibold text-slate-700 max-w-48 truncate">{f.nombre}</td>
                <td className="px-3 py-1.5 text-right font-mono text-emerald-700 bg-emerald-50/20">{f.s.debe > 0 ? fmt(f.s.debe) : ""}</td>
                <td className="px-3 py-1.5 text-right font-mono text-red-500 bg-emerald-50/20 border-r border-emerald-100">{f.s.haber > 0 ? fmt(f.s.haber) : ""}</td>
                <td className="px-3 py-1.5 text-right font-mono text-blue-700 bg-blue-50/20">{f.sDeudor > 0 ? fmt(f.sDeudor) : ""}</td>
                <td className="px-3 py-1.5 text-right font-mono text-orange-600 bg-blue-50/20 border-r border-blue-100">{f.sAcreedor > 0 ? fmt(f.sAcreedor) : ""}</td>
                <td className="px-3 py-1.5 text-right font-mono text-emerald-700 bg-purple-50/20">{f.esfActivo > 0 ? fmt(f.esfActivo) : ""}</td>
                <td className="px-3 py-1.5 text-right font-mono text-red-500 bg-purple-50/20 border-r border-purple-100">{f.esfPasivo > 0 ? fmt(f.esfPasivo) : ""}</td>
                <td className="px-3 py-1.5 text-right font-mono text-red-500 bg-amber-50/20">{f.erpLoss > 0 ? fmt(f.erpLoss) : ""}</td>
                <td className="px-3 py-1.5 text-right font-mono text-emerald-700 bg-amber-50/20 border-r border-amber-100">{f.erpGain > 0 ? fmt(f.erpGain) : ""}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-gradient-to-r from-purple-700 to-violet-600 text-white text-xs font-black">
              <td className="px-3 py-2" colSpan={2}>TOTALES</td>
              <td className="px-3 py-2 text-right font-mono">{fmt(totales.debe)}</td>
              <td className="px-3 py-2 text-right font-mono">{fmt(totales.haber)}</td>
              <td className="px-3 py-2 text-right font-mono">{fmt(totales.sDeudor)}</td>
              <td className="px-3 py-2 text-right font-mono">{fmt(totales.sAcreedor)}</td>
              <td className="px-3 py-2 text-right font-mono">{fmt(totales.esfActivo)}</td>
              <td className="px-3 py-2 text-right font-mono">{fmt(totales.esfPasivo)}</td>
              <td className="px-3 py-2 text-right font-mono">{fmt(totales.erpLoss)}</td>
              <td className="px-3 py-2 text-right font-mono">{fmt(totales.erpGain)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ─── Estado de Situación Financiera ──────────────────────────────────────────
function ESF({ cuentas, saldosMap }) {
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

    const activoC  = get(["activo_corriente","iva_credito","ppm","impuesto_diferido"]);
    const activoNC = get(["activo_no_corriente"]);
    const pasivoC  = get(["pasivo_corriente","iva_debito"]);
    const pasivoNC = get(["pasivo_no_corriente"]);
    const patrimonio = get(["patrimonio"]);

    const totalAC  = activoC.reduce((s, c) => s + c.saldo, 0);
    const totalANC = activoNC.reduce((s, c) => s + c.saldo, 0);
    const totalPC  = pasivoC.reduce((s, c) => s + c.saldo, 0);
    const totalPNC = pasivoNC.reduce((s, c) => s + c.saldo, 0);
    const totalPat = patrimonio.reduce((s, c) => s + c.saldo, 0);

    return { activoC, activoNC, pasivoC, pasivoNC, patrimonio, totalAC, totalANC, totalPC, totalPNC, totalPat };
  }, [cuentas, saldosMap]);

  return (
    <div className="glass-card rounded-xl overflow-hidden">
      <SectionHeader title="Estado de Situación Financiera" subtitle="Balance General IFRS" color="from-emerald-600 to-teal-600" />
      <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-100">
        {/* ACTIVOS */}
        <table className="w-full">
          <tbody>
            <tr className="bg-slate-50"><td colSpan={2} className="px-4 py-2 text-xs font-black text-emerald-700 uppercase tracking-wider">ACTIVOS</td></tr>
            <tr className="bg-slate-50/50"><td colSpan={2} className="px-4 py-1.5 text-xs font-bold text-slate-500">Activo Corriente</td></tr>
            {data.activoC.map(c => <FilaEstado key={c.id} label={c.nombre} valor={c.saldo} nivel={1} />)}
            <FilaEstado label="Total Activo Corriente" valor={data.totalAC} negrita />
            <FilaEstado separador />
            <tr className="bg-slate-50/50"><td colSpan={2} className="px-4 py-1.5 text-xs font-bold text-slate-500">Activo No Corriente</td></tr>
            {data.activoNC.map(c => <FilaEstado key={c.id} label={c.nombre} valor={c.saldo} nivel={1} />)}
            <FilaEstado label="Total Activo No Corriente" valor={data.totalANC} negrita />
            <FilaEstado separador />
            <FilaEstado label="TOTAL ACTIVOS" valor={data.totalAC + data.totalANC} negrita colorValor="font-black text-emerald-700" />
          </tbody>
        </table>
        {/* PASIVOS + PATRIMONIO */}
        <table className="w-full">
          <tbody>
            <tr className="bg-slate-50"><td colSpan={2} className="px-4 py-2 text-xs font-black text-red-600 uppercase tracking-wider">PASIVOS Y PATRIMONIO</td></tr>
            <tr className="bg-slate-50/50"><td colSpan={2} className="px-4 py-1.5 text-xs font-bold text-slate-500">Pasivo Corriente</td></tr>
            {data.pasivoC.map(c => <FilaEstado key={c.id} label={c.nombre} valor={c.saldo} nivel={1} />)}
            <FilaEstado label="Total Pasivo Corriente" valor={data.totalPC} negrita />
            <FilaEstado separador />
            <tr className="bg-slate-50/50"><td colSpan={2} className="px-4 py-1.5 text-xs font-bold text-slate-500">Pasivo No Corriente</td></tr>
            {data.pasivoNC.map(c => <FilaEstado key={c.id} label={c.nombre} valor={c.saldo} nivel={1} />)}
            <FilaEstado label="Total Pasivo No Corriente" valor={data.totalPNC} negrita />
            <FilaEstado separador />
            <tr className="bg-slate-50/50"><td colSpan={2} className="px-4 py-1.5 text-xs font-bold text-slate-500">Patrimonio</td></tr>
            {data.patrimonio.map(c => <FilaEstado key={c.id} label={c.nombre} valor={c.saldo} nivel={1} />)}
            <FilaEstado label="Total Patrimonio" valor={data.totalPat} negrita />
            <FilaEstado separador />
            <FilaEstado label="TOTAL PASIVOS + PATRIMONIO" valor={data.totalPC + data.totalPNC + data.totalPat} negrita colorValor="font-black text-red-600" />
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Estado de Resultado Proyectado ──────────────────────────────────────────
function ERP({ cuentas, saldosMap }) {
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

    const ingresos   = get(["ingreso"]);
    const costos     = get(["costo"]);
    const gastosAdm  = get(["gasto_adm"]);
    const gastosFin  = get(["gasto_fin"]);
    const otrosRes   = get(["otro_resultado"]);

    const totalIng   = ingresos.reduce((s, c) => s + c.saldo, 0);
    const totalCosto = costos.reduce((s, c) => s + c.saldo, 0);
    const utilidadBruta = totalIng - totalCosto;
    const totalGAdm  = gastosAdm.reduce((s, c) => s + c.saldo, 0);
    const utilidadOp = utilidadBruta - totalGAdm;
    const totalGFin  = gastosFin.reduce((s, c) => s + c.saldo, 0);
    const totalOtros = otrosRes.reduce((s, c) => s + c.saldo, 0);
    const utilidadAntes = utilidadOp - totalGFin - totalOtros;
    const impuesto   = Math.max(0, utilidadAntes * 0.27); // Tasa 1ª categoría Chile
    const utilidadNeta = utilidadAntes - impuesto;

    return { ingresos, costos, gastosAdm, gastosFin, otrosRes, totalIng, totalCosto, utilidadBruta, totalGAdm, utilidadOp, totalGFin, totalOtros, utilidadAntes, impuesto, utilidadNeta };
  }, [cuentas, saldosMap]);

  return (
    <div className="glass-card rounded-xl overflow-hidden">
      <SectionHeader title="Estado de Resultado Proyectado" subtitle="Base devengada" color="from-amber-600 to-orange-600" />
      <table className="w-full">
        <tbody>
          {data.ingresos.map(c => <FilaEstado key={c.id} label={c.nombre} valor={c.saldo} nivel={1} />)}
          <FilaEstado label="Ingresos Totales" valor={data.totalIng} negrita colorValor="font-black text-emerald-700" />
          <FilaEstado separador />
          {data.costos.map(c => <FilaEstado key={c.id} label={c.nombre} valor={c.saldo} nivel={1} />)}
          <FilaEstado label="Costo de Ventas" valor={data.totalCosto} negrita colorValor="font-black text-red-500" />
          <FilaEstado separador />
          <FilaEstado label="UTILIDAD BRUTA" valor={data.utilidadBruta} negrita colorValor={`font-black ${data.utilidadBruta >= 0 ? "text-emerald-700" : "text-red-600"}`} />
          <FilaEstado separador />
          {data.gastosAdm.map(c => <FilaEstado key={c.id} label={c.nombre} valor={c.saldo} nivel={1} />)}
          <FilaEstado label="Total Gastos Administración" valor={data.totalGAdm} negrita />
          <FilaEstado label="RESULTADO OPERACIONAL" valor={data.utilidadOp} negrita colorValor={`font-black ${data.utilidadOp >= 0 ? "text-emerald-700" : "text-red-600"}`} />
          <FilaEstado separador />
          {data.gastosFin.map(c => <FilaEstado key={c.id} label={c.nombre} valor={c.saldo} nivel={1} />)}
          {data.otrosRes.map(c => <FilaEstado key={c.id} label={c.nombre} valor={c.saldo} nivel={1} />)}
          <FilaEstado label="RESULTADO ANTES IMPUESTO" valor={data.utilidadAntes} negrita />
          <FilaEstado label="Impuesto 1ª Categoría (27%)" valor={data.impuesto} nivel={1} />
          <FilaEstado separador />
          <FilaEstado label="RESULTADO DEL EJERCICIO" valor={data.utilidadNeta} negrita colorValor={`font-black text-lg ${data.utilidadNeta >= 0 ? "text-emerald-700" : "text-red-600"}`} />
        </tbody>
      </table>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function ContabilidadEstados() {
  const { cuentas, saldos, periodoActivo } = useContabilidad();
  const [vistaActiva, setVistaActiva] = useState("balance8");
  const saldosMap = saldos();

  const VISTAS = [
    { id: "balance8", label: "Balance 8 col." },
    { id: "esf",      label: "ESF"            },
    { id: "erp",      label: "ERP"            },
  ];

  return (
    <div className="p-4 sm:p-6 space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div>
          <h1 className="text-xl font-black text-slate-900">Estados Financieros</h1>
          <p className="text-xs text-slate-500 mt-0.5">Calculados en tiempo real desde asientos</p>
        </div>
        <div className="flex items-center gap-2 sm:ml-auto">
          <PeriodoSelector />
        </div>
      </div>

      {/* Tabs de vista */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
        {VISTAS.map(v => (
          <button key={v.id} onClick={() => setVistaActiva(v.id)}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${vistaActiva === v.id ? "bg-white text-purple-700 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
            {v.label}
          </button>
        ))}
      </div>

      {vistaActiva === "balance8" && <Balance8Col cuentas={cuentas} saldosMap={saldosMap} />}
      {vistaActiva === "esf"      && <ESF cuentas={cuentas} saldosMap={saldosMap} />}
      {vistaActiva === "erp"      && <ERP cuentas={cuentas} saldosMap={saldosMap} />}
    </div>
  );
}
