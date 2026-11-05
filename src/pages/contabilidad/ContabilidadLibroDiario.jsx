import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useContabilidad, PeriodoSelector, TIPOS_MAP, MESES, normalizaRut } from "./ContabilidadContext";
import ModalImportIConstruct from "./ContabilidadImportIConstruct";
import ModalExportPDF from "./ContabilidadExportPDF";
import {
  Titulo, Hoja, Cifra, LineaGuia, Resaltado, Nota, Aviso, VistoBueno, Boton, Campo, ModalCuaderno,
  Segmentado, FechaHoja, IconoCerrar, IconoLapiz, IconoBorrar, IconoBajar, IconoMas, IconoDocumento,
  IconoSubir, IconoAnterior, IconoSiguiente,
} from "../finanzas/cuaderno";
import * as XLSX from "xlsx";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { db, auth } from "../../lib/firebase";

// Categorías rápidas para reclasificar asientos importados desde el Libro Diario
const CATEGORIAS_RAPIDAS = [
  { label: "Combustible (Ley 18.502)", icon: "⛽" },
  { label: "Subcontratos", icon: "🏗️" },
  { label: "Materiales y Repuestos", icon: "🔧" },
  { label: "Transporte y Pasajes", icon: "✈️" },
  { label: "Telecomunicaciones", icon: "📡" },
  { label: "Seguridad", icon: "🛡️" },
  { label: "Servicios Profesionales", icon: "⚖️" },
  { label: "Peajes y Movilización", icon: "🛣️" },
  { label: "Arriendos", icon: "🏢" },
  { label: "Gastos Financieros", icon: "🏦" },
  { label: "Gastos Generales", icon: "📋" },
  { label: "Gastos Varios", icon: "🧾" },
];

// ─── Piezas locales de presentación ──────────────────────────────────────────
// Renglón subrayado compacto para las líneas del asiento (Campo trae etiqueta;
// aquí la etiqueta va en la cabecera de la tabla).
const RENGLON = "min-h-[36px] w-full border-0 border-b-[1.5px] border-cuaderno-tinta/70 bg-transparent px-1 text-[16px] text-cuaderno-tinta focus:outline-none focus:border-cuaderno-tinta";
const CHECK = "w-4 h-4 accent-cuaderno-tinta cursor-pointer";

// Flecha de reverso con el mismo trazo fino de los íconos del cuaderno
const IconoReversar = ({ tamano = 16, className = "" }) => (
  <svg width={tamano} height={tamano} viewBox="0 0 16 16" fill="none" stroke="currentColor"
    strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={`flex-shrink-0 ${className}`}>
    <path d="M2.5 6.5 H10 A3.5 3.5 0 0 1 10 13.5 H8 M5.5 3.5 L2.5 6.5 L5.5 9.5" />
  </svg>
);

// Los detalles reclasificados guardan el ícono de la categoría al inicio; en
// pantalla se muestran sin él (el cuaderno no lleva emojis). El dato no cambia.
const sinIcono = (t) => String(t || "").replace(/^\p{Extended_Pictographic}\uFE0F?\s*/u, "");

// Sumas de debe y haber de un asiento, para mostrarlas y marcar si no cuadra
function cuadraturaAsiento(a) {
  const lineas = a.lineas || [];
  if (!lineas.length) return { debe: a.totalDebe || 0, haber: a.totalDebe || 0, descuadrado: false };
  const debe = lineas.reduce((s, l) => s + (parseFloat(l.debe) || 0), 0);
  const haber = lineas.reduce((s, l) => s + (parseFloat(l.haber) || 0), 0);
  return { debe, haber, descuadrado: Math.abs(debe - haber) >= 0.01 };
}

// ─── Modal asiento ────────────────────────────────────────────────────────────
const LINEA_EMPTY = { cuentaId: "", cuentaNombre: "", debe: "", haber: "", descripcion: "" };
const ASIENTO_EMPTY = {
  fecha: new Date().toISOString().slice(0, 10),
  glosa: "",
  tipo: "manual",
  lineas: [{ ...LINEA_EMPTY }, { ...LINEA_EMPTY }],
};

function LineaAsiento({ linea, idx, cuentas, onChange, onRemove, canRemove }) {
  const set = (k, v) => onChange(idx, { ...linea, [k]: v });
  const cuenta = cuentas.find(c => c.id === linea.cuentaId);
  return (
    <div className="grid grid-cols-12 gap-3 items-start py-2 border-b border-cuaderno-renglon last:border-0">
      <div className="col-span-5">
        <select value={linea.cuentaId} aria-label="Cuenta" onChange={e => {
          const c = cuentas.find(x => x.id === e.target.value);
          onChange(idx, { ...linea, cuentaId: e.target.value, cuentaNombre: c?.nombre || "" });
        }}
          className={RENGLON}>
          <option value="">— Seleccionar cuenta —</option>
          {cuentas.filter(c => c.activa !== false).map(c => (
            <option key={c.id} value={c.id}>{c.codigo} — {c.nombre}</option>
          ))}
        </select>
        <input value={linea.descripcion} onChange={e => set("descripcion", e.target.value)} placeholder="Detalle..." aria-label="Detalle"
          className="w-full mt-1 min-h-[30px] border-0 border-b border-cuaderno-renglon bg-transparent px-1 text-[14px] text-cuaderno-grafito focus:outline-none focus:border-cuaderno-tinta" />
      </div>
      <div className="col-span-3">
        <input type="number" value={linea.debe} onChange={e => set("debe", e.target.value)} placeholder="0" aria-label="Debe"
          className={`${RENGLON} text-right`}
          onFocus={() => { if (linea.haber) set("haber", ""); }} />
      </div>
      <div className="col-span-3">
        <input type="number" value={linea.haber} onChange={e => set("haber", e.target.value)} placeholder="0" aria-label="Haber"
          className={`${RENGLON} text-right`}
          onFocus={() => { if (linea.debe) set("debe", ""); }} />
      </div>
      <div className="col-span-1 flex justify-center">
        {canRemove && (
          <button onClick={() => onRemove(idx)} aria-label="Quitar línea" title="Quitar línea"
            className="w-8 h-8 rounded-md flex items-center justify-center text-cuaderno-grafito hover:text-cuaderno-roja hover:bg-cuaderno-rosa/40">
            <IconoCerrar tamano={13} />
          </button>
        )}
      </div>
    </div>
  );
}

