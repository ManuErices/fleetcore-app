import React, { useEffect, useState } from "react";
import { Routes, Route, NavLink, useNavigate, Navigate, useLocation } from "react-router-dom";

// ── Oficina Técnica pages ─────────────────────────────────────
import Dashboard from "./pages/oficina-tecnica/Dashboard";
import Machines from "./pages/oficina-tecnica/Machines";
import Logs from "./pages/oficina-tecnica/Logs";
import MonthlyCalendar from "./pages/oficina-tecnica/MonthlyCalendar";
import Fuel from "./pages/oficina-tecnica/Fuel";
import Payroll from "./pages/oficina-tecnica/Payroll";
import PaymentStatus from "./pages/oficina-tecnica/PaymentStatus";
import FuelPriceManager from "./pages/oficina-tecnica/FuelPriceManager";
import OC from "./pages/oficina-tecnica/OC";
import Consolidado from "./pages/oficina-tecnica/Consolidado";
import Rendiciones from "./pages/oficina-tecnica/Rendiciones";
import Subcontratos from "./pages/oficina-tecnica/Subcontratos";
import Pasajes from "./pages/oficina-tecnica/Pasajes";
import ReportDetallado from "./pages/reportes/ReportDetallado";
import ReporteWorkFleet from "./pages/reportes/ReporteWorkFleet";
import ReporteCombustible from "./pages/reportes/ReporteCombustible";
import AdminPanel from "./pages/reportes/AdminPanel";
import RRHH from "./pages/rrhh";

// ── App shells ────────────────────────────────────────────────
import ReportesShell from "./pages/reportes/ReportesShell";
import RRHHShell from "./pages/rrhh/RRHHShell";
import OperadoresApp from "./pages/operadores";
import FinanzasApp from "./pages/finanzas/FinanzasApp.jsx";
import ContabilidadApp from "./pages/contabilidad/ContabilidadApp.jsx";
import DocumentosApp from "./pages/documentos/DocumentosApp.jsx";

// ── Auth / onboarding pages ───────────────────────────────────
import LandingPage from "./pages/LandingPage.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import RegisterPage from "./pages/RegisterPage.jsx";
import AppSelector from "./pages/AppSelector.jsx";
import TrabajadorApp from "./pages/TrabajadorApp.jsx";
import PricingPage from "./pages/PricingPage.jsx";
import PaymentResult from "./pages/PaymentResult.jsx";
import EmpresaSetup from "./pages/EmpresaSetup.jsx";
import InviteAccept from "./pages/InviteAccept.jsx";

// ── Misc components ───────────────────────────────────────────
import CombustibleModal from "./pages/combustible/CombustibleModal";
import ConnectionStatus from "./components/ConnectionStatus";
import InstallPWA from "./components/InstallPWA";
import SessionExpiryIndicator from "./components/SessionExpiryIndicator";

// ── Firebase ──────────────────────────────────────────────────
import { auth, googleProvider, db } from "./lib/firebase";
import { EmpresaProvider } from "./lib/useEmpresa";
import { signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, onSnapshot } from "firebase/firestore";
import { usePlan } from "./hooks/usePlan.js";

