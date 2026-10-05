import React, { useState, useRef } from "react";
import { auth } from "../../lib/firebase";
import { subirComprobante, eliminarComprobante, formatTamano } from "../../lib/comprobantesStorage";
import { IconoDocumento, IconoCerrar, IconoMas } from "./cuaderno";

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

// Tipo de archivo escrito, en vez de un emoji
const TIPO_ARCHIVO = {
  "application/pdf": "PDF",
  "image/png": "imagen",
  "image/jpeg": "imagen",
  "image/webp": "imagen",
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
    <div className="mt-2 pt-2 border-t border-dashed border-cuaderno-azul">
      {comprobantes.length > 0 && (
        <ul className="m-0 p-0 list-none mb-2">
          {comprobantes.map((c) => (
            <li key={c.path} className="flex items-center gap-2 min-h-[40px] border-b border-cuaderno-azul/70">
              <IconoDocumento tamano={15} className="text-cuaderno-grafito" />
              <a
                href={c.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 min-w-0 text-[15px] text-cuaderno-tinta underline decoration-cuaderno-azul underline-offset-4 hover:decoration-cuaderno-tinta truncate"
                title={c.nombre}
              >
                {c.nombre}
              </a>
              <span className="text-[13px] text-cuaderno-grafito flex-shrink-0">{TIPO_ARCHIVO[c.tipo] || "archivo"}, {formatTamano(c.tamano)}</span>
              <button
                onClick={() => handleEliminar(c)}
                disabled={eliminandoPath === c.path}
                aria-label={`Quitar ${c.nombre}`}
                title="Quitar comprobante"
                className="w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0 text-cuaderno-grafito hover:text-cuaderno-roja hover:bg-cuaderno-rosa/40 disabled:opacity-50"
              >
                {eliminandoPath === c.path
                  ? <span className="text-[12px]">…</span>
                  : <IconoCerrar tamano={13} />}
              </button>
            </li>
          ))}
        </ul>
      )}

      <label className="flex items-center justify-center gap-2 min-h-[40px] rounded-md border-[1.5px] border-dashed border-cuaderno-columna hover:border-cuaderno-tinta hover:bg-cuaderno-hoja cursor-pointer text-[15px] text-cuaderno-tinta focus-within:ring-2 focus-within:ring-cuaderno-tinta/40">
        {subiendo ? (
          <span className="text-cuaderno-grafito">Subiendo… {progreso}%</span>
        ) : (
          <>
            <IconoMas tamano={13} />
            Adjuntar comprobante
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.png,.jpg,.jpeg,.webp"
          multiple
          className="sr-only"
          disabled={subiendo}
          onChange={handleArchivos}
        />
      </label>

      {error && <p className="m-0 mt-1 text-[14px] text-cuaderno-roja">{error}</p>}
    </div>
  );
}
