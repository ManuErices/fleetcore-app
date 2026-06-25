import { useState, useEffect, useCallback, useRef } from 'react';
import { db, storage } from '../../lib/firebase';
import { useEmpresa } from "../../lib/useEmpresa";
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, orderBy, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import * as Shared from './shared';
import * as Calc from './calculo';
import * as PDFs from './pdfs';

const {
  inp, AREAS, AFPS, ISAPRES, TIPOS_CONTRATO, JORNADAS,
  CAUSALES_TERMINO, TIPOS_PERIODO, MESES, IMM_2026, IMM_2024,
  TASAS, TASAS_AFP, TIPOS_ANEXO, ESTADOS_DIA, UTM_DEFAULT, COLORES_AREA,
  REGIONES_COMUNAS, REGIONES,
} = Shared;

const {
  calcularLiquidacion, calcularLiquidacionConIUT, calcularFiniquito,
  calcularAntiguedad, labelPeriodo, diasDelMes, analizarDia,
  alertaVencimiento, exportarAsistenciaCSV, horasOrdinariasSemanales,
} = Calc;

const {
  generarPDFContrato, generarPDFLiquidacion, generarPDFFiniquito,
  generarPDFAnexo, generarCertificadoAnual,
} = PDFs;

// ─── Helpers UI ───────────────────────────────────────────────────────────────

const formatCLP = (val) => {
  if (val === undefined || val === null || val === '') return '';
  const num = parseInt(String(val).replace(/\D/g, ''), 10);
  if (isNaN(num)) return '';
  return num.toLocaleString('es-CL');
};

