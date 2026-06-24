import React, { useState, useEffect, useCallback, useMemo } from "react";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useEmpresa } from "../../lib/useEmpresa";
import { fmt, MESES_S } from "./ContabilidadContext";

/**
 * ContabilidadFlujoMensual.jsx
 * ─────────────────────────────
 * Módulo independiente de captura MANUAL del flujo mensual de la empresa
 * (replica la hoja "flujo mensual" que la contadora llevaba en Excel).
 *
 * IMPORTANTE: este módulo NO lee del Libro Diario. Las categorías y montos
 * se ingresan a mano, mes a mes. Es un seguimiento paralelo — no afecta ni
 * se recalcula desde los Estados Financieros / ERP del módulo Contabilidad.
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
 *     impuesto: [12 números],   // fila "Impto" — se resta de la Base Imponible
 *     ppm:      [12 números],   // informativo — PPM cancelado
 *     multas:   [12 números],   // informativo — multas/intereses por mora
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
];

const vacio12 = () => Array(12).fill(0);
const num = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
const sum = arr => arr.reduce((s, v) => s + (num(v)), 0);

function docVacio(anio) {
  return {
    anio,
    filas: FILAS_BASE.map(f => ({ ...f, fija: true, valores: vacio12() })),
    impuesto: vacio12(),
    ppm: vacio12(),
    multas: vacio12(),
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
  return {
    anio,
    filas: filas.length ? filas : docVacio(anio).filas,
    impuesto: fix12(raw.impuesto),
    ppm: fix12(raw.ppm),
    multas: fix12(raw.multas),
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

// ─── Componente principal ─────────────────────────────────────────────────────
export default function ContabilidadFlujoMensual() {
  const { empresaId } = useEmpresa();
  const anioActual = new Date().getFullYear();

  const [anio, setAnio]           = useState(anioActual);
  const [data, setData]           = useState(() => docVacio(anioActual));
  const [original, setOriginal]   = useState(() => docVacio(anioActual));
  const [cargando, setCargando]   = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [nuevaFila, setNuevaFila] = useState({ abierto: false, label: "", signo: -1 });

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

  // ── Cálculos derivados ──
  const calc = useMemo(() => {
    const baseImponible = vacio12();
    data.filas.forEach(f => f.valores.forEach((v, i) => { baseImponible[i] += f.signo * num(v); }));
    const utilidad = baseImponible.map((v, i) => v - num(data.impuesto[i]));
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
      totalImpuesto: sum(data.impuesto),
      totalPpm: sum(data.ppm),
      totalMultas: sum(data.multas),
      mejorMes, peorMes,
    };
  }, [data]);

  if (!empresaId) {
    return <div className="p-6 text-sm text-slate-500">Cargando empresa…</div>;
  }

  return (
    <div className="p-4 sm:p-6 space-y-5">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div>
          <h1 className="text-xl font-black text-slate-900">Flujo Mensual</h1>
          <p className="text-xs text-slate-500 mt-0.5">Captura manual mes a mes · Resultado del Ejercicio</p>
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

      {/* Aviso */}
      <div className="flex items-start gap-3 px-4 py-3 bg-amber-50 border-2 border-amber-200 rounded-xl">
        <svg className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="text-xs text-amber-700 font-semibold">
          Los valores de este módulo se ingresan a mano y son independientes del Libro Diario y de los Estados Financieros calculados automáticamente.
        </p>
      </div>

      {cargando ? (
        <div className="glass-card rounded-xl p-8 text-center text-sm text-slate-400">Cargando {anio}…</div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KpiFlujo label={`Ingresos ${anio}`} value={fmt(calc.totalIngresos)} color="text-emerald-600" />
            <KpiFlujo label={`Gastos ${anio}`} value={fmt(calc.totalGastos)} color="text-red-600" />
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
              <p className="text-purple-200 text-xs">Ingresa los montos netos de cada categoría, mes a mes</p>
            </div>

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
                        {f.label}
                      </td>
                      {f.valores.map((v, i) => (
                        <td key={i} className="px-0.5 py-0.5">
                          <CeldaInput value={v} onChange={val => setValorFila(f.id, i, val)} />
                        </td>
                      ))}
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

                  {/* Impuesto (editable) */}
                  <tr className="border-b border-slate-50 hover:bg-purple-50/20">
                    <td className="sticky left-0 bg-white px-3 py-1 text-xs font-semibold text-slate-700 z-10">[-] Impto</td>
                    {data.impuesto.map((v, i) => (
                      <td key={i} className="px-0.5 py-0.5">
                        <CeldaInput value={v} onChange={val => setValorExtra("impuesto", i, val)} />
                      </td>
                    ))}
                    <CeldaCalculada value={calc.totalImpuesto} bold />
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

          {/* Información complementaria: PPM y multas */}
          <div className="glass-card rounded-xl overflow-hidden">
            <div className="bg-slate-700 px-4 py-2.5">
              <p className="text-white font-black text-xs">Información complementaria</p>
              <p className="text-slate-300 text-[10px]">No afecta el cálculo de Utilidad Líquida — solo seguimiento</p>
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
                    <td className="sticky left-0 bg-white px-3 py-1 text-xs font-semibold text-slate-600 z-10">Multas</td>
                    {data.multas.map((v, i) => (
                      <td key={i} className="px-0.5 py-0.5">
                        <CeldaInput value={v} onChange={val => setValorExtra("multas", i, val)} />
                      </td>
                    ))}
                    <CeldaCalculada value={calc.totalMultas} bold />
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
