import { useState, useEffect, useCallback, useRef } from 'react';
import { db } from '../../lib/firebase';
import { useEmpresa } from '../../lib/useEmpresa';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, orderBy, serverTimestamp, onSnapshot, setDoc, getDoc } from 'firebase/firestore';
import * as Shared from './shared';
import * as Calc from './calculo';
import * as PDFs from './pdfs';
import * as Modals from './modals';
const { inp, EMPRESAS, AREAS, AFPS, ISAPRES, TIPOS_CONTRATO, JORNADAS, CENTROS_COSTO,
  CAUSALES_TERMINO, TIPOS_PERIODO, MESES, IMM_2026, TASAS, TASAS_AFP,
  COLORES_AREA, UTM_DEFAULT, TRAMOS_IUT, TIPOS_ANEXO, ESTADOS_DIA, PLAN_CUENTAS_DEFAULT,
  Modal, ConfirmDialog, Sparkline, DonutChart, BarraH, LineaMini, KPICard,
  mesAnioKey, calcularTasaRotacion, ultimosMeses, exportarReporteCSV } = Shared;
const { diasEntre, alertaVencimiento, labelPeriodo, factorPeriodo,
  calcularLiquidacion, calcularAntiguedad, calcularFiniquito,
  calcularIUT, calcularRentaTributable, calcularLiquidacionConIUT,
  horasOrdinariasSemanales, exportarAsistenciaCSV } = Calc;
const { generarPDFLiquidacion, generarPDFResumenNomina, generarTXTPrevired,
  generarCertificadoAnual, generarPDFReporte, generarPDFAsientos,
  generarAsientos, validarRutPrevired, generarPreviredAvanzado, generarArchivoPago,
  generarPDFContrato, generarPDFFiniquito, generarPDFAnexo } = PDFs;
const { TrabajadorModal, FichaTrabajador, ContratoModal, LiquidacionModal,
  FiniquitoModal, AnexoModal, HistorialModal, AsistenciaModal } = Modals;

