import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { MEDIOS_PAGO, textoTransferencia, hrefTelefono } from "../../lib/proveedores";
import SelectorProveedor from "./SelectorProveedor";
import ModalProveedor from "./ModalProveedor";

/*
 * Panel lateral con el detalle de una cuenta de egreso del flujo de caja:
 * cómo se paga, a quién contactar y qué montos tiene en las semanas
 * visibles. Los datos de pago y contacto viven en el maestro de
 * proveedores; la cuenta solo guarda `proveedorId`.
 *
 * Capas: este panel va en z-[65], sobre el modo ampliado del flujo (z-[60])
 * y bajo ModalCuenta (z-[70]) y ModalProveedor (z-[80]). Mientras alguno de
 * esos modales está abierto, el panel ignora Escape para no cerrarse por
 * debajo.
 *
 * Props:
 *  - empresaId
 *  - cuenta, proveedor (ficha resuelta o null), proveedores (lista del maestro)
 *  - accent: color de la subcategoría, el mismo de la tabla
 *  - weekColumns, payments, paymentsPaid, paymentNotas
 *  - bloqueado: true si hay un modal del flujo abierto encima
 *  - onClose(), onEditarCuenta(cuenta)
 *  - onVincularProveedor(cuentaId, proveedorId): async, lanza si falla
 */

const MEDIO_LABEL = Object.fromEntries(MEDIOS_PAGO.map(m => [m.id, m.label]));

function fmtCLP(n) {
  const abs = Math.abs(Math.round(n || 0));
  return (n < 0 ? "−$" : "$") + abs.toLocaleString("es-CL");
}

function casoOracion(s) {
  const t = String(s || "").trim().toLowerCase();
  return t ? t[0].toUpperCase() + t.slice(1) : "";
}

async function copiarTexto(texto) {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    // Respaldo para navegadores sin Clipboard API o contextos no seguros
    const ta = document.createElement("textarea");
    ta.value = texto;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  }
}

// ─── Íconos ───────────────────────────────────────────────────────────────────
const Icono = {
  copiar: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />,
  check:  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />,
  cerrar: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />,
  externo:<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />,
  tarjeta:<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />,
};
function Svg({ children, className = "w-3.5 h-3.5" }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">{children}</svg>;
}

// ─── Piezas ───────────────────────────────────────────────────────────────────
function Seccion({ titulo, extra, children }) {
  return (
    <section className="px-6 py-5 border-t border-slate-100 first:border-t-0">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h3 className="text-[13px] font-bold text-slate-800">{titulo}</h3>
        {extra}
      </div>
      {children}
    </section>
  );
}

