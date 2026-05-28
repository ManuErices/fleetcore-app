// src/components/LayoutEditor.jsx
import { useState, useRef, useEffect } from 'react'
import { ASSETS, CATEGORIES } from '../lib/layoutAssets.js'

const CANVAS_W = 900
const CANVAS_H = 480
const LAYOUT_URL = "https://generarlayout-ybgdfxdgqq-uc.a.run.app"

function drawRoundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x+r, y)
  ctx.lineTo(x+w-r, y)
  ctx.quadraticCurveTo(x+w, y, x+w, y+r)
  ctx.lineTo(x+w, y+h-r)
  ctx.quadraticCurveTo(x+w, y+h, x+w-r, y+h)
  ctx.lineTo(x+r, y+h)
  ctx.quadraticCurveTo(x, y+h, x, y+h-r)
  ctx.lineTo(x, y+r)
  ctx.quadraticCurveTo(x, y, x+r, y)
  ctx.closePath()
}

function drawTerrain(ctx, tipo) {
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H)

  // ── Fondo pizarra: blanco cálido con sombra interna ──────────
  // Sombra exterior suave
  ctx.shadowColor = 'rgba(0,0,0,0.18)'
  ctx.shadowBlur = 0
  // Fondo base blanco
  ctx.fillStyle = '#FAFAF8'
  drawRoundRect(ctx, 0, 0, CANVAS_W, CANVAS_H, 18)
  ctx.fill()
  ctx.shadowBlur = 0

  // Marco exterior grueso estilo pizarra profesional
  const grad = ctx.createLinearGradient(0, 0, 0, CANVAS_H)
  grad.addColorStop(0,   '#2C3E50')
  grad.addColorStop(0.5, '#34495E')
  grad.addColorStop(1,   '#2C3E50')
  ctx.strokeStyle = grad
  ctx.lineWidth = 14
  drawRoundRect(ctx, 7, 7, CANVAS_W-14, CANVAS_H-14, 14)
  ctx.stroke()

  // Línea interior decorativa
  ctx.strokeStyle = '#1a252f'
  ctx.lineWidth = 2
  drawRoundRect(ctx, 20, 20, CANVAS_W-40, CANVAS_H-40, 8)
  ctx.stroke()

  // Regla superior — ticks de medida
  ctx.strokeStyle = '#BDC3C7'
  ctx.lineWidth = 1
  for (let x = 30; x < CANVAS_W-30; x += 20) {
    const isMajor = (x - 30) % 100 === 0
    ctx.beginPath()
    ctx.moveTo(x, 22)
    ctx.lineTo(x, isMajor ? 30 : 26)
    ctx.stroke()
    if (isMajor && x > 50 && x < CANVAS_W-60) {
      ctx.fillStyle = '#95A5A6'
      ctx.font = '8px Arial'
      ctx.textAlign = 'center'
      ctx.fillText(String(Math.round((x-30)/10)+'m'), x, 38)
    }
  }
  // Regla izquierda
  for (let y = 50; y < CANVAS_H-30; y += 20) {
    const isMajor = (y - 50) % 100 === 0
    ctx.beginPath()
    ctx.moveTo(22, y)
    ctx.lineTo(isMajor ? 30 : 26, y)
    ctx.stroke()
  }

  // Marca de esquinas decorativas (cruz)
  const corners = [[30,44],[CANVAS_W-30,44],[30,CANVAS_H-28],[CANVAS_W-30,CANVAS_H-28]]
  ctx.strokeStyle = '#BDC3C7'; ctx.lineWidth = 1.5
  corners.forEach(([cx,cy]) => {
    ctx.beginPath(); ctx.moveTo(cx-5,cy); ctx.lineTo(cx+5,cy); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(cx,cy-5); ctx.lineTo(cx,cy+5); ctx.stroke()
  })

  if (tipo === 'lateral') {
    // ── VISTA LATERAL: terreno con cerro ─────────────────────
    // Cielo degradado
    const sky = ctx.createLinearGradient(30, 42, 30, 260)
    sky.addColorStop(0, '#D6EAF8')
    sky.addColorStop(1, '#EBF5FB')
    ctx.fillStyle = sky
    ctx.fillRect(28, 42, CANVAS_W-56, 218)

    // Perfil cerro con textura
    const terr = ctx.createLinearGradient(0, 180, 0, CANVAS_H)
    terr.addColorStop(0, '#C8A96A')
    terr.addColorStop(0.4, '#B8924A')
    terr.addColorStop(1, '#8B6220')
    ctx.fillStyle = terr
    ctx.strokeStyle = '#7A5618'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(28, CANVAS_H-28)
    ctx.lineTo(28, 310)
    ctx.lineTo(100, 268)
    ctx.lineTo(230, 210)
    ctx.lineTo(305, 175)
    ctx.lineTo(595, 175)
    ctx.lineTo(690, 218)
    ctx.lineTo(830, 278)
    ctx.lineTo(CANVAS_W-28, 318)
    ctx.lineTo(CANVAS_W-28, CANVAS_H-28)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()

    // Textura terreno: líneas de estrato
    ctx.strokeStyle = 'rgba(90,60,10,0.15)'
    ctx.lineWidth = 1
    ctx.setLineDash([8, 6])
    for (let i = 0; i < 4; i++) {
      const yoff = 30 + i*18
      ctx.beginPath()
      ctx.moveTo(28, CANVAS_H-28-yoff)
      ctx.lineTo(CANVAS_W-28, CANVAS_H-28-yoff)
      ctx.stroke()
    }
    ctx.setLineDash([])

    // Plataforma
    const platGrad = ctx.createLinearGradient(0, 158, 0, 180)
    platGrad.addColorStop(0, '#D4C26A')
    platGrad.addColorStop(1, '#B8A44A')
    ctx.fillStyle = platGrad
    ctx.strokeStyle = '#7A6218'
    ctx.lineWidth = 2.5
    ctx.fillRect(305, 158, 290, 17)
    ctx.strokeRect(305, 158, 290, 17)

    // Label plataforma con fondo
    ctx.fillStyle = 'rgba(13,43,69,0.82)'
    ctx.fillRect(360, 140, 130, 16)
    ctx.fillStyle = '#FFFFFF'
    ctx.font = 'bold 10px Arial'
    ctx.textAlign = 'center'
    ctx.fillText('PLATAFORMA', 425, 152)

    // Norte decorativo
    ctx.fillStyle = '#2C3E50'
    ctx.font = 'bold 14px Arial'
    ctx.textAlign = 'right'
    ctx.fillText('N ↑', CANVAS_W-35, 58)

  } else {
    // ── VISTA PLANTA ─────────────────────────────────────────
    // Fondo terreno con textura
    const terrPlanta = ctx.createLinearGradient(28, 42, CANVAS_W-28, CANVAS_H-28)
    terrPlanta.addColorStop(0, '#D4B896')
    terrPlanta.addColorStop(1, '#C4A47A')
    ctx.fillStyle = terrPlanta
    ctx.fillRect(28, 42, CANVAS_W-56, CANVAS_H-70)

    // Grilla de referencia
    ctx.strokeStyle = 'rgba(0,0,0,0.07)'
    ctx.lineWidth = 1
    for (let x = 28; x < CANVAS_W-28; x += 50) {
      ctx.beginPath(); ctx.moveTo(x,42); ctx.lineTo(x,CANVAS_H-28); ctx.stroke()
    }
    for (let y = 42; y < CANVAS_H-28; y += 50) {
      ctx.beginPath(); ctx.moveTo(28,y); ctx.lineTo(CANVAS_W-28,y); ctx.stroke()
    }

    // Borde área de trabajo
    ctx.strokeStyle = '#7A5618'; ctx.lineWidth = 2.5
    ctx.strokeRect(38, 52, CANVAS_W-76, CANVAS_H-90)

    // Label área
    ctx.fillStyle = 'rgba(13,43,69,0.82)'
    ctx.fillRect(42, 56, 130, 18)
    ctx.fillStyle = '#FFFFFF'
    ctx.font = 'bold 10px Arial'
    ctx.textAlign = 'left'
    ctx.fillText('ÁREA DE TRABAJO', 48, 69)

    // Norte
    ctx.fillStyle = '#2C3E50'
    ctx.font = 'bold 14px Arial'
    ctx.textAlign = 'right'
    ctx.fillText('N ↑', CANVAS_W-35, 68)
  }

  // Logo MPF esquina inferior derecha
  ctx.fillStyle = 'rgba(44,62,80,0.5)'
  ctx.font = 'bold 9px Arial'
  ctx.textAlign = 'right'
  ctx.fillText('MPF Ingeniería Civil SPA', CANVAS_W-32, CANVAS_H-32)
}

