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
const TIPOS_MAQUINA = ['Excavadora', 'Bulldozer', 'Motoniveladora', 'Retroexcavadora', 'Cargador Frontal', 'Grúa', 'Camión', 'Camión de Combustible', 'Otro'];

const TAB_DEFS = [
  { id: 'operadores',  label: 'Operadores',  color: 'blue',   icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z' },
  { id: 'maquinas',    label: 'Máquinas',    color: 'purple', icon: 'M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z' },
  { id: 'actividades', label: 'Actividades', color: 'green',  icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01' },
  { id: 'surtidores',  label: 'Surtidores',  color: 'amber',  icon: 'M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z' },
  { id: 'empresas',    label: 'Empresas',    color: 'teal',   icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4' },
  { id: 'proyectos',   label: 'Proyectos',   color: 'indigo', icon: 'M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z' },
  { id: 'estaciones',  label: 'Est. Combustible', color: 'cyan', icon: 'M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z' },
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
  cyan:   'from-cyan-500 to-teal-600',
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
  cyan:   'bg-cyan-600 text-white shadow-lg shadow-cyan-200',
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
function QRCard({ isOpen, onClose, title, qrText, code = '', patente = '' }) {
  const [qrReady, setQrReady] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [building, setBuilding] = useState(false);

  useEffect(() => {
    if (isOpen) { setQrReady(false); setPreviewUrl(null); buildQR(); }
  }, [isOpen, qrText]);

  const buildQR = () => {
    setBuilding(true);
    const QR_API = `https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${encodeURIComponent(qrText)}&ecc=H&margin=8`;
    const LOGO_SRC = '/logo-mpf.jpg';

    const canvas = document.createElement('canvas');
    const W = 800, PAD = 52;
    const HEADER_H = 120, QR_AREA = 580, FOOTER_H = 140;
    canvas.width = W;
    canvas.height = HEADER_H + QR_AREA + FOOTER_H;
    const ctx = canvas.getContext('2d');

    const render = (qrImg, logoImg) => {
      const H = canvas.height;

      // ── Fondo completo oscuro ──
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, W, H);

      // ── Franja naranja top ──
      ctx.fillStyle = '#f97316';
      ctx.fillRect(0, 0, W, 6);

      // ── Header ──
      ctx.fillStyle = '#64748b';
      ctx.font = '500 20px -apple-system, system-ui, Arial';
      ctx.textAlign = 'left';
      ctx.fillText('MPF INGENIERÍA CIVIL', PAD, 52);

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 40px -apple-system, system-ui, Arial';
      ctx.fillText(title || qrText, PAD, 102);

      // Línea separadora
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(PAD, HEADER_H);
      ctx.lineTo(W - PAD, HEADER_H);
      ctx.stroke();

      // ── Área QR (fondo ligeramente más claro) ──
      ctx.fillStyle = '#111827';
      ctx.fillRect(0, HEADER_H, W, QR_AREA);

      const QR_SIZE = 480;
      const qrX = (W - QR_SIZE) / 2;
      const qrY = HEADER_H + (QR_AREA - QR_SIZE) / 2;

      // Sombra / borde blanco alrededor del QR
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(qrX - 16, qrY - 16, QR_SIZE + 32, QR_SIZE + 32, 24);
      } else {
        ctx.rect(qrX - 16, qrY - 16, QR_SIZE + 32, QR_SIZE + 32);
      }
      ctx.fill();

      // QR image
      ctx.drawImage(qrImg, qrX, qrY, QR_SIZE, QR_SIZE);

      // ── Logo centrado sobre el QR ──
      const BOX = 96;
      const lx = qrX + (QR_SIZE - BOX) / 2;
      const ly = qrY + (QR_SIZE - BOX) / 2;

      // Fondo blanco del logo
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(lx - 10, ly - 10, BOX + 20, BOX + 20, 14);
      } else {
        ctx.rect(lx - 10, ly - 10, BOX + 20, BOX + 20);
      }
      ctx.fill();

      if (logoImg) {
        const aspect = logoImg.width / logoImg.height;
        const lw = aspect >= 1 ? BOX : BOX * aspect;
        const lh = aspect >= 1 ? BOX / aspect : BOX;
        ctx.drawImage(logoImg, lx + (BOX - lw) / 2, ly + (BOX - lh) / 2, lw, lh);
      } else {
        ctx.fillStyle = '#0f172a';
        ctx.font = 'bold 30px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('MPF', lx + BOX / 2, ly + BOX / 2 + 10);
      }

      // ── Footer ──
      const fy = HEADER_H + QR_AREA;

      // Línea naranja separadora
      ctx.fillStyle = '#f97316';
      ctx.fillRect(PAD, fy + 20, 3, 90);

      // Código — izquierda
      ctx.textAlign = 'left';
      ctx.fillStyle = '#94a3b8';
      ctx.font = '600 18px -apple-system, system-ui, Arial';
      ctx.fillText('CÓDIGO', PAD + 20, fy + 52);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 42px -apple-system, system-ui, Arial';
      ctx.fillText(code || qrText, PAD + 20, fy + 106);

      // Patente — derecha
      if (patente) {
        ctx.fillStyle = '#f97316';
        ctx.fillRect(W - PAD - 3, fy + 20, 3, 90);

        ctx.textAlign = 'right';
        ctx.fillStyle = '#94a3b8';
        ctx.font = '600 18px -apple-system, system-ui, Arial';
        ctx.fillText('PATENTE', W - PAD - 20, fy + 52);
        ctx.fillStyle = '#f97316';
        ctx.font = 'bold 42px -apple-system, system-ui, Arial';
        ctx.fillText(patente, W - PAD - 20, fy + 106);
      }

      const url = canvas.toDataURL('image/png');
      setPreviewUrl(url);
      setQrReady(true);
      setBuilding(false);
    };

    // Cargar QR
    const qrImg = new Image();
    qrImg.crossOrigin = 'anonymous';
    qrImg.src = QR_API;
    qrImg.onload = () => {
      // Cargar logo
      const logoImg = new Image();
      logoImg.crossOrigin = 'anonymous';
      logoImg.src = LOGO_SRC;
      logoImg.onload = () => render(qrImg, logoImg);
      logoImg.onerror = () => render(qrImg, null);
    };
    qrImg.onerror = () => { setBuilding(false); };
  };

  const downloadPNG = () => {
    if (!previewUrl) return;
    const a = document.createElement('a');
    a.href = previewUrl;
    a.download = `QR_MPF_${(code || qrText).replace(/[^a-zA-Z0-9_-]/g, '_')}.png`;
    a.click();
  };

  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:max-w-sm bg-[#0f172a] rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden border border-slate-700">

        {/* Header modal */}
        <div className="px-5 py-4 flex items-center justify-between border-b border-slate-700">
          <div>
            <p className="text-[11px] text-orange-400 uppercase tracking-widest font-bold">Código QR · Máquina</p>
            <h3 className="text-base font-black text-white truncate mt-0.5">{title}</h3>
          </div>
          <button onClick={onClose} className="w-8 h-8 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-lg flex items-center justify-center transition-colors ml-3 flex-shrink-0">
            <svg className="w-4 h-4 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-5 flex flex-col gap-4">
          {/* Preview */}
          <div className="w-full rounded-xl overflow-hidden border border-slate-700 shadow-xl bg-slate-800" style={{minHeight: 200}}>
            {building || !qrReady ? (
              <div className="flex flex-col items-center justify-center py-14 gap-3">
                <div className="w-9 h-9 border-2 border-orange-500/30 border-t-orange-500 rounded-full animate-spin" />
                <p className="text-slate-400 text-sm font-medium">Generando QR...</p>
              </div>
            ) : (
              <img src={previewUrl} alt="QR Preview" className="w-full h-auto" />
            )}
          </div>

          {/* Info chips */}
          <div className="flex gap-2">
            <div className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Código</p>
              <p className="text-sm font-mono font-black text-white mt-0.5">{code || qrText}</p>
            </div>
            {patente && (
              <div className="flex-1 bg-orange-500/10 border border-orange-500/30 rounded-xl px-3 py-2.5">
                <p className="text-[10px] font-bold text-orange-400 uppercase tracking-wider">Patente</p>
                <p className="text-sm font-mono font-black text-orange-300 mt-0.5">{patente}</p>
              </div>
            )}
          </div>

          {/* Botón descarga */}
          <button
            onClick={downloadPNG}
            disabled={!qrReady}
            className="w-full flex items-center justify-center gap-2 py-3.5 bg-orange-500 hover:bg-orange-400 disabled:bg-slate-700 disabled:text-slate-500 text-white font-bold text-sm rounded-xl transition-all shadow-lg"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            {qrReady ? 'Descargar PNG' : 'Generando...'}
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
      <table className="w-full min-w-[900px]">
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
                <td key={col.key} className="px-4 py-3 text-sm text-slate-700 uppercase">
                  {col.render ? col.render(row) : (row[col.key] || <span className="text-slate-300 text-xs italic normal-case">—</span>)}
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
// Helper para formatear RUT chileno en tiempo real
const CARGOS_LIST = ['Conductor camion tolva','Operador de maquinaria pesada','Soldador','Conductor camion combustible','Mecanico','Administrador de contrato','Encargado de logistica','Supervisor mecanico','Prevencionista de riesgos','Operador reemplazo'];

function fmtRut(raw) {
  // Limpiar todo excepto dígitos y K/k
  let v = raw.replace(/[^0-9kK]/g, '').toUpperCase();
  if (v.length < 2) return v;
  const dv  = v.slice(-1);
  const num = v.slice(0, -1).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return num + '-' + dv;
}

function OperadoresSection() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [form, setForm] = useState({ nombres: '', apellidoPaterno: '', apellidoMaterno: '', rut: '', cargo: '', empresa: '', esSurtidor: false });
  const [cargoCustom, setCargoCustom] = useState('');
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [busquedaOp, setBusquedaOp] = useState('');
  const [filtroEmpresaOp, setFiltroEmpresaOp] = useState('');
  const [catCargoModal, setCatCargoModal] = useState(false);

  // Catálogo dinámico de cargos
  const { items: cargosDB } = useCatalogo('cargo_operador');
  const CARGOS_TODOS = [...new Set([...CARGOS_LIST, ...cargosDB.map(c=>c.nombre)])].sort();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, 'employees'), orderBy('nombre')));
      setData(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch { setData([]); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const openNew = () => { setForm({ nombres: '', apellidoPaterno: '', apellidoMaterno: '', rut: '', cargo: '', empresa: '', esSurtidor: false }); setCargoCustom(''); setEditId(null); setModal(true); };
  const openEdit = (row) => {
    const cargo = row.cargo || '';
    const isCustom = cargo && !CARGOS_LIST.includes(cargo);
    setForm({
      nombres: row.nombres || row.nombre?.split(' ').slice(0,-2).join(' ') || row.nombre || '',
      apellidoPaterno: row.apellidoPaterno || row.nombre?.split(' ').slice(-2,-1)[0] || '',
      apellidoMaterno: row.apellidoMaterno || row.nombre?.split(' ').slice(-1)[0] || '',
      rut: row.rut || '', cargo: isCustom ? 'otro' : cargo,
      empresa: row.empresa || '', esSurtidor: row.esSurtidor || false
    });
    setCargoCustom(isCustom ? cargo : '');
    setEditId(row.id); setModal(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const cargoFinal = form.cargo === 'otro' ? cargoCustom.trim() : form.cargo.trim();
      const nombreCompleto = [form.nombres, form.apellidoPaterno, form.apellidoMaterno].filter(Boolean).map(s=>s.trim()).join(' ');
      const p = { nombres: form.nombres.trim(), apellidoPaterno: form.apellidoPaterno.trim(), apellidoMaterno: form.apellidoMaterno.trim(), nombre: nombreCompleto, rut: form.rut.trim(), cargo: cargoFinal, empresa: form.empresa.trim(), esSurtidor: form.esSurtidor, updatedAt: serverTimestamp() };
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
        <div className="flex flex-col sm:flex-row gap-2 mb-4">
          <div className="relative flex-1">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z"/></svg>
            <input className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-400" placeholder="Buscar por nombre, RUT o cargo..." value={busquedaOp} onChange={e => setBusquedaOp(e.target.value)} />
          </div>
          <select className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-400 bg-white" value={filtroEmpresaOp} onChange={e => setFiltroEmpresaOp(e.target.value)}>
            <option value="">Todas las empresas</option>
            {['LifeMed','Intosim','Río Tinto','Global','Celenor','MPF Ingeniería Civil'].map(e => <option key={e} value={e}>{e}</option>)}
          </select>
        </div>
        <DataTable loading={loading} data={data.filter(r => {
          const q = busquedaOp.toLowerCase();
          const matchQ = !q || r.nombre?.toLowerCase().includes(q) || r.rut?.includes(busquedaOp) || r.cargo?.toLowerCase().includes(q);
          const matchE = !filtroEmpresaOp || r.empresa === filtroEmpresaOp;
          return matchQ && matchE;
        })} onEdit={openEdit} onDelete={setConfirm} emptyText="No hay operadores registrados"
          columns={[
            { key: 'nombres', label: 'Nombres', render: r => <span>{r.nombres || r.nombre?.split(' ').slice(0,-2).join(' ') || r.nombre || '—'}</span> },
            { key: 'rut', label: 'RUT' },
            { key: 'cargo', label: 'Cargo', render: r => (<div className="flex items-center gap-2"><span>{r.cargo || '-'}</span>{r.esSurtidor && <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 text-[10px] font-bold rounded-full border border-amber-300">Surtidor</span>}</div>) },
            { key: 'empresa', label: 'Empresa' },
          ]}
        />
      </SectionCard>

      <Modal isOpen={modal} onClose={() => setModal(false)} title={editId ? 'Editar Operador' : 'Nuevo Operador'} color="blue">
        <div className="space-y-4">
          <Field label="Nombres" required>
            <input
              className={inputCls}
              value={form.nombres}
              onChange={e => setForm({ ...form, nombres: e.target.value.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s]/g, '') })}
              placeholder="Ej: Juan Carlos"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Apellido Paterno" required>
              <input
                className={inputCls}
                value={form.apellidoPaterno}
                onChange={e => setForm({ ...form, apellidoPaterno: e.target.value.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s]/g, '') })}
                placeholder="Ej: Pérez"
              />
            </Field>
            <Field label="Apellido Materno">
              <input
                className={inputCls}
                value={form.apellidoMaterno}
                onChange={e => setForm({ ...form, apellidoMaterno: e.target.value.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s]/g, '') })}
                placeholder="Ej: González"
              />
            </Field>
          </div>

          <Field label="RUT">
            <input
              className={inputCls}
              value={form.rut}
              onChange={e => {
                // Solo dígitos y K; auto-formato XX.XXX.XXX-X
                const raw = e.target.value.replace(/[^0-9kK]/g, '');
                setForm({ ...form, rut: fmtRut(raw) });
              }}
              placeholder="Ej: 12.345.678-9"
              maxLength={12}
            />
          </Field>

          <Field label="Cargo">
            <div className="flex gap-2">
              <select className={inputCls} style={{flex:1}} value={form.cargo} onChange={e => setForm({ ...form, cargo: e.target.value })}>
                <option value="">Seleccione cargo</option>
                {CARGOS_TODOS.map(c => <option key={c} value={c}>{c}</option>)}
                <option value="otro">Otro...</option>
              </select>
              <button type="button" onClick={() => setCatCargoModal(true)}
                className="flex-shrink-0 px-3 py-2.5 text-xs font-black rounded-xl transition-all"
                style={{background:'rgba(59,130,246,0.08)', color:'#2563eb', border:'1px solid rgba(59,130,246,0.2)'}}>
                + Crear
              </button>
            </div>
            {form.cargo === 'otro' && (
              <input className={inputCls + ' mt-2'} value={cargoCustom}
                onChange={e => setCargoCustom(e.target.value)} placeholder="Escribe el cargo..." />
            )}
          </Field>
          <Field label="Empresa">
            <select className={inputCls} value={form.empresa} onChange={e => setForm({ ...form, empresa: e.target.value })}>
              <option value="">Seleccione empresa</option>
              <option value="LifeMed">LifeMed</option>
              <option value="Intosim">Intosim</option>
              <option value="Río Tinto">Río Tinto</option>
              <option value="Global">Global</option>
              <option value="Celenor">Celenor</option>
              <option value="MPF Ingeniería Civil">MPF Ingeniería Civil</option>
              {form.empresa && !['LifeMed','Intosim','Río Tinto','Global','Celenor','MPF Ingeniería Civil',''].includes(form.empresa) && (
                <option value={form.empresa}>{form.empresa}</option>
              )}
            </select>
          </Field>
          <label className="flex items-center gap-3 p-3 bg-amber-50 border-2 border-amber-200 rounded-xl cursor-pointer hover:bg-amber-100 transition-all select-none">
            <input type="checkbox" checked={form.esSurtidor} onChange={e => setForm({ ...form, esSurtidor: e.target.checked })} className="w-4 h-4 rounded accent-amber-500" />
            <div>
              <div className="font-bold text-amber-900 text-sm">Surtidor de Combustible</div>
              <div className="text-xs text-amber-700 mt-0.5">Este operador puede ser asignado como repartidor de combustible</div>
            </div>
          </label>
          <FormButtons onCancel={() => setModal(false)} onSave={save} saving={saving} isEdit={!!editId} color="blue" />
        </div>
      </Modal>
      {/* Modal catálogo cargos */}
      <CatalogoModal
        isOpen={catCargoModal}
        onClose={() => setCatCargoModal(false)}
        categoria="cargo_operador"
        titulo="Cargos de operadores"
      />

      <ConfirmDialog isOpen={!!confirm} onClose={() => setConfirm(null)} onConfirm={del} title="Eliminar Operador" message={`¿Eliminar a "${confirm?.nombre}"?`} />
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// SECCIÓN: MÁQUINAS
// ─────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────
// CATÁLOGO DE MÁQUINAS — Tipos, Marcas, Propietarios dinámicos
// ─────────────────────────────────────────────────────────────

// Hook para cargar una categoría del catálogo
function useCatalogo(categoria) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const snap = await getDocs(query(
        collection(db, 'catalogo_maquinas'),
        orderBy('nombre')
      ));
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setItems(all.filter(x => x.categoria === categoria));
    } catch { setItems([]); }
    setLoading(false);
  }, [categoria]);

  useEffect(() => { load(); }, [load]);

  const add = async (nombre) => {
    if (!nombre.trim()) return;
    await addDoc(collection(db, 'catalogo_maquinas'), {
      nombre: nombre.trim(),
      categoria,
      createdAt: serverTimestamp(),
    });
    load();
  };

  const remove = async (id) => {
    await deleteDoc(doc(db, 'catalogo_maquinas', id));
    load();
  };

  return { items, loading, add, remove };
}

