import React, { useEffect, useMemo, useState } from "react";
import { cargarSubcontratos, subcontratistasConEPs } from "../../lib/subcontratosEP";
import { rutLlave } from "../../lib/terceros";
import { hoyISO, sumarDias } from "../../lib/fechas";
import { Hoja, Cifra, Boton, Resaltado, casoTitulo } from "./cuaderno";

/*
 * Estados de pago de subcontratistas (Oficina Técnica), como REFERENCIA bajo
 * el flujo de caja. No escribe nada: el flujo se sigue anotando a mano.
 *
 * Para cada subcontratista con EP en los últimos 60 días muestra el total de
 * esos EP y lo anotado en el flujo para sus cuentas (las vinculadas a su
 * ficha del maestro) en las semanas visibles. Si tiene EP y nada anotado, se
 * marca para revisar.
 */
const DIAS = 60;

export default function ReferenciaSubcontratos({ empresaId, egresos, proveedores, payments, weekColumns, onAbrirCuenta }) {
  const [abierto, setAbierto] = useState(false);
  const [filas, setFilas] = useState(null);

  useEffect(() => {
    if (!abierto || !empresaId || filas) return;
    let vivo = true;
    cargarSubcontratos(empresaId).then(f => { if (vivo) setFilas(f); }).catch(() => { if (vivo) setFilas([]); });
    return () => { vivo = false; };
  }, [abierto, empresaId, filas]);

  const grupos = useMemo(() => {
    if (!filas) return [];
    const desde = sumarDias(hoyISO(), -DIAS) /* calendario de Chile */;
    return subcontratistasConEPs(filas, desde).map(g => {
      // Ficha del maestro: por proveedorId o, si la fila es antigua, por RUT
      const ficha = proveedores.find(p => p.id === g.proveedorId)
        || proveedores.find(p => p.rutNormalizado && rutLlave(p.rutNormalizado) === g.clave);
      const cuentas = ficha ? egresos.filter(c => c.proveedorId === ficha.id) : [];
      const enFlujo = cuentas.reduce((s, c) =>
        s + weekColumns.reduce((t, w) => t + Math.abs(payments[`${c.id}-${w.key}`] || 0), 0), 0);
      return { ...g, nombre: ficha?.razonSocial || g.razonSocial, cuentas, enFlujo };
    });
  }, [filas, egresos, proveedores, payments, weekColumns]);

  const sinAnotar = grupos.filter(g => g.total > 0 && g.enFlujo === 0).length;

  return (
    <Hoja titulo="Estados de pago de subcontratistas"
      extra={<Boton variante="texto" onClick={() => setAbierto(a => !a)}>{abierto ? "Ocultar" : "Ver"}</Boton>}>
      {!abierto ? (
        <p className="m-0 text-[16px] text-cuaderno-grafito">
          Referencia desde Oficina Técnica: lo que cobran los subcontratistas en sus estados de pago de los últimos {DIAS} días, al lado de lo anotado en el flujo. No modifica el flujo.
        </p>
      ) : filas === null ? (
        <p className="m-0 text-[16px] text-cuaderno-grafito">Buscando estados de pago…</p>
      ) : !grupos.length ? (
        <p className="m-0 text-[16px] text-cuaderno-grafito">No hay estados de pago de subcontratistas en los últimos {DIAS} días.</p>
      ) : (
        <>
          {sinAnotar > 0 && (
            <p className="m-0 mb-2 text-[16px]">
              <Resaltado color="durazno">{sinAnotar} {sinAnotar === 1 ? "subcontratista tiene" : "subcontratistas tienen"} estados de pago sin nada anotado en el flujo</Resaltado>
            </p>
          )}
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[16px]">
              <thead>
                <tr className="shadow-[inset_0_-1.5px_0_rgb(var(--cuaderno-tinta))]">
                  <th className="px-2 py-1.5 text-left font-normal text-[14px] text-cuaderno-grafito">Subcontratista</th>
                  <th className="px-2 py-1.5 text-left font-normal text-[14px] text-cuaderno-grafito">Últimos estados de pago</th>
                  <th className="px-2 py-1.5 text-right font-normal text-[14px] text-cuaderno-grafito">Total EP ({DIAS} días)</th>
                  <th className="px-2 py-1.5 text-right font-normal text-[14px] text-cuaderno-grafito">Anotado en el flujo</th>
                </tr>
              </thead>
              <tbody>
                {grupos.map(g => (
                  <tr key={g.clave} className="border-b border-cuaderno-renglon align-top">
                    <td className="px-2 py-1.5">
                      <span className="block">{casoTitulo(g.nombre)}</span>
                      {g.rut && <span className="text-[13px] text-cuaderno-grafito">{g.rut}</span>}
                    </td>
                    <td className="px-2 py-1.5 text-[14px] text-cuaderno-grafito">
                      {g.eps.slice(0, 3).map(e => (
                        <span key={`${e.numeroSC}-${e.numeroEP}`} className="block">
                          EP {e.numeroEP} · {e.fechaEP ? e.fechaEP.split("-").reverse().join("/") : "sin fecha"}{e.estado ? ` · ${e.estado.toLowerCase()}` : ""}
                        </span>
                      ))}
                      {g.eps.length > 3 && <span className="block">y {g.eps.length - 3} más</span>}
                    </td>
                    <td className="px-2 py-1.5 text-right"><Cifra valor={g.total} escala="pesos" color="tinta" /></td>
                    <td className="px-2 py-1.5 text-right">
                      {g.cuentas.length ? (
                        <button type="button" onClick={() => onAbrirCuenta(g.cuentas[0])} className="underline decoration-cuaderno-columna underline-offset-[3px]">
                          {g.enFlujo ? <Cifra valor={g.enFlujo} escala="pesos" color="tinta" /> : <Resaltado color="durazno">nada anotado</Resaltado>}
                        </button>
                      ) : (
                        <span className="text-[14px] text-cuaderno-grafito">sin cuenta en el flujo</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="m-0 mt-2 text-[14px] text-cuaderno-grafito">
            "Anotado en el flujo" suma las semanas visibles de las cuentas vinculadas a la ficha del subcontratista. Para vincular una cuenta, ábrela y elige su proveedor.
          </p>
        </>
      )}
    </Hoja>
  );
}
