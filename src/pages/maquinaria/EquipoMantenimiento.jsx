import React, { useEffect, useState } from "react";
import { useEmpresa } from "../../lib/useEmpresa";
import {
  listMaintenancePlans, upsertMaintenancePlan, deleteMaintenancePlan,
  listMaintenanceEvents, upsertMachine,
  listAllProjects,
  listMachineDocuments, uploadMachineDocument, deleteMachineDocument,
} from "../../lib/db";

const CLP = (n) => "$" + Number(n || 0).toLocaleString("es-CL");

const TABS = [
  { id: "info", label: "Información" },
  { id: "mantenimiento", label: "Mantenimiento" },
  { id: "documentos", label: "Documentos" },
  { id: "historial", label: "Historial" },
];

const TIPOS_DOC = [
  { id: "leasing", label: "Contrato leasing" },
  { id: "permiso_circulacion", label: "Permiso de circulación" },
  { id: "soap", label: "SOAP" },
  { id: "seguro_complementario", label: "Seguro complementario" },
  { id: "anotaciones_vigentes", label: "Certificado anotaciones vigentes" },
  { id: "revision_tecnica", label: "Revisión técnica" },
  { id: "padron", label: "Padrón" },
  { id: "otro", label: "Otro" },
];

const DISPONIBILIDAD = [
  { id: "disponible", label: "Disponible" },
  { id: "arrendado", label: "Arrendado" },
  { id: "no_disponible", label: "No disponible" },
];

function estadoVencimiento(fechaVenc) {
  if (!fechaVenc) return { label: "Sin vencimiento", color: "text-slate-400" };
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const venc = new Date(fechaVenc);
  const dias = Math.ceil((venc - hoy) / (1000 * 60 * 60 * 24));
  if (dias < 0) return { label: `Vencido hace ${Math.abs(dias)} d`, color: "text-red-600 font-bold" };
  if (dias <= 30) return { label: `Vence en ${dias} d`, color: "text-amber-600 font-bold" };
  return { label: `Vigente (${dias} d)`, color: "text-emerald-600" };
}

