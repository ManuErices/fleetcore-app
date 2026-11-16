import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { collection, getDocs, query, where, orderBy } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { fechaISO, hoyISO, mesActualISO } from "../../lib/fechas";
import { costoOC, mesSubcontrato } from "../../lib/costosObra";
import { costoDelMesEnPesos, costoVigenteEnMes, sumarMesesClave } from "../../lib/finanzas/costosFijos.js";
import { useEmpresa } from "../../lib/useEmpresa";
import { useFinanzas, ProyectoSelector } from "./FinanzasContext";
import { cargarIngresosDelFlujo, cuentaEsDeObra } from "../../lib/finanzas/ingresos.js";
import { obtenerIndicadores, aPesos } from "../../lib/finanzas/monedas.js";
import {
  Cifra, Hoja, Titulo, LineaGuia, Boton, Campo, Resaltado, Nota, FechaHoja,
  GraficoBarras, GraficoLinea, BarraProporcion, casoOracion, casoTitulo,
} from "./cuaderno";

// ─── Utilidades ───────────────────────────────────────────────────────────────
const fmt  = (n) => "$" + Math.round(n || 0).toLocaleString("es-CL");
const fmtM = (n) => {
  if (!n && n !== 0) return "$0";
  if (Math.abs(n) >= 1000000) return "$" + (n / 1000000).toFixed(1).replace(".", ",") + "M";
  return "$" + Math.round(n).toLocaleString("es-CL");
};
const MESES = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
const MESES_FULL = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

