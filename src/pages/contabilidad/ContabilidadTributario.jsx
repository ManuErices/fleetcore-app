import React, { useState, useMemo, useEffect, useCallback } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useEmpresa } from "../../lib/useEmpresa";
import { useContabilidad, PeriodoSelector, fmt, fmtM, MESES, MESES_S } from "./ContabilidadContext";

// ─── Tabla vida útil tributaria SII (años) ────────────────────────────────────
// Resolución SII Exenta N° 43/2002 y circulares complementarias
const VIDA_UTIL_TRIB = {
  maquinaria:  10,
  vehiculo:     7,
  herramienta:  3,
  otro:         5,
};

// ─── Calcula depreciación anual de un activo ──────────────────────────────────
function calcDepContable(a) {
  if (a.depreciacionAnual) return parseFloat(a.depreciacionAnual) || 0;
  const v = parseFloat(a.valorCompra) || 0;
  const y = parseFloat(a.vidaUtilAnios) || 0;
  return (!v || !y) ? 0 : v / y;
}

function calcDepTributaria(a) {
  const v    = parseFloat(a.valorCompra) || 0;
  const anos = VIDA_UTIL_TRIB[a.tipo] || 5;
  return v > 0 ? v / anos : 0;
}

// ─── Hook: carga activos desde /machines ─────────────────────────────────────
function useActivos() {
  const { empresaId } = useEmpresa();
  const [activos, setActivos] = useState([]);

  const cargar = useCallback(async () => {
    if (!empresaId) return;
    try {
      const snap = await getDocs(collection(db, "empresas", empresaId, "machines"));
      setActivos(snap.docs
        .filter(d => d.data().active !== false)
        .map(d => ({
          id:                d.id,
          nombre:            d.data().name || "",
          tipo:              d.data().tipo || (() => {
            const type = (d.data().type || "").toLowerCase();
            const name = (d.data().name || "").toLowerCase();
            const esVehiculo = [
              "van","pickup","truck","bus","minibus","suv","sedan","hatchback",
              "station wagon","camioneta","furgon","furgón","minivan","jeep",
              "camión","camion","vehículo","vehiculo",
            ].some(k => type.includes(k)) ||
            [
              "camioneta","furgon","furgón","hilux","wingle","poer","maxus",
              "changan","jac","mitsubishi","toyota","ford","chevrolet",
              "nissan","hyundai","kia","volkswagen","peugeot partner",
              "great wall","gwm","jeep","suv",
            ].some(k => name.includes(k));
            return esVehiculo ? "vehiculo" : "maquinaria";
          })(),
          valorCompra:       d.data().valorCompra || "",
          vidaUtilAnios:     d.data().vidaUtilAnios || "",
          depreciacionAnual: d.data().depreciacionAnual || "",
          fechaCompra:       d.data().fechaCompra || "",
        }))
      );
    } catch (e) { console.error("useActivos:", e); }
  }, [empresaId]);

  useEffect(() => { cargar(); }, [cargar]);
  return activos;
}


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
  return (
    <tr className={negrita ? "bg-slate-50" : "hover:bg-purple-50/10"}>
      <td className={`px-4 py-2 text-sm ${negrita ? "font-black text-slate-800" : "text-slate-600"}`}
        style={{ paddingLeft: indent ? "32px" : "16px" }}>
        {label}
      </td>
      <td className={`px-4 py-2 text-right text-sm font-mono ${negrita ? "font-black" : "font-semibold"} ${colorValor}`}>
        {fmt(valor)}
      </td>
    </tr>
  );
}

