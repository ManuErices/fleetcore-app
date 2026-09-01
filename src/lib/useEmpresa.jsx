/**
 * useEmpresa.jsx — Contexto multi-tenant con soporte multiempresa
 *
 * Un mismo usuario puede pertenecer a varias empresas y moverse entre ellas
 * sin cerrar sesión ni tener cuentas duplicadas.
 *
 * Estructura Firestore:
 *   /users/{uid}
 *     empresaId:   "abc123"          ← empresa ACTIVA
 *     empresasIds: ["abc123","def"]  ← membresías (solo un admin la modifica)
 *     role:        "admin_contrato"  ← mismo rol en todas sus empresas
 *     modulos:     [...]
 *
 *   /empresas/{empresaId}
 *     nombre, plan, adminUid, creadoEn…
 *
 * Cómo funciona el cambio de empresa:
 *   Se escribe `empresaId` en /users/{uid}. Este provider y App.jsx escuchan
 *   ese documento con onSnapshot, así que toda la app se actualiza sola. No
 *   hace falta recargar la página ni tocar los componentes que consumen el
 *   hook: siguen pidiendo `empresaId` como siempre.
 *
 * Seguridad:
 *   Las reglas solo permiten mover `empresaId` a un valor que ya esté en
 *   `empresasIds`, y el usuario no puede editar esa lista ni su rol.
 */

import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import {
  doc, getDoc, updateDoc, serverTimestamp,
  collection, query, orderBy, onSnapshot, where,
} from 'firebase/firestore';
import { db } from './firebase';

// ─── Contexto ─────────────────────────────────────────────────
const EmpresaContext = createContext(null);

