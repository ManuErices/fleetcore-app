/**
 * htmlToPdf.js — Convierte HTML crudo (el que producen los generadores de
 * pdfs.jsx con { returnHtml: true }) en un Blob PDF real, listo para enviar
 * a ValidaFirma.
 *
 * Los generadores de RRHH devuelven HTML, no PDF. ValidaFirma necesita un
 * PDF de verdad (application/pdf), así que rasterizamos el HTML con
 * html2canvas y lo paginamos en un PDF A4 con jsPDF.
 *
 * Uso:
 *   const html = generarPDFContrato(contrato, trabajador, { returnHtml: true });
 *   const pdfBlob = await htmlToPdfBlob(html, 'Contrato.pdf');
 *
 * Nota de fidelidad: html2canvas rasteriza (el PDF resultante es imagen, no
 * texto seleccionable). Es suficiente para el flujo de firma FES. Si en el
 * futuro se necesita texto vectorial/multipágina perfecto, migrar a una
 * Cloud Function con Puppeteer — el resto del código solo depende de que
 * esta función devuelva un Blob PDF.
 */

import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';

// A4 en puntos (jsPDF unit 'pt'): 595.28 x 841.89
const A4_W = 595.28;
const A4_H = 841.89;

/**
 * Renderiza `html` en un iframe aislado fuera de pantalla, lo captura con
 * html2canvas y lo pagina en un PDF A4.
 * @param {string} html  documento HTML completo (<!DOCTYPE html>…)
 * @param {string} filename  nombre lógico (se refleja en metadata del PDF)
 * @returns {Promise<Blob>} Blob application/pdf
 */
export async function htmlToPdfBlob(html, filename = 'documento.pdf') {
  if (!html || typeof html !== 'string') {
    throw new Error('htmlToPdfBlob: se requiere el HTML del documento');
  }

  // Iframe aislado: evita que los estilos del documento contaminen la app y
  // viceversa. width fijo a ~794px (≈ A4 a 96dpi) para que el layout calce.
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.left = '-10000px';
  iframe.style.top = '0';
  iframe.style.width = '794px';
  iframe.style.height = '1123px';
  iframe.style.border = '0';
  iframe.setAttribute('aria-hidden', 'true');
  document.body.appendChild(iframe);

  try {
    const idoc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!idoc) throw new Error('No se pudo inicializar el render del documento');

    idoc.open();
    idoc.write(html);
    idoc.close();

    // Esperar a que carguen fuentes/imágenes del iframe antes de capturar.
    await waitForIframeReady(iframe);

    const body = idoc.body;
    // Ancho real del contenido para escalar bien la captura.
    const contentWidth = Math.max(body.scrollWidth, 794);

    const canvas = await html2canvas(body, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      windowWidth: contentWidth,
      width: contentWidth,
    });

    const pdf = new jsPDF({ unit: 'pt', format: 'a4', compress: true });

    // Escalar el ancho de la imagen al ancho útil de la página (con margen 0:
    // el HTML ya trae su propio padding). Paginamos por alto.
    const imgW = A4_W;
    const imgH = (canvas.height * imgW) / canvas.width;

    let heightLeft = imgH;
    let position = 0;
    const imgData = canvas.toDataURL('image/jpeg', 0.92);

    pdf.addImage(imgData, 'JPEG', 0, position, imgW, imgH, undefined, 'FAST');
    heightLeft -= A4_H;

    while (heightLeft > 0) {
      position -= A4_H;
      pdf.addPage();
      pdf.addImage(imgData, 'JPEG', 0, position, imgW, imgH, undefined, 'FAST');
      heightLeft -= A4_H;
    }

    if (filename) {
      try { pdf.setProperties({ title: filename.replace(/\.pdf$/i, '') }); } catch { /* noop */ }
    }

    return pdf.output('blob');
  } finally {
    // Siempre limpiar el iframe, aunque falle la captura.
    if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
  }
}

// Espera a que el documento del iframe esté listo (fuentes + imágenes).
function waitForIframeReady(iframe) {
  return new Promise((resolve) => {
    const idoc = iframe.contentDocument;
    const win = iframe.contentWindow;

    const done = async () => {
      try {
        if (idoc?.fonts?.ready) await idoc.fonts.ready;
      } catch { /* noop */ }
      // Un frame extra para asegurar layout final.
      (win?.requestAnimationFrame || window.requestAnimationFrame)(() =>
        setTimeout(resolve, 60)
      );
    };

    if (idoc?.readyState === 'complete') {
      done();
    } else {
      win?.addEventListener('load', done, { once: true });
      // Fallback por si 'load' no dispara (documento sin recursos externos).
      setTimeout(done, 400);
    }
  });
}

export default { htmlToPdfBlob };
