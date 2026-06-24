import React, { useState, useEffect } from "react";
import {
  obtenerCuentasBancarias,
  agregarCuentaBancaria,
  obtenerPagos,
  registrarPago,
} from "../../lib/pagosDeuda";

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

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <form onSubmit={submit} className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-5 space-y-3">
        <h3 className="text-base font-black text-slate-800">Registrar pago</h3>
        <p className="text-xs text-slate-400">
          Doc {documento.numeroDoc} · {documento.proveedorNombre} — saldo actual: <b>{fmt(documento.saldoPendiente)}</b>
        </p>

        <div>
          <label className="text-xs font-bold text-slate-500">Monto pagado *</label>
          <input
            required type="number" min="1" value={monto}
            onChange={e => setMonto(e.target.value)}
            placeholder={`Máximo ${fmt(documento.saldoPendiente)}`}
            className="w-full mt-1 px-3 py-2 border-2 border-slate-200 rounded-xl text-sm focus:outline-none focus:border-purple-400"
          />
        </div>

        <div>
          <label className="text-xs font-bold text-slate-500">Fecha del pago</label>
          <input
            type="date" value={fecha} onChange={e => setFecha(e.target.value)}
            className="w-full mt-1 px-3 py-2 border-2 border-slate-200 rounded-xl text-sm focus:outline-none focus:border-purple-400"
          />
        </div>

        <div>
          <label className="text-xs font-bold text-slate-500">Cuenta de origen</label>
          {!usarCuentaNueva && cuentas.length > 0 ? (
            <div className="flex gap-2 mt-1">
              <select
                value={cuentaOrigen} onChange={e => setCuentaOrigen(e.target.value)}
                className="flex-1 px-3 py-2 border-2 border-slate-200 rounded-xl text-sm focus:outline-none focus:border-purple-400 bg-white"
              >
                {cuentas.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <button
                type="button"
                onClick={() => setUsarCuentaNueva(true)}
                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-xs font-bold text-slate-600 transition-colors flex-shrink-0"
              >
                + Nueva
              </button>
            </div>
          ) : (
            <div className="flex gap-2 mt-1">
              <input
                value={cuentaNueva} onChange={e => setCuentaNueva(e.target.value)}
                placeholder="Ej: Cuenta Corriente Santander"
                className="flex-1 px-3 py-2 border-2 border-slate-200 rounded-xl text-sm focus:outline-none focus:border-purple-400"
              />
              {cuentas.length > 0 && (
                <button
                  type="button"
                  onClick={() => setUsarCuentaNueva(false)}
                  className="px-3 py-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-xs font-bold text-slate-600 transition-colors flex-shrink-0"
                >
                  Lista
                </button>
              )}
            </div>
          )}
        </div>

        <div>
          <label className="text-xs font-bold text-slate-500">Nota (opcional)</label>
          <textarea
            value={nota} onChange={e => setNota(e.target.value)} rows={2}
            className="w-full mt-1 px-3 py-2 border-2 border-slate-200 rounded-xl text-sm focus:outline-none focus:border-purple-400 resize-none"
          />
        </div>

        {error && (
          <p className="text-xs font-bold text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
        )}

        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} disabled={guardando}
            className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 rounded-xl text-sm font-bold text-slate-600 transition-colors disabled:opacity-50">
            Cancelar
          </button>
          <button type="submit" disabled={guardando}
            className="flex-1 py-2.5 bg-purple-700 hover:bg-purple-800 rounded-xl text-sm font-bold text-white transition-colors disabled:opacity-50">
            {guardando ? "Guardando..." : "Registrar pago"}
          </button>
        </div>
      </form>
    </div>
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
    <div className="mt-1.5">
      <div className="flex items-center justify-between">
        <button
          onClick={toggle}
          className="flex items-center gap-1 text-[10px] font-bold text-slate-400 hover:text-purple-600 transition-colors"
        >
          <svg className={`w-3 h-3 transition-transform ${abierto ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
          </svg>
          Pagos registrados
        </button>
        {documento.saldoPendiente > 0 && (
          <button
            onClick={abrirModal}
            className="text-[10px] font-bold text-purple-700 hover:underline"
          >
            + Registrar pago
          </button>
        )}
      </div>

      {abierto && (
        <div className="mt-1.5 pl-2 border-l-2 border-slate-100 space-y-1.5">
          {cargando && <p className="text-[10px] text-slate-400">Cargando...</p>}
          {pagos && pagos.length === 0 && (
            <p className="text-[10px] text-slate-400 italic">Sin pagos registrados aún.</p>
          )}
          {pagos && pagos.map((p) => (
            <div key={p.id} className="text-[10px] text-slate-600">
              <span className="font-bold text-emerald-700">{fmt(p.monto)}</span>
              {p.cuentaOrigen && <span className="text-slate-400"> · {p.cuentaOrigen}</span>}
              <span className="text-slate-400"> · {p.fecha}</span>
              {p.nota && <div className="text-slate-400 italic">{p.nota}</div>}
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
