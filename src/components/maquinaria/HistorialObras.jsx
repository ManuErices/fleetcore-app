/**
 * Historial de obras de una máquina (campo `historialObras` del maestro).
 * Se llena solo cada vez que cambia la obra; aquí se ve y se pueden corregir
 * las fechas (por ejemplo, si el cambio se registró días después).
 */
import React, { useEffect, useState } from "react";
import { guardarMaquina, tramosObra } from "../../lib/maquinas";

const fmt = (f) => (f ? f.split("-").reverse().join("-") : "");

export default function HistorialObras({ empresaId, machine, projects = [], puedeEditar = false, onUpdated }) {
  const [tramos, setTramos] = useState(tramosObra(machine));
  const [editando, setEditando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { setTramos(tramosObra(machine)); }, [machine]);

  const nombre = (id) => {
    const p = projects.find(x => x.id === id);
    return p ? `${p.name}${p.codigo ? ` (${p.codigo})` : ""}` : (id || "Sin obra");
  };
  const set = (i, campo, valor) => setTramos(t => t.map((e, j) => (j === i ? { ...e, [campo]: valor || null } : e)));

  const guardar = async () => {
    setError("");
    const malos = tramos.find(e => e.desde && e.hasta && e.hasta < e.desde);
    if (malos) return setError(`En ${nombre(malos.projectId)} la fecha "hasta" es anterior a "desde".`);
    setGuardando(true);
    try {
      const abierto = tramos.filter(e => !e.hasta).pop();
      await guardarMaquina(empresaId, {
        historialObras: tramos,
        // La obra actual es la del tramo abierto
        ...(abierto ? { projectId: abierto.projectId } : {}),
      }, { id: machine.id, original: machine, origen: "maquinaria" });
      setEditando(false);
      onUpdated?.();
    } catch (e) { setError(e.message); }
    setGuardando(false);
  };

  if (!tramos.length) {
    return <p className="text-xs text-slate-400">Sin obras registradas todavía. Al asignar una obra, quedará aquí con su fecha.</p>;
  }

  return (
    <div className="space-y-2">
      <ul className="divide-y divide-slate-100 border border-slate-100 rounded-xl">
        {[...tramos].map((e, i) => (
          <li key={i} className="px-3 py-2 text-sm flex flex-wrap items-center gap-2 justify-between">
            <span className="font-semibold text-slate-700">{nombre(e.projectId)}</span>
            {editando ? (
              <span className="flex items-center gap-1 text-xs">
                <input type="date" className="border border-slate-200 rounded-lg px-2 py-1" value={e.desde || ""} onChange={ev => set(i, "desde", ev.target.value)} />
                <span>a</span>
                <input type="date" className="border border-slate-200 rounded-lg px-2 py-1" value={e.hasta || ""} onChange={ev => set(i, "hasta", ev.target.value)} />
              </span>
            ) : (
              <span className="text-xs text-slate-500">
                {e.desde ? `desde ${fmt(e.desde)}` : "desde antes del registro"} · {e.hasta ? `hasta ${fmt(e.hasta)}` : <b className="text-emerald-700">actual</b>}
              </span>
            )}
          </li>
        ))}
      </ul>
      {error && <p className="text-xs text-red-600">{error}</p>}
      {puedeEditar && (editando ? (
        <div className="flex gap-2">
          <button onClick={guardar} disabled={guardando} className="py-1.5 px-4 rounded-lg bg-slate-900 text-white text-xs font-bold disabled:opacity-50">{guardando ? "Guardando…" : "Guardar fechas"}</button>
          <button onClick={() => { setTramos(tramosObra(machine)); setEditando(false); setError(""); }} className="py-1.5 px-4 rounded-lg border border-slate-200 text-xs">Cancelar</button>
        </div>
      ) : (
        <button onClick={() => setEditando(true)} className="text-xs font-semibold text-slate-600 underline">Corregir fechas</button>
      ))}
    </div>
  );
}
