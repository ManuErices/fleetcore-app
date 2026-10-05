/**
 * FinanzasBancos.jsx — lo que realmente pasó en el banco
 * ─────────────────────────────────────────────────────────────────────────────
 * La rutina del lunes: subir las cartolas del Banco de Chile y BICE (Excel) y
 * los certificados de las nóminas (PDF). El sistema no duplica lo ya subido,
 * verifica el saldo, abre cada nómina en sus pagos y asigna solo lo que ya
 * sabe a qué cuenta del flujo corresponde. Lo demás queda "por asignar",
 * agrupado por origen para resolverlo de una vez y que la próxima vez salga solo.
 */
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useEmpresa } from "../../lib/useEmpresa";
import { auth } from "../../lib/firebase";
import { leerCartola, verificarSaldos, reconstruirSaldos, numero, TIPOS } from "../../lib/banco/cartolas.js";
import { leerCertificadoPago, buscarRepeticiones } from "../../lib/banco/certificados.js";
import {
  cargarContexto, prepararCartola, guardarCartola, buscarLineaNomina, guardarNomina,
  cargarPorAsignar, agruparPorPatron, asignarGrupo, cargarSaldosBancos, cargarMovimientos,
} from "../../lib/banco/importacion.js";
import {
  Cifra, Titulo, Hoja, LineaGuia, Boton, Campo, Casilla, Nota, Resaltado, VistoBueno, FechaHoja,
  IconoSubir, IconoDocumento, IconoCerrar, casoTitulo,
} from "./cuaderno";

const NOMBRE_BANCO = { bancochile: "Banco de Chile", bice: "BICE" };
const POR_PAGINA = 12;

const fechaCorta = (iso) => {
  if (!iso) return "";
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(a, m - 1, d).toLocaleDateString("es-CL", { day: "numeric", month: "short" }).replace(".", "");
};
// Son cuentas de la propia empresa: se muestran completas, tal como las escribe el banco.
const cuentaCorta = (numero) => String(numero || "").trim();
const sumarDias = (iso, n) => { const f = new Date(iso); f.setDate(f.getDate() + n); return f.toISOString().slice(0, 10); };

