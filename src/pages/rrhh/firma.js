/**
 * RRHH.firma.js — Servicio de Firma Electrónica Simple
 * Integración con ValidaFirma.cl API · Ley 19.799 Chile
 *
 * ⚠️ La API key NO vive acá. Este módulo llama a la Cloud Function
 *    `validafirma` (functions/index.js), que guarda la key como secret
 *    y hace las llamadas a ValidaFirma server-side. Así la key nunca
 *    queda expuesta en el bundle del navegador.
 *
 *    Configurar la key con:
 *      firebase functions:secrets:set VALIDAFIRMA_API_KEY
 *
 * Flujo:
 *   1. crearProcesoDeFirma({ pdfBlob, nombreArchivo, firmantes, docType })
 *      → Sube el PDF y crea el proceso de firma (vía Function)
 *      → En sandbox con saldo 0 (402), simula el proceso automáticamente
 *      → Retorna { procesoId, estado, firmantesUrls, simulated? }
 *
 *   2. consultarEstadoFirma(procesoId)
 *      → Si el ID es simulado (SIM_xxx), retorna estado desde store en memoria
 *      → Si es real, consulta la Function
 *
 *   3. descargarPDFFirmado(procesoId)
 *      → Si simulado, retorna el mismo PDF original
 *      → Si real, descarga vía Function
 *
 * Modo simulado (sandbox sin créditos):
 *   - Se activa automáticamente cuando la Function reporta 402 en sandbox
 *   - Genera IDs con prefijo SIM_
 *   - Progresa automáticamente: enviado →(10s) parcialmente_firmado →(25s) completamente_firmado
 *   - Permite probar toda la UI y flujo Firestore sin créditos reales
 */

// ─── Configuración ────────────────────────────────────────────────────────────

const FUNCTIONS_URL = import.meta.env.VITE_FUNCTIONS_URL
  || 'https://southamerica-west1-mpf-maquinaria.cloudfunctions.net';
const VF_ENDPOINT = `${FUNCTIONS_URL}/validafirma`;

// URL del webhook que ValidaFirma llamará al cambiar el estado de firma.
// Lleva el destino (empresa/colección/doc) para actualizar el documento exacto.
export const webhookUrlFirma = (empresaId, coleccion, docId) =>
  `${FUNCTIONS_URL}/validafirmaWebhook?empresaId=${encodeURIComponent(empresaId)}&coleccion=${encodeURIComponent(coleccion)}&docId=${encodeURIComponent(docId)}`;

// ─── Store en memoria para procesos simulados ─────────────────────────────────

const _simStore = {};
const _simGet = (id) => _simStore[id] || null;
const _simSet = (id, data) => { _simStore[id] = data; };

// ─── Tipos de documento ───────────────────────────────────────────────────────

export const TIPOS_DOC = {
  contrato:  { label: 'Contrato de Trabajo', dias: 30 },
  anexo:     { label: 'Anexo de Contrato',   dias: 15 },
  finiquito: { label: 'Finiquito Laboral',   dias: 10 },
};

// ─── Helpers base64 ↔ Blob ─────────────────────────────────────────────────────

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror   = reject;
    reader.readAsDataURL(blob);
  });
}

function base64ToBlob(b64, type = 'application/pdf') {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}

// ─── Helper: llamada a la Function ──────────────────────────────────────────────

