import React, { useEffect } from "react";
import { useFinanzas } from "./FinanzasContext";

// ─── Estilos por tipo ─────────────────────────────────────────────────────────
const TIPO = {
  danger:  { bg: "bg-red-50",    border: "border-red-200",   icon: "⚠️",  badge: "bg-red-500",    text: "text-red-700",    label: "Crítico"   },
  warning: { bg: "bg-amber-50",  border: "border-amber-200", icon: "🔔",  badge: "bg-amber-500",  text: "text-amber-700",  label: "Atención"  },
  info:    { bg: "bg-blue-50",   border: "border-blue-200",  icon: "ℹ️",  badge: "bg-blue-400",   text: "text-blue-700",   label: "Info"      },
};

const CATEGORIA = {
  activo_doc:       { label: "Documentos",   color: "bg-purple-100 text-purple-700" },
  costo_fijo:       { label: "Costos Fijos", color: "bg-blue-100 text-blue-700"     },
  proveedor:        { label: "Proveedores",  color: "bg-amber-100 text-amber-700"   },
  activo_sin_datos: { label: "Activos",      color: "bg-slate-100 text-slate-600"   },
  ingreso_faltante: { label: "Ingresos",     color: "bg-emerald-100 text-emerald-700"},
};

// ─── Tarjeta de alerta ────────────────────────────────────────────────────────
function AlertaCard({ alerta, onNavegar }) {
  const t = TIPO[alerta.tipo];
  const c = CATEGORIA[alerta.categoria] || { label: "General", color: "bg-slate-100 text-slate-600" };
  return (
    <div className={`rounded-xl border ${t.bg} ${t.border} p-3 flex gap-3 items-start`}>
      <span className="text-base flex-shrink-0 mt-0.5">{t.icon}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className={`text-xs font-black leading-snug ${t.text}`}>{alerta.titulo}</p>
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${c.color}`}>{c.label}</span>
        </div>
        <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">{alerta.descripcion}</p>
        {alerta.accion && (
          <button
            onClick={() => onNavegar(alerta.accion)}
            className={`mt-1.5 text-[11px] font-bold underline underline-offset-2 ${t.text} hover:no-underline transition-all`}
          >
            Ir a {alerta.accion} →
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Drawer principal ─────────────────────────────────────────────────────────
export default function NotificacionesDrawer({ onNavegar }) {
  const { drawerOpen, setDrawerOpen, alertas, loadingAlertas, recalcularAlertas, alertasCriticas, totalAlertas } = useFinanzas();

  // Cerrar con Escape
  useEffect(() => {
    if (!drawerOpen) return;
    const fn = e => { if (e.key === "Escape") setDrawerOpen(false); };
    document.addEventListener("keydown", fn);
    return () => document.removeEventListener("keydown", fn);
  }, [drawerOpen, setDrawerOpen]);

  // Agrupar por tipo
  const porTipo = {
    danger:  alertas.filter(a => a.tipo === "danger"),
    warning: alertas.filter(a => a.tipo === "warning"),
    info:    alertas.filter(a => a.tipo === "info"),
  };

  const handleNavegar = (vista) => {
    setDrawerOpen(false);
    onNavegar?.(vista);
  };

  return (
    <>
      {/* Overlay */}
      <div
        className={`fixed inset-0 bg-black/30 backdrop-blur-sm z-40 transition-opacity duration-300 ${drawerOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}
        onClick={() => setDrawerOpen(false)}
      />

      {/* Drawer */}
      <div
        className={`fixed top-0 right-0 h-full w-full sm:w-96 bg-white shadow-2xl z-50 flex flex-col transition-transform duration-300 ease-in-out ${drawerOpen ? "translate-x-0" : "translate-x-full"}`}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-700 to-violet-600 px-5 py-4 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
            </div>
            <div>
              <h2 className="text-white font-black text-sm leading-tight">Notificaciones</h2>
              <p className="text-purple-200 text-xs">{totalAlertas} alerta{totalAlertas !== 1 ? "s" : ""} activa{totalAlertas !== 1 ? "s" : ""}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={recalcularAlertas}
              className="w-8 h-8 rounded-lg bg-white/20 hover:bg-white/30 text-white flex items-center justify-center transition-all"
              title="Actualizar"
            >
              <svg className={`w-3.5 h-3.5 ${loadingAlertas ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
            <button
              onClick={() => setDrawerOpen(false)}
              className="w-8 h-8 rounded-lg bg-white/20 hover:bg-white/30 text-white flex items-center justify-center transition-all"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Resumen badges */}
        {!loadingAlertas && totalAlertas > 0 && (
          <div className="flex gap-2 px-5 py-3 border-b border-slate-100 flex-shrink-0">
            {porTipo.danger.length > 0 && (
              <span className="flex items-center gap-1.5 px-2.5 py-1 bg-red-50 border border-red-200 rounded-xl text-xs font-black text-red-700">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" />
                {porTipo.danger.length} crítica{porTipo.danger.length !== 1 ? "s" : ""}
              </span>
            )}
            {porTipo.warning.length > 0 && (
              <span className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 border border-amber-200 rounded-xl text-xs font-black text-amber-700">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block" />
                {porTipo.warning.length} aviso{porTipo.warning.length !== 1 ? "s" : ""}
              </span>
            )}
            {porTipo.info.length > 0 && (
              <span className="flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 border border-blue-200 rounded-xl text-xs font-black text-blue-700">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 inline-block" />
                {porTipo.info.length} info
              </span>
            )}
          </div>
        )}

        {/* Contenido scrollable */}
        <div className="flex-1 overflow-y-auto p-5">
          {loadingAlertas ? (
            <div className="flex flex-col items-center justify-center h-48 gap-3">
              <div className="w-8 h-8 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
              <p className="text-xs text-slate-400">Calculando alertas...</p>
            </div>
          ) : totalAlertas === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 gap-3 text-center">
              <span className="text-5xl">✅</span>
              <p className="text-sm font-black text-emerald-600">Todo en orden</p>
              <p className="text-xs text-slate-400 max-w-48 leading-relaxed">No hay documentos vencidos, pagos pendientes ni datos faltantes</p>
            </div>
          ) : (
            <div className="space-y-5">

              {/* Críticas */}
              {porTipo.danger.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-2 h-2 rounded-full bg-red-500" />
                    <p className="text-xs font-black text-slate-700 uppercase tracking-wider">Críticas — acción inmediata</p>
                  </div>
                  <div className="space-y-2">
                    {porTipo.danger.map(a => <AlertaCard key={a.id} alerta={a} onNavegar={handleNavegar} />)}
                  </div>
                </div>
              )}

              {/* Avisos */}
              {porTipo.warning.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-2 h-2 rounded-full bg-amber-500" />
                    <p className="text-xs font-black text-slate-700 uppercase tracking-wider">Próximos vencimientos</p>
                  </div>
                  <div className="space-y-2">
                    {porTipo.warning.map(a => <AlertaCard key={a.id} alerta={a} onNavegar={handleNavegar} />)}
                  </div>
                </div>
              )}

              {/* Info */}
              {porTipo.info.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-2 h-2 rounded-full bg-blue-400" />
                    <p className="text-xs font-black text-slate-700 uppercase tracking-wider">Información</p>
                  </div>
                  <div className="space-y-2">
                    {porTipo.info.map(a => <AlertaCard key={a.id} alerta={a} onNavegar={handleNavegar} />)}
                  </div>
                </div>
              )}

            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-100 px-5 py-3 flex-shrink-0">
          <p className="text-[11px] text-slate-400 text-center">
            Vencimientos en ventana de 7 días · Actualizado al abrir
          </p>
        </div>
      </div>
    </>
  );
}
