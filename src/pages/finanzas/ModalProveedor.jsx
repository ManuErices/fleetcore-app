import React, { useState, useEffect, useRef } from "react";
import {
  MEDIOS_PAGO, BANCOS, TIPOS_CUENTA,
  completarProveedor, validarProveedor, guardarProveedor, formatearRut,
} from "../../lib/proveedores";

/*
 * Ficha de proveedor: crear o editar cómo se le paga y a quién contactar.
 *
 * Va en z-[80] porque se abre encima de ModalCuenta (z-[70]) y del panel de
 * detalle de cuenta (z-[65]). Consume Escape en fase de captura para que la
 * tecla cierre solo este modal y no las capas de abajo.
 *
 * Props:
 *  - empresaId
 *  - proveedor: ficha a editar (con id) o null para crear
 *  - nombreInicial: prellenado de razón social al crear desde un buscador
 *  - onGuardado(id): se llama con el id tras guardar
 *  - onClose()
 */

const inputBase = "w-full px-3.5 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 transition-all placeholder:text-slate-300";
const inputOk   = "border-slate-200 focus:border-purple-400 focus:ring-purple-100";
const inputErr  = "border-red-400 focus:border-red-400 focus:ring-red-100";

function Campo({ label, error, ayuda, children, className = "" }) {
  return (
    <div className={className}>
      <label className="text-xs font-semibold text-slate-500 mb-1.5 block">{label}</label>
      {children}
      {error
        ? <p className="text-[11px] text-red-500 mt-1 font-medium">{error}</p>
        : ayuda && <p className="text-[11px] text-slate-400 mt-1">{ayuda}</p>}
    </div>
  );
}

function Seccion({ titulo, children }) {
  return (
    <section className="space-y-3">
      <h4 className="text-[13px] font-bold text-slate-800">{titulo}</h4>
      {children}
    </section>
  );
}

