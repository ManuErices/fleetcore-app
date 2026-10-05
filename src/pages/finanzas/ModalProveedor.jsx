import React, { useState, useEffect, useRef } from "react";
import {
  MEDIOS_PAGO, BANCOS, TIPOS_CUENTA,
  completarProveedor, validarProveedor, guardarProveedor, formatearRut,
} from "../../lib/proveedores";
import { ModalCuaderno, Titulo, Campo, Boton, Segmentado, Nota } from "./cuaderno";

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

function Seccion({ titulo, children }) {
  return (
    <section className="space-y-4">
      <Titulo as="h3" tamano="sm" className="border-b border-cuaderno-azul">{titulo}</Titulo>
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
    <ModalCuaderno
      titulo={editando ? "Editar proveedor" : "Nuevo proveedor"}
      subtitulo="Cómo se le paga y a quién contactar"
      ancho="max-w-lg"
      capa="z-[80]"
      cerrarAlClicFuera
      bloqueado={guardando}
      onClose={onClose}
      pie={
        <div className="space-y-3">
          {errorGuardar && <Nota etiqueta="Ojo:">{errorGuardar}</Nota>}
          <div className="flex gap-2">
            <Boton className="flex-1" onClick={onClose} disabled={guardando}>Cancelar</Boton>
            <Boton variante="primario" className="flex-1" onClick={guardar} disabled={guardando}>
              {guardando ? "Guardando…" : editando ? "Guardar cambios" : "Crear proveedor"}
            </Boton>
          </div>
        </div>
      }>

      <Seccion titulo="Identificación">
        <Campo ref={primerInput} etiqueta="Razón social o nombre" error={errores.razonSocial}
          value={form.razonSocial} onChange={e => set("razonSocial", e.target.value)}
          placeholder="Ej: Talana SpA" />
        <Campo etiqueta="RUT" error={errores.rut} ayuda="Déjalo vacío si es un proveedor extranjero"
          value={form.rut}
          onChange={e => set("rut", e.target.value)}
          onBlur={() => form.rut && set("rut", formatearRut(form.rut))}
          placeholder="76.123.456-7" />
      </Seccion>

      <Seccion titulo="Cómo se paga">
        <Segmentado
          opciones={MEDIOS_PAGO}
          valor={form.medioPago}
          onCambiar={id => set("medioPago", id)}
          permitirVacio
        />
        {!form.medioPago && (
          <p className="m-0 text-[15px] text-cuaderno-grafito">Elige cómo se le paga. Puedes dejarlo para después.</p>
        )}

        {form.medioPago === "transferencia" && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Campo etiqueta="Titular de la cuenta"
                value={t.titular} onChange={e => setBloque("transferencia", "titular", e.target.value)}
                placeholder={form.razonSocial || "Igual a la razón social"} />
              <Campo etiqueta="RUT del titular" error={errores.rutTitular}
                value={t.rutTitular}
                onChange={e => setBloque("transferencia", "rutTitular", e.target.value)}
                onBlur={() => t.rutTitular && setBloque("transferencia", "rutTitular", formatearRut(t.rutTitular))}
                placeholder={form.rut || "76.123.456-7"} />
            </div>
            <p className="m-0 -mt-2 text-[13px] text-cuaderno-grafito">Si los dejas vacíos se usan la razón social y el RUT de arriba.</p>

            <div className="grid grid-cols-2 gap-4">
              {bancoOtro ? (
                <div className="flex items-end gap-2">
                  <Campo etiqueta="Banco" error={errores.banco} className="flex-1" autoFocus
                    value={t.banco} onChange={e => setBloque("transferencia", "banco", e.target.value)}
                    placeholder="Nombre del banco" />
                  <Boton variante="texto" className="text-[15px]"
                    onClick={() => { setBancoOtro(false); setBloque("transferencia", "banco", ""); }}>lista</Boton>
                </div>
              ) : (
                <Campo as="select" etiqueta="Banco" error={errores.banco}
                  value={t.banco}
                  onChange={e => {
                    if (e.target.value === "__otro") { setBancoOtro(true); setBloque("transferencia", "banco", ""); }
                    else setBloque("transferencia", "banco", e.target.value);
                  }}>
                  <option value="">Elige uno…</option>
                  {BANCOS.map(b => <option key={b} value={b}>{b}</option>)}
                  <option value="__otro">Otro banco…</option>
                </Campo>
              )}
              <Campo as="select" etiqueta="Tipo de cuenta"
                value={t.tipoCuenta} onChange={e => setBloque("transferencia", "tipoCuenta", e.target.value)}>
                <option value="">Elige uno…</option>
                {TIPOS_CUENTA.map(tc => <option key={tc} value={tc}>{tc}</option>)}
              </Campo>
            </div>

            <Campo etiqueta="Número de cuenta" error={errores.numeroCuenta} inputMode="numeric"
              value={t.numeroCuenta}
              onChange={e => setBloque("transferencia", "numeroCuenta", e.target.value.replace(/[^\d-]/g, ""))}
              placeholder="00-123-45678-09" />
            <Campo etiqueta="Correo para enviar el comprobante" error={errores.emailComprobante}
              type="email" inputMode="email"
              value={t.emailComprobante} onChange={e => setBloque("transferencia", "emailComprobante", e.target.value)}
              placeholder="pagos@proveedor.cl" />
          </div>
        )}

        {form.medioPago === "web" && (
          <div className="space-y-4">
            <Campo etiqueta="URL de pago" error={errores.url} type="url" inputMode="url"
              value={form.web.url} onChange={e => setBloque("web", "url", e.target.value, "url")}
              placeholder="https://portal.proveedor.cl/pagar" />
            <Campo etiqueta="N° de cliente o servicio" ayuda="No guardes contraseñas aquí."
              value={form.web.numeroCliente} onChange={e => setBloque("web", "numeroCliente", e.target.value)}
              placeholder="Ej: 48213" />
          </div>
        )}

        {form.medioPago === "automatico" && (
          <Campo etiqueta="Dónde se hace el cargo" error={errores.cargoEn}
            value={form.automatico.cargoEn} onChange={e => setBloque("automatico", "cargoEn", e.target.value)}
            placeholder="Ej: tarjeta BICE terminada en 4417" />
        )}
      </Seccion>

      <Seccion titulo="Contacto del proveedor">
        <div className="grid grid-cols-2 gap-4">
          <Campo etiqueta="Correo" error={errores.contactoEmail} type="email" inputMode="email"
            value={form.contacto.email} onChange={e => setBloque("contacto", "email", e.target.value, "contactoEmail")}
            placeholder="contacto@proveedor.cl" />
          <Campo etiqueta="Teléfono" type="tel" inputMode="tel"
            value={form.contacto.telefono} onChange={e => setBloque("contacto", "telefono", e.target.value)}
            placeholder="+56 2 2345 6789" />
        </div>
      </Seccion>

      <Seccion titulo="Ejecutivo de cuenta">
        <Campo etiqueta="Nombre"
          value={form.ejecutivo.nombre} onChange={e => setBloque("ejecutivo", "nombre", e.target.value)}
          placeholder="Nombre y apellido" />
        <div className="grid grid-cols-2 gap-4">
          <Campo etiqueta="Correo" error={errores.ejecutivoEmail} type="email" inputMode="email"
            value={form.ejecutivo.email} onChange={e => setBloque("ejecutivo", "email", e.target.value, "ejecutivoEmail")}
            placeholder="nombre@proveedor.cl" />
          <Campo etiqueta="Teléfono" type="tel" inputMode="tel"
            value={form.ejecutivo.telefono} onChange={e => setBloque("ejecutivo", "telefono", e.target.value)}
            placeholder="+56 9 1234 5678" />
        </div>
      </Seccion>

      <Seccion titulo="Notas">
        <Campo as="textarea" rows={2} etiqueta="Condiciones, horarios u observaciones"
          value={form.notas} onChange={e => set("notas", e.target.value)} />
      </Seccion>
    </ModalCuaderno>
  );
}
