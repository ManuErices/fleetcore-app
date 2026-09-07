/**
 * FirmaContratoModal.jsx — Firma electrónica (FES ValidaFirma) de contratos/anexos.
 *
 * Multi-tenant: todo se lee/escribe bajo empresas/{empresaId}/…
 *
 * Flujo (NO firma automática — se dispara con el botón "Iniciar firma"):
 *   1. Se genera el PDF real del documento (htmlToPdf sobre el HTML de pdfs.jsx).
 *   2. Se envía a ValidaFirma vía la Cloud Function proxy (firma.js → validafirma).
 *   3. Se persiste el proceso en el doc (contratos|anexos)/{id}.firma.
 *   4. Polling del estado hasta completar; al completar se descarga el PDF
 *      firmado y se guarda en Storage empresas/{empresaId}/{coleccion}/{id}/.
 *
 * En sandbox (key vf_test_ sin créditos) el proceso es simulado (SIM_…) y
 * progresa solo; permite probar toda la UI sin gastar créditos.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { db, storage } from '../../lib/firebase';
import { doc, updateDoc, deleteField } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import {
  crearProcesoDeFirma, consultarEstadoFirma, descargarPDFFirmado,
  cancelarProcesoDeFirma, reenviarSolicitudFirma, listarDocumentos, extraerProcesoId,
  ESTADOS_FIRMA, badgeFirma, esProcesoSimulado, esFirmadoCompleto, ESTADOS_COMPLETADOS,
  webhookUrlFirma,
} from './firma';
import { htmlToPdfBlob } from './htmlToPdf';

// Elimina claves undefined de forma recursiva. Firestore rechaza undefined
// ANIDADO (p.ej. firmantes[].telefono ausente), no solo a nivel superior.
function stripUndefined(v) {
  if (Array.isArray(v)) return v.map(stripUndefined);
  if (v && typeof v === 'object' && !(v instanceof Date)) {
    const out = {};
    for (const [k, val] of Object.entries(v)) {
      if (val === undefined) continue;
      out[k] = stripUndefined(val);
    }
    return out;
  }
  return v;
}

const emailOk = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((e || '').trim());

// ValidaFirma exige el RUT como XXXXXXXX-X (sin puntos, con guion).
const formatRutValidaFirma = (rut) => {
  const clean = (rut || '').replace(/[.\s]/g, '').replace(/-/g, '').toUpperCase();
  if (clean.length < 2) return clean;
  return `${clean.slice(0, -1)}-${clean.slice(-1)}`;
};

const soloDigitos = (s) => (s || '').replace(/\D/g, '');

// Deja solo el número local chileno (9 dígitos), quitando prefijo +56/56.
const localTelCL = (raw) => {
  let d = soloDigitos(raw);
  if (d.startsWith('56')) d = d.slice(2);
  return d.slice(-9);
};

const inp = 'w-full px-3 py-2 border-2 border-slate-200 rounded-xl text-sm focus:outline-none focus:border-violet-400 bg-white';

const ESTADOS_FINALES = [...ESTADOS_COMPLETADOS, 'cancelado', 'expirado'];

export default function FirmaContratoModal({
  isOpen, onClose, empresaId, trabajador,
  documento,                 // el contrato o anexo (debe traer .id y .firma?)
  coleccion = 'contratos',   // 'contratos' | 'anexos'
  generarHtml,               // () => string  (HTML del documento con returnHtml:true)
  nombreArchivo = 'documento.pdf',
  onUpdated,                 // (firmaObj|null) => void — para refrescar la lista
}) {
  const firma = documento?.firma || null;

  const [firmantes, setFirmantes] = useState([]);
  const [estado, setEstado]       = useState(null); // resultado de consultarEstadoFirma
  const [sending, setSending]     = useState(false);
  const [busy, setBusy]           = useState('');   // etiqueta de acción en curso
  const [error, setError]         = useState('');
  const [candidatos, setCandidatos] = useState(null); // null=no buscado · []=sin resultados
  const [buscando, setBuscando]   = useState(false);
  const pollRef = useRef(null);

  // Firmante por defecto: SOLO el trabajador. Cada firmante consume 1 crédito
  // (~1 USD), así que el contrato lo firma únicamente el trabajador. El
  // empleador respalda emitiendo el documento; si en algún caso hiciera falta
  // su firma electrónica, se agrega manualmente con "+ Agregar firmante".
  const buildDefaultFirmantes = useCallback(() => {
    const t = trabajador || {};
    const nombreTrab = `${t.nombre || ''} ${t.apellidoPaterno || ''} ${t.apellidoMaterno || ''}`.trim();
    return [
      {
        rol: 'Trabajador',
        nombre: nombreTrab,
        email: t.email || t.portalEmail || '',
        rut: t.rut || '',
        telefono: localTelCL(t.telefono || t.fono || t.celular || ''),
      },
    ];
  }, [trabajador]);

  // ── Reset al abrir ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;
    setError('');
    setEstado(null);
    if (firma?.firmantes?.length) {
      setFirmantes(firma.firmantes.map((f) => ({ ...f })));
    } else {
      setFirmantes(buildDefaultFirmantes());
    }
  }, [isOpen, firma, buildDefaultFirmantes]);

  // ── Polling de estado cuando ya hay proceso ───────────────────────────────
  const refrescarEstado = useCallback(async () => {
    if (!firma?.procesoId) return;
    try {
      const est = await consultarEstadoFirma(firma.procesoId);
      setEstado(est);

      // Persistir el estado nuevo si cambió (para que la lista muestre el badge).
      if (est.estado && est.estado !== firma.estado) {
        const nuevaFirma = stripUndefined({ ...firma, estado: est.estado, updatedAt: new Date().toISOString() });
        await updateDoc(doc(db, 'empresas', empresaId, coleccion, documento.id), { firma: nuevaFirma });
        onUpdated?.(nuevaFirma);
      }
      return est;
    } catch (e) {
      // Un SIM_ perdido tras recargar: se maneja con el escape hatch.
      setError(e.message || 'No se pudo consultar el estado de firma');
      return null;
    }
  }, [firma, empresaId, coleccion, documento?.id, onUpdated]);

  useEffect(() => {
    if (!isOpen || !firma?.procesoId) return;
    refrescarEstado();
    // No pollear si ya está en un estado final.
    if (ESTADOS_FINALES.includes(firma.estado)) return;
    pollRef.current = setInterval(async () => {
      const est = await refrescarEstado();
      if (est && ESTADOS_FINALES.includes(est.estado) && pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    }, 8000);
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [isOpen, firma?.procesoId, firma?.estado, refrescarEstado]);

  if (!isOpen) return null;

  const setF = (i, campo, val) =>
    setFirmantes((prev) => prev.map((f, idx) => (idx === i ? { ...f, [campo]: val } : f)));

  // ── Iniciar el proceso de firma ───────────────────────────────────────────
  const iniciarFirma = async () => {
    setError('');
    // Validaciones
    const limpios = firmantes
      .map((f) => {
        const tel = localTelCL(f.telefono);
        return {
          nombre: (f.nombre || '').trim(),
          email: (f.email || '').trim(),
          rut: formatRutValidaFirma(f.rut),
          telefono: tel ? `+56${tel}` : undefined,
          rol: f.rol,
        };
      })
      .filter((f) => f.nombre || f.email || f.rut);

    if (limpios.length === 0) return setError('Agrega al menos un firmante.');
    for (const f of limpios) {
      if (!f.nombre) return setError('Falta el nombre de un firmante.');
      if (!emailOk(f.email)) return setError(`Email inválido para ${f.nombre || 'un firmante'}.`);
    }

    setSending(true);
    setBusy('Generando PDF del documento…');
    try {
      const html = generarHtml?.();
      if (!html) throw new Error('No se pudo generar el documento a firmar.');
      const pdfBlob = await htmlToPdfBlob(html, nombreArchivo);

      setBusy('Enviando a ValidaFirma…');
      const res = await crearProcesoDeFirma({
        pdfBlob,
        nombreArchivo,
        firmantes: limpios,
        docType: coleccion === 'anexos' ? 'anexo' : 'contrato',
        // Webhook: ValidaFirma nos avisa al firmar y el estado se actualiza solo.
        webhookUrl: webhookUrlFirma(empresaId, coleccion, documento.id),
      });

      const nuevaFirma = stripUndefined({
        procesoId: res.procesoId || null,
        estado: res.estado || 'enviado',
        simulated: !!res.simulated,
        firmantes: limpios,
        // URLs de firma por firmante (las devuelve ValidaFirma). Se guardan para
        // que el trabajador pueda firmar desde su portal, además del email/SMS.
        firmantesUrls: res.firmantesUrls || [],
        // La respuesta cruda se guarda para poder RECUPERAR el proceso aunque
        // no hayamos sabido leer el id (el proceso ya se cobró en ValidaFirma).
        rawResponse: res.rawResponse || null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // Guardamos SIEMPRE: el documento ya existe (y se cobró) en ValidaFirma.
      // Nunca descartar la respuesta, aunque falte el id.
      await updateDoc(doc(db, 'empresas', empresaId, coleccion, documento.id), { firma: nuevaFirma });
      onUpdated?.(nuevaFirma);

      if (!nuevaFirma.procesoId) {
        console.warn('[Firma] respuesta SIN id reconocible:', JSON.stringify(res.rawResponse));
        setError('ValidaFirma creó el documento (y consumió el crédito) pero no pudimos leer el ID de proceso. Se guardó la respuesta para recuperarlo — NO vuelvas a presionar "Iniciar firma". Copia lo que salió en la consola (respuesta creación) y envíamelo para terminar de mapear el campo.');
        return; // sin id no se puede pollear; evitamos otro cobro
      }
    } catch (e) {
      setError(e.message || 'Error iniciando la firma.');
    } finally {
      setSending(false);
      setBusy('');
    }
  };

  // ── Buscar documentos ya existentes en ValidaFirma (no cobra) ─────────────
  const buscarExistentes = async () => {
    setError(''); setBuscando(true);
    try {
      const docs = await listarDocumentos();
      const t = trabajador || {};
      const nom = `${t.nombre || ''} ${t.apellidoPaterno || ''}`.trim().toLowerCase();
      const email = (t.email || t.portalEmail || '').toLowerCase();
      const match = docs.filter((d) => {
        const nombreOrig = (d.nombre_original || d.nombre || '').toLowerCase();
        const emails = (d.firmantes || []).map((f) => (f.email || '').toLowerCase());
        return (nom && nombreOrig.includes(nom)) || (email && emails.includes(email));
      });
      // Si no hay match (p.ej. se cambió el email en la prueba), mostramos todos.
      const lista = match.length ? match : docs;
      lista.sort((a, b) => String(b.fecha_creacion || '').localeCompare(String(a.fecha_creacion || '')));
      setCandidatos(lista.slice(0, 15));
    } catch (e) {
      setError(e.message || 'No se pudieron listar los documentos.');
    } finally {
      setBuscando(false);
    }
  };

  // Vincula un documento existente al contrato SIN crear uno nuevo (no cobra).
  const vincularDocumento = async (d) => {
    setError(''); setBusy('Vinculando…');
    try {
      const firmaObj = stripUndefined({
        procesoId: extraerProcesoId(d) || d.id,
        estado: d.estado || 'enviado',
        simulated: false,
        firmantes: (d.firmantes || []).map((f) => ({ nombre: f.nombre, email: f.email, rut: f.rut })),
        firmantesUrls: d.firmantes || [],
        codigoVerificacion: d.codigo_verificacion || null,
        createdAt: d.fecha_creacion || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        vinculadoManual: true,
      });
      if (!firmaObj.procesoId) throw new Error('El documento no trae un ID válido.');
      await updateDoc(doc(db, 'empresas', empresaId, coleccion, documento.id), { firma: firmaObj });
      onUpdated?.(firmaObj);
      setCandidatos(null);
    } catch (e) {
      setError(e.message || 'No se pudo vincular.');
    } finally {
      setBusy('');
    }
  };

  // ── Descargar PDF firmado (y guardarlo en Storage) ────────────────────────
  const descargarFirmado = async () => {
    setError(''); setBusy('Descargando PDF firmado…');
    try {
      const blob = await descargarPDFFirmado(firma.procesoId);

      // Descarga inmediata para el usuario.
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = nombreArchivo.replace(/\.pdf$/i, '') + '_firmado.pdf';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 30000);

      // Guardado permanente en Storage (best-effort; no bloquea la descarga).
      if (!esProcesoSimulado(firma.procesoId)) {
        try {
          const ruta = `empresas/${empresaId}/${coleccion}/${documento.id}/${Date.now()}_firmado.pdf`;
          const storageRef = ref(storage, ruta);
          await uploadBytes(storageRef, blob, { contentType: 'application/pdf' });
          const durl = await getDownloadURL(storageRef);
          const nuevaFirma = stripUndefined({ ...firma, pdfFirmadoStorageUrl: durl, pdfFirmadoRuta: ruta, updatedAt: new Date().toISOString() });
          await updateDoc(doc(db, 'empresas', empresaId, coleccion, documento.id), { firma: nuevaFirma });
          onUpdated?.(nuevaFirma);
        } catch (e) {
          console.warn('[Firma] No se pudo archivar el PDF firmado en Storage:', e.message);
        }
      }
    } catch (e) {
      setError(e.message || 'No se pudo descargar el PDF firmado.');
    } finally {
      setBusy('');
    }
  };

  const cancelar = async () => {
    if (!confirm('¿Cancelar el proceso de firma? Los firmantes ya no podrán firmar.')) return;
    setError(''); setBusy('Cancelando…');
    try {
      await cancelarProcesoDeFirma(firma.procesoId);
      const nuevaFirma = stripUndefined({ ...firma, estado: 'cancelado', updatedAt: new Date().toISOString() });
      await updateDoc(doc(db, 'empresas', empresaId, coleccion, documento.id), { firma: nuevaFirma });
      onUpdated?.(nuevaFirma);
      await refrescarEstado();
    } catch (e) {
      setError(e.message || 'No se pudo cancelar.');
    } finally { setBusy(''); }
  };

  const reenviar = async (email) => {
    setError(''); setBusy('Reenviando…');
    try {
      await reenviarSolicitudFirma(firma.procesoId, email);
    } catch (e) {
      setError(e.message || 'No se pudo reenviar.');
    } finally { setBusy(''); }
  };

  // Escape hatch: descartar la firma actual para poder iniciar otra.
  const iniciarNueva = async () => {
    if (!confirm('¿Descartar esta solicitud de firma e iniciar una nueva?')) return;
    setError(''); setBusy('Reiniciando…');
    try {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      await updateDoc(doc(db, 'empresas', empresaId, coleccion, documento.id), { firma: deleteField() });
      onUpdated?.(null);
      setEstado(null);
      setFirmantes(buildDefaultFirmantes());
    } catch (e) {
      setError(e.message || 'No se pudo reiniciar.');
    } finally { setBusy(''); }
  };

  const estadoActual = estado?.estado || firma?.estado || 'sin_enviar';
  const label = ESTADOS_FIRMA[estadoActual]?.label || 'Sin enviar';
  const completado = esFirmadoCompleto(estadoActual);
  // Origen de firmantes robusto: el polling puede no traerlos (docs vinculados),
  // así que caemos a lo guardado en el proceso.
  const firmantesInfo = (estado?.firmantes?.length ? estado.firmantes
    : (firma?.firmantesUrls?.length ? firma.firmantesUrls : (firma?.firmantes || []))) || [];
  const firmadosCount = firmantesInfo.filter(f => f.estado === 'firmado').length
    || (completado && firmantesInfo.length ? firmantesInfo.length : (estado?.firmadoPor?.length || 0));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="px-6 py-5 flex items-center justify-between" style={{ background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)' }}>
          <div>
            <h2 className="text-base font-black text-white">Firma electrónica</h2>
            <p className="text-xs text-white/70 mt-0.5">{coleccion === 'anexos' ? 'Anexo de contrato' : 'Contrato de trabajo'} · FES Ley 19.799</p>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white text-2xl leading-none">×</button>
        </div>

        <div className="p-6 space-y-5">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">{error}</div>
          )}

          {/* ── Sin proceso: formulario de firmantes ── */}
          {!firma?.procesoId ? (
            <>
              <p className="text-sm text-slate-500">
                Revisa los firmantes y presiona <strong>Iniciar firma</strong>. Cada firmante recibirá un enlace para firmar con validación por SMS. No se firma nada automáticamente.
              </p>
              <div className="space-y-4">
                {firmantes.map((f, i) => (
                  <div key={i} className="rounded-2xl border border-slate-200 p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-black text-violet-600 uppercase tracking-widest">{f.rol || `Firmante ${i + 1}`}</span>
                      {i > 0 && (
                        <button onClick={() => setFirmantes(prev => prev.filter((_, idx) => idx !== i))} className="text-[11px] font-bold text-red-500 hover:underline">Quitar</button>
                      )}
                    </div>
                    <input className={inp} placeholder="Nombre completo" value={f.nombre} onChange={(e) => setF(i, 'nombre', e.target.value)} />
                    <div className="grid grid-cols-2 gap-2">
                      <input className={inp} placeholder="Email" value={f.email} onChange={(e) => setF(i, 'email', e.target.value)} />
                      <input className={inp} placeholder="RUT" value={f.rut} onChange={(e) => setF(i, 'rut', e.target.value)} />
                    </div>
                    <div className="flex items-stretch gap-2">
                      <span className="flex items-center gap-1 px-3 rounded-xl border-2 border-slate-200 bg-slate-50 text-sm font-semibold text-slate-600 select-none whitespace-nowrap">
                        🇨🇱 +56
                      </span>
                      <input
                        className={`${inp} flex-1`}
                        inputMode="numeric"
                        maxLength={9}
                        placeholder="9 1234 5678 (para SMS, opcional)"
                        value={f.telefono}
                        onChange={(e) => setF(i, 'telefono', localTelCL(e.target.value))}
                      />
                    </div>
                  </div>
                ))}
                <button
                  onClick={() => setFirmantes(prev => [...prev, { rol: 'Empleador (representante)', nombre: '', email: '', rut: '', telefono: '' }])}
                  className="text-xs font-bold text-violet-600 hover:underline"
                >
                  + Agregar firmante <span className="text-slate-400 font-normal">(consume 1 crédito extra)</span>
                </button>
              </div>
              <button
                onClick={iniciarFirma}
                disabled={sending}
                className="w-full py-3 bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white font-bold text-sm rounded-xl transition-colors"
              >
                {sending ? (busy || 'Procesando…') : 'Iniciar firma'}
              </button>

              {/* Recuperar un documento ya enviado antes (no consume créditos) */}
              <div className="pt-2 border-t border-slate-100">
                <p className="text-[11px] text-slate-400 mb-2">
                  ¿Ya lo habías enviado antes y se perdió el enlace? Búscalo en ValidaFirma y vincúlalo sin volver a cobrar.
                </p>
                <button onClick={buscarExistentes} disabled={buscando || !!busy}
                  className="text-xs font-bold text-violet-600 hover:underline disabled:opacity-50">
                  {buscando ? 'Buscando…' : 'Buscar documento ya enviado (no cobra)'}
                </button>

                {candidatos && candidatos.length === 0 && (
                  <p className="text-xs text-slate-400 mt-2">No se encontraron documentos en tu cuenta ValidaFirma.</p>
                )}
                {candidatos && candidatos.length > 0 && (
                  <div className="mt-2 space-y-2 max-h-56 overflow-y-auto">
                    {candidatos.map((d) => (
                      <div key={d.id} className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 px-3 py-2">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-slate-700 truncate">{d.nombre_original || d.nombre || d.id}</p>
                          <p className="text-[10px] text-slate-400">
                            {(d.estado || '—')} · {(d.firmantes || []).map((f) => f.email).join(', ') || 's/firmantes'}
                            {d.fecha_creacion ? ` · ${new Date(d.fecha_creacion).toLocaleDateString('es-CL')}` : ''}
                          </p>
                        </div>
                        <button onClick={() => vincularDocumento(d)} disabled={!!busy}
                          className="text-[11px] font-bold text-white bg-violet-600 hover:bg-violet-700 px-2.5 py-1 rounded-lg flex-shrink-0 disabled:opacity-50">
                          Vincular
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            /* ── Con proceso: estado + acciones ── */
            <>
              <div className="flex items-center gap-2">
                <span className={badgeFirma(estadoActual)}>{ESTADOS_FIRMA[estadoActual]?.dot} {label}</span>
                {firma.simulated && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">SIMULADO (sandbox)</span>}
              </div>

              {firmantesInfo.length > 0 ? (
                <div className="text-sm text-slate-600">
                  <p>Firmado por <strong>{firmadosCount}</strong> de <strong>{firmantesInfo.length}</strong> firmante{firmantesInfo.length !== 1 ? 's' : ''}.</p>
                </div>
              ) : completado ? (
                <p className="text-sm text-slate-600">Documento firmado.</p>
              ) : null}

              <div className="space-y-2">
                {firmantesInfo.map((f, i) => {
                  const st = f.estado || 'pendiente';
                  return (
                    <div key={i} className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2">
                      <div>
                        <p className="text-sm font-semibold text-slate-700">{f.nombre || f.email}</p>
                        <p className="text-[11px] text-slate-400">{f.email}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={badgeFirma(st)}>{ESTADOS_FIRMA[st]?.label || st}</span>
                        {!completado && f.email && st !== 'firmado' && (
                          <button onClick={() => reenviar(f.email)} disabled={!!busy} className="text-[11px] font-bold text-violet-600 hover:underline disabled:opacity-50">Reenviar</button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {busy && <p className="text-xs text-slate-400">{busy}</p>}

              <div className="flex flex-wrap gap-2 pt-2">
                <button onClick={refrescarEstado} disabled={!!busy} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm rounded-xl disabled:opacity-50">Actualizar estado</button>
                {completado && (
                  <button onClick={descargarFirmado} disabled={!!busy} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm rounded-xl disabled:opacity-50">Descargar firmado</button>
                )}
                {!completado && estadoActual !== 'cancelado' && (
                  <button onClick={cancelar} disabled={!!busy} className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 font-bold text-sm rounded-xl disabled:opacity-50">Cancelar firma</button>
                )}
                <button onClick={iniciarNueva} disabled={!!busy} className="px-4 py-2 text-slate-400 hover:text-slate-600 font-bold text-sm rounded-xl disabled:opacity-50">Iniciar nueva</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
