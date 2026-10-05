/**
 * FinanzasSemana.jsx — "La semana"
 * ─────────────────────────────────────────────────────────────────────────────
 * Responde lo que pregunta gerencia, con los datos del flujo de caja y de los
 * bancos:
 *  · ¿cuánta caja hay y cómo viene? (proyección a 13 semanas sobre el saldo real)
 *  · ¿qué se paga cada semana? (programación por prioridad)
 *  · ¿qué se puede pagar de más? (disponible sobre el colchón y simulador)
 * y arma el informe semanal de una hoja para gerencia.
 *
 * No escribe montos: eso sigue en el flujo. Solo guarda el colchón, la
 * prioridad de cada cuenta y la nota del informe.
 */
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useEmpresa } from "../../lib/useEmpresa";
import { auth } from "../../lib/firebase";
import {
  proyectar, simularPago, proponerMovimientos, partidasSinCerrar, PRIORIDADES, fechaCorta,
} from "../../lib/finanzas/caja.js";
import {
  cargarDatosCaja, guardarColchon, guardarPrioridad, cargarNotaInforme, guardarNotaInforme,
} from "../../lib/finanzas/cajaDatos.js";
import {
  Cifra, Titulo, Hoja, LineaGuia, Boton, Campo, Segmentado, Nota, Resaltado, VistoBueno,
  FechaHoja, ModalCuaderno, GraficoLinea, IconoActualizar, IconoAnterior, casoTitulo,
} from "./cuaderno";

const ORDEN_PRIORIDAD = ["ineludible", "operar", "conversable"];
const pesosDe = (texto) => { const n = String(texto || "").replace(/\D/g, ""); return n ? parseInt(n, 10) : 0; };
const conPuntos = (texto) => { const n = pesosDe(texto); return n ? n.toLocaleString("es-CL") : ""; };
const fechaDe = (iso) => { const [a, m, d] = iso.split("-").map(Number); return new Date(a, m - 1, d); };
const nombreSemana = (w, i) => (i === 0 ? "Esta semana" : i === 1 ? "La próxima" : `Del ${w.rango}`);

// ─── Partida de la programación ───────────────────────────────────────────────
function FilaPartida({ p, onPrioridad, conSelector = true, compacta = false }) {
  const calzaBanco = p.real !== undefined && p.pendiente === 0 && !p.pagado;
  if (compacta) {
    // Informe impreso: una línea por pago.
    return (
      <li className="flex items-baseline gap-2 py-0.5 border-b border-cuaderno-renglon text-[14px]">
        <span className={`flex-1 min-w-0 truncate ${p.pagado || calzaBanco ? "text-cuaderno-grafito" : ""}`}>{casoTitulo(p.cuenta.nombre)}</span>
        <span className="text-[12px] text-cuaderno-grafito">{p.pagado ? "pagado" : calzaBanco ? "en el banco" : ""}</span>
        <Cifra valor={p.pendiente || p.monto} escala="pesos" color={p.pagado || calzaBanco ? "grafito" : "auto"} />
      </li>
    );
  }
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 border-b border-cuaderno-renglon">
      <div className="flex-1 min-w-[12rem]">
        <p className={`m-0 text-[16px] leading-tight ${p.pagado || calzaBanco ? "text-cuaderno-grafito" : ""}`}>
          {casoTitulo(p.cuenta.nombre)}
          {p.recurrente && <span className="ml-1.5 text-[13px] text-cuaderno-grafito">(recurrente)</span>}
        </p>
        {p.cuenta.subcategoria && <p className="m-0 text-[13px] text-cuaderno-grafito">{casoTitulo(p.cuenta.subcategoria)}</p>}
      </div>
      {conSelector && onPrioridad && (
        <select value={p.prioridad} onChange={e => onPrioridad(p.cuenta.id, e.target.value)}
          aria-label={`Prioridad de ${casoTitulo(p.cuenta.nombre)}`}
          className="font-manuscrita text-[14px] text-cuaderno-grafito bg-transparent border-0 border-b border-cuaderno-columna focus:outline-none focus:border-cuaderno-tinta py-0.5">
          {ORDEN_PRIORIDAD.map(k => <option key={k} value={k}>{PRIORIDADES[k].label.toLowerCase()}</option>)}
        </select>
      )}
      <span className="w-28 text-right text-[14px]">
        {p.pagado ? <span className="inline-flex items-center gap-1 text-cuaderno-verde"><VistoBueno tamano={11} titulo="" /> pagado</span>
          : calzaBanco ? <span className="inline-flex items-center gap-1 text-cuaderno-verde"><VistoBueno tamano={11} titulo="" /> en el banco</span>
          : p.pendiente !== p.monto ? <span className="text-cuaderno-grafito">falta una parte</span>
          : <span className="text-cuaderno-grafito">pendiente</span>}
      </span>
      <Cifra valor={p.pendiente || p.monto} escala="pesos" color={p.pagado || calzaBanco ? "grafito" : "auto"} className="w-32 text-right text-[16px]" />
    </li>
  );
}

