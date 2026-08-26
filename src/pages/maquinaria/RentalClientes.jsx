import React, { useEffect, useState, useMemo } from "react";
import { useEmpresa } from "../../lib/useEmpresa";
import { useUserRole } from "../../lib/useUserRole";
import { listRentalClients, upsertRentalClient, deleteRentalClient } from "../../lib/db";

export default function RentalClientes() {
  const { empresaId } = useEmpresa();
  const { role } = useUserRole();
  const puedeEditar = ["superadmin", "admin_contrato", "administrativo", "jefe_taller"].includes(role);

  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busca, setBusca] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);

  useEffect(() => {
    if (!empresaId) return;
    refresh();
  }, [empresaId]);

  const refresh = async () => {
    setLoading(true);
    try { setClients(await listRentalClients(empresaId)); }
    finally { setLoading(false); }
  };

  const filtered = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const base = clients.filter((c) => c.activo !== false);
    if (!q) return base;
    return base.filter((c) => [c.nombre, c.rut, c.contacto, c.email].filter(Boolean).some((v) => String(v).toLowerCase().includes(q)));
  }, [clients, busca]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black text-slate-900">Clientes</h1>
        {puedeEditar && (
          <button onClick={() => { setEditing(null); setShowForm(true); }} className="px-4 py-2 rounded-xl bg-red-600 text-white font-bold text-sm">
            + Nuevo cliente
          </button>
        )}
      </div>

      <input
        type="text"
        placeholder="Buscar por nombre, RUT, contacto..."
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        className="border-2 border-slate-200 rounded-xl px-4 py-2 text-sm w-full sm:w-80"
      />

      {loading ? (
        <div className="text-center py-12 text-slate-400 font-semibold">Cargando clientes...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-slate-400 font-semibold">
          {clients.length === 0 ? "No hay clientes registrados." : "Ningún cliente coincide con la búsqueda."}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((c) => (
            <div key={c.id} className="bg-white border-2 border-slate-100 rounded-2xl p-4">
              <div className="flex items-start justify-between">
                <div className="min-w-0">
                  <h3 className="font-black text-slate-900 truncate">{c.nombre}</h3>
                  {c.rut && <p className="text-xs text-slate-400">{c.rut}</p>}
                </div>
                {puedeEditar && (
                  <button onClick={() => { setEditing(c); setShowForm(true); }} className="text-xs font-bold text-slate-500 hover:text-slate-800 shrink-0">Editar</button>
                )}
              </div>
              <div className="mt-3 space-y-1 text-sm text-slate-600">
                {c.contacto && <p>👤 {c.contacto}</p>}
                {c.email && <p className="truncate">✉️ {c.email}</p>}
                {c.telefono && <p>📞 {c.telefono}</p>}
                {c.condicionPago && <p className="text-xs text-slate-400 mt-1">Pago: {c.condicionPago}</p>}
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <ClientForm
          empresaId={empresaId}
          client={editing}
          puedeEliminar={puedeEditar}
          onClose={() => setShowForm(false)}
          onSaved={async () => { setShowForm(false); await refresh(); }}
        />
      )}
    </div>
  );
}

function ClientForm({ empresaId, client, puedeEliminar, onClose, onSaved }) {
  const [f, setF] = useState({
    nombre: client?.nombre || "", rut: client?.rut || "", contacto: client?.contacto || "",
    email: client?.email || "", telefono: client?.telefono || "", direccion: client?.direccion || "",
    condicionPago: client?.condicionPago || "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  const guardar = async () => {
    setError("");
    if (!f.nombre.trim()) return setError("Ingresa el nombre del cliente");
    setSaving(true);
    try {
      await upsertRentalClient(empresaId, { id: client?.id, ...f, activo: true });
      onSaved();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  const eliminar = async () => {
    if (!window.confirm("¿Eliminar este cliente?")) return;
    await deleteRentalClient(empresaId, client.id);
    onSaved();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-black text-slate-900">{client ? "Editar cliente" : "Nuevo cliente"}</h3>
        {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm font-semibold rounded-xl p-3">{error}</div>}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Nombre / Razón social" value={f.nombre} onChange={(v) => set("nombre", v)} full />
          <Field label="RUT" value={f.rut} onChange={(v) => set("rut", v)} />
          <Field label="Contacto" value={f.contacto} onChange={(v) => set("contacto", v)} />
          <Field label="Email" value={f.email} onChange={(v) => set("email", v)} />
          <Field label="Teléfono" value={f.telefono} onChange={(v) => set("telefono", v)} />
          <Field label="Condición de pago" value={f.condicionPago} onChange={(v) => set("condicionPago", v)} />
          <Field label="Dirección" value={f.direccion} onChange={(v) => set("direccion", v)} full />
        </div>

        <div className="flex gap-3 pt-2">
          {client && puedeEliminar && (
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

function Field({ label, value, onChange, full }) {
  return (
    <div className={full ? "col-span-2" : ""}>
      <label className="text-xs font-bold text-slate-500 uppercase">{label}</label>
      <input className="w-full border-2 border-slate-200 rounded-xl p-2.5 text-sm mt-1" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
