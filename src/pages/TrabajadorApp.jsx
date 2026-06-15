import { useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import TrabajadorLogin     from './TrabajadorLogin';
import TrabajadorDashboard from './TrabajadorDashboard';

/**
 * TrabajadorApp
 * ─────────────
 * Punto de entrada del portal de trabajadores.
 * Rutar en tu app: <Route path="/trabajador/*" element={<TrabajadorApp />} />
 *
 * Flujo:
 *   1. Escucha Firebase Auth
 *   2. Si hay usuario autenticado → lee /users/{uid} y valida role === 'trabajador'
 *      (si no, se trata como guest — permite que admins con sesión activa
 *      naveguen a /trabajador sin quedar atrapados)
 *   3. Lee empresaId, luego empresas/{empresaId}/trabajadores_portal/{uid} → trabajadorDocId,
 *      y finalmente empresas/{empresaId}/trabajadores/{trabajadorDocId}
 *   4. Muestra Login o Dashboard según estado
 *
 * Creación de cuentas:
 *   - Desde RRHH: createUserWithEmailAndPassword(secondaryAuth, rutSinPuntosGuion + '@mpf.cl', rutSinPuntosGuion)
 *     + setDoc(users/{uid}, { empresaId, role: 'trabajador', ... })
 *   - Desde invitación general: el usuario registra su email real (InviteAccept.jsx),
 *     que también crea el registro en trabajadores/ y trabajadores_portal/
 *   En ambos casos el trabajador puede cambiar su contraseña desde el portal.
 *   TrabajadorLogin acepta tanto RUT (→ rut@mpf.cl) como email real.
 */

export default function TrabajadorApp() {
  const [estado,     setEstado]     = useState('loading'); // loading | guest | logged
  const [user,       setUser]       = useState(null);
  const [trabajador, setTrabajador] = useState(null);
  const [empresaId,  setEmpresaId]  = useState(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        setUser(null);
        setTrabajador(null);
        setEmpresaId(null);
        setEstado('guest');
        return;
      }

      // 1. Leer /users/{uid} y verificar que tenga rol 'trabajador'
      //    (antes se validaba por dominio @mpf.cl, pero las invitaciones
      //    generales crean trabajadores con email real)
      // 2. Leer empresas/{empresaId}/trabajadores_portal/{uid} → trabajadorDocId
      // 3. Leer empresas/{empresaId}/trabajadores/{trabajadorDocId} → perfil
      try {
        const userSnap = await getDoc(doc(db, 'users', firebaseUser.uid));
        const userData = userSnap.exists() ? userSnap.data() : null;

        if (!userData || userData.role !== 'trabajador') {
          setUser(null);
          setTrabajador(null);
          setEmpresaId(null);
          setEstado('guest');
          return;
        }

        setUser(firebaseUser);

        const empId = userData.empresaId;
        if (empId) {
          setEmpresaId(empId);

          const idxSnap = await getDoc(doc(db, 'empresas', empId, 'trabajadores_portal', firebaseUser.uid));
          if (idxSnap.exists()) {
            const firestoreId = idxSnap.data().trabajadorDocId;
            const tSnap = await getDoc(doc(db, 'empresas', empId, 'trabajadores', firestoreId));
            setTrabajador(tSnap.exists() ? { id: tSnap.id, ...tSnap.data() } : null);
          } else {
            setTrabajador(null);
          }
        } else {
          setEmpresaId(null);
          setTrabajador(null);
        }
      } catch {
        setUser(null);
        setEmpresaId(null);
        setTrabajador(null);
        setEstado('guest');
        return;
      }

      setEstado('logged');
    });

    return unsub;
  }, []);

  // ── Pantalla de carga inicial ──
  if (estado === 'loading') {
    return (
      <div style={{
        minHeight: '100dvh',
        background: '#0f0f0f',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: 16,
        fontFamily: "'Sora', sans-serif",
      }}>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Sora:wght@700&display=swap');`}</style>
        {/* Logo animado */}
        <div style={{
          width: 48, height: 48,
          background: '#F59E0B',
          borderRadius: 14,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          animation: 'pulse 1.5s ease-in-out infinite',
        }}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#0f0f0f" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 7H4a2 2 0 00-2 2v10a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2z"/>
            <path d="M16 3H8l-2 4h12l-2-4z"/>
          </svg>
        </div>
        <span style={{ color: '#555', fontSize: 13, fontFamily: "'IBM Plex Mono', monospace" }}>
          cargando...
        </span>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono&display=swap');
          @keyframes pulse {
            0%, 100% { opacity: 1; transform: scale(1); }
            50%       { opacity: 0.7; transform: scale(0.95); }
          }
        `}</style>
      </div>
    );
  }

  if (estado === 'guest') {
    return <TrabajadorLogin />;
  }

  return <TrabajadorDashboard user={user} trabajador={trabajador} empresaId={empresaId} />;
}
