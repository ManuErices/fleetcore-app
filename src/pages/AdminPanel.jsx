import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  collection, getDocs, addDoc, updateDoc, deleteDoc,
  doc, serverTimestamp, query, orderBy, setDoc
} from 'firebase/firestore';
import { db } from '../lib/firebase';

// ─────────────────────────────────────────────────────────────
// MOTOR QR PURO (sin dependencias externas)
// Basado en el estándar QR Code Model 2
// ─────────────────────────────────────────────────────────────
const QRGenerator = (() => {
  // Tablas de Galois Field 256
  const EXP = new Uint8Array(512);
  const LOG = new Uint8Array(256);
  (() => {
    let x = 1;
    for (let i = 0; i < 255; i++) {
      EXP[i] = x; LOG[x] = i;
      x = x < 128 ? x * 2 : (x * 2) ^ 285;
    }
    for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
  })();
  const gfMul = (a, b) => a && b ? EXP[LOG[a] + LOG[b]] : 0;
  const gfPoly = (deg) => {
    let p = [1];
    for (let i = 0; i < deg; i++) {
      const q = [1, EXP[i]];
      const r = new Array(p.length + q.length - 1).fill(0);
      for (let j = 0; j < p.length; j++)
        for (let k = 0; k < q.length; k++)
          r[j + k] ^= gfMul(p[j], q[k]);
      p = r;
    }
    return p;
  };

  const ALPHANUMERIC = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';

  const encode = (text) => {
    // Detectar modo: numérico, alfanumérico, o byte
    const isNum = /^[0-9]+$/.test(text);
    const isAlpha = /^[0-9A-Z $%*+\-./:]+$/.test(text);

    // Usar versión 5 para textos cortos, hasta versión 10 según longitud
    // Simplificación: siempre modo byte (UTF-8) versión adaptativa
    const data = [];
    for (let i = 0; i < text.length; i++) data.push(text.charCodeAt(i));

    // Versión mínima para capacidad byte con corrección de errores M
    const caps = [0,14,26,42,62,84,106,122,154,180,206,244,261,295,325,367,397,445,485,512,568,614,664,718,754,808,871,911,985,1033,1115,1171,1231];
    let version = 1;
    while (version < 33 && caps[version] < data.length + 3) version++;
    if (version > 32) version = 32;

    // EC codewords por versión (nivel M)
    const ecCW = [0,10,16,26,18,24,16,18,22,22,26,30,22,22,24,24,28,28,26,26,26,26,28,28,28,28,28,28,28,28,28,28,28];
    const ecCount = ecCW[version];

    // Total codewords por versión
    const totalCW = [0,26,44,70,100,134,172,196,242,292,346,404,466,532,581,655,733,815,901,991,1085,1156,1258,1364,1474,1588,1706,1828,1921,2051,2185,2323,2465];

    // Modo byte
    const MODE = 0b0100;
    const len = data.length;
    let bits = [];
    const pushBits = (v, n) => { for (let i = n - 1; i >= 0; i--) bits.push((v >> i) & 1); };

    pushBits(MODE, 4);
    pushBits(len, version < 10 ? 8 : 16);
    for (const b of data) pushBits(b, 8);

    // Terminator
    for (let i = 0; i < 4 && bits.length < totalCW[version] * 8 - ecCount * 8; i++) bits.push(0);
    while (bits.length % 8) bits.push(0);

    // Padding
    const pads = [0b11101100, 0b00010001];
    let pi = 0;
    const dataCW = totalCW[version] - ecCount;
    while (bits.length < dataCW * 8) { pushBits(pads[pi], 8); pi = 1 - pi; }

    // Bytes de datos
    const dataBytes = [];
    for (let i = 0; i < bits.length; i += 8) {
      let b = 0;
      for (let j = 0; j < 8; j++) b = (b << 1) | (bits[i + j] || 0);
      dataBytes.push(b);
    }

    // EC bytes via LFSR
    const gen = gfPoly(ecCount);
    const msg = [...dataBytes, ...new Array(ecCount).fill(0)];
    for (let i = 0; i < dataBytes.length; i++) {
      const c = msg[i];
      if (c) for (let j = 0; j < gen.length; j++) msg[i + j] ^= gfMul(gen[j], c);
    }
    const ecBytes = msg.slice(dataBytes.length);
    const allBytes = [...dataBytes, ...ecBytes];

    // Construir matriz
    const size = version * 4 + 17;
    const mat = Array.from({ length: size }, () => new Array(size).fill(-1));
    const func = Array.from({ length: size }, () => new Array(size).fill(false));

    const setFunc = (r, c, v) => { if (r >= 0 && r < size && c >= 0 && c < size) { mat[r][c] = v; func[r][c] = true; } };

    // Finder patterns
    const finder = (row, col) => {
      for (let r = -1; r <= 7; r++)
        for (let c = -1; c <= 7; c++) {
          const v = r === -1 || r === 7 || c === -1 || c === 7 ? 1
            : r >= 1 && r <= 5 && c >= 1 && c <= 5 ? (r >= 2 && r <= 4 && c >= 2 && c <= 4 ? 1 : 0) : 0;
          setFunc(row + r, col + c, v);
        }
    };
    finder(0, 0); finder(0, size - 7); finder(size - 7, 0);

    // Timing
    for (let i = 8; i < size - 8; i++) {
      setFunc(6, i, i % 2 === 0 ? 1 : 0);
      setFunc(i, 6, i % 2 === 0 ? 1 : 0);
    }

    // Dark module
    setFunc(size - 8, 8, 1);

    // Alignment patterns
    const alignPos = [[], [], [6,18], [6,22], [6,26], [6,30], [6,34], [6,22,38], [6,24,42], [6,28,46], [6,32,50]];
    if (version >= 2 && alignPos[version]) {
      const pos = alignPos[version] || [];
      for (const r of pos) for (const c of pos) {
        if (func[r][c]) continue;
        for (let dr = -2; dr <= 2; dr++)
          for (let dc = -2; dc <= 2; dc++)
            setFunc(r + dr, c + dc, Math.abs(dr) === 2 || Math.abs(dc) === 2 ? 1 : dr === 0 && dc === 0 ? 1 : 0);
      }
    }

    // Format info (máscara 0)
    const FORMAT = [0b111011111000100, 0b111001011110011, 0b111110110101010, 0b111100010011101,
                    0b110011000101111, 0b110001100011000, 0b110110001000001, 0b110100101110110,
                    0b101010000010010];
    const fmt = FORMAT[0]; // Máscara 0, EC level M
    const fmtBits = (f, i) => (f >> (14 - i)) & 1;
    for (let i = 0; i < 6; i++) { setFunc(8, i, fmtBits(fmt, i)); setFunc(i, 8, fmtBits(fmt, i)); }
    setFunc(8, 7, fmtBits(fmt, 6)); setFunc(7, 8, fmtBits(fmt, 6));
    setFunc(8, 8, fmtBits(fmt, 7)); setFunc(size - 8, 8, fmtBits(fmt, 8));
    for (let i = 0; i < 7; i++) {
      setFunc(8, size - 7 + i, fmtBits(fmt, 8 + i));
      setFunc(size - 7 + i, 8, fmtBits(fmt, 8 + i));
    }

    // Colocar datos en zigzag
    let byteIdx = 0, bitIdx = 7;
    let up = true;
    for (let col = size - 1; col >= 1; col -= 2) {
      if (col === 6) col = 5;
      for (let i = 0; i < size; i++) {
        const row = up ? size - 1 - i : i;
        for (let c2 = 0; c2 < 2; c2++) {
          const cc = col - c2;
          if (!func[row][cc]) {
            const bit = byteIdx < allBytes.length ? (allBytes[byteIdx] >> bitIdx) & 1 : 0;
            mat[row][cc] = bit ^ (row + cc) % 2 === 0 ? 1 : 0; // máscara 0: (i+j)%2==0
            bitIdx--;
            if (bitIdx < 0) { bitIdx = 7; byteIdx++; }
          }
        }
      }
      up = !up;
    }

    return { mat, size };
  };

  const toSVG = (text, px = 8) => {
    try {
      const { mat, size } = encode(text);
      const total = (size + 8) * px;
      let rects = '';
      for (let r = 0; r < size; r++)
        for (let c = 0; c < size; c++)
          if (mat[r][c] === 1)
            rects += `<rect x="${(c + 4) * px}" y="${(r + 4) * px}" width="${px}" height="${px}" fill="#000"/>`;
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${total}" height="${total}" viewBox="0 0 ${total} ${total}"><rect width="${total}" height="${total}" fill="#fff"/>${rects}</svg>`;
    } catch { return null; }
  };

  return { toSVG };
})();

