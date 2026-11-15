import React, { useState, useMemo, useEffect, useCallback } from "react";
import { collection, getDocs, doc, getDoc } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useEmpresa } from "../../lib/useEmpresa";
import { useContabilidad, PeriodoSelector, MESES, MESES_S } from "./ContabilidadContext";
import {
  Cifra, Titulo, Hoja, LineaGuia, Nota, Resaltado, Campo, Pestanas, FechaHoja,
} from "../finanzas/cuaderno";
import { vidaUtilTributaria, VIDA_UTIL_TRIB } from "./ContabilidadDepreciacion";
import { tasaPPMSugerida } from "../../lib/contabilidad/tributario";
import { clasificarActivos, depreciacionEjercicio, DEPRECIAR_LEASING } from "../../lib/contabilidad/depreciacion";

// ─── Tabla vida útil tributaria SII (años) ────────────────────────────────────
// Resolución SII Exenta N° 43/2002 y circulares complementarias
// La tabla y el resolver viven en ContabilidadDepreciacion: el lookup directo
// por `a.tipo` fallaba con los valores reales de /machines ("EXCAVADORA",
// "CAMIONETA") y todo caía al default de 5 años.

// ─── Calcula depreciación anual de un activo ──────────────────────────────────
function calcDepContable(a) {
  if (a.depreciacionAnual) return parseFloat(a.depreciacionAnual) || 0;
  const v = parseFloat(a.valorCompra) || 0;
  const r = parseFloat(a.valorResidual) || 0;
  const y = parseFloat(a.vidaUtilAnios) || vidaUtilTributaria(a);
  return (!v || !y || r >= v) ? 0 : (v - r) / y;
}

// Usado solo por el impuesto diferido (metodología anual sin cambios por ahora;
// no considera fecha de compra ni corta al fin de la vida útil — revisar junto
// con la metodología de NIC 12). El F22 usa depreciacionEjercicio, mes a mes.
function calcDepTributaria(a) {
  const v    = parseFloat(a.valorCompra) || 0;
  const r    = parseFloat(a.valorResidual) || 0;
  const anos = vidaUtilTributaria(a);
  return v > r ? (v - r) / anos : 0;
}

// ─── Hook: carga activos desde /machines ─────────────────────────────────────
function useActivos() {
  const { empresaId } = useEmpresa();
  const [activos, setActivos] = useState([]);
  const [excluidas, setExcluidas] = useState({ leasing: 0, arrendada: 0, inactiva: 0, otra: 0 });

  const cargar = useCallback(async () => {
    if (!empresaId) return;
    try {
      const snap = await getDocs(collection(db, "empresas", empresaId, "machines"));
      // Solo bienes de la empresa (propia o crédito automotriz) y activos: las
      // arrendadas no son activo de la empresa y las de leasing ya rebajan sus
      // cuotas como gasto (ver DEPRECIAR_LEASING en lib/contabilidad/depreciacion).
      const { depreciables, excluidas: exc } = clasificarActivos(snap.docs.map(d => ({ id: d.id, ...d.data(), _doc: d })));
      setExcluidas(exc);
      setActivos(depreciables
        .map(({ _doc: d }) => ({
          id:                d.id,
          nombre:            d.data().name || "",
          tipo:              d.data().tipo || (() => {
            const type = (d.data().type || "").toLowerCase();
            const name = (d.data().name || "").toLowerCase();
            const esVehiculo = [
              "van","pickup","truck","bus","minibus","suv","sedan","hatchback",
              "station wagon","camioneta","furgon","furgón","minivan","jeep",
              "camión","camion","vehículo","vehiculo",
            ].some(k => type.includes(k)) ||
            [
              "camioneta","furgon","furgón","hilux","wingle","poer","maxus",
              "changan","jac","mitsubishi","toyota","ford","chevrolet",
              "nissan","hyundai","kia","volkswagen","peugeot partner",
              "great wall","gwm","jeep","suv",
            ].some(k => name.includes(k));
            return esVehiculo ? "vehiculo" : "maquinaria";
          })(),
          valorCompra:       d.data().valorCompra || "",
          vidaUtilAnios:     d.data().vidaUtilAnios || "",
          depreciacionAnual: d.data().depreciacionAnual || "",
          fechaCompra:       d.data().fechaCompra || "",
          valorResidual:     d.data().valorResidual || "",
        }))
      );
    } catch (e) { console.error("useActivos:", e); }
  }, [empresaId]);

  useEffect(() => { cargar(); }, [cargar]);
  return { activos, excluidas };
}