// ─── F29 — Declaración mensual IVA ───────────────────────────────────────────
function FormularioF29({ cuentas, saldosMap, periodoActivo }) {
  const data = useMemo(() => {
    // Buscar cuentas de IVA
    const ivaDebitoCuenta  = cuentas.find(c => c.tipo === "iva_debito");
    const ivaCreditoCuenta = cuentas.find(c => c.tipo === "iva_credito");
    const ppmCuenta        = cuentas.find(c => c.tipo === "ppm");

    const ivaDebito  = ivaDebitoCuenta  ? Math.abs((saldosMap[ivaDebitoCuenta.id]?.haber  || 0) - (saldosMap[ivaDebitoCuenta.id]?.debe   || 0)) : 0;
    const ivaCredito = ivaCreditoCuenta ? Math.abs((saldosMap[ivaCreditoCuenta.id]?.debe   || 0) - (saldosMap[ivaCreditoCuenta.id]?.haber  || 0)) : 0;
    const ppm        = ppmCuenta        ? Math.abs((saldosMap[ppmCuenta.id]?.debe          || 0) - (saldosMap[ppmCuenta.id]?.haber         || 0)) : 0;

    const ivaLine1   = ivaDebito;
    const ivaLine2   = ivaCredito;
    const ivaLine3   = Math.max(0, ivaLine1 - ivaLine2); // IVA a pagar (o remanente)
    const remanente  = Math.max(0, ivaLine2 - ivaLine1); // Remanente crédito fiscal
    const totalF29   = Math.max(0, ivaLine3 - ppm);

    return { ivaDebito, ivaCredito, ivaLine3, remanente, ppm, totalF29 };
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
          <FilaTrib label="IVA Crédito Fiscal (línea 20)" valor={data.ivaCredito} indent />
          <FilaTrib separador />
          <FilaTrib label="IVA a pagar (Línea 1 - Línea 20)" valor={data.ivaLine3} negrita />
          {data.remanente > 0 && <FilaTrib label="Remanente Crédito Fiscal (arrastre próx. mes)" valor={data.remanente} colorValor="text-emerald-600" />}
          <FilaTrib separador />
          <FilaTrib label="PPM acumulado período" valor={data.ppm} indent colorValor="text-blue-600" />
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
  const activos = useActivos();

  const data = useMemo(() => {
    const get = (tipos, porHaber = false) => cuentas
      .filter(c => tipos.includes(c.tipo) && c.activa !== false)
      .reduce((s, c) => {
        const sd = saldosMap[c.id] || { debe: 0, haber: 0 };
        return s + (porHaber ? Math.abs(sd.haber - sd.debe) : Math.abs(sd.debe - sd.haber));
      }, 0);

    const ingresosBrutos     = get(["ingreso"], true);
    const costosYGastos      = get(["costo", "gasto_adm", "gasto_fin", "otro_resultado"]);
    const utilidadFinanciera = ingresosBrutos - costosYGastos;

    // Depreciación desde módulo Activos Fijos
    const depreciacionContable  = activos.reduce((s, a) => s + calcDepContable(a), 0);
    const depreciacionTrib      = activos.reduce((s, a) => s + calcDepTributaria(a), 0);
    const difTemp               = depreciacionContable - depreciacionTrib;

    const rli           = utilidadFinanciera + depreciacionContable - depreciacionTrib;
    const tasaPrimCat   = 0.27;
    const impuesto1Cat  = Math.max(0, rli * tasaPrimCat);
    const ppmAcumulado  = get(["ppm"]);
    const saldoF22      = Math.max(0, impuesto1Cat - ppmAcumulado);
    const devolucion    = Math.max(0, ppmAcumulado - impuesto1Cat);

    return { ingresosBrutos, costosYGastos, utilidadFinanciera, depreciacionContable, depreciacionTrib, difTemp, rli, impuesto1Cat, ppmAcumulado, saldoF22, devolucion };
  }, [cuentas, saldosMap, activos]);

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
  const activos = useActivos();

  // Dep. anual total de la flota (contable y tributaria)
  const { depContableAnual, depTributariaAnual, detalle } = useMemo(() => {
    let depC = 0, depT = 0;
    const det = activos
      .filter(a => parseFloat(a.valorCompra) > 0)
      .map(a => {
        const c = calcDepContable(a);
        const t = calcDepTributaria(a);
        depC += c;
        depT += t;
        return {
          nombre: a.nombre || a.id,
          tipo:   a.tipo,
          vc:     parseFloat(a.valorCompra) || 0,
          depC:   c,
          depT:   t,
          dif:    c - t,
          vidaC:  parseFloat(a.vidaUtilAnios) || 0,
          vidaT:  VIDA_UTIL_TRIB[a.tipo] || 5,
        };
      });
    return { depContableAnual: depC, depTributariaAnual: depT, detalle: det };
  }, [activos]);

  const difTemp        = depContableAnual - depTributariaAnual;
  const activoDiferido = difTemp < 0 ? Math.abs(difTemp) * 0.27 : 0;
  const pasivoDiferido = difTemp > 0 ? difTemp * 0.27 : 0;

  const sinActivos = activos.length === 0;
  const sinValores = activos.length > 0 && depContableAnual === 0 && depTributariaAnual === 0;

  return (
    <div className="glass-card rounded-xl overflow-hidden">
      <div className="bg-gradient-to-r from-indigo-700 to-indigo-600 px-4 py-3 flex items-center justify-between">
        <div>
          <p className="text-white font-black text-sm">Impuesto Diferido — NIC 12</p>
          <p className="text-indigo-200 text-xs">Diferencias temporarias imponibles y deducibles</p>
        </div>
        <span className="px-3 py-1 bg-white/20 text-white text-xs font-semibold rounded-full">
          {activos.length} activo{activos.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Aviso sin activos registrados */}
      {sinActivos && (
        <div className="px-4 py-6 text-center">
          <p className="text-slate-400 text-sm font-semibold">No hay activos registrados en el módulo de Activos Fijos.</p>
          <p className="text-slate-400 text-xs mt-1">Agrega activos con valor de compra y vida útil para calcular diferencias temporarias.</p>
        </div>
      )}

      {/* Aviso activos sin valor */}
      {sinValores && (
        <div className="px-4 py-4">
          <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl">
            <svg className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            <p className="text-xs text-amber-700 font-semibold">
              Hay {activos.length} activo{activos.length !== 1 ? "s" : ""} registrado{activos.length !== 1 ? "s" : ""}, pero ninguno tiene valor de compra ingresado. Edítalos en el módulo de Activos Fijos para calcular las diferencias.
            </p>
          </div>
        </div>
      )}

      {/* Tabla resumen */}
      {!sinActivos && !sinValores && (
        <>
          <table className="w-full">
            <tbody>
              <FilaTrib label="Depreciación contable anual (flota)" valor={depContableAnual} />
              <FilaTrib label={`Depreciación tributaria anual (SII)`} valor={depTributariaAnual} indent colorValor="text-emerald-600" />
              <FilaTrib separador />
              <FilaTrib label="Diferencia temporaria neta"
                valor={Math.abs(difTemp)}
                negrita
                colorValor={difTemp !== 0 ? "text-amber-600" : "text-slate-400"} />
              <FilaTrib separador />
              {activoDiferido > 0 && (
                <FilaTrib label="Activo por impuesto diferido (27%)" valor={activoDiferido} negrita colorValor="font-black text-emerald-600" />
              )}
              {pasivoDiferido > 0 && (
                <FilaTrib label="Pasivo por impuesto diferido (27%)" valor={pasivoDiferido} negrita colorValor="font-black text-red-600" />
              )}
              {difTemp === 0 && (
                <FilaTrib label="Sin diferencias temporarias" valor={0} colorValor="text-slate-300" />
              )}
            </tbody>
          </table>

          {/* Detalle por activo */}
          {detalle.length > 0 && (
            <div className="border-t border-slate-100">
              <div className="px-4 py-2 bg-slate-50">
                <p className="text-xs font-black text-slate-500 uppercase tracking-wider">Detalle por activo</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      <th className="px-4 py-2 text-left font-bold text-slate-500">Activo</th>
                      <th className="px-4 py-2 text-center font-bold text-slate-500">V. Útil Cont.</th>
                      <th className="px-4 py-2 text-center font-bold text-slate-500">V. Útil Trib. SII</th>
                      <th className="px-4 py-2 text-right font-bold text-slate-500">Dep. Contable</th>
                      <th className="px-4 py-2 text-right font-bold text-slate-500">Dep. Tributaria</th>
                      <th className="px-4 py-2 text-right font-bold text-slate-500">Diferencia</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {detalle.map((d, i) => (
                      <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-slate-50/40"}>
                        <td className="px-4 py-2 font-semibold text-slate-700 max-w-[180px] truncate">{d.nombre}</td>
                        <td className="px-4 py-2 text-center text-slate-500">{d.vidaC > 0 ? `${d.vidaC} años` : "—"}</td>
                        <td className="px-4 py-2 text-center text-slate-500">{d.vidaT} años</td>
                        <td className="px-4 py-2 text-right font-semibold text-slate-700">{fmt(d.depC)}</td>
                        <td className="px-4 py-2 text-right font-semibold text-emerald-700">{fmt(d.depT)}</td>
                        <td className={`px-4 py-2 text-right font-bold ${d.dif > 0 ? "text-red-600" : d.dif < 0 ? "text-emerald-600" : "text-slate-300"}`}>
                          {d.dif !== 0 ? fmt(Math.abs(d.dif)) : "—"}
                          {d.dif > 0 && <span className="ml-1 text-[10px]">▲</span>}
                          {d.dif < 0 && <span className="ml-1 text-[10px]">▼</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-indigo-50 border-t-2 border-indigo-200">
                      <td className="px-4 py-2 font-black text-slate-800" colSpan={3}>TOTAL</td>
                      <td className="px-4 py-2 text-right font-black text-slate-800">{fmt(depContableAnual)}</td>
                      <td className="px-4 py-2 text-right font-black text-emerald-700">{fmt(depTributariaAnual)}</td>
                      <td className={`px-4 py-2 text-right font-black ${difTemp > 0 ? "text-red-700" : difTemp < 0 ? "text-emerald-700" : "text-slate-300"}`}>
                        {difTemp !== 0 ? fmt(Math.abs(difTemp)) : "—"}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <div className="px-4 py-3 bg-indigo-50 border-t border-indigo-100">
                <p className="text-xs text-indigo-600 font-semibold">
                  Vida útil tributaria según tabla SII: Maquinaria 10 años · Vehículo 7 años · Herramienta 3 años · Otro 5 años.
                  Las diferencias generan {pasivoDiferido > 0 ? "un pasivo" : "un activo"} por impuesto diferido bajo NIC 12.
                </p>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function ContabilidadTributario() {
  const { cuentas, asientos, saldos, periodoActivo } = useContabilidad();
  const saldosMap = saldos();
  const [vistaActiva, setVistaActiva] = useState("f29");

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

      {vistaActiva === "f29"  && <FormularioF29 cuentas={cuentas} saldosMap={saldosMap} periodoActivo={periodoActivo} />}
      {vistaActiva === "ppm"  && <ModuloPPM cuentas={cuentas} saldosMap={saldosMap} asientos={asientos} periodoActivo={periodoActivo} />}
      {vistaActiva === "f22"  && <FormularioF22 cuentas={cuentas} saldosMap={saldosMap} />}
      {vistaActiva === "dift" && <ImpuestoDiferido cuentas={cuentas} saldosMap={saldosMap} />}
    </div>
  );
}