// ─────────────────────────────────────────────────────────────
// CONSTANTES
// ─────────────────────────────────────────────────────────────
const ROLES = ['administrador', 'operador', 'mandante'];
const TIPOS_MAQUINA = ['Excavadora', 'Bulldozer', 'Motoniveladora', 'Retroexcavadora', 'Cargador Frontal', 'Grúa', 'Camión', 'Compactadora', 'Otro'];

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────
const Badge = ({ color, children }) => {
  const colors = {
    green:  'bg-emerald-100 text-emerald-700 border-emerald-200',
    blue:   'bg-blue-100 text-blue-700 border-blue-200',
    purple: 'bg-purple-100 text-purple-700 border-purple-200',
    amber:  'bg-amber-100 text-amber-700 border-amber-200',
    red:    'bg-red-100 text-red-700 border-red-200',
    slate:  'bg-slate-100 text-slate-700 border-slate-200',
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${colors[color] || colors.slate}`}>
      {children}
    </span>
  );
};

const roleColor = (role) => ({ administrador: 'purple', operador: 'blue', mandante: 'amber' }[role] || 'slate');

// ─────────────────────────────────────────────────────────────
// MODAL GENÉRICO
// ─────────────────────────────────────────────────────────────
function Modal({ isOpen, onClose, title, children, icon, color = 'blue' }) {
  useEffect(() => {
    if (isOpen) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  if (!isOpen) return null;
  const colors = {
    blue:   'from-blue-600 to-indigo-700',
    purple: 'from-purple-600 to-violet-700',
    green:  'from-emerald-600 to-teal-700',
    amber:  'from-amber-500 to-orange-600',
    red:    'from-red-600 to-rose-700',
    slate:  'from-slate-700 to-slate-800',
  };
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:max-w-lg bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden max-h-[95vh] flex flex-col">
        {/* Header */}
        <div className={`bg-gradient-to-r ${colors[color]} p-4 sm:p-5 flex items-center gap-3 flex-shrink-0`}>
          <div className="w-1 h-7 bg-white/40 rounded-full sm:hidden mx-auto absolute top-2 left-1/2 -translate-x-1/2" />
          <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0">
            {icon}
          </div>
          <h3 className="text-lg font-black text-white flex-1">{title}</h3>
          <button onClick={onClose} className="p-1.5 bg-white/20 hover:bg-white/30 rounded-lg transition-colors">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        {/* Body */}
        <div className="overflow-y-auto flex-1 p-4 sm:p-6">
          {children}
        </div>
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
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full">
        <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-6 h-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h3 className="text-lg font-black text-slate-900 text-center mb-1">{title}</h3>
        <p className="text-sm text-slate-500 text-center mb-6">{message}</p>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl transition-colors">
            Cancelar
          </button>
          <button onClick={onConfirm} className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl transition-colors">
            Eliminar
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// COMPONENTE QR
// ─────────────────────────────────────────────────────────────
function QRCard({ isOpen, onClose, title, qrText, subtitle, detail }) {
  const svgRef = useRef(null);
  const [svgContent, setSvgContent] = useState('');

  useEffect(() => {
    if (isOpen && qrText) {
      const svg = QRGenerator.toSVG(qrText, 7);
      setSvgContent(svg || '');
    }
  }, [isOpen, qrText]);

  const downloadSVG = () => {
    if (!svgContent) return;
    const blob = new Blob([svgContent], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `QR_${title.replace(/\s+/g, '_')}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadPNG = () => {
    if (!svgContent) return;
    const img = new Image();
    const blob = new Blob([svgContent], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      const scale = 4; // 4x para alta resolución
      const canvas = document.createElement('canvas');
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(b => {
        const a2 = document.createElement('a');
        a2.href = URL.createObjectURL(b);
        a2.download = `QR_${title.replace(/\s+/g, '_')}.png`;
        a2.click();
      }, 'image/png');
      URL.revokeObjectURL(url);
    };
    img.src = url;
  };

  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:max-w-sm bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-800 to-slate-900 p-4 flex items-center gap-3">
          <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-black text-white truncate">{title}</h3>
            {subtitle && <p className="text-xs text-slate-400 truncate">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="p-1.5 bg-white/10 hover:bg-white/20 rounded-lg transition-colors">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* QR */}
        <div className="p-6 flex flex-col items-center gap-4">
          {svgContent ? (
            <div className="p-3 bg-white border-2 border-slate-200 rounded-2xl shadow-inner"
              dangerouslySetInnerHTML={{ __html: svgContent }}
            />
          ) : (
            <div className="w-48 h-48 bg-slate-100 rounded-2xl flex items-center justify-center">
              <span className="text-sm text-slate-400">Generando QR...</span>
            </div>
          )}

          {/* Info del contenido */}
          <div className="w-full bg-slate-50 rounded-xl p-3 border border-slate-200">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Contenido del QR</p>
            <p className="text-sm font-mono text-slate-800 break-all">{qrText}</p>
            {detail && <p className="text-xs text-slate-500 mt-1">{detail}</p>}
          </div>

          {/* Botones descarga */}
          <div className="flex gap-3 w-full">
            <button
              onClick={downloadSVG}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-700 font-bold text-sm rounded-xl transition-all"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              SVG
            </button>
            <button
              onClick={downloadPNG}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-slate-800 to-slate-900 hover:opacity-90 active:scale-95 text-white font-bold text-sm rounded-xl transition-all shadow-md"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              PNG (Alta Res)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
function Field({ label, required, children }) {
  return (
    <div>
      <label className="block text-sm font-bold text-slate-700 mb-1.5">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
    </div>
  );
}

const inputCls = "w-full px-3.5 py-2.5 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 text-sm transition-colors";
const selectCls = "w-full px-3.5 py-2.5 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 text-sm transition-colors bg-white";

// ─────────────────────────────────────────────────────────────
// TABLA GENÉRICA
// ─────────────────────────────────────────────────────────────
function DataTable({ columns, data, onEdit, onDelete, emptyText = 'Sin registros', loading, extraAction }) {
  if (loading) return (
    <div className="flex items-center justify-center py-16">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-3 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
        <span className="text-sm text-slate-500 font-medium">Cargando...</span>
      </div>
    </div>
  );
  if (!data.length) return (
    <div className="flex flex-col items-center justify-center py-16 text-slate-400">
      <svg className="w-12 h-12 mb-3 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
      </svg>
      <p className="text-sm font-medium">{emptyText}</p>
    </div>
  );
  return (
    <div className="overflow-x-auto -mx-4 sm:mx-0">
      <table className="w-full min-w-[500px]">
        <thead>
          <tr className="border-b-2 border-slate-100">
            {columns.map(col => (
              <th key={col.key} className="px-4 py-3 text-left text-xs font-black text-slate-500 uppercase tracking-wider">
                {col.label}
              </th>
            ))}
            <th className="px-4 py-3 text-right text-xs font-black text-slate-500 uppercase tracking-wider">Acciones</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {data.map((row) => (
            <tr key={row.id} className="hover:bg-slate-50/70 transition-colors group">
              {columns.map(col => (
                <td key={col.key} className="px-4 py-3.5 text-sm text-slate-700">
                  {col.render ? col.render(row) : (row[col.key] || <span className="text-slate-300 italic">—</span>)}
                </td>
              ))}
              <td className="px-4 py-3.5">
                <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  {extraAction && extraAction(row)}
                  <button
                    onClick={() => onEdit(row)}
                    className="p-1.5 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-lg transition-colors"
                    title="Editar"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => onDelete(row)}
                    className="p-1.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg transition-colors"
                    title="Eliminar"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
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
// HEADER DE SECCIÓN
// ─────────────────────────────────────────────────────────────
function SectionHeader({ title, subtitle, count, onAdd, addLabel, color = 'blue', icon }) {
  const colors = {
    blue:   'from-blue-600 to-indigo-700',
    purple: 'from-purple-600 to-violet-700',
    green:  'from-emerald-600 to-teal-700',
    amber:  'from-amber-500 to-orange-600',
    red:    'from-red-500 to-rose-600',
    slate:  'from-slate-700 to-slate-800',
    teal:   'from-teal-600 to-cyan-700',
    pink:   'from-pink-600 to-rose-700',
  };
  return (
    <div className="flex items-center justify-between mb-5">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${colors[color]} flex items-center justify-center shadow-md flex-shrink-0`}>
          {icon}
        </div>
        <div>
          <h2 className="text-lg font-black text-slate-900">{title}
            {count !== undefined && (
              <span className="ml-2 text-xs font-bold bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">{count}</span>
            )}
          </h2>
          {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {onAdd && (
        <button
          onClick={onAdd}
          className={`flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r ${colors[color]} hover:opacity-90 active:scale-95 text-white font-bold text-sm rounded-xl shadow-md transition-all`}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          {addLabel || 'Nuevo'}
        </button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// SECCIÓN: OPERADORES / EMPLEADOS
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
      const payload = { nombre: form.nombre.trim(), rut: form.rut.trim(), cargo: form.cargo.trim(), empresa: form.empresa.trim(), updatedAt: serverTimestamp() };
      if (editId) await updateDoc(doc(db, 'employees', editId), payload);
      else await addDoc(collection(db, 'employees'), { ...payload, createdAt: serverTimestamp() });
      setModal(false);
      load();
    } catch (e) { alert('Error al guardar: ' + e.message); }
    setSaving(false);
  };

  const del = async () => {
    try { await deleteDoc(doc(db, 'employees', confirm.id)); load(); } catch (e) { alert('Error: ' + e.message); }
    setConfirm(null);
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 sm:p-6">
      <SectionHeader title="Operadores" subtitle="Empleados registrados en el sistema" count={data.length} onAdd={openNew} addLabel="Nuevo Operador" color="blue"
        icon={<svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>}
      />
      <DataTable loading={loading} data={data} onEdit={openEdit} onDelete={setConfirm} emptyText="No hay operadores registrados"
        columns={[
          { key: 'nombre', label: 'Nombre' },
          { key: 'rut', label: 'RUT' },
          { key: 'cargo', label: 'Cargo' },
          { key: 'empresa', label: 'Empresa' },
        ]}
      />
      <Modal isOpen={modal} onClose={() => setModal(false)} title={editId ? 'Editar Operador' : 'Nuevo Operador'} color="blue"
        icon={<svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>}
      >
        <div className="space-y-4">
          <Field label="Nombre Completo" required><input className={inputCls} value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} placeholder="Ej: Juan Pérez González" /></Field>
          <Field label="RUT"><input className={inputCls} value={form.rut} onChange={e => setForm({ ...form, rut: e.target.value })} placeholder="Ej: 12.345.678-9" /></Field>
          <Field label="Cargo"><input className={inputCls} value={form.cargo} onChange={e => setForm({ ...form, cargo: e.target.value })} placeholder="Ej: Operador Maquinaria" /></Field>
          <Field label="Empresa"><input className={inputCls} value={form.empresa} onChange={e => setForm({ ...form, empresa: e.target.value })} placeholder="Ej: MPF Ingeniería" /></Field>
          <div className="flex gap-3 pt-2">
            <button onClick={() => setModal(false)} className="flex-1 px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl transition-colors">Cancelar</button>
            <button onClick={save} disabled={saving} className="flex-1 px-4 py-3 bg-gradient-to-r from-blue-600 to-indigo-700 hover:opacity-90 disabled:opacity-60 text-white font-bold rounded-xl transition-all">
              {saving ? 'Guardando...' : editId ? 'Actualizar' : 'Crear'}
            </button>
          </div>
        </div>
      </Modal>
      <ConfirmDialog isOpen={!!confirm} onClose={() => setConfirm(null)} onConfirm={del} title="Eliminar Operador" message={`¿Eliminar a "${confirm?.nombre}"? Esta acción no se puede deshacer.`} />
    </div>
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
  const [qr, setQr] = useState(null); // { title, qrText, subtitle, detail }
  const [form, setForm] = useState({ name: '', code: '', patente: '', type: '', modelo: '' });
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

  const openNew = () => { setForm({ name: '', code: '', patente: '', type: '', modelo: '' }); setEditId(null); setModal(true); };
  const openEdit = (row) => { setForm({ name: row.name || '', code: row.code || '', patente: row.patente || '', type: row.type || '', modelo: row.modelo || '' }); setEditId(row.id); setModal(true); };
  const openQR = (row) => {
    const code = row.code || row.patente || row.id;
    setQr({
      title: row.name || code,
      subtitle: row.patente || row.code,
      qrText: code,
      detail: `Tipo: ${row.type || '—'}  |  Modelo: ${row.modelo || '—'}`
    });
  };

  const save = async () => {
    if (!form.name.trim()) return alert('El nombre es obligatorio');
    setSaving(true);
    try {
      const payload = { name: form.name.trim(), code: form.code.trim(), patente: form.patente.trim().toUpperCase(), type: form.type.trim(), modelo: form.modelo.trim(), updatedAt: serverTimestamp() };
      if (editId) await updateDoc(doc(db, 'machines', editId), payload);
      else await addDoc(collection(db, 'machines'), { ...payload, createdAt: serverTimestamp() });
      setModal(false);
      load();
    } catch (e) { alert('Error al guardar: ' + e.message); }
    setSaving(false);
  };

  const del = async () => {
    try { await deleteDoc(doc(db, 'machines', confirm.id)); load(); } catch (e) { alert('Error: ' + e.message); }
    setConfirm(null);
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 sm:p-6">
      <SectionHeader title="Máquinas" subtitle="Equipos registrados en la flota" count={data.length} onAdd={openNew} addLabel="Nueva Máquina" color="purple"
        icon={<svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>}
      />
      <DataTable loading={loading} data={data} onEdit={openEdit} onDelete={setConfirm} emptyText="No hay máquinas registradas"
        extraAction={(row) => (
          <button
            onClick={() => openQR(row)}
            className="p-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 rounded-lg transition-colors"
            title="Ver / Descargar QR"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          </button>
        )}
        columns={[
          { key: 'name', label: 'Nombre' },
          { key: 'patente', label: 'Patente / Código', render: r => <span className="font-mono font-bold text-slate-800">{r.patente || r.code || '—'}</span> },
          { key: 'type', label: 'Tipo' },
          { key: 'modelo', label: 'Modelo' },
        ]}
      />
      <Modal isOpen={modal} onClose={() => setModal(false)} title={editId ? 'Editar Máquina' : 'Nueva Máquina'} color="purple"
        icon={<svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>}
      >
        <div className="space-y-4">
          <Field label="Nombre" required><input className={inputCls} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Ej: Excavadora CAT 320" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Patente"><input className={inputCls} value={form.patente} onChange={e => setForm({ ...form, patente: e.target.value })} placeholder="Ej: BCDF12" /></Field>
            <Field label="Código Interno"><input className={inputCls} value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} placeholder="Ej: EXC-001" /></Field>
          </div>
          <Field label="Tipo">
            <select className={selectCls} value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
              <option value="">Seleccionar tipo...</option>
              {TIPOS_MAQUINA.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Modelo"><input className={inputCls} value={form.modelo} onChange={e => setForm({ ...form, modelo: e.target.value })} placeholder="Ej: Caterpillar 320D" /></Field>
          <div className="flex gap-3 pt-2">
            <button onClick={() => setModal(false)} className="flex-1 px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl transition-colors">Cancelar</button>
            <button onClick={save} disabled={saving} className="flex-1 px-4 py-3 bg-gradient-to-r from-purple-600 to-violet-700 hover:opacity-90 disabled:opacity-60 text-white font-bold rounded-xl transition-all">
              {saving ? 'Guardando...' : editId ? 'Actualizar' : 'Crear'}
            </button>
          </div>
        </div>
      </Modal>
      <ConfirmDialog isOpen={!!confirm} onClose={() => setConfirm(null)} onConfirm={del} title="Eliminar Máquina" message={`¿Eliminar "${confirm?.name}"? Esta acción no se puede deshacer.`} />
      <QRCard isOpen={!!qr} onClose={() => setQr(null)} title={qr?.title} subtitle={qr?.subtitle} qrText={qr?.qrText} detail={qr?.detail} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// SECCIÓN: ACTIVIDADES
// ─────────────────────────────────────────────────────────────
function ActividadesSection() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [form, setForm] = useState({ nombre: '', tipo: 'efectiva', descripcion: '' });
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, 'actividades_disponibles'), orderBy('nombre')));
      setData(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch { setData([]); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const openNew = () => { setForm({ nombre: '', tipo: 'efectiva', descripcion: '' }); setEditId(null); setModal(true); };
  const openEdit = (row) => { setForm({ nombre: row.nombre || '', tipo: row.tipo || 'efectiva', descripcion: row.descripcion || '' }); setEditId(row.id); setModal(true); };

  const save = async () => {
    if (!form.nombre.trim()) return alert('El nombre es obligatorio');
    setSaving(true);
    try {
      const payload = { nombre: form.nombre.trim(), tipo: form.tipo, descripcion: form.descripcion.trim(), updatedAt: serverTimestamp() };
      if (editId) await updateDoc(doc(db, 'actividades_disponibles', editId), payload);
      else await addDoc(collection(db, 'actividades_disponibles'), { ...payload, createdAt: serverTimestamp() });
      setModal(false);
      load();
    } catch (e) { alert('Error al guardar: ' + e.message); }
    setSaving(false);
  };

  const del = async () => {
    try { await deleteDoc(doc(db, 'actividades_disponibles', confirm.id)); load(); } catch (e) { alert('Error: ' + e.message); }
    setConfirm(null);
  };

  const tipoLabel = (tipo) => ({ efectiva: 'Efectiva', no_efectiva: 'No Efectiva', mantencion: 'Mantención' }[tipo] || tipo);
  const tipoColor = (tipo) => ({ efectiva: 'green', no_efectiva: 'amber', mantencion: 'slate' }[tipo] || 'slate');

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 sm:p-6">
      <SectionHeader title="Actividades" subtitle="Opciones disponibles en el formulario de reporte" count={data.length} onAdd={openNew} addLabel="Nueva Actividad" color="green"
        icon={<svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg>}
      />
      <DataTable loading={loading} data={data} onEdit={openEdit} onDelete={setConfirm} emptyText="No hay actividades registradas"
        columns={[
          { key: 'nombre', label: 'Nombre' },
          { key: 'tipo', label: 'Tipo', render: r => <Badge color={tipoColor(r.tipo)}>{tipoLabel(r.tipo)}</Badge> },
          { key: 'descripcion', label: 'Descripción' },
        ]}
      />
      <Modal isOpen={modal} onClose={() => setModal(false)} title={editId ? 'Editar Actividad' : 'Nueva Actividad'} color="green"
        icon={<svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>}
      >
        <div className="space-y-4">
          <Field label="Nombre" required><input className={inputCls} value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} placeholder="Ej: Trabajos en Plataforma" /></Field>
          <Field label="Tipo" required>
            <select className={selectCls} value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value })}>
              <option value="efectiva">Actividad Efectiva</option>
              <option value="no_efectiva">Tiempo No Efectivo</option>
              <option value="mantencion">Mantención</option>
            </select>
          </Field>
          <Field label="Descripción"><input className={inputCls} value={form.descripcion} onChange={e => setForm({ ...form, descripcion: e.target.value })} placeholder="Descripción opcional..." /></Field>
          <div className="flex gap-3 pt-2">
            <button onClick={() => setModal(false)} className="flex-1 px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl transition-colors">Cancelar</button>
            <button onClick={save} disabled={saving} className="flex-1 px-4 py-3 bg-gradient-to-r from-emerald-600 to-teal-700 hover:opacity-90 disabled:opacity-60 text-white font-bold rounded-xl transition-all">
              {saving ? 'Guardando...' : editId ? 'Actualizar' : 'Crear'}
            </button>
          </div>
        </div>
      </Modal>
      <ConfirmDialog isOpen={!!confirm} onClose={() => setConfirm(null)} onConfirm={del} title="Eliminar Actividad" message={`¿Eliminar "${confirm?.nombre}"?`} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// SECCIÓN: SURTIDORES (Equipos Surtidores)
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
      const payload = { nombre: form.nombre.trim(), patente: form.patente.trim().toUpperCase(), capacidad: form.capacidad, tipo: form.tipo.trim(), updatedAt: serverTimestamp() };
      if (editId) await updateDoc(doc(db, 'equipos_surtidores', editId), payload);
      else await addDoc(collection(db, 'equipos_surtidores'), { ...payload, createdAt: serverTimestamp() });
      setModal(false);
      load();
    } catch (e) { alert('Error al guardar: ' + e.message); }
    setSaving(false);
  };

  const del = async () => {
    try { await deleteDoc(doc(db, 'equipos_surtidores', confirm.id)); load(); } catch (e) { alert('Error: ' + e.message); }
    setConfirm(null);
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 sm:p-6">
      <SectionHeader title="Surtidores" subtitle="Equipos surtidores de combustible" count={data.length} onAdd={openNew} addLabel="Nuevo Surtidor" color="amber"
        icon={<svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" /></svg>}
      />
      <DataTable loading={loading} data={data} onEdit={openEdit} onDelete={setConfirm} emptyText="No hay surtidores registrados"
        columns={[
          { key: 'nombre', label: 'Nombre' },
          { key: 'patente', label: 'Patente', render: r => <span className="font-mono font-bold">{r.patente || '—'}</span> },
          { key: 'tipo', label: 'Tipo' },
          { key: 'capacidad', label: 'Capacidad', render: r => r.capacidad ? `${r.capacidad} L` : '—' },
        ]}
      />
      <Modal isOpen={modal} onClose={() => setModal(false)} title={editId ? 'Editar Surtidor' : 'Nuevo Surtidor'} color="amber"
        icon={<svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" /></svg>}
      >
        <div className="space-y-4">
          <Field label="Nombre" required><input className={inputCls} value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} placeholder="Ej: Camión Surtidor 1" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Patente"><input className={inputCls} value={form.patente} onChange={e => setForm({ ...form, patente: e.target.value })} placeholder="Ej: BCDF12" /></Field>
            <Field label="Capacidad (L)"><input className={inputCls} type="number" value={form.capacidad} onChange={e => setForm({ ...form, capacidad: e.target.value })} placeholder="Ej: 5000" /></Field>
          </div>
          <Field label="Tipo"><input className={inputCls} value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value })} placeholder="Ej: Camión Aljibe, Mochila" /></Field>
          <div className="flex gap-3 pt-2">
            <button onClick={() => setModal(false)} className="flex-1 px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl transition-colors">Cancelar</button>
            <button onClick={save} disabled={saving} className="flex-1 px-4 py-3 bg-gradient-to-r from-amber-500 to-orange-600 hover:opacity-90 disabled:opacity-60 text-white font-bold rounded-xl transition-all">
              {saving ? 'Guardando...' : editId ? 'Actualizar' : 'Crear'}
            </button>
          </div>
        </div>
      </Modal>
      <ConfirmDialog isOpen={!!confirm} onClose={() => setConfirm(null)} onConfirm={del} title="Eliminar Surtidor" message={`¿Eliminar "${confirm?.nombre}"?`} />
    </div>
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
      const payload = { nombre: form.nombre.trim(), rut: form.rut.trim(), giro: form.giro.trim(), contacto: form.contacto.trim(), updatedAt: serverTimestamp() };
      if (editId) await updateDoc(doc(db, 'empresas_combustible', editId), payload);
      else await addDoc(collection(db, 'empresas_combustible'), { ...payload, createdAt: serverTimestamp() });
      setModal(false);
      load();
    } catch (e) { alert('Error al guardar: ' + e.message); }
    setSaving(false);
  };

  const del = async () => {
    try { await deleteDoc(doc(db, 'empresas_combustible', confirm.id)); load(); } catch (e) { alert('Error: ' + e.message); }
    setConfirm(null);
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 sm:p-6">
      <SectionHeader title="Empresas" subtitle="Empresas habilitadas para recibir combustible" count={data.length} onAdd={openNew} addLabel="Nueva Empresa" color="teal"
        icon={<svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>}
      />
      <DataTable loading={loading} data={data} onEdit={openEdit} onDelete={setConfirm} emptyText="No hay empresas registradas"
        columns={[
          { key: 'nombre', label: 'Nombre' },
          { key: 'rut', label: 'RUT' },
          { key: 'giro', label: 'Giro' },
          { key: 'contacto', label: 'Contacto' },
        ]}
      />
      <Modal isOpen={modal} onClose={() => setModal(false)} title={editId ? 'Editar Empresa' : 'Nueva Empresa'} color="teal"
        icon={<svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>}
      >
        <div className="space-y-4">
          <Field label="Nombre" required><input className={inputCls} value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} placeholder="Ej: LIFEMED SpA" /></Field>
          <Field label="RUT"><input className={inputCls} value={form.rut} onChange={e => setForm({ ...form, rut: e.target.value })} placeholder="Ej: 77.123.456-7" /></Field>
          <Field label="Giro"><input className={inputCls} value={form.giro} onChange={e => setForm({ ...form, giro: e.target.value })} placeholder="Ej: Construcción" /></Field>
          <Field label="Contacto"><input className={inputCls} value={form.contacto} onChange={e => setForm({ ...form, contacto: e.target.value })} placeholder="Ej: nombre@empresa.cl" /></Field>
          <div className="flex gap-3 pt-2">
            <button onClick={() => setModal(false)} className="flex-1 px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl transition-colors">Cancelar</button>
            <button onClick={save} disabled={saving} className="flex-1 px-4 py-3 bg-gradient-to-r from-teal-600 to-cyan-700 hover:opacity-90 disabled:opacity-60 text-white font-bold rounded-xl transition-all">
              {saving ? 'Guardando...' : editId ? 'Actualizar' : 'Crear'}
            </button>
          </div>
        </div>
      </Modal>
      <ConfirmDialog isOpen={!!confirm} onClose={() => setConfirm(null)} onConfirm={del} title="Eliminar Empresa" message={`¿Eliminar "${confirm?.nombre}"?`} />
    </div>
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
  const [form, setForm] = useState({ nombre: '', codigo: '', mandante: '', ubicacion: '' });
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, 'projects'), orderBy('nombre')));
      setData(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch { setData([]); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const openNew = () => { setForm({ nombre: '', codigo: '', mandante: '', ubicacion: '' }); setEditId(null); setModal(true); };
  const openEdit = (row) => { setForm({ nombre: row.nombre || '', codigo: row.codigo || '', mandante: row.mandante || '', ubicacion: row.ubicacion || '' }); setEditId(row.id); setModal(true); };

  const save = async () => {
    if (!form.nombre.trim()) return alert('El nombre es obligatorio');
    setSaving(true);
    try {
      const payload = { nombre: form.nombre.trim(), codigo: form.codigo.trim(), mandante: form.mandante.trim(), ubicacion: form.ubicacion.trim(), updatedAt: serverTimestamp() };
      if (editId) await updateDoc(doc(db, 'projects', editId), payload);
      else await addDoc(collection(db, 'projects'), { ...payload, createdAt: serverTimestamp() });
      setModal(false);
      load();
    } catch (e) { alert('Error al guardar: ' + e.message); }
    setSaving(false);
  };

  const del = async () => {
    try { await deleteDoc(doc(db, 'projects', confirm.id)); load(); } catch (e) { alert('Error: ' + e.message); }
    setConfirm(null);
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 sm:p-6">
      <SectionHeader title="Proyectos" subtitle="Proyectos y obras activas" count={data.length} onAdd={openNew} addLabel="Nuevo Proyecto" color="slate"
        icon={<svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>}
      />
      <DataTable loading={loading} data={data} onEdit={openEdit} onDelete={setConfirm} emptyText="No hay proyectos registrados"
        columns={[
          { key: 'nombre', label: 'Nombre' },
          { key: 'codigo', label: 'Código' },
          { key: 'mandante', label: 'Mandante' },
          { key: 'ubicacion', label: 'Ubicación' },
        ]}
      />
      <Modal isOpen={modal} onClose={() => setModal(false)} title={editId ? 'Editar Proyecto' : 'Nuevo Proyecto'} color="slate"
        icon={<svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>}
      >
        <div className="space-y-4">
          <Field label="Nombre" required><input className={inputCls} value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} placeholder="Ej: Proyecto Ruta 5 Norte" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Código"><input className={inputCls} value={form.codigo} onChange={e => setForm({ ...form, codigo: e.target.value })} placeholder="Ej: PRY-001" /></Field>
            <Field label="Mandante"><input className={inputCls} value={form.mandante} onChange={e => setForm({ ...form, mandante: e.target.value })} placeholder="Ej: MOP" /></Field>
          </div>
          <Field label="Ubicación"><input className={inputCls} value={form.ubicacion} onChange={e => setForm({ ...form, ubicacion: e.target.value })} placeholder="Ej: Antofagasta, II Región" /></Field>
          <div className="flex gap-3 pt-2">
            <button onClick={() => setModal(false)} className="flex-1 px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl transition-colors">Cancelar</button>
            <button onClick={save} disabled={saving} className="flex-1 px-4 py-3 bg-gradient-to-r from-slate-700 to-slate-800 hover:opacity-90 disabled:opacity-60 text-white font-bold rounded-xl transition-all">
              {saving ? 'Guardando...' : editId ? 'Actualizar' : 'Crear'}
            </button>
          </div>
        </div>
      </Modal>
      <ConfirmDialog isOpen={!!confirm} onClose={() => setConfirm(null)} onConfirm={del} title="Eliminar Proyecto" message={`¿Eliminar "${confirm?.nombre}"?`} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// SECCIÓN: USUARIOS Y ROLES
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
    setForm({ role: row.role || 'operador', nombre: row.nombre || '', rut: row.rut || '' });
    setEditId(row.id);
    setModal(true);
  };

  const openQR = (row) => {
    const email = row.email || row.id;
    // El QR contiene el email — no se incluye contraseña por seguridad (usan Google Auth)
    setQr({
      title: row.nombre || email,
      subtitle: email,
      qrText: email,
      detail: `Rol: ${row.role || 'operador'}${row.rut ? '  |  RUT: ' + row.rut : ''}`
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      await updateDoc(doc(db, 'users', editId), { role: form.role, nombre: form.nombre.trim(), rut: form.rut.trim(), updatedAt: serverTimestamp() });
      setModal(false);
      load();
    } catch (e) { alert('Error al guardar: ' + e.message); }
    setSaving(false);
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 sm:p-6">
      <SectionHeader title="Usuarios" subtitle="Gestión de accesos y roles del sistema" count={data.length} color="pink"
        icon={<svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>}
      />
      <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-xl flex items-start gap-2">
        <svg className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
        <p className="text-xs text-blue-700">Los usuarios se crean al iniciar sesión con Google. Puedes editar su rol, nombre y RUT. El <strong>QR</strong> contiene el email del usuario para identificación rápida.</p>
      </div>
      <DataTable loading={loading} data={data} onEdit={openEdit} onDelete={() => {}} emptyText="No hay usuarios registrados"
        extraAction={(row) => (
          <button
            onClick={() => openQR(row)}
            className="p-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 rounded-lg transition-colors"
            title="Ver / Descargar QR de acceso"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          </button>
        )}
        columns={[
          { key: 'email', label: 'Email', render: r => <span className="font-mono text-xs">{r.email || r.id}</span> },
          { key: 'nombre', label: 'Nombre' },
          { key: 'rut', label: 'RUT' },
          { key: 'role', label: 'Rol', render: r => <Badge color={roleColor(r.role)}>{r.role || 'operador'}</Badge> },
        ]}
      />
      <Modal isOpen={modal} onClose={() => setModal(false)} title="Editar Usuario" color="pink"
        icon={<svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>}
      >
        <div className="space-y-4">
          <Field label="Nombre Completo"><input className={inputCls} value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} placeholder="Nombre del usuario" /></Field>
          <Field label="RUT"><input className={inputCls} value={form.rut} onChange={e => setForm({ ...form, rut: e.target.value })} placeholder="Ej: 12.345.678-9" /></Field>
          <Field label="Rol" required>
            <select className={selectCls} value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
              {ROLES.map(r => (
                <option key={r} value={r}>
                  {r.charAt(0).toUpperCase() + r.slice(1)}
                  {r === 'administrador' && ' — Acceso total'}
                  {r === 'operador' && ' — Registro de reportes'}
                  {r === 'mandante' && ' — Solo lectura de reportes'}
                </option>
              ))}
            </select>
          </Field>
          {/* Descripción del rol seleccionado */}
          <div className={`p-3 rounded-xl text-xs font-medium ${
            form.role === 'administrador' ? 'bg-purple-50 text-purple-700 border border-purple-200' :
            form.role === 'operador' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
            'bg-amber-50 text-amber-700 border border-amber-200'
          }`}>
            {form.role === 'administrador' && '⚡ Acceso completo: puede ver todo, editar configuraciones y administrar usuarios.'}
            {form.role === 'operador' && '🔧 Puede crear y ver reportes de maquinaria y combustible. Sin acceso a administración.'}
            {form.role === 'mandante' && '👁️ Solo puede ver el Reporte WorkFleet. Sin acceso a edición ni datos internos.'}
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={() => setModal(false)} className="flex-1 px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl transition-colors">Cancelar</button>
            <button onClick={save} disabled={saving} className="flex-1 px-4 py-3 bg-gradient-to-r from-pink-600 to-rose-700 hover:opacity-90 disabled:opacity-60 text-white font-bold rounded-xl transition-all">
              {saving ? 'Guardando...' : 'Actualizar'}
            </button>
          </div>
        </div>
      </Modal>
      <QRCard
        isOpen={!!qr}
        onClose={() => setQr(null)}
        title={qr?.title}
        subtitle={qr?.subtitle}
        qrText={qr?.qrText}
        detail={qr?.detail}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// TABS
// ─────────────────────────────────────────────────────────────
const TABS = [
  { id: 'operadores', label: 'Operadores',  icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z', color: 'blue' },
  { id: 'maquinas',   label: 'Máquinas',    icon: 'M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z', color: 'purple' },
  { id: 'actividades',label: 'Actividades', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01', color: 'green' },
  { id: 'surtidores', label: 'Surtidores',  icon: 'M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z', color: 'amber' },
  { id: 'empresas',   label: 'Empresas',    icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4', color: 'teal' },
  { id: 'proyectos',  label: 'Proyectos',   icon: 'M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z', color: 'slate' },
  { id: 'usuarios',   label: 'Usuarios',    icon: 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z', color: 'pink' },
];

const tabColors = {
  blue:   { active: 'bg-blue-600 text-white shadow-md', dot: 'bg-blue-500' },
  purple: { active: 'bg-purple-600 text-white shadow-md', dot: 'bg-purple-500' },
  green:  { active: 'bg-emerald-600 text-white shadow-md', dot: 'bg-emerald-500' },
  amber:  { active: 'bg-amber-500 text-white shadow-md', dot: 'bg-amber-400' },
  teal:   { active: 'bg-teal-600 text-white shadow-md', dot: 'bg-teal-500' },
  slate:  { active: 'bg-slate-700 text-white shadow-md', dot: 'bg-slate-500' },
  pink:   { active: 'bg-pink-600 text-white shadow-md', dot: 'bg-pink-500' },
};

// ─────────────────────────────────────────────────────────────
// COMPONENTE PRINCIPAL
// ─────────────────────────────────────────────────────────────
export default function AdminPanel() {
  const [activeTab, setActiveTab] = useState('operadores');

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Page Header */}
      <div className="bg-gradient-to-r from-slate-800 to-slate-900 px-4 sm:px-6 py-5 sm:py-7">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-9 h-9 bg-white/10 rounded-xl flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-white">Administración</h1>
              <p className="text-xs text-slate-400">Gestión de datos del sistema WorkFleet</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs — scroll horizontal en mobile */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-sm">
        <div className="max-w-5xl mx-auto px-2 sm:px-6">
          <div className="flex gap-1 overflow-x-auto py-2 scrollbar-none">
            {TABS.map(tab => {
              const isActive = activeTab === tab.id;
              const colors = tabColors[tab.color];
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-bold whitespace-nowrap transition-all flex-shrink-0 ${
                    isActive ? colors.active : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d={tab.icon} />
                  </svg>
                  <span className="hidden xs:inline sm:inline">{tab.label}</span>
                  <span className="xs:hidden sm:hidden">{tab.label.slice(0, 4)}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-5xl mx-auto px-3 sm:px-6 py-5 sm:py-8">
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
