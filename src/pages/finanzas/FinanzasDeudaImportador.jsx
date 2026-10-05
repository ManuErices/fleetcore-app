import React, { useState, useMemo, useRef, useId } from "react";
import * as XLSX from "xlsx";
import { collection, getDocs, writeBatch, doc } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useEmpresa } from "../../lib/useEmpresa";
import { auth } from "../../lib/firebase";
import {
  ModalCuaderno, Hoja, Titulo, Campo, Boton, Segmentado, Casilla, Nota, LineaGuia, Cifra, VistoBueno,
  IconoMas, IconoSubir,
} from "./cuaderno";

/*
 * ════════════════════════════════════════════════════════════════════════
 *  IMPORTADOR RECURRENTE — Detalle proveedores (deuda_proveedores)
 * ════════════════════════════════════════════════════════════════════════
 * Lee el mismo formato de Excel usado en la migración original
 * (hoja "Detalle proveedores", encabezados en la fila 3) y permite subir
 * lotes nuevos (ej. de 400 en 400) sin duplicar lo que ya existe en
 * Firestore. También permite dar de alta UN documento manualmente.
 *
 * REGLAS DE NEGOCIO (idénticas a migrar_deuda.py, confirmadas con Manu):
 *  - Clave única de un documento de deuda: PROVEEDOR + OC + DOC
 *    (normalizada: mayúsculas, sin espacios extra)
 *  - Si la clave ya existe en Firestore -> UPDATE (se sobreescribe TODO
 *    con los valores del Excel; el Excel es siempre la fuente de verdad)
 *  - Si la clave no existe -> CREATE
 *  - Conceptos de personas/relacionadas (créditos, finiquitos, devolución
 *    a personas) se EXCLUYEN — van a un módulo aparte, no a deuda_proveedores
 *  - Mora se recalcula SIEMPRE desde hoy en el navegador, nunca se confía
 *    en una columna MORA del Excel (igual que en la migración Python)
 *  - Saldo pendiente negativo -> estado "anticipo_excedente", nunca "vencido"
 *  - factoring es un ATRIBUTO del documento, no cambia quién es el acreedor
 *
 * ESQUEMA DE DOCUMENTO (igual al usado por FinanzasDeuda.jsx):
 *  {
 *    proveedorNombre, proveedorSlug, rut, tipoDeuda: "proveedor"|"factoring"|"financiera",
 *    obra, oc, numeroDoc, valorDoc, montoPagado, saldoPendiente,
 *    fechaVencimiento (YYYY-MM-DD | null), diasMora,
 *    estado: "vencido"|"parcial"|"pendiente"|"pagado"|"anticipo_excedente",
 *    cedidoAFactoring (bool), entidadFactoring (string|null),
 *    notasInternas (string), claveUpsert (string) -- interna, no se muestra
 *  }
 * ════════════════════════════════════════════════════════════════════════
 */

// ─── Utilidades compartidas con el resto del módulo ──────────────────────────
function fmtM(n) {
  if (!n && n !== 0) return "$0";
  const a = Math.abs(n);
  if (a >= 1000000) return (n < 0 ? "-" : "") + "$" + (a / 1000000).toFixed(1).replace(".", ",") + "M";
  return (n < 0 ? "-" : "") + "$" + Math.round(a).toLocaleString("es-CL");
}
function fmt(n) { return "$" + Math.round(Math.abs(n || 0)).toLocaleString("es-CL"); }

