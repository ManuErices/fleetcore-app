// ============================================================
// FLEETCORE — Email & WhatsApp Templates
// functions/email-templates.js
// ============================================================

const TIPO_ORIGEN_LABELS = {
  estacion: 'Estación de Combustible',
  externo: 'Empresa Externa',
  interno: 'MPF Interno',
};

function fmtNum(n) {
  const num = parseFloat(n);
  return isNaN(num) ? (n || 'N/A') : num.toLocaleString('es-CL');
}

// ── Shared HTML shell ─────────────────────────────────────────
function emailShell(title, color, bodyHtml) {
  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:24px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08);">
  <!-- HEADER -->
  <tr><td style="background:${color};padding:28px 32px;">
    <p style="margin:0;font-size:11px;font-weight:700;color:rgba(255,255,255,.7);text-transform:uppercase;letter-spacing:2px;">FleetCore · Gestión de Combustible</p>
    <h1 style="margin:6px 0 0;font-size:22px;font-weight:900;color:#fff;">${title}</h1>
  </td></tr>
  <!-- BODY -->
  <tr><td style="padding:28px 32px;">${bodyHtml}</td></tr>
  <!-- FOOTER -->
  <tr><td style="background:#f8fafc;padding:16px 32px;border-top:1px solid #e2e8f0;">
    <p style="margin:0;font-size:11px;color:#94a3b8;text-align:center;">Este correo fue generado automáticamente por FleetCore. No responder.</p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}

function row(label, value) {
  return `<tr>
    <td style="padding:8px 12px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.5px;white-space:nowrap;width:40%;">${label}</td>
    <td style="padding:8px 12px;font-size:13px;font-weight:700;color:#0f172a;">${value || '—'}</td>
  </tr>`;
}

function section(title, color, rows) {
  return `<div style="margin-bottom:20px;">
  <p style="margin:0 0 8px;font-size:10px;font-weight:900;color:${color};text-transform:uppercase;letter-spacing:1.5px;">${title}</p>
  <table width="100%" cellpadding="0" cellspacing="0" style="border:1.5px solid #e2e8f0;border-radius:8px;overflow:hidden;background:#f8fafc;">
    <tbody>${rows}</tbody>
  </table>
  </div>`;
}

// ── entradaCombustible ─────────────────────────────────────────
function entradaCombustible({ reporte, empresaNombre, origenLabel, equipoSurtidorLabel, machineLabel, operadorLabel }) {
  const n = reporte.numeroGuia || reporte.numeroReporte || '—';
  const tipoOrigenLabel = TIPO_ORIGEN_LABELS[reporte.datosEntrada?.tipoOrigen] || reporte.datosEntrada?.tipoOrigen || '—';
  const cantidad = fmtNum(reporte.datosEntrada?.cantidad);
  const horometro = fmtNum(reporte.datosEntrada?.horometroOdometro);
  const docs = (reporte.datosEntrada?.numerosDocumento || [reporte.datosEntrada?.numeroDocumento]).filter(Boolean).join(', ') || '—';
  const origen = origenLabel || reporte.empresaProveedora || '—';
  const subject = `[${empresaNombre}] Entrada de Combustible N° ${n}`;

  const body = `
    <div style="background:#f0fdf4;border:1.5px solid #bbf7d0;border-radius:8px;padding:16px 20px;margin-bottom:20px;display:flex;align-items:center;gap:12px;">
      <span style="font-size:28px;">⛽</span>
      <div>
        <p style="margin:0;font-size:19px;font-weight:900;color:#166534;">${cantidad} <span style="font-size:14px;font-weight:600;">Litros</span></p>
        <p style="margin:4px 0 0;font-size:12px;color:#15803d;font-weight:600;">Entrada registrada · ${reporte.fecha || '—'} ${reporte.hora ? '· ' + reporte.hora : ''}</p>
      </div>
    </div>
    ${section('Origen del Combustible', '#16a34a', row('Tipo de origen', tipoOrigenLabel) + row('Empresa / Estación', origen) + row('N° Documentos / Guías', docs))}
    ${section('Recepción', '#1d4ed8', row('Proyecto', reporte.projectId || '—') + row('Vehículo / Máquina', machineLabel || '—') + row('Horómetro / Odómetro', horometro))}
    ${section('Personal', '#7c3aed', row('Recibe / Operador', operadorLabel || reporte.repartidorNombre || '—') + row('Registrado por', reporte.creadoPor || '—'))}
    ${reporte.datosEntrada?.observaciones ? `<div style="background:#fefce8;border:1.5px solid #fde68a;border-radius:8px;padding:14px 16px;margin-top:8px;"><p style="margin:0 0 4px;font-size:10px;font-weight:700;color:#92400e;text-transform:uppercase;letter-spacing:1px;">Observaciones</p><p style="margin:0;font-size:13px;color:#451a03;">${reporte.datosEntrada.observaciones}</p></div>` : ''}
    <p style="margin:20px 0 0;font-size:11px;color:#94a3b8;">Reporte: ${reporte.numeroReporte || '—'} · N° Guía: ${n}</p>`;

  const text = `ENTRADA DE COMBUSTIBLE\nN° ${n} · ${reporte.fecha || ''} ${reporte.hora || ''}\n\nCantidad: ${cantidad} L\nOrigen: ${origen} (${tipoOrigenLabel})\nDocs/Guías: ${docs}\nProyecto: ${reporte.projectId || '—'}\nMáquina: ${machineLabel || '—'}\nHorómetro: ${horometro}\nRecibe: ${operadorLabel || reporte.repartidorNombre || '—'}\nEmpresa: ${empresaNombre}`;

  return { subject, html: emailShell(subject, 'linear-gradient(135deg,#16a34a,#059669)', body), text };
}

