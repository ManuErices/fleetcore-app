import React, { useEffect, useState, useMemo } from "react";
import { useEmpresa } from "../../lib/useEmpresa";
import { useUserRole } from "../../lib/useUserRole";
import { useMaquinariaFilter } from "../../components/maquinaria/MaquinariaFilterContext";
import {
  listFailures, reportFailure, listMachines,
  createWorkOrderFromFailure, updateFailure,
} from "../../lib/db";

const SEVERIDADES = {
  baja:    { label: "Baja",    color: "bg-slate-100 text-slate-600 border-slate-200" },
  media:   { label: "Media",   color: "bg-blue-100 text-blue-600 border-blue-200" },
  alta:    { label: "Alta",    color: "bg-orange-100 text-orange-600 border-orange-200" },
  critica: { label: "Crítica", color: "bg-red-100 text-red-700 border-red-200" },
};

const ESTADOS_FALLA = {
  abierta:   { label: "Abierta",     color: "bg-amber-100 text-amber-700 border-amber-200" },
  en_ot:     { label: "En OT",       color: "bg-indigo-100 text-indigo-700 border-indigo-200" },
  resuelta:  { label: "Resuelta",    color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  cancelada: { label: "Cancelada",   color: "bg-slate-200 text-slate-500 border-slate-300" },
};

const SISTEMAS = ["Motor", "Hidráulico", "Eléctrico", "Frenos", "Transmisión", "Neumáticos", "Estructura", "Otro"];

export default function Fallas() {
  const { empresaId } = useEmpresa();
  const { role, uid } = useUserRole();
  const { projectId } = useMaquinariaFilter();
  const puedeGestionar = ["superadmin", "admin_contrato", "administrativo", "jefe_taller"].includes(role);

  const [failures, setFailures] = useState([]);
  const [machines, setMachines] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filtroEstado, setFiltroEstado] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(null); // id de falla en proceso

  useEffect(() => {
    if (!empresaId) return;
    refresh();
    (async () => setMachines(await listMachines(empresaId)))();
  }, [empresaId]);

  const refresh = async () => {
    if (!empresaId) return;
    setLoading(true);
    try {
      setFailures(await listFailures(empresaId));
    } finally {
      setLoading(false);
    }
  };

  const machineName = (id) => {
    const m = machines.find((x) => x.id === id);
    return m ? (m.name || `${m.marca || ""} ${m.modelo || ""}`.trim() || m.code) : id;
  };

  const filtered = useMemo(() => {
    let list = filtroEstado === "all" ? failures : failures.filter((f) => f.estado === filtroEstado);
    if (projectId) {
      const validIds = new Set(machines.filter((m) => m.projectId === projectId).map((m) => m.id));
      list = list.filter((f) => validIds.has(f.machineId));
    }
    return list.slice().sort((a, b) => new Date(b.fecha || 0) - new Date(a.fecha || 0));
  }, [failures, filtroEstado, projectId, machines]);

  const generarOT = async (failure) => {
    if (!window.confirm("¿Generar una orden de trabajo correctiva para esta falla?")) return;
    setBusy(failure.id);
    try {
      await createWorkOrderFromFailure(empresaId, failure);
      await refresh();
    } catch (e) {
      alert(e.message);
    } finally {
      setBusy(null);
    }
  };

  const marcarResuelta = async (failure) => {
    setBusy(failure.id);
    try {
      await updateFailure(empresaId, failure.id, { estado: "resuelta" });
      await refresh();
    } catch (e) {
      alert(e.message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black text-slate-900">Fallas</h1>
        <button
          onClick={() => setShowForm(true)}
          className="px-4 py-2 rounded-xl bg-red-600 text-white font-bold text-sm"
        >
          + Reportar falla
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        <FiltroBtn active={filtroEstado === "all"} onClick={() => setFiltroEstado("all")} label={`Todas (${failures.length})`} />
        {Object.entries(ESTADOS_FALLA).map(([id, info]) => {
          const count = failures.filter((f) => f.estado === id).length;
          if (!count) return null;
          return <FiltroBtn key={id} active={filtroEstado === id} onClick={() => setFiltroEstado(id)} label={`${info.label} (${count})`} />;
        })}
      </div>

      {loading ? (
        <div className="text-center py-12 text-slate-400 font-semibold">Cargando fallas...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-slate-400 font-semibold">No hay fallas registradas{filtroEstado !== "all" ? " en este estado" : ""}.</div>
      ) : (
        <div className="space-y-3">
          {filtered.map((f) => {
            const sev = SEVERIDADES[f.severidad] || SEVERIDADES.media;
            const est = ESTADOS_FALLA[f.estado] || ESTADOS_FALLA.abierta;
            return (
              <div key={f.id} className="bg-white border-2 border-slate-100 rounded-2xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full border ${est.color}`}>{est.label}</span>
                      <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full border ${sev.color}`}>{sev.label}</span>
                      {f.sistemaAfectado && <span className="text-[10px] font-bold uppercase text-slate-400">{f.sistemaAfectado}</span>}
                    </div>
                    <h3 className="font-black text-slate-900">{machineName(f.machineId)}</h3>
                    <p className="text-sm text-slate-700 mt-1">{f.descripcion}</p>
                    <p className="text-[11px] text-slate-400 mt-2">
                      {f.fecha ? new Date(f.fecha).toLocaleString("es-CL") : "—"}
                      {f.medidorAlMomento != null && ` · medidor: ${Number(f.medidorAlMomento).toLocaleString("es-CL")}`}
                    </p>
                  </div>
                  {puedeGestionar && f.estado === "abierta" && (
                    <div className="flex flex-col gap-2 shrink-0">
                      <button
                        onClick={() => generarOT(f)}
                        disabled={busy === f.id}
                        className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-bold disabled:opacity-50 whitespace-nowrap"
                      >
                        {busy === f.id ? "..." : "Generar OT"}
                      </button>
                      <button
                        onClick={() => marcarResuelta(f)}
                        disabled={busy === f.id}
                        className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-xs font-bold disabled:opacity-50 whitespace-nowrap"
                      >
                        Resuelta
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showForm && (
        <FailureForm
          empresaId={empresaId}
          uid={uid}
          machines={machines}
          onClose={() => setShowForm(false)}
          onSaved={async () => { setShowForm(false); await refresh(); }}
        />
      )}
    </div>
  );
}

function FiltroBtn({ active, onClick, label }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${active ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-slate-200"}`}
    >
      {label}
    </button>
  );
}

function FailureForm({ empresaId, uid, machines, onClose, onSaved }) {
  const [machineId, setMachineId] = useState("");
  const [sistemaAfectado, setSistemaAfectado] = useState("");
  const [severidad, setSeveridad] = useState("media");
  const [descripcion, setDescripcion] = useState("");
  const [medidor, setMedidor] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const guardar = async () => {
    setError("");
    if (!machineId) return setError("Selecciona un equipo");
    if (!descripcion.trim()) return setError("Describe la falla");
    setSaving(true);
    try {
      await reportFailure(empresaId, {
        machineId,
        sistemaAfectado: sistemaAfectado || "Otro",
        severidad,
        descripcion: descripcion.trim(),
        medidorAlMomento: medidor === "" ? null : Number(medidor),
        fecha: new Date().toISOString(),
        reportadoPor: uid,
        fotos: [],
      });
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
        <h3 className="text-lg font-black text-slate-900">Reportar falla</h3>
        {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm font-semibold rounded-xl p-3">{error}</div>}

        <div>
          <label className="text-xs font-bold text-slate-500 uppercase">Equipo</label>
          <select
            className="w-full border-2 border-slate-200 rounded-xl p-2.5 text-sm mt-1"
            value={machineId}
            onChange={(e) => setMachineId(e.target.value)}
          >
            <option value="">Selecciona un equipo...</option>
            {machines.map((m) => (
              <option key={m.id} value={m.id}>{m.name || m.code || m.id}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase">Sistema afectado</label>
            <select
              className="w-full border-2 border-slate-200 rounded-xl p-2.5 text-sm mt-1"
              value={sistemaAfectado}
              onChange={(e) => setSistemaAfectado(e.target.value)}
            >
              <option value="">Sin especificar</option>
              {SISTEMAS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase">Severidad</label>
            <select
              className="w-full border-2 border-slate-200 rounded-xl p-2.5 text-sm mt-1"
              value={severidad}
              onChange={(e) => setSeveridad(e.target.value)}
            >
              {Object.entries(SEVERIDADES).map(([id, info]) => <option key={id} value={id}>{info.label}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="text-xs font-bold text-slate-500 uppercase">Descripción</label>
          <textarea
            className="w-full border-2 border-slate-200 rounded-xl p-2.5 text-sm mt-1"
            rows={3}
            placeholder="Describe qué está fallando..."
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
          />
        </div>

        <div>
          <label className="text-xs font-bold text-slate-500 uppercase">Medidor al momento (opcional)</label>
          <input
            type="number"
            className="w-full border-2 border-slate-200 rounded-xl p-2.5 text-sm mt-1"
            value={medidor}
            onChange={(e) => setMedidor(e.target.value)}
          />
        </div>

        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border-2 border-slate-200 text-slate-600 font-bold text-sm">Cancelar</button>
          <button onClick={guardar} disabled={saving} className="flex-1 py-2.5 rounded-xl bg-red-600 text-white font-bold text-sm disabled:opacity-50">
            {saving ? "Guardando..." : "Reportar"}
          </button>
        </div>
      </div>
    </div>
  );
}
