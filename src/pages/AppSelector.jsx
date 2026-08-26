// ============================================================
// FLEETCORE — APP SELECTOR REDISEÑADO
// Bento asimétrico + datos en vivo + fondo claro
// src/pages/AppSelector.jsx
// ============================================================

import React, { useState, useEffect, useRef } from "react";
import InviteUserPanel from "./InviteUserPanel.jsx";
import { useNavigate } from 'react-router-dom';
import { doc, getDoc, collection, query, where, getCountFromServer } from "firebase/firestore";
import { db } from "../lib/firebase";
import { usePlan } from "../hooks/usePlan";
import { normalizeModulos, isRevisorRole as checkRevisorRole } from "../lib/plans";
import UserMenuDropdown from "../components/UserMenuDropdown";
import { useEmpresa } from "../lib/useEmpresa";

// ── Paleta ────────────────────────────────────────────────────
const COLORS = {
  fleetcore:    { accent: "#f97316", text: "text-orange-600",   bg: "bg-orange-50",   border: "border-orange-200",  chip: "bg-orange-100 text-orange-700" },
  maquinaria:   { accent: "#dc2626", text: "text-red-600",      bg: "bg-red-50",      border: "border-red-200",     chip: "bg-red-100 text-red-700" },
  rrhh:         { accent: "#059669", text: "text-emerald-600",  bg: "bg-emerald-50",  border: "border-emerald-200", chip: "bg-emerald-100 text-emerald-700" },
  reportes:     { accent: "#e11d48", text: "text-rose-600",     bg: "bg-rose-50",     border: "border-rose-200",    chip: "bg-rose-100 text-rose-700" },
  finanzas:     { accent: "#7c3aed", text: "text-violet-600",   bg: "bg-violet-50",   border: "border-violet-200",  chip: "bg-violet-100 text-violet-700" },
  contabilidad: { accent: "#2563eb", text: "text-blue-600",     bg: "bg-blue-50",     border: "border-blue-200",    chip: "bg-blue-100 text-blue-700" },
  documentos:   { accent: "#0891b2", text: "text-cyan-600",     bg: "bg-cyan-50",     border: "border-cyan-200",    chip: "bg-cyan-100 text-cyan-700" },
  workfleet:    { accent: "#0284c7", text: "text-sky-600",      bg: "bg-sky-50",      border: "border-sky-200",     chip: "bg-sky-100 text-sky-700" },
  portal:       { accent: "#047857", text: "text-teal-600",     bg: "bg-teal-50",     border: "border-teal-200",    chip: "bg-teal-100 text-teal-700" },
};