function BotonCopiar({ id, texto, copiado, onCopiar, label }) {
  const hecho = copiado === id;
  return (
    <button type="button" onClick={() => onCopiar(id, texto)}
      aria-label={hecho ? "Copiado" : `Copiar ${label}`} title={hecho ? "Copiado" : "Copiar"}
      className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-300 ${
        hecho ? "text-emerald-600 bg-emerald-50" : "text-slate-400 hover:text-slate-700 hover:bg-slate-100"}`}>
      <Svg>{hecho ? Icono.check : Icono.copiar}</Svg>
    </button>
  );
}

// Fila etiqueta / valor, con enlace opcional y botón de copiar
function Fila({ label, valor, href, mono, copiable = true, id, copiado, onCopiar }) {
  if (!valor) return null;
  return (
    <div className="flex items-center gap-3 min-h-[36px]">
      <dt className="w-28 flex-shrink-0 text-xs text-slate-400">{label}</dt>
      <dd className={`flex-1 min-w-0 text-sm text-slate-800 truncate ${mono ? "font-mono text-[13px]" : ""}`}>
        {href
          ? <a href={href} className="text-purple-700 hover:underline underline-offset-2">{valor}</a>
          : valor}
      </dd>
      {copiable && <BotonCopiar id={id} texto={valor} copiado={copiado} onCopiar={onCopiar} label={label.toLowerCase()} />}
    </div>
  );
}

// ─── Panel ────────────────────────────────────────────────────────────────────
export default function PanelDetalleCuenta({
  empresaId, cuenta, proveedor, proveedores, accent = "#94a3b8",
  weekColumns, payments, paymentsPaid, paymentNotas,
  bloqueado = false, onClose, onEditarCuenta, onVincularProveedor,
}) {
  const [visible, setVisible] = useState(false);
  const [editandoFicha, setEditandoFicha] = useState(false);
  const [cambiando, setCambiando] = useState(false);
  const [vinculando, setVinculando] = useState(false);
  const [errorVincular, setErrorVincular] = useState(null);
  const [copiado, setCopiado] = useState(null);
  const timerCopiado = useRef(null);
  const botonCerrar = useRef(null);

  // Entrada: montar fuera de pantalla y deslizar en el siguiente frame
  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true));
    botonCerrar.current?.focus({ preventScroll: true });
    return () => { cancelAnimationFrame(raf); clearTimeout(timerCopiado.current); };
  }, []);

  const cerrar = useCallback(() => {
    setVisible(false);
    setTimeout(onClose, 200);
  }, [onClose]);

  useEffect(() => {
    const fn = e => { if (e.key === "Escape" && !bloqueado && !editandoFicha) cerrar(); };
    document.addEventListener("keydown", fn);
    return () => document.removeEventListener("keydown", fn);
  }, [cerrar, bloqueado, editandoFicha]);

  // Al cambiar de cuenta con el panel abierto, volver al estado base
  useEffect(() => { setCambiando(false); setErrorVincular(null); }, [cuenta.id]);

  const onCopiar = useCallback(async (id, texto) => {
    const ok = await copiarTexto(texto);
    if (!ok) return;
    setCopiado(id);
    clearTimeout(timerCopiado.current);
    timerCopiado.current = setTimeout(() => setCopiado(null), 1800);
  }, []);

  async function vincular(proveedorId) {
    setVinculando(true);
    setErrorVincular(null);
    try {
      await onVincularProveedor(cuenta.id, proveedorId);
      setCambiando(false);
    } catch (e) {
      console.error("Error vinculando proveedor:", e);
      setErrorVincular("No se pudo guardar el cambio. Revisa tu conexión e intenta de nuevo.");
    }
    setVinculando(false);
  }

  // ── Montos de la cuenta en las semanas visibles ───────────────────────────
  const semanas = useMemo(() => weekColumns
    .map(w => {
      const key = `${cuenta.id}-${w.key}`;
      return { ...w, monto: payments[key] || 0, pagado: !!paymentsPaid[key], nota: paymentNotas[key] || "" };
    })
    .filter(w => w.monto !== 0),
  [weekColumns, payments, paymentsPaid, paymentNotas, cuenta.id]);

  const totalFlujo = semanas.reduce((s, w) => s + w.monto, 0);
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const proximo = semanas.find(w => !w.pagado && w.endDate >= hoy);

  const p = proveedor;
  const t = p?.transferencia || {};
  const subtitulo = [casoOracion(cuenta.subcategoria), casoOracion(cuenta.detalle)].filter(Boolean).join(" · ");
  const tieneContacto = p && (p.contacto?.email || p.contacto?.telefono || p.ejecutivo?.nombre || p.ejecutivo?.email || p.ejecutivo?.telefono);

  return (
    <div className="fixed inset-0 z-[65]" role="presentation">
      {/* Fondo */}
      <div onClick={cerrar}
        className={`absolute inset-0 bg-slate-900/25 backdrop-blur-[2px] transition-opacity duration-200 motion-reduce:transition-none ${visible ? "opacity-100" : "opacity-0"}`} />

      {/* Panel */}
      <aside role="dialog" aria-modal="true" aria-labelledby="panel-cuenta-titulo"
        className={`absolute top-0 right-0 h-full w-full sm:w-[440px] bg-white flex flex-col transition-transform duration-200 ease-out motion-reduce:transition-none ${visible ? "translate-x-0" : "translate-x-full"}`}
        style={{ boxShadow: "-16px 0 40px -12px rgba(15,23,42,0.18)" }}>

        {/* Header */}
        <header className="px-6 pt-5 pb-4 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              {subtitulo && (
                <p className="flex items-center gap-1.5 text-xs text-slate-400 mb-1">
                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: accent }} />
                  <span className="truncate">{subtitulo}</span>
                </p>
              )}
              <h2 id="panel-cuenta-titulo" className="text-base font-bold text-slate-900 leading-snug break-words">{cuenta.nombre}</h2>
            </div>
            <button ref={botonCerrar} onClick={cerrar} aria-label="Cerrar detalle"
              className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center flex-shrink-0 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-300">
              <Svg className="w-4 h-4">{Icono.cerrar}</Svg>
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3 mt-4">
            <div className="rounded-xl bg-slate-50 px-3.5 py-2.5">
              <p className="text-[11px] text-slate-400">Próximo pago</p>
              {proximo ? (
                <>
                  <p className="text-sm font-bold font-mono text-rose-600 mt-0.5">{fmtCLP(proximo.monto)}</p>
                  <p className="text-[11px] text-slate-400">{proximo.label} · {proximo.dateRange}</p>
                </>
              ) : (
                <p className="text-sm font-semibold text-slate-400 mt-0.5">Sin pagos pendientes</p>
              )}
            </div>
            <div className="rounded-xl bg-slate-50 px-3.5 py-2.5">
              <p className="text-[11px] text-slate-400">Total en el flujo</p>
              <p className={`text-sm font-bold font-mono mt-0.5 ${totalFlujo ? "text-slate-800" : "text-slate-400"}`}>
                {totalFlujo ? fmtCLP(totalFlujo) : "$0"}
              </p>
              <p className="text-[11px] text-slate-400">{weekColumns.length} semanas visibles</p>
            </div>
          </div>
        </header>

        {/* Cuerpo */}
        <div className="flex-1 overflow-y-auto">

          {/* Proveedor */}
          <Seccion titulo="Proveedor"
            extra={p && !cambiando && (
              <div className="flex items-center gap-3">
                <button onClick={() => setCambiando(true)} className="text-xs font-semibold text-slate-400 hover:text-slate-600">Cambiar</button>
                <button onClick={() => setEditandoFicha(true)} className="text-xs font-semibold text-purple-700 hover:text-purple-800">Editar ficha</button>
              </div>
            )}>
            {p && !cambiando ? (
              <div>
                <p className="text-sm font-semibold text-slate-800">{p.razonSocial}</p>
                <p className="text-xs text-slate-400 mt-0.5">{p.rut || "Sin RUT"}</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {!p && (
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Vincula un proveedor para tener a mano cómo pagarle y a quién contactar.
                  </p>
                )}
                <div className={vinculando ? "opacity-60 pointer-events-none" : ""}>
                  <SelectorProveedor empresaId={empresaId} proveedores={proveedores}
                    value={cambiando ? (cuenta.proveedorId || "") : ""}
                    onChange={id => (id ? vincular(id) : vincular(""))}
                    nombreSugerido={casoOracion(cuenta.nombre)}
                    autoFocus={cambiando} />
                </div>
                {cambiando && (
                  <button onClick={() => setCambiando(false)} className="text-xs font-semibold text-slate-400 hover:text-slate-600">
                    Cancelar
                  </button>
                )}
              </div>
            )}
            {errorVincular && <p className="text-xs font-medium text-red-600 mt-2">{errorVincular}</p>}
          </Seccion>

          {/* Cómo pagar */}
          {p && (
            <Seccion titulo="Cómo pagar"
              extra={p.medioPago && (
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-purple-50 text-purple-700">
                  {MEDIO_LABEL[p.medioPago]}
                </span>
              )}>
              {p.medioPago === "transferencia" && (
                <>
                  <dl>
                    <Fila label="Titular"       valor={t.titular || p.razonSocial} id="titular" copiado={copiado} onCopiar={onCopiar} />
                    <Fila label="RUT"           valor={t.rutTitular || p.rut} mono id="rut" copiado={copiado} onCopiar={onCopiar} />
                    <Fila label="Banco"         valor={t.banco} copiable={false} />
                    <Fila label="Tipo de cuenta" valor={t.tipoCuenta} copiable={false} />
                    <Fila label="N° de cuenta"  valor={t.numeroCuenta} mono id="numero" copiado={copiado} onCopiar={onCopiar} />
                    <Fila label="Comprobante a" valor={t.emailComprobante} href={`mailto:${t.emailComprobante}`} id="emailComp" copiado={copiado} onCopiar={onCopiar} />
                  </dl>
                  <button onClick={() => onCopiar("todo", textoTransferencia(p))}
                    className={`mt-3 w-full py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-300 ${
                      copiado === "todo" ? "bg-emerald-50 text-emerald-700" : "bg-purple-700 hover:bg-purple-600 text-white shadow-sm"}`}>
                    <Svg>{copiado === "todo" ? Icono.check : Icono.copiar}</Svg>
                    {copiado === "todo" ? "Datos copiados" : "Copiar datos de transferencia"}
                  </button>
                </>
              )}

              {p.medioPago === "web" && (
                <>
                  <dl>
                    <Fila label="Portal" valor={(() => { try { return new URL(p.web?.url).hostname; } catch { return p.web?.url; } })()} copiable={false} />
                    <Fila label="N° de cliente" valor={p.web?.numeroCliente} mono id="cliente" copiado={copiado} onCopiar={onCopiar} />
                  </dl>
                  {p.web?.url && (
                    <a href={p.web.url} target="_blank" rel="noopener noreferrer"
                      className="mt-3 w-full py-2.5 rounded-xl bg-purple-700 hover:bg-purple-600 text-white text-sm font-semibold flex items-center justify-center gap-2 shadow-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-300">
                      Ir a pagar
                      <Svg>{Icono.externo}</Svg>
                    </a>
                  )}
                </>
              )}

              {p.medioPago === "automatico" && (
                <div className="flex gap-3 rounded-xl bg-slate-50 px-4 py-3">
                  <span className="text-slate-400 mt-0.5"><Svg className="w-4 h-4">{Icono.tarjeta}</Svg></span>
                  <div>
                    <p className="text-sm text-slate-800">Se carga en <span className="font-semibold">{p.automatico?.cargoEn}</span></p>
                    <p className="text-xs text-slate-500 mt-0.5">No hay que pagarlo a mano. Revisa que el cargo aparezca en la cartola.</p>
                  </div>
                </div>
              )}

              {!p.medioPago && (
                <div className="text-xs text-slate-500">
                  La ficha no tiene un medio de pago.{" "}
                  <button onClick={() => setEditandoFicha(true)} className="font-semibold text-purple-700 hover:underline underline-offset-2">Agregar medio de pago</button>
                </div>
              )}
            </Seccion>
          )}

          {/* Contacto */}
          {p && (
            <Seccion titulo="Contacto">
              {tieneContacto ? (
                <div className="space-y-4">
                  {(p.contacto?.email || p.contacto?.telefono) && (
                    <dl>
                      <Fila label="Correo"   valor={p.contacto?.email} href={`mailto:${p.contacto?.email}`} id="cEmail" copiado={copiado} onCopiar={onCopiar} />
                      <Fila label="Teléfono" valor={p.contacto?.telefono} href={hrefTelefono(p.contacto?.telefono)} id="cTel" copiado={copiado} onCopiar={onCopiar} />
                    </dl>
                  )}
                  {(p.ejecutivo?.nombre || p.ejecutivo?.email || p.ejecutivo?.telefono) && (
                    <div>
                      <p className="text-xs font-semibold text-slate-500 mb-1">Ejecutivo de cuenta</p>
                      <dl>
                        <Fila label="Nombre"   valor={p.ejecutivo?.nombre} copiable={false} />
                        <Fila label="Correo"   valor={p.ejecutivo?.email} href={`mailto:${p.ejecutivo?.email}`} id="eEmail" copiado={copiado} onCopiar={onCopiar} />
                        <Fila label="Teléfono" valor={p.ejecutivo?.telefono} href={hrefTelefono(p.ejecutivo?.telefono)} id="eTel" copiado={copiado} onCopiar={onCopiar} />
                      </dl>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-xs text-slate-500">
                  Sin datos de contacto.{" "}
                  <button onClick={() => setEditandoFicha(true)} className="font-semibold text-purple-700 hover:underline underline-offset-2">Agregar contacto</button>
                </div>
              )}
            </Seccion>
          )}

          {/* Pagos en el flujo */}
          <Seccion titulo="Pagos en el flujo">
            {semanas.length ? (
              <ul className="divide-y divide-slate-100">
                {semanas.map(w => (
                  <li key={w.key} className="py-2 flex items-start gap-3">
                    <div className="w-32 flex-shrink-0">
                      <p className={`text-xs font-semibold ${w.isCurrentWeek ? "text-purple-700" : "text-slate-600"}`}>
                        {w.label}{w.isCurrentWeek && " · esta semana"}
                      </p>
                      <p className="text-[11px] text-slate-400">{w.dateRange}</p>
                    </div>
                    <div className="flex-1 min-w-0">
                      {w.nota && <p className="text-[11px] text-amber-700 leading-snug">{w.nota}</p>}
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className={`text-sm font-mono font-semibold ${w.pagado ? "text-slate-300 line-through" : "text-rose-600"}`}>{fmtCLP(w.monto)}</p>
                      {w.pagado && <p className="text-[11px] font-semibold text-emerald-600">Pagado</p>}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-slate-400">Esta cuenta no tiene montos en las semanas visibles.</p>
            )}
          </Seccion>

          {/* Notas del proveedor */}
          {p?.notas && (
            <Seccion titulo="Notas">
              <p className="text-sm text-slate-600 whitespace-pre-line leading-relaxed">{p.notas}</p>
            </Seccion>
          )}
        </div>

        {/* Footer */}
        <footer className="px-6 py-4 border-t border-slate-100 flex-shrink-0">
          <button onClick={() => onEditarCuenta(cuenta)}
            className="w-full py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition-colors">
            Editar cuenta
          </button>
        </footer>
      </aside>

      {editandoFicha && p && (
        <ModalProveedor empresaId={empresaId} proveedor={p}
          onClose={() => setEditandoFicha(false)} />
      )}
    </div>
  );
}
