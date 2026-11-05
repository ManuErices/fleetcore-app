import React, { useState, useCallback } from "react";
import { useContabilidad, fmt, MESES } from "./ContabilidadContext";
import {
  ModalCuaderno, Boton, Nota, Resaltado, VistoBueno, LineaGuia, IconoDocumento,
} from "../finanzas/cuaderno";

// ─── Cargador dinámico de jsPDF + AutoTable ────────────────────────────────
let jsPDFCache = null;
async function cargarJsPDF() {
  if (jsPDFCache) return jsPDFCache;
  if (typeof window === "undefined") throw new Error("Solo funciona en el navegador.");

  // Cargar jsPDF
  if (!window.jsPDF && !window.jspdf) {
    await new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
      s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    });
  }
  // Cargar AutoTable
  if (!window.jsPDF?.API?.autoTable) {
    await new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js";
      s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    });
  }
  const jsPDF = window.jspdf?.jsPDF || window.jsPDF;
  jsPDFCache = jsPDF;
  return jsPDF;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function mesLabel(periodo) {
  if (!periodo) return "";
  const [a, m] = periodo.split("-");
  return `${MESES[parseInt(m) - 1]} ${a}`;
}
function fmtPDF(n) {
  const num = parseFloat(n) || 0;
  return num.toLocaleString("es-CL", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

// ─── Paleta corporativa PDF ───────────────────────────────────────────────────
const NAVY  = [15,  39,  68];
const BLUE  = [29,  86, 160];
const TEAL  = [13, 125, 107];
const LIGHT = [248, 250, 252];
const GRAY  = [100, 116, 139];

// ─── Header de página (se repite en cada hoja) ───────────────────────────────
function agregarHeader(doc, titulo, subtitulo, empresa, periodo, pageNum, totalPages) {
  const W = doc.internal.pageSize.getWidth();

  // Franja azul marino
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, W, 28, "F");

  // Título
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(titulo, 14, 11);

  // Subtítulo
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(147, 197, 253);
  doc.text(subtitulo, 14, 17);

  // Empresa + período (derecha)
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(255, 255, 255);
  doc.text(empresa, W - 14, 11, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(147, 197, 253);
  doc.text(`Período: ${mesLabel(periodo)}`, W - 14, 17, { align: "right" });
  doc.text(`Generado: ${new Date().toLocaleDateString("es-CL")}`, W - 14, 22, { align: "right" });

  // Número de página
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(180, 200, 230);
  doc.text(`Página ${pageNum} de ${totalPages}`, W / 2, 25, { align: "center" });
}

// ─── Generar Libro Diario PDF ─────────────────────────────────────────────────
async function generarLibroDiarioPDF(asientos, periodoActivo, empresa) {
  const jsPDF = await cargarJsPDF();
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W   = doc.internal.pageSize.getWidth();
  let   y   = 34;

  const TITLE    = "LIBRO DIARIO";
  const SUBTITLE = "Registro cronológico de asientos contables";

  // ── Totales resumen ──────────────────────────────────────────────────────
  const totalDebe  = asientos.reduce((s, a) => s + (a.totalDebe || 0), 0);
  const totalHaber = totalDebe; // siempre cuadran

  // Bloque resumen
  doc.setFillColor(...LIGHT);
  doc.roundedRect(14, y, W - 28, 16, 2, 2, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...NAVY);
  doc.text(`Total asientos: ${asientos.length}`, 20, y + 6);
  doc.text(`Total Debe: $${fmtPDF(totalDebe)}`, 80, y + 6);
  doc.text(`Total Haber: $${fmtPDF(totalHaber)}`, 140, y + 6);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(...GRAY);
  doc.text("Los cálculos se basan en los asientos registrados en el sistema.", 20, y + 12);
  y += 22;

  // ── Asientos ──────────────────────────────────────────────────────────────
  asientos.forEach((asiento, idx) => {
    const lineas = asiento.lineas || [];
    const nLineas = lineas.length;
    const alturaEstimada = 10 + nLineas * 6 + 6;
    const pageH = doc.internal.pageSize.getHeight();

    if (y + alturaEstimada > pageH - 20) {
      doc.addPage();
      agregarHeader(doc, TITLE, SUBTITLE, empresa, periodoActivo,
        doc.internal.getNumberOfPages(), "?");
      y = 34;
    }

    // Cabecera del asiento
    doc.setFillColor(...NAVY);
    doc.rect(14, y, W - 28, 7, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.text(`${idx + 1}. ${asiento.glosa || "Sin glosa"}`, 17, y + 4.5, { maxWidth: W - 70 });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.text(asiento.fecha || "", W - 16, y + 4.5, { align: "right" });
    y += 7;

    // Líneas contables
    lineas.forEach((l, li) => {
      const bg = li % 2 === 0;
      if (bg) {
        doc.setFillColor(245, 247, 250);
        doc.rect(14, y, W - 28, 6, "F");
      }
      doc.setTextColor(...GRAY);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.text(l.cuentaNombre || l.cuentaId || "—", 20, y + 4);
      if (l.descripcion) {
        doc.setFontSize(6);
        doc.setTextColor(160, 175, 190);
        doc.text(l.descripcion, 80, y + 4, { maxWidth: 60 });
      }
      // Debe / Haber
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      if (parseFloat(l.debe) > 0) {
        doc.setTextColor(...TEAL);
        doc.text(`$${fmtPDF(l.debe)}`, W - 50, y + 4, { align: "right" });
      }
      if (parseFloat(l.haber) > 0) {
        doc.setTextColor(220, 38, 38);
        doc.text(`$${fmtPDF(l.haber)}`, W - 16, y + 4, { align: "right" });
      }
      y += 6;
    });

    // Totales del asiento
    doc.setFillColor(...TEAL);
    doc.rect(W - 100, y, 86, 5.5, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.text("Total:", W - 100 + 4, y + 3.8);
    doc.text(`$${fmtPDF(asiento.totalDebe)}`, W - 50, y + 3.8, { align: "right" });
    doc.text(`$${fmtPDF(asiento.totalDebe)}`, W - 16, y + 3.8, { align: "right" });
    y += 9;
  });

  // Agregar headers con paginación correcta
  const totalPags = doc.internal.getNumberOfPages();
  for (let p = 1; p <= totalPags; p++) {
    doc.setPage(p);
    agregarHeader(doc, TITLE, SUBTITLE, empresa, periodoActivo, p, totalPags);
  }

  // Pie de última página
  doc.setPage(totalPags);
  const pageH = doc.internal.pageSize.getHeight();
  doc.setFillColor(...NAVY);
  doc.rect(0, pageH - 12, W, 12, "F");
  doc.setTextColor(147, 197, 253);
  doc.setFont("helvetica", "italic");
  doc.setFontSize(7);
  doc.text(
    "Documento generado por FleetCore-F — Solo para uso referencial. Valida con tu contador antes de presentar al SII.",
    W / 2, pageH - 5, { align: "center" }
  );

  const fileName = `Libro_Diario_${periodoActivo}.pdf`;
  doc.save(fileName);
  return fileName;
}

// ─── Generar Libro Mayor PDF ──────────────────────────────────────────────────
async function generarLibroMayorPDF(asientos, cuentas, periodoActivo, empresa) {
  const jsPDF = await cargarJsPDF();
  const doc   = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const W     = doc.internal.pageSize.getWidth();
  const TITLE    = "LIBRO MAYOR";
  const SUBTITLE = "Movimientos por cuenta contable — Base devengada";

  let paginaActual = 1;

  // Calcular movimientos por cuenta
  const movPorCuenta = {};
  asientos.forEach(a => {
    (a.lineas || []).forEach(l => {
      const id = l.cuentaId;
      if (!id) return;
      if (!movPorCuenta[id]) movPorCuenta[id] = { lineas: [], sumaDebe: 0, sumaHaber: 0 };
      movPorCuenta[id].lineas.push({
        fecha: a.fecha, glosa: a.glosa, debe: parseFloat(l.debe) || 0,
        haber: parseFloat(l.haber) || 0, descripcion: l.descripcion,
      });
      movPorCuenta[id].sumaDebe  += parseFloat(l.debe)  || 0;
      movPorCuenta[id].sumaHaber += parseFloat(l.haber) || 0;
    });
  });

  // Ordenar cuentas por código
  const cuentasConMov = cuentas
    .filter(c => movPorCuenta[c.id] && c.activa !== false)
    .sort((a, b) => (a.codigo || "").localeCompare(b.codigo || ""));

  // Primera página con header
  agregarHeader(doc, TITLE, SUBTITLE, empresa, periodoActivo, 1, 1);
  let y = 34;

  cuentasConMov.forEach((cuenta, ci) => {
    const mov       = movPorCuenta[cuenta.id];
    const saldoFinal = mov.sumaDebe - mov.sumaHaber;
    const altEst    = 14 + mov.lineas.length * 5.5 + 8;
    const pageH     = doc.internal.pageSize.getHeight();

    if (y + altEst > pageH - 18 && ci > 0) {
      doc.addPage();
      paginaActual++;
      agregarHeader(doc, TITLE, SUBTITLE, empresa, periodoActivo, paginaActual, 1);
      y = 34;
    }

    // Título cuenta
    doc.setFillColor(...NAVY);
    doc.rect(10, y, W - 20, 8, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.text(`${cuenta.codigo}  ${cuenta.nombre}`, 14, y + 5.5);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(147, 197, 253);
    doc.text(`Saldo neto: $${fmtPDF(Math.abs(saldoFinal))} ${saldoFinal >= 0 ? "Deudor" : "Acreedor"}`, W - 14, y + 5.5, { align: "right" });
    y += 8;

    // Cabecera tabla
    doc.setFillColor(...BLUE);
    doc.rect(10, y, W - 20, 5.5, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.text("Fecha",       14,     y + 3.8);
    doc.text("Glosa",       36,     y + 3.8);
    doc.text("Detalle",     110,    y + 3.8);
    doc.text("Debe",        W - 62, y + 3.8, { align: "right" });
    doc.text("Haber",       W - 38, y + 3.8, { align: "right" });
    doc.text("Saldo",       W - 14, y + 3.8, { align: "right" });
    y += 5.5;

    // Filas
    let saldoAcum = 0;
    mov.lineas.forEach((l, li) => {
      saldoAcum += l.debe - l.haber;
      const bg = li % 2 === 0;
      if (bg) { doc.setFillColor(245, 247, 250); doc.rect(10, y, W - 20, 5.5, "F"); }

      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.5);
      doc.setTextColor(...GRAY);
      doc.text(l.fecha || "", 14, y + 3.8);
      doc.text((l.glosa || "").slice(0, 40), 36, y + 3.8);
      if (l.descripcion) {
        doc.setFontSize(6);
        doc.setTextColor(170, 185, 200);
        doc.text((l.descripcion || "").slice(0, 35), 110, y + 3.8);
      }
      doc.setFont("helvetica", "bold");
      doc.setFontSize(6.5);
      if (l.debe > 0)  { doc.setTextColor(...TEAL); doc.text(`$${fmtPDF(l.debe)}`, W - 62, y + 3.8, { align: "right" }); }
      if (l.haber > 0) { doc.setTextColor(220, 38, 38); doc.text(`$${fmtPDF(l.haber)}`, W - 38, y + 3.8, { align: "right" }); }
      doc.setTextColor(saldoAcum >= 0 ? TEAL[0] : 220, saldoAcum >= 0 ? TEAL[1] : 38, saldoAcum >= 0 ? TEAL[2] : 38);
      doc.text(`$${fmtPDF(Math.abs(saldoAcum))}`, W - 14, y + 3.8, { align: "right" });
      y += 5.5;
    });

    // Total cuenta
    doc.setFillColor(...TEAL);
    doc.rect(W - 120, y, 110, 5.5, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.text("TOTALES:", W - 120 + 4, y + 3.8);
    doc.text(`$${fmtPDF(mov.sumaDebe)}`,  W - 62, y + 3.8, { align: "right" });
    doc.text(`$${fmtPDF(mov.sumaHaber)}`, W - 38, y + 3.8, { align: "right" });
    doc.text(`$${fmtPDF(Math.abs(saldoFinal))} ${saldoFinal >= 0 ? "D" : "A"}`, W - 14, y + 3.8, { align: "right" });
    y += 10;
  });

  // Fijar número total de páginas
  const totalPags = doc.internal.getNumberOfPages();
  for (let p = 1; p <= totalPags; p++) {
    doc.setPage(p);
    agregarHeader(doc, TITLE, SUBTITLE, empresa, periodoActivo, p, totalPags);
    // Pie
    const pageH = doc.internal.pageSize.getHeight();
    doc.setFillColor(...NAVY);
    doc.rect(0, pageH - 10, W, 10, "F");
    doc.setTextColor(147, 197, 253);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(6.5);
    doc.text(
      "Documento generado por FleetCore-F — Solo para uso referencial. Valida con tu contador antes de presentar al SII.",
      W / 2, pageH - 4, { align: "center" }
    );
  }

  const fileName = `Libro_Mayor_${periodoActivo}.pdf`;
  doc.save(fileName);
  return fileName;
}

// ─── Helpers para estados financieros ────────────────────────────────────────
const TIPOS_MAP_PDF = {
  activo_corriente:"ACTIVO", activo_no_corriente:"ACTIVO", iva_credito:"ACTIVO",
  ppm:"ACTIVO", impuesto_diferido:"ACTIVO",
  pasivo_corriente:"PASIVO", pasivo_no_corriente:"PASIVO", iva_debito:"PASIVO",
  patrimonio:"PATRIMONIO",
  ingreso:"RESULTADO", costo:"RESULTADO", gasto_adm:"RESULTADO",
  gasto_fin:"RESULTADO", otro_resultado:"RESULTADO",
};

function calcularESF(cuentas, saldosMap) {
  const saldo = (c) => {
    const s = saldosMap[c.id] || { debe:0, haber:0 };
    const signoDeudor = ["activo_corriente","activo_no_corriente","iva_credito","ppm",
      "impuesto_diferido","costo","gasto_adm","gasto_fin","otro_resultado"].includes(c.tipo);
    return signoDeudor ? (s.debe - s.haber) : (s.haber - s.debe);
  };
  const grupos = { activoC:[], activoNC:[], pasivoC:[], pasivoNC:[], patrimonio:[], resultado:[] };
  cuentas.filter(c => c.activa !== false).forEach(c => {
    const s = saldo(c);
    if (Math.abs(s) < 1) return;
    const item = { codigo:c.codigo, nombre:c.nombre, saldo:s };
    if (["activo_corriente","iva_credito","ppm","impuesto_diferido"].includes(c.tipo)) grupos.activoC.push(item);
    else if (["activo_no_corriente"].includes(c.tipo)) grupos.activoNC.push(item);
    else if (["pasivo_corriente","iva_debito"].includes(c.tipo)) grupos.pasivoC.push(item);
    else if (["pasivo_no_corriente"].includes(c.tipo)) grupos.pasivoNC.push(item);
    else if (["patrimonio"].includes(c.tipo)) grupos.patrimonio.push(item);
    else if (["ingreso","costo","gasto_adm","gasto_fin","otro_resultado"].includes(c.tipo)) grupos.resultado.push(item);
  });
  const sum = arr => arr.reduce((s, i) => s + i.saldo, 0);
  const resultadoPeriodo = cuentas.filter(c => c.activa !== false &&
    ["ingreso","costo","gasto_adm","gasto_fin","otro_resultado"].includes(c.tipo))
    .reduce((acc, c) => {
      const s = saldosMap[c.id] || {debe:0, haber:0};
      return acc + (c.tipo === "ingreso" ? (s.haber - s.debe) : (s.debe - s.haber));
    }, 0);
  return { ...grupos, resultadoPeriodo,
    totalAC: sum(grupos.activoC), totalANC: sum(grupos.activoNC),
    totalPC: sum(grupos.pasivoC), totalPNC: sum(grupos.pasivoNC),
    totalPat: sum(grupos.patrimonio) + resultadoPeriodo };
}

function calcularERP(cuentas, saldosMap, tasaImpuesto = 0.27) {
  const getSaldo = (tipo) => cuentas.filter(c => c.tipo === tipo && c.activa !== false).map(c => {
    const s = saldosMap[c.id] || {debe:0, haber:0};
    return { codigo:c.codigo, nombre:c.nombre,
      saldo: tipo === "ingreso" ? (s.haber - s.debe) : (s.debe - s.haber) };
  }).filter(x => Math.abs(x.saldo) > 0);
  const ingresos  = getSaldo("ingreso");
  const costos    = getSaldo("costo");
  const gastosAdm = getSaldo("gasto_adm");
  const gastosFin = getSaldo("gasto_fin");
  const otros     = getSaldo("otro_resultado");
  const sum = arr => arr.reduce((s,x) => s + x.saldo, 0);
  const totalIng   = sum(ingresos);
  const totalCosto = sum(costos);
  const utilBruta  = totalIng - totalCosto;
  const totalGAdm  = sum(gastosAdm);
  const utilOp     = utilBruta - totalGAdm;
  const totalGFin  = sum(gastosFin);
  const totalOtros = sum(otros);
  const utilAntes  = utilOp - totalGFin - totalOtros;
  // El impuesto no está contabilizado: se informa como estimación, no se resta
  // del resultado. Ver la misma decisión en ContabilidadEstados.jsx.
  const impuestoEstim = Math.max(0, utilAntes * tasaImpuesto);
  return { ingresos, costos, gastosAdm, gastosFin, otros,
    totalIng, totalCosto, utilBruta, totalGAdm, utilOp,
    totalGFin, totalOtros, utilAntes, impuestoEstim, tasaImpuesto,
    utilDespuesEst: utilAntes - impuestoEstim };
}

// ─── Generar Balance 8 Columnas PDF ──────────────────────────────────────────
async function generarBalance8PDF(cuentas, saldosMap, periodoActivo, empresa) {
  const jsPDF  = await cargarJsPDF();
  const doc    = new jsPDF({ orientation:"landscape", unit:"mm", format:"a4" });
  const W      = doc.internal.pageSize.getWidth();
  const TITULO = "BALANCE DE COMPROBACIÓN — 8 COLUMNAS";
  const SUB    = "Sumas · Saldos · Estado de Situación · Estado de Resultados — NIC 1 / IFRS";

  const filasData = cuentas.filter(c => c.activa !== false).map(c => {
    const s  = saldosMap[c.id] || {debe:0,haber:0};
    const gr = TIPOS_MAP_PDF[c.tipo] || "";
    const sD = s.debe > s.haber ? s.debe - s.haber : 0;
    const sA = s.haber > s.debe ? s.haber - s.debe : 0;
    const esA = ["ACTIVO"].includes(gr);
    const esP = ["PASIVO","PATRIMONIO"].includes(gr);
    const esI = c.tipo === "ingreso";
    const esR = gr === "RESULTADO";
    return [
      c.codigo||"", c.nombre||"",
      s.debe>0 ? fmtPDF(s.debe):"", s.haber>0 ? fmtPDF(s.haber):"",
      sD>0 ? fmtPDF(sD):"", sA>0 ? fmtPDF(sA):"",
      esA&&sD>0 ? fmtPDF(sD):"", esP&&sA>0 ? fmtPDF(sA):"",
      esR&&!esI&&sD>0 ? fmtPDF(sD):"", esR&&esI&&sA>0 ? fmtPDF(sA):"",
    ];
  }).filter(r => r[2]||r[3]);

  const agregarHead = (p, tot) => {
    agregarHeader(doc, TITULO, SUB, empresa, periodoActivo, p, tot);
  };

  doc.autoTable({
    startY: 34,
    head: [
      ["Código","Cuenta","Debe","Haber","Deudor","Acreedor","Activo","Pasivo","Pérdida","Ganancia"],
      ["","","← Sumas →","","← Saldos →","","← E.S.F. →","","← E.R.P. →",""],
    ],
    body: filasData,
    theme: "grid",
    styles: { fontSize:6.5, cellPadding:1.5, font:"helvetica", textColor:[51,65,85] },
    headStyles: { fillColor:NAVY, textColor:[255,255,255], fontStyle:"bold", fontSize:6.5 },
    columnStyles: {
      0:{cellWidth:18, fontStyle:"bold", textColor:GRAY},
      1:{cellWidth:42},
      2:{cellWidth:22,halign:"right",textColor:TEAL},
      3:{cellWidth:22,halign:"right",textColor:[220,38,38]},
      4:{cellWidth:22,halign:"right",textColor:BLUE},
      5:{cellWidth:22,halign:"right",textColor:[234,88,12]},
      6:{cellWidth:22,halign:"right",textColor:TEAL},
      7:{cellWidth:22,halign:"right",textColor:[220,38,38]},
      8:{cellWidth:22,halign:"right",textColor:[220,38,38]},
      9:{cellWidth:22,halign:"right",textColor:TEAL},
    },
    alternateRowStyles:{fillColor:[248,250,252]},
    didDrawPage: (d) => agregarHead(d.pageNumber, "?"),
  });

  const tot = doc.internal.getNumberOfPages();
  for (let p=1;p<=tot;p++) { doc.setPage(p); agregarHead(p,tot); }

  const fn = `Balance_8Col_${periodoActivo}.pdf`;
  doc.save(fn); return fn;
}

// ─── Generar ESF PDF ──────────────────────────────────────────────────────────
async function generarESFPDF(cuentas, saldosMap, periodoActivo, empresa) {
  const jsPDF  = await cargarJsPDF();
  const doc    = new jsPDF({ orientation:"portrait", unit:"mm", format:"a4" });
  const W      = doc.internal.pageSize.getWidth();
  const TITULO = "ESTADO DE SITUACIÓN FINANCIERA";
  const SUB    = "Balance General — Posición patrimonial al cierre del período — NIC 1 / IFRS";
  const esf    = calcularESF(cuentas, saldosMap);

  const agregarHead = (p,t) => agregarHeader(doc, TITULO, SUB, empresa, periodoActivo, p, t);

  // Construir filas
  const seccion = (titulo, items, total, totalLabel) => {
    const rows = [];
    rows.push([{ content: titulo, colSpan:2, styles:{fillColor:TEAL,textColor:[255,255,255],fontStyle:"bold",fontSize:7.5} }]);
    items.forEach(i => rows.push([i.nombre, { content:`$${fmtPDF(i.saldo)}`, styles:{halign:"right",fontStyle:"bold",textColor:TEAL}}]));
    rows.push([{ content:totalLabel, styles:{fontStyle:"bold",textColor:TEAL,fillColor:[240,253,244]}},
      { content:`$${fmtPDF(total)}`, styles:{halign:"right",fontStyle:"bold",textColor:TEAL,fillColor:[240,253,244]}}]);
    return rows;
  };

  const bodyActivos = [
    ...seccion("ACTIVO CORRIENTE", esf.activoC, esf.totalAC, "Total Activo Corriente"),
    [{content:"",colSpan:2}],
    ...seccion("ACTIVO NO CORRIENTE", esf.activoNC.length?esf.activoNC:[{nombre:"Sin activos no corrientes",saldo:0}], esf.totalANC, "Total Activo No Corriente"),
    [{ content:`TOTAL ACTIVOS`, colSpan:1, styles:{fillColor:NAVY,textColor:[255,255,255],fontStyle:"bold"}},
     { content:`$${fmtPDF(esf.totalAC+esf.totalANC)}`, styles:{halign:"right",fillColor:NAVY,textColor:[255,255,255],fontStyle:"bold"}}],
  ];

  const bodyPasivos = [
    ...seccion("PASIVO CORRIENTE", esf.pasivoC, esf.totalPC, "Total Pasivo Corriente"),
    [{content:"",colSpan:2}],
    ...seccion("PASIVO NO CORRIENTE", esf.pasivoNC.length?esf.pasivoNC:[{nombre:"Sin pasivos no corrientes",saldo:0}], esf.totalPNC, "Total Pasivo No Corriente"),
    [{content:"",colSpan:2}],
    ...seccion("PATRIMONIO", [
      ...esf.patrimonio,
      {nombre:"Resultado del Período", saldo:esf.resultadoPeriodo}
    ], esf.totalPat, "Total Patrimonio"),
    [{ content:"TOTAL PASIVOS + PAT.", colSpan:1, styles:{fillColor:NAVY,textColor:[255,255,255],fontStyle:"bold"}},
     { content:`$${fmtPDF(esf.totalPC+esf.totalPNC+esf.totalPat)}`, styles:{halign:"right",fillColor:NAVY,textColor:[255,255,255],fontStyle:"bold"}}],
  ];

  const maxRows = Math.max(bodyActivos.length, bodyPasivos.length);
  while (bodyActivos.length < maxRows) bodyActivos.push(["",""]);
  while (bodyPasivos.length < maxRows) bodyPasivos.push(["",""]);

  const body = bodyActivos.map((row, i) => [...(Array.isArray(row)?row:[row]), ...(Array.isArray(bodyPasivos[i])?bodyPasivos[i]:[bodyPasivos[i]])]);

  doc.autoTable({
    startY:34, head:[["Activos","","Pasivos y Patrimonio",""]],
    body, theme:"grid",
    styles:{fontSize:7.5, cellPadding:2, font:"helvetica", textColor:[51,65,85]},
    headStyles:{fillColor:NAVY, textColor:[255,255,255], fontStyle:"bold"},
    columnStyles:{ 0:{cellWidth:55}, 1:{cellWidth:35,halign:"right"}, 2:{cellWidth:55}, 3:{cellWidth:35,halign:"right"} },
    alternateRowStyles:{fillColor:[248,250,252]},
    didDrawPage:(d) => agregarHead(d.pageNumber,"?"),
  });

  const tot = doc.internal.getNumberOfPages();
  for (let p=1;p<=tot;p++) { doc.setPage(p); agregarHead(p,tot); }
  const fn = `ESF_${periodoActivo}.pdf`; doc.save(fn); return fn;
}

// ─── Generar ERP PDF ──────────────────────────────────────────────────────────
async function generarERPPDF(cuentas, saldosMap, periodoActivo, empresa, tasaImpuesto = 0.27) {
  const jsPDF  = await cargarJsPDF();
  const doc    = new jsPDF({ orientation:"portrait", unit:"mm", format:"a4" });
  const W      = doc.internal.pageSize.getWidth();
  const TITULO = "ESTADO DE RESULTADOS DEL PERÍODO";
  const SUB    = "Rendimiento económico — Base devengada — NIC 1 / IFRS — Art. 29–33 LIR";
  const erp    = calcularERP(cuentas, saldosMap, tasaImpuesto);

  const agregarHead = (p,t) => agregarHeader(doc, TITULO, SUB, empresa, periodoActivo, p, t);

  const fmtR = (n) => n < 0 ? `($${fmtPDF(Math.abs(n))})` : `$${fmtPDF(n)}`;
  const colorR = (n) => n < 0 ? [220,38,38] : TEAL;

  const seccion = (titulo, items, fillColor=[30,58,96]) => [
    [{ content:titulo, colSpan:2, styles:{fillColor,textColor:[255,255,255],fontStyle:"bold",fontSize:7.5} }],
    ...items.map(i => [i.nombre, {content:`$${fmtPDF(i.saldo)}`,styles:{halign:"right",fontStyle:"bold",textColor:TEAL}}]),
  ];
  const fila = (label, valor, negrita=false, bg=null) => [{
    content:label, styles:{fontStyle:negrita?"bold":"normal", fillColor:bg||undefined,
    textColor:negrita?(bg?[255,255,255]:NAVY):[51,65,85]}
  },{
    content:fmtR(valor), styles:{halign:"right",fontStyle:negrita?"bold":"normal",
    textColor:colorR(valor), fillColor:bg||undefined}
  }];

  const body = [
    ...seccion("INGRESOS DE ACTIVIDADES ORDINARIAS", erp.ingresos, TEAL),
    fila("Total Ingresos", erp.totalIng, true, [240,253,244]),
    [{content:"",colSpan:2}],
    ...seccion("COSTO DE VENTAS", erp.costos, [124,58,237]),
    fila("Total Costo de Ventas", erp.totalCosto, true),
    [{content:"",colSpan:2}],
    fila(`UTILIDAD BRUTA`, erp.utilBruta, true, erp.utilBruta>=0?[240,253,244]:[254,242,242]),
    [{content:"",colSpan:2}],
    ...seccion("GASTOS DE ADMINISTRACIÓN Y VENTAS", erp.gastosAdm, [180,83,9]),
    fila("Total Gastos Adm.", erp.totalGAdm, true),
    [{content:"",colSpan:2}],
    fila("RESULTADO OPERACIONAL", erp.utilOp, true, erp.utilOp>=0?[240,253,244]:[254,242,242]),
    ...(erp.gastosFin.length ? [...seccion("GASTOS FINANCIEROS", erp.gastosFin, GRAY), fila("Total Gastos Fin.", erp.totalGFin, true)] : []),
    [{content:"",colSpan:2}],
    [{content:"",colSpan:2}],
    fila("RESULTADO DEL PERÍODO (antes de impuesto)", erp.utilAntes, true, NAVY),
    [{content:"",colSpan:2}],
    [{ content:"Estimación tributaria — no contabilizada", colSpan:2,
       styles:{ fontStyle:"bold", fontSize:7, textColor:[180,83,9], fillColor:[255,251,235] } }],
    fila(`Impuesto 1ª Categoría estimado (${(erp.tasaImpuesto*100).toFixed(1).replace(".", ",")}%)`, erp.impuestoEstim, false),
    fila("Resultado después del impuesto estimado", erp.utilDespuesEst, false),
  ];

  doc.autoTable({
    startY:34, head:[["Concepto","Monto"]],
    body, theme:"grid",
    styles:{fontSize:8, cellPadding:2.5, font:"helvetica", textColor:[51,65,85]},
    headStyles:{fillColor:NAVY,textColor:[255,255,255],fontStyle:"bold"},
    columnStyles:{ 0:{cellWidth:120}, 1:{cellWidth:50,halign:"right"} },
    alternateRowStyles:{fillColor:[248,250,252]},
    didDrawPage:(d) => agregarHead(d.pageNumber,"?"),
  });

  // Pie con margen neto
  const margen = erp.totalIng > 0 ? ((erp.utilAntes/erp.totalIng)*100).toFixed(1) : "—";
  const pageH  = doc.internal.pageSize.getHeight();
  const tot    = doc.internal.getNumberOfPages();
  for (let p=1;p<=tot;p++) {
    doc.setPage(p);
    agregarHead(p,tot);
    if (p === tot) {
      doc.setFillColor(...NAVY); doc.rect(0, pageH-14, W, 14, "F");
      doc.setTextColor(147,197,253); doc.setFont("helvetica","bold"); doc.setFontSize(7.5);
      doc.text(`Margen antes de impuesto: ${margen}%  ·  Ingresos: $${fmtPDF(erp.totalIng)}  ·  Resultado: ${fmtR(erp.utilAntes)}`, W/2, pageH-7.5, {align:"center"});
    }
  }
  const fn = `Estado_Resultados_${periodoActivo}.pdf`; doc.save(fn); return fn;
}

// ─── Piezas de presentación de los modales (cuaderno) ────────────────────────
// Ícono de descarga a trazo fino, como los de cuaderno.jsx.
function IconoDescargar({ tamano = 16, className = "" }) {
  return (
    <svg width={tamano} height={tamano} viewBox="0 0 16 16" fill="none" stroke="currentColor"
      strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={`flex-shrink-0 ${className}`}>
      <path d="M8 2.5 V10.5 M4.5 7 L8 10.5 L11.5 7 M3 13.5 H13" />
    </svg>
  );
}

// Lista de informes a exportar: cada uno es un renglón que se puede elegir.
function ListaOpciones({ opciones, onElegir }) {
  return (
    <ul className="m-0 p-0 list-none border-t border-cuaderno-renglon">
      {opciones.map(opt => (
        <li key={opt.id} className="border-b border-cuaderno-renglon">
          <button type="button" onClick={() => onElegir(opt.id)}
            className="w-full min-h-[56px] flex items-center gap-3 px-1 py-2 text-left text-cuaderno-tinta hover:bg-cuaderno-hoja focus:outline-none focus-visible:ring-2 focus-visible:ring-cuaderno-tinta/40">
            <IconoDocumento tamano={18} className="text-cuaderno-grafito" />
            <span className="flex-1 min-w-0">
              <span className="block text-[18px] leading-snug">{opt.title}</span>
              <span className="block text-[14px] text-cuaderno-grafito">{opt.desc}</span>
            </span>
            <span className="flex items-center gap-1 text-[15px] text-cuaderno-grafito">
              <IconoDescargar /> PDF
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

// Generando / listo / error, escrito a mano en la tarjeta.
function EstadoExport({ estado, progreso, error, generados }) {
  if (estado === "generando") {
    return (
      <p role="status" className="m-0 py-4 text-center font-ligada text-[18px] text-cuaderno-grafito animate-pulse">
        {progreso}
      </p>
    );
  }
  if (estado === "listo") {
    return (
      <div className="space-y-2">
        <p className="m-0 flex items-center gap-2 text-[18px]">
          <VistoBueno tamano={18} titulo="" /> <Resaltado color="menta">PDFs generados</Resaltado>
        </p>
        <ul className="m-0 p-0 list-none">
          {generados.map(f => (
            <li key={f} className="flex items-center gap-2 min-h-[36px] border-b border-cuaderno-renglon">
              <IconoDocumento className="text-cuaderno-grafito" />
              <span className="text-[16px] truncate min-w-0">{f}</span>
              <span className="ml-auto flex-shrink-0 text-[14px] text-cuaderno-verde">Descargado</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }
  if (estado === "error") {
    return <Nota etiqueta="Error:">{error}</Nota>;
  }
  return null;
}

// ─── Modal de exportación ─────────────────────────────────────────────────────
export default function ModalExportPDF({ isOpen, onClose }) {
  const { asientos, cuentas, periodoActivo } = useContabilidad();
  const [estado, setEstado]     = useState("idle"); // idle | generando | listo | error
  const [progreso, setProgreso] = useState("");
  const [error, setError]       = useState("");
  const [generados, setGenerados] = useState([]);

  const empresa = "MPF Ingeniería Civil SPA"; // TODO: leer desde contexto de empresa

  const reset = () => { setEstado("idle"); setProgreso(""); setError(""); setGenerados([]); };
  const handleClose = () => { reset(); onClose(); };

  const exportar = useCallback(async (tipo) => {
    setEstado("generando");
    setError("");
    setGenerados([]);
    try {
      if (tipo === "diario" || tipo === "ambos") {
        setProgreso("Generando Libro Diario...");
        const f = await generarLibroDiarioPDF(asientos, periodoActivo, empresa);
        setGenerados(prev => [...prev, f]);
      }
      if (tipo === "mayor" || tipo === "ambos") {
        setProgreso("Generando Libro Mayor...");
        const f = await generarLibroMayorPDF(asientos, cuentas, periodoActivo, empresa);
        setGenerados(prev => [...prev, f]);
      }
      setEstado("listo");
    } catch (e) {
      console.error(e);
      setError(e.message || "Error al generar el PDF.");
      setEstado("error");
    }
  }, [asientos, cuentas, periodoActivo]);

  if (!isOpen) return null;

  const periodo   = mesLabel(periodoActivo);
  const nAsientos = asientos.length;
  const nCuentas  = cuentas.filter(c => c.activa !== false).length;

  return (
    <ModalCuaderno
      titulo="Exportar libros contables"
      subtitulo="Formato PDF para fiscalización SII"
      onClose={handleClose}
      pie={
        <div className="flex flex-wrap items-center justify-end gap-3">
          {estado === "listo" && <Boton variante="secundario" onClick={reset}>Exportar otro libro</Boton>}
          <Boton variante="texto" onClick={handleClose}>Cerrar</Boton>
        </div>
      }>

      {/* Info período */}
      <div>
        <LineaGuia etiqueta="Período">{periodo}</LineaGuia>
        <p className="m-0 text-[15px] text-cuaderno-grafito">
          {nAsientos} asientos · {nCuentas} cuentas activas
        </p>
      </div>

      <EstadoExport estado={estado} progreso={progreso} error={error} generados={generados} />

      {/* Opciones (solo en idle o error) */}
      {(estado === "idle" || estado === "error") && (
        <ListaOpciones
          opciones={[
            { id:"diario", title:"Libro Diario", desc:"Todos los asientos del período en orden cronológico" },
            { id:"mayor",  title:"Libro Mayor",  desc:"Movimientos agrupados por cuenta contable con saldos" },
            { id:"ambos",  title:"Ambos libros", desc:"Genera los dos PDFs en una sola operación" },
          ]}
          onElegir={exportar}
        />
      )}

      {/* Advertencia legal */}
      <Nota etiqueta="Ojo:" tono="grafito" className="text-[15px]">
        Estos libros se generan desde los asientos registrados en el sistema.
        Deben ser revisados y firmados por el contador habilitado antes de presentarlos al SII.
      </Nota>
    </ModalCuaderno>
  );
}

// ─── Modal exportación estados financieros ────────────────────────────────────
export function ModalExportEstados({ isOpen, onClose, vistaActiva }) {
  const { cuentas, saldosPeriodo, saldosAcumulados, saldosAnio, periodoActivo,
          tasaPrimeraCategoria } = useContabilidad();
  // Mismo criterio que la pantalla: balance con saldos acumulados, resultado con
  // los movimientos del período. Antes ambos salían del mismo mes.
  const saldosMap     = saldosAcumulados();
  const saldosMes     = saldosPeriodo();
  const saldosDelAnio = saldosAnio();
  const [estado, setEstado]       = useState("idle");
  const [progreso, setProgreso]   = useState("");
  const [error, setError]         = useState("");
  const [generados, setGenerados] = useState([]);

  const empresa = "MPF Ingeniería Civil SPA";

  const reset = () => { setEstado("idle"); setProgreso(""); setError(""); setGenerados([]); };
  const handleClose = () => { reset(); onClose(); };

  const exportar = useCallback(async (tipo) => {
    setEstado("generando"); setError(""); setGenerados([]);
    try {
      const archivos = [];
      if (tipo === "balance8" || tipo === "todos") {
        setProgreso("Generando Balance 8 Columnas...");
        archivos.push(await generarBalance8PDF(cuentas, saldosMap, periodoActivo, empresa));
      }
      if (tipo === "esf" || tipo === "todos") {
        setProgreso("Generando Estado de Situación Financiera...");
        archivos.push(await generarESFPDF(cuentas, saldosMap, periodoActivo, empresa));
      }
      if (tipo === "erp" || tipo === "todos") {
        setProgreso("Generando Estado de Resultados...");
        archivos.push(await generarERPPDF(cuentas, saldosMes, periodoActivo, empresa, tasaPrimeraCategoria));
      }
      setGenerados(archivos);
      setEstado("listo");
    } catch (e) {
      console.error(e);
      setError(e.message || "Error al generar el PDF.");
      setEstado("error");
    }
  }, [cuentas, saldosMap, saldosMes, saldosDelAnio, periodoActivo, tasaPrimeraCategoria]);

  if (!isOpen) return null;

  const periodo = mesLabel(periodoActivo);

  const OPCIONES = [
    { id:"balance8", title:"Balance 8 Columnas",   desc:"Sumas, saldos, ESF y ERP en una sola tabla" },
    { id:"esf",      title:"Estado de Situación",  desc:"Activos, pasivos y patrimonio al cierre del período" },
    { id:"erp",      title:"Estado de Resultados", desc:"Ingresos, costos y resultado del período" },
    { id:"todos",    title:"Los tres informes",    desc:"Genera los tres PDFs en una sola operación" },
  ];

  // Pre-seleccionar la vista activa si viene del tab actual
  const opcionesMostradas = vistaActiva
    ? [OPCIONES.find(o => o.id === vistaActiva), OPCIONES[3]].filter(Boolean)
    : OPCIONES;

  return (
    <ModalCuaderno
      titulo="Exportar estados financieros"
      subtitulo={`PDF corporativo — ${periodo}`}
      onClose={handleClose}
      pie={
        <div className="flex flex-wrap items-center justify-end gap-3">
          {estado === "listo" && <Boton variante="secundario" onClick={reset}>Exportar otro</Boton>}
          <Boton variante="texto" onClick={handleClose}>Cerrar</Boton>
        </div>
      }>

      <EstadoExport estado={estado} progreso={progreso} error={error} generados={generados} />

      {/* Opciones */}
      {(estado === "idle" || estado === "error") && (
        <>
          <div>
            <ListaOpciones opciones={opcionesMostradas} onElegir={exportar} />
            {vistaActiva && (
              <div className="pt-2">
                <Boton variante="texto" onClick={() => exportar("todos")}>Exportar los tres informes juntos</Boton>
              </div>
            )}
          </div>
          <Nota etiqueta="Ojo:" tono="grafito" className="text-[15px]">
            Estos informes deben ser revisados y firmados por el contador habilitado antes de presentarlos al SII.
          </Nota>
        </>
      )}
    </ModalCuaderno>
  );
}
