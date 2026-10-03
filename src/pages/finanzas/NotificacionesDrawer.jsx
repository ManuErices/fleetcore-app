import React, { useEffect, useState } from "react";
import { useFinanzas } from "./FinanzasContext";
import { Titulo, Boton, MarcaAviso, VistoBueno, IconoCerrar, IconoActualizar, IconoBajar } from "./cuaderno";

// ─── Categoría de cada aviso, escrita (sin colores: el color es la urgencia) ──
const CATEGORIA = {
  costo_fijo:       "costos fijos",
  costo_doc:        "documento de crédito",
  proveedor:        "proveedores",
  activo_sin_datos: "activos",
  ingreso_faltante: "ingresos",
  deuda_vencida:    "deuda",
};

// ─── Un aviso ─────────────────────────────────────────────────────────────────
function AlertaCard({ alerta, onNavegar, conEnlace = true }) {
  return (
    <li className="grid grid-cols-[4.5rem_1fr] gap-2 py-2.5 border-b border-cuaderno-azul">
      <span className="pt-0.5"><MarcaAviso tipo={alerta.tipo} /></span>
      <div className="min-w-0">
        <p className="m-0 text-[17px] leading-snug">{alerta.titulo}</p>
        <p className="m-0 text-[14px] text-cuaderno-grafito leading-snug">
          {alerta.descripcion}
          {CATEGORIA[alerta.categoria] && <span>. En {CATEGORIA[alerta.categoria]}</span>}
        </p>
        {conEnlace && alerta.accion && (
          <Boton variante="texto" className="min-h-[32px] text-[15px]" onClick={() => onNavegar(alerta.accion)}>
            Ir a {alerta.accion.toLowerCase()}
          </Boton>
        )}
      </div>
    </li>
  );
}

// ─── Avisos agrupados por urgencia ────────────────────────────────────────────
// conEnlace: falso para los avisos de la sección en pantalla (ya estás ahí)
function BloquesPorTipo({ lista, onNavegar, conEnlace = true }) {
  const grupos = [
    { tipo: "danger",  titulo: "Urgentes, para hoy" },
    { tipo: "warning", titulo: "Por vencer" },
    { tipo: "info",    titulo: "Para tener en cuenta" },
  ].map(g => ({ ...g, items: lista.filter(a => a.tipo === g.tipo) })).filter(g => g.items.length);

  return (
    <div className="space-y-5">
      {grupos.map(g => (
        <div key={g.tipo}>
          <p className="m-0 text-[16px] text-cuaderno-grafito">{g.titulo} <span className="text-[14px]">({g.items.length})</span></p>
          <ul className="m-0 p-0 list-none">
            {g.items.map(a => <AlertaCard key={a.id} alerta={a} onNavegar={onNavegar} conEnlace={conEnlace} />)}
          </ul>
        </div>
      ))}
    </div>
  );
}

