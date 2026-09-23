import React, { useEffect, useState, useMemo } from "react";
import { useEmpresa } from "../../lib/useEmpresa";
import { useUserRole } from "../../lib/useUserRole";
import { useMaquinariaFilter, filterMachinesByProject } from "../../components/maquinaria/MaquinariaFilterContext";
import { listMachines, listMaintenancePlans, listMaintenanceEvents } from "../../lib/db";
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
  const [plans, setPlans] = useState([]);
  const [events, setEvents] = useState([]);

  useEffect(() => {
    if (!empresaId) return;
    refresh();
  }, [empresaId]);

  const refresh = async () => {
    if (!empresaId) return;
    setLoading(true);
    try {
      // Planes y eventos se piden junto con las máquinas: la tarjeta necesita
      // saber cuánto falta para la próxima mantención, que es el dato por el
      // que uno entra a esta pantalla.
      const [frescas, p, e] = await Promise.all([
        listMachines(empresaId),
        listMaintenancePlans(empresaId).catch(() => []),
        listMaintenanceEvents(empresaId).catch(() => []),
      ]);
      setMachines(frescas);
      setPlans(p || []);
      setEvents(e || []);
      // `selected` es una copia del objeto que se tomó al abrir el modal. Sin
      // re-sincronizarla, guardar el medidor recargaba la lista de atrás pero
      // el modal seguía mostrando el valor viejo, y daba la impresión de que
      // el dato no se había guardado.
      setSelected((prev) => (prev ? frescas.find((m) => m.id === prev.id) || prev : prev));
    } finally {
      setLoading(false);
    }
  };

  const machineName = (m) => m.name || `${m.marca || ""} ${m.modelo || ""}`.trim() || m.code || m.id;

  /**
   * Estado de mantención más urgente de la máquina, con la misma resolución
   * de objetivo que usan la ficha, el dashboard y las alertas.
   */
  const mantencionDe = (m) => {
    const suyos = plans.filter((p) => p.machineId === m.id);
    if (!suyos.length) return { tipo: "sinplan" };
    if (m.medidorActual == null) return { tipo: "sinmedidor" };

    let peor = null;
    for (const plan of suyos) {
      const ev = events
        .filter((e) => e.planId === plan.id && e.proximaMantencionEn != null)
        .sort((a, b) => (b.medidorAlMomento || 0) - (a.medidorAlMomento || 0));
      const objetivo = ev.length ? ev[0].proximaMantencionEn
        : (plan.ultimaMantencionEn != null && plan.intervalo)
          ? Number(plan.ultimaMantencionEn) + Number(plan.intervalo)
        : (plan.proximaEnMedidor != null ? Number(plan.proximaEnMedidor) : null);
      if (objetivo == null) continue;
      const restante = objetivo - Number(m.medidorActual);
      const intervalo = Number(plan.intervalo || 0);
      const pct = intervalo > 0
        ? Math.max(0, Math.min(100, ((Number(m.medidorActual) - (objetivo - intervalo)) / intervalo) * 100))
        : 0;
      if (!peor || restante < peor.restante) {
        peor = { tipo: "ok", plan, restante, pct, tol: Number(plan.tolerancia || 0) };
      }
    }
    return peor || { tipo: "sinancla" };
  };

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

                {/* Próxima mantención, visible sin abrir el equipo. Es lo que
                    convierte la lectura del medidor en información útil. */}
                {(() => {
                  const mt = mantencionDe(m);
                  if (mt.tipo === "sinplan") {
                    return <p className="text-[11px] text-slate-400 mt-2">Sin plan de mantenimiento</p>;
                  }
                  if (mt.tipo === "sinmedidor") {
                    return <p className="text-[11px] text-amber-600 mt-2 font-semibold">Falta registrar el medidor</p>;
                  }
                  if (mt.tipo === "sinancla") {
                    return <p className="text-[11px] text-amber-600 mt-2 font-semibold">Plan sin próxima definida</p>;
                  }
                  const atrasada = mt.restante < -mt.tol;
                  const proxima  = mt.restante <= mt.tol;
                  const color = atrasada ? "bg-red-500" : proxima ? "bg-amber-500" : "bg-emerald-500";
                  const texto = atrasada
                    ? `Atrasada por ${Math.abs(mt.restante).toLocaleString("es-CL")} ${medidorLabel}`
                    : `Faltan ${mt.restante.toLocaleString("es-CL")} ${medidorLabel}`;
                  return (
                    <div className="mt-2">
                      <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                        <div className={`h-full ${color}`} style={{ width: `${mt.pct}%` }} />
                      </div>
                      <p className={`text-[11px] mt-1 font-semibold ${atrasada ? "text-red-600" : proxima ? "text-amber-600" : "text-slate-500"}`}>
                        {texto} · {mt.plan.nombre}
                      </p>
                    </div>
                  );
                })()}
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