async function callVF(action, { method = 'POST', body, query } = {}) {
  const qs = new URLSearchParams({ action, ...(query || {}) }).toString();
  const res = await fetch(`${VF_ENDPOINT}?${qs}`, {
    method,
    ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
  });
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

// ─── Extraer el ID del proceso de la respuesta de ValidaFirma ──────────────────
// ValidaFirma puede devolver el id bajo distintos nombres (o anidado). Buscamos
// de forma amplia para no perder un proceso que YA se cobró.
const _ID_KEYS = [
  'id', 'proceso_id', 'procesoId', 'documento_id', 'documentoId', 'documentId',
  'documento', 'uuid', 'token', 'folio', 'codigo', 'code', '_id',
];
export function extraerProcesoId(d) {
  if (d == null) return null;
  if (typeof d === 'string' || typeof d === 'number') return String(d);
  if (typeof d !== 'object') return null;
  // Directo
  for (const k of _ID_KEYS) {
    const v = d[k];
    if (v != null && (typeof v === 'string' || typeof v === 'number') && String(v).trim() !== '') return String(v);
  }
  // Anidado un nivel en los wrappers habituales
  for (const wrap of ['documento', 'data', 'proceso', 'resultado', 'result', 'fes']) {
    if (d[wrap] && typeof d[wrap] === 'object') {
      const inner = extraerProcesoId(d[wrap]);
      if (inner) return inner;
    }
  }
  return null;
}

// ─── Crear proceso de firma ───────────────────────────────────────────────────

export async function crearProcesoDeFirma({ pdfBlob, nombreArchivo, firmantes, docType = 'contrato', webhookUrl = '' }) {
  if (!pdfBlob) throw new Error('PDF requerido para iniciar firma');
  if (!firmantes?.length) throw new Error('Al menos un firmante requerido');

  const pdfBase64 = await blobToBase64(pdfBlob);

  const { res, data } = await callVF('crear', {
    body: {
      pdfBase64,
      nombreArchivo: nombreArchivo || 'documento.pdf',
      firmantes: firmantes.map((f) => ({
        email:  f.email,
        nombre: f.nombre,
        rut:    f.rut,
        ...(f.telefono ? { telefono: f.telefono } : {}),
      })),
      ...(webhookUrl ? { webhookUrl } : {}),
    },
  });

  // Respuesta OK → proceso real
  if (res.ok) {
    const d = data.data || data;
    // ValidaFirma envuelve todo en `documento`: { mensaje, documento:{ id,
    // estado, firmantes:[{id,email,nombre,estado,url_firma}] }, creditos:{…} }
    const docObj = d.documento || d;
    // La creación YA consumió créditos. Registramos la respuesta cruda por si
    // el esquema cambiara y el extractor fallara.
    console.info('[ValidaFirma] respuesta creación:', JSON.stringify(d));
    return {
      procesoId:     extraerProcesoId(d),
      estado:        docObj.estado || 'enviado',
      firmantesUrls: docObj.firmantes || [],
      simulated:     false,
      rawResponse:   d,
    };
  }

  // 402 en sandbox → modo simulado automático
  if (res.status === 402 && data.sandbox) {
    console.warn('[ValidaFirma] 402 saldo insuficiente (sandbox) — activando modo simulado');
    return _crearProcesoSimulado({ pdfBlob, nombreArchivo, firmantes, docType });
  }

  throw new Error(`ValidaFirma ${res.status}: ${data.error || 'error desconocido'}`);
}

// ─── Proceso simulado ─────────────────────────────────────────────────────────

function _crearProcesoSimulado({ pdfBlob, nombreArchivo, firmantes, docType }) {
  const procesoId = `SIM_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  const proceso = {
    procesoId,
    estado:        'enviado',
    docType,
    nombreArchivo: nombreArchivo || 'documento.pdf',
    createdAt:     Date.now(),
    pdfBlob,
    firmantes: firmantes.map((f, i) => ({
      id:        i,
      nombre:    f.nombre,
      email:     f.email,
      rut:       f.rut || '',
      estado:    'pendiente',
      url_firma: `https://sandbox.validafirma.cl/firmar/demo/${procesoId}/${i}`,
    })),
    simulated: true,
  };

  _simSet(procesoId, proceso);

  // Auto-progresión: 10s → parcialmente_firmado, 25s → completamente_firmado
  setTimeout(() => _simAvanzar(procesoId, 1), 10_000);
  setTimeout(() => _simAvanzar(procesoId, firmantes.length), 25_000);

  console.info(`[ValidaFirma Simulado] ✓ Proceso creado: ${procesoId}`);
  console.info(`[ValidaFirma Simulado]   → parcialmente_firmado en ~10s`);
  console.info(`[ValidaFirma Simulado]   → completamente_firmado en ~25s`);

  return {
    procesoId,
    estado:        'enviado',
    firmantesUrls: proceso.firmantes,
    simulated:     true,
  };
}

