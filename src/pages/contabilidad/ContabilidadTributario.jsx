import React, { useState, useMemo, useEffect } from "react";
import { useContabilidad, PeriodoSelector, fmt, fmtM, MESES, MESES_S } from "./ContabilidadContext";
import { useEmpresa } from "../../lib/useEmpresa";
import { db } from "../../lib/firebase";
import { collection, getDocs, query, where } from "firebase/firestore";

// ─── Utilidades ───────────────────────────────────────────────────────────────
function KpiTrib({ label, value, sub, color = "text-slate-800", bg = "bg-white" }) {
  return (
    <div className={`glass-card rounded-xl p-4 ${bg}`}>
      <p className="text-xs text-slate-500 font-semibold">{label}</p>
      <p className={`text-xl font-black mt-1 ${color}`}>{value}</p>
      {sub && <p className="text-[10px] text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function FilaTrib({ label, valor, indent = false, negrita = false, colorValor = "text-slate-700", separador = false }) {
  if (separador) return <tr><td colSpan={2} className="h-px bg-slate-100" /></tr>;
  const negativo = typeof valor === "number" && valor < 0;
  const valorMostrar = negativo ? `-${fmt(Math.abs(valor))}` : fmt(valor);
  const colorFinal = negativo ? "text-red-500 font-semibold" : colorValor;
  return (
    <tr className={negrita ? "bg-slate-50" : "hover:bg-purple-50/10"}>
      <td className={`px-4 py-2 text-sm ${negrita ? "font-black text-slate-800" : "text-slate-600"}`}
        style={{ paddingLeft: indent ? "32px" : "16px" }}>
        {label}
      </td>
      <td className={`px-4 py-2 text-right text-sm font-mono ${negrita ? "font-black" : "font-semibold"} ${colorFinal}`}>
        {valorMostrar}
      </td>
    </tr>
  );
}

// ─── F29 — Declaración mensual IVA ───────────────────────────────────────────
function FormularioF29({ cuentas, saldosMap, periodoActivo, imptoUnico = 0, onImportImpto, ieRecuperable = 0 }) {
  const data = useMemo(() => {
    const ivaDebitoCuenta  = cuentas.find(c => c.tipo === "iva_debito");
    const ppmCuenta        = cuentas.find(c => c.tipo === "ppm");

    const ivaCredCuentas = cuentas.filter(c => c.tipo === "iva_credito" && c.activa !== false);

    const saldoNeto = (cuentaId) => {
      const s = saldosMap[cuentaId] || { debe: 0, haber: 0 };
      return (s.debe || 0) - (s.haber || 0);
    };
    const getSaldo = (cuentaId) => saldosMap[cuentaId] || { debe: 0, haber: 0 };

    const ivaDebito = ivaDebitoCuenta ? Math.abs(saldoNeto(ivaDebitoCuenta.id)) : 0;

    // Para cada cuenta iva_credito: debe = facturas, haber = NC → neto = CF real
    const ivaCfDetalle = ivaCredCuentas.map(c => {
      const s     = getSaldo(c.id);
      const debe  = s.debe  || 0;
      const haber = s.haber || 0;
      const neto  = debe - haber;
      const esEspec = /específico|especifico/i.test(c.nombre);
      return { ...c, debe, haber, neto, esEspec };
    });

    const ivaCfNormal = ivaCfDetalle
      .filter(c => !c.esEspec)
      .reduce((sum, c) => sum + Math.max(0, c.neto), 0);
    const ivaCfEspec  = ivaCfDetalle
      .filter(c => c.esEspec)
      .reduce((sum, c) => sum + Math.max(0, c.neto), 0);

    // Total NC recibidas (haber acumulado en cuentas iva_credito)
    const totalNcIVA = ivaCfDetalle
      .filter(c => !c.esEspec)
      .reduce((sum, c) => sum + (c.haber || 0), 0);

    const ivaCredito = ivaCfNormal + ivaCfEspec;

    const ppm       = ppmCuenta ? Math.abs(saldoNeto(ppmCuenta.id)) : 0;
    const ivaLine1  = ivaDebito;
    const ivaLine2  = ivaCredito;
    const ivaLine3  = Math.max(0, ivaLine1 - ivaLine2);
    const remanente = Math.max(0, ivaLine2 - ivaLine1);
    // Total F29 = IVA a pagar - PPM - IE Combustible recuperable + Impuesto Único Trabajadores
    const totalF29  = Math.max(0, ivaLine3 - ppm - ieRecuperable) + imptoUnico;

    return { ivaDebito, ivaCredito, ivaLine3, remanente, ppm, totalF29,
             ivaCfNormal, ivaCfEspec, totalNcIVA, ivaCfDetalle };
  }, [cuentas, saldosMap]);

  const [anno, mes] = periodoActivo.split("-");
  const mesLabel = MESES[parseInt(mes) - 1];

  return (
    <div className="glass-card rounded-xl overflow-hidden">
      <div className="bg-gradient-to-r from-blue-700 to-blue-600 px-4 py-3 flex items-center justify-between">
        <div>
          <p className="text-white font-black text-sm">Formulario 29 — Declaración IVA</p>
          <p className="text-blue-200 text-xs">Período {mesLabel} {anno}</p>
        </div>
        <span className="px-3 py-1 bg-white/20 text-white text-xs font-black rounded-full">SII Chile</span>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3 p-4">
        <KpiTrib label="IVA Débito" value={fmtM(data.ivaDebito)} sub="Ventas gravadas × 19%" color="text-red-600" />
        <KpiTrib label="IVA Crédito" value={fmtM(data.ivaCredito)} sub="Compras con IVA" color="text-emerald-600" />
        <KpiTrib label={data.totalF29 > 0 ? "A Pagar" : "Sin pago"} value={fmtM(data.totalF29)} sub="Neto F29" color={data.totalF29 > 0 ? "text-red-700" : "text-emerald-700"} />
      </div>

      {/* Detalle cuadro */}
      <table className="w-full border-t border-slate-100">
        <tbody>
          <FilaTrib label="IVA Débito Fiscal (línea 1)" valor={data.ivaDebito} />
          <FilaTrib separador />
          <FilaTrib label="IVA Crédito Fiscal bruto (facturas)" valor={data.ivaCfNormal + data.ivaCfEspec + data.totalNcIVA} indent colorValor="text-slate-500" />
          {data.totalNcIVA > 0 && <FilaTrib label="  (−) Notas de Crédito recibidas" valor={-data.totalNcIVA} indent colorValor="text-red-500" />}
          <FilaTrib label="IVA Crédito Fiscal neto (línea 20)" valor={data.ivaCredito} indent />
          {data.ivaCfEspec > 0 && <FilaTrib label="    · IVA CF normal" valor={data.ivaCfNormal} indent colorValor="text-slate-400" />}
          {data.ivaCfEspec > 0 && <FilaTrib label="    · Imp. Específico Combustible (Ley 18.502)" valor={data.ivaCfEspec} indent colorValor="text-slate-400" />}
          <FilaTrib separador />
          <FilaTrib label="IVA a pagar (Línea 1 − Línea 20)" valor={data.ivaLine3} negrita />
          {data.remanente > 0 && <FilaTrib label="Remanente Crédito Fiscal (arrastre próx. mes)" valor={data.remanente} colorValor="text-emerald-600" />}
          <FilaTrib separador />
          <FilaTrib label="PPM acumulado período" valor={data.ppm} indent colorValor="text-blue-600" />
          {/* Línea 26 — Crédito Impuesto Específico Petróleo Diesel */}
          <tr className="hover:bg-purple-50/10">
            <td className="px-4 py-2 text-sm text-slate-600" style={{ paddingLeft:"16px" }}>
              <div className="flex items-center justify-between gap-3">
                <span>Crédito Imp. Específico Diesel (línea 26)</span>
                <a href="#combustible"
                  className="text-[10px] font-black px-2 py-1 rounded-lg bg-orange-100 text-orange-700 hover:bg-orange-200 transition-all flex items-center gap-1 flex-shrink-0">
                  ⛽ {ieRecuperable > 0 ? "Ver cálculo" : "Ir a Combustible"}
                </a>
              </div>
            </td>
            <td className="px-4 py-2 text-right text-sm font-mono font-semibold text-orange-600">
              {ieRecuperable > 0
                ? <span className="text-emerald-600">−{fmt(ieRecuperable)}</span>
                : <span className="text-slate-300 text-xs">Sin datos · ve a módulo Combustible</span>}
            </td>
          </tr>
          <FilaTrib separador />
          {/* Línea 47 — Impuesto Único Trabajadores */}
          <tr className="hover:bg-purple-50/10">
            <td className="px-4 py-2 text-sm text-slate-600" style={{ paddingLeft:"16px" }}>
              <div className="flex items-center justify-between gap-3">
                <span>Impuesto Único Trabajadores (línea 47)</span>
                <button onClick={onImportImpto}
                  className="text-[10px] font-black px-2 py-1 rounded-lg bg-indigo-100 text-indigo-700 hover:bg-indigo-200 transition-all flex items-center gap-1 flex-shrink-0">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/>
                  </svg>
                  {imptoUnico > 0 ? "Actualizar" : "Importar Excel"}
                </button>
              </div>
            </td>
            <td className="px-4 py-2 text-right text-sm font-mono font-semibold text-orange-600">
              {imptoUnico > 0 ? fmt(imptoUnico) : <span className="text-slate-300 text-xs">Sin datos · importa el Excel</span>}
            </td>
          </tr>
          <FilaTrib separador />
          <FilaTrib label="TOTAL A PAGAR F29" valor={data.totalF29} negrita colorValor={data.totalF29 > 0 ? "font-black text-red-700" : "font-black text-emerald-700"} />
        </tbody>
      </table>

      {/* Advertencia */}
      <div className="px-4 py-3 bg-amber-50 border-t border-amber-100 flex items-start gap-2">
        <svg className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="text-xs text-amber-700">Estos valores se calculan sobre los asientos del período. Verifica que los asientos de IVA estén ingresados correctamente antes de presentar la declaración.</p>
      </div>
    </div>
  );
}

// ─── PPM — Pagos Provisionales Mensuales ─────────────────────────────────────
function ModuloPPM({ cuentas, saldosMap, asientos, periodoActivo }) {
  const [tasaPPM, setTasaPPM] = useState(1.5); // % sobre ingresos brutos

  const data = useMemo(() => {
    const ingresoCuentas = cuentas.filter(c => c.tipo === "ingreso");
    const totalIngresos  = ingresoCuentas.reduce((s, c) => {
      const sd = saldosMap[c.id] || { debe: 0, haber: 0 };
      return s + Math.abs(sd.haber - sd.debe);
    }, 0);

    const ppmObligatorio = totalIngresos * (tasaPPM / 100);

    const ppmCuenta   = cuentas.find(c => c.tipo === "ppm");
    const ppmRegistrado = ppmCuenta
      ? Math.abs((saldosMap[ppmCuenta.id]?.debe || 0) - (saldosMap[ppmCuenta.id]?.haber || 0))
      : 0;

    const diferencia = ppmObligatorio - ppmRegistrado;

    return { totalIngresos, ppmObligatorio, ppmRegistrado, diferencia, tasaPPM };
  }, [cuentas, saldosMap, tasaPPM]);

  return (
    <div className="glass-card rounded-xl overflow-hidden">
      <div className="bg-gradient-to-r from-violet-700 to-purple-600 px-4 py-3 flex items-center justify-between">
        <div>
          <p className="text-white font-black text-sm">PPM — Pagos Provisionales Mensuales</p>
          <p className="text-violet-200 text-xs">Art. 84 LIR — Determinación mensual</p>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Tasa configurable */}
        <div className="flex items-center gap-3 p-3 bg-purple-50 rounded-xl border-2 border-purple-200">
          <div className="flex-1">
            <p className="text-xs font-black text-purple-700">Tasa PPM aplicable</p>
            <p className="text-[11px] text-purple-500">Determinada en la renta anterior o provisional</p>
          </div>
          <div className="flex items-center gap-2">
            <input type="number" value={tasaPPM} onChange={e => setTasaPPM(parseFloat(e.target.value) || 0)}
              step="0.1" min="0" max="100"
              className="w-20 px-3 py-1.5 border-2 border-purple-300 rounded-xl text-sm font-black text-center focus:outline-none focus:border-purple-500" />
            <span className="text-sm font-black text-purple-700">%</span>
          </div>
        </div>

        {/* Cuadro */}
        <table className="w-full">
          <tbody>
            <FilaTrib label="Ingresos brutos del período" valor={data.totalIngresos} />
            <FilaTrib label={`Tasa PPM (${tasaPPM}%)`} valor={data.ppmObligatorio} negrita colorValor="text-purple-700" />
            <FilaTrib separador />
            <FilaTrib label="PPM registrado en asientos" valor={data.ppmRegistrado} indent />
            <FilaTrib label={data.diferencia > 0 ? "PPM pendiente de registrar" : "PPM en exceso"} valor={Math.abs(data.diferencia)}
              negrita colorValor={data.diferencia > 0 ? "font-black text-red-600" : "font-black text-emerald-600"} />
          </tbody>
        </table>

        {data.diferencia > 0.01 && (
          <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl">
            <svg className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-xs text-red-700 font-semibold">Falta registrar el asiento de PPM por {fmt(data.diferencia)}. Ir al Libro Diario y crear un asiento Debe: PPM / Haber: Banco.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── F22 — Impuesto Anual a la Renta ─────────────────────────────────────────
function FormularioF22({ cuentas, saldosMap }) {
  const data = useMemo(() => {
    const get = (tipos, porHaber = false) => cuentas
      .filter(c => tipos.includes(c.tipo) && c.activa !== false)
      .reduce((s, c) => {
        const sd = saldosMap[c.id] || { debe: 0, haber: 0 };
        return s + (porHaber ? Math.abs(sd.haber - sd.debe) : Math.abs(sd.debe - sd.haber));
      }, 0);

    const ingresosBrutos   = get(["ingreso"], true);
    const costosYGastos    = get(["costo","gasto_adm","gasto_fin","otro_resultado"]);
    const utilidadFinanciera = ingresosBrutos - costosYGastos;

    // Diferencias temporarias (simplificado)
    const depreciacionContable = get(["otro_resultado"]);
    const depreciacionTrib     = depreciacionContable * 1.0; // Misma base si no hay ajuste
    const difTemp              = depreciacionContable - depreciacionTrib; // 0 si iguales

    const rli = utilidadFinanciera - difTemp; // Renta Líquida Imponible
    const tasaPrimCat = 0.27;
    const impuesto1Cat = Math.max(0, rli * tasaPrimCat);

    const ppmAcumulado = get(["ppm"]);
    const retencionesYCreditos = 0;
    const saldoF22 = Math.max(0, impuesto1Cat - ppmAcumulado - retencionesYCreditos);
    const devolucion = Math.max(0, ppmAcumulado - impuesto1Cat);

    return { ingresosBrutos, costosYGastos, utilidadFinanciera, depreciacionContable, depreciacionTrib, difTemp, rli, impuesto1Cat, ppmAcumulado, saldoF22, devolucion };
  }, [cuentas, saldosMap]);

  return (
    <div className="glass-card rounded-xl overflow-hidden">
      <div className="bg-gradient-to-r from-slate-700 to-slate-600 px-4 py-3 flex items-center justify-between">
        <div>
          <p className="text-white font-black text-sm">Formulario 22 — Declaración Anual Renta</p>
          <p className="text-slate-400 text-xs">Determinación Renta Líquida Imponible</p>
        </div>
        <span className="px-3 py-1 bg-white/10 text-white text-xs font-black rounded-full">Art. 29–33 LIR</span>
      </div>

      {/* KPIs F22 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4">
        <KpiTrib label="Ingresos Brutos" value={fmtM(data.ingresosBrutos)} color="text-emerald-600" />
        <KpiTrib label="Renta Liq. Imponible" value={fmtM(data.rli)} color={data.rli >= 0 ? "text-slate-800" : "text-red-600"} />
        <KpiTrib label="Impuesto 1ª Cat." value={fmtM(data.impuesto1Cat)} color="text-red-600" />
        <KpiTrib label={data.saldoF22 > 0 ? "A Pagar F22" : "Devolución"} value={fmtM(data.saldoF22 || data.devolucion)} color={data.saldoF22 > 0 ? "text-red-700" : "text-emerald-700"} />
      </div>

      <table className="w-full border-t border-slate-100">
        <tbody>
          <tr className="bg-slate-50"><td colSpan={2} className="px-4 py-2 text-xs font-black text-slate-500 uppercase tracking-wider">Determinación RLI</td></tr>
          <FilaTrib label="Resultado financiero del período" valor={data.utilidadFinanciera} />
          <FilaTrib separador />
          <tr className="bg-slate-50"><td colSpan={2} className="px-4 py-1.5 text-xs font-bold text-slate-500">Agregados y Deducciones</td></tr>
          <FilaTrib label="Depreciación contable (agregar)" valor={data.depreciacionContable} indent />
          <FilaTrib label="Depreciación tributaria (deducir)" valor={data.depreciacionTrib} indent colorValor="text-emerald-600" />
          <FilaTrib label="Diferencia temporaria neta" valor={data.difTemp} indent colorValor={data.difTemp !== 0 ? "text-amber-600" : "text-slate-400"} />
          <FilaTrib separador />
          <FilaTrib label="RENTA LÍQUIDA IMPONIBLE" valor={data.rli} negrita colorValor={data.rli >= 0 ? "font-black text-slate-800" : "font-black text-red-600"} />
          <FilaTrib separador />
          <FilaTrib label="Impuesto 1ª Categoría (27%)" valor={data.impuesto1Cat} negrita />
          <FilaTrib label="Menos: PPM acumulado" valor={data.ppmAcumulado} indent colorValor="text-emerald-600" />
          <FilaTrib separador />
          {data.saldoF22 > 0
            ? <FilaTrib label="IMPUESTO A PAGAR F22" valor={data.saldoF22} negrita colorValor="font-black text-red-700" />
            : <FilaTrib label="DEVOLUCIÓN ESPERADA" valor={data.devolucion} negrita colorValor="font-black text-emerald-700" />
          }
        </tbody>
      </table>
    </div>
  );
}

// ─── Diferencias temporarias e impuesto diferido ─────────────────────────────
function ImpuestoDiferido({ cuentas, saldosMap }) {
  const data = useMemo(() => {
    const depContable  = cuentas.filter(c => c.nombre?.toLowerCase().includes("deprecia")).reduce((s, c) => {
      const sd = saldosMap[c.id] || { debe: 0, haber: 0 };
      return s + Math.abs(sd.debe - sd.haber);
    }, 0);
    const depTributaria = depContable; // Igual hasta que exista kardex detallado
    const difTemp        = depContable - depTributaria;
    const activoDiferido = difTemp < 0 ? Math.abs(difTemp) * 0.27 : 0;
    const pasivoDiferido = difTemp > 0 ? difTemp * 0.27 : 0;

    return { depContable, depTributaria, difTemp, activoDiferido, pasivoDiferido };
  }, [cuentas, saldosMap]);

  return (
    <div className="glass-card rounded-xl overflow-hidden">
      <div className="bg-gradient-to-r from-indigo-700 to-indigo-600 px-4 py-3">
        <p className="text-white font-black text-sm">Impuesto Diferido — NIC 12</p>
        <p className="text-indigo-200 text-xs">Diferencias temporarias imponibles y deducibles</p>
      </div>
      <table className="w-full">
        <tbody>
          <FilaTrib label="Depreciación contable acumulada" valor={data.depContable} />
          <FilaTrib label="Depreciación tributaria acumulada" valor={data.depTributaria} indent colorValor="text-emerald-600" />
          <FilaTrib separador />
          <FilaTrib label="Diferencia temporaria" valor={Math.abs(data.difTemp)}
            negrita colorValor={data.difTemp !== 0 ? "text-amber-600" : "text-slate-400"} />
          <FilaTrib separador />
          {data.activoDiferido > 0 && <FilaTrib label="Activo por impuesto diferido (27%)" valor={data.activoDiferido} negrita colorValor="font-black text-emerald-600" />}
          {data.pasivoDiferido > 0 && <FilaTrib label="Pasivo por impuesto diferido (27%)" valor={data.pasivoDiferido} negrita colorValor="font-black text-red-600" />}
          {data.difTemp === 0 && <FilaTrib label="Sin diferencias temporarias en el período" valor={0} colorValor="text-slate-300" />}
        </tbody>
      </table>
      <div className="px-4 py-3 bg-indigo-50 border-t border-indigo-100">
        <p className="text-xs text-indigo-600 font-semibold">Para diferencias temporarias detalladas, registra activos con kardex de depreciación contable vs. tributaria en el módulo de Activos.</p>
      </div>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function ContabilidadTributario() {
  const { cuentas, asientos, saldos, periodoActivo, guardarAsiento } = useContabilidad();
  const saldosMap = saldos(periodoActivo);
  const [vistaActiva, setVistaActiva]   = useState("f29");
  const [showImptoModal, setShowImpto] = useState(false);
  const [imptoUnico, setImptoUnico]    = useState(0); // valor del período activo
  const [ieComBustible, setIEComb]     = useState(0); // IE recuperable combustible

  // Cargar IE combustible para el período activo desde combustible_calculos
  const { empresaId } = useEmpresa();
  useEffect(() => {
    if (!empresaId || !periodoActivo) return;
    (async () => {
      try {
        const snap = await getDocs(query(
          collection(db, "empresas", empresaId, "combustible_calculos"),
          where("periodo", "==", periodoActivo)
        ));
        setIEComb(snap.empty ? 0 : (snap.docs[0].data().totalIERecuperable || 0));
      } catch(e) { setIEComb(0); }
    })();
  }, [empresaId, periodoActivo]);
  const importandoRef = React.useRef(false); // protege contra reset del useEffect

  // Cargar impuesto único guardado para este período (buscarlo en asientos cargados)
  React.useEffect(() => {
    if (importandoRef.current) return; // no resetear mientras se está importando
    const asientoImpto = asientos.find(a => a.origen === "impto_unico" && a.periodo === periodoActivo);
    if (asientoImpto) {
      setImptoUnico(asientoImpto.montoImptoUnico || asientoImpto.totalDebe || 0);
    } else {
      setImptoUnico(0);
    }
  }, [asientos, periodoActivo]);

  const handleImportImptoUnico = async (datos) => {
    importandoRef.current = true; // bloquear reset del useEffect
    const cuentaRemun   = cuentas.find(c => /remuneraci/i.test(c.nombre) && c.tipo === "pasivo_corriente");
    const cuentaBanco   = cuentas.find(c => /banco/i.test(c.nombre) && c.tipo === "activo_corriente");
    const cuentaIRPagar = cuentas.find(c => /impuesto.*renta|renta.*pagar/i.test(c.nombre));
    const haberCuenta   = cuentaIRPagar || cuentaBanco;

    await guardarAsiento({
      fecha:   periodoActivo + "-01",
      glosa:   `Impto. Único Trabajadores — ${datos.nombre} · ${datos.mesAnio}`,
      tipo:    "automatico",
      periodo: periodoActivo,
      origen:  "impto_unico",
      totalDebe: datos.total,
      montoImptoUnico: datos.total,
      lineas: [
        {
          cuentaId:     cuentaRemun?.id || "",
          cuentaNombre: cuentaRemun?.nombre || "Remuneraciones por Pagar",
          debe:  datos.total,
          haber: 0,
          descripcion: `Retención impto. único — ${datos.nombre}`,
        },
        {
          cuentaId:     haberCuenta?.id || "",
          cuentaNombre: haberCuenta?.nombre || "Banco",
          debe:  0,
          haber: datos.total,
          descripcion: "Pago impto. único al fisco",
        },
      ],
    });
    // Setear inmediatamente sin esperar cargarAsientos (que puede ser lento)
    setImptoUnico(datos.total);
    // Liberar el bloqueo después de que React procese el estado
    setTimeout(() => { importandoRef.current = false; }, 2000);
  };

  const VISTAS = [
    { id: "f29",   label: "F29 — IVA"         },
    { id: "ppm",   label: "PPM"               },
    { id: "f22",   label: "F22 — Renta"       },
    { id: "dift",  label: "Imp. Diferido"     },
  ];

  return (
    <div className="p-4 sm:p-6 space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div>
          <h1 className="text-xl font-black text-slate-900">Módulo Tributario</h1>
          <p className="text-xs text-slate-500 mt-0.5">F29 · PPM · F22 · Impuesto diferido</p>
        </div>
        <div className="flex items-center gap-2 sm:ml-auto">
          <PeriodoSelector />
        </div>
      </div>

      {/* Aviso SII */}
      <div className="flex items-start gap-3 px-4 py-3 bg-amber-50 border-2 border-amber-200 rounded-xl">
        <svg className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="text-xs text-amber-700 font-semibold">
          Los cálculos son aproximaciones basadas en los asientos registrados. Siempre valida con tu contador o directamente en el portal SII antes de presentar declaraciones.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit overflow-x-auto">
        {VISTAS.map(v => (
          <button key={v.id} onClick={() => setVistaActiva(v.id)}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${vistaActiva === v.id ? "bg-white text-purple-700 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
            {v.label}
          </button>
        ))}
      </div>

      {vistaActiva === "f29"  && <FormularioF29 cuentas={cuentas} saldosMap={saldosMap} periodoActivo={periodoActivo} imptoUnico={imptoUnico} onImportImpto={() => setShowImpto(true)} ieRecuperable={ieComBustible} />}
      {vistaActiva === "ppm"  && <ModuloPPM cuentas={cuentas} saldosMap={saldosMap} asientos={asientos} periodoActivo={periodoActivo} />}
      {vistaActiva === "f22"  && <FormularioF22 cuentas={cuentas} saldosMap={saldosMap} />}
      {vistaActiva === "dift" && <ImpuestoDiferido cuentas={cuentas} saldosMap={saldosMap} />}

      <ModalImportImptoUnico
        isOpen={showImptoModal}
        onClose={() => setShowImpto(false)}
        periodoActivo={periodoActivo}
        onImport={handleImportImptoUnico}
      />
    </div>
  );
}

// ─── Modal importar Impuesto Único Trabajadores ───────────────────────────────
export function ModalImportImptoUnico({ isOpen, onClose, periodoActivo, onImport }) {
  const [archivo, setArchivo]     = useState(null);
  const [empresas, setEmpresas]   = useState([]);   // [{nombre, mesAnio, impUnico, impFin, impReliq, total}]
  const [seleccionada, setSelec]  = useState(null);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState("");
  const [importado, setImportado] = useState(false);
  const inputRef = React.useRef(null);

  const reset = () => { setArchivo(null); setEmpresas([]); setSelec(null); setError(""); setImportado(false); };
  const handleClose = () => { reset(); onClose(); };

  const leerArchivo = async (file) => {
    setLoading(true); setError("");
    try {
      // Leer con SheetJS cargado dinámicamente
      if (!window.XLSX) {
        await new Promise((res, rej) => {
          const s = document.createElement("script");
          s.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
          s.onload = res; s.onerror = rej;
          document.head.appendChild(s);
        });
      }
      const XLSX = window.XLSX;
      const data = await file.arrayBuffer();
      const wb   = XLSX.read(data, { type:"array" });
      const ws   = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: null });

      if (!rows.length) { setError("El archivo no contiene datos."); setLoading(false); return; }

      // Columnas esperadas: Empresa, Mes, Impuesto Único, Impuesto Desde Finiquito, Impuesto Reliquidado, Total Impuesto
      const n = (v) => parseFloat(v) || 0;
      const lista = rows
        .filter(r => r["Empresa"] && r["Total Impuesto"] != null)
        .map(r => ({
          nombre:    String(r["Empresa"] || "").trim(),
          mesAnio:   String(r["Mes"] || ""),
          impUnico:  n(r["Impuesto Único"]),
          impFin:    n(r["Impuesto Desde Finiquito"]),
          impReliq:  n(r["Impuesto Reliquidado"]),
          total:     n(r["Total Impuesto"]),
        }));

      if (!lista.length) { setError("No se encontraron filas con datos de impuesto."); setLoading(false); return; }
      setEmpresas(lista);
      // Pre-seleccionar la que coincida con el nombre de la empresa actual
      const match = lista.find(e => /mpf ingeniería|mpf ingenieria/i.test(e.nombre));
      setSelec(match || lista[0]);
    } catch (e) {
      setError("Error al leer el archivo: " + e.message);
    }
    setLoading(false);
  };

  const handleImportar = () => {
    if (!seleccionada) return;
    onImport(seleccionada);
    setImportado(true);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background:"rgba(2,6,23,0.75)", backdropFilter:"blur(6px)" }}>
      <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden"
        style={{ fontFamily:"'DM Sans',system-ui,sans-serif" }}>

        {/* Header */}
        <div className="px-6 pt-6 pb-5 relative overflow-hidden"
          style={{ background:"linear-gradient(135deg,#0f172a,#1e3a5f,#1d4ed8)" }}>
          <div className="absolute inset-0 opacity-20"
            style={{ backgroundImage:"radial-gradient(circle at 80% 20%,#60a5fa,transparent 50%)" }}/>
          <div className="relative flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl flex items-center justify-center text-xl"
                style={{ background:"rgba(255,255,255,0.12)" }}>👥</div>
              <div>
                <h2 className="text-white font-black text-lg">Importar Impuesto Único</h2>
                <p className="text-blue-300 text-xs mt-0.5">Resumen de impuestos de trabajadores</p>
              </div>
            </div>
            <button onClick={handleClose}
              className="w-8 h-8 rounded-xl text-white/60 hover:text-white hover:bg-white/10 flex items-center justify-center transition-all">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>
        </div>

        <div className="p-6 space-y-4">
          {/* Importado */}
          {importado ? (
            <div className="py-6 text-center space-y-3">
              <div className="w-14 h-14 rounded-2xl mx-auto bg-emerald-100 flex items-center justify-center text-3xl">✅</div>
              <p className="font-black text-slate-800">Impuesto único registrado</p>
              <p className="text-sm text-slate-500">
                <strong>{seleccionada.nombre}</strong><br/>
                Total: <strong className="text-indigo-700">{seleccionada.total.toLocaleString("es-CL", {style:"currency",currency:"CLP"})}</strong>
              </p>
              <p className="text-xs text-slate-400">Aparecerá en la línea 47 del F29 del período</p>
              <button onClick={handleClose}
                className="px-6 py-2.5 rounded-2xl text-white text-sm font-black"
                style={{ background:"linear-gradient(135deg,#1e3a5f,#1d4ed8)" }}>
                Ver en F29
              </button>
            </div>
          ) : (
            <>
              {/* Zona de upload */}
              {!empresas.length && (
                <div
                  onClick={() => inputRef.current?.click()}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => { e.preventDefault(); leerArchivo(e.dataTransfer.files[0]); }}
                  className="border-2 border-dashed border-indigo-200 hover:border-indigo-400 rounded-2xl p-8 text-center cursor-pointer transition-colors bg-indigo-50/30"
                >
                  {loading ? (
                    <div className="space-y-2">
                      <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto"/>
                      <p className="text-sm text-slate-500">Leyendo archivo...</p>
                    </div>
                  ) : (
                    <>
                      <div className="text-4xl mb-3">📊</div>
                      <p className="font-black text-slate-700 text-sm">Arrastra el archivo Excel aquí</p>
                      <p className="text-slate-400 text-xs mt-1">o haz clic para seleccionar</p>
                      <div className="mt-3 inline-flex px-3 py-1 bg-indigo-100 rounded-full">
                        <span className="text-[10px] font-black text-indigo-700">resumen_Impuestos.xlsx</span>
                      </div>
                    </>
                  )}
                  <input ref={inputRef} type="file" accept=".xlsx,.xls" className="hidden"
                    onChange={e => leerArchivo(e.target.files[0])} />
                </div>
              )}

              {/* Error */}
              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl">
                  <p className="text-xs text-red-700 font-semibold">⚠ {error}</p>
                </div>
              )}

              {/* Selector de empresa */}
              {empresas.length > 0 && (
                <div className="space-y-3">
                  <p className="text-xs font-black text-slate-500 uppercase tracking-wider">
                    {empresas.length} empresa{empresas.length > 1 ? "s" : ""} encontrada{empresas.length > 1 ? "s" : ""} — selecciona la que corresponde importar:
                  </p>

                  {empresas.map((emp, i) => {
                    const activa = seleccionada?.nombre === emp.nombre;
                    return (
                      <button key={i} onClick={() => setSelec(emp)}
                        className={`w-full rounded-2xl border-2 p-4 text-left transition-all ${activa ? "border-indigo-500 bg-indigo-50" : "border-slate-200 hover:border-slate-300 bg-white"}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3">
                            {/* Radio visual */}
                            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${activa ? "border-indigo-500 bg-indigo-500" : "border-slate-300"}`}>
                              {activa && <div className="w-2 h-2 rounded-full bg-white"/>}
                            </div>
                            <div>
                              <p className={`text-sm font-black ${activa ? "text-indigo-800" : "text-slate-700"}`}>{emp.nombre}</p>
                              <p className="text-[10px] text-slate-400 mt-0.5">Período: {emp.mesAnio}</p>
                            </div>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className={`text-sm font-black tabular-nums ${activa ? "text-indigo-700" : "text-slate-700"}`}>
                              {emp.total.toLocaleString("es-CL", {style:"currency",currency:"CLP"})}
                            </p>
                            <p className="text-[10px] text-slate-400">Total impuesto</p>
                          </div>
                        </div>
                        {/* Desglose */}
                        {activa && (emp.impUnico > 0 || emp.impFin > 0 || emp.impReliq > 0) && (
                          <div className="mt-3 pt-3 border-t border-indigo-100 grid grid-cols-3 gap-2">
                            {[
                              { label:"Imp. Único", val:emp.impUnico },
                              { label:"Finiquito",  val:emp.impFin   },
                              { label:"Reliquidado",val:emp.impReliq },
                            ].map(d => d.val > 0 && (
                              <div key={d.label} className="text-center">
                                <p className="text-[10px] text-indigo-500 font-bold">{d.label}</p>
                                <p className="text-xs font-black text-indigo-800 tabular-nums">
                                  {d.val.toLocaleString("es-CL",{style:"currency",currency:"CLP"})}
                                </p>
                              </div>
                            ))}
                          </div>
                        )}
                      </button>
                    );
                  })}

                  {/* Info qué hace */}
                  <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-xl">
                    <span className="text-blue-500 flex-shrink-0">ℹ️</span>
                    <p className="text-[10px] text-blue-700">
                      El impuesto único se agregará como línea 47 (Impto. Único Trabajadores) en el F29 del período <strong>{periodoActivo}</strong> y se registrará como asiento de remuneraciones.
                    </p>
                  </div>

                  <div className="flex gap-2">
                    <button onClick={reset}
                      className="flex-1 py-2.5 rounded-2xl border-2 border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50 transition-all">
                      ← Cambiar archivo
                    </button>
                    <button onClick={handleImportar} disabled={!seleccionada}
                      className="flex-1 py-2.5 rounded-2xl text-white text-sm font-black disabled:opacity-50 transition-all"
                      style={{ background:"linear-gradient(135deg,#0f172a,#1d4ed8)" }}>
                      Importar impuesto →
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
