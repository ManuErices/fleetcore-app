/**
 * ContabilidadCentralizacion.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Libro Diario → "Centralizar remuneraciones (RRHH)": un asiento por mes con
 * las liquidaciones de RRHH, calculadas con el mismo motor del Libro de
 * Remuneraciones Electrónico (codigosLREMes). La lógica del asiento vive en
 * src/lib/contabilidad/centralizacion.js.
 *
 * Idempotente: el asiento lleva importHash "rrhh-centralizacion-YYYY-MM". Si
 * ya existe uno vigente, se ofrece reemplazarlo: se REVERSA (queda la traza,
 * como en el resto del libro) y se registra el nuevo.
 *
 * El mapeo concepto → cuenta se guarda en empresas/{id}/config/centralizacion
 * y se reutiliza el mes siguiente.
 */
import React, { useEffect, useMemo, useState } from "react";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useEmpresa } from "../../lib/useEmpresa";
import { useContabilidad, MESES } from "./ContabilidadContext";
import {
  Cifra, LineaGuia, Nota, Boton, Campo, ModalCuaderno, Casilla,
} from "../finanzas/cuaderno";
import {
  CONCEPTOS_CENTRALIZACION, construirCentralizacion, sugerirMapeo, hashCentralizacion, finDeMes,
} from "../../lib/contabilidad/centralizacion";

const ORIGEN = "rrhh_centralizacion";

/** Siguiente correlativo "AAAA-NNNNN" a partir de otro. */
const siguienteNumero = (numero) => {
  const [a, n] = String(numero).split("-");
  return `${a}-${String((parseInt(n, 10) || 0) + 1).padStart(5, "0")}`;
};

