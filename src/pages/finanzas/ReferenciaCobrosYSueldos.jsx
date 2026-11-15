import React, { useEffect, useMemo, useState } from "react";
import { cargarCobrosRental, cargarEstadoPagoIngresos, cargarPagosRRHH } from "../../lib/finanzas/referenciasDatos";
import { agruparPorSemana, facturableOT, resumirSueldos, sumarMeses, cobrosDeCuenta } from "../../lib/finanzas/referencias";
import { hoyISO, mesActualISO } from "../../lib/fechas";
import { Hoja, Cifra, Boton, Resaltado, Titulo, LineaGuia, casoTitulo } from "./cuaderno";

/*
 * Por cobrar (Rental y estado de pago al mandante) y sueldos de RRHH, como
 * REFERENCIA bajo el flujo de caja, igual que ReferenciaSubcontratos. No
 * escribe nada: por decisión del usuario el flujo se anota a mano; esto solo
 * muestra lo que dicen los otros módulos para tenerlo a la vista.
 *
 * Con una obra elegida en el selector, Oficina Técnica y RRHH se filtran por
 * esa obra. Rental no se separa por obra, así que se muestra siempre (como
 * las cuentas del flujo sin obra).
 */
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const nombreMes = (mes) => `${MESES[Number(mes.slice(5, 7)) - 1]} ${mes.slice(0, 4)}`;
const fechaCorta = (iso) => iso ? iso.split("-").reverse().join("/") : "sin fecha";
const CONCEPTO = { liquido: "Líquido a pagar", previred: "Previred", impuestoUnico: "Impuesto único (F29)" };

function Encabezado({ children, derecha }) {
  return <th className={`px-2 py-1.5 font-normal text-[14px] text-cuaderno-grafito ${derecha ? "text-right" : "text-left"}`}>{children}</th>;
}