// Panel modal para gestionar una categoría del catálogo
function CatalogoModal({ isOpen, onClose, categoria, titulo }) {
  const { items, loading, add, remove } = useCatalogo(categoria);
  const [nuevo, setNuevo] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmDel, setConfirmDel] = useState(null);

  const handleAdd = async () => {
    if (!nuevo.trim()) return;
    setSaving(true);
    await add(nuevo);
    setNuevo('');
    setSaving(false);
  };

  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{background:'rgba(15,12,41,0.75)', backdropFilter:'blur(12px)'}}>
      <div className="w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl"
        style={{background:'#fff', border:'1px solid rgba(124,58,237,0.15)'}}>

        {/* Header */}
        <div className="px-5 py-4 flex items-center justify-between"
          style={{background:'linear-gradient(135deg, #1e1b4b, #312e81)'}}>
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest" style={{color:'rgba(196,181,253,0.6)'}}>
              Catálogo de máquinas
            </p>
            <h3 className="text-base font-black text-white" style={{letterSpacing:'-0.01em'}}>{titulo}</h3>
          </div>
          <button onClick={onClose}
            className="p-1.5 rounded-lg transition-colors"
            style={{background:'rgba(255,255,255,0.1)'}}>
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        {/* Agregar nuevo */}
        <div className="px-4 py-4 border-b border-slate-100">
          <div className="flex gap-2">
            <input
              className="flex-1 px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
              placeholder={`Nuevo ${titulo.toLowerCase()}...`}
              value={nuevo}
              onChange={e => setNuevo(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
            />
            <button
              onClick={handleAdd}
              disabled={saving || !nuevo.trim()}
              className="px-4 py-2.5 text-white font-bold text-sm rounded-xl disabled:opacity-40 transition-all"
              style={{background:'linear-gradient(135deg, #7c3aed, #4f46e5)', boxShadow:'0 4px 12px rgba(124,58,237,0.3)'}}>
              {saving ? '...' : '+ Agregar'}
            </button>
          </div>
        </div>

        {/* Lista */}
        <div className="overflow-y-auto" style={{maxHeight:'320px'}}>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-6 h-6 rounded-full animate-spin"
                style={{border:'2px solid rgba(124,58,237,0.15)', borderTopColor:'#7c3aed'}}/>
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-sm">
              <p className="text-2xl mb-2">📋</p>
              <p>Sin {titulo.toLowerCase()} registrados</p>
              <p className="text-xs mt-1">Agrega el primero arriba</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-50">
              {items.map(item => (
                <div key={item.id} className="flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors">
                  <span className="text-sm font-semibold text-slate-700">{item.nombre}</span>
                  {confirmDel === item.id ? (
                    <div className="flex gap-1.5">
                      <button onClick={() => setConfirmDel(null)}
                        className="text-xs font-bold px-2 py-1 rounded-lg bg-slate-100 text-slate-600">
                        No
                      </button>
                      <button onClick={async () => { await remove(item.id); setConfirmDel(null); }}
                        className="text-xs font-bold px-2 py-1 rounded-lg bg-red-100 text-red-600">
                        Sí, eliminar
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => setConfirmDel(item.id)}
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-300 hover:bg-red-50 hover:text-red-400 transition-colors">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                      </svg>
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="px-4 py-3 border-t border-slate-100">
          <button onClick={onClose}
            className="w-full py-2.5 font-bold text-sm rounded-xl transition-colors"
            style={{background:'#f1f5f9', color:'#475569'}}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}


// Prefijos de código interno por empresa
const EMPRESA_PREFIJOS = {
  'MPF Ingeniería Civil': 'MPF',
  'LifeMed':   'LM',
  'Intosim':   'IT',
  'Río Tinto': 'RT',
  'Global':    'GL',
  'Celenor':   'CE',
};

// Formatea código interno según empresa: MPF→TSTB36 / resto→AB-CD01
function fmtCodigo(raw, empresa) {
  const isMPF = empresa === 'MPF Ingeniería Civil';
  // Limpiar: solo letras y números, uppercase
  let v = raw.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  if (!v) return '';
  if (isMPF) {
    // Formato MPF: TBJP70 — hasta 6 chars alfanuméricos libres
    return v.slice(0, 8);
  } else {
    // Formato otras empresas: AB-CD01 → 2 letras + '-' + 2 letras + 2 números
    const letras1 = v.replace(/[^A-Z]/g, '').slice(0, 2);
    const letras2 = v.replace(/[^A-Z]/g, '').slice(2, 4);
    const nums    = v.replace(/[^0-9]/g, '').slice(0, 2);
    let result = letras1;
    if (letras2 || nums) result += '-' + letras2;
    if (nums) result += nums;
    return result;
  }
}

// Formatea patente: ABCD-12
function fmtPatente(raw) {
  let v = raw.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  if (!v) return '';
  const letras = v.replace(/[^A-Z]/g, '').slice(0, 4);
  const nums   = v.replace(/[^0-9]/g, '').slice(0, 2);
  if (!letras) return v.slice(0,6);
  return nums ? letras + '-' + nums : letras;
}
function MaquinasSection() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [qr, setQr] = useState(null);
  const [form, setForm] = useState({ name: '', code: '', patente: '', type: '', marca: '', modelo: '', empresa: '', propietario: '' });
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [busquedaMaq, setBusquedaMaq] = useState('');
  const [filtroEmpresaMaq, setFiltroEmpresaMaq] = useState('');

  // Catálogos dinámicos
  const { items: tiposDB,       add: addTipo,        remove: removeTipo }        = useCatalogo('tipo');
  const { items: marcasDB,      add: addMarca,       remove: removeMarca }       = useCatalogo('marca');
  const { items: propietariosDB,add: addPropietario, remove: removePropietario } = useCatalogo('propietario');

  // Combinar estáticos + dinámicos
  const tiposOpciones       = [...new Set([...TIPOS_MAQUINA, ...tiposDB.map(t=>t.nombre)])].sort();
  const marcasOpciones      = [...new Set([...marcasDB.map(m=>m.nombre)])].sort();
  const propietariosOpciones= [...new Set([...propietariosDB.map(p=>p.nombre)])].sort();

  // Estado modales de catálogo
  const [catModal, setCatModal] = useState(null); // 'tipo' | 'marca' | 'propietario'

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, 'machines'), orderBy('name')));
      setData(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch { setData([]); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const openNew = () => { setForm({ name: '', code: '', patente: '', type: '', marca: '', modelo: '', empresa: '', propietario: '' }); setEditId(null); setModal(true); };
  const openEdit = (row) => { setForm({ name: row.name || '', code: row.code || '', patente: row.patente || '', type: row.type || '', marca: row.marca || '', modelo: row.modelo || '', empresa: row.empresa || '', propietario: row.propietario || '' }); setEditId(row.id); setModal(true); };
  const openQR = (row) => setQr({ title: row.code || row.patente, qrText: row.code || row.patente || row.id, code: row.code || '', patente: row.patente || '' });

  const save = async () => {
    setSaving(true);
    try {
      const p = { name: form.name.trim(), code: form.code.trim(), patente: form.patente.trim().toUpperCase(), type: form.type, marca: form.marca.trim(), modelo: form.modelo.trim(), empresa: form.empresa, propietario: form.propietario.trim(), updatedAt: serverTimestamp() };
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
        <div className="flex flex-col sm:flex-row gap-2 mb-4">
          <div className="relative flex-1">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z"/></svg>
            <input className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-purple-400" placeholder="Buscar por código, patente, tipo o marca..." value={busquedaMaq} onChange={e => setBusquedaMaq(e.target.value)} />
          </div>
          <select className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-purple-400 bg-white" value={filtroEmpresaMaq} onChange={e => setFiltroEmpresaMaq(e.target.value)}>
            <option value="">Todas las empresas</option>
            {['LifeMed','Intosim','Río Tinto','Global','Celenor','MPF Ingeniería Civil'].map(e => <option key={e} value={e}>{e}</option>)}
          </select>
        </div>
        <DataTable loading={loading} data={data.filter(r => {
          const q = busquedaMaq.toLowerCase();
          const matchQ = !q || r.code?.toLowerCase().includes(q) || r.patente?.toLowerCase().includes(q) || r.type?.toLowerCase().includes(q) || r.marca?.toLowerCase().includes(q);
          const matchE = !filtroEmpresaMaq || r.empresa === filtroEmpresaMaq;
          return matchQ && matchE;
        })} onEdit={openEdit} onDelete={setConfirm} extraAction={QRBtn} emptyText="No hay máquinas registradas"
          columns={[
            { key: 'code', label: 'Código', render: r => <span className="font-mono font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-lg text-xs">{r.code || r.patente || '—'}</span> },
            { key: 'patente', label: 'Patente', render: r => <span className="font-mono font-bold text-slate-700">{r.patente || '—'}</span> },
            { key: 'type', label: 'Tipo' },
            { key: 'marca', label: 'Marca' },
            { key: 'modelo', label: 'Modelo' },
            { key: 'empresa', label: 'Empresa' },
            { key: 'propietario', label: 'Propietario' },
          ]}
        />
      </SectionCard>

      <Modal isOpen={modal} onClose={() => setModal(false)} title={editId ? 'Editar Máquina' : 'Nueva Máquina'} color="purple">
        <div className="space-y-4">
          {/* ── Empresa PRIMERO para determinar formato código ── */}
          <Field label="Empresa">
            <select className={inputCls} value={form.empresa} onChange={e => setForm({ ...form, empresa: e.target.value, code: '' })}>
              <option value="">Seleccione empresa</option>
              {['LifeMed','Intosim','Río Tinto','Global','Celenor','MPF Ingeniería Civil'].map(e => (
                <option key={e} value={e}>{e}</option>
              ))}
              {form.empresa && !['LifeMed','Intosim','Río Tinto','Global','Celenor','MPF Ingeniería Civil',''].includes(form.empresa) && (
                <option value={form.empresa}>{form.empresa}</option>
              )}
            </select>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label={form.empresa && form.empresa !== 'MPF Ingeniería Civil' ? 'Código Interno (AB-CD01)' : 'Código Interno'}>
              <input
                className={inputCls}
                value={form.code}
                onChange={e => setForm({ ...form, code: fmtCodigo(e.target.value, form.empresa) })}
                placeholder={form.empresa && form.empresa !== 'MPF Ingeniería Civil' ? 'Ej: AB-CD01' : 'Ej: TBJP70'}
                disabled={!form.empresa}
              />
              {!form.empresa && (
                <p className="text-[10px] text-amber-500 mt-1 font-medium">⚠ Selecciona empresa primero</p>
              )}
            </Field>
            <Field label="Patente (ABCD-12)">
              <input
                className={inputCls}
                value={form.patente}
                onChange={e => setForm({ ...form, patente: fmtPatente(e.target.value) })}
                placeholder="Ej: TBJP-70"
                maxLength={7}
              />
            </Field>
          </div>

          {/* ── Tipo con botón gestionar ── */}
          <Field label="Tipo">
            <div className="flex gap-2">
              <select className={selectCls} style={{flex:1}} value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
                <option value="">Seleccionar tipo...</option>
                {tiposOpciones.map(t => <option key={t}>{t}</option>)}
              </select>
              <button type="button" onClick={() => setCatModal('tipo')} title="Gestionar tipos"
                className="flex-shrink-0 px-3 py-2.5 text-xs font-black rounded-xl transition-all"
                style={{background:'rgba(124,58,237,0.08)', color:'#7c3aed', border:'1px solid rgba(124,58,237,0.2)'}}>
                + Crear
              </button>
            </div>
          </Field>

          {/* ── Marca con botón gestionar ── */}
          <Field label="Marca">
            <div className="flex gap-2">
              <select className={selectCls} style={{flex:1}} value={form.marca} onChange={e => setForm({ ...form, marca: e.target.value })}>
                <option value="">Seleccionar marca...</option>
                {marcasOpciones.map(m => <option key={m}>{m}</option>)}
                {form.marca && !marcasOpciones.includes(form.marca) && (
                  <option value={form.marca}>{form.marca}</option>
                )}
              </select>
              <button type="button" onClick={() => setCatModal('marca')} title="Gestionar marcas"
                className="flex-shrink-0 px-3 py-2.5 text-xs font-black rounded-xl transition-all"
                style={{background:'rgba(124,58,237,0.08)', color:'#7c3aed', border:'1px solid rgba(124,58,237,0.2)'}}>
                + Crear
              </button>
            </div>
          </Field>

          <Field label="Modelo">
            <input className={inputCls} value={form.modelo} onChange={e => setForm({ ...form, modelo: e.target.value })} placeholder="Ej: Caterpillar 320D" />
          </Field>

          {/* ── Propietario con botón gestionar ── */}
          <Field label="Propietario">
            <div className="flex gap-2">
              <select className={selectCls} style={{flex:1}} value={form.propietario} onChange={e => setForm({ ...form, propietario: e.target.value })}>
                <option value="">Seleccionar propietario...</option>
                {propietariosOpciones.map(p => <option key={p}>{p}</option>)}
                {form.propietario && !propietariosOpciones.includes(form.propietario) && (
                  <option value={form.propietario}>{form.propietario}</option>
                )}
              </select>
              <button type="button" onClick={() => setCatModal('propietario')} title="Gestionar propietarios"
                className="flex-shrink-0 px-3 py-2.5 text-xs font-black rounded-xl transition-all"
                style={{background:'rgba(124,58,237,0.08)', color:'#7c3aed', border:'1px solid rgba(124,58,237,0.2)'}}>
                + Crear
              </button>
            </div>
          </Field>

          <FormButtons onCancel={() => setModal(false)} onSave={save} saving={saving} isEdit={!!editId} color="purple" />
        </div>
      </Modal>

      {/* ── Modales de catálogo ── */}
      <CatalogoModal
        isOpen={catModal === 'tipo'}
        onClose={() => setCatModal(null)}
        categoria="tipo"
        titulo="Tipos de máquina"
      />
      <CatalogoModal
        isOpen={catModal === 'marca'}
        onClose={() => setCatModal(null)}
        categoria="marca"
        titulo="Marcas"
      />
      <CatalogoModal
        isOpen={catModal === 'propietario'}
        onClose={() => setCatModal(null)}
        categoria="propietario"
        titulo="Propietarios"
      />
      <ConfirmDialog isOpen={!!confirm} onClose={() => setConfirm(null)} onConfirm={del} title="Eliminar Máquina" message={`¿Eliminar "${confirm?.name}"?`} />
      <QRCard isOpen={!!qr} onClose={() => setQr(null)} title={qr?.title} qrText={qr?.qrText} code={qr?.code} patente={qr?.patente} />
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
          <Field label="Nombre" required>
            <input
              className={inputCls}
              value={form.nombre}
              onChange={e => setForm({ ...form, nombre: e.target.value.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s]/g, '') })}
              placeholder="Ej: Constructora Norte"
            />
          </Field>
          <Field label="RUT">
            <input
              className={inputCls}
              value={form.rut}
              onChange={e => setForm({ ...form, rut: fmtRut(e.target.value) })}
              placeholder="Ej: 77.123.456-7"
              maxLength={12}
            />
          </Field>
          <Field label="Giro">
            <input
              className={inputCls}
              value={form.giro}
              onChange={e => setForm({ ...form, giro: e.target.value.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s]/g, '') })}
              placeholder="Ej: Construcción"
            />
          </Field>
          <Field label="Contacto (correo)">
            <input
              className={inputCls}
              value={form.contacto}
              onChange={e => setForm({ ...form, contacto: e.target.value.replace(/[^a-zA-Z0-9@._\-+]/g, '') })}
              placeholder="Ej: nombre@empresa.cl"
              type="email"
              inputMode="email"
            />
          </Field>
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

// Formato código proyecto: siempre "CC-NN" (CC-01, CC-23, etc.)
function fmtCodigoProyecto(raw) {
  const prefix = 'CC-';
  const nums = raw.replace(/[^0-9]/g, '').slice(0, 2);
  return prefix + nums;
}
function ProyectosSection() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [form, setForm] = useState({ name: '', codigo: 'CC-', mandante: '', ubicacion: '' });
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [catMandanteModal, setCatMandanteModal] = useState(false);

  // Catálogo dinámico de mandantes
  const { items: mandantesDB } = useCatalogo('mandante');
  const mandantesOpciones = mandantesDB.map(m => m.nombre).sort();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, 'projects'), orderBy('name')));
      setData(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch { setData([]); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const openNew = () => { setForm({ name: '', codigo: 'CC-', mandante: '', ubicacion: '' }); setEditId(null); setModal(true); };
  const openEdit = (row) => { const cod = row.codigo || 'CC-'; setForm({ name: row.name || '', codigo: cod.startsWith('CC-') ? cod : 'CC-' + cod, mandante: row.mandante || '', ubicacion: row.ubicacion || '' }); setEditId(row.id); setModal(true); };

  const save = async () => {
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
            { key: 'codigo', label: 'Código' },
            { key: 'mandante', label: 'Mandante' },
            { key: 'ubicacion', label: 'Ubicación' },
          ]}
        />
      </SectionCard>

      <Modal isOpen={modal} onClose={() => setModal(false)} title={editId ? 'Editar Proyecto' : 'Nuevo Proyecto'} color="indigo">
        <div className="space-y-4">

          <Field label="Nombre" required>
            <input
              className={inputCls}
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑüÜ0-9\s]/g, '') })}
              placeholder="Ej: Ruta Cinco Norte"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Código (CC-NN)">
              <input
                className={inputCls}
                value={form.codigo}
                onChange={e => {
                  const raw = e.target.value;
                  // Si el usuario borra el prefijo, restaurarlo
                  if (!raw.startsWith('CC-')) {
                    setForm({ ...form, codigo: fmtCodigoProyecto(raw) });
                  } else {
                    const nums = raw.slice(3).replace(/[^0-9]/g, '').slice(0, 2);
                    setForm({ ...form, codigo: 'CC-' + nums });
                  }
                }}
                placeholder="CC-01"
                maxLength={5}
              />
            </Field>

            <Field label="Ubicación">
              <input
                className={inputCls}
                value={form.ubicacion}
                onChange={e => setForm({ ...form, ubicacion: e.target.value })}
                placeholder="Ej: Antofagasta, II Región"
              />
            </Field>
          </div>

          <Field label="Mandante">
            <div className="flex gap-2">
              <select
                className={inputCls}
                style={{flex:1}}
                value={form.mandante}
                onChange={e => setForm({ ...form, mandante: e.target.value })}
              >
                <option value="">Seleccionar mandante...</option>
                {mandantesOpciones.map(m => <option key={m} value={m}>{m}</option>)}
                {form.mandante && !mandantesOpciones.includes(form.mandante) && (
                  <option value={form.mandante}>{form.mandante}</option>
                )}
              </select>
              <button type="button" onClick={() => setCatMandanteModal(true)}
                className="flex-shrink-0 px-3 py-2.5 text-xs font-black rounded-xl transition-all"
                style={{background:'rgba(99,102,241,0.08)', color:'#4f46e5', border:'1px solid rgba(99,102,241,0.2)'}}>
                + Crear
              </button>
            </div>
          </Field>

          <FormButtons onCancel={() => setModal(false)} onSave={save} saving={saving} isEdit={!!editId} color="indigo" />
        </div>
      </Modal>

      <CatalogoModal
        isOpen={catMandanteModal}
        onClose={() => setCatMandanteModal(false)}
        categoria="mandante"
        titulo="Mandantes"
      />

      <ConfirmDialog isOpen={!!confirm} onClose={() => setConfirm(null)} onConfirm={del} title="Eliminar Proyecto" message={`¿Eliminar "${confirm?.name}"?`} />
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// SECCIÓN: USUARIOS
// ─────────────────────────────────────────────────────────────

