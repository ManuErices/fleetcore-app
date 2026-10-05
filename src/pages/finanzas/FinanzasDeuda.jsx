import React, { useState, useEffect, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useEmpresa } from "../../lib/useEmpresa";
import FinanzasPlanPagos from "./FinanzasPlanPagos";
import FinanzasDeudaImportador from "./FinanzasDeudaImportador";
import ComprobantesUploader from "./ComprobantesUploader";
import HistorialAuditoria from "./HistorialAuditoria";
import PagosDocumento from "./PagosDocumento";
import {
  Cifra, Titulo, Hoja, LineaGuia, Boton, Campo, Resaltado, Pestanas, Paginador, FechaHoja,
  IconoActualizar, IconoCerrar, casoTitulo,
} from "./cuaderno";

// ─── Utilidades ───────────────────────────────────────────────────────────────
function fmt(n)  { return "$" + Math.round(Math.abs(n || 0)).toLocaleString("es-CL"); }
function fmtM(n) {
  if (!n && n !== 0) return "$0";
  const a = Math.abs(n);
  if (a >= 1000000) return (n < 0 ? "-" : "") + "$" + (a / 1000000).toFixed(1).replace(".", ",") + "M";
  return (n < 0 ? "-" : "") + "$" + Math.round(a).toLocaleString("es-CL");
}
function fmtFecha(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso + "T12:00:00");
    return d.toLocaleDateString("es-CL", { day: "2-digit", month: "short", year: "numeric" });
  } catch { return iso; }
}

// Estado de cada documento, resaltado a mano. "Pendiente" va sin color: es lo
// normal y no necesita llamar la atención.
const ESTADO_CONFIG = {
  vencido:            { label: "vencido",          resalte: "rosa"    },
  parcial:            { label: "pago parcial",     resalte: "durazno" },
  pendiente:          { label: "pendiente",        resalte: null      },
  pagado:             { label: "pagado",           resalte: "menta"   },
  anticipo_excedente: { label: "anticipo a favor", resalte: "lavanda" },
};

const TIPO_DEUDA_CONFIG = {
  proveedor:  { label: "Proveedor",  resalte: "lavanda" },
  factoring:  { label: "Factoring",  resalte: "durazno" },
  financiera: { label: "Financiera", resalte: "rosa"    },
};

function EstadoDocumento({ estado }) {
  const e = ESTADO_CONFIG[estado] || ESTADO_CONFIG.pendiente;
  return e.resalte
    ? <Resaltado color={e.resalte} className="text-[15px] flex-shrink-0">{e.label}</Resaltado>
    : <span className="text-[15px] text-cuaderno-grafito flex-shrink-0">{e.label}</span>;
}

function Mora({ dias }) {
  if (!(dias > 0)) return <span className="text-cuaderno-grafito">—</span>;
  return <Resaltado color={dias > 90 ? "rosa" : "durazno"} className="text-[15px]">{dias} días</Resaltado>;
}