function slugify(str) {
  return (str || "")
    .toString()
    .trim()
    .toUpperCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // quita tildes
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

// Palabras clave que identifican filas de personas/relacionadas (excluidas del módulo)
const KEYWORDS_EXCLUIR = [
  "FINIQUITO", "DEVOLUCION PRESTAMO", "DEVOLUCIÓN PRESTAMO", "CREDITO PERSONAL",
  "PAMELA NAVARRO", "ROSITA ERICES", "FABIAN ERICES", "FABIÁN ERICES",
];

// Palabras clave para clasificar tipoDeuda cuando no viene explícito
const KEYWORDS_FACTORING_ENTIDAD = ["SECURITY", "INTERFACTOR", "EUROCAPITAL"];
const KEYWORDS_FINANCIERA = ["BANCO", "LEASING", "RENTING"];

// Excel guarda fechas como número serial (días desde 1899-12-30)
function excelSerialToISO(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") {
    const utcDays = value - 25569; // offset 1899-12-30 -> 1970-01-01
    const utcMs = utcDays * 86400 * 1000;
    const d = new Date(utcMs);
    if (isNaN(d)) return null;
    return d.toISOString().slice(0, 10);
  }
  if (value instanceof Date) {
    if (isNaN(value)) return null;
    return value.toISOString().slice(0, 10);
  }
  // String tipo "DD-MM-YYYY" o "DD/MM/YYYY"
  if (typeof value === "string") {
    const m = value.trim().match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})/);
    if (m) {
      let [, d, mo, y] = m;
      if (y.length === 2) y = "20" + y;
      const dt = new Date(`${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}T12:00:00`);
      if (!isNaN(dt)) return dt.toISOString().slice(0, 10);
    }
  }
  return null;
}

