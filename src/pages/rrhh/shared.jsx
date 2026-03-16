import { useState, useEffect, useCallback, useRef } from 'react';

// ─────────────────────────────────────────────────────────────
// CONSTANTES GLOBALES RRHH
// ─────────────────────────────────────────────────────────────
export const IMM_2026 = 539000;
export const IMM_2024 = 501787;

export const TASAS_AFP = {
  // Tasas vigentes 2026: 10% cotización obligatoria + comisión AFP
  'Capital':   0.1144, // 10% + 1.44%
  'Cuprum':    0.1144, // 10% + 1.44%
  'Habitat':   0.1137, // 10% + 1.37% ← corregido (era 1.27%)
  'PlanVital': 0.1116, // 10% + 1.16%
  'ProVida':   0.1145, // 10% + 1.45%
  'Uno':       0.0069,
};

export const TASAS = {
  afp:         0.1057,
  salud:       0.07,
  sis:         0.0154,
  ces_trab:    0.009,  // AFC trabajador contrato INDEFINIDO (era 0.006)
  ces_trab_pf: 0.006,  // AFC trabajador contrato PLAZO FIJO / OBRA
  ces_emp:     0.024,
  ces_pf_trab: 0.0,
  ces_pf_emp:  0.03,
  mutual:      0.0348, // Mutual AT — tasa específica MPF Ingeniería Civil (3.48%)
};

export const UTM_DEFAULT = 64085;
export const TOPE_ANIOS_INDEMNIZACION = 11;
export const CAUSALES_CON_INDEMNIZACION = ['161'];

export const EMPRESAS = ['LifeMed','Intosim','Río Tinto','Global','Celenor','MPF Ingeniería Civil'];
export const AREAS    = ['Operaciones','Administración','Finanzas','Oficina Técnica','Otro'];
export const AFPS     = ['Capital','Cuprum','Habitat','PlanVital','ProVida','Uno'];
export const ISAPRES  = ['Banmédica','Colmena','Cruz Blanca','Esencial','Masvida','Nueva Masvida','Vida Tres'];
export const TIPOS_CONTRATO = ['Indefinido','Plazo Fijo','Obra o Faena'];
export const JORNADAS = ['Completa (45 hrs)','Parcial (30 hrs)','Parcial (20 hrs)','Turno 7x7','Turno 14x14','Turno 4x3','Otro'];
export const CENTROS_COSTO = ['Obras','Administración Central','Oficina Técnica','Logística'];
export const TIPOS_PERIODO = ['mensual','quincenal','semanal','turno'];
export const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

export const CAUSALES_TERMINO = [
  { codigo:'159-1', label:'Art. 159 N°1 — Mutuo acuerdo' },
  { codigo:'159-2', label:'Art. 159 N°2 — Renuncia voluntaria' },
  { codigo:'159-3', label:'Art. 159 N°3 — Muerte del trabajador' },
  { codigo:'159-4', label:'Art. 159 N°4 — Vencimiento del plazo' },
  { codigo:'159-5', label:'Art. 159 N°5 — Conclusión de obra o faena' },
  { codigo:'159-6', label:'Art. 159 N°6 — Caso fortuito o fuerza mayor' },
  { codigo:'160-1', label:'Art. 160 N°1 — Falta de probidad' },
  { codigo:'160-3', label:'Art. 160 N°3 — Vías de hecho contra el empleador' },
  { codigo:'160-4', label:'Art. 160 N°4 — Injurias al empleador' },
  { codigo:'160-7', label:'Art. 160 N°7 — Incumplimiento grave obligaciones' },
  { codigo:'161',   label:'Art. 161 — Necesidades de la empresa' },
];

export const CAUSALES_SIN_INDEMNIZACION = ['160-1','160-3','160-4','160-7'];

