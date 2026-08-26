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

const ORIGENES = {
  usuario:   { label: "Elegida por ti",    color: "#0d7d6b", bg: "#ecfdf5", desc: "Reclasificaste este proveedor a mano" },
  auto:      { label: "Generada sola",     color: "#b45309", bg: "#fffbeb", desc: "La guardó el importador sin intervención — revísala" },
  historial: { label: "Deducida del uso",  color: "#1a56a0", bg: "#eff6ff", desc: "Inferida de cómo clasificaste a este proveedor antes" },
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
    <div className="p-4 sm:p-6 space-y-4">
      <div className="rounded-2xl overflow-hidden" style={{ background: "#0f2744" }}>
        <div className="px-6 py-4">
          <p className="text-white/50 text-[10px] font-bold uppercase tracking-[2px]">Importación</p>
          <h2 className="text-white font-black text-xl tracking-tight">Reglas de Clasificación</h2>
          <p className="text-blue-300 text-xs mt-0.5">
            Qué cuenta se asigna a cada proveedor al importar el RCV
          </p>
        </div>
      </div>

      {/* Contadores */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {Object.entries(ORIGENES).map(([k, o]) => (
          <button key={k} onClick={() => setFiltro(filtro === k ? "todas" : k)}
            className={`rounded-xl px-4 py-3 text-left border transition-all ${filtro === k ? "ring-2" : ""}`}
            style={{ background: o.bg, borderColor: `${o.color}30`, ringColor: o.color }}>
            <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: o.color }}>{o.label}</p>
            <p className="text-2xl font-black mt-0.5" style={{ color: o.color }}>{conteo[k]}</p>
            <p className="text-[11px] mt-0.5 leading-snug" style={{ color: o.color, opacity: .75 }}>{o.desc}</p>
          </button>
        ))}
      </div>

      {conteo.auto > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1">
            <p className="text-sm font-bold text-amber-800">
              Hay {conteo.auto} regla(s) que se guardaron solas
            </p>
            <p className="text-xs text-amber-700 mt-0.5 leading-snug">
              El importador las creaba por cada asiento, aunque nadie hubiera reclasificado.
              Como tienen prioridad sobre la clasificación por nombre, congelan la cuenta
              equivocada. Limpiarlas es seguro: lo que elegiste a mano se conserva.
            </p>
          </div>
          <button onClick={limpiar} disabled={limpiando}
            className="px-4 py-2.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-bold text-sm rounded-xl transition-colors whitespace-nowrap">
            {limpiando ? "Limpiando…" : "Limpiar reglas automáticas"}
          </button>
        </div>
      )}

      {corruptos > 0 && (
        <div className="rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1">
            <p className="text-sm font-bold text-slate-800">
              {corruptos} proveedor(es) con el nombre mal codificado
            </p>
            <p className="text-xs text-slate-600 mt-0.5 leading-snug">
              El CSV del SII venía en UTF-8 y se leía como Latin-1, así que "ÓPTICA" quedó
              guardado como "Ã“PTICA". La lectura ya está arreglada; esto corrige lo que
              quedó en la base.
            </p>
          </div>
          <button onClick={repararNombres} disabled={reparando}
            className="px-4 py-2.5 bg-slate-700 hover:bg-slate-800 disabled:opacity-50 text-white font-bold text-sm rounded-xl transition-colors whitespace-nowrap">
            {reparando ? "Corrigiendo…" : "Corregir nombres"}
          </button>
        </div>
      )}

      {discrepantes.length > 0 && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
          <p className="text-sm font-bold text-blue-800">
            {discrepantes.length} proveedor(es) con la regla en desacuerdo con el historial
          </p>
          <p className="text-xs text-blue-700 mt-0.5">
            La regla apunta a una cuenta, pero en los asientos ya registrados usaste otra.
            Revísalos abajo: aparecen con la sugerencia al lado.
          </p>
        </div>
      )}

      {aviso && (
        <div className={`rounded-xl px-4 py-2.5 border ${aviso.ok ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"}`}>
          <p className={`text-sm font-bold ${aviso.ok ? "text-emerald-700" : "text-red-700"}`}>{aviso.texto}</p>
        </div>
      )}

      <input
        className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl text-sm focus:outline-none focus:border-purple-400"
        placeholder="Buscar por proveedor, RUT o cuenta…"
        value={busqueda} onChange={e => setBusqueda(e.target.value)} />

      <div className="rounded-2xl overflow-hidden border border-slate-200">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: 760 }}>
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                {["Proveedor", "RUT", "Origen", "Cuenta asignada", ""].map(h => (
                  <th key={h} className="px-3 py-2.5 text-[10px] font-black text-slate-500 uppercase tracking-widest text-left border-b-2 border-slate-200 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visibles.map(f => {
                const o = ORIGENES[f.origen] || ORIGENES.auto;
                const disc = f.sugerenciaHistorial && f.sugerenciaHistorial.cuentaId !== f.cuentaId;
                return (
                  <tr key={f.rut} className="hover:bg-slate-50/60">
                    <td className="px-3 py-2 font-bold text-slate-700 max-w-[220px] truncate">
                      {f.razonSocial || <span className="text-slate-400 font-normal">Sin razón social</span>}
                    </td>
                    <td className="px-3 py-2 font-mono text-slate-500 text-xs whitespace-nowrap">{f.rut}</td>
                    <td className="px-3 py-2">
                      <span className="text-[10px] font-black px-2 py-0.5 rounded-full whitespace-nowrap"
                        style={{ background: o.bg, color: o.color }}>{o.label}</span>
                    </td>
                    <td className="px-3 py-2">
                      <select
                        value={f.cuentaId || ""}
                        onChange={e => cambiarCuenta(f, e.target.value)}
                        className="w-full max-w-[280px] px-2 py-1.5 border border-slate-200 rounded-lg text-xs bg-white focus:outline-none focus:border-purple-400">
                        <option value="">Sin cuenta — se clasifica por nombre</option>
                        {cuentasGasto.map(c => (
                          <option key={c.id} value={c.id}>{c.codigo} · {c.nombre}</option>
                        ))}
                      </select>
                      {disc && (
                        <button onClick={() => cambiarCuenta(f, f.sugerenciaHistorial.cuentaId)}
                          className="mt-1 text-[11px] text-blue-600 hover:underline font-semibold">
                          En tus asientos usaste {f.sugerenciaHistorial.cuentaNombre} ({f.sugerenciaHistorial.veces}×) — aplicar
                        </button>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {f.guardada && (
                        <button onClick={() => eliminarReglaGasto(f.rut)}
                          title="Eliminar regla"
                          className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-red-100 hover:text-red-600 text-slate-500 inline-flex items-center justify-center transition-all">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M4 7h16" /></svg>
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {visibles.length === 0 && (
                <tr><td colSpan={5} className="px-3 py-8 text-center text-slate-400">
                  {filas.length === 0 ? "Todavía no hay reglas. Se crean al reclasificar un asiento importado." : "Nada con ese filtro"}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-[11px] text-slate-400 leading-snug">
        Al importar, el orden de prioridad es: regla elegida por ti → cuenta que más usaste
        con ese proveedor → clasificación por el nombre de la razón social. Cambiar una cuenta
        acá la marca como decisión tuya y pasa al primer nivel.
      </p>
    </div>
  );
}
