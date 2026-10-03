import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  collection, getDocs,
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

// Tipos de activo. Los colores e íconos eran del diseño anterior: en el
// cuaderno el tipo se escribe y el color queda para los estados.
const TIPOS = [
  { id: "maquinaria",  label: "Maquinaria"  },
  { id: "vehiculo",    label: "Vehículo"    },
  { id: "herramienta", label: "Herramienta" },
  { id: "otro",        label: "Otro"        },
];
const TIPO_MAP = Object.fromEntries(TIPOS.map(t => [t.id, t]));
const OWN_LABELS = { OWNED: "Propio", RENTED: "Arrendado", LEASING: "Leasing", CREDITO_AUTO: "Créd. Automotriz" };
const DOCS_DEF = [
  { key: "vencPermisoCirculacion", label: "Permiso Circulación" },
  { key: "vencSeguro",             label: "Contrato"             },
  { key: "vencRevisionTecnica",    label: "Rev. Técnica"         },
  { key: "vencSoapCivil",          label: "SOAP / Civil"         },
];
const EMPTY = {
  nombre:"", tipo:"maquinaria", code:"", marca:"", modelo:"", patente:"",
  ownership:"OWNED", propietario:"", projectId:"",
  valorCompra:"", valorLibros:"", fechaCompra:"", vidaUtilAnios:"", moneda:"CLP",
  depreciacionAnual:"", vencPermisoCirculacion:"", vencSeguro:"",
  vencRevisionTecnica:"", vencSoapCivil:"", notasDoc:"", notas:"", activo:true, machineId:null,
  archivosDoc: { vencPermisoCirculacion:"", vencSeguro:"", vencRevisionTecnica:"", vencSoapCivil:"" },
};

function fmt(n, moneda="CLP") {
  if (!n && n!==0) return "—";
  if (moneda==="UF")  return `UF ${Number(n).toLocaleString("es-CL",{minimumFractionDigits:2})}`;
  if (moneda==="USD") return `US$${Number(n).toLocaleString("es-CL",{minimumFractionDigits:2})}`;
  return `$${Math.round(Number(n)).toLocaleString("es-CL")}`;
}
function fmtM(n) {
  if (!n) return "$0";
  if (Math.abs(n)>=1000000) return "$"+(n/1000000).toFixed(1).replace(".",","  )+"M";
  return "$"+Math.round(n).toLocaleString("es-CL");
}
function diasR(f) { if(!f) return null; return Math.ceil((new Date(f)-new Date())/86400000); }
function estadoDoc(f) {
  const d=diasR(f); if(d===null) return null;
  if(d<0) return "vencido"; if(d<=30) return "urgente"; if(d<=90) return "pronto"; return "ok";
}
function depAnual(a) {
  if(a.depreciacionAnual) return parseFloat(a.depreciacionAnual)||0;
  const v=parseFloat(a.valorCompra)||0, y=parseFloat(a.vidaUtilAnios)||0;
  return (!v||!y)?0:v/y;
}
function valorLibros(a) {
  if(a.valorLibros) return parseFloat(a.valorLibros)||0;
  const v=parseFloat(a.valorCompra)||0;
  if(!v||!a.fechaCompra) return v;
  const yrs=(new Date()-new Date(a.fechaCompra))/(365.25*86400000);
  return Math.max(0,v-depAnual(a)*yrs);
}
function tieneAlerta(a) {
  return DOCS_DEF.some(({key})=>{ const e=estadoDoc(a[key]); return e==="vencido"||e==="urgente"; });
}

