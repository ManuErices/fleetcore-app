// src/components/FirmasPanel.jsx
import { useState, useEffect } from 'react'
import { ROLES_FIRMA, FLUJO, verificarPin, firmarDocumento, getFirmas } from '../lib/firmas.js'
import { getSession } from '../lib/auth.js'

const C = {
  navy:    '#0D2B45',
  accent:  '#1B5E8A',
  green:   '#15803d',
  greenBg: '#dcfce7',
  red:     '#dc2626',
  redBg:   '#fef2f2',
  gray:    '#64748b',
  border:  '#e2e8f0',
  silver:  '#f8fafc',
}

function StatusBadge({ firmado }) {
  return (
    <span style={{
      padding: '3px 10px', borderRadius: 99, fontSize: 11, fontWeight: 700,
      background: firmado ? C.greenBg : '#fef9c3',
      color: firmado ? C.green : '#92400e',
    }}>
      {firmado ? '✓ Firmado' : 'Pendiente'}
    </span>
  )
}

// Modal simplificado: solo muestra datos del perfil + pide PIN
function PinModal({ session, rolLabel, onSuccess, onClose }) {
  const [pin,     setPin]     = useState('')
  const [error,   setError]   = useState('')
  const [loading, setLoading] = useState(false)

  async function handleFirmar() {
    setError('')
    if (!pin) return setError('Ingresa tu PIN')
    setLoading(true)
    try {
      const ok = await verificarPin(session.usuario, pin)
      if (!ok) { setError('PIN incorrecto'); setLoading(false); return }
      onSuccess()
    } catch(e) { setError(e.message) }
    setLoading(false)
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }}>
      <div style={{
        background: '#fff', borderRadius: 16, padding: '2rem',
        width: 360, boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: C.navy }}>Firmar documento</div>
            <div style={{ fontSize: 12, color: C.gray, marginTop: 2 }}>{rolLabel}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: C.gray }}>×</button>
        </div>

        {/* Datos del firmante (solo lectura, vienen del perfil) */}
        <div style={{
          background: C.silver, border: `1px solid ${C.border}`, borderRadius: 10,
          padding: '14px 16px', marginBottom: 20,
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.gray, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 10 }}>
            Datos del firmante
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 13 }}>
            <div><span style={{ color: C.gray }}>Nombre: </span><span style={{ fontWeight: 600, color: C.navy }}>{session.nombre}</span></div>
            {session.rut    && <div><span style={{ color: C.gray }}>RUT: </span><span style={{ color: C.navy }}>{session.rut}</span></div>}
            {session.cargo  && <div><span style={{ color: C.gray }}>Cargo: </span><span style={{ color: C.navy }}>{session.cargo}</span></div>}
            {session.empresa && <div><span style={{ color: C.gray }}>Empresa: </span><span style={{ color: C.navy }}>{session.empresa}</span></div>}
          </div>
        </div>

        {/* PIN */}
        <label style={{ fontSize: 11, fontWeight: 700, color: C.gray, textTransform: 'uppercase', letterSpacing: '.05em', display: 'block', marginBottom: 6 }}>
          Ingresa tu PIN para confirmar
        </label>
        <input
          type="password" inputMode="numeric" maxLength={8}
          value={pin} onChange={e => { setPin(e.target.value.replace(/\D/g,'')); setError('') }}
          placeholder="••••" autoFocus
          style={{
            width: '100%', padding: '12px', fontSize: 24, letterSpacing: 10,
            border: `1px solid ${error ? C.red : C.border}`, borderRadius: 8,
            boxSizing: 'border-box', outline: 'none', textAlign: 'center',
          }}
        />

        {error && (
          <div style={{ marginTop: 8, padding: '8px 12px', background: C.redBg, borderRadius: 8, fontSize: 13, color: C.red }}>
            {error}
          </div>
        )}

        <button
          onClick={handleFirmar} disabled={loading}
          style={{
            width: '100%', marginTop: 16, padding: '12px', fontSize: 14, fontWeight: 700,
            background: loading ? '#94a3b8' : C.navy,
            color: '#fff', border: 'none', borderRadius: 10,
            cursor: loading ? 'not-allowed' : 'pointer',
          }}>
          {loading ? 'Procesando...' : 'Firmar documento'}
        </button>
      </div>
    </div>
  )
}

