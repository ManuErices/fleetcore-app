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
// ─────────────────────────────────────────────────────────────
// GENERADOR DE QR — usa qrcode-generator (cargado dinámicamente)
// ─────────────────────────────────────────────────────────────
// Hook que genera un QR como dataURL PNG usando el canvas del navegador
// y la librería qrcode-generator cargada desde CDN
const useQRDataURL = (text, isOpen) => {
  const [dataURL, setDataURL] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen || !text) { setDataURL(''); return; }
    setLoading(true);

    const generate = (qrlib) => {
      try {
        const qr = qrlib(0, 'M');
        qr.addData(text);
        qr.make();
        const modules = qr.getModuleCount();
        const px = 8;
        const margin = 4;
        const size = (modules + margin * 2) * px;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, size, size);
        ctx.fillStyle = '#000000';
        for (let r = 0; r < modules; r++) {
          for (let c = 0; c < modules; c++) {
            if (qr.isDark(r, c)) {
              ctx.fillRect((c + margin) * px, (r + margin) * px, px, px);
            }
          }
        }
        setDataURL(canvas.toDataURL('image/png'));
      } catch (e) {
        console.error('QR error:', e);
        setDataURL('');
      }
      setLoading(false);
    };

    // Cargar qrcode-generator desde CDN si no está disponible
    if (window.qrcode) {
      generate(window.qrcode);
    } else {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
      script.onload = () => {
        // qrcodejs usa new QRCode(...), necesitamos qrcode-generator
        // Usar alternativa embebida simple
        generateFallback();
      };
      script.onerror = () => generateFallback();
      // No cargar script externo — usar implementación embebida directa
      generateFallback();

      function generateFallback() {
        // Implementación QR embebida mínima y correcta
        generateEmbedded(text, generate);
      }
    }
  }, [text, isOpen]);

  return { dataURL, loading };
};

