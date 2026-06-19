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
import { doc, getDoc, collection, query, orderBy, onSnapshot, where } from 'firebase/firestore';
import { db } from './firebase';

// ─── Contexto ─────────────────────────────────────────────────
const EmpresaContext = createContext(null);

// ─── Provider ─────────────────────────────────────────────────
export function EmpresaProvider({ user, children }) {
  const [empresaId, setEmpresaId] = useState(null);
  const [empresa, setEmpresa] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [subEmpresas, setSubEmpresas] = useState([]);
  const [subEmpresasLoading, setSubEmpresasLoading] = useState(true);

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
          setLoading(false);
          return;
        }

        const userData = userSnap.data();

        // superadmin usa su propio empresaId (si tiene) o el primero disponible
        if (userData.role === 'superadmin') {
          const eid = userData.empresaId?.trim() || null;
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

        const eid = userData.empresaId?.trim(); // ✅ FIX: trim() elimina espacios accidentales
        if (!eid) {
          setError('Este usuario no tiene empresa asignada. Contacta al administrador.');
          setLoading(false);
          return;
        }

        // 2. Leer datos de la empresa
        // ✅ FIX: aunque el documento raíz no exista, el empresaId es válido
        // (puede tener subcolecciones sin documento raíz)
        const empresaSnap = await getDoc(doc(db, 'empresas', eid));
        setEmpresaId(eid);
        setEmpresa({ id: eid, ...(empresaSnap.exists() ? empresaSnap.data() : { nombre: 'Empresa' }) });
      } catch (err) {
        console.error('Error cargando empresa:', err);
        setError('Error al cargar datos de empresa.');
      } finally {
        setLoading(false);
      }
    };

    loadEmpresa();
  }, [user]);

  // Listener en tiempo real para sub_empresas
  useEffect(() => {
    if (!empresaId) {
      setSubEmpresas([]);
      setSubEmpresasLoading(false);
      return;
    }

    setSubEmpresasLoading(true);
    const q = query(
      collection(db, 'empresas'),
      where('parentEmpresaId', '==', empresaId),
      orderBy('nombre')
    );
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setSubEmpresas(list);
      setSubEmpresasLoading(false);
    }, (err) => {
      console.error('Error cargando sub_empresas:', err);
      setSubEmpresasLoading(false);
    });

    return () => unsub();
  }, [empresaId]);

  // Fallbacks para asegurar compatibilidad y correcto onboarding
  const getActiveSubEmpresas = () => {
    if (subEmpresas.length > 0) {
      return subEmpresas;
    }
    // Si la subcolección está vacía, hacemos fallback
    // Para el tenant original 'mpf-maquinaria' (o si el ID contiene 'mpf'), usamos las originales:
    if (empresaId === 'mpf-maquinaria' || empresaId?.includes('mpf') || !empresaId) {
      return ['LifeMed', 'Intosim', 'Río Tinto', 'Global', 'Celenor', 'MPF Ingeniería Civil'].map(n => ({ id: n, nombre: n }));
    }
    // Para otros, usamos la empresa del tenant como predeterminada
    return [{ id: 'default', nombre: empresa?.nombre || 'Empresa Principal' }];
  };

  const activeSubEmpresas = getActiveSubEmpresas();
  const subEmpresasNames = activeSubEmpresas.map(se => se.nombre);

  return (
    <EmpresaContext.Provider value={{
      empresaId,
      empresa,
      loading,
      subEmpresasLoading,
      error,
      subEmpresas: activeSubEmpresas,
      subEmpresasNames
    }}>
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
