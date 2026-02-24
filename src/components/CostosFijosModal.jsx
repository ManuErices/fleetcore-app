import React, { useState, useEffect } from "react";

const CATEGORIAS = [
  { id: "credito", label: "Crédito Bancario", color: "from-blue-500 to-blue-700", icon: "M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" },
  { id: "leasing", label: "Leasing", color: "from-violet-500 to-purple-700", icon: "M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" },
  { id: "arriendo", label: "Arriendo", color: "from-emerald-500 to-teal-700", icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" },
  { id: "seguro", label: "Seguro", color: "from-amber-500 to-orange-600", icon: "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" },
  { id: "servicio", label: "Servicio / Suscripción", color: "from-sky-500 to-cyan-600", icon: "M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" },
  { id: "otro", label: "Crédito Automotriz", color: "from-slate-500 to-slate-700", icon: "M8 17a2 2 0 100-4 2 2 0 000 4zm8 0a2 2 0 100-4 2 2 0 000 4zM3 9l1.5-4.5A2 2 0 016.4 3h11.2a2 2 0 011.9 1.5L21 9M3 9h18M3 9l-1 6h20l-1-6" },
];

const FRECUENCIAS = [
  { id: "mensual", label: "Mensual" },
  { id: "trimestral", label: "Trimestral" },
  { id: "semestral", label: "Semestral" },
  { id: "anual", label: "Anual" },
  { id: "unico", label: "Pago único" },
];

const MONEDAS = [
  { id: "CLP", label: "CLP $", symbol: "$" },
  { id: "UF", label: "UF", symbol: "UF" },
  { id: "USD", label: "USD", symbol: "US$" },
];

const empty = {
  nombre: "", categoria: "credito", descripcion: "", monto: "",
  moneda: "CLP", frecuencia: "mensual", fechaInicio: "", fechaTermino: "",
  proveedor: "", numeroContrato: "", diaPago: "", notas: "", activo: true,
};

export default function CostosFijosModal({ isOpen, onClose, onSave, editingCosto }) {
  const [form, setForm] = useState(empty);
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editingCosto) {
      setForm({ ...empty, ...editingCosto });
    } else {
      setForm(empty);
    }
    setStep(1);
  }, [editingCosto, isOpen]);

  if (!isOpen) return null;

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const catActual = CATEGORIAS.find(c => c.id === form.categoria) || CATEGORIAS[0];

  const handleSubmit = async () => {
    if (!form.nombre || !form.monto || !form.fechaInicio) return;
    setSaving(true);
    await onSave(form);
    setSaving(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-auto overflow-hidden">

        {/* Header */}
        <div className={`bg-gradient-to-r ${catActual.color} p-6 text-white`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d={catActual.icon} />
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-black">{editingCosto ? "Editar Costo" : "Nuevo Costo Fijo"}</h2>
                <p className="text-white/70 text-sm">{editingCosto ? editingCosto.nombre : "Registra un nuevo costo recurrente"}</p>
              </div>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>

          {/* Steps */}
          <div className="flex items-center gap-2 mt-5">
            {[1, 2, 3].map(s => (
              <React.Fragment key={s}>
                <button
                  onClick={() => step > s || s === 1 ? setStep(s) : null}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${step === s ? "bg-white text-slate-800 shadow-md" : step > s ? "bg-white/30 text-white" : "bg-white/10 text-white/50"}`}
                >
                  <span className={`w-4 h-4 rounded-full flex items-center justify-center text-xs font-black ${step === s ? "bg-slate-800 text-white" : step > s ? "bg-white/60 text-slate-700" : "bg-white/20 text-white/60"}`}>{s}</span>
                  {s === 1 ? "Básico" : s === 2 ? "Detalles" : "Contrato"}
                </button>
                {s < 3 && <div className={`flex-1 h-0.5 rounded ${step > s ? "bg-white/50" : "bg-white/20"}`} />}
              </React.Fragment>
            ))}
          </div>
        </div>

        <div className="p-6 space-y-5">

          {/* STEP 1 */}
          {step === 1 && (
            <>
              {/* Categoría */}
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Categoría</label>
                <div className="grid grid-cols-3 gap-2">
                  {CATEGORIAS.map(c => (
                    <button
                      key={c.id}
                      onClick={() => set("categoria", c.id)}
                      className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all text-center ${form.categoria === c.id ? "border-slate-900 bg-slate-50 shadow-md" : "border-slate-200 hover:border-slate-300"}`}
                    >
                      <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${c.color} flex items-center justify-center`}>
                        <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d={c.icon} /></svg>
                      </div>
                      <span className="text-xs font-bold text-slate-700 leading-tight">{c.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Nombre */}
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5">Nombre del costo <span className="text-red-500">*</span></label>
                <input
                  value={form.nombre}
                  onChange={e => set("nombre", e.target.value)}
                  placeholder="Ej: Crédito Caterpillar D8, Arriendo Bodega Lo Espejo..."
                  className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-slate-500 text-sm"
                />
              </div>

              {/* Monto + Moneda + Frecuencia */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1.5">Monto <span className="text-red-500">*</span></label>
                  <div className="flex gap-2">
                    <select
                      value={form.moneda}
                      onChange={e => set("moneda", e.target.value)}
                      className="px-2 py-2.5 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-slate-500 text-sm font-bold bg-slate-50 w-24"
                    >
                      {MONEDAS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                    </select>
                    <input
                      type="number"
                      value={form.monto}
                      onChange={e => set("monto", e.target.value)}
                      placeholder="0"
                      className="flex-1 px-4 py-2.5 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-slate-500 text-sm"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1.5">Frecuencia</label>
                  <select
                    value={form.frecuencia}
                    onChange={e => set("frecuencia", e.target.value)}
                    className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-slate-500 text-sm"
                  >
                    {FRECUENCIAS.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5">Descripción</label>
                <textarea
                  value={form.descripcion}
                  onChange={e => set("descripcion", e.target.value)}
                  placeholder="Describe brevemente este costo..."
                  rows={2}
                  className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-slate-500 text-sm resize-none"
                />
              </div>
            </>
          )}

          {/* STEP 2 */}
          {step === 2 && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1.5">Fecha de inicio <span className="text-red-500">*</span></label>
                  <input
                    type="date"
                    value={form.fechaInicio}
                    onChange={e => set("fechaInicio", e.target.value)}
                    className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-slate-500 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1.5">Fecha de término</label>
                  <input
                    type="date"
                    value={form.fechaTermino}
                    onChange={e => set("fechaTermino", e.target.value)}
                    className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-slate-500 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5">
                  Día de pago
                  <span className="ml-2 text-xs font-normal text-slate-400">(día del mes, ej: 5, 15, 30)</span>
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min="1"
                    max="31"
                    value={form.diaPago}
                    onChange={e => set("diaPago", e.target.value)}
                    placeholder="—"
                    className="w-28 px-4 py-2.5 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-slate-500 text-sm text-center font-bold"
                  />
                  {form.diaPago && (
                    <span className="text-sm text-slate-500">
                      Vence el <strong className="text-slate-800">día {form.diaPago}</strong> de cada {form.frecuencia === "mensual" ? "mes" : "período"}
                    </span>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5">Proveedor / Institución</label>
                <input
                  value={form.proveedor}
                  onChange={e => set("proveedor", e.target.value)}
                  placeholder="Ej: Banco BCI, Sodimac, Inmobiliaria X..."
                  className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-slate-500 text-sm"
                />
              </div>

              {/* Estado activo */}
              <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border-2 border-slate-200">
                <div>
                  <p className="text-sm font-bold text-slate-700">Estado del costo</p>
                  <p className="text-xs text-slate-500 mt-0.5">Los costos inactivos se excluyen del resumen mensual</p>
                </div>
                <button
                  onClick={() => set("activo", !form.activo)}
                  className={`relative w-12 h-6 rounded-full transition-colors ${form.activo ? "bg-emerald-500" : "bg-slate-300"}`}
                >
                  <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${form.activo ? "translate-x-7" : "translate-x-1"}`} />
                </button>
              </div>
            </>
          )}

          {/* STEP 3 */}
          {step === 3 && (
            <>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5">N° de contrato / referencia</label>
                <input
                  value={form.numeroContrato}
                  onChange={e => set("numeroContrato", e.target.value)}
                  placeholder="Ej: CTR-2024-0123"
                  className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-slate-500 text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5">Notas adicionales</label>
                <textarea
                  value={form.notas}
                  onChange={e => set("notas", e.target.value)}
                  placeholder="Condiciones especiales, vencimiento de garantías, observaciones..."
                  rows={4}
                  className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-slate-500 text-sm resize-none"
                />
              </div>

              {/* Resumen */}
              <div className={`rounded-xl p-4 bg-gradient-to-r ${catActual.color} bg-opacity-10`} style={{background: 'linear-gradient(135deg, #f8fafc, #f1f5f9)'}}>
                <p className="text-xs font-black text-slate-500 uppercase tracking-wider mb-3">Resumen del costo</p>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div><span className="text-slate-500">Nombre:</span><span className="font-bold text-slate-800 ml-1">{form.nombre || "—"}</span></div>
                  <div><span className="text-slate-500">Categoría:</span><span className="font-bold text-slate-800 ml-1">{catActual.label}</span></div>
                  <div><span className="text-slate-500">Monto:</span><span className="font-bold text-slate-800 ml-1">{form.moneda} {Number(form.monto || 0).toLocaleString("es-CL")}</span></div>
                  <div><span className="text-slate-500">Frecuencia:</span><span className="font-bold text-slate-800 ml-1">{FRECUENCIAS.find(f => f.id === form.frecuencia)?.label}</span></div>
                  <div><span className="text-slate-500">Inicio:</span><span className="font-bold text-slate-800 ml-1">{form.fechaInicio || "—"}</span></div>
                  <div><span className="text-slate-500">Día de pago:</span><span className="font-bold text-slate-800 ml-1">{form.diaPago ? `Día ${form.diaPago}` : "—"}</span></div>
                  <div><span className="text-slate-500">Estado:</span><span className={`font-bold ml-1 ${form.activo ? "text-emerald-600" : "text-slate-400"}`}>{form.activo ? "Activo" : "Inactivo"}</span></div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 flex gap-3">
          {step > 1 && (
            <button onClick={() => setStep(s => s - 1)} className="px-5 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-all text-sm">
              ← Anterior
            </button>
          )}
          <button onClick={onClose} className="px-5 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-all text-sm">
            Cancelar
          </button>
          <div className="flex-1" />
          {step < 3 ? (
            <button
              onClick={() => setStep(s => s + 1)}
              disabled={step === 1 && (!form.nombre || !form.monto)}
              className="px-6 py-3 bg-slate-900 hover:bg-slate-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold rounded-xl transition-all text-sm flex items-center gap-2 disabled:cursor-not-allowed"
            >
              Siguiente →
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={saving || !form.nombre || !form.monto || !form.fechaInicio}
              className={`px-6 py-3 bg-gradient-to-r ${catActual.color} hover:opacity-90 disabled:opacity-40 text-white font-bold rounded-xl transition-all text-sm flex items-center gap-2 shadow-lg disabled:cursor-not-allowed`}
            >
              {saving ? (
                <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Guardando...</>
              ) : (
                <><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>{editingCosto ? "Guardar cambios" : "Crear costo"}</>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