const parseCLP = (val) => {
  return String(val).replace(/\D/g, '');
};

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
  const { empresaId, empresa, subEmpresasNames: EMPRESAS = [] } = useEmpresa();
  const empty = {
    nombre: '', apellidoPaterno: '', apellidoMaterno: '',
    rut: '', fechaNacimiento: '', nacionalidad: 'Chilena',
    direccion: '', comuna: '', region: '',
    codigoPais: '+56', telefono: '', email: '',
    empresa: empresa?.nombre || '', area: '', cargo: '', fechaIngreso: '',
    afp: '', prevision: 'FONASA', isapre: '',
    estado: 'activo', observaciones: '',
    // Campos WorkFleet
    tipo: 'OPERADOR', esSurtidor: false, projectId: null,
  };
  const [form,    setForm]    = useState(empty);
  const [saving,  setSaving]  = useState(false);
  const [cargos,  setCargos]  = useState([]);  // desde bandas_salariales
  const [isCustomCargo, setIsCustomCargo] = useState(false);

  // Cargar cargos desde Firestore al abrir
  useEffect(() => {
    if (!isOpen) return;
    getDocs(collection(db, 'empresas', empresaId, 'bandas_salariales'))
      .then(snap => {
        const lista = [...new Set(snap.docs.map(d => d.data().cargo).filter(Boolean))].sort();
        setCargos(lista);
      })
      .catch(() => setCargos([]));
  }, [isOpen, empresaId]);

  // 1. Inicializar el formulario solo al abrir/cerrar o cambiar editData
  useEffect(() => {
    if (isOpen) {
      setForm(editData ? { ...empty, ...editData } : { ...empty, empresa: empresa?.nombre || '' });
    }
  }, [editData, isOpen]);

  // 2. Detectar si el cargo es personalizado (solo al abrir o cuando cargan los cargos de la DB)
  useEffect(() => {
    if (isOpen && editData) {
      const isCustom = editData.cargo && !cargos.includes(editData.cargo);
      setIsCustomCargo(!!isCustom);
    } else if (isOpen) {
      setIsCustomCargo(false);
    }
  }, [editData, cargos, isOpen]);

  // 3. Cargar la empresa por defecto si se obtiene el nombre después de abrir
  useEffect(() => {
    if (isOpen && !editData && empresa?.nombre && !form.empresa) {
      setForm(f => ({ ...f, empresa: empresa.nombre }));
    }
  }, [empresa, isOpen, editData]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleAddCustomCargo = async (customCargo) => {
    const trimmed = (customCargo || '').trim();
    if (!trimmed) return;
    
    if (!cargos.includes(trimmed)) {
      // Agregar localmente
      setCargos(prev => [...prev, trimmed].sort());
      
      // Guardar en Firestore en segundo plano
      try {
        await addDoc(collection(db, 'empresas', empresaId, 'bandas_salariales'), {
          nivel: 'N/A',
          cargo: trimmed,
          area: form.area || '',
          sueldoMin: 0,
          sueldoMax: 0,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (e) {
        console.error('Error guardando cargo personalizado:', e);
      }
    }
    
    // Asignar al formulario y desactivar el modo personalizado para mostrar el dropdown
    set('cargo', trimmed);
    setIsCustomCargo(false);
  };

  // ── Helpers de validación/formato ──
  function soloLetras(v) {
    return v.replace(/[^a-záéíóúüñA-ZÁÉÍÓÚÜÑ\s'-]/g, '');
  }

  function formatRut(v) {
    // Permite solo dígitos y k/K, aplica formato xx.xxx.xxx-x
    const limpio = v.replace(/[^0-9kK]/g, '').toUpperCase();
    if (limpio.length <= 1) return limpio;
    const cuerpo = limpio.slice(0, -1);
    const dv     = limpio.slice(-1);
    const miles  = cuerpo.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return `${miles}-${dv}`;
  }

  function soloTelefono(v) {
    return v.replace(/[^0-9]/g, '').slice(0, 11);
  }

  const comunasDeRegion = form.region ? (REGIONES_COMUNAS[form.region] || []) : [];

  const handleSave = async () => {
    if (!form.nombre || !form.apellidoPaterno || !form.rut) {
      alert('Nombre, apellido paterno y RUT son obligatorios.'); return;
    }
    setSaving(true);
    try {
      const telefonoCompleto = form.telefono ? `${form.codigoPais}${form.telefono}` : '';
      const payload = {
        ...form,
        telefono:    telefonoCompleto,
        // Campos compatibles con WorkFleet/Payroll
        tipo:        form.tipo        || 'OPERADOR',
        esSurtidor:  form.esSurtidor  || false,
        projectId:   form.projectId   || null,
        updatedAt:   serverTimestamp(),
      };

      // Si se ingresó un cargo personalizado que no existe en el sistema, crearlo en la DB
      if (form.cargo && form.cargo.trim() && !cargos.includes(form.cargo.trim())) {
        await addDoc(collection(db, 'empresas', empresaId, 'bandas_salariales'), {
          nivel: 'N/A',
          cargo: form.cargo.trim(),
          area: form.area || '',
          sueldoMin: 0,
          sueldoMax: 0,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      if (editData?.id) {
        await updateDoc(doc(db, 'empresas', empresaId, 'trabajadores', editData.id), payload);
        
        // Propagate state to linked user accounts
        const stateToSync = form.estado || 'activo';
        if (form.portalUid) {
          try {
            await updateDoc(doc(db, 'users', form.portalUid), { estado: stateToSync, updatedAt: serverTimestamp() });
            await updateDoc(doc(db, 'empresas', empresaId, 'users', form.portalUid), { estado: stateToSync, updatedAt: serverTimestamp() });
          } catch (e) {
            console.warn('Could not sync user status in users subcollection:', e.message);
          }
        }
        if (form.email) {
          const u = form.email.split('@')[0].toLowerCase().trim();
          try {
            await updateDoc(doc(db, 'usuarios', u), { estado: stateToSync, updatedAt: serverTimestamp() });
          } catch (e) {
            console.warn('Could not sync user status in documents usuarios collection:', e.message);
          }
        }
      } else {
        await addDoc(collection(db, 'empresas', empresaId, 'trabajadores'), { ...payload, createdAt: serverTimestamp() });
      }
      onSaved?.(); onClose();
    } catch (e) { alert('Error: ' + e.message); }
    setSaving(false);
  };

  // Códigos de país más comunes
  const CODIGOS_PAIS = ['+56', '+54', '+55', '+51', '+57', '+58', '+591', '+593', '+595', '+598', '+1', '+34', '+52'];

  return (
    <Modal isOpen={isOpen} onClose={onClose}
      title={editData ? 'Editar Trabajador' : 'Nuevo Trabajador'}
      subtitle="Registro de personal · Código del Trabajo"
      maxWidth="max-w-3xl">
      <div className="space-y-5">

        <Divider label="Datos personales" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field label="Nombre" required>
            <input className={inp}
              value={form.nombre}
              onChange={e => set('nombre', soloLetras(e.target.value))}
              placeholder="Nombre(s)" />
          </Field>
          <Field label="Apellido paterno" required>
            <input className={inp}
              value={form.apellidoPaterno}
              onChange={e => set('apellidoPaterno', soloLetras(e.target.value))}
              placeholder="Apellido paterno" />
          </Field>
          <Field label="Apellido materno">
            <input className={inp}
              value={form.apellidoMaterno}
              onChange={e => set('apellidoMaterno', soloLetras(e.target.value))}
              placeholder="Apellido materno" />
          </Field>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field label="RUT" required>
            <input className={inp}
              value={form.rut}
              onChange={e => set('rut', formatRut(e.target.value))}
              placeholder="12.345.678-9"
              maxLength={12} />
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
          <Field label="Región">
            <select className={inp} value={form.region} onChange={e => { set('region', e.target.value); set('comuna', ''); }}>
              <option value="">Seleccionar región…</option>
              {REGIONES.map(r => <option key={r}>{r}</option>)}
            </select>
          </Field>
          <Field label="Comuna">
            <select className={inp} value={form.comuna} onChange={e => set('comuna', e.target.value)} disabled={!form.region}>
              <option value="">{form.region ? 'Seleccionar comuna…' : 'Primero elige región'}</option>
              {comunasDeRegion.map(c => <option key={c}>{c}</option>)}
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Teléfono">
            <div className="flex" style={{border:'2px solid #e2e8f0',borderRadius:8,overflow:'hidden',background:'#fff',transition:'border-color 0.15s'}}
              onFocusCapture={e=>e.currentTarget.style.borderColor='#a78bfa'}
              onBlurCapture={e=>e.currentTarget.style.borderColor='#e2e8f0'}>
              <select
                style={{width:72,flexShrink:0,border:'none',outline:'none',background:'#f8f8fc',fontSize:13,fontWeight:600,color:'#475569',padding:'0 4px 0 8px',borderRight:'1px solid #e2e8f0',cursor:'pointer'}}
                value={form.codigoPais || '+56'}
                onChange={e => set('codigoPais', e.target.value)}>
                {CODIGOS_PAIS.map(c => <option key={c}>{c}</option>)}
              </select>
              <input
                style={{flex:1,border:'none',outline:'none',padding:'8px 10px',fontSize:14,background:'#fff',minWidth:0}}
                value={form.telefono}
                onChange={e => set('telefono', soloTelefono(e.target.value))}
                placeholder="9 1234 5678"
                inputMode="numeric" />
            </div>
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
            <select className={inp}
              value={isCustomCargo ? '__otro__' : form.cargo}
              onChange={e => {
                if (e.target.value === '__otro__') {
                  setIsCustomCargo(true);
                  set('cargo', '');
                } else {
                  setIsCustomCargo(false);
                  set('cargo', e.target.value);
                }
              }}>
              <option value="">Seleccionar cargo…</option>
              {cargos.map(c => <option key={c}>{c}</option>)}
              <option value="__otro__">Otro (escribir)</option>
            </select>
            {isCustomCargo && (
              <div className="flex gap-2 mt-1.5">
                <input className={inp + ' flex-1'} placeholder="Escribe el cargo"
                  value={form.cargo}
                  onChange={e => set('cargo', e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddCustomCargo(form.cargo);
                    }
                  }}
                  autoFocus />
                <button type="button"
                  onClick={() => handleAddCustomCargo(form.cargo)}
                  className="px-3 py-2 bg-purple-600 text-white font-bold rounded-xl text-xs hover:bg-purple-700 transition-colors shadow-sm flex items-center justify-center">
                  Agregar
                </button>
              </div>
            )}
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
            <select className={inp} value={form.prevision} onChange={e => { set('prevision', e.target.value); if (e.target.value !== 'Isapre') { set('isapre', ''); set('planIsapre', ''); } }}>
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
        {form.prevision === 'Isapre' && (
          <Field label="Plan de Isapre">
            <input className={inp} value={form.planIsapre || ''}
              onChange={e => set('planIsapre', e.target.value)}
              placeholder="Ej: Plan Familia 3 UF, Plan Libre Elección…" />
          </Field>
        )}

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

function FichaTrabajador({ trabajador, onEdit, onClose, onVerPerfil = null }) {
  const { empresaId } = useEmpresa();
  const [contratos,     setContratos]     = useState([]);
  const [liquidaciones, setLiquidaciones] = useState([]);
  const [anexos,        setAnexos]        = useState([]);
  const [loading,       setLoading]       = useState(false);

  useEffect(() => {
    if (!empresaId) return;
    if (!trabajador) return;
    setLoading(true);
    Promise.all([
      getDocs(query(collection(db, 'empresas', empresaId, 'contratos'),      orderBy('createdAt', 'desc'))),
      getDocs(query(collection(db, 'empresas', empresaId, 'remuneraciones'), orderBy('createdAt', 'desc'))),
      getDocs(query(collection(db, 'empresas', empresaId, 'anexos'),         orderBy('createdAt', 'desc'))),
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

        <div className="px-6 py-4 border-t border-slate-100 flex flex-col gap-2 flex-shrink-0 bg-slate-50/60">
          {onVerPerfil && (
            <button onClick={() => { onClose(); onVerPerfil(trabajador); }}
              className="w-full py-2.5 text-sm font-bold rounded-xl transition-all active:scale-95 flex items-center justify-center gap-2"
              style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)', boxShadow: '0 4px 12px rgba(124,58,237,0.25)', color: '#fff' }}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              Ver perfil completo
            </button>
          )}
          <div className="flex gap-2">
            <button onClick={onEdit}
              className="flex-1 py-2.5 text-slate-700 font-bold text-sm rounded-xl transition-all active:scale-95 bg-slate-200 hover:bg-slate-300">
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
    </div>
  );
}

// ─── ContratoModal ────────────────────────────────────────────────────────────

function ContratoModal({ isOpen, onClose, editData, trabajadores, onSaved }) {
  const { empresaId, empresa, subEmpresasNames: EMPRESAS = [] } = useEmpresa();
  const empty = {
    trabajadorId: '', tipoContrato: 'Indefinido', fechaInicio: '', fechaFin: '',
    cargo: '', jornada: 'Completa (45 hrs)', empresa: empresa?.nombre || '', sueldoBase: '',
    bonoColacion: '', bonoMovilizacion: '', estado: 'vigente', observaciones: '',
    // Jornada personalizada (cuando jornada === 'Otro')
    jornadaHorasSemanales: '', jornadaHoraEntrada: '', jornadaHoraSalida: '',
    jornadaDias: [], jornadaDescripcion: '',
  };
  const [form, setForm]     = useState(empty);
  const [saving, setSaving] = useState(false);

  // 1. Inicializar formulario al abrir o cambiar editData
  useEffect(() => {
    if (isOpen) {
      setForm(editData ? { ...empty, ...editData } : { ...empty, empresa: empresa?.nombre || '' });
    }
  }, [editData, isOpen]);

  // 2. Cargar empresa por defecto si se obtiene después de abrir
  useEffect(() => {
    if (isOpen && !editData && empresa?.nombre && !form.empresa) {
      setForm(f => ({ ...f, empresa: empresa.nombre }));
    }
  }, [empresa, isOpen, editData]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // Al seleccionar trabajador, pre-rellenar datos desde su ficha
  const handleTrabajador = (tid) => {
    const t = (trabajadores || []).find(w => w.id === tid);
    setForm(f => ({
      ...f,
      trabajadorId: tid,
      cargo:   t?.cargo   || f.cargo,
      empresa: t?.empresa || f.empresa,
    }));
  };

  const handleSave = async () => {
    if (!form.trabajadorId || !form.fechaInicio || !form.sueldoBase) {
      alert('Trabajador, fecha de inicio y sueldo base son obligatorios.'); return;
    }
    setSaving(true);
    try {
      const payload = { ...form, updatedAt: serverTimestamp() };
      if (editData?.id) {
        await updateDoc(doc(db, 'empresas', empresaId, 'contratos', editData.id), payload);
      } else {
        await addDoc(collection(db, 'empresas', empresaId, 'contratos'), { ...payload, createdAt: serverTimestamp() });
      }
      onSaved?.(); onClose();
    } catch (e) { alert('Error: ' + e.message); }
    setSaving(false);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose}
      title={editData ? 'Editar Contrato' : 'Nuevo Contrato'}
      subtitle="Art. 10 Código del Trabajo · Cláusulas mínimas"
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
          <Field label={`Fecha de término ${(form.tipoContrato || '').toLowerCase().includes('indefinido') ? '(no aplica)' : ''}`}>
            <input type="date" className={inp} value={form.fechaFin}
              disabled={(form.tipoContrato || '').toLowerCase().includes('indefinido')}
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

        {/* Horario de colación */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Horario de colación">
            <input className={inp} value={form.horarioColacion || ''}
              onChange={e => set('horarioColacion', e.target.value)}
              placeholder="Ej: 13:00 a 14:00 hrs" />
          </Field>
          <Field label="Lugar de trabajo">
            <input className={inp} value={form.lugarTrabajo || ''}
              onChange={e => set('lugarTrabajo', e.target.value)}
              placeholder="Ej: Santiago, Faena Los Andes…" />
          </Field>
        </div>

        {/* Campos adicionales cuando jornada es "Otro" */}
        {form.jornada === 'Otro' && (
          <div className="rounded-xl border border-violet-200 bg-violet-50/40 p-4 space-y-3">
            <p className="text-[11px] font-black text-violet-600 uppercase tracking-widest">Detalle de jornada especial (Art. 22 CT)</p>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Horas semanales">
                <input type="number" className={inp} value={form.jornadaHorasSemanales}
                  onChange={e => set('jornadaHorasSemanales', e.target.value)}
                  placeholder="Ej: 36" min="1" max="45" />
              </Field>
              <Field label="Hora entrada">
                <input type="time" className={inp} value={form.jornadaHoraEntrada}
                  onChange={e => set('jornadaHoraEntrada', e.target.value)} />
              </Field>
              <Field label="Hora salida">
                <input type="time" className={inp} value={form.jornadaHoraSalida}
                  onChange={e => set('jornadaHoraSalida', e.target.value)} />
              </Field>
            </div>
            <div>
              <label className="block text-[11px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Días de trabajo</label>
              <div className="flex gap-2 flex-wrap">
                {['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'].map(dia => (
                  <label key={dia} className="flex items-center gap-1.5 cursor-pointer">
                    <input type="checkbox"
                      checked={(form.jornadaDias || []).includes(dia)}
                      onChange={e => {
                        const dias = form.jornadaDias || [];
                        set('jornadaDias', e.target.checked ? [...dias, dia] : dias.filter(d => d !== dia));
                      }}
                      className="rounded" />
                    <span className="text-xs font-bold text-slate-600">{dia.slice(0,3)}</span>
                  </label>
                ))}
              </div>
            </div>
            <Field label="Descripción adicional (opcional)">
              <input className={inp} value={form.jornadaDescripcion}
                onChange={e => set('jornadaDescripcion', e.target.value)}
                placeholder="Ej: Turno rotativo, jornada excepcional Art. 27 CT…" />
            </Field>
          </div>
        )}
        <Divider label="Remuneración base (Art. 42 CT)" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field label="Sueldo base ($)" required>
            <input type="text" className={inp} value={formatCLP(form.sueldoBase)} onChange={e => set('sueldoBase', parseCLP(e.target.value))} placeholder="Ej: 800.000" />
          </Field>
          <Field label="Bono colación ($)">
            <input type="text" className={inp} value={formatCLP(form.bonoColacion)} onChange={e => set('bonoColacion', parseCLP(e.target.value))} placeholder="No imponible" />
          </Field>
          <Field label="Bono movilización ($)">
            <input type="text" className={inp} value={formatCLP(form.bonoMovilizacion)} onChange={e => set('bonoMovilizacion', parseCLP(e.target.value))} placeholder="No imponible" />
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
  const { empresaId } = useEmpresa();
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
        await updateDoc(doc(db, 'empresas', empresaId, 'remuneraciones', editData.id), payload);
      } else {
        await addDoc(collection(db, 'empresas', empresaId, 'remuneraciones'), { ...payload, createdAt: serverTimestamp() });
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
              <option value="borrador">Borrador</option>
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
            <input type="text" className={inp} value={formatCLP(form.sueldoBase)} onChange={e => set('sueldoBase', parseCLP(e.target.value))} />
          </Field>
          <Field label="Bono producción ($)">
            <input type="text" className={inp} value={formatCLP(form.bonoProduccion)} onChange={e => set('bonoProduccion', parseCLP(e.target.value))} />
          </Field>
          <Field label="Otros imponibles ($)">
            <input type="text" className={inp} value={formatCLP(form.otrosImponibles)} onChange={e => set('otrosImponibles', parseCLP(e.target.value))} />
          </Field>
          <Field label="Horas extra">
            <input type="number" className={inp} value={form.horasExtra} onChange={e => set('horasExtra', e.target.value)} />
          </Field>
          <Field label="Valor hora extra ($)">
            <input type="text" className={inp} value={formatCLP(form.valorHoraExtra)} onChange={e => set('valorHoraExtra', parseCLP(e.target.value))} />
          </Field>
        </div>

        <Divider label="Haberes no imponibles" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Field label="Colación ($)">
            <input type="text" className={inp} value={formatCLP(form.bonoColacion)} onChange={e => set('bonoColacion', parseCLP(e.target.value))} />
          </Field>
          <Field label="Movilización ($)">
            <input type="text" className={inp} value={formatCLP(form.bonoMovilizacion)} onChange={e => set('bonoMovilizacion', parseCLP(e.target.value))} />
          </Field>
          <Field label="Viáticos ($)">
            <input type="text" className={inp} value={formatCLP(form.viaticos)} onChange={e => set('viaticos', parseCLP(e.target.value))} />
          </Field>
          <Field label="Otros no imp. ($)">
            <input type="text" className={inp} value={formatCLP(form.otrosNoImponibles)} onChange={e => set('otrosNoImponibles', parseCLP(e.target.value))} />
          </Field>
        </div>

        <Divider label="Descuentos adicionales" />
        <div className="grid grid-cols-2 gap-4">
          <Field label="Descuento adicional ($)">
            <input type="text" className={inp} value={formatCLP(form.descuentoAdicional)} onChange={e => set('descuentoAdicional', parseCLP(e.target.value))} />
          </Field>
          <Field label="Glosa descuento">
            <input className={inp} value={form.glosaDescuento || ''} onChange={e => set('glosaDescuento', e.target.value)} placeholder="Ej: Préstamo, uniforme, multa…" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Anticipo ($)">
            <input type="text" className={inp} value={formatCLP(form.anticipo)} onChange={e => set('anticipo', parseCLP(e.target.value))} />
          </Field>
          <Field label="Glosa anticipo">
            <input className={inp} value={form.glosaAnticipo || ''} onChange={e => set('glosaAnticipo', e.target.value)} placeholder="Ej: Anticipo quincena…" />
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
  const { empresaId } = useEmpresa();
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

  // Al cambiar causal 159-4 (vencimiento plazo), auto-completar fecha del contrato
  const handleCausal = (causal) => {
    setForm(f => {
      const contratoActual = contratos?.find(c => c.id === f.contratoId);
      const fechaAuto = causal === '159-4' && contratoActual?.fechaFin
        ? contratoActual.fechaFin : f.fechaTermino;
      return { ...f, causal, fechaTermino: fechaAuto };
    });
  };
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
        await updateDoc(doc(db, 'empresas', empresaId, 'finiquitos', editData.id), payload);
      } else {
        await addDoc(collection(db, 'empresas', empresaId, 'finiquitos'), { ...payload, createdAt: serverTimestamp() });
      }

      // Automatically update worker state to finiquitado
      await updateDoc(doc(db, 'empresas', empresaId, 'trabajadores', form.trabajadorId), {
        estado: 'finiquitado',
        updatedAt: serverTimestamp()
      });

      // Propagate state to linked user accounts
      if (trabajadorSel?.portalUid) {
        try {
          await updateDoc(doc(db, 'users', trabajadorSel.portalUid), { estado: 'finiquitado', updatedAt: serverTimestamp() });
          await updateDoc(doc(db, 'empresas', empresaId, 'users', trabajadorSel.portalUid), { estado: 'finiquitado', updatedAt: serverTimestamp() });
        } catch (e) {
          console.warn('Could not sync user status in users subcollection:', e.message);
        }
      }
      const emailStr = trabajadorSel?.email || trabajadorSel?.portalEmail || '';
      if (emailStr) {
        const u = emailStr.split('@')[0].toLowerCase().trim();
        try {
          await updateDoc(doc(db, 'usuarios', u), { estado: 'finiquitado', updatedAt: serverTimestamp() });
        } catch (e) {
          console.warn('Could not sync user status in documents usuarios collection:', e.message);
        }
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
            <select className={inp} value={form.causal} onChange={e => handleCausal(e.target.value)}>
              <option value="">Seleccionar causal…</option>
              {CAUSALES_TERMINO.map(c => <option key={c.codigo} value={c.codigo}>{c.label}</option>)}
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Fecha de término" required>
            <input type="date" className={inp} value={form.fechaTermino} onChange={e => set('fechaTermino', e.target.value)} />
            {form.causal === '159-4' && contratoSel?.fechaFin && form.fechaTermino === contratoSel.fechaFin && (
              <p className="text-[10px] text-violet-600 mt-1">⚡ Auto-completada desde la fecha de vencimiento del contrato</p>
            )}
          </Field>
          <Field label="Última remuneración ($)" required>
            <input type="text" className={inp} value={formatCLP(form.ultimaRemuneracion)} onChange={e => set('ultimaRemuneracion', parseCLP(e.target.value))} />
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
            <input type="text" className={inp} value={formatCLP(form.remuneracionesPendientes)} onChange={e => set('remuneracionesPendientes', parseCLP(e.target.value))} />
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
            <input type="text" className={inp} value={formatCLP(form.anticipoPendiente)} onChange={e => set('anticipoPendiente', parseCLP(e.target.value))} />
          </Field>
          <Field label="Otros descuentos ($)">
            <input type="text" className={inp} value={formatCLP(form.otrosDescuentos)} onChange={e => set('otrosDescuentos', parseCLP(e.target.value))} />
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

// ─── SubirDocumentoAnexo ──────────────────────────────────────────────────────
function SubirDocumentoAnexo({ empresaId, trabajadorId, urlActual, nombreActual, onChange }) {
  const [progreso,   setProgreso]   = useState(null); // 0-100 mientras sube
  const [error,      setError]      = useState('');
  const inputRef = useRef(null);

  const TIPOS_PERMITIDOS = ['application/pdf','image/png','image/jpeg','image/jpg',
    'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
  const MAX_MB = 10;

  const handleArchivo = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');

    if (!TIPOS_PERMITIDOS.includes(file.type)) {
      setError('Solo se permiten PDF, Word o imágenes JPG/PNG.'); return;
    }
    if (file.size > MAX_MB * 1024 * 1024) {
      setError(`El archivo supera los ${MAX_MB} MB.`); return;
    }
    if (!empresaId || !trabajadorId) {
      setError('Selecciona primero un trabajador.'); return;
    }

    const ruta = `empresas/${empresaId}/anexos/${trabajadorId}/${Date.now()}_${file.name}`;
    const storageRef = ref(storage, ruta);
    const task = uploadBytesResumable(storageRef, file);

    setProgreso(0);
    task.on('state_changed',
      snap => setProgreso(Math.round(snap.bytesTransferred / snap.totalBytes * 100)),
      err  => { setError('Error al subir: ' + err.message); setProgreso(null); },
      async () => {
        const url = await getDownloadURL(task.snapshot.ref);
        onChange(url, file.name);
        setProgreso(null);
      }
    );
  };

  const handleEliminar = () => {
    onChange('', '');
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div className="space-y-2">
      <label className="block text-[11px] font-black text-slate-500 uppercase tracking-widest">
        Documento adjunto (PDF, Word, imagen — máx. {MAX_MB} MB)
      </label>

      {/* Archivo ya subido */}
      {urlActual ? (
        <div className="flex items-center gap-3 bg-violet-50 border border-violet-200 rounded-xl px-4 py-3">
          <svg className="w-8 h-8 text-violet-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
          </svg>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-violet-800 truncate">{nombreActual || 'Documento adjunto'}</p>
            <a href={urlActual} target="_blank" rel="noreferrer"
              className="text-xs text-violet-500 hover:text-violet-700 font-semibold">
              Ver documento →
            </a>
          </div>
          <button onClick={handleEliminar}
            className="w-7 h-7 rounded-lg bg-red-100 hover:bg-red-200 flex items-center justify-center text-red-500 transition-colors flex-shrink-0"
            title="Quitar documento">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      ) : (
        /* Zona de subida */
        <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-slate-300 hover:border-violet-400 rounded-xl px-4 py-6 cursor-pointer transition-colors bg-white hover:bg-violet-50/30">
          <svg className="w-8 h-8 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
          </svg>
          <div className="text-center">
            <p className="text-sm font-bold text-slate-500">Haz clic para subir</p>
            <p className="text-xs text-slate-400 mt-0.5">PDF, Word, JPG o PNG</p>
          </div>
          <input ref={inputRef} type="file" className="hidden"
            accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
            onChange={handleArchivo} />
        </label>
      )}

      {/* Barra de progreso */}
      {progreso !== null && (
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-slate-500">
            <span>Subiendo…</span><span>{progreso}%</span>
          </div>
          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full bg-violet-500 rounded-full transition-all"
              style={{ width: `${progreso}%` }} />
          </div>
        </div>
      )}

      {error && <p className="text-xs text-red-600 font-bold">{error}</p>}
    </div>
  );
}

// ─── AnexoModal ───────────────────────────────────────────────────────────────

function AnexoModal({ isOpen, onClose, editData, contratos, trabajadores, nroAnexo, onSaved }) {
  const { empresaId } = useEmpresa();
  const empty = {
    trabajadorId: '', contratoId: '', tipo: '',
    fechaAnexo: new Date().toISOString().split('T')[0],
    descripcion: '',
    // Aumento sueldo base
    sueldoBase: '',
    // Aumento haberes (sueldo + no imponibles)
    bonoColacion: '', bonoMovilizacion: '', viaticos: '',
    // Aumento general
    nuevoSueldo: '', bonoProduccion: '',
    // Cargo
    nuevoCargo: '', centroCosto: '', funciones: '',
    // Jornada
    jornada: '', jornadaHorasSemanales: '', jornadaHoraEntrada: '',
    jornadaHoraSalida: '', jornadaDias: [], jornadaDescripcion: '',
    // Lugar
    lugarTrabajo: '',
    // Empresa
    nuevaEmpresa: '',
    // Prórroga
    fechaFin: '',
    // Otros bonos
    bonoColacionOtros: '', bonoMovilizacionOtros: '', viaticosOtros: '',
    horasExtra: '', valorHoraExtra: '',
    // Otro (con documento)
    otroDetalle: '', urlDocumento: '', nombreDocumento: '',
    estado: 'vigente',
  };
  const [form,   setForm]   = useState(empty);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm(editData ? { ...empty, ...editData } : empty);
  }, [editData, isOpen]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // Auto fecha = día siguiente al vencimiento del contrato
  const handleContrato = (cid) => {
    const contrato = contratos?.find(c => c.id === cid);
    let fechaAnexo = form.fechaAnexo;
    if (contrato?.fechaFin) {
      const siguiente = new Date(contrato.fechaFin);
      siguiente.setDate(siguiente.getDate() + 1);
      fechaAnexo = siguiente.toISOString().split('T')[0];
    }
    set('contratoId', cid);
    setForm(f => ({ ...f, contratoId: cid, fechaAnexo }));
  };

  const handleTrabajador = (tid) => {
    const contrato = contratos?.find(c => c.trabajadorId === tid && c.estado === 'vigente');
    setForm(f => ({ ...f, trabajadorId: tid, contratoId: contrato?.id || '' }));
    if (contrato?.fechaFin) {
      const siguiente = new Date(contrato.fechaFin);
      siguiente.setDate(siguiente.getDate() + 1);
      setForm(f => ({ ...f, trabajadorId: tid, contratoId: contrato.id, fechaAnexo: siguiente.toISOString().split('T')[0] }));
    } else {
      setForm(f => ({ ...f, trabajadorId: tid, contratoId: contrato?.id || '' }));
    }
  };

  const handleSave = async () => {
    if (!form.trabajadorId || !form.contratoId || !form.tipo || !form.fechaAnexo) {
      alert('Trabajador, contrato, tipo y fecha son obligatorios.'); return;
    }
    setSaving(true);
    try {
      const payload = { ...form, updatedAt: serverTimestamp() };
      if (editData?.id) {
        await updateDoc(doc(db, 'empresas', empresaId, 'anexos', editData.id), payload);
      } else {
        await addDoc(collection(db, 'empresas', empresaId, 'anexos'), { ...payload, createdAt: serverTimestamp() });
      }
      onSaved?.(); onClose();
    } catch (e) { alert('Error: ' + e.message); }
    setSaving(false);
  };

  const contratoSel   = contratos?.find(c => c.id === form.contratoId);
  const trabajadorSel = trabajadores?.find(t => t.id === form.trabajadorId);
  const fmt = n => n ? `$${parseInt(n).toLocaleString('es-CL')}` : '';

  const DIAS_SEMANA = ['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'];

  return (
    <Modal isOpen={isOpen} onClose={onClose}
      title={editData ? 'Editar Anexo' : `Nuevo Anexo${nroAnexo ? ` N°${nroAnexo}` : ''}`}
      subtitle="Modificación contractual · Art. 11 Código del Trabajo"
      maxWidth="max-w-2xl">
      <div className="space-y-5">

        {/* ── Datos base ── */}
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
            <select className={inp} value={form.contratoId} onChange={e => handleContrato(e.target.value)}>
              <option value="">Seleccionar contrato…</option>
              {(contratos || []).filter(c => c.trabajadorId === form.trabajadorId).map(c => (
                <option key={c.id} value={c.id}>{c.tipoContrato} — {c.empresa} ({c.estado}){c.fechaFin ? ` · vence ${c.fechaFin}` : ''}</option>
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
            {contratoSel?.fechaFin && (
              <p className="text-[10px] text-violet-600 mt-1">
                ⚡ Auto-calculada: día siguiente al vencimiento ({contratoSel.fechaFin})
              </p>
            )}
          </Field>
        </div>

        {/* ══ CAMPOS POR TIPO ══ */}

        {/* Aumento sueldo base */}
        {form.tipo === 'aumento_sueldo_base' && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 space-y-3">
            <p className="text-[11px] font-black text-emerald-700 uppercase tracking-widest">Nuevo sueldo base imponible</p>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Sueldo base anterior ($)">
                <input type="number" className={inp} value={contratoSel?.sueldoBase || ''} disabled
                  style={{opacity:0.6, background:'#f1f5f9'}} />
              </Field>
              <Field label="Nuevo sueldo base ($)" required>
                <input type="number" className={inp} value={form.sueldoBase}
                  onChange={e => set('sueldoBase', e.target.value)} placeholder="Ej: 850000" />
              </Field>
            </div>
            {contratoSel?.sueldoBase && form.sueldoBase && (
              <div className="text-xs font-bold text-emerald-700 bg-emerald-100 rounded-lg px-3 py-2">
                Variación: +${(parseInt(form.sueldoBase)-parseInt(contratoSel.sueldoBase)).toLocaleString('es-CL')}
                {' '}(+{Math.round(((parseInt(form.sueldoBase)-parseInt(contratoSel.sueldoBase))/parseInt(contratoSel.sueldoBase))*100)}%)
              </div>
            )}
          </div>
        )}

        {/* Aumento sueldo base + no imponibles */}
        {form.tipo === 'aumento_haberes' && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 space-y-3">
            <p className="text-[11px] font-black text-emerald-700 uppercase tracking-widest">Sueldo base + haberes no imponibles</p>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Nuevo sueldo base ($)" required>
                <input type="number" className={inp} value={form.sueldoBase}
                  onChange={e => set('sueldoBase', e.target.value)} placeholder="Imponible" />
              </Field>
              <Field label="Bono colación ($)">
                <input type="number" className={inp} value={form.bonoColacion}
                  onChange={e => set('bonoColacion', e.target.value)} placeholder="No imponible" />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Bono movilización ($)">
                <input type="number" className={inp} value={form.bonoMovilizacion}
                  onChange={e => set('bonoMovilizacion', e.target.value)} placeholder="No imponible" />
              </Field>
              <Field label="Viáticos ($)">
                <input type="number" className={inp} value={form.viaticos}
                  onChange={e => set('viaticos', e.target.value)} placeholder="No imponible" />
              </Field>
            </div>
          </div>
        )}

        {/* Aumento general (compatibilidad) */}
        {form.tipo === 'aumento_sueldo' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Nuevo sueldo base ($)" required>
              <input type="text" className={inp} value={formatCLP(form.nuevoSueldo)} onChange={e => set('nuevoSueldo', parseCLP(e.target.value))} />
            </Field>
            {contratoSel?.sueldoBase && form.nuevoSueldo && (
              <div className="flex items-end pb-2.5">
                <div className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2.5 w-full">
                  Variación: +${(parseInt(form.nuevoSueldo)-parseInt(contratoSel.sueldoBase)).toLocaleString('es-CL')}
                  {' '}(+{Math.round(((parseInt(form.nuevoSueldo)-parseInt(contratoSel.sueldoBase))/parseInt(contratoSel.sueldoBase))*100)}%)
                </div>
              </div>
            )}
          </div>
        )}

        {/* Cambio cargo */}
        {form.tipo === 'cambio_cargo' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Nuevo cargo">
              <input className={inp} value={form.nuevoCargo} onChange={e => set('nuevoCargo', e.target.value)} placeholder="Nuevo cargo o función" />
            </Field>
            <Field label="Centro de costo">
              <input className={inp} value={form.centroCosto} onChange={e => set('centroCosto', e.target.value)} placeholder="Área o proyecto" />
            </Field>
          </div>
        )}

        {/* Cambio jornada — CON DETALLE */}
        {form.tipo === 'cambio_jornada' && (
          <div className="rounded-xl border border-violet-200 bg-violet-50/40 p-4 space-y-3">
            <p className="text-[11px] font-black text-violet-600 uppercase tracking-widest">Nueva jornada (Art. 22 CT)</p>
            <Field label="Tipo de jornada">
              <select className={inp} value={form.jornada} onChange={e => set('jornada', e.target.value)}>
                <option value="">Seleccionar…</option>
                {JORNADAS.map(j => <option key={j}>{j}</option>)}
              </select>
            </Field>
            {(form.jornada === 'Otro' || form.jornada === '') && (
              <>
                <div className="grid grid-cols-3 gap-3">
                  <Field label="Horas semanales">
                    <input type="number" className={inp} value={form.jornadaHorasSemanales}
                      onChange={e => set('jornadaHorasSemanales', e.target.value)} placeholder="Ej: 36" />
                  </Field>
                  <Field label="Hora entrada">
                    <input type="time" className={inp} value={form.jornadaHoraEntrada}
                      onChange={e => set('jornadaHoraEntrada', e.target.value)} />
                  </Field>
                  <Field label="Hora salida">
                    <input type="time" className={inp} value={form.jornadaHoraSalida}
                      onChange={e => set('jornadaHoraSalida', e.target.value)} />
                  </Field>
                </div>
                <div>
                  <label className="block text-[11px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Días de trabajo</label>
                  <div className="flex gap-2 flex-wrap">
                    {DIAS_SEMANA.map(dia => (
                      <label key={dia} className="flex items-center gap-1.5 cursor-pointer">
                        <input type="checkbox"
                          checked={(form.jornadaDias || []).includes(dia)}
                          onChange={e => {
                            const dias = form.jornadaDias || [];
                            set('jornadaDias', e.target.checked ? [...dias, dia] : dias.filter(d => d !== dia));
                          }}
                          className="rounded" />
                        <span className="text-xs font-bold text-slate-600">{dia.slice(0,3)}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </>
            )}
            <Field label="Descripción de la jornada (para el documento)">
              <textarea className={inp} rows={2} value={form.jornadaDescripcion}
                onChange={e => set('jornadaDescripcion', e.target.value)}
                placeholder="Ej: De lunes a viernes de 08:00 a 17:00 hrs con 1 hora de colación…" />
            </Field>
          </div>
        )}

        {/* Cambio empresa */}
        {form.tipo === 'cambio_empresa' && (
          <Field label="Nueva empresa">
            <select className={inp} value={form.nuevaEmpresa} onChange={e => set('nuevaEmpresa', e.target.value)}>
              <option value="">Seleccionar…</option>
              {EMPRESAS.map(e => <option key={e}>{e}</option>)}
            </select>
          </Field>
        )}

        {/* Prórroga */}
        {form.tipo === 'prorroga' && (
          <Field label="Nueva fecha de término">
            <input type="date" className={inp} value={form.fechaFin} onChange={e => set('fechaFin', e.target.value)} />
          </Field>
        )}

        {/* Conversión a indefinido */}
        {form.tipo === 'conversion_indefinido' && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 space-y-2">
            <p className="text-[11px] font-black text-emerald-700 uppercase tracking-widest">Conversión a contrato indefinido</p>
            <p className="text-xs text-emerald-700">
              Conforme al Art. 159 N°4 del Código del Trabajo, el contrato de plazo fijo se convierte en contrato de duración indefinida a contar de la fecha de este anexo.
            </p>
            {contratoSel?.fechaFin && (
              <div className="text-xs font-bold text-emerald-800 bg-emerald-100 rounded-lg px-3 py-2">
                Contrato actual vence: {contratoSel.fechaFin} · El anexo formaliza la conversión.
              </div>
            )}
          </div>
        )}

        {/* Otros bonos */}
        {form.tipo === 'otros_bonos' && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Field label="Colación ($)">
              <input type="number" className={inp} value={form.bonoColacionOtros} onChange={e => set('bonoColacionOtros', e.target.value)} placeholder="0" />
            </Field>
            <Field label="Movilización ($)">
              <input type="number" className={inp} value={form.bonoMovilizacionOtros} onChange={e => set('bonoMovilizacionOtros', e.target.value)} placeholder="0" />
            </Field>
            <Field label="Viáticos ($)">
              <input type="number" className={inp} value={form.viaticosOtros} onChange={e => set('viaticosOtros', e.target.value)} placeholder="0" />
            </Field>
            <Field label="Hrs extra/sem">
              <input type="number" className={inp} value={form.horasExtra} onChange={e => set('horasExtra', e.target.value)} placeholder="0" />
            </Field>
          </div>
        )}

        {/* Otro — con texto y subida a Storage */}
        {form.tipo === 'otro' && (
          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 space-y-3">
            <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Detalle de la modificación</p>
            <Field label="Descripción del anexo (aparecerá en el documento)">
              <textarea className={inp} rows={3} value={form.otroDetalle}
                onChange={e => set('otroDetalle', e.target.value)}
                placeholder="Describe con precisión la modificación acordada…" />
            </Field>
            <SubirDocumentoAnexo
              empresaId={empresaId}
              trabajadorId={form.trabajadorId}
              urlActual={form.urlDocumento}
              nombreActual={form.nombreDocumento}
              onChange={(url, nombre) => setForm(f => ({ ...f, urlDocumento: url, nombreDocumento: nombre }))}
            />
          </div>
        )}

        {/* Descripción adicional (todos los tipos excepto "otro") */}
        {form.tipo && form.tipo !== 'otro' && (
          <Field label="Notas adicionales (opcional)">
            <textarea className={inp} rows={2} value={form.descripcion}
              onChange={e => set('descripcion', e.target.value)}
              placeholder="Observaciones o condiciones adicionales…" />
          </Field>
        )}

        <Field label="Estado">
          <select className={inp} value={form.estado} onChange={e => set('estado', e.target.value)}>
            <option value="vigente">Vigente</option>
            <option value="anulado">Anulado</option>
          </select>
        </Field>

        <div className="flex justify-between items-center pt-2">
          {trabajadorSel && contratoSel && form.tipo && (
            <button onClick={() => generarPDFAnexo(form, contratoSel, trabajadorSel, nroAnexo || 1)}
              className="flex items-center gap-1.5 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm rounded-xl transition-colors">
              📄 Vista previa PDF
            </button>
          )}
          <div className="flex gap-3 ml-auto">
            <CancelBtn onClose={onClose} />
            <SaveBtn saving={saving} onClick={handleSave} label={editData ? 'Actualizar anexo' : 'Guardar anexo'} />
          </div>
        </div>
      </div>
    </Modal>
  );
}

// ─── HistorialModal ───────────────────────────────────────────────────────────

function HistorialModal({ isOpen, onClose, trabajador, contratos, anexos, liquidaciones, finiquitos }) {
  const { empresaId, subEmpresasNames: EMPRESAS = [] } = useEmpresa();
  const [tab, setTab] = useState('contratos');
  // Documentos adjuntos
  const [documentos,     setDocumentos]     = useState([]);
  const [loadingDocs,    setLoadingDocs]    = useState(false);
  const [subiendoDoc,    setSubiendoDoc]    = useState(false);
  const [progresoDoc,    setProgresoDoc]    = useState(null);
  const [errorDoc,       setErrorDoc]       = useState('');
  const inputDocRef = useRef(null);

  useEffect(() => { setTab('contratos'); setDocumentos([]); setErrorDoc(''); }, [trabajador]);

  // Cargar documentos del trabajador desde Firestore
  useEffect(() => {
    if (!isOpen || !trabajador || !empresaId || tab !== 'documentos') return;
    setLoadingDocs(true);
    getDocs(query(
      collection(db, 'empresas', empresaId, 'documentos_trabajadores'),
      orderBy('createdAt', 'desc')
    )).then(snap => {
      setDocumentos(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(d => d.trabajadorId === trabajador.id));
    }).catch(console.error).finally(() => setLoadingDocs(false));
  }, [isOpen, trabajador, empresaId, tab]);

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
    aumento_sueldo_base: 'bg-emerald-100 text-emerald-700',
    aumento_haberes: 'bg-teal-100 text-teal-700',
  };

  // Subir documento a Storage
  const handleSubirDocumento = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorDoc('');
    const TIPOS_OK = ['application/pdf','image/png','image/jpeg','application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (!TIPOS_OK.includes(file.type)) { setErrorDoc('Solo PDF, Word o imágenes.'); return; }
    if (file.size > 15 * 1024 * 1024)  { setErrorDoc('Máximo 15 MB.'); return; }

    setSubiendoDoc(true); setProgresoDoc(0);
    try {
      const ruta = `empresas/${empresaId}/documentos/${trabajador.id}/${Date.now()}_${file.name}`;
      const storageRef = ref(storage, ruta);
      const task = uploadBytesResumable(storageRef, file);
      task.on('state_changed',
        snap => setProgresoDoc(Math.round(snap.bytesTransferred / snap.totalBytes * 100)),
        err  => { setErrorDoc('Error: ' + err.message); setSubiendoDoc(false); setProgresoDoc(null); },
        async () => {
          const url = await getDownloadURL(task.snapshot.ref);
          const nuevoDoc = {
            trabajadorId: trabajador.id,
            nombre: file.name,
            url,
            tipo: file.type,
            tamaño: file.size,
            ruta,
            createdAt: serverTimestamp(),
          };
          await addDoc(collection(db, 'empresas', empresaId, 'documentos_trabajadores'), nuevoDoc);
          setDocumentos(prev => [{ ...nuevoDoc, id: Date.now().toString(), createdAt: { seconds: Date.now()/1000 } }, ...prev]);
          setSubiendoDoc(false); setProgresoDoc(null);
          if (inputDocRef.current) inputDocRef.current.value = '';
        }
      );
    } catch(err) { setErrorDoc('Error: ' + err.message); setSubiendoDoc(false); setProgresoDoc(null); }
  };

  const handleEliminarDoc = async (docItem) => {
    if (!confirm(`¿Eliminar "${docItem.nombre}"?`)) return;
    try {
      await deleteDoc(doc(db, 'empresas', empresaId, 'documentos_trabajadores', docItem.id));
      if (docItem.ruta) { try { await deleteObject(ref(storage, docItem.ruta)); } catch {} }
      setDocumentos(prev => prev.filter(d => d.id !== docItem.id));
    } catch(err) { alert('Error al eliminar: ' + err.message); }
  };

  const iconoTipoDoc = (tipo) => {
    if (tipo?.includes('pdf'))   return '📄';
    if (tipo?.includes('image')) return '🖼';
    if (tipo?.includes('word') || tipo?.includes('document')) return '📝';
    return '📎';
  };

  const TABS = [
    { id: 'contratos',    label: `Contratos (${misContratos.length})` },
    { id: 'anexos',       label: `Anexos (${misAnexos.length})` },
    { id: 'liquidaciones',label: `Liquidaciones (${misLiquidaciones.length})` },
    { id: 'finiquitos',   label: `Finiquitos (${misFiniquitos.length})` },
    { id: 'documentos',   label: `Documentos (${documentos.length})` },
  ];

  return (
    <Modal isOpen={isOpen} onClose={onClose}
      title={`Historial — ${trabajador.nombre} ${trabajador.apellidoPaterno}`}
      subtitle={`RUT ${trabajador.rut} · ${anios}a ${meses}m de antigüedad`}
      maxWidth="max-w-3xl">
      <div className="space-y-4">

        <div className="grid grid-cols-5 gap-2">
          {[
            { label: 'Contratos',    value: misContratos.length,     color: 'text-indigo-600' },
            { label: 'Anexos',       value: misAnexos.length,        color: 'text-purple-600' },
            { label: 'Liquidaciones',value: misLiquidaciones.length, color: 'text-emerald-600' },
            { label: 'Finiquitos',   value: misFiniquitos.length,    color: 'text-rose-600' },
            { label: 'Documentos',   value: documentos.length,       color: 'text-blue-600' },
          ].map(({ label, value, color }) => (
            <div key={label} className="rounded-xl border border-slate-100 px-2 py-3 text-center bg-white shadow-sm">
              <p className={`text-xl font-black ${color}`}>{value}</p>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">{label}</p>
            </div>
          ))}
        </div>

        <div className="flex border-b border-slate-100 overflow-x-auto">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-4 py-2.5 text-xs font-bold transition-colors border-b-2 -mb-px whitespace-nowrap ${
                tab === t.id ? 'border-violet-600 text-violet-700' : 'border-transparent text-slate-400 hover:text-slate-600'
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="min-h-[200px]">

          {/* ── CONTRATOS ── */}
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
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-700">{fmt(c.sueldoBase)}</span>
                      <button onClick={() => generarPDFContrato(c, trabajador)}
                        className="p-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 rounded-lg transition-colors" title="Ver PDF contrato">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                      </button>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">{c.fechaInicio} — {c.fechaFin || 'Indefinido'} · {c.empresa}</p>
                </div>
              ))}
            </div>
          )}

          {/* ── ANEXOS ── */}
          {tab === 'anexos' && (
            <div className="space-y-2">
              {misAnexos.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-8">Sin anexos registrados</p>
              ) : misAnexos.map((a, i) => {
                const tipoLabel = TIPOS_ANEXO.find(t => t.value === a.tipo)?.label || a.tipo;
                const contratoA = misContratos.find(c => c.id === a.contratoId);
                return (
                  <div key={a.id} className="rounded-xl border border-slate-100 px-4 py-3 hover:bg-slate-50/60 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-black text-slate-400">N°{misAnexos.length - i}</span>
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${tipoBadge[a.tipo] || 'bg-slate-100 text-slate-600'}`}>{tipoLabel}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-400">{a.fechaAnexo}</span>
                        {/* Si tipo=otro con doc propio → abrir ese archivo; si no → PDF FleetCore */}
                        {a.tipo === 'otro' && a.urlDocumento ? (
                          <a href={a.urlDocumento} target="_blank" rel="noreferrer"
                            className="p-1.5 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-lg transition-colors" title="Ver documento adjunto">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"/></svg>
                          </a>
                        ) : (
                          <button onClick={() => generarPDFAnexo(a, contratoA, trabajador, misAnexos.length - i)}
                            className="p-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 rounded-lg transition-colors" title="Ver PDF anexo">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                          </button>
                        )}
                      </div>
                    </div>
                    {a.descripcion  && <p className="text-xs text-slate-500 mt-1.5">{a.descripcion}</p>}
                    {(a.nuevoSueldo || a.sueldoBase) && <p className="text-xs font-bold text-emerald-600 mt-1">Nuevo sueldo: {fmt(a.nuevoSueldo || a.sueldoBase)}</p>}
                    {a.nuevoCargo   && <p className="text-xs font-bold text-blue-600 mt-1">Nuevo cargo: {a.nuevoCargo}</p>}
                  </div>
                );
              })}
            </div>
          )}

          {/* ── LIQUIDACIONES ── */}
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
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${l.estado === 'pagado' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                          {l.estado || 'pendiente'}
                        </span>
                        <span className="text-sm font-black text-emerald-600">{calc ? fmt(calc.liquido) : '—'}</span>
                        {c && <button onClick={() => generarPDFLiquidacion(l, c, trabajador)}
                          className="p-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 rounded-lg transition-colors" title="Ver PDF liquidación">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                        </button>}
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

          {/* ── FINIQUITOS ── */}
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
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-black text-emerald-600">{calcF ? fmt(calcF.totalFiniquito) : '—'}</span>
                        <button onClick={() => generarPDFFiniquito(f, trabajador, contratoF)}
                          className="p-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 rounded-lg transition-colors" title="Ver PDF finiquito">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                        </button>
                      </div>
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

          {/* ── DOCUMENTOS ── */}
          {tab === 'documentos' && (
            <div className="space-y-3">
              {/* Uploader */}
              <label className={`flex items-center gap-3 border-2 border-dashed rounded-xl px-4 py-3 cursor-pointer transition-colors ${subiendoDoc ? 'border-violet-300 bg-violet-50/30' : 'border-slate-200 hover:border-violet-400 hover:bg-violet-50/20'}`}>
                <svg className="w-5 h-5 text-slate-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                </svg>
                <div className="flex-1 min-w-0">
                  {progresoDoc !== null ? (
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs text-slate-500">
                        <span>Subiendo…</span><span>{progresoDoc}%</span>
                      </div>
                      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-violet-500 rounded-full transition-all" style={{ width: `${progresoDoc}%` }} />
                      </div>
                    </div>
                  ) : (
                    <span className="text-sm font-bold text-slate-500">
                      {subiendoDoc ? 'Procesando…' : 'Agregar documento (PDF, Word, imagen — máx. 15 MB)'}
                    </span>
                  )}
                </div>
                <input ref={inputDocRef} type="file" className="hidden"
                  accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                  onChange={handleSubirDocumento} disabled={subiendoDoc} />
              </label>
              {errorDoc && <p className="text-xs text-red-600 font-bold">{errorDoc}</p>}

              {/* Lista documentos */}
              {loadingDocs ? (
                <div className="flex justify-center py-8">
                  <div className="w-6 h-6 rounded-full animate-spin" style={{border:'2px solid rgba(124,58,237,0.15)',borderTopColor:'#7c3aed'}} />
                </div>
              ) : documentos.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-6">Sin documentos adjuntos</p>
              ) : (
                <div className="space-y-2">
                  {documentos.map(d => (
                    <div key={d.id} className="flex items-center gap-3 rounded-xl border border-slate-100 px-4 py-3 hover:bg-slate-50/60 transition-colors">
                      <span className="text-xl flex-shrink-0">{iconoTipoDoc(d.tipo)}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-slate-700 truncate">{d.nombre}</p>
                        <p className="text-[11px] text-slate-400">
                          {d.tamaño ? `${(d.tamaño / 1024).toFixed(0)} KB · ` : ''}
                          {d.createdAt?.seconds ? new Date(d.createdAt.seconds * 1000).toLocaleDateString('es-CL') : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <a href={d.url} target="_blank" rel="noreferrer"
                          className="p-1.5 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-lg transition-colors" title="Ver / descargar">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                        </a>
                        <button onClick={() => handleEliminarDoc(d)}
                          className="p-1.5 bg-red-50 hover:bg-red-100 text-red-500 rounded-lg transition-colors" title="Eliminar">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </Modal>
  );
}

// ─── AsistenciaModal ──────────────────────────────────────────────────────────

function AsistenciaModal({ isOpen, onClose, editData, trabajadores, contratos, onSaved }) {
  const { empresaId } = useEmpresa();
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
        await updateDoc(doc(db, 'empresas', empresaId, 'asistencia', editData.id), payload);
      } else {
        await addDoc(collection(db, 'empresas', empresaId, 'asistencia'), { ...payload, createdAt: serverTimestamp() });
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

// ─── AusenciaModal ───────────────────────────────────────────────────────────

function AusenciaModal({ isOpen, onClose, editData, trabajadores, preselectedTrabajadorId, onSaved }) {
  const { empresaId } = useEmpresa();
  const empty = {
    trabajadorId: preselectedTrabajadorId || '',
    tipo: '',
    fechaDesde: new Date().toISOString().split('T')[0],
    dias: '1',
    medioDia: false,
    esContinuacion: false,
    motivo: '',
    nroLicencia: '',
    nombreMedico: '',
    horaDesde: '',
    horas: '0',
    minutos: '0',
    observaciones: '',
  };

  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm(editData ? { ...empty, ...editData } : { ...empty, trabajadorId: preselectedTrabajadorId || '' });
  }, [editData, isOpen, preselectedTrabajadorId]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.trabajadorId || !form.tipo || !form.fechaDesde) {
      alert('Trabajador, tipo de ausencia y fecha desde son obligatorios.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        dias: Number(form.dias) || 0,
        horas: Number(form.horas) || 0,
        minutos: Number(form.minutos) || 0,
        updatedAt: serverTimestamp(),
      };
      if (editData?.id) {
        await updateDoc(doc(db, 'empresas', empresaId, 'ausencias', editData.id), payload);
      } else {
        await addDoc(collection(db, 'empresas', empresaId, 'ausencias'), {
          ...payload,
          createdAt: serverTimestamp(),
        });
      }
      onSaved?.();
      onClose();
    } catch (e) {
      alert('Error: ' + e.message);
    }
    setSaving(false);
  };

  const showMedicalFields = form.tipo === 'licencia medica' || form.tipo === 'licencia maternal';

  const TIPOS_AUSENCIA = [
    { value: 'permiso con goce', label: 'permiso con goce' },
    { value: 'sin goce', label: 'sin goce' },
    { value: 'licencia medica', label: 'licencia medica' },
    { value: 'licencia maternal', label: 'licencia maternal' },
    { value: 'falta injustificada', label: 'falta injustificada' },
    { value: 'accidente', label: 'accidente' },
  ];

  const MOTIVOS_AUSENCIA = [
    'Enfermedad común',
    'Accidente del trabajo',
    'Accidente de trayecto',
    'Enfermedad profesional',
    'Pre y post natal',
    'Otro',
  ];

  return (
    <Modal isOpen={isOpen} onClose={onClose}
      title={editData ? 'Editar Ausencia' : 'Registrar Ausencia'}
      subtitle="Control de Ausencias y Licencias Médicas"
      maxWidth="max-w-2xl">
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Trabajador" required>
            <select
              className={inp}
              value={form.trabajadorId}
              onChange={e => set('trabajadorId', e.target.value)}
              disabled={!!preselectedTrabajadorId}
            >
              <option value="">Seleccionar trabajador…</option>
              {(trabajadores || []).sort((a, b) => a.apellidoPaterno?.localeCompare(b.apellidoPaterno)).map(t => (
                <option key={t.id} value={t.id}>{t.apellidoPaterno} {t.nombre} — {t.rut}</option>
              ))}
            </select>
          </Field>

          <Field label="Tipo de Ausencia" required>
            <select
              className={inp}
              value={form.tipo}
              onChange={e => set('tipo', e.target.value)}
            >
              <option value="">Seleccionar tipo…</option>
              {TIPOS_AUSENCIA.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Fecha Desde" required>
            <input
              type="date"
              className={inp}
              value={form.fechaDesde}
              onChange={e => set('fechaDesde', e.target.value)}
            />
            <p className="text-[10px] text-slate-400 mt-1">fecha inclusive</p>
          </Field>

          <Field label="Número de Días">
            <input
              type="number"
              min="0"
              className={inp}
              value={form.dias}
              onChange={e => set('dias', e.target.value)}
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="medioDia"
              checked={form.medioDia}
              onChange={e => set('medioDia', e.target.checked)}
              className="rounded text-violet-600 focus:ring-violet-500 h-4 w-4 border-slate-300"
            />
            <label htmlFor="medioDia" className="text-xs font-bold text-slate-700">¿Sólo medio día?</label>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="esContinuacion"
              checked={form.esContinuacion}
              onChange={e => set('esContinuacion', e.target.checked)}
              className="rounded text-violet-600 focus:ring-violet-500 h-4 w-4 border-slate-300"
            />
            <div>
              <label htmlFor="esContinuacion" className="text-xs font-bold text-slate-700">¿Es Continuación?</label>
              <p className="text-[9px] text-slate-400">Sólo para licencias médicas. Si es continuación de una licencia anterior</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Motivo">
            <select
              className={inp}
              value={form.motivo}
              onChange={e => set('motivo', e.target.value)}
            >
              <option value="">Seleccionar motivo…</option>
              {MOTIVOS_AUSENCIA.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </Field>

          {showMedicalFields && (
            <Field label="Número de licencia">
              <input
                type="text"
                className={inp}
                placeholder="Ej: 1-12345678"
                value={form.nroLicencia}
                onChange={e => set('nroLicencia', e.target.value)}
              />
              <p className="text-[10px] text-slate-400 mt-1">Sólo para licencias médicas</p>
            </Field>
          )}
        </div>

        {showMedicalFields && (
          <div className="grid grid-cols-1 gap-4">
            <Field label="Nombre del Médico">
              <input
                type="text"
                className={inp}
                placeholder="Dr(a). Nombre Apellido"
                value={form.nombreMedico}
                onChange={e => set('nombreMedico', e.target.value)}
              />
              <p className="text-[10px] text-slate-400 mt-1">Sólo para licencias médicas</p>
            </Field>
          </div>
        )}

        <Divider label="Horas de Ausencia (Si aplica)" />
        <div className="grid grid-cols-3 gap-4">
          <Field label="Hora Desde">
            <input
              type="time"
              className={inp}
              value={form.horaDesde}
              onChange={e => set('horaDesde', e.target.value)}
            />
          </Field>
          <Field label="Número de Horas">
            <input
              type="number"
              min="0"
              className={inp}
              value={form.horas}
              onChange={e => set('horas', e.target.value)}
            />
          </Field>
          <Field label="Número de Minutos">
            <input
              type="number"
              min="0"
              max="59"
              className={inp}
              value={form.minutos}
              onChange={e => set('minutos', e.target.value)}
            />
          </Field>
        </div>

        <Field label="Observaciones">
          <textarea
            className={inp + ' resize-none'}
            rows={3}
            placeholder="Observaciones adicionales..."
            value={form.observaciones}
            onChange={e => set('observaciones', e.target.value)}
          />
          {showMedicalFields && (
            <p className="text-[10px] text-slate-400 mt-1">Observaciones para licencias médicas</p>
          )}
        </Field>

        <div className="flex justify-end gap-3 pt-2">
          <CancelBtn onClose={onClose} />
          <SaveBtn saving={saving} onClick={handleSave} label={editData ? 'Actualizar ausencia' : 'Guardar ausencia'} />
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
  AusenciaModal,
};
