import React, { useState, useEffect, useRef } from "react";
import { Routes, Route, NavLink, Navigate, useNavigate, useLocation } from "react-router-dom";
import { useEmpresa } from "../../lib/useEmpresa";
import UserMenuDropdown from "../../components/UserMenuDropdown";
import { MaquinariaFilterProvider, useMaquinariaFilter } from "../../components/maquinaria/MaquinariaFilterContext";
import { buildMaquinariaAlerts } from "../../components/maquinaria/maquinariaAlerts";
import OrdenesTrabajo from "./OrdenesTrabajo";
import MaquinariaDashboard from "./MaquinariaDashboard";
import Equipos from "./Equipos";
import Repuestos from "./Repuestos";
import Fallas from "./Fallas";
import MaquinariaConfig from "./MaquinariaConfig";
import RentalTablero from "./RentalTablero";
import RentalClientes from "./RentalClientes";
import RentalContratos from "./RentalContratos";
import RentalCotizaciones from "./RentalCotizaciones";
import RentalPagos from "./RentalPagos";
import RentalRentabilidad from "./RentalRentabilidad";
import MaquinariaAlertas from "./MaquinariaAlertas";

// ============================================================
// MaquinariaShell — contenedor del módulo Maquinaria
// Sigue el mismo patrón que RRHHShell / ReportesShell: header +
// nav interna + <Routes> anidadas bajo /maquinaria/*
//
// NOTA: por ahora solo existe la pantalla de Órdenes de Trabajo.
// A medida que se construyan Equipos/Mantenimiento, Fallas y
// Repuestos, se agregan acá como nuevos <NavTab> + <Route>.
// ============================================================
export default function MaquinariaShell(props) {
  return (
    <MaquinariaFilterProvider>
      <MaquinariaShellInner {...props} />
    </MaquinariaFilterProvider>
  );
}

