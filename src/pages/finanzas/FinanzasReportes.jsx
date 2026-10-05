import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { collection, getDocs, query, where, orderBy } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useEmpresa } from "../../lib/useEmpresa";
import { useFinanzas, ProyectoSelector } from "./FinanzasContext";
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

// ─── Componente principal ─────────────────────────────────────────────────────
export default function FinanzasReportes() {
  const { proyectoId } = useFinanzas();
  const { empresaId } = useEmpresa();
  const [loading, setLoading]   = useState(true);
  const [anio, setAnio]         = useState(new Date().getFullYear());
  const [rawData, setRawData]   = useState({ ingresos: [], egresos: [], costosFijos: [], proveedores: [] });
  const [exporting, setExporting] = useState(false);
  const reportRef = useRef(null);

  const cargar = useCallback(async () => {
    if (!empresaId) { setLoading(false); return; }
    setLoading(true);
    const resultado = { ingresos: [], egresos: [], costosFijos: [], proveedores: [] };

    // 1. Ingresos manuales
    try {
      const snap = await getDocs(collection(db, "empresas", empresaId, "finanzas_ingresos"));
      snap.docs.forEach(d => {
        const r = { ...d.data(), id: d.id };
        if (proyectoId !== "todos" && r.projectId !== proyectoId) return;
        resultado.ingresos.push(r);
      });
    } catch (e) {}

    // 2. Egresos: rendiciones
    try {
      const snap = await getDocs(collection(db, "empresas", empresaId, "rendiciones"));
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
      const snap = await getDocs(collection(db, "empresas", empresaId, "subcontratos"));
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
      const snap = await getDocs(collection(db, "empresas", empresaId, "purchaseOrders"));
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
      const snap = await getDocs(collection(db, "empresas", empresaId, "costos_fijos"));
      snap.docs.forEach(d => resultado.costosFijos.push({ ...d.data(), id: d.id }));
    } catch (e) {}

    setRawData(resultado);
    setLoading(false);
  }, [empresaId, proyectoId]);

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
          <p className="m-0 -mt-1 mb-1 text-right text-[13px] text-cuaderno-grafito">{rawData.costosFijos.filter(c => c.activo !== false).length} registros activos</p>
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
