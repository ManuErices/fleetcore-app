import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  collection, query, orderBy, getDocs,
  addDoc, updateDoc, deleteDoc, doc, serverTimestamp
} from "firebase/firestore";
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from "firebase/storage";
import { db, storage } from "../../lib/firebase";
import { useEmpresa } from "../../lib/useEmpresa";
import { useFinanzas, ProyectoSelector } from "./FinanzasContext";
import {
  Cifra, Titulo, Hoja, LineaGuia, Boton, Campo, Segmentado, Casilla, Nota, Resaltado, VistoBueno,
  ModalCuaderno, FechaHoja,
  IconoMas, IconoLapiz, IconoBorrar, IconoDocumento, IconoActualizar, IconoSubir,
} from "./cuaderno";

// ─── Documentos ────────────────────────────────────────────────────────────
const DOCS_DEF_COSTO = [
  { key: "vencPermisoCirculacion", label: "Permiso Circulación" },
  { key: "vencSeguro",             label: "Contrato"             },
  { key: "vencRevisionTecnica",    label: "Rev. Técnica"         },
  { key: "vencSoapCivil",          label: "SOAP / Civil"         },
];

// ─── Constantes ───────────────────────────────────────────────────────────────
// Los colores e íconos por categoría eran del diseño anterior. En el cuaderno la
// categoría se escribe, sin color: el color queda reservado para los estados.
const CATEGORIAS = [
  { id: "credito",  label: "Crédito Bancario",       short: "CB" },
  { id: "leasing",  label: "Leasing",                short: "CL" },
  { id: "arriendo", label: "Arriendo",               short: "AR" },
  { id: "seguro",   label: "Seguro",                 short: "SE" },
  { id: "servicio", label: "Servicio / Suscripción", short: "SU" },
  { id: "otro",     label: "Crédito Automotriz",     short: "CA" },
];
const CAT_MAP = Object.fromEntries(CATEGORIAS.map(c => [c.id, c]));
// Categorías que llevan seguimiento de cuotas (créditos y leasing)
const TIENE_CUOTAS = ["credito", "leasing", "otro"];

const FRECUENCIAS = [
  { id: "mensual",    label: "Mensual"    },
  { id: "trimestral", label: "Trimestral" },
  { id: "semestral",  label: "Semestral"  },
  { id: "anual",      label: "Anual"      },
  { id: "unico",      label: "Pago único" },
];
const FREC_MAP = Object.fromEntries(FRECUENCIAS.map(f => [f.id, f.label]));

const MONEDAS = [
  { id: "CLP", label: "CLP $" },
  { id: "UF",  label: "UF"    },
  { id: "USD", label: "USD"   },
];

const EMPTY = {
  nombre: "", categoria: "credito", descripcion: "", monto: "",
  moneda: "CLP", frecuencia: "mensual", fechaInicio: "", fechaTermino: "",
  proveedor: "", numeroContrato: "", diaPago: "", notas: "", activo: true,
  activoVinculadoId: "", cuotasTotales: "", cuotasPagadas: "0",
  archivosDoc: { vencPermisoCirculacion: "", vencSeguro: "", vencRevisionTecnica: "", vencSoapCivil: "" },
};

