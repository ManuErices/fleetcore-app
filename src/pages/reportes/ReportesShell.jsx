import React, { useState, useEffect } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../lib/firebase";
import ReporteCombustible from "./ReporteCombustible";
import ReporteWorkFleet from "./ReporteWorkFleet";
import AdminPanel from "./AdminPanel";

const ROLE_LABELS = {
  superadmin: "Super Admin",
  admin_contrato: "Admin Contrato",
  administrativo: "Administrativo",
  operador: "Operador",
  mandante: "Mandante",
  trabajador: "Trabajador",
};

export default function ReportesShell({ user, onLogout, onBackToSelector }) {
  const [activeView, setActiveView] = useState("combustible");
  const [userRole, setUserRole] = useState(null);
  const [showUserMenu, setShowUserMenu] = useState(false);

  useEffect(() => {
    if (!user) return;
    getDoc(doc(db, "users", user.uid))
      .then((snap) => {
        if (snap.exists()) setUserRole(snap.data().role || "administrativo");
      })
      .catch(() => {});
  }, [user]);

  const isAdmin = ["superadmin", "admin_contrato"].includes(userRole);

  const navItems = [
    { id: "combustible", label: "Reporte Combustible" },
    { id: "maquinaria", label: "Reporte Maquinaria" },
    ...(isAdmin ? [{ id: "admin", label: "Administración" }] : []),
  ];

  const roleLabel = ROLE_LABELS[userRole] || "Usuario";

  return (
    <div className="min-h-screen bg-slate-50 relative">
      <div className="fixed inset-0 bg-grid opacity-30 pointer-events-none" />
      <header className="sticky top-0 z-40 glass-card border-b border-slate-200/50">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-1 sm:py-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 sm:gap-4 lg:gap-5 animate-fadeInUp">
              <img src="/favicon.svg" alt="Reportes" className="h-14 w-14 object-contain block sm:hidden" />
              <img src="/logo-header.svg" alt="Reportes" className="h-14 w-auto object-contain hidden sm:block" />
            </div>
            <div className="flex items-center gap-3 sm:gap-4 animate-slideInRight">
              {user && (
                <div className="relative">
                  <button
                    onClick={() => setShowUserMenu(!showUserMenu)}
                    className="flex items-center gap-2 sm:gap-4 px-3 sm:px-5 py-2 sm:py-3 rounded-lg sm:rounded-xl bg-white hover:bg-slate-50 border border-slate-200 shadow-sm hover:shadow-md transition-all group"
                  >
                    <div className="relative">
                      <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-gradient-to-br from-teal-700 to-cyan-700 flex items-center justify-center shadow-md">
                        <span className="text-white text-xs sm:text-sm font-bold">{user.email?.[0]?.toUpperCase() || "U"}</span>
                      </div>
                      <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 sm:w-3 sm:h-3 bg-emerald-500 rounded-full border-2 border-white" />
                    </div>
                    <div className="hidden lg:block text-left">
                      <div className="text-sm font-semibold text-slate-900">{user.email?.split("@")[0]}</div>
                      <div className="text-xs text-slate-500">{roleLabel}</div>
                    </div>
                    <svg className={`w-3 h-3 sm:w-4 sm:h-4 text-slate-400 transition-transform ${showUserMenu ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {showUserMenu && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setShowUserMenu(false)} />
                      <div className="absolute right-0 top-full mt-2 sm:mt-3 w-64 sm:w-72 bg-white rounded-xl sm:rounded-2xl shadow-xl border border-slate-200 z-50 overflow-hidden animate-scaleIn">
                        <div className="p-4 sm:p-5 bg-gradient-to-br from-slate-50 to-white border-b border-slate-100">
                          <div className="flex items-center gap-3 sm:gap-4">
                            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-gradient-to-br from-teal-700 to-cyan-700 flex items-center justify-center shadow-lg">
                              <span className="text-white text-base sm:text-lg font-bold">{user.email?.[0]?.toUpperCase() || "U"}</span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="font-semibold text-sm sm:text-base text-slate-900 truncate">{user.email?.split("@")[0]}</div>
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
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
                            Cambiar Aplicación
                          </button>
                          <button
                            onClick={onLogout}
                            className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-red-700 hover:bg-red-50 rounded-xl transition-colors"
                          >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                            Cerrar Sesión
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
          <nav className="hidden lg:flex items-center gap-3 mt-6 pt-6 border-t border-slate-200/50">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveView(item.id)}
                className={`flex items-center gap-2 px-6 py-3 text-sm font-semibold rounded-xl transition-all ${activeView === item.id ? "bg-teal-600 text-white shadow-md" : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"}`}
              >
                {item.label}
              </button>
            ))}
          </nav>
          <div className="lg:hidden flex gap-1 py-2 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveView(item.id)}
                className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${activeView === item.id ? "bg-teal-600 text-white shadow" : "text-slate-600 bg-white border border-slate-200"}`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </header>
      <main className="max-w-[1400px] mx-auto">
        {activeView === "combustible" && <ReporteCombustible />}
        {activeView === "maquinaria" && <ReporteWorkFleet />}
        {activeView === "admin" && isAdmin && <AdminPanel />}
      </main>
    </div>
  );
}
