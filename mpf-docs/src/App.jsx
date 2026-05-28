// src/App.jsx
import { useState, useEffect } from 'react'
import { getSession, logout } from './lib/auth.js'
import Layout from './components/Layout.jsx'
import Login from './pages/Login.jsx'
import PlanTrabajo from './pages/PlanTrabajo.jsx'
import InformeDiario from './pages/InformeDiario.jsx'
import Historial from './pages/Historial.jsx'
import LibroObras from './pages/LibroObras.jsx'

export default function App() {
  const [session, setSession] = useState(null)
  const [page,    setPage]    = useState('plan')

  useEffect(() => {
    const s = getSession()
    if (s) setSession(s)
  }, [])

  function handleLogin(s) { setSession(s); setPage('plan') }
  function handleLogout() { logout(); setSession(null) }

  if (!session) return <Login onLogin={handleLogin}/>

  return (
    <Layout session={session} page={page} setPage={setPage} onLogout={handleLogout}>
      {page === 'plan'     && <PlanTrabajo    session={session}/>}
      {page === 'informe'  && <InformeDiario  session={session}/>}
      {page === 'historial'&& <Historial/>}
      {page === 'libro'    && <LibroObras/>}
    </Layout>
  )
}