/** Nota corta con los equipos que no entran a la depreciación y por qué. */
function NotaExcluidas({ excluidas, sinFecha = 0 }) {
  if (!excluidas.leasing && !excluidas.arrendada && !excluidas.otra && !sinFecha) return null;
  return (
    <Nota etiqueta="Nota:" tono="grafito" className="mt-3">
      {excluidas.leasing > 0 && <>
        Se excluyen {excluidas.leasing} equipo{excluidas.leasing !== 1 ? "s" : ""} en leasing (sus cuotas ya son gasto
        {DEPRECIAR_LEASING ? "" : "; criterio por confirmar con el contador"}).{" "}
      </>}
      {excluidas.arrendada > 0 && <>Se excluyen {excluidas.arrendada} arrendado{excluidas.arrendada !== 1 ? "s" : ""} a terceros (no son de la empresa).{" "}</>}
      {excluidas.otra > 0 && <>{excluidas.otra} con propiedad no reconocida tampoco (revisar en Admin → Máquinas).{" "}</>}
      {sinFecha > 0 && <>{sinFecha} activo{sinFecha !== 1 ? "s" : ""} sin fecha de compra no se deprecia{sinFecha !== 1 ? "n" : ""}.</>}
    </Nota>
  );
}


// ─── Piezas de presentación ───────────────────────────────────────────────────
/** Resumen de un formulario: concepto ······· cifra, con una nota menor debajo. */
function ResumenTrib({ filas }) {
  return (
    <div className="grid gap-x-10 sm:grid-cols-2 mb-2">
      {filas.map((f, i) => (
        <div key={i}>
          <LineaGuia etiqueta={f.etiqueta}>
            <Cifra valor={f.valor} escala="pesos" vacio="$0" raya={f.raya || "ninguna"} />
          </LineaGuia>
          {f.nota && <p className="m-0 -mt-1 mb-1 text-right text-[13px] text-cuaderno-grafito">{f.nota}</p>}
        </div>
      ))}
    </div>
  );
}

/**
 * Renglón de un cuadro tributario.
 *  raya: "ninguna" | "total" (subtotal) | "doble" (resultado a pagar o recibir)
 *  color: color de la cifra ("auto" la deja en tinta y roja si es negativa)
 */
function FilaTrib({ label, valor, indent = false, raya = "ninguna", color = "auto", vacio = "0", separador = false }) {
  if (separador) return <tr aria-hidden="true"><td colSpan={2} className="h-2 p-0" /></tr>;
  const conRaya = raya !== "ninguna";
  return (
    <tr className={conRaya ? "" : "border-b border-cuaderno-renglon"}>
      <td className="py-1.5 pr-3 text-[17px]" style={{ paddingLeft: indent ? "18px" : "0" }}>
        {label}
      </td>
      <td className={`py-1.5 text-right text-[17px] ${conRaya ? "pt-2.5" : ""}`}>
        <Cifra valor={valor} escala="pesos" raya={raya} color={color} vacio={vacio} />
      </td>
    </tr>
  );
}

function SeccionTrib({ etiqueta, menor = false }) {
  return (
    <tr>
      <td colSpan={2} className={menor ? "pt-3 pb-0.5 text-[15px] text-cuaderno-grafito" : "pt-4 pb-1"}>
        {menor ? etiqueta : <Titulo as="h3" tamano="sm">{etiqueta}</Titulo>}
      </td>
    </tr>
  );
}

/** Marca escrita a la derecha del título de cada hoja (norma, fuente). */
function Marca({ children }) {
  return <span className="text-[15px] text-cuaderno-grafito">{children}</span>;
}

