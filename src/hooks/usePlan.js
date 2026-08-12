// ============================================================
// FLEETCORE — HOOK CENTRAL DE PLAN
// src/hooks/usePlan.js
// ============================================================

import { useState, useEffect } from 'react';
import { doc, onSnapshot, collection, query, where, getDoc, getDocs, limit } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import {
  getPlan,
  canAccessModule,
  hasFeature as checkFeature,
  MODULES,
} from '../lib/plans';

// En desarrollo con VITE_DEV_BYPASS=true → todos los módulos activos
const DEV_SUBSCRIPTION = { planId: 'rrhh,finanzas,fleetcore,workfleet', status: 'authorized' };
const IS_DEV_BYPASS     = import.meta.env.VITE_DEV_BYPASS === 'true';

export function usePlan() {
  const [subscription, setSubscription] = useState(null);
  const [loading, setLoading]           = useState(true);
  const [user, setUser]                 = useState(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (!u) { setSubscription(null); setLoading(false); }
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!user) return;

    // Modo desarrollo: saltar Firestore y activar todo
    if (IS_DEV_BYPASS) {
      setSubscription(DEV_SUBSCRIPTION);
      setLoading(false);
      return;
    }

    // 1. Escuchar el documento del usuario para obtener el empresaId
    const userRef = doc(db, 'users', user.uid);
    let unsubSubscription = null;

    const unsubUser = onSnapshot(userRef, (userSnap) => {
      if (unsubSubscription) {
        unsubSubscription();
        unsubSubscription = null;
      }

      if (!userSnap.exists()) {
        setSubscription({ planId: '', status: 'trial', trialUntil: null });
        setLoading(false);
        return;
      }

      const userData = userSnap.data();
      const empresaId = userData.empresaId;

      if (!empresaId) {
        // Fallback si no tiene empresaId (por ejemplo, durante EmpresaSetup)
        const subRef = doc(db, 'subscriptions', user.uid);
        unsubSubscription = onSnapshot(subRef, (subSnap) => {
          if (subSnap.exists()) {
            setSubscription(subSnap.data());
          } else {
            setSubscription({ planId: '', status: 'trial', trialUntil: null });
          }
          setLoading(false);
        }, () => {
          setSubscription({ planId: '', status: 'trial', trialUntil: null });
          setLoading(false);
        });
        return;
      }

      // 2. Escuchar la suscripción directamente por empresaId (doc ID)
      const subRef = doc(db, 'subscriptions', empresaId);
      unsubSubscription = onSnapshot(subRef, async (subSnap) => {
        if (subSnap.exists()) {
          setSubscription(subSnap.data());
          setLoading(false);
        } else {
          // Fallback 1: query por campo empresaId (cuando el doc fue creado con UID del admin)
          try {
            const q = query(collection(db, 'subscriptions'), where('empresaId', '==', empresaId), limit(1));
            const qSnap = await getDocs(q);
            if (!qSnap.empty) {
              setSubscription(qSnap.docs[0].data());
              setLoading(false);
              return;
            }
          } catch { /* ignorar errores de permisos */ }

          // Fallback 2: subscriptions/{user.uid}
          const fallbackRef = doc(db, 'subscriptions', user.uid);
          getDoc(fallbackRef).then((fallbackSnap) => {
            if (fallbackSnap.exists()) {
              setSubscription(fallbackSnap.data());
            } else {
              setSubscription({ planId: '', status: 'trial', trialUntil: null });
            }
            setLoading(false);
          }).catch(() => {
            setSubscription({ planId: '', status: 'trial', trialUntil: null });
            setLoading(false);
          });
        }
      }, (err) => {
        console.error('Error escuchando suscripción directa de empresa:', err);
        setSubscription({ planId: '', status: 'trial', trialUntil: null });
        setLoading(false);
      });
    }, (err) => {
      console.error('Error escuchando usuario en usePlan:', err);
      setSubscription({ planId: '', status: 'trial', trialUntil: null });
      setLoading(false);
    });

    return () => {
      unsubUser();
      if (unsubSubscription) unsubSubscription();
    };
  }, [user]);

  // ── Estado derivado ─────────────────────────────────────

  const planId        = subscription?.planId || '';
  const status        = subscription?.status || 'trial';
  const planData      = getPlan(planId);
  const activeModules = planId ? planId.split(',').filter(Boolean) : [];

  const isActive = (() => {
    if (status === 'authorized') return true;
    if (status === 'trial') {
      if (!subscription?.trialUntil) return true;
      return new Date() < new Date(subscription.trialUntil);
    }
    return false;
  })();

  // Finanzas is always free and active if the subscription is active
  if (isActive && !activeModules.includes('finanzas')) {
    activeModules.push('finanzas');
  }

  const canAccess = (moduleId) => {
    if (!isActive) return false;
    return canAccessModule(planId, moduleId);
  };

  const hasFeature = (featureId) => {
    if (!isActive) return false;
    return checkFeature(planId, featureId);
  };

  const planName = activeModules.length === 0
    ? 'Sin plan'
    : activeModules.map(id => MODULES[id]?.name || id).join(' + ');

  return {
    subscription,
    planId,
    planData,
    planName,
    activeModules,
    status,
    isActive,
    loading,
    user,
    canAccess,
    hasFeature,
    isTrial:     status === 'trial',
    isCancelled: status === 'cancelled' || status === 'paused',
    isDevBypass: IS_DEV_BYPASS,
  };
}