// ─── Tarjeta de un archivo subido ─────────────────────────────────────────────
function TarjetaArchivo({ a, onQuitar, onSaldo }) {
  return (
    <li className="py-3 border-b border-cuaderno-renglon">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2 min-w-0">
          <IconoDocumento tamano={16} className="mt-1 text-cuaderno-grafito flex-shrink-0" />
          <div className="min-w-0">
            <p className="m-0 text-[17px] leading-tight truncate">{a.nombre}</p>
            {a.estado === "leyendo" && <p className="m-0 text-[14px] text-cuaderno-grafito">Leyendo…</p>}
            {a.estado === "guardado" && (
              <p className="m-0 flex items-center gap-1 text-[14px] text-cuaderno-verde"><VistoBueno tamano={12} titulo="" /> Guardado</p>
            )}
          </div>
        </div>
        {a.estado !== "guardado" && (
          <button onClick={onQuitar} aria-label={`Quitar ${a.nombre}`} title="Quitar"
            className="w-8 h-8 rounded-md flex items-center justify-center text-cuaderno-grafito hover:text-cuaderno-roja hover:bg-cuaderno-rosa/40 flex-shrink-0">
            <IconoCerrar tamano={13} />
          </button>
        )}
      </div>

      {a.estado === "error" && <Nota etiqueta="Ojo:" className="mt-1 ml-6">{a.error}</Nota>}

      {/* Cartola */}
      {a.tipo === "cartola" && a.cartola && a.estado !== "error" && (
        <div className="ml-6 mt-1 max-w-xl">
          <p className="m-0 text-[15px] text-cuaderno-grafito">
            {NOMBRE_BANCO[a.cartola.banco]}, cuenta {cuentaCorta(a.cartola.cuenta)} · del {fechaCorta(a.cartola.desde)} al {fechaCorta(a.cartola.hasta)} · {a.cartola.movimientos.length} movimientos
          </p>
          {a.preparada && (
            <>
              <LineaGuia etiqueta="Movimientos nuevos" className="text-[16px] min-h-[30px]"><span>{a.preparada.nuevos}</span></LineaGuia>
              {a.preparada.repetidos > 0 && (
                <LineaGuia etiqueta="Ya estaban subidos" className="text-[16px] min-h-[30px]"><span className="text-cuaderno-grafito">{a.preparada.repetidos}</span></LineaGuia>
              )}
              <LineaGuia etiqueta="Se asignan solos a una cuenta" className="text-[16px] min-h-[30px]">
                <span>{a.preparada.filas.filter(f => !f.yaImportado && f.sugerencia?.cuentaFlujoId).length}</span>
              </LineaGuia>
              <LineaGuia etiqueta="Traspasos entre tus cuentas" className="text-[16px] min-h-[30px]">
                <span className="text-cuaderno-grafito">{a.preparada.filas.filter(f => !f.yaImportado && f.tipo === "traspaso_interno").length}, no cuentan</span>
              </LineaGuia>
            </>
          )}
          {a.cartola.traeSaldo && !a.cartola.saldoReconstruido && (
            <LineaGuia etiqueta={`Saldo disponible al ${fechaCorta(a.cartola.fechaCorte)}`} className="text-[16px] min-h-[30px]">
              <Cifra valor={a.cartola.saldo.disponible} escala="pesos" color="tinta" vacio="$0" />
            </LineaGuia>
          )}
          {a.verificacion?.ok === true && (
            <p className="m-0 mt-1 flex items-center gap-1.5 text-[15px] text-cuaderno-verde">
              <VistoBueno tamano={13} titulo="" /> El saldo cuadra movimiento a movimiento: no falta ni sobra nada.
            </p>
          )}
          {a.verificacion?.ok === false && (
            <Nota etiqueta="Ojo:" className="mt-1">
              el saldo no cuadra en {a.verificacion.quiebres.length} punto{a.verificacion.quiebres.length > 1 ? "s" : ""} (el primero, el {fechaCorta(a.verificacion.quiebres[0].fecha)}). Puede faltar un movimiento en el archivo: revisa que la cartola esté completa.
            </Nota>
          )}
          {!a.cartola.traeSaldo && a.estado !== "guardado" && (
            <div className="mt-2">
              <Campo etiqueta="Saldo disponible hoy en BICE" inputMode="numeric" className="max-w-xs"
                value={a.saldoBice || ""} onChange={e => onSaldo(e.target.value)} placeholder="Como lo muestra la web del banco"
                ayuda="Esta cartola no trae saldo. Con esta cifra se calcula el saldo después de cada movimiento." />
            </div>
          )}
        </div>
      )}

      {/* Certificado de nómina */}
      {a.tipo === "certificado" && a.certificado && a.estado !== "error" && (
        <div className="ml-6 mt-1 max-w-xl">
          <p className="m-0 text-[15px] text-cuaderno-grafito">
            Nómina del {fechaCorta(a.certificado.fechas[0])} · {a.certificado.pagos.length} pagos a {new Set(a.certificado.pagos.map(p => p.rut)).size} beneficiarios
          </p>
          <LineaGuia etiqueta="Total pagado" className="text-[16px] min-h-[30px]">
            <Cifra valor={a.certificado.totalEfectuado} escala="pesos" color="tinta" vacio="$0" />
          </LineaGuia>
          {a.certificado.rechazados.length > 0 && (
            <Nota etiqueta="Ojo:">{a.certificado.rechazados.length} pagos no se efectuaron; quedan fuera.</Nota>
          )}
          {a.calce === "guardada" && (
            <p className="m-0 mt-1 flex items-center gap-1.5 text-[15px] text-cuaderno-verde">
              <VistoBueno tamano={13} titulo="" /> Calza con la línea de la cartola del {fechaCorta(a.lineaFecha)}: se abre en sus pagos.
            </p>
          )}
          {a.calce === "en_lote" && (
            <p className="m-0 mt-1 flex items-center gap-1.5 text-[15px] text-cuaderno-verde">
              <VistoBueno tamano={13} titulo="" /> Calza con la cartola que estás subiendo ({fechaCorta(a.lineaFecha)}).
            </p>
          )}
          {a.calce === "no" && (
            <Nota etiqueta="Ojo:" className="mt-1">no encontré su línea en las cartolas. Sube primero la cartola del Banco de Chile que incluye el {fechaCorta(a.certificado.fechas[0])}.</Nota>
          )}
          {a.hallazgos?.length > 0 && (
            <div className="mt-2">
              <p className="m-0 text-[15px]"><Resaltado color="durazno">Para revisar</Resaltado></p>
              <ul className="m-0 mt-1 pl-0 list-none space-y-1">
                {a.hallazgos.map((h, i) => (
                  <li key={i} className="text-[15px] leading-snug">
                    {h.tipo === "posible_duplicado"
                      ? <>{casoTitulo(h.pago.nombre)} recibió <Cifra valor={h.pago.monto} escala="pesos" color="heredar" /> en esta nómina y otra transferencia por el mismo monto el {fechaCorta(h.movimiento.fecha)}. ¿Pago duplicado?</>
                      : <>Hay una devolución por <Cifra valor={h.pago.monto} escala="pesos" color="heredar" /> el {fechaCorta(h.movimiento.fecha)}, el mismo monto pagado a {casoTitulo(h.pago.nombre)}. Probablemente un pago rebotado y vuelto a pagar.</>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

// ─── Grupo por asignar ────────────────────────────────────────────────────────
function GrupoPorAsignar({ grupo, cuentas, onAsignar }) {
  const [cuentaId, setCuentaId] = useState("");
  const [recordar, setRecordar] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const esNomina = grupo.tipo === "nomina_proveedores";
  const ingresos = cuentas.filter(c => c.categoria === "INGRESOS");
  const egresos = cuentas.filter(c => c.categoria !== "INGRESOS");

  const asignar = async () => {
    if (!cuentaId) return;
    setGuardando(true);
    try { await onAsignar(grupo, cuentaId === "__excluir" ? null : cuentaId, recordar); }
    finally { setGuardando(false); }
  };

  return (
    <li className="py-3 border-b border-cuaderno-renglon grid gap-x-6 gap-y-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] items-start">
      <div className="min-w-0">
        <div className="flex items-baseline justify-between gap-3">
          <p className="m-0 text-[17px] leading-tight truncate">{casoTitulo(grupo.patron.etiqueta)}</p>
          <Cifra valor={grupo.total} escala="pesos" vacio="$0" className="text-[16px] flex-shrink-0" />
        </div>
        <p className="m-0 text-[14px] text-cuaderno-grafito">
          {grupo.movimientos.length} movimiento{grupo.movimientos.length > 1 ? "s" : ""} · {(TIPOS[grupo.tipo] || "").toLowerCase()} · del {fechaCorta(grupo.movimientos[grupo.movimientos.length - 1].fecha)} al {fechaCorta(grupo.movimientos[0].fecha)}
          {grupo.patron.tipo === "rut" && ` · RUT ${grupo.patron.valor.slice(0, -1)}-${grupo.patron.valor.slice(-1)}`}
        </p>
      </div>
      {esNomina ? (
        <p className="m-0 text-[15px] text-cuaderno-grafito">Sube el certificado de esta nómina para repartirla en sus pagos.</p>
      ) : (
        <div className="flex flex-wrap items-end gap-3">
          <Campo as="select" etiqueta="Cuenta del flujo" className="flex-1 min-w-[12rem]"
            value={cuentaId} onChange={e => setCuentaId(e.target.value)}>
            <option value="">Elegir…</option>
            <optgroup label="Ingresos">
              {ingresos.map(c => <option key={c.id} value={c.id}>{casoTitulo(c.nombre)}</option>)}
            </optgroup>
            <optgroup label="Egresos">
              {egresos.map(c => <option key={c.id} value={c.id}>{casoTitulo(c.nombre)}{c.subcategoria ? ` (${casoTitulo(c.subcategoria)})` : ""}</option>)}
            </optgroup>
            <option value="__excluir">No va al flujo</option>
          </Campo>
          <Boton variante="primario" onClick={asignar} disabled={!cuentaId || guardando}>{guardando ? "Asignando…" : "Asignar"}</Boton>
          <Casilla marcada={recordar} onCambiar={setRecordar} className="basis-full">
            Recordar para las próximas cartolas
          </Casilla>
        </div>
      )}
    </li>
  );
}

// ─── Pantalla ─────────────────────────────────────────────────────────────────
export default function FinanzasBancos() {
  const { empresaId, empresa } = useEmpresa();
  const [ctx, setCtx] = useState(null);
  const [saldos, setSaldos] = useState({ cuentas: [], total: 0 });
  const [porAsignar, setPorAsignar] = useState([]);
  const [archivos, setArchivos] = useState([]);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState(null);
  const [mostrar, setMostrar] = useState(POR_PAGINA);
  const [cargando, setCargando] = useState(true);

  const datosEmpresa = useMemo(() => ({ rut: empresa?.rut || "", nombre: empresa?.nombre || empresa?.razonSocial || "" }), [empresa]);

  const recargar = useCallback(async () => {
    if (!empresaId) return;
    const [c, s, p] = await Promise.all([cargarContexto(empresaId), cargarSaldosBancos(empresaId), cargarPorAsignar(empresaId)]);
    setCtx(c); setSaldos(s); setPorAsignar(p); setCargando(false);
  }, [empresaId]);

  useEffect(() => { recargar(); }, [recargar]);

  const actualizar = (id, cambios) => setArchivos(prev => prev.map(a => a.id === id ? { ...a, ...cambios } : a));

  // Cartolas que se están subiendo en este lote, para calzar nóminas antes de guardar.
  const lineaEnLote = (cert, lista) => {
    for (const a of lista) {
      if (a.tipo !== "cartola" || !a.preparada) continue;
      const f = a.preparada.filas.find(m => m.tipo === "nomina_proveedores"
        && Math.round(m.cargo) === Math.round(cert.totalEfectuado)
        && m.fecha >= cert.fechas[0] && m.fecha <= sumarDias(cert.fechas[0], 3));
      if (f) return f;
    }
    return null;
  };

  const leerArchivos = async (lista) => {
    if (!ctx) return;
    setMensaje(null);
    const nuevos = [...lista].map(f => ({ id: `${f.name}-${f.size}-${f.lastModified}`, nombre: f.name, archivo: f, estado: "leyendo" }));
    setArchivos(prev => [...prev.filter(a => !nuevos.some(n => n.id === a.id)), ...nuevos]);

    // Primero las cartolas, después los certificados (que se calzan contra ellas).
    const orden = [...nuevos].sort((a, b) => (/\.pdf$/i.test(a.nombre) ? 1 : 0) - (/\.pdf$/i.test(b.nombre) ? 1 : 0));
    let acumulado = [...archivos.filter(a => !nuevos.some(n => n.id === a.id))];
    for (const a of orden) {
      try {
        const buffer = await a.archivo.arrayBuffer();
        if (/\.pdf$/i.test(a.nombre)) {
          const certificado = await leerCertificadoPago(buffer);
          const enLote = lineaEnLote(certificado, acumulado);
          const guardada = enLote ? null : await buscarLineaNomina(empresaId, certificado);
          const desde = sumarDias(certificado.fechas[0], -10), hasta = sumarDias(certificado.fechas[0], 10);
          const movsLote = acumulado.filter(x => x.preparada).flatMap(x => x.preparada.filas);
          const movsGuardados = await cargarMovimientos(empresaId, desde, hasta);
          const hallazgos = buscarRepeticiones(certificado, [...movsLote, ...movsGuardados.filter(m => !movsLote.some(l => l.id === m.id))]);
          const cambios = {
            tipo: "certificado", certificado, hallazgos, estado: "listo",
            calce: enLote ? "en_lote" : guardada ? "guardada" : "no",
            lineaFecha: (enLote || guardada)?.fecha,
          };
          actualizar(a.id, cambios);
          acumulado.push({ ...a, ...cambios });
        } else {
          const cartola = leerCartola(buffer);
          const preparada = await prepararCartola(empresaId, cartola, ctx, datosEmpresa);
          const cambios = { tipo: "cartola", cartola, preparada, verificacion: verificarSaldos(cartola), estado: "listo" };
          actualizar(a.id, cambios);
          acumulado.push({ ...a, ...cambios });
        }
      } catch (e) {
        console.error(e);
        actualizar(a.id, { estado: "error", error: e.message || "No se pudo leer el archivo." });
      }
    }
  };

  const guardarTodo = async () => {
    setGuardando(true); setMensaje(null);
    const usuario = auth?.currentUser?.email || "";
    let movs = 0, nominas = 0;
    try {
      for (const a of archivos.filter(x => x.estado === "listo" && x.tipo === "cartola")) {
        if (!a.cartola.traeSaldo && numero(a.saldoBice)) {
          reconstruirSaldos(a.cartola, numero(a.saldoBice));
          a.preparada.filas.forEach((f, i) => { f.saldo = a.cartola.movimientos[i].saldo; });
        }
        const r = await guardarCartola(empresaId, a.cartola, a.preparada, { archivo: a.nombre, usuario });
        movs += r.nuevos;
        actualizar(a.id, { estado: "guardado" });
      }
      const ctxNuevo = await cargarContexto(empresaId);
      for (const a of archivos.filter(x => x.estado === "listo" && x.tipo === "certificado")) {
        const linea = await buscarLineaNomina(empresaId, a.certificado);
        if (!linea) { actualizar(a.id, { calce: "no" }); continue; }
        if (linea.nominaAbierta) { actualizar(a.id, { estado: "guardado" }); continue; }   // ya estaba abierta
        await guardarNomina(empresaId, a.certificado, linea, ctxNuevo, { archivo: a.nombre, usuario });
        nominas++;
        actualizar(a.id, { estado: "guardado", calce: "guardada", lineaFecha: linea.fecha });
      }
      setMensaje({ ok: true, texto: `Listo: ${movs} movimientos nuevos${nominas ? ` y ${nominas} nómina${nominas > 1 ? "s" : ""} abierta${nominas > 1 ? "s" : ""}` : ""}.` });
      await recargar();
    } catch (e) {
      console.error(e);
      setMensaje({ ok: false, texto: "No se pudo guardar todo. Lo que alcanzó a guardarse no se duplica si vuelves a intentarlo." });
    } finally { setGuardando(false); }
  };

  const onAsignar = async (grupo, cuentaFlujoId, recordar) => {
    await asignarGrupo(empresaId, grupo, cuentaFlujoId, { recordar, usuario: auth?.currentUser?.email || "" });
    await recargar();
  };

  const grupos = useMemo(() => agruparPorPatron(porAsignar), [porAsignar]);
  const listos = archivos.filter(a => a.estado === "listo");
  const faltaSaldoBice = listos.some(a => a.tipo === "cartola" && !a.cartola.traeSaldo && !numero(a.saldoBice));

  return (
    <div className="cuaderno px-8 pt-5 pb-10 space-y-5">
      <FechaHoja />

      <header>
        <Titulo>Bancos</Titulo>
        <p className="m-0 text-[17px] text-cuaderno-grafito">Cartolas y nóminas: lo que de verdad pasó en cada cuenta.</p>
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] items-start">
        {/* Saldos */}
        <Hoja titulo="Saldos en el banco">
          {cargando ? (
            <p className="m-0 py-6 text-center text-[16px] text-cuaderno-grafito">Buscando…</p>
          ) : saldos.cuentas.length === 0 ? (
            <p className="m-0 py-6 text-center text-[16px] text-cuaderno-grafito">Sube la primera cartola para ver aquí el saldo de cada cuenta.</p>
          ) : (
            <>
              {saldos.cuentas.map(c => (
                <div key={c.id}>
                  <LineaGuia etiqueta={`${NOMBRE_BANCO[c.banco] || c.banco} ${cuentaCorta(c.numero)}`}>
                    <Cifra valor={c.saldoDisponible} escala="pesos" vacio="$0" />
                  </LineaGuia>
                  <p className="m-0 -mt-1 mb-1 text-right text-[13px] text-cuaderno-grafito">
                    al {fechaCorta(c.saldoAl)}{c.saldoReconstruido ? ", con el saldo que escribiste" : ""}
                    {c.lineaCredito > 0 && <>, línea de crédito <Cifra valor={c.lineaCredito} escala="pesos" color="heredar" /></>}
                  </p>
                </div>
              ))}
              <LineaGuia etiqueta="Total en bancos">
                <Cifra valor={saldos.total} escala="pesos" vacio="$0" raya="doble" />
              </LineaGuia>
            </>
          )}
        </Hoja>

        {/* Subir */}
        <Hoja titulo="Subir cartolas y nóminas">
          <label className="flex flex-col items-center justify-center gap-1.5 py-6 rounded-md border-[1.5px] border-dashed border-cuaderno-columna hover:border-cuaderno-tinta hover:bg-cuaderno-papel cursor-pointer text-center focus-within:ring-2 focus-within:ring-cuaderno-tinta/40">
            <IconoSubir tamano={24} className="text-cuaderno-grafito" />
            <span className="text-[18px]">Elige los archivos</span>
            <span className="text-[14px] text-cuaderno-grafito max-w-sm">
              Cartolas del Banco de Chile o BICE en Excel, y certificados de pago de nóminas en PDF. Puedes subir varios a la vez.
            </span>
            <input type="file" multiple accept=".xls,.xlsx,.pdf" className="sr-only" disabled={!ctx}
              onChange={e => { leerArchivos(e.target.files); e.target.value = ""; }} />
          </label>

          {archivos.length > 0 && (
            <ul className="m-0 mt-2 p-0 list-none">
              {archivos.map(a => (
                <TarjetaArchivo key={a.id} a={a}
                  onQuitar={() => setArchivos(prev => prev.filter(x => x.id !== a.id))}
                  onSaldo={v => actualizar(a.id, { saldoBice: v })} />
              ))}
            </ul>
          )}

          {mensaje && (mensaje.ok
            ? <p className="m-0 mt-3 flex items-center gap-2 text-[17px] text-cuaderno-verde"><VistoBueno tamano={15} titulo="" /> {mensaje.texto}</p>
            : <Nota etiqueta="Ojo:" className="mt-3">{mensaje.texto}</Nota>)}

          {listos.length > 0 && (
            <div className="flex flex-wrap items-center justify-end gap-3 mt-3">
              {faltaSaldoBice && <span className="text-[14px] text-cuaderno-grafito">Sin el saldo de BICE se guarda igual, pero no aparece en los saldos.</span>}
              <Boton variante="primario" onClick={guardarTodo} disabled={guardando || archivos.some(a => a.estado === "leyendo")}>
                {guardando ? "Guardando…" : `Guardar ${listos.length} archivo${listos.length > 1 ? "s" : ""}`}
              </Boton>
            </div>
          )}
        </Hoja>
      </div>

      {/* Por asignar */}
      <Hoja titulo="Por asignar a una cuenta del flujo"
        extra={grupos.length > 0 && <span className="text-[15px] text-cuaderno-grafito">{porAsignar.length} movimientos en {grupos.length} grupos</span>}>
        {cargando ? null : grupos.length === 0 && saldos.cuentas.length === 0 ? (
          <p className="m-0 py-6 text-center text-[16px] text-cuaderno-grafito">
            Cuando subas la primera cartola, aquí aparece lo que falta asignar a cada cuenta del flujo.
          </p>
        ) : grupos.length === 0 ? (
          <p className="m-0 py-6 flex items-center justify-center gap-2 text-[16px] text-cuaderno-verde">
            <VistoBueno tamano={15} titulo="" /> Todo asignado: lo real ya aparece en el flujo.
          </p>
        ) : (
          <>
            <p className="m-0 mb-1 text-[15px] text-cuaderno-grafito max-w-2xl">
              Agrupados por origen: al asignar un grupo se asignan todos sus movimientos, y si lo recuerdas, la próxima cartola lo hace sola.
            </p>
            <ul className="m-0 p-0 list-none">
              {grupos.slice(0, mostrar).map(g => (
                <GrupoPorAsignar key={g.clave} grupo={g} cuentas={ctx?.cuentas || []} onAsignar={onAsignar} />
              ))}
            </ul>
            {grupos.length > mostrar && (
              <div className="flex justify-center mt-3">
                <Boton onClick={() => setMostrar(m => m + POR_PAGINA)}>Ver {Math.min(POR_PAGINA, grupos.length - mostrar)} grupos más</Boton>
              </div>
            )}
          </>
        )}
      </Hoja>
    </div>
  );
}
