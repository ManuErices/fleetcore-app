import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useEmpresa } from "../../lib/useEmpresa";
import * as XLSX from "xlsx";
import { fmt, MESES, MESES_S, useContabilidad, leerTextoDetectando } from "./ContabilidadContext";
import {
  REGIMENES_TRIBUTARIOS, tasaPrimeraCategoria, tasaPPMSugerida, impuestoMensualAcumulado,
  AYUDA_FILAS, detectarTipoRCV, resumirRCVCompras, resumirRCVVentas, NOMBRE_DOC,
} from "../../lib/contabilidad/tributario";

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
 *     rcv: { compras: { [mes]: resumen }, ingresos: { [mes]: resumen } },
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

// ─── Subcomponentes visuales ──────────────────────────────────────────────────
function KpiFlujo({ label, value, sub, color = "text-slate-800" }) {
  return (
    <div className="glass-card rounded-xl p-4">
      <p className="text-xs text-slate-500 font-semibold">{label}</p>
      <p className={`text-xl font-black mt-1 ${color}`}>{value}</p>
      {sub && <p className="text-[10px] text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function CeldaInput({ value, onChange, disabled = false, bold = false }) {
  return (
    <input
      type="number"
      inputMode="decimal"
      value={value === 0 ? "" : value}
      onChange={e => onChange(e.target.value)}
      placeholder="0"
      disabled={disabled}
      className={`w-full bg-transparent text-right text-xs px-1.5 py-1.5 rounded-md outline-none font-mono
        ${bold ? "font-black text-slate-800" : "text-slate-600"}
        ${disabled ? "cursor-not-allowed opacity-60" : "focus:bg-purple-50 focus:ring-1 focus:ring-purple-300"}`}
    />
  );
}

function CeldaCalculada({ value, colorAuto = false, bold = false }) {
  const color = colorAuto ? (value >= 0 ? "text-emerald-700" : "text-red-600") : "text-slate-700";
  return (
    <td className={`px-1.5 py-1.5 text-right text-xs font-mono ${bold ? "font-black" : "font-semibold"} ${color}`}>
      {fmt(value)}
    </td>
  );
}

const IconChevronLeft = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
  </svg>
);
const IconChevronRight = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
  </svg>
);
const IconTrash = () => (
  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
  </svg>
);
const IconPlus = () => (
  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
  </svg>
);

// ─── Lectura del RCV ──────────────────────────────────────────────────────────
// El SII exporta CSV separado por ";" y con un ";" sobrante al final de cada
// fila de datos: se agrega una columna ficticia al encabezado para que cuadre
// (mismo truco que el importador del Libro Diario).
async function leerFilasRCV(file) {
  if (file.name.toLowerCase().endsWith(".csv")) {
    const texto = await leerTextoDetectando(file);
    const lineas = texto.split(/\r?\n/);
    if (lineas.length && !lineas[0].endsWith(";_extra")) lineas[0] += ";_extra";
    const wb = XLSX.read(lineas.join("\n"), { type: "string", raw: false, FS: ";" });
    return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" });
  }
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" });
}

