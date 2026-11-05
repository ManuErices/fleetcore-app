import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  collection, getDocs,
  addDoc, updateDoc, deleteDoc, doc, serverTimestamp
} from "firebase/firestore";
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from "firebase/storage";
import { db, storage } from "../../lib/firebase";
import { useEmpresa } from "../../lib/useEmpresa";
import {
  Cifra, Titulo, Hoja, LineaGuia, Resaltado, Nota, VistoBueno, Boton, Campo,
  ModalCuaderno, Segmentado, FechaHoja,
  IconoMas, IconoLapiz, IconoBorrar, IconoDocumento, IconoActualizar, IconoSubir,
} from "../finanzas/cuaderno";

// ─── Constantes ───────────────────────────────────────────────────────────────
const TIPOS = [
  { id: "maquinaria",  label: "Maquinaria"  },
  { id: "vehiculo",    label: "Vehículo"    },
  { id: "herramienta", label: "Herramienta" },
  { id: "otro",        label: "Otro"        },
];
const TIPO_MAP = Object.fromEntries(TIPOS.map(t => [t.id, t]));

const OWN_LABELS = {
  OWNED: "Propio",
  RENTED: "Arrendado",
  LEASING: "Leasing",
  CREDITO_AUTO: "Créd. Automotriz",
};

const DOCS_DEF = [
  { key: "vencPermisoCirculacion", label: "Permiso Circulación" },
  { key: "vencSeguro",             label: "Seguro"               },
  { key: "vencRevisionTecnica",    label: "Rev. Técnica"         },
  { key: "vencSoapCivil",          label: "SOAP / Civil"         },
];

const EMPTY = {
  nombre: "", tipo: "maquinaria", code: "", marca: "", modelo: "", patente: "",
  ownership: "OWNED", propietario: "", projectId: "",
  valorCompra: "", valorLibros: "", fechaCompra: "", vidaUtilAnios: "", moneda: "CLP",
  depreciacionAnual: "", vencPermisoCirculacion: "", vencSeguro: "",
  vencRevisionTecnica: "", vencSoapCivil: "", notasDoc: "", notas: "", activo: true, machineId: null,
  archivosDoc: { vencPermisoCirculacion: "", vencSeguro: "", vencRevisionTecnica: "", vencSoapCivil: "" },
};

// ─── Utilidades ───────────────────────────────────────────────────────────────
function fmt(n, moneda = "CLP") {
  if (!n && n !== 0) return "—";
  if (moneda === "UF")  return `UF ${Number(n).toLocaleString("es-CL", { minimumFractionDigits: 2 })}`;
  if (moneda === "USD") return `US$${Number(n).toLocaleString("es-CL", { minimumFractionDigits: 2 })}`;
  return `$${Math.round(Number(n)).toLocaleString("es-CL")}`;
}
function diasR(f) { if (!f) return null; return Math.ceil((new Date(f) - new Date()) / 86400000); }
function estadoDoc(f) {
  const d = diasR(f); if (d === null) return null;
  if (d < 0) return "vencido"; if (d <= 30) return "urgente"; if (d <= 90) return "pronto"; return "ok";
}
function depAnual(a) {
  if (a.depreciacionAnual) return parseFloat(a.depreciacionAnual) || 0;
  const v = parseFloat(a.valorCompra) || 0, y = parseFloat(a.vidaUtilAnios) || 0;
  return (!v || !y) ? 0 : v / y;
}
function valorLibros(a) {
  if (a.valorLibros) return parseFloat(a.valorLibros) || 0;
  const v = parseFloat(a.valorCompra) || 0;
  if (!v || !a.fechaCompra) return v;
  const yrs = (new Date() - new Date(a.fechaCompra)) / (365.25 * 86400000);
  return Math.max(0, v - depAnual(a) * yrs);
}
function tieneAlerta(a) {
  return DOCS_DEF.some(({ key }) => { const e = estadoDoc(a[key]); return e === "vencido" || e === "urgente"; });
}

// ─── Presentación ─────────────────────────────────────────────────────────────
// Pesos alineados en casillas. UF y dólares se escriben con su moneda:
// alinearlos con los pesos haría pensar que son la misma unidad.
function Monto({ valor, moneda = "CLP", vacio = "—", raya }) {
  const n = Number(valor);
  if (!valor || !Number.isFinite(n) || n === 0) return <span className="text-cuaderno-grafito">{vacio}</span>;
  if (moneda && moneda !== "CLP") return <span className="whitespace-nowrap">{fmt(n, moneda)}</span>;
  return <Cifra valor={n} escala="pesos" raya={raya} />;
}

