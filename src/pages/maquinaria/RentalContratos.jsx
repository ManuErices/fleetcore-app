import React, { useEffect, useState, useMemo } from "react";
import { useEmpresa } from "../../lib/useEmpresa";
import { useUserRole } from "../../lib/useUserRole";
import {
  listRentalContracts, upsertRentalContract, deleteRentalContract,
  listRentalClients, listMachines, syncMachineRentalStatus, ingresoMensualLinea,
} from "../../lib/db";

const CLP = (n) => "$" + Number(n || 0).toLocaleString("es-CL");

const ESTADOS = {
  borrador:   { label: "Borrador",   color: "bg-slate-100 text-slate-600 border-slate-200" },
  activo:     { label: "Activo",     color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  finalizado: { label: "Finalizado", color: "bg-blue-100 text-blue-700 border-blue-200" },
  cancelado:  { label: "Cancelado",  color: "bg-red-100 text-red-700 border-red-200" },
};

const TARIFA_LABEL = { mes: "/mes", dia: "/día", hora: "/hora" };

export default function RentalContratos() {
  const { empresaId } = useEmpresa();
  const { role } = useUserRole();
  const puedeEditar = ["superadmin", "admin_contrato", "administrativo", "jefe_taller"].includes(role);

  const [contracts, setContracts] = useState([]);
  const [clients, setClients] = useState([]);
  const [machines, setMachines] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filtroEstado, setFiltroEstado] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);

  useEffect(() => {
    if (!empresaId) return;
    refresh();
    (async () => {
      const [cl, mm] = await Promise.all([listRentalClients(empresaId), listMachines(empresaId)]);
      setClients(cl); setMachines(mm);
    })();
  }, [empresaId]);

  const refresh = async () => {
    setLoading(true);
    try { setContracts(await listRentalContracts(empresaId)); }
    finally { setLoading(false); }
  };

  const filtered = useMemo(() => {
    const list = filtroEstado === "all" ? contracts : contracts.filter((c) => c.estado === filtroEstado);
    return list.slice().sort((a, b) => new Date(b.fechaInicio || 0) - new Date(a.fechaInicio || 0));
  }, [contracts, filtroEstado]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black text-slate-900">Contratos de arriendo</h1>
        {puedeEditar && (
          <button onClick={() => { setEditing(null); setShowForm(true); }} className="px-4 py-2 rounded-xl bg-red-600 text-white font-bold text-sm">
            + Nuevo contrato
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <FiltroBtn active={filtroEstado === "all"} onClick={() => setFiltroEstado("all")} label={`Todos (${contracts.length})`} />
        {Object.entries(ESTADOS).map(([id, info]) => {
          const count = contracts.filter((c) => c.estado === id).length;
          if (!count) return null;
          return <FiltroBtn key={id} active={filtroEstado === id} onClick={() => setFiltroEstado(id)} label={`${info.label} (${count})`} />;
        })}
      </div>

      {loading ? (
        <div className="text-center py-12 text-slate-400 font-semibold">Cargando contratos...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-slate-400 font-semibold">No hay contratos{filtroEstado !== "all" ? " en este estado" : ""}.</div>
      ) : (
        <div className="space-y-3">
          {filtered.map((c) => {
            const est = ESTADOS[c.estado] || ESTADOS.borrador;
            const ingresoMes = (c.lineas || []).reduce((s, l) => s + ingresoMensualLinea(l), 0);
            return (
              <button key={c.id} onClick={() => { setEditing(c); setShowForm(true); }} className="w-full text-left bg-white border-2 border-slate-100 rounded-2xl p-4 hover:border-slate-300 transition-all">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full border ${est.color}`}>{est.label}</span>
                      {c.numero && <span className="text-xs font-bold text-slate-400">N° {c.numero}</span>}
                    </div>
                    <h3 className="font-black text-slate-900">{c.clienteNombre || "Sin cliente"}</h3>
                    <p className="text-xs text-slate-500 mt-1">
                      {(c.lineas || []).length} equipo{(c.lineas || []).length !== 1 ? "s" : ""}
                      {c.fechaInicio && ` · desde ${new Date(c.fechaInicio).toLocaleDateString("es-CL")}`}
                      {c.fechaFin && ` hasta ${new Date(c.fechaFin).toLocaleDateString("es-CL")}`}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-black text-slate-900">{CLP(ingresoMes)}</p>
                    <p className="text-[11px] text-slate-400">estimado/mes</p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {showForm && (
        <ContractForm
          empresaId={empresaId}
          contract={editing}
          clients={clients}
          machines={machines}
          puedeEditar={puedeEditar}
          onClose={() => setShowForm(false)}
          onSaved={async () => { setShowForm(false); await refresh(); }}
        />
      )}
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

function ContractForm({ empresaId, contract, clients, machines, puedeEditar, onClose, onSaved }) {
  const [numero, setNumero] = useState(contract?.numero || "");
  const [clienteId, setClienteId] = useState(contract?.clienteId || "");
  const [fechaInicio, setFechaInicio] = useState(contract?.fechaInicio || "");
  const [fechaFin, setFechaFin] = useState(contract?.fechaFin || "");
  const [estado, setEstado] = useState(contract?.estado || "borrador");
  const [condiciones, setCondiciones] = useState(contract?.condiciones || "");
  const [lineas, setLineas] = useState(contract?.lineas?.length ? contract.lineas.map((l) => ({ ...l })) : []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const addLinea = () => setLineas([...lineas, { machineId: "", code: "", descripcion: "", tarifaTipo: "mes", tarifaValor: "", cantidadEstimada: "" }]);
  const setLinea = (i, patch) => setLineas(lineas.map((l, idx) => idx === i ? { ...l, ...patch } : l));
  const removeLinea = (i) => setLineas(lineas.filter((_, idx) => idx !== i));

  const onSelectMachine = (i, machineId) => {
    const m = machines.find((x) => x.id === machineId);
    setLinea(i, {
      machineId,
      code: m?.code || "",
      descripcion: m ? (m.name || `${m.marca || ""} ${m.modelo || ""}`.trim()) : "",
    });
  };

  const ingresoTotal = lineas.reduce((s, l) => s + ingresoMensualLinea(l), 0);

  const guardar = async () => {
    setError("");
    if (!clienteId) return setError("Selecciona un cliente");
    const lineasValidas = lineas.filter((l) => l.machineId && l.tarifaValor);
    if (lineasValidas.length === 0) return setError("Agrega al menos un equipo con su tarifa");

    const cliente = clients.find((c) => c.id === clienteId);
    setSaving(true);
    try {
      const payload = {
        id: contract?.id,
        numero: numero.trim(),
        clienteId,
        clienteNombre: cliente?.nombre || "",
        lineas: lineasValidas.map((l) => ({
          machineId: l.machineId, code: l.code, descripcion: l.descripcion,
          tarifaTipo: l.tarifaTipo, tarifaValor: Number(l.tarifaValor),
          cantidadEstimada: l.cantidadEstimada === "" ? null : Number(l.cantidadEstimada),
        })),
        fechaInicio, fechaFin, estado, condiciones: condiciones.trim(),
      };
      const id = await upsertRentalContract(empresaId, payload);
      // Sincroniza disponibilidad de las máquinas del contrato
      await syncMachineRentalStatus(empresaId, { ...payload, id });
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const eliminar = async () => {
    if (!window.confirm("¿Eliminar este contrato?")) return;
    await deleteRentalContract(empresaId, contract.id);
    onSaved();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-black text-slate-900">{contract ? "Editar contrato" : "Nuevo contrato de arriendo"}</h3>
        {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm font-semibold rounded-xl p-3">{error}</div>}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase">Cliente</label>
            <select className="w-full border-2 border-slate-200 rounded-xl p-2.5 text-sm mt-1" value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
              <option value="">Selecciona...</option>
              {clients.filter((c) => c.activo !== false).map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase">N° contrato</label>
            <input className="w-full border-2 border-slate-200 rounded-xl p-2.5 text-sm mt-1" value={numero} onChange={(e) => setNumero(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase">Fecha inicio</label>
            <input type="date" className="w-full border-2 border-slate-200 rounded-xl p-2.5 text-sm mt-1" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase">Fecha fin</label>
            <input type="date" className="w-full border-2 border-slate-200 rounded-xl p-2.5 text-sm mt-1" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase">Estado</label>
            <select className="w-full border-2 border-slate-200 rounded-xl p-2.5 text-sm mt-1" value={estado} onChange={(e) => setEstado(e.target.value)}>
              {Object.entries(ESTADOS).map(([id, info]) => <option key={id} value={id}>{info.label}</option>)}
            </select>
          </div>
        </div>

        {/* Líneas de equipos */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-bold text-slate-500 uppercase">Equipos arrendados</label>
            <button onClick={addLinea} className="text-xs font-bold text-red-600 hover:text-red-700">+ Agregar equipo</button>
          </div>
          {lineas.length === 0 ? (
            <p className="text-sm text-slate-400">Sin equipos. Agrega al menos uno.</p>
          ) : (
            <div className="space-y-3">
              {lineas.map((l, i) => (
                <div key={i} className="border border-slate-200 rounded-xl p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <select className="flex-1 border-2 border-slate-200 rounded-lg p-2 text-sm" value={l.machineId} onChange={(e) => onSelectMachine(i, e.target.value)}>
                      <option value="">Selecciona equipo...</option>
                      {machines.map((m) => <option key={m.id} value={m.id}>{m.name || m.code}</option>)}
                    </select>
                    <button onClick={() => removeLinea(i)} className="text-slate-400 hover:text-red-600 text-lg px-1">&times;</button>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase">Tarifa</label>
                      <select className="w-full border-2 border-slate-200 rounded-lg p-2 text-sm" value={l.tarifaTipo} onChange={(e) => setLinea(i, { tarifaTipo: e.target.value })}>
                        <option value="mes">Por mes</option>
                        <option value="dia">Por día</option>
                        <option value="hora">Por hora</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase">Valor CLP</label>
                      <input type="number" className="w-full border-2 border-slate-200 rounded-lg p-2 text-sm" value={l.tarifaValor} onChange={(e) => setLinea(i, { tarifaValor: e.target.value })} />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase">
                        {l.tarifaTipo === "mes" ? "Meses" : l.tarifaTipo === "dia" ? "Días/mes" : "Horas/mes"}
                      </label>
                      <input type="number" className="w-full border-2 border-slate-200 rounded-lg p-2 text-sm" placeholder={l.tarifaTipo === "dia" ? "30" : l.tarifaTipo === "hora" ? "180" : "1"} value={l.cantidadEstimada} onChange={(e) => setLinea(i, { cantidadEstimada: e.target.value })} />
                    </div>
                  </div>
                  <p className="text-xs text-slate-500 text-right">
                    Estimado: <strong>{CLP(ingresoMensualLinea({ ...l, tarifaValor: Number(l.tarifaValor || 0) }))}/mes</strong>
                  </p>
                </div>
              ))}
              <div className="flex justify-between items-center pt-2 border-t border-slate-200">
                <span className="text-xs font-bold text-slate-500 uppercase">Ingreso estimado total</span>
                <span className="text-lg font-black text-slate-900">{CLP(ingresoTotal)}/mes</span>
              </div>
            </div>
          )}
        </div>

        <div>
          <label className="text-xs font-bold text-slate-500 uppercase">Condiciones / observaciones</label>
          <textarea className="w-full border-2 border-slate-200 rounded-xl p-2.5 text-sm mt-1" rows={2} value={condiciones} onChange={(e) => setCondiciones(e.target.value)} />
        </div>

        <div className="flex gap-3 pt-2">
          {contract && puedeEditar && (
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
