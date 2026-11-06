import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useEmpresa } from "../../lib/useEmpresa";
import * as XLSX from "xlsx";
import { fmt, MESES, MESES_S, useContabilidad, leerTextoDetectando } from "./ContabilidadContext";
import {
  Titulo, Hoja, Cifra, LineaGuia, Resaltado, Nota, VistoBueno, Boton, Campo, ModalCuaderno,
  Segmentado, Casilla, FechaHoja, GraficoBarras, casoTitulo, casoOracion,
  IconoAnterior, IconoSiguiente, IconoSubir, IconoMas, IconoBorrar,
} from "../finanzas/cuaderno";
import {
  REGIMENES_TRIBUTARIOS, tasaPrimeraCategoria, tasaPPMSugerida, impuestoMensualAcumulado,
  AYUDA_FILAS, detectarTipoRCV, resumirRCVCompras, resumirRCVVentas, NOMBRE_DOC,
  repartirRCVPorMes, aplicarAporteRCV, aportesRCV, separarRCVPorFila, FILAS_DESTINO_RCV,
} from "../../lib/contabilidad/tributario";
import {
  APORTES_EMPLEADOR, detectarLibroRemuneraciones, resumirLibroRemuneraciones,
} from "../../lib/contabilidad/remuneraciones";
import { detectarHonorarios, resumirHonorarios } from "../../lib/contabilidad/honorarios";
import { detectarKardex, depreciacionDesdeKardex } from "../../lib/contabilidad/kardex";

/**
 * ContabilidadFlujoMensual.jsx
 * ─────────────────────────────
 * Módulo independiente de captura MANUAL del flujo mensual de la empresa
 * (replica la hoja "flujo mensual" que la contadora llevaba en Excel).
 *
 * IMPORTANTE: este módulo NO lee del Libro Diario. Las categorías y montos
 * se ingresan a mano, mes a mes, salvo Compras e Ingresos, que se pueden
 * cargar desde el CSV del RCV del SII (con desglose de lo que es costo y lo
 * que es crédito recuperable). Es un seguimiento paralelo — no afecta ni
 * se recalcula desde los Estados Financieros / ERP del módulo Contabilidad.
 *
 * Criterio tributario (reglas en src/lib/contabilidad/tributario.js):
 *   Base Imponible = Σ filas (estrictamente tributaria, sin multas)
 *   Impto          = automático sobre la base ACUMULADA del año × tasa del
 *                    régimen (o manual si se desactiva)
 *   Utilidad Líq.  = Base Imponible − Impto − Multas (las multas no son
 *                    deducibles, pero sí son salida de caja)
 *
 * Esquema Firestore:
 *   empresas/{empresaId}/flujo_mensual/{anio}   (doc id = año, ej. "2025")
 *   {
 *     anio: 2025,
 *     filas: [
 *       { id: "ingresos", label: "Ingresos", signo: 1, fija: true, valores: [12 números] },
 *       { id: "compras",  label: "Compras",  signo: -1, fija: true, valores: [12 números] },
 *       ... filas fijas ...
 *       { id: "custom_173...", label: "Gtos dic 2024", signo: -1, fija: false, valores: [...] },
 *     ],
 *     impuesto: [12 números],   // fila "Impto" manual (si impuestoAuto = false)
 *     impuestoAuto: true,       // Impto calculado con la tasa del régimen
 *     ppm:      [12 números],   // informativo — PPM cancelado
 *     multas:   [12 números],   // multas/intereses por mora — restan de la Utilidad
 *     rcv: { periodos: { compras: { "2026-02": { porMes: { [mes]: monto }, archivo, ... } } } },
 *          // lo que aporta cada período del RCV a cada mes del año (reimportar
 *          // un período reemplaza su aporte; no duplica)
 *     updatedAt: serverTimestamp(),
 *   }
 *
 * Recuerda agregar la colección "flujo_mensual" a firestore.rules
 * (mismo patrón que chart_of_accounts / journal_entries / periods):
 *
 *   match /flujo_mensual/{anioId} {
 *     allow read, write: if isSuperAdmin() || canWriteEmpresa(empresaId);
 *   }
 */

// ─── Filas fijas por defecto (mismo orden que el Excel original) ─────────────
const FILAS_BASE = [
  { id: "ingresos",       label: "Ingresos",       signo: 1  },
  { id: "compras",        label: "Compras",        signo: -1 },
  { id: "remuneraciones", label: "Remuneraciones", signo: -1 },
  { id: "arriendos",      label: "Arriendos",      signo: -1 },
  { id: "honorarios",     label: "Honorarios",     signo: -1 },
  { id: "finiquitos",     label: "Finiquitos",     signo: -1 },
  { id: "rendiciones",    label: "Rendiciones",    signo: -1 },
  { id: "gastos_financieros", label: "Gastos financieros", signo: -1 },
  { id: "leasing",        label: "Leasing",        signo: -1 },
  { id: "patentes",       label: "Patentes y contribuciones", signo: -1 },
  { id: "depreciacion",   label: "Depreciación (14 A)", signo: -1 },
  { id: "correccion_monetaria", label: "Corrección monetaria (14 A)", signo: -1 },
];

const vacio12 = () => Array(12).fill(0);
const num = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
const sum = arr => arr.reduce((s, v) => s + (num(v)), 0);

function docVacio(anio) {
  return {
    anio,
    filas: FILAS_BASE.map(f => ({ ...f, fija: true, valores: vacio12() })),
    impuesto: vacio12(),
    impuestoAuto: true,
    ppm: vacio12(),
    multas: vacio12(),
    rcv: {},
  };
}

// Normaliza lo que viene de Firestore por si faltan campos o cambia el esquema
function normalizar(raw, anio) {
  if (!raw) return docVacio(anio);
  const filasRaw = Array.isArray(raw.filas) ? raw.filas : [];
  const filas = filasRaw.map(f => ({
    id: f.id || ("custom_" + Math.random().toString(36).slice(2)),
    label: f.label || "Sin nombre",
    signo: f.signo === -1 ? -1 : 1,
    fija: !!f.fija,
    valores: Array.isArray(f.valores) && f.valores.length === 12 ? f.valores.map(num) : vacio12(),
  }));
  const fix12 = arr => (Array.isArray(arr) && arr.length === 12 ? arr.map(num) : vacio12());
  // Filas fijas nuevas (gastos financieros, leasing, patentes): se agregan a
  // los años ya guardados, justo después de la última fila fija existente.
  let filasFinal = filas.length ? filas : docVacio(anio).filas;
  const faltantes = FILAS_BASE.filter(b => !filasFinal.some(f => f.id === b.id));
  if (faltantes.length) {
    const ultimaFija = filasFinal.reduce((idx, f, i) => (f.fija ? i : idx), -1);
    filasFinal = [
      ...filasFinal.slice(0, ultimaFija + 1),
      ...faltantes.map(b => ({ ...b, fija: true, valores: vacio12() })),
      ...filasFinal.slice(ultimaFija + 1),
    ];
  }
  const impuesto = fix12(raw.impuesto);
  return {
    anio,
    filas: filasFinal,
    impuesto,
    // Años guardados antes del cálculo automático: si ya tenían Impto a mano,
    // se respeta (modo manual) hasta que el usuario lo cambie.
    impuestoAuto: typeof raw.impuestoAuto === "boolean" ? raw.impuestoAuto : !impuesto.some(v => v !== 0),
    ppm: fix12(raw.ppm),
    multas: fix12(raw.multas),
    rcv: raw.rcv && typeof raw.rcv === "object" ? raw.rcv : {},
  };
}

// ─── Subcomponentes visuales (diseño cuaderno, el mismo de Finanzas) ──────────

/**
 * Celda editable de la planilla. En reposo muestra la cifra con puntos de
 * miles (negativos en rojo entre paréntesis); al enfocarla se edita el número
 * sin formato. `rcv` marca con resaltador lavanda lo que vino del RCV.
 */
function CeldaInput({ value, onChange, rcv = false, titulo }) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState("");
  const n = num(value);
  return (
    <td className="px-0.5 py-0" title={titulo}>
      {editando ? (
        <input
          autoFocus
          inputMode="decimal"
          value={texto}
          onChange={e => setTexto(e.target.value)}
          onBlur={() => { setEditando(false); onChange(texto.replace(/\./g, "").replace(",", ".")); }}
          onKeyDown={e => { if (e.key === "Enter" || e.key === "Escape") e.currentTarget.blur(); }}
          className="w-full min-h-[36px] bg-cuaderno-tarjeta border-0 border-b-[1.5px] border-cuaderno-tinta px-1 text-right text-[16px] text-cuaderno-tinta focus:outline-none"
        />
      ) : (
        <button
          type="button"
          onClick={() => { setTexto(n ? String(n) : ""); setEditando(true); }}
          className="w-full min-h-[36px] px-1 text-right text-[16px] rounded-sm hover:bg-cuaderno-tarjeta focus:outline-none focus-visible:ring-2 focus-visible:ring-cuaderno-tinta/40"
        >
          {n === 0
            ? <span className="text-cuaderno-columna">·</span>
            : <span className={rcv ? "resaltado resaltado-lavanda" : ""}><Cifra valor={n} escala="pesos" /></span>}
        </button>
      )}
    </td>
  );
}

/** Celda calculada (no editable). raya: "ninguna" | "total" | "doble". */
function CeldaCifra({ value, raya = "ninguna", color = "auto", className = "" }) {
  return (
    <td className={`px-1.5 py-1.5 text-right text-[16px] whitespace-nowrap ${className}`}>
      <Cifra valor={value} escala="pesos" vacio="0" raya={raya} color={color} />
    </td>
  );
}

