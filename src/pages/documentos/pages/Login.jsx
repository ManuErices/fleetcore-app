// src/pages/Login.jsx
import { useState } from 'react'
import { login, registrar, usuarioExiste, ROLES_SISTEMA } from '../lib/auth.js'

const C = {
  navy:    '#0f2035',
  navyDk:  '#122840',
  accent:  '#1B5E8A',
  gold:    '#C9A84C',
  white:   '#ffffff',
  gray:    'rgba(255,255,255,.55)',
  grayDk:  'rgba(255,255,255,.35)',
  border:  '#e2e8f0',
  red:     '#dc2626',
}

function LogoSVG() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
      <path d="M16 3L28 8v8c0 7-5.5 12.5-12 14C9.5 28.5 4 23 4 16V8L16 3z"
        fill="rgba(255,255,255,.2)" stroke="rgba(255,255,255,.6)" strokeWidth="1.5"/>
      <text x="16" y="21" textAnchor="middle" fill="white" fontSize="9"
        fontWeight="700" fontFamily="system-ui">MPF</text>
    </svg>
  )
}

function RolSelector({ value, onChange }) {
  const roles = Object.entries(ROLES_SISTEMA)
  return (
    <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
      {roles.map(([key, { label, color }]) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          style={{
            flex: 1,
            padding: '10px 6px',
            borderRadius: 10,
            border: value === key
              ? `2px solid ${C.gold}`
              : '2px solid rgba(255,255,255,.12)',
            background: value === key
              ? 'rgba(201,168,76,.15)'
              : 'rgba(255,255,255,.06)',
            color: value === key ? C.gold : C.gray,
            cursor: 'pointer',
            fontSize: 11,
            fontWeight: value === key ? 700 : 400,
            fontFamily: 'inherit',
            transition: 'all .18s',
          }}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

function PinInput({ value, onChange, placeholder = '••••' }) {
  return (
    <input
      type="password"
      inputMode="numeric"
      maxLength={8}
      value={value}
      onChange={e => onChange(e.target.value.replace(/\D/g, ''))}
      placeholder={placeholder}
      style={{
        width: '100%',
        padding: '12px 16px',
        fontSize: 28,
        letterSpacing: 10,
        textAlign: 'center',
        fontFamily: 'inherit',
        border: '1px solid rgba(255,255,255,.15)',
        borderRadius: 10,
        background: 'rgba(255,255,255,.08)',
        color: C.white,
        outline: 'none',
        boxSizing: 'border-box',
      }}
    />
  )
}

function ErrorBox({ msg }) {
  return (
    <div style={{
      background: 'rgba(220,38,38,.15)',
      border: '1px solid rgba(220,38,38,.3)',
      borderRadius: 8, padding: '9px 12px',
      color: '#fca5a5', fontSize: 13, marginBottom: 4,
    }}>
      {msg}
    </div>
  )
}

export default function Login({ onLogin, onBack }) {
  const [step,     setStep]     = useState('check')
  const [username, setUsername] = useState('')
  const [nombre,   setNombre]   = useState('')
  const [rut,      setRut]      = useState('')
  const [cargo,    setCargo]    = useState('')
  const [rol,      setRol]      = useState('')
  const [pin,      setPin]      = useState('')
  const [pinConf,  setPinConf]  = useState('')
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)

  async function handleCheck(e) {
    e.preventDefault()
    if (!username.trim()) { setError('Ingresa tu nombre de usuario'); return }
    setError(''); setLoading(true)
    try {
      const existe = await usuarioExiste(username)
      setStep(existe ? 'pin' : 'registro')
    } catch(err) { setError('Error de conexión: ' + err.message) }
    setLoading(false)
  }

  async function handleLogin(e) {
    e.preventDefault()
    if (!pin) { setError('Ingresa tu PIN'); return }
    setError(''); setLoading(true)
    try {
      const res = await login(username, pin)
      if (res.ok) onLogin(res.session)
      else setError(res.error)
    } catch(err) { setError('Error: ' + err.message) }
    setLoading(false)
  }

  async function handleRegistro(e) {
    e.preventDefault()
    if (!nombre.trim())  { setError('Ingresa tu nombre completo'); return }
    if (!rut.trim())     { setError('Ingresa tu RUT'); return }
    if (!cargo.trim())   { setError('Ingresa tu cargo'); return }
    if (!rol)            { setError('Selecciona tu rol'); return }
    if (pin.length < 4)  { setError('El PIN debe tener al menos 4 dígitos'); return }
    if (pin !== pinConf) { setError('Los PINs no coinciden'); return }
    setError(''); setLoading(true)
    try {
      const res = await registrar(username, nombre, rut, cargo, rol, pin)
      if (res.ok) onLogin(res.session)
    } catch(err) { setError(err.message) }
    setLoading(false)
  }

  function volver() {
    setStep('check'); setPin(''); setPinConf('')
    setNombre(''); setRut(''); setCargo(''); setRol(''); setError('')
  }

  const inp = {
    width: '100%', padding: '11px 14px', fontSize: 14,
    fontFamily: 'inherit', border: '1px solid rgba(255,255,255,.15)',
    borderRadius: 10, background: 'rgba(255,255,255,.08)',
    color: C.white, outline: 'none', boxSizing: 'border-box',
  }
  const lbl = {
    display: 'block', fontSize: 11, fontWeight: 700,
    textTransform: 'uppercase', letterSpacing: '.06em',
    color: C.gray, marginBottom: 6,
  }
  const btnPrimary = (disabled) => ({
    width: '100%', marginTop: 20, padding: '13px', fontSize: 14,
    fontWeight: 700, fontFamily: 'inherit',
    background: disabled ? 'rgba(255,255,255,.15)' : C.gold,
    color: disabled ? C.gray : C.navyDk,
    border: 'none', borderRadius: 10,
    cursor: disabled ? 'not-allowed' : 'pointer', transition: 'all .15s',
  })

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', padding: '1rem',
      background: `linear-gradient(135deg, ${C.navy} 0%, #1a3a5c 60%, #1e4976 100%)`,
    }}>
      <div style={{ width: '100%', maxWidth: 400 }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 64, height: 64, background: 'rgba(255,255,255,.1)',
            borderRadius: 16, marginBottom: 16, border: '1px solid rgba(255,255,255,.15)',
          }}>
            <LogoSVG />
          </div>
          <h1 style={{ color: C.white, fontSize: 22, fontWeight: 600, marginBottom: 4 }}>
            MPF Documentos
          </h1>
          <p style={{ color: C.gray, fontSize: 13 }}>
            {step === 'check'    && 'Sistema de redacción profesional'}
            {step === 'pin'      && 'Bienvenido de nuevo'}
            {step === 'registro' && 'Primera vez — Crea tu perfil'}
          </p>
        </div>

        {/* Card */}
        <div style={{
          background: 'rgba(255,255,255,.07)', backdropFilter: 'blur(10px)',
          border: '1px solid rgba(255,255,255,.12)', borderRadius: 18,
          padding: '2rem', boxShadow: '0 25px 50px rgba(0,0,0,.35)',
        }}>

          {/* CHECK */}
          {step === 'check' && (
            <form onSubmit={handleCheck}>
              <div style={{ marginBottom: 16 }}>
                <label style={lbl}>Nombre de usuario</label>
                <input type="text" value={username}
                  onChange={e => { setUsername(e.target.value); setError('') }}
                  placeholder="ej: juan.perez" autoComplete="username" autoFocus style={inp} />
                <p style={{ marginTop: 6, fontSize: 11, color: C.grayDk }}>
                  Si es tu primera vez, se creará tu perfil automáticamente.
                </p>
              </div>
              {error && <ErrorBox msg={error} />}
              <button type="submit" disabled={loading} style={btnPrimary(loading)}>
                {loading ? 'Verificando...' : 'Continuar →'}
              </button>
            </form>
          )}

          {/* LOGIN PIN */}
          {step === 'pin' && (
            <form onSubmit={handleLogin}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                marginBottom: 20, paddingBottom: 16,
                borderBottom: '1px solid rgba(255,255,255,.1)',
              }}>
                <div style={{
                  width: 36, height: 36, borderRadius: '50%',
                  background: 'rgba(255,255,255,.15)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: C.white, fontSize: 14, fontWeight: 700,
                }}>
                  {username.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div style={{ color: C.white, fontSize: 13, fontWeight: 600 }}>{username}</div>
                  <button type="button" onClick={volver}
                    style={{ background: 'none', border: 'none', color: C.grayDk, fontSize: 11, cursor: 'pointer', padding: 0 }}>
                    ← Cambiar usuario
                  </button>
                </div>
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={lbl}>Ingresa tu PIN</label>
                <PinInput value={pin} onChange={v => { setPin(v); setError('') }} />
              </div>
              {error && <ErrorBox msg={error} />}
              <button type="submit" disabled={loading || !pin} style={btnPrimary(loading || !pin)}>
                {loading ? 'Verificando...' : 'Ingresar'}
              </button>
            </form>
          )}

          {/* REGISTRO */}
          {step === 'registro' && (
            <form onSubmit={handleRegistro}>
              <div style={{
                background: 'rgba(201,168,76,.12)', border: '1px solid rgba(201,168,76,.3)',
                borderRadius: 10, padding: '10px 14px', marginBottom: 20,
                fontSize: 12, color: C.gold,
              }}>
                Usuario nuevo — completa tu perfil para continuar
              </div>

              {/* Usuario readonly */}
              <div style={{ marginBottom: 14 }}>
                <label style={lbl}>Nombre de usuario</label>
                <input type="text" value={username} readOnly
                  style={{ ...inp, opacity: 0.6, cursor: 'not-allowed' }} />
              </div>

              {/* Nombre */}
              <div style={{ marginBottom: 14 }}>
                <label style={lbl}>Nombre completo</label>
                <input type="text" value={nombre}
                  onChange={e => { setNombre(e.target.value); setError('') }}
                  placeholder="ej: Juan Pérez Rojas" style={inp} autoFocus />
              </div>

              {/* RUT */}
              <div style={{ marginBottom: 14 }}>
                <label style={lbl}>RUT</label>
                <input type="text" value={rut}
                  onChange={e => { setRut(e.target.value); setError('') }}
                  placeholder="ej: 12.345.678-9" style={inp} />
              </div>

              {/* Cargo */}
              <div style={{ marginBottom: 14 }}>
                <label style={lbl}>Cargo</label>
                <input type="text" value={cargo}
                  onChange={e => { setCargo(e.target.value); setError('') }}
                  placeholder="ej: Supervisor de Terreno" style={inp} />
              </div>

              {/* Rol */}
              <div style={{ marginBottom: 18 }}>
                <label style={lbl}>Rol en el proyecto</label>
                <RolSelector value={rol} onChange={r => { setRol(r); setError('') }} />
                {rol && (
                  <p style={{ marginTop: 8, fontSize: 11, color: C.grayDk }}>
                    Empresa asignada: {rol === 'mandante' ? 'Río Tinto Mining' : 'MPF Ingeniería Civil SpA'}
                  </p>
                )}
              </div>

              {/* PIN */}
              <div style={{ marginBottom: 14 }}>
                <label style={lbl}>Crea tu PIN (mín. 4 dígitos)</label>
                <PinInput value={pin} onChange={v => { setPin(v); setError('') }} />
              </div>

              {/* Confirmar PIN */}
              <div style={{ marginBottom: 4 }}>
                <label style={lbl}>Confirmar PIN</label>
                <PinInput value={pinConf} onChange={v => { setPinConf(v); setError('') }} />
              </div>

              <p style={{ fontSize: 11, color: C.grayDk, marginBottom: 4, marginTop: 8 }}>
                Tu PIN es personal e intransferible. Lo usarás para firmar documentos.
              </p>

              {error && <ErrorBox msg={error} />}
              <button type="submit" disabled={loading} style={btnPrimary(loading)}>
                {loading ? 'Creando perfil...' : 'Crear perfil e ingresar'}
              </button>
              <button type="button" onClick={volver} style={{
                width: '100%', marginTop: 10, padding: '10px', fontSize: 13,
                background: 'none', border: '1px solid rgba(255,255,255,.12)',
                borderRadius: 10, color: C.gray, cursor: 'pointer', fontFamily: 'inherit',
              }}>
                ← Volver
              </button>
            </form>
          )}
        </div>

        {onBack && (
          <div style={{ textAlign: 'center', marginTop: 16 }}>
            <button onClick={onBack} style={{
              background: 'none', border: 'none', color: C.grayDk,
              fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
            }}>
              ← Volver al selector de apps
            </button>
          </div>
        )}
        <p style={{ textAlign: 'center', color: C.grayDk, fontSize: 12, marginTop: 8 }}>
          MPF Ingeniería Civil SpA · Proyecto Río Tinto
        </p>
      </div>
    </div>
  )
}
