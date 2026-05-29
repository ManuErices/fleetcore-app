const NAV = [
  { key: 'plan',      label: 'Plan de Trabajo', roles: ['admin','supervisor','operador'] },
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
  const baseNavItems = NAV.filter(n => n.roles.includes(session?.rol))
  const navItems = session?.rolOriginal === 'mandante_admin'
    ? [...baseNavItems, { key: 'admin', label: 'Gestión' }]
    : baseNavItems
  const rolLabel = session?.rol === 'mandante' ? 'Río Tinto' : (session?.rol || '')

  return (
    <div style={{ display:'flex', flexDirection:'column', minHeight:'100vh', fontFamily:'DM Sans, system-ui, sans-serif' }}>
      <style>{`
        @keyframes navIndicator {
          from { transform: scaleX(0); }
          to   { transform: scaleX(1); }
        }
        @keyframes headerShimmer {
          0%   { background-position: -400% 0; }
          100% { background-position: 400% 0; }
        }
        @keyframes fadeSlideDown {
          from { opacity:0; transform: translateY(-6px); }
          to   { opacity:1; transform: translateY(0); }
        }
        .doc-nav-btn {
          position: relative;
          padding: 7px 14px;
          border-radius: 8px;
          border: none;
          background: transparent;
          font-family: inherit;
          font-size: 13px;
          font-weight: 400;
          cursor: pointer;
          white-space: nowrap;
          transition: all .18s ease;
          color: rgba(255,255,255,0.45);
        }
        .doc-nav-btn:hover {
          background: rgba(255,255,255,0.07);
          color: rgba(255,255,255,0.75);
        }
        .doc-nav-btn.active {
          background: linear-gradient(90deg, rgba(59,130,246,0.22) 0%, rgba(6,182,212,0.14) 100%);
          color: #93C5FD;
          font-weight: 600;
        }
        .doc-nav-btn.active::after {
          content: '';
          position: absolute;
          bottom: -1px;
          left: 14px;
          right: 14px;
          height: 2px;
          border-radius: 2px 2px 0 0;
          background: linear-gradient(90deg, #3B82F6, #06B6D4);
          animation: navIndicator .2s ease;
        }
        .doc-action-btn {
          padding: 5px 12px;
          border-radius: 7px;
          border: 1px solid rgba(255,255,255,0.1);
          background: rgba(255,255,255,0.05);
          color: rgba(255,255,255,0.45);
          font-size: 11px;
          cursor: pointer;
          font-family: inherit;
          white-space: nowrap;
          transition: all .15s;
        }
        .doc-action-btn:hover {
          background: rgba(255,255,255,0.1);
          color: rgba(255,255,255,0.75);
          border-color: rgba(255,255,255,0.2);
        }
        .doc-main-content {
          animation: fadeSlideDown .3s ease;
        }
      `}</style>

      {/* ── Header ── */}
      <header style={{
        background: 'linear-gradient(135deg, #060d1a 0%, #0F2035 50%, #0d1f38 100%)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        flexShrink: 0,
        position: 'sticky',
        top: 0,
        zIndex: 100,
        boxShadow: '0 2px 24px rgba(0,0,0,0.35)',
      }}>
        <div style={{
          maxWidth: 1100,
          margin: '0 auto',
          padding: '0 1.5rem',
          display: 'flex',
          alignItems: 'center',
          height: 56,
          gap: '1.25rem',
        }}>

          {/* Logo */}
          <div style={{ display:'flex', alignItems:'center', gap:10, flexShrink:0 }}>
            <div style={{
              width: 32, height: 32,
              background: 'linear-gradient(135deg, #2563eb 0%, #06B6D4 100%)',
              borderRadius: 9,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 0 12px rgba(37,99,235,0.45)',
            }}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M8 2L13 4.5v4c0 3.5-2.5 6-5 7C5.5 14.5 3 12 3 8.5v-4L8 2z"
                  fill="rgba(255,255,255,0.9)"/>
              </svg>
            </div>
            <div>
              <div style={{ fontSize:13, fontWeight:700, color:'#fff', lineHeight:1, letterSpacing:'-0.01em' }}>
                MPF Documentos
              </div>
              <div style={{ fontSize:10, color:'rgba(255,255,255,0.3)', lineHeight:1, marginTop:2 }}>
                Río Tinto Mining
              </div>
            </div>
          </div>

          {/* Separador */}
          <div style={{ width:1, height:24, background:'rgba(255,255,255,0.08)', flexShrink:0 }} />

          {/* Nav */}
          <nav style={{ display:'flex', alignItems:'center', gap:2, flex:1 }}>
            {navItems.map(item => (
              <button
                key={item.key}
                onClick={() => setPage(item.key)}
                className={`doc-nav-btn${page === item.key ? ' active' : ''}`}
              >
                {item.label}
              </button>
            ))}
          </nav>

          {/* Usuario + acciones */}
          <div style={{ display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
            <div style={{ textAlign:'right', marginRight:2 }}>
              <div style={{ fontSize:12, color:'rgba(255,255,255,0.75)', fontWeight:600, lineHeight:1 }}>
                {session?.nombre}
              </div>
              <div style={{ fontSize:10, color:'rgba(255,255,255,0.3)', lineHeight:1, marginTop:2, textTransform:'capitalize' }}>
                {rolLabel}
              </div>
            </div>

            <div style={{
              width: 34, height: 34,
              background: 'linear-gradient(135deg, #2563eb 0%, #06B6D4 100%)',
              borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 700,
              color: '#fff',
              flexShrink: 0,
              boxShadow: '0 0 10px rgba(37,99,235,0.35)',
            }}>
              {iniciales(session?.nombre || '')}
            </div>

            {onBack && (
              <button onClick={onBack} className="doc-action-btn">
                ← Apps
              </button>
            )}
            <button onClick={onLogout} className="doc-action-btn">
              Salir
            </button>
          </div>
        </div>
      </header>

      {/* ── Contenido ── */}
      <main style={{
        flex: 1,
        background: 'linear-gradient(150deg, #eef2ff 0%, #dbeafe 35%, #ecfdf5 100%)',
        overflowY: 'auto',
        position: 'relative',
      }}>
        {/* Mesh overlay */}
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: `
            radial-gradient(ellipse at 10% 20%, rgba(59,130,246,0.06) 0%, transparent 50%),
            radial-gradient(ellipse at 90% 10%, rgba(6,182,212,0.05) 0%, transparent 45%),
            radial-gradient(ellipse at 80% 90%, rgba(16,185,129,0.04) 0%, transparent 45%)
          `,
        }} />
        <div className="doc-main-content" style={{ maxWidth:1000, margin:'0 auto', padding:'2rem 1.5rem', position:'relative' }}>
          {children}
        </div>
      </main>
    </div>
  )
}
