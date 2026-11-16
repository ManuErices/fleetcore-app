/**
 * Admin → Proyectos → "Vincular mandantes" (una vez).
 *
 * Las obras guardaban el mandante como texto libre. Esto las vincula al
 * maestro de clientes (rentalClients, ver src/lib/clientes.js):
 *   · las que calzan por nombre con UNA ficha se vinculan a ella;
 *   · para el resto, el usuario puede escribir RUT + razón social y se crea
 *     (o se reutiliza, si el RUT ya existe) la ficha.
 * Primero muestra el plan; escribe solo al confirmar. El texto `mandante` de
 * la obra no se toca: solo se agrega `clienteId`.
 */
import React, { useEffect, useMemo, useState } from "react";
import { listarClientes, planVincularMandantes, aplicarVinculoMandantes, rutCliente } from "../lib/clientes";
import { formatearRut } from "../lib/rut";

export default function VincularMandantes({ empresaId, proyectos, onClose, onCambio }) {
  const [clientes, setClientes] = useState(null);
  const [error, setError] = useState("");
  const [nuevos, setNuevos] = useState({});        // clave → { rut, razonSocial }
  const [aplicando, setAplicando] = useState(false);
  const [resultado, setResultado] = useState("");

  useEffect(() => {
    listarClientes(empresaId).then(setClientes).catch(e => setError(e.message));
  }, [empresaId]);

  const plan = useMemo(() => (clientes ? planVincularMandantes(proyectos, clientes) : null), [clientes, proyectos]);

  const dados = plan ? plan.sinCliente
    .map(g => ({ g, n: nuevos[g.clave] }))
    .filter(({ n }) => n && rutCliente(n.rut))
    .map(({ g, n }) => ({ clave: g.clave, rut: n.rut, razonSocial: (n.razonSocial || "").trim() || g.mandante })) : [];
  const invalidos = plan ? plan.sinCliente.filter(g => nuevos[g.clave]?.rut && !rutCliente(nuevos[g.clave].rut)).length : 0;
  const obrasDados = plan ? plan.sinCliente.filter(g => dados.some(d => d.clave === g.clave)).reduce((s, g) => s + g.obras.length, 0) : 0;
  const total = (plan?.vincular.length || 0) + obrasDados;

  const aplicar = async () => {
    if (!window.confirm(`Se vincularán ${total} obra(s) a su cliente${dados.length ? ` y se crearán hasta ${dados.length} ficha(s) de cliente` : ""}. ¿Continuar?`)) return;
    setAplicando(true); setError("");
    try {
      const r = await aplicarVinculoMandantes(empresaId, plan, dados);
      setResultado(`${r.obrasVinculadas} obra(s) vinculada(s), ${r.clientesCreados} cliente(s) creado(s).`);
      onCambio?.();
    } catch (e) { setError(e.message); }
    setAplicando(false);
  };

  const fijar = (clave, campo, valor) => setNuevos(n => ({ ...n, [clave]: { ...(n[clave] || {}), [campo]: valor } }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Vincular mandantes al maestro de clientes</h2>
            <p className="text-xs text-slate-500">Un cliente por RUT para Rental, Oficina Técnica, Contabilidad y Finanzas.</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-2xl leading-none" aria-label="Cerrar">×</button>
        </div>

        <div className="px-6 py-4 space-y-5 text-sm">
          {error && <p className="text-red-600">{error}</p>}
          {resultado && <p className="text-emerald-700 font-semibold">{resultado}</p>}
          {!plan ? <p className="text-slate-500">Leyendo clientes…</p> : resultado ? null : (
            <>
              <p className="text-slate-600">
                {plan.yaVinculadas} obra(s) ya tienen cliente{plan.sinMandante ? ` · ${plan.sinMandante} sin mandante escrito` : ""}. El texto del mandante no se borra.
              </p>

              <section>
                <h3 className="font-bold text-slate-800 mb-2">Calzan por nombre ({plan.vincular.length})</h3>
                {plan.vincular.length === 0 ? <p className="text-slate-400">Ninguna.</p> : (
                  <ul className="divide-y divide-slate-100">
                    {plan.vincular.map(v => (
                      <li key={v.projectId} className="py-1.5 flex justify-between gap-3">
                        <span>{v.obra} <span className="text-slate-400">· "{v.mandante}"</span></span>
                        <span className="text-slate-700">→ {v.cliente}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section>
                <h3 className="font-bold text-slate-800 mb-1">Sin ficha de cliente ({plan.sinCliente.length})</h3>
                <p className="text-xs text-slate-500 mb-2">Escribe el RUT para crear la ficha (si el RUT ya existe se usa esa ficha). Sin RUT, la obra queda como está.</p>
                {plan.sinCliente.length === 0 ? <p className="text-slate-400">Ninguno.</p> : (
                  <ul className="divide-y divide-slate-100">
                    {plan.sinCliente.map(g => {
                      const n = nuevos[g.clave] || {};
                      const malo = n.rut && !rutCliente(n.rut);
                      return (
                        <li key={g.clave} className="py-2">
                          <p className="font-semibold text-slate-800">{g.mandante}
                            <span className="font-normal text-slate-400"> · {g.obras.map(o => o.obra).join(", ")}</span></p>
                          <div className="mt-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <input className={`px-3 py-2 border-2 rounded-xl ${malo ? "border-red-300" : "border-slate-200"}`}
                              placeholder="RUT (ej: 76.123.456-0)" value={n.rut || ""}
                              onChange={e => fijar(g.clave, "rut", e.target.value)}
                              onBlur={e => rutCliente(e.target.value) && fijar(g.clave, "rut", formatearRut(e.target.value))} />
                            <input className="px-3 py-2 border-2 border-slate-200 rounded-xl"
                              placeholder={`Razón social (si no: ${g.mandante})`} value={n.razonSocial || ""}
                              onChange={e => fijar(g.clave, "razonSocial", e.target.value)} />
                          </div>
                          {malo && <p className="text-xs text-red-600 mt-1">RUT no válido: revisa el dígito verificador.</p>}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            </>
          )}
        </div>

        <div className="sticky bottom-0 bg-white border-t border-slate-200 px-6 py-3 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm font-semibold text-slate-600">{resultado ? "Cerrar" : "Cancelar"}</button>
          {!resultado && (
            <button onClick={aplicar} disabled={!plan || aplicando || total === 0 || invalidos > 0}
              className="px-4 py-2 text-sm font-bold text-white bg-indigo-600 rounded-xl disabled:opacity-40">
              {aplicando ? "Vinculando…" : `Vincular ${total} obra(s)`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
