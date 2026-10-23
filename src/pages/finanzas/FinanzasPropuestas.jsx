/**
 * FinanzasPropuestas.jsx — "Propuestas"
 * ─────────────────────────────────────────────────────────────────────────────
 * Borradores del flujo de caja: se cambian montos, se mueven pagos, se agregan
 * cuentas o se ajusta el colchón SIN tocar el flujo original. Un administrador
 * la aprueba y recién ahí los cambios entran al flujo (en un solo lote).
 *
 * La comparación se ve como una corrección hecha a mano sobre el cuaderno: al
 * pasar de "Original" a "Propuesta", la curva de caja se redibuja, cada monto
 * corregido se tacha con un trazo y el nuevo aparece escrito encima.
 */
import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useEmpresa } from "../../lib/useEmpresa";
import { useUserRole } from "../../lib/useUserRole";
import { proyectar, fechaCorta } from "../../lib/finanzas/caja.js";
import { cargarDatosCaja } from "../../lib/finanzas/cajaDatos.js";
import {
  ESTADOS_PROPUESTA, esEditable, datosConPropuesta, listarCambios, compararProyecciones, cuentasNuevas,
} from "../../lib/finanzas/propuestas.js";
import {
  listarPropuestas, cargarPropuesta, crearPropuesta, proponerPartida, proponerMovimiento, quitarCambio,
  agregarCuentaNueva, quitarCuentaNueva, proponerColchon, cambiarEstado, aplicarPropuesta,
} from "../../lib/finanzas/propuestasDatos.js";
import {
  Cifra, Titulo, Hoja, LineaGuia, Boton, Campo, Segmentado, Nota, Resaltado, VistoBueno, FechaHoja,
  ModalCuaderno, IconoActualizar, IconoAnterior, IconoBorrar, IconoMas, casoTitulo, fmtEje,
} from "./cuaderno";

const esAdmin = (rol) => rol === "superadmin" || rol === "admin_contrato";
const pesosDe = (texto) => { const n = String(texto || "").replace(/\D/g, ""); return n ? parseInt(n, 10) : 0; };
const conPuntos = (texto) => { const n = pesosDe(texto); return n ? n.toLocaleString("es-CL") : ""; };
const fechaDe = (iso) => { const [a, m, d] = iso.split("-").map(Number); return new Date(a, m - 1, d); };
const lerp = (a, b, t) => a + (b - a) * t;
const COLOR_ESTADO = { borrador: "lavanda", en_revision: "durazno", aplicada: "menta", rechazada: "rosa", descartada: "rosa" };

// ─── Transición Original ⇄ Propuesta ──────────────────────────────────────────
// t = 0 es el original, t = 1 la propuesta. Los botones animan t con una curva
// suave; el deslizador lo fija a mano. Con "reducir movimiento" salta directo.
function useTransicion(inicial = 0) {
  const [t, setT] = useState(inicial);
  const anim = useRef(null);
  const tRef = useRef(inicial);
  tRef.current = t;

  const cancelar = () => { if (anim.current) cancelAnimationFrame(anim.current); anim.current = null; };

  const irA = useCallback((destino, duracion = 1100) => {
    cancelar();
    const reducir = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const desde = tRef.current;
    if (reducir || desde === destino) { setT(destino); return; }
    const inicio = performance.now();
    const paso = (ahora) => {
      const x = Math.min(1, (ahora - inicio) / (duracion * Math.abs(destino - desde)));
      const suave = x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
      setT(lerp(desde, destino, suave));
      if (x < 1) anim.current = requestAnimationFrame(paso);
    };
    anim.current = requestAnimationFrame(paso);
  }, []);

  const fijar = useCallback((valor) => { cancelar(); setT(valor); }, []);
  useEffect(() => cancelar, []);
  return { t, irA, fijar };
}

function ControlTransicion({ t, irA, fijar }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <Boton variante={t < 0.5 ? "primario" : "secundario"} onClick={() => irA(0)}>Original</Boton>
      <label className="flex-1 min-w-[10rem] flex flex-col gap-1">
        <span className="sr-only">Mezcla entre original y propuesta</span>
        <input type="range" min="0" max="1000" value={Math.round(t * 1000)} onChange={e => fijar(Number(e.target.value) / 1000)}
          className="deslizador-cuaderno w-full" aria-valuetext={`${Math.round(t * 100)}% propuesta`} />
        <span className="flex justify-between text-[13px] text-cuaderno-grafito"><span>lo que hay</span><span>lo que se propone</span></span>
      </label>
      <Boton variante={t >= 0.5 ? "primario" : "secundario"} onClick={() => irA(1)}>Propuesta</Boton>
    </div>
  );
}

