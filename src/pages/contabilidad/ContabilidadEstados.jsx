import React, { useState, useMemo } from "react";
import { useContabilidad, TIPOS_CUENTA, TIPOS_MAP, PeriodoSelector, MESES } from "./ContabilidadContext";
import { ModalExportEstados } from "./ContabilidadExportPDF";
import {
  Cifra, Titulo, Hoja, LineaGuia, Nota, Boton, Pestanas, FechaHoja, IconoDocumento,
} from "../finanzas/cuaderno";

// ─── Piezas de presentación ───────────────────────────────────────────────────
// Cada informe es una hoja del cuaderno: título en letra ligada, a la derecha el
// período y la norma, y debajo los renglones con sus cifras en casillas.
function Informe({ titulo, subtitulo, norma, periodo, children }) {
  const [anio, mes] = periodo ? periodo.split("-") : ["",""];
  const mesLabel = mes ? MESES[parseInt(mes)-1] : "";
  return (
    <Hoja titulo={titulo}
      extra={
        <div className="text-right">
          <p className="m-0 text-[18px] text-cuaderno-tinta">{mesLabel} {anio}</p>
          <p className="m-0 text-[14px] text-cuaderno-grafito">{norma} · generado el {new Date().toLocaleDateString("es-CL")}</p>
        </div>
      }>
      <p className="m-0 mb-3 text-[16px] text-cuaderno-grafito">{subtitulo}</p>
      {children}
    </Hoja>
  );
}

/** Resumen del informe: concepto ······· cifra, con una nota menor debajo. */
function Resumen({ filas }) {
  return (
    <Hoja titulo="Resumen">
      <div className="grid gap-x-10 sm:grid-cols-2">
        {filas.map(f => (
          <div key={f.etiqueta}>
            <LineaGuia etiqueta={f.etiqueta}>
              <Cifra valor={f.valor} escala="pesos" vacio="$0" raya={f.raya || "ninguna"} />
            </LineaGuia>
            {f.nota && <p className="m-0 -mt-1 mb-1 text-right text-[13px] text-cuaderno-grafito">{f.nota}</p>}
          </div>
        ))}
      </div>
    </Hoja>
  );
}

// Renglones de un estado: concepto a la izquierda, cifra a la derecha.
function Seccion({ etiqueta }) {
  return (
    <tr>
      <td colSpan={2} className="pt-4 pb-1">
        <Titulo as="h3" tamano="sm">{etiqueta}</Titulo>
      </td>
    </tr>
  );
}

function Subseccion({ etiqueta }) {
  return (
    <tr>
      <td colSpan={2} className="pt-3 pb-0.5 text-[15px] text-cuaderno-grafito">{etiqueta}</td>
    </tr>
  );
}

function Renglon({ etiqueta, valor, nivel = 1, raya = "ninguna", vacio = "0", children }) {
  const conRaya = raya !== "ninguna";
  return (
    <tr className={conRaya ? "" : "border-b border-cuaderno-renglon"}>
      <td className={`py-1.5 pr-3 text-[17px] ${nivel === 0 ? "text-cuaderno-tinta" : "text-cuaderno-tinta/90"}`}
        style={{ paddingLeft: `${nivel * 18}px` }}>
        {etiqueta}
        {children}
      </td>
      <td className={`py-1.5 text-right text-[17px] ${conRaya ? "pt-2.5" : ""}`}>
        <Cifra valor={valor} escala="pesos" raya={raya} vacio={vacio} />
      </td>
    </tr>
  );
}

function RenglonVacio({ children }) {
  return (
    <tr className="border-b border-cuaderno-renglon">
      <td colSpan={2} className="py-1.5 pl-[18px] text-[15px] text-cuaderno-grafito">{children}</td>
    </tr>
  );
}

