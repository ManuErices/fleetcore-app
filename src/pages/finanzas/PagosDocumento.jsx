import React, { useState, useId } from "react";
import {
  obtenerCuentasBancarias,
  agregarCuentaBancaria,
  obtenerPagos,
  registrarPago,
} from "../../lib/pagosDeuda";
import { ModalCuaderno, Campo, Boton, Nota, Cifra, VistoBueno, IconoSiguiente, IconoMas, casoTitulo } from "./cuaderno";

/*
 * Sección de pagos de UN documento: lista de pagos ya registrados +
 * botón/modal para registrar uno nuevo. Se monta junto a Comprobantes
 * e Historial en cada tarjeta de documento del panel de detalle.
 *
 * Carga perezosa igual que HistorialAuditoria: no consulta Firestore
 * hasta que el usuario expande la sección.
 */

function fmt(n) {
  return "$" + Math.round(Math.abs(n || 0)).toLocaleString("es-CL");
}

function ModalRegistrarPago({ documento, empresaId, cuentas, onClose, onGuardado }) {
  const [monto, setMonto] = useState("");
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [cuentaOrigen, setCuentaOrigen] = useState(cuentas[0] || "");
  const [cuentaNueva, setCuentaNueva] = useState("");
  const [usarCuentaNueva, setUsarCuentaNueva] = useState(cuentas.length === 0);
  const [nota, setNota] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setError(null);
    setGuardando(true);

    const cuentaFinal = usarCuentaNueva ? cuentaNueva.trim() : cuentaOrigen;

    const resultado = await registrarPago({
      empresaId,
      documento,
      monto,
      fecha,
      cuentaOrigen: cuentaFinal,
      nota,
    });

    if (!resultado.ok) {
      setError(resultado.error);
      setGuardando(false);
      return;
    }

    if (usarCuentaNueva && cuentaFinal) {
      await agregarCuentaBancaria(empresaId, cuentaFinal);
    }

    setGuardando(false);
    onGuardado(resultado.documentoActualizado);
  }

  const idForm = useId();
  return (
    <ModalCuaderno
      titulo="Registrar pago"
      subtitulo={`Documento ${documento.numeroDoc}, ${casoTitulo(documento.proveedorNombre)}`}
      onClose={onClose}
      bloqueado={guardando}
      pie={
        <div className="space-y-3">
          {error && <Nota etiqueta="Ojo:">{error}</Nota>}
          <div className="flex gap-2">
            <Boton className="flex-1" onClick={onClose} disabled={guardando}>Cancelar</Boton>
            <Boton type="submit" form={idForm} variante="primario" className="flex-1" disabled={guardando}>
              {guardando ? "Guardando…" : "Registrar pago"}
            </Boton>
          </div>
        </div>
      }>
      <form id={idForm} onSubmit={submit} className="space-y-5">
        <p className="m-0 flex items-baseline justify-between text-[17px]">
          <span className="text-cuaderno-grafito">Saldo actual</span>
          <Cifra valor={documento.saldoPendiente} escala="pesos" vacio="$0" />
        </p>

        <Campo
          etiqueta="Monto pagado, en pesos"
          required type="number" min="1" inputMode="numeric"
          value={monto} onChange={e => setMonto(e.target.value)}
          placeholder={`Hasta ${fmt(documento.saldoPendiente)}`}
        />

        <Campo etiqueta="Fecha del pago" type="date" value={fecha} onChange={e => setFecha(e.target.value)} />

        {!usarCuentaNueva && cuentas.length > 0 ? (
          <div className="flex items-end gap-3">
            <Campo as="select" etiqueta="Cuenta de origen" className="flex-1"
              value={cuentaOrigen} onChange={e => setCuentaOrigen(e.target.value)}>
              {cuentas.map(c => <option key={c} value={c}>{c}</option>)}
            </Campo>
            <Boton variante="texto" className="text-[16px]" onClick={() => setUsarCuentaNueva(true)}>Otra cuenta</Boton>
          </div>
        ) : (
          <div className="flex items-end gap-3">
            <Campo etiqueta="Cuenta de origen" className="flex-1"
              value={cuentaNueva} onChange={e => setCuentaNueva(e.target.value)}
              placeholder="Ej: cuenta corriente Santander" />
            {cuentas.length > 0 && (
              <Boton variante="texto" className="text-[16px]" onClick={() => setUsarCuentaNueva(false)}>Elegir de la lista</Boton>
            )}
          </div>
        )}

        <Campo as="textarea" rows={2} etiqueta="Nota, si hace falta" value={nota} onChange={e => setNota(e.target.value)} />
      </form>
    </ModalCuaderno>
  );
}

