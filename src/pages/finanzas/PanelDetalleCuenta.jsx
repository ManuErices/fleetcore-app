import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { textoTransferencia, hrefTelefono } from "../../lib/proveedores";
import SelectorProveedor from "./SelectorProveedor";
import ModalProveedor from "./ModalProveedor";
import {
  Cifra, Titulo, Resaltado, LineaGuia, Boton, VistoBueno,
  IconoCerrar, IconoCopiar, IconoExterno, casoOracion, casoTitulo,
} from "./cuaderno";

/*
 * Panel lateral con el detalle de una cuenta de egreso del flujo de caja:
 * cómo se paga, a quién contactar y qué montos tiene en las semanas
 * visibles. Los datos de pago y contacto viven en el maestro de
 * proveedores; la cuenta solo guarda `proveedorId`.
 *
 * Se ve como una tarjeta índice: papel claro, doble línea roja bajo el
 * título y renglones azules.
 *
 * Capas: este panel va en z-[65], sobre el modo ampliado del flujo (z-[60])
 * y bajo ModalCuenta (z-[70]) y ModalProveedor (z-[80]). Mientras alguno de
 * esos modales está abierto, el panel ignora Escape para no cerrarse por
 * debajo.
 *
 * Props:
 *  - empresaId
 *  - cuenta, proveedor (ficha resuelta o null), proveedores (lista del maestro)
 *  - weekColumns, payments, paymentsPaid, paymentNotas
 *  - bloqueado: true si hay un modal del flujo abierto encima
 *  - onClose(), onEditarCuenta(cuenta)
 *  - onVincularProveedor(cuentaId, proveedorId): async, lanza si falla
 */

const MEDIO_ETIQUETA = {
  transferencia: "por transferencia",
  web: "por portal web",
  automatico: "cargo automático",
};

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

// ─── Piezas ───────────────────────────────────────────────────────────────────
function Seccion({ titulo, extra, children }) {
  return (
    <section className="px-6 py-4 border-t border-cuaderno-azul first:border-t-0">
      <div className="flex items-center justify-between gap-3 mb-1">
        <Titulo as="h3" tamano="sm">{titulo}</Titulo>
        {extra}
      </div>
      {children}
    </section>
  );
}

function BotonCopiar({ id, texto, copiado, onCopiar, etiqueta }) {
  const hecho = copiado === id;
  return (
    <button type="button" onClick={() => onCopiar(id, texto)}
      aria-label={hecho ? "Copiado" : `Copiar ${etiqueta}`} title={hecho ? "Copiado" : "Copiar"}
      className={`w-11 h-11 rounded-md flex items-center justify-center flex-shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-cuaderno-tinta/40 ${
        hecho ? "text-cuaderno-verde" : "text-cuaderno-grafito hover:text-cuaderno-tinta hover:bg-cuaderno-hoja"}`}>
      {hecho ? <VistoBueno tamano={16} titulo="Copiado" /> : <IconoCopiar />}
    </button>
  );
}

// Renglón etiqueta / valor, con enlace opcional y botón de copiar
function Fila({ etiqueta, valor, href, copiable = true, id, copiado, onCopiar }) {
  if (!valor) return null;
  return (
    <div className="grid grid-cols-[7.5rem_1fr_2.75rem] items-center min-h-[44px] border-b border-cuaderno-azul">
      <dt className="text-[15px] text-cuaderno-grafito">{etiqueta}</dt>
      <dd className="m-0 min-w-0 text-[17px] truncate">
        {href
          ? <a href={href} className="text-cuaderno-tinta underline decoration-cuaderno-azul underline-offset-4 hover:decoration-cuaderno-tinta">{valor}</a>
          : valor}
      </dd>
      {copiable ? <BotonCopiar id={id} texto={valor} copiado={copiado} onCopiar={onCopiar} etiqueta={etiqueta.toLowerCase()} /> : <span />}
    </div>
  );
}