export const COLORES_AREA = {
  Operaciones:      { bg:'#7c3aed', light:'#f3f0ff', text:'#6d28d9' },
  Administración:   { bg:'#0ea5e9', light:'#e0f2fe', text:'#0369a1' },
  Finanzas:         { bg:'#10b981', light:'#d1fae5', text:'#065f46' },
  'Oficina Técnica':{ bg:'#f59e0b', light:'#fef3c7', text:'#92400e' },
  Otro:             { bg:'#64748b', light:'#f1f5f9', text:'#334155' },
};

export const TRAMOS_IUT = [
  { desde:0,     hasta:13.5,  tasa:0,    rebaja:0     },
  { desde:13.5,  hasta:30,    tasa:0.04, rebaja:0.54  },
  { desde:30,    hasta:50,    tasa:0.08, rebaja:1.74  },
  { desde:50,    hasta:70,    tasa:0.135,rebaja:4.49  },
  { desde:70,    hasta:90,    tasa:0.23, rebaja:11.14 },
  { desde:90,    hasta:120,   tasa:0.304,rebaja:17.8  },
  { desde:120,   hasta:150,   tasa:0.355,rebaja:23.9  },
  { desde:150,   hasta:999,   tasa:0.40, rebaja:31.4  },
];

export const TIPOS_ANEXO = [
  { value:'aumento_sueldo',  label:'Aumento de sueldo'       },
  { value:'cambio_cargo',    label:'Cambio de cargo'          },
  { value:'cambio_jornada',  label:'Cambio de jornada'        },
  { value:'cambio_lugar',    label:'Cambio de lugar de trabajo'},
  { value:'cambio_empresa',  label:'Cambio de empresa'        },
  { value:'prorroga',        label:'Prórroga de contrato'     },
  { value:'otros_bonos',     label:'Otros bonos/beneficios'   },
  { value:'otro',            label:'Otro'                     },
];

export const ESTADOS_DIA = {
  trabajado:  { label:'Trabajado',   color:'#10b981', bg:'#d1fae5' },
  ausente:    { label:'Ausente',     color:'#ef4444', bg:'#fee2e2' },
  feriado:    { label:'Feriado',     color:'#3b82f6', bg:'#dbeafe' },
  vacaciones: { label:'Vacaciones',  color:'#8b5cf6', bg:'#ede9fe' },
  licencia:   { label:'Licencia',    color:'#f59e0b', bg:'#fef3c7' },
  permiso:    { label:'Permiso',     color:'#64748b', bg:'#f1f5f9' },
};

export const inp = 'w-full px-3.5 py-2.5 bg-white/80 border border-slate-200/80 rounded-xl focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 text-slate-800 text-sm transition-all placeholder:text-slate-300 shadow-sm';

// ─────────────────────────────────────────────────────────────
// UTILIDADES
// ─────────────────────────────────────────────────────────────

/** Clave "YYYY-MM" para un objeto {anio, mes} */
export function mesAnioKey({ anio, mes }) {
  return `${anio}-${String(mes).padStart(2, '0')}`;
}

/** Tasa de rotación mensual (%) */
export function calcularTasaRotacion(ingresos = 0, egresos = 0, dotacion = 1) {
  if (!dotacion) return 0;
  return Math.round(((ingresos + egresos) / 2 / dotacion) * 100 * 10) / 10;
}

/**
 * Genera array de los últimos N meses como { anio, mes, label, key }
 * ordenados de más antiguo a más reciente.
 */
export function ultimosMeses(n = 12) {
  const result = [];
  const hoy = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
    const anio = String(d.getFullYear());
    const mes  = String(d.getMonth() + 1).padStart(2, '0');
    const MESES_CORTO = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    result.push({
      anio, mes,
      label: `${MESES_CORTO[d.getMonth()]} ${anio}`,
      key:   `${anio}-${mes}`,
    });
  }
  return result;
}

/**
 * Exporta un array de filas a CSV y lo descarga.
 * @param {Array<Array>} filas  - [ [col1, col2, ...], ... ] incluyendo cabecera
 * @param {string} nombre       - nombre del archivo sin extensión
 */
