// src/pages/PlanTrabajo.jsx
import { useState, useEffect } from 'react'
import { generarConIA } from '../lib/claude.js'
import ResultPanel from '../components/ResultPanel.jsx'
import LayoutEditor from '../components/LayoutEditor.jsx'
import { useEmpresaData } from '../../../hooks/useEmpresaData.js'
import { useEmpresa } from '../../../lib/useEmpresa.jsx'
import SearchableDropdown from '../../../components/SearchableDropdown.jsx'

const today = new Date().toISOString().split('T')[0]

// Section color identities
const COLORS = {
  id: '#3B82F6',
  equipo: '#8B5CF6',
  actividad: '#06B6D4',
  proceso: '#10B981',
  seguridad: '#F59E0B',
  importante: '#EF4444',
  layout: '#6366F1',
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
      <span style={{
        fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
        letterSpacing: '.09em', color: color,
      }}>
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
      borderRadius: 9,
      padding: '9px 14px',
      fontSize: 12,
      color: color,
      marginBottom: 14,
      display: 'flex',
      gap: 8,
      alignItems: 'flex-start',
      lineHeight: 1.5,
    }}>
      <span style={{ flexShrink: 0 }}>💡</span>
      <span style={{ opacity: 0.85 }}>{msg}</span>
    </div>
  )
}

function Dots() {
  return (
    <span style={{ display: 'inline-flex', gap: 5, alignItems: 'center' }}>
      {[0, 1, 2].map(i => (
        <span key={i} style={{ width: 5, height: 5, borderRadius: '50%', background: '#fff', animation: 'dotPulse 1.2s infinite', animationDelay: `${i * 0.2}s` }} />
      ))}
    </span>
  )
}

function ItemList({ items, setItems, placeholder, color }) {
  const add = () => setItems([...items, ''])
  const remove = i => { if (items.length > 1) setItems(items.filter((_, x) => x !== i)) }
  const set = (i, v) => setItems(items.map((a, x) => x === i ? v : a))
  return (
    <div>
      {items.map((item, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'flex-start' }}>
          <div style={{
            flexShrink: 0, width: 26, height: 26, borderRadius: '50%',
            background: `linear-gradient(135deg, ${color} 0%, ${color}bb 100%)`,
            color: '#fff', fontSize: 11, fontWeight: 800,
            display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 6,
            boxShadow: `0 2px 8px ${color}35`,
          }}>{i + 1}</div>
          <textarea className="doc-input" style={{
            flex: 1, padding: '9px 12px', fontSize: 14,
            fontFamily: 'inherit', lineHeight: 1.65,
            border: '1.5px solid #e2e8f0', borderRadius: 9,
            background: '#fff', color: '#1e293b', outline: 'none',
            resize: 'vertical', boxSizing: 'border-box',
            transition: 'border-color .15s, box-shadow .15s',
          }} rows={2}
            value={item} onChange={e => set(i, e.target.value)} placeholder={placeholder} />
          <button style={{
            flexShrink: 0, marginTop: 4, padding: '5px 10px', fontSize: 14,
            background: 'transparent', border: '1.5px solid #fecaca',
            borderRadius: 8, color: '#dc2626', cursor: 'pointer',
            transition: 'all .15s',
          }} onClick={() => remove(i)}>×</button>
        </div>
      ))}
      <button style={{
        padding: '7px 16px', fontSize: 12, fontWeight: 600,
        background: 'transparent', border: `1.5px solid ${color}40`,
        borderRadius: 8, color: color, cursor: 'pointer',
        marginTop: 4, transition: 'all .15s',
      }} onClick={add}>+ Agregar punto</button>
    </div>
  )
}