// ─── Programación de una semana ───────────────────────────────────────────────
function ProgramacionSemana({ w, propuesta, onPrioridad, colchon, compacta = false }) {
  const egresos = w.partidas.filter(p => !p.esIngreso);
  const ingresos = w.partidas.filter(p => p.esIngreso);
  return (
    <div className={compacta ? "space-y-2" : "space-y-4"}>
      {!compacta && (
        <div className="grid gap-x-10 sm:grid-cols-2 max-w-3xl">
          <div>
            <LineaGuia etiqueta="Saldo al empezar"><Cifra valor={w.saldoInicio} escala="pesos" vacio="$0" /></LineaGuia>
            <LineaGuia etiqueta="Entra"><Cifra valor={w.ingresos} escala="pesos" vacio="$0" color="tinta" /></LineaGuia>
          </div>
          <div>
            <LineaGuia etiqueta="Sale"><Cifra valor={w.egresos} escala="pesos" vacio="$0" /></LineaGuia>
            <LineaGuia etiqueta="Queda al cerrar"><Cifra valor={w.saldoFin} escala="pesos" vacio="$0" raya="doble" /></LineaGuia>
          </div>
        </div>
      )}

      {w.bajoColchon && propuesta && propuesta.semana.key === w.key && (
        <Nota etiqueta="Ojo:">
          esta semana cierra en <Cifra valor={w.saldoFin} escala="pesos" color="heredar" />, <Cifra valor={propuesta.falta} escala="pesos" color="heredar" /> bajo el colchón.{" "}
          {propuesta.alcanza
            ? <>Conversar mover {propuesta.elegidos.map(e => casoTitulo(e.cuenta.nombre)).join(", ")} (<Cifra valor={propuesta.suma} escala="pesos" color="heredar" />) a la semana del {fechaCorta(propuesta.destino.inicio)} lo resuelve.</>
            : propuesta.destino
              ? <>Los pagos conversables no alcanzan: hace falta adelantar un cobro, factorizar o usar la línea de crédito.</>
              : <>En las 13 semanas no se recupera: hace falta caja nueva (adelantar cobros, factorizar o financiamiento).</>}
        </Nota>
      )}

      {egresos.length === 0 && ingresos.length === 0 && (
        <p className="m-0 py-4 text-[16px] text-cuaderno-grafito">No hay nada anotado en el flujo para esta semana.</p>
      )}

      {ORDEN_PRIORIDAD.map(k => {
        const lista = egresos.filter(p => p.prioridad === k).sort((a, b) => a.monto - b.monto);
        if (lista.length === 0) return null;
        const total = lista.reduce((s, p) => s + (p.pagado ? 0 : p.pendiente), 0);
        return (
          <div key={k}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-4">
              {compacta
                ? <p className="m-0 text-[15px]">{PRIORIDADES[k].label}</p>
                : <Titulo as="h3" tamano="sm">{PRIORIDADES[k].label}</Titulo>}
              <span className="text-[15px] text-cuaderno-grafito">por pagar <Cifra valor={total} escala="pesos" color="heredar" vacio="$0" /></span>
            </div>
            {!compacta && <p className="m-0 -mt-1 text-[14px] text-cuaderno-grafito">{PRIORIDADES[k].descripcion}</p>}
            <ul className="m-0 p-0 list-none">
              {lista.map(p => <FilaPartida key={p.key} p={p} onPrioridad={onPrioridad} conSelector={!compacta} compacta={compacta} />)}
            </ul>
          </div>
        );
      })}

      {ingresos.length > 0 && (
        <div>
          {compacta ? <p className="m-0 text-[15px]">Cobros esperados</p> : <Titulo as="h3" tamano="sm">Cobros esperados</Titulo>}
          <ul className="m-0 p-0 list-none">
            {ingresos.map(p => <FilaPartida key={p.key} p={p} conSelector={false} compacta={compacta} />)}
          </ul>
        </div>
      )}
    </div>
  );
}

