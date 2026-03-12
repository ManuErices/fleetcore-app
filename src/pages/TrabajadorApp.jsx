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
 *   2. Si hay usuario autenticado → busca su perfil en Firestore (collection 'trabajadores', doc = uid)
 *   3. Muestra Login o Dashboard según estado
 *
 * Creación de cuentas (desde panel admin FleetCore):
 *   createUserWithEmailAndPassword(auth, rutSinPuntosGuion + '@mpf.cl', rutSinPuntosGuion)
 *   Luego el trabajador puede cambiar su contraseña desde el portal.
 */

export default function TrabajadorApp() {
  const [estado,     setEstado]     = useState('loading'); // loading | guest | logged
  const [user,       setUser]       = useState(null);
  const [trabajador, setTrabajador] = useState(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        setUser(null);
        setTrabajador(null);
        setEstado('guest');
        return;
      }

      // Verificar que sea una cuenta de trabajador (@mpf.cl)
      // Esto evita que el admin (Google Auth) acceda al portal de trabajadores
      if (!firebaseUser.email?.endsWith('@mpf.cl')) {
        setUser(null);
        setTrabajador(null);
        setEstado('guest');
        return;
      }

      setUser(firebaseUser);

      // Buscar perfil del trabajador usando su email (rut@mpf.cl → rut sin puntos/guión)
      // Estrategia: el docId del trabajador en Firestore NO es el uid de Auth,
      // pero al crear la cuenta guardamos portalUid en el doc.
      // Como las reglas bloquean getDocs sobre toda la colección,
      // usamos el email para derivar el RUT y buscamos por el campo 'rut' formateado,
      // o simplemente guardamos un doc índice en 'trabajadores_portal/{uid}' al crear cuenta.
      // Solución más simple: guardar el firestoreId en un doc separado al crear la cuenta.
      try {
        // Leer el índice uid→firestoreId que PortalTrabajadoresPanel escribe al crear cuenta
        const idxSnap = await getDoc(doc(db, 'trabajadores_portal', firebaseUser.uid));
        if (idxSnap.exists()) {
          const firestoreId = idxSnap.data().trabajadorDocId;
          const tSnap = await getDoc(doc(db, 'trabajadores', firestoreId));
          if (tSnap.exists()) {
            setTrabajador({ id: tSnap.id, ...tSnap.data() });
          } else {
            setTrabajador(null);
          }
        } else {
          setTrabajador(null);
        }
      } catch {
        setTrabajador(null);
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

  return <TrabajadorDashboard user={user} trabajador={trabajador} />;
}
