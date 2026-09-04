import React, { useState } from "react";

// ============================================================
// Piezas de interfaz compartidas por las pantallas de MPF Rental.
// Un solo lugar para que Clientes, Cotizaciones, Contratos y
// Estados de pago se vean y se comporten igual.
// ============================================================

const TONOS_KPI = {
  slate: "text-slate-900",
  amber: "text-amber-600",
  red: "text-red-600",
  emerald: "text-emerald-600",
  blue: "text-blue-600",
};

export function Kpi({ label, valor, tono = "slate", compacto, pie }) {
  return (
    <div className={`bg-white border-2 border-slate-100 rounded-2xl ${compacto ? "p-3" : "p-4"}`}>
      <p className={`${compacto ? "text-base" : "text-xl"} font-black ${TONOS_KPI[tono]}`}>{valor}</p>
      <p className="text-xs font-semibold text-slate-500 mt-0.5">{label}</p>
      {pie && <p className="text-[11px] text-slate-400 mt-0.5">{pie}</p>}
    </div>
  );
}

export function Chip({ activo, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
        activo ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
      }`}
    >
      {children}
    </button>
  );
}

const TONOS_ETIQUETA = {
  slate: "bg-slate-100 text-slate-500 border-slate-200",
  blue: "bg-blue-100 text-blue-700 border-blue-200",
  amber: "bg-amber-100 text-amber-700 border-amber-200",
  red: "bg-red-100 text-red-700 border-red-200",
  emerald: "bg-emerald-100 text-emerald-700 border-emerald-200",
};

export function Etiqueta({ tono = "slate", children }) {
  return (
    <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full border whitespace-nowrap ${TONOS_ETIQUETA[tono]}`}>
      {children}
    </span>
  );
}

