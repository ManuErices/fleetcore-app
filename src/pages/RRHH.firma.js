/**
 * RRHH.firma.js — Servicio de Firma Electrónica Simple
 * Integración con ValidaFirma.cl API · Ley 19.799 Chile
 *
 * Configuración:
 *   VITE_VALIDAFIRMA_API_KEY=tu_api_key   (en .env)
 *   VITE_VALIDAFIRMA_ENV=sandbox | production
 *
 * Flujo:
 *   1. generateAndSign({ pdf, firmantes, docId, docType, meta })
 *      → Sube el PDF a ValidaFirma y crea el proceso de firma
 *      → Retorna { procesoId, estado, firmantesUrls }
 *
 *   2. checkStatus(procesoId)
 *      → Consulta el estado del proceso
 *      → Retorna { estado, firmado, pdfFirmadoUrl }
 *
 *   3. downloadSigned(procesoId)
 *      → Descarga el PDF firmado como Blob
 *
 * Estados de firma en Firestore:
 *   sin_enviar → enviado → parcialmente_firmado → completamente_firmado → expirado
 */

// ─── Configuración ────────────────────────────────────────────────────────────

// ValidaFirma usa un único endpoint para test y producción.
// La key vf_test_xxx activa el modo sandbox automáticamente.
const API_BASE = 'https://api.validafirma.cl';

const API_KEY = import.meta.env.VITE_VALIDAFIRMA_API_KEY || '';

const HEADERS = {
  'accept':    'application/json',
  'X-API-Key': API_KEY,
};

// ─── Helper fetch ─────────────────────────────────────────────────────────────

async function vfFetch(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { ...HEADERS, ...(options.headers || {}) },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`ValidaFirma API ${res.status}: ${text}`);
  }
  return res.json();
}

// ─── Tipos de documento ───────────────────────────────────────────────────────

export const TIPOS_DOC = {
  contrato: { label: 'Contrato de Trabajo',        dias: 30 },
  anexo:    { label: 'Anexo de Contrato',           dias: 15 },
  finiquito:{ label: 'Finiquito Laboral',           dias: 10 },
};

// ─── Crear proceso de firma ───────────────────────────────────────────────────

/**
 * Inicia el proceso de firma de un documento.
 *
 * @param {Object} params
 * @param {Blob}   params.pdfBlob        — PDF generado por RRHH.pdfs.jsx
 * @param {string} params.nombreArchivo  — ej: "Contrato_Gonzalez_2026.pdf"
 * @param {Array}  params.firmantes      — [{ nombre, email, rut, telefono? }]
 * @param {string} params.docType        — 'contrato' | 'anexo' | 'finiquito'
 * @param {string} params.webhookUrl     — URL para notificaciones (opcional)
 * @returns {{ procesoId, estado, urls }}
 */
export async function crearProcesoDeFirma({ pdfBlob, nombreArchivo, firmantes, docType = 'contrato', webhookUrl = '' }) {
  if (!API_KEY) throw new Error('VITE_VALIDAFIRMA_API_KEY no configurada. Revisa tu archivo .env');
  if (!pdfBlob) throw new Error('PDF requerido para iniciar firma');
  if (!firmantes?.length) throw new Error('Al menos un firmante requerido');

  const formData = new FormData();
  formData.append('documento', pdfBlob, nombreArchivo || 'documento.pdf');
  formData.append('firmantes', JSON.stringify(
    firmantes.map(f => ({
      email:    f.email,
      nombre:   f.nombre,
      rut:      f.rut,
      ...(f.telefono ? { telefono: f.telefono } : {}),
    }))
  ));
  formData.append('requiere_todas_firmas', 'true');
  formData.append('sin_caratula', 'false');
  if (webhookUrl) formData.append('webhook_url', webhookUrl);

  const data = await fetch(`${API_BASE}/api/fes/documentos`, {
    method: 'POST',
    headers: { 'accept': 'application/json', 'X-API-Key': API_KEY },
    body: formData,
  }).then(async r => {
    if (!r.ok) throw new Error(`ValidaFirma ${r.status}: ${await r.text()}`);
    return r.json();
  });

  return {
    procesoId:    data.id || data.proceso_id || data.documento_id,
    estado:       data.estado || 'enviado',
    firmantesUrls: data.firmantes || [],
    rawResponse:  data,
  };
}

// ─── Consultar estado ─────────────────────────────────────────────────────────

