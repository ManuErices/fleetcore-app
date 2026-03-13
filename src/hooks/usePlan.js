// ============================================================
// FLEETCORE — HOOK CENTRAL DE PLAN
// src/hooks/usePlan.js
//
// USO:
//   const { plan, canAccess, hasFeature, loading } = usePlan();
//
//   // Verificar módulo completo
//   if (!canAccess('rrhh')) return <UpgradePrompt module="rrhh" />;
//
//   // Verificar feature granular
//   if (!hasFeature('reportes_combustible')) return <Locked />;
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
    const ref  = doc(db, 'subscriptions', user.uid);
    const unsub = onSnapshot(ref, (snap) => {
      if (snap.exists()) {
        setSubscription(snap.data());
      } else {
        // Sin suscripción → trial sin módulos activos
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

  // planId = módulos separados por coma: "rrhh,fleetcore,workfleet"
  const planId   = subscription?.planId || '';
  const status   = subscription?.status || 'trial';
  const planData = getPlan(planId); // { modules, features }

  // Módulos activos como array: ["rrhh", "fleetcore"]
  const activeModules = planId ? planId.split(',').filter(Boolean) : [];

  // Suscripción activa = pagada O en trial válido
  const isActive = (() => {
    if (status === 'authorized') return true;
    if (status === 'trial') {
      if (!subscription?.trialUntil) return true;
      return new Date() < new Date(subscription.trialUntil);
    }
    return false;
  })();

  // ── Funciones de verificación ───────────────────────────

  const canAccess = (moduleId) => {
    if (!isActive) return false;
    return canAccessModule(planId, moduleId);
  };

  const hasFeature = (featureId) => {
    if (!isActive) return false;
    return checkFeature(planId, featureId);
  };

  // Nombre legible de los módulos activos
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
  };
}
