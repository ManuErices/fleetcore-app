/**
 * FinanzasPagos.jsx — los pagos del viernes
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. Toma lo pendiente de pago de una semana (del flujo de caja).
 * 2. Con los datos bancarios del maestro de proveedores arma la nómina en el
 *    formato Pago Fácil del Banco de Chile, partiendo los montos grandes en
 *    líneas de $5.000.000 como se hace hoy.
 * 3. Cuando el banco la aprueba, marca esos pagos como pagados en el flujo.
 * Además completa el maestro con nóminas y certificados ya subidos.
 */
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { doc, setDoc, getDocs, collection } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useEmpresa } from "../../lib/useEmpresa";
import { proyectar, PRIORIDADES, TOLERANCIA } from "../../lib/finanzas/caja.js";
import { cargarDatosCaja } from "../../lib/finanzas/cajaDatos.js";
import {
  beneficiarioDesdeFicha, armarNomina, archivoNomina, nombreArchivoNomina, MAXIMO_POR_LINEA,
  leerNominaAnterior, beneficiariosDeCertificado,
} from "../../lib/banco/nomina.js";
import { leerCertificadoPago } from "../../lib/banco/certificados.js";
import { cargarProveedores, planificarCompletado, aplicarCompletado } from "../../lib/banco/maestro.js";
import {
  Cifra, Titulo, Hoja, LineaGuia, Boton, Campo, Casilla, Segmentado, Nota, Resaltado, VistoBueno,
  FechaHoja, IconoSubir, IconoDocumento, casoTitulo,
} from "./cuaderno";

const pesosDe = (t) => { const n = String(t ?? "").replace(/\D/g, ""); return n ? parseInt(n, 10) : 0; };
const conPuntos = (t) => { const n = pesosDe(t); return n ? n.toLocaleString("es-CL") : ""; };
const ORDEN = ["ineludible", "operar", "conversable"];
const nombreSemana = (w, i) => (i === 0 ? "Esta semana" : i === 1 ? "La próxima" : `Del ${w.rango}`);

