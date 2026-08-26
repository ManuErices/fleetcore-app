import React, { useEffect, useState, useMemo } from "react";
import { useEmpresa } from "../../lib/useEmpresa";
import { listMachines, listRentalContracts, buildIngresoPorMaquina } from "../../lib/db";

const CLP = (n) => "$" + Number(n || 0).toLocaleString("es-CL");

export default function RentalTablero() {
  const { empresaId } = useEmpresa();
  const [machines, setMachines] = useState([]);
  const [contracts, setContracts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!empresaId) return;
    (async () => {
      setLoading(true);
      try {
        const [m, c] = await Promise.all([listMachines(empresaId), listRentalContracts(empresaId)]);
        setMachines(m);
        setContracts(c);
      } finally {
        setLoading(false);
      }
    })();
  }, [empresaId]);

  const ingresoPorMaquina = useMemo(() => buildIngresoPorMaquina(contracts), [contracts]);

  const filas = useMemo(() => {
    return machines
      .filter((m) => m.disponibilidad !== "dada_de_baja" && m.status !== "dada_de_baja")
      .map((m) => {
        const leasing = Number(m.leasingMensual || 0);
        const info = ingresoPorMaquina[m.id];
        const ingreso = info ? info.ingresoMensual : 0;
        const arrendada = !!info;
        const margen = ingreso - leasing;
        return {
          m, leasing, ingreso, margen, arrendada,
          clienteNombre: info?.clienteNombre || "",
          nombre: m.name || `${m.marca || ""} ${m.modelo || ""}`.trim() || m.code || m.id,
        };
      })
      .sort((a, b) => a.margen - b.margen); // peores primero (los que queman leasing arriba)
  }, [machines, ingresoPorMaquina]);

  const totales = useMemo(() => {
    const leasingTotal = filas.reduce((s, f) => s + f.leasing, 0);
    const ingresoTotal = filas.reduce((s, f) => s + f.ingreso, 0);
    const arrendadas = filas.filter((f) => f.arrendada).length;
    const conLeasing = filas.filter((f) => f.leasing > 0).length;
    const utilizacion = filas.length ? Math.round((arrendadas / filas.length) * 100) : 0;
    return { leasingTotal, ingresoTotal, margenTotal: ingresoTotal - leasingTotal, arrendadas, total: filas.length, utilizacion, conLeasing };
  }, [filas]);

  if (loading) return <div className="text-center py-16 text-slate-400 font-semibold">Cargando tablero...</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900">Tablero Rental</h1>
        <p className="text-sm text-slate-500">Leasing vs. ingreso por arriendo — estimación mensual</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Utilización de flota" value={`${totales.utilizacion}%`} sub={`${totales.arrendadas}/${totales.total} arrendadas`} color="indigo" />
        <KpiCard label="Ingreso mensual estimado" value={CLP(totales.ingresoTotal)} color="emerald" />
        <KpiCard label="Costo leasing mensual" value={CLP(totales.leasingTotal)} color="amber" />
        <KpiCard
          label="Margen mensual"
          value={CLP(totales.margenTotal)}
          color={totales.margenTotal >= 0 ? "emerald" : "red"}
          sub={totales.margenTotal >= 0 ? "La flota cubre su leasing" : "La flota NO cubre su leasing"}
        />
      </div>

      {/* Tabla máquina por máquina */}
      <div className="overflow-x-auto bg-white border-2 border-slate-100 rounded-2xl">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs font-black text-slate-400 uppercase border-b border-slate-100">
              <th className="px-4 py-3">Equipo</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3">Cliente</th>
              <th className="px-4 py-3 text-right">Ingreso/mes</th>
              <th className="px-4 py-3 text-right">Leasing/mes</th>
              <th className="px-4 py-3 text-right">Margen</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.m.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                <td className="px-4 py-3">
                  <p className="font-bold text-slate-900">{f.nombre}</p>
                  <p className="text-xs text-slate-400">{f.m.code}</p>
                </td>
                <td className="px-4 py-3">
                  <span className={`text-[10px] font-black uppercase px-2 py-1 rounded-full border ${f.arrendada ? "bg-emerald-100 text-emerald-700 border-emerald-200" : "bg-slate-100 text-slate-500 border-slate-200"}`}>
                    {f.arrendada ? "Arrendada" : "Disponible"}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-600">{f.clienteNombre || "—"}</td>
                <td className="px-4 py-3 text-right text-slate-900 font-semibold">{f.ingreso ? CLP(f.ingreso) : "—"}</td>
                <td className="px-4 py-3 text-right text-slate-600">{f.leasing ? CLP(f.leasing) : "—"}</td>
                <td className={`px-4 py-3 text-right font-black ${f.margen > 0 ? "text-emerald-600" : f.margen < 0 ? "text-red-600" : "text-slate-400"}`}>
                  {f.leasing || f.ingreso ? CLP(f.margen) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-400">
        El ingreso mensual estimado normaliza tarifas diarias (×30) y por hora (×180 h/mes) a un valor mensual comparable con el leasing.
        Las máquinas sin leasing ni contrato aparecen con margen "—".
      </p>
    </div>
  );
}

function KpiCard({ label, value, sub, color }) {
  const colors = {
    emerald: "from-emerald-500 to-emerald-600",
    amber: "from-amber-500 to-amber-600",
    red: "from-red-500 to-rose-600",
    indigo: "from-indigo-500 to-indigo-600",
  };
  return (
    <div className="bg-white border-2 border-slate-100 rounded-2xl p-4">
      <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${colors[color]} mb-3`} />
      <p className="text-2xl font-black text-slate-900">{value}</p>
      <p className="text-xs font-semibold text-slate-500 mt-1">{label}</p>
      {sub && <p className="text-[11px] text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}