export default function ReferenciaCobrosYSueldos({ empresaId, ingresos, payments, weekColumns, proyectoId, proyectos = [], onAbrirCuenta }) {
  const [abierto, setAbierto] = useState(false);
  const [datos, setDatos] = useState(null);

  const mesActual = mesActualISO();
  const mesesRRHH = useMemo(() => [sumarMeses(mesActual, -1), mesActual, sumarMeses(mesActual, 1)], [mesActual]);

  useEffect(() => {
    if (!abierto || !empresaId || datos) return;
    let vivo = true;
    Promise.all([
      cargarCobrosRental(empresaId).catch(() => []),
      cargarEstadoPagoIngresos(empresaId).catch(() => []),
      cargarPagosRRHH(empresaId, mesesRRHH).catch(() => ({ filas: [], nominas: [] })),
    ]).then(([cobros, epi, rrhh]) => { if (vivo) setDatos({ cobros, epi, rrhh }); });
    return () => { vivo = false; };
  }, [abierto, empresaId, datos, mesesRRHH]);

  const obra = proyectoId && proyectoId !== "todos" ? proyectoId : null;
  const nombreObra = (id) => { const p = proyectos.find(x => x.id === id); return p ? (p.name || p.nombre) : "Sin obra"; };
  const semanaDe = useMemo(() => new Map(weekColumns.map(w => [w.key, w])), [weekColumns]);

  const vista = useMemo(() => {
    if (!datos) return null;
    const hoy = hoyISO();
    const grupos = agruparPorSemana(datos.cobros, weekColumns.map(w => w.key), hoy);
    const facturable = facturableOT(datos.epi, { desde: sumarMeses(mesActual, -2), hasta: mesActual, projectId: obra });
    const sueldos = resumirSueldos(datos.rrhh.filas, datos.rrhh.nominas, mesesRRHH, { projectId: obra });
    return { grupos, facturable, sueldos };
  }, [datos, weekColumns, mesActual, mesesRRHH, obra]);

  // Lo anotado en INGRESOS del flujo en una semana, para comparar con lo esperado
  const ingresosSemana = (key) => ingresos.reduce((s, c) => s + (payments[`${c.id}-${key}`] || 0), 0);

  const filaCobro = (c) => {
    const cuenta = ingresos.find(x => cobrosDeCuenta([c], x).length);
    return (
      <span key={c.id} className="block">
        {cuenta ? (
          <button type="button" onClick={() => onAbrirCuenta(cuenta)} className="underline decoration-cuaderno-columna underline-offset-[3px]">{casoTitulo(c.cliente)}</button>
        ) : casoTitulo(c.cliente) || "Cliente sin nombre"}
        <span className="text-[14px] text-cuaderno-grafito">
          {" "}· EEPP {c.numero || "s/n"}{c.factura ? ` · factura ${c.factura}` : ""} · {c.estimada ? "estimado " : "vence "}{fechaCorta(c.fecha)}{c.estado === "abonado" ? " · abonado" : ""}
        </span>
        {" "}<Cifra valor={c.saldo} escala="pesos" color="tinta" className="text-[14px]" />
      </span>
    );
  };

  const semanasConCobro = vista ? weekColumns.filter(w => vista.grupos.porSemana[w.key]) : [];
  const otrosGrupos = vista ? [
    { k: "vencidos", etiqueta: "Vencidos, sin cobrar", g: vista.grupos.vencidos, color: "rosa" },
    { k: "posteriores", etiqueta: "Después de las semanas visibles", g: vista.grupos.posteriores },
    { k: "sinFecha", etiqueta: "Sin fecha", g: vista.grupos.sinFecha },
  ].filter(x => x.g.items.length) : [];

  return (
    <Hoja titulo="Por cobrar y sueldos (referencia)"
      extra={<Boton variante="texto" onClick={() => setAbierto(a => !a)}>{abierto ? "Ocultar" : "Ver"}</Boton>}>
      {!abierto ? (
        <p className="m-0 text-[16px] text-cuaderno-grafito">
          Referencia desde Rental, Oficina Técnica y RRHH: estados de pago por cobrar, lo facturable a mandantes y los sueldos, Previred e impuesto único por pagar. No modifica el flujo.
        </p>
      ) : !vista ? (
        <p className="m-0 text-[16px] text-cuaderno-grafito">Buscando cobros y sueldos…</p>
      ) : (
        <div className="space-y-5">
          {/* ── Por cobrar: Rental ───────────────────────────────────────── */}
          <section>
            <Titulo as="h3" tamano="sm">Estados de pago de Rental por cobrar</Titulo>
            {!semanasConCobro.length && !otrosGrupos.length ? (
              <p className="m-0 text-[16px] text-cuaderno-grafito">No hay estados de pago de Rental con saldo por cobrar.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-[16px]">
                  <thead>
                    <tr className="shadow-[inset_0_-1.5px_0_rgb(var(--cuaderno-tinta))]">
                      <Encabezado>Semana</Encabezado>
                      <Encabezado>Cliente y estado de pago</Encabezado>
                      <Encabezado derecha>Por cobrar</Encabezado>
                      <Encabezado derecha>Ingresos anotados</Encabezado>
                    </tr>
                  </thead>
                  <tbody>
                    {semanasConCobro.map(w => {
                      const g = vista.grupos.porSemana[w.key];
                      const anotado = ingresosSemana(w.key);
                      return (
                        <tr key={w.key} className={`border-b border-cuaderno-renglon align-top ${w.isCurrentWeek ? "bg-cuaderno-durazno/40" : ""}`}>
                          <td className="px-2 py-1.5 whitespace-nowrap">
                            <span className="block">{w.label}</span>
                            <span className="text-[13px] text-cuaderno-grafito">{w.isCurrentWeek ? "esta semana" : w.dateRange}</span>
                          </td>
                          <td className="px-2 py-1.5">{g.items.map(filaCobro)}</td>
                          <td className="px-2 py-1.5 text-right"><Cifra valor={g.total} escala="pesos" color="tinta" /></td>
                          <td className="px-2 py-1.5 text-right">
                            {anotado ? <Cifra valor={anotado} escala="pesos" color="tinta" /> : <Resaltado color="durazno">nada anotado</Resaltado>}
                          </td>
                        </tr>
                      );
                    })}
                    {otrosGrupos.map(({ k, etiqueta, g, color }) => (
                      <tr key={k} className="border-b border-cuaderno-renglon align-top">
                        <td className="px-2 py-1.5">{color ? <Resaltado color={color}>{etiqueta}</Resaltado> : etiqueta}</td>
                        <td className="px-2 py-1.5">{g.items.slice(0, 6).map(filaCobro)}{g.items.length > 6 && <span className="block text-[14px] text-cuaderno-grafito">y {g.items.length - 6} más</span>}</td>
                        <td className="px-2 py-1.5 text-right"><Cifra valor={g.total} escala="pesos" color="tinta" /></td>
                        <td />
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="m-0 mt-2 text-[14px] text-cuaderno-grafito">
              Saldo en pesos (los EEPP en UF ya guardan sus pesos), por vencimiento de la factura o del EEPP; si no tiene, emisión más los días de pago del cliente ("estimado"). Rental no se separa por obra.
            </p>
          </section>

          {/* ── Por cobrar: Oficina Técnica ──────────────────────────────── */}
          <section>
            <Titulo as="h3" tamano="sm">Facturable a mandantes (Oficina Técnica)</Titulo>
            {!vista.facturable.length ? (
              <p className="m-0 text-[16px] text-cuaderno-grafito">Sin estados de pago al mandante en {nombreMes(sumarMeses(mesActual, -2))} a {nombreMes(mesActual)}{obra ? " para esta obra" : ""}.</p>
            ) : (
              <>
                {vista.facturable.map(d => (
                  <LineaGuia key={d.id} etiqueta={`${casoTitulo(nombreObra(d.projectId))}, ${nombreMes(d.mes)}`} className="text-[17px]">
                    <Cifra valor={d.total} escala="pesos" color="tinta" />
                  </LineaGuia>
                ))}
                <p className="m-0 mt-1 text-[14px] text-cuaderno-grafito">
                  Estados de pago + retenciones + reajustes + multas del mes, como en Oficina Técnica → Estado de pago. No tiene fecha de cobro ni estado: se muestra por mes, sin semana.
                </p>
              </>
            )}
          </section>

          {/* ── Por pagar: RRHH ──────────────────────────────────────────── */}
          <section>
            <Titulo as="h3" tamano="sm">Sueldos y cotizaciones de RRHH</Titulo>
            <div className="grid gap-4 md:grid-cols-3">
              {vista.sueldos.map(m => (
                <div key={m.mes}>
                  <p className="m-0 text-[17px] underline decoration-cuaderno-azul underline-offset-[5px]">Remuneraciones de {nombreMes(m.mes)}</p>
                  {!m.liquidaciones && !m.estimadoCon ? (
                    <p className="m-0 text-[15px] text-cuaderno-grafito">Sin liquidaciones.</p>
                  ) : (
                    <>
                      <p className="m-0 text-[14px] text-cuaderno-grafito">
                        {m.estimadoCon ? `Aún sin liquidaciones: estimado con ${nombreMes(m.estimadoCon)}.`
                          : `${m.liquidaciones} liquidaci${m.liquidaciones === 1 ? "ón" : "ones"}${m.borradores ? `, ${m.borradores} en borrador` : ""}.`}
                      </p>
                      {m.pagos.map(p => {
                        const w = semanaDe.get(p.semana);
                        return (
                          <div key={p.concepto}>
                            <LineaGuia etiqueta={CONCEPTO[p.concepto]} className="text-[16px]">
                              {p.monto ? <Cifra valor={-p.monto} escala="pesos" /> : <span className="text-cuaderno-grafito">—</span>}
                            </LineaGuia>
                            <p className="m-0 -mt-1.5 text-right text-[13px] text-cuaderno-grafito">
                              {p.concepto === "liquido" && m.liquidoPagado > 0 && !m.liquidoPendiente ? "pagado por nómina" : `${fechaCorta(p.fecha)}${w ? ` · ${w.label}` : ""}`}
                            </p>
                          </div>
                        );
                      })}
                      {m.liquidoPagado > 0 && (
                        <p className="m-0 text-[14px] text-cuaderno-grafito">Ya pagado por nómina: <Cifra valor={m.liquidoPagado} escala="pesos" color="grafito" /></p>
                      )}
                      {m.anticipos > 0 && (
                        <p className="m-0 text-[14px] text-cuaderno-grafito">Anticipos (ya descontados del líquido): <Cifra valor={m.anticipos} escala="pesos" color="grafito" /></p>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
            <p className="m-0 mt-2 text-[14px] text-cuaderno-grafito">
              Calculado con el motor de liquidaciones de RRHH (sin borradores). Líquido: fin de mes o fecha de la nómina. Previred (cotizaciones + aportes del empleador − asignación familiar): día 13 del mes siguiente. Impuesto único: con el F29, día 20.
            </p>
          </section>
        </div>
      )}
    </Hoja>
  );
}