// ─── Gráfico que se redibuja ──────────────────────────────────────────────────
// El original queda como un trazo a lápiz (grafito, punteado). La línea en
// tinta se mueve desde el original hacia la propuesta según t. Entre ambas,
// un resaltador menta donde la propuesta mejora la caja y rosa donde la empeora.
function GraficoComparacion({ cmp, colchonOriginal, colchonPropuesta, t, height = 230, ancho = 720 }) {
  const PAD_L = 56, PAD_R = 14, PAD_T = 16, PAD_B = 30;
  const chartW = ancho - PAD_L - PAD_R, chartH = height - PAD_T - PAD_B;
  const orig = cmp.semanas.map(s => s.original);
  const prop = cmp.semanas.map(s => s.propuesta);
  const todos = [...orig, ...prop, colchonOriginal, colchonPropuesta, 0];
  const maxV = Math.max(...todos, 1), minV = Math.min(...todos);
  const rango = maxV - minV || 1;
  const n = orig.length;
  const toX = (i) => PAD_L + (i / Math.max(n - 1, 1)) * chartW;
  const toY = (v) => PAD_T + chartH - ((v - minV) / rango) * chartH;
  const actual = orig.map((v, i) => lerp(v, prop[i], t));
  const colchon = lerp(colchonOriginal, colchonPropuesta, t);
  const ticks = Array.from({ length: 4 }, (_, i) => minV + i * ((maxV - minV) / 3));
  const linea = (vals) => vals.map((v, i) => `${toX(i)},${toY(v)}`).join(" ");

  // Franjas entre el original y la línea actual, por tramo, según si sube o baja.
  const franjas = [];
  for (let i = 0; i < n - 1; i++) {
    const subeA = actual[i] - orig[i], subeB = actual[i + 1] - orig[i + 1];
    if (Math.abs(subeA) < 1 && Math.abs(subeB) < 1) continue;
    const puntos = `${toX(i)},${toY(orig[i])} ${toX(i + 1)},${toY(orig[i + 1])} ${toX(i + 1)},${toY(actual[i + 1])} ${toX(i)},${toY(actual[i])}`;
    franjas.push(<polygon key={i} points={puntos} fill={`rgb(var(--cuaderno-${subeA + subeB >= 0 ? "menta" : "rosa"}))`} opacity={0.85} />);
  }

  return (
    <svg viewBox={`0 0 ${ancho} ${height}`} className="w-full" style={{ height: "auto", maxHeight: height, display: "block" }} role="img"
      aria-label={`Saldo semanal: original y propuesta, mostrando ${Math.round(t * 100)}% de la propuesta`}>
      {ticks.map((v, i) => (
        <g key={i}>
          <line x1={PAD_L} y1={toY(v)} x2={ancho - PAD_R} y2={toY(v)}
            stroke={i === 0 ? "rgb(var(--cuaderno-tinta))" : "rgb(var(--cuaderno-renglon))"} strokeWidth={i === 0 ? 1.2 : 1} strokeDasharray={i === 0 ? undefined : "3 4"} />
          <text x={PAD_L - 6} y={toY(v) + 4} textAnchor="end" fontSize="12" fill="rgb(var(--cuaderno-grafito))">{fmtEje(v)}</text>
        </g>
      ))}
      {minV < 0 && <line x1={PAD_L} y1={toY(0)} x2={ancho - PAD_R} y2={toY(0)} stroke="rgb(var(--cuaderno-margen))" strokeWidth="1" />}
      {franjas}
      <line x1={PAD_L} y1={toY(colchon)} x2={ancho - PAD_R} y2={toY(colchon)} stroke="rgb(var(--cuaderno-roja))" strokeWidth="1.2" strokeDasharray="6 4" />
      <text x={ancho - PAD_R} y={toY(colchon) - 5} textAnchor="end" fontSize="12" fill="rgb(var(--cuaderno-roja))">colchón</text>
      <polyline points={linea(orig)} fill="none" stroke="rgb(var(--cuaderno-grafito))" strokeWidth="1.4" strokeDasharray="2 4" strokeLinecap="round" opacity={0.35 + 0.65 * t} />
      <polyline points={linea(actual)} fill="none" stroke="rgb(var(--cuaderno-tinta))" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {actual.map((v, i) => {
        const bajo = v < colchon;
        return (
          <g key={i}>
            <circle cx={toX(i)} cy={toY(v)} r={bajo ? 4.6 : 3.6}
              fill={bajo ? "rgb(var(--cuaderno-durazno))" : "rgb(var(--cuaderno-hoja))"}
              stroke={bajo ? "rgb(var(--cuaderno-roja))" : "rgb(var(--cuaderno-tinta))"} strokeWidth="1.6" />
            <text x={toX(i)} y={PAD_T + chartH + 20} textAnchor="middle" fontSize="13" fill="rgb(var(--cuaderno-tinta))">{cmp.semanas[i].etiqueta}</text>
          </g>
        );
      })}
    </svg>
  );
}

