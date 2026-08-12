/**
 * UserMenuDropdown — Menú de usuario unificado para todos los módulos.
 *
 * Usa useEmpresa() + usePlan() internamente.
 * Requiere estar dentro de <EmpresaProvider>.
 * Renderiza el dropdown via createPortal para escapar cualquier stacking context.
 *
 * Props:
 *  user             — Firebase Auth user
 *  userRole         — string (role del usuario)
 *  onLogout         — () => void
 *  onBackToSelector — () => void (opcional) "Cambiar aplicación"
 *  onGoToPricing    — () => void (opcional) "Gestionar plan"
 *  onInviteUsers    — () => void (opcional)
 *  onAdminPanel     — () => void (opcional)
 *  theme            — 'light' | 'dark'  (default: 'light')
 *  placement        — 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'
 */

import React, { useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useOnlineStatus } from './ConnectionStatus';

const ROLE_LABELS = {
  superadmin: 'Super Admin',
  admin_contrato: 'Admin Contrato',
  administrativo: 'Administrativo',
  operador: 'Operador',
  mandante: 'Mandante',
  trabajador: 'Trabajador',
  revisor: 'Revisor',
  revisor_admin: 'Revisor Admin',
  mandante_admin: 'Mandante Admin',
};

function IconPower({ className = 'w-4 h-4' }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5.636 5.636a9 9 0 1012.728 0M12 3v9" />
    </svg>
  );
}

function UserAvatar({ user, size = 'md' }) {
  const sizes = { sm: 'w-7 h-7 text-xs', md: 'w-9 h-9 text-sm', lg: 'w-11 h-11 text-base' };
  return (
    <div className={`${sizes[size]} rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center flex-shrink-0 shadow-sm`}>
      <span className="text-white font-bold">{user?.email?.[0]?.toUpperCase() || 'U'}</span>
    </div>
  );
}


