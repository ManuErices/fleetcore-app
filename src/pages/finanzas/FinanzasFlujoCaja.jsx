import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { onSnapshot, collection, getDocs, addDoc, updateDoc, deleteDoc, doc, setDoc, getDoc, query, orderBy, serverTimestamp, writeBatch } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useEmpresa } from "../../lib/useEmpresa";
import { useFinanzas, ProyectoSelector } from "./FinanzasContext";
import { escucharProveedores } from "../../lib/proveedores";
import SelectorProveedor from "./SelectorProveedor";
import PanelDetalleCuenta from "./PanelDetalleCuenta";
import {
  Cifra, Titulo, Resaltado, Nota, LineaGuia, Boton, Campo, VistoBueno,
  ModalCuaderno, Segmentado, Casilla,
  IconoBajar, IconoMas, IconoLapiz, IconoBorrar, IconoNota,
  casoOracion, casoTitulo,
} from "./cuaderno";

// ─── Diseño ─────────────────────────────────────────────────────────────────
// Tema cuaderno: ver cuaderno.jsx y el bloque TEMA CUADERNO de index.css.
// Toda cifra pasa por <Cifra>; los colores salen de los tokens cuaderno-*.

// ─── Utilidades ─────────────────────────────────────────────────────────────
const MESES      = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
const MESES_FULL = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
// Subcategorías por defecto (solo si Firestore está vacío)
const SUBCATS_EGRESO_DEFAULT  = ["REMUNERACIONES","AUTOMOTRIZ","OPERACIONAL","FINANCIERO","ADMINISTRATIVO","OTRO"];
const SUBCATS_INGRESO_DEFAULT = ["VENTAS","CONTRATOS","ANTICIPOS","OTRO"];

// Hook para cargar/gestionar subcategorías desde Firestore
function useSubcategorias(empresaId) {
  const [subcatsEgreso,  setSubcatsEgreso]  = useState(SUBCATS_EGRESO_DEFAULT);
  const [subcatsIngreso, setSubcatsIngreso] = useState(SUBCATS_INGRESO_DEFAULT);

  useEffect(() => {
    if (!empresaId) return;
    const ref = doc(db, 'empresas', empresaId, 'flujo_config', 'subcategorias');
    const unsub = onSnapshot(ref, snap => {
      if (snap.exists()) {
        const data = snap.data();
        if (data.egreso?.length)  setSubcatsEgreso(data.egreso);
        if (data.ingreso?.length) setSubcatsIngreso(data.ingreso);
      }
    });
    return unsub;
  }, [empresaId]);

  const agregarSubcat = async (tipo, nombre) => {
    const val = nombre.trim().toUpperCase();
    if (!val) return;
    const ref = doc(db, 'empresas', empresaId, 'flujo_config', 'subcategorias');
    const snap = await getDoc(ref);
    const actual = snap.exists() ? snap.data() : { egreso: SUBCATS_EGRESO_DEFAULT, ingreso: SUBCATS_INGRESO_DEFAULT };
    const lista = actual[tipo] || [];
    if (lista.includes(val)) return;
    await setDoc(ref, { ...actual, [tipo]: [...lista, val] }, { merge: true });
  };

  const eliminarSubcat = async (tipo, nombre) => {
    const ref = doc(db, 'empresas', empresaId, 'flujo_config', 'subcategorias');
    const snap = await getDoc(ref);
    if (!snap.exists()) return;
    const actual = snap.data();
    const lista = (actual[tipo] || []).filter(s => s !== nombre);
    await setDoc(ref, { ...actual, [tipo]: lista }, { merge: true });
  };

  return { subcatsEgreso, subcatsIngreso, agregarSubcat, eliminarSubcat };
}

function fmtCLP(n) {
  if (!n && n !== 0) return "";
  const abs = Math.abs(Math.round(n));
  return (n < 0 ? "-$" : "$") + abs.toLocaleString("es-CL");
}
function fmtInput(val) {
  const nums = val.toString().replace(/\D/g, "");
  return nums ? parseInt(nums).toLocaleString("es-CL") : "";
}
function parseInput(val) {
  const nums = val.toString().replace(/\D/g, "");
  return nums ? parseInt(nums) : 0;
}
function fmtCompact(n) {
  const a = Math.abs(n || 0);
  if (a >= 1e9) return (n < 0 ? "-$" : "$") + (a/1e9).toFixed(1).replace(".",",") + "B";
  if (a >= 1e6) return (n < 0 ? "-$" : "$") + (a/1e6).toFixed(1).replace(".",",") + "M";
  if (a >= 1e3) return (n < 0 ? "-$" : "$") + (a/1e3).toFixed(0) + "K";
  return fmtCLP(n);
}

function getWeekColumns() {
  const cols = [], seen = new Set();
  const today = new Date();
  let wNum = 1;
  const months = [
    new Date(today.getFullYear(), today.getMonth(),     1), // mes actual   → monthIndex 0
    new Date(today.getFullYear(), today.getMonth() + 1, 1),  // mes siguiente → monthIndex 1
  ];
  months.forEach((monthDate, monthIdx) => {
    const first = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
    const last  = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);
    const start = new Date(first);
    const dow = start.getDay();
    start.setDate(first.getDate() + (dow === 0 ? -6 : 1 - dow));
    start.setHours(0, 0, 0, 0);
    let cur = new Date(start);
    while (cur <= last) {
      const ws = new Date(cur);
      const we = new Date(ws); we.setDate(ws.getDate() + 6);
      const key = `${ws.getFullYear()}-${String(ws.getMonth()+1).padStart(2,"0")}-${String(ws.getDate()).padStart(2,"0")}`;
      if (!seen.has(key)) {
        seen.add(key);
        // Comparación inclusiva: la semana cubre desde ws 00:00 hasta el final del día de we
        const weEnd = new Date(we); weEnd.setHours(23, 59, 59, 999);
        const isCurrentWeek = today >= ws && today <= weEnd;
        cols.push({
          key, label: `S${wNum}`,
          monthLabel: MESES[monthDate.getMonth()],
          monthIndex: monthIdx,
          monthName: MESES_FULL[monthDate.getMonth()],
          startDate: ws, endDate: we,
          dateRange: `${ws.getDate()}/${ws.getMonth()+1}–${we.getDate()}/${we.getMonth()+1}`,
          isCurrentWeek,
        });
        wNum++;
      }
      cur.setDate(cur.getDate() + 7);
    }
  });
  return cols;
}