// ─── Editor inline de fecha de vencimiento (click para abrir date picker) ───
function FechaDocEditor({ fecha, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState(fecha || "");
  const e = estadoDoc(fecha);
  const d = diasR(fecha);
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

// ─── Uploader de documento individual ────────────────────────────────────────
function DocUploader({ label, docKey, activoId, empresaId, urlActual, onUploaded }) {
  const [uploading, setUploading]   = useState(false);
  const [progress, setProgress]     = useState(0);
  const [error, setError]           = useState(null);
  const inputRef                    = useRef(null);

  const esImagen = urlActual && /\.(jpg|jpeg|png|gif|webp)/i.test(urlActual.split("?")[0]);
  const esPDF    = urlActual && /\.pdf/i.test(urlActual.split("?")[0]);
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
    const ext      = file.name.split(".").pop();
    const path     = `empresas/${empresaId}/activos/${activoId}/${docKey}_${Date.now()}.${ext}`;
    const storRef  = ref(storage, path);
    const task     = uploadBytesResumable(storRef, file);
    task.on("state_changed",
      snap => setProgress(Math.round(snap.bytesTransferred / snap.totalBytes * 100)),
      err  => { setError("Error al subir"); setUploading(false); },
      async () => {
        const url = await getDownloadURL(task.snapshot.ref);
        onUploaded(docKey, url);
        setUploading(false);
      }
    );
  };

  const handleEliminarArchivo = async () => {
    if (!urlActual) return;
    try {
      const fileRef = ref(storage, urlActual);
      await deleteObject(fileRef);
    } catch (e) { /* ignora si ya no existe */ }
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

function ModalActivo({isOpen,onClose,onSave,editando,projects}) {
  const { empresaId } = useEmpresa();
  const [form,setForm]=useState(EMPTY);
  const [step,setStep]=useState(1);
  const [saving,setSaving]=useState(false);
  useEffect(()=>{ setForm(editando?{...EMPTY,...editando}:EMPTY); setStep(1); },[editando,isOpen]);
  if(!isOpen) return null;
  const set=(k,v)=>setForm(f=>({...f,[k]:v}));
  const tipo=TIPO_MAP[form.tipo]||TIPOS[0];
  const submit=async()=>{
    if(!form.nombre) return;
    setSaving(true); await onSave(form); setSaving(false); onClose();
  };
  const depEst=depAnual(form); const vlEst=valorLibros(form);
  const PASOS = [{ id: 1, label: "1. Identificación" }, { id: 2, label: "2. Valor" }, { id: 3, label: "3. Documentos" }];
  return (
    <ModalCuaderno
      titulo={editando ? "Editar activo" : "Nuevo activo"}
      subtitulo={editando ? editando.nombre : "Una máquina, vehículo o equipo de la empresa"}
      ancho="max-w-2xl"
      onClose={onClose}
      bloqueado={saving}
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

      <div role="tablist" className="flex flex-wrap gap-x-5 border-b border-cuaderno-azul -mt-1">
        {PASOS.map(p => (
          <button key={p.id} role="tab" aria-selected={step === p.id}
            onClick={() => step > p.id ? setStep(p.id) : null}
            disabled={step < p.id}
            className={`min-h-[40px] -mb-px border-b-2 text-[17px] ${
              step === p.id ? "border-cuaderno-tinta text-cuaderno-tinta" : "border-transparent text-cuaderno-grafito disabled:opacity-50"}`}>
            {p.label}
          </button>
        ))}
      </div>

      {step === 1 && (<>
        <Segmentado etiqueta="Tipo de activo" opciones={TIPOS.map(t => ({ id: t.id, label: t.label }))}
          valor={form.tipo} onCambiar={id => set("tipo", id)} />
        <Campo etiqueta="Nombre" value={form.nombre} onChange={e => set("nombre", e.target.value)} placeholder="Ej: excavadora Caterpillar 320" />
        <div className="grid grid-cols-3 gap-4">
          <Campo etiqueta="Código" value={form.code} onChange={e => set("code", e.target.value)} placeholder="MN-02" />
          <Campo etiqueta="Marca" value={form.marca} onChange={e => set("marca", e.target.value)} placeholder="Caterpillar" />
          <Campo etiqueta="Modelo" value={form.modelo} onChange={e => set("modelo", e.target.value)} placeholder="320" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Campo etiqueta="Patente" value={form.patente} onChange={e => set("patente", e.target.value.toUpperCase())} placeholder="TYRH70" />
          <Campo as="select" etiqueta="Propiedad" value={form.ownership} onChange={e => set("ownership", e.target.value)}>
            <option value="OWNED">Propio</option><option value="RENTED">Arrendado</option>
            <option value="LEASING">Leasing</option><option value="CREDITO_AUTO">Crédito automotriz</option>
          </Campo>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Campo etiqueta="Propietario" value={form.propietario} onChange={e => set("propietario", e.target.value)} placeholder="Nombre del propietario" />
          <Campo as="select" etiqueta="Proyecto asignado" value={form.projectId} onChange={e => set("projectId", e.target.value)}>
            <option value="">Sin proyecto</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name || p.nombre}</option>)}
          </Campo>
        </div>
        <div className="border-t border-cuaderno-azul pt-4">
          <Casilla marcada={form.activo} onCambiar={v => set("activo", v)} descripcion="Los inactivos no se suman al valor total">
            Activo en uso
          </Casilla>
        </div>
      </>)}

      {step === 2 && (<>
        <div className="grid grid-cols-[6rem_1fr] gap-4 items-end">
          <Campo as="select" etiqueta="Moneda" value={form.moneda} onChange={e => set("moneda", e.target.value)}>
            <option value="CLP">CLP</option><option value="UF">UF</option><option value="USD">USD</option>
          </Campo>
          <Campo etiqueta="Valor de compra" type="number" inputMode="decimal" value={form.valorCompra} onChange={e => set("valorCompra", e.target.value)} placeholder="0" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Campo etiqueta="Fecha de compra" type="date" value={form.fechaCompra} onChange={e => set("fechaCompra", e.target.value)} />
          <Campo etiqueta="Vida útil, en años" type="number" min="1" max="50" value={form.vidaUtilAnios} onChange={e => set("vidaUtilAnios", e.target.value)} placeholder="10" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Campo etiqueta="Depreciación anual" type="number" value={form.depreciacionAnual} onChange={e => set("depreciacionAnual", e.target.value)}
            placeholder="Se calcula sola" ayuda="Opcional" />
          <Campo etiqueta="Valor libro actual" type="number" value={form.valorLibros} onChange={e => set("valorLibros", e.target.value)}
            placeholder="Se calcula solo" ayuda="Opcional" />
        </div>
        {form.valorCompra && form.vidaUtilAnios && (
          <div className="border border-cuaderno-azul rounded-md px-4 py-2">
            <Titulo as="h3" tamano="sm">Depreciación estimada</Titulo>
            <LineaGuia etiqueta="Al año"><span>{fmt(depEst, form.moneda)}</span></LineaGuia>
            <LineaGuia etiqueta="Al mes"><span>{fmt(depEst / 12, form.moneda)}</span></LineaGuia>
            <LineaGuia etiqueta="Valor libro hoy"><span className="border-b-[3px] border-double border-current">{fmt(vlEst, form.moneda)}</span></LineaGuia>
          </div>
        )}
        <Campo as="textarea" rows={2} etiqueta="Notas" value={form.notas} onChange={e => set("notas", e.target.value)} placeholder="Financiamiento, garantías" />
      </>)}

      {step === 3 && (<>
        <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
          {DOCS_DEF.map(({ key, label }) => (
            <div key={key}>
              <Campo etiqueta={`Vencimiento: ${label.toLowerCase()}`} type="date" value={form[key] || ""} onChange={e => set(key, e.target.value)} />
              {form[key] && (() => {
                const d = diasR(form[key]);
                if (d < 0) return <p className="m-0 mt-1 text-[14px] text-cuaderno-roja">Vencido hace {Math.abs(d)} días</p>;
                if (d <= 30) return <p className="m-0 mt-1 text-[14px]"><Resaltado color="durazno">vence en {d} días</Resaltado></p>;
                return <p className="m-0 mt-1 flex items-center gap-1 text-[14px] text-cuaderno-verde"><VistoBueno tamano={12} titulo="" /> vigente, {d} días</p>;
              })()}
              <div className="mt-2">
                <DocUploader
                  label="" docKey={key}
                  activoId={editando?.id || "nuevo"}
                  empresaId={empresaId}
                  urlActual={form.archivosDoc?.[key] || ""}
                  onUploaded={(k, url) => set("archivosDoc", { ...(form.archivosDoc || {}), [k]: url })}
                />
              </div>
            </div>
          ))}
        </div>
        <Campo as="textarea" rows={2} etiqueta="Notas de documentos" value={form.notasDoc} onChange={e => set("notasDoc", e.target.value)} placeholder="N° de póliza u observaciones" />
        <div className="border-t border-cuaderno-azul pt-3">
          <Titulo as="h3" tamano="sm">Antes de guardar, revisa</Titulo>
          <LineaGuia etiqueta="Nombre"><span>{form.nombre || "—"}</span></LineaGuia>
          <LineaGuia etiqueta="Tipo"><span>{TIPO_MAP[form.tipo]?.label}</span></LineaGuia>
          <LineaGuia etiqueta="Valor de compra"><span>{fmt(form.valorCompra, form.moneda)}</span></LineaGuia>
          <LineaGuia etiqueta="Valor libro"><span>{fmt(vlEst, form.moneda)}</span></LineaGuia>
        </div>
      </>)}
    </ModalCuaderno>
  );
}