/** Estado de un vencimiento, resaltado a mano. */
function MarcaVencimiento({ fecha }) {
  const e = estadoDoc(fecha);
  if (!e) return <span className="text-cuaderno-grafito">sin fecha</span>;
  const d = diasR(fecha);
  if (e === "vencido") return <Resaltado color="rosa">vencido hace {Math.abs(d)} días</Resaltado>;
  if (e === "urgente") return <Resaltado color="durazno">vence en {d} días</Resaltado>;
  if (e === "pronto")  return <span className="text-cuaderno-tinta">{d} días</span>;
  return <span className="inline-flex items-center gap-1 text-cuaderno-grafito">{d} días <VistoBueno tamano={11} titulo="" /></span>;
}

// ─── DocUploader ──────────────────────────────────────────────────────────────
function DocUploader({ label, docKey, activoId, empresaId, urlActual, onUploaded }) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress]  = useState(0);
  const [error, setError]        = useState(null);
  const inputRef                 = useRef(null);

  const esImagen    = urlActual && /\.(jpg|jpeg|png|gif|webp)/i.test(urlActual.split("?")[0]);
  const nombreArchivo = urlActual
    ? decodeURIComponent(urlActual.split("/").pop().split("?")[0]).replace(/.*_/, "")
    : null;

  const handleFile = (file) => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { setError("Máximo 10MB"); return; }
    setError(null); setUploading(true); setProgress(0);
    const ext    = file.name.split(".").pop();
    const path   = `empresas/${empresaId}/activos/${activoId}/${docKey}_${Date.now()}.${ext}`;
    const storRef = ref(storage, path);
    const task   = uploadBytesResumable(storRef, file);
    task.on("state_changed",
      snap => setProgress(Math.round(snap.bytesTransferred / snap.totalBytes * 100)),
      ()   => { setError("Error al subir"); setUploading(false); },
      async () => {
        const url = await getDownloadURL(task.snapshot.ref);
        onUploaded(docKey, url);
        setUploading(false);
      }
    );
  };

  const handleEliminar = async () => {
    if (!urlActual) return;
    try { await deleteObject(ref(storage, urlActual)); } catch {}
    onUploaded(docKey, "");
  };

  return (
    <div className="mt-2">
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
          <button type="button" onClick={() => inputRef.current?.click()} aria-label={`Reemplazar archivo de ${label}`} title="Reemplazar archivo"
            className="w-8 h-8 rounded-md flex items-center justify-center text-cuaderno-grafito hover:text-cuaderno-tinta hover:bg-cuaderno-papel flex-shrink-0">
            <IconoActualizar tamano={14} />
          </button>
          <button type="button" onClick={handleEliminar} aria-label={`Quitar archivo de ${label}`} title="Quitar archivo"
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
        <button type="button" onClick={() => inputRef.current?.click()}
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

// ─── Modal Activo ─────────────────────────────────────────────────────────────
function ModalActivo({ isOpen, onClose, onSave, editando }) {
  const { empresaId } = useEmpresa();
  const [form, setForm] = useState(EMPTY);
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setForm(editando ? { ...EMPTY, ...editando } : EMPTY); setStep(1); }, [editando, isOpen]);
  if (!isOpen) return null;

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const depEst  = depAnual(form);
  const vlEst   = valorLibros(form);

  const submit = async () => {
    if (!form.nombre) return;
    setSaving(true); await onSave(form); setSaving(false); onClose();
  };

  const PASOS = [{ id: 1, label: "1. Identificación" }, { id: 2, label: "2. Financiero" }, { id: 3, label: "3. Documentos" }];

  return (
    <ModalCuaderno
      titulo={editando ? "Editar activo" : "Nuevo activo"}
      subtitulo={editando ? editando.nombre : "Registra un activo de la empresa"}
      ancho="max-w-2xl"
      capa="z-50"
      cerrarAlClicFuera={false}
      bloqueado={saving}
      onClose={onClose}
      pie={
        <div className="flex flex-wrap items-center gap-2">
          {step > 1 && <Boton variante="texto" onClick={() => setStep(s => s - 1)}>Volver</Boton>}
          <div className="flex-1" />
          <Boton onClick={onClose} disabled={saving}>Cancelar</Boton>
          {step < 3
            ? <Boton variante="primario" onClick={() => setStep(s => s + 1)} disabled={step === 1 && !form.nombre}>Siguiente</Boton>
            : <Boton variante="primario" onClick={submit} disabled={saving || !form.nombre}>
                {saving ? "Guardando…" : editando ? "Guardar cambios" : "Crear activo"}
              </Boton>}
        </div>
      }>

      {/* Pasos: es una secuencia de verdad, por eso van numerados */}
      <div role="tablist" className="flex flex-wrap gap-x-5 border-b border-cuaderno-azul -mt-1">
        {PASOS.map(p => {
          const alcanzable = step > p.id;
          return (
            <button key={p.id} type="button" role="tab" aria-selected={step === p.id}
              onClick={() => step > p.id ? setStep(p.id) : null}
              disabled={!alcanzable && step !== p.id}
              className={`min-h-[40px] -mb-px border-b-2 text-[17px] ${
                step === p.id ? "border-cuaderno-tinta text-cuaderno-tinta" : "border-transparent text-cuaderno-grafito disabled:opacity-50"}`}>
              {p.label}
            </button>
          );
        })}
      </div>

      {/* Paso 1 — Identificación */}
      {step === 1 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
          <Campo etiqueta="Nombre" className="sm:col-span-2" required
            value={form.nombre} onChange={e => set("nombre", e.target.value)} placeholder="Ej: Bulldozer CAT D6" />
          <Campo as="select" etiqueta="Tipo" value={form.tipo} onChange={e => set("tipo", e.target.value)}>
            {TIPOS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
          </Campo>
          <Campo etiqueta="Código interno" value={form.code} onChange={e => set("code", e.target.value)} placeholder="Ej: MAQ-001" />
          <Campo etiqueta="Marca" value={form.marca} onChange={e => set("marca", e.target.value)} placeholder="Ej: Caterpillar" />
          <Campo etiqueta="Modelo" value={form.modelo} onChange={e => set("modelo", e.target.value)} placeholder="Ej: D6T" />
          <Campo etiqueta="Patente" value={form.patente} onChange={e => set("patente", e.target.value.toUpperCase())} placeholder="Ej: ABCD12" />
          <Campo as="select" etiqueta="Propiedad" value={form.ownership} onChange={e => set("ownership", e.target.value)}>
            {Object.entries(OWN_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Campo>
          <Campo etiqueta="Propietario" className="sm:col-span-2"
            value={form.propietario} onChange={e => set("propietario", e.target.value)} placeholder="Nombre propietario" />
        </div>
      )}

      {/* Paso 2 — Financiero */}
      {step === 2 && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
            <Campo as="select" etiqueta="Moneda" value={form.moneda} onChange={e => set("moneda", e.target.value)}>
              <option value="CLP">CLP ($)</option>
              <option value="UF">UF</option>
              <option value="USD">USD</option>
            </Campo>
            <Campo type="date" etiqueta="Fecha de compra" value={form.fechaCompra} onChange={e => set("fechaCompra", e.target.value)} />
            <Campo type="number" etiqueta="Valor de compra" value={form.valorCompra} onChange={e => set("valorCompra", e.target.value)} placeholder="0" />
            <Campo type="number" etiqueta="Valor libros actual" value={form.valorLibros} onChange={e => set("valorLibros", e.target.value)} placeholder="Calculado automático" />
            <Campo type="number" etiqueta="Vida útil (años)" value={form.vidaUtilAnios} onChange={e => set("vidaUtilAnios", e.target.value)} placeholder="Ej: 10" />
            <Campo type="number" etiqueta="Dep. anual manual" value={form.depreciacionAnual} onChange={e => set("depreciacionAnual", e.target.value)} placeholder="Calculado automático" />
          </div>
          {(parseFloat(form.valorCompra) > 0 || parseFloat(form.vidaUtilAnios) > 0) && (
            <div className="border-t border-cuaderno-azul pt-3">
              <Titulo as="h3" tamano="sm">Estimación de depreciación</Titulo>
              <LineaGuia etiqueta="Dep. anual"><Monto valor={depEst} moneda={form.moneda} /></LineaGuia>
              <LineaGuia etiqueta="Dep. mensual"><Monto valor={depEst / 12} moneda={form.moneda} /></LineaGuia>
              <LineaGuia etiqueta="Valor libros hoy"><Monto valor={vlEst} moneda={form.moneda} raya="doble" /></LineaGuia>
            </div>
          )}
          <Campo as="textarea" rows={2} etiqueta="Notas" value={form.notas} onChange={e => set("notas", e.target.value)}
            placeholder="Condiciones de financiamiento, garantías..." />
        </>
      )}

      {/* Paso 3 — Documentos */}
      {step === 3 && (
        <>
          <Titulo as="h3" tamano="sm">Vencimientos de documentos</Titulo>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-5 -mt-2">
            {DOCS_DEF.map(({ key, label }) => (
              <div key={key}>
                <Campo type="date" etiqueta={label} value={form[key] || ""} onChange={e => set(key, e.target.value)} />
                {form[key] && (() => {
                  const d = diasR(form[key]);
                  if (d < 0) return <p className="m-0 mt-1 text-[14px]"><Resaltado color="rosa">vencido hace {Math.abs(d)} días</Resaltado></p>;
                  if (d <= 30) return <p className="m-0 mt-1 text-[14px]"><Resaltado color="durazno">vence en {d} días</Resaltado></p>;
                  return <p className="m-0 mt-1 inline-flex items-center gap-1 text-[14px] text-cuaderno-grafito">vigente, {d} días <VistoBueno tamano={11} titulo="" /></p>;
                })()}
                <DocUploader
                  label={label}
                  docKey={key}
                  activoId={editando?.id || "nuevo"}
                  empresaId={empresaId}
                  urlActual={form.archivosDoc?.[key] || ""}
                  onUploaded={(k, url) => set("archivosDoc", { ...(form.archivosDoc || {}), [k]: url })}
                />
              </div>
            ))}
          </div>
          <Campo as="textarea" rows={2} etiqueta="Notas de documentos" value={form.notasDoc} onChange={e => set("notasDoc", e.target.value)}
            placeholder="N° de póliza, observaciones..." />
          <div className="border-t border-cuaderno-azul pt-3">
            <Titulo as="h3" tamano="sm">Antes de guardar, revisa</Titulo>
            <LineaGuia etiqueta="Nombre"><span>{form.nombre || "—"}</span></LineaGuia>
            <LineaGuia etiqueta="Tipo"><span>{TIPO_MAP[form.tipo]?.label}</span></LineaGuia>
            <LineaGuia etiqueta="Valor compra"><Monto valor={form.valorCompra} moneda={form.moneda} /></LineaGuia>
            <LineaGuia etiqueta="Valor libros"><Monto valor={vlEst} moneda={form.moneda} raya="doble" /></LineaGuia>
          </div>
        </>
      )}
    </ModalCuaderno>
  );
}

