import React, { useState, useEffect, useMemo, useCallback } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useEmpresa } from "../../lib/useEmpresa";
import FinanzasPlanPagos from "./FinanzasPlanPagos";
import FinanzasDeudaImportador from "./FinanzasDeudaImportador";
import ComprobantesUploader from "./ComprobantesUploader";
import HistorialAuditoria from "./HistorialAuditoria";
import PagosDocumento from "./PagosDocumento";

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

const ESTADO_CONFIG = {
  vencido:            { label: "Vencido",          color: "bg-red-100 text-red-700",       dot: "bg-red-500"     },
  parcial:            { label: "Pago parcial",     color: "bg-amber-100 text-amber-700",   dot: "bg-amber-500"   },
  pendiente:          { label: "Pendiente",        color: "bg-blue-100 text-blue-700",     dot: "bg-blue-400"    },
  pagado:             { label: "Pagado",           color: "bg-emerald-100 text-emerald-700", dot: "bg-emerald-500" },
  anticipo_excedente: { label: "Anticipo a favor", color: "bg-slate-100 text-slate-600",   dot: "bg-slate-400"   },
};

const TIPO_DEUDA_CONFIG = {
  proveedor:  { label: "Proveedor",  color: "bg-purple-100 text-purple-700" },
  factoring:  { label: "Factoring",  color: "bg-violet-100 text-violet-700" },
  financiera: { label: "Financiera", color: "bg-indigo-100 text-indigo-700" },
};

