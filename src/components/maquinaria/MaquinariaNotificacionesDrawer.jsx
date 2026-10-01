import React, { useEffect, useState } from "react";

/*
 * Centro de notificaciones del módulo Maquinaria.
 *
 * Misma estructura y clases que el de Finanzas: cajón lateral derecho, overlay
 * con desenfoque, resumen por severidad arriba y alertas agrupadas. Lo único
 * propio es el rojo de la cabecera —el color del módulo— y las categorías, que
 * acá son documentos, contratos, mantenciones y repuestos.
 *
 * A diferencia del de Finanzas, este recibe las alertas por props en vez de
 * leerlas de un contexto: MaquinariaShell ya las calcula para el contador del
 * menú, y volver a pedirlas sería consultar Firestore dos veces por lo mismo.
 */

const SEV = {
  critica: { bg: "bg-red-50",    border: "border-red-200",    icon: "⚠️", text: "text-red-700",    label: "Crítica" },
  alta:    { bg: "bg-orange-50", border: "border-orange-200", icon: "🔔", text: "text-orange-700", label: "Alta"    },
  media:   { bg: "bg-amber-50",  border: "border-amber-200",  icon: "ℹ️", text: "text-amber-700",  label: "Media"   },
};

const CATEGORIA = {
  documento:  { label: "Documentos",   color: "bg-indigo-100 text-indigo-700" },
  contrato:   { label: "Contratos",    color: "bg-blue-100 text-blue-700"     },
  mantencion: { label: "Mantención",   color: "bg-amber-100 text-amber-700"   },
  stock:      { label: "Repuestos",    color: "bg-slate-100 text-slate-600"   },
};

const RUTA_POR_TIPO = {
  documento:  "/maquinaria/equipos",
  contrato:   "/maquinaria/contratos",
  mantencion: "/maquinaria/equipos",
  stock:      "/maquinaria/repuestos",
};