// ─── Corrección a mano ────────────────────────────────────────────────────────
// El monto original se tacha con un trazo rojo que avanza con t, y el nuevo se
// "escribe" encima, revelándose de izquierda a derecha.
function Correccion({ original, propuesto, t }) {
  // Si antes no había monto, no hay nada que tachar: solo se escribe el nuevo.
  const avanceTachado = original ? Math.min(1, t * 1.6) : 0;
  const avanceEscrito = Math.max(0, Math.min(1, (t - 0.35) / 0.65));
  return (
    <span className="relative inline-flex flex-col items-end pt-[1.15em] min-w-[7.5rem]">
      <span className="absolute top-0 right-0 text-cuaderno-roja -rotate-2 origin-right"
        style={{ clipPath: `inset(0 ${(1 - avanceEscrito) * 100}% 0 0)` }} aria-hidden={avanceEscrito < 0.5}>
        {propuesto ? <Cifra valor={propuesto} escala="pesos" color="heredar" /> : <span>sin monto</span>}
      </span>
      <span className="relative">
        {original ? <Cifra valor={original} escala="pesos" color={t > 0.5 ? "grafito" : "auto"} /> : <span className="text-cuaderno-grafito">—</span>}
        {!!original && <svg aria-hidden="true" className="absolute inset-0 w-full h-full overflow-visible pointer-events-none" viewBox="0 0 100 20" preserveAspectRatio="none">
          <path d="M-2 13 C 25 9, 60 12, 102 7" fill="none" stroke="rgb(var(--cuaderno-roja))" strokeWidth="2.2"
            strokeLinecap="round" pathLength="1" strokeDasharray="1" strokeDashoffset={1 - avanceTachado} vectorEffect="non-scaling-stroke" />
        </svg>}
      </span>
    </span>
  );
}

// ─── Agregar cambios a la propuesta ───────────────────────────────────────────
function FormularioCambio({ datos, propuesta, semanas, empresaId, onCambio }) {
  const [tipo, setTipo] = useState("monto");
  const [cuentaId, setCuentaId] = useState("");
  const [semana, setSemana] = useState(semanas[1]?.key || semanas[0]?.key);
  const [hasta, setHasta] = useState(semanas[2]?.key || semanas[0]?.key);
  const [monto, setMonto] = useState("");
  const [nueva, setNueva] = useState({ nombre: "", categoria: "EGRESOS", recurrente: "" });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  const cuentas = useMemo(() => {
    const todas = [...datos.cuentas, ...cuentasNuevas(propuesta)];
    return {
      INGRESOS: todas.filter(c => c.categoria === "INGRESOS").sort((a, b) => a.nombre.localeCompare(b.nombre)),
      EGRESOS: todas.filter(c => c.categoria !== "INGRESOS").sort((a, b) => a.nombre.localeCompare(b.nombre)),
    };
  }, [datos.cuentas, propuesta]);

  const guardar = async () => {
    setError(""); setGuardando(true);
    try {
      if (tipo === "monto") {
        if (!cuentaId) throw new Error("Elige la cuenta.");
        await proponerPartida(empresaId, propuesta, datos, { cuentaId, lunes: semana, monto: pesosDe(monto) });
      } else if (tipo === "mover") {
        if (!cuentaId) throw new Error("Elige la cuenta.");
        await proponerMovimiento(empresaId, propuesta, datos, { cuentaId, desde: semana, hasta });
      } else if (tipo === "cuenta") {
        const id = await agregarCuentaNueva(empresaId, propuesta, { ...nueva, montoRecurrente: pesosDe(nueva.recurrente) });
        if (pesosDe(monto)) {
          const actualizada = await cargarPropuesta(empresaId, propuesta.id);
          await proponerPartida(empresaId, actualizada, datos, { cuentaId: id, lunes: semana, monto: pesosDe(monto) });
        }
        setNueva({ nombre: "", categoria: "EGRESOS", recurrente: "" });
      } else if (tipo === "colchon") {
        await proponerColchon(empresaId, propuesta, pesosDe(monto));
      }
      setMonto("");
      await onCambio();
    } catch (e) { setError(e.message); }
    finally { setGuardando(false); }
  };

  const selectorCuenta = (
    <Campo as="select" etiqueta="Cuenta" className="flex-1 min-w-[14rem]" value={cuentaId} onChange={e => setCuentaId(e.target.value)}>
      <option value="">Elige una cuenta…</option>
      {["INGRESOS", "EGRESOS"].map(cat => (
        <optgroup key={cat} label={cat === "INGRESOS" ? "Ingresos" : "Egresos"}>
          {cuentas[cat].map(c => <option key={c.id} value={c.id}>{casoTitulo(c.nombre)}{c.esNueva ? " (nueva)" : ""}</option>)}
        </optgroup>
      ))}
    </Campo>
  );
  const selectorSemana = (valor, set, etiqueta = "Semana") => (
    <Campo as="select" etiqueta={etiqueta} className="w-56" value={valor} onChange={e => set(e.target.value)}>
      {semanas.map(w => <option key={w.key} value={w.key}>{w.etiqueta}, {w.rango}</option>)}
    </Campo>
  );

  return (
    <div className="space-y-4">
      <Segmentado valor={tipo} onCambiar={setTipo} opciones={[
        { id: "monto", label: "Cambiar un monto" }, { id: "mover", label: "Mover un pago" },
        { id: "cuenta", label: "Cuenta nueva" }, { id: "colchon", label: "Colchón" },
      ]} />
      <div className="flex flex-wrap items-end gap-4">
        {tipo === "monto" && <>{selectorCuenta}{selectorSemana(semana, setSemana)}
          <Campo etiqueta="Monto propuesto" inputMode="numeric" className="w-44" value={monto} onChange={e => setMonto(conPuntos(e.target.value))} placeholder="0 para quitarlo" /></>}
        {tipo === "mover" && <>{selectorCuenta}{selectorSemana(semana, setSemana, "Desde")}{selectorSemana(hasta, setHasta, "Hasta")}</>}
        {tipo === "cuenta" && <>
          <Campo etiqueta="Nombre" className="flex-1 min-w-[12rem]" value={nueva.nombre} onChange={e => setNueva(n => ({ ...n, nombre: e.target.value }))} />
          <Segmentado valor={nueva.categoria} onCambiar={v => setNueva(n => ({ ...n, categoria: v }))}
            opciones={[{ id: "INGRESOS", label: "Ingreso" }, { id: "EGRESOS", label: "Egreso" }]} />
          <Campo etiqueta="Mensual (opcional)" inputMode="numeric" className="w-40" value={nueva.recurrente} onChange={e => setNueva(n => ({ ...n, recurrente: conPuntos(e.target.value) }))} />
          {selectorSemana(semana, setSemana, "Primera partida")}
          <Campo etiqueta="Monto (opcional)" inputMode="numeric" className="w-40" value={monto} onChange={e => setMonto(conPuntos(e.target.value))} />
        </>}
        {tipo === "colchon" && <>
          <Campo etiqueta="Colchón propuesto" inputMode="numeric" className="w-48" value={monto} onChange={e => setMonto(conPuntos(e.target.value))}
            placeholder={conPuntos(datos.colchon)} />
          {typeof propuesta.cambios?.colchon === "number" && (
            <Boton variante="texto" onClick={async () => { await proponerColchon(empresaId, propuesta, null); await onCambio(); }}>volver al actual</Boton>
          )}
        </>}
        <Boton variante="primario" onClick={guardar} disabled={guardando}><IconoMas tamano={15} /> Anotar en la propuesta</Boton>
      </div>
      {error && <Nota etiqueta="Ojo:">{error}</Nota>}
      <p className="m-0 text-[14px] text-cuaderno-grafito">Nada de esto cambia el flujo de caja hasta que un administrador apruebe la propuesta.</p>
    </div>
  );
}

