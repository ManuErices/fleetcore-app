/**
 * RRHH.firma.js — Servicio de Firma Electrónica Simple
 * Integración con ValidaFirma.cl API · Ley 19.799 Chile
 *
 * Configuración:
 *   VITE_VALIDAFIRMA_API_KEY=tu_api_key   (en .env)
 *
 * Flujo:
 *   1. crearProcesoDeFirma({ pdfBlob, nombreArchivo, firmantes, docType })
 *      → Sube el PDF y crea el proceso de firma
 *      → En sandbox con saldo 0 (402), simula el proceso automáticamente
 *      → Retorna { procesoId, estado, firmantesUrls, simulated? }
 *
 *   2. consultarEstadoFirma(procesoId)
 *      → Si el ID es simulado (SIM_xxx), retorna estado desde store en memoria
 *      → Si es real, consulta ValidaFirma API
 *
 *   3. descargarPDFFirmado(procesoId)
 *      → Si simulado, retorna el mismo PDF original
 *      → Si real, descarga desde ValidaFirma
 *
 * Modo simulado (sandbox sin créditos):
 *   - Se activa automáticamente cuando la API retorna 402
 *   - Genera IDs con prefijo SIM_
 *   - Progresa automáticamente: enviado →(10s) parcialmente_firmado →(25s) completamente_firmado
 *   - Permite probar toda la UI y flujo Firestore sin créditos reales
 */

// ─── Configuración ────────────────────────────────────────────────────────────

const API_KEY  = import.meta.env.VITE_VALIDAFIRMA_API_KEY || '';
const IS_SANDBOX = API_KEY.startsWith('vf_test_');
const API_BASE = IS_SANDBOX
  ? 'https://sandbox.validafirma.cl'
  : 'https://api.validafirma.cl';

const HEADERS = {
  'accept':    'application/json',
  'X-API-Key': API_KEY,
};

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

// ─── Helper fetch ─────────────────────────────────────────────────────────────

async function vfFetch(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { ...HEADERS, ...(options.headers || {}) },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    const err = new Error(`ValidaFirma API ${res.status}: ${text}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

// ─── Crear proceso de firma ───────────────────────────────────────────────────

export async function crearProcesoDeFirma({ pdfBlob, nombreArchivo, firmantes, docType = 'contrato', webhookUrl = '' }) {
  if (!API_KEY) throw new Error('VITE_VALIDAFIRMA_API_KEY no configurada. Revisa tu archivo .env');
  if (!pdfBlob) throw new Error('PDF requerido para iniciar firma');
  if (!firmantes?.length) throw new Error('Al menos un firmante requerido');

  const formData = new FormData();
  formData.append('documento', pdfBlob, nombreArchivo || 'documento.pdf');
  formData.append('firmantes', JSON.stringify(
    firmantes.map(f => ({
      email:  f.email,
      nombre: f.nombre,
      rut:    f.rut,
      ...(f.telefono ? { telefono: f.telefono } : {}),
    }))
  ));
  formData.append('requiere_todas_firmas', 'true');
  formData.append('sin_caratula', 'false');
  if (webhookUrl) formData.append('webhook_url', webhookUrl);

  const res = await fetch(`${API_BASE}/api/fes/documentos`, {
    method: 'POST',
    headers: { 'accept': 'application/json', 'X-API-Key': API_KEY },
    body: formData,
  });

  // Respuesta OK → proceso real
  if (res.ok) {
    const data = await res.json();
    return {
      procesoId:     data.id || data.proceso_id || data.documento_id,
      estado:        data.estado || 'enviado',
      firmantesUrls: data.firmantes || [],
      simulated:     false,
      rawResponse:   data,
    };
  }

  // 402 en sandbox → modo simulado automático
  if (res.status === 402 && IS_SANDBOX) {
    console.warn('[ValidaFirma] 402 saldo insuficiente — activando modo simulado sandbox');
    return _crearProcesoSimulado({ pdfBlob, nombreArchivo, firmantes, docType });
  }

  const text = await res.text().catch(() => res.statusText);
  throw new Error(`ValidaFirma ${res.status}: ${text}`);
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

  const data = await vfFetch(`/api/fes/documentos/${procesoId}`);
  const firmadoPor = (data.firmantes || []).filter(f => f.estado === 'firmado').map(f => f.nombre || f.email);
  return {
    estado:           data.estado,
    totalFirmantes:   data.firmantes?.length || 0,
    firmasPendientes: (data.firmantes || []).filter(f => f.estado !== 'firmado').length,
    firmadoPor,
    completado:       data.estado === 'completamente_firmado' || data.estado === 'firmado',
    pdfFirmadoUrl:    data.documento_firmado_url || data.pdf_firmado_url || null,
    simulated:        false,
    rawResponse:      data,
  };
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

  const res = await fetch(`${API_BASE}/api/fes/documentos/${procesoId}/descargar`, { headers: HEADERS });
  if (!res.ok) throw new Error(`Error descargando PDF firmado: ${res.status}`);
  return res.blob();
}

// ─── Cancelar proceso ─────────────────────────────────────────────────────────

export async function cancelarProcesoDeFirma(procesoId) {
  if (procesoId?.startsWith('SIM_')) {
    const p = _simGet(procesoId);
    if (p) { p.estado = 'cancelado'; _simSet(procesoId, p); }
    return { success: true, simulated: true };
  }
  return vfFetch(`/api/fes/documentos/${procesoId}/cancelar`, { method: 'POST' });
}

// ─── Reenviar solicitud ───────────────────────────────────────────────────────

export async function reenviarSolicitudFirma(procesoId, email) {
  if (procesoId?.startsWith('SIM_')) {
    console.info(`[ValidaFirma Simulado] Reenvío simulado a ${email}`);
    return { success: true, simulated: true };
  }
  return vfFetch(`/api/fes/documentos/${procesoId}/reenviar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
}

// ─── Helpers de UI ────────────────────────────────────────────────────────────

export const ESTADOS_FIRMA = {
  sin_enviar:            { label: 'Sin enviar',    color: 'text-slate-400',   bg: 'bg-slate-100',  dot: '○' },
  enviado:               { label: 'Enviado',       color: 'text-blue-600',    bg: 'bg-blue-50',    dot: '●' },
  parcialmente_firmado:  { label: 'Firma parcial', color: 'text-amber-600',   bg: 'bg-amber-50',   dot: '◑' },
  completamente_firmado: { label: 'Firmado',       color: 'text-emerald-600', bg: 'bg-emerald-50', dot: '✓' },
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

// ─── Demo sin API key ─────────────────────────────────────────────────────────

export function crearProcesoDeFirmaDemo({ firmantes = [] }) {
  console.warn('[ValidaFirma] Modo demo — sin API key');
  return _crearProcesoSimulado({ pdfBlob: null, nombreArchivo: 'demo.pdf', firmantes, docType: 'contrato' });
}

export default {
  crearProcesoDeFirma, consultarEstadoFirma,
  descargarPDFFirmado, cancelarProcesoDeFirma,
  reenviarSolicitudFirma, crearProcesoDeFirmaDemo,
  esProcesoSimulado, ESTADOS_FIRMA, TIPOS_DOC, badgeFirma,
};
