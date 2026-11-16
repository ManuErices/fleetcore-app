import React, { useEffect, useMemo, useState } from "react";
import { listarClientes, asegurarCliente, clientePorNombre, nombreCliente, rutDeCliente } from "../../lib/clientes";
import { formatearRut } from "../../lib/rut";
import { Campo, Boton, Nota } from "./cuaderno";

/*
 * Cliente de una cuenta de ingreso del flujo de caja, elegido del maestro de
 * clientes por RUT (rentalClients, src/lib/clientes.js). Antes era texto
 * libre: los cobros de Rental y los estados de pago se asociaban a la cuenta
 * adivinando por el nombre.
 *
 * Props:
 *  - empresaId
 *  - valor: { clienteId, cliente } de la cuenta
 *  - sugerencia: texto con que buscar un cliente si la cuenta aún no tiene
 *    (el cliente escrito antes, o el nombre de la cuenta)
 *  - onCambiar({ clienteId, clienteRut, cliente })
 */
export default function SelectorCliente({ empresaId, valor = {}, sugerencia = "", onCambiar }) {
  const [clientes, setClientes] = useState([]);
  const [creando, setCreando] = useState(false);
  const [nuevo, setNuevo] = useState({ rut: "", razonSocial: "" });
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!empresaId) return;
    listarClientes(empresaId).then(setClientes).catch(() => setClientes([]));
  }, [empresaId]);

  const elegido = clientes.find(c => c.id === valor.clienteId) || null;
  // Cuenta antigua sin ficha: se propone el cliente cuyo nombre calza (sin elegirlo solo)
  const propuesto = useMemo(
    () => (!valor.clienteId && sugerencia ? clientePorNombre(clientes, sugerencia) : null),
    [clientes, valor.clienteId, sugerencia]);

  const elegir = (c) => onCambiar(c
    ? { clienteId: c.id, clienteRut: rutDeCliente(c) || "", cliente: nombreCliente(c) }
    : { clienteId: "", clienteRut: "", cliente: valor.clienteId ? "" : (valor.cliente || "") });

  const crear = async () => {
    setError("");
    setGuardando(true);
    try {
      const r = await asegurarCliente(empresaId, nuevo, "finanzas");
      const lista = await listarClientes(empresaId);
      setClientes(lista);
      elegir(lista.find(c => c.id === r.id) || { id: r.id, nombre: r.nombre, rut: nuevo.rut });
      setCreando(false);
      setNuevo({ rut: "", razonSocial: "" });
    } catch (e) {
      setError(e.message || "No se pudo crear el cliente");
    }
    setGuardando(false);
  };

  return (
    <div className="space-y-2">
      <Campo as="select" etiqueta="Cliente" value={valor.clienteId || ""}
        onChange={e => elegir(clientes.find(c => c.id === e.target.value) || null)}>
        <option value="">{!valor.clienteId && valor.cliente ? `${valor.cliente} (sin ficha)` : "Sin cliente"}</option>
        {clientes.map(c => (
          <option key={c.id} value={c.id}>
            {nombreCliente(c)}{rutDeCliente(c) ? ` · ${formatearRut(rutDeCliente(c))}` : ""}
          </option>
        ))}
        {valor.clienteId && !elegido && <option value={valor.clienteId}>{valor.cliente || valor.clienteId}</option>}
      </Campo>

      {propuesto && (
        <p className="m-0 text-[14px] text-cuaderno-grafito">
          ¿Es <span className="text-cuaderno-tinta">{nombreCliente(propuesto)}</span>?{" "}
          <button type="button" className="underline text-cuaderno-azul" onClick={() => elegir(propuesto)}>Usar esta ficha</button>
        </p>
      )}

      {!creando ? (
        <button type="button" className="text-[14px] underline text-cuaderno-grafito" onClick={() => {
          setCreando(true);
          setNuevo({ rut: "", razonSocial: valor.cliente || sugerencia || "" });
        }}>
          Crear cliente nuevo
        </button>
      ) : (
        <div className="border border-cuaderno-renglon rounded-md p-3 space-y-2">
          <div className="grid grid-cols-2 gap-3">
            <Campo etiqueta="RUT" value={nuevo.rut} placeholder="76.123.456-7"
              onChange={e => setNuevo(n => ({ ...n, rut: e.target.value }))} />
            <Campo etiqueta="Razón social" value={nuevo.razonSocial}
              onChange={e => setNuevo(n => ({ ...n, razonSocial: e.target.value }))} />
          </div>
          {error && <Nota etiqueta="Error:">{error}</Nota>}
          <div className="flex gap-2">
            <Boton variante="primario" onClick={crear} disabled={guardando || !nuevo.rut.trim()}>
              {guardando ? "Guardando…" : "Agregar y elegir"}
            </Boton>
            <Boton onClick={() => { setCreando(false); setError(""); }}>Cancelar</Boton>
          </div>
          <p className="m-0 text-[13px] text-cuaderno-grafito">Si el RUT ya existe en el maestro, se usa esa ficha.</p>
        </div>
      )}
    </div>
  );
}
