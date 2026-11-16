import React, { useState, useEffect, useCallback, useMemo } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { fechaISO, hoyISO, limitesMes } from "../../lib/fechas";
import { costoOC, mesSubcontrato, saldoSubcontratos, ventaOT, retencionOT } from "../../lib/costosObra";
import { manoObraAnio, costoObraFila } from "../../lib/manoObra";
import { entregasComoConsumos, unirConsumos, preciosDeCargas, valorizarConsumos, costoConsumo } from "../../lib/combustible";
import { useFuelPrices } from "../../lib/fuelPriceService";
import { sumarMesesClave } from "../../lib/finanzas/costosFijos.js";
import { useEmpresa } from "../../lib/useEmpresa";
import { cargarIngresosDelFlujo, cuentaEsDeObra } from "../../lib/finanzas/ingresos.js";
import {
  Cifra, Titulo, Hoja, LineaGuia, Boton, Campo, Resaltado, FechaHoja, GraficoBarras, BarraProporcion,
  IconoActualizar, IconoBajar, casoTitulo,
} from "./cuaderno";

// ─── Utilidades ───────────────────────────────────────────────────────────────
const MESES_FULL  = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const MESES_SHORT = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];

function fmt(n)  { return "$" + Math.abs(Math.round(n||0)).toLocaleString("es-CL"); }
function fmtM(n) {
  if (!n && n!==0) return "$0";
  const abs = Math.abs(n);
  if (abs >= 1000000) return (n<0?"-":"") + "$" + (abs/1000000).toFixed(1).replace(".",",") + "M";
  return (n<0?"-":"") + "$" + Math.round(abs).toLocaleString("es-CL");
}
// Mes "AAAA-MM" de una fecha "AAAA-MM-DD" o Timestamp, en hora de Chile (fechas.js).
function mesKey(fecha) {
  if (!fecha) return null;
  const iso = typeof fecha === "string" ? fecha : fechaISO(fecha);
  return /^\d{4}-\d{2}/.test(iso || "") ? iso.slice(0, 7) : null;
}
const FUENTES_EGRESO = [
  ["manoObra", "Mano de obra"], ["combustible", "Combustible"], ["oc", "Órdenes de compra (facturado)"],
  ["subcontrato", "Subcontratos (estados de pago)"], ["rendicion", "Rendiciones"],
];

