/**
 * ContabilidadDepreciacion.jsx — src/pages/contabilidad/ContabilidadDepreciacion.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Genera el asiento mensual de depreciación.
 *
 * Existía la cuenta 6-03-001 "Depreciación del Período" y la 1-02-002
 * "Depreciación Acumulada", pero nada las alimentaba: la depreciación se
 * calculaba solo para mostrarla en pantalla. Consecuencias que esto corrige:
 *
 *   · El activo fijo figuraba a valor de compra para siempre.
 *   · La Depreciación Acumulada quedaba en cero en el balance.
 *   · La RLI del F22 sumaba de vuelta una depreciación que nunca se había
 *     rebajado como gasto, inflando la base imponible.
 */

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useEmpresa } from "../../lib/useEmpresa";
import { useContabilidad, fmt, MESES } from "./ContabilidadContext";

// ─── Vida útil tributaria ─────────────────────────────────────────────────────
// Tabla del SII, en años. El lookup se hace normalizado porque el campo `tipo`
// de /machines viene en mayúsculas y con nombres operativos ("EXCAVADORA",
// "CAMIÓN COMBUSTIBLE"), no con las claves de esta tabla. Antes se consultaba
// directo y caía siempre al default de 5 años.
export const VIDA_UTIL_TRIB = {
  maquinaria:  10,
  vehiculo:     7,
  herramienta:  3,
  otro:         5,
};

const norm = (s) => String(s ?? "")
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();

/** Resuelve la familia tributaria de un activo a partir de su tipo o su nombre. */
export function familiaTributaria(activo) {
  const t = norm(activo?.tipo);
  const n = norm(activo?.nombre);
  if (VIDA_UTIL_TRIB[t]) return t;

  const texto = `${t} ${n}`;
  const VEHICULO = ["camioneta", "camion", "furgon", "vehiculo", "bus", "minibus",
    "suv", "jeep", "pickup", "van", "hilux", "aljibe"];
  const HERRAMIENTA = ["herramienta", "martillo", "compactador", "generador",
    "soldadora", "placa", "vibro"];
  const MAQUINARIA = ["excavadora", "bulldozer", "cargador", "motoniveladora",
    "retroexcavadora", "grua", "maquinaria", "rodillo", "tolva"];

  if (MAQUINARIA.some(k => texto.includes(k)))   return "maquinaria";
  if (VEHICULO.some(k => texto.includes(k)))     return "vehiculo";
  if (HERRAMIENTA.some(k => texto.includes(k)))  return "herramienta";
  return "otro";
}

export const vidaUtilTributaria = (a) => VIDA_UTIL_TRIB[familiaTributaria(a)];

// ─── Cálculo ──────────────────────────────────────────────────────────────────

const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };

/** Meses transcurridos entre la fecha de compra y el cierre del período "YYYY-MM". */
function mesesDesdeCompra(fechaCompra, periodo) {
  if (!fechaCompra || !periodo) return null;
  const c = new Date(fechaCompra);
  if (isNaN(c)) return null;
  const [a, m] = periodo.split("-").map(Number);
  // Se deprecia desde el mes SIGUIENTE al de adquisición (criterio conservador
  // y el más usado): un activo comprado en noviembre no carga el año completo.
  return (a - c.getFullYear()) * 12 + (m - (c.getMonth() + 1));
}

/**
 * Depreciación lineal del MES para un activo, con valor residual y prorrateo.
 * Devuelve 0 si el activo aún no entra en servicio o ya está totalmente depreciado.
 */
export function depreciacionMensual(activo, periodo) {
  const valor    = num(activo.valorCompra);
  const residual = num(activo.valorResidual);
  const anios    = num(activo.vidaUtilAnios) || vidaUtilTributaria(activo);
  if (valor <= 0 || anios <= 0) return { monto: 0, motivo: "Sin valor de compra o vida útil" };
  if (residual >= valor)        return { monto: 0, motivo: "Valor residual ≥ valor de compra" };

  const depreciable = valor - residual;
  const cuotaMes    = depreciable / (anios * 12);

  const meses = mesesDesdeCompra(activo.fechaCompra, periodo);
  if (meses === null) return { monto: Math.round(cuotaMes), motivo: "Sin fecha de compra — no se prorratea" };
  if (meses <= 0)     return { monto: 0, motivo: "Aún no entra en servicio" };
  if (meses > anios * 12) return { monto: 0, motivo: "Totalmente depreciado" };

  return { monto: Math.round(cuotaMes), motivo: null, mesN: meses, totalMeses: anios * 12 };
}

