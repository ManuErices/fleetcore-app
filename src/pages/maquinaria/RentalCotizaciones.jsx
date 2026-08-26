import React, { useEffect, useState, useMemo } from "react";
import { useEmpresa } from "../../lib/useEmpresa";
import { useUserRole } from "../../lib/useUserRole";
import {
  listRentalQuotes, upsertRentalQuote, deleteRentalQuote, convertQuoteToContract,
  listRentalClients, listMachines, ingresoMensualLinea,
} from "../../lib/db";

const CLP = (n) => "$" + Number(n || 0).toLocaleString("es-CL");

const ESTADOS = {
  borrador:  { label: "Borrador",  color: "bg-slate-100 text-slate-600 border-slate-200" },
  enviada:   { label: "Enviada",   color: "bg-blue-100 text-blue-700 border-blue-200" },
  aceptada:  { label: "Aceptada",  color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  rechazada: { label: "Rechazada", color: "bg-red-100 text-red-700 border-red-200" },
};

export default function RentalCotizaciones() {
  const { empresaId } = useEmpresa();
  const { role } = useUserRole();
  const puedeEditar = ["superadmin", "admin_contrato", "administrativo", "jefe_taller"].includes(role);

  const [quotes, setQuotes] = useState([]);
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
    try { setQuotes(await listRentalQuotes(empresaId)); }
    finally { setLoading(false); }
  };

  const filtered = useMemo(() => {
    const list = filtroEstado === "all" ? quotes : quotes.filter((q) => q.estado === filtroEstado);
    return list.slice().sort((a, b) => new Date(b.fecha || 0) - new Date(a.fecha || 0));
  }, [quotes, filtroEstado]);

  const convertir = async (quote) => {
    if (!window.confirm(`¿Convertir la cotización de ${quote.clienteNombre} en un contrato activo?`)) return;
    try {
      await convertQuoteToContract(empresaId, quote, {});
      await refresh();
      alert("Contrato creado. Revísalo en Contratos para ajustar fechas.");
    } catch (e) {
      alert(e.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black text-slate-900">Cotizaciones</h1>
        {puedeEditar && (
          <button onClick={() => { setEditing(null); setShowForm(true); }} className="px-4 py-2 rounded-xl bg-red-600 text-white font-bold text-sm">
            + Nueva cotización
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <FiltroBtn active={filtroEstado === "all"} onClick={() => setFiltroEstado("all")} label={`Todas (${quotes.length})`} />
        {Object.entries(ESTADOS).map(([id, info]) => {
          const count = quotes.filter((q) => q.estado === id).length;
          if (!count) return null;
          return <FiltroBtn key={id} active={filtroEstado === id} onClick={() => setFiltroEstado(id)} label={`${info.label} (${count})`} />;
        })}
      </div>

      {loading ? (
        <div className="text-center py-12 text-slate-400 font-semibold">Cargando cotizaciones...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-slate-400 font-semibold">No hay cotizaciones{filtroEstado !== "all" ? " en este estado" : ""}.</div>
      ) : (
        <div className="space-y-3">
          {filtered.map((q) => {
            const est = ESTADOS[q.estado] || ESTADOS.borrador;
            const total = (q.lineas || []).reduce((s, l) => s + ingresoMensualLinea(l), 0);
            return (
              <div key={q.id} className="bg-white border-2 border-slate-100 rounded-2xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <button className="text-left min-w-0 flex-1" onClick={() => { setEditing(q); setShowForm(true); }}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full border ${est.color}`}>{est.label}</span>
                      {q.numero && <span className="text-xs font-bold text-slate-400">N° {q.numero}</span>}
                      {q.contratoGeneradoId && <span className="text-[10px] font-bold text-emerald-600">→ contrato creado</span>}
                    </div>
                    <h3 className="font-black text-slate-900">{q.clienteNombre || "Sin cliente"}</h3>
                    <p className="text-xs text-slate-500 mt-1">
                      {(q.lineas || []).length} equipo{(q.lineas || []).length !== 1 ? "s" : ""}
                      {q.fecha && ` · ${new Date(q.fecha).toLocaleDateString("es-CL")}`}
                      {` · validez ${q.validezDias || 15} días`}
                    </p>
                  </button>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-black text-slate-900">{CLP(total)}</p>
                    <p className="text-[11px] text-slate-400">estimado/mes</p>
                    {puedeEditar && q.estado !== "aceptada" && !q.contratoGeneradoId && (
                      <button onClick={() => convertir(q)} className="mt-2 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold whitespace-nowrap">
                        Convertir a contrato
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showForm && (
        <QuoteForm
          empresaId={empresaId}
          quote={editing}
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

function QuoteForm({ empresaId, quote, clients, machines, puedeEditar, onClose, onSaved }) {
  const [numero, setNumero] = useState(quote?.numero || "");
  const [clienteId, setClienteId] = useState(quote?.clienteId || "");
  const [validezDias, setValidezDias] = useState(quote?.validezDias || 15);
  const [estado, setEstado] = useState(quote?.estado || "borrador");
  const [condiciones, setCondiciones] = useState(quote?.condiciones || "");
  const [lineas, setLineas] = useState(quote?.lineas?.length ? quote.lineas.map((l) => ({ ...l })) : []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const addLinea = () => setLineas([...lineas, { machineId: "", code: "", descripcion: "", tarifaTipo: "mes", tarifaValor: "", cantidadEstimada: "" }]);
  const setLinea = (i, patch) => setLineas(lineas.map((l, idx) => idx === i ? { ...l, ...patch } : l));
  const removeLinea = (i) => setLineas(lineas.filter((_, idx) => idx !== i));
  const onSelectMachine = (i, machineId) => {
    const m = machines.find((x) => x.id === machineId);
    setLinea(i, { machineId, code: m?.code || "", descripcion: m ? (m.name || `${m.marca || ""} ${m.modelo || ""}`.trim()) : "" });
  };

  const total = lineas.reduce((s, l) => s + ingresoMensualLinea(l), 0);

  const guardar = async () => {
    setError("");
    if (!clienteId) return setError("Selecciona un cliente");
    const validas = lineas.filter((l) => l.machineId && l.tarifaValor);
    if (validas.length === 0) return setError("Agrega al menos un equipo con su tarifa");
    const cliente = clients.find((c) => c.id === clienteId);
    setSaving(true);
    try {
      await upsertRentalQuote(empresaId, {
        id: quote?.id, numero: numero.trim(), clienteId, clienteNombre: cliente?.nombre || "",
        lineas: validas.map((l) => ({
          machineId: l.machineId, code: l.code, descripcion: l.descripcion,
          tarifaTipo: l.tarifaTipo, tarifaValor: Number(l.tarifaValor),
          cantidadEstimada: l.cantidadEstimada === "" ? null : Number(l.cantidadEstimada),
        })),
        validezDias: Number(validezDias) || 15, estado, condiciones: condiciones.trim(),
        contratoGeneradoId: quote?.contratoGeneradoId || null,
        fecha: quote?.fecha || new Date().toISOString(),
      });
      onSaved();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  const eliminar = async () => {
    if (!window.confirm("¿Eliminar esta cotización?")) return;
    await deleteRentalQuote(empresaId, quote.id);
    onSaved();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-black text-slate-900">{quote ? "Editar cotización" : "Nueva cotización"}</h3>
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
            <label className="text-xs font-bold text-slate-500 uppercase">N° cotización</label>
            <input className="w-full border-2 border-slate-200 rounded-xl p-2.5 text-sm mt-1" value={numero} onChange={(e) => setNumero(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase">Validez (días)</label>
            <input type="number" className="w-full border-2 border-slate-200 rounded-xl p-2.5 text-sm mt-1" value={validezDias} onChange={(e) => setValidezDias(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase">Estado</label>
            <select className="w-full border-2 border-slate-200 rounded-xl p-2.5 text-sm mt-1" value={estado} onChange={(e) => setEstado(e.target.value)}>
              {Object.entries(ESTADOS).map(([id, info]) => <option key={id} value={id}>{info.label}</option>)}
            </select>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-bold text-slate-500 uppercase">Equipos cotizados</label>
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
                <span className="text-xs font-bold text-slate-500 uppercase">Total estimado</span>
                <span className="text-lg font-black text-slate-900">{CLP(total)}/mes</span>
              </div>
            </div>
          )}
        </div>

        <div>
          <label className="text-xs font-bold text-slate-500 uppercase">Condiciones / observaciones</label>
          <textarea className="w-full border-2 border-slate-200 rounded-xl p-2.5 text-sm mt-1" rows={2} value={condiciones} onChange={(e) => setCondiciones(e.target.value)} />
        </div>

        <div className="flex gap-3 pt-2">
          {quote && puedeEditar && (
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
