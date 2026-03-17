// ============================================================
// FLEETCORE — APP SELECTOR CON GATES DE PLAN
// src/pages/AppSelector.jsx
//
// Drop-in replacement del AppSelector original.
// Ahora verifica TANTO el rol del usuario COMO el plan activo.
// ============================================================

import React, { useState, useEffect } from "react";
import SuperAdminPanel from "./SuperAdminPanel.jsx";
import InviteUserPanel from "./InviteUserPanel.jsx";
import { useNavigate } from 'react-router-dom';
import { doc, getDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { usePlan } from "../hooks/usePlan";
import { getPlan, formatPrice } from "../lib/plans";

export default function AppSelector({ user, onLogout, onSelectApp }) {
  const [userRole,    setUserRole]    = useState(null);
  const [empresaId,   setEmpresaId]   = useState(null);
  const [showSuperAdmin, setShowSuperAdmin] = useState(false);
  const [showInvite,      setShowInvite]      = useState(false);
  const [loading,  setLoading]  = useState(true);
  const { canAccess, planData, isActive, status, loading: planLoading } = usePlan();
  const navigate = useNavigate();

  const [userModulos, setUserModulos] = useState([]);
  const [userCargo,   setUserCargo]   = useState('');

  useEffect(() => {
    const loadUser = async () => {
      if (!user) return;
      try {
        const snap = await getDoc(doc(db, 'users', user.uid));
        const data = snap.exists() ? snap.data() : {};
        const role    = data.role    || 'operador';
        const modulos = data.modulos || [];
        const cargo   = data.cargo   || '';
        setUserRole(role);
        setUserModulos(modulos);
        setUserCargo(cargo);

        // Redirección automática según rol
        if (role === 'mandante') {
          localStorage.setItem('selectedApp', 'workfleet');
          onSelectApp('workfleet');
          return;
        }
        if (role === 'operador') {
          localStorage.setItem('selectedApp', 'workfleet-m');
          onSelectApp('workfleet-m');
          return;
        }
        if (role === 'trabajador') {
          window.location.href = '/trabajador';
          return;
        }
      } catch {
        setUserRole('operador');
      } finally {
        setLoading(false);
      }
    };
    loadUser();
  }, [user, onSelectApp]);

  // ── Helpers de permisos ──────────────────────────────────────
  const isSuperAdmin    = userRole === 'superadmin';
  const isAdminContrato = userRole === 'admin_contrato';
  const hasModulo = (m) => isSuperAdmin || userModulos.includes(m);

  // Permisos combinados: rol + módulo + plan
  // admin_contrato: solo WorkFleet (reportes) + WorkFleet-M
  const canAccessFleetCore  = (isSuperAdmin || (userRole === 'administrativo' && hasModulo('fleetcore')))  && canAccess('fleetcore');
  const canAccessWorkFleet  = isSuperAdmin || isAdminContrato;
  const canAccessRRHH       = (isSuperAdmin || (userRole === 'administrativo' && hasModulo('rrhh')))       && canAccess('rrhh');
  const canAccessReportes   = (isSuperAdmin || isAdminContrato || (userRole === 'administrativo' && hasModulo('reportes'))) && canAccess('reportes');
  const canAccessFinanzas   = (isSuperAdmin || (userRole === 'administrativo' && hasModulo('finanzas')))   && canAccess('finanzas');
  const canAccessWorkFleetM = isSuperAdmin || isAdminContrato || userRole === 'operador' || userRole === 'administrativo';

  // Razón de bloqueo para mostrar el mensaje correcto
  const blockReason = (moduleId, roleOk) => {
    if (!roleOk) return 'role';
    if (!canAccess(moduleId)) return 'plan';
    return null;
  };

  const handleSelect = (appId, hasAccess) => {
    if (!hasAccess) return;
    localStorage.setItem('selectedApp', appId);
    onSelectApp(appId);
  };

  if (loading || planLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center">
        <div className="text-white text-xl">Cargando...</div>
      </div>
    );
  }

  return (
    <>
    {showSuperAdmin && <SuperAdminPanel onClose={() => setShowSuperAdmin(false)} />}
    {showInvite && <InviteUserPanel empresaId={empresaId} onClose={() => setShowInvite(false)} />}
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center px-3 py-4 sm:p-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-grid opacity-10 pointer-events-none" />
      <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-blue-500/20 rounded-full blur-3xl" />
      <div className="absolute bottom-0 left-0 w-[800px] h-[800px] bg-purple-500/20 rounded-full blur-3xl" />

      <div className="relative w-full max-w-6xl">
        {/* Header */}
        <div className="text-center mb-5 sm:mb-8 animate-fadeInUp">

          {/* Banner de plan activo */}
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 backdrop-blur-sm rounded-2xl border border-white/20 mb-4">
            <span className="text-xs font-bold text-blue-200 uppercase tracking-wider">Plan</span>
            <span className="text-sm font-black text-white">{planData.name}</span>
            {status === 'trial' && (
              <span className="px-2 py-0.5 bg-amber-400/20 text-amber-300 text-xs font-bold rounded-full">Trial</span>
            )}
            {!isActive && (
              <span className="px-2 py-0.5 bg-red-400/20 text-red-300 text-xs font-bold rounded-full">Inactivo</span>
            )}
            <button
              onClick={() => { localStorage.setItem('selectedApp', 'pricing'); onSelectApp('pricing'); }}
              className="ml-1 text-xs text-blue-300 underline hover:text-white transition-colors"
            >
              {isActive ? 'Cambiar plan' : 'Activar plan'}
            </button>
          </div>

          <div className="inline-flex items-center gap-2 sm:gap-3 px-3 sm:px-6 py-2 sm:py-3 bg-white/10 backdrop-blur-sm rounded-2xl border border-white/20 mb-4 sm:mb-6">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-blue-700 flex items-center justify-center shadow-lg">
              <span className="text-white text-sm font-bold">
                {user?.email?.[0]?.toUpperCase() || "U"}
              </span>
            </div>
            <div className="text-left">
              <div className="text-sm font-semibold text-white">{user?.displayName || user?.email?.split('@')[0]}</div>
              <div className="text-xs text-blue-200">{user?.email}</div>
            </div>
            {userRole === 'superadmin' && (
            <button
              onClick={() => setShowSuperAdmin(true)}
              className="ml-2 flex items-center gap-1.5 px-3 py-1.5 bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-400/30 rounded-xl text-xs font-black text-indigo-200 hover:text-white transition-all"
              title="Panel de administración"
            >
              🛡️ Admin
            </button>
          )}
          {(userRole === 'admin_contrato' || userRole === 'superadmin') && (
            <button
              onClick={() => setShowInvite(true)}
              className="ml-2 flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/30 rounded-xl text-xs font-black text-emerald-200 hover:text-white transition-all"
              title="Invitar usuarios"
            >
              👥 Invitar
            </button>
          )}
          <button onClick={onLogout} className="ml-4 p-2 hover:bg-white/10 rounded-lg transition-colors" title="Cerrar sesión">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </div>

          <h1 className="text-2xl sm:text-4xl lg:text-6xl font-black text-white mb-2 sm:mb-4 tracking-tight">
            Selecciona tu aplicación
          </h1>
          <p className="text-sm sm:text-lg text-blue-200 font-medium">
            Elige la herramienta que necesitas
          </p>
        </div>

        {/* Grid de cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 lg:gap-8">
          <AppCard
            onClick={() => handleSelect('fleetcore', canAccessFleetCore)}
            canAccess={canAccessFleetCore}
            blockReason={blockReason('fleetcore', isSuperAdmin || (userRole === 'administrativo' && hasModulo('fleetcore')))}
            requiredPlan="starter"
            glowColor="from-orange-500 to-orange-700"
            borderColor="border-orange-200 hover:border-orange-400"
            logoSrc="/logo-workfleet.png"
            logoAlt="WorkFleet"
            buttonClass="from-orange-900 to-orange-700 hover:from-orange-800 hover:to-orange-600"
            buttonLabel="Abrir Oficina Técnica"
            badgeClass="bg-orange-100 text-orange-700"
            badgeLabel="Oficina Técnica"
            features={[
              { icon: "📊", text: "Dashboard y reportes" },
              { icon: "🚜", text: "Gestión de equipos" },
              { icon: "📅", text: "Calendario y logs" },
              { icon: "⛽", text: "Control de combustible" },
              { icon: "💰", text: "Remuneraciones y costos" },
              { icon: "📑", text: "Órdenes de compra" },
            ]}
            onUpgrade={() => { localStorage.setItem('selectedApp', 'pricing'); onSelectApp('pricing'); }}
          />

          <AppCard
            onClick={() => handleSelect('rrhh', canAccessRRHH)}
            canAccess={canAccessRRHH}
            blockReason={blockReason('rrhh', isSuperAdmin || (userRole === 'administrativo' && hasModulo('rrhh')))}
            requiredPlan="pro"
            glowColor="from-emerald-500 to-green-700"
            borderColor="border-emerald-200 hover:border-emerald-400"
            logoSrc="/logo-fleetcore-r.png"
            logoAlt="FleetCore RRHH"
            buttonClass="from-emerald-900 to-green-700 hover:from-emerald-800 hover:to-green-600"
            buttonLabel="Abrir RRHH"
            badgeClass="bg-emerald-100 text-emerald-700"
            badgeLabel="Recursos Humanos"
            features={[
              { icon: "👥", text: "Gestión de trabajadores" },
              { icon: "📄", text: "Contratos y anexos" },
              { icon: "💰", text: "Remuneraciones y nómina" },
              { icon: "🏛️", text: "Impuestos y previred" },
              { icon: "📅", text: "Asistencia y organización" },
              { icon: "📊", text: "Reportes y contabilidad" },
            ]}
            onUpgrade={() => { localStorage.setItem('selectedApp', 'pricing'); onSelectApp('pricing'); }}
          />

          <AppCard
            onClick={() => handleSelect('reportes', canAccessReportes)}
            canAccess={canAccessReportes}
            blockReason={blockReason('reportes', isSuperAdmin || isAdminContrato || (userRole === 'administrativo' && hasModulo('reportes')))}
            requiredPlan="pro"
            glowColor="from-red-600 to-orange-700"
            borderColor="border-red-200 hover:border-red-400"
            logoSrc="/wf-logo-movil.svg"
            logoAlt="Reportes"
            buttonClass="from-red-900 to-red-700 hover:from-red-800 hover:to-red-600"
            buttonLabel="Abrir Reportes"
            badgeClass="bg-red-100 text-red-700"
            badgeLabel="Finanzas / Reportes"
            features={[
              { icon: "📊", text: "Reporte de maquinaria" },
              { icon: "⛽", text: "Reporte de combustible" },
              { icon: "📈", text: "Análisis de producción" },
              { icon: "🔍", text: "Detalle por equipo" },
              { icon: "📅", text: "Histórico por período" },
              { icon: "⚙️", text: "Panel de administración" },
            ]}
            onUpgrade={() => { localStorage.setItem('selectedApp', 'pricing'); onSelectApp('pricing'); }}
          />

          <AppCard
            onClick={() => handleSelect('finanzas', canAccessFinanzas)}
            canAccess={canAccessFinanzas}
            blockReason={blockReason('finanzas', isSuperAdmin || (userRole === 'administrativo' && hasModulo('finanzas')))}
            requiredPlan="enterprise"
            glowColor="from-purple-600 to-violet-700"
            borderColor="border-purple-200 hover:border-purple-400"
            logoSrc="/logo-fleetcore-f.png"
            logoAlt="FleetCore Finanzas"
            buttonClass="from-purple-900 to-violet-700 hover:from-purple-800 hover:to-violet-600"
            buttonLabel="Abrir Finanzas"
            badgeClass="bg-purple-100 text-purple-700"
            badgeLabel="Finanzas"
            features={[
              { icon: "💵", text: "Flujo de caja real y proyectado" },
              { icon: "📦", text: "Costos fijos y variables" },
              { icon: "🏗️", text: "Gestión de activos" },
              { icon: "🤝", text: "Proveedores y cuentas por pagar" },
              { icon: "🏦", text: "Créditos y obligaciones" },
              { icon: "📈", text: "Reportes y análisis financiero" },
            ]}
            onUpgrade={() => { localStorage.setItem('selectedApp', 'pricing'); onSelectApp('pricing'); }}
          />
        </div>


        {/* ── Aplicaciones Móviles ── */}
        <div className="mt-10 mb-4">
          <div className="flex items-center gap-3 mb-6">
            <div className="h-px flex-1 bg-white/20" />
            <span className="text-white/60 text-xs font-bold uppercase tracking-widest px-2">Aplicaciones Móviles</span>
            <div className="h-px flex-1 bg-white/20" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl mx-auto">
            <AppCard
              onClick={() => handleSelect('workfleet-m', canAccessWorkFleetM)}
              canAccess={canAccessWorkFleetM}
              blockReason={null}
              requiredPlan="starter"
              glowColor="from-cyan-500/30 to-blue-500/30"
              borderColor="border-cyan-400/40"
              logoSrc="/wf-logo.svg"
              logoAlt="WorkFleet Mobile"
              badgeClass="bg-cyan-500/20 text-cyan-300 border border-cyan-400/30"
              badgeLabel="Operadores"
              features={[
                { icon: "🚜", text: "Reporte de maquinaria" },
                { icon: "⛽", text: "Reporte de combustible" },
                { icon: "📱", text: "Optimizado para móvil" },
              ]}
              buttonClass="from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500"
              buttonLabel="Abrir WorkFleet-M"
              onUpgrade={() => {}}
            />
            <AppCard
              onClick={() => { window.location.href = '/trabajador'; }}
              canAccess={true}
              blockReason={null}
              requiredPlan="starter"
              glowColor="from-emerald-500/30 to-teal-500/30"
              borderColor="border-emerald-400/40"
              logoSrc="/logo-fleetcore-r.png"
              logoAlt="Portal Trabajadores"
              badgeClass="bg-emerald-500/20 text-emerald-300 border border-emerald-400/30"
              badgeLabel="Trabajadores"
              features={[
                { icon: "💰", text: "Mis remuneraciones" },
                { icon: "📄", text: "Contratos y documentos" },
                { icon: "📅", text: "Asistencia y permisos" },
              ]}
              buttonClass="from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500"
              buttonLabel="Abrir Portal"
              onUpgrade={() => {}}
            />
          </div>
        </div>

        <div className="mt-8 text-center text-blue-200 text-sm">
          <p>Puedes cambiar de aplicación en cualquier momento desde el menú de usuario</p>
        </div>
      </div>
    </div>
    </>
  );
}