// ─── Detalle de una propuesta ─────────────────────────────────────────────────
function DetallePropuesta({ id, empresaId, rol, onVolver }) {
  const [datos, setDatos] = useState(null);
  const [propuesta, setPropuesta] = useState(null);
  const [error, setError] = useState("");
  const [modal, setModal] = useState(null); // "aprobar" | "rechazar" | "descartar"
  const [comentario, setComentario] = useState("");
  const [trabajando, setTrabajando] = useState(false);
  const { t, irA, fijar } = useTransicion(0);
  const hoy = useMemo(() => new Date(), []);
  const primeraVez = useRef(true);

  const cargar = useCallback(async () => {
    try {
      const [d, p] = await Promise.all([cargarDatosCaja(empresaId, hoy), cargarPropuesta(empresaId, id)]);
      setDatos(d); setPropuesta(p); setError("");
    } catch (e) { setError(e.message); }
  }, [empresaId, id, hoy]);
  useEffect(() => { cargar(); }, [cargar]);

  const proyOrig = useMemo(() => datos && proyectar({ ...datos, hoy }), [datos, hoy]);
  const datosProp = useMemo(() => datos && propuesta && datosConPropuesta(datos, propuesta), [datos, propuesta]);
  const proyProp = useMemo(() => datosProp && proyectar({ ...datosProp, hoy }), [datosProp, hoy]);
  const cmp = useMemo(() => proyOrig && proyProp && compararProyecciones(proyOrig, proyProp), [proyOrig, proyProp]);
  const cambios = useMemo(() => (datos && propuesta ? listarCambios(datos, propuesta) : []), [datos, propuesta]);
  const conflictos = cambios.filter(c => c.conflicto);

  // Al abrir, mostrar primero el original y "corregirlo" solo: así se entiende de un vistazo.
  useEffect(() => {
    if (cmp && primeraVez.current) { primeraVez.current = false; setTimeout(() => irA(1, 1600), 450); }
  }, [cmp, irA]);

  if (error) return <div className="cuaderno px-8 pt-10 space-y-4"><Nota etiqueta="Ojo:">{error}</Nota><Boton onClick={onVolver}><IconoAnterior tamano={15} /> Volver</Boton></div>;
  if (!cmp) return <div className="cuaderno flex items-center justify-center h-64 text-[18px] text-cuaderno-grafito">Abriendo la propuesta…</div>;

  const editable = esEditable(propuesta);
  const admin = esAdmin(rol);
  const estado = ESTADOS_PROPUESTA[propuesta.estado] || ESTADOS_PROPUESTA.borrador;
  const colchonProp = typeof propuesta.cambios?.colchon === "number" ? propuesta.cambios.colchon : datos.colchon;
  const v = (a, b) => lerp(a, b, t);

  const accion = async (fn) => {
    setTrabajando(true);
    try { await fn(); setModal(null); setComentario(""); await cargar(); }
    catch (e) { setError(e.message); }
    finally { setTrabajando(false); }
  };

  return (
    <div className="cuaderno px-4 sm:px-8 pt-5 pb-10 space-y-5">
      <FechaHoja />
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <Boton variante="texto" onClick={onVolver}><IconoAnterior tamano={15} /> Propuestas</Boton>
          <Titulo>{propuesta.nombre}</Titulo>
          <p className="m-0 text-[16px] text-cuaderno-grafito">
            <Resaltado color={COLOR_ESTADO[propuesta.estado]}>{estado.label}</Resaltado>{" "}
            {propuesta.creadaPor && <>de {propuesta.creadaPor}</>}
            {propuesta.aprobadaPor && <>, aprobada por {propuesta.aprobadaPor}</>}
            {propuesta.cerradaPor && <>, cerrada por {propuesta.cerradaPor}</>}
          </p>
          {propuesta.motivo && <p className="m-0 mt-1 text-[17px] max-w-3xl">{propuesta.motivo}</p>}
          {propuesta.comentarioCierre && <Nota etiqueta="Comentario:" tono="grafito" className="mt-1">{propuesta.comentarioCierre}</Nota>}
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <Boton onClick={cargar}><IconoActualizar tamano={15} /> Actualizar</Boton>
          {editable && propuesta.estado === "borrador" && (
            <Boton disabled={!cambios.length && typeof propuesta.cambios?.colchon !== "number"}
              onClick={() => accion(() => cambiarEstado(empresaId, propuesta, "en_revision"))}>Enviar a revisión</Boton>
          )}
          {editable && <Boton variante="texto" onClick={() => setModal("descartar")}>Descartar</Boton>}
          {editable && admin && <Boton variante="texto" onClick={() => setModal("rechazar")}>Rechazar</Boton>}
          {editable && admin && <Boton variante="primario" onClick={() => setModal("aprobar")}>Aprobar y aplicar</Boton>}
        </div>
      </header>

      {conflictos.length > 0 && editable && (
        <Nota etiqueta="Ojo:">
          {conflictos.length === 1 ? "una partida cambió" : `${conflictos.length} partidas cambiaron`} en el flujo después de proponerla. Revisa las marcadas antes de aprobar: la propuesta las reemplazaría.
        </Nota>
      )}

      {/* Comparador */}
      <Hoja titulo="Original y propuesta" extra={<span className="text-[14px] text-cuaderno-grafito">saldo al cerrar cada semana</span>}>
        <ControlTransicion t={t} irA={irA} fijar={fijar} />
        <div className="mt-3 grid gap-5 lg:grid-cols-[minmax(0,8fr)_minmax(0,4fr)] items-start">
          <GraficoComparacion cmp={cmp} colchonOriginal={datos.colchon} colchonPropuesta={colchonProp} t={t} />
          <div>
            <LineaGuia etiqueta="Semana más baja"><Cifra valor={v(cmp.minimoOriginal, cmp.minimoPropuesta)} escala="pesos" vacio="$0" /></LineaGuia>
            <LineaGuia etiqueta={v(cmp.deficitOriginal, cmp.deficitPropuesta) > 0 ? "Falta para el colchón" : "Se puede pagar de más"}>
              {v(cmp.deficitOriginal, cmp.deficitPropuesta) > 0
                ? <Cifra valor={-v(cmp.deficitOriginal, cmp.deficitPropuesta)} escala="pesos" />
                : <Cifra valor={v(cmp.disponibleOriginal, cmp.disponiblePropuesta)} escala="pesos" color="verde" vacio="$0" />}
            </LineaGuia>
            <LineaGuia etiqueta="Semanas bajo el colchón">
              <span>{Math.round(v(cmp.semanasBajoOriginal, cmp.semanasBajoPropuesta))}</span>
            </LineaGuia>
            <LineaGuia etiqueta="Caja en 13 semanas"><Cifra valor={v(cmp.cierreOriginal, cmp.cierrePropuesta)} escala="pesos" vacio="$0" raya="doble" /></LineaGuia>
            {t > 0.98 && (
              <p className={`m-0 mt-2 text-[16px] ${cmp.minimoPropuesta >= cmp.minimoOriginal ? "text-cuaderno-verde" : "text-cuaderno-roja"}`}>
                {cmp.minimoPropuesta === cmp.minimoOriginal
                  ? "La semana más baja queda igual."
                  : <>La semana más baja {cmp.minimoPropuesta > cmp.minimoOriginal ? "mejora" : "empeora"} en <Cifra valor={Math.abs(cmp.minimoPropuesta - cmp.minimoOriginal)} escala="pesos" color="heredar" />.</>}
              </p>
            )}
          </div>
        </div>
      </Hoja>

      {/* Correcciones */}
      <Hoja titulo="Correcciones" extra={<span className="text-[14px] text-cuaderno-grafito">{cambios.length} {cambios.length === 1 ? "partida" : "partidas"}{typeof propuesta.cambios?.colchon === "number" ? " y el colchón" : ""}</span>}>
        {cambios.length === 0 && typeof propuesta.cambios?.colchon !== "number" ? (
          <p className="m-0 py-3 text-[16px] text-cuaderno-grafito">Todavía no hay cambios. Anótalos abajo o pídeselos al asistente.</p>
        ) : (
          <ul className="m-0 p-0 list-none">
            {typeof propuesta.cambios?.colchon === "number" && (
              <li className="flex flex-wrap items-end gap-x-3 gap-y-1 py-2 border-b border-cuaderno-renglon">
                <span className="flex-1 min-w-[12rem] text-[17px]">Colchón mínimo</span>
                <Correccion original={datos.colchon} propuesto={propuesta.cambios.colchon} t={t} />
                <span className="w-10" />
              </li>
            )}
            {cambios.map(c => (
              <li key={c.key} className="flex flex-wrap items-end gap-x-3 gap-y-1 py-2 border-b border-cuaderno-renglon">
                <div className="flex-1 min-w-[12rem]">
                  <p className="m-0 text-[17px] leading-tight">
                    {casoTitulo(c.cuenta)}
                    {c.cuentaNueva && <Resaltado color="lavanda" className="ml-2 text-[13px]">nueva</Resaltado>}
                  </p>
                  <p className="m-0 text-[13px] text-cuaderno-grafito">
                    semana del {fechaCorta(fechaDe(c.semana))}
                    {c.conflicto && <span className="text-cuaderno-roja"> · cambió en el flujo (antes {fmtEje(c.antes)})</span>}
                  </p>
                </div>
                <span className="w-24 text-right text-[14px]" style={{ opacity: t }}>
                  {c.diferencia !== 0 && <Cifra valor={c.diferencia} escala="pesos" parentesis={false} color={c.diferencia > 0 ? "verde" : "roja"} />}
                </span>
                <Correccion original={c.original} propuesto={c.propuesto} t={t} />
                {editable ? (
                  <Boton variante="icono" className="w-10 h-10 border-cuaderno-columna" aria-label={`Quitar ${c.cuenta} de la propuesta`}
                    onClick={() => accion(() => (c.cuentaNueva && cambios.filter(x => x.cuentaId === c.cuentaId).length === 1
                      ? quitarCuentaNueva(empresaId, propuesta, c.cuentaId)
                      : quitarCambio(empresaId, propuesta, c.key)))}>
                    <IconoBorrar tamano={15} />
                  </Boton>
                ) : <span className="w-10" />}
              </li>
            ))}
          </ul>
        )}
      </Hoja>

      {editable && (
        <Hoja titulo="Anotar un cambio">
          <FormularioCambio datos={datos} propuesta={propuesta} semanas={proyOrig.semanas} empresaId={empresaId} onCambio={cargar} />
        </Hoja>
      )}

      {/* Semana a semana */}
      <Hoja titulo="Semana a semana">
        <div className="overflow-x-auto -mx-2 px-2">
        <table className="w-full min-w-[30rem] border-collapse">
          <thead>
            <tr className="shadow-[inset_0_-1.5px_0_rgb(var(--cuaderno-tinta))]">
              {["Semana", "Original", "Propuesta", "Diferencia"].map((h, i) => (
                <th key={h} className={`font-normal text-[14px] text-cuaderno-grafito py-1.5 ${i === 0 ? "text-left" : "text-right"}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cmp.semanas.map(s => (
              <tr key={s.key} className="border-b border-cuaderno-renglon">
                <td className="py-1.5 text-[15px]">{s.etiqueta} <span className="text-cuaderno-grafito text-[13px]">{s.rango}</span></td>
                <td className="py-1.5 text-right text-[15px]">{s.bajoOriginal
                  ? <Resaltado color="rosa"><Cifra valor={s.original} escala="pesos" color="heredar" vacio="$0" /></Resaltado>
                  : <Cifra valor={s.original} escala="pesos" vacio="$0" />}</td>
                <td className="py-1.5 text-right text-[15px]">{s.bajoPropuesta
                  ? <Resaltado color="rosa"><Cifra valor={s.propuesta} escala="pesos" color="heredar" vacio="$0" /></Resaltado>
                  : <Cifra valor={s.propuesta} escala="pesos" vacio="$0" />}</td>
                <td className="py-1.5 text-right text-[15px]">
                  <Cifra valor={s.diferencia} escala="pesos" parentesis={false} color={s.diferencia > 0 ? "verde" : s.diferencia < 0 ? "roja" : "grafito"} vacio="—" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </Hoja>

      {modal && (
        <ModalCuaderno
          titulo={modal === "aprobar" ? "Aprobar y aplicar" : modal === "rechazar" ? "Rechazar la propuesta" : "Descartar la propuesta"}
          subtitulo={propuesta.nombre} onClose={() => setModal(null)} bloqueado={trabajando}
          pie={<div className="flex gap-2">
            <Boton className="flex-1" onClick={() => setModal(null)} disabled={trabajando}>Cancelar</Boton>
            <Boton variante="primario" className="flex-1" disabled={trabajando}
              onClick={() => accion(() => (modal === "aprobar"
                ? aplicarPropuesta(empresaId, propuesta, comentario)
                : cambiarEstado(empresaId, propuesta, modal === "rechazar" ? "rechazada" : "descartada", comentario)))}>
              {trabajando ? "Guardando…" : modal === "aprobar" ? "Aprobar" : modal === "rechazar" ? "Rechazar" : "Descartar"}
            </Boton>
          </div>}>
          {modal === "aprobar" ? (
            <>
              <p className="m-0 text-[17px]">
                Se escriben en el flujo de caja {cambios.length} {cambios.length === 1 ? "partida" : "partidas"}
                {cuentasNuevas(propuesta).length ? ` y ${cuentasNuevas(propuesta).length} cuenta(s) nueva(s)` : ""}
                {typeof propuesta.cambios?.colchon === "number" ? ", y el colchón nuevo" : ""}, todo junto.
              </p>
              <LineaGuia etiqueta="Semana más baja pasa de"><span className="inline-flex gap-2"><Cifra valor={cmp.minimoOriginal} escala="pesos" vacio="$0" /> a <Cifra valor={cmp.minimoPropuesta} escala="pesos" vacio="$0" /></span></LineaGuia>
              {conflictos.length > 0 && <Nota etiqueta="Ojo:">{conflictos.length} partida(s) cambiaron en el flujo después de proponerse; se reemplazarán por lo propuesto.</Nota>}
            </>
          ) : (
            <p className="m-0 text-[17px]">El flujo de caja no cambia. La propuesta queda en el historial.</p>
          )}
          <Campo as="textarea" rows={3} etiqueta="Comentario (opcional)" value={comentario} onChange={e => setComentario(e.target.value)} />
        </ModalCuaderno>
      )}
    </div>
  );
}

// ─── Lista ────────────────────────────────────────────────────────────────────
export default function FinanzasPropuestas() {
  const { empresaId } = useEmpresa();
  const { role } = useUserRole();
  const [lista, setLista] = useState(null);
  const [abierta, setAbierta] = useState(() => {
    // El asistente puede pedir abrir una propuesta puntual.
    try {
      const id = sessionStorage.getItem("agenteIA:propuestaFlujo");
      sessionStorage.removeItem("agenteIA:propuestaFlujo");
      return id || null;
    } catch { return null; }
  });
  // "Proponer cambios" (flujo de caja) y "Armar una propuesta" (La semana)
  // llegan aquí con el formulario de propuesta nueva ya abierto.
  const [modalNueva, setModalNueva] = useState(() => {
    try {
      const pedida = sessionStorage.getItem("finanzas:nuevaPropuesta") === "1";
      sessionStorage.removeItem("finanzas:nuevaPropuesta");
      return pedida;
    } catch { return false; }
  });
  const [nueva, setNueva] = useState({ nombre: "", motivo: "" });
  const [error, setError] = useState("");

  const cargar = useCallback(async () => {
    if (!empresaId) return;
    try { setLista(await listarPropuestas(empresaId)); } catch (e) { setError(e.message); }
  }, [empresaId]);
  useEffect(() => { cargar(); }, [cargar]);

  useEffect(() => {
    const alPedir = (e) => setAbierta(e.detail);
    window.addEventListener("agente:propuestaFlujo", alPedir);
    return () => window.removeEventListener("agente:propuestaFlujo", alPedir);
  }, []);

  if (abierta) {
    return <DetallePropuesta key={abierta} id={abierta} empresaId={empresaId} rol={role} onVolver={() => { setAbierta(null); cargar(); }} />;
  }

  const crear = async () => {
    try {
      const id = await crearPropuesta(empresaId, nueva);
      setModalNueva(false); setNueva({ nombre: "", motivo: "" }); setAbierta(id);
    } catch (e) { setError(e.message); }
  };

  const abiertas = (lista || []).filter(esEditable);
  const cerradas = (lista || []).filter(p => !esEditable(p));
  const fila = (p) => {
    const n = Object.keys(p.cambios?.pagos || {}).length;
    return (
      <li key={p.id}>
        <button onClick={() => setAbierta(p.id)}
          className="w-full text-left flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-2.5 border-b border-cuaderno-renglon hover:bg-cuaderno-tarjeta focus:outline-none focus-visible:ring-2 focus-visible:ring-cuaderno-tinta/40">
          <span className="flex-1 min-w-[12rem] text-[18px]">{p.nombre}</span>
          <span className="text-[14px] text-cuaderno-grafito">{n} {n === 1 ? "cambio" : "cambios"} · {p.creadaPor || "—"}</span>
          <Resaltado color={COLOR_ESTADO[p.estado]} className="text-[14px]">{ESTADOS_PROPUESTA[p.estado]?.label || p.estado}</Resaltado>
        </button>
      </li>
    );
  };

  return (
    <div className="cuaderno px-4 sm:px-8 pt-5 pb-10 space-y-5">
      <FechaHoja />
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Titulo>Propuestas</Titulo>
          <p className="m-0 text-[17px] text-cuaderno-grafito">Ensaya cambios al flujo de caja sin tocarlo. Entran al flujo solo cuando un administrador los aprueba.</p>
        </div>
        <Boton variante="primario" onClick={() => setModalNueva(true)}><IconoMas tamano={15} /> Nueva propuesta</Boton>
      </header>

      {error && <Nota etiqueta="Ojo:">{error}</Nota>}

      <Hoja titulo="Abiertas">
        {lista === null ? <p className="m-0 py-3 text-cuaderno-grafito">Cargando…</p>
          : abiertas.length === 0 ? <p className="m-0 py-3 text-[16px] text-cuaderno-grafito">No hay propuestas abiertas. Crea una, o pídele al asistente que arme una: "propón cómo cubrir la semana más baja".</p>
          : <ul className="m-0 p-0 list-none">{abiertas.map(fila)}</ul>}
      </Hoja>

      {cerradas.length > 0 && (
        <Hoja titulo="Historial">
          <ul className="m-0 p-0 list-none">{cerradas.slice(0, 20).map(fila)}</ul>
        </Hoja>
      )}

      {modalNueva && (
        <ModalCuaderno titulo="Nueva propuesta" subtitulo="Un borrador del flujo, para ensayar" onClose={() => setModalNueva(false)}
          pie={<div className="flex gap-2"><Boton className="flex-1" onClick={() => setModalNueva(false)}>Cancelar</Boton><Boton variante="primario" className="flex-1" onClick={crear} disabled={!nueva.nombre.trim()}>Crear</Boton></div>}>
          <Campo etiqueta="Nombre" autoFocus value={nueva.nombre} onChange={e => setNueva(n => ({ ...n, nombre: e.target.value }))} placeholder="Ej: Postergar arriendos de noviembre" />
          <Campo as="textarea" rows={3} etiqueta="Para qué (opcional)" value={nueva.motivo} onChange={e => setNueva(n => ({ ...n, motivo: e.target.value }))} />
        </ModalCuaderno>
      )}

      <Hoja titulo="Cómo funciona">
        <ol className="m-0 pl-6 space-y-2 text-[17px]">
          <li><span className="text-cuaderno-tinta">Crea una propuesta</span> <span className="text-cuaderno-grafito">con un nombre que diga qué ensayas, por ejemplo "Postergar arriendos de noviembre".</span></li>
          <li><span className="text-cuaderno-tinta">Anota los cambios</span> <span className="text-cuaderno-grafito">dentro de ella: cambiar un monto, mover un pago de semana, agregar una cuenta nueva o probar otro colchón. También puedes pedírselo al asistente: "arma una propuesta para cubrir la semana más baja".</span></li>
          <li><span className="text-cuaderno-tinta">Compara</span> <span className="text-cuaderno-grafito">con los botones Original y Propuesta, o con el deslizador: la curva de caja se redibuja y cada monto corregido se tacha y se escribe encima.</span></li>
          <li><span className="text-cuaderno-tinta">Envíala a revisión.</span> <span className="text-cuaderno-grafito">Un administrador la aprueba y recién ahí sus cambios entran al flujo de caja, todos juntos. Si la rechaza, el flujo queda igual.</span></li>
        </ol>
        <p className="m-0 mt-3 flex items-center gap-2 text-[15px] text-cuaderno-verde"><VistoBueno tamano={13} titulo="" /> Mientras la propuesta está abierta, el flujo original no cambia.</p>
      </Hoja>
    </div>
  );
}
