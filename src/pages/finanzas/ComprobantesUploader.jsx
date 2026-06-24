import React, { useState, useRef } from "react";
import { auth } from "../../lib/firebase";
import { subirComprobante, eliminarComprobante, formatTamano } from "../../lib/comprobantesStorage";

/*
 * Lista de comprobantes adjuntos a UN documento de deuda + zona de subida.
 * Se monta dentro de cada tarjeta de documento en PanelDetalleAcreedor.
 *
 * Props:
 *  - empresaId, documentoId: para saber dónde subir/guardar
 *  - comprobantes: array actual (viene del documento ya cargado en memoria)
 *  - onCambio(nuevoArrayComprobantes): se llama tras subir/eliminar para que
 *    el padre actualice su estado local sin tener que recargar todo Firestore
 */

const ICONOS_TIPO = {
  "application/pdf": "📄",
  "image/png": "🖼️",
  "image/jpeg": "🖼️",
  "image/webp": "🖼️",
};

export default function ComprobantesUploader({ empresaId, documentoId, comprobantes = [], onCambio }) {
  const inputRef = useRef(null);
  const [subiendo, setSubiendo] = useState(false);
  const [progreso, setProgreso] = useState(0);
  const [error, setError] = useState(null);
  const [eliminandoPath, setEliminandoPath] = useState(null);

  async function handleArchivos(e) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setError(null);

    let listaActual = [...comprobantes];

    for (const file of files) {
      setSubiendo(true);
      setProgreso(0);
      const resultado = await subirComprobante({
        empresaId,
        documentoId,
        file,
        usuarioEmail: auth.currentUser?.email,
        onProgress: setProgreso,
      });
      setSubiendo(false);

      if (!resultado.ok) {
        setError(resultado.error);
        continue;
      }
      listaActual = [...listaActual, resultado.comprobante];
      onCambio?.(listaActual);
    }

    if (inputRef.current) inputRef.current.value = "";
  }

  async function handleEliminar(comprobante) {
    setEliminandoPath(comprobante.path);
    setError(null);
    const resultado = await eliminarComprobante({ empresaId, documentoId, comprobante });
    setEliminandoPath(null);
    if (!resultado.ok) {
      setError(resultado.error);
      return;
    }
    onCambio?.(comprobantes.filter(c => c.path !== comprobante.path));
  }

  return (
    <div className="mt-2 pt-2 border-t border-slate-100">
      {comprobantes.length > 0 && (
        <div className="space-y-1 mb-2">
          {comprobantes.map((c) => (
            <div key={c.path} className="flex items-center gap-2 bg-slate-50 rounded-lg px-2 py-1.5">
              <span className="text-sm flex-shrink-0">{ICONOS_TIPO[c.tipo] || "📎"}</span>
              <a
                href={c.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 min-w-0 text-[11px] font-semibold text-purple-700 hover:underline truncate"
                title={c.nombre}
              >
                {c.nombre}
              </a>
              <span className="text-[10px] text-slate-400 flex-shrink-0">{formatTamano(c.tamano)}</span>
              <button
                onClick={() => handleEliminar(c)}
                disabled={eliminandoPath === c.path}
                className="w-5 h-5 rounded-md hover:bg-red-100 text-slate-400 hover:text-red-600 flex items-center justify-center flex-shrink-0 transition-colors disabled:opacity-50"
                title="Eliminar"
              >
                {eliminandoPath === c.path ? (
                  <div className="w-2.5 h-2.5 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                )}
              </button>
            </div>
          ))}
        </div>
      )}

      <label className="flex items-center justify-center gap-1.5 py-1.5 rounded-lg border border-dashed border-slate-300 hover:border-purple-400 hover:bg-purple-50/40 cursor-pointer transition-colors text-[11px] font-bold text-slate-500">
        {subiendo ? (
          <>
            <div className="w-3 h-3 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
            Subiendo... {progreso}%
          </>
        ) : (
          <>
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Adjuntar comprobante
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.png,.jpg,.jpeg,.webp"
          multiple
          className="hidden"
          disabled={subiendo}
          onChange={handleArchivos}
        />
      </label>

      {error && <p className="text-[10px] text-red-600 font-bold mt-1">{error}</p>}
    </div>
  );
}
