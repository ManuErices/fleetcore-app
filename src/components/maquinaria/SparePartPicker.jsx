import React, { useEffect, useState, useMemo } from "react";
import { useEmpresa } from "../../lib/useEmpresa";
import { listSpareParts } from "../../lib/db";

// ============================================================
// SparePartPicker — selector reutilizable de repuestos.
// Se usa dentro del cierre de OT (WorkOrderDetalle) para armar
// la lista `repuestosUsados` que la Cloud Function descuenta.
//
// props:
//  - value: array de items ya seleccionados
//           [{ spareId, codigo, descripcion, cantidad, costoUnitario }]
//  - onChange: (nuevoArray) => void
//  - disabled: bool
// ============================================================
export default function SparePartPicker({ value = [], onChange, disabled }) {
  const { empresaId } = useEmpresa();
  const [catalog, setCatalog] = useState([]);
  const [busca, setBusca] = useState("");
  const [showResults, setShowResults] = useState(false);

  useEffect(() => {
    if (!empresaId) return;
    (async () => setCatalog(await listSpareParts(empresaId)))();
  }, [empresaId]);

  const resultados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return [];
    return catalog
      .filter((p) => p.activo !== false)
      .filter((p) => [p.codigo, p.descripcion, p.marca].filter(Boolean).some((v) => String(v).toLowerCase().includes(q)))
      .slice(0, 8);
  }, [catalog, busca]);

  const agregar = (part) => {
    if (value.some((v) => v.spareId === part.id)) {
      setBusca(""); setShowResults(false);
      return;
    }
    onChange([
      ...value,
      { spareId: part.id, codigo: part.codigo, descripcion: part.descripcion, cantidad: 1, costoUnitario: part.costoUnitario || 0, stockDisponible: part.stock || 0 },
    ]);
    setBusca(""); setShowResults(false);
  };

  const cambiarCantidad = (spareId, cantidad) => {
    onChange(value.map((v) => (v.spareId === spareId ? { ...v, cantidad: Math.max(1, Number(cantidad) || 1) } : v)));
  };

  const quitar = (spareId) => onChange(value.filter((v) => v.spareId !== spareId));

  const total = value.reduce((s, v) => s + v.cantidad * (v.costoUnitario || 0), 0);

  return (
    <div>
      <label className="text-xs font-bold text-slate-500 uppercase">Repuestos utilizados</label>

      {!disabled && (
        <div className="relative mt-1">
          <input
            type="text"
            placeholder="Buscar repuesto por código o descripción..."
            className="w-full border-2 border-slate-200 rounded-xl p-2.5 text-sm"
            value={busca}
            onChange={(e) => { setBusca(e.target.value); setShowResults(true); }}
            onFocus={() => setShowResults(true)}
          />
          {showResults && resultados.length > 0 && (
            <div className="absolute z-10 mt-1 w-full bg-white border-2 border-slate-200 rounded-xl shadow-lg max-h-56 overflow-y-auto">
              {resultados.map((p) => (
                <button
                  key={p.id}
                  onClick={() => agregar(p)}
                  className="w-full text-left px-3 py-2 hover:bg-slate-50 border-b border-slate-100 last:border-0"
                >
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-semibold text-slate-800">{p.descripcion}</span>
                    <span className={`text-xs font-bold ${(p.stock || 0) <= (p.stockMinimo || 0) ? "text-red-600" : "text-slate-500"}`}>
                      Stock: {p.stock || 0}
                    </span>
                  </div>
                  <span className="text-xs text-slate-400">{p.codigo} · ${Number(p.costoUnitario || 0).toLocaleString("es-CL")}</span>
                </button>
              ))}
            </div>
          )}
          {showResults && busca.trim() && resultados.length === 0 && (
            <div className="absolute z-10 mt-1 w-full bg-white border-2 border-slate-200 rounded-xl shadow-lg px-3 py-2 text-sm text-slate-400">
              Sin resultados
            </div>
          )}
        </div>
      )}

      {value.length > 0 && (
        <div className="mt-3 space-y-2">
          {value.map((item) => {
            const excede = item.stockDisponible != null && item.cantidad > item.stockDisponible;
            return (
              <div key={item.spareId} className="flex items-center gap-2 bg-slate-50 rounded-xl p-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">{item.descripcion}</p>
                  <p className="text-xs text-slate-400">{item.codigo} · ${Number(item.costoUnitario || 0).toLocaleString("es-CL")} c/u</p>
                  {excede && <p className="text-xs text-red-600 font-bold">Excede stock disponible ({item.stockDisponible})</p>}
                </div>
                {!disabled && (
                  <input
                    type="number"
                    min={1}
                    className="w-16 border-2 border-slate-200 rounded-lg p-1.5 text-sm text-center"
                    value={item.cantidad}
                    onChange={(e) => cambiarCantidad(item.spareId, e.target.value)}
                  />
                )}
                {disabled && <span className="text-sm font-bold text-slate-700">x{item.cantidad}</span>}
                <span className="text-sm font-bold text-slate-900 w-20 text-right">
                  ${(item.cantidad * (item.costoUnitario || 0)).toLocaleString("es-CL")}
                </span>
                {!disabled && (
                  <button onClick={() => quitar(item.spareId)} className="text-slate-400 hover:text-red-600 text-lg leading-none px-1">
                    &times;
                  </button>
                )}
              </div>
            );
          })}
          <div className="flex justify-between items-center pt-2 border-t border-slate-200">
            <span className="text-xs font-bold text-slate-500 uppercase">Total repuestos</span>
            <span className="text-sm font-black text-slate-900">${total.toLocaleString("es-CL")}</span>
          </div>
        </div>
      )}
    </div>
  );
}
