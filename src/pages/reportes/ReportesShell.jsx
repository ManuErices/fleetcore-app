import React, { useState, useEffect } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useEmpresa } from "../../lib/useEmpresa";
import UserMenuDropdown from "../../components/UserMenuDropdown";
import ReporteCombustible from "./ReporteCombustible";
import ReporteWorkFleet from "./ReporteWorkFleet";
import AdminPanel from "./AdminPanel";

export default function ReportesShell({ user, userRole, onLogout, onBackToSelector }) {
  const [activeView, setActiveView] = useState("combustible");
  const { empresa } = useEmpresa();

  const isAdmin = ["superadmin", "admin_contrato", "administrativo"].includes(userRole);

  const navItems = [
    { id: "combustible", label: "Reporte Combustible" },
    { id: "maquinaria", label: "Reporte Maquinaria" },
    ...(isAdmin ? [{ id: "admin", label: "Administración" }] : []),
  ];

  return (
    <div className="min-h-screen bg-slate-50 relative">
      <div className="fixed inset-0 bg-grid opacity-30 pointer-events-none" />
      <header className="sticky top-0 z-40 glass-card border-b border-slate-200/50">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-1 sm:py-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 sm:gap-4 lg:gap-5 animate-fadeInUp">
              <img src="/favicon.svg" alt="Reportes" className="h-14 w-14 object-contain block sm:hidden" />
              <img src="/logo-header.svg" alt="Reportes" className="h-14 w-auto object-contain hidden sm:block" />
              {empresa && (
                <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-100 border border-slate-200">
                  {empresa.logoUrl
                    ? <img src={empresa.logoUrl} alt="" className="w-5 h-5 rounded object-contain" />
                    : <div className="w-5 h-5 rounded bg-slate-300 flex items-center justify-center text-[9px] font-black text-slate-600">{empresa.nombre?.[0]}</div>
                  }
                  <span className="text-xs font-semibold text-slate-700 max-w-[140px] truncate">{empresa.nombre}</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-3 sm:gap-4 animate-slideInRight">
              {user && (
                <UserMenuDropdown
                  user={user}
                  userRole={userRole}
                  onLogout={onLogout}
                  onBackToSelector={onBackToSelector}
                />
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