// ─── F29 — Declaración mensual IVA ───────────────────────────────────────────
function FormularioF29({ cuentas, saldosMap, periodoActivo, remanenteArrastrado = 0, utmActual = 0, utmAnterior = 0 }) {
  const data = useMemo(() => {
    // Buscar cuentas de IVA
    const ivaDebitoCuenta  = cuentas.find(c => c.tipo === "iva_debito");
    const ivaCreditoCuenta = cuentas.find(c => c.tipo === "iva_credito");
    const ppmCuenta        = cuentas.find(c => c.tipo === "ppm");

    const ivaDebito  = ivaDebitoCuenta  ? Math.abs((saldosMap[ivaDebitoCuenta.id]?.haber  || 0) - (saldosMap[ivaDebitoCuenta.id]?.debe   || 0)) : 0;
    const ivaCredito = ivaCreditoCuenta ? Math.abs((saldosMap[ivaCreditoCuenta.id]?.debe   || 0) - (saldosMap[ivaCreditoCuenta.id]?.haber  || 0)) : 0;
    const ppm        = ppmCuenta        ? Math.abs((saldosMap[ppmCuenta.id]?.debe          || 0) - (saldosMap[ppmCuenta.id]?.haber         || 0)) : 0;

    const ivaLine1   = ivaDebito;
    const ivaLine2   = ivaCredito;
    // Remanente de crédito fiscal arrastrado desde meses anteriores (Art. 27 DL 825).
    // El artículo obliga a expresarlo en UTM del mes de origen y reconvertirlo a
    // pesos con la UTM del mes de declaración. Con utmAnterior/utmActual se aplica
    // ese reajuste; si no se informan, queda a valor nominal y se advierte.
    const factorUTM = (utmActual > 0 && utmAnterior > 0) ? (utmActual / utmAnterior) : 1;
    const remanenteAnterior = Math.round(Math.max(0, remanenteArrastrado) * factorUTM);
    const remanenteReajustado = factorUTM !== 1;

    const creditoTotal = ivaLine2 + remanenteAnterior;
    const ivaLine3   = Math.max(0, ivaLine1 - creditoTotal); // IVA determinado a pagar
    const remanente  = Math.max(0, creditoTotal - ivaLine1); // remanente para el mes siguiente

    // El PPM NO se descuenta del IVA: son dos obligaciones distintas que se
    // declaran en el mismo formulario y se SUMAN en el total a enterar.
    // Antes se restaba, lo que subdeclaraba el pago mes a mes.
    const totalF29   = ivaLine3 + ppm;

    return { ivaDebito, ivaCredito, ivaLine3, remanente, remanenteAnterior, creditoTotal, ppm, totalF29, remanenteReajustado, factorUTM };
  }, [cuentas, saldosMap]);

  const [anno, mes] = periodoActivo.split("-");
  const mesLabel = MESES[parseInt(mes) - 1];

  return (
    <Hoja titulo="Formulario 29 — Declaración IVA" extra={<Marca>SII Chile</Marca>}>
      <p className="m-0 mb-3 text-[16px] text-cuaderno-grafito">Período {mesLabel} {anno}</p>

      <ResumenTrib filas={[
        { etiqueta: "IVA Débito",  valor: data.ivaDebito,  nota: "Ventas gravadas × 19%" },
        { etiqueta: "IVA Crédito", valor: data.ivaCredito, nota: "Compras con IVA" },
        { etiqueta: data.totalF29 > 0
            ? <Resaltado color="rosa">A Pagar</Resaltado>
            : <Resaltado color="menta">Sin pago</Resaltado>,
          valor: data.totalF29, nota: "Neto F29", raya: "doble" },
      ]} />

      {/* Detalle cuadro */}
      <div className="max-w-2xl">
        <table className="w-full border-collapse">
          <tbody>
            <SeccionTrib etiqueta="Cuadro de IVA" />
            <FilaTrib label="IVA Débito Fiscal (línea 1)" valor={data.ivaDebito} />
            <FilaTrib label="IVA Crédito Fiscal del mes (línea 20)" valor={data.ivaCredito} indent />
            {data.remanenteAnterior > 0 && (
              <FilaTrib label="Remanente crédito fiscal mes anterior (línea 77)" valor={data.remanenteAnterior} indent />
            )}
            <FilaTrib label="Crédito fiscal total" valor={data.creditoTotal} indent raya="total" />
            <FilaTrib separador />
            <FilaTrib label="IVA determinado" valor={data.ivaLine3} raya="total" />
            {data.remanente > 0 && <FilaTrib label="Remanente para el próximo mes (línea 504)" valor={data.remanente} color="verde" />}
            <FilaTrib separador />
            <FilaTrib label="PPM del período (línea 62)" valor={data.ppm} indent />
            <FilaTrib separador />
            <FilaTrib label="Total a pagar F29 (IVA + PPM)" valor={data.totalF29} raya="doble" />
          </tbody>
        </table>

        {/* Advertencia */}
        <Nota etiqueta="Ojo:" tono="grafito" className="mt-4">
          Calculado sobre los asientos del período. El remanente arrastrado se toma a valor
          nominal: el Art. 27 del DL 825 exige reajustarlo por la variación de la UTM, así que
          contrástalo con el certificado del SII antes de presentar.
        </Nota>
      </div>
    </Hoja>
  );
}

