import React, { useEffect, useState } from "react";
import { Routes, Route, NavLink, useNavigate, Navigate, useLocation } from "react-router-dom";

// ── Oficina Técnica pages ─────────────────────────────────────
import Dashboard from "./pages/oficina-tecnica/Dashboard";
import Machines from "./pages/oficina-tecnica/Machines";
import Logs from "./pages/oficina-tecnica/Logs";
import MonthlyCalendar from "./pages/oficina-tecnica/MonthlyCalendar";
import Fuel from "./pages/oficina-tecnica/Fuel";
import Payroll from "./pages/oficina-tecnica/Payroll";
import PaymentStatus from "./pages/oficina-tecnica/PaymentStatus";
import FuelPriceManager from "./pages/oficina-tecnica/FuelPriceManager";
import OC from "./pages/oficina-tecnica/OC";
import Consolidado from "./pages/oficina-tecnica/Consolidado";
import Rendiciones from "./pages/oficina-tecnica/Rendiciones";
import Subcontratos from "./pages/oficina-tecnica/Subcontratos";
import Pasajes from "./pages/oficina-tecnica/Pasajes";
import Combustible from "./pages/oficina-tecnica/Combustible";
import ReportDetallado from "./pages/reportes/ReportDetallado";
import ReporteWorkFleet from "./pages/reportes/ReporteWorkFleet";
import ReporteCombustible from "./pages/reportes/ReporteCombustible";
import AdminPanel from "./pages/reportes/AdminPanel";
import SuperAdminPanel from "./pages/SuperAdminPanel";
import RRHH from "./pages/rrhh";

// ── App shells ────────────────────────────────────────────────
import ReportesShell from "./pages/reportes/ReportesShell";
import MaquinariaShell from "./pages/maquinaria/MaquinariaShell";
import RRHHShell from "./pages/rrhh/RRHHShell";
import AppShellLayout from "./components/AppShellLayout";
import OperadoresApp from "./pages/operadores";
import FinanzasApp from "./pages/finanzas/FinanzasApp.jsx";
import ContabilidadApp from "./pages/contabilidad/ContabilidadApp.jsx";
import DocumentosApp from "./pages/documentos/DocumentosApp.jsx";

// ── Auth / onboarding pages ───────────────────────────────────
import LandingPage from "./pages/LandingPage.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import RegisterPage from "./pages/RegisterPage.jsx";
import AppSelector from "./pages/AppSelector.jsx";
import TrabajadorApp from "./pages/TrabajadorApp.jsx";
import PricingPage from "./pages/PricingPage.jsx";
import PaymentResult from "./pages/PaymentResult.jsx";
import EmpresaSetup from "./pages/EmpresaSetup.jsx";
import InviteAccept from "./pages/InviteAccept.jsx";
import Capacitacion from "./pages/Capacitacion.jsx";

// ── Misc components ───────────────────────────────────────────
import CombustibleModal from "./pages/combustible/CombustibleModal";
import ConnectionStatus from "./components/ConnectionStatus";
import InstallPWA from "./components/InstallPWA";
import SessionExpiryIndicator from "./components/SessionExpiryIndicator";

// ── Firebase ──────────────────────────────────────────────────
import { auth, googleProvider, db } from "./lib/firebase";
import { EmpresaProvider, useEmpresa } from "./lib/useEmpresa";
import { signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, onSnapshot, updateDoc, serverTimestamp } from "firebase/firestore";
import { usePlan } from "./hooks/usePlan.js";
import { getPlanTier } from "./lib/plans.js";

