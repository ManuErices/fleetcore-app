import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useEmpresa } from "../../lib/useEmpresa";
import { useMaquinariaFilter, filterMachinesByProject } from "../../components/maquinaria/MaquinariaFilterContext";
import {
  listMachines, listWorkOrders, listFailures,
  listSpareParts, listMaintenancePlans, listMaintenanceEvents,
  listRentalContracts, buildIngresoPorMaquina,
} from "../../lib/db";

const CLP = (n) => "$" + Number(n || 0).toLocaleString("es-CL");

export default function MaquinariaDashboard() {
  const { empresaId } = useEmpresa();
  const navigate = useNavigate();
  const { projectId } = useMaquinariaFilter();

  const [raw, setRaw] = useState({ machines: [], workOrders: [], failures: [], spareParts: [], plans: [], events: [], contracts: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!empresaId) return;
    (async () => {
      setLoading(true);
      try {
        const [machines, workOrders, failures, spareParts, plans, events, contracts] = await Promise.all([
          listMachines(empresaId),
          listWorkOrders(empresaId),
          listFailures(empresaId),
          listSpareParts(empresaId),
          listMaintenancePlans(empresaId),
          listMaintenanceEvents(empresaId),
          listRentalContracts(empresaId),
        ]);
        setRaw({ machines, workOrders, failures, spareParts, plans, events, contracts });
      } finally {
        setLoading(false);
      }
    })();
  }, [empresaId]);

  // Aplica el filtro global de proyecto. Los repuestos (stock) no dependen
  // de un proyecto, así que se muestran siempre completos.
  const machines = filterMachinesByProject(raw.machines, projectId);
  const validIds = new Set(machines.map((m) => m.id));
  const workOrders = projectId ? raw.workOrders.filter((o) => validIds.has(o.machineId)) : raw.workOrders;
  const failures = projectId ? raw.failures.filter((f) => validIds.has(f.machineId)) : raw.failures;
  const plans = projectId ? raw.plans.filter((p) => validIds.has(p.machineId)) : raw.plans;
  const events = projectId ? raw.events.filter((e) => validIds.has(e.machineId)) : raw.events;
  const spareParts = raw.spareParts;
  const contracts = projectId
    ? raw.contracts.filter((c) => (c.lineas || []).some((l) => validIds.has(l.machineId)))
    : raw.contracts;

  // ── KPIs de Rental (financiero) ──
  const ingresoPorMaquina = buildIngresoPorMaquina(contracts);
  const ingresoMensual = machines.reduce((s, m) => s + (ingresoPorMaquina[m.id]?.ingresoMensual || 0), 0);
  const leasingMensual = machines.reduce((s, m) => s + Number(m.leasingMensual || 0), 0);
  const margenMensual = ingresoMensual - leasingMensual;
  const arrendadas = machines.filter((m) => ingresoPorMaquina[m.id]).length;
  const utilizacion = machines.length ? Math.round((arrendadas / machines.length) * 100) : 0;
  const contratosActivos = contracts.filter((c) => c.estado === "activo").length;

  // ── KPIs máquinas ──
  const porEstado = (st) => machines.filter((m) => (m.status || "operativa") === st).length;
  const operativas = porEstado("operativa");
  const enMantencion = porEstado("en_mantencion");
  const fueraServicio = porEstado("fuera_de_servicio");

  // ── OT ──
  const otAbiertas = workOrders.filter((o) => !["cerrada", "cancelada"].includes(o.estado));
  const otPendientes = workOrders.filter((o) => o.estado === "pendiente").length;
  const otEnEjecucion = workOrders.filter((o) => ["en_diagnostico", "en_ejecucion", "asignada"].includes(o.estado)).length;
  const otEsperandoRepuesto = workOrders.filter((o) => o.estado === "esperando_repuesto").length;

  // ── Stock bajo ──
  const stockBajo = spareParts.filter((p) => p.activo !== false && (p.stock || 0) <= (p.stockMinimo || 0));

  // ── Mantenciones (próximas / atrasadas) usando planes + medidor de la máquina ──
  const machineById = (id) => machines.find((m) => m.id === id);
  const eventosPorPlan = (planId) =>
    events.filter((e) => e.planId === planId && e.proximaMantencionEn != null)
          .sort((a, b) => (b.medidorAlMomento || 0) - (a.medidorAlMomento || 0));

  const planStatus = plans.map((plan) => {
    const m = machineById(plan.machineId);
    if (!m || m.medidorActual == null) return { plan, m, estado: "sindata", restante: null };
    const ev = eventosPorPlan(plan.id);
    const objetivo = ev.length > 0 ? ev[0].proximaMantencionEn : Number(m.medidorActual) + Number(plan.intervalo || 0);
    const restante = objetivo - Number(m.medidorActual);
    const tol = Number(plan.tolerancia || 0);
    let estado = "ok";
    if (restante < -tol) estado = "atrasada";
    else if (restante <= tol) estado = "proxima";
    return { plan, m, estado, restante };
  });
  const atrasadas = planStatus.filter((p) => p.estado === "atrasada");
  const proximas = planStatus.filter((p) => p.estado === "proxima");

  // ── Fallas abiertas ──
  const fallasAbiertas = failures.filter((f) => f.estado === "abierta");

  const machineName = (id) => {
    const m = machineById(id);
    return m ? (m.name || `${m.marca || ""} ${m.modelo || ""}`.trim() || m.code) : id;
  };

  if (loading) {
    return <div className="text-center py-16 text-slate-400 font-semibold">Cargando dashboard...</div>;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-black text-slate-900">Dashboard</h1>

      {/* KPIs gerenciales de Rental (financiero) */}
      <div>
        <p className="text-xs font-black text-slate-400 uppercase mb-2">MPF Rental — resumen mensual</p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard label="Utilización de flota" value={`${utilizacion}%`} color="indigo" onClick={() => navigate("/maquinaria/rental")} />
          <KpiCard label="Ingreso estimado/mes" value={CLP(ingresoMensual)} color="emerald" onClick={() => navigate("/maquinaria/rental")} />
          <KpiCard label="Leasing/mes" value={CLP(leasingMensual)} color="amber" onClick={() => navigate("/maquinaria/rental")} />
          <KpiCard
            label="Margen/mes"
            value={CLP(margenMensual)}
            color={margenMensual >= 0 ? "emerald" : "red"}
            onClick={() => navigate("/maquinaria/rental")}
          />
        </div>
      </div>

      {/* KPIs operativos */}
      <div>
        <p className="text-xs font-black text-slate-400 uppercase mb-2">Operación y taller</p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard label="Equipos operativos" value={operativas} total={machines.length} color="emerald" onClick={() => navigate("/maquinaria/equipos")} />
          <KpiCard label="En mantención" value={enMantencion} color="amber" onClick={() => navigate("/maquinaria/equipos")} />
          <KpiCard label="Fuera de servicio" value={fueraServicio} color="red" onClick={() => navigate("/maquinaria/equipos")} />
          <KpiCard label="OT abiertas" value={otAbiertas.length} color="indigo" onClick={() => navigate("/maquinaria/ordenes-trabajo")} />
        </div>
      </div>

      {/* Segunda fila */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Órdenes de trabajo */}
        <Panel title="Órdenes de trabajo" onVerMas={() => navigate("/maquinaria/ordenes-trabajo")}>
          <StatRow label="Pendientes" value={otPendientes} />
          <StatRow label="En ejecución" value={otEnEjecucion} />
          <StatRow label="Esperando repuesto" value={otEsperandoRepuesto} highlight={otEsperandoRepuesto > 0} />
        </Panel>

        {/* Mantenciones */}
        <Panel title="Mantenciones" onVerMas={() => navigate("/maquinaria/equipos")}>
          <StatRow label="Atrasadas" value={atrasadas.length} highlight={atrasadas.length > 0} danger />
          <StatRow label="Próximas" value={proximas.length} highlight={proximas.length > 0} />
          <StatRow label="Planes activos" value={plans.length} />
        </Panel>

        {/* Fallas / stock */}
        <Panel title="Alertas" onVerMas={() => navigate("/maquinaria/fallas")}>
          <StatRow label="Fallas abiertas" value={fallasAbiertas.length} highlight={fallasAbiertas.length > 0} danger />
          <StatRow label="Repuestos bajo stock" value={stockBajo.length} highlight={stockBajo.length > 0} danger />
        </Panel>
      </div>

      {/* Listas de atención */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Mantenciones atrasadas */}
        <ListPanel title="Mantenciones atrasadas" empty="Sin mantenciones atrasadas 🎉" items={atrasadas}
          render={(p) => (
            <div key={p.plan.id} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
              <div>
                <p className="text-sm font-bold text-slate-900">{machineName(p.plan.machineId)}</p>
                <p className="text-xs text-slate-500">{p.plan.nombre}</p>
              </div>
              <span className="text-xs font-black text-red-600">{Math.abs(p.restante)} vencido</span>
            </div>
          )}
        />

        {/* Stock bajo */}
        <ListPanel title="Repuestos bajo stock mínimo" empty="Todo el stock en niveles óptimos" items={stockBajo}
          render={(p) => (
            <div key={p.id} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
              <div>
                <p className="text-sm font-bold text-slate-900">{p.descripcion}</p>
                <p className="text-xs text-slate-500">{p.codigo}</p>
              </div>
              <span className="text-xs font-black text-red-600">{p.stock || 0} / {p.stockMinimo || 0}</span>
            </div>
          )}
        />
      </div>

      {/* Últimas fallas */}
      <ListPanel
        title="Últimas fallas reportadas"
        empty="No hay fallas reportadas"
        items={failures.slice().sort((a, b) => new Date(b.fecha || 0) - new Date(a.fecha || 0)).slice(0, 5)}
        render={(f) => (
          <div key={f.id} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
            <div className="min-w-0">
              <p className="text-sm font-bold text-slate-900">{machineName(f.machineId)}</p>
              <p className="text-xs text-slate-500 truncate">{f.descripcion}</p>
            </div>
            <span className="text-[11px] text-slate-400 shrink-0 ml-3">{f.fecha ? new Date(f.fecha).toLocaleDateString("es-CL") : ""}</span>
          </div>
        )}
      />
    </div>
  );
}