export default function PagosDocumento({ empresaId, documento, onDocumentoActualizado }) {
  const [abierto, setAbierto] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [pagos, setPagos] = useState(null);
  const [cuentas, setCuentas] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);

  async function toggle() {
    if (abierto) { setAbierto(false); return; }
    setAbierto(true);
    if (pagos !== null) return;
    setCargando(true);
    const [listaPagos, listaCuentas] = await Promise.all([
      obtenerPagos(empresaId, documento.id),
      obtenerCuentasBancarias(empresaId),
    ]);
    setPagos(listaPagos);
    setCuentas(listaCuentas);
    setCargando(false);
  }

  async function abrirModal() {
    // Asegura tener cuentas cargadas aunque la sección no se haya abierto antes
    if (cuentas.length === 0 && pagos === null) {
      const listaCuentas = await obtenerCuentasBancarias(empresaId);
      setCuentas(listaCuentas);
    }
    setModalOpen(true);
  }

  function handleGuardado(documentoActualizado) {
    setModalOpen(false);
    onDocumentoActualizado?.(documentoActualizado);
    // Refresca la lista local de pagos sin re-consultar Firestore completo
    obtenerPagos(empresaId, documento.id).then(setPagos);
  }

  return (
    <div className="mt-1">
      <div className="flex items-center justify-between gap-2">
        <button
          onClick={toggle}
          aria-expanded={abierto}
          className="min-h-[36px] flex items-center gap-1 text-[15px] text-cuaderno-grafito hover:text-cuaderno-tinta"
        >
          <IconoSiguiente tamano={13} className={`transition-transform ${abierto ? "rotate-90" : ""}`} />
          Pagos registrados
        </button>
        {documento.saldoPendiente > 0 && (
          <Boton variante="texto" className="min-h-[36px] text-[15px]" onClick={abrirModal}>
            <IconoMas tamano={12} /> Registrar pago
          </Boton>
        )}
      </div>

      {abierto && (
        <div className="ml-1.5 pl-3 border-l border-cuaderno-columna space-y-1.5 pb-1">
          {cargando && <p className="m-0 text-[14px] text-cuaderno-grafito">Buscando pagos…</p>}
          {pagos && pagos.length === 0 && (
            <p className="m-0 text-[14px] text-cuaderno-grafito">Sin pagos anotados todavía.</p>
          )}
          {pagos && pagos.map((p) => (
            <div key={p.id} className="text-[15px] leading-snug">
              <div className="flex items-center gap-1.5">
                <VistoBueno tamano={12} />
                <Cifra valor={p.monto} escala="pesos" color="tinta" />
                <span className="text-[13px] text-cuaderno-grafito">
                  {p.fecha}{p.cuentaOrigen && `, desde ${p.cuentaOrigen}`}
                </span>
              </div>
              {p.nota && <div className="text-[13px] text-cuaderno-grafito pl-5">{p.nota}</div>}
            </div>
          ))}
        </div>
      )}

      {modalOpen && (
        <ModalRegistrarPago
          documento={documento}
          empresaId={empresaId}
          cuentas={cuentas}
          onClose={() => setModalOpen(false)}
          onGuardado={handleGuardado}
        />
      )}
    </div>
  );
}