function ModalAsiento({ isOpen, onClose, editando, onSave, cuentas, periodoActivo }) {
  const [form, setForm] = useState(ASIENTO_EMPTY);
  const [saving, setSaving] = useState(false);
  React.useEffect(() => {
    setForm(editando
      ? { ...ASIENTO_EMPTY, ...editando, lineas: editando.lineas?.length ? editando.lineas : [{ ...LINEA_EMPTY }, { ...LINEA_EMPTY }] }
      : { ...ASIENTO_EMPTY, fecha: new Date().toISOString().slice(0, 10) }
    );
  }, [editando, isOpen]);
  if (!isOpen) return null;

  const totalDebe = form.lineas.reduce((s, l) => s + (parseFloat(l.debe) || 0), 0);
  const totalHaber = form.lineas.reduce((s, l) => s + (parseFloat(l.haber) || 0), 0);
  const diferencia = Math.abs(totalDebe - totalHaber);
  const cuadrado = diferencia < 0.01 && totalDebe > 0;

  const setLinea = (idx, val) => setForm(f => ({ ...f, lineas: f.lineas.map((l, i) => i === idx ? val : l) }));
  const addLinea = () => setForm(f => ({ ...f, lineas: [...f.lineas, { ...LINEA_EMPTY }] }));
  const removeLinea = (idx) => setForm(f => ({ ...f, lineas: f.lineas.filter((_, i) => i !== idx) }));

  const handleSubmit = async () => {
    if (!cuadrado || !form.glosa) return;
    setSaving(true);
    const lineasValidas = form.lineas.filter(l => l.cuentaId && (parseFloat(l.debe) || parseFloat(l.haber)));
    const [anio, mes] = form.fecha.split("-");
    await onSave({
      ...form,
      lineas: lineasValidas,
      periodo: `${anio}-${mes}`,
      totalDebe,
    });
    setSaving(false);
    onClose();
  };

  return (
    <ModalCuaderno
      titulo={editando ? "Editar asiento" : "Nuevo asiento"}
      subtitulo="Libro Diario"
      onClose={onClose}
      ancho="max-w-3xl"
      cerrarAlClicFuera={false}
      bloqueado={saving}
      pie={
        <div className="flex items-center gap-3">
          <Boton variante="texto" onClick={onClose}>Cancelar</Boton>
          <div className="flex-1" />
          <Boton variante="primario" onClick={handleSubmit} disabled={saving || !cuadrado || !form.glosa}>
            {saving ? "Guardando…" : (editando ? "Guardar cambios" : "Registrar asiento")}
          </Boton>
        </div>
      }
    >
      {/* Cabecera del asiento */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <Campo etiqueta={<span>Fecha <span className="text-cuaderno-roja">*</span></span>} type="date"
          value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} />
        <Campo as="select" etiqueta="Tipo" value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))}>
          <option value="manual">Manual</option>
          <option value="ajuste">Ajuste</option>
          <option value="apertura">Apertura</option>
          <option value="cierre">Cierre</option>
          <option value="depreciacion">Depreciación</option>
          <option value="iva">IVA</option>
        </Campo>
        <Campo className="col-span-2 sm:col-span-1" etiqueta={<span>Glosa <span className="text-cuaderno-roja">*</span></span>}
          value={form.glosa} onChange={e => setForm(f => ({ ...f, glosa: e.target.value }))} placeholder="Descripción del asiento..." />
      </div>

      {/* Líneas */}
      <div>
        <div className="grid grid-cols-12 gap-3 pb-1.5 shadow-[inset_0_-1.5px_0_rgb(var(--cuaderno-tinta))]">
          <div className="col-span-5 text-[15px] text-cuaderno-grafito">Cuenta / Detalle</div>
          <div className="col-span-3 text-[15px] text-cuaderno-grafito text-right">Debe</div>
          <div className="col-span-3 text-[15px] text-cuaderno-grafito text-right">Haber</div>
          <div className="col-span-1" />
        </div>
        <div>
          {form.lineas.map((linea, idx) => (
            <LineaAsiento key={idx} linea={linea} idx={idx} cuentas={cuentas}
              onChange={setLinea} onRemove={removeLinea} canRemove={form.lineas.length > 2} />
          ))}
        </div>
        {/* Totales */}
        <div className="grid grid-cols-12 gap-3 pt-3 items-end">
          <div className="col-span-5">
            <Boton variante="texto" className="min-h-[36px] text-[16px]" onClick={addLinea}>
              <IconoMas tamano={13} /> Agregar línea
            </Boton>
          </div>
          <div className="col-span-3 text-right">
            <p className="m-0 text-[13px] text-cuaderno-grafito">Total Debe</p>
            <span className="text-[17px]"><Cifra valor={totalDebe} escala="pesos" vacio="$0" raya="total" /></span>
          </div>
          <div className="col-span-3 text-right">
            <p className="m-0 text-[13px] text-cuaderno-grafito">Total Haber</p>
            <span className="text-[17px]"><Cifra valor={totalHaber} escala="pesos" vacio="$0" raya="total" /></span>
          </div>
          <div className="col-span-1 flex justify-center pb-1">
            {totalDebe > 0 && (cuadrado
              ? <VistoBueno tamano={18} titulo="Cuadrado" />
              : <IconoCerrar tamano={14} className="text-cuaderno-roja" />)}
          </div>
        </div>
      </div>

      {/* Aviso diferencia */}
      {totalDebe > 0 && !cuadrado && (
        <Nota etiqueta="Ojo:">El asiento no cuadra — diferencia de <Cifra valor={diferencia} escala="pesos" color="heredar" /></Nota>
      )}
    </ModalCuaderno>
  );
}

