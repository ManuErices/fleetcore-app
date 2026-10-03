import React, { useState, useMemo, useRef, useId } from "react";
import { MEDIOS_PAGO, normalizarRut } from "../../lib/proveedores";
import ModalProveedor from "./ModalProveedor";

/*
 * Buscador de proveedores del maestro, con opción de crear uno nuevo sin
 * salir de donde estás. Se usa en ModalCuenta y en el panel de detalle.
 *
 * Props:
 *  - empresaId
 *  - proveedores: lista en vivo del maestro
 *  - value: proveedorId seleccionado ("" si ninguno)
 *  - onChange(id): id elegido o "" al quitar
 *  - nombreSugerido: prellenado al crear si el buscador está vacío
 *  - autoFocus
 */

const MEDIO_LABEL = Object.fromEntries(MEDIOS_PAGO.map(m => [m.id, m.label]));

function normalizarTexto(s) {
  return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export default function SelectorProveedor({ empresaId, proveedores, value, onChange, nombreSugerido = "", autoFocus = false }) {
  const [buscando, setBuscando] = useState(!value);
  const [q, setQ] = useState("");
  const [abierto, setAbierto] = useState(false);
  const [activo, setActivo] = useState(0);
  const [creando, setCreando] = useState(false);
  const inputRef = useRef(null);
  const listaId = useId();

  const seleccionado = proveedores.find(p => p.id === value) || null;

  const resultados = useMemo(() => {
    const texto = normalizarTexto(q.trim());
    const rut = normalizarRut(q);
    const lista = !texto ? proveedores : proveedores.filter(p =>
      normalizarTexto(p.razonSocial).includes(texto) ||
      (rut.length >= 3 && (p.rutNormalizado || "").includes(rut))
    );
    return lista.slice(0, 8);
  }, [proveedores, q]);

  // Opciones navegables: resultados + "crear" al final
  const totalOpciones = resultados.length + 1;

  function elegir(id) {
    onChange(id);
    setQ("");
    setAbierto(false);
    setBuscando(false);
  }

  function onKeyDown(e) {
    if (e.key === "ArrowDown") { e.preventDefault(); setAbierto(true); setActivo(a => (a + 1) % totalOpciones); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setAbierto(true); setActivo(a => (a - 1 + totalOpciones) % totalOpciones); }
    else if (e.key === "Enter" && abierto) {
      e.preventDefault();
      if (activo < resultados.length) elegir(resultados[activo].id);
      else { setAbierto(false); setCreando(true); }
    }
    else if (e.key === "Escape" && (abierto || q)) {
      // Que el Escape cierre la lista, no el panel o modal que la contiene
      e.stopPropagation();
      setAbierto(false);
      if (!abierto) setQ("");
      if (value && !abierto) setBuscando(false);
    }
  }

  // ── Proveedor ya vinculado ────────────────────────────────────────────────
  if (seleccionado && !buscando) {
    return (
      <>
        <div className="flex items-center gap-3 px-3.5 py-2.5 border border-slate-200 rounded-xl bg-slate-50/60">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-800 truncate">{seleccionado.razonSocial}</p>
            <p className="text-[11px] text-slate-400 truncate">
              {[seleccionado.rut || "Sin RUT", MEDIO_LABEL[seleccionado.medioPago] || "Sin medio de pago"].join(" · ")}
            </p>
          </div>
          <button type="button" onClick={() => { setBuscando(true); setTimeout(() => inputRef.current?.focus(), 0); }}
            className="text-xs font-semibold text-purple-700 hover:text-purple-800 flex-shrink-0">
            Cambiar
          </button>
          <button type="button" onClick={() => onChange("")}
            className="text-xs font-semibold text-slate-400 hover:text-red-600 flex-shrink-0">
            Quitar
          </button>
        </div>
        {creando && (
          <ModalProveedor empresaId={empresaId} nombreInicial={q.trim() || nombreSugerido}
            onGuardado={elegir} onClose={() => setCreando(false)} />
        )}
      </>
    );
  }

  // ── Buscador ──────────────────────────────────────────────────────────────
  return (
    <div className="relative">
      <div className="relative">
        <svg className="w-3.5 h-3.5 text-slate-300 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0" />
        </svg>
        <input ref={inputRef} value={q} autoFocus={autoFocus}
          role="combobox" aria-expanded={abierto} aria-controls={listaId} aria-autocomplete="list"
          onChange={e => { setQ(e.target.value); setAbierto(true); setActivo(0); }}
          onFocus={() => setAbierto(true)}
          onBlur={() => setTimeout(() => setAbierto(false), 120)}
          onKeyDown={onKeyDown}
          placeholder="Buscar por nombre o RUT"
          className="w-full pl-8 pr-16 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-100 transition-all placeholder:text-slate-300" />
        {value && (
          <button type="button" onClick={() => { setBuscando(false); setQ(""); }}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] font-semibold text-slate-400 hover:text-slate-600">
            Cancelar
          </button>
        )}
      </div>

      {abierto && (
        <ul id={listaId} role="listbox"
          className="absolute z-10 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden max-h-64 overflow-y-auto"
          onMouseDown={e => e.preventDefault()}>
          {resultados.map((p, i) => (
            <li key={p.id} role="option" aria-selected={i === activo}
              onMouseEnter={() => setActivo(i)}
              onClick={() => elegir(p.id)}
              className={`px-3.5 py-2 cursor-pointer ${i === activo ? "bg-purple-50" : ""}`}>
              <p className="text-sm font-medium text-slate-800 truncate">{p.razonSocial}</p>
              <p className="text-[11px] text-slate-400 truncate">
                {[p.rut || "Sin RUT", MEDIO_LABEL[p.medioPago]].filter(Boolean).join(" · ")}
              </p>
            </li>
          ))}
          {resultados.length === 0 && q.trim() && (
            <li className="px-3.5 py-2 text-xs text-slate-400">Ningún proveedor coincide con «{q.trim()}»</li>
          )}
          <li role="option" aria-selected={activo === resultados.length}
            onMouseEnter={() => setActivo(resultados.length)}
            onClick={() => { setAbierto(false); setCreando(true); }}
            className={`px-3.5 py-2.5 cursor-pointer border-t border-slate-100 flex items-center gap-2 text-sm font-semibold text-purple-700 ${
              activo === resultados.length ? "bg-purple-50" : ""}`}>
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
            <span className="truncate">{q.trim() ? `Crear «${q.trim()}»` : "Crear proveedor"}</span>
          </li>
        </ul>
      )}

      {creando && (
        <ModalProveedor empresaId={empresaId} nombreInicial={q.trim() || nombreSugerido}
          onGuardado={elegir} onClose={() => setCreando(false)} />
      )}
    </div>
  );
}