export default function UserMenuDropdown({
  user,
  userRole = 'operador',
  onLogout,
  onBackToSelector,
  onGoToPricing,
  onInviteUsers,
  onAdminPanel,
  onAdminEmpresaPanel,
  theme = 'light',
  placement = 'bottom-right',
}) {
  const [open, setOpen] = useState(false);
  const [triggerRect, setTriggerRect] = useState(null);
  const triggerRef = useRef(null);
  const isOnline = useOnlineStatus();

  const isDark = theme === 'dark';

  const canAdmin = ['superadmin', 'admin_contrato', 'administrativo'].includes(userRole);
  const canInvite = ['superadmin', 'admin_contrato'].includes(userRole) && !!onInviteUsers;
  const canPricing = !!onGoToPricing && userRole === 'admin_contrato';

  const handleToggle = useCallback(() => {
    if (!open && triggerRef.current) {
      setTriggerRect(triggerRef.current.getBoundingClientRect());
    }
    setOpen(o => !o);
  }, [open]);

  const close = useCallback(() => setOpen(false), []);

  // Calcula posición fija del dropdown basada en el rect del trigger
  const getDropdownStyle = () => {
    if (!triggerRect) return {};
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    switch (placement) {
      case 'top-right':
        return { position: 'fixed', bottom: vh - triggerRect.top + 8, right: vw - triggerRect.right };
      case 'top-left':
        return { position: 'fixed', bottom: vh - triggerRect.top + 8, left: triggerRect.left };
      case 'bottom-left':
        return { position: 'fixed', top: triggerRect.bottom + 8, left: triggerRect.left };
      default: // bottom-right
        return { position: 'fixed', top: triggerRect.bottom + 8, right: vw - triggerRect.right };
    }
  };

  // ── Trigger button ────────────────────────────────────────────
  const triggerCls = isDark
    ? 'flex items-center gap-2 sm:gap-2.5 px-2.5 py-2 bg-slate-900/85 hover:bg-slate-800 rounded-xl border border-white/15 shadow-lg transition-all backdrop-blur-sm'
    : 'flex items-center gap-2 sm:gap-2.5 px-2.5 py-2 bg-slate-100 hover:bg-slate-200 rounded-xl border border-slate-200 transition-all';

  // ── Dropdown panel ─────────────────────────────────────────────
  const panelCls = isDark
    ? 'w-72 bg-slate-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden'
    : 'w-72 bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden';

  const dividerCls = isDark ? 'h-px bg-white/10 mx-3 my-1' : 'h-px bg-slate-100 mx-3 my-1';

  const itemBase = 'w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium rounded-xl transition-colors text-left';
  const itemCls = isDark ? `${itemBase} hover:bg-white/10` : `${itemBase} hover:bg-slate-50`;
  const itemText = isDark ? 'text-slate-200' : 'text-slate-700';
  const itemRed = isDark ? 'text-red-400' : 'text-red-600';
  const itemRedHover = isDark ? 'hover:bg-red-500/10' : 'hover:bg-red-50';

  const displayName = user?.displayName || user?.email?.split('@')[0] || 'Usuario';

  return (
    <div className="relative" ref={triggerRef}>
      {/* ── Trigger ── */}
      <button onClick={handleToggle} className={triggerCls}>
        <UserAvatar user={user} size="sm" />

        <div className="hidden sm:block text-left leading-none">
          <div className={`text-sm font-semibold leading-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>{displayName}</div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isOnline ? 'bg-emerald-400' : 'bg-amber-400 animate-pulse'}`} />
            <span className={`text-xs font-medium ${isDark ? 'text-white/50' : 'text-slate-400'}`}>
              {isOnline ? 'Online' : 'Offline'}
            </span>
          </div>
        </div>

        <svg
          className={`w-3.5 h-3.5 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''} ${isDark ? 'text-white/50' : 'text-slate-400'}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* ── Dropdown via portal — escapa cualquier stacking context ── */}
      {open && createPortal(
        <>
          {/* Backdrop para cerrar al click fuera */}
          <div className="fixed inset-0" style={{ zIndex: 9998 }} onClick={close} />

          {/* Panel */}
          <div style={{ zIndex: 9999, ...getDropdownStyle() }} className={panelCls}>

            {/* Perfil de usuario */}
            <div className={`px-4 py-3.5 ${isDark ? 'border-b border-white/10' : 'border-b border-slate-100 bg-slate-50'}`}>
              <div className="flex items-center gap-3">
                <UserAvatar user={user} size="md" />
                <div className="flex-1 min-w-0">
                  <div className={`text-sm font-semibold truncate ${isDark ? 'text-white' : 'text-slate-900'}`}>{displayName}</div>
                  <div className={`text-xs truncate ${isDark ? 'text-white/40' : 'text-slate-400'}`}>{user?.email}</div>
                  <div className={`text-[10px] font-semibold uppercase tracking-wide mt-0.5 ${isDark ? 'text-white/30' : 'text-slate-400'}`}>
                    {ROLE_LABELS[userRole] || userRole}
                  </div>
                </div>
              </div>
            </div>

            {/* Estado de conexión */}
            <div className={`px-4 py-2.5 ${isDark ? 'border-b border-white/10' : 'border-b border-slate-100'}`}>
              <div className="flex items-center gap-2.5">
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${isOnline ? 'bg-emerald-400' : 'bg-amber-400 animate-pulse'}`} />
                <div>
                  <p className={`text-xs font-semibold ${isDark ? 'text-white/70' : 'text-slate-700'}`}>
                    {isOnline ? 'Conectado' : 'Sin conexión'}
                  </p>
                  <p className={`text-[10px] ${isDark ? 'text-white/35' : 'text-slate-400'}`}>
                    {isOnline ? 'Datos sincronizados' : 'Cambios guardados localmente'}
                  </p>
                </div>
              </div>
            </div>

            {/* Acciones */}
            <div className="p-2">
              {/* "Super Admin" — solo superadmin, va al panel global */}
              {userRole === 'superadmin' && onAdminPanel && (
                <button onClick={() => { close(); onAdminPanel(); }} className={`${itemCls} ${itemText}`}>
                  <svg className="w-4 h-4 flex-shrink-0 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                  Super Admin
                </button>
              )}
              {/* "Panel de Admin" — todos los admins; superadmin usa onAdminEmpresaPanel, resto usa onAdminPanel */}
              {canAdmin && (userRole === 'superadmin' ? onAdminEmpresaPanel : onAdminPanel) && (
                <button
                  onClick={() => { close(); (userRole === 'superadmin' ? onAdminEmpresaPanel : onAdminPanel)(); }}
                  className={`${itemCls} ${itemText}`}
                >
                  <svg className="w-4 h-4 flex-shrink-0 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Panel de Admin
                </button>
              )}
              {canInvite && (
                <button onClick={() => { close(); onInviteUsers(); }} className={`${itemCls} ${itemText}`}>
                  <svg className="w-4 h-4 flex-shrink-0 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                  </svg>
                  Invitar Usuarios
                </button>
              )}
              {canPricing && (
                <button onClick={() => { close(); onGoToPricing(); }} className={`${itemCls} ${itemText}`}>
                  <svg className="w-4 h-4 flex-shrink-0 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                  Gestionar plan
                </button>
              )}
              {onBackToSelector && (
                <button onClick={() => { close(); onBackToSelector(); }} className={`${itemCls} ${itemText}`}>
                  <svg className="w-4 h-4 flex-shrink-0 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                  Cambiar aplicación
                </button>
              )}

              <div className={dividerCls} />

              <button onClick={() => { close(); onLogout?.(); }} className={`${itemCls} ${itemRed} ${itemRedHover}`}>
                <IconPower className="w-4 h-4 flex-shrink-0" />
                Cerrar sesión
              </button>
            </div>
          </div>
        </>,
        document.body
      )}
    </div>
  );
}
