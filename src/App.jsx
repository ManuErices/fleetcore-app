import React, { useEffect, useState } from "react";
import { Routes, Route, NavLink, useNavigate, Navigate } from "react-router-dom";
import Dashboard from "./pages/Dashboard.jsx";
import Machines from "./pages/Machines.jsx";
import Logs from "./pages/Logs.jsx";
import MonthlyCalendar from "./pages/MonthlyCalendar.jsx";
import Fuel from "./pages/Fuel.jsx";
import Payroll from "./pages/Payroll.jsx";
import PaymentStatus from "./pages/PaymentStatus.jsx";
import FuelPriceManager from "./pages/FuelPriceManager.jsx";
import OC from "./pages/OC.jsx";
import Consolidado from "./pages/Consolidado.jsx";
import Rendiciones from "./pages/Rendiciones.jsx";
import Subcontratos from "./pages/Subcontratos.jsx";
import ReportDetallado from "./pages/ReportDetallado.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import AppSelector from "./pages/AppSelector.jsx";
import ReporteWorkFleet from "./pages/ReporteWorkFleet.jsx";
import Pasajes from "./pages/Pasajes.jsx";
import ReporteCombustible from "./pages/ReporteCombustible.jsx";
import { auth, googleProvider, db } from "./lib/firebase";
import { signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

// ========================================
// COMPONENTES PWA Y OFFLINE
// ========================================
import ConnectionStatus from "./components/ConnectionStatus";
import InstallPWA from "./components/InstallPWA";
import SessionExpiryIndicator from "./components/SessionExpiryIndicator";

// WorkFleet Shell - Solo Reporte Detallado
function WorkFleetShell({ user, onLogout, onBackToSelector }) {
  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header simplificado */}
      <header className="sticky top-0 z-40 bg-gradient-to-br from-purple-600 via-purple-700 to-indigo-700 text-white shadow-lg">
        <div className="max-w-[1400px] mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img 
              src="/favicon.svg" 
              alt="Work Fleet Logo" 
              className="h-10 w-10 object-contain block sm:hidden"
            />
            <img 
              src="/logo-header.svg" 
              alt="Work Fleet Logo" 
              className="h-10 w-auto object-contain hidden sm:block"
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onBackToSelector}
              className="px-3 py-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors text-sm font-semibold"
              title="Cambiar aplicación"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <button
              onClick={onLogout}
              className="px-3 py-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
              title="Cerrar sesión"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* Contenido - Solo Reporte Detallado */}
      <main className="max-w-[1400px] mx-auto">
        <ReportDetallado />
      </main>
    </div>
  );
}

