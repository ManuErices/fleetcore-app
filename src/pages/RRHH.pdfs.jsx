import { IMM_2026, TASAS, TASAS_AFP, MESES, CAUSALES_TERMINO, UTM_DEFAULT, TRAMOS_IUT } from './RRHH.shared';
import { calcularLiquidacion, calcularLiquidacionConIUT, calcularIUT, calcularRentaTributable, labelPeriodo } from './RRHH.calculo';

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
  const empresa      = contrato?.empresa || 'MPF Ingeniería Civil';
  const fmtFechaIngreso = (f) => {
    if (!f) return '—';
    const [y,m,d] = f.split('-');
    const meses = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
    return `${parseInt(d)} ${meses[parseInt(m)-1]}. ${y}`;
  };

  const haberes = [
    { label: 'Sueldo base',           tipo: 'imp',   monto: calc.base        },
    { label: 'Bono de producción',     tipo: 'imp',   monto: calc.bProd       },
    { label: 'Horas extraordinarias',  tipo: 'imp',   monto: calc.montoHE     },
    { label: 'Gratificación mensual',  tipo: 'imp',   monto: calc.gratMensual },
    { label: 'Otros imponibles',       tipo: 'imp',   monto: calc.otrosImp    },
    { label: 'Colación',               tipo: 'noimp', monto: calc.bColacion   },
    { label: 'Movilización',           tipo: 'noimp', monto: calc.bMovil      },
    { label: 'Viáticos',               tipo: 'noimp', monto: calc.viaticos    },
    { label: 'Otros no imponibles',    tipo: 'noimp', monto: calc.otrosNoImp  },
  ].filter(r => r.monto > 0);

  const descuentos = [
    { label: `AFP ${trabajador?.afp||''} (${tasaAfp}%)`,              monto: calc.afpM           },
    { label: `Salud (${trabajador?.prevision||'FONASA'}) 7%`,         monto: calc.salM           },
    { label: 'Seguro cesantía (0.6%)',                                 monto: calc.cesM           },
    { label: `IUT 2ª Categoría`,                                       monto: iut                 },
    { label: 'Anticipo',                                               monto: calc.anticipo       },
    { label: rem.glosaDescuento||'Descuento adicional',                monto: calc.descAdicional  },
  ].filter(r => r.monto > 0);

  const rowH = (r) => `
    <tr>
      <td class="row-label">${r.label}</td>
      <td class="row-badge"><span class="badge ${r.tipo}">${r.tipo==='imp'?'Imponible':'No imponible'}</span></td>
      <td class="row-amount">${fmt(r.monto)}</td>
    </tr>`;

  const rowD = (r) => `
    <tr>
      <td class="row-label" colspan="2">${r.label}</td>
      <td class="row-amount desc">${fmt(r.monto)}</td>
    </tr>`;

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8"/>
<title>Liquidación ${mesLabel} — ${nombre}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box;}
  body{font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;background:#f4f4f8;color:#1a1a2e;}
  .page{max-width:720px;margin:24px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 8px 40px rgba(0,0,0,0.10);}

  /* ── Cabecera ── */
  .head{background:linear-gradient(135deg,#1e1b4b 0%,#3730a3 100%);padding:28px 36px 22px;display:flex;justify-content:space-between;align-items:flex-end;}
  .head-empresa{font-size:18pt;font-weight:900;color:#fff;letter-spacing:-0.5px;line-height:1;}
  .head-sub{font-size:8pt;color:rgba(255,255,255,0.5);margin-top:5px;letter-spacing:0.3px;}
  .head-right{text-align:right;}
  .head-periodo{font-size:22pt;font-weight:900;color:#a5b4fc;letter-spacing:-1px;line-height:1;}
  .head-doc{font-size:8pt;color:rgba(255,255,255,0.5);margin-top:4px;}

  /* ── Franja de datos trabajador ── */
  .trab-strip{background:#f8f8fc;border-bottom:1px solid #ebebf5;padding:18px 36px;display:grid;grid-template-columns:1fr 1fr;gap:0;}
  .trab-col{}
  .trab-name{font-size:13pt;font-weight:900;color:#1e1b4b;}
  .trab-rut{font-size:9pt;color:#6b7280;margin-top:2px;}
  .trab-meta{display:flex;flex-wrap:wrap;gap:16px;margin-top:10px;}
  .trab-item{display:flex;flex-direction:column;}
  .trab-item-label{font-size:7pt;font-weight:700;text-transform:uppercase;letter-spacing:0.7px;color:#9ca3af;}
  .trab-item-val{font-size:8.5pt;font-weight:700;color:#374151;margin-top:1px;}
  .emp-col{display:flex;flex-direction:column;gap:6px;align-items:flex-end;justify-content:center;}
  .emp-tag{background:#ede9fe;color:#5b21b6;font-size:7.5pt;font-weight:800;padding:3px 10px;border-radius:20px;}
  .emp-fecha{font-size:8pt;color:#9ca3af;}

  /* ── Stats ── */
  .stats{display:grid;grid-template-columns:repeat(4,1fr);border-bottom:1px solid #ebebf5;}
  .stat{padding:14px 0;text-align:center;border-right:1px solid #ebebf5;}
  .stat:last-child{border-right:none;}
  .stat-val{font-size:13pt;font-weight:900;color:#3730a3;}
  .stat-lbl{font-size:7pt;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#9ca3af;margin-top:2px;}

  /* ── Tablas ── */
  .tables{display:grid;grid-template-columns:1fr 1fr;gap:0;border-bottom:1px solid #ebebf5;}
  .col-hab{border-right:1px solid #ebebf5;}
  .col-desc{}
  .col-title{padding:10px 20px 8px;font-size:7.5pt;font-weight:900;text-transform:uppercase;letter-spacing:0.8px;color:#9ca3af;border-bottom:1px solid #ebebf5;}
  table{width:100%;border-collapse:collapse;}
  .row-label{padding:7px 20px;font-size:8.5pt;color:#374151;}
  .row-badge{padding:7px 4px;width:80px;}
  .row-amount{padding:7px 20px 7px 4px;font-size:8.5pt;font-weight:700;text-align:right;white-space:nowrap;}
  tr{border-bottom:1px solid #f3f4f6;}
  tr:last-child{border-bottom:none;}
  .badge{font-size:6.5pt;font-weight:700;padding:2px 6px;border-radius:10px;}
  .imp{background:#dcfce7;color:#15803d;}
  .noimp{background:#dbeafe;color:#1d4ed8;}
  .subtotal{background:#f3f4f6;}
  .subtotal td{font-weight:800;font-size:8.5pt;color:#1e1b4b;padding:8px 20px;}
  .subtotal td:last-child{padding-right:20px;}
  .desc{color:#dc2626;}

  /* ── Total líquido ── */
  .liquido{padding:20px 36px;background:linear-gradient(135deg,#1e1b4b 0%,#3730a3 100%);display:flex;align-items:center;justify-content:space-between;}
  .liq-label{color:rgba(255,255,255,0.7);font-size:9pt;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;}
  .liq-val{font-size:26pt;font-weight:900;color:#86efac;letter-spacing:-1.5px;}

  /* ── Costo empresa ── */
  .costo{padding:12px 36px;background:#fffbeb;border-bottom:1px solid #fde68a;font-size:8pt;color:#92400e;}
  .costo b{font-weight:800;}

  /* ── Firmas ── */
  .firmas{display:grid;grid-template-columns:1fr 1fr;padding:28px 36px 20px;gap:40px;}
  .firma{text-align:center;}
  .firma-line{border-top:1.5px solid #d1d5db;margin-bottom:8px;margin-top:44px;}
  .firma-name{font-size:9pt;font-weight:800;color:#1e1b4b;}
  .firma-role{font-size:8pt;color:#9ca3af;margin-top:2px;}

  /* ── Footer ── */
  .foot{padding:10px 36px 18px;font-size:7pt;color:#c4c4d4;text-align:center;line-height:1.7;border-top:1px solid #f0f0f8;}

  @media print{
    body{background:#fff;}
    .page{margin:0;border-radius:0;box-shadow:none;}
    @page{margin:0;size:A4;}
  }
</style>
</head>
<body>
<div class="page">

  <!-- CABECERA -->
  <div class="head">
    <div>
      <div class="head-empresa">${empresa}</div>
      <div class="head-sub">Liquidación de Remuneraciones · Art. 54 Código del Trabajo</div>
    </div>
    <div class="head-right">
      <div class="head-periodo">${mesLabel}</div>
      <div class="head-doc">Fecha emisión: ${new Date().toLocaleDateString('es-CL')}</div>
    </div>
  </div>

  <!-- DATOS TRABAJADOR -->
  <div class="trab-strip">
    <div class="trab-col">
      <div class="trab-name">${nombre}</div>
      <div class="trab-rut">RUT ${trabajador?.rut||'—'}</div>
      <div class="trab-meta">
        <div class="trab-item"><span class="trab-item-label">Cargo</span><span class="trab-item-val">${contrato?.cargo||trabajador?.cargo||'—'}</span></div>
        <div class="trab-item"><span class="trab-item-label">Ingreso</span><span class="trab-item-val">${fmtFechaIngreso(contrato?.fechaInicio)}</span></div>
        <div class="trab-item"><span class="trab-item-label">AFP</span><span class="trab-item-val">${trabajador?.afp||'—'}</span></div>
        <div class="trab-item"><span class="trab-item-label">Salud</span><span class="trab-item-val">${trabajador?.prevision||'—'}${trabajador?.isapre?' · '+trabajador.isapre:''}</span></div>
        <div class="trab-item"><span class="trab-item-label">Contrato</span><span class="trab-item-val">${contrato?.tipoContrato||'—'}</span></div>
        <div class="trab-item"><span class="trab-item-label">Jornada</span><span class="trab-item-val">${contrato?.jornada||'—'}</span></div>
      </div>
    </div>
    <div class="emp-col">
      <span class="emp-tag">${trabajador?.area||empresa}</span>
      <span class="emp-fecha">Período: ${mesLabel}</span>
    </div>
  </div>

  <!-- STATS -->
  <div class="stats">
    <div class="stat"><div class="stat-val">${diasTrab}</div><div class="stat-lbl">Días trabajados</div></div>
    <div class="stat"><div class="stat-val">${fmt(calc.imponible)}</div><div class="stat-lbl">Base imponible</div></div>
    <div class="stat"><div class="stat-val">${fmt(rentaTrib)}</div><div class="stat-lbl">Renta tributable</div></div>
    <div class="stat"><div class="stat-val">${fmt(calc.noImponible)}</div><div class="stat-lbl">No imponible</div></div>
  </div>

  <!-- HABERES / DESCUENTOS -->
  <div class="tables">
    <div class="col-hab">
      <div class="col-title">Haberes</div>
      <table>
        ${haberes.map(rowH).join('')}
        ${calc.diasTrab < 30 ? `
        <tr style="background:#fff7ed;border-top:1px solid #fed7aa;">
          <td class="row-label" colspan="2" style="color:#92400e;font-size:7.5pt;">
            ⚠ Prorrateo por ${calc.diasTrab} días trabajados de 30 · Factor: ${(calc.fdias*100).toFixed(1)}%
            · Sueldo día: ${fmt(Math.round(calc.baseCompleto/30))}
          </td>
          <td class="row-amount" style="color:#92400e;font-size:7.5pt;"></td>
        </tr>` : ''}
        <tr class="subtotal"><td colspan="2">Total imponible</td><td style="text-align:right">${fmt(calc.imponible)}</td></tr>
        <tr class="subtotal"><td colspan="2">Total no imponible</td><td style="text-align:right">${fmt(calc.noImponible)}</td></tr>
        <tr class="subtotal"><td colspan="2"><b>Total haberes</b></td><td style="text-align:right"><b>${fmt(calc.imponible + calc.noImponible)}</b></td></tr>
      </table>
    </div>
    <div class="col-desc">
      <div class="col-title">Descuentos</div>
      <table>
        ${descuentos.map(rowD).join('')}
        <tr class="subtotal"><td colspan="2"><b>Total descuentos</b></td><td style="text-align:right" class="desc"><b>${fmt(descuentos.reduce((s,r)=>s+r.monto,0))}</b></td></tr>
      </table>
    </div>
  </div>

  <!-- TOTAL LÍQUIDO -->
  <div class="liquido">
    <div>
      <div class="liq-label">Alcance líquido</div>
      <div style="font-size:8pt;color:rgba(255,255,255,0.4);margin-top:3px">${mesLabel} · ${nombre}</div>
    </div>
    <div class="liq-val">${fmt(liquidoFinal)}</div>
  </div>

  <!-- COSTO EMPRESA -->
  <div class="costo">
    <b>Costo empleador (referencial):</b> &nbsp;
    SIS 1.54% ${fmt(calc.sisM)} &nbsp;·&nbsp;
    Cesantía empleador ${fmt(calc.cesEmpM)} &nbsp;·&nbsp;
    <b>Total costo empresa ${fmt(calc.imponible + calc.noImponible + calc.sisM + calc.cesEmpM)}</b>
  </div>

  <!-- FIRMAS -->
  <div class="firmas">
    <div class="firma">
      <div class="firma-line"></div>
      <div class="firma-name">${empresa}</div>
      <div class="firma-role">Empleador · Departamento RRHH</div>
    </div>
    <div class="firma">
      <div class="firma-line"></div>
      <div class="firma-name">${nombre}</div>
      <div class="firma-role">Trabajador/a · RUT ${trabajador?.rut||'—'}</div>
    </div>
  </div>

  <!-- FOOTER -->
  <div class="foot">
    Certifico que he recibido la suma de <b>${fmt(liquidoFinal)}</b> a mi entera satisfacción y sin cargo ni cobro posterior que hacer por los conceptos de esta liquidación.<br/>
    FleetCore RRHH · ${empresa} · Art. 54 CT
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

  const filas = liquidaciones.map((l, i) => {
    const nombre = l._trabajador
      ? `${l._trabajador.apellidoPaterno} ${l._trabajador.nombre}`
      : 'Desconocido';
    const c = l._calc;
    const pagado = l.estado === 'pagado';
    return `<tr class="${i%2===1?'alt':''}">
      <td class="td-name">${nombre}</td>
      <td class="td-mono">${l._trabajador?.rut||'—'}</td>
      <td>${l._trabajador?.afp||'—'}</td>
      <td class="td-num">${fmt(c?.imponible)}</td>
      <td class="td-num red">-${fmt(c?.afpM)}</td>
      <td class="td-num red">-${fmt(c?.salM)}</td>
      <td class="td-num red">-${fmt(c?.sisM+c?.cesM)}</td>
      <td class="td-num blue">${fmt(c?.noImponible)}</td>
      <td class="td-num green bold">${fmt(c?.liquido)}</td>
      <td class="td-center"><span class="badge-estado ${pagado?'pagado':'pendiente'}">${pagado?'Pagado':'Pendiente'}</span></td>
    </tr>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8"/>
<title>Resumen Nómina — ${periodoLabel}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box;}
  body{font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;background:#f4f4f8;color:#1a1a2e;}
  .page{max-width:1000px;margin:24px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 8px 40px rgba(0,0,0,0.10);}

  /* Cabecera */
  .head{background:linear-gradient(135deg,#1e1b4b 0%,#3730a3 100%);padding:26px 36px;display:flex;justify-content:space-between;align-items:flex-end;}
  .head-title{font-size:20pt;font-weight:900;color:#fff;letter-spacing:-0.5px;line-height:1;}
  .head-sub{font-size:8.5pt;color:rgba(255,255,255,0.5);margin-top:5px;}
  .head-right{text-align:right;}
  .head-empresa{font-size:13pt;font-weight:900;color:#a5b4fc;}
  .head-fecha{font-size:8pt;color:rgba(255,255,255,0.4);margin-top:4px;}

  /* Stats */
  .stats{display:grid;grid-template-columns:repeat(4,1fr);border-bottom:1px solid #ebebf5;}
  .stat{padding:18px 20px;border-right:1px solid #ebebf5;}
  .stat:last-child{border-right:none;}
  .stat-lbl{font-size:7pt;font-weight:700;text-transform:uppercase;letter-spacing:0.7px;color:#9ca3af;}
  .stat-val{font-size:16pt;font-weight:900;margin-top:4px;letter-spacing:-0.5px;}
  .violet{color:#5b21b6;} .red{color:#dc2626;} .blue{color:#1d4ed8;} .green{color:#059669;}

  /* Tabla */
  .table-wrap{padding:0 0 0 0;overflow-x:auto;}
  table{width:100%;border-collapse:collapse;font-size:8.5pt;}
  thead tr{background:#1e1b4b;}
  th{padding:10px 12px;color:rgba(255,255,255,0.7);font-size:7pt;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;text-align:left;}
  th.td-num,th.td-center{text-align:right;}
  td{padding:9px 12px;border-bottom:1px solid #f0f0f8;color:#374151;vertical-align:middle;}
  tr.alt td{background:#fafafa;}
  .td-name{font-weight:700;color:#1e1b4b;}
  .td-mono{font-family:monospace;font-size:8pt;color:#6b7280;}
  .td-num{text-align:right;font-weight:600;}
  .td-center{text-align:right;}
  .bold{font-weight:900!important;}
  td.red{color:#dc2626;} td.blue{color:#1d4ed8;} td.green{color:#059669;}

  /* Fila total */
  .tfoot-row td{background:#1e1b4b;color:#fff;font-weight:800;font-size:9pt;padding:11px 12px;border:none;}
  .tfoot-row td.red{color:#fca5a5;} .tfoot-row td.blue{color:#93c5fd;} .tfoot-row td.green{color:#86efac;font-size:11pt;}

  /* Badge estado */
  .badge-estado{display:inline-block;padding:3px 9px;border-radius:20px;font-size:7pt;font-weight:700;}
  .pagado{background:#dcfce7;color:#15803d;}
  .pendiente{background:#fef3c7;color:#92400e;}

  /* Costo empresa */
  .costo{padding:14px 36px;background:#fffbeb;border-top:1px solid #fde68a;font-size:8.5pt;color:#92400e;}
  .costo b{font-weight:800;}

  /* Footer */
  .foot{padding:12px 36px;font-size:7.5pt;color:#c4c4d4;text-align:center;border-top:1px solid #f0f0f8;}

  @media print{
    body{background:#fff;}
    .page{margin:0;border-radius:0;box-shadow:none;}
    @page{margin:0;size:A4 landscape;}
  }
</style>
</head>
<body>
<div class="page">

  <!-- CABECERA -->
  <div class="head">
    <div>
      <div class="head-title">Resumen Nómina</div>
      <div class="head-sub">Período: ${periodoLabel} · ${liquidaciones.length} trabajador${liquidaciones.length!==1?'es':''}</div>
    </div>
    <div class="head-right">
      <div class="head-empresa">MPF Ingeniería Civil</div>
      <div class="head-fecha">Emitido: ${new Date().toLocaleDateString('es-CL')}</div>
    </div>
  </div>

  <!-- STATS -->
  <div class="stats">
    <div class="stat"><div class="stat-lbl">Total imponible</div><div class="stat-val violet">${fmt(totalImp)}</div></div>
    <div class="stat"><div class="stat-lbl">Total cotizaciones</div><div class="stat-val red">-${fmt(totalDesc)}</div></div>
    <div class="stat"><div class="stat-lbl">Total no imponible</div><div class="stat-val blue">${fmt(totalNoImp)}</div></div>
    <div class="stat"><div class="stat-lbl">Total líquido a pagar</div><div class="stat-val green">${fmt(totalLiq)}</div></div>
  </div>

  <!-- TABLA -->
  <div class="table-wrap">
    <table>
      <thead><tr>
        <th>Trabajador</th><th>RUT</th><th>AFP</th>
        <th class="td-num">Imponible</th>
        <th class="td-num">AFP</th>
        <th class="td-num">Salud</th>
        <th class="td-num">SIS+Ces.</th>
        <th class="td-num">No Imp.</th>
        <th class="td-num">Líquido</th>
        <th class="td-center">Estado</th>
      </tr></thead>
      <tbody>${filas}</tbody>
      <tfoot><tr class="tfoot-row">
        <td colspan="3">Totales · ${liquidaciones.length} trabajador${liquidaciones.length!==1?'es':''}</td>
        <td class="td-num">${fmt(totalImp)}</td>
        <td class="td-num red">-${fmt(totalAfp)}</td>
        <td class="td-num red">-${fmt(totalSalud)}</td>
        <td class="td-num red">-${fmt(totalSis+totalCes)}</td>
        <td class="td-num blue">${fmt(totalNoImp)}</td>
        <td class="td-num green bold">${fmt(totalLiq)}</td>
        <td></td>
      </tr></tfoot>
    </table>
  </div>

  <!-- COSTO EMPRESA -->
  <div class="costo">
    <b>Costo empleador (referencial):</b> &nbsp;
    Cesantía empleador ${fmt(totalCesEmp)} &nbsp;·&nbsp;
    SIS empleador ${fmt(totalSis)} &nbsp;·&nbsp;
    <b>Costo bruto total empresa: ${fmt(totalImp + totalNoImp + totalCesEmp + totalSis)}</b>
  </div>

  <!-- FOOTER -->
  <div class="foot">
    Resumen generado por FleetCore RRHH · ${new Date().toLocaleDateString('es-CL')} · Los valores corresponden a estimaciones. Verificar con liquidaciones individuales.
  </div>

</div>
<script>window.onload=function(){window.print();}</script>
</body>
</html>`;

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
  const fmt  = n => `$${(n||0).toLocaleString('es-CL')}`;
  const nombre = trabajador
    ? `${trabajador.nombre} ${trabajador.apellidoPaterno} ${trabajador.apellidoMaterno||''}`.trim()
    : '_______________';
  const empresa = contrato?.empresa || 'MPF Ingeniería Civil';

  // Acumular totales anuales
  let totalImp=0, totalNoImp=0, totalAfp=0, totalSalud=0, totalCes=0, totalIUT=0, totalLiquido=0;
  const filasMeses = liquidacionesAnio.map(liq => {
    const c   = calcularLiquidacionConIUT({ ...contrato, ...liq }, utm);
    totalImp     += c.imponible;
    totalNoImp   += c.noImponible;
    totalAfp     += c.afpM;
    totalSalud   += c.salM;
    totalCes     += c.cesM + c.sisM;
    totalIUT     += c.iut;
    totalLiquido += c.liquidoFinal;
    return `<tr>
      <td>${MESES[parseInt(liq.mes)-1]||liq.mes}</td>
      <td style="text-align:right">${fmt(c.imponible)}</td>
      <td style="text-align:right">${fmt(c.noImponible)}</td>
      <td style="text-align:right;color:#dc2626">-${fmt(c.afpM)}</td>
      <td style="text-align:right;color:#dc2626">-${fmt(c.salM)}</td>
      <td style="text-align:right;color:#dc2626">-${fmt(c.cesM+c.sisM)}</td>
      <td style="text-align:right;color:#7c3aed">-${fmt(c.iut)}</td>
      <td style="text-align:right;font-weight:900;color:#059669">${fmt(c.liquidoFinal)}</td>
    </tr>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"/>
<title>Certificado Anual — ${nombre} — ${anio}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box;}
  body{font-family:Arial,Helvetica,sans-serif;font-size:10pt;color:#1a1a1a;}
  .page{max-width:900px;margin:0 auto;padding:30px 40px;}
  .header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #1a1a1a;padding-bottom:14px;margin-bottom:18px;}
  .empresa{font-size:14pt;font-weight:900;text-transform:uppercase;}
  .sii-badge{background:#003087;color:#fff;font-size:9pt;font-weight:900;padding:4px 10px;border-radius:4px;text-align:center;}
  .doc-title{font-size:12pt;font-weight:900;text-align:right;margin-top:4px;}
  .trabajador-box{background:#f4f4f8;border-left:4px solid #5b21b6;padding:12px 16px;border-radius:0 8px 8px 0;margin-bottom:18px;display:flex;gap:30px;flex-wrap:wrap;}
  .tw-field .label{font-size:8pt;font-weight:700;text-transform:uppercase;color:#6b7280;}
  .tw-field .value{font-size:10.5pt;font-weight:700;}
  .sec-titulo{font-size:8.5pt;font-weight:900;text-transform:uppercase;letter-spacing:0.5px;background:#1a1a1a;color:#fff;padding:5px 10px;margin-bottom:0;}
  table{width:100%;border-collapse:collapse;font-size:9.5pt;}
  th{background:#374151;color:#fff;padding:6px 10px;text-align:left;font-size:8pt;text-transform:uppercase;}
  td{padding:5px 10px;border-bottom:1px solid #eee;}
  tr:nth-child(even) td{background:#f9f9f9;}
  .total-row td{font-weight:900;font-size:10pt;border-top:2px solid #1a1a1a;background:#f0f0f0;}
  .resumen{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:18px 0;}
  .card{background:#f8f8f8;border:1px solid #e0e0e0;border-radius:6px;padding:10px 14px;}
  .card-label{font-size:8pt;font-weight:700;text-transform:uppercase;color:#666;}
  .card-value{font-size:14pt;font-weight:900;margin-top:2px;}
  .disclaimer{background:#fffde7;border:1px solid #fde047;border-radius:5px;padding:10px 14px;font-size:8.5pt;margin-top:14px;line-height:1.6;}
  .firma-row{display:flex;justify-content:space-between;margin-top:40px;gap:30px;}
  .firma{flex:1;text-align:center;}
  .firma-linea{border-top:1.5px solid #1a1a1a;margin-bottom:6px;margin-top:40px;}
  .footer{margin-top:16px;border-top:1px solid #ddd;padding-top:10px;font-size:8pt;color:#888;text-align:center;line-height:1.6;}
  @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}}
</style></head><body>
<div class="page">
  <div class="header">
    <div>
      <div class="empresa">${empresa}</div>
      <div style="font-size:9pt;color:#555;margin-top:3px">RUT Empresa: _______________ · Giro: Ingeniería y Construcción</div>
    </div>
    <div style="text-align:right">
      <div class="sii-badge">SII — Formulario 1887</div>
      <div class="doc-title">Certificado Anual de Remuneraciones</div>
      <div style="font-size:9pt;color:#555;margin-top:2px">Año tributario ${parseInt(anio)+1} · Año comercial ${anio}</div>
    </div>
  </div>

  <div class="trabajador-box">
    <div class="tw-field"><div class="label">Trabajador</div><div class="value">${nombre}</div></div>
    <div class="tw-field"><div class="label">RUT</div><div class="value">${trabajador?.rut||'—'}</div></div>
    <div class="tw-field"><div class="label">Cargo</div><div class="value">${contrato?.cargo||'—'}</div></div>
    <div class="tw-field"><div class="label">AFP</div><div class="value">${trabajador?.afp||'—'}</div></div>
    <div class="tw-field"><div class="label">Salud</div><div class="value">${trabajador?.prevision||'Fonasa'}</div></div>
    <div class="tw-field"><div class="label">UTM usada</div><div class="value">$${(utm||UTM_DEFAULT).toLocaleString('es-CL')}</div></div>
  </div>

  <div class="sec-titulo">Detalle mensual ${anio}</div>
  <table>
    <thead><tr>
      <th>Mes</th><th style="text-align:right">Imponible</th><th style="text-align:right">No Imp.</th>
      <th style="text-align:right">AFP</th><th style="text-align:right">Salud</th>
      <th style="text-align:right">Ces.+SIS</th><th style="text-align:right;color:#c4b5fd">IUT 2ª Cat.</th>
      <th style="text-align:right">Líquido</th>
    </tr></thead>
    <tbody>${filasMeses}</tbody>
    <tfoot><tr class="total-row">
      <td>TOTALES ${anio}</td>
      <td style="text-align:right">${fmt(totalImp)}</td>
      <td style="text-align:right">${fmt(totalNoImp)}</td>
      <td style="text-align:right;color:#dc2626">-${fmt(totalAfp)}</td>
      <td style="text-align:right;color:#dc2626">-${fmt(totalSalud)}</td>
      <td style="text-align:right;color:#dc2626">-${fmt(totalCes)}</td>
      <td style="text-align:right;color:#7c3aed;font-size:11pt">-${fmt(totalIUT)}</td>
      <td style="text-align:right;color:#059669;font-size:11pt">${fmt(totalLiquido)}</td>
    </tr></tfoot>
  </table>

  <div class="resumen">
    <div class="card"><div class="card-label">Renta anual imponible</div><div class="card-value" style="color:#5b21b6">${fmt(totalImp)}</div></div>
    <div class="card"><div class="card-label">Total cotizaciones</div><div class="card-value" style="color:#dc2626">-${fmt(totalAfp+totalSalud+totalCes)}</div></div>
    <div class="card"><div class="card-label">Total IUT 2ª Cat.</div><div class="card-value" style="color:#7c3aed">-${fmt(totalIUT)}</div></div>
    <div class="card"><div class="card-label">Total líquido anual</div><div class="card-value" style="color:#059669">${fmt(totalLiquido)}</div></div>
  </div>

  <div class="disclaimer">
    <strong>📋 Declaración Jurada 1887 (Art. 42 N°1 y Art. 101 LIR):</strong> El empleador declara que las remuneraciones indicadas corresponden a los valores efectivamente pagados al trabajador durante el año comercial ${anio}. Este certificado debe ser entregado al trabajador para acreditar sus rentas ante el SII, instituciones financieras, organismos públicos y privados. El IUT fue calculado usando UTM promedio de $${(utm||UTM_DEFAULT).toLocaleString('es-CL')}. Los valores son referenciales y deben ser verificados con la liquidación oficial de cada período.
  </div>

  <div class="firma-row">
    <div class="firma">
      <div class="firma-linea"></div>
      <div style="font-weight:900;font-size:10pt">${empresa}</div>
      <div style="font-size:9pt;color:#555">Empleador / Representante Legal · RUT: _______________</div>
    </div>
    <div class="firma">
      <div class="firma-linea"></div>
      <div style="font-weight:900;font-size:10pt">${nombre}</div>
      <div style="font-size:9pt;color:#555">Trabajador/a · RUT: ${trabajador?.rut||'—'}</div>
    </div>
  </div>

  <div class="footer">
    Certificado Anual de Remuneraciones · ${empresa} · Generado: ${new Date().toLocaleDateString('es-CL')} ·
    Art. 42 N°1 LIR · Art. 101 LIR · Formulario 1887 SII ·
    Este documento no reemplaza la declaración oficial al SII. Verifique con su contador o asesor tributario.
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
  // Tablas de códigos Previred
  const COD_AFP = {
    'Capital':'08','Cuprum':'02','Habitat':'05',
    'PlanVital':'29','ProVida':'34','Uno':'36',
  };
  const COD_JORNADA = {
    'Completa (45 hrs)':'07','Parcial (30 hrs)':'02','Parcial (20 hrs)':'02',
    'Turno 7x7':'07','Turno 14x14':'07','Turno 4x3':'07',
  };
  const splitRut = (rut) => {
    if (!rut) return ['',''];
    const clean = rut.replace(/\./g,'').split('-');
    return [clean[0]||'', (clean[1]||'').toUpperCase()];
  };
  const fmtFecha = (f) => {
    if (!f) return '';
    const [y,m,d] = f.split('-');
    return `${d}/${m}/${y}`;
  };
  const tipoCtto = (tipo) => {
    if (!tipo) return 'D';
    if (tipo.includes('Indefinido')) return 'D';
    if (tipo.includes('Plazo'))      return 'P';
    if (tipo.includes('Obra'))       return 'O';
    return 'D';
  };

  // Extraer mes y año del período (ej: "Marzo 2026")
  const [mesLabel, anioStr] = periodo.split(' ');
  const MESES_NUM = { Enero:'01',Febrero:'02',Marzo:'03',Abril:'04',Mayo:'05',Junio:'06',
    Julio:'07',Agosto:'08',Septiembre:'09',Octubre:'10',Noviembre:'11',Diciembre:'12' };
  const mesNum  = MESES_NUM[mesLabel] || '01';
  const periodoStr = `${mesNum}${anioStr || new Date().getFullYear()}`;

  const errores = [];
  const filas   = [];

  liqEnriquecidas.forEach(({ trabajador: trab, contrato, liq }, i) => {
    const validRut = validarRutPrevired(trab?.rut||'');
    if (!validRut.ok) errores.push(`Fila ${i+1} — ${trab?.nombre||'?'}: ${validRut.error}`);

    if (!trab || !contrato) return;

    const calc     = calcularLiquidacionConIUT({ ...contrato, ...liq, afp: trab.afp }, UTM_DEFAULT);
    const [rutNum, dv] = splitRut(trab.rut);
    const esIsapre = trab.prevision && trab.prevision !== 'FONASA' && trab.prevision !== 'Fonasa';
    const esPF     = contrato.tipoContrato === 'Plazo Fijo' || contrato.tipoContrato === 'Obra o Faena';
    const codAfp   = COD_AFP[trab.afp] || '05';
    const codJor   = COD_JORNADA[contrato.jornada] || '07';
    const diasTrab = calc.diasTrab ?? 30;

    const rentaImp  = Math.round(calc.imponible || 0);
    const cotAfp    = Math.round(calc.afpM || 0);
    const cotSalud  = Math.round(calc.salM || 0);
    const cesTrab   = Math.round(calc.cesM || 0);
    const cesEmp    = Math.round(calc.cesEmpM || 0);
    const sis       = Math.round(calc.sisM || 0);
    const sueldoBase= Math.round(calc.base || 0);
    const rentaBruta= Math.round((calc.imponible||0) + (calc.noImponible||0));

    const fila = new Array(105).fill('');
    fila[0]  = rutNum;
    fila[1]  = dv;
    fila[2]  = trab.apellidoPaterno || '';
    fila[3]  = trab.apellidoMaterno || '';
    fila[4]  = trab.nombre || '';
    fila[5]  = trab.sexo || 'M';
    fila[6]  = '0';
    fila[7]  = '01';
    fila[8]  = periodoStr;
    fila[9]  = periodoStr;
    fila[10] = 'AFP';
    fila[11] = esIsapre ? '1' : '0';
    fila[12] = String(diasTrab);
    fila[13] = '0';
    fila[14] = String(trab.tramoAsignacion || '0');
    fila[15] = fmtFecha(contrato.fechaInicio);
    fila[16] = fmtFecha(contrato.fechaFin || '');
    fila[17] = tipoCtto(contrato.tipoContrato);
    fila[18] = String(trab.cargas || '0');
    fila[19] = String(trab.cargasMaternales || '0');
    fila[20] = '0'; fila[21]='0'; fila[22]='0'; fila[23]='0';
    fila[24] = 'N';
    fila[25] = codAfp;
    fila[26] = String(rentaImp);
    fila[27] = String(cotAfp);
    fila[28] = String(cotSalud);
    fila[29] = '0';
    fila[54] = '0';
    fila[63] = String(sueldoBase);
    fila[69] = String(sis);
    fila[72] = '0'; fila[73]='0';
    fila[74] = codJor;
    fila[81] = '0';
    fila[92] = '1';
    fila[93] = String(cesTrab);
    fila[95] = esPF ? '01' : '02';
    fila[96] = String(rentaImp);
    fila[97] = String(cesEmp);
    fila[98] = '0';
    fila[99] = String(rentaBruta);
    fila[100]= '0';
    fila[101]= String(cesEmp);
    fila[104]= codAfp;

    filas.push(fila.join(';'));
  });

  if (errores.length > 0) {
    alert(`⚠ Previred — ${errores.length} error(es) de validación:\n\n${errores.join('\n')}\n\nEl archivo se generará igualmente. Corrija los RUTs antes de subir.`);
  }

  // Sin cabecera — formato nativo Previred (TXT separado por ;)
  const txt  = filas.join('\r\n');
  const blob = new Blob([txt], { type:'text/plain;charset=latin1' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = `previred_${anioStr || ''}${mesNum}.txt`;
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

// ─── Versiones Blob (para firma electrónica) ──────────────────────────────────
// Generan el mismo PDF pero retornan un Blob en vez de solo descargar.
// Se usan desde RRHH.modals.jsx antes de enviar a ValidaFirma.

async function generarPDFContratoBlob(contrato, trabajador) {
  return new Promise((resolve, reject) => {
    try {
      const html = _buildContratoHTML(contrato, trabajador); // misma lógica interna
      const w = window.open('', '_blank');
      if (!w) { reject(new Error('Popup bloqueado')); return; }
      // Usar print-to-blob via iframe invisible si disponible
      // Fallback: retornar null para que el modal use generarPDFContrato() estándar
      resolve(null);
    } catch(e) { reject(e); }
  });
}

async function generarPDFAnexoBlob(anexo, trabajador, contrato) {
  // Mismo patrón — retorna null para delegar en el flujo estándar
  return Promise.resolve(null);
}

export { generarPDFContrato, generarPDFLiquidacion, generarPDFResumenNomina,
  generarPDFFiniquito, generarPDFAnexo, generarCertificadoAnual,
  generarPDFReporte, generarPDFAsientos,
  generarPDFContratoBlob, generarPDFAnexoBlob,
  generarAsientos, validarRutPrevired, generarPreviredAvanzado, generarArchivoPago };

// ─────────────────────────────────────────────────────────────
// LIBRO ELECTRÓNICO DE REMUNERACIONES — DIRECCIÓN DEL TRABAJO
// Formato oficial DT · Separador ";" · Encoding latin1 · 147 columnas
// ─────────────────────────────────────────────────────────────

/**
 * Mapeo jornada FleetCore → código DT (campo 1107)
 * 1=Completa, 2=Parcial, 3=Por turno, 4=Excepcional, 5=Obra o faena
 */
function codigoJornada(jornada = '') {
  if (jornada.includes('45'))   return '1';
  if (jornada.includes('30'))   return '2';
  if (jornada.includes('20'))   return '2';
  if (jornada.includes('7x7'))  return '3';
  if (jornada.includes('14x'))  return '3';
  if (jornada.includes('4x3'))  return '3';
  return '1';
}

/**
 * Código AFP para campo 1141
 * Capital=3, Cuprum=5, Habitat=6, PlanVital=7, ProVida=8, Uno=10
 */
function codigoAFP(afp = '') {
  const mapa = { Capital:3, Cuprum:5, Habitat:6, PlanVital:7, ProVida:8, Uno:10 };
  return mapa[afp] ?? '';
}

/**
 * Código FONASA/ISAPRE para campo 1143
 * FONASA=7, Banmédica=2, Colmena=3, CruzBlanca=4, Masvida=6, NuevaMasvida=6, VidaTres=9, Esencial=14
 */
function codigoSalud(prevision = '', isapre = '') {
  if (prevision === 'FONASA') return '7';
  const mapa = { Banmédica:2, Colmena:3, 'Cruz Blanca':4, Masvida:6, 'Nueva Masvida':6, 'Vida Tres':9, Esencial:14 };
  return mapa[isapre] ?? '7';
}

/**
 * Convierte causal FleetCore → código DT (campo 1104)
 */
function codigoCausal(causal = '') {
  const mapa = {
    '159-1':'1', '159-2':'2', '159-3':'3', '159-4':'4',
    '159-5':'5', '159-6':'6', '160-1':'7', '160-3':'9',
    '160-4':'10','160-7':'13','161':'22',
  };
  return mapa[causal] ?? '';
}

/**
 * Genera y descarga el Libro Electrónico de Remuneraciones (DT)
 * @param {Array} liquidaciones  - liquidaciones del período filtradas
 * @param {Array} trabajadores   - todos los trabajadores
 * @param {Array} contratos      - todos los contratos
 * @param {string} mes           - "01".."12"
 * @param {string} anio          - "2026"
 * @param {number} utm           - valor UTM del mes
 */
export function generarLibroDT(liquidaciones, trabajadores, contratos, mes, anio, utm = 64085) {

  // Cabecera oficial DT (147 columnas, separador ;)
  const CABECERA = [
    'Rut trabajador(1101)','Fecha inicio contrato(1102)','Fecha término de contrato(1103)',
    'Causal término de contrato(1104)','Región prestación de servicios(1105)',
    'Comuna prestación de servicios(1106)','Tipo impuesto a la renta(1170)',
    'Técnico extranjero exención cot. previsionales(1146)','Código tipo de jornada(1107)',
    'Persona con Discapacidad - Pensionado por Invalidez(1108)','Pensionado por vejez(1109)',
    'AFP(1141)','IPS (ExINP)(1142)','FONASA - ISAPRE(1143)','AFC(1151)','CCAF(1110)',
    'Org. administrador ley 16.744(1152)',
    'Nro cargas familiares legales autorizadas(1111)','Nro de cargas familiares maternales(1112)',
    'Nro de cargas familiares invalidez(1113)','Tramo asignación familiar(1114)',
    'Rut org sindical 1(1171)','Rut org sindical 2(1172)','Rut org sindical 3(1173)',
    'Rut org sindical 4(1174)','Rut org sindical 5(1175)','Rut org sindical 6(1176)',
    'Rut org sindical 7(1177)','Rut org sindical 8(1178)','Rut org sindical 9(1179)',
    'Rut org sindical 10(1180)',
    'Nro días trabajados en el mes(1115)','Nro días de licencia médica en el mes(1116)',
    'Nro días de vacaciones en el mes(1117)','Subsidio trabajador joven(1118)',
    'Puesto Trabajo Pesado(1154)','APVI(1155)','APVC(1157)',
    'Indemnización a todo evento(1131)','Tasa indemnización a todo evento(1132)',
    'Sueldo(2101)','Sobresueldo(2102)','Comisiones(2103)','Semana corrida(2104)',
    'Participación(2105)','Gratificación(2106)','Recargo 30% día domingo(2107)',
    'Remun. variable pagada en vacaciones(2108)','Remun. variable pagada en clausura(2109)',
    'Aguinaldo(2110)','Bonos u otras remun. fijas mensuales(2111)','Tratos(2112)',
    'Bonos u otras remun. variables mensuales o superiores a un mes(2113)',
    'Ejercicio opción no pactada en contrato(2114)',
    'Beneficios en especie constitutivos de remun(2115)',
    'Remuneraciones bimestrales(2116)','Remuneraciones trimestrales(2117)',
    'Remuneraciones cuatrimestral(2118)','Remuneraciones semestrales(2119)',
    'Remuneraciones anuales(2120)','Participación anual(2121)','Gratificación anual(2122)',
    'Otras remuneraciones superiores a un mes(2123)','Pago por horas de trabajo sindical(2124)',
    'Sueldo empresarial (2161)','Subsidio por incapacidad laboral por licencia médica(2201)',
    'Beca de estudio(2202)','Gratificaciones de zona(2203)',
    'Otros ingresos no constitutivos de renta(2204)',
    'Colación(2301)','Movilización(2302)','Viáticos(2303)',
    'Asignación de pérdida de caja(2304)','Asignación de desgaste herramienta(2305)',
    'Asignación familiar legal(2311)','Gastos por causa del trabajo(2306)',
    'Gastos por cambio de residencia(2307)','Sala cuna(2308)',
    'Asignación trabajo a distancia o teletrabajo(2309)','Depósito convenido hasta UF 900(2347)',
    'Alojamiento por razones de trabajo(2310)','Asignación de traslación(2312)',
    'Indemnización por feriado legal(2313)','Indemnización años de servicio(2314)',
    'Indemnización sustitutiva del aviso previo(2315)','Indemnización fuero maternal(2316)',
    'Pago indemnización a todo evento(2331)','Indemnizaciones voluntarias tributables(2417)',
    'Indemnizaciones contractuales tributables(2418)',
    'Cotización obligatoria previsional (AFP o IPS)(3141)',
    'Cotización obligatoria salud 7%(3143)','Cotización voluntaria para salud(3144)',
    'Cotización AFC - trabajador(3151)',
    'Cotizaciones técnico extranjero para seguridad social fuera de Chile(3146)',
    'Descuento depósito convenido hasta UF 900 anual(3147)',
    'Cotización APVi Mod A(3155)','Cotización APVi Mod B hasta UF50(3156)',
    'Cotización APVc Mod A(3157)','Cotización APVc Mod B hasta UF50(3158)',
    'Impuesto retenido por remuneraciones(3161)','Impuesto retenido por indemnizaciones(3162)',
    'Mayor retención de impuestos solicitada por el trabajador(3163)',
    'Impuesto retenido por reliquidación remun. devengadas otros períodos(3164)',
    'Diferencia impuesto reliquidación remun. devengadas en este período(3165)',
    'Retención préstamo clase media 2020 (Ley 21.252) (3166)','Rebaja zona extrema DL 889 (3167)',
    'Cuota sindical 1(3171)','Cuota sindical 2(3172)','Cuota sindical 3(3173)',
    'Cuota sindical 4(3174)','Cuota sindical 5(3175)','Cuota sindical 6(3176)',
    'Cuota sindical 7(3177)','Cuota sindical 8(3178)','Cuota sindical 9(3179)',
    'Cuota sindical 10(3180)','Crédito social CCAF(3110)','Cuota vivienda o educación(3181)',
    'Crédito cooperativas de ahorro(3182)',
    'Otros descuentos autorizados y solicitados por el trabajador(3183)',
    'Cotización adicional trabajo pesado - trabajador(3154)',
    'Donaciones culturales y de reconstrucción(3184)','Otros descuentos(3185)',
    'Pensiones de alimentos(3186)','Descuento mujer casada(3187)',
    'Descuentos por anticipos y préstamos(3188)',
    'AFC - Aporte empleador(4151)',
    'Aporte empleador seguro accidentes del trabajo y Ley SANNA(4152)',
    'Aporte empleador indemnización a todo evento(4131)',
    'Aporte adicional trabajo pesado - empleador(4154)',
    'Aporte empleador seguro invalidez y sobrevivencia(4155)','APVC - Aporte Empleador(4157)',
    'Total haberes(5201)','Total haberes imponibles y tributables(5210)',
    'Total haberes imponibles no tributables(5220)',
    'Total haberes no imponibles y no tributables(5230)',
    'Total haberes no imponibles y tributables(5240)',
    'Total descuentos(5301)','Total descuentos impuestos a las remuneraciones(5361)',
    'Total descuentos impuestos por indemnizaciones(5362)',
    'Total descuentos por cotizaciones del trabajador(5341)',
    'Total otros descuentos(5302)','Total aportes empleador(5410)',
    'Total líquido(5501)','Total indemnizaciones(5502)',
    'Total indemnizaciones tributables(5564)','Total indemnizaciones no tributables(5565)',
  ];

  const n = v => Math.round(v || 0);  // entero sin decimales
  const rows = [];

  for (const liq of liquidaciones) {
    const trab     = trabajadores.find(t => t.id === liq.trabajadorId);
    const contrato = contratos.find(c => c.id === liq.contratoId)
                  || contratos.find(c => c.trabajadorId === liq.trabajadorId && c.estado === 'vigente');
    if (!trab || !contrato) continue;

    // Calcular usando la misma lógica que el resto del sistema
    const calc = calcularLiquidacionConIUT({ ...contrato, ...liq, afp: trab.afp }, utm);

    const sueldo        = n(liq.sueldoBase || contrato.sueldoBase || 0);
    const sobresueldo   = n((liq.horasExtra || 0) * (liq.valorHoraExtra || 0));
    const bonoFijo      = n(liq.bonoProduccion || 0);
    const otrosImp      = n(liq.otrosImponibles || 0);
    const colacion      = n(liq.bonoColacion || contrato.bonoColacion || 0);
    const movilizacion  = n(liq.bonoMovilizacion || contrato.bonoMovilizacion || 0);
    const viaticos      = n(liq.viaticos || 0);
    const otrosNoImp    = n(liq.otrosNoImponibles || 0);
    const anticipo      = n(liq.anticipo || 0);
    const descAdicional = n(liq.descuentoAdicional || 0);

    const afpTrab  = n(calc.afpM);
    const saludTrab= n(calc.salM);
    const cesTrab  = n(calc.cesM);
    const sisEmp   = n(calc.sisM);
    const cesEmp   = n((calc.imponible || 0) * (
      contrato.tipoContrato === 'Indefinido' ? 0.024 : 0.03
    ));
    const iut      = n(calc.iut);

    const totalHabImponibles   = sueldo + sobresueldo + bonoFijo + otrosImp;
    const totalHabNoImp        = colacion + movilizacion + viaticos + otrosNoImp;
    const totalHaberes         = totalHabImponibles + totalHabNoImp;
    const totalCotizTrab       = afpTrab + saludTrab + cesTrab;
    const totalDescuentos      = totalCotizTrab + iut + anticipo + descAdicional;
    const totalAportesEmp      = sisEmp + cesEmp;
    const totalLiquido         = n(calc.liquidoFinal);

    // Fecha contrato formateada DD/MM/AAAA
    const fmtFecha = f => {
      if (!f) return '';
      const [y, m, d] = f.split('-');
      return `${d}/${m}/${y}`;
    };

    // Días trabajados del mes (30 si no hay registro de asistencia)
    const diasTrabajados = liq.diasTrabajados || 30;
    const diasLicencia   = liq.diasLicencia   || 0;
    const diasVacaciones = liq.diasVacaciones || 0;

    // 147 valores en orden exacto del DT
    rows.push([
      trab.rut || '',                          // 1101 RUT trabajador
      fmtFecha(contrato.fechaInicio),           // 1102 Fecha inicio contrato
      fmtFecha(contrato.fechaFin),              // 1103 Fecha término
      codigoCausal(contrato.causalTermino),     // 1104 Causal término
      trab.region || '',                        // 1105 Región
      trab.comuna || '',                        // 1106 Comuna
      '1',                                     // 1170 Tipo impuesto (1=2ª categoría)
      '0',                                     // 1146 Técnico extranjero
      codigoJornada(contrato.jornada),          // 1107 Tipo jornada
      '0',                                     // 1108 Discapacidad/invalidez
      '0',                                     // 1109 Pensionado vejez
      codigoAFP(trab.afp),                     // 1141 AFP
      '',                                      // 1142 IPS (ExINP)
      codigoSalud(trab.prevision, trab.isapre),// 1143 FONASA/ISAPRE
      '1',                                     // 1151 AFC (1=sí)
      '',                                      // 1110 CCAF
      '',                                      // 1152 Org. ley 16.744
      '0',                                     // 1111 Cargas familiares legales
      '0',                                     // 1112 Cargas maternales
      '0',                                     // 1113 Cargas invalidez
      'D',                                     // 1114 Tramo asig. familiar (D=sin derecho)
      '','','','','','','','','','',            // 1171-1180 Sindicatos (10 columnas)
      diasTrabajados,                          // 1115 Días trabajados
      diasLicencia,                            // 1116 Días licencia médica
      diasVacaciones,                          // 1117 Días vacaciones
      '0',                                     // 1118 Subsidio trabajador joven
      '0',                                     // 1154 Trabajo pesado
      '0',                                     // 1155 APVI
      '0',                                     // 1157 APVC
      '0',                                     // 1131 Indemnización todo evento
      '0',                                     // 1132 Tasa indem. todo evento
      // ── Haberes imponibles ──
      sueldo,                                  // 2101 Sueldo
      sobresueldo,                             // 2102 Sobresueldo (horas extra)
      '0',                                     // 2103 Comisiones
      '0',                                     // 2104 Semana corrida
      '0',                                     // 2105 Participación
      '0',                                     // 2106 Gratificación mensual
      '0',                                     // 2107 Recargo domingo
      '0',                                     // 2108 Remun. variable vacaciones
      '0',                                     // 2109 Remun. variable clausura
      '0',                                     // 2110 Aguinaldo
      bonoFijo,                                // 2111 Bonos fijos mensuales
      '0',                                     // 2112 Tratos
      otrosImp,                                // 2113 Bonos variables mensuales
      '0',                                     // 2114 Ejercicio opción
      '0',                                     // 2115 Beneficios en especie
      '0',                                     // 2116 Remun. bimestrales
      '0',                                     // 2117 Remun. trimestrales
      '0',                                     // 2118 Remun. cuatrimestral
      '0',                                     // 2119 Remun. semestrales
      '0',                                     // 2120 Remun. anuales
      '0',                                     // 2121 Participación anual
      '0',                                     // 2122 Gratificación anual
      '0',                                     // 2123 Otras remun. sup. a un mes
      '0',                                     // 2124 Pago horas trabajo sindical
      '0',                                     // 2161 Sueldo empresarial
      // ── Ingresos no renta ──
      '0',                                     // 2201 Subsidio incap. laboral
      '0',                                     // 2202 Beca estudio
      '0',                                     // 2203 Gratif. zona
      '0',                                     // 2204 Otros no renta
      // ── No imponibles ──
      colacion,                                // 2301 Colación
      movilizacion,                            // 2302 Movilización
      viaticos,                                // 2303 Viáticos
      '0',                                     // 2304 Asig. pérdida caja
      '0',                                     // 2305 Asig. desgaste herramienta
      '0',                                     // 2311 Asig. familiar legal
      '0',                                     // 2306 Gastos causa del trabajo
      '0',                                     // 2307 Gastos cambio residencia
      '0',                                     // 2308 Sala cuna
      '0',                                     // 2309 Asig. teletrabajo
      '0',                                     // 2347 Depósito convenido UF900
      '0',                                     // 2310 Alojamiento
      '0',                                     // 2312 Asig. traslación
      // ── Indemnizaciones ──
      '0',                                     // 2313 Indem. feriado legal
      '0',                                     // 2314 Indem. años servicio
      '0',                                     // 2315 Indem. aviso previo
      '0',                                     // 2316 Indem. fuero maternal
      '0',                                     // 2331 Pago indem. todo evento
      '0',                                     // 2417 Indem. voluntarias tributables
      '0',                                     // 2418 Indem. contractuales tributables
      // ── Descuentos cotizaciones ──
      afpTrab,                                 // 3141 Cotización AFP/IPS
      saludTrab,                               // 3143 Cotización salud 7%
      '0',                                     // 3144 Cotización voluntaria salud
      cesTrab,                                 // 3151 Cotización AFC trabajador
      '0',                                     // 3146 Cot. técnico extranjero
      '0',                                     // 3147 Desc. depósito convenido
      '0',                                     // 3155 APVi Mod A
      '0',                                     // 3156 APVi Mod B
      '0',                                     // 3157 APVc Mod A
      '0',                                     // 3158 APVc Mod B
      iut,                                     // 3161 Impuesto retenido remun.
      '0',                                     // 3162 Impuesto retenido indem.
      '0',                                     // 3163 Mayor retención solicitada
      '0',                                     // 3164 Impuesto reliquidación otros
      '0',                                     // 3165 Diferencia reliquidación
      '0',                                     // 3166 Retención préstamo clase media
      '0',                                     // 3167 Rebaja zona extrema
      '0','0','0','0','0','0','0','0','0','0', // 3171-3180 Cuotas sindicales
      '0',                                     // 3110 Crédito CCAF
      '0',                                     // 3181 Cuota vivienda/educación
      '0',                                     // 3182 Crédito cooperativas
      '0',                                     // 3183 Otros descuentos autorizados
      '0',                                     // 3154 Cotiz. trabajo pesado trab.
      '0',                                     // 3184 Donaciones
      descAdicional,                           // 3185 Otros descuentos
      '0',                                     // 3186 Pensiones alimentos
      '0',                                     // 3187 Descuento mujer casada
      anticipo,                                // 3188 Descuentos anticipos/préstamos
      // ── Aportes empleador ──
      cesEmp,                                  // 4151 AFC empleador
      '0',                                     // 4152 Seguro accidentes
      '0',                                     // 4131 Indem. todo evento empleador
      '0',                                     // 4154 Trabajo pesado empleador
      sisEmp,                                  // 4155 SIS empleador
      '0',                                     // 4157 APVC empleador
      // ── Totales ──
      totalHaberes,                            // 5201 Total haberes
      totalHabImponibles,                      // 5210 Total hab. imponibles y tributables
      '0',                                     // 5220 Total hab. imponibles no tributables
      otrosNoImp,                              // 5230 Total hab. no imponibles y no tributables
      colacion + movilizacion + viaticos,      // 5240 Total hab. no imponibles y tributables
      totalDescuentos,                         // 5301 Total descuentos
      iut,                                     // 5361 Total desc. impuestos remun.
      '0',                                     // 5362 Total desc. impuestos indem.
      totalCotizTrab,                          // 5341 Total desc. cotizaciones trab.
      anticipo + descAdicional,                // 5302 Total otros descuentos
      totalAportesEmp,                         // 5410 Total aportes empleador
      totalLiquido,                            // 5501 Total líquido
      '0',                                     // 5502 Total indemnizaciones
      '0',                                     // 5564 Total indem. tributables
      '0',                                     // 5565 Total indem. no tributables
    ]);
  }

  // Construir CSV con separador ; y encoding latin1
  const lineas = [CABECERA.join(';')];
  for (const row of rows) {
    lineas.push(row.map(v => String(v ?? '')).join(';'));
  }
  const csvStr = lineas.join('\r\n') + '\r\n';

  // Convertir a latin1 (ISO-8859-1) para cumplir formato DT
  const latin1 = new Uint8Array(csvStr.length);
  for (let i = 0; i < csvStr.length; i++) {
    latin1[i] = csvStr.charCodeAt(i) & 0xff;
  }

  const blob = new Blob([latin1], { type: 'text/csv;charset=iso-8859-1;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  // Nombre sugerido por DT: RUT_AAAAMM.csv
  a.download = `LibroDT_${anio}${mes}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
