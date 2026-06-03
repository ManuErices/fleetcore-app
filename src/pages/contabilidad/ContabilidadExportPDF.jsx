import React, { useState, useCallback } from "react";
import { useContabilidad, fmt, MESES } from "./ContabilidadContext";

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

function calcularERP(cuentas, saldosMap) {
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
  const impuesto   = Math.max(0, utilAntes * 0.27);
  return { ingresos, costos, gastosAdm, gastosFin, otros,
    totalIng, totalCosto, utilBruta, totalGAdm, utilOp,
    totalGFin, totalOtros, utilAntes, impuesto, utilNeta: utilAntes - impuesto };
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
async function generarERPPDF(cuentas, saldosMap, periodoActivo, empresa) {
  const jsPDF  = await cargarJsPDF();
  const doc    = new jsPDF({ orientation:"portrait", unit:"mm", format:"a4" });
  const W      = doc.internal.pageSize.getWidth();
  const TITULO = "ESTADO DE RESULTADOS DEL PERÍODO";
  const SUB    = "Rendimiento económico — Base devengada — NIC 1 / IFRS — Art. 29–33 LIR";
  const erp    = calcularERP(cuentas, saldosMap);

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
    fila("RESULTADO ANTES DE IMPUESTO", erp.utilAntes, true),
    fila("Impuesto 1ª Categoría (27%)", erp.impuesto, false),
    [{content:"",colSpan:2}],
    fila("RESULTADO DEL PERÍODO", erp.utilNeta, true, NAVY),
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
  const margen = erp.totalIng > 0 ? ((erp.utilNeta/erp.totalIng)*100).toFixed(1) : "—";
  const pageH  = doc.internal.pageSize.getHeight();
  const tot    = doc.internal.getNumberOfPages();
  for (let p=1;p<=tot;p++) {
    doc.setPage(p);
    agregarHead(p,tot);
    if (p === tot) {
      doc.setFillColor(...NAVY); doc.rect(0, pageH-14, W, 14, "F");
      doc.setTextColor(147,197,253); doc.setFont("helvetica","bold"); doc.setFontSize(7.5);
      doc.text(`Margen neto del período: ${margen}%  ·  Ingresos: $${fmtPDF(erp.totalIng)}  ·  Resultado: ${fmtR(erp.utilNeta)}`, W/2, pageH-7.5, {align:"center"});
    }
  }
  const fn = `Estado_Resultados_${periodoActivo}.pdf`; doc.save(fn); return fn;
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(2,6,23,0.75)", backdropFilter: "blur(6px)" }}>
      <div className="w-full max-w-md" style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>
        <div className="bg-white rounded-3xl overflow-hidden shadow-2xl">

          {/* Header */}
          <div className="relative overflow-hidden px-6 pt-6 pb-5"
            style={{ background: "linear-gradient(135deg, #0f172a 0%, #1e3a5f 60%, #1d4ed8 100%)" }}>
            <div className="absolute inset-0 opacity-20"
              style={{ backgroundImage: "radial-gradient(circle at 80% 20%, #60a5fa 0%, transparent 50%)" }} />
            <div className="relative flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl flex items-center justify-center text-xl"
                  style={{ background: "rgba(255,255,255,0.12)" }}>📄</div>
                <div>
                  <h2 className="text-white font-black text-lg tracking-tight">Exportar libros contables</h2>
                  <p className="text-blue-300 text-xs mt-0.5">Formato PDF para fiscalización SII</p>
                </div>
              </div>
              <button onClick={handleClose}
                className="w-8 h-8 rounded-xl flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-all">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="p-6 space-y-4">

            {/* Info período */}
            <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-2xl">
              <span className="text-2xl">📅</span>
              <div>
                <p className="text-xs font-black text-slate-700">Período: {periodo}</p>
                <p className="text-[10px] text-slate-400">
                  {nAsientos} asientos · {nCuentas} cuentas activas
                </p>
              </div>
            </div>

            {/* Estado generando */}
            {estado === "generando" && (
              <div className="py-6 text-center space-y-3">
                <div className="w-12 h-12 rounded-2xl mx-auto flex items-center justify-center text-2xl"
                  style={{ background: "linear-gradient(135deg, #1e3a5f, #1d4ed8)" }}>📊</div>
                <p className="font-black text-slate-800">{progreso}</p>
                <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden mx-auto max-w-xs">
                  <div className="h-2 rounded-full animate-pulse"
                    style={{ width: "60%", background: "linear-gradient(90deg, #3b82f6, #6366f1)" }} />
                </div>
              </div>
            )}

            {/* Estado listo */}
            {estado === "listo" && (
              <div className="py-4 text-center space-y-3">
                <div className="w-12 h-12 rounded-2xl mx-auto flex items-center justify-center text-2xl bg-emerald-100">✅</div>
                <p className="font-black text-slate-800">¡PDFs generados!</p>
                <div className="space-y-1.5">
                  {generados.map(f => (
                    <div key={f} className="flex items-center gap-2 p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl">
                      <span className="text-emerald-600 text-sm">📄</span>
                      <p className="text-xs font-semibold text-emerald-800">{f}</p>
                      <span className="text-[10px] text-emerald-600 ml-auto">Descargado</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Estado error */}
            {estado === "error" && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-2xl">
                <p className="text-xs text-red-700 font-semibold">⚠ {error}</p>
              </div>
            )}

            {/* Opciones (solo en idle o error) */}
            {(estado === "idle" || estado === "error") && (
              <div className="space-y-2">
                {[
                  { id:"diario", icon:"📒", title:"Libro Diario", desc:"Todos los asientos del período en orden cronológico", color:"from-indigo-700 to-blue-600" },
                  { id:"mayor",  icon:"📊", title:"Libro Mayor",  desc:"Movimientos agrupados por cuenta contable con saldos", color:"from-teal-700 to-emerald-600" },
                  { id:"ambos",  icon:"📁", title:"Ambos libros", desc:"Genera los dos PDFs en una sola operación", color:"from-slate-800 to-indigo-700" },
                ].map(opt => (
                  <button key={opt.id} onClick={() => exportar(opt.id)}
                    className="w-full flex items-center gap-3 p-4 rounded-2xl text-left transition-all hover:scale-[1.01] active:scale-[0.99] shadow-sm hover:shadow-md"
                    style={{ background: `linear-gradient(135deg, var(--tw-gradient-stops))` }}
                  >
                    <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${opt.color} flex items-center justify-center text-xl shadow-md`}>
                      {opt.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-black text-slate-800">{opt.title}</p>
                      <p className="text-[10px] text-slate-500 mt-0.5">{opt.desc}</p>
                    </div>
                    <svg className="w-4 h-4 text-slate-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
                    </svg>
                  </button>
                ))}
              </div>
            )}

            {/* Advertencia legal */}
            <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl">
              <span className="text-amber-500 text-sm mt-0.5 flex-shrink-0">⚠️</span>
              <p className="text-[10px] text-amber-700 leading-relaxed">
                Estos libros se generan desde los asientos registrados en el sistema.
                Deben ser revisados y firmados por el contador habilitado antes de presentarlos al SII.
              </p>
            </div>

            {estado === "listo" && (
              <button onClick={reset}
                className="w-full py-2.5 rounded-2xl border-2 border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50 transition-all">
                Exportar otro libro
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Modal exportación estados financieros ────────────────────────────────────
export function ModalExportEstados({ isOpen, onClose, vistaActiva }) {
  const { cuentas, saldos, periodoActivo } = useContabilidad();
  const saldosMap = saldos();
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
        archivos.push(await generarERPPDF(cuentas, saldosMap, periodoActivo, empresa));
      }
      setGenerados(archivos);
      setEstado("listo");
    } catch (e) {
      console.error(e);
      setError(e.message || "Error al generar el PDF.");
      setEstado("error");
    }
  }, [cuentas, saldosMap, periodoActivo]);

  if (!isOpen) return null;

  const periodo = mesLabel(periodoActivo);

  const OPCIONES = [
    { id:"balance8", icon:"📋", title:"Balance 8 Columnas",           desc:"Sumas, saldos, ESF y ERP en una sola tabla",         color:"from-indigo-700 to-blue-600" },
    { id:"esf",      icon:"🏦", title:"Estado de Situación",           desc:"Activos, pasivos y patrimonio al cierre del período", color:"from-teal-700 to-emerald-600" },
    { id:"erp",      icon:"📈", title:"Estado de Resultados",          desc:"Ingresos, costos y resultado del período",           color:"from-amber-700 to-orange-600" },
    { id:"todos",    icon:"📁", title:"Los tres informes",             desc:"Genera los tres PDFs en una sola operación",         color:"from-slate-800 to-indigo-700" },
  ];

  // Pre-seleccionar la vista activa si viene del tab actual
  const opcionesMostradas = vistaActiva
    ? [OPCIONES.find(o => o.id === vistaActiva), OPCIONES[3]].filter(Boolean)
    : OPCIONES;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background:"rgba(2,6,23,0.75)", backdropFilter:"blur(6px)" }}>
      <div className="w-full max-w-md" style={{ fontFamily:"'DM Sans', system-ui, sans-serif" }}>
        <div className="bg-white rounded-3xl overflow-hidden shadow-2xl">

          {/* Header */}
          <div className="relative overflow-hidden px-6 pt-6 pb-5"
            style={{ background:"linear-gradient(135deg,#0f172a 0%,#1e3a5f 60%,#1d4ed8 100%)" }}>
            <div className="absolute inset-0 opacity-20"
              style={{ backgroundImage:"radial-gradient(circle at 80% 20%,#60a5fa 0%,transparent 50%)" }}/>
            <div className="relative flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl flex items-center justify-center text-xl"
                  style={{ background:"rgba(255,255,255,0.12)" }}>📊</div>
                <div>
                  <h2 className="text-white font-black text-lg tracking-tight">Exportar Estados Financieros</h2>
                  <p className="text-blue-300 text-xs mt-0.5">PDF corporativo — {periodo}</p>
                </div>
              </div>
              <button onClick={handleClose}
                className="w-8 h-8 rounded-xl flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-all">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            </div>
          </div>

          <div className="p-6 space-y-4">

            {/* Generando */}
            {estado === "generando" && (
              <div className="py-6 text-center space-y-3">
                <div className="w-12 h-12 rounded-2xl mx-auto flex items-center justify-center text-2xl"
                  style={{ background:"linear-gradient(135deg,#1e3a5f,#1d4ed8)" }}>📊</div>
                <p className="font-black text-slate-800">{progreso}</p>
                <div className="w-full bg-slate-100 rounded-full h-2 max-w-xs mx-auto overflow-hidden">
                  <div className="h-2 rounded-full animate-pulse"
                    style={{ width:"60%", background:"linear-gradient(90deg,#3b82f6,#6366f1)" }}/>
                </div>
              </div>
            )}

            {/* Listo */}
            {estado === "listo" && (
              <div className="py-4 text-center space-y-3">
                <div className="w-12 h-12 rounded-2xl mx-auto flex items-center justify-center text-2xl bg-emerald-100">✅</div>
                <p className="font-black text-slate-800">¡PDFs generados!</p>
                <div className="space-y-1.5">
                  {generados.map(f => (
                    <div key={f} className="flex items-center gap-2 p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl">
                      <span className="text-emerald-600">📄</span>
                      <p className="text-xs font-semibold text-emerald-800 truncate">{f}</p>
                      <span className="text-[10px] text-emerald-600 ml-auto flex-shrink-0">Descargado</span>
                    </div>
                  ))}
                </div>
                <button onClick={reset}
                  className="px-5 py-2 rounded-xl border-2 border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50 transition-all">
                  Exportar otro
                </button>
              </div>
            )}

            {/* Error */}
            {estado === "error" && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-2xl">
                <p className="text-xs text-red-700 font-semibold">⚠ {error}</p>
              </div>
            )}

            {/* Opciones */}
            {(estado === "idle" || estado === "error") && (
              <>
                <div className="space-y-2">
                  {opcionesMostradas.map(opt => (
                    <button key={opt.id} onClick={() => exportar(opt.id)}
                      className="w-full flex items-center gap-3 p-4 rounded-2xl border-2 border-slate-100 text-left hover:border-slate-200 hover:bg-slate-50 transition-all group">
                      <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${opt.color} flex items-center justify-center text-xl shadow-md flex-shrink-0`}>
                        {opt.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-black text-slate-800">{opt.title}</p>
                        <p className="text-[10px] text-slate-500 mt-0.5">{opt.desc}</p>
                      </div>
                      <svg className="w-4 h-4 text-slate-400 flex-shrink-0 group-hover:text-slate-600 transition-colors"
                        fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
                      </svg>
                    </button>
                  ))}
                  {vistaActiva && (
                    <button onClick={() => exportar("todos")}
                      className="w-full flex items-center gap-3 p-3 rounded-2xl border border-dashed border-slate-300 text-left hover:border-indigo-300 hover:bg-indigo-50/30 transition-all">
                      <span className="text-lg">📁</span>
                      <p className="text-xs font-bold text-slate-500">Exportar los tres informes juntos</p>
                    </button>
                  )}
                </div>
                <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                  <span className="text-amber-500 flex-shrink-0">⚠️</span>
                  <p className="text-[10px] text-amber-700">Estos informes deben ser revisados y firmados por el contador habilitado antes de presentarlos al SII.</p>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