function MaquinariaShellInner({ user, userRole, onLogout, onBackToSelector, onAdminPanel, onAdminEmpresaPanel }) {
  const { empresa } = useEmpresa();
  const { empresaId } = useEmpresa();
  const { projectId, setProjectId, projects } = useMaquinariaFilter();
  const navigate = useNavigate();
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [alerts, setAlerts] = useState([]);
  const canGoToAdmin = ['superadmin', 'admin_contrato', 'administrativo'].includes(userRole);
  const isMecanico = userRole === 'mecanico';

  useEffect(() => {
    if (!empresaId || isMecanico) return;
    let cancel = false;
    (async () => {
      try {
        const { alerts } = await buildMaquinariaAlerts(empresaId);
        if (!cancel) setAlerts(alerts || []);
      } catch { /* silencioso */ }
    })();
    return () => { cancel = true; };
  }, [empresaId, isMecanico]);

  return (
    <div className="min-h-screen bg-slate-50 relative">
      <div className="fixed inset-0 bg-grid opacity-30 pointer-events-none" />
      <div className="fixed top-0 right-0 w-[1000px] h-[1000px] bg-gradient-radial from-red-100/50 via-transparent to-transparent blur-3xl pointer-events-none" />

      <header className="sticky top-0 z-40 glass-card border-b border-slate-200/50">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-1 sm:py-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 sm:gap-4 lg:gap-5 animate-fadeInUp">
              <img src="/favicon.svg" alt="Maquinaria" className="h-14 w-14 object-contain block sm:hidden" />
              <div className="hidden sm:flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-red-600 to-rose-600 flex items-center justify-center shadow-md">
                  <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </div>
                <span className="text-base font-black text-slate-900">Maquinaria</span>
              </div>
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
              {!isMecanico && <AlertBell alerts={alerts} navigate={navigate} />}
              {!isMecanico && (
                <select
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  className="hidden md:block border-2 border-slate-200 rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 max-w-[200px]"
                  title="Filtrar el módulo por proyecto"
                >
                  <option value="">Todos los proyectos</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              )}
              {user && (
                <div className="hidden lg:block">
                  <UserMenuDropdown
                    user={user}
                    userRole={userRole}
                    onLogout={onLogout}
                    onBackToSelector={onBackToSelector}
                    onAdminPanel={canGoToAdmin ? onAdminPanel : undefined}
                    onAdminEmpresaPanel={canGoToAdmin ? onAdminEmpresaPanel : undefined}
                  />
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

          {/* Desktop Nav — agrupado en categorías Rental / Taller */}
          <nav className="hidden lg:flex items-center gap-2 mt-6 pt-6 border-t border-slate-200/50">
            {isMecanico ? (
              <MaquinariaNavTab to="/maquinaria/ordenes-trabajo" label="Mis Órdenes de Trabajo" />
            ) : (
              <>
                <MaquinariaNavTab to="/maquinaria/dashboard" label="Dashboard" />
                <NavDropdown
                  label="Rental"
                  items={[
                    { to: "/maquinaria/rental", label: "Tablero Rental" },
                    { to: "/maquinaria/rentabilidad", label: "Rentabilidad" },
                    { to: "/maquinaria/cotizaciones", label: "Cotizaciones" },
                    { to: "/maquinaria/contratos", label: "Contratos" },
                    { to: "/maquinaria/pagos", label: "Estados de pago" },
                    { to: "/maquinaria/clientes", label: "Clientes" },
                    { to: "/maquinaria/equipos", label: "Equipos" },
                  ]}
                />
                <NavDropdown
                  label="Taller"
                  items={[
                    { to: "/maquinaria/ordenes-trabajo", label: "Órdenes de Trabajo" },
                    { to: "/maquinaria/fallas", label: "Fallas" },
                    { to: "/maquinaria/repuestos", label: "Repuestos" },
                    { to: "/maquinaria/config", label: "Configuración" },
                  ]}
                />
              </>
            )}
          </nav>
        </div>

        {/* Mobile menu */}
        {showMobileMenu && (
          <>
            <div className="lg:hidden fixed inset-0 bg-black/60 z-[60] animate-fadeIn" onClick={() => setShowMobileMenu(false)} />
            <div className="lg:hidden fixed top-0 right-0 bottom-0 w-full sm:w-80 bg-white z-[70] shadow-2xl animate-slideInRight flex flex-col">
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200" style={{ background: 'linear-gradient(135deg,#7f1d1d 0%,#450a0a 100%)' }}>
                <div className="flex items-center gap-3">
                  <img src="/favicon.svg" alt="Logo" className="w-7 h-7 object-contain" />
                  <h2 className="text-base font-black text-white">Maquinaria</h2>
                </div>
                <button onClick={() => setShowMobileMenu(false)} className="p-1.5 rounded-lg bg-white/15 hover:bg-white/25 transition-colors">
                  <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <nav className="flex-1 overflow-y-auto p-4 space-y-1">
                {isMecanico ? (
                  <MaquinariaMobileNavLink to="/maquinaria/ordenes-trabajo" label="Mis Órdenes de Trabajo" onClick={() => setShowMobileMenu(false)} />
                ) : (
                  <>
                    <MaquinariaMobileNavLink to="/maquinaria/dashboard" label="Dashboard" onClick={() => setShowMobileMenu(false)} />
                    <MaquinariaMobileNavLink to="/maquinaria/alertas" label="Alertas" onClick={() => setShowMobileMenu(false)} />

                    <p className="text-[10px] font-black text-slate-400 uppercase px-4 pt-4 pb-1">Rental</p>
                    <MaquinariaMobileNavLink to="/maquinaria/rental" label="Tablero Rental" onClick={() => setShowMobileMenu(false)} />
                    <MaquinariaMobileNavLink to="/maquinaria/rentabilidad" label="Rentabilidad" onClick={() => setShowMobileMenu(false)} />
                    <MaquinariaMobileNavLink to="/maquinaria/cotizaciones" label="Cotizaciones" onClick={() => setShowMobileMenu(false)} />
                    <MaquinariaMobileNavLink to="/maquinaria/contratos" label="Contratos" onClick={() => setShowMobileMenu(false)} />
                    <MaquinariaMobileNavLink to="/maquinaria/pagos" label="Estados de pago" onClick={() => setShowMobileMenu(false)} />
                    <MaquinariaMobileNavLink to="/maquinaria/clientes" label="Clientes" onClick={() => setShowMobileMenu(false)} />
                    <MaquinariaMobileNavLink to="/maquinaria/equipos" label="Equipos" onClick={() => setShowMobileMenu(false)} />

                    <p className="text-[10px] font-black text-slate-400 uppercase px-4 pt-4 pb-1">Taller</p>
                    <MaquinariaMobileNavLink to="/maquinaria/ordenes-trabajo" label="Órdenes de Trabajo" onClick={() => setShowMobileMenu(false)} />
                    <MaquinariaMobileNavLink to="/maquinaria/fallas" label="Fallas" onClick={() => setShowMobileMenu(false)} />
                    <MaquinariaMobileNavLink to="/maquinaria/repuestos" label="Repuestos" onClick={() => setShowMobileMenu(false)} />
                    <MaquinariaMobileNavLink to="/maquinaria/config" label="Configuración" onClick={() => setShowMobileMenu(false)} />
                  </>
                )}
                <div className="h-px bg-slate-200 my-4" />
                {canGoToAdmin && onAdminPanel && (
                  <button
                    onClick={() => { setShowMobileMenu(false); onAdminPanel(); }}
                    className="flex items-center gap-3 px-4 py-3 w-full rounded-xl font-semibold text-sm text-slate-700 hover:bg-slate-100 transition-all"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                    Panel de Admin
                  </button>
                )}
                <button
                  onClick={() => { setShowMobileMenu(false); onBackToSelector(); }}
                  className="flex items-center gap-3 px-4 py-3 w-full rounded-xl font-semibold text-sm text-slate-700 hover:bg-slate-100 transition-all"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                  Cambiar aplicación
                </button>
                <button
                  onClick={() => { setShowMobileMenu(false); onLogout(); }}
                  className="flex items-center gap-3 px-4 py-3 w-full rounded-xl font-semibold text-sm text-red-600 hover:bg-red-50 transition-all"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5.636 5.636a9 9 0 1012.728 0M12 3v9" />
                  </svg>
                  Cerrar sesión
                </button>
              </nav>
            </div>
          </>
        )}
      </header>

      <main className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 relative">
        <Routes>
          <Route path="/" element={<Navigate to={isMecanico ? "/maquinaria/ordenes-trabajo" : "/maquinaria/dashboard"} replace />} />
          {!isMecanico && <Route path="/dashboard" element={<MaquinariaDashboard />} />}
          <Route path="/ordenes-trabajo" element={<OrdenesTrabajo />} />
          <Route path="/equipos" element={<Equipos />} />
          {!isMecanico && <Route path="/rental" element={<RentalTablero />} />}
          {!isMecanico && <Route path="/rentabilidad" element={<RentalRentabilidad />} />}
          {!isMecanico && <Route path="/contratos" element={<RentalContratos />} />}
          {!isMecanico && <Route path="/cotizaciones" element={<RentalCotizaciones />} />}
          {!isMecanico && <Route path="/pagos" element={<RentalPagos />} />}
          {!isMecanico && <Route path="/clientes" element={<RentalClientes />} />}
          <Route path="/repuestos" element={<Repuestos />} />
          <Route path="/fallas" element={<Fallas />} />
          {!isMecanico && <Route path="/config" element={<MaquinariaConfig />} />}
          {!isMecanico && <Route path="/alertas" element={<MaquinariaAlertas />} />}
          <Route path="*" element={<Navigate to={isMecanico ? "/maquinaria/ordenes-trabajo" : "/maquinaria/dashboard"} replace />} />
        </Routes>
      </main>

      <footer className="border-t border-slate-200/50 mt-8 sm:mt-12 lg:mt-16">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs sm:text-sm text-slate-600">
            <div className="flex items-center gap-2">
              <img src="/favicon.svg" alt="Fleet Core" className="h-6 w-6 object-contain" />
              <span className="font-medium">FleetCore Maquinaria by <strong>SAER TI</strong></span>
            </div>
            <div className="text-center sm:text-right">© {new Date().getFullYear()} Todos los derechos reservados</div>
          </div>
        </div>
      </footer>
    </div>
  );
}

// ============================================================
// Helpers de navegación (mismo estilo que Shell en App.jsx)
// ============================================================
function MaquinariaNavTab({ to, label }) {
  return (
    <NavLink to={to} className={({ isActive }) => `relative px-6 py-3 text-sm font-semibold rounded-xl transition-all ${isActive ? "text-white" : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"}`}>
      {({ isActive }) => (
        <>
          {isActive && <div className="absolute inset-0 bg-gradient-to-r from-red-700 to-rose-600 rounded-xl shadow-lg" />}
          <span className="relative z-10">{label}</span>
        </>
      )}
    </NavLink>
  );
}

function MaquinariaMobileNavLink({ to, label, onClick }) {
  return (
    <NavLink to={to} onClick={onClick}
      className={({ isActive }) => `flex items-center px-4 py-3 rounded-xl font-semibold text-sm transition-all ${isActive ? "bg-gradient-to-r from-red-700 to-rose-600 text-white shadow-lg" : "text-slate-700 hover:bg-slate-100"}`}>
      {label}
    </NavLink>
  );
}

// Campana de alertas con dropdown de notificaciones (sin cambiar de vista)
function AlertBell({ alerts, navigate }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const location = useLocation();

  const SEV = {
    critica: "bg-red-500",
    alta: "bg-orange-500",
    media: "bg-amber-500",
  };
  const RUTA_POR_TIPO = {
    documento: "/maquinaria/equipos",
    contrato: "/maquinaria/contratos",
    mantencion: "/maquinaria/equipos",
    stock: "/maquinaria/repuestos",
  };

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);
  useEffect(() => { setOpen(false); }, [location.pathname]);

  const count = alerts.length;
  const visibles = alerts.slice(0, 8);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 rounded-lg hover:bg-slate-100 transition-colors"
        title="Alertas"
      >
        <svg className="w-5 h-5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-black flex items-center justify-center">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 bg-white border-2 border-slate-100 rounded-2xl shadow-xl overflow-hidden z-50">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <span className="text-sm font-black text-slate-900">Alertas</span>
            <span className="text-xs font-bold text-slate-400">{count}</span>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {count === 0 ? (
              <div className="px-4 py-8 text-center">
                <p className="text-2xl mb-1">✅</p>
                <p className="text-sm text-slate-500 font-semibold">Todo en orden</p>
              </div>
            ) : (
              visibles.map((a) => (
                <button
                  key={a.id}
                  onClick={() => { setOpen(false); navigate(RUTA_POR_TIPO[a.tipo] || "/maquinaria"); }}
                  className="w-full text-left px-4 py-3 border-b border-slate-50 last:border-0 hover:bg-slate-50 flex items-start gap-2.5"
                >
                  <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${SEV[a.severidad] || "bg-slate-400"}`} />
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-900">{a.titulo}</p>
                    <p className="text-xs text-slate-500 truncate">{a.detalle}</p>
                  </div>
                </button>
              ))
            )}
          </div>

          {count > 0 && (
            <button
              onClick={() => { setOpen(false); navigate("/maquinaria/alertas"); }}
              className="w-full px-4 py-3 text-sm font-bold text-red-600 hover:bg-red-50 border-t border-slate-100"
            >
              Ver todas las alertas{count > visibles.length ? ` (${count})` : ""}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// Menú desplegable de categoría (Rental / Taller) para desktop
function NavDropdown({ label, items }) {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const ref = useRef(null);
  const activo = items.some((it) => location.pathname === it.to);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Cerrar al cambiar de ruta
  useEffect(() => { setOpen(false); }, [location.pathname]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className={`relative flex items-center gap-1.5 px-6 py-3 text-sm font-semibold rounded-xl transition-all ${activo ? "text-white" : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"}`}
      >
        {activo && <div className="absolute inset-0 bg-gradient-to-r from-red-700 to-rose-600 rounded-xl shadow-lg" />}
        <span className="relative z-10">{label}</span>
        <svg className={`relative z-10 w-4 h-4 transition-transform ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 mt-2 w-56 bg-white border-2 border-slate-100 rounded-2xl shadow-xl overflow-hidden z-50">
          {items.map((it) => (
            <NavLink
              key={it.to}
              to={it.to}
              className={({ isActive }) => `block px-4 py-3 text-sm font-semibold transition-colors ${isActive ? "bg-red-50 text-red-700" : "text-slate-700 hover:bg-slate-50"}`}
            >
              {it.label}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
}
