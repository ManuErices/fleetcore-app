import React, { useState } from 'react'
import { agregarObservacionDocumento, actualizarDocumento } from '../lib/documentos.js'
import { verificarPin, firmarDocumento, rechazarDocumento, ROLES_FIRMA, FLUJO } from '../lib/firmas.js'

const C = { navy:'#0D2B45', gold:'#C9A84C', green:'#15803d', red:'#dc2626', gray:'#64748b', border:'#e2e8f0' }

// Helper to parse bold AND <br> tags in strings
function renderCellContent(text) {
  if (!text) return text
  const brParts = text.split(/<br\s*\/?>/gi)
  return brParts.map((part, bIdx) => (
    <React.Fragment key={bIdx}>
      {bIdx > 0 && <br />}
      {parseBold(part)}
    </React.Fragment>
  ))
}

// Helper to parse markdown bold text
function parseBold(text) {
  if (!text) return text
  const parts = text.split(/(\*\*.*?\*\*)/g)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} style={{ color:'#0D2B45', fontWeight:700 }}>{part.slice(2, -2)}</strong>
    }
    return part
  })
}

// Helper to render markdown content with styled tables, headers, dividers, and breaks
function renderFormattedContent(text) {
  if (!text) return null

  const rawLines = text.split('\n')
  const elements = []
  let tableRows = []
  let inTable = false

  function flushTable(key) {
    if (tableRows.length === 0) return
    let header = null
    let body = []

    tableRows.forEach((row, rIdx) => {
      if (/^\|?\s*:\s*-+/.test(row) || /^\|?\s*-+\s*\|/.test(row)) {
        return
      }
      const cells = row.split('|').slice(1, -1).map(c => c.trim())
      if (!cells.length || cells.every(c => !c)) return

      if (rIdx === 0 && !header) {
        header = cells
      } else {
        body.push(cells)
      }
    })

    if (header || body.length) {
      elements.push(
        <div key={key} style={{ overflowX:'auto', margin:'12px 0', maxWidth:'100%' }}>
          <table style={{ width:'100%', tableLayout:'fixed', borderCollapse:'collapse', fontSize:11.5, background:'#fff', border:'1px solid #e2e8f0', borderRadius:8, overflow:'hidden' }}>
            {header && (
              <thead>
                <tr style={{ background:'#0D2B45', color:'#fff' }}>
                  {header.map((cell, cIdx) => (
                    <th key={cIdx} style={{ padding:'8px 10px', textAlign:'left', fontWeight:700, borderBottom:'2px solid #C9A84C', fontSize:10.5, textTransform:'uppercase', letterSpacing:'.03em', wordBreak:'break-word', overflowWrap:'anywhere' }}>
                      {renderCellContent(cell)}
                    </th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody>
              {body.map((row, rIdx) => (
                <tr key={rIdx} style={{ borderBottom:'1px solid #f1f5f9', background: rIdx % 2 === 0 ? '#fff' : '#f8fafc' }}>
                  {row.map((cell, cIdx) => (
                    <td key={cIdx} style={{ padding:'8px 10px', color:'#334155', lineHeight:1.4, verticalAlign:'top', wordBreak:'break-word', overflowWrap:'anywhere', whiteSpace:'pre-wrap' }}>
                      {renderCellContent(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    }

    tableRows = []
    inTable = false
  }

  rawLines.forEach((line, idx) => {
    const trimmed = line.trim()

    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      inTable = true
      tableRows.push(trimmed)
      return
    } else if (inTable) {
      flushTable(`table-${idx}`)
    }

    if (/^-{3,}$/.test(trimmed)) {
      elements.push(<hr key={idx} style={{ border:'none', borderTop:'1.5px solid #e2e8f0', margin:'14px 0' }} />)
      return
    }

    if (line.startsWith('#### ')) {
      const content = line.slice(5).replace(/\*\*(.*?)\*\*/g, '$1')
      elements.push(<h4 key={idx} style={{ fontSize:13, fontWeight:700, color:'#0D2B45', margin:'12px 0 6px', textTransform:'uppercase', letterSpacing:'.03em' }}>{content}</h4>)
      return
    }
    if (line.startsWith('### ')) {
      const content = line.slice(4).replace(/\*\*(.*?)\*\*/g, '$1')
      elements.push(<h3 key={idx} style={{ fontSize:14, fontWeight:700, color:'#0D2B45', margin:'14px 0 6px', padding:'4px 8px 4px 10px', borderLeft:'3px solid #C9A84C', background:'#f8fafc', borderRadius:'0 6px 6px 0' }}>{content}</h3>)
      return
    }
    if (line.startsWith('## ')) {
      const content = line.slice(3).replace(/\*\*(.*?)\*\*/g, '$1')
      elements.push(<h2 key={idx} style={{ fontSize:15, fontWeight:700, color:'#0D2B45', margin:'16px 0 8px', borderBottom:'1px solid #e2e8f0', paddingBottom:4 }}>{content}</h2>)
      return
    }
    if (line.startsWith('# ')) {
      const content = line.slice(2).replace(/\*\*(.*?)\*\*/g, '$1')
      elements.push(<h1 key={idx} style={{ fontSize:17, fontWeight:700, color:'#0D2B45', margin:'18px 0 10px' }}>{content}</h1>)
      return
    }

    if (line.startsWith('- ') || line.startsWith('* ')) {
      const content = line.slice(2)
      elements.push(
        <div key={idx} style={{ display:'flex', gap:6, marginLeft:8, margin:'3px 0', fontSize:12.5, color:'#334155', lineHeight:1.6 }}>
          <span style={{ color:'#C9A84C', fontWeight:700 }}>•</span>
          <span>{renderCellContent(content)}</span>
        </div>
      )
      return
    }

    if (!trimmed) {
      elements.push(<div key={idx} style={{ height:6 }} />)
      return
    }

    elements.push(
      <p key={idx} style={{ margin:'3px 0', fontSize:12.5, color:'#334155', lineHeight:1.65 }}>
        {renderCellContent(line)}
      </p>
    )
  })

  if (inTable) {
    flushTable('table-end')
  }

  return elements
}

// Helper to determine clean company name
function getNombreEmpresa(doc) {
  if (doc.empresa && doc.empresa !== doc.empresaId && !/^[a-zA-Z0-9]{15,}$/.test(doc.empresa)) {
    return doc.empresa
  }
  if (doc.empresaId && !/^[a-zA-Z0-9]{15,}$/.test(doc.empresaId)) {
    return doc.empresaId
  }
  return 'MPF Ingeniería Civil SpA'
}

export default function ModalVerDocumento({ doc, session, onClose, onUpdateDoc }) {
  const [nuevaObs, setNuevaObs]     = useState('')
  const [loadingObs, setLoadingObs] = useState(false)
  const [errorObs, setErrorObs]     = useState('')

  // Estado de edicion de documento (subsanar observacion)
  const [editing, setEditing]             = useState(false)
  const [editContenido, setEditContenido] = useState(doc.contenido || '')
  const [savingEdit, setSavingEdit]       = useState(false)
  const [errorEdit, setErrorEdit]         = useState('')

  // Modales de accion
  const [showFirmaModal, setShowFirmaModal]     = useState(false)
  const [showRechazoModal, setShowRechazoModal] = useState(false)
  const [pin, setPin]                           = useState('')
  const [motivoRechazo, setMotivoRechazo]       = useState('')
  const [loadingAccion, setLoadingAccion]       = useState(false)
  const [errorAccion, setErrorAccion]           = useState('')

  const observaciones = doc.observaciones || []
  const firmas = doc.firmas || {}

  // Determinar rol que le toca firmar
  function getRolFirmable() {
    if (doc.estadoDocumento === 'rechazado') return null
    const creadorUsuario = doc.firmas?.realizado?.usuario || doc.usuario

    for (let rk of FLUJO) {
      if (!firmas[rk]?.firmado && !firmas[rk]?.rechazado) {
        if (!ROLES_FIRMA[rk]?.roles.includes(session.rol)) break
        if (rk !== 'realizado' && session.usuario === creadorUsuario) break
        return rk
      }
    }
    return null
  }

  const rolActivo = getRolFirmable()
  const canEdit = session.rol !== 'mandante'

  async function handleGuardarEdicion() {
    setErrorEdit('')
    if (!editContenido.trim()) return setErrorEdit('El contenido no puede estar vacío')
    setSavingEdit(true)
    try {
      const obsSistema = await actualizarDocumento(doc.id, session.empresaId, { contenido: editContenido.trim() }, session)
      const updated = {
        ...doc,
        contenido: editContenido.trim(),
        estadoDocumento: 'emitido',
        observaciones: [...observaciones, obsSistema]
      }
      onUpdateDoc(updated)
      setEditing(false)
    } catch(e) {
      setErrorEdit(e.message)
    }
    setSavingEdit(false)
  }

  async function handleEnviarObservacion() {
    setErrorObs('')
    if (!nuevaObs.trim()) return setErrorObs('Escribe el detalle de la observación')
    setLoadingObs(true)
    try {
      const obs = await agregarObservacionDocumento(doc.id, session.empresaId, nuevaObs.trim(), session)
      setNuevaObs('')
      const updated = {
        ...doc,
        observaciones: [...observaciones, obs],
        estadoDocumento: 'con_observaciones'
      }
      onUpdateDoc(updated)
    } catch (e) {
      setErrorObs(e.message)
    }
    setLoadingObs(false)
  }

  async function handleAprobar() {
    setErrorAccion('')
    if (!pin) return setErrorAccion('Ingresa tu PIN de firma')
    setLoadingAccion(true)
    try {
      const ok = await verificarPin(session.usuario, pin)
      if (!ok) { setErrorAccion('PIN incorrecto'); setLoadingAccion(false); return }
      const rk = rolActivo || 'aprobado'
      const firma = await firmarDocumento(doc.id, rk, session.usuario, session.nombre, session.cargo || '')
      const updated = {
        ...doc,
        firmas: { ...firmas, [rk]: firma }
      }
      onUpdateDoc(updated)
      setShowFirmaModal(false)
    } catch(e) { setErrorAccion(e.message) }
    setLoadingAccion(false)
  }

  async function handleRechazar() {
    setErrorAccion('')
    if (!motivoRechazo.trim()) return setErrorAccion('Ingresa el motivo del rechazo')
    if (!pin) return setErrorAccion('Ingresa tu PIN de confirmación')
    setLoadingAccion(true)
    try {
      const ok = await verificarPin(session.usuario, pin)
      if (!ok) { setErrorAccion('PIN incorrecto'); setLoadingAccion(false); return }
      const rk = rolActivo || 'aprobado'
      const rechazo = await rechazarDocumento(doc.id, rk, session.usuario, session.nombre, session.cargo || '', motivoRechazo)
      const updated = {
        ...doc,
        estadoDocumento: 'rechazado',
        firmas: { ...firmas, [rk]: rechazo }
      }
      onUpdateDoc(updated)
      setShowRechazoModal(false)
    } catch(e) { setErrorAccion(e.message) }
    setLoadingAccion(false)
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(13,43,69,0.7)', backdropFilter:'blur(4px)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1100, padding:'1rem' }}>
      <div style={{ background:'#fff', borderRadius:20, width:'94vw', maxWidth:1150, maxHeight:'92vh', display:'flex', flexDirection:'column', boxShadow:'0 25px 50px -12px rgba(0,0,0,0.4)', overflow:'hidden' }}>

        {/* Encabezado */}
        <div style={{ background:'#0D2B45', padding:'1.25rem 1.75rem', color:'#fff', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div>
            <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
              <span style={{ fontSize:11, fontWeight:700, padding:'3px 10px', borderRadius:20, background:'rgba(201,168,76,0.2)', color:'#C9A84C', border:'1px solid rgba(201,168,76,0.4)', textTransform:'uppercase' }}>
                {doc.tipo === 'plan' ? 'Plan de Trabajo' : 'Informe Diario'}
              </span>
              {doc.estadoDocumento === 'con_observaciones' && (
                <span style={{ fontSize:11, fontWeight:700, padding:'3px 10px', borderRadius:20, background:'#fef3c7', color:'#b45309' }}>
                  ⚠️ Con Observaciones
                </span>
              )}
              {doc.estadoDocumento === 'rechazado' && (
                <span style={{ fontSize:11, fontWeight:700, padding:'3px 10px', borderRadius:20, background:'#fef2f2', color:'#dc2626' }}>
                  ✕ Rechazado
                </span>
              )}
            </div>
            <h2 style={{ fontSize:18, fontWeight:700, marginTop:6, color:'#fff' }}>{doc.titulo || 'Documento sin título'}</h2>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            {canEdit && !editing && (
              <button onClick={() => setEditing(true)} style={{ background:'#C9A84C', color:'#0D2B45', border:'none', padding:'7px 14px', borderRadius:8, fontWeight:700, fontSize:12, cursor:'pointer', display:'flex', alignItems:'center', gap:5 }}>
                ✏️ Editar / Subsanar
              </button>
            )}
            <button onClick={onClose} style={{ background:'none', border:'none', color:'rgba(255,255,255,0.7)', fontSize:26, cursor:'pointer' }}>×</button>
          </div>
        </div>

        {/* Cuerpo modal desplegable en 2 columnas */}
        <div style={{ display:'flex', flex:1, overflow:'hidden' }}>

          {/* Columna Izquierda: Vista Previa / Edición del Documento */}
          <div style={{ flex:1.8, padding:'1.5rem 2rem', overflowY:'auto', borderRight:'1px solid #e2e8f0' }}>

            {/* Metadatos */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, background:'#f8fafc', padding:'12px 14px', borderRadius:10, marginBottom:16, fontSize:12 }}>
              <div><span style={{ color:'#64748b' }}>Fecha: </span><strong>{doc.fecha || '–'}</strong></div>
              <div><span style={{ color:'#64748b' }}>Sector: </span><strong>{doc.sector || '–'}</strong></div>
              <div><span style={{ color:'#64748b' }}>Emisor: </span><strong>{doc.nombre || '–'}</strong></div>
              <div><span style={{ color:'#64748b' }}>Empresa: </span><strong>{getNombreEmpresa(doc)}</strong></div>
            </div>

            {/* Layout si existe */}
            {doc.layoutPngB64 && (
              <div style={{ marginBottom:16 }}>
                <div style={{ fontSize:11, fontWeight:700, color:'#0D2B45', textTransform:'uppercase', marginBottom:6 }}>Esquema de Layout</div>
                <img src={doc.layoutPngB64} alt="Layout Canvas" style={{ width:'100%', borderRadius:8, border:'1px solid #e2e8f0' }} />
              </div>
            )}

            {/* Contenido / Modo Edición */}
            {editing ? (
              <div style={{ background:'#fff', padding:16, border:'1.5px solid #C9A84C', borderRadius:12 }}>
                <div style={{ fontSize:12, fontWeight:700, color:'#0D2B45', marginBottom:8, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <span>✏️ MODO EDICIÓN: Subsanar datos del informe</span>
                  <span style={{ fontSize:11, color:'#64748b' }}>Modifica el texto para corregir la observación</span>
                </div>
                <textarea
                  rows={16}
                  value={editContenido}
                  onChange={e => setEditContenido(e.target.value)}
                  style={{ width:'100%', fontFamily:'monospace', fontSize:12.5, lineHeight:1.5, padding:12, border:'1px solid #cbd5e1', borderRadius:8, outline:'none', boxSizing:'border-box' }}
                />
                {errorEdit && <div style={{ color:'#dc2626', fontSize:12, marginTop:6 }}>{errorEdit}</div>}
                <div style={{ display:'flex', gap:10, marginTop:12, justifyContent:'flex-end' }}>
                  <button onClick={() => { setEditing(false); setEditContenido(doc.contenido || ''); }} style={{ padding:'9px 16px', background:'#f1f5f9', color:'#475569', border:'none', borderRadius:8, fontWeight:700, fontSize:12, cursor:'pointer' }}>
                    Cancelar
                  </button>
                  <button onClick={handleGuardarEdicion} disabled={savingEdit} style={{ padding:'9px 20px', background:'#15803d', color:'#fff', border:'none', borderRadius:8, fontWeight:700, fontSize:12, cursor:'pointer' }}>
                    {savingEdit ? 'Guardando...' : '💾 Guardar Cambios y Notificar'}
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ fontSize:13, lineHeight:1.7, color:'#1e293b', background:'#fff' }}>
                {renderFormattedContent(doc.contenido)}
              </div>
            )}

            {/* Estado de Firmas actuales */}
            <div style={{ marginTop:24, paddingTop:16, borderTop:'1px solid #e2e8f0' }}>
              <div style={{ fontSize:11, fontWeight:700, color:'#0D2B45', textTransform:'uppercase', marginBottom:10 }}>Firma y Validaciones</div>
              <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                {FLUJO.map(rk => {
                  const rolInfo = ROLES_FIRMA[rk]
                  const f = firmas[rk]
                  return (
                    <div key={rk} style={{ padding:'8px 12px', borderRadius:8, border:`1px solid ${f?.firmado ? '#bbf7d0' : f?.rechazado ? '#fecaca' : '#e2e8f0'}`, background: f?.firmado ? '#f0fdf4' : f?.rechazado ? '#fef2f2' : '#fafafa', fontSize:11, flex:1, minWidth:150 }}>
                      <div style={{ fontWeight:700, color: f?.firmado ? '#15803d' : f?.rechazado ? '#dc2626' : '#64748b' }}>
                        {f?.firmado ? '✓ ' : f?.rechazado ? '✕ ' : '○ '}{rolInfo?.label}
                      </div>
                      {f?.firmado ? (
                        <div style={{ marginTop:4, color:'#334155' }}>
                          <div><strong>{f.nombre}</strong></div>
                          <div style={{ fontSize:10, color:'#64748b' }}>{f.fecha} {f.hora}</div>
                        </div>
                      ) : f?.rechazado ? (
                        <div style={{ marginTop:4, color:'#991b1b' }}>
                          <div><strong>Rechazado por {f.nombre}</strong></div>
                          {f.motivo && <div style={{ fontStyle:'italic', marginTop:2 }}>"{f.motivo}"</div>}
                        </div>
                      ) : (
                        <div style={{ marginTop:4, color:'#94a3b8' }}>Pendiente</div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

          </div>

          {/* Columna Derecha: Hilo de Observaciones & Acciones del Mandante */}
          <div style={{ flex:1, padding:'1.5rem', background:'#fafafa', display:'flex', flexDirection:'column', overflowY:'auto' }}>

            <div style={{ fontSize:13, fontWeight:700, color:'#0D2B45', textTransform:'uppercase', letterSpacing:'.04em', marginBottom:12, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <span>💬 Hilo de Observaciones ({observaciones.length})</span>
            </div>

            {/* Lista de observaciones anteriores */}
            <div style={{ flex:1, overflowY:'auto', display:'flex', flexDirection:'column', gap:10, marginBottom:16 }}>
              {observaciones.length === 0 ? (
                <div style={{ padding:'2rem 1rem', textAlign:'center', color:'#94a3b8', fontSize:13, border:'1px dashed #cbd5e1', borderRadius:10, background:'#fff' }}>
                  Sin observaciones registradas todavía.<br />Ambas partes pueden comunicar requerimientos o correcciones aquí.
                </div>
              ) : (
                observaciones.map((obs, idx) => (
                  <div key={idx} style={{ background:'#fff', padding:'12px 14px', borderRadius:10, border:'1px solid #e2e8f0', boxShadow:'0 1px 3px rgba(0,0,0,0.04)' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                      <span style={{ fontSize:12, fontWeight:700, color:'#0D2B45' }}>{obs.autor} <span style={{ fontSize:10, fontWeight:400, color:'#64748b' }}>({obs.empresa || 'Río Tinto'})</span></span>
                      <span style={{ fontSize:10, color:'#94a3b8' }}>{obs.fecha} {obs.hora}</span>
                    </div>
                    <div style={{ fontSize:12, color:'#334155', lineHeight:1.5, whiteSpace:'pre-wrap' }}>{obs.texto}</div>
                  </div>
                ))
              )}
            </div>

            {/* Formulario para agregar observacion */}
            <div style={{ background:'#fff', padding:14, borderRadius:12, border:'1px solid #e2e8f0' }}>
              <label style={{ fontSize:11, fontWeight:700, color:'#64748b', textTransform:'uppercase', display:'block', marginBottom:6 }}>Nueva Observación o Comentario</label>
              <textarea
                rows={3}
                value={nuevaObs} onChange={e => setNuevaObs(e.target.value)}
                placeholder="Escribe aquí las correcciones solicitadas o aclaraciones sobre este documento..."
                style={{ width:'100%', padding:'10px', fontSize:12, border:'1.5px solid #cbd5e1', borderRadius:8, outline:'none', boxSizing:'border-box', fontFamily:'inherit' }}
              />
              {errorObs && <div style={{ color:'#dc2626', fontSize:12, marginTop:4 }}>{errorObs}</div>}
              <button
                onClick={handleEnviarObservacion}
                disabled={loadingObs || !nuevaObs.trim()}
                style={{ width:'100%', marginTop:8, padding:'9px', fontSize:12, fontWeight:700, background: loadingObs || !nuevaObs.trim() ? '#cbd5e1' : '#1B5E8A', color:'#fff', border:'none', borderRadius:8, cursor:'pointer' }}
              >
                {loadingObs ? 'Enviando...' : '💬 Registrar Observación (Solicita Corrección)'}
              </button>
            </div>

            {/* Acciones principales de aprobacion/rechazo si la persona tiene permisos */}
            {rolActivo && (
              <div style={{ marginTop:16, paddingTop:14, borderTop:'1px solid #e2e8f0', display:'flex', gap:10 }}>
                <button
                  onClick={() => setShowFirmaModal(true)}
                  style={{ flex:1, padding:'12px', fontSize:13, fontWeight:700, background:'#15803d', color:'#fff', border:'none', borderRadius:10, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}
                >
                  ✓ {session.rol === 'mandante' ? 'Aprobar Documento' : 'Firmar Documento'}
                </button>
                <button
                  onClick={() => setShowRechazoModal(true)}
                  style={{ padding:'12px 16px', fontSize:13, fontWeight:700, background:'#fef2f2', color:'#dc2626', border:'1px solid #fecaca', borderRadius:10, cursor:'pointer' }}
                >
                  ✕ Rechazar
                </button>
              </div>
            )}

          </div>

        </div>
      </div>

      {/* Modal Firma integrador */}
      {showFirmaModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1200 }}>
          <div style={{ background:'#fff', borderRadius:16, padding:'2rem', width:360 }}>
            <h3 style={{ fontSize:16, fontWeight:700, color:'#0D2B45', marginBottom:14 }}>Aprobar y Firmar con PIN</h3>
            <label style={{ fontSize:11, fontWeight:700, color:'#64748b', display:'block', marginBottom:6 }}>INGRESA TU PIN</label>
            <input
              type="password" inputMode="numeric" maxLength={8} autoFocus
              value={pin} onChange={e => { setPin(e.target.value.replace(/\D/g,'')); setErrorAccion('') }}
              placeholder="••••"
              style={{ width:'100%', padding:'12px', fontSize:24, letterSpacing:8, textAlign:'center', border:'1.5px solid #cbd5e1', borderRadius:8, boxSizing:'border-box' }}
            />
            {errorAccion && <div style={{ color:'#dc2626', fontSize:12, marginTop:6 }}>{errorAccion}</div>}
            <div style={{ display:'flex', gap:8, marginTop:16 }}>
              <button onClick={() => setShowFirmaModal(false)} style={{ flex:1, padding:'10px', background:'#f1f5f9', border:'none', borderRadius:8, fontWeight:700 }}>Cancelar</button>
              <button onClick={handleAprobar} disabled={loadingAccion} style={{ flex:1, padding:'10px', background:'#15803d', color:'#fff', border:'none', borderRadius:8, fontWeight:700 }}>
                {loadingAccion ? 'Firmando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Rechazo integrador */}
      {showRechazoModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1200 }}>
          <div style={{ background:'#fff', borderRadius:16, padding:'2rem', width:380 }}>
            <h3 style={{ fontSize:16, fontWeight:700, color:'#dc2626', marginBottom:14 }}>Rechazar Documento</h3>
            <label style={{ fontSize:11, fontWeight:700, color:'#64748b', display:'block', marginBottom:6 }}>MOTIVO FORMAL DE RECHAZO</label>
            <textarea
              rows={3} autoFocus
              value={motivoRechazo} onChange={e => { setMotivoRechazo(e.target.value); setErrorAccion('') }}
              placeholder="Motivo del rechazo..."
              style={{ width:'100%', padding:'10px', fontSize:12, border:'1.5px solid #cbd5e1', borderRadius:8, boxSizing:'border-box', outline:'none', marginBottom:12 }}
            />
            <label style={{ fontSize:11, fontWeight:700, color:'#64748b', display:'block', marginBottom:6 }}>PIN DE SEGURIDAD</label>
            <input
              type="password" inputMode="numeric" maxLength={8}
              value={pin} onChange={e => { setPin(e.target.value.replace(/\D/g,'')); setErrorAccion('') }}
              placeholder="••••"
              style={{ width:'100%', padding:'10px', fontSize:22, letterSpacing:8, textAlign:'center', border:'1.5px solid #cbd5e1', borderRadius:8, boxSizing:'border-box' }}
            />
            {errorAccion && <div style={{ color:'#dc2626', fontSize:12, marginTop:6 }}>{errorAccion}</div>}
            <div style={{ display:'flex', gap:8, marginTop:16 }}>
              <button onClick={() => setShowRechazoModal(false)} style={{ flex:1, padding:'10px', background:'#f1f5f9', border:'none', borderRadius:8, fontWeight:700 }}>Cancelar</button>
              <button onClick={handleRechazar} disabled={loadingAccion} style={{ flex:1, padding:'10px', background:'#dc2626', color:'#fff', border:'none', borderRadius:8, fontWeight:700 }}>
                {loadingAccion ? 'Procesando...' : 'Rechazar'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
