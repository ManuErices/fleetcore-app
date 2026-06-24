import React, { useState } from "react";
import { collection, query, where, orderBy, getDocs } from "firebase/firestore";
import { db } from "../../lib/firebase";

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
      setError("No se pudo cargar el historial.");
    }
    setCargando(false);
  }

  return (
    <div className="mt-1.5">
      <button
        onClick={toggle}
        className="flex items-center gap-1 text-[10px] font-bold text-slate-400 hover:text-purple-600 transition-colors"
      >
        <svg className={`w-3 h-3 transition-transform ${abierto ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
        </svg>
        Historial de cambios
      </button>

      {abierto && (
        <div className="mt-1.5 pl-2 border-l-2 border-slate-100 space-y-1.5">
          {cargando && (
            <p className="text-[10px] text-slate-400">Cargando...</p>
          )}
          {error && (
            <p className="text-[10px] text-red-500 font-bold">{error}</p>
          )}
          {entradas && entradas.length === 0 && (
            <p className="text-[10px] text-slate-400 italic">Sin cambios registrados aún.</p>
          )}
          {entradas && entradas.map((e) => (
            <div key={e.id} className="text-[10px] text-slate-500">
              <span className="font-bold text-slate-600">{ETIQUETA_ACCION[e.accion] || e.accion}</span>
              {e.campo && ETIQUETA_CAMPO[e.campo] && (
                <span> — {ETIQUETA_CAMPO[e.campo]}: {formatValor(e.valorAnterior)} → {formatValor(e.valorNuevo)}</span>
              )}
              {e.campo && !ETIQUETA_CAMPO[e.campo] && e.accion !== "adjuntar_comprobante" && e.accion !== "eliminar_comprobante" && (
                <span> — {e.campo}: {formatValor(e.valorAnterior)} → {formatValor(e.valorNuevo)}</span>
              )}
              {(e.accion === "adjuntar_comprobante" || e.accion === "eliminar_comprobante") && (
                <span> — {e.valorNuevo || e.valorAnterior}</span>
              )}
              <div className="text-slate-400">
                {e.usuarioEmail} · {formatFechaHora(e.fecha)}{e.origen === "importador" && " · vía importador"}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
