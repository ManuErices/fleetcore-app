import { useState, useEffect, useCallback, useRef } from 'react';
import { db } from '../lib/firebase';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, orderBy, serverTimestamp } from 'firebase/firestore';
import * as Shared from './RRHH.shared';
import { DashboardSection, TrabajadoresSection, ContratosSection,
  RemuneracionesSection, FiniquitosSection, PortalTrabajadoresPanel } from './RRHH.sections.a';
import { AnexosSection, ImpuestosSection, AsistenciaSection,
  OrganizacionSection, ReportesSection, ContabilidadSection } from './RRHH.sections.b';

const PAGE_TABS = [
  { id:'dashboard',      label:'Dashboard',      ready:true, icon:'📊' },
  { id:'trabajadores',   label:'Trabajadores',   ready:true  },
  { id:'contratos',      label:'Contratos',       ready:true  },
  { id:'anexos',         label:'Anexos',          ready:true  },
  { id:'remuneraciones', label:'Remuneraciones',  ready:true  },
  { id:'impuestos',      label:'Impuestos',       ready:true  },
  { id:'asistencia',     label:'Asistencia',      ready:true  },
  { id:'organizacion',   label:'Organización',    ready:true  },
  { id:'reportes',       label:'Reportes',        ready:true  },
  { id:'contabilidad',   label:'Contabilidad',    ready:true  },
  { id:'finiquitos',     label:'Finiquitos',      ready:true  },
  { id:'portal',         label:'Portal',          ready:true  },
];

