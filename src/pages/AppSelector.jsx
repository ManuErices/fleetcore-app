import React, { useState, useEffect } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../lib/firebase";

export default function AppSelector({ user, onLogout, onSelectApp }) {
  const [userRole, setUserRole] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadUserRole = async () => {
      if (!user) return;
      try {
        const userDocRef = doc(db, "users", user.uid);
        const userDoc = await getDoc(userDocRef);
        if (userDoc.exists()) {
          const userData = userDoc.data();
          const role = userData.role || 'operador';
          setUserRole(role);
          console.log("✅ Rol de usuario cargado:", role);
          if (role === 'operador') {
            console.log("🔄 Operador detectado - Redirigiendo a WorkFleet...");
            localStorage.setItem('selectedApp', 'workfleet');
            onSelectApp('workfleet');
            return;
          }
        } else {
          setUserRole('operador');
          localStorage.setItem('selectedApp', 'workfleet');
          onSelectApp('workfleet');
          return;
        }
      } catch (error) {
        console.error("Error cargando rol de usuario:", error);
        setUserRole('operador');
        localStorage.setItem('selectedApp', 'workfleet');
        onSelectApp('workfleet');
        return;
      } finally {
        setLoading(false);
      }
    };
    loadUserRole();
  }, [user, onSelectApp]);

  const canAccessFleetCore = userRole === 'administrador' || userRole === 'administrativo';
  const canAccessWorkFleet = userRole === 'administrador' || userRole === 'operador';
  const canAccessRRHH      = userRole === 'administrador' || userRole === 'administrativo';
  const canAccessReportes  = userRole === 'administrador' || userRole === 'administrativo';

  const handleSelectFleetCore = () => {
    if (!canAccessFleetCore) { alert('🔒 No tienes permisos para acceder a FleetCore'); return; }
    localStorage.setItem('selectedApp', 'fleetcore');
    onSelectApp('fleetcore');
  };
  const handleSelectWorkFleet = () => {
    if (!canAccessWorkFleet) { alert('🔒 No tienes permisos para acceder a WorkFleet'); return; }
    localStorage.setItem('selectedApp', 'workfleet');
    onSelectApp('workfleet');
  };
  const handleSelectRRHH = () => {
    if (!canAccessRRHH) { alert('🔒 No tienes permisos para acceder a FleetCore RRHH'); return; }
    localStorage.setItem('selectedApp', 'rrhh');
    onSelectApp('rrhh');
  };
  const canAccessFinanzas = userRole === 'administrador' || userRole === 'finanzas';

  const handleSelectFinanzas = () => {
    if (!canAccessFinanzas) { alert('🔒 No tienes permisos para acceder a Finanzas'); return; }
    localStorage.setItem('selectedApp', 'finanzas');
    onSelectApp('finanzas');
  };

  const handleSelectReportes = () => {
    if (!canAccessReportes) { alert('🔒 No tienes permisos para acceder a Reportes'); return; }
    localStorage.setItem('selectedApp', 'reportes');
    onSelectApp('reportes');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center">
        <div className="text-white text-xl">Cargando...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center px-3 py-4 sm:p-4 relative overflow-hidden">
      {/* Background decorativo */}
      <div className="absolute inset-0 bg-grid opacity-10 pointer-events-none" />
      <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-blue-500/20 rounded-full blur-3xl" />
      <div className="absolute bottom-0 left-0 w-[800px] h-[800px] bg-purple-500/20 rounded-full blur-3xl" />

      <div className="relative w-full max-w-6xl">
        {/* Header */}
        <div className="text-center mb-5 sm:mb-8 animate-fadeInUp">
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
            <button
              onClick={onLogout}
              className="ml-4 p-2 hover:bg-white/10 rounded-lg transition-colors"
              title="Cerrar sesión"
            >
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </div>

          <h1 className="text-2xl sm:text-4xl lg:text-6xl font-black text-white mb-2 sm:mb-4 tracking-tight">
            Selecciona tu aplicación
          </h1>
          <p className="text-sm sm:text-lg text-blue-200 font-medium">
            Elige la herramienta que necesitas para tu trabajo
          </p>
        </div>

        {/* Grid de cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 lg:gap-8">

          {/* WorkFleet / Oficina Técnica – Naranja (primera posición, redirige a fleetcore) */}
          <AppCard
            onClick={handleSelectFleetCore}
            canAccess={canAccessFleetCore}
            glowColor="from-orange-500 to-orange-700"
            borderColor="border-orange-200 hover:border-orange-400"
            logoSrc="/logo-workfleet.png"
            logoAlt="WorkFleet"
            buttonClass="from-orange-900 to-orange-700 hover:from-orange-800 hover:to-orange-600 active:from-orange-950 active:to-orange-800"
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
          />

          {/* FleetCore-R RRHH – Verde */}
          <AppCard
            onClick={handleSelectRRHH}
            canAccess={canAccessRRHH}
            glowColor="from-emerald-500 to-green-700"
            borderColor="border-emerald-200 hover:border-emerald-400"
            logoSrc="/logo-fleetcore-r.png"
            logoAlt="FleetCore RRHH"
            buttonClass="from-emerald-900 to-green-700 hover:from-emerald-800 hover:to-green-600 active:from-emerald-950 active:to-green-800"
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
          />

          {/* FleetCore-F Finanzas – Rojo/Naranja (colores del logo WorkFleet) */}
          <AppCard
            onClick={handleSelectReportes}
            canAccess={canAccessReportes}
            glowColor="from-red-600 to-orange-700"
            borderColor="border-red-200 hover:border-red-400"
            logoSrc="/wf-logo-movil.svg"
            logoAlt="WorkFleet Finanzas"
            buttonClass="from-red-900 to-red-700 hover:from-red-800 hover:to-red-600 active:from-red-950 active:to-red-800"
            buttonLabel="Abrir Finanzas"
            badgeClass="bg-red-100 text-red-700"
            badgeLabel="Finanzas"
            features={[
              { icon: "📊", text: "Reporte de maquinaria" },
              { icon: "⛽", text: "Reporte de combustible" },
              { icon: "📈", text: "Análisis de producción" },
              { icon: "🔍", text: "Detalle por equipo" },
              { icon: "📅", text: "Histórico por período" },
              { icon: "⚙️", text: "Panel de administración" },
            ]}
          />
          {/* FleetCore-F Finanzas – Morado */}
          <AppCard
            onClick={handleSelectFinanzas}
            canAccess={canAccessFinanzas}
            glowColor="from-purple-600 to-violet-700"
            borderColor="border-purple-200 hover:border-purple-400"
            logoSrc="/logo-fleetcore-f.png"
            logoAlt="FleetCore Finanzas"
            buttonClass="from-purple-900 to-violet-700 hover:from-purple-800 hover:to-violet-600 active:from-purple-950 active:to-violet-800"
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
          />

        </div>

        {/* Footer */}
        <div className="mt-8 text-center text-blue-200 text-sm animate-fadeInUp stagger-3">
          <p>Puedes cambiar de aplicación en cualquier momento desde el menú de usuario</p>
        </div>
      </div>
    </div>
  );
}