// ─── Provider ─────────────────────────────────────────────────
export function EmpresaProvider({ user, children }) {
  const [empresaId, setEmpresaId] = useState(null);
  const [empresa, setEmpresa] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Multiempresa
  const [empresasDisponibles, setEmpresasDisponibles] = useState([]); // [{id, nombre, rut}]
  const [cambiandoEmpresa, setCambiandoEmpresa] = useState(false);

  const [subEmpresas, setSubEmpresas] = useState([]);
  const [subEmpresasLoading, setSubEmpresasLoading] = useState(true);

  // Cache de datos de empresa para no releerlos en cada cambio
  const cacheEmpresas = useRef({});

  const leerEmpresa = useCallback(async (eid) => {
    if (!eid) return null;
    if (cacheEmpresas.current[eid]) return cacheEmpresas.current[eid];
    try {
      const snap = await getDoc(doc(db, 'empresas', eid));
      // El documento raíz puede no existir aunque el empresaId sea válido
      // (hay tenants con subcolecciones y sin doc padre).
      const data = snap.exists() ? snap.data() : { nombre: 'Empresa' };
      cacheEmpresas.current[eid] = data;
      return data;
    } catch {
      return { nombre: 'Empresa' };
    }
  }, []);

  // ── Listener del documento de usuario ───────────────────────
  // Antes era un getDoc de una sola vez; por eso cambiar de empresa habría
  // exigido recargar la app. Con onSnapshot el cambio se propaga solo.
  useEffect(() => {
    if (!user) {
      setEmpresaId(null);
      setEmpresa(null);
      setEmpresasDisponibles([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const unsub = onSnapshot(
      doc(db, 'users', user.uid),
      async (userSnap) => {
        try {
          if (!userSnap.exists()) {
            setError('Usuario no encontrado en el sistema.');
            setLoading(false);
            return;
          }

          const userData = userSnap.data();
          const esSuperAdmin = userData.role === 'superadmin';

          // ── Resolver la empresa activa ──────────────────────
          let eid = userData.empresaId?.trim() || null;

          if (esSuperAdmin && !eid) {
            // Superadmin sin empresa asignada: toma la primera disponible
            const { getDocs } = await import('firebase/firestore');
            const snap = await getDocs(collection(db, 'empresas'));
            if (!snap.empty) eid = snap.docs[0].id;
          }

          if (!eid) {
            setError('Este usuario no tiene empresa asignada. Contacta al administrador.');
            setLoading(false);
            return;
          }

          const datosEmpresa = await leerEmpresa(eid);
          setEmpresaId(eid);
          setEmpresa({
            id: eid,
            ...(esSuperAdmin ? { plan: 'superadmin' } : {}),
            ...datosEmpresa,
          });

          // ── Resolver la lista de empresas del usuario ───────
          // Fallback a [empresaId] para las cuentas que aún no pasaron por
          // la migración: siguen viendo solo su empresa, sin romperse.
          let ids = Array.isArray(userData.empresasIds) && userData.empresasIds.length
            ? [...new Set(userData.empresasIds.filter(Boolean))]
            : [eid];

          if (!ids.includes(eid)) ids = [eid, ...ids];

          const lista = await Promise.all(
            ids.map(async (id) => {
              const d = await leerEmpresa(id);
              return { id, nombre: d?.nombre || 'Empresa', rut: d?.rut || '' };
            })
          );
          lista.sort((a, b) => a.nombre.localeCompare(b.nombre));
          setEmpresasDisponibles(lista);
        } catch (err) {
          console.error('Error cargando empresa:', err);
          setError('Error al cargar datos de empresa.');
        } finally {
          setLoading(false);
          setCambiandoEmpresa(false);
        }
      },
      (err) => {
        console.error('Error escuchando usuario:', err);
        setError('Error al cargar datos de empresa.');
        setLoading(false);
      }
    );

    return () => unsub();
  }, [user, leerEmpresa]);

  // ── Cambiar de empresa ──────────────────────────────────────
  // Una sola escritura: el listener de arriba y el de App.jsx hacen el resto.
  const cambiarEmpresa = useCallback(async (nuevoEmpresaId) => {
    if (!user?.uid || !nuevoEmpresaId) return { ok: false, error: 'Datos incompletos' };
    if (nuevoEmpresaId === empresaId) return { ok: true };

    const permitida = empresasDisponibles.some(e => e.id === nuevoEmpresaId);
    if (!permitida) {
      return { ok: false, error: 'No tienes acceso a esa empresa.' };
    }

    setCambiandoEmpresa(true);
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        empresaId: nuevoEmpresaId,
        empresaCambiadaEn: serverTimestamp(),
      });
      // No se toca el estado local a mano: llega por el listener, así nunca
      // queda en pantalla una empresa activa que Firestore no haya aceptado.
      return { ok: true };
    } catch (err) {
      console.error('Error cambiando de empresa:', err);
      setCambiandoEmpresa(false);
      const esPermiso = err?.code === 'permission-denied';
      return {
        ok: false,
        error: esPermiso
          ? 'No tienes permiso para acceder a esa empresa.'
          : 'No se pudo cambiar de empresa. Revisa tu conexión.',
      };
    }
  }, [user?.uid, empresaId, empresasDisponibles]);

  // ── Listener de sub-empresas de la empresa activa ───────────
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
      setSubEmpresas(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setSubEmpresasLoading(false);
    }, (err) => {
      console.error('Error cargando sub_empresas:', err);
      setSubEmpresasLoading(false);
    });

    return () => unsub();
  }, [empresaId]);

  // Fallbacks para asegurar compatibilidad y correcto onboarding
  const getActiveSubEmpresas = () => {
    if (subEmpresas.length > 0) return subEmpresas;
    if (empresaId === 'mpf-maquinaria' || empresaId?.includes('mpf') || !empresaId) {
      return ['LifeMed', 'Intosim', 'Río Tinto', 'Global', 'Celenor', 'MPF Ingeniería Civil']
        .map(n => ({ id: n, nombre: n }));
    }
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
      subEmpresasNames,
      // ── Multiempresa ──
      empresasDisponibles,
      tieneMultiEmpresa: empresasDisponibles.length > 1,
      cambiandoEmpresa,
      cambiarEmpresa,
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