export function exportarReporteCSV(filas, nombre = 'reporte') {
  const csv = filas.map(row =>
    row.map(cell => {
      const s = String(cell ?? '').replace(/"/g, '""');
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s}"` : s;
    }).join(',')
  ).join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `${nombre}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─────────────────────────────────────────────────────────────
// COMPONENTES UI COMPARTIDOS
// ─────────────────────────────────────────────────────────────

/** Modal base con overlay, header degradado y botón cerrar */
export function Modal({ isOpen, onClose, title, subtitle, children, maxWidth = 'max-w-2xl' }) {
  useEffect(() => {
    if (isOpen) document.body.style.overflow = 'hidden';
    else        document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex items-start justify-center min-h-full p-4 pt-10 pb-10">
      <div className={`relative bg-white rounded-2xl shadow-2xl w-full ${maxWidth} mb-10`}
        style={{ boxShadow: '0 25px 60px rgba(0,0,0,0.25), 0 0 0 1px rgba(0,0,0,0.04)' }}>
        <div className="px-6 py-5 flex items-center justify-between"
          style={{ background: 'linear-gradient(135deg,#1e1b4b 0%,#312e81 100%)', borderRadius: '16px 16px 0 0' }}>
          <div>
            <h2 className="text-base font-black text-white">{title}</h2>
            {subtitle && <p className="text-xs text-white/60 mt-0.5">{subtitle}</p>}
          </div>
          <button onClick={onClose}
            className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/70 hover:text-white transition-all">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
      </div>
    </div>
  );
}

/** Diálogo de confirmación de eliminación */
export function ConfirmDialog({ isOpen, onClose, onConfirm, nombre }) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6"
        style={{ boxShadow: '0 25px 60px rgba(0,0,0,0.25)' }}>
        <div className="w-12 h-12 rounded-2xl bg-red-100 flex items-center justify-center mx-auto mb-4">
          <svg className="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </div>
        <h3 className="text-base font-black text-slate-800 text-center">¿Eliminar registro?</h3>
        {nombre && <p className="text-sm text-slate-500 text-center mt-1">{nombre}</p>}
        <p className="text-xs text-slate-400 text-center mt-2">Esta acción no se puede deshacer.</p>
        <div className="flex gap-3 mt-5">
          <button onClick={onClose}
            className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm rounded-xl transition-colors">
            Cancelar
          </button>
          <button onClick={() => { onConfirm?.(); onClose?.(); }}
            className="flex-1 py-2.5 bg-red-500 hover:bg-red-600 text-white font-bold text-sm rounded-xl transition-colors">
            Eliminar
          </button>
        </div>
      </div>
    </div>
  );
}

/** Sparkline SVG minimalista */
export function Sparkline({ data = [], color = '#7c3aed', height = 40, width = 120 }) {
  if (!data || data.length < 2) return <div style={{ height, width }} />;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * height;
    return `${x},${y}`;
  }).join(' ');
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5}
        strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={pts.split(' ').at(-1).split(',')[0]}
              cy={pts.split(' ').at(-1).split(',')[1]}
              r={3} fill={color} />
    </svg>
  );
}

/** Mini línea de área para reportes */
export function LineaMini({ data = [], color = '#7c3aed', height = 40 }) {
  const width = 200;
  if (!data || data.length < 2) return <div style={{ height, width }} />;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const toX = i => (i / (data.length - 1)) * width;
  const toY = v => height - ((v - min) / range) * (height - 4) - 2;
  const pts = data.map((v, i) => `${toX(i)},${toY(v)}`).join(' ');
  const areaPath = `M0,${height} ` + data.map((v, i) => `L${toX(i)},${toY(v)}`).join(' ') + ` L${width},${height} Z`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
      <defs>
        <linearGradient id={`lg-${color.replace('#','')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.18} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#lg-${color.replace('#','')})`} />
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5}
        strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Donut chart SVG simple.
 * segments: [{ label, value, color }]
 */
