import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

/**
 * Genera PDF profesional del Estado de Pago
 * @param {Object} data - Datos para el PDF
 * @param {Object} data.project - Información del proyecto
 * @param {number} data.year - Año
 * @param {number} data.month - Mes
 * @param {Array} data.hourlyMachines - Máquinas por hora
 * @param {Array} data.fixedPriceMachines - Máquinas precio fijo
 * @param {Array} data.mobilizationItems - Items de movilización
 * @param {Array} data.demobilizationItems - Items de desmovilización
 * @param {Array} data.reimbursableItems - Items reembolsables
 * @param {Object} data.grandTotal - Totales
 * @param {number} data.fuelDiscount - Descuento de combustible
 */
export async function generatePaymentStatusPDF(data) {
  const {
    project,
    year,
    month,
    hourlyMachines,
    fixedPriceMachines,
    mobilizationItems,
    demobilizationItems,
    reimbursableItems,
    grandTotal,
    fuelDiscount
  } = data;

  const monthNames = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
  ];

  // Crear documento PDF en formato carta
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'letter'
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;
  let yPosition = margin;

  // ===========================================
  // PÁGINA 1: CARÁTULA PROFESIONAL
  // ===========================================

  // Fondo degradado azul (simulado con rectángulos)
  doc.setFillColor(30, 58, 138); // blue-900
  doc.rect(0, 0, pageWidth, 80, 'F');

  // Logo placeholder (círculo con engranaje)
  doc.setFillColor(255, 255, 255);
  doc.circle(pageWidth / 2, 40, 15, 'F');
  
  // Engranaje (simplificado)
  doc.setFillColor(30, 58, 138);
  doc.circle(pageWidth / 2, 40, 8, 'F');
  doc.setFillColor(255, 255, 255);
  doc.circle(pageWidth / 2, 40, 4, 'F');

  // Título principal
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(32);
  doc.setFont('helvetica', 'bold');
  doc.text('ESTADO DE PAGO', pageWidth / 2, 100, { align: 'center' });

  // Subtítulo
  doc.setFontSize(18);
  doc.setFont('helvetica', 'normal');
  doc.text(`${monthNames[month - 1]} ${year}`, pageWidth / 2, 115, { align: 'center' });

  // Línea decorativa
  doc.setDrawColor(30, 58, 138);
  doc.setLineWidth(2);
  doc.line(pageWidth / 2 - 40, 125, pageWidth / 2 + 40, 125);

  // Información del proyecto
  yPosition = 145;
  doc.setTextColor(51, 65, 85); // slate-700
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('PROYECTO:', margin, yPosition);
  doc.setFont('helvetica', 'normal');
  doc.text(project.name || 'Sin nombre', margin + 35, yPosition);

  yPosition += 10;
  doc.setFont('helvetica', 'bold');
  doc.text('CLIENTE:', margin, yPosition);
  doc.setFont('helvetica', 'normal');
  doc.text(project.client || 'No especificado', margin + 35, yPosition);

  yPosition += 10;
  doc.setFont('helvetica', 'bold');
  doc.text('PERIODO:', margin, yPosition);
  doc.setFont('helvetica', 'normal');
  doc.text(`${monthNames[month - 1]} ${year}`, margin + 35, yPosition);

  yPosition += 10;
  doc.setFont('helvetica', 'bold');
  doc.text('FECHA EMISIÓN:', margin, yPosition);
  doc.setFont('helvetica', 'normal');
  const today = new Date().toLocaleDateString('es-CL', { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });
  doc.text(today, margin + 35, yPosition);

  // Resumen ejecutivo
  yPosition = 195;
  doc.setFillColor(241, 245, 249); // slate-100
  doc.roundedRect(margin, yPosition, pageWidth - 2 * margin, 50, 5, 5, 'F');

  yPosition += 12;
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 58, 138);
  doc.text('RESUMEN EJECUTIVO', pageWidth / 2, yPosition, { align: 'center' });

  yPosition += 15;
  doc.setFontSize(12);
  doc.setTextColor(51, 65, 85);
  doc.setFont('helvetica', 'normal');
  doc.text('Subtotal:', margin + 10, yPosition);
  doc.setFont('helvetica', 'bold');
  doc.text(formatCurrency(grandTotal.subtotal), pageWidth - margin - 10, yPosition, { align: 'right' });

  yPosition += 8;
  doc.setFont('helvetica', 'normal');
  doc.text('IVA (19%):', margin + 10, yPosition);
  doc.setFont('helvetica', 'bold');
  doc.text(formatCurrency(grandTotal.iva), pageWidth - margin - 10, yPosition, { align: 'right' });

  yPosition += 12;
  doc.setDrawColor(30, 58, 138);
  doc.setLineWidth(0.5);
  doc.line(margin + 10, yPosition - 5, pageWidth - margin - 10, yPosition - 5);

  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 58, 138);
  doc.text('TOTAL:', margin + 10, yPosition);
  doc.text(formatCurrency(grandTotal.total), pageWidth - margin - 10, yPosition, { align: 'right' });

  // Footer de carátula
  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139); // slate-500
  doc.setFont('helvetica', 'normal');
  doc.text('MPF Ingeniería Civil SpA', pageWidth / 2, pageHeight - 20, { align: 'center' });
  doc.text('FleetCore - Sistema de Gestión de Flota', pageWidth / 2, pageHeight - 15, { align: 'center' });

  // ===========================================
  // PÁGINA 2: DETALLE DE COSTOS
  // ===========================================
  doc.addPage();
  yPosition = margin;

  // Header de página
  doc.setFillColor(30, 58, 138);
  doc.rect(0, 0, pageWidth, 25, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('DETALLE DE COSTOS', margin, 15);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`${project.name} - ${monthNames[month - 1]} ${year}`, pageWidth - margin, 15, { align: 'right' });

  yPosition = 35;

  // SECCIÓN 1: MAQUINARIA PERMANENTE (POR HORA)
  if (hourlyMachines.length > 0) {
    doc.setFontSize(12);
    doc.setTextColor(30, 58, 138);
    doc.setFont('helvetica', 'bold');
    doc.text('1. MAQUINARIA PERMANENTE (POR HORA)', margin, yPosition);
    yPosition += 8;

    const hourlyData = hourlyMachines.map(m => [
      m.name || m.code,
      formatNumber(m.productiveHours),
      formatCurrency(m.clientRateProductive),
      formatCurrency(m.productiveCost),
      formatNumber(m.standbyHours),
      formatCurrency(m.clientRateStandby),
      formatCurrency(m.standbyCost),
      formatCurrency(m.totalCost)
    ]);

    autoTable(doc, {
      startY: yPosition,
      head: [[
        'Equipo',
        'Hrs Prod.',
        'Tarifa Prod.',
        'Costo Prod.',
        'Hrs Standby',
        'Tarifa Standby',
        'Costo Standby',
        'Total'
      ]],
      body: hourlyData,
      foot: [[
        'SUBTOTAL MAQUINARIA POR HORA',
        '', '', '', '', '', '',
        formatCurrency(grandTotal.hourlyTotal)
      ]],
      theme: 'grid',
      headStyles: {
        fillColor: [30, 58, 138],
        textColor: [255, 255, 255],
        fontSize: 8,
        fontStyle: 'bold',
        halign: 'center'
      },
      bodyStyles: {
        fontSize: 8,
        textColor: [51, 65, 85]
      },
      footStyles: {
        fillColor: [241, 245, 249],
        textColor: [30, 58, 138],
        fontSize: 9,
        fontStyle: 'bold'
      },
      columnStyles: {
        0: { cellWidth: 40 },
        1: { halign: 'center', cellWidth: 15 },
        2: { halign: 'right', cellWidth: 20 },
        3: { halign: 'right', cellWidth: 20 },
        4: { halign: 'center', cellWidth: 15 },
        5: { halign: 'right', cellWidth: 20 },
        6: { halign: 'right', cellWidth: 20 },
        7: { halign: 'right', cellWidth: 25, fontStyle: 'bold' }
      },
      margin: { left: margin, right: margin }
    });

    yPosition = doc.lastAutoTable.finalY + 10;
  }

  // SECCIÓN 2: EQUIPOS CON PRECIO FIJO
  if (fixedPriceMachines.length > 0) {
    if (yPosition > pageHeight - 80) {
      doc.addPage();
      yPosition = 35;
      addPageHeader(doc, project.name, `${monthNames[month - 1]} ${year}`);
    }

    doc.setFontSize(12);
    doc.setTextColor(30, 58, 138);
    doc.setFont('helvetica', 'bold');
    doc.text('2. EQUIPOS CON PRECIO FIJO', margin, yPosition);
    yPosition += 8;

    const fixedData = fixedPriceMachines
      .filter(m => m.totalCost > 0)
      .map(m => [
        m.name || m.code,
        m.billingType === 'daily' ? 'Diario' : 'Mensual',
        formatNumber(m.quantity),
        formatCurrency(m.unitPrice),
        formatCurrency(m.totalCost)
      ]);

    autoTable(doc, {
      startY: yPosition,
      head: [['Equipo', 'Tipo', 'Cantidad', 'Precio Unitario', 'Total']],
      body: fixedData,
      foot: [[
        'SUBTOTAL PRECIO FIJO',
        '', '', '',
        formatCurrency(grandTotal.fixedTotal)
      ]],
      theme: 'grid',
      headStyles: {
        fillColor: [30, 58, 138],
        textColor: [255, 255, 255],
        fontSize: 9,
        fontStyle: 'bold',
        halign: 'center'
      },
      bodyStyles: {
        fontSize: 9,
        textColor: [51, 65, 85]
      },
      footStyles: {
        fillColor: [241, 245, 249],
        textColor: [30, 58, 138],
        fontSize: 9,
        fontStyle: 'bold'
      },
      columnStyles: {
        0: { cellWidth: 70 },
        1: { halign: 'center', cellWidth: 30 },
        2: { halign: 'center', cellWidth: 25 },
        3: { halign: 'right', cellWidth: 30 },
        4: { halign: 'right', cellWidth: 30, fontStyle: 'bold' }
      },
      margin: { left: margin, right: margin }
    });

    yPosition = doc.lastAutoTable.finalY + 10;
  }

  // SECCIÓN 3: MOVILIZACIÓN
  if (mobilizationItems.length > 0) {
    if (yPosition > pageHeight - 60) {
      doc.addPage();
      yPosition = 35;
      addPageHeader(doc, project.name, `${monthNames[month - 1]} ${year}`);
    }

    doc.setFontSize(12);
    doc.setTextColor(30, 58, 138);
    doc.setFont('helvetica', 'bold');
    doc.text('3. MOVILIZACIÓN', margin, yPosition);
    yPosition += 8;

    const mobilizationData = mobilizationItems.map(item => [
      item.description,
      formatCurrency(item.cost)
    ]);

    autoTable(doc, {
      startY: yPosition,
      head: [['Descripción', 'Costo']],
      body: mobilizationData,
      foot: [[
        'SUBTOTAL MOVILIZACIÓN',
        formatCurrency(grandTotal.mobilizationTotal)
      ]],
      theme: 'grid',
      headStyles: {
        fillColor: [30, 58, 138],
        textColor: [255, 255, 255],
        fontSize: 9,
        fontStyle: 'bold'
      },
      bodyStyles: {
        fontSize: 9,
        textColor: [51, 65, 85]
      },
      footStyles: {
        fillColor: [241, 245, 249],
        textColor: [30, 58, 138],
        fontSize: 9,
        fontStyle: 'bold'
      },
      columnStyles: {
        0: { cellWidth: 130 },
        1: { halign: 'right', cellWidth: 40, fontStyle: 'bold' }
      },
      margin: { left: margin, right: margin }
    });

    yPosition = doc.lastAutoTable.finalY + 10;
  }

  // SECCIÓN 4: DESMOVILIZACIÓN
  if (demobilizationItems.length > 0) {
    if (yPosition > pageHeight - 60) {
      doc.addPage();
      yPosition = 35;
      addPageHeader(doc, project.name, `${monthNames[month - 1]} ${year}`);
    }

    doc.setFontSize(12);
    doc.setTextColor(30, 58, 138);
    doc.setFont('helvetica', 'bold');
    doc.text('4. DESMOVILIZACIÓN', margin, yPosition);
    yPosition += 8;

    const demobilizationData = demobilizationItems.map(item => [
      item.description,
      formatCurrency(item.cost)
    ]);

    autoTable(doc, {
      startY: yPosition,
      head: [['Descripción', 'Costo']],
      body: demobilizationData,
      foot: [[
        'SUBTOTAL DESMOVILIZACIÓN',
        formatCurrency(grandTotal.demobilizationTotal)
      ]],
      theme: 'grid',
      headStyles: {
        fillColor: [30, 58, 138],
        textColor: [255, 255, 255],
        fontSize: 9,
        fontStyle: 'bold'
      },
      bodyStyles: {
        fontSize: 9,
        textColor: [51, 65, 85]
      },
      footStyles: {
        fillColor: [241, 245, 249],
        textColor: [30, 58, 138],
        fontSize: 9,
        fontStyle: 'bold'
      },
      columnStyles: {
        0: { cellWidth: 130 },
        1: { halign: 'right', cellWidth: 40, fontStyle: 'bold' }
      },
      margin: { left: margin, right: margin }
    });

    yPosition = doc.lastAutoTable.finalY + 10;
  }

  // SECCIÓN 5: GASTOS REEMBOLSABLES
  if (reimbursableItems.length > 0) {
    if (yPosition > pageHeight - 60) {
      doc.addPage();
      yPosition = 35;
      addPageHeader(doc, project.name, `${monthNames[month - 1]} ${year}`);
    }

    doc.setFontSize(12);
    doc.setTextColor(30, 58, 138);
    doc.setFont('helvetica', 'bold');
    doc.text('5. GASTOS REEMBOLSABLES', margin, yPosition);
    yPosition += 8;

    const reimbursableData = reimbursableItems.map(item => [
      item.description,
      formatCurrency(item.cost)
    ]);

    autoTable(doc, {
      startY: yPosition,
      head: [['Descripción', 'Costo']],
      body: reimbursableData,
      foot: [[
        'SUBTOTAL REEMBOLSABLES',
        formatCurrency(grandTotal.reimbursableTotal)
      ]],
      theme: 'grid',
      headStyles: {
        fillColor: [30, 58, 138],
        textColor: [255, 255, 255],
        fontSize: 9,
        fontStyle: 'bold'
      },
      bodyStyles: {
        fontSize: 9,
        textColor: [51, 65, 85]
      },
      footStyles: {
        fillColor: [241, 245, 249],
        textColor: [30, 58, 138],
        fontSize: 9,
        fontStyle: 'bold'
      },
      columnStyles: {
        0: { cellWidth: 130 },
        1: { halign: 'right', cellWidth: 40, fontStyle: 'bold' }
      },
      margin: { left: margin, right: margin }
    });

    yPosition = doc.lastAutoTable.finalY + 10;
  }

  // SECCIÓN 6: DESCUENTO COMBUSTIBLE
  if (fuelDiscount < 0) {
    if (yPosition > pageHeight - 60) {
      doc.addPage();
      yPosition = 35;
      addPageHeader(doc, project.name, `${monthNames[month - 1]} ${year}`);
    }

    doc.setFontSize(12);
    doc.setTextColor(30, 58, 138);
    doc.setFont('helvetica', 'bold');
    doc.text('6. DESCUENTO COMBUSTIBLE', margin, yPosition);
    yPosition += 8;

    autoTable(doc, {
      startY: yPosition,
      head: [['Descripción', 'Monto']],
      body: [['Descuento por combustible del mes', formatCurrency(fuelDiscount)]],
      theme: 'grid',
      headStyles: {
        fillColor: [30, 58, 138],
        textColor: [255, 255, 255],
        fontSize: 9,
        fontStyle: 'bold'
      },
      bodyStyles: {
        fontSize: 9,
        textColor: [220, 38, 38] // red-600
      },
      columnStyles: {
        0: { cellWidth: 130 },
        1: { halign: 'right', cellWidth: 40, fontStyle: 'bold' }
      },
      margin: { left: margin, right: margin }
    });

    yPosition = doc.lastAutoTable.finalY + 10;
  }

  // ===========================================
  // RESUMEN FINAL
  // ===========================================
  if (yPosition > pageHeight - 80) {
    doc.addPage();
    yPosition = 35;
    addPageHeader(doc, project.name, `${monthNames[month - 1]} ${year}`);
  }

  yPosition += 10;
  doc.setFillColor(30, 58, 138);
  doc.roundedRect(margin, yPosition, pageWidth - 2 * margin, 50, 3, 3, 'F');

  yPosition += 12;
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text('RESUMEN FINANCIERO', pageWidth / 2, yPosition, { align: 'center' });

  yPosition += 12;
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text('Subtotal:', margin + 10, yPosition);
  doc.setFont('helvetica', 'bold');
  doc.text(formatCurrency(grandTotal.subtotal), pageWidth - margin - 10, yPosition, { align: 'right' });

  yPosition += 8;
  doc.setFont('helvetica', 'normal');
  doc.text('IVA (19%):', margin + 10, yPosition);
  doc.setFont('helvetica', 'bold');
  doc.text(formatCurrency(grandTotal.iva), pageWidth - margin - 10, yPosition, { align: 'right' });

  yPosition += 12;
  doc.setDrawColor(255, 255, 255);
  doc.setLineWidth(0.5);
  doc.line(margin + 10, yPosition - 5, pageWidth - margin - 10, yPosition - 5);

  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('TOTAL A PAGAR:', margin + 10, yPosition);
  doc.text(formatCurrency(grandTotal.total), pageWidth - margin - 10, yPosition, { align: 'right' });

  // Footer en cada página
  const totalPages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.setFont('helvetica', 'normal');
    doc.text(
      `Página ${i} de ${totalPages}`,
      pageWidth / 2,
      pageHeight - 10,
      { align: 'center' }
    );
  }

  // Guardar PDF
  const fileName = `Estado_Pago_${project.name}_${monthNames[month - 1]}_${year}.pdf`;
  doc.save(fileName);
}

// Función auxiliar para agregar header en páginas adicionales
function addPageHeader(doc, projectName, period) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 20;
  
  doc.setFillColor(30, 58, 138);
  doc.rect(0, 0, pageWidth, 25, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('DETALLE DE COSTOS', margin, 15);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`${projectName} - ${period}`, pageWidth - margin, 15, { align: 'right' });
}

// Función auxiliar para formatear moneda
function formatCurrency(value) {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    minimumFractionDigits: 0
  }).format(value || 0);
}

// Función auxiliar para formatear números
function formatNumber(value) {
  return (value || 0).toLocaleString('es-CL', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  });
}
