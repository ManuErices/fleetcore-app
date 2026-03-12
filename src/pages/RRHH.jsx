import React, { useState, useEffect, useCallback, useRef } from 'react';
import { db } from '../lib/firebase';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, orderBy, serverTimestamp } from 'firebase/firestore';
import * as Shared from './RRHH.shared';
import { DashboardSection, TrabajadoresSection, ContratosSection,
  RemuneracionesSection, FiniquitosSection, PortalTrabajadoresPanel } from './RRHH.sections.a';
import { AnexosSection, ImpuestosSection, AsistenciaSection,
  OrganizacionSection, ReportesSection, ContabilidadSection,
  PreviredAvanzadoSection, ArchivoPagoSection } from './RRHH.sections.b';

const DIRECT_TABS = [
  { id:'dashboard'   , label:'Dashboard'    },
  { id:'reportes'    , label:'Reportes'     },
  { id:'contabilidad', label:'Contabilidad' },
];

const OBLIGACIONES_GROUPS = [
  { label: null, tabs: [
    { id:'previred_avanzado', label:'Previred Avanzado' },
    { id:'archivo_pago',      label:'Archivo de Pago'   },
    { id:'impuestos',         label:'Impuestos'         },
  ]},
];

const OBLIGACIONES_IDS = new Set(OBLIGACIONES_GROUPS.flatMap(g => g.tabs.map(t => t.id)));

const GESTION_GROUPS = [
  { label: 'Organización', tabs: [{ id:'organizacion', label:'Organización' }] },
  { label: null, tabs: [
    { id:'trabajadores',   label:'Trabajadores'  },
    { id:'portal',         label:'Portal'        },
    { id:'contratos',      label:'Contratos'     },
    { id:'anexos',         label:'Anexos'        },
  ]},
  { label: null, tabs: [
    { id:'remuneraciones', label:'Remuneraciones' },
    { id:'finiquitos',     label:'Finiquitos'     },
  ]},
  { label: null, tabs: [
    { id:'asistencia', label:'Asistencia' },
  ]},
];

const GESTION_IDS = new Set(GESTION_GROUPS.flatMap(g => g.tabs.map(t => t.id)));