// ── AppCard con lógica de bloqueo por plan ─────────────────────

function AppCard({ onClick, canAccess, blockReason, requiredPlan, glowColor, borderColor,
  logoSrc, logoAlt, buttonClass, buttonLabel, badgeClass, badgeLabel, features, onUpgrade }) {

  const planNames = { starter: 'Starter', pro: 'Pro', enterprise: 'Enterprise' };

  return (
    <div onClick={canAccess ? onClick : undefined} className={`group relative ${canAccess ? 'cursor-pointer' : 'cursor-not-allowed'} animate-fadeInUp`}>
      <div className={`absolute inset-0 bg-gradient-to-br ${glowColor} rounded-3xl blur-xl transition-opacity ${canAccess ? 'opacity-50 group-hover:opacity-75' : 'opacity-20'}`} />

      <div className={`relative bg-white rounded-3xl p-5 sm:p-8 shadow-2xl border-2 transition-all ${canAccess ? `${borderColor} sm:group-hover:scale-105 sm:group-hover:-translate-y-2` : 'border-slate-300 opacity-70'}`}>

        {/* Overlay de bloqueo */}
        {!canAccess && (
          <div className="absolute inset-0 bg-white/80 backdrop-blur-[2px] rounded-3xl flex items-center justify-center z-10">
            <div className="text-center px-6">
              {blockReason === 'plan' ? (
                <>
                  <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-blue-600 flex items-center justify-center shadow-xl">
                    <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                    </svg>
                  </div>
                  <div className="text-sm font-black text-slate-800 mb-1">Requiere plan {planNames[requiredPlan]}</div>
                  <div className="text-xs text-slate-500 mb-3">Actualiza tu plan para desbloquear este módulo</div>
                  <button
                    onClick={(e) => { e.stopPropagation(); onUpgrade(); }}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-colors shadow-md"
                  >
                    Ver planes →
                  </button>
                </>
              ) : (
                <>
                  <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-slate-700 flex items-center justify-center shadow-xl">
                    <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </div>
                  <div className="text-sm font-bold text-slate-700">Acceso Restringido</div>
                  <div className="text-xs text-slate-500 mt-1">Contacta al administrador</div>
                </>
              )}
            </div>
          </div>
        )}

        <div className="mx-auto mb-4 sm:mb-6 flex items-center justify-center">
          <img src={logoSrc} alt={logoAlt} className="h-24 sm:h-32 w-auto object-contain drop-shadow-xl" />
        </div>

        <ul className="space-y-2 sm:space-y-3 mb-5 sm:mb-8">
          {features.map((f, i) => (
            <li key={i} className="flex items-center gap-2 sm:gap-3 text-slate-700">
              <span className="text-xl">{f.icon}</span>
              <span className="font-medium text-sm sm:text-base">{f.text}</span>
            </li>
          ))}
        </ul>

        <button className={`w-full py-3.5 sm:py-4 bg-gradient-to-r ${buttonClass} text-white font-bold rounded-xl shadow-lg hover:shadow-xl transition-all flex items-center justify-center gap-2`}>
          <span>{buttonLabel}</span>
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
        </button>

        <div className="mt-4 text-center">
          <span className={`inline-flex items-center gap-1 px-3 py-1 ${badgeClass} text-xs font-semibold rounded-full`}>
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            {badgeLabel}
          </span>
        </div>
      </div>
    </div>
  );
}