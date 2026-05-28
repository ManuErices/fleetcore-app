// src/pages/InformeDiario.jsx
import { useState } from 'react'
import { generarConIA } from '../lib/claude.js'
import ResultPanel from '../components/ResultPanel.jsx'

const today = new Date().toISOString().split('T')[0]

export default function InformeDiario({ session }) {
  const [loading, setLoading] = useState(false)
  const [result, setResult]   = useState('')

  const [fecha,      setFecha]      = useState(today)
  const [sector,     setSector]     = useState('')
  const [supervisor, setSupervisor] = useState('')
  const [clima,      setClima]      = useState('')
  const [trabajos,   setTrabajos]   = useState('')
  const [avance,     setAvance]     = useState('')
  const [horas,      setHoras]      = useState('')
  const [incidentes, setIncidentes] = useState('')

  async function generar() {
    if (!trabajos.trim()) { alert('Describe los trabajos ejecutados.'); return }

    const prompt = `Transforma el siguiente borrador en un INFORME DIARIO DE OBRAS formal y profesional para el mandante Río Tinto Mining.

DATOS:
- Fecha: ${fecha}
- Plataforma/Sector: ${sector||'sin especificar'}
- Supervisor: ${supervisor||'sin especificar'}
- Condiciones climáticas: ${clima||'sin especificar'}
${avance ? '- Avance del día: ' + avance : ''}
${horas  ? '- Horas efectivas trabajadas: ' + horas : ''}

TRABAJOS EJECUTADOS (borrador):
${trabajos}

INCIDENTES Y OBSERVACIONES:
${incidentes||'Sin incidentes reportados durante la jornada.'}

Redacta el informe completo con encabezado formal, secciones bien estructuradas, sin errores ortográficos y con lenguaje técnico apropiado para obra minera. El resultado debe estar listo para entregar al mandante.`

    setResult('')
    setLoading(true)
    try {
      await generarConIA(prompt, chunk => setResult(r => r + chunk))
    } catch(e) {
      alert('Error: ' + e.message)
    }
    setLoading(false)
  }

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

  return (
    <div style={S.page}>
      <style>{`
        @keyframes pulse{0%,80%,100%{transform:scale(.7);opacity:.4}40%{transform:scale(1);opacity:1}}
        .fi:focus{border-color:#1a3a5c!important;box-shadow:0 0 0 3px rgba(26,58,92,.1)!important;}
      `}</style>

      <div style={S.heading}>Informe Diario de Obras</div>
      <div style={S.subheading}>Escribe el resumen del día con tus palabras. La IA genera el informe formal.</div>

      {/* Datos generales */}
      <div style={S.card}>
        <div style={S.cardTitle}>Datos Generales</div>
        <div style={S.row}>
          <div style={S.col}>
            <label style={S.label}>Fecha</label>
            <input className="fi" style={S.input} type="date" value={fecha} onChange={e=>setFecha(e.target.value)}/>
          </div>
          <div style={S.col}>
            <label style={S.label}>Plataforma / Sector</label>
            <input className="fi" style={S.input} value={sector} onChange={e=>setSector(e.target.value)} placeholder="NCEH-022"/>
          </div>
        </div>
        <div style={{...S.row, marginBottom:0}}>
          <div style={S.col}>
            <label style={S.label}>Supervisor</label>
            <input className="fi" style={S.input} value={supervisor} onChange={e=>setSupervisor(e.target.value)} placeholder="Nombre supervisor"/>
          </div>
          <div style={S.col}>
            <label style={S.label}>Condiciones climáticas</label>
            <input className="fi" style={S.input} value={clima} onChange={e=>setClima(e.target.value)} placeholder="Ej: Despejado, viento moderado"/>
          </div>
        </div>
      </div>

      {/* Trabajos */}
      <div style={S.card}>
        <div style={S.cardTitle}>Resumen de Trabajos Ejecutados</div>
        <div style={S.tipBox}>💡 Escribe sin preocuparte de la redacción. La IA corregirá y formalizará el texto.</div>
        <textarea className="fi" style={S.textarea} rows={6} value={trabajos} onChange={e=>setTrabajos(e.target.value)}
          placeholder="Ej: Se siguio trabajando en la plataforma con las 2 excavadoras y el bulldozer. El bulldozer empujo material para dar ancho y la excavadora 56 hizo terraza. Tuvimos que parar 3 veces por el monitoreo de fosiles, aprox 20 min cada parada..."/>
      </div>

      {/* Avance */}
      <div style={S.card}>
        <div style={S.cardTitle}>Avance y Rendimiento</div>
        <div style={S.row}>
          <div style={S.col}>
            <label style={S.label}>Avance estimado del día</label>
            <input className="fi" style={S.input} value={avance} onChange={e=>setAvance(e.target.value)} placeholder="Ej: 60% de la plataforma"/>
          </div>
          <div style={S.col}>
            <label style={S.label}>Horas efectivas trabajadas</label>
            <input className="fi" style={S.input} value={horas} onChange={e=>setHoras(e.target.value)} placeholder="Ej: 7,5 hrs efectivas"/>
          </div>
        </div>
      </div>

      {/* Incidentes */}
      <div style={S.card}>
        <div style={S.cardTitle}>Incidentes / Observaciones de Seguridad</div>
        <textarea className="fi" style={S.textarea} rows={3} value={incidentes} onChange={e=>setIncidentes(e.target.value)}
          placeholder="Detenciones, problemas técnicos, observaciones de seguridad, etc. Si no hubo, dejar en blanco."/>
      </div>

      <button style={loading ? S.btnDisabled : S.btnGenerate} onClick={generar} disabled={loading}>
        {loading ? <><Dots/> Generando informe...</> : '✦ Generar informe profesional'}
      </button>

      <ResultPanel
        texto={result} tipo="informe"
        titulo={`Informe Diario – ${sector||'Sin sector'} – ${fecha}`}
        session={session}
      />
    </div>
  )
}
