import React, { useState, useMemo } from "react";
import { useContabilidad, PeriodoSelector, TIPOS_MAP, fmt, MESES, normalizaRut } from "./ContabilidadContext";
import ModalImportIConstruct from "./ContabilidadImportIConstruct";
import ModalExportPDF from "./ContabilidadExportPDF";

// Categorías rápidas para reclasificar asientos importados desde el Libro Diario
const CATEGORIAS_RAPIDAS = [
  { label: "Combustible (Ley 18.502)", icon: "⛽" },
  { label: "Subcontratos",             icon: "🏗️" },
  { label: "Materiales y Repuestos",   icon: "🔧" },
  { label: "Transporte y Pasajes",     icon: "✈️" },
  { label: "Telecomunicaciones",       icon: "📡" },
  { label: "Seguridad",                icon: "🛡️" },
  { label: "Servicios Profesionales",  icon: "⚖️" },
  { label: "Peajes y Movilización",    icon: "🛣️" },
  { label: "Arriendos",                icon: "🏢" },
  { label: "Gastos Financieros",       icon: "🏦" },
  { label: "Gastos Generales",         icon: "📋" },
  { label: "Gastos Varios",            icon: "🧾" },
];

// ─── Modal asiento ────────────────────────────────────────────────────────────
const LINEA_EMPTY = { cuentaId: "", cuentaNombre: "", debe: "", haber: "", descripcion: "" };
const ASIENTO_EMPTY = {
  fecha: new Date().toISOString().slice(0, 10),
  glosa: "",
  tipo: "manual",
  lineas: [{ ...LINEA_EMPTY }, { ...LINEA_EMPTY }],
};

function LineaAsiento({ linea, idx, cuentas, onChange, onRemove, canRemove }) {
  const set = (k, v) => onChange(idx, { ...linea, [k]: v });
  const cuenta = cuentas.find(c => c.id === linea.cuentaId);
  return (
    <div className="grid grid-cols-12 gap-2 items-start py-2 border-b border-slate-100 last:border-0">
      <div className="col-span-5">
        <select value={linea.cuentaId} onChange={e => {
          const c = cuentas.find(x => x.id === e.target.value);
          onChange(idx, { ...linea, cuentaId: e.target.value, cuentaNombre: c?.nombre || "" });
        }}
          className="w-full px-2 py-1.5 border-2 border-slate-200 rounded-lg focus:outline-none focus:border-purple-500 text-xs">
          <option value="">— Seleccionar cuenta —</option>
          {cuentas.filter(c => c.activa !== false).map(c => (
            <option key={c.id} value={c.id}>{c.codigo} — {c.nombre}</option>
          ))}
        </select>
        <input value={linea.descripcion} onChange={e => set("descripcion", e.target.value)} placeholder="Detalle..." className="w-full mt-1 px-2 py-1 border border-slate-100 rounded-lg text-xs text-slate-500 focus:outline-none focus:border-purple-300" />
      </div>
      <div className="col-span-3">
        <input type="number" value={linea.debe} onChange={e => set("debe", e.target.value)} placeholder="0"
          className="w-full px-2 py-1.5 border-2 border-slate-200 rounded-lg focus:outline-none focus:border-emerald-500 text-xs text-right font-mono"
          onFocus={() => { if (linea.haber) set("haber", ""); }} />
      </div>
      <div className="col-span-3">
        <input type="number" value={linea.haber} onChange={e => set("haber", e.target.value)} placeholder="0"
          className="w-full px-2 py-1.5 border-2 border-slate-200 rounded-lg focus:outline-none focus:border-red-400 text-xs text-right font-mono"
          onFocus={() => { if (linea.debe) set("debe", ""); }} />
      </div>
      <div className="col-span-1 flex justify-center pt-1.5">
        {canRemove && (
          <button onClick={() => onRemove(idx)} className="w-6 h-6 rounded-lg bg-red-50 hover:bg-red-100 text-red-400 flex items-center justify-center transition-all">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        )}
      </div>
    </div>
  );
}

