import React, { useEffect, useState } from "react";
import { listAllProjects, upsertProject, toggleProjectActive, deleteProject } from "../../lib/db";
import { useEmpresa } from "../../lib/useEmpresa";

const empty = () => ({
  id: "",
  name: "",
  codigo: "",
  active: true,
});

export default function Proyectos() {
  const { empresaId } = useEmpresa();
  const [projects, setProjects] = useState([]);
  const [form, setForm] = useState(empty());
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");

  const refresh = async () => {
    if (!empresaId) return;
    setLoading(true);
    try {
      const p = await listAllProjects(empresaId);
      setProjects(p);
    } catch (error) {
      console.error("Error cargando proyectos:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!empresaId) return;
    refresh();
  }, [empresaId]);

  const onNew = () => {
    setForm(empty());
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const onEdit = (p) => {
    setForm({
      id: p.id,
      name: p.name || "",
      codigo: p.codigo || "",
      active: p.active !== false,
    });
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const onSave = async () => {
    if (!form.name.trim()) {
      alert("El nombre del proyecto es obligatorio");
      return;
    }
    setLoading(true);
    try {
      await upsertProject(empresaId, form);
      setForm(empty());
      setShowForm(false);
      await refresh();
    } catch (error) {
      console.error("Error al guardar proyecto:", error);
      alert("Error al guardar: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const onToggleActive = async (p) => {
    try {
      await toggleProjectActive(empresaId, p.id, !p.active);
      await refresh();
    } catch (error) {
      alert("Error al actualizar estado: " + error.message);
    }
  };

  const onDelete = async (p) => {
    if (!confirm(`¿Eliminar el proyecto "${p.name}" permanentemente?\n\nEsto NO elimina los datos ya asociados (equipos, rendiciones, OC, etc.) en otros módulos, pero dejarán de estar vinculados a un proyecto visible.`)) {
      return;
    }
    setLoading(true);
    try {
      await deleteProject(empresaId, p.id);
      await refresh();
    } catch (error) {
      alert("Error al eliminar: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const filtered = projects.filter(p =>
    !search.trim() ||
    p.name?.toLowerCase().includes(search.toLowerCase()) ||
    p.codigo?.toLowerCase().includes(search.toLowerCase())
  );

  const activeCount = projects.filter(p => p.active !== false).length;
  const inactiveCount = projects.length - activeCount;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="glass-card rounded-2xl p-6 animate-fadeInUp">
        <div className="flex flex-col lg:flex-row lg:items-end gap-4 lg:justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-900 to-blue-700 flex items-center justify-center shadow-lg">
                <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
              <div>
                <h1 className="text-3xl font-black text-slate-900 tracking-tight">
                  Proyectos
                </h1>
                <p className="text-slate-600 mt-1 text-sm">
                  Crea y administra los proyectos/obras de tu empresa. Son la base para Equipos, Rendiciones, Órdenes de Compra y más.
                </p>
              </div>
            </div>
          </div>
          <button
            onClick={onNew}
            className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-bold text-sm text-white bg-gradient-to-r from-blue-900 to-blue-700 hover:from-blue-800 hover:to-blue-600 shadow-lg transition-all"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Nuevo Proyecto
          </button>
        </div>
      </div>

      {/* Resumen rápido */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <div className="glass-card rounded-2xl p-5">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Total Proyectos</div>
          <div className="text-2xl font-black text-slate-900">{projects.length}</div>
        </div>
        <div className="glass-card rounded-2xl p-5">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Activos</div>
          <div className="text-2xl font-black text-emerald-600">{activeCount}</div>
        </div>
        <div className="glass-card rounded-2xl p-5">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Inactivos</div>
          <div className="text-2xl font-black text-slate-400">{inactiveCount}</div>
        </div>
      </div>

      {/* Formulario crear/editar */}
      {showForm && (
        <div className="glass-card rounded-2xl p-6 animate-fadeInUp">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-slate-900">
              {form.id ? "Editar Proyecto" : "Nuevo Proyecto"}
            </h2>
            <button
              onClick={() => { setShowForm(false); setForm(empty()); }}
              className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <Field
              label="Nombre del Proyecto"
              value={form.name}
              onChange={(v) => setForm({ ...form, name: v })}
              placeholder="Ej: Nuevo Cobre"
              required
            />
            <Field
              label="Código (opcional)"
              value={form.codigo}
              onChange={(v) => setForm({ ...form, codigo: v })}
              placeholder="Ej: PRY-001"
            />
            <div className="sm:col-span-2 flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setForm({ ...form, active: !form.active })}
                className={`relative w-12 h-6 rounded-full transition-colors ${form.active ? "bg-emerald-500" : "bg-slate-300"}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${form.active ? "translate-x-6" : ""}`} />
              </button>
              <span className="text-sm font-semibold text-slate-700">
                {form.active ? "Proyecto activo" : "Proyecto inactivo"}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 mt-6">
            <button
              onClick={onSave}
              disabled={loading}
              className="px-6 py-3 rounded-xl font-bold text-sm text-white bg-gradient-to-r from-blue-900 to-blue-700 hover:from-blue-800 hover:to-blue-600 shadow-lg transition-all disabled:opacity-50"
            >
              {loading ? "Guardando..." : "Guardar"}
            </button>
            <button
              onClick={() => { setShowForm(false); setForm(empty()); }}
              className="px-6 py-3 rounded-xl font-bold text-sm text-slate-600 bg-white border border-slate-200 hover:border-slate-300 transition-all"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Buscador */}
      <div className="glass-card rounded-2xl p-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre, obra o código..."
          className="input-modern w-full"
        />
      </div>

      {/* Listado */}
      <div className="glass-card rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left px-6 py-4 text-xs font-bold text-slate-600 uppercase">Proyecto</th>
                <th className="text-left px-6 py-4 text-xs font-bold text-slate-600 uppercase">Código</th>
                <th className="text-left px-6 py-4 text-xs font-bold text-slate-600 uppercase">Estado</th>
                <th className="text-right px-6 py-4 text-xs font-bold text-slate-600 uppercase">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-slate-400">
                    {projects.length === 0
                      ? 'No hay proyectos creados. Haz clic en "Nuevo Proyecto" para crear el primero.'
                      : "No hay proyectos que coincidan con la búsqueda."}
                  </td>
                </tr>
              )}
              {filtered.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-900 to-blue-700 flex items-center justify-center shadow-md flex-shrink-0">
                        <span className="text-white text-xs font-bold">
                          {p.name?.substring(0, 2).toUpperCase() || "PR"}
                        </span>
                      </div>
                      <div className="font-semibold text-slate-900">{p.name}</div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600">{p.codigo || "-"}</td>
                  <td className="px-6 py-4">
                    <button
                      onClick={() => onToggleActive(p)}
                      className={`inline-flex px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                        p.active !== false
                          ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                          : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                      }`}
                      title="Clic para cambiar estado"
                    >
                      {p.active !== false ? "Activo" : "Inactivo"}
                    </button>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => onEdit(p)}
                        className="p-2 rounded-lg text-blue-600 hover:bg-blue-50 transition-colors"
                        title="Editar"
                      >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => onDelete(p)}
                        className="p-2 rounded-lg text-red-600 hover:bg-red-50 transition-colors"
                        title="Eliminar"
                      >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, required, type = "text" }) {
  return (
    <div>
      <label className="block text-sm font-semibold text-slate-700 mb-2">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="input-modern w-full"
      />
    </div>
  );
}
