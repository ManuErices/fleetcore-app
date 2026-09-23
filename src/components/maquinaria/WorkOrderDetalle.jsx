import React, { useState, useEffect } from "react";
import { useEmpresa } from "../../lib/useEmpresa";
import { auth } from "../../lib/firebase";
import {
  upsertWorkOrder, listChecklistTemplates,
  uploadWorkOrderPhoto, deleteWorkOrderPhoto,
  upsertMaintenancePlan, listMaintenancePlans,
} from "../../lib/db";
import SparePartPicker from "./SparePartPicker";

const FUNCTIONS_URL = import.meta.env.VITE_FUNCTIONS_URL || 'https://southamerica-west1-mpf-maquinaria.cloudfunctions.net';

const ESTADOS_SIGUIENTES = {
  pendiente: "asignada",
  asignada: "en_diagnostico",
  en_diagnostico: "en_ejecucion",
  en_ejecucion: "terminada",
};

export default function WorkOrderDetalle({ workOrder, machine, isMecanico, onClose, onUpdated, onSaved }) {
  const { empresaId } = useEmpresa();
  const [estado, setEstado] = useState(workOrder.estado);
  const [diagnostico, setDiagnostico] = useState(workOrder.diagnostico || "");
  const [trabajoRealizado, setTrabajoRealizado] = useState(workOrder.trabajoRealizado || "");
  const [horasTrabajo, setHorasTrabajo] = useState(workOrder.horasTrabajo || "");
  // Lo ya guardado en la OT manda sobre el medidor de la máquina: si el
  // mecánico anotó 8435 y volvió a entrar, tiene que ver 8435.
  const [medidorFinal, setMedidorFinal] = useState(
    workOrder.medidorFinal ?? machine?.medidorActual ?? ""
  );
  const [observaciones, setObservaciones] = useState(workOrder.observaciones || "");
  const [repuestos, setRepuestos] = useState(workOrder.repuestosUsados || []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Checklist: items = [{ id, texto, hecho }]; se hidrata desde la OT o desde la plantilla del tipo
  const [checklist, setChecklist] = useState(workOrder.checklist || []);
  const [fotos, setFotos] = useState(workOrder.fotos || []); // [{ url, path, nombre }]
  const [subiendoFoto, setSubiendoFoto] = useState(false);
  const [guardadoOk, setGuardadoOk] = useState(null);

  const cerrada = estado === "cerrada" || estado === "cancelada";

  // Si la OT no tiene checklist aún, cargar la plantilla del tipo (origen) de la OT
  useEffect(() => {
    if (!empresaId || (workOrder.checklist && workOrder.checklist.length > 0)) return;
    (async () => {
      try {
        const templates = await listChecklistTemplates(empresaId);
        // `origen` es de dónde nació la OT; `tipo` es qué pauta le toca.
        // Una OT de plan nace "preventiva" y carga la pauta preventiva; una de
        // falla nace "falla" y carga la correctiva. Las manuales ("solicitud")
        // no tienen pauta propia: caen en correctiva, que es lo que son.
        const tipoOT = workOrder.origen === "preventiva" ? "preventiva"
          : workOrder.origen === "falla" ? "correctiva"
          : workOrder.origen === "solicitud" ? "correctiva"
          : workOrder.origen || "preventiva";
        const tpl = templates.find((t) => t.activo !== false && t.tipo === tipoOT);
        if (tpl) {
          setChecklist(tpl.items.map((it) => ({ id: it.id, texto: it.texto, hecho: false })));
        }
      } catch { /* silencioso */ }
    })();
  }, [empresaId]);

  const medidorLabel = machine?.medidorTipo === "kilometraje" ? "Kilometraje" : "Horómetro";

  const toggleItem = (id) => setChecklist(checklist.map((it) => it.id === id ? { ...it, hecho: !it.hecho } : it));

  const subirFoto = async (file) => {
    if (!file) return;
    setSubiendoFoto(true);
    setError("");
    try {
      const foto = await uploadWorkOrderPhoto(empresaId, workOrder.id, file);
      const nuevas = [...fotos, foto];
      setFotos(nuevas);
      // persistir de inmediato para no perder la foto si no se guarda el resto
      await upsertWorkOrder(empresaId, { id: workOrder.id, fotos: nuevas });
    } catch (e) {
      setError(e.message || "No se pudo subir la foto");
    } finally {
      setSubiendoFoto(false);
    }
  };

  const quitarFoto = async (foto) => {
    const nuevas = fotos.filter((f) => f.path !== foto.path);
    setFotos(nuevas);
    await deleteWorkOrderPhoto(foto.path);
    await upsertWorkOrder(empresaId, { id: workOrder.id, fotos: nuevas });
  };

  /**
   * Todo lo que el mecánico escribió en la OT.
   *
   * Antes `avanzarEstado` guardaba solo cuatro campos: el medidor final, las
   * observaciones y los repuestos se perdían en cada avance. Y como la lista
   * cerraba el modal al avanzar, el trabajo se iba sin aviso. Ahora se guarda
   * todo en cada paso, y el modal se queda abierto.
   */
  const camposEditables = () => ({
    diagnostico, trabajoRealizado, horasTrabajo, checklist,
    observaciones, repuestosUsados: repuestos,
    medidorFinal: medidorFinal === "" ? null : Number(medidorFinal),
  });

  const guardarAvance = async () => {
    setSaving(true);
    setError("");
    try {
      await upsertWorkOrder(empresaId, { id: workOrder.id, ...camposEditables() });
      setGuardadoOk(new Date().toISOString());
      onSaved?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const avanzarEstado = async () => {
    const siguiente = ESTADOS_SIGUIENTES[estado];
    if (!siguiente) return;
    setSaving(true);
    setError("");
    try {
      await upsertWorkOrder(empresaId, { id: workOrder.id, estado: siguiente, ...camposEditables() });
      setEstado(siguiente);
      setGuardadoOk(new Date().toISOString());
      // `onSaved` refresca la lista de atrás sin cerrar el modal: avanzar de
      // estado es parte del trabajo, no el final. Cerrarlo obligaba a volver a
      // buscar la OT para el paso siguiente.
      onSaved?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const cerrarOT = async () => {
    if (!medidorFinal) return setError(`Debes ingresar el ${medidorLabel.toLowerCase()} final`);
    if (machine?.medidorActual != null && Number(medidorFinal) < Number(machine.medidorActual)) {
      return setError(`El ${medidorLabel.toLowerCase()} no puede ser menor al actual (${machine.medidorActual})`);
    }
    if (!trabajoRealizado.trim()) return setError("Describe el trabajo realizado antes de cerrar");

    setSaving(true);
    setError("");
    try {
      // Persistir checklist antes del cierre (la Cloud Function no lo maneja)
      await upsertWorkOrder(empresaId, { id: workOrder.id, checklist });
      const res = await fetch(`${FUNCTIONS_URL}/closeWorkOrder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          empresaId,
          workOrderId: workOrder.id,
          callerUid: auth.currentUser?.uid,
          medidorFinal: Number(medidorFinal),
          trabajoRealizado,
          horasTrabajo: Number(horasTrabajo) || 0,
          repuestosUsados: repuestos,
          observaciones,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo cerrar la orden de trabajo');

      // ── Reflejar la mantención en el plan ──
      //
      // El cálculo real lo hace la Cloud Function: escribe el evento con su
      // `proximaMantencionEn`, y ese evento es el que manda en la resolución
      // del objetivo. Esto es un espejo para que el formulario del plan muestre
      // la última mantención verdadera en vez del valor que alguien tecleó
      // hace meses.
      //
      // Va después del cierre y en try propio: si la función falla, el plan no
      // debe avanzar; y si falla este espejo, la OT ya quedó cerrada y el
      // objetivo sigue correcto por la vía del evento.
      if (workOrder.origenRefId) {
        try {
          const planes = await listMaintenancePlans(empresaId, workOrder.machineId);
          const plan = planes.find((p) => p.id === workOrder.origenRefId);
          if (plan) {
            await upsertMaintenancePlan(empresaId, {
              id: plan.id,
              ultimaMantencionEn: Number(medidorFinal),
              // Se limpia el objetivo escrito a mano: a partir de acá manda la
              // cuenta última + intervalo, que es la que se mantiene sola.
              proximaEnMedidor: null,
              ultimaMantencionFecha: new Date().toISOString(),
              ultimaMantencionOT: workOrder.id,
            });
          }
        } catch (e) {
          console.warn('OT cerrada; el objetivo sigue bien por el evento, pero no se pudo reflejar en el plan:', e);
        }
      }

      onUpdated();
    } catch (e) {
      setError(e.message || "No se pudo cerrar la orden de trabajo");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-black text-slate-900">
            OT — {machine?.name || machine?.code || workOrder.machineId}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-2xl leading-none">&times;</button>
        </div>

        {workOrder.origenRefId && (
          <div className="bg-indigo-50 border border-indigo-200 rounded-xl px-3 py-2">
            <p className="text-xs font-bold text-indigo-900">
              Mantención preventiva · {workOrder.planNombre || "plan del equipo"}
            </p>
            <p className="text-[11px] text-indigo-700 mt-0.5">
              {workOrder.objetivoMedidor != null && `Programada a los ${Number(workOrder.objetivoMedidor).toLocaleString("es-CL")}. `}
              Al cerrarla, el plan avanza solo al siguiente intervalo.
            </p>
          </div>
        )}

        <div className="text-xs font-bold text-slate-500 uppercase">
          Estado actual: <span className="text-slate-900">{estado.replace("_", " ")}</span>
          {machine?.medidorActual != null && (
            <span className="ml-3">{medidorLabel} actual: <span className="text-slate-900">{machine.medidorActual}</span></span>
          )}
        </div>

        {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm font-semibold rounded-xl p-3">{error}</div>}

        <div className="space-y-3">
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase">Diagnóstico</label>
            <textarea
              className="w-full border-2 border-slate-200 rounded-xl p-3 text-sm mt-1"
              rows={2}
              value={diagnostico}
              onChange={(e) => setDiagnostico(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase">Trabajo realizado</label>
            <textarea
              className="w-full border-2 border-slate-200 rounded-xl p-3 text-sm mt-1"
              rows={3}
              value={trabajoRealizado}
              onChange={(e) => setTrabajoRealizado(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase">Horas de trabajo</label>
              <input
                type="number" step="0.5"
                className="w-full border-2 border-slate-200 rounded-xl p-3 text-sm mt-1"
                value={horasTrabajo}
                onChange={(e) => setHorasTrabajo(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase">{medidorLabel} final</label>
              <input
                type="number"
                className="w-full border-2 border-slate-200 rounded-xl p-3 text-sm mt-1"
                value={medidorFinal}
                onChange={(e) => setMedidorFinal(e.target.value)}
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase">Observaciones</label>
            <textarea
              className="w-full border-2 border-slate-200 rounded-xl p-3 text-sm mt-1"
              rows={2}
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
            />
          </div>
        </div>

        {/* Checklist de mantención (desde la plantilla del tipo de OT) */}
        {checklist.length > 0 && (
          <div className="bg-slate-50 rounded-xl p-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-bold text-slate-500 uppercase">Checklist de mantención</p>
              <span className="text-xs font-bold text-slate-400">
                {checklist.filter((i) => i.hecho).length}/{checklist.length}
              </span>
            </div>
            <div className="space-y-1">
              {checklist.map((it) => (
                <label key={it.id} className={`flex items-center gap-2 text-sm py-1 ${cerrada ? "" : "cursor-pointer"}`}>
                  <input
                    type="checkbox"
                    checked={!!it.hecho}
                    onChange={() => !cerrada && toggleItem(it.id)}
                    disabled={cerrada}
                    className="w-4 h-4 rounded accent-emerald-600"
                  />
                  <span className={it.hecho ? "line-through text-slate-400" : "text-slate-700"}>{it.texto}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Fotos de respaldo */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-bold text-slate-500 uppercase">Fotos de respaldo</label>
            {!cerrada && (
              <label className="text-xs font-bold text-red-600 hover:text-red-700 cursor-pointer">
                {subiendoFoto ? "Subiendo..." : "+ Agregar foto"}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={subiendoFoto}
                  onChange={(e) => { subirFoto(e.target.files?.[0]); e.target.value = ""; }}
                />
              </label>
            )}
          </div>
          {fotos.length === 0 ? (
            <p className="text-xs text-slate-400">Sin fotos aún.</p>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {fotos.map((f) => (
                <div key={f.path} className="relative group">
                  <a href={f.url} target="_blank" rel="noopener noreferrer">
                    <img src={f.url} alt={f.nombre} className="w-full h-20 object-cover rounded-lg border border-slate-200" />
                  </a>
                  {!cerrada && (
                    <button
                      onClick={() => quitarFoto(f)}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-600 text-white text-xs font-bold opacity-0 group-hover:opacity-100 transition"
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Selector de repuestos: editable mientras la OT no esté cerrada.
            Al cerrar, la Cloud Function closeWorkOrder descuenta estos del stock. */}
        <SparePartPicker
          value={repuestos}
          onChange={setRepuestos}
          disabled={cerrada}
        />

        {guardadoOk && (
          <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
            <span className="text-emerald-600 font-black">✓</span>
            <p className="text-xs text-emerald-800 font-semibold">
              Avance guardado · {new Date(guardadoOk).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}
            </p>
          </div>
        )}

        <div className="flex gap-3 pt-2 border-t border-slate-100">
          {!cerrada && (
            <button
              onClick={guardarAvance}
              disabled={saving}
              className="px-4 py-3 rounded-xl border-2 border-slate-200 text-slate-600 font-bold text-sm disabled:opacity-50 whitespace-nowrap"
              title="Guarda lo escrito sin cambiar el estado de la OT"
            >
              Guardar
            </button>
          )}
          {estado !== "cerrada" && estado !== "cancelada" && ESTADOS_SIGUIENTES[estado] && (
            <button
              onClick={avanzarEstado}
              disabled={saving}
              className="flex-1 py-3 rounded-xl bg-slate-900 text-white font-bold text-sm disabled:opacity-50"
            >
              Avanzar a "{ESTADOS_SIGUIENTES[estado].replace("_", " ")}"
            </button>
          )}
          {estado === "terminada" && !isMecanico && (
            <button
              onClick={cerrarOT}
              disabled={saving}
              className="flex-1 py-3 rounded-xl bg-emerald-600 text-white font-bold text-sm disabled:opacity-50"
            >
              {saving ? "Cerrando..." : "Cerrar orden de trabajo"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