function _simAvanzar(procesoId, firmadosCount) {
  const p = _simGet(procesoId);
  if (!p || p.estado === 'cancelado') return;

  const total = p.firmantes.length;
  p.firmantes = p.firmantes.map((f, i) => ({
    ...f,
    estado:     i < firmadosCount ? 'firmado' : f.estado,
    firmado_at: i < firmadosCount ? new Date().toISOString() : f.firmado_at,
  }));

  p.estado = firmadosCount >= total ? 'completamente_firmado' : 'parcialmente_firmado';
  _simSet(procesoId, p);
  console.info(`[ValidaFirma Simulado] ${procesoId} → ${p.estado}`);
}

// ─── Consultar estado ─────────────────────────────────────────────────────────

export async function consultarEstadoFirma(procesoId) {
  if (!procesoId) throw new Error('procesoId requerido');

  if (procesoId.startsWith('SIM_')) {
    const p = _simGet(procesoId);
    if (!p) throw new Error(`Proceso simulado no encontrado: ${procesoId}. Recarga la página.`);
    const firmadoPor = p.firmantes.filter(f => f.estado === 'firmado').map(f => f.nombre || f.email);
    const completado  = p.estado === 'completamente_firmado';
    return {
      estado:           p.estado,
      totalFirmantes:   p.firmantes.length,
      firmasPendientes: p.firmantes.filter(f => f.estado !== 'firmado').length,
      firmadoPor,
      completado,
      pdfFirmadoUrl:    completado ? `sim://pdf/${procesoId}` : null,
      simulated:        true,
      firmantes:        p.firmantes,
    };
  }

  const { res, data: raw } = await callVF('estado', { method: 'GET', query: { procesoId } });
  if (!res.ok) throw new Error(`ValidaFirma ${res.status}: ${raw.error || 'error desconocido'}`);
  // La respuesta viene envuelta en `documento` (igual que la creación).
  const d0 = raw.data || raw;
  const data = d0.documento || d0;
  const firmantes = data.firmantes || [];
  const firmadoPor = firmantes.filter(f => f.estado === 'firmado').map(f => f.nombre || f.email);
  return {
    estado:           data.estado,
    totalFirmantes:   firmantes.length,
    firmasPendientes: firmantes.filter(f => f.estado !== 'firmado').length,
    firmadoPor,
    completado:       esFirmadoCompleto(data.estado),
    pdfFirmadoUrl:    data.documento_firmado_url || data.pdf_firmado_url || data.url_documento_firmado || null,
    firmantes,
    simulated:        false,
    rawResponse:      data,
  };
}

// ─── Listar documentos existentes (para reconciliar/vincular sin cobrar) ───────

export async function listarDocumentos() {
  const { res, data: raw } = await callVF('listar', { method: 'GET' });
  if (!res.ok) throw new Error(`ValidaFirma ${res.status}: ${raw.error || 'error desconocido'}`);
  const d = raw.data || raw;
  const arr = Array.isArray(d) ? d
    : Array.isArray(d?.documentos) ? d.documentos
    : Array.isArray(d?.data) ? d.data
    : Array.isArray(d?.items) ? d.items
    : [];
  return arr;
}

// ─── Descargar PDF firmado ────────────────────────────────────────────────────

export async function descargarPDFFirmado(procesoId) {
  if (!procesoId) throw new Error('procesoId requerido');

  if (procesoId.startsWith('SIM_')) {
    const p = _simGet(procesoId);
    if (!p) throw new Error(`Proceso simulado no encontrado: ${procesoId}`);
    if (p.estado !== 'completamente_firmado') throw new Error('El documento aún no está completamente firmado');
    console.info('[ValidaFirma Simulado] Descargando PDF original (firma simulada)');
    return p.pdfBlob;
  }

  const { res, data } = await callVF('descargar', { method: 'GET', query: { procesoId } });
  if (!res.ok) throw new Error(`Error descargando PDF firmado: ${res.status} ${data.error || ''}`);
  if (!data.pdfBase64) throw new Error('La Function no devolvió el PDF firmado');
  return base64ToBlob(data.pdfBase64);
}