// Badge de estado a partir de los diccionarios ESTADOS_* de lib/rental.
export function Badge({ estado }) {
  if (!estado) return null;
  return (
    <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full border whitespace-nowrap ${estado.color}`}>
      {estado.label}
    </span>
  );
}

export function Aviso({ tono = "error", children }) {
  const clases = {
    error: "bg-red-50 border-red-200 text-red-700",
    alerta: "bg-amber-50 border-amber-200 text-amber-800",
    info: "bg-blue-50 border-blue-200 text-blue-800",
    ok: "bg-emerald-50 border-emerald-200 text-emerald-800",
  }[tono];
  return <div className={`border text-sm font-semibold rounded-xl p-3 ${clases}`}>{children}</div>;
}

export function Estado({ children }) {
  return <div className="text-center py-12 text-slate-400 font-semibold">{children}</div>;
}

export function Dato({ label, valor, extra }) {
  return (
    <div>
      <p className="text-xs font-bold text-slate-400 uppercase">{label}</p>
      <p className="text-slate-800 font-semibold break-words">{valor || "—"}</p>
      {extra && <p className="text-xs text-slate-400">{extra}</p>}
    </div>
  );
}

export function Seccion({ titulo, children, columnas = 2 }) {
  return (
    <div>
      {titulo && <p className="text-xs font-black text-slate-400 uppercase mb-2">{titulo}</p>}
      <div className={`grid gap-3 ${columnas === 1 ? "grid-cols-1" : "grid-cols-2"}`}>{children}</div>
    </div>
  );
}

export function Campo({ label, value, onChange, onBlur, type = "text", full, error, ayuda, placeholder, disabled, min, step }) {
  return (
    <div className={full ? "col-span-2" : ""}>
      {label && <label className="text-xs font-bold text-slate-500 uppercase">{label}</label>}
      <input
        type={type}
        value={value ?? ""}
        min={min}
        step={step}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        className={`w-full border-2 rounded-xl p-2.5 text-sm mt-1 outline-none transition-colors disabled:bg-slate-50 disabled:text-slate-400 ${
          error ? "border-red-300 focus:border-red-500" : "border-slate-200 focus:border-slate-400"
        }`}
      />
      {error && <p className="text-xs font-semibold text-red-600 mt-1">{error}</p>}
      {!error && ayuda && <p className="text-xs text-slate-400 mt-1">{ayuda}</p>}
    </div>
  );
}

export function Selector({ label, value, onChange, opciones, full, placeholder = "Seleccionar...", disabled, ayuda }) {
  return (
    <div className={full ? "col-span-2" : ""}>
      {label && <label className="text-xs font-bold text-slate-500 uppercase">{label}</label>}
      <select
        value={value ?? ""}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border-2 border-slate-200 focus:border-slate-400 outline-none rounded-xl p-2.5 text-sm mt-1 bg-white transition-colors disabled:bg-slate-50 disabled:text-slate-400"
      >
        <option value="">{placeholder}</option>
        {opciones.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      {ayuda && <p className="text-xs text-slate-400 mt-1">{ayuda}</p>}
    </div>
  );
}

export function AreaTexto({ label, value, onChange, rows = 3, full = true, disabled }) {
  return (
    <div className={full ? "col-span-2" : ""}>
      {label && <label className="text-xs font-bold text-slate-500 uppercase">{label}</label>}
      <textarea
        rows={rows}
        value={value ?? ""}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border-2 border-slate-200 focus:border-slate-400 outline-none rounded-xl p-3 text-sm mt-1 transition-colors disabled:bg-slate-50"
      />
    </div>
  );
}

// Modal centrado con cabecera fija y barra de acciones al pie.
export function Modal({ titulo, subtitulo, onClose, children, acciones, ancho = "max-w-2xl" }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className={`bg-white rounded-2xl shadow-2xl w-full ${ancho} max-h-[90vh] flex flex-col`}>
        <div className="border-b border-slate-100 px-6 py-4 flex items-start justify-between gap-3 shrink-0">
          <div>
            <h3 className="text-lg font-black text-slate-900">{titulo}</h3>
            {subtitulo && <p className="text-sm text-slate-500 mt-0.5">{subtitulo}</p>}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-2xl leading-none">&times;</button>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto">{children}</div>

        {acciones && (
          <div className="border-t border-slate-100 px-6 py-4 flex gap-3 shrink-0">{acciones}</div>
        )}
      </div>
    </div>
  );
}

// Panel lateral para fichas de detalle.
export function Panel({ onClose, children, ancho = "max-w-2xl" }) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className={`relative w-full ${ancho} bg-slate-50 h-full overflow-y-auto shadow-2xl`}>{children}</div>
    </div>
  );
}

export function BotonPrimario({ onClick, disabled, children, className = "" }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`py-2.5 px-4 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-sm disabled:opacity-50 transition-colors ${className}`}
    >
      {children}
    </button>
  );
}

export function BotonSecundario({ onClick, disabled, children, className = "" }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`py-2.5 px-4 rounded-xl border-2 border-slate-200 text-slate-600 hover:border-slate-300 font-bold text-sm disabled:opacity-50 transition-colors ${className}`}
    >
      {children}
    </button>
  );
}

// ============================================================
// Adjuntos — subir, ver y quitar respaldos
// ============================================================
export function Adjuntos({ archivos = [], onSubir, onQuitar, categorias, categoriaFija, disabled, titulo = "Respaldos", vacio = "Sin archivos aún." }) {
  const [categoria, setCategoria] = useState(categoriaFija || (categorias ? Object.keys(categorias)[0] : "otro"));
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState("");

  const subir = async (file) => {
    if (!file) return;
    setSubiendo(true);
    setError("");
    try {
      await onSubir(file, categoriaFija || categoria);
    } catch (e) {
      setError(e.message || "No se pudo subir el archivo");
    } finally {
      setSubiendo(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-2">
        <p className="text-xs font-black text-slate-400 uppercase">{titulo}</p>
        {!disabled && (
          <div className="flex items-center gap-2">
            {categorias && !categoriaFija && (
              <select
                value={categoria}
                onChange={(e) => setCategoria(e.target.value)}
                className="border-2 border-slate-200 rounded-lg px-2 py-1 text-xs font-semibold bg-white"
              >
                {Object.entries(categorias).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            )}
            <label className="text-xs font-bold text-red-600 hover:text-red-700 cursor-pointer whitespace-nowrap">
              {subiendo ? "Subiendo..." : "+ Subir archivo"}
              <input
                type="file"
                accept="application/pdf,image/*"
                className="hidden"
                disabled={subiendo}
                onChange={(e) => { subir(e.target.files?.[0]); e.target.value = ""; }}
              />
            </label>
          </div>
        )}
      </div>

      {error && <p className="text-xs font-semibold text-red-600 mb-2">{error}</p>}

      {archivos.length === 0 ? (
        <p className="text-xs text-slate-400">{vacio}</p>
      ) : (
        <div className="space-y-1.5">
          {archivos.map((a) => (
            <div key={a.path} className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2">
              <div className="min-w-0 flex-1">
                <a
                  href={a.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-semibold text-slate-800 hover:text-red-600 truncate block"
                >
                  {a.nombre}
                </a>
                <p className="text-[11px] text-slate-400">
                  {[
                    categorias?.[a.categoria] || a.categoria,
                    a.tamano ? `${(a.tamano / 1024 / 1024).toFixed(1)} MB` : null,
                    a.subidoEn ? fmtFecha(a.subidoEn) : null,
                  ].filter(Boolean).join(" · ")}
                </p>
              </div>
              {!disabled && onQuitar && (
                <button
                  onClick={() => onQuitar(a)}
                  className="text-slate-300 hover:text-red-600 text-lg leading-none px-1"
                  title="Quitar archivo"
                >
                  &times;
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Utilidades de formato
// ============================================================

// Formatea sin corrimiento de zona horaria.
export function fmtFecha(valor) {
  if (!valor) return "";
  const s = String(valor).slice(0, 10);
  const [y, m, d] = s.split("-").map(Number);
  if (!y) return "";
  return new Date(y, (m || 1) - 1, d || 1).toLocaleDateString("es-CL");
}

export function fmtPeriodo(periodo) {
  if (!periodo) return "";
  const [y, m] = String(periodo).split("-").map(Number);
  if (!y || !m) return periodo;
  const nombre = new Date(y, m - 1, 1).toLocaleDateString("es-CL", { month: "long", year: "numeric" });
  return nombre.charAt(0).toUpperCase() + nombre.slice(1);
}

// Barra de consumo para saldos de OC y contratos.
export function BarraConsumo({ pct }) {
  const p = Math.min(100, Math.max(0, Number(pct) || 0));
  const color = p >= 100 ? "bg-red-500" : p >= 90 ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
      <div className={`h-full ${color} transition-all`} style={{ width: `${p}%` }} />
    </div>
  );
}
