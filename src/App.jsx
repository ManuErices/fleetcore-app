import React, { useEffect, useState } from "react";
import { Routes, Route, NavLink, useNavigate } from "react-router-dom";
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
import { auth, googleProvider } from "./lib/firebase";
import { signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";

function Shell({ user, onLogin, onLogout }) {
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showCostsMenu, setShowCostsMenu] = useState(false);
  const [showProductionMenu, setShowProductionMenu] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);

  return (
    <div className="min-h-screen bg-slate-50 relative">
      {/* Background decorativo */}
      <div className="fixed inset-0 bg-grid opacity-30 pointer-events-none" />
      <div className="fixed top-0 right-0 w-[1000px] h-[1000px] bg-gradient-radial from-blue-100/50 via-transparent to-transparent blur-3xl pointer-events-none" />

      {/* Header - Responsive */}
      <header className="sticky top-0 z-50 glass-card border-b border-slate-200/50">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-4 lg:py-5">
          <div className="flex items-center justify-between">
            {/* Logo - Responsive */}
            <div className="flex items-center gap-3 sm:gap-4 lg:gap-5 animate-fadeInUp">
              <div className="relative group">
                <div className="absolute inset-0 bg-gradient-to-br from-blue-500 to-orange-500 rounded-xl sm:rounded-2xl blur-xl opacity-50 group-hover:opacity-75 transition-opacity" />
                
                <div className="relative w-12 h-12 sm:w-14 sm:h-14 lg:w-16 lg:h-16 rounded-xl sm:rounded-2xl bg-gradient-to-br from-blue-900 to-blue-700 flex items-center justify-center shadow-lg transform group-hover:scale-105 transition-transform">
                  <svg className="w-6 h-6 sm:w-7 sm:h-7 lg:w-9 lg:h-9 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
              </div>
              
              <div>
                <h1 className="text-lg sm:text-xl lg:text-2xl font-black text-slate-900 tracking-tight">
                  Fleet<span className="bg-gradient-to-r from-blue-900 to-blue-600 bg-clip-text text-transparent">Core</span>
                </h1>
                <p className="text-xs sm:text-sm text-slate-600 mt-0.5 font-medium hidden sm:block">
                  El núcleo de tu operación • Nuevo Cobre
                </p>
              </div>
            </div>

            {/* Desktop: User + Mobile: Hamburger */}
            <div className="flex items-center gap-3 sm:gap-4 animate-slideInRight">
              {/* User section - Siempre visible */}
              {user ? (
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

                        <div className="p-2">
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
              ) : (
                <button
                  onClick={onLogin}
                  className="px-4 sm:px-6 py-2 sm:py-3 rounded-lg sm:rounded-xl font-semibold text-sm sm:text-base text-white bg-gradient-to-r from-blue-900 to-blue-700 hover:from-blue-800 hover:to-blue-600 shadow-lg hover:shadow-xl transition-all flex items-center gap-2"
                >
                  <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12.545,10.239v3.821h5.445c-0.712,2.315-2.647,3.972-5.445,3.972c-3.332,0-6.033-2.701-6.033-6.032s2.701-6.032,6.033-6.032c1.498,0,2.866,0.549,3.921,1.453l2.814-2.814C17.503,2.988,15.139,2,12.545,2C7.021,2,2.543,6.477,2.543,12s4.478,10,10.002,10c8.396,0,10.249-7.85,9.426-11.748L12.545,10.239z"/>
                  </svg>
                  <span className="hidden sm:inline">Ingresar con Google</span>
                  <span className="sm:hidden">Ingresar</span>
                </button>
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
            <NavTab to="/" label="Dashboard" />
            <NavTab to="/machines" label="Equipos" />
            <NavTab to="/logs" label="Diario de Obra" />
            <NavTab to="/calendar" label="Calendario" />
            <NavTab to="/fuel" label="Combustible" />
            
            {/* Menú Producción */}
            <div className="relative">
              <button
                onClick={() => {
                  setShowProductionMenu(!showProductionMenu);
                  setShowCostsMenu(false);
                }}
                className="flex items-center gap-2 px-6 py-3 text-sm font-semibold rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-all"
              >
                Producción
                <svg className={`w-4 h-4 transition-transform ${showProductionMenu ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {showProductionMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowProductionMenu(false)} />
                  <div className="absolute left-0 top-full mt-2 w-72 bg-white rounded-2xl shadow-xl border border-slate-200 z-50 overflow-hidden animate-scaleIn">
                    <div className="p-2">
                      <NavLink
                        to="/reporte-detallado"
                        onClick={() => setShowProductionMenu(false)}
                        className={({ isActive }) =>
                          `flex items-center gap-3 px-4 py-3 text-sm font-bold rounded-lg transition-colors ${
                            isActive
                              ? "bg-gradient-to-r from-purple-50 to-indigo-50 text-purple-700"
                              : "text-slate-900 hover:bg-gradient-to-r hover:from-purple-50 hover:to-indigo-50"
                          }`
                        }
                      >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        Reporte Detallado
                      </NavLink>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Menú Costos */}
            <div className="relative">
              <button
                onClick={() => {
                  setShowCostsMenu(!showCostsMenu);
                  setShowProductionMenu(false);
                }}
                className="flex items-center gap-2 px-6 py-3 text-sm font-semibold rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-all"
              >
                Costos
                <svg className={`w-4 h-4 transition-transform ${showCostsMenu ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {showCostsMenu && (
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
                        Remuneraciones
                      </NavLink>

                      <NavLink
                        to="/payment-status"
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
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                        </svg>
                        Estados de Pago
                      </NavLink>

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
                              ? "bg-gradient-to-r from-violet-50 to-purple-50 text-violet-700"
                              : "text-slate-900 hover:bg-gradient-to-r hover:from-violet-50 hover:to-purple-50"
                          }`
                        }
                      >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        Órdenes de Compra
                      </NavLink>

                      <div className="h-px bg-slate-200 my-2" />

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
                        Consolidado Total
                      </NavLink>
                    </div>
                  </div>
                </>
              )}
            </div>
            
            <NavTab to="/fuel-price" label="Precios Combustible" />
          </nav>
        </div>

        {/* Mobile Navigation - Full Screen Overlay */}
        {showMobileMenu && (
          <>
            <div 
              className="lg:hidden fixed inset-0 bg-black/50 z-40 animate-fadeIn" 
              onClick={() => setShowMobileMenu(false)}
            />
            
            <div className="lg:hidden fixed inset-y-0 right-0 w-full max-w-sm bg-white z-50 shadow-2xl animate-slideInRight">
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
                <nav className="flex-1 overflow-y-auto p-4 space-y-2">
                  <MobileNavLink to="/" label="Dashboard" onClick={() => setShowMobileMenu(false)} />
                  <MobileNavLink to="/machines" label="Equipos" onClick={() => setShowMobileMenu(false)} />
                  <MobileNavLink to="/logs" label="Diario de Obra" onClick={() => setShowMobileMenu(false)} />
                  <MobileNavLink to="/calendar" label="Calendario" onClick={() => setShowMobileMenu(false)} />
                  <MobileNavLink to="/fuel" label="Combustible" onClick={() => setShowMobileMenu(false)} />
                  
                  <div className="pt-2">
                    <div className="text-xs font-bold text-slate-500 uppercase tracking-wider px-4 py-2">Producción</div>
                    <MobileNavLink to="/reporte-detallado" label="Reporte Detallado" onClick={() => setShowMobileMenu(false)} />
                  </div>

                  <div className="pt-2">
                    <div className="text-xs font-bold text-slate-500 uppercase tracking-wider px-4 py-2">Costos</div>
                    <MobileNavLink to="/payroll" label="Remuneraciones" onClick={() => setShowMobileMenu(false)} />
                    <MobileNavLink to="/payment-status" label="Estados de Pago" onClick={() => setShowMobileMenu(false)} />
                    <MobileNavLink to="/rendiciones" label="Rendiciones" onClick={() => setShowMobileMenu(false)} />
                    <MobileNavLink to="/subcontratos" label="Subcontratos" onClick={() => setShowMobileMenu(false)} />
                    <MobileNavLink to="/oc" label="Órdenes de Compra" onClick={() => setShowMobileMenu(false)} />
                    <MobileNavLink to="/consolidado" label="Consolidado Total" onClick={() => setShowMobileMenu(false)} />
                  </div>

                  <div className="pt-2">
                    <div className="text-xs font-bold text-slate-500 uppercase tracking-wider px-4 py-2">Configuración</div>
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
          <Route path="/" element={<Dashboard />} />
          <Route path="/logs" element={<Logs />} />
          <Route path="/calendar" element={<MonthlyCalendar />} />
          <Route path="/fuel" element={<Fuel />} />
          <Route path="/payroll" element={<Payroll />} />
          <Route path="/oc" element={<OC />} />
          <Route path="/consolidado" element={<Consolidado />} />
          <Route path="/machines" element={<Machines />} />
          <Route path="/rendiciones" element={<Rendiciones />} />
          <Route path="/payment-status" element={<PaymentStatus />} />
          <Route path="/fuel-price" element={<FuelPriceManager />} />
          <Route path="/subcontratos" element={<Subcontratos />} />
          <Route path="/reporte-detallado" element={<ReportDetallado />} />
        </Routes>
      </main>

      {/* Footer - Responsive */}
      <footer className="border-t border-slate-200/50 mt-8 sm:mt-12 lg:mt-16">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs sm:text-sm text-slate-600">
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-lg bg-gradient-to-br from-blue-900 to-blue-700 flex items-center justify-center">
                <svg className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
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

function NavTab({ to, label }) {
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

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      console.error("Error en login:", err);
      alert("Error al iniciar sesión");
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error("Error en logout:", err);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="text-center">
          <div className="w-12 h-12 sm:w-16 sm:h-16 mx-auto mb-4 rounded-xl sm:rounded-2xl bg-gradient-to-br from-blue-900 to-blue-700 flex items-center justify-center animate-pulse">
            <svg className="w-6 h-6 sm:w-8 sm:h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <div className="text-xl sm:text-2xl font-black text-slate-900">
            Fleet<span className="bg-gradient-to-r from-blue-900 to-blue-600 bg-clip-text text-transparent">Core</span>
          </div>
          <div className="text-xs sm:text-sm text-slate-600 mt-2">Cargando...</div>
        </div>
      </div>
    );
  }

  return <Shell user={user} onLogin={handleLogin} onLogout={handleLogout} />;
}
