import React, { useEffect, useState, useMemo } from "react";
import { useEmpresa } from "../../lib/useEmpresa";
import { useUserRole } from "../../lib/useUserRole"; // si no existe aún en el proyecto, avisar para crearlo
import { useMaquinariaFilter } from "../../components/maquinaria/MaquinariaFilterContext";
import { listWorkOrders, listMachines, upsertWorkOrder } from "../../lib/db";
import WorkOrderDetalle from "../../components/maquinaria/WorkOrderDetalle";

const ESTADOS = [
  { id: "pendiente",             label: "Pendiente",             color: "bg-slate-100 text-slate-700 border-slate-200" },
  { id: "asignada",              label: "Asignada",              color: "bg-blue-100 text-blue-700 border-blue-200" },
  { id: "en_diagnostico",        label: "En diagnóstico",        color: "bg-amber-100 text-amber-700 border-amber-200" },
  { id: "en_ejecucion",          label: "En ejecución",          color: "bg-indigo-100 text-indigo-700 border-indigo-200" },
  { id: "esperando_repuesto",    label: "Esperando repuesto",    color: "bg-orange-100 text-orange-700 border-orange-200" },
  { id: "esperando_autorizacion",label: "Esperando autorización",color: "bg-purple-100 text-purple-700 border-purple-200" },
  { id: "terminada",             label: "Terminada",             color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  { id: "cerrada",               label: "Cerrada",                color: "bg-slate-200 text-slate-500 border-slate-300" },
  { id: "cancelada",             label: "Cancelada",              color: "bg-red-100 text-red-700 border-red-200" },
];

const PRIORIDADES = {
  baja:   "bg-slate-100 text-slate-600",
  media:  "bg-blue-100 text-blue-600",
  alta:   "bg-orange-100 text-orange-600",
  urgente:"bg-red-100 text-red-700",
};

export default function OrdenesTrabajo() {
  const { empresaId } = useEmpresa();
  const { role, uid } = useUserRole();
  const { projectId } = useMaquinariaFilter();
  const isMecanico = role === "mecanico";

  const [workOrders, setWorkOrders] = useState([]);
  const [machines, setMachines] = useState([]);
  const [filtroEstado, setFiltroEstado] = useState("all");
  const [loading, setLoading] = useState(false);
  const [selectedOT, setSelectedOT] = useState(null);

  useEffect(() => {
    if (!empresaId) return;
    refresh();
    (async () => setMachines(await listMachines(empresaId)))();
  }, [empresaId]);

  const refresh = async () => {
    if (!empresaId) return;
    setLoading(true);
    try {
      // Un mecánico solo ve sus OT asignadas; el resto ve todo (con filtro opcional de estado)
      const filters = isMecanico ? { asignadoA: uid } : {};
      const data = await listWorkOrders(empresaId, filters);
      setWorkOrders(data);
    } finally {
      setLoading(false);
    }
  };

  const machineName = (id) => {
    const m = machines.find((x) => x.id === id);
    return m ? (m.name || `${m.marca || ""} ${m.modelo || ""}`.trim() || m.code) : id;
  };

  const filtered = useMemo(() => {
    let list = workOrders;
    // Filtro global por proyecto: solo OT de máquinas del proyecto activo
    if (projectId) {
      const validIds = new Set(machines.filter((m) => m.projectId === projectId).map((m) => m.id));
      list = list.filter((wo) => validIds.has(wo.machineId));
    }
    if (filtroEstado !== "all") list = list.filter((wo) => wo.estado === filtroEstado);
    return list;
  }, [workOrders, filtroEstado, projectId, machines]);

  const crearOTManual = async (machineId) => {
    const id = await upsertWorkOrder(empresaId, {
      machineId, origen: "solicitud", prioridad: "media", estado: "pendiente",
      fechaApertura: new Date().toISOString(),
    });
    await refresh();
    setSelectedOT({ id, machineId, origen: "solicitud", estado: "pendiente" });
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black text-slate-900">
          {isMecanico ? "Mis Órdenes de Trabajo" : "Órdenes de Trabajo"}
        </h1>
        {!isMecanico && (
          <select
            className="border-2 border-slate-200 rounded-xl px-4 py-2 text-sm font-semibold"
            onChange={(e) => e.target.value && crearOTManual(e.target.value)}
            value=""
          >
            <option value="">+ Nueva OT manual (elegir equipo)</option>
            {machines.map((m) => (
              <option key={m.id} value={m.id}>{m.name || m.code}</option>
            ))}
          </select>
        )}
      </div>

      {!isMecanico && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setFiltroEstado("all")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${filtroEstado === "all" ? "bg-slate-900 text-white" : "bg-white text-slate-600 border-slate-200"}`}
          >
            Todas ({workOrders.length})
          </button>
          {ESTADOS.map((e) => {
            const count = workOrders.filter((wo) => wo.estado === e.id).length;
            if (!count) return null;
            return (
              <button
                key={e.id}
                onClick={() => setFiltroEstado(e.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${filtroEstado === e.id ? e.color : "bg-white text-slate-500 border-slate-200"}`}
              >
                {e.label} ({count})
              </button>
            );
          })}
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-slate-400 font-semibold">Cargando órdenes de trabajo...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-slate-400 font-semibold">No hay órdenes de trabajo{filtroEstado !== "all" ? " en este estado" : ""}.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((wo) => {
            const estadoInfo = ESTADOS.find((e) => e.id === wo.estado) || ESTADOS[0];
            return (
              <button
                key={wo.id}
                onClick={() => setSelectedOT(wo)}
                className="text-left bg-white border-2 border-slate-100 rounded-2xl p-4 hover:border-slate-300 hover:shadow-md transition-all"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className={`text-[10px] font-black uppercase px-2 py-1 rounded-full border ${estadoInfo.color}`}>
                    {estadoInfo.label}
                  </span>
                  {wo.prioridad && (
                    <span className={`text-[10px] font-black uppercase px-2 py-1 rounded-full ${PRIORIDADES[wo.prioridad] || ""}`}>
                      {wo.prioridad}
                    </span>
                  )}
                </div>
                <h3 className="font-black text-slate-900">{machineName(wo.machineId)}</h3>
                <p className="text-xs text-slate-500 mt-1 capitalize">Origen: {wo.origen?.replace("_", " ")}</p>
                {wo.diagnostico && <p className="text-xs text-slate-600 mt-2 line-clamp-2">{wo.diagnostico}</p>}
                <p className="text-[10px] text-slate-400 mt-3">
                  Abierta: {wo.fechaApertura ? new Date(wo.fechaApertura).toLocaleDateString("es-CL") : "-"}
                </p>
              </button>
            );
          })}
        </div>
      )}

      {selectedOT && (
        <WorkOrderDetalle
          workOrder={selectedOT}
          machine={machines.find((m) => m.id === selectedOT.machineId)}
          isMecanico={isMecanico}
          onClose={() => setSelectedOT(null)}
          onUpdated={() => { setSelectedOT(null); refresh(); }}
        />
      )}
    </div>
  );
}