// ── voucherEntrega ────────────────────────────────────────────
function voucherEntrega({ reporte, empresaNombre, empresaReceptora, equipoSurtidorLabel, machineLabel, operadorLabel }) {
  const n = reporte.numeroGuia || reporte.numeroReporte || '—';
  const cantidad = fmtNum(reporte.datosEntrega?.cantidadLitros || reporte.cantidadLitros);
  const horometro = fmtNum(reporte.datosEntrega?.horometroOdometro || reporte.horometroOdometro);
  const empresa = empresaReceptora || reporte.datosEntrega?.empresa || '—';
  const subject = `[${empresaNombre}] Voucher de Entrega N° ${n}`;

  const body = `
    <div style="background:#eff6ff;border:1.5px solid #bfdbfe;border-radius:8px;padding:16px 20px;margin-bottom:20px;">
      <span style="font-size:28px;">🚛</span>
      <p style="margin:6px 0 0;font-size:19px;font-weight:900;color:#1e40af;">${cantidad} <span style="font-size:14px;font-weight:600;">Litros entregados</span></p>
      <p style="margin:4px 0 0;font-size:12px;color:#1d4ed8;font-weight:600;">Entrega registrada · ${reporte.fecha || '—'} ${reporte.hora ? '· ' + reporte.hora : ''}</p>
    </div>
    ${section('Destino', '#1d4ed8', row('Empresa Receptora', empresa) + row('Vehículo / Máquina', machineLabel || '—') + row('Horómetro / Odómetro', horometro))}
    ${section('Surtidor', '#7c3aed', row('Surtidor / Entrega', reporte.repartidorNombre || '—') + row('Equipo Surtidor', equipoSurtidorLabel || '—') + row('Operador Receptor', operadorLabel || '—'))}
    ${section('Contrato', '#0f172a', row('Proyecto', reporte.projectId || '—') + row('Empresa Administradora', empresaNombre))}
    ${reporte.datosEntrega?.observaciones ? `<div style="background:#fefce8;border:1.5px solid #fde68a;border-radius:8px;padding:14px 16px;margin-top:8px;"><p style="margin:0 0 4px;font-size:10px;font-weight:700;color:#92400e;text-transform:uppercase;letter-spacing:1px;">Observaciones</p><p style="margin:0;font-size:13px;color:#451a03;">${reporte.datosEntrega.observaciones}</p></div>` : ''}
    <p style="margin:20px 0 0;font-size:11px;color:#94a3b8;">Reporte: ${reporte.numeroReporte || '—'} · N° Guía: ${n}</p>`;

  const text = `VOUCHER DE ENTREGA DE COMBUSTIBLE\nN° ${n} · ${reporte.fecha || ''} ${reporte.hora || ''}\n\nCantidad: ${cantidad} L\nDestino: ${empresa}\nMáquina: ${machineLabel || '—'}\nHorómetro: ${horometro}\nSurtidor: ${reporte.repartidorNombre || '—'}\nOperador Receptor: ${operadorLabel || '—'}\nProyecto: ${reporte.projectId || '—'}\nEmpresa: ${empresaNombre}`;

  return { subject, html: emailShell(subject, 'linear-gradient(135deg,#1d4ed8,#7c3aed)', body), text };
}

