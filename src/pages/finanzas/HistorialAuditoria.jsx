import React, { useState } from "react";
import { collection, query, where, orderBy, getDocs } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { IconoSiguiente } from "./cuaderno";

/*
 * Historial de auditoría de UN documento. Colapsado por defecto — solo
 * consulta Firestore cuando el usuario lo abre, para no disparar una
 * query extra por cada documento renderizado en el panel de detalle
 * (que puede tener decenas de documentos a la vez).
 */

const ETIQUETA_ACCION = {
  crear: "Creado",
  actualizar: "Actualizado",
  eliminar: "Eliminado",
  adjuntar_comprobante: "Comprobante adjuntado",
  eliminar_comprobante: "Comprobante eliminado",
};

const ETIQUETA_CAMPO = {
  saldoPendiente: "Saldo pendiente",
  estado: "Estado",
  diasMora: "Días de mora",
  valorDoc: "Valor documento",
  montoPagado: "Monto pagado",
  fechaVencimiento: "Fecha de vencimiento",
  cuotas: "Cuotas",
};

function formatValor(v) {
  if (v === null || v === undefined) return "—";
  if (typeof v === "number") return v.toLocaleString("es-CL");
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function formatFechaHora(iso) {
  try {
    return new Date(iso).toLocaleString("es-CL", {
      day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso; }
}

export default function HistorialAuditoria({ empresaId, documentoId }) {
  const [abierto, setAbierto] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [entradas, setEntradas] = useState(null); // null = aún no cargado
  const [error, setError] = useState(null);

  async function toggle() {
    if (abierto) { setAbierto(false); return; }
    setAbierto(true);
    if (entradas !== null) return; // ya se cargó antes, no repetir query

    setCargando(true);
    setError(null);
    try {
      const q = query(
        collection(db, "empresas", empresaId, "deuda_auditoria"),
        where("documentoId", "==", documentoId),
        orderBy("fecha", "desc")
      );
      const snap = await getDocs(q);
      setEntradas(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error("Error cargando historial de auditoría:", err);
      setError("No se pudo cargar el historial. Intenta abrirlo de nuevo.");
    }
    setCargando(false);
  }

  return (
    <div className="mt-1">
      <button
        onClick={toggle}
        aria-expanded={abierto}
        className="min-h-[36px] flex items-center gap-1 text-[15px] text-cuaderno-grafito hover:text-cuaderno-tinta"
      >
        <IconoSiguiente tamano={13} className={`transition-transform ${abierto ? "rotate-90" : ""}`} />
        Historial de cambios
      </button>

      {abierto && (
        <div className="ml-1.5 pl-3 border-l border-cuaderno-columna space-y-2 pb-1">
          {cargando && <p className="m-0 text-[14px] text-cuaderno-grafito">Buscando en el historial…</p>}
          {error && <p className="m-0 text-[14px] text-cuaderno-roja">{error}</p>}
          {entradas && entradas.length === 0 && (
            <p className="m-0 text-[14px] text-cuaderno-grafito">Sin cambios anotados todavía.</p>
          )}
          {entradas && entradas.map((e) => (
            <div key={e.id} className="text-[14px] leading-snug text-cuaderno-tinta">
              <span>{ETIQUETA_ACCION[e.accion] || e.accion}</span>
              {e.campo && ETIQUETA_CAMPO[e.campo] && (
                <span className="text-cuaderno-grafito">: {ETIQUETA_CAMPO[e.campo].toLowerCase()} de {formatValor(e.valorAnterior)} a {formatValor(e.valorNuevo)}</span>
              )}
              {e.campo && !ETIQUETA_CAMPO[e.campo] && e.accion !== "adjuntar_comprobante" && e.accion !== "eliminar_comprobante" && (
                <span className="text-cuaderno-grafito">: {e.campo} de {formatValor(e.valorAnterior)} a {formatValor(e.valorNuevo)}</span>
              )}
              {(e.accion === "adjuntar_comprobante" || e.accion === "eliminar_comprobante") && (
                <span className="text-cuaderno-grafito">: {e.valorNuevo || e.valorAnterior}</span>
              )}
              <div className="text-[13px] text-cuaderno-grafito">
                {e.usuarioEmail}, {formatFechaHora(e.fecha)}{e.origen === "importador" && ", desde el importador"}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