function AnexosSection() {
  const { empresaId } = useEmpresa();
  const [anexos,       setAnexos]       = useState([]);
  const [trabajadores, setTrabajadores] = useState([]);
  const [contratos,    setContratos]    = useState([]);
  const [liquidaciones,setLiquidaciones]= useState([]);
  const [finiquitos,   setFiniquitos]   = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [modal,        setModal]        = useState(false);
  const [editData,     setEditData]     = useState(null);
  const [historial,    setHistorial]    = useState(null); // trabajador abierto
  const [confirm,      setConfirm]      = useState(null);
  const [busqueda,     setBusqueda]     = useState('');
  const [filtroTipo,   setFiltroTipo]   = useState('');
  const [pagina,       setPagina]       = useState(1);
  const POR_PAGINA = 10;

  const load = useCallback(async () => {
    if (!empresaId) return;
    setLoading(true);
    try {
      const [aSnap, tSnap, cSnap, rSnap, fSnap] = await Promise.all([
        getDocs(query(collection(db,'empresas',empresaId,'anexos'), orderBy('createdAt','desc'))),
        getDocs(collection(db,'empresas',empresaId,'trabajadores')),
        getDocs(collection(db,'empresas',empresaId,'contratos')),
        getDocs(collection(db,'empresas',empresaId,'remuneraciones')),
        getDocs(collection(db,'empresas',empresaId,'finiquitos')),
      ]);
      setAnexos(aSnap.docs.map(d=>({id:d.id,...d.data()})));
      setTrabajadores(tSnap.docs.map(d=>({id:d.id,...d.data()})));
      setContratos(cSnap.docs.map(d=>({id:d.id,...d.data()})));
      setLiquidaciones(rSnap.docs.map(d=>({id:d.id,...d.data()})));
      setFiniquitos(fSnap.docs.map(d=>({id:d.id,...d.data()})));
    } catch(e) { console.error(e); }
    setLoading(false);
  }, [empresaId]);

  useEffect(() => { load(); }, [load]);

  const enriquecidos = anexos.map(a => ({
    ...a,
    _trabajador: trabajadores.find(t=>t.id===a.trabajadorId),
    _contrato:   contratos.find(c=>c.id===a.contratoId),
    _nro: anexos.filter(x=>x.trabajadorId===a.trabajadorId&&x.estado!=='anulado').sort((x,y)=>new Date(x.fechaAnexo)-new Date(y.fechaAnexo)).findIndex(x=>x.id===a.id)+1,
  }));

  const filtrados = enriquecidos.filter(a => {
    const q = busqueda.toLowerCase();
    const nombre = `${a._trabajador?.nombre||''} ${a._trabajador?.apellidoPaterno||''}`.toLowerCase();
    return (!q || nombre.includes(q) || a._trabajador?.rut?.includes(busqueda)) &&
           (!filtroTipo || a.tipo === filtroTipo);
  });

  const totalPag  = Math.ceil(filtrados.length / POR_PAGINA);
  const paginados = filtrados.slice((pagina-1)*POR_PAGINA, pagina*POR_PAGINA);

  const handleDelete = async () => {
    try { await deleteDoc(doc(db, 'empresas', empresaId, 'anexos', confirm.id)); load(); }
    catch(e) { alert('Error: '+e.message); }
    setConfirm(null);
  };

  const tipoBadgeColor = {
    aumento_sueldo: 'bg-emerald-100 text-emerald-700', cambio_cargo: 'bg-blue-100 text-blue-700',
    cambio_jornada: 'bg-purple-100 text-purple-700',   cambio_lugar: 'bg-orange-100 text-orange-700',
    cambio_empresa: 'bg-indigo-100 text-indigo-700',   prorroga: 'bg-amber-100 text-amber-700',
    otros_bonos:    'bg-teal-100 text-teal-700',        otro: 'bg-slate-100 text-slate-600',
  };

  // Trabajadores con contratos activos (para abrir historial)
  const trabajadoresConHistorial = trabajadores.filter(t =>
    contratos.some(c=>c.trabajadorId===t.id)
  ).sort((a,b)=>a.apellidoPaterno?.localeCompare(b.apellidoPaterno||''));

  return (
    <>
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[
          ['Total anexos',      anexos.length,                                           'text-purple-600', false],
          ['Vigentes',          anexos.filter(a=>a.estado!=='anulado').length,           'text-emerald-600',false],
          ['Trabajadores con anexo', new Set(anexos.map(a=>a.trabajadorId)).size,        'text-indigo-600', false],
          ['Aumentos de sueldo',anexos.filter(a=>a.tipo==='aumento_sueldo').length,     'text-slate-700',  false],
        ].map(([l,v,c,m])=>(
          <div key={l} className="rounded-2xl px-5 py-4" style={{background:"#fff", border:"1px solid rgba(0,0,0,0.06)", boxShadow:"0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(124,58,237,0.04)"}}>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">{l}</p>
            <p className={`text-4xl font-black ${c} mt-1`}>{v}</p>
          </div>
        ))}
      </div>

      {/* Accesos rápidos a historial por trabajador */}
      <div className="rounded-2xl p-5 mb-5" style={{background:"#fff", border:"1px solid rgba(0,0,0,0.06)", boxShadow:"0 2px 8px rgba(0,0,0,0.04)"}}>
        <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-3">Historial por trabajador</p>
        <div className="flex flex-wrap gap-2">
          {trabajadoresConHistorial.slice(0,12).map(t => {
            const nAnexos = anexos.filter(a=>a.trabajadorId===t.id&&a.estado!=='anulado').length;
            return (
              <button key={t.id} onClick={()=>setHistorial(t)}
                className="flex items-center gap-2 px-3 py-2 bg-slate-50 hover:bg-purple-50 border border-slate-200 hover:border-purple-200 rounded-xl text-sm font-bold text-slate-700 hover:text-purple-700 transition-all">
                <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-purple-500 to-indigo-500 flex items-center justify-center text-white font-black text-[10px] flex-shrink-0">
                  {t.nombre?.[0]||''}{t.apellidoPaterno?.[0]||''}
                </div>
                {t.nombre} {t.apellidoPaterno}
                {nAnexos > 0 && <span className="bg-indigo-100 text-indigo-700 text-[10px] font-black px-1.5 py-0.5 rounded-full">{nAnexos}</span>}
              </button>
            );
          })}
          {trabajadoresConHistorial.length === 0 && (
            <p className="text-sm text-slate-400">Sin trabajadores con contratos registrados</p>
          )}
        </div>
      </div>

      {/* Tabla anexos */}
      <div className="rounded-2xl overflow-hidden" style={{background:"#fff", border:"1px solid rgba(0,0,0,0.06)", boxShadow:"0 2px 8px rgba(0,0,0,0.05), 0 8px 24px rgba(124,58,237,0.04)"}}>
        <div className="px-5 py-4 flex items-center justify-between" style={{background:"linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)"}}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
            </div>
            <div>
              <h2 className="text-base font-black text-white flex items-center gap-2">Anexos <span className="text-xs bg-white/20 text-white/90 px-2 py-0.5 rounded-full">{filtrados.length}</span></h2>
              <p className="text-xs text-white/70 mt-0.5">Art. 11 CT · Modificaciones contractuales</p>
            </div>
          </div>
          <button onClick={()=>{setEditData(null);setModal(true);}} className="flex items-center gap-1.5 px-4 py-2 font-bold text-sm rounded-xl transition-all active:scale-95" style={{background:"rgba(255,255,255,0.12)", color:"#e0d9ff", border:"1px solid rgba(255,255,255,0.15)"}}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/></svg>
            + Nuevo Anexo
          </button>
        </div>

        <div className="px-5 py-3 border-b flex flex-wrap gap-2" style={{borderColor:"rgba(0,0,0,0.05)", background:"rgba(248,248,252,0.8)"}}>
          <div className="relative flex-1 min-w-[150px]">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z"/></svg>
            <input className="w-full pl-9 pr-4 py-2 border-2 border-slate-200 rounded-xl text-sm focus:outline-none focus:border-purple-400 bg-white" placeholder="Buscar trabajador..." value={busqueda} onChange={e=>{setBusqueda(e.target.value);setPagina(1);}} />
          </div>
          <select className="px-3 py-2 border-2 border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:border-purple-400" value={filtroTipo} onChange={e=>{setFiltroTipo(e.target.value);setPagina(1);}}>
            <option value="">Todos los tipos</option>
            {TIPOS_ANEXO.map(t=><option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 rounded-full animate-spin" style={{border:"2px solid rgba(124,58,237,0.15)", borderTopColor:"#7c3aed"}} />
          </div>
        ) : paginados.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-3" style={{background:"rgba(124,58,237,0.06)", border:"1px solid rgba(124,58,237,0.1)"}}>
              <svg className="w-7 h-7 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
            </div>
            <p className="font-semibold text-sm">Sin anexos registrados</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px]">
              <thead>
                <tr style={{background:"#1e1b4b"}}>
                  {['Trabajador','N°','Tipo','Fecha','Detalle principal','Estado','Acciones'].map(h=>(
                    <th key={h} className="px-4 py-3 text-left text-[11px] font-black text-slate-300 uppercase tracking-widest">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {paginados.map(row => {
                  const ini    = `${row._trabajador?.nombre?.[0]||''}${row._trabajador?.apellidoPaterno?.[0]||''}`;
                  const nombre = `${row._trabajador?.nombre||''} ${row._trabajador?.apellidoPaterno||''}`.trim()||'—';
                  // Detalle principal según tipo
                  const detalle = row.tipo==='aumento_sueldo' ? `$${parseInt(row.sueldoBase||0).toLocaleString('es-CL')}` :
                                  row.tipo==='cambio_cargo'   ? row.cargo :
                                  row.tipo==='prorroga'       ? `hasta ${row.fechaFin}` :
                                  row.tipo==='cambio_jornada' ? row.jornada :
                                  row.tipo==='cambio_lugar'   ? row.lugarTrabajo :
                                  row.tipo==='cambio_empresa' ? row.empresa :
                                  row.descripcion?.slice(0,40)||'—';
                  return (
                    <tr key={row.id} className="transition-colors" style={{}} onMouseEnter={e=>e.currentTarget.style.background="#faf9ff"} onMouseLeave={e=>e.currentTarget.style.background=""}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <button onClick={()=>setHistorial(row._trabajador)} className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white font-black text-xs flex-shrink-0 hover:scale-110 transition-transform" title="Ver historial">
                            {ini}
                          </button>
                          <div>
                            <p className="font-bold text-slate-800 text-sm">{nombre}</p>
                            <p className="text-[11px] text-slate-400">{row._trabajador?.rut||'—'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="w-7 h-7 inline-flex items-center justify-center bg-indigo-100 text-indigo-700 font-black text-xs rounded-lg">{row._nro}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${tipoBadgeColor[row.tipo]||'bg-slate-100 text-slate-600'}`}>
                          {TIPOS_ANEXO.find(t=>t.value===row.tipo)?.label||row.tipo}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">{row.fechaAnexo||'—'}</td>
                      <td className="px-4 py-3 text-sm text-slate-600 max-w-[160px] truncate">{detalle||'—'}</td>
                      <td className="px-4 py-3">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${row.estado==='anulado'?'bg-red-100 text-red-600':'bg-emerald-100 text-emerald-700'}`}>
                          {row.estado==='anulado'?'Anulado':'Vigente'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button onClick={()=>generarPDFAnexo(row, row._contrato, row._trabajador, row._nro)} className="p-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 rounded-lg transition-colors" title="PDF">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                          </button>
                          <button onClick={()=>{setEditData(row);setModal(true);}} className="p-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-lg transition-colors" title="Editar">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
                          </button>
                          <button onClick={()=>setConfirm(row)} className="p-1.5 bg-red-50 hover:bg-red-100 text-red-500 rounded-lg transition-colors" title="Eliminar">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {totalPag > 1 && (
          <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between bg-slate-50/40">
            <p className="text-xs text-slate-400 font-medium">Mostrando {(pagina-1)*POR_PAGINA+1}–{Math.min(pagina*POR_PAGINA,filtrados.length)} de <strong>{filtrados.length}</strong></p>
            <div className="flex gap-1">
              <button disabled={pagina===1}       onClick={()=>setPagina(p=>p-1)} className="px-3 py-1.5 text-xs font-bold bg-white border-2 border-slate-200 hover:border-purple-300 hover:text-purple-600 disabled:opacity-40 rounded-xl transition-all">← Ant</button>
              <button disabled={pagina===totalPag} onClick={()=>setPagina(p=>p+1)} className="px-3 py-1.5 text-xs font-bold bg-white border-2 border-slate-200 hover:border-purple-300 hover:text-purple-600 disabled:opacity-40 rounded-xl transition-all">Sig →</button>
            </div>
          </div>
        )}
      </div>

      {/* Modales */}
      <AnexoModal isOpen={modal} onClose={()=>setModal(false)} editData={editData}
        contratos={contratos} trabajadores={trabajadores} nroAnexo={1} onSaved={load} />

      <HistorialModal isOpen={!!historial} onClose={()=>setHistorial(null)}
        trabajador={historial} contratos={contratos} anexos={anexos}
        liquidaciones={liquidaciones} finiquitos={finiquitos} onSaved={load} />

      {confirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={()=>setConfirm(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-3" style={{background:"rgba(239,68,68,0.1)", border:"1px solid rgba(239,68,68,0.2)"}}>
              <svg className="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
            </div>
            <h3 className="text-base font-black text-slate-900 text-center">¿Eliminar anexo?</h3>
            <p className="text-sm text-slate-500 text-center mt-1 mb-5">Esta acción no se puede deshacer.</p>
            <div className="flex gap-3">
              <button onClick={()=>setConfirm(null)} className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-sm">Cancelar</button>
              <button onClick={handleDelete} className="flex-1 py-2.5 text-white font-bold rounded-xl text-sm" style={{background:"linear-gradient(135deg, #ef4444, #e11d48)", boxShadow:"0 4px 12px rgba(239,68,68,0.3)"}}>Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ImpuestosSection() {
  const { empresaId } = useEmpresa();
  const [trabajadores,  setTrabajadores]  = useState([]);
  const [contratos,     setContratos]     = useState([]);
  const [liquidaciones, setLiquidaciones] = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [utm,           setUtm]           = useState(UTM_DEFAULT);
  const [utmInput,      setUtmInput]      = useState(String(UTM_DEFAULT));
  const [anio,          setAnio]          = useState(String(new Date().getFullYear()));
  const [filtroEmpresa, setFiltroEmpresa] = useState('');
  const [busqueda,      setBusqueda]      = useState('');
  const [pagina,        setPagina]        = useState(1);
  const [modalTramos,   setModalTramos]   = useState(false);
  const POR_PAGINA = 10;

  const load = useCallback(async () => {
    if (!empresaId) return;
    setLoading(true);
    try {
      const [tSnap, cSnap, rSnap] = await Promise.all([
        getDocs(collection(db,'empresas',empresaId,'trabajadores')),
        getDocs(collection(db,'empresas',empresaId,'contratos')),
        getDocs(query(collection(db,'empresas',empresaId,'remuneraciones'), orderBy('createdAt','desc'))),
      ]);
      setTrabajadores(tSnap.docs.map(d=>({id:d.id,...d.data()})));
      setContratos(cSnap.docs.map(d=>({id:d.id,...d.data()})));
      setLiquidaciones(rSnap.docs.map(d=>({id:d.id,...d.data()})));
    } catch(e){ console.error(e); }
    setLoading(false);
  }, [empresaId]);

  useEffect(() => { load(); }, [load]);

  // Aplicar UTM ingresado
  const aplicarUtm = () => {
    const v = parseInt(utmInput.replace(/\D/g,''));
    if (v > 0) setUtm(v);
  };

  // Construir resumen anual por trabajador
  const resumenPorTrabajador = trabajadores
    .map(t => {
      const contrato    = contratos.find(c=>c.trabajadorId===t.id && c.estado==='vigente')
                       || contratos.find(c=>c.trabajadorId===t.id);
      const liqs        = liquidaciones.filter(l=>l.trabajadorId===t.id && l.anio===anio);
      if (!contrato || liqs.length===0) return null;

      let totalImp=0, totalNoImp=0, totalAfp=0, totalSalud=0, totalCes=0, totalIUT=0, totalLiq=0, maxMensual=0;
      liqs.forEach(l => {
        const c = calcularLiquidacionConIUT({...contrato,...l}, utm);
        totalImp    += c.imponible;
        totalNoImp  += c.noImponible;
        totalAfp    += c.afpM;
        totalSalud  += c.salM;
        totalCes    += c.cesM + c.sisM;
        totalIUT    += c.iut;
        totalLiq    += c.liquidoFinal;
        maxMensual   = Math.max(maxMensual, c.imponible);
      });

      // Tramo predominante (basado en renta mensual max)
      const enUTM  = maxMensual / utm;
      const tramo  = TRAMOS_IUT.find(t=>enUTM>t.desde && enUTM<=t.hasta) || TRAMOS_IUT[0];
      const tasaPct= Math.round(tramo.tasa * 100);

      return {
        ...t, _contrato:contrato, liqs,
        totalImp, totalNoImp, totalAfp, totalSalud, totalCes, totalIUT, totalLiq,
        tasaPct, mesesConLiq: liqs.length,
        exento: totalIUT === 0,
      };
    })
    .filter(Boolean);

  const filtrados = resumenPorTrabajador.filter(t => {
    const q = busqueda.toLowerCase();
    return (
      (!busqueda || `${t.nombre} ${t.apellidoPaterno}`.toLowerCase().includes(q) || t.rut?.includes(busqueda)) &&
      (!filtroEmpresa || t._contrato?.empresa === filtroEmpresa)
    );
  });

  const totalPag  = Math.ceil(filtrados.length / POR_PAGINA);
  const paginados = filtrados.slice((pagina-1)*POR_PAGINA, pagina*POR_PAGINA);

  // Stats globales
  const totalIUTAnual   = filtrados.reduce((s,t)=>s+t.totalIUT,0);
  const totalRentaAnual = filtrados.reduce((s,t)=>s+t.totalImp,0);
  const conImpuesto     = filtrados.filter(t=>!t.exento).length;

  // Simulador tramo: mostrar tabla UTM dinámica
  const tramosConPesos = TRAMOS_IUT.map(t=>({
    ...t,
    desdeP: Math.round(t.desde * utm),
    hastaP: t.hasta === Infinity ? null : Math.round(t.hasta * utm),
  }));

  if (loading) return (
    <div className="flex items-center justify-center py-32">
      <div className="w-10 h-10 rounded-full animate-spin" style={{border:"2px solid rgba(124,58,237,0.15)", borderTopColor:"#7c3aed"}} />
    </div>
  );

  return (
    <div className="space-y-6">

      {/* ── Configuración UTM + año ── */}
      <div className="rounded-2xl p-5" style={{background:"#fff", border:"1px solid rgba(0,0,0,0.06)", boxShadow:"0 2px 8px rgba(0,0,0,0.04)"}}>
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex-1 min-w-[160px]">
            <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Año tributario</p>
            <select className={inp} value={anio} onChange={e=>{setAnio(e.target.value);setPagina(1);}}>
              {[2022,2023,2024,2025,2026].map(y=><option key={y}>{y}</option>)}
            </select>
          </div>
          <div className="flex-1 min-w-[200px]">
            <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Valor UTM mensual ($)</p>
            <div className="flex gap-2">
              <input className={`${inp} flex-1`} value={utmInput}
                onChange={e=>setUtmInput(e.target.value.replace(/\D/g,''))}
                onKeyDown={e=>e.key==='Enter'&&aplicarUtm()}
                placeholder={String(UTM_DEFAULT)} />
              <button onClick={aplicarUtm} className="px-4 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-bold text-sm rounded-xl hover:opacity-90 transition-all">
                Aplicar
              </button>
            </div>
            <p className="text-[10px] text-slate-400 mt-1">UTM activa: <strong>${utm.toLocaleString('es-CL')}</strong> · Actualizar según tabla SII mensual</p>
          </div>
          <button onClick={()=>setModalTramos(true)}
            className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm rounded-xl transition-colors whitespace-nowrap">
            📊 Ver tabla tramos IUT
          </button>
          <div className="flex-1 min-w-[150px]">
            <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Empresa</p>
            <select className={inp} value={filtroEmpresa} onChange={e=>{setFiltroEmpresa(e.target.value);setPagina(1);}}>
              <option value="">Todas</option>
              {EMPRESAS.map(e=><option key={e}>{e}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* ── Stats ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          ['Trabajadores en nómina', filtrados.length,                   'text-purple-600', false],
          ['Con impuesto 2ª Cat.',   conImpuesto,                        conImpuesto>0?'text-purple-600':'text-slate-400', false],
          ['Total IUT año '+anio,    `$${Math.round(totalIUTAnual/1000)}K`, 'text-purple-700', true],
          ['Renta imponible anual',  `$${Math.round(totalRentaAnual/1000000).toFixed(1)}M`, 'text-slate-700', true],
        ].map(([l,v,c,m])=>(
          <div key={l} className="rounded-2xl px-5 py-4" style={{background:"#fff", border:"1px solid rgba(0,0,0,0.06)", boxShadow:"0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(124,58,237,0.04)"}}>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">{l}</p>
            <p className={`${m?'text-2xl':'text-4xl'} font-black ${c} mt-1`}>{v}</p>
          </div>
        ))}
      </div>

      {/* ── Tabla resumen por trabajador ── */}
      <div className="rounded-2xl overflow-hidden" style={{background:"#fff", border:"1px solid rgba(0,0,0,0.06)", boxShadow:"0 2px 8px rgba(0,0,0,0.05), 0 8px 24px rgba(124,58,237,0.04)"}}>
        <div className="px-5 py-4 flex items-center justify-between" style={{background:"linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)"}}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z"/></svg>
            </div>
            <div>
              <h2 className="text-base font-black text-white flex items-center gap-2">
                Impuesto 2ª Categoría — {anio}
                <span className="text-xs bg-white/20 text-white/90 px-2 py-0.5 rounded-full">{filtrados.length}</span>
              </h2>
              <p className="text-xs text-white/70 mt-0.5">Art. 42 N°1 LIR · UTM ${utm.toLocaleString('es-CL')} · Certificado 1887</p>
            </div>
          </div>
        </div>

        {/* Filtro búsqueda */}
        <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/50">
          <div className="relative max-w-sm">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z"/></svg>
            <input className="w-full pl-9 pr-4 py-2 border-2 border-slate-200 rounded-xl text-sm focus:outline-none focus:border-purple-400 bg-white" placeholder="Buscar trabajador..." value={busqueda} onChange={e=>{setBusqueda(e.target.value);setPagina(1);}} />
          </div>
        </div>

        {filtrados.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <span className="text-4xl mb-3">📊</span>
            <p className="font-semibold text-sm">Sin liquidaciones registradas para {anio}</p>
            <p className="text-xs mt-1">Registra liquidaciones en la pestaña Remuneraciones</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[950px]">
              <thead>
                <tr style={{background:"#1e1b4b"}}>
                  {['Trabajador','Meses','Renta anual imp.','AFP anual','Salud anual','Ces.+SIS anual','IUT 2ª Cat.','Tasa aprox.','Líquido anual','Acciones'].map(h=>(
                    <th key={h} className="px-4 py-3 text-left text-[11px] font-black text-slate-300 uppercase tracking-widest">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {paginados.map(row => {
                  const ini = `${row.nombre?.[0]||''}${row.apellidoPaterno?.[0]||''}`;
                  return (
                    <tr key={row.id} className="transition-colors" style={{}} onMouseEnter={e=>e.currentTarget.style.background="#faf9ff"} onMouseLeave={e=>e.currentTarget.style.background=""}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-xl flex items-center justify-center text-white font-black text-xs flex-shrink-0" style={{background:"linear-gradient(135deg, #7c3aed, #4f46e5)", boxShadow:"0 2px 6px rgba(124,58,237,0.25)"}}>{ini}</div>
                          <div>
                            <p className="font-bold text-slate-800 text-sm">{row.nombre} {row.apellidoPaterno}</p>
                            <p className="text-[11px] text-slate-400">{row.afp||'—'} · {row._contrato?.empresa||'—'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600 text-center">{row.mesesConLiq}</td>
                      <td className="px-4 py-3 text-sm font-bold text-slate-700">${row.totalImp.toLocaleString('es-CL')}</td>
                      <td className="px-4 py-3 text-sm text-red-400">-${row.totalAfp.toLocaleString('es-CL')}</td>
                      <td className="px-4 py-3 text-sm text-red-400">-${row.totalSalud.toLocaleString('es-CL')}</td>
                      <td className="px-4 py-3 text-sm text-red-400">-${row.totalCes.toLocaleString('es-CL')}</td>
                      <td className="px-4 py-3">
                        {row.exento
                          ? <span className="text-xs font-bold bg-slate-100 text-slate-400 px-2 py-0.5 rounded-full">Exento</span>
                          : <span className="text-sm font-black text-purple-700">-${row.totalIUT.toLocaleString('es-CL')}</span>
                        }
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-black px-2 py-0.5 rounded-full ${
                          row.tasaPct===0  ? 'bg-slate-100 text-slate-400' :
                          row.tasaPct<=8   ? 'bg-blue-100 text-blue-700'  :
                          row.tasaPct<=23  ? 'bg-amber-100 text-amber-700':
                          'bg-purple-100 text-purple-700'}`}>
                          {row.tasaPct}%
                        </span>
                      </td>
                      <td className="px-4 py-3 font-black text-emerald-600 text-sm">${row.totalLiq.toLocaleString('es-CL')}</td>
                      <td className="px-4 py-3">
                        <button
                          onClick={()=>generarCertificadoAnual(row, row._contrato, row.liqs, anio, utm)}
                          className="flex items-center gap-1 px-2.5 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-700 font-bold text-xs rounded-lg transition-colors"
                          title="Certificado Anual / Form. 1887">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                          F-1887
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {totalPag > 1 && (
          <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between bg-slate-50/40">
            <p className="text-xs text-slate-400 font-medium">Mostrando {(pagina-1)*POR_PAGINA+1}–{Math.min(pagina*POR_PAGINA,filtrados.length)} de <strong>{filtrados.length}</strong></p>
            <div className="flex gap-1">
              <button disabled={pagina===1}       onClick={()=>setPagina(p=>p-1)} className="px-3 py-1.5 text-xs font-bold bg-white border-2 border-slate-200 hover:border-purple-300 hover:text-purple-600 disabled:opacity-40 rounded-xl transition-all">← Ant</button>
              <button disabled={pagina===totalPag} onClick={()=>setPagina(p=>p+1)} className="px-3 py-1.5 text-xs font-bold bg-white border-2 border-slate-200 hover:border-purple-300 hover:text-purple-600 disabled:opacity-40 rounded-xl transition-all">Sig →</button>
            </div>
          </div>
        )}
      </div>

      {/* ── Modal tabla tramos ── */}
      {modalTramos && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={()=>setModalTramos(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden">
            <div className="px-5 py-4 flex items-center justify-between" style={{background:"linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)"}}>
              <div>
                <h3 className="text-base font-black text-white">Tabla IUT 2ª Categoría</h3>
                <p className="text-xs text-white/70 mt-0.5">Art. 42 N°1 LIR · UTM ${utm.toLocaleString('es-CL')}</p>
              </div>
              <button onClick={()=>setModalTramos(false)} className="w-8 h-8 bg-white/20 hover:bg-white/30 rounded-xl flex items-center justify-center text-white transition-colors">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>
            <div className="p-5">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-800 text-white">
                    <th className="px-3 py-2 text-left text-[11px] font-black uppercase tracking-widest">Tramo UTM</th>
                    <th className="px-3 py-2 text-left text-[11px] font-black uppercase tracking-widest">Desde ($)</th>
                    <th className="px-3 py-2 text-left text-[11px] font-black uppercase tracking-widest">Hasta ($)</th>
                    <th className="px-3 py-2 text-left text-[11px] font-black uppercase tracking-widest">Tasa</th>
                  </tr>
                </thead>
                <tbody>
                  {tramosConPesos.map((t,i)=>(
                    <tr key={i} className={`${i%2===0?'bg-slate-50':''}`}>
                      <td className="px-3 py-2 font-bold text-slate-600">
                        {t.desde} – {t.hasta===Infinity?'∞':t.hasta} UTM
                      </td>
                      <td className="px-3 py-2 text-slate-600">${t.desdeP.toLocaleString('es-CL')}</td>
                      <td className="px-3 py-2 text-slate-600">{t.hastaP?`$${t.hastaP.toLocaleString('es-CL')}`:'Sin tope'}</td>
                      <td className="px-3 py-2">
                        <span className={`font-black px-2 py-0.5 rounded-full text-xs ${
                          t.tasa===0?'bg-slate-100 text-slate-500':
                          t.tasa<=0.08?'bg-blue-100 text-blue-700':
                          t.tasa<=0.23?'bg-amber-100 text-amber-700':
                          'bg-purple-100 text-purple-700'}`}>
                          {t.tasa===0?'Exento':`${Math.round(t.tasa*100)}%`}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-xs text-slate-400 mt-3">* Tabla referencial 2024. Actualizar UTM mensualmente según SII (sii.cl). La rebaja en pesos se aplica internamente en el cálculo.</p>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

function AsistenciaSection() {
  const { empresaId } = useEmpresa();
  const now   = new Date();
  const hoy   = { anio: now.getFullYear(), mes: now.getMonth(), dia: now.getDate() };
  const fmt2  = n => String(n).padStart(2,'0');
  const diaKey = fmt2(hoy.dia);

  const [vista,        setVista]        = useState('hoy');    // 'hoy' | 'historial'
  const [trabajadores, setTrabajadores] = useState([]);
  const [contratos,    setContratos]    = useState([]);
  const [marcacionesHoy, setMarcacionesHoy] = useState({});  // { docId: { entrada, salida, ... } }
  const [historial,    setHistorial]    = useState([]);
  const [loadingBase,  setLoadingBase]  = useState(true);
  const [filtroMes,    setFiltroMes]    = useState(fmt2(hoy.mes + 1));
  const [filtroAnio,   setFiltroAnio]   = useState(String(hoy.anio));
  const [busqueda,     setBusqueda]     = useState('');
  const [pagina,       setPagina]       = useState(1);
  const [editModal,    setEditModal]    = useState(null); // { trabajador, registro, docId, diaKey }
  const [confirm,      setConfirm]      = useState(null);
  const POR_PAGINA = 15;

  // ── Cargar trabajadores y contratos una sola vez ──
  useEffect(() => {
    Promise.all([
      getDocs(query(collection(db,'empresas',empresaId,'trabajadores'), orderBy('apellidoPaterno'))),
      getDocs(collection(db,'empresas',empresaId,'contratos')),
    ]).then(([tSnap, cSnap]) => {
      setTrabajadores(tSnap.docs.map(d => ({ id:d.id,...d.data() })));
      setContratos(cSnap.docs.map(d => ({ id:d.id,...d.data() })));
      setLoadingBase(false);
    });
  }, []);

  // ── Tiempo real: marcaciones del día de hoy ──
  useEffect(() => {
    if (vista !== 'hoy' || loadingBase) return;
    // Escuchar todos los docs del mes actual
    const mesStr = fmt2(hoy.mes + 1);
    const q = query(collection(db, 'empresas', empresaId, 'asistencia'));
    const unsub = onSnapshot(q, snap => {
      const m = {};
      snap.docs.forEach(d => {
        const data = d.data();
        // Filtrar solo documentos del mes y año actual
        if (String(data.anio) === String(hoy.anio) && data.mes === mesStr) {
          m[data.trabajadorId] = {
            docId:   d.id,
            entrada: data.registros?.[diaKey]?.entrada || null,
            salida:  data.registros?.[diaKey]?.salida  || null,
            gps_e:   data.registros?.[diaKey]?.gps_e   || null,
            gps_s:   data.registros?.[diaKey]?.gps_s   || null,
            modificaciones: data.modificaciones || [],
          };
        }
      });
      setMarcacionesHoy(m);
    });
    return unsub;
  }, [vista, loadingBase, hoy.anio, hoy.mes, diaKey]);

  // ── Cargar historial cuando se cambia de vista ──
  useEffect(() => {
    if (vista !== 'historial') return;
    getDocs(query(collection(db,'empresas',empresaId,'asistencia'), orderBy('anio','desc')))
      .then(snap => setHistorial(snap.docs.map(d => ({ id:d.id,...d.data() }))));
  }, [vista]);

  // ── Helpers ──
  function fmtHora(ts) {
    if (!ts) return null;
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return `${fmt2(d.getHours())}:${fmt2(d.getMinutes())}`;
  }
  function diffHoras(ts1, ts2) {
    if (!ts1 || !ts2) return null;
    const d1 = ts1.toDate ? ts1.toDate() : new Date(ts1);
    const d2 = ts2.toDate ? ts2.toDate() : new Date(ts2);
    const mins = Math.round((d2 - d1) / 60000);
    return `${Math.floor(mins/60)}h ${fmt2(mins%60)}m`;
  }

  // ── Estadísticas del día ──
  // Solo trabajadores activos que TIENEN cuenta de portal (portalUid)
  // Los que no tienen cuenta no pueden marcar, no los contamos como "sin marcar"
  const activos         = trabajadores.filter(t => !t.estado || t.estado === 'activo');
  const activosSinPortal = activos; // nombre mantenido por compatibilidad con el render
  const conPortal       = activos.filter(t => t.portalUid);
  const conEntrada      = conPortal.filter(t => marcacionesHoy[t.portalUid]?.entrada);
  const conJornada      = conPortal.filter(t => {
    const m = marcacionesHoy[t.portalUid];
    return m?.entrada && m?.salida;
  });
  const sinMarcar = conPortal.filter(t => !marcacionesHoy[t.portalUid]?.entrada);

  // ── Guardar edición con log de auditoría ──
  async function guardarEdicion({ docId, trabajadorId, dKey, entrada, salida, justificacion, adminEmail }) {
    const ref  = doc(db, 'empresas', empresaId, 'asistencia', docId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return;
    const data = snap.data();

    const regActual = data.registros?.[dKey] || {};
    const modLog = {
      campo:        `registros.${dKey}`,
      valorAntes:   { entrada: regActual.entrada || null, salida: regActual.salida || null },
      valorDespues: { entrada, salida },
      justificacion,
      modificadoPor: adminEmail || 'admin',
      timestamp:     serverTimestamp(),
    };

    await updateDoc(ref, {
      [`registros.${dKey}.entrada`]: entrada,
      [`registros.${dKey}.salida`]:  salida,
      modificaciones: [...(data.modificaciones || []), modLog],
    });
    setEditModal(null);
  }

  // ── Componente modal de edición ──
  function ModalEdicion({ item, onClose }) {
    const [entrada,      setEntrada]      = useState(item.entrada      ? fmtHora(item.entrada)      : '');
    const [salida,       setSalida]       = useState(item.salida       ? fmtHora(item.salida)       : '');
    const [justificacion,setJustificacion]= useState('');
    const [saving,       setSaving]       = useState(false);
    const [error,        setError]        = useState('');

    async function handleSave() {
      if (!justificacion.trim()) { setError('La justificación es obligatoria para modificar un registro.'); return; }
      setSaving(true);
      try {
        // Convertir HH:MM a timestamp del mismo día
        function toTs(horaStr) {
          if (!horaStr) return null;
          const [h, m] = horaStr.split(':').map(Number);
          const d = new Date(hoy.anio, hoy.mes, parseInt(item.diaKey));
          d.setHours(h, m, 0, 0);
          return d;
        }
        await guardarEdicion({
          docId:         item.docId,
          trabajadorId:  item.trabajadorUid,
          dKey:          item.diaKey,
          entrada:       toTs(entrada),
          salida:        toTs(salida),
          justificacion: justificacion.trim(),
          adminEmail:    'admin@mpf.cl',
        });
      } catch(e) { setError('Error al guardar: ' + e.message); }
      finally { setSaving(false); }
    }

    const inp2 = 'w-full border-2 border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-purple-400 bg-white transition-colors';

    return (
      <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose}/>
        <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{background:'rgba(124,58,237,0.08)',border:'1px solid rgba(124,58,237,0.15)'}}>
              <svg className="w-5 h-5 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
            </div>
            <div>
              <h3 className="font-black text-slate-900 text-base">Editar registro</h3>
              <p className="text-xs text-slate-400">{item.nombre} · {item.diaKey}/{fmt2(hoy.mes+1)}/{hoy.anio}</p>
            </div>
          </div>

          <div className="space-y-3 mb-4">
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Hora entrada</label>
              <input type="time" className={inp2} value={entrada} onChange={e=>setEntrada(e.target.value)}/>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Hora salida</label>
              <input type="time" className={inp2} value={salida} onChange={e=>setSalida(e.target.value)}/>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                Justificación <span className="text-red-400">*</span>
              </label>
              <textarea
                className={`${inp2} resize-none`} rows={3}
                placeholder="Motivo de la modificación (ej: el trabajador olvidó marcar salida)"
                value={justificacion} onChange={e=>setJustificacion(e.target.value)}
              />
              <p className="text-[10px] text-slate-400 mt-1">Queda registrado en el log de auditoría para fiscalización DT.</p>
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 text-xs text-red-700 font-medium mb-3">
              <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              {error}
            </div>
          )}

          {/* Log auditoría previo */}
          {item.modificaciones?.length > 0 && (
            <div className="mb-4 border border-slate-100 rounded-xl overflow-hidden">
              <div className="px-3 py-2 bg-slate-50 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Historial de cambios ({item.modificaciones.length})
              </div>
              <div className="max-h-28 overflow-y-auto divide-y divide-slate-50">
                {item.modificaciones.slice(-3).map((m,i) => (
                  <div key={i} className="px-3 py-2">
                    <p className="text-xs text-slate-600 font-medium">{m.justificacion}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">{m.modificadoPor}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <button onClick={onClose} className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-sm transition-colors">Cancelar</button>
            <button onClick={handleSave} disabled={saving} className="flex-1 py-2.5 text-white font-bold rounded-xl text-sm transition-all disabled:opacity-50" style={{background:'linear-gradient(135deg,#7c3aed,#4f46e5)',boxShadow:'0 4px 12px rgba(124,58,237,0.3)'}}>
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Vista HOY ──
  const activosFiltradosHoy = activosSinPortal.filter(t => {
    const q = busqueda.toLowerCase();
    return !q || `${t.nombre} ${t.apellidoPaterno} ${t.rut||''}`.toLowerCase().includes(q);
  });

  // ── Vista HISTORIAL ──
  const enriquecidos = historial.map(r => {
    const trabajador = trabajadores.find(t => t.id === r.trabajadorId || t.portalUid === r.trabajadorId);
    const contrato   = contratos.find(c => c.trabajadorId === (trabajador?.id));
    return { ...r, _trabajador: trabajador, _contrato: contrato };
  }).filter(r => {
    const q = busqueda.toLowerCase();
    const nombre = `${r._trabajador?.nombre||''} ${r._trabajador?.apellidoPaterno||''}`.toLowerCase();
    return (
      (!filtroMes  || r.mes  === filtroMes) &&
      (!filtroAnio || String(r.anio) === filtroAnio) &&
      (!busqueda   || nombre.includes(q) || r._trabajador?.rut?.includes(busqueda))
    );
  });
  const totalPag  = Math.ceil(enriquecidos.length / POR_PAGINA);
  const paginados = enriquecidos.slice((pagina-1)*POR_PAGINA, pagina*POR_PAGINA);

  return (
    <>
      {/* ── HEADER con toggle de vista ── */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-black text-slate-900 tracking-tight">Asistencia</h2>
          <p className="text-xs text-slate-400 mt-0.5">Art. 22 CT · Registro electrónico de jornada</p>
        </div>
        <div className="flex gap-1.5 p-1 rounded-xl" style={{background:'rgba(0,0,0,0.04)'}}>
          {[
            { id:'hoy',       label:'Hoy en tiempo real' },
            { id:'historial', label:'Historial mensual'  },
          ].map(v => (
            <button key={v.id} onClick={() => { setVista(v.id); setBusqueda(''); setPagina(1); }}
              className="px-4 py-2 rounded-lg text-xs font-bold transition-all"
              style={vista === v.id
                ? {background:'linear-gradient(135deg,#7c3aed,#4f46e5)',color:'#fff',boxShadow:'0 2px 8px rgba(124,58,237,0.3)'}
                : {color:'#64748b'}
              }>
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {/* ════════════════════════════════
          VISTA: HOY EN TIEMPO REAL
      ════════════════════════════════ */}
      {vista === 'hoy' && (
        <>
          {/* Stats del día */}
          <div className="grid grid-cols-3 gap-3 mb-5">
            {[
              { label:'Sin marcar',   value: sinMarcar.length,   color:'text-red-500',     bg:'bg-red-50 border-red-100',     dot:'bg-red-400' },
              { label:'En jornada',   value: conEntrada.length - conJornada.length, color:'text-amber-600', bg:'bg-amber-50 border-amber-100', dot:'bg-amber-400' },
              { label:'Jornada completa', value: conJornada.length, color:'text-emerald-600', bg:'bg-emerald-50 border-emerald-100', dot:'bg-emerald-400' },
            ].map(s => (
              <div key={s.label} className={`rounded-2xl px-4 py-3 border ${s.bg}`}>
                <div className="flex items-center gap-1.5 mb-1">
                  <div className={`w-2 h-2 rounded-full ${s.dot}`}/>
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{s.label}</span>
                </div>
                <p className={`text-3xl font-black ${s.color}`}>{s.value}</p>
              </div>
            ))}
          </div>

          {/* Alerta si hay trabajadores sin marcar */}
          {sinMarcar.length > 0 && (
            <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 mb-5">
              <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse flex-shrink-0"/>
              <p className="text-sm font-semibold text-amber-800">
                {sinMarcar.length} trabajador{sinMarcar.length > 1 ? 'es' : ''} aún no {sinMarcar.length > 1 ? 'han marcado' : 'ha marcado'} entrada hoy
              </p>
            </div>
          )}

          {/* Búsqueda */}
          <div className="relative mb-4">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z"/></svg>
            <input className="w-full pl-9 pr-4 py-2.5 border-2 border-slate-200 rounded-xl text-sm focus:outline-none focus:border-purple-400 bg-white" placeholder="Buscar trabajador..." value={busqueda} onChange={e=>setBusqueda(e.target.value)}/>
          </div>

          {/* Tabla tiempo real */}
          <div className="rounded-2xl overflow-hidden" style={{background:'#fff',border:'1px solid rgba(0,0,0,0.06)',boxShadow:'0 2px 8px rgba(0,0,0,0.05)'}}>
            <div className="px-5 py-3 flex items-center justify-between" style={{background:'linear-gradient(135deg,#1e1b4b,#312e81)'}}>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"/>
                <span className="text-sm font-black text-white">
                  {now.toLocaleDateString('es-CL',{weekday:'long',day:'numeric',month:'long'})}
                </span>
              </div>
              <span className="text-xs text-white/60">{activosFiltradosHoy.length} trabajadores activos</span>
            </div>

            {loadingBase ? (
              <div className="flex items-center justify-center py-16">
                <div className="w-8 h-8 rounded-full animate-spin" style={{border:'2px solid rgba(124,58,237,0.15)',borderTopColor:'#7c3aed'}}/>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px]">
                  <thead>
                    <tr style={{background:'#1e1b4b'}}>
                      {['Trabajador','Estado','Entrada','Salida','Horas','Acciones'].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-[11px] font-black text-slate-300 uppercase tracking-widest">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {activosFiltradosHoy.map(t => {
                      // portalUid = uid de Firebase Auth = key en marcacionesHoy
                      const uid  = t.portalUid;
                      const marc = uid ? (marcacionesHoy[uid] || {}) : {};
                      const ini  = `${t.nombre?.[0]||''}${t.apellidoPaterno?.[0]||''}`.toUpperCase();
                      const nombre = `${t.nombre} ${t.apellidoPaterno}`.trim();

                      let estadoBadge, estadoLabel;
                      if (!uid) {
                        estadoBadge = 'bg-slate-100 text-slate-400';
                        estadoLabel = '○ Sin cuenta';
                      } else if (marc.entrada && marc.salida) {
                        estadoBadge = 'bg-emerald-100 text-emerald-700';
                        estadoLabel = '✓ Completa';
                      } else if (marc.entrada) {
                        estadoBadge = 'bg-amber-100 text-amber-700';
                        estadoLabel = '● En jornada';
                      } else {
                        estadoBadge = 'bg-red-100 text-red-600';
                        estadoLabel = '— Sin marcar';
                      }

                      return (
                        <tr key={t.id} className="transition-colors" onMouseEnter={e=>e.currentTarget.style.background='#faf9ff'} onMouseLeave={e=>e.currentTarget.style.background=''}>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-xl flex items-center justify-center text-white font-black text-xs flex-shrink-0" style={{background:'linear-gradient(135deg,#7c3aed,#4f46e5)'}}>{ini}</div>
                              <div>
                                <p className="font-bold text-slate-800 text-sm">{nombre}</p>
                                <p className="text-[11px] text-slate-400 font-mono">{t.rut||'—'}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex px-2.5 py-1 rounded-full text-[11px] font-bold ${estadoBadge}`}>{estadoLabel}</span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="font-mono text-sm font-semibold text-slate-700">
                              {marc.entrada ? fmtHora(marc.entrada) : <span className="text-slate-300">—</span>}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="font-mono text-sm font-semibold text-slate-700">
                              {marc.salida ? fmtHora(marc.salida) : <span className="text-slate-300">—</span>}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="font-mono text-sm text-emerald-600 font-semibold">
                              {marc.entrada && marc.salida ? diffHoras(marc.entrada, marc.salida) : <span className="text-slate-300">—</span>}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {marc.docId && (
                              <button
                                onClick={() => setEditModal({
                                  nombre, diaKey, docId: marc.docId,
                                  trabajadorUid: uid,
                                  entrada: marc.entrada,
                                  salida:  marc.salida,
                                  modificaciones: marc.modificaciones || [],
                                })}
                                className="p-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-lg transition-colors"
                                title="Editar registro con justificación"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* ════════════════════════════════
          VISTA: HISTORIAL MENSUAL
      ════════════════════════════════ */}
      {vista === 'historial' && (
        <>
          <div className="rounded-2xl overflow-hidden mb-2" style={{background:'#fff',border:'1px solid rgba(0,0,0,0.06)',boxShadow:'0 2px 8px rgba(0,0,0,0.05)'}}>
            <div className="px-5 py-4 flex items-center justify-between" style={{background:'linear-gradient(135deg,#1e1b4b,#312e81)'}}>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center">
                  <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                </div>
                <div>
                  <h2 className="text-base font-black text-white">Historial de asistencia</h2>
                  <p className="text-xs text-white/70 mt-0.5">Art. 22 CT · Horas extra Art. 31–32 CT</p>
                </div>
              </div>
            </div>

            {/* Filtros historial */}
            <div className="px-5 py-3 border-b flex flex-wrap gap-2" style={{borderColor:'rgba(0,0,0,0.05)',background:'rgba(248,248,252,0.8)'}}>
              <select className="px-3 py-2 border-2 border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:border-purple-400" value={filtroMes} onChange={e=>{setFiltroMes(e.target.value);setPagina(1);}}>
                <option value="">Todos los meses</option>
                {MESES.map((m,i) => <option key={m} value={fmt2(i+1)}>{m}</option>)}
              </select>
              <select className="px-3 py-2 border-2 border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:border-purple-400" value={filtroAnio} onChange={e=>{setFiltroAnio(e.target.value);setPagina(1);}}>
                {[2023,2024,2025,2026].map(y => <option key={y}>{y}</option>)}
              </select>
              <div className="relative flex-1 min-w-[150px]">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z"/></svg>
                <input className="w-full pl-9 pr-4 py-2 border-2 border-slate-200 rounded-xl text-sm focus:outline-none focus:border-purple-400 bg-white" placeholder="Buscar trabajador..." value={busqueda} onChange={e=>{setBusqueda(e.target.value);setPagina(1);}}/>
              </div>
            </div>

            {paginados.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                <svg className="w-12 h-12 opacity-20 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                <p className="font-semibold text-sm">Sin registros para este período</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[700px]">
                  <thead>
                    <tr style={{background:'#1e1b4b'}}>
                      {['Trabajador','Período','Días registrados','Modificaciones','Acciones'].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-[11px] font-black text-slate-300 uppercase tracking-widest">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {paginados.map(row => {
                      const ini = `${row._trabajador?.nombre?.[0]||''}${row._trabajador?.apellidoPaterno?.[0]||''}`;
                      const diasConEntrada = Object.values(row.registros||{}).filter(r => r.entrada).length;
                      const mods = (row.modificaciones||[]).length;
                      return (
                        <tr key={row.id} className="transition-colors" onMouseEnter={e=>e.currentTarget.style.background='#faf9ff'} onMouseLeave={e=>e.currentTarget.style.background=''}>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-xl flex items-center justify-center text-white font-black text-xs" style={{background:'linear-gradient(135deg,#7c3aed,#4f46e5)'}}>{ini}</div>
                              <div>
                                <p className="font-bold text-slate-800 text-sm">{row._trabajador?.nombre||'—'} {row._trabajador?.apellidoPaterno||''}</p>
                                <p className="text-[11px] text-slate-400 font-mono">{row._trabajador?.rut||'—'}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm font-bold text-slate-600">{MESES[parseInt(row.mes)-1]||'—'} {row.anio}</td>
                          <td className="px-4 py-3">
                            <span className="text-lg font-black text-emerald-600">{diasConEntrada}</span>
                            <span className="text-xs text-slate-400 ml-1">días</span>
                          </td>
                          <td className="px-4 py-3">
                            {mods > 0
                              ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-700">
                                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
                                  {mods} cambio{mods>1?'s':''}
                                </span>
                              : <span className="text-xs text-slate-300">Sin cambios</span>
                            }
                          </td>
                          <td className="px-4 py-3">
                            <button onClick={() => exportarAsistenciaCSV(row._trabajador, row._contrato, row.registros||{}, row.mes, row.anio)}
                              className="p-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 rounded-lg transition-colors" title="Exportar CSV">
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {totalPag > 1 && (
              <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between bg-slate-50/40">
                <p className="text-xs text-slate-400">Mostrando {(pagina-1)*POR_PAGINA+1}–{Math.min(pagina*POR_PAGINA,enriquecidos.length)} de <strong>{enriquecidos.length}</strong></p>
                <div className="flex gap-1">
                  <button disabled={pagina===1}        onClick={()=>setPagina(p=>p-1)} className="px-3 py-1.5 text-xs font-bold bg-white border-2 border-slate-200 hover:border-purple-300 hover:text-purple-600 disabled:opacity-40 rounded-xl">← Ant</button>
                  <button disabled={pagina===totalPag}  onClick={()=>setPagina(p=>p+1)} className="px-3 py-1.5 text-xs font-bold bg-white border-2 border-slate-200 hover:border-purple-300 hover:text-purple-600 disabled:opacity-40 rounded-xl">Sig →</button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* Modal edición con justificación */}
      {editModal && <ModalEdicion item={editModal} onClose={() => setEditModal(null)} />}
    </>
  );
}


function Organigrama({ trabajadores, contratos, filtroEmpresa }) {
  const activos = trabajadores.filter(t =>
    t.estado === 'activo' && (!filtroEmpresa || t.empresa === filtroEmpresa)
  );

  const porArea = AREAS.map(area => {
    const miembros = activos.filter(t => t.area === area);
    return { area, miembros };
  }).filter(g => g.miembros.length > 0);

  if (porArea.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-slate-400">
        <span className="text-4xl mb-3">🏢</span>
        <p className="font-semibold text-sm">Sin personal activo{filtroEmpresa ? ` en ${filtroEmpresa}` : ''}</p>
      </div>
    );
  }

  const colores = ['#7c3aed','#4f46e5','#0ea5e9','#10b981','#f59e0b','#f43f5e'];

  return (
    <div className="space-y-6">
      {porArea.map(({ area, miembros }, aIdx) => {
        const color = COLORES_AREA[area] || { bg: colores[aIdx % colores.length], light: '#f8f8ff', text: '#334155' };
        return (
          <div key={area}>
            {/* Cabecera de área */}
            <div className="flex items-center gap-3 mb-3">
              <div className="h-8 px-4 rounded-xl flex items-center gap-2 text-white text-xs font-black"
                style={{ background: color.bg }}>
                {area}
                <span className="bg-white/25 px-1.5 py-0.5 rounded-full text-[10px]">{miembros.length}</span>
              </div>
              <div className="flex-1 h-px" style={{ background: color.bg, opacity: 0.2 }} />
            </div>

            {/* Tarjetas de trabajadores */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {miembros.map(t => {
                const contrato = contratos.find(c => c.trabajadorId === t.id && c.estado === 'vigente');
                const ini = `${t.nombre?.[0] || ''}${t.apellidoPaterno?.[0] || ''}`.toUpperCase();
                return (
                  <div key={t.id} className="rounded-xl p-3.5 border transition-shadow hover:shadow-md"
                    style={{ background: color.light, borderColor: color.bg + '33' }}>
                    <div className="flex items-center gap-2.5 mb-2">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-black text-xs flex-shrink-0"
                        style={{ background: color.bg }}>
                        {ini}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-black text-slate-800 truncate">{t.nombre} {t.apellidoPaterno}</p>
                        <p className="text-[10px] font-medium truncate" style={{ color: color.text }}>
                          {contrato?.cargo || t.cargo || 'Sin cargo'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-slate-400 font-medium">{t.empresa || '—'}</span>
                      {contrato?.sueldoBase && (
                        <span className="text-[10px] font-black" style={{ color: color.text }}>
                          ${parseInt(contrato.sueldoBase).toLocaleString('es-CL')}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function BandasSection({ trabajadores, contratos, bandas, onReload }) {
  const { empresaId } = useEmpresa();
  const [form,      setForm]      = useState({ nivel: '', cargo: '', sueldoMin: '', sueldoMax: '', area: '' });
  const [saving,    setSaving]    = useState(false);
  const [editId,    setEditId]    = useState(null);
  const [confirm,   setConfirm]   = useState(null);

  const activos = trabajadores.filter(t => t.estado === 'activo');

  const handleSave = async () => {
    if (!form.nivel || !form.cargo || !form.sueldoMin || !form.sueldoMax) {
      alert('Completa nivel, cargo y rango salarial.'); return;
    }
    setSaving(true);
    try {
      const payload = {
        nivel:     form.nivel,
        cargo:     form.cargo,
        area:      form.area,
        sueldoMin: parseInt(form.sueldoMin) || 0,
        sueldoMax: parseInt(form.sueldoMax) || 0,
        updatedAt: serverTimestamp(),
      };
      if (editId) {
        await updateDoc(doc(db, 'empresas', empresaId, 'bandas_salariales', editId), payload);
      } else {
        await addDoc(collection(db, 'empresas', empresaId, 'bandas_salariales'), { ...payload, createdAt: serverTimestamp() });
      }
      setForm({ nivel: '', cargo: '', sueldoMin: '', sueldoMax: '', area: '' });
      setEditId(null);
      onReload();
    } catch(e) { alert('Error: ' + e.message); }
    setSaving(false);
  };

  const handleEdit = (b) => {
    setForm({ nivel: b.nivel, cargo: b.cargo, sueldoMin: String(b.sueldoMin), sueldoMax: String(b.sueldoMax), area: b.area || '' });
    setEditId(b.id);
  };

  const handleDelete = async () => {
    try { await deleteDoc(doc(db, 'empresas', empresaId, 'bandas_salariales', confirm.id)); onReload(); }
    catch(e) { alert('Error: ' + e.message); }
    setConfirm(null);
  };

  // Para cada banda calcular cuántos trabajadores están dentro del rango
  const bandasConPersonal = bandas.map(b => {
    const dentro = activos.filter(t => {
      const c = contratos.find(c => c.trabajadorId === t.id && c.estado === 'vigente');
      if (!c?.sueldoBase) return false;
      const s = parseInt(c.sueldoBase);
      return s >= b.sueldoMin && s <= b.sueldoMax &&
        (!b.area || t.area === b.area);
    });
    return { ...b, _dentro: dentro };
  });

  const fmt = n => `$${(n||0).toLocaleString('es-CL')}`;

  return (
    <div className="space-y-5">

      {/* Formulario */}
      <div className="rounded-xl border border-slate-200 p-4 bg-slate-50/50">
        <p className="text-xs font-black text-slate-500 uppercase tracking-widest mb-3">
          {editId ? '✏️ Editando banda' : '+ Nueva banda salarial'}
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <input className={inp} placeholder="Nivel (ej: N1)" value={form.nivel}
            onChange={e => setForm(f => ({ ...f, nivel: e.target.value }))} />
          <input className={inp} placeholder="Cargo tipo" value={form.cargo}
            onChange={e => setForm(f => ({ ...f, cargo: e.target.value }))} />
          <select className={inp} value={form.area} onChange={e => setForm(f => ({ ...f, area: e.target.value }))}>
            <option value="">Todas las áreas</option>
            {AREAS.map(a => <option key={a}>{a}</option>)}
          </select>
          <input className={inp} type="number" placeholder="Sueldo mínimo" value={form.sueldoMin}
            onChange={e => setForm(f => ({ ...f, sueldoMin: e.target.value }))} />
          <input className={inp} type="number" placeholder="Sueldo máximo" value={form.sueldoMax}
            onChange={e => setForm(f => ({ ...f, sueldoMax: e.target.value }))} />
        </div>
        <div className="flex gap-2 mt-3">
          <button onClick={handleSave} disabled={saving}
            className="px-4 py-2 text-white font-bold text-sm rounded-xl disabled:opacity-50 transition-all active:scale-95"
            style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)', boxShadow: '0 4px 12px rgba(124,58,237,0.25)' }}>
            {saving ? 'Guardando…' : editId ? 'Actualizar' : 'Agregar banda'}
          </button>
          {editId && (
            <button onClick={() => { setEditId(null); setForm({ nivel:'', cargo:'', sueldoMin:'', sueldoMax:'', area:'' }); }}
              className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-sm rounded-xl transition-colors">
              Cancelar
            </button>
          )}
        </div>
      </div>

      {/* Tabla de bandas */}
      {bandasConPersonal.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-slate-400">
          <span className="text-3xl mb-2">📊</span>
          <p className="text-sm font-semibold">Sin bandas salariales definidas</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-100">
          <table className="w-full min-w-[600px]">
            <thead>
              <tr style={{ background: '#1e1b4b' }}>
                {['Nivel','Cargo tipo','Área','Rango salarial','Personal en banda','Acciones'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-[11px] font-black text-slate-300 uppercase tracking-widest">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {bandasConPersonal.map(b => {
                const rango = b.sueldoMax - b.sueldoMin;
                return (
                  <tr key={b.id} className="transition-colors hover:bg-slate-50/60">
                    <td className="px-4 py-3">
                      <span className="text-xs font-black px-2 py-1 rounded-lg bg-violet-100 text-violet-700">{b.nivel}</span>
                    </td>
                    <td className="px-4 py-3 text-sm font-bold text-slate-700">{b.cargo}</td>
                    <td className="px-4 py-3 text-sm text-slate-500">{b.area || 'Todas'}</td>
                    <td className="px-4 py-3">
                      <div>
                        <p className="text-sm font-bold text-slate-700">{fmt(b.sueldoMin)} — {fmt(b.sueldoMax)}</p>
                        <div className="w-full h-1.5 bg-slate-100 rounded-full mt-1.5 overflow-hidden">
                          <div className="h-full rounded-full bg-gradient-to-r from-violet-400 to-indigo-400" style={{ width: '100%' }} />
                        </div>
                        <p className="text-[10px] text-slate-400 mt-0.5">Amplitud: {fmt(rango)}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className={`text-lg font-black ${b._dentro.length > 0 ? 'text-emerald-600' : 'text-slate-300'}`}>
                          {b._dentro.length}
                        </span>
                        {b._dentro.length > 0 && (
                          <div className="flex -space-x-1">
                            {b._dentro.slice(0, 4).map(t => (
                              <div key={t.id} className="w-6 h-6 rounded-full bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center text-white text-[9px] font-black border-2 border-white"
                                title={`${t.nombre} ${t.apellidoPaterno}`}>
                                {t.nombre?.[0]}{t.apellidoPaterno?.[0]}
                              </div>
                            ))}
                            {b._dentro.length > 4 && (
                              <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center text-slate-500 text-[9px] font-black border-2 border-white">
                                +{b._dentro.length - 4}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button onClick={() => handleEdit(b)} className="p-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-lg transition-colors" title="Editar">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
                        </button>
                        <button onClick={() => setConfirm(b)} className="p-1.5 bg-red-50 hover:bg-red-100 text-red-500 rounded-lg transition-colors" title="Eliminar">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Confirm delete */}
      {confirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setConfirm(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full">
            <h3 className="text-base font-black text-slate-900 text-center">¿Eliminar banda?</h3>
            <p className="text-sm text-slate-500 text-center mt-1 mb-5">Se eliminará la banda <strong>{confirm.nivel} — {confirm.cargo}</strong>.</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirm(null)} className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-sm">Cancelar</button>
              <button onClick={handleDelete} className="flex-1 py-2.5 text-white font-bold rounded-xl text-sm" style={{ background: 'linear-gradient(135deg, #ef4444, #e11d48)', boxShadow: '0 4px 12px rgba(239,68,68,0.3)' }}>Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CentrosCostoSection({ trabajadores, contratos, liquidaciones, centros, onReload }) {
  const { empresaId } = useEmpresa();
  const [form,    setForm]    = useState({ codigo: '', nombre: '', descripcion: '', presupuesto: '' });
  const [saving,  setSaving]  = useState(false);
  const [editId,  setEditId]  = useState(null);
  const [confirm, setConfirm] = useState(null);

  const activos = trabajadores.filter(t => t.estado === 'activo');
  const fmt = n => `$${(n||0).toLocaleString('es-CL')}`;

  const handleSave = async () => {
    if (!form.codigo || !form.nombre) { alert('Completa código y nombre.'); return; }
    setSaving(true);
    try {
      const payload = {
        codigo:       form.codigo.toUpperCase(),
        nombre:       form.nombre,
        descripcion:  form.descripcion,
        presupuesto:  parseInt(form.presupuesto) || 0,
        updatedAt:    serverTimestamp(),
      };
      if (editId) {
        await updateDoc(doc(db, 'empresas', empresaId, 'centros_costo', editId), payload);
      } else {
        await addDoc(collection(db, 'empresas', empresaId, 'centros_costo'), { ...payload, createdAt: serverTimestamp() });
      }
      setForm({ codigo: '', nombre: '', descripcion: '', presupuesto: '' });
      setEditId(null);
      onReload();
    } catch(e) { alert('Error: ' + e.message); }
    setSaving(false);
  };

  const handleEdit = (c) => {
    setForm({ codigo: c.codigo, nombre: c.nombre, descripcion: c.descripcion || '', presupuesto: String(c.presupuesto || '') });
    setEditId(c.id);
  };

  const handleDelete = async () => {
    try { await deleteDoc(doc(db, 'empresas', empresaId, 'centros_costo', confirm.id)); onReload(); }
    catch(e) { alert('Error: ' + e.message); }
    setConfirm(null);
  };

  // Calcular costo real por centro de costo basado en liquidaciones
  const centrosConData = centros.map(cc => {
    // Trabajadores asignados al centro
    const asignados = activos.filter(t => t.centroCosto === cc.codigo || t.centroCosto === cc.id);

    // Sumar liquidaciones del último mes de los trabajadores asignados
    const hoy   = new Date();
    const mesAct = String(hoy.getMonth() + 1).padStart(2, '0');
    const anioAct= String(hoy.getFullYear());
    const costoMes = asignados.reduce((sum, t) => {
      const contrato = contratos.find(c => c.trabajadorId === t.id && c.estado === 'vigente');
      if (!contrato) return sum;
      const liq = liquidaciones.find(l => l.trabajadorId === t.id && l.mes === mesAct && l.anio === anioAct);
      if (!liq) return sum + (parseInt(contrato.sueldoBase) || 0);
      const calc = calcularLiquidacion({ ...contrato, ...liq });
      return sum + calc.imponible + calc.noImponible;
    }, 0);

    const pct = cc.presupuesto > 0 ? Math.min(100, Math.round((costoMes / cc.presupuesto) * 100)) : 0;
    return { ...cc, _asignados: asignados, _costoMes: costoMes, _pct: pct };
  });

  // Stats resumen
  const totalPresupuesto = centros.reduce((s, c) => s + (c.presupuesto || 0), 0);
  const totalCosto       = centrosConData.reduce((s, c) => s + c._costoMes, 0);
  const totalPersonal    = centrosConData.reduce((s, c) => s + c._asignados.length, 0);

  return (
    <div className="space-y-5">

      {/* KPIs resumen */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Centros definidos',    value: centros.length,      color: 'text-violet-600', mono: false },
          { label: 'Presupuesto total',    value: fmt(totalPresupuesto),color: 'text-slate-700',  mono: true  },
          { label: 'Costo mes actual',     value: fmt(totalCosto),      color: totalCosto > totalPresupuesto ? 'text-red-500' : 'text-emerald-600', mono: true },
        ].map(({ label, value, color, mono }) => (
          <div key={label} className="rounded-xl px-4 py-3.5 border border-slate-100 bg-white shadow-sm">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{label}</p>
            <p className={`${mono ? 'text-xl' : 'text-3xl'} font-black ${color} mt-1`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Formulario */}
      <div className="rounded-xl border border-slate-200 p-4 bg-slate-50/50">
        <p className="text-xs font-black text-slate-500 uppercase tracking-widest mb-3">
          {editId ? '✏️ Editando centro' : '+ Nuevo centro de costo'}
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <input className={inp} placeholder="Código (ej: OBR-01)" value={form.codigo}
            onChange={e => setForm(f => ({ ...f, codigo: e.target.value }))} />
          <input className={inp} placeholder="Nombre del centro" value={form.nombre}
            onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} />
          <input className={inp} placeholder="Descripción (opcional)" value={form.descripcion}
            onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} />
          <input className={inp} type="number" placeholder="Presupuesto mensual" value={form.presupuesto}
            onChange={e => setForm(f => ({ ...f, presupuesto: e.target.value }))} />
        </div>
        <div className="flex gap-2 mt-3">
          <button onClick={handleSave} disabled={saving}
            className="px-4 py-2 text-white font-bold text-sm rounded-xl disabled:opacity-50 transition-all active:scale-95"
            style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)', boxShadow: '0 4px 12px rgba(124,58,237,0.25)' }}>
            {saving ? 'Guardando…' : editId ? 'Actualizar' : 'Agregar centro'}
          </button>
          {editId && (
            <button onClick={() => { setEditId(null); setForm({ codigo:'', nombre:'', descripcion:'', presupuesto:'' }); }}
              className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-sm rounded-xl transition-colors">
              Cancelar
            </button>
          )}
        </div>
      </div>

      {/* Tarjetas de centros */}
      {centrosConData.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-slate-400">
          <span className="text-3xl mb-2">🏗️</span>
          <p className="text-sm font-semibold">Sin centros de costo definidos</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {centrosConData.map(cc => {
            const sobrePpto = cc.presupuesto > 0 && cc._costoMes > cc.presupuesto;
            const barColor  = sobrePpto ? '#ef4444' : cc._pct > 80 ? '#f59e0b' : '#7c3aed';
            return (
              <div key={cc.id} className="rounded-xl border p-4 bg-white shadow-sm transition-shadow hover:shadow-md"
                style={{ borderColor: sobrePpto ? '#fecaca' : 'rgba(0,0,0,0.06)' }}>
                {/* Header centro */}
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-black px-2 py-0.5 rounded-lg bg-violet-100 text-violet-700">{cc.codigo}</span>
                      {sobrePpto && <span className="text-[10px] font-black px-2 py-0.5 rounded-lg bg-red-100 text-red-600">⚠ Sobre presupuesto</span>}
                    </div>
                    <p className="text-sm font-black text-slate-800 mt-1">{cc.nombre}</p>
                    {cc.descripcion && <p className="text-[11px] text-slate-400">{cc.descripcion}</p>}
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => handleEdit(cc)} className="p-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-lg transition-colors">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
                    </button>
                    <button onClick={() => setConfirm(cc)} className="p-1.5 bg-red-50 hover:bg-red-100 text-red-500 rounded-lg transition-colors">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                    </button>
                  </div>
                </div>

                {/* Barra presupuesto */}
                {cc.presupuesto > 0 && (
                  <div className="mb-3">
                    <div className="flex justify-between text-[11px] mb-1">
                      <span className="text-slate-400 font-medium">Ejecución mes actual</span>
                      <span className="font-black" style={{ color: barColor }}>{cc._pct}%</span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(cc._pct, 100)}%`, background: barColor }} />
                    </div>
                    <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                      <span>Costo: <strong className="text-slate-600">{fmt(cc._costoMes)}</strong></span>
                      <span>Ppto: <strong className="text-slate-600">{fmt(cc.presupuesto)}</strong></span>
                    </div>
                  </div>
                )}

                {/* Personal */}
                <div className="flex items-center justify-between pt-2.5 border-t border-slate-100">
                  <div className="flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                    <span className="text-xs text-slate-500 font-medium">{cc._asignados.length} persona{cc._asignados.length !== 1 ? 's' : ''} asignada{cc._asignados.length !== 1 ? 's' : ''}</span>
                  </div>
                  {cc._asignados.length > 0 && (
                    <div className="flex -space-x-1">
                      {cc._asignados.slice(0, 5).map(t => (
                        <div key={t.id} className="w-5 h-5 rounded-full bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center text-white text-[8px] font-black border-2 border-white"
                          title={`${t.nombre} ${t.apellidoPaterno}`}>
                          {t.nombre?.[0]}{t.apellidoPaterno?.[0]}
                        </div>
                      ))}
                      {cc._asignados.length > 5 && (
                        <div className="w-5 h-5 rounded-full bg-slate-200 flex items-center justify-center text-slate-500 text-[8px] font-black border-2 border-white">
                          +{cc._asignados.length - 5}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Confirm delete */}
      {confirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setConfirm(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full">
            <h3 className="text-base font-black text-slate-900 text-center">¿Eliminar centro de costo?</h3>
            <p className="text-sm text-slate-500 text-center mt-1 mb-5">Se eliminará <strong>{confirm.nombre}</strong>.</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirm(null)} className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-sm">Cancelar</button>
              <button onClick={handleDelete} className="flex-1 py-2.5 text-white font-bold rounded-xl text-sm" style={{ background: 'linear-gradient(135deg, #ef4444, #e11d48)', boxShadow: '0 4px 12px rgba(239,68,68,0.3)' }}>Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function OrganizacionSection() {
  const { empresaId } = useEmpresa();
  const [trabajadores,  setTrabajadores]  = useState([]);
  const [contratos,     setContratos]     = useState([]);
  const [liquidaciones, setLiquidaciones] = useState([]);
  const [bandas,        setBandas]        = useState([]);
  const [centros,       setCentros]       = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [tabInner,      setTabInner]      = useState('organigrama');
  const [filtroEmpresa, setFiltroEmpresa] = useState('');

  const load = useCallback(async () => {
    if (!empresaId) return;
    setLoading(true);
    try {
      const [tSnap, cSnap, rSnap, bSnap, ccSnap] = await Promise.all([
        getDocs(collection(db,'empresas',empresaId,'trabajadores')),
        getDocs(collection(db,'empresas',empresaId,'contratos')),
        getDocs(query(collection(db,'empresas',empresaId,'remuneraciones'), orderBy('createdAt','desc'))),
        getDocs(query(collection(db,'empresas',empresaId,'bandas_salariales'), orderBy('nivel','asc'))),
        getDocs(collection(db,'empresas',empresaId,'centros_costo')),
      ]);
      setTrabajadores(tSnap.docs.map(d=>({id:d.id,...d.data()})));
      setContratos(cSnap.docs.map(d=>({id:d.id,...d.data()})));
      setLiquidaciones(rSnap.docs.map(d=>({id:d.id,...d.data()})));
      setBandas(bSnap.docs.map(d=>({id:d.id,...d.data()})));
      setCentros(ccSnap.docs.map(d=>({id:d.id,...d.data()})));
    } catch(e){ console.error(e); }
    setLoading(false);
  }, [empresaId]);

  useEffect(() => { load(); }, [load]);

  const activos = trabajadores.filter(t=>t.estado==='activo');

  const INNER_TABS = [
    { id:'organigrama', label:'Organigrama' },
    { id:'bandas',      label:'Bandas salariales' },
    { id:'centros',     label:'Centros de costo'  },
  ];

  if (loading) return (
    <div className="flex items-center justify-center py-32">
      <div className="w-10 h-10 rounded-full animate-spin" style={{border:"2px solid rgba(124,58,237,0.15)", borderTopColor:"#7c3aed"}} />
    </div>
  );

  return (
    <div className="space-y-5">

      {/* Stats rápidas */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          ['Activos totales',    activos.length,                                    'text-purple-600', false],
          ['Áreas con personal', new Set(activos.map(t=>t.area).filter(Boolean)).size,'text-indigo-600', false],
          ['Bandas definidas',   bandas.length,                                     'text-slate-700',  false],
          ['Centros de costo',   centros.length,                                    'text-emerald-600',false],
        ].map(([l,v,c,m])=>(
          <div key={l} className="rounded-2xl px-5 py-4" style={{background:"#fff", border:"1px solid rgba(0,0,0,0.06)", boxShadow:"0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(124,58,237,0.04)"}}>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">{l}</p>
            <p className={`text-4xl font-black ${c} mt-1`}>{v}</p>
          </div>
        ))}
      </div>

      {/* Sub-tabs internos */}
      <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
        {/* Nav */}
        <div className="flex border-b border-slate-100">
          {INNER_TABS.map(t=>(
            <button key={t.id} onClick={()=>setTabInner(t.id)}
              className={`flex-1 px-4 py-3.5 text-sm font-bold transition-colors border-b-2 -mb-px ${
                tabInner===t.id
                  ? 'border-violet-600 text-violet-700 bg-violet-50/60'
                  : 'border-transparent text-slate-400 hover:text-slate-600 hover:bg-slate-50/80'
              }`}>{t.label}</button>
          ))}
        </div>

        <div className="p-5">

          {/* ── Organigrama ── */}
          {tabInner === 'organigrama' && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Vista por área · {activos.length} activos</p>
                <select className="px-3 py-1.5 border-2 border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:border-purple-400 font-semibold"
                  value={filtroEmpresa} onChange={e=>setFiltroEmpresa(e.target.value)}>
                  <option value="">Todas las empresas</option>
                  {EMPRESAS.map(e=><option key={e}>{e}</option>)}
                </select>
              </div>
              <Organigrama trabajadores={trabajadores} contratos={contratos} filtroEmpresa={filtroEmpresa} />
            </div>
          )}

          {/* ── Bandas salariales ── */}
          {tabInner === 'bandas' && (
            <BandasSection
              trabajadores={trabajadores}
              contratos={contratos}
              bandas={bandas}
              onReload={load}
            />
          )}

          {/* ── Centros de costo ── */}
          {tabInner === 'centros' && (
            <CentrosCostoSection
              trabajadores={trabajadores}
              contratos={contratos}
              liquidaciones={liquidaciones}
              centros={centros}
              onReload={load}
            />
          )}

        </div>
      </div>
    </div>
  );
}

function ReportesSection() {
  const { empresaId } = useEmpresa();
  const [trabajadores,  setTrabajadores]  = useState([]);
  const [contratos,     setContratos]     = useState([]);
  const [liquidaciones, setLiquidaciones] = useState([]);
  const [finiquitos,    setFiniquitos]    = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [tabInner,      setTabInner]      = useState('kpis');
  const [filtroEmpresa, setFiltroEmpresa] = useState('');
  const [filtroArea,    setFiltroArea]    = useState('');
  const [periodoMeses,  setPeriodoMeses]  = useState(6);

  const load = useCallback(async () => {
    if (!empresaId) return;
    setLoading(true);
    try {
      const [tSnap, cSnap, rSnap, fSnap] = await Promise.all([
        getDocs(collection(db,'empresas',empresaId,'trabajadores')),
        getDocs(collection(db,'empresas',empresaId,'contratos')),
        getDocs(query(collection(db,'empresas',empresaId,'remuneraciones'), orderBy('createdAt','desc'))),
        getDocs(collection(db,'empresas',empresaId,'finiquitos')),
      ]);
      setTrabajadores(tSnap.docs.map(d=>({id:d.id,...d.data()})));
      setContratos(cSnap.docs.map(d=>({id:d.id,...d.data()})));
      setLiquidaciones(rSnap.docs.map(d=>({id:d.id,...d.data()})));
      setFiniquitos(fSnap.docs.map(d=>({id:d.id,...d.data()})));
    } catch(e){ console.error(e); }
    setLoading(false);
  }, [empresaId]);

  useEffect(() => { load(); }, [load]);

  // ── Filtros aplicados ──
  const trabFilt = trabajadores.filter(t =>
    (!filtroEmpresa || t.empresa === filtroEmpresa) &&
    (!filtroArea    || t.area    === filtroArea)
  );
  const idsTrab = new Set(trabFilt.map(t=>t.id));

  // ── Serie de meses ──
  const serie = ultimosMeses(periodoMeses);

  // ── Datos por mes ──
  const dataPorMes = serie.map(({ mes, anio, label }) => {
    const liqMes = liquidaciones.filter(l =>
      l.mes === String(mes).padStart(2,'0') &&
      l.anio === String(anio) &&
      idsTrab.has(l.trabajadorId)
    );

    let masaImponible=0, masaNoImp=0, totalCotiz=0, totalLiquido=0, costoEmp=0;
    liqMes.forEach(l => {
      const cont = contratos.find(c=>c.id===l.contratoId);
      if (!cont) return;
      const c = calcularLiquidacion({...cont,...l});
      masaImponible += c.imponible;
      masaNoImp     += c.noImponible;
      totalCotiz    += c.totalDescuentos;
      totalLiquido  += c.liquido;
      costoEmp      += c.imponible + (c.cesEmpM||0) + (c.sisEmpM||0);
    });

    const dotacion = trabFilt.filter(t => {
      const ct = contratos.find(c=>c.trabajadorId===t.id&&c.estado==='vigente');
      return ct && ct.fechaInicio <= `${anio}-${String(mes).padStart(2,'0')}-31`;
    }).length;

    const ingresos = trabFilt.filter(t => {
      const ct = contratos.find(c=>c.trabajadorId===t.id);
      return ct && ct.fechaInicio?.startsWith(`${anio}-${String(mes).padStart(2,'0')}`);
    }).length;

    const egresos = finiquitos.filter(f =>
      idsTrab.has(f.trabajadorId) &&
      f.fechaTermino?.startsWith(`${anio}-${String(mes).padStart(2,'0')}`)
    ).length;

    return { label, mes, anio, dotacion, ingresos, egresos, masaImponible, masaNoImp, totalCotiz, totalLiquido, costoEmp, liquidaciones: liqMes.length };
  });

  const mesActual  = dataPorMes.at(-1) || {};
  const mesAnterior= dataPorMes.at(-2) || {};

  const trend = (actual, anterior) => {
    if (!anterior || anterior === 0) return undefined;
    return Math.round(((actual - anterior) / anterior) * 100 * 10) / 10;
  };

  // ── Rotación ──
  const rotacionSerie = dataPorMes.map(m => calcularTasaRotacion(m.ingresos, m.egresos, m.dotacion));
  const rotacionActual = rotacionSerie.at(-1) || 0;

  // ── Ausentismo (con datos de asistencia si existieran; simplificado) ──
  const totalFiniquitados = trabajadores.filter(t=>t.estado==='finiquitado').length;
  const totalActivos      = trabFilt.filter(t=>t.estado==='activo').length;
  const totalInactivos    = trabFilt.filter(t=>t.estado==='inactivo').length;

  // ── Sueldo promedio por área ──
  const promedioArea = AREAS.map(area => {
    const trabjArea = trabFilt.filter(t=>t.area===area&&t.estado==='activo');
    const sueldos   = trabjArea.map(t => {
      const c = contratos.find(c=>c.trabajadorId===t.id&&c.estado==='vigente');
      return parseInt(c?.sueldoBase||0);
    }).filter(s=>s>0);
    const promedio  = sueldos.length ? Math.round(sueldos.reduce((a,b)=>a+b,0)/sueldos.length) : 0;
    return { area, promedio, count: trabjArea.length };
  }).filter(a=>a.count>0).sort((a,b)=>b.promedio-a.promedio);

  const maxPromedio = Math.max(...promedioArea.map(a=>a.promedio), 1);

  // ── Costo por empresa ──
  const costoEmpresa = EMPRESAS.map(emp => {
    const trabEmp = trabajadores.filter(t=>t.empresa===emp&&t.estado==='activo');
    const liqEmp  = liquidaciones.filter(l => {
      const t = trabajadores.find(t=>t.id===l.trabajadorId);
      const m = dataPorMes.at(-1);
      return t?.empresa===emp && l.mes===String(m?.mes||'').padStart(2,'0') && l.anio===String(m?.anio||'');
    });
    let costo = 0;
    liqEmp.forEach(l => {
      const cont = contratos.find(c=>c.id===l.contratoId);
      if (!cont) return;
      const c = calcularLiquidacion({...cont,...l});
      costo += c.imponible + (c.cesEmpM||0) + (c.sisEmpM||0);
    });
    return { empresa:emp, trabajadores:trabEmp.length, costo };
  }).filter(e=>e.trabajadores>0).sort((a,b)=>b.costo-a.costo);

  const maxCosto = Math.max(...costoEmpresa.map(e=>e.costo), 1);

  // ── Proyección anual (simple: costo mes actual × 12) ──
  const proyAnual = (mesActual.costoEmp||0) * 12;

  const fmt  = n => n ? `$${Math.round(n).toLocaleString('es-CL')}` : '$0';
  const fmtK = n => n >= 1000000 ? `$${(n/1000000).toFixed(1)}M` : n >= 1000 ? `$${Math.round(n/1000)}K` : fmt(n);

  const INNER_TABS = [
    { id:'kpis',        label:'KPIs Ejecutivos' },
    { id:'nomina',      label:'Evolución Nómina' },
    { id:'rotacion',    label:'Rotación' },
    { id:'costos',      label:'Costo Laboral'  },
    { id:'headcount',   label:'Headcount'      },
  ];

  if (loading) return (
    <div className="flex items-center justify-center py-32">
      <div className="w-10 h-10 rounded-full animate-spin" style={{border:"2px solid rgba(124,58,237,0.15)", borderTopColor:"#7c3aed"}} />
    </div>
  );

  // ── Exportar PDF general ──
  const handlePDF = () => {
    const liqs = dataPorMes;
    const kpiHTML = `<div class="kpi-grid">
      ${[
        ['Activos', totalActivos],
        ['Masa bruta/mes', fmtK(mesActual.masaImponible||0)],
        ['Costo empresa/mes', fmtK(mesActual.costoEmp||0)],
        ['Rotación', `${rotacionActual}%`],
      ].map(([l,v])=>`<div class="kpi"><div class="kpi-v">${v}</div><div class="kpi-l">${l}</div></div>`).join('')}
    </div>`;

    const tablaHTML = `<table>
      <thead><tr><th>Mes</th><th>Dotación</th><th>Ingresos</th><th>Egresos</th><th>Masa imponible</th><th>Costo empresa</th><th>Rotación</th></tr></thead>
      <tbody>${liqs.map((m,i)=>`<tr>
        <td>${m.label}</td><td>${m.dotacion}</td><td>${m.ingresos}</td><td>${m.egresos}</td>
        <td>${fmtK(m.masaImponible)}</td><td>${fmtK(m.costoEmp)}</td><td>${rotacionSerie[i]}%</td>
      </tr>`).join('')}
      <tr class="total-row"><td>PROYECCIÓN ANUAL</td><td></td><td></td><td></td><td>${fmtK(proyAnual/12*12)}</td><td>${fmtK(proyAnual)}</td><td></td></tr>
      </tbody></table>`;

    const areaHTML = `<table>
      <thead><tr><th>Área</th><th>N° trabajadores</th><th>Sueldo promedio</th></tr></thead>
      <tbody>${promedioArea.map(a=>`<tr><td>${a.area}</td><td>${a.count}</td><td>${fmt(a.promedio)}</td></tr>`).join('')}</tbody>
    </table>`;

    const empHTML = `<table>
      <thead><tr><th>Empresa</th><th>Trabajadores</th><th>Costo mes</th></tr></thead>
      <tbody>${costoEmpresa.map(e=>`<tr><td>${e.empresa}</td><td>${e.trabajadores}</td><td>${fmt(e.costo)}</td></tr>`).join('')}</tbody>
    </table>`;

    generarPDFReporte(
      'Reporte Ejecutivo RRHH',
      filtroEmpresa || 'Todas las empresas',
      `Últimos ${periodoMeses} meses`,
      [
        { titulo:'KPIs Principales', contenido: kpiHTML },
        { titulo:`Evolución últimos ${periodoMeses} meses`, contenido: tablaHTML },
        { titulo:'Sueldo promedio por área', contenido: areaHTML },
        { titulo:'Costo laboral por empresa', contenido: empHTML },
      ]
    );
  };

  const handleCSV = () => {
    const filas = dataPorMes.map((m,i)=>({
      'Mes': m.label,
      'Dotacion': m.dotacion,
      'Ingresos': m.ingresos,
      'Egresos': m.egresos,
      'Masa_Imponible': m.masaImponible,
      'Masa_NoImponible': m.masaNoImp,
      'Total_Cotizaciones': m.totalCotiz,
      'Liquido_Total': m.totalLiquido,
      'Costo_Empresa': m.costoEmp,
      'Rotacion_Pct': rotacionSerie[i],
    }));
    exportarReporteCSV(filas,
      ['Mes','Dotacion','Ingresos','Egresos','Masa_Imponible','Masa_NoImponible','Total_Cotizaciones','Liquido_Total','Costo_Empresa','Rotacion_Pct'],
      `Reporte_RRHH_${filtroEmpresa||'Global'}`
    );
  };

  return (
    <div className="space-y-5">

      {/* Filtros globales */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-5 py-4 flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[140px]">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Empresa</p>
          <select className={inp} value={filtroEmpresa} onChange={e=>setFiltroEmpresa(e.target.value)}>
            <option value="">Todas</option>
            {EMPRESAS.map(e=><option key={e}>{e}</option>)}
          </select>
        </div>
        <div className="flex-1 min-w-[120px]">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Área</p>
          <select className={inp} value={filtroArea} onChange={e=>setFiltroArea(e.target.value)}>
            <option value="">Todas</option>
            {AREAS.map(a=><option key={a}>{a}</option>)}
          </select>
        </div>
        <div className="flex-1 min-w-[120px]">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Período</p>
          <select className={inp} value={periodoMeses} onChange={e=>setPeriodoMeses(parseInt(e.target.value))}>
            {[3,6,9,12].map(m=><option key={m} value={m}>Últimos {m} meses</option>)}
          </select>
        </div>
        <div className="flex gap-2 ml-auto">
          <button onClick={handleCSV}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold text-sm rounded-xl transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
            Excel
          </button>
          <button onClick={handlePDF}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-bold text-sm rounded-xl hover:opacity-90 transition-all shadow-sm">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"/></svg>
            PDF ejecutivo
          </button>
        </div>
      </div>

      {/* Sub-tabs */}
      <div className="rounded-2xl overflow-hidden" style={{background:"#fff", border:"1px solid rgba(0,0,0,0.06)", boxShadow:"0 2px 8px rgba(0,0,0,0.05), 0 8px 24px rgba(124,58,237,0.04)"}}>
        <div className="flex border-b border-slate-100 overflow-x-auto">
          {INNER_TABS.map(t=>(
            <button key={t.id} onClick={()=>setTabInner(t.id)}
              className={`flex-shrink-0 px-5 py-3.5 text-sm font-bold transition-colors border-b-2 -mb-px whitespace-nowrap ${
                tabInner===t.id
                  ? 'border-violet-600 text-violet-700 bg-violet-50/60'
                  : 'border-transparent text-slate-400 hover:text-slate-600 hover:bg-slate-50/80'
              }`}>{t.label}</button>
          ))}
        </div>

        <div className="p-5">

          {/* ════════════════════════════════════
              KPIs EJECUTIVOS
          ════════════════════════════════════ */}
          {tabInner === 'kpis' && (
            <div className="space-y-6">
              {/* Row 1 — Dotación */}
              <div>
                <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-3">Dotación actual</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <KPICard label="Activos" valor={totalActivos} color="text-purple-700" bg="bg-purple-50" />
                  <KPICard label="Inactivos" valor={totalInactivos} color="text-slate-600" bg="bg-slate-50" />
                  <KPICard label="Finiquitados" valor={totalFiniquitados} color="text-rose-600" bg="bg-rose-50" />
                  <KPICard label="Total registrados" valor={trabFilt.length} color="text-indigo-700" bg="bg-indigo-50" />
                </div>
              </div>

              {/* Row 2 — Nómina mes actual */}
              <div>
                <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-3">
                  Nómina — {mesActual.label||'—'}
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <KPICard label="Masa imponible" valor={fmtK(mesActual.masaImponible||0)} color="text-purple-700" bg="bg-purple-50"
                    trend={trend(mesActual.masaImponible, mesAnterior.masaImponible)} />
                  <KPICard label="Total cotizaciones" valor={fmtK(mesActual.totalCotiz||0)} color="text-red-600" bg="bg-red-50" />
                  <KPICard label="Líquido total" valor={fmtK(mesActual.totalLiquido||0)} color="text-emerald-700" bg="bg-emerald-50"
                    trend={trend(mesActual.totalLiquido, mesAnterior.totalLiquido)} />
                  <KPICard label="Costo empresa" valor={fmtK(mesActual.costoEmp||0)} color="text-indigo-700" bg="bg-indigo-50"
                    sub="incl. aportes empleador"
                    trend={trend(mesActual.costoEmp, mesAnterior.costoEmp)} />
                </div>
              </div>

              {/* Row 3 — Proyecciones */}
              <div>
                <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-3">Proyección anual</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <KPICard label="Costo laboral anual" valor={fmtK(proyAnual)} color="text-purple-800" bg="bg-purple-50"
                    sub={`basado en ${mesActual.label||'—'} × 12`} />
                  <KPICard label="Costo por trabajador/mes" valor={totalActivos ? fmtK(Math.round((mesActual.costoEmp||0)/totalActivos)) : '—'} color="text-indigo-700" bg="bg-indigo-50" />
                  <KPICard label="Ratio cotiz./imponible" valor={mesActual.masaImponible ? `${Math.round((mesActual.totalCotiz||0)/(mesActual.masaImponible)*100)}%` : '—'} color="text-slate-700" bg="bg-slate-50" />
                </div>
              </div>

              {/* Row 4 — Rotación y alertas */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-slate-50 rounded-2xl p-4">
                  <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-3">Tasa de rotación</p>
                  <div className="flex items-end gap-4">
                    <div>
                      <p className={`text-4xl font-black ${rotacionActual > 5 ? 'text-red-500' : rotacionActual > 2 ? 'text-amber-500' : 'text-emerald-600'}`}>{rotacionActual}%</p>
                      <p className="text-xs text-slate-400 mt-1">{mesActual.label||'—'} · Ref. saludable: &lt;2%/mes</p>
                    </div>
                    <LineaMini data={rotacionSerie} color={rotacionActual > 5 ? '#ef4444' : rotacionActual > 2 ? '#f59e0b' : '#10b981'} height={44} />
                  </div>
                </div>
                <div className="bg-slate-50 rounded-2xl p-4">
                  <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-3">Alertas clave</p>
                  <div className="space-y-2">
                    {rotacionActual > 5 && (
                      <div className="flex items-start gap-2 text-xs">
                        <span className="w-2 h-2 rounded-full bg-red-500 mt-0.5 flex-shrink-0" />
                        <span className="text-red-700 font-medium">Rotación alta ({rotacionActual}%). Revisar causales de salida.</span>
                      </div>
                    )}
                    {(mesActual.costoEmp||0) > (mesAnterior.costoEmp||0) * 1.1 && (
                      <div className="flex items-start gap-2 text-xs">
                        <span className="w-2 h-2 rounded-full bg-amber-400 mt-0.5 flex-shrink-0" />
                        <span className="text-amber-700 font-medium">Costo laboral creció más de un 10% vs. mes anterior.</span>
                      </div>
                    )}
                    {totalActivos > 0 && (
                      <div className="flex items-start gap-2 text-xs">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 mt-0.5 flex-shrink-0" />
                        <span className="text-emerald-700 font-medium">{totalActivos} trabajadores activos. {totalInactivos > 0 ? `${totalInactivos} inactivos.` : ''}</span>
                      </div>
                    )}
                    {mesActual.dotacion === 0 && (
                      <div className="flex items-start gap-2 text-xs">
                        <span className="w-2 h-2 rounded-full bg-slate-400 mt-0.5 flex-shrink-0" />
                        <span className="text-slate-500 font-medium">Sin liquidaciones registradas para {mesActual.label}.</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ════════════════════════════════════
              EVOLUCIÓN NÓMINA
          ════════════════════════════════════ */}
          {tabInner === 'nomina' && (
            <div className="space-y-5">
              <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Evolución masa salarial — últimos {periodoMeses} meses</p>

              {/* Barras horizontales por mes */}
              <div>
                {dataPorMes.map((m, i) => {
                  const maxMasa = Math.max(...dataPorMes.map(d=>d.masaImponible), 1);
                  const esActual = i === dataPorMes.length - 1;
                  return (
                    <div key={m.label} className={`flex items-center gap-3 mb-2 ${esActual?'opacity-100':'opacity-80'}`}>
                      <span className="text-xs font-bold text-slate-500 w-24 text-right flex-shrink-0">{m.label}</span>
                      <div className="flex-1 h-7 bg-slate-100 rounded-lg overflow-hidden relative">
                        <div className={`h-full rounded-lg transition-all duration-500 flex items-center justify-end pr-2 ${esActual?'bg-gradient-to-r from-purple-500 to-indigo-500':'bg-gradient-to-r from-purple-300 to-indigo-300'}`}
                          style={{width:`${Math.max((m.masaImponible/maxMasa)*100, 3)}%`}}>
                        </div>
                      </div>
                      <span className="text-xs font-black text-slate-700 w-20 flex-shrink-0">{fmtK(m.masaImponible)}</span>
                      <span className={`text-xs font-bold w-14 flex-shrink-0 ${m.costoEmp > (dataPorMes[i-1]?.costoEmp||0) ? 'text-rose-500' : 'text-emerald-500'}`}>
                        {i > 0 ? (m.masaImponible > (dataPorMes[i-1]?.masaImponible||0) ? '▲' : '▼') : ''} {i > 0 && dataPorMes[i-1]?.masaImponible ? `${Math.abs(Math.round(((m.masaImponible-(dataPorMes[i-1]?.masaImponible||0))/(dataPorMes[i-1]?.masaImponible||1))*100))}%` : ''}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Tabla detalle */}
              <div className="overflow-x-auto rounded-xl border border-slate-100">
                <table className="w-full min-w-[700px] text-sm">
                  <thead>
                    <tr style={{background:"#1e1b4b"}}>
                      {['Mes','Dotación','Liquidaciones','Masa imp.','No imp.','Cotizaciones','Líquido','Costo empresa'].map(h=>(
                        <th key={h} className="px-3 py-2.5 text-left text-[10px] font-black text-slate-300 uppercase tracking-widest">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {dataPorMes.map((m,i)=>(
                      <tr key={m.label} className={`${i===dataPorMes.length-1?'bg-purple-50/40':''} hover:bg-slate-50 transition-colors`}>
                        <td className="px-3 py-2.5 font-bold text-slate-700">{m.label}</td>
                        <td className="px-3 py-2.5 text-center text-slate-600">{m.dotacion}</td>
                        <td className="px-3 py-2.5 text-center text-slate-600">{m.liquidaciones}</td>
                        <td className="px-3 py-2.5 font-bold text-purple-700">{fmtK(m.masaImponible)}</td>
                        <td className="px-3 py-2.5 text-slate-500">{fmtK(m.masaNoImp)}</td>
                        <td className="px-3 py-2.5 text-red-400">{fmtK(m.totalCotiz)}</td>
                        <td className="px-3 py-2.5 font-bold text-emerald-600">{fmtK(m.totalLiquido)}</td>
                        <td className="px-3 py-2.5 font-black text-indigo-700">{fmtK(m.costoEmp)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{background:"#1e1b4b"}}>
                      <td className="px-3 py-2.5 font-black text-white text-xs" colSpan={3}>PROYECCIÓN ANUAL</td>
                      <td className="px-3 py-2.5 font-black text-purple-300">{fmtK(proyAnual/12*12)}</td>
                      <td />
                      <td />
                      <td />
                      <td className="px-3 py-2.5 font-black text-indigo-300">{fmtK(proyAnual)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* ════════════════════════════════════
              ROTACIÓN
          ════════════════════════════════════ */}
          {tabInner === 'rotacion' && (
            <div className="space-y-5">
              <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Análisis de rotación — últimos {periodoMeses} meses</p>

              {/* Serie rotación */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <KPICard label="Rotación mes actual" valor={`${rotacionActual}%`}
                  color={rotacionActual>5?'text-red-600':rotacionActual>2?'text-amber-600':'text-emerald-600'}
                  bg={rotacionActual>5?'bg-red-50':rotacionActual>2?'bg-amber-50':'bg-emerald-50'}
                  sub="(ingresos+egresos)/2/dotación" />
                <KPICard label="Ingresos en período" valor={dataPorMes.reduce((s,m)=>s+m.ingresos,0)} color="text-emerald-700" bg="bg-emerald-50" />
                <KPICard label="Egresos en período" valor={dataPorMes.reduce((s,m)=>s+m.egresos,0)} color="text-rose-600" bg="bg-rose-50" />
              </div>

              {/* Gráfica ingr/egr por mes */}
              <div className="bg-slate-50 rounded-2xl p-4">
                <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-4">Ingresos vs. Egresos por mes</p>
                {dataPorMes.map((m,i) => (
                  <div key={m.label} className="flex items-center gap-3 mb-2.5">
                    <span className="text-xs font-bold text-slate-500 w-24 text-right flex-shrink-0">{m.label}</span>
                    <div className="flex-1 flex gap-1 items-center">
                      {m.ingresos > 0 && (
                        <div className="bg-emerald-400 rounded-l-full h-5 flex items-center justify-end pr-1.5 transition-all"
                          style={{width:`${Math.max(m.ingresos*24,8)}px`, minWidth:'8px'}}>
                          <span className="text-[10px] text-white font-black">{m.ingresos}</span>
                        </div>
                      )}
                      {m.egresos > 0 && (
                        <div className="bg-rose-400 rounded-r-full h-5 flex items-center justify-start pl-1.5 transition-all"
                          style={{width:`${Math.max(m.egresos*24,8)}px`, minWidth:'8px'}}>
                          <span className="text-[10px] text-white font-black">{m.egresos}</span>
                        </div>
                      )}
                      {m.ingresos === 0 && m.egresos === 0 && (
                        <span className="text-xs text-slate-300 font-medium">Sin movimientos</span>
                      )}
                    </div>
                    <span className={`text-xs font-black w-10 flex-shrink-0 ${rotacionSerie[i]>5?'text-red-500':rotacionSerie[i]>2?'text-amber-500':'text-emerald-500'}`}>
                      {rotacionSerie[i]}%
                    </span>
                  </div>
                ))}
                <div className="flex gap-4 mt-3 text-xs font-bold text-slate-500">
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-emerald-400 inline-block" />Ingresos</span>
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-rose-400 inline-block" />Egresos</span>
                </div>
              </div>

              {/* Causales de finiquito */}
              {finiquitos.filter(f=>idsTrab.has(f.trabajadorId)).length > 0 && (
                <div>
                  <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-3">Causales de término</p>
                  <div className="space-y-2">
                    {Object.entries(
                      finiquitos.filter(f=>idsTrab.has(f.trabajadorId)).reduce((acc,f)=>{
                        const l = CAUSALES_TERMINO.find(c=>c.codigo===f.causal)?.label || f.causal || 'Otra';
                        acc[l] = (acc[l]||0)+1; return acc;
                      },{})
                    ).sort((a,b)=>b[1]-a[1]).map(([causal, count])=>{
                      const total = finiquitos.filter(f=>idsTrab.has(f.trabajadorId)).length;
                      return <BarraH key={causal} label={causal.length>50?causal.slice(0,50)+'…':causal}
                        valor={count} max={total} fmt={v=>`${v} (${Math.round(v/total*100)}%)`} />;
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ════════════════════════════════════
              COSTO LABORAL
          ════════════════════════════════════ */}
          {tabInner === 'costos' && (
            <div className="space-y-5">
              <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Distribución costo laboral — {mesActual.label||'—'}</p>

              {/* Por empresa */}
              <div>
                <p className="text-xs font-black text-slate-500 uppercase tracking-wide mb-3">Por empresa</p>
                {costoEmpresa.length === 0
                  ? <p className="text-sm text-slate-400 text-center py-6">Sin datos de liquidaciones para este período</p>
                  : costoEmpresa.map(e=>(
                    <BarraH key={e.empresa} label={e.empresa} sub={`${e.trabajadores} trab.`}
                      valor={e.costo} max={maxCosto} fmt={fmtK} />
                  ))}
              </div>

              {/* Por área */}
              <div>
                <p className="text-xs font-black text-slate-500 uppercase tracking-wide mb-3">Sueldo promedio por área</p>
                {promedioArea.length === 0
                  ? <p className="text-sm text-slate-400 text-center py-6">Sin datos</p>
                  : promedioArea.map(a=>(
                    <BarraH key={a.area} label={a.area} sub={`${a.count} trab.`}
                      valor={a.promedio} max={maxPromedio} fmt={fmt}
                      color={(COLORES_AREA[a.area]||COLOR_DEFAULT).bg} />
                  ))}
              </div>

              {/* Desglose costo empresa */}
              <div className="bg-slate-50 rounded-2xl p-4">
                <p className="text-xs font-black text-slate-500 uppercase tracking-wide mb-3">Composición costo total empleador</p>
                <div className="space-y-2">
                  {[
                    ['Masa imponible (sueldos)',  mesActual.masaImponible||0,  '#7c3aed'],
                    ['Masa no imponible (beneficios)', mesActual.masaNoImp||0, '#a78bfa'],
                    ['Cotizaciones empleador',    (mesActual.costoEmp||0)-(mesActual.masaImponible||0), '#ef4444'],
                  ].map(([l,v,c])=>(
                    <div key={l} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full flex-shrink-0" style={{background:c}} />
                        <span className="text-sm font-medium text-slate-600">{l}</span>
                      </div>
                      <span className="text-sm font-black text-slate-800">{fmtK(v)}</span>
                    </div>
                  ))}
                  <div className="border-t border-slate-200 pt-2 flex items-center justify-between">
                    <span className="text-sm font-black text-slate-800">Total costo empresa</span>
                    <span className="text-sm font-black text-indigo-700">{fmtK(mesActual.costoEmp||0)}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ════════════════════════════════════
              HEADCOUNT
          ════════════════════════════════════ */}
          {tabInner === 'headcount' && (
            <div className="space-y-5">
              <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Evolución dotación — últimos {periodoMeses} meses</p>

              {/* Sparkline dotación */}
              <div className="bg-slate-50 rounded-2xl p-4">
                <div className="flex items-end justify-between mb-2">
                  <div>
                    <p className="text-3xl font-black text-purple-700">{totalActivos}</p>
                    <p className="text-xs text-slate-400 mt-0.5">Activos hoy</p>
                  </div>
                  <LineaMini data={dataPorMes.map(m=>m.dotacion)} color="#7c3aed" height={50} />
                </div>
                <div className="grid grid-cols-3 gap-2 mt-3">
                  {dataPorMes.slice(-3).map(m=>(
                    <div key={m.label} className="text-center">
                      <p className="text-lg font-black text-purple-700">{m.dotacion}</p>
                      <p className="text-[10px] text-slate-400">{m.label}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Por área */}
              <div>
                <p className="text-xs font-black text-slate-500 uppercase tracking-wide mb-3">Distribución por área</p>
                {AREAS.map(area => {
                  const count  = trabFilt.filter(t=>t.area===area&&t.estado==='activo').length;
                  const total  = totalActivos || 1;
                  const color  = COLORES_AREA[area] || COLOR_DEFAULT;
                  if (!count) return null;
                  return (
                    <div key={area} className="mb-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-bold text-slate-700">{area}</span>
                        <span className="text-sm font-black" style={{color:color.bg}}>{count} ({Math.round(count/total*100)}%)</span>
                      </div>
                      <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{width:`${(count/total)*100}%`, background:color.bg}} />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Por empresa */}
              <div>
                <p className="text-xs font-black text-slate-500 uppercase tracking-wide mb-3">Distribución por empresa</p>
                <div className="overflow-x-auto rounded-xl border border-slate-100">
                  <table className="w-full text-sm">
                    <thead>
                      <tr style={{background:"#1e1b4b"}}>
                        {['Empresa','Activos','Inactivos','Finiquitados','% del total'].map(h=>(
                          <th key={h} className="px-3 py-2.5 text-left text-[10px] font-black text-slate-300 uppercase tracking-widest">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {EMPRESAS.map(emp => {
                        const travEmp = trabFilt.filter(t=>t.empresa===emp);
                        if (!travEmp.length) return null;
                        const act  = travEmp.filter(t=>t.estado==='activo').length;
                        const inac = travEmp.filter(t=>t.estado==='inactivo').length;
                        const fin  = travEmp.filter(t=>t.estado==='finiquitado').length;
                        const pct  = totalActivos ? Math.round((act/totalActivos)*100) : 0;
                        return (
                          <tr key={emp} className="hover:bg-slate-50">
                            <td className="px-3 py-2.5 font-bold text-slate-800">{emp}</td>
                            <td className="px-3 py-2.5 font-black text-purple-700">{act}</td>
                            <td className="px-3 py-2.5 text-slate-500">{inac||'—'}</td>
                            <td className="px-3 py-2.5 text-rose-400">{fin||'—'}</td>
                            <td className="px-3 py-2.5">
                              <div className="flex items-center gap-2">
                                <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                  <div className="h-full bg-purple-500 rounded-full" style={{width:`${pct}%`}} />
                                </div>
                                <span className="text-xs font-bold text-slate-500 w-8">{pct}%</span>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

function ContabilidadSection({ initialTab = 'asientos' }) {
  const { empresaId } = useEmpresa();
  const [trabajadores,  setTrabajadores]  = useState([]);
  const [contratos,     setContratos]     = useState([]);
  const [liquidaciones, setLiquidaciones] = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [tabInner,      setTabInner]      = useState(initialTab);
  const [utm,           setUtm]           = useState(UTM_DEFAULT);
  const [utmInput,      setUtmInput]      = useState(String(UTM_DEFAULT));
  const [filtroMes,     setFiltroMes]     = useState(() => String(new Date().getMonth()+1).padStart(2,'0'));
  const [filtroAnio,    setFiltroAnio]    = useState(() => String(new Date().getFullYear()));
  const [filtroEmpresa, setFiltroEmpresa] = useState('');
  const [validRuts,     setValidRuts]     = useState(null); // null=no validado
  const [validando,     setValidando]     = useState(false);
  const [planCuentas,   setPlanCuentas]   = useState(PLAN_CUENTAS_DEFAULT);
  const [editPlan,      setEditPlan]      = useState(false);

  const load = useCallback(async () => {
    if (!empresaId) return;
    setLoading(true);
    try {
      const [tSnap, cSnap, rSnap] = await Promise.all([
        getDocs(collection(db,'empresas',empresaId,'trabajadores')),
        getDocs(collection(db,'empresas',empresaId,'contratos')),
        getDocs(query(collection(db,'empresas',empresaId,'remuneraciones'), orderBy('createdAt','desc'))),
      ]);
      setTrabajadores(tSnap.docs.map(d=>({id:d.id,...d.data()})));
      setContratos(cSnap.docs.map(d=>({id:d.id,...d.data()})));
      setLiquidaciones(rSnap.docs.map(d=>({id:d.id,...d.data()})));
    } catch(e){ console.error(e); }
    setLoading(false);
  }, [empresaId]);

  useEffect(() => { load(); }, [load]);

  // Liquidaciones del período seleccionado
  const liqPeriodo = liquidaciones.filter(l =>
    l.mes === filtroMes &&
    l.anio === filtroAnio &&
    (!filtroEmpresa || trabajadores.find(t=>t.id===l.trabajadorId)?.empresa === filtroEmpresa)
  );

  // Enriquecer con trabajador y contrato
  const liqEnriquecidas = liqPeriodo.map(liq => ({
    liq,
    trabajador: trabajadores.find(t=>t.id===liq.trabajadorId),
    contrato:   contratos.find(c=>c.id===liq.contratoId) || contratos.find(c=>c.trabajadorId===liq.trabajadorId&&c.estado==='vigente'),
  })).filter(x => x.contrato);

  // Calcular totales del período
  const totalesPeriodo = liqEnriquecidas.reduce((acc, { contrato, liq }) => {
    const c   = calcularLiquidacion({ ...contrato, ...liq });
    const iut = calcularIUT(calcularRentaTributable(c), utm);
    acc.masaImponible += c.imponible;
    acc.masaNoImp     += c.noImponible;
    acc.totalAfp      += c.afpM;
    acc.totalSalud    += c.salM;
    acc.totalSis      += c.sisM;
    acc.totalCesTrab  += c.cesM;
    acc.totalCesEmp   += c.cesEmpM||0;
    acc.totalIUT      += iut;
    acc.costoEmp      += c.imponible + (c.cesEmpM||0) + (c.sisM||0);
    acc.totalCotiz    += c.totalDescuentos + iut;
    acc.liquido       += Math.max(0, c.liquido - iut);
    return acc;
  }, { masaImponible:0, masaNoImp:0, totalAfp:0, totalSalud:0, totalSis:0, totalCesTrab:0, totalCesEmp:0, totalIUT:0, costoEmp:0, totalCotiz:0, liquido:0 });

  const periodo   = `${MESES[parseInt(filtroMes)-1]} ${filtroAnio}`;
  const asientos  = liqEnriquecidas.length > 0 ? generarAsientos(liqEnriquecidas, periodo, utm) : [];
  const totalDebe = asientos.filter(a=>a.lado==='D').reduce((s,a)=>s+a.monto,0);
  const totalHaber= asientos.filter(a=>a.lado==='H').reduce((s,a)=>s+a.monto,0);
  const cuadrado  = Math.abs(totalDebe-totalHaber) < 10;
  const fmt  = n => `$${Math.round(n||0).toLocaleString('es-CL')}`;
  const fmtK = n => n>=1000000?`$${(n/1000000).toFixed(1)}M`:n>=1000?`$${Math.round(n/1000)}K`:fmt(n);

  // Validar RUTs
  const validarRuts = () => {
    setValidando(true);
    const resultados = liqEnriquecidas.map(({ trabajador, liq }) => {
      const v = validarRutPrevired(trabajador?.rut||'');
      return { nombre:`${trabajador?.nombre||'?'} ${trabajador?.apellidoPaterno||''}`, rut:trabajador?.rut||'—', ...v };
    });
    setValidRuts(resultados);
    setValidando(false);
  };

  const INNER_TABS = [
    { id:'asientos',  label:'Asientos contables' },
    { id:'previred',  label:'Previred avanzado'  },
    { id:'pago',      label:'Archivo de pago'    },
    { id:'plan',      label:'Plan de cuentas'    },
  ];

  if (loading) return (
    <div className="flex items-center justify-center py-32">
      <div className="w-10 h-10 rounded-full animate-spin" style={{border:"2px solid rgba(124,58,237,0.15)", borderTopColor:"#7c3aed"}} />
    </div>
  );

  return (
    <div className="space-y-5">

      {/* ── Barra de configuración global ── */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-5 py-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[110px]">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Mes</p>
            <select className={inp} value={filtroMes} onChange={e=>{ setFiltroMes(e.target.value); setValidRuts(null); }}>
              {MESES.map((m,i)=><option key={m} value={String(i+1).padStart(2,'0')}>{m}</option>)}
            </select>
          </div>
          <div className="min-w-[90px]">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Año</p>
            <select className={inp} value={filtroAnio} onChange={e=>{ setFiltroAnio(e.target.value); setValidRuts(null); }}>
              {[2023,2024,2025,2026].map(y=><option key={y}>{y}</option>)}
            </select>
          </div>
          <div className="min-w-[150px]">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Empresa</p>
            <select className={inp} value={filtroEmpresa} onChange={e=>setFiltroEmpresa(e.target.value)}>
              <option value="">Todas</option>
              {EMPRESAS.map(e=><option key={e}>{e}</option>)}
            </select>
          </div>
          <div className="min-w-[200px]">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">UTM del período ($)</p>
            <div className="flex gap-2">
              <input className={`${inp} flex-1`} value={utmInput}
                onChange={e=>setUtmInput(e.target.value.replace(/\D/g,''))}
                onKeyDown={e=>{ if(e.key==='Enter'){ const v=parseInt(utmInput); if(v>0) setUtm(v); }}}
                placeholder={String(UTM_DEFAULT)} />
              <button onClick={()=>{ const v=parseInt(utmInput); if(v>0) setUtm(v); }}
                className="px-3 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-bold text-xs rounded-xl hover:opacity-90">
                OK
              </button>
            </div>
          </div>

          {/* Stats rápidas del período */}
          <div className="ml-auto flex items-center gap-3">
            <div className="text-right">
              <p className="text-[10px] font-bold text-slate-400 uppercase">{liqEnriquecidas.length} liquidaciones · {periodo}</p>
              <p className="text-sm font-black text-purple-700">{fmtK(totalesPeriodo.costoEmp)} costo empresa</p>
            </div>
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-sm font-black ${cuadrado&&liqEnriquecidas.length>0?'bg-emerald-100 text-emerald-600':'bg-slate-100 text-slate-400'}`}>
              {liqEnriquecidas.length > 0 ? (cuadrado ? '✓' : '!') : '—'}
            </div>
          </div>
        </div>
      </div>

      {/* ── KPIs del período ── */}
      {liqEnriquecidas.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
          {[
            ['Masa imp.',    fmtK(totalesPeriodo.masaImponible), 'text-purple-700', 'bg-purple-50'],
            ['AFP',         fmt(totalesPeriodo.totalAfp),        'text-red-500',    'bg-red-50'   ],
            ['Salud',       fmt(totalesPeriodo.totalSalud),      'text-red-400',    'bg-red-50'   ],
            ['Cesantía',    fmt(totalesPeriodo.totalCesTrab+totalesPeriodo.totalCesEmp), 'text-orange-500','bg-orange-50'],
            ['IUT 2ª Cat.', fmt(totalesPeriodo.totalIUT),        'text-violet-700', 'bg-violet-50'],
            ['Líquido',     fmtK(totalesPeriodo.liquido),        'text-emerald-700','bg-emerald-50'],
          ].map(([l,v,c,bg])=>(
            <div key={l} className={`${bg} rounded-xl px-3 py-3 shadow-sm border border-slate-100`}>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{l}</p>
              <p className={`text-base font-black ${c} mt-0.5`}>{v}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Sub-tabs ── */}
      <div className="rounded-2xl overflow-hidden" style={{background:"#fff", border:"1px solid rgba(0,0,0,0.06)", boxShadow:"0 2px 8px rgba(0,0,0,0.05), 0 8px 24px rgba(124,58,237,0.04)"}}>
        <div className="flex border-b border-slate-100 overflow-x-auto">
          {INNER_TABS.map(t=>(
            <button key={t.id} onClick={()=>setTabInner(t.id)}
              className={`flex-shrink-0 px-5 py-3.5 text-sm font-bold transition-colors border-b-2 -mb-px whitespace-nowrap ${
                tabInner===t.id
                  ? 'border-violet-600 text-violet-700 bg-violet-50/60'
                  : 'border-transparent text-slate-400 hover:text-slate-600 hover:bg-slate-50/80'
              }`}>{t.label}</button>
          ))}
        </div>

        <div className="p-5">

          {/* ════════════════════════════════════
              ASIENTOS CONTABLES
          ════════════════════════════════════ */}
          {tabInner === 'asientos' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Comprobante nómina — {periodo}</p>
                  {liqEnriquecidas.length > 0 && (
                    <p className={`text-xs font-bold mt-0.5 ${cuadrado?'text-emerald-600':'text-red-500'}`}>
                      {cuadrado ? `✓ Asiento cuadrado · Debe = Haber = ${fmt(totalDebe)}` : `⚠ Desbalance: Debe ${fmt(totalDebe)} ≠ Haber ${fmt(totalHaber)}`}
                    </p>
                  )}
                </div>
                {liqEnriquecidas.length > 0 && (
                  <button onClick={()=>generarPDFAsientos(asientos, periodo, filtroEmpresa||'Todas las empresas', totalesPeriodo)}
                    className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-bold text-sm rounded-xl hover:opacity-90 shadow-sm">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"/></svg>
                    PDF libro diario
                  </button>
                )}
              </div>

              {liqEnriquecidas.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-slate-400 bg-slate-50 rounded-2xl">
                  <span className="text-4xl mb-3">📒</span>
                  <p className="font-semibold">Sin liquidaciones para {periodo}</p>
                  <p className="text-xs mt-1">Registra liquidaciones en la pestaña Remuneraciones</p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-100">
                  <table className="w-full text-sm">
                    <thead>
                      <tr style={{background:"#1e1b4b"}}>
                        {['Tipo','Cuenta','Glosa','Monto','Debe','Haber'].map(h=>(
                          <th key={h} className="px-4 py-3 text-left text-[10px] font-black text-slate-300 uppercase tracking-widest">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {asientos.map((a, i) => (
                        <tr key={i} className={`hover:bg-slate-50 transition-colors ${i>0&&asientos[i-1].lado!==a.lado?'border-t-2 border-slate-200':''}`}>
                          <td className="px-4 py-2.5">
                            <span className={`text-xs font-black px-2 py-0.5 rounded-full ${a.lado==='D'?'bg-purple-100 text-purple-700':'bg-blue-100 text-blue-700'}`}>
                              {a.lado==='D'?'DEBE':'HABER'}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 font-mono font-bold text-slate-600 text-xs">{a.cuenta}</td>
                          <td className="px-4 py-2.5 text-slate-700">{a.glosa}</td>
                          <td className="px-4 py-2.5 font-black text-slate-800">{fmt(a.monto)}</td>
                          <td className="px-4 py-2.5 font-bold text-purple-600">{a.lado==='D'?fmt(a.monto):'—'}</td>
                          <td className="px-4 py-2.5 font-bold text-blue-600">{a.lado==='H'?fmt(a.monto):'—'}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{background:"#1e1b4b"}}>
                        <td colSpan={4} className="px-4 py-2.5 text-right text-xs font-black text-white">TOTALES</td>
                        <td className="px-4 py-2.5 font-black text-purple-300">{fmt(totalDebe)}</td>
                        <td className="px-4 py-2.5 font-black text-blue-300">{fmt(totalHaber)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ════════════════════════════════════
              PREVIRED AVANZADO
          ════════════════════════════════════ */}
          {tabInner === 'previred' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Previred — {periodo}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{liqEnriquecidas.length} trabajadores · Validación de RUTs incluida</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={validarRuts} disabled={validando||liqEnriquecidas.length===0}
                    className="flex items-center gap-1.5 px-4 py-2 bg-amber-50 hover:bg-amber-100 text-amber-700 font-bold text-sm rounded-xl transition-colors disabled:opacity-40">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                    {validando ? 'Validando...' : 'Validar RUTs'}
                  </button>
                  <button onClick={()=>generarPreviredAvanzado(liqEnriquecidas, periodo)} disabled={liqEnriquecidas.length===0}
                    className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-bold text-sm rounded-xl hover:opacity-90 shadow-sm disabled:opacity-40">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                    Descargar Previred
                  </button>
                </div>
              </div>

              {/* Resultados validación */}
              {validRuts && (
                <div className="space-y-2">
                  <div className="flex gap-3 mb-3">
                    <span className="text-xs font-black bg-emerald-100 text-emerald-700 px-2 py-1 rounded-lg">
                      ✓ {validRuts.filter(r=>r.ok).length} RUTs válidos
                    </span>
                    {validRuts.filter(r=>!r.ok).length > 0 && (
                      <span className="text-xs font-black bg-red-100 text-red-600 px-2 py-1 rounded-lg">
                        ✗ {validRuts.filter(r=>!r.ok).length} con error
                      </span>
                    )}
                  </div>
                  <div className="overflow-x-auto rounded-xl border border-slate-100">
                    <table className="w-full text-sm">
                      <thead>
                        <tr style={{background:"#1e1b4b"}}>
                          {['Trabajador','RUT','Estado','Detalle'].map(h=>(
                            <th key={h} className="px-3 py-2.5 text-left text-[10px] font-black text-slate-300 uppercase tracking-widest">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {validRuts.map((r,i)=>(
                          <tr key={i} className={`hover:bg-slate-50 ${!r.ok?'bg-red-50/40':''}`}>
                            <td className="px-3 py-2 font-bold text-slate-700">{r.nombre}</td>
                            <td className="px-3 py-2 font-mono text-slate-600">{r.rut}</td>
                            <td className="px-3 py-2">
                              <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${r.ok?'bg-emerald-100 text-emerald-700':'bg-red-100 text-red-600'}`}>
                                {r.ok?'✓ Válido':'✗ Error'}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-xs text-slate-500">{r.ok?'Módulo 11 OK':r.error}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Preview columnas Previred */}
              {liqEnriquecidas.length > 0 && (
                <div>
                  <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-3">Preview nómina Previred</p>
                  <div className="overflow-x-auto rounded-xl border border-slate-100">
                    <table className="w-full text-xs min-w-[900px]">
                      <thead>
                        <tr style={{background:"#1e1b4b"}}>
                          {['RUT','Nombre','AFP','Cot. AFP','Salud','Cot. Salud','SIS','Ces. Trab','Ces. Emp','Renta Imp.','Tipo'].map(h=>(
                            <th key={h} className="px-3 py-2.5 text-[10px] font-black text-slate-300 uppercase tracking-widest text-left">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {liqEnriquecidas.slice(0,8).map(({ trabajador, contrato, liq }, i) => {
                          const c = calcularLiquidacion({ ...contrato, ...liq });
                          return (
                            <tr key={i} className="hover:bg-slate-50">
                              <td className="px-3 py-2 font-mono font-bold text-slate-600">{trabajador?.rut||'—'}</td>
                              <td className="px-3 py-2 font-bold text-slate-700 max-w-[120px] truncate">{trabajador?.apellidoPaterno} {trabajador?.nombre}</td>
                              <td className="px-3 py-2 text-slate-500">{trabajador?.afp||'—'}</td>
                              <td className="px-3 py-2 text-red-400 font-bold">{fmt(c.afpM)}</td>
                              <td className="px-3 py-2 text-slate-500">{trabajador?.prevision||'Fonasa'}</td>
                              <td className="px-3 py-2 text-red-400 font-bold">{fmt(c.salM)}</td>
                              <td className="px-3 py-2 text-orange-400">{fmt(c.sisM)}</td>
                              <td className="px-3 py-2 text-red-400">{fmt(c.cesM)}</td>
                              <td className="px-3 py-2 text-red-400">{fmt(c.cesEmpM||0)}</td>
                              <td className="px-3 py-2 font-black text-purple-700">{fmt(c.imponible)}</td>
                              <td className="px-3 py-2">
                                <span className="text-[10px] font-bold bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">{contrato?.tipoContrato?.includes('Fijo')?'PF':'IND'}</span>
                              </td>
                            </tr>
                          );
                        })}
                        {liqEnriquecidas.length > 8 && (
                          <tr><td colSpan={11} className="px-3 py-2 text-center text-xs text-slate-400">... y {liqEnriquecidas.length-8} más en el archivo descargado</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ════════════════════════════════════
              ARCHIVO DE PAGO
          ════════════════════════════════════ */}
          {tabInner === 'pago' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Archivo TEF — {periodo}</p>
                  <p className="text-xs text-slate-400 mt-0.5">Formato compatible con portales bancarios chilenos (CSV)</p>
                </div>
                <button onClick={()=>generarArchivoPago(liqEnriquecidas, periodo)} disabled={liqEnriquecidas.length===0}
                  className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold text-sm rounded-xl hover:opacity-90 shadow-sm disabled:opacity-40">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"/></svg>
                  Descargar archivo pago
                </button>
              </div>

              {/* Info campos bancarios */}
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                <p className="text-xs font-black text-amber-800 mb-1.5">⚠ Datos bancarios requeridos por trabajador</p>
                <p className="text-xs text-amber-700">El archivo incluye los campos: RUT · Nombre · Banco · Tipo cuenta · N° cuenta · Monto · Glosa. Para que el archivo esté completo, cada trabajador debe tener registrados banco, tipo de cuenta y número de cuenta en su ficha (campo editable en Trabajadores).</p>
              </div>

              {/* Tabla preview pagos */}
              {liqEnriquecidas.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-slate-400 bg-slate-50 rounded-2xl">
                  <span className="text-4xl mb-3">🏦</span>
                  <p className="font-semibold">Sin liquidaciones para {periodo}</p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-100">
                  <table className="w-full text-sm">
                    <thead>
                      <tr style={{background:"#1e1b4b"}}>
                        {['Trabajador','RUT','Banco','N° Cuenta','Monto a pagar','Estado'].map(h=>(
                          <th key={h} className="px-3 py-2.5 text-[10px] font-black text-slate-300 uppercase tracking-widest text-left">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {liqEnriquecidas.map(({ trabajador, contrato, liq }, i) => {
                        const c      = calcularLiquidacion({ ...contrato, ...liq });
                        const iut    = calcularIUT(calcularRentaTributable(c), utm);
                        const monto  = Math.max(0, c.liquido - iut);
                        const tieneBanco = !!trabajador?.banco && !!trabajador?.nroCuenta;
                        return (
                          <tr key={i} className={`hover:bg-slate-50 ${!tieneBanco?'bg-amber-50/30':''}`}>
                            <td className="px-3 py-2.5 font-bold text-slate-800">{trabajador?.nombre} {trabajador?.apellidoPaterno}</td>
                            <td className="px-3 py-2.5 font-mono text-slate-500 text-xs">{trabajador?.rut||'—'}</td>
                            <td className="px-3 py-2.5 text-slate-500 text-xs">{trabajador?.banco||<span className="text-amber-500 font-bold">Sin datos</span>}</td>
                            <td className="px-3 py-2.5 font-mono text-slate-500 text-xs">{trabajador?.nroCuenta||'—'}</td>
                            <td className="px-3 py-2.5 font-black text-emerald-600">{fmt(monto)}</td>
                            <td className="px-3 py-2.5">
                              <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${liq.estado==='pagado'?'bg-emerald-100 text-emerald-700':'bg-amber-100 text-amber-700'}`}>
                                {liq.estado==='pagado'?'Pagado':'Pendiente'}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr style={{background:"#1e1b4b"}}>
                        <td colSpan={4} className="px-3 py-2.5 text-right text-xs font-black text-white">TOTAL A PAGAR</td>
                        <td className="px-3 py-2.5 font-black text-emerald-300">{fmt(totalesPeriodo.liquido)}</td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ════════════════════════════════════
              PLAN DE CUENTAS
          ════════════════════════════════════ */}
          {tabInner === 'plan' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Plan de cuentas contables</p>
                  <p className="text-xs text-slate-400 mt-0.5">Edita los códigos para adaptarlos a tu sistema contable (Softland, Conta+, etc.)</p>
                </div>
                <button onClick={()=>setEditPlan(e=>!e)}
                  className={`px-4 py-2 font-bold text-sm rounded-xl transition-colors ${editPlan?'bg-purple-600 text-white':'bg-slate-100 hover:bg-slate-200 text-slate-700'}`}>
                  {editPlan ? 'Guardar cambios' : '✏ Editar códigos'}
                </button>
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-100">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{background:"#1e1b4b"}}>
                      {['Lado','Código','Nombre de cuenta','Tipo'].map(h=>(
                        <th key={h} className="px-4 py-3 text-[10px] font-black text-slate-300 uppercase tracking-widest text-left">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {planCuentas.map((c, i) => (
                      <tr key={i} className={`hover:bg-slate-50 ${c.lado==='haber'?'bg-blue-50/20':''}`}>
                        <td className="px-4 py-2.5">
                          <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${c.lado==='debe'?'bg-purple-100 text-purple-700':'bg-blue-100 text-blue-700'}`}>
                            {c.lado.toUpperCase()}
                          </span>
                        </td>
                        <td className="px-4 py-2.5">
                          {editPlan
                            ? <input className="font-mono text-xs border border-slate-200 rounded-lg px-2 py-1 w-24 focus:outline-none focus:border-purple-400"
                                value={c.codigo} onChange={e=>setPlanCuentas(p=>p.map((x,j)=>j===i?{...x,codigo:e.target.value}:x))} />
                            : <span className="font-mono font-bold text-slate-600">{c.codigo}</span>}
                        </td>
                        <td className="px-4 py-2.5">
                          {editPlan
                            ? <input className="text-xs border border-slate-200 rounded-lg px-2 py-1 w-full focus:outline-none focus:border-purple-400"
                                value={c.nombre} onChange={e=>setPlanCuentas(p=>p.map((x,j)=>j===i?{...x,nombre:e.target.value}:x))} />
                            : <span className="text-slate-700">{c.nombre}</span>}
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${c.tipo==='gasto'?'bg-red-100 text-red-600':'bg-slate-100 text-slate-500'}`}>
                            {c.tipo}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="bg-slate-50 rounded-xl px-4 py-3">
                <p className="text-xs text-slate-500"><strong>Compatibilidad:</strong> Los códigos del plan de cuentas son editables para adaptarse a Softland, Conta+, TuCuenta u otro sistema contable. Los cambios aplican solo a la sesión actual. Para persistirlos, copia los códigos actualizados a tu sistema.</p>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
function PreviredAvanzadoSection() { return <ContabilidadSection initialTab="previred" />; }
function ArchivoPagoSection()      { return <ContabilidadSection initialTab="pago" />; }

export { AnexosSection, ImpuestosSection, AsistenciaSection, Organigrama, BandasSection, CentrosCostoSection, OrganizacionSection, ReportesSection, ContabilidadSection, PreviredAvanzadoSection, ArchivoPagoSection };