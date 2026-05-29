// src/pages/documentos/pages/AdminPanel.jsx
import { useState, useEffect, useCallback } from 'react'
import { db } from '../../../lib/firebase.js'
import {
  collection, addDoc, getDocs, updateDoc, doc,
  serverTimestamp, query, where,
} from 'firebase/firestore'

const COLOR = '#8B5CF6'
const EXPIRACION_DIAS = [1, 3, 7, 30]

function fmtFecha(ts) {
  if (!ts) return '—'
  const d = ts.toDate ? ts.toDate() : new Date(ts)
  return d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' })
}

function fmtFechaHora(ts) {
  if (!ts) return '—'
  const d = ts.toDate ? ts.toDate() : new Date(ts)
  return d.toLocaleString('es-CL', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function getBaseUrl() {
  return window.location.origin
}

function getEstadoInv(inv) {
  if (inv.usada && inv.usadaPor) return { label: 'Aceptada', color: '#10B981', bg: 'rgba(16,185,129,0.1)', border: 'rgba(16,185,129,0.2)' }
  if (inv.usada)                  return { label: 'Revocada', color: '#64748b', bg: 'rgba(100,116,139,0.1)', border: 'rgba(100,116,139,0.2)' }
  if (inv.expiresAt && (inv.expiresAt.toDate ? inv.expiresAt.toDate() : new Date(inv.expiresAt)) < new Date())
                                  return { label: 'Expirada', color: '#EF4444', bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.2)' }
  return { label: 'Activa', color: COLOR, bg: `${COLOR}12`, border: `${COLOR}25` }
}

// ── Componentes compartidos ──────────────────────────────────────────
function SectionCard({ children, color = COLOR, delay = 0, style = {} }) {
  return (
    <div style={{
      background: '#fff',
      border: `1px solid ${color}22`,
      borderLeft: `4px solid ${color}`,
      borderRadius: 16,
      padding: '1.25rem 1.5rem',
      marginBottom: 18,
      boxShadow: `0 2px 16px ${color}0d, 0 1px 4px rgba(0,0,0,0.04)`,
      animation: 'adminSlideUp .45s ease both',
      animationDelay: `${delay}ms`,
      ...style,
    }}>
      {children}
    </div>
  )
}

function SectionHeader({ icon, label, color = COLOR }) {
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
        boxShadow: `0 2px 8px ${color}40`,
      }}>
        {icon}
      </div>
      <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.09em', color }}>
        {label}
      </span>
    </div>
  )
}