// Renderiza svgOverlay en el canvas via imagen temporal
async function drawSvgOverlay(ctx, svgOverlay) {
  if (!svgOverlay) return
  // Wrap en SVG completo
  const svgFull = `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS_W}" height="${CANVAS_H}" viewBox="0 0 ${CANVAS_W} ${CANVAS_H}">${svgOverlay}</svg>`
  const blob = new Blob([svgFull], { type: 'image/svg+xml' })
  const url  = URL.createObjectURL(blob)
  return new Promise((res) => {
    const img = new Image()
    img.onload = () => { ctx.drawImage(img, 0, 0); URL.revokeObjectURL(url); res() }
    img.onerror = () => { URL.revokeObjectURL(url); res() }
    img.src = url
  })
}

export default function LayoutEditor({ sector, equipos, onExport }) {
  const canvasRef   = useRef(null)
  const bgCanvasRef = useRef(null)
  const [vistaType,  setVistaType]  = useState('planta')
  const [elements,   setElements]   = useState([])
  const [svgOverlay, setSvgOverlay] = useState('')
  const [dragging,   setDragging]   = useState(null)
  const [selected,   setSelected]   = useState(null)
  const [aiLoading,  setAiLoading]  = useState(false)
  const [layoutDesc, setLayoutDesc] = useState('')
  const [showDesc,   setShowDesc]   = useState(false)
  const [activeCategory, setActiveCategory] = useState('maquinaria')
  const nextId = useRef(1)

  // Fondo
  useEffect(() => {
    const bg = bgCanvasRef.current
    if (!bg) return
    drawTerrain(bg.getContext('2d'), vistaType)
  }, [vistaType])

  // Canvas principal: fondo + svgOverlay + imágenes
  useEffect(() => {
    const canvas = canvasRef.current
    const bg     = bgCanvasRef.current
    if (!canvas || !bg) return
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H)
    ctx.drawImage(bg, 0, 0)

    // SVG overlay (zonas, flechas, distancias)
    const renderOverlayThenImages = async () => {
      if (svgOverlay) await drawSvgOverlay(ctx, svgOverlay)

      // Imágenes de equipos encima
      await Promise.all(elements.map(el => new Promise(res => {
        const img = new Image()
        img.src = ASSETS[el.type]?.src || ''
        const draw = () => {
          ctx.drawImage(img, el.x, el.y, el.w, el.h)
          if (selected === el.id) {
            ctx.strokeStyle = '#1B5E8A'; ctx.lineWidth = 2
            ctx.setLineDash([4,2])
            ctx.strokeRect(el.x-2, el.y-2, el.w+4, el.h+4)
            ctx.setLineDash([])
          }
          if (el.label) {
            const tw = Math.max(el.label.length * 6.5, 60)
            ctx.fillStyle = 'rgba(13,43,69,0.88)'
            ctx.fillRect(el.x, el.y + el.h + 2, tw, 16)
            ctx.fillStyle = '#fff'; ctx.font = 'bold 9px Arial'; ctx.textAlign = 'left'
            ctx.fillText(el.label, el.x + 3, el.y + el.h + 13)
          }
          res()
        }
        if (img.complete) draw(); else img.onload = draw; img.onerror = res
      })))
    }
    renderOverlayThenImages()
  }, [elements, svgOverlay, selected, vistaType])

  async function generarConIA() {
    if (!layoutDesc.trim()) { alert('Escribe una descripción del layout.'); return }
    setAiLoading(true)
    try {
      const res = await fetch(LAYOUT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          descripcion: layoutDesc,
          equipos: equipos.filter(e => e.tipo || e.operador),
          sector,
          vistaType,
        }),
      })
      const data = await res.json()
      if (data.elements && Array.isArray(data.elements)) {
        const mapped = data.elements
          .filter(el => ASSETS[el.type])
          .map(el => ({
            ...el,
            id: nextId.current++,
            x: Math.max(10, Math.min(CANVAS_W - (el.w||120) - 10, el.x||300)),
            y: Math.max(10, Math.min(CANVAS_H - (el.h||70) - 30, el.y||150)),
            w: el.w || 120, h: el.h || 70,
          }))
        setElements(mapped)
        setSvgOverlay(data.svgOverlay || '')
        setSelected(null)
      } else {
        alert('La IA no pudo generar el layout. Intenta con una descripción más detallada.')
      }
    } catch(e) { alert('Error: ' + e.message) }
    setAiLoading(false)
  }

  function addElement(type) {
    const isSmall = ['conos','control_acceso','prohibicion','prohibido_peatones','estacionamiento',
                     'calzado_seguridad','casco_seguridad','chaleco_reflectante',
                     'acceso_derecha','acceso_izquierda','espacios_confinados','explosivos',
                     'energia_no_controlada','ambiente_extremo','vehiculo_remoto',
                     'electricidad','caida_objetos','izaje','atrapamiento'].includes(type)
    const w = isSmall ? 70 : 120
    const h = isSmall ? 55 : 70
    const id = nextId.current++
    const x = 200 + (elements.length % 6) * 20
    const y = vistaType === 'lateral' ? 105 : 180
    setElements(prev => [...prev, { id, type, x, y, w, h, label: ASSETS[type].label }])
    setSelected(id)
  }

  function getPos(e) {
    const rect = canvasRef.current.getBoundingClientRect()
    return {
      x: (e.clientX - rect.left) * (CANVAS_W / rect.width),
      y: (e.clientY - rect.top)  * (CANVAS_H / rect.height),
    }
  }

  function onMouseDown(e) {
    const { x, y } = getPos(e)
    for (let i = elements.length - 1; i >= 0; i--) {
      const el = elements[i]
      if (x >= el.x && x <= el.x+el.w && y >= el.y && y <= el.y+el.h) {
        setSelected(el.id)
        setDragging({ id: el.id, offsetX: x-el.x, offsetY: y-el.y })
        return
      }
    }
    setSelected(null)
  }

  function onMouseMove(e) {
    if (!dragging) return
    const { x, y } = getPos(e)
    setElements(prev => prev.map(el =>
      el.id === dragging.id
        ? { ...el, x: Math.max(0, Math.min(CANVAS_W-el.w, x-dragging.offsetX)),
                   y: Math.max(0, Math.min(CANVAS_H-el.h, y-dragging.offsetY)) }
        : el
    ))
  }

  function updateLabel(val) {
    setElements(prev => prev.map(el => el.id === selected ? {...el, label: val} : el))
  }

  function deleteSelected() {
    setElements(prev => prev.filter(el => el.id !== selected))
    setSelected(null)
  }

  async function exportCanvas() {
    const tmp = document.createElement('canvas')
    tmp.width = CANVAS_W; tmp.height = CANVAS_H
    const ctx = tmp.getContext('2d')
    drawTerrain(ctx, vistaType)
    if (svgOverlay) await drawSvgOverlay(ctx, svgOverlay)
    const imgs = elements.map(el => { const img = new Image(); img.src = ASSETS[el.type]?.src; return {img, el} })
    await Promise.all(imgs.map(({img}) => new Promise(r => { if (img.complete) r(); else img.onload = r })))
    imgs.forEach(({img, el}) => {
      ctx.drawImage(img, el.x, el.y, el.w, el.h)
      if (el.label) {
        const tw = Math.max(el.label.length * 6.5, 60)
        ctx.fillStyle = 'rgba(13,43,69,0.88)'
        ctx.fillRect(el.x, el.y+el.h+2, tw, 16)
        ctx.fillStyle = '#fff'; ctx.font = 'bold 9px Arial'; ctx.textAlign = 'left'
        ctx.fillText(el.label, el.x+3, el.y+el.h+13)
      }
    })
    // Leyenda
    ctx.fillStyle = 'rgba(255,255,255,0.92)'
    ctx.fillRect(CANVAS_W-180, 8, 168, 52)
    ctx.fillStyle = '#0D2B45'; ctx.font = 'bold 11px Arial'; ctx.textAlign = 'left'
    ctx.fillText('LAYOUT REFERENCIAL', CANVAS_W-175, 24)
    ctx.font = '10px Arial'; ctx.fillStyle = '#475569'
    ctx.fillText('Sector: ' + (sector||'—'), CANVAS_W-175, 38)
    ctx.fillText('Vista: ' + (vistaType === 'lateral' ? 'Perfil lateral' : 'Planta'), CANVAS_W-175, 52)
    const pngB64 = tmp.toDataURL('image/png').split(',')[1]
    onExport(pngB64, tmp.toDataURL('image/png'))
  }

  const selEl = elements.find(el => el.id === selected)

  return (
    <div style={{ fontFamily: 'inherit' }}>
      {/* Botón IA */}
      <div style={{ background:'#f0f9ff', border:'1px solid #bae6fd', borderRadius:8, padding:'10px 12px', marginBottom:10 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom: showDesc ? 8 : 0 }}>
          <button onClick={() => setShowDesc(!showDesc)} style={{
            padding:'6px 14px', fontSize:12, fontWeight:700,
            background:'#1B5E8A', color:'#fff', border:'none', borderRadius:7, cursor:'pointer',
          }}>
            ✦ Generar propuesta con IA
          </button>
          <span style={{ fontSize:11, color:'#0369a1' }}>
            Describe el layout — la IA posiciona equipos y dibuja zonas, flechas y distancias
          </span>
        </div>
        {showDesc && (
          <div style={{ display:'flex', gap:8, marginTop:4 }}>
            <textarea
              value={layoutDesc}
              onChange={e => setLayoutDesc(e.target.value)}
              rows={3}
              placeholder="Ej: Plataforma 30x30m. Excavadora 56 izquierda, Bulldozer 70 derecha, distancia mínima 20m. Zona segregada perimetral. Acceso sur con conos. Señal casco obligatorio en ingreso. Flecha dirección de trabajo hacia el norte..."
              style={{ flex:1, padding:'8px 10px', fontSize:13, fontFamily:'inherit', border:'1px solid #bae6fd', borderRadius:7, resize:'vertical', outline:'none' }}
            />
            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
              <button onClick={generarConIA} disabled={aiLoading} style={{
                padding:'8px 16px', fontSize:12, fontWeight:700,
                background: aiLoading ? '#94a3b8' : '#0F4761',
                color:'#fff', border:'none', borderRadius:7, cursor: aiLoading ? 'not-allowed':'pointer',
                whiteSpace:'nowrap',
              }}>
                {aiLoading ? '⏳ Generando...' : '→ Aplicar'}
              </button>
              {(elements.length > 0 || svgOverlay) && (
                <button onClick={() => { setElements([]); setSvgOverlay(''); setSelected(null) }} style={{
                  padding:'6px 10px', fontSize:11, background:'transparent',
                  border:'1px solid #fecaca', borderRadius:7, color:'#dc2626', cursor:'pointer',
                }}>Limpiar</button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Toolbar */}
      <div style={{ display:'flex', gap:8, marginBottom:8, alignItems:'center', flexWrap:'wrap' }}>
        <div style={{ display:'flex', gap:4 }}>
          {/* [['lateral','Vista lateral'],['planta','Vista planta']] */}
          {[['planta','Vista planta']].map(([v,l]) => (
            <button key={v} onClick={() => { setVistaType(v); setElements([]); setSvgOverlay(''); setSelected(null) }} style={{
              padding:'6px 12px', fontSize:12, borderRadius:7, cursor:'pointer',
              border: vistaType===v ? '2px solid #1a3a5c' : '1px solid #e2e8f0',
              background: vistaType===v ? '#e8eef5' : 'transparent',
              color: vistaType===v ? '#1a3a5c' : '#475569',
              fontWeight: vistaType===v ? 700 : 400,
            }}>{l}</button>
          ))}
        </div>
        <div style={{ flex:1 }}/>
        {selected && (
          <>
            <input value={selEl?.label||''} onChange={e=>updateLabel(e.target.value)}
              placeholder="Etiqueta del elemento"
              style={{ padding:'5px 8px', fontSize:12, border:'1px solid #e2e8f0', borderRadius:6, width:180 }}/>
            <button onClick={deleteSelected} style={{ padding:'5px 10px', fontSize:12, background:'#fef2f2', border:'1px solid #fecaca', borderRadius:6, color:'#dc2626', cursor:'pointer' }}>🗑</button>
          </>
        )}
        <button onClick={exportCanvas} style={{
          padding:'6px 16px', fontSize:12, fontWeight:700,
          background:'#0F4761', color:'#fff', border:'none', borderRadius:7, cursor:'pointer',
        }}>✓ Usar este layout</button>
      </div>

      <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
        {/* Panel */}
        <div style={{ width:128, flexShrink:0 }}>
          <div style={{ display:'flex', flexDirection:'column', gap:2, marginBottom:6 }}>
            {Object.entries(CATEGORIES).map(([key, label]) => (
              <button key={key} onClick={() => setActiveCategory(key)} style={{
                padding:'3px 6px', fontSize:10, textAlign:'left', borderRadius:5, cursor:'pointer',
                border: activeCategory===key ? '1.5px solid #1a3a5c' : '1px solid #e2e8f0',
                background: activeCategory===key ? '#e8eef5' : 'transparent',
                color: activeCategory===key ? '#1a3a5c' : '#64748b',
                fontWeight: activeCategory===key ? 700 : 400,
              }}>{label}</button>
            ))}
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:4, maxHeight:320, overflowY:'auto' }}>
            {Object.entries(ASSETS).filter(([,a]) => a.category === activeCategory).map(([key, asset]) => (
              <button key={key} onClick={() => addElement(key)} style={{
                display:'flex', flexDirection:'column', alignItems:'center', gap:2,
                padding:'4px 2px', borderRadius:6, cursor:'pointer',
                border:'1px solid #e2e8f0', background:'#fafafa',
              }} title={'+ ' + asset.label}>
                <img src={asset.src} alt={asset.label} style={{ width:80, height:40, objectFit:'contain' }}/>
                <span style={{ fontSize:9, color:'#475569', textAlign:'center', lineHeight:1.2 }}>{asset.label}</span>
              </button>
            ))}
          </div>
          <p style={{ fontSize:9, color:'#94a3b8', marginTop:4, textAlign:'center', lineHeight:1.4 }}>
            Clic para agregar.<br/>Arrastra para mover.
          </p>
        </div>

        {/* Canvas */}
        <div style={{ flex:'1 1 300px', borderRadius:8, overflow:'hidden', border:'1px solid #e2e8f0' }}>
          <canvas ref={bgCanvasRef} width={CANVAS_W} height={CANVAS_H}
            style={{ display:'none' }}/>
          <canvas ref={canvasRef} width={CANVAS_W} height={CANVAS_H}
            style={{ width:'100%', height:'auto', cursor: dragging ? 'grabbing':'default', display:'block' }}
            onMouseDown={onMouseDown} onMouseMove={onMouseMove}
            onMouseUp={() => setDragging(null)} onMouseLeave={() => setDragging(null)}
          />
        </div>
      </div>
      <p style={{ fontSize:10, color:'#94a3b8', marginTop:5 }}>
        💡 La IA dibuja automáticamente zonas segregadas, flechas y distancias. Agrega manualmente cualquier elemento adicional desde el panel.
      </p>
    </div>
  )
}
