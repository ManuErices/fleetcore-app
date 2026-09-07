import React, { useState, useEffect } from 'react';
import { NavLink, Outlet } from 'react-router-dom';

/**
 * Reusable sidebar + content layout for sub-apps (RRHH, Finanzas, etc.).
 *
 * navGroups: [{ label: string, tabs: [{ id, label, icon (SVG path d) }] }]
 * basePath: e.g. "/rrhh"
 *
 * La decisión desktop-vs-mobile se hace en JS por window.innerWidth y NO con
 * `hidden md:flex`: en algunos builds el orden de utilidades de Tailwind se
 * invierte y `.hidden` gana en todo ancho, dejando la barra invisible sin
 * forma de abrirla. Con estado propio siempre hay botón para mostrar/ocultar.
 */
const BREAKPOINT = 768;
const HEADER_H = 61;

export default function AppShellLayout({ navGroups, basePath }) {
  const getDesktop = () => (typeof window !== 'undefined' ? window.innerWidth >= BREAKPOINT : true);
  const [isDesktop, setIsDesktop] = useState(getDesktop);
  const [open, setOpen] = useState(getDesktop); // desktop: abierta · mobile: cerrada

  useEffect(() => {
    const onResize = () => {
      const desktop = getDesktop();
      setIsDesktop(desktop);
      setOpen(desktop); // al pasar a desktop se abre; al pasar a mobile se cierra
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const closeOnMobile = () => { if (!isDesktop) setOpen(false); };

  const nav = (
    <nav className="p-3 space-y-5 pb-8">
      {/* Cabecera de la barra con botón cerrar */}
      <div className="flex items-center justify-between px-1 pt-1">
        <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: '#64748b' }}>Menú</span>
        <button
          onClick={() => setOpen(false)}
          aria-label="Ocultar menú"
          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
          </svg>
        </button>
      </div>

      {navGroups.map(group => (
        <div key={group.label}>
          <p className="text-[10px] font-black uppercase tracking-widest px-2 mb-1.5" style={{ color: '#64748b' }}>
            {group.label}
          </p>
          <div className="space-y-0.5">
            {group.tabs.map(tab => (
              <NavLink
                key={tab.id}
                to={`${basePath}/${tab.id}`}
                onClick={closeOnMobile}
                className={({ isActive }) =>
                  `w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                    isActive ? 'text-white shadow-lg' : 'text-slate-400 hover:text-white hover:bg-white/10'
                  }`
                }
                style={({ isActive }) => (isActive ? { background: 'linear-gradient(135deg,#7c3aed,#4f46e5)' } : {})}
              >
                <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d={tab.icon} />
                </svg>
                <span className="truncate">{tab.label}</span>
              </NavLink>
            ))}
          </div>
        </div>
      ))}
    </nav>
  );

  return (
    <div className="flex" style={{ background: '#f0f2f7', minHeight: `calc(100vh - ${HEADER_H}px)`, position: 'relative' }}>

      {/* Botón para MOSTRAR el menú cuando está oculto (desktop o mobile) */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Mostrar menú"
          className="flex items-center gap-2 px-3 py-2 rounded-xl text-white text-sm font-bold shadow-lg transition-transform active:scale-95"
          style={{ position: 'fixed', top: HEADER_H + 8, left: 10, zIndex: 60, background: '#1e293b' }}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
          Menú
        </button>
      )}

      {/* ── Sidebar ── */}
      {open && (
        isDesktop ? (
          <aside
            className="flex flex-col w-56 flex-shrink-0 border-r border-slate-700/50 overflow-y-auto"
            style={{ background: '#1e293b', position: 'sticky', top: HEADER_H, height: `calc(100vh - ${HEADER_H}px)` }}
          >
            {nav}
          </aside>
        ) : (
          <>
            {/* Backdrop mobile */}
            <div
              onClick={() => setOpen(false)}
              style={{ position: 'fixed', top: HEADER_H, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 45 }}
            />
            {/* Drawer mobile */}
            <aside
              className="flex flex-col w-64 overflow-y-auto shadow-2xl"
              style={{ background: '#1e293b', position: 'fixed', top: HEADER_H, left: 0, bottom: 0, zIndex: 50 }}
            >
              {nav}
            </aside>
          </>
        )
      )}

      {/* ── Content area ── */}
      <main className="flex-1 min-w-0 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