// ============================================================
// Shell principal (Oficina Técnica / FleetCore)
// ============================================================
function Shell({ user, userRole, onLogout, selectedApp, onBackToSelector, onGoToPricing }) {
  const navigate = useNavigate();
  const canGoToAdmin = ['superadmin', 'admin_contrato'].includes(userRole);
  const handleAdminPanel = canGoToAdmin ? () => { localStorage.setItem('selectedApp', 'admin'); navigate('/admin'); } : undefined;
  const handleAdminEmpresaPanel = canGoToAdmin ? () => { localStorage.setItem('selectedApp', 'admin'); navigate('/admin/empresa'); } : undefined;
  const esMandante = userRole === 'mandante';

  // Los iconos son el `d` de un path; el shell acepta también nodos JSX.
  const IC = {
    dashboard:   'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6',
    registro:    'M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z',
    equipos:     'M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
    flota:       'M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z',
    estadoPago:  'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01',
    combustible: 'M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z',
    tarjeta:     'M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z',
    subcontrato: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z',
    oc:          'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
    precio:      'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V6m0 2v8m0 0v2m0-2c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
    reporte:     'M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
  };

  // El mandante solo ve el reporte de equipos: los desplegables de Control de
  // Producción y Combustible estaban ocultos para él de todas formas, y un
  // menú lleno de destinos bloqueados no aporta nada.
  const navGroups = esMandante
    ? [{ label: '', tabs: [{ id: 'reporte-workfleet', label: 'Equipos y Servicios', icon: IC.equipos }] }]
    : [
        { label: '', tabs: [
          { id: '',                  label: 'Dashboard', icon: IC.dashboard },
          { id: 'reporte-detallado', label: 'Reporte Detallado', icon: IC.reporte },
        ]},
        { label: 'Control de Producción y EP', tabs: [
          { id: 'payroll',              label: 'Registro Diario',     icon: IC.registro },
          { id: 'reporte-workfleet',    label: 'Equipos y Servicios', icon: IC.equipos },
          { id: 'consolidado',          label: 'Detalle Flota',       icon: IC.flota },
          { id: 'payment-status',       label: 'Estado de Pago',      icon: IC.estadoPago },
          { id: 'combustible-detalle',  label: 'Combustible (4.1)',   icon: IC.combustible },
          { id: 'rendiciones',          label: 'Rendiciones',         icon: IC.tarjeta },
          { id: 'pasajes',              label: 'Pasajes',             icon: IC.tarjeta },
          { id: 'subcontratos',         label: 'Subcontratos',        icon: IC.subcontrato },
          { id: 'oc',                   label: 'Órdenes de Compra',   icon: IC.oc },
        ]},
        { label: 'Combustible', tabs: [
          { id: 'fuel',       label: 'Recargas', icon: IC.combustible },
          { id: 'fuel-price', label: 'Precios',  icon: IC.precio },
        ]},
      ];

  return (
    <AppShellLayout
      navGroups={navGroups}
      basePath="/fleetcore"
      marca={{
        titulo: 'Fleet', resalte: 'Core', subtitulo: 'Oficina Técnica',
        gradiente: 'linear-gradient(135deg,#2563eb,#1d4ed8)',
        iconoPath: IC.flota,
      }}
      user={user} userRole={userRole} onLogout={onLogout}
      onBackToSelector={onBackToSelector}
      onGoToPricing={onGoToPricing}
      onAdminPanel={handleAdminPanel}
      onAdminEmpresaPanel={handleAdminEmpresaPanel}
    >
      <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-[1500px] mx-auto">
        <Routes>
          <Route path="/reporte-workfleet" element={<ReporteWorkFleet />} />
          {!esMandante ? (
            <>
              <Route path="/" element={<Dashboard />} />
              <Route path="/logs" element={<Logs />} />
              <Route path="/calendar" element={<MonthlyCalendar />} />
              <Route path="/fuel" element={<Fuel />} />
              <Route path="/payroll" element={<Payroll />} />
              <Route path="/oc" element={<OC />} />
              <Route path="/consolidado" element={<Consolidado />} />
              <Route path="/machines" element={<Machines />} />
              <Route path="/rendiciones" element={<Rendiciones />} />
              <Route path="/combustible-detalle" element={<Combustible />} />
              <Route path="/pasajes" element={<Pasajes />} />
              <Route path="/reporte-combustible" element={<ReporteCombustible />} />
              <Route path="/payment-status" element={<PaymentStatus />} />
              <Route path="/fuel-price" element={<FuelPriceManager />} />
              <Route path="/subcontratos" element={<Subcontratos />} />
              <Route path="/reporte-detallado" element={<ReportDetallado />} />
              {['superadmin', 'admin_contrato', 'administrativo'].includes(userRole) && <Route path="/admin" element={<AdminPanel onClose={() => navigate('/fleetcore')} />} />}
              {['superadmin'].includes(userRole) && <Route path="/rrhh" element={<RRHH />} />}
            </>
          ) : (
            <Route path="*" element={<Navigate to="/reporte-workfleet" replace />} />
          )}
        </Routes>
      </div>
    </AppShellLayout>
  );
}

