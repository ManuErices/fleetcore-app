import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db } from '../../lib/firebase';
import { useEmpresa } from '../../lib/useEmpresa';
import { collection, getDocs, doc, getDoc, query, orderBy } from 'firebase/firestore';
import * as Shared from './shared';
import * as Calc from './calculo';
import * as PDFs from './pdfs';
import * as Modals from './modals';

const { MESES, TIPOS_ANEXO } = Shared;
const { calcularAntiguedad, calcularLiquidacion, alertaVencimiento, labelPeriodo, exportarAsistenciaCSV } = Calc;
const { generarPDFContrato } = PDFs;
const { TrabajadorModal } = Modals;

// ── UI primitives ─────────────────────────────────────────────────────────────

function DataRow({ label, value, shade }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div className={`flex items-start gap-4 px-5 py-2.5 ${shade ? 'bg-slate-50/60' : ''}`}>
      <span className="text-sm text-slate-400 shrink-0" style={{ width: 200 }}>{label}</span>
      <span className="text-sm text-slate-800 font-medium flex-1">{value}</span>
    </div>
  );
}

function Section({ title, icon, children, defaultOpen = true, actions }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-slate-100 last:border-0">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 py-3.5 px-5 text-left hover:bg-slate-50/60 transition-colors"
      >
        <svg
          className={`w-4 h-4 text-slate-400 transition-transform flex-shrink-0 ${open ? '' : '-rotate-90'}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
        {icon && <span className="text-slate-500">{icon}</span>}
        <span className="font-semibold text-slate-800 text-base">{title}</span>
        {actions && <div className="ml-auto" onClick={e => e.stopPropagation()}>{actions}</div>}
      </button>
      <div
        className="border-t-2 border-blue-100"
        style={{ display: open ? 'block' : 'none' }}
      >
        <div className="divide-y divide-slate-100/80">
          {children}
        </div>
      </div>
    </div>
  );
}

function LeftInfoRow({ icon, text, muted }) {
  return (
    <div className={`flex items-start gap-2.5 text-sm ${muted ? 'text-slate-300' : 'text-slate-600'}`}>
      <span className="flex-shrink-0 mt-0.5 text-slate-400">{icon}</span>
      <span className="leading-tight">{text}</span>
    </div>
  );
}

function LeftBtn({ onClick, children }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-700 font-medium hover:bg-slate-50 hover:border-slate-300 transition-all text-left"
    >
      {children}
    </button>
  );
}

// ── SVG icon helpers ──────────────────────────────────────────────────────────
const Ico = {
  briefcase: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>,
  grid:      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16" /></svg>,
  phone:     <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>,
  mail:      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>,
  birthday:  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 15.546c-.523 0-1.046.151-1.5.454a2.704 2.704 0 01-3 0 2.704 2.704 0 00-3 0 2.704 2.704 0 01-3 0 2.704 2.704 0 00-3 0 2.701 2.701 0 00-1.5-.454M9 6l3-3 3 3M9 11h6a1 1 0 011 1v8H8v-8a1 1 0 011-1z" /></svg>,
  key:       <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" /></svg>,
  pencil:    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>,
  doc:       <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>,
  clip:      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>,
  clock:     <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
  check:     <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
  contract:  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>,
  dl:        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>,
  back:      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>,
  cal:       <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>,
};

function fmtFecha(str) {
  if (!str) return null;
  const [y, m, d] = str.split('-');
  if (!y || !m || !d) return str;
  const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  return `${parseInt(d)} de ${meses[parseInt(m) - 1]} de ${y}`;
}

// ── Main component ────────────────────────────────────────────────────────────

export default function TrabajadorPerfil() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { empresaId } = useEmpresa();

  const [trabajador, setTrabajador]   = useState(null);
  const [loadingWorker, setLW]        = useState(true);
  const [tab, setTab]                 = useState('info');
  const [contratos, setContratos]     = useState([]);
  const [liquidaciones, setLiqs]      = useState([]);
  const [anexos, setAnexos]           = useState([]);
  const [asistencia, setAsistencia]   = useState([]);
  const [loading, setLoading]         = useState(true);
  const [editModal, setEditModal]     = useState(false);

  const fmt2 = n => String(n).padStart(2, '0');
  const now = new Date();
  const [mesFiltro, setMesFiltro]   = useState(fmt2(now.getMonth() + 1));
  const [anioFiltro, setAnioFiltro] = useState(String(now.getFullYear()));

  // ── Load worker by ID ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!empresaId || !id) return;
    setLW(true);
    getDoc(doc(db, 'empresas', empresaId, 'trabajadores', id))
      .then(snap => {
        if (snap.exists()) setTrabajador({ id: snap.id, ...snap.data() });
        else navigate('/rrhh/trabajadores', { replace: true });
      })
      .catch(() => navigate('/rrhh/trabajadores', { replace: true }))
      .finally(() => setLW(false));
  }, [empresaId, id]);

  // ── Load related data ───────────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!empresaId || !trabajador) return;
    setLoading(true);
    try {
      const [cSnap, rSnap, aSnap, asSnap] = await Promise.all([
        getDocs(query(collection(db, 'empresas', empresaId, 'contratos'),    orderBy('createdAt', 'desc'))),
        getDocs(query(collection(db, 'empresas', empresaId, 'remuneraciones'), orderBy('createdAt', 'desc'))),
        getDocs(query(collection(db, 'empresas', empresaId, 'anexos'),       orderBy('createdAt', 'desc'))),
        getDocs(collection(db, 'empresas', empresaId, 'asistencia')),
      ]);
      setContratos(cSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(c => c.trabajadorId === trabajador.id));
      setLiqs(rSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(l => l.trabajadorId === trabajador.id));
      setAnexos(aSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(a => a.trabajadorId === trabajador.id));
      const uid = trabajador.portalUid;
      setAsistencia(asSnap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(r => uid ? r.trabajadorId === uid : r.trabajadorId === trabajador.id));
    } catch(e) { console.error(e); }
    setLoading(false);
  }, [empresaId, trabajador]);

  useEffect(() => { load(); }, [load]);

  // ── Loading state ───────────────────────────────────────────────────────────
  if (loadingWorker) return (
    <div className="flex items-center justify-center py-32">
      <div className="w-8 h-8 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
  if (!trabajador) return null;

  // ── Derived ─────────────────────────────────────────────────────────────────
  const ini          = `${trabajador.nombre?.[0] || ''}${trabajador.apellidoPaterno?.[0] || ''}`.toUpperCase();
  const nombreCompleto = `${trabajador.nombre || ''} ${trabajador.apellidoPaterno || ''} ${trabajador.apellidoMaterno || ''}`.trim();
  const fmt          = n => `$${(n || 0).toLocaleString('es-CL')}`;
  const contratoVigente = contratos.find(c => c.estado === 'vigente');

  const { anios, meses: mesesAntig } = contratoVigente
    ? calcularAntiguedad(contratoVigente.fechaInicio, now.toISOString().split('T')[0])
    : { anios: 0, meses: 0 };

  const antiguedadLabel =
    anios > 0   ? `${anios} año${anios !== 1 ? 's' : ''} ${mesesAntig} mes${mesesAntig !== 1 ? 'es' : ''}`
    : mesesAntig > 0 ? `${mesesAntig} mes${mesesAntig !== 1 ? 'es' : ''}`
    : 'Menos de 1 mes';

  // Asistencia
  const asistenciaMes = asistencia.find(r => r.mes === mesFiltro && String(r.anio) === anioFiltro);
  const registros     = asistenciaMes?.registros || {};
  const diasEnMes     = new Date(parseInt(anioFiltro), parseInt(mesFiltro), 0).getDate();

  function fmtHora(ts) {
    if (!ts) return null;
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return `${fmt2(d.getHours())}:${fmt2(d.getMinutes())}`;
  }
  function diffHoras(ts1, ts2) {
    if (!ts1 || !ts2) return null;
    const d1 = ts1.toDate ? ts1.toDate() : new Date(ts1);
    const d2 = ts2.toDate ? ts2.toDate() : new Date(ts2);
    const m = Math.round((d2 - d1) / 60000);
    if (m <= 0) return null;
    return `${Math.floor(m / 60)}h ${fmt2(m % 60)}m`;
  }

  const diasTrabajados  = Object.values(registros).filter(r => r.entrada).length;
  const minutosTotales  = Object.values(registros).reduce((s, r) => {
    if (!r.entrada || !r.salida) return s;
    const d1 = r.entrada.toDate ? r.entrada.toDate() : new Date(r.entrada);
    const d2 = r.salida.toDate  ? r.salida.toDate()  : new Date(r.salida);
    const m  = Math.round((d2 - d1) / 60000);
    return s + (m > 0 ? m : 0);
  }, 0);

  const TABS = [
    { id: 'info',       label: 'Información' },
    { id: 'contratos',  label: 'Contrato' },
    { id: 'asistencia', label: 'Asistencia' },
    { id: 'docs',       label: 'Documentos' },
  ];

  const isActivo = (trabajador.estado || 'activo') === 'activo';
  const estadoLabel = trabajador.estado === 'finiquitado' ? 'Finiquitado'
    : trabajador.estado === 'inactivo' ? 'Inactivo'
    : 'Activo';

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen" style={{ background: '#f0f2f7' }}>

      {/* Breadcrumb */}
      <div className="px-6 py-3 bg-white border-b border-slate-200 flex items-center gap-2 text-sm">
        <button
          onClick={() => navigate('/rrhh/trabajadores')}
          className="text-slate-400 hover:text-slate-700 transition-colors flex items-center gap-1"
        >
          {Ico.back}
          Trabajadores
        </button>
        <span className="text-slate-300">/</span>
        <span className="font-semibold text-slate-700">Ficha de: {nombreCompleto}</span>
      </div>

      {/* Two-column layout */}
      <div className="flex gap-5 p-6 max-w-[1300px]">

        {/* ── LEFT PANEL ───────────────────────────────────────────────────── */}
        <div className="w-72 flex-shrink-0 space-y-4">

          {/* Worker card */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-5">

              {/* Avatar + name */}
              <div className="flex items-center gap-3 mb-5">
                <div className="w-12 h-12 rounded-full flex items-center justify-center text-white font-black text-base flex-shrink-0"
                  style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)' }}>
                  {ini}
                </div>
                <div className="min-w-0">
                  <div className="font-bold text-slate-900 text-sm leading-snug truncate">{nombreCompleto}</div>
                  <div className="text-xs text-slate-400 font-mono mt-0.5">{trabajador.rut}</div>
                </div>
              </div>

              {/* Info items */}
              <div className="space-y-2 mb-5">
                {trabajador.cargo && <LeftInfoRow icon={Ico.briefcase} text={trabajador.cargo.toUpperCase()} />}
                {trabajador.area  && <LeftInfoRow icon={Ico.grid}      text={trabajador.area.toUpperCase()} />}
                {trabajador.telefono && <LeftInfoRow icon={Ico.phone}  text={trabajador.telefono} />}
                {trabajador.email    && <LeftInfoRow icon={Ico.mail}   text={trabajador.email} />}
                {trabajador.fechaNacimiento && (
                  <LeftInfoRow icon={Ico.birthday} text={fmtFecha(trabajador.fechaNacimiento)} />
                )}
                <LeftInfoRow
                  icon={Ico.key}
                  text={trabajador.portalUid ? 'Cuenta de portal activa' : 'Sin cuenta de portal'}
                  muted={!trabajador.portalUid}
                />
              </div>

              {/* Action buttons */}
              <div className="space-y-2">
                <LeftBtn onClick={() => setEditModal(true)}>
                  {Ico.pencil}
                  Editar ficha
                </LeftBtn>
                {contratoVigente && (
                  <LeftBtn onClick={() => generarPDFContrato(contratoVigente, trabajador)}>
                    {Ico.doc}
                    Contrato
                  </LeftBtn>
                )}
                {anexos.length > 0 && (
                  <LeftBtn onClick={() => setTab('docs')}>
                    {Ico.clip}
                    Anexos de contratos
                  </LeftBtn>
                )}
              </div>
            </div>

            {/* Status section */}
            <div className="border-t border-slate-100 p-4 bg-slate-50/50">
              {contratoVigente && isActivo ? (
                <div>
                  <div className="flex items-center gap-1.5 text-emerald-600 font-bold text-sm mb-3">
                    {Ico.check}
                    Trabajador vigente
                  </div>
                  <div className="space-y-2 text-xs text-slate-500 pl-1">
                    <div className="flex items-center gap-2">
                      {Ico.clock}
                      <span>Desde {contratoVigente.fechaInicio}</span>
                    </div>
                    <div className="text-slate-400 pl-5">({antiguedadLabel})</div>
                    <div className="flex items-center gap-2">
                      {Ico.contract}
                      <span className="truncate">
                        {contratoVigente.tipoContrato}
                        {contratoVigente.fechaFin ? ` · ${contratoVigente.fechaFin}` : ''}
                      </span>
                    </div>
                    <button
                      onClick={() => setTab('contratos')}
                      className="pl-5 text-violet-600 hover:text-violet-700 font-semibold transition-colors"
                    >
                      Ver contrato →
                    </button>
                  </div>
                </div>
              ) : (
                <div className={`flex items-center gap-1.5 text-sm font-medium ${
                  trabajador.estado === 'finiquitado' ? 'text-red-500' : 'text-slate-400'
                }`}>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {trabajador.estado === 'finiquitado' ? 'Trabajador finiquitado'
                    : trabajador.estado === 'inactivo' ? 'Trabajador inactivo'
                    : 'Sin contrato vigente'}
                </div>
              )}
            </div>
          </div>

          {/* Stats mini-card */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 grid grid-cols-2 gap-3">
            {[
              { label: 'Contratos',   value: contratos.length,    color: 'text-violet-600' },
              { label: 'Liquidados',  value: liquidaciones.length, color: 'text-emerald-600' },
              { label: 'Anexos',      value: anexos.length,        color: 'text-amber-600' },
              { label: 'Meses asist.',value: asistencia.length,    color: 'text-blue-600' },
            ].map(s => (
              <div key={s.label} className="text-center py-1">
                <div className={`text-xl font-black ${s.color}`}>{loading ? '—' : s.value}</div>
                <div className="text-[10px] text-slate-400 mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── RIGHT PANEL ──────────────────────────────────────────────────── */}
        <div className="flex-1 min-w-0">

          {/* Tab bar */}
          <div className="bg-white rounded-t-xl border border-slate-200 border-b-0">
            <div className="flex overflow-x-auto">
              {TABS.map(t => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`px-6 py-4 text-sm whitespace-nowrap border-b-2 transition-colors font-medium ${
                    tab === t.id
                      ? 'text-violet-700 border-violet-500 font-semibold'
                      : 'text-slate-500 border-transparent hover:text-slate-800 hover:bg-slate-50'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Tab content */}
          <div className="bg-white rounded-b-xl border border-slate-200 shadow-sm min-h-[500px]">
            {loading ? (
              <div className="flex items-center justify-center py-32">
                <div className="w-8 h-8 border-4 border-violet-400 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <>

                {/* ── INFORMACIÓN ── */}
                {tab === 'info' && (
                  <>
                    <Section title="Información del Trabajador" icon={
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                    }>
                      <DataRow label="RUT"              value={trabajador.rut} />
                      <DataRow label="Nombre"           value={trabajador.nombre} shade />
                      <DataRow label="Apellido Paterno" value={trabajador.apellidoPaterno} />
                      <DataRow label="Apellido Materno" value={trabajador.apellidoMaterno} shade />
                      <DataRow label="Fecha de Nacimiento" value={fmtFecha(trabajador.fechaNacimiento)} />
                      <DataRow label="Nacionalidad"     value={trabajador.nacionalidad} shade />
                      <DataRow label="Dirección"        value={trabajador.direccion} />
                      <DataRow label="Región"           value={trabajador.region} shade />
                      <DataRow label="Comuna"           value={trabajador.comuna} />
                      <DataRow label="Email"            value={trabajador.email} shade />
                      <DataRow label="Teléfono"         value={trabajador.telefono} />
                      {trabajador.observaciones && (
                        <DataRow label="Observaciones"  value={trabajador.observaciones} shade />
                      )}
                      {!trabajador.portalUid && (
                        <div className="px-5 py-2.5 bg-amber-50">
                          <span className="text-xs font-semibold text-amber-600">Sin cuenta de portal — no puede marcar asistencia</span>
                        </div>
                      )}
                    </Section>

                    <Section title="Información Laboral" icon={
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                      </svg>
                    }>
                      <DataRow label="Empresa"         value={trabajador.empresa} />
                      <DataRow label="Área"            value={trabajador.area} shade />
                      <DataRow label="Cargo"           value={trabajador.cargo} />
                      <DataRow label="Fecha de Ingreso" value={fmtFecha(trabajador.fechaIngreso)} shade />
                      <DataRow label="Estado"          value={estadoLabel} />
                    </Section>

                    <Section title="Previsión y Salud" icon={
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                      </svg>
                    }>
                      <DataRow label="AFP"               value={trabajador.afp} />
                      <DataRow label="Previsión de Salud" value={trabajador.prevision} shade />
                      <DataRow label="Isapre"             value={trabajador.isapre} />
                      {trabajador.planIsapre && (
                        <DataRow label="Plan Isapre" value={trabajador.planIsapre} shade />
                      )}
                    </Section>
                  </>
                )}

                {/* ── CONTRATO ── */}
                {tab === 'contratos' && (
                  contratos.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                      <svg className="w-10 h-10 mb-3 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                      <p className="text-sm font-medium">Sin contratos registrados</p>
                    </div>
                  ) : contratos.map((c, idx) => {
                    const alerta = c.fechaFin && c.estado === 'vigente' ? alertaVencimiento(c.fechaFin) : null;
                    const tipoBadgeColor = {
                      'Indefinido':       'bg-blue-100 text-blue-700',
                      'Plazo Fijo':       'bg-amber-100 text-amber-700',
                      'Plazo fijo':       'bg-amber-100 text-amber-700',
                      'Obra o Faena':     'bg-orange-100 text-orange-700',
                      'Por obra o faena': 'bg-orange-100 text-orange-700',
                    };
                    return (
                      <Section
                        key={c.id}
                        defaultOpen={idx === 0}
                        title="Contrato de Trabajo"
                        icon={
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                        }
                        actions={
                          <div className="flex items-center gap-2">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${tipoBadgeColor[c.tipoContrato] || 'bg-slate-100 text-slate-500'}`}>
                              {c.tipoContrato}
                            </span>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                              c.estado === 'vigente' ? 'bg-emerald-100 text-emerald-700'
                                : 'bg-slate-100 text-slate-400'
                            }`}>
                              {c.estado || 'vigente'}
                            </span>
                            <button
                              onClick={() => generarPDFContrato(c, trabajador)}
                              className="flex items-center gap-1 px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-bold rounded-lg transition-colors"
                            >
                              {Ico.dl} PDF
                            </button>
                          </div>
                        }
                      >
                        <DataRow label="Tipo de Contrato"   value={c.tipoContrato} />
                        <DataRow label="Cargo"              value={c.cargo} shade />
                        <DataRow label="Sueldo Base"        value={fmt(c.sueldoBase)} />
                        <DataRow label="Jornada"            value={c.jornada} shade />
                        <DataRow label="Empresa"            value={c.empresa} />
                        <DataRow label="Fecha de Inicio"    value={c.fechaInicio} shade />
                        <DataRow
                          label="Fecha de Término"
                          value={
                            c.fechaFin
                              ? <span className="flex items-center gap-2">
                                  {c.fechaFin}
                                  {alerta && (
                                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${alerta.color}`}>
                                      {alerta.texto}
                                    </span>
                                  )}
                                </span>
                              : 'Indefinido'
                          }
                        />
                        {c.semanas && <DataRow label="Semanas"           value={c.semanas} shade />}
                        {c.horasSemana && <DataRow label="Horas semanales" value={c.horasSemana} />}
                      </Section>
                    );
                  })
                )}

                {/* ── ASISTENCIA ── */}
                {tab === 'asistencia' && (
                  <div className="p-5 space-y-5">
                    {/* Controls */}
                    <div className="flex items-center gap-3 flex-wrap">
                      <select
                        className="px-3 py-2 border-2 border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:border-violet-400"
                        value={mesFiltro} onChange={e => setMesFiltro(e.target.value)}>
                        {MESES.map((m, i) => <option key={m} value={fmt2(i + 1)}>{m}</option>)}
                      </select>
                      <select
                        className="px-3 py-2 border-2 border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:border-violet-400"
                        value={anioFiltro} onChange={e => setAnioFiltro(e.target.value)}>
                        {[2023, 2024, 2025, 2026].map(y => <option key={y}>{y}</option>)}
                      </select>
                      {asistenciaMes && (
                        <button
                          onClick={() => exportarAsistenciaCSV(trabajador, contratoVigente, registros, mesFiltro, anioFiltro)}
                          className="flex items-center gap-1.5 px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold text-xs rounded-xl transition-colors">
                          {Ico.dl} Exportar CSV
                        </button>
                      )}
                    </div>

                    {!asistenciaMes ? (
                      <div className="flex flex-col items-center justify-center py-16 text-slate-400 rounded-2xl bg-slate-50">
                        <svg className="w-10 h-10 opacity-25 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        <p className="font-semibold text-sm">Sin registros para {MESES[parseInt(mesFiltro) - 1]} {anioFiltro}</p>
                        {!trabajador.portalUid && (
                          <p className="text-xs mt-2 text-center max-w-xs text-slate-400">
                            El trabajador no tiene cuenta de portal activa.
                          </p>
                        )}
                      </div>
                    ) : (
                      <>
                        <div className="grid grid-cols-3 gap-4">
                          {[
                            { label: 'Días registrados', value: diasTrabajados,       color: 'text-emerald-600' },
                            { label: 'Horas totales',    value: `${Math.floor(minutosTotales / 60)}h ${fmt2(minutosTotales % 60)}m`, color: 'text-violet-600' },
                            { label: 'Modificaciones',   value: (asistenciaMes.modificaciones || []).length, color: 'text-amber-600' },
                          ].map(s => (
                            <div key={s.label} className="rounded-2xl px-4 py-3 text-center bg-slate-50 border border-slate-100">
                              <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
                              <p className="text-[11px] text-slate-400 mt-0.5">{s.label}</p>
                            </div>
                          ))}
                        </div>

                        {/* Calendar */}
                        <div className="rounded-2xl overflow-hidden border border-slate-200">
                          <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
                            <h3 className="text-sm font-black text-slate-800">
                              {MESES[parseInt(mesFiltro) - 1]} {anioFiltro}
                            </h3>
                          </div>
                          <div className="p-4 bg-white">
                            <div className="grid grid-cols-7 gap-1 mb-2">
                              {['Lu','Ma','Mi','Ju','Vi','Sá','Do'].map(d => (
                                <div key={d} className="text-center text-[10px] font-black text-slate-400">{d}</div>
                              ))}
                            </div>
                            {(() => {
                              const primerDia = new Date(parseInt(anioFiltro), parseInt(mesFiltro) - 1, 1).getDay();
                              const offset = primerDia === 0 ? 6 : primerDia - 1;
                              const celdas = [];
                              for (let i = 0; i < offset; i++) celdas.push(<div key={`e${i}`} />);
                              for (let dia = 1; dia <= diasEnMes; dia++) {
                                const dKey = fmt2(dia);
                                const reg = registros[dKey];
                                const dow = new Date(parseInt(anioFiltro), parseInt(mesFiltro) - 1, dia).getDay();
                                const esFS = dow === 0 || dow === 6;
                                let bg, tc;
                                if (reg?.entrada && reg?.salida) { bg = '#d1fae5'; tc = '#065f46'; }
                                else if (reg?.entrada)           { bg = '#fef3c7'; tc = '#92400e'; }
                                else if (esFS)                   { bg = '#f1f5f9'; tc = '#94a3b8'; }
                                else                             { bg = '#fff';    tc = '#cbd5e1'; }
                                celdas.push(
                                  <div key={dKey}
                                    className="aspect-square rounded-lg flex items-center justify-center text-xs font-bold"
                                    style={{ background: bg, color: tc, border: '1px solid rgba(0,0,0,0.05)' }}
                                    title={reg?.entrada ? `E: ${fmtHora(reg.entrada) || '?'}${reg.salida ? ` · S: ${fmtHora(reg.salida)}` : ' (sin salida)'}` : ''}>
                                    {dia}
                                  </div>
                                );
                              }
                              return <div className="grid grid-cols-7 gap-1">{celdas}</div>;
                            })()}
                            <div className="flex items-center gap-4 mt-3 pt-3 border-t border-slate-50">
                              {[['#d1fae5','Completa'],['#fef3c7','Sólo entrada'],['#f1f5f9','Fin de semana']].map(([bg, label]) => (
                                <div key={label} className="flex items-center gap-1.5">
                                  <div className="w-3 h-3 rounded" style={{ background: bg, border: '1px solid rgba(0,0,0,0.08)' }} />
                                  <span className="text-[10px] text-slate-400">{label}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                          <div className="border-t border-slate-100 max-h-72 overflow-y-auto divide-y divide-slate-50">
                            {Array.from({ length: diasEnMes }, (_, i) => {
                              const dKey = fmt2(i + 1);
                              const reg = registros[dKey];
                              if (!reg?.entrada) return null;
                              const diff = diffHoras(reg.entrada, reg.salida);
                              return (
                                <div key={dKey} className="flex items-center justify-between px-4 py-2.5">
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-black text-slate-700 w-7 text-center">{i + 1}</span>
                                    <span className="text-xs text-slate-400">{MESES[parseInt(mesFiltro) - 1].slice(0, 3)}</span>
                                  </div>
                                  <div className="flex items-center gap-3 font-mono text-xs">
                                    <span className="text-slate-600">{fmtHora(reg.entrada) || '—'}</span>
                                    <span className="text-slate-300">→</span>
                                    <span className="text-slate-600">{reg.salida ? fmtHora(reg.salida) : <span className="text-amber-500">sin salida</span>}</span>
                                    {diff && <span className="font-bold text-emerald-600">{diff}</span>}
                                  </div>
                                </div>
                              );
                            }).filter(Boolean)}
                          </div>
                        </div>

                        {/* Historial meses */}
                        {asistencia.length > 1 && (
                          <div className="rounded-2xl overflow-hidden border border-slate-200">
                            <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
                              <h3 className="text-sm font-black text-slate-800">Historial de meses</h3>
                            </div>
                            <div className="divide-y divide-slate-50">
                              {asistencia
                                .sort((a, b) => b.anio !== a.anio ? b.anio - a.anio : b.mes.localeCompare(a.mes))
                                .map(r => {
                                  const dias = Object.values(r.registros || {}).filter(x => x.entrada).length;
                                  const mods = (r.modificaciones || []).length;
                                  const esCurrent = r.mes === mesFiltro && String(r.anio) === anioFiltro;
                                  return (
                                    <button key={r.id}
                                      onClick={() => { setMesFiltro(r.mes); setAnioFiltro(String(r.anio)); }}
                                      className={`w-full flex items-center justify-between px-4 py-2.5 transition-colors text-left ${esCurrent ? 'bg-violet-50' : 'hover:bg-slate-50'}`}>
                                      <span className={`text-sm font-bold ${esCurrent ? 'text-violet-700' : 'text-slate-700'}`}>
                                        {MESES[parseInt(r.mes) - 1]} {r.anio}
                                      </span>
                                      <div className="flex items-center gap-3">
                                        <span className="text-sm font-black text-emerald-600">{dias} días</span>
                                        {mods > 0 && <span className="text-xs font-bold text-amber-600">{mods} modif.</span>}
                                      </div>
                                    </button>
                                  );
                                })}
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}

                {/* ── DOCUMENTOS ── */}
                {tab === 'docs' && (
                  <>
                    <Section
                      title={`Liquidaciones (${liquidaciones.length})`}
                      icon={
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      }
                    >
                      {liquidaciones.length === 0 ? (
                        <div className="py-10 text-center text-sm text-slate-400">Sin liquidaciones registradas</div>
                      ) : liquidaciones.map((l, i) => {
                        const c = contratos.find(c => c.id === l.contratoId) || contratoVigente;
                        const calc = c ? calcularLiquidacion({ ...c, ...l }) : null;
                        return (
                          <div key={l.id} className={`flex items-center justify-between px-5 py-3 ${i % 2 ? 'bg-slate-50/60' : ''}`}>
                            <span className="text-sm text-slate-600">{labelPeriodo(l)}</span>
                            <div className="flex items-center gap-3">
                              <span className="text-sm font-bold text-slate-800">{calc ? fmt(calc.liquido) : '—'}</span>
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                l.estado === 'pagado' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                              }`}>
                                {l.estado || 'pendiente'}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </Section>

                    <Section
                      title={`Anexos de Contratos (${anexos.length})`}
                      icon={Ico.clip}
                    >
                      {anexos.length === 0 ? (
                        <div className="py-10 text-center text-sm text-slate-400">Sin anexos registrados</div>
                      ) : anexos.map((a, i) => {
                        const tipoLabel = TIPOS_ANEXO.find(t => t.value === a.tipo)?.label || a.tipo;
                        return (
                          <div key={a.id} className={`flex items-center justify-between px-5 py-3 ${i % 2 ? 'bg-slate-50/60' : ''}`}>
                            <div>
                              <p className="text-sm font-semibold text-slate-700">{tipoLabel}</p>
                              <p className="text-xs text-slate-400 mt-0.5">{a.fechaAnexo || '—'}</p>
                            </div>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                              a.estado === 'anulado' ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-700'
                            }`}>
                              {a.estado === 'anulado' ? 'Anulado' : 'Vigente'}
                            </span>
                          </div>
                        );
                      })}
                    </Section>
                  </>
                )}

              </>
            )}
          </div>
        </div>
      </div>

      {/* Edit modal */}
      {editModal && (
        <TrabajadorModal
          isOpen={editModal}
          onClose={() => setEditModal(false)}
          editData={trabajador}
          onSaved={async () => {
            const snap = await getDoc(doc(db, 'empresas', empresaId, 'trabajadores', id));
            if (snap.exists()) setTrabajador({ id: snap.id, ...snap.data() });
            load();
          }}
        />
      )}
    </div>
  );
}