export default function EquipoMantenimiento({ machine, puedeEditar, onClose, onUpdated }) {
  const { empresaId } = useEmpresa();
  const [tab, setTab] = useState("mantenimiento");

  const [plans, setPlans] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Estado local del medidor / tipo (editable por admin/jefe_taller)
  const [medidorTipo, setMedidorTipo] = useState(machine.medidorTipo || "horometro");
  const [medidorActual, setMedidorActual] = useState(machine.medidorActual ?? "");
  const [savingMedidor, setSavingMedidor] = useState(false);

  // Form de nuevo/edición de plan
  const [editingPlan, setEditingPlan] = useState(null); // objeto plan o null
  const [showPlanForm, setShowPlanForm] = useState(false);
  const [showCorreccion, setShowCorreccion] = useState(false);

  // Documentos + proyectos
  const [documents, setDocuments] = useState([]);
  const [projects, setProjects] = useState([]);
  const [showDocForm, setShowDocForm] = useState(false);

  // Campos editables de Información (proyecto, centro de costo, disponibilidad, ubicación)
  const [projectId, setProjectId] = useState(machine.projectId || "");
  const [centroCosto, setCentroCosto] = useState(machine.centroCosto || "");
  const [disponibilidad, setDisponibilidad] = useState(machine.disponibilidad || "disponible");
  const [ubicacion, setUbicacion] = useState(machine.ubicacion || "");
  const [leasingMensual, setLeasingMensual] = useState(machine.leasingMensual ?? "");
  const [savingInfo, setSavingInfo] = useState(false);

  const medidorLabel = medidorTipo === "kilometraje" ? "Kilometraje" : "Horómetro";
  const medidorUnidad = medidorTipo === "kilometraje" ? "km" : "h";

  useEffect(() => {
    if (!empresaId) return;
    (async () => {
      setLoading(true);
      try {
        const [p, e, docs, projs] = await Promise.all([
          listMaintenancePlans(empresaId, machine.id),
          listMaintenanceEvents(empresaId, machine.id),
          listMachineDocuments(empresaId, machine.id),
          listAllProjects(empresaId),
        ]);
        setPlans(p);
        setEvents(e);
        setDocuments(docs);
        setProjects(projs);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [empresaId, machine.id]);

  const refreshPlans = async () => setPlans(await listMaintenancePlans(empresaId, machine.id));
  const refreshDocs = async () => setDocuments(await listMachineDocuments(empresaId, machine.id));

  const guardarInfo = async () => {
    setError("");
    setSavingInfo(true);
    try {
      await upsertMachine(empresaId, {
        id: machine.id,
        projectId: projectId || null,
        centroCosto: centroCosto.trim(),
        disponibilidad,
        ubicacion: ubicacion.trim(),
        leasingMensual: leasingMensual === "" ? null : Number(leasingMensual),
      });
      onUpdated();
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingInfo(false);
    }
  };

  /**
   * Actualización normal del medidor: solo hacia adelante.
   *
   * La restricción es correcta —un horómetro no retrocede— pero dejaba sin
   * salida el error de tipeo: bastaba un dígito de más para que el valor
   * quedara inflado para siempre, arrastrando con él todas las alertas de
   * mantención. Por eso existe `corregirMedidor` abajo.
   */
  const guardarMedidor = async () => {
    setError("");
    if (medidorActual === "" || isNaN(Number(medidorActual))) {
      return setError("Ingresa un valor de medidor válido");
    }
    if (machine.medidorActual != null && Number(medidorActual) < Number(machine.medidorActual)) {
      return setError(`El ${medidorLabel.toLowerCase()} no puede ser menor al actual (${Number(machine.medidorActual).toLocaleString("es-CL")}). Si el valor guardado está mal, usa "Corregir".`);
    }
    setSavingMedidor(true);
    try {
      await upsertMachine(empresaId, {
        id: machine.id,
        medidorTipo,
        medidorActual: Number(medidorActual),
        medidorActualizadoEn: new Date().toISOString(),
      });
      onUpdated();
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingMedidor(false);
    }
  };

  /**
   * Corrección hacia atrás, con motivo y trazabilidad.
   *
   * Deliberadamente separada del guardado normal: bajar el medidor borra horas
   * de uso y afecta el cálculo de mantenciones, así que tiene que ser un acto
   * explícito y quedar registrado. También cubre el caso legítimo del horómetro
   * reemplazado, que parte de cero.
   */
  const corregirMedidor = async ({ valor, motivo }) => {
    setSavingMedidor(true);
    setError("");
    try {
      await upsertMachine(empresaId, {
        id: machine.id,
        medidorTipo,
        medidorActual: Number(valor),
        medidorActualizadoEn: new Date().toISOString(),
        // Se conserva el historial de correcciones en la propia máquina: es
        // poco volumen y evita crear una colección para esto.
        medidorCorrecciones: [
          ...(machine.medidorCorrecciones || []),
          {
            anterior: machine.medidorActual ?? null,
            nuevo: Number(valor),
            motivo,
            fecha: new Date().toISOString(),
          },
        ],
      });
      setMedidorActual(String(valor));
      setShowCorreccion(false);
      onUpdated();
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingMedidor(false);
    }
  };

  /**
   * Medidor al que toca la próxima mantención de este plan.
   *
   * Orden de resolución:
   *   1. La última mantención ejecutada del plan, que deja su `proximaMantencionEn`.
   *   2. El ancla que se fijó al crear o editar el plan (`proximaEnMedidor`).
   *   3. Nada: sin ancla no hay objetivo, y decirlo es mejor que inventarlo.
   *
   * Antes, cuando no había mantención previa, caía a `medidorActual + intervalo`.
   * Eso es un blanco móvil: el objetivo avanzaba junto con el horómetro, así que
   * el "faltan 250 h" no bajaba nunca y la alerta de mantención atrasada no
   * podía dispararse jamás. Por eso el plan necesita un valor absoluto.
   */
  const proximaMantencion = (plan) => {
    const eventosPlan = events
      .filter((e) => e.planId === plan.id && e.proximaMantencionEn != null)
      .sort((a, b) => (b.medidorAlMomento || 0) - (a.medidorAlMomento || 0));
    if (eventosPlan.length > 0) return eventosPlan[0].proximaMantencionEn;
    if (plan.proximaEnMedidor != null) return Number(plan.proximaEnMedidor);
    return null;
  };

  const estadoPlan = (plan) => {
    const objetivo = proximaMantencion(plan);
    if (objetivo == null) return { label: "Falta definir a qué medidor toca la próxima", color: "text-amber-600 font-bold" };
    if (machine.medidorActual == null) return { label: "Falta registrar el medidor del equipo", color: "text-slate-400" };
    const restante = objetivo - Number(machine.medidorActual);
    const tol = Number(plan.tolerancia || 0);
    if (restante < -tol) return { label: `Atrasada (${Math.abs(restante)} ${medidorUnidad})`, color: "text-red-600 font-bold" };
    if (restante <= tol) return { label: `Próxima (${restante} ${medidorUnidad})`, color: "text-amber-600 font-bold" };
    return { label: `En ${restante} ${medidorUnidad}`, color: "text-emerald-600" };
  };

  const eliminarPlan = async (planId) => {
    if (!window.confirm("¿Eliminar este plan de mantenimiento?")) return;
    await deleteMaintenancePlan(empresaId, planId);
    await refreshPlans();
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between rounded-t-2xl">
          <div>
            <h2 className="text-xl font-black text-slate-900">
              {machine.name || `${machine.marca || ""} ${machine.modelo || ""}`.trim() || machine.code}
            </h2>
            <p className="text-xs text-slate-500">{machine.code} · {[machine.marca, machine.modelo].filter(Boolean).join(" ")}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-2xl leading-none">&times;</button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-6 pt-4 border-b border-slate-100">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 text-sm font-bold rounded-t-lg transition-colors ${tab === t.id ? "bg-red-50 text-red-700 border-b-2 border-red-600" : "text-slate-500 hover:text-slate-800"}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="p-6 space-y-5">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm font-semibold rounded-xl p-3">{error}</div>}

          {/* ── TAB INFO ── */}
          {tab === "info" && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <Info label="Código" value={machine.code} />
                <Info label="Marca" value={machine.marca} />
                <Info label="Modelo" value={machine.modelo} />
                <Info label="Patente" value={machine.patente} />
                <Info label="Tipo" value={machine.type} />
                <Info label="Año" value={machine.anio || machine.año} />
              </div>

              <div className="border-t border-slate-100 pt-4 space-y-3">
                <p className="text-xs font-black text-slate-500 uppercase">Asignación y disponibilidad</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-slate-500">Proyecto / faena</label>
                    <select
                      className="w-full border-2 border-slate-200 rounded-xl p-2.5 text-sm mt-1 disabled:opacity-60"
                      value={projectId}
                      onChange={(e) => setProjectId(e.target.value)}
                      disabled={!puedeEditar}
                    >
                      <option value="">Sin asignar</option>
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}{p.codigo ? ` (${p.codigo})` : ""}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-500">Centro de costo</label>
                    <input
                      className="w-full border-2 border-slate-200 rounded-xl p-2.5 text-sm mt-1 disabled:opacity-60"
                      value={centroCosto}
                      onChange={(e) => setCentroCosto(e.target.value)}
                      disabled={!puedeEditar}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-500">Disponibilidad</label>
                    <select
                      className="w-full border-2 border-slate-200 rounded-xl p-2.5 text-sm mt-1 disabled:opacity-60"
                      value={disponibilidad}
                      onChange={(e) => setDisponibilidad(e.target.value)}
                      disabled={!puedeEditar}
                    >
                      {DISPONIBILIDAD.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-500">Ubicación</label>
                    <input
                      className="w-full border-2 border-slate-200 rounded-xl p-2.5 text-sm mt-1 disabled:opacity-60"
                      value={ubicacion}
                      onChange={(e) => setUbicacion(e.target.value)}
                      disabled={!puedeEditar}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-500">Costo leasing mensual (CLP)</label>
                    <input
                      type="number"
                      className="w-full border-2 border-slate-200 rounded-xl p-2.5 text-sm mt-1 disabled:opacity-60"
                      placeholder="Ej. 1200000"
                      value={leasingMensual}
                      onChange={(e) => setLeasingMensual(e.target.value)}
                      disabled={!puedeEditar}
                    />
                  </div>
                </div>
                {puedeEditar && (
                  <button
                    onClick={guardarInfo}
                    disabled={savingInfo}
                    className="py-2.5 px-5 rounded-xl bg-slate-900 text-white font-bold text-sm disabled:opacity-50"
                  >
                    {savingInfo ? "Guardando..." : "Guardar información"}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ── TAB DOCUMENTOS ── */}
          {tab === "documentos" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-black text-slate-500 uppercase">Documentación del equipo</p>
                {puedeEditar && (
                  <button onClick={() => setShowDocForm(true)} className="text-xs font-bold text-red-600 hover:text-red-700">
                    + Agregar documento
                  </button>
                )}
              </div>

              {loading ? (
                <p className="text-sm text-slate-400">Cargando...</p>
              ) : documents.length === 0 ? (
                <p className="text-sm text-slate-400">No hay documentos cargados para este equipo.</p>
              ) : (
                <div className="space-y-2">
                  {documents.map((d) => {
                    const est = estadoVencimiento(d.fechaVencimiento);
                    const tipoLabel = TIPOS_DOC.find((t) => t.id === d.tipo)?.label || d.tipo;
                    return (
                      <div key={d.id} className="border border-slate-200 rounded-xl p-3 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-bold text-slate-900 text-sm">{tipoLabel}</p>
                          <p className="text-xs text-slate-500">
                            {d.numero ? `N° ${d.numero} · ` : ""}
                            {d.fechaVencimiento ? `Vence: ${new Date(d.fechaVencimiento).toLocaleDateString("es-CL")}` : "Sin vencimiento"}
                          </p>
                          <p className={`text-xs mt-0.5 ${est.color}`}>{est.label}</p>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          {d.archivoUrl && (
                            <a href={d.archivoUrl} target="_blank" rel="noopener noreferrer" className="text-xs font-bold text-indigo-600 hover:text-indigo-700">
                              Ver archivo
                            </a>
                          )}
                          {puedeEditar && (
                            <button
                              onClick={async () => {
                                if (!window.confirm("¿Eliminar este documento?")) return;
                                await deleteMachineDocument(empresaId, d.id, d.archivoPath);
                                await refreshDocs();
                              }}
                              className="text-xs font-bold text-red-500 hover:text-red-700"
                            >
                              Eliminar
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── TAB MANTENIMIENTO ── */}
          {tab === "mantenimiento" && (
            <div className="space-y-6">
              {/* Medidor */}
              <div className="bg-slate-50 rounded-xl p-4">
                <p className="text-xs font-black text-slate-500 uppercase mb-3">Medidor</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                  <div>
                    <label className="text-xs font-bold text-slate-500">Tipo</label>
                    <select
                      className="w-full border-2 border-slate-200 rounded-xl p-2.5 text-sm mt-1 disabled:opacity-60"
                      value={medidorTipo}
                      onChange={(e) => setMedidorTipo(e.target.value)}
                      disabled={!puedeEditar}
                    >
                      <option value="horometro">Horómetro (horas)</option>
                      <option value="kilometraje">Kilometraje (km)</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-500">{medidorLabel} actual</label>
                    <input
                      type="number"
                      className="w-full border-2 border-slate-200 rounded-xl p-2.5 text-sm mt-1 disabled:opacity-60"
                      value={medidorActual}
                      onChange={(e) => setMedidorActual(e.target.value)}
                      disabled={!puedeEditar}
                    />
                  </div>
                  {puedeEditar && (
                    <div className="flex gap-2">
                      <button
                        onClick={guardarMedidor}
                        disabled={savingMedidor}
                        className="flex-1 py-2.5 rounded-xl bg-slate-900 text-white font-bold text-sm disabled:opacity-50"
                      >
                        {savingMedidor ? "Guardando..." : "Guardar medidor"}
                      </button>
                      {machine.medidorActual != null && (
                        <button
                          onClick={() => setShowCorreccion(true)}
                          disabled={savingMedidor}
                          title="Corregir un valor mal ingresado o un horómetro reemplazado"
                          className="px-3 py-2.5 rounded-xl border-2 border-slate-200 text-slate-600 font-bold text-sm hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap"
                        >
                          Corregir
                        </button>
                      )}
                    </div>
                  )}
                </div>
                {machine.medidorActualizadoEn && (
                  <p className="text-[11px] text-slate-400 mt-2">
                    Última actualización: {new Date(machine.medidorActualizadoEn.seconds ? machine.medidorActualizadoEn.seconds * 1000 : machine.medidorActualizadoEn).toLocaleString("es-CL")}
                  </p>
                )}
              </div>

              {/* Planes de mantenimiento */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-black text-slate-500 uppercase">Planes de mantenimiento preventivo</p>
                  {puedeEditar && (
                    <button
                      onClick={() => { setEditingPlan(null); setShowPlanForm(true); }}
                      className="text-xs font-bold text-red-600 hover:text-red-700"
                    >
                      + Agregar plan
                    </button>
                  )}
                </div>

                {loading ? (
                  <p className="text-sm text-slate-400">Cargando...</p>
                ) : plans.length === 0 ? (
                  <p className="text-sm text-slate-400">No hay planes de mantenimiento para este equipo.</p>
                ) : (
                  <div className="space-y-2">
                    {plans.map((plan) => {
                      const est = estadoPlan(plan);
                      return (
                        <div key={plan.id} className="border border-slate-200 rounded-xl p-3 flex items-center justify-between">
                          <div>
                            <p className="font-bold text-slate-900 text-sm">{plan.nombre}</p>
                            <p className="text-xs text-slate-500">
                              Cada {Number(plan.intervalo).toLocaleString("es-CL")} {medidorUnidad}
                              {plan.tolerancia ? ` · tolerancia ${plan.tolerancia} ${medidorUnidad}` : ""}
                            </p>
                            {/* El objetivo absoluto va a la vista: es el dato que
                                antes había que anotar en el nombre del plan. */}
                            {proximaMantencion(plan) != null && (
                              <p className="text-xs text-slate-500">
                                Próxima a los {Number(proximaMantencion(plan)).toLocaleString("es-CL")} {medidorUnidad}
                                {plan.costoEstimado ? ` · ${CLP(plan.costoEstimado)} neto estimado` : ""}
                              </p>
                            )}
                            <p className={`text-xs mt-1 ${est.color}`}>{est.label}</p>
                          </div>
                          {puedeEditar && (
                            <div className="flex gap-2">
                              <button
                                onClick={() => { setEditingPlan(plan); setShowPlanForm(true); }}
                                className="text-xs font-bold text-slate-500 hover:text-slate-800"
                              >
                                Editar
                              </button>
                              <button
                                onClick={() => eliminarPlan(plan.id)}
                                className="text-xs font-bold text-red-500 hover:text-red-700"
                              >
                                Eliminar
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── TAB HISTORIAL ── */}
          {tab === "historial" && (
            <div>
              <p className="text-xs font-black text-slate-500 uppercase mb-3">Mantenciones realizadas</p>
              {loading ? (
                <p className="text-sm text-slate-400">Cargando...</p>
              ) : events.length === 0 ? (
                <p className="text-sm text-slate-400">Aún no hay mantenciones registradas para este equipo.</p>
              ) : (
                <div className="space-y-2">
                  {events
                    .slice()
                    .sort((a, b) => new Date(b.fecha) - new Date(a.fecha))
                    .map((ev) => (
                      <div key={ev.id} className="border border-slate-200 rounded-xl p-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-black uppercase text-slate-500">{ev.tipo}</span>
                          <span className="text-xs text-slate-400">{ev.fecha ? new Date(ev.fecha).toLocaleDateString("es-CL") : "—"}</span>
                        </div>
                        <p className="text-sm text-slate-800 mt-1">{ev.trabajoRealizado || "Sin descripción"}</p>
                        <p className="text-xs text-slate-500 mt-1">
                          Medidor: {ev.medidorAlMomento != null ? `${Number(ev.medidorAlMomento).toLocaleString("es-CL")} ${medidorUnidad}` : "—"}
                          {ev.proximaMantencionEn != null && ` · próxima: ${Number(ev.proximaMantencionEn).toLocaleString("es-CL")} ${medidorUnidad}`}
                        </p>
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Sub-modal: form de plan */}
      {showCorreccion && (
        <CorreccionMedidorModal
          actual={machine.medidorActual}
          unidad={medidorUnidad}
          etiqueta={medidorLabel}
          correcciones={machine.medidorCorrecciones || []}
          saving={savingMedidor}
          onClose={() => setShowCorreccion(false)}
          onConfirm={corregirMedidor}
        />
      )}

      {showPlanForm && (
        <PlanForm
          medidorActualMaquina={machine.medidorActual}
          empresaId={empresaId}
          machineId={machine.id}
          medidorUnidad={medidorUnidad}
          plan={editingPlan}
          onClose={() => setShowPlanForm(false)}
          onSaved={async () => { setShowPlanForm(false); await refreshPlans(); }}
        />
      )}

      {/* Sub-modal: form de documento */}
      {showDocForm && (
        <DocForm
          empresaId={empresaId}
          machineId={machine.id}
          onClose={() => setShowDocForm(false)}
          onSaved={async () => { setShowDocForm(false); await refreshDocs(); }}
        />
      )}
    </div>
  );
}

function DocForm({ empresaId, machineId, onClose, onSaved }) {
  const [tipo, setTipo] = useState("permiso_circulacion");
  const [numero, setNumero] = useState("");
  const [fechaVencimiento, setFechaVencimiento] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const guardar = async () => {
    setError("");
    setSaving(true);
    try {
      await uploadMachineDocument(
        empresaId, machineId,
        { tipo, numero: numero.trim(), fechaVencimiento, observaciones: observaciones.trim() },
        file
      );
      onSaved();
    } catch (err) {
      setError(err.message || "No se pudo guardar el documento");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[60]">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-black text-slate-900">Agregar documento</h3>
        {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm font-semibold rounded-xl p-3">{error}</div>}

        <div>
          <label className="text-xs font-bold text-slate-500 uppercase">Tipo de documento</label>
          <select className="w-full border-2 border-slate-200 rounded-xl p-2.5 text-sm mt-1" value={tipo} onChange={(e) => setTipo(e.target.value)}>
            {TIPOS_DOC.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase">Número</label>
            <input className="w-full border-2 border-slate-200 rounded-xl p-2.5 text-sm mt-1" value={numero} onChange={(e) => setNumero(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase">Fecha vencimiento</label>
            <input type="date" className="w-full border-2 border-slate-200 rounded-xl p-2.5 text-sm mt-1" value={fechaVencimiento} onChange={(e) => setFechaVencimiento(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="text-xs font-bold text-slate-500 uppercase">Archivo (PDF o imagen)</label>
          <input
            type="file"
            accept=".pdf,image/*"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="w-full text-sm mt-1 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-slate-100 file:text-slate-700 file:font-bold file:text-xs"
          />
        </div>
        <div>
          <label className="text-xs font-bold text-slate-500 uppercase">Observaciones</label>
          <textarea className="w-full border-2 border-slate-200 rounded-xl p-2.5 text-sm mt-1" rows={2} value={observaciones} onChange={(e) => setObservaciones(e.target.value)} />
        </div>

        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border-2 border-slate-200 text-slate-600 font-bold text-sm">Cancelar</button>
          <button onClick={guardar} disabled={saving} className="flex-1 py-2.5 rounded-xl bg-red-600 text-white font-bold text-sm disabled:opacity-50">
            {saving ? "Subiendo..." : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Info({ label, value }) {
  return (
    <div>
      <p className="text-xs font-bold text-slate-400 uppercase">{label}</p>
      <p className="text-sm text-slate-900">{value || "—"}</p>
    </div>
  );
}

function PlanForm({ empresaId, machineId, medidorUnidad, medidorActualMaquina, plan, onClose, onSaved }) {
  const [nombre, setNombre] = useState(plan?.nombre || "");
  const [intervalo, setIntervalo] = useState(plan?.intervalo ?? "");
  const [tolerancia, setTolerancia] = useState(plan?.tolerancia ?? "");
  // A qué valor del medidor toca la próxima. Se propone medidor actual +
  // intervalo, pero es editable: lo normal es que la última mantención se haya
  // hecho antes de cargar el equipo al sistema y el objetivo no calce con esa
  // cuenta.
  const [proxima, setProxima] = useState(() => {
    if (plan?.proximaEnMedidor != null) return String(plan.proximaEnMedidor);
    return "";
  });
  const [costoEstimado, setCostoEstimado] = useState(plan?.costoEstimado ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Sugerencia viva: al escribir el intervalo, propone el objetivo si está vacío
  const sugerida = medidorActualMaquina != null && Number(intervalo) > 0
    ? Number(medidorActualMaquina) + Number(intervalo)
    : null;

  const guardar = async () => {
    setError("");
    if (!nombre.trim()) return setError("Ingresa un nombre para el plan");
    if (!intervalo || isNaN(Number(intervalo)) || Number(intervalo) <= 0) return setError("Ingresa un intervalo válido");
    if (proxima !== "" && isNaN(Number(proxima))) return setError("El medidor de la próxima mantención debe ser un número");
    if (proxima !== "" && medidorActualMaquina != null && Number(proxima) < Number(medidorActualMaquina)) {
      return setError(`La próxima mantención no puede quedar antes del medidor actual (${Number(medidorActualMaquina).toLocaleString("es-CL")} ${medidorUnidad}). Si ya está vencida, regístrala como ejecutada.`);
    }
    setSaving(true);
    try {
      await upsertMaintenancePlan(empresaId, {
        id: plan?.id,
        machineId,
        nombre: nombre.trim(),
        intervalo: Number(intervalo),
        tolerancia: tolerancia === "" ? 0 : Number(tolerancia),
        // Sin ancla no hay objetivo y el plan no puede alertar. Si el usuario
        // la deja vacía se guarda la sugerencia, que es mejor que nada.
        proximaEnMedidor: proxima !== "" ? Number(proxima) : (sugerida ?? null),
        costoEstimado: costoEstimado === "" ? null : Number(costoEstimado),
        activo: true,
      });
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[60]">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
        <h3 className="text-lg font-black text-slate-900">{plan ? "Editar plan" : "Nuevo plan de mantenimiento"}</h3>
        {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm font-semibold rounded-xl p-3">{error}</div>}
        <div>
          <label className="text-xs font-bold text-slate-500 uppercase">Nombre</label>
          <input
            className="w-full border-2 border-slate-200 rounded-xl p-2.5 text-sm mt-1"
            placeholder="Ej. Cambio de aceite y filtros"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase">Intervalo ({medidorUnidad})</label>
            <input
              type="number"
              className="w-full border-2 border-slate-200 rounded-xl p-2.5 text-sm mt-1"
              placeholder="250"
              value={intervalo}
              onChange={(e) => setIntervalo(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase">Tolerancia ({medidorUnidad})</label>
            <input
              type="number"
              className="w-full border-2 border-slate-200 rounded-xl p-2.5 text-sm mt-1"
              placeholder="10"
              value={tolerancia}
              onChange={(e) => setTolerancia(e.target.value)}
            />
          </div>
        </div>
        <div>
          <label className="text-xs font-bold text-slate-500 uppercase">
            Próxima mantención a los ({medidorUnidad})
          </label>
          <div className="flex gap-2 mt-1">
            <input
              type="number"
              className="flex-1 border-2 border-slate-200 rounded-xl p-2.5 text-sm"
              placeholder={sugerida != null ? String(sugerida) : "Ej. 8427"}
              value={proxima}
              onChange={(e) => setProxima(e.target.value)}
            />
            {sugerida != null && String(sugerida) !== proxima && (
              <button
                onClick={() => setProxima(String(sugerida))}
                className="px-3 rounded-xl border-2 border-slate-200 text-xs font-bold text-slate-500 hover:bg-slate-50 whitespace-nowrap"
                title="Medidor actual + intervalo"
              >
                Usar {sugerida.toLocaleString("es-CL")}
              </button>
            )}
          </div>
          <p className="text-[11px] text-slate-400 mt-1 leading-snug">
            El valor absoluto al que toca. De acá sale la cuenta regresiva y la alerta:
            sin esto, el plan no sabe cuándo avisar. Al registrar la mantención como hecha,
            avanza solo un intervalo.
          </p>
        </div>

        <div>
          <label className="text-xs font-bold text-slate-500 uppercase">Costo estimado neto (CLP)</label>
          <input
            type="number"
            className="w-full border-2 border-slate-200 rounded-xl p-2.5 text-sm mt-1"
            placeholder="506000"
            value={costoEstimado}
            onChange={(e) => setCostoEstimado(e.target.value)}
          />
          <p className="text-[11px] text-slate-400 mt-1">
            Sirve para presupuestar las mantenciones del período antes de que ocurran.
          </p>
        </div>

        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border-2 border-slate-200 text-slate-600 font-bold text-sm">
            Cancelar
          </button>
          <button onClick={guardar} disabled={saving} className="flex-1 py-2.5 rounded-xl bg-red-600 text-white font-bold text-sm disabled:opacity-50">
            {saving ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Corrección del medidor. Pide el valor y el motivo, y muestra el historial de
 * correcciones previas: si una máquina acumula varias, el problema no es el
 * dedo sino el proceso de carga.
 */
function CorreccionMedidorModal({ actual, unidad, etiqueta, correcciones, saving, onClose, onConfirm }) {
  const [valor, setValor] = useState(actual != null ? String(actual) : "");
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState("");

  const confirmar = () => {
    setError("");
    if (valor === "" || isNaN(Number(valor)) || Number(valor) < 0) return setError("Ingresa un valor válido");
    if (!motivo.trim()) return setError("El motivo es obligatorio: queda registrado junto a la corrección");
    onConfirm({ valor: Number(valor), motivo: motivo.trim() });
  };

  const baja = Number(valor) < Number(actual || 0);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[60]">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
        <div>
          <h3 className="text-lg font-black text-slate-900">Corregir {etiqueta.toLowerCase()}</h3>
          <p className="text-sm text-slate-500 mt-0.5">
            Valor actual: <strong>{Number(actual || 0).toLocaleString("es-CL")} {unidad}</strong>
          </p>
        </div>

        {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm font-semibold rounded-xl p-3">{error}</div>}

        <div>
          <label className="text-xs font-bold text-slate-500 uppercase">Valor correcto ({unidad})</label>
          <input
            type="number"
            autoFocus
            className="w-full border-2 border-slate-200 rounded-xl p-2.5 text-sm mt-1"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
          />
        </div>

        <div>
          <label className="text-xs font-bold text-slate-500 uppercase">Motivo</label>
          <input
            className="w-full border-2 border-slate-200 rounded-xl p-2.5 text-sm mt-1"
            placeholder="Ej. error de tipeo al cargar · horómetro reemplazado"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
          />
        </div>

        {baja && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
            <p className="text-xs text-amber-800 leading-snug">
              Estás bajando el medidor. Las mantenciones se calculan contra este valor, así que
              revisa que los planes del equipo sigan apuntando al objetivo correcto después de guardar.
            </p>
          </div>
        )}

        {correcciones.length > 0 && (
          <div className="border-t border-slate-100 pt-3">
            <p className="text-[11px] font-bold text-slate-400 uppercase mb-1.5">
              Correcciones anteriores ({correcciones.length})
            </p>
            <div className="space-y-1 max-h-28 overflow-y-auto">
              {correcciones.slice().reverse().map((c, i) => (
                <p key={i} className="text-[11px] text-slate-500 leading-snug">
                  {new Date(c.fecha).toLocaleDateString("es-CL")} ·{" "}
                  {Number(c.anterior ?? 0).toLocaleString("es-CL")} → {Number(c.nuevo).toLocaleString("es-CL")} · {c.motivo}
                </p>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-3 pt-1">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border-2 border-slate-200 text-slate-600 font-bold text-sm">
            Cancelar
          </button>
          <button onClick={confirmar} disabled={saving} className="flex-1 py-2.5 rounded-xl bg-red-600 text-white font-bold text-sm disabled:opacity-50">
            {saving ? "Guardando..." : "Corregir"}
          </button>
        </div>
      </div>
    </div>
  );
}