export default function AppSelector({ user, userRole: initialUserRole, onLogout, onSelectApp }) {
  const [userRole, setUserRole] = useState(initialUserRole || 'operador');
  const [empresaId, setEmpresaId] = useState(null);
  const { empresa } = useEmpresa();
  const [showInvite, setShowInvite] = useState(false);
  const [loading, setLoading] = useState(true);
  const { canAccess, loading: planLoading } = usePlan();
  const navigate = useNavigate();

  const [userModulos, setUserModulos] = useState([]);
  const [userName, setUserName] = useState('');
  const [liveData, setLiveData] = useState({});

  useEffect(() => {
    const loadUser = async () => {
      if (!user) return;
      try {
        const snap = await getDoc(doc(db, 'users', user.uid));
        const data = snap.exists() ? snap.data() : {};
        const role = data.role || 'operador';
        setUserRole(role);
        setUserModulos(normalizeModulos(data.modulos));
        setUserName(data.nombre || user.displayName || user.email.split('@')[0]);
        if (data.empresaId) setEmpresaId(data.empresaId);
        if (role === 'trabajador') { window.location.href = '/trabajador'; return; }
      } catch { setUserRole('operador'); }
      finally { setLoading(false); }
    };
    loadUser();
  }, [user]);

  // Carga datos en vivo para los módulos que el usuario puede ver
  useEffect(() => {
    if (!empresaId) return;
    (async () => {
      try {
        const base = ['empresas', empresaId];
        const [otSnap, fallaSnap, repSnap] = await Promise.all([
          getCountFromServer(query(collection(db, ...base, 'workOrders'), where('estado', 'not-in', ['cerrada', 'cancelada']))),
          getCountFromServer(query(collection(db, ...base, 'failures'), where('estado', '==', 'abierta'))),
          getCountFromServer(collection(db, ...base, 'spareParts')),
        ]);
        setLiveData({
          otAbiertas: otSnap.data().count,
          fallasAbiertas: fallaSnap.data().count,
          repuestos: repSnap.data().count,
        });
      } catch { /* silencioso */ }
    })();
  }, [empresaId]);

  // ── Permisos ──────────────────────────────────────────────
  const isSuperAdmin    = userRole === 'superadmin';
  const isAdminContrato = userRole === 'admin_contrato';
  const isRevisorRole   = checkRevisorRole(userRole);
  const isAdmin         = isSuperAdmin || isAdminContrato;
  const hasModulo = (m) => isSuperAdmin || userModulos.includes(m);

  const canAccessFleetCore    = isSuperAdmin || (isAdminContrato && canAccess('fleetcore'))    || (['administrativo','operador'].includes(userRole) && hasModulo('fleetcore') && canAccess('fleetcore'));
  const canAccessWorkFleet    = isSuperAdmin || (isAdminContrato && canAccess('workfleet'))    || (['administrativo','operador'].includes(userRole) && hasModulo('workfleet') && canAccess('workfleet')) || (userRole === 'operador' && canAccess('workfleet'));
  const canAccessRRHH         = isSuperAdmin || (isAdminContrato && canAccess('rrhh'))         || (['administrativo','operador'].includes(userRole) && hasModulo('rrhh') && canAccess('rrhh'));
  const canAccessReportes     = isSuperAdmin || (isAdminContrato && canAccess('reportes'))     || (['administrativo','operador'].includes(userRole) && hasModulo('reportes') && canAccess('reportes'));
  const canAccessFinanzas     = isSuperAdmin || (isAdminContrato && canAccess('finanzas'))     || (['administrativo','operador'].includes(userRole) && hasModulo('finanzas') && canAccess('finanzas'));
  const canAccessContabilidad = isSuperAdmin || (isAdminContrato && canAccess('contabilidad')) || (['administrativo','operador'].includes(userRole) && hasModulo('contabilidad') && canAccess('contabilidad'));
  const canAccessMaquinaria   = isSuperAdmin || (isAdminContrato && canAccess('maquinaria'))   || (['administrativo','jefe_taller','mecanico'].includes(userRole) && hasModulo('maquinaria') && canAccess('maquinaria'));
  const canAccessDocumentos   = isSuperAdmin || (isAdminContrato && canAccess('fleetcore'))    || isRevisorRole || (['administrativo','operador'].includes(userRole) && hasModulo('fleetcore') && canAccess('fleetcore'));
  const canAccessWorkFleetM   = isSuperAdmin || userRole === 'operador' || (isAdminContrato && canAccess('workfleet')) || (['administrativo','operador'].includes(userRole) && canAccess('workfleet'));

  const blockReason = (moduleId, roleOk) => {
    if (!roleOk) return 'role';
    if (!canAccess(moduleId)) return 'plan';
    return null;
  };

  const onUpgrade = () => {
    if (isSuperAdmin) navigate('/admin');
    else if (isAdminContrato) navigate('/admin?tab=mi_plan');
    else { localStorage.setItem('selectedApp', 'pricing'); onSelectApp('pricing'); }
  };

  const handleSelect = (appId, hasAccess) => {
    if (!hasAccess) return;
    localStorage.setItem('selectedApp', appId);
    onSelectApp(appId);
  };

  if (loading || planLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-slate-400 font-semibold">Cargando…</div>
      </div>
    );
  }

  // Vista exclusiva revisor
  if (isRevisorRole) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        {showInvite && <InviteUserPanel empresaId={empresaId} onClose={() => setShowInvite(false)} soloRevisores={false} />}
        <div className="fixed top-4 right-4 z-50">
          <UserMenuDropdown user={user} userRole={userRole} onLogout={onLogout} onAdminPanel={() => navigate('/admin')} onAdminEmpresaPanel={() => navigate('/admin/empresa')} onInviteUsers={() => setShowInvite(true)} />
        </div>
        <ModuleCard
          label="FleetCore-I" logo="/logo-fleetcore-i.svg" colorKey="documentos"
          canAccess={true} blockReason={null} isAdmin={isAdmin}
          tagline="Libro de obras e informes de terreno"
          chips={["Firma digital", "IA integrada", "Libro homologado"]}
          onSelect={() => handleSelect('documentos', true)} onUpgrade={onUpgrade}
        />
      </div>
    );
  }

  return (
    <>
      {showInvite && <InviteUserPanel empresaId={empresaId} onClose={() => setShowInvite(false)} soloRevisores={false} />}

      <div className="min-h-screen bg-slate-50 font-sans">
        {/* Header */}
        <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
            <div className="flex items-center gap-3">
              {empresa?.logoUrl
                ? <img src={empresa.logoUrl} alt={empresa.nombre} className="h-7 w-auto object-contain" />
                : <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center text-xs font-black text-white">{empresa?.nombre?.[0] || "F"}</div>
              }
              <span className="text-sm font-bold text-slate-900">{empresa?.nombre || "FleetCore"}</span>
              <span className="hidden sm:block w-px h-4 bg-slate-200" />
              <span className="hidden sm:block text-xs text-slate-400 font-medium">Suite de gestión</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-500 hidden sm:block">Hola, <strong className="text-slate-700">{userName}</strong></span>
              <UserMenuDropdown
                user={user} userRole={userRole} onLogout={onLogout}
                onAdminPanel={isAdmin ? () => navigate('/admin') : undefined}
                onAdminEmpresaPanel={isAdmin ? () => navigate('/admin/empresa') : undefined}
                onInviteUsers={isAdmin ? () => setShowInvite(true) : undefined}
                onGoToPricing={!isSuperAdmin ? onUpgrade : undefined}
              />
            </div>
          </div>
        </header>

        <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-10 space-y-10">

          {/* Bienvenida */}
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900">Buenos días, {userName.split(' ')[0]} 👋</h1>
            <p className="text-slate-500 mt-1 text-sm">¿A qué módulo vas hoy?</p>
          </div>

          {/* ── SECCIÓN 1: Gestión y control ── */}
          <section className="space-y-4">
            <SectionLabel icon="🏢" label="Gestión y control" />

            {/* Bento: Maquinaria destacada (ancha) + dos columnas */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

              {/* Maquinaria — card grande con datos en vivo */}
              <div className="lg:col-span-2">
                <FeaturedCard
                  label="Maquinaria" logo="/logo-maquinaria.svg" colorKey="maquinaria"
                  tagline="Rental, mantenimiento y control de flota"
                  live={[
                    { label: "OT abiertas", value: liveData.otAbiertas ?? "—" },
                    { label: "Fallas activas", value: liveData.fallasAbiertas ?? "—" },
                    { label: "Repuestos", value: liveData.repuestos ?? "—" },
                  ]}
                  chips={["Rental SpA", "Taller", "Checklist", "Alertas"]}
                  canAccess={canAccessMaquinaria}
                  blockReason={blockReason('maquinaria', isSuperAdmin || isAdminContrato || (['administrativo','jefe_taller','mecanico'].includes(userRole) && hasModulo('maquinaria')))}
                  isAdmin={isAdmin}
                  onSelect={() => handleSelect('maquinaria', canAccessMaquinaria)}
                  onUpgrade={onUpgrade}
                />
              </div>

              {/* Columna derecha: Oficina Técnica + RRHH */}
              <div className="flex flex-col gap-4">
                <ModuleCard
                  label="Oficina Técnica" logo="/logo-fleetcore-o.svg" colorKey="fleetcore"
                  tagline="Equipos, faenas y control de costos"
                  chips={["Equipos", "Costos", "OC"]}
                  canAccess={canAccessFleetCore}
                  blockReason={blockReason('fleetcore', isSuperAdmin || isAdminContrato || (['administrativo','operador'].includes(userRole) && hasModulo('fleetcore')))}
                  isAdmin={isAdmin}
                  onSelect={() => handleSelect('fleetcore', canAccessFleetCore)}
                  onUpgrade={onUpgrade}
                  compact
                />
                <ModuleCard
                  label="Recursos Humanos" logo="/logo-fleetcore-r.png" colorKey="rrhh"
                  tagline="Contratos, liquidaciones y asistencia"
                  chips={["Contratos", "Remuneraciones", "Previred"]}
                  canAccess={canAccessRRHH}
                  blockReason={blockReason('rrhh', isSuperAdmin || isAdminContrato || (['administrativo','operador'].includes(userRole) && hasModulo('rrhh')))}
                  isAdmin={isAdmin}
                  onSelect={() => handleSelect('rrhh', canAccessRRHH)}
                  onUpgrade={onUpgrade}
                  compact
                />
              </div>
            </div>

            {/* Fila de módulos de finanzas */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <ModuleCard
                label="Reportes" logo="/wf-logo-movil.svg" colorKey="reportes"
                tagline="Análisis de maquinaria y combustible"
                chips={["Maquinaria", "Combustible", "KPIs"]}
                canAccess={canAccessReportes}
                blockReason={blockReason('reportes', isSuperAdmin || isAdminContrato || (['administrativo','operador'].includes(userRole) && hasModulo('reportes')))}
                isAdmin={isAdmin}
                onSelect={() => handleSelect('reportes', canAccessReportes)}
                onUpgrade={onUpgrade}
                compact
              />
              <ModuleCard
                label="Finanzas" logo="/logo-fleetcore-f.png" colorKey="finanzas"
                tagline="Flujo de caja y control financiero"
                chips={["Flujo de caja", "Proveedores", "Leasing"]}
                canAccess={canAccessFinanzas}
                blockReason={blockReason('finanzas', isSuperAdmin || isAdminContrato || (['administrativo','operador'].includes(userRole) && hasModulo('finanzas')))}
                isAdmin={isAdmin}
                onSelect={() => handleSelect('finanzas', canAccessFinanzas)}
                onUpgrade={onUpgrade}
                compact
              />
              <ModuleCard
                label="Contabilidad" logo="/logo-fleetcore-f.png" colorKey="contabilidad"
                tagline="Libro diario, balance y tributario"
                chips={["IFRS/SII", "F29", "Balance"]}
                canAccess={canAccessContabilidad}
                blockReason={blockReason('contabilidad', isSuperAdmin || isAdminContrato || (['administrativo','operador'].includes(userRole) && hasModulo('contabilidad')))}
                isAdmin={isAdmin}
                onSelect={() => handleSelect('contabilidad', canAccessContabilidad)}
                onUpgrade={onUpgrade}
                compact
              />
              <ModuleCard
                label="FleetCore-I" logo="/logo-fleetcore-i.svg" colorKey="documentos"
                tagline="Libro de obras e informes con IA"
                chips={["Firma digital", "IA", "Libro de obras"]}
                canAccess={canAccessDocumentos}
                blockReason={blockReason('fleetcore', isSuperAdmin || isAdminContrato || isRevisorRole || (['administrativo','operador'].includes(userRole) && hasModulo('fleetcore')))}
                isAdmin={isAdmin}
                onSelect={() => handleSelect('documentos', canAccessDocumentos)}
                onUpgrade={onUpgrade}
                compact
              />
            </div>
          </section>

          {/* ── SECCIÓN 2: Operación en terreno ── */}
          <section className="space-y-4">
            <SectionLabel icon="🚜" label="Operación en terreno" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl">
              <ModuleCard
                label="WorkFleet Mobile" logo="/wf-logo.svg" colorKey="workfleet"
                tagline="Horómetros y combustible sin señal"
                chips={["Offline", "Horómetros", "Combustible"]}
                canAccess={canAccessWorkFleetM}
                blockReason={blockReason('workfleet', isSuperAdmin || isAdminContrato || userRole === 'operador' || userRole === 'administrativo')}
                isAdmin={isAdmin}
                onSelect={() => handleSelect('workfleet-m', canAccessWorkFleetM)}
                onUpgrade={onUpgrade}
                compact
              />
              <ModuleCard
                label="Portal Trabajadores" logo="/logo-fleetcore-r.png" colorKey="portal"
                tagline="Liquidaciones, contratos y certificados"
                chips={["Liquidaciones", "Certificados", "Vacaciones"]}
                canAccess={true} blockReason={null} isAdmin={isAdmin}
                onSelect={() => { window.location.href = '/trabajador'; }}
                onUpgrade={onUpgrade}
                compact
              />
            </div>
          </section>

          <footer className="text-xs text-slate-400 text-center pt-4 pb-2">
            Cambia de módulo cuando quieras desde el menú de usuario
          </footer>
        </main>
      </div>
    </>
  );
}

// ── Sección label ─────────────────────────────────────────────
function SectionLabel({ icon, label }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs font-black text-slate-400 uppercase tracking-widest">{icon} {label}</span>
      <div className="flex-1 h-px bg-slate-200" />
    </div>
  );
}