export default function FirmasPanel({ docId, onFirmasUpdate }) {
  const [firmas,  setFirmas]  = useState({})
  const [loading, setLoading] = useState(true)
  const [modal,   setModal]   = useState(null)
  const session = getSession()

  useEffect(() => {
    if (!docId) { setLoading(false); return }
    loadFirmas()
  }, [docId])

  async function loadFirmas() {
    setLoading(true)
    try { setFirmas(await getFirmas(docId)) } catch(e) { console.error(e) }
    setLoading(false)
  }

  function puedeFirmar(rolKey) {
    if (firmas[rolKey]?.firmado) return false
    if (!session) return false
    if (!ROLES_FIRMA[rolKey].roles.includes(session.rol)) return false
    const idx = FLUJO.indexOf(rolKey)
    if (idx > 0 && !firmas[FLUJO[idx-1]]?.firmado) return false
    return true
  }

  async function handleFirmaSuccess(rolKey) {
    setModal(null)
    try {
      const firma = await firmarDocumento(docId, rolKey)
      const newFirmas = { ...firmas, [rolKey]: firma }
      setFirmas(newFirmas)
      onFirmasUpdate?.(newFirmas)
    } catch(e) { alert(e.message) }
  }

  if (!docId) return (
    <div style={{ background: C.silver, border: `1px solid ${C.border}`, borderRadius: 12, padding: '1.25rem', marginTop: 16 }}>
      <div style={{ fontSize: 13, color: C.gray, textAlign: 'center' }}>
        Guarda el documento primero para habilitar las firmas
      </div>
    </div>
  )

  if (loading) return <div style={{ padding: '1rem', color: C.gray, fontSize: 13 }}>Cargando firmas...</div>

  const firmadas = FLUJO.filter(r => firmas[r]?.firmado).length
  const pct = Math.round((firmadas / FLUJO.length) * 100)

  return (
    <div style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: 12, padding: '1.25rem', marginTop: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, paddingBottom: 12, borderBottom: `1px solid ${C.border}` }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.navy }}>Firmas digitales</div>
          <div style={{ fontSize: 11, color: C.gray, marginTop: 2 }}>{firmadas}/{FLUJO.length} firmado{firmadas !== 1 ? 's':''}</div>
        </div>
        <div style={{ width: 120 }}>
          <div style={{ height: 6, background: '#e2e8f0', borderRadius: 99, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${pct}%`, background: pct===100 ? C.green : C.accent, borderRadius: 99, transition: 'width .4s' }} />
          </div>
          <div style={{ fontSize: 10, color: C.gray, marginTop: 3, textAlign: 'right' }}>{pct}%</div>
        </div>
      </div>

      {/* Roles */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {FLUJO.map((rolKey, idx) => {
          const rol    = ROLES_FIRMA[rolKey]
          const firma  = firmas[rolKey]
          const locked = idx > 0 && !firmas[FLUJO[idx-1]]?.firmado

          return (
            <div key={rolKey} style={{
              border: `1px solid ${firma?.firmado ? '#bbf7d0' : C.border}`,
              borderRadius: 10,
              background: firma?.firmado ? '#f0fdf4' : locked ? '#fafafa' : '#fff',
              padding: '12px 14px', opacity: locked ? 0.6 : 1,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <span style={{
                      width: 22, height: 22, borderRadius: '50%', fontSize: 11, fontWeight: 700,
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      background: firma?.firmado ? C.green : locked ? '#cbd5e0' : C.accent,
                      color: '#fff', flexShrink: 0,
                    }}>{idx+1}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: locked ? C.gray : C.navy }}>
                      {rol.label}
                    </span>
                    {locked && <span style={{ fontSize: 10, color: '#94a3b8' }}>Esperando firma anterior</span>}
                  </div>

                  {firma?.firmado ? (
                    <div style={{ fontSize: 12, color: C.gray, marginLeft: 30, display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <div><span style={{ fontWeight: 600, color: C.navy }}>{firma.nombre}</span>{firma.cargo && ` · ${firma.cargo}`}</div>
                      {firma.rut     && <div>RUT: {firma.rut}</div>}
                      {firma.empresa && <div>{firma.empresa}</div>}
                      <div style={{ color: '#94a3b8' }}>{firma.fecha} {firma.hora}</div>
                      <div style={{ marginTop: 2, fontSize: 11, fontWeight: 700, color: C.green }}>✓ FIRMADO DIGITALMENTE</div>
                    </div>
                  ) : (
                    <div style={{ fontSize: 11, color: '#94a3b8', marginLeft: 30 }}>Pendiente de firma</div>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, marginLeft: 12 }}>
                  <StatusBadge firmado={firma?.firmado} />
                  {puedeFirmar(rolKey) && (
                    <button onClick={() => setModal(rolKey)} style={{
                      padding: '6px 14px', fontSize: 12, fontWeight: 700,
                      background: C.navy, color: '#fff',
                      border: 'none', borderRadius: 8, cursor: 'pointer',
                    }}>
                      Firmar
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {firmadas === FLUJO.length && (
        <div style={{
          marginTop: 14, padding: '10px 14px', background: C.greenBg,
          borderRadius: 8, fontSize: 13, color: C.green, fontWeight: 600, textAlign: 'center',
        }}>
          Documento completamente firmado — descarga el PDF desde el Historial
        </div>
      )}

      {modal && session && (
        <PinModal
          session={session}
          rolLabel={ROLES_FIRMA[modal].label}
          onSuccess={() => handleFirmaSuccess(modal)}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  )
}
