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
import {
  Titulo, Hoja, Cifra, LineaGuia, Resaltado, Nota, VistoBueno, Boton, FechaHoja,
} from "../finanzas/cuaderno";

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

  const nombreMes = `${MESES[parseInt(mes) - 1]} ${anio}`;
  const TH = "font-normal text-[15px] text-cuaderno-grafito px-2 py-2 whitespace-nowrap";

  return (
    <div className="cuaderno px-8 pt-5 pb-10 space-y-5">

      <FechaHoja />

      <header>
        <p className="m-0 text-[15px] text-cuaderno-grafito">Contabilización</p>
        <Titulo>Depreciación del período</Titulo>
        <p className="m-0 text-[17px] text-cuaderno-grafito">
          Método lineal · prorrateo desde el mes siguiente a la adquisición · NIC 16
        </p>
      </header>

      {/* Estado */}
      {!cGasto || !cAcum ? (
        <div className="space-y-1">
          <Nota etiqueta="Ojo:">Faltan cuentas en el plan.</Nota>
          <p className="m-0 text-[15px] text-cuaderno-grafito">
            Se necesitan 6-03-001 Depreciación del Período y 1-02-002 Depreciación Acumulada.
          </p>
        </div>
      ) : yaGenerado ? (
        <div className="space-y-1">
          <p className="m-0 flex items-center gap-2 text-[18px] text-cuaderno-verde">
            <VistoBueno tamano={15} titulo="" />
            La depreciación de {nombreMes} ya está contabilizada
          </p>
          <p className="m-0 text-[15px] text-cuaderno-grafito">
            Si necesitas rehacerla, elimina primero el asiento desde el Libro Diario.
          </p>
        </div>
      ) : cerrado ? (
        <p className="m-0 text-[18px] text-cuaderno-grafito">
          <Resaltado color="lavanda">El período está cerrado</Resaltado>
        </p>
      ) : (
        <Hoja titulo={`A contabilizar en ${nombreMes}`}>
          <div className="flex flex-col sm:flex-row sm:items-end gap-4">
            <div className="flex-1 max-w-md">
              <LineaGuia etiqueta="Depreciación del mes">
                <Cifra valor={total} escala="pesos" vacio="$0" raya="doble" />
              </LineaGuia>
              <p className="m-0 text-[14px] text-cuaderno-grafito">
                {depreciables.length} de {detalle.length} activos
              </p>
            </div>
            <Boton variante="primario" onClick={generar} disabled={!puedeGenerar || guardando}>
              {guardando ? "Generando…" : "Generar asiento"}
            </Boton>
          </div>
        </Hoja>
      )}

      {mensaje && (mensaje.ok
        ? <p className="m-0 flex items-center gap-2 text-[17px] text-cuaderno-verde"><VistoBueno tamano={15} titulo="" />{mensaje.texto}</p>
        : <Nota etiqueta="Ojo:">{mensaje.texto}</Nota>)}

      {/* Detalle */}
      <Hoja titulo="Detalle por activo">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse" style={{ minWidth: 720 }}>
            <thead>
              <tr className="shadow-[inset_0_-1.5px_0_rgb(var(--cuaderno-tinta))]">
                <th className={`${TH} text-left`}>Activo</th>
                <th className={`${TH} text-left`}>Familia SII</th>
                <th className={`${TH} text-right`}>Valor compra</th>
                <th className={`${TH} text-right`}>Residual</th>
                <th className={`${TH} text-left`}>Vida útil</th>
                <th className={`${TH} text-right`}>Cuota mes</th>
                <th className={`${TH} text-left`}>Estado</th>
              </tr>
            </thead>
            <tbody>
              {cargando && (
                <tr><td colSpan={7} className="px-2 py-8 text-center text-[17px] text-cuaderno-grafito">Cargando activos…</td></tr>
              )}
              {!cargando && detalle.length === 0 && (
                <tr><td colSpan={7} className="py-12 text-center">
                  <p className="m-0 font-ligada font-light text-[22px] leading-[1.6]">No hay activos registrados</p>
                </td></tr>
              )}
              {!cargando && detalle.map(d => (
                <tr key={d.id} className={`border-b border-cuaderno-renglon hover:bg-cuaderno-papel ${d.monto > 0 ? "" : "text-cuaderno-grafito"}`}>
                  <td className="px-2 py-2 text-[17px]">{d.nombre}</td>
                  <td className="px-2 py-2 text-[15px] text-cuaderno-grafito">{familiaTributaria(d)}</td>
                  <td className="px-2 py-2 text-right text-[16px]">
                    {d.valorCompra ? <Cifra valor={num(d.valorCompra)} escala="pesos" color="heredar" /> : <span className="text-cuaderno-grafito">—</span>}
                  </td>
                  <td className="px-2 py-2 text-right text-[16px]">
                    {d.valorResidual ? <Cifra valor={num(d.valorResidual)} escala="pesos" color="heredar" /> : <span className="text-cuaderno-grafito">—</span>}
                  </td>
                  <td className="px-2 py-2 text-[15px] whitespace-nowrap">
                    {num(d.vidaUtilAnios) || vidaUtilTributaria(d)} años
                    {!num(d.vidaUtilAnios) && <span className="text-cuaderno-grafito"> (SII)</span>}
                  </td>
                  <td className="px-2 py-2 text-right text-[16px]">
                    {d.monto > 0 ? <Cifra valor={d.monto} escala="pesos" /> : <span className="text-cuaderno-grafito">—</span>}
                  </td>
                  <td className="px-2 py-2 text-[14px]">
                    {d.monto > 0
                      ? <span className="text-cuaderno-grafito">mes {d.mesN ?? "?"} de {d.totalMeses ?? "?"}</span>
                      : <Resaltado color="durazno">{d.motivo}</Resaltado>}
                  </td>
                </tr>
              ))}
            </tbody>
            {!cargando && (
              <tfoot>
                <tr>
                  <td colSpan={5} className="px-2 pt-3 text-right text-[17px]">Total del mes</td>
                  <td className="px-2 pt-3 text-right text-[17px]">
                    <Cifra valor={total} escala="pesos" vacio="$0" raya="total" />
                  </td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </Hoja>

      <p className="m-0 text-[15px] leading-snug text-cuaderno-grafito">
        Cuando un activo no tiene vida útil propia se usa la tabla del SII según su familia.
        El valor residual se lee del campo valorResidual de la ficha
        del equipo; si no está definido se deprecia el 100% del valor de compra.
      </p>
    </div>
  );
}