// ── Panel principal ──────────────────────────────────────────────────
export default function AdminPanel({ session }) {
  const [usuarios,       setUsuarios]     = useState([])
  const [invitaciones,   setInvitaciones] = useState([])
  const [loadingData,    setLoadingData]  = useState(true)
  const [showForm,       setShowForm]     = useState(false)
  const [creating,       setCreating]     = useState(false)
  const [copied,         setCopied]       = useState(null)
  const [linkGenerado,   setLinkGenerado] = useState(null)

  const [form, setForm] = useState({
    emailDestino: '',
    nombre:       '',
    diasExpira:   7,
  })

  const cargarDatos = useCallback(async () => {
    if (!session?.empresaId) return
    setLoadingData(true)
    try {
      // Usuarios mandante de la empresa (query simple por empresaId, filtrar rol en cliente)
      const usersSnap = await getDocs(query(
        collection(db, 'users'),
        where('empresaId', '==', session.empresaId)
      ))
      const mandantes = usersSnap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(u => u.role === 'mandante')
        .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
      setUsuarios(mandantes)

      // Invitaciones mandante de la empresa (mismo patrón de InviteUserPanel)
      const invSnap = await getDocs(query(
        collection(db, 'invitaciones'),
        where('empresaId', '==', session.empresaId)
      ))
      const mandanteInvs = invSnap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(i => i.rol === 'mandante')
        .sort((a, b) => (b.creadaEn?.seconds || 0) - (a.creadaEn?.seconds || 0))
      setInvitaciones(mandanteInvs)
    } catch (e) {
      console.error('AdminPanel: error cargando datos', e)
    }
    setLoadingData(false)
  }, [session?.empresaId])

  useEffect(() => { cargarDatos() }, [cargarDatos])

  async function crearInvitacion() {
    if (!session?.empresaId) { alert('No se encontró el ID de empresa'); return }
    setCreating(true)
    try {
      const expiresAt = new Date()
      expiresAt.setDate(expiresAt.getDate() + form.diasExpira)

      const ref = await addDoc(collection(db, 'invitaciones'), {
        empresaId:    session.empresaId,
        empresaNombre: session.empresaNombre || session.empresa || '',
        rol:          'mandante',
        modulos:      [],
        emailDestino: form.emailDestino.trim() || null,
        diasExpira:   form.diasExpira,
        usada:        false,
        creadaEn:     serverTimestamp(),
        expiresAt,
      })

      const link = `${getBaseUrl()}/invite/${ref.id}`
      setLinkGenerado(link)
      try { await navigator.clipboard.writeText(link); setCopied(ref.id) } catch {}
      await cargarDatos()
      setShowForm(false)
      setForm({ emailDestino: '', nombre: '', diasExpira: 7 })
    } catch (e) {
      alert('Error al crear invitación: ' + e.message)
    }
    setCreating(false)
  }

  async function revocarInvitacion(inv) {
    if (!window.confirm('¿Revocar esta invitación? El link dejará de funcionar.')) return
    try {
      await updateDoc(doc(db, 'invitaciones', inv.id), {
        usada: true,
        revocarEn: serverTimestamp(),
      })
      await cargarDatos()
    } catch (e) { alert('Error: ' + e.message) }
  }

  function copiarLink(invId) {
    const link = `${getBaseUrl()}/invite/${invId}`
    navigator.clipboard.writeText(link).then(() => {
      setCopied(invId)
      setTimeout(() => setCopied(null), 2500)
    })
  }

  const invActivas = invitaciones.filter(i => {
    if (i.usada) return false
    const exp = i.expiresAt?.toDate ? i.expiresAt.toDate() : (i.expiresAt ? new Date(i.expiresAt) : null)
    return !exp || exp > new Date()
  })

  const inp = {
    width: '100%', padding: '10px 13px', fontSize: 14, fontFamily: 'inherit',
    border: '1.5px solid #e2e8f0', borderRadius: 9, background: '#fff',
    color: '#1e293b', outline: 'none', boxSizing: 'border-box',
    transition: 'border-color .15s, box-shadow .15s',
  }

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', width: '100%' }}>
      <style>{`
        @keyframes adminSlideUp {
          from { opacity:0; transform:translateY(14px); }
          to   { opacity:1; transform:translateY(0); }
        }
        @keyframes adminShimmer {
          0%   { background-position: -300% 0; }
          100% { background-position: 300% 0; }
        }
        .admin-input:focus {
          border-color: ${COLOR} !important;
          box-shadow: 0 0 0 3px ${COLOR}18 !important;
        }
        .admin-inv-row { transition: box-shadow .15s, border-color .15s; }
        .admin-inv-row:hover { box-shadow: 0 4px 16px rgba(0,0,0,0.08); border-color: #d1dce8 !important; }
        .admin-user-row { transition: background .12s; }
        .admin-user-row:hover { background: #faf8ff !important; }
        .admin-btn-create {
          width: 100%; padding: 14px 20px; font-size: 14px; font-weight: 700;
          background-image: linear-gradient(90deg, #5B21B6 0%, ${COLOR} 40%, #a78bfa 70%, ${COLOR} 100%);
          background-size: 300% auto;
          animation: adminShimmer 5s linear infinite;
          color: #fff; border: none; border-radius: 12px; cursor: pointer;
          display: flex; align-items: center; justify-content: center; gap: 8px;
          font-family: inherit; letter-spacing: .02em;
          box-shadow: 0 4px 18px ${COLOR}45;
          transition: transform .2s, box-shadow .2s;
          margin-top: 4px;
        }
        .admin-btn-create:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 8px 28px ${COLOR}55;
        }
        .admin-btn-create:disabled {
          background-image: none; background: #94a3b8;
          cursor: not-allowed; box-shadow: none; animation: none;
        }
      `}</style>

      {/* ── Hero heading ── */}
      <div style={{ marginBottom: 32, animation: 'adminSlideUp .3s ease' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 13, flexShrink: 0,
            background: `linear-gradient(135deg, #5B21B6 0%, ${COLOR} 100%)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: `0 4px 16px ${COLOR}40`,
          }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 800, color: '#0F2035', marginBottom: 2, letterSpacing: '-0.03em', fontFamily: 'Outfit, sans-serif', lineHeight: 1.1 }}>
              Gestión de Usuarios
            </h1>
            <p style={{ fontSize: 13.5, color: '#64748b', margin: 0, lineHeight: 1.5 }}>
              Administra el equipo mandante asociado a tu empresa
            </p>
          </div>
        </div>
        <div style={{ height: 3, width: 60, borderRadius: 2, background: `linear-gradient(90deg, #5B21B6, ${COLOR})`, marginTop: 6 }} />
      </div>

      {/* ── Tarjeta: Invitar usuario ── */}
      <SectionCard color={COLOR} delay={0}>
        <SectionHeader
          color={COLOR}
          label="Invitar nuevo usuario mandante"
          icon={
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          }
        />

        {/* Link generado exitosamente */}
        {linkGenerado && (
          <div style={{
            background: `linear-gradient(135deg, ${COLOR}0d, ${COLOR}07)`,
            border: `1px solid ${COLOR}25`,
            borderLeft: `3px solid ${COLOR}`,
            borderRadius: 10, padding: '12px 14px', marginBottom: 16,
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: COLOR, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke={COLOR} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
              Invitación creada — link de acceso:
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <code style={{
                flex: 1, fontSize: 11, background: '#fff', border: `1px solid ${COLOR}22`,
                padding: '6px 10px', borderRadius: 7, color: '#475569',
                wordBreak: 'break-all', lineHeight: 1.5,
              }}>
                {linkGenerado}
              </code>
              <button
                onClick={() => { navigator.clipboard.writeText(linkGenerado); setCopied('link') }}
                style={{
                  flexShrink: 0, padding: '7px 14px', fontSize: 12, fontWeight: 700,
                  background: copied === 'link' ? 'rgba(16,185,129,0.12)' : `${COLOR}14`,
                  color: copied === 'link' ? '#10B981' : COLOR,
                  border: `1px solid ${copied === 'link' ? 'rgba(16,185,129,0.25)' : COLOR + '25'}`,
                  borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit',
                  transition: 'all .15s',
                }}>
                {copied === 'link' ? '✓ Copiado' : 'Copiar'}
              </button>
              <button
                onClick={() => setLinkGenerado(null)}
                style={{
                  flexShrink: 0, padding: '7px 12px', fontSize: 12,
                  background: 'transparent', border: '1px solid #e2e8f0',
                  borderRadius: 8, cursor: 'pointer', color: '#94a3b8', fontFamily: 'inherit',
                }}>
                ×
              </button>
            </div>
            <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 7, marginBottom: 0 }}>
              Comparte este link con la persona que deseas agregar. Expira en {form.diasExpira} día{form.diasExpira !== 1 ? 's' : ''}.
            </p>
          </div>
        )}

        {!showForm ? (
          <button onClick={() => setShowForm(true)} style={{
            width: '100%', padding: '11px 20px', fontSize: 13, fontWeight: 700,
            background: '#fff', border: `1.5px solid ${COLOR}40`,
            borderRadius: 10, cursor: 'pointer', color: COLOR,
            fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            transition: 'all .18s',
            boxShadow: `0 1px 6px ${COLOR}10`,
          }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
              <path d="M12 4v16m8-8H4" stroke={COLOR} strokeWidth="2.5" strokeLinecap="round"/>
            </svg>
            Nueva invitación
          </button>
        ) : (
          <div>
            {/* Email */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: '#64748b', marginBottom: 5 }}>
                Email del invitado <span style={{ fontWeight: 400, color: '#94a3b8' }}>(opcional)</span>
              </label>
              <input
                className="admin-input" type="email" style={inp}
                value={form.emailDestino}
                onChange={e => setForm(f => ({ ...f, emailDestino: e.target.value }))}
                placeholder="usuario@empresa.cl"
                autoFocus
              />
              <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 5, marginBottom: 0 }}>
                Si ingresa un email, se enviará automáticamente un correo de invitación. Si no, solo se genera el link.
              </p>
            </div>

            {/* Expiración */}
            <div style={{ marginBottom: 18 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: '#64748b', marginBottom: 8 }}>
                El link expira en
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                {EXPIRACION_DIAS.map(d => (
                  <button key={d}
                    onClick={() => setForm(f => ({ ...f, diasExpira: d }))}
                    style={{
                      padding: '7px 14px', fontSize: 12, fontWeight: 700, borderRadius: 8,
                      cursor: 'pointer', fontFamily: 'inherit',
                      border: form.diasExpira === d ? 'none' : '1.5px solid #e2e8f0',
                      background: form.diasExpira === d ? `linear-gradient(135deg, #5B21B6, ${COLOR})` : '#fff',
                      color: form.diasExpira === d ? '#fff' : '#64748b',
                      boxShadow: form.diasExpira === d ? `0 2px 8px ${COLOR}35` : 'none',
                      transition: 'all .15s',
                    }}>
                    {d === 1 ? '1 día' : `${d} días`}
                  </button>
                ))}
              </div>
            </div>

            {/* Info sobre el rol */}
            <div style={{
              background: `linear-gradient(135deg, ${COLOR}0a, ${COLOR}05)`,
              border: `1px solid ${COLOR}20`, borderRadius: 9, padding: '10px 14px', marginBottom: 16,
              fontSize: 12, color: '#475569', display: 'flex', gap: 8, alignItems: 'flex-start',
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, marginTop: 1 }}>
                <path d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" stroke={COLOR} strokeWidth="1.8" strokeLinecap="round"/>
              </svg>
              <span>El usuario invitado obtendrá el rol <strong>Mandante</strong> — acceso de lectura al Libro de Obras e Historial de documentos.</span>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => { setShowForm(false); setForm({ emailDestino: '', nombre: '', diasExpira: 7 }) }} style={{
                flex: 1, padding: '11px', fontSize: 13, fontWeight: 600,
                background: 'transparent', border: '1.5px solid #e2e8f0',
                borderRadius: 10, cursor: 'pointer', color: '#64748b', fontFamily: 'inherit',
              }}>
                Cancelar
              </button>
              <button
                onClick={crearInvitacion}
                disabled={creating}
                className="admin-btn-create"
                style={{ flex: 2 }}
              >
                {creating ? 'Creando...' : (
                  <>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                      <path d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" stroke="#fff" strokeWidth="2" strokeLinecap="round"/>
                    </svg>
                    Generar link de invitación
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </SectionCard>

      {/* ── Tarjeta: Invitaciones activas ── */}
      {invActivas.length > 0 && (
        <SectionCard color="#06B6D4" delay={60}>
          <SectionHeader
            color="#06B6D4"
            label={`Invitaciones activas (${invActivas.length})`}
            icon={
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            }
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {invActivas.map(inv => {
              const exp = inv.expiresAt?.toDate ? inv.expiresAt.toDate() : new Date(inv.expiresAt)
              return (
                <div key={inv.id} className="admin-inv-row" style={{
                  background: '#fafbfc', border: '1px solid #e8eef5',
                  borderLeft: '3px solid #06B6D4', borderRadius: 10, padding: '11px 14px',
                  display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#0F2035', marginBottom: 2 }}>
                      {inv.emailDestino || 'Link abierto (sin email asignado)'}
                    </div>
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>
                      Creada: {fmtFecha(inv.creadaEn)} · Expira: {fmtFecha(exp)}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button
                      onClick={() => copiarLink(inv.id)}
                      style={{
                        padding: '6px 12px', fontSize: 11, fontWeight: 700,
                        background: copied === inv.id ? 'rgba(16,185,129,0.1)' : 'rgba(6,182,212,0.08)',
                        color: copied === inv.id ? '#10B981' : '#06B6D4',
                        border: `1px solid ${copied === inv.id ? 'rgba(16,185,129,0.2)' : 'rgba(6,182,212,0.2)'}`,
                        borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit', transition: 'all .15s',
                      }}>
                      {copied === inv.id ? '✓ Copiado' : 'Copiar link'}
                    </button>
                    <button
                      onClick={() => revocarInvitacion(inv)}
                      style={{
                        padding: '6px 12px', fontSize: 11, fontWeight: 700,
                        background: 'rgba(239,68,68,0.06)', color: '#EF4444',
                        border: '1px solid rgba(239,68,68,0.15)',
                        borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit', transition: 'all .15s',
                      }}>
                      Revocar
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </SectionCard>
      )}

      {/* ── Tarjeta: Usuarios mandante actuales ── */}
      <SectionCard color="#10B981" delay={120}>
        <SectionHeader
          color="#10B981"
          label={`Usuarios mandante (${usuarios.length})`}
          icon={
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          }
        />

        {loadingData ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8', fontSize: 13 }}>
            Cargando usuarios...
          </div>
        ) : usuarios.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: '2.5rem 1rem',
            background: 'linear-gradient(135deg, #f0fdf4, #f8fafc)',
            borderRadius: 10, border: '1.5px dashed rgba(16,185,129,0.25)',
          }}>
            <div style={{
              width: 44, height: 44, borderRadius: 12, margin: '0 auto 12px',
              background: 'rgba(16,185,129,0.1)', border: '1.5px solid rgba(16,185,129,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" stroke="#10B981" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#0F2035', marginBottom: 4, fontFamily: 'Outfit, sans-serif' }}>
              Sin usuarios mandante todavía
            </div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>
              Usa el formulario de arriba para invitar miembros del equipo
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {/* Cabecera */}
            <div style={{ display: 'flex', gap: 12, padding: '4px 12px', marginBottom: 2 }}>
              <div style={{ flex: 2, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: '#94a3b8' }}>Usuario</div>
              <div style={{ flex: 1, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: '#94a3b8' }}>RUT</div>
              <div style={{ width: 90, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: '#94a3b8', textAlign: 'right' }}>Desde</div>
            </div>
            {usuarios.map(u => (
              <div key={u.id} className="admin-user-row" style={{
                display: 'flex', gap: 12, alignItems: 'center',
                background: '#fff', border: '1px solid #e8eef5',
                borderLeft: '3px solid #10B981', borderRadius: 10, padding: '11px 12px',
              }}>
                <div style={{ flex: 2, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#0F2035', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {u.nombre || u.email?.split('@')[0] || '—'}
                  </div>
                  <div style={{ fontSize: 11, color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {u.email || '—'}
                  </div>
                </div>
                <div style={{ flex: 1, fontSize: 12, color: '#475569', minWidth: 0 }}>
                  {u.rut || '—'}
                </div>
                <div style={{ width: 90, textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>{fmtFecha(u.createdAt)}</div>
                  <span style={{
                    display: 'inline-block', marginTop: 3,
                    background: 'rgba(16,185,129,0.1)', color: '#10B981',
                    padding: '1px 7px', borderRadius: 99, fontSize: 10, fontWeight: 700,
                    border: '1px solid rgba(16,185,129,0.2)',
                  }}>Activo</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* ── Tarjeta: Historial de invitaciones ── */}
      {invitaciones.length > invActivas.length && (
        <SectionCard color="#64748b" delay={180}>
          <SectionHeader
            color="#64748b"
            label="Historial de invitaciones"
            icon={
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" stroke="#fff" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            }
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {invitaciones
              .filter(i => {
                const exp = i.expiresAt?.toDate ? i.expiresAt.toDate() : (i.expiresAt ? new Date(i.expiresAt) : null)
                return i.usada || (exp && exp < new Date())
              })
              .slice(0, 10)
              .map(inv => {
                const estado = getEstadoInv(inv)
                return (
                  <div key={inv.id} style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    background: '#fafbfc', border: '1px solid #f1f5f9',
                    borderRadius: 9, padding: '9px 12px',
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {inv.emailDestino || 'Link sin email'}
                      </div>
                      <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 1 }}>
                        {fmtFechaHora(inv.creadaEn)}
                      </div>
                    </div>
                    <span style={{
                      flexShrink: 0, padding: '2px 9px', borderRadius: 99,
                      fontSize: 10, fontWeight: 700,
                      background: estado.bg, color: estado.color,
                      border: `1px solid ${estado.border}`,
                    }}>
                      {estado.label}
                    </span>
                  </div>
                )
              })}
          </div>
        </SectionCard>
      )}
    </div>
  )
}
