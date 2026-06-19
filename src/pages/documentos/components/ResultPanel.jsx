// src/components/ResultPanel.jsx
import { useState, useRef, useEffect } from 'react'
import { guardarDocumento } from '../lib/documentos.js'
import FirmasPanel from './FirmasPanel.jsx'

const EXPORT_URL = "https://exportarword-ybgdfxdgqq-uc.a.run.app"

// ─── Markdown renderer ────────────────────────────────────────────────────────

function renderInline(text, key) {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/)
  return (
    <span key={key}>
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**'))
          return <strong key={i}>{part.slice(2, -2)}</strong>
        if (part.startsWith('*') && part.endsWith('*'))
          return <em key={i}>{part.slice(1, -1)}</em>
        return part
      })}
    </span>
  )
}

function MarkdownDoc({ text }) {
  const lines = text.split('\n')
  const elements = []
  let listItems = []
  let paraLines = []
  let key = 0

  const flushPara = () => {
    if (!paraLines.length) return
    const content = paraLines.join(' ').trim()
    if (content) elements.push(
      <p key={key++} style={{ margin: '0 0 .9em', lineHeight: 1.75, color: '#334155' }}>
        {renderInline(content, key)}
      </p>
    )
    paraLines = []
  }
  const flushList = () => {
    if (!listItems.length) return
    elements.push(
      <ul key={key++} style={{ margin: '0 0 .9em', paddingLeft: '1.4em', color: '#334155' }}>
        {listItems.map((item, i) => (
          <li key={i} style={{ marginBottom: '.3em', lineHeight: 1.7 }}>
            {renderInline(item, i)}
          </li>
        ))}
      </ul>
    )
    listItems = []
  }

  for (const line of lines) {
    if (line.startsWith('# ')) {
      flushPara(); flushList()
      elements.push(
        <h1 key={key++} style={{ fontSize: '1.25em', fontWeight: 800, color: '#0f172a', margin: '1.2em 0 .5em', letterSpacing: '-.01em' }}>
          {renderInline(line.slice(2), key)}
        </h1>
      )
    } else if (line.startsWith('## ')) {
      flushPara(); flushList()
      elements.push(
        <h2 key={key++} style={{ fontSize: '1em', fontWeight: 700, color: '#1e40af', textTransform: 'uppercase', letterSpacing: '.06em', margin: '1.4em 0 .4em', paddingBottom: '.3em', borderBottom: '1px solid #e2e8f0' }}>
          {renderInline(line.slice(3), key)}
        </h2>
      )
    } else if (line.startsWith('### ')) {
      flushPara(); flushList()
      elements.push(
        <h3 key={key++} style={{ fontSize: '.95em', fontWeight: 700, color: '#374151', margin: '1em 0 .35em' }}>
          {renderInline(line.slice(4), key)}
        </h3>
      )
    } else if (/^---+$/.test(line.trim())) {
      flushPara(); flushList()
      elements.push(<hr key={key++} style={{ border: 'none', borderTop: '1px solid #e2e8f0', margin: '1.2em 0' }} />)
    } else if (line.startsWith('- ')) {
      flushPara()
      listItems.push(line.slice(2))
    } else if (line.trim() === '') {
      flushPara(); flushList()
    } else {
      flushList()
      paraLines.push(line)
    }
  }
  flushPara(); flushList()

  return <>{elements}</>
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
      ctx.drawImage(img, (width - img.width * scale) / 2, (height - img.height * scale) / 2, img.width * scale, img.height * scale)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/png').split(',')[1])
    }
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(e) }
    img.src = url
  })
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ResultPanel({ texto, loading, tipo, titulo, session, fecha, sector, extraFields, layoutPngB64, onSaved }) {
  const [copied,    setCopied]    = useState(false)
  const [saving,    setSaving]    = useState(false)
  const [saved,     setSaved]     = useState(false)
  const [docId,     setDocId]     = useState(null)
  const [exporting, setExporting] = useState(false)
  const [firmas,    setFirmas]    = useState({})
  const [tab,       setTab]       = useState('preview') // 'preview' | 'raw'

  const scrollRef = useRef(null)
  const isNearBottom = useRef(true)

  // Track if user scrolled up (so we stop auto-scrolling)
  const handleScroll = () => {
    const el = scrollRef.current
    if (!el) return
    isNearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
  }

  // Auto-scroll to bottom while streaming
  useEffect(() => {
    if (!loading || !isNearBottom.current) return
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [texto, loading])

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

  // Show panel as soon as generation starts
  if (!texto && !loading) return null

  const firmasCompletas = Object.keys(firmas).length === 3 && Object.values(firmas).every(f => f.firmado)

  return (
    <div style={{ marginTop: 24, animation: 'resultFade .4s ease' }}>
      <style>{`
        @keyframes resultFade { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
        @keyframes successPulse { 0%,100%{box-shadow:0 0 0 0 rgba(16,185,129,.4)} 50%{box-shadow:0 0 0 8px rgba(16,185,129,0)} }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
        .rp-btn {
          padding: 7px 14px; font-size: 12px; font-weight: 500;
          background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.15);
          border-radius: 8px; cursor: pointer; color: rgba(255,255,255,.8);
          font-family: inherit; transition: all .15s; white-space: nowrap;
        }
        .rp-btn:hover:not(:disabled) { background: rgba(255,255,255,.16); color: #fff; }
        .rp-btn:disabled { opacity: .5; cursor: default; }
        .rp-tab { padding: 4px 14px; font-size: 11px; font-weight: 700; border-radius: 6px; border: none; cursor: pointer; font-family: inherit; transition: all .15s; }
        .markdown-body { font-size: 14px; font-family: 'Georgia', serif; }
        @media (max-width: 600px) { .rp-actions { flex-direction: column !important; } }
      `}</style>

      <div style={{ background: '#fff', borderRadius: 16, overflow: 'hidden', boxShadow: '0 4px 24px rgba(0,0,0,0.08)', border: '1px solid rgba(16,185,129,0.2)' }}>

        {/* Header */}
        <div style={{ background: 'linear-gradient(135deg, #0F2035 0%, #1a3a5c 50%, #134e4a 100%)', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 26, height: 26, borderRadius: 7, background: loading ? 'rgba(255,255,255,.15)' : 'linear-gradient(135deg, #10B981, #059669)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: loading ? 'none' : '0 0 10px rgba(16,185,129,.5)', animation: loading ? 'none' : 'successPulse 2.5s ease infinite' }}>
              {loading ? (
                <div style={{ display: 'flex', gap: 3 }}>
                  {[0,1,2].map(i => <div key={i} style={{ width: 4, height: 4, borderRadius: '50%', background: '#fff', animation: `blink 1.2s ease ${i * .2}s infinite` }} />)}
                </div>
              ) : (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
              )}
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#fff', lineHeight: 1 }}>{loading ? 'Generando documento…' : 'Documento generado'}</div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,.45)', marginTop: 2 }}>{loading ? 'La IA está redactando el informe' : 'Listo para revisión y exportación'}</div>
            </div>
          </div>

          <div className="rp-actions" style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            {/* Tab switcher */}
            <div style={{ display: 'flex', background: 'rgba(0,0,0,.25)', borderRadius: 8, padding: 2, gap: 2 }}>
              <button className="rp-tab" onClick={() => setTab('preview')} style={{ background: tab === 'preview' ? 'rgba(255,255,255,.15)' : 'transparent', color: tab === 'preview' ? '#fff' : 'rgba(255,255,255,.5)' }}>Vista previa</button>
              <button className="rp-tab" onClick={() => setTab('raw')} style={{ background: tab === 'raw' ? 'rgba(255,255,255,.15)' : 'transparent', color: tab === 'raw' ? '#fff' : 'rgba(255,255,255,.5)' }}>Texto</button>
            </div>
            <button onClick={copiar} disabled={!texto} className="rp-btn">{copied ? '¡Copiado!' : 'Copiar'}</button>
            <button onClick={guardar} disabled={saving || saved || !texto} className="rp-btn" style={{ background: saved ? 'rgba(16,185,129,.2)' : undefined, borderColor: saved ? 'rgba(16,185,129,.4)' : undefined, color: saved ? '#6EE7B7' : undefined }}>
              {saved ? '✓ Guardado' : saving ? 'Guardando…' : 'Guardar'}
            </button>
            <button onClick={exportarWord} disabled={exporting || !texto} className="rp-btn" style={{ background: exporting ? 'rgba(255,255,255,.08)' : firmasCompletas ? 'rgba(16,185,129,.3)' : 'rgba(37,99,235,.4)', borderColor: firmasCompletas ? 'rgba(16,185,129,.5)' : 'rgba(37,99,235,.5)', color: '#fff', fontWeight: 700 }}>
              {exporting ? '⏳ Generando…' : firmasCompletas ? '⬇ Word (firmado)' : '⬇ Exportar Word'}
            </button>
          </div>
        </div>

        {/* Document body */}
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          style={{ padding: '2rem 2.5rem', maxHeight: 580, overflowY: 'auto', background: '#fafafa' }}
        >
          {/* Paper-like inner container */}
          <div style={{ background: '#fff', borderRadius: 8, padding: '2rem 2.5rem', boxShadow: '0 1px 6px rgba(0,0,0,0.07)', minHeight: 200, position: 'relative' }}>
            {!texto && loading && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#94a3b8', fontSize: 13 }}>
                <div style={{ display: 'flex', gap: 4 }}>
                  {[0,1,2].map(i => <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: '#94a3b8', animation: `blink 1.2s ease ${i * .2}s infinite` }} />)}
                </div>
                Esperando respuesta de la IA…
              </div>
            )}
            {tab === 'preview' ? (
              <div className="markdown-body">
                <MarkdownDoc text={texto} />
                {loading && texto && (
                  <span style={{ display: 'inline-block', width: 2, height: '1em', background: '#1e40af', marginLeft: 1, animation: 'blink .8s step-end infinite', verticalAlign: 'text-bottom' }} />
                )}
              </div>
            ) : (
              <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12.5, lineHeight: 1.8, color: '#475569', fontFamily: 'monospace', margin: 0 }}>
                {texto}
                {loading && <span style={{ animation: 'blink .8s step-end infinite' }}>▋</span>}
              </pre>
            )}
          </div>
        </div>
      </div>

      {/* Firmas — solo cuando el documento está completo y guardado */}
      {!loading && texto && (
        <FirmasPanel docId={docId} onFirmasUpdate={setFirmas} />
      )}
    </div>
  )
}