// Implementación QR embebida usando el algoritmo estándar
const generateEmbedded = (text, callback) => {
  // Crear un canvas directamente con una implementación simple de QR
  // Usamos el objeto qrcode de https://github.com/kazuhikoarase/qrcode-generator
  // pre-compilado e inlineado aquí en forma compacta
  
  const makeQR = (() => {
    const PAD0 = 0xEC, PAD1 = 0x11;
    const PATTERN_POSITION_TABLE = [
      [], [6,18], [6,22], [6,26], [6,30], [6,34],
      [6,22,38], [6,24,42], [6,28,46], [6,32,50],
      [6,28,50,57], [6,22,48,60]
    ];
    const G15 = (1 << 10) | (1 << 8) | (1 << 5) | (1 << 4) | (1 << 2) | (1 << 1) | (1 << 0);
    const G18 = (1 << 12) | (1 << 11) | (1 << 10) | (1 << 9) | (1 << 8) | (1 << 5) | (1 << 2) | (1 << 0);
    const G15_MASK = (1 << 14) | (1 << 12) | (1 << 10) | (1 << 4) | (1 << 1);

    const getBCHTypeInfo = (data) => {
      let d = data << 10;
      while (getBCHDigit(d) - getBCHDigit(G15) >= 0)
        d ^= (G15 << (getBCHDigit(d) - getBCHDigit(G15)));
      return ((data << 10) | d) ^ G15_MASK;
    };
    const getBCHTypeNumber = (data) => {
      let d = data << 12;
      while (getBCHDigit(d) - getBCHDigit(G18) >= 0)
        d ^= (G18 << (getBCHDigit(d) - getBCHDigit(G18)));
      return (data << 12) | d;
    };
    const getBCHDigit = (data) => {
      let digit = 0;
      while (data !== 0) { digit++; data >>>= 1; }
      return digit;
    };

    // Tabla EXP/LOG para GF(256)
    const EXP_TABLE = new Array(256);
    const LOG_TABLE = new Array(256);
    (() => {
      for (let i = 0; i < 8; i++) EXP_TABLE[i] = 1 << i;
      for (let i = 8; i < 256; i++) EXP_TABLE[i] = EXP_TABLE[i-4] ^ EXP_TABLE[i-5] ^ EXP_TABLE[i-6] ^ EXP_TABLE[i-8];
      for (let i = 0; i < 255; i++) LOG_TABLE[EXP_TABLE[i]] = i;
    })();

    const gexp = i => EXP_TABLE[i % 255];
    const glog = n => { if (n < 1) throw Error('glog(' + n + ')'); return LOG_TABLE[n]; };

    const RS_BLOCK_TABLE = [
      null,
      [1, 26, 16], [1, 44, 28], [1, 70, 44],
      [2, 50, 32], [2, 67, 43], [4, 43, 27],
      [4, 49, 31], [2, 34, 22, 4, 35, 23], [2, 30, 19, 4, 31, 20],
      [4, 26, 16, 2, 27, 17]
    ];

    const getRSBlocks = (typeNumber) => {
      const rsBlock = RS_BLOCK_TABLE[typeNumber];
      if (!rsBlock) return [{ totalCount: 1, dataCount: 1 }];
      const blocks = [];
      for (let i = 0; i < rsBlock.length; i += 3) {
        for (let j = 0; j < rsBlock[i]; j++)
          blocks.push({ totalCount: rsBlock[i+1], dataCount: rsBlock[i+2] });
      }
      return blocks;
    };

    const createBytes = (buffer, rsBlocks) => {
      let offset = 0, maxDcCount = 0, maxEcCount = 0;
      const dcdata = rsBlocks.map(rsBlock => {
        const dcCount = rsBlock.dataCount;
        const ecCount = rsBlock.totalCount - dcCount;
        maxDcCount = Math.max(maxDcCount, dcCount);
        maxEcCount = Math.max(maxEcCount, ecCount);
        const dc = buffer.slice(offset, offset + dcCount).map(b => b & 0xff);
        offset += dcCount;
        // RS error correction
        const rsPoly = (() => {
          let p = [1];
          for (let i = 0; i < ecCount; i++) {
            const q = [1, gexp(i)];
            const r = new Array(p.length + q.length - 1).fill(0);
            for (let j = 0; j < p.length; j++)
              for (let k = 0; k < q.length; k++)
                r[j+k] ^= gexp((glog(p[j]) + glog(q[k])) % 255);
            p = r;
          }
          return p;
        })();
        const modPoly = [...dc, ...new Array(rsPoly.length - 1).fill(0)];
        for (let i = 0; i < dc.length; i++) {
          const coef = modPoly[i];
          if (coef !== 0)
            for (let j = 0; j < rsPoly.length; j++)
              modPoly[i + j] ^= gexp((glog(rsPoly[j]) + glog(coef)) % 255);
        }
        return { dc, ec: modPoly.slice(dc.length) };
      });

      const data = [];
      for (let i = 0; i < maxDcCount; i++)
        dcdata.forEach(({ dc }) => { if (i < dc.length) data.push(dc[i]); });
      for (let i = 0; i < maxEcCount; i++)
        dcdata.forEach(({ ec }) => { if (i < ec.length) data.push(ec[i]); });
      return data;
    };

    return (text) => {
      // Convertir texto a bytes UTF-8
      const bytes = [];
      for (let i = 0; i < text.length; i++) {
        const c = text.charCodeAt(i);
        if (c < 128) bytes.push(c);
        else if (c < 2048) { bytes.push(0xC0 | (c >> 6)); bytes.push(0x80 | (c & 63)); }
        else { bytes.push(0xE0 | (c >> 12)); bytes.push(0x80 | ((c >> 6) & 63)); bytes.push(0x80 | (c & 63)); }
      }

      // Seleccionar versión mínima (modo byte, EC level M)
      const DATA_CAPACITY = [0, 7, 11, 15, 20, 26, 18, 20, 24, 30, 18, 20];
      // Encontrar versión que acomode los bytes
      let typeNumber = 1;
      while (typeNumber < 11 && DATA_CAPACITY[typeNumber] < bytes.length + 3) typeNumber++;
      if (typeNumber > 10) typeNumber = 10;

      const moduleCount = typeNumber * 4 + 17;
      const modules = Array.from({ length: moduleCount }, () => new Array(moduleCount).fill(null));
      const isFunction = Array.from({ length: moduleCount }, () => new Array(moduleCount).fill(false));

      const setModule = (row, col, v) => {
        modules[row][col] = v;
        isFunction[row][col] = true;
      };

      // Finder patterns
      const setupFinderPattern = (row, col) => {
        for (let r = -1; r <= 7; r++) for (let c = -1; c <= 7; c++) {
          if (row + r < 0 || moduleCount <= row + r || col + c < 0 || moduleCount <= col + c) continue;
          const v = (0 <= r && r <= 6 && (c === 0 || c === 6)) ||
            (0 <= c && c <= 6 && (r === 0 || r === 6)) ||
            (2 <= r && r <= 4 && 2 <= c && c <= 4);
          setModule(row + r, col + c, v);
        }
      };
      setupFinderPattern(0, 0);
      setupFinderPattern(moduleCount - 7, 0);
      setupFinderPattern(0, moduleCount - 7);

      // Separators
      for (let r = 0; r < 8; r++) {
        if (modules[r][7] === null) setModule(r, 7, false);
        if (modules[7][r] === null) setModule(7, r, false);
        if (modules[moduleCount - r - 1][7] === null) setModule(moduleCount - r - 1, 7, false);
        if (modules[moduleCount - 8][r] === null) setModule(moduleCount - 8, r, false);
        if (modules[r][moduleCount - 8] === null) setModule(r, moduleCount - 8, false);
        if (modules[7][moduleCount - r - 1] === null) setModule(7, moduleCount - r - 1, false);
      }

      // Timing patterns
      for (let r = 8; r < moduleCount - 8; r++) {
        if (modules[r][6] === null) setModule(r, 6, r % 2 === 0);
        if (modules[6][r] === null) setModule(6, r, r % 2 === 0);
      }

      // Dark module
      setModule(moduleCount - 8, 8, true);

      // Alignment patterns
      const pos = PATTERN_POSITION_TABLE[typeNumber - 1] || [];
      for (const r of pos) for (const c of pos) {
        if (isFunction[r][c]) continue;
        for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++)
          setModule(r + dr, c + dc, Math.abs(dr) === 2 || Math.abs(dc) === 2 || (dr === 0 && dc === 0));
      }

      // Format info (máscara 0, EC level M = 0b01)
      const formatInfo = getBCHTypeInfo((0b01 << 3) | 0); // EC=M, mask=0
      for (let i = 0; i < 15; i++) {
        const v = ((formatInfo >> i) & 1) === 1;
        if (i < 6) { setModule(i, 8, v); setModule(8, i, v); }
        else if (i < 8) { setModule(i + 1, 8, v); setModule(8, moduleCount - 7 + (i - 8), v); }
        else { setModule(moduleCount - 15 + i, 8, v); setModule(8, 14 - i, v); }
      }

      // Construir buffer de datos
      const rsBlocks = getRSBlocks(typeNumber);
      const totalDataCount = rsBlocks.reduce((s, b) => s + b.dataCount, 0);
      const buffer = [];
      // Mode indicator (4 bits: byte = 0100) + length (8 bits) + data
      const header = (0x4 << 4) | (bytes.length >> 4);
      buffer.push(header);
      // Simplificado: empujar modo+largo+datos como stream de bits
      let bitBuffer = [];
      const push = (v, n) => { for (let i = n-1; i >= 0; i--) bitBuffer.push((v >> i) & 1); };
      push(0b0100, 4);
      push(bytes.length, 8);
      for (const b of bytes) push(b, 8);
      for (let i = 0; i < 4 && bitBuffer.length < totalDataCount * 8; i++) bitBuffer.push(0);
      while (bitBuffer.length % 8) bitBuffer.push(0);
      const dataBytes = [];
      for (let i = 0; i < bitBuffer.length; i += 8) {
        let b = 0;
        for (let j = 0; j < 8; j++) b = (b << 1) | bitBuffer[i + j];
        dataBytes.push(b);
      }
      let pi = 0;
      while (dataBytes.length < totalDataCount) { dataBytes.push([PAD0, PAD1][pi]); pi = 1 - pi; }

      const allBytes = createBytes(dataBytes, rsBlocks);

      // Colocar datos en la matriz
      let byteIdx = 0, bitIdx = 7;
      for (let right = moduleCount - 1; right >= 1; right -= 2) {
        if (right === 6) right = 5;
        for (let vert = 0; vert < moduleCount; vert++) {
          for (let j = 0; j < 2; j++) {
            const upward = ((right + 1) & 2) === 0;
            const col = right - j;
            const row = upward ? moduleCount - 1 - vert : vert;
            if (isFunction[row][col] || modules[row][col] !== null) continue;
            let dark = false;
            if (byteIdx < allBytes.length) dark = ((allBytes[byteIdx] >> bitIdx) & 1) === 1;
            // Máscara 0: (row + col) % 2 === 0
            if ((row + col) % 2 === 0) dark = !dark;
            modules[row][col] = dark;
            bitIdx--;
            if (bitIdx < 0) { bitIdx = 7; byteIdx++; }
          }
        }
      }

      return { modules, moduleCount };
    };
  })();

  try {
    const { modules, moduleCount } = makeQR(text);
    const px = 8, margin = 4;
    const size = (moduleCount + margin * 2) * px;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#000000';
    for (let r = 0; r < moduleCount; r++)
      for (let c = 0; c < moduleCount; c++)
        if (modules[r][c]) ctx.fillRect((c + margin) * px, (r + margin) * px, px, px);
    callback({ getModuleCount: () => moduleCount, isDark: (r, c) => modules[r][c], _canvas: canvas, _dataURL: canvas.toDataURL('image/png') });
  } catch (e) {
    console.error('QR fallback error:', e);
    callback(null);
  }
};

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
function QRCard({ isOpen, onClose, title, qrText }) {
  const canvasRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!isOpen || !qrText) { setReady(false); setError(false); return; }
    setReady(false);
    setError(false);
    // Pequeño delay para que el DOM monte el canvas
    const t = setTimeout(() => {
      try {
        generateEmbedded(qrText, (result) => {
          if (!result || !canvasRef.current) { setError(true); return; }
          const dest = canvasRef.current;
          const src = result._canvas;
          if (!src) { setError(true); return; }
          // Escalar 3x para buena resolución
          const scale = 3;
          dest.width = src.width * scale;
          dest.height = src.height * scale;
          const ctx = dest.getContext('2d');
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(src, 0, 0, dest.width, dest.height);
          setReady(true);
        });
      } catch (e) {
        console.error('QR render error:', e);
        setError(true);
      }
    }, 50);
    return () => clearTimeout(t);
  }, [isOpen, qrText]);

  const downloadPNG = () => {
    if (!canvasRef.current || !ready) return;
    const a = document.createElement('a');
    a.href = canvasRef.current.toDataURL('image/png');
    a.download = `QR_${(title || qrText).replace(/[^a-zA-Z0-9_-]/g, '_')}.png`;
    a.click();
  };

  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:max-w-xs bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-800 to-slate-900 p-4 flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-black text-white truncate">QR — {title}</h3>
            <p className="text-xs text-slate-400 font-mono truncate mt-0.5">{qrText}</p>
          </div>
          <button onClick={onClose} className="p-1.5 bg-white/10 hover:bg-white/20 rounded-lg transition-colors flex-shrink-0">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* QR Canvas */}
        <div className="p-4 flex flex-col items-center gap-3">
          <div className="p-3 bg-white border-2 border-slate-200 rounded-xl shadow-inner flex items-center justify-center" style={{ minHeight: 180 }}>
            {error ? (
              <p className="text-sm text-red-500 text-center px-4">Error generando QR.<br/>Código vacío o inválido.</p>
            ) : (
              <canvas
                ref={canvasRef}
                className={ready ? 'block' : 'hidden'}
                style={{ imageRendering: 'pixelated', width: 180, height: 180 }}
              />
            )}
            {!ready && !error && (
              <div className="flex flex-col items-center gap-2 text-slate-400">
                <div className="w-6 h-6 border-2 border-slate-200 border-t-slate-500 rounded-full animate-spin" />
                <span className="text-xs">Generando...</span>
              </div>
            )}
          </div>

          <button
            onClick={downloadPNG}
            disabled={!ready}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-slate-800 to-slate-900 hover:opacity-90 active:scale-95 disabled:opacity-40 text-white font-bold text-sm rounded-xl transition-all shadow-md"
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
    setQr({
      title: row.name || row.code || row.patente,
      qrText: row.code || row.patente || row.id,
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
      <QRCard isOpen={!!qr} onClose={() => setQr(null)} title={qr?.title} qrText={qr?.qrText} />
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
    setQr({
      title: row.nombre || row.email || row.id,
      qrText: row.email || row.id,
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
        qrText={qr?.qrText}
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