function PanelDetalle({ activo, onClose, onEdit, projects, empresaId, onDocUploaded, onFechaUpdated }) {
  if (!activo) return null;
  const vl = valorLibros(activo); const dep = depAnual(activo);
  const proyecto = projects.find(p => p.id === activo.projectId);
  const subtitulo = [TIPO_MAP[activo.tipo]?.label, activo.code, [activo.marca, activo.modelo].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return (
    <ModalCuaderno
      titulo={activo.nombre}
      subtitulo={subtitulo}
      ancho="max-w-4xl"
      capa="z-50"
      cerrarAlClicFuera
      onClose={onClose}
      pie={<div className="flex justify-end"><Boton onClick={onEdit}><IconoLapiz tamano={14} /> Editar activo</Boton></div>}>
      <div className="grid gap-x-12 md:grid-cols-2">
        <div>
          <Titulo as="h3" tamano="sm">Identificación</Titulo>
          <LineaGuia etiqueta="Patente"><span>{activo.patente || "—"}</span></LineaGuia>
          <LineaGuia etiqueta="Propiedad"><span>{OWN_LABELS[activo.ownership] || activo.ownership || "—"}</span></LineaGuia>
          <LineaGuia etiqueta="Propietario"><span>{activo.propietario || "—"}</span></LineaGuia>
          <LineaGuia etiqueta="Proyecto"><span>{proyecto ? (proyecto.name || proyecto.nombre) : "sin proyecto"}</span></LineaGuia>
        </div>
        <div>
          <Titulo as="h3" tamano="sm">Valor</Titulo>
          <LineaGuia etiqueta="Valor de compra"><span>{fmt(activo.valorCompra, activo.moneda)}</span></LineaGuia>
          <LineaGuia etiqueta="Valor libro"><span className="border-b-[3px] border-double border-current">{fmt(vl, activo.moneda)}</span></LineaGuia>
          <LineaGuia etiqueta="Depreciación al año"><span>{dep > 0 ? fmt(dep, activo.moneda) : "—"}</span></LineaGuia>
          <LineaGuia etiqueta="Depreciación al mes"><span>{dep > 0 ? fmt(dep / 12, activo.moneda) : "—"}</span></LineaGuia>
          <LineaGuia etiqueta="Vida útil"><span>{activo.vidaUtilAnios ? `${activo.vidaUtilAnios} años` : "—"}</span></LineaGuia>
          <LineaGuia etiqueta="Fecha de compra"><span>{activo.fechaCompra || "—"}</span></LineaGuia>
        </div>
      </div>

      <div>
        <Titulo as="h3" tamano="sm" className="border-b border-cuaderno-azul">Documentos</Titulo>
        <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2 mt-2">
          {DOCS_DEF.map(({ key, label }) => (
            <div key={key}>
              <div className="flex items-center justify-between gap-2">
                <p className="m-0 text-[16px]">{label}</p>
                <FechaDocEditor fecha={activo[key]} onSave={(val) => onFechaUpdated(activo, key, val)} />
              </div>
              <DocUploader
                label="" docKey={key}
                activoId={activo.id} empresaId={empresaId}
                urlActual={activo.archivosDoc?.[key] || ""}
                onUploaded={(docKey, url) => onDocUploaded(activo, docKey, url)}
              />
            </div>
          ))}
        </div>
        {activo.notasDoc && <p className="m-0 mt-3 text-[15px] text-cuaderno-grafito">Nota: {activo.notasDoc}</p>}
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

export default function FinanzasActivos() {
  const { proyectoId } = useFinanzas();
  const { empresaId } = useEmpresa();
  const [activos,setActivos]=useState([]);
  const [projects,setProjects]=useState([]);
  const [loading,setLoading]=useState(true);
  const [showModal,setShowModal]=useState(false);
  const [editando,setEditando]=useState(null);
  const [detalle,setDetalle]=useState(null);
  const [deletingId,setDeletingId]=useState(null);
  const [confirmEliminar,setConfirmEliminar]=useState(null); // activo a eliminar
  const [filtroTipo,setFiltroTipo]=useState("todos");
  const [filtroEstado,setFiltroEstado]=useState("activos");
  const [filtroDoc,setFiltroDoc]=useState("todos");
  const [busqueda,setBusqueda]=useState("");
  const [sortCol,setSortCol]=useState("nombre");
  const [sortDir,setSortDir]=useState("asc");

  const cargar=useCallback(async()=>{
    if (!empresaId) { setLoading(false); return; }
    setLoading(true);
    try {
      // Leer directamente desde /machines — colección unificada
      const snapM=await getDocs(collection(db,"empresas",empresaId,"machines"));
      const todos=snapM.docs.map(d=>({
        id:d.id, machineId:d.id, _source:"machines",
        nombre:      d.data().name        || "",
        tipo:        d.data().tipo || (() => {
          const type = (d.data().type || "").toLowerCase();
          const name = (d.data().name || "").toLowerCase();
          const esVehiculo = [
            // Valores del campo type en FleetCore
            "van","pickup","truck","bus","minibus","suv","sedan","hatchback",
            "station wagon","camioneta","furgon","furgón","minivan","jeep",
            // Por si viene en español en type
            "camión","camion","vehículo","vehiculo",
            // Detección por nombre del activo
          ].some(k => type.includes(k)) ||
          [
            "camioneta","furgon","furgón","hilux","wingle","poer","maxus",
            "changan","jac","mitsubishi","toyota","ford","chevrolet",
            "nissan","hyundai","kia","volkswagen","peugeot partner",
            "great wall","gwm","jeep","suv",
          ].some(k => name.includes(k));
          return esVehiculo ? "vehiculo" : "maquinaria";
        })(),
        code:        d.data().code        || "",
        marca:       d.data().marca       || "",
        modelo:      d.data().modelo      || "",
        patente:     d.data().patente     || "",
        ownership:   (() => { const raw = d.data().ownership || "OWNED"; return raw === "OWN" ? "OWNED" : raw; })(),
        propietario: d.data().propietario || "",
        projectId:   d.data().projectId   || "",
        activo:      d.data().active      !== false,
        moneda:      d.data().moneda      || "CLP",
        // Campos financieros (ahora en /machines directamente)
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
      setActivos(proyectoId!=="todos" ? todos.filter(a=>a.projectId===proyectoId) : todos);
    } catch(e){console.error(e);}
    try {
      const snapP=await getDocs(collection(db,"empresas",empresaId,"projects"));
      setProjects(snapP.docs.map(d=>({id:d.id,...d.data()})));
    } catch(e){}
    setLoading(false);
  },[empresaId, proyectoId]);
  useEffect(()=>{cargar();},[cargar]);

  const handleSave=async(form)=>{
    const {id,_source,machineId,nombre,...data}=form;
    if(editando){
      // Siempre actualizar el doc en /machines directamente
      await updateDoc(doc(db,"empresas",empresaId,"machines",editando.id),{
        ...data,
        name: nombre || data.name || "",
        updatedAt:serverTimestamp(),
      });
    } else {
      await addDoc(collection(db,"empresas",empresaId,"machines"),{
        ...data,
        name: nombre || data.name || "",
        createdAt:serverTimestamp(),
      });
    }
    setEditando(null); await cargar();
  };

  const handleDocUploaded = async (a, docKey, url) => {
    const archivosDoc = { ...(a.archivosDoc || {}), [docKey]: url };
    const col = a._source === "machines" ? "machines" : "finanzas_activos";
    await updateDoc(doc(db, "empresas", empresaId, col, a.id), { archivosDoc });
    setDetalle(prev => prev && prev.id === a.id ? { ...prev, archivosDoc } : prev);
    await cargar();
  };

  const handleFechaDocUpdated = async (a, fechaKey, value) => {
    const col = a._source === "machines" ? "machines" : "finanzas_activos";
    await updateDoc(doc(db, "empresas", empresaId, col, a.id), { [fechaKey]: value });
    setDetalle(prev => prev && prev.id === a.id ? { ...prev, [fechaKey]: value } : prev);
    await cargar();
  };

  const handleEliminar=async(a)=>{
    setConfirmEliminar(a);
  };

  const confirmarEliminar=async()=>{
    const a=confirmEliminar;
    if(!a) return;
    setConfirmEliminar(null);
    setDeletingId(a.id);
    // Eliminar de machines (FleetCore) o de finanzas_activos según origen
    if(a._source==="machines"){
      await deleteDoc(doc(db,"empresas",empresaId,"machines",a.id));
    } else {
      await deleteDoc(doc(db,"empresas",empresaId,"finanzas_activos",a.id));
    }
    setDeletingId(null);
    if(detalle?.id===a.id) setDetalle(null);
    await cargar();
  };

  const handleSort=(col)=>{ if(sortCol===col) setSortDir(d=>d==="asc"?"desc":"asc"); else{setSortCol(col);setSortDir("asc");} };

  const activosFiltrados=useMemo(()=>{
    const f=activos.filter(a=>{
      if(filtroEstado==="activos"&&!a.activo) return false;
      if(filtroEstado==="inactivos"&&a.activo) return false;
      if(filtroTipo!=="todos"&&a.tipo!==filtroTipo) return false;
      if(filtroDoc==="alertas"&&!tieneAlerta(a)) return false;
      if(busqueda){const b=busqueda.toLowerCase();return(a.nombre||"").toLowerCase().includes(b)||(a.code||"").toLowerCase().includes(b)||(a.patente||"").toLowerCase().includes(b)||(a.marca||"").toLowerCase().includes(b);}
      return true;
    });
    return [...f].sort((a,b)=>{
      const map={nombre:[(a.nombre||"").toLowerCase(),(b.nombre||"").toLowerCase()],tipo:[a.tipo||"",b.tipo||""],valor:[valorLibros(a),valorLibros(b)],dep:[depAnual(a),depAnual(b)]};
      const [va,vb]=map[sortCol]||["",""];
      if(va<vb) return sortDir==="asc"?-1:1; if(va>vb) return sortDir==="asc"?1:-1; return 0;
    });
  },[activos,filtroEstado,filtroTipo,filtroDoc,busqueda,sortCol,sortDir]);

  const activosActivos=useMemo(()=>activos.filter(a=>a.activo),[activos]);
  const valorTotal=useMemo(()=>activosActivos.reduce((s,a)=>s+valorLibros(a),0),[activosActivos]);
  const depTotal=useMemo(()=>activosActivos.reduce((s,a)=>s+depAnual(a),0),[activosActivos]);
  const conAlertas=useMemo(()=>activosActivos.filter(tieneAlerta).length,[activosActivos]);

  // ── Solo presentación ─────────────────────────────────────────────────────
  const COLS = [
    { col: "nombre", label: "Activo",              align: "text-left",  cls: "" },
    { col: "tipo",   label: "Tipo",                align: "text-left",  cls: "" },
    { col: "valor",  label: "Valor libro",         align: "text-right", cls: "" },
    { col: "dep",    label: "Depreciación al año", align: "text-right", cls: "hidden md:table-cell" },
  ];

  if (loading) return (
    <div className="cuaderno flex items-center justify-center h-64 text-[18px] text-cuaderno-grafito">Buscando los activos…</div>
  );

  return (
    <div className="cuaderno px-8 pt-5 pb-10 space-y-5">

      <FechaHoja />

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Titulo>Activos</Titulo>
          <p className="m-0 text-[17px] text-cuaderno-grafito">Maquinaria, vehículos y equipos: cuánto valen y sus documentos al día.</p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <ProyectoSelector variante="cuaderno" />
          <Boton variante="primario" onClick={() => { setEditando(null); setShowModal(true); }}>
            <IconoMas tamano={14} /> Nuevo activo
          </Boton>
        </div>
      </header>

      <Hoja titulo="Resumen" cuerpo="px-6 pb-4">
        <div className="grid gap-x-12 md:grid-cols-2">
          <div>
            <LineaGuia etiqueta="Activos en uso"><span>{activosActivos.length}</span></LineaGuia>
            <p className="m-0 -mt-1 mb-1 text-right text-[13px] text-cuaderno-grafito">{activos.filter(a => !a.activo).length} inactivos</p>
            <LineaGuia etiqueta="Documentos por vencer o vencidos">
              <span className={conAlertas > 0 ? "text-cuaderno-roja" : "text-cuaderno-verde"}>{conAlertas > 0 ? conAlertas : "ninguno"}</span>
            </LineaGuia>
          </div>
          <div>
            <LineaGuia etiqueta="Valor libro total"><Cifra valor={valorTotal} escala="pesos" color="tinta" vacio="$0" raya="doble" /></LineaGuia>
            <LineaGuia etiqueta="Depreciación al año"><Cifra valor={depTotal} escala="pesos" color="tinta" vacio="$0" /></LineaGuia>
            <p className="m-0 -mt-1 text-right text-[13px] text-cuaderno-grafito"><Cifra valor={depTotal / 12} escala="pesos" color="heredar" vacio="$0" /> al mes</p>
          </div>
        </div>
      </Hoja>

      <Hoja titulo="Detalle"
        extra={
          <>
            <Campo etiqueta="Buscar" type="search" className="w-56"
              value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Nombre, código o patente" />
            <Segmentado opciones={[{ id: "todos", label: "Todos" }, { id: "activos", label: "Activos" }, { id: "inactivos", label: "Inactivos" }]}
              valor={filtroEstado} onCambiar={setFiltroEstado} />
            <Campo as="select" etiqueta="Tipo" value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}>
              <option value="todos">Todos</option>
              {TIPOS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
            </Campo>
            <Casilla marcada={filtroDoc === "alertas"} onCambiar={v => setFiltroDoc(v ? "alertas" : "todos")} className="pb-2">
              Solo con documentos por vencer
            </Casilla>
          </>
        }>
        {activosFiltrados.length === 0 ? (
          <div className="py-12 text-center space-y-1">
            <p className="m-0 font-ligada font-light text-[22px] leading-[1.6]">
              {busqueda || filtroTipo !== "todos" ? "Nada coincide con los filtros" : "Aún no hay activos anotados"}
            </p>
            <p className="m-0 text-[16px] text-cuaderno-grafito">
              {busqueda || filtroTipo !== "todos" ? "Prueba con otra búsqueda o tipo." : "Agrega el primero con el botón Nuevo activo."}
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="shadow-[inset_0_-1.5px_0_rgb(var(--cuaderno-tinta))]">
                    {COLS.map(({ col, label, align, cls }) => {
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
                    const vl = valorLibros(a); const dep = depAnual(a); const alerta = tieneAlerta(a);
                    return (
                      <tr key={a.id} tabIndex={0}
                        onClick={() => setDetalle(detalle?.id === a.id ? null : a)}
                        onKeyDown={e => { if (e.key === "Enter") setDetalle(a); }}
                        className={`group border-b border-cuaderno-renglon cursor-pointer hover:bg-cuaderno-papel focus:outline-none focus-visible:bg-cuaderno-papel ${!a.activo ? "opacity-60" : ""}`}>
                        <td className="px-2 py-2">
                          <p className="m-0 text-[17px] leading-tight">{a.nombre}</p>
                          <p className="m-0 text-[13px] text-cuaderno-grafito">{[a.code, a.patente].filter(Boolean).join(", ") || (a.marca && `${a.marca} ${a.modelo || ""}`)}</p>
                        </td>
                        <td className="px-2 py-2 text-[15px] text-cuaderno-grafito">{TIPO_MAP[a.tipo]?.label || "Otro"}</td>
                        <td className="px-2 py-2 text-right text-[16px] whitespace-nowrap">
                          {vl > 0 ? (a.moneda && a.moneda !== "CLP" ? fmt(vl, a.moneda) : <Cifra valor={vl} escala="pesos" color="tinta" />) : <span className="text-cuaderno-grafito">—</span>}
                        </td>
                        <td className="px-2 py-2 text-right text-[15px] text-cuaderno-grafito whitespace-nowrap hidden md:table-cell">
                          {dep > 0 ? (a.moneda && a.moneda !== "CLP" ? fmt(dep, a.moneda) : <Cifra valor={dep} escala="pesos" color="heredar" />) : "—"}
                        </td>
                        <td className="px-2 py-2 text-[15px] hidden lg:table-cell whitespace-nowrap">
                          {alerta ? <Resaltado color="rosa">por vencer</Resaltado> : <span className="inline-flex items-center gap-1 text-cuaderno-verde"><VistoBueno tamano={12} titulo="" /> al día</span>}
                        </td>
                        <td className="px-2 py-2 text-[15px] text-cuaderno-grafito hidden sm:table-cell">{(OWN_LABELS[a.ownership] || a.ownership || "—").toLowerCase()}</td>
                        <td className="px-2 py-2 text-center text-[15px]">
                          {a.activo ? <Resaltado color="menta">activo</Resaltado> : <span className="text-cuaderno-grafito">inactivo</span>}
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
              <LineaGuia etiqueta="Valor libro de los activos en uso" className="w-full max-w-md">
                <Cifra valor={activosFiltrados.filter(a => a.activo).reduce((s, a) => s + valorLibros(a), 0)} escala="pesos" color="tinta" vacio="$0" raya="doble" />
              </LineaGuia>
            </div>
          </>
        )}
      </Hoja>

      {detalle && (
        <PanelDetalle activo={detalle} onClose={() => setDetalle(null)}
          onEdit={() => { setEditando(detalle); setShowModal(true); setDetalle(null); }}
          projects={projects} empresaId={empresaId} onDocUploaded={handleDocUploaded} onFechaUpdated={handleFechaDocUpdated} />
      )}

      <ModalActivo isOpen={showModal} onClose={() => { setShowModal(false); setEditando(null); }} onSave={handleSave} editando={editando} projects={projects} />

      {confirmEliminar && (
        <ModalCuaderno
          titulo="Eliminar activo"
          subtitulo="No se puede deshacer"
          ancho="max-w-sm"
          capa="z-[80]"
          onClose={() => setConfirmEliminar(null)}
          pie={
            <div className="flex gap-2">
              <Boton className="flex-1" onClick={() => setConfirmEliminar(null)}>Cancelar</Boton>
              <Boton variante="primario" className="flex-1 !bg-cuaderno-roja !border-cuaderno-roja hover:!bg-cuaderno-roja/90" onClick={confirmarEliminar}>Sí, eliminar</Boton>
            </div>
          }>
          <p className="m-0 text-[17px]">
            ¿Eliminar «{confirmEliminar.nombre || confirmEliminar.code || "este activo"}»?
          </p>
          {confirmEliminar._source === "machines" && (
            <Nota etiqueta="Ojo:">este activo viene de la flota de FleetCore. Se va a eliminar también de la flota principal.</Nota>
          )}
          <p className="m-0 text-[15px] text-cuaderno-grafito">Se borran también sus documentos y datos de valor.</p>
        </ModalCuaderno>
      )}
    </div>
  );
}
