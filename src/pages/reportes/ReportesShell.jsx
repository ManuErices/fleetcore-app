import React, { useState, useEffect } from "react";
import { useEmpresa } from "../../lib/useEmpresa";
import { usePlan } from "../../hooks/usePlan";
import UserMenuDropdown from "../../components/UserMenuDropdown";
import ReporteCombustible from "./ReporteCombustible";
import ReporteWorkFleet from "./ReporteWorkFleet";
import AdminPanel, { NAV_GROUPS, filtrarTabsVisibles } from "./AdminPanel";

// Claves para recordar el estado del shell entre recargas.
const VISTA_KEY = "reportes:vistaActiva";
const TAB_ADMIN_KEY = "reportes:adminTab";
const COLAPSADO_KEY = "reportes:sidebarColapsado";
const VISTAS_VALIDAS = ["combustible", "maquinaria", "admin"];

const leerLS = (k, def) => { try { return localStorage.getItem(k) ?? def; } catch { return def; } };
const guardarLS = (k, v) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } };

export default function ReportesShell({ user, userRole, onLogout, onBackToSelector, onAdminPanel, onAdminEmpresaPanel }) {
  const { empresa } = useEmpresa();
  const { activeModules, loading: planLoading } = usePlan();

  const [activeView, setActiveViewState] = useState(() => {
    const g = leerLS(VISTA_KEY, "combustible");
    return VISTAS_VALIDAS.includes(g) ? g : "combustible";
  });
  const [adminTab, setAdminTabState] = useState(() => leerLS(TAB_ADMIN_KEY, "operadores"));
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [colapsado, setColapsado] = useState(() => leerLS(COLAPSADO_KEY, "0") === "1");
  const [adminAbierto, setAdminAbierto] = useState(() => leerLS(VISTA_KEY, "combustible") === "admin");

  const setActiveView = (v) => { setActiveViewState(v); guardarLS(VISTA_KEY, v); };
  const setAdminTab = (t) => { setAdminTabState(t); guardarLS(TAB_ADMIN_KEY, t); };
  const toggleColapsado = () => setColapsado(c => { guardarLS(COLAPSADO_KEY, c ? "0" : "1"); return !c; });

  const isAdmin = ["superadmin", "admin_contrato", "administrativo"].includes(userRole);

  // Tabs de Administración visibles según rol/plan (misma lógica que AdminPanel)
  const adminTabs = filtrarTabsVisibles({
    isSuperAdmin: userRole === "superadmin",
    activeModules,
    planLoading,
    currentUserRole: userRole,
    hideSystem: true,
  });

  // Si la vista recordada es "admin" pero el rol ya no lo permite, volver
  useEffect(() => {
    if (activeView === "admin" && !isAdmin) setActiveView("combustible");
  }, [activeView, isAdmin]);

  // Si el adminTab recordado no está entre los visibles, usar el primero
  useEffect(() => {
    if (adminTabs.length > 0 && !adminTabs.find(t => t.id === adminTab)) {
      setAdminTab(adminTabs[0].id);
    }
  }, [adminTabs]);  // eslint-disable-line react-hooks/exhaustive-deps

  const irAAdminTab = (id) => {
    setAdminTab(id);
    setActiveView("admin");
    setIsMobileOpen(false);
  };

  const breadcrumb = activeView === "combustible" ? "Reporte Combustible"
    : activeView === "maquinaria" ? "Reporte Maquinaria"
    : activeView === "admin" ? (adminTabs.find(t => t.id === adminTab)?.label || "Administración")
    : "Reportes";

  // ── Iconos ────────────────────────────────────────────────────
  const iconoCombustible = (
    <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.879 16.121A3 3 0 1012.015 11L11 14H9c0 .768.293 1.536.879 2.121z" />
    </svg>
  );
  const iconoMaquinaria = (
    <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1a1 1 0 001-1v-4a1 1 0 011-1h2m0 0a1 1 0 001-1V9a1 1 0 00-1-1h-3m4 0h2a1 1 0 011 1v4a1 1 0 01-1 1h-1m-5 1v-5a1 1 0 00-1-1H9a1 1 0 00-1 1v5" />
    </svg>
  );
  const iconoAdmin = (
    <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );

  // Ítem principal con "línea" indicadora a la izquierda (line-sidebar).
  const NavItem = ({ col, active, onClick, icon, label, hasChevron, chevronOpen }) => (
    <button
      onClick={onClick}
      title={col ? label : undefined}
      className={`relative w-full flex items-center ${col ? "justify-center" : "gap-3"} px-3 py-2.5 rounded-xl text-sm font-semibold transition-all ${
        active ? "bg-white/10 text-white" : "text-slate-400 hover:bg-white/5 hover:text-white"
      }`}
    >
      <span className={`absolute left-0 top-1/2 -translate-y-1/2 w-1 rounded-full bg-teal-400 transition-all duration-200 ${active ? "h-6 opacity-100" : "h-0 opacity-0"}`} />
      {icon}
      {!col && <span className="flex-1 text-left truncate">{label}</span>}
      {!col && hasChevron && (
        <svg className={`w-4 h-4 flex-shrink-0 transition-transform ${chevronOpen ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      )}
    </button>
  );

  // `col` = colapsado efectivo (el drawer móvil siempre va expandido).
  const SidebarContent = ({ col = false }) => (
    <div className="flex flex-col h-full bg-slate-900 text-slate-100">
      {/* Header con logo + botón colapsar (desktop) */}
      <div className={`flex items-center ${col ? "justify-center" : "gap-3"} px-4 h-16 border-b border-slate-800 flex-shrink-0`}>
        <img src="/favicon.svg" alt="Logo" className="w-8 h-8 object-contain flex-shrink-0" />
        {!col && <span className="text-xl font-black tracking-tight text-white flex-1">FleetCore</span>}
        <button
          onClick={toggleColapsado}
          className="hidden lg:flex w-7 h-7 rounded-lg text-slate-500 hover:text-white hover:bg-white/10 items-center justify-center transition-colors"
          title={col ? "Expandir menú" : "Colapsar menú"}
        >
          <svg className={`w-4 h-4 transition-transform ${col ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
          </svg>
        </button>
      </div>

      {/* Navegación */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        <NavItem col={col} active={activeView === "combustible"} onClick={() => { setActiveView("combustible"); setIsMobileOpen(false); }} icon={iconoCombustible} label="Reporte Combustible" />
        <NavItem col={col} active={activeView === "maquinaria"} onClick={() => { setActiveView("maquinaria"); setIsMobileOpen(false); }} icon={iconoMaquinaria} label="Reporte Maquinaria" />

        {isAdmin && (
          <>
            <NavItem
              col={col}
              active={activeView === "admin"}
              onClick={() => {
                if (col) { setActiveView("admin"); setIsMobileOpen(false); }
                else setAdminAbierto(o => !o);
              }}
              icon={iconoAdmin}
              label="Administración"
              hasChevron={!col}
              chevronOpen={adminAbierto}
            />

            {/* Submenú de Administración (agrupado como en el panel) */}
            {!col && adminAbierto && (
              <div className="pl-3 pt-1 pb-2 space-y-3">
                {NAV_GROUPS.map(group => {
                  const groupTabs = adminTabs.filter(t => group.ids.includes(t.id));
                  if (groupTabs.length === 0) return null;
                  return (
                    <div key={group.label}>
                      <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest px-3 mb-1">{group.label}</p>
                      <div className="space-y-0.5 border-l border-slate-800 ml-3">
                        {groupTabs.map(tab => {
                          const active = activeView === "admin" && adminTab === tab.id;
                          return (
                            <button
                              key={tab.id}
                              onClick={() => irAAdminTab(tab.id)}
                              className={`w-full flex items-center gap-2.5 pl-3 pr-2 py-2 -ml-px border-l-2 text-[13px] font-medium transition-all text-left ${
                                active
                                  ? "border-teal-400 text-white"
                                  : "border-transparent text-slate-400 hover:text-white hover:border-slate-600"
                              }`}
                            >
                              <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d={tab.icon} />
                              </svg>
                              <span className="truncate">{tab.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </nav>

      {/* Footer: entorno */}
      <div className="p-3 border-t border-slate-800 bg-slate-950/40 flex-shrink-0">
        {!col && <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-2 px-2">Entorno</div>}
        {empresa && (
          <div className={`flex items-center ${col ? "justify-center" : "gap-2.5"} px-2 py-2 rounded-xl bg-slate-800/40 border border-slate-800`} title={col ? empresa.nombre : undefined}>
            {empresa.logoUrl ? (
              <img src={empresa.logoUrl} alt="" className="w-5 h-5 rounded object-contain flex-shrink-0" />
            ) : (
              <div className="w-5 h-5 rounded bg-slate-700 flex items-center justify-center text-[9px] font-black text-slate-400 flex-shrink-0">
                {empresa.nombre?.[0]}
              </div>
            )}
            {!col && <span className="text-xs font-semibold text-slate-300 truncate">{empresa.nombre}</span>}
          </div>
        )}
      </div>
    </div>
  );

  const anchoSidebar = colapsado ? "lg:w-16" : "lg:w-64";
  const padContenido = colapsado ? "lg:pl-16" : "lg:pl-64";

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Sidebar desktop */}
      <aside className={`hidden lg:block ${anchoSidebar} fixed inset-y-0 left-0 z-30 border-r border-slate-800 bg-slate-900 transition-[width] duration-200`}>
        <SidebarContent col={colapsado} />
      </aside>

      {/* Drawer móvil */}
      {isMobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm" onClick={() => setIsMobileOpen(false)} />
          <div className="relative w-72 max-w-[85%] flex flex-col bg-slate-900 animate-slideRight">
            <button
              onClick={() => setIsMobileOpen(false)}
              className="absolute top-4 right-4 z-10 w-8 h-8 rounded-full bg-slate-800 text-slate-400 flex items-center justify-center hover:text-white"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
            <SidebarContent col={false} />
          </div>
        </div>
      )}

      {/* Contenido */}
      <div className={`flex-1 ${padContenido} flex flex-col min-h-screen min-w-0 transition-[padding] duration-200`}>
        <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-slate-200/80 px-4 sm:px-6 lg:px-8 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => setIsMobileOpen(true)} className="lg:hidden p-2 rounded-xl text-slate-600 hover:bg-slate-100 hover:text-slate-900">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
            </button>
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">
              <span>Reportes</span>
              <svg className="w-3 h-3 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" /></svg>
              <span className="text-slate-700 font-bold">{breadcrumb}</span>
            </div>
          </div>
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

        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6 w-full max-w-[1500px] mx-auto animate-fadeIn">
          {activeView === "combustible" && <ReporteCombustible />}
          {activeView === "maquinaria" && <ReporteWorkFleet />}
          {activeView === "admin" && isAdmin && (
            <AdminPanel embedded hideSystem activeTab={adminTab} onTabChange={setAdminTab} />
          )}
        </main>
      </div>
    </div>
  );
}