// ============================================================
// PWAWrapper — envuelve cada shell con providers y componentes PWA
// ============================================================
function PWAWrapper({ user, children }) {
  return (
    <EmpresaProvider user={user}>
      <ConnectionStatus />
      <InstallPWA />
      <SessionExpiryIndicator />
      {children}
    </EmpresaProvider>
  );
}

// ============================================================
// Mapa declarativo de apps
// ============================================================
const APP_MAP = {
  workfleet: OperadoresApp,
  'workfleet-m': OperadoresApp,
  rrhh: RRHHShell,
  reportes: ReportesShell,
  finanzas: FinanzasApp,
  contabilidad: ContabilidadApp,
  documentos: DocumentosApp,
};

// ============================================================
// App root
// ============================================================
export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [postInvite, setPostInvite] = useState(false);
  const [userRole, setUserRole] = useState('operador');
  const [userModulos, setUserModulos] = useState([]);
  const [userCargo, setUserCargo] = useState('');
  const [userEsSurtidor, setUserEsSurtidor] = useState(false);
  const [capacitacionAprobada, setCapacitacionAprobada] = useState(false);

  const { canAccess, loading: planLoading, subscription } = usePlan();
  const navigate = useNavigate();
  const location = useLocation();

  const isTrabajadorRoute = location.pathname.startsWith('/trabajador');
  const inviteMatch = !postInvite && location.pathname.match(/^\/invite\/([a-zA-Z0-9]+)$/);
  const inviteToken = inviteMatch ? inviteMatch[1] : null;

  useEffect(() => {
    if (isTrabajadorRoute || inviteToken) {
      setLoading(false);
      return;
    }

    let unsubUserDoc = null;

    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);

      const checkAndAutoApprove = (data) => {
        const role = data.role || 'operador';
        const modulos = data.modulos || [];
        const cargo = data.cargo || '';
        const esSurtidor = data.esSurtidor || false;

        const isAdminExempt = ['superadmin', 'admin_contrato', 'admin'].includes(role);
        const isFuelUser = !isAdminExempt && (
                           (role === 'administrativo' && modulos.includes('reportes')) ||
                           (role === 'operador' && (esSurtidor || ['surtidor', 'solo_combustible'].includes(cargo)))
                         );

        if (isFuelUser && !data.capacitacionAprobada) {
          const userRef = doc(db, 'users', currentUser.uid);
          updateDoc(userRef, {
            capacitacionAprobada: true,
            capacitacionFecha: serverTimestamp()
          }).catch(err => console.error("Error auto-approving user training:", err));

          if (data.empresaId) {
            const empresaUserRef = doc(db, 'empresas', data.empresaId, 'users', currentUser.uid);
            updateDoc(empresaUserRef, {
              capacitacionAprobada: true,
              capacitacionFecha: serverTimestamp()
            }).catch(err => console.warn("Error auto-approving company user training:", err));
          }
        }
      };

      if (unsubUserDoc) {
        unsubUserDoc();
        unsubUserDoc = null;
      }

      if (currentUser) {
        // Escuchar el documento del usuario en tiempo real para reaccionar al registro inmediato
        unsubUserDoc = onSnapshot(doc(db, 'users', currentUser.uid), (snap) => {
          if (snap.exists()) {
            const data = snap.data();
            if (data.deleted) {
              signOut(auth);
              return;
            }
            setUserRole(data.role || 'operador');
            setUserModulos(data.modulos || []);
            setUserCargo(data.cargo || '');
            setUserEsSurtidor(data.esSurtidor || false);
            setCapacitacionAprobada(data.capacitacionAprobada || false);
            checkAndAutoApprove(data);
            if (data.empresaId) {
              setNeedsSetup(false);
            } else {
              setNeedsSetup(true);
            }
          } else {
            setUserRole('operador');
            setUserModulos([]);
            setUserCargo('');
            setUserEsSurtidor(false);
            setCapacitacionAprobada(false);
            setNeedsSetup(true);
          }
          setLoading(false);
        }, (err) => {
          console.error("Error listening to user document:", err);
          // permission-denied: reglas no desplegadas o en caché stale.
          // Hacer un getDoc puntual para decidir si realmente falta setup.
          if (err.code === 'permission-denied') {
            getDoc(doc(db, 'users', currentUser.uid)).then(snap => {
              if (snap.exists()) {
                const data = snap.data();
                setUserRole(data.role || 'operador');
                setUserModulos(data.modulos || []);
                setUserCargo(data.cargo || '');
                setUserEsSurtidor(data.esSurtidor || false);
                setCapacitacionAprobada(data.capacitacionAprobada || false);
                checkAndAutoApprove(data);
                setNeedsSetup(!data.empresaId);
              } else {
                setNeedsSetup(true);
              }
              setLoading(false);
            }).catch(() => {
              // Sin acceso real — mantener loading=false sin cambiar needsSetup
              setLoading(false);
            });
            return;
          }
          setUserRole('operador');
          setUserModulos([]);
          setUserCargo('');
          setUserEsSurtidor(false);
          setCapacitacionAprobada(false);
          setNeedsSetup(true);
          setLoading(false);
        });
      } else {
        setUserRole('operador');
        setUserModulos([]);
        setUserCargo('');
        setCapacitacionAprobada(false);
        setNeedsSetup(false);
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubUserDoc) unsubUserDoc();
    };
  }, [isTrabajadorRoute, inviteToken]);

  // ── Gating de Módulos / Acceso en App.jsx por URL ───────────────────
  useEffect(() => {
    if (loading || !user) return;

    const path = location.pathname;
    const match = path.match(/^\/([^\/]+)/);
    if (!match) return;
    const appName = match[1];

    // Ignorar si no es una app/modulo que requiere gating
    const gatedApps = ['fleetcore', 'workfleet', 'workfleet-m', 'rrhh', 'reportes', 'finanzas', 'contabilidad', 'documentos', 'maquinaria', 'admin'];
    if (!gatedApps.includes(appName)) return;

    const isSuperAdmin = userRole === 'superadmin';
    const isAdminContrato = userRole === 'admin_contrato';
    const isRevisorAdmin = userRole === 'revisor_admin';
    const isRevisor = userRole === 'revisor';
    const isMandanteAdmin = userRole === 'mandante_admin';
    const isMandante = userRole === 'mandante';
    const isRevisorRole = isRevisorAdmin || isRevisor || isMandanteAdmin || isMandante;
    const hasModulo = (m) => isSuperAdmin || (userModulos && userModulos.includes(m));

    let allowed = false;

    if (appName === 'fleetcore') {
      allowed = isSuperAdmin || (isAdminContrato && canAccess('fleetcore')) || ((['administrativo', 'operador'].includes(userRole) && hasModulo('fleetcore')) && canAccess('fleetcore'));
    } else if (appName === 'workfleet' || appName === 'workfleet-m') {
      allowed = isSuperAdmin || userRole === 'operador' || (isAdminContrato && canAccess('workfleet')) || (['administrativo', 'operador'].includes(userRole) && hasModulo('workfleet') && canAccess('workfleet'));
    } else if (appName === 'rrhh') {
      allowed = isSuperAdmin || (isAdminContrato && canAccess('rrhh')) || ((['administrativo', 'operador'].includes(userRole) && hasModulo('rrhh')) && canAccess('rrhh'));
    } else if (appName === 'reportes') {
      allowed = isSuperAdmin || (isAdminContrato && canAccess('reportes')) || ((['administrativo', 'operador'].includes(userRole) && hasModulo('reportes')) && canAccess('reportes'));
    } else if (appName === 'maquinaria') {
      // jefe_taller y mecanico existen específicamente para este módulo:
      // sin ellos acá, un mecánico quedaría fuera de sus propias OT.
      allowed = isSuperAdmin
        || (isAdminContrato && canAccess('maquinaria'))
        || (['administrativo', 'jefe_taller', 'mecanico'].includes(userRole)
            && hasModulo('maquinaria') && canAccess('maquinaria'));
    } else if (appName === 'finanzas') {
      allowed = isSuperAdmin || (isAdminContrato && canAccess('finanzas')) || ((['administrativo', 'operador'].includes(userRole) && hasModulo('finanzas')) && canAccess('finanzas'));
    } else if (appName === 'contabilidad') {
      allowed = isSuperAdmin || (isAdminContrato && canAccess('contabilidad')) || ((['administrativo', 'operador'].includes(userRole) && hasModulo('contabilidad')) && canAccess('contabilidad'));
    } else if (appName === 'documentos') {
      allowed = isSuperAdmin || (isAdminContrato && canAccess('fleetcore')) || isRevisorRole || ((['administrativo', 'operador'].includes(userRole) && hasModulo('fleetcore')) && canAccess('fleetcore'));
    } else if (appName === 'admin') {
      allowed = isSuperAdmin || isAdminContrato || userRole === 'administrativo';
    }

    if (!allowed && !planLoading) {
      console.warn(`Acceso denegado a módulo: ${appName}. Redirigiendo a selector.`);
      navigate('/');
    }
  }, [location.pathname, userRole, userModulos, subscription, loading, planLoading, user, canAccess, navigate]);

  const handleInviteAccepted = () => {
    window.history.pushState({}, '', '/');
    setUser(auth.currentUser);
    setPostInvite(true);
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      localStorage.removeItem('selectedApp');
      navigate('/');
    } catch (err) {
      console.error("Error en logout:", err);
    }
  };

  const handleBackToSelector = () => {
    localStorage.removeItem('selectedApp');
    navigate('/');
  };

  const handleGoToAdminPanel = () => {
    localStorage.setItem('selectedApp', 'admin');
    navigate('/admin');
  };

  const handleGoToAdminEmpresaPanel = () => {
    localStorage.setItem('selectedApp', 'admin');
    navigate('/admin/empresa');
  };

  const handleGoToPricing = () => {
    localStorage.setItem('selectedApp', 'admin');
    if (userRole === 'superadmin') {
      navigate('/admin');
    } else if (userRole === 'admin_contrato') {
      navigate('/admin?tab=mi_plan');
    } else {
      localStorage.setItem('selectedApp', 'pricing');
      navigate('/pricing');
    }
  };

  const handleSelectApp = (app) => {
    localStorage.setItem('selectedApp', app);
    navigate(`/${app}`);
  };

  // ── Rutas especiales (sin auth) ───────────────────────────
  if (isTrabajadorRoute) return <TrabajadorApp />;
  if (inviteToken) return <InviteAccept token={inviteToken} onAccepted={handleInviteAccepted} />;

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-900 to-slate-900 flex items-center justify-center p-4">
        <div className="text-center">
          <div className="mb-4 flex justify-center animate-pulse">
            <img src="/favicon.svg" alt="Fleet Core" className="h-20 sm:h-24 w-auto object-contain" />
          </div>
          <div className="text-sm sm:text-base font-bold text-white mt-2">Fleet<span className="text-blue-300">Core</span></div>
          <div className="text-xs text-blue-200 mt-1">Cargando...</div>
        </div>
      </div>
    );
  }

  // ── Gating de Capacitación Obligatoria (Bypassed) ─────────────────────
  const needsTraining = false;

  return (
    <Routes>
      {!user ? (
        <>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/payment-result" element={<PaymentResult onBack={() => window.location.href = '/'} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </>
      ) : (
        <>
          {needsSetup ? (
            <Route path="*" element={
              <EmpresaSetup
                user={user}
                onComplete={() => { setNeedsSetup(false); window.location.reload(); }}
                onLogout={handleLogout}
              />
            } />
          ) : (
            <>
              <Route path="/" element={
                <EmpresaProvider user={user}>
                  <AppSelector
                    user={user}
                    userRole={userRole}
                    onLogout={handleLogout}
                    onSelectApp={handleSelectApp}
                  />
                </EmpresaProvider>
              } />

              <Route path="/pricing" element={
                <PricingPage
                  onBack={() => navigate('/')}
                />
              } />

              <Route path="/admin/empresa" element={
                <PWAWrapper user={user}>
                  {['superadmin', 'admin_contrato', 'administrativo'].includes(userRole) ? (
                    <AdminPanel onClose={() => navigate('/')} />
                  ) : (
                    <Navigate to="/" replace />
                  )}
                </PWAWrapper>
              } />

              <Route path="/admin" element={
                <PWAWrapper user={user}>
                  {userRole === 'superadmin' ? (
                    <SuperAdminPanel onClose={() => navigate('/')} />
                  ) : ['admin_contrato', 'administrativo'].includes(userRole) ? (
                    <AdminPanel onClose={() => navigate('/')} />
                  ) : (
                    <Navigate to="/" replace />
                  )}
                </PWAWrapper>
              } />

              <Route path="/payment-result" element={
                <PaymentResult onBack={handleBackToSelector} />
              } />

              <Route path="/fleetcore/*" element={
                <PWAWrapper user={user}>
                  <Shell
                    user={user}
                    userRole={userRole}
                    onLogout={handleLogout}
                    selectedApp="fleetcore"
                    onBackToSelector={handleBackToSelector}
                    onGoToPricing={handleGoToPricing}
                  />
                </PWAWrapper>
              } />

              <Route path="/workfleet/*" element={
                <PWAWrapper user={user}>
                  <OperadoresApp
                    user={user}
                    userRole={userRole}
                    onLogout={handleLogout}
                    onBackToSelector={handleBackToSelector}
                  onAdminPanel={handleGoToAdminPanel}
                  onAdminEmpresaPanel={handleGoToAdminEmpresaPanel}
                  />
                </PWAWrapper>
              } />

              <Route path="/workfleet-m/*" element={
                <PWAWrapper user={user}>
                  <OperadoresApp
                    user={user}
                    userRole={userRole}
                    onLogout={handleLogout}
                    onBackToSelector={handleBackToSelector}
                  onAdminPanel={handleGoToAdminPanel}
                  onAdminEmpresaPanel={handleGoToAdminEmpresaPanel}
                  />
                </PWAWrapper>
              } />

              <Route path="/rrhh/*" element={
                <PWAWrapper user={user}>
                  <RRHHShell
                    user={user}
                    userRole={userRole}
                    onLogout={handleLogout}
                    onBackToSelector={handleBackToSelector}
                  onAdminPanel={handleGoToAdminPanel}
                  onAdminEmpresaPanel={handleGoToAdminEmpresaPanel}
                  />
                </PWAWrapper>
              } />

              <Route path="/reportes/*" element={
                <PWAWrapper user={user}>
                  <ReportesShell
                    user={user}
                    userRole={userRole}
                    onLogout={handleLogout}
                    onBackToSelector={handleBackToSelector}
                  onAdminPanel={handleGoToAdminPanel}
                  onAdminEmpresaPanel={handleGoToAdminEmpresaPanel}
                  />
                </PWAWrapper>
              } />

              <Route path="/maquinaria/*" element={
                <PWAWrapper user={user}>
                  <MaquinariaShell
                    user={user}
                    userRole={userRole}
                    onLogout={handleLogout}
                    onBackToSelector={handleBackToSelector}
                    onAdminPanel={handleGoToAdminPanel}
                    onAdminEmpresaPanel={handleGoToAdminEmpresaPanel}
                  />
                </PWAWrapper>
              } />

              <Route path="/finanzas/*" element={
                <PWAWrapper user={user}>
                  <FinanzasApp
                    user={user}
                    userRole={userRole}
                    onLogout={handleLogout}
                    onBackToSelector={handleBackToSelector}
                  onAdminPanel={handleGoToAdminPanel}
                  onAdminEmpresaPanel={handleGoToAdminEmpresaPanel}
                  />
                </PWAWrapper>
              } />

              <Route path="/contabilidad/*" element={
                <PWAWrapper user={user}>
                  <ContabilidadApp
                    user={user}
                    userRole={userRole}
                    onLogout={handleLogout}
                    onBackToSelector={handleBackToSelector}
                  onAdminPanel={handleGoToAdminPanel}
                  onAdminEmpresaPanel={handleGoToAdminEmpresaPanel}
                  />
                </PWAWrapper>
              } />

              <Route path="/documentos/*" element={
                <PWAWrapper user={user}>
                  <DocumentosApp
                    user={user}
                    userRole={userRole}
                    onLogout={handleLogout}
                    onBackToSelector={handleBackToSelector}
                  />
                </PWAWrapper>
              } />

              <Route path="*" element={<Navigate to="/" replace />} />
            </>
          )}
        </>
      )}
    </Routes>
  );
}
