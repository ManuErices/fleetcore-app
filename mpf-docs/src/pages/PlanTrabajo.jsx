// src/pages/PlanTrabajo.jsx
import { useState } from 'react'
import { generarConIA } from '../lib/claude.js'
import ResultPanel from '../components/ResultPanel.jsx'
import LayoutEditor from '../components/LayoutEditor.jsx'

const today = new Date().toISOString().split('T')[0]

const S = {
  page: { maxWidth: 800 },
  heading: { fontSize: 22, fontWeight: 600, color: '#1e293b', marginBottom: 4 },
  subheading: { fontSize: 14, color: '#64748b', marginBottom: 24 },
  card: { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '1.1rem 1.25rem', marginBottom: 14 },
  cardTitle: { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: '#64748b', paddingBottom: 10, marginBottom: 14, borderBottom: '1px solid #f1f5f9' },
  row: { display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap' },
  col: { flex: '1 1 160px', minWidth: 0 },
  label: { display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: '#64748b', marginBottom: 5 },
  input: { width: '100%', padding: '9px 12px', fontSize: 14, fontFamily: 'inherit', border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', color: '#1e293b', outline: 'none', boxSizing: 'border-box' },
  textarea: { width: '100%', padding: '9px 12px', fontSize: 14, fontFamily: 'inherit', lineHeight: 1.65, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', color: '#1e293b', outline: 'none', resize: 'vertical', boxSizing: 'border-box' },
  tipBox: { background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 8, padding: '9px 12px', fontSize: 12, color: '#0369a1', marginBottom: 10 },
  btnGenerate: { width: '100%', padding: '13px 20px', fontSize: 15, fontWeight: 600, background: '#1a3a5c', color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer', marginTop: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 },
  btnDisabled: { width: '100%', padding: '13px 20px', fontSize: 15, fontWeight: 600, background: '#94a3b8', color: '#fff', border: 'none', borderRadius: 10, cursor: 'not-allowed', marginTop: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 },
  btnAdd: { padding: '7px 14px', fontSize: 13, background: 'transparent', border: '1px solid #e2e8f0', borderRadius: 8, color: '#475569', cursor: 'pointer', marginTop: 4 },
  btnRemove: { flexShrink: 0, marginTop: 4, padding: '5px 10px', fontSize: 14, background: 'transparent', border: '1px solid #fecaca', borderRadius: 7, color: '#dc2626', cursor: 'pointer' },
  numBadge: { flexShrink: 0, width: 26, height: 26, borderRadius: '50%', background: '#1a3a5c', color: '#fff', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 6 },
}

function Dots() {
  return (
    <span style={{ display:'inline-flex', gap:4, alignItems:'center' }}>
      {[0,1,2].map(i=>(
        <span key={i} style={{ width:5,height:5,borderRadius:'50%',background:'#fff',animation:'pulse 1.2s infinite',animationDelay:`${i*0.2}s` }}/>
      ))}
    </span>
  )
}

function ItemList({ items, setItems, placeholder }) {
  const add    = () => setItems([...items, ''])
  const remove = i => { if (items.length > 1) setItems(items.filter((_,x)=>x!==i)) }
  const set    = (i, v) => setItems(items.map((a,x)=>x===i?v:a))
  return (
    <div>
      {items.map((item, i) => (
        <div key={i} style={{ display:'flex', gap:8, marginBottom:8, alignItems:'flex-start' }}>
          <div style={S.numBadge}>{i+1}</div>
          <textarea className="fi" style={{...S.textarea, flex:1}} rows={2}
            value={item} onChange={e=>set(i,e.target.value)} placeholder={placeholder}/>
          <button style={S.btnRemove} onClick={()=>remove(i)}>×</button>
        </div>
      ))}
      <button style={S.btnAdd} onClick={add}>+ Agregar punto</button>
    </div>
  )
}

export default function PlanTrabajo({ session }) {
  const [loading, setLoading] = useState(false)
  const [result,  setResult]  = useState('')
  const [layoutPngB64,  setLayoutPngB64]  = useState('')
  const [layoutPreview, setLayoutPreview] = useState('')
  const [layoutConfirmed, setLayoutConfirmed] = useState(false)

  const [titulo,     setTitulo]     = useState('')
  const [fecha,      setFecha]      = useState(today)
  const [sector,     setSector]     = useState('')
  const [supervisor, setSupervisor] = useState('')
  const [cargo,      setCargo]      = useState('')

  const [equipos, setEquipos] = useState([{ tipo: '', operador: '' }])
  const addEquipo    = () => setEquipos([...equipos, { tipo: '', operador: '' }])
  const removeEquipo = i  => { if (equipos.length > 1) setEquipos(equipos.filter((_,x)=>x!==i)) }
  const setEquipo    = (i, field, val) => setEquipos(equipos.map((e,x)=>x===i?{...e,[field]:val}:e))

  const [actividad,  setActividad]  = useState([''])
  const [proceso,    setProceso]    = useState([''])
  const [seguridad,  setSeguridad]  = useState([''])
  const [importante, setImportante] = useState([''])

  function handleLayoutExport(pngB64, previewUrl) {
    setLayoutPngB64(pngB64)
    setLayoutPreview(previewUrl)
    setLayoutConfirmed(true)
  }

  async function generar() {
    const actsValidas = actividad.filter(a=>a.trim())
    if (!actsValidas.length) { alert('Describe la actividad por realizar.'); return }
    if (!titulo.trim())      { alert('Ingresa el título del plan de trabajo.'); return }

    const eqStr = equipos.filter(e=>e.tipo||e.operador)
      .map(e=>`  • ${e.tipo||'Equipo'}: Operador ${e.operador||'por asignar'}`).join('\n')

    const prompt = `Eres el redactor técnico oficial de MPF Ingeniería Civil SPA.
Transforma el siguiente borrador en un PLAN DE TRABAJO DIARIO profesional y formal, para presentar al mandante Río Tinto Mining.

El documento DEBE tener exactamente estas 5 secciones con estos títulos:
## 1. ACTIVIDAD POR REALIZAR
## 2. PROCESO DE EJECUCIÓN DE LA TAREA
## 3. RECOMENDACIÓN DE SEGURIDAD
## 4. IMPORTANTE
## 5. LAYOUT REFERENCIAL

DATOS DEL PLAN:
- Título: ${titulo}
- Fecha: ${fecha}
- Sector/Plataforma: ${sector||'sin especificar'}
- Supervisor: ${supervisor||'sin especificar'}${cargo ? ` (${cargo})` : ''}
${eqStr ? `- Equipos asignados:\n${eqStr}` : ''}

SECCIÓN 1 - ACTIVIDAD POR REALIZAR:
${actsValidas.map((a,i)=>`${i+1}. ${a}`).join('\n')}

SECCIÓN 2 - PROCESO DE EJECUCIÓN:
${proceso.filter(p=>p.trim()).map((p,i)=>`${i+1}. ${p}`).join('\n') || 'Desarrollar proceso paso a paso.'}

SECCIÓN 3 - RECOMENDACIÓN DE SEGURIDAD:
${seguridad.filter(s=>s.trim()).map(s=>`- ${s}`).join('\n') || 'Incluir recomendaciones de seguridad estándar.'}

SECCIÓN 4 - IMPORTANTE:
${importante.filter(i=>i.trim()).map(i=>`- ${i}`).join('\n') || 'Incluir prohibiciones y consideraciones importantes.'}

SECCIÓN 5 - LAYOUT REFERENCIAL:
- ${layoutConfirmed ? 'Se adjunta layout referencial generado digitalmente con posición de equipos y elementos de seguridad.' : 'Se adjunta croquis referencial de posición de equipos y área de trabajo.'}

Redacta con lenguaje técnico formal, sin errores ortográficos. Usa bullets con guión (-). Listo para entregar al mandante.`

    setResult('')
    setLoading(true)
    try {
      await generarConIA(prompt, chunk => setResult(r => r + chunk))
    } catch(e) { alert('Error: ' + e.message) }
    setLoading(false)
  }

  const tituloDoc = `Plan de Trabajo – ${titulo||sector||'Sin título'} – ${fecha}`

  return (
    <div style={S.page}>
      <style>{`
        @keyframes pulse{0%,80%,100%{transform:scale(.7);opacity:.4}40%{transform:scale(1);opacity:1}}
        .fi:focus{border-color:#1a3a5c!important;box-shadow:0 0 0 3px rgba(26,58,92,.1)!important;}
      `}</style>

      <div style={S.heading}>Plan de Trabajo Diario</div>
      <div style={S.subheading}>Completa cada sección. La IA genera el documento formal con la estructura requerida por Río Tinto.</div>

      {/* Identificación */}
      <div style={S.card}>
        <div style={S.cardTitle}>Identificación del documento</div>
        <div style={S.row}>
          <div style={{...S.col, flex:'2 1 300px'}}>
            <label style={S.label}>Título del plan de trabajo</label>
            <input className="fi" style={S.input} value={titulo} onChange={e=>setTitulo(e.target.value)} placeholder="Ej: Construcción Plataforma NCEH-022"/>
          </div>
          <div style={S.col}>
            <label style={S.label}>Fecha</label>
            <input className="fi" style={S.input} type="date" value={fecha} onChange={e=>setFecha(e.target.value)}/>
          </div>
        </div>
        <div style={S.row}>
          <div style={S.col}>
            <label style={S.label}>Sector / Plataforma</label>
            <input className="fi" style={S.input} value={sector} onChange={e=>setSector(e.target.value)} placeholder="NCEH-022"/>
          </div>
          <div style={S.col}>
            <label style={S.label}>Realizado por</label>
            <input className="fi" style={S.input} value={supervisor} onChange={e=>setSupervisor(e.target.value)} placeholder="Nombre supervisor"/>
          </div>
          <div style={S.col}>
            <label style={S.label}>Cargo</label>
            <input className="fi" style={S.input} value={cargo} onChange={e=>setCargo(e.target.value)} placeholder="Supervisor de Terreno"/>
          </div>
        </div>
      </div>

      {/* Equipos */}
      <div style={S.card}>
        <div style={S.cardTitle}>Equipos y Operadores</div>
        {equipos.map((eq, i) => (
          <div key={i} style={S.row}>
            <div style={S.col}>
              {i===0 && <label style={S.label}>Equipo</label>}
              <input className="fi" style={S.input} value={eq.tipo} onChange={e=>setEquipo(i,'tipo',e.target.value)} placeholder="Ej: Excavadora 56"/>
            </div>
            <div style={S.col}>
              {i===0 && <label style={S.label}>Operador</label>}
              <input className="fi" style={S.input} value={eq.operador} onChange={e=>setEquipo(i,'operador',e.target.value)} placeholder="Nombre operador"/>
            </div>
            <button style={{...S.btnRemove, marginTop: i===0 ? 22 : 0}} onClick={()=>removeEquipo(i)}>×</button>
          </div>
        ))}
        <button style={S.btnAdd} onClick={addEquipo}>+ Agregar equipo</button>
      </div>

      {/* Secciones */}
      <div style={S.card}>
        <div style={S.cardTitle}>1. Actividad por realizar</div>
        <div style={S.tipBox}>💡 Describe la tarea con área, objetivo y condiciones del sector.</div>
        <ItemList items={actividad} setItems={setActividad} placeholder="Ej: Excavación y conformación de terraza en sector alto de plataforma NCEH-022..."/>
      </div>

      <div style={S.card}>
        <div style={S.cardTitle}>2. Proceso de ejecución de la tarea</div>
        <div style={S.tipBox}>💡 Paso a paso de cómo se realizará la tarea.</div>
        <ItemList items={proceso} setItems={setProceso} placeholder="Ej: Traslado de personal desde campamento a plataforma..."/>
      </div>

      <div style={S.card}>
        <div style={S.cardTitle}>3. Recomendación de seguridad</div>
        <div style={S.tipBox}>💡 Medidas de seguridad específicas para esta tarea.</div>
        <ItemList items={seguridad} setItems={setSeguridad} placeholder="Ej: Mantener comunicación radial en frecuencia N°1..."/>
      </div>

      <div style={S.card}>
        <div style={S.cardTitle}>4. Importante</div>
        <div style={S.tipBox}>💡 Prohibiciones y consideraciones críticas.</div>
        <ItemList items={importante} setItems={setImportante} placeholder="Ej: El operador solo ejecutará la actividad descrita en este plan..."/>
      </div>

      {/* Layout editor */}
      <div style={S.card}>
        <div style={S.cardTitle}>
          5. Layout referencial
          {layoutConfirmed && <span style={{ marginLeft:8, background:'#dcfce7', color:'#15803d', padding:'2px 8px', borderRadius:99, fontSize:10, fontWeight:700 }}>✓ Listo</span>}
        </div>
        <div style={S.tipBox}>
          💡 Usa el editor para posicionar los equipos y elementos de seguridad. Clic en un elemento del panel izquierdo para agregarlo, luego arrástralo a su posición. Cuando esté listo presiona <strong>"✓ Usar este layout"</strong>.
        </div>

        {layoutConfirmed && layoutPreview ? (
          <div>
            <img src={layoutPreview} alt="Layout confirmado" style={{ width:'100%', borderRadius:8, border:'1px solid #e2e8f0', marginBottom:10 }}/>
            <button onClick={() => { setLayoutConfirmed(false); setLayoutPngB64(''); setLayoutPreview('') }}
              style={{ padding:'6px 14px', fontSize:12, background:'transparent', border:'1px solid #e2e8f0', borderRadius:7, color:'#475569', cursor:'pointer' }}>
              ✏️ Editar layout
            </button>
          </div>
        ) : (
          <LayoutEditor
            sector={sector}
            equipos={equipos}
            onExport={handleLayoutExport}
          />
        )}
      </div>

      <button style={loading ? S.btnDisabled : S.btnGenerate} onClick={generar} disabled={loading}>
        {loading ? <><Dots/> Generando plan...</> : '✦ Generar plan de trabajo profesional'}
      </button>

      <ResultPanel
        texto={result} tipo="plan"
        titulo={tituloDoc}
        session={session}
        fecha={fecha}
        sector={sector}
        extraFields={{ supervisor, cargo, equipos }}
        layoutPngB64={layoutPngB64}
      />
    </div>
  )
}