// ─── Modal: Nueva / Editar Cuenta ──────────────────────────────────────────
function ModalCuenta({ onSave, onClose, editando, proveedores = [] }) {
  const { empresaId } = useEmpresa();
  const { subcatsEgreso, subcatsIngreso, agregarSubcat, eliminarSubcat } = useSubcategorias(empresaId);
  const [form, setForm] = useState(editando || {
    categoria: "EGRESOS", nombre: "", subcategoria: "OPERACIONAL",
    detalle: "", proyectoId: "", cliente: "", presupuestoMensual: "",
    recurrente: false, frecuenciaRecurrente: "mensual", montoRecurrente: "",
    proveedorId: "",
  });
  const [nuevaSubcat, setNuevaSubcat] = useState("");
  const [errorNombre, setErrorNombre] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [errorGuardar, setErrorGuardar] = useState(null);

  const guardar = async () => {
    if (!form.nombre.trim()) { setErrorNombre(true); return; }
    setGuardando(true);
    setErrorGuardar(null);
    try {
      await onSave(form);
    } catch (e) {
      console.error("Error guardando cuenta:", e);
      setErrorGuardar("No se pudo guardar la cuenta. Revisa tu conexión e intenta de nuevo.");
      setGuardando(false);
    }
  };
  const [agregandoSubcat, setAgregandoSubcat] = useState(false);
  const [gestionandoSubcat, setGestionandoSubcat] = useState(false);
  const [editandoSubcat, setEditandoSubcat] = useState(null);
  const [valorEditSubcat, setValorEditSubcat] = useState("");
  const isIngreso = form.categoria === "INGRESOS";
  const subcats = isIngreso ? subcatsIngreso : subcatsEgreso;

  const handleAgregarSubcat = async () => {
    if (!nuevaSubcat.trim()) return;
    await agregarSubcat(isIngreso ? "ingreso" : "egreso", nuevaSubcat);
    setForm(f => ({...f, subcategoria: nuevaSubcat.trim().toUpperCase()}));
    setNuevaSubcat("");
    setAgregandoSubcat(false);
  };

  const handleEliminarSubcat = async (nombre) => {
    if (!window.confirm(`¿Eliminar subcategoría "${nombre}"?`)) return;
    await eliminarSubcat(isIngreso ? "ingreso" : "egreso", nombre);
    if (form.subcategoria === nombre) setForm(f => ({...f, subcategoria: subcats.find(s => s !== nombre) || ""}));
  };

  const handleGuardarEditSubcat = async (nombreOriginal) => {
    const nuevoNombre = valorEditSubcat.trim().toUpperCase();
    if (!nuevoNombre || nuevoNombre === nombreOriginal) { setEditandoSubcat(null); return; }
    const tipo = isIngreso ? "ingreso" : "egreso";
    // Agregar el nuevo y eliminar el viejo
    await agregarSubcat(tipo, nuevoNombre);
    await eliminarSubcat(tipo, nombreOriginal);
    if (form.subcategoria === nombreOriginal) setForm(f => ({...f, subcategoria: nuevoNombre}));
    setEditandoSubcat(null);
  };

  return (
    <ModalCuaderno
      titulo={editando ? "Editar cuenta" : "Nueva cuenta"}
      subtitulo="Qué es, cómo se agrupa y si se repite"
      onClose={onClose}
      bloqueado={guardando}
      pie={
        <div className="space-y-3">
          {errorGuardar && <Nota etiqueta="Ojo:">{errorGuardar}</Nota>}
          <div className="flex gap-2">
            <Boton className="flex-1" onClick={onClose} disabled={guardando}>Cancelar</Boton>
            <Boton variante="primario" className="flex-1" onClick={guardar} disabled={guardando}>
              {guardando ? "Guardando…" : editando ? "Guardar cambios" : "Crear cuenta"}
            </Boton>
          </div>
        </div>
      }>

      <Segmentado
        etiqueta="Tipo"
        opciones={[{ id: "INGRESOS", label: "Ingreso" }, { id: "EGRESOS", label: "Egreso" }]}
        valor={form.categoria}
        onCambiar={id => setForm(f => ({ ...f, categoria: id, subcategoria: id === "INGRESOS" ? "VENTAS" : "OPERACIONAL" }))}
      />

      <Campo
        etiqueta="Nombre"
        value={form.nombre}
        onChange={e => { setForm(f => ({...f, nombre: e.target.value.toUpperCase()})); if (errorNombre) setErrorNombre(false); }}
        placeholder="Ej: sueldo base, contrato cliente ABC"
        error={errorNombre ? "Escribe el nombre de la cuenta" : null}
      />

      {/* Proveedor — solo egresos. Los datos de pago y contacto viven en el maestro */}
      {!isIngreso && (
        <div>
          <div className="text-sm text-cuaderno-grafito mb-1">Proveedor o beneficiario</div>
          <SelectorProveedor empresaId={empresaId} proveedores={proveedores}
            value={form.proveedorId || ""}
            onChange={id => setForm(f => ({ ...f, proveedorId: id }))}
            nombreSugerido={casoTitulo(form.nombre)} />
          <p className="m-0 mt-1 text-[13px] text-cuaderno-grafito">Guarda cómo se le paga y a quién contactar. Es opcional.</p>
        </div>
      )}

      {/* Subcategoría */}
      <div>
        <div className="flex items-end justify-between gap-3">
          <Campo as="select" etiqueta="Subcategoría" className="flex-1"
            value={form.subcategoria} onChange={e => setForm(f => ({...f, subcategoria: e.target.value}))}>
            {subcats.map(s => <option key={s} value={s}>{casoOracion(s)}</option>)}
          </Campo>
          <div className="flex gap-3 flex-shrink-0">
            <Boton variante="texto" className="text-[16px]" onClick={() => { setAgregandoSubcat(v => !v); setGestionandoSubcat(false); }}>Nueva</Boton>
            <Boton variante="texto" className="text-[16px]" onClick={() => { setGestionandoSubcat(v => !v); setAgregandoSubcat(false); }}>Ordenar</Boton>
          </div>
        </div>

        {agregandoSubcat && (
          <div className="flex items-end gap-2 mt-3">
            <Campo etiqueta="Nombre de la subcategoría" className="flex-1" autoFocus
              value={nuevaSubcat} onChange={e => setNuevaSubcat(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === "Enter" && handleAgregarSubcat()}
              placeholder="Ej: subcontratos" />
            <Boton variante="primario" className="min-h-[40px] text-[16px]" onClick={handleAgregarSubcat}>Agregar</Boton>
            <Boton variante="texto" className="text-[16px]" onClick={() => { setAgregandoSubcat(false); setNuevaSubcat(""); }}>Cancelar</Boton>
          </div>
        )}

        {gestionandoSubcat && (
          <div className="mt-3 border border-cuaderno-azul rounded-md px-3 py-1">
            <div className="text-[14px] text-cuaderno-grafito pt-1.5 pb-1">
              {isIngreso ? "Subcategorías de ingreso" : "Subcategorías de egreso"}
            </div>
            {subcats.map(s => (
              <div key={s} className="flex items-center gap-2 min-h-[44px] border-t border-cuaderno-azul">
                {editandoSubcat === s ? (
                  <>
                    <input
                      value={valorEditSubcat}
                      onChange={e => setValorEditSubcat(e.target.value.toUpperCase())}
                      onKeyDown={e => {
                        if (e.key === 'Enter') handleGuardarEditSubcat(s);
                        if (e.key === 'Escape') setEditandoSubcat(null);
                      }}
                      aria-label={`Nuevo nombre para ${casoOracion(s)}`}
                      className="flex-1 min-h-[36px] bg-transparent border-0 border-b-[1.5px] border-cuaderno-tinta text-[17px] focus:outline-none"
                      autoFocus
                    />
                    <Boton variante="texto" className="text-[16px]" onClick={() => handleGuardarEditSubcat(s)}>Guardar</Boton>
                    <Boton variante="texto" className="text-[16px] text-cuaderno-grafito" onClick={() => setEditandoSubcat(null)}>Cancelar</Boton>
                  </>
                ) : (
                  <>
                    <span className="flex-1 text-[17px]">{casoOracion(s)}</span>
                    <button type="button" aria-label={`Renombrar ${casoOracion(s)}`}
                      onClick={() => { setEditandoSubcat(s); setValorEditSubcat(s); }}
                      className="w-9 h-9 rounded-md flex items-center justify-center text-cuaderno-grafito hover:text-cuaderno-tinta hover:bg-cuaderno-hoja">
                      <IconoLapiz tamano={15} />
                    </button>
                    <button type="button" aria-label={`Eliminar ${casoOracion(s)}`}
                      onClick={() => handleEliminarSubcat(s)}
                      className="w-9 h-9 rounded-md flex items-center justify-center text-cuaderno-grafito hover:text-cuaderno-roja hover:bg-cuaderno-rosa/40">
                      <IconoBorrar tamano={15} />
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <Campo
        etiqueta="Detalle o agrupador"
        value={form.detalle}
        onChange={e => setForm(f => ({...f, detalle: e.target.value.toUpperCase()}))}
        placeholder="Ej: sueldos, combustible, EP01"
      />

      {!isIngreso && (
        <Campo
          etiqueta="Presupuesto mensual"
          inputMode="numeric"
          value={form.presupuestoMensual}
          onChange={e => setForm(f => ({...f, presupuestoMensual: fmtInput(e.target.value)}))}
          placeholder="$ 0"
          ayuda="Tope de gasto del mes. En la tabla se ve como una línea bajo el nombre."
        />
      )}

      {isIngreso && (
        <div className="grid grid-cols-2 gap-4">
          <Campo etiqueta="Proyecto" value={form.proyectoId}
            onChange={e => setForm(f => ({...f, proyectoId: e.target.value.toUpperCase()}))} />
          <Campo etiqueta="Cliente" value={form.cliente}
            onChange={e => setForm(f => ({...f, cliente: e.target.value}))} />
        </div>
      )}

      {/* Recurrencia */}
      <div className="border-t border-cuaderno-azul pt-4">
        <Casilla
          marcada={form.recurrente}
          onCambiar={v => setForm(f => ({...f, recurrente: v}))}
          descripcion={form.recurrente ? "Se anota sola en las semanas futuras vacías" : "Márcala si el monto se repite"}>
          Cuenta recurrente
        </Casilla>
        {form.recurrente && (
          <div className="mt-4 ml-9 space-y-3">
            <div className="grid grid-cols-2 gap-4">
              <Campo as="select" etiqueta="Frecuencia" value={form.frecuenciaRecurrente}
                onChange={e => setForm(f => ({...f, frecuenciaRecurrente: e.target.value}))}>
                <option value="semanal">Cada semana</option>
                <option value="quincenal">Cada 2 semanas</option>
                <option value="mensual">Una vez al mes</option>
              </Campo>
              <Campo etiqueta="Monto fijo" inputMode="numeric" value={form.montoRecurrente}
                onChange={e => setForm(f => ({...f, montoRecurrente: fmtInput(e.target.value)}))}
                placeholder="$ 0" />
            </div>
            <p className="m-0 text-[14px] text-cuaderno-grafito">
              Solo llena semanas futuras sin monto. Lo que hayas escrito a mano no se toca.
            </p>
          </div>
        )}
      </div>
    </ModalCuaderno>
  );
}

// ─── Modal: Saldo bancario ─────────────────────────────────────────────────
function ModalSaldo({ saldo, onSave, onClose }) {
  const [val, setVal] = useState(fmtInput(saldo || ""));
  return (
    <ModalCuaderno
      titulo="Saldo del banco"
      subtitulo="Desde aquí parte el saldo acumulado"
      ancho="max-w-sm"
      onClose={onClose}
      cerrarAlClicFuera
      pie={
        <div className="flex gap-2">
          <Boton className="flex-1" onClick={onClose}>Cancelar</Boton>
          <Boton variante="primario" className="flex-1" onClick={() => onSave(parseInput(val))}>Guardar</Boton>
        </div>
      }>
      <Campo
        etiqueta="Saldo disponible hoy, en pesos"
        inputMode="numeric"
        value={val}
        onChange={e => setVal(fmtInput(e.target.value))}
        onKeyDown={e => e.key === "Enter" && onSave(parseInput(val))}
        placeholder="0"
        autoFocus
        className="[&_input]:text-right [&_input]:text-[22px]"
      />
    </ModalCuaderno>
  );
}

// ─── Columnas del libro ─────────────────────────────────────────────────────
// Ancho de cada semana. Lo usa también scrollToMonth para saltar de mes.
const ANCHO_SEMANA = 104;

// Borde izquierdo de cada columna semanal: doble línea roja de margen antes de
// la primera semana, línea de columna al cambiar de mes y línea fina entre
// semanas del mismo mes.
function bordeSemana(i, weeks) {
  if (i === 0) return "border-l-[3px] border-double border-l-cuaderno-margen";
  if (weeks[i].monthIndex !== weeks[i - 1].monthIndex) return "border-l border-l-cuaderno-columna";
  return "border-l border-l-cuaderno-linea";
}

// ─── Celda editable ─────────────────────────────────────────────────────────
function PaymentCell({ value, paid, nota, isEgreso, isCurrentWeek, borde,
  onSave, onTogglePaid, onNota,
  isDragging, isDragOver, onDragStart, onDragOver, onDragLeave, onDrop, onDragEnd }) {

  const [editing, setEditing]   = useState(false);
  const [inputVal, setInputVal] = useState("");
  const [showNota, setShowNota] = useState(false);
  const [notaVal, setNotaVal]   = useState(nota || "");
  const inputRef = useRef(null);

  const isEmpty = !value || value === 0;

  const startEdit = () => {
    setInputVal(value ? fmtInput(Math.abs(value)) : "");
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  };
  const commit = () => {
    const n = parseInput(inputVal);
    onSave(isEgreso ? -n : n);
    setEditing(false);
  };

  return (
    <td
      draggable={!isEmpty}
      onDragStart={!isEmpty ? onDragStart : undefined}
      onDragOver={e => onDragOver(e)}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      className={`relative ${borde} border-b border-b-cuaderno-renglon select-none ${isDragging ? "opacity-30" : ""} ${
        isDragOver
          ? "bg-cuaderno-durazno/60 outline-dashed outline-[1.5px] -outline-offset-2 outline-cuaderno-tinta z-10"
          : isCurrentWeek ? "bg-cuaderno-durazno/40" : ""}`}
      style={{ width: ANCHO_SEMANA, minWidth: ANCHO_SEMANA, height: 44, cursor: editing ? "text" : "default" }}>

      {editing ? (
        <div className="flex items-center h-full px-2">
          <input ref={inputRef} value={inputVal} inputMode="numeric"
            aria-label="Monto en pesos"
            onChange={e => setInputVal(fmtInput(e.target.value))}
            onBlur={commit}
            onKeyDown={e => { if(e.key==="Enter"||e.key==="Tab") { e.preventDefault(); commit(); } if(e.key==="Escape") setEditing(false); }}
            className="w-full min-w-0 text-right text-[16px] bg-cuaderno-tarjeta border-0 border-b-[1.5px] border-cuaderno-tinta text-cuaderno-tinta focus:outline-none px-1"/>
        </div>
      ) : (
        <div className="group/celda relative flex items-center justify-end h-full px-2 cursor-pointer hover:bg-cuaderno-hoja/80" onClick={startEdit}>
          {!isEmpty && (
            <span className="inline-flex items-center gap-0.5 text-[16px]">
              {nota && <span className="text-[14px] text-cuaderno-grafito" title={nota}>*</span>}
              <Cifra valor={value} color={paid ? "grafito" : "auto"} />
              {paid && <VistoBueno tamano={12} />}
            </span>
          )}
          {/* Acciones al pasar el mouse: no desplazan la cifra */}
          {!isEmpty && (
            <div className="absolute bottom-0.5 left-1/2 -translate-x-1/2 flex gap-0.5 opacity-0 group-hover/celda:opacity-100 focus-within:opacity-100">
              <button onClick={e => { e.stopPropagation(); onTogglePaid(); }}
                title={paid ? "Marcar pendiente" : "Marcar pagado"} aria-label={paid ? "Marcar pendiente" : "Marcar pagado"}
                className={`w-[18px] h-[18px] rounded-[3px] border flex items-center justify-center bg-cuaderno-tarjeta ${
                  paid ? "border-cuaderno-verde text-cuaderno-verde" : "border-cuaderno-renglon text-cuaderno-grafito hover:border-cuaderno-tinta"}`}>
                <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 8.6 L6.4 12 L13 4.2"/></svg>
              </button>
              <button onClick={e => { e.stopPropagation(); setNotaVal(nota||""); setShowNota(true); }}
                title="Nota" aria-label={nota ? "Editar nota" : "Agregar nota"}
                className={`w-[18px] h-[18px] rounded-[3px] border flex items-center justify-center bg-cuaderno-tarjeta ${
                  nota ? "border-cuaderno-tinta text-cuaderno-tinta" : "border-cuaderno-renglon text-cuaderno-grafito hover:border-cuaderno-tinta"}`}>
                <IconoNota tamano={10} />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Nota de la celda */}
      {showNota && (
        <>
          <div className="fixed inset-0 z-30" onClick={e => { e.stopPropagation(); setShowNota(false); }}/>
          <div className="absolute z-40 top-0 left-full ml-1 w-56 bg-cuaderno-tarjeta border border-cuaderno-columna rounded-md p-3 shadow-[0_12px_28px_-12px_rgb(var(--cuaderno-tinta)/0.4)]" onClick={e => e.stopPropagation()}>
            <label className="block text-[14px] text-cuaderno-grafito mb-1">
              Nota
              <textarea value={notaVal} onChange={e => setNotaVal(e.target.value)}
                rows={2} placeholder="Escribe una nota…" autoFocus
                className="mt-1 w-full text-[16px] text-cuaderno-tinta bg-transparent border-0 border-b-[1.5px] border-cuaderno-tinta/70 resize-none focus:outline-none focus:border-cuaderno-tinta"/>
            </label>
            <div className="flex justify-end gap-2 mt-2">
              <Boton variante="texto" className="min-h-[36px] text-[15px] text-cuaderno-grafito" onClick={() => setShowNota(false)}>Cancelar</Boton>
              <Boton variante="primario" className="min-h-[36px] px-3 text-[15px]" onClick={() => { onNota(notaVal); setShowNota(false); }}>Guardar</Boton>
            </div>
          </div>
        </>
      )}
    </td>
  );
}

// ─── Fila de cuenta ─────────────────────────────────────────────────────────
function AccountRow({ account, weekColumns, payments, paymentsPaid, paymentNotas,
  onPayment, onTogglePaid, onNota, onEdit, onDelete, proyectoId,
  draggedPayment, dragOverKey, onDragStart, onDragOver, onDragLeave, onDrop, onDragEnd,
  mesActualWeeks, onOpenDetalle, sangria = "pl-8" }) {

  const isEgreso = account.categoria === "EGRESOS";
  // Solo los egresos abren el panel de detalle (datos de pago y contacto)
  const abreDetalle = isEgreso && !!onOpenDetalle;
  const propsDetalle = abreDetalle ? {
    role: "button",
    tabIndex: 0,
    title: "Ver cómo pagar y contacto",
    onClick: () => onOpenDetalle(account),
    onKeyDown: e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpenDetalle(account); } },
  } : {};
  if (proyectoId !== "todos" && account.proyectoId && account.proyectoId !== proyectoId) return null;

  const rowTotal = weekColumns.reduce((s, w) => s + (payments[`${account.id}-${w.key}`] || 0), 0);

  // ── Presupuesto vs Real ────────────────────────────────────────────────────
  const budget = parseInput(account.presupuestoMensual || "0");
  const gastoMesActual = isEgreso && budget > 0 && mesActualWeeks
    ? Math.abs(mesActualWeeks.reduce((s, w) => s + (payments[`${account.id}-${w.key}`] || 0), 0))
    : 0;
  const budgetPct   = budget > 0 ? Math.min((gastoMesActual / budget) * 100, 100) : 0;
  const budgetOver  = budget > 0 && gastoMesActual > budget;
  const budgetWarn  = budget > 0 && budgetPct >= 80 && !budgetOver;
  const showBudget  = isEgreso && budget > 0;

  return (
    <tr className="group">
      {/* Nombre */}
      <td className={`sticky left-0 z-10 bg-cuaderno-hoja group-hover:bg-cuaderno-papel border-b border-b-cuaderno-renglon ${sangria} pr-2`}
        style={{ width: 248, minWidth: 248, height: 44 }}>
        <div className="flex items-center justify-between gap-1 h-full">
          <div className={`group/nombre min-w-0 flex-1 py-1 ${abreDetalle ? "cursor-pointer rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-cuaderno-tinta/40" : ""}`}
            {...propsDetalle}>
            <div className="flex items-center gap-1.5">
              <p className={`m-0 text-[17px] leading-tight truncate ${abreDetalle ? "decoration-cuaderno-columna underline-offset-4 group-hover/nombre:underline" : ""}`}>
                {casoTitulo(account.nombre)}
              </p>
              {account.recurrente && (
                <span className="flex-shrink-0 text-[14px] text-cuaderno-grafito" title={`Recurrente, ${account.frecuenciaRecurrente || "mensual"}`}>↺</span>
              )}
              {budgetOver && <Resaltado color="rosa" className="flex-shrink-0 text-[13px]">excedido</Resaltado>}
              {budgetWarn && <Resaltado color="durazno" className="flex-shrink-0 text-[13px]">80%</Resaltado>}
            </div>
            {account.detalle && <p className="m-0 text-[13px] leading-tight text-cuaderno-grafito truncate">{casoOracion(account.detalle)}</p>}
            {showBudget && (
              <div className="mt-1 flex items-center gap-1.5" title={`Presupuesto del mes: ${Math.round(budgetPct)}%`}>
                <div className="flex-1 h-[2px] bg-cuaderno-renglon">
                  <div className={`h-full ${budgetOver ? "bg-cuaderno-roja" : budgetWarn ? "bg-cuaderno-roja/60" : "bg-cuaderno-verde"}`}
                    style={{ width: `${budgetPct}%` }}/>
                </div>
                <span className={`text-[11px] flex-shrink-0 ${budgetOver ? "text-cuaderno-roja" : "text-cuaderno-grafito"}`}>{Math.round(budgetPct)}%</span>
              </div>
            )}
          </div>
          <div className="flex items-center opacity-0 group-hover:opacity-100 focus-within:opacity-100 flex-shrink-0">
            <button onClick={() => onEdit(account)} aria-label={`Editar ${casoTitulo(account.nombre)}`} title="Editar cuenta"
              className="w-7 h-7 rounded-md flex items-center justify-center text-cuaderno-grafito hover:text-cuaderno-tinta hover:bg-cuaderno-hoja">
              <IconoLapiz tamano={13} />
            </button>
            <button onClick={() => onDelete(account.id)} aria-label={`Eliminar ${casoTitulo(account.nombre)}`} title="Eliminar cuenta"
              className="w-7 h-7 rounded-md flex items-center justify-center text-cuaderno-grafito hover:text-cuaderno-roja hover:bg-cuaderno-rosa/40">
              <IconoBorrar tamano={13} />
            </button>
          </div>
        </div>
      </td>

      {/* Celdas semanales */}
      {weekColumns.map((week, i) => {
        const key = `${account.id}-${week.key}`;
        return (
          <PaymentCell key={key}
            value={payments[key] || 0}
            paid={!!paymentsPaid[key]}
            nota={paymentNotas[key] || ""}
            isEgreso={isEgreso}
            isCurrentWeek={week.isCurrentWeek}
            borde={bordeSemana(i, weekColumns)}
            onSave={val => onPayment(key, val)}
            onTogglePaid={() => onTogglePaid(key)}
            onNota={nota => onNota(key, nota)}
            isDragging={draggedPayment?.sourceKey === key}
            isDragOver={dragOverKey === key}
            onDragStart={() => onDragStart(account.id, week.key)}
            onDragOver={e => onDragOver(e, key)}
            onDragLeave={onDragLeave}
            onDrop={() => onDrop(account.id, week.key)}
            onDragEnd={onDragEnd}
          />
        );
      })}

      {/* Total fila */}
      <td className="sticky right-0 z-10 bg-cuaderno-hoja group-hover:bg-cuaderno-papel border-b border-b-cuaderno-renglon border-l border-l-cuaderno-columna px-3 text-right text-[16px]"
        style={{ width: 128, minWidth: 128 }}>
        <Cifra valor={rowTotal} />
      </td>
    </tr>
  );
}

// ─── Componente principal ────────────────────────────────────────────────────
export default function FinanzasFlujoCaja() {
  const { proyectoId } = useFinanzas();
  const { empresaId } = useEmpresa();
  const { subcatsEgreso, subcatsIngreso, eliminarSubcat } = useSubcategorias(empresaId);
  const weekColumns = useMemo(() => getWeekColumns(), []);
  const tableRef = useRef(null);

  const [cuentas,      setCuentas]      = useState([]);
  const [payments,     setPayments]     = useState({});
  const [paymentsPaid, setPaymentsPaid] = useState({});
  const [paymentNotas, setPaymentNotas] = useState({});
  const [saldoBanco,   setSaldoBanco]   = useState(0);
  const [loading,      setLoading]      = useState(true);

  const [showModalCuenta, setShowModalCuenta] = useState(false);
  const [editandoCuenta,  setEditandoCuenta]  = useState(null);
  const [showModalSaldo,  setShowModalSaldo]  = useState(false);
  const [busqueda,        setBusqueda]        = useState("");
  const [collapsed,       setCollapsed]       = useState({});
  const [tabActiva,       setTabActiva]       = useState("tabla");
  const [draggedPayment,  setDraggedPayment]  = useState(null);
  const [dragOverKey,     setDragOverKey]     = useState(null);
  const [showExportMenu,  setShowExportMenu]  = useState(false);
  const [exportando,      setExportando]      = useState(null); // null | "excel" | "pdf"
  const [expandido,       setExpandido]       = useState(false); // modo pantalla ampliada (oculta sidebar + KPIs)
  const [proveedores,     setProveedores]     = useState([]);    // maestro de proveedores, en vivo
  const [cuentaDetalleId, setCuentaDetalleId] = useState(null);  // cuenta abierta en el panel lateral

  // Salir del modo expandido con Escape — salvo que haya un panel o modal
  // encima: en ese caso Escape cierra esa capa y no el modo ampliado.
  useEffect(() => {
    if (!expandido) return;
    const fn = e => {
      if (e.key === "Escape" && !cuentaDetalleId && !showModalCuenta && !showModalSaldo) setExpandido(false);
    };
    document.addEventListener("keydown", fn);
    return () => document.removeEventListener("keydown", fn);
  }, [expandido, cuentaDetalleId, showModalCuenta, showModalSaldo]);

  // Maestro de proveedores — suscripción en vivo para que el panel y el
  // modal de cuenta reflejen al instante una ficha creada o editada.
  useEffect(() => escucharProveedores(empresaId, setProveedores), [empresaId]);

  // ── Autorrelleno de recurrentes ────────────────────────────────────────────
  // Se ejecuta cuando hay cuentas o payments listos
  // Rellena solo semanas FUTURAS y VACÍAS — nunca sobreescribe ediciones manuales
  const applyRecurrentes = useCallback((cuentasList, paymentsMap, weeks) => {
    const today = new Date(); today.setHours(0,0,0,0);
    const filled = { ...paymentsMap };
    let changed = false;
    cuentasList.forEach(c => {
      if (!c.recurrente || !c.montoRecurrente) return;
      const monto = -Math.abs(parseInput(c.montoRecurrente)); // egresos siempre negativos
      const isIngreso = c.categoria === "INGRESOS";
      const montoFinal = isIngreso ? Math.abs(parseInput(c.montoRecurrente)) : monto;
      const futuras = weeks.filter(w => w.startDate >= today);
      futuras.forEach((w, idx) => {
        const key = `${c.id}-${w.key}`;
        if (filled[key]) return; // ya tiene valor — no sobreescribir
        const freq = c.frecuenciaRecurrente || "mensual";
        let aplicar = false;
        if (freq === "semanal") aplicar = true;
        else if (freq === "quincenal") aplicar = idx % 2 === 0;
        else if (freq === "mensual") {
          // Solo la primera semana de cada mes
          const prevSameMes = futuras.slice(0, idx).find(pw => pw.monthIndex === w.monthIndex);
          aplicar = !prevSameMes;
        }
        if (aplicar) { filled[key] = montoFinal; changed = true; }
      });
    });
    return changed ? filled : null;
  }, []);

  // ── Firebase ───────────────────────────────────────────────────────────────
  const cargar = useCallback(async () => {
    if (!empresaId) { setLoading(false); return; }
    setLoading(true);
    try {
      const [snapC, snapP, snapPaid, snapNotas, snapCfg] = await Promise.all([
        getDocs(collection(db, "empresas", empresaId, "flujo_cuentas")),
        getDocs(collection(db, "empresas", empresaId, "flujo_pagos")),
        getDocs(collection(db, "empresas", empresaId, "flujo_pagados")),
        getDocs(collection(db, "empresas", empresaId, "flujo_notas")),
        getDocs(collection(db, "empresas", empresaId, "flujo_config")),
      ]);
      const cuentasList = snapC.docs.map(d => ({ id: d.id, ...d.data() }));
      setCuentas(cuentasList);
      const pMap = {}; snapP.docs.forEach(d => { pMap[d.id] = d.data().valor || 0; });
      // Autorrelleno recurrentes — en memoria, no persiste a Firebase
      const weeksSnap = getWeekColumns();
      const filledMap = applyRecurrentes(cuentasList, pMap, weeksSnap);
      setPayments(filledMap || pMap);
      const paidMap = {}; snapPaid.docs.forEach(d => { paidMap[d.id] = true; }); setPaymentsPaid(paidMap);
      const notaMap = {}; snapNotas.docs.forEach(d => { notaMap[d.id] = d.data().texto || ""; }); setPaymentNotas(notaMap);
      snapCfg.docs.forEach(d => { if (d.id === "saldo_banco") setSaldoBanco(d.data().valor || 0); });
    } catch(e) { console.error(e); }
    finally { setLoading(false); }
  }, [empresaId, applyRecurrentes]);

  useEffect(() => { cargar(); }, [cargar]);

  const handlePayment = useCallback(async (key, valor) => {
    setPayments(prev => ({ ...prev, [key]: valor }));
    try { await setDoc(doc(db, "empresas", empresaId, "flujo_pagos", key), { valor, updatedAt: new Date().toISOString() }); } catch(e) {}
  }, [empresaId]);

  const handleTogglePaid = useCallback(async (key) => {
    const nuevo = !paymentsPaid[key];
    setPaymentsPaid(prev => ({ ...prev, [key]: nuevo }));
    try {
      if (nuevo) await setDoc(doc(db, "empresas", empresaId, "flujo_pagados", key), { paidAt: new Date().toISOString() });
      else await deleteDoc(doc(db, "empresas", empresaId, "flujo_pagados", key));
    } catch(e) {}
  }, [paymentsPaid, empresaId]);

  const handleNota = useCallback(async (key, texto) => {
    setPaymentNotas(prev => ({ ...prev, [key]: texto }));
    try {
      if (texto) await setDoc(doc(db, "empresas", empresaId, "flujo_notas", key), { texto, updatedAt: new Date().toISOString() });
      else await deleteDoc(doc(db, "empresas", empresaId, "flujo_notas", key));
    } catch(e) {}
  }, [empresaId]);

  // ── Drag & Drop ────────────────────────────────────────────────────────────
  const handleDragStart = useCallback((cuentaId, weekKey) => {
    const key = `${cuentaId}-${weekKey}`;
    const valor = payments[key] || 0;
    if (!valor) return;
    setDraggedPayment({ cuentaId, weekKey, valor, sourceKey: key });
  }, [payments]);

  const handleDragOver = useCallback((e, key) => {
    e.preventDefault(); setDragOverKey(key);
  }, []);

  const handleDragLeave = useCallback(() => { setDragOverKey(null); }, []);

  const handleDrop = useCallback(async (cuentaId, weekKey) => {
    if (!draggedPayment) return;
    const { sourceKey, valor } = draggedPayment;
    const targetKey = `${cuentaId}-${weekKey}`;
    if (sourceKey === targetKey) { setDraggedPayment(null); setDragOverKey(null); return; }
    setPayments(prev => ({ ...prev, [targetKey]: valor, [sourceKey]: 0 }));
    if (paymentNotas[sourceKey]) {
      setPaymentNotas(prev => { const next = { ...prev, [targetKey]: prev[sourceKey] }; delete next[sourceKey]; return next; });
    }
    if (paymentsPaid[sourceKey]) {
      setPaymentsPaid(prev => { const next = { ...prev, [targetKey]: true }; delete next[sourceKey]; return next; });
    }
    try {
      await Promise.all([
        setDoc(doc(db, "empresas", empresaId, "flujo_pagos", targetKey), { valor, updatedAt: new Date().toISOString() }),
        setDoc(doc(db, "empresas", empresaId, "flujo_pagos", sourceKey), { valor: 0, updatedAt: new Date().toISOString() }),
        ...(paymentNotas[sourceKey] ? [setDoc(doc(db, "empresas", empresaId, "flujo_notas", targetKey), { texto: paymentNotas[sourceKey] }), deleteDoc(doc(db, "empresas", empresaId, "flujo_notas", sourceKey))] : []),
        ...(paymentsPaid[sourceKey] ? [setDoc(doc(db, "empresas", empresaId, "flujo_pagados", targetKey), { paidAt: new Date().toISOString() }), deleteDoc(doc(db, "empresas", empresaId, "flujo_pagados", sourceKey))] : []),
      ]);
    } catch(e) {}
    setDraggedPayment(null); setDragOverKey(null);
  }, [draggedPayment, paymentNotas, paymentsPaid, empresaId]);

  const handleDragEnd = useCallback(() => { setDraggedPayment(null); setDragOverKey(null); }, []);

  // ── CRUD ───────────────────────────────────────────────────────────────────
  // Si Firestore falla, el error sube a ModalCuenta, que lo muestra y queda
  // abierto. Antes se tragaba en silencio y el modal se cerraba igual.
  const handleSaveCuenta = useCallback(async (form) => {
    if (editandoCuenta) {
      await updateDoc(doc(db, "empresas", empresaId, "flujo_cuentas", editandoCuenta.id), form);
      setCuentas(prev => prev.map(c => c.id === editandoCuenta.id ? { ...c, ...form } : c));
    } else {
      const ref = await addDoc(collection(db, "empresas", empresaId, "flujo_cuentas"), { ...form, creadoEn: new Date().toISOString() });
      setCuentas(prev => [...prev, { id: ref.id, ...form }]);
    }
    // Re-aplicar recurrentes después de guardar/editar
    setCuentas(prev => {
      setPayments(pm => {
        const filled = applyRecurrentes(prev, pm, weekColumns);
        return filled || pm;
      });
      return prev;
    });
    setShowModalCuenta(false); setEditandoCuenta(null);
  }, [editandoCuenta, applyRecurrentes, weekColumns, empresaId]);

  const handleDeleteCuenta = useCallback(async (id) => {
    if (!window.confirm("¿Eliminar esta cuenta? Se perderán todos sus montos.")) return;
    try { await deleteDoc(doc(db, "empresas", empresaId, "flujo_cuentas", id)); setCuentas(prev => prev.filter(c => c.id !== id)); } catch(e) {}
  }, [empresaId]);

  // Vincula (o desvincula con "") un proveedor del maestro a una cuenta.
  // Lanza si falla, para que el panel muestre el error.
  const handleVincularProveedor = useCallback(async (cuentaId, proveedorId) => {
    await updateDoc(doc(db, "empresas", empresaId, "flujo_cuentas", cuentaId), { proveedorId });
    setCuentas(prev => prev.map(c => c.id === cuentaId ? { ...c, proveedorId } : c));
  }, [empresaId]);

  const cuentaDetalle = useMemo(
    () => cuentas.find(c => c.id === cuentaDetalleId) || null,
    [cuentas, cuentaDetalleId]
  );
  const abrirDetalle = useCallback(c => setCuentaDetalleId(c.id), []);

  const handleSaldoBanco = useCallback(async (val) => {
    setSaldoBanco(val); setShowModalSaldo(false);
    try { await setDoc(doc(db, "empresas", empresaId, "flujo_config", "saldo_banco"), { valor: val }); } catch(e) {}
  }, [empresaId]);

  // ── Cálculos ───────────────────────────────────────────────────────────────
  const cuentasFiltradas = useMemo(() => {
    let lista = cuentas;
    if (busqueda) lista = lista.filter(c => c.nombre?.toLowerCase().includes(busqueda.toLowerCase()));
    if (proyectoId !== "todos") lista = lista.filter(c => !c.proyectoId || c.proyectoId === proyectoId);
    return lista;
  }, [cuentas, busqueda, proyectoId]);

  const mesActualWeeks = useMemo(() => weekColumns.filter(w => w.monthIndex === 0), [weekColumns]);

  const ingresos = useMemo(() => cuentasFiltradas.filter(c => c.categoria === "INGRESOS"), [cuentasFiltradas]);
  const egresos  = useMemo(() => cuentasFiltradas.filter(c => c.categoria === "EGRESOS"),  [cuentasFiltradas]);
  const subcatsEgresoActivas = useMemo(() => [...new Set(egresos.map(c => c.subcategoria).filter(Boolean))], [egresos]);

  function weekTotal(weekKey, lista) {
    return lista.reduce((s, c) => s + (payments[`${c.id}-${weekKey}`] || 0), 0);
  }

  // ── Exportación ────────────────────────────────────────────────────────────
  const cargarSheetJS = () => new Promise((resolve, reject) => {
    if (window.XLSX) { resolve(window.XLSX); return; }
    const s = document.createElement("script");
    s.src = "https://cdn.sheetjs.com/xlsx-0.20.1/package/dist/xlsx.full.min.js";
    s.onload = () => resolve(window.XLSX);
    s.onerror = reject;
    document.head.appendChild(s);
  });

  const exportarExcel = useCallback(async () => {
    setExportando("excel");
    try {
      const XLSX = await cargarSheetJS();
      const wb = XLSX.utils.book_new();
      const hoy = new Date();
      const mesLabel = `${hoy.getDate()}-${hoy.getMonth()+1}-${hoy.getFullYear()}`;

      // ── Hoja 1: Flujo semanal ──────────────────────────────────────────────
      const header1 = ["CUENTA", "CATEGORÍA", "SUBCATEGORÍA", ...weekColumns.map(w => `${w.label} (${w.dateRange})`), "TOTAL"];
      const rows1 = [];
      [...ingresos, ...egresos].forEach(c => {
        const row = [c.nombre, c.categoria, c.subcategoria || ""];
        let total = 0;
        weekColumns.forEach(w => {
          const v = payments[`${c.id}-${w.key}`] || 0;
          row.push(v !== 0 ? v : "");
          total += v;
        });
        row.push(total !== 0 ? total : "");
        rows1.push(row);
      });
      // Fila neto
      const netoRow = ["NETO SEMANAL", "", ""];
      let netoTotal = 0;
      weekColumns.forEach(w => {
        const n = weekTotal(w.key, ingresos) + weekTotal(w.key, egresos);
        netoRow.push(n !== 0 ? n : "");
        netoTotal += n;
      });
      netoRow.push(netoTotal);
      rows1.push([], netoRow);
      const ws1 = XLSX.utils.aoa_to_sheet([header1, ...rows1]);
      ws1["!cols"] = [{ wch: 28 }, { wch: 12 }, { wch: 16 }, ...weekColumns.map(() => ({ wch: 14 })), { wch: 14 }];
      XLSX.utils.book_append_sheet(wb, ws1, "Flujo Semanal");

      // ── Hoja 2: Resumen mensual ────────────────────────────────────────────
      const header2 = ["MES", "SEMANA", "RANGO", "INGRESOS", "EGRESOS", "NETO"];
      const rows2 = [];
      [0, 1].forEach(mIdx => {
        const sems = weekColumns.filter(w => w.monthIndex === mIdx);
        if (!sems.length) return;
        const mesNombre = sems[0].monthName + " " + sems[0].startDate.getFullYear();
        sems.forEach(w => {
          const wIng = weekTotal(w.key, ingresos);
          const wEgr = weekTotal(w.key, egresos);
          rows2.push([mesNombre, w.label, w.dateRange, wIng || "", wEgr || "", (wIng + wEgr) || ""]);
        });
        const mIng = sems.reduce((s,w) => s + weekTotal(w.key, ingresos), 0);
        const mEgr = sems.reduce((s,w) => s + weekTotal(w.key, egresos), 0);
        rows2.push([`TOTAL ${mesNombre.toUpperCase()}`, "", "", mIng, mEgr, mIng+mEgr], []);
      });
      const ws2 = XLSX.utils.aoa_to_sheet([header2, ...rows2]);
      ws2["!cols"] = [{ wch: 20 }, { wch: 8 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }];
      XLSX.utils.book_append_sheet(wb, ws2, "Resumen Mensual");

      // ── Hoja 3: Cuentas ───────────────────────────────────────────────────
      const header3 = ["NOMBRE", "CATEGORÍA", "SUBCATEGORÍA", "DETALLE", "RECURRENTE", "FRECUENCIA", "MONTO RECURRENTE", "PRESUPUESTO MENSUAL"];
      const rows3 = cuentas.map(c => [
        c.nombre, c.categoria, c.subcategoria || "", c.detalle || "",
        c.recurrente ? "Sí" : "No", c.frecuenciaRecurrente || "",
        c.montoRecurrente ? parseInput(c.montoRecurrente) : "",
        c.presupuestoMensual ? parseInput(c.presupuestoMensual) : "",
      ]);
      const ws3 = XLSX.utils.aoa_to_sheet([header3, ...rows3]);
      ws3["!cols"] = [{ wch: 28 }, { wch: 12 }, { wch: 16 }, { wch: 20 }, { wch: 12 }, { wch: 14 }, { wch: 18 }, { wch: 18 }];
      XLSX.utils.book_append_sheet(wb, ws3, "Cuentas");

      XLSX.writeFile(wb, `FlujoCaja_MPF_${mesLabel}.xlsx`);
    } catch(e) { console.error(e); alert("Error al exportar Excel"); }
    finally { setExportando(null); setShowExportMenu(false); }
  }, [ingresos, egresos, cuentas, weekColumns, payments]);

  const exportarPDF = useCallback(() => {
    setExportando("pdf");
    setShowExportMenu(false);
    const hoy = new Date();
    const mesLabel = MESES_FULL[hoy.getMonth()] + " " + hoy.getFullYear();

    // Construir tabla HTML para imprimir
    const allCuentas = [...ingresos, ...egresos];
    const filas = allCuentas.map(c => {
      const celdas = weekColumns.map(w => {
        const v = payments[`${c.id}-${w.key}`] || 0;
        const color = v > 0 ? "#059669" : v < 0 ? "#e11d48" : "#94a3b8";
        return `<td style="text-align:center;font-family:monospace;font-size:9px;padding:3px 4px;color:${color};border:0.5px solid #e2e8f0">${v !== 0 ? fmtCompact(v) : "—"}</td>`;
      }).join("");
      const total = weekColumns.reduce((s,w) => s + (payments[`${c.id}-${w.key}`]||0), 0);
      const totalColor = total > 0 ? "#059669" : total < 0 ? "#e11d48" : "#94a3b8";
      return `<tr>
        <td style="padding:3px 6px;font-size:9px;font-weight:600;color:#1e293b;border:0.5px solid #e2e8f0;white-space:nowrap;max-width:180px;overflow:hidden;text-overflow:ellipsis">${c.nombre}</td>
        <td style="padding:3px 4px;font-size:8px;color:#64748b;border:0.5px solid #e2e8f0">${c.subcategoria||""}</td>
        ${celdas}
        <td style="text-align:center;font-family:monospace;font-size:9px;font-weight:700;padding:3px 4px;color:${totalColor};border:0.5px solid #e2e8f0">${total!==0?fmtCompact(total):"—"}</td>
      </tr>`;
    }).join("");

    const headerCols = weekColumns.map(w =>
      `<th style="padding:3px 4px;font-size:8px;font-weight:600;color:#475569;text-align:center;border:0.5px solid #e2e8f0;white-space:nowrap">${w.label}<br/><span style="font-weight:400;font-size:7px">${w.dateRange}</span></th>`
    ).join("");

    // Resumen KPIs
    const resumenHtml = [0,1].map(mIdx => {
      const sems = weekColumns.filter(w => w.monthIndex === mIdx);
      if (!sems.length) return "";
      const mIng = sems.reduce((s,w) => s + weekTotal(w.key, ingresos), 0);
      const mEgr = sems.reduce((s,w) => s + weekTotal(w.key, egresos), 0);
      const mNeto = mIng + mEgr;
      const mesNombre = sems[0].monthName + " " + sems[0].startDate.getFullYear();
      return `<tr>
        <td style="padding:4px 8px;font-size:10px;font-weight:600;color:#1e293b;border:0.5px solid #e2e8f0">${mesNombre}</td>
        <td style="padding:4px 8px;font-size:10px;font-family:monospace;color:#059669;text-align:right;border:0.5px solid #e2e8f0">${fmtCLP(mIng)}</td>
        <td style="padding:4px 8px;font-size:10px;font-family:monospace;color:#e11d48;text-align:right;border:0.5px solid #e2e8f0">${fmtCLP(Math.abs(mEgr))}</td>
        <td style="padding:4px 8px;font-size:10px;font-family:monospace;font-weight:700;color:${mNeto>=0?"#059669":"#e11d48"};text-align:right;border:0.5px solid #e2e8f0">${fmtCLP(mNeto)}</td>
      </tr>`;
    }).join("");

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/>
    <title>Flujo de Caja MPF — ${mesLabel}</title>
    <style>
      @page { size: A4 landscape; margin: 12mm 10mm; }
      body { font-family: -apple-system, sans-serif; color: #1e293b; }
      h1 { font-size: 16px; font-weight: 700; margin: 0 0 2px; color: #1e293b; }
      .sub { font-size: 10px; color: #64748b; margin: 0 0 12px; }
      .section { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #7c3aed; margin: 12px 0 4px; }
      table { width: 100%; border-collapse: collapse; }
      @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
    </style></head><body>
    <h1>Flujo de Caja — MPF Ingeniería Civil SPA</h1>
    <p class="sub">Generado el ${hoy.toLocaleDateString("es-CL", {weekday:"long", year:"numeric", month:"long", day:"numeric"})}</p>

    <div class="section">Resumen mensual</div>
    <table><thead><tr>
      <th style="padding:4px 8px;font-size:9px;text-align:left;border:0.5px solid #e2e8f0;background:#f8fafc">Mes</th>
      <th style="padding:4px 8px;font-size:9px;text-align:right;border:0.5px solid #e2e8f0;background:#f8fafc">Ingresos</th>
      <th style="padding:4px 8px;font-size:9px;text-align:right;border:0.5px solid #e2e8f0;background:#f8fafc">Egresos</th>
      <th style="padding:4px 8px;font-size:9px;text-align:right;border:0.5px solid #e2e8f0;background:#f8fafc">Neto</th>
    </tr></thead><tbody>${resumenHtml}</tbody></table>

    <div class="section">Detalle semanal</div>
    <table><thead><tr>
      <th style="padding:3px 6px;font-size:9px;text-align:left;border:0.5px solid #e2e8f0;background:#f8fafc;min-width:140px">Cuenta</th>
      <th style="padding:3px 4px;font-size:8px;border:0.5px solid #e2e8f0;background:#f8fafc">Subcategoría</th>
      ${headerCols}
      <th style="padding:3px 4px;font-size:9px;text-align:center;border:0.5px solid #e2e8f0;background:#f8fafc;font-weight:700">Total</th>
    </tr></thead><tbody>${filas}</tbody></table>
    </body></html>`;

    const w = window.open("", "_blank", "width=900,height=700");
    w.document.write(html);
    w.document.close();
    w.onload = () => { w.print(); setExportando(null); };
    setTimeout(() => setExportando(null), 2000);
  }, [ingresos, egresos, weekColumns, payments]);

  const acumulados = useMemo(() => {
    const acc = {};
    let running = saldoBanco;
    weekColumns.forEach(w => {
      running += weekTotal(w.key, ingresos) + weekTotal(w.key, egresos);
      acc[w.key] = running;
    });
    return acc;
    // eslint-disable-next-line
  }, [weekColumns, ingresos, egresos, payments, saldoBanco]);

  const kpiIngresos = useMemo(() => ingresos.reduce((s, c) => s + weekColumns.reduce((ws, w) => ws + (payments[`${c.id}-${w.key}`] || 0), 0), 0), [ingresos, payments, weekColumns]);
  const kpiEgresos  = useMemo(() => egresos.reduce((s, c)  => s + weekColumns.reduce((ws, w) => ws + (payments[`${c.id}-${w.key}`] || 0), 0), 0), [egresos,  payments, weekColumns]);
  const kpiNeto     = kpiIngresos + kpiEgresos;
  const kpiPendiente = useMemo(() => egresos.reduce((s, c) => s + weekColumns.reduce((ws, w) => {
    const key = `${c.id}-${w.key}`;
    const v = payments[key] || 0;
    return ws + (v < 0 && !paymentsPaid[key] ? Math.abs(v) : 0);
  }, 0), 0), [egresos, weekColumns, payments, paymentsPaid]);

  const semanasNegativas = useMemo(() =>
    weekColumns.filter(w => weekTotal(w.key, ingresos) + weekTotal(w.key, egresos) < 0).length,
  // eslint-disable-next-line
  [weekColumns, ingresos, egresos, payments]);

  const toggleCollapse = (key) => setCollapsed(p => ({ ...p, [key]: !p[key] }));
  const scrollToMonth  = (idx) => {
    const target = weekColumns.find(w => w.monthIndex === idx);
    if (!target || !tableRef.current) return;
    tableRef.current.scrollTo({ left: weekColumns.indexOf(target) * ANCHO_SEMANA, behavior: "smooth" });
  };

  if (loading) return (
    <div className="cuaderno flex items-center justify-center h-64 text-[18px] text-cuaderno-grafito">
      Abriendo el cuaderno…
    </div>
  );

  // ── Datos solo de presentación ─────────────────────────────────────────────
  const fechaHoy = casoOracion(new Date().toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).replace(",", ""));
  const mesesVisibles = weekColumns.filter((w, i, arr) => arr.findIndex(x => x.monthIndex === w.monthIndex) === i);
  const nombresMeses = mesesVisibles.map(w => w.monthName.toLowerCase()).join(" y ");
  const gruposMes = [];
  weekColumns.forEach((w, i) => {
    const last = gruposMes[gruposMes.length - 1];
    if (!last || last.name !== w.monthName) gruposMes.push({ name: w.monthName, idx: w.monthIndex, inicio: i, count: 1 });
    else last.count++;
  });
  const acumuladoFinal = acumulados[weekColumns[weekColumns.length - 1]?.key] || 0;
  const totalIngresos  = weekColumns.reduce((s, w) => s + weekTotal(w.key, ingresos), 0);
  const totalEgresos   = weekColumns.reduce((s, w) => s + weekTotal(w.key, egresos), 0);
  const filaProps = {
    weekColumns, payments, paymentsPaid, paymentNotas,
    onPayment: handlePayment, onTogglePaid: handleTogglePaid, onNota: handleNota,
    onEdit: c => { setEditandoCuenta(c); setShowModalCuenta(true); },
    onDelete: handleDeleteCuenta, proyectoId,
    draggedPayment, dragOverKey,
    onDragStart: handleDragStart, onDragOver: handleDragOver,
    onDragLeave: handleDragLeave, onDrop: handleDrop, onDragEnd: handleDragEnd,
    mesActualWeeks,
  };

  // Celdas comunes del libro
  const celdaNombre = "sticky left-0 z-10 bg-cuaderno-hoja";
  const celdaTotal  = "sticky right-0 z-10 bg-cuaderno-hoja border-l border-l-cuaderno-columna px-3 text-right";

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className={
      expandido
        ? "cuaderno fixed inset-0 z-[60] flex flex-col h-screen bg-cuaderno-papel"
        : "cuaderno flex flex-col h-full"
    }>

      {/* ── Encabezado de la hoja ───────────────────────────────────────────── */}
      {!expandido && (
      <div className="px-8 pt-5 pb-3 flex-shrink-0">
        <div className="flex justify-end text-[16px] text-cuaderno-grafito">
          <span className="border-b border-cuaderno-columna px-1 pb-0.5">{fechaHoy}</span>
        </div>

        <header className="flex flex-wrap justify-between items-end gap-5 mt-1">
          <div>
            <Titulo>Flujo de caja</Titulo>
            <p className="m-0 text-[17px] text-cuaderno-grafito">
              Semana a semana, {nombresMeses}. Cifras en miles de pesos.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <ProyectoSelector variante="cuaderno" />
            <Campo etiqueta="Buscar" type="search" className="w-44"
              value={busqueda} onChange={e => setBusqueda(e.target.value)}
              placeholder="Nombre de la cuenta" />
            <Boton onClick={() => setShowModalSaldo(true)}>
              {saldoBanco ? <>Saldo <Cifra valor={saldoBanco} color="heredar" /></> : "Saldo del banco"}
            </Boton>
            <div className="relative">
              <Boton onClick={() => setShowExportMenu(v => !v)} aria-expanded={showExportMenu} aria-haspopup="menu">
                {exportando ? "Exportando…" : "Exportar"}
                <IconoBajar tamano={14} />
              </Boton>
              {showExportMenu && (
                <div role="menu" className="absolute right-0 top-full mt-1 z-50 w-60 bg-cuaderno-tarjeta border border-cuaderno-columna rounded-md py-1 shadow-[0_12px_28px_-12px_rgb(var(--cuaderno-tinta)/0.4)]">
                  <button role="menuitem" onClick={exportarExcel} className="w-full text-left px-4 py-2.5 hover:bg-cuaderno-hoja">
                    <span className="block text-[17px]">Excel</span>
                    <span className="block text-[13px] text-cuaderno-grafito">Tres hojas con todo el detalle</span>
                  </button>
                  <div className="mx-4 border-t border-cuaderno-azul" />
                  <button role="menuitem" onClick={exportarPDF} className="w-full text-left px-4 py-2.5 hover:bg-cuaderno-hoja">
                    <span className="block text-[17px]">PDF o imprimir</span>
                    <span className="block text-[13px] text-cuaderno-grafito">Resumen en una hoja A4</span>
                  </button>
                </div>
              )}
            </div>
            {/* Cerrar el menú al hacer clic afuera */}
            {showExportMenu && <div className="fixed inset-0 z-40" onClick={() => setShowExportMenu(false)}/>}
            <Boton variante="primario" onClick={() => { setEditandoCuenta(null); setShowModalCuenta(true); }}>
              <IconoMas tamano={14} /> Nueva cuenta
            </Boton>
          </div>
        </header>

        {/* Resumen con puntos guía y notas al margen */}
        <section aria-label="Resumen del período" className="flex flex-wrap items-start gap-x-14 gap-y-4 mt-5">
          <div className="flex-[0_1_430px] min-w-[280px]">
            <Titulo as="h2" tamano="md"><Resaltado color="durazno">Resumen</Resaltado></Titulo>
            <LineaGuia etiqueta="Ingresos"><Cifra valor={kpiIngresos} vacio="0" /></LineaGuia>
            <LineaGuia etiqueta="Egresos"><Cifra valor={kpiEgresos} vacio="0" /></LineaGuia>
            <LineaGuia etiqueta="Por pagar"><Cifra valor={-kpiPendiente} vacio="0" /></LineaGuia>
            <LineaGuia etiqueta="Neto del período"><Cifra valor={kpiNeto} vacio="0" raya="doble" /></LineaGuia>
          </div>
          <div className="flex-[1_1_260px] max-w-sm flex flex-col gap-2.5 sm:pt-12">
            {!saldoBanco && (
              <Nota>falta anotar el saldo del banco. El acumulado está partiendo de cero.</Nota>
            )}
            {semanasNegativas > 0 && (
              <Nota etiqueta="Ojo:" tono="grafito">
                {semanasNegativas === 1
                  ? "una semana cierra con más egresos que ingresos."
                  : `${semanasNegativas} semanas cierran con más egresos que ingresos.`}
              </Nota>
            )}
          </div>
        </section>
      </div>
      )}

      {/* ── Pestañas ────────────────────────────────────────────────────────── */}
      <div className={`flex flex-wrap items-center justify-between gap-3 py-2 flex-shrink-0 ${expandido ? "px-4" : "px-8"}`}>
        <div role="tablist" className="flex gap-6">
          {[["tabla", "Tabla"], ["resumen", "Resumen mensual"]].map(([id, label]) => (
            <button key={id} role="tab" aria-selected={tabActiva === id} onClick={() => setTabActiva(id)}
              className={`min-h-[44px] px-0.5 text-[20px] border-b-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-cuaderno-tinta/40 ${
                tabActiva === id ? "border-cuaderno-tinta text-cuaderno-tinta" : "border-transparent text-cuaderno-grafito hover:text-cuaderno-tinta"}`}>
              {label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2 text-[15px] text-cuaderno-grafito">
          {tabActiva === "tabla" && (
            <>
              <span>Ir a</span>
              {mesesVisibles.map(w => (
                <button key={w.monthIndex} onClick={() => scrollToMonth(w.monthIndex)}
                  className={`min-h-[38px] px-3 rounded-md border text-[16px] text-cuaderno-tinta ${
                    w.monthIndex === 0 ? "border-cuaderno-columna bg-cuaderno-hoja" : "border-transparent hover:bg-cuaderno-hoja"}`}>
                  {w.monthName.toLowerCase()}
                </button>
              ))}
            </>
          )}

          {/* Nueva cuenta — solo en vista ampliada (la del encabezado queda oculta) */}
          {expandido && (
            <Boton variante="primario" className="min-h-[38px] text-[16px]" onClick={() => { setEditandoCuenta(null); setShowModalCuenta(true); }}>
              <IconoMas tamano={13} /> Nueva cuenta
            </Boton>
          )}

          <Boton variante="texto" className="text-[16px]" onClick={() => setExpandido(v => !v)}
            title={expandido ? "Volver a la vista normal (Esc)" : "Ver la tabla a pantalla completa"}>
            {expandido ? "Salir de la vista ampliada" : "Ampliar"}
          </Boton>
        </div>
      </div>

      {/* ── Libro semanal ───────────────────────────────────────────────────── */}
      {tabActiva === "tabla" && (
        <div ref={tableRef} className={`flex-1 overflow-auto border border-cuaderno-columna bg-cuaderno-hoja ${expandido ? "mx-4 mb-4" : "mx-8 mb-6"}`}>
          <table className="border-collapse" style={{ tableLayout: "fixed", minWidth: "100%" }}>

            <thead className="sticky top-0 z-20">
              {/* Meses */}
              <tr>
                <th className={`${celdaNombre} z-30`} style={{ width: 248, minWidth: 248 }}/>
                {gruposMes.map(g => (
                  <th key={g.name} colSpan={g.count}
                    className={`bg-cuaderno-hoja font-ligada font-light text-[18px] leading-[1.8] text-center text-cuaderno-tinta ${bordeSemana(g.inicio, weekColumns)}`}>
                    {g.name}
                  </th>
                ))}
                <th className={`${celdaTotal} z-30`} style={{ width: 128, minWidth: 128 }}/>
              </tr>
              {/* Semanas */}
              <tr className="shadow-[inset_0_-1.5px_0_rgb(var(--cuaderno-tinta))]">
                <th className={`${celdaNombre} z-30 text-left font-normal pl-4 py-2 text-[17px] shadow-[inset_0_-1.5px_0_rgb(var(--cuaderno-tinta))]`}>Cuenta</th>
                {weekColumns.map((w, i) => (
                  <th key={w.key}
                    className={`font-normal py-1.5 text-center shadow-[inset_0_-1.5px_0_rgb(var(--cuaderno-tinta))] ${bordeSemana(i, weekColumns)} ${w.isCurrentWeek ? "bg-cuaderno-durazno" : "bg-cuaderno-hoja"}`}
                    style={{ width: ANCHO_SEMANA, minWidth: ANCHO_SEMANA }}>
                    <div className="text-[16px] leading-tight">{w.label}</div>
                    <div className="text-[12.5px] leading-tight text-cuaderno-grafito">{w.dateRange}</div>
                  </th>
                ))}
                <th className={`${celdaTotal} z-30 font-normal text-[17px] shadow-[inset_0_-1.5px_0_rgb(var(--cuaderno-tinta))]`}>Total</th>
              </tr>
            </thead>

            <tbody>
              {/* ────────── INGRESOS ────────── */}
              <tr className="cursor-pointer select-none" onClick={() => toggleCollapse("INGRESOS")} aria-expanded={!collapsed["INGRESOS"]}>
                <td className={`${celdaNombre} border-b border-b-cuaderno-renglon pl-4 pr-3 pt-3 pb-1`}>
                  <div className="flex items-center gap-2">
                    <IconoBajar tamano={14} className={`text-cuaderno-grafito transition-transform ${collapsed["INGRESOS"] ? "-rotate-90" : ""}`} />
                    <Titulo as="span" tamano="md"><Resaltado color="menta">Ingresos</Resaltado></Titulo>
                    <span className="text-[14px] text-cuaderno-grafito">{ingresos.length} cuenta{ingresos.length !== 1 ? "s" : ""}</span>
                  </div>
                </td>
                <td colSpan={weekColumns.length} className="border-b border-b-cuaderno-renglon border-l-[3px] border-double border-l-cuaderno-margen"/>
                <td className={`${celdaTotal} border-b border-b-cuaderno-renglon text-[16.5px]`}><Cifra valor={totalIngresos} /></td>
              </tr>

              {!collapsed["INGRESOS"] && ingresos.map(c => (
                <AccountRow key={c.id} account={c} {...filaProps} />
              ))}

              {/* Subtotal ingresos */}
              {!collapsed["INGRESOS"] && (
                <tr>
                  <td className={`${celdaNombre} border-b border-b-cuaderno-renglon pl-8 py-2 text-[17px]`}>Subtotal ingresos</td>
                  {weekColumns.map((w, i) => {
                    const t = weekTotal(w.key, ingresos);
                    return (
                      <td key={w.key} className={`border-b border-b-cuaderno-renglon px-2 py-2 text-right text-[16px] ${bordeSemana(i, weekColumns)} ${w.isCurrentWeek ? "bg-cuaderno-durazno/40" : ""}`}>
                        {t > 0 && <Cifra valor={t} raya="total" />}
                      </td>
                    );
                  })}
                  <td className={`${celdaTotal} border-b border-b-cuaderno-renglon py-2 text-[16.5px]`}><Cifra valor={totalIngresos} raya="total" /></td>
                </tr>
              )}

              {/* ────────── EGRESOS ────────── */}
              <tr className="cursor-pointer select-none" onClick={() => toggleCollapse("EGRESOS")} aria-expanded={!collapsed["EGRESOS"]}>
                <td className={`${celdaNombre} border-b border-b-cuaderno-renglon pl-4 pr-3 pt-5 pb-1`}>
                  <div className="flex items-center gap-2">
                    <IconoBajar tamano={14} className={`text-cuaderno-grafito transition-transform ${collapsed["EGRESOS"] ? "-rotate-90" : ""}`} />
                    <Titulo as="span" tamano="md"><Resaltado color="rosa">Egresos</Resaltado></Titulo>
                    <span className="text-[14px] text-cuaderno-grafito">{egresos.length} cuenta{egresos.length !== 1 ? "s" : ""}</span>
                  </div>
                </td>
                <td colSpan={weekColumns.length} className="border-b border-b-cuaderno-renglon border-l-[3px] border-double border-l-cuaderno-margen"/>
                <td className={`${celdaTotal} border-b border-b-cuaderno-renglon text-[16.5px]`}><Cifra valor={totalEgresos} /></td>
              </tr>

              {!collapsed["EGRESOS"] && subcatsEgresoActivas.map(subcat => {
                const cuentasSubcat = egresos.filter(c => c.subcategoria === subcat);
                const totSubcat = weekColumns.reduce((s, w) => s + weekTotal(w.key, cuentasSubcat), 0);
                return (
                  <React.Fragment key={subcat}>
                    {/* Subcategoría */}
                    <tr className="cursor-pointer select-none" onClick={() => toggleCollapse("EGR-" + subcat)} aria-expanded={!collapsed["EGR-" + subcat]}>
                      <td className={`${celdaNombre} border-b border-b-cuaderno-renglon pl-6 pr-3 pt-3 pb-0.5`}>
                        <div className="flex items-center gap-2">
                          <IconoBajar tamano={12} className={`text-cuaderno-grafito transition-transform ${collapsed["EGR-"+subcat] ? "-rotate-90" : ""}`} />
                          <span className="text-[18px] underline decoration-cuaderno-columna decoration-[1.5px] underline-offset-[5px]">{casoOracion(subcat)}</span>
                          <span className="text-[13px] text-cuaderno-grafito">{cuentasSubcat.length} cuenta{cuentasSubcat.length !== 1 ? "s" : ""}</span>
                        </div>
                      </td>
                      <td colSpan={weekColumns.length} className="border-b border-b-cuaderno-renglon border-l-[3px] border-double border-l-cuaderno-margen"/>
                      <td className={`${celdaTotal} border-b border-b-cuaderno-renglon text-[15px]`}><Cifra valor={totSubcat} /></td>
                    </tr>
                    {!collapsed["EGR-" + subcat] && cuentasSubcat.map(c => (
                      <AccountRow key={c.id} account={c} {...filaProps} sangria="pl-11" onOpenDetalle={abrirDetalle} />
                    ))}
                  </React.Fragment>
                );
              })}

              {/* Egresos sin subcategoría */}
              {!collapsed["EGRESOS"] && egresos.filter(c => !c.subcategoria).map(c => (
                <AccountRow key={c.id} account={c} {...filaProps} onOpenDetalle={abrirDetalle} />
              ))}

              {/* Subtotal egresos */}
              {!collapsed["EGRESOS"] && (
                <tr>
                  <td className={`${celdaNombre} border-b border-b-cuaderno-renglon pl-8 py-2 text-[17px]`}>Subtotal egresos</td>
                  {weekColumns.map((w, i) => {
                    const t = weekTotal(w.key, egresos);
                    return (
                      <td key={w.key} className={`border-b border-b-cuaderno-renglon px-2 py-2 text-right text-[16px] ${bordeSemana(i, weekColumns)} ${w.isCurrentWeek ? "bg-cuaderno-durazno/40" : ""}`}>
                        {t < 0 && <Cifra valor={t} raya="total" />}
                      </td>
                    );
                  })}
                  <td className={`${celdaTotal} border-b border-b-cuaderno-renglon py-2 text-[16.5px]`}><Cifra valor={totalEgresos} raya="total" /></td>
                </tr>
              )}
            </tbody>

            {/* ── Cierre: queda pegado abajo al desplazar ── */}
            <tfoot className="sticky bottom-0 z-20">
              <tr>
                <td className={`${celdaNombre} z-30 pl-4 py-2.5 text-[18px] shadow-[inset_0_1.5px_0_rgb(var(--cuaderno-tinta))]`}>Neto de la semana</td>
                {weekColumns.map((w, i) => {
                  const neto = weekTotal(w.key, ingresos) + weekTotal(w.key, egresos);
                  return (
                    <td key={w.key} className={`px-2 py-2.5 text-right text-[16px] shadow-[inset_0_1.5px_0_rgb(var(--cuaderno-tinta))] ${bordeSemana(i, weekColumns)} ${w.isCurrentWeek ? "bg-cuaderno-durazno" : "bg-cuaderno-hoja"}`}>
                      <Cifra valor={neto} />
                    </td>
                  );
                })}
                <td className={`${celdaTotal} z-30 py-2.5 text-[16.5px] shadow-[inset_0_1.5px_0_rgb(var(--cuaderno-tinta))]`}><Cifra valor={kpiNeto} vacio="0" /></td>
              </tr>
              <tr>
                <td className={`${celdaNombre} z-30 pl-4 pt-1.5 pb-3`}>
                  <div className="text-[18px] leading-tight">Saldo acumulado</div>
                  {saldoBanco > 0
                    ? <div className="text-[13px] text-cuaderno-grafito">desde un saldo de <Cifra valor={saldoBanco} color="heredar" /></div>
                    : <div className="text-[13px] text-cuaderno-roja">saldo inicial sin anotar</div>}
                </td>
                {weekColumns.map((w, i) => (
                  <td key={w.key} className={`px-2 pt-1.5 pb-3 text-right text-[16px] ${bordeSemana(i, weekColumns)} ${w.isCurrentWeek ? "bg-cuaderno-durazno" : "bg-cuaderno-hoja"}`}>
                    <Cifra valor={acumulados[w.key] || 0} vacio="0" />
                  </td>
                ))}
                <td className={`${celdaTotal} z-30 pt-1.5 pb-3 text-[16.5px]`}><Cifra valor={acumuladoFinal} vacio="0" raya="doble" /></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* ── Resumen mensual ─────────────────────────────────────────────────── */}
      {tabActiva === "resumen" && (
        <div className={`flex-1 overflow-y-auto pb-8 space-y-5 ${expandido ? "px-4" : "px-8"}`}>
          {[0, 1].map(mIdx => {
            const semsMes = weekColumns.filter(w => w.monthIndex === mIdx);
            if (!semsMes.length) return null;
            const mesIng  = semsMes.reduce((s, w) => s + weekTotal(w.key, ingresos), 0);
            const mesEgr  = semsMes.reduce((s, w) => s + weekTotal(w.key, egresos),  0);
            const mesNeto = mesIng + mesEgr;
            const isActual = mIdx === 0;
            return (
              <section key={mIdx} className="bg-cuaderno-hoja border border-cuaderno-columna rounded-md max-w-4xl">
                {/* Mes */}
                <header className="flex flex-wrap items-end justify-between gap-3 px-6 pt-3 pb-2 border-b-[3px] border-double border-cuaderno-margen">
                  <div className="flex items-baseline gap-3">
                    <Titulo as="h2" tamano="lg">{semsMes[0].monthName} {semsMes[0].startDate.getFullYear()}</Titulo>
                    {isActual && <Resaltado color="durazno" className="text-[15px]">mes en curso</Resaltado>}
                    <span className="text-[14px] text-cuaderno-grafito">{semsMes.length} semanas</span>
                  </div>
                </header>

                <div className="px-6 py-4 grid gap-x-12 gap-y-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
                  {/* Cuentas del mes */}
                  <div>
                    <LineaGuia etiqueta="Ingresos"><Cifra valor={mesIng} vacio="0" /></LineaGuia>
                    <LineaGuia etiqueta="Egresos"><Cifra valor={mesEgr} vacio="0" /></LineaGuia>
                    <LineaGuia etiqueta="Neto"><Cifra valor={mesNeto} vacio="0" raya="doble" /></LineaGuia>
                    <LineaGuia etiqueta="Margen">
                      <span className={mesNeto >= 0 ? "text-cuaderno-tinta" : "text-cuaderno-roja"}>
                        {mesIng > 0 ? `${Math.round((mesNeto / mesIng) * 100)}%` : "—"}
                      </span>
                    </LineaGuia>
                  </div>

                  {/* Semana a semana */}
                  <div>
                    <div className="text-[15px] text-cuaderno-grafito">Semana a semana</div>
                    <div className="flex items-end gap-3 px-1 pb-1 text-[13px] text-cuaderno-grafito">
                      <span className="flex-1" />
                      <span className="w-20 text-right">ingresos</span>
                      <span className="w-20 text-right">egresos</span>
                      <span className="w-24 text-right">neto</span>
                    </div>
                    {semsMes.map(w => {
                      const wIng  = weekTotal(w.key, ingresos);
                      const wEgr  = weekTotal(w.key, egresos);
                      const wNeto = wIng + wEgr;
                      return (
                        <div key={w.key} className={`flex items-center gap-3 min-h-[38px] border-b border-cuaderno-renglon px-1 ${w.isCurrentWeek ? "bg-cuaderno-durazno/50" : ""}`}>
                          <span className="w-9 text-[16px] flex-shrink-0">{w.label}</span>
                          <span className="flex-1 min-w-0 text-[13px] text-cuaderno-grafito whitespace-nowrap">{w.dateRange}</span>
                          <span className="w-20 text-right text-[15px]"><Cifra valor={wIng} /></span>
                          <span className="w-20 text-right text-[15px]"><Cifra valor={wEgr} /></span>
                          <span className="w-24 text-right text-[16px]"><Cifra valor={wNeto} vacio="0" /></span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Presupuesto contra real — solo mes en curso y si hay cuentas con presupuesto */}
                {isActual && (() => {
                  const cuentasConBudget = egresos.filter(c => parseInput(c.presupuestoMensual || "0") > 0);
                  if (!cuentasConBudget.length) return null;
                  return (
                    <div className="px-6 pb-5">
                      <Titulo as="h3" tamano="sm" className="border-t border-cuaderno-renglon pt-3">Presupuesto contra real</Titulo>
                      <div className="space-y-3 mt-1">
                        {cuentasConBudget.map(c => {
                          const budget = parseInput(c.presupuestoMensual || "0");
                          const gasto  = Math.abs(semsMes.reduce((s, w) => s + (payments[`${c.id}-${w.key}`] || 0), 0));
                          const pct    = budget > 0 ? Math.min((gasto / budget) * 100, 100) : 0;
                          const over   = gasto > budget;
                          const warn   = pct >= 80 && !over;
                          return (
                            <div key={c.id}>
                              <div className="flex items-center justify-between gap-3 text-[16px]">
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="truncate">{casoTitulo(c.nombre)}</span>
                                  {over && <Resaltado color="rosa" className="text-[13px]">excedido</Resaltado>}
                                  {warn && <Resaltado color="durazno" className="text-[13px]">80%</Resaltado>}
                                </div>
                                <span className="flex items-center gap-1.5 flex-shrink-0">
                                  <Cifra valor={gasto} color={over ? "roja" : "tinta"} vacio="0" />
                                  <span className="text-cuaderno-grafito">de</span>
                                  <Cifra valor={budget} color="grafito" />
                                </span>
                              </div>
                              <div className="mt-1 h-[2px] bg-cuaderno-renglon">
                                <div className={`h-full ${over ? "bg-cuaderno-roja" : warn ? "bg-cuaderno-roja/60" : "bg-cuaderno-verde"}`} style={{ width: `${pct}%` }}/>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}

                {/* Compromisos que se repiten — solo mes siguiente */}
                {mIdx === 1 && (() => {
                  const recurrentes = [...ingresos, ...egresos].filter(c => c.recurrente && c.montoRecurrente);
                  if (!recurrentes.length) return null;
                  const totalEgr = recurrentes.filter(c=>c.categoria==="EGRESOS").reduce((s,c)=>{
                    const freq = c.frecuenciaRecurrente||"mensual";
                    const monto = Math.abs(parseInput(c.montoRecurrente));
                    const v = freq==="semanal"?semsMes.length:freq==="quincenal"?Math.ceil(semsMes.length/2):1;
                    return s+monto*v;
                  },0);
                  return (
                    <div className="px-6 pb-5">
                      <div className="flex items-end justify-between border-t border-cuaderno-renglon pt-3">
                        <Titulo as="h3" tamano="sm">Compromisos que se repiten</Titulo>
                        <span className="text-[16px] pb-1"><Cifra valor={-totalEgr} /></span>
                      </div>
                      {recurrentes.map(c => {
                        const freq = c.frecuenciaRecurrente || "mensual";
                        const monto = Math.abs(parseInput(c.montoRecurrente));
                        const veces = freq === "semanal" ? semsMes.length : freq === "quincenal" ? Math.ceil(semsMes.length/2) : 1;
                        const total = monto * veces;
                        const isEgr = c.categoria === "EGRESOS";
                        const freqLabel = freq === "semanal" ? `${veces} semanas` : freq === "quincenal" ? `${veces} quincenas` : "una vez";
                        return (
                          <div key={c.id} className="flex items-center gap-3 min-h-[36px] border-b border-cuaderno-renglon text-[16px]">
                            <span className="text-cuaderno-grafito text-[14px]" aria-hidden="true">↺</span>
                            <span className="flex-1 min-w-0 truncate">{casoTitulo(c.nombre)}</span>
                            <span className="text-[13px] text-cuaderno-grafito flex-shrink-0">{freqLabel}</span>
                            <span className="w-24 text-right flex-shrink-0"><Cifra valor={isEgr ? -total : total} /></span>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </section>
            );
          })}
        </div>
      )}

      {/* Panel lateral de detalle de cuenta (egresos) */}
      {cuentaDetalle && (
        <PanelDetalleCuenta
          empresaId={empresaId}
          cuenta={cuentaDetalle}
          proveedor={proveedores.find(p => p.id === cuentaDetalle.proveedorId) || null}
          proveedores={proveedores}
          weekColumns={weekColumns}
          payments={payments} paymentsPaid={paymentsPaid} paymentNotas={paymentNotas}
          bloqueado={showModalCuenta || showModalSaldo}
          onClose={() => setCuentaDetalleId(null)}
          onEditarCuenta={c => { setEditandoCuenta(c); setShowModalCuenta(true); }}
          onVincularProveedor={handleVincularProveedor}/>
      )}

      {/* Modales */}
      {showModalCuenta && (
        <ModalCuenta editando={editandoCuenta} onSave={handleSaveCuenta} proveedores={proveedores}
          onClose={() => { setShowModalCuenta(false); setEditandoCuenta(null); }}/>
      )}
      {showModalSaldo && (
        <ModalSaldo saldo={saldoBanco} onSave={handleSaldoBanco} onClose={() => setShowModalSaldo(false)}/>
      )}
    </div>
  );
}