function ModalAsiento({ isOpen, onClose, editando, onSave, cuentas, periodoActivo }) {
  const [form, setForm]   = useState(ASIENTO_EMPTY);
  const [saving, setSaving] = useState(false);
  React.useEffect(() => {
    setForm(editando
      ? { ...ASIENTO_EMPTY, ...editando, lineas: editando.lineas?.length ? editando.lineas : [{ ...LINEA_EMPTY }, { ...LINEA_EMPTY }] }
      : { ...ASIENTO_EMPTY, fecha: new Date().toISOString().slice(0, 10) }
    );
  }, [editando, isOpen]);
  if (!isOpen) return null;

  const totalDebe  = form.lineas.reduce((s, l) => s + (parseFloat(l.debe)  || 0), 0);
  const totalHaber = form.lineas.reduce((s, l) => s + (parseFloat(l.haber) || 0), 0);
  const diferencia = Math.abs(totalDebe - totalHaber);
  const cuadrado   = diferencia < 0.01 && totalDebe > 0;

  const setLinea    = (idx, val) => setForm(f => ({ ...f, lineas: f.lineas.map((l, i) => i === idx ? val : l) }));
  const addLinea    = () => setForm(f => ({ ...f, lineas: [...f.lineas, { ...LINEA_EMPTY }] }));
  const removeLinea = (idx) => setForm(f => ({ ...f, lineas: f.lineas.filter((_, i) => i !== idx) }));

  const handleSubmit = async () => {
    if (!cuadrado || !form.glosa) return;
    setSaving(true);
    const lineasValidas = form.lineas.filter(l => l.cuentaId && (parseFloat(l.debe) || parseFloat(l.haber)));
    const [anio, mes] = form.fecha.split("-");
    await onSave({
      ...form,
      lineas: lineasValidas,
      periodo: `${anio}-${mes}`,
      totalDebe,
    });
    setSaving(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl my-auto overflow-hidden">
        <div className="bg-gradient-to-r from-purple-700 to-violet-600 p-5 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <h2 className="font-black text-base">{editando ? "Editar Asiento" : "Nuevo Asiento"}</h2>
              <p className="text-white/70 text-xs">Libro Diario</p>
            </div>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Cabecera del asiento */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5">Fecha <span className="text-red-500">*</span></label>
              <input type="date" value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} className="w-full px-3 py-2 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5">Tipo</label>
              <select value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))} className="w-full px-3 py-2 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 text-sm">
                <option value="manual">Manual</option>
                <option value="ajuste">Ajuste</option>
                <option value="apertura">Apertura</option>
                <option value="cierre">Cierre</option>
                <option value="depreciacion">Depreciación</option>
                <option value="iva">IVA</option>
              </select>
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-xs font-bold text-slate-600 mb-1.5">Glosa <span className="text-red-500">*</span></label>
              <input value={form.glosa} onChange={e => setForm(f => ({ ...f, glosa: e.target.value }))} placeholder="Descripción del asiento..." className="w-full px-3 py-2 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-purple-500 text-sm" />
            </div>
          </div>

          {/* Tabla de líneas */}
          <div className="border-2 border-slate-100 rounded-xl overflow-hidden">
            <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-slate-50 border-b border-slate-100">
              <div className="col-span-5 text-xs font-black text-slate-500 uppercase">Cuenta / Detalle</div>
              <div className="col-span-3 text-xs font-black text-slate-500 uppercase text-right">Debe</div>
              <div className="col-span-3 text-xs font-black text-slate-500 uppercase text-right">Haber</div>
              <div className="col-span-1" />
            </div>
            <div className="px-3 divide-y divide-slate-50">
              {form.lineas.map((linea, idx) => (
                <LineaAsiento key={idx} linea={linea} idx={idx} cuentas={cuentas}
                  onChange={setLinea} onRemove={removeLinea} canRemove={form.lineas.length > 2} />
              ))}
            </div>
            {/* Totales */}
            <div className="px-3 py-3 bg-slate-50 border-t-2 border-slate-100 grid grid-cols-12 gap-2">
              <div className="col-span-5 flex items-center">
                <button onClick={addLinea} className="flex items-center gap-1.5 text-xs font-bold text-purple-600 hover:text-purple-700 transition-colors">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                  Agregar línea
                </button>
              </div>
              <div className="col-span-3 text-right">
                <p className="text-xs text-slate-400 font-semibold">Total Debe</p>
                <p className="text-sm font-black text-emerald-600 font-mono">{fmt(totalDebe)}</p>
              </div>
              <div className="col-span-3 text-right">
                <p className="text-xs text-slate-400 font-semibold">Total Haber</p>
                <p className="text-sm font-black text-red-500 font-mono">{fmt(totalHaber)}</p>
              </div>
              <div className="col-span-1 flex items-center justify-center">
                {totalDebe > 0 && (
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center ${cuadrado ? "bg-emerald-100" : "bg-red-100"}`}>
                    {cuadrado
                      ? <svg className="w-3.5 h-3.5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                      : <svg className="w-3.5 h-3.5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                    }
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Aviso diferencia */}
          {totalDebe > 0 && !cuadrado && (
            <div className="flex items-center gap-2 px-4 py-2.5 bg-red-50 border border-red-200 rounded-xl">
              <svg className="w-4 h-4 text-red-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              <p className="text-xs font-bold text-red-600">El asiento no cuadra — diferencia de {fmt(diferencia)}</p>
            </div>
          )}
        </div>

        <div className="px-5 pb-5 flex gap-3">
          <button onClick={onClose} className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-sm">Cancelar</button>
          <div className="flex-1" />
          <button onClick={handleSubmit} disabled={saving || !cuadrado || !form.glosa}
            className="px-5 py-2.5 bg-gradient-to-r from-purple-700 to-violet-600 disabled:opacity-40 text-white font-bold rounded-xl text-sm flex items-center gap-2 shadow-md">
            {saving ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Guardando...</> : <>{editando ? "Guardar cambios" : "Registrar asiento"}</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Detalle expandido de asiento con reclasificación rápida ─────────────────
function AsientoDetalle({ asiento, onElegir }) {
  const [showReclasif, setShowReclasif] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleReclasificar = async (categ) => {
    setSaving(true);
    await onElegir(asiento, categ);
    setSaving(false);
    setShowReclasif(false);
  };

  return (
    <div className="border-t border-slate-100">
      {/* Tabla de líneas */}
      <div className="px-4 pb-3">
        <table className="w-full mt-2">
          <thead>
            <tr className="text-[10px] font-black text-slate-400 uppercase">
              <th className="text-left py-1.5 pr-2">Cuenta</th>
              <th className="text-left py-1.5 hidden sm:table-cell">Detalle</th>
              <th className="text-right py-1.5 px-2">Debe</th>
              <th className="text-right py-1.5">Haber</th>
            </tr>
          </thead>
          <tbody>
            {(asiento.lineas || []).map((l, i) => (
              <tr key={i} className="border-t border-slate-50">
                <td className="py-1.5 pr-2">
                  <p className="text-xs font-semibold text-slate-700">{l.cuentaNombre || l.cuentaId}</p>
                </td>
                <td className="py-1.5 hidden sm:table-cell">
                  <p className="text-xs text-slate-400">{l.descripcion}</p>
                </td>
                <td className="py-1.5 px-2 text-right">
                  {parseFloat(l.debe) > 0 && <span className="text-xs font-mono font-bold text-emerald-600">{fmt(l.debe)}</span>}
                </td>
                <td className="py-1.5 text-right">
                  {parseFloat(l.haber) > 0 && <span className="text-xs font-mono font-bold text-red-500">{fmt(l.haber)}</span>}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 border-slate-200">
            <tr>
              <td colSpan={2} className="py-1.5 text-xs font-black text-slate-500">TOTALES</td>
              <td className="py-1.5 px-2 text-right text-xs font-black font-mono text-emerald-600">{fmt(asiento.totalDebe)}</td>
              <td className="py-1.5 text-right text-xs font-black font-mono text-red-500">{fmt(asiento.totalDebe)}</td>
            </tr>
          </tfoot>
        </table>

        {/* Botón reclasificar (solo asientos automáticos) */}
        {asiento.tipo === "automatico" && (
          <div className="mt-3 pt-3 border-t border-slate-100">
            <button
              onClick={() => setShowReclasif(!showReclasif)}
              className="flex items-center gap-2 text-xs font-bold text-indigo-600 hover:text-indigo-800 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"/>
              </svg>
              {showReclasif ? "Cancelar" : "Reclasificar cuenta de gasto"}
            </button>

            {showReclasif && (
              <div className="mt-3 grid grid-cols-3 sm:grid-cols-4 gap-1.5">
                {CATEGORIAS_RAPIDAS.map(cat => (
                  <button
                    key={cat.label}
                    onClick={() => handleReclasificar(cat)}
                    disabled={saving}
                    className="flex items-center gap-1.5 px-2 py-2 rounded-xl border-2 border-slate-100 hover:border-indigo-300 hover:bg-indigo-50 text-left text-[10px] font-bold text-slate-600 transition-all disabled:opacity-50"
                  >
                    <span className="text-sm flex-shrink-0">{cat.icon}</span>
                    <span className="truncate">{cat.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Badge tipo asiento ───────────────────────────────────────────────────────
const TIPO_COLORS = {
  manual:       "bg-slate-100 text-slate-600",
  ajuste:       "bg-blue-100 text-blue-700",
  apertura:     "bg-emerald-100 text-emerald-700",
  cierre:       "bg-slate-700 text-white",
  depreciacion: "bg-amber-100 text-amber-700",
  iva:          "bg-purple-100 text-purple-700",
  automatico:   "bg-violet-100 text-violet-700",
};

// Detecta si un asiento es una Nota de Crédito por su glosa
const esNotaCredito = (a) => a.glosa?.startsWith("NC —") || a.glosa?.startsWith("NCE —") || (a.origen === "iconstruye" && a.glosa?.startsWith("NC"));
const esVenta = (a) => a.origen === "rcv_venta" && !esNotaCredito(a);

// ─── Chip de categoría de gasto editable en la lista ──────────────────────────
// Tipos de cuenta que representan gasto/costo (lado resultado-deudor)
const TIPOS_GASTO = ["costo", "gasto_adm", "gasto_fin", "otro_resultado"];

// Mapeo categoría → tipo de cuenta (mismo que usa la reclasificación al expandir)
const TIPO_POR_CATEGORIA = {
  "Gastos Financieros": "gasto_fin",
  "Subcontratos": "costo", "Materiales y Repuestos": "costo",
  "Combustible (Ley 18.502)": "costo", "Combustible/Lubricantes": "costo",
  "Mantención Vehículos": "costo",
};

// Línea de gasto del asiento: debe > 0 y que no sea IVA ni impuesto
function getLineaGasto(asiento) {
  return (asiento.lineas || [])
    .map((l, i) => ({ ...l, _idx: i }))
    .filter(l => parseFloat(l.debe) > 0 && !/(iva|impuesto)/i.test(l.cuentaNombre || ""))
    .sort((a, b) => parseFloat(b.debe) - parseFloat(a.debe))[0] || null;
}

// Detecta la categoría actual a partir del detalle de la línea de gasto
function categoriaDeLinea(linea) {
  const d = linea?.descripcion || "";
  return CATEGORIAS_RAPIDAS.find(c => d.includes(c.label)) || null;
}

// Cuenta preferida por categoría (códigos del Plan de Cuentas, en orden de preferencia).
// Si ninguna existe, cae al primer cuenta del tipo correspondiente.
const CUENTA_POR_CATEGORIA = {
  "Combustible (Ley 18.502)": ["5-01-004"],                 // Combustible y Lubricantes
  "Subcontratos":             ["5-01-002"],                 // Subcontratos
  "Materiales y Repuestos":   ["5-01-003"],                 // Materiales y Suministros
  "Transporte y Pasajes":     ["6-01-006", "5-01-007"],     // Pasajes y Traslados / Fletes
  "Telecomunicaciones":       ["6-01-005"],                 // Telecomunicaciones
  "Seguridad":                ["5-01-009", "6-01-011"],     // Seguridad Industrial / Oficina
  "Servicios Profesionales":  ["6-01-002"],                 // Honorarios Profesionales
  "Peajes y Movilización":    ["6-01-007"],                 // Peajes y Movilización
  "Arriendos":                ["6-01-003"],                 // Arriendos Oficina
  "Gastos Financieros":       ["6-02-003", "6-01-017"],     // Comisiones / Gastos Bancarios
  "Gastos Generales":         ["6-01-019"],                 // Gastos Varios Administración
  "Gastos Varios":            ["6-01-019"],
};

// Resuelve la cuenta destino de una categoría: primero por código preferido, luego por tipo
function cuentaDeCategoria(categ, cuentas) {
  const activas = cuentas.filter(c => c.activa !== false);
  const codigos = CUENTA_POR_CATEGORIA[categ.label] || [];
  for (const cod of codigos) {
    const c = activas.find(x => x.codigo === cod && TIPOS_GASTO.includes(x.tipo));
    if (c) return c;
  }
  const tipoTarget = TIPO_POR_CATEGORIA[categ.label] || "gasto_adm";
  return activas.find(c => c.tipo === tipoTarget && TIPOS_GASTO.includes(c.tipo))
      || activas.find(c => c.tipo === "gasto_adm")
      || null;
}

// Extrae proveedor (rut + razón social) de un asiento importado, sin depender de campos _*
function infoProveedor(asiento) {
  // RUT desde el importHash: "periodo|RUT|folios"
  let rut = (asiento.importHash || "").split("|")[1] || "";
  rut = rut.replace(/^NCE?-/, ""); // por si fuera nota de crédito
  // Fallback: RUT en el detalle de la línea de contrapartida ("... · RUT 12345-6")
  if (!rut) {
    for (const l of asiento.lineas || []) {
      const m = (l.descripcion || "").match(/RUT\s*([0-9.\-kK]+)/);
      if (m) { rut = m[1]; break; }
    }
  }
  // Razón social: lo que va antes del primer " · " en la glosa, sin prefijos NC
  let razonSocial = (asiento.glosa || "").split(" · ")[0].replace(/^NCE?\s*—\s*/, "").trim();
  return { rut, razonSocial };
}

// Aplica una categoría al asiento (función pura, reutilizada por el chip y el detalle)
function aplicarCategoria(asiento, categ, cuentas) {
  const lineaGasto = (asiento.lineas || []).find(l =>
    parseFloat(l.debe) > 0 && !/(iva|impuesto)/i.test(l.cuentaNombre || ""));
  if (!lineaGasto) return null;

  const nuevaCuenta = cuentaDeCategoria(categ, cuentas);
  if (!nuevaCuenta) return null;

  const nuevasLineas = (asiento.lineas || []).map(l =>
    (parseFloat(l.debe) > 0 && !/(iva|impuesto)/i.test(l.cuentaNombre || ""))
      ? { ...l, cuentaId: nuevaCuenta.id, cuentaNombre: nuevaCuenta.nombre,
          descripcion: `${categ.icon} ${categ.label} — reclasificado` }
      : l
  );
  return {
    ...asiento,
    lineas: nuevasLineas,
    totalDebe: nuevasLineas.reduce((s, l) => s + (parseFloat(l.debe) || 0), 0),
  };
}

function CuentaGastoChip({ asiento, onElegir }) {
  const [abierto, setAbierto]     = useState(false);
  const [guardando, setGuardando] = useState(false);
  const lineaGasto = useMemo(() => getLineaGasto(asiento), [asiento]);

  if (!lineaGasto) return null; // ventas/NC u otros asientos sin línea de gasto

  const catActual = categoriaDeLinea(lineaGasto);
  const icon  = catActual ? catActual.icon : "🏷";
  const label = catActual ? catActual.label : (lineaGasto.cuentaNombre || "Sin categoría");

  const elegir = async (cat) => {
    setGuardando(true);
    await onElegir(asiento, cat);
    setGuardando(false);
    setAbierto(false);
  };

  return (
    <span className="relative inline-flex">
      <button
        onClick={e => { e.stopPropagation(); setAbierto(o => !o); }}
        title="Click para cambiar la categoría de gasto"
        className="group inline-flex items-center gap-1 text-[11px] font-bold px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors max-w-[260px]"
      >
        <span className="flex-shrink-0">{icon}</span>
        <span className="truncate">{label}</span>
        {guardando
          ? <span className="w-2.5 h-2.5 border border-amber-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
          : <svg className={`w-2.5 h-2.5 flex-shrink-0 opacity-50 transition-transform ${abierto ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>}
      </button>

      {abierto && (
        <>
          {/* Capa para cerrar al hacer click fuera */}
          <button
            onClick={e => { e.stopPropagation(); setAbierto(false); }}
            className="fixed inset-0 z-40 cursor-default"
            aria-label="Cerrar"
          />
          <div
            onClick={e => e.stopPropagation()}
            className="absolute left-0 top-full mt-1 z-50 w-[300px] sm:w-[380px] bg-white rounded-xl shadow-xl border border-slate-100 p-2"
          >
            <p className="text-[10px] font-black text-slate-400 uppercase px-1 pb-1.5">Categoría de gasto</p>
            <div className="grid grid-cols-2 gap-1.5">
              {CATEGORIAS_RAPIDAS.map(cat => {
                const sel = catActual?.label === cat.label;
                return (
                  <button
                    key={cat.label}
                    disabled={guardando}
                    onClick={e => { e.stopPropagation(); elegir(cat); }}
                    className={`flex items-center gap-1.5 px-2 py-2 rounded-lg border-2 text-left text-[10px] font-bold transition-all disabled:opacity-50
                      ${sel
                        ? "border-amber-300 bg-amber-50 text-amber-700"
                        : "border-slate-100 hover:border-indigo-300 hover:bg-indigo-50 text-slate-600"}`}
                  >
                    <span className="text-sm flex-shrink-0">{cat.icon}</span>
                    <span className="truncate">{cat.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </span>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function ContabilidadLibroDiario() {
  const { asientos, cuentas, loadingAsientos, guardarAsiento, eliminarAsiento, periodoActivo, setPeriodoActivo, buscarHashesExistentes, reglasGasto, guardarReglaGasto } = useContabilidad();
  const [showModal, setShowModal]     = useState(false);
  const [editando, setEditando]       = useState(null);
  const [expandido, setExpandido]     = useState(null);
  const [busqueda, setBusqueda]       = useState("");
  const [filtroTipo, setFiltroTipo]   = useState("todos");
  const [ordenCampo, setOrdenCampo]   = useState("fecha");   // fecha|glosa|monto|tipo
  const [ordenDir, setOrdenDir]       = useState("desc");    // asc|desc
  const [deletingId, setDeletingId]   = useState(null);
  const [showImport, setShowImport]   = useState(false);
  const [showExport, setShowExport]   = useState(false);
  const [autoClasif, setAutoClasif]   = useState(null);      // {procesando, total, hechos} | null

  // Reclasifica un asiento y aprende la regla para ese proveedor (se aplicará a futuros)
  const reclasificarYAprender = async (asiento, cat) => {
    const nuevo = aplicarCategoria(asiento, cat, cuentas);
    if (!nuevo) return;
    await guardarAsiento(nuevo);
    const gl = getLineaGasto(nuevo);
    const { rut, razonSocial } = infoProveedor(nuevo);
    if (rut && gl) {
      await guardarReglaGasto(rut, razonSocial, {
        cuentaId: gl.cuentaId, cuentaNombre: gl.cuentaNombre,
        categoriaLabel: cat.label, categoriaIcon: cat.icon,
      });
    }
  };

  // Aplica una regla aprendida directamente a un asiento (sin re-mapear categoría)
  const aplicarReglaAAsiento = (asiento, regla) => {
    const nuevasLineas = (asiento.lineas || []).map(l =>
      (parseFloat(l.debe) > 0 && !/(iva|impuesto)/i.test(l.cuentaNombre || ""))
        ? { ...l, cuentaId: regla.cuentaId, cuentaNombre: regla.cuentaNombre,
            descripcion: `${regla.categoriaIcon || "🏷"} ${regla.categoriaLabel} — auto (aprendido)` }
        : l
    );
    return { ...asiento, lineas: nuevasLineas,
      totalDebe: nuevasLineas.reduce((s, l) => s + (parseFloat(l.debe) || 0), 0) };
  };

  // Auto-clasifica los asientos del período aplicando las reglas aprendidas por proveedor
  const autoClasificar = async () => {
    // Candidatos: asientos con línea de gasto y regla conocida que cambie la cuenta actual
    const pendientes = asientos.filter(a => {
      if (esNotaCredito(a) || esVenta(a)) return false;
      const gl = getLineaGasto(a);
      if (!gl) return false;
      const { rut } = infoProveedor(a);
      const regla = reglasGasto[normalizaRut(rut)];
      return regla && regla.cuentaId && regla.cuentaId !== gl.cuentaId;
    });
    if (pendientes.length === 0) {
      setAutoClasif({ procesando: false, total: 0, hechos: 0 });
      setTimeout(() => setAutoClasif(null), 2500);
      return;
    }
    if (!window.confirm(`Se aplicarán reglas aprendidas a ${pendientes.length} asiento(s) del período. ¿Continuar?`)) return;
    setAutoClasif({ procesando: true, total: pendientes.length, hechos: 0 });
    let hechos = 0;
    for (const a of pendientes) {
      const { rut } = infoProveedor(a);
      const regla = reglasGasto[normalizaRut(rut)];
      await guardarAsiento(aplicarReglaAAsiento(a, regla));
      hechos++;
      setAutoClasif({ procesando: true, total: pendientes.length, hechos });
    }
    setAutoClasif({ procesando: false, total: pendientes.length, hechos });
    setTimeout(() => setAutoClasif(null), 3500);
  };

  const esCompra = (a) => a.origen === "iconstruye" && !esNotaCredito(a);

  const toggleOrden = (campo) => {
    if (ordenCampo === campo) setOrdenDir(d => d === "asc" ? "desc" : "asc");
    else { setOrdenCampo(campo); setOrdenDir("asc"); }
  };

  const asientosFiltrados = useMemo(() => {
    let lista = asientos.filter(a => {
      // Filtro por tipo
      if (filtroTipo === "nota_credito") return esNotaCredito(a);
      if (filtroTipo === "venta")        return esVenta(a);
      if (filtroTipo === "compra")       return esCompra(a);
      if (filtroTipo !== "todos" && a.tipo !== filtroTipo) return false;
      // Búsqueda
      if (busqueda) {
        const b = busqueda.toLowerCase();
        return a.glosa?.toLowerCase().includes(b) ||
          a.lineas?.some(l => l.cuentaNombre?.toLowerCase().includes(b));
      }
      return true;
    });

    // Ordenamiento
    lista = [...lista].sort((a, b) => {
      let va, vb;
      if (ordenCampo === "fecha")  { va = a.fecha  || ""; vb = b.fecha  || ""; }
      else if (ordenCampo === "glosa") { va = a.glosa || ""; vb = b.glosa || ""; }
      else if (ordenCampo === "monto") { va = a.totalDebe || 0; vb = b.totalDebe || 0; }
      else if (ordenCampo === "tipo")  { va = a.tipo  || ""; vb = b.tipo  || ""; }
      else if (ordenCampo === "origen"){ va = a.origen|| ""; vb = b.origen|| ""; }
      else { va = ""; vb = ""; }
      if (va < vb) return ordenDir === "asc" ? -1 :  1;
      if (va > vb) return ordenDir === "asc" ?  1 : -1;
      return 0;
    });

    return lista;
  }, [asientos, filtroTipo, busqueda, ordenCampo, ordenDir]);

  const totales = useMemo(() => ({
    debe:  asientosFiltrados.reduce((s, a) => s + (a.totalDebe || 0), 0),
    count: asientosFiltrados.length,
  }), [asientosFiltrados]);

  // Cuántos asientos del período tienen una regla aprendida que cambiaría su cuenta actual
  const nPorClasificar = useMemo(() => asientos.filter(a => {
    if (esNotaCredito(a) || esVenta(a)) return false;
    const gl = getLineaGasto(a);
    if (!gl) return false;
    const regla = reglasGasto[normalizaRut(infoProveedor(a).rut)];
    return regla && regla.cuentaId && regla.cuentaId !== gl.cuentaId;
  }).length, [asientos, reglasGasto]);

  const handleEliminar = async (id) => {
    if (!window.confirm("¿Eliminar este asiento? Esta acción no se puede deshacer.")) return;
    setDeletingId(id);
    await eliminarAsiento(id);
    setDeletingId(null);
    if (expandido === id) setExpandido(null);
  };

  return (
    <div className="p-4 sm:p-6 space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div>
          <h1 className="text-xl font-black text-slate-900">Libro Diario</h1>
          <p className="text-xs text-slate-500 mt-0.5">Asientos del período</p>
        </div>
        <div className="flex items-center gap-2 sm:ml-auto">
          <PeriodoSelector />
          {/* Botón Auto-clasificar (aplica reglas aprendidas por proveedor) */}
          <button
            onClick={autoClasificar}
            disabled={autoClasif?.procesando}
            title="Aplica las categorías aprendidas a los asientos del período cuyo proveedor ya tiene una regla"
            className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-amber-600 to-orange-500 text-white font-bold rounded-xl text-sm shadow-md shadow-amber-200 hover:shadow-lg transition-all disabled:opacity-60"
          >
            {autoClasif?.procesando ? (
              <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />{autoClasif.hechos}/{autoClasif.total}</>
            ) : autoClasif ? (
              <><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>{autoClasif.hechos > 0 ? `${autoClasif.hechos} clasificados` : "Sin pendientes"}</>
            ) : (
              <><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>Auto-clasificar{nPorClasificar > 0 ? ` (${nPorClasificar})` : ""}</>
            )}
          </button>
          {/* Botón Exportar PDF */}
          <button
            onClick={() => setShowExport(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-teal-700 to-emerald-600 text-white font-bold rounded-xl text-sm shadow-md shadow-teal-200 hover:shadow-lg transition-all"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
            Exportar PDF
          </button>
          {/* Botón Importar iConstruct */}
          <button
            onClick={() => setShowImport(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-indigo-700 to-blue-600 text-white font-bold rounded-xl text-sm shadow-md shadow-indigo-200 hover:shadow-lg transition-all"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
            iConstruct
          </button>
          <button
            onClick={() => { setEditando(null); setShowModal(true); }}
            className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-purple-700 to-violet-600 text-white font-bold rounded-xl text-sm shadow-md shadow-purple-200 hover:shadow-lg transition-all"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            Nuevo asiento
          </button>
        </div>
      </div>

      {/* KPIs rápidos */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Asientos",       value: totales.count,        color: "text-slate-800"   },
          { label: "Total Debe",     value: fmt(totales.debe),    color: "text-emerald-600" },
          { label: "Total Haber",    value: fmt(totales.debe),    color: "text-red-500"     },
        ].map(k => (
          <div key={k.label} className="glass-card rounded-xl p-3 sm:p-4">
            <p className="text-xs text-slate-400 font-semibold">{k.label}</p>
            <p className={`text-base sm:text-lg font-black mt-0.5 ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* Filtros + Ordenamiento */}
      <div className="glass-card rounded-xl p-4 space-y-3">
        {/* Fila 1: Búsqueda + Tipo */}
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <svg className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input value={busqueda} onChange={e => setBusqueda(e.target.value)}
              placeholder="Buscar por glosa, proveedor o cuenta..."
              className="w-full pl-9 pr-4 py-2 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-purple-400 text-sm" />
            {busqueda && (
              <button onClick={() => setBusqueda("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            )}
          </div>
          <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}
            className="px-3 py-2 border-2 border-slate-200 rounded-xl text-sm font-semibold focus:outline-none focus:border-purple-400 bg-white min-w-40">
            <option value="todos">Todos los tipos</option>
            <optgroup label="Por origen">
              <option value="compra">🛒 Compras (RCV/iConstruct)</option>
              <option value="venta">🔵 Ventas (RCV)</option>
              <option value="nota_credito">🔴 Notas de Crédito</option>
            </optgroup>
            <optgroup label="Por tipo">
              <option value="automatico">Automático</option>
              <option value="manual">Manual</option>
              <option value="ajuste">Ajuste</option>
              <option value="depreciacion">Depreciación</option>
              <option value="iva">IVA</option>
            </optgroup>
          </select>
        </div>

        {/* Fila 2: Chips de ordenamiento */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Ordenar:</span>
          {[
            { campo: "fecha",  label: "Fecha"     },
            { campo: "glosa",  label: "Proveedor" },
            { campo: "monto",  label: "Monto"     },
            { campo: "tipo",   label: "Tipo"      },
            { campo: "origen", label: "Origen"    },
          ].map(({ campo, label }) => {
            const activo = ordenCampo === campo;
            return (
              <button key={campo} onClick={() => toggleOrden(campo)}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all
                  ${activo
                    ? "border-purple-400 bg-purple-50 text-purple-700"
                    : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-700"}`}>
                {label}
                {activo && (
                  <svg className={`w-3 h-3 transition-transform ${ordenDir === "desc" ? "rotate-180" : ""}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 15l7-7 7 7"/>
                  </svg>
                )}
              </button>
            );
          })}
          {/* Contador resultados */}
          <span className="ml-auto text-[11px] text-slate-400">
            {asientosFiltrados.length} de {asientos.length} asientos
            {filtroTipo !== "todos" || busqueda ? ` · filtrado` : ""}
          </span>
          {/* Limpiar filtros */}
          {(filtroTipo !== "todos" || busqueda) && (
            <button onClick={() => { setFiltroTipo("todos"); setBusqueda(""); }}
              className="text-[10px] font-bold text-purple-600 hover:text-purple-800 px-2 py-1 rounded-lg hover:bg-purple-50 transition-all">
              Limpiar ×
            </button>
          )}
        </div>
      </div>

      {/* Lista de asientos */}
      {loadingAsientos ? (
        <div className="flex items-center justify-center h-40">
          <div className="w-8 h-8 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : asientosFiltrados.length === 0 ? (
        <div className="glass-card rounded-xl py-16 text-center">
          <p className="text-3xl mb-3">📒</p>
          <p className="text-slate-600 font-bold">Sin asientos en este período</p>
          <p className="text-slate-400 text-sm mt-1">Registra el primer asiento contable</p>
        </div>
      ) : (
        <div className="space-y-2">
          {asientosFiltrados.map((a, idx) => (
            <div key={a.id} className="glass-card rounded-xl overflow-hidden">
              {/* Cabecera del asiento */}
              <div
                onClick={() => setExpandido(expandido === a.id ? null : a.id)}
                className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-purple-50/30 transition-colors"
              >
                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={esNotaCredito(a)
                    ? { background: "linear-gradient(135deg, #db2777, #be185d)" }
                    : esVenta(a)
                    ? { background: "linear-gradient(135deg, #1d4ed8, #2563eb)" }
                    : { background: "linear-gradient(135deg, #7e22ce, #6d28d9)" }}>
                  <span className="text-white text-xs font-black">
                    {esNotaCredito(a) ? "NC" : esVenta(a) ? "V" : idx + 1}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-bold text-slate-800 truncate">{a.glosa}</p>
                    {esNotaCredito(a) ? (
                      <span className="text-[10px] font-black px-1.5 py-0.5 rounded-md flex-shrink-0 bg-pink-100 text-pink-700">
                        {a.origen === "rcv_venta" ? "nc emitida" : "nota de crédito"}
                      </span>
                    ) : esVenta(a) ? (
                      <span className="text-[10px] font-black px-1.5 py-0.5 rounded-md flex-shrink-0 bg-blue-100 text-blue-700">
                        venta
                      </span>
                    ) : (
                    <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-md flex-shrink-0 ${TIPO_COLORS[a.tipo] || "bg-slate-100 text-slate-600"}`}>
                      {a.tipo || "manual"}
                    </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <p className="text-xs text-slate-400">{a.fecha}</p>
                    <p className="text-xs text-slate-400">{a.lineas?.length || 0} líneas</p>
                    <CuentaGastoChip asiento={a} onElegir={reclasificarYAprender} />
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-black text-slate-800">{fmt(a.totalDebe)}</p>
                  <p className="text-[10px] text-slate-400">Debe / Haber</p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={e => { e.stopPropagation(); setEditando(a); setShowModal(true); }}
                    className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-purple-100 hover:text-purple-700 text-slate-500 flex items-center justify-center transition-all">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                  </button>
                  <button onClick={e => { e.stopPropagation(); handleEliminar(a.id); }}
                    disabled={deletingId === a.id}
                    className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-red-100 hover:text-red-600 text-slate-500 flex items-center justify-center transition-all disabled:opacity-40">
                    {deletingId === a.id
                      ? <div className="w-3 h-3 border border-slate-400 border-t-transparent rounded-full animate-spin" />
                      : <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>}
                  </button>
                  <svg className={`w-4 h-4 text-slate-400 transition-transform ${expandido === a.id ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>

              {/* Detalle expandido */}
              {expandido === a.id && (
                <AsientoDetalle asiento={a} onElegir={reclasificarYAprender} />
              )}
            </div>
          ))}
        </div>
      )}

      <ModalAsiento isOpen={showModal} onClose={() => { setShowModal(false); setEditando(null); }}
        editando={editando} onSave={guardarAsiento} cuentas={cuentas} periodoActivo={periodoActivo} />

      <ModalImportIConstruct
        isOpen={showImport}
        onClose={() => setShowImport(false)}
        cuentas={cuentas}
        reglasGasto={reglasGasto}
        guardarAsiento={guardarAsiento}
        periodoActivo={periodoActivo}
        buscarHashesExistentes={buscarHashesExistentes}
        onImportDone={(periodoImportado) => {
          setShowImport(false);
          setPeriodoActivo(periodoImportado);
        }}
      />
      <ModalExportPDF isOpen={showExport} onClose={() => setShowExport(false)} />
    </div>
  );
}
