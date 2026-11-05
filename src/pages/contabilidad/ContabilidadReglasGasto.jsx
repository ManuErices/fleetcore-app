/**
 * ContabilidadReglasGasto.jsx — src/pages/contabilidad/ContabilidadReglasGasto.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Panel para revisar y reparar las reglas de auto-clasificación por proveedor.
 *
 * Existe porque el importador venía guardando una "regla aprendida" por cada
 * asiento importado, sin que nadie hubiera reclasificado nada: lo que salía del
 * regex genérico se persistía como decisión del usuario y después tenía
 * prioridad sobre todo. Esas reglas ya están en Firestore y hay que limpiarlas.
 */

import React, { useMemo, useState } from "react";
import { useContabilidad, fmt, normalizaRut } from "./ContabilidadContext";
import {
  Titulo, Hoja, Resaltado, Nota, VistoBueno, Boton, Campo, FechaHoja, IconoBorrar,
} from "../finanzas/cuaderno";

const ORIGENES = {
  usuario:   { label: "Elegida por ti",    resaltado: "menta",   desc: "Reclasificaste este proveedor a mano" },
  auto:      { label: "Generada sola",     resaltado: "durazno", desc: "La guardó el importador sin intervención — revísala" },
  historial: { label: "Deducida del uso",  resaltado: "lavanda", desc: "Inferida de cómo clasificaste a este proveedor antes" },
};

