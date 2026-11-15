/**
 * Revisión del maestro de máquinas (Admin → Máquinas → "Revisar maestro").
 *
 *  1. Normalizar: deja todas las fichas con el mismo vocabulario
 *     (propiedad, activa, clase de equipo, patente).
 *  2. Duplicados: fichas con la misma patente (o código, si no tienen
 *     patente). Al fusionar se elige la ficha que queda; todo el historial de
 *     las otras (reportes, combustible, mantenciones, documentos, arriendos,
 *     costos fijos) pasa a ella, se completan los datos que solo tenían las
 *     otras y éstas se borran.
 */
import React, { useEffect, useMemo, useState } from "react";
import {
  listarMaquinas, gruposDuplicados, fusionarMaquinas, planNormalizacion, aplicarNormalizacion,
  nombreMaquina, estaActiva, PROPIEDADES, propiedadNormal, planSurtidores, migrarSurtidores,
} from "../../lib/maquinas";

const nombreProp = (v) => PROPIEDADES.find(p => p.id === propiedadNormal(v))?.nombre || v || "—";
const fecha = (t) => {
  const d = t?.toDate ? t.toDate() : (t ? new Date(t) : null);
  return d && !isNaN(d) ? d.toLocaleDateString("es-CL") : "—";
};

export default function UnificarMaquinas({ empresaId, obras = [], onClose, onCambio }) {
  const [maquinas, setMaquinas] = useState(null);
  const [error, setError] = useState("");
  const [trabajando, setTrabajando] = useState("");
  const [principal, setPrincipal] = useState({});   // llave → id
  const [resultado, setResultado] = useState("");
  const [surtidores, setSurtidores] = useState([]);

  const cargar = async () => {
    setError("");
    try {
      const lista = await listarMaquinas(empresaId);
      setMaquinas(lista);
      setSurtidores(await planSurtidores(empresaId, lista));
    }
    catch (e) { setError(e.message); }
  };
  useEffect(() => { cargar(); }, [empresaId]); // eslint-disable-line react-hooks/exhaustive-deps

  const normalizacion = useMemo(() => planNormalizacion(maquinas || []), [maquinas]);
  const grupos = useMemo(() => gruposDuplicados(maquinas || []), [maquinas]);
  const obra = (id) => obras.find(o => o.id === id)?.name || (id ? "otra obra" : "sin obra");

  const normalizar = async () => {
    setTrabajando("normalizar");
    try {
      const n = await aplicarNormalizacion(empresaId, normalizacion);
      setResultado(`${n} fichas normalizadas.`);
      await cargar(); onCambio?.();
    } catch (e) { setError(e.message); }
    setTrabajando("");
  };

  const migrar = async () => {
    setTrabajando("surtidores");
    try {
      const r = await migrarSurtidores(empresaId, surtidores, (n) => setTrabajando(`surtidores|${n}`));
      setResultado(`Surtidores: ${r.creados} pasados al maestro, ${r.unidos} unidos a una máquina que ya existía${r.reapuntados ? ` (${r.reapuntados} reportes de combustible re-apuntados)` : ""}.`);
      await cargar(); onCambio?.();
    } catch (e) { setError(e.message); }
    setTrabajando("");
  };

  const fusionar = async (g) => {
    const idPrincipal = principal[g.llave] || g.maquinas[0].id;
    const otras = g.maquinas.filter(m => m.id !== idPrincipal);
    const queda = g.maquinas.find(m => m.id === idPrincipal);
    if (!window.confirm(`Queda la ficha ${nombreMaquina(queda)}.\n\nSe moverá a ella todo el historial de ${otras.length} ficha(s) duplicada(s), que luego se borran. ¿Continuar?`)) return;
    setTrabajando(g.llave);
    try {
      const { referencias } = await fusionarMaquinas(empresaId, idPrincipal, otras.map(m => m.id),
        (coleccion) => setTrabajando(`${g.llave}|${coleccion}`));
      const total = Object.values(referencias).reduce((a, b) => a + b, 0);
      setResultado(`${nombreMaquina(queda)}: ${otras.length} ficha(s) fusionada(s), ${total} registro(s) re-apuntado(s)${total ? ` (${Object.entries(referencias).map(([k, v]) => `${k}: ${v}`).join(", ")})` : ""}.`);
      await cargar(); onCambio?.();
    } catch (e) { setError(e.message); }
    setTrabajando("");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Revisar maestro de máquinas</h2>
            <p className="text-xs text-slate-500">Una ficha por máquina para Oficina Técnica, Maquinaria, Rental, Finanzas y Contabilidad.</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-2xl leading-none" aria-label="Cerrar">×</button>
        </div>

        <div className="p-6 space-y-6">
          {error && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
          {resultado && <p className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">{resultado}</p>}
          {!maquinas && !error && <p className="text-sm text-slate-500">Cargando fichas…</p>}

          {maquinas && (
            <>
              <p className="text-sm text-slate-600">
                {maquinas.length} fichas · {maquinas.filter(estaActiva).length} activas ·{" "}
                {grupos.length ? <b className="text-amber-700">{grupos.length} máquina(s) registradas más de una vez</b> : "sin duplicados por patente o código"}
              </p>

              {/* 1. Normalizar */}
              <section>
                <h3 className="font-semibold text-slate-800 mb-1">1. Mismo vocabulario en todas las fichas</h3>
                {normalizacion.length === 0 ? (
                  <p className="text-sm text-slate-500">Todas las fichas ya usan el vocabulario del maestro.</p>
                ) : (
                  <>
                    <p className="text-sm text-slate-600 mb-2">{normalizacion.length} fichas guardadas con otro vocabulario (por ejemplo, Finanzas guardaba "OWNED" y "activo", y por eso Oficina Técnica no las mostraba o no quedaban inactivas).</p>
                    <ul className="text-xs text-slate-600 max-h-40 overflow-y-auto border border-slate-100 rounded-lg divide-y divide-slate-100 mb-2">
                      {normalizacion.map(p => (
                        <li key={p.id} className="px-3 py-1.5"><b>{nombreMaquina(p.maquina) || p.id}</b>: {p.motivos.join("; ")}</li>
                      ))}
                    </ul>
                    <button disabled={!!trabajando} onClick={normalizar}
                      className="px-4 py-2 rounded-lg bg-purple-600 text-white text-sm font-semibold disabled:opacity-50">
                      {trabajando === "normalizar" ? "Normalizando…" : `Normalizar ${normalizacion.length} fichas`}
                    </button>
                  </>
                )}
              </section>

              {/* 2. Surtidores */}
              <section>
                <h3 className="font-semibold text-slate-800 mb-1">2. Camiones surtidores dentro del maestro</h3>
                {surtidores.length === 0 ? (
                  <p className="text-sm text-slate-500">Todos los surtidores ya son máquinas del maestro.</p>
                ) : (
                  <>
                    <p className="text-sm text-slate-600 mb-2">{surtidores.length} surtidor(es) siguen en la lista aparte de combustible. Pasan a ser máquinas marcadas como surtidor; sus reportes de combustible siguen apuntando a ellos.</p>
                    <ul className="text-xs text-slate-600 max-h-40 overflow-y-auto border border-slate-100 rounded-lg divide-y divide-slate-100 mb-2">
                      {surtidores.map(({ antiguo, destino }) => (
                        <li key={antiguo.id} className="px-3 py-1.5">
                          <b>{antiguo.nombre || antiguo.patente}</b> {antiguo.patente ? `(${antiguo.patente})` : ""}: {destino ? <>se une a la máquina <b>{nombreMaquina(destino)}</b>, que ya existe</> : "se crea en el maestro"}
                        </li>
                      ))}
                    </ul>
                    <button disabled={!!trabajando} onClick={migrar}
                      className="px-4 py-2 rounded-lg bg-purple-600 text-white text-sm font-semibold disabled:opacity-50">
                      {trabajando.startsWith("surtidores") ? `Migrando ${trabajando.split("|")[1] || ""}…` : `Pasar ${surtidores.length} surtidor(es) al maestro`}
                    </button>
                  </>
                )}
              </section>

              {/* 3. Duplicados */}
              <section>
                <h3 className="font-semibold text-slate-800 mb-1">3. Máquinas registradas más de una vez</h3>
                {grupos.length === 0 ? (
                  <p className="text-sm text-slate-500">No hay fichas con la misma patente o código.</p>
                ) : (
                  <div className="space-y-4">
                    <p className="text-sm text-slate-600">Elige la ficha que queda. Todo el historial de las demás pasa a ella y se completan los datos que solo tenían las otras.</p>
                    {grupos.map(g => {
                      const sel = principal[g.llave] || g.maquinas[0].id;
                      const ocupado = trabajando.startsWith(g.llave);
                      return (
                        <div key={g.llave} className="border border-amber-200 rounded-xl overflow-hidden">
                          <div className="bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-900">
                            {g.llave.startsWith("P:") ? "Patente" : "Código"} {g.llave.slice(2)} · {g.maquinas.length} fichas
                          </div>
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                              <thead className="text-slate-500">
                                <tr><th className="p-2 text-left">Queda</th><th className="p-2 text-left">Ficha</th><th className="p-2 text-left">Obra</th><th className="p-2 text-left">Propiedad</th><th className="p-2 text-left">Valor compra</th><th className="p-2 text-left">Creada</th></tr>
                              </thead>
                              <tbody>
                                {g.maquinas.map(m => (
                                  <tr key={m.id} className={`border-t border-slate-100 ${m.id === sel ? "bg-purple-50" : ""}`}>
                                    <td className="p-2"><input type="radio" name={g.llave} checked={m.id === sel} onChange={() => setPrincipal(p => ({ ...p, [g.llave]: m.id }))} /></td>
                                    <td className="p-2">{nombreMaquina(m)}{!estaActiva(m) && <span className="text-slate-400"> (inactiva)</span>}</td>
                                    <td className="p-2">{obra(m.projectId)}</td>
                                    <td className="p-2">{nombreProp(m.ownership)}</td>
                                    <td className="p-2">{m.valorCompra ? `${m.moneda && m.moneda !== "CLP" ? m.moneda + " " : "$"}${Number(m.valorCompra).toLocaleString("es-CL")}` : "—"}</td>
                                    <td className="p-2">{fecha(m.createdAt)}{m.creadoDesde ? ` · ${m.creadoDesde}` : ""}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          <div className="px-4 py-2 border-t border-slate-100 flex items-center justify-between gap-2">
                            <span className="text-xs text-slate-500">{ocupado && trabajando.includes("|") ? `Re-apuntando ${trabajando.split("|")[1]}…` : ""}</span>
                            <button disabled={!!trabajando} onClick={() => fusionar(g)}
                              className="px-4 py-1.5 rounded-lg bg-amber-600 text-white text-sm font-semibold disabled:opacity-50">
                              {ocupado ? "Fusionando…" : "Fusionar"}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
