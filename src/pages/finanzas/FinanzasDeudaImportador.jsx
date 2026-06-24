import React, { useState, useMemo, useRef } from "react";
import * as XLSX from "xlsx";
import { collection, getDocs, writeBatch, doc } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useEmpresa } from "../../lib/useEmpresa";
import { auth } from "../../lib/firebase";

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <form onSubmit={submit} className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg p-5 space-y-3 max-h-[90vh] overflow-y-auto">
        <h3 className="text-base font-black text-slate-800">Agregar documento de deuda</h3>
        <p className="text-xs text-slate-400">
          Para registrar un documento puntual sin esperar el próximo lote del Excel.
        </p>

        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="text-xs font-bold text-slate-500">Proveedor / Acreedor *</label>
            <input required value={form.proveedorNombre}
              onChange={e => setForm(f => ({ ...f, proveedorNombre: e.target.value }))}
              className="w-full mt-1 px-3 py-2 border-2 border-slate-200 rounded-xl text-sm focus:outline-none focus:border-purple-400" />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500">RUT</label>
            <input value={form.rut} onChange={e => setForm(f => ({ ...f, rut: e.target.value }))}
              className="w-full mt-1 px-3 py-2 border-2 border-slate-200 rounded-xl text-sm focus:outline-none focus:border-purple-400" />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500">Tipo de deuda</label>
            <select value={form.tipoDeuda} onChange={e => setForm(f => ({ ...f, tipoDeuda: e.target.value }))}
              className="w-full mt-1 px-3 py-2 border-2 border-slate-200 rounded-xl text-sm focus:outline-none focus:border-purple-400 bg-white">
              <option value="proveedor">Proveedor</option>
              <option value="factoring">Factoring</option>
              <option value="financiera">Financiera</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500">Obra</label>
            <input value={form.obra} onChange={e => setForm(f => ({ ...f, obra: e.target.value }))}
              className="w-full mt-1 px-3 py-2 border-2 border-slate-200 rounded-xl text-sm focus:outline-none focus:border-purple-400" />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500">OC</label>
            <input value={form.oc} onChange={e => setForm(f => ({ ...f, oc: e.target.value }))}
              className="w-full mt-1 px-3 py-2 border-2 border-slate-200 rounded-xl text-sm focus:outline-none focus:border-purple-400" />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500">N° Documento *</label>
            <input required value={form.numeroDoc} onChange={e => setForm(f => ({ ...f, numeroDoc: e.target.value }))}
              className="w-full mt-1 px-3 py-2 border-2 border-slate-200 rounded-xl text-sm focus:outline-none focus:border-purple-400" />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500">Valor documento</label>
            <input type="number" value={form.valorDoc} onChange={e => setForm(f => ({ ...f, valorDoc: e.target.value }))}
              className="w-full mt-1 px-3 py-2 border-2 border-slate-200 rounded-xl text-sm focus:outline-none focus:border-purple-400" />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500">Monto pagado</label>
            <input type="number" value={form.montoPagado} onChange={e => setForm(f => ({ ...f, montoPagado: e.target.value }))}
              className="w-full mt-1 px-3 py-2 border-2 border-slate-200 rounded-xl text-sm focus:outline-none focus:border-purple-400" />
          </div>
          <div className="col-span-2">
            <label className="text-xs font-bold text-slate-500">Fecha de vencimiento</label>
            <input type="date" value={form.fechaVencimiento} onChange={e => setForm(f => ({ ...f, fechaVencimiento: e.target.value }))}
              className="w-full mt-1 px-3 py-2 border-2 border-slate-200 rounded-xl text-sm focus:outline-none focus:border-purple-400" />
          </div>

          <div className="col-span-2 flex items-center gap-2">
            <input id="cedido" type="checkbox" checked={form.cedidoAFactoring}
              onChange={e => setForm(f => ({ ...f, cedidoAFactoring: e.target.checked }))}
              className="w-4 h-4" />
            <label htmlFor="cedido" className="text-xs font-bold text-slate-600">Cedido a factoring</label>
          </div>
          {form.cedidoAFactoring && (
            <div className="col-span-2">
              <label className="text-xs font-bold text-slate-500">Entidad de factoring</label>
              <input value={form.entidadFactoring} onChange={e => setForm(f => ({ ...f, entidadFactoring: e.target.value }))}
                placeholder="Security, Interfactor, Eurocapital..."
                className="w-full mt-1 px-3 py-2 border-2 border-slate-200 rounded-xl text-sm focus:outline-none focus:border-purple-400" />
            </div>
          )}

          <div className="col-span-2">
            <label className="text-xs font-bold text-slate-500">Notas internas</label>
            <textarea value={form.notasInternas} onChange={e => setForm(f => ({ ...f, notasInternas: e.target.value }))} rows={2}
              className="w-full mt-1 px-3 py-2 border-2 border-slate-200 rounded-xl text-sm focus:outline-none focus:border-purple-400 resize-none" />
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <button type="button" onClick={onClose} disabled={guardando}
            className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 rounded-xl text-sm font-bold text-slate-600 transition-colors disabled:opacity-50">
            Cancelar
          </button>
          <button type="submit" disabled={guardando}
            className="flex-1 py-2.5 bg-purple-700 hover:bg-purple-800 rounded-xl text-sm font-bold text-white transition-colors disabled:opacity-50">
            {guardando ? "Guardando..." : "Guardar documento"}
          </button>
        </div>
      </form>
    </div>
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
      setMensajeManual({ ok: false, texto: "No se pudo guardar el documento. Revisa la consola para más detalle." });
    }
    setGuardandoManual(false);
  }

  const totalParaRevisar = resultadoLectura?.parseadas?.length || 0;
  const totalDescartadas = resultadoLectura?.descartadas?.length || 0;

  return (
    <div className="space-y-4 sm:space-y-5">

      {/* ── Encabezado de la pestaña ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <p className="text-xs text-slate-500 max-w-xl">
          Sube el mismo archivo de <b>Detalle proveedores</b> cada vez que tengas un lote nuevo
          (ej. de 400 en 400). El sistema detecta automáticamente qué documentos son nuevos
          y cuáles ya existen y solo cambiaron de saldo o estado.
        </p>
        <button
          onClick={() => setModalManualOpen(true)}
          className="px-4 py-2.5 bg-purple-700 hover:bg-purple-800 text-white rounded-xl text-sm font-bold transition-colors flex items-center gap-2 self-end sm:self-auto flex-shrink-0"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
          </svg>
          Agregar documento manual
        </button>
      </div>

      {mensajeManual && (
        <div className={`rounded-xl p-3 text-xs font-bold ${mensajeManual.ok ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
          {mensajeManual.texto}
        </div>
      )}

      {/* ── Zona de carga de archivo ── */}
      <div className="glass-card rounded-xl p-5 sm:p-6">
        <p className="text-sm font-black text-slate-700 mb-3">1. Selecciona el archivo Excel</p>

        <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-slate-300 rounded-xl py-8 cursor-pointer hover:border-purple-400 hover:bg-purple-50/40 transition-colors">
          <svg className="w-8 h-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          <span className="text-sm font-bold text-slate-600">
            {archivo ? archivo.name : "Haz clic para elegir el archivo .xlsx"}
          </span>
          <span className="text-[11px] text-slate-400">Hoja "Detalle proveedores" · encabezados en la fila 3</span>
          <input
            ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden"
            onChange={handleArchivoSeleccionado}
          />
        </label>

        {leyendo && (
          <div className="flex items-center gap-2 mt-3 text-xs font-bold text-slate-500">
            <div className="w-4 h-4 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
            Leyendo archivo...
          </div>
        )}

        {errorLectura && (
          <div className="mt-3 rounded-xl p-3 text-xs font-bold bg-red-50 text-red-700 border border-red-200">
            {errorLectura}
          </div>
        )}

        {resultadoLectura && !diff && (
          <div className="mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200">
            <div className="text-xs text-slate-600">
              <span className="font-black text-slate-800">{totalParaRevisar}</span> documentos válidos leídos de la hoja "{resultadoLectura.hoja}"
              {totalDescartadas > 0 && (
                <span className="text-slate-400"> · {totalDescartadas} filas descartadas (totales / excluidas / sin proveedor)</span>
              )}
            </div>
            <button
              onClick={compararConFirestore}
              disabled={comparando || totalParaRevisar === 0}
              className="px-4 py-2 bg-purple-700 hover:bg-purple-800 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-colors flex-shrink-0"
            >
              {comparando ? "Comparando..." : "Comparar con Firestore →"}
            </button>
          </div>
        )}
      </div>

      {/* ── Resultado de la comparación (preview antes de escribir) ── */}
      {diff && !resultadoImport && (
        <div className="glass-card rounded-xl p-5 sm:p-6 space-y-4">
          <p className="text-sm font-black text-slate-700">2. Revisa los cambios antes de confirmar</p>

          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-center">
              <p className="text-2xl font-black text-emerald-700">{diff.nuevos.length}</p>
              <p className="text-[11px] font-bold text-emerald-600 uppercase">Nuevos</p>
            </div>
            <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-center">
              <p className="text-2xl font-black text-amber-700">{diff.actualizados.length}</p>
              <p className="text-[11px] font-bold text-amber-600 uppercase">Actualizados</p>
            </div>
            <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 text-center">
              <p className="text-2xl font-black text-slate-500">{diff.sinCambios.length}</p>
              <p className="text-[11px] font-bold text-slate-400 uppercase">Sin cambios</p>
            </div>
          </div>

          {diff.actualizados.length > 0 && (
            <div>
              <p className="text-xs font-black text-slate-600 mb-2">Documentos que van a cambiar:</p>
              <div className="max-h-56 overflow-y-auto rounded-xl border border-slate-200 divide-y divide-slate-100">
                {diff.actualizados.slice(0, 50).map((item, i) => (
                  <div key={i} className="flex items-center justify-between gap-2 px-3 py-2 text-xs">
                    <div className="min-w-0">
                      <p className="font-bold text-slate-700 truncate">{item.proveedorNombre} · Doc {item.numeroDoc}</p>
                      <p className="text-[10px] text-slate-400">
                        Saldo: {fmt(item._anterior.saldoPendiente)} → {fmt(item.saldoPendiente)}
                        {" · "}Mora: {item._anterior.diasMora || 0}d → {item.diasMora}d
                      </p>
                    </div>
                  </div>
                ))}
                {diff.actualizados.length > 50 && (
                  <p className="text-[11px] text-slate-400 text-center py-2">+{diff.actualizados.length - 50} más...</p>
                )}
              </div>
            </div>
          )}

          {importando && (
            <div className="rounded-xl bg-purple-50 border border-purple-200 p-3 text-xs font-bold text-purple-700">
              Importando {progreso.hecho} / {progreso.total}...
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button onClick={reiniciar} disabled={importando}
              className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 rounded-xl text-sm font-bold text-slate-600 transition-colors disabled:opacity-50">
              Cancelar
            </button>
            <button
              onClick={confirmarImportacion}
              disabled={importando || (diff.nuevos.length === 0 && diff.actualizados.length === 0)}
              className="flex-1 py-2.5 bg-purple-700 hover:bg-purple-800 disabled:opacity-50 rounded-xl text-sm font-bold text-white transition-colors"
            >
              {importando ? "Importando..." : `Confirmar e importar ${diff.nuevos.length + diff.actualizados.length} documento(s)`}
            </button>
          </div>
        </div>
      )}

      {/* ── Resultado final ── */}
      {resultadoImport && (
        <div className="glass-card rounded-xl p-6 flex flex-col items-center text-center gap-3">
          {resultadoImport.ok ? (
            <>
              <span className="text-4xl">✅</span>
              <p className="text-sm font-black text-emerald-600">Importación completada</p>
              <p className="text-xs text-slate-500">
                {resultadoImport.creados} documento(s) nuevo(s) · {resultadoImport.actualizados} actualizado(s) · {resultadoImport.sinCambios} sin cambios
              </p>
            </>
          ) : (
            <>
              <span className="text-4xl">⚠️</span>
              <p className="text-sm font-black text-red-600">Hubo un error al importar</p>
              <p className="text-xs text-slate-500 max-w-sm">{resultadoImport.error}</p>
            </>
          )}
          <button onClick={reiniciar} className="mt-2 px-5 py-2.5 bg-purple-700 hover:bg-purple-800 text-white rounded-xl text-sm font-bold transition-colors">
            Subir otro lote
          </button>
        </div>
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