// ─── PPM — Pagos Provisionales Mensuales ─────────────────────────────────────
function ModuloPPM({ cuentas, saldosMap, asientos, periodoActivo }) {
  // La tasa sale de la configuración tributaria de la empresa, la misma que usa
  // el Flujo Mensual (antes era una variable de la sesión que se perdía al
  // recargar y partía en 1,5%). En 14 A se edita aquí y queda guardada; en Pro
  // Pyme la fija la ley según los ingresos del año anterior.
  const { configTributaria, guardarConfigTributaria } = useContabilidad();
  const anioPeriodo = parseInt(String(periodoActivo).slice(0, 4), 10);
  const es14A = configTributaria.regimen === "14A";
  const tasaPPM = Math.round(tasaPPMSugerida(configTributaria, anioPeriodo) * 100000) / 1000;
  const setTasaPPM = (v) => { if (es14A) guardarConfigTributaria({ tasaPPM14A: v }).catch(() => {}); };

  const data = useMemo(() => {
    const ingresoCuentas = cuentas.filter(c => c.tipo === "ingreso");
    const totalIngresos  = ingresoCuentas.reduce((s, c) => {
      const sd = saldosMap[c.id] || { debe: 0, haber: 0 };
      return s + (sd.haber - sd.debe); // sin Math.abs: las notas de crédito deben restar
    }, 0);

    const ppmObligatorio = totalIngresos * (tasaPPM / 100);

    const ppmCuenta   = cuentas.find(c => c.tipo === "ppm");
    const ppmRegistrado = ppmCuenta
      ? Math.abs((saldosMap[ppmCuenta.id]?.debe || 0) - (saldosMap[ppmCuenta.id]?.haber || 0))
      : 0;

    const diferencia = ppmObligatorio - ppmRegistrado;

    return { totalIngresos, ppmObligatorio, ppmRegistrado, diferencia, tasaPPM };
  }, [cuentas, saldosMap, tasaPPM]);

  return (
    <Hoja titulo="PPM — Pagos Provisionales Mensuales" extra={<Marca>Art. 84 LIR</Marca>}>
      <p className="m-0 mb-3 text-[16px] text-cuaderno-grafito">Art. 84 LIR — Determinación mensual</p>

      <div className="max-w-2xl space-y-4">
        {/* Tasa configurable */}
        {es14A ? (
          <Campo etiqueta="Tasa PPM aplicable (%)" ayuda="La del F22 del año anterior. Se guarda para toda la empresa (también la usa el Flujo Mensual)."
            type="number" value={tasaPPM} onChange={e => setTasaPPM(parseFloat(e.target.value) || 0)}
            step="0.01" min="0" max="100" className="w-64" />
        ) : (
          <p className="m-0 text-[16px] text-cuaderno-grafito">
            Tasa PPM {String(tasaPPM).replace(".", ",")}%: la fija la ley para el régimen elegido en el Flujo Mensual{configTributaria.regimen ? "" : " (régimen sin definir)"}.
          </p>
        )}

        {/* Cuadro */}
        <table className="w-full border-collapse">
          <tbody>
            <FilaTrib label="Ingresos brutos del período" valor={data.totalIngresos} />
            <FilaTrib label={`Tasa PPM (${tasaPPM}%)`} valor={data.ppmObligatorio} raya="total" />
            <FilaTrib separador />
            <FilaTrib label="PPM registrado en asientos" valor={data.ppmRegistrado} indent />
            <FilaTrib label={data.diferencia > 0
                ? <Resaltado color="rosa">PPM pendiente de registrar</Resaltado>
                : <Resaltado color="menta">PPM en exceso</Resaltado>}
              valor={Math.abs(data.diferencia)} raya="doble" />
          </tbody>
        </table>

        {data.diferencia > 0.01 && (
          <Nota etiqueta="Ojo:">
            Falta registrar el asiento de PPM por <Cifra valor={data.diferencia} escala="pesos" color="heredar" />. Ir al Libro Diario y crear un asiento Debe: PPM / Haber: Banco.
          </Nota>
        )}
      </div>
    </Hoja>
  );
}