function KpiCard({ label, value, total, color, onClick }) {
  const colors = {
    emerald: "from-emerald-500 to-emerald-600",
    amber: "from-amber-500 to-amber-600",
    red: "from-red-500 to-rose-600",
    indigo: "from-indigo-500 to-indigo-600",
  };
  return (
    <button onClick={onClick} className="text-left bg-white border-2 border-slate-100 rounded-2xl p-4 hover:border-slate-300 hover:shadow-md transition-all">
      <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${colors[color]} mb-3`} />
      <p className="text-3xl font-black text-slate-900">
        {value}{total != null && <span className="text-base font-bold text-slate-300">/{total}</span>}
      </p>
      <p className="text-xs font-semibold text-slate-500 mt-1">{label}</p>
    </button>
  );
}

function Panel({ title, children, onVerMas }) {
  return (
    <div className="bg-white border-2 border-slate-100 rounded-2xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-black text-slate-900">{title}</h3>
        {onVerMas && <button onClick={onVerMas} className="text-xs font-bold text-red-600 hover:text-red-700">Ver más</button>}
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function StatRow({ label, value, highlight, danger }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-sm text-slate-600">{label}</span>
      <span className={`text-lg font-black ${highlight ? (danger ? "text-red-600" : "text-amber-600") : "text-slate-900"}`}>{value}</span>
    </div>
  );
}

function ListPanel({ title, items, render, empty }) {
  return (
    <div className="bg-white border-2 border-slate-100 rounded-2xl p-4">
      <h3 className="text-sm font-black text-slate-900 mb-2">{title}</h3>
      {items.length === 0 ? (
        <p className="text-sm text-slate-400 py-3">{empty}</p>
      ) : (
        <div>{items.map(render)}</div>
      )}
    </div>
  );
}