// Mes "AAAA-MM" de una fecha "AAAA-MM-DD" (o Timestamp), en hora de Chile.
function mesKey(fecha) {
  if (!fecha) return null;
  const iso = typeof fecha === "string" ? fecha : fechaISO(fecha);
  return /^\d{4}-\d{2}/.test(iso || "") ? iso.slice(0, 7) : null;
}
function parseFecha(f) {
  if (!f) return null;
  if (f?.toDate) return f.toDate();
  const d = new Date(f.includes("T") ? f : f + "T12:00:00");
  return isNaN(d) ? null : d;
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function FinanzasReportes() {
  const { proyectoId, proyecto } = useFinanzas();
  const [indicadores, setIndicadores] = useState(null);
  const { empresaId } = useEmpresa();
  const [loading, setLoading]   = useState(true);
  const [anio, setAnio]         = useState(Number(hoyISO().slice(0, 4)));
  const [rawData, setRawData]   = useState({ ingresos: [], egresos: [], costosFijos: [], proveedores: [] });
  const [exporting, setExporting] = useState(false);
  const reportRef = useRef(null);

  const cargar = useCallback(async () => {
    if (!empresaId) { setLoading(false); return; }
    setLoading(true);
    const resultado = { ingresos: [], egresos: [], costosFijos: [], proveedores: [] };

    // 1. Ingresos: de las cuentas de ingreso del flujo de caja, donde se anotan.
    //    (Antes se leía finanzas_ingresos, que nunca se llenó.) Con un proyecto
    //    elegido, solo las cuentas de esa obra.
    try {
      const { porCuenta } = await cargarIngresosDelFlujo(empresaId);
      porCuenta
        .filter(({ cuenta }) => proyectoId === "todos" || (proyecto && cuentaEsDeObra(cuenta, proyecto)))
        .forEach(({ porMes }) => Object.entries(porMes).forEach(([mes, monto]) => resultado.ingresos.push({ mes, monto })));
    } catch (e) { console.warn("Sin ingresos del flujo:", e); }
    try { setIndicadores(await obtenerIndicadores(empresaId)); } catch (e) {}

    // 2. Egresos: rendiciones
    try {
      const snap = await getDocs(collection(db, "empresas", empresaId, "rendiciones"));
      snap.docs.forEach(d => {
        const r = d.data();
        if (proyectoId !== "todos" && r.projectId !== proyectoId) return;
        resultado.egresos.push({
          fuente: "rendicion", monto: parseFloat(r.montoAprobado) || 0,
          mes: mesKey(r.fechaEmision || r.fechaAprobacion),
          proveedor: r.proveedor || "", projectId: r.projectId || "",
        });
        if (r.proveedor) resultado.proveedores.push({ nombre: r.proveedor, monto: parseFloat(r.montoAprobado) || 0 });
      });
    } catch (e) {}

    // 3. Egresos: subcontratos
    try {
      const snap = await getDocs(collection(db, "empresas", empresaId, "subcontratos"));
      snap.docs.forEach(d => {
        const s = d.data();
        if (proyectoId !== "todos" && s.projectId !== proyectoId) return;
        // Costo = monto bruto del EP en el mes asociado al trabajo (costosObra.js).
        // Antes: saldo por pagar del contrato, repetido en cada línea de EP.
        const monto = parseFloat(s.montoEP) || 0;
        const mes = mesSubcontrato(s) || mesKey(s.createdAt);
        resultado.egresos.push({ fuente: "subcontrato", monto, mes, proveedor: s.razonSocialSubcontratista || "", projectId: s.projectId || "" });
        if (s.razonSocialSubcontratista) resultado.proveedores.push({ nombre: s.razonSocialSubcontratista, monto });
      });
    } catch (e) {}

    // 4. Egresos: órdenes de compra
    try {
      const snap = await getDocs(collection(db, "empresas", empresaId, "purchaseOrders"));
      snap.docs.forEach(d => {
        const o = d.data();
        if (proyectoId !== "todos" && o.projectId !== proyectoId) return;
        const monto = costoOC(o);   // lo facturado, no lo comprometido
        resultado.egresos.push({ fuente: "oc", monto, mes: mesKey(o.fecha), proveedor: o.proveedor || "", projectId: o.projectId || "" });
        if (o.proveedor) resultado.proveedores.push({ nombre: o.proveedor, monto });
      });
    } catch (e) {}

    // 5. Costos fijos (globales, no filtrar por proyecto)
    try {
      const snap = await getDocs(collection(db, "empresas", empresaId, "costos_fijos"));
      snap.docs.forEach(d => resultado.costosFijos.push({ ...d.data(), id: d.id }));
    } catch (e) {}

    setRawData(resultado);
    setLoading(false);
  }, [empresaId, proyectoId, proyecto]);

  useEffect(() => { cargar(); }, [cargar]);

  // Costos fijos de un mes, en pesos: solo los que corren ese mes (ya
  // empezaron y no terminaron, costosFijos.js). Si está en UF o dólares y no
  // hay valor del día, vale 0 (mejor fuera que mal sumado).
  const cfDelMes = useCallback((c, mes) => costoDelMesEnPesos(c, mes, indicadores) ?? 0, [indicadores]);
  const cfTotalMes = useCallback((mes) => rawData.costosFijos.reduce((s, c) => s + cfDelMes(c, mes), 0), [rawData, cfDelMes]);
  const mesHoy = mesActualISO();

  // ── Datos por mes del año seleccionado ────────────────────────────────────
  const mesesData = useMemo(() => {
    return Array.from({ length: 12 }, (_, m) => {
      const key = `${anio}-${String(m + 1).padStart(2, "0")}`;
      const ing = rawData.ingresos
        .filter(i => i.mes === key)
        .reduce((s, i) => s + (i.monto || 0), 0);
      const egr = rawData.egresos
        .filter(e => e.mes === key)
        .reduce((s, e) => s + e.monto, 0);
      // costos fijos que corren ese mes
      const cfMes = cfTotalMes(key);
      const totalEgr = egr + cfMes;
      return { mes: m, key, label: MESES[m], ingresos: ing, egresos: totalEgr, margen: ing - totalEgr, costosFijos: cfMes, egresosVar: egr };
    });
  }, [rawData, anio, cfTotalMes]);

  // ── Proyección próximos 6 meses ───────────────────────────────────────────
  const proyeccion = useMemo(() => {
    const promIngresos = mesesData.filter(m => m.ingresos > 0).reduce((s, m) => s + m.ingresos, 0) / (mesesData.filter(m => m.ingresos > 0).length || 1);
    const promEgresos  = mesesData.filter(m => m.egresos > 0).reduce((s, m) => s + m.egresos, 0)  / (mesesData.filter(m => m.egresos > 0).length || 1);
    return Array.from({ length: 6 }, (_, i) => {
      const key = sumarMesesClave(mesHoy, i + 1);
      const [a, m] = key.split("-").map(Number);
      const cfFijo = cfTotalMes(key);   // los que terminan dejan de sumar
      return {
        label: MESES[m - 1],
        mes: MESES_FULL[m - 1] + " " + a,
        ingresos: promIngresos,
        egresos: Math.max(promEgresos, cfFijo),
        costosFijos: cfFijo,
        value: promIngresos - Math.max(promEgresos, cfFijo),
      };
    });
  }, [mesesData, cfTotalMes, mesHoy]);

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
    // Costos fijos del mes en curso (los terminados o por empezar no cuentan)
    rawData.costosFijos.forEach(c => {
      const cat = c.categoria || "otro";
      const mensual = cfDelMes(c, mesHoy);
      if (!mensual) return;
      mapa[cat] = (mapa[cat] || 0) + mensual;
    });
    return Object.entries(mapa).sort((a, b) => b[1] - a[1]);
  }, [rawData, cfDelMes, mesHoy]);

  const totalCF  = useMemo(() => cfPorCategoria.reduce((s, [, v]) => s + v, 0), [cfPorCategoria]);
  const totalVar = useMemo(() => rawData.egresos.filter(e => String(e.mes || "").startsWith(`${anio}-`)).reduce((s, e) => s + e.monto, 0), [rawData, anio]);

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
    <div className="cuaderno flex items-center justify-center h-64 text-[18px] text-cuaderno-grafito">Preparando el informe…</div>
  );

  const pctIng = (m) => m.ingresos > 0 ? ((m.margen / m.ingresos) * 100).toFixed(1).replace(".", ",") + "%" : "—";

  return (
    <div className="cuaderno px-8 pt-5 pb-10 space-y-5" ref={reportRef}>

      <FechaHoja className="no-print" />

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Titulo>Informe del año {anio}</Titulo>
          <p className="m-0 text-[17px] text-cuaderno-grafito">Resultados mes a mes, proveedores, costos y una proyección de referencia.</p>
        </div>
        <div className="flex flex-wrap items-end gap-3 no-print">
          <ProyectoSelector variante="cuaderno" />
          <Campo as="select" etiqueta="Año" value={anio} onChange={e => setAnio(Number(e.target.value))}>
            {anios.map(a => <option key={a} value={a}>{a}</option>)}
          </Campo>
          <Boton variante="primario" onClick={exportPDF} disabled={exporting}>
            {exporting ? "Preparando…" : "Imprimir o guardar en PDF"}
          </Boton>
        </div>
      </header>

      {/* ── 1. Resultados del año ── */}
      <Hoja titulo={`1. Resultados de ${anio}`}
        extra={
          <div className="flex items-center gap-4 text-[15px]">
            <Resaltado color="menta">ingresos</Resaltado>
            <Resaltado color="rosa">egresos</Resaltado>
          </div>
        }>
        <div className="grid gap-x-12 gap-y-4 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)]">
          <div>
            <LineaGuia etiqueta="Ingresos"><Cifra valor={totalIngresos} escala="pesos" color="tinta" vacio="$0" /></LineaGuia>
            <LineaGuia etiqueta="Egresos"><Cifra valor={-totalEgresos} escala="pesos" vacio="$0" /></LineaGuia>
            <LineaGuia etiqueta="Margen"><Cifra valor={margenTotal} escala="pesos" vacio="$0" raya="doble" /></LineaGuia>
            <LineaGuia etiqueta="Margen sobre ingresos">
              <span>{totalIngresos > 0 ? ((margenTotal / totalIngresos) * 100).toFixed(1).replace(".", ",") + "%" : "—"}</span>
            </LineaGuia>
          </div>
          <GraficoBarras data={mesesData.map(m => ({ label: m.label, ingresos: m.ingresos, egresos: m.egresos }))} height={190} ancho={700} ticks={4} />
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="shadow-[inset_0_-1.5px_0_rgb(var(--cuaderno-tinta))]">
                <th className="font-normal text-[15px] text-left text-cuaderno-grafito py-2 pr-3">Mes</th>
                <th className="font-normal text-[15px] text-right text-cuaderno-grafito py-2 px-3">Ingresos</th>
                <th className="font-normal text-[15px] text-right text-cuaderno-grafito py-2 px-3">Egresos</th>
                <th className="font-normal text-[15px] text-right text-cuaderno-grafito py-2 px-3">Margen</th>
                <th className="font-normal text-[15px] text-right text-cuaderno-grafito py-2 pl-3 hidden sm:table-cell">%</th>
              </tr>
            </thead>
            <tbody>
              {mesesData.map(m => {
                const hay = m.ingresos > 0 || m.egresos > 0;
                return (
                  <tr key={m.mes} className="border-b border-cuaderno-renglon">
                    <td className="py-2 pr-3 text-[16px]">{MESES_FULL[m.mes]}</td>
                    <td className="py-2 px-3 text-right text-[16px]">{m.ingresos > 0 ? <Cifra valor={m.ingresos} escala="pesos" color="tinta" /> : <span className="text-cuaderno-grafito">—</span>}</td>
                    <td className="py-2 px-3 text-right text-[16px]">{m.egresos > 0 ? <Cifra valor={-m.egresos} escala="pesos" /> : <span className="text-cuaderno-grafito">—</span>}</td>
                    <td className="py-2 px-3 text-right text-[16px]">{hay ? <Cifra valor={m.margen} escala="pesos" vacio="0" /> : <span className="text-cuaderno-grafito">—</span>}</td>
                    <td className="py-2 pl-3 text-right text-[14px] text-cuaderno-grafito hidden sm:table-cell">{pctIng(m)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td className="pt-2.5 pr-3 text-[17px]">Total del año</td>
                <td className="pt-2.5 px-3 text-right text-[16px]"><Cifra valor={totalIngresos} escala="pesos" color="tinta" vacio="$0" raya="total" /></td>
                <td className="pt-2.5 px-3 text-right text-[16px]"><Cifra valor={-totalEgresos} escala="pesos" vacio="$0" raya="total" /></td>
                <td className="pt-2.5 px-3 text-right text-[16px]"><Cifra valor={margenTotal} escala="pesos" vacio="$0" raya="total" /></td>
                <td className="pt-2.5 pl-3 text-right text-[14px] text-cuaderno-grafito hidden sm:table-cell">
                  {totalIngresos > 0 ? ((margenTotal / totalIngresos) * 100).toFixed(1).replace(".", ",") + "%" : "—"}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Hoja>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* ── 2. Proveedores ── */}
        <Hoja titulo="2. Diez proveedores principales"
          extra={<span className="text-[15px] text-cuaderno-grafito">por gasto acumulado</span>}>
          {rankingProveedores.length === 0 ? (
            <p className="m-0 py-8 text-center text-[16px] text-cuaderno-grafito">Sin compras anotadas.</p>
          ) : (
            <ol className="m-0 p-0 list-none space-y-3">
              {rankingProveedores.map((p, i) => {
                const maxTotal = rankingProveedores[0].total || 1;
                return (
                  <li key={p.nombre}>
                    <div className="flex items-baseline gap-2 text-[16px]">
                      <span className="w-6 text-cuaderno-grafito">{i + 1}.</span>
                      <span className="flex-1 min-w-0 truncate">{casoTitulo(p.nombre)}</span>
                      <Cifra valor={p.total} escala="pesos" color="tinta" className="flex-shrink-0" />
                    </div>
                    <div className="pl-8"><BarraProporcion pct={(p.total / maxTotal) * 100} /></div>
                  </li>
                );
              })}
            </ol>
          )}
        </Hoja>

        {/* ── 3. Costos fijos y variables ── */}
        <Hoja titulo="3. Costos fijos y variables"
          extra={<span className="text-[15px] text-cuaderno-grafito">llevados a mes</span>}>
          <LineaGuia etiqueta="Costos fijos al mes"><Cifra valor={totalCF} escala="pesos" color="tinta" vacio="$0" /></LineaGuia>
          <p className="m-0 -mt-1 mb-1 text-right text-[13px] text-cuaderno-grafito">{rawData.costosFijos.filter(c => costoVigenteEnMes(c, mesHoy)).length} vigentes este mes</p>
          <LineaGuia etiqueta="Egresos variables del año"><Cifra valor={totalVar} escala="pesos" color="tinta" vacio="$0" /></LineaGuia>
          <p className="m-0 -mt-1 mb-2 text-right text-[13px] text-cuaderno-grafito">compras, rendiciones y subcontratos</p>

          {(totalCF + totalVar) > 0 && (
            <div className="mb-4">
              <div className="flex h-2.5 rounded-sm overflow-hidden">
                <div className="bg-cuaderno-lavanda" style={{ width: `${(totalCF / (totalCF + totalVar)) * 100}%` }} />
                <div className="bg-cuaderno-durazno flex-1" />
              </div>
              <div className="flex gap-6 mt-1.5 text-[14px]">
                <span><Resaltado color="lavanda">fijos</Resaltado> {((totalCF / (totalCF + totalVar)) * 100).toFixed(1).replace(".", ",")}%</span>
                <span><Resaltado color="durazno">variables</Resaltado> {((totalVar / (totalCF + totalVar)) * 100).toFixed(1).replace(".", ",")}%</span>
              </div>
            </div>
          )}

          {cfPorCategoria.length > 0 && (
            <div>
              <p className="m-0 mb-1 text-[16px] text-cuaderno-grafito">Costos fijos por categoría</p>
              {cfPorCategoria.map(([cat, val]) => (
                <LineaGuia key={cat} etiqueta={casoOracion(cat)} className="text-[16px] min-h-[30px]">
                  <span><Cifra valor={val} escala="pesos" color="tinta" /> <span className="text-[14px] text-cuaderno-grafito">al mes</span></span>
                </LineaGuia>
              ))}
            </div>
          )}
        </Hoja>
      </div>

      {/* ── 4. Proyección ── */}
      <Hoja titulo="4. Proyección de los próximos seis meses"
        extra={<span className="text-[15px] text-cuaderno-grafito">promedio de los meses con datos</span>}>
        <GraficoLinea data={proyeccion.map(p => ({ label: p.label, value: p.value }))} height={150} />

        <div className="mt-3 overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="shadow-[inset_0_-1.5px_0_rgb(var(--cuaderno-tinta))]">
                <th className="font-normal text-[15px] text-left text-cuaderno-grafito py-2 pr-3">Mes</th>
                <th className="font-normal text-[15px] text-right text-cuaderno-grafito py-2 px-3">Ingreso estimado</th>
                <th className="font-normal text-[15px] text-right text-cuaderno-grafito py-2 px-3">Egreso estimado</th>
                <th className="font-normal text-[15px] text-right text-cuaderno-grafito py-2 px-3">De ellos, fijos</th>
                <th className="font-normal text-[15px] text-right text-cuaderno-grafito py-2 pl-3">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {proyeccion.map((p, i) => (
                <tr key={i} className="border-b border-cuaderno-renglon">
                  <td className="py-2 pr-3 text-[16px]">{p.mes}</td>
                  <td className="py-2 px-3 text-right text-[16px]"><Cifra valor={p.ingresos} escala="pesos" color="tinta" vacio="$0" /></td>
                  <td className="py-2 px-3 text-right text-[16px]"><Cifra valor={-p.egresos} escala="pesos" vacio="$0" /></td>
                  <td className="py-2 px-3 text-right text-[15px]"><Cifra valor={p.costosFijos} escala="pesos" color="grafito" vacio="$0" /></td>
                  <td className="py-2 pl-3 text-right text-[16px]"><Cifra valor={p.value} escala="pesos" vacio="$0" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <Nota etiqueta="Ojo:" tono="grafito" className="mt-4 text-[16px]">
          esta proyección repite el promedio de los meses de {anio} que tienen datos, con los costos fijos completos.
          Es solo una referencia: la proyección real está en el flujo de caja.
        </Nota>
      </Hoja>
    </div>
  );
}