/**
 * Obtiene el estado actual del proceso de firma.
 * @returns {{ estado, totalFirmantes, firmadoPor, completado, pdfFirmadoUrl }}
 */
export async function consultarEstadoFirma(procesoId) {
  if (!procesoId) throw new Error('procesoId requerido');
  const data = await vfFetch(`/api/fes/documentos/${procesoId}`);
  const firmadoPor = (data.firmantes || []).filter(f => f.estado === 'firmado').map(f => f.nombre || f.email);
  return {
    estado:          data.estado,
    totalFirmantes:  data.firmantes?.length || 0,
    firmasPendientes:(data.firmantes || []).filter(f => f.estado !== 'firmado').length,
    firmadoPor,
    completado:      data.estado === 'completamente_firmado' || data.estado === 'firmado',
    pdfFirmadoUrl:   data.documento_firmado_url || data.pdf_firmado_url || null,
    rawResponse:     data,
  };
}

// ─── Descargar PDF firmado ────────────────────────────────────────────────────

/**
 * Descarga el PDF firmado como Blob.
 */
export async function descargarPDFFirmado(procesoId) {
  const res = await fetch(`${API_BASE}/api/fes/documentos/${procesoId}/descargar`, {
    headers: HEADERS,
  });
  if (!res.ok) throw new Error(`Error descargando PDF firmado: ${res.status}`);
  return res.blob();
}

// ─── Cancelar proceso ─────────────────────────────────────────────────────────

export async function cancelarProcesoDeFirma(procesoId) {
  return vfFetch(`/api/fes/documentos/${procesoId}/cancelar`, { method: 'POST' });
}

// ─── Reenviar solicitud ───────────────────────────────────────────────────────

export async function reenviarSolicitudFirma(procesoId, email) {
  return vfFetch(`/api/fes/documentos/${procesoId}/reenviar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
}

// ─── Helpers de UI ────────────────────────────────────────────────────────────

export const ESTADOS_FIRMA = {
  sin_enviar:             { label: 'Sin enviar',         color: 'text-slate-400',   bg: 'bg-slate-100',   dot: '○' },
  enviado:                { label: 'Enviado',            color: 'text-blue-600',    bg: 'bg-blue-50',     dot: '●' },
  parcialmente_firmado:   { label: 'Firma parcial',      color: 'text-amber-600',   bg: 'bg-amber-50',    dot: '◑' },
  completamente_firmado:  { label: 'Firmado',            color: 'text-emerald-600', bg: 'bg-emerald-50',  dot: '✓' },
  expirado:               { label: 'Expirado',           color: 'text-red-500',     bg: 'bg-red-50',      dot: '✕' },
  cancelado:              { label: 'Cancelado',          color: 'text-slate-500',   bg: 'bg-slate-100',   dot: '✕' },
  // estados legacy (manual)
  pendiente:              { label: 'Pendiente',          color: 'text-slate-400',   bg: 'bg-slate-100',   dot: '○' },
  firmado:                { label: 'Firmado',            color: 'text-emerald-600', bg: 'bg-emerald-50',  dot: '✓' },
  ratificado:             { label: 'Ratificado',         color: 'text-purple-600',  bg: 'bg-purple-50',   dot: '★' },
};

export function badgeFirma(estado) {
  const e = ESTADOS_FIRMA[estado] || ESTADOS_FIRMA.sin_enviar;
  return `inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full ${e.color} ${e.bg}`;
}

// ─── Modo demo/sandbox sin API key ────────────────────────────────────────────

/**
 * Simula el proceso de firma cuando no hay API key configurada.
 * Útil para desarrollo local sin cuenta ValidaFirma.
 */
export function crearProcesoDeFirmaDemo({ firmantes = [] }) {
  const id = `DEMO_${Date.now()}`;
  console.warn('[ValidaFirma] Modo demo — sin API key configurada');
  return {
    procesoId: id,
    estado: 'enviado',
    firmantesUrls: firmantes.map(f => ({
      nombre: f.nombre,
      email:  f.email,
      url:    `https://sandbox.validafirma.cl/firmar/${id}`,
      estado: 'pendiente',
    })),
    demo: true,
  };
}

export default {
  crearProcesoDeFirma, consultarEstadoFirma,
  descargarPDFFirmado, cancelarProcesoDeFirma,
  reenviarSolicitudFirma, crearProcesoDeFirmaDemo,
  ESTADOS_FIRMA, TIPOS_DOC, badgeFirma,
};
