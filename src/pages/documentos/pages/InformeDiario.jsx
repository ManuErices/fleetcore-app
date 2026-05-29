// src/pages/InformeDiario.jsx
import { useState } from 'react'
import { generarConIA } from '../lib/claude.js'
import ResultPanel from '../components/ResultPanel.jsx'

const today = new Date().toISOString().split('T')[0]

const COLORS = {
  general:   '#3B82F6',
  trabajos:  '#06B6D4',
  avance:    '#10B981',
  incidentes:'#EF4444',
}

function cardStyle(color, delay = 0) {
  return {
    background: '#fff',
    border: `1px solid ${color}22`,
    borderLeft: `4px solid ${color}`,
    borderRadius: 16,
    padding: '1.25rem 1.5rem',
    marginBottom: 18,
    boxShadow: `0 2px 16px ${color}0d, 0 1px 4px rgba(0,0,0,0.04)`,
    animation: 'slideUpFade .45s ease both',
    animationDelay: `${delay}ms`,
    transition: 'box-shadow .2s, transform .2s',
  }
}

function CardHeader({ badge, label, color }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      paddingBottom: 14, marginBottom: 16,
      borderBottom: `1px solid ${color}1a`,
    }}>
      <div style={{
        width: 28, height: 28, borderRadius: 8, flexShrink: 0,
        background: `linear-gradient(135deg, ${color} 0%, ${color}bb 100%)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 13, fontWeight: 800, color: '#fff',
        boxShadow: `0 2px 8px ${color}40`,
      }}>
        {badge}
      </div>
      <span style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'.09em', color }}>
        {label}
      </span>
    </div>
  )
}

function TipBox({ msg, color }) {
  return (
    <div style={{
      background: `linear-gradient(135deg, ${color}0d 0%, ${color}07 100%)`,
      border: `1px solid ${color}22`,
      borderLeft: `3px solid ${color}`,
      borderRadius: 9, padding: '9px 14px', fontSize: 12, color,
      marginBottom: 14, display: 'flex', gap: 8, alignItems: 'flex-start', lineHeight: 1.5,
    }}>
      <span style={{ flexShrink: 0 }}>💡</span>
      <span style={{ opacity: 0.85 }}>{msg}</span>
    </div>
  )
}

function Dots() {
  return (
    <span style={{ display:'inline-flex', gap:5, alignItems:'center' }}>
      {[0,1,2].map(i=>(
        <span key={i} style={{ width:5,height:5,borderRadius:'50%',background:'#fff',animation:'dotPulse 1.2s infinite',animationDelay:`${i*0.2}s` }}/>
      ))}
    </span>
  )
}

export default function InformeDiario({ session }) {
  const [loading, setLoading] = useState(false)
  const [result, setResult]   = useState('')

  const [fecha,      setFecha]      = useState(today)
  const [sector,     setSector]     = useState('')
  const [supervisor, setSupervisor] = useState(session?.nombre || '')
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
    } catch(e) { alert('Error: ' + e.message) }
    setLoading(false)
  }

  const inp = {
    width: '100%', padding: '10px 13px', fontSize: 14, fontFamily: 'inherit',
    border: '1.5px solid #e2e8f0', borderRadius: 9, background: '#fff',
    color: '#1e293b', outline: 'none', boxSizing: 'border-box',
    transition: 'border-color .15s, box-shadow .15s',
  }
  const textareaStyle = {
    ...inp, lineHeight: 1.65, resize: 'vertical',
  }

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', width: '100%' }}>
      <style>{`
        @keyframes slideUpFade {
          from { opacity:0; transform: translateY(16px); }
          to   { opacity:1; transform: translateY(0); }
        }
        @keyframes dotPulse {
          0%,80%,100% { transform:scale(.7); opacity:.4; }
          40%          { transform:scale(1);  opacity:1;  }
        }
        @keyframes btnShimmer {
          0%   { background-position: -300% 0; }
          100% { background-position: 300% 0;  }
        }
        .doc-input:focus {
          border-color: #3B82F6 !important;
          box-shadow: 0 0 0 3px rgba(59,130,246,0.12) !important;
        }
        .doc-card:hover {
          box-shadow: 0 8px 32px rgba(0,0,0,0.1) !important;
          transform: translateY(-1px);
        }
        .doc-btn-gen {
          width: 100%; padding: 15px 20px; font-size: 15px; font-weight: 700;
          background-image: linear-gradient(90deg, #0F2035 0%, #1a3a5c 25%, #059669 50%, #0891b2 75%, #0F2035 100%);
          background-size: 300% auto;
          animation: btnShimmer 6s linear infinite;
          color: #fff; border: none; border-radius: 13px; cursor: pointer;
          margin-top: 8px; display: flex; align-items: center; justify-content: center; gap: 10px;
          letter-spacing: .02em; font-family: inherit;
          box-shadow: 0 4px 20px rgba(8,145,178,0.4), 0 1px 4px rgba(0,0,0,0.15);
          transition: transform .2s, box-shadow .2s;
        }
        .doc-btn-gen:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 8px 30px rgba(8,145,178,0.55), 0 2px 8px rgba(0,0,0,0.15);
        }
        .doc-btn-gen:disabled {
          background-image: none;
          background: #94a3b8;
          cursor: not-allowed;
          box-shadow: none;
          animation: none;
        }
      `}</style>

      {/* Hero heading */}
      <div style={{ marginBottom: 32, animation: 'slideUpFade .35s ease' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 13, flexShrink: 0,
            background: 'linear-gradient(135deg, #0891b2 0%, #059669 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 16px rgba(8,145,178,0.35)',
          }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 800, color: '#0F2035', marginBottom: 2, letterSpacing: '-0.03em', fontFamily: 'Outfit, sans-serif', lineHeight: 1.1 }}>
              Informe Diario de Obras
            </h1>
            <p style={{ fontSize: 13.5, color: '#64748b', margin: 0, lineHeight: 1.5 }}>
              Escribe el resumen del día con tus palabras. La IA genera el informe formal.
            </p>
          </div>
        </div>
        <div style={{ height: 3, width: 60, borderRadius: 2, background: 'linear-gradient(90deg, #0891b2, #059669)', marginTop: 6 }} />
      </div>

      {/* Datos generales */}
      <div style={cardStyle(COLORS.general, 0)} className="doc-card">
        <CardHeader badge="01" label="Datos Generales" color={COLORS.general} />
        <div style={{ display:'flex', gap:12, marginBottom:12, flexWrap:'wrap' }}>
          <div style={{ flex:'1 1 140px', minWidth:0 }}>
            <label style={{ display:'block', fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'.05em', color:'#64748b', marginBottom:5 }}>Fecha</label>
            <input className="doc-input" style={inp} type="date" value={fecha} onChange={e=>setFecha(e.target.value)}/>
          </div>
          <div style={{ flex:'2 1 200px', minWidth:0 }}>
            <label style={{ display:'block', fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'.05em', color:'#64748b', marginBottom:5 }}>Plataforma / Sector</label>
            <input className="doc-input" style={inp} value={sector} onChange={e=>setSector(e.target.value)} placeholder="NCEH-022"/>
          </div>
        </div>
        <div style={{ display:'flex', gap:12, flexWrap:'wrap' }}>
          <div style={{ flex:'1 1 160px', minWidth:0 }}>
            <label style={{ display:'block', fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'.05em', color:'#64748b', marginBottom:5 }}>Supervisor</label>
            <input className="doc-input" style={inp} value={supervisor} onChange={e=>setSupervisor(e.target.value)} placeholder="Nombre supervisor"/>
          </div>
          <div style={{ flex:'1 1 160px', minWidth:0 }}>
            <label style={{ display:'block', fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'.05em', color:'#64748b', marginBottom:5 }}>Condiciones climáticas</label>
            <input className="doc-input" style={inp} value={clima} onChange={e=>setClima(e.target.value)} placeholder="Ej: Despejado, viento moderado"/>
          </div>
        </div>
      </div>

      {/* Trabajos */}
      <div style={cardStyle(COLORS.trabajos, 60)} className="doc-card">
        <CardHeader badge="02" label="Resumen de Trabajos Ejecutados" color={COLORS.trabajos} />
        <TipBox msg="Escribe sin preocuparte de la redacción. La IA corregirá y formalizará el texto." color={COLORS.trabajos} />
        <textarea className="doc-input" style={textareaStyle} rows={6} value={trabajos} onChange={e=>setTrabajos(e.target.value)}
          placeholder="Ej: Se siguio trabajando en la plataforma con las 2 excavadoras y el bulldozer. El bulldozer empujo material para dar ancho y la excavadora 56 hizo terraza. Tuvimos que parar 3 veces por el monitoreo de fosiles, aprox 20 min cada parada..."/>
      </div>

      {/* Avance */}
      <div style={cardStyle(COLORS.avance, 120)} className="doc-card">
        <CardHeader badge="03" label="Avance y Rendimiento" color={COLORS.avance} />
        <div style={{ display:'flex', gap:12, flexWrap:'wrap' }}>
          <div style={{ flex:'1 1 160px', minWidth:0 }}>
            <label style={{ display:'block', fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'.05em', color:'#64748b', marginBottom:5 }}>Avance estimado del día</label>
            <input className="doc-input" style={inp} value={avance} onChange={e=>setAvance(e.target.value)} placeholder="Ej: 60% de la plataforma"/>
          </div>
          <div style={{ flex:'1 1 160px', minWidth:0 }}>
            <label style={{ display:'block', fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'.05em', color:'#64748b', marginBottom:5 }}>Horas efectivas trabajadas</label>
            <input className="doc-input" style={inp} value={horas} onChange={e=>setHoras(e.target.value)} placeholder="Ej: 7,5 hrs efectivas"/>
          </div>
        </div>
      </div>

      {/* Incidentes */}
      <div style={cardStyle(COLORS.incidentes, 180)} className="doc-card">
        <CardHeader badge="04" label="Incidentes / Observaciones de Seguridad" color={COLORS.incidentes} />
        <TipBox msg="Detenciones, problemas técnicos, observaciones de seguridad. Si no hubo incidentes, dejar en blanco." color={COLORS.incidentes} />
        <textarea className="doc-input" style={textareaStyle} rows={3} value={incidentes} onChange={e=>setIncidentes(e.target.value)}
          placeholder="Detenciones, problemas técnicos, observaciones de seguridad, etc."/>
      </div>

      <button className="doc-btn-gen" onClick={generar} disabled={loading}>
        {loading ? <><Dots/> Generando informe...</> : <>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" fill="#fff"/></svg>
          Generar informe profesional
        </>}
      </button>

      <ResultPanel
        texto={result} tipo="informe"
        titulo={`Informe Diario – ${sector||'Sin sector'} – ${fecha}`}
        session={session}
      />
    </div>
  )
}