// ─── Hoja de una obra ─────────────────────────────────────────────────────────
function ProyectoPanel({ proyecto, datos, mes, anio }) {
  const { ingresos, egresos, egrPorFuente, proveedores, flujoPorMes, retencion, ingresosFlujo, saldoSC } = datos;
  const neto   = ingresos - egresos;
  const margen = ingresos > 0 ? ((neto/ingresos)*100).toFixed(1) : null;
  const maxProv = proveedores[0]?.total || 1;

  return (
    <section className="bg-cuaderno-hoja border border-cuaderno-columna rounded-md">
      <header className="flex flex-wrap items-end justify-between gap-3 px-6 pt-3 pb-2 border-b-[3px] border-double border-cuaderno-margen">
        <div>
          <Titulo as="h2" tamano="lg">{proyecto.name || proyecto.nombre || proyecto.id}</Titulo>
          {proyecto.code && <p className="m-0 -mt-1 text-[15px] text-cuaderno-grafito">{proyecto.code}</p>}
        </div>
        <p className="m-0 pb-1 text-[17px]">
          Neto de {MESES_FULL[mes].toLowerCase()}: <Cifra valor={neto} escala="pesos" vacio="$0" raya="doble" />
        </p>
      </header>

      <div className="px-6 py-4 grid gap-x-12 gap-y-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div>
          <LineaGuia etiqueta="Venta del mes"><Cifra valor={ingresos} escala="pesos" color="tinta" vacio="$0" /></LineaGuia>
          <p className="m-0 -mt-1 mb-1 text-right text-[13px] text-cuaderno-grafito">estado de pago al mandante, bruto (Oficina Técnica)</p>
          {retencion > 0 && <LineaGuia etiqueta="Retención, por cobrar al final" className="text-[15px] min-h-[30px]"><Cifra valor={retencion} escala="pesos" color="grafito" /></LineaGuia>}
          <LineaGuia etiqueta="Costo"><Cifra valor={-egresos} escala="pesos" vacio="$0" /></LineaGuia>
          <p className="m-0 -mt-1 mb-1 text-right text-[13px] text-cuaderno-grafito">mano de obra, combustible, compras, subcontratos y rendiciones, como el Dashboard de Oficina Técnica</p>
          <LineaGuia etiqueta="Margen">
            <span className={margen !== null && parseFloat(margen) < 0 ? "text-cuaderno-roja" : ""}>
              {margen !== null ? `${margen.replace(".", ",")}%` : "—"}
            </span>
          </LineaGuia>
          {ingresos === 0 && <p className="m-0 text-right text-[13px] text-cuaderno-grafito">sin estado de pago al mandante este mes</p>}
          {ingresosFlujo !== 0 && (
            <LineaGuia etiqueta="Cobros anotados en el flujo" className="text-[15px] min-h-[30px]"><Cifra valor={ingresosFlujo} escala="pesos" color="grafito" /></LineaGuia>
          )}
          {saldoSC > 0 && (
            <LineaGuia etiqueta="Subcontratos, saldo por pagar" className="text-[15px] min-h-[30px]"><Cifra valor={saldoSC} escala="pesos" color="grafito" /></LineaGuia>
          )}

          <div className="mt-4">
            <p className="m-0 mb-1 text-[16px] text-cuaderno-grafito">En qué se fue el egreso</p>
            {egresos === 0 ? (
              <p className="m-0 text-[15px] text-cuaderno-grafito">Sin egresos este período.</p>
            ) : (
              <div className="space-y-2.5">
                {FUENTES_EGRESO.map(([k, label]) => ({ label, val: egrPorFuente[k] || 0 })).filter(f => f.val !== 0).map(({ label, val }) => {
                  const pct = egresos > 0 ? (val / egresos) * 100 : 0;
                  return (
                    <div key={label}>
                      <div className="flex items-baseline justify-between gap-3 text-[16px]">
                        <span>{label}</span>
                        <span className="flex items-baseline gap-3">
                          <Cifra valor={val} escala="pesos" color="tinta" vacio="$0" />
                          <span className="w-10 text-right text-[14px] text-cuaderno-grafito">{pct.toFixed(0)}%</span>
                        </span>
                      </div>
                      <BarraProporcion pct={pct} />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div>
          <div className="flex items-end justify-between gap-3">
            <p className="m-0 text-[16px] text-cuaderno-grafito">Últimos seis meses</p>
            <div className="flex gap-3 text-[14px]">
              <Resaltado color="menta">ingresos</Resaltado>
              <Resaltado color="rosa">egresos</Resaltado>
            </div>
          </div>
          <GraficoBarras data={flujoPorMes} height={170} />

          {proveedores.length > 0 && (
            <div className="mt-3">
              <p className="m-0 mb-1 text-[16px] text-cuaderno-grafito">Principales proveedores</p>
              <ol className="m-0 p-0 list-none grid gap-x-8 gap-y-2 sm:grid-cols-2">
                {proveedores.slice(0, 6).map((p, i) => (
                  <li key={i}>
                    <div className="flex items-baseline gap-2 text-[15px]">
                      <span className="w-4 text-cuaderno-grafito">{i + 1}.</span>
                      <span className="flex-1 min-w-0 truncate">{casoTitulo(p.nombre)}</span>
                      <Cifra valor={p.total} escala="pesos" color="tinta" className="flex-shrink-0" />
                    </div>
                    <div className="pl-6"><BarraProporcion pct={(p.total / maxProv) * 100} /></div>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function FinanzasObras() {
  const hoyIso = hoyISO();
  const { empresaId } = useEmpresa();
  const { prices: fuelPrices } = useFuelPrices(false);
  const precioDieselRespaldo = fuelPrices?.diesel || 950;   // mismo respaldo que el Dashboard de OT
  const [mes,  setMes]  = useState(Number(hoyIso.slice(5, 7)) - 1);
  const [anio, setAnio] = useState(Number(hoyIso.slice(0, 4)));
  const [proyectos, setProyectos] = useState([]);
  const [rawData,   setRawData]   = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [busqueda,  setBusqueda]  = useState("");

  const keyActual = `${anio}-${String(mes+1).padStart(2,"0")}`;
  const anios = Array.from({length:5}, (_,i) => Number(hoyIso.slice(0, 4))-2+i);

  // Últimos 6 meses para gráfico
  const ultimos6 = useMemo(() => Array.from({length:6}, (_,i) => sumarMesesClave(keyActual, i - 5)), [keyActual]);

  const cargar = useCallback(async () => {
    if (!empresaId) { setLoading(false); return; }
    setLoading(true);
    try {
      // Proyectos
      const snapP = await getDocs(collection(db,"empresas",empresaId,"projects"));
      const listaP = snapP.docs.map(d => ({id:d.id,...d.data()}));
      setProyectos(listaP);

      // Costo y venta por obra con las MISMAS reglas que el Dashboard de Oficina
      // Técnica (src/lib/costosObra.js): OC = facturado, subcontratos = monto
      // del EP en el mes asociado, mano de obra de RRHH (respaldo Excel) y
      // combustible WorkFleet + Excel valorizado. Venta = estado de pago al
      // mandante, bruta; la retención aparte. Antes: OC comprometida, saldo
      // del subcontrato por cada línea de EP y sin mano de obra ni combustible.
      const acum = {}; // { [projectId]: { ingresos, egresos, egrPorFuente, proveedores:{}, flujo:{} } }

      const init = () => ({
        ingresos: 0, egresos: 0, retencion: 0, ingresosFlujo: 0, saldoSC: 0,
        egrPorFuente: { manoObra:0, combustible:0, rendicion:0, oc:0, subcontrato:0 },
        proveedores: {},
        flujo: Object.fromEntries(ultimos6.map(k=>[k,{ingresos:0,egresos:0}])),
      });
      const get = (pid) => { if (!acum[pid]) acum[pid]=init(); return acum[pid]; };
      const egreso = (pid, k, fuente, m, proveedor) => {
        if (!pid || !k || !m) return;
        const enMes = k === keyActual, enGrafico = ultimos6.includes(k);
        if (!enMes && !enGrafico) return;
        const a = get(pid);
        if (enMes) { a.egresos += m; a.egrPorFuente[fuente] += m; if (proveedor) a.proveedores[proveedor] = (a.proveedores[proveedor]||0) + m; }
        if (enGrafico) a.flujo[k].egresos += m;
      };
      const leer = (nombre) => getDocs(collection(db,"empresas",empresaId,nombre))
        .then(snap => snap.docs.map(d => ({ id: d.id, ...d.data() })))
        .catch(e => { console.warn(nombre, e); return []; });

      const desde = `${ultimos6[0]}-01`;
      const [ua, um] = keyActual.split("-").map(Number);
      const hasta = limitesMes(ua, um).hasta;
      const [ingresosOT, rendiciones, ocs, subcontratos, fuelLogs, reportesComb] = await Promise.all([
        leer("estadoPagoIngresos"), leer("rendiciones"), leer("purchaseOrders"), leer("subcontratos"),
        leer("fuelLogs"),
        getDocs(query(collection(db,"empresas",empresaId,"reportes_combustible"), where("tipo","in",["entrega","entrada"])))
          .then(s => s.docs.map(d => ({ id: d.id, ...d.data() }))).catch(() => []),
      ]);

      // Venta del mandante (ventaOT) y retención
      ingresosOT.forEach(i => {
        if (!i.projectId || !i.year || !i.month) return;
        const k = `${i.year}-${String(i.month).padStart(2,"0")}`;
        const v = ventaOT(i);
        if (k === keyActual) { const a = get(i.projectId); a.ingresos += v; a.retencion += retencionOT(i); }
        if (ultimos6.includes(k)) get(i.projectId).flujo[k].ingresos += v;
      });

      // Cobros anotados en el flujo de caja (referencia: caja, no devengado)
      try {
        const { porCuenta } = await cargarIngresosDelFlujo(empresaId);
        for (const { cuenta, porMes } of porCuenta) {
          const obra = listaP.find(p => cuentaEsDeObra(cuenta, p));
          if (obra && porMes[keyActual]) get(obra.id).ingresosFlujo += porMes[keyActual];
        }
      } catch (e) { console.warn("Sin ingresos del flujo:", e); }

      // Rendiciones (montoAprobado por fecha de emisión, como OT)
      rendiciones.forEach(r => egreso(r.projectId, mesKey(r.fechaEmision), "rendicion", parseFloat(r.montoAprobado)||0, r.proveedor));
      // Órdenes de compra: lo facturado
      ocs.forEach(o => egreso(o.projectId, mesKey(o.fecha), "oc", costoOC(o), o.proveedor));
      // Subcontratos: monto del EP en el mes asociado; saldo una vez por contrato
      subcontratos.forEach(s => egreso(s.projectId, mesSubcontrato(s) || mesKey(s.createdAt), "subcontrato", parseFloat(s.montoEP)||0, s.razonSocialSubcontratista));
      const scPorObra = {};
      subcontratos.forEach(s => { if (s.projectId) (scPorObra[s.projectId] ||= []).push(s); });
      Object.entries(scPorObra).forEach(([pid, filas]) => { const sal = saldoSubcontratos(filas); if (sal) get(pid).saldoSC = sal; });

      // Combustible: WorkFleet + Excel sin duplicar, valorizado (mismas funciones que listarConsumosCombustible)
      const cargas = preciosDeCargas(reportesComb);
      listaP.forEach(p => {
        const excel = fuelLogs.filter(l => l.projectId === p.id && l.date >= desde && l.date <= hasta);
        const consumos = valorizarConsumos(unirConsumos(excel, entregasComoConsumos(reportesComb, { projectId: p.id, desde, hasta })), cargas);
        consumos.forEach(c => egreso(p.id, mesKey(c.date), "combustible", costoConsumo(c, precioDieselRespaldo)));
      });

      // Mano de obra: liquidaciones de RRHH (respaldo Excel) × % de incidencia
      const aniosG = [...new Set(ultimos6.map(k => Number(k.slice(0, 4))))];
      await Promise.all(listaP.map(async p => {
        const filas = (await Promise.all(aniosG.map(a => manoObraAnio(empresaId, p.id, a).catch(() => [])))).flat();
        filas.forEach(f => egreso(p.id, `${f.year}-${String(f.month).padStart(2,"0")}`, "manoObra", costoObraFila(f)));
      }));

      setRawData(acum);
    } catch(e) { console.error(e); }
    finally { setLoading(false); }
  }, [empresaId, keyActual, ultimos6, precioDieselRespaldo]);

  useEffect(() => { cargar(); }, [cargar]);

  // Proyectos con actividad o todos
  const proyectosFiltrados = useMemo(() => {
    if (!rawData) return [];
    return proyectos
      .filter(p => {
        const nombre = (p.name||p.nombre||p.id||"").toLowerCase();
        if (busqueda && !nombre.includes(busqueda.toLowerCase())) return false;
        return true;
      })
      .map(p => {
        const d = rawData[p.id] || { ingresos:0,egresos:0,retencion:0,ingresosFlujo:0,saldoSC:0,egrPorFuente:{},proveedores:{},flujo:{} };
        return { proyecto: p, datos: d, actividad: d.ingresos+d.egresos };
      })
      .sort((a,b) => b.actividad - a.actividad);
  }, [proyectos, rawData, busqueda]);

  // Transformar datos para renderizado
  const procesarDatos = (d) => ({
    ...d,
    proveedores: Object.entries(d.proveedores)
      .map(([nombre,total])=>({nombre,total}))
      .sort((a,b)=>b.total-a.total),
    flujoPorMes: ultimos6.map(k => ({
      label: MESES_SHORT[parseInt(k.split("-")[1])-1],
      ingresos: d.flujo[k]?.ingresos || 0,
      egresos:  d.flujo[k]?.egresos  || 0,
    })),
  });

  const sinActividad  = proyectosFiltrados.filter(p => p.actividad === 0);
  const conActividad  = proyectosFiltrados.filter(p => p.actividad > 0);

  return (
    <div className="cuaderno px-8 pt-5 pb-10 space-y-5">

      <FechaHoja />

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Titulo>Por obra</Titulo>
          <p className="m-0 text-[17px] text-cuaderno-grafito">
            Venta, costo y margen de cada obra en {MESES_FULL[mes].toLowerCase()} de {anio}.
            {!loading && ` ${conActividad.length} con movimientos, de ${proyectos.length}.`}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <Campo etiqueta="Buscar" type="search" className="w-44" value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Nombre de la obra" />
          <Campo as="select" etiqueta="Mes" value={mes} onChange={e => setMes(Number(e.target.value))}>
            {MESES_FULL.map((m, i) => <option key={i} value={i}>{m}</option>)}
          </Campo>
          <Campo as="select" etiqueta="Año" value={anio} onChange={e => setAnio(Number(e.target.value))}>
            {anios.map(a => <option key={a} value={a}>{a}</option>)}
          </Campo>
          <Boton onClick={cargar} disabled={loading}>
            <IconoActualizar tamano={15} className={loading ? "animate-spin" : ""} />
            {loading ? "Actualizando…" : "Actualizar"}
          </Boton>
        </div>
      </header>

      {loading ? (
        <p className="m-0 py-16 text-center text-[18px] text-cuaderno-grafito">Sumando las cuentas de cada obra…</p>
      ) : proyectosFiltrados.length === 0 ? (
        <Hoja cuerpo="px-6 py-10 text-center space-y-1">
          <p className="m-0 font-ligada font-light text-[22px] leading-[1.6]">No hay obras que mostrar</p>
          <p className="m-0 text-[16px] text-cuaderno-grafito">Prueba con otra búsqueda.</p>
        </Hoja>
      ) : (
        <div className="space-y-5">
          {conActividad.map(({ proyecto, datos }) => (
            <ProyectoPanel key={proyecto.id} proyecto={proyecto} datos={procesarDatos(datos)} mes={mes} anio={anio} />
          ))}

          {/* Obras sin movimientos, plegadas */}
          {sinActividad.length > 0 && (
            <details className="group bg-cuaderno-hoja border border-cuaderno-columna rounded-md">
              <summary className="flex items-center justify-between gap-3 px-6 min-h-[52px] cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden">
                <span className="text-[18px]">
                  Sin movimientos en {MESES_FULL[mes].toLowerCase()}
                  <span className="ml-2 text-[15px] text-cuaderno-grafito">{sinActividad.length} obra{sinActividad.length !== 1 ? "s" : ""}</span>
                </span>
                <IconoBajar tamano={15} className="text-cuaderno-grafito transition-transform group-open:rotate-180" />
              </summary>
              <ul className="m-0 px-6 pb-4 pt-1 list-none grid gap-x-8 sm:grid-cols-2 lg:grid-cols-3">
                {sinActividad.map(({ proyecto }) => (
                  <li key={proyecto.id} className="py-2 border-b border-cuaderno-renglon">
                    <p className="m-0 text-[16px] truncate">{proyecto.name || proyecto.nombre || proyecto.id}</p>
                    {proyecto.code && <p className="m-0 text-[13px] text-cuaderno-grafito">{proyecto.code}</p>}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
