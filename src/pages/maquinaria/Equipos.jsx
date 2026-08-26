import React, { useEffect, useState, useMemo } from "react";
import { useEmpresa } from "../../lib/useEmpresa";
import { useUserRole } from "../../lib/useUserRole";
import { useMaquinariaFilter, filterMachinesByProject } from "../../components/maquinaria/MaquinariaFilterContext";
import { listMachines } from "../../lib/db";
import EquipoMantenimiento from "../../components/maquinaria/EquipoMantenimiento";

const ESTADOS_MAQUINA = {
  operativa:        { label: "Operativa",        color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  disponible:       { label: "Disponible",       color: "bg-blue-100 text-blue-700 border-blue-200" },
  en_mantencion:    { label: "En mantención",    color: "bg-amber-100 text-amber-700 border-amber-200" },
  fuera_de_servicio:{ label: "Fuera de servicio",color: "bg-red-100 text-red-700 border-red-200" },
  dada_de_baja:     { label: "Dada de baja",     color: "bg-slate-200 text-slate-500 border-slate-300" },
};

export default function Equipos() {
  const { empresaId } = useEmpresa();
  const { role } = useUserRole();
  const { projectId } = useMaquinariaFilter();
  const puedeEditar = ["superadmin", "admin_contrato", "administrativo", "jefe_taller"].includes(role);

  const [machines, setMachines] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busca, setBusca] = useState("");
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    if (!empresaId) return;
    refresh();
  }, [empresaId]);

  const refresh = async () => {
    if (!empresaId) return;
    setLoading(true);
    try {
      setMachines(await listMachines(empresaId));
    } finally {
      setLoading(false);
    }
  };

  const machineName = (m) => m.name || `${m.marca || ""} ${m.modelo || ""}`.trim() || m.code || m.id;

  const filtered = useMemo(() => {
    const base = filterMachinesByProject(machines, projectId);
    const q = busca.trim().toLowerCase();
    if (!q) return base;
    return base.filter((m) =>
      [m.name, m.code, m.marca, m.modelo, m.patente].filter(Boolean).some((v) => String(v).toLowerCase().includes(q))
    );
  }, [machines, busca, projectId]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h1 className="text-2xl font-black text-slate-900">Equipos</h1>
        <input
          type="text"
          placeholder="Buscar por nombre, código, patente..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="border-2 border-slate-200 rounded-xl px-4 py-2 text-sm w-full sm:w-80"
        />
      </div>

      {loading ? (
        <div className="text-center py-12 text-slate-400 font-semibold">Cargando equipos...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-slate-400 font-semibold">
          {machines.length === 0 ? "No hay equipos registrados." : "Ningún equipo coincide con la búsqueda."}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((m) => {
            const estado = ESTADOS_MAQUINA[m.status] || ESTADOS_MAQUINA.operativa;
            const medidorLabel = m.medidorTipo === "kilometraje" ? "km" : "h";
            return (
              <button
                key={m.id}
                onClick={() => setSelected(m)}
                className="text-left bg-white border-2 border-slate-100 rounded-2xl p-4 hover:border-slate-300 hover:shadow-md transition-all"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-black uppercase text-slate-400">{m.code || "Sin código"}</span>
                  <span className={`text-[10px] font-black uppercase px-2 py-1 rounded-full border ${estado.color}`}>
                    {estado.label}
                  </span>
                </div>
                <h3 className="font-black text-slate-900">{machineName(m)}</h3>
                <p className="text-xs text-slate-500 mt-1">
                  {[m.marca, m.modelo].filter(Boolean).join(" · ") || "Sin marca/modelo"}
                </p>
                <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100">
                  <span className="text-xs text-slate-500">Medidor</span>
                  <span className="text-sm font-bold text-slate-900">
                    {m.medidorActual != null ? `${Number(m.medidorActual).toLocaleString("es-CL")} ${medidorLabel}` : "—"}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {selected && (
        <EquipoMantenimiento
          machine={selected}
          puedeEditar={puedeEditar}
          onClose={() => setSelected(null)}
          onUpdated={() => { refresh(); }}
        />
      )}
    </div>
  );
}