function AlertaCard({ alerta, onNavegar }) {
  const s = SEV[alerta.severidad] || SEV.media;
  const c = CATEGORIA[alerta.tipo] || { label: "General", color: "bg-slate-100 text-slate-600" };
  return (
    <div className={`rounded-xl border ${s.bg} ${s.border} p-3 flex gap-3 items-start`}>
      <span className="text-base flex-shrink-0 mt-0.5">{s.icon}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className={`text-xs font-black leading-snug ${s.text}`}>{alerta.titulo}</p>
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${c.color}`}>{c.label}</span>
        </div>
        <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">{alerta.detalle}</p>
        <button
          onClick={() => onNavegar(RUTA_POR_TIPO[alerta.tipo] || "/maquinaria")}
          className={`mt-1.5 text-[11px] font-bold underline underline-offset-2 ${s.text} hover:no-underline transition-all`}
        >
          Ir a {c.label} →
        </button>
      </div>
    </div>
  );
}

function Bloque({ titulo, punto, lista, onNavegar }) {
  if (!lista.length) return null;
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <div className={`w-2 h-2 rounded-full ${punto}`} />
        <p className="text-xs font-black text-slate-700 uppercase tracking-wider">{titulo}</p>
      </div>
      <div className="space-y-2">
        {lista.map((a) => <AlertaCard key={a.id} alerta={a} onNavegar={onNavegar} />)}
      </div>
    </div>
  );
}

export default function MaquinariaNotificacionesDrawer({
  open, onClose, alerts = [], loading = false, onRefresh, onNavegar,
}) {
  const [refrescando, setRefrescando] = useState(false);

  // Cerrar con Escape
  useEffect(() => {
    if (!open) return;
    const fn = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", fn);
    return () => document.removeEventListener("keydown", fn);
  }, [open, onClose]);

  const porSev = {
    critica: alerts.filter((a) => a.severidad === "critica"),
    alta:    alerts.filter((a) => a.severidad === "alta"),
    media:   alerts.filter((a) => a.severidad === "media"),
  };
  const total = alerts.length;

  const navegar = (ruta) => { onClose(); onNavegar?.(ruta); };

  const refrescar = async () => {
    setRefrescando(true);
    try { await onRefresh?.(); } finally { setRefrescando(false); }
  };

  return (
    <>
      <div
        className={`fixed inset-0 bg-black/30 backdrop-blur-sm z-40 transition-opacity duration-300 ${
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}
        onClick={onClose}
      />

      <div
        className={`fixed top-0 right-0 h-full w-full sm:w-96 bg-white shadow-2xl z-50 flex flex-col transition-transform duration-300 ease-in-out ${
          open ? "translate-x-0" : "translate-x-full"}`}
      >
        {/* Cabecera en el rojo del módulo, con la misma forma que la de Finanzas */}
        <div className="bg-gradient-to-r from-red-600 to-rose-600 px-5 py-4 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
            </div>
            <div>
              <h2 className="text-white font-black text-sm leading-tight">Notificaciones</h2>
              <p className="text-red-100 text-xs">{total} alerta{total !== 1 ? "s" : ""} activa{total !== 1 ? "s" : ""}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={refrescar}
              className="w-8 h-8 rounded-lg bg-white/20 hover:bg-white/30 text-white flex items-center justify-center transition-all"
              title="Actualizar">
              <svg className={`w-3.5 h-3.5 ${loading || refrescando ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
            <button onClick={onClose}
              className="w-8 h-8 rounded-lg bg-white/20 hover:bg-white/30 text-white flex items-center justify-center transition-all">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Resumen por severidad */}
        {!loading && total > 0 && (
          <div className="flex gap-2 px-5 py-3 border-b border-slate-100 flex-shrink-0 flex-wrap">
            {porSev.critica.length > 0 && (
              <span className="flex items-center gap-1.5 px-2.5 py-1 bg-red-50 border border-red-200 rounded-xl text-xs font-black text-red-700">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" />
                {porSev.critica.length} crítica{porSev.critica.length !== 1 ? "s" : ""}
              </span>
            )}
            {porSev.alta.length > 0 && (
              <span className="flex items-center gap-1.5 px-2.5 py-1 bg-orange-50 border border-orange-200 rounded-xl text-xs font-black text-orange-700">
                <span className="w-1.5 h-1.5 rounded-full bg-orange-500 inline-block" />
                {porSev.alta.length} alta{porSev.alta.length !== 1 ? "s" : ""}
              </span>
            )}
            {porSev.media.length > 0 && (
              <span className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 border border-amber-200 rounded-xl text-xs font-black text-amber-700">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block" />
                {porSev.media.length} media{porSev.media.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>
        )}

        {/* Contenido */}
        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-48 gap-3">
              <div className="w-8 h-8 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
              <p className="text-xs text-slate-400">Revisando alertas...</p>
            </div>
          ) : total === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 gap-3 text-center">
              <span className="text-5xl">✅</span>
              <p className="text-sm font-black text-emerald-600">Todo en orden</p>
              <p className="text-xs text-slate-400 max-w-48 leading-relaxed">
                Sin documentos vencidos, mantenciones atrasadas ni repuestos bajo stock
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              <Bloque titulo="Críticas — acción inmediata" punto="bg-red-500"    lista={porSev.critica} onNavegar={navegar} />
              <Bloque titulo="Requieren atención"          punto="bg-orange-500" lista={porSev.alta}    onNavegar={navegar} />
              <Bloque titulo="Próximos vencimientos"       punto="bg-amber-500"  lista={porSev.media}   onNavegar={navegar} />
            </div>
          )}
        </div>

        <div className="border-t border-slate-100 px-5 py-3 flex-shrink-0">
          <p className="text-[11px] text-slate-400 text-center">
            Documentos en ventana de 30 días · contratos en 15 · Actualizado al abrir
          </p>
        </div>
      </div>
    </>
  );
}