// ─── Lectura del RCV ──────────────────────────────────────────────────────────
// El SII exporta CSV separado por ";" y con un ";" sobrante al final de cada
// fila de datos: se agrega una columna ficticia al encabezado para que cuadre
// (mismo truco que el importador del Libro Diario).
async function leerFilasRCV(file) {
  if (file.name.toLowerCase().endsWith(".csv")) {
    const texto = await leerTextoDetectando(file);
    const lineas = texto.split(/\r?\n/);
    if (lineas.length && !lineas[0].endsWith(";_extra")) lineas[0] += ";_extra";
    // raw: true = todo como texto. Con raw: false, XLSX leía "01/02/2026" como
    // 2 de enero (mm/dd) y lo convertía en número de serie: las facturas caían
    // en meses equivocados y algunas se perdían.
    const wb = XLSX.read(lineas.join("\n"), { type: "string", raw: true, FS: ";" });
    return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" });
  }
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" });
}

function LineaDesglose({ label, valor, signo = "", tenue = false, fuerte = false, nota }) {
  return (
    <div className={tenue ? "text-cuaderno-grafito" : ""}>
      <LineaGuia etiqueta={<span>{signo && <span className="inline-block w-4">{signo}</span>}{label}</span>}
        className={`min-h-[30px] text-[17px] ${fuerte ? "mt-1" : ""}`}>
        <Cifra valor={valor} escala="pesos" vacio="0" raya={fuerte ? "total" : "ninguna"} color={tenue ? "grafito" : "auto"} />
      </LineaGuia>
      {nota && <p className="m-0 -mt-1 mb-1 pl-4 text-[13px] text-cuaderno-grafito">{nota}</p>}
    </div>
  );
}

/**
 * Todo lo que se muestra y se carga de un RCV, recalculable cuando cambian las
 * reglas de proveedores o el % de diésel: resumen total, reparto por mes y,
 * en compras, cuánto va a cada fila (Compras, Leasing, Gastos financieros…).
 */
function calcularRCV(filasRaw, tipo, config) {
  const opts = { dieselRecuperablePct: config.dieselRecuperablePct, regimen: config.regimen };
  const resumen = tipo === "compras" ? resumirRCVCompras(filasRaw, opts) : resumirRCVVentas(filasRaw);
  const reparto = repartirRCVPorMes(filasRaw, tipo, opts);
  if (tipo !== "compras") {
    return { resumen, reparto, proveedores: [],
      destinos: { ingresos: { monto: resumen.monto, documentos: resumen.documentos, reparto } } };
  }
  const { grupos, proveedores } = separarRCVPorFila(filasRaw, config.reglasFilaRCV || {});
  const destinos = {};
  Object.entries(grupos).forEach(([filaId, filas]) => {
    const r = resumirRCVCompras(filas, opts);
    destinos[filaId] = { monto: r.monto, documentos: r.documentos, reparto: repartirRCVPorMes(filas, "compras", opts) };
  });
  // Control: lo que se reparte en filas tiene que sumar el total del archivo
  const sumaDestinos = Object.values(destinos).reduce((t, d) => t + d.monto, 0);
  const sumaMeses = Object.values(destinos).reduce((t, d) => t + d.reparto.reduce((u, m) => u + m.monto, 0), 0);
  const descuadre = Math.max(Math.abs(sumaDestinos - resumen.monto), Math.abs(sumaMeses - resumen.monto));
  return { resumen, reparto, destinos, proveedores, descuadre };
}