// ─── F22 — Impuesto Anual a la Renta ─────────────────────────────────────────
function FormularioF22({ cuentas, saldosMap, tasaImpuesto = 0.27, anio, mesesTranscurridos = 12, depreciacionContabilizada = 0, perdidaArrastre = 0 }) {
  const { activos, excluidas } = useActivos();

  const data = useMemo(() => {
    // Sin Math.abs: una cuenta de ingreso con saldo deudor (mes con más notas de
    // crédito que ventas) debe restar, no sumar. El valor absoluto convertía esa
    // anomalía en ingreso positivo y engordaba la base imponible en silencio.
    const get = (tipos, porHaber = false) => cuentas
      .filter(c => tipos.includes(c.tipo) && c.activa !== false)
      .reduce((s, c) => {
        const sd = saldosMap[c.id] || { debe: 0, haber: 0 };
        return s + (porHaber ? (sd.haber - sd.debe) : (sd.debe - sd.haber));
      }, 0);

    const ingresosBrutos     = get(["ingreso"], true);
    const costosYGastos      = get(["costo", "gasto_adm", "gasto_fin", "otro_resultado"]);
    const utilidadFinanciera = ingresosBrutos - costosYGastos;

    // Depreciación del ejercicio hasta el mes de corte, mes a mes desde la
    // fecha de compra (desde el mes siguiente, y solo hasta completar la vida
    // útil). Antes era la cuota anual × meses/12 para todo activo, aunque se
    // hubiera comprado este año o ya estuviera totalmente depreciado.
    // La teórica contable usa la misma vida útil que el asiento mensual
    // (vida propia o tabla SII) para poder compararla con lo contabilizado.
    let depTeorica = 0, depTribPer = 0, sinFecha = 0;
    for (const a of activos) {
      const t = depreciacionEjercicio(a, vidaUtilTributaria(a), anio, mesesTranscurridos);
      if (t.sinFecha) { sinFecha++; continue; }
      depTribPer += t.monto;
      depTeorica += depreciacionEjercicio(a, parseFloat(a.vidaUtilAnios) || vidaUtilTributaria(a), anio, mesesTranscurridos).monto;
    }

    // El agregado a la RLI solo tiene sentido sobre la depreciación que
    // EFECTIVAMENTE se rebajó como gasto en los asientos. Antes se sumaba la
    // cifra teórica del módulo de Activos aunque nunca se hubiera contabilizado,
    // lo que inflaba la base imponible. Ahora se toma la cuenta contable y la
    // teórica solo se usa como referencia.
    const depContPer    = depreciacionContabilizada;

    const rliAntesPerdida = utilidadFinanciera + depContPer - depTribPer;
    // Pérdida tributaria de años anteriores (art. 31 N°3, sin tope vigente):
    // la misma que se ingresa en el Flujo Mensual del año.
    const perdida       = Math.abs(Number(perdidaArrastre) || 0);
    const rli           = rliAntesPerdida - perdida;
    const tasaPrimCat   = tasaImpuesto;
    const impuesto1Cat  = Math.max(0, rli * tasaPrimCat);
    const ppmAcumulado  = get(["ppm"]);
    const saldoF22      = Math.max(0, impuesto1Cat - ppmAcumulado);
    const devolucion    = Math.max(0, ppmAcumulado - impuesto1Cat);

    return { ingresosBrutos, costosYGastos, utilidadFinanciera,
             depreciacionContable: depContPer, depreciacionTrib: depTribPer,
             depTeorica, difTemp: depContPer - depTribPer, rli, impuesto1Cat, perdida, rliAntesPerdida,
             ppmAcumulado, saldoF22, devolucion, tasaPrimCat, mesesTranscurridos, sinFecha };
  }, [cuentas, saldosMap, activos, tasaImpuesto, anio, mesesTranscurridos, depreciacionContabilizada, perdidaArrastre]);

  return (
    <Hoja titulo="Formulario 22 — Declaración Anual Renta" extra={<Marca>Art. 29–33 LIR</Marca>}>
      <p className="m-0 mb-3 text-[16px] text-cuaderno-grafito">Determinación Renta Líquida Imponible</p>

      <ResumenTrib filas={[
        { etiqueta: "Ingresos Brutos",      valor: data.ingresosBrutos },
        { etiqueta: "Renta Liq. Imponible", valor: data.rli },
        { etiqueta: "Impuesto 1ª Cat.",     valor: data.impuesto1Cat },
        { etiqueta: data.saldoF22 > 0
            ? <Resaltado color="rosa">A Pagar F22</Resaltado>
            : <Resaltado color="menta">Devolución</Resaltado>,
          valor: data.saldoF22 || data.devolucion, raya: "doble" },
      ]} />

      <div className="max-w-2xl">
        <table className="w-full border-collapse">
          <tbody>
            <SeccionTrib etiqueta="Determinación RLI" />
            <FilaTrib label="Resultado financiero del período" valor={data.utilidadFinanciera} />
            <SeccionTrib etiqueta="Agregados y Deducciones" menor />
            <FilaTrib label="Depreciación contabilizada (agregar)" valor={data.depreciacionContable} indent />
            {Math.abs(data.depTeorica - data.depreciacionContable) > 1000 && (
              <tr><td colSpan={2} className="py-2 pl-[18px]">
                <Nota etiqueta="Ojo:">
                  La depreciación teórica de la flota para este tramo es <Cifra valor={data.depTeorica} escala="pesos" color="heredar" vacio="0" />, pero
                  en los asientos hay <Cifra valor={data.depreciacionContable} escala="pesos" color="heredar" vacio="0" />. Genera el asiento de depreciación
                  antes de usar esta RLI.
                </Nota>
              </td></tr>
            )}
            <FilaTrib label="Depreciación tributaria (deducir)" valor={data.depreciacionTrib} indent />
            <FilaTrib label="Diferencia temporaria neta" valor={data.difTemp} indent />
            {data.perdida > 0 && <>
              <FilaTrib label="Renta antes de pérdidas anteriores" valor={data.rliAntesPerdida} />
              <FilaTrib label="Pérdida tributaria de años anteriores (art. 31 N°3)" valor={-data.perdida} indent />
            </>}
            <FilaTrib separador />
            <FilaTrib label={data.rli < 0 ? "Pérdida tributaria que pasa al año siguiente" : "Renta Líquida Imponible"} valor={data.rli} raya="total" />
            <FilaTrib separador />
            <FilaTrib label={`Impuesto 1ª Categoría (${(data.tasaPrimCat*100).toFixed(1).replace(".", ",")}%)`} valor={data.impuesto1Cat} />
            <FilaTrib label="Menos: PPM acumulado" valor={data.ppmAcumulado} indent />
            <FilaTrib separador />
            {data.saldoF22 > 0
              ? <FilaTrib label={<Resaltado color="rosa">Impuesto a pagar F22</Resaltado>} valor={data.saldoF22} raya="doble" />
              : <FilaTrib label={<Resaltado color="menta">Devolución esperada</Resaltado>} valor={data.devolucion} raya="doble" />
            }
          </tbody>
        </table>
        <NotaExcluidas excluidas={excluidas} sinFecha={data.sinFecha} />
      </div>
    </Hoja>
  );
}