// ── genericNotification ───────────────────────────────────────
function genericNotification({ subject, title, message, details = {} }) {
  const rows = Object.entries(details).map(([k, v]) => row(k, v)).join('');
  const body = `<p style="font-size:15px;color:#334155;margin:0 0 20px;">${message}</p>${rows ? section('Detalles', '#64748b', rows) : ''}`;
  return { subject, html: emailShell(title || subject, '#475569', body), text: `${title || subject}\n\n${message}\n${Object.entries(details).map(([k,v]) => `${k}: ${v}`).join('\n')}` };
}

// ── WhatsApp Bodies ───────────────────────────────────────────
function whatsappEntrada({ reporte, empresaNombre, origenLabel, machineLabel }) {
  const n = reporte.numeroGuia || reporte.numeroReporte || '—';
  const cantidad = fmtNum(reporte.datosEntrada?.cantidad);
  const origen = origenLabel || reporte.empresaProveedora || '—';
  return `⛽ *ENTRADA DE COMBUSTIBLE*\n*N° ${n}*\nEmpresa: ${empresaNombre}\nFecha: ${reporte.fecha || '—'} ${reporte.hora || ''}\nCantidad: *${cantidad} L*\nOrigen: ${origen}\nMáquina: ${machineLabel || '—'}`;
}

function whatsappEntrega({ reporte, empresaNombre, machineLabel, operadorLabel }) {
  const n = reporte.numeroGuia || reporte.numeroReporte || '—';
  const cantidad = fmtNum(reporte.datosEntrega?.cantidadLitros || reporte.cantidadLitros);
  return `🚛 *ENTREGA DE COMBUSTIBLE*\n*N° ${n}*\nEmpresa: ${empresaNombre}\nFecha: ${reporte.fecha || '—'} ${reporte.hora || ''}\nCantidad: *${cantidad} L*\nMáquina: ${machineLabel || '—'}\nOperador: ${operadorLabel || '—'}`;
}

function whatsappTest({ empresaNombre }) {
  return `✅ *FleetCore* – Notificaciones WhatsApp configuradas correctamente para *${empresaNombre || 'su empresa'}*.`;
}

// ── invitacionUsuario ──────────────────────────────────────────
function invitacionUsuario({ emailDestino, rol, link, empresaNombre, diasExpira }) {
  const rolLabels = {
    admin_contrato: 'Administrador',
    administrativo: 'Administrativo',
    operador: 'Operador',
    mandante: 'Mandante',
    trabajador: 'Trabajador',
  };
  const rolLabel = rolLabels[rol] || rol;
  const subject = `Invitación a FleetCore — ${empresaNombre}`;

  const body = `
    <div style="background:#f0fdf4;border:1.5px solid #bbf7d0;border-radius:8px;padding:16px 20px;margin-bottom:24px;">
      <p style="margin:0;font-size:15px;font-weight:700;color:#166534;">Has sido invitado a unirte a <strong>${empresaNombre}</strong></p>
      <p style="margin:6px 0 0;font-size:13px;color:#15803d;">Rol asignado: <strong>${rolLabel}</strong></p>
    </div>
    <p style="font-size:13px;color:#475569;margin:0 0 24px;">Haz clic en el botón para crear tu cuenta y acceder a FleetCore. El link expira en <strong>${diasExpira || 7} días</strong>.</p>
    <div style="text-align:center;margin:24px 0;">
      <a href="${link}" style="display:inline-block;background:#065f46;color:#fff;font-weight:900;font-size:15px;text-decoration:none;padding:14px 36px;border-radius:10px;letter-spacing:.5px;">
        Aceptar invitación
      </a>
    </div>
    <p style="font-size:11px;color:#94a3b8;margin:16px 0 0;">Si no esperabas esta invitación, ignora este correo. Link: ${link}</p>
  `;

  return { subject, html: emailShell('Invitación a FleetCore', '#065f46', body) };
}

module.exports = {
  entradaCombustible,
  voucherEntrega,
  genericNotification,
  whatsappEntrada,
  whatsappEntrega,
  whatsappTest,
  invitacionUsuario,
};
