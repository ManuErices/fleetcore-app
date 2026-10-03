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
 *  variante         — 'default' | 'cuaderno' (default: 'default'). 'cuaderno' es el
 *                     diseño de Finanzas. Sin la prop, el menú se ve igual que siempre.
 */

import React, { useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useOnlineStatus } from './ConnectionStatus';
import { useEmpresa } from '../lib/useEmpresa';

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


// ════════════════════════════════════════════════════════════════════════════
//  Variante "cuaderno" (Finanzas)
//  Misma lógica que el menú por defecto; solo cambia el dibujo: una tarjeta
//  índice con letra manuscrita, avatar a lápiz y doble línea roja bajo el perfil.
//  Usa solo los tokens cuaderno-* de Tailwind, sin importar nada de Finanzas.
// ════════════════════════════════════════════════════════════════════════════
const TRAZOS = {
  escudo:    "M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6l7-3z M9 12l2 2 4-4",
  engranaje: "M12 9a3 3 0 100 6 3 3 0 000-6z M19.4 13a7.5 7.5 0 000-2l2-1.5-2-3.4-2.3.9a7.5 7.5 0 00-1.7-1L15 3.5h-4l-.4 2.5a7.5 7.5 0 00-1.7 1l-2.3-.9-2 3.4 2 1.5a7.5 7.5 0 000 2l-2 1.5 2 3.4 2.3-.9a7.5 7.5 0 001.7 1l.4 2.5h4l.4-2.5a7.5 7.5 0 001.7-1l2.3.9 2-3.4-2-1.5z",
  invitar:   "M15 19v-1a4 4 0 00-4-4H7a4 4 0 00-4 4v1 M9 10a3 3 0 100-6 3 3 0 000 6z M19 8v6 M16 11h6",
  lineas:    "M4 7h16 M4 12h16 M4 17h16",
  apagar:    "M6.3 6.3a8 8 0 1011.4 0 M12 3v9",
  check:     "M5 13l4 4L19 7",
  chevron:   "M6 15l6-6 6 6",
};

