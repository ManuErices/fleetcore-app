import React, { useState } from "react";
import { useEmpresa } from "../../lib/useEmpresa";
import UserMenuDropdown from "../../components/UserMenuDropdown";
import ReporteCombustible from "./ReporteCombustible";
import ReporteWorkFleet from "./ReporteWorkFleet";
import AdminPanel from "./AdminPanel";

export default function ReportesShell({ user, userRole, onLogout, onBackToSelector, onAdminPanel, onAdminEmpresaPanel }) {
  const [activeView, setActiveView] = useState("combustible");
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const { empresa } = useEmpresa();

  const isAdmin = ["superadmin", "admin_contrato", "administrativo"].includes(userRole);

  const navItems = [
    {
      id: "combustible",
      label: "Reporte Combustible",
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.879 16.121A3 3 0 1012.015 11L11 14H9c0 .768.293 1.536.879 2.121z" />
        </svg>
      )
    },
    {
      id: "maquinaria",
      label: "Reporte Maquinaria",
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1a1 1 0 001-1v-4a1 1 0 011-1h2m0 0a1 1 0 001-1V9a1 1 0 00-1-1h-3m4 0h2a1 1 0 011 1v4a1 1 0 01-1 1h-1m-5 1v-5a1 1 0 00-1-1H9a1 1 0 00-1 1v5" />
        </svg>
      )
    },
    ...(isAdmin ? [
      {
        id: "admin",
        label: "Administración",
        icon: (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        )
      }
    ] : []),
  ];

  const getBreadcrumbLabel = () => {
    switch (activeView) {
      case "combustible":
        return "Reporte Combustible";
      case "maquinaria":
        return "Reporte Maquinaria";
      case "admin":
        return "Administración";
      default:
        return "Reportes";
    }
  };

  const SidebarContent = () => (
    <div className="flex flex-col h-full bg-slate-900 text-slate-100">
      {/* Sidebar Header */}
      <div className="flex items-center gap-3 px-6 py-6 border-b border-slate-800">
        <img src="/favicon.svg" alt="Logo" className="w-8 h-8 object-contain" />
        <span className="text-xl font-black tracking-tight text-white">FleetCore</span>
      </div>

      {/* Sidebar Navigation */}
      <nav className="flex-1 px-4 py-6 space-y-1">
        {navItems.map((item) => {
          const isActive = activeView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => {
                setActiveView(item.id);
                setIsMobileOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-semibold rounded-xl transition-all ${
                isActive
                  ? "bg-teal-600 text-white shadow-lg shadow-teal-900/20"
                  : "text-slate-400 hover:bg-slate-800 hover:text-white"
              }`}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Sidebar Footer */}
      <div className="p-4 border-t border-slate-800 bg-slate-950/40">
        <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-2 px-2">Entorno</div>
        {empresa && (
          <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-slate-800/40 border border-slate-800 text-left">
            {empresa.logoUrl ? (
              <img src={empresa.logoUrl} alt="" className="w-5 h-5 rounded object-contain flex-shrink-0" />
            ) : (
              <div className="w-5 h-5 rounded bg-slate-700 flex items-center justify-center text-[9px] font-black text-slate-400 flex-shrink-0">
                {empresa.nombre?.[0]}
              </div>
            )}
            <span className="text-xs font-semibold text-slate-300 truncate">{empresa.nombre}</span>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:block w-64 fixed inset-y-0 left-0 z-30 border-r border-slate-800 bg-slate-900">
        <SidebarContent />
      </aside>

      {/* Mobile Drawer Sidebar */}
      {isMobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm transition-opacity"
            onClick={() => setIsMobileOpen(false)}
          />
          {/* Sidebar Panel */}
          <div className="relative w-64 max-w-xs flex-1 flex flex-col bg-slate-900 animate-slideRight">
            <div className="absolute top-4 right-4 z-10">
              <button
                onClick={() => setIsMobileOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-800 text-slate-400 flex items-center justify-center hover:text-white"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <SidebarContent />
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 lg:pl-64 flex flex-col min-h-screen min-w-0">
        {/* Top Header */}
        <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-slate-200/80 px-4 sm:px-6 lg:px-8 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Hamburger Button for Mobile */}
            <button
              onClick={() => setIsMobileOpen(true)}
              className="lg:hidden p-2 rounded-xl text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            {/* Breadcrumb */}
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">
              <span>Reportes</span>
              <svg className="w-3 h-3 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
              </svg>
              <span className="text-slate-700 font-bold">{getBreadcrumbLabel()}</span>
            </div>
          </div>

          {/* User Menu dropdown on the right */}
          <div className="flex items-center gap-4">
            {user && (
              <UserMenuDropdown
                user={user}
                userRole={userRole}
                onLogout={onLogout}
                onBackToSelector={onBackToSelector}
                onAdminPanel={onAdminPanel}
                onAdminEmpresaPanel={onAdminEmpresaPanel}
              />
            )}
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6 w-full max-w-[1500px] mx-auto animate-fadeIn">
          {activeView === "combustible" && <ReporteCombustible />}
          {activeView === "maquinaria" && <ReporteWorkFleet />}
          {activeView === "admin" && isAdmin && <AdminPanel hideSystem={true} />}
        </main>
      </div>
    </div>
  );
}