// ============================================================
// Shell principal (Oficina Técnica / FleetCore)
// ============================================================
function Shell({ user, onLogout, selectedApp, onBackToSelector, onGoToPricing }) {
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showCostsMenu, setShowCostsMenu] = useState(false);
  const [showProductionMenu, setShowProductionMenu] = useState(false);
  const [showAdminMenu, setShowAdminMenu] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [userRole, setUserRole] = useState('operador');

  const { planData, status, isActive } = usePlan();

  useEffect(() => {
    if (!user) return;
    getDoc(doc(db, 'users', user.uid))
      .then(snap => { if (snap.exists()) setUserRole(snap.data().role || 'operador'); })
      .catch(() => { });
  }, [user]);

  return (
    <div className="min-h-screen bg-slate-50 relative">
      <div className="fixed inset-0 bg-grid opacity-30 pointer-events-none" />
      <div className="fixed top-0 right-0 w-[1000px] h-[1000px] bg-gradient-radial from-blue-100/50 via-transparent to-transparent blur-3xl pointer-events-none" />

      <header className="sticky top-0 z-40 glass-card border-b border-slate-200/50">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-1 sm:py-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 sm:gap-4 lg:gap-5 animate-fadeInUp">
              <img src="/favicon.svg" alt="Fleet Core Logo" className="h-14 w-14 object-contain block sm:hidden" />
              <img src="/logo-header.svg" alt="Fleet Core Logo" className="h-14 w-auto object-contain hidden sm:block" />
            </div>

            <div className="flex items-center gap-3 sm:gap-4 animate-slideInRight">
              {user && (
                <div className="relative">
                  <button onClick={() => setShowUserMenu(!showUserMenu)} className="flex items-center gap-2 sm:gap-4 px-3 sm:px-5 py-2 sm:py-3 rounded-lg sm:rounded-xl bg-white hover:bg-slate-50 border border-slate-200 shadow-sm hover:shadow-md transition-all group">
                    <div className="relative">
                      <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-gradient-to-br from-blue-900 to-blue-700 flex items-center justify-center shadow-md">
                        <span className="text-white text-xs sm:text-sm font-bold">{user.email?.[0]?.toUpperCase() || "U"}</span>
                      </div>
                      <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 sm:w-3 sm:h-3 bg-emerald-500 rounded-full border-2 border-white" />
                    </div>
                    <div className="hidden lg:block text-left">
                      <div className="text-sm font-semibold text-slate-900">{user.email?.split('@')[0]}</div>
                      <div className="text-xs text-slate-500 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500 inline-block" />
                        Plan {planData?.name || 'Starter'}
                        {status === 'trial' && <span className="text-amber-500">(trial)</span>}
                      </div>
                    </div>
                    <svg className={`w-3 h-3 sm:w-4 sm:h-4 text-slate-400 transition-transform ${showUserMenu ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {showUserMenu && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setShowUserMenu(false)} />
                      <div className="absolute right-0 top-full mt-2 sm:mt-3 w-64 sm:w-72 bg-white rounded-xl sm:rounded-2xl shadow-xl border border-slate-200 z-50 overflow-hidden animate-scaleIn">
                        <div className="p-4 sm:p-5 bg-gradient-to-br from-slate-50 to-white border-b border-slate-100">
                          <div className="flex items-center gap-3 sm:gap-4">
                            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-gradient-to-br from-blue-900 to-blue-700 flex items-center justify-center shadow-lg">
                              <span className="text-white text-base sm:text-lg font-bold">{user.email?.[0]?.toUpperCase() || "U"}</span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="font-semibold text-sm sm:text-base text-slate-900 truncate">{user.email?.split('@')[0]}</div>
                              <div className="text-xs sm:text-sm text-slate-600 truncate">{user.email}</div>
                              <div className="inline-flex items-center gap-1.5 mt-1 px-2 py-0.5 bg-emerald-100 text-emerald-700 text-xs font-semibold rounded-full">
                                <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />Conectado
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="p-2 space-y-1">
                          <button
                            onClick={() => { setShowUserMenu(false); onGoToPricing(); }}
                            className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-blue-700 hover:bg-blue-50 rounded-xl transition-colors"
                          >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                            </svg>
                            Mi plan · {planData?.name || 'Starter'}
                          </button>
                          <button onClick={onBackToSelector} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-blue-700 hover:bg-blue-50 rounded-xl transition-colors">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
                            Cambiar Aplicación
                          </button>
                          <button onClick={onLogout} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-red-700 hover:bg-red-50 rounded-xl transition-colors">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                            Cerrar Sesión
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}
              <button onClick={() => setShowMobileMenu(!showMobileMenu)} className="lg:hidden p-2 rounded-lg hover:bg-slate-100 transition-colors">
                <svg className="w-6 h-6 text-slate-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  {showMobileMenu
                    ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />}
                </svg>
              </button>
            </div>
          </div>

          {/* Desktop Nav */}
          <nav className="hidden lg:flex items-center gap-3 mt-6 pt-6 border-t border-slate-200/50">
            <NavTab to="/fleetcore" label="Dashboard" locked={userRole === 'mandante'} />

            {/* Maquinaria dropdown */}
            <div className="relative">
              <button
                onClick={() => { if (!['mandante'].includes(userRole)) { setShowProductionMenu(!showProductionMenu); setShowCostsMenu(false); } }}
                disabled={userRole === 'mandante'}
                className={`flex items-center gap-2 px-6 py-3 text-sm font-semibold rounded-xl transition-all ${userRole === 'mandante' ? 'text-slate-400 cursor-not-allowed opacity-60' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'}`}
              >
                {userRole === 'mandante' && <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>}
                Maquinaria
                <svg className={`w-4 h-4 transition-transform ${showProductionMenu ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
              </button>
              {showProductionMenu && !['mandante'].includes(userRole) && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowProductionMenu(false)} />
                  <div className="absolute left-0 top-full mt-2 w-72 bg-white rounded-2xl shadow-xl border border-slate-200 z-50 overflow-hidden animate-scaleIn">
                    <div className="p-2 space-y-1">
                      {[
                        { to: "/fleetcore/machines", label: "Equipos", colors: "from-blue-50 to-cyan-50 text-blue-700", icon: "M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" },
                        { to: "/fleetcore/logs", label: "Diario de Obra", colors: "from-green-50 to-emerald-50 text-green-700", icon: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" },
                        { to: "/fleetcore/calendar", label: "Calendario", colors: "from-purple-50 to-pink-50 text-purple-700", icon: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" },
                        { to: "/fleetcore/fuel", label: "Combustible", colors: "from-orange-50 to-amber-50 text-orange-700", icon: "M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" },
                      ].map(item => (
                        <NavLink key={item.to} to={item.to} onClick={() => setShowProductionMenu(false)}
                          className={({ isActive }) => `flex items-center gap-3 px-4 py-3 text-sm font-bold rounded-lg transition-colors ${isActive ? `bg-gradient-to-r ${item.colors}` : `text-slate-900 hover:bg-gradient-to-r hover:${item.colors}`}`}>
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.icon} /></svg>
                          {item.label}
                        </NavLink>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Control de Producción dropdown */}
            <div className="relative">
              <button
                onClick={() => { if (!['mandante'].includes(userRole)) { setShowCostsMenu(!showCostsMenu); setShowProductionMenu(false); } }}
                disabled={userRole === 'mandante'}
                className={`flex items-center gap-2 px-6 py-3 text-sm font-semibold rounded-xl transition-all ${userRole === 'mandante' ? 'text-slate-400 cursor-not-allowed opacity-60' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'}`}
              >
                {userRole === 'mandante' && <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>}
                Control de Producción y EP
                <svg className={`w-4 h-4 transition-transform ${showCostsMenu ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
              </button>
              {showCostsMenu && !['mandante'].includes(userRole) && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowCostsMenu(false)} />
                  <div className="absolute left-0 top-full mt-2 w-72 bg-white rounded-2xl shadow-xl border border-slate-200 z-50 overflow-hidden animate-scaleIn">
                    <div className="p-2 space-y-1">
                      {[
                        { to: "/fleetcore/payroll", label: "Registro Diario", colors: "from-emerald-50 to-teal-50 text-emerald-700", icon: "M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" },
                        { to: "/fleetcore/reporte-workfleet", label: "Equipos y Servicios", colors: "from-blue-50 to-cyan-50 text-blue-700", icon: "M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" },
                        { to: "/fleetcore/consolidado", label: "Detalle Flota", colors: "from-indigo-50 to-blue-50 text-indigo-700", icon: "M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" },
                        { to: "/fleetcore/payment-status", label: "Estado de Pago", colors: "from-violet-50 to-purple-50 text-violet-700", icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" },
                        { to: "/fleetcore/rendiciones", label: "Rendiciones", colors: "from-amber-50 to-yellow-50 text-amber-700", icon: "M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" },
                        { to: "/fleetcore/pasajes", label: "Pasajes", colors: "from-sky-50 to-blue-50 text-sky-700", icon: "M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" },
                        { to: "/fleetcore/subcontratos", label: "Subcontratos", colors: "from-teal-50 to-cyan-50 text-teal-700", icon: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" },
                        { to: "/fleetcore/oc", label: "Órdenes de Compra", colors: "from-rose-50 to-pink-50 text-rose-700", icon: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" },
                      ].map(item => (
                        <NavLink key={item.to} to={item.to} onClick={() => setShowCostsMenu(false)}
                          className={({ isActive }) => `flex items-center gap-3 px-4 py-3 text-sm font-bold rounded-lg transition-colors ${isActive ? `bg-gradient-to-r ${item.colors}` : `text-slate-900 hover:bg-gradient-to-r hover:${item.colors}`}`}>
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.icon} /></svg>
                          {item.label}
                        </NavLink>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>

            <NavTab to="/fleetcore/fuel-price" label="Combustible" locked={userRole === 'mandante'} />
          </nav>
        </div>

        {/* Mobile menu */}
        {showMobileMenu && (
          <>
            <div className="lg:hidden fixed inset-0 bg-black/60 z-[60] animate-fadeIn" onClick={() => setShowMobileMenu(false)} />
            <div className="lg:hidden fixed top-0 right-0 bottom-0 w-full sm:w-80 bg-white z-[70] shadow-2xl animate-slideInRight flex flex-col">
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200" style={{ background: 'linear-gradient(135deg,#2A3F5F 0%,#0F1C2E 100%)' }}>
                <div className="flex items-center gap-3">
                  <img src="/favicon.svg" alt="Logo" className="w-7 h-7 object-contain" />
                  <h2 className="text-base font-black text-white">Menú</h2>
                </div>
                <button onClick={() => setShowMobileMenu(false)} className="p-1.5 rounded-lg bg-white/15 hover:bg-white/25 transition-colors">
                  <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <nav className="flex-1 overflow-y-auto p-4 space-y-1">
                <MobileNavLink to="/fleetcore" label="Dashboard" onClick={() => setShowMobileMenu(false)} />
                <div className="h-px bg-slate-200 my-4" />
                <div className="px-4 py-2 text-xs font-black text-slate-500 uppercase tracking-wider">Producción</div>
                <MobileNavLink to="/fleetcore/machines" label="Equipos" onClick={() => setShowMobileMenu(false)} />
                <MobileNavLink to="/fleetcore/logs" label="Diario de Obra" onClick={() => setShowMobileMenu(false)} />
                <MobileNavLink to="/fleetcore/calendar" label="Calendario" onClick={() => setShowMobileMenu(false)} />
                <MobileNavLink to="/fleetcore/fuel" label="Combustible" onClick={() => setShowMobileMenu(false)} />
                <MobileNavLink to="/fleetcore/reporte-detallado" label="Reporte Detallado" onClick={() => setShowMobileMenu(false)} />
                <div className="h-px bg-slate-200 my-4" />
                <div className="px-4 py-2 text-xs font-black text-slate-500 uppercase tracking-wider">Costos</div>
                <MobileNavLink to="/fleetcore/payroll" label="Remuneraciones" onClick={() => setShowMobileMenu(false)} />
                <MobileNavLink to="/fleetcore/payment-status" label="Estados de Pago" onClick={() => setShowMobileMenu(false)} />
                <MobileNavLink to="/fleetcore/rendiciones" label="Rendiciones" onClick={() => setShowMobileMenu(false)} />
                <MobileNavLink to="/fleetcore/subcontratos" label="Subcontratos" onClick={() => setShowMobileMenu(false)} />
                <MobileNavLink to="/fleetcore/oc" label="Órdenes de Compra" onClick={() => setShowMobileMenu(false)} />
                <MobileNavLink to="/fleetcore/consolidado" label="Consolidado Total" onClick={() => setShowMobileMenu(false)} />
                <div className="h-px bg-slate-200 my-4" />
                <div className="px-4 py-2 text-xs font-black text-slate-500 uppercase tracking-wider">Configuración</div>
                <MobileNavLink to="/fleetcore/fuel-price" label="Precios Combustible" onClick={() => setShowMobileMenu(false)} />
                <div className="h-px bg-slate-200 my-4" />
                <button
                  onClick={() => { setShowMobileMenu(false); onGoToPricing(); }}
                  className="flex items-center gap-3 px-4 py-3 w-full rounded-xl font-semibold text-sm text-blue-700 hover:bg-blue-50 transition-all"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                  </svg>
                  Mi plan · {planData?.name || 'Starter'}
                </button>
              </nav>
            </div>
          </>
        )}
      </header>

      <main className="max-w-[1400px] mx-auto px-0 sm:px-4 lg:px-8 py-4 sm:py-6 lg:py-8">
        <Routes>
          <Route path="/reporte-workfleet" element={<ReporteWorkFleet />} />
          {!['mandante'].includes(userRole) ? (
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
              {['superadmin', 'admin_contrato'].includes(userRole) && <Route path="/admin" element={<AdminPanel />} />}
              {['superadmin'].includes(userRole) && <Route path="/rrhh" element={<RRHH />} />}
            </>
          ) : (
            <Route path="*" element={<Navigate to="/reporte-workfleet" replace />} />
          )}
        </Routes>
      </main>

      <footer className="border-t border-slate-200/50 mt-8 sm:mt-12 lg:mt-16">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs sm:text-sm text-slate-600">
            <div className="flex items-center gap-2">
              <img src="/favicon.svg" alt="Fleet Core" className="h-6 w-6 object-contain" />
              <span className="font-medium">FleetCore by <strong>SAER TI</strong></span>
            </div>
            <div className="text-center sm:text-right">© {new Date().getFullYear()} Todos los derechos reservados</div>
          </div>
        </div>
      </footer>
    </div>
  );
}

// ============================================================
// NavTab / MobileNavLink helpers (usados por Shell)
// ============================================================
function NavTab({ to, label, locked = false }) {
  if (locked) {
    return (
      <button disabled className="relative px-6 py-3 text-sm font-semibold rounded-xl transition-all text-slate-400 cursor-not-allowed opacity-60 flex items-center gap-2" title="Acceso restringido">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
        <span>{label}</span>
      </button>
    );
  }
  return (
    <NavLink to={to} end={to === "/fleetcore" || to === "/"} className={({ isActive }) => `relative px-6 py-3 text-sm font-semibold rounded-xl transition-all ${isActive ? "text-white" : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"}`}>
      {({ isActive }) => (
        <>
          {isActive && <div className="absolute inset-0 bg-gradient-to-r from-blue-900 to-blue-700 rounded-xl shadow-lg" />}
          <span className="relative z-10">{label}</span>
        </>
      )}
    </NavLink>
  );
}

function MobileNavLink({ to, label, onClick }) {
  return (
    <NavLink to={to} end={to === "/fleetcore" || to === "/"} onClick={onClick}
      className={({ isActive }) => `flex items-center px-4 py-3 rounded-xl font-semibold text-sm transition-all ${isActive ? "bg-gradient-to-r from-blue-900 to-blue-700 text-white shadow-lg" : "text-slate-700 hover:bg-slate-100"}`}>
      {label}
    </NavLink>
  );
}

// ============================================================
// PWAWrapper — envuelve cada shell con providers y componentes PWA
// ============================================================
function PWAWrapper({ user, children }) {
  return (
    <EmpresaProvider user={user}>
      <ConnectionStatus />
      <InstallPWA />
      <SessionExpiryIndicator />
      {children}
    </EmpresaProvider>
  );
}

// ============================================================
// Mapa declarativo de apps
// ============================================================
const APP_MAP = {
  workfleet: OperadoresApp,
  'workfleet-m': OperadoresApp,
  rrhh: RRHHShell,
  reportes: ReportesShell,
  finanzas: FinanzasApp,
  contabilidad: ContabilidadApp,
  documentos: DocumentosApp,
};

// ============================================================
// App root
// ============================================================
export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [postInvite, setPostInvite] = useState(false);
  const [userRole, setUserRole] = useState('operador');
  const [userModulos, setUserModulos] = useState([]);

  const { canAccess, loading: planLoading, subscription } = usePlan();
  const navigate = useNavigate();
  const location = useLocation();

  const isTrabajadorRoute = location.pathname.startsWith('/trabajador');
  const inviteMatch = !postInvite && location.pathname.match(/^\/invite\/([a-zA-Z0-9]+)$/);
  const inviteToken = inviteMatch ? inviteMatch[1] : null;

  useEffect(() => {
    if (isTrabajadorRoute || inviteToken) {
      setLoading(false);
      return;
    }

    let unsubUserDoc = null;

    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      
      if (unsubUserDoc) {
        unsubUserDoc();
        unsubUserDoc = null;
      }

      if (currentUser) {
        // Escuchar el documento del usuario en tiempo real para reaccionar al registro inmediato
        unsubUserDoc = onSnapshot(doc(db, 'users', currentUser.uid), (snap) => {
          if (snap.exists()) {
            const data = snap.data();
            setUserRole(data.role || 'operador');
            setUserModulos(data.modulos || []);
            if (data.empresaId) {
              setNeedsSetup(false);
            } else {
              setNeedsSetup(true);
            }
          } else {
            setUserRole('operador');
            setUserModulos([]);
            setNeedsSetup(true);
          }
          setLoading(false);
        }, (err) => {
          console.error("Error listening to user document:", err);
          setUserRole('operador');
          setUserModulos([]);
          setNeedsSetup(true);
          setLoading(false);
        });
      } else {
        setUserRole('operador');
        setUserModulos([]);
        setNeedsSetup(false);
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubUserDoc) unsubUserDoc();
    };
  }, [isTrabajadorRoute, inviteToken]);

  // ── Gating de Módulos / Acceso en App.jsx por URL ───────────────────
  useEffect(() => {
    if (loading || !user) return;

    const path = location.pathname;
    const match = path.match(/^\/([^\/]+)/);
    if (!match) return;
    const appName = match[1];

    // Ignorar si no es una app/modulo que requiere gating
    const gatedApps = ['fleetcore', 'workfleet', 'workfleet-m', 'rrhh', 'reportes', 'finanzas', 'contabilidad', 'documentos'];
    if (!gatedApps.includes(appName)) return;

    const isSuperAdmin = userRole === 'superadmin';
    const isAdminContrato = userRole === 'admin_contrato';
    const isRevisorAdmin = userRole === 'revisor_admin';
    const isRevisor = userRole === 'revisor';
    const isMandanteAdmin = userRole === 'mandante_admin';
    const isMandante = userRole === 'mandante';
    const isRevisorRole = isRevisorAdmin || isRevisor || isMandanteAdmin || isMandante;
    const hasModulo = (m) => isSuperAdmin || (userModulos && userModulos.includes(m));

    let allowed = false;

    if (appName === 'fleetcore') {
      allowed = isSuperAdmin || (isAdminContrato && canAccess('fleetcore')) || ((userRole === 'administrativo' && hasModulo('fleetcore')) && canAccess('fleetcore'));
    } else if (appName === 'workfleet' || appName === 'workfleet-m') {
      allowed = isSuperAdmin || (isAdminContrato && canAccess('workfleet')) || ((userRole === 'administrativo' && hasModulo('workfleet')) && canAccess('workfleet')) || (userRole === 'operador' && canAccess('workfleet'));
    } else if (appName === 'rrhh') {
      allowed = isSuperAdmin || (isAdminContrato && canAccess('rrhh')) || ((userRole === 'administrativo' && hasModulo('rrhh')) && canAccess('rrhh'));
    } else if (appName === 'reportes') {
      allowed = isSuperAdmin || (isAdminContrato && canAccess('reportes')) || ((userRole === 'administrativo' && hasModulo('reportes')) && canAccess('reportes'));
    } else if (appName === 'finanzas') {
      allowed = isSuperAdmin || (isAdminContrato && canAccess('finanzas')) || ((userRole === 'administrativo' && hasModulo('finanzas')) && canAccess('finanzas'));
    } else if (appName === 'contabilidad') {
      allowed = isSuperAdmin || (isAdminContrato && canAccess('contabilidad')) || ((userRole === 'administrativo' && hasModulo('contabilidad')) && canAccess('contabilidad'));
    } else if (appName === 'documentos') {
      allowed = isSuperAdmin || (isAdminContrato && canAccess('fleetcore')) || isRevisorRole || ((userRole === 'administrativo' && hasModulo('fleetcore')) && canAccess('fleetcore'));
    }

    if (!allowed && !planLoading) {
      console.warn(`Acceso denegado a módulo: ${appName}. Redirigiendo a selector.`);
      navigate('/');
    }
  }, [location.pathname, userRole, userModulos, subscription, loading, planLoading, user, canAccess, navigate]);

  const handleInviteAccepted = () => {
    window.history.pushState({}, '', '/');
    setUser(auth.currentUser);
    setPostInvite(true);
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      localStorage.removeItem('selectedApp');
      navigate('/');
    } catch (err) {
      console.error("Error en logout:", err);
    }
  };

  const handleBackToSelector = () => {
    localStorage.removeItem('selectedApp');
    navigate('/');
  };

  const handleGoToPricing = () => {
    localStorage.setItem('selectedApp', 'pricing');
    navigate('/pricing');
  };

  const handleSelectApp = (app) => {
    localStorage.setItem('selectedApp', app);
    navigate(`/${app}`);
  };

  // ── Rutas especiales (sin auth) ───────────────────────────
  if (isTrabajadorRoute) return <TrabajadorApp />;
  if (inviteToken) return <InviteAccept token={inviteToken} onAccepted={handleInviteAccepted} />;

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-900 to-slate-900 flex items-center justify-center p-4">
        <div className="text-center">
          <div className="mb-4 flex justify-center animate-pulse">
            <img src="/favicon.svg" alt="Fleet Core" className="h-20 sm:h-24 w-auto object-contain" />
          </div>
          <div className="text-sm sm:text-base font-bold text-white mt-2">Fleet<span className="text-blue-300">Core</span></div>
          <div className="text-xs text-blue-200 mt-1">Cargando...</div>
        </div>
      </div>
    );
  }

  return (
    <Routes>
      {!user ? (
        <>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/payment-result" element={<PaymentResult onBack={() => window.location.href = '/'} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </>
      ) : (
        <>
          {needsSetup ? (
            <Route path="*" element={
              <EmpresaSetup
                user={user}
                onComplete={() => { setNeedsSetup(false); window.location.reload(); }}
                onLogout={handleLogout}
              />
            } />
          ) : (
            <>
              <Route path="/" element={
                <AppSelector
                  user={user}
                  onLogout={handleLogout}
                  onSelectApp={handleSelectApp}
                />
              } />

              <Route path="/pricing" element={
                <PricingPage
                  onBack={() => navigate('/')}
                />
              } />

              <Route path="/payment-result" element={
                <PaymentResult onBack={handleBackToSelector} />
              } />

              <Route path="/fleetcore/*" element={
                <PWAWrapper user={user}>
                  <Shell
                    user={user}
                    onLogout={handleLogout}
                    selectedApp="fleetcore"
                    onBackToSelector={handleBackToSelector}
                    onGoToPricing={handleGoToPricing}
                  />
                </PWAWrapper>
              } />

              <Route path="/workfleet/*" element={
                <PWAWrapper user={user}>
                  <OperadoresApp
                    user={user}
                    onLogout={handleLogout}
                    onBackToSelector={handleBackToSelector}
                  />
                </PWAWrapper>
              } />

              <Route path="/workfleet-m/*" element={
                <PWAWrapper user={user}>
                  <OperadoresApp
                    user={user}
                    onLogout={handleLogout}
                    onBackToSelector={handleBackToSelector}
                  />
                </PWAWrapper>
              } />

              <Route path="/rrhh/*" element={
                <PWAWrapper user={user}>
                  <RRHHShell
                    user={user}
                    onLogout={handleLogout}
                    onBackToSelector={handleBackToSelector}
                  />
                </PWAWrapper>
              } />

              <Route path="/reportes/*" element={
                <PWAWrapper user={user}>
                  <ReportesShell
                    user={user}
                    onLogout={handleLogout}
                    onBackToSelector={handleBackToSelector}
                  />
                </PWAWrapper>
              } />

              <Route path="/finanzas/*" element={
                <PWAWrapper user={user}>
                  <FinanzasApp
                    user={user}
                    onLogout={handleLogout}
                    onBackToSelector={handleBackToSelector}
                  />
                </PWAWrapper>
              } />

              <Route path="/contabilidad/*" element={
                <PWAWrapper user={user}>
                  <ContabilidadApp
                    user={user}
                    onLogout={handleLogout}
                    onBackToSelector={handleBackToSelector}
                  />
                </PWAWrapper>
              } />

              <Route path="/documentos/*" element={
                <PWAWrapper user={user}>
                  <DocumentosApp
                    user={user}
                    onLogout={handleLogout}
                    onBackToSelector={handleBackToSelector}
                  />
                </PWAWrapper>
              } />

              <Route path="*" element={<Navigate to="/" replace />} />
            </>
          )}
        </>
      )}
    </Routes>
  );
}