export default function RRHH() {
  const [activeTab,    setActiveTab]    = useState('dashboard');
  const [trabajadores, setTrabajadores] = useState([]);

  // Cargar trabajadores para el panel Portal
  useEffect(() => {
    if (activeTab !== 'portal') return;
    getDocs(query(collection(db, 'trabajadores'), orderBy('apellidoPaterno')))
      .then(snap => setTrabajadores(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
      .catch(() => {});
  }, [activeTab]);

  const TAB_ICONS = {
    dashboard:     '◈', trabajadores: '◉', contratos:  '◎',
    anexos:        '◍', remuneraciones:'◑',impuestos:  '◐',
    asistencia:    '◒', organizacion: '◓', reportes:   '◔',
    contabilidad:  '◕', finiquitos:   '●', portal:     '◆',
  };

  return (
    <div className="min-h-screen" style={{background:'#f0f2f7'}}>

      {/* ── HEADER ── */}
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 pt-6 pb-16">

        {/* Banner premium */}
        <div className="relative overflow-hidden rounded-3xl mb-5 shadow-xl"
          style={{background:'linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)'}}>
          {/* Decoración geométrica */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute -top-20 -right-20 w-96 h-96 rounded-full opacity-10"
              style={{background:'radial-gradient(circle, #a78bfa 0%, transparent 70%)'}} />
            <div className="absolute -bottom-16 -left-16 w-72 h-72 rounded-full opacity-10"
              style={{background:'radial-gradient(circle, #60a5fa 0%, transparent 70%)'}} />
            <div className="absolute top-0 left-0 right-0 h-px opacity-20"
              style={{background:'linear-gradient(to right, transparent, #a78bfa, transparent)'}} />
            <svg className="absolute right-0 top-0 h-full opacity-5" viewBox="0 0 400 120" preserveAspectRatio="xMaxYMid slice">
              <circle cx="320" cy="60" r="120" fill="none" stroke="white" strokeWidth="1"/>
              <circle cx="320" cy="60" r="80" fill="none" stroke="white" strokeWidth="0.5"/>
              <circle cx="320" cy="60" r="40" fill="none" stroke="white" strokeWidth="0.5"/>
              <line x1="200" y1="60" x2="440" y2="60" stroke="white" strokeWidth="0.5"/>
              <line x1="320" y1="-60" x2="320" y2="180" stroke="white" strokeWidth="0.5"/>
            </svg>
          </div>

          <div className="relative px-7 py-5 flex items-center justify-between">
            <div className="flex items-center gap-5">
              <div className="flex-shrink-0 w-14 h-14 rounded-2xl flex items-center justify-center"
                style={{background:'rgba(167,139,250,0.15)', border:'1px solid rgba(167,139,250,0.3)'}}>
                <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="url(#grad1)" strokeWidth={1.5}>
                  <defs>
                    <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#a78bfa"/>
                      <stop offset="100%" stopColor="#60a5fa"/>
                    </linearGradient>
                  </defs>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/>
                </svg>
              </div>
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-2xl font-black tracking-tight" style={{color:'#f0f0ff', letterSpacing:'-0.02em', fontFamily:"'DM Sans', system-ui, sans-serif"}}>
                    Recursos Humanos
                  </h1>
                  <span className="text-[10px] font-black px-2 py-0.5 rounded-full tracking-widest uppercase"
                    style={{background:'rgba(167,139,250,0.15)', color:'#c4b5fd', border:'1px solid rgba(167,139,250,0.2)'}}>
                    PRO
                  </span>
                </div>
                <p className="text-sm mt-0.5 font-medium" style={{color:'rgba(196,181,253,0.7)'}}>
                  Código del Trabajo · Previred · SII · Art. 42 LIR
                </p>
              </div>
            </div>
            <div className="hidden sm:flex items-center gap-2">
              {['CT','DT','SII','AFP'].map(badge => (
                <span key={badge} className="text-[10px] font-black px-2 py-1 rounded-lg tracking-widest"
                  style={{background:'rgba(255,255,255,0.05)', color:'rgba(255,255,255,0.4)', border:'1px solid rgba(255,255,255,0.08)'}}>
                  {badge}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* ── TABS — sidebar horizontal premium ── */}
        <div className="flex gap-1.5 mb-6 overflow-x-auto pb-1"
          style={{scrollbarWidth:'none'}}>
          {PAGE_TABS.map(tab => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                disabled={!tab.ready}
                onClick={() => tab.ready && setActiveTab(tab.id)}
                className="flex-shrink-0 relative transition-all duration-200"
                style={{
                  padding: '8px 16px',
                  borderRadius: '12px',
                  fontSize: '12.5px',
                  fontWeight: isActive ? 700 : 500,
                  letterSpacing: isActive ? '-0.01em' : '0',
                  background: isActive
                    ? 'linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)'
                    : 'rgba(255,255,255,0.9)',
                  color: isActive ? '#fff' : '#64748b',
                  border: isActive ? 'none' : '1px solid rgba(0,0,0,0.06)',
                  boxShadow: isActive
                    ? '0 4px 14px rgba(124,58,237,0.35), 0 1px 3px rgba(124,58,237,0.2)'
                    : '0 1px 3px rgba(0,0,0,0.04)',
                  transform: isActive ? 'translateY(-1px)' : 'none',
                  cursor: tab.ready ? 'pointer' : 'not-allowed',
                  opacity: tab.ready ? 1 : 0.35,
                }}
              >
                <span className="flex items-center gap-1.5">
                  <span style={{fontSize:'10px', opacity: isActive ? 1 : 0.5}}>{TAB_ICONS[tab.id]||'·'}</span>
                  {tab.label}
                </span>
              </button>
            );
          })}
        </div>

        {/* Contenido */}
        {activeTab === 'dashboard'     && <DashboardSection />}
        {activeTab === 'trabajadores' && <TrabajadoresSection />}
        {activeTab === 'contratos'     && <ContratosSection />}
        {activeTab === 'anexos'        && <AnexosSection />}
        {activeTab === 'remuneraciones' && <RemuneracionesSection />}
        {activeTab === 'impuestos'      && <ImpuestosSection />}
        {activeTab === 'asistencia'      && <AsistenciaSection />}
        {activeTab === 'organizacion'    && <OrganizacionSection />}
        {activeTab === 'reportes'        && <ReportesSection />}
        {activeTab === 'contabilidad'    && <ContabilidadSection />}
        {activeTab === 'finiquitos'      && <FiniquitosSection />}
        {activeTab === 'portal'          && <PortalTrabajadoresPanel trabajadores={trabajadores} />}
        {!PAGE_TABS.find(t=>t.id===activeTab)?.ready && (
          <div className="flex flex-col items-center justify-center py-32 text-slate-400">
            <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mb-4">
              <svg className="w-8 h-8 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6m0 0v6m0-6h6m-6 0H6"/></svg>
            </div>
            <p className="font-bold text-slate-500 text-lg">Próximamente</p>
            <p className="text-sm mt-1">Esta sección se habilitará en la siguiente fase</p>
          </div>
        )}

        <div className="pb-10" />
      </div>
    </div>
  );
}