function Shell({ user, onLogout, selectedApp, onBackToSelector }) {
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showCostsMenu, setShowCostsMenu] = useState(false);
  const [showProductionMenu, setShowProductionMenu] = useState(false);
  const [showReporteWorkFleetMenu, setShowReporteWorkFleetMenu] = useState(false); // ✅ NUEVO ESTADO
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [userRole, setUserRole] = useState('operador'); // Estado para el rol del usuario

  // Obtener rol del usuario desde Firebase
  useEffect(() => {
    const getUserRole = async () => {
      if (user) {
        try {
          const userDocRef = doc(db, 'users', user.uid);
          const userDoc = await getDoc(userDocRef);
          
          if (userDoc.exists()) {
            const userData = userDoc.data();
            setUserRole(userData.role || 'operador');
          } else {
            setUserRole('operador');
          }
        } catch (error) {
          console.error("Error obteniendo rol del usuario:", error);
          setUserRole('operador');
        }
      }
    };

    getUserRole();
  }, [user]);

  return (
    <div className="min-h-screen bg-slate-50 relative">
      {/* Background decorativo */}
      <div className="fixed inset-0 bg-grid opacity-30 pointer-events-none" />
      <div className="fixed top-0 right-0 w-[1000px] h-[1000px] bg-gradient-radial from-blue-100/50 via-transparent to-transparent blur-3xl pointer-events-none" />

      {/* Header - Responsive */}
      <header className="sticky top-0 z-40 glass-card border-b border-slate-200/50">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-4 lg:py-5">
          <div className="flex items-center justify-between">
            {/* Logo - Responsive */}
            <div className="flex items-center gap-3 sm:gap-4 lg:gap-5 animate-fadeInUp">
              {/* Logo móvil - solo escudo */}
              <img 
                src="/favicon.svg" 
                alt="Fleet Core Logo" 
                className="h-10 w-10 object-contain block sm:hidden"
              />
              {/* Logo completo - visible en sm y superior */}
              <img 
                src="/logo-header.svg" 
                alt="Fleet Core Logo" 
                className="h-10 w-auto object-contain hidden sm:block"
              />
            </div>

            {/* Desktop: User + Mobile: Hamburger */}
            <div className="flex items-center gap-3 sm:gap-4 animate-slideInRight">
              {/* User section - Siempre visible */}
              {user && (
                <div className="relative">
                  <button
                    onClick={() => setShowUserMenu(!showUserMenu)}
                    className="flex items-center gap-2 sm:gap-4 px-3 sm:px-5 py-2 sm:py-3 rounded-lg sm:rounded-xl bg-white hover:bg-slate-50 border border-slate-200 shadow-sm hover:shadow-md transition-all group"
                  >
                    <div className="relative">
                      <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-gradient-to-br from-blue-900 to-blue-700 flex items-center justify-center shadow-md">
                        <span className="text-white text-xs sm:text-sm font-bold">
                          {user.email?.[0]?.toUpperCase() || "U"}
                        </span>
                      </div>
                      <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 sm:w-3 sm:h-3 bg-emerald-500 rounded-full border-2 border-white" />
                    </div>

                    <div className="hidden lg:block text-left">
                      <div className="text-sm font-semibold text-slate-900">{user.email?.split('@')[0]}</div>
                      <div className="text-xs text-slate-500">Administrador</div>
                    </div>

                    <svg 
                      className={`w-3 h-3 sm:w-4 sm:h-4 text-slate-400 transition-transform ${showUserMenu ? 'rotate-180' : ''}`} 
                      fill="none" 
                      viewBox="0 0 24 24" 
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {/* User Dropdown - Responsive */}
                  {showUserMenu && (
                    <>
                      <div 
                        className="fixed inset-0 z-40" 
                        onClick={() => setShowUserMenu(false)}
                      />
                      
                      <div className="absolute right-0 top-full mt-2 sm:mt-3 w-64 sm:w-72 bg-white rounded-xl sm:rounded-2xl shadow-xl border border-slate-200 z-50 overflow-hidden animate-scaleIn">
                        <div className="p-4 sm:p-5 bg-gradient-to-br from-slate-50 to-white border-b border-slate-100">
                          <div className="flex items-center gap-3 sm:gap-4">
                            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-gradient-to-br from-blue-900 to-blue-700 flex items-center justify-center shadow-lg">
                              <span className="text-white text-base sm:text-lg font-bold">
                                {user.email?.[0]?.toUpperCase() || "U"}
                              </span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="font-semibold text-sm sm:text-base text-slate-900 truncate">{user.email?.split('@')[0]}</div>
                              <div className="text-xs sm:text-sm text-slate-600 truncate">{user.email}</div>
                              <div className="inline-flex items-center gap-1.5 mt-1 px-2 py-0.5 bg-emerald-100 text-emerald-700 text-xs font-semibold rounded-full">
                                <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                                Conectado
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="p-2 space-y-1">
                          <button
                            onClick={onBackToSelector}
                            className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-blue-700 hover:bg-blue-50 rounded-xl transition-colors"
                          >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                            </svg>
                            Cambiar Aplicación
                          </button>
                          
                          <button
                            onClick={onLogout}
                            className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-red-700 hover:bg-red-50 rounded-xl transition-colors"
                          >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                            </svg>
                            Cerrar Sesión
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Hamburger Menu - Solo mobile */}
              <button
                onClick={() => setShowMobileMenu(!showMobileMenu)}
                className="lg:hidden p-2 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <svg className="w-6 h-6 text-slate-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  {showMobileMenu ? (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  )}
                </svg>
              </button>
            </div>
          </div>

          {/* Desktop Navigation - Hidden en mobile */}
          <nav className="hidden lg:flex items-center gap-3 mt-6 pt-6 border-t border-slate-200/50">
            <NavTab to="/" label="Dashboard" locked={userRole === 'mandante'} />
            
            {/* Menú Maquinaria */}
            <div className="relative">
              <button
                onClick={() => {
                  if (userRole !== 'mandante') {
                    setShowProductionMenu(!showProductionMenu);
                    setShowCostsMenu(false);
                  }
                }}
                disabled={userRole === 'mandante'}
                className={`flex items-center gap-2 px-6 py-3 text-sm font-semibold rounded-xl transition-all ${
                  userRole === 'mandante'
                    ? 'text-slate-400 cursor-not-allowed opacity-60'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
                title={userRole === 'mandante' ? 'Acceso restringido - Solo para administradores' : ''}
              >
                {userRole === 'mandante' && (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                )}
                Maquinaria
                <svg className={`w-4 h-4 transition-transform ${showProductionMenu ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {showProductionMenu && userRole !== 'mandante' && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowProductionMenu(false)} />
                  <div className="absolute left-0 top-full mt-2 w-72 bg-white rounded-2xl shadow-xl border border-slate-200 z-50 overflow-hidden animate-scaleIn">
                    <div className="p-2 space-y-1">
                      <NavLink
                        to="/machines"
                        onClick={() => setShowProductionMenu(false)}
                        className={({ isActive }) =>
                          `flex items-center gap-3 px-4 py-3 text-sm font-bold rounded-lg transition-colors ${
                            isActive
                              ? "bg-gradient-to-r from-blue-50 to-cyan-50 text-blue-700"
                              : "text-slate-900 hover:bg-gradient-to-r hover:from-blue-50 hover:to-cyan-50"
                          }`
                        }
                      >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                        </svg>
                        Equipos
                      </NavLink>

                      <NavLink
                        to="/logs"
                        onClick={() => setShowProductionMenu(false)}
                        className={({ isActive }) =>
                          `flex items-center gap-3 px-4 py-3 text-sm font-bold rounded-lg transition-colors ${
                            isActive
                              ? "bg-gradient-to-r from-green-50 to-emerald-50 text-green-700"
                              : "text-slate-900 hover:bg-gradient-to-r hover:from-green-50 hover:to-emerald-50"
                          }`
                        }
                      >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        Diario de Obra
                      </NavLink>

                      <NavLink
                        to="/calendar"
                        onClick={() => setShowProductionMenu(false)}
                        className={({ isActive }) =>
                          `flex items-center gap-3 px-4 py-3 text-sm font-bold rounded-lg transition-colors ${
                            isActive
                              ? "bg-gradient-to-r from-purple-50 to-pink-50 text-purple-700"
                              : "text-slate-900 hover:bg-gradient-to-r hover:from-purple-50 hover:to-pink-50"
                          }`
                        }
                      >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        Calendario
                      </NavLink>

                      <NavLink
                        to="/fuel"
                        onClick={() => setShowProductionMenu(false)}
                        className={({ isActive }) =>
                          `flex items-center gap-3 px-4 py-3 text-sm font-bold rounded-lg transition-colors ${
                            isActive
                              ? "bg-gradient-to-r from-orange-50 to-amber-50 text-orange-700"
                              : "text-slate-900 hover:bg-gradient-to-r hover:from-orange-50 hover:to-amber-50"
                          }`
                        }
                      >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.879 16.121A3 3 0 1012.015 11L11 14H9c0 .768.293 1.536.879 2.121z" />
                        </svg>
                        Combustible
                      </NavLink>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Menú Control de Producción y EP */}
            <div className="relative">
              <button
                onClick={() => {
                  if (userRole !== 'mandante') {
                    setShowCostsMenu(!showCostsMenu);
                    setShowProductionMenu(false);
                  }
                }}
                disabled={userRole === 'mandante'}
                className={`flex items-center gap-2 px-6 py-3 text-sm font-semibold rounded-xl transition-all ${
                  userRole === 'mandante'
                    ? 'text-slate-400 cursor-not-allowed opacity-60'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
                title={userRole === 'mandante' ? 'Acceso restringido - Solo para administradores' : ''}
              >
                {userRole === 'mandante' && (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                )}
                Control de Producción y EP
                <svg className={`w-4 h-4 transition-transform ${showCostsMenu ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {showCostsMenu && userRole !== 'mandante' && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowCostsMenu(false)} />
                  <div className="absolute left-0 top-full mt-2 w-72 bg-white rounded-2xl shadow-xl border border-slate-200 z-50 overflow-hidden animate-scaleIn">
                    <div className="p-2 space-y-1">
                      <NavLink
                        to="/payroll"
                        onClick={() => setShowCostsMenu(false)}
                        className={({ isActive }) =>
                          `flex items-center gap-3 px-4 py-3 text-sm font-bold rounded-lg transition-colors ${
                            isActive
                              ? "bg-gradient-to-r from-emerald-50 to-teal-50 text-emerald-700"
                              : "text-slate-900 hover:bg-gradient-to-r hover:from-emerald-50 hover:to-teal-50"
                          }`
                        }
                      >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                        </svg>
                        Registro Diario
                      </NavLink>

                      <NavLink
                        to="/reporte-workfleet"
                        onClick={() => setShowCostsMenu(false)}
                        className={({ isActive }) =>
                          `flex items-center gap-3 px-4 py-3 text-sm font-bold rounded-lg transition-colors ${
                            isActive
                              ? "bg-gradient-to-r from-blue-50 to-cyan-50 text-blue-700"
                              : "text-slate-900 hover:bg-gradient-to-r hover:from-blue-50 hover:to-cyan-50"
                          }`
                        }
                      >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        Equipos y Servicios
                      </NavLink>

                      <NavLink
                        to="/consolidado"
                        onClick={() => setShowCostsMenu(false)}
                        className={({ isActive }) =>
                          `flex items-center gap-3 px-4 py-3 text-sm font-bold rounded-lg transition-colors ${
                            isActive
                              ? "bg-gradient-to-r from-indigo-50 to-blue-50 text-indigo-700"
                              : "text-slate-900 hover:bg-gradient-to-r hover:from-indigo-50 hover:to-blue-50"
                          }`
                        }
                      >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                        </svg>
                        Detalle Flota
                      </NavLink>

                      <NavLink
                        to="/payment-status"
                        onClick={() => setShowCostsMenu(false)}
                        className={({ isActive }) =>
                          `flex items-center gap-3 px-4 py-3 text-sm font-bold rounded-lg transition-colors ${
                            isActive
                              ? "bg-gradient-to-r from-violet-50 to-purple-50 text-violet-700"
                              : "text-slate-900 hover:bg-gradient-to-r hover:from-violet-50 hover:to-purple-50"
                          }`
                        }
                      >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                        </svg>
                        Estado de Pago
                      </NavLink>

                      <div className="h-px bg-slate-200 my-2" />

                      <NavLink
                        to="/rendiciones"
                        onClick={() => setShowCostsMenu(false)}
                        className={({ isActive }) =>
                          `flex items-center gap-3 px-4 py-3 text-sm font-bold rounded-lg transition-colors ${
                            isActive
                              ? "bg-gradient-to-r from-amber-50 to-yellow-50 text-amber-700"
                              : "text-slate-900 hover:bg-gradient-to-r hover:from-amber-50 hover:to-yellow-50"
                          }`
                        }
                      >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                        </svg>
                        Rendiciones
                      </NavLink>

                      <NavLink
                        to="/pasajes"
                        onClick={() => setShowCostsMenu(false)}
                        className={({ isActive }) =>
                          `flex items-center gap-3 px-4 py-3 text-sm font-bold rounded-lg transition-colors ${
                            isActive
                              ? "bg-gradient-to-r from-sky-50 to-blue-50 text-sky-700"
                              : "text-slate-900 hover:bg-gradient-to-r hover:from-sky-50 hover:to-blue-50"
                          }`
                        }
                      >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                        </svg>
                        Pasajes
                      </NavLink>

                      <NavLink
                        to="/subcontratos"
                        onClick={() => setShowCostsMenu(false)}
                        className={({ isActive }) =>
                          `flex items-center gap-3 px-4 py-3 text-sm font-bold rounded-lg transition-colors ${
                            isActive
                              ? "bg-gradient-to-r from-teal-50 to-cyan-50 text-teal-700"
                              : "text-slate-900 hover:bg-gradient-to-r hover:from-teal-50 hover:to-cyan-50"
                          }`
                        }
                      >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                        </svg>
                        Subcontratos
                      </NavLink>

                      <NavLink
                        to="/oc"
                        onClick={() => setShowCostsMenu(false)}
                        className={({ isActive }) =>
                          `flex items-center gap-3 px-4 py-3 text-sm font-bold rounded-lg transition-colors ${
                            isActive
                              ? "bg-gradient-to-r from-rose-50 to-pink-50 text-rose-700"
                              : "text-slate-900 hover:bg-gradient-to-r hover:from-rose-50 hover:to-pink-50"
                          }`
                        }
                      >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        Órdenes de Compra
                      </NavLink>
                    </div>
                  </div>
                </>
              )}
            </div>
            
            {/* ✅ NUEVO: Menú Reporte WorkFleet */}
            <div className="relative">
              <button
                onClick={() => {
                  setShowReporteWorkFleetMenu(!showReporteWorkFleetMenu);
                  setShowCostsMenu(false);
                  setShowProductionMenu(false);
                }}
                className="flex items-center gap-2 px-6 py-3 text-sm font-semibold rounded-xl transition-all text-slate-600 hover:text-slate-900 hover:bg-slate-100"
              >
                Reportes WorkFleet
                <svg className={`w-4 h-4 transition-transform ${showReporteWorkFleetMenu ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {showReporteWorkFleetMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowReporteWorkFleetMenu(false)} />
                  <div className="absolute left-0 top-full mt-2 w-72 bg-white rounded-2xl shadow-xl border border-slate-200 z-50 overflow-hidden animate-scaleIn">
                    <div className="p-2 space-y-1">
                      <NavLink
                        to="/reporte-workfleet"
                        onClick={() => setShowReporteWorkFleetMenu(false)}
                        className={({ isActive }) =>
                          `flex items-center gap-3 px-4 py-3 text-sm font-bold rounded-lg transition-colors ${
                            isActive
                              ? "bg-gradient-to-r from-teal-50 to-cyan-50 text-teal-700"
                              : "text-slate-900 hover:bg-gradient-to-r hover:from-teal-50 hover:to-cyan-50"
                          }`
                        }
                      >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        Reporte Maquinaria
                      </NavLink>

                      <NavLink
                        to="/reporte-combustible"
                        onClick={() => setShowReporteWorkFleetMenu(false)}
                        className={({ isActive }) =>
                          `flex items-center gap-3 px-4 py-3 text-sm font-bold rounded-lg transition-colors ${
                            isActive
                              ? "bg-gradient-to-r from-orange-50 to-amber-50 text-orange-700"
                              : "text-slate-900 hover:bg-gradient-to-r hover:from-orange-50 hover:to-amber-50"
                          }`
                        }
                      >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.879 16.121A3 3 0 1012.015 11L11 14H9c0 .768.293 1.536.879 2.121z" />
                        </svg>
                        Reporte Combustible
                      </NavLink>
                    </div>
                  </div>
                </>
              )}
            </div>
          </nav>
        </div>

        {/* Mobile Navigation - Full Screen Overlay */}
        {showMobileMenu && (
          <>
            <div 
              className="lg:hidden fixed inset-0 bg-black/50 z-[60] animate-fadeIn" 
              onClick={() => setShowMobileMenu(false)}
            />
            
            <div className="lg:hidden fixed inset-y-0 right-0 w-full max-w-sm bg-white z-[70] shadow-2xl animate-slideInRight">
              <div className="flex flex-col h-full">
                {/* Mobile Menu Header */}
                <div className="flex items-center justify-between p-4 border-b border-slate-200">
                  <h2 className="text-lg font-black text-slate-900">Menú</h2>
                  <button
                    onClick={() => setShowMobileMenu(false)}
                    className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
                  >
                    <svg className="w-6 h-6 text-slate-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {/* Mobile Menu Content */}
                <nav className="flex-1 overflow-y-auto p-4 space-y-1">
                  {/* Sección Principal */}
                  <div className="space-y-1">
                    <MobileNavLink to="/" label="Dashboard" onClick={() => setShowMobileMenu(false)} />
                    <MobileNavLink to="/machines" label="Equipos" onClick={() => setShowMobileMenu(false)} />
                    <MobileNavLink to="/logs" label="Diario de Obra" onClick={() => setShowMobileMenu(false)} />
                    <MobileNavLink to="/calendar" label="Calendario" onClick={() => setShowMobileMenu(false)} />
                    <MobileNavLink to="/fuel" label="Combustible" onClick={() => setShowMobileMenu(false)} />
                  </div>
                  
                  {/* Separador */}
                  <div className="h-px bg-slate-200 my-4" />
                  
                  {/* Sección Producción */}
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 px-4 py-2 mb-2">
                      <svg className="w-4 h-4 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <span className="text-xs font-black text-slate-700 uppercase tracking-wider">Producción</span>
                    </div>
                    <MobileNavLink to="/reporte-detallado" label="Reporte Detallado" onClick={() => setShowMobileMenu(false)} />
                  </div>

                  {/* Separador */}
                  <div className="h-px bg-slate-200 my-4" />

                  {/* ✅ NUEVO: Sección Reporte WorkFleet */}
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 px-4 py-2 mb-2">
                      <svg className="w-4 h-4 text-teal-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <span className="text-xs font-black text-slate-700 uppercase tracking-wider">📊 Reporte WorkFleet</span>
                    </div>
                    <MobileNavLink to="/reporte-workfleet" label="📋 Reporte Maquinaria" onClick={() => setShowMobileMenu(false)} />
                    <MobileNavLink to="/reporte-combustible" label="⛽ Reporte Combustible" onClick={() => setShowMobileMenu(false)} />
                  </div>

                  {/* Separador */}
                  <div className="h-px bg-slate-200 my-4" />

                  {/* Sección Costos */}
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 px-4 py-2 mb-2">
                      <svg className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                      </svg>
                      <span className="text-xs font-black text-slate-700 uppercase tracking-wider">Costos</span>
                    </div>
                    <MobileNavLink to="/payroll" label="Remuneraciones" onClick={() => setShowMobileMenu(false)} />
                    <MobileNavLink to="/payment-status" label="Estados de Pago" onClick={() => setShowMobileMenu(false)} />
                    <MobileNavLink to="/rendiciones" label="Rendiciones" onClick={() => setShowMobileMenu(false)} />
                    <MobileNavLink to="/subcontratos" label="Subcontratos" onClick={() => setShowMobileMenu(false)} />
                    <MobileNavLink to="/oc" label="Órdenes de Compra" onClick={() => setShowMobileMenu(false)} />
                    <MobileNavLink to="/consolidado" label="Consolidado Total" onClick={() => setShowMobileMenu(false)} />
                  </div>

                  {/* Separador */}
                  <div className="h-px bg-slate-200 my-4" />

                  {/* Sección Configuración */}
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 px-4 py-2 mb-2">
                      <svg className="w-4 h-4 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      <span className="text-xs font-black text-slate-700 uppercase tracking-wider">Configuración</span>
                    </div>
                    <MobileNavLink to="/fuel-price" label="Precios Combustible" onClick={() => setShowMobileMenu(false)} />
                  </div>
                </nav>
              </div>
            </div>
          </>
        )}
      </header>

      {/* Main content - Responsive padding */}
      <main className="max-w-[1400px] mx-auto px-0 sm:px-4 lg:px-8 py-4 sm:py-6 lg:py-8">
        <Routes>
          {/* Ruta accesible para todos incluyendo mandantes */}
          <Route path="/reporte-workfleet" element={<ReporteWorkFleet />} />
          
          {/* Rutas protegidas - solo para admin y operador */}
          {userRole !== 'mandante' ? (
            <>
              <Route path="/" element={<Dashboard />} />
              <Route path="/logs" element={<Logs />} />
              <Route path="/calendar" element={<MonthlyCalendar />} />
              <Route path="/fuel" element={<Fuel />} />
              <Route path="/payroll" element={<Payroll />} />
              <Route path="/oc" element={<OC />} />
              <Route path="/consolidado" element={<Consolidado />} />
              <Route path="/machines" element={<Machines />} />
              <Route path="/rendiciones" element={<Rendiciones />} />
              <Route path="/pasajes" element={<Pasajes />} />
              <Route path="/reporte-combustible" element={<ReporteCombustible />} />
              <Route path="/payment-status" element={<PaymentStatus />} />
              <Route path="/fuel-price" element={<FuelPriceManager />} />
              <Route path="/subcontratos" element={<Subcontratos />} />
              <Route path="/reporte-detallado" element={<ReportDetallado />} />
            </>
          ) : (
            // Redirigir mandantes a reporte-workfleet
            <Route path="*" element={<Navigate to="/reporte-workfleet" replace />} />
          )}
        </Routes>
      </main>

      {/* Footer - Responsive */}
      <footer className="border-t border-slate-200/50 mt-8 sm:mt-12 lg:mt-16">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs sm:text-sm text-slate-600">
            <div className="flex items-center gap-2">
              <img 
                src="/favicon.svg" 
                alt="Fleet Core" 
                className="h-6 w-6 object-contain"
              />
              <span className="font-medium">FleetCore by <strong>MPF Ingeniería Civil SpA</strong></span>
            </div>
            <div className="text-center sm:text-right">
              © {new Date().getFullYear()} Todos los derechos reservados
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

function NavTab({ to, label, locked = false }) {
  if (locked) {
    return (
      <button
        disabled
        className="relative px-6 py-3 text-sm font-semibold rounded-xl transition-all text-slate-400 cursor-not-allowed opacity-60 flex items-center gap-2"
        title="Acceso restringido - Solo para administradores"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
        <span className="relative z-10">{label}</span>
      </button>
    );
  }

  return (
    <NavLink
      to={to}
      end={to === "/"}
      className={({ isActive }) =>
        `relative px-6 py-3 text-sm font-semibold rounded-xl transition-all ${
          isActive
            ? "text-white"
            : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
        }`
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <div className="absolute inset-0 bg-gradient-to-r from-blue-900 to-blue-700 rounded-xl shadow-lg" />
          )}
          <span className="relative z-10">{label}</span>
        </>
      )}
    </NavLink>
  );
}

function MobileNavLink({ to, label, onClick }) {
  return (
    <NavLink
      to={to}
      end={to === "/"}
      onClick={onClick}
      className={({ isActive }) =>
        `flex items-center px-4 py-3 rounded-xl font-semibold text-sm transition-all ${
          isActive
            ? "bg-gradient-to-r from-blue-900 to-blue-700 text-white shadow-lg"
            : "text-slate-700 hover:bg-slate-100"
        }`
      }
    >
      {label}
    </NavLink>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedApp, setSelectedApp] = useState(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
      
      // Cargar app seleccionada del localStorage
      if (currentUser) {
        const savedApp = localStorage.getItem('selectedApp');
        setSelectedApp(savedApp);
      }
    });
    return () => unsubscribe();
  }, []);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setSelectedApp(null);
      localStorage.removeItem('selectedApp');
    } catch (err) {
      console.error("Error en logout:", err);
    }
  };

  const handleBackToSelector = () => {
    setSelectedApp(null);
    localStorage.removeItem('selectedApp');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-900 to-slate-900 flex items-center justify-center p-4">
        <div className="text-center">
          <div className="mb-4 flex justify-center animate-pulse">
            <img
              src="/favicon.svg"
              alt="Fleet Core"
              className="h-20 sm:h-24 w-auto object-contain"
            />
          </div>
          <div className="text-sm sm:text-base font-bold text-white mt-2">Fleet<span className="text-blue-300">Core</span></div>
          <div className="text-xs text-blue-200 mt-1">Cargando...</div>
        </div>
      </div>
    );
  }

  // Si no hay usuario, mostrar página de login
  if (!user) {
    return <LoginPage />;
  }

  // Si hay usuario pero no ha seleccionado app, mostrar selector
  if (!selectedApp) {
    return <AppSelector user={user} onLogout={handleLogout} onSelectApp={setSelectedApp} />;
  }

  // Si seleccionó WorkFleet, mostrar solo ReporteDetallado
  if (selectedApp === 'workfleet') {
    return (
      <>
        <ConnectionStatus />
        <InstallPWA />
        <SessionExpiryIndicator />
        <WorkFleetShell user={user} onLogout={handleLogout} onBackToSelector={handleBackToSelector} />
      </>
    );
  }

  // Si seleccionó FleetCore, mostrar app completa
  return (
    <>
      <ConnectionStatus />
      <InstallPWA />
      <SessionExpiryIndicator />
      <Shell user={user} onLogout={handleLogout} selectedApp={selectedApp} onBackToSelector={handleBackToSelector} />
    </>
  );
}
