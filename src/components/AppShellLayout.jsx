import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';

/**
 * Reusable sidebar + content layout for sub-apps.
 * Each sub-app (RRHH, Finanzas, etc.) provides its own navGroups and basePath.
 *
 * navGroups: [{ label: string, tabs: [{ id, label, icon (SVG path d) }] }]
 * basePath: e.g. "/rrhh"
 */
export default function AppShellLayout({ navGroups, basePath }) {
  return (
    <div className="flex" style={{ background: '#f0f2f7', minHeight: 'calc(100vh - 61px)' }}>

      {/* ── Sidebar ── */}
      <aside
        className="hidden md:flex flex-col w-56 flex-shrink-0 border-r border-slate-700/50 overflow-y-auto"
        style={{ background: '#1e293b', position: 'sticky', top: 61, height: 'calc(100vh - 61px)' }}
      >
        <nav className="p-3 space-y-5 py-5">
          {navGroups.map(group => (
            <div key={group.label}>
              <p
                className="text-[10px] font-black uppercase tracking-widest px-2 mb-1.5"
                style={{ color: '#64748b' }}
              >
                {group.label}
              </p>
              <div className="space-y-0.5">
                {group.tabs.map(tab => (
                  <NavLink
                    key={tab.id}
                    to={`${basePath}/${tab.id}`}
                    className={({ isActive }) =>
                      `w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                        isActive
                          ? 'text-white shadow-lg'
                          : 'text-slate-400 hover:text-white hover:bg-white/10'
                      }`
                    }
                    style={({ isActive }) =>
                      isActive ? { background: 'linear-gradient(135deg,#7c3aed,#4f46e5)' } : {}
                    }
                  >
                    <svg
                      className="w-4 h-4 flex-shrink-0"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d={tab.icon} />
                    </svg>
                    <span className="truncate">{tab.label}</span>
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>
      </aside>

      {/* ── Content area (filled by child routes via <Outlet />) ── */}
      <main className="flex-1 min-w-0 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
