// src/components/FirmasPanel.jsx
import { useState, useEffect } from 'react'
import { ROLES_FIRMA, FLUJO, verificarPin, firmarDocumento, getFirmas, tienePin, crearPin } from '../lib/firmas.js'
import { getSession } from '../lib/auth.js'

function PinModal({ session, rolLabel, onSuccess, onClose }) {
  const [pin,         setPin]         = useState('')
  const [confirmPin,  setConfirmPin]  = useState('')
  const [hasPin,      setHasPin]      = useState(true)
  const [checkingPin, setCheckingPin] = useState(true)
  const [error,       setError]       = useState('')
  const [loading,     setLoading]     = useState(false)

  useEffect(() => {
    async function check() {
      try {
        const tiene = await tienePin(session.usuario)
        setHasPin(tiene)
      } catch(e) {
        console.error("Error al revisar si el usuario tiene PIN:", e)
      }
      setCheckingPin(false)
    }
    check()
  }, [session.usuario])

  async function handleFirmar() {
    setError('')
    if (!pin) return setError('Ingresa tu PIN')
    setLoading(true)
    try {
      if (!hasPin) {
        if (pin.length < 4) { setError('El PIN debe tener exactamente 4 dígitos'); setLoading(false); return }
        if (pin !== confirmPin) { setError('Los PINs de firma no coinciden'); setLoading(false); return }
        // Crear el PIN en caliente en la colección 'pins' y 'usuarios'
        await crearPin(session.usuario, pin)
      }
      const ok = await verificarPin(session.usuario, pin)
      if (!ok) { setError('PIN incorrecto'); setLoading(false); return }
      onSuccess()
    } catch(e) { setError(e.message) }
    setLoading(false)
  }

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(10,16,30,0.65)',
      backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
      animation: 'fadeIn .15s ease',
    }}>
      <style>{`
        @keyframes fadeIn { from{opacity:0;} to{opacity:1;} }
        @keyframes modalUp { from{opacity:0;transform:translateY(20px);} to{opacity:1;transform:translateY(0);} }
      `}</style>
      <div style={{
        background: '#fff', borderRadius: 18, padding: '2rem',
        width: 360, boxShadow: '0 24px 60px rgba(0,0,0,0.25)',
        animation: 'modalUp .2s ease',
        border: '1px solid rgba(0,0,0,0.06)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10, flexShrink: 0,
              background: 'linear-gradient(135deg, #0F2035, #2563eb)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 3px 10px rgba(37,99,235,0.3)',
            }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
                <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#0F2035' }}>
                {checkingPin ? 'Cargando...' : hasPin ? 'Firmar documento' : 'Configurar PIN de firma'}
              </div>
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                {checkingPin ? 'Espere un momento' : hasPin ? rolLabel : 'Es tu primera firma — Crea tu PIN'}
              </div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#94a3b8', lineHeight: 1 }}>×</button>
        </div>

        {/* Datos del firmante */}
        <div style={{
          background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12,
          padding: '14px 16px', marginBottom: 20,
        }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 10 }}>
            Datos del firmante
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 13 }}>
            <div><span style={{ color: '#94a3b8' }}>Nombre: </span><span style={{ fontWeight: 600, color: '#0F2035' }}>{session.nombre}</span></div>
            {session.rut    && <div><span style={{ color: '#94a3b8' }}>RUT: </span><span style={{ color: '#334155' }}>{session.rut}</span></div>}
            {session.cargo  && <div><span style={{ color: '#94a3b8' }}>Cargo: </span><span style={{ color: '#334155' }}>{session.cargo}</span></div>}
            {session.empresa && <div><span style={{ color: '#94a3b8' }}>Empresa: </span><span style={{ color: '#334155' }}>{session.empresa}</span></div>}
          </div>
        </div>

        {checkingPin ? (
          <div style={{ padding: '20px 0', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>Verificando credenciales...</div>
        ) : (
          <>
            {/* PIN */}
            <label style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.07em', display: 'block', marginBottom: 8 }}>
              {hasPin ? 'Ingresa tu PIN para confirmar' : 'Ingresa tu nuevo PIN (4 dígitos)'}
            </label>
            <input
              type="password" inputMode="numeric" maxLength={4}
              value={pin} onChange={e => { setPin(e.target.value.replace(/\D/g,'').slice(0, 4)); setError('') }}
              placeholder="••••" autoFocus
              style={{
                width: '100%', padding: '12px', fontSize: 26, letterSpacing: 12,
                border: `1.5px solid ${error ? '#EF4444' : '#e2e8f0'}`,
                borderRadius: 10, boxSizing: 'border-box', outline: 'none',
                textAlign: 'center', color: '#0F2035', background: '#f8fafc',
                transition: 'border-color .15s, box-shadow .15s',
              }}
            />

            {!hasPin && (
              <>
                <label style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.07em', display: 'block', marginTop: 14, marginBottom: 8 }}>
                  Confirma tu nuevo PIN
                </label>
                <input
                  type="password" inputMode="numeric" maxLength={4}
                  value={confirmPin} onChange={e => { setConfirmPin(e.target.value.replace(/\D/g,'').slice(0, 4)); setError('') }}
                  placeholder="••••"
                  style={{
                    width: '100%', padding: '12px', fontSize: 26, letterSpacing: 12,
                    border: `1.5px solid ${error ? '#EF4444' : '#e2e8f0'}`,
                    borderRadius: 10, boxSizing: 'border-box', outline: 'none',
                    textAlign: 'center', color: '#0F2035', background: '#f8fafc',
                    transition: 'border-color .15s, box-shadow .15s',
                  }}
                />
              </>
            )}
          </>
        )}

        {error && (
          <div style={{
            marginTop: 8, padding: '8px 12px', borderRadius: 8, fontSize: 13,
            background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
            color: '#EF4444',
          }}>
            {error}
          </div>
        )}

        <button
          onClick={handleFirmar} disabled={loading || checkingPin}
          style={{
            width: '100%', marginTop: 16, padding: '13px', fontSize: 14, fontWeight: 700,
            background: (loading || checkingPin) ? '#94a3b8' : 'linear-gradient(135deg, #0F2035, #2563eb)',
            color: '#fff', border: 'none', borderRadius: 11,
            cursor: (loading || checkingPin) ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit',
            boxShadow: (loading || checkingPin) ? 'none' : '0 4px 14px rgba(37,99,235,0.35)',
            transition: 'all .15s',
          }}>
          {loading ? 'Procesando...' : hasPin ? 'Firmar documento' : 'Crear PIN y Firmar'}
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
    try { setFirmas(await getFirmas(docId, session?.empresaId)) } catch(e) { console.error(e) }
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
    <div style={{
      background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: 14,
      padding: '1.25rem', marginTop: 16, textAlign: 'center',
    }}>
      <div style={{ fontSize: 13, color: '#94a3b8' }}>
        Guarda el documento primero para habilitar las firmas digitales
      </div>
    </div>
  )

  if (loading) return (
    <div style={{ padding: '1.25rem', color: '#94a3b8', fontSize: 13, textAlign: 'center' }}>
      Cargando firmas...
    </div>
  )

  const firmadas = FLUJO.filter(r => firmas[r]?.firmado).length
  const pct = Math.round((firmadas / FLUJO.length) * 100)
  const allDone = firmadas === FLUJO.length

  return (
    <div style={{
      background: '#fff', borderRadius: 16, padding: '1.25rem', marginTop: 16,
      border: `1px solid ${allDone ? 'rgba(16,185,129,0.3)' : '#e2e8f0'}`,
      boxShadow: allDone ? '0 4px 20px rgba(16,185,129,0.12)' : '0 2px 12px rgba(0,0,0,0.04)',
      transition: 'all .3s',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, paddingBottom: 14, borderBottom: '1px solid #f1f5f9' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 30, height: 30, borderRadius: 8,
            background: allDone ? 'linear-gradient(135deg, #10B981, #059669)' : 'linear-gradient(135deg, #1a3a5c, #2563eb)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: allDone ? '0 2px 8px rgba(16,185,129,0.4)' : '0 2px 8px rgba(37,99,235,0.3)',
            transition: 'all .3s',
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#0F2035' }}>Firmas digitales</div>
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>{firmadas}/{FLUJO.length} firmado{firmadas !== 1 ? 's' : ''}</div>
          </div>
        </div>
        {/* Progress bar */}
        <div style={{ width: 130 }}>
          <div style={{ height: 6, background: '#e2e8f0', borderRadius: 99, overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: `${pct}%`,
              background: pct === 100
                ? 'linear-gradient(90deg, #10B981, #059669)'
                : 'linear-gradient(90deg, #2563eb, #06B6D4)',
              borderRadius: 99,
              transition: 'width .5s ease, background .3s',
            }} />
          </div>
          <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 3, textAlign: 'right', fontWeight: 600 }}>{pct}%</div>
        </div>
      </div>

      {/* Roles */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {FLUJO.map((rolKey, idx) => {
          const rol    = ROLES_FIRMA[rolKey]
          const firma  = firmas[rolKey]
          const locked = idx > 0 && !firmas[FLUJO[idx-1]]?.firmado
          const signed = firma?.firmado

          return (
            <div key={rolKey} style={{
              border: `1px solid ${signed ? 'rgba(16,185,129,0.25)' : locked ? '#f1f5f9' : '#e2e8f0'}`,
              borderLeft: `3px solid ${signed ? '#10B981' : locked ? '#e2e8f0' : '#2563eb'}`,
              borderRadius: 11,
              background: signed ? '#f0fdf4' : locked ? '#fafafa' : '#fff',
              padding: '12px 14px',
              opacity: locked ? 0.65 : 1,
              transition: 'all .2s',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <span style={{
                      width: 22, height: 22, borderRadius: '50%', fontSize: 11, fontWeight: 700,
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      background: signed
                        ? 'linear-gradient(135deg, #10B981, #059669)'
                        : locked ? '#e2e8f0'
                        : 'linear-gradient(135deg, #2563eb, #0891b2)',
                      color: locked && !signed ? '#94a3b8' : '#fff',
                      flexShrink: 0,
                      boxShadow: signed ? '0 2px 6px rgba(16,185,129,0.35)' : !locked ? '0 2px 6px rgba(37,99,235,0.25)' : 'none',
                      transition: 'all .3s',
                    }}>{idx + 1}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: locked && !signed ? '#94a3b8' : '#0F2035' }}>
                      {rol.label}
                    </span>
                    {locked && (
                      <span style={{ fontSize: 10, color: '#94a3b8', background: '#f1f5f9', padding: '2px 7px', borderRadius: 99 }}>
                        Esperando firma anterior
                      </span>
                    )}
                  </div>

                  {signed ? (
                    <div style={{ fontSize: 12, color: '#64748b', marginLeft: 30, display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <div><span style={{ fontWeight: 600, color: '#0F2035' }}>{firma.nombre}</span>{firma.cargo && ` · ${firma.cargo}`}</div>
                      {firma.rut && <div>RUT: {firma.rut}</div>}
                      {firma.empresa && <div>{firma.empresa}</div>}
                      <div style={{ color: '#94a3b8', fontSize: 11 }}>{firma.fecha} {firma.hora}</div>
                      <div style={{ marginTop: 3, fontSize: 11, fontWeight: 700, color: '#10B981', display:'flex', alignItems:'center', gap:4 }}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="#10B981" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        FIRMADO DIGITALMENTE
                      </div>
                    </div>
                  ) : (
                    <div style={{ fontSize: 11, color: '#94a3b8', marginLeft: 30 }}>Pendiente de firma</div>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, marginLeft: 12 }}>
                  <span style={{
                    padding: '3px 10px', borderRadius: 99, fontSize: 11, fontWeight: 700,
                    background: signed ? 'rgba(16,185,129,0.12)' : 'rgba(245,158,11,0.1)',
                    color: signed ? '#10B981' : '#92400e',
                  }}>
                    {signed ? '✓ Firmado' : 'Pendiente'}
                  </span>
                  {puedeFirmar(rolKey) && (
                    <button onClick={() => setModal(rolKey)} style={{
                      padding: '6px 14px', fontSize: 12, fontWeight: 700,
                      background: 'linear-gradient(135deg, #0F2035, #2563eb)',
                      color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer',
                      fontFamily: 'inherit',
                      boxShadow: '0 2px 8px rgba(37,99,235,0.3)',
                      transition: 'all .15s',
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

      {allDone && (
        <div style={{
          marginTop: 14, padding: '12px 16px',
          background: 'linear-gradient(135deg, rgba(16,185,129,0.1), rgba(5,150,105,0.06))',
          border: '1px solid rgba(16,185,129,0.25)',
          borderRadius: 10, fontSize: 13, color: '#10B981', fontWeight: 600, textAlign: 'center',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" stroke="#10B981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
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