// ── Card reutilizable ─────────────────────────────────────────────────────────
function AppCard({
  onClick, canAccess,
  glowColor, borderColor,
  logoSrc, logoAlt,
  buttonClass, buttonLabel,
  badgeClass, badgeLabel,
  features,
}) {
  return (
    <div
      onClick={onClick}
      className={`group relative ${canAccess ? 'cursor-pointer' : 'cursor-not-allowed'} animate-fadeInUp`}
    >
      {/* Glow */}
      <div className={`absolute inset-0 bg-gradient-to-br ${glowColor} rounded-3xl blur-xl transition-opacity ${canAccess ? 'opacity-50 group-hover:opacity-75' : 'opacity-20'}`} />

      {/* Card */}
      <div className={`relative bg-white rounded-3xl p-5 sm:p-8 lg:p-10 shadow-2xl border-2 transition-all ${
        canAccess
          ? `${borderColor} sm:group-hover:scale-105 sm:group-hover:-translate-y-2 active:scale-98`
          : 'border-slate-300 opacity-60'
      }`}>

        {/* Overlay bloqueo */}
        {!canAccess && (
          <div className="absolute inset-0 bg-slate-900/10 backdrop-blur-[2px] rounded-3xl flex items-center justify-center z-10">
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-3 rounded-2xl bg-slate-700 flex items-center justify-center shadow-xl">
                <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <div className="text-sm font-bold text-slate-700">Acceso Restringido</div>
              <div className="text-xs text-slate-500 mt-1">Contacta al administrador</div>
            </div>
          </div>
        )}

        {/* Logo PNG */}
        <div className="mx-auto mb-4 sm:mb-6 flex items-center justify-center">
          <img
            src={logoSrc}
            alt={logoAlt}
            className="h-24 sm:h-32 lg:h-36 w-auto object-contain drop-shadow-xl"
          />
        </div>

        {/* Features */}
        <ul className="space-y-2 sm:space-y-3 mb-5 sm:mb-8">
          {features.map((f, i) => (
            <Feature key={i} icon={f.icon} text={f.text} />
          ))}
        </ul>

        {/* Botón */}
        <button className={`w-full py-3.5 sm:py-4 bg-gradient-to-r ${buttonClass} text-white font-bold rounded-xl shadow-lg hover:shadow-xl active:scale-95 transition-all flex items-center justify-center gap-2`}>
          <span>{buttonLabel}</span>
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
        </button>

        {/* Badge */}
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

function Feature({ icon, text }) {
  return (
    <li className="flex items-center gap-2 sm:gap-3 text-slate-700">
      <span className="text-xl sm:text-2xl">{icon}</span>
      <span className="font-medium text-sm sm:text-base">{text}</span>
    </li>
  );
}
