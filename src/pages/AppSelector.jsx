// ============================================================
// FLEETCORE — APP SELECTOR CON GATES DE PLAN
// src/pages/AppSelector.jsx
//
// Drop-in replacement del AppSelector original.
// Ahora verifica TANTO el rol del usuario COMO el plan activo.
// ============================================================

import React, { useState, useEffect } from "react";
import InviteUserPanel from "./InviteUserPanel.jsx";
import { useNavigate } from 'react-router-dom';
import { doc, getDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { usePlan } from "../hooks/usePlan";
import { getPlan, formatPrice } from "../lib/plans";
import UserMenuDropdown from "../components/UserMenuDropdown";
import { useEmpresa } from "../lib/useEmpresa";

export default function AppSelector({ user, userRole: initialUserRole, onLogout, onSelectApp }) {
  const [userRole, setUserRole] = useState(initialUserRole || 'operador');
  const [empresaId, setEmpresaId] = useState(null);
  const { empresa } = useEmpresa();
  const [showInvite, setShowInvite] = useState(false);
  const [loading, setLoading] = useState(true);
  const { canAccess, activeModules, isActive, status, loading: planLoading } = usePlan();
  const navigate = useNavigate();

  const [userModulos, setUserModulos] = useState([]);
  const [userCargo, setUserCargo] = useState('');
  const [userName, setUserName] = useState('');

  useEffect(() => {
    const loadUser = async () => {
      if (!user) return;
      try {
        const snap = await getDoc(doc(db, 'users', user.uid));
        const data = snap.exists() ? snap.data() : {};
        const role = data.role || 'operador';
        const modulos = data.modulos || [];
        const cargo = data.cargo || '';
        setUserRole(role);
        setUserModulos(modulos);
        setUserCargo(cargo);
        const nombre = data.nombre || user.displayName || user.email.split('@')[0];
        setUserName(nombre);
        // ✅ FIX: cargar empresaId para pasarlo a InviteUserPanel
        if (data.empresaId) setEmpresaId(data.empresaId);

        // Redirección automática para roles que tienen app propia
        if (role === 'trabajador') {
          window.location.href = '/trabajador';
          return;
        }
      } catch {
        setUserRole('operador');
      } finally {
        setLoading(false);
      }
    };
    loadUser();
  }, [user, onSelectApp]);

  // ── Helpers de permisos ──────────────────────────────────────
  const isSuperAdmin = userRole === 'superadmin';
  const isAdminContrato = userRole === 'admin_contrato';
  const isRevisorAdmin = userRole === 'revisor_admin';
  const isRevisor = userRole === 'revisor';
  const isMandanteAdmin = userRole === 'mandante_admin';
  const isMandante = userRole === 'mandante';
  const isRevisorRole = isRevisorAdmin || isRevisor || isMandanteAdmin || isMandante;
  const hasModulo = (m) => isSuperAdmin || userModulos.includes(m);
  const isAdmin = isSuperAdmin || isAdminContrato;
  const isOperadorRole = userRole === 'operador';

  // Permisos combinados: rol + módulo + plan
  // ✅ FIX: superadmin nunca bloqueado por plan — bypassa canAccess()
  const canAccessFleetCore = isSuperAdmin || (isAdminContrato && canAccess('fleetcore')) || ((['administrativo', 'operador'].includes(userRole) && hasModulo('fleetcore')) && canAccess('fleetcore'));
  const canAccessWorkFleet = isSuperAdmin || (isAdminContrato && canAccess('workfleet')) || ((['administrativo', 'operador'].includes(userRole) && hasModulo('workfleet')) && canAccess('workfleet')) || (userRole === 'operador' && canAccess('workfleet'));
  const canAccessRRHH = isSuperAdmin || (isAdminContrato && canAccess('rrhh')) || ((['administrativo', 'operador'].includes(userRole) && hasModulo('rrhh')) && canAccess('rrhh'));
  const canAccessReportes = isSuperAdmin || (isAdminContrato && canAccess('reportes')) || ((['administrativo', 'operador'].includes(userRole) && hasModulo('reportes')) && canAccess('reportes'));
  const canAccessFinanzas = isSuperAdmin || (isAdminContrato && canAccess('finanzas')) || ((['administrativo', 'operador'].includes(userRole) && hasModulo('finanzas')) && canAccess('finanzas'));
  const canAccessContabilidad = isSuperAdmin || (isAdminContrato && canAccess('contabilidad')) || ((['administrativo', 'operador'].includes(userRole) && hasModulo('contabilidad')) && canAccess('contabilidad'));
  const canAccessDocumentos = isSuperAdmin || (isAdminContrato && canAccess('fleetcore')) || (isRevisorRole && canAccess('fleetcore')) || ((['administrativo', 'operador'].includes(userRole) && hasModulo('fleetcore')) && canAccess('fleetcore'));
  // Operadores siempre tienen acceso a WorkFleet-M si están asignados a una empresa
  // (el chequeo de plan aplica solo a nivel empresa/admin, no a usuarios individuales)
  const canAccessWorkFleetM = isSuperAdmin || userRole === 'operador' || (isAdminContrato && canAccess('workfleet')) || (['administrativo', 'operador'].includes(userRole) && canAccess('workfleet'));

  // Razón de bloqueo para mostrar el mensaje correcto
  const blockReason = (moduleId, roleOk) => {
    if (!roleOk) return 'role';
    if (!canAccess(moduleId)) return 'plan';
    return null;
  };

  const handleSelect = (appId, hasAccess) => {
    if (!hasAccess) return;
    localStorage.setItem('selectedApp', appId);
    onSelectApp(appId);
  };

  const canvasRef = React.useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animationFrameId;

    let width = canvas.width = window.innerWidth;
    let height = canvas.height = window.innerHeight;

    const particles = [];
    const particleCount = Math.min(60, Math.floor((width * height) / 25000));
    const mouse = { x: null, y: null, radius: 140 };

    class Particle {
      constructor() {
        this.x = Math.random() * width;
        this.y = Math.random() * height;
        this.vx = (Math.random() - 0.5) * 0.35;
        this.vy = (Math.random() - 0.5) * 0.35;
        this.radius = Math.random() * 1.5 + 0.5;
      }
      update() {
        this.x += this.vx;
        this.y += this.vy;

        if (this.x < 0 || this.x > width) this.vx = -this.vx;
        if (this.y < 0 || this.y > height) this.vy = -this.vy;

        if (mouse.x !== null && mouse.y !== null) {
          const dx = mouse.x - this.x;
          const dy = mouse.y - this.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < mouse.radius) {
            const force = (mouse.radius - dist) / mouse.radius;
            this.x -= dx / dist * force * 0.15;
            this.y -= dy / dist * force * 0.15;
          }
        }
      }
      draw() {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(165, 180, 252, 0.3)';
        ctx.fill();
      }
    }

    for (let i = 0; i < particleCount; i++) {
      particles.push(new Particle());
    }

    const onMouseMove = (e) => {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
    };

    const onMouseLeave = () => {
      mouse.x = null;
      mouse.y = null;
    };

    const onResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseleave', onMouseLeave);
    window.addEventListener('resize', onResize);

    const animate = () => {
      ctx.clearRect(0, 0, width, height);

      particles.forEach(p => {
        p.update();
        p.draw();
      });

      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < 100) {
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = `rgba(99, 102, 241, ${0.12 * (1 - dist / 100)})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }

        if (mouse.x !== null && mouse.y !== null) {
          const dx = particles[i].x - mouse.x;
          const dy = particles[i].y - mouse.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < mouse.radius) {
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(mouse.x, mouse.y);
            ctx.strokeStyle = `rgba(139, 92, 246, ${0.2 * (1 - dist / mouse.radius)})`;
            ctx.lineWidth = 0.6;
            ctx.stroke();
          }
        }
      }

      animationFrameId = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseleave', onMouseLeave);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  if (loading || planLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center">
        <div className="text-white text-xl">Cargando...</div>
      </div>
    );
  }

  return (
    <>
      {showInvite && <InviteUserPanel empresaId={empresaId} onClose={() => setShowInvite(false)} soloRevisores={false} />}

      <div className="min-h-screen bg-[#06070a] bg-[radial-gradient(rgba(255,255,255,0.02)_1px,transparent_1px)] [background-size:20px_20px] flex items-center justify-center px-4 py-4 sm:p-6 relative overflow-hidden font-sans select-none">

        {/* Interactive Constellations Background */}
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none z-0" />

        {/* Ambient Glows */}
        <div className="absolute top-[-20%] right-[-10%] w-[500px] h-[500px] bg-indigo-500/5 rounded-full blur-[100px] pointer-events-none" />
        <div className="absolute bottom-[-20%] left-[-10%] w-[500px] h-[500px] bg-violet-600/5 rounded-full blur-[100px] pointer-events-none" />

        {/* Menú de usuario unificado */}
        <div className="fixed top-4 right-4 sm:top-5 sm:right-5 lg:right-6 z-50">
          <UserMenuDropdown
            user={user}
            userRole={userRole}
            onLogout={onLogout}
            onAdminPanel={() => navigate('/admin')}
            onAdminEmpresaPanel={() => navigate('/admin/empresa')}
            onInviteUsers={() => setShowInvite(true)}
            onGoToPricing={!isSuperAdmin ? () => {
              localStorage.setItem('selectedApp', 'admin');
              if (isAdminContrato) {
                navigate('/admin?tab=mi_plan');
              } else {
                localStorage.setItem('selectedApp', 'pricing');
                onSelectApp('pricing');
              }
            } : undefined}
            theme="dark"
          />
        </div>

        <div className="relative w-full max-w-5xl pt-12 sm:pt-4 z-10">

          {/* Header Panel Compacto */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 sm:p-5 mb-6 sm:mb-8 rounded-2xl bg-slate-900/30 border border-white/5 backdrop-blur-md shadow-2xl transition-all duration-300 hover:border-white/10 animate-fadeInUp">

            {/* Branding - Empresa */}
            <div className="flex items-center gap-3.5">
              {empresa?.logoUrl ? (
                <img
                  src={empresa.logoUrl}
                  alt={empresa.nombre}
                  className="h-10 sm:h-12 w-auto max-w-[180px] object-contain filter drop-shadow-[0_2px_8px_rgba(0,0,0,0.4)]"
                />
              ) : (
                <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-lg font-black text-white shadow-lg shadow-indigo-500/20">
                  {empresa?.nombre?.[0] || "F"}
                </div>
              )}
              <div className="text-left leading-tight">
                <span className="text-[9px] font-black text-indigo-400/80 tracking-widest uppercase">EMPRESA CONECTADA</span>
                <h2 className="text-xs sm:text-sm font-extrabold text-white tracking-wide truncate max-w-[200px]">{empresa?.nombre || "FleetCore"}</h2>
              </div>
            </div>

            {/* Separador */}
            <div className="hidden sm:block h-8 w-px bg-white/10" />

            {/* Saludo Personalizado */}
            <div className="flex items-center gap-2">
              <div className="text-center sm:text-right leading-tight">
                <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">SESIÓN ACTIVA</p>
                <h3 className="text-xs sm:text-sm font-extrabold text-slate-200">
                  Hola, <span className="bg-clip-text text-transparent bg-gradient-to-r from-indigo-300 to-violet-400 font-black">{userName || 'Usuario'}</span> 👋
                </h3>
              </div>
            </div>
          </div>

          {/* Grid de cards */}
          {isRevisorRole ? (
            /* Vista exclusiva para roles revisor */
            <div className="max-w-sm mx-auto w-full">
              <AppCard
                onClick={() => handleSelect('documentos', true)}
                canAccess={true}
                blockReason={null}
                isAdmin={isAdmin}
                glowColor="from-cyan-500/20 to-teal-600/20"
                buttonClass="from-cyan-500 to-teal-600"
                buttonLabel="Abrir FleetCore-I"
                badgeClass="bg-cyan-500/10 text-cyan-400 border border-cyan-500/20"
                badgeLabel="FleetCore-I"
                logoSrc="/logo-fleetcore-i.svg"
                logoAlt="FleetCore-I"
                features={[
                  { text: "Plan de trabajo con IA" },
                  { text: "Informe diario de obra" },
                  { text: "Libro de obras y comunicaciones" },
                  { text: "Historial de documentos" },
                  { text: "Firma digital por roles" },
                  { text: "Redacción asistida por IA" },
                ]}
                onUpgrade={() => { }}
              />
            </div>
          ) : (
            <div className="space-y-10">

              {/* Sección 1: Gestión de Oficina y Control */}
              <div>
                <div className="flex items-center gap-3.5 mb-5 sm:mb-6">
                  <span className="text-slate-300 text-[10px] sm:text-xs font-black uppercase tracking-widest bg-white/5 border border-white/10 px-3.5 py-1.5 rounded-xl backdrop-blur-md shadow-inner">
                    🏢 Gestión y Control de Oficina
                  </span>
                  <div className="h-px flex-1 bg-gradient-to-r from-white/10 to-transparent" />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 lg:gap-6">
                  <AppCard
                    onClick={() => handleSelect('fleetcore', canAccessFleetCore)}
                    canAccess={canAccessFleetCore}
                    blockReason={blockReason('fleetcore', isSuperAdmin || isAdminContrato || (['administrativo', 'operador'].includes(userRole) && hasModulo('fleetcore')))}
                    isAdmin={isAdmin}
                    glowColor="from-orange-500/20 to-amber-600/20"
                    buttonClass="from-orange-600 to-amber-600"
                    buttonLabel="Abrir Oficina Técnica"
                    badgeClass="bg-orange-500/10 text-orange-400 border border-orange-500/20"
                    badgeLabel="Oficina Técnica"
                    logoSrc="/logo-workfleet.png"
                    logoAlt="WorkFleet"
                    features={[
                      { text: "Dashboard y reportes de faena" },
                      { text: "Gestión y control de equipos" },
                      { text: "Calendario operativo y logs" },
                      { text: "Remuneraciones y costos" },
                      { text: "Consolidación de órdenes de compra" },
                    ]}
                    onUpgrade={() => {
                      if (isSuperAdmin) { navigate('/admin'); }
                      else if (isAdminContrato) { navigate('/admin?tab=mi_plan'); }
                      else { localStorage.setItem('selectedApp', 'pricing'); onSelectApp('pricing'); }
                    }}
                  />

                  <AppCard
                    onClick={() => handleSelect('rrhh', canAccessRRHH)}
                    canAccess={canAccessRRHH}
                    blockReason={blockReason('rrhh', isSuperAdmin || isAdminContrato || (['administrativo', 'operador'].includes(userRole) && hasModulo('rrhh')))}
                    isAdmin={isAdmin}
                    glowColor="from-emerald-500/20 to-teal-600/20"
                    buttonClass="from-emerald-600 to-teal-600"
                    buttonLabel="Abrir RRHH"
                    badgeClass="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                    badgeLabel="Recursos Humanos"
                    logoSrc="/logo-fleetcore-r.png"
                    logoAlt="FleetCore RRHH"
                    features={[
                      { text: "Gestión centralizada de trabajadores" },
                      { text: "Contratos de trabajo y anexos" },
                      { text: "Remuneraciones y liquidaciones" },
                      { text: "Cálculo de impuestos y Previred" },
                      { text: "Control de asistencia y permisos" },
                      { text: "Reportes contables exportables" },
                    ]}
                    onUpgrade={() => {
                      if (isSuperAdmin) { navigate('/admin'); }
                      else if (isAdminContrato) { navigate('/admin?tab=mi_plan'); }
                      else { localStorage.setItem('selectedApp', 'pricing'); onSelectApp('pricing'); }
                    }}
                  />

                  <AppCard
                    onClick={() => handleSelect('reportes', canAccessReportes)}
                    canAccess={canAccessReportes}
                    blockReason={blockReason('reportes', isSuperAdmin || isAdminContrato || (['administrativo', 'operador'].includes(userRole) && hasModulo('reportes')))}
                    isAdmin={isAdmin}
                    glowColor="from-rose-500/20 to-red-600/20"
                    buttonClass="from-rose-600 to-red-600"
                    buttonLabel="Abrir Reportes"
                    badgeClass="bg-rose-500/10 text-rose-400 border border-rose-500/20"
                    badgeLabel="Finanzas / Reportes"
                    logoSrc="/wf-logo-movil.svg"
                    logoAlt="Reportes"
                    features={[
                      { text: "Reportes detallados de maquinaria" },
                      { text: "Reportes y auditoría de combustible" },
                      { text: "Análisis de rendimientos y producción" },
                      { text: "Filtros interactivos por equipo" },
                      { text: "Históricos agrupados por período" },
                      { text: "Panel de administración y control" },
                    ]}
                    onUpgrade={() => {
                      if (isSuperAdmin) { navigate('/admin'); }
                      else if (isAdminContrato) { navigate('/admin?tab=mi_plan'); }
                      else { localStorage.setItem('selectedApp', 'pricing'); onSelectApp('pricing'); }
                    }}
                  />

                  <AppCard
                    onClick={() => handleSelect('finanzas', canAccessFinanzas)}
                    canAccess={canAccessFinanzas}
                    blockReason={blockReason('finanzas', isSuperAdmin || isAdminContrato || (['administrativo', 'operador'].includes(userRole) && hasModulo('finanzas')))}
                    isAdmin={isAdmin}
                    glowColor="from-purple-500/20 to-violet-600/20"
                    buttonClass="from-purple-600 to-violet-600"
                    buttonLabel="Abrir Finanzas"
                    badgeClass="bg-purple-500/10 text-purple-400 border border-purple-500/20"
                    badgeLabel="Finanzas"
                    logoSrc="/logo-fleetcore-f.png"
                    logoAlt="FleetCore Finanzas"
                    features={[
                      { text: "Flujo de caja real y proyectado" },
                      { text: "Costos fijos y variables" },
                      { text: "Gestión contable de activos fijos" },
                      { text: "Cuentas por pagar y proveedores" },
                      { text: "Créditos, leasings y obligaciones" },
                      { text: "Análisis financiero detallado" },
                    ]}
                    onUpgrade={() => {
                      if (isSuperAdmin) { navigate('/admin'); }
                      else if (isAdminContrato) { navigate('/admin?tab=mi_plan'); }
                      else { localStorage.setItem('selectedApp', 'pricing'); onSelectApp('pricing'); }
                    }}
                  />

                  <AppCard
                    onClick={() => handleSelect('contabilidad', canAccessContabilidad)}
                    canAccess={canAccessContabilidad}
                    blockReason={blockReason('contabilidad', isSuperAdmin || isAdminContrato || (['administrativo', 'operador'].includes(userRole) && hasModulo('contabilidad')))}
                    isAdmin={isAdmin}
                    glowColor="from-indigo-500/20 to-blue-600/20"
                    buttonClass="from-indigo-600 to-blue-600"
                    buttonLabel="Abrir Contabilidad"
                    badgeClass="bg-indigo-500/10 text-indigo-400 border border-indigo-500/20"
                    badgeLabel="Contabilidad"
                    logoSrc="/logo-fleetcore-f.png"
                    logoAlt="FleetCore Contabilidad"
                    features={[
                      { text: "Plan de cuentas adaptado IFRS/SII" },
                      { text: "Libro diario y generación de asientos" },
                      { text: "Balance general de 8 columnas" },
                      { text: "Estados financieros y de Resultados" },
                      { text: "Generación de F29, F22 y PPM" },
                      { text: "Impuestos diferidos (NIC 12)" },
                    ]}
                    onUpgrade={() => {
                      if (isSuperAdmin) { navigate('/admin'); }
                      else if (isAdminContrato) { navigate('/admin?tab=mi_plan'); }
                      else { localStorage.setItem('selectedApp', 'pricing'); onSelectApp('pricing'); }
                    }}
                  />

                  <AppCard
                    onClick={() => handleSelect('documentos', canAccessDocumentos)}
                    canAccess={canAccessDocumentos}
                    blockReason={blockReason('fleetcore', isSuperAdmin || isAdminContrato || isRevisorRole || (['administrativo', 'operador'].includes(userRole) && hasModulo('fleetcore')))}
                    isAdmin={isAdmin}
                    glowColor="from-cyan-500/20 to-teal-600/20"
                    buttonClass="from-cyan-600 to-teal-600"
                    buttonLabel="Abrir FleetCore-I"
                    badgeClass="bg-cyan-500/10 text-cyan-400 border border-cyan-500/20"
                    badgeLabel="FleetCore-I"
                    logoSrc="/logo-fleetcore-i.svg"
                    logoAlt="FleetCore-I"
                    features={[
                      { text: "Plan de trabajo y cronograma con IA" },
                      { text: "Informe diario de obra de terreno" },
                      { text: "Libro de obras digital homologado" },
                      { text: "Historial y carpetas de documentos" },
                      { text: "Flujos de firma digital por roles" },
                      { text: "Redacción asistida y auditoría con IA" },
                    ]}
                    onUpgrade={() => {
                      if (isSuperAdmin) { navigate('/admin'); }
                      else if (isAdminContrato) { navigate('/admin?tab=mi_plan'); }
                      else { localStorage.setItem('selectedApp', 'pricing'); onSelectApp('pricing'); }
                    }}
                  />
                </div>
              </div>

              {/* Sección 2: Operación en Terreno (Mobile-First) */}
              <div>
                <div className="flex items-center gap-3.5 mb-5 sm:mb-6">
                  <span className="text-slate-300 text-[10px] sm:text-xs font-black uppercase tracking-widest bg-white/5 border border-white/10 px-3.5 py-1.5 rounded-xl backdrop-blur-md shadow-inner">
                    🚜 Operación en Terreno
                  </span>
                  <div className="h-px flex-1 bg-gradient-to-r from-white/10 to-transparent" />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 max-w-3xl mx-auto">
                  <AppCard
                    onClick={() => handleSelect('workfleet-m', canAccessWorkFleetM)}
                    canAccess={canAccessWorkFleetM}
                    blockReason={blockReason('workfleet', isSuperAdmin || isAdminContrato || userRole === 'operador' || userRole === 'administrativo')}
                    isAdmin={isAdmin}
                    glowColor="from-cyan-500/20 to-blue-600/20"
                    buttonClass="from-cyan-600 to-blue-600"
                    buttonLabel="Abrir WorkFleet-M"
                    badgeClass="bg-cyan-500/10 text-cyan-400 border border-cyan-500/20"
                    badgeLabel="Operadores"
                    logoSrc="/wf-logo.svg"
                    logoAlt="WorkFleet Mobile"
                    logoClass="h-[60%] w-auto"
                    features={[
                      { text: "Registro rápido de horómetros" },
                      { text: "Reporte de cargas de combustible" },
                      { text: "Funcionamiento 100% offline sin señal" },
                      { text: "Sincronización invisible al conectar" },
                    ]}
                    onUpgrade={() => {
                      if (isSuperAdmin) { navigate('/admin'); }
                      else if (isAdminContrato) { navigate('/admin?tab=mi_plan'); }
                    }}
                  />

                  <AppCard
                    onClick={() => { window.location.href = '/trabajador'; }}
                    canAccess={true}
                    blockReason={null}
                    isAdmin={isAdmin}
                    glowColor="from-emerald-500/20 to-teal-600/20"
                    buttonClass="from-emerald-600 to-teal-600"
                    buttonLabel="Abrir Portal"
                    badgeClass="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                    badgeLabel="Trabajadores"
                    logoSrc="/logo-fleetcore-r.png"
                    logoAlt="Portal Trabajadores"
                    features={[
                      { text: "Descarga de liquidaciones de sueldo" },
                      { text: "Revisión y firma digital de contratos" },
                      { text: "Control de asistencia y vacaciones" },
                      { text: "Solicitud y descarga de certificados" },
                    ]}
                    onUpgrade={() => { }}
                  />
                </div>
              </div>

            </div>
          )}

          <div className="mt-12 text-center text-slate-600 text-[10px] sm:text-xs border-t border-white/5 pt-6">
            <p>Puedes cambiar de aplicación en cualquier momento desde el menú de usuario de la esquina superior derecha</p>
          </div>
        </div>
      </div>
    </>
  );
}

// ── AppCard con lógica de bloqueo por plan y diseño premium compacto ─────────────────────

function AppCard({ onClick, canAccess, blockReason, isAdmin, glowColor, buttonClass,
  buttonLabel, badgeClass, badgeLabel, logoSrc, logoAlt, features, onUpgrade, logoClass }) {

  return (
    <div
      onClick={canAccess ? onClick : undefined}
      className={`group relative ${canAccess ? 'cursor-pointer' : 'cursor-not-allowed'} h-full transition-all duration-300`}
    >
      {/* Glow en hover */}
      <div className={`absolute inset-[-1.5px] bg-gradient-to-br ${glowColor} rounded-[22px] opacity-0 ${canAccess ? 'group-hover:opacity-100' : ''} blur-md transition-all duration-500 -z-10`} />

      {/* Brillo interior */}
      <div className={`absolute inset-0 bg-gradient-to-br ${glowColor} rounded-2xl opacity-[0.03] group-hover:opacity-[0.08] transition-opacity -z-10`} />

      <div className={`relative bg-slate-900/30 backdrop-blur-md rounded-2xl p-5 sm:p-6 h-full shadow-2xl border transition-all duration-500 flex flex-col justify-between ${canAccess ? 'border-white/5 group-hover:border-white/10 group-hover:bg-slate-900/60 group-hover:-translate-y-1 group-hover:shadow-[0_15px_30px_-10px_rgba(0,0,0,0.8)]' : 'border-white/5 opacity-55'}`}>

        {/* Overlay de bloqueo */}
        {!canAccess && (
          <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-[3px] rounded-2xl flex items-center justify-center z-20 px-5">
            <div className="text-center w-full max-w-[240px]">
              {blockReason === 'plan' ? (
                <>
                  <div className={`w-10 h-10 mx-auto mb-3 rounded-xl bg-gradient-to-br ${glowColor} flex items-center justify-center shadow-lg shadow-black/40`}>
                    <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                    </svg>
                  </div>
                  <div className="text-sm font-extrabold text-white mb-1 tracking-wide">Módulo no contratado</div>
                  <div className="text-[11px] text-slate-400 mb-3 leading-relaxed">
                    {isAdmin
                      ? "Activa este módulo desde tu panel de administración"
                      : "Contacta al administrador para activar este módulo"}
                  </div>
                  {isAdmin && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onUpgrade(); }}
                      className="w-full py-2 bg-white text-slate-950 hover:bg-slate-100 text-xs font-black rounded-lg transition-all shadow-md active:scale-95"
                    >
                      Contratar módulo →
                    </button>
                  )}
                </>
              ) : (
                <>
                  <div className="w-10 h-10 mx-auto mb-3 rounded-xl bg-slate-800 flex items-center justify-center shadow-lg shadow-black/40">
                    <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </div>
                  <div className="text-sm font-extrabold text-slate-200 tracking-wide">Acceso Restringido</div>
                  <div className="text-[11px] text-slate-400 mt-1 leading-relaxed">Tu cuenta no cuenta con permisos para ingresar</div>
                </>
              )}
            </div>
          </div>
        )}

        <div className="flex flex-col h-full justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${badgeClass}`}>
                <span className="w-1 h-1 rounded-full bg-current animate-pulse" />
                {badgeLabel}
              </span>
            </div>

            <div className="h-28 w-full flex items-center justify-center mb-4 bg-white/90 rounded-xl border border-white/20 shadow-md backdrop-blur-sm transition-all p-1">
              <img
                src={logoSrc}
                alt={logoAlt}
                className={`${logoClass || 'h-[85%] w-auto max-w-[92%]'} object-contain filter drop-shadow-[0_2px_8px_rgba(0,0,0,0.12)] transition-transform duration-500 group-hover:scale-105`}
              />
            </div>

            <ul className="space-y-2 mb-6">
              {features.map((f, i) => (
                <li key={i} className="flex items-start gap-2 text-slate-400">
                  <span className="text-emerald-400/90 mt-0.5 flex-shrink-0">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  </span>
                  <span className="text-xs font-medium leading-tight text-slate-300 group-hover:text-slate-100 transition-colors">
                    {f.text}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <button className={`w-full py-2.5 bg-gradient-to-r ${buttonClass} text-white font-bold rounded-lg shadow-lg hover:shadow-xl hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-1.5`}>
            <span className="text-xs tracking-wide font-black">{buttonLabel}</span>
            <svg className="w-3.5 h-3.5 transition-transform duration-300 group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </button>
        </div>

      </div>
    </div>
  );
}
