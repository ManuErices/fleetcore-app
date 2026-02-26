import React, { useState, useEffect, useCallback } from 'react';
import {
  collection, getDocs, addDoc, updateDoc, deleteDoc,
  doc, serverTimestamp, query, orderBy,
} from 'firebase/firestore';
import { db } from '../lib/firebase';

// ─────────────────────────────────────────────────────────────
// QR via API confiable
// ─────────────────────────────────────────────────────────────
const getQRUrl = (text, size = 300) =>
  `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(text)}&ecc=M&margin=10`;

// ─────────────────────────────────────────────────────────────
// CONSTANTES
// ─────────────────────────────────────────────────────────────
const ROLES = ['administrador', 'operador', 'mandante'];
const TIPOS_MAQUINA = ['EXCAVADORA', 'BULLDOZER', 'MOTONIVELADORA', 'RETROEXCAVADORA', 'CARGADOR FRONTAL', 'CAMIÓN ALJIBE', 'CAMIÓN COMBUSTIBLE', 'CAMIONETA'];

const TAB_DEFS = [
  { id: 'operadores',  label: 'Operadores',  color: 'blue',   icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z' },
  { id: 'maquinas',    label: 'Máquinas',    color: 'purple', icon: 'M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z' },
  { id: 'actividades', label: 'Actividades', color: 'green',  icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01' },
  { id: 'surtidores',  label: 'Surtidores',  color: 'amber',  icon: 'M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z' },
  { id: 'empresas',    label: 'Empresas',    color: 'teal',   icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4' },
  { id: 'proyectos',   label: 'Proyectos',   color: 'indigo', icon: 'M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z' },
  { id: 'usuarios',    label: 'Usuarios',    color: 'rose',   icon: 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z' },
];

const GRADIENTS = {
  blue:   'from-blue-600 to-indigo-600',
  purple: 'from-purple-600 to-indigo-600',
  green:  'from-emerald-600 to-teal-600',
  amber:  'from-amber-500 to-orange-500',
  teal:   'from-teal-600 to-cyan-600',
  indigo: 'from-indigo-600 to-blue-600',
  rose:   'from-rose-600 to-pink-600',
  slate:  'from-slate-700 to-slate-800',
};

const TAB_ACTIVE = {
  blue:   'bg-blue-600 text-white shadow-lg shadow-blue-200',
  purple: 'bg-purple-600 text-white shadow-lg shadow-purple-200',
  green:  'bg-emerald-600 text-white shadow-lg shadow-emerald-200',
  amber:  'bg-amber-500 text-white shadow-lg shadow-amber-200',
  teal:   'bg-teal-600 text-white shadow-lg shadow-teal-200',
  indigo: 'bg-indigo-600 text-white shadow-lg shadow-indigo-200',
  rose:   'bg-rose-600 text-white shadow-lg shadow-rose-200',
};

const ROLE_STYLES = {
  administrador: 'bg-purple-100 text-purple-700 border border-purple-200',
  operador:      'bg-blue-100 text-blue-700 border border-blue-200',
  mandante:      'bg-amber-100 text-amber-700 border border-amber-200',
};

// ─────────────────────────────────────────────────────────────
// HELPERS UI
// ─────────────────────────────────────────────────────────────
const inputCls = 'w-full px-3.5 py-2.5 bg-white border-2 border-slate-200 rounded-xl focus:outline-none focus:border-purple-400 text-sm transition-colors placeholder:text-slate-300';
const selectCls = 'w-full px-3.5 py-2.5 bg-white border-2 border-slate-200 rounded-xl focus:outline-none focus:border-purple-400 text-sm transition-colors';

function Field({ label, required, children }) {
  return (
    <div>
      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
        {label}{required && <span className="text-red-400 ml-1">*</span>}
      </label>
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// MODAL
// ─────────────────────────────────────────────────────────────
function Modal({ isOpen, onClose, title, children, color = 'purple' }) {
  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);
  if (!isOpen) return null;
  const grad = GRADIENTS[color] || GRADIENTS.purple;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden max-h-[95vh] flex flex-col animate-scaleIn">
        <div className={`bg-gradient-to-r ${grad} px-5 py-4 flex items-center justify-between flex-shrink-0`}>
          <h3 className="text-base font-black text-white">{title}</h3>
          <button onClick={onClose} className="p-1.5 bg-white/20 hover:bg-white/30 rounded-lg transition-colors">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="overflow-y-auto flex-1 p-5">{children}</div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// CONFIRM DIALOG
// ─────────────────────────────────────────────────────────────
function ConfirmDialog({ isOpen, onClose, onConfirm, title, message }) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full">
        <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-3">
          <svg className="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h3 className="text-base font-black text-slate-900 text-center">{title}</h3>
        <p className="text-sm text-slate-500 text-center mt-1 mb-5">{message}</p>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-sm transition-colors">Cancelar</button>
          <button onClick={onConfirm} className="flex-1 py-2.5 bg-gradient-to-r from-red-500 to-rose-600 text-white font-bold rounded-xl text-sm transition-all hover:opacity-90 shadow-md">Eliminar</button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// QR CARD
// ─────────────────────────────────────────────────────────────
function QRCard({ isOpen, onClose, title, qrText }) {
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    if (isOpen) { setImgLoaded(false); setImgError(false); }
  }, [isOpen, qrText]);

  const downloadPNG = () => {
    const a = document.createElement('a');
    a.href = getQRUrl(qrText, 600);
    a.download = `QR_${(title || qrText).replace(/[^a-zA-Z0-9_-]/g, '_')}.png`;
    a.target = '_blank';
    a.click();
  };

  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:max-w-xs bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden">
        <div className="bg-gradient-to-r from-slate-800 to-slate-900 px-5 py-4 flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-xs text-slate-400 uppercase tracking-wider font-bold">Código QR</p>
            <h3 className="text-sm font-black text-white truncate">{title}</h3>
          </div>
          <button onClick={onClose} className="p-1.5 bg-white/15 hover:bg-white/25 rounded-lg transition-colors ml-3 flex-shrink-0">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-5 flex flex-col items-center gap-4">
          {/* QR Image */}
          <div className="relative w-[192px] h-[192px] bg-slate-50 rounded-2xl border-2 border-slate-100 flex items-center justify-center overflow-hidden shadow-inner">
            {!imgLoaded && !imgError && (
              <div className="flex flex-col items-center gap-2 text-slate-300">
                <div className="w-7 h-7 border-2 border-slate-200 border-t-slate-400 rounded-full animate-spin" />
                <span className="text-xs font-medium">Generando...</span>
              </div>
            )}
            {imgError && (
              <div className="flex flex-col items-center gap-2 text-slate-400 px-4 text-center">
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                </svg>
                <span className="text-xs">Sin conexión</span>
              </div>
            )}
            <img
              src={getQRUrl(qrText, 192)}
              alt={`QR ${title}`}
              width={192}
              height={192}
              className="rounded-xl"
              style={{ display: imgLoaded ? 'block' : 'none', imageRendering: 'pixelated' }}
              onLoad={() => setImgLoaded(true)}
              onError={() => setImgError(true)}
            />
          </div>

          {/* Contenido */}
          <div className="w-full bg-slate-50 rounded-xl px-3 py-2.5 border border-slate-100">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Contenido</p>
            <p className="text-sm font-mono font-bold text-slate-800 break-all">{qrText}</p>
          </div>

          {/* Botón descarga */}
          <button
            onClick={downloadPNG}
            disabled={!imgLoaded}
            className="w-full flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-slate-800 to-slate-900 hover:opacity-90 active:scale-[0.98] disabled:opacity-40 text-white font-bold text-sm rounded-xl transition-all shadow-lg"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Descargar PNG
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// DATA TABLE
// ─────────────────────────────────────────────────────────────
function DataTable({ columns, data, onEdit, onDelete, emptyText = 'Sin registros', loading, extraAction }) {
  if (loading) return (
    <div className="flex flex-col items-center justify-center py-16 text-slate-400">
      <div className="w-8 h-8 border-2 border-purple-200 border-t-purple-600 rounded-full animate-spin mb-3" />
      <span className="text-sm font-medium">Cargando...</span>
    </div>
  );
  if (!data.length) return (
    <div className="flex flex-col items-center justify-center py-16 text-slate-400">
      <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mb-3">
        <svg className="w-7 h-7 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
        </svg>
      </div>
      <p className="text-sm font-semibold">{emptyText}</p>
    </div>
  );
  return (
    <div className="overflow-x-auto -mx-5 sm:mx-0">
      <table className="w-full min-w-[480px]">
        <thead>
          <tr className="bg-slate-50 border-y border-slate-100">
            {columns.map(col => (
              <th key={col.key} className="px-4 py-2.5 text-left text-[11px] font-black text-slate-400 uppercase tracking-widest">
                {col.label}
              </th>
            ))}
            <th className="px-4 py-2.5 text-right text-[11px] font-black text-slate-400 uppercase tracking-widest">Acciones</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {data.map(row => (
            <tr key={row.id} className="hover:bg-purple-50/40 transition-colors group">
              {columns.map(col => (
                <td key={col.key} className="px-4 py-3 text-sm text-slate-700">
                  {col.render ? col.render(row) : (row[col.key] || <span className="text-slate-300 text-xs italic">—</span>)}
                </td>
              ))}
              <td className="px-4 py-3">
                <div className="flex items-center justify-end gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  {extraAction?.(row)}
                  <button onClick={() => onEdit(row)} className="p-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-lg transition-colors" title="Editar">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                  {onDelete && (
                    <button onClick={() => onDelete(row)} className="p-1.5 bg-red-50 hover:bg-red-100 text-red-500 rounded-lg transition-colors" title="Eliminar">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// SECTION CARD wrapper
// ─────────────────────────────────────────────────────────────
function SectionCard({ title, subtitle, count, color, icon, onAdd, addLabel, children }) {
  const grad = GRADIENTS[color] || GRADIENTS.purple;
  return (
    <div className="bg-white rounded-2xl shadow-lg border border-slate-100 overflow-hidden">
      {/* Card header con gradiente */}
      <div className={`bg-gradient-to-r ${grad} px-5 py-4 flex items-center justify-between`}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0">
            {icon}
          </div>
          <div>
            <h2 className="text-base font-black text-white flex items-center gap-2">
              {title}
              {count !== undefined && (
                <span className="text-xs bg-white/20 text-white/90 px-2 py-0.5 rounded-full font-bold">{count}</span>
              )}
            </h2>
            {subtitle && <p className="text-xs text-white/70 mt-0.5">{subtitle}</p>}
          </div>
        </div>
        {onAdd && (
          <button
            onClick={onAdd}
            className="flex items-center gap-1.5 px-3 py-2 bg-white/20 hover:bg-white/30 active:scale-95 text-white font-bold text-xs rounded-xl transition-all"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            {addLabel || 'Nuevo'}
          </button>
        )}
      </div>
      {/* Contenido */}
      <div className="p-5">{children}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// BOTONES DE FORMULARIO
// ─────────────────────────────────────────────────────────────
function FormButtons({ onCancel, onSave, saving, isEdit, color = 'purple' }) {
  const grad = GRADIENTS[color] || GRADIENTS.purple;
  return (
    <div className="flex gap-3 pt-2">
      <button type="button" onClick={onCancel} className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-sm transition-colors">
        Cancelar
      </button>
      <button type="button" onClick={onSave} disabled={saving} className={`flex-1 py-3 bg-gradient-to-r ${grad} hover:opacity-90 disabled:opacity-50 text-white font-bold rounded-xl text-sm transition-all shadow-md`}>
        {saving ? 'Guardando...' : isEdit ? 'Actualizar' : 'Crear'}
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// SECCIÓN: OPERADORES
// ─────────────────────────────────────────────────────────────
function OperadoresSection() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [form, setForm] = useState({ nombre: '', rut: '', cargo: '', empresa: '' });
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, 'employees'), orderBy('nombre')));
      setData(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch { setData([]); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const openNew = () => { setForm({ nombre: '', rut: '', cargo: '', empresa: '' }); setEditId(null); setModal(true); };
  const openEdit = (row) => { setForm({ nombre: row.nombre || '', rut: row.rut || '', cargo: row.cargo || '', empresa: row.empresa || '' }); setEditId(row.id); setModal(true); };

  const save = async () => {
    if (!form.nombre.trim()) return alert('El nombre es obligatorio');
    setSaving(true);
    try {
      const p = { nombre: form.nombre.trim(), rut: form.rut.trim(), cargo: form.cargo.trim(), empresa: form.empresa.trim(), updatedAt: serverTimestamp() };
      if (editId) await updateDoc(doc(db, 'employees', editId), p);
      else await addDoc(collection(db, 'employees'), { ...p, createdAt: serverTimestamp() });
      setModal(false); load();
    } catch (e) { alert('Error: ' + e.message); }
    setSaving(false);
  };

  const del = async () => {
    try { await deleteDoc(doc(db, 'employees', confirm.id)); load(); } catch (e) { alert('Error: ' + e.message); }
    setConfirm(null);
  };

  return (
    <>
      <SectionCard title="Operadores" subtitle="Empleados registrados en el sistema" count={data.length} color="blue" onAdd={openNew} addLabel="Nuevo Operador"
        icon={<svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>}
      >
        <DataTable loading={loading} data={data} onEdit={openEdit} onDelete={setConfirm} emptyText="No hay operadores registrados"
          columns={[
            { key: 'nombre', label: 'Nombre' },
            { key: 'rut', label: 'RUT' },
            { key: 'cargo', label: 'Cargo' },
            { key: 'empresa', label: 'Empresa' },
          ]}
        />
      </SectionCard>

      <Modal isOpen={modal} onClose={() => setModal(false)} title={editId ? 'Editar Operador' : 'Nuevo Operador'} color="blue">
        <div className="space-y-4">
          <Field label="Nombre Completo" required><input className={inputCls} value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} placeholder="Ej: Juan Pérez González" /></Field>
          <Field label="RUT"><input className={inputCls} value={form.rut} onChange={e => setForm({ ...form, rut: e.target.value })} placeholder="Ej: 12.345.678-9" /></Field>
          <Field label="Cargo"><input className={inputCls} value={form.cargo} onChange={e => setForm({ ...form, cargo: e.target.value })} placeholder="Ej: Operador Maquinaria" /></Field>
          <Field label="Empresa"><input className={inputCls} value={form.empresa} onChange={e => setForm({ ...form, empresa: e.target.value })} placeholder="Ej: MPF Ingeniería" /></Field>
          <FormButtons onCancel={() => setModal(false)} onSave={save} saving={saving} isEdit={!!editId} color="blue" />
        </div>
      </Modal>
      <ConfirmDialog isOpen={!!confirm} onClose={() => setConfirm(null)} onConfirm={del} title="Eliminar Operador" message={`¿Eliminar a "${confirm?.nombre}"?`} />
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// SECCIÓN: MÁQUINAS
// ─────────────────────────────────────────────────────────────
function MaquinasSection() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [qr, setQr] = useState(null);
  const [form, setForm] = useState({ name: '', code: '', patente: '', type: '', marca: '', modelo: '' });
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, 'machines'), orderBy('name')));
      setData(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch { setData([]); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const openNew = () => { setForm({ name: '', code: '', patente: '', type: '', marca: '', modelo: '' }); setEditId(null); setModal(true); };
  const openEdit = (row) => { setForm({ name: row.name || '', code: row.code || '', patente: row.patente || '', type: row.type || '', marca: row.marca || '', modelo: row.modelo || '' }); setEditId(row.id); setModal(true); };
  const openQR = (row) => setQr({ title: row.name || row.code, qrText: row.code || row.patente || row.id });

  const save = async () => {
    if (!form.name.trim()) return alert('El nombre es obligatorio');
    setSaving(true);
    try {
      const p = { name: form.name.trim(), code: form.code.trim(), patente: form.patente.trim().toUpperCase(), type: form.type, marca: form.marca.trim(), modelo: form.modelo.trim(), updatedAt: serverTimestamp() };
      if (editId) await updateDoc(doc(db, 'machines', editId), p);
      else await addDoc(collection(db, 'machines'), { ...p, createdAt: serverTimestamp() });
      setModal(false); load();
    } catch (e) { alert('Error: ' + e.message); }
    setSaving(false);
  };

  const del = async () => {
    try { await deleteDoc(doc(db, 'machines', confirm.id)); load(); } catch (e) { alert('Error: ' + e.message); }
    setConfirm(null);
  };

  const QRBtn = (row) => (
    <button onClick={() => openQR(row)} className="p-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 rounded-lg transition-colors" title="Ver QR">
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
      </svg>
    </button>
  );

  return (
    <>
      <SectionCard title="Máquinas" subtitle="Equipos registrados en la flota" count={data.length} color="purple" onAdd={openNew} addLabel="Nueva Máquina"
        icon={<svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>}
      >
        <DataTable loading={loading} data={data} onEdit={openEdit} onDelete={setConfirm} extraAction={QRBtn} emptyText="No hay máquinas registradas"
          columns={[
            { key: 'name', label: 'Nombre' },
            { key: 'code', label: 'Código', render: r => <span className="font-mono font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-lg text-xs">{r.code || r.patente || '—'}</span> },
            { key: 'patente', label: 'Patente', render: r => <span className="font-mono font-bold text-slate-700">{r.patente || '—'}</span> },
            { key: 'type', label: 'Tipo' },
            { key: 'marca', label: 'Marca' },
            { key: 'modelo', label: 'Modelo' },
          ]}
        />
      </SectionCard>

      <Modal isOpen={modal} onClose={() => setModal(false)} title={editId ? 'Editar Máquina' : 'Nueva Máquina'} color="purple">
        <div className="space-y-4">
          <Field label="Nombre" required><input className={inputCls} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Ej: Excavadora CAT 320" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Código Interno"><input className={inputCls} value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} placeholder="Ej: EXC-001" /></Field>
            <Field label="Patente"><input className={inputCls} value={form.patente} onChange={e => setForm({ ...form, patente: e.target.value })} placeholder="Ej: BCDF12" /></Field>
          </div>
          <Field label="Tipo">
            <select className={selectCls} value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
              <option value="">Seleccionar tipo...</option>
              {TIPOS_MAQUINA.map(t => <option key={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Marca"><input className={inputCls} value={form.marca} onChange={e => setForm({ ...form, marca: e.target.value })} placeholder="Ej: Caterpillar, Komatsu" /></Field>
          <Field label="Modelo"><input className={inputCls} value={form.modelo} onChange={e => setForm({ ...form, modelo: e.target.value })} placeholder="Ej: Caterpillar 320D" /></Field>
          <FormButtons onCancel={() => setModal(false)} onSave={save} saving={saving} isEdit={!!editId} color="purple" />
        </div>
      </Modal>
      <ConfirmDialog isOpen={!!confirm} onClose={() => setConfirm(null)} onConfirm={del} title="Eliminar Máquina" message={`¿Eliminar "${confirm?.name}"?`} />
      <QRCard isOpen={!!qr} onClose={() => setQr(null)} title={qr?.title} qrText={qr?.qrText} />
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// SECCIÓN: ACTIVIDADES
// ─────────────────────────────────────────────────────────────
const TIPO_STYLES = {
  efectiva:    'bg-emerald-100 text-emerald-700 border border-emerald-200',
  no_efectiva: 'bg-amber-100 text-amber-700 border border-amber-200',
  mantencion:  'bg-slate-100 text-slate-600 border border-slate-200',
};
const TIPO_LABELS = { efectiva: 'Efectiva', no_efectiva: 'No Efectiva', mantencion: 'Mantención' };

function ActividadesSection() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [form, setForm] = useState({ nombre: '', tipo: 'efectiva', descripcion: '', tiposMaquina: [] });
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, 'actividades_disponibles'), orderBy('nombre')));
      setData(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error(e); setData([]); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const openNew = () => { setForm({ nombre: '', tipo: 'efectiva', descripcion: '', tiposMaquina: [] }); setEditId(null); setModal(true); };
  const openEdit = (row) => {
    setForm({
      nombre: row.nombre || '',
      tipo: row.tipo || 'efectiva',
      descripcion: row.descripcion || '',
      tiposMaquina: row.tiposMaquina || [],
    });
    setEditId(row.id);
    setModal(true);
  };

  const toggleTipo = (tipo) => {
    setForm(f => ({
      ...f,
      tiposMaquina: f.tiposMaquina.includes(tipo)
        ? f.tiposMaquina.filter(t => t !== tipo)
        : [...f.tiposMaquina, tipo],
    }));
  };

  const save = async () => {
    if (!form.nombre.trim()) return alert('El nombre es obligatorio');
    setSaving(true);
    try {
      const p = {
        nombre: form.nombre.trim(),
        tipo: form.tipo,
        descripcion: form.descripcion.trim(),
        tiposMaquina: form.tiposMaquina,  // [] = aplica a todos los tipos
        updatedAt: serverTimestamp(),
      };
      if (editId) await updateDoc(doc(db, 'actividades_disponibles', editId), p);
      else await addDoc(collection(db, 'actividades_disponibles'), { ...p, createdAt: serverTimestamp() });
      setModal(false);
      load();
    } catch (e) { alert('Error al guardar: ' + e.message); }
    setSaving(false);
  };

  const del = async () => {
    try { await deleteDoc(doc(db, 'actividades_disponibles', confirm.id)); load(); } catch (e) { alert('Error: ' + e.message); }
    setConfirm(null);
  };

  return (
    <>
      <SectionCard title="Actividades" subtitle="Opciones disponibles en el formulario de reporte" count={data.length} color="green" onAdd={openNew} addLabel="Nueva Actividad"
        icon={<svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg>}
      >
        <DataTable loading={loading} data={data} onEdit={openEdit} onDelete={setConfirm} emptyText="No hay actividades registradas"
          columns={[
            { key: 'nombre', label: 'Nombre' },
            { key: 'tipo', label: 'Tipo', render: r => (
              <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-bold ${TIPO_STYLES[r.tipo] || TIPO_STYLES.efectiva}`}>
                {TIPO_LABELS[r.tipo] || r.tipo}
              </span>
            )},
            { key: 'tiposMaquina', label: 'Máquinas', render: r => (
              r.tiposMaquina?.length
                ? <div className="flex flex-wrap gap-1">
                    {r.tiposMaquina.map(t => (
                      <span key={t} className="inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-100">{t}</span>
                    ))}
                  </div>
                : <span className="text-xs text-slate-400 italic">Todas</span>
            )},
          ]}
        />
      </SectionCard>

      <Modal isOpen={modal} onClose={() => setModal(false)} title={editId ? 'Editar Actividad' : 'Nueva Actividad'} color="green">
        <div className="space-y-4">
          <Field label="Nombre" required>
            <input className={inputCls} value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} placeholder="Ej: Trabajos en Plataforma" />
          </Field>

          <Field label="Tipo de Registro" required>
            <select className={selectCls} value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value })}>
              <option value="efectiva">Actividad Efectiva</option>
              <option value="no_efectiva">Tiempo No Efectivo</option>
              <option value="mantencion">Mantención</option>
            </select>
          </Field>

          <Field label="Aplica a tipos de máquina">
            <p className="text-xs text-slate-400 mb-2">Sin selección = aplica a <strong>todas</strong> las máquinas</p>
            <div className="grid grid-cols-2 gap-2">
              {TIPOS_MAQUINA.map(tipo => {
                const selected = form.tiposMaquina.includes(tipo);
                return (
                  <button
                    key={tipo}
                    type="button"
                    onClick={() => toggleTipo(tipo)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold border-2 transition-all text-left ${
                      selected
                        ? 'bg-purple-600 border-purple-600 text-white shadow-md shadow-purple-100'
                        : 'bg-white border-slate-200 text-slate-600 hover:border-purple-300'
                    }`}
                  >
                    <span className={`w-3.5 h-3.5 rounded flex items-center justify-center flex-shrink-0 border-2 ${selected ? 'bg-white border-white' : 'border-slate-300'}`}>
                      {selected && <svg className="w-2.5 h-2.5 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                    </span>
                    {tipo}
                  </button>
                );
              })}
            </div>
          </Field>

          <Field label="Descripción">
            <input className={inputCls} value={form.descripcion} onChange={e => setForm({ ...form, descripcion: e.target.value })} placeholder="Descripción opcional..." />
          </Field>

          <FormButtons onCancel={() => setModal(false)} onSave={save} saving={saving} isEdit={!!editId} color="green" />
        </div>
      </Modal>
      <ConfirmDialog isOpen={!!confirm} onClose={() => setConfirm(null)} onConfirm={del} title="Eliminar Actividad" message={`¿Eliminar "${confirm?.nombre}"?`} />
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// SECCIÓN: SURTIDORES
// ─────────────────────────────────────────────────────────────
function SurtidoresSection() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [form, setForm] = useState({ nombre: '', patente: '', capacidad: '', tipo: '' });
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, 'equipos_surtidores'));
      setData(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch { setData([]); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const openNew = () => { setForm({ nombre: '', patente: '', capacidad: '', tipo: '' }); setEditId(null); setModal(true); };
  const openEdit = (row) => { setForm({ nombre: row.nombre || '', patente: row.patente || '', capacidad: row.capacidad || '', tipo: row.tipo || '' }); setEditId(row.id); setModal(true); };

  const save = async () => {
    if (!form.nombre.trim()) return alert('El nombre es obligatorio');
    setSaving(true);
    try {
      const p = { nombre: form.nombre.trim(), patente: form.patente.trim().toUpperCase(), capacidad: form.capacidad, tipo: form.tipo.trim(), updatedAt: serverTimestamp() };
      if (editId) await updateDoc(doc(db, 'equipos_surtidores', editId), p);
      else await addDoc(collection(db, 'equipos_surtidores'), { ...p, createdAt: serverTimestamp() });
      setModal(false); load();
    } catch (e) { alert('Error: ' + e.message); }
    setSaving(false);
  };

  const del = async () => {
    try { await deleteDoc(doc(db, 'equipos_surtidores', confirm.id)); load(); } catch (e) { alert('Error: ' + e.message); }
    setConfirm(null);
  };

  return (
    <>
      <SectionCard title="Surtidores" subtitle="Equipos surtidores de combustible" count={data.length} color="amber" onAdd={openNew} addLabel="Nuevo Surtidor"
        icon={<svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" /></svg>}
      >
        <DataTable loading={loading} data={data} onEdit={openEdit} onDelete={setConfirm} emptyText="No hay surtidores registrados"
          columns={[
            { key: 'nombre', label: 'Nombre' },
            { key: 'patente', label: 'Patente', render: r => <span className="font-mono font-bold text-amber-700">{r.patente || '—'}</span> },
            { key: 'tipo', label: 'Tipo' },
            { key: 'capacidad', label: 'Capacidad', render: r => r.capacidad ? `${r.capacidad} L` : '—' },
          ]}
        />
      </SectionCard>

      <Modal isOpen={modal} onClose={() => setModal(false)} title={editId ? 'Editar Surtidor' : 'Nuevo Surtidor'} color="amber">
        <div className="space-y-4">
          <Field label="Nombre" required><input className={inputCls} value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} placeholder="Ej: Camión Surtidor 1" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Patente"><input className={inputCls} value={form.patente} onChange={e => setForm({ ...form, patente: e.target.value })} placeholder="Ej: BCDF12" /></Field>
            <Field label="Capacidad (L)"><input className={inputCls} type="number" value={form.capacidad} onChange={e => setForm({ ...form, capacidad: e.target.value })} placeholder="5000" /></Field>
          </div>
          <Field label="Tipo"><input className={inputCls} value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value })} placeholder="Ej: Camión Aljibe" /></Field>
          <FormButtons onCancel={() => setModal(false)} onSave={save} saving={saving} isEdit={!!editId} color="amber" />
        </div>
      </Modal>
      <ConfirmDialog isOpen={!!confirm} onClose={() => setConfirm(null)} onConfirm={del} title="Eliminar Surtidor" message={`¿Eliminar "${confirm?.nombre}"?`} />
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// SECCIÓN: EMPRESAS
// ─────────────────────────────────────────────────────────────
function EmpresasSection() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [form, setForm] = useState({ nombre: '', rut: '', giro: '', contacto: '' });
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, 'empresas_combustible'), orderBy('nombre')));
      setData(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch { setData([]); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const openNew = () => { setForm({ nombre: '', rut: '', giro: '', contacto: '' }); setEditId(null); setModal(true); };
  const openEdit = (row) => { setForm({ nombre: row.nombre || '', rut: row.rut || '', giro: row.giro || '', contacto: row.contacto || '' }); setEditId(row.id); setModal(true); };

  const save = async () => {
    if (!form.nombre.trim()) return alert('El nombre es obligatorio');
    setSaving(true);
    try {
      const p = { nombre: form.nombre.trim(), rut: form.rut.trim(), giro: form.giro.trim(), contacto: form.contacto.trim(), updatedAt: serverTimestamp() };
      if (editId) await updateDoc(doc(db, 'empresas_combustible', editId), p);
      else await addDoc(collection(db, 'empresas_combustible'), { ...p, createdAt: serverTimestamp() });
      setModal(false); load();
    } catch (e) { alert('Error: ' + e.message); }
    setSaving(false);
  };

  const del = async () => {
    try { await deleteDoc(doc(db, 'empresas_combustible', confirm.id)); load(); } catch (e) { alert('Error: ' + e.message); }
    setConfirm(null);
  };

  return (
    <>
      <SectionCard title="Empresas" subtitle="Empresas habilitadas para recibir combustible" count={data.length} color="teal" onAdd={openNew} addLabel="Nueva Empresa"
        icon={<svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>}
      >
        <DataTable loading={loading} data={data} onEdit={openEdit} onDelete={setConfirm} emptyText="No hay empresas registradas"
          columns={[
            { key: 'nombre', label: 'Nombre' },
            { key: 'rut', label: 'RUT' },
            { key: 'giro', label: 'Giro' },
            { key: 'contacto', label: 'Contacto' },
          ]}
        />
      </SectionCard>

      <Modal isOpen={modal} onClose={() => setModal(false)} title={editId ? 'Editar Empresa' : 'Nueva Empresa'} color="teal">
        <div className="space-y-4">
          <Field label="Nombre" required><input className={inputCls} value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} placeholder="Ej: LIFEMED SpA" /></Field>
          <Field label="RUT"><input className={inputCls} value={form.rut} onChange={e => setForm({ ...form, rut: e.target.value })} placeholder="Ej: 77.123.456-7" /></Field>
          <Field label="Giro"><input className={inputCls} value={form.giro} onChange={e => setForm({ ...form, giro: e.target.value })} placeholder="Ej: Construcción" /></Field>
          <Field label="Contacto"><input className={inputCls} value={form.contacto} onChange={e => setForm({ ...form, contacto: e.target.value })} placeholder="Ej: nombre@empresa.cl" /></Field>
          <FormButtons onCancel={() => setModal(false)} onSave={save} saving={saving} isEdit={!!editId} color="teal" />
        </div>
      </Modal>
      <ConfirmDialog isOpen={!!confirm} onClose={() => setConfirm(null)} onConfirm={del} title="Eliminar Empresa" message={`¿Eliminar "${confirm?.nombre}"?`} />
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// SECCIÓN: PROYECTOS
// ─────────────────────────────────────────────────────────────
function ProyectosSection() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [form, setForm] = useState({ name: '', codigo: '', mandante: '', ubicacion: '' });
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, 'projects'), orderBy('name')));
      setData(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch { setData([]); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const openNew = () => { setForm({ name: '', codigo: '', mandante: '', ubicacion: '' }); setEditId(null); setModal(true); };
  const openEdit = (row) => { setForm({ name: row.name || '', codigo: row.codigo || '', mandante: row.mandante || '', ubicacion: row.ubicacion || '' }); setEditId(row.id); setModal(true); };

  const save = async () => {
    if (!form.name.trim()) return alert('El nombre es obligatorio');
    setSaving(true);
    try {
      const p = { name: form.name.trim(), codigo: form.codigo.trim(), mandante: form.mandante.trim(), ubicacion: form.ubicacion.trim(), updatedAt: serverTimestamp() };
      if (editId) await updateDoc(doc(db, 'projects', editId), p);
      else await addDoc(collection(db, 'projects'), { ...p, createdAt: serverTimestamp() });
      setModal(false); load();
    } catch (e) { alert('Error: ' + e.message); }
    setSaving(false);
  };

  const del = async () => {
    try { await deleteDoc(doc(db, 'projects', confirm.id)); load(); } catch (e) { alert('Error: ' + e.message); }
    setConfirm(null);
  };

  return (
    <>
      <SectionCard title="Proyectos" subtitle="Proyectos y obras activas" count={data.length} color="indigo" onAdd={openNew} addLabel="Nuevo Proyecto"
        icon={<svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>}
      >
        <DataTable loading={loading} data={data} onEdit={openEdit} onDelete={setConfirm} emptyText="No hay proyectos registrados"
          columns={[
            { key: 'name', label: 'Nombre' },
            { key: 'codigo', label: 'Código' },
            { key: 'mandante', label: 'Mandante' },
            { key: 'ubicacion', label: 'Ubicación' },
          ]}
        />
      </SectionCard>

      <Modal isOpen={modal} onClose={() => setModal(false)} title={editId ? 'Editar Proyecto' : 'Nuevo Proyecto'} color="indigo">
        <div className="space-y-4">
          <Field label="Nombre" required><input className={inputCls} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Ej: Proyecto Ruta 5 Norte" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Código"><input className={inputCls} value={form.codigo} onChange={e => setForm({ ...form, codigo: e.target.value })} placeholder="PRY-001" /></Field>
            <Field label="Mandante"><input className={inputCls} value={form.mandante} onChange={e => setForm({ ...form, mandante: e.target.value })} placeholder="Ej: MOP" /></Field>
          </div>
          <Field label="Ubicación"><input className={inputCls} value={form.ubicacion} onChange={e => setForm({ ...form, ubicacion: e.target.value })} placeholder="Ej: Antofagasta, II Región" /></Field>
          <FormButtons onCancel={() => setModal(false)} onSave={save} saving={saving} isEdit={!!editId} color="indigo" />
        </div>
      </Modal>
      <ConfirmDialog isOpen={!!confirm} onClose={() => setConfirm(null)} onConfirm={del} title="Eliminar Proyecto" message={`¿Eliminar "${confirm?.name}"?`} />
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// SECCIÓN: USUARIOS
// ─────────────────────────────────────────────────────────────
function UsuariosSection() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [qr, setQr] = useState(null);
  const [form, setForm] = useState({ role: 'operador', nombre: '', rut: '' });
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, 'users'));
      setData(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch { setData([]); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const openEdit = (row) => {
    setForm({ role: row.role || 'operador', nombre: row.nombre || '', rut: row.rut || '', password: row.password || '' });
    setEditId(row.id);
    setModal(true);
  };

  const openQR = (row) => {
    const email = row.email || row.id;
    const password = row.password || '';
    if (!password) {
      alert('Este usuario no tiene contraseña guardada. Agrégala editando el usuario primero.');
      return;
    }
    setQr({ title: row.nombre || email, qrText: JSON.stringify({ email, password }) });
  };

  const save = async () => {
    setSaving(true);
    try {
      const updates = {
        role: form.role,
        nombre: form.nombre.trim(),
        rut: form.rut.trim(),
        updatedAt: serverTimestamp(),
      };
      if (form.password.trim()) updates.password = form.password.trim();
      await updateDoc(doc(db, 'users', editId), updates);
      setModal(false); load();
    } catch (e) { alert('Error: ' + e.message); }
    setSaving(false);
  };

  const QRBtn = (row) => (
    <button onClick={() => openQR(row)} className="p-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 rounded-lg transition-colors" title="Ver QR">
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
      </svg>
    </button>
  );

  return (
    <>
      <SectionCard title="Usuarios" subtitle="Gestión de accesos y roles del sistema" count={data.length} color="rose"
        icon={<svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>}
      >
        <div className="mb-4 flex items-start gap-2 p-3 bg-blue-50 border border-blue-100 rounded-xl">
          <svg className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          <p className="text-xs text-blue-600">El <strong>QR</strong> contiene email y contraseña en formato JSON para login directo. Solo disponible para cuentas creadas con email/password (no Google).</p>
        </div>
        <DataTable loading={loading} data={data} onEdit={openEdit} onDelete={null} extraAction={QRBtn} emptyText="No hay usuarios registrados"
          columns={[
            { key: 'email', label: 'Email', render: r => <span className="font-mono text-xs text-slate-600">{r.email || r.id}</span> },
            { key: 'nombre', label: 'Nombre' },
            { key: 'role', label: 'Rol', render: r => <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-bold ${ROLE_STYLES[r.role] || ROLE_STYLES.operador}`}>{r.role || 'operador'}</span> },
          ]}
        />
      </SectionCard>

      <Modal isOpen={modal} onClose={() => setModal(false)} title="Editar Usuario" color="rose">
        <div className="space-y-4">
          <Field label="Nombre Completo"><input className={inputCls} value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} placeholder="Nombre del usuario" /></Field>
          <Field label="RUT"><input className={inputCls} value={form.rut} onChange={e => setForm({ ...form, rut: e.target.value })} placeholder="Ej: 12.345.678-9" /></Field>
          <Field label="Contraseña para QR">
            <input className={inputCls} type="text" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder="Contraseña del usuario (para generar QR)" />
            <p className="text-[11px] text-slate-400 mt-1">Se guarda en Firestore para poder generar el QR de acceso. Déjalo vacío si no deseas modificarla.</p>
          </Field>
          <Field label="Rol" required>
            <select className={selectCls} value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
              {ROLES.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
            </select>
          </Field>
          <div className={`p-3 rounded-xl text-xs font-medium ${
            form.role === 'administrador' ? 'bg-purple-50 text-purple-700 border border-purple-100' :
            form.role === 'operador'      ? 'bg-blue-50 text-blue-700 border border-blue-100' :
                                           'bg-amber-50 text-amber-700 border border-amber-100'
          }`}>
            {form.role === 'administrador' && '⚡ Acceso completo — puede administrar todo el sistema.'}
            {form.role === 'operador'      && '🔧 Puede crear y ver reportes de maquinaria y combustible.'}
            {form.role === 'mandante'      && '👁️ Solo puede ver el Reporte WorkFleet. Sin acceso a edición.'}
          </div>
          <FormButtons onCancel={() => setModal(false)} onSave={save} saving={saving} isEdit={true} color="rose" />
        </div>
      </Modal>
      <QRCard isOpen={!!qr} onClose={() => setQr(null)} title={qr?.title} qrText={qr?.qrText} />
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// COMPONENTE PRINCIPAL
// ─────────────────────────────────────────────────────────────
export default function AdminPanel() {
  const [activeTab, setActiveTab] = useState('operadores');
  const active = TAB_DEFS.find(t => t.id === activeTab);

  return (
    <div className="min-h-screen bg-slate-50">

      {/* Header negro con tabs integrados — igual que imagen 1 */}
      <div className="bg-gradient-to-r from-slate-900 to-slate-800 shadow-xl">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-5 sm:py-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-white">Administración</h1>
              <p className="text-xs text-slate-400 mt-0.5">Gestión de datos del sistema WorkFleet</p>
            </div>
          </div>
        </div>

        {/* Tabs dentro del header negro */}
        <div className="max-w-5xl mx-auto px-2 sm:px-6">
          <div className="flex gap-1 overflow-x-auto scrollbar-none">
            {TAB_DEFS.map(tab => {
              const isActive = activeTab === tab.id;
              const grad = GRADIENTS[tab.color];
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-3 text-xs sm:text-sm font-bold whitespace-nowrap transition-all flex-shrink-0 rounded-t-xl ${
                    isActive
                      ? `bg-gradient-to-r ${grad} text-white shadow-lg`
                      : 'text-slate-400 hover:text-white hover:bg-white/10'
                  }`}
                >
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d={tab.icon} />
                  </svg>
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Contenido */}
      <div className="max-w-5xl mx-auto px-3 sm:px-6 py-6 sm:py-8">
        {activeTab === 'operadores'  && <OperadoresSection />}
        {activeTab === 'maquinas'    && <MaquinasSection />}
        {activeTab === 'actividades' && <ActividadesSection />}
        {activeTab === 'surtidores'  && <SurtidoresSection />}
        {activeTab === 'empresas'    && <EmpresasSection />}
        {activeTab === 'proyectos'   && <ProyectosSection />}
        {activeTab === 'usuarios'    && <UsuariosSection />}
      </div>
    </div>
  );
}
