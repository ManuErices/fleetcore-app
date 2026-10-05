import React, { useState, useMemo, useRef, useId } from "react";
import { MEDIOS_PAGO, normalizarRut } from "../../lib/proveedores";
import ModalProveedor from "./ModalProveedor";
import { Boton, IconoBuscar, IconoMas } from "./cuaderno";

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

const MEDIO_LABEL = Object.fromEntries(MEDIOS_PAGO.map(m => [m.id, m.label.toLowerCase()]));

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

  const modalCrear = creando && (
    <ModalProveedor empresaId={empresaId} nombreInicial={q.trim() || nombreSugerido}
      onGuardado={elegir} onClose={() => setCreando(false)} />
  );

  // ── Proveedor ya vinculado ────────────────────────────────────────────────
  if (seleccionado && !buscando) {
    return (
      <>
        <div className="flex items-center gap-3 min-h-[44px] border-b-[1.5px] border-cuaderno-tinta/70">
          <div className="min-w-0 flex-1 py-1">
            <p className="m-0 text-[18px] leading-tight truncate">{seleccionado.razonSocial}</p>
            <p className="m-0 text-[13px] text-cuaderno-grafito truncate">
              {seleccionado.rut || "sin RUT"}, {MEDIO_LABEL[seleccionado.medioPago] || "sin medio de pago"}
            </p>
          </div>
          <Boton variante="texto" className="text-[15px]"
            onClick={() => { setBuscando(true); setTimeout(() => inputRef.current?.focus(), 0); }}>
            Cambiar
          </Boton>
          <Boton variante="texto" className="text-[15px] text-cuaderno-grafito hover:text-cuaderno-roja" onClick={() => onChange("")}>
            Quitar
          </Boton>
        </div>
        {modalCrear}
      </>
    );
  }

  // ── Buscador ──────────────────────────────────────────────────────────────
  return (
    <div className="relative">
      <div className="relative">
        <IconoBuscar tamano={15} className="absolute left-1 top-1/2 -translate-y-1/2 text-cuaderno-grafito pointer-events-none" />
        <input ref={inputRef} value={q} autoFocus={autoFocus}
          role="combobox" aria-expanded={abierto} aria-controls={listaId} aria-autocomplete="list"
          aria-label="Buscar proveedor por nombre o RUT"
          onChange={e => { setQ(e.target.value); setAbierto(true); setActivo(0); }}
          onFocus={() => setAbierto(true)}
          onBlur={() => setTimeout(() => setAbierto(false), 120)}
          onKeyDown={onKeyDown}
          placeholder="Buscar por nombre o RUT"
          className="w-full min-h-[40px] pl-7 pr-20 bg-transparent border-0 border-b-[1.5px] border-cuaderno-tinta/70 focus:border-cuaderno-tinta text-[18px] text-cuaderno-tinta focus:outline-none" />
        {value && (
          <Boton variante="texto" className="absolute right-0 top-1/2 -translate-y-1/2 min-h-0 text-[15px] text-cuaderno-grafito"
            onClick={() => { setBuscando(false); setQ(""); }}>
            Cancelar
          </Boton>
        )}
      </div>

      {abierto && (
        <ul id={listaId} role="listbox"
          className="absolute z-10 left-0 right-0 mt-1 m-0 p-0 list-none bg-cuaderno-tarjeta border border-cuaderno-columna rounded-md overflow-hidden max-h-64 overflow-y-auto shadow-[0_12px_28px_-12px_rgb(var(--cuaderno-tinta)/0.4)]"
          onMouseDown={e => e.preventDefault()}>
          {resultados.map((p, i) => (
            <li key={p.id} role="option" aria-selected={i === activo}
              onMouseEnter={() => setActivo(i)}
              onClick={() => elegir(p.id)}
              className={`px-4 py-2 cursor-pointer border-b border-cuaderno-azul ${i === activo ? "bg-cuaderno-hoja" : ""}`}>
              <p className="m-0 text-[17px] leading-tight truncate">{p.razonSocial}</p>
              <p className="m-0 text-[13px] text-cuaderno-grafito truncate">
                {[p.rut || "sin RUT", MEDIO_LABEL[p.medioPago]].filter(Boolean).join(", ")}
              </p>
            </li>
          ))}
          {resultados.length === 0 && q.trim() && (
            <li className="px-4 py-2.5 text-[15px] text-cuaderno-grafito border-b border-cuaderno-azul">Ningún proveedor coincide con «{q.trim()}»</li>
          )}
          <li role="option" aria-selected={activo === resultados.length}
            onMouseEnter={() => setActivo(resultados.length)}
            onClick={() => { setAbierto(false); setCreando(true); }}
            className={`px-4 py-2.5 cursor-pointer flex items-center gap-2 text-[17px] text-cuaderno-tinta ${
              activo === resultados.length ? "bg-cuaderno-hoja" : ""}`}>
            <IconoMas tamano={14} />
            <span className="truncate underline decoration-cuaderno-columna underline-offset-[3px]">
              {q.trim() ? `Crear «${q.trim()}»` : "Crear proveedor"}
            </span>
          </li>
        </ul>
      )}

      {modalCrear}
    </div>
  );
}