// ── FeaturedCard (Maquinaria destacada con datos en vivo) ──────
function FeaturedCard({ label, logo, colorKey, tagline, live, chips, canAccess, blockReason, isAdmin, onSelect, onUpgrade }) {
  const col = COLORS[colorKey] || COLORS.maquinaria;
  const [imgErr, setImgErr] = useState(false);

  return (
    <div
      onClick={canAccess ? onSelect : undefined}
      className={`relative h-full rounded-2xl border-2 bg-white overflow-hidden transition-all duration-200
        ${canAccess ? `cursor-pointer hover:shadow-lg hover:${col.border} ${col.border}` : 'cursor-default border-slate-200 opacity-75'}`}
    >
      {/* Accent strip */}
      <div className="h-1 w-full" style={{ background: col.accent }} />

      <div className="p-5 flex flex-col h-full gap-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className={`w-11 h-11 rounded-xl ${col.bg} flex items-center justify-center border ${col.border} shrink-0`}>
              {!imgErr
                ? <img src={logo} alt={label} className="w-7 h-7 object-contain" onError={() => setImgErr(true)} />
                : <span className={`text-base font-black ${col.text}`}>{label[0]}</span>
              }
            </div>
            <div>
              <p className={`text-xs font-black uppercase ${col.text}`}>{label}</p>
              <p className="text-sm font-semibold text-slate-700 mt-0.5">{tagline}</p>
            </div>
          </div>
          {blockReason && (
            <LockBadge reason={blockReason} isAdmin={isAdmin} onUpgrade={onUpgrade} />
          )}
        </div>

        {/* Stats en vivo */}
        {canAccess && (
          <div className="grid grid-cols-3 gap-3">
            {live.map((s) => (
              <div key={s.label} className={`rounded-xl ${col.bg} border ${col.border} px-3 py-2.5 text-center`}>
                <p className={`text-2xl font-black ${col.text}`}>{s.value}</p>
                <p className="text-[10px] font-semibold text-slate-500 mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Chips */}
        <div className="flex flex-wrap gap-1.5">
          {chips.map((c) => (
            <span key={c} className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${col.chip}`}>{c}</span>
          ))}
        </div>

        {/* Footer */}
        <div className="mt-auto flex items-center justify-between">
          {canAccess
            ? <span className={`text-sm font-black ${col.text}`}>Abrir módulo →</span>
            : <span className="text-xs text-slate-400">No disponible</span>
          }
        </div>
      </div>
    </div>
  );
}

// ── ModuleCard (tarjeta estándar, compacta o normal) ──────────
function ModuleCard({ label, logo, colorKey, tagline, chips, canAccess, blockReason, isAdmin, onSelect, onUpgrade, compact }) {
  const col = COLORS[colorKey] || COLORS.fleetcore;
  const [imgErr, setImgErr] = useState(false);

  return (
    <div
      onClick={canAccess ? onSelect : undefined}
      className={`relative rounded-2xl border-2 bg-white overflow-hidden transition-all duration-200
        ${canAccess ? `cursor-pointer hover:shadow-md hover:${col.border} ${col.border}` : 'cursor-default border-slate-200 opacity-70'}
        ${compact ? 'p-4' : 'p-5'}`}
    >
      <div className="h-0.5 absolute top-0 left-0 right-0" style={{ background: canAccess ? col.accent : '#e2e8f0' }} />

      <div className="flex items-start gap-3 pt-1">
        <div className={`w-9 h-9 rounded-xl ${col.bg} flex items-center justify-center border ${col.border} shrink-0`}>
          {!imgErr
            ? <img src={logo} alt={label} className="w-5 h-5 object-contain" onError={() => setImgErr(true)} />
            : <span className={`text-xs font-black ${col.text}`}>{label[0]}</span>
          }
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-1">
            <p className={`text-xs font-black uppercase ${canAccess ? col.text : 'text-slate-400'}`}>{label}</p>
            {blockReason && <LockBadge reason={blockReason} isAdmin={isAdmin} onUpgrade={onUpgrade} mini />}
          </div>
          <p className="text-xs text-slate-500 mt-0.5 leading-snug">{tagline}</p>
          <div className="flex flex-wrap gap-1 mt-2">
            {chips.slice(0, compact ? 2 : 3).map((c) => (
              <span key={c} className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${canAccess ? col.chip : 'bg-slate-100 text-slate-400'}`}>{c}</span>
            ))}
          </div>
        </div>
      </div>

      {canAccess && (
        <p className={`text-[10px] font-black ${col.text} mt-3 text-right`}>Abrir →</p>
      )}
    </div>
  );
}

// ── LockBadge ─────────────────────────────────────────────────
function LockBadge({ reason, isAdmin, onUpgrade, mini }) {
  if (reason === 'role') {
    return (
      <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-400 flex items-center gap-0.5 shrink-0 ${mini ? '' : 'mt-0.5'}`}>
        <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
        Sin permiso
      </span>
    );
  }
  if (reason === 'plan') {
    return (
      <button
        onClick={(e) => { e.stopPropagation(); if (isAdmin) onUpgrade(); }}
        className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 flex items-center gap-0.5 shrink-0 ${mini ? '' : 'mt-0.5'} ${isAdmin ? 'cursor-pointer hover:bg-amber-200' : 'cursor-default'}`}
      >
        <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
        </svg>
        {isAdmin ? 'Contratar' : 'No incluido'}
      </button>
    );
  }
  return null;
}
