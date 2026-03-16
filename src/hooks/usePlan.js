// ============================================================
// FLEETCORE — HOOK CENTRAL DE PLAN
// src/hooks/usePlan.js
// ============================================================

import { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
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

    const ref   = doc(db, 'subscriptions', user.uid);
    const unsub = onSnapshot(ref, (snap) => {
      if (snap.exists()) {
        setSubscription(snap.data());
      } else {
        setSubscription({ planId: '', status: 'trial', trialUntil: null });
      }
      setLoading(false);
    }, (err) => {
      console.error('Error cargando suscripción:', err);
      setSubscription({ planId: '', status: 'trial' });
      setLoading(false);
    });
    return unsub;
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