function Espacio() {
  return <tr aria-hidden="true"><td colSpan={2} className="h-2 p-0" /></tr>;
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
      const esRes = tipo?.grupo === "RESULTADO";
      // En un balance de 8 columnas la cuenta se clasifica por la naturaleza de
      // su SALDO, no por el tipo que tenga asignado: saldo deudor va a Activo,
      // saldo acreedor va a Pasivo. Antes se exigía que coincidieran, así que
      // una cuenta de activo con saldo acreedor —Depreciación Acumulada, un
      // banco sobregirado— no entraba en ninguna columna y el balance no cerraba.
      return {
        ...c, s, sDeudor, sAcreedor, tipo,
        esfActivo:  esRes ? 0 : sDeudor,
        esfPasivo:  esRes ? 0 : sAcreedor,
        erpLoss:    esRes ? sDeudor   : 0,
        erpGain:    esRes ? sAcreedor : 0,
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

  const GRUPOS = ["Sumas", "Saldos", "E.S.F.", "E.R.P."];
  const COLUMNAS = ["Debe", "Haber", "Deudor", "Acreedor", "Activo", "Pasivo", "Pérdida", "Ganancia"];

  return (
    <Informe titulo="Balance de comprobación, 8 columnas"
      subtitulo="Sumas · Saldos · Estado de Situación · Estado de Resultados"
      norma="NIC 1 / IFRS" periodo={periodo}>
      {activas.length === 0 ? (
        <div className="py-12 text-center space-y-2">
          <p className="m-0 font-ligada font-light text-[22px] leading-[1.6]">Aún no hay movimientos en el período</p>
          <p className="m-0 text-[16px] text-cuaderno-grafito">Las cuentas aparecen aquí apenas tengan asientos en el Libro Diario.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] border-collapse">
            <thead>
              <tr>
                <th className="w-[90px]" />
                <th />
                {GRUPOS.map((g, i) => (
                  <th key={g} colSpan={2}
                    className={`font-normal text-[15px] text-center text-cuaderno-tinta px-2 pt-1 pb-0.5 ${i > 0 ? "border-l border-cuaderno-renglon" : "border-l border-cuaderno-columna"}`}>
                    {g}
                  </th>
                ))}
              </tr>
              <tr className="shadow-[inset_0_-1.5px_0_rgb(var(--cuaderno-tinta))]">
                <th className="font-normal text-[15px] text-left text-cuaderno-grafito px-2 py-2">Código</th>
                <th className="font-normal text-[15px] text-left text-cuaderno-grafito px-2 py-2">Cuenta</th>
                {COLUMNAS.map((c, i) => (
                  <th key={c}
                    className={`font-normal text-[15px] text-right text-cuaderno-grafito px-2 py-2 whitespace-nowrap ${i % 2 === 0 ? (i === 0 ? "border-l border-cuaderno-columna" : "border-l border-cuaderno-renglon") : ""}`}>
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {activas.map(f => (
                <tr key={f.id} className="border-b border-cuaderno-renglon">
                  <td className="px-2 py-1.5 text-[15px] text-cuaderno-grafito whitespace-nowrap">{f.codigo}</td>
                  <td className="px-2 py-1.5 text-[16px] max-w-[220px] truncate">{f.nombre}</td>
                  {[f.s.debe, f.s.haber, f.sDeudor, f.sAcreedor, f.esfActivo, f.esfPasivo, f.erpLoss, f.erpGain].map((v, j) => (
                    <td key={j}
                      className={`px-2 py-1.5 text-right text-[16px] ${j % 2 === 0 ? (j === 0 ? "border-l border-cuaderno-columna" : "border-l border-cuaderno-renglon") : ""}`}>
                      {v > 0 && <Cifra valor={v} escala="pesos" />}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2} className="px-2 pt-3 pb-2 text-[17px]">Totales</td>
                {[tot.debe,tot.haber,tot.sDeudor,tot.sAcreedor,tot.esfActivo,tot.esfPasivo,tot.erpLoss,tot.erpGain].map((v,i)=>(
                  <td key={i} className="px-2 pt-3 pb-2 text-right text-[16px]">
                    <Cifra valor={v} escala="pesos" raya="total" vacio="0" />
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </Informe>
  );
}

// ─── Estado de Situación Financiera ──────────────────────────────────────────
function ESF({ cuentas, saldosMap, saldosAnioMap = {}, periodo }) {
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

    // ── Resultados como componente del patrimonio ──
    // Mientras no exista asiento de cierre, TODO el resultado histórico sigue
    // vivo en las cuentas de resultado. Para que A = P + Patrimonio se cumpla,
    // el patrimonio tiene que incorporarlo completo; se separa en dos líneas
    // para que se lea cuál corresponde al ejercicio en curso.
    const cuentasRes = cuentas.filter(c => ["costo","gasto_adm","gasto_fin","otro_resultado","ingreso"].includes(c.tipo) && c.activa !== false);
    const resultadoDe = (mapa) => cuentasRes.reduce((acc, c) => {
      const s = mapa[c.id] || { debe: 0, haber: 0 };
      const tipo = TIPOS_MAP[c.tipo];
      return acc + (tipo?.signo === 1 ? -(s.debe - s.haber) : (s.haber - s.debe));
    }, 0);
    const resultadoHistorico = resultadoDe(saldosMap);      // todos los ejercicios
    const resultadoEjercicio = resultadoDe(saldosAnioMap);  // año en curso
    const resultadoAnterior  = resultadoHistorico - resultadoEjercicio;
    const resultadoPeriodo   = resultadoEjercicio;          // el que se destaca en KPI

    const totalAC  = activoC.reduce((s,c)=>s+c.saldo,0);
    const totalANC = activoNC.reduce((s,c)=>s+c.saldo,0);
    const totalPC  = pasivoC.reduce((s,c)=>s+c.saldo,0);
    const totalPNC = pasivoNC.reduce((s,c)=>s+c.saldo,0);
    const totalPat = patrimonio.reduce((s,c)=>s+c.saldo,0) + resultadoHistorico;
    const totalA   = totalAC + totalANC;
    const totalP   = totalPC + totalPNC + totalPat;
    const diff     = Math.abs(totalA - totalP);

    return { activoC, activoNC, pasivoC, pasivoNC, patrimonio,
             resultadoPeriodo, resultadoEjercicio, resultadoAnterior, resultadoHistorico,
             totalAC, totalANC, totalPC, totalPNC, totalPat, totalA, totalP, diff };
  }, [cuentas, saldosMap, saldosAnioMap]);

  const resumen = [
    { etiqueta: "Total activos",     valor: data.totalA,                 nota: "Activos netos del período" },
    { etiqueta: "Pasivos totales",   valor: data.totalPC + data.totalPNC, nota: "Obligaciones vigentes" },
    { etiqueta: "Patrimonio neto",   valor: data.totalPat,               nota: "Capital + Resultados" },
    { etiqueta: "Resultado período", valor: data.resultadoPeriodo,       nota: "Utilidad / (Pérdida)", raya: "doble" },
  ];

  return (
    <div className="space-y-5">
      <Resumen filas={resumen} />

      <Informe titulo="Estado de Situación Financiera"
        subtitulo="Balance General — Posición patrimonial al cierre del período"
        norma="NIC 1 / IFRS" periodo={periodo}>
        <div className="grid gap-x-10 gap-y-4 md:grid-cols-2">
          {/* Activos */}
          <table className="w-full border-collapse self-start">
            <tbody>
              <Seccion etiqueta="Activos" />
              <Subseccion etiqueta="Activo corriente" />
              {data.activoC.map(c => <Renglon key={c.id} etiqueta={c.nombre} valor={c.saldo} />)}
              <Renglon etiqueta="Total activo corriente" valor={data.totalAC} nivel={0} raya="total" />
              <Espacio />
              <Subseccion etiqueta="Activo no corriente" />
              {data.activoNC.length === 0 && <RenglonVacio>Sin activos no corrientes registrados</RenglonVacio>}
              {data.activoNC.map(c => <Renglon key={c.id} etiqueta={c.nombre} valor={c.saldo} />)}
              <Renglon etiqueta="Total activo no corriente" valor={data.totalANC} nivel={0} raya="total" />
              <Espacio />
              <Renglon etiqueta="Total activos" valor={data.totalA} nivel={0} raya="doble" />
            </tbody>
          </table>

          {/* Pasivos + Patrimonio */}
          <div className="self-start">
            <table className="w-full border-collapse">
              <tbody>
                <Seccion etiqueta="Pasivos y Patrimonio" />
                <Subseccion etiqueta="Pasivo corriente" />
                {data.pasivoC.map(c => <Renglon key={c.id} etiqueta={c.nombre} valor={c.saldo} />)}
                <Renglon etiqueta="Total pasivo corriente" valor={data.totalPC} nivel={0} raya="total" />
                <Espacio />
                <Subseccion etiqueta="Pasivo no corriente" />
                {data.pasivoNC.length === 0 && <RenglonVacio>Sin pasivos no corrientes</RenglonVacio>}
                {data.pasivoNC.map(c => <Renglon key={c.id} etiqueta={c.nombre} valor={c.saldo} />)}
                <Renglon etiqueta="Total pasivo no corriente" valor={data.totalPNC} nivel={0} raya="total" />
                <Espacio />
                <Subseccion etiqueta="Patrimonio" />
                {data.patrimonio.map(c => <Renglon key={c.id} etiqueta={c.nombre} valor={c.saldo} />)}
                {data.resultadoAnterior !== 0 && (
                  <Renglon etiqueta="Resultados acumulados ejercicios anteriores" valor={data.resultadoAnterior} />
                )}
                <Renglon etiqueta="Resultado del ejercicio" valor={data.resultadoEjercicio} />
                <Renglon etiqueta="Total patrimonio" valor={data.totalPat} nivel={0} raya="total" />
                <Espacio />
                <Renglon etiqueta="Total pasivos + patrimonio" valor={data.totalP} nivel={0} raya="doble" />
              </tbody>
            </table>
            {data.diff > 1 && (
              <div className="mt-4 space-y-1">
                <Nota etiqueta="Ojo:">
                  Balance descuadrado en <Cifra valor={data.diff} escala="pesos" color="heredar" /> — este informe no es válido.
                </Nota>
                <p className="m-0 text-[15px] leading-snug text-cuaderno-grafito">
                  Activo debe igualar Pasivo más Patrimonio. Revisa el Libro Diario en busca de
                  asientos con debe distinto de haber, o de cuentas sin saldo de apertura.
                  No emitas este estado a terceros hasta cerrar la diferencia.
                </p>
              </div>
            )}
          </div>
        </div>
      </Informe>
    </div>
  );
}

// ─── Estado de Resultados ─────────────────────────────────────────────────────
function ERP({ cuentas, saldosMap, periodo, tasaImpuesto = 0.27 }) {
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

    // El resultado que se informa es ANTES de impuesto, porque es el que está
    // efectivamente contabilizado y el mismo que el ESF lleva a patrimonio.
    // Antes se restaba acá un impuesto estimado que no generaba asiento y no
    // existía en el balance: los dos estados publicaban utilidades distintas
    // para el mismo período. La estimación se mantiene, pero como memo.
    const margenNeto     = totalIng > 0 ? ((utilAntes/totalIng)*100).toFixed(1) : "—";
    const impuestoEstim  = Math.max(0, utilAntes * tasaImpuesto);
    const utilDespuesEst = utilAntes - impuestoEstim;

    return { ingresos, costos, gastosAdm, gastosFin, otrosRes, totalIng, totalCosto,
             utilBruta, margenBruto, totalGAdm, utilOp, margenOp,
             totalGFin, totalOtros, utilAntes, margenNeto,
             impuestoEstim, utilDespuesEst, tasaImpuesto };
  }, [cuentas, saldosMap, tasaImpuesto]);

  const resumen = [
    { etiqueta: "Ingresos",               valor: data.totalIng,  nota: "Ingresos totales del período" },
    { etiqueta: "Utilidad bruta",         valor: data.utilBruta, nota: `Margen bruto: ${data.margenBruto}%` },
    { etiqueta: "Resultado operacional",  valor: data.utilOp,    nota: `Margen oper.: ${data.margenOp}%` },
    { etiqueta: "Resultado antes de imp.", valor: data.utilAntes, nota: `Margen: ${data.margenNeto}%`, raya: "doble" },
  ];

  const Margen = ({ valor }) => valor !== "—"
    ? <span className="ml-2 text-[14px] text-cuaderno-grafito">(margen {valor}%)</span>
    : null;

  return (
    <div className="space-y-5">
      <Resumen filas={resumen} />

      <Informe titulo="Estado de Resultados del Período"
        subtitulo="Rendimiento económico — Base devengada"
        norma="NIC 1 / IFRS — Art. 29–33 LIR" periodo={periodo}>
        <div className="max-w-2xl">
          <table className="w-full border-collapse">
            <tbody>
              <Seccion etiqueta="Ingresos de actividades ordinarias" />
              {data.ingresos.length===0 && <RenglonVacio>Sin ingresos registrados en el período</RenglonVacio>}
              {data.ingresos.map(c => <Renglon key={c.id} etiqueta={c.nombre} valor={c.saldo} />)}
              <Renglon etiqueta="Total ingresos" valor={data.totalIng} nivel={0} raya="total" />

              <Seccion etiqueta="Costo de ventas" />
              {data.costos.map(c => <Renglon key={c.id} etiqueta={c.nombre} valor={c.saldo} />)}
              <Renglon etiqueta="Total costo de ventas" valor={data.totalCosto} nivel={0} raya="total" />
              <Espacio />
              <Renglon etiqueta="Utilidad bruta" valor={data.utilBruta} nivel={0} raya="total">
                <Margen valor={data.margenBruto} />
              </Renglon>

              <Seccion etiqueta="Gastos de administración y ventas" />
              {data.gastosAdm.map(c => <Renglon key={c.id} etiqueta={c.nombre} valor={c.saldo} />)}
              <Renglon etiqueta="Total gastos administración" valor={data.totalGAdm} nivel={0} raya="total" />
              <Espacio />
              <Renglon etiqueta="Resultado operacional" valor={data.utilOp} nivel={0} raya="total">
                <Margen valor={data.margenOp} />
              </Renglon>

              {(data.gastosFin.length > 0 || data.otrosRes.length > 0) && (
                <>
                  <Seccion etiqueta="Gastos financieros y otros" />
                  {data.gastosFin.map(c => <Renglon key={c.id} etiqueta={c.nombre} valor={c.saldo} />)}
                  {data.otrosRes.map(c => <Renglon key={c.id} etiqueta={c.nombre} valor={c.saldo} />)}
                </>
              )}

              <Espacio />
              <Espacio />
              <Renglon etiqueta="Resultado del período (antes de impuesto)" valor={data.utilAntes} nivel={0} raya="doble" />
            </tbody>
          </table>

          {/* Estimación tributaria — informativa, fuera de los estados */}
          <div className="mt-6 pt-3 border-t border-dashed border-cuaderno-columna">
            <Titulo as="h3" tamano="sm">Estimación tributaria, no contabilizada</Titulo>
            <LineaGuia etiqueta={`Impuesto 1ª Categoría estimado (${(data.tasaImpuesto * 100).toFixed(1).replace(".", ",")}%)`}>
              <Cifra valor={data.impuestoEstim} escala="pesos" vacio="0" />
            </LineaGuia>
            <LineaGuia etiqueta="Resultado después del impuesto estimado">
              <Cifra valor={data.utilDespuesEst} escala="pesos" vacio="0" />
            </LineaGuia>
            <p className="m-0 mt-2 text-[15px] leading-snug text-cuaderno-grafito">
              Cálculo referencial sobre la utilidad financiera. El impuesto efectivo se determina
              sobre la Renta Líquida Imponible en el F22 y no está registrado en asientos, por eso
              no forma parte del resultado ni del patrimonio informados.
            </p>
          </div>
        </div>
      </Informe>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function ContabilidadEstados() {
  const { cuentas, saldosPeriodo, saldosAcumulados, saldosAnio, periodoActivo, tasaPrimeraCategoria } = useContabilidad();
  const [vistaActiva, setVistaActiva] = useState("esf");
  const [showExport, setShowExport]   = useState(false);
  // Cada informe pide el saldo que le corresponde:
  //  · ESF y Balance de Comprobación → ACUMULADO hasta el corte (saldos de balance)
  //  · Estado de Resultados          → MOVIMIENTOS del período (flujos del mes)
  const saldosAcum   = saldosAcumulados();
  const saldosMes    = saldosPeriodo();
  const saldosDelAnio = saldosAnio();

  const VISTAS = [
    { id: "balance8", label: "Balance 8 col."        },
    { id: "esf",      label: "Estado de Situación"   },
    { id: "erp",      label: "Estado de Resultados"  },
  ];

  return (
    <div className="cuaderno px-8 pt-5 pb-10 space-y-5">
      <FechaHoja />

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Titulo>Estados Financieros</Titulo>
          <p className="m-0 text-[17px] text-cuaderno-grafito">Calculados en tiempo real desde los asientos del período</p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <PeriodoSelector />
          <Boton variante="primario" onClick={() => setShowExport(true)}>
            <IconoDocumento tamano={15} /> Exportar PDF
          </Boton>
        </div>
      </header>

      <Pestanas opciones={VISTAS} valor={vistaActiva} onCambiar={setVistaActiva} />

      {vistaActiva === "balance8" && <Balance8Col cuentas={cuentas} saldosMap={saldosAcum} periodo={periodoActivo} />}
      {vistaActiva === "esf"      && <ESF cuentas={cuentas} saldosMap={saldosAcum} saldosAnioMap={saldosDelAnio} periodo={periodoActivo} />}
      {vistaActiva === "erp"      && <ERP cuentas={cuentas} saldosMap={saldosMes} periodo={periodoActivo} tasaImpuesto={tasaPrimeraCategoria} />}

      <ModalExportEstados
        isOpen={showExport}
        onClose={() => setShowExport(false)}
        vistaActiva={vistaActiva}
      />
    </div>
  );
}