export default function ModalCentralizacion({ onClose }) {
  const { empresaId } = useEmpresa();
  const {
    cuentas, asientosTodos, periodoActivo, setPeriodoActivo, guardarAsiento, reversarAsiento,
    periodoCerrado, siguienteCorrelativo,
  } = useContabilidad();

  const [periodo, setPeriodo] = useState(periodoActivo);
  const [incluirBorradores, setIncluirBorradores] = useState(false);
  const [datos, setDatos] = useState(null);       // { codigos, liquidaciones, borradores, sinContrato }
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [mapeo, setMapeo] = useState({});
  const [mapeoListo, setMapeoListo] = useState(false);
  const [verMapeo, setVerMapeo] = useState(false);
  const [reemplazar, setReemplazar] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const [anio, mes] = String(periodo).split("-").map(Number);

  // Mapeo guardado + sugerencias por nombre para lo que falte
  useEffect(() => {
    if (!empresaId) return;
    let vivo = true;
    (async () => {
      let guardado = {};
      try {
        const s = await getDoc(doc(db, "empresas", empresaId, "config", "centralizacion"));
        if (s.exists()) guardado = s.data().mapeo || {};
      } catch (e) { console.error("Error leyendo mapeo de centralización:", e); }
      if (!vivo) return;
      const m = sugerirMapeo(cuentas, guardado);
      setMapeo(m);
      // Primera vez (sin mapeo guardado) se abre el mapeo para revisarlo
      setVerMapeo(!Object.keys(guardado).length);
      setMapeoListo(true);
    })();
    return () => { vivo = false; };
  }, [empresaId, cuentas]);

  // Liquidaciones del mes, con el motor de RRHH
  useEffect(() => {
    if (!empresaId || !anio || !mes) return;
    let vivo = true;
    setCargando(true); setError("");
    (async () => {
      try {
        const { codigosLREMes } = await import("../rrhh/resumenContable");
        const r = await codigosLREMes(empresaId, anio, mes, { incluirBorradores });
        if (vivo) setDatos(r);
      } catch (e) {
        console.error("Error calculando remuneraciones:", e);
        if (vivo) setError("No se pudieron leer las liquidaciones de RRHH.");
      } finally {
        if (vivo) setCargando(false);
      }
    })();
    return () => { vivo = false; };
  }, [empresaId, anio, mes, incluirBorradores]);

  const resultado = useMemo(
    () => (datos ? construirCentralizacion(datos.codigos, mapeo, cuentas) : null),
    [datos, mapeo, cuentas]
  );

  const hash = hashCentralizacion(periodo);
  // Vigente = no reversado. Uno reversado no bloquea: se reversa para recentralizar.
  const existente = asientosTodos.find(a => a.importHash === hash && !a.reversado && !a.reversaDe);
  const cerrado = periodoCerrado(periodo);

  const nombreCuenta = (id) => {
    const c = cuentas.find(x => x.id === id);
    return c ? `${c.codigo} — ${c.nombre}` : "";
  };
  const cuentasActivas = cuentas.filter(c => c.activa !== false);

  const puedeGuardar = !!resultado && resultado.lineas.length > 0 && !resultado.faltan.length
    && resultado.totalDebe === resultado.totalHaber && !cerrado && (!existente || reemplazar) && !guardando;

  const registrar = async () => {
    if (!puedeGuardar) return;
    setGuardando(true); setError("");
    try {
      // El mapeo se guarda aunque falle el asiento: ya fue revisado
      await setDoc(doc(db, "empresas", empresaId, "config", "centralizacion"),
        { mapeo, updatedAt: serverTimestamp() }, { merge: true });

      // El correlativo se calcula antes de reversar: el reverso toma el
      // siguiente y el estado en memoria aún no lo ve, así que el nuevo asiento
      // usa el que viene después (si no, ambos quedarían con el mismo número).
      let numero = siguienteCorrelativo(periodo);
      if (existente) {
        await reversarAsiento(existente.id, "Recentralización de remuneraciones desde RRHH");
        numero = siguienteNumero(numero);
      }
      const n = datos.liquidaciones;
      await guardarAsiento({
        numero,
        fecha: finDeMes(periodo),
        periodo,
        glosa: `Centralización remuneraciones ${MESES[mes - 1]} ${anio} (${n} liquidaci${n === 1 ? "ón" : "ones"}${incluirBorradores && datos.borradores ? `, incluye ${datos.borradores} en borrador` : ""})`,
        tipo: "remuneraciones",
        origen: ORIGEN,
        importHash: hash,
        // Cada línea guarda su `concepto`: permite rastrear qué parte del LRE
        // la originó si después se cambia el plan de cuentas.
        lineas: resultado.lineas,
        totalDebe: resultado.totalDebe,
        ajusteRedondeo: resultado.ajuste || 0,
        incluyeBorradores: !!incluirBorradores,
      });
      if (periodo !== periodoActivo) setPeriodoActivo(periodo);
      onClose();
    } catch (e) {
      console.error(e);
      setError(e.message || "No se pudo registrar el asiento.");
    }
    setGuardando(false);
  };

  return (
    <ModalCuaderno
      titulo="Centralizar remuneraciones"
      subtitulo="Un asiento por mes desde las liquidaciones de RRHH, con el mismo cálculo del Libro de Remuneraciones"
      onClose={onClose}
      ancho="max-w-3xl"
      bloqueado={guardando}
      pie={
        <div className="flex flex-wrap items-center gap-3">
          <Boton variante="texto" onClick={onClose} disabled={guardando}>Cancelar</Boton>
          <div className="flex-1" />
          <Boton variante="primario" onClick={registrar} disabled={!puedeGuardar}>
            {guardando ? "Registrando…" : existente ? "Reversar y registrar de nuevo" : "Registrar asiento"}
          </Boton>
        </div>
      }
    >
      <div className="flex flex-wrap items-end gap-6">
        <Campo etiqueta="Mes a centralizar" type="month" className="w-48"
          value={periodo} onChange={e => { if (e.target.value) { setPeriodo(e.target.value); setReemplazar(false); } }} />
        {datos && (
          <p className="m-0 text-[16px] text-cuaderno-grafito">
            {datos.liquidaciones} liquidaci{datos.liquidaciones === 1 ? "ón" : "ones"} en el asiento
          </p>
        )}
      </div>

      {datos?.borradores > 0 && (
        <Casilla marcada={incluirBorradores} onCambiar={setIncluirBorradores}
          descripcion="Las liquidaciones cargadas con el importador masivo quedan en borrador. El Libro de Remuneraciones no las declara hasta que se revisan.">
          Incluir {datos.borradores} liquidaci{datos.borradores === 1 ? "ón" : "ones"} en borrador
        </Casilla>
      )}
      {datos?.sinContrato > 0 && (
        <Nota etiqueta="Ojo:">{datos.sinContrato} liquidaciones no tienen contrato asociado y no se pueden calcular.</Nota>
      )}
      {cerrado && <Nota etiqueta="Ojo:">El período {periodo} está cerrado. Reábrelo para centralizar.</Nota>}
      {existente && (
        <div className="space-y-2">
          <Nota etiqueta="Ya existe:" tono="grafito">
            El asiento {existente.numero || existente.id} centraliza este mes (<Cifra valor={existente.totalDebe} escala="pesos" color="heredar" />).
            No se duplica: para cambiarlo se reversa y se registra el nuevo.
          </Nota>
          <Casilla marcada={reemplazar} onCambiar={setReemplazar}>Reversar el asiento anterior y registrar este</Casilla>
        </div>
      )}

      {cargando ? (
        <p className="m-0 py-6 text-center text-[17px] text-cuaderno-grafito">Calculando las liquidaciones de {MESES[mes - 1]?.toLowerCase()} {anio}…</p>
      ) : error && !datos ? (
        <Nota etiqueta="Ojo:">{error}</Nota>
      ) : resultado && !resultado.lineas.length ? (
        <p className="m-0 py-6 text-center text-[17px] text-cuaderno-grafito">No hay liquidaciones {incluirBorradores ? "" : "aprobadas "}en {MESES[mes - 1]?.toLowerCase()} {anio}.</p>
      ) : resultado && (
        <section>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[16px]">
              <thead>
                <tr className="shadow-[inset_0_-1.5px_0_rgb(var(--cuaderno-tinta))]">
                  <th className="px-2 py-1.5 text-left font-normal text-[14px] text-cuaderno-grafito">Concepto</th>
                  <th className="px-2 py-1.5 text-left font-normal text-[14px] text-cuaderno-grafito">Cuenta</th>
                  <th className="px-2 py-1.5 text-right font-normal text-[14px] text-cuaderno-grafito">Debe</th>
                  <th className="px-2 py-1.5 text-right font-normal text-[14px] text-cuaderno-grafito">Haber</th>
                </tr>
              </thead>
              <tbody>
                {resultado.lineas.map(l => (
                  <tr key={l.concepto} className="border-b border-cuaderno-renglon">
                    <td className="px-2 py-1">{l.descripcion}</td>
                    <td className="px-2 py-1 text-[15px]">
                      {l.cuentaId ? nombreCuenta(l.cuentaId) : <span className="text-cuaderno-roja">sin cuenta</span>}
                    </td>
                    <td className="px-2 py-1 text-right">{l.debe ? <Cifra valor={l.debe} escala="pesos" /> : null}</td>
                    <td className="px-2 py-1 text-right">{l.haber ? <Cifra valor={l.haber} escala="pesos" /> : null}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={2} className="px-2 py-2">Totales</td>
                  <td className="px-2 py-2 text-right"><Cifra valor={resultado.totalDebe} escala="pesos" raya="total" /></td>
                  <td className="px-2 py-2 text-right"><Cifra valor={resultado.totalHaber} escala="pesos" raya="total" /></td>
                </tr>
              </tfoot>
            </table>
          </div>
          {resultado.ajuste !== 0 && (
            <Nota etiqueta="Ajuste:" tono="grafito" className="mt-2">
              <Cifra valor={resultado.ajuste} escala="pesos" color="heredar" /> sumados a Remuneraciones por pagar para cuadrar: hay líquidos negativos que el Libro de Remuneraciones informa en cero.
            </Nota>
          )}
          {resultado.faltan.length > 0 && (
            <Nota etiqueta="Falta:" className="mt-2">Elige la cuenta de {resultado.faltan.map(id => CONCEPTOS_CENTRALIZACION.find(k => k.id === id)?.label.toLowerCase()).join(", ")}.</Nota>
          )}
        </section>
      )}

      {mapeoListo && (
        <section className="space-y-3">
          <Boton variante="texto" onClick={() => setVerMapeo(v => !v)} aria-expanded={verMapeo}>
            {verMapeo ? "Ocultar cuentas" : "Cambiar cuentas del asiento"}
          </Boton>
          {verMapeo && (
            <div className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
              {CONCEPTOS_CENTRALIZACION.map(k => (
                <Campo key={k.id} as="select" etiqueta={`${k.label} · ${k.lado}`} ayuda={k.ayuda}
                  value={mapeo[k.id] || ""} onChange={e => setMapeo(m => ({ ...m, [k.id]: e.target.value }))}>
                  <option value="">— Seleccionar cuenta —</option>
                  {cuentasActivas.map(c => <option key={c.id} value={c.id}>{c.codigo} — {c.nombre}</option>)}
                </Campo>
              ))}
              <p className="m-0 sm:col-span-2 text-[14px] text-cuaderno-grafito">
                Las cuentas se sugieren por nombre y se guardan al registrar, para el mes siguiente. Si falta una (por ejemplo AFP por pagar), créala en el Plan de cuentas.
              </p>
            </div>
          )}
        </section>
      )}

      {datos && !cargando && (
        <LineaGuia etiqueta="Fecha del asiento">{finDeMes(periodo)}</LineaGuia>
      )}
      {error && datos && <Nota etiqueta="Ojo:">{error}</Nota>}
    </ModalCuaderno>
  );
}