// ─── Diferencias temporarias e impuesto diferido ─────────────────────────────
function ImpuestoDiferido({ cuentas, saldosMap, tasaImpuesto = 0.27 }) {
  const { activos, excluidas } = useActivos();

  // Dep. anual total de la flota (contable y tributaria)
  const { depContableAnual, depTributariaAnual, detalle } = useMemo(() => {
    let depC = 0, depT = 0;
    const det = activos
      .filter(a => parseFloat(a.valorCompra) > 0)
      .map(a => {
        const c = calcDepContable(a);
        const t = calcDepTributaria(a);
        depC += c;
        depT += t;
        return {
          nombre: a.nombre || a.id,
          tipo:   a.tipo,
          vc:     parseFloat(a.valorCompra) || 0,
          depC:   c,
          depT:   t,
          dif:    c - t,
          vidaC:  parseFloat(a.vidaUtilAnios) || 0,
          vidaT:  VIDA_UTIL_TRIB[a.tipo] || 5,
        };
      });
    return { depContableAnual: depC, depTributariaAnual: depT, detalle: det };
  }, [activos]);

  const difTemp        = depContableAnual - depTributariaAnual;
  const activoDiferido = difTemp < 0 ? Math.abs(difTemp) * tasaImpuesto : 0;
  const pasivoDiferido = difTemp > 0 ? difTemp * tasaImpuesto : 0;

  const sinActivos = activos.length === 0;
  const sinValores = activos.length > 0 && depContableAnual === 0 && depTributariaAnual === 0;

  const tasaTexto = (tasaImpuesto*100).toFixed(1).replace(".", ",");
  // Diferencia por activo: contable sobre tributaria genera pasivo (rosa);
  // tributaria sobre contable, activo (menta). Se escribe en valor absoluto.
  const MarcaDif = ({ dif }) => dif > 0
    ? <span className="ml-1.5 text-[13px] text-cuaderno-roja">pasivo</span>
    : dif < 0 ? <span className="ml-1.5 text-[13px] text-cuaderno-verde">activo</span> : null;

  return (
    <Hoja titulo="Impuesto Diferido — NIC 12"
      extra={<Marca>{activos.length} activo{activos.length !== 1 ? "s" : ""}</Marca>}>
      <p className="m-0 mb-3 text-[16px] text-cuaderno-grafito">Diferencias temporarias imponibles y deducibles</p>

      {/* Aviso sin activos registrados */}
      {sinActivos && (
        <div className="py-10 text-center space-y-2">
          <p className="m-0 font-ligada font-light text-[22px] leading-[1.6]">No hay activos registrados en el módulo de Activos Fijos.</p>
          <p className="m-0 text-[16px] text-cuaderno-grafito">Agrega activos con valor de compra y vida útil para calcular diferencias temporarias.</p>
        </div>
      )}

      {/* Aviso activos sin valor */}
      {sinValores && (
        <Nota etiqueta="Ojo:">
          Hay {activos.length} activo{activos.length !== 1 ? "s" : ""} registrado{activos.length !== 1 ? "s" : ""}, pero ninguno tiene valor de compra ingresado. Edítalos en el módulo de Activos Fijos para calcular las diferencias.
        </Nota>
      )}

      {/* Tabla resumen */}
      {!sinActivos && !sinValores && (
        <div className="space-y-6">
          <div className="max-w-2xl">
            <table className="w-full border-collapse">
              <tbody>
                <FilaTrib label="Depreciación contable anual (flota)" valor={depContableAnual} />
                <FilaTrib label={`Depreciación tributaria anual (SII)`} valor={depTributariaAnual} indent />
                <FilaTrib separador />
                <FilaTrib label="Diferencia temporaria neta" valor={Math.abs(difTemp)} raya="total" />
                <FilaTrib separador />
                {activoDiferido > 0 && (
                  <FilaTrib label={<Resaltado color="menta">Activo por impuesto diferido ({tasaTexto}%)</Resaltado>} valor={activoDiferido} raya="doble" />
                )}
                {pasivoDiferido > 0 && (
                  <FilaTrib label={<Resaltado color="rosa">Pasivo por impuesto diferido ({tasaTexto}%)</Resaltado>} valor={pasivoDiferido} raya="doble" />
                )}
                {difTemp === 0 && (
                  <FilaTrib label="Sin diferencias temporarias" valor={0} color="grafito" />
                )}
              </tbody>
            </table>
          </div>

          {/* Detalle por activo */}
          {detalle.length > 0 && (
            <div>
              <Titulo as="h3" tamano="sm">Detalle por activo</Titulo>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="shadow-[inset_0_-1.5px_0_rgb(var(--cuaderno-tinta))]">
                      <th className="font-normal text-[15px] text-left text-cuaderno-grafito px-2 py-2">Activo</th>
                      <th className="font-normal text-[15px] text-center text-cuaderno-grafito px-2 py-2 whitespace-nowrap">V. Útil Cont.</th>
                      <th className="font-normal text-[15px] text-center text-cuaderno-grafito px-2 py-2 whitespace-nowrap">V. Útil Trib. SII</th>
                      <th className="font-normal text-[15px] text-right text-cuaderno-grafito px-2 py-2 whitespace-nowrap">Dep. Contable</th>
                      <th className="font-normal text-[15px] text-right text-cuaderno-grafito px-2 py-2 whitespace-nowrap">Dep. Tributaria</th>
                      <th className="font-normal text-[15px] text-right text-cuaderno-grafito px-2 py-2">Diferencia</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detalle.map((d, i) => (
                      <tr key={i} className="border-b border-cuaderno-renglon">
                        <td className="px-2 py-1.5 text-[17px] max-w-[220px] truncate">{d.nombre}</td>
                        <td className="px-2 py-1.5 text-[16px] text-center text-cuaderno-grafito">{d.vidaC > 0 ? `${d.vidaC} años` : "—"}</td>
                        <td className="px-2 py-1.5 text-[16px] text-center text-cuaderno-grafito">{d.vidaT} años</td>
                        <td className="px-2 py-1.5 text-[16px] text-right"><Cifra valor={d.depC} escala="pesos" vacio="0" /></td>
                        <td className="px-2 py-1.5 text-[16px] text-right"><Cifra valor={d.depT} escala="pesos" vacio="0" /></td>
                        <td className="px-2 py-1.5 text-[16px] text-right whitespace-nowrap">
                          {d.dif !== 0
                            ? <><Cifra valor={Math.abs(d.dif)} escala="pesos" /><MarcaDif dif={d.dif} /></>
                            : <span className="text-cuaderno-grafito">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td className="px-2 pt-3 pb-2 text-[17px]" colSpan={3}>Total</td>
                      <td className="px-2 pt-3 pb-2 text-[16px] text-right"><Cifra valor={depContableAnual} escala="pesos" raya="total" vacio="0" /></td>
                      <td className="px-2 pt-3 pb-2 text-[16px] text-right"><Cifra valor={depTributariaAnual} escala="pesos" raya="total" vacio="0" /></td>
                      <td className="px-2 pt-3 pb-2 text-[16px] text-right whitespace-nowrap">
                        {difTemp !== 0
                          ? <><Cifra valor={Math.abs(difTemp)} escala="pesos" raya="doble" /><MarcaDif dif={difTemp} /></>
                          : <span className="text-cuaderno-grafito">—</span>}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <Nota etiqueta="Nota:" tono="grafito" className="mt-3">
                Vida útil tributaria según tabla SII: Maquinaria 10 años · Vehículo 7 años · Herramienta 3 años · Otro 5 años.
                Las diferencias generan {pasivoDiferido > 0 ? "un pasivo" : "un activo"} por impuesto diferido bajo NIC 12.
              </Nota>
              <NotaExcluidas excluidas={excluidas} />
            </div>
          )}
        </div>
      )}
    </Hoja>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function ContabilidadTributario() {
  const { cuentas, asientos, saldosPeriodo, saldosAcumulados, saldosAnio,
          periodoActivo, tasaPrimeraCategoria } = useContabilidad();

  // El IVA y el PPM son mensuales; la RLI del F22 es del ejercicio.
  const saldosMes  = saldosPeriodo();
  const saldosDelAnio = saldosAnio();
  const [vistaActiva, setVistaActiva] = useState("f29");

  // Remanente de crédito fiscal traído de meses anteriores: se determina con
  // los saldos acumulados hasta el mes previo al activo.
  const remanenteArrastrado = useMemo(() => {
    const [a, m] = periodoActivo.split("-").map(Number);
    const prev = new Date(a, m - 2, 1); // mes anterior
    const periodoPrev = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`;
    const acumPrev = saldosAcumulados(periodoPrev);
    const cCred = cuentas.find(c => c.tipo === "iva_credito");
    const cDeb  = cuentas.find(c => c.tipo === "iva_debito");
    const cred = cCred ? (acumPrev[cCred.id]?.debe  || 0) - (acumPrev[cCred.id]?.haber || 0) : 0;
    const deb  = cDeb  ? (acumPrev[cDeb.id]?.haber || 0) - (acumPrev[cDeb.id]?.debe  || 0) : 0;
    return Math.max(0, cred - deb);
  }, [cuentas, periodoActivo, saldosAcumulados]);

  // Pérdida tributaria de años anteriores: la del Flujo Mensual del año, para
  // que el F22 y el Flujo Mensual calculen el impuesto con la misma base.
  const { empresaId } = useEmpresa();
  const anioPeriodo = periodoActivo.slice(0, 4);
  const [perdidaArrastre, setPerdidaArrastre] = useState(0);
  useEffect(() => {
    if (!empresaId) return;
    let vivo = true;
    getDoc(doc(db, "empresas", empresaId, "flujo_mensual", anioPeriodo))
      .then(s => { if (vivo) setPerdidaArrastre(s.exists() ? Math.abs(Number(s.data().perdidaArrastre) || 0) : 0); })
      .catch(() => { if (vivo) setPerdidaArrastre(0); });
    return () => { vivo = false; };
  }, [empresaId, anioPeriodo]);

  // Meses transcurridos del ejercicio hasta el corte
  const mesesTranscurridos = parseInt(periodoActivo.split("-")[1], 10) || 12;

  // Depreciación efectivamente contabilizada en el ejercicio (cuenta de gasto).
  // Es la única que corresponde agregar de vuelta a la RLI.
  const depreciacionContabilizada = useMemo(() => {
    const c = cuentas.find(x => x.codigo === "6-03-001")
           || cuentas.find(x => /depreciaci/i.test(x.nombre) && x.tipo === "otro_resultado");
    if (!c) return 0;
    const s = saldosDelAnio[c.id] || { debe: 0, haber: 0 };
    return s.debe - s.haber;
  }, [cuentas, saldosDelAnio]);

  const VISTAS = [
    { id: "f29",   label: "F29 — IVA"         },
    { id: "ppm",   label: "PPM"               },
    { id: "f22",   label: "F22 — Renta"       },
    { id: "dift",  label: "Imp. Diferido"     },
  ];

  return (
    <div className="cuaderno px-8 pt-5 pb-10 space-y-5">
      <FechaHoja />

      {/* Header */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Titulo>Módulo Tributario</Titulo>
          <p className="m-0 text-[17px] text-cuaderno-grafito">F29 · PPM · F22 · Impuesto diferido</p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <PeriodoSelector />
        </div>
      </header>

      {/* Aviso SII */}
      <Nota etiqueta="Ojo:">
        Los cálculos son aproximaciones basadas en los asientos registrados. Siempre valida con tu contador o directamente en el portal SII antes de presentar declaraciones.
      </Nota>

      {/* Tabs */}
      <Pestanas opciones={VISTAS} valor={vistaActiva} onCambiar={setVistaActiva} />

      {vistaActiva === "f29"  && <FormularioF29 cuentas={cuentas} saldosMap={saldosMes} periodoActivo={periodoActivo} remanenteArrastrado={remanenteArrastrado} />}
      {vistaActiva === "ppm"  && <ModuloPPM cuentas={cuentas} saldosMap={saldosMes} asientos={asientos} periodoActivo={periodoActivo} />}
      {vistaActiva === "f22"  && <FormularioF22 cuentas={cuentas} saldosMap={saldosDelAnio} tasaImpuesto={tasaPrimeraCategoria} anio={parseInt(anioPeriodo, 10)} mesesTranscurridos={mesesTranscurridos} depreciacionContabilizada={depreciacionContabilizada} perdidaArrastre={perdidaArrastre} />}
      {vistaActiva === "dift" && <ImpuestoDiferido cuentas={cuentas} saldosMap={saldosDelAnio} tasaImpuesto={tasaPrimeraCategoria} />}
    </div>
  );
}
