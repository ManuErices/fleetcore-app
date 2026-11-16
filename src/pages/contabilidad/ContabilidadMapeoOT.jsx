/**
 * ContabilidadMapeoOT.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Plan de cuentas → "Cuentas de costo de Oficina Técnica": a qué cuenta
 * contable va cada código de costo de OT ("1.1" … "5.25", src/lib/planCuentas.js)
 * con que se clasifican OC, subcontratos y rendiciones.
 *
 * Se guarda en empresas/{id}/config/mapeoCuentas ({ mapeo: { "3.2": cuentaId } })
 * y lo usa el importador de compras (ContabilidadImportIConstruct.jsx). La
 * lógica (sugerencias por nombre) vive en src/lib/contabilidad/mapeoCuentas.js.
 */
import React, { useEffect, useMemo, useState } from "react";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useEmpresa } from "../../lib/useEmpresa";
import { useContabilidad } from "./ContabilidadContext";
import { PLAN_CUENTAS, CATEGORIAS } from "../../lib/planCuentas";
import { cuentasDeCosto, sugerirMapeoOT } from "../../lib/contabilidad/mapeoCuentas";
import { Hoja, Nota, Boton, Campo, VistoBueno, LineaGuia, casoOracion } from "../finanzas/cuaderno";

export default function ContabilidadMapeoOT() {
  const { empresaId } = useEmpresa();
  const { cuentas, loadingCuentas } = useContabilidad();
  const [guardado, setGuardado] = useState(null);   // mapeo en Firestore (null = cargando)
  const [mapeo, setMapeo] = useState({});
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");

  const opciones = useMemo(
    () => cuentasDeCosto(cuentas).slice().sort((a, b) => String(a.codigo).localeCompare(String(b.codigo))),
    [cuentas]
  );
  const sugerencias = useMemo(() => sugerirMapeoOT(PLAN_CUENTAS, cuentas, {}), [cuentas]);

  useEffect(() => {
    if (!empresaId) return;
    let vivo = true;
    getDoc(doc(db, "empresas", empresaId, "config", "mapeoCuentas"))
      .then(s => {
        if (!vivo) return;
        const g = (s.exists() && s.data().mapeo) || {};
        setGuardado(g);
        setMapeo(g);
      })
      .catch(e => {
        console.error("Error leyendo mapeo de cuentas OT:", e);
        if (vivo) { setGuardado({}); setError("No se pudo leer el mapeo guardado."); }
      });
    return () => { vivo = false; };
  }, [empresaId]);

  const idsValidos = useMemo(() => new Set(opciones.map(c => c.id)), [opciones]);
  const asignados = PLAN_CUENTAS.filter(p => idsValidos.has(mapeo[p.codigo])).length;
  const pendientesSugeridos = PLAN_CUENTAS.filter(p => !idsValidos.has(mapeo[p.codigo]) && sugerencias[p.codigo]).length;
  const cambios = guardado !== null && JSON.stringify(limpio(mapeo)) !== JSON.stringify(limpio(guardado));

  const aceptarSugerencias = () => {
    setMapeo(m => {
      const n = { ...m };
      for (const p of PLAN_CUENTAS) if (!idsValidos.has(n[p.codigo]) && sugerencias[p.codigo]) n[p.codigo] = sugerencias[p.codigo];
      return n;
    });
  };

  const guardar = async () => {
    setGuardando(true); setError(""); setMensaje("");
    try {
      // Sin merge: un código que se deja sin cuenta debe desaparecer del doc
      await setDoc(doc(db, "empresas", empresaId, "config", "mapeoCuentas"),
        { mapeo: limpio(mapeo), updatedAt: serverTimestamp() });
      setGuardado(limpio(mapeo));
      setMensaje("Mapeo guardado");
      setTimeout(() => setMensaje(""), 4000);
    } catch (e) {
      console.error("Error guardando mapeo de cuentas OT:", e);
      setError("No se pudo guardar el mapeo. Revisa tus permisos de Contabilidad.");
    }
    setGuardando(false);
  };

  if (loadingCuentas || guardado === null) {
    return <p className="m-0 py-12 text-center text-[18px] text-cuaderno-grafito">Buscando las cuentas…</p>;
  }

  const nombreCuenta = (cid) => {
    const c = cuentas.find(x => x.id === cid);
    return c ? `${c.codigo} ${c.nombre}` : "";
  };

  return (
    <div className="space-y-5">
      <Hoja titulo="Cuentas de costo de Oficina Técnica"
        extra={
          <>
            {pendientesSugeridos > 0 && (
              <Boton onClick={aceptarSugerencias}>Usar {pendientesSugeridos} sugerencia{pendientesSugeridos !== 1 ? "s" : ""}</Boton>
            )}
            <Boton variante="primario" onClick={guardar} disabled={guardando || !cambios}>
              {guardando ? "Guardando…" : "Guardar mapeo"}
            </Boton>
          </>
        }>
        <p className="m-0 mb-3 text-[17px] text-cuaderno-grafito leading-snug">
          Oficina Técnica clasifica órdenes de compra, subcontratos y rendiciones con su propio plan (1.1 … 5.25).
          Elige a qué cuenta del plan contable va cada código: al importar compras (iConstruye o RCV), los
          proveedores cuyo costo en Oficina Técnica cae en un solo código se contabilizan en esa cuenta.
        </p>
        <LineaGuia etiqueta="Códigos con cuenta">
          <span>{asignados} <span className="text-[15px] text-cuaderno-grafito">de {PLAN_CUENTAS.length}</span></span>
        </LineaGuia>
        {error && <Nota etiqueta="Ojo:">{error}</Nota>}
        {mensaje && (
          <p className="m-0 flex items-center gap-2 text-[17px] text-cuaderno-verde">
            <VistoBueno tamano={15} titulo="" /> {mensaje}
          </p>
        )}
        {!opciones.length && (
          <Nota etiqueta="Falta:">No hay cuentas de costo o gasto activas en el plan contable. Créalas en la pestaña Cuentas.</Nota>
        )}

        <div className="overflow-x-auto mt-3">
          <table className="w-full border-collapse">
            <thead>
              <tr className="shadow-[inset_0_-1.5px_0_rgb(var(--cuaderno-tinta))]">
                <th className="font-normal text-[15px] text-cuaderno-grafito text-left px-2 py-2 w-16">Código</th>
                <th className="font-normal text-[15px] text-cuaderno-grafito text-left px-2 py-2">Cuenta de costo OT</th>
                <th className="font-normal text-[15px] text-cuaderno-grafito text-left px-2 py-2 min-w-[260px]">Cuenta contable</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(CATEGORIAS).map(([cat, nombreCat]) => (
                <React.Fragment key={cat}>
                  <tr>
                    <td colSpan={3} className="px-2 pt-4 pb-1 text-[17px] text-cuaderno-grafito">{cat}. {casoOracion(nombreCat)}</td>
                  </tr>
                  {PLAN_CUENTAS.filter(p => String(p.categoria) === cat).map(p => {
                    const valor = idsValidos.has(mapeo[p.codigo]) ? mapeo[p.codigo] : "";
                    const sug = sugerencias[p.codigo];
                    const guardadoValido = idsValidos.has(guardado[p.codigo]);
                    return (
                      <tr key={p.codigo} className="border-b border-cuaderno-renglon hover:bg-cuaderno-papel">
                        <td className="px-2 py-2 text-[16px] whitespace-nowrap align-top">{p.codigo}</td>
                        <td className="px-2 py-2 align-top">
                          <p className="m-0 text-[17px] leading-tight">{casoOracion(p.subcategoria)}</p>
                          {p.observacion && <p className="m-0 text-[13px] text-cuaderno-grafito">{p.observacion}</p>}
                        </td>
                        <td className="px-2 py-1.5 align-top">
                          <Campo as="select" etiqueta="" aria-label={`Cuenta contable para ${p.codigo}`}
                            value={valor} onChange={e => setMapeo(m => ({ ...m, [p.codigo]: e.target.value }))}>
                            <option value="">Sin cuenta (se usa la regla del proveedor)</option>
                            {opciones.map(c => <option key={c.id} value={c.id}>{c.codigo} {c.nombre}</option>)}
                          </Campo>
                          {!valor && sug && (
                            <p className="m-0 mt-0.5 text-[13px] text-cuaderno-grafito">
                              Sugerida: {nombreCuenta(sug)}{" "}
                              <button type="button" className="underline underline-offset-2 text-cuaderno-tinta"
                                onClick={() => setMapeo(m => ({ ...m, [p.codigo]: sug }))}>usar</button>
                            </p>
                          )}
                          {valor && !guardadoValido && (
                            <p className="m-0 mt-0.5 text-[13px] text-cuaderno-grafito">Sin guardar</p>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </Hoja>
    </div>
  );
}

/** Mapeo sin códigos vacíos y con orden estable (para comparar y guardar). */
function limpio(m) {
  return Object.fromEntries(Object.entries(m || {}).filter(([, v]) => v).sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true })));
}