// ─── Hook de activos ──────────────────────────────────────────────────────────
function useActivos() {
  const { empresaId } = useEmpresa();
  const [activos, setActivos] = useState([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    if (!empresaId) return;
    let vivo = true;
    (async () => {
      try {
        const snap = await getDocs(collection(db, "empresas", empresaId, "machines"));
        if (!vivo) return;
        setActivos(snap.docs.filter(d => d.data().active !== false).map(d => ({
          id: d.id,
          nombre:         d.data().name || d.data().nombre || d.id,
          tipo:           d.data().tipo || d.data().type || "",
          valorCompra:    d.data().valorCompra    || "",
          valorResidual:  d.data().valorResidual  || "",
          fechaCompra:    d.data().fechaCompra    || "",
          vidaUtilAnios:  d.data().vidaUtilAnios  || "",
        })));
      } catch (e) { console.error("useActivos:", e); }
      if (vivo) setCargando(false);
    })();
    return () => { vivo = false; };
  }, [empresaId]);

  return { activos, cargando };
}

// ─── Componente ───────────────────────────────────────────────────────────────
export default function ContabilidadDepreciacion() {
  const { cuentas, asientosTodos, periodoActivo, guardarAsiento, periodoCerrado } = useContabilidad();
  const { activos, cargando } = useActivos();
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState(null);

  const [anio, mes] = periodoActivo.split("-");

  // Cuentas destino
  const cGasto = cuentas.find(c => c.codigo === "6-03-001")
              || cuentas.find(c => /depreciaci/i.test(c.nombre) && c.tipo === "otro_resultado");
  const cAcum  = cuentas.find(c => c.codigo === "1-02-002")
              || cuentas.find(c => /depreciaci.*acumulada/i.test(c.nombre));

  const detalle = useMemo(
    () => activos.map(a => ({ ...a, ...depreciacionMensual(a, periodoActivo) })),
    [activos, periodoActivo]
  );

  const depreciables = detalle.filter(d => d.monto > 0);
  const total = depreciables.reduce((s, d) => s + d.monto, 0);

  // ¿Ya se generó el asiento de este período? Se marca con origen "depreciacion".
  const yaGenerado = useMemo(
    () => asientosTodos.find(a => a.periodo === periodoActivo && a.origen === "depreciacion"),
    [asientosTodos, periodoActivo]
  );

  const cerrado = periodoCerrado(periodoActivo);
  const puedeGenerar = total > 0 && cGasto && cAcum && !yaGenerado && !cerrado;

  const generar = async () => {
    if (!puedeGenerar) return;
    setGuardando(true);
    setMensaje(null);
    try {
      await guardarAsiento({
        fecha:  `${periodoActivo}-01`,
        glosa:  `Depreciación del período ${MESES[parseInt(mes) - 1]} ${anio} · ${depreciables.length} activos`,
        tipo:   "automatico",
        origen: "depreciacion",
        periodo: periodoActivo,
        lineas: [
          { cuentaId: cGasto.id, cuentaNombre: cGasto.nombre, debe: total, haber: 0,
            descripcion: "Depreciación del ejercicio" },
          { cuentaId: cAcum.id,  cuentaNombre: cAcum.nombre,  debe: 0, haber: total,
            descripcion: "Depreciación acumulada" },
        ],
        totalDebe: total,
        _detalle: depreciables.map(d => ({ activo: d.nombre, monto: d.monto })),
      });
      setMensaje({ ok: true, texto: `Asiento generado por ${fmt(total)}` });
    } catch (e) {
      setMensaje({ ok: false, texto: e.message });
    }
    setGuardando(false);
  };

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div className="rounded-2xl overflow-hidden" style={{ background: "#0f2744" }}>
        <div className="px-6 py-4">
          <p className="text-white/50 text-[10px] font-bold uppercase tracking-[2px]">Contabilización</p>
          <h2 className="text-white font-black text-xl tracking-tight">Depreciación del Período</h2>
          <p className="text-blue-300 text-xs mt-0.5">
            Método lineal · prorrateo desde el mes siguiente a la adquisición · NIC 16
          </p>
        </div>
      </div>

      {/* Estado */}
      {!cGasto || !cAcum ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-sm font-bold text-red-700">Faltan cuentas en el plan</p>
          <p className="text-xs text-red-600 mt-1">
            Se necesitan <span className="font-mono">6-03-001 Depreciación del Período</span> y{" "}
            <span className="font-mono">1-02-002 Depreciación Acumulada</span>.
          </p>
        </div>
      ) : yaGenerado ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
          <p className="text-sm font-bold text-emerald-700">
            La depreciación de {MESES[parseInt(mes) - 1]} {anio} ya está contabilizada
          </p>
          <p className="text-xs text-emerald-600 mt-1">
            Si necesitas rehacerla, elimina primero el asiento desde el Libro Diario.
          </p>
        </div>
      ) : cerrado ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-sm font-bold text-slate-700">El período está cerrado</p>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-4 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
              A contabilizar en {MESES[parseInt(mes) - 1]} {anio}
            </p>
            <p className="text-2xl font-black text-slate-800 mt-0.5">{fmt(total)}</p>
            <p className="text-xs text-slate-400 mt-0.5">
              {depreciables.length} de {detalle.length} activos
            </p>
          </div>
          <button onClick={generar} disabled={!puedeGenerar || guardando}
            className="px-5 py-2.5 bg-purple-700 hover:bg-purple-800 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold text-sm rounded-xl transition-colors">
            {guardando ? "Generando…" : "Generar asiento"}
          </button>
        </div>
      )}

      {mensaje && (
        <div className={`rounded-xl px-4 py-3 border ${mensaje.ok ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"}`}>
          <p className={`text-sm font-bold ${mensaje.ok ? "text-emerald-700" : "text-red-700"}`}>{mensaje.texto}</p>
        </div>
      )}

      {/* Detalle */}
      <div className="rounded-2xl overflow-hidden border border-slate-200">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: 720 }}>
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                {["Activo", "Familia SII", "Valor compra", "Residual", "Vida útil", "Cuota mes", "Estado"].map(h => (
                  <th key={h} className="px-3 py-2.5 text-[10px] font-black text-slate-500 uppercase tracking-widest text-left whitespace-nowrap border-b-2 border-slate-200">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {cargando && (
                <tr><td colSpan={7} className="px-3 py-6 text-center text-slate-400">Cargando activos…</td></tr>
              )}
              {!cargando && detalle.map(d => (
                <tr key={d.id} className={d.monto > 0 ? "" : "bg-slate-50/60"}>
                  <td className="px-3 py-2 font-bold text-slate-700">{d.nombre}</td>
                  <td className="px-3 py-2 text-slate-500 text-xs">{familiaTributaria(d)}</td>
                  <td className="px-3 py-2 font-mono text-slate-600 text-xs">{d.valorCompra ? fmt(num(d.valorCompra)) : "—"}</td>
                  <td className="px-3 py-2 font-mono text-slate-500 text-xs">{d.valorResidual ? fmt(num(d.valorResidual)) : "—"}</td>
                  <td className="px-3 py-2 text-slate-500 text-xs">
                    {num(d.vidaUtilAnios) || vidaUtilTributaria(d)} años
                    {!num(d.vidaUtilAnios) && <span className="text-slate-300"> (SII)</span>}
                  </td>
                  <td className="px-3 py-2 font-mono font-bold text-slate-700">{d.monto > 0 ? fmt(d.monto) : "—"}</td>
                  <td className="px-3 py-2 text-xs">
                    {d.monto > 0
                      ? <span className="text-slate-400">mes {d.mesN ?? "?"} de {d.totalMeses ?? "?"}</span>
                      : <span className="text-amber-600">{d.motivo}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
            {!cargando && (
              <tfoot>
                <tr style={{ background: "#0f2744" }}>
                  <td colSpan={5} className="px-3 py-2.5 text-right text-xs font-black text-white uppercase tracking-widest">Total del mes</td>
                  <td className="px-3 py-2.5 font-mono font-black text-white">{fmt(total)}</td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      <p className="text-[11px] text-slate-400 leading-snug">
        Cuando un activo no tiene vida útil propia se usa la tabla del SII según su familia.
        El valor residual se lee del campo <span className="font-mono">valorResidual</span> de la ficha
        del equipo; si no está definido se deprecia el 100% del valor de compra.
      </p>
    </div>
  );
}