function Pendiente({ children, accion, onAccion }) {
  return (
    <p className="m-0 text-[16px] text-cuaderno-grafito">
      {children}{" "}
      <Boton variante="texto" className="min-h-0 text-[16px]" onClick={onAccion}>{accion}</Boton>
    </p>
  );
}

// ─── Panel ────────────────────────────────────────────────────────────────────
export default function PanelDetalleCuenta({
  empresaId, cuenta, proveedor, proveedores,
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
  const subtitulo = [casoOracion(cuenta.subcategoria), cuenta.detalle && cuenta.detalle.toLowerCase()].filter(Boolean).join(", ");
  const tieneContacto = p && (p.contacto?.email || p.contacto?.telefono || p.ejecutivo?.nombre || p.ejecutivo?.email || p.ejecutivo?.telefono);

  return (
    <div className="cuaderno fixed inset-0 z-[65]" role="presentation">
      {/* Fondo */}
      <div onClick={cerrar}
        className={`absolute inset-0 bg-cuaderno-tinta/25 backdrop-blur-[2px] transition-opacity duration-200 motion-reduce:transition-none ${visible ? "opacity-100" : "opacity-0"}`} />

      {/* Tarjeta */}
      <aside role="dialog" aria-modal="true" aria-labelledby="panel-cuenta-titulo"
        className={`absolute top-0 right-0 h-full w-full sm:w-[460px] bg-cuaderno-tarjeta border-l border-cuaderno-columna/70 flex flex-col transition-transform duration-200 ease-out motion-reduce:transition-none shadow-[-20px_0_40px_-20px_rgb(var(--cuaderno-tinta)/0.35)] ${visible ? "translate-x-0" : "translate-x-full"}`}>

        {/* Encabezado */}
        <header className="px-6 pt-5 pb-3 border-b-[3px] border-double border-cuaderno-margen flex-shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              {subtitulo && <p className="m-0 text-[15px] text-cuaderno-grafito truncate">{subtitulo}</p>}
              <Titulo as="h2" tamano="lg" id="panel-cuenta-titulo" className="break-words">{casoTitulo(cuenta.nombre)}</Titulo>
            </div>
            <Boton ref={botonCerrar} variante="icono" onClick={cerrar} aria-label="Cerrar detalle"><IconoCerrar /></Boton>
          </div>
        </header>

        {/* Resumen */}
        <div className="px-6 py-3 border-b border-cuaderno-azul flex-shrink-0">
          <LineaGuia etiqueta="Próximo pago" className="text-[18px]">
            {proximo ? <Cifra valor={proximo.monto} escala="pesos" /> : <span className="text-cuaderno-grafito">sin pendientes</span>}
          </LineaGuia>
          {proximo && <p className="m-0 -mt-1.5 text-right text-[14px] text-cuaderno-grafito">{proximo.label}, del {proximo.dateRange}</p>}
          <LineaGuia etiqueta="Total en el flujo" className="text-[18px]">
            <Cifra valor={totalFlujo} escala="pesos" vacio="$0" raya="doble" />
          </LineaGuia>
        </div>

        {/* Cuerpo */}
        <div className="flex-1 overflow-y-auto">

          {/* Proveedor */}
          <Seccion titulo="Proveedor"
            extra={p && !cambiando && (
              <div className="flex items-center gap-4">
                <Boton variante="texto" className="text-[16px] text-cuaderno-grafito" onClick={() => setCambiando(true)}>Cambiar</Boton>
                <Boton variante="texto" className="text-[16px]" onClick={() => setEditandoFicha(true)}>Editar ficha</Boton>
              </div>
            )}>
            {p && !cambiando ? (
              <div className="pb-1">
                <p className="m-0 text-[19px]">{p.razonSocial}</p>
                <p className="m-0 text-[15px] text-cuaderno-grafito">{p.rut ? `RUT ${p.rut}` : "Sin RUT"}</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {!p && (
                  <p className="m-0 text-[16px] text-cuaderno-grafito leading-snug">
                    Vincula un proveedor para tener a mano cómo pagarle y a quién contactar.
                  </p>
                )}
                <div className={vinculando ? "opacity-60 pointer-events-none" : ""}>
                  <SelectorProveedor empresaId={empresaId} proveedores={proveedores}
                    value={cambiando ? (cuenta.proveedorId || "") : ""}
                    onChange={id => vincular(id || "")}
                    nombreSugerido={casoTitulo(cuenta.nombre)}
                    autoFocus={cambiando} />
                </div>
                {cambiando && (
                  <Boton variante="texto" className="text-[16px] text-cuaderno-grafito" onClick={() => setCambiando(false)}>Cancelar</Boton>
                )}
              </div>
            )}
            {errorVincular && <p className="m-0 mt-2 text-[15px] text-cuaderno-roja">{errorVincular}</p>}
          </Seccion>

          {/* Cómo pagar */}
          {p && (
            <Seccion titulo="Cómo pagar"
              extra={p.medioPago && <Resaltado color="lavanda" className="text-[16px]">{MEDIO_ETIQUETA[p.medioPago]}</Resaltado>}>
              {p.medioPago === "transferencia" && (
                <>
                  <dl className="m-0">
                    <Fila etiqueta="Titular"        valor={t.titular || p.razonSocial} id="titular" copiado={copiado} onCopiar={onCopiar} />
                    <Fila etiqueta="RUT"            valor={t.rutTitular || p.rut} id="rut" copiado={copiado} onCopiar={onCopiar} />
                    <Fila etiqueta="Banco"          valor={t.banco} copiable={false} />
                    <Fila etiqueta="Tipo de cuenta" valor={t.tipoCuenta} copiable={false} />
                    <Fila etiqueta="N° de cuenta"   valor={t.numeroCuenta} id="numero" copiado={copiado} onCopiar={onCopiar} />
                    <Fila etiqueta="Comprobante a"  valor={t.emailComprobante} href={`mailto:${t.emailComprobante}`} id="emailComp" copiado={copiado} onCopiar={onCopiar} />
                  </dl>
                  <Boton variante={copiado === "todo" ? "secundario" : "primario"} className="w-full mt-4"
                    onClick={() => onCopiar("todo", textoTransferencia(p))}>
                    {copiado === "todo" ? <><VistoBueno tamano={16} titulo="" /> Datos copiados</> : <><IconoCopiar /> Copiar datos de transferencia</>}
                  </Boton>
                </>
              )}

              {p.medioPago === "web" && (
                <>
                  <dl className="m-0">
                    <Fila etiqueta="Portal" valor={(() => { try { return new URL(p.web?.url).hostname; } catch { return p.web?.url; } })()} copiable={false} />
                    <Fila etiqueta="N° de cliente" valor={p.web?.numeroCliente} id="cliente" copiado={copiado} onCopiar={onCopiar} />
                  </dl>
                  {p.web?.url && (
                    <a href={p.web.url} target="_blank" rel="noopener noreferrer"
                      className="mt-4 w-full min-h-[46px] rounded-md bg-cuaderno-tinta text-cuaderno-hoja text-[18px] flex items-center justify-center gap-2 hover:bg-cuaderno-tinta/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-cuaderno-tinta/40 focus-visible:ring-offset-2">
                      Ir a pagar <IconoExterno />
                    </a>
                  )}
                </>
              )}

              {p.medioPago === "automatico" && (
                <div className="py-1">
                  <p className="m-0 text-[17px]">Se carga en {p.automatico?.cargoEn}.</p>
                  <p className="m-0 text-[15px] text-cuaderno-grafito">No hay que pagarlo a mano. Revisa que el cargo aparezca en la cartola.</p>
                </div>
              )}

              {!p.medioPago && (
                <Pendiente accion="Agregar medio de pago" onAccion={() => setEditandoFicha(true)}>La ficha no tiene un medio de pago.</Pendiente>
              )}
            </Seccion>
          )}

          {/* Contacto */}
          {p && (
            <Seccion titulo="Contacto">
              {tieneContacto ? (
                <div className="space-y-3">
                  {(p.contacto?.email || p.contacto?.telefono) && (
                    <dl className="m-0">
                      <Fila etiqueta="Correo"   valor={p.contacto?.email} href={`mailto:${p.contacto?.email}`} id="cEmail" copiado={copiado} onCopiar={onCopiar} />
                      <Fila etiqueta="Teléfono" valor={p.contacto?.telefono} href={hrefTelefono(p.contacto?.telefono)} id="cTel" copiado={copiado} onCopiar={onCopiar} />
                    </dl>
                  )}
                  {(p.ejecutivo?.nombre || p.ejecutivo?.email || p.ejecutivo?.telefono) && (
                    <div>
                      <p className="m-0 text-[16px] underline decoration-cuaderno-azul underline-offset-[5px]">Ejecutivo de cuenta</p>
                      <dl className="m-0">
                        <Fila etiqueta="Nombre"   valor={p.ejecutivo?.nombre} copiable={false} />
                        <Fila etiqueta="Correo"   valor={p.ejecutivo?.email} href={`mailto:${p.ejecutivo?.email}`} id="eEmail" copiado={copiado} onCopiar={onCopiar} />
                        <Fila etiqueta="Teléfono" valor={p.ejecutivo?.telefono} href={hrefTelefono(p.ejecutivo?.telefono)} id="eTel" copiado={copiado} onCopiar={onCopiar} />
                      </dl>
                    </div>
                  )}
                </div>
              ) : (
                <Pendiente accion="Agregar contacto" onAccion={() => setEditandoFicha(true)}>Sin datos de contacto.</Pendiente>
              )}
            </Seccion>
          )}

          {/* Pagos en el flujo */}
          <Seccion titulo="Pagos en el flujo">
            {semanas.length ? (
              <ul className="m-0 p-0 list-none">
                {semanas.map(w => (
                  <li key={w.key} className={`grid grid-cols-[5.5rem_1fr_auto] items-center gap-2 min-h-[50px] border-b border-cuaderno-azul ${w.isCurrentWeek ? "bg-cuaderno-durazno/40 -mx-2 px-2" : ""}`}>
                    <div className="leading-tight">
                      <div className="text-[17px]">{w.label}</div>
                      <div className="text-[13px] text-cuaderno-grafito">{w.isCurrentWeek ? "esta semana" : w.dateRange}</div>
                    </div>
                    <div className="min-w-0">
                      {w.pagado && <Resaltado color="menta" className="text-[15px]">pagado</Resaltado>}
                      {w.nota && <p className="m-0 text-[14px] text-cuaderno-grafito leading-snug">* {w.nota}</p>}
                    </div>
                    <span className="inline-flex items-center gap-1 text-[17px]">
                      <Cifra valor={w.monto} escala="pesos" color={w.pagado ? "grafito" : "auto"} />
                      {w.pagado && <VistoBueno tamano={13} />}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="m-0 text-[16px] text-cuaderno-grafito">Esta cuenta no tiene montos en las semanas visibles.</p>
            )}
          </Seccion>

          {/* Notas del proveedor */}
          {p?.notas && (
            <Seccion titulo="Notas">
              <p className="m-0 text-[17px] text-cuaderno-tinta whitespace-pre-line leading-relaxed">{p.notas}</p>
            </Seccion>
          )}
        </div>

        {/* Pie */}
        <footer className="px-6 py-4 border-t border-cuaderno-azul flex-shrink-0">
          <Boton className="w-full" onClick={() => onEditarCuenta(cuenta)}>Editar cuenta</Boton>
        </footer>
      </aside>

      {editandoFicha && p && (
        <ModalProveedor empresaId={empresaId} proveedor={p}
          onClose={() => setEditandoFicha(false)} />
      )}
    </div>
  );
}