function Trazo({ d, className = "w-4 h-4" }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

function InicialCuaderno({ texto, grande = false }) {
  return (
    <span className={`${grande ? "w-11 h-11 text-[20px]" : "w-9 h-9 text-[16px]"} rounded-full border-[1.5px] border-cuaderno-tinta/70 text-cuaderno-tinta font-manuscrita flex items-center justify-center flex-shrink-0`}>
      {texto}
    </span>
  );
}

function MenuCuaderno({
  triggerRef, open, onToggle, close, estiloPanel,
  user, displayName, rol, isOnline,
  empresa, empresaId, empresasDisponibles, tieneMultiEmpresa, cambiandoEmpresa, errorCambio, onCambiarEmpresa,
  acciones, onLogout,
}) {
  const inicial = (displayName || "?").trim()[0]?.toUpperCase() || "?";
  const item = "w-full min-h-[40px] flex items-center gap-3 px-3 rounded-md text-left text-[16px] text-cuaderno-tinta hover:bg-cuaderno-hoja focus:outline-none focus-visible:ring-2 focus-visible:ring-cuaderno-tinta/40";

  return (
    <div className="relative font-manuscrita" ref={triggerRef}>
      {/* ── Botón en el pie de la barra ── */}
      <button
        onClick={onToggle}
        aria-expanded={open}
        aria-haspopup="menu"
        className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md border text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-cuaderno-tinta/40 ${
          open ? "bg-cuaderno-hoja border-cuaderno-columna" : "border-transparent hover:bg-cuaderno-hoja/70"}`}
      >
        <InicialCuaderno texto={inicial} />
        <span className="flex-1 min-w-0 leading-tight">
          <span className="block text-[17px] text-cuaderno-tinta truncate">{displayName}</span>
          <span className={`block text-[13px] ${isOnline ? "text-cuaderno-verde" : "text-cuaderno-roja"}`}>
            {isOnline ? "en línea" : "sin conexión"}
          </span>
        </span>
        <Trazo d={TRAZOS.chevron} className={`w-4 h-4 flex-shrink-0 text-cuaderno-grafito transition-transform ${open ? "" : "rotate-180"}`} />
      </button>

      {/* ── Tarjeta del menú, en portal para escapar de cualquier contexto ── */}
      {open && createPortal(
        <>
          <div className="fixed inset-0" style={{ zIndex: 9998 }} onClick={close} />

          <div role="menu" style={{ zIndex: 9999, ...estiloPanel }}
            className="cuaderno font-manuscrita w-72 bg-cuaderno-tarjeta border border-cuaderno-columna/70 rounded-md overflow-hidden shadow-[0_18px_40px_-18px_rgb(var(--cuaderno-tinta)/0.45)]">

            {/* Perfil */}
            <div className="px-4 pt-3.5 pb-3 border-b-[3px] border-double border-cuaderno-margen flex items-center gap-3">
              <InicialCuaderno texto={inicial} grande />
              <div className="min-w-0">
                <p className="m-0 text-[18px] leading-tight text-cuaderno-tinta truncate">{displayName}</p>
                <p className="m-0 text-[14px] text-cuaderno-grafito truncate">{user?.email}</p>
                <p className="m-0 text-[13px] text-cuaderno-grafito">{rol}</p>
              </div>
            </div>

            {/* Empresa */}
            {empresasDisponibles.length > 0 && (
              <div className="px-4 pt-2.5 pb-2 border-b border-cuaderno-azul">
                <p className="m-0 mb-1 text-[14px] text-cuaderno-grafito">{tieneMultiEmpresa ? "Empresa activa" : "Empresa"}</p>
                {!tieneMultiEmpresa ? (
                  <p className="m-0 text-[16px] text-cuaderno-tinta truncate">{empresa?.nombre || "—"}</p>
                ) : (
                  <ul className="m-0 p-0 list-none">
                    {empresasDisponibles.map(e => {
                      const activa = e.id === empresaId;
                      return (
                        <li key={e.id}>
                          <button
                            role="menuitemradio"
                            aria-checked={activa}
                            disabled={cambiandoEmpresa}
                            onClick={() => onCambiarEmpresa(e.id)}
                            className={`w-full min-h-[46px] flex items-center gap-2.5 px-2 rounded-md text-left disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-cuaderno-tinta/40 ${
                              activa ? "bg-cuaderno-hoja" : "hover:bg-cuaderno-hoja/70"}`}
                          >
                            <span className={`w-7 h-7 rounded-full border flex items-center justify-center text-[14px] flex-shrink-0 ${
                              activa ? "border-cuaderno-tinta text-cuaderno-tinta" : "border-cuaderno-columna text-cuaderno-grafito"}`}>
                              {e.nombre?.[0]?.toUpperCase() || "?"}
                            </span>
                            <span className="min-w-0 flex-1 leading-tight">
                              <span className={`block text-[16px] truncate ${activa ? "text-cuaderno-tinta" : "text-cuaderno-tinta/80"}`}>{e.nombre}</span>
                              {e.rut && <span className="block text-[13px] text-cuaderno-grafito">{e.rut}</span>}
                            </span>
                            {activa && <Trazo d={TRAZOS.check} className="w-4 h-4 flex-shrink-0 text-cuaderno-verde" />}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {cambiandoEmpresa && <p className="m-0 px-2 pt-1 text-[13px] text-cuaderno-grafito">Cambiando de empresa…</p>}
                {errorCambio && <p className="m-0 px-2 pt-1 text-[13px] text-cuaderno-roja">{errorCambio}</p>}
              </div>
            )}

            {/* Conexión */}
            <p className="m-0 px-4 py-2 border-b border-cuaderno-azul flex items-center gap-2 text-[14px]">
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${isOnline ? "bg-cuaderno-verde" : "bg-cuaderno-roja animate-pulse motion-reduce:animate-none"}`} />
              <span className="text-cuaderno-tinta">
                {isOnline ? "Conectado" : "Sin conexión"}
                <span className="text-cuaderno-grafito">, {isOnline ? "datos al día" : "los cambios se guardan aquí"}</span>
              </span>
            </p>

            {/* Acciones */}
            <div className="p-2">
              {acciones.map(a => (
                <button key={a.id} role="menuitem" onClick={() => { close(); a.onClick(); }} className={item}>
                  <Trazo d={a.icono} className="w-4 h-4 flex-shrink-0 text-cuaderno-grafito" />
                  {a.label}
                </button>
              ))}
              {acciones.length > 0 && <div className="my-1 mx-3 border-t border-dashed border-cuaderno-columna" />}
              <button role="menuitem" onClick={() => { close(); onLogout?.(); }}
                className={`${item} !text-cuaderno-roja hover:!bg-cuaderno-rosa/40`}>
                <Trazo d={TRAZOS.apagar} className="w-4 h-4 flex-shrink-0" />
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
  variante = 'default',
}) {
  const [open, setOpen] = useState(false);
  const [triggerRect, setTriggerRect] = useState(null);
  const [errorCambio, setErrorCambio] = useState('');
  const triggerRef = useRef(null);
  const isOnline = useOnlineStatus();

  // Multiempresa: lista de empresas del usuario y función para cambiarse
  const {
    empresa,
    empresaId,
    empresasDisponibles = [],
    tieneMultiEmpresa,
    cambiandoEmpresa,
    cambiarEmpresa,
  } = useEmpresa();

  const handleCambiarEmpresa = async (nuevoId) => {
    if (nuevoId === empresaId) { setOpen(false); return; }
    setErrorCambio('');
    const r = await cambiarEmpresa(nuevoId);
    if (r?.ok) {
      setOpen(false);
    } else {
      setErrorCambio(r?.error || 'No se pudo cambiar de empresa.');
    }
  };

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

  if (variante === 'cuaderno') {
    return (
      <MenuCuaderno
        triggerRef={triggerRef}
        open={open}
        onToggle={handleToggle}
        close={close}
        estiloPanel={getDropdownStyle()}
        user={user}
        displayName={displayName}
        rol={ROLE_LABELS[userRole] || userRole}
        isOnline={isOnline}
        empresa={empresa}
        empresaId={empresaId}
        empresasDisponibles={empresasDisponibles}
        tieneMultiEmpresa={tieneMultiEmpresa}
        cambiandoEmpresa={cambiandoEmpresa}
        errorCambio={errorCambio}
        onCambiarEmpresa={handleCambiarEmpresa}
        acciones={[
          userRole === 'superadmin' && onAdminPanel && { id: 'super', label: 'Super Admin', icono: TRAZOS.escudo, onClick: onAdminPanel },
          canAdmin && (userRole === 'superadmin' ? onAdminEmpresaPanel : onAdminPanel) && {
            id: 'admin', label: 'Panel de administración', icono: TRAZOS.engranaje,
            onClick: userRole === 'superadmin' ? onAdminEmpresaPanel : onAdminPanel,
          },
          canInvite && { id: 'invitar', label: 'Invitar usuarios', icono: TRAZOS.invitar, onClick: onInviteUsers },
          canPricing && { id: 'plan', label: 'Gestionar plan', icono: TRAZOS.escudo, onClick: onGoToPricing },
          onBackToSelector && { id: 'app', label: 'Cambiar de aplicación', icono: TRAZOS.lineas, onClick: onBackToSelector },
        ].filter(Boolean)}
        onLogout={onLogout}
      />
    );
  }

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

            {/* ── Selector de empresa ──
                Solo aparece cuando el usuario pertenece a más de una. Con una
                sola empresa se muestra el nombre sin controles, para no
                agregar ruido a la mayoría de las cuentas. */}
            {empresasDisponibles.length > 0 && (
              <div className={`px-4 py-3 ${isDark ? 'border-b border-white/10' : 'border-b border-slate-100'}`}>
                <p className={`text-[10px] font-bold uppercase tracking-wider mb-2 ${isDark ? 'text-white/35' : 'text-slate-400'}`}>
                  {tieneMultiEmpresa ? 'Empresa activa' : 'Empresa'}
                </p>

                {!tieneMultiEmpresa ? (
                  <p className={`text-sm font-semibold truncate ${isDark ? 'text-white/80' : 'text-slate-700'}`}>
                    {empresa?.nombre || '—'}
                  </p>
                ) : (
                  <div className="space-y-1">
                    {empresasDisponibles.map(e => {
                      const activa = e.id === empresaId;
                      return (
                        <button
                          key={e.id}
                          disabled={cambiandoEmpresa}
                          onClick={() => handleCambiarEmpresa(e.id)}
                          className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-left transition-colors disabled:opacity-50 ${
                            activa
                              ? (isDark ? 'bg-white/10' : 'bg-blue-50')
                              : (isDark ? 'hover:bg-white/5' : 'hover:bg-slate-50')
                          }`}
                        >
                          <span
                            className={`w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-black flex-shrink-0 ${
                              activa
                                ? 'bg-blue-600 text-white'
                                : (isDark ? 'bg-white/10 text-white/60' : 'bg-slate-200 text-slate-500')
                            }`}
                          >
                            {e.nombre?.[0]?.toUpperCase() || '?'}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className={`block text-xs font-semibold truncate ${
                              activa
                                ? (isDark ? 'text-white' : 'text-blue-900')
                                : (isDark ? 'text-white/70' : 'text-slate-600')
                            }`}>
                              {e.nombre}
                            </span>
                            {e.rut && (
                              <span className={`block text-[10px] truncate ${isDark ? 'text-white/30' : 'text-slate-400'}`}>
                                {e.rut}
                              </span>
                            )}
                          </span>
                          {activa && (
                            <svg className="w-4 h-4 text-blue-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </button>
                      );
                    })}

                    {cambiandoEmpresa && (
                      <p className={`text-[10px] px-2.5 pt-1 ${isDark ? 'text-white/40' : 'text-slate-400'}`}>
                        Cambiando de empresa…
                      </p>
                    )}
                    {errorCambio && (
                      <p className="text-[10px] px-2.5 pt-1 font-semibold text-red-500">{errorCambio}</p>
                    )}
                  </div>
                )}
              </div>
            )}

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