function descargar(arrayBuffer, nombre) {
  const blob = new Blob([arrayBuffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = nombre; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// ─── Fila de pago ─────────────────────────────────────────────────────────────
function FilaPago({ f, estado, onCambiar }) {
  const b = f.datos.beneficiario;
  return (
    <li className="py-2.5 border-b border-cuaderno-renglon grid gap-x-4 gap-y-1.5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_9rem_minmax(0,1fr)] items-center">
      <div className="flex items-start gap-2 min-w-0">
        <Casilla marcada={estado.sel} onCambiar={v => onCambiar({ sel: v })}>
          <span className="block text-[16px] leading-tight">{casoTitulo(f.partida.cuenta.nombre)}</span>
          <span className="block text-[13px] text-cuaderno-grafito">
            {PRIORIDADES[f.partida.prioridad].label.toLowerCase()} · en el flujo <Cifra valor={-f.partida.pendiente} escala="pesos" color="heredar" />
          </span>
        </Casilla>
      </div>
      <div className="min-w-0 text-[14px] leading-snug">
        <p className="m-0 truncate">{b.nombre || "—"} <span className="text-cuaderno-grafito">{b.rut}</span></p>
        <p className="m-0 text-cuaderno-grafito truncate">{b.banco} · {b.tipoCuenta === "CTD" ? "cta. corriente" : b.tipoCuenta === "JUV" ? "cta. vista" : "cta. ahorro"} {b.cuenta}</p>
      </div>
      <Campo aria-label="Monto a pagar" inputMode="numeric" value={estado.monto ?? ""} onChange={e => onCambiar({ monto: conPuntos(e.target.value) })}
        className="text-right" />
      <Campo aria-label="Descripción del pago" value={estado.descripcion ?? ""} maxLength={30}
        onChange={e => onCambiar({ descripcion: e.target.value })} placeholder="Ej: FACT 246 250" />
    </li>
  );
}

// ─── Pantalla ─────────────────────────────────────────────────────────────────
export default function FinanzasPagos() {
  const { empresaId, empresa } = useEmpresa();
  const [datos, setDatos] = useState(null);
  const [proveedores, setProveedores] = useState([]);
  const [notas, setNotas] = useState({});
  const [cargando, setCargando] = useState(true);
  const [semana, setSemana] = useState(0);
  const [estados, setEstados] = useState({});           // por llave de celda: { sel, monto, descripcion }
  const [maximo, setMaximo] = useState(conPuntos(MAXIMO_POR_LINEA));
  const [descargada, setDescargada] = useState(null);   // { claves, archivo }
  const [mensaje, setMensaje] = useState(null);
  const [archivosMaestro, setArchivosMaestro] = useState([]);
  const [plan, setPlan] = useState(null);
  const [crearRuts, setCrearRuts] = useState(new Set());
  const [aplicando, setAplicando] = useState(false);
  const hoy = useMemo(() => new Date(), []);

  const cargar = useCallback(async () => {
    if (!empresaId) return;
    setCargando(true);
    try {
      const [d, provs, snapN] = await Promise.all([
        cargarDatosCaja(empresaId, hoy), cargarProveedores(empresaId),
        getDocs(collection(db, "empresas", empresaId, "flujo_notas")),
      ]);
      const n = {}; snapN.docs.forEach(x => { n[x.id] = x.data().texto || ""; });
      setDatos(d); setProveedores(provs); setNotas(n);
    } catch (e) { console.error(e); setMensaje({ ok: false, texto: "No se pudieron cargar los datos. Revisa tu conexión e intenta de nuevo." }); }
    finally { setCargando(false); }
  }, [empresaId, hoy]);
  useEffect(() => { cargar(); }, [cargar]);

  const proy = useMemo(() => datos && proyectar({ ...datos, hoy }), [datos, hoy]);

  // Pendientes de pago de la semana elegida, con sus datos bancarios.
  const filas = useMemo(() => {
    if (!proy) return [];
    return proy.semanas[semana].partidas
      .filter(p => !p.esIngreso && !p.pagado && p.pendiente < 0)
      .map(p => {
        const ficha = p.cuenta.proveedorId ? proveedores.find(x => x.id === p.cuenta.proveedorId) : null;
        const datosPago = p.cuenta.proveedorId
          ? beneficiarioDesdeFicha(ficha)
          : { beneficiario: {}, faltan: ["vincular un proveedor a la cuenta (en el flujo)"], listo: false };
        return { partida: p, ficha, datos: datosPago };
      })
      .sort((a, b) => ORDEN.indexOf(a.partida.prioridad) - ORDEN.indexOf(b.partida.prioridad) || a.partida.pendiente - b.partida.pendiente);
  }, [proy, semana, proveedores]);

  // Estado inicial de cada fila: seleccionada si tiene datos completos.
  useEffect(() => {
    setEstados(prev => {
      const nuevo = { ...prev };
      for (const f of filas) {
        if (nuevo[f.partida.key]) continue;
        nuevo[f.partida.key] = {
          sel: f.datos.listo,
          monto: conPuntos(-f.partida.pendiente),
          descripcion: (notas[f.partida.key] || casoTitulo(f.partida.cuenta.nombre)).slice(0, 30),
        };
      }
      return nuevo;
    });
    setDescargada(null);
  }, [filas, notas]);

  const listas = filas.filter(f => f.datos.listo);
  const noVan = filas.filter(f => !f.datos.listo);
  const elegidas = listas.filter(f => estados[f.partida.key]?.sel);
  const nomina = useMemo(() => armarNomina(
    elegidas.map(f => ({ beneficiario: f.datos.beneficiario, monto: pesosDe(estados[f.partida.key]?.monto), descripcion: estados[f.partida.key]?.descripcion })),
    { maximoPorLinea: pesosDe(maximo) || MAXIMO_POR_LINEA },
  ), [elegidas, estados, maximo]);

  const cambiarEstado = (key, cambios) => { setEstados(prev => ({ ...prev, [key]: { ...prev[key], ...cambios } })); setDescargada(null); };

  const onDescargar = () => {
    const nombre = nombreArchivoNomina(empresa?.nombre || empresa?.razonSocial || "", new Date());
    descargar(archivoNomina(nomina.lineas), nombre);
    setDescargada({ archivo: nombre, filas: elegidas.map(f => ({ key: f.partida.key, completo: pesosDe(estados[f.partida.key]?.monto) >= -f.partida.pendiente - TOLERANCIA })) });
  };

  const onMarcarPagados = async () => {
    const completos = descargada.filas.filter(x => x.completo);
    try {
      await Promise.all(completos.map(x => setDoc(doc(db, "empresas", empresaId, "flujo_pagados", x.key), { paidAt: new Date().toISOString(), via: "nomina" })));
      const parciales = descargada.filas.length - completos.length;
      setMensaje({ ok: true, texto: `Listo: ${completos.length} pagos marcados como pagados en el flujo.${parciales ? ` ${parciales} eran pagos parciales: siguen pendientes por la diferencia; ajusta su monto en el flujo.` : ""}` });
      setDescargada(null); setEstados({});
      await cargar();
    } catch (e) { console.error(e); setMensaje({ ok: false, texto: "No se pudieron marcar los pagos. Intenta de nuevo." }); }
  };

  // ── Completar el maestro ──
  const leerArchivosMaestro = async (lista) => {
    const leidos = [];
    for (const archivo of lista) {
      try {
        const buffer = await archivo.arrayBuffer();
        const beneficiarios = /\.pdf$/i.test(archivo.name)
          ? beneficiariosDeCertificado(await leerCertificadoPago(buffer))
          : leerNominaAnterior(buffer);
        leidos.push({ nombre: archivo.name, beneficiarios });
      } catch (e) { leidos.push({ nombre: archivo.name, error: e.message || "No se pudo leer." }); }
    }
    const todos = [...archivosMaestro, ...leidos];
    setArchivosMaestro(todos);
    const p = planificarCompletado(proveedores, todos.flatMap(a => a.beneficiarios || []));
    setPlan(p); setCrearRuts(new Set(p.crear.map(c => c.rut)));
  };
  const onAplicar = async () => {
    setAplicando(true);
    try {
      const r = await aplicarCompletado(empresaId, plan, crearRuts);
      setMensaje({ ok: r.errores.length === 0, texto: `Maestro actualizado: ${r.creadas} fichas nuevas y ${r.completadas} completadas.${r.errores.length ? ` ${r.errores.length} no se pudieron guardar.` : ""}` });
      setArchivosMaestro([]); setPlan(null);
      await cargar();
    } catch (e) { console.error(e); setMensaje({ ok: false, texto: "No se pudo actualizar el maestro." }); }
    finally { setAplicando(false); }
  };

  if (cargando) return <div className="cuaderno flex items-center justify-center h-64 text-[18px] text-cuaderno-grafito">Buscando lo que hay que pagar…</div>;
  if (!proy) return <div className="cuaderno px-8 pt-10">{mensaje && <Nota etiqueta="Ojo:">{mensaje.texto}</Nota>}</div>;

  return (
    <div className="cuaderno px-8 pt-5 pb-10 space-y-5">
      <FechaHoja />
      <header>
        <Titulo>Pagos</Titulo>
        <p className="m-0 text-[17px] text-cuaderno-grafito">La nómina para el Banco de Chile, armada con lo que el flujo dice que se paga.</p>
      </header>

      {mensaje && (mensaje.ok
        ? <p className="m-0 flex items-center gap-2 text-[17px] text-cuaderno-verde"><VistoBueno tamano={15} titulo="" /> {mensaje.texto}</p>
        : <Nota etiqueta="Ojo:">{mensaje.texto}</Nota>)}

      <Hoja titulo="Qué se paga"
        extra={<Segmentado opciones={proy.semanas.slice(0, 4).map((w, i) => ({ id: i, label: nombreSemana(w, i) }))} valor={semana} onCambiar={setSemana} />}>
        <p className="m-0 mb-2 text-[15px] text-cuaderno-grafito max-w-3xl">
          {proy.semanas[semana].rango}. Pagos pendientes en el flujo con datos bancarios completos. Ajusta el monto si pagas una parte y escribe en la descripción lo que el proveedor necesita ver (por ejemplo, las facturas).
        </p>

        {listas.length === 0 ? (
          <p className="m-0 py-6 text-center text-[16px] text-cuaderno-grafito">
            {filas.length === 0 ? "No hay pagos pendientes en el flujo para esta semana." : "Ningún pago de esta semana tiene sus datos bancarios completos todavía."}
          </p>
        ) : (
          <ul className="m-0 p-0 list-none">
            {listas.map(f => <FilaPago key={f.partida.key} f={f} estado={estados[f.partida.key] || {}} onCambiar={c => cambiarEstado(f.partida.key, c)} />)}
          </ul>
        )}

        {noVan.length > 0 && (
          <details className="mt-3">
            <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden text-[16px] w-fit">
              <Resaltado color="durazno">{noVan.length} no van en esta nómina</Resaltado>
              <span className="ml-2 text-[14px] text-cuaderno-grafito">ver por qué</span>
            </summary>
            <ul className="m-0 mt-1 p-0 list-none">
              {noVan.map(f => (
                <li key={f.partida.key} className="flex flex-wrap items-baseline justify-between gap-x-4 py-1.5 border-b border-cuaderno-renglon">
                  <span className="text-[15px]">{casoTitulo(f.partida.cuenta.nombre)} <span className="text-[13px] text-cuaderno-grafito">falta: {f.datos.faltan.join(", ")}</span></span>
                  <Cifra valor={f.partida.pendiente} escala="pesos" className="text-[15px]" />
                </li>
              ))}
            </ul>
            <p className="m-0 mt-1 text-[14px] text-cuaderno-grafito">Los datos se completan en la ficha del proveedor (en el flujo, al abrir la cuenta) o abajo, con nóminas y certificados anteriores.</p>
          </details>
        )}

        {elegidas.length > 0 && (
          <div className="mt-4 grid gap-x-10 gap-y-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-end">
            <div>
              <LineaGuia etiqueta={`A pagar, ${elegidas.length} pago${elegidas.length > 1 ? "s" : ""}`}>
                <Cifra valor={nomina.total} escala="pesos" vacio="$0" raya="doble" />
              </LineaGuia>
              <LineaGuia etiqueta="Líneas en el archivo"><span>{nomina.lineas.length}</span></LineaGuia>
              <Campo etiqueta="Máximo por línea" inputMode="numeric" className="w-40 mt-1" value={maximo}
                onChange={e => setMaximo(conPuntos(e.target.value))} ayuda="Los montos mayores se parten, como en tus nóminas." />
            </div>
            <div className="space-y-2">
              {nomina.errores.length > 0 && (
                <Nota etiqueta="Ojo:">{nomina.errores.length} pago{nomina.errores.length > 1 ? "s" : ""} quedan fuera: {nomina.errores.map(e => e.errores.join(", ")).join("; ")}.</Nota>
              )}
              {!descargada ? (
                <Boton variante="primario" onClick={onDescargar} disabled={nomina.lineas.length === 0}>
                  Descargar nómina para el Banco de Chile
                </Boton>
              ) : (
                <div className="border border-cuaderno-azul rounded-md px-4 py-3 space-y-2">
                  <p className="m-0 flex items-center gap-2 text-[16px] text-cuaderno-verde"><VistoBueno tamano={14} titulo="" /> Descargada: {descargada.archivo}</p>
                  <p className="m-0 text-[15px]">Súbela en Pago Fácil del Banco de Chile. Cuando el banco la apruebe, márcala aquí y el flujo queda al día.</p>
                  <div className="flex flex-wrap gap-2">
                    <Boton variante="primario" onClick={onMarcarPagados}>Marcar como pagados en el flujo</Boton>
                    <Boton variante="texto" onClick={onDescargar}>Descargar otra vez</Boton>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </Hoja>

      <Hoja titulo="Completar fichas de proveedores">
        <p className="m-0 mb-2 text-[15px] text-cuaderno-grafito max-w-3xl">
          Sube nóminas que ya enviaste (Excel con la plantilla de Pago Fácil) o certificados de pago del Banco de Chile (PDF). Se completan los datos bancarios que falten; lo que ya está escrito en una ficha nunca se cambia.
        </p>
        <label className="flex items-center justify-center gap-2 py-4 rounded-md border-[1.5px] border-dashed border-cuaderno-columna hover:border-cuaderno-tinta hover:bg-cuaderno-papel cursor-pointer text-[16px] focus-within:ring-2 focus-within:ring-cuaderno-tinta/40">
          <IconoSubir tamano={18} className="text-cuaderno-grafito" /> Elegir nóminas o certificados
          <input type="file" multiple accept=".xlsx,.xls,.pdf" className="sr-only" onChange={e => { leerArchivosMaestro([...e.target.files]); e.target.value = ""; }} />
        </label>

        {archivosMaestro.length > 0 && (
          <ul className="m-0 mt-2 p-0 list-none">
            {archivosMaestro.map((a, i) => (
              <li key={i} className="flex items-center gap-2 py-1 text-[15px]">
                <IconoDocumento tamano={14} className="text-cuaderno-grafito" /> {a.nombre}
                {a.error ? <span className="text-cuaderno-roja">: {a.error}</span> : <span className="text-cuaderno-grafito">: {a.beneficiarios.length} beneficiarios</span>}
              </li>
            ))}
          </ul>
        )}

        {plan && (
          <div className="mt-3 space-y-3">
            <div className="max-w-md">
              <LineaGuia etiqueta="Fichas nuevas"><span>{plan.crear.length}</span></LineaGuia>
              <LineaGuia etiqueta="Fichas que se completan"><span>{plan.completar.length}</span></LineaGuia>
              <LineaGuia etiqueta="Ya estaban completas"><span className="text-cuaderno-grafito">{plan.completas.length}</span></LineaGuia>
            </div>
            {plan.crear.length > 0 && (
              <div>
                <p className="m-0 text-[15px]">Elige a quiénes crearles ficha (por ejemplo, desmarca a personas que no son proveedores):</p>
                <ul className="m-0 mt-1 p-0 list-none grid gap-x-8 md:grid-cols-2">
                  {plan.crear.map(c => (
                    <li key={c.rut} className="py-1 border-b border-cuaderno-renglon">
                      <Casilla marcada={crearRuts.has(c.rut)} onCambiar={v => setCrearRuts(prev => { const s = new Set(prev); v ? s.add(c.rut) : s.delete(c.rut); return s; })}>
                        <span className="text-[15px]">{casoTitulo(c.beneficiario.nombre)}</span>{" "}
                        <span className="text-[13px] text-cuaderno-grafito">{c.beneficiario.banco}{c.otrasCuentas ? `, ${c.otrasCuentas + 1} cuentas: se usa la última` : ""}</span>
                      </Casilla>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {plan.completar.length > 0 && (
              <p className="m-0 text-[15px] text-cuaderno-grafito">
                Se completan: {plan.completar.map(c => casoTitulo(c.proveedor.razonSocial)).join(", ")}.
              </p>
            )}
            <div className="flex gap-2">
              <Boton variante="primario" onClick={onAplicar} disabled={aplicando || (crearRuts.size === 0 && plan.completar.length === 0)}>
                {aplicando ? "Guardando…" : "Actualizar el maestro"}
              </Boton>
              <Boton variante="texto" onClick={() => { setPlan(null); setArchivosMaestro([]); }}>Descartar</Boton>
            </div>
          </div>
        )}
      </Hoja>
    </div>
  );
}