// =================================================================
// SECCION: ESTACIONES DE COMBUSTIBLE
// =================================================================
const MARCA_BADGE = {
  Copec:     'bg-red-100 text-red-700 border-red-300',
  Shell:     'bg-yellow-100 text-yellow-700 border-yellow-300',
  Petrobras: 'bg-green-100 text-green-700 border-green-300',
  Aramco:    'bg-blue-100 text-blue-700 border-blue-300',
};

function EstacionesSection() {
  const [data, setData]               = useState([]);
  const [loading, setLoading]         = useState(true);
  const [modal, setModal]             = useState(false);
  const [asignModal, setAsignModal]   = useState(null);
  const [confirm, setConfirm]         = useState(null);
  const [saving, setSaving]           = useState(false);
  const [projects, setProjects]       = useState([]);
  const [busqueda, setBusqueda]       = useState('');
  const [filtroMarca, setFiltroMarca] = useState('');
  const [editId, setEditId]           = useState(null);
  const [form, setForm] = useState({ nombre: '', marca: '', region: '', ciudad: '', direccion: '', telefono: '', rut: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [estSnap, projSnap] = await Promise.all([
        getDocs(query(collection(db, 'estaciones_combustible'), orderBy('nombre'))),
        getDocs(query(collection(db, 'projects'), orderBy('name'))),
      ]);
      setData(estSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setProjects(projSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error(e); setData([]); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const openNew  = () => {
    setForm({ nombre: '', marca: '', region: '', ciudad: '', direccion: '', telefono: '', rut: '' });
    setEditId(null);
    setModal(true);
  };
  const openEdit = (row) => {
    setForm({
      nombre:    row.nombre    || '',
      marca:     row.marca     || '',
      region:    row.region    || '',
      ciudad:    row.ciudad    || '',
      direccion: row.direccion || '',
      telefono:  row.telefono  || '',
      rut:       row.rut       || '',
    });
    setEditId(row.id);
    setModal(true);
  };

  const save = async () => {
    if (!form.ciudad.trim()) return alert('La ciudad es obligatoria');
    setSaving(true);
    try {
      const p = {
        nombre:    form.nombre.trim(),
        marca:     form.marca,
        region:    form.region.trim(),
        ciudad:    form.ciudad.trim(),
        direccion: form.direccion.trim(),
        telefono:  form.telefono.trim(),
        rut:       form.rut.trim(),
        updatedAt: serverTimestamp(),
      };
      if (editId) {
        await updateDoc(doc(db, 'estaciones_combustible', editId), p);
      } else {
        await addDoc(collection(db, 'estaciones_combustible'), { ...p, obras: [], createdAt: serverTimestamp() });
      }
      setModal(false);
      load();
    } catch (e) { alert('Error: ' + e.message); }
    setSaving(false);
  };

  const del = async () => {
    try {
      await deleteDoc(doc(db, 'estaciones_combustible', confirm.id));
      load();
    } catch (e) { alert('Error: ' + e.message); }
    setConfirm(null);
  };

  const asignarObra = async (estacion, obraId, add) => {
    const obras = estacion.obras || [];
    const nuevas = add
      ? [...new Set([...obras, obraId])]
      : obras.filter(o => o !== obraId);
    await updateDoc(doc(db, 'estaciones_combustible', estacion.id), { obras: nuevas });
    setData(prev => prev.map(e => e.id === estacion.id ? { ...e, obras: nuevas } : e));
    if (asignModal && asignModal.id === estacion.id) {
      setAsignModal(prev => ({ ...prev, obras: nuevas }));
    }
  };

  const filtradas = data.filter(e => {
    const q = busqueda.toLowerCase();
    const matchQ = !q
      || (e.nombre||'').toLowerCase().includes(q)
      || (e.ciudad||'').toLowerCase().includes(q)
      || (e.marca||'').toLowerCase().includes(q)
      || (e.region||'').toLowerCase().includes(q);
    const matchM = !filtroMarca || e.marca === filtroMarca;
    return matchQ && matchM;
  });

  const REGIONES = [
    'Arica y Parinacota','Tarapaca','Antofagasta','Atacama','Coquimbo',
    'Valparaiso','Metropolitana','O\'Higgins','Maule','Nuble',
    'Biobio','La Araucania','Los Rios','Los Lagos','Aysen','Magallanes',
  ];

  return (
    <>
      <div className="bg-white rounded-2xl shadow-md border border-slate-100 overflow-hidden">

        {/* ── Header ─────────────────────────────────────────── */}
        <div className="bg-gradient-to-r from-cyan-500 to-teal-600 p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
              </svg>
            </div>
            <div>
              <h3 className="text-white font-black text-lg">
                Estaciones de Combustible
                <span className="bg-white/20 text-white text-xs px-2 py-0.5 rounded-full ml-2">{data.length}</span>
              </h3>
              <p className="text-cyan-100 text-xs mt-0.5">Copec · Shell · Petrobras · Aramco y otras</p>
            </div>
          </div>
          <button onClick={openNew}
            className="px-4 py-2 bg-white text-cyan-700 text-sm font-black rounded-xl hover:bg-cyan-50 transition-all shadow flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/>
            </svg>
            Nueva Estacion
          </button>
        </div>

        {/* ── Filtros ─────────────────────────────────────────── */}
        <div className="p-4 border-b border-slate-100 flex flex-wrap gap-3">
          <input
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre, ciudad, region o marca..."
            className="flex-1 min-w-[220px] px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-cyan-400"
          />
          <select
            value={filtroMarca}
            onChange={e => setFiltroMarca(e.target.value)}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-cyan-400 bg-white"
          >
            <option value="">Todas las marcas</option>
            {['Copec','Shell','Petrobras','Aramco','Otra'].map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>

        {/* ── Tabla / Empty ───────────────────────────────────── */}
        {loading ? (
          <div className="p-12 text-center text-slate-400 text-sm">Cargando...</div>
        ) : filtradas.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-14 h-14 bg-cyan-50 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <svg className="w-7 h-7 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"/>
              </svg>
            </div>
            <p className="text-slate-600 font-semibold mb-1">No hay estaciones registradas</p>
            <p className="text-slate-400 text-sm mb-4">Crea la primera estacion de combustible</p>
            <button onClick={openNew}
              className="px-4 py-2 bg-cyan-600 text-white text-sm font-bold rounded-xl hover:bg-cyan-500 transition-all">
              + Nueva Estacion
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  {['Marca','Nombre','RUT','Ciudad / Region','Direccion','Obras asignadas','Acciones'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtradas.map(est => (
                  <tr key={est.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-4 py-3">
                      <span className={'px-2 py-0.5 rounded-full text-xs font-bold border ' + (MARCA_BADGE[est.marca] || 'bg-slate-100 text-slate-600 border-slate-200')}>
                        {est.marca || 'Otra'}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-800">{est.nombre}</td>
                    <td className="px-4 py-3 text-slate-500 font-mono text-xs">{est.rut || '—'}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-700">{est.ciudad || '—'}</div>
                      <div className="text-xs text-slate-400">{est.region || ''}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs max-w-[180px] truncate" title={est.direccion}>
                      {est.direccion || '—'}
                    </td>
                    <td className="px-4 py-3">
                      {(est.obras || []).length === 0 ? (
                        <span className="text-xs text-slate-400 italic">Sin obras</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {(est.obras || []).map(oId => {
                            const p = projects.find(x => x.id === oId);
                            return p ? (
                              <span key={oId} className="px-1.5 py-0.5 bg-indigo-100 text-indigo-700 text-[10px] font-bold rounded border border-indigo-200">
                                {p.name || p.codigo}
                              </span>
                            ) : null;
                          })}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => setAsignModal(est)}
                          className="px-2 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-lg text-xs font-bold border border-indigo-200 transition-all whitespace-nowrap"
                        >
                          + Obras
                        </button>
                        <button
                          onClick={() => openEdit(est)}
                          className="p-1.5 text-slate-400 hover:text-cyan-600 hover:bg-cyan-50 rounded-lg transition-all"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                          </svg>
                        </button>
                        <button
                          onClick={() => setConfirm(est)}
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Modal Crear / Editar ─────────────────────────────── */}
      <Modal isOpen={modal} onClose={() => setModal(false)} title={editId ? 'Editar Estacion' : 'Nueva Estacion de Combustible'} color="cyan">
        <div className="space-y-4">
          <Field label="Nombre de la Estacion" required>
            <input className={inputCls} value={form.nombre} onChange={e => setForm({...form, nombre: e.target.value})} placeholder="Ej: Copec Antofagasta Norte" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Marca / Cadena">
              <select className={inputCls} value={form.marca} onChange={e => setForm({...form, marca: e.target.value})}>
                <option value="">Seleccione marca</option>
                <option value="Copec">Copec</option>
                <option value="Shell">Shell</option>
                <option value="Petrobras">Petrobras</option>
                <option value="Aramco">Aramco</option>
                <option value="Otra">Otra</option>
              </select>
            </Field>
            <Field label="RUT (opcional)">
              <input className={inputCls} value={form.rut} onChange={e => setForm({...form, rut: e.target.value})} placeholder="Ej: 99.520.000-7" />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Ciudad" required>
              <input className={inputCls} value={form.ciudad} onChange={e => setForm({...form, ciudad: e.target.value})} placeholder="Ej: Antofagasta" />
            </Field>
            <Field label="Region">
              <select className={inputCls} value={form.region} onChange={e => setForm({...form, region: e.target.value})}>
                <option value="">Seleccione region</option>
                {REGIONES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Direccion">
            <input className={inputCls} value={form.direccion} onChange={e => setForm({...form, direccion: e.target.value})} placeholder="Ej: Av. Pedro Aguirre Cerda 8500" />
          </Field>
          <Field label="Telefono (opcional)">
            <input className={inputCls} value={form.telefono} onChange={e => setForm({...form, telefono: e.target.value})} placeholder="Ej: +56 2 2345 6789" />
          </Field>
          <FormButtons onCancel={() => setModal(false)} onSave={save} saving={saving} isEdit={!!editId} color="cyan" />
        </div>
      </Modal>

      {/* ── Modal Asignar Obras ──────────────────────────────── */}
      {asignModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-5 flex items-center justify-between">
              <div>
                <h3 className="text-white font-black text-lg">Asignar Obras</h3>
                <p className="text-indigo-200 text-xs mt-0.5 truncate max-w-[260px]">{asignModal.nombre}</p>
              </div>
              <button
                onClick={() => setAsignModal(null)}
                className="w-8 h-8 bg-white/20 hover:bg-white/30 rounded-lg flex items-center justify-center text-white transition-all"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            </div>
            <div className="p-4 max-h-80 overflow-y-auto space-y-2">
              {projects.length === 0 ? (
                <p className="text-slate-500 text-sm text-center py-6">No hay obras registradas en el sistema</p>
              ) : (
                projects.map(p => {
                  const checked = (asignModal.obras || []).includes(p.id);
                  return (
                    <label
                      key={p.id}
                      className={'flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ' + (checked ? 'bg-indigo-50 border-indigo-300' : 'bg-white border-slate-200 hover:border-indigo-200')}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={e => asignarObra(asignModal, p.id, e.target.checked)}
                        className="w-4 h-4 accent-indigo-600 rounded"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-slate-800 text-sm truncate">{p.name}</div>
                        {p.ubicacion && <div className="text-xs text-slate-500 truncate">{p.ubicacion}</div>}
                        {p.codigo && <div className="text-xs text-indigo-500 font-mono">{p.codigo}</div>}
                      </div>
                      {checked && (
                        <svg className="w-4 h-4 text-indigo-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/>
                        </svg>
                      )}
                    </label>
                  );
                })
              )}
            </div>
            <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
              <span className="text-xs text-slate-500">
                {(asignModal.obras||[]).length} obra(s) asignada(s)
              </span>
              <button
                onClick={() => setAsignModal(null)}
                className="px-4 py-2 bg-indigo-600 text-white font-bold rounded-xl text-sm hover:bg-indigo-500 transition-all"
              >
                Listo
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={del}
        title="Eliminar Estacion"
        message={'Eliminar la estacion ' + (confirm ? confirm.nombre : '') + '? Esta accion no se puede deshacer.'}
      />
    </>
  );
}

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
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-5 sm:py-6">
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
        <div className="max-w-7xl mx-auto px-2 sm:px-6">
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
      <div className="max-w-7xl mx-auto px-3 sm:px-6 py-6 sm:py-8">
        {activeTab === 'operadores'  && <OperadoresSection />}
        {activeTab === 'maquinas'    && <MaquinasSection />}
        {activeTab === 'actividades' && <ActividadesSection />}
        {activeTab === 'surtidores'  && <SurtidoresSection />}
        {activeTab === 'empresas'    && <EmpresasSection />}
        {activeTab === 'proyectos'   && <ProyectosSection />}
        {activeTab === 'estaciones'  && <EstacionesSection />}
        {activeTab === 'usuarios'    && <UsuariosSection />}
      </div>
    </div>
  );
}