export function DonutChart({ segments = [], size = 120, thickness = 22 }) {
  const total = segments.reduce((s, g) => s + (g.value || 0), 0) || 1;
  const r = (size - thickness) / 2;
  const cx = size / 2;
  const circ = 2 * Math.PI * r;
  let offset = 0;
  const arcs = segments.map((seg, i) => {
    const pct  = (seg.value || 0) / total;
    const dash = pct * circ;
    const gap  = circ - dash;
    const el = (
      <circle key={i} cx={cx} cy={cx} r={r}
        fill="none" stroke={seg.color || '#7c3aed'} strokeWidth={thickness}
        strokeDasharray={`${dash} ${gap}`}
        strokeDashoffset={-offset}
        style={{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%' }} />
    );
    offset += dash;
    return el;
  });
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={cx} cy={cx} r={r} fill="none" stroke="#f1f5f9" strokeWidth={thickness} />
      {arcs}
    </svg>
  );
}

/**
 * Barra horizontal con label, valor y porcentaje.
 * Props: label, sub, value, max, color, formatValue
 */
export function BarraH({ label, sub, value = 0, max = 1, color = '#7c3aed', formatValue }) {
  const pct = Math.min(100, Math.round((value / (max || 1)) * 100));
  const display = formatValue ? formatValue(value) : value;
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <div className="min-w-0">
            <span className="text-xs font-bold text-slate-700 truncate block">{label}</span>
            {sub && <span className="text-[10px] text-slate-400">{sub}</span>}
          </div>
          <span className="text-xs font-black ml-2 flex-shrink-0" style={{ color }}>{display}</span>
        </div>
        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all duration-500"
            style={{ width: `${pct}%`, background: color }} />
        </div>
      </div>
    </div>
  );
}

/**
 * Tarjeta KPI compacta.
 * Props: label, valor, color, bg, sub
 */
