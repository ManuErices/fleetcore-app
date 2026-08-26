import React, { useEffect, useState, useMemo } from "react";
import { useEmpresa } from "../../lib/useEmpresa";
import { useMaquinariaFilter, filterMachinesByProject } from "../../components/maquinaria/MaquinariaFilterContext";
import {
  listMachines, listRentalContracts, listRentalPayments,
  listMaintenanceEvents, computeRentabilidad,
} from "../../lib/db";

const CLP = (n) => "$" + Number(Math.round(n) || 0).toLocaleString("es-CL");

function mesActual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function RentalRentabilidad() {
  const { empresaId } = useEmpresa();
  const { projectId } = useMaquinariaFilter();

  const [raw, setRaw] = useState({ machines: [], contracts: [], payments: [], events: [] });
  const [loading, setLoading] = useState(true);

  // Período: 'mes' (un mes), 'anio' (un año), 'total'
  const [modo, setModo] = useState("mes");
  const [mes, setMes] = useState(mesActual());
  const [anio, setAnio] = useState(String(new Date().getFullYear()));

  useEffect(() => {
    if (!empresaId) return;
    (async () => {
      setLoading(true);
      try {
        const [machines, contracts, payments, events] = await Promise.all([
          listMachines(empresaId),
          listRentalContracts(empresaId),
          listRentalPayments(empresaId),
          listMaintenanceEvents(empresaId),
        ]);
        setRaw({ machines, contracts, payments, events });
      } finally {
        setLoading(false);
      }
    })();
  }, [empresaId]);

  const { desde, hasta } = useMemo(() => {
    if (modo === "mes") return { desde: mes, hasta: mes };
    if (modo === "anio") return { desde: `${anio}-01`, hasta: `${anio}-12` };
    return { desde: null, hasta: null }; // total
  }, [modo, mes, anio]);

  const filas = useMemo(() => {
    const machines = filterMachinesByProject(raw.machines, projectId);
    const validIds = new Set(machines.map((m) => m.id));
    const contracts = projectId
      ? raw.contracts.filter((c) => (c.lineas || []).some((l) => validIds.has(l.machineId)))
      : raw.contracts;
    const payments = projectId ? raw.payments.filter((p) => {
      const c = raw.contracts.find((x) => x.id === p.contratoId);
      return c && (c.lineas || []).some((l) => validIds.has(l.machineId));
    }) : raw.payments;
    const events = projectId ? raw.events.filter((e) => validIds.has(e.machineId)) : raw.events;

    return computeRentabilidad(machines, contracts, payments, events, { desde, hasta });
  }, [raw, projectId, desde, hasta]);

  const totales = useMemo(() => ({
    ingreso: filas.reduce((s, f) => s + f.ingreso, 0),
    leasing: filas.reduce((s, f) => s + f.leasing, 0),
    mantencion: filas.reduce((s, f) => s + f.mantencion, 0),
    margen: filas.reduce((s, f) => s + f.margen, 0),
  }), [filas]);

  if (loading) return <div className="text-center py-16 text-slate-400 font-semibold">Calculando rentabilidad...</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Rentabilidad por máquina</h1>
          <p className="text-sm text-slate-500">Ingreso emitido − leasing − mantenciones</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={modo} onChange={(e) => setModo(e.target.value)} className="border-2 border-slate-200 rounded-xl px-3 py-2 text-sm font-semibold">
            <option value="mes">Por mes</option>
            <option value="anio">Por año</option>
            <option value="total">Total acumulado</option>
          </select>
          {modo === "mes" && (
            <input type="month" value={mes} onChange={(e) => setMes(e.target.value)} className="border-2 border-slate-200 rounded-xl px-3 py-2 text-sm" />
          )}
          {modo === "anio" && (
            <input type="number" value={anio} onChange={(e) => setAnio(e.target.value)} className="border-2 border-slate-200 rounded-xl px-3 py-2 text-sm w-24" />
          )}
        </div>
      </div>

      {/* KPIs del período */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi label="Ingreso emitido" value={CLP(totales.ingreso)} color="emerald" />
        <Kpi label="Leasing" value={CLP(totales.leasing)} color="amber" />
        <Kpi label="Mantenciones" value={CLP(totales.mantencion)} color="indigo" />
        <Kpi label="Margen total" value={CLP(totales.margen)} color={totales.margen >= 0 ? "emerald" : "red"} />
      </div>

      {/* Tabla por máquina */}
      <div className="overflow-x-auto bg-white border-2 border-slate-100 rounded-2xl">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs font-black text-slate-400 uppercase border-b border-slate-100">
              <th className="px-4 py-3">Equipo</th>
              <th className="px-4 py-3 text-right">Ingreso</th>
              <th className="px-4 py-3 text-right">Leasing</th>
              <th className="px-4 py-3 text-right">Mantención</th>
              <th className="px-4 py-3 text-right">Margen</th>
              <th className="px-4 py-3 text-center">Veredicto</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => {
              const gana = f.margen > 0;
              const neutro = f.ingreso === 0 && f.leasing === 0 && f.mantencion === 0;
              return (
                <tr key={f.machineId} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <p className="font-bold text-slate-900">{f.nombre}</p>
                    <p className="text-xs text-slate-400">{f.code}</p>
                  </td>
                  <td className="px-4 py-3 text-right text-slate-900">{f.ingreso ? CLP(f.ingreso) : "—"}</td>
                  <td className="px-4 py-3 text-right text-slate-600">{f.leasing ? CLP(f.leasing) : "—"}</td>
                  <td className="px-4 py-3 text-right text-slate-600">{f.mantencion ? CLP(f.mantencion) : "—"}</td>
                  <td className={`px-4 py-3 text-right font-black ${gana ? "text-emerald-600" : f.margen < 0 ? "text-red-600" : "text-slate-400"}`}>
                    {neutro ? "—" : CLP(f.margen)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {neutro ? (
                      <span className="text-xs text-slate-400">sin datos</span>
                    ) : gana ? (
                      <span className="text-[10px] font-black uppercase px-2 py-1 rounded-full bg-emerald-100 text-emerald-700">Rentable</span>
                    ) : (
                      <span className="text-[10px] font-black uppercase px-2 py-1 rounded-full bg-red-100 text-red-700">En pérdida</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-400">
        El ingreso cuenta todos los cobros emitidos del período (incluye pendientes) y se reparte entre las máquinas de cada contrato
        según su tarifa. "Mantención" es el costo total de las órdenes de trabajo cerradas (mano de obra + repuestos).
        {modo === "total" && " En modo total, el leasing se imputa como 1 mes de referencia."}
      </p>
    </div>
  );
}

function Kpi({ label, value, color }) {
  const c = {
    emerald: "from-emerald-500 to-emerald-600", amber: "from-amber-500 to-amber-600",
    indigo: "from-indigo-500 to-indigo-600", red: "from-red-500 to-rose-600",
  };
  return (
    <div className="bg-white border-2 border-slate-100 rounded-2xl p-4">
      <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${c[color]} mb-2`} />
      <p className="text-xl font-black text-slate-900">{value}</p>
      <p className="text-xs font-semibold text-slate-500 mt-0.5">{label}</p>
    </div>
  );
}
