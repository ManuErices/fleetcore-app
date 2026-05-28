// src/components/ResultPanel.jsx
import { useState } from 'react'
import { guardarDocumento } from '../lib/documentos.js'
import FirmasPanel from './FirmasPanel.jsx'

const EXPORT_URL = "https://exportarword-ybgdfxdgqq-uc.a.run.app"

async function svgToPngBase64(svgString, width = 1800, height = 900) {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas')
    canvas.width = width; canvas.height = height
    const ctx = canvas.getContext('2d')
    const img = new Image()
    const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(svgBlob)
    img.onload = () => {
      ctx.fillStyle = '#f8fafc'; ctx.fillRect(0, 0, width, height)
      const scale = Math.min(width / img.width, height / img.height)
      const x = (width - img.width * scale) / 2
      const y = (height - img.height * scale) / 2
      ctx.drawImage(img, x, y, img.width * scale, img.height * scale)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/png').split(',')[1])
    }
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(e) }
    img.src = url
  })
}

export default function ResultPanel({ texto, tipo, titulo, session, fecha, sector, extraFields, layoutPngB64, onSaved }) {
  const [copied,    setCopied]    = useState(false)
  const [saving,    setSaving]    = useState(false)
  const [saved,     setSaved]     = useState(false)
  const [docId,     setDocId]     = useState(null)
  const [exporting, setExporting] = useState(false)
  const [firmas,    setFirmas]    = useState({})

  async function copiar() {
    await navigator.clipboard.writeText(texto)
    setCopied(true); setTimeout(() => setCopied(false), 2000)
  }

  async function guardar() {
    setSaving(true)
    try {
      const id = await guardarDocumento({
        tipo, titulo, contenido: texto,
        usuario: session.usuario, nombre: session.nombre,
        fecha, sector,
        extraFields: extraFields || {},
        layoutPngB64: layoutPngB64 || '',
      })
      setDocId(id)
      setSaved(true)
      onSaved?.()
    } catch(e) { alert('Error al guardar: ' + e.message) }
    setSaving(false)
  }

  async function exportarWord() {
    setExporting(true)
    try {
      const response = await fetch(EXPORT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo, titulo, contenido: texto,
          fecha: fecha || new Date().toLocaleDateString('es-CL'),
          usuario: session.nombre || session.usuario,
          sector: sector || '',
          extraFields: extraFields || {},
          layoutPngB64: layoutPngB64 || '',
          firmas, // incluye datos de firmas en el Word
        }),
      })
      if (!response.ok) throw new Error('Error al generar Word')
      const blob = await response.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href = url
      a.download = (titulo || 'documento_mpf').replace(/[^a-zA-Z0-9_\-]/g, '_') + '.docx'
      a.click()
      URL.revokeObjectURL(url)
    } catch(e) { alert('Error al exportar: ' + e.message) }
    setExporting(false)
  }

  if (!texto) return null

  const firmasCompletas = Object.keys(firmas).length === 3 && Object.values(firmas).every(f => f.firmado)

  return (
    <div style={{ marginTop: 20 }}>
      {/* Panel de texto generado */}
      <div style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:12, padding:'1.25rem' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', paddingBottom:12, marginBottom:16, borderBottom:'1px solid #f1f5f9', flexWrap:'wrap', gap:8 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'.06em', color:'#64748b' }}>Documento generado</span>
            <span style={{ background:'#dcfce7', color:'#15803d', padding:'2px 8px', borderRadius:99, fontSize:11, fontWeight:700 }}>✓ Listo</span>
          </div>
          <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
            <button onClick={copiar} style={{ padding:'6px 12px', fontSize:12, background:'transparent', border:'1px solid #e2e8f0', borderRadius:7, cursor:'pointer', color:'#475569' }}>
              {copied ? '¡Copiado!' : 'Copiar texto'}
            </button>
            <button onClick={guardar} disabled={saving||saved} style={{ padding:'6px 12px', fontSize:12, background: saved?'#dcfce7':'transparent', border:'1px solid #e2e8f0', borderRadius:7, cursor:saved||saving?'default':'pointer', color:saved?'#15803d':'#475569' }}>
              {saved ? '✓ Guardado' : saving ? 'Guardando…' : 'Guardar'}
            </button>
            <button onClick={exportarWord} disabled={exporting} style={{ padding:'6px 14px', fontSize:12, fontWeight:600, background:exporting?'#94a3b8': firmasCompletas?'#15803d':'#0F4761', border:'none', borderRadius:7, cursor:exporting?'not-allowed':'pointer', color:'#fff', display:'flex', alignItems:'center', gap:6 }}>
              {exporting ? '⏳ Generando...' : firmasCompletas ? '⬇ Exportar Word (firmado)' : '⬇ Exportar Word'}
            </button>
          </div>
        </div>
        <pre style={{ whiteSpace:'pre-wrap', fontSize:13.5, lineHeight:1.9, color:'#1e293b', fontFamily:'inherit', maxHeight:560, overflowY:'auto', paddingRight:4 }}>
          {texto}
        </pre>
      </div>

      {/* Panel de firmas */}
      <FirmasPanel
        docId={docId}
        onFirmasUpdate={setFirmas}
      />
    </div>
  )
}
