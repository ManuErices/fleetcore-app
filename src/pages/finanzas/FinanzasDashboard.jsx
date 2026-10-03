import React, { useState, useEffect, useMemo, useCallback } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useEmpresa } from "../../lib/useEmpresa";
import { useFinanzas, ProyectoSelector } from "./FinanzasContext";
import {
  Cifra, Titulo, Hoja, LineaGuia, Boton, Campo, Resaltado, VistoBueno, FechaHoja,
  GraficoBarras, BarraProporcion, MarcaAviso,
  IconoActualizar, casoTitulo,
} from "./cuaderno";

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

// ─── Componente principal ─────────────────────────────────────────────────────
export default function FinanzasDashboard({ onNavigate } = {}) {
  const { proyectoId, setDrawerOpen } = useFinanzas();
  const hoy   = new Date();
  const [mes,  setMes]  = useState(hoy.getMonth());      // 0-11
  const [anio, setAnio] = useState(hoy.getFullYear());
  const [data, setData] = useState({
    ingresosMes: 0, egresosMes: 0, costosFijosMes: 0, activosTotal: 0,
    flujoPorMes: [], proveedoresTop: [], egresosPorFuente: [], alertas: [],
  });
  const { empresaId } = useEmpresa();
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
    if (!empresaId) { setLoading(false); return; }
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
      const snap = await getDocs(collection(db, "empresas", empresaId, "finanzas_ingresos"));
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
      const snap = await getDocs(collection(db, "empresas", empresaId, "rendiciones"));
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
      const snap = await getDocs(collection(db, "empresas", empresaId, "subcontratos"));
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
      const snap = await getDocs(collection(db, "empresas", empresaId, "purchaseOrders"));
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
      const snap = await getDocs(collection(db, "empresas", empresaId, "costos_fijos"));
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
      const snap = await getDocs(query(collection(db, "empresas", empresaId, "machines"), where("empresa", "==", "MPF Ingeniería Civil")));
      snap.docs.forEach(d => {
        if (d.data().active !== false) resultado.activosTotal++;
      });
      const snapFA = await getDocs(collection(db, "empresas", empresaId, "finanzas_activos"));
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
  }, [empresaId, keyActual, ultimos6, mes, anio, proyectoId]);

  useEffect(() => { cargar(); }, [cargar]);

  const flujoNeto = data ? data.ingresosMes - data.egresosMes : 0;
  const maxProv   = data?.proveedoresTop?.[0]?.total || 1;

  // Distribución egresos
  const totalEgrVar = data ? (data.egresosPorFuente.rendicion + data.egresosPorFuente.subcontrato + data.egresosPorFuente.oc) : 0;
  const totalEgr    = data ? data.egresosMes : 0;

  const alertasUrgentes = data.alertas.filter(a => a.tipo !== "info").length;
  const etiquetaMes = `${MESES_FULL[mes].toLowerCase()} de ${anio}`;

  return (
    <div className="cuaderno px-8 pt-5 pb-10 space-y-5">

      <FechaHoja />

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Titulo>Resumen financiero</Titulo>
          <p className="m-0 text-[17px] text-cuaderno-grafito">Cómo va {etiquetaMes}, de un vistazo.</p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <Campo as="select" etiqueta="Mes" value={mes} onChange={e => setMes(Number(e.target.value))}>
            {MESES_FULL.map((m, i) => <option key={i} value={i}>{m}</option>)}
          </Campo>
          <Campo as="select" etiqueta="Año" value={anio} onChange={e => setAnio(Number(e.target.value))}>
            {anios.map(a => <option key={a} value={a}>{a}</option>)}
          </Campo>
          <ProyectoSelector variante="cuaderno" />
          <Boton onClick={cargar} disabled={loading}>
            <IconoActualizar tamano={15} className={loading ? "animate-spin" : ""} />
            {loading ? "Actualizando…" : "Actualizar"}
          </Boton>
        </div>
      </header>

      {loading ? (
        <p className="m-0 py-16 text-center text-[18px] text-cuaderno-grafito">Sumando las cuentas de {etiquetaMes}…</p>
      ) : (
        <>
          {/* ── Cuentas del mes + gráfico ── */}
          <div className="grid gap-5 lg:grid-cols-3">
            <Hoja titulo="Cuentas del mes">
              <LineaGuia etiqueta="Ingresos"><Cifra valor={data.ingresosMes} escala="pesos" vacio="$0" color="tinta" /></LineaGuia>
              <LineaGuia etiqueta="Egresos"><Cifra valor={-data.egresosMes} escala="pesos" vacio="$0" /></LineaGuia>
              <p className="m-0 -mt-1 mb-1 text-right text-[13px] text-cuaderno-grafito">compras, rendiciones, subcontratos y costos fijos</p>
              <LineaGuia etiqueta="Neto"><Cifra valor={flujoNeto} escala="pesos" vacio="$0" raya="doble" /></LineaGuia>
              <LineaGuia etiqueta="Margen">
                <span className={flujoNeto >= 0 ? "" : "text-cuaderno-roja"}>
                  {data.ingresosMes > 0 ? ((flujoNeto / data.ingresosMes) * 100).toFixed(1).replace(".", ",") + "%" : "—"}
                </span>
              </LineaGuia>
              <div className="border-t border-cuaderno-renglon mt-2 pt-1">
                <LineaGuia etiqueta="Costos fijos al mes"><Cifra valor={data.costosFijosMes} escala="pesos" vacio="$0" color="tinta" /></LineaGuia>
                <p className="m-0 -mt-1 mb-1 text-right text-[13px] text-cuaderno-grafito">
                  {((data.costosFijosMes / (data.egresosMes || 1)) * 100).toFixed(1).replace(".", ",")}% del egreso
                </p>
                <LineaGuia etiqueta="Activos en uso"><span>{data.activosTotal}</span></LineaGuia>
              </div>
            </Hoja>

            <Hoja titulo="Últimos seis meses" className="lg:col-span-2"
              extra={
                <div className="flex items-center gap-4 text-[15px]">
                  <Resaltado color="menta">ingresos</Resaltado>
                  <Resaltado color="rosa">egresos</Resaltado>
                </div>
              }>
              <GraficoBarras data={data.flujoPorMes} height={190} />
              {onNavigate && (
                <div className="flex justify-end mt-1">
                  <Boton variante="texto" className="text-[16px]" onClick={() => onNavigate("flujo")}>Abrir el flujo de caja</Boton>
                </div>
              )}
            </Hoja>
          </div>

          {/* ── Alertas, proveedores y egresos ── */}
          <div className="grid gap-5 lg:grid-cols-3">
            <Hoja titulo="Avisos"
              extra={alertasUrgentes > 0 && <span className="text-[15px] text-cuaderno-roja">{alertasUrgentes} requieren atención</span>}>
              {data.alertas.length === 0 ? (
                <p className="m-0 py-6 flex items-center justify-center gap-2 text-[16px] text-cuaderno-verde">
                  <VistoBueno tamano={15} titulo="" /> Todo en orden, sin avisos.
                </p>
              ) : (
                <ul className="m-0 p-0 list-none max-h-64 overflow-y-auto">
                  {data.alertas.map((a, i) => (
                    <li key={i} className="grid grid-cols-[4.5rem_1fr] items-start gap-2 py-2 border-b border-cuaderno-renglon">
                      <span className="pt-0.5"><MarcaAviso tipo={a.tipo} /></span>
                      <span className="text-[16px] leading-snug">
                        {a.texto}
                        {a.monto && <span className="block"><Cifra valor={a.monto} escala="pesos" color="tinta" /></span>}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex justify-end mt-1">
                <Boton variante="texto" className="text-[16px]" onClick={() => setDrawerOpen(true)}>Ver todos los avisos</Boton>
              </div>
            </Hoja>

            <Hoja titulo="Proveedores del mes">
              {data.proveedoresTop.length === 0 ? (
                <p className="m-0 py-6 text-center text-[16px] text-cuaderno-grafito">Sin compras anotadas este mes.</p>
              ) : (
                <ol className="m-0 p-0 list-none space-y-3">
                  {data.proveedoresTop.map((p, i) => (
                    <li key={i}>
                      <div className="flex items-baseline gap-2 text-[17px]">
                        <span className="w-5 text-cuaderno-grafito">{i + 1}.</span>
                        <span className="flex-1 min-w-0 truncate">{casoTitulo(p.nombre)}</span>
                        <Cifra valor={p.total} escala="pesos" color="tinta" className="flex-shrink-0" />
                      </div>
                      <div className="pl-7"><BarraProporcion pct={(p.total / maxProv) * 100} /></div>
                    </li>
                  ))}
                </ol>
              )}
            </Hoja>

            <Hoja titulo="En qué se fue el egreso">
              <div className="space-y-3">
                {[
                  { label: "Costos fijos",      val: data.costosFijosMes },
                  { label: "Rendiciones",       val: data.egresosPorFuente.rendicion },
                  { label: "Subcontratos",      val: data.egresosPorFuente.subcontrato },
                  { label: "Órdenes de compra", val: data.egresosPorFuente.oc },
                ].map(({ label, val }) => {
                  const pct = totalEgr > 0 ? (val / totalEgr) * 100 : 0;
                  return (
                    <div key={label}>
                      <div className="flex items-baseline justify-between gap-3 text-[17px]">
                        <span>{label}</span>
                        <span className="flex items-baseline gap-3">
                          <Cifra valor={val} escala="pesos" vacio="$0" color="tinta" />
                          <span className="w-10 text-right text-[15px] text-cuaderno-grafito">{totalEgr > 0 ? `${pct.toFixed(0)}%` : ""}</span>
                        </span>
                      </div>
                      <BarraProporcion pct={pct} />
                    </div>
                  );
                })}
                <div className="pt-1">
                  <LineaGuia etiqueta="Total egresos">
                    <Cifra valor={totalEgr} escala="pesos" vacio="$0" color="tinta" raya="total" />
                  </LineaGuia>
                </div>
              </div>
            </Hoja>
          </div>
        </>
      )}
    </div>
  );
}