function ModalRCV({ calculo, archivo, regimen, anioActivo, mesInicial, valorActual, onAplicar, onCambiarRegla, onCerrar }) {
  const resumen = { ...calculo.resumen, reparto: calculo.reparto };
  const [mes, setMes] = useState(mesInicial);
  const [criterio, setCriterio] = useState("docto");
  const [aplicando, setAplicando] = useState(false);
  const esCompras = resumen.tipo === "compras";
  const fila = esCompras ? "Compras" : "Ingresos";
  const reparto = resumen.reparto || [];
  const variosMeses = reparto.length > 1;
  const otrosAnios = [...new Set(reparto.filter(r => r.anio !== anioActivo).map(r => r.anio))];
  const p = resumen.mesSugerido;
  const periodoTxt = p ? `${MESES[p.mes].toLowerCase()} ${p.anio}` : "";
  const otros = Object.values(resumen.otros || {});
  const revisar = otros.filter(o => o.tipo === "revisar");
  const ignorados = Object.entries(resumen.ignorados || {});
  const ETIQUETA_OTRO = { credito: ["recuperable", "menta"], diesel: ["diésel", "lavanda"], costo: ["costo", "durazno"], revisar: ["revisar", "rosa"] };

  return (
    <ModalCuaderno
      titulo={`RCV de ${esCompras ? "compras" : "ventas"}`}
      subtitulo={`${archivo} · ${resumen.documentos} documentos${periodoTxt ? ` · período ${periodoTxt}` : ""}`}
      onClose={onCerrar}
      ancho="max-w-2xl"
      bloqueado={aplicando}
      pie={
        <div className="flex flex-wrap items-center justify-end gap-4">
          <Boton variante="texto" onClick={onCerrar} disabled={aplicando}>Cancelar</Boton>
          <Boton variante="primario" disabled={aplicando || calculo.descuadre > 1}
            onClick={async () => { setAplicando(true); try { await onAplicar({ criterio, mes }); } finally { setAplicando(false); } }}>
            {aplicando ? "Cargando…" : <>Cargar <Cifra valor={resumen.monto} escala="pesos" color="heredar" /></>}
          </Boton>
        </div>
      }
    >
      <section>
        <Titulo as="h3" tamano="sm">Cómo se calcula {fila}</Titulo>
        <LineaDesglose label="Neto (facturas y notas de débito)" valor={resumen.neto} signo="+" />
        <LineaDesglose label="Exento" valor={resumen.exento} signo="+" />
        <LineaDesglose label={`Notas de crédito ${esCompras ? "recibidas" : "emitidas"}`} valor={-(resumen.ncNeto + resumen.ncExento)} signo="−" />
        {esCompras && <>
          <LineaDesglose label="IVA no recuperable" valor={resumen.ivaNoRecuperable} signo="+" />
          <LineaDesglose label="Impuesto sin derecho a crédito" valor={resumen.impSinDerecho} signo="+" />
          <LineaDesglose label="Otros impuestos no recuperables" valor={resumen.otrosCosto} signo="+" />
          {resumen.activoFijoExcluido !== 0 && (
            <LineaDesglose label="Activo fijo (se deprecia)" valor={-resumen.activoFijoExcluido} signo="−"
              nota="14 A: la compra se capitaliza; el gasto es la depreciación." />
          )}
        </>}
        <LineaDesglose label={fila} valor={resumen.monto} signo="=" fuerte />
      </section>

      <section>
        <Titulo as="h3" tamano="sm">No entra (no es {esCompras ? "gasto" : "ingreso"})</Titulo>
        {esCompras ? <>
          <LineaDesglose label="IVA crédito recuperable" valor={resumen.ivaRecuperable} tenue />
          {resumen.ivaUsoComun !== 0 && <LineaDesglose label="IVA uso común" valor={resumen.ivaUsoComun} tenue />}
          {resumen.otrosRecuperable !== 0 && <LineaDesglose label="Otros impuestos recuperables" valor={resumen.otrosRecuperable} tenue />}
        </> : <>
          <LineaDesglose label="IVA débito" valor={resumen.iva} tenue />
          {resumen.otrosImpuestos !== 0 && <LineaDesglose label="Otros impuestos recargados" valor={resumen.otrosImpuestos} tenue />}
          {resumen.creditoConstructora !== 0 && <LineaDesglose label="Crédito especial empresa constructora" valor={resumen.creditoConstructora} tenue
            nota="Se descuenta en el F29; no cambia el ingreso." />}
        </>}
        <LineaDesglose label="Total de los documentos" valor={resumen.total} tenue />
        {esCompras && resumen.activoFijoNeto !== 0 && resumen.activoFijoExcluido === 0 && (
          <LineaDesglose label="…de lo cual es activo fijo" valor={resumen.activoFijoNeto} tenue
            nota="En 14 D N°3 se rebaja completo: ya está dentro de Compras." />
        )}
      </section>

      {otros.length > 0 && (
        <section>
          <Titulo as="h3" tamano="sm">Otros impuestos por código</Titulo>
          {otros.map(o => (
            <LineaGuia key={o.codigo} className="min-h-[30px] text-[17px]"
              etiqueta={<span>{o.nombre} <span className="text-[14px] text-cuaderno-grafito">· {o.docs} doc.</span> <Resaltado color={ETIQUETA_OTRO[o.tipo]?.[1]} className="text-[14px]">{ETIQUETA_OTRO[o.tipo]?.[0]}</Resaltado></span>}>
              <Cifra valor={o.monto} escala="pesos" vacio="0" />
            </LineaGuia>
          ))}
        </section>
      )}

      {!esCompras && resumen.notasCredito?.length > 0 && (
        <section>
          <Titulo as="h3" tamano="sm">Notas de crédito emitidas</Titulo>
          {resumen.notasCredito.map(nc => (
            <div key={nc.folio}>
              <LineaGuia className="min-h-[30px] text-[17px]" etiqueta={`NC ${nc.folio} · ${casoTitulo(nc.cliente)}`}>
                <Cifra valor={-nc.monto} escala="pesos" />
              </LineaGuia>
              <p className="m-0 -mt-1 text-[13px] text-cuaderno-grafito">
                {nc.refFolio ? `${nc.anula ? "Anula" : "Rebaja"} ${NOMBRE_DOC[nc.refTipo] || "documento"} ${nc.refFolio}` : "Sin documento de referencia"}
                {nc.anula && " · si se refacturó, la nueva factura va en su mes"}
              </p>
            </div>
          ))}
        </section>
      )}

      {esCompras && (
        <section>
          <Titulo as="h3" tamano="sm">Se reparte en estas filas</Titulo>
          {Object.keys(FILAS_DESTINO_RCV).filter(id => calculo.destinos[id]).map(id => (
            <LineaDesglose key={id} label={`${FILAS_DESTINO_RCV[id]} · ${calculo.destinos[id].documentos} doc.`} valor={calculo.destinos[id].monto} />
          ))}
          {calculo.proveedores.length > 0 && (
            <div className="mt-3">
              <p className="m-0 mb-1 text-[15px] text-cuaderno-grafito">
                Leasing, bancos y factoring facturan, así que vienen en el RCV de compras. Elige a qué fila va cada uno: la regla queda guardada para los próximos meses. La base imponible no cambia, solo el detalle.
              </p>
              <ul className="m-0 p-0 list-none">
                {calculo.proveedores.map(pv => (
                  <li key={pv.rut} className="flex items-end justify-between gap-3 py-1.5 border-b border-cuaderno-renglon last:border-0">
                    <span className="min-w-0 text-[17px]">
                      <span className="block truncate">{casoTitulo(pv.nombre)}</span>
                      <span className="text-[13px] text-cuaderno-grafito">{pv.rutTxt} · {pv.docs} doc.</span>
                      {pv.sugerido && <Resaltado color="durazno" className="ml-1 text-[13px]">¿financiero?</Resaltado>}
                    </span>
                    <Campo as="select" className="w-48 flex-shrink-0" aria-label={`Fila de ${pv.nombre}`}
                      value={pv.fila} onChange={e => onCambiarRegla(pv, e.target.value)}>
                      {Object.entries(FILAS_DESTINO_RCV).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                    </Campo>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {(calculo.descuadre > 1 || revisar.length > 0 || Math.abs(resumen.sinExplicar || 0) > 10 || ignorados.length > 0
        || (!esCompras && regimen === "14D3") || Object.keys(resumen.noDelGiro || {}).length > 0) && (
        <section className="space-y-2">
          {calculo.descuadre > 1 && (
            <Nota etiqueta="Ojo:">El reparto por mes y por fila no suma el total del archivo (diferencia <Cifra valor={calculo.descuadre} escala="pesos" color="heredar" />). No se puede cargar: avisa a soporte con este archivo.</Nota>
          )}
          {Object.entries(resumen.noDelGiro || {}).map(([tipo, g]) => (
            <Nota key={tipo} etiqueta="Ojo:">Venta de {tipo.toLowerCase()} ({g.docs} doc., <Cifra valor={g.monto} escala="pesos" color="heredar" />): entra completa a Ingresos, pero en 14 A se rebaja su valor tributario no depreciado. Agrega ese costo con la contadora.</Nota>
          ))}
          {revisar.length > 0 && (
            <Nota etiqueta="Ojo:">Hay impuestos con códigos que FleetCore no reconoce ({revisar.map(o => o.codigo || "sin código").join(", ")}). Se suman a Compras como costo, que es lo conservador. Confirma con la contadora si alguno da derecho a crédito.</Nota>
          )}
          {Math.abs(resumen.sinExplicar || 0) > 10 && (
            <Nota etiqueta="Ojo:"><Cifra valor={resumen.sinExplicar} escala="pesos" color="heredar" /> del total de los documentos no calza con ninguna columna (neto, exento, IVA, otros impuestos). Revisa el detalle en el CSV.</Nota>
          )}
          {ignorados.length > 0 && (
            <Nota etiqueta="Nota:" tono="grafito">No se consideran: {ignorados.map(([t, n]) => `${NOMBRE_DOC[t] || "tipo " + t} (${n})`).join(", ")}.</Nota>
          )}
          {!esCompras && regimen === "14D3" && (
            <Nota etiqueta="Nota:" tono="grafito">El RCV registra las ventas cuando se emiten. En 14 D N°3 el ingreso cuenta cuando se percibe (una factura cedida en factoring se considera percibida al cederse). Ajusta el mes si la cobraste en otro.</Nota>
          )}
        </section>
      )}

      <section className="space-y-3">
        <Titulo as="h3" tamano="sm">Dónde se carga</Titulo>
        <Segmentado
          opciones={[{ id: "docto", label: "En el mes de cada documento" }, { id: "mes", label: "Todo en un mes" }]}
          valor={criterio}
          onCambiar={setCriterio}
        />
        {criterio === "docto" ? (
          <div>
            {variosMeses && <p className="m-0 mb-1 text-[15px] text-cuaderno-grafito">El RCV de {periodoTxt} trae documentos de {reparto.length} meses.</p>}
            {reparto.map(r => (
              <LineaGuia key={`${r.anio}-${r.mes}`} className="min-h-[30px] text-[17px]"
                etiqueta={<span>{MESES[r.mes]} {r.anio} <span className="text-[14px] text-cuaderno-grafito">· {r.documentos} doc.</span>{r.anio !== anioActivo && <Resaltado color="lavanda" className="ml-1 text-[14px]">se guarda en {r.anio}</Resaltado>}</span>}>
                <Cifra valor={r.monto} escala="pesos" vacio="0" />
              </LineaGuia>
            ))}
          </div>
        ) : (
          <div className="flex flex-wrap items-end gap-4">
            <Campo as="select" etiqueta="Mes" className="w-52" value={mes} onChange={e => setMes(parseInt(e.target.value, 10))}>
              {MESES.map((m, i) => <option key={m} value={i}>{m} {anioActivo}</option>)}
            </Campo>
            {valorActual(mes) !== 0 && <p className="m-0 pb-2 text-[15px] text-cuaderno-grafito">hoy tiene <Cifra valor={valorActual(mes)} escala="pesos" color="heredar" /></p>}
          </div>
        )}
        <p className="m-0 text-[14px] text-cuaderno-grafito">
          Si ya habías importado este período, se reemplaza lo que aportó antes (no se duplica). Los montos escritos a mano se mantienen.
          {criterio === "docto" && otrosAnios.length > 0 && ` Lo de ${otrosAnios.join(", ")} se guarda de inmediato en ese año.`}
        </p>
      </section>
    </ModalCuaderno>
  );
}

function ModalKardex({ resumen, archivo, regimen, onAplicar, onCerrar }) {
  const [aplicando, setAplicando] = useState(false);
  const [verActivos, setVerActivos] = useState(false);
  const r = resumen;
  const exceso = r.totalFormulaAnterior - r.total;
  return (
    <ModalCuaderno
      titulo={`Depreciación ${r.anio} desde el kardex`}
      subtitulo={`${archivo} · hoja ${r.hoja} (cierre) · ${r.activos.length} activos`}
      onClose={onCerrar}
      ancho="max-w-2xl"
      bloqueado={aplicando}
      pie={
        <div className="flex flex-wrap items-center justify-end gap-4">
          <Boton variante="texto" onClick={onCerrar} disabled={aplicando}>Cancelar</Boton>
          <Boton variante="primario" disabled={aplicando}
            onClick={async () => { setAplicando(true); try { await onAplicar(); } finally { setAplicando(false); } }}>
            {aplicando ? "Cargando…" : <>Cargar <Cifra valor={r.total} escala="pesos" color="heredar" /> en Depreciación</>}
          </Boton>
        </div>
      }
    >
      {regimen && regimen !== "14A" && (
        <Nota etiqueta="Ojo:">Estás en un régimen Pro Pyme: ahí el activo fijo se rebaja completo al comprarlo y la fila Depreciación no se usa. Cárgala solo si la empresa está en 14 A.</Nota>
      )}
      <section>
        <Titulo as="h3" tamano="sm">Cómo se calcula</Titulo>
        <p className="m-0 mb-2 text-[15px] text-cuaderno-grafito">
          Depreciación lineal sobre lo que queda por depreciar: valor residual al cierre de {r.anioBase} ÷ meses de vida útil que le quedan. Cada activo termina exactamente en cero al fin de su vida útil.
        </p>
        {Object.entries(r.porCuenta).map(([cta, v]) => (
          <LineaDesglose key={cta} label={casoOracion(cta)} valor={v} signo="+" />
        ))}
        <LineaDesglose label={`Depreciación ${r.anio}`} valor={r.total} signo="=" fuerte />
        <LineaDesglose label={`Valor residual al cierre de ${r.anioBase}`} valor={r.residualTotal} tenue />
        <p className="m-0 mt-1 text-[14px] text-cuaderno-grafito">Se reparte mes a mes: <Cifra valor={r.porMes[0]} escala="pesos" color="heredar" /> en enero{r.porMes[11] !== r.porMes[0] ? "; baja en los meses en que algún activo termina su vida útil" : " y lo mismo cada mes"}.</p>
      </section>

      {exceso > 1000 && (
        <section>
          <Nota etiqueta="Ojo:">
            El kardex calculaba la depreciación como valor <Resaltado color="rosa">bruto</Resaltado> ÷ meses restantes × 12. Como divide el valor completo por una vida que se acorta, la cuota sube cada año y al final se deprecia más que el costo del activo. Con esa fórmula {r.anio} daría <Cifra valor={r.totalFormulaAnterior} escala="pesos" color="heredar" />, es decir <Cifra valor={exceso} escala="pesos" color="heredar" /> de más. Revisen con la contadora los años anteriores: en {r.anioBase} se rebajaron <Cifra valor={r.depreciacionAnioBase} escala="pesos" color="heredar" />.
          </Nota>
        </section>
      )}

      <section>
        <Boton variante="texto" onClick={() => setVerActivos(v => !v)}>{verActivos ? "Ocultar activos" : `Ver los ${r.activos.length} activos`}</Boton>
        {verActivos && (
          <div className="overflow-x-auto mt-2">
            <table className="w-full border-collapse text-[15px]">
              <thead>
                <tr className="shadow-[inset_0_-1.5px_0_rgb(var(--cuaderno-tinta))]">
                  {["Activo", "Residual", "Meses", `${r.anio}`].map((t, i) => (
                    <th key={t} className={`px-2 py-1.5 font-normal text-[14px] text-cuaderno-grafito ${i === 0 ? "text-left" : "text-right"}`}>{t}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {r.activos.map((a, i) => (
                  <tr key={i} className="border-b border-cuaderno-renglon">
                    <td className="px-2 py-1"><span className="block max-w-[280px] truncate">{casoOracion(a.descripcion)}</span><span className="text-[12px] text-cuaderno-grafito">{casoOracion(a.cuenta)}</span></td>
                    <td className="px-2 py-1 text-right"><Cifra valor={a.residual} escala="pesos" /></td>
                    <td className="px-2 py-1 text-right">{a.restante}</td>
                    <td className="px-2 py-1 text-right"><Cifra valor={a.delAnio} escala="pesos" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {r.omitidos.length > 0 && (
          <p className="m-0 mt-2 text-[14px] text-cuaderno-grafito">No se deprecian: {r.omitidos.map(o => `${casoOracion(o.descripcion)} (${o.motivo})`).join(", ")}.</p>
        )}
      </section>

      <section className="space-y-2">
        <Nota etiqueta="Nota:" tono="grafito">
          En 14 A el activo fijo también lleva corrección monetaria (art. 41 LIR): se reajusta por IPC al cierre y la depreciación se calcula sobre el valor reajustado. El kardex no la aplica desde 2023. Cárgala en la fila Corrección monetaria cuando la contadora la calcule.
        </Nota>
        <Nota etiqueta="Nota:" tono="grafito">
          Las vidas útiles salen del kardex. Revisen con la contadora que calcen con la tabla del SII (por ejemplo, dos camiones están a 15 años y el resto de los vehículos a 7) y si conviene depreciación acelerada para equipos nuevos.
        </Nota>
        <p className="m-0 text-[14px] text-cuaderno-grafito">Si vuelves a importar el kardex, se reemplaza lo anterior. Si compran o venden un activo, actualicen el kardex y vuelvan a importarlo.</p>
      </section>
    </ModalCuaderno>
  );
}

function ModalHonorarios({ resumen, archivo, anioActivo, onAplicar, onCerrar }) {
  const [aplicando, setAplicando] = useState(false);
  const r = resumen;
  const anioCarga = r.anio ?? anioActivo;
  const filas = r.meses.filter(m => r.mesesInformados.includes(m.mes));
  return (
    <ModalCuaderno
      titulo="Boletas de honorarios recibidas"
      subtitulo={`${archivo} · ${r.tipo === "anual" ? "informe anual" : "informe mensual"} ${anioCarga} · ${r.boletas} boletas vigentes`}
      onClose={onCerrar}
      ancho="max-w-2xl"
      bloqueado={aplicando}
      pie={
        <div className="flex flex-wrap items-center justify-end gap-4">
          <Boton variante="texto" onClick={onCerrar} disabled={aplicando}>Cancelar</Boton>
          <Boton variante="primario" disabled={aplicando}
            onClick={async () => { setAplicando(true); try { await onAplicar(anioCarga); } finally { setAplicando(false); } }}>
            {aplicando ? "Cargando…" : <>Cargar <Cifra valor={r.bruto} escala="pesos" color="heredar" /> en Honorarios</>}
          </Boton>
        </div>
      }
    >
      <section>
        <p className="m-0 mb-2 text-[15px] text-cuaderno-grafito">
          El gasto es el honorario <Resaltado color="durazno">bruto</Resaltado> de las boletas vigentes. La retención es parte del bruto: la empresa se la paga al SII en el F29 (código 151) en vez de al prestador. Va en el mes de la boleta.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[16px]">
            <thead>
              <tr className="shadow-[inset_0_-1.5px_0_rgb(var(--cuaderno-tinta))]">
                {["Mes", "Boletas", "Bruto", "Retención", "Líquido"].map((t, i) => (
                  <th key={t} className={`px-2 py-1.5 font-normal text-[14px] text-cuaderno-grafito ${i === 0 ? "text-left" : "text-right"}`}>{t}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filas.map(m => (
                <tr key={m.mes} className="border-b border-cuaderno-renglon">
                  <td className="px-2 py-1">{MESES[m.mes]}</td>
                  <td className="px-2 py-1 text-right">{m.boletas || "·"}{m.anuladas ? <span className="text-[13px] text-cuaderno-grafito"> +{m.anuladas} anulada{m.anuladas > 1 ? "s" : ""}</span> : null}</td>
                  <td className="px-2 py-1 text-right"><Cifra valor={m.bruto} escala="pesos" vacio="·" /></td>
                  <td className="px-2 py-1 text-right"><Cifra valor={m.retencionTerceros + m.retencionContribuyente} escala="pesos" vacio="·" color="grafito" /></td>
                  <td className="px-2 py-1 text-right"><Cifra valor={m.liquido} escala="pesos" vacio="·" color="grafito" /></td>
                </tr>
              ))}
              <tr>
                <td className="px-2 py-1.5">Total</td>
                <td className="px-2 py-1.5 text-right">{r.boletas}</td>
                <td className="px-2 py-1.5 text-right"><Cifra valor={r.bruto} escala="pesos" vacio="0" raya="total" /></td>
                <td className="px-2 py-1.5 text-right"><Cifra valor={r.retencionTerceros + r.retencionContribuyente} escala="pesos" vacio="0" color="grafito" /></td>
                <td className="px-2 py-1.5 text-right"><Cifra valor={r.liquido} escala="pesos" vacio="0" color="grafito" /></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-2">
        {r.retencionContribuyente > 0 && (
          <Nota etiqueta="Nota:" tono="grafito">
            <Cifra valor={r.retencionContribuyente} escala="pesos" color="heredar" /> de la retención la pagó el propio prestador (retención contribuyente), no la empresa. Igual es parte del bruto, así que el gasto no cambia.
          </Nota>
        )}
        {r.descuadre > 10 && (
          <Nota etiqueta="Ojo:">En algunos meses bruto − retención no da el líquido (diferencia <Cifra valor={r.descuadre} escala="pesos" color="heredar" />). Revisa el informe en el SII.</Nota>
        )}
        {r.anio == null && (
          <Nota etiqueta="Ojo:">El archivo no dice de qué año es: se cargará en {anioActivo}, el año que estás viendo.</Nota>
        )}
        <p className="m-0 text-[14px] text-cuaderno-grafito">
          {r.tipo === "anual"
            ? "El informe anual reemplaza los 12 meses de Honorarios que vinieron de archivos anteriores (un mes sin boletas queda en cero)."
            : "Se reemplazan solo los meses que trae este informe."}
          {" "}Lo escrito a mano se mantiene. Cuadra el total de retenciones con el código 151 de los F29 y, en marzo, con la declaración jurada 1879.
          {anioCarga !== anioActivo && ` Como es de ${anioCarga}, se guarda de inmediato en ese año.`}
        </p>
      </section>
    </ModalCuaderno>
  );
}

function ModalRemuneraciones({ resumen, archivo, anioActivo, onAplicar, onCerrar }) {
  const [aplicando, setAplicando] = useState(false);
  const r = resumen;
  const periodoTxt = r.anio != null ? `${MESES[r.mes]} ${r.anio}` : "";
  return (
    <ModalCuaderno
      titulo="Libro de remuneraciones"
      subtitulo={`${archivo} · ${r.trabajadores} trabajadores · ${periodoTxt}`}
      onClose={onCerrar}
      ancho="max-w-2xl"
      bloqueado={aplicando}
      pie={
        <div className="flex flex-wrap items-center justify-end gap-4">
          <Boton variante="texto" onClick={onCerrar} disabled={aplicando}>Cancelar</Boton>
          <Boton variante="primario" disabled={aplicando || r.anio == null}
            onClick={async () => { setAplicando(true); try { await onAplicar(); } finally { setAplicando(false); } }}>
            {aplicando ? "Cargando…" : `Cargar en ${periodoTxt.toLowerCase()}`}
          </Boton>
        </div>
      }
    >
      <section>
        <Titulo as="h3" tamano="sm">Remuneraciones</Titulo>
        <LineaDesglose label="Remuneración total (imponible + no imponible)" valor={r.haberes} signo="+" />
        <LineaDesglose label="Indemnizaciones del finiquito (van a Finiquitos)" valor={-r.indemnizaciones} signo="−" />
        {APORTES_EMPLEADOR.filter(a => r.aportes[a.id]).map(a => (
          <LineaDesglose key={a.id} label={a.nombre} valor={r.aportes[a.id]} signo="+" />
        ))}
        <LineaDesglose label="Remuneraciones" valor={r.remuneraciones} signo="=" fuerte />
      </section>

      {(r.indemnizaciones !== 0 || r.descuentoAFC !== 0) && (
        <section>
          <Titulo as="h3" tamano="sm">Finiquitos</Titulo>
          <LineaDesglose label="Indemnización por años de servicio" valor={r.ias} signo="+" />
          <LineaDesglose label="Vacaciones pendientes (feriado proporcional)" valor={r.vacaciones} signo="+" />
          {r.descuentoAFC !== 0 && (
            <LineaDesglose label="Descuento AFC" valor={-r.descuentoAFC} signo="−"
              nota="Art. 13 Ley 19.728: lo que la empresa aportó a la cuenta de cesantía se imputa a la indemnización; no lo paga ahora." />
          )}
          <LineaDesglose label="Finiquitos" valor={r.finiquitos} signo="=" fuerte />
        </section>
      )}

      <section>
        <Titulo as="h3" tamano="sm">No se suma (ya está dentro de la remuneración total)</Titulo>
        <LineaDesglose label="Descuentos legales del trabajador (AFP, salud, cesantía)" valor={r.descuentosLegales} tenue />
        <LineaDesglose label="Impuesto único" valor={r.impuestos} tenue />
        <LineaDesglose label="Anticipos y otros descuentos" valor={r.otrosDescuentos} tenue />
        <LineaDesglose label="Líquido a pago" valor={r.liquido} tenue />
      </section>

      {(r.duplicados.length > 0 || r.sobreTope > 0 || r.faltan.length > 0) && (
        <section className="space-y-2">
          {r.faltan.length > 0 && <Nota etiqueta="Ojo:">Al libro le faltan columnas: {r.faltan.join(", ")}.</Nota>}
          {r.duplicados.length > 0 && (
            <Nota etiqueta="Ojo:">
              El libro repite el finiquito de {r.duplicados.map(d => casoTitulo(d.nombre)).join(", ")}: aparece como documento aparte y otra vez dentro de su liquidación del mes, por el mismo monto (<Cifra valor={r.montoDuplicados} escala="pesos" color="heredar" /> en total). Se cuenta una sola vez. Confirma en Talana que no se pagó dos veces.
            </Nota>
          )}
          {r.sobreTope > 0 && (
            <Nota etiqueta="Nota:" tono="grafito">
              {r.sobreTope === 1 ? "Un trabajador gana" : `${r.sobreTope} trabajadores ganan`} sobre el tope imponible: se usa la remuneración total, no la imponible. Si son socios, su sueldo solo es gasto si trabajan efectivamente en la empresa y es de mercado.
            </Nota>
          )}
        </section>
      )}

      <p className="m-0 text-[14px] text-cuaderno-grafito">
        Se carga en {periodoTxt.toLowerCase()}, el mes al que corresponden las remuneraciones (devengado), aunque se paguen al mes siguiente. Si vuelves a importar este mes, se reemplaza lo anterior (no se duplica) y los montos escritos a mano se mantienen.
        {r.anio != null && r.anio !== anioActivo && ` Como es de ${r.anio}, se guarda de inmediato en ese año.`}
      </p>
    </ModalCuaderno>
  );
}

function ConfigTributaria({ config, onCambiar, anio, tasa, tasaPPM }) {
  const sinRegimen = !config.regimen;
  const pct = v => `${(v * 100).toLocaleString("es-CL", { maximumFractionDigits: 3 })}%`;
  return (
    <Hoja titulo="Régimen tributario">
      <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
        <Campo as="select" etiqueta="Régimen" className="w-80" value={config.regimen} onChange={e => onCambiar({ regimen: e.target.value })}>
          <option value="">Sin definir (se usa 27%)</option>
          {REGIMENES_TRIBUTARIOS.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
        </Campo>
        <p className="m-0 pb-2 text-[18px]">Impuesto {anio}: <Resaltado color="durazno">{pct(tasa)}</Resaltado></p>
        {config.regimen === "14A" ? (
          <Campo etiqueta="Tasa PPM, del F22 (%)" className="w-44" type="number" step="0.01" min="0"
            value={config.tasaPPM14A || ""} placeholder="0"
            onChange={e => onCambiar({ tasaPPM14A: parseFloat(e.target.value) || 0 })} />
        ) : config.regimen !== "14D8" && (
          <Casilla marcada={!!config.ingresosSobre50milUF} onCambiar={v => onCambiar({ ingresosSobre50milUF: v })}
            descripcion={`PPM ${pct(tasaPPM)}`}>
            Ingresos del año anterior sobre 50.000 UF
          </Casilla>
        )}
        <Campo etiqueta="Diésel recuperable (%)" className="w-44" type="number" min="0" max="100"
          value={config.dieselRecuperablePct || ""} placeholder="0"
          ayuda="Ley 18.502: maquinaria fuera de vías públicas"
          onChange={e => onCambiar({ dieselRecuperablePct: Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)) })} />
      </div>
      {sinRegimen && (
        <Nota etiqueta="Ojo:" className="mt-3">Elige el régimen (aparece en Mi SII, datos de la empresa). En Pro Pyme General la tasa es 12,5% en 2025-2027; con 27% el impuesto queda sobreestimado.</Nota>
      )}
      {config.regimen === "14D3" && anio >= 2025 && anio <= 2028 && (
        <Nota etiqueta="Nota:" tono="grafito" className="mt-3">La tasa rebajada exige estar al día con la cotización del empleador de la reforma previsional al cierre del año.</Nota>
      )}
    </Hoja>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function ContabilidadFlujoMensual() {
  const { empresaId } = useEmpresa();
  const { configTributaria, guardarConfigTributaria } = useContabilidad();
  const anioActual = new Date().getFullYear();

  const [anio, setAnio]           = useState(anioActual);
  const [data, setData]           = useState(() => docVacio(anioActual));
  const [original, setOriginal]   = useState(() => docVacio(anioActual));
  const [cargando, setCargando]   = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [nuevaFila, setNuevaFila] = useState({ abierto: false, label: "", signo: -1 });
  const [rcv, setRcv]             = useState(null);   // resumen del RCV que se está por cargar
  const [rem, setRem]             = useState(null);   // libro de remuneraciones que se está por cargar
  const [hon, setHon]             = useState(null);   // informe de boletas de honorarios que se está por cargar
  const [kdx, setKdx]             = useState(null);   // depreciación calculada desde el kardex
  const [errorRcv, setErrorRcv]   = useState("");
  const [verAyuda, setVerAyuda]   = useState(false);
  const inputRcv = useRef(null);

  const dirty = JSON.stringify(data) !== JSON.stringify(original);

  // ── Cargar documento del año activo ──
  useEffect(() => {
    if (!empresaId) return;
    let cancelado = false;
    setCargando(true);
    (async () => {
      try {
        const ref = doc(db, "empresas", empresaId, "flujo_mensual", String(anio));
        const snap = await getDoc(ref);
        const norm = snap.exists() ? normalizar(snap.data(), anio) : docVacio(anio);
        if (!cancelado) { setData(norm); setOriginal(norm); }
      } catch (e) {
        console.error("Error cargando flujo mensual:", e);
        if (!cancelado) { const vac = docVacio(anio); setData(vac); setOriginal(vac); }
      } finally {
        if (!cancelado) setCargando(false);
      }
    })();
    return () => { cancelado = true; };
  }, [empresaId, anio]);

  // ── Guardado automático ──
  // Antes solo se guardaba con el botón: al cambiar de pestaña o cerrar la app
  // sin apretarlo se perdía todo lo importado. Ahora cada cambio se guarda
  // solo, 1 s después del último, y al salir de la pantalla se guarda lo que
  // quede pendiente.
  const [errorGuardado, setErrorGuardado] = useState(false);
  const pendienteRef = useRef(null);      // { empresaId, anio, data } sin guardar
  const escribir = useCallback(async ({ empresaId: emp, anio: a, data: d }) => {
    const ref = doc(db, "empresas", emp, "flujo_mensual", String(a));
    // JSON quita los undefined, que Firestore rechaza
    await setDoc(ref, { ...JSON.parse(JSON.stringify(d)), updatedAt: serverTimestamp() });
  }, []);
  const guardar = useCallback(async () => {
    const p = pendienteRef.current;
    if (!p) return;
    setGuardando(true);
    try {
      await escribir(p);
      if (pendienteRef.current === p) pendienteRef.current = null;
      setOriginal(p.data);
      setErrorGuardado(false);
    } catch (e) {
      console.error("Error guardando flujo mensual:", e);
      setErrorGuardado(true);
    } finally {
      setGuardando(false);
    }
  }, [escribir]);

  useEffect(() => {
    if (cargando || !empresaId || !dirty) return;
    pendienteRef.current = { empresaId, anio, data };
    const t = setTimeout(guardar, 1000);
    return () => clearTimeout(t);
  }, [data, dirty, cargando, empresaId, anio, guardar]);

  // Al desmontar (cambiar de pestaña del módulo) o cerrar la página
  useEffect(() => {
    const alSalir = () => { if (pendienteRef.current) escribir(pendienteRef.current).catch(() => {}); };
    window.addEventListener("pagehide", alSalir);
    return () => { window.removeEventListener("pagehide", alSalir); alSalir(); };
  }, [escribir]);

  async function cambiarAnio(nuevo) {
    if (dirty) { pendienteRef.current = { empresaId, anio, data }; await guardar(); }
    setAnio(nuevo);
  }

  // ── Edición ──
  function setValorFila(filaId, mesIdx, valor) {
    setData(d => ({
      ...d,
      filas: d.filas.map(f => f.id === filaId
        ? { ...f, valores: f.valores.map((v, i) => (i === mesIdx ? num(valor) : v)) }
        : f),
    }));
  }
  function setValorExtra(campo, mesIdx, valor) {
    setData(d => ({ ...d, [campo]: d[campo].map((v, i) => (i === mesIdx ? num(valor) : v)) }));
  }
  function agregarFila() {
    const label = nuevaFila.label.trim();
    if (!label) return;
    const id = "custom_" + Date.now();
    setData(d => ({
      ...d,
      filas: [...d.filas, { id, label, signo: nuevaFila.signo, fija: false, valores: vacio12() }],
    }));
    setNuevaFila({ abierto: false, label: "", signo: -1 });
  }
  function eliminarFila(id, label) {
    if (!window.confirm(`¿Eliminar la fila "${label}"? Se perderán sus valores.`)) return;
    setData(d => ({ ...d, filas: d.filas.filter(f => f.id !== id) }));
  }

  // ── RCV del SII → Compras / Ingresos ──
  async function abrirRCV(file) {
    setErrorRcv("");
    if (!file) return;
    try {
      // Libro de remuneraciones (Excel de Talana): se reconoce por la columna
      // "Rut del Trabajador" y se resume aparte.
      if (!file.name.toLowerCase().endsWith(".csv")) {
        // El SII entrega .xls que por dentro son tablas HTML en Windows-1252:
        // se decodifican antes, si no los acentos (y el año) salen dañados.
        const buf = await file.arrayBuffer();
        const inicio = new TextDecoder("latin1").decode(buf.slice(0, 64)).trimStart();
        const wb = inicio.startsWith("<")
          ? XLSX.read(await leerTextoDetectando(file), { type: "string", raw: true })
          : XLSX.read(buf, { type: "array" });
        const arr = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "" });
        // Kardex de activo fijo: una hoja por año con "V. Residual" y "Restante"
        const hojas = Object.fromEntries(wb.SheetNames.map(n => [n, XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, defval: "" })]));
        if (detectarKardex(hojas).length) {
          const k = depreciacionDesdeKardex(hojas, anio);
          if (!k) { setErrorRcv(`El kardex no tiene una hoja de un año anterior a ${anio} para proyectar la depreciación.`); return; }
          setKdx({ ...k, archivo: file.name });
          return;
        }
        if (detectarHonorarios(arr)) {
          const h = resumirHonorarios(arr);
          if (!h || (!h.boletas && !h.anuladas)) { setErrorRcv("El informe de honorarios no trae boletas."); return; }
          setHon({ ...h, archivo: file.name });
          return;
        }
        if (detectarLibroRemuneraciones(arr) >= 0) {
          const r = resumirLibroRemuneraciones(arr);
          if (!r?.documentos) { setErrorRcv("El libro de remuneraciones no trae trabajadores."); return; }
          setRem({ ...r, archivo: file.name });
          return;
        }
      }
      const filas = await leerFilasRCV(file);
      const tipo = detectarTipoRCV(filas);
      if (!tipo) { setErrorRcv("No se reconoce el archivo. Sirven: RCV de compras o ventas del SII (CSV), informe de boletas de honorarios recibidas del SII, libro de remuneraciones de Talana y kardex de activo fijo."); return; }
      const prueba = tipo === "compras" ? resumirRCVCompras(filas) : resumirRCVVentas(filas);
      if (!prueba.documentos) { setErrorRcv("El archivo no tiene facturas ni notas de crédito/débito."); return; }
      setRcv({ filas, tipo, archivo: file.name });
    } catch (e) {
      console.error("Error leyendo RCV:", e);
      setErrorRcv(`No se pudo leer el archivo: ${e.message}`);
    } finally {
      if (inputRcv.current) inputRcv.current.value = "";
    }
  }
  // Se recalcula si cambian las reglas de proveedores o el % de diésel
  const calculoRcv = useMemo(
    () => (rcv ? calcularRCV(rcv.filas, rcv.tipo, configTributaria) : null),
    [rcv, configTributaria]);

  function cambiarReglaProveedor(pv, fila) {
    const reglas = { ...(configTributaria.reglasFilaRCV || {}), [pv.rut]: { fila, nombre: pv.nombre } };
    guardarConfigTributaria({ reglasFilaRCV: reglas }).catch(e => {
      console.error("Error guardando regla de proveedor:", e);
      alert("No se pudo guardar la regla. Intenta nuevamente.");
    });
  }

  async function aplicarRCV({ criterio, mes }) {
    const c = calculoRcv;
    const r = c.resumen;
    const p = r.mesSugerido || { anio, mes };
    const periodo = `${p.anio}-${String(p.mes + 1).padStart(2, "0")}`;
    // En compras se recorren TODAS las filas destino, aunque hoy no reciban
    // nada: así, si un proveedor cambió de fila, se borra su aporte anterior.
    const filasDestino = rcv.tipo === "compras" ? Object.keys(FILAS_DESTINO_RCV) : ["ingresos"];

    // filaId → año → { porMes, documentosPorMes }
    const aportes = {};
    const anios = new Set([anio]);
    filasDestino.forEach(filaId => {
      const dest = c.destinos[filaId];
      const asign = !dest ? []
        : criterio === "docto" ? dest.reparto
        : [{ anio, mes, monto: dest.monto, documentos: dest.documentos }];
      const porAnio = aportes[filaId] = {};
      asign.forEach(a => {
        const y = porAnio[a.anio] ||= { porMes: {}, documentosPorMes: {} };
        y.porMes[a.mes] = (y.porMes[a.mes] || 0) + a.monto;
        y.documentosPorMes[a.mes] = (y.documentosPorMes[a.mes] || 0) + a.documentos;
        anios.add(a.anio);
      });
      // Años que este período tocó antes en esta fila
      (data.rcv?.periodos?.[filaId]?.[periodo]?.otrosAnios || []).forEach(y => anios.add(y));
    });
    const otrosAnios = [...anios].filter(y => y !== anio);

    // Se guarda el desglose junto al monto para poder explicar la cifra después
    const trazaBase = {
      archivo: rcv.archivo, documentos: r.documentos, montoArchivo: r.monto, criterio,
      neto: r.neto, exento: r.exento, nc: r.ncNeto + r.ncExento,
      ...(rcv.tipo === "compras" ? {
        ivaNoRecuperable: r.ivaNoRecuperable, impSinDerecho: r.impSinDerecho,
        otrosCosto: r.otrosCosto, otrosRecuperable: r.otrosRecuperable,
        activoFijoNeto: r.activoFijoNeto,
      } : {}),
      cargadoEn: new Date().toISOString(),
    };
    const aplicarTodo = (docAnio, y, extra = {}) => filasDestino.reduce((acc, filaId) =>
      aplicarAporteRCV(acc, filaId, periodo, aportes[filaId][y]?.porMes || {}, {
        ...trazaBase, ...extra,
        monto: c.destinos[filaId]?.monto || 0,
        documentosPorMes: aportes[filaId][y]?.documentosPorMes || {},
      }), docAnio);

    // Otros años (ej. facturas de diciembre que llegan en el RCV de enero):
    // se escriben de inmediato en el documento de ese año.
    try {
      for (const y of otrosAnios) {
        const ref = doc(db, "empresas", empresaId, "flujo_mensual", String(y));
        const snap = await getDoc(ref);
        const base = snap.exists() ? normalizar(snap.data(), y) : docVacio(y);
        await setDoc(ref, { ...aplicarTodo(base, y), updatedAt: serverTimestamp() });
      }
    } catch (e) {
      console.error("Error guardando el RCV en otro año:", e);
      alert(`No se pudo guardar la parte de ${otrosAnios.join(", ")}. No se cargó nada; intenta nuevamente.`);
      return;
    }

    setData(d => aplicarTodo(d, anio, { otrosAnios }));
    setRcv(null);
  }
  // Libro de remuneraciones → filas Remuneraciones y Finiquitos del mes del libro
  async function aplicarRemuneraciones() {
    const r = rem;
    const periodo = `${r.anio}-${String(r.mes + 1).padStart(2, "0")}`;
    const traza = {
      archivo: r.archivo, documentos: r.documentos, trabajadores: r.trabajadores,
      haberes: r.haberes, aportes: r.totalAportes, ias: r.ias, vacaciones: r.vacaciones,
      descuentoAFC: r.descuentoAFC, duplicadosOmitidos: r.montoDuplicados,
      cargadoEn: new Date().toISOString(),
    };
    const aplicar = d => [["remuneraciones", r.remuneraciones], ["finiquitos", r.finiquitos]].reduce((acc, [filaId, monto]) =>
      aplicarAporteRCV(acc, filaId, periodo, monto ? { [r.mes]: monto } : {}, { ...traza, monto, documentosPorMes: { [r.mes]: r.trabajadores } }), d);
    if (r.anio === anio) {
      setData(aplicar);
    } else {
      try {
        const ref = doc(db, "empresas", empresaId, "flujo_mensual", String(r.anio));
        const snap = await getDoc(ref);
        const base = snap.exists() ? normalizar(snap.data(), r.anio) : docVacio(r.anio);
        await setDoc(ref, { ...JSON.parse(JSON.stringify(aplicar(base))), updatedAt: serverTimestamp() });
      } catch (e) {
        console.error("Error guardando remuneraciones:", e);
        alert(`No se pudo guardar en ${r.anio}. Intenta nuevamente.`);
        return;
      }
    }
    setRem(null);
  }

  // Boletas de honorarios → fila Honorarios (bruto), un período por mes
  async function aplicarHonorarios(anioCarga) {
    const h = hon;
    const traza = { archivo: h.archivo, informe: h.tipo, cargadoEn: new Date().toISOString() };
    const aplicar = d => h.mesesInformados.reduce((acc, mes) => {
      const m = h.meses[mes];
      const periodo = `${anioCarga}-${String(mes + 1).padStart(2, "0")}`;
      return aplicarAporteRCV(acc, "honorarios", periodo, m.bruto ? { [mes]: Math.round(m.bruto) } : {},
        { ...traza, monto: m.bruto, retencion: m.retencionTerceros + m.retencionContribuyente, documentosPorMes: { [mes]: m.boletas } });
    }, d);
    if (anioCarga === anio) {
      setData(aplicar);
    } else {
      try {
        const ref = doc(db, "empresas", empresaId, "flujo_mensual", String(anioCarga));
        const snap = await getDoc(ref);
        const base = snap.exists() ? normalizar(snap.data(), anioCarga) : docVacio(anioCarga);
        await setDoc(ref, { ...JSON.parse(JSON.stringify(aplicar(base))), updatedAt: serverTimestamp() });
      } catch (e) {
        console.error("Error guardando honorarios:", e);
        alert(`No se pudo guardar en ${anioCarga}. Intenta nuevamente.`);
        return;
      }
    }
    setHon(null);
  }

  // Kardex → fila Depreciación del año que se está viendo
  function aplicarKardex() {
    const k = kdx;
    const porMes = Object.fromEntries(k.porMes.map((v, m) => [m, v]).filter(([, v]) => v));
    setData(d => aplicarAporteRCV(d, "depreciacion", `kardex-${k.anio}`, porMes, {
      archivo: k.archivo, hoja: k.hoja, activos: k.activos.length, monto: k.total,
      residual: Math.round(k.residualTotal), cargadoEn: new Date().toISOString(),
    }));
    setKdx(null);
  }

  const valorFila = (id, mes) => num(data.filas.find(f => f.id === id)?.valores[mes]);

  // ── Cálculos derivados ──
  const tasa    = tasaPrimeraCategoria(configTributaria.regimen, anio);
  const tasaPPM = tasaPPMSugerida(configTributaria, anio);
  const calc = useMemo(() => {
    const baseImponible = vacio12();
    data.filas.forEach(f => f.valores.forEach((v, i) => { baseImponible[i] += f.signo * num(v); }));
    const impuesto = data.impuestoAuto ? impuestoMensualAcumulado(baseImponible, tasa) : data.impuesto.map(num);
    const utilidad = baseImponible.map((v, i) => v - impuesto[i] - num(data.multas[i]));
    const ingresosMes = vacio12();
    data.filas.filter(f => f.signo === 1).forEach(f => f.valores.forEach((v, i) => { ingresosMes[i] += num(v); }));
    const ppmSugerido = ingresosMes.map(v => Math.round(Math.max(0, v) * tasaPPM));
    // Doble conteo: meses con Compras cargadas del RCV y Arriendos/Rendiciones a mano
    const dobleConteo = [];
    MESES.forEach((_, i) => {
      if (!aportesRCV(data, "compras", i).length) return;
      ["arriendos", "rendiciones"].forEach(id => {
        const f = data.filas.find(x => x.id === id);
        // Solo lo escrito a mano (lo que vino del RCV ya está separado de Compras)
        const desdeRcv = aportesRCV(data, id, i).reduce((s, a) => s + a.monto, 0);
        if (f && num(f.valores[i]) - desdeRcv > 0) dobleConteo.push({ mes: i, fila: f.label });
      });
    });
    const totalIngresos = sum(data.filas.filter(f => f.signo === 1).flatMap(f => f.valores));
    const totalGastos   = sum(data.filas.filter(f => f.signo === -1).flatMap(f => f.valores));
    const filasTotales  = Object.fromEntries(data.filas.map(f => [f.id, sum(f.valores)]));
    let mejorMes = 0, peorMes = 0;
    utilidad.forEach((v, i) => { if (v > utilidad[mejorMes]) mejorMes = i; if (v < utilidad[peorMes]) peorMes = i; });
    return {
      baseImponible, utilidad, filasTotales,
      totalBaseImponible: sum(baseImponible),
      totalUtilidad: sum(utilidad),
      totalIngresos, totalGastos,
      impuesto, ppmSugerido, dobleConteo,
      totalImpuesto: sum(impuesto),
      totalPpmSugerido: sum(ppmSugerido),
      totalPpm: sum(data.ppm),
      totalMultas: sum(data.multas),
      mejorMes, peorMes,
    };
  }, [data, tasa, tasaPPM]);

  if (!empresaId) {
    return <div className="cuaderno px-8 pt-5 text-[18px] text-cuaderno-grafito">Cargando empresa…</div>;
  }

  const regimenLabel = REGIMENES_TRIBUTARIOS.find(r => r.id === configTributaria.regimen)?.label;
  const COLS = 15; // categoría + 12 meses + total + acción
  const encabezadoFila = (label, ayuda, signo) => (
    <th scope="row" className="sticky left-0 z-10 bg-cuaderno-hoja px-2 py-1.5 text-left font-normal text-[17px] whitespace-nowrap">
      {signo !== undefined && <span className="inline-block w-5 text-cuaderno-grafito">{signo === 1 ? "+" : "−"}</span>}
      <span title={ayuda || undefined} className={ayuda ? "cursor-help underline decoration-dotted decoration-cuaderno-columna underline-offset-4" : ""}>{label}</span>
    </th>
  );

  return (
    <div className="cuaderno px-8 pt-5 pb-10 space-y-5">
      <FechaHoja />

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Titulo>Flujo mensual</Titulo>
          <p className="m-0 text-[17px] text-cuaderno-grafito">
            Base imponible tributaria, mes a mes{regimenLabel ? ` · ${regimenLabel}` : ""}.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1">
            <Boton variante="icono" aria-label="Año anterior" onClick={() => cambiarAnio(anio - 1)}><IconoAnterior /></Boton>
            <span className="px-2 text-[22px] min-w-[64px] text-center">{anio}</span>
            <Boton variante="icono" aria-label="Año siguiente" onClick={() => cambiarAnio(anio + 1)}><IconoSiguiente /></Boton>
          </div>
          <input ref={inputRcv} type="file" accept=".csv,.xlsx,.xls" className="hidden"
            onChange={e => abrirRCV(e.target.files?.[0])} />
          <Boton variante="primario" onClick={() => inputRcv.current?.click()}
            aria-label="Importar RCV de compras o ventas, boletas de honorarios del SII, libro de remuneraciones de Talana o kardex de activo fijo">
            <IconoSubir tamano={14} /> Importar archivo
          </Boton>
          <span className="min-w-[90px] text-[15px] text-cuaderno-grafito" aria-live="polite">
            {errorGuardado
              ? <Boton variante="texto" className="text-cuaderno-roja" onClick={() => { pendienteRef.current = { empresaId, anio, data }; guardar(); }}>No se guardó · reintentar</Boton>
              : guardando || dirty ? "Guardando…" : <span className="inline-flex items-center gap-1"><VistoBueno titulo="" tamano={13} /> Guardado</span>}
          </span>
        </div>
      </header>

      <ConfigTributaria config={configTributaria} onCambiar={c => guardarConfigTributaria(c).catch(e => {
          console.error("Error guardando config tributaria:", e);
          alert("No se pudo guardar el régimen. Intenta nuevamente.");
        })} anio={anio} tasa={tasa} tasaPPM={tasaPPM} />

      {errorRcv && (
        <div className="flex items-start justify-between gap-3">
          <Nota etiqueta="Ojo:">{errorRcv}</Nota>
          <Boton variante="texto" onClick={() => setErrorRcv("")}>Cerrar</Boton>
        </div>
      )}

      {!cargando && calc.dobleConteo.length > 0 && (
        <Nota etiqueta="Ojo:">
          Posible doble conteo en {calc.dobleConteo.map(d => `${d.fila.toLowerCase()} de ${MESES[d.mes].toLowerCase()}`).join(", ")}: las Compras de ese mes vienen del RCV, que ya incluye todo lo facturado a nombre de la empresa. Deja en esas filas solo lo que no tiene factura.
        </Nota>
      )}

      {kdx && (
        <ModalKardex resumen={kdx} archivo={kdx.archivo} regimen={configTributaria.regimen}
          onAplicar={aplicarKardex} onCerrar={() => setKdx(null)} />
      )}

      {hon && (
        <ModalHonorarios resumen={hon} archivo={hon.archivo} anioActivo={anio}
          onAplicar={aplicarHonorarios} onCerrar={() => setHon(null)} />
      )}

      {rem && (
        <ModalRemuneraciones resumen={rem} archivo={rem.archivo} anioActivo={anio}
          onAplicar={aplicarRemuneraciones} onCerrar={() => setRem(null)} />
      )}

      {rcv && calculoRcv && (
        <ModalRCV
          calculo={calculoRcv}
          archivo={rcv.archivo}
          regimen={configTributaria.regimen}
          anioActivo={anio}
          mesInicial={calculoRcv.resumen.mesSugerido?.anio === anio ? calculoRcv.resumen.mesSugerido.mes : new Date().getMonth()}
          valorActual={m => valorFila(rcv.tipo === "compras" ? "compras" : "ingresos", m)}
          onAplicar={aplicarRCV}
          onCambiarRegla={cambiarReglaProveedor}
          onCerrar={() => setRcv(null)}
        />
      )}

      {cargando ? (
        <p className="m-0 py-12 text-center text-[18px] text-cuaderno-grafito">Buscando el flujo de {anio}…</p>
      ) : (
        <>
          {/* Resumen del año */}
          <div className="grid gap-5 lg:grid-cols-2">
            <Hoja titulo={`Resumen ${anio}`}>
              <LineaGuia etiqueta="Ingresos"><Cifra valor={calc.totalIngresos} escala="pesos" vacio="$0" /></LineaGuia>
              <LineaGuia etiqueta="Gastos"><Cifra valor={-calc.totalGastos} escala="pesos" vacio="$0" /></LineaGuia>
              <LineaGuia etiqueta="Base imponible"><Cifra valor={calc.totalBaseImponible} escala="pesos" vacio="$0" raya="total" /></LineaGuia>
              <LineaGuia etiqueta={`Impuesto (${(tasa * 100).toLocaleString("es-CL")}% de la base acumulada)`}><Cifra valor={-calc.totalImpuesto} escala="pesos" vacio="$0" /></LineaGuia>
              {calc.totalMultas !== 0 && <LineaGuia etiqueta="Multas"><Cifra valor={-calc.totalMultas} escala="pesos" /></LineaGuia>}
              <LineaGuia etiqueta="Utilidad líquida"><Cifra valor={calc.totalUtilidad} escala="pesos" vacio="$0" raya="doble" /></LineaGuia>
              <p className="m-0 mt-2 text-[15px] text-cuaderno-grafito">
                Mejor mes {MESES[calc.mejorMes].toLowerCase()} (<Cifra valor={calc.utilidad[calc.mejorMes]} escala="pesos" vacio="$0" color="heredar" />) · peor mes {MESES[calc.peorMes].toLowerCase()} (<Cifra valor={calc.utilidad[calc.peorMes]} escala="pesos" vacio="$0" color="heredar" />)
              </p>
            </Hoja>
            <Hoja titulo="Ingresos y gastos por mes">
              <GraficoBarras data={MESES_S.map((m, i) => ({
                label: m,
                ingresos: data.filas.filter(f => f.signo === 1).reduce((s, f) => s + num(f.valores[i]), 0),
                egresos: data.filas.filter(f => f.signo === -1).reduce((s, f) => s + num(f.valores[i]), 0),
              }))} />
            </Hoja>
          </div>

          {/* Planilla */}
          <Hoja titulo={`Movimientos ${anio}`}
            extra={<Boton variante="texto" onClick={() => setVerAyuda(v => !v)}>{verAyuda ? "Ocultar criterios" : "Cómo se calcula cada fila"}</Boton>}>
            <p className="m-0 -mt-1 mb-2 text-[15px] text-cuaderno-grafito">
              {configTributaria.regimen === "14A"
                ? "Montos netos de IVA, en el mes del documento (14 A, base devengada)."
                : "Montos netos de IVA, en el mes en que se pagan o perciben."}
              {" "}Lo resaltado en <Resaltado color="lavanda">lavanda</Resaltado> viene importado (RCV, honorarios, remuneraciones o kardex); toca una celda para corregirla.
            </p>

            {verAyuda && (
              <div className="mb-3 grid gap-x-8 gap-y-2 sm:grid-cols-2 border-y border-cuaderno-renglon py-3">
                {data.filas.filter(f => AYUDA_FILAS[f.id]).map(f => (
                  <p key={f.id} className="m-0 text-[15px]"><Resaltado color="durazno">{f.label}</Resaltado> {AYUDA_FILAS[f.id]}</p>
                ))}
                <p className="m-0 text-[15px]"><Resaltado color="durazno">Impuesto</Resaltado> Base imponible acumulada del año × tasa del régimen. Cada mes muestra cuánto cambia el impuesto anual; un mes con pérdida lo reduce.</p>
                <p className="m-0 text-[15px]"><Resaltado color="durazno">Multas</Resaltado> Multas e intereses fiscales: no rebajan la base imponible (no son deducibles), pero sí restan de la utilidad porque son salida de caja.</p>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full border-collapse" style={{ minWidth: 1180 }}>
                <thead>
                  <tr className="shadow-[inset_0_-1.5px_0_rgb(var(--cuaderno-tinta))]">
                    <th className="sticky left-0 z-10 bg-cuaderno-hoja px-2 py-2 text-left font-normal text-[15px] text-cuaderno-grafito" style={{ minWidth: 220 }}>Categoría</th>
                    {MESES_S.map(m => <th key={m} className="px-1.5 py-2 text-right font-normal text-[15px] text-cuaderno-grafito" style={{ minWidth: 92 }}>{m}</th>)}
                    <th className="px-2 py-2 text-right font-normal text-[15px] text-cuaderno-tinta" style={{ minWidth: 112 }}>Total</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody>
                  {data.filas.map(f => (
                    <tr key={f.id} className="border-b border-cuaderno-renglon">
                      {encabezadoFila(f.label, AYUDA_FILAS[f.id], f.signo)}
                      {f.valores.map((v, i) => {
                        const aportes = aportesRCV(data, f.id, i);
                        return (
                          <CeldaInput key={i} value={v} rcv={aportes.length > 0}
                            titulo={aportes.length ? "Importado: " + aportes.map(a => `${a.periodo} ${fmt(a.monto)}${a.documentos ? ` (${a.documentos} doc.)` : ""}`).join(" + ") : undefined}
                            onChange={val => setValorFila(f.id, i, val)} />
                        );
                      })}
                      <CeldaCifra value={f.signo * calc.filasTotales[f.id]} />
                      <td className="px-1 text-center">
                        {!f.fija && (
                          <button onClick={() => eliminarFila(f.id, f.label)} aria-label={`Eliminar ${f.label}`}
                            className="p-1.5 rounded-md text-cuaderno-grafito hover:text-cuaderno-roja"><IconoBorrar /></button>
                        )}
                      </td>
                    </tr>
                  ))}

                  {/* Agregar categoría */}
                  <tr>
                    <td colSpan={COLS} className="sticky left-0 px-2 py-2">
                      {nuevaFila.abierto ? (
                        <div className="flex flex-wrap items-end gap-4">
                          <Campo etiqueta="Nombre de la categoría" className="w-64" autoFocus
                            value={nuevaFila.label} placeholder="Ej. Gastos dic 2024"
                            onChange={e => setNuevaFila(n => ({ ...n, label: e.target.value }))}
                            onKeyDown={e => e.key === "Enter" && agregarFila()} />
                          <Segmentado opciones={[{ id: -1, label: "Gasto" }, { id: 1, label: "Ingreso" }]}
                            valor={nuevaFila.signo} onCambiar={v => setNuevaFila(n => ({ ...n, signo: v }))} />
                          <Boton variante="secundario" onClick={agregarFila}>Agregar</Boton>
                          <Boton variante="texto" onClick={() => setNuevaFila({ abierto: false, label: "", signo: -1 })}>Cancelar</Boton>
                        </div>
                      ) : (
                        <Boton variante="texto" onClick={() => setNuevaFila(n => ({ ...n, abierto: true }))}>
                          <IconoMas tamano={13} /> Agregar categoría
                        </Boton>
                      )}
                    </td>
                  </tr>

                  {/* Base imponible */}
                  <tr className="shadow-[inset_0_1.5px_0_rgb(var(--cuaderno-tinta))]">
                    {encabezadoFila("Base imponible")}
                    {calc.baseImponible.map((v, i) => <CeldaCifra key={i} value={v} />)}
                    <CeldaCifra value={calc.totalBaseImponible} raya="total" />
                    <td />
                  </tr>

                  {/* Impuesto: automático (régimen) o manual */}
                  <tr className="border-b border-cuaderno-renglon">
                    <th scope="row" className="sticky left-0 z-10 bg-cuaderno-hoja px-2 py-1.5 text-left font-normal text-[17px] whitespace-nowrap">
                      <span className="inline-block w-5 text-cuaderno-grafito">−</span>Impuesto
                      <button
                        onClick={() => setData(d => ({ ...d, impuestoAuto: !d.impuestoAuto, ...(d.impuestoAuto ? { impuesto: calc.impuesto } : {}) }))}
                        title={data.impuestoAuto ? "Calculado con la tasa del régimen. Clic para ingresarlo a mano." : "Ingresado a mano. Clic para calcularlo con la tasa del régimen."}
                        className="ml-2 text-[14px] text-cuaderno-grafito underline underline-offset-[3px] decoration-cuaderno-columna hover:text-cuaderno-tinta"
                      >
                        {data.impuestoAuto ? `automático ${(tasa * 100).toLocaleString("es-CL")}%` : "a mano"}
                      </button>
                    </th>
                    {data.impuestoAuto
                      ? calc.impuesto.map((v, i) => <CeldaCifra key={i} value={-v} />)
                      : data.impuesto.map((v, i) => <CeldaInput key={i} value={v} onChange={val => setValorExtra("impuesto", i, val)} />)}
                    <CeldaCifra value={-calc.totalImpuesto} />
                    <td />
                  </tr>

                  {/* Multas: no deducibles, pero salida de caja */}
                  <tr className="border-b border-cuaderno-renglon">
                    {encabezadoFila("Multas", "Multas e intereses fiscales. No rebajan la base imponible, pero sí la utilidad líquida.", -1)}
                    {data.multas.map((v, i) => <CeldaInput key={i} value={v} onChange={val => setValorExtra("multas", i, val)} />)}
                    <CeldaCifra value={-calc.totalMultas} />
                    <td />
                  </tr>

                  {/* Utilidad líquida */}
                  <tr>
                    <th scope="row" className="sticky left-0 z-10 bg-cuaderno-hoja px-2 py-2 text-left font-normal text-[18px] whitespace-nowrap">
                      <Resaltado color={calc.totalUtilidad >= 0 ? "menta" : "rosa"}>Utilidad líquida</Resaltado>
                    </th>
                    {calc.utilidad.map((v, i) => <CeldaCifra key={i} value={v} raya="doble" />)}
                    <CeldaCifra value={calc.totalUtilidad} raya="doble" />
                    <td />
                  </tr>
                </tbody>
              </table>
            </div>
          </Hoja>

          {/* PPM */}
          <Hoja titulo="Pagos provisionales mensuales">
            <p className="m-0 -mt-1 mb-2 text-[15px] text-cuaderno-grafito">El PPM es un anticipo del impuesto anual: no cambia la utilidad líquida.</p>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse" style={{ minWidth: 1180 }}>
                <thead>
                  <tr className="shadow-[inset_0_-1.5px_0_rgb(var(--cuaderno-tinta))]">
                    <th className="sticky left-0 z-10 bg-cuaderno-hoja px-2 py-2 text-left font-normal text-[15px] text-cuaderno-grafito" style={{ minWidth: 220 }}>Concepto</th>
                    {MESES_S.map(m => <th key={m} className="px-1.5 py-2 text-right font-normal text-[15px] text-cuaderno-grafito" style={{ minWidth: 92 }}>{m}</th>)}
                    <th className="px-2 py-2 text-right font-normal text-[15px] text-cuaderno-tinta" style={{ minWidth: 112 }}>Total</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-cuaderno-renglon">
                    {encabezadoFila("PPM pagado")}
                    {data.ppm.map((v, i) => <CeldaInput key={i} value={v} onChange={val => setValorExtra("ppm", i, val)} />)}
                    <CeldaCifra value={calc.totalPpm} />
                    <td />
                  </tr>
                  <tr>
                    {encabezadoFila(`PPM sugerido (${(tasaPPM * 100).toLocaleString("es-CL", { maximumFractionDigits: 3 })}%)`, "Ingresos del mes × tasa de PPM del régimen.")}
                    {calc.ppmSugerido.map((v, i) => <CeldaCifra key={i} value={v} color="grafito" />)}
                    <CeldaCifra value={calc.totalPpmSugerido} color="grafito" />
                    <td />
                  </tr>
                </tbody>
              </table>
            </div>
          </Hoja>
        </>
      )}
    </div>
  );
}