export function KPICard({ label, valor, color = 'text-slate-700', bg = 'bg-white', sub }) {
  return (
    <div className={`${bg} rounded-xl px-4 py-3 border border-slate-100 shadow-sm`}>
      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{label}</p>
      <p className={`text-xl font-black ${color} mt-1 leading-tight`}>{valor ?? '—'}</p>
      {sub && <p className="text-[10px] text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// PLAN DE CUENTAS CONTABLE (remuneraciones)
// ─────────────────────────────────────────────────────────────
export const PLAN_CUENTAS_DEFAULT = [
  // DEBE — Gastos de remuneraciones
  { lado:'debe',  codigo:'4-11-001', nombre:'Sueldos y salarios',              tipo:'gasto'  },
  { lado:'debe',  codigo:'4-11-002', nombre:'Horas extraordinarias',           tipo:'gasto'  },
  { lado:'debe',  codigo:'4-11-003', nombre:'Bonos de producción',             tipo:'gasto'  },
  { lado:'debe',  codigo:'4-11-004', nombre:'Colación y movilización',         tipo:'gasto'  },
  { lado:'debe',  codigo:'4-11-005', nombre:'Viáticos y gastos de viaje',      tipo:'gasto'  },
  { lado:'debe',  codigo:'4-11-010', nombre:'Cotización AFP (empleador)',       tipo:'gasto'  },
  { lado:'debe',  codigo:'4-11-011', nombre:'Seguro de Invalidez y Sobrev.',   tipo:'gasto'  },
  { lado:'debe',  codigo:'4-11-012', nombre:'Seguro de Cesantía (empleador)',  tipo:'gasto'  },
  { lado:'debe',  codigo:'4-11-013', nombre:'Mutual de Seguridad',             tipo:'gasto'  },
  // HABER — Pasivos y retenciones
  { lado:'haber', codigo:'2-11-001', nombre:'Remuneraciones por pagar',        tipo:'pasivo' },
  { lado:'haber', codigo:'2-11-002', nombre:'AFP por pagar (trabajador)',       tipo:'pasivo' },
  { lado:'haber', codigo:'2-11-003', nombre:'Salud por pagar (trabajador)',     tipo:'pasivo' },
  { lado:'haber', codigo:'2-11-004', nombre:'Seg. Cesantía por pagar (trab.)', tipo:'pasivo' },
  { lado:'haber', codigo:'2-11-005', nombre:'Impuesto 2ª Categoría por pagar', tipo:'pasivo' },
  { lado:'haber', codigo:'2-11-006', nombre:'AFP por pagar (empleador)',        tipo:'pasivo' },
  { lado:'haber', codigo:'2-11-007', nombre:'Seg. Cesantía por pagar (emp.)',  tipo:'pasivo' },
];


// ─── Geografía Chile ───────────────────────────────────────────────────────
export const REGIONES_COMUNAS = {
  "Arica y Parinacota": ["Arica", "Camarones", "Putre", "General Lagos"],
  "Tarapacá": ["Iquique", "Alto Hospicio", "Pozo Almonte", "Camiña", "Colchane", "Huara", "Pica"],
  "Antofagasta": ["Antofagasta", "Mejillones", "Sierra Gorda", "Taltal", "Calama", "Ollagüe", "San Pedro de Atacama", "Tocopilla", "María Elena"],
  "Atacama": ["Copiapó", "Caldera", "Tierra Amarilla", "Chañaral", "Diego de Almagro", "Vallenar", "Alto del Carmen", "Freirina", "Huasco"],
  "Coquimbo": ["La Serena", "Coquimbo", "Andacollo", "La Higuera", "Paiguano", "Vicuña", "Illapel", "Canela", "Los Vilos", "Salamanca", "Ovalle", "Combarbalá", "Monte Patria", "Punitaqui", "Río Hurtado"],
  "Valparaíso": ["Valparaíso", "Casablanca", "Concón", "Juan Fernández", "Puchuncaví", "Quintero", "Viña del Mar", "Isla de Pascua", "Los Andes", "Calle Larga", "Rinconada", "San Esteban", "La Ligua", "Cabildo", "Papudo", "Petorca", "Zapallar", "Quillota", "Calera", "Hijuelas", "La Cruz", "Nogales", "San Antonio", "Algarrobo", "Cartagena", "El Quisco", "El Tabo", "Santo Domingo", "San Felipe", "Catemu", "Llaillay", "Panquehue", "Putaendo", "Santa María", "Quilpué", "Limache", "Olmué", "Villa Alemana"],
  "Metropolitana de Santiago": ["Santiago", "Cerrillos", "Cerro Navia", "Conchalí", "El Bosque", "Estación Central", "Huechuraba", "Independencia", "La Cisterna", "La Florida", "La Granja", "La Pintana", "La Reina", "Las Condes", "Lo Barnechea", "Lo Espejo", "Lo Prado", "Macul", "Maipú", "Ñuñoa", "Pedro Aguirre Cerda", "Peñalolén", "Providencia", "Pudahuel", "Quilicura", "Quinta Normal", "Recoleta", "Renca", "San Joaquín", "San Miguel", "San Ramón", "Vitacura", "Puente Alto", "Pirque", "San José de Maipo", "Colina", "Lampa", "Tiltil", "San Bernardo", "Buin", "Calera de Tango", "Paine", "Melipilla", "Alhué", "Curacaví", "María Pinto", "San Pedro", "Talagante", "El Monte", "Isla de Maipo", "Padre Hurtado", "Peñaflor"],
  "O'Higgins": ["Rancagua", "Codegua", "Coinco", "Coltauco", "Doñihue", "Graneros", "Las Cabras", "Machalí", "Malloa", "Mostazal", "Olivar", "Peumo", "Pichidegua", "Quinta de Tilcoco", "Rengo", "Requínoa", "San Vicente", "Pichilemu", "La Estrella", "Litueche", "Marchihue", "Navidad", "Paredones", "San Fernando", "Chépica", "Chimbarongo", "Lolol", "Nancagua", "Palmilla", "Peralillo", "Placilla", "Pumanque", "Santa Cruz"],
  "Maule": ["Talca", "Constitución", "Curepto", "Empedrado", "Maule", "Pelarco", "Pencahue", "Río Claro", "San Clemente", "San Rafael", "Cauquenes", "Chanco", "Pelluhue", "Curicó", "Hualañé", "Licantén", "Molina", "Rauco", "Romeral", "Sagrada Familia", "Teno", "Vichuquén", "Linares", "Colbún", "Longaví", "Parral", "Retiro", "San Javier", "Villa Alegre", "Yerbas Buenas"],
  "Ñuble": ["Chillán", "Bulnes", "Chillán Viejo", "El Carmen", "Pemuco", "Pinto", "Quillón", "San Ignacio", "Yungay", "Coihueco", "Ñiquén", "San Carlos", "San Fabián", "San Nicolás", "Cobquecura", "Coelemu", "Ninhue", "Portezuelo", "Quirihue", "Ránquil", "Treguaco"],
  "Biobío": ["Concepción", "Coronel", "Chiguayante", "Florida", "Hualqui", "Lota", "Penco", "San Pedro de la Paz", "Santa Juana", "Talcahuano", "Tomé", "Hualpén", "Lebu", "Arauco", "Cañete", "Contulmo", "Curanilahue", "Los Álamos", "Tirúa", "Los Ángeles", "Antuco", "Cabrero", "Laja", "Mulchén", "Nacimiento", "Negrete", "Quilaco", "Quilleco", "San Rosendo", "Santa Bárbara", "Tucapel", "Yumbel", "Alto Biobío"],
  "La Araucanía": ["Temuco", "Carahue", "Cunco", "Curarrehue", "Freire", "Galvarino", "Gorbea", "Lautaro", "Loncoche", "Melipeuco", "Nueva Imperial", "Padre Las Casas", "Perquenco", "Pitrufquén", "Pucón", "Saavedra", "Teodoro Schmidt", "Toltén", "Vilcún", "Villarrica", "Cholchol", "Angol", "Collipulli", "Curacautín", "Ercilla", "Lonquimay", "Los Sauces", "Lumaco", "Purén", "Renaico", "Traiguén", "Victoria"],
  "Los Ríos": ["Valdivia", "Corral", "Futrono", "La Unión", "Lago Ranco", "Lanco", "Los Lagos", "Máfil", "Mariquina", "Paillaco", "Panguipulli", "Río Bueno"],
  "Los Lagos": ["Puerto Montt", "Calbuco", "Cochamó", "Fresia", "Frutillar", "Los Muermos", "Llanquihue", "Maullín", "Puerto Varas", "Castro", "Ancud", "Chonchi", "Curaco de Vélez", "Dalcahue", "Puqueldón", "Queilén", "Quellón", "Quémchi", "Quinchao", "Osorno", "Puerto Octay", "Purranque", "Puyehue", "Río Negro", "San Juan de la Costa", "San Pablo", "Chaitén", "Futaleufú", "Hualaihué", "Palena"],
  "Aysén": ["Coyhaique", "Lago Verde", "Aysén", "Cisnes", "Guaitecas", "Cochrane", "O'Higgins", "Tortel", "Chile Chico", "Río Ibáñez"],
  "Magallanes": ["Punta Arenas", "Laguna Blanca", "Río Verde", "San Gregorio", "Cabo de Hornos", "Antártica", "Porvenir", "Primavera", "Timaukel", "Natales", "Torres del Paine"],
};
export const REGIONES = Object.keys(REGIONES_COMUNAS);
