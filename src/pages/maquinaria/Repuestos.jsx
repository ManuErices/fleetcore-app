import React, { useEffect, useState, useMemo } from "react";
import { useEmpresa } from "../../lib/useEmpresa";
import { useUserRole } from "../../lib/useUserRole";
import {
  listSpareParts, upsertSparePart,
  registerSparePartMovement, listSparePartMovements,
} from "../../lib/db";

export default function Repuestos() {
  const { empresaId } = useEmpresa();
  const { role, uid } = useUserRole();
  const puedeEditar = ["superadmin", "admin_contrato", "administrativo", "jefe_taller"].includes(role);

  const [parts, setParts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busca, setBusca] = useState("");
  const [soloBajos, setSoloBajos] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [movePart, setMovePart] = useState(null);   // repuesto para registrar movimiento
  const [kardexPart, setKardexPart] = useState(null); // repuesto para ver kardex

  useEffect(() => {
    if (!empresaId) return;
    refresh();
  }, [empresaId]);

  const refresh = async () => {
    if (!empresaId) return;
    setLoading(true);
    try {
      setParts(await listSpareParts(empresaId));
    } finally {
      setLoading(false);
    }
  };

  const filtered = useMemo(() => {
    let list = parts.filter((p) => p.activo !== false);
    const q = busca.trim().toLowerCase();
    if (q) list = list.filter((p) => [p.codigo, p.descripcion, p.marca].filter(Boolean).some((v) => String(v).toLowerCase().includes(q)));
    if (soloBajos) list = list.filter((p) => (p.stock || 0) <= (p.stockMinimo || 0));
    return list;
  }, [parts, busca, soloBajos]);

  const bajosCount = parts.filter((p) => p.activo !== false && (p.stock || 0) <= (p.stockMinimo || 0)).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h1 className="text-2xl font-black text-slate-900">Repuestos</h1>
        {puedeEditar && (
          <button
            onClick={() => { setEditing(null); setShowForm(true); }}
            className="px-4 py-2 rounded-xl bg-red-600 text-white font-bold text-sm"
          >
            + Nuevo repuesto
          </button>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
        <input
          type="text"
          placeholder="Buscar por código, descripción, marca..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="border-2 border-slate-200 rounded-xl px-4 py-2 text-sm w-full sm:w-80"
        />
        <button
          onClick={() => setSoloBajos(!soloBajos)}
          className={`px-3 py-2 rounded-xl text-xs font-bold border ${soloBajos ? "bg-red-100 text-red-700 border-red-200" : "bg-white text-slate-500 border-slate-200"}`}
        >
          Stock bajo ({bajosCount})
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-slate-400 font-semibold">Cargando repuestos...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-slate-400 font-semibold">
          {parts.length === 0 ? "No hay repuestos en el catálogo." : "Ningún repuesto coincide con el filtro."}
        </div>
      ) : (
        <div className="overflow-x-auto bg-white border-2 border-slate-100 rounded-2xl">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-black text-slate-400 uppercase border-b border-slate-100">
                <th className="px-4 py-3">Código</th>
                <th className="px-4 py-3">Descripción</th>
                <th className="px-4 py-3">Marca</th>
                <th className="px-4 py-3 text-right">Stock</th>
                <th className="px-4 py-3 text-right">Mínimo</th>
                <th className="px-4 py-3 text-right">Costo</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const bajo = (p.stock || 0) <= (p.stockMinimo || 0);
                return (
                  <tr key={p.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">{p.codigo}</td>
                    <td className="px-4 py-3 font-semibold text-slate-900">{p.descripcion}</td>
                    <td className="px-4 py-3 text-slate-500">{p.marca || "—"}</td>
                    <td className={`px-4 py-3 text-right font-bold ${bajo ? "text-red-600" : "text-slate-900"}`}>
                      {p.stock || 0}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-400">{p.stockMinimo || 0}</td>
                    <td className="px-4 py-3 text-right text-slate-700">${Number(p.costoUnitario || 0).toLocaleString("es-CL")}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button onClick={() => setKardexPart(p)} className="text-xs font-bold text-slate-500 hover:text-slate-800 mr-3">
                        Kardex
                      </button>
                      {puedeEditar && (
                        <>
                          <button onClick={() => setMovePart(p)} className="text-xs font-bold text-emerald-600 hover:text-emerald-700 mr-3">
                            Movimiento
                          </button>
                          <button onClick={() => { setEditing(p); setShowForm(true); }} className="text-xs font-bold text-slate-500 hover:text-slate-800">
                            Editar
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <SparePartForm
          empresaId={empresaId}
          part={editing}
          onClose={() => setShowForm(false)}
          onSaved={async () => { setShowForm(false); await refresh(); }}
        />
      )}

      {movePart && (
        <MovementForm
          empresaId={empresaId}
          uid={uid}
          part={movePart}
          onClose={() => setMovePart(null)}
          onSaved={async () => { setMovePart(null); await refresh(); }}
        />
      )}

      {kardexPart && (
        <KardexModal
          empresaId={empresaId}
          part={kardexPart}
          onClose={() => setKardexPart(null)}
        />
      )}
    </div>
  );
}

function SparePartForm({ empresaId, part, onClose, onSaved }) {
  const [f, setF] = useState({
    codigo: part?.codigo || "",
    descripcion: part?.descripcion || "",
    marca: part?.marca || "",
    stock: part?.stock ?? "",
    stockMinimo: part?.stockMinimo ?? "",
    costoUnitario: part?.costoUnitario ?? "",
    ubicacionBodega: part?.ubicacionBodega || "",
    proveedor: part?.proveedor || "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const set = (k, v) => setF((prev) => ({ ...prev, [k]: v }));

  const guardar = async () => {
    setError("");
    if (!f.descripcion.trim()) return setError("Ingresa una descripción");
    setSaving(true);
    try {
      await upsertSparePart(empresaId, {
        id: part?.id,
        codigo: f.codigo.trim(),
        descripcion: f.descripcion.trim(),
        marca: f.marca.trim(),
        // stock inicial solo al crear; después se ajusta con movimientos
        stock: part?.id ? undefined : (f.stock === "" ? 0 : Number(f.stock)),
        stockMinimo: f.stockMinimo === "" ? 0 : Number(f.stockMinimo),
        costoUnitario: f.costoUnitario === "" ? 0 : Number(f.costoUnitario),
        ubicacionBodega: f.ubicacionBodega.trim(),
        proveedor: f.proveedor.trim(),
        activo: true,
      });
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-black text-slate-900">{part ? "Editar repuesto" : "Nuevo repuesto"}</h3>
        {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm font-semibold rounded-xl p-3">{error}</div>}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Código" value={f.codigo} onChange={(v) => set("codigo", v)} />
          <Field label="Marca" value={f.marca} onChange={(v) => set("marca", v)} />
        </div>
        <Field label="Descripción" value={f.descripcion} onChange={(v) => set("descripcion", v)} />
        <div className="grid grid-cols-3 gap-3">
          {!part && <Field label="Stock inicial" type="number" value={f.stock} onChange={(v) => set("stock", v)} />}
          <Field label="Stock mínimo" type="number" value={f.stockMinimo} onChange={(v) => set("stockMinimo", v)} />
          <Field label="Costo unitario" type="number" value={f.costoUnitario} onChange={(v) => set("costoUnitario", v)} />
        </div>
        {part && (
          <p className="text-xs text-slate-400">El stock no se edita aquí — usa "Movimiento" para registrar entradas o ajustes.</p>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Ubicación bodega" value={f.ubicacionBodega} onChange={(v) => set("ubicacionBodega", v)} />
          <Field label="Proveedor" value={f.proveedor} onChange={(v) => set("proveedor", v)} />
        </div>

        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border-2 border-slate-200 text-slate-600 font-bold text-sm">Cancelar</button>
          <button onClick={guardar} disabled={saving} className="flex-1 py-2.5 rounded-xl bg-red-600 text-white font-bold text-sm disabled:opacity-50">
            {saving ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}

function MovementForm({ empresaId, uid, part, onClose, onSaved }) {
  const [tipo, setTipo] = useState("entrada");
  const [cantidad, setCantidad] = useState("");
  const [motivo, setMotivo] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const guardar = async () => {
    setError("");
    const cant = Number(cantidad);
    if (!cant || cant <= 0) return setError("Ingresa una cantidad válida");
    if (tipo === "salida" && cant > (part.stock || 0)) return setError("Stock insuficiente para esa salida");
    setSaving(true);
    try {
      await registerSparePartMovement(empresaId, {
        spareId: part.id,
        tipo,
        cantidad: cant,
        motivo: motivo.trim() || (tipo === "entrada" ? "Compra / ingreso" : tipo === "salida" ? "Salida manual" : "Ajuste de inventario"),
        usuarioId: uid,
      });
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
        <div>
          <h3 className="text-lg font-black text-slate-900">Movimiento de stock</h3>
          <p className="text-xs text-slate-500">{part.descripcion} · stock actual: <strong>{part.stock || 0}</strong></p>
        </div>
        {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm font-semibold rounded-xl p-3">{error}</div>}

        <div>
          <label className="text-xs font-bold text-slate-500 uppercase">Tipo de movimiento</label>
          <div className="grid grid-cols-3 gap-2 mt-1">
            {[
              { id: "entrada", label: "Entrada" },
              { id: "salida", label: "Salida" },
              { id: "ajuste", label: "Ajuste (+)" },
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => setTipo(t.id)}
                className={`py-2 rounded-xl text-sm font-bold border ${tipo === t.id ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-slate-200"}`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <Field label="Cantidad" type="number" value={cantidad} onChange={setCantidad} />
        <Field label="Motivo (opcional)" value={motivo} onChange={setMotivo} />

        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border-2 border-slate-200 text-slate-600 font-bold text-sm">Cancelar</button>
          <button onClick={guardar} disabled={saving} className="flex-1 py-2.5 rounded-xl bg-emerald-600 text-white font-bold text-sm disabled:opacity-50">
            {saving ? "Registrando..." : "Registrar"}
          </button>
        </div>
      </div>
    </div>
  );
}

function KardexModal({ empresaId, part, onClose }) {
  const [movs, setMovs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        setMovs(await listSparePartMovements(empresaId, part.id));
      } finally {
        setLoading(false);
      }
    })();
  }, [empresaId, part.id]);

  const tipoLabel = { entrada: "Entrada", salida: "Salida", ajuste: "Ajuste" };
  const tipoColor = { entrada: "text-emerald-600", salida: "text-red-600", ajuste: "text-blue-600" };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-black text-slate-900">Kardex</h3>
            <p className="text-xs text-slate-500">{part.descripcion} · stock actual: <strong>{part.stock || 0}</strong></p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-2xl leading-none">&times;</button>
        </div>

        {loading ? (
          <p className="text-sm text-slate-400">Cargando movimientos...</p>
        ) : movs.length === 0 ? (
          <p className="text-sm text-slate-400">Sin movimientos registrados.</p>
        ) : (
          <div className="space-y-2">
            {movs.map((m) => (
              <div key={m.id} className="flex items-center justify-between border border-slate-100 rounded-xl p-3">
                <div>
                  <span className={`text-xs font-black uppercase ${tipoColor[m.tipo] || "text-slate-500"}`}>{tipoLabel[m.tipo] || m.tipo}</span>
                  <p className="text-sm text-slate-700">{m.motivo}</p>
                  <p className="text-[11px] text-slate-400">{m.fecha ? new Date(m.fecha).toLocaleString("es-CL") : "—"}</p>
                </div>
                <div className="text-right">
                  <p className={`text-sm font-bold ${m.tipo === "salida" ? "text-red-600" : "text-emerald-600"}`}>
                    {m.tipo === "salida" ? "−" : "+"}{m.cantidad}
                  </p>
                  <p className="text-[11px] text-slate-400">Resultante: {m.stockResultante}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = "text" }) {
  return (
    <div>
      <label className="text-xs font-bold text-slate-500 uppercase">{label}</label>
      <input
        type={type}
        className="w-full border-2 border-slate-200 rounded-xl p-2.5 text-sm mt-1"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