// ─── Ficha del activo ─────────────────────────────────────────────────────────
function PanelDetalle({ activo, onClose, onEdit }) {
  if (!activo) return null;
  const vl   = valorLibros(activo);
  const dep  = depAnual(activo);

  return (
    <ModalCuaderno
      titulo={activo.nombre}
      subtitulo={[activo.code, [activo.marca, activo.modelo].filter(Boolean).join(" ")].filter(Boolean).join(", ")}
      ancho="max-w-4xl"
      capa="z-50"
      cerrarAlClicFuera
      onClose={onClose}
      pie={
        <div className="flex justify-end">
          <Boton onClick={onEdit}><IconoLapiz tamano={14} /> Editar activo</Boton>
        </div>
      }>
      <div className="grid gap-x-12 gap-y-5 md:grid-cols-2">
        <div>
          <Titulo as="h3" tamano="sm" className="border-b border-cuaderno-azul">Identificación</Titulo>
          <LineaGuia etiqueta="Tipo"><span>{TIPO_MAP[activo.tipo]?.label || "—"}</span></LineaGuia>
          <LineaGuia etiqueta="Patente"><span>{activo.patente || "—"}</span></LineaGuia>
          <LineaGuia etiqueta="Propiedad"><span>{OWN_LABELS[activo.ownership] || activo.ownership || "—"}</span></LineaGuia>
          <LineaGuia etiqueta="Propietario"><span>{activo.propietario || "—"}</span></LineaGuia>
        </div>
        <div>
          <Titulo as="h3" tamano="sm" className="border-b border-cuaderno-azul">Financiero</Titulo>
          <LineaGuia etiqueta="Valor compra"><Monto valor={activo.valorCompra} moneda={activo.moneda} /></LineaGuia>
          <LineaGuia etiqueta="Dep. anual"><Monto valor={dep > 0 ? dep : 0} moneda={activo.moneda} /></LineaGuia>
          <LineaGuia etiqueta="Dep. mensual"><Monto valor={dep > 0 ? dep / 12 : 0} moneda={activo.moneda} /></LineaGuia>
          <LineaGuia etiqueta="Valor libros"><Monto valor={vl} moneda={activo.moneda} raya="doble" /></LineaGuia>
          <LineaGuia etiqueta="Vida útil"><span>{activo.vidaUtilAnios ? `${activo.vidaUtilAnios} años` : "—"}</span></LineaGuia>
          <LineaGuia etiqueta="Fecha compra"><span>{activo.fechaCompra || "—"}</span></LineaGuia>
        </div>
      </div>

      <div>
        <Titulo as="h3" tamano="sm" className="border-b border-cuaderno-azul">Documentos</Titulo>
        <div className="grid gap-x-12 sm:grid-cols-2 mt-1">
          {DOCS_DEF.map(({ key, label }) => {
            const url = activo.archivosDoc?.[key];
            return (
              <div key={key}>
                <LineaGuia etiqueta={label}><span className="text-[16px]"><MarcaVencimiento fecha={activo[key]} /></span></LineaGuia>
                {url && (
                  <a href={url} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 -mt-1 mb-1 text-[15px] text-cuaderno-tinta underline decoration-cuaderno-azul underline-offset-4 hover:decoration-cuaderno-tinta">
                    <IconoDocumento tamano={14} className="text-cuaderno-grafito" />
                    Ver o descargar
                  </a>
                )}
              </div>
            );
          })}
        </div>
        {activo.notasDoc && <p className="m-0 mt-2 text-[16px] text-cuaderno-grafito whitespace-pre-line">{activo.notasDoc}</p>}
      </div>

      {activo.notas && (
        <div>
          <Titulo as="h3" tamano="sm">Notas</Titulo>
          <p className="m-0 text-[17px] whitespace-pre-line leading-relaxed">{activo.notas}</p>
        </div>
      )}
    </ModalCuaderno>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function ContabilidadActivos() {
  const { empresaId } = useEmpresa();

  const [activos, setActivos]             = useState([]);
  const [loading, setLoading]             = useState(true);
  const [showModal, setShowModal]         = useState(false);
  const [editando, setEditando]           = useState(null);
  const [detalle, setDetalle]             = useState(null);
  const [deletingId, setDeletingId]       = useState(null);
  const [confirmEliminar, setConfirmEliminar] = useState(null);
  const [filtroTipo, setFiltroTipo]       = useState("todos");
  const [filtroEstado, setFiltroEstado]   = useState("activos");
  const [filtroDoc, setFiltroDoc]         = useState("todos");
  const [busqueda, setBusqueda]           = useState("");
  const [sortCol, setSortCol]             = useState("nombre");
  const [sortDir, setSortDir]             = useState("asc");

  // ── Carga desde /machines (colección unificada con FleetCore) ──
  const cargar = useCallback(async () => {
    if (!empresaId) { setLoading(false); return; }
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, "empresas", empresaId, "machines"));
      const todos = snap.docs.map(d => ({
        id: d.id,
        machineId: d.id,
        _source: "machines",
        nombre:      d.data().name || "",
        tipo:        d.data().tipo || (() => {
          const type = (d.data().type || "").toLowerCase();
          const name = (d.data().name || "").toLowerCase();
          const esVehiculo = [
            "van", "pickup", "truck", "bus", "minibus", "suv", "sedan", "hatchback",
            "station wagon", "camioneta", "furgon", "furgón", "minivan", "jeep",
            "camión", "camion", "vehículo", "vehiculo",
          ].some(k => type.includes(k)) ||
          [
            "camioneta", "furgon", "furgón", "hilux", "wingle", "poer", "maxus",
            "changan", "jac", "mitsubishi", "toyota", "ford", "chevrolet",
            "nissan", "hyundai", "kia", "volkswagen", "peugeot partner",
            "great wall", "gwm", "jeep", "suv",
          ].some(k => name.includes(k));
          return esVehiculo ? "vehiculo" : "maquinaria";
        })(),
        code:        d.data().code        || "",
        marca:       d.data().marca       || "",
        modelo:      d.data().modelo      || "",
        patente:     d.data().patente     || "",
        ownership:   (() => { const raw = d.data().ownership || "OWNED"; return raw === "OWN" ? "OWNED" : raw; })(),
        propietario: d.data().propietario || "",
        activo:      d.data().active      !== false,
        moneda:      d.data().moneda      || "CLP",
        valorCompra:            d.data().valorCompra            || "",
        valorLibros:            d.data().valorLibros            || "",
        fechaCompra:            d.data().fechaCompra            || "",
        vidaUtilAnios:          d.data().vidaUtilAnios          || "",
        depreciacionAnual:      d.data().depreciacionAnual      || "",
        vencPermisoCirculacion: d.data().vencPermisoCirculacion || "",
        vencSeguro:             d.data().vencSeguro             || "",
        vencRevisionTecnica:    d.data().vencRevisionTecnica    || "",
        vencSoapCivil:          d.data().vencSoapCivil          || "",
        notasDoc:               d.data().notasDoc               || "",
        archivosDoc:            d.data().archivosDoc            || {},
        notas:                  d.data().notas                  || "",
      }));
      setActivos(todos);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [empresaId]);

  useEffect(() => { cargar(); }, [cargar]);

  // ── CRUD ──
  const handleSave = async (form) => {
    const { id, _source, machineId, nombre, ...data } = form;
    if (editando) {
      await updateDoc(doc(db, "empresas", empresaId, "machines", editando.id), {
        ...data,
        name: nombre || data.name || "",
        updatedAt: serverTimestamp(),
      });
    } else {
      await addDoc(collection(db, "empresas", empresaId, "machines"), {
        ...data,
        name: nombre,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        active: true,
      });
    }
    await cargar();
  };

  const handleEliminar = (a) => setConfirmEliminar(a);

  const confirmarEliminar = async () => {
    if (!confirmEliminar) return;
    setDeletingId(confirmEliminar.id);
    try {
      await deleteDoc(doc(db, "empresas", empresaId, "machines", confirmEliminar.id));
      await cargar();
    } catch (e) { console.error(e); }
    setDeletingId(null);
    setConfirmEliminar(null);
  };

  const handleSort = (col) => {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("asc"); }
  };

  // ── Filtros + Sort ──
  const activosFiltrados = useMemo(() => {
    const f = activos.filter(a => {
      if (filtroEstado === "activos"   && !a.activo) return false;
      if (filtroEstado === "inactivos" &&  a.activo) return false;
      if (filtroTipo !== "todos" && a.tipo !== filtroTipo) return false;
      if (filtroDoc === "alertas" && !tieneAlerta(a)) return false;
      if (busqueda) {
        const b = busqueda.toLowerCase();
        return (a.nombre || "").toLowerCase().includes(b)
          || (a.code || "").toLowerCase().includes(b)
          || (a.patente || "").toLowerCase().includes(b)
          || (a.marca || "").toLowerCase().includes(b);
      }
      return true;
    });
    return [...f].sort((a, b) => {
      const map = {
        nombre: [(a.nombre || "").toLowerCase(), (b.nombre || "").toLowerCase()],
        tipo:   [a.tipo || "", b.tipo || ""],
        valor:  [valorLibros(a), valorLibros(b)],
        dep:    [depAnual(a), depAnual(b)],
      };
      const [va, vb] = map[sortCol] || ["", ""];
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [activos, filtroEstado, filtroTipo, filtroDoc, busqueda, sortCol, sortDir]);

  const activosActivos = useMemo(() => activos.filter(a => a.activo), [activos]);
  const valorTotal     = useMemo(() => activosActivos.reduce((s, a) => s + valorLibros(a), 0), [activosActivos]);
  const depTotal       = useMemo(() => activosActivos.reduce((s, a) => s + depAnual(a), 0), [activosActivos]);
  const conAlertas     = useMemo(() => activosActivos.filter(tieneAlerta).length, [activosActivos]);

  // ── Solo presentación ──
  const COLUMNAS = [
    { col: "nombre", label: "Activo",       align: "text-left",  cls: "min-w-[210px]" },
    { col: "tipo",   label: "Tipo",         align: "text-left",  cls: "" },
    { col: "valor",  label: "Valor libros", align: "text-right", cls: "" },
    { col: "dep",    label: "Dep. anual",   align: "text-right", cls: "hidden md:table-cell" },
  ];
  const hayFiltros = busqueda || filtroTipo !== "todos" || filtroDoc !== "todos";

  if (loading) return (
    <div className="cuaderno flex items-center justify-center h-64 text-[18px] text-cuaderno-grafito">
      Buscando los activos…
    </div>
  );

  return (
    <div className="cuaderno px-8 pt-5 pb-10 space-y-5">

      <FechaHoja />

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Titulo>Activos fijos</Titulo>
          <p className="m-0 text-[17px] text-cuaderno-grafito">Maquinaria, vehículos y equipos: valorización y documentos.</p>
        </div>
        <Boton variante="primario" onClick={() => { setEditando(null); setShowModal(true); }}>
          <IconoMas tamano={14} /> Nuevo activo
        </Boton>
      </header>

      {/* Resumen */}
      <Hoja titulo="Resumen">
        <div className="grid gap-x-12 md:grid-cols-2">
          <div>
            <LineaGuia etiqueta="Activos en uso"><span>{activosActivos.length}</span></LineaGuia>
            <p className="m-0 -mt-1 mb-1 text-right text-[13px] text-cuaderno-grafito">{activos.filter(a => !a.activo).length} inactivos</p>
            <LineaGuia etiqueta="Documentos con alerta">
              {conAlertas > 0
                ? <Resaltado color="rosa">{conAlertas}</Resaltado>
                : <span className="inline-flex items-center gap-1 text-cuaderno-grafito">todo al día <VistoBueno tamano={12} titulo="" /></span>}
            </LineaGuia>
            {conAlertas > 0 && <p className="m-0 -mt-1 mb-1 text-right text-[13px] text-cuaderno-roja">vencidos o por vencer en 30 días</p>}
          </div>
          <div>
            <LineaGuia etiqueta="Valor libros total"><Cifra valor={valorTotal} escala="pesos" vacio="$0" raya="doble" /></LineaGuia>
            <p className="m-0 -mt-1 mb-1 text-right text-[13px] text-cuaderno-grafito">suma de los activos en uso</p>
            <LineaGuia etiqueta="Depreciación anual"><Cifra valor={depTotal} escala="pesos" vacio="$0" /></LineaGuia>
            <p className="m-0 -mt-1 mb-1 text-right text-[13px] text-cuaderno-grafito"><Cifra valor={depTotal / 12} escala="pesos" vacio="$0" color="heredar" /> al mes</p>
          </div>
        </div>
      </Hoja>

      {/* Tabla */}
      <Hoja titulo="Detalle"
        extra={
          <>
            <Campo etiqueta="Buscar" type="search" className="w-56"
              value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Nombre, código, patente..." />
            <Segmentado
              opciones={[{ id: "todos", label: "Todos" }, { id: "activos", label: "Activos" }, { id: "inactivos", label: "Inactivos" }]}
              valor={filtroEstado}
              onCambiar={setFiltroEstado}
            />
            <Campo as="select" etiqueta="Tipo" value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}>
              <option value="todos">Todos los tipos</option>
              {TIPOS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
            </Campo>
            <Segmentado
              opciones={[{ id: "todos", label: "Todos" }, { id: "alertas", label: "Con alerta" }]}
              valor={filtroDoc}
              onCambiar={setFiltroDoc}
            />
          </>
        }>
        {activosFiltrados.length === 0 ? (
          <div className="py-12 text-center space-y-2">
            <p className="m-0 font-ligada font-light text-[22px] leading-[1.6]">
              {hayFiltros ? "Nada coincide con los filtros" : "Aún no hay activos anotados"}
            </p>
            <p className="m-0 text-[16px] text-cuaderno-grafito">
              {hayFiltros ? "Ajusta los filtros." : "Agrega el primero con el botón Nuevo activo."}
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
                    <th className="font-normal text-[15px] text-left text-cuaderno-grafito px-2 py-2 hidden lg:table-cell">Documentos</th>
                    <th className="font-normal text-[15px] text-left text-cuaderno-grafito px-2 py-2 hidden sm:table-cell">Propiedad</th>
                    <th className="font-normal text-[15px] text-center text-cuaderno-grafito px-2 py-2">Estado</th>
                    <th className="w-20"><span className="sr-only">Acciones</span></th>
                  </tr>
                </thead>
                <tbody>
                  {activosFiltrados.map(a => {
                    const tipo   = TIPO_MAP[a.tipo] || TIPOS[3];
                    const vl     = valorLibros(a);
                    const dep    = depAnual(a);
                    const alerta = tieneAlerta(a);
                    return (
                      <tr key={a.id} tabIndex={0}
                        onClick={() => setDetalle(detalle?.id === a.id ? null : a)}
                        onKeyDown={e => { if (e.key === "Enter") setDetalle(a); }}
                        className={`group border-b border-cuaderno-renglon cursor-pointer hover:bg-cuaderno-papel focus:outline-none focus-visible:bg-cuaderno-papel ${!a.activo ? "opacity-60" : ""}`}>
                        <td className="px-2 py-2">
                          <p className="m-0 text-[17px] leading-tight truncate">{a.nombre}</p>
                          <p className="m-0 text-[13px] text-cuaderno-grafito truncate max-w-[260px]">
                            {[a.code, a.patente].filter(Boolean).join(", ") || (a.marca && `${a.marca} ${a.modelo || ""}`)}
                          </p>
                        </td>
                        <td className="px-2 py-2 text-[15px] text-cuaderno-grafito whitespace-nowrap">{tipo.label}</td>
                        <td className="px-2 py-2 text-right text-[16px] whitespace-nowrap"><Monto valor={vl} moneda={a.moneda} /></td>
                        <td className="px-2 py-2 text-right text-[16px] whitespace-nowrap hidden md:table-cell">
                          {dep > 0
                            ? <span className="text-cuaderno-grafito"><Monto valor={dep} moneda={a.moneda} /> al año</span>
                            : <span className="text-cuaderno-grafito">—</span>}
                        </td>
                        <td className="px-2 py-2 text-[15px] whitespace-nowrap hidden lg:table-cell">
                          {alerta
                            ? <Resaltado color="rosa">vence pronto</Resaltado>
                            : <span className="inline-flex items-center gap-1 text-cuaderno-grafito">al día <VistoBueno tamano={11} titulo="" /></span>}
                        </td>
                        <td className="px-2 py-2 text-[15px] whitespace-nowrap hidden sm:table-cell">
                          {a.ownership === "OWNED"
                            ? <span className="text-cuaderno-grafito">{OWN_LABELS.OWNED}</span>
                            : <Resaltado color="lavanda">{OWN_LABELS[a.ownership] || a.ownership || "—"}</Resaltado>}
                        </td>
                        <td className="px-2 py-2 text-center text-[15px] whitespace-nowrap">
                          {a.activo ? <Resaltado color="menta">activo</Resaltado> : <span className="text-cuaderno-grafito px-[0.3em]">inactivo</span>}
                        </td>
                        <td className="px-2 py-2" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100">
                            <button onClick={() => { setEditando(a); setShowModal(true); }} aria-label={`Editar ${a.nombre}`} title="Editar"
                              className="w-8 h-8 rounded-md flex items-center justify-center text-cuaderno-grafito hover:text-cuaderno-tinta hover:bg-cuaderno-hoja">
                              <IconoLapiz tamano={14} />
                            </button>
                            <button onClick={() => handleEliminar(a)} disabled={deletingId === a.id} aria-label={`Eliminar ${a.nombre}`} title="Eliminar"
                              className="w-8 h-8 rounded-md flex items-center justify-center text-cuaderno-grafito hover:text-cuaderno-roja hover:bg-cuaderno-rosa/40 disabled:opacity-50">
                              {deletingId === a.id ? <span className="text-[12px]">…</span> : <IconoBorrar tamano={14} />}
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
              <span className="text-[15px] text-cuaderno-grafito">{activosFiltrados.length} activos en la lista</span>
              <LineaGuia etiqueta="Valor libros de los activos en uso" className="w-full max-w-md">
                <Cifra valor={activosFiltrados.filter(a => a.activo).reduce((s, a) => s + valorLibros(a), 0)} escala="pesos" vacio="$0" raya="total" />
              </LineaGuia>
            </div>
          </>
        )}
      </Hoja>

      {/* Ficha del activo */}
      {detalle && (
        <PanelDetalle
          activo={detalle}
          onClose={() => setDetalle(null)}
          onEdit={() => { setEditando(detalle); setShowModal(true); setDetalle(null); }}
        />
      )}

      {/* Modal nuevo/editar */}
      <ModalActivo
        isOpen={showModal}
        onClose={() => { setShowModal(false); setEditando(null); }}
        onSave={handleSave}
        editando={editando}
      />

      {/* Confirmación de eliminar */}
      {confirmEliminar && (
        <ModalCuaderno
          titulo="Eliminar activo"
          subtitulo="Esta acción no se puede deshacer"
          ancho="max-w-sm"
          capa="z-50"
          bloqueado={deletingId === confirmEliminar.id}
          onClose={() => setConfirmEliminar(null)}
          pie={
            <div className="flex items-center justify-end gap-2">
              <Boton onClick={() => setConfirmEliminar(null)}>Cancelar</Boton>
              <Boton variante="primario" onClick={confirmarEliminar}
                className="!bg-cuaderno-roja !border-cuaderno-roja hover:!bg-cuaderno-roja/90">
                Sí, eliminar
              </Boton>
            </div>
          }>
          <p className="m-0 text-[18px]">
            ¿Estás seguro que deseas eliminar{" "}
            <span className="resaltado resaltado-rosa">"{confirmEliminar.nombre || confirmEliminar.code || "este activo"}"</span>?
          </p>
          <Nota etiqueta="Ojo:">Se eliminarán también los documentos y datos financieros asociados.</Nota>
        </ModalCuaderno>
      )}
    </div>
  );
}