// ─── Panel de avisos ──────────────────────────────────────────────────────────
export default function NotificacionesDrawer({ onNavegar, seccionActiva, seccionLabel }) {
  const { drawerOpen, setDrawerOpen, alertas, loadingAlertas, recalcularAlertas, totalAlertas } = useFinanzas();
  const [verResto, setVerResto] = useState(false);

  // Cerrar con Escape
  useEffect(() => {
    if (!drawerOpen) return;
    const fn = e => { if (e.key === "Escape") setDrawerOpen(false); };
    document.addEventListener("keydown", fn);
    return () => document.removeEventListener("keydown", fn);
  }, [drawerOpen, setDrawerOpen]);

  // Al reabrir o cambiar de sección, colapsar el resto por defecto
  useEffect(() => { setVerResto(false); }, [drawerOpen, seccionActiva]);

  // Agrupar por tipo (para el resumen del encabezado)
  const porTipo = {
    danger:  alertas.filter(a => a.tipo === "danger"),
    warning: alertas.filter(a => a.tipo === "warning"),
    info:    alertas.filter(a => a.tipo === "info"),
  };

  // Separar según la sección que el usuario está viendo (por a.accion)
  const deLaSeccion = seccionActiva ? alertas.filter(a => a.accion === seccionActiva) : [];
  const resto       = seccionActiva ? alertas.filter(a => a.accion !== seccionActiva) : alertas;

  const handleNavegar = (vista) => {
    setDrawerOpen(false);
    onNavegar?.(vista);
  };

  const resumen = [
    porTipo.danger.length  && `${porTipo.danger.length} urgente${porTipo.danger.length !== 1 ? "s" : ""}`,
    porTipo.warning.length && `${porTipo.warning.length} por vencer`,
    porTipo.info.length    && `${porTipo.info.length} para tener en cuenta`,
  ].filter(Boolean).join(", ");

  return (
    <div className="cuaderno">
      {/* Fondo */}
      <div
        className={`fixed inset-0 bg-cuaderno-tinta/25 backdrop-blur-[2px] z-40 transition-opacity duration-300 motion-reduce:transition-none ${drawerOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}
        onClick={() => setDrawerOpen(false)}
      />

      {/* Tarjeta */}
      <aside
        role="dialog" aria-modal="true" aria-labelledby="avisos-titulo" aria-hidden={!drawerOpen}
        className={`fixed top-0 right-0 h-full w-full sm:w-[440px] bg-cuaderno-tarjeta border-l border-cuaderno-columna/70 z-50 flex flex-col transition-[transform,visibility] duration-300 ease-in-out motion-reduce:transition-none ${drawerOpen ? "translate-x-0 shadow-[-20px_0_40px_-20px_rgb(var(--cuaderno-tinta)/0.35)]" : "translate-x-full invisible"}`}
      >
        <header className="px-6 pt-4 pb-3 border-b-[3px] border-double border-cuaderno-margen flex items-start justify-between gap-3 flex-shrink-0">
          <div className="min-w-0">
            <Titulo as="h2" tamano="lg" id="avisos-titulo">Avisos</Titulo>
            <p className="m-0 text-[15px] text-cuaderno-grafito">
              {loadingAlertas ? "Revisando…" : totalAlertas === 0 ? "Nada pendiente" : resumen}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Boton variante="icono" onClick={recalcularAlertas} aria-label="Volver a revisar" title="Volver a revisar">
              <IconoActualizar className={loadingAlertas ? "animate-spin" : ""} />
            </Boton>
            <Boton variante="icono" onClick={() => setDrawerOpen(false)} aria-label="Cerrar avisos">
              <IconoCerrar />
            </Boton>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loadingAlertas ? (
            <p className="m-0 py-16 text-center text-[17px] text-cuaderno-grafito">Revisando vencimientos y pendientes…</p>
          ) : totalAlertas === 0 ? (
            <div className="py-16 text-center space-y-1">
              <VistoBueno tamano={30} titulo="" className="mx-auto" />
              <p className="m-0 font-ligada font-light text-[22px] leading-[1.6]">Todo en orden</p>
              <p className="m-0 text-[16px] text-cuaderno-grafito">Sin documentos vencidos, pagos pendientes ni datos que falten.</p>
            </div>
          ) : !seccionActiva ? (
            <BloquesPorTipo lista={alertas} onNavegar={handleNavegar} />
          ) : (
            <div className="space-y-6">
              {/* Avisos de la sección que se está viendo */}
              <div>
                <Titulo as="h3" tamano="sm" className="border-b border-cuaderno-azul mb-2">
                  En {(seccionLabel || seccionActiva).toLowerCase()} <span className="font-manuscrita text-[15px] text-cuaderno-grafito">({deLaSeccion.length})</span>
                </Titulo>
                {deLaSeccion.length > 0 ? (
                  <BloquesPorTipo lista={deLaSeccion} onNavegar={handleNavegar} conEnlace={false} />
                ) : (
                  <p className="m-0 py-3 flex items-center gap-2 text-[16px] text-cuaderno-verde">
                    <VistoBueno tamano={14} titulo="" /> Nada pendiente en esta sección.
                  </p>
                )}
              </div>

              {/* Resto, plegado */}
              {resto.length > 0 && (
                <div className="border-t border-cuaderno-azul pt-3">
                  <button
                    onClick={() => setVerResto(v => !v)}
                    aria-expanded={verResto}
                    className="w-full min-h-[44px] flex items-center justify-between gap-2 text-left"
                  >
                    <span className="text-[17px]">Otras secciones <span className="text-[15px] text-cuaderno-grafito">({resto.length})</span></span>
                    <IconoBajar tamano={15} className={`text-cuaderno-grafito transition-transform ${verResto ? "rotate-180" : ""}`} />
                  </button>
                  {verResto && (
                    <div className="mt-2">
                      <BloquesPorTipo lista={resto} onNavegar={handleNavegar} />
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <footer className="border-t border-cuaderno-azul px-6 py-3 flex-shrink-0">
          <p className="m-0 text-[14px] text-cuaderno-grafito text-center">Vencimientos dentro de siete días. Se revisa al abrir.</p>
        </footer>
      </aside>
    </div>
  );
}