// ─── KPI Card (mismo patrón visual que FinanzasDashboard) ─────────────────────
function KpiCard({ icon, label, value, sub, gradient, tag, tagColor }) {
  return (
    <div className="glass-card rounded-xl p-4 sm:p-5 hover:shadow-lg transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center shadow-md text-xl`}>{icon}</div>
        {tag && <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${tagColor}`}>{tag}</span>}
      </div>
      <div className="text-xl sm:text-2xl font-black text-slate-900 break-words">{value}</div>
      <div className="text-xs sm:text-sm font-semibold text-slate-600 mt-0.5">{label}</div>
      {sub && <div className="text-[11px] text-slate-400 mt-1">{sub}</div>}
    </div>
  );
}

// ─── Dona simple SVG para distribución por tipo de deuda ──────────────────────
function DonaTipoDeuda({ datos }) {
  const total = datos.reduce((s, d) => s + d.valor, 0);
  if (total <= 0) return <div className="h-40 flex items-center justify-center text-xs text-slate-300">Sin datos</div>;

  const R = 60, CX = 70, CY = 70, GROSOR = 18;
  const circ = 2 * Math.PI * R;
  let acumulado = 0;

  return (
    <div className="flex items-center gap-5">
      <svg viewBox="0 0 140 140" className="w-32 h-32 flex-shrink-0">
        <circle cx={CX} cy={CY} r={R} fill="none" stroke="#f1f5f9" strokeWidth={GROSOR} />
        {datos.map((d, i) => {
          const frac = d.valor / total;
          const dash = frac * circ;
          const gap = circ - dash;
          const offset = circ - acumulado;
          acumulado += dash;
          return (
            <circle
              key={i}
              cx={CX} cy={CY} r={R} fill="none"
              stroke={d.color} strokeWidth={GROSOR}
              strokeDasharray={`${dash} ${gap}`}
              strokeDashoffset={offset}
              transform={`rotate(-90 ${CX} ${CY})`}
              strokeLinecap="butt"
            />
          );
        })}
        <text x={CX} y={CY - 4} textAnchor="middle" fontSize="15" fontWeight="900" fill="#1e293b">{fmtM(total)}</text>
        <text x={CX} y={CY + 14} textAnchor="middle" fontSize="9" fill="#94a3b8">Total deuda</text>
      </svg>
      <div className="space-y-2 flex-1 min-w-0">
        {datos.map((d, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: d.color }} />
            <span className="text-xs font-semibold text-slate-600 flex-1 truncate">{d.label}</span>
            <span className="text-xs font-black text-slate-800">{fmtM(d.valor)}</span>
            <span className="text-[10px] text-slate-400 w-10 text-right">{total > 0 ? Math.round((d.valor / total) * 100) : 0}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Fila de acreedor en la tabla consolidada ─────────────────────────────────
// ─── Paginador reutilizable (15 en 15) ─────────────────────────────────────
function Paginador({ pagina, totalPaginas, onCambiar, totalItems, porPagina }) {
  if (totalPaginas <= 1) return null;
  const desde = (pagina - 1) * porPagina + 1;
  const hasta = Math.min(pagina * porPagina, totalItems);
  return (
    <div className="flex items-center justify-between gap-3 mt-4 pt-3 border-t border-slate-100">
      <p className="text-[11px] text-slate-400 font-semibold">
        Mostrando {desde}–{hasta} de {totalItems}
      </p>
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => onCambiar(Math.max(1, pagina - 1))}
          disabled={pagina === 1}
          className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed text-slate-600 flex items-center justify-center transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <span className="text-xs font-bold text-slate-600 px-2">{pagina} / {totalPaginas}</span>
        <button
          onClick={() => onCambiar(Math.min(totalPaginas, pagina + 1))}
          disabled={pagina === totalPaginas}
          className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed text-slate-600 flex items-center justify-center transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function FilaAcreedor({ acreedor, onVerDetalle }) {
  const tipo = TIPO_DEUDA_CONFIG[acreedor.tipoDeuda] || TIPO_DEUDA_CONFIG.proveedor;
  const tieneVencido = acreedor.saldoVencido > 0;
  return (
    <tr className="border-b border-slate-100 hover:bg-slate-50/80 transition-colors cursor-pointer" onClick={() => onVerDetalle(acreedor)}>
      <td className="py-3 px-3">
        <div className="font-bold text-sm text-slate-800">{acreedor.nombre}</div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${tipo.color}`}>{tipo.label}</span>
          {acreedor.cedidoAFactoring && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-violet-50 text-violet-600">
              vía {acreedor.entidadFactoring}
            </span>
          )}
        </div>
      </td>
      <td className="py-3 px-3 text-right text-sm font-semibold text-slate-600">{acreedor.documentos}</td>
      <td className="py-3 px-3 text-right text-sm font-black text-slate-900">{fmtM(acreedor.saldoPendiente)}</td>
      <td className="py-3 px-3 text-right">
        {tieneVencido ? (
          <span className="text-sm font-black text-red-600">{fmtM(acreedor.saldoVencido)}</span>
        ) : (
          <span className="text-sm text-slate-300">—</span>
        )}
      </td>
      <td className="py-3 px-3 text-right">
        {acreedor.maxDiasMora > 0 ? (
          <span className={`text-xs font-black px-2 py-1 rounded-lg ${acreedor.maxDiasMora > 90 ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
            {acreedor.maxDiasMora}d
          </span>
        ) : (
          <span className="text-xs text-slate-300">—</span>
        )}
      </td>
    </tr>
  );
}

// ─── Panel de detalle de un acreedor (documentos individuales) ────────────────
function PanelDetalleAcreedor({ acreedor, documentos, onClose, empresaId, onDocumentoActualizado }) {
  if (!acreedor) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-end">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:w-[480px] bg-white shadow-2xl h-full flex flex-col">
        <div className="bg-gradient-to-r from-purple-700 to-violet-600 px-5 py-4 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-white font-black text-sm leading-tight">{acreedor.nombre}</h2>
            <p className="text-purple-200 text-xs mt-0.5">{acreedor.rut || "Sin RUT registrado"}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg bg-white/20 hover:bg-white/30 text-white flex items-center justify-center transition-all">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-5 py-3 border-b border-slate-100 grid grid-cols-2 gap-3 flex-shrink-0">
          <div>
            <p className="text-[10px] text-slate-400 uppercase font-bold">Saldo pendiente</p>
            <p className="text-lg font-black text-slate-900">{fmtM(acreedor.saldoPendiente)}</p>
          </div>
          <div>
            <p className="text-[10px] text-slate-400 uppercase font-bold">Vencido</p>
            <p className={`text-lg font-black ${acreedor.saldoVencido > 0 ? "text-red-600" : "text-emerald-600"}`}>{fmtM(acreedor.saldoVencido)}</p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {documentos.map((d, i) => {
            const e = ESTADO_CONFIG[d.estado] || ESTADO_CONFIG.pendiente;
            return (
              <div key={i} className="rounded-xl border border-slate-200 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-700">Doc {d.numeroDoc || "—"} · {d.obra}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">OC: {d.oc}</p>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 flex items-center gap-1 ${e.color}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${e.dot}`} />{e.label}
                  </span>
                </div>
                <div className="flex justify-between mt-2 text-xs">
                  <span className="text-slate-500">Valor: <b className="text-slate-700">{fmt(d.valorDoc)}</b></span>
                  <span className="text-slate-500">Saldo: <b className={d.saldoPendiente > 0 ? "text-red-600" : "text-slate-700"}>{fmt(d.saldoPendiente)}</b></span>
                </div>
                {d.fechaVencimiento && (
                  <p className="text-[11px] text-slate-400 mt-1">
                    Vence: {fmtFecha(d.fechaVencimiento)}{d.diasMora > 0 && <span className="text-red-500 font-bold"> · {d.diasMora}d de mora</span>}
                  </p>
                )}
                {d.notasInternas && <p className="text-[10px] text-slate-400 mt-1 italic">{d.notasInternas}</p>}

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
              </div>
            );
          })}
        </div>
      </div>
    </div>
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

  return (
    <div className="space-y-4 sm:space-y-5 p-4 sm:p-6">

      {/* Header */}
      <div className="glass-card rounded-xl sm:rounded-2xl p-4 sm:p-6 animate-fadeInUp">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              Deuda <span className="text-purple-700">& Plan de Pagos</span>
            </h1>
            <p className="text-slate-500 text-xs sm:text-sm mt-0.5">Consolidado de proveedores, factoring y financieras</p>
          </div>
          <button onClick={cargar} disabled={loading}
            className="w-10 h-10 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-700 flex items-center justify-center transition-all disabled:opacity-40 self-end sm:self-auto" title="Actualizar">
            <svg className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>

        {/* Sub-navegación de pestañas */}
        <div className="mt-4 flex gap-2 border-b border-slate-100 -mb-4 sm:-mb-6 pb-0">
          {[
            { id: "consolidado", label: "Consolidado" },
            { id: "plan_pagos", label: "Plan de Pagos" },
            { id: "historial", label: `Historial${acreedoresHistorial.length > 0 ? ` (${acreedoresHistorial.length})` : ""}` },
            { id: "importar", label: "Importar / Agregar" },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-colors ${
                tab === t.id
                  ? "border-purple-700 text-purple-700"
                  : "border-transparent text-slate-400 hover:text-slate-600"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === "plan_pagos" ? (
        <FinanzasPlanPagos />
      ) : tab === "importar" ? (
        <FinanzasDeudaImportador onImportComplete={cargar} />
      ) : tab === "historial" ? (
        <div className="p-4 sm:p-6 space-y-4">
          <div className="glass-card rounded-xl p-4 sm:p-5">
            <p className="text-sm font-black text-slate-700 mb-1">Acreedores totalmente pagados</p>
            <p className="text-xs text-slate-400 mb-4">
              Se mueven aquí automáticamente cuando todos sus documentos llegan a saldo $0.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left border-b-2 border-slate-100">
                    <th className="py-2 px-3 text-[11px] font-black text-slate-400 uppercase">Acreedor</th>
                    <th className="py-2 px-3 text-[11px] font-black text-slate-400 uppercase text-right">Docs</th>
                    <th className="py-2 px-3 text-[11px] font-black text-slate-400 uppercase text-right">Saldo</th>
                    <th className="py-2 px-3 text-[11px] font-black text-slate-400 uppercase text-right">Vencido</th>
                    <th className="py-2 px-3 text-[11px] font-black text-slate-400 uppercase text-right">Mora</th>
                  </tr>
                </thead>
                <tbody>
                  {acreedoresHistorialPaginaActual.map((a, i) => (
                    <FilaAcreedor key={i} acreedor={a} onVerDetalle={abrirDetalle} />
                  ))}
                </tbody>
              </table>
              {acreedoresHistorial.length === 0 && (
                <p className="text-xs text-slate-400 text-center py-8">Aún no hay acreedores totalmente pagados</p>
              )}
              <Paginador
                pagina={paginaHistorial}
                totalPaginas={totalPaginasHistorial}
                onCambiar={setPaginaHistorial}
                totalItems={acreedoresHistorial.length}
                porPagina={POR_PAGINA}
              />
            </div>
          </div>
        </div>
      ) : (
      <>
      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="spinner w-10 h-10 border-purple-600" />
        </div>
      ) : documentos.length === 0 ? (
        <div className="glass-card rounded-xl p-10 flex flex-col items-center justify-center text-center gap-3">
          <span className="text-4xl">📋</span>
          <p className="text-sm font-black text-slate-700">Aún no hay deuda registrada</p>
          <p className="text-xs text-slate-400 max-w-sm">Importa el detalle de documentos desde el plan de migración para ver el consolidado aquí.</p>
        </div>
      ) : (
        <>
          {/* KPIs principales */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <KpiCard icon="💳" label="Deuda total pendiente" value={fmtM(kpis.saldoTotal)} gradient="from-purple-700 to-violet-600" sub={`${acreedores.filter(a=>a.saldoPendiente>0).length} acreedores con saldo`} />
            <KpiCard icon="⚠️" label="Deuda vencida" value={fmtM(kpis.saldoVencido)} gradient="from-red-500 to-red-600" tag={kpis.docsVencidos > 0 ? `${kpis.docsVencidos} docs` : null} tagColor="bg-red-100 text-red-700" sub="Requiere acción inmediata" />
            <KpiCard icon="✅" label="Ya pagado" value={fmtM(kpis.montoPagadoTotal)} gradient="from-emerald-500 to-teal-600" sub={`de ${fmtM(kpis.deudaBruta)} en deuda bruta total`} />
            <KpiCard icon="↩️" label="Anticipos a favor" value={fmtM(kpis.saldoAnticipos)} gradient="from-slate-500 to-slate-700" sub="Ya entregados, reducen tu deuda neta" />
          </div>

          {/* Distribución + alertas rápidas */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="glass-card rounded-xl p-4 sm:p-5 lg:col-span-2">
              <p className="text-sm font-black text-slate-700 mb-4">Distribución de deuda por tipo</p>
              <DonaTipoDeuda datos={distribTipo} />
            </div>
            <div className="glass-card rounded-xl p-4 sm:p-5">
              <p className="text-sm font-black text-slate-700 mb-3">Mayor riesgo</p>
              <div className="space-y-2">
                {acreedores
                  .filter(a => a.saldoVencido > 0)
                  .map(a => ({ ...a, _score: a.saldoVencido * Math.log10(a.maxDiasMora + 10) }))
                  .sort((a, b) => b._score - a._score)
                  .slice(0, 4)
                  .map((a, i) => (
                    <div key={i} className="flex items-center justify-between p-2.5 rounded-xl bg-red-50 border border-red-100">
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-red-700 truncate">{a.nombre}</p>
                        <p className="text-[10px] text-red-400">{a.maxDiasMora} días de mora</p>
                      </div>
                      <p className="text-xs font-black text-red-700 flex-shrink-0 ml-2">{fmtM(a.saldoVencido)}</p>
                    </div>
                  ))}
                {acreedores.filter(a => a.saldoVencido > 0).length === 0 && (
                  <p className="text-xs text-slate-400 text-center py-6">Sin deuda vencida 🎉</p>
                )}
              </div>
            </div>
          </div>

          {/* Tabla de acreedores */}
          <div className="glass-card rounded-xl p-4 sm:p-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
              <p className="text-sm font-black text-slate-700">Acreedores</p>
              <div className="flex items-center gap-2">
                <input
                  type="text" value={busqueda} onChange={e => setBusqueda(e.target.value)}
                  placeholder="Buscar acreedor..."
                  className="px-3 py-2 border-2 border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-purple-400 w-40 sm:w-56"
                />
                <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}
                  className="px-3 py-2 border-2 border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:border-purple-400 bg-white">
                  <option value="todos">Todos los tipos</option>
                  <option value="proveedor">Proveedores</option>
                  <option value="factoring">Factoring</option>
                  <option value="financiera">Financieras</option>
                </select>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left border-b-2 border-slate-100">
                    <th className="py-2 px-3 text-[11px] font-black text-slate-400 uppercase">Acreedor</th>
                    <th className="py-2 px-3 text-[11px] font-black text-slate-400 uppercase text-right cursor-pointer" onClick={() => toggleOrden("documentos")}>Docs</th>
                    <th className="py-2 px-3 text-[11px] font-black text-slate-400 uppercase text-right cursor-pointer" onClick={() => toggleOrden("saldoPendiente")}>Saldo</th>
                    <th className="py-2 px-3 text-[11px] font-black text-slate-400 uppercase text-right cursor-pointer" onClick={() => toggleOrden("saldoVencido")}>Vencido</th>
                    <th className="py-2 px-3 text-[11px] font-black text-slate-400 uppercase text-right cursor-pointer" onClick={() => toggleOrden("maxDiasMora")}>Mora</th>
                  </tr>
                </thead>
                <tbody>
                  {acreedoresPaginaActual.map((a, i) => (
                    <FilaAcreedor key={i} acreedor={a} onVerDetalle={abrirDetalle} />
                  ))}
                </tbody>
              </table>
              {acreedoresFiltrados.length === 0 && (
                <p className="text-xs text-slate-400 text-center py-8">No se encontraron acreedores con ese filtro</p>
              )}
              <Paginador
                pagina={paginaConsolidado}
                totalPaginas={totalPaginasConsolidado}
                onCambiar={setPaginaConsolidado}
                totalItems={acreedoresFiltrados.length}
                porPagina={POR_PAGINA}
              />
            </div>
          </div>
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
