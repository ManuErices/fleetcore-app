import { useState, useEffect } from 'react'
import { doc, getDoc } from 'firebase/firestore'
import { db as mainDb } from '../../lib/firebase.js'
import { getSession, logout } from './lib/auth.js'
import Layout from './components/Layout.jsx'
import Login from './pages/Login.jsx'
import PlanTrabajo from './pages/PlanTrabajo.jsx'
import InformeDiario from './pages/InformeDiario.jsx'
import Historial from './pages/Historial.jsx'
import LibroObras from './pages/LibroObras.jsx'
import AdminPanel from './pages/AdminPanel.jsx'

const SESSION_KEY = 'mpf_session'

// Mapeo de roles del main app a roles de mpf-docs
function mapRole(mainRole) {
  if (mainRole === 'superadmin') return 'admin'
  if (mainRole === 'admin_contrato') return 'supervisor'
  if (mainRole === 'revisor_admin') return 'supervisor'
  if (mainRole === 'revisor') return 'mandante'
  if (mainRole === 'mandante_admin') return 'mandante'
  if (mainRole === 'mandante') return 'mandante'
  if (mainRole === 'operador') return 'operador'
  return 'supervisor'
}

export default function DocumentosApp({ user, onBackToSelector, onLogout }) {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState('plan')

  useEffect(() => {
    async function initSession() {
      // Si ya hay sesión activa, usarla — enriquecerla si le faltan campos nuevos
      const existing = getSession()
      if (existing) {
        if (user && !existing.rolOriginal) {
          // Sesión antigua sin rolOriginal: enriquecer desde Firestore sin forzar re-login
          try {
            const snap = await getDoc(doc(mainDb, 'users', user.uid))
            const data = snap.exists() ? snap.data() : {}
            const empresaId = data.empresaId || ''
            let empresaNombre = existing.empresa || ''
            if (empresaId) {
              try {
                const empSnap = await getDoc(doc(mainDb, 'empresas', empresaId))
                if (empSnap.exists()) empresaNombre = empSnap.data().nombre || empresaNombre
              } catch {}
            }
            const enriched = { ...existing, rolOriginal: data.role || '', empresaId, empresaNombre }
            sessionStorage.setItem(SESSION_KEY, JSON.stringify(enriched))
            setSession(enriched)
            if (enriched.rol === 'mandante') setPage('libro')
            setLoading(false)
            return
          } catch {}
        }
        setSession(existing)
        if (existing.rol === 'mandante') setPage('libro')
        setLoading(false)
        return
      }

      // Si viene usuario de Firebase Auth, crear sesión completa
      if (user) {
        try {
          const snap = await getDoc(doc(mainDb, 'users', user.uid))
          const data = snap.exists() ? snap.data() : {}
          const rol = mapRole(data.role || 'supervisor')
          const nombre = data.nombre || user.displayName || user.email.split('@')[0]
          const cargo = data.cargo || ''
          const empresa = rol === 'mandante' ? 'Río Tinto Mining' : 'MPF Ingeniería Civil SpA'
          const empresaId = data.empresaId || ''

          // Nombre real de la empresa para invitaciones
          let empresaNombre = empresa
          if (empresaId) {
            try {
              const empSnap = await getDoc(doc(mainDb, 'empresas', empresaId))
              if (empSnap.exists()) empresaNombre = empSnap.data().nombre || empresa
            } catch {}
          }

          const newSession = {
            usuario: user.email.split('@')[0],
            nombre,
            rut: data.rut || '',
            cargo,
            empresa,
            rol,
            rolOriginal: data.role || '',
            empresaId,
            empresaNombre,
          }
          sessionStorage.setItem(SESSION_KEY, JSON.stringify(newSession))
          setSession(newSession)
          if (rol === 'mandante') setPage('libro')
        } catch {
          setSession(null)
        }
      }
      setLoading(false)
    }

    initSession()
  }, [user])

  function handleLogin(s) { 
    setSession(s); 
    setPage(s.rol === 'mandante' ? 'libro' : 'plan');
  }

  function handleLogout() {
    logout()
    setSession(null)
    if (onLogout) onLogout() // Llamar al logout de la app principal (Firebase)
  }

  if (loading) return null

  if (!session) return <Login onLogin={handleLogin} onBack={onBackToSelector} />

  return (
    <Layout session={session} page={page} setPage={setPage} onLogout={handleLogout} onBack={onBackToSelector}>
      {page === 'plan'     && session?.rol !== 'mandante' && <PlanTrabajo session={session} />}
      {page === 'informe'  && session?.rol !== 'mandante' && <InformeDiario session={session} />}
      {page === 'historial' && <Historial />}
      {page === 'libro'    && <LibroObras />}
      {page === 'admin'    && session?.rolOriginal === 'mandante_admin' && <AdminPanel session={session} />}
    </Layout>
  )
}
