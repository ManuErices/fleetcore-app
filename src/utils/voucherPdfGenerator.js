/**
 * Generador de Voucher de Entrega de Combustible en formato PDF
 * Basado en el formato RQ-120-41
 */

import jsPDF from 'jspdf';

/**
 * Genera un voucher de entrega de combustible en formato PDF
 * @param {Object} params - Parámetros del voucher
 * @param {Object} params.reportData - Datos del reporte
 * @param {string} params.projectName - Nombre del proyecto
 * @param {Object} params.machineInfo - Información de la máquina
 * @param {Object} params.operadorInfo - Información del operador
 * @param {Object} params.empresaInfo - Información de la empresa (opcional)
 * @returns {Promise<Blob>} Blob del archivo PDF
 */
export async function generateVoucherPDF({ 
  reportData, 
  projectName, 
  machineInfo, 
  operadorInfo,
  empresaInfo 
}) {
  // Crear documento PDF tamaño carta
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'letter'
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;

  // Función auxiliar para dibujar rectángulos con borde
  const drawBox = (x, y, width, height, fill = false) => {
    doc.setLineWidth(0.5);
    doc.setDrawColor(0, 0, 0);
    if (fill) {
      doc.setFillColor(211, 211, 211);
      doc.rect(x, y, width, height, 'FD');
    } else {
      doc.rect(x, y, width, height);
    }
  };

  // Función para agregar texto centrado
  const addCenteredText = (text, y, fontSize = 12, bold = false) => {
    doc.setFontSize(fontSize);
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    const textWidth = doc.getTextWidth(text);
    doc.text(text, (pageWidth - textWidth) / 2, y);
  };

  // Función para formatear fecha
  const formatDate = (dateStr) => {
    try {
      const [year, month, day] = dateStr.split('-');
      return `${day}/${month}/${year}`;
    } catch (e) {
      return dateStr;
    }
  };

  // === ENCABEZADO ===
  
  // N° de voucher (esquina superior derecha)
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('N°', pageWidth - 40, 15);
  
  drawBox(pageWidth - 30, 10, 25, 8);
  doc.setFontSize(12);
  doc.text(reportData.numeroReporte || '', pageWidth - 27, 16);

  // Información de la empresa (izquierda)
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('MPF Ingeniería Civil SPA', margin, 25);
  
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('RUT: 77.158.216-8', margin, 31);
  doc.text('Av. Pedro Montt 2365, Valdivia', margin, 36);
  doc.text('www.mpfingenieria.cl', margin, 41);

  // Código del documento (derecha del encabezado)
  doc.setFontSize(8);
  doc.text('CÓDIGO: RQ-120-41', pageWidth - 60, 25);
  doc.text('Revisión: 01/07/2024', pageWidth - 60, 30);

  // === TÍTULO PRINCIPAL ===
  
  const titleY = 55;
  const titleHeight = 12;
  
  // Caja del título con fondo gris
  doc.setFillColor(211, 211, 211);
  doc.rect(margin, titleY, pageWidth - 2 * margin, titleHeight, 'FD');
  
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  addCenteredText('COMPROBANTE PARA ENTREGA DE COMBUSTIBLE', titleY + 8);

  // === DATOS DEL CONTRATO ===
  
  let currentY = titleY + titleHeight + 10;

  // Nombre del contrato - Header
  drawBox(margin, currentY, pageWidth - 2 * margin, 10);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('NOMBRE DEL CONTRATO:', margin + 2, currentY + 4);
  doc.text('(CENTRO DE OPERACIÓN)', margin + 2, currentY + 8);

  currentY += 10;

  // Nombre del contrato - Valor
  drawBox(margin, currentY, pageWidth - 2 * margin, 8);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  addCenteredText(projectName || '', currentY + 6);

  currentY += 8;

  // === FECHA Y HORA ===
  
  const fechaFormateada = formatDate(reportData.fecha || '');
  const horaActual = reportData.hora || new Date().toLocaleTimeString('es-CL', { 
    hour: '2-digit', 
    minute: '2-digit',
    hour12: false 
  });

  // Fecha
  const col1Width = (pageWidth - 2 * margin) * 0.4;
  const col2Width = (pageWidth - 2 * margin) * 0.3;
  const col3Width = (pageWidth - 2 * margin) * 0.3;

  drawBox(margin, currentY, col1Width, 8);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('FECHA CARGA COMBUSTIBLE:', margin + 2, currentY + 5);

  drawBox(margin + col1Width, currentY, col2Width - 5, 8);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(fechaFormateada, margin + col1Width + 2, currentY + 5);

  // Hora
  drawBox(margin + col1Width + col2Width - 5, currentY, 35, 8);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('HORA CARGA COMBUSTIBLE:', margin + col1Width + col2Width - 3, currentY + 5);

  drawBox(margin + col1Width + col2Width + 30, currentY, col3Width - 25, 8);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(horaActual, margin + col1Width + col2Width + 32, currentY + 5);

  currentY += 8;

  // === DATOS DEL OPERADOR ===

  // Chofer u operador
  drawBox(margin, currentY, col1Width, 8);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('CHOFER U OPERADOR:', margin + 2, currentY + 5);

  drawBox(margin + col1Width, currentY, pageWidth - 2 * margin - col1Width, 8);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(operadorInfo?.nombre || '', margin + col1Width + 2, currentY + 5);

  currentY += 8;

  // RUT
  drawBox(margin, currentY, col1Width, 8);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('RUT:', margin + 2, currentY + 5);

  drawBox(margin + col1Width, currentY, pageWidth - 2 * margin - col1Width, 8);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(operadorInfo?.rut || '', margin + col1Width + 2, currentY + 5);

  currentY += 8;

  // === DATOS DE LA MÁQUINA ===

  // Patente / Código interno
  const patenteWidth = (pageWidth - 2 * margin) * 0.7;
  
  drawBox(margin, currentY, col1Width, 8);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('PATENTE / CÓDIGO INTERNO:', margin + 2, currentY + 5);

  drawBox(margin + col1Width, currentY, patenteWidth - col1Width, 8);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  const patenteyCodigo = `${machineInfo?.patente || ''} / ${machineInfo?.codigo || ''}`;
  doc.text(patenteyCodigo, margin + col1Width + 2, currentY + 5);

  // Cantidad de Lts - Header
  drawBox(margin + patenteWidth, currentY, pageWidth - 2 * margin - patenteWidth, 8);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  const cantidadText = 'CANTIDAD DE Lts.';
  const cantidadTextWidth = doc.getTextWidth(cantidadText);
  doc.text(cantidadText, margin + patenteWidth + (pageWidth - 2 * margin - patenteWidth - cantidadTextWidth) / 2, currentY + 5);

  currentY += 8;

  // Kilometraje / Horómetro
  drawBox(margin, currentY, col1Width, 8);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('KILOMETRAJE / HOROMETRO:', margin + 2, currentY + 5);

  drawBox(margin + col1Width, currentY, patenteWidth - col1Width, 8);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text(reportData.horometroOdometro || '', margin + col1Width + 2, currentY + 5);

  // Cantidad de Lts - VALOR (destacado en amarillo)
  doc.setFillColor(255, 255, 0); // Amarillo
  doc.rect(margin + patenteWidth, currentY, pageWidth - 2 * margin - patenteWidth, 8, 'FD');
  
  doc.setTextColor(255, 0, 0); // Rojo
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  const litrosValue = reportData.cantidadLitros || '';
  const litrosValueWidth = doc.getTextWidth(litrosValue);
  doc.text(litrosValue, margin + patenteWidth + (pageWidth - 2 * margin - patenteWidth - litrosValueWidth) / 2, currentY + 6);
  
  doc.setTextColor(0, 0, 0); // Volver a negro

  currentY += 8;

  // Tipo de combustible
  drawBox(margin, currentY, col1Width, 8);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('TIPO DE COMBUSTIBLE', margin + 2, currentY + 5);

  drawBox(margin + col1Width, currentY, pageWidth - 2 * margin - col1Width, 8);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('PETRÓLEO DIESEL', margin + col1Width + 2, currentY + 5);

  currentY += 8;

  // === SECCIÓN DE FIRMAS ===

  currentY += 10; // Espacio antes de las firmas

  const firmaWidth = (pageWidth - 2 * margin - 10) / 2;
  
  // Insertar firmas si existen
  try {
    // Firma del operador (receptor)
    if (reportData.firmaReceptor) {
      const firmaReceptorData = reportData.firmaReceptor.includes(',') 
        ? reportData.firmaReceptor.split(',')[1] 
        : reportData.firmaReceptor;
      
      doc.addImage(
        firmaReceptorData,
        'PNG',
        margin + 5,
        currentY,
        firmaWidth - 10,
        25
      );
    }

    // Firma autorizada (repartidor)
    if (reportData.firmaRepartidor) {
      const firmaRepartidorData = reportData.firmaRepartidor.includes(',') 
        ? reportData.firmaRepartidor.split(',')[1] 
        : reportData.firmaRepartidor;
      
      doc.addImage(
        firmaRepartidorData,
        'PNG',
        margin + firmaWidth + 5,
        currentY,
        firmaWidth - 10,
        25
      );
    }
  } catch (error) {
    console.warn('No se pudieron insertar las firmas:', error);
  }

  currentY += 30;

  // Líneas y títulos de las firmas
  doc.setLineWidth(0.5);
  
  // Línea firma operador
  doc.line(margin, currentY, margin + firmaWidth, currentY);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  const firmaOperadorText = 'FIRMA CHOFER U OPERADOR';
  const firmaOperadorWidth = doc.getTextWidth(firmaOperadorText);
  doc.text(firmaOperadorText, margin + (firmaWidth - firmaOperadorWidth) / 2, currentY + 4);

  // Línea firma autorizada
  doc.line(margin + firmaWidth + 10, currentY, pageWidth - margin, currentY);
  const firmaAutorizadaText = 'FIRMA AUTORIZADA';
  const firmaAutorizadaWidth = doc.getTextWidth(firmaAutorizadaText);
  doc.text(firmaAutorizadaText, margin + firmaWidth + 10 + (firmaWidth - firmaAutorizadaWidth) / 2, currentY + 4);

  // Generar el blob del PDF
  const pdfBlob = doc.output('blob');
  return pdfBlob;
}
