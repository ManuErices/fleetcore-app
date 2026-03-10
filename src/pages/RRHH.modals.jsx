import { useState, useEffect, useCallback } from 'react';
import { db } from '../lib/firebase';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, orderBy, serverTimestamp } from 'firebase/firestore';
import * as Shared from './RRHH.shared';
import * as Calc from './RRHH.calculo';
import * as PDFs from './RRHH.pdfs';
import * as Firma from './RRHH.firma';

const {
  inp, EMPRESAS, AREAS, AFPS, ISAPRES, TIPOS_CONTRATO, JORNADAS,
  CAUSALES_TERMINO, TIPOS_PERIODO, MESES, IMM_2026, IMM_2024,
  TASAS, TASAS_AFP, TIPOS_ANEXO, ESTADOS_DIA, UTM_DEFAULT, COLORES_AREA,
} = Shared;

const {
  calcularLiquidacion, calcularLiquidacionConIUT, calcularFiniquito,
  calcularAntiguedad, labelPeriodo, diasDelMes, analizarDia,
  alertaVencimiento, exportarAsistenciaCSV, horasOrdinariasSemanales,
} = Calc;

const {
  generarPDFContrato, generarPDFLiquidacion, generarPDFFiniquito,
  generarPDFAnexo, generarPDFContratoBlob, generarPDFAnexoBlob, generarCertificadoAnual,
} = PDFs;

// ─── Helpers UI ───────────────────────────────────────────────────────────────

function Modal({ isOpen, onClose, title, subtitle, children, maxWidth = 'max-w-2xl' }) {
  useEffect(() => {
    if (isOpen) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-10 overflow-y-auto">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative bg-white rounded-2xl shadow-2xl w-full ${maxWidth} mb-10`}
        style={{ boxShadow: '0 25px 60px rgba(0,0,0,0.25), 0 0 0 1px rgba(0,0,0,0.04)' }}>
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between"
          style={{ background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)', borderRadius: '16px 16px 0 0' }}>
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
  );
}

function Field({ label, children, required }) {
  return (
    <div>
      <label className="block text-[11px] font-black text-slate-500 uppercase tracking-widest mb-1.5">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

function Divider({ label }) {
  return (
    <div className="flex items-center gap-3 my-1">
      <div className="flex-1 h-px bg-slate-100" />
      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{label}</span>
      <div className="flex-1 h-px bg-slate-100" />
    </div>
  );
}

function SaveBtn({ saving, label = 'Guardar', onClick }) {
  return (
    <button onClick={onClick} disabled={saving}
      className="px-6 py-2.5 text-white font-bold text-sm rounded-xl disabled:opacity-50 transition-all active:scale-95"
      style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)', boxShadow: '0 4px 14px rgba(124,58,237,0.3)' }}>
      {saving ? 'Guardando…' : label}
    </button>
  );
}

function CancelBtn({ onClose }) {
  return (
    <button onClick={onClose}
      className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-sm rounded-xl transition-colors">
      Cancelar
    </button>
  );
}

// ─── TrabajadorModal ──────────────────────────────────────────────────────────

function TrabajadorModal({ isOpen, onClose, editData, onSaved }) {
  const empty = {
    nombre: '', apellidoPaterno: '', apellidoMaterno: '',
    rut: '', fechaNacimiento: '', nacionalidad: 'Chilena',
    direccion: '', comuna: '', region: '',
    telefono: '', email: '',
    empresa: '', area: '', cargo: '', fechaIngreso: '',
    afp: '', prevision: 'FONASA', isapre: '',
    estado: 'activo', observaciones: '',
  };
  const [form,   setForm]   = useState(empty);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm(editData ? { ...empty, ...editData } : empty);
  }, [editData, isOpen]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.nombre || !form.apellidoPaterno || !form.rut) {
      alert('Nombre, apellido paterno y RUT son obligatorios.'); return;
    }
    setSaving(true);
    try {
      const payload = { ...form, updatedAt: serverTimestamp() };
      if (editData?.id) {
        await updateDoc(doc(db, 'trabajadores', editData.id), payload);
      } else {
        await addDoc(collection(db, 'trabajadores'), { ...payload, createdAt: serverTimestamp() });
      }
      onSaved?.(); onClose();
    } catch (e) { alert('Error: ' + e.message); }
    setSaving(false);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose}
      title={editData ? 'Editar Trabajador' : 'Nuevo Trabajador'}
      subtitle="Registro de personal · Código del Trabajo"
      maxWidth="max-w-3xl">
      <div className="space-y-5">

        <Divider label="Datos personales" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field label="Nombre" required>
            <input className={inp} value={form.nombre} onChange={e => set('nombre', e.target.value)} placeholder="Nombre(s)" />
          </Field>
          <Field label="Apellido paterno" required>
            <input className={inp} value={form.apellidoPaterno} onChange={e => set('apellidoPaterno', e.target.value)} placeholder="Apellido paterno" />
          </Field>
          <Field label="Apellido materno">
            <input className={inp} value={form.apellidoMaterno} onChange={e => set('apellidoMaterno', e.target.value)} placeholder="Apellido materno" />
          </Field>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field label="RUT" required>
            <input className={inp} value={form.rut} onChange={e => set('rut', e.target.value)} placeholder="12.345.678-9" />
          </Field>
          <Field label="Fecha de nacimiento">
            <input type="date" className={inp} value={form.fechaNacimiento} onChange={e => set('fechaNacimiento', e.target.value)} />
          </Field>
          <Field label="Nacionalidad">
            <input className={inp} value={form.nacionalidad} onChange={e => set('nacionalidad', e.target.value)} />
          </Field>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field label="Dirección">
            <input className={inp} value={form.direccion} onChange={e => set('direccion', e.target.value)} placeholder="Calle y número" />
          </Field>
          <Field label="Comuna">
            <input className={inp} value={form.comuna} onChange={e => set('comuna', e.target.value)} />
          </Field>
          <Field label="Región">
            <input className={inp} value={form.region} onChange={e => set('region', e.target.value)} />
          </Field>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Teléfono">
            <input className={inp} value={form.telefono} onChange={e => set('telefono', e.target.value)} placeholder="+56 9 1234 5678" />
          </Field>
          <Field label="Email">
            <input type="email" className={inp} value={form.email} onChange={e => set('email', e.target.value)} placeholder="correo@ejemplo.cl" />
          </Field>
        </div>

        <Divider label="Datos laborales" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field label="Empresa">
            <select className={inp} value={form.empresa} onChange={e => set('empresa', e.target.value)}>
              <option value="">Seleccionar…</option>
              {EMPRESAS.map(e => <option key={e}>{e}</option>)}
            </select>
          </Field>
          <Field label="Área">
            <select className={inp} value={form.area} onChange={e => set('area', e.target.value)}>
              <option value="">Seleccionar…</option>
              {AREAS.map(a => <option key={a}>{a}</option>)}
            </select>
          </Field>
          <Field label="Cargo">
            <input className={inp} value={form.cargo} onChange={e => set('cargo', e.target.value)} placeholder="Cargo o función" />
          </Field>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Fecha de ingreso">
            <input type="date" className={inp} value={form.fechaIngreso} onChange={e => set('fechaIngreso', e.target.value)} />
          </Field>
          <Field label="Estado">
            <select className={inp} value={form.estado} onChange={e => set('estado', e.target.value)}>
              {['activo', 'inactivo', 'finiquitado'].map(s => (
                <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
              ))}
            </select>
          </Field>
        </div>

        <Divider label="Previsión y salud" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field label="AFP">
            <select className={inp} value={form.afp} onChange={e => set('afp', e.target.value)}>
              <option value="">Seleccionar…</option>
              {AFPS.map(a => <option key={a}>{a}</option>)}
            </select>
          </Field>
          <Field label="Previsión de salud">
            <select className={inp} value={form.prevision} onChange={e => set('prevision', e.target.value)}>
              <option>FONASA</option>
              <option>Isapre</option>
            </select>
          </Field>
          {form.prevision === 'Isapre' && (
            <Field label="Isapre">
              <select className={inp} value={form.isapre} onChange={e => set('isapre', e.target.value)}>
                <option value="">Seleccionar…</option>
                {ISAPRES.map(i => <option key={i}>{i}</option>)}
              </select>
            </Field>
          )}
        </div>

        <Divider label="Observaciones" />
        <Field label="Observaciones">
          <textarea className={inp} rows={2} value={form.observaciones}
            onChange={e => set('observaciones', e.target.value)} placeholder="Notas adicionales (opcional)" />
        </Field>

        <div className="flex justify-end gap-3 pt-2">
          <CancelBtn onClose={onClose} />
          <SaveBtn saving={saving} onClick={handleSave}
            label={editData ? 'Actualizar trabajador' : 'Registrar trabajador'} />
        </div>
      </div>
    </Modal>
  );
}

// ─── FichaTrabajador ──────────────────────────────────────────────────────────