// ─── Cancelar proceso ─────────────────────────────────────────────────────────

export async function cancelarProcesoDeFirma(procesoId) {
  if (procesoId?.startsWith('SIM_')) {
    const p = _simGet(procesoId);
    if (p) { p.estado = 'cancelado'; _simSet(procesoId, p); }
    return { success: true, simulated: true };
  }
  const { res, data } = await callVF('cancelar', { body: { procesoId } });
  if (!res.ok) throw new Error(`ValidaFirma ${res.status}: ${data.error || 'error desconocido'}`);
  return data.data || data;
}

// ─── Reenviar solicitud ───────────────────────────────────────────────────────

export async function reenviarSolicitudFirma(procesoId, email) {
  if (procesoId?.startsWith('SIM_')) {
    console.info(`[ValidaFirma Simulado] Reenvío simulado a ${email}`);
    return { success: true, simulated: true };
  }
  const { res, data } = await callVF('reenviar', { body: { procesoId, email } });
  if (!res.ok) throw new Error(`ValidaFirma ${res.status}: ${data.error || 'error desconocido'}`);
  return data.data || data;
}

// ─── Helpers de UI ────────────────────────────────────────────────────────────

export const ESTADOS_FIRMA = {
  sin_enviar:            { label: 'Sin enviar',    color: 'text-slate-400',   bg: 'bg-slate-100',  dot: '○' },
  enviado:               { label: 'Enviado',       color: 'text-blue-600',    bg: 'bg-blue-50',    dot: '●' },
  parcialmente_firmado:  { label: 'Firma parcial', color: 'text-amber-600',   bg: 'bg-amber-50',   dot: '◑' },
  completamente_firmado: { label: 'Firmado',       color: 'text-emerald-600', bg: 'bg-emerald-50', dot: '✓' },
  completado:            { label: 'Firmado',       color: 'text-emerald-600', bg: 'bg-emerald-50', dot: '✓' },
  finalizado:           { label: 'Firmado',       color: 'text-emerald-600', bg: 'bg-emerald-50', dot: '✓' },
  expirado:              { label: 'Expirado',      color: 'text-red-500',     bg: 'bg-red-50',     dot: '✕' },
  cancelado:             { label: 'Cancelado',     color: 'text-slate-500',   bg: 'bg-slate-100',  dot: '✕' },
  pendiente:             { label: 'Pendiente',     color: 'text-slate-400',   bg: 'bg-slate-100',  dot: '○' },
  firmado:               { label: 'Firmado',       color: 'text-emerald-600', bg: 'bg-emerald-50', dot: '✓' },
  ratificado:            { label: 'Ratificado',    color: 'text-purple-600',  bg: 'bg-purple-50',  dot: '★' },
};

export function badgeFirma(estado) {
  const e = ESTADOS_FIRMA[estado] || ESTADOS_FIRMA.sin_enviar;
  return `inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full ${e.color} ${e.bg}`;
}

export function esProcesoSimulado(procesoId) {
  return typeof procesoId === 'string' && procesoId.startsWith('SIM_');
}

// Estados que representan "documento firmado por completo". ValidaFirma podría
// usar distintas variantes; las cubrimos todas para no dejar un firmado sin marcar.
export const ESTADOS_COMPLETADOS = ['completamente_firmado', 'firmado', 'completado', 'finalizado'];
export function esFirmadoCompleto(estado) {
  return ESTADOS_COMPLETADOS.includes(estado);
}

// ─── Demo sin API key ─────────────────────────────────────────────────────────

export function crearProcesoDeFirmaDemo({ firmantes = [] }) {
  console.warn('[ValidaFirma] Modo demo — proceso simulado local');
  return _crearProcesoSimulado({ pdfBlob: null, nombreArchivo: 'demo.pdf', firmantes, docType: 'contrato' });
}

export default {
  crearProcesoDeFirma, consultarEstadoFirma,
  descargarPDFFirmado, cancelarProcesoDeFirma,
  reenviarSolicitudFirma, crearProcesoDeFirmaDemo,
  esProcesoSimulado, ESTADOS_FIRMA, TIPOS_DOC, badgeFirma,
};
