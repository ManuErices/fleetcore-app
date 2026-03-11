import { IMM_2026, TASAS, TASAS_AFP, MESES, CAUSALES_TERMINO, UTM_DEFAULT, TRAMOS_IUT } from './RRHH.shared';
import { calcularLiquidacion, calcularIUT, calcularRentaTributable, calcularLiquidacionConIUT, labelPeriodo } from './RRHH.calculo';

function generarPDFContrato(contrato, trabajador) {
  const fmt = (n) => n ? `$${parseInt(n).toLocaleString('es-CL')}` : '$0';
  const fmtFecha = (f) => {
    if (!f) return '_______________';
    const [y,m,d] = f.split('-');
    const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
    return `${parseInt(d)} de ${meses[parseInt(m)-1]} de ${y}`;
  };

  const nombreCompleto = trabajador
    ? `${trabajador.nombre} ${trabajador.apellidoPaterno} ${trabajador.apellidoMaterno||''}`.trim()
    : '_______________';

  const base       = parseInt(contrato.sueldoBase)||0;
  const bProd      = parseInt(contrato.bonoProduccion)||0;
  const hExtra     = parseInt(contrato.horasExtra)||0;
  const vHE        = parseInt(contrato.valorHoraExtra)||0;
  const bColacion  = parseInt(contrato.bonoColacion)||0;
  const bMovil     = parseInt(contrato.bonoMovilizacion)||0;
  const viaticos   = parseInt(contrato.viaticos)||0;
  const imponible  = base + bProd;
  const noImponible= bColacion + bMovil + viaticos;
  const totalBruto = imponible + noImponible;

  const tipoLabel = {
    'Indefinido':   'INDEFINIDA DURACIÓN',
    'Plazo Fijo':   'PLAZO FIJO',
    'Obra o Faena': 'OBRA O FAENA',
  }[contrato.tipoContrato] || contrato.tipoContrato;

  const gratLabel = {
    'legal':       'Gratificación legal anual equivalente al 25% de las remuneraciones devengadas en el año, con tope de 4,75 Ingresos Mínimos Mensuales anuales, conforme al Art. 47 del Código del Trabajo.',
    'garantizada': 'Gratificación garantizada mensual equivalente al 25% del Ingreso Mínimo Mensual vigente, pagadera mensualmente.',
    'ninguna':     'Sin gratificación pactada.',
  }[contrato.gratificacion] || '';

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8"/>
<title>Contrato de Trabajo — ${nombreCompleto}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: 'Times New Roman', Times, serif; font-size: 11pt; color: #1a1a1a; background: #fff; }
  .page { max-width: 820px; margin: 0 auto; padding: 40px 60px; }
  .header { text-align: center; margin-bottom: 32px; border-bottom: 3px double #1a1a1a; padding-bottom: 18px; }
  .logo-empresa { font-size: 18pt; font-weight: 900; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 4px; }
  .titulo { font-size: 15pt; font-weight: 900; text-transform: uppercase; letter-spacing: 2px; margin: 14px 0 6px; }
  .subtitulo { font-size: 11pt; color: #444; }
  .clausula { margin: 18px 0; }
  .clausula-titulo { font-size: 11pt; font-weight: 900; text-transform: uppercase; margin-bottom: 6px; letter-spacing: 0.5px; border-left: 3px solid #1a1a1a; padding-left: 8px; }
  .clausula-body { line-height: 1.8; text-align: justify; }
  .clausula-body p { margin-bottom: 6px; }
  .tabla-rem { width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 10.5pt; }
  .tabla-rem th { background: #1a1a1a; color: #fff; padding: 7px 12px; text-align: left; font-size: 9pt; text-transform: uppercase; letter-spacing: 0.5px; }
  .tabla-rem td { padding: 7px 12px; border-bottom: 1px solid #e0e0e0; }
  .tabla-rem tr:nth-child(even) td { background: #f9f9f9; }
  .tabla-rem .total td { font-weight: 900; border-top: 2px solid #1a1a1a; font-size: 11pt; }
  .badge-imp { display: inline-block; font-size: 8pt; font-weight: 700; padding: 1px 6px; border-radius: 3px; margin-left: 6px; }
  .imp { background: #e8f5e9; color: #2e7d32; }
  .no-imp { background: #e3f2fd; color: #1565c0; }
  .firmantes { display: flex; justify-content: space-between; margin-top: 60px; gap: 40px; }
  .firma-box { flex: 1; text-align: center; }
  .firma-linea { border-top: 1.5px solid #1a1a1a; margin-bottom: 8px; margin-top: 50px; }
  .firma-nombre { font-weight: 900; font-size: 10pt; }
  .firma-cargo { font-size: 9.5pt; color: #555; }
  .nota-legal { background: #f8f8f8; border: 1px solid #ddd; border-radius: 4px; padding: 12px 16px; margin-top: 24px; font-size: 9pt; color: #555; line-height: 1.6; }
  .nota-legal strong { color: #1a1a1a; }
  .numero-clausula { font-size: 9.5pt; color: #666; font-weight: 700; margin-right: 4px; }
  .highlight { background: #fffde7; padding: 1px 3px; border-radius: 2px; }
  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .page { padding: 20px 40px; }
    .no-print { display: none; }
  }
</style>
</head>
<body>
<div class="page">

  <div class="header">
    <div class="logo-empresa">${contrato.empresa || 'MPF Ingeniería Civil'}</div>
    <div class="titulo">Contrato Individual de Trabajo</div>
    <div class="subtitulo">Contrato de ${tipoLabel} — Celebrado conforme al Código del Trabajo de la República de Chile</div>
  </div>

  <div class="clausula">
    <div class="clausula-titulo"><span class="numero-clausula">PRIMERA.</span> Partes Contratantes</div>
    <div class="clausula-body">
      <p>En <strong>${contrato.lugarTrabajo || 'Santiago'}</strong>, a ${fmtFecha(contrato.fechaInicio)}, entre:</p>
      <p><strong>EMPLEADOR:</strong> <strong>${contrato.empresa || 'MPF Ingeniería Civil'}</strong>, en adelante también denominada "La Empresa".</p>
      <p><strong>TRABAJADOR:</strong> Don/Doña <strong>${nombreCompleto}</strong>, RUT <strong>${trabajador?.rut || '_______________'}</strong>, de nacionalidad ${trabajador?.nacionalidad || 'chilena'}, con domicilio en ${[trabajador?.direccion, trabajador?.comuna, trabajador?.region].filter(Boolean).join(', ') || '_______________'}, en adelante también denominado/a "El/La Trabajador/a".</p>
    </div>
  </div>

  <div class="clausula">
    <div class="clausula-titulo"><span class="numero-clausula">SEGUNDA.</span> Naturaleza y Duración del Contrato</div>
    <div class="clausula-body">
      ${contrato.tipoContrato === 'Indefinido' ? `
        <p>El presente contrato es de <strong>indefinida duración</strong>, comenzando a regir el <strong>${fmtFecha(contrato.fechaInicio)}</strong>, sin perjuicio de las causales de término establecidas en el Código del Trabajo.</p>
      ` : contrato.tipoContrato === 'Plazo Fijo' ? `
        <p>El presente contrato es de <strong>plazo fijo</strong> y tendrá vigencia desde el <strong>${fmtFecha(contrato.fechaInicio)}</strong> hasta el <strong>${fmtFecha(contrato.fechaFin)}</strong>, de conformidad con lo dispuesto en el artículo 159 N°4 del Código del Trabajo.</p>
        <p>Las partes dejan constancia que si el trabajador continúa prestando servicios con conocimiento del empleador, después del vencimiento del plazo, el contrato se transformará en uno de duración indefinida.</p>
      ` : `
        <p>El presente contrato es por <strong>obra o faena determinada</strong>, comenzando a regir el <strong>${fmtFecha(contrato.fechaInicio)}</strong> y durará hasta la conclusión de la obra o faena para la que fue contratado el trabajador, conforme al artículo 159 N°5 del Código del Trabajo.</p>
      `}
    </div>
  </div>

  <div class="clausula">
    <div class="clausula-titulo"><span class="numero-clausula">TERCERA.</span> Cargo, Funciones y Lugar de Trabajo</div>
    <div class="clausula-body">
      <p>El/La Trabajador/a se desempeñará en el cargo de <strong>${contrato.cargo || '_______________'}</strong>, ejerciendo las siguientes funciones y responsabilidades:</p>
      <p>${contrato.funciones || 'Aquellas propias del cargo señalado y las demás que le encomiende la Empresa en conformidad a la ley.'}</p>
      <p>El lugar de prestación de servicios será <strong>${contrato.lugarTrabajo || '_______________'}</strong>, sin perjuicio de que la Empresa pueda alterar la naturaleza de los servicios o el sitio o recinto en que ellos deban prestarse, con tal que se trate de labores similares y el nuevo sitio quede dentro del mismo lugar o ciudad, conforme al artículo 12 del Código del Trabajo.</p>
    </div>
  </div>

  <div class="clausula">
    <div class="clausula-titulo"><span class="numero-clausula">CUARTA.</span> Jornada de Trabajo</div>
    <div class="clausula-body">
      <p>La jornada de trabajo será: <strong>${contrato.jornada || '45 horas semanales'}</strong>, distribuida de lunes a viernes${contrato.jornada?.includes('Turno') ? ', en régimen de turnos' : ''}, conforme a lo establecido en el artículo 22 del Código del Trabajo.</p>
      ${hExtra > 0 ? `<p>Se pactan horas extraordinarias habituales de hasta <strong>${hExtra} horas semanales</strong>, con un recargo mínimo del 50% sobre el valor de la hora ordinaria (Art. 32 CT), con un valor hora extra de <strong>${fmt(contrato.valorHoraExtra)}</strong>.</p>` : ''}
    </div>
  </div>

  <div class="clausula">
    <div class="clausula-titulo"><span class="numero-clausula">QUINTA.</span> Remuneración</div>
    <div class="clausula-body">
      <p>Por los servicios prestados, La Empresa pagará al/a la Trabajador/a la siguiente remuneración mensual:</p>
      <table class="tabla-rem">
        <thead>
          <tr><th>Concepto</th><th>Tipo</th><th style="text-align:right">Monto Mensual</th></tr>
        </thead>
        <tbody>
          <tr><td><strong>Sueldo Base</strong></td><td><span class="badge-imp imp">Imponible</span></td><td style="text-align:right"><strong>${fmt(contrato.sueldoBase)}</strong></td></tr>
          ${bProd > 0 ? `<tr><td>Bono de Producción</td><td><span class="badge-imp imp">Imponible</span></td><td style="text-align:right">${fmt(contrato.bonoProduccion)}</td></tr>` : ''}
          ${hExtra > 0 ? `<tr><td>Horas Extraordinarias (estimado ${hExtra} hrs/sem)</td><td><span class="badge-imp imp">Imponible</span></td><td style="text-align:right">Según Art. 32 CT</td></tr>` : ''}
          ${bColacion > 0 ? `<tr><td>Bono de Colación</td><td><span class="badge-imp no-imp">No Imponible</span></td><td style="text-align:right">${fmt(contrato.bonoColacion)}</td></tr>` : ''}
          ${bMovil > 0 ? `<tr><td>Bono de Movilización</td><td><span class="badge-imp no-imp">No Imponible</span></td><td style="text-align:right">${fmt(contrato.bonoMovilizacion)}</td></tr>` : ''}
          ${viaticos > 0 ? `<tr><td>Viáticos (contra rendición)</td><td><span class="badge-imp no-imp">No Imponible</span></td><td style="text-align:right">${fmt(contrato.viaticos)}</td></tr>` : ''}
        </tbody>
        <tfoot>
          <tr class="total"><td colspan="2">TOTAL REMUNERACIÓN BRUTA MENSUAL</td><td style="text-align:right">${fmt(totalBruto)}</td></tr>
          <tr><td colspan="2" style="font-size:9pt;color:#555">Base imponible (sujeta a cotizaciones previsionales)</td><td style="text-align:right;font-size:9pt;color:#555">${fmt(imponible)}</td></tr>
        </tfoot>
      </table>
      <p style="margin-top:10px"><strong>Gratificación:</strong> ${gratLabel}</p>
      <p>La remuneración se pagará en forma mensual, mediante depósito en cuenta bancaria o por otro medio convenido, dentro de los primeros <strong>5 días hábiles</strong> del mes siguiente al devengado.</p>
    </div>
  </div>

  <div class="clausula">
    <div class="clausula-titulo"><span class="numero-clausula">SEXTA.</span> Obligaciones y Prohibiciones del Trabajador</div>
    <div class="clausula-body">
      <p>El/La Trabajador/a se obliga a cumplir fielmente el contrato y las instrucciones que impartan sus superiores; guardar la debida lealtad, fidelidad y reserva respecto de los negocios de la Empresa; no ejecutar negociaciones dentro del giro del negocio de la Empresa que pudieren considerarse contrarias a sus intereses; mantener absoluta reserva de las informaciones, datos y antecedentes a que tenga acceso en razón de su cargo; y, en general, dar estricto cumplimiento a las normas del Reglamento Interno de Orden, Higiene y Seguridad vigente.</p>
    </div>
  </div>

  <div class="clausula">
    <div class="clausula-titulo"><span class="numero-clausula">SÉPTIMA.</span> Feriado Anual</div>
    <div class="clausula-body">
      <p>El/La Trabajador/a tendrá derecho a feriado anual de <strong>15 días hábiles</strong> con derecho a remuneración íntegra, una vez completado el año de servicio. Al término del contrato, si no se hubiere completado dicho período, tendrá derecho a feriado proporcional, conforme al artículo 73 del Código del Trabajo.</p>
    </div>
  </div>

  <div class="clausula">
    <div class="clausula-titulo"><span class="numero-clausula">OCTAVA.</span> Previsión Social</div>
    <div class="clausula-body">
      <p>La Empresa efectuará mensualmente las cotizaciones previsionales y de salud que correspondan sobre la remuneración imponible del/de la Trabajador/a, conforme a la legislación vigente (DL 3.500, Ley 18.469 y normas complementarias), siendo de cargo del/de la Trabajador/a las cotizaciones de cargo del trabajador (AFP, Salud, SIS, Seguro de Cesantía).</p>
    </div>
  </div>

  <div class="clausula">
    <div class="clausula-titulo"><span class="numero-clausula">NOVENA.</span> Término del Contrato</div>
    <div class="clausula-body">
      <p>El presente contrato podrá terminar por las causales establecidas en los artículos 159, 160 y 161 del Código del Trabajo. En caso de término por necesidades de la empresa (Art. 161), se dará aviso con 30 días de anticipación o se pagará la indemnización sustitutiva del aviso previo equivalente a la última remuneración mensual devengada.</p>
    </div>
  </div>

  <div class="clausula">
    <div class="clausula-titulo"><span class="numero-clausula">DÉCIMA.</span> Ejemplares y Registro</div>
    <div class="clausula-body">
      <p>El presente contrato se firma en dos ejemplares del mismo tenor y fecha, quedando uno en poder de cada parte. El/La Trabajador/a declara haber recibido su ejemplar en este acto, en conformidad a lo dispuesto en el artículo 11 del Código del Trabajo.</p>
      ${contrato.observaciones ? `<p><strong>Observaciones adicionales:</strong> ${contrato.observaciones}</p>` : ''}
    </div>
  </div>

  <div class="firmantes">
    <div class="firma-box">
      <div class="firma-linea"></div>
      <div class="firma-nombre">${contrato.empresa || 'MPF Ingeniería Civil'}</div>
      <div class="firma-cargo">Empleador / Representante Legal</div>
      <div style="font-size:9pt;color:#666;margin-top:4px">RUT: _______________</div>
    </div>
    <div class="firma-box">
      <div class="firma-linea"></div>
      <div class="firma-nombre">${nombreCompleto}</div>
      <div class="firma-cargo">${contrato.cargo || 'Trabajador/a'}</div>
      <div style="font-size:9pt;color:#666;margin-top:4px">RUT: ${trabajador?.rut || '_______________'}</div>
    </div>
  </div>

  <div class="nota-legal">
    <strong>Nota legal:</strong> Este contrato ha sido generado por el sistema FleetCore de MPF Ingeniería Civil. Para su validez legal debe ser revisado por un profesional habilitado y firmado por ambas partes. El contrato de trabajo debe constar por escrito conforme al artículo 9° del Código del Trabajo (DFL N°1, 2003).
  </div>

</div>
<script>window.onload = function(){ window.print(); }</script>
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const win  = window.open(url, '_blank');
  if (!win) alert('Permite ventanas emergentes para descargar el contrato.');
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
function generarPDFLiquidacion(rem, trabajador, contrato) {
  const calc     = calcularLiquidacion({ ...contrato, ...rem });
  const iut      = calcularIUT(calcularRentaTributable(calc), rem.utm || UTM_DEFAULT);
  const nombre   = trabajador
    ? `${trabajador.nombre} ${trabajador.apellidoPaterno} ${trabajador.apellidoMaterno||''}`.trim()
    : '_______________';
  const mesLabel = labelPeriodo(rem);
  const fmt      = (n) => `$${(n||0).toLocaleString('es-CL')}`;
  const tasaAfp  = ((TASAS_AFP[trabajador?.afp] || 0.1127) * 100).toFixed(2);
  const liquidoFinal = calc.liquido - iut;
  const rentaTrib    = calcularRentaTributable(calc);
  const diasTrab     = rem.diasTrabajados || 30;
  const horasBase    = rem.horasBase || (contrato?.jornada?.includes('45') ? 44 : 45);

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8"/>
<title>Liquidación ${mesLabel} — ${nombre}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box;}
  body{font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:9.5pt;color:#1a1a2e;background:#fff;}
  .page{max-width:800px;margin:0 auto;padding:28px 36px;}

  /* Header */
  .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;padding-bottom:14px;border-bottom:2px solid #e8e8f0;}
  .empresa-nombre{font-size:15pt;font-weight:900;color:#1a1a2e;letter-spacing:-0.5px;}
  .doc-titulo{font-size:11pt;font-weight:900;color:#1a1a2e;text-align:right;}
  .doc-mes{font-size:12pt;font-weight:900;color:#4f46e5;text-align:right;margin-top:2px;}

  /* Info cards — layout 2 columnas como Talana */
  .info-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px;}
  .info-card{background:#f7f7fc;border:1px solid #e8e8f0;border-radius:8px;padding:12px 14px;}
  .info-card-title{font-size:7.5pt;font-weight:900;text-transform:uppercase;letter-spacing:0.8px;color:#6b7280;margin-bottom:8px;}
  .info-row{display:flex;justify-content:space-between;margin-bottom:3px;}
  .info-key{font-size:8.5pt;color:#6b7280;font-weight:500;}
  .info-val{font-size:8.5pt;color:#1a1a2e;font-weight:700;text-align:right;}

  /* Stats row */
  .stats-row{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-bottom:16px;}
  .stat{background:#f7f7fc;border:1px solid #e8e8f0;border-radius:6px;padding:8px 10px;text-align:center;}
  .stat-v{font-size:11pt;font-weight:900;color:#4f46e5;}
  .stat-l{font-size:7pt;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#9ca3af;margin-top:2px;}

  /* Tablas haberes/descuentos — layout 2 columnas como Talana */
  .habdesc-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px;}
  .seccion{background:#f7f7fc;border:1px solid #e8e8f0;border-radius:8px;overflow:hidden;}
  .sec-header{background:#1a1a2e;color:#fff;padding:7px 12px;font-size:8pt;font-weight:900;text-transform:uppercase;letter-spacing:0.8px;}
  table{width:100%;border-collapse:collapse;}
  td{padding:5px 12px;font-size:9pt;border-bottom:1px solid #eff0f6;}
  td:last-child{text-align:right;font-weight:700;}
  tr:last-child td{border-bottom:none;}
  .subtotal-row td{background:#eff0f6;font-weight:900;font-size:9.5pt;border-top:1px solid #d1d5db;}
  .badge{display:inline-block;font-size:7pt;font-weight:700;padding:1px 5px;border-radius:3px;margin-left:4px;vertical-align:middle;}
  .imp{background:#dcfce7;color:#166534;}
  .noimp{background:#dbeafe;color:#1d4ed8;}
  .desc{color:#dc2626;}

  /* Total líquido */
  .total-section{background:#1a1a2e;border-radius:10px;padding:14px 18px;display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;}
  .total-label{font-size:10pt;font-weight:900;color:#fff;text-transform:uppercase;letter-spacing:0.5px;}
  .total-valor{font-size:20pt;font-weight:900;color:#4ade80;letter-spacing:-1px;}

  /* Costo empleador */
  .emp-box{background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:10px 14px;margin-bottom:16px;font-size:8.5pt;}
  .emp-box b{color:#92400e;}

  /* Certificación */
  .cert-box{background:#f7f7fc;border:1px solid #e8e8f0;border-radius:8px;padding:10px 14px;margin-bottom:16px;font-size:8.5pt;color:#374151;font-style:italic;}

  /* Firmas */
  .firma-row{display:flex;justify-content:space-between;gap:30px;margin-top:8px;}
  .firma{flex:1;text-align:center;}
  .firma-linea{border-top:1.5px solid #1a1a2e;margin-bottom:6px;margin-top:40px;}
  .firma-nombre{font-weight:900;font-size:9pt;}
  .firma-cargo{font-size:8.5pt;color:#6b7280;margin-top:2px;}

  /* Footer */
  .footer{margin-top:16px;border-top:1px solid #e8e8f0;padding-top:8px;font-size:7.5pt;color:#9ca3af;text-align:center;line-height:1.6;}
  @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}}
</style>
</head>
<body>
<div class="page">

  <!-- HEADER -->
  <div class="header">
    <div>
      <div class="empresa-nombre">${contrato?.empresa||'MPF Ingeniería Civil'}</div>
      <div style="font-size:8.5pt;color:#9ca3af;margin-top:3px">Liquidación de Remuneraciones · Art. 54 Código del Trabajo</div>
    </div>
    <div>
      <div class="doc-titulo">Liquidación de Remuneraciones</div>
      <div class="doc-mes">Mes: ${mesLabel}</div>
    </div>
  </div>

  <!-- INFO GRID (2 columnas como Talana) -->
  <div class="info-grid">
    <div class="info-card">
      <div class="info-card-title">Trabajador</div>
      <div class="info-row"><span class="info-key">Nombre</span><span class="info-val">${nombre}</span></div>
      <div class="info-row"><span class="info-key">Rut</span><span class="info-val">${trabajador?.rut||'—'}</span></div>
      <div class="info-row"><span class="info-key">Fecha de Ingreso</span><span class="info-val">${contrato?.fechaInicio||'—'}</span></div>
      <div class="info-row"><span class="info-key">Tipo de Contrato</span><span class="info-val">${contrato?.tipoContrato||'—'}</span></div>
      <div class="info-row"><span class="info-key">Cargo</span><span class="info-val">${contrato?.cargo||trabajador?.cargo||'—'}</span></div>
      <div class="info-row"><span class="info-key">AFP</span><span class="info-val">${trabajador?.afp||'—'}</span></div>
      <div class="info-row"><span class="info-key">Salud</span><span class="info-val">${trabajador?.prevision||'—'}${trabajador?.isapre?' ('+trabajador.isapre+')':''}</span></div>
    </div>
    <div class="info-card">
      <div class="info-card-title">Información Empresa</div>
      <div class="info-row"><span class="info-key">Razón Social</span><span class="info-val">${contrato?.empresa||'MPF Ingeniería Civil'}</span></div>
      <div class="info-row"><span class="info-key">Área</span><span class="info-val">${trabajador?.area||'—'}</span></div>
      <div class="info-row"><span class="info-key">C. Costo</span><span class="info-val">${trabajador?.centroCosto||contrato?.centroCosto||'—'}</span></div>
      <div class="info-row"><span class="info-key">Jornada</span><span class="info-val">${contrato?.jornada||'—'}</span></div>
      <div class="info-row"><span class="info-key">Período</span><span class="info-val">${mesLabel}</span></div>
      <div class="info-row"><span class="info-key">Fecha Emisión</span><span class="info-val">${new Date().toLocaleDateString('es-CL')}</span></div>
    </div>
  </div>

  <!-- STATS ROW -->
  <div class="stats-row">
    <div class="stat"><div class="stat-v">${diasTrab}</div><div class="stat-l">Días Trabajados</div></div>
    <div class="stat"><div class="stat-v">0</div><div class="stat-l">Días Licencia</div></div>
    <div class="stat"><div class="stat-v">${horasBase}</div><div class="stat-l">Horas Base</div></div>
    <div class="stat"><div class="stat-v">${fmt(calc.imponible)}</div><div class="stat-l">Tope Imponible</div></div>
    <div class="stat"><div class="stat-v">${fmt(rentaTrib)}</div><div class="stat-l">Tributable</div></div>
  </div>

  <!-- HABERES / DESCUENTOS (2 columnas) -->
  <div class="habdesc-grid">

    <!-- HABERES -->
    <div class="seccion">
      <div class="sec-header">Haberes</div>
      <table>
        <tr><td>Sueldo Base<span class="badge imp">Imponible</span></td><td>${fmt(calc.base)}</td></tr>
        ${calc.bProd     ? `<tr><td>Bono de Producción<span class="badge imp">Imponible</span></td><td>${fmt(calc.bProd)}</td></tr>` : ''}
        ${calc.montoHE   ? `<tr><td>Horas Extraordinarias<span class="badge imp">Imponible</span></td><td>${fmt(calc.montoHE)}</td></tr>` : ''}
        ${calc.otrosImp  ? `<tr><td>Otros Imponibles<span class="badge imp">Imponible</span></td><td>${fmt(calc.otrosImp)}</td></tr>` : ''}
        <tr><td>Gratificación Mensual<span class="badge imp">Imponible</span></td><td>${fmt(calc.gratMensual)}</td></tr>
        <tr class="subtotal-row"><td>TOTAL IMPONIBLE</td><td>${fmt(calc.imponible)}</td></tr>
        ${calc.bColacion ? `<tr><td>Colación</td><td>${fmt(calc.bColacion)}</td></tr>` : ''}
        ${calc.bMovil    ? `<tr><td>Movilización</td><td>${fmt(calc.bMovil)}</td></tr>` : ''}
        ${calc.viaticos  ? `<tr><td>Viáticos</td><td>${fmt(calc.viaticos)}</td></tr>` : ''}
        ${calc.otrosNoImp? `<tr><td>Otros No Imponibles</td><td>${fmt(calc.otrosNoImp)}</td></tr>` : ''}
        ${calc.noImponible ? `<tr class="subtotal-row"><td>TOTAL NO IMPONIBLE</td><td>${fmt(calc.noImponible)}</td></tr>` : ''}
        <tr class="subtotal-row"><td><b>TOTAL HABERES</b></td><td><b>${fmt(calc.imponible + calc.noImponible)}</b></td></tr>
      </table>
    </div>

    <!-- DESCUENTOS -->
    <div class="seccion">
      <div class="sec-header">Descuentos</div>
      <table>
        <tr><td>AFP ${trabajador?.afp||''} (${tasaAfp}% · Renta Imp.: ${fmt(calc.imponible)})</td><td class="desc">${fmt(calc.afpM)}</td></tr>
        <tr><td>Salud 7% (${trabajador?.prevision||'Fonasa'})</td><td class="desc">${fmt(calc.salM)}</td></tr>
        <tr><td>Seguro Cesantía Trabajador (${contrato?.tipoContrato==='Plazo Fijo'||contrato?.tipoContrato==='Obra o Faena'?'0.0':'0.6'}%)</td><td class="desc">${fmt(calc.cesM)}</td></tr>
        ${iut > 0 ? `<tr><td>Impuestos (Renta Tributable: ${fmt(rentaTrib)})</td><td class="desc">${fmt(iut)}</td></tr>` : ''}
        <tr class="subtotal-row"><td>TOTAL DESC. LEGALES</td><td class="desc">${fmt(calc.totalDescuentos + iut)}</td></tr>
        ${calc.anticipo ? `<tr><td>Anticipo de sueldo</td><td class="desc">${fmt(calc.anticipo)}</td></tr>` : ''}
        ${calc.descAdicional ? `<tr><td>${rem.glosaDescuento||'Descuento adicional'}</td><td class="desc">${fmt(calc.descAdicional)}</td></tr>` : ''}
        ${(calc.anticipo||calc.descAdicional) ? `<tr class="subtotal-row"><td>TOTAL OTROS DESC.</td><td class="desc">${fmt(calc.anticipo+calc.descAdicional)}</td></tr>` : ''}
      </table>
    </div>
  </div>

  <!-- TOTAL LÍQUIDO -->
  <div class="total-section">
    <div class="total-label">Alcance Líquido: ${mesLabel}</div>
    <div class="total-valor">${fmt(liquidoFinal)}</div>
  </div>

  <!-- COSTO EMPLEADOR -->
  <div class="emp-box">
    <b>Costo adicional empleador (referencial, no descontado al trabajador):</b>
    SIS 1.54%: ${fmt(calc.sisM)} · Cesantía empleador: ${fmt(calc.cesEmpM)} · Total costo empresa: ${fmt(calc.imponible + calc.noImponible + calc.sisM + calc.cesEmpM)}
  </div>

  <!-- CERTIFICACIÓN -->
  <div class="cert-box">
    Certifico que he recibido a mi entera satisfacción la suma de ${fmt(liquidoFinal)} indicada en la presente liquidación,
    y no tengo cargo ni cobro posterior que hacer por los conceptos de esta liquidación.
  </div>

  <!-- FIRMAS -->
  <div class="firma-row">
    <div class="firma">
      <div class="firma-linea"></div>
      <div class="firma-nombre">${contrato?.empresa||'MPF Ingeniería Civil'}</div>
      <div class="firma-cargo">Empleador / Departamento RRHH</div>
    </div>
    <div class="firma">
      <div class="firma-linea"></div>
      <div class="firma-nombre">${nombre}</div>
      <div class="firma-cargo">V°B° Trabajador/a — RUT: ${trabajador?.rut||'—'}</div>
    </div>
  </div>

  <div class="footer">
    Liquidación generada por FleetCore RRHH · ${contrato?.empresa||'MPF Ingeniería Civil'} · ${new Date().toLocaleDateString('es-CL')} ·
    Art. 54 CT: el empleador deberá entregar al trabajador un comprobante con indicación del monto pagado, de la forma en que se determinó y de las deducciones efectuadas.
  </div>

</div>
<script>window.onload=function(){window.print();}</script>
</body>
</html>`;

  const blob = new Blob([html], { type:'text/html;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const win  = window.open(url,'_blank');
  if(!win) alert('Habilita ventanas emergentes para descargar la liquidación.');
  setTimeout(()=>URL.revokeObjectURL(url), 60000);
}
function generarPDFResumenNomina(liquidaciones, periodoLabel) {
  const fmt = (n) => `$${(n||0).toLocaleString('es-CL')}`;
  const totalImp   = liquidaciones.reduce((s,l)=>s+(l._calc?.imponible||0),0);
  const totalNoImp = liquidaciones.reduce((s,l)=>s+(l._calc?.noImponible||0),0);
  const totalAfp   = liquidaciones.reduce((s,l)=>s+(l._calc?.afpM||0),0);
  const totalSalud = liquidaciones.reduce((s,l)=>s+(l._calc?.salM||0),0);
  const totalSis   = liquidaciones.reduce((s,l)=>s+(l._calc?.sisM||0),0);
  const totalCes   = liquidaciones.reduce((s,l)=>s+(l._calc?.cesM||0),0);
  const totalDesc  = liquidaciones.reduce((s,l)=>s+(l._calc?.totalDescuentos||0),0);
  const totalLiq   = liquidaciones.reduce((s,l)=>s+(l._calc?.liquido||0),0);
  const totalCesEmp= liquidaciones.reduce((s,l)=>s+(l._calc?.cesEmpM||0),0);

  const filas = liquidaciones.map(l => {
    const nombre = l._trabajador
      ? `${l._trabajador.apellidoPaterno} ${l._trabajador.nombre}`
      : 'Desconocido';
    const c = l._calc;
    return `<tr>
      <td>${nombre}</td>
      <td>${l._trabajador?.rut||'—'}</td>
      <td>${l._trabajador?.afp||'—'}</td>
      <td style="text-align:right">${fmt(c?.imponible)}</td>
      <td style="text-align:right;color:#dc2626">-${fmt(c?.afpM)}</td>
      <td style="text-align:right;color:#dc2626">-${fmt(c?.salM)}</td>
      <td style="text-align:right;color:#dc2626">-${fmt(c?.sisM+c?.cesM)}</td>
      <td style="text-align:right;color:#2563eb">${fmt(c?.noImponible)}</td>
      <td style="text-align:right;font-weight:900;color:#059669">${fmt(c?.liquido)}</td>
      <td style="text-align:center"><span style="padding:2px 6px;border-radius:4px;font-size:9pt;font-weight:700;background:${l.estado==='pagado'?'#dcfce7':'#fef3c7'};color:${l.estado==='pagado'?'#166534':'#92400e'}">${l.estado==='pagado'?'Pagado':'Pendiente'}</span></td>
    </tr>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"/>
<title>Resumen Nómina — ${periodoLabel}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box;}
  body{font-family:Arial,sans-serif;font-size:9.5pt;color:#1a1a1a;}
  .page{max-width:1000px;margin:0 auto;padding:28px 36px;}
  .header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #1a1a1a;padding-bottom:12px;margin-bottom:18px;}
  .empresa{font-size:15pt;font-weight:900;text-transform:uppercase;}
  .titulo{font-size:12pt;font-weight:900;text-align:right;}
  .periodo{font-size:10pt;color:#555;text-align:right;margin-top:2px;}
  .resumen{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px;}
  .card{background:#f8f8f8;border:1px solid #e0e0e0;border-radius:6px;padding:10px 14px;}
  .card-label{font-size:8pt;font-weight:700;text-transform:uppercase;color:#666;letter-spacing:0.3px;}
  .card-value{font-size:14pt;font-weight:900;margin-top:2px;}
  table{width:100%;border-collapse:collapse;font-size:9pt;}
  th{background:#1a1a1a;color:#fff;padding:6px 8px;text-align:left;font-size:8pt;text-transform:uppercase;letter-spacing:0.3px;}
  td{padding:5px 8px;border-bottom:1px solid #eee;vertical-align:middle;}
  tr:nth-child(even) td{background:#f9f9f9;}
  .total-row td{font-weight:900;font-size:10pt;border-top:2px solid #1a1a1a;background:#f0f0f0;}
  .costo-emp{background:#fffde7;border:1px solid #fde047;border-radius:6px;padding:10px 14px;margin-top:14px;font-size:9pt;}
  .footer{margin-top:16px;border-top:1px solid #ddd;padding-top:8px;font-size:8pt;color:#888;text-align:center;}
  @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}}
</style></head><body>
<div class="page">
  <div class="header">
    <div>
      <div class="empresa">Resumen Nómina</div>
      <div style="font-size:10pt;color:#555;margin-top:3px;">Período: ${periodoLabel} · ${liquidaciones.length} trabajadores</div>
    </div>
    <div>
      <div class="titulo">MPF Ingeniería Civil</div>
      <div class="periodo">Emitido: ${new Date().toLocaleDateString('es-CL')}</div>
    </div>
  </div>

  <div class="resumen">
    <div class="card"><div class="card-label">Total imponible</div><div class="card-value" style="color:#5b21b6">${fmt(totalImp)}</div></div>
    <div class="card"><div class="card-label">Total cotizaciones</div><div class="card-value" style="color:#dc2626">-${fmt(totalDesc)}</div></div>
    <div class="card"><div class="card-label">Total no imponible</div><div class="card-value" style="color:#2563eb">${fmt(totalNoImp)}</div></div>
    <div class="card"><div class="card-label">Total líquido a pagar</div><div class="card-value" style="color:#059669">${fmt(totalLiq)}</div></div>
  </div>

  <table>
    <thead><tr>
      <th>Trabajador</th><th>RUT</th><th>AFP</th>
      <th style="text-align:right">Imponible</th>
      <th style="text-align:right">AFP</th>
      <th style="text-align:right">Salud</th>
      <th style="text-align:right">SIS+Ces.</th>
      <th style="text-align:right">No Imp.</th>
      <th style="text-align:right">Líquido</th>
      <th style="text-align:center">Estado</th>
    </tr></thead>
    <tbody>${filas}</tbody>
    <tfoot><tr class="total-row">
      <td colspan="3">TOTALES (${liquidaciones.length} trabajadores)</td>
      <td style="text-align:right">${fmt(totalImp)}</td>
      <td style="text-align:right;color:#dc2626">-${fmt(totalAfp)}</td>
      <td style="text-align:right;color:#dc2626">-${fmt(totalSalud)}</td>
      <td style="text-align:right;color:#dc2626">-${fmt(totalSis+totalCes)}</td>
      <td style="text-align:right;color:#2563eb">${fmt(totalNoImp)}</td>
      <td style="text-align:right;color:#059669;font-size:11pt">${fmt(totalLiq)}</td>
      <td></td>
    </tr></tfoot>
  </table>

  <div class="costo-emp">
    <strong>📋 Costo total empresa (referencial):</strong>
    Cesantía empleador: ${fmt(totalCesEmp)} · SIS empleador: ${fmt(totalSis)} ·
    <strong>Costo bruto total empresa: ${fmt(totalImp + totalNoImp + totalCesEmp + totalSis)}</strong>
  </div>
  <div class="footer">Resumen generado por FleetCore RRHH · ${new Date().toLocaleDateString('es-CL')} · Los valores corresponden a estimaciones. Verificar con liquidaciones individuales.</div>
</div>
<script>window.onload=function(){window.print();}</script>
</body></html>`;

  const blob = new Blob([html], { type:'text/html;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const win  = window.open(url,'_blank');
  if(!win) alert('Habilita ventanas emergentes para descargar el resumen.');
  setTimeout(()=>URL.revokeObjectURL(url), 60000);
}
function generarPDFFiniquito(fin, trabajador, contrato) {
  const calc   = calcularFiniquito(fin, contrato, trabajador);
  const fmt    = (n) => `$${(n||0).toLocaleString('es-CL')}`;
  const fmtF   = (f) => {
    if (!f) return '_______________';
    const [y,m,d] = f.split('-');
    const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
    return `${parseInt(d)} de ${meses[parseInt(m)-1]} de ${y}`;
  };
  const nombre = trabajador
    ? `${trabajador.nombre} ${trabajador.apellidoPaterno} ${trabajador.apellidoMaterno||''}`.trim()
    : '_______________';
  const causalLabel = CAUSALES_TERMINO.find(c=>c.codigo===fin.causal)?.label || fin.causal || '_______________';
  const empresa = contrato?.empresa || 'MPF Ingeniería Civil';

  const html = `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"/>
<title>Finiquito — ${nombre}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box;}
  body{font-family:'Times New Roman',Times,serif;font-size:11pt;color:#1a1a1a;background:#fff;}
  .page{max-width:820px;margin:0 auto;padding:36px 56px;}
  .header{text-align:center;border-bottom:3px double #1a1a1a;padding-bottom:16px;margin-bottom:24px;}
  .logo-empresa{font-size:17pt;font-weight:900;text-transform:uppercase;letter-spacing:1px;}
  .titulo{font-size:15pt;font-weight:900;text-transform:uppercase;letter-spacing:2px;margin:12px 0 4px;}
  .subtitulo{font-size:10pt;color:#555;}
  .parrafo{line-height:1.85;text-align:justify;margin-bottom:14px;}
  .clausula-titulo{font-size:10.5pt;font-weight:900;text-transform:uppercase;border-left:3px solid #1a1a1a;padding-left:8px;margin:18px 0 8px;letter-spacing:0.3px;}
  .tabla-liq{width:100%;border-collapse:collapse;margin:10px 0;font-size:10.5pt;}
  .tabla-liq th{background:#1a1a1a;color:#fff;padding:6px 12px;text-align:left;font-size:9pt;text-transform:uppercase;}
  .tabla-liq td{padding:6px 12px;border-bottom:1px solid #e5e5e5;}
  .tabla-liq td:last-child{text-align:right;font-weight:700;}
  .tabla-liq tr:nth-child(even) td{background:#f9f9f9;}
  .subtotal-row td{font-weight:900;background:#f0f0f0;border-top:1.5px solid #bbb;}
  .descuento{color:#dc2626;}
  .total-box{background:#1a1a1a;color:#fff;padding:14px 18px;border-radius:6px;display:flex;justify-content:space-between;align-items:center;margin:16px 0;}
  .total-label{font-size:11.5pt;font-weight:900;text-transform:uppercase;letter-spacing:0.5px;}
  .total-valor{font-size:20pt;font-weight:900;color:#4ade80;}
  .info-box{background:#f8f8f8;border:1px solid #e0e0e0;border-radius:5px;padding:12px 16px;font-size:10pt;line-height:1.7;margin-bottom:14px;}
  .info-box strong{color:#1a1a1a;}
  .alerta{background:#fffde7;border:1px solid #fde047;border-radius:5px;padding:10px 14px;font-size:9.5pt;line-height:1.6;margin-bottom:14px;}
  .firma-row{display:flex;justify-content:space-between;margin-top:56px;gap:40px;}
  .firma{flex:1;text-align:center;}
  .firma-linea{border-top:1.5px solid #1a1a1a;margin-bottom:7px;margin-top:50px;}
  .firma-nombre{font-weight:900;font-size:10pt;}
  .firma-detalle{font-size:9.5pt;color:#555;}
  .nota-legal{margin-top:22px;border-top:1px solid #ddd;padding-top:10px;font-size:8.5pt;color:#666;line-height:1.6;text-align:center;}
  @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}.page{padding:20px 36px;}}
</style></head><body>
<div class="page">

  <div class="header">
    <div class="logo-empresa">${empresa}</div>
    <div class="titulo">Finiquito de Trabajo</div>
    <div class="subtitulo">Conforme a los artículos 159–163 y 177 del Código del Trabajo de la República de Chile</div>
  </div>

  <div class="clausula-titulo">I. Partes y Antecedentes</div>
  <div class="parrafo">
    En <strong>${fin.lugarFirma||'Santiago'}</strong>, a ${fmtF(fin.fechaTermino)}, entre <strong>${empresa}</strong> (en adelante "El Empleador"), y don/doña <strong>${nombre}</strong>, RUT <strong>${trabajador?.rut||'_______________'}</strong>, de nacionalidad ${trabajador?.nacionalidad||'chilena'}, domiciliado/a en ${[trabajador?.direccion,trabajador?.comuna,trabajador?.region].filter(Boolean).join(', ')||'_______________'}, (en adelante "El/La Trabajador/a"), se ha convenido el siguiente finiquito de contrato de trabajo.
  </div>

  <div class="info-box">
    <strong>Fecha de ingreso:</strong> ${fmtF(contrato?.fechaInicio||trabajador?.fechaIngreso)} &nbsp;·&nbsp;
    <strong>Fecha de término:</strong> ${fmtF(fin.fechaTermino)} &nbsp;·&nbsp;
    <strong>Antigüedad:</strong> ${calc.anios} año${calc.anios!==1?'s':''} ${calc.meses} mes${calc.meses!==1?'es':''} &nbsp;·&nbsp;
    <strong>Cargo:</strong> ${contrato?.cargo||trabajador?.cargo||'—'} &nbsp;·&nbsp;
    <strong>Tipo contrato:</strong> ${contrato?.tipoContrato||'—'}
  </div>

  <div class="clausula-titulo">II. Causal de Término</div>
  <div class="parrafo">
    El contrato de trabajo termina por la causal <strong>${causalLabel}</strong>.
    ${fin.causal==='161' ? 'En conformidad al artículo 161 del Código del Trabajo, por necesidades de la empresa, establecimiento o servicio.' : ''}
    ${fin.causal==='159-2' ? 'El/la trabajador/a declara haber presentado su renuncia voluntaria con la debida anticipación legal.' : ''}
    ${fin.causal==='159-4' ? 'El contrato de plazo fijo ha llegado a su fecha de vencimiento pactada.' : ''}
  </div>

  <div class="clausula-titulo">III. Liquidación de Haberes</div>
  <div class="parrafo">Las partes acuerdan la siguiente liquidación de haberes al término del contrato:</div>

  <table class="tabla-liq">
    <thead><tr><th>Concepto</th><th>Detalle</th><th style="text-align:right">Monto</th></tr></thead>
    <tbody>
      <tr><td>Última remuneración mensual base</td><td>Sueldo mes en curso</td><td>${fmt(calc.ultimaRemuneracion)}</td></tr>
      ${calc.feriadoPropMonto ? `<tr><td>Feriado proporcional (Art. 73 CT)</td><td>${calc.feriadoPropDias} días hábiles</td><td>${fmt(calc.feriadoPropMonto)}</td></tr>` : ''}
      ${calc.feriadoPendiente ? `<tr><td>Feriado pendiente acumulado</td><td>${calc.feriadoPendiente} días</td><td>${fmt(calc.feriadoPendMonto)}</td></tr>` : ''}
      ${calc.gratPropMonto ? `<tr><td>Gratificación proporcional</td><td>${calc.mesesAnioActual} meses año en curso</td><td>${fmt(calc.gratPropMonto)}</td></tr>` : ''}
      ${calc.remPendiente ? `<tr><td>Remuneraciones pendientes</td><td>Períodos adeudados</td><td>${fmt(calc.remPendiente)}</td></tr>` : ''}
      ${calc.tieneIndemnizacion ? `<tr><td><strong>Indemnización por años de servicio (Art. 163 CT)</strong></td><td>${calc.aniosIndemnizacion} año${calc.aniosIndemnizacion!==1?'s':''} × ${fmt(calc.ultimaRemuneracion)}</td><td><strong>${fmt(calc.indemMonto)}</strong></td></tr>` : ''}
      ${calc.indемAvisoPrevio ? `<tr><td>Indemnización sustitutiva aviso previo (Art. 161 CT)</td><td>Equivalente a 1 mes de remuneración</td><td>${fmt(calc.indемAvisoPrevio)}</td></tr>` : ''}
    </tbody>
    <tfoot>
      <tr class="subtotal-row"><td colspan="2">Total Haberes</td><td>${fmt(calc.totalHaberes)}</td></tr>
      ${calc.anticipoPend ? `<tr><td colspan="2" class="descuento">Descuento: anticipo de remuneraciones</td><td class="descuento">-${fmt(calc.anticipoPend)}</td></tr>` : ''}
      ${calc.otrosDescuentos ? `<tr><td colspan="2" class="descuento">Otros descuentos (${fin.glosaDescuento||'varios'})</td><td class="descuento">-${fmt(calc.otrosDescuentos)}</td></tr>` : ''}
    </tfoot>
  </table>

  <div class="total-box">
    <div class="total-label">Total Finiquito a Pagar</div>
    <div class="total-valor">${fmt(calc.totalFiniquito)}</div>
  </div>

  ${!calc.tieneIndemnizacion && CAUSALES_SIN_INDEMNIZACION.includes(fin.causal) ? `
  <div class="alerta">
    ⚠ <strong>Nota:</strong> La causal invocada (Art. 160 CT) corresponde a incumplimiento imputable al trabajador. No procede indemnización por años de servicio según Art. 163 CT.
  </div>` : ''}

  <div class="clausula-titulo">IV. Declaración de Pago y Finiquito</div>
  <div class="parrafo">
    El/La Trabajador/a declara recibir del Empleador la suma total de <strong>${fmt(calc.totalFiniquito)}</strong> por concepto de liquidación final de haberes, y otorga el más amplio y completo finiquito al Empleador por las obligaciones derivadas del contrato de trabajo que hoy termina, sin reserva ni excepción alguna, no teniendo nada más que reclamar por ningún concepto relacionado con el contrato de trabajo referido.
  </div>

  <div class="clausula-titulo">V. Ratificación (Art. 177 CT)</div>
  <div class="parrafo">
    El presente finiquito debe ser ratificado por el/la trabajador/a ante un Ministro de Fe: <strong>Notario Público, Inspector del Trabajo, o Presidente del Sindicato</strong>. Sin este requisito, el finiquito no producirá el efecto de extinguir las acciones del trabajador.
  </div>

  ${fin.observaciones ? `<div class="clausula-titulo">VI. Observaciones</div><div class="parrafo">${fin.observaciones}</div>` : ''}

  <div class="firma-row">
    <div class="firma">
      <div class="firma-linea"></div>
      <div class="firma-nombre">${empresa}</div>
      <div class="firma-detalle">Empleador / Representante Legal</div>
      <div class="firma-detalle" style="margin-top:3px">RUT: _______________</div>
    </div>
    <div class="firma">
      <div class="firma-linea"></div>
      <div class="firma-nombre">${nombre}</div>
      <div class="firma-detalle">Trabajador/a — RUT: ${trabajador?.rut||'—'}</div>
      <div class="firma-detalle" style="margin-top:3px">Fecha: _______________</div>
    </div>
    <div class="firma">
      <div class="firma-linea"></div>
      <div class="firma-nombre">Ministro de Fe</div>
      <div class="firma-detalle">Notario / Inspector del Trabajo</div>
      <div class="firma-detalle" style="margin-top:3px">RUT: _______________</div>
    </div>
  </div>

  <div class="nota-legal">
    Documento generado por FleetCore RRHH · ${new Date().toLocaleDateString('es-CL')} ·
    Art. 177 CT: el finiquito ratificado por ministro de fe y firmado por ambas partes produce el efecto de extinguir las acciones y derechos del trabajador emanados del contrato.
    Este documento debe ser revisado por un profesional habilitado antes de su firma.
  </div>
</div>
<script>window.onload=function(){window.print();}</script>
</body></html>`;

  const blob = new Blob([html], {type:'text/html;charset=utf-8'});
  const url  = URL.createObjectURL(blob);
  const win  = window.open(url,'_blank');
  if(!win) alert('Habilita ventanas emergentes para descargar el finiquito.');
  setTimeout(()=>URL.revokeObjectURL(url), 60000);
}
function generarPDFAnexo(anexo, contrato, trabajador, nroAnexo) {
  const fmtFecha = (f) => {
    if (!f) return '_______________';
    const [y,m,d] = f.split('-');
    const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
    return `${parseInt(d)} de ${meses[parseInt(m)-1]} de ${y}`;
  };
  const fmt   = n => n ? `$${parseInt(n).toLocaleString('es-CL')}` : '$0';
  const nombre = trabajador
    ? `${trabajador.nombre} ${trabajador.apellidoPaterno} ${trabajador.apellidoMaterno||''}`.trim()
    : '_______________';
  const tipoLabel = TIPOS_ANEXO.find(t=>t.value===anexo.tipo)?.label || 'Modificación contractual';
  const empresa   = contrato?.empresa || 'MPF Ingeniería Civil';

  // Construir cláusula de modificación según tipo
  let clausulaModif = '';
  switch(anexo.tipo) {
    case 'aumento_sueldo':
      clausulaModif = `A contar de la fecha del presente anexo, la remuneración mensual del/la trabajador/a queda establecida en la suma de <strong>${fmt(anexo.sueldoBase)}</strong> pesos brutos mensuales${anexo.bonoProduccion?`, más un bono de producción de <strong>${fmt(anexo.bonoProduccion)}</strong>`:''}, reemplazando en este aspecto lo estipulado en el contrato original. Las demás cláusulas del contrato permanecen inalteradas.`;
      break;
    case 'cambio_cargo':
      clausulaModif = `A contar de la fecha del presente anexo, el/la trabajador/a desempeñará el cargo de <strong>${anexo.cargo||'_______________'}</strong>${anexo.centroCosto?`, en el centro de costo "${anexo.centroCosto}"`:''}.${anexo.funciones?` Sus funciones serán: ${anexo.funciones}.`:''} Esta modificación no implica menoscabo para el/la trabajador/a en conformidad al artículo 12 del Código del Trabajo.`;
      break;
    case 'cambio_jornada':
      clausulaModif = `A contar de la fecha del presente anexo, la jornada de trabajo del/la trabajador/a queda establecida como <strong>${anexo.jornada||'_______________'}</strong>, modificándose la jornada pactada originalmente en el contrato.`;
      break;
    case 'cambio_lugar':
      clausulaModif = `A contar de la fecha del presente anexo, el lugar de prestación de los servicios queda establecido en <strong>${anexo.lugarTrabajo||'_______________'}</strong>. Esta modificación se realiza por necesidades de la empresa y no implica menoscabo para el/la trabajador/a.`;
      break;
    case 'cambio_empresa':
      clausulaModif = `A contar de la fecha del presente anexo, la empresa empleadora pasa a ser <strong>${anexo.empresa||'_______________'}</strong>, manteniéndose todos los demás términos y condiciones del contrato de trabajo original, y reconociéndose expresamente la antigüedad del/la trabajador/a desde su fecha de ingreso original.`;
      break;
    case 'prorroga':
      clausulaModif = `Las partes acuerdan prorrogar el contrato de trabajo de plazo fijo hasta el día <strong>${fmtFecha(anexo.fechaFin)}</strong>, en conformidad al artículo 159 N°4 del Código del Trabajo. Se hace constar que ${nroAnexo >= 2 ? 'esta es la segunda prórroga, por lo que el contrato se convierte en indefinido según el artículo 159 N°4 inciso 2° del CT.' : 'esta es la primera prórroga del contrato.'}`;
      break;
    case 'otros_bonos':
      clausulaModif = `A contar de la fecha del presente anexo, se modifican los siguientes beneficios adicionales: ${[
        anexo.bonoColacion     ? `Bono de colación: ${fmt(anexo.bonoColacion)} (no imponible)` : '',
        anexo.bonoMovilizacion ? `Bono de movilización: ${fmt(anexo.bonoMovilizacion)} (no imponible)` : '',
        anexo.viaticos         ? `Viáticos: ${fmt(anexo.viaticos)}` : '',
        anexo.horasExtra       ? `Horas extra pactadas: ${anexo.horasExtra} hrs/sem a $${parseInt(anexo.valorHoraExtra||0).toLocaleString('es-CL')} c/u` : '',
      ].filter(Boolean).join('; ')}.`;
      break;
    default:
      clausulaModif = anexo.otroDetalle || anexo.descripcion || 'Las partes acuerdan la modificación descrita en la cláusula precedente, manteniéndose inalteradas las demás estipulaciones del contrato original.';
  }

  const html = `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"/>
<title>Anexo N°${nroAnexo} — ${nombre}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box;}
  body{font-family:'Times New Roman',Times,serif;font-size:11pt;color:#1a1a1a;background:#fff;}
  .page{max-width:780px;margin:0 auto;padding:36px 56px;}
  .header{text-align:center;border-bottom:3px double #1a1a1a;padding-bottom:14px;margin-bottom:22px;}
  .empresa{font-size:16pt;font-weight:900;text-transform:uppercase;letter-spacing:1px;}
  .titulo{font-size:13pt;font-weight:900;text-transform:uppercase;letter-spacing:2px;margin:10px 0 3px;}
  .subtitulo{font-size:10pt;color:#555;}
  .info-box{background:#f7f7f9;border-left:4px solid #5b21b6;padding:10px 16px;border-radius:0 6px 6px 0;margin-bottom:18px;font-size:10pt;line-height:1.8;}
  .clausula-titulo{font-size:10pt;font-weight:900;text-transform:uppercase;border-left:3px solid #1a1a1a;padding-left:8px;margin:18px 0 8px;letter-spacing:0.3px;}
  .parrafo{line-height:1.85;text-align:justify;margin-bottom:12px;font-size:11pt;}
  .firma-row{display:flex;justify-content:space-between;margin-top:60px;gap:40px;}
  .firma{flex:1;text-align:center;}
  .firma-linea{border-top:1.5px solid #1a1a1a;margin-bottom:6px;margin-top:50px;}
  .firma-nombre{font-weight:900;font-size:9.5pt;}
  .firma-cargo{font-size:9pt;color:#555;}
  .footer{margin-top:20px;border-top:1px solid #ddd;padding-top:10px;font-size:8pt;color:#888;text-align:center;line-height:1.6;}
  @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}.page{padding:20px 36px;}}
</style></head><body>
<div class="page">
  <div class="header">
    <div class="empresa">${empresa}</div>
    <div class="titulo">Anexo N°${nroAnexo} al Contrato de Trabajo</div>
    <div class="subtitulo">${tipoLabel} · Fecha: ${fmtFecha(anexo.fechaAnexo)}</div>
  </div>

  <div class="info-box">
    <strong>Trabajador/a:</strong> ${nombre} &nbsp;·&nbsp; <strong>RUT:</strong> ${trabajador?.rut||'—'} &nbsp;·&nbsp;
    <strong>Cargo:</strong> ${contrato?.cargo||'—'} &nbsp;·&nbsp;
    <strong>Ingreso:</strong> ${fmtFecha(contrato?.fechaInicio)} &nbsp;·&nbsp;
    <strong>Contrato original:</strong> ${contrato?.tipoContrato||'—'}
  </div>

  <div class="clausula-titulo">I. Partes</div>
  <div class="parrafo">
    En <strong>${contrato?.lugarTrabajo||'Santiago'}</strong>, a ${fmtFecha(anexo.fechaAnexo)}, entre <strong>${empresa}</strong> (el "Empleador") y don/doña <strong>${nombre}</strong>, RUT <strong>${trabajador?.rut||'—'}</strong> (el/la "Trabajador/a"), ambas partes del contrato de trabajo suscrito con fecha ${fmtFecha(contrato?.fechaInicio)}, se conviene el presente Anexo N°${nroAnexo}.
  </div>

  <div class="clausula-titulo">II. Modificación Acordada — ${tipoLabel}</div>
  <div class="parrafo">${clausulaModif}</div>

  ${anexo.descripcion && anexo.tipo !== 'otro' ? `
  <div class="clausula-titulo">III. Antecedentes Adicionales</div>
  <div class="parrafo">${anexo.descripcion}</div>` : ''}

  <div class="clausula-titulo">${anexo.descripcion && anexo.tipo !== 'otro' ? 'IV' : 'III'}. Vigencia y Demás Estipulaciones</div>
  <div class="parrafo">
    El presente anexo entra en vigencia a contar del ${fmtFecha(anexo.fechaAnexo)}. En todo lo no modificado por el presente instrumento, mantienen plena vigencia las estipulaciones del contrato de trabajo original y sus modificaciones anteriores. Ambas partes declaran estar de acuerdo con las modificaciones precedentemente señaladas, firmando en señal de conformidad.
  </div>

  <div class="firma-row">
    <div class="firma">
      <div class="firma-linea"></div>
      <div class="firma-nombre">${empresa}</div>
      <div class="firma-cargo">Empleador / Representante Legal</div>
    </div>
    <div class="firma">
      <div class="firma-linea"></div>
      <div class="firma-nombre">${nombre}</div>
      <div class="firma-cargo">Trabajador/a — RUT: ${trabajador?.rut||'—'}</div>
    </div>
  </div>

  <div class="footer">
    Anexo N°${nroAnexo} · ${tipoLabel} · ${empresa} · ${new Date().toLocaleDateString('es-CL')} ·
    Art. 11 CT: Las modificaciones al contrato de trabajo se consignarán por escrito y serán firmadas por ambas partes en dos ejemplares del mismo tenor.
  </div>
</div>
<script>window.onload=function(){window.print();}</script>
</body></html>`;

  const blob = new Blob([html],{type:'text/html;charset=utf-8'});
  const url  = URL.createObjectURL(blob);
  const win  = window.open(url,'_blank');
  if(!win) alert('Habilita ventanas emergentes para descargar el anexo.');
  setTimeout(()=>URL.revokeObjectURL(url), 60000);
}
function generarCertificadoAnual(trabajador, contrato, liquidacionesAnio, anio, utm) {
  const fmt   = n => `$${Math.round(n||0).toLocaleString('es-CL')}`;
  const fmtN  = n => Math.round(n||0).toLocaleString('es-CL');
  const utmVal = utm || UTM_DEFAULT;
  const nombre = trabajador
    ? `${trabajador.nombre} ${trabajador.apellidoPaterno} ${trabajador.apellidoMaterno||''}`.trim()
    : '_______________';
  const empresa    = contrato?.empresa    || 'MPF Ingeniería Civil';
  const rutEmpresa = contrato?.rutEmpresa || '77.158.216-8';

  // ── Acumular totales ──────────────────────────────────────────────────────
  let totalImp=0, totalNoImp=0, totalTrib=0;
  let totalAfp=0, totalSalud=0, totalCesTrab=0, totalSisEmp=0;
  let totalIUT=0, totalLiquido=0;

  const filasMeses = liquidacionesAnio.map(liq => {
    const c = calcularLiquidacionConIUT({ ...contrato, ...liq, afp: trabajador?.afp }, utmVal);
    const rentaTrib = Math.max(0, c.imponible - c.afpM - c.salM - c.cesM - c.sisM);
    totalImp      += c.imponible;
    totalNoImp    += c.noImponible;
    totalTrib     += rentaTrib;
    totalAfp      += c.afpM;
    totalSalud    += c.salM;
    totalCesTrab  += c.cesM;
    totalSisEmp   += c.sisM;
    totalIUT      += c.iut;
    totalLiquido  += c.liquidoFinal;
    return `<tr>
      <td>${MESES[parseInt(liq.mes)-1]||liq.mes}</td>
      <td class="nr">${fmtN(c.imponible)}</td>
      <td class="nr">${fmtN(c.noImponible)}</td>
      <td class="nr red">-${fmtN(c.afpM)}</td>
      <td class="nr red">-${fmtN(c.salM)}</td>
      <td class="nr red">-${fmtN(c.cesM)}</td>
      <td class="nr red">-${fmtN(c.sisM)}</td>
      <td class="nr trib">${fmtN(rentaTrib)}</td>
      <td class="nr purple">-${fmtN(c.iut)}</td>
      <td class="nr green bold">${fmtN(c.liquidoFinal)}</td>
    </tr>`;
  }).join('');

  const totalCotiz = totalAfp + totalSalud + totalCesTrab + totalSisEmp;

  const html = `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"/>
<title>Certificado Anual Remuneraciones — ${nombre} — ${anio}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box;}
  body{font-family:Arial,Helvetica,sans-serif;font-size:9.5pt;color:#111;background:#fff;}
  .page{max-width:960px;margin:0 auto;padding:28px 36px;}
  .header{display:flex;justify-content:space-between;align-items:flex-start;
          border-bottom:3px solid #003087;padding-bottom:12px;margin-bottom:16px;}
  .emp-nombre{font-size:13pt;font-weight:900;text-transform:uppercase;color:#003087;}
  .emp-rut{font-size:8.5pt;color:#555;margin-top:3px;}
  .sii-bloque{text-align:right;}
  .sii-badge{display:inline-block;background:#003087;color:#fff;font-size:9pt;
             font-weight:900;padding:4px 12px;border-radius:4px;letter-spacing:.5px;}
  .doc-title{font-size:11.5pt;font-weight:900;margin-top:5px;color:#111;}
  .doc-sub{font-size:8.5pt;color:#555;margin-top:2px;}
  .art-tag{display:inline-block;background:#e8f0fe;color:#1a56db;font-size:8pt;
           font-weight:700;padding:2px 8px;border-radius:10px;margin-top:4px;border:1px solid #c3d8fd;}
  .ficha{display:grid;grid-template-columns:repeat(6,1fr);gap:0;
         border:1px solid #d1d5db;border-radius:6px;overflow:hidden;margin-bottom:16px;}
  .ficha-cell{padding:8px 12px;border-right:1px solid #e5e7eb;}
  .ficha-cell:last-child{border-right:none;}
  .ficha-cell .lbl{font-size:7.5pt;font-weight:700;text-transform:uppercase;color:#6b7280;margin-bottom:2px;}
  .ficha-cell .val{font-size:9.5pt;font-weight:700;color:#111;}
  .ficha-header{background:#f3f4f6;grid-column:1/-1;padding:6px 12px;
                font-size:8pt;font-weight:900;text-transform:uppercase;
                letter-spacing:.5px;color:#374151;border-bottom:1px solid #d1d5db;}
  .sec-titulo{font-size:8pt;font-weight:900;text-transform:uppercase;
              letter-spacing:.5px;background:#1e3a5f;color:#fff;padding:5px 10px;margin-bottom:0;}
  table{width:100%;border-collapse:collapse;font-size:8.5pt;}
  th{background:#374151;color:#fff;padding:5px 8px;font-size:7.5pt;text-transform:uppercase;white-space:nowrap;}
  th.nr,td.nr{text-align:right;}
  td{padding:4px 8px;border-bottom:1px solid #f0f0f0;}
  tr:nth-child(even) td{background:#fafafa;}
  td.red{color:#dc2626;}
  td.purple{color:#7c3aed;}
  td.green{color:#059669;}
  td.trib{color:#0369a1;font-weight:700;}
  td.bold{font-weight:900;}
  .total-row td{font-weight:900;font-size:9pt;border-top:2px solid #1a1a1a;background:#f0f0f0;}
  .trib-nota{font-size:7.5pt;color:#0369a1;font-style:italic;padding:3px 8px;
             background:#f0f9ff;border-bottom:1px solid #bae6fd;}
  .resumen{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin:14px 0;}
  .card{border:1px solid #e0e0e0;border-radius:6px;padding:10px 12px;}
  .card .lbl{font-size:7.5pt;font-weight:700;text-transform:uppercase;color:#6b7280;}
  .card .val{font-size:13pt;font-weight:900;margin-top:2px;}
  .disclaimer{background:#fffde7;border:1px solid #fde047;border-radius:5px;
              padding:10px 14px;font-size:8pt;margin-top:12px;line-height:1.65;}
  .firma-row{display:flex;justify-content:space-between;margin-top:36px;gap:40px;}
  .firma{flex:1;text-align:center;}
  .firma-linea{border-top:1.5px solid #1a1a1a;margin-bottom:5px;margin-top:44px;}
  .firma-nombre{font-weight:900;font-size:9.5pt;}
  .firma-sub{font-size:8pt;color:#555;margin-top:2px;}
  .footer{margin-top:14px;border-top:1px solid #ddd;padding-top:8px;
          font-size:7.5pt;color:#999;text-align:center;line-height:1.7;}
  @media print{
    body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}
    @page{margin:15mm 12mm;}
  }
</style></head><body>
<div class="page">

  <div class="header">
    <div>
      <div class="emp-nombre">${empresa}</div>
      <div class="emp-rut">RUT Empleador: ${rutEmpresa} &nbsp;·&nbsp; Giro: Ingeniería y Construcción</div>
    </div>
    <div class="sii-bloque">
      <div class="sii-badge">SII — Formulario 1887</div>
      <div class="doc-title">Certificado Anual de Remuneraciones</div>
      <div class="doc-sub">Año tributario ${parseInt(anio)+1} &nbsp;·&nbsp; Año comercial ${anio}</div>
      <span class="art-tag">Art. 42 N°1 LIR &nbsp;|&nbsp; Art. 101 LIR</span>
    </div>
  </div>

  <div class="ficha">
    <div class="ficha-header">Datos del Trabajador</div>
    <div class="ficha-cell"><div class="lbl">Nombre</div><div class="val">${nombre}</div></div>
    <div class="ficha-cell"><div class="lbl">RUT</div><div class="val">${trabajador?.rut||'—'}</div></div>
    <div class="ficha-cell"><div class="lbl">Cargo</div><div class="val">${contrato?.cargo||'—'}</div></div>
    <div class="ficha-cell"><div class="lbl">AFP</div><div class="val">${trabajador?.afp||'—'}</div></div>
    <div class="ficha-cell"><div class="lbl">Salud</div><div class="val">${trabajador?.prevision||'FONASA'}</div></div>
    <div class="ficha-cell"><div class="lbl">UTM Promedio</div><div class="val">$${utmVal.toLocaleString('es-CL')}</div></div>
  </div>

  <div class="sec-titulo">Detalle Mensual ${anio}</div>
  <table>
    <thead><tr>
      <th>Mes</th>
      <th class="nr">Rem. Imponible</th>
      <th class="nr">No Imponible</th>
      <th class="nr">AFP / IPS</th>
      <th class="nr">Salud 7%</th>
      <th class="nr">AFC Trab.</th>
      <th class="nr">SIS Emp.</th>
      <th class="nr" style="color:#93c5fd">Renta Tributable *</th>
      <th class="nr" style="color:#c4b5fd">IUT 2ª Cat.</th>
      <th class="nr">Líquido Pagado</th>
    </tr></thead>
    <tbody>${filasMeses}</tbody>
    <tfoot>
      <tr><td colspan="10" class="trib-nota">
        * Renta Tributable = Rem. Imponible − AFP − Salud − AFC Trab. − SIS &nbsp;(base de cálculo IUT según Art. 42 N°1 LIR)
      </td></tr>
      <tr class="total-row">
        <td>TOTALES ${anio}</td>
        <td class="nr">${fmtN(totalImp)}</td>
        <td class="nr">${fmtN(totalNoImp)}</td>
        <td class="nr red">-${fmtN(totalAfp)}</td>
        <td class="nr red">-${fmtN(totalSalud)}</td>
        <td class="nr red">-${fmtN(totalCesTrab)}</td>
        <td class="nr red">-${fmtN(totalSisEmp)}</td>
        <td class="nr trib">${fmtN(totalTrib)}</td>
        <td class="nr purple">-${fmtN(totalIUT)}</td>
        <td class="nr green bold">${fmtN(totalLiquido)}</td>
      </tr>
    </tfoot>
  </table>

  <div class="resumen">
    <div class="card">
      <div class="lbl">Renta Imponible Anual</div>
      <div class="val" style="color:#1e3a5f">${fmt(totalImp)}</div>
    </div>
    <div class="card">
      <div class="lbl">Renta Tributable Anual</div>
      <div class="val" style="color:#0369a1">${fmt(totalTrib)}</div>
    </div>
    <div class="card">
      <div class="lbl">Total Cotizaciones</div>
      <div class="val" style="color:#dc2626">-${fmt(totalCotiz)}</div>
    </div>
    <div class="card">
      <div class="lbl">Total IUT 2ª Cat.</div>
      <div class="val" style="color:#7c3aed">-${fmt(totalIUT)}</div>
    </div>
    <div class="card">
      <div class="lbl">Total Líquido Anual</div>
      <div class="val" style="color:#059669">${fmt(totalLiquido)}</div>
    </div>
  </div>

  <div class="disclaimer">
    <strong>Declaración Jurada — Formulario 1887 SII (Art. 42 N°1 y Art. 101 LIR):</strong>
    El empleador <strong>${empresa}</strong>, RUT <strong>${rutEmpresa}</strong>, declara que las
    remuneraciones indicadas corresponden a los montos efectivamente pagados al trabajador durante
    el año comercial <strong>${anio}</strong>. Este certificado se emite en cumplimiento del Art. 101
    de la Ley sobre Impuesto a la Renta y debe ser entregado al trabajador para acreditar sus rentas
    ante el SII, instituciones financieras y organismos públicos y privados. El IUT 2ª Categoría fue
    calculado aplicando los tramos vigentes sobre la renta tributable mensual, usando UTM promedio de
    <strong>$${utmVal.toLocaleString('es-CL')}</strong>.
  </div>

  <div class="firma-row">
    <div class="firma">
      <div class="firma-linea"></div>
      <div class="firma-nombre">${empresa}</div>
      <div class="firma-sub">RUT: ${rutEmpresa}</div>
      <div class="firma-sub">Empleador / Representante Legal</div>
    </div>
    <div class="firma">
      <div class="firma-linea"></div>
      <div class="firma-nombre">${nombre}</div>
      <div class="firma-sub">RUT: ${trabajador?.rut||'—'}</div>
      <div class="firma-sub">Trabajador/a — Art. 42 N°1 LIR</div>
    </div>
  </div>

  <div class="footer">
    Certificado Anual de Remuneraciones &nbsp;·&nbsp; ${empresa} &nbsp;·&nbsp;
    Generado: ${new Date().toLocaleDateString('es-CL')} &nbsp;·&nbsp;
    Formulario 1887 SII &nbsp;·&nbsp; Art. 42 N°1 LIR &nbsp;·&nbsp; Art. 101 LIR<br/>
    Este documento no reemplaza la declaración oficial ante el SII.
    Verifique los valores con su contador o asesor tributario.
  </div>

</div>
<script>window.onload=function(){window.print();}</script>
</body></html>`;

  const blob = new Blob([html],{type:'text/html;charset=utf-8'});
  const url  = URL.createObjectURL(blob);
  const win  = window.open(url,'_blank');
  if(!win) alert('Habilita ventanas emergentes.');
  setTimeout(()=>URL.revokeObjectURL(url), 60000);
}
function generarPDFReporte(titulo, empresa, periodo, secciones) {
  const hoy = new Date().toLocaleDateString('es-CL');
  const seccionesHTML = secciones.map(s => `
    <div class="seccion">
      <div class="sec-titulo">${s.titulo}</div>
      ${s.contenido}
    </div>`).join('');

  const html = `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"/>
<title>${titulo}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box;}
  body{font-family:Arial,Helvetica,sans-serif;font-size:10pt;color:#1a1a1a;background:#fff;}
  .page{max-width:960px;margin:0 auto;padding:32px 48px;}
  .header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #5b21b6;padding-bottom:14px;margin-bottom:22px;}
  .empresa{font-size:15pt;font-weight:900;text-transform:uppercase;color:#1a1a1a;}
  .doc-info{text-align:right;}
  .doc-titulo{font-size:12pt;font-weight:900;color:#5b21b6;}
  .doc-sub{font-size:9pt;color:#888;margin-top:3px;}
  .seccion{margin-bottom:24px;}
  .sec-titulo{font-size:9pt;font-weight:900;text-transform:uppercase;letter-spacing:0.5px;background:#5b21b6;color:#fff;padding:5px 12px;border-radius:4px;margin-bottom:10px;}
  .kpi-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:0;}
  .kpi{background:#f8f4ff;border:1px solid #e9d5ff;border-radius:6px;padding:10px 14px;text-align:center;}
  .kpi-v{font-size:18pt;font-weight:900;color:#5b21b6;}
  .kpi-l{font-size:8pt;font-weight:700;color:#6b7280;text-transform:uppercase;margin-top:2px;}
  table{width:100%;border-collapse:collapse;font-size:9pt;}
  th{background:#374151;color:#fff;padding:6px 10px;text-align:left;font-size:8pt;text-transform:uppercase;}
  td{padding:5px 10px;border-bottom:1px solid #f0f0f0;}
  tr:nth-child(even) td{background:#fafafa;}
  .total-row td{font-weight:900;border-top:2px solid #5b21b6;background:#f8f4ff;}
  .bar-row{display:flex;align-items:center;gap:10px;margin-bottom:6px;}
  .bar-label{width:130px;font-size:9pt;font-weight:700;flex-shrink:0;}
  .bar-track{flex:1;height:16px;background:#f0f0f0;border-radius:8px;overflow:hidden;}
  .bar-fill{height:100%;border-radius:8px;background:linear-gradient(to right,#7c3aed,#4f46e5);}
  .bar-val{width:80px;font-size:9pt;font-weight:900;color:#5b21b6;text-align:right;flex-shrink:0;}
  .alerta{background:#fef3c7;border-left:4px solid #f59e0b;padding:8px 12px;border-radius:0 4px 4px 0;font-size:9pt;margin-bottom:8px;}
  .alerta-r{background:#fee2e2;border-left-color:#ef4444;}
  .footer{margin-top:20px;border-top:1px solid #e5e7eb;padding-top:10px;font-size:8pt;color:#9ca3af;text-align:center;}
  @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}}
</style></head><body>
<div class="page">
  <div class="header">
    <div>
      <div class="empresa">${empresa||'MPF Ingeniería Civil'}</div>
      <div style="font-size:9pt;color:#666;margin-top:3px;">Reporte ejecutivo RRHH · ${periodo}</div>
    </div>
    <div class="doc-info">
      <div class="doc-titulo">${titulo}</div>
      <div class="doc-sub">Generado: ${hoy}</div>
    </div>
  </div>
  ${seccionesHTML}
  <div class="footer">${titulo} · ${empresa} · ${hoy} · Confidencial — uso interno</div>
</div>
<script>window.onload=function(){window.print();}</script>
</body></html>`;

  const blob = new Blob([html], { type:'text/html;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
function generarPDFAsientos(asientos, periodo, empresa, totales) {
  const fmt = n => `$${Math.round(n||0).toLocaleString('es-CL')}`;
  const totalDebe  = asientos.filter(a=>a.lado==='D').reduce((s,a)=>s+a.monto,0);
  const totalHaber = asientos.filter(a=>a.lado==='H').reduce((s,a)=>s+a.monto,0);

  const filasAsientos = asientos.map(a => `
    <tr>
      <td style="width:10px;font-weight:900;color:${a.lado==='D'?'#5b21b6':'#0369a1'}">${a.lado==='D'?'DEBE':'HABER'}</td>
      <td style="font-family:monospace;font-weight:700">${a.cuenta}</td>
      <td>${a.glosa}</td>
      <td style="text-align:right;font-weight:700;color:${a.lado==='D'?'#5b21b6':'#0369a1'}">${fmt(a.monto)}</td>
      <td style="text-align:right;color:#9ca3af">${a.lado==='D'?fmt(a.monto):'—'}</td>
      <td style="text-align:right;color:#9ca3af">${a.lado==='H'?fmt(a.monto):'—'}</td>
    </tr>`).join('');

  const html = `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"/>
<title>Asientos Contables — ${periodo}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box;}
  body{font-family:Arial,Helvetica,sans-serif;font-size:10pt;color:#1a1a1a;}
  .page{max-width:960px;margin:0 auto;padding:32px 48px;}
  .header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #5b21b6;padding-bottom:14px;margin-bottom:20px;}
  .empresa{font-size:14pt;font-weight:900;text-transform:uppercase;}
  .doc-titulo{font-size:12pt;font-weight:900;color:#5b21b6;text-align:right;}
  .doc-sub{font-size:9pt;color:#888;text-align:right;margin-top:3px;}
  .sec-titulo{font-size:9pt;font-weight:900;text-transform:uppercase;background:#5b21b6;color:#fff;padding:5px 12px;border-radius:4px;margin:16px 0 8px;}
  table{width:100%;border-collapse:collapse;font-size:9pt;}
  th{background:#374151;color:#fff;padding:6px 10px;text-align:left;font-size:8pt;text-transform:uppercase;}
  td{padding:5px 10px;border-bottom:1px solid #f0f0f0;vertical-align:top;}
  tr:hover td{background:#fafafa;}
  .total-row td{font-weight:900;border-top:2px solid #5b21b6;background:#f8f4ff;font-size:10pt;}
  .check{background:#d1fae5;color:#065f46;font-weight:900;padding:4px 10px;border-radius:4px;font-size:9pt;}
  .error{background:#fee2e2;color:#991b1b;font-weight:900;padding:4px 10px;border-radius:4px;font-size:9pt;}
  .kpi-row{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px;}
  .kpi{background:#f8f4ff;border:1px solid #e9d5ff;border-radius:6px;padding:8px 12px;}
  .kpi-v{font-size:14pt;font-weight:900;color:#5b21b6;}
  .kpi-l{font-size:8pt;font-weight:700;color:#6b7280;text-transform:uppercase;}
  .footer{margin-top:20px;border-top:1px solid #e5e7eb;padding-top:10px;font-size:8pt;color:#9ca3af;text-align:center;}
  @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}}
</style></head><body>
<div class="page">
  <div class="header">
    <div>
      <div class="empresa">${empresa||'MPF Ingeniería Civil'}</div>
      <div style="font-size:9pt;color:#555;margin-top:3px">Libro diario · Nómina de remuneraciones</div>
    </div>
    <div>
      <div class="doc-titulo">Asientos Contables</div>
      <div class="doc-sub">Período: ${periodo} · Generado: ${new Date().toLocaleDateString('es-CL')}</div>
    </div>
  </div>

  <div class="kpi-row">
    <div class="kpi"><div class="kpi-v">${fmt(totales.masaImponible)}</div><div class="kpi-l">Masa imponible</div></div>
    <div class="kpi"><div class="kpi-v">${fmt(totales.totalCotiz)}</div><div class="kpi-l">Total cotizaciones</div></div>
    <div class="kpi"><div class="kpi-v">${fmt(totales.costoEmp)}</div><div class="kpi-l">Costo empleador</div></div>
    <div class="kpi"><div class="kpi-v">${fmt(totales.liquido)}</div><div class="kpi-l">Total a pagar</div></div>
  </div>

  <div class="sec-titulo">Libro diario — Comprobante nómina ${periodo}</div>
  <table>
    <thead><tr>
      <th>Tipo</th><th>Cuenta</th><th>Glosa</th><th>Monto</th><th>Debe</th><th>Haber</th>
    </tr></thead>
    <tbody>${filasAsientos}</tbody>
    <tfoot>
      <tr class="total-row">
        <td colspan="4" style="text-align:right">TOTALES</td>
        <td style="text-align:right;color:#5b21b6">${fmt(totalDebe)}</td>
        <td style="text-align:right;color:#0369a1">${fmt(totalHaber)}</td>
      </tr>
    </tfoot>
  </table>

  <div style="margin-top:12px;display:flex;gap:12px;align-items:center">
    <span class="${Math.abs(totalDebe-totalHaber)<10?'check':'error'}">
      ${Math.abs(totalDebe-totalHaber)<10 ? '✓ Asiento cuadrado' : `⚠ Diferencia: ${fmt(Math.abs(totalDebe-totalHaber))}`}
    </span>
    <span style="font-size:9pt;color:#6b7280">Debe: ${fmt(totalDebe)} · Haber: ${fmt(totalHaber)}</span>
  </div>

  <div class="footer">
    Asientos Contables · ${empresa} · ${periodo} · ${new Date().toLocaleDateString('es-CL')} ·
    Generado automáticamente por sistema RRHH · Verificar con contador antes de contabilizar oficialmente.
  </div>
</div>
<script>window.onload=function(){window.print();}</script>
</body></html>`;

  const blob = new Blob([html], { type:'text/html;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
function generarAsientos(liqEnriquecidas, periodo, utm) {
  // Acumular totales
  let totalImponible=0, totalNoImp=0, totalAfp=0, totalSalud=0, totalSis=0,
      totalCesTrab=0, totalCesEmp=0, totalIUT=0, totalAnticipo=0, totalLiquido=0,
      totalGrат=0, totalHE=0;

  liqEnriquecidas.forEach(({ contrato, liq }) => {
    const c = calcularLiquidacion({ ...contrato, ...liq });
    const iut = calcularIUT(calcularRentaTributable(c), utm);
    totalImponible  += c.base + c.bProd + c.montoHE + c.otrosImp;
    totalGrат       += c.gratMensual;
    totalHE         += c.montoHE;
    totalNoImp      += c.noImponible;
    totalAfp        += c.afpM;
    totalSalud      += c.salM;
    totalSis        += c.sisM;
    totalCesTrab    += c.cesM;
    totalCesEmp     += c.cesEmpM || 0;
    totalIUT        += iut;
    totalAnticipo   += c.anticipo;
    totalLiquido    += c.liquido - iut;
  });

  const totalRemXPagar = totalLiquido;

  // Asientos contables (formato libro diario)
  return [
    // ── DEBE ──
    { lado:'D', cuenta:'4110001', glosa:'Remuneraciones brutas del período',            monto: totalImponible - totalGrат - totalHE },
    { lado:'D', cuenta:'4110002', glosa:'Horas extraordinarias',                         monto: totalHE        },
    { lado:'D', cuenta:'4110003', glosa:'Gratificaciones garantizadas',                  monto: totalGrат      },
    { lado:'D', cuenta:'4110004', glosa:'Beneficios no imponibles (col./mov./viáticos)', monto: totalNoImp     },
    { lado:'D', cuenta:'4120001', glosa:'Aporte empleador SIS',                          monto: totalSis       },
    { lado:'D', cuenta:'4120002', glosa:'Seguro cesantía empleador',                     monto: totalCesEmp    },
    // ── HABER ──
    { lado:'H', cuenta:'2110001', glosa:'Remuneraciones líquidas por pagar',             monto: totalRemXPagar },
    { lado:'H', cuenta:'2110002', glosa:'Cotización AFP trabajadores por enterar',        monto: totalAfp       },
    { lado:'H', cuenta:'2110003', glosa:'Cotización salud por enterar',                  monto: totalSalud     },
    { lado:'H', cuenta:'2110004', glosa:'SIS por enterar',                               monto: totalSis       },
    { lado:'H', cuenta:'2110005', glosa:'Cesantía trabajador + empleador',               monto: totalCesTrab + totalCesEmp },
    ...(totalIUT > 0 ? [{ lado:'H', cuenta:'2110006', glosa:'IUT 2ª Cat. retenido',    monto: totalIUT       }] : []),
    ...(totalAnticipo > 0 ? [{ lado:'H', cuenta:'2110007', glosa:'Anticipos a recuperar', monto: totalAnticipo }] : []),
  ].filter(a => a.monto > 0);
}
function validarRutPrevired(rut) {
  if (!rut) return { ok:false, error:'RUT vacío' };
  const limpio = rut.replace(/\./g,'').replace('-','').toUpperCase();
  if (limpio.length < 2) return { ok:false, error:'RUT muy corto' };
  const dv  = limpio.at(-1);
  const num = limpio.slice(0,-1);
  if (!/^\d+$/.test(num)) return { ok:false, error:'Dígitos inválidos' };
  // Módulo 11
  let suma=0, mult=2;
  for (let i=num.length-1;i>=0;i--) { suma+=parseInt(num[i])*mult; mult=mult===7?2:mult+1; }
  const dvCalc = 11-(suma%11);
  const dvEsp  = dvCalc===11?'0':dvCalc===10?'K':String(dvCalc);
  return dvEsp===dv ? { ok:true } : { ok:false, error:`DV incorrecto (esperado ${dvEsp})` };
}
function generarPreviredAvanzado(liqEnriquecidas, periodo) {
  const errores = [];
  const filas   = [];

  liqEnriquecidas.forEach(({ trabajador, contrato, liq }, i) => {
    const validRut = validarRutPrevired(trabajador?.rut||'');
    if (!validRut.ok) errores.push(`Fila ${i+1} — ${trabajador?.nombre||'?'}: ${validRut.error}`);

    const c   = calcularLiquidacion({ ...contrato, ...liq });
    const rut = (trabajador?.rut||'').replace(/\./g,'').replace('-','').toUpperCase();
    const nombre = `${trabajador?.apellidoPaterno||''} ${trabajador?.nombre||''}`.trim().toUpperCase();

    filas.push([
      rut,
      nombre,
      (trabajador?.afp||'').toUpperCase(),
      c.afpM,
      (trabajador?.prevision==='Fonasa'||!trabajador?.prevision ? 'FONASA' : trabajador.isapre||'ISAPRE').toUpperCase(),
      c.salM,
      c.sisM,
      c.cesM,
      c.cesEmpM||0,
      c.imponible,
      c.imponible + c.noImponible,
      Math.max(0, c.liquido),
      contrato?.tipoContrato==='Plazo Fijo'?'PF':'IND',
      liq.mes||'',
      liq.anio||'',
    ].join(';'));
  });

  if (errores.length > 0) {
    alert(`⚠ Previred — ${errores.length} error(es) de validación:\n\n${errores.join('\n')}\n\nEl archivo se generará igualmente. Corrija los RUTs antes de subir.`);
  }

  const header = 'RUT;NOMBRE;AFP;COT_AFP;SALUD;COT_SALUD;SIS;CES_TRAB;CES_EMP;RENTA_IMP;RENTA_BRUTA;LIQUIDO;TIPO_CONTRATO;MES;ANIO';
  const csv    = header + '\n' + filas.join('\n');
  const blob   = new Blob(['\uFEFF'+csv], { type:'text/csv;charset=utf-8' });
  const url    = URL.createObjectURL(blob);
  const a      = document.createElement('a');
  a.href = url;
  a.download = `Previred_${periodo}_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  return errores;
}
function generarArchivoPago(liqEnriquecidas, periodo, banco) {
  // Formato compatible con mayoría de portales bancarios chilenos
  // Columnas: RUT_BENEFICIARIO;NOMBRE;BANCO;TIPO_CUENTA;NRO_CUENTA;MONTO;MONEDA;GLOSA
  const filas = liqEnriquecidas
    .filter(({ liq }) => liq.estado !== 'pagado')
    .map(({ trabajador, contrato, liq }) => {
      const c      = calcularLiquidacion({ ...contrato, ...liq });
      const rut    = (trabajador?.rut||'').replace(/\./g,'').toUpperCase();
      const nombre = `${trabajador?.apellidoPaterno||''} ${trabajador?.nombre||''}`.trim().toUpperCase();
      const monto  = Math.max(0, c.liquido);
      return [
        rut,
        nombre,
        trabajador?.banco||'',
        trabajador?.tipoCuenta||'CUENTA_CORRIENTE',
        trabajador?.nroCuenta||'',
        monto,
        'CLP',
        `REMUNERACION ${periodo}`,
      ].join(';');
    });

  const header = 'RUT;NOMBRE;BANCO;TIPO_CUENTA;NRO_CUENTA;MONTO;MONEDA;GLOSA';
  const csv    = header + '\n' + filas.join('\n');
  const blob   = new Blob(['\uFEFF'+csv], { type:'text/csv;charset=utf-8' });
  const url    = URL.createObjectURL(blob);
  const a      = document.createElement('a');
  a.href = url;
  a.download = `Pago_Remuneraciones_${periodo}_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─────────────────────────────────────────────────────────────────────────────
// generarCSVImportadorSII — F1887 AT{anio+1} — 35 columnas
// Genera el archivo CSV para subir directamente al Importador de Datos del SII
// https://www2.sii.cl/manual/importador → DJ 1887
//
// Formato AT2026 (35 columnas por registro):
//   C1  : Cuerpo RUT trabajador (sin dígito, sin puntos, sin guión)
//   C2  : Dígito verificador (puede ser K mayúscula)
//   C3  : Número correlativo de certificado (asignado secuencialmente)
//   C4  : Renta Total Neta Art.42 N°1 = suma anual renta tributable
//   C5  : IUT 2ª Categoría retenido total año
//   C6  : Mayor retención solicitada Art.88 (0 si no aplica)
//   C7  : Renta Total No Gravada (total no imponible anual)
//   C8  : Renta Total Exenta (0)
//   C9  : Rebajas zonas extremas D.L.889 (0)
//   C10 : 3% Préstamo tasa 0% año 2021 (0)
//   C11–C22 : Indicador meses ENE–DIC (1=trabajó, vacío=no trabajó)
//   C23 : Horas semanales pactadas a diciembre (45 jornada completa, 30 parcial)
//   C24–C35 : Renta tributable mensual ENE–DIC (0 si no trabajó ese mes)
//
// Reglas generales SII:
//   - Separador de campos: ";"
//   - Sin separador de miles ni decimales en montos
//   - Sin encabezado (solo filas de datos)
//   - Celdas vacías permitidas solo en indicadores de mes (C11-C22)
//   - Encoding UTF-8 (o CSV MS-DOS)
// ─────────────────────────────────────────────────────────────────────────────
function generarCSVImportadorSII(liqPorTrabajador, anio, utm) {
  // liqPorTrabajador: Array de { trabajador, contrato, liquidaciones[] }
  // liquidaciones[]: Array con los meses del año, cada uno con mes='01'..'12'

  const utmVal = utm || UTM_DEFAULT;
  const n = v => Math.round(v || 0);  // entero sin decimales

  // Separar RUT en cuerpo + dígito verificador
  // Acepta formatos: "12345678-9", "12.345.678-K", "123456789" (sin guión)
  function splitRut(rut) {
    if (!rut) return ['', ''];
    const limpio = String(rut).replace(/\./g, '').trim();
    const idx = limpio.lastIndexOf('-');
    if (idx !== -1) {
      return [limpio.slice(0, idx), limpio.slice(idx + 1).toUpperCase()];
    }
    // Sin guión: asume último char es dígito verificador
    return [limpio.slice(0, -1), limpio.slice(-1).toUpperCase()];
  }

  const filas = [];
  let numCertificado = 1;

  for (const { trabajador, contrato, liquidaciones } of liqPorTrabajador) {
    if (!trabajador || !liquidaciones?.length) continue;

    const [rutCuerpo, rutDv] = splitRut(trabajador.rut);

    // Calcular acumulados anuales y datos por mes
    let totalTrib = 0, totalIUT = 0, totalNoImp = 0;

    // Mapa mes → datos calculados (mes como número 1..12)
    const datosMes = {};
    for (const liq of liquidaciones) {
      const mesNum = parseInt(liq.mes);
      if (!mesNum || mesNum < 1 || mesNum > 12) continue;
      const c = calcularLiquidacionConIUT(
        { ...contrato, ...liq, afp: trabajador.afp },
        utmVal
      );
      // Renta tributable mensual = imponible − AFP − salud − AFC trab − SIS
      const rentaTrib = Math.max(0, c.imponible - c.afpM - c.salM - c.cesM - c.sisM);
      datosMes[mesNum] = { rentaTrib, iut: c.iut, noImp: c.noImponible };
      totalTrib  += rentaTrib;
      totalIUT   += c.iut;
      totalNoImp += c.noImponible;
    }

    // C11–C22: indicadores de meses (1=trabajó, ''=no trabajó)
    // C24–C35: renta tributable de cada mes (0 si no trabajó)
    const indicadores = [];  // C11–C22
    const rentasMes   = [];  // C24–C35
    for (let m = 1; m <= 12; m++) {
      if (datosMes[m] !== undefined) {
        indicadores.push('1');
        rentasMes.push(n(datosMes[m].rentaTrib));
      } else {
        indicadores.push('');   // vacío = no trabajó ese mes
        rentasMes.push(0);
      }
    }

    // Horas semanales: 45 jornada completa, 30 jornada parcial
    // Se toma del contrato si existe, sino 45 por defecto
    const horasSemana = contrato?.horasSemana || 45;

    // Construir fila de 35 columnas
    const fila = [
      rutCuerpo,          // C1  RUT cuerpo
      rutDv,              // C2  dígito verificador
      numCertificado,     // C3  número certificado
      n(totalTrib),       // C4  Renta Total Neta Art.42 N°1
      n(totalIUT),        // C5  IUT retenido total año
      0,                  // C6  Mayor retención (0)
      n(totalNoImp),      // C7  Renta no gravada (no imponibles)
      0,                  // C8  Renta exenta (0)
      0,                  // C9  Zonas extremas (0)
      0,                  // C10 Préstamo 2021 (0)
      ...indicadores,     // C11–C22 indicadores meses
      horasSemana,        // C23 horas semanales
      ...rentasMes,       // C24–C35 renta tributable por mes
    ];

    filas.push(fila.join(';'));
    numCertificado++;
  }

  if (!filas.length) {
    alert('No hay liquidaciones para generar el archivo.');
    return;
  }

  // Sin encabezado — el SII no lo acepta
  const csvStr = filas.join('\r\n') + '\r\n';

  const blob = new Blob([csvStr], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `F1887_AT${parseInt(anio) + 1}_${anio}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export { generarPDFContrato, generarPDFLiquidacion, generarPDFResumenNomina,
  generarPDFFiniquito, generarPDFAnexo, generarCertificadoAnual,
  generarPDFReporte, generarPDFAsientos,
  generarAsientos, validarRutPrevired, generarPreviredAvanzado,
  generarArchivoPago, generarCSVImportadorSII };