// ─── Informe semanal para gerencia ────────────────────────────────────────────
function InformeSemanal({ proy, datos, empresa, propuesta, sinCerrar, nota, setNota, onGuardarNota, guardandoNota, onVolver }) {
  const s0 = proy.semanas[0], s1 = proy.semanas[1];
  const iMin = proy.semanas.indexOf(proy.semanaMinima);
  return (
    <div className="cuaderno px-8 pt-5 pb-10">
      <style>{`@media print {
        body * { visibility: hidden !important; }
        #informe-semanal, #informe-semanal * { visibility: visible !important; }
        #informe-semanal { position: absolute; left: 0; top: 0; width: 100%; border: 0 !important; }
        .no-print { display: none !important; }
        @page { size: A4; margin: 9mm 11mm; }
      }`}</style>

      <div className="no-print flex flex-wrap items-center justify-between gap-3 mb-4">
        <Boton variante="texto" onClick={onVolver}><IconoAnterior tamano={14} /> Volver a La semana</Boton>
        <Boton variante="primario" onClick={() => window.print()}>Imprimir o guardar en PDF</Boton>
      </div>

      <article id="informe-semanal" className="max-w-[900px] mx-auto bg-cuaderno-tarjeta border border-cuaderno-columna rounded-md px-10 py-8 space-y-5 print:px-0 print:py-0 print:space-y-2">
        <header className="border-b-[3px] border-double border-cuaderno-margen pb-3">
          <p className="m-0 text-[15px] text-cuaderno-grafito">{empresa?.nombre || empresa?.razonSocial || ""}</p>
          <Titulo as="h1" tamano="lg">Informe de caja</Titulo>
          <p className="m-0 text-[16px] text-cuaderno-grafito">Semana del {s0.rango} · preparado el {new Date().toLocaleDateString("es-CL", { day: "numeric", month: "long", year: "numeric" })}</p>
        </header>

        <section className="grid gap-x-8 sm:grid-cols-3">
          <div>
            <p className="m-0 text-[14px] text-cuaderno-grafito">Caja hoy</p>
            <p className="m-0 text-[22px]"><Cifra valor={proy.saldoInicial} escala="pesos" vacio="$0" color="tinta" /></p>
            <p className="m-0 text-[13px] text-cuaderno-grafito">{datos.fuenteSaldo === "bancos" ? "según las cartolas" : "saldo anotado en el flujo"}</p>
          </div>
          <div>
            <p className="m-0 text-[14px] text-cuaderno-grafito">Se puede pagar de más</p>
            <p className="m-0 text-[24px]">{proy.deficit > 0
              ? <span className="text-cuaderno-roja">nada</span>
              : <Cifra valor={proy.disponible} escala="pesos" vacio="$0" color="tinta" />}</p>
            <p className="m-0 text-[13px] text-cuaderno-grafito">dejando siempre <Cifra valor={proy.colchon} escala="pesos" color="heredar" /> de colchón</p>
          </div>
          <div>
            <p className="m-0 text-[14px] text-cuaderno-grafito">Semana más apretada</p>
            <p className="m-0 text-[24px]"><Cifra valor={proy.minimo} escala="pesos" vacio="$0" /></p>
            <p className="m-0 text-[13px] text-cuaderno-grafito">del {proy.semanaMinima.rango}</p>
          </div>
        </section>

        <section>
          <Titulo as="h2" tamano="md">1. Programación de pagos</Titulo>
          <div className="grid gap-x-10 gap-y-4 md:grid-cols-2 mt-1">
            {[s0, s1].map((w, i) => (
              <div key={w.key}>
                <p className="m-0 mb-1 text-[16px]"><Resaltado color={i === 0 ? "durazno" : "lavanda"}>{i === 0 ? "Esta semana" : "La próxima"}</Resaltado> <span className="text-[14px] text-cuaderno-grafito">{w.rango}</span></p>
                <ProgramacionSemana w={w} propuesta={propuesta} colchon={proy.colchon} compacta />
              </div>
            ))}
          </div>
        </section>

        <section>
          <Titulo as="h2" tamano="md">2. Proyección de caja, 13 semanas</Titulo>
          <GraficoLinea data={proy.semanas.map(f => ({ label: f.etiqueta, value: f.saldoFin }))} height={110}
            referencia={{ valor: proy.colchon, etiqueta: "colchón" }} destacar={iMin} />
          <table className="w-full border-collapse mt-1 text-[12px] leading-tight">
            <thead>
              <tr className="shadow-[inset_0_-1.5px_0_rgb(var(--cuaderno-tinta))]">
                {["Semana", "Entra", "Sale", "Saldo al cerrar"].map((t, i) => (
                  <th key={t} className={`font-normal text-cuaderno-grafito py-1 ${i === 0 ? "text-left" : "text-right"}`}>{t}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {proy.semanas.map(f => (
                <tr key={f.key} className="border-b border-cuaderno-renglon">
                  <td className="py-px">{f.etiqueta} · {f.rango}</td>
                  <td className="py-px text-right"><Cifra valor={f.ingresos} escala="pesos" color="tinta" vacio="—" /></td>
                  <td className="py-px text-right"><Cifra valor={f.egresos} escala="pesos" vacio="—" /></td>
                  <td className="py-px text-right">{f.bajoColchon
                    ? <Resaltado color="rosa"><Cifra valor={f.saldoFin} escala="pesos" color="heredar" vacio="$0" /></Resaltado>
                    : <Cifra valor={f.saldoFin} escala="pesos" vacio="$0" />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section>
          <Titulo as="h2" tamano="md">3. Para decidir</Titulo>
          <ul className="m-0 pl-5 space-y-1 text-[16px]">
            {proy.deficit > 0 && propuesta ? (
              <li>
                La semana del {propuesta.semana.rango} baja a <Cifra valor={propuesta.semana.saldoFin} escala="pesos" color="heredar" />.{" "}
                {propuesta.alcanza
                  ? <>Propuesta: mover {propuesta.elegidos.map(e => casoTitulo(e.cuenta.nombre)).join(", ")} a la semana del {fechaCorta(propuesta.destino.inicio)}.</>
                  : <>Mover pagos no alcanza: hay que adelantar un cobro, factorizar o usar la línea de crédito.</>}
              </li>
            ) : (
              <li>Hay espacio para pagos extra por hasta <Cifra valor={proy.disponible} escala="pesos" color="heredar" /> sin bajar del colchón.</li>
            )}
            {sinCerrar.length > 0 && <li>{sinCerrar.length} pagos de semanas pasadas siguen sin marcar como pagados en el flujo; se están revisando.</li>}
          </ul>
          <div className="mt-3">
            <p className="m-0 text-[14px] text-cuaderno-grafito">Nota de finanzas</p>
            <div className="no-print">
              <Campo as="textarea" rows={3} value={nota} onChange={e => setNota(e.target.value)} onBlur={onGuardarNota}
                placeholder="Tu lectura de la semana: qué explica los números y qué recomiendas." />
              <p className="m-0 mt-1 text-[13px] text-cuaderno-grafito">{guardandoNota ? "Guardando…" : "Se guarda sola al salir del campo."}</p>
            </div>
            <p className="hidden print:block m-0 text-[16px] whitespace-pre-line">{nota || "—"}</p>
          </div>
        </section>
      </article>
    </div>
  );
}

// ─── Pantalla ─────────────────────────────────────────────────────────────────
export default function FinanzasSemana() {
  const { empresaId, empresa } = useEmpresa();
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [semanaProg, setSemanaProg] = useState(0);
  const [modalColchon, setModalColchon] = useState(false);
  const [colchonTexto, setColchonTexto] = useState("");
  const [verInforme, setVerInforme] = useState(false);
  const [nota, setNota] = useState("");
  const [guardandoNota, setGuardandoNota] = useState(false);
  const [simMonto, setSimMonto] = useState("");
  const [simSemana, setSimSemana] = useState(0);
  const hoy = useMemo(() => new Date(), []);

  const cargar = useCallback(async () => {
    if (!empresaId) return;
    setCargando(true); setError("");
    try { setDatos(await cargarDatosCaja(empresaId, hoy)); }
    catch (e) { console.error(e); setError("No se pudieron cargar los datos del flujo. Revisa tu conexión e intenta de nuevo."); }
    finally { setCargando(false); }
  }, [empresaId, hoy]);
  useEffect(() => { cargar(); }, [cargar]);

  const proy = useMemo(() => datos && proyectar({ ...datos, hoy }), [datos, hoy]);
  const propuesta = useMemo(() => proy && proponerMovimientos(proy), [proy]);
  const sinCerrar = useMemo(() => (datos ? partidasSinCerrar({ ...datos, hoy }) : []), [datos, hoy]);
  const sim = useMemo(() => (proy && pesosDe(simMonto) ? simularPago(proy, pesosDe(simMonto), simSemana) : null), [proy, simMonto, simSemana]);

  const onPrioridad = async (cuentaId, prioridad) => {
    setDatos(d => ({ ...d, cuentas: d.cuentas.map(c => c.id === cuentaId ? { ...c, prioridad } : c) }));
    try { await guardarPrioridad(empresaId, cuentaId, prioridad); } catch (e) { console.error(e); }
  };
  const onGuardarColchon = async () => {
    const valor = pesosDe(colchonTexto);
    setDatos(d => ({ ...d, colchon: valor }));
    setModalColchon(false);
    try { await guardarColchon(empresaId, valor); } catch (e) { console.error(e); }
  };
  const abrirInforme = async () => {
    setVerInforme(true);
    try { setNota(await cargarNotaInforme(empresaId, proy.semanas[0].key)); } catch (e) { console.error(e); }
  };
  const onGuardarNota = async () => {
    setGuardandoNota(true);
    try { await guardarNotaInforme(empresaId, proy.semanas[0].key, nota, auth?.currentUser?.email || ""); }
    catch (e) { console.error(e); }
    finally { setGuardandoNota(false); }
  };

  if (cargando) return <div className="cuaderno flex items-center justify-center h-64 text-[18px] text-cuaderno-grafito">Proyectando la caja…</div>;
  if (error) return <div className="cuaderno px-8 pt-10"><Nota etiqueta="Ojo:">{error}</Nota></div>;
  if (!proy) return null;

  if (verInforme) {
    return <InformeSemanal proy={proy} datos={datos} empresa={empresa} propuesta={propuesta} sinCerrar={sinCerrar}
      nota={nota} setNota={setNota} onGuardarNota={onGuardarNota} guardandoNota={guardandoNota} onVolver={() => setVerInforme(false)} />;
  }

  const iMin = proy.semanas.indexOf(proy.semanaMinima);
  const wProg = proy.semanas[semanaProg];
  const fechaSaldo = datos.bancos?.alMasAntiguo ? fechaCorta(fechaDe(datos.bancos.alMasAntiguo)) : null;

  return (
    <div className="cuaderno px-8 pt-5 pb-10 space-y-5">
      <FechaHoja />

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Titulo>La semana</Titulo>
          <p className="m-0 text-[17px] text-cuaderno-grafito">Cuánta plata hay, qué se paga y cuánto se puede pagar de más.</p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <Boton onClick={cargar}><IconoActualizar tamano={15} /> Actualizar</Boton>
          <Boton variante="primario" onClick={abrirInforme}>Informe para gerencia</Boton>
        </div>
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] items-start">
        {/* Hoy */}
        <Hoja titulo="Hoy">
          <LineaGuia etiqueta="Caja en bancos"><Cifra valor={proy.saldoInicial} escala="pesos" vacio="$0" /></LineaGuia>
          <p className="m-0 -mt-1 mb-1 text-right text-[13px] text-cuaderno-grafito">
            {datos.fuenteSaldo === "bancos" ? `según las cartolas${fechaSaldo ? `, al ${fechaSaldo}` : ""}`
              : datos.fuenteSaldo === "manual" ? "saldo anotado a mano en el flujo" : "sin saldo: sube las cartolas en Bancos"}
          </p>
          <LineaGuia etiqueta="Colchón mínimo">
            <span className="inline-flex items-baseline gap-2">
              <Cifra valor={proy.colchon} escala="pesos" vacio="$0" color="tinta" />
              <Boton variante="texto" className="min-h-0 text-[14px]" onClick={() => { setColchonTexto(conPuntos(proy.colchon)); setModalColchon(true); }}>cambiar</Boton>
            </span>
          </LineaGuia>
          <LineaGuia etiqueta="Semana más apretada"><Cifra valor={proy.minimo} escala="pesos" vacio="$0" /></LineaGuia>
          <p className="m-0 -mt-1 mb-1 text-right text-[13px] text-cuaderno-grafito">del {proy.semanaMinima.rango}</p>
          <LineaGuia etiqueta="Se puede pagar de más">
            {proy.deficit > 0
              ? <span className="text-cuaderno-roja">nada por ahora</span>
              : <Cifra valor={proy.disponible} escala="pesos" vacio="$0" color="verde" raya="doble" />}
          </LineaGuia>
          {proy.deficit > 0 && (
            <Nota etiqueta="Ojo:" className="mt-2">
              la semana del {proy.semanaMinima.rango} baja a <Cifra valor={proy.minimo} escala="pesos" color="heredar" />: faltan <Cifra valor={proy.deficit} escala="pesos" color="heredar" /> para el colchón.
            </Nota>
          )}
        </Hoja>

        {/* Proyección */}
        <Hoja titulo="Proyección, próximas 13 semanas"
          extra={<span className="text-[14px] text-cuaderno-grafito">saldo al cerrar cada semana</span>}>
          <GraficoLinea data={proy.semanas.map(f => ({ label: f.etiqueta, value: f.saldoFin }))} height={200}
            referencia={{ valor: proy.colchon, etiqueta: "colchón" }} destacar={iMin} />
          <details className="mt-2 group">
            <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden text-[15px] text-cuaderno-tinta underline decoration-cuaderno-columna underline-offset-4 w-fit">Ver semana a semana</summary>
            <table className="w-full border-collapse mt-2">
              <thead>
                <tr className="shadow-[inset_0_-1.5px_0_rgb(var(--cuaderno-tinta))]">
                  {["Semana", "Entra", "Sale", "Saldo al cerrar"].map((t, i) => (
                    <th key={t} className={`font-normal text-[14px] text-cuaderno-grafito py-1.5 ${i === 0 ? "text-left" : "text-right"}`}>{t}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {proy.semanas.map(f => (
                  <tr key={f.key} className="border-b border-cuaderno-renglon">
                    <td className="py-1.5 text-[15px]">{f.etiqueta} <span className="text-cuaderno-grafito text-[13px]">{f.rango}</span></td>
                    <td className="py-1.5 text-right text-[15px]"><Cifra valor={f.ingresos} escala="pesos" color="tinta" vacio="—" /></td>
                    <td className="py-1.5 text-right text-[15px]"><Cifra valor={f.egresos} escala="pesos" vacio="—" /></td>
                    <td className="py-1.5 text-right text-[15px]">{f.bajoColchon
                      ? <Resaltado color="rosa"><Cifra valor={f.saldoFin} escala="pesos" color="heredar" vacio="$0" /></Resaltado>
                      : <Cifra valor={f.saldoFin} escala="pesos" vacio="$0" />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </Hoja>
      </div>

      {/* Programación */}
      <Hoja titulo="Programación de pagos"
        extra={<Segmentado opciones={proy.semanas.slice(0, 4).map((w, i) => ({ id: i, label: nombreSemana(w, i) }))} valor={semanaProg} onCambiar={setSemanaProg} />}>
        <p className="m-0 mb-3 text-[15px] text-cuaderno-grafito">
          {wProg.rango}. Los montos salen del flujo de caja; aquí defines la prioridad de cada cuenta y queda guardada para las próximas semanas.
        </p>
        <ProgramacionSemana w={wProg} propuesta={propuesta} onPrioridad={onPrioridad} colchon={proy.colchon} />
      </Hoja>

      <div className="grid gap-5 lg:grid-cols-2 items-start">
        {/* Simulador */}
        <Hoja titulo="¿Podemos pagar esto?">
          <div className="flex flex-wrap items-end gap-4">
            <Campo etiqueta="Monto" inputMode="numeric" className="w-44" value={simMonto}
              onChange={e => setSimMonto(conPuntos(e.target.value))} placeholder="Ej: 12.000.000" />
            <Campo as="select" etiqueta="Semana" className="flex-1 min-w-[12rem]" value={simSemana} onChange={e => setSimSemana(Number(e.target.value))}>
              {proy.semanas.map((w, i) => <option key={w.key} value={i}>{w.etiqueta}, {w.rango}</option>)}
            </Campo>
          </div>
          {!sim ? (
            <p className="m-0 mt-3 text-[15px] text-cuaderno-grafito">
              Escribe un pago que no está en el flujo para ver si la caja aguanta sin bajar del colchón.
            </p>
          ) : sim.alcanza ? (
            <p className="m-0 mt-3 flex items-start gap-2 text-[17px] text-cuaderno-verde">
              <VistoBueno tamano={16} titulo="" className="mt-1" />
              <span>Sí. La semana más baja queda en <Cifra valor={sim.quedaMin} escala="pesos" color="heredar" />, sobre el colchón.</span>
            </p>
          ) : (
            <Nota etiqueta="No:" className="mt-3 text-[17px]">
              la semana del {sim.semanaQueBaja.rango} quedaría en <Cifra valor={sim.quedaMin} escala="pesos" color="heredar" />.{" "}
              {sim.desde ? <>Desde la semana del {sim.desde.rango} sí alcanza.</> : <>En las 13 semanas no alcanza sin caja nueva.</>}
            </Nota>
          )}
          {sim?.yaBajoAntes && (
            <Nota etiqueta="Ojo:" tono="grafito" className="mt-2">
              la semana del {sim.yaBajoAntes.rango} ya está bajo el colchón, con o sin este pago. Revísala en la programación.
            </Nota>
          )}
        </Hoja>

        {/* Sin cerrar */}
        <Hoja titulo="Semanas pasadas sin cerrar">
          {sinCerrar.length === 0 ? (
            <p className="m-0 py-4 flex items-center gap-2 text-[16px] text-cuaderno-verde"><VistoBueno tamano={14} titulo="" /> Las últimas cuatro semanas están cerradas.</p>
          ) : (
            <>
              <p className="m-0 mb-1 text-[15px] text-cuaderno-grafito">
                Están en el flujo, sin marcar como pagadas y sin aparecer en el banco. No entran a la proyección: si alguna sigue pendiente, muévela a esta semana en el flujo.
              </p>
              <ul className="m-0 p-0 list-none">
                {sinCerrar.slice(0, 8).map(x => (
                  <li key={x.key} className="flex items-baseline justify-between gap-3 py-1.5 border-b border-cuaderno-renglon">
                    <span className="text-[15px] min-w-0 truncate">{casoTitulo(x.cuenta.nombre)} <span className="text-[13px] text-cuaderno-grafito">semana del {fechaCorta(fechaDe(x.semana))}</span></span>
                    <Cifra valor={x.monto} escala="pesos" className="text-[15px] flex-shrink-0" />
                  </li>
                ))}
              </ul>
              {sinCerrar.length > 8 && <p className="m-0 mt-1 text-[14px] text-cuaderno-grafito">Y {sinCerrar.length - 8} más.</p>}
            </>
          )}
        </Hoja>
      </div>

      {modalColchon && (
        <ModalCuaderno titulo="Colchón mínimo" subtitulo="Lo que debe quedar siempre en el banco" ancho="max-w-sm"
          onClose={() => setModalColchon(false)}
          pie={<div className="flex gap-2"><Boton className="flex-1" onClick={() => setModalColchon(false)}>Cancelar</Boton><Boton variante="primario" className="flex-1" onClick={onGuardarColchon}>Guardar</Boton></div>}>
          <Campo etiqueta="Colchón, en pesos" inputMode="numeric" autoFocus value={colchonTexto} onChange={e => setColchonTexto(conPuntos(e.target.value))} />
          <p className="m-0 text-[15px] text-cuaderno-grafito">Lo disponible para pagos extra se calcula sobre esta cifra: nunca se propone un pago que deje alguna semana por debajo.</p>
        </ModalCuaderno>
      )}
    </div>
  );
}
