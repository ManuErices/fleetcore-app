import React, { useEffect, useState } from "react";
import { useEmpresa } from "../../lib/useEmpresa";
import { useUserRole } from "../../lib/useUserRole";
import {
  listChecklistTemplates, upsertChecklistTemplate, deleteChecklistTemplate,
} from "../../lib/db";

const TIPOS = [
  { id: "preventiva", label: "Preventiva" },
  { id: "correctiva", label: "Correctiva" },
  { id: "inspeccion", label: "Inspección" },
  { id: "emergencia", label: "Emergencia" },
];

export default function MaquinariaConfig() {
  const { empresaId } = useEmpresa();
  const { role } = useUserRole();
  const puedeEditar = ["superadmin", "admin_contrato", "administrativo", "jefe_taller"].includes(role);

  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    if (!empresaId) return;
    refresh();
  }, [empresaId]);

  const refresh = async () => {
    setLoading(true);
    try { setTemplates(await listChecklistTemplates(empresaId)); }
    finally { setLoading(false); }
  };

  if (!puedeEditar) {
    return <div className="text-center py-16 text-slate-400 font-semibold">No tienes permisos para la configuración del módulo.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black text-slate-900">Configuración</h1>
        <button onClick={() => { setEditing(null); setShowForm(true); }} className="px-4 py-2 rounded-xl bg-red-600 text-white font-bold text-sm">
          + Nueva plantilla
        </button>
      </div>

      <div>
        <p className="text-xs font-black text-slate-500 uppercase mb-3">Plantillas de checklist de mantención</p>
        <p className="text-sm text-slate-500 mb-4">
          Estas plantillas definen la lista de tareas que el mecánico verá al trabajar una orden de trabajo, según su tipo.
        </p>

        {loading ? (
          <p className="text-sm text-slate-400">Cargando...</p>
        ) : templates.length === 0 ? (
          <p className="text-sm text-slate-400">No hay plantillas creadas.</p>
        ) : (
          <div className="space-y-3">
            {templates.map((t) => (
              <div key={t.id} className="bg-white border-2 border-slate-100 rounded-2xl p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                        {TIPOS.find((x) => x.id === t.tipo)?.label || t.tipo}
                      </span>
                      <h3 className="font-black text-slate-900">{t.nombre || "Sin nombre"}</h3>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">{(t.items || []).length} ítems</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => { setEditing(t); setShowForm(true); }} className="text-xs font-bold text-slate-500 hover:text-slate-800">Editar</button>
                    <button
                      onClick={async () => { if (window.confirm("¿Eliminar esta plantilla?")) { await deleteChecklistTemplate(empresaId, t.id); await refresh(); } }}
                      className="text-xs font-bold text-red-500 hover:text-red-700"
                    >
                      Eliminar
                    </button>
                  </div>
                </div>
                {(t.items || []).length > 0 && (
                  <ul className="mt-3 pl-4 space-y-0.5">
                    {t.items.map((it) => <li key={it.id} className="text-sm text-slate-600 list-disc">{it.texto}</li>)}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {showForm && (
        <TemplateForm
          empresaId={empresaId}
          template={editing}
          onClose={() => setShowForm(false)}
          onSaved={async () => { setShowForm(false); await refresh(); }}
        />
      )}
    </div>
  );
}

function TemplateForm({ empresaId, template, onClose, onSaved }) {
  const [tipo, setTipo] = useState(template?.tipo || "preventiva");
  const [nombre, setNombre] = useState(template?.nombre || "");
  const [items, setItems] = useState(template?.items?.length ? template.items.map((i) => ({ ...i })) : [{ id: crypto.randomUUID(), texto: "" }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const setItemTexto = (id, texto) => setItems(items.map((i) => i.id === id ? { ...i, texto } : i));
  const addItem = () => setItems([...items, { id: crypto.randomUUID(), texto: "" }]);
  const removeItem = (id) => setItems(items.filter((i) => i.id !== id));

  const guardar = async () => {
    setError("");
    if (!nombre.trim()) return setError("Ingresa un nombre para la plantilla");
    const limpios = items.filter((i) => i.texto.trim()).map((i) => ({ id: i.id, texto: i.texto.trim() }));
    if (limpios.length === 0) return setError("Agrega al menos un ítem al checklist");
    setSaving(true);
    try {
      await upsertChecklistTemplate(empresaId, { id: template?.id, tipo, nombre: nombre.trim(), items: limpios, activo: true });
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
        <h3 className="text-lg font-black text-slate-900">{template ? "Editar plantilla" : "Nueva plantilla de checklist"}</h3>
        {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm font-semibold rounded-xl p-3">{error}</div>}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase">Tipo de mantención</label>
            <select className="w-full border-2 border-slate-200 rounded-xl p-2.5 text-sm mt-1" value={tipo} onChange={(e) => setTipo(e.target.value)}>
              {TIPOS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase">Nombre</label>
            <input className="w-full border-2 border-slate-200 rounded-xl p-2.5 text-sm mt-1" placeholder="Ej. Pauta 250 h" value={nombre} onChange={(e) => setNombre(e.target.value)} />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-bold text-slate-500 uppercase">Ítems del checklist</label>
            <button onClick={addItem} className="text-xs font-bold text-red-600 hover:text-red-700">+ Agregar ítem</button>
          </div>
          <div className="space-y-2">
            {items.map((it, idx) => (
              <div key={it.id} className="flex items-center gap-2">
                <span className="text-xs text-slate-400 w-5">{idx + 1}.</span>
                <input
                  className="flex-1 border-2 border-slate-200 rounded-xl p-2 text-sm"
                  placeholder="Ej. Revisar nivel de aceite"
                  value={it.texto}
                  onChange={(e) => setItemTexto(it.id, e.target.value)}
                />
                <button onClick={() => removeItem(it.id)} className="text-slate-400 hover:text-red-600 text-lg leading-none px-1">&times;</button>
              </div>
            ))}
          </div>
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