export default function ModalProveedor({ empresaId, proveedor, nombreInicial = "", onGuardado, onClose }) {
  const editando = !!proveedor?.id;
  const [form, setForm] = useState(() =>
    completarProveedor(editando ? proveedor : { razonSocial: nombreInicial })
  );
  const [errores, setErrores] = useState({});
  const [errorGuardar, setErrorGuardar] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [bancoOtro, setBancoOtro] = useState(
    () => !!form.transferencia.banco && !BANCOS.includes(form.transferencia.banco)
  );
  const primerInput = useRef(null);

  useEffect(() => { primerInput.current?.focus(); }, []);

  // Escape en fase de captura: el modal lo consume antes de que llegue al
  // panel de detalle o al modo ampliado, que escuchan en fase de burbuja.
  useEffect(() => {
    const fn = e => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      if (!guardando) onClose();
    };
    document.addEventListener("keydown", fn, true);
    return () => document.removeEventListener("keydown", fn, true);
  }, [onClose, guardando]);

  const set = (campo, valor) => {
    setForm(f => ({ ...f, [campo]: valor }));
    if (errores[campo]) setErrores(e => ({ ...e, [campo]: undefined }));
  };
  // Para los bloques anidados: setBloque("transferencia", "banco", "BCI")
  // claveError permite limpiar errores con nombre distinto al campo.
  const setBloque = (bloque, campo, valor, claveError = campo) => {
    setForm(f => ({ ...f, [bloque]: { ...f[bloque], [campo]: valor } }));
    if (errores[claveError]) setErrores(e => ({ ...e, [claveError]: undefined }));
  };

  async function guardar() {
    const errs = validarProveedor(form);
    setErrores(errs);
    if (Object.keys(errs).length) return;
    setGuardando(true);
    setErrorGuardar(null);
    try {
      const id = await guardarProveedor(empresaId, form, editando ? proveedor.id : null);
      onGuardado?.(id);
      onClose();
    } catch (e) {
      console.error("Error guardando proveedor:", e);
      if (e.code === "rut-duplicado") setErrores(prev => ({ ...prev, rut: e.message }));
      else setErrorGuardar("No se pudo guardar el proveedor. Revisa tu conexión e intenta de nuevo.");
      setGuardando(false);
    }
  }

  const t = form.transferencia;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4"
      style={{ background: "rgba(15,23,42,0.45)", backdropFilter: "blur(4px)" }}
      onMouseDown={e => { if (e.target === e.currentTarget && !guardando) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="modal-proveedor-titulo"
        className="bg-white rounded-2xl w-full max-w-lg max-h-[calc(100vh-2rem)] flex flex-col overflow-hidden"
        style={{ boxShadow: "0 24px 48px -12px rgba(0,0,0,0.18)" }}>

        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
          <div>
            <h3 id="modal-proveedor-titulo" className="text-sm font-bold text-slate-900">
              {editando ? "Editar proveedor" : "Nuevo proveedor"}
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">Cómo se le paga y a quién contactar</p>
          </div>
          <button onClick={onClose} disabled={guardando} aria-label="Cerrar"
            className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Cuerpo */}
        <div className="p-6 space-y-6 overflow-y-auto">

          <Seccion titulo="Identificación">
            <Campo label="Razón social o nombre *" error={errores.razonSocial}>
              <input ref={primerInput} value={form.razonSocial}
                onChange={e => set("razonSocial", e.target.value)}
                placeholder="Ej: Talana SpA"
                className={`${inputBase} ${errores.razonSocial ? inputErr : inputOk}`} />
            </Campo>
            <Campo label="RUT" error={errores.rut} ayuda="Déjalo vacío si es un proveedor extranjero">
              <input value={form.rut}
                onChange={e => set("rut", e.target.value)}
                onBlur={() => form.rut && set("rut", formatearRut(form.rut))}
                placeholder="76.123.456-7" inputMode="text"
                className={`${inputBase} font-mono ${errores.rut ? inputErr : inputOk}`} />
            </Campo>
          </Seccion>

          <Seccion titulo="Cómo se paga">
            <div className="grid grid-cols-3 gap-1 bg-slate-100 p-1 rounded-xl" role="radiogroup" aria-label="Medio de pago">
              {MEDIOS_PAGO.map(m => {
                const activo = form.medioPago === m.id;
                return (
                  <button key={m.id} type="button" role="radio" aria-checked={activo}
                    onClick={() => set("medioPago", activo ? "" : m.id)}
                    className={`py-2 rounded-lg text-xs font-semibold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-300 ${
                      activo ? "bg-white text-purple-700 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
                    {m.label}
                  </button>
                );
              })}
            </div>

            {!form.medioPago && (
              <p className="text-[11px] text-slate-400">Elige cómo se le paga a este proveedor. Puedes dejarlo para después.</p>
            )}

            {form.medioPago === "transferencia" && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <Campo label="Titular de la cuenta">
                    <input value={t.titular} onChange={e => setBloque("transferencia", "titular", e.target.value)}
                      placeholder={form.razonSocial || "Igual a la razón social"}
                      className={`${inputBase} ${inputOk}`} />
                  </Campo>
                  <Campo label="RUT del titular" error={errores.rutTitular}>
                    <input value={t.rutTitular}
                      onChange={e => setBloque("transferencia", "rutTitular", e.target.value)}
                      onBlur={() => t.rutTitular && setBloque("transferencia", "rutTitular", formatearRut(t.rutTitular))}
                      placeholder={form.rut || "76.123.456-7"}
                      className={`${inputBase} font-mono ${errores.rutTitular ? inputErr : inputOk}`} />
                  </Campo>
                </div>
                <p className="text-[11px] text-slate-400 -mt-1">Si los dejas vacíos se usan la razón social y el RUT de arriba.</p>

                <div className="grid grid-cols-2 gap-3">
                  <Campo label="Banco *" error={errores.banco}>
                    {bancoOtro ? (
                      <div className="flex gap-1.5">
                        <input value={t.banco} onChange={e => setBloque("transferencia", "banco", e.target.value)}
                          placeholder="Nombre del banco" autoFocus
                          className={`${inputBase} ${errores.banco ? inputErr : inputOk}`} />
                        <button type="button" title="Elegir de la lista"
                          onClick={() => { setBancoOtro(false); setBloque("transferencia", "banco", ""); }}
                          className="px-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 text-xs font-semibold flex-shrink-0">
                          Lista
                        </button>
                      </div>
                    ) : (
                      <select value={t.banco}
                        onChange={e => {
                          if (e.target.value === "__otro") { setBancoOtro(true); setBloque("transferencia", "banco", ""); }
                          else setBloque("transferencia", "banco", e.target.value);
                        }}
                        className={`${inputBase} bg-white ${errores.banco ? inputErr : inputOk}`}>
                        <option value="">Selecciona…</option>
                        {BANCOS.map(b => <option key={b} value={b}>{b}</option>)}
                        <option value="__otro">Otro banco…</option>
                      </select>
                    )}
                  </Campo>
                  <Campo label="Tipo de cuenta">
                    <select value={t.tipoCuenta} onChange={e => setBloque("transferencia", "tipoCuenta", e.target.value)}
                      className={`${inputBase} bg-white ${inputOk}`}>
                      <option value="">Selecciona…</option>
                      {TIPOS_CUENTA.map(tc => <option key={tc} value={tc}>{tc}</option>)}
                    </select>
                  </Campo>
                </div>

                <Campo label="Número de cuenta *" error={errores.numeroCuenta}>
                  <input value={t.numeroCuenta}
                    onChange={e => setBloque("transferencia", "numeroCuenta", e.target.value.replace(/[^\d-]/g, ""))}
                    placeholder="00-123-45678-09" inputMode="numeric"
                    className={`${inputBase} font-mono ${errores.numeroCuenta ? inputErr : inputOk}`} />
                </Campo>
                <Campo label="Correo para enviar el comprobante" error={errores.emailComprobante}>
                  <input value={t.emailComprobante} type="email" inputMode="email"
                    onChange={e => setBloque("transferencia", "emailComprobante", e.target.value)}
                    placeholder="pagos@proveedor.cl"
                    className={`${inputBase} ${errores.emailComprobante ? inputErr : inputOk}`} />
                </Campo>
              </div>
            )}

            {form.medioPago === "web" && (
              <div className="space-y-3">
                <Campo label="URL de pago *" error={errores.url}>
                  <input value={form.web.url} type="url" inputMode="url"
                    onChange={e => setBloque("web", "url", e.target.value, "url")}
                    placeholder="https://portal.proveedor.cl/pagar"
                    className={`${inputBase} ${errores.url ? inputErr : inputOk}`} />
                </Campo>
                <Campo label="N° de cliente o servicio" ayuda="No guardes contraseñas aquí.">
                  <input value={form.web.numeroCliente}
                    onChange={e => setBloque("web", "numeroCliente", e.target.value)}
                    placeholder="Ej: 48213"
                    className={`${inputBase} font-mono ${inputOk}`} />
                </Campo>
              </div>
            )}

            {form.medioPago === "automatico" && (
              <Campo label="Dónde se hace el cargo *" error={errores.cargoEn}>
                <input value={form.automatico.cargoEn}
                  onChange={e => setBloque("automatico", "cargoEn", e.target.value)}
                  placeholder="Ej: Tarjeta BICE terminada en 4417"
                  className={`${inputBase} ${errores.cargoEn ? inputErr : inputOk}`} />
              </Campo>
            )}
          </Seccion>

          <Seccion titulo="Contacto del proveedor">
            <div className="grid grid-cols-2 gap-3">
              <Campo label="Correo" error={errores.contactoEmail}>
                <input value={form.contacto.email} type="email" inputMode="email"
                  onChange={e => setBloque("contacto", "email", e.target.value, "contactoEmail")}
                  placeholder="contacto@proveedor.cl"
                  className={`${inputBase} ${errores.contactoEmail ? inputErr : inputOk}`} />
              </Campo>
              <Campo label="Teléfono">
                <input value={form.contacto.telefono} type="tel" inputMode="tel"
                  onChange={e => setBloque("contacto", "telefono", e.target.value)}
                  placeholder="+56 2 2345 6789"
                  className={`${inputBase} ${inputOk}`} />
              </Campo>
            </div>
          </Seccion>

          <Seccion titulo="Ejecutivo de cuenta">
            <Campo label="Nombre">
              <input value={form.ejecutivo.nombre}
                onChange={e => setBloque("ejecutivo", "nombre", e.target.value)}
                placeholder="Nombre y apellido"
                className={`${inputBase} ${inputOk}`} />
            </Campo>
            <div className="grid grid-cols-2 gap-3">
              <Campo label="Correo" error={errores.ejecutivoEmail}>
                <input value={form.ejecutivo.email} type="email" inputMode="email"
                  onChange={e => setBloque("ejecutivo", "email", e.target.value, "ejecutivoEmail")}
                  placeholder="nombre@proveedor.cl"
                  className={`${inputBase} ${errores.ejecutivoEmail ? inputErr : inputOk}`} />
              </Campo>
              <Campo label="Teléfono">
                <input value={form.ejecutivo.telefono} type="tel" inputMode="tel"
                  onChange={e => setBloque("ejecutivo", "telefono", e.target.value)}
                  placeholder="+56 9 1234 5678"
                  className={`${inputBase} ${inputOk}`} />
              </Campo>
            </div>
          </Seccion>

          <Seccion titulo="Notas">
            <textarea value={form.notas} onChange={e => set("notas", e.target.value)} rows={2}
              placeholder="Condiciones de pago, horarios, observaciones…"
              className={`${inputBase} resize-none ${inputOk}`} />
          </Seccion>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 flex-shrink-0 space-y-3">
          {errorGuardar && (
            <p className="text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{errorGuardar}</p>
          )}
          <div className="flex gap-2">
            <button onClick={onClose} disabled={guardando}
              className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition-colors disabled:opacity-50">
              Cancelar
            </button>
            <button onClick={guardar} disabled={guardando}
              className="flex-1 py-2.5 rounded-xl bg-purple-700 hover:bg-purple-600 text-white text-sm font-semibold transition-colors shadow-sm disabled:opacity-60 flex items-center justify-center gap-2">
              {guardando && <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
              {guardando ? "Guardando…" : editando ? "Guardar cambios" : "Crear proveedor"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
