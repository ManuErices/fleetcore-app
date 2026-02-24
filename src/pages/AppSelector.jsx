import React, { useState, useEffect } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../lib/firebase";

export default function AppSelector({ user, onLogout, onSelectApp }) {
  const [userRole, setUserRole] = useState(null);
  const [loading, setLoading] = useState(true);

  // Cargar rol del usuario desde Firebase
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
          
          // Si es operador, redirigir automáticamente a WorkFleet
          if (role === 'operador') {
            console.log("🔄 Operador detectado - Redirigiendo a WorkFleet...");
            localStorage.setItem('selectedApp', 'workfleet');
            onSelectApp('workfleet');
            return;
          }
        } else {
          setUserRole('operador');
          // Si no existe el documento, asumir operador y redirigir a WorkFleet
          console.log("🔄 Usuario sin rol - Redirigiendo a WorkFleet...");
          localStorage.setItem('selectedApp', 'workfleet');
          onSelectApp('workfleet');
          return;
        }
      } catch (error) {
        console.error("Error cargando rol de usuario:", error);
        setUserRole('operador');
        // En caso de error, redirigir a WorkFleet como fallback
        localStorage.setItem('selectedApp', 'workfleet');
        onSelectApp('workfleet');
        return;
      } finally {
        setLoading(false);
      }
    };

    loadUserRole();
  }, [user, onSelectApp]);

  // Determinar si el usuario tiene acceso a cada aplicación
  const canAccessFleetCore = userRole === 'administrador' || userRole === 'administrativo';
  const canAccessWorkFleet = userRole === 'administrador' || userRole === 'operador';

  const handleSelectFleetCore = () => {
    if (!canAccessFleetCore) {
      alert('🔒 No tienes permisos para acceder a FleetCore');
      return;
    }
    localStorage.setItem('selectedApp', 'fleetcore');
    onSelectApp('fleetcore');
  };

  const handleSelectWorkFleet = () => {
    if (!canAccessWorkFleet) {
      alert('🔒 No tienes permisos para acceder a WorkFleet');
      return;
    }
    localStorage.setItem('selectedApp', 'workfleet');
    onSelectApp('workfleet');
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

      {/* Container */}
      <div className="relative w-full max-w-6xl">
        {/* Header con usuario */}
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

        {/* Cards de aplicaciones */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 lg:gap-8">
          {/* FleetCore Card */}
          <div 
            onClick={handleSelectFleetCore}
            className={`group relative ${canAccessFleetCore ? 'cursor-pointer' : 'cursor-not-allowed'} animate-fadeInUp`}
          >
            {/* Glow effect */}
            <div className={`absolute inset-0 bg-gradient-to-br from-blue-500 to-blue-700 rounded-3xl blur-xl transition-opacity ${canAccessFleetCore ? 'opacity-50 group-hover:opacity-75' : 'opacity-20'}`} />
            
            {/* Card content */}
            <div className={`relative bg-white rounded-3xl p-5 sm:p-8 lg:p-10 shadow-2xl border-2 transition-all ${
              canAccessFleetCore 
                ? 'border-blue-200 hover:border-blue-400 sm:group-hover:scale-105 sm:group-hover:-translate-y-2 active:scale-98' 
                : 'border-slate-300 opacity-60'
            }`}>
              
              {/* Overlay de bloqueo */}
              {!canAccessFleetCore && (
                <div className="absolute inset-0 bg-slate-900/10 backdrop-blur-[2px] rounded-3xl flex items-center justify-center z-10">
                  <div className="text-center">
                    <div className="w-16 h-16 mx-auto mb-3 rounded-2xl bg-slate-700 flex items-center justify-center shadow-xl">
                      <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                    </div>
                    <div className="text-sm font-bold text-slate-700">Acceso Restringido</div>
                    <div className="text-xs text-slate-500 mt-1">
                      {userRole === 'operador' ? 'Solo para Administrativos' : 'Contacta al administrador'}
                    </div>
                  </div>
                </div>
              )}
              
              {/* Icon */}
              <div className="mx-auto mb-4 sm:mb-6 flex items-center justify-center">
                <img
                  src="/logo-movil2.svg"
                  alt="FleetCore"
                  className="h-20 sm:h-28 lg:h-32 w-auto object-contain"
                />
              </div>

              {/* Features */}
              <ul className="space-y-2 sm:space-y-3 mb-5 sm:mb-8">
                <Feature icon="📊" text="Dashboard y reportes" />
                <Feature icon="🚜" text="Gestión de equipos" />
                <Feature icon="📅" text="Calendario y logs" />
                <Feature icon="⛽" text="Control de combustible" />
                <Feature icon="💰" text="Remuneraciones y costos" />
                <Feature icon="📑" text="Órdenes de compra" />
              </ul>

              {/* Button */}
              <button className="w-full py-3.5 sm:py-4 bg-gradient-to-r from-blue-900 to-blue-700 hover:from-blue-800 hover:to-blue-600 active:from-blue-950 active:to-blue-800 text-white font-bold rounded-xl shadow-lg hover:shadow-xl active:scale-95 transition-all flex items-center justify-center gap-2">
                <span>Abrir FleetCore</span>
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </button>

              {/* Badge */}
              <div className="mt-4 text-center">
                <span className="inline-flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-700 text-xs font-semibold rounded-full">
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  Administración
                </span>
              </div>
            </div>
          </div>

          {/* WorkFleet Card */}
          <div 
            onClick={handleSelectWorkFleet}
            className={`group relative ${canAccessWorkFleet ? 'cursor-pointer' : 'cursor-not-allowed'} animate-fadeInUp stagger-2`}
          >
            {/* Glow effect */}
            <div className={`absolute inset-0 bg-gradient-to-br from-purple-500 to-purple-700 rounded-3xl blur-xl transition-opacity ${canAccessWorkFleet ? 'opacity-50 group-hover:opacity-75' : 'opacity-20'}`} />
            
            {/* Card content */}
            <div className={`relative bg-white rounded-3xl p-5 sm:p-8 lg:p-10 shadow-2xl border-2 transition-all ${
              canAccessWorkFleet 
                ? 'border-purple-200 hover:border-purple-400 sm:group-hover:scale-105 sm:group-hover:-translate-y-2 active:scale-98' 
                : 'border-slate-300 opacity-60'
            }`}>
              
              {/* Overlay de bloqueo */}
              {!canAccessWorkFleet && (
                <div className="absolute inset-0 bg-slate-900/10 backdrop-blur-[2px] rounded-3xl flex items-center justify-center z-10">
                  <div className="text-center">
                    <div className="w-16 h-16 mx-auto mb-3 rounded-2xl bg-slate-700 flex items-center justify-center shadow-xl">
                      <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2-2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                    </div>
                    <div className="text-sm font-bold text-slate-700">Acceso Restringido</div>
                    <div className="text-xs text-slate-500 mt-1">
                      {userRole === 'administrativo' ? 'Solo para Operadores' : 'Contacta al administrador'}
                    </div>
                  </div>
                </div>
              )}
              
              {/* Icon */}
              <div className="mx-auto mb-4 sm:mb-6 flex items-center justify-center">
                <img
                  src="/wf-logo-movil.svg"
                  alt="WorkFleet"
                  className="h-20 sm:h-28 lg:h-32 w-auto object-contain"
                />
              </div>

              {/* Features */}
              <ul className="space-y-2 sm:space-y-3 mb-5 sm:mb-8">
                <Feature icon="📱" text="Optimizado para móvil" />
                <Feature icon="📝" text="Reporte detallado diario" />
                <Feature icon="📷" text="Escaneo QR de equipos" />
                <Feature icon="⏱️" text="Registro de actividades" />
                <Feature icon="⛽" text="Control de combustible" />
                <Feature icon="📊" text="Estado de máquinas" />
              </ul>

              {/* Button */}
              <button className="w-full py-3.5 sm:py-4 bg-gradient-to-r from-purple-900 to-purple-700 hover:from-purple-800 hover:to-purple-600 active:from-purple-950 active:to-purple-800 text-white font-bold rounded-xl shadow-lg hover:shadow-xl active:scale-95 transition-all flex items-center justify-center gap-2">
                <span>Abrir WorkFleet</span>
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </button>

              {/* Badge */}
              <div className="mt-4 text-center">
                <span className="inline-flex items-center gap-1 px-3 py-1 bg-purple-100 text-purple-700 text-xs font-semibold rounded-full">
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  Operadores
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer info */}
        <div className="mt-8 text-center text-blue-200 text-sm animate-fadeInUp stagger-3">
          <p>Puedes cambiar de aplicación en cualquier momento desde el menú de usuario</p>
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
