/**
 * useEmpresa.js — Contexto multi-tenant
 * 
 * Lee el empresaId del usuario autenticado desde Firestore
 * y lo provee a toda la app.
 * 
 * Estructura Firestore:
 *   /users/{uid}
 *     empresaId: "abc123"
 *     role: "admin_contrato"
 *     ...
 * 
 *   /empresas/{empresaId}
 *     nombre: "Constructora MPF"
 *     plan: "pro"
 *     adminUid: "uid_del_creador"
 *     creadoEn: Timestamp
 *     ...
 */

import { createContext, useContext, useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';

// ─── Contexto ─────────────────────────────────────────────────
const EmpresaContext = createContext(null);

// ─── Provider ─────────────────────────────────────────────────
export function EmpresaProvider({ user, children }) {
  const [empresaId,   setEmpresaId]   = useState(null);
  const [empresa,     setEmpresa]     = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState(null);

  useEffect(() => {
    if (!user) {
      setEmpresaId(null);
      setEmpresa(null);
      setLoading(false);
      return;
    }

    const loadEmpresa = async () => {
      setLoading(true);
      setError(null);
      try {
        // 1. Leer empresaId del usuario
        const userSnap = await getDoc(doc(db, 'users', user.uid));
        if (!userSnap.exists()) {
          setError('Usuario no encontrado en el sistema.');
          return;
        }

        const userData = userSnap.data();

        // superadmin usa su propio empresaId (si tiene) o el primero disponible
        if (userData.role === 'superadmin') {
          const eid = userData.empresaId || null;
          if (eid) {
            const empresaSnap = await getDoc(doc(db, 'empresas', eid));
            setEmpresaId(eid);
            setEmpresa({ id: eid, plan: 'superadmin', ...(empresaSnap.exists() ? empresaSnap.data() : { nombre: 'Super Admin' }) });
          } else {
            // Sin empresaId asignado — buscar la primera empresa disponible
            const { getDocs, collection } = await import('firebase/firestore');
            const snap = await getDocs(collection(db, 'empresas'));
            if (!snap.empty) {
              const first = snap.docs[0];
              setEmpresaId(first.id);
              setEmpresa({ id: first.id, plan: 'superadmin', ...first.data() });
            }
          }
          return;
        }

        const eid = userData.empresaId;
        if (!eid) {
          setError('Este usuario no tiene empresa asignada. Contacta al administrador.');
          return;
        }

        // 2. Leer datos de la empresa
        const empresaSnap = await getDoc(doc(db, 'empresas', eid));
        if (!empresaSnap.exists()) {
          setError('Empresa no encontrada. Contacta al soporte.');
          return;
        }

        setEmpresaId(eid);
        setEmpresa({ id: eid, ...empresaSnap.data() });
      } catch (err) {
        console.error('Error cargando empresa:', err);
        setError('Error al cargar datos de empresa.');
      } finally {
        setLoading(false);
      }
    };

    loadEmpresa();
  }, [user]);

  return (
    <EmpresaContext.Provider value={{ empresaId, empresa, loading, error }}>
      {children}
    </EmpresaContext.Provider>
  );
}

// ─── Hook ──────────────────────────────────────────────────────
export function useEmpresa() {
  const ctx = useContext(EmpresaContext);
  if (!ctx) throw new Error('useEmpresa debe usarse dentro de <EmpresaProvider>');
  return ctx;
}

// ─── Helper para queries en db.js ─────────────────────────────
// Uso: const { empresaId } = useEmpresa();
//      listMachines(empresaId, projectId)
