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
          firmas,
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
    <div style={{ marginTop: 24, animation: 'resultFade .5s ease' }}>
      <style>{`
        @keyframes resultFade {
          from { opacity:0; transform: translateY(16px); }
          to   { opacity:1; transform: translateY(0); }
        }
        @keyframes successPulse {
          0%,100% { box-shadow: 0 0 0 0 rgba(16,185,129,0.4); }
          50%      { box-shadow: 0 0 0 8px rgba(16,185,129,0); }
        }
        .result-copy-btn {
          padding: 7px 14px; font-size: 12px; font-weight: 500;
          background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15);
          border-radius: 8px; cursor: pointer; color: rgba(255,255,255,0.75);
          font-family: inherit; transition: all .15s;
        }
        .result-copy-btn:hover { background: rgba(255,255,255,0.14); color: #fff; }
        .result-save-btn {
          padding: 7px 14px; font-size: 12px; font-weight: 500;
          background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15);
          border-radius: 8px; cursor: pointer; color: rgba(255,255,255,0.75);
          font-family: inherit; transition: all .15s;
        }
        .result-save-btn:hover:not(:disabled) { background: rgba(255,255,255,0.14); color: #fff; }
        .result-export-btn {
          padding: 7px 16px; font-size: 12px; font-weight: 700;
          border: none; border-radius: 8px; cursor: pointer;
          font-family: inherit; transition: all .15s;
          display: flex; align-items: center; gap: 6px;
        }
        .result-export-btn:hover:not(:disabled) { transform: translateY(-1px); }
      `}</style>

      {/* Panel principal del documento generado */}
      <div style={{
        background: '#fff',
        borderRadius: 16,
        overflow: 'hidden',
        boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
        border: '1px solid rgba(16,185,129,0.2)',
      }}>
        {/* Header del documento */}
        <div style={{
          background: 'linear-gradient(135deg, #0F2035 0%, #1a3a5c 50%, #134e4a 100%)',
          padding: '14px 20px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          flexWrap: 'wrap', gap: 10,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 28, height: 28, borderRadius: 8,
              background: 'linear-gradient(135deg, #10B981, #059669)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 0 10px rgba(16,185,129,0.5)',
              animation: 'successPulse 2.5s ease infinite',
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M5 13l4 4L19 7" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#fff', lineHeight: 1 }}>Documento generado</div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>Listo para revisión y exportación</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <button onClick={copiar} className="result-copy-btn">
              {copied ? '¡Copiado!' : 'Copiar texto'}
            </button>
            <button
              onClick={guardar}
              disabled={saving || saved}
              className="result-save-btn"
              style={{
                background: saved ? 'rgba(16,185,129,0.2)' : undefined,
                borderColor: saved ? 'rgba(16,185,129,0.4)' : undefined,
                color: saved ? '#6EE7B7' : undefined,
                cursor: saved || saving ? 'default' : 'pointer',
              }}
            >
              {saved ? '✓ Guardado' : saving ? 'Guardando…' : 'Guardar'}
            </button>
            <button
              onClick={exportarWord}
              disabled={exporting}
              className="result-export-btn"
              style={{
                background: exporting ? '#94a3b8'
                  : firmasCompletas ? 'linear-gradient(135deg, #10B981, #059669)'
                  : 'linear-gradient(135deg, #2563eb, #0891b2)',
                color: '#fff',
                boxShadow: exporting ? 'none'
                  : firmasCompletas ? '0 3px 12px rgba(16,185,129,0.4)'
                  : '0 3px 12px rgba(37,99,235,0.4)',
                cursor: exporting ? 'not-allowed' : 'pointer',
              }}
            >
              {exporting ? (
                '⏳ Generando...'
              ) : (
                <>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                    <path d="M12 10v6m0 0l-3-3m3 3l3-3M3 17v2a2 2 0 002 2h14a2 2 0 002-2v-2" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  {firmasCompletas ? 'Exportar Word (firmado)' : 'Exportar Word'}
                </>
              )}
            </button>
          </div>
        </div>

        {/* Contenido del documento */}
        <div style={{ padding: '1.5rem' }}>
          <pre style={{
            whiteSpace: 'pre-wrap',
            fontSize: 13.5,
            lineHeight: 1.9,
            color: '#1e293b',
            fontFamily: 'inherit',
            maxHeight: 560,
            overflowY: 'auto',
            paddingRight: 4,
            margin: 0,
          }}>
            {texto}
          </pre>
        </div>
      </div>

      {/* Panel de firmas */}
      <FirmasPanel
        docId={docId}
        onFirmasUpdate={setFirmas}
      />
    </div>
  )
}