export default function PlanTrabajo({ session }) {
  const { empresaId } = useEmpresa()
  const { machinesLocal, empleados } = useEmpresaData(empresaId)

  const isMPF = (companyName) => {
    if (!companyName) return true;
    const n = companyName.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    return n.includes('mpf');
  }

  const mpfMachines = machinesLocal?.filter(m => isMPF(m.empresa)) || []
  const mpfEmpleados = empleados?.filter(e => isMPF(e.empresa)) || []

  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState('')
  const [layoutPngB64, setLayoutPngB64] = useState('')
  const [layoutPreview, setLayoutPreview] = useState('')
  const [layoutConfirmed, setLayoutConfirmed] = useState(false)

  const [titulo, setTitulo] = useState('')
  const [fecha, setFecha] = useState(today)
  const [sector, setSector] = useState('')
  const [supervisor, setSupervisor] = useState('')
  const [cargo, setCargo] = useState('')

  useEffect(() => {
    console.log('--- PlanTrabajo AutoFill Debug ---')
    console.log('Session actual:', session)
    console.log('Supervisor actual:', supervisor)
    console.log('Cargo actual:', cargo)

    if (session) {
      if (session.nombre && !supervisor) setSupervisor(session.nombre)
      if (session.cargo && !cargo) setCargo(session.cargo)
    }
  }, [session])

  const [equipos, setEquipos] = useState([{ tipo: '', operador: '' }])
  const addEquipo = () => setEquipos([...equipos, { tipo: '', operador: '' }])
  const removeEquipo = i => { if (equipos.length > 1) setEquipos(equipos.filter((_, x) => x !== i)) }
  const setEquipo = (i, field, val) => setEquipos(equipos.map((e, x) => x === i ? { ...e, [field]: val } : e))

  const [actividad, setActividad] = useState([''])
  const [proceso, setProceso] = useState([''])
  const [seguridad, setSeguridad] = useState([''])
  const [importante, setImportante] = useState([''])

  function handleLayoutExport(pngB64, previewUrl) {
    setLayoutPngB64(pngB64)
    setLayoutPreview(previewUrl)
    setLayoutConfirmed(true)
  }

  async function generar() {
    const actsValidas = actividad.filter(a => a.trim())
    if (!actsValidas.length) { alert('Describe la actividad por realizar.'); return }
    if (!titulo.trim()) { alert('Ingresa el título del plan de trabajo.'); return }

    const eqStr = equipos.filter(e => e.tipo || e.operador)
      .map(e => `  • ${e.tipo || 'Equipo'}: Operador ${e.operador || 'por asignar'}`).join('\n')

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
- Sector/Plataforma: ${sector || 'sin especificar'}
- Supervisor: ${supervisor || 'sin especificar'}${cargo ? ` (${cargo})` : ''}
${eqStr ? `- Equipos asignados:\n${eqStr}` : ''}

SECCIÓN 1 - ACTIVIDAD POR REALIZAR:
${actsValidas.map((a, i) => `${i + 1}. ${a}`).join('\n')}

SECCIÓN 2 - PROCESO DE EJECUCIÓN:
${proceso.filter(p => p.trim()).map((p, i) => `${i + 1}. ${p}`).join('\n') || 'Desarrollar proceso paso a paso.'}

SECCIÓN 3 - RECOMENDACIÓN DE SEGURIDAD:
${seguridad.filter(s => s.trim()).map(s => `- ${s}`).join('\n') || 'Incluir recomendaciones de seguridad estándar.'}

SECCIÓN 4 - IMPORTANTE:
${importante.filter(i => i.trim()).map(i => `- ${i}`).join('\n') || 'Incluir prohibiciones y consideraciones importantes.'}

SECCIÓN 5 - LAYOUT REFERENCIAL:
- ${layoutConfirmed ? 'Se adjunta layout referencial generado digitalmente con posición de equipos y elementos de seguridad.' : 'Se adjunta croquis referencial de posición de equipos y área de trabajo.'}

Redacta con lenguaje técnico formal, sin errores ortográficos. Usa bullets con guión (-). Listo para entregar al mandante.`

    setResult('')
    setLoading(true)
    try {
      await generarConIA(prompt, chunk => setResult(r => r + chunk))
    } catch (e) { alert('Error: ' + e.message) }
    setLoading(false)
  }

  const tituloDoc = `Plan de Trabajo – ${titulo || sector || 'Sin título'} – ${fecha}`

  const inp = {
    width: '100%', padding: '10px 13px', fontSize: 14, fontFamily: 'inherit',
    border: '1.5px solid #e2e8f0', borderRadius: 9, background: '#fff',
    color: '#1e293b', outline: 'none', boxSizing: 'border-box',
    transition: 'border-color .15s, box-shadow .15s',
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
        @keyframes resultFade {
          from { opacity:0; transform: translateY(12px); }
          to   { opacity:1; transform: translateY(0);    }
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
          background-image: linear-gradient(90deg, #0F2035 0%, #1a3a5c 25%, #2563eb 50%, #0891b2 75%, #0F2035 100%);
          background-size: 300% auto;
          animation: btnShimmer 6s linear infinite;
          color: #fff; border: none; border-radius: 13px; cursor: pointer;
          margin-top: 8px; display: flex; align-items: center; justify-content: center; gap: 10px;
          letter-spacing: .02em; font-family: inherit;
          box-shadow: 0 4px 20px rgba(37,99,235,0.4), 0 1px 4px rgba(0,0,0,0.15);
          transition: transform .2s, box-shadow .2s;
        }
        .doc-btn-gen:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 8px 30px rgba(37,99,235,0.55), 0 2px 8px rgba(0,0,0,0.15);
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
            background: 'linear-gradient(135deg, #1a3a5c 0%, #2563eb 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 16px rgba(37,99,235,0.35)',
          }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 800, color: '#0F2035', marginBottom: 2, letterSpacing: '-0.03em', fontFamily: 'Outfit, sans-serif', lineHeight: 1.1 }}>
              Plan de Trabajo Diario
            </h1>
            <p style={{ fontSize: 13.5, color: '#64748b', margin: 0, lineHeight: 1.5 }}>
              Completa cada sección. La IA genera el documento formal para Río Tinto.
            </p>
          </div>
        </div>
        <div style={{ height: 3, width: 60, borderRadius: 2, background: 'linear-gradient(90deg, #2563eb, #06B6D4)', marginTop: 6 }} />
      </div>

      {/* Identificación */}
      <div style={cardStyle(COLORS.id, 0)} className="doc-card">
        <CardHeader badge="ID" label="Identificación del documento" color={COLORS.id} />
        <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: '2 1 300px', minWidth: 0 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: '#64748b', marginBottom: 5 }}>Título del plan de trabajo</label>
            <input className="doc-input" style={inp} value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="Ej: Construcción Plataforma NCEH-022" />
          </div>
          <div style={{ flex: '1 1 160px', minWidth: 0 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: '#64748b', marginBottom: 5 }}>Fecha</label>
            <input className="doc-input" style={inp} type="date" value={fecha} onChange={e => setFecha(e.target.value)} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 160px', minWidth: 0 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: '#64748b', marginBottom: 5 }}>Sector / Plataforma</label>
            <input className="doc-input" style={inp} value={sector} onChange={e => setSector(e.target.value)} placeholder="NCEH-022" />
          </div>
          <div style={{ flex: '1 1 160px', minWidth: 0 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: '#64748b', marginBottom: 5 }}>Realizado por</label>
            <input className="doc-input" style={inp} value={supervisor} onChange={e => setSupervisor(e.target.value)} placeholder="Ej: Juan Pérez" />
          </div>
          <div style={{ flex: '1 1 160px', minWidth: 0 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: '#64748b', marginBottom: 5 }}>Cargo</label>
            <input className="doc-input" style={inp} value={cargo} onChange={e => setCargo(e.target.value)} placeholder="Ej: Supervisor de Terreno" />
          </div>
        </div>
      </div>

      {/* Equipos */}
      <div style={cardStyle(COLORS.equipo, 60)} className="doc-card">
        <CardHeader badge="EQ" label="Equipos y Operadores" color={COLORS.equipo} />
        {equipos.map((eq, i) => (
          <div key={i} style={{ display: 'flex', gap: 12, marginBottom: 10, flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 160px', minWidth: 0, position: 'relative', zIndex: 10 - i }}>
              {i === 0 && <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: '#64748b', marginBottom: 5 }}>Equipo</label>}
              <SearchableDropdown
                value={eq.tipo}
                onChange={val => setEquipo(i, 'tipo', val)}
                placeholder="Buscar tipo o patente..."
                options={mpfMachines}
                renderItem={m => `${m?.tipo || m?.name || 'Equipo'} - ${m?.patente || m?.code || ''}`.replace(/- $/, '').trim()}
              />
            </div>
            <div style={{ flex: '1 1 160px', minWidth: 0, position: 'relative', zIndex: 10 - i }}>
              {i === 0 && <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: '#64748b', marginBottom: 5 }}>Operador</label>}
              <SearchableDropdown
                value={eq.operador}
                onChange={val => setEquipo(i, 'operador', val)}
                placeholder="Buscar nombre operador..."
                options={mpfEmpleados}
                renderItem={e => e?.nombre || ''}
              />
            </div>
            <button style={{
              flexShrink: 0, marginTop: i === 0 ? 22 : 0, padding: '5px 10px', fontSize: 14,
              background: 'transparent', border: '1.5px solid #fecaca', borderRadius: 8, color: '#dc2626', cursor: 'pointer', zIndex: 0,
            }} onClick={() => removeEquipo(i)}>×</button>
          </div>
        ))}
        <button style={{
          padding: '7px 16px', fontSize: 12, fontWeight: 600,
          background: 'transparent', border: `1.5px solid ${COLORS.equipo}40`,
          borderRadius: 8, color: COLORS.equipo, cursor: 'pointer', marginTop: 4,
        }} onClick={addEquipo}>+ Agregar equipo</button>
      </div>

      {/* Sección 1 */}
      <div style={cardStyle(COLORS.actividad, 120)} className="doc-card">
        <CardHeader badge="1" label="Actividad por realizar" color={COLORS.actividad} />
        <TipBox msg="Describe la tarea con área, objetivo y condiciones del sector." color={COLORS.actividad} />
        <ItemList items={actividad} setItems={setActividad} color={COLORS.actividad}
          placeholder="Ej: Excavación y conformación de terraza en sector alto de plataforma NCEH-022..." />
      </div>

      {/* Sección 2 */}
      <div style={cardStyle(COLORS.proceso, 150)} className="doc-card">
        <CardHeader badge="2" label="Proceso de ejecución de la tarea" color={COLORS.proceso} />
        <TipBox msg="Paso a paso de cómo se realizará la tarea." color={COLORS.proceso} />
        <ItemList items={proceso} setItems={setProceso} color={COLORS.proceso}
          placeholder="Ej: Traslado de personal desde campamento a plataforma..." />
      </div>

      {/* Sección 3 */}
      <div style={cardStyle(COLORS.seguridad, 180)} className="doc-card">
        <CardHeader badge="3" label="Recomendación de seguridad" color={COLORS.seguridad} />
        <TipBox msg="Medidas de seguridad específicas para esta tarea." color={COLORS.seguridad} />
        <ItemList items={seguridad} setItems={setSeguridad} color={COLORS.seguridad}
          placeholder="Ej: Mantener comunicación radial en frecuencia N°1..." />
      </div>

      {/* Sección 4 */}
      <div style={cardStyle(COLORS.importante, 210)} className="doc-card">
        <CardHeader badge="4" label="Importante" color={COLORS.importante} />
        <TipBox msg="Prohibiciones y consideraciones críticas." color={COLORS.importante} />
        <ItemList items={importante} setItems={setImportante} color={COLORS.importante}
          placeholder="Ej: El operador solo ejecutará la actividad descrita en este plan..." />
      </div>

      {/* Layout editor */}
      <div style={cardStyle(COLORS.layout, 240)} className="doc-card">
        <CardHeader
          badge="5"
          label={<>Layout referencial {layoutConfirmed && <span style={{ marginLeft: 8, background: '#dcfce7', color: '#15803d', padding: '2px 8px', borderRadius: 99, fontSize: 10, fontWeight: 700 }}>✓ Listo</span>}</>}
          color={COLORS.layout}
        />
        <TipBox
          msg={<>Usa el editor para posicionar equipos y elementos de seguridad. Cuando esté listo presiona <strong>"✓ Usar este layout"</strong>.</>}
          color={COLORS.layout}
        />
        {layoutConfirmed && layoutPreview ? (
          <div>
            <img src={layoutPreview} alt="Layout confirmado" style={{ width: '100%', borderRadius: 10, border: `1px solid ${COLORS.layout}22`, marginBottom: 10 }} />
            <button onClick={() => { setLayoutConfirmed(false); setLayoutPngB64(''); setLayoutPreview('') }}
              style={{ padding: '6px 14px', fontSize: 12, background: 'transparent', border: `1.5px solid ${COLORS.layout}40`, borderRadius: 8, color: COLORS.layout, cursor: 'pointer' }}>
              Editar layout
            </button>
          </div>
        ) : (
          <LayoutEditor sector={sector} equipos={equipos} onExport={handleLayoutExport} />
        )}
      </div>

      <button className="doc-btn-gen" onClick={generar} disabled={loading}>
        {loading ? <><Dots /> Generando plan...</> : <>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" fill="#fff" /></svg>
          Generar plan de trabajo profesional
        </>}
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