// ─── Distribución por tipo: barras como trazos de resaltador ─────────────────
function DistribucionTipo({ datos }) {
  const total = datos.reduce((s, d) => s + d.valor, 0);
  if (total <= 0) return <p className="m-0 py-6 text-center text-[16px] text-cuaderno-grafito">Sin saldo pendiente.</p>;
  return (
    <div className="space-y-3">
      {datos.map(d => {
        const pct = Math.round((d.valor / total) * 100);
        // distribTipo entrega la etiqueta del tipo; el resaltador sale de la configuración
        const resalte = Object.values(TIPO_DEUDA_CONFIG).find(t => t.label === d.label)?.resalte;
        return (
          <div key={d.label}>
            <div className="flex items-baseline justify-between gap-3 text-[17px]">
              <span>{d.label}</span>
              <span className="flex items-baseline gap-3">
                <Cifra valor={d.valor} escala="pesos" />
                <span className="w-10 text-right text-[15px] text-cuaderno-grafito">{pct}%</span>
              </span>
            </div>
            <div className="mt-1 h-2.5 bg-cuaderno-renglon/60 rounded-sm overflow-hidden">
              <div className={`h-full rounded-sm ${
                resalte === "durazno" ? "bg-cuaderno-durazno" : resalte === "rosa" ? "bg-cuaderno-rosa" : "bg-cuaderno-lavanda"}`}
                style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
      <div className="pt-1">
        <LineaGuia etiqueta="Total">
          <Cifra valor={total} escala="pesos" raya="total" />
        </LineaGuia>
      </div>
    </div>
  );
}

// ─── Tabla de acreedores ──────────────────────────────────────────────────────
function EncabezadoTabla({ onOrdenar, orden }) {
  const col = (campo, label) => {
    const activo = orden?.campo === campo;
    const contenido = <>{label}{activo && <span aria-hidden="true">{orden.dir === "desc" ? " ↓" : " ↑"}</span>}</>;
    return (
      <th className="font-normal text-[15px] text-right px-3 py-2"
        aria-sort={activo ? (orden.dir === "desc" ? "descending" : "ascending") : undefined}>
        {onOrdenar
          ? <button onClick={() => onOrdenar(campo)} className="min-h-[36px] text-cuaderno-grafito hover:text-cuaderno-tinta">{contenido}</button>
          : <span className="text-cuaderno-grafito">{label}</span>}
      </th>
    );
  };
  return (
    <thead>
      <tr className="shadow-[inset_0_-1.5px_0_rgb(var(--cuaderno-tinta))]">
        <th className="font-normal text-[15px] text-left text-cuaderno-grafito px-3 py-2">Acreedor</th>
        {col("documentos", "Docs.")}
        {col("saldoPendiente", "Saldo")}
        {col("saldoVencido", "Vencido")}
        {col("maxDiasMora", "Mora")}
      </tr>
    </thead>
  );
}

function FilaAcreedor({ acreedor, onVerDetalle }) {
  const tipo = TIPO_DEUDA_CONFIG[acreedor.tipoDeuda] || TIPO_DEUDA_CONFIG.proveedor;
  const tieneVencido = acreedor.saldoVencido > 0;
  return (
    <tr className="border-b border-cuaderno-renglon hover:bg-cuaderno-papel cursor-pointer focus:outline-none focus-visible:bg-cuaderno-papel"
      tabIndex={0}
      onClick={() => onVerDetalle(acreedor)}
      onKeyDown={e => { if (e.key === "Enter") onVerDetalle(acreedor); }}>
      <td className="py-2 px-3">
        <div className="text-[17px] leading-tight">{casoTitulo(acreedor.nombre)}</div>
        <div className="text-[13px] text-cuaderno-grafito">
          {tipo.label.toLowerCase()}{acreedor.cedidoAFactoring && `, vía ${acreedor.entidadFactoring}`}
        </div>
      </td>
      <td className="py-2 px-3 text-right text-[16px] text-cuaderno-grafito">{acreedor.documentos}</td>
      <td className="py-2 px-3 text-right text-[16px]"><Cifra valor={acreedor.saldoPendiente} escala="pesos" vacio="$0" /></td>
      <td className="py-2 px-3 text-right text-[16px]">
        {tieneVencido ? <Cifra valor={acreedor.saldoVencido} escala="pesos" color="roja" /> : <span className="text-cuaderno-grafito">—</span>}
      </td>
      <td className="py-2 px-3 text-right"><Mora dias={acreedor.maxDiasMora} /></td>
    </tr>
  );
}

// ─── Panel de detalle de un acreedor (documentos individuales) ────────────────
// Se monta en <body>: dentro de la pantalla heredaba el margen de space-y y
// quedaba corrido hacia abajo.
function PanelDetalleAcreedor({ acreedor, documentos, onClose, empresaId, onDocumentoActualizado }) {
  if (!acreedor) return null;
  return createPortal(
    <div className="cuaderno fixed inset-0 z-50 flex items-stretch justify-end">
      <div className="absolute inset-0 bg-cuaderno-tinta/25 backdrop-blur-[2px]" onClick={onClose} />
      <aside role="dialog" aria-modal="true" aria-labelledby="panel-acreedor-titulo"
        className="relative w-full sm:w-[500px] bg-cuaderno-tarjeta border-l border-cuaderno-columna/70 h-full flex flex-col shadow-[-20px_0_40px_-20px_rgb(var(--cuaderno-tinta)/0.35)]">
        <header className="px-6 pt-5 pb-3 border-b-[3px] border-double border-cuaderno-margen flex items-start justify-between gap-3 flex-shrink-0">
          <div className="min-w-0">
            <p className="m-0 text-[15px] text-cuaderno-grafito">{acreedor.rut || "Sin RUT registrado"}</p>
            <Titulo as="h2" tamano="lg" id="panel-acreedor-titulo" className="break-words">{casoTitulo(acreedor.nombre)}</Titulo>
          </div>
          <Boton variante="icono" onClick={onClose} aria-label="Cerrar detalle"><IconoCerrar /></Boton>
        </header>

        <div className="px-6 py-3 border-b border-cuaderno-azul flex-shrink-0">
          <LineaGuia etiqueta="Saldo pendiente" className="text-[18px]">
            <Cifra valor={acreedor.saldoPendiente} escala="pesos" vacio="$0" raya="doble" />
          </LineaGuia>
          <LineaGuia etiqueta="Vencido" className="text-[18px]">
            {acreedor.saldoVencido > 0
              ? <Cifra valor={acreedor.saldoVencido} escala="pesos" color="roja" />
              : <span className="text-cuaderno-verde">nada vencido</span>}
          </LineaGuia>
        </div>

        <div className="flex-1 overflow-y-auto px-6">
          <h3 className="m-0 pt-4 pb-1 text-[16px] text-cuaderno-grafito">
            {documentos.length} documento{documentos.length !== 1 ? "s" : ""}
          </h3>
          {documentos.map((d, i) => (
            <article key={i} className="py-3 border-b border-cuaderno-azul">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="m-0 text-[17px] leading-tight">Documento {d.numeroDoc || "sin número"}{d.obra && `, ${d.obra}`}</p>
                  <p className="m-0 text-[14px] text-cuaderno-grafito">OC {d.oc || "sin número"}</p>
                </div>
                <EstadoDocumento estado={d.estado} />
              </div>
              <div className="mt-1.5 grid grid-cols-2 gap-x-6 text-[16px]">
                <LineaGuia etiqueta="Valor" className="min-h-[30px] text-[16px]"><Cifra valor={d.valorDoc} escala="pesos" color="tinta" vacio="$0" /></LineaGuia>
                <LineaGuia etiqueta="Saldo" className="min-h-[30px] text-[16px]">
                  <Cifra valor={d.saldoPendiente} escala="pesos" color={d.saldoPendiente > 0 ? "roja" : "tinta"} vacio="$0" />
                </LineaGuia>
              </div>
              {d.fechaVencimiento && (
                <p className="m-0 text-[14px] text-cuaderno-grafito">
                  Vence el {fmtFecha(d.fechaVencimiento)}
                  {d.diasMora > 0 && <span className="text-cuaderno-roja">, con {d.diasMora} días de mora</span>}
                </p>
              )}
              {d.notasInternas && <p className="m-0 mt-1 text-[14px] text-cuaderno-grafito">Nota: {d.notasInternas}</p>}

              {d.id && (
                <ComprobantesUploader
                  empresaId={empresaId}
                  documentoId={d.id}
                  comprobantes={d.comprobantes || []}
                  onCambio={(nuevosComprobantes) => onDocumentoActualizado?.(d.id, { comprobantes: nuevosComprobantes })}
                />
              )}
              {d.id && (
                <PagosDocumento
                  empresaId={empresaId}
                  documento={d}
                  onDocumentoActualizado={(docActualizado) => onDocumentoActualizado?.(d.id, { ...docActualizado })}
                />
              )}
              {d.id && (
                <HistorialAuditoria empresaId={empresaId} documentoId={d.id} />
              )}
            </article>
          ))}
        </div>
      </aside>
    </div>,
    document.body
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function FinanzasDeuda() {
  const { empresaId } = useEmpresa();
  const [tab, setTab] = useState("consolidado"); // "consolidado" | "plan_pagos" | "historial" | "importar"
  const [documentos, setDocumentos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtroTipo, setFiltroTipo] = useState("todos");
  const [busqueda, setBusqueda] = useState("");
  const [acreedorSeleccionado, setAcreedorSeleccionado] = useState(null);
  const [orden, setOrden] = useState({ campo: "saldoPendiente", dir: "desc" });
  const POR_PAGINA = 15;
  const [paginaConsolidado, setPaginaConsolidado] = useState(1);
  const [paginaHistorial, setPaginaHistorial] = useState(1);

  const cargar = useCallback(async () => {
    if (!empresaId) { setLoading(false); return; }
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, "empresas", empresaId, "deuda_proveedores"));
      setDocumentos(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error("Error cargando deuda_proveedores:", e);
    }
    setLoading(false);
  }, [empresaId]);

  useEffect(() => { cargar(); }, [cargar]);

  // Actualiza en memoria UN documento con los campos que cambiaron, sin
  // recargar toda la colección. cambiosParciales es un objeto de merge
  // (ej. { comprobantes: [...] } o { saldoPendiente, estado, ... }).
  function handleDocumentoActualizado(documentoId, cambiosParciales) {
    setDocumentos(prev => prev.map(d =>
      d.id === documentoId ? { ...d, ...cambiosParciales } : d
    ));
  }

  // ── Agregación por acreedor ──────────────────────────────────────────────
  const acreedores = useMemo(() => {
    const mapa = {};
    documentos.forEach(d => {
      const key = d.proveedorSlug || d.proveedorNombre;
      if (!mapa[key]) {
        mapa[key] = {
          nombre: d.proveedorNombre, rut: d.rut, tipoDeuda: d.tipoDeuda || "proveedor",
          documentos: 0, saldoPendiente: 0, saldoVencido: 0, maxDiasMora: 0,
          cedidoAFactoring: false, entidadFactoring: null,
        };
      }
      const a = mapa[key];
      a.documentos += 1;
      a.saldoPendiente += d.saldoPendiente || 0;
      if (d.estado === "vencido") a.saldoVencido += d.saldoPendiente || 0;
      if ((d.diasMora || 0) > a.maxDiasMora) a.maxDiasMora = d.diasMora;
      if (d.cedidoAFactoring) { a.cedidoAFactoring = true; a.entidadFactoring = d.entidadFactoring; }
    });
    return Object.values(mapa);
  }, [documentos]);

  // Un acreedor pasa a "Historial" cuando TODOS sus documentos están en
  // saldoPendiente === 0 (totalmente pagado) — automático, sin botón manual,
  // sacando ruido de Consolidado sin tener que archivar nada a mano.
  const acreedoresActivos = useMemo(
    () => acreedores.filter(a => a.saldoPendiente !== 0),
    [acreedores]
  );
  const acreedoresHistorial = useMemo(
    () => acreedores.filter(a => a.saldoPendiente === 0 && a.documentos > 0),
    [acreedores]
  );

  const acreedoresFiltrados = useMemo(() => {
    let lista = acreedoresActivos;
    if (filtroTipo !== "todos") lista = lista.filter(a => a.tipoDeuda === filtroTipo);
    if (busqueda.trim()) {
      const q = busqueda.trim().toUpperCase();
      lista = lista.filter(a => a.nombre.toUpperCase().includes(q));
    }
    lista = [...lista].sort((a, b) => {
      const va = a[orden.campo] ?? 0, vb = b[orden.campo] ?? 0;
      return orden.dir === "desc" ? vb - va : va - vb;
    });
    return lista;
  }, [acreedoresActivos, filtroTipo, busqueda, orden]);

  // Reinicia a la página 1 cada vez que cambia el filtro/búsqueda/orden,
  // para no quedar viendo una página que ya no tiene resultados.
  useEffect(() => { setPaginaConsolidado(1); }, [filtroTipo, busqueda, orden]);

  const totalPaginasConsolidado = Math.max(1, Math.ceil(acreedoresFiltrados.length / POR_PAGINA));
  const acreedoresPaginaActual = useMemo(() => {
    const inicio = (paginaConsolidado - 1) * POR_PAGINA;
    return acreedoresFiltrados.slice(inicio, inicio + POR_PAGINA);
  }, [acreedoresFiltrados, paginaConsolidado]);

  const totalPaginasHistorial = Math.max(1, Math.ceil(acreedoresHistorial.length / POR_PAGINA));
  const acreedoresHistorialPaginaActual = useMemo(() => {
    const inicio = (paginaHistorial - 1) * POR_PAGINA;
    return acreedoresHistorial.slice(inicio, inicio + POR_PAGINA);
  }, [acreedoresHistorial, paginaHistorial]);

  // ── KPIs globales ────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    let saldoTotal = 0, saldoVencido = 0, saldoAnticipos = 0, deudaBruta = 0, montoPagadoTotal = 0;
    let docsVencidos = 0, docsPendientes = 0;
    documentos.forEach(d => {
      saldoTotal += d.saldoPendiente || 0;
      montoPagadoTotal += d.montoPagado || 0;
      deudaBruta += d.valorDoc || 0;
      if (d.estado === "vencido") { saldoVencido += d.saldoPendiente || 0; docsVencidos++; }
      if (d.estado === "pendiente" || d.estado === "parcial") docsPendientes++;
      if (d.estado === "anticipo_excedente") saldoAnticipos += d.saldoPendiente || 0;
    });
    return { saldoTotal, saldoVencido, saldoAnticipos, deudaBruta, montoPagadoTotal, docsVencidos, docsPendientes };
  }, [documentos]);

  const distribTipo = useMemo(() => {
    const m = { proveedor: 0, factoring: 0, financiera: 0 };
    documentos.forEach(d => { if (d.saldoPendiente > 0) m[d.tipoDeuda || "proveedor"] = (m[d.tipoDeuda || "proveedor"] || 0) + d.saldoPendiente; });
    const colores = { proveedor: "#7c3aed", factoring: "#a78bfa", financiera: "#6366f1" };
    return Object.entries(m).filter(([,v]) => v > 0).map(([k,v]) => ({ label: TIPO_DEUDA_CONFIG[k]?.label || k, valor: v, color: colores[k] }));
  }, [documentos]);

  const documentosDelSeleccionado = useMemo(() => {
    if (!acreedorSeleccionado) return [];
    return documentos.filter(d => d.proveedorNombre === acreedorSeleccionado.nombre);
  }, [documentos, acreedorSeleccionado]);

  function abrirDetalle(acreedor) {
    setAcreedorSeleccionado(acreedor);
  }

  function toggleOrden(campo) {
    setOrden(o => o.campo === campo ? { campo, dir: o.dir === "desc" ? "asc" : "desc" } : { campo, dir: "desc" });
  }

  const conVencido = acreedores
    .filter(a => a.saldoVencido > 0)
    .map(a => ({ ...a, _score: a.saldoVencido * Math.log10(a.maxDiasMora + 10) }))
    .sort((a, b) => b._score - a._score)
    .slice(0, 4);
  const acreedoresConSaldo = acreedores.filter(a => a.saldoPendiente > 0).length;

  return (
    <div className="cuaderno px-8 pt-5 pb-10 space-y-5">

      <FechaHoja />

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Titulo>Deuda y plan de pagos</Titulo>
          <p className="m-0 text-[17px] text-cuaderno-grafito">Proveedores, factoring y financieras.</p>
        </div>
        <Boton onClick={cargar} disabled={loading}>
          <IconoActualizar tamano={15} className={loading ? "animate-spin" : ""} />
          {loading ? "Actualizando…" : "Actualizar"}
        </Boton>
      </header>

      <Pestanas
        valor={tab}
        onCambiar={setTab}
        opciones={[
          { id: "consolidado", label: "Consolidado" },
          { id: "plan_pagos", label: "Plan de pagos" },
          { id: "historial", label: `Historial${acreedoresHistorial.length > 0 ? ` (${acreedoresHistorial.length})` : ""}` },
          { id: "importar", label: "Importar o agregar" },
        ]}
      />

      {tab === "plan_pagos" ? (
        <FinanzasPlanPagos />
      ) : tab === "importar" ? (
        <FinanzasDeudaImportador onImportComplete={cargar} />
      ) : tab === "historial" ? (
        <Hoja titulo="Acreedores pagados por completo"
          extra={<p className="m-0 text-[15px] text-cuaderno-grafito max-w-sm">Pasan aquí solos cuando todos sus documentos quedan en $0.</p>}>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <EncabezadoTabla />
              <tbody>
                {acreedoresHistorialPaginaActual.map((a, i) => (
                  <FilaAcreedor key={i} acreedor={a} onVerDetalle={abrirDetalle} />
                ))}
              </tbody>
            </table>
            {acreedoresHistorial.length === 0 && (
              <p className="m-0 py-8 text-center text-[16px] text-cuaderno-grafito">Aún no hay acreedores pagados por completo.</p>
            )}
            <Paginador
              pagina={paginaHistorial}
              totalPaginas={totalPaginasHistorial}
              onCambiar={setPaginaHistorial}
              totalItems={acreedoresHistorial.length}
              porPagina={POR_PAGINA}
            />
          </div>
        </Hoja>
      ) : (
      <>
      {loading ? (
        <p className="m-0 py-16 text-center text-[18px] text-cuaderno-grafito">Buscando los documentos…</p>
      ) : documentos.length === 0 ? (
        <Hoja cuerpo="px-6 py-10 text-center space-y-3">
          <p className="m-0 font-ligada font-light text-[22px] leading-[1.6]">Aún no hay deuda anotada</p>
          <p className="m-0 text-[16px] text-cuaderno-grafito max-w-md mx-auto">
            Importa el detalle de documentos desde el Excel de proveedores o agrega uno a mano.
          </p>
          <Boton variante="primario" onClick={() => setTab("importar")}>Importar documentos</Boton>
        </Hoja>
      ) : (
        <>
          {/* Resumen, distribución y mayor riesgo */}
          <div className="grid gap-5 lg:grid-cols-3">
            <Hoja titulo="Resumen">
              <LineaGuia etiqueta="Deuda pendiente"><Cifra valor={kpis.saldoTotal} escala="pesos" vacio="$0" /></LineaGuia>
              <p className="m-0 -mt-1 mb-1 text-right text-[13px] text-cuaderno-grafito">{acreedoresConSaldo} acreedores con saldo</p>
              <LineaGuia etiqueta="Vencida"><Cifra valor={kpis.saldoVencido} escala="pesos" color="roja" vacio="$0" /></LineaGuia>
              {kpis.docsVencidos > 0 && <p className="m-0 -mt-1 mb-1 text-right text-[13px] text-cuaderno-roja">{kpis.docsVencidos} documentos vencidos</p>}
              <LineaGuia etiqueta="Ya pagado"><Cifra valor={kpis.montoPagadoTotal} escala="pesos" vacio="$0" /></LineaGuia>
              <p className="m-0 -mt-1 mb-1 text-right text-[13px] text-cuaderno-grafito">de <Cifra valor={kpis.deudaBruta} escala="pesos" color="heredar" vacio="$0" /> en deuda bruta</p>
              <LineaGuia etiqueta="Anticipos a favor"><Cifra valor={kpis.saldoAnticipos} escala="pesos" vacio="$0" /></LineaGuia>
            </Hoja>

            <Hoja titulo="Por tipo de deuda">
              <DistribucionTipo datos={distribTipo} />
            </Hoja>

            <Hoja titulo="Mayor riesgo">
              {conVencido.length > 0 ? (
                <ul className="m-0 p-0 list-none">
                  {conVencido.map((a, i) => (
                    <li key={i}>
                      <button onClick={() => abrirDetalle(a)}
                        className="w-full text-left flex items-center justify-between gap-3 min-h-[48px] border-b border-cuaderno-renglon hover:bg-cuaderno-papel px-1">
                        <span className="min-w-0">
                          <span className="block text-[17px] leading-tight truncate">{casoTitulo(a.nombre)}</span>
                          <span className="block text-[13px] text-cuaderno-roja">{a.maxDiasMora} días de mora</span>
                        </span>
                        <Cifra valor={a.saldoVencido} escala="pesos" color="roja" className="text-[16px] flex-shrink-0" />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="m-0 py-6 text-center text-[16px] text-cuaderno-verde">Sin deuda vencida.</p>
              )}
            </Hoja>
          </div>

          {/* Tabla de acreedores */}
          <Hoja titulo="Acreedores"
            extra={
              <>
                <Campo etiqueta="Buscar" type="search" className="w-48"
                  value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Nombre del acreedor" />
                <Campo as="select" etiqueta="Tipo" value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}>
                  <option value="todos">Todos</option>
                  <option value="proveedor">Proveedores</option>
                  <option value="factoring">Factoring</option>
                  <option value="financiera">Financieras</option>
                </Campo>
              </>
            }>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <EncabezadoTabla onOrdenar={toggleOrden} orden={orden} />
                <tbody>
                  {acreedoresPaginaActual.map((a, i) => (
                    <FilaAcreedor key={i} acreedor={a} onVerDetalle={abrirDetalle} />
                  ))}
                </tbody>
              </table>
              {acreedoresFiltrados.length === 0 && (
                <p className="m-0 py-8 text-center text-[16px] text-cuaderno-grafito">Ningún acreedor coincide con la búsqueda.</p>
              )}
              <Paginador
                pagina={paginaConsolidado}
                totalPaginas={totalPaginasConsolidado}
                onCambiar={setPaginaConsolidado}
                totalItems={acreedoresFiltrados.length}
                porPagina={POR_PAGINA}
              />
            </div>
          </Hoja>
        </>
      )}

      {acreedorSeleccionado && (
        <PanelDetalleAcreedor
          acreedor={acreedorSeleccionado}
          documentos={documentosDelSeleccionado}
          onClose={() => setAcreedorSeleccionado(null)}
          empresaId={empresaId}
          onDocumentoActualizado={handleDocumentoActualizado}
        />
      )}
      </>
      )}
    </div>
  );
}
