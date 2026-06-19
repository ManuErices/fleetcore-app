import { useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, setDoc, collection, query, where, getDocs, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import TrabajadorLogin     from './TrabajadorLogin';
import TrabajadorDashboard from './TrabajadorDashboard';

/**
 * TrabajadorApp
 * ─────────────
 * Punto de entrada del portal de trabajadores.
 * Acceso: cualquier usuario con una entrada en trabajadores_portal/{uid}, sin restricción de rol.
 * Si el índice falta, se intenta auto-crear buscando por portalUid en la colección trabajadores.
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

      try {
        const userSnap = await getDoc(doc(db, 'users', firebaseUser.uid));
        const userData = userSnap.exists() ? userSnap.data() : null;

        // Cualquier usuario con empresaId puede acceder al portal — sin restricción de rol
        if (!userData?.empresaId) {
          setUser(null); setTrabajador(null); setEmpresaId(null);
          setEstado('guest');
          return;
        }

        setUser(firebaseUser);
        const empId = userData.empresaId;
        setEmpresaId(empId);

        // 1. Buscar índice trabajadores_portal/{uid}
        const idxRef  = doc(db, 'empresas', empId, 'trabajadores_portal', firebaseUser.uid);
        const idxSnap = await getDoc(idxRef);

        if (idxSnap.exists()) {
          // Índice encontrado → cargar perfil directamente
          const firestoreId = idxSnap.data().trabajadorDocId;
          const tSnap = await getDoc(doc(db, 'empresas', empId, 'trabajadores', firestoreId));
          setTrabajador(tSnap.exists() ? { id: tSnap.id, ...tSnap.data() } : null);
        } else {
          // 2. Índice no existe → buscar en trabajadores por portalUid y auto-crear
          const q     = query(collection(db, 'empresas', empId, 'trabajadores'), where('portalUid', '==', firebaseUser.uid));
          const qSnap = await getDocs(q);
          if (!qSnap.empty) {
            const tDoc = qSnap.docs[0];
            await setDoc(idxRef, {
              trabajadorDocId: tDoc.id,
              rut:   tDoc.data().rut   || '',
              email: firebaseUser.email || '',
              autoCreated: true,
              createdAt: serverTimestamp(),
            });
            setTrabajador({ id: tDoc.id, ...tDoc.data() });
          } else {
            setTrabajador(null);
          }
        }
      } catch {
        setUser(null); setEmpresaId(null); setTrabajador(null);
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
