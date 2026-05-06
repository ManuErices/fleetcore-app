// ============================================================
// FLEETCORE — EMAIL TEMPLATES
// functions/email-templates.js
//
// Cada función exporta { subject, html, text }.
// Templates basados en <table> para compatibilidad Outlook/Gmail.
// Branding verde FleetCore. Logo desde /logo-fleetcore.png en hosting.
// ============================================================

const BRAND = {
  primary: '#16a34a',     // green-600
  primaryDark: '#15803d', // green-700
  bg: '#f0fdf4',          // green-50
  text: '#0f172a',         // slate-900
  textMuted: '#475569',   // slate-600
  border: '#bbf7d0',      // green-200
  logo: 'https://fleetcore.cl/logo-fleetcore.png',
};

const APP_URL = process.env.APP_URL || 'https://fleetcore.cl';

function escape(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function fmtLitros(n) {
  const num = Number(n);
  if (!isFinite(num)) return String(n ?? '');
  return num.toLocaleString('es-CL') + ' L';
}

function fmtFecha(iso) {
  if (!iso) return '';
  try {
    const d = typeof iso === 'string' ? new Date(iso) : iso?.toDate?.() || new Date(iso);
    return d.toLocaleString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return String(iso); }
}

function baseLayout({ title, preheader, contentHtml, ctaUrl, ctaLabel }) {
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escape(title)}</title></head>
<body style="margin:0;padding:0;background:${BRAND.bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${BRAND.text};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escape(preheader || title)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BRAND.bg};padding:24px 12px;">
  <tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.06);">
      <tr><td style="background:linear-gradient(135deg,${BRAND.primary},${BRAND.primaryDark});padding:24px 28px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
          <td style="vertical-align:middle;">
            <div style="font-size:20px;font-weight:800;color:#ffffff;letter-spacing:.3px;">FleetCore</div>
            <div style="font-size:12px;color:#dcfce7;margin-top:2px;">Notificación automática</div>
          </td>
          <td align="right" style="vertical-align:middle;">
            <span style="display:inline-block;background:rgba(255,255,255,.18);color:#ffffff;font-size:11px;font-weight:700;letter-spacing:.5px;padding:6px 10px;border-radius:999px;text-transform:uppercase;">${escape(title)}</span>
          </td>
        </tr></table>
      </td></tr>
      <tr><td style="padding:28px;">
        ${contentHtml}
        ${ctaUrl ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 4px 0;"><tr><td style="background:${BRAND.primary};border-radius:10px;"><a href="${escape(ctaUrl)}" style="display:inline-block;padding:12px 22px;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;">${escape(ctaLabel || 'Ver en FleetCore')}</a></td></tr></table>` : ''}
      </td></tr>
      <tr><td style="background:#f8fafc;padding:18px 28px;border-top:1px solid #e2e8f0;">
        <div style="font-size:11px;color:${BRAND.textMuted};line-height:1.6;">
          Este correo fue generado automáticamente por <strong>FleetCore</strong>. Si no esperabas este mensaje, podés ignorarlo.<br>
          Para gestionar destinatarios, ingresá a <a href="${escape(APP_URL)}" style="color:${BRAND.primary};text-decoration:none;">${escape(APP_URL.replace(/^https?:\/\//, ''))}</a> → AdminPanel → Notificaciones.
        </div>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

function row(label, value, opts = {}) {
  const v = value == null || value === '' ? '—' : escape(value);
  return `<tr>
    <td style="padding:8px 0;font-size:12px;color:${BRAND.textMuted};text-transform:uppercase;letter-spacing:.4px;font-weight:700;width:42%;">${escape(label)}</td>
    <td style="padding:8px 0;font-size:14px;color:${BRAND.text};${opts.bold ? 'font-weight:700;' : ''}">${v}</td>
  </tr>`;
}

// ============================================================
// TEMPLATE: Entrada de combustible
// ============================================================
function entradaCombustible({ reporte, empresaNombre, origenLabel, equipoSurtidorLabel, machineLabel, operadorLabel }) {
  const d = reporte.datosEntrada || {};
  const docs = Array.isArray(d.numerosDocumento) ? d.numerosDocumento.filter(Boolean).join(', ') : (d.numeroDocumento || '');
  const tipoOrigen = d.tipoOrigen === 'estacion' ? 'Estación de Servicio' : d.tipoOrigen === 'estanque' ? 'Estanque (Vale)' : '—';
  const destino = d.destinoCarga === 'camion' ? 'Camión Surtidor' : d.destinoCarga === 'estanque' ? 'Estanque' : '—';

  const subject = `🛢️ Entrada de combustible — ${fmtLitros(d.cantidad)} · ${escape(empresaNombre || '')}`;
  const preheader = `Recepción de ${fmtLitros(d.cantidad)} desde ${origenLabel || tipoOrigen}.`;

  const contentHtml = `
    <div style="font-size:18px;font-weight:800;color:${BRAND.text};margin:0 0 4px 0;">Nueva entrada de combustible</div>
    <div style="font-size:13px;color:${BRAND.textMuted};margin:0 0 18px 0;">${escape(empresaNombre || '')}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid ${BRAND.border};border-bottom:1px solid ${BRAND.border};margin:8px 0;">
      ${row('Tipo de origen', tipoOrigen)}
      ${row('Origen', origenLabel || '')}
      ${row('Destino de la carga', destino)}
      ${row('N° de Documento', docs)}
      ${row('Fecha del documento', d.fechaDocumento)}
      ${row('Cantidad', fmtLitros(d.cantidad), { bold: true })}
      ${row('Horómetro / Odómetro', d.horometroOdometro)}
      ${row('Equipo surtidor', equipoSurtidorLabel)}
      ${row('Máquina / Estanque receptor', machineLabel)}
      ${row('Operador receptor', operadorLabel)}
      ${row('Observaciones', d.observaciones)}
      ${row('Registrado por', reporte.creadoPor)}
      ${row('Fecha de registro', fmtFecha(reporte.fechaCreacion))}
    </table>`;

  const text = [
    `Nueva entrada de combustible — ${empresaNombre || ''}`,
    `Tipo origen: ${tipoOrigen}`,
    `Origen: ${origenLabel || ''}`,
    `Destino: ${destino}`,
    `N° Documento: ${docs}`,
    `Cantidad: ${fmtLitros(d.cantidad)}`,
    `Horómetro/Odómetro: ${d.horometroOdometro || ''}`,
    `Equipo surtidor: ${equipoSurtidorLabel || ''}`,
    `Receptor: ${machineLabel || ''}`,
    `Observaciones: ${d.observaciones || ''}`,
    `Registrado por ${reporte.creadoPor || ''} el ${fmtFecha(reporte.fechaCreacion)}`,
    `Ver en ${APP_URL}`,
  ].join('\n');

  return {
    subject,
    html: baseLayout({ title: 'Entrada de combustible', preheader, contentHtml, ctaUrl: APP_URL, ctaLabel: 'Ver detalle en FleetCore' }),
    text,
  };
}

// ============================================================
// TEMPLATE: Entrega / Voucher
// ============================================================
function voucherEntrega({ reporte, empresaNombre, empresaReceptora, equipoSurtidorLabel, machineLabel, operadorLabel }) {
  const d = reporte.datosEntrega || {};
  const subject = `⛽ Entrega de combustible — ${fmtLitros(d.cantidadLitros)} · ${escape(machineLabel || '')}`;
  const preheader = `Voucher de entrega de ${fmtLitros(d.cantidadLitros)} a ${machineLabel || 'máquina'}.`;

  const contentHtml = `
    <div style="font-size:18px;font-weight:800;color:${BRAND.text};margin:0 0 4px 0;">Voucher de entrega</div>
    <div style="font-size:13px;color:${BRAND.textMuted};margin:0 0 18px 0;">${escape(empresaNombre || '')} · Reporte ${escape(reporte.numeroReporte || '')}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid ${BRAND.border};border-bottom:1px solid ${BRAND.border};margin:8px 0;">
      ${row('Empresa receptora', empresaReceptora)}
      ${row('Máquina', machineLabel, { bold: true })}
      ${row('Operador', operadorLabel)}
      ${row('Cantidad entregada', fmtLitros(d.cantidadLitros), { bold: true })}
      ${row('Horómetro / Odómetro', d.horometroOdometro)}
      ${row('Equipo surtidor', equipoSurtidorLabel)}
      ${row('Fecha de entrega', d.fecha)}
      ${row('Observaciones', d.observaciones)}
      ${row('N° Reporte', reporte.numeroReporte)}
      ${row('Registrado por', reporte.creadoPor)}
      ${row('Fecha de registro', fmtFecha(reporte.fechaCreacion))}
    </table>`;

  const text = [
    `Voucher de entrega — ${empresaNombre || ''}`,
    `Empresa receptora: ${empresaReceptora || ''}`,
    `Máquina: ${machineLabel || ''}`,
    `Operador: ${operadorLabel || ''}`,
    `Cantidad: ${fmtLitros(d.cantidadLitros)}`,
    `Horómetro/Odómetro: ${d.horometroOdometro || ''}`,
    `Equipo surtidor: ${equipoSurtidorLabel || ''}`,
    `Observaciones: ${d.observaciones || ''}`,
    `Reporte: ${reporte.numeroReporte || ''}`,
    `Registrado por ${reporte.creadoPor || ''} el ${fmtFecha(reporte.fechaCreacion)}`,
    `Ver en ${APP_URL}`,
  ].join('\n');

  return {
    subject,
    html: baseLayout({ title: 'Entrega de combustible', preheader, contentHtml, ctaUrl: APP_URL, ctaLabel: 'Ver voucher en FleetCore' }),
    text,
  };
}

// ============================================================
// TEMPLATE: Genérico (eventos futuros / test)
// ============================================================
function genericNotification({ title, heading, body, ctaUrl, ctaLabel }) {
  const subject = title;
  const contentHtml = `
    <div style="font-size:18px;font-weight:800;color:${BRAND.text};margin:0 0 12px 0;">${escape(heading || title)}</div>
    <div style="font-size:14px;color:${BRAND.text};line-height:1.6;">${body}</div>`;
  return {
    subject,
    html: baseLayout({ title, preheader: heading || title, contentHtml, ctaUrl, ctaLabel }),
    text: `${heading || title}\n\n${String(body).replace(/<[^>]+>/g, '')}\n\n${ctaUrl ? `Ver: ${ctaUrl}` : ''}`,
  };
}

// ============================================================
// WHATSAPP TEMPLATES (texto corto, sin HTML)
// En sandbox Twilio acepta texto libre. En producción reemplazar
// por contentSid de un template HSM aprobado por Meta y pasar
// las variables como contentVariables.
// ============================================================

function whatsappEntrada({ reporte, empresaNombre, origenLabel, machineLabel }) {
  const d = reporte.datosEntrada || {};
  const docs = Array.isArray(d.numerosDocumento) ? d.numerosDocumento.filter(Boolean).join(', ') : (d.numeroDocumento || '—');
  const destino = d.destinoCarga === 'camion' ? 'camión surtidor' : d.destinoCarga === 'estanque' ? 'estanque' : (machineLabel || '—');
  return [
    `🛢️ *FleetCore — Entrada de combustible*`,
    `Empresa: ${empresaNombre || '—'}`,
    `Cantidad: *${fmtLitros(d.cantidad)}*`,
    `Origen: ${origenLabel || '—'}`,
    `Destino: ${destino}`,
    `N° doc: ${docs}`,
    `Fecha: ${d.fechaDocumento || '—'}`,
    ``,
    `Ver detalle: ${APP_URL}`,
  ].join('\n');
}

function whatsappEntrega({ reporte, empresaNombre, machineLabel, operadorLabel }) {
  const d = reporte.datosEntrega || {};
  return [
    `⛽ *FleetCore — Voucher de entrega*`,
    `Empresa: ${empresaNombre || '—'}`,
    `Máquina: *${machineLabel || '—'}*`,
    `Operador: ${operadorLabel || '—'}`,
    `Cantidad: *${fmtLitros(d.cantidadLitros)}*`,
    `Reporte N°: ${reporte.numeroReporte || '—'}`,
    `Fecha: ${d.fecha || '—'}`,
    ``,
    `Ver voucher: ${APP_URL}`,
  ].join('\n');
}

function whatsappTest({ message }) {
  return `✅ *FleetCore — WhatsApp test*\n${message || 'Integración Twilio OK'}\n\n${APP_URL}`;
}

module.exports = {
  entradaCombustible,
  voucherEntrega,
  genericNotification,
  whatsappEntrada,
  whatsappEntrega,
  whatsappTest,
};
