import React, { useState, useEffect } from 'react';
import { db } from '../../lib/firebase';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { DashboardSection, TrabajadoresSection, ContratosSection,
  RemuneracionesSection, FiniquitosSection, PortalTrabajadoresPanel } from './sections.a';
import { AnexosSection, ImpuestosSection, AsistenciaSection,
  OrganizacionSection, ReportesSection, ContabilidadSection,
  PreviredAvanzadoSection, ArchivoPagoSection } from './sections.b';

const NAV_GROUPS = [
  {
    label: 'Gestión',
    tabs: [
      { id:'dashboard',         label:'Dashboard',        icon:'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
      { id:'organizacion',      label:'Organización',     icon:'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10' },
      { id:'trabajadores',      label:'Trabajadores',     icon:'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z' },
      { id:'portal',            label:'Portal',           icon:'M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14' },
      { id:'contratos',         label:'Contratos',        icon:'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
      { id:'anexos',            label:'Anexos',           icon:'M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13' },
    ],
  },
  {
    label: 'Remuneraciones',
    tabs: [
      { id:'remuneraciones',    label:'Remuneraciones',   icon:'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
      { id:'finiquitos',        label:'Finiquitos',       icon:'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4' },
      { id:'asistencia',        label:'Asistencia',       icon:'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
    ],
  },
  {
    label: 'Obligaciones',
    tabs: [
      { id:'previred_avanzado', label:'Previred Avanzado', icon:'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z' },
      { id:'archivo_pago',      label:'Archivo de Pago',  icon:'M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4' },
      { id:'impuestos',         label:'Impuestos',        icon:'M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z' },
    ],
  },
  {
    label: 'Análisis',
    tabs: [
      { id:'reportes',          label:'Reportes',         icon:'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
      { id:'contabilidad',      label:'Contabilidad',     icon:'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253' },
    ],
  },
];

export default function RRHH() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [trabajadores, setTrabajadores] = useState([]);

  useEffect(() => {
    if (activeTab !== 'portal') return;
    getDocs(query(collection(db, 'trabajadores'), orderBy('apellidoPaterno')))
      .then(snap => setTrabajadores(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
      .catch(() => {});
  }, [activeTab]);

  return (
    <div className="flex" style={{ background: '#f0f2f7', minHeight: 'calc(100vh - 61px)' }}>

      {/* ── Sidebar ── */}
      <aside
        className="hidden md:flex flex-col w-56 flex-shrink-0 border-r border-slate-700/50 overflow-y-auto"
        style={{ background: '#1e293b', position: 'sticky', top: 61, height: 'calc(100vh - 61px)' }}
      >
        {/* Branding */}
        <div className="px-4 py-4 border-b border-slate-700/50">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'linear-gradient(135deg,#7c3aed,#4f46e5)' }}>
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-black text-white leading-tight">Recursos Humanos</p>
              <span className="text-[9px] font-black tracking-widest uppercase"
                style={{ color: '#a78bfa' }}>PRO</span>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="p-3 space-y-5 py-5">
          {NAV_GROUPS.map(group => (
            <div key={group.label}>
              <p className="text-[10px] font-black uppercase tracking-widest px-2 mb-1.5"
                style={{ color: '#64748b' }}>
                {group.label}
              </p>
              <div className="space-y-0.5">
                {group.tabs.map(tab => {
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all text-left ${
                        isActive
                          ? 'text-white shadow-lg'
                          : 'text-slate-400 hover:text-white hover:bg-white/10'
                      }`}
                      style={isActive ? { background: 'linear-gradient(135deg,#7c3aed,#4f46e5)' } : {}}
                    >
                      <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d={tab.icon} />
                      </svg>
                      <span className="truncate">{tab.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </aside>

      {/* ── Main content ── */}
      <main className="flex-1 min-w-0 overflow-auto">

        {/* Banner */}
        <div className="relative overflow-hidden"
          style={{ background: 'linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)' }}>
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute -top-20 -right-20 w-96 h-96 rounded-full opacity-10"
              style={{ background: 'radial-gradient(circle, #a78bfa 0%, transparent 70%)' }} />
            <div className="absolute -bottom-16 -left-16 w-72 h-72 rounded-full opacity-10"
              style={{ background: 'radial-gradient(circle, #60a5fa 0%, transparent 70%)' }} />
            <div className="absolute top-0 left-0 right-0 h-px opacity-20"
              style={{ background: 'linear-gradient(to right, transparent, #a78bfa, transparent)' }} />
            <svg className="absolute right-0 top-0 h-full opacity-5" viewBox="0 0 400 120" preserveAspectRatio="xMaxYMid slice">
              <circle cx="320" cy="60" r="120" fill="none" stroke="white" strokeWidth="1"/>
              <circle cx="320" cy="60" r="80" fill="none" stroke="white" strokeWidth="0.5"/>
              <circle cx="320" cy="60" r="40" fill="none" stroke="white" strokeWidth="0.5"/>
              <line x1="200" y1="60" x2="440" y2="60" stroke="white" strokeWidth="0.5"/>
              <line x1="320" y1="-60" x2="320" y2="180" stroke="white" strokeWidth="0.5"/>
            </svg>
          </div>
          <div className="relative px-7 py-5 flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-black tracking-tight" style={{ color: '#f0f0ff', letterSpacing: '-0.02em' }}>
                {NAV_GROUPS.flatMap(g => g.tabs).find(t => t.id === activeTab)?.label || 'Recursos Humanos'}
              </h1>
              <p className="text-sm mt-0.5 font-medium" style={{ color: 'rgba(196,181,253,0.7)' }}>
                Código del Trabajo · Previred · SII · Art. 42 LIR
              </p>
            </div>
            <div className="hidden sm:flex items-center gap-2">
              {['CT','DT','SII','AFP'].map(badge => (
                <span key={badge} className="text-[10px] font-black px-2 py-1 rounded-lg tracking-widest"
                  style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.4)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  {badge}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="px-4 sm:px-6 py-6">
          {activeTab === 'dashboard'          && <DashboardSection />}
          {activeTab === 'trabajadores'       && <TrabajadoresSection />}
          {activeTab === 'contratos'          && <ContratosSection />}
          {activeTab === 'anexos'             && <AnexosSection />}
          {activeTab === 'remuneraciones'     && <RemuneracionesSection />}
          {activeTab === 'impuestos'          && <ImpuestosSection />}
          {activeTab === 'previred_avanzado'  && <PreviredAvanzadoSection />}
          {activeTab === 'archivo_pago'       && <ArchivoPagoSection />}
          {activeTab === 'asistencia'         && <AsistenciaSection />}
          {activeTab === 'organizacion'       && <OrganizacionSection />}
          {activeTab === 'reportes'           && <ReportesSection />}
          {activeTab === 'contabilidad'       && <ContabilidadSection />}
          {activeTab === 'finiquitos'         && <FiniquitosSection />}
          {activeTab === 'portal'             && <PortalTrabajadoresPanel trabajadores={trabajadores} />}
          <div className="pb-10" />
        </div>

      </main>
    </div>
  );
}
