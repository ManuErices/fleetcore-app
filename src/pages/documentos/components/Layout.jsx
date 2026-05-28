// src/components/Layout.jsx

const NAV = [
  { key: 'plan',      label: 'Plan de Trabajo', roles: ['admin','supervisor','operador','mandante'] },
  { key: 'informe',   label: 'Informe Diario',  roles: ['admin','supervisor','operador'] },
  { key: 'libro',     label: 'Libro de Obras',  roles: ['admin','supervisor','operador','mandante'] },
  { key: 'historial', label: 'Historial',        roles: ['admin','supervisor','operador','mandante'] },
]

function iniciales(nombre) {
  if (!nombre) return '?'
  const p = nombre.trim().split(' ')
  return p.length >= 2 ? (p[0][0] + p[1][0]).toUpperCase() : p[0].slice(0, 2).toUpperCase()
}

export default function Layout({ session, page, setPage, onLogout, onBack, children }) {
  const navItems = NAV.filter(n => n.roles.includes(session?.rol))
  const rolLabel = session?.rol === 'mandante' ? 'Río Tinto' : (session?.rol || '')

  return (
    <div style={{ display:'flex', flexDirection:'column', minHeight:'100vh', fontFamily:'DM Sans, system-ui, sans-serif' }}>

      {/* ── Header ── */}
      <header style={{
        background:'#0F1117',
        borderBottom:'1px solid rgba(255,255,255,0.08)',
        flexShrink:0,
        position:'sticky',
        top:0,
        zIndex:100,
      }}>
        <div style={{
          maxWidth:1100,
          margin:'0 auto',
          padding:'0 1.5rem',
          display:'flex',
          alignItems:'center',
          height:52,
          gap:'1.5rem',
        }}>

          {/* Logo */}
          <div style={{ display:'flex', alignItems:'center', gap:9, flexShrink:0 }}>
            <div style={{
              width:28, height:28,
              background:'#3D3580',
              borderRadius:7,
              display:'flex', alignItems:'center', justifyContent:'center',
            }}>
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                <path d="M8 2L13 4.5v4c0 3.5-2.5 6-5 7C5.5 14.5 3 12 3 8.5v-4L8 2z"
                  fill="rgba(255,255,255,0.85)"/>
              </svg>
            </div>
            <div>
              <div style={{ fontSize:13, fontWeight:600, color:'#fff', lineHeight:1 }}>
                MPF Documentos
              </div>
              <div style={{ fontSize:10, color:'rgba(255,255,255,0.35)', lineHeight:1, marginTop:2 }}>
                Río Tinto Mining
              </div>
            </div>
          </div>

          {/* Separador */}
          <div style={{ width:1, height:22, background:'rgba(255,255,255,0.1)', flexShrink:0 }} />

          {/* Nav items */}
          <nav style={{ display:'flex', alignItems:'center', gap:2, flex:1 }}>
            {navItems.map(item => (
              <button
                key={item.key}
                onClick={() => setPage(item.key)}
                style={{
                  padding:'6px 13px',
                  borderRadius:7,
                  border:'none',
                  background: page === item.key ? 'rgba(255,255,255,0.1)' : 'transparent',
                  color: page === item.key ? '#fff' : 'rgba(255,255,255,0.45)',
                  fontSize:13,
                  fontWeight: page === item.key ? 600 : 400,
                  cursor:'pointer',
                  whiteSpace:'nowrap',
                  fontFamily:'inherit',
                  transition:'background .15s, color .15s',
                }}
              >
                {item.label}
              </button>
            ))}
          </nav>

          {/* Usuario + salir */}
          <div style={{ display:'flex', alignItems:'center', gap:10, flexShrink:0 }}>
            <div style={{ textAlign:'right' }}>
              <div style={{ fontSize:12, color:'rgba(255,255,255,0.7)', fontWeight:500, lineHeight:1 }}>
                {session?.nombre}
              </div>
              <div style={{ fontSize:10, color:'rgba(255,255,255,0.35)', lineHeight:1, marginTop:2, textTransform:'capitalize' }}>
                {rolLabel}
              </div>
            </div>

            <div style={{
              width:32, height:32,
              background:'#3D3580',
              borderRadius:'50%',
              display:'flex', alignItems:'center', justifyContent:'center',
              fontSize:12, fontWeight:600,
              color:'rgba(255,255,255,0.9)',
              flexShrink:0,
            }}>
              {iniciales(session?.nombre || '')}
            </div>

            {onBack && (
              <button onClick={onBack} style={{
                padding:'5px 11px',
                borderRadius:6,
                border:'1px solid rgba(255,255,255,0.12)',
                background:'transparent',
                color:'rgba(255,255,255,0.4)',
                fontSize:11,
                cursor:'pointer',
                fontFamily:'inherit',
                whiteSpace:'nowrap',
              }}>
                ← Apps
              </button>
            )}
            <button onClick={onLogout} style={{
              padding:'5px 11px',
              borderRadius:6,
              border:'1px solid rgba(255,255,255,0.12)',
              background:'transparent',
              color:'rgba(255,255,255,0.4)',
              fontSize:11,
              cursor:'pointer',
              fontFamily:'inherit',
              whiteSpace:'nowrap',
            }}>
              Salir
            </button>
          </div>
        </div>
      </header>

      {/* ── Contenido ── */}
      <main style={{ flex:1, background:'#f8fafc', overflowY:'auto' }}>
        <div style={{ maxWidth:1000, margin:'0 auto', padding:'2rem 1.5rem' }}>
          {children}
        </div>
      </main>
    </div>
  )
}
