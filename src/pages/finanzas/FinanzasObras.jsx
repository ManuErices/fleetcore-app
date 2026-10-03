import React, { useState, useEffect, useCallback, useMemo } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useEmpresa } from "../../lib/useEmpresa";
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
function mesKey(fecha) {
  if (!fecha) return null;
  try {
    const d = new Date(fecha.includes("T") ? fecha : fecha+"T12:00:00");
    if (isNaN(d)) return null;
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
  } catch { return null; }
}

// ─── Hoja de una obra ─────────────────────────────────────────────────────────
function ProyectoPanel({ proyecto, datos, mes, anio }) {
  const { ingresos, egresos, egrPorFuente, proveedores, flujoPorMes } = datos;
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
          <LineaGuia etiqueta="Ingresos"><Cifra valor={ingresos} escala="pesos" color="tinta" vacio="$0" /></LineaGuia>
          <LineaGuia etiqueta="Egresos"><Cifra valor={-egresos} escala="pesos" vacio="$0" /></LineaGuia>
          <p className="m-0 -mt-1 mb-1 text-right text-[13px] text-cuaderno-grafito">rendiciones, compras y subcontratos</p>
          <LineaGuia etiqueta="Margen">
            <span className={margen !== null && parseFloat(margen) < 0 ? "text-cuaderno-roja" : ""}>
              {margen !== null ? `${margen.replace(".", ",")}%` : "—"}
            </span>
          </LineaGuia>
          {ingresos === 0 && <p className="m-0 text-right text-[13px] text-cuaderno-grafito">sin ingresos anotados</p>}

          <div className="mt-4">
            <p className="m-0 mb-1 text-[16px] text-cuaderno-grafito">En qué se fue el egreso</p>
            {egresos === 0 ? (
              <p className="m-0 text-[15px] text-cuaderno-grafito">Sin egresos este período.</p>
            ) : (
              <div className="space-y-2.5">
                {[
                  { label: "Rendiciones",       val: egrPorFuente.rendicion },
                  { label: "Órdenes de compra", val: egrPorFuente.oc },
                  { label: "Subcontratos",      val: egrPorFuente.subcontrato },
                ].map(({ label, val }) => {
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
  const hoy = new Date();
  const { empresaId } = useEmpresa();
  const [mes,  setMes]  = useState(hoy.getMonth());
  const [anio, setAnio] = useState(hoy.getFullYear());
  const [proyectos, setProyectos] = useState([]);
  const [rawData,   setRawData]   = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [busqueda,  setBusqueda]  = useState("");

  const keyActual = `${anio}-${String(mes+1).padStart(2,"0")}`;
  const anios = Array.from({length:5}, (_,i) => hoy.getFullYear()-2+i);

  // Últimos 6 meses para gráfico
  const ultimos6 = useMemo(() => Array.from({length:6}, (_,i) => {
    const d = new Date(anio, mes-5+i, 1);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
  }), [mes, anio]);

  const cargar = useCallback(async () => {
    if (!empresaId) { setLoading(false); return; }
    setLoading(true);
    try {
      // Proyectos
      const snapP = await getDocs(collection(db,"empresas",empresaId,"projects"));
      const listaP = snapP.docs.map(d => ({id:d.id,...d.data()}));
      setProyectos(listaP);

      // Datos financieros: acumular por projectId
      const acum = {}; // { [projectId]: { ingresos, egresos, egrPorFuente, proveedores:{}, flujo:{} } }

      const init = () => ({
        ingresos: 0, egresos: 0,
        egrPorFuente: { rendicion:0, oc:0, subcontrato:0 },
        proveedores: {},
        flujo: Object.fromEntries(ultimos6.map(k=>[k,{ingresos:0,egresos:0}])),
      });
      const get = (pid) => { if (!acum[pid]) acum[pid]=init(); return acum[pid]; };

      // Ingresos
      const snapI = await getDocs(collection(db,"empresas",empresaId,"finanzas_ingresos"));
      snapI.docs.forEach(d => {
        const r=d.data(); if(!r.projectId) return;
        const a=get(r.projectId); const k=mesKey(r.fecha);
        const m=parseFloat(r.monto)||0;
        if(k===keyActual) a.ingresos+=m;
        if(ultimos6.includes(k)) a.flujo[k].ingresos+=m;
      });

      // Rendiciones
      const snapR = await getDocs(collection(db,"empresas",empresaId,"rendiciones"));
      snapR.docs.forEach(d => {
        const r=d.data(); if(!r.projectId) return;
        const a=get(r.projectId); const k=mesKey(r.fechaEmision||r.fechaAprobacion);
        const m=parseFloat(r.montoAprobado)||parseFloat(r.montoSolicitado)||0;
        if(k===keyActual){ a.egresos+=m; a.egrPorFuente.rendicion+=m; }
        if(ultimos6.includes(k)) a.flujo[k].egresos+=m;
        if(r.proveedor&&m>0) a.proveedores[r.proveedor]=(a.proveedores[r.proveedor]||0)+m;
      });

      // Órdenes de compra
      const snapOC = await getDocs(collection(db,"empresas",empresaId,"purchaseOrders"));
      snapOC.docs.forEach(d => {
        const o=d.data(); if(!o.projectId) return;
        const a=get(o.projectId); const k=mesKey(o.fecha);
        const m=parseFloat(o.totalMonto)||0;
        if(k===keyActual){ a.egresos+=m; a.egrPorFuente.oc+=m; }
        if(ultimos6.includes(k)) a.flujo[k].egresos+=m;
        if(o.proveedor&&m>0) a.proveedores[o.proveedor]=(a.proveedores[o.proveedor]||0)+m;
      });

      // Subcontratos
      const snapS = await getDocs(collection(db,"empresas",empresaId,"subcontratos"));
      snapS.docs.forEach(d => {
        const s=d.data(); if(!s.projectId) return;
        const a=get(s.projectId);
        const fecha=s.fechaEP||s.createdAt?.toDate?.()?.toISOString?.()?.slice(0,10)||"";
        const k=mesKey(fecha); const m=parseFloat(s.saldoPorPagarSC)||parseFloat(s.totalPagoNeto)||0;
        if(k===keyActual){ a.egresos+=m; a.egrPorFuente.subcontrato+=m; }
        if(ultimos6.includes(k)) a.flujo[k].egresos+=m;
        if(s.razonSocialSubcontratista&&m>0) a.proveedores[s.razonSocialSubcontratista]=(a.proveedores[s.razonSocialSubcontratista]||0)+m;
      });

      setRawData(acum);
    } catch(e) { console.error(e); }
    finally { setLoading(false); }
  }, [empresaId, keyActual, ultimos6]);

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
        const d = rawData[p.id] || { ingresos:0,egresos:0,egrPorFuente:{rendicion:0,oc:0,subcontrato:0},proveedores:{},flujo:{} };
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
            Ingresos, egresos y margen de cada proyecto en {MESES_FULL[mes].toLowerCase()} de {anio}.
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