// Limpia columnas numéricas que en el Excel original traían texto mezclado
// (ej. "IZARRA", "RENDICION FABIAN", "APLAZADO", "N/A") -> 0
function toNumberSafe(value) {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number") return isNaN(value) ? 0 : value;
  const cleaned = String(value).replace(/[^0-9.,-]/g, "").replace(",", ".");
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

function diasMoraDesdeHoy(fechaVencISO) {
  if (!fechaVencISO) return 0;
  const venc = new Date(fechaVencISO + "T12:00:00");
  if (isNaN(venc)) return 0;
  const hoy = new Date();
  const dias = Math.floor((hoy - venc) / 86400000);
  return dias > 0 ? dias : 0;
}

// El Excel original mezcla headers con y sin espacios al inicio/fin
// (ej. " VALOR DOC " vs "OBRA"), dependiendo de quién editó la planilla.
// Esto vuelve el parser inmune a esa inconsistencia, recortando espacios
// de TODAS las claves antes de leer cualquier columna.
function normalizarClaves(row) {
  const limpio = {};
  Object.keys(row).forEach(k => {
    limpio[k.trim()] = row[k];
  });
  return limpio;
}

function calcularEstado(saldoPendiente, valorDoc, diasMora) {
  if (saldoPendiente < 0) return "anticipo_excedente";
  if (saldoPendiente === 0) return "pagado";
  if (diasMora > 0) return "vencido";
  if (saldoPendiente < valorDoc) return "parcial";
  return "pendiente";
}

function detectarTipoYFactoring(proveedorNombre, factoringRaw) {
  const nombreUpper = (proveedorNombre || "").toUpperCase();
  const factoringUpper = (factoringRaw || "").toString().toUpperCase().trim();

  // Si la columna FACTORING tiene una entidad reconocida -> está cedido a factoring,
  // pero el acreedor sigue siendo el proveedor (regla confirmada con Manu)
  const entidadFactoring = KEYWORDS_FACTORING_ENTIDAD.find(k => factoringUpper.includes(k));
  if (entidadFactoring) {
    return { tipoDeuda: "proveedor", cedidoAFactoring: true, entidadFactoring };
  }
  if (KEYWORDS_FINANCIERA.some(k => nombreUpper.includes(k))) {
    return { tipoDeuda: "financiera", cedidoAFactoring: false, entidadFactoring: null };
  }
  return { tipoDeuda: "proveedor", cedidoAFactoring: false, entidadFactoring: null };
}

function esFilaExcluida(proveedorNombre, obs) {
  const texto = `${proveedorNombre || ""} ${obs || ""}`.toUpperCase();
  return KEYWORDS_EXCLUIR.some(k => texto.includes(k));
}

// ─── Parseo de una fila cruda del Excel al esquema de Firestore ─────────────
function parsearFila(row) {
  row = normalizarClaves(row);
  const proveedorNombre = (row["PROVEEDOR"] || "").toString().trim();
  if (!proveedorNombre || proveedorNombre.toUpperCase() === "TOTAL PROVEEDORES") return null;

  const obs = row["OBS. PAGO"] || row["OBS"] || "";
  if (esFilaExcluida(proveedorNombre, obs)) return null;

  const oc = (row["OC"] || "").toString().trim();
  const numeroDoc = (row["DOC"] || "").toString().trim();
  const obra = (row["OBRA"] || "").toString().trim();
  const rut = (row["RUT"] || "").toString().trim();

  const valorDoc = toNumberSafe(row["VALOR DOC"]);
  const saldoPendiente = toNumberSafe(row["SALDO PEND"]);
  const montoPagado = valorDoc - saldoPendiente;

  const fechaVencimiento = excelSerialToISO(row["FECHA VCTO"]);
  const diasMora = saldoPendiente > 0 ? diasMoraDesdeHoy(fechaVencimiento) : 0;
  const estado = calcularEstado(saldoPendiente, valorDoc, diasMora);

  const { tipoDeuda, cedidoAFactoring, entidadFactoring } = detectarTipoYFactoring(
    proveedorNombre, row["FACTORING"]
  );

  const claveUpsert = `${slugify(proveedorNombre)}__${slugify(oc)}__${slugify(numeroDoc)}`;

  return {
    claveUpsert,
    proveedorNombre,
    proveedorSlug: slugify(proveedorNombre),
    rut,
    tipoDeuda,
    obra,
    oc,
    numeroDoc,
    valorDoc,
    montoPagado,
    saldoPendiente,
    fechaVencimiento,
    diasMora,
    estado,
    cedidoAFactoring,
    entidadFactoring,
    notasInternas: "",
  };
}

// ─── Lee el archivo .xlsx (hoja "Detalle proveedores", header en fila 3) ────
async function leerExcelDetalleProveedores(file) {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array", cellDates: false });

  const nombreHoja =
    wb.SheetNames.find(n => n.toUpperCase().includes("DETALLE")) || wb.SheetNames[0];
  const ws = wb.Sheets[nombreHoja];

  // header está en la fila 3 (índice 2) según el archivo original
  const rows = XLSX.utils.sheet_to_json(ws, { range: 2, defval: "" });

  const parseadas = [];
  const descartadas = [];
  rows.forEach((row, i) => {
    const item = parsearFila(row);
    if (item) parseadas.push(item);
    else descartadas.push({ fila: i + 4, motivo: "Total / excluida / sin proveedor" });
  });

  return { hoja: nombreHoja, totalFilasLeidas: rows.length, parseadas, descartadas };
}

// ════════════════════════════════════════════════════════════════════════
//  Modal: agregar UN documento manualmente
// ════════════════════════════════════════════════════════════════════════
function ModalDocumentoManual({ isOpen, onClose, onSave, guardando }) {
  const vacio = {
    proveedorNombre: "", rut: "", tipoDeuda: "proveedor",
    obra: "", oc: "", numeroDoc: "",
    valorDoc: "", montoPagado: "0", fechaVencimiento: "",
    cedidoAFactoring: false, entidadFactoring: "", notasInternas: "",
  };
  const [form, setForm] = useState(vacio);

  if (!isOpen) return null;

  function submit(e) {
    e.preventDefault();
    if (!form.proveedorNombre.trim() || !form.numeroDoc.trim()) return;

    const valorDoc = parseFloat(form.valorDoc) || 0;
    const montoPagado = parseFloat(form.montoPagado) || 0;
    const saldoPendiente = valorDoc - montoPagado;
    const diasMora = saldoPendiente > 0 ? diasMoraDesdeHoy(form.fechaVencimiento || null) : 0;
    const estado = calcularEstado(saldoPendiente, valorDoc, diasMora);
    const claveUpsert = `${slugify(form.proveedorNombre)}__${slugify(form.oc)}__${slugify(form.numeroDoc)}`;

    onSave({
      claveUpsert,
      proveedorNombre: form.proveedorNombre.trim(),
      proveedorSlug: slugify(form.proveedorNombre),
      rut: form.rut.trim(),
      tipoDeuda: form.tipoDeuda,
      obra: form.obra.trim(),
      oc: form.oc.trim(),
      numeroDoc: form.numeroDoc.trim(),
      valorDoc,
      montoPagado,
      saldoPendiente,
      fechaVencimiento: form.fechaVencimiento || null,
      diasMora,
      estado,
      cedidoAFactoring: form.cedidoAFactoring,
      entidadFactoring: form.cedidoAFactoring ? (form.entidadFactoring.trim() || null) : null,
      notasInternas: form.notasInternas.trim(),
    });
  }

  return <FormularioDocumento form={form} setForm={setForm} submit={submit} onClose={onClose} guardando={guardando} />;
}

function FormularioDocumento({ form, setForm, submit, onClose, guardando }) {
  const idForm = useId();
  const set = (campo) => (e) => setForm(f => ({ ...f, [campo]: e.target.value }));
  return (
    <ModalCuaderno
      titulo="Agregar documento de deuda"
      subtitulo="Para anotar un documento sin esperar el próximo Excel"
      ancho="max-w-lg"
      onClose={onClose}
      bloqueado={guardando}
      pie={
        <div className="flex gap-2">
          <Boton className="flex-1" onClick={onClose} disabled={guardando}>Cancelar</Boton>
          <Boton type="submit" form={idForm} variante="primario" className="flex-1" disabled={guardando}>
            {guardando ? "Guardando…" : "Guardar documento"}
          </Boton>
        </div>
      }>
      <form id={idForm} onSubmit={submit} className="space-y-5">
        <Campo etiqueta="Proveedor o acreedor" required value={form.proveedorNombre} onChange={set("proveedorNombre")} />

        <div className="grid grid-cols-2 gap-4">
          <Campo etiqueta="RUT" value={form.rut} onChange={set("rut")} />
          <Campo etiqueta="N° de documento" required value={form.numeroDoc} onChange={set("numeroDoc")} />
        </div>

        <Segmentado
          etiqueta="Tipo de deuda"
          opciones={[{ id: "proveedor", label: "Proveedor" }, { id: "factoring", label: "Factoring" }, { id: "financiera", label: "Financiera" }]}
          valor={form.tipoDeuda}
          onCambiar={id => setForm(f => ({ ...f, tipoDeuda: id }))}
        />

        <div className="grid grid-cols-2 gap-4">
          <Campo etiqueta="Obra" value={form.obra} onChange={set("obra")} />
          <Campo etiqueta="OC" value={form.oc} onChange={set("oc")} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Campo etiqueta="Valor del documento" type="number" inputMode="numeric" value={form.valorDoc} onChange={set("valorDoc")} placeholder="$ 0" />
          <Campo etiqueta="Monto ya pagado" type="number" inputMode="numeric" value={form.montoPagado} onChange={set("montoPagado")} placeholder="$ 0" />
        </div>

        <Campo etiqueta="Fecha de vencimiento" type="date" value={form.fechaVencimiento} onChange={set("fechaVencimiento")} />

        <div className="border-t border-cuaderno-azul pt-4 space-y-4">
          <Casilla marcada={form.cedidoAFactoring} onCambiar={v => setForm(f => ({ ...f, cedidoAFactoring: v }))}
            descripcion="El documento se cedió y ahora se le paga a la entidad de factoring">
            Cedido a factoring
          </Casilla>
          {form.cedidoAFactoring && (
            <Campo etiqueta="Entidad de factoring" className="ml-9" value={form.entidadFactoring} onChange={set("entidadFactoring")}
              placeholder="Security, Interfactor, Eurocapital…" />
          )}
        </div>

        <Campo as="textarea" rows={2} etiqueta="Notas internas" value={form.notasInternas} onChange={set("notasInternas")} />
      </form>
    </ModalCuaderno>
  );
}

// ════════════════════════════════════════════════════════════════════════
//  Componente principal: importador de lotes Excel
// ════════════════════════════════════════════════════════════════════════
export default function FinanzasDeudaImportador({ onImportComplete }) {
  const { empresaId } = useEmpresa();
  const fileInputRef = useRef(null);

  const [archivo, setArchivo] = useState(null);
  const [leyendo, setLeyendo] = useState(false);
  const [errorLectura, setErrorLectura] = useState(null);
  const [resultadoLectura, setResultadoLectura] = useState(null); // { hoja, totalFilasLeidas, parseadas, descartadas }

  const [comparando, setComparando] = useState(false);
  const [diff, setDiff] = useState(null); // { nuevos: [], actualizados: [], sinCambios: [] }

  const [importando, setImportando] = useState(false);
  const [progreso, setProgreso] = useState({ hecho: 0, total: 0 });
  const [resultadoImport, setResultadoImport] = useState(null);

  const [modalManualOpen, setModalManualOpen] = useState(false);
  const [guardandoManual, setGuardandoManual] = useState(false);
  const [mensajeManual, setMensajeManual] = useState(null);

  // ── Paso 1: leer el Excel seleccionado ────────────────────────────────
  async function handleArchivoSeleccionado(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setArchivo(file);
    setErrorLectura(null);
    setResultadoLectura(null);
    setDiff(null);
    setResultadoImport(null);
    setLeyendo(true);
    try {
      const resultado = await leerExcelDetalleProveedores(file);
      setResultadoLectura(resultado);
    } catch (err) {
      console.error("Error leyendo Excel:", err);
      setErrorLectura("No se pudo leer el archivo. Verifica que sea el mismo formato de 'Detalle proveedores' (encabezados en la fila 3).");
    }
    setLeyendo(false);
  }

  // ── Paso 2: comparar contra lo que ya existe en Firestore ─────────────
  async function compararConFirestore() {
    if (!empresaId || !resultadoLectura) return;
    setComparando(true);
    try {
      const snap = await getDocs(collection(db, "empresas", empresaId, "deuda_proveedores"));
      const existentes = {};
      snap.docs.forEach(d => {
        const data = d.data();
        const clave = data.claveUpsert ||
          `${slugify(data.proveedorNombre)}__${slugify(data.oc)}__${slugify(data.numeroDoc)}`;
        existentes[clave] = { id: d.id, data };
      });

      const nuevos = [];
      const actualizados = [];
      const sinCambios = [];

      resultadoLectura.parseadas.forEach(item => {
        const match = existentes[item.claveUpsert];
        if (!match) {
          nuevos.push(item);
          return;
        }
        const cambioSaldo = (match.data.saldoPendiente || 0) !== item.saldoPendiente;
        const cambioEstado = (match.data.estado || "") !== item.estado;
        const cambioMora = (match.data.diasMora || 0) !== item.diasMora;
        if (cambioSaldo || cambioEstado || cambioMora) {
          actualizados.push({ ...item, _firestoreId: match.id, _anterior: match.data });
        } else {
          sinCambios.push({ ...item, _firestoreId: match.id });
        }
      });

      setDiff({ nuevos, actualizados, sinCambios });
    } catch (err) {
      console.error("Error comparando con Firestore:", err);
      setErrorLectura("No se pudo comparar con los datos existentes en Firestore.");
    }
    setComparando(false);
  }

  // ── Paso 3: escribir el lote + auditoría en el mismo batch ──
  // Tamaño de batch reducido a 150: cada documento actualizado puede generar
  // varias entradas de auditoría (una por campo cambiado), y todo debe entrar
  // en el mismo batch atómico (límite real de Firestore: 500 operaciones).
  // 150 documentos × ~3 entradas de auditoría promedio + 1 doc principal
  // se mantiene con margen seguro bajo ese límite.
  const CAMPOS_AUDITADOS = ["saldoPendiente", "estado", "diasMora", "valorDoc", "montoPagado", "fechaVencimiento"];

  async function confirmarImportacion() {
    if (!empresaId || !diff) return;
    setImportando(true);
    setResultadoImport(null);

    const porEscribir = [...diff.nuevos, ...diff.actualizados];
    const TAMANO_BATCH = 150;
    const usuarioEmail = auth.currentUser?.email || "desconocido";
    const ahora = new Date().toISOString();
    setProgreso({ hecho: 0, total: porEscribir.length });

    try {
      for (let i = 0; i < porEscribir.length; i += TAMANO_BATCH) {
        const lote = porEscribir.slice(i, i + TAMANO_BATCH);
        const batch = writeBatch(db);

        lote.forEach(item => {
          const { _firestoreId, _anterior, ...payload } = item;
          const ref = _firestoreId
            ? doc(db, "empresas", empresaId, "deuda_proveedores", _firestoreId)
            : doc(collection(db, "empresas", empresaId, "deuda_proveedores"));
          batch.set(ref, payload, { merge: false }); // sobreescritura completa, confirmado con Manu

          const documentoId = _firestoreId || ref.id;
          const auditoriaRef = (entrada) => doc(collection(db, "empresas", empresaId, "deuda_auditoria"));

          if (!_anterior) {
            // Documento nuevo: una sola entrada resumen
            batch.set(auditoriaRef(), {
              empresaId, documentoId, coleccion: "deuda_proveedores",
              accion: "crear", campo: null, valorAnterior: null, valorNuevo: null,
              usuarioEmail, origen: "importador", fecha: ahora,
            });
          } else {
            // Documento actualizado: una entrada por cada campo de negocio que cambió
            CAMPOS_AUDITADOS.forEach((campo) => {
              const anterior = _anterior[campo] ?? null;
              const nuevo = payload[campo] ?? null;
              if (JSON.stringify(anterior) !== JSON.stringify(nuevo)) {
                batch.set(auditoriaRef(), {
                  empresaId, documentoId, coleccion: "deuda_proveedores",
                  accion: "actualizar", campo, valorAnterior: anterior, valorNuevo: nuevo,
                  usuarioEmail, origen: "importador", fecha: ahora,
                });
              }
            });
          }
        });

        await batch.commit();
        setProgreso(p => ({ ...p, hecho: Math.min(p.hecho + lote.length, porEscribir.length) }));
      }

      setResultadoImport({
        ok: true,
        creados: diff.nuevos.length,
        actualizados: diff.actualizados.length,
        sinCambios: diff.sinCambios.length,
      });
      onImportComplete?.();
    } catch (err) {
      console.error("Error importando lote a Firestore:", err);
      setResultadoImport({ ok: false, error: err.message });
    }
    setImportando(false);
  }

  function reiniciar() {
    setArchivo(null);
    setResultadoLectura(null);
    setErrorLectura(null);
    setDiff(null);
    setResultadoImport(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  // ── Guardar documento manual (upsert directo, sin pasar por comparación de lote) ──
  async function guardarDocumentoManual(item) {
    if (!empresaId) return;
    setGuardandoManual(true);
    setMensajeManual(null);
    try {
      const snap = await getDocs(collection(db, "empresas", empresaId, "deuda_proveedores"));
      const existente = snap.docs.find(d => {
        const data = d.data();
        const clave = data.claveUpsert ||
          `${slugify(data.proveedorNombre)}__${slugify(data.oc)}__${slugify(data.numeroDoc)}`;
        return clave === item.claveUpsert;
      });

      const ref = existente
        ? doc(db, "empresas", empresaId, "deuda_proveedores", existente.id)
        : doc(collection(db, "empresas", empresaId, "deuda_proveedores"));
      const documentoId = existente ? existente.id : ref.id;
      const usuarioEmail = auth.currentUser?.email || "desconocido";
      const ahora = new Date().toISOString();

      // set sin merge: usamos writeBatch para reusar el mismo helper de escritura
      const batch = writeBatch(db);
      batch.set(ref, item, { merge: false });

      if (!existente) {
        batch.set(doc(collection(db, "empresas", empresaId, "deuda_auditoria")), {
          empresaId, documentoId, coleccion: "deuda_proveedores",
          accion: "crear", campo: null, valorAnterior: null, valorNuevo: null,
          usuarioEmail, origen: "manual", fecha: ahora,
        });
      } else {
        const anteriorData = existente.data();
        const camposRevisar = new Set([...Object.keys(anteriorData), ...Object.keys(item)]);
        camposRevisar.forEach((campo) => {
          if (campo === "id" || campo === "comprobantes" || campo === "claveUpsert") return;
          const anterior = anteriorData[campo] ?? null;
          const nuevo = item[campo] ?? null;
          if (JSON.stringify(anterior) !== JSON.stringify(nuevo)) {
            batch.set(doc(collection(db, "empresas", empresaId, "deuda_auditoria")), {
              empresaId, documentoId, coleccion: "deuda_proveedores",
              accion: "actualizar", campo, valorAnterior: anterior, valorNuevo: nuevo,
              usuarioEmail, origen: "manual", fecha: ahora,
            });
          }
        });
      }

      await batch.commit();

      setMensajeManual({
        ok: true,
        texto: existente
          ? `Documento actualizado: ${item.proveedorNombre} · Doc ${item.numeroDoc}`
          : `Documento creado: ${item.proveedorNombre} · Doc ${item.numeroDoc}`,
      });
      setModalManualOpen(false);
      onImportComplete?.();
    } catch (err) {
      console.error("Error guardando documento manual:", err);
      setMensajeManual({ ok: false, texto: "No se pudo guardar el documento. Revisa tu conexión e intenta de nuevo." });
    }
    setGuardandoManual(false);
  }

  const totalParaRevisar = resultadoLectura?.parseadas?.length || 0;
  const totalDescartadas = resultadoLectura?.descartadas?.length || 0;

  return (
    <div className="space-y-5">

      <div className="flex flex-wrap items-end justify-between gap-4">
        <p className="m-0 max-w-xl text-[17px] text-cuaderno-grafito leading-snug">
          Sube el archivo de detalle de proveedores cada vez que tengas un lote nuevo. Se detecta solo
          qué documentos son nuevos y cuáles ya existían y cambiaron de saldo o de estado.
        </p>
        <Boton onClick={() => setModalManualOpen(true)}>
          <IconoMas tamano={14} /> Agregar documento a mano
        </Boton>
      </div>

      {mensajeManual && (mensajeManual.ok
        ? <p className="m-0 flex items-center gap-2 text-[17px] text-cuaderno-verde"><VistoBueno tamano={16} titulo="" /> {mensajeManual.texto}</p>
        : <Nota etiqueta="Ojo:">{mensajeManual.texto}</Nota>)}

      {/* ── Paso 1: archivo ── */}
      <Hoja titulo="1. Elige el archivo Excel">
        <label className="flex flex-col items-center justify-center gap-1.5 py-8 rounded-md border-[1.5px] border-dashed border-cuaderno-columna hover:border-cuaderno-tinta hover:bg-cuaderno-papel cursor-pointer text-center focus-within:ring-2 focus-within:ring-cuaderno-tinta/40">
          <IconoSubir tamano={26} className="text-cuaderno-grafito" />
          <span className="text-[18px]">{archivo ? archivo.name : "Haz clic para elegir el archivo .xlsx"}</span>
          <span className="text-[14px] text-cuaderno-grafito">Hoja «Detalle proveedores», con los encabezados en la fila 3</span>
          <input
            ref={fileInputRef} type="file" accept=".xlsx,.xls" className="sr-only"
            onChange={handleArchivoSeleccionado}
          />
        </label>

        {leyendo && <p className="m-0 mt-3 text-[16px] text-cuaderno-grafito">Leyendo el archivo…</p>}
        {errorLectura && <Nota etiqueta="Ojo:" className="mt-3">{errorLectura}</Nota>}

        {resultadoLectura && !diff && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-cuaderno-renglon">
            <p className="m-0 text-[17px]">
              {totalParaRevisar} documentos válidos en la hoja «{resultadoLectura.hoja}».
              {totalDescartadas > 0 && (
                <span className="block text-[14px] text-cuaderno-grafito">
                  Se dejaron fuera {totalDescartadas} filas: totales, conceptos excluidos o sin proveedor.
                </span>
              )}
            </p>
            <Boton variante="primario" onClick={compararConFirestore} disabled={comparando || totalParaRevisar === 0}>
              {comparando ? "Comparando…" : "Comparar con lo registrado"}
            </Boton>
          </div>
        )}
      </Hoja>

      {/* ── Paso 2: revisión antes de escribir ── */}
      {diff && !resultadoImport && (
        <Hoja titulo="2. Revisa los cambios antes de confirmar">
          <div className="max-w-md">
            <LineaGuia etiqueta="Documentos nuevos"><span>{diff.nuevos.length}</span></LineaGuia>
            <LineaGuia etiqueta="Documentos que cambian"><span>{diff.actualizados.length}</span></LineaGuia>
            <LineaGuia etiqueta="Sin cambios"><span className="text-cuaderno-grafito">{diff.sinCambios.length}</span></LineaGuia>
          </div>

          {diff.actualizados.length > 0 && (
            <div className="mt-4">
              <p className="m-0 mb-1 text-[16px] text-cuaderno-grafito">Lo que va a cambiar:</p>
              <ul className="m-0 p-0 list-none max-h-64 overflow-y-auto border-t border-cuaderno-renglon">
                {diff.actualizados.slice(0, 50).map((item, i) => (
                  <li key={i} className="py-2 border-b border-cuaderno-renglon">
                    <p className="m-0 text-[16px] leading-tight">{item.proveedorNombre}, documento {item.numeroDoc}</p>
                    <p className="m-0 text-[14px] text-cuaderno-grafito">
                      Saldo de {fmt(item._anterior.saldoPendiente)} a {fmt(item.saldoPendiente)}, mora de {item._anterior.diasMora || 0} a {item.diasMora} días
                    </p>
                  </li>
                ))}
              </ul>
              {diff.actualizados.length > 50 && (
                <p className="m-0 mt-2 text-[14px] text-cuaderno-grafito">Y {diff.actualizados.length - 50} más.</p>
              )}
            </div>
          )}

          {importando && (
            <p className="m-0 mt-4 text-[17px]">Importando {progreso.hecho} de {progreso.total}…</p>
          )}

          <div className="flex flex-wrap gap-2 mt-5">
            <Boton onClick={reiniciar} disabled={importando}>Cancelar</Boton>
            <Boton variante="primario" onClick={confirmarImportacion}
              disabled={importando || (diff.nuevos.length === 0 && diff.actualizados.length === 0)}>
              {importando ? "Importando…" : `Confirmar e importar ${diff.nuevos.length + diff.actualizados.length} documento${diff.nuevos.length + diff.actualizados.length !== 1 ? "s" : ""}`}
            </Boton>
          </div>
        </Hoja>
      )}

      {/* ── Resultado ── */}
      {resultadoImport && (
        <Hoja cuerpo="px-6 py-8 text-center space-y-2">
          {resultadoImport.ok ? (
            <>
              <VistoBueno tamano={30} titulo="Listo" className="mx-auto" />
              <Titulo as="h2" tamano="md">Importación lista</Titulo>
              <p className="m-0 text-[17px] text-cuaderno-grafito">
                {resultadoImport.creados} nuevos, {resultadoImport.actualizados} actualizados y {resultadoImport.sinCambios} sin cambios.
              </p>
            </>
          ) : (
            <>
              <Titulo as="h2" tamano="md" className="text-cuaderno-roja">No se pudo importar</Titulo>
              <p className="m-0 text-[16px] text-cuaderno-grafito max-w-md mx-auto">{resultadoImport.error}</p>
            </>
          )}
          <Boton variante="primario" className="mt-2" onClick={reiniciar}>Subir otro lote</Boton>
        </Hoja>
      )}

      <ModalDocumentoManual
        isOpen={modalManualOpen}
        onClose={() => setModalManualOpen(false)}
        onSave={guardarDocumentoManual}
        guardando={guardandoManual}
      />
    </div>
  );
}