export default function ContabilidadReglasGasto() {
  const {
    cuentas, reglasGasto, reglasDesdeHistorial,
    guardarReglaGasto, eliminarReglaGasto, limpiarReglasAutomaticas, repararNombresProveedores,
  } = useContabilidad();

  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro]     = useState("todas");
  const [limpiando, setLimpiando] = useState(false);
  const [reparando, setReparando] = useState(false);
  const [aviso, setAviso]       = useState(null);

  const historial = useMemo(() => reglasDesdeHistorial(), [reglasDesdeHistorial]);

  const filas = useMemo(() => {
    const mapa = {};
    // Reglas guardadas
    Object.entries(reglasGasto).forEach(([rut, r]) => {
      mapa[rut] = { rut, ...r, origen: r.origen || "auto", guardada: true };
    });
    // Deducciones del historial que todavía no tienen regla propia
    Object.entries(historial).forEach(([rut, h]) => {
      if (mapa[rut]) { mapa[rut].sugerenciaHistorial = h; return; }
      mapa[rut] = { rut, ...h, origen: "historial", guardada: false, razonSocial: "" };
    });
    return Object.values(mapa).sort((a, b) =>
      (a.razonSocial || a.rut).localeCompare(b.razonSocial || b.rut));
  }, [reglasGasto, historial]);

  const visibles = filas.filter(f => {
    if (filtro !== "todas" && f.origen !== filtro) return false;
    if (!busqueda.trim()) return true;
    const q = busqueda.trim().toLowerCase();
    return (f.razonSocial || "").toLowerCase().includes(q)
        || (f.rut || "").toLowerCase().includes(q)
        || (f.cuentaNombre || "").toLowerCase().includes(q);
  });

  const conteo = {
    usuario:   filas.filter(f => f.origen === "usuario").length,
    auto:      filas.filter(f => f.origen === "auto").length,
    historial: filas.filter(f => f.origen === "historial").length,
  };

  // Discrepancias: la regla guardada dice una cuenta y el historial dice otra
  const discrepantes = filas.filter(f =>
    f.sugerenciaHistorial && f.sugerenciaHistorial.cuentaId !== f.cuentaId);

  const cambiarCuenta = async (fila, cuentaId) => {
    const c = cuentas.find(x => x.id === cuentaId);
    if (!c) return;
    await guardarReglaGasto(fila.rut, fila.razonSocial, {
      cuentaId: c.id, cuentaNombre: c.nombre,
      categoriaLabel: c.nombre, categoriaIcon: "🏷",
      origen: "usuario",           // corregida a mano: ahora sí es una decisión
    });
    setAviso({ ok: true, texto: `${fila.razonSocial || fila.rut} → ${c.nombre}` });
  };

  const limpiar = async () => {
    if (!window.confirm(
      `Se eliminarán ${conteo.auto} regla(s) que el importador guardó sin intervención tuya.\n\n` +
      `Las que elegiste a mano no se tocan. Los proveedores afectados volverán a ` +
      `clasificarse por su nombre y por el historial, que es lo correcto.`
    )) return;
    setLimpiando(true);
    try {
      const n = await limpiarReglasAutomaticas();
      setAviso({ ok: true, texto: `${n} regla(s) eliminada(s)` });
    } catch (e) {
      setAviso({ ok: false, texto: e.message });
    }
    setLimpiando(false);
  };

  // Nombres que quedaron con caracteres corruptos por leer el CSV como Latin-1
  const corruptos = filas.filter(f => /[ÃÂ]/.test(f.razonSocial || "")).length;

  const repararNombres = async () => {
    setReparando(true);
    try {
      const n = await repararNombresProveedores();
      setAviso({ ok: true, texto: n ? `${n} nombre(s) corregido(s)` : "No había nombres que corregir" });
    } catch (e) { setAviso({ ok: false, texto: e.message }); }
    setReparando(false);
  };

  const cuentasGasto = cuentas
    .filter(c => c.activa !== false && ["costo", "gasto_adm", "gasto_fin", "otro_resultado"].includes(c.tipo))
    .sort((a, b) => (a.codigo || "").localeCompare(b.codigo || ""));

  return (
    <div className="cuaderno px-8 pt-5 pb-10 space-y-5">

      <FechaHoja />

      <header>
        <p className="m-0 text-[15px] text-cuaderno-grafito">Importación</p>
        <Titulo>Reglas de clasificación</Titulo>
        <p className="m-0 text-[17px] text-cuaderno-grafito">Qué cuenta se asigna a cada proveedor al importar el RCV</p>
      </header>

      {/* Contadores (filtran la tabla) */}
      <Hoja titulo="Por origen">
        <div className="grid gap-x-10 gap-y-2 sm:grid-cols-3">
          {Object.entries(ORIGENES).map(([k, o]) => {
            const activo = filtro === k;
            return (
              <button key={k} type="button" aria-pressed={activo} onClick={() => setFiltro(activo ? "todas" : k)}
                className={`text-left rounded-md px-3 py-2 border-[1.5px] focus:outline-none focus-visible:ring-2 focus-visible:ring-cuaderno-tinta/40 ${
                  activo ? "border-cuaderno-tinta bg-cuaderno-papel" : "border-transparent hover:bg-cuaderno-papel"}`}>
                <div className="flex items-baseline justify-between gap-3 text-[18px]">
                  <Resaltado color={o.resaltado}>{o.label}</Resaltado>
                  <span className="text-[22px]">{conteo[k]}</span>
                </div>
                <p className="m-0 mt-1 text-[14px] leading-snug text-cuaderno-grafito">{o.desc}</p>
              </button>
            );
          })}
        </div>
      </Hoja>

      {conteo.auto > 0 && (
        <Hoja>
          <div className="pt-4 flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex-1 space-y-1">
              <Nota etiqueta="Ojo:">Hay {conteo.auto} regla(s) que se guardaron solas.</Nota>
              <p className="m-0 text-[15px] leading-snug text-cuaderno-grafito">
                El importador las creaba por cada asiento, aunque nadie hubiera reclasificado.
                Como tienen prioridad sobre la clasificación por nombre, congelan la cuenta
                equivocada. Limpiarlas es seguro: lo que elegiste a mano se conserva.
              </p>
            </div>
            <Boton variante="primario" onClick={limpiar} disabled={limpiando} className="whitespace-nowrap">
              {limpiando ? "Limpiando…" : "Limpiar reglas automáticas"}
            </Boton>
          </div>
        </Hoja>
      )}

      {corruptos > 0 && (
        <Hoja>
          <div className="pt-4 flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex-1 space-y-1">
              <Nota etiqueta="Nota:">{corruptos} proveedor(es) con el nombre mal codificado.</Nota>
              <p className="m-0 text-[15px] leading-snug text-cuaderno-grafito">
                El CSV del SII venía en UTF-8 y se leía como Latin-1, así que "ÓPTICA" quedó
                guardado como "Ã“PTICA". La lectura ya está arreglada; esto corrige lo que
                quedó en la base.
              </p>
            </div>
            <Boton onClick={repararNombres} disabled={reparando} className="whitespace-nowrap">
              {reparando ? "Corrigiendo…" : "Corregir nombres"}
            </Boton>
          </div>
        </Hoja>
      )}

      {discrepantes.length > 0 && (
        <div className="space-y-1">
          <Nota etiqueta="Ojo:">{discrepantes.length} proveedor(es) con la regla en desacuerdo con el historial.</Nota>
          <p className="m-0 text-[15px] leading-snug text-cuaderno-grafito">
            La regla apunta a una cuenta, pero en los asientos ya registrados usaste otra.
            Revísalos abajo: aparecen con la sugerencia al lado.
          </p>
        </div>
      )}

      {aviso && (aviso.ok
        ? <p className="m-0 flex items-center gap-2 text-[17px] text-cuaderno-verde"><VistoBueno tamano={15} titulo="" />{aviso.texto}</p>
        : <Nota etiqueta="Ojo:">{aviso.texto}</Nota>)}

      <Hoja titulo="Proveedores"
        extra={
          <Campo etiqueta="Buscar" type="search" className="w-72"
            placeholder="Proveedor, RUT o cuenta"
            value={busqueda} onChange={e => setBusqueda(e.target.value)} />
        }>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse" style={{ minWidth: 760 }}>
            <thead>
              <tr className="shadow-[inset_0_-1.5px_0_rgb(var(--cuaderno-tinta))]">
                {["Proveedor", "RUT", "Origen", "Cuenta asignada"].map(h => (
                  <th key={h} className="font-normal text-[15px] text-cuaderno-grafito text-left px-2 py-2 whitespace-nowrap">{h}</th>
                ))}
                <th className="w-12"><span className="sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody>
              {visibles.map(f => {
                const o = ORIGENES[f.origen] || ORIGENES.auto;
                const disc = f.sugerenciaHistorial && f.sugerenciaHistorial.cuentaId !== f.cuentaId;
                return (
                  <tr key={f.rut} className="border-b border-cuaderno-renglon hover:bg-cuaderno-papel align-top">
                    <td className="px-2 py-2 text-[17px] max-w-[220px] truncate">
                      {f.razonSocial || <span className="text-cuaderno-grafito">Sin razón social</span>}
                    </td>
                    <td className="px-2 py-2 text-[15px] text-cuaderno-grafito whitespace-nowrap">{f.rut}</td>
                    <td className="px-2 py-2 text-[15px] whitespace-nowrap">
                      <Resaltado color={o.resaltado}>{o.label}</Resaltado>
                    </td>
                    <td className="px-2 py-1">
                      <select
                        aria-label={`Cuenta asignada a ${f.razonSocial || f.rut}`}
                        value={f.cuentaId || ""}
                        onChange={e => cambiarCuenta(f, e.target.value)}
                        className="w-full max-w-[300px] min-h-[36px] px-1 bg-transparent border-0 border-b-[1.5px] border-cuaderno-tinta/70 text-[15px] text-cuaderno-tinta focus:outline-none focus:border-cuaderno-tinta">
                        <option value="">Sin cuenta — se clasifica por nombre</option>
                        {cuentasGasto.map(c => (
                          <option key={c.id} value={c.id}>{c.codigo} · {c.nombre}</option>
                        ))}
                      </select>
                      {disc && (
                        <Boton variante="texto" className="min-h-[32px] mt-1 text-[14px] text-left"
                          onClick={() => cambiarCuenta(f, f.sugerenciaHistorial.cuentaId)}>
                          En tus asientos usaste {f.sugerenciaHistorial.cuentaNombre} ({f.sugerenciaHistorial.veces}×) — aplicar
                        </Boton>
                      )}
                    </td>
                    <td className="px-2 py-2 text-right">
                      {f.guardada && (
                        <button onClick={() => eliminarReglaGasto(f.rut)}
                          title="Eliminar regla" aria-label="Eliminar regla"
                          className="w-8 h-8 rounded-md inline-flex items-center justify-center text-cuaderno-grafito hover:text-cuaderno-roja hover:bg-cuaderno-rosa/40">
                          <IconoBorrar tamano={14} />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {visibles.length === 0 && (
            <div className="py-12 text-center">
              <p className="m-0 font-ligada font-light text-[22px] leading-[1.6]">
                {filas.length === 0 ? "Todavía no hay reglas" : "Nada con ese filtro"}
              </p>
              {filas.length === 0 && (
                <p className="m-0 text-[16px] text-cuaderno-grafito">Se crean al reclasificar un asiento importado.</p>
              )}
            </div>
          )}
        </div>
      </Hoja>

      <p className="m-0 text-[15px] leading-snug text-cuaderno-grafito">
        Al importar, el orden de prioridad es: regla elegida por ti → cuenta que más usaste
        con ese proveedor → clasificación por el nombre de la razón social. Cambiar una cuenta
        acá la marca como decisión tuya y pasa al primer nivel.
      </p>
    </div>
  );
}