function LineaDesglose({ label, valor, signo = "", tenue = false, fuerte = false, nota }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 py-1 ${fuerte ? "border-t-2 border-slate-200 mt-1 pt-2" : ""}`}>
      <span className={`text-xs ${fuerte ? "font-black text-slate-900" : tenue ? "text-slate-400" : "font-semibold text-slate-600"}`}>
        {signo && <span className="font-mono mr-1">{signo}</span>}{label}
        {nota && <span className="block text-[10px] font-normal text-slate-400">{nota}</span>}
      </span>
      <span className={`text-xs font-mono whitespace-nowrap ${fuerte ? "font-black text-slate-900" : tenue ? "text-slate-400" : "text-slate-700"}`}>{fmt(valor)}</span>
    </div>
  );
}

function ModalRCV({ resumen, anioActivo, mesInicial, valorActual, onAplicar, onCerrar }) {
  const [mes, setMes] = useState(mesInicial);
  const esCompras = resumen.tipo === "compras";
  const fila = esCompras ? "Compras" : "Ingresos";
  const anioArchivo = resumen.mesSugerido?.anio;
  const otroAnio = anioArchivo && anioArchivo !== anioActivo;
  const otros = Object.values(resumen.otros || {});
  const revisar = otros.filter(o => o.tipo === "revisar");
  const ignorados = Object.entries(resumen.ignorados || {});

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onCerrar}>
      <div className="bg-white w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="bg-gradient-to-r from-purple-700 to-violet-600 px-5 py-4">
          <p className="text-white font-black text-sm">RCV {esCompras ? "Compras" : "Ventas"} · {resumen.documentos} documentos</p>
          <p className="text-purple-200 text-xs">Así se calcula la fila {fila}</p>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div>
            <LineaDesglose label="Neto (facturas y notas de débito)" valor={resumen.neto} signo="+" />
            <LineaDesglose label="Exento" valor={resumen.exento} signo="+" />
            <LineaDesglose label={`Notas de crédito ${esCompras ? "recibidas" : "emitidas"} (neto + exento)`} valor={-(resumen.ncNeto + resumen.ncExento)} signo="−" />
            {esCompras && <>
              <LineaDesglose label="IVA no recuperable" valor={resumen.ivaNoRecuperable} signo="+" />
              <LineaDesglose label="Impuesto sin derecho a crédito" valor={resumen.impSinDerecho} signo="+" />
              <LineaDesglose label="Otros impuestos no recuperables" valor={resumen.otrosCosto} signo="+"
                nota={otros.length ? "Detalle por código abajo" : undefined} />
            </>}
            <LineaDesglose label={`= ${fila}`} valor={resumen.monto} fuerte />
          </div>

          <div className="rounded-xl bg-slate-50 px-3 py-2">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1">No entra (no es {esCompras ? "gasto" : "ingreso"})</p>
            {esCompras ? <>
              <LineaDesglose label="IVA crédito recuperable" valor={resumen.ivaRecuperable} tenue />
              {resumen.ivaUsoComun !== 0 && <LineaDesglose label="IVA uso común (factor 1)" valor={resumen.ivaUsoComun} tenue />}
              {resumen.otrosRecuperable !== 0 && <LineaDesglose label="Otros impuestos recuperables" valor={resumen.otrosRecuperable} tenue />}
            </> : <>
              <LineaDesglose label="IVA débito" valor={resumen.iva} tenue />
              {resumen.creditoConstructora !== 0 && <LineaDesglose label="Crédito especial empresa constructora" valor={resumen.creditoConstructora} tenue />}
            </>}
            <LineaDesglose label="Total documentos" valor={resumen.total} tenue />
            {esCompras && resumen.activoFijoNeto !== 0 && (
              <LineaDesglose label="…de lo cual es activo fijo (neto)" valor={resumen.activoFijoNeto} tenue
                nota="En 14 D N°3 se rebaja completo (depreciación instantánea): ya está dentro de Compras." />
            )}
          </div>

          {otros.length > 0 && (
            <div>
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1">Otros impuestos por código</p>
              {otros.map(o => (
                <div key={o.codigo} className="flex items-center justify-between gap-2 py-1 border-b border-slate-100 last:border-0">
                  <span className="text-xs text-slate-600">
                    {o.nombre} <span className="text-slate-400">· {o.docs} doc.</span>
                    <span className={`ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                      o.tipo === "credito" ? "bg-emerald-100 text-emerald-700"
                      : o.tipo === "diesel" ? "bg-sky-100 text-sky-700"
                      : o.tipo === "costo" ? "bg-slate-100 text-slate-600"
                      : "bg-amber-100 text-amber-700"}`}>
                      {o.tipo === "credito" ? "recuperable" : o.tipo === "diesel" ? "diésel" : o.tipo === "costo" ? "costo" : "revisar"}
                    </span>
                  </span>
                  <span className="text-xs font-mono text-slate-700">{fmt(o.monto)}</span>
                </div>
              ))}
            </div>
          )}

          {(revisar.length > 0 || Math.abs(resumen.sinExplicar || 0) > 10 || ignorados.length > 0 || !esCompras) && (
            <div className="space-y-2">
              {revisar.length > 0 && (
                <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  Hay impuestos con códigos que FleetCore no reconoce ({revisar.map(o => o.codigo || "sin código").join(", ")}). Se suman a Compras como costo, que es lo conservador. Confirma con la contadora si alguno da derecho a crédito.
                </p>
              )}
              {Math.abs(resumen.sinExplicar || 0) > 10 && (
                <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  {fmt(resumen.sinExplicar)} del total de los documentos no calza con ninguna columna (neto, exento, IVA, otros impuestos). Revisa el detalle en el CSV.
                </p>
              )}
              {ignorados.length > 0 && (
                <p className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                  Documentos que no se consideran: {ignorados.map(([t, n]) => `${NOMBRE_DOC[t] || "tipo " + t} (${n})`).join(", ")}.
                </p>
              )}
              {!esCompras && (
                <p className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                  El RCV registra las ventas cuando se emiten. En 14 D N°3 el ingreso cuenta cuando se percibe (una factura cedida en factoring se considera percibida al cederse). Ajusta el mes si lo cobraste en otro.
                </p>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="text-xs font-semibold text-slate-600">Cargar en</span>
            <select value={mes} onChange={e => setMes(parseInt(e.target.value, 10))}
              className="px-2 py-1.5 text-xs border-2 border-slate-200 rounded-lg focus:outline-none focus:border-purple-400">
              {MESES.map((m, i) => <option key={m} value={i}>{m} {anioActivo}</option>)}
            </select>
            {valorActual(mes) !== 0 && (
              <span className="text-[11px] text-slate-500">reemplaza {fmt(valorActual(mes))}</span>
            )}
          </div>
          {otroAnio && (
            <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              El archivo es de {anioArchivo} y estás viendo {anioActivo}. Cambia de año antes de cargarlo.
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2 px-5 py-3 border-t border-slate-100 bg-slate-50">
          <button onClick={onCerrar} className="px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-700">Cancelar</button>
          <button onClick={() => onAplicar(mes)} disabled={otroAnio}
            className="px-4 py-2 rounded-xl text-xs font-black bg-purple-700 text-white hover:bg-purple-800 disabled:bg-slate-200 disabled:text-slate-400">
            Cargar {fmt(resumen.monto)} en {fila}
          </button>
        </div>
      </div>
    </div>
  );
}

function ConfigTributaria({ config, onCambiar, anio, tasa, tasaPPM }) {
  const sinRegimen = !config.regimen;
  return (
    <div className={`glass-card rounded-xl px-4 py-3 flex flex-wrap items-center gap-x-5 gap-y-2 ${sinRegimen ? "ring-2 ring-amber-300" : ""}`}>
      <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
        Régimen
        <select value={config.regimen} onChange={e => onCambiar({ regimen: e.target.value })}
          className="px-2 py-1.5 text-xs border-2 border-slate-200 rounded-lg focus:outline-none focus:border-purple-400 bg-white">
          <option value="">Sin definir (se usa 27%)</option>
          {REGIMENES_TRIBUTARIOS.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
        </select>
      </label>
      <span className="text-xs text-slate-500">Impto {anio}: <b className="text-slate-800">{(tasa * 100).toLocaleString("es-CL")}%</b></span>
      {config.regimen === "14A" ? (
        <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
          Tasa PPM (del F22)
          <input type="number" step="0.01" min="0" value={config.tasaPPM14A || ""} placeholder="0"
            onChange={e => onCambiar({ tasaPPM14A: parseFloat(e.target.value) || 0 })}
            className="w-16 px-2 py-1 text-xs border-2 border-slate-200 rounded-lg text-right" />%
        </label>
      ) : config.regimen !== "14D8" && (
        <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
          <input type="checkbox" checked={!!config.ingresosSobre50milUF}
            onChange={e => onCambiar({ ingresosSobre50milUF: e.target.checked })} className="accent-purple-700" />
          Ingresos del año anterior sobre 50.000 UF
          <span className="text-slate-400 font-normal">→ PPM {(tasaPPM * 100).toLocaleString("es-CL")}%</span>
        </label>
      )}
      <label className="flex items-center gap-2 text-xs font-semibold text-slate-600" title="Ley 18.502: se recupera el impuesto específico del diésel usado en maquinaria que no circula por vías públicas.">
        Diésel recuperable
        <input type="number" min="0" max="100" value={config.dieselRecuperablePct || ""} placeholder="0"
          onChange={e => onCambiar({ dieselRecuperablePct: Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)) })}
          className="w-14 px-2 py-1 text-xs border-2 border-slate-200 rounded-lg text-right" />%
      </label>
      {sinRegimen && (
        <p className="w-full text-[11px] text-amber-700 font-semibold">
          Elige el régimen (aparece en Mi SII → Datos de la empresa). En Pro Pyme General la tasa es 12,5% en 2025-2027; con 27% el Impto queda sobreestimado.
        </p>
      )}
      {config.regimen === "14D3" && anio >= 2025 && anio <= 2028 && (
        <p className="w-full text-[11px] text-slate-500">
          La tasa rebajada exige estar al día con la cotización del empleador de la reforma previsional al cierre del año.
        </p>
      )}
    </div>
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

  const guardar = useCallback(async () => {
    if (!empresaId) return;
    setGuardando(true);
    try {
      const ref = doc(db, "empresas", empresaId, "flujo_mensual", String(anio));
      await setDoc(ref, { ...data, updatedAt: serverTimestamp() });
      setOriginal(data);
    } catch (e) {
      console.error("Error guardando flujo mensual:", e);
      alert("No se pudo guardar el flujo mensual. Intenta nuevamente.");
    } finally {
      setGuardando(false);
    }
  }, [empresaId, anio, data]);

  function cambiarAnio(nuevo) {
    if (dirty && !window.confirm("Tienes cambios sin guardar en este año. ¿Cambiar de todas formas? Se perderán.")) return;
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
      const filas = await leerFilasRCV(file);
      const tipo = detectarTipoRCV(filas);
      if (!tipo) { setErrorRcv("El archivo no parece un RCV del SII (falta la columna RUT Proveedor o Rut cliente)."); return; }
      const resumen = tipo === "compras"
        ? resumirRCVCompras(filas, { dieselRecuperablePct: configTributaria.dieselRecuperablePct })
        : resumirRCVVentas(filas);
      if (!resumen.documentos) { setErrorRcv("El archivo no tiene facturas ni notas de crédito/débito."); return; }
      setRcv({ ...resumen, archivo: file.name });
    } catch (e) {
      console.error("Error leyendo RCV:", e);
      setErrorRcv(`No se pudo leer el archivo: ${e.message}`);
    } finally {
      if (inputRcv.current) inputRcv.current.value = "";
    }
  }
  function aplicarRCV(mes) {
    const filaId = rcv.tipo === "compras" ? "compras" : "ingresos";
    // Se guarda el desglose junto al monto para poder explicar la cifra después
    const traza = {
      archivo: rcv.archivo, documentos: rcv.documentos, monto: rcv.monto,
      neto: rcv.neto, exento: rcv.exento, nc: rcv.ncNeto + rcv.ncExento,
      ...(rcv.tipo === "compras" ? {
        ivaNoRecuperable: rcv.ivaNoRecuperable, impSinDerecho: rcv.impSinDerecho,
        otrosCosto: rcv.otrosCosto, otrosRecuperable: rcv.otrosRecuperable,
        activoFijoNeto: rcv.activoFijoNeto,
      } : {}),
      cargadoEn: new Date().toISOString(),
    };
    setData(d => ({
      ...d,
      filas: d.filas.map(f => f.id === filaId
        ? { ...f, valores: f.valores.map((v, i) => (i === mes ? rcv.monto : v)) }
        : f),
      rcv: { ...d.rcv, [filaId]: { ...(d.rcv?.[filaId] || {}), [mes]: traza } },
    }));
    setRcv(null);
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
    Object.keys(data.rcv?.compras || {}).forEach(k => {
      const i = Number(k);
      ["arriendos", "rendiciones"].forEach(id => {
        const f = data.filas.find(x => x.id === id);
        if (f && num(f.valores[i]) > 0) dobleConteo.push({ mes: i, fila: f.label });
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
    return <div className="p-6 text-sm text-slate-500">Cargando empresa…</div>;
  }

  return (
    <div className="p-4 sm:p-6 space-y-5">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div>
          <h1 className="text-xl font-black text-slate-900">Flujo Mensual</h1>
          <p className="text-xs text-slate-500 mt-0.5">Base imponible tributaria mes a mes · Resultado del Ejercicio</p>
        </div>
        <div className="flex items-center gap-2 sm:ml-auto">
          <div className="flex items-center gap-0.5 bg-white border-2 border-slate-200 rounded-xl px-1">
            <button onClick={() => cambiarAnio(anio - 1)} className="p-2 hover:bg-slate-100 rounded-lg text-slate-500">
              <IconChevronLeft />
            </button>
            <span className="px-2 text-sm font-black text-slate-800 min-w-[56px] text-center">{anio}</span>
            <button onClick={() => cambiarAnio(anio + 1)} className="p-2 hover:bg-slate-100 rounded-lg text-slate-500">
              <IconChevronRight />
            </button>
          </div>
          <input ref={inputRcv} type="file" accept=".csv,.xlsx,.xls" className="hidden"
            onChange={e => abrirRCV(e.target.files?.[0])} />
          <button
            onClick={() => inputRcv.current?.click()}
            aria-label="Importar CSV del Registro de Compras o de Ventas descargado de Mi SII"
            className="px-3 py-2.5 rounded-xl text-xs font-black bg-white border-2 border-purple-200 text-purple-700 hover:bg-purple-50 whitespace-nowrap"
          >
            Importar RCV
          </button>
          <button
            onClick={guardar}
            disabled={!dirty || guardando}
            className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all whitespace-nowrap ${
              dirty && !guardando
                ? "bg-purple-700 text-white hover:bg-purple-800 shadow-md shadow-purple-200"
                : "bg-slate-100 text-slate-400 cursor-not-allowed"
            }`}
          >
            {guardando ? "Guardando…" : dirty ? "Guardar cambios" : "Guardado"}
          </button>
        </div>
      </div>

      <ConfigTributaria config={configTributaria} onCambiar={c => guardarConfigTributaria(c).catch(e => {
          console.error("Error guardando config tributaria:", e);
          alert("No se pudo guardar el régimen. Intenta nuevamente.");
        })} anio={anio} tasa={tasa} tasaPPM={tasaPPM} />

      {errorRcv && (
        <div className="px-4 py-3 bg-red-50 border-2 border-red-200 rounded-xl text-xs text-red-700 font-semibold flex justify-between gap-3">
          {errorRcv}
          <button onClick={() => setErrorRcv("")} className="text-red-400 hover:text-red-600">✕</button>
        </div>
      )}

      {!cargando && calc.dobleConteo.length > 0 && (
        <div className="px-4 py-3 bg-amber-50 border-2 border-amber-200 rounded-xl text-xs text-amber-800">
          <p className="font-black">Posible doble conteo</p>
          <p className="mt-0.5">
            {calc.dobleConteo.map(d => `${d.fila} de ${MESES[d.mes].toLowerCase()}`).join(", ")}: las Compras de ese mes vienen del RCV, que ya incluye todo lo facturado a nombre de la empresa. Deja en estas filas solo lo que no tiene factura (arriendo con contrato sin factura, boletas de rendiciones).
          </p>
        </div>
      )}

      {rcv && (
        <ModalRCV
          resumen={rcv}
          anioActivo={anio}
          mesInicial={rcv.mesSugerido?.anio === anio ? rcv.mesSugerido.mes : new Date().getMonth()}
          valorActual={m => valorFila(rcv.tipo === "compras" ? "compras" : "ingresos", m)}
          onAplicar={aplicarRCV}
          onCerrar={() => setRcv(null)}
        />
      )}

      {cargando ? (
        <div className="glass-card rounded-xl p-8 text-center text-sm text-slate-400">Cargando {anio}…</div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KpiFlujo label={`Ingresos ${anio}`} value={fmt(calc.totalIngresos)} color="text-emerald-600" />
            <KpiFlujo label={`Gastos ${anio}`} value={fmt(calc.totalGastos)} color="text-red-600"
              sub={`Impto estimado ${fmt(calc.totalImpuesto)} (${(tasa * 100).toLocaleString("es-CL")}% de la base acumulada)`} />
            <KpiFlujo
              label="Utilidad / Pérdida del Ejercicio"
              value={fmt(calc.totalUtilidad)}
              color={calc.totalUtilidad >= 0 ? "text-emerald-700" : "text-red-600"}
            />
            <KpiFlujo
              label="Mejor / peor mes"
              value={`${MESES_S[calc.mejorMes]} / ${MESES_S[calc.peorMes]}`}
              sub={`${fmt(calc.utilidad[calc.mejorMes])} · ${fmt(calc.utilidad[calc.peorMes])}`}
            />
          </div>

          {/* Tabla principal */}
          <div className="glass-card rounded-xl overflow-hidden">
            <div className="bg-gradient-to-r from-purple-700 to-violet-600 px-4 py-3">
              <p className="text-white font-black text-sm">Flujo de Movimientos {anio}</p>
              <div className="flex items-center justify-between gap-3">
                <p className="text-purple-200 text-xs">Montos netos de IVA, por mes en que se pagan o perciben</p>
                <button onClick={() => setVerAyuda(v => !v)} className="text-[11px] font-bold text-white/90 hover:text-white underline underline-offset-2 whitespace-nowrap">
                  {verAyuda ? "Ocultar criterios" : "Cómo se calcula cada fila"}
                </button>
              </div>
            </div>

            {verAyuda && (
              <div className="px-4 py-3 bg-purple-50/60 border-b border-purple-100 grid sm:grid-cols-2 gap-x-6 gap-y-2">
                {data.filas.filter(f => AYUDA_FILAS[f.id]).map(f => (
                  <p key={f.id} className="text-[11px] text-slate-600"><b className="text-slate-800">{f.label}.</b> {AYUDA_FILAS[f.id]}</p>
                ))}
                <p className="text-[11px] text-slate-600"><b className="text-slate-800">Impto.</b> Base imponible acumulada del año × tasa del régimen. Cada mes muestra cuánto cambia el impuesto anual; un mes con pérdida lo reduce.</p>
                <p className="text-[11px] text-slate-600"><b className="text-slate-800">Multas.</b> Multas e intereses fiscales: no rebajan la base imponible (no son deducibles), pero sí restan de la utilidad porque son salida de caja.</p>
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full border-collapse" style={{ minWidth: 920 }}>
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="sticky left-0 bg-slate-50 px-3 py-2 text-left text-[10px] font-black text-slate-500 uppercase tracking-wider z-10" style={{ minWidth: 150 }}>
                      Categoría
                    </th>
                    {MESES_S.map(m => (
                      <th key={m} className="px-1.5 py-2 text-right text-[10px] font-black text-slate-500 uppercase" style={{ minWidth: 64 }}>{m}</th>
                    ))}
                    <th className="px-2 py-2 text-right text-[10px] font-black text-slate-700 uppercase bg-slate-100" style={{ minWidth: 80 }}>Total</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {data.filas.map(f => (
                    <tr key={f.id} className="border-b border-slate-50 hover:bg-purple-50/20">
                      <td className="sticky left-0 bg-white px-3 py-1 text-xs font-semibold text-slate-700 z-10 whitespace-nowrap">
                        <span className={f.signo === 1 ? "text-emerald-600 mr-1" : "text-red-500 mr-1"}>{f.signo === 1 ? "[+]" : "[-]"}</span>
                        <span title={AYUDA_FILAS[f.id] || undefined} className={AYUDA_FILAS[f.id] ? "cursor-help underline decoration-dotted decoration-slate-300 underline-offset-2" : ""}>{f.label}</span>
                      </td>
                      {f.valores.map((v, i) => {
                        const traza = data.rcv?.[f.id]?.[i];
                        const desdeRcv = traza && num(v) === traza.monto;
                        return (
                          <td key={i} className="px-0.5 py-0.5 relative"
                            title={desdeRcv ? `Desde RCV (${traza.archivo}, ${traza.documentos} doc.)` : undefined}>
                            {desdeRcv && <span className="absolute top-0.5 left-1 w-1.5 h-1.5 rounded-full bg-purple-500" />}
                            <CeldaInput value={v} onChange={val => setValorFila(f.id, i, val)} />
                          </td>
                        );
                      })}
                      <CeldaCalculada value={calc.filasTotales[f.id]} bold />
                      <td className="px-1 text-center">
                        {!f.fija && (
                          <button onClick={() => eliminarFila(f.id, f.label)} className="p-1 text-slate-300 hover:text-red-500 rounded">
                            <IconTrash />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}

                  {/* Agregar categoría */}
                  <tr>
                    <td colSpan={14} className="px-3 py-2">
                      {nuevaFila.abierto ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            autoFocus
                            value={nuevaFila.label}
                            onChange={e => setNuevaFila(n => ({ ...n, label: e.target.value }))}
                            placeholder="Nombre de la categoría (ej. Gtos dic 2024)"
                            className="px-2.5 py-1.5 text-xs border-2 border-slate-200 rounded-lg focus:outline-none focus:border-purple-400 w-56"
                            onKeyDown={e => e.key === "Enter" && agregarFila()}
                          />
                          <select
                            value={nuevaFila.signo}
                            onChange={e => setNuevaFila(n => ({ ...n, signo: parseInt(e.target.value, 10) }))}
                            className="px-2 py-1.5 text-xs border-2 border-slate-200 rounded-lg focus:outline-none"
                          >
                            <option value={-1}>Gasto (-)</option>
                            <option value={1}>Ingreso (+)</option>
                          </select>
                          <button onClick={agregarFila} className="px-3 py-1.5 bg-purple-700 text-white text-xs font-bold rounded-lg hover:bg-purple-800">Agregar</button>
                          <button onClick={() => setNuevaFila({ abierto: false, label: "", signo: -1 })} className="px-3 py-1.5 text-xs font-semibold text-slate-400 hover:text-slate-600">Cancelar</button>
                        </div>
                      ) : (
                        <button onClick={() => setNuevaFila(n => ({ ...n, abierto: true }))}
                          className="flex items-center gap-1.5 text-xs font-bold text-purple-700 hover:text-purple-900">
                          <IconPlus /> Agregar categoría
                        </button>
                      )}
                    </td>
                  </tr>

                  {/* Separador */}
                  <tr><td colSpan={14} className="h-1 bg-slate-100" /></tr>

                  {/* Base Imponible (calculada) */}
                  <tr className="bg-slate-50">
                    <td className="sticky left-0 bg-slate-50 px-3 py-1.5 text-xs font-black text-slate-800 z-10">[=] Base Imponible</td>
                    {calc.baseImponible.map((v, i) => <CeldaCalculada key={i} value={v} bold />)}
                    <CeldaCalculada value={calc.totalBaseImponible} bold />
                    <td />
                  </tr>

                  {/* Impuesto: automático (régimen) o manual */}
                  <tr className="border-b border-slate-50 hover:bg-purple-50/20">
                    <td className="sticky left-0 bg-white px-3 py-1 text-xs font-semibold text-slate-700 z-10 whitespace-nowrap">
                      [-] Impto
                      <button
                        onClick={() => setData(d => ({ ...d, impuestoAuto: !d.impuestoAuto, ...(d.impuestoAuto ? { impuesto: calc.impuesto } : {}) }))}
                        title={data.impuestoAuto ? "Calculado con la tasa del régimen. Clic para ingresarlo a mano." : "Ingresado a mano. Clic para calcularlo con la tasa del régimen."}
                        className={`ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${data.impuestoAuto ? "bg-purple-100 text-purple-700" : "bg-slate-100 text-slate-500"}`}
                      >
                        {data.impuestoAuto ? `auto ${(tasa * 100).toLocaleString("es-CL")}%` : "manual"}
                      </button>
                    </td>
                    {data.impuestoAuto
                      ? calc.impuesto.map((v, i) => <CeldaCalculada key={i} value={v} />)
                      : data.impuesto.map((v, i) => (
                        <td key={i} className="px-0.5 py-0.5">
                          <CeldaInput value={v} onChange={val => setValorExtra("impuesto", i, val)} />
                        </td>
                      ))}
                    <CeldaCalculada value={calc.totalImpuesto} bold />
                    <td />
                  </tr>

                  {/* Multas: no deducibles, pero salida de caja */}
                  <tr className="border-b border-slate-50 hover:bg-purple-50/20">
                    <td className="sticky left-0 bg-white px-3 py-1 text-xs font-semibold text-slate-700 z-10 whitespace-nowrap">
                      <span title="Multas e intereses fiscales. No rebajan la Base Imponible, pero sí la Utilidad Líquida." className="cursor-help underline decoration-dotted decoration-slate-300 underline-offset-2">[-] Multas</span>
                    </td>
                    {data.multas.map((v, i) => (
                      <td key={i} className="px-0.5 py-0.5">
                        <CeldaInput value={v} onChange={val => setValorExtra("multas", i, val)} />
                      </td>
                    ))}
                    <CeldaCalculada value={calc.totalMultas} bold />
                    <td />
                  </tr>

                  {/* Utilidad Líquida (calculada, destacada) */}
                  <tr className="bg-gradient-to-r from-purple-50 to-violet-50">
                    <td className="sticky left-0 px-3 py-2 text-xs font-black text-slate-900 z-10" style={{ background: "linear-gradient(to right, #faf5ff, #f5f3ff)" }}>
                      [=] Utilidad Líquida
                    </td>
                    {calc.utilidad.map((v, i) => <CeldaCalculada key={i} value={v} bold colorAuto />)}
                    <CeldaCalculada value={calc.totalUtilidad} bold colorAuto />
                    <td />
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Información complementaria: PPM */}
          <div className="glass-card rounded-xl overflow-hidden">
            <div className="bg-slate-700 px-4 py-2.5">
              <p className="text-white font-black text-xs">Información complementaria</p>
              <p className="text-slate-300 text-[10px]">El PPM es un anticipo del Impto anual: no afecta la Utilidad Líquida</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse" style={{ minWidth: 920 }}>
                <tbody>
                  <tr className="border-b border-slate-50">
                    <td className="sticky left-0 bg-white px-3 py-1 text-xs font-semibold text-slate-600 z-10" style={{ minWidth: 150 }}>PPM cancelado</td>
                    {data.ppm.map((v, i) => (
                      <td key={i} className="px-0.5 py-0.5" style={{ minWidth: 64 }}>
                        <CeldaInput value={v} onChange={val => setValorExtra("ppm", i, val)} />
                      </td>
                    ))}
                    <CeldaCalculada value={calc.totalPpm} bold />
                    <td className="w-8" />
                  </tr>
                  <tr>
                    <td className="sticky left-0 bg-white px-3 py-1 text-xs font-semibold text-slate-400 z-10 whitespace-nowrap"
                      title="Ingresos del mes × tasa de PPM del régimen. Es un anticipo del Impto, no un gasto.">
                      PPM sugerido ({(tasaPPM * 100).toLocaleString("es-CL")}%)
                    </td>
                    {calc.ppmSugerido.map((v, i) => <CeldaCalculada key={i} value={v} />)}
                    <CeldaCalculada value={calc.totalPpmSugerido} bold />
                    <td className="w-8" />
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