// ─── Detalle expandido de asiento con reclasificación rápida ─────────────────
function AsientoDetalle({ asiento, onElegir }) {
  const [showReclasif, setShowReclasif] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleReclasificar = async (categ) => {
    setSaving(true);
    await onElegir(asiento, categ);
    setSaving(false);
    setShowReclasif(false);
  };

  const { debe: sumaDebe, haber: sumaHaber, descuadrado } = cuadraturaAsiento(asiento);

  return (
    <div className="px-4 sm:px-8 pt-1 pb-4">
      {/* Tabla de líneas */}
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-cuaderno-columna">
            <th className="font-normal text-[14px] text-cuaderno-grafito text-left py-1.5 pr-2">Cuenta</th>
            <th className="font-normal text-[14px] text-cuaderno-grafito text-left py-1.5 hidden sm:table-cell">Detalle</th>
            <th className="font-normal text-[14px] text-cuaderno-grafito text-right py-1.5 px-2">Debe</th>
            <th className="font-normal text-[14px] text-cuaderno-grafito text-right py-1.5">Haber</th>
          </tr>
        </thead>
        <tbody>
          {(asiento.lineas || []).map((l, i) => (
            <tr key={i} className="border-b border-cuaderno-renglon">
              <td className="py-1.5 pr-2 text-[15px]">{l.cuentaNombre || l.cuentaId}</td>
              <td className="py-1.5 hidden sm:table-cell text-[14px] text-cuaderno-grafito">{sinIcono(l.descripcion)}</td>
              <td className="py-1.5 px-2 text-right text-[15px]">
                {parseFloat(l.debe) > 0 && <Cifra valor={parseFloat(l.debe)} escala="pesos" />}
              </td>
              <td className="py-1.5 text-right text-[15px]">
                {parseFloat(l.haber) > 0 && <Cifra valor={parseFloat(l.haber)} escala="pesos" />}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={2} className="py-2 text-[15px]">
              <span className="hidden sm:inline">Totales</span>
            </td>
            <td className="py-2 px-2 text-right text-[15px]"><Cifra valor={sumaDebe} escala="pesos" vacio="$0" raya="total" /></td>
            <td className="py-2 text-right text-[15px]"><Cifra valor={sumaHaber} escala="pesos" vacio="$0" raya="total" /></td>
          </tr>
        </tfoot>
      </table>

      {descuadrado && (
        <Nota etiqueta="Ojo:" className="mt-2">
          este asiento no cuadra: el debe y el haber difieren en <Cifra valor={Math.abs(sumaDebe - sumaHaber)} escala="pesos" color="heredar" />.
        </Nota>
      )}

      {/* Reclasificar (solo asientos automáticos) */}
      {asiento.tipo === "automatico" && (
        <div className="mt-3 pt-2 border-t border-cuaderno-renglon">
          <Boton variante="texto" className="min-h-[36px] text-[15px]" onClick={() => setShowReclasif(!showReclasif)}>
            {showReclasif ? "Cancelar" : "Reclasificar cuenta de gasto"}
          </Boton>

          {showReclasif && (
            <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              {CATEGORIAS_RAPIDAS.map(cat => (
                <button
                  key={cat.label}
                  onClick={() => handleReclasificar(cat)}
                  disabled={saving}
                  className="min-h-[36px] px-2 rounded-md border-[1.5px] border-cuaderno-columna/70 text-left text-[14px] leading-tight text-cuaderno-grafito hover:border-cuaderno-tinta/60 hover:text-cuaderno-tinta hover:bg-cuaderno-hoja disabled:opacity-50"
                >
                  {cat.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Etiqueta del tipo de asiento ─────────────────────────────────────────────
const TIPO_RESALTADO = {
  ajuste: "lavanda",
  apertura: "menta",
  depreciacion: "durazno",
  iva: "lavanda",
};

function EtiquetaTipo({ tipo }) {
  const texto = tipo || "manual";
  const color = TIPO_RESALTADO[texto];
  return color
    ? <Resaltado color={color} className="text-[13px]">{texto}</Resaltado>
    : <span className="text-[13px] text-cuaderno-grafito">{texto}</span>;
}

// Detecta si un asiento es una Nota de Crédito por su glosa
const esNotaCredito = (a) => a.glosa?.startsWith("NC —") || a.glosa?.startsWith("NCE —") || (a.origen === "iconstruye" && a.glosa?.startsWith("NC"));
const esVenta = (a) => a.origen === "rcv_venta" && !esNotaCredito(a);

// ─── Chip de categoría de gasto editable en la lista ──────────────────────────
// Tipos de cuenta que representan gasto/costo (lado resultado-deudor)
const TIPOS_GASTO = ["costo", "gasto_adm", "gasto_fin", "otro_resultado"];

// Mapeo categoría → tipo de cuenta (mismo que usa la reclasificación al expandir)
const TIPO_POR_CATEGORIA = {
  "Gastos Financieros": "gasto_fin",
  "Subcontratos": "costo", "Materiales y Repuestos": "costo",
  "Combustible (Ley 18.502)": "costo", "Combustible/Lubricantes": "costo",
  "Mantención Vehículos": "costo",
};

// Línea de gasto del asiento: debe > 0 y que no sea IVA ni impuesto
function getLineaGasto(asiento) {
  return (asiento.lineas || [])
    .map((l, i) => ({ ...l, _idx: i }))
    .filter(l => parseFloat(l.debe) > 0 && !/(iva|impuesto)/i.test(l.cuentaNombre || ""))
    .sort((a, b) => parseFloat(b.debe) - parseFloat(a.debe))[0] || null;
}

// Detecta la categoría actual a partir del detalle de la línea de gasto
function categoriaDeLinea(linea) {
  const d = linea?.descripcion || "";
  return CATEGORIAS_RAPIDAS.find(c => d.includes(c.label)) || null;
}

// Cuenta preferida por categoría (códigos del Plan de Cuentas, en orden de preferencia).
// Si ninguna existe, cae al primer cuenta del tipo correspondiente.
const CUENTA_POR_CATEGORIA = {
  "Combustible (Ley 18.502)": ["5-01-004"],                 // Combustible y Lubricantes
  "Subcontratos": ["5-01-002"],                 // Subcontratos
  "Materiales y Repuestos": ["5-01-003"],                 // Materiales y Suministros
  "Transporte y Pasajes": ["6-01-006", "5-01-007"],     // Pasajes y Traslados / Fletes
  "Telecomunicaciones": ["6-01-005"],                 // Telecomunicaciones
  "Seguridad": ["5-01-009", "6-01-011"],     // Seguridad Industrial / Oficina
  "Servicios Profesionales": ["6-01-002"],                 // Honorarios Profesionales
  "Peajes y Movilización": ["6-01-007"],                 // Peajes y Movilización
  "Arriendos": ["5-01-006", "6-01-003"],     // Arriendo Maquinaria y Equipos / Arriendos Oficina
  "Gastos Financieros": ["6-02-003", "6-01-017"],     // Comisiones / Gastos Bancarios
  "Gastos Generales": ["6-01-019"],                 // Gastos Varios Administración
  "Gastos Varios": ["6-01-019"],
};

// Patrones de nombre por categoría (fallback cuando el código no coincide por migración de plan)
const NOMBRE_POR_CATEGORIA = {
  "Combustible (Ley 18.502)": /combustible|lubricante/i,
  "Subcontratos": /subcontrato/i,
  "Materiales y Repuestos": /materiales|suministro/i,
  "Transporte y Pasajes": /pasaje|traslado|flete|transporte/i,
  "Telecomunicaciones": /telecomunicacion/i,
  "Seguridad": /seguridad/i,
  "Servicios Profesionales": /honorario|profesional/i,
  "Peajes y Movilización": /peaje|movilización|movilizacion/i,
  "Arriendos": /arriendo/i,
  "Gastos Financieros": /comision|bancari|financier/i,
  "Gastos Generales": /gastos.*varios|gastos.*general/i,
  "Gastos Varios": /gastos.*varios|gastos.*general/i,
};

// Resuelve la cuenta destino de una categoría: primero por código preferido, luego por nombre, luego por tipo
function cuentaDeCategoria(categ, cuentas) {
  const activas = cuentas.filter(c => c.activa !== false);
  const codigos = CUENTA_POR_CATEGORIA[categ.label] || [];
  // 1. Buscar por código preferido
  for (const cod of codigos) {
    const c = activas.find(x => x.codigo === cod && TIPOS_GASTO.includes(x.tipo));
    if (c) return c;
  }
  // 2. Fallback: buscar por nombre (robusto ante planes con códigos renombrados)
  const patron = NOMBRE_POR_CATEGORIA[categ.label];
  if (patron) {
    const c = activas.find(x => TIPOS_GASTO.includes(x.tipo) && patron.test(x.nombre));
    if (c) return c;
  }
  // 3. Fallback por tipo de cuenta
  const tipoTarget = TIPO_POR_CATEGORIA[categ.label] || "gasto_adm";
  return activas.find(c => c.tipo === tipoTarget && TIPOS_GASTO.includes(c.tipo))
    || activas.find(c => c.tipo === "gasto_adm")
    || null;
}

// Extrae proveedor (rut + razón social) de un asiento importado, sin depender de campos _*
function infoProveedor(asiento) {
  // RUT desde el importHash: "periodo|RUT|folios"
  let rut = (asiento.importHash || "").split("|")[1] || "";
  rut = rut.replace(/^NCE?-/, ""); // por si fuera nota de crédito
  // Fallback: RUT en el detalle de la línea de contrapartida ("... · RUT 12345-6")
  if (!rut) {
    for (const l of asiento.lineas || []) {
      const m = (l.descripcion || "").match(/RUT\s*([0-9.\-kK]+)/);
      if (m) { rut = m[1]; break; }
    }
  }
  // Razón social: lo que va antes del primer " · " en la glosa, sin prefijos NC
  let razonSocial = (asiento.glosa || "").split(" · ")[0].replace(/^NCE?\s*—\s*/, "").trim();
  return { rut, razonSocial };
}

// Aplica una categoría al asiento (función pura, reutilizada por el chip y el detalle)
function aplicarCategoria(asiento, categ, cuentas) {
  const lineaGasto = (asiento.lineas || []).find(l =>
    parseFloat(l.debe) > 0 && !/(iva|impuesto)/i.test(l.cuentaNombre || ""));
  if (!lineaGasto) return null;

  const nuevaCuenta = cuentaDeCategoria(categ, cuentas);
  if (!nuevaCuenta) return null;

  const nuevasLineas = (asiento.lineas || []).map(l =>
    (parseFloat(l.debe) > 0 && !/(iva|impuesto)/i.test(l.cuentaNombre || ""))
      ? {
        ...l, cuentaId: nuevaCuenta.id, cuentaNombre: nuevaCuenta.nombre,
        descripcion: `${categ.icon} ${categ.label} — reclasificado`
      }
      : l
  );
  return {
    ...asiento,
    lineas: nuevasLineas,
    totalDebe: nuevasLineas.reduce((s, l) => s + (parseFloat(l.debe) || 0), 0),
  };
}

function CuentaGastoChip({ asiento, onElegir }) {
  const [abierto, setAbierto] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const lineaGasto = useMemo(() => getLineaGasto(asiento), [asiento]);

  if (!lineaGasto) return null; // ventas/NC u otros asientos sin línea de gasto

  const catActual = categoriaDeLinea(lineaGasto);
  const label = catActual ? catActual.label : (lineaGasto.cuentaNombre || "Sin categoría");

  const elegir = async (cat) => {
    setGuardando(true);
    await onElegir(asiento, cat);
    setGuardando(false);
    setAbierto(false);
  };

  return (
    <span className="relative inline-flex">
      <button
        onClick={e => { e.stopPropagation(); setAbierto(o => !o); }}
        title="Clic para cambiar la categoría de gasto"
        aria-expanded={abierto}
        className="inline-flex items-center gap-1 min-h-[28px] max-w-[260px] text-[14px] text-cuaderno-tinta rounded-sm hover:bg-cuaderno-hoja"
      >
        <Resaltado color="lavanda" className="truncate">{label}</Resaltado>
        {guardando
          ? <span className="text-[12px] text-cuaderno-grafito flex-shrink-0">…</span>
          : <IconoBajar tamano={11} className={`text-cuaderno-grafito transition-transform ${abierto ? "rotate-180" : ""}`} />}
      </button>

      {abierto && (
        <>
          {/* Capa para cerrar al hacer clic fuera */}
          <button
            onClick={e => { e.stopPropagation(); setAbierto(false); }}
            className="fixed inset-0 z-40 cursor-default"
            aria-label="Cerrar"
          />
          <div
            onClick={e => e.stopPropagation()}
            className="cuaderno absolute left-0 top-full mt-1 z-50 w-[300px] sm:w-[380px] bg-cuaderno-tarjeta border border-cuaderno-columna rounded-md shadow-[0_16px_32px_-16px_rgb(var(--cuaderno-tinta)/0.45)] p-3"
          >
            <p className="m-0 pb-2 text-[14px] text-cuaderno-grafito">Categoría de gasto</p>
            <div className="grid grid-cols-2 gap-1.5">
              {CATEGORIAS_RAPIDAS.map(cat => {
                const sel = catActual?.label === cat.label;
                return (
                  <button
                    key={cat.label}
                    disabled={guardando}
                    onClick={e => { e.stopPropagation(); elegir(cat); }}
                    aria-pressed={sel}
                    className={`min-h-[36px] px-2 rounded-md border-[1.5px] text-left text-[14px] leading-tight disabled:opacity-50 ${sel
                      ? "border-cuaderno-tinta bg-cuaderno-hoja text-cuaderno-tinta"
                      : "border-cuaderno-columna/70 text-cuaderno-grafito hover:border-cuaderno-tinta/60 hover:text-cuaderno-tinta"}`}
                  >
                    {sel ? <Resaltado color="lavanda">{cat.label}</Resaltado> : cat.label}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </span>
  );
}

// ─── Helpers honorarios ───────────────────────────────────────────────────────
function excelDateToISO(serial) {
  if (!serial || isNaN(serial)) return new Date().toISOString().slice(0, 10);
  return new Date(Math.floor(serial - 25569) * 86400 * 1000).toISOString().slice(0, 10);
}

// ─── Modal Importar Honorarios SII ───────────────────────────────────────────
function ModalImportarHonorarios({ isOpen, onClose, cuentas, onSave, periodoActivo }) {
  const fileRef = useRef(null);
  const [filas, setFilas] = useState([]);
  const [modo, setModo] = useState("consolidado");
  const [paso, setPaso] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [ctaHonorarios, setCtaHonorarios] = useState("");
  const [ctaRetencion, setCtaRetencion] = useState("");
  const [ctaLiquido, setCtaLiquido] = useState("");

  // Pre-seleccionar cuentas: primero por código fijo, luego por nombre como fallback
  React.useEffect(() => {
    if (!cuentas.length || !isOpen) return;
    const porCodigo = (cod) => cuentas.find(c => c.codigo === cod);
    // Busca por nombre restringiendo el tipo para evitar falsos matches
    const porNombreGasto = (terminos) => cuentas.find(c =>
      ["gasto_adm", "costo", "otro_resultado"].includes(c.tipo) &&
      terminos.some(t => c.nombre?.toLowerCase().includes(t.toLowerCase()))
    );
    const porNombrePasivo = (terminos) => cuentas.find(c =>
      ["pasivo_corriente", "pasivo_no_corriente"].includes(c.tipo) &&
      terminos.some(t => c.nombre?.toLowerCase().includes(t.toLowerCase()))
    );
    // DEBE: cuenta de gasto de honorarios
    const hon = porCodigo("6-01-004") || porNombreGasto(["honorario"]);
    // HABER retención: pasivo retención
    const ret = porCodigo("2-01-004") || porNombrePasivo(["retenci"]);
    // HABER líquido: pasivo honorarios líquidos
    const liq = porCodigo("2-01-005") || porNombrePasivo(["líquido", "liquido", "honorario"]);
    if (hon) setCtaHonorarios(v => v || hon.id);
    if (ret) setCtaRetencion(v => v || ret.id);
    if (liq) setCtaLiquido(v => v || liq.id);
  }, [cuentas, isOpen]);

  const resetear = useCallback(() => {
    setFilas([]); setPaso(1); setError(""); setSaving(false);
    if (fileRef.current) fileRef.current.value = "";
  }, []);

  // ¿Las 3 cuentas necesarias ya están resueltas automáticamente?
  // Si es así, no hace falta mostrar el paso 3 — se importa directo.
  const cuentasAutoResueltas = (hon, ret, liq) => {
    // hon y liq son obligatorias; ret es opcional (si no hay retención en el archivo)
    return !!(hon && liq);
  };

  // return null DESPUÉS de todos los hooks
  if (!isOpen) return null;

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target.result, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
        let headerIdx = -1;
        for (let i = 0; i < raw.length; i++) {
          if (raw[i].some(c => String(c).toLowerCase().includes("bruto"))) { headerIdx = i; break; }
        }
        if (headerIdx === -1) { setError("No se encontró la fila de encabezados (columna 'Brutos')."); return; }
        const headers = raw[headerIdx].map(h => String(h).trim().toLowerCase());
        const iCol = (name) => headers.findIndex(h => h.includes(name.toLowerCase()));
        const iN = iCol("n°"), iEst = iCol("estado"), iFecha = iCol("fecha");
        const iRut = iCol("rut"), iNombre = iCol("nombre");
        const iBruto = iCol("bruto"), iRet = iCol("retenido"), iPagado = iCol("pagado");
        if (iBruto === -1) { setError("Columna 'Brutos' no encontrada."); return; }
        const registros = [];
        for (let i = headerIdx + 1; i < raw.length; i++) {
          const row = raw[i];
          const bruto = parseFloat(row[iBruto] || 0);
          if (!bruto) continue;
          if (String(row[iEst] || "").toUpperCase() === "ANU") continue;
          registros.push({
            n: String(row[iN] || "").trim(),
            estado: String(row[iEst] || "").toUpperCase(),
            fecha: typeof row[iFecha] === "number" ? excelDateToISO(row[iFecha]) : String(row[iFecha] || "").trim(),
            rut: String(row[iRut] || "").trim(),
            nombre: String(row[iNombre] || "").trim(),
            bruto: Math.round(bruto),
            retenido: Math.round(parseFloat(row[iRet] || 0)),
            pagado: Math.round(parseFloat(row[iPagado] || 0)),
          });
        }
        if (!registros.length) { setError("No se encontraron boletas vigentes en el archivo."); return; }
        setFilas(registros);
        setPaso(2);
      } catch (err) { setError("Error leyendo el archivo: " + err.message); }
    };
    reader.readAsArrayBuffer(file);
  };

  const totales = filas.reduce(
    (acc, f) => ({ bruto: acc.bruto + f.bruto, retenido: acc.retenido + f.retenido, pagado: acc.pagado + f.pagado }),
    { bruto: 0, retenido: 0, pagado: 0 }
  );

  const buildAsientos = () => {
    const ctaHonNombre = cuentas.find(c => c.id === ctaHonorarios)?.nombre || "Honorarios";
    const ctaRetNombre = cuentas.find(c => c.id === ctaRetencion)?.nombre || "Retención Honorarios x Pagar";
    const ctaLiqNombre = cuentas.find(c => c.id === ctaLiquido)?.nombre || "Honorarios Líquidos x Pagar";
    if (modo === "consolidado") {
      const fechaAsiento = filas[filas.length - 1]?.fecha || new Date().toISOString().slice(0, 10);
      const [anio, mes] = fechaAsiento.split("-");
      const lineas = [{ cuentaId: ctaHonorarios, cuentaNombre: ctaHonNombre, debe: totales.bruto, haber: "", descripcion: `Honorarios ${filas.length} prestadores` }];
      if (totales.retenido > 0) lineas.push({ cuentaId: ctaRetencion, cuentaNombre: ctaRetNombre, debe: "", haber: totales.retenido, descripcion: "Retención 10.75% SII" });
      lineas.push({ cuentaId: ctaLiquido, cuentaNombre: ctaLiqNombre, debe: "", haber: totales.pagado, descripcion: "Honorarios líquidos por pagar" });
      return [{ fecha: fechaAsiento, glosa: `Honorarios recibidos — ${mes}/${anio} (${filas.length} boletas)`, tipo: "honorarios", periodo: `${anio}-${mes}`, totalDebe: totales.bruto, origen: "importacion_honorarios", lineas }];
    } else {
      return filas.map(f => {
        const [anio, mes] = f.fecha.split("-");
        const lineas = [{ cuentaId: ctaHonorarios, cuentaNombre: ctaHonNombre, debe: f.bruto, haber: "", descripcion: `Boleta N°${f.n} — ${f.nombre}` }];
        if (f.retenido > 0) lineas.push({ cuentaId: ctaRetencion, cuentaNombre: ctaRetNombre, debe: "", haber: f.retenido, descripcion: `Retención ${f.rut}` });
        lineas.push({ cuentaId: ctaLiquido, cuentaNombre: ctaLiqNombre, debe: "", haber: f.pagado, descripcion: `Líquido ${f.nombre.split(" ")[0]}` });
        return { fecha: f.fecha, glosa: `Honorarios — ${f.nombre} (${f.rut})`, tipo: "honorarios", periodo: `${anio}-${mes}`, totalDebe: f.bruto, origen: "importacion_honorarios", lineas };
      });
    }
  };

  const handleImportar = async () => {
    if (!ctaHonorarios || !ctaLiquido) { setError("Debes seleccionar la cuenta de Honorarios y la cuenta de Pago."); return; }
    setSaving(true); setError("");
    try {
      for (const a of buildAsientos()) await onSave(a);
      onClose(); resetear();
    } catch (err) { setError("Error guardando: " + err.message); }
    setSaving(false);
  };

  const cuentasGasto = cuentas.filter(c => c.activa !== false && ["gasto_adm", "costo", "otro_resultado"].includes(c.tipo));
  const cuentasPasivo = cuentas.filter(c => c.activa !== false && ["pasivo_corriente", "pasivo_no_corriente"].includes(c.tipo));
  const cuentasTodas = cuentas.filter(c => c.activa !== false);

  const cerrar = () => { onClose(); resetear(); };
  const textoImportar = saving ? "Guardando…" : `Importar ${modo === "consolidado" ? "1 asiento" : `${filas.length} asientos`}`;

  return (
    <ModalCuaderno
      titulo="Importar Honorarios SII"
      subtitulo={`Boletas recibidas — período ${periodoActivo}`}
      onClose={cerrar}
      ancho="max-w-2xl"
      cerrarAlClicFuera={false}
      bloqueado={saving}
      pie={
        <div className="flex flex-wrap items-center gap-3">
          <Boton variante="texto" onClick={cerrar}>Cancelar</Boton>
          {paso > 1 && <Boton variante="texto" onClick={() => setPaso(p => p - 1)}><IconoAnterior tamano={14} />Atrás</Boton>}
          <div className="flex-1" />
          {paso < 3 && filas.length > 0 && (() => {
            // Si las cuentas ya están auto-resueltas, desde el paso 2 se importa directo
            const autoOk = cuentasAutoResueltas(ctaHonorarios, ctaRetencion, ctaLiquido);
            if (paso === 2 && autoOk) {
              return <Boton variante="primario" onClick={handleImportar} disabled={saving}>{textoImportar}</Boton>;
            }
            return (
              <Boton variante="primario" onClick={() => setPaso(p => p + 1)}>
                Siguiente<IconoSiguiente tamano={14} />
              </Boton>
            );
          })()}
          {paso === 3 && <Boton variante="primario" onClick={handleImportar} disabled={saving}>{textoImportar}</Boton>}
        </div>
      }
    >
      {/* Pasos */}
      <ol className="m-0 p-0 list-none flex flex-wrap gap-x-6 gap-y-1 border-b border-cuaderno-azul -mt-1">
        {[{ n: 1, label: "Cargar archivo" }, { n: 2, label: "Revisar datos" }, { n: 3, label: "Mapear cuentas" }].map(s => (
          <li key={s.n} aria-current={paso === s.n ? "step" : undefined}
            className={`min-h-[36px] -mb-px flex items-center gap-1.5 border-b-2 text-[16px] ${paso === s.n ? "border-cuaderno-tinta text-cuaderno-tinta" : "border-transparent text-cuaderno-grafito"}`}>
            {paso > s.n ? <VistoBueno tamano={13} titulo="Listo" /> : <span>{s.n}.</span>}
            {s.label}
          </li>
        ))}
      </ol>

      {/* Paso 1 */}
      {paso === 1 && (
        <div className="space-y-4">
          <div className="space-y-1">
            <p className="m-0 text-[17px]">¿Cómo obtener el archivo?</p>
            <ol className="m-0 pl-5 list-decimal space-y-0.5 text-[16px] text-cuaderno-grafito">
              <li>SII → Mi SII → Servicios online</li>
              <li>Boletas de Honorarios Electrónicas → Honorarios Recibidos</li>
              <li>Selecciona el período y descarga el Excel (.xlsx)</li>
            </ol>
          </div>
          <label className="flex flex-col items-center gap-2 p-8 rounded-md border-[1.5px] border-dashed border-cuaderno-columna hover:border-cuaderno-tinta hover:bg-cuaderno-papel cursor-pointer text-center">
            <IconoSubir tamano={22} className="text-cuaderno-grafito" />
            <span className="text-[18px] text-cuaderno-tinta underline decoration-cuaderno-columna underline-offset-4">Seleccionar archivo Excel</span>
            <span className="text-[14px] text-cuaderno-grafito">Archivo .xlsx de Honorarios Recibidos del SII</span>
            <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleFile} className="sr-only" />
          </label>
          {error && <Nota etiqueta="Ojo:">{error}</Nota>}
        </div>
      )}

      {/* Paso 2 */}
      {paso === 2 && (
        <div className="space-y-4">
          <div className="grid gap-x-8 sm:grid-cols-3">
            <LineaGuia etiqueta="Boletas">{filas.length}</LineaGuia>
            <LineaGuia etiqueta="Total bruto"><Cifra valor={totales.bruto} escala="pesos" vacio="$0" /></LineaGuia>
            <LineaGuia etiqueta="Retención"><Cifra valor={totales.retenido} escala="pesos" vacio="$0" /></LineaGuia>
          </div>
          <div className="max-h-56 overflow-y-auto border border-cuaderno-renglon rounded-md">
            <table className="w-full border-collapse">
              <thead className="sticky top-0 bg-cuaderno-tarjeta">
                <tr className="shadow-[inset_0_-1.5px_0_rgb(var(--cuaderno-tinta))]">
                  <th className="font-normal text-[15px] text-cuaderno-grafito text-left px-2 py-2">Nombre</th>
                  <th className="font-normal text-[15px] text-cuaderno-grafito text-left px-2 py-2">Fecha</th>
                  <th className="font-normal text-[15px] text-cuaderno-grafito text-right px-2 py-2">Bruto</th>
                  <th className="font-normal text-[15px] text-cuaderno-grafito text-right px-2 py-2">Retención</th>
                  <th className="font-normal text-[15px] text-cuaderno-grafito text-right px-2 py-2">Líquido</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f, i) => (
                  <tr key={i} className="border-b border-cuaderno-renglon">
                    <td className="px-2 py-1.5">
                      <p className="m-0 text-[16px] leading-tight truncate max-w-32">{f.nombre}</p>
                      <p className="m-0 text-[13px] text-cuaderno-grafito">{f.rut}</p>
                    </td>
                    <td className="px-2 py-1.5 text-[15px] text-cuaderno-grafito whitespace-nowrap">{f.fecha}</td>
                    <td className="px-2 py-1.5 text-right text-[16px]"><Cifra valor={f.bruto} escala="pesos" vacio="0" /></td>
                    <td className="px-2 py-1.5 text-right text-[16px]">{f.retenido > 0 ? <Cifra valor={f.retenido} escala="pesos" /> : <span className="text-cuaderno-grafito">—</span>}</td>
                    <td className="px-2 py-1.5 text-right text-[16px]"><Cifra valor={f.pagado} escala="pesos" vacio="0" /></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={2} className="px-2 py-2 text-[16px]">Totales ({filas.length} boletas)</td>
                  <td className="px-2 py-2 text-right text-[16px]"><Cifra valor={totales.bruto} escala="pesos" vacio="$0" raya="total" /></td>
                  <td className="px-2 py-2 text-right text-[16px]"><Cifra valor={totales.retenido} escala="pesos" vacio="$0" raya="total" /></td>
                  <td className="px-2 py-2 text-right text-[16px]"><Cifra valor={totales.pagado} escala="pesos" vacio="$0" raya="total" /></td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div>
            <Segmentado
              etiqueta="¿Cómo registrar los asientos?"
              opciones={[{ id: "consolidado", label: "Consolidado" }, { id: "detallado", label: "Detallado" }]}
              valor={modo}
              onCambiar={setModo}
            />
            <p className="m-0 mt-1.5 text-[14px] text-cuaderno-grafito">
              {modo === "consolidado" ? "1 asiento con el total del mes" : "1 asiento por cada prestador"}
            </p>
          </div>
          {error && <Nota etiqueta="Ojo:">{error}</Nota>}
        </div>
      )}

      {/* Paso 3 */}
      {paso === 3 && (
        <div className="space-y-4">
          <Nota etiqueta="Asiento:" tono="grafito">Debe Honorarios (bruto) / Haber Retención x Pagar + Líquido x Pagar.</Nota>
          {[
            { label: "Cuenta Honorarios (gasto) *", hint: "Gasto bruto — DEBE", val: ctaHonorarios, set: setCtaHonorarios, lista: cuentasGasto },
            ...(totales.retenido > 0 ? [{ label: "Retención Honorarios x Pagar", hint: "Pasivo retención 10.75% — HABER", val: ctaRetencion, set: setCtaRetencion, lista: cuentasPasivo }] : []),
            { label: "Honorarios Líquidos x Pagar *", hint: "Monto pagado — HABER", val: ctaLiquido, set: setCtaLiquido, lista: cuentasTodas },
          ].map(f => (
            <Campo key={f.label} as="select" etiqueta={f.label} ayuda={f.hint} value={f.val} onChange={e => f.set(e.target.value)}>
              <option value="">— Seleccionar cuenta —</option>
              {f.lista.map(c => <option key={c.id} value={c.id}>{c.codigo} — {c.nombre}</option>)}
            </Campo>
          ))}
          {error && <Nota etiqueta="Ojo:">{error}</Nota>}
        </div>
      )}
    </ModalCuaderno>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function ContabilidadLibroDiario() {
  const { asientos, cuentas, loadingAsientos, guardarAsiento, eliminarAsiento, reversarAsiento, periodoActivo, setPeriodoActivo, buscarHashesExistentes, reglasGasto: _reglasGasto, guardarReglaGasto, reglasEfectivas } = useContabilidad();
  const reglasGasto = _reglasGasto || {};
  // Para clasificar al importar se usan las reglas efectivas: lo que el usuario
  // decidió a mano, complementado con la cuenta que más usó con cada proveedor.
  const reglasParaImportar = useMemo(() => reglasEfectivas(), [reglasEfectivas]);
  const [showModal, setShowModal] = useState(false);
  const [editando, setEditando] = useState(null);
  const [expandido, setExpandido] = useState(null);
  const [busqueda, setBusqueda] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("todos");
  const [ordenCampo, setOrdenCampo] = useState("fecha");   // fecha|glosa|monto|tipo
  const [ordenDir, setOrdenDir] = useState("desc");    // asc|desc
  const [deletingId, setDeletingId] = useState(null);
  const [showImport, setShowImport] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showHonModal, setShowHonModal] = useState(false);
  const [showImportMenu, setShowImportMenu] = useState(false);
  const importMenuRef = useRef(null);

  // Cerrar el dropdown al hacer click fuera del contenedor
  React.useEffect(() => {
    if (!showImportMenu) return;
    const handler = (e) => {
      if (importMenuRef.current && !importMenuRef.current.contains(e.target)) {
        setShowImportMenu(false);
      }
    };
    // setTimeout para no capturar el mismo click que abrió el menú
    const t = setTimeout(() => document.addEventListener("mousedown", handler), 0);
    return () => { clearTimeout(t); document.removeEventListener("mousedown", handler); };
  }, [showImportMenu]);
  const [autoClasif, setAutoClasif] = useState(null);      // {procesando, total, hechos} | null

  // Rol del usuario y selección masiva
  const [userRole, setUserRole] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [asientosSeleccionados, setAsientosSeleccionados] = useState([]);
  const [isDeletingBulk, setIsDeletingBulk] = useState(false);

  // Obtener rol del usuario
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setCurrentUser(user);
        try {
          const userDocRef = doc(db, 'users', user.uid);
          const userDoc = await getDoc(userDocRef);

          if (userDoc.exists()) {
            const userData = userDoc.data();
            setUserRole(userData.role || 'operador');
          } else {
            setUserRole('operador');
          }
        } catch (error) {
          console.error("Error obteniendo rol del usuario:", error);
          setUserRole('operador');
        }
      } else {
        setCurrentUser(null);
        setUserRole(null);
      }
    });

    return () => unsubscribe();
  }, []);

  // Limpiar selección de asientos cuando cambia el período activo
  useEffect(() => {
    setAsientosSeleccionados([]);
  }, [periodoActivo]);

  const isAdmin = userRole === 'superadmin' || userRole === 'admin_contrato';

  // Eliminar múltiples asientos
  const handleEliminarSeleccionados = async () => {
    const count = asientosSeleccionados.length;
    if (count === 0) return;
    if (!window.confirm(`¿Está seguro de que desea eliminar los ${count} asientos contables seleccionados del período? Esta acción no se puede deshacer.`)) {
      return;
    }
    setIsDeletingBulk(true);
    try {
      // Eliminar en paralelo
      await Promise.all(asientosSeleccionados.map(id => eliminarAsiento(id)));
      setAsientosSeleccionados([]);
    } catch (error) {
      console.error("Error al eliminar asientos seleccionados:", error);
      alert("Hubo un error al eliminar algunos de los asientos seleccionados.");
    } finally {
      setIsDeletingBulk(false);
    }
  };

  // Reclasifica un asiento y aprende la regla para ese proveedor (se aplicará a futuros)
  const reclasificarYAprender = async (asiento, cat) => {
    const nuevo = aplicarCategoria(asiento, cat, cuentas);
    if (!nuevo) return;
    await guardarAsiento(nuevo);
    const gl = getLineaGasto(nuevo);
    const { rut, razonSocial } = infoProveedor(nuevo);
    if (rut && gl) {
      await guardarReglaGasto(rut, razonSocial, {
        cuentaId: gl.cuentaId, cuentaNombre: gl.cuentaNombre,
        categoriaLabel: cat.label, categoriaIcon: cat.icon,
      });
    }
  };

  // Guarda un asiento y, si es importado con proveedor conocido, actualiza la regla
  // aprendida si el usuario cambió la cuenta contable manualmente (vía modal de edición).
  const guardarAsientoYAprender = async (data) => {
    await guardarAsiento(data);
    // Solo para asientos automáticos importados con hash de proveedor
    if (data.tipo === "automatico" && data.importHash) {
      const { rut, razonSocial } = infoProveedor(data);
      const gl = getLineaGasto(data);
      if (rut && gl) {
        const rutNorm = normalizaRut(rut);
        const existente = reglasGasto[rutNorm];
        // Si no hay una regla existente, o si existe pero la cuenta cambió, guardamos/actualizamos la regla
        if (!existente || existente.cuentaId !== gl.cuentaId) {
          const catMatch = CATEGORIAS_RAPIDAS.find(c => c.label === existente?.categoriaLabel)
            || CATEGORIAS_RAPIDAS.find(c => c.label === gl.cuentaNombre)
            || { label: gl.cuentaNombre || "Gasto", icon: "🏷" };
          await guardarReglaGasto(rut, razonSocial, {
            cuentaId: gl.cuentaId,
            cuentaNombre: gl.cuentaNombre,
            categoriaLabel: catMatch.label,
            categoriaIcon: catMatch.icon || "🏷",
          });
        }
      }
    }
  };

  // Aplica una regla aprendida directamente a un asiento (sin re-mapear categoría)
  const aplicarReglaAAsiento = (asiento, regla) => {
    const nuevasLineas = (asiento.lineas || []).map(l =>
      (parseFloat(l.debe) > 0 && !/(iva|impuesto)/i.test(l.cuentaNombre || ""))
        ? {
          ...l, cuentaId: regla.cuentaId, cuentaNombre: regla.cuentaNombre,
          descripcion: `${regla.categoriaIcon || "🏷"} ${regla.categoriaLabel} — auto (aprendido)`
        }
        : l
    );
    return {
      ...asiento, lineas: nuevasLineas,
      totalDebe: nuevasLineas.reduce((s, l) => s + (parseFloat(l.debe) || 0), 0)
    };
  };

  // Auto-clasifica los asientos del período aplicando las reglas aprendidas por proveedor
  const autoClasificar = async () => {
    // Candidatos: asientos con línea de gasto y regla conocida que cambie la cuenta actual
    const pendientes = asientos.filter(a => {
      if (esNotaCredito(a) || esVenta(a)) return false;
      const gl = getLineaGasto(a);
      if (!gl) return false;
      const { rut } = infoProveedor(a);
      const regla = reglasGasto[normalizaRut(rut)];
      return regla && regla.cuentaId && regla.cuentaId !== gl.cuentaId;
    });
    if (pendientes.length === 0) {
      setAutoClasif({ procesando: false, total: 0, hechos: 0 });
      setTimeout(() => setAutoClasif(null), 2500);
      return;
    }
    if (!window.confirm(`Se aplicarán reglas aprendidas a ${pendientes.length} asiento(s) del período. ¿Continuar?`)) return;
    setAutoClasif({ procesando: true, total: pendientes.length, hechos: 0 });
    let hechos = 0;
    for (const a of pendientes) {
      const { rut } = infoProveedor(a);
      const regla = reglasGasto[normalizaRut(rut)];
      await guardarAsiento(aplicarReglaAAsiento(a, regla));
      hechos++;
      setAutoClasif({ procesando: true, total: pendientes.length, hechos });
    }
    setAutoClasif({ procesando: false, total: pendientes.length, hechos });
    setTimeout(() => setAutoClasif(null), 3500);
  };

  const esCompra = (a) => a.origen === "iconstruye" && !esNotaCredito(a);

  const toggleOrden = (campo) => {
    if (ordenCampo === campo) setOrdenDir(d => d === "asc" ? "desc" : "asc");
    else { setOrdenCampo(campo); setOrdenDir("asc"); }
  };

  const asientosFiltrados = useMemo(() => {
    let lista = asientos.filter(a => {
      // Filtro por tipo
      if (filtroTipo === "nota_credito") return esNotaCredito(a);
      if (filtroTipo === "venta") return esVenta(a);
      if (filtroTipo === "compra") return esCompra(a);
      if (filtroTipo !== "todos" && a.tipo !== filtroTipo) return false;
      // Búsqueda
      if (busqueda) {
        const b = busqueda.toLowerCase();
        return a.glosa?.toLowerCase().includes(b) ||
          a.lineas?.some(l => l.cuentaNombre?.toLowerCase().includes(b));
      }
      return true;
    });

    // Ordenamiento
    lista = [...lista].sort((a, b) => {
      let va, vb;
      if (ordenCampo === "fecha") { va = a.fecha || ""; vb = b.fecha || ""; }
      else if (ordenCampo === "glosa") { va = a.glosa || ""; vb = b.glosa || ""; }
      else if (ordenCampo === "monto") { va = a.totalDebe || 0; vb = b.totalDebe || 0; }
      else if (ordenCampo === "tipo") { va = a.tipo || ""; vb = b.tipo || ""; }
      else if (ordenCampo === "origen") { va = a.origen || ""; vb = b.origen || ""; }
      else { va = ""; vb = ""; }
      if (va < vb) return ordenDir === "asc" ? -1 : 1;
      if (va > vb) return ordenDir === "asc" ? 1 : -1;
      return 0;
    });

    return lista;
  }, [asientos, filtroTipo, busqueda, ordenCampo, ordenDir]);

  const totales = useMemo(() => ({
    debe: asientosFiltrados.reduce((s, a) => s + (a.totalDebe || 0), 0),
    count: asientosFiltrados.length,
  }), [asientosFiltrados]);

  // Cuántos asientos del período tienen una regla aprendida que cambiaría su cuenta actual
  const nPorClasificar = useMemo(() => asientos.filter(a => {
    if (esNotaCredito(a) || esVenta(a)) return false;
    const gl = getLineaGasto(a);
    if (!gl) return false;
    const regla = reglasGasto[normalizaRut(infoProveedor(a).rut)];
    return regla && regla.cuentaId && regla.cuentaId !== gl.cuentaId;
  }).length, [asientos, reglasGasto]);

  // Reversar es la forma correcta de corregir un libro: el original y su reverso
  // quedan ambos visibles. Eliminar solo se justifica ante un error recién
  // cometido, y desde ahora queda registrado en la bitácora.
  const handleReversar = async (a) => {
    const motivo = window.prompt(
      `Reversar el asiento ${a.numero || ""}\n\n${a.glosa || ""}\n\nMotivo de la corrección:`, "");
    if (motivo === null) return;
    setDeletingId(a.id);
    try { await reversarAsiento(a.id, motivo.trim()); }
    catch (e) { alert(e.message); }
    setDeletingId(null);
  };

  const handleEliminar = async (id) => {
    const a = asientos.find(x => x.id === id);
    if (!window.confirm(
      `¿ELIMINAR definitivamente el asiento ${a?.numero || ""}?\n\n` +
      `En contabilidad lo correcto es reversarlo, no borrarlo: el reverso deja constancia ` +
      `de la corrección y el correlativo no queda con saltos.\n\n` +
      `Elimina solo si acabas de registrarlo por error. Queda registrado en la bitácora.`
    )) return;
    setDeletingId(id);
    try { await eliminarAsiento(id); }
    catch (e) { alert(e.message); }
    setDeletingId(null);
    if (expandido === id) setExpandido(null);
  };

  return (
    <div className="cuaderno px-8 pt-5 pb-10 space-y-5">

      <FechaHoja />

      {/* Header */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Titulo>Libro Diario</Titulo>
          <p className="m-0 text-[17px] text-cuaderno-grafito">Asientos del período</p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <PeriodoSelector />
          {/* Auto-clasificar (aplica reglas aprendidas por proveedor) */}
          <Boton
            variante="secundario"
            onClick={autoClasificar}
            disabled={autoClasif?.procesando}
            title="Aplica las categorías aprendidas a los asientos del período cuyo proveedor ya tiene una regla"
          >
            {autoClasif?.procesando ? (
              <>Clasificando… {autoClasif.hechos}/{autoClasif.total}</>
            ) : autoClasif ? (
              <><VistoBueno tamano={14} titulo="" />{autoClasif.hechos > 0 ? `${autoClasif.hechos} clasificados` : "Sin pendientes"}</>
            ) : (
              <>Auto-clasificar{nPorClasificar > 0 && <Aviso critico={false}>{nPorClasificar}</Aviso>}</>
            )}
          </Boton>
          <Boton variante="secundario" onClick={() => setShowExport(true)}>
            <IconoDocumento tamano={15} /> Exportar PDF
          </Boton>
          {/* Importar — menú unificado */}
          <div className="relative" ref={importMenuRef}>
            <Boton variante="secundario" onClick={() => setShowImportMenu(v => !v)} aria-expanded={showImportMenu}>
              <IconoSubir tamano={15} /> Importar
              <IconoBajar tamano={13} className={`transition-transform ${showImportMenu ? "rotate-180" : ""}`} />
            </Boton>
            {showImportMenu && (
              <div className="absolute right-0 top-full mt-1.5 w-60 z-30 bg-cuaderno-tarjeta border border-cuaderno-columna rounded-md shadow-[0_16px_32px_-16px_rgb(var(--cuaderno-tinta)/0.45)] overflow-hidden">
                <button
                  onClick={() => { setShowImportMenu(false); setShowImport(true); }}
                  className="block w-full px-4 py-2.5 text-left hover:bg-cuaderno-hoja"
                >
                  <span className="block text-[17px] text-cuaderno-tinta">iConstruct / iConstruye</span>
                  <span className="block text-[14px] text-cuaderno-grafito">Compras, ventas, NC</span>
                </button>
                <div className="border-t border-cuaderno-renglon" />
                <button
                  onClick={() => { setShowImportMenu(false); setShowHonModal(true); }}
                  className="block w-full px-4 py-2.5 text-left hover:bg-cuaderno-hoja"
                >
                  <span className="block text-[17px] text-cuaderno-tinta">Honorarios SII</span>
                  <span className="block text-[14px] text-cuaderno-grafito">Boletas recibidas (.xlsx)</span>
                </button>
              </div>
            )}
          </div>
          <Boton variante="primario" onClick={() => { setEditando(null); setShowModal(true); }}>
            <IconoMas tamano={14} /> Nuevo asiento
          </Boton>
        </div>
      </header>

      {/* Resumen */}
      <Hoja titulo="Resumen">
        <div className="grid gap-x-12 sm:grid-cols-3">
          <LineaGuia etiqueta="Asientos">{totales.count}</LineaGuia>
          <LineaGuia etiqueta="Total Debe"><Cifra valor={totales.debe} escala="pesos" vacio="$0" raya="total" /></LineaGuia>
          <LineaGuia etiqueta="Total Haber"><Cifra valor={totales.debe} escala="pesos" vacio="$0" raya="total" /></LineaGuia>
        </div>
      </Hoja>

      {/* Asientos */}
      <Hoja titulo="Asientos"
        extra={
          <>
            <Campo etiqueta="Buscar" type="search" className="w-64"
              value={busqueda} onChange={e => setBusqueda(e.target.value)}
              placeholder="Glosa, proveedor o cuenta" />
            <Campo as="select" etiqueta="Tipo" value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}>
              <option value="todos">Todos los tipos</option>
              <optgroup label="Por origen">
                <option value="compra">Compras (RCV/iConstruct)</option>
                <option value="venta">Ventas (RCV)</option>
                <option value="nota_credito">Notas de Crédito</option>
              </optgroup>
              <optgroup label="Por tipo">
                <option value="honorarios">Honorarios SII</option>
                <option value="automatico">Automático</option>
                <option value="manual">Manual</option>
                <option value="ajuste">Ajuste</option>
                <option value="depreciacion">Depreciación</option>
                <option value="iva">IVA</option>
              </optgroup>
            </Campo>
          </>
        }>

        {/* Ordenamiento + contador */}
        <div className="flex flex-wrap items-end gap-x-4 gap-y-2 pb-3">
          <Segmentado
            etiqueta="Ordenar por"
            opciones={[
              { campo: "fecha", label: "Fecha" },
              { campo: "glosa", label: "Proveedor" },
              { campo: "monto", label: "Monto" },
              { campo: "tipo", label: "Tipo" },
              { campo: "origen", label: "Origen" },
            ].map(({ campo, label }) => ({
              id: campo,
              label: ordenCampo === campo ? `${label} ${ordenDir === "desc" ? "↓" : "↑"}` : label,
            }))}
            valor={ordenCampo}
            onCambiar={toggleOrden}
          />
          <span className="ml-auto text-[15px] text-cuaderno-grafito">
            {asientosFiltrados.length} de {asientos.length} asientos
            {filtroTipo !== "todos" || busqueda ? " · filtrado" : ""}
          </span>
          {(filtroTipo !== "todos" || busqueda) && (
            <Boton variante="texto" className="min-h-[36px] text-[15px]"
              onClick={() => { setFiltroTipo("todos"); setBusqueda(""); }}>
              limpiar filtros
            </Boton>
          )}
        </div>

        {/* Acciones masivas */}
        {isAdmin && !loadingAsientos && asientosFiltrados.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 py-2 border-t border-cuaderno-renglon">
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-[16px] cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={asientosFiltrados.length > 0 && asientosFiltrados.every(a => asientosSeleccionados.includes(a.id))}
                  ref={el => {
                    if (el) {
                      const allSelected = asientosFiltrados.length > 0 && asientosFiltrados.every(a => asientosSeleccionados.includes(a.id));
                      const someSelected = asientosFiltrados.some(a => asientosSeleccionados.includes(a.id));
                      el.indeterminate = someSelected && !allSelected;
                    }
                  }}
                  onChange={(e) => {
                    if (e.target.checked) {
                      const newSelection = Array.from(new Set([...asientosSeleccionados, ...asientosFiltrados.map(a => a.id)]));
                      setAsientosSeleccionados(newSelection);
                    } else {
                      const filteredIds = new Set(asientosFiltrados.map(a => a.id));
                      setAsientosSeleccionados(asientosSeleccionados.filter(id => !filteredIds.has(id)));
                    }
                  }}
                  className={CHECK}
                />
                <span>Seleccionar todo ({asientosFiltrados.length})</span>
              </label>
              {asientosSeleccionados.length > 0 && (
                <Resaltado color="lavanda" className="text-[15px]">{asientosSeleccionados.length} seleccionado(s)</Resaltado>
              )}
            </div>
            {asientosSeleccionados.length > 0 && (
              <Boton variante="texto" className="min-h-[36px] text-[16px] text-cuaderno-roja decoration-cuaderno-roja/50"
                onClick={handleEliminarSeleccionados} disabled={isDeletingBulk}>
                <IconoBorrar tamano={14} />
                {isDeletingBulk ? "Eliminando…" : `Eliminar seleccionados (${asientosSeleccionados.length})`}
              </Boton>
            )}
          </div>
        )}

        {/* Lista de asientos */}
        {loadingAsientos ? (
          <p className="m-0 py-12 text-center text-[18px] text-cuaderno-grafito">Buscando los asientos…</p>
        ) : asientosFiltrados.length === 0 ? (
          <div className="py-12 text-center space-y-2">
            <p className="m-0 font-ligada font-light text-[22px] leading-[1.6]">Sin asientos en este período</p>
            <p className="m-0 text-[16px] text-cuaderno-grafito">Registra el primer asiento contable</p>
          </div>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr className="shadow-[inset_0_-1.5px_0_rgb(var(--cuaderno-tinta))]">
                {isAdmin && <th className="w-8"><span className="sr-only">Seleccionar</span></th>}
                <th className="font-normal text-[15px] text-cuaderno-grafito text-left px-2 py-2 whitespace-nowrap hidden md:table-cell">N°</th>
                <th className="font-normal text-[15px] text-cuaderno-grafito text-left px-2 py-2 whitespace-nowrap hidden sm:table-cell">Fecha</th>
                <th className="font-normal text-[15px] text-cuaderno-grafito text-left px-2 py-2">Glosa</th>
                <th className="font-normal text-[15px] text-cuaderno-grafito text-right px-2 py-2">Debe</th>
                <th className="font-normal text-[15px] text-cuaderno-grafito text-right px-2 py-2 hidden sm:table-cell">Haber</th>
                <th className="w-32"><span className="sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody>
              {asientosFiltrados.map((a) => {
                const { debe: sumaDebe, haber: sumaHaber, descuadrado } = cuadraturaAsiento(a);
                const abierto = expandido === a.id;
                const alternar = () => setExpandido(abierto ? null : a.id);
                return (
                  <React.Fragment key={a.id}>
                    <tr
                      onClick={alternar}
                      onKeyDown={e => { if (e.key === "Enter" && e.target === e.currentTarget) alternar(); }}
                      tabIndex={0}
                      aria-expanded={abierto}
                      className={`group align-top cursor-pointer hover:bg-cuaderno-papel focus:outline-none focus-visible:bg-cuaderno-papel ${abierto ? "bg-cuaderno-papel" : "border-b border-cuaderno-renglon"}`}
                    >
                      {isAdmin && (
                        <td className="pl-1 pr-1 py-2.5" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            aria-label={`Seleccionar asiento ${a.numero || ""}`}
                            checked={asientosSeleccionados.includes(a.id)}
                            onChange={() => {
                              if (asientosSeleccionados.includes(a.id)) {
                                setAsientosSeleccionados(asientosSeleccionados.filter(id => id !== a.id));
                              } else {
                                setAsientosSeleccionados([...asientosSeleccionados, a.id]);
                              }
                            }}
                            className={CHECK}
                          />
                        </td>
                      )}
                      <td className="px-2 py-2 text-[15px] text-cuaderno-grafito whitespace-nowrap hidden md:table-cell">
                        {a.numero || "—"}
                      </td>
                      <td className="px-2 py-2 text-[15px] text-cuaderno-grafito whitespace-nowrap hidden sm:table-cell">{a.fecha}</td>
                      <td className="px-2 py-2 min-w-0">
                        <div className="flex items-baseline gap-2 flex-wrap">
                          <span className={`text-[17px] leading-tight ${a.reversado ? "text-cuaderno-grafito line-through" : ""}`}>{a.glosa}</span>
                          {a.reversado && <Resaltado color="durazno" className="text-[13px]">reversado</Resaltado>}
                          {a.origen === "reverso" && <span className="text-[13px] text-cuaderno-grafito">reverso</span>}
                          {esNotaCredito(a) ? (
                            <Resaltado color="rosa" className="text-[13px]">{a.origen === "rcv_venta" ? "nc emitida" : "nota de crédito"}</Resaltado>
                          ) : esVenta(a) ? (
                            <Resaltado color="menta" className="text-[13px]">venta</Resaltado>
                          ) : (
                            <EtiquetaTipo tipo={a.tipo} />
                          )}
                          {descuadrado && <Resaltado color="rosa" className="text-[13px]">no cuadra</Resaltado>}
                        </div>
                        <div className="flex items-center gap-3 mt-0.5 flex-wrap text-[14px] text-cuaderno-grafito">
                          <span className="sm:hidden">{a.fecha}</span>
                          <span>{a.lineas?.length || 0} líneas</span>
                          <CuentaGastoChip asiento={a} onElegir={reclasificarYAprender} />
                        </div>
                      </td>
                      <td className="px-2 py-2 text-right text-[16px] whitespace-nowrap">
                        <Cifra valor={sumaDebe} escala="pesos" vacio="0" />
                      </td>
                      <td className="px-2 py-2 text-right text-[16px] whitespace-nowrap hidden sm:table-cell">
                        <Cifra valor={sumaHaber} escala="pesos" vacio="0" />
                      </td>
                      <td className="px-1 py-1" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-0.5">
                          {(!a.origen || ["manual","reverso"].includes(a.origen)) && !a.reversado && (
                            <button onClick={() => { setEditando(a); setShowModal(true); }}
                              title="Editar" aria-label="Editar"
                              className="w-8 h-8 rounded-md flex items-center justify-center text-cuaderno-grafito hover:text-cuaderno-tinta hover:bg-cuaderno-hoja">
                              <IconoLapiz tamano={14} />
                            </button>
                          )}
                          {!a.reversado && a.origen !== "reverso" && (
                            <button onClick={() => handleReversar(a)}
                              disabled={deletingId === a.id}
                              title="Reversar" aria-label="Reversar"
                              className="w-8 h-8 rounded-md flex items-center justify-center text-cuaderno-grafito hover:text-cuaderno-tinta hover:bg-cuaderno-hoja disabled:opacity-50">
                              <IconoReversar tamano={14} />
                            </button>
                          )}
                          <button onClick={() => handleEliminar(a.id)}
                            disabled={deletingId === a.id}
                            title="Eliminar" aria-label="Eliminar"
                            className="w-8 h-8 rounded-md flex items-center justify-center text-cuaderno-grafito hover:text-cuaderno-roja hover:bg-cuaderno-rosa/40 disabled:opacity-50">
                            {deletingId === a.id ? <span className="text-[12px]">…</span> : <IconoBorrar tamano={14} />}
                          </button>
                          <button onClick={alternar} aria-label={abierto ? "Ocultar detalle" : "Ver detalle"}
                            className="w-8 h-8 rounded-md flex items-center justify-center text-cuaderno-grafito hover:text-cuaderno-tinta hover:bg-cuaderno-hoja">
                            <IconoBajar tamano={14} className={`transition-transform ${abierto ? "rotate-180" : ""}`} />
                          </button>
                        </div>
                      </td>
                    </tr>

                    {/* Detalle expandido */}
                    {abierto && (
                      <tr className="border-b border-cuaderno-renglon bg-cuaderno-papel">
                        <td colSpan={isAdmin ? 7 : 6} className="p-0">
                          <AsientoDetalle asiento={a} onElegir={reclasificarYAprender} />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </Hoja>

      <ModalAsiento isOpen={showModal} onClose={() => { setShowModal(false); setEditando(null); }}
        editando={editando} onSave={guardarAsientoYAprender} cuentas={cuentas} periodoActivo={periodoActivo} />

      <ModalImportIConstruct
        isOpen={showImport}
        onClose={() => setShowImport(false)}
        cuentas={cuentas}
        reglasGasto={reglasParaImportar}
        guardarReglaGasto={guardarReglaGasto}
        guardarAsiento={guardarAsiento}
        periodoActivo={periodoActivo}
        buscarHashesExistentes={buscarHashesExistentes}
        onImportDone={(periodoImportado) => {
          setShowImport(false);
          setPeriodoActivo(periodoImportado);
        }}
      />
      <ModalExportPDF isOpen={showExport} onClose={() => setShowExport(false)} />
      <ModalImportarHonorarios
        isOpen={showHonModal}
        onClose={() => setShowHonModal(false)}
        cuentas={cuentas}
        onSave={guardarAsiento}
        periodoActivo={periodoActivo}
      />
    </div>
  );
}