export default function RRHH() {
  const [activeTab,    setActiveTab]    = useState('dashboard');
  const [showGestion,  setShowGestion]  = useState(false);
  const [gestionPos,   setGestionPos]   = useState({top:0,left:0});
  const gestionRef = React.useRef(null);
  const [showObligaciones, setShowObligaciones] = useState(false);
  const [obligacionesPos,  setObligacionesPos]  = useState({top:0,left:0});
  const obligacionesRef = React.useRef(null);

  // Recalcular posición al hacer scroll o resize
  React.useEffect(() => {
    if (!showGestion) return;
    const update = () => {
      const rect = gestionRef.current?.getBoundingClientRect();
      if (!rect || rect.bottom < 0 || rect.top > window.innerHeight) {
        setShowGestion(false);
        return;
      }
      setGestionPos({ top: rect.bottom + 8, left: rect.left });
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [showGestion]);

  React.useEffect(() => {
    if (!showObligaciones) return;
    const update = () => {
      const rect = obligacionesRef.current?.getBoundingClientRect();
      if (!rect || rect.bottom < 0 || rect.top > window.innerHeight) {
        setShowObligaciones(false);
        return;
      }
      setObligacionesPos({ top: rect.bottom + 8, left: rect.left });
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [showObligaciones]);
  const [trabajadores, setTrabajadores] = useState([]);

  // Cargar trabajadores para el panel Portal
  useEffect(() => {
    if (activeTab !== 'portal') return;
    getDocs(query(collection(db, 'trabajadores'), orderBy('apellidoPaterno')))
      .then(snap => setTrabajadores(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
      .catch(() => {});
  }, [activeTab]);

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

        {/* ── NAVEGACIÓN ── */}
        <div className="flex gap-1.5 mb-6 overflow-x-auto pb-1 items-center" style={{scrollbarWidth:'none'}}>

          {/* Dropdown "Gestión de Personal" — AL INICIO */}
          <div className="relative flex-shrink-0">
            <button ref={gestionRef}
            onClick={() => { setShowGestion(v => !v); setShowObligaciones(false); }}
            className="flex-shrink-0 flex items-center gap-1.5 transition-all duration-200"
            style={{
              padding:'8px 16px', borderRadius:'12px', fontSize:'12.5px',
              fontWeight: GESTION_IDS.has(activeTab) ? 700 : 500,
              background: GESTION_IDS.has(activeTab)
                ? 'linear-gradient(135deg,#7c3aed 0%,#4f46e5 100%)'
                : showGestion ? 'rgba(124,58,237,0.08)' : 'rgba(255,255,255,0.9)',
              color: GESTION_IDS.has(activeTab) ? '#fff' : showGestion ? '#7c3aed' : '#64748b',
              border: GESTION_IDS.has(activeTab) ? 'none' : '1px solid rgba(0,0,0,0.06)',
              boxShadow: GESTION_IDS.has(activeTab) ? '0 4px 14px rgba(124,58,237,0.35)' : '0 1px 3px rgba(0,0,0,0.04)',
              transform: GESTION_IDS.has(activeTab) ? 'translateY(-1px)' : 'none',
            }}>
            Gestión de Personal
            <svg style={{width:'12px',height:'12px',transition:'transform 0.2s',transform:showGestion?'rotate(180deg)':'none'}}
              fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          </div>

          <div style={{width:'1px',height:'20px',background:'rgba(0,0,0,0.1)',flexShrink:0,margin:'0 2px'}} />

          {/* Dropdown "Obligaciones Previsionales y Tributarias" */}
          <div className="relative flex-shrink-0">
            <button ref={obligacionesRef}
              onClick={() => { setShowObligaciones(v => !v); setShowGestion(false); }}
              className="flex-shrink-0 flex items-center gap-1.5 transition-all duration-200"
              style={{
                padding:'8px 16px', borderRadius:'12px', fontSize:'12.5px',
                fontWeight: OBLIGACIONES_IDS.has(activeTab) ? 700 : 500,
                background: OBLIGACIONES_IDS.has(activeTab)
                  ? 'linear-gradient(135deg,#7c3aed 0%,#4f46e5 100%)'
                  : showObligaciones ? 'rgba(124,58,237,0.08)' : 'rgba(255,255,255,0.9)',
                color: OBLIGACIONES_IDS.has(activeTab) ? '#fff' : showObligaciones ? '#7c3aed' : '#64748b',
                border: OBLIGACIONES_IDS.has(activeTab) ? 'none' : '1px solid rgba(0,0,0,0.06)',
                boxShadow: OBLIGACIONES_IDS.has(activeTab) ? '0 4px 14px rgba(124,58,237,0.35)' : '0 1px 3px rgba(0,0,0,0.04)',
                transform: OBLIGACIONES_IDS.has(activeTab) ? 'translateY(-1px)' : 'none',
              }}>
              Obligaciones Prev. y Trib.
              <svg style={{width:'12px',height:'12px',transition:'transform 0.2s',transform:showObligaciones?'rotate(180deg)':'none'}}
                fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>

          <div style={{width:'1px',height:'20px',background:'rgba(0,0,0,0.1)',flexShrink:0,margin:'0 2px'}} />

          {/* Tabs directas */}
          {DIRECT_TABS.map(tab => {
            const isActive = activeTab === tab.id;
            return (
              <button key={tab.id}
                onClick={() => { setActiveTab(tab.id); setShowGestion(false); }}
                className="flex-shrink-0 transition-all duration-200"
                style={{
                  padding:'8px 16px', borderRadius:'12px', fontSize:'12.5px',
                  fontWeight: isActive ? 700 : 500,
                  background: isActive ? 'linear-gradient(135deg,#7c3aed 0%,#4f46e5 100%)' : 'rgba(255,255,255,0.9)',
                  color: isActive ? '#fff' : '#64748b',
                  border: isActive ? 'none' : '1px solid rgba(0,0,0,0.06)',
                  boxShadow: isActive ? '0 4px 14px rgba(124,58,237,0.35)' : '0 1px 3px rgba(0,0,0,0.04)',
                  transform: isActive ? 'translateY(-1px)' : 'none',
                }}>
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Dropdown Gestión de Personal — fixed para evitar overflow clip */}
        {showGestion && (
          <>
            <div className="fixed inset-0 z-[999]" onClick={() => setShowGestion(false)} />
            <div className="fixed z-[1000] bg-white rounded-2xl shadow-2xl border border-slate-100"
              style={{top: Math.max(gestionPos.top, 140), left: gestionPos.left, minWidth:'200px', padding:'8px'}}>
              {GESTION_GROUPS.map((group, gi) => (
                <div key={gi}>
                  {gi > 0 && <div style={{height:'1px',background:'#f1f5f9',margin:'4px 0'}} />}
                  {group.label && (
                    <div style={{padding:'4px 12px 2px',fontSize:'10px',fontWeight:700,
                      letterSpacing:'0.08em',color:'#94a3b8',textTransform:'uppercase'}}>
                      {group.label}
                    </div>
                  )}
                  {group.tabs.map(tab => {
                    const isActive = activeTab === tab.id;
                    return (
                      <button key={tab.id}
                        onClick={() => { setActiveTab(tab.id); setShowGestion(false); }}
                        className="w-full text-left transition-colors duration-150"
                        style={{
                          display:'block', padding:'8px 12px', borderRadius:'10px',
                          fontSize:'13px', fontWeight: isActive ? 700 : 500,
                          background: isActive ? 'linear-gradient(135deg,#7c3aed 0%,#4f46e5 100%)' : 'transparent',
                          color: isActive ? '#fff' : '#334155',
                        }}>
                        {tab.label}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </>
        )}

        {/* Dropdown Obligaciones Previsionales y Tributarias — fixed */}
        {showObligaciones && (
          <>
            <div className="fixed inset-0 z-[999]" onClick={() => setShowObligaciones(false)} />
            <div className="fixed z-[1000] bg-white rounded-2xl shadow-2xl border border-slate-100"
              style={{top: Math.max(obligacionesPos.top, 140), left: obligacionesPos.left, minWidth:'220px', padding:'8px'}}>
              {OBLIGACIONES_GROUPS.map((group, gi) => (
                <div key={gi}>
                  {gi > 0 && <div style={{height:'1px',background:'#f1f5f9',margin:'4px 0'}} />}
                  {group.label && (
                    <div style={{padding:'4px 12px 2px',fontSize:'10px',fontWeight:700,
                      letterSpacing:'0.08em',color:'#94a3b8',textTransform:'uppercase'}}>
                      {group.label}
                    </div>
                  )}
                  {group.tabs.map(tab => {
                    const isActive = activeTab === tab.id;
                    return (
                      <button key={tab.id}
                        onClick={() => { setActiveTab(tab.id); setShowObligaciones(false); }}
                        className="w-full text-left transition-colors duration-150"
                        style={{
                          display:'block', padding:'8px 12px', borderRadius:'10px',
                          fontSize:'13px', fontWeight: isActive ? 700 : 500,
                          background: isActive ? 'linear-gradient(135deg,#7c3aed 0%,#4f46e5 100%)' : 'transparent',
                          color: isActive ? '#fff' : '#334155',
                        }}>
                        {tab.label}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </>
        )}

        {/* Contenido */}
        {activeTab === 'dashboard'     && <DashboardSection />}
        {activeTab === 'trabajadores' && <TrabajadoresSection />}
        {activeTab === 'contratos'     && <ContratosSection />}
        {activeTab === 'anexos'        && <AnexosSection />}
        {activeTab === 'remuneraciones' && <RemuneracionesSection />}
        {activeTab === 'impuestos'         && <ImpuestosSection />}
        {activeTab === 'previred_avanzado' && <PreviredAvanzadoSection />}
        {activeTab === 'archivo_pago'      && <ArchivoPagoSection />}
        {activeTab === 'asistencia'      && <AsistenciaSection />}
        {activeTab === 'organizacion'    && <OrganizacionSection />}
        {activeTab === 'reportes'        && <ReportesSection />}
        {activeTab === 'contabilidad'    && <ContabilidadSection />}
        {activeTab === 'finiquitos'      && <FiniquitosSection />}
        {activeTab === 'portal'          && <PortalTrabajadoresPanel trabajadores={trabajadores} />}
        <div className="pb-10" />
      </div>
    </div>
  );
}

