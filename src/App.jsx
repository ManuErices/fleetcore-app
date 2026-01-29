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
  const [showProductionMenu, setShowProductionMenu] = useState(false); // NUEVO

  return (
    <div className="min-h-screen bg-slate-50 relative">
      {/* Background decorativo sutil */}
      <div className="fixed inset-0 bg-grid opacity-30 pointer-events-none" />
      <div className="fixed top-0 right-0 w-[1000px] h-[1000px] bg-gradient-radial from-blue-100/50 via-transparent to-transparent blur-3xl pointer-events-none" />

      {/* Header con glassmorphism */}
      <header className="sticky top-0 z-50 glass-card border-b border-slate-200/50">
        <div className="max-w-[1400px] mx-auto px-8 py-5">
          <div className="flex items-center justify-between">
            {/* Logo y título */}
            <div className="flex items-center gap-5 animate-fadeInUp">
              <div className="relative group">
                {/* Glow effect */}
                <div className="absolute inset-0 bg-gradient-to-br from-blue-500 to-orange-500 rounded-2xl blur-xl opacity-50 group-hover:opacity-75 transition-opacity" />
                
                {/* Logo - Engranaje */}
                <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-900 to-blue-700 flex items-center justify-center shadow-lg transform group-hover:scale-105 transition-transform">
                  <svg className="w-9 h-9 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
              </div>
              
              <div>
                <h1 className="text-2xl font-black text-slate-900 tracking-tight">
                  Fleet<span className="bg-gradient-to-r from-blue-900 to-blue-600 bg-clip-text text-transparent">Core</span>
                </h1>
                <p className="text-sm text-slate-600 mt-0.5 font-medium">
                  El núcleo de tu operación • Nuevo Cobre
                </p>
              </div>
            </div>

            {/* User section */}
            <div className="flex items-center gap-4 animate-slideInRight">
              {user ? (
                <div className="relative">
                  <button
                    onClick={() => setShowUserMenu(!showUserMenu)}
                    className="flex items-center gap-4 px-5 py-3 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 shadow-sm hover:shadow-md transition-all group"
                  >
                    {/* Avatar */}
                    <div className="relative">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-900 to-blue-700 flex items-center justify-center shadow-md">
                        <span className="text-white text-sm font-bold">
                          {user.email?.[0]?.toUpperCase() || "U"}
                        </span>
                      </div>
                      <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 rounded-full border-2 border-white" />
                    </div>

                    {/* User info */}
                    <div className="hidden md:block text-left">
                      <div className="text-sm font-semibold text-slate-900">{user.email?.split('@')[0]}</div>
                      <div className="text-xs text-slate-500">Administrador</div>
                    </div>

                    {/* Chevron */}
                    <svg 
                      className={`w-4 h-4 text-slate-400 transition-transform ${showUserMenu ? 'rotate-180' : ''}`} 
                      fill="none" 
                      viewBox="0 0 24 24" 
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {/* Dropdown menu */}
                  {showUserMenu && (
                    <>
                      {/* Backdrop */}
                      <div 
                        className="fixed inset-0 z-40" 
                        onClick={() => setShowUserMenu(false)}
                      />
                      
                      {/* Menu */}
                      <div className="absolute right-0 top-full mt-3 w-72 bg-white rounded-2xl shadow-xl border border-slate-200 z-50 overflow-hidden animate-scaleIn">
                        {/* User info */}
                        <div className="p-5 bg-gradient-to-br from-slate-50 to-white border-b border-slate-100">
                          <div className="flex items-center gap-4">
                            <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-blue-900 to-blue-700 flex items-center justify-center shadow-lg">
                              <span className="text-white text-lg font-bold">
                                {user.email?.[0]?.toUpperCase() || "U"}
                              </span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="font-semibold text-slate-900 truncate">{user.email?.split('@')[0]}</div>
                              <div className="text-sm text-slate-600 truncate">{user.email}</div>
                              <div className="inline-flex items-center gap-1.5 mt-1 px-2 py-0.5 bg-emerald-100 text-emerald-700 text-xs font-semibold rounded-full">
                                <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                                Conectado
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Actions */}
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
                  className="px-6 py-3 rounded-xl font-semibold text-white bg-gradient-to-r from-blue-900 to-blue-700 hover:from-blue-800 hover:to-blue-600 shadow-lg hover:shadow-xl transition-all flex items-center gap-2"
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12.545,10.239v3.821h5.445c-0.712,2.315-2.647,3.972-5.445,3.972c-3.332,0-6.033-2.701-6.033-6.032s2.701-6.032,6.033-6.032c1.498,0,2.866,0.549,3.921,1.453l2.814-2.814C17.503,2.988,15.139,2,12.545,2C7.021,2,2.543,6.477,2.543,12s4.478,10,10.002,10c8.396,0,10.249-7.85,9.426-11.748L12.545,10.239z"/>
                  </svg>
                  Ingresar con Google
                </button>
              )}
            </div>
          </div>

          {/* Navigation tabs */}
          <nav className="flex gap-2 mt-6">
            <NavTab to="/" label="Dashboard" />
            <NavTab to="/reporte-detallado" label="Reporte Detallado" />
            
            {/* NUEVO DROPDOWN: Control de Producción y Estados de Pago */}
            <div className="relative">
              <button
                onClick={() => setShowProductionMenu(!showProductionMenu)}
                className="relative px-6 py-3 text-sm font-semibold rounded-xl transition-all text-slate-600 hover:text-slate-900 hover:bg-slate-100 flex items-center gap-2"
              >
                <span className="relative z-10">Control de Producción y Estados de Pago</span>
                <svg 
                  className={`w-4 h-4 transition-transform ${showProductionMenu ? 'rotate-180' : ''}`} 
                  fill="none" 
                  viewBox="0 0 24 24" 
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {/* Dropdown menu */}
              {showProductionMenu && (
                <>
                  {/* Backdrop */}
                  <div 
                    className="fixed inset-0 z-40" 
                    onClick={() => setShowProductionMenu(false)}
                  />
                  
                  {/* Menu */}
                  <div className="absolute left-0 top-full mt-2 w-72 bg-white rounded-xl shadow-xl border border-slate-200 z-50 overflow-hidden animate-scaleIn">
                    <div className="p-2">
                      {/* Registro Diario */}
                      <NavLink
                        to="/logs"
                        onClick={() => setShowProductionMenu(false)}
                        className={({ isActive }) =>
                          `flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-lg transition-colors ${
                            isActive
                              ? "bg-blue-50 text-blue-700"
                              : "text-slate-700 hover:bg-slate-50"
                          }`
                        }
                      >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                        </svg>
                        Registro Diario
                      </NavLink>

                      {/* Equipos y Servicios */}
                      <NavLink
                        to="/machines"
                        onClick={() => setShowProductionMenu(false)}
                        className={({ isActive }) =>
                          `flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-lg transition-colors ${
                            isActive
                              ? "bg-blue-50 text-blue-700"
                              : "text-slate-700 hover:bg-slate-50"
                          }`
                        }
                      >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                        </svg>
                        Equipos y Servicios
                      </NavLink>

                      {/* Detalle Flota */}
                      <NavLink
                        to="/calendar"
                        onClick={() => setShowProductionMenu(false)}
                        className={({ isActive }) =>
                          `flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-lg transition-colors ${
                            isActive
                              ? "bg-blue-50 text-blue-700"
                              : "text-slate-700 hover:bg-slate-50"
                          }`
                        }
                      >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        Detalle Flota
                      </NavLink>

                      {/* Divisor */}
                      <div className="h-px bg-slate-200 my-2" />

                      {/* Estado de Pago - EN NEGRITA */}
                      <NavLink
                        to="/payment-status"
                        onClick={() => setShowProductionMenu(false)}
                        className={({ isActive }) =>
                          `flex items-center gap-3 px-4 py-3 text-sm font-bold rounded-lg transition-colors ${
                            isActive
                              ? "bg-gradient-to-r from-blue-50 to-indigo-50 text-blue-700"
                              : "text-slate-900 hover:bg-gradient-to-r hover:from-blue-50 hover:to-indigo-50"
                          }`
                        }
                      >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Estado de Pago
                      </NavLink>
                    </div>
                  </div>
                </>
              )}
            </div>
            
            {/* Dropdown de Costos Asociados */}
            <div className="relative">
              <button
                onClick={() => setShowCostsMenu(!showCostsMenu)}
                className="relative px-6 py-3 text-sm font-semibold rounded-xl transition-all text-slate-600 hover:text-slate-900 hover:bg-slate-100 flex items-center gap-2"
              >
                <span className="relative z-10">Costos Asociados</span>
                <svg 
                  className={`w-4 h-4 transition-transform ${showCostsMenu ? 'rotate-180' : ''}`} 
                  fill="none" 
                  viewBox="0 0 24 24" 
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {/* Dropdown menu */}
              {showCostsMenu && (
                <>
                  {/* Backdrop */}
                  <div 
                    className="fixed inset-0 z-40" 
                    onClick={() => setShowCostsMenu(false)}
                  />
                  
                  {/* Menu */}
                  <div className="absolute left-0 top-full mt-2 w-64 bg-white rounded-xl shadow-xl border border-slate-200 z-50 overflow-hidden animate-scaleIn">
                    <div className="p-2">
                      <NavLink
                        to="/fuel"
                        onClick={() => setShowCostsMenu(false)}
                        className={({ isActive }) =>
                          `flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-lg transition-colors ${
                            isActive
                              ? "bg-blue-50 text-blue-700"
                              : "text-slate-700 hover:bg-slate-50"
                          }`
                        }
                      >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                        Detalle Combustible
                      </NavLink>

                      <NavLink
                        to="/payroll"
                        onClick={() => setShowCostsMenu(false)}
                        className={({ isActive }) =>
                          `flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-lg transition-colors ${
                            isActive
                              ? "bg-blue-50 text-blue-700"
                              : "text-slate-700 hover:bg-slate-50"
                          }`
                        }
                      >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                        </svg>
                        Remuneraciones
                      </NavLink>

                      <NavLink
                        to="/oc"
                        onClick={() => setShowCostsMenu(false)}
                        className={({ isActive }) =>
                          `flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-lg transition-colors ${
                            isActive
                              ? "bg-blue-50 text-blue-700"
                              : "text-slate-700 hover:bg-slate-50"
                          }`
                        }
                      >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        Órdenes de Compra
                      </NavLink>

                      <NavLink
                        to="/rendiciones"
                        onClick={() => setShowCostsMenu(false)}
                        className={({ isActive }) =>
                          `flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-lg transition-colors ${
                            isActive
                              ? "bg-purple-50 text-purple-700"
                              : "text-slate-700 hover:bg-slate-50"
                          }`
                        }
                      >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                        </svg>
                        Rendiciones
                      </NavLink>

                      <NavLink
                        to="/subcontratos"
                        onClick={() => setShowCostsMenu(false)}
                        className={({ isActive }) =>
                          `flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-lg transition-colors ${
                            isActive
                              ? "bg-purple-50 text-purple-700"
                              : "text-slate-700 hover:bg-slate-50"
                          }`
                        }
                      >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                        </svg>
                        Subcontratos
                      </NavLink>

                      {/* Divisor */}
                      <div className="h-px bg-slate-200 my-2" />

                      {/* CONSOLIDADO */}
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
      </header>

      {/* Main content */}
      <main className="max-w-[1400px] mx-auto px-8 py-8">
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

      {/* Footer */}
      <footer className="border-t border-slate-200/50 mt-16">
        <div className="max-w-[1400px] mx-auto px-8 py-6">
          <div className="flex items-center justify-between text-sm text-slate-600">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-blue-900 to-blue-700 flex items-center justify-center">
                <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <span className="font-medium">FleetCore by <strong>MPF Ingeniería Civil SpA</strong></span>
            </div>
            <div>
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
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-blue-900 to-blue-700 flex items-center justify-center animate-pulse">
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <div className="text-2xl font-black text-slate-900">
            Fleet<span className="bg-gradient-to-r from-blue-900 to-blue-600 bg-clip-text text-transparent">Core</span>
          </div>
          <div className="text-sm text-slate-600 mt-2">Cargando...</div>
        </div>
      </div>
    );
  }

  return <Shell user={user} onLogin={handleLogin} onLogout={handleLogout} />;
}