function FichaTrabajador({ trabajador, onEdit, onClose }) {
  const [contratos,     setContratos]     = useState([]);
  const [liquidaciones, setLiquidaciones] = useState([]);
  const [anexos,        setAnexos]        = useState([]);
  const [loading,       setLoading]       = useState(false);

  useEffect(() => {
    if (!trabajador) return;
    setLoading(true);
    Promise.all([
      getDocs(query(collection(db, 'contratos'),      orderBy('createdAt', 'desc'))),
      getDocs(query(collection(db, 'remuneraciones'), orderBy('createdAt', 'desc'))),
      getDocs(query(collection(db, 'anexos'),         orderBy('createdAt', 'desc'))),
    ]).then(([cSnap, rSnap, aSnap]) => {
      setContratos(cSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(c => c.trabajadorId === trabajador.id));
      setLiquidaciones(rSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(l => l.trabajadorId === trabajador.id));
      setAnexos(aSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(a => a.trabajadorId === trabajador.id));
    }).catch(console.error).finally(() => setLoading(false));
  }, [trabajador]);

  if (!trabajador) return null;

  const contratoVigente = contratos.find(c => c.estado === 'vigente');
  const { anios, meses } = contratoVigente
    ? calcularAntiguedad(contratoVigente.fechaInicio, new Date().toISOString().split('T')[0])
    : { anios: 0, meses: 0 };

  const ini = `${trabajador.nombre?.[0] || ''}${trabajador.apellidoPaterno?.[0] || ''}`.toUpperCase();
  const nombreCompleto = `${trabajador.nombre} ${trabajador.apellidoPaterno} ${trabajador.apellidoMaterno || ''}`.trim();
  const estadoColor = {
    activo: 'bg-emerald-100 text-emerald-700',
    inactivo: 'bg-slate-100 text-slate-500',
    finiquitado: 'bg-red-100 text-red-600',
  };
  const fmt = n => `$${(n || 0).toLocaleString('es-CL')}`;

  const totalLiquidaciones = liquidaciones.reduce((s, l) => {
    const c = contratos.find(c => c.id === l.contratoId) || contratoVigente;
    if (!c) return s;
    return s + (calcularLiquidacion({ ...c, ...l }).liquido || 0);
  }, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative h-full w-full max-w-md bg-white shadow-2xl overflow-y-auto flex flex-col"
        style={{ boxShadow: '-8px 0 40px rgba(0,0,0,0.15)' }}>

        {/* Header */}
        <div className="px-6 py-6 flex-shrink-0"
          style={{ background: 'linear-gradient(135deg, #1e1b4b 0%, #4c1d95 100%)' }}>
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-white font-black text-lg flex-shrink-0"
                style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.2)' }}>
                {ini}
              </div>
              <div>
                <h2 className="text-base font-black text-white leading-tight">{nombreCompleto}</h2>
                <p className="text-xs text-white/60 mt-0.5">{trabajador.rut}</p>
                <span className={`inline-flex mt-1 text-[10px] font-black px-2 py-0.5 rounded-full ${estadoColor[trabajador.estado || 'activo']}`}>
                  {trabajador.estado || 'activo'}
                </span>
              </div>
            </div>
            <button onClick={onClose}
              className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/60 hover:text-white transition-all flex-shrink-0">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'Antigüedad',    value: `${anios}a ${meses}m` },
              { label: 'Contratos',     value: contratos.length },
              { label: 'Liquidaciones', value: liquidaciones.length },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-xl px-3 py-2 text-center"
                style={{ background: 'rgba(255,255,255,0.08)' }}>
                <p className="text-xs font-black text-white">{value}</p>
                <p className="text-[10px] text-white/50 mt-0.5">{label}</p>
              </div>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center flex-1 py-20">
            <div className="w-8 h-8 rounded-full animate-spin"
              style={{ border: '2px solid rgba(124,58,237,0.15)', borderTopColor: '#7c3aed' }} />
          </div>
        ) : (
          <div className="flex-1 p-6 space-y-5">

            <section>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Datos personales</p>
              <div className="rounded-xl border border-slate-100 divide-y divide-slate-50">
                {[
                  ['Empresa',   trabajador.empresa],
                  ['Área',      trabajador.area],
                  ['Cargo',     trabajador.cargo || contratoVigente?.cargo],
                  ['Teléfono',  trabajador.telefono],
                  ['Email',     trabajador.email],
                  ['Dirección', trabajador.direccion ? `${trabajador.direccion}, ${trabajador.comuna || ''}` : null],
                  ['F. Ingreso',trabajador.fechaIngreso],
                  ['AFP',       trabajador.afp],
                  ['Previsión', trabajador.prevision === 'Isapre' ? `Isapre ${trabajador.isapre || ''}` : trabajador.prevision],
                ].filter(([, v]) => v).map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between px-3.5 py-2.5">
                    <span className="text-xs text-slate-400 font-medium">{label}</span>
                    <span className="text-xs font-bold text-slate-700 text-right max-w-[60%] truncate">{value}</span>
                  </div>
                ))}
              </div>
            </section>

            {contratoVigente && (
              <section>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Contrato vigente</p>
                <div className="rounded-xl border border-violet-100 bg-violet-50/40 divide-y divide-violet-100/60">
                  {[
                    ['Tipo',       contratoVigente.tipoContrato],
                    ['Sueldo base',fmt(contratoVigente.sueldoBase)],
                    ['Jornada',    contratoVigente.jornada],
                    ['F. inicio',  contratoVigente.fechaInicio],
                    ['F. término', contratoVigente.fechaFin || 'Indefinido'],
                  ].filter(([, v]) => v).map(([label, value]) => {
                    const alerta = label === 'F. término' && contratoVigente.fechaFin
                      ? alertaVencimiento(contratoVigente.fechaFin) : null;
                    return (
                      <div key={label} className="flex items-center justify-between px-3.5 py-2.5">
                        <span className="text-xs text-slate-400 font-medium">{label}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-700">{value}</span>
                          {alerta && (
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${alerta.color}`}>
                              {alerta.texto}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {liquidaciones.length > 0 && (
              <section>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
                  Nómina <span className="normal-case font-semibold">({liquidaciones.length} liquidaciones)</span>
                </p>
                <div className="rounded-xl border border-slate-100 bg-emerald-50/30 divide-y divide-slate-50">
                  <div className="flex items-center justify-between px-3.5 py-2.5">
                    <span className="text-xs text-slate-400 font-medium">Total líquido acumulado</span>
                    <span className="text-sm font-black text-emerald-600">{fmt(totalLiquidaciones)}</span>
                  </div>
                  {liquidaciones.slice(0, 3).map(l => {
                    const c = contratos.find(c => c.id === l.contratoId) || contratoVigente;
                    const calc = c ? calcularLiquidacion({ ...c, ...l }) : null;
                    return (
                      <div key={l.id} className="flex items-center justify-between px-3.5 py-2">
                        <span className="text-xs text-slate-500">{labelPeriodo(l)}</span>
                        <span className="text-xs font-bold text-slate-700">{calc ? fmt(calc.liquido) : '—'}</span>
                      </div>
                    );
                  })}
                  {liquidaciones.length > 3 && (
                    <div className="px-3.5 py-2">
                      <p className="text-[11px] text-slate-400">…y {liquidaciones.length - 3} más</p>
                    </div>
                  )}
                </div>
              </section>
            )}

            {anexos.length > 0 && (
              <section>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
                  Anexos <span className="normal-case font-semibold">({anexos.length})</span>
                </p>
                <div className="rounded-xl border border-slate-100 divide-y divide-slate-50">
                  {anexos.slice(0, 4).map(a => {
                    const tipoLabel = TIPOS_ANEXO.find(t => t.value === a.tipo)?.label || a.tipo;
                    return (
                      <div key={a.id} className="flex items-center justify-between px-3.5 py-2.5">
                        <span className="text-xs text-slate-600 font-medium">{tipoLabel}</span>
                        <span className="text-[11px] text-slate-400">{a.fechaAnexo || '—'}</span>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {trabajador.observaciones && (
              <section>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Observaciones</p>
                <p className="text-xs text-slate-600 bg-slate-50 rounded-xl px-4 py-3 border border-slate-100">
                  {trabajador.observaciones}
                </p>
              </section>
            )}
          </div>
        )}

        <div className="px-6 py-4 border-t border-slate-100 flex gap-2 flex-shrink-0 bg-slate-50/60">
          <button onClick={onEdit}
            className="flex-1 py-2.5 text-white font-bold text-sm rounded-xl transition-all active:scale-95"
            style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)', boxShadow: '0 4px 12px rgba(124,58,237,0.25)' }}>
            ✏️ Editar datos
          </button>
          {contratoVigente && (
            <button onClick={() => generarPDFContrato(contratoVigente, trabajador)}
              className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm rounded-xl transition-colors">
              📄 PDF
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Generadores de Blob PDF real para firma electrónica ────────────────────
// Usa jsPDF para generar un PDF binario válido que ValidaFirma puede procesar.

async function loadJsPDF() {
  if (window.jspdf) return window.jspdf.jsPDF;
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
    s.onload = () => resolve(window.jspdf.jsPDF);
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

async function buildContratoBlob(contrato, trabajador) {
  const jsPDF = await loadJsPDF();
  const doc   = new jsPDF({ unit: 'mm', format: 'a4' });
  const fmtM  = n => `$${(parseInt(n)||0).toLocaleString('es-CL')}`;
  const fmtD  = d => d ? d.split('-').reverse().join('/') : '—';
  const nombre = `${trabajador.nombre||''} ${trabajador.apellidoPaterno||''} ${trabajador.apellidoMaterno||''}`.trim();
  const W = 210, mg = 20, cw = W - mg*2;

  // ── Header ──────────────────────────────────────────────────────────────
  doc.setFillColor(30, 27, 75);
  doc.rect(0, 0, W, 28, 'F');
  doc.setTextColor(255,255,255);
  doc.setFontSize(14); doc.setFont('helvetica','bold');
  doc.text('CONTRATO INDIVIDUAL DE TRABAJO', W/2, 12, { align:'center' });
  doc.setFontSize(9); doc.setFont('helvetica','normal');
  doc.text(`Art. 10 Código del Trabajo · ${contrato.tipoContrato||'Indefinido'}`, W/2, 20, { align:'center' });
  doc.text(`Empresa: ${contrato.empresa||'—'}`, W/2, 25, { align:'center' });

  doc.setTextColor(30, 27, 75);
  let y = 38;

  const section = (title) => {
    doc.setFillColor(240, 240, 255);
    doc.rect(mg, y-4, cw, 7, 'F');
    doc.setFontSize(8); doc.setFont('helvetica','bold');
    doc.setTextColor(100,100,160);
    doc.text(title.toUpperCase(), mg+2, y+0.5);
    doc.setTextColor(30,27,75);
    y += 8;
  };

  const field = (label, value, x, colW) => {
    doc.setFontSize(7.5); doc.setFont('helvetica','normal');
    doc.setTextColor(120,120,140);
    doc.text(label, x, y);
    doc.setFontSize(9); doc.setFont('helvetica','bold');
    doc.setTextColor(30,27,75);
    doc.text(String(value||'—'), x, y+4.5);
  };

  // ── Trabajador ──────────────────────────────────────────────────────────
  section('Trabajador');
  field('Nombre completo', nombre, mg, cw/2);
  field('RUT', trabajador.rut||'—', mg + cw/2, cw/2);
  y += 10;
  field('Cargo', contrato.cargo||'—', mg, cw/2);
  field('Jornada', contrato.jornada||'—', mg + cw/2, cw/2);
  y += 14;

  // ── Vigencia ─────────────────────────────────────────────────────────────
  section('Vigencia del contrato');
  field('Fecha de inicio', fmtD(contrato.fechaInicio), mg, cw/2);
  field('Fecha de término', contrato.tipoContrato==='Indefinido' ? 'Indefinido' : fmtD(contrato.fechaFin), mg+cw/2, cw/2);
  y += 10;
  field('Lugar de trabajo', contrato.lugarTrabajo||contrato.empresa||'—', mg, cw);
  y += 14;

  // ── Remuneración ──────────────────────────────────────────────────────────
  section('Remuneración (Art. 42 CT)');
  field('Sueldo base', fmtM(contrato.sueldoBase), mg, cw/3);
  field('Bono colación', fmtM(contrato.bonoColacion), mg+cw/3, cw/3);
  field('Bono movilización', fmtM(contrato.bonoMovilizacion), mg+2*cw/3, cw/3);
  y += 10;
  field('Gratificación', contrato.gratificacion||'Art. 50 CT (25% tope 4.75 IMM)', mg, cw);
  y += 14;

  // ── Observaciones ──────────────────────────────────────────────────────
  if (contrato.observaciones) {
    section('Observaciones');
    doc.setFontSize(9); doc.setFont('helvetica','normal');
    const lines = doc.splitTextToSize(contrato.observaciones, cw);
    doc.text(lines, mg, y);
    y += lines.length * 5 + 8;
  }

  // ── Firmas ───────────────────────────────────────────────────────────────
  y = Math.max(y, 230);
  doc.setDrawColor(30,27,75);
  doc.line(mg, y, mg+cw/2-10, y);
  doc.line(mg+cw/2+10, y, mg+cw, y);
  doc.setFontSize(9); doc.setFont('helvetica','bold');
  doc.text(nombre, mg + cw/4, y+5, { align:'center' });
  doc.text(contrato.empresa||'Empleador', mg + 3*cw/4, y+5, { align:'center' });
  doc.setFontSize(8); doc.setFont('helvetica','normal'); doc.setTextColor(100,100,140);
  doc.text(`RUT ${trabajador.rut||'—'} · Trabajador`, mg+cw/4, y+10, { align:'center' });
  doc.text('Empleador', mg+3*cw/4, y+10, { align:'center' });

  // ── Footer ───────────────────────────────────────────────────────────────
  doc.setFontSize(7); doc.setTextColor(160,160,180);
  doc.text('Documento generado por FleetCore · Firma electrónica simple Ley 19.799 · ValidaFirma.cl', W/2, 287, { align:'center' });

  return new Blob([doc.output('arraybuffer')], { type: 'application/pdf' });
}

async function buildAnexoBlob(anexo, trabajador, contrato) {
  const jsPDF = await loadJsPDF();
  const doc   = new jsPDF({ unit: 'mm', format: 'a4' });
  const fmtM  = n => `$${(parseInt(n)||0).toLocaleString('es-CL')}`;
  const fmtD  = d => d ? d.split('-').reverse().join('/') : '—';
  const nombre = `${trabajador.nombre||''} ${trabajador.apellidoPaterno||''}`.trim();
  const { TIPOS_ANEXO } = Shared;
  const tipoLabel = TIPOS_ANEXO?.find(t => t.value === anexo.tipo)?.label || anexo.tipo || '—';
  const W = 210, mg = 20, cw = W - mg*2;

  doc.setFillColor(30, 27, 75);
  doc.rect(0, 0, W, 28, 'F');
  doc.setTextColor(255,255,255);
  doc.setFontSize(14); doc.setFont('helvetica','bold');
  doc.text('ANEXO DE CONTRATO DE TRABAJO', W/2, 12, { align:'center' });
  doc.setFontSize(9); doc.setFont('helvetica','normal');
  doc.text(`Art. 11 Código del Trabajo · ${tipoLabel}`, W/2, 20, { align:'center' });
  doc.text(`Fecha: ${fmtD(anexo.fechaAnexo)}`, W/2, 25, { align:'center' });

  doc.setTextColor(30, 27, 75);
  let y = 38;

  const section = (title) => {
    doc.setFillColor(240,240,255);
    doc.rect(mg, y-4, cw, 7, 'F');
    doc.setFontSize(8); doc.setFont('helvetica','bold'); doc.setTextColor(100,100,160);
    doc.text(title.toUpperCase(), mg+2, y+0.5);
    doc.setTextColor(30,27,75); y += 8;
  };
  const field = (label, value, x) => {
    doc.setFontSize(7.5); doc.setFont('helvetica','normal'); doc.setTextColor(120,120,140);
    doc.text(label, x, y);
    doc.setFontSize(9); doc.setFont('helvetica','bold'); doc.setTextColor(30,27,75);
    doc.text(String(value||'—'), x, y+4.5);
  };

  section('Partes');
  field('Trabajador', nombre, mg);
  field('RUT', trabajador.rut||'—', mg+cw/2);
  y += 10;
  field('Empresa', contrato?.empresa||'—', mg);
  field('Contrato base', `${contrato?.tipoContrato||'—'} desde ${fmtD(contrato?.fechaInicio)}`, mg+cw/2);
  y += 14;

  section('Modificaciones acordadas');
  const cambios = [
    anexo.nuevoSueldo  ? `Nuevo sueldo base: ${fmtM(anexo.nuevoSueldo)}` : null,
    anexo.nuevoCargo   ? `Nuevo cargo: ${anexo.nuevoCargo}` : null,
    anexo.nuevaJornada ? `Nueva jornada: ${anexo.nuevaJornada}` : null,
    anexo.nuevaEmpresa ? `Nueva empresa: ${anexo.nuevaEmpresa}` : null,
    anexo.nuevaFechaFin? `Nueva fecha término: ${fmtD(anexo.nuevaFechaFin)}` : null,
  ].filter(Boolean);

  if (cambios.length) {
    cambios.forEach(c => {
      doc.setFillColor(240,253,244);
      doc.rect(mg, y-3, cw, 7, 'F');
      doc.setFontSize(9); doc.setFont('helvetica','normal'); doc.setTextColor(30,100,60);
      doc.text(`✓ ${c}`, mg+3, y+1.5);
      y += 9;
    });
  }

  if (anexo.descripcion) {
    y += 4;
    doc.setFontSize(9); doc.setFont('helvetica','normal'); doc.setTextColor(30,27,75);
    const lines = doc.splitTextToSize(anexo.descripcion, cw);
    doc.text(lines, mg, y);
    y += lines.length * 5;
  }

  y = Math.max(y + 10, 230);
  doc.setDrawColor(30,27,75);
  doc.line(mg, y, mg+cw/2-10, y);
  doc.line(mg+cw/2+10, y, mg+cw, y);
  doc.setFontSize(9); doc.setFont('helvetica','bold'); doc.setTextColor(30,27,75);
  doc.text(nombre, mg+cw/4, y+5, { align:'center' });
  doc.text(contrato?.empresa||'Empleador', mg+3*cw/4, y+5, { align:'center' });
  doc.setFontSize(8); doc.setFont('helvetica','normal'); doc.setTextColor(100,100,140);
  doc.text(`RUT ${trabajador.rut||'—'} · Trabajador`, mg+cw/4, y+10, { align:'center' });
  doc.text('Empleador', mg+3*cw/4, y+10, { align:'center' });

  doc.setFontSize(7); doc.setTextColor(160,160,180);
  doc.text('Documento generado por FleetCore · Firma electrónica simple Ley 19.799 · ValidaFirma.cl', W/2, 287, { align:'center' });

  return new Blob([doc.output('arraybuffer')], { type: 'application/pdf' });
}

// ─── PanelFirma — componente reutilizable ─────────────────────────────────────
// Gestiona el ciclo completo: sin enviar → enviado → firmado
// Props: docId (Firestore id), docType, firmaData, pdfBlob, firmantes, onUpdate

function PanelFirma({ docId, coleccion, firmaData = {}, pdfBlob, nombreArchivo, firmantes = [], onUpdate }) {
  const [enviando,     setEnviando]     = useState(false);
  const [consultando,  setConsultando]  = useState(false);
  const [reenviando,   setReenviando]   = useState(null); // email
  const [error,        setError]        = useState('');

  const estado = firmaData?.estadoFirma || 'sin_enviar';
  const procesoId = firmaData?.firmaProcesoId;
  const badge = Firma.ESTADOS_FIRMA[estado] || Firma.ESTADOS_FIRMA.sin_enviar;

  // ── Enviar a firmar ──────────────────────────────────────────────────────
  const enviar = async () => {
    if (!firmantes.length) { setError('No hay firmantes configurados. Verifica que el trabajador tenga email.'); return; }
    if (!pdfBlob) { setError('Genera el PDF primero antes de enviar a firma.'); return; }
    setEnviando(true); setError('');
    try {
      const apiKey = import.meta.env.VITE_VALIDAFIRMA_API_KEY;
      const resultado = apiKey
        ? await Firma.crearProcesoDeFirma({ pdfBlob, nombreArchivo, firmantes })
        : Firma.crearProcesoDeFirmaDemo({ firmantes });

      await updateDoc(doc(db, coleccion, docId), {
        estadoFirma:      'enviado',
        firmaProcesoId:   resultado.procesoId,
        firmaEnviadoAt:   serverTimestamp(),
        firmaFirmantes:   resultado.firmantesUrls,
        firmaDemo:        resultado.demo || false,
        updatedAt:        serverTimestamp(),
      });
      onUpdate?.();
    } catch (e) { setError(e.message); }
    setEnviando(false);
  };

  // ── Consultar estado ─────────────────────────────────────────────────────
  const consultar = async () => {
    if (!procesoId) return;
    setConsultando(true); setError('');
    try {
      const r = await Firma.consultarEstadoFirma(procesoId);
      await updateDoc(doc(db, coleccion, docId), {
        estadoFirma:    r.completado ? 'completamente_firmado' : r.estado,
        firmaFirmadoPor: r.firmadoPor,
        firmaCheckedAt: serverTimestamp(),
        ...(r.pdfFirmadoUrl ? { firmaPdfUrl: r.pdfFirmadoUrl } : {}),
        updatedAt:      serverTimestamp(),
      });
      onUpdate?.();
    } catch (e) { setError(e.message); }
    setConsultando(false);
  };

  // ── Descargar PDF firmado ────────────────────────────────────────────────
  const descargar = async () => {
    if (!procesoId) return;
    try {
      const blob = await Firma.descargarPDFFirmado(procesoId);
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url; a.download = `FIRMADO_${nombreArchivo || 'documento.pdf'}`;
      a.click(); URL.revokeObjectURL(url);
    } catch (e) { setError(e.message); }
  };

  // ── Reenviar a firmante ──────────────────────────────────────────────────
  const reenviar = async (email) => {
    if (!procesoId) return;
    setReenviando(email); setError('');
    try {
      await Firma.reenviarSolicitudFirma(procesoId, email);
      alert(`✓ Solicitud reenviada a ${email}`);
    } catch (e) { setError(e.message); }
    setReenviando(null);
  };

  const firmantesGuardados = firmaData?.firmaFirmantes || [];
  const esDemo = firmaData?.firmaDemo;

  return (
    <div className="rounded-2xl border border-slate-200 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-slate-200">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/>
          </svg>
          <span className="text-xs font-black text-slate-500 uppercase tracking-widest">Firma electrónica</span>
        </div>
        <span className={badge.bg + ' ' + badge.color + ' text-[11px] font-bold px-2.5 py-1 rounded-full'}>
          {badge.dot} {badge.label}
          {esDemo && <span className="ml-1 opacity-60">(demo)</span>}
        </span>
      </div>

      <div className="p-4 space-y-3">
        {/* Firmantes */}
        {firmantes.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Firmantes</p>
            {firmantes.map((f, i) => {
              const guardado = firmantesGuardados.find(g => g.email === f.email);
              const firmado  = guardado?.estado === 'firmado';
              return (
                <div key={i} className="flex items-center justify-between bg-white border border-slate-100 rounded-xl px-3 py-2">
                  <div>
                    <p className="text-xs font-bold text-slate-700">{f.nombre}</p>
                    <p className="text-[11px] text-slate-400">{f.email} {f.rut ? `· ${f.rut}` : ''}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {firmado
                      ? <span className="text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">✓ Firmado</span>
                      : procesoId && estado !== 'sin_enviar'
                        ? <button
                            onClick={() => reenviar(f.email)}
                            disabled={reenviando === f.email}
                            className="text-[11px] font-bold text-blue-600 hover:underline disabled:opacity-40">
                            {reenviando === f.email ? '…' : '↩ Reenviar'}
                          </button>
                        : <span className="text-[11px] text-slate-300">Pendiente</span>
                    }
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {firmantes.length === 0 && (
          <p className="text-xs text-amber-600 bg-amber-50 rounded-xl px-3 py-2">
            ⚠ El trabajador no tiene email registrado. Agréguelo en sus datos para poder enviar a firma.
          </p>
        )}

        {error && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</p>
        )}

        {/* Acciones */}
        <div className="flex gap-2 pt-1">
          {estado === 'sin_enviar' || estado === 'pendiente' ? (
            <button
              onClick={enviar}
              disabled={enviando || firmantes.length === 0}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 text-white text-sm font-bold rounded-xl transition-all active:scale-95 disabled:opacity-40"
              style={{ background: 'linear-gradient(135deg, #4f46e5, #7c3aed)' }}>
              {enviando
                ? <><span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin"/><span>Enviando…</span></>
                : <><span>✉</span><span>Enviar a firma digital</span></>
              }
            </button>
          ) : (
            <>
              <button
                onClick={consultar}
                disabled={consultando}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold rounded-xl transition-colors disabled:opacity-40">
                {consultando
                  ? <><span className="w-3 h-3 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin"/><span>Consultando…</span></>
                  : <><span>↻</span><span>Actualizar estado</span></>
                }
              </button>
              {(estado === 'completamente_firmado' || estado === 'firmado') && (
                <button
                  onClick={descargar}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-xl transition-colors">
                  ⬇ PDF firmado
                </button>
              )}
            </>
          )}
        </div>

        <p className="text-[10px] text-slate-300 text-center">
          Firma electrónica simple · Ley 19.799 · ValidaFirma.cl
        </p>
      </div>
    </div>
  );
}

// ─── ContratoModal ────────────────────────────────────────────────────────────

function ContratoModal({ isOpen, onClose, editData, trabajadores, onSaved }) {
  const empty = {
    trabajadorId: '', tipoContrato: 'Indefinido', fechaInicio: '', fechaFin: '',
    cargo: '', jornada: 'Completa (45 hrs)', empresa: '', sueldoBase: '',
    bonoColacion: '', bonoMovilizacion: '', estado: 'vigente', observaciones: '',
    estadoFirma: 'sin_enviar',
  };
  const [form,     setForm]     = useState(empty);
  const [saving,   setSaving]   = useState(false);
  const [pdfBlob,  setPdfBlob]  = useState(null);
  const [genPdf,   setGenPdf]   = useState(false);

  useEffect(() => {
    setForm(editData ? { ...empty, ...editData } : empty);
    setPdfBlob(null);
  }, [editData, isOpen]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const trabajadorSel = trabajadores?.find(t => t.id === form.trabajadorId);

  // Firmantes: representante empresa + trabajador (si tiene email)
  const firmantes = [
    ...(trabajadorSel?.email ? [{
      nombre: `${trabajadorSel.apellidoPaterno} ${trabajadorSel.nombre}`,
      email:  trabajadorSel.email,
      rut:    trabajadorSel.rut || '',
    }] : []),
  ];

  // Generar PDF como Blob para firma + abrir vista previa
  const handleGenerarPDF = async () => {
    if (!trabajadorSel || !form.fechaInicio) { alert('Completa trabajador y fecha de inicio.'); return; }
    setGenPdf(true);
    try {
      const blob = await buildContratoBlob(form, trabajadorSel);
      setPdfBlob(blob);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
    } catch(e) {
      alert('Error generando PDF: ' + e.message);
    }
    setGenPdf(false);
  };

  const handleSave = async () => {
    if (!form.trabajadorId || !form.fechaInicio || !form.sueldoBase) {
      alert('Trabajador, fecha de inicio y sueldo base son obligatorios.'); return;
    }
    setSaving(true);
    try {
      const payload = { ...form, updatedAt: serverTimestamp() };
      if (editData?.id) {
        await updateDoc(doc(db, 'contratos', editData.id), payload);
      } else {
        await addDoc(collection(db, 'contratos'), { ...payload, estadoFirma: 'sin_enviar', createdAt: serverTimestamp() });
      }
      onSaved?.(); onClose();
    } catch (e) { alert('Error: ' + e.message); }
    setSaving(false);
  };

  const nombrePdf = `Contrato_${trabajadorSel?.apellidoPaterno || 'Trabajador'}_${form.fechaInicio?.slice(0,7) || ''}.pdf`;

  return (
    <Modal isOpen={isOpen} onClose={onClose}
      title={editData ? 'Editar Contrato' : 'Nuevo Contrato'}
      subtitle="Art. 10 Código del Trabajo · Cláusulas mínimas"
      maxWidth="max-w-2xl">
      <div className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Trabajador" required>
            <select className={inp} value={form.trabajadorId} onChange={e => set('trabajadorId', e.target.value)}>
              <option value="">Seleccionar trabajador…</option>
              {(trabajadores || []).sort((a, b) => a.apellidoPaterno?.localeCompare(b.apellidoPaterno)).map(t => (
                <option key={t.id} value={t.id}>{t.apellidoPaterno} {t.nombre} — {t.rut}</option>
              ))}
            </select>
          </Field>
          <Field label="Tipo de contrato">
            <select className={inp} value={form.tipoContrato} onChange={e => set('tipoContrato', e.target.value)}>
              {TIPOS_CONTRATO.map(t => <option key={t}>{t}</option>)}
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Fecha de inicio" required>
            <input type="date" className={inp} value={form.fechaInicio} onChange={e => set('fechaInicio', e.target.value)} />
          </Field>
          <Field label={`Fecha de término ${form.tipoContrato === 'Indefinido' ? '(no aplica)' : ''}`}>
            <input type="date" className={inp} value={form.fechaFin}
              disabled={form.tipoContrato === 'Indefinido'}
              onChange={e => set('fechaFin', e.target.value)} />
          </Field>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field label="Cargo">
            <input className={inp} value={form.cargo} onChange={e => set('cargo', e.target.value)} placeholder="Cargo o función" />
          </Field>
          <Field label="Empresa">
            <select className={inp} value={form.empresa} onChange={e => set('empresa', e.target.value)}>
              <option value="">Seleccionar…</option>
              {EMPRESAS.map(e => <option key={e}>{e}</option>)}
            </select>
          </Field>
          <Field label="Jornada">
            <select className={inp} value={form.jornada} onChange={e => set('jornada', e.target.value)}>
              {JORNADAS.map(j => <option key={j}>{j}</option>)}
            </select>
          </Field>
        </div>
        <Divider label="Remuneración base (Art. 42 CT)" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field label="Sueldo base ($)" required>
            <input type="number" className={inp} value={form.sueldoBase} onChange={e => set('sueldoBase', e.target.value)} placeholder="Ej: 800000" />
          </Field>
          <Field label="Bono colación ($)">
            <input type="number" className={inp} value={form.bonoColacion} onChange={e => set('bonoColacion', e.target.value)} placeholder="No imponible" />
          </Field>
          <Field label="Bono movilización ($)">
            <input type="number" className={inp} value={form.bonoMovilizacion} onChange={e => set('bonoMovilizacion', e.target.value)} placeholder="No imponible" />
          </Field>
        </div>
        {form.sueldoBase && parseInt(form.sueldoBase) < IMM_2026 && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-xs text-red-700 font-bold">
            ⚠ Sueldo base bajo el IMM 2026 (${IMM_2026.toLocaleString('es-CL')})
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Estado">
            <select className={inp} value={form.estado} onChange={e => set('estado', e.target.value)}>
              <option value="vigente">Vigente</option>
              <option value="terminado">Terminado</option>
              <option value="vencido">Vencido</option>
            </select>
          </Field>
          <Field label="Observaciones">
            <input className={inp} value={form.observaciones} onChange={e => set('observaciones', e.target.value)} placeholder="Notas opcionales" />
          </Field>
        </div>

        {/* Firma electrónica — solo para contratos ya guardados */}
        {editData?.id && (
          <>
            <Divider label="Firma electrónica · Ley 19.799" />
            <div className="space-y-2">
              {/* Botón generar PDF (necesario antes de firmar) */}
              <div className="flex items-center gap-2">
                <button
                  onClick={handleGenerarPDF}
                  disabled={genPdf || !form.trabajadorId || !form.fechaInicio}
                  className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors disabled:opacity-40">
                  {genPdf ? '…' : '📄'} {pdfBlob ? 'Regenerar PDF' : 'Generar PDF para firma'}
                </button>
                {pdfBlob && (
                  <span className="text-xs text-emerald-600 font-bold">✓ PDF listo para enviar</span>
                )}
              </div>
              <PanelFirma
                docId={editData.id}
                coleccion="contratos"
                firmaData={form}
                pdfBlob={pdfBlob}
                nombreArchivo={nombrePdf}
                firmantes={firmantes}
                onUpdate={() => { onSaved?.(); }}
              />
            </div>
          </>
        )}
        {!editData?.id && (
          <p className="text-[11px] text-slate-400 text-center bg-slate-50 rounded-xl px-3 py-2">
            Guarda el contrato primero para habilitar la firma electrónica
          </p>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <CancelBtn onClose={onClose} />
          <SaveBtn saving={saving} onClick={handleSave} label={editData ? 'Actualizar contrato' : 'Crear contrato'} />
        </div>
      </div>
    </Modal>
  );
}

// ─── LiquidacionModal ─────────────────────────────────────────────────────────

function LiquidacionModal({ isOpen, onClose, editData, trabajadores, contratos, onSaved }) {
  const hoy = new Date();
  const empty = {
    trabajadorId: '', contratoId: '',
    mes: String(hoy.getMonth() + 1).padStart(2, '0'), anio: String(hoy.getFullYear()),
    tipoPeriodo: 'mensual', quincena: '1',
    sueldoBase: '', bonoProduccion: '0', horasExtra: '0', valorHoraExtra: '0',
    bonoColacion: '', bonoMovilizacion: '', viaticos: '0',
    otrosImponibles: '0', otrosNoImponibles: '0',
    descuentoAdicional: '0', anticipo: '0',
    estado: 'pendiente', observaciones: '',
  };
  const [form,   setForm]   = useState(empty);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm(editData ? { ...empty, ...editData } : empty);
  }, [editData, isOpen]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleTrabajador = (tid) => {
    const contrato = contratos?.find(c => c.trabajadorId === tid && c.estado === 'vigente');
    setForm(f => ({
      ...f, trabajadorId: tid,
      contratoId: contrato?.id || '',
      sueldoBase: contrato?.sueldoBase || '',
      bonoColacion: contrato?.bonoColacion || '',
      bonoMovilizacion: contrato?.bonoMovilizacion || '',
    }));
  };

  const contratoSel   = contratos?.find(c => c.id === form.contratoId);
  const trabajadorSel = trabajadores?.find(t => t.id === form.trabajadorId);
  const calc = (contratoSel && form.sueldoBase)
    ? calcularLiquidacionConIUT({ ...contratoSel, ...form, afp: trabajadorSel?.afp }, UTM_DEFAULT)
    : null;
  const fmt = n => `$${(n || 0).toLocaleString('es-CL')}`;

  const handleSave = async () => {
    if (!form.trabajadorId || !form.contratoId || !form.mes || !form.anio) {
      alert('Selecciona trabajador, contrato, mes y año.'); return;
    }
    setSaving(true);
    try {
      const payload = { ...form, updatedAt: serverTimestamp() };
      if (editData?.id) {
        await updateDoc(doc(db, 'remuneraciones', editData.id), payload);
      } else {
        await addDoc(collection(db, 'remuneraciones'), { ...payload, createdAt: serverTimestamp() });
      }
      onSaved?.(); onClose();
    } catch (e) { alert('Error: ' + e.message); }
    setSaving(false);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose}
      title={editData ? 'Editar Liquidación' : 'Nueva Liquidación'}
      subtitle="Art. 54 CT · Cotizaciones previsionales · IUT Art. 42 N°1 LIR"
      maxWidth="max-w-3xl">
      <div className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Trabajador" required>
            <select className={inp} value={form.trabajadorId} onChange={e => handleTrabajador(e.target.value)}>
              <option value="">Seleccionar trabajador…</option>
              {(trabajadores || []).sort((a, b) => a.apellidoPaterno?.localeCompare(b.apellidoPaterno)).map(t => (
                <option key={t.id} value={t.id}>{t.apellidoPaterno} {t.nombre}</option>
              ))}
            </select>
          </Field>
          <Field label="Contrato" required>
            <select className={inp} value={form.contratoId} onChange={e => set('contratoId', e.target.value)}>
              <option value="">Seleccionar contrato…</option>
              {(contratos || []).filter(c => c.trabajadorId === form.trabajadorId).map(c => (
                <option key={c.id} value={c.id}>{c.tipoContrato} — {c.empresa} ({c.estado})</option>
              ))}
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Field label="Tipo período">
            <select className={inp} value={form.tipoPeriodo} onChange={e => set('tipoPeriodo', e.target.value)}>
              {TIPOS_PERIODO.map(t => <option key={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Mes" required>
            <select className={inp} value={form.mes} onChange={e => set('mes', e.target.value)}>
              {MESES.map((m, i) => <option key={m} value={String(i + 1).padStart(2, '0')}>{m}</option>)}
            </select>
          </Field>
          <Field label="Año" required>
            <select className={inp} value={form.anio} onChange={e => set('anio', e.target.value)}>
              {[2023, 2024, 2025, 2026].map(y => <option key={y}>{y}</option>)}
            </select>
          </Field>
          <Field label="Estado">
            <select className={inp} value={form.estado} onChange={e => set('estado', e.target.value)}>
              <option value="pendiente">Pendiente</option>
              <option value="pagado">Pagado</option>
            </select>
          </Field>
        </div>
        {form.tipoPeriodo === 'quincenal' && (
          <Field label="Quincena">
            <select className={inp} value={form.quincena} onChange={e => set('quincena', e.target.value)}>
              <option value="1">1ª quincena (1–15)</option>
              <option value="2">2ª quincena (16–fin)</option>
            </select>
          </Field>
        )}

        <Divider label="Haberes imponibles" />
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <Field label="Sueldo base ($)" required>
            <input type="number" className={inp} value={form.sueldoBase} onChange={e => set('sueldoBase', e.target.value)} />
          </Field>
          <Field label="Bono producción ($)">
            <input type="number" className={inp} value={form.bonoProduccion} onChange={e => set('bonoProduccion', e.target.value)} />
          </Field>
          <Field label="Otros imponibles ($)">
            <input type="number" className={inp} value={form.otrosImponibles} onChange={e => set('otrosImponibles', e.target.value)} />
          </Field>
          <Field label="Horas extra">
            <input type="number" className={inp} value={form.horasExtra} onChange={e => set('horasExtra', e.target.value)} />
          </Field>
          <Field label="Valor hora extra ($)">
            <input type="number" className={inp} value={form.valorHoraExtra} onChange={e => set('valorHoraExtra', e.target.value)} />
          </Field>
        </div>

        <Divider label="Haberes no imponibles" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Field label="Colación ($)">
            <input type="number" className={inp} value={form.bonoColacion} onChange={e => set('bonoColacion', e.target.value)} />
          </Field>
          <Field label="Movilización ($)">
            <input type="number" className={inp} value={form.bonoMovilizacion} onChange={e => set('bonoMovilizacion', e.target.value)} />
          </Field>
          <Field label="Viáticos ($)">
            <input type="number" className={inp} value={form.viaticos} onChange={e => set('viaticos', e.target.value)} />
          </Field>
          <Field label="Otros no imp. ($)">
            <input type="number" className={inp} value={form.otrosNoImponibles} onChange={e => set('otrosNoImponibles', e.target.value)} />
          </Field>
        </div>

        <Divider label="Descuentos adicionales" />
        <div className="grid grid-cols-2 gap-4">
          <Field label="Descuento adicional ($)">
            <input type="number" className={inp} value={form.descuentoAdicional} onChange={e => set('descuentoAdicional', e.target.value)} />
          </Field>
          <Field label="Anticipo ($)">
            <input type="number" className={inp} value={form.anticipo} onChange={e => set('anticipo', e.target.value)} />
          </Field>
        </div>

        {calc && (
          <>
            <Divider label="Previsualización liquidación" />
            <div className="rounded-xl border border-slate-200 overflow-hidden">
              <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-slate-100">
                {[
                  { label: 'Base imponible',  value: fmt(calc.imponible),     color: 'text-slate-700' },
                  { label: 'Desc. legales',   value: `-${fmt(calc.totalDescuentos)}`, color: 'text-red-500' },
                  { label: 'IUT (2ª Cat.)',   value: `-${fmt(calc.iut)}`,      color: 'text-purple-600' },
                  { label: 'Líquido a pagar', value: fmt(calc.liquidoFinal),  color: 'text-emerald-600' },
                ].map(({ label, value, color }) => (
                  <div key={label} className="px-4 py-3 text-center">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{label}</p>
                    <p className={`text-base font-black ${color} mt-1`}>{value}</p>
                  </div>
                ))}
              </div>
              <div className="px-4 py-2 bg-slate-50 border-t border-slate-100 text-[11px] text-slate-500 flex gap-4">
                <span>AFP: <strong className="text-red-500">-{fmt(calc.afpM)}</strong></span>
                <span>Salud: <strong className="text-red-500">-{fmt(calc.salM)}</strong></span>
                <span>Cesantía: <strong className="text-red-500">-{fmt(calc.cesM)}</strong></span>
                <span>SIS (emp.): <strong className="text-slate-400">-{fmt(calc.sisM)}</strong></span>
              </div>
            </div>
          </>
        )}

        <div className="flex justify-between items-center pt-2">
          {calc && (
            <button onClick={() => generarPDFLiquidacion({ ...form }, trabajadorSel, contratoSel)}
              className="flex items-center gap-1.5 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm rounded-xl transition-colors">
              📄 Vista previa PDF
            </button>
          )}
          <div className="flex gap-3 ml-auto">
            <CancelBtn onClose={onClose} />
            <SaveBtn saving={saving} onClick={handleSave} label={editData ? 'Actualizar' : 'Guardar liquidación'} />
          </div>
        </div>
      </div>
    </Modal>
  );
}

// ─── FiniquitoModal ───────────────────────────────────────────────────────────

function FiniquitoModal({ isOpen, onClose, editData, trabajadores, contratos, onSaved }) {
  const empty = {
    trabajadorId: '', contratoId: '',
    fechaTermino: new Date().toISOString().split('T')[0],
    causal: '', ultimaRemuneracion: '',
    diasFeriadoPendiente: '0', remuneracionesPendientes: '0',
    pagoAvisoPrevio: 'no', anticipoPendiente: '0', otrosDescuentos: '0',
    estadoFirma: 'pendiente', observaciones: '',
  };
  const [form,   setForm]   = useState(empty);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm(editData ? { ...empty, ...editData } : empty);
  }, [editData, isOpen]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleTrabajador = (tid) => {
    const contrato = contratos?.find(c => c.trabajadorId === tid && c.estado === 'vigente')
      || contratos?.find(c => c.trabajadorId === tid);
    setForm(f => ({
      ...f, trabajadorId: tid,
      contratoId: contrato?.id || '',
      ultimaRemuneracion: contrato?.sueldoBase || '',
    }));
  };

  const contratoSel   = contratos?.find(c => c.id === form.contratoId);
  const trabajadorSel = trabajadores?.find(t => t.id === form.trabajadorId);
  const calc = (form.fechaTermino && form.ultimaRemuneracion)
    ? calcularFiniquito(form, contratoSel, trabajadorSel) : null;
  const fmt = n => `$${(n || 0).toLocaleString('es-CL')}`;

  const handleSave = async () => {
    if (!form.trabajadorId || !form.causal || !form.fechaTermino) {
      alert('Trabajador, causal y fecha de término son obligatorios.'); return;
    }
    setSaving(true);
    try {
      const payload = { ...form, updatedAt: serverTimestamp() };
      if (editData?.id) {
        await updateDoc(doc(db, 'finiquitos', editData.id), payload);
      } else {
        await addDoc(collection(db, 'finiquitos'), { ...payload, createdAt: serverTimestamp() });
      }
      onSaved?.(); onClose();
    } catch (e) { alert('Error: ' + e.message); }
    setSaving(false);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose}
      title={editData ? 'Editar Finiquito' : 'Nuevo Finiquito'}
      subtitle="Art. 159–163 · Art. 177 CT · Ratificación ministro de fe"
      maxWidth="max-w-2xl">
      <div className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Trabajador" required>
            <select className={inp} value={form.trabajadorId} onChange={e => handleTrabajador(e.target.value)}>
              <option value="">Seleccionar trabajador…</option>
              {(trabajadores || []).sort((a, b) => a.apellidoPaterno?.localeCompare(b.apellidoPaterno)).map(t => (
                <option key={t.id} value={t.id}>{t.apellidoPaterno} {t.nombre} — {t.rut}</option>
              ))}
            </select>
          </Field>
          <Field label="Causal de término" required>
            <select className={inp} value={form.causal} onChange={e => set('causal', e.target.value)}>
              <option value="">Seleccionar causal…</option>
              {CAUSALES_TERMINO.map(c => <option key={c.codigo} value={c.codigo}>{c.label}</option>)}
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Fecha de término" required>
            <input type="date" className={inp} value={form.fechaTermino} onChange={e => set('fechaTermino', e.target.value)} />
          </Field>
          <Field label="Última remuneración ($)" required>
            <input type="number" className={inp} value={form.ultimaRemuneracion} onChange={e => set('ultimaRemuneracion', e.target.value)} />
          </Field>
        </div>
        {calc && (
          <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs text-slate-600">
            Antigüedad: <strong>{calc.anios} años {calc.meses} meses</strong>
            {calc.tieneIndemnizacion && (
              <span className="ml-3 text-purple-700 font-bold">
                ✓ Con indemnización ({calc.aniosIndemnizacion} mes{calc.aniosIndemnizacion !== 1 ? 'es' : ''})
              </span>
            )}
          </div>
        )}

        <Divider label="Haberes del finiquito" />
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <Field label="Días feriado pendientes">
            <input type="number" className={inp} value={form.diasFeriadoPendiente} onChange={e => set('diasFeriadoPendiente', e.target.value)} />
          </Field>
          <Field label="Remuneraciones pendientes ($)">
            <input type="number" className={inp} value={form.remuneracionesPendientes} onChange={e => set('remuneracionesPendientes', e.target.value)} />
          </Field>
          <Field label="Aviso previo (Art. 161 CT)">
            <select className={inp} value={form.pagoAvisoPrevio} onChange={e => set('pagoAvisoPrevio', e.target.value)}>
              <option value="no">No aplica / ya dado</option>
              <option value="si">Sí — pagar 1 mes</option>
            </select>
          </Field>
        </div>

        <Divider label="Descuentos" />
        <div className="grid grid-cols-2 gap-4">
          <Field label="Anticipo pendiente ($)">
            <input type="number" className={inp} value={form.anticipoPendiente} onChange={e => set('anticipoPendiente', e.target.value)} />
          </Field>
          <Field label="Otros descuentos ($)">
            <input type="number" className={inp} value={form.otrosDescuentos} onChange={e => set('otrosDescuentos', e.target.value)} />
          </Field>
        </div>

        {calc && (
          <>
            <Divider label="Resumen finiquito" />
            <div className="rounded-xl border border-slate-200 overflow-hidden">
              <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 divide-slate-100">
                {[
                  { label: 'Feriado',        value: fmt(calc.totalFeriado),   color: 'text-blue-600' },
                  { label: 'Gratificación',  value: fmt(calc.gratPropMonto),  color: 'text-indigo-600' },
                  { label: 'Indemnización',  value: fmt(calc.indemMonto),     color: 'text-purple-600' },
                  { label: 'Total finiquito',value: fmt(calc.totalFiniquito), color: 'text-emerald-600' },
                ].map(({ label, value, color }) => (
                  <div key={label} className="px-4 py-3 text-center">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{label}</p>
                    <p className={`text-base font-black ${color} mt-1`}>{value}</p>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Estado de firma">
            <select className={inp} value={form.estadoFirma} onChange={e => set('estadoFirma', e.target.value)}>
              <option value="pendiente">Pendiente</option>
              <option value="firmado">Firmado</option>
              <option value="ratificado">Ratificado (ministro de fe)</option>
            </select>
          </Field>
          <Field label="Observaciones">
            <input className={inp} value={form.observaciones} onChange={e => set('observaciones', e.target.value)} />
          </Field>
        </div>

        <div className="flex justify-between items-center pt-2">
          {calc && (
            <button onClick={() => generarPDFFiniquito(form, trabajadorSel, contratoSel)}
              className="flex items-center gap-1.5 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm rounded-xl transition-colors">
              📄 Vista previa PDF
            </button>
          )}
          <div className="flex gap-3 ml-auto">
            <CancelBtn onClose={onClose} />
            <SaveBtn saving={saving} onClick={handleSave} label={editData ? 'Actualizar finiquito' : 'Guardar finiquito'} />
          </div>
        </div>
      </div>
    </Modal>
  );
}

// ─── AnexoModal ───────────────────────────────────────────────────────────────

function AnexoModal({ isOpen, onClose, editData, contratos, trabajadores, nroAnexo, onSaved }) {
  const empty = {
    trabajadorId: '', contratoId: '', tipo: '',
    fechaAnexo: new Date().toISOString().split('T')[0],
    descripcion: '', nuevoSueldo: '', nuevoCargo: '',
    nuevaJornada: '', nuevaEmpresa: '', nuevaFechaFin: '',
    estado: 'vigente', estadoFirma: 'sin_enviar',
  };
  const [form,    setForm]    = useState(empty);
  const [saving,  setSaving]  = useState(false);
  const [pdfBlob, setPdfBlob] = useState(null);
  const [genPdf,  setGenPdf]  = useState(false);

  useEffect(() => {
    setForm(editData ? { ...empty, ...editData } : empty);
    setPdfBlob(null);
  }, [editData, isOpen]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleTrabajador = (tid) => {
    const contrato = contratos?.find(c => c.trabajadorId === tid && c.estado === 'vigente');
    setForm(f => ({ ...f, trabajadorId: tid, contratoId: contrato?.id || '' }));
  };

  const handleSave = async () => {
    if (!form.trabajadorId || !form.contratoId || !form.tipo || !form.fechaAnexo) {
      alert('Trabajador, contrato, tipo y fecha son obligatorios.'); return;
    }
    setSaving(true);
    try {
      const payload = { ...form, updatedAt: serverTimestamp() };
      if (editData?.id) {
        await updateDoc(doc(db, 'anexos', editData.id), payload);
      } else {
        await addDoc(collection(db, 'anexos'), { ...payload, createdAt: serverTimestamp() });
      }
      onSaved?.(); onClose();
    } catch (e) { alert('Error: ' + e.message); }
    setSaving(false);
  };

  const contratoSel   = contratos?.find(c => c.id === form.contratoId);
  const trabajadorSel = trabajadores?.find(t => t.id === form.trabajadorId);

  return (
    <Modal isOpen={isOpen} onClose={onClose}
      title={editData ? 'Editar Anexo' : `Nuevo Anexo${nroAnexo ? ` N°${nroAnexo}` : ''}`}
      subtitle="Modificación contractual · Art. 11 Código del Trabajo"
      maxWidth="max-w-2xl">
      <div className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Trabajador" required>
            <select className={inp} value={form.trabajadorId} onChange={e => handleTrabajador(e.target.value)}>
              <option value="">Seleccionar trabajador…</option>
              {(trabajadores || []).sort((a, b) => a.apellidoPaterno?.localeCompare(b.apellidoPaterno)).map(t => (
                <option key={t.id} value={t.id}>{t.apellidoPaterno} {t.nombre}</option>
              ))}
            </select>
          </Field>
          <Field label="Contrato" required>
            <select className={inp} value={form.contratoId} onChange={e => set('contratoId', e.target.value)}>
              <option value="">Seleccionar contrato…</option>
              {(contratos || []).filter(c => c.trabajadorId === form.trabajadorId).map(c => (
                <option key={c.id} value={c.id}>{c.tipoContrato} — {c.empresa} ({c.estado})</option>
              ))}
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Tipo de anexo" required>
            <select className={inp} value={form.tipo} onChange={e => set('tipo', e.target.value)}>
              <option value="">Seleccionar tipo…</option>
              {TIPOS_ANEXO.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </Field>
          <Field label="Fecha del anexo" required>
            <input type="date" className={inp} value={form.fechaAnexo} onChange={e => set('fechaAnexo', e.target.value)} />
          </Field>
        </div>

        {form.tipo === 'aumento_sueldo' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Nuevo sueldo base ($)" required>
              <input type="number" className={inp} value={form.nuevoSueldo} onChange={e => set('nuevoSueldo', e.target.value)} />
            </Field>
            {contratoSel?.sueldoBase && form.nuevoSueldo && (
              <div className="flex items-end pb-2.5">
                <div className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2.5 w-full">
                  Variación: +${(parseInt(form.nuevoSueldo) - parseInt(contratoSel.sueldoBase)).toLocaleString('es-CL')}
                  {' '}(+{Math.round(((parseInt(form.nuevoSueldo) - parseInt(contratoSel.sueldoBase)) / parseInt(contratoSel.sueldoBase)) * 100)}%)
                </div>
              </div>
            )}
          </div>
        )}
        {form.tipo === 'cambio_cargo' && (
          <Field label="Nuevo cargo">
            <input className={inp} value={form.nuevoCargo} onChange={e => set('nuevoCargo', e.target.value)} placeholder="Nuevo cargo o función" />
          </Field>
        )}
        {form.tipo === 'cambio_jornada' && (
          <Field label="Nueva jornada">
            <select className={inp} value={form.nuevaJornada} onChange={e => set('nuevaJornada', e.target.value)}>
              <option value="">Seleccionar…</option>
              {JORNADAS.map(j => <option key={j}>{j}</option>)}
            </select>
          </Field>
        )}
        {form.tipo === 'cambio_empresa' && (
          <Field label="Nueva empresa">
            <select className={inp} value={form.nuevaEmpresa} onChange={e => set('nuevaEmpresa', e.target.value)}>
              <option value="">Seleccionar…</option>
              {EMPRESAS.map(e => <option key={e}>{e}</option>)}
            </select>
          </Field>
        )}
        {form.tipo === 'prorroga' && (
          <Field label="Nueva fecha de término">
            <input type="date" className={inp} value={form.nuevaFechaFin} onChange={e => set('nuevaFechaFin', e.target.value)} />
          </Field>
        )}

        <Field label="Descripción / detalle">
          <textarea className={inp} rows={3} value={form.descripcion}
            onChange={e => set('descripcion', e.target.value)}
            placeholder="Describe los cambios o condiciones del anexo…" />
        </Field>

        <Field label="Estado">
          <select className={inp} value={form.estado} onChange={e => set('estado', e.target.value)}>
            <option value="vigente">Vigente</option>
            <option value="anulado">Anulado</option>
          </select>
        </Field>

        <div className="flex justify-between items-center pt-2">
          {editData && trabajadorSel && contratoSel && (
            <button onClick={() => generarPDFAnexo(form, trabajadorSel, contratoSel)}
              className="flex items-center gap-1.5 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm rounded-xl transition-colors">
              📄 Vista previa PDF
            </button>
          )}
          <div className="flex gap-3 ml-auto">
            <CancelBtn onClose={onClose} />
            <SaveBtn saving={saving} onClick={handleSave} label={editData ? 'Actualizar anexo' : 'Guardar anexo'} />
          </div>
        </div>

        {/* Firma electrónica */}
        {editData?.id && trabajadorSel ? (
          <>
            <Divider label="Firma electrónica · Ley 19.799" />
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <button
                  onClick={async () => {
                    setGenPdf(true);
                    try {
                      const blob = await buildAnexoBlob(form, trabajadorSel, contratoSel);
                      setPdfBlob(blob);
                      const url = URL.createObjectURL(blob);
                      window.open(url, '_blank');
                    } catch(e) {
                      alert('Error generando PDF: ' + e.message);
                    }
                    setGenPdf(false);
                  }}
                  disabled={genPdf || !form.tipo}
                  className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors disabled:opacity-40">
                  {genPdf ? '…' : '📄'} {pdfBlob ? 'Regenerar PDF' : 'Generar PDF para firma'}
                </button>
                {pdfBlob && <span className="text-xs text-emerald-600 font-bold">✓ PDF listo</span>}
              </div>
              <PanelFirma
                docId={editData.id}
                coleccion="anexos"
                firmaData={form}
                pdfBlob={pdfBlob}
                nombreArchivo={`Anexo_${trabajadorSel?.apellidoPaterno || ''}_${form.fechaAnexo || ''}.pdf`}
                firmantes={trabajadorSel?.email ? [{
                  nombre: `${trabajadorSel.apellidoPaterno} ${trabajadorSel.nombre}`,
                  email:  trabajadorSel.email,
                  rut:    trabajadorSel.rut || '',
                }] : []}
                onUpdate={() => onSaved?.()}
              />
            </div>
          </>
        ) : !editData?.id && (
          <p className="text-[11px] text-slate-400 text-center bg-slate-50 rounded-xl px-3 py-2">
            Guarda el anexo primero para habilitar la firma electrónica
          </p>
        )}
      </div>
    </Modal>
  );
}

// ─── HistorialModal ───────────────────────────────────────────────────────────

function HistorialModal({ isOpen, onClose, trabajador, contratos, anexos, liquidaciones, finiquitos }) {
  const [tab, setTab] = useState('contratos');

  useEffect(() => { setTab('contratos'); }, [trabajador]);

  if (!trabajador || !isOpen) return null;

  const misContratos     = (contratos     || []).filter(c => c.trabajadorId === trabajador.id).sort((a, b) => new Date(b.fechaInicio || 0) - new Date(a.fechaInicio || 0));
  const misAnexos        = (anexos        || []).filter(a => a.trabajadorId === trabajador.id).sort((a, b) => new Date(b.fechaAnexo  || 0) - new Date(a.fechaAnexo  || 0));
  const misLiquidaciones = (liquidaciones || []).filter(l => l.trabajadorId === trabajador.id).sort((a, b) => `${b.anio}${b.mes}`.localeCompare(`${a.anio}${a.mes}`));
  const misFiniquitos    = (finiquitos    || []).filter(f => f.trabajadorId === trabajador.id);

  const contratoVigente = misContratos.find(c => c.estado === 'vigente');
  const { anios, meses } = contratoVigente
    ? calcularAntiguedad(contratoVigente.fechaInicio, new Date().toISOString().split('T')[0])
    : { anios: 0, meses: 0 };

  const fmt = n => `$${(n || 0).toLocaleString('es-CL')}`;

  const tipoBadge = {
    aumento_sueldo: 'bg-emerald-100 text-emerald-700', cambio_cargo: 'bg-blue-100 text-blue-700',
    cambio_jornada: 'bg-purple-100 text-purple-700',   prorroga: 'bg-amber-100 text-amber-700',
    cambio_empresa: 'bg-indigo-100 text-indigo-700',   otro: 'bg-slate-100 text-slate-600',
  };

  const TABS = [
    { id: 'contratos',    label: `Contratos (${misContratos.length})` },
    { id: 'anexos',       label: `Anexos (${misAnexos.length})` },
    { id: 'liquidaciones',label: `Liquidaciones (${misLiquidaciones.length})` },
    { id: 'finiquitos',   label: `Finiquitos (${misFiniquitos.length})` },
  ];

  return (
    <Modal isOpen={isOpen} onClose={onClose}
      title={`Historial — ${trabajador.nombre} ${trabajador.apellidoPaterno}`}
      subtitle={`RUT ${trabajador.rut} · ${anios}a ${meses}m de antigüedad`}
      maxWidth="max-w-3xl">
      <div className="space-y-4">

        <div className="grid grid-cols-4 gap-3">
          {[
            { label: 'Contratos',    value: misContratos.length,     color: 'text-indigo-600' },
            { label: 'Anexos',       value: misAnexos.length,        color: 'text-purple-600' },
            { label: 'Liquidaciones',value: misLiquidaciones.length, color: 'text-emerald-600' },
            { label: 'Finiquitos',   value: misFiniquitos.length,    color: 'text-rose-600' },
          ].map(({ label, value, color }) => (
            <div key={label} className="rounded-xl border border-slate-100 px-3 py-3 text-center bg-white shadow-sm">
              <p className={`text-2xl font-black ${color}`}>{value}</p>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">{label}</p>
            </div>
          ))}
        </div>

        <div className="flex border-b border-slate-100">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-4 py-2.5 text-xs font-bold transition-colors border-b-2 -mb-px ${
                tab === t.id ? 'border-violet-600 text-violet-700' : 'border-transparent text-slate-400 hover:text-slate-600'
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="min-h-[200px]">

          {tab === 'contratos' && (
            <div className="space-y-2">
              {misContratos.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-8">Sin contratos registrados</p>
              ) : misContratos.map(c => (
                <div key={c.id} className="rounded-xl border border-slate-100 px-4 py-3 hover:bg-slate-50/60 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${c.estado === 'vigente' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                        {c.estado}
                      </span>
                      <span className="text-sm font-bold text-slate-700">{c.tipoContrato}</span>
                      {c.cargo && <span className="text-sm text-slate-400">· {c.cargo}</span>}
                    </div>
                    <span className="text-xs font-bold text-slate-700">{fmt(c.sueldoBase)}</span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">{c.fechaInicio} — {c.fechaFin || 'Indefinido'} · {c.empresa}</p>
                </div>
              ))}
            </div>
          )}

          {tab === 'anexos' && (
            <div className="space-y-2">
              {misAnexos.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-8">Sin anexos registrados</p>
              ) : misAnexos.map((a, i) => {
                const tipoLabel = TIPOS_ANEXO.find(t => t.value === a.tipo)?.label || a.tipo;
                return (
                  <div key={a.id} className="rounded-xl border border-slate-100 px-4 py-3 hover:bg-slate-50/60 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-black text-slate-400">N°{misAnexos.length - i}</span>
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${tipoBadge[a.tipo] || 'bg-slate-100 text-slate-600'}`}>{tipoLabel}</span>
                      </div>
                      <span className="text-xs text-slate-400">{a.fechaAnexo}</span>
                    </div>
                    {a.descripcion  && <p className="text-xs text-slate-500 mt-1.5">{a.descripcion}</p>}
                    {a.nuevoSueldo  && <p className="text-xs font-bold text-emerald-600 mt-1">Nuevo sueldo: {fmt(a.nuevoSueldo)}</p>}
                    {a.nuevoCargo   && <p className="text-xs font-bold text-blue-600 mt-1">Nuevo cargo: {a.nuevoCargo}</p>}
                  </div>
                );
              })}
            </div>
          )}

          {tab === 'liquidaciones' && (
            <div className="space-y-2">
              {misLiquidaciones.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-8">Sin liquidaciones registradas</p>
              ) : misLiquidaciones.map(l => {
                const c    = misContratos.find(c => c.id === l.contratoId) || contratoVigente;
                const calc = c ? calcularLiquidacion({ ...c, ...l }) : null;
                return (
                  <div key={l.id} className="rounded-xl border border-slate-100 px-4 py-3 hover:bg-slate-50/60 transition-colors">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-slate-700">{labelPeriodo(l)}</span>
                      <div className="flex items-center gap-3">
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${l.estado === 'pagado' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                          {l.estado || 'pendiente'}
                        </span>
                        <span className="text-sm font-black text-emerald-600">{calc ? fmt(calc.liquido) : '—'}</span>
                      </div>
                    </div>
                    {calc && (
                      <p className="text-[11px] text-slate-400 mt-1">
                        Imponible: {fmt(calc.imponible)} · AFP: -{fmt(calc.afpM)} · Salud: -{fmt(calc.salM)}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {tab === 'finiquitos' && (
            <div className="space-y-2">
              {misFiniquitos.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-8">Sin finiquitos registrados</p>
              ) : misFiniquitos.map(f => {
                const contratoF = misContratos.find(c => c.id === f.contratoId);
                const calcF = f.fechaTermino && f.ultimaRemuneracion
                  ? calcularFiniquito(f, contratoF, trabajador) : null;
                const causalLabel = CAUSALES_TERMINO.find(c => c.codigo === f.causal)?.label || f.causal;
                return (
                  <div key={f.id} className="rounded-xl border border-rose-100 bg-rose-50/30 px-4 py-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-600">{causalLabel}</span>
                      <span className="text-sm font-black text-emerald-600">{calcF ? fmt(calcF.totalFiniquito) : '—'}</span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">
                      F. término: {f.fechaTermino} ·
                      <span className={`ml-1 font-bold ${f.estadoFirma === 'ratificado' ? 'text-emerald-600' : 'text-amber-600'}`}>
                        {f.estadoFirma || 'pendiente'}
                      </span>
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

// ─── AsistenciaModal ──────────────────────────────────────────────────────────

function AsistenciaModal({ isOpen, onClose, editData, trabajadores, contratos, onSaved }) {
  const hoy = new Date();
  const empty = {
    trabajadorId: '', contratoId: '',
    mes: String(hoy.getMonth() + 1).padStart(2, '0'),
    anio: String(hoy.getFullYear()),
    registros: {},
  };
  const [form,      setForm]      = useState(empty);
  const [saving,    setSaving]    = useState(false);
  const [diaActivo, setDiaActivo] = useState(null);
  const [formDia,   setFormDia]   = useState({ estado: 'trabajado', horasTrabajadas: '', observacion: '' });

  useEffect(() => {
    setForm(editData ? { ...empty, ...editData, registros: editData.registros || {} } : empty);
    setDiaActivo(null);
  }, [editData, isOpen]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleTrabajador = (tid) => {
    const contrato = contratos?.find(c => c.trabajadorId === tid && c.estado === 'vigente');
    setForm(f => ({ ...f, trabajadorId: tid, contratoId: contrato?.id || '' }));
  };

  const dias         = (form.mes && form.anio) ? diasDelMes(form.anio, form.mes) : [];
  const contratoSel  = contratos?.find(c => c.id === form.contratoId);
  const trabajadorSel= trabajadores?.find(t => t.id === form.trabajadorId);

  const handleDiaClick = (fecha) => {
    const reg = form.registros[fecha] || {};
    setFormDia({ estado: reg.estado || 'trabajado', horasTrabajadas: reg.horasTrabajadas || '', observacion: reg.observacion || '' });
    setDiaActivo(fecha);
  };

  const guardarDia = () => {
    setForm(f => ({ ...f, registros: { ...f.registros, [diaActivo]: { ...formDia } } }));
    setDiaActivo(null);
  };

  const handleSave = async () => {
    if (!form.trabajadorId || !form.mes || !form.anio) {
      alert('Selecciona trabajador, mes y año.'); return;
    }
    setSaving(true);
    try {
      const payload = { ...form, updatedAt: serverTimestamp() };
      if (editData?.id) {
        await updateDoc(doc(db, 'asistencia', editData.id), payload);
      } else {
        await addDoc(collection(db, 'asistencia'), { ...payload, createdAt: serverTimestamp() });
      }
      onSaved?.(); onClose();
    } catch (e) { alert('Error: ' + e.message); }
    setSaving(false);
  };

  // Stats del mes
  let trabajados = 0, ausentes = 0, totalHExtra = 0;
  dias.forEach(d => {
    const reg = form.registros[d.fecha] || {};
    const { extra } = analizarDia(reg, contratoSel?.jornada);
    if (reg.estado === 'trabajado') trabajados++;
    if (reg.estado === 'ausente')   ausentes++;
    totalHExtra += extra;
  });

  const DIAS_CORTO = ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá'];
  const estColor = {
    trabajado:  { bg: '#d1fae5', border: '#10b981', text: '#065f46' },
    ausente:    { bg: '#fee2e2', border: '#ef4444', text: '#991b1b' },
    feriado:    { bg: '#dbeafe', border: '#3b82f6', text: '#1e40af' },
    vacaciones: { bg: '#ede9fe', border: '#8b5cf6', text: '#5b21b6' },
    licencia:   { bg: '#fef3c7', border: '#f59e0b', text: '#92400e' },
    permiso:    { bg: '#f1f5f9', border: '#64748b', text: '#334155' },
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose}
      title={editData ? 'Editar Registro Asistencia' : 'Nuevo Registro Asistencia'}
      subtitle="Control de jornada · Art. 31 CT · Límite horas extra"
      maxWidth="max-w-3xl">
      <div className="space-y-5">

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Field label="Trabajador" required>
            <select className={inp} value={form.trabajadorId} onChange={e => handleTrabajador(e.target.value)}>
              <option value="">Seleccionar…</option>
              {(trabajadores || []).sort((a, b) => a.apellidoPaterno?.localeCompare(b.apellidoPaterno)).map(t => (
                <option key={t.id} value={t.id}>{t.apellidoPaterno} {t.nombre}</option>
              ))}
            </select>
          </Field>
          <Field label="Mes" required>
            <select className={inp} value={form.mes} onChange={e => set('mes', e.target.value)}>
              {MESES.map((m, i) => <option key={m} value={String(i + 1).padStart(2, '0')}>{m}</option>)}
            </select>
          </Field>
          <Field label="Año" required>
            <select className={inp} value={form.anio} onChange={e => set('anio', e.target.value)}>
              {[2023, 2024, 2025, 2026].map(y => <option key={y}>{y}</option>)}
            </select>
          </Field>
          <Field label="Contrato">
            <select className={inp} value={form.contratoId} onChange={e => set('contratoId', e.target.value)}>
              <option value="">Seleccionar…</option>
              {(contratos || []).filter(c => c.trabajadorId === form.trabajadorId).map(c => (
                <option key={c.id} value={c.id}>{c.tipoContrato} ({c.estado})</option>
              ))}
            </select>
          </Field>
        </div>

        {dias.length > 0 && (
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Días trabajados', value: trabajados,                color: 'text-emerald-600' },
              { label: 'Ausencias',       value: ausentes,                  color: ausentes > 0 ? 'text-red-500' : 'text-slate-400' },
              { label: 'Horas extra',     value: `${totalHExtra.toFixed(1)}h`, color: totalHExtra > 0 ? 'text-amber-600' : 'text-slate-400' },
            ].map(({ label, value, color }) => (
              <div key={label} className="rounded-xl border border-slate-100 px-3 py-2.5 text-center bg-white">
                <p className={`text-xl font-black ${color}`}>{value}</p>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{label}</p>
              </div>
            ))}
          </div>
        )}

        {dias.length > 0 && (
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
              Calendario · clic en un día para registrar
            </p>
            <div className="grid grid-cols-7 gap-1 mb-1">
              {DIAS_CORTO.map(d => (
                <div key={d} className="text-center text-[10px] font-black text-slate-400">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: dias[0].diaSemana }).map((_, i) => <div key={`off-${i}`} />)}
              {dias.map(d => {
                const reg    = form.registros[d.fecha] || {};
                const est    = reg.estado;
                const colors = estColor[est] || {};
                const { extra } = analizarDia(reg, contratoSel?.jornada);
                return (
                  <button key={d.fecha} onClick={() => handleDiaClick(d.fecha)}
                    className="rounded-lg p-1.5 text-center transition-all hover:scale-105 border"
                    style={{
                      background:   colors.bg     || (d.esFinSemana ? '#f8fafc' : '#fff'),
                      borderColor:  colors.border  || '#e2e8f0',
                      opacity: d.esFinSemana && !est ? 0.5 : 1,
                    }}>
                    <p className="text-[11px] font-black" style={{ color: colors.text || '#64748b' }}>{d.dia}</p>
                    {extra > 0 && <p className="text-[9px] font-bold text-amber-600">+{extra}h</p>}
                    {est && <p className="text-[8px] font-bold truncate" style={{ color: colors.text }}>{est.slice(0, 3)}</p>}
                  </button>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-3 mt-3">
              {Object.entries(ESTADOS_DIA).map(([k, v]) => (
                <div key={k} className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-sm border" style={{ background: v.bg, borderColor: v.color }} />
                  <span className="text-[10px] text-slate-500 font-medium">{v.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {diaActivo && (
          <div className="rounded-xl border-2 border-violet-200 bg-violet-50/50 p-4 space-y-3">
            <p className="text-xs font-black text-violet-700 uppercase tracking-widest">Registrar — {diaActivo}</p>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Estado">
                <select className={inp} value={formDia.estado} onChange={e => setFormDia(f => ({ ...f, estado: e.target.value }))}>
                  {Object.entries(ESTADOS_DIA).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </Field>
              <Field label="Horas trabajadas">
                <input type="number" step="0.5" className={inp} value={formDia.horasTrabajadas}
                  onChange={e => setFormDia(f => ({ ...f, horasTrabajadas: e.target.value }))}
                  placeholder={contratoSel ? String(Math.round(horasOrdinariasSemanales(contratoSel.jornada) / 5)) : '9'} />
              </Field>
              <Field label="Observación">
                <input className={inp} value={formDia.observacion}
                  onChange={e => setFormDia(f => ({ ...f, observacion: e.target.value }))} placeholder="Opcional" />
              </Field>
            </div>
            <div className="flex gap-2">
              <button onClick={guardarDia}
                className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white font-bold text-xs rounded-xl transition-colors">
                ✓ Confirmar
              </button>
              <button onClick={() => setDiaActivo(null)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs rounded-xl transition-colors">
                Cancelar
              </button>
              {form.registros[diaActivo] && (
                <button onClick={() => {
                  setForm(f => { const r = { ...f.registros }; delete r[diaActivo]; return { ...f, registros: r }; });
                  setDiaActivo(null);
                }} className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 font-bold text-xs rounded-xl transition-colors">
                  Borrar día
                </button>
              )}
            </div>
          </div>
        )}

        <div className="flex justify-between items-center pt-2">
          {editData && trabajadorSel && (
            <button onClick={() => exportarAsistenciaCSV(trabajadorSel, contratoSel, form.registros || {}, form.mes, form.anio)}
              className="flex items-center gap-1.5 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm rounded-xl transition-colors">
              📊 Exportar CSV
            </button>
          )}
          <div className="flex gap-3 ml-auto">
            <CancelBtn onClose={onClose} />
            <SaveBtn saving={saving} onClick={handleSave} label={editData ? 'Actualizar registro' : 'Guardar registro'} />
          </div>
        </div>
      </div>
    </Modal>
  );
}

// ─── Exports ──────────────────────────────────────────────────────────────────

export {
  TrabajadorModal, FichaTrabajador,
  ContratoModal, LiquidacionModal, FiniquitoModal,
  AnexoModal, HistorialModal, AsistenciaModal,
};
