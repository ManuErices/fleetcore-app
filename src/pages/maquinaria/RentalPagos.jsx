import React, { useEffect, useState, useMemo } from "react";
import { useEmpresa } from "../../lib/useEmpresa";
import { useUserRole } from "../../lib/useUserRole";
import {
  listRentalPayments, upsertRentalPayment, deleteRentalPayment,
  listRentalContracts, suggestPaymentsForContract,
} from "../../lib/db";

const CLP = (n) => "$" + Number(n || 0).toLocaleString("es-CL");

const ESTADOS = {
  pendiente: { label: "Pendiente", color: "bg-slate-100 text-slate-600 border-slate-200" },
  facturado: { label: "Facturado", color: "bg-blue-100 text-blue-700 border-blue-200" },
  pagado:    { label: "Pagado",    color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  vencido:   { label: "Vencido",   color: "bg-red-100 text-red-700 border-red-200" },
};

// Marca como vencido en vivo si pasó la fecha y no está pagado
function estadoEfectivo(p) {
  if (p.estado === "pagado") return "pagado";
  if (p.fechaVencimiento && new Date(p.fechaVencimiento) < new Date() && p.estado !== "pagado") return "vencido";
  return p.estado || "pendiente";
}

export default function RentalPagos() {
  const { empresaId } = useEmpresa();
  const { role } = useUserRole();
  const puedeEditar = ["superadmin", "admin_contrato", "administrativo", "jefe_taller"].includes(role);

  const [payments, setPayments] = useState([]);
  const [contracts, setContracts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filtroEstado, setFiltroEstado] = useState("all");
  const [showGen, setShowGen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    if (!empresaId) return;
    refresh();
    (async () => setContracts(await listRentalContracts(empresaId)))();
  }, [empresaId]);

  const refresh = async () => {
    setLoading(true);
    try { setPayments(await listRentalPayments(empresaId)); }
    finally { setLoading(false); }
  };

  const enriquecidos = useMemo(() => payments.map((p) => ({ ...p, estadoEf: estadoEfectivo(p) })), [payments]);

  const filtered = useMemo(() => {
    const list = filtroEstado === "all" ? enriquecidos : enriquecidos.filter((p) => p.estadoEf === filtroEstado);
    return list.slice().sort((a, b) => new Date(a.fechaVencimiento || 0) - new Date(b.fechaVencimiento || 0));
  }, [enriquecidos, filtroEstado]);

  const totales = useMemo(() => {
    const porCobrar = enriquecidos.filter((p) => p.estadoEf !== "pagado").reduce((s, p) => s + Number(p.monto || 0), 0);
    const vencido = enriquecidos.filter((p) => p.estadoEf === "vencido").reduce((s, p) => s + Number(p.monto || 0), 0);
    const pagadoMes = enriquecidos.filter((p) => p.estadoEf === "pagado").reduce((s, p) => s + Number(p.monto || 0), 0);
    return { porCobrar, vencido, pagadoMes };
  }, [enriquecidos]);

  const marcarPagado = async (p) => {
    await upsertRentalPayment(empresaId, { ...p, estado: "pagado", fechaPago: new Date().toISOString().slice(0, 10) });
    await refresh();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black text-slate-900">Estados de pago</h1>
        {puedeEditar && (
          <div className="flex gap-2">
            <button onClick={() => setShowGen(true)} className="px-4 py-2 rounded-xl border-2 border-slate-200 text-slate-700 font-bold text-sm">
              Generar por contrato
            </button>
            <button onClick={() => { setEditing(null); setShowForm(true); }} className="px-4 py-2 rounded-xl bg-red-600 text-white font-bold text-sm">
              + Cobro manual
            </button>
          </div>
        )}
      </div>

      {/* KPIs de cobranza */}
      <div className="grid grid-cols-3 gap-4">
        <Kpi label="Por cobrar" value={CLP(totales.porCobrar)} color="amber" />
        <Kpi label="Vencido" value={CLP(totales.vencido)} color="red" />
        <Kpi label="Pagado" value={CLP(totales.pagadoMes)} color="emerald" />
      </div>

      <div className="flex flex-wrap gap-2">
        <FiltroBtn active={filtroEstado === "all"} onClick={() => setFiltroEstado("all")} label={`Todos (${payments.length})`} />
        {Object.entries(ESTADOS).map(([id, info]) => {
          const count = enriquecidos.filter((p) => p.estadoEf === id).length;
          if (!count) return null;
          return <FiltroBtn key={id} active={filtroEstado === id} onClick={() => setFiltroEstado(id)} label={`${info.label} (${count})`} />;
        })}
      </div>

      {loading ? (
        <div className="text-center py-12 text-slate-400 font-semibold">Cargando cobros...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-slate-400 font-semibold">No hay cobros{filtroEstado !== "all" ? " en este estado" : ""}.</div>
      ) : (
        <div className="overflow-x-auto bg-white border-2 border-slate-100 rounded-2xl">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-black text-slate-400 uppercase border-b border-slate-100">
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Concepto</th>
                <th className="px-4 py-3">Vence</th>
                <th className="px-4 py-3 text-right">Monto</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const est = ESTADOS[p.estadoEf] || ESTADOS.pendiente;
                return (
                  <tr key={p.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                    <td className="px-4 py-3 font-semibold text-slate-900">{p.clienteNombre || "—"}</td>
                    <td className="px-4 py-3 text-slate-600">{p.concepto}</td>
                    <td className="px-4 py-3 text-slate-500">{p.fechaVencimiento ? new Date(p.fechaVencimiento).toLocaleDateString("es-CL") : "—"}</td>
                    <td className="px-4 py-3 text-right font-bold text-slate-900">{CLP(p.monto)}</td>
                    <td className="px-4 py-3">
                      <span className={`text-[10px] font-black uppercase px-2 py-1 rounded-full border ${est.color}`}>{est.label}</span>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {puedeEditar && p.estadoEf !== "pagado" && (
                        <button onClick={() => marcarPagado(p)} className="text-xs font-bold text-emerald-600 hover:text-emerald-700 mr-3">Marcar pagado</button>
                      )}
                      {puedeEditar && (
                        <button onClick={() => { setEditing(p); setShowForm(true); }} className="text-xs font-bold text-slate-500 hover:text-slate-800">Editar</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showGen && (
        <GenerarModal
          empresaId={empresaId}
          contracts={contracts.filter((c) => c.estado === "activo")}
          onClose={() => setShowGen(false)}
          onSaved={async () => { setShowGen(false); await refresh(); }}
        />
      )}

      {showForm && (
        <PaymentForm
          empresaId={empresaId}
          payment={editing}
          contracts={contracts}
          puedeEditar={puedeEditar}
          onClose={() => setShowForm(false)}
          onSaved={async () => { setShowForm(false); await refresh(); }}
        />
      )}
    </div>
  );
}

function Kpi({ label, value, color }) {
  const c = { amber: "from-amber-500 to-amber-600", red: "from-red-500 to-rose-600", emerald: "from-emerald-500 to-emerald-600" };
  return (
    <div className="bg-white border-2 border-slate-100 rounded-2xl p-4">
      <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${c[color]} mb-2`} />
      <p className="text-xl font-black text-slate-900">{value}</p>
      <p className="text-xs font-semibold text-slate-500 mt-0.5">{label}</p>
    </div>
  );
}

function FiltroBtn({ active, onClick, label }) {
  return (
    <button onClick={onClick} className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${active ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-slate-200"}`}>
      {label}
    </button>
  );
}

// Modal: genera cobros sugeridos para un contrato (editables antes de crear)
function GenerarModal({ empresaId, contracts, onClose, onSaved }) {
  const [contratoId, setContratoId] = useState("");
  const [sugeridos, setSugeridos] = useState([]);
  const [saving, setSaving] = useState(false);

  const onSelect = (id) => {
    setContratoId(id);
    const c = contracts.find((x) => x.id === id);
    setSugeridos(c ? suggestPaymentsForContract(c).map((p) => ({ ...p, incluir: true })) : []);
  };

  const toggle = (i) => setSugeridos(sugeridos.map((p, idx) => idx === i ? { ...p, incluir: !p.incluir } : p));
  const setMonto = (i, v) => setSugeridos(sugeridos.map((p, idx) => idx === i ? { ...p, monto: Number(v) || 0 } : p));

  const crear = async () => {
    const aCrear = sugeridos.filter((p) => p.incluir);
    if (aCrear.length === 0) return;
    setSaving(true);
    try {
      for (const p of aCrear) {
        const { incluir, ...data } = p;
        await upsertRentalPayment(empresaId, data);
      }
      onSaved();
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-black text-slate-900">Generar cobros por contrato</h3>

        <div>
          <label className="text-xs font-bold text-slate-500 uppercase">Contrato activo</label>
          <select className="w-full border-2 border-slate-200 rounded-xl p-2.5 text-sm mt-1" value={contratoId} onChange={(e) => onSelect(e.target.value)}>
            <option value="">Selecciona...</option>
            {contracts.map((c) => <option key={c.id} value={c.id}>{c.clienteNombre} {c.numero ? `(N° ${c.numero})` : ""}</option>)}
          </select>
        </div>

        {contratoId && sugeridos.length === 0 && (
          <p className="text-sm text-slate-400">Este contrato no tiene fecha de inicio o monto para sugerir cobros. Edítalo en Contratos.</p>
        )}

        {sugeridos.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs text-slate-500">Marca los meses a crear y ajusta montos si quieres:</p>
            {sugeridos.map((p, i) => (
              <div key={i} className="flex items-center gap-2 border border-slate-200 rounded-xl p-2">
                <input type="checkbox" checked={p.incluir} onChange={() => toggle(i)} className="w-4 h-4 accent-emerald-600" />
                <span className="text-sm font-semibold text-slate-700 flex-1">{p.periodo}</span>
                <span className="text-xs text-slate-400">vence {new Date(p.fechaVencimiento).toLocaleDateString("es-CL")}</span>
                <input type="number" value={p.monto} onChange={(e) => setMonto(i, e.target.value)} className="w-28 border-2 border-slate-200 rounded-lg p-1.5 text-sm text-right" />
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border-2 border-slate-200 text-slate-600 font-bold text-sm">Cancelar</button>
          <button onClick={crear} disabled={saving || sugeridos.filter((p) => p.incluir).length === 0} className="flex-1 py-2.5 rounded-xl bg-red-600 text-white font-bold text-sm disabled:opacity-50">
            {saving ? "Creando..." : `Crear ${sugeridos.filter((p) => p.incluir).length} cobros`}
          </button>
        </div>
      </div>
    </div>
  );
}

function PaymentForm({ empresaId, payment, contracts, puedeEditar, onClose, onSaved }) {
  const [f, setF] = useState({
    contratoId: payment?.contratoId || "", clienteNombre: payment?.clienteNombre || "",
    concepto: payment?.concepto || "", monto: payment?.monto ?? "", periodo: payment?.periodo || "",
    fechaVencimiento: payment?.fechaVencimiento || "", estado: payment?.estado || "pendiente",
    numeroFactura: payment?.numeroFactura || "", observaciones: payment?.observaciones || "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  const onSelectContrato = (id) => {
    const c = contracts.find((x) => x.id === id);
    set("contratoId", id);
    if (c) { set("clienteNombre", c.clienteNombre || ""); }
  };

  const guardar = async () => {
    setError("");
    if (!f.clienteNombre.trim()) return setError("Indica el cliente");
    if (!f.monto) return setError("Indica el monto");
    setSaving(true);
    try {
      const c = contracts.find((x) => x.id === f.contratoId);
      await upsertRentalPayment(empresaId, {
        id: payment?.id, ...f, monto: Number(f.monto),
        clienteId: c?.clienteId || payment?.clienteId || null,
      });
      onSaved();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  const eliminar = async () => {
    if (!window.confirm("¿Eliminar este cobro?")) return;
    await deleteRentalPayment(empresaId, payment.id);
    onSaved();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-black text-slate-900">{payment ? "Editar cobro" : "Nuevo cobro"}</h3>
        {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm font-semibold rounded-xl p-3">{error}</div>}

        <div>
          <label className="text-xs font-bold text-slate-500 uppercase">Contrato (opcional)</label>
          <select className="w-full border-2 border-slate-200 rounded-xl p-2.5 text-sm mt-1" value={f.contratoId} onChange={(e) => onSelectContrato(e.target.value)}>
            <option value="">Sin contrato</option>
            {contracts.map((c) => <option key={c.id} value={c.id}>{c.clienteNombre} {c.numero ? `(N° ${c.numero})` : ""}</option>)}
          </select>
        </div>
        <Field label="Cliente" value={f.clienteNombre} onChange={(v) => set("clienteNombre", v)} />
        <Field label="Concepto" value={f.concepto} onChange={(v) => set("concepto", v)} />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Monto CLP" type="number" value={f.monto} onChange={(v) => set("monto", v)} />
          <Field label="Período (ej. 2026-08)" value={f.periodo} onChange={(v) => set("periodo", v)} />
          <Field label="Vencimiento" type="date" value={f.fechaVencimiento} onChange={(v) => set("fechaVencimiento", v)} />
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase">Estado</label>
            <select className="w-full border-2 border-slate-200 rounded-xl p-2.5 text-sm mt-1" value={f.estado} onChange={(e) => set("estado", e.target.value)}>
              {Object.entries(ESTADOS).map(([id, info]) => <option key={id} value={id}>{info.label}</option>)}
            </select>
          </div>
          <Field label="N° factura" value={f.numeroFactura} onChange={(v) => set("numeroFactura", v)} />
        </div>

        <div className="flex gap-3 pt-2">
          {payment && puedeEditar && (
            <button onClick={eliminar} className="py-2.5 px-4 rounded-xl border-2 border-red-200 text-red-600 font-bold text-sm">Eliminar</button>
          )}
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border-2 border-slate-200 text-slate-600 font-bold text-sm">Cancelar</button>
          <button onClick={guardar} disabled={saving} className="flex-1 py-2.5 rounded-xl bg-red-600 text-white font-bold text-sm disabled:opacity-50">
            {saving ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = "text" }) {
  return (
    <div>
      <label className="text-xs font-bold text-slate-500 uppercase">{label}</label>
      <input type={type} className="w-full border-2 border-slate-200 rounded-xl p-2.5 text-sm mt-1" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