// ─── Utilidades ───────────────────────────────────────────────────────────────
function montoMensual(c) {
  const m = parseFloat(c.monto) || 0;
  if (c.frecuencia === "mensual")    return m;
  if (c.frecuencia === "trimestral") return m / 3;
  if (c.frecuencia === "semestral")  return m / 6;
  if (c.frecuencia === "anual")      return m / 12;
  return 0;
}
function fmt(n, moneda = "CLP") {
  if (moneda === "UF")  return `UF ${n.toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (moneda === "USD") return `US$${n.toLocaleString("es-CL", { minimumFractionDigits: 2 })}`;
  return `$${Math.round(n).toLocaleString("es-CL")}`;
}
function fmtM(n) {
  if (Math.abs(n) >= 1000000) return "$" + (n / 1000000).toFixed(1).replace(".", ",") + "M";
  return "$" + Math.round(n).toLocaleString("es-CL");
}
function diasRestantes(f) {
  if (!f) return null;
  return Math.ceil((new Date(f) - new Date()) / 86400000);
}
function estadoDoc(f) {
  const d = diasRestantes(f); if (d === null) return null;
  if (d < 0) return "vencido"; if (d <= 30) return "urgente"; if (d <= 90) return "pronto"; return "ok";
}
// Cuántas cuotas deberían llevarse pagadas a la fecha, según fecha de inicio y frecuencia
function cuotasEsperadas(c) {
  const total = parseInt(c.cuotasTotales) || 0;
  if (!c.fechaInicio || !total) return null;
  const inicio = new Date(c.fechaInicio + "T00:00:00");
  const hoy = new Date();
  if (hoy < inicio) return 0;
  const divisor = c.frecuencia === "trimestral" ? 3 : c.frecuencia === "semestral" ? 6 : c.frecuencia === "anual" ? 12 : 1;
  const meses = (hoy.getFullYear() - inicio.getFullYear()) * 12 + (hoy.getMonth() - inicio.getMonth()) + (hoy.getDate() >= inicio.getDate() ? 1 : 0);
  const periodos = Math.floor(meses / divisor);
  return Math.min(Math.max(periodos, 0), total);
}

// Montos en pesos van alineados en casillas. UF y dólares se escriben con su
// moneda: alinearlos con los pesos haría pensar que son la misma unidad.
function MontoMoneda({ valor, moneda = "CLP" }) {
  if (moneda && moneda !== "CLP") return <span className="whitespace-nowrap">{fmt(valor, moneda)}</span>;
  return <Cifra valor={valor} escala="pesos" vacio="$0" color="tinta" />;
}

// ─── Editor inline de fecha de vencimiento (click para abrir date picker) ───
function FechaDocEditor({ fecha, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState(fecha || "");
  const e = estadoDoc(fecha);
  const d = diasRestantes(fecha);
  // Estado del vencimiento, resaltado a mano
  const marca = {
    vencido: <Resaltado color="rosa">vencido</Resaltado>,
    urgente: <Resaltado color="durazno">{d} días</Resaltado>,
    pronto:  <span className="text-cuaderno-tinta">{d} días</span>,
    ok:      <span className="inline-flex items-center gap-1 text-cuaderno-grafito">{d} días <VistoBueno tamano={11} titulo="" /></span>,
  }[e];

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <input
          type="date" autoFocus value={draft}
          aria-label="Fecha de vencimiento"
          onChange={ev => setDraft(ev.target.value)}
          onKeyDown={ev => { if (ev.key === "Enter") { onSave(draft); setEditing(false); } if (ev.key === "Escape") setEditing(false); }}
          className="min-h-[32px] text-[14px] bg-transparent border-0 border-b-[1.5px] border-cuaderno-tinta focus:outline-none"
        />
        <Boton variante="texto" className="min-h-[32px] text-[14px]" onClick={() => { onSave(draft); setEditing(false); }}>listo</Boton>
        <Boton variante="texto" className="min-h-[32px] text-[14px] text-cuaderno-grafito" onClick={() => setEditing(false)}>cancelar</Boton>
      </div>
    );
  }
  return (
    <button onClick={() => { setDraft(fecha || ""); setEditing(true); }}
      className="min-h-[32px] text-[14px] underline decoration-dotted decoration-cuaderno-columna underline-offset-4 hover:decoration-cuaderno-tinta"
      title="Fijar o cambiar la fecha de vencimiento">
      {fecha ? marca : <span className="text-cuaderno-grafito">sin fecha</span>}
    </button>
  );
}

// ─── Uploader de documento individual (mismo patrón que Activos) ────────────
function DocUploaderCosto({ label, docKey, costoId, empresaId, urlActual, onUploaded }) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress]   = useState(0);
  const [error, setError]         = useState(null);
  const inputRef                  = useRef(null);

  const esImagen = urlActual && /\.(jpg|jpeg|png|gif|webp)/i.test(urlActual.split("?")[0]);
  const nombreArchivo = urlActual
    ? decodeURIComponent(urlActual.split("/").pop().split("?")[0]).replace(/.*_/, "")
    : null;

  const handleFile = (file) => {
    if (!file) return;
    const maxMB = 10;
    if (file.size > maxMB * 1024 * 1024) { setError(`Máximo ${maxMB}MB`); return; }
    setError(null);
    setUploading(true);
    setProgress(0);
    const ext     = file.name.split(".").pop();
    const path    = `empresas/${empresaId}/costos_fijos/${costoId}/${docKey}_${Date.now()}.${ext}`;
    const storRef = ref(storage, path);
    const task    = uploadBytesResumable(storRef, file);
    task.on("state_changed",
      snap => setProgress(Math.round(snap.bytesTransferred / snap.totalBytes * 100)),
      () => { setError("Error al subir"); setUploading(false); },
      async () => {
        const url = await getDownloadURL(task.snapshot.ref);
        onUploaded(docKey, url);
        setUploading(false);
      }
    );
  };

  const handleEliminarArchivo = async () => {
    if (!urlActual) return;
    try { await deleteObject(ref(storage, urlActual)); } catch (e) { /* ya no existe */ }
    onUploaded(docKey, "");
  };

  return (
    <div>
      {label && <p className="m-0 mb-1 text-[14px] text-cuaderno-grafito">{label}</p>}
      {urlActual ? (
        <div className="flex items-center gap-2 min-h-[44px] border-b border-cuaderno-azul">
          <IconoDocumento tamano={15} className="text-cuaderno-grafito" />
          <div className="flex-1 min-w-0">
            <a href={urlActual} target="_blank" rel="noopener noreferrer" title="Abrir el archivo"
              className="block text-[15px] text-cuaderno-tinta truncate underline decoration-cuaderno-azul underline-offset-4 hover:decoration-cuaderno-tinta">
              {nombreArchivo || "Archivo subido"}
            </a>
            <span className="inline-flex items-center gap-1 text-[13px] text-cuaderno-verde">
              <VistoBueno tamano={11} titulo="" /> respaldado{esImagen ? ", imagen" : ""}
            </span>
          </div>
          <button onClick={() => inputRef.current?.click()} aria-label="Reemplazar archivo" title="Reemplazar archivo"
            className="w-8 h-8 rounded-md flex items-center justify-center text-cuaderno-grafito hover:text-cuaderno-tinta hover:bg-cuaderno-papel flex-shrink-0">
            <IconoActualizar tamano={14} />
          </button>
          <button onClick={handleEliminarArchivo} aria-label="Quitar archivo" title="Quitar archivo"
            className="w-8 h-8 rounded-md flex items-center justify-center text-cuaderno-grafito hover:text-cuaderno-roja hover:bg-cuaderno-rosa/40 flex-shrink-0">
            <IconoBorrar tamano={14} />
          </button>
        </div>
      ) : uploading ? (
        <div className="min-h-[44px] flex flex-col justify-center gap-1">
          <p className="m-0 text-[14px] text-cuaderno-grafito">Subiendo… {progress}%</p>
          <div className="h-[2px] bg-cuaderno-renglon">
            <div className="h-full bg-cuaderno-tinta" style={{ width: `${progress}%` }} />
          </div>
        </div>
      ) : (
        <button onClick={() => inputRef.current?.click()}
          className="w-full min-h-[44px] flex items-center justify-center gap-2 rounded-md border-[1.5px] border-dashed border-cuaderno-columna hover:border-cuaderno-tinta hover:bg-cuaderno-papel text-[14px] text-cuaderno-tinta">
          <IconoSubir tamano={14} />
          Subir archivo
          <span className="text-cuaderno-grafito">(PDF o imagen, hasta 10 MB)</span>
        </button>
      )}
      {error && <p className="m-0 mt-1 text-[13px] text-cuaderno-roja">{error}</p>}
      <input ref={inputRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" className="sr-only"
        onChange={e => { handleFile(e.target.files?.[0]); e.target.value = ""; }} />
    </div>
  );
}

function ModalCosto({ isOpen, onClose, onSave, editando, empresaId }) {
  const [form, setForm] = useState(EMPTY);
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [activos, setActivos] = useState([]);
  const [loadingActivos, setLoadingActivos] = useState(false);

  // Cargar activos cuando el modal se abre
  useEffect(() => {
    if (!isOpen || !empresaId) return;
    setLoadingActivos(true);
    getDocs(collection(db, "empresas", empresaId, "machines"))
      .then(snap => {
        const lista = snap.docs
          .map(d => ({
            id: d.id,
            nombre: d.data().name || "",
            patente: d.data().patente || "",
            code: d.data().code || "",
            ownership: (() => {
              const raw = d.data().ownership || "OWNED";
              // Normalizar valor legacy "OWN" de FleetCore
              return raw === "OWN" ? "OWNED" : raw;
            })(),
            tipo: d.data().tipo || (() => {
              const type = (d.data().type || "").toLowerCase();
              const name = (d.data().name || "").toLowerCase();
              const esVehiculo = [
                "van","pickup","truck","bus","minibus","suv","sedan","hatchback",
                "station wagon","camioneta","furgon","furgón","minivan","jeep",
                "camión","camion","vehículo","vehiculo",
              ].some(k => type.includes(k)) ||
              [
                "camioneta","furgon","furgón","hilux","wingle","poer","maxus",
                "changan","jac","mitsubishi","toyota","ford","chevrolet",
                "nissan","hyundai","kia","volkswagen","peugeot partner",
                "great wall","gwm","jeep","suv",
              ].some(k => name.includes(k));
              return esVehiculo ? "vehiculo" : "maquinaria";
            })(),
          }))
          .filter(a => a.nombre || a.patente)
          .sort((a, b) => (a.nombre || "").localeCompare(b.nombre || ""));
        setActivos(lista);
      })
      .catch(() => {})
      .finally(() => setLoadingActivos(false));
  }, [isOpen, empresaId]);

  useEffect(() => {
    setForm(editando ? { ...EMPTY, ...editando } : EMPTY);
    setStep(1);
  }, [editando, isOpen]);

  if (!isOpen) return null;

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const cat = CAT_MAP[form.categoria] || CATEGORIAS[0];

  // Cuando se vincula un activo, pre-rellenar el nombre si está vacío
  const handleVincularActivo = (activoId) => {
    set("activoVinculadoId", activoId);
    if (!form.nombre && activoId) {
      const activo = activos.find(a => a.id === activoId);
      if (activo) {
        const label = [activo.nombre, activo.patente].filter(Boolean).join(" · ");
        set("nombre", label);
      }
    } else if (!activoId) {
      set("activoVinculadoId", "");
    }
  };

  const handleSubmit = async () => {
    if (!form.nombre || !form.monto || !form.fechaInicio) return;
    setSaving(true);
    const payload = { ...form, monto: parseFloat(form.monto) || 0 };
    if (form.categoria !== "leasing" && form.categoria !== "otro") {
      delete payload.activoVinculadoId;
    }
    if (TIENE_CUOTAS.includes(form.categoria) && form.cuotasTotales) {
      payload.cuotasTotales = parseInt(form.cuotasTotales) || 0;
      payload.cuotasPagadas = Math.min(parseInt(form.cuotasPagadas) || 0, payload.cuotasTotales);
    } else {
      payload.cuotasTotales = "";
      payload.cuotasPagadas = "0";
    }
    await onSave(payload);
    setSaving(false);
    onClose();
  };

  // Activos filtrados según categoría seleccionada
  const activosFiltrados = activos.filter(a => {
    if (form.categoria === "leasing") return a.ownership === "LEASING";
    if (form.categoria === "otro")    return a.tipo === "vehiculo" && (a.ownership === "OWNED" || a.ownership === "CREDITO_AUTO");
    return false;
  });

  const PASOS = [{ id: 1, label: "1. Lo básico" }, { id: 2, label: "2. Fechas y cuotas" }, { id: 3, label: "3. Contrato" }];
  const activoElegido = form.activoVinculadoId ? activosFiltrados.find(x => x.id === form.activoVinculadoId) : null;

  return (
    <ModalCuaderno
      titulo={editando ? "Editar costo" : "Nuevo costo fijo"}
      subtitulo={editando ? editando.nombre : "Un compromiso que se paga de forma recurrente"}
      ancho="max-w-2xl"
      onClose={onClose}
      bloqueado={saving}
      pie={
        <div className="flex flex-wrap items-center gap-2">
          {step > 1 && <Boton variante="texto" onClick={() => setStep(s => s - 1)}>Volver</Boton>}
          <div className="flex-1" />
          <Boton onClick={onClose} disabled={saving}>Cancelar</Boton>
          {step < 3
            ? <Boton variante="primario" onClick={() => setStep(s => s + 1)} disabled={step === 1 && (!form.nombre || !form.monto)}>Siguiente</Boton>
            : <Boton variante="primario" onClick={handleSubmit} disabled={saving || !form.nombre || !form.monto || !form.fechaInicio}>
                {saving ? "Guardando…" : editando ? "Guardar cambios" : "Crear costo"}
              </Boton>}
        </div>
      }>

      {/* Pasos: es una secuencia de verdad, por eso van numerados */}
      <div role="tablist" className="flex flex-wrap gap-x-5 border-b border-cuaderno-azul -mt-1">
        {PASOS.map(p => {
          const alcanzable = step > p.id || p.id === 1;
          return (
            <button key={p.id} role="tab" aria-selected={step === p.id}
              onClick={() => alcanzable ? setStep(p.id) : null}
              disabled={!alcanzable && step !== p.id}
              className={`min-h-[40px] -mb-px border-b-2 text-[17px] ${
                step === p.id ? "border-cuaderno-tinta text-cuaderno-tinta" : "border-transparent text-cuaderno-grafito disabled:opacity-50"}`}>
              {p.label}
            </button>
          );
        })}
      </div>

      {step === 1 && (
        <>
          <Segmentado
            etiqueta="Categoría"
            opciones={CATEGORIAS.map(c => ({ id: c.id, label: c.label }))}
            valor={form.categoria}
            onCambiar={id => set("categoria", id)}
          />

          {/* Activo vinculado (solo leasing y crédito automotriz) */}
          {(form.categoria === "leasing" || form.categoria === "otro") && (
            <div className="border border-cuaderno-azul rounded-md px-4 py-3 space-y-2">
              <p className="m-0 text-[17px]">Vincular a un activo</p>
              <p className="m-0 -mt-1 text-[14px] text-cuaderno-grafito">
                {form.categoria === "leasing" ? "Activos registrados con financiamiento leasing" : "Vehículos registrados en FleetCore"}
              </p>
              {loadingActivos ? (
                <p className="m-0 text-[15px] text-cuaderno-grafito">Buscando activos…</p>
              ) : activosFiltrados.length === 0 ? (
                <p className="m-0 text-[15px] text-cuaderno-grafito">
                  {form.categoria === "leasing" ? "No hay activos con leasing registrados." : "No hay vehículos registrados."}
                </p>
              ) : (
                <Campo as="select" etiqueta="Activo" value={form.activoVinculadoId || ""} onChange={e => handleVincularActivo(e.target.value)}>
                  <option value="">Sin activo vinculado</option>
                  {activosFiltrados.map(a => {
                    const label = a.nombre
                      ? [a.nombre, a.patente || a.code].filter(Boolean).join(", ")
                      : (a.patente || a.code || a.id);
                    return <option key={a.id} value={a.id}>{label}</option>;
                  })}
                </Campo>
              )}
              {activoElegido && (
                <p className="m-0 flex items-center gap-2 text-[15px]">
                  <VistoBueno tamano={13} titulo="" />
                  Vinculado a {activoElegido.nombre}{activoElegido.patente ? `, ${activoElegido.patente}` : ""}
                  <Boton variante="texto" className="ml-auto min-h-[32px] text-[14px] text-cuaderno-grafito" onClick={() => set("activoVinculadoId", "")}>desvincular</Boton>
                </p>
              )}
            </div>
          )}

          <Campo etiqueta="Nombre" value={form.nombre} onChange={e => set("nombre", e.target.value)} placeholder="Ej: crédito Caterpillar D8" />

          <div className="grid grid-cols-[6rem_1fr_1fr] gap-4 items-end">
            <Campo as="select" etiqueta="Moneda" value={form.moneda} onChange={e => set("moneda", e.target.value)}>
              {MONEDAS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
            </Campo>
            <Campo etiqueta="Monto" type="number" inputMode="decimal" value={form.monto} onChange={e => set("monto", e.target.value)} placeholder="0" />
            <Campo as="select" etiqueta="Frecuencia" value={form.frecuencia} onChange={e => set("frecuencia", e.target.value)}>
              {FRECUENCIAS.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
            </Campo>
          </div>

          <Campo as="textarea" rows={2} etiqueta="Descripción" value={form.descripcion} onChange={e => set("descripcion", e.target.value)}
            placeholder="En pocas palabras, de qué se trata" />
        </>
      )}

      {step === 2 && (
        <>
          <div className="grid grid-cols-2 gap-4">
            <Campo etiqueta="Fecha de inicio" type="date" value={form.fechaInicio} onChange={e => set("fechaInicio", e.target.value)} />
            <Campo etiqueta="Fecha de término" type="date" value={form.fechaTermino} onChange={e => set("fechaTermino", e.target.value)} />
          </div>

          <div className="flex items-end gap-4">
            <Campo etiqueta="Día de pago" type="number" min="1" max="31" className="w-28"
              value={form.diaPago} onChange={e => set("diaPago", e.target.value)} placeholder="1 a 31" />
            {form.diaPago && (
              <p className="m-0 pb-2 text-[16px] text-cuaderno-grafito">
                Se paga el día {form.diaPago} de cada {form.frecuencia === "mensual" ? "mes" : "período"}.
              </p>
            )}
          </div>

          <Campo etiqueta="Proveedor o institución" value={form.proveedor} onChange={e => set("proveedor", e.target.value)}
            placeholder="Ej: Banco BCI, inmobiliaria" />

          {TIENE_CUOTAS.includes(form.categoria) && (
            <div className="border border-cuaderno-azul rounded-md px-4 py-3 space-y-3">
              <p className="m-0 text-[17px]">Cuotas</p>
              <div className="grid grid-cols-2 gap-4">
                <Campo etiqueta="Total de cuotas" type="number" min="0" value={form.cuotasTotales}
                  onChange={e => set("cuotasTotales", e.target.value)} placeholder="Ej: 48" />
                <Campo etiqueta="Cuotas pagadas" type="number" min="0" max={form.cuotasTotales || undefined} value={form.cuotasPagadas}
                  onChange={e => set("cuotasPagadas", e.target.value)} placeholder="0" />
              </div>
              {form.cuotasTotales && (() => {
                const esperadas = cuotasEsperadas(form);
                const pagadas = parseInt(form.cuotasPagadas) || 0;
                if (esperadas === null) return null;
                const atraso = esperadas - pagadas;
                return atraso > 0
                  ? <Nota etiqueta="Ojo:">van atrasadas {atraso} cuota{atraso > 1 ? "s" : ""}; a la fecha deberían ir {esperadas} de {form.cuotasTotales}.</Nota>
                  : <p className="m-0 flex items-center gap-1.5 text-[16px] text-cuaderno-verde"><VistoBueno tamano={14} titulo="" /> Al día: se esperan {esperadas} de {form.cuotasTotales}.</p>;
              })()}
            </div>
          )}

          <div className="border-t border-cuaderno-azul pt-4">
            <Casilla marcada={form.activo} onCambiar={v => set("activo", v)}
              descripcion="Los costos inactivos no se suman al resumen mensual">
              Costo activo
            </Casilla>
          </div>
        </>
      )}

      {step === 3 && (
        <>
          <Campo etiqueta="N° de contrato o referencia" value={form.numeroContrato} onChange={e => set("numeroContrato", e.target.value)}
            placeholder="Ej: CTR-2024-0123" />
          <Campo as="textarea" rows={3} etiqueta="Notas" value={form.notas} onChange={e => set("notas", e.target.value)}
            placeholder="Condiciones especiales u observaciones" />

          <div className="border-t border-cuaderno-azul pt-3">
            <Titulo as="h3" tamano="sm">Antes de guardar, revisa</Titulo>
            <LineaGuia etiqueta="Nombre"><span>{form.nombre || "—"}</span></LineaGuia>
            <LineaGuia etiqueta="Categoría"><span>{cat.label}</span></LineaGuia>
            {activoElegido && <LineaGuia etiqueta="Activo vinculado"><span>{activoElegido.nombre}</span></LineaGuia>}
            <LineaGuia etiqueta="Monto"><MontoMoneda valor={parseFloat(form.monto) || 0} moneda={form.moneda} /></LineaGuia>
            <LineaGuia etiqueta="Frecuencia"><span>{FREC_MAP[form.frecuencia]}</span></LineaGuia>
            <LineaGuia etiqueta="Inicio"><span>{form.fechaInicio || "—"}</span></LineaGuia>
            <LineaGuia etiqueta="Día de pago"><span>{form.diaPago ? `día ${form.diaPago}` : "—"}</span></LineaGuia>
            {TIENE_CUOTAS.includes(form.categoria) && form.cuotasTotales && (
              <LineaGuia etiqueta="Cuotas"><span>{form.cuotasPagadas || 0} de {form.cuotasTotales}</span></LineaGuia>
            )}
            <LineaGuia etiqueta="Estado"><span className={form.activo ? "" : "text-cuaderno-grafito"}>{form.activo ? "activo" : "inactivo"}</span></LineaGuia>
          </div>
        </>
      )}
    </ModalCuaderno>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function FinanzasCostos() {
  const { proyectoId } = useFinanzas();
  const { empresaId } = useEmpresa();
  const [costos, setCostos]                   = useState([]);
  const [loading, setLoading]                 = useState(true);
  const [showModal, setShowModal]             = useState(false);
  const [editando, setEditando]               = useState(null);
  const [filtroCategoria, setFiltroCategoria] = useState("todos");
  const [filtroEstado, setFiltroEstado]       = useState("activos");
  const [busqueda, setBusqueda]               = useState("");
  const [vistaDetalle, setVistaDetalle]       = useState(null);
  const [deletingId, setDeletingId]           = useState(null);
  const [sortCol, setSortCol]                 = useState("nombre");
  const [sortDir, setSortDir]                 = useState("asc");
  const [editingCuotasId, setEditingCuotasId] = useState(null);
  const [cuotasDraft, setCuotasDraft]         = useState("");

  const cargar = async () => {
    if (!empresaId) { setLoading(false); return; }
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, "empresas", empresaId, "costos_fijos"), orderBy("fechaCreacion", "desc")));
      setCostos(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error(e); }
    setLoading(false);
  };
  useEffect(() => { cargar(); }, [empresaId]);

  const handleSave = async (form) => {
    if (editando) {
      await updateDoc(doc(db, "empresas", empresaId, "costos_fijos", editando.id), form);
    } else {
      await addDoc(collection(db, "empresas", empresaId, "costos_fijos"), { ...form, fechaCreacion: serverTimestamp() });
    }
    setEditando(null);
    cargar();
  };

  const handleEliminar = async (id) => {
    if (!window.confirm("¿Eliminar este costo? Esta acción no se puede deshacer.")) return;
    setDeletingId(id);
    await deleteDoc(doc(db, "empresas", empresaId, "costos_fijos", id));
    setDeletingId(null);
    if (vistaDetalle?.id === id) setVistaDetalle(null);
    cargar();
  };

  const toggleActivo = async (c) => {
    await updateDoc(doc(db, "empresas", empresaId, "costos_fijos", c.id), { activo: !c.activo });
    cargar();
  };

  const abrirEdicionCuotas = (c) => {
    setEditingCuotasId(c.id);
    setCuotasDraft(String(c.cuotasPagadas ?? 0));
  };

  const guardarCuotas = async (c) => {
    const total = parseInt(c.cuotasTotales) || 0;
    let val = parseInt(cuotasDraft);
    if (isNaN(val)) val = 0;
    val = Math.max(0, total ? Math.min(val, total) : val);
    await updateDoc(doc(db, "empresas", empresaId, "costos_fijos", c.id), { cuotasPagadas: val });
    setEditingCuotasId(null);
    cargar();
  };

  const handleDocUploaded = async (c, docKey, url) => {
    const archivosDoc = { ...(c.archivosDoc || {}), [docKey]: url };
    await updateDoc(doc(db, "empresas", empresaId, "costos_fijos", c.id), { archivosDoc });
    setVistaDetalle(prev => prev && prev.id === c.id ? { ...prev, archivosDoc } : prev);
    cargar();
  };

  const handleFechaDocUpdated = async (c, fechaKey, value) => {
    await updateDoc(doc(db, "empresas", empresaId, "costos_fijos", c.id), { [fechaKey]: value });
    setVistaDetalle(prev => prev && prev.id === c.id ? { ...prev, [fechaKey]: value } : prev);
    cargar();
  };

  const handleSort = (col) => {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("asc"); }
  };

  const costosFiltrados = useMemo(() => {
    const filtered = costos.filter(c => {
      if (filtroEstado === "activos"   && !c.activo) return false;
      if (filtroEstado === "inactivos" &&  c.activo) return false;
      if (filtroCategoria !== "todos" && c.categoria !== filtroCategoria) return false;
      if (busqueda) {
        const b = busqueda.toLowerCase();
        return (c.nombre||"").toLowerCase().includes(b) || (c.proveedor||"").toLowerCase().includes(b) || (c.descripcion||"").toLowerCase().includes(b);
      }
      return true;
    });
    return [...filtered].sort((a, b) => {
      const map = {
        nombre: [(a.nombre||"").toLowerCase(), (b.nombre||"").toLowerCase()],
        cat:    [a.categoria||"", b.categoria||""],
        prov:   [(a.proveedor||"").toLowerCase(), (b.proveedor||"").toLowerCase()],
        monto:  [parseFloat(a.monto)||0, parseFloat(b.monto)||0],
        mens:   [montoMensual(a), montoMensual(b)],
        frec:   [a.frecuencia||"", b.frecuencia||""],
        dia:    [parseInt(a.diaPago)||0, parseInt(b.diaPago)||0],
        venc:   [a.fechaTermino||"9999", b.fechaTermino||"9999"],
        cuotas: [parseInt(a.cuotasPagadas)||0, parseInt(b.cuotasPagadas)||0],
      };
      const [va, vb] = map[sortCol] || ["",""];
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ?  1 : -1;
      return 0;
    });
  }, [costos, filtroEstado, filtroCategoria, busqueda, sortCol, sortDir]);

  const activos      = useMemo(() => costos.filter(c => c.activo), [costos]);
  const totalMensual = useMemo(() => activos.reduce((s, c) => s + montoMensual(c), 0), [activos]);
  const porCategoria = useMemo(() => {
    const res = {};
    activos.forEach(c => { res[c.categoria] = (res[c.categoria] || 0) + montoMensual(c); });
    return res;
  }, [activos]);
  const topCat = useMemo(() => {
    const entries = Object.entries(porCategoria);
    if (!entries.length) return null;
    return entries.sort((a,b) => b[1]-a[1])[0];
  }, [porCategoria]);

  // ── Solo presentación ─────────────────────────────────────────────────────
  const COLUMNAS = [
    { col: "nombre", label: "Costo",       align: "text-left",   cls: "min-w-[210px]" },
    { col: "cat",    label: "Categoría",   align: "text-left",   cls: "" },
    { col: "prov",   label: "Proveedor",   align: "text-left",   cls: "hidden md:table-cell" },
    { col: "mens",   label: "Al mes",      align: "text-right",  cls: "" },
    { col: "cuotas", label: "Cuotas",      align: "text-center", cls: "" },
    { col: "frec",   label: "Frecuencia",  align: "text-left",   cls: "hidden sm:table-cell" },
    { col: "venc",   label: "Término",     align: "text-left",   cls: "hidden lg:table-cell" },
    { col: "dia",    label: "Día de pago", align: "text-center", cls: "hidden lg:table-cell" },
  ];
  const distribucion = Object.entries(porCategoria).sort((a, b) => b[1] - a[1]);
  const totalFiltrado = costosFiltrados.filter(c => c.activo).reduce((s, c) => s + montoMensual(c), 0);

  if (loading) return (
    <div className="cuaderno flex items-center justify-center h-64 text-[18px] text-cuaderno-grafito">
      Buscando los costos…
    </div>
  );

  return (
    <div className="cuaderno px-8 pt-5 pb-10 space-y-5">

      <FechaHoja />

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Titulo>Costos fijos</Titulo>
          <p className="m-0 text-[17px] text-cuaderno-grafito">Créditos, leasing, arriendos y compromisos que se repiten.</p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <ProyectoSelector variante="cuaderno" />
          <Boton variante="primario" onClick={() => { setEditando(null); setShowModal(true); }}>
            <IconoMas tamano={14} /> Nuevo costo
          </Boton>
        </div>
      </header>

      {/* Resumen y distribución */}
      <div className="grid gap-5 lg:grid-cols-2">
        <Hoja titulo="Resumen">
          <LineaGuia etiqueta="Costo al mes"><Cifra valor={totalMensual} escala="pesos" vacio="$0" raya="doble" /></LineaGuia>
          <p className="m-0 -mt-1 mb-1 text-right text-[13px] text-cuaderno-grafito">{activos.length} costos activos</p>
          <LineaGuia etiqueta="Proyección del año"><Cifra valor={totalMensual * 12} escala="pesos" vacio="$0" /></LineaGuia>
          <LineaGuia etiqueta="Mayor categoría">
            <span>{topCat ? (CAT_MAP[topCat[0]]?.label || "—") : "—"}</span>
          </LineaGuia>
          {topCat && <p className="m-0 -mt-1 mb-1 text-right text-[13px] text-cuaderno-grafito"><Cifra valor={topCat[1]} escala="pesos" color="heredar" /> al mes</p>}
          <LineaGuia etiqueta="Registros"><span>{costos.length}</span></LineaGuia>
          <p className="m-0 -mt-1 text-right text-[13px] text-cuaderno-grafito">{costos.filter(c => !c.activo).length} inactivos</p>
        </Hoja>

        <Hoja titulo="Por categoría, al mes">
          {activos.length > 0 && totalMensual > 0 ? (
            <div className="space-y-3">
              {distribucion.map(([cat, monto]) => {
                const pct = (monto / totalMensual) * 100;
                return (
                  <div key={cat}>
                    <div className="flex items-baseline justify-between gap-3 text-[17px]">
                      <span>{CAT_MAP[cat]?.label || cat}</span>
                      <span className="flex items-baseline gap-3">
                        <Cifra valor={monto} escala="pesos" />
                        <span className="w-12 text-right text-[15px] text-cuaderno-grafito">{pct.toFixed(1).replace(".", ",")}%</span>
                      </span>
                    </div>
                    <div className="mt-1 h-2.5 bg-cuaderno-renglon/60 rounded-sm overflow-hidden">
                      <div className="h-full bg-cuaderno-lavanda rounded-sm" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="m-0 py-6 text-center text-[16px] text-cuaderno-grafito">Sin costos activos todavía.</p>
          )}
        </Hoja>
      </div>

      {/* Tabla */}
      <Hoja titulo="Detalle"
        extra={
          <>
            <Campo etiqueta="Buscar" type="search" className="w-56"
              value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Nombre, proveedor o descripción" />
            <Segmentado
              opciones={[{ id: "todos", label: "Todos" }, { id: "activos", label: "Activos" }, { id: "inactivos", label: "Inactivos" }]}
              valor={filtroEstado}
              onCambiar={setFiltroEstado}
            />
            <Campo as="select" etiqueta="Categoría" value={filtroCategoria} onChange={e => setFiltroCategoria(e.target.value)}>
              <option value="todos">Todas</option>
              {CATEGORIAS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
            </Campo>
          </>
        }>
        {costosFiltrados.length === 0 ? (
          <div className="py-12 text-center space-y-2">
            <p className="m-0 font-ligada font-light text-[22px] leading-[1.6]">
              {busqueda || filtroCategoria !== "todos" ? "Nada coincide con los filtros" : "Aún no hay costos anotados"}
            </p>
            <p className="m-0 text-[16px] text-cuaderno-grafito">
              {busqueda || filtroCategoria !== "todos" ? "Prueba con otra búsqueda o categoría." : "Agrega el primero con el botón Nuevo costo."}
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="shadow-[inset_0_-1.5px_0_rgb(var(--cuaderno-tinta))]">
                    {COLUMNAS.map(({ col, label, align, cls }) => {
                      const activa = sortCol === col;
                      return (
                        <th key={col} className={`${cls} ${align} font-normal text-[15px] px-2 py-2 whitespace-nowrap`}
                          aria-sort={activa ? (sortDir === "asc" ? "ascending" : "descending") : undefined}>
                          <button onClick={() => handleSort(col)} className="min-h-[36px] text-cuaderno-grafito hover:text-cuaderno-tinta">
                            {label}{activa && <span aria-hidden="true">{sortDir === "asc" ? " ↑" : " ↓"}</span>}
                          </button>
                        </th>
                      );
                    })}
                    <th className="font-normal text-[15px] text-center text-cuaderno-grafito px-2 py-2">Estado</th>
                    <th className="w-20"><span className="sr-only">Acciones</span></th>
                  </tr>
                </thead>
                <tbody>
                  {costosFiltrados.map(c => {
                    const meta = CAT_MAP[c.categoria] || CATEGORIAS[5];
                    const dias = diasRestantes(c.fechaTermino);
                    return (
                      <tr key={c.id} tabIndex={0}
                        onClick={() => setVistaDetalle(vistaDetalle?.id === c.id ? null : c)}
                        onKeyDown={e => { if (e.key === "Enter") setVistaDetalle(c); }}
                        className={`group border-b border-cuaderno-renglon cursor-pointer hover:bg-cuaderno-papel focus:outline-none focus-visible:bg-cuaderno-papel ${!c.activo ? "opacity-60" : ""}`}>
                        <td className="px-2 py-2">
                          <p className="m-0 text-[17px] leading-tight truncate">{c.nombre}</p>
                          {c.descripcion && <p className="m-0 text-[13px] text-cuaderno-grafito truncate max-w-[240px]">{c.descripcion}</p>}
                        </td>
                        <td className="px-2 py-2 text-[15px] text-cuaderno-grafito whitespace-nowrap">{meta.label}</td>
                        <td className="px-2 py-2 text-[15px] hidden md:table-cell truncate max-w-[140px]">{c.proveedor || <span className="text-cuaderno-grafito">—</span>}</td>
                        <td className="px-2 py-2 text-right text-[16px] whitespace-nowrap">
                          {c.frecuencia !== "unico"
                            ? <MontoMoneda valor={montoMensual(c)} moneda={c.moneda} />
                            : <span className="text-[14px] text-cuaderno-grafito">pago único</span>}
                        </td>
                        <td className="px-2 py-2 text-center" onClick={e => e.stopPropagation()}>
                          {!TIENE_CUOTAS.includes(c.categoria) || !c.cuotasTotales ? (
                            <span className="text-cuaderno-grafito">—</span>
                          ) : editingCuotasId === c.id ? (
                            <div className="flex items-center justify-center gap-1">
                              <input
                                autoFocus type="number" min="0" max={c.cuotasTotales}
                                aria-label="Cuotas pagadas"
                                value={cuotasDraft}
                                onChange={e => setCuotasDraft(e.target.value)}
                                onKeyDown={e => { if (e.key === "Enter") guardarCuotas(c); if (e.key === "Escape") setEditingCuotasId(null); }}
                                className="w-12 min-h-[32px] text-center text-[15px] bg-cuaderno-tarjeta border-0 border-b-[1.5px] border-cuaderno-tinta focus:outline-none"
                              />
                              <span className="text-[14px] text-cuaderno-grafito">de {c.cuotasTotales}</span>
                              <Boton variante="texto" className="min-h-[32px] text-[14px]" onClick={() => guardarCuotas(c)}>listo</Boton>
                            </div>
                          ) : (() => {
                            const esperadas = cuotasEsperadas(c);
                            const pagadas = parseInt(c.cuotasPagadas) || 0;
                            const atraso = esperadas !== null ? esperadas - pagadas : 0;
                            return (
                              <button onClick={() => abrirEdicionCuotas(c)} title="Actualizar las cuotas pagadas"
                                className="inline-flex flex-col items-center min-h-[36px] justify-center px-1 rounded-sm hover:bg-cuaderno-hoja">
                                <span className="text-[15px] whitespace-nowrap underline decoration-dotted decoration-cuaderno-columna underline-offset-4">
                                  {pagadas} de {c.cuotasTotales}
                                </span>
                                {atraso > 0 && <Resaltado color="rosa" className="text-[12px] whitespace-nowrap">{atraso} atrasada{atraso > 1 ? "s" : ""}</Resaltado>}
                              </button>
                            );
                          })()}
                        </td>
                        <td className="px-2 py-2 text-[15px] text-cuaderno-grafito hidden sm:table-cell whitespace-nowrap">{(FREC_MAP[c.frecuencia] || c.frecuencia || "").toLowerCase()}</td>
                        <td className="px-2 py-2 text-[15px] hidden lg:table-cell whitespace-nowrap">
                          {c.fechaTermino
                            ? dias < 0
                              ? <Resaltado color="menta">terminado</Resaltado>
                              : dias <= 30
                              ? <Resaltado color="durazno">en {dias} días</Resaltado>
                              : <span className="text-cuaderno-grafito">{new Date(c.fechaTermino).toLocaleDateString("es-CL")}</span>
                            : <span className="text-cuaderno-grafito">—</span>}
                        </td>
                        <td className="px-2 py-2 text-center text-[15px] hidden lg:table-cell whitespace-nowrap">
                          {c.diaPago ? `día ${c.diaPago}` : <span className="text-cuaderno-grafito">—</span>}
                        </td>
                        <td className="px-2 py-2 text-center whitespace-nowrap" onClick={e => e.stopPropagation()}>
                          <button onClick={() => toggleActivo(c)} title={c.activo ? "Marcar como inactivo" : "Marcar como activo"}
                            className="min-h-[36px] px-1 text-[15px] rounded-sm hover:bg-cuaderno-hoja">
                            {c.activo ? <Resaltado color="menta">activo</Resaltado> : <span className="text-cuaderno-grafito px-[0.3em]">inactivo</span>}
                          </button>
                        </td>
                        <td className="px-2 py-2" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100">
                            <button onClick={() => { setEditando(c); setShowModal(true); }} aria-label={`Editar ${c.nombre}`} title="Editar"
                              className="w-8 h-8 rounded-md flex items-center justify-center text-cuaderno-grafito hover:text-cuaderno-tinta hover:bg-cuaderno-hoja">
                              <IconoLapiz tamano={14} />
                            </button>
                            <button onClick={() => handleEliminar(c.id)} disabled={deletingId === c.id} aria-label={`Eliminar ${c.nombre}`} title="Eliminar"
                              className="w-8 h-8 rounded-md flex items-center justify-center text-cuaderno-grafito hover:text-cuaderno-roja hover:bg-cuaderno-rosa/40 disabled:opacity-50">
                              {deletingId === c.id ? <span className="text-[12px]">…</span> : <IconoBorrar tamano={14} />}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-end justify-between gap-3 pt-3">
              <span className="text-[15px] text-cuaderno-grafito">{costosFiltrados.length} costos en la lista</span>
              <LineaGuia etiqueta="Total al mes de los activos" className="w-full max-w-md">
                <Cifra valor={totalFiltrado} escala="pesos" vacio="$0" raya="doble" />
              </LineaGuia>
            </div>
          </>
        )}
      </Hoja>

      {/* Ficha del costo */}
      {vistaDetalle && (() => {
        const c = vistaDetalle;
        const meta = CAT_MAP[c.categoria] || CATEGORIAS[5];
        const dias = diasRestantes(c.fechaTermino);
        return (
          <ModalCuaderno
            titulo={c.nombre}
            subtitulo={[meta.label, c.descripcion].filter(Boolean).join(", ")}
            ancho="max-w-4xl"
            capa="z-50"
            cerrarAlClicFuera
            onClose={() => setVistaDetalle(null)}
            pie={
              <div className="flex justify-end">
                <Boton onClick={() => { setEditando(c); setShowModal(true); setVistaDetalle(null); }}>
                  <IconoLapiz tamano={14} /> Editar costo
                </Boton>
              </div>
            }>
            <div className="grid gap-x-12 md:grid-cols-2">
              <div>
                <LineaGuia etiqueta="Monto"><MontoMoneda valor={parseFloat(c.monto) || 0} moneda={c.moneda} /></LineaGuia>
                <LineaGuia etiqueta="Equivalente al mes">
                  {c.frecuencia !== "unico" ? <MontoMoneda valor={montoMensual(c)} moneda={c.moneda} /> : <span className="text-cuaderno-grafito">pago único</span>}
                </LineaGuia>
                <LineaGuia etiqueta="Frecuencia"><span>{(FREC_MAP[c.frecuencia] || "").toLowerCase()}</span></LineaGuia>
                <LineaGuia etiqueta="Proveedor"><span>{c.proveedor || "—"}</span></LineaGuia>
              </div>
              <div>
                <LineaGuia etiqueta="Inicio"><span>{c.fechaInicio || "—"}</span></LineaGuia>
                <LineaGuia etiqueta="Término">
                  {c.fechaTermino
                    ? (dias !== null && dias < 0
                        ? <Resaltado color="menta">{c.fechaTermino}, terminado</Resaltado>
                        : dias !== null && dias <= 30
                        ? <Resaltado color="durazno">{c.fechaTermino}</Resaltado>
                        : <span>{c.fechaTermino}</span>)
                    : <span className="text-cuaderno-grafito">sin fecha</span>}
                </LineaGuia>
                <LineaGuia etiqueta="Día de pago"><span>{c.diaPago ? `día ${c.diaPago}` : "—"}</span></LineaGuia>
                <LineaGuia etiqueta="N° de contrato"><span>{c.numeroContrato || "—"}</span></LineaGuia>
              </div>
            </div>

            {TIENE_CUOTAS.includes(c.categoria) && c.cuotasTotales && (() => {
              const esperadas = cuotasEsperadas(c);
              const pagadas = parseInt(c.cuotasPagadas) || 0;
              const total = parseInt(c.cuotasTotales) || 0;
              const atraso = esperadas !== null ? esperadas - pagadas : 0;
              const pct = total ? Math.min(100, (pagadas / total) * 100) : 0;
              return (
                <div>
                  <div className="flex items-baseline justify-between gap-3">
                    <Titulo as="h3" tamano="sm">Cuotas</Titulo>
                    <span className="text-[16px]">
                      {pagadas} de {total} pagadas{" "}
                      {atraso > 0
                        ? <Resaltado color="rosa">{atraso} atrasada{atraso > 1 ? "s" : ""}</Resaltado>
                        : <span className="text-cuaderno-verde">al día</span>}
                    </span>
                  </div>
                  <div className="mt-1 h-2.5 bg-cuaderno-renglon/60 rounded-sm overflow-hidden">
                    <div className={`h-full rounded-sm ${atraso > 0 ? "bg-cuaderno-rosa" : "bg-cuaderno-menta"}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })()}

            <div>
              <Titulo as="h3" tamano="sm" className="border-b border-cuaderno-azul">Documentos</Titulo>
              <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2 mt-2">
                {DOCS_DEF_COSTO.map(({ key, label }) => (
                  <div key={key}>
                    <div className="flex items-center justify-between gap-2">
                      <p className="m-0 text-[16px]">{label}</p>
                      <FechaDocEditor fecha={c[key]} onSave={(val) => handleFechaDocUpdated(c, key, val)} />
                    </div>
                    <DocUploaderCosto
                      label="" docKey={key}
                      costoId={c.id} empresaId={empresaId}
                      urlActual={c.archivosDoc?.[key] || ""}
                      onUploaded={(docKey, url) => handleDocUploaded(c, docKey, url)}
                    />
                  </div>
                ))}
              </div>
            </div>

            {c.notas && (
              <div>
                <Titulo as="h3" tamano="sm">Notas</Titulo>
                <p className="m-0 text-[17px] whitespace-pre-line leading-relaxed">{c.notas}</p>
              </div>
            )}
          </ModalCuaderno>
        );
      })()}

      <ModalCosto isOpen={showModal} onClose={() => { setShowModal(false); setEditando(null); }} onSave={handleSave} editando={editando} empresaId={empresaId} />
    </div>
  );
}
