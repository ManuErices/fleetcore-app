import { useState, useEffect, useCallback, useRef } from 'react';
import { db } from '../../lib/firebase';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, orderBy, serverTimestamp, setDoc } from 'firebase/firestore';
import { getAuth, createUserWithEmailAndPassword, fetchSignInMethodsForEmail } from 'firebase/auth';
import * as Shared from './shared';
import * as Calc from './calculo';
import * as PDFs from './pdfs';
import * as Modals from './modals';
const { inp, EMPRESAS, AREAS, AFPS, ISAPRES, TIPOS_CONTRATO, JORNADAS, CENTROS_COSTO,
  CAUSALES_TERMINO, TIPOS_PERIODO, MESES, IMM_2026, TASAS, TASAS_AFP,
  COLORES_AREA, UTM_DEFAULT, TRAMOS_IUT,
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

function DashboardSection() {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [mesRef,  setMesRef]  = useState(() => {
    const h = new Date();
    return `${h.getFullYear()}-${String(h.getMonth()+1).padStart(2,'0')}`;
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [tSnap, cSnap, rSnap, fSnap] = await Promise.all([
        getDocs(collection(db, 'trabajadores')),
        getDocs(collection(db, 'contratos')),
        getDocs(collection(db, 'remuneraciones')),
        getDocs(collection(db, 'finiquitos')),
      ]);
      const trabajadores   = tSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const contratos      = cSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const remuneraciones = rSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const finiquitos     = fSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      setData({ trabajadores, contratos, remuneraciones, finiquitos });
    } catch(e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return (
    <div className="flex items-center justify-center py-32">
      <div className="w-10 h-10 rounded-full animate-spin" style={{border:"2px solid rgba(124,58,237,0.15)", borderTopColor:"#7c3aed"}} />
    </div>
  );
  if (!data) return null;

  const { trabajadores, contratos, remuneraciones, finiquitos } = data;
  const hoy      = new Date();
  const fmt      = n => `$${(n||0).toLocaleString('es-CL')}`;
  const fmtK     = n => n >= 1000000 ? `$${(n/1000000).toFixed(1)}M` : n >= 1000 ? `$${(n/1000).toFixed(0)}K` : fmt(n);

  // ── KPIs principales ──
  const activos      = trabajadores.filter(t => t.estado === 'activo');
  const inactivos    = trabajadores.filter(t => t.estado === 'inactivo');
  const finiquitados = trabajadores.filter(t => t.estado === 'finiquitado');

  // Nómina mes de referencia
  const [anioRef, mesNumRef] = mesRef.split('-');
  const remMes = remuneraciones.filter(r => r.anio === anioRef && r.mes === mesNumRef);
  const masaSalarialBruta = remMes.reduce((s, r) => {
    const c = contratos.find(c => c.id === r.contratoId);
    if (!c) return s;
    const calc = calcularLiquidacion({ ...c, ...r });
    return s + calc.imponible + calc.noImponible;
  }, 0);
  const masaSalarialLiquida = remMes.reduce((s, r) => {
    const c = contratos.find(c => c.id === r.contratoId);
    if (!c) return s;
    const calc = calcularLiquidacion({ ...c, ...r });
    return s + calc.liquido;
  }, 0);
  const costoCotizaciones = remMes.reduce((s, r) => {
    const c = contratos.find(c => c.id === r.contratoId);
    if (!c) return s;
    const calc = calcularLiquidacion({ ...c, ...r });
    return s + calc.totalDescuentos + calc.cesEmpM + calc.sisEmpM;
  }, 0);
  const costoTotalEmpresa = masaSalarialBruta + costoCotizaciones;

  // ── Alertas críticas ──
  const alertas = [];

  // Contratos por vencer
  const vigentes = contratos.filter(c => c.estado === 'vigente' && c.fechaFin);
  vigentes.forEach(c => {
    const diasRestantes = Math.ceil((new Date(c.fechaFin) - hoy) / 86400000);
    const t = trabajadores.find(t => t.id === c.trabajadorId);
    const nombre = t ? `${t.nombre} ${t.apellidoPaterno}` : 'Trabajador';
    if (diasRestantes < 0) {
      alertas.push({ tipo: 'rojo', icono: '⚠', texto: `Contrato VENCIDO: ${nombre} — venció hace ${Math.abs(diasRestantes)} días`, cat: 'Contrato' });
    } else if (diasRestantes <= 15) {
      alertas.push({ tipo: 'rojo', icono: '🔴', texto: `${nombre} — vence en ${diasRestantes} día${diasRestantes!==1?'s':''}`, cat: 'Contrato urgente' });
    } else if (diasRestantes <= 30) {
      alertas.push({ tipo: 'naranjo', icono: '🟠', texto: `${nombre} — vence en ${diasRestantes} días`, cat: 'Contrato 30 días' });
    } else if (diasRestantes <= 60) {
      alertas.push({ tipo: 'amarillo', icono: '🟡', texto: `${nombre} — vence en ${diasRestantes} días`, cat: 'Contrato 60 días' });
    }
  });

  // Finiquitos sin ratificar
  const sinRatificar = finiquitos.filter(f => f.estadoFirma !== 'ratificado');
  sinRatificar.forEach(f => {
    const t = trabajadores.find(t => t.id === f.trabajadorId);
    const nombre = t ? `${t.nombre} ${t.apellidoPaterno}` : 'Trabajador';
    alertas.push({ tipo: 'naranjo', icono: '📄', texto: `Finiquito sin ratificar: ${nombre}`, cat: 'Finiquito' });
  });

  // Liquidaciones pendientes pago mes actual
  const liqPendientes = remMes.filter(r => r.estado === 'pendiente');
  if (liqPendientes.length > 0) {
    alertas.push({ tipo: 'amarillo', icono: '💰', texto: `${liqPendientes.length} liquidación${liqPendientes.length!==1?'es':''} pendiente${liqPendientes.length!==1?'s':''} de pago en ${MESES[parseInt(mesNumRef)-1]} ${anioRef}`, cat: 'Remuneración' });
  }

  // Cumpleaños esta semana
  const inicioSemana = new Date(hoy); inicioSemana.setDate(hoy.getDate() - hoy.getDay());
  const finSemana    = new Date(inicioSemana); finSemana.setDate(inicioSemana.getDate() + 6);
  activos.forEach(t => {
    if (!t.fechaNacimiento) return;
    const fn  = new Date(t.fechaNacimiento);
    const esté = new Date(hoy.getFullYear(), fn.getMonth(), fn.getDate());
    if (esté >= inicioSemana && esté <= finSemana) {
      alertas.push({ tipo: 'verde', icono: '🎂', texto: `Cumpleaños: ${t.nombre} ${t.apellidoPaterno} — ${esté.toLocaleDateString('es-CL')}`, cat: 'Evento' });
    }
  });

  // Aniversarios laborales este mes
  activos.forEach(t => {
    const c = contratos.find(c => c.trabajadorId === t.id && c.estado === 'vigente');
    if (!c?.fechaInicio) return;
    const fi = new Date(c.fechaInicio);
    if (fi.getMonth() === hoy.getMonth() && fi.getFullYear() < hoy.getFullYear()) {
      const anios = hoy.getFullYear() - fi.getFullYear();
      alertas.push({ tipo: 'verde', icono: '🏆', texto: `Aniversario: ${t.nombre} ${t.apellidoPaterno} — ${anios} año${anios!==1?'s':''} este mes`, cat: 'Evento' });
    }
  });

  // Ordenar: rojos primero
  const prioAlerta = { rojo:0, naranjo:1, amarillo:2, verde:3 };
  alertas.sort((a, b) => prioAlerta[a.tipo] - prioAlerta[b.tipo]);

  // ── Distribución por empresa ──
  const coloresEmpresas = ['#7c3aed','#6366f1','#0ea5e9','#10b981','#f59e0b','#f43f5e'];
  const distEmpresa = EMPRESAS.map((emp, i) => ({
    label: emp,
    value: activos.filter(t => t.empresa === emp).length,
    color: coloresEmpresas[i % coloresEmpresas.length],
  })).filter(e => e.value > 0);

  // ── Distribución por área ──
  const distArea = AREAS.map((area, i) => ({
    label: area,
    value: activos.filter(t => t.area === area).length,
    color: coloresEmpresas[i % coloresEmpresas.length],
  })).filter(a => a.value > 0);

  // ── Evolución nómina 6 meses ──
  const evolucion = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() - (5 - i), 1);
    const anio = String(d.getFullYear());
    const mes  = String(d.getMonth() + 1).padStart(2, '0');
    const rems = remuneraciones.filter(r => r.anio === anio && r.mes === mes);
    const total = rems.reduce((s, r) => {
      const c = contratos.find(c => c.id === r.contratoId);
      if (!c) return s;
      return s + (calcularLiquidacion({ ...c, ...r }).liquido || 0);
    }, 0);
    return { label: MESES[d.getMonth()].slice(0, 3), value: total };
  });

  // ── Próximos vencimientos (30 días) ──
  const proximosVenc = vigentes
    .map(c => {
      const dias = Math.ceil((new Date(c.fechaFin) - hoy) / 86400000);
      const t    = trabajadores.find(t => t.id === c.trabajadorId);
      return { ...c, diasRestantes: dias, _trabajador: t };
    })
    .filter(c => c.diasRestantes <= 90)
    .sort((a, b) => a.diasRestantes - b.diasRestantes)
    .slice(0, 8);

  // ── Colores de alerta ──
  const bgAlerta  = { rojo:'bg-red-50 border-red-200', naranjo:'bg-orange-50 border-orange-200', amarillo:'bg-amber-50 border-amber-200', verde:'bg-emerald-50 border-emerald-200' };
  const txtAlerta = { rojo:'text-red-700', naranjo:'text-orange-700', amarillo:'text-amber-700', verde:'text-emerald-700' };
  const badgeAlerta={ rojo:'bg-red-100 text-red-600', naranjo:'bg-orange-100 text-orange-600', amarillo:'bg-amber-100 text-amber-600', verde:'bg-emerald-100 text-emerald-600' };

  return (
    <div className="space-y-6 pb-6">

      {/* ── Selector mes referencia ── */}
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-slate-500">Período de referencia para nómina</p>
        <input type="month" className="px-3 py-1.5 border-2 border-slate-200 rounded-xl text-sm focus:outline-none focus:border-purple-400 bg-white font-semibold"
          value={mesRef} onChange={e=>setMesRef(e.target.value)} />
      </div>

      {/* ── KPIs fila 1 — Dotación ── */}
      <div>
        <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-3">Dotación</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label:'Total trabajadores',   value: trabajadores.length,  color:'text-purple-600',  bg:'bg-purple-50',  dot:'bg-purple-500' },
            { label:'Activos',              value: activos.length,        color:'text-emerald-600', bg:'bg-emerald-50', dot:'bg-emerald-500'},
            { label:'Inactivos',            value: inactivos.length,      color:'text-slate-500',   bg:'bg-slate-50',   dot:'bg-slate-400' },
            { label:'Finiquitados',         value: finiquitados.length,   color:'text-rose-500',    bg:'bg-rose-50',    dot:'bg-rose-400'  },
          ].map(({ label, value, color, bg, dot }) => (
            <div key={label} className={`${bg} border border-white rounded-2xl px-5 py-4 shadow-sm`}>
              <div className="flex items-center gap-2 mb-1">
                <div className={`w-2 h-2 rounded-full ${dot}`} />
                <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">{label}</p>
              </div>
              <p className={`text-4xl font-black ${color}`}>{value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── KPIs fila 2 — Nómina ── */}
      <div>
        <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-3">Nómina — {MESES[parseInt(mesNumRef)-1]} {anioRef} <span className="normal-case font-semibold">({remMes.length} liquidaciones)</span></p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label:'Masa salarial bruta',   value: masaSalarialBruta,    color:'text-slate-700'  },
            { label:'Total cotizaciones',    value: costoCotizaciones,    color:'text-red-500'    },
            { label:'Total líquido pagado',  value: masaSalarialLiquida,  color:'text-emerald-600'},
            { label:'Costo total empresa',   value: costoTotalEmpresa,    color:'text-purple-700' },
          ].map(({ label, value, color }) => (
            <div key={label} className="rounded-2xl px-5 py-4" style={{background:"#fff", border:"1px solid rgba(0,0,0,0.06)", boxShadow:"0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(124,58,237,0.04)"}}>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">{label}</p>
              <p className={`text-2xl font-black ${color} mt-1`}>{fmtK(value)}</p>
              <p className="text-xs text-slate-400 mt-0.5">{fmt(value)}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Fila central — Alertas + Vencimientos ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* Alertas */}
        <div className="rounded-2xl overflow-hidden" style={{background:"#fff", border:"1px solid rgba(0,0,0,0.06)", boxShadow:"0 2px 8px rgba(0,0,0,0.05), 0 8px 24px rgba(124,58,237,0.04)"}}>
          <div className="bg-slate-800 px-5 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/></svg>
              <h3 className="text-sm font-black text-white">Alertas</h3>
            </div>
            {alertas.length > 0 && (
              <span className="bg-red-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full">{alertas.length}</span>
            )}
          </div>
          <div className="divide-y divide-slate-50 max-h-80 overflow-y-auto">
            {alertas.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-slate-400">
                <span className="text-3xl mb-2">✅</span>
                <p className="text-sm font-semibold">Sin alertas pendientes</p>
              </div>
            ) : alertas.map((a, i) => (
              <div key={i} className={`flex items-start gap-3 px-4 py-3 border-l-4 ${bgAlerta[a.tipo]}`} style={{borderLeftColor: a.tipo==='rojo'?'#ef4444':a.tipo==='naranjo'?'#f97316':a.tipo==='amarillo'?'#f59e0b':'#10b981'}}>
                <span className="text-base flex-shrink-0 mt-0.5">{a.icono}</span>
                <div className="flex-1 min-w-0">
                  <p className={`text-xs font-bold ${txtAlerta[a.tipo]}`}>{a.texto}</p>
                </div>
                <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full flex-shrink-0 ${badgeAlerta[a.tipo]}`}>{a.cat}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Próximos vencimientos */}
        <div className="rounded-2xl overflow-hidden" style={{background:"#fff", border:"1px solid rgba(0,0,0,0.06)", boxShadow:"0 2px 8px rgba(0,0,0,0.05), 0 8px 24px rgba(124,58,237,0.04)"}}>
          <div className="bg-slate-800 px-5 py-3 flex items-center gap-2">
            <svg className="w-4 h-4 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
            <h3 className="text-sm font-black text-white">Vencimientos próximos <span className="text-slate-400 font-normal text-xs">(90 días)</span></h3>
          </div>
          <div className="divide-y divide-slate-50 max-h-80 overflow-y-auto">
            {proximosVenc.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-slate-400">
                <span className="text-3xl mb-2">📅</span>
                <p className="text-sm font-semibold">Sin vencimientos en 90 días</p>
              </div>
            ) : proximosVenc.map(c => {
              const urgente = c.diasRestantes <= 0;
              const pronto  = c.diasRestantes <= 15;
              const nombre  = c._trabajador ? `${c._trabajador.nombre} ${c._trabajador.apellidoPaterno}` : '—';
              return (
                <div key={c.id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50/60">
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${urgente?'bg-red-500':pronto?'bg-orange-500':c.diasRestantes<=30?'bg-amber-400':'bg-slate-300'}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-800 truncate">{nombre}</p>
                    <p className="text-xs text-slate-400">{c.tipoContrato} · {c.cargo||'Sin cargo'}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className={`text-xs font-black ${urgente?'text-red-600':pronto?'text-orange-600':c.diasRestantes<=30?'text-amber-600':'text-slate-500'}`}>
                      {urgente ? `Venció` : `${c.diasRestantes}d`}
                    </p>
                    <p className="text-[10px] text-slate-400">{c.fechaFin}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Fila inferior — Gráfico nómina + Distribución empresa + Área ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Evolución nómina 6 meses */}
        <div className="lg:col-span-1 bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Evolución nómina</p>
              <p className="text-sm font-black text-slate-700 mt-0.5">Últimos 6 meses</p>
            </div>
            <Sparkline data={evolucion.map(e=>e.value)} />
          </div>
          <div className="space-y-2">
            {evolucion.map((e, i) => {
              const max = Math.max(...evolucion.map(x=>x.value), 1);
              const pct = max ? (e.value / max) * 100 : 0;
              const esCurrent = i === evolucion.length - 1;
              return (
                <div key={e.label} className="flex items-center gap-3">
                  <span className="text-[11px] font-bold text-slate-400 w-8 flex-shrink-0">{e.label}</span>
                  <div className="flex-1 bg-slate-100 rounded-full h-2 overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${esCurrent?'bg-gradient-to-r from-purple-500 to-indigo-500':'bg-slate-300'}`}
                      style={{ width: `${pct}%` }} />
                  </div>
                  <span className={`text-[11px] font-bold w-14 text-right flex-shrink-0 ${esCurrent?'text-purple-600':'text-slate-400'}`}>{fmtK(e.value)}</span>
                </div>
              );
            })}
          </div>
          {evolucion.every(e => e.value === 0) && (
            <p className="text-xs text-slate-400 text-center mt-3">Sin liquidaciones registradas aún</p>
          )}
        </div>

        {/* Distribución empresa */}
        <div className="rounded-2xl p-5" style={{background:"#fff", border:"1px solid rgba(0,0,0,0.06)", boxShadow:"0 2px 8px rgba(0,0,0,0.04)"}}>
          <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-1">Por empresa</p>
          <p className="text-sm font-black text-slate-700 mb-4">Activos ({activos.length})</p>
          {distEmpresa.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-6">Sin trabajadores activos</p>
          ) : (
            <div className="flex gap-4 items-center">
              <DonutChart segments={distEmpresa} />
              <div className="flex-1 space-y-2 min-w-0">
                {distEmpresa.map(e => (
                  <div key={e.label} className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: e.color }} />
                    <span className="text-[11px] font-bold text-slate-600 truncate flex-1">{e.label}</span>
                    <span className="text-[11px] font-black text-slate-800 flex-shrink-0">{e.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Distribución área */}
        <div className="rounded-2xl p-5" style={{background:"#fff", border:"1px solid rgba(0,0,0,0.06)", boxShadow:"0 2px 8px rgba(0,0,0,0.04)"}}>
          <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-1">Por área</p>
          <p className="text-sm font-black text-slate-700 mb-4">Distribución activos</p>
          {distArea.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-6">Sin datos de área</p>
          ) : (
            <div className="space-y-2.5">
              {distArea.sort((a,b)=>b.value-a.value).map(a => {
                const pct = Math.round((a.value / activos.length) * 100);
                return (
                  <div key={a.label}>
                    <div className="flex justify-between mb-1">
                      <span className="text-[11px] font-bold text-slate-600">{a.label}</span>
                      <span className="text-[11px] font-black text-slate-700">{a.value} <span className="text-slate-400 font-normal">({pct}%)</span></span>
                    </div>
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: a.color }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Fila resumen estados contratos + finiquitos ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Contratos */}
        <div className="rounded-2xl p-5" style={{background:"#fff", border:"1px solid rgba(0,0,0,0.06)", boxShadow:"0 2px 8px rgba(0,0,0,0.04)"}}>
          <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-3">Contratos</p>
          {[
            ['Vigentes',   contratos.filter(c=>c.estado==='vigente').length,   'text-emerald-600','bg-emerald-100'],
            ['Por vencer', vigentes.filter(c=>{ const d=Math.ceil((new Date(c.fechaFin)-hoy)/86400000); return d<=30 && d>0;}).length, 'text-amber-600','bg-amber-100'],
            ['Terminados', contratos.filter(c=>c.estado==='terminado').length, 'text-slate-500','bg-slate-100'],
          ].map(([l,v,tc,bg])=>(
            <div key={l} className="flex items-center justify-between py-1.5">
              <span className="text-sm text-slate-600">{l}</span>
              <span className={`text-sm font-black px-2.5 py-0.5 rounded-full ${bg} ${tc}`}>{v}</span>
            </div>
          ))}
        </div>

        {/* Liquidaciones */}
        <div className="rounded-2xl p-5" style={{background:"#fff", border:"1px solid rgba(0,0,0,0.06)", boxShadow:"0 2px 8px rgba(0,0,0,0.04)"}}>
          <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-3">Liquidaciones mes actual</p>
          {[
            ['Procesadas', remMes.length,                               'text-purple-600','bg-purple-100'],
            ['Pagadas',    remMes.filter(r=>r.estado==='pagado').length,'text-emerald-600','bg-emerald-100'],
            ['Pendientes', liqPendientes.length,                        liqPendientes.length>0?'text-amber-600':'text-slate-400', liqPendientes.length>0?'bg-amber-100':'bg-slate-100'],
          ].map(([l,v,tc,bg])=>(
            <div key={l} className="flex items-center justify-between py-1.5">
              <span className="text-sm text-slate-600">{l}</span>
              <span className={`text-sm font-black px-2.5 py-0.5 rounded-full ${bg} ${tc}`}>{v}</span>
            </div>
          ))}
        </div>

        {/* Finiquitos */}
        <div className="rounded-2xl p-5" style={{background:"#fff", border:"1px solid rgba(0,0,0,0.06)", boxShadow:"0 2px 8px rgba(0,0,0,0.04)"}}>
          <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-3">Finiquitos</p>
          {[
            ['Total',       finiquitos.length,                                       'text-slate-700','bg-slate-100'],
            ['Ratificados', finiquitos.filter(f=>f.estadoFirma==='ratificado').length,'text-emerald-600','bg-emerald-100'],
            ['Sin ratif.',  sinRatificar.length,                                      sinRatificar.length>0?'text-amber-600':'text-slate-400', sinRatificar.length>0?'bg-amber-100':'bg-slate-100'],
          ].map(([l,v,tc,bg])=>(
            <div key={l} className="flex items-center justify-between py-1.5">
              <span className="text-sm text-slate-600">{l}</span>
              <span className={`text-sm font-black px-2.5 py-0.5 rounded-full ${bg} ${tc}`}>{v}</span>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}

function TrabajadoresSection() {
  const [data,    setData]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal,   setModal]   = useState(false);
  const [editData,setEditData]= useState(null);
  const [confirm, setConfirm] = useState(null);
  const [ficha,   setFicha]   = useState(null);
  const [busqueda,      setBusqueda]      = useState('');
  const [filtroArea,    setFiltroArea]    = useState('');
  const [filtroEmpresa, setFiltroEmpresa] = useState('');
  const [filtroEstado,  setFiltroEstado]  = useState('activo');
  const [pagina, setPagina] = useState(1);
  const POR_PAGINA = 10;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db,'trabajadores'), orderBy('apellidoPaterno')));
      setData(snap.docs.map(d => ({ id:d.id, ...d.data() })));
    } catch { setData([]); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const openNew  = ()    => { setEditData(null); setModal(true); };
  const openEdit = (row) => { setEditData(row);  setModal(true); setFicha(null); };

  const handleDelete = async () => {
    try { await deleteDoc(doc(db,'trabajadores',confirm.id)); load(); }
    catch(e) { alert('Error: '+e.message); }
    setConfirm(null);
  };

  const filtrados = data.filter(r => {
    const q    = busqueda.toLowerCase();
    const full = `${r.nombre} ${r.apellidoPaterno} ${r.apellidoMaterno||''}`.toLowerCase();
    return (
      (!q            || full.includes(q) || r.rut?.includes(busqueda) || r.cargo?.toLowerCase().includes(q)) &&
      (!filtroArea   || r.area    === filtroArea) &&
      (!filtroEmpresa|| r.empresa === filtroEmpresa) &&
      (!filtroEstado || r.estado  === filtroEstado)
    );
  });

  const totalPag = Math.ceil(filtrados.length / POR_PAGINA);
  const paginados = filtrados.slice((pagina-1)*POR_PAGINA, pagina*POR_PAGINA);

  const stats = [
    { label:'Total trabajadores', value: data.length,                                    color:'text-purple-600', bg:'bg-white border-slate-100' },
    { label:'Activos',            value: data.filter(d=>d.estado==='activo').length,      color:'text-emerald-600',bg:'bg-white border-slate-100' },
    { label:'Inactivos',          value: data.filter(d=>d.estado==='inactivo').length,    color:'text-slate-500',  bg:'bg-white border-slate-100' },
    { label:'Finiquitados',       value: data.filter(d=>d.estado==='finiquitado').length, color:'text-red-500',    bg:'bg-white border-slate-100' },
  ];

  const estadoBadge = {
    activo:      'bg-emerald-100 text-emerald-700',
    inactivo:    'bg-slate-100 text-slate-500',
    finiquitado: 'bg-red-100 text-red-600',
  };

  return (
    <>
      {/* Stats — estilo números grandes igual al dashboard */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {stats.map(({ label, value, color, bg }) => (
          <div key={label} className={`${bg} border rounded-2xl px-5 py-4 shadow-sm`}>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">{label}</p>
            <p className={`text-4xl font-black ${color} mt-1`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Card principal con tabla */}
      <div className="rounded-2xl overflow-hidden" style={{background:"#fff", border:"1px solid rgba(0,0,0,0.06)", boxShadow:"0 2px 8px rgba(0,0,0,0.05), 0 8px 24px rgba(124,58,237,0.04)"}}>

        {/* Header con gradiente — igual a ReporteWorkFleet */}
        <div className="px-5 py-4 flex items-center justify-between" style={{background:"linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)"}}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <div>
              <h2 className="text-base font-black text-white flex items-center gap-2">
                Nómina de Personal
                <span className="text-xs bg-white/20 text-white/90 px-2 py-0.5 rounded-full">{filtrados.length}</span>
              </h2>
              <p className="text-xs text-white/70 mt-0.5">Gestión de trabajadores registrados</p>
            </div>
          </div>
          <button onClick={openNew} className="flex items-center gap-1.5 px-4 py-2 font-bold text-sm rounded-xl transition-all active:scale-95" style={{background:"rgba(255,255,255,0.12)", color:"#e0d9ff", border:"1px solid rgba(255,255,255,0.15)"}}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            + Nuevo Trabajador
          </button>
        </div>

        {/* Filtros */}
        <div className="px-5 py-3 border-b flex flex-wrap gap-2" style={{borderColor:"rgba(0,0,0,0.05)", background:"rgba(248,248,252,0.8)"}}>
          <div className="relative flex-1 min-w-[160px]">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z"/>
            </svg>
            <input
              className="w-full pl-9 pr-4 py-2 border-2 border-slate-200 rounded-xl text-sm focus:outline-none focus:border-purple-400 bg-white transition-colors"
              placeholder="Buscar nombre, RUT, cargo..."
              value={busqueda} onChange={e=>{ setBusqueda(e.target.value); setPagina(1); }}
            />
          </div>
          <select className="px-3 py-2 border-2 border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:border-purple-400 transition-colors" value={filtroArea} onChange={e=>{ setFiltroArea(e.target.value); setPagina(1); }}>
            <option value="">Todas las áreas</option>
            {AREAS.map(a=><option key={a}>{a}</option>)}
          </select>
          <select className="px-3 py-2 border-2 border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:border-purple-400 transition-colors" value={filtroEmpresa} onChange={e=>{ setFiltroEmpresa(e.target.value); setPagina(1); }}>
            <option value="">Todas las empresas</option>
            {EMPRESAS.map(e=><option key={e}>{e}</option>)}
          </select>
          <select className="px-3 py-2 border-2 border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:border-purple-400 transition-colors" value={filtroEstado} onChange={e=>{ setFiltroEstado(e.target.value); setPagina(1); }}>
            <option value="">Todos los estados</option>
            <option value="activo">Activos</option>
            <option value="inactivo">Inactivos</option>
            <option value="finiquitado">Finiquitados</option>
          </select>
        </div>

        {/* Tabla */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 rounded-full animate-spin" style={{border:"2px solid rgba(124,58,237,0.15)", borderTopColor:"#7c3aed"}} />
          </div>
        ) : paginados.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-3" style={{background:"rgba(124,58,237,0.06)", border:"1px solid rgba(124,58,237,0.1)"}}>
              <svg className="w-7 h-7 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <p className="font-semibold text-sm">{busqueda||filtroArea||filtroEmpresa ? 'Sin resultados para estos filtros' : 'No hay trabajadores registrados'}</p>
            {!busqueda && !filtroArea && !filtroEmpresa && (
              <button onClick={openNew} className="mt-3 text-sm text-purple-600 font-bold hover:underline">+ Agregar el primero</button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[750px]">
              <thead>
                <tr style={{background:"#1e1b4b"}}>
                  {['Trabajador','RUT','Área','Empresa','Cargo','F. Ingreso','Estado','Acciones'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-[11px] font-black text-slate-300 uppercase tracking-widest">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {paginados.map(row => {
                  const nombre = `${row.nombre} ${row.apellidoPaterno}`.trim();
                  const ini    = `${row.nombre?.[0]||''}${row.apellidoPaterno?.[0]||''}`.toUpperCase();
                  return (
                    <tr key={row.id} className="transition-colors" style={{}} onMouseEnter={e=>e.currentTarget.style.background="#faf9ff"} onMouseLeave={e=>e.currentTarget.style.background=""}>
                      <td className="px-4 py-3">
                        <button onClick={()=>setFicha(row)} className="flex items-center gap-3 text-left hover:opacity-80 transition-opacity">
                          <div className="w-8 h-8 rounded-xl flex items-center justify-center text-white font-black text-xs flex-shrink-0" style={{background:"linear-gradient(135deg, #7c3aed, #4f46e5)", boxShadow:"0 2px 6px rgba(124,58,237,0.25)"}}>{ini}</div>
                          <span className="font-bold text-slate-800 text-sm hover:text-purple-700 transition-colors">{nombre}</span>
                        </button>
                      </td>
                      <td className="px-4 py-3 text-sm font-mono text-slate-500">{row.rut||'—'}</td>
                      <td className="px-4 py-3 text-sm text-slate-600">{row.area||'—'}</td>
                      <td className="px-4 py-3 text-sm text-slate-600">{row.empresa||'—'}</td>
                      <td className="px-4 py-3 text-sm text-slate-500 max-w-[140px] truncate">{row.cargo||'—'}</td>
                      <td className="px-4 py-3 text-sm text-slate-500">{row.fechaIngreso||'—'}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${estadoBadge[row.estado||'activo']}`}>
                          {row.estado||'activo'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button onClick={()=>generarPDFContrato(row, row._trabajador)} className="p-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 rounded-lg transition-colors" title="Descargar contrato PDF">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                          </button>
                          <button onClick={()=>openEdit(row)} className="p-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-lg transition-colors" title="Editar">
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

        {/* Paginación */}
        {totalPag > 1 && (
          <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between bg-slate-50/40">
            <p className="text-xs text-slate-400 font-medium">
              Mostrando {(pagina-1)*POR_PAGINA+1}–{Math.min(pagina*POR_PAGINA, filtrados.length)} de <strong>{filtrados.length}</strong>
            </p>
            <div className="flex gap-1">
              <button disabled={pagina===1}       onClick={()=>setPagina(p=>p-1)} className="px-3 py-1.5 text-xs font-bold bg-white border-2 border-slate-200 hover:border-purple-300 hover:text-purple-600 disabled:opacity-40 rounded-xl transition-all">← Ant</button>
              <button disabled={pagina===totalPag} onClick={()=>setPagina(p=>p+1)} className="px-3 py-1.5 text-xs font-bold bg-white border-2 border-slate-200 hover:border-purple-300 hover:text-purple-600 disabled:opacity-40 rounded-xl transition-all">Sig →</button>
            </div>
          </div>
        )}
      </div>

      <TrabajadorModal isOpen={modal} onClose={()=>setModal(false)} editData={editData} onSaved={load} />
      <ConfirmDialog isOpen={!!confirm} onClose={()=>setConfirm(null)} onConfirm={handleDelete} nombre={confirm?`${confirm.nombre} ${confirm.apellidoPaterno}`:''} />
      <FichaTrabajador trabajador={ficha} onEdit={()=>openEdit(ficha)} onClose={()=>setFicha(null)} />
    </>
  );
}

function ContratosSection() {
  const [contratos,    setContratos]   = useState([]);
  const [trabajadores, setTrabajadores]= useState([]);
  const [loading,      setLoading]     = useState(true);
  const [modal,        setModal]       = useState(false);
  const [editData,     setEditData]    = useState(null);
  const [confirm,      setConfirm]     = useState(null);
  const [busqueda,     setBusqueda]    = useState('');
  const [filtroTipo,   setFiltroTipo]  = useState('');
  const [filtroEstado, setFiltroEstado]= useState('vigente');
  const [pagina,       setPagina]      = useState(1);
  const POR_PAGINA = 10;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cSnap, tSnap] = await Promise.all([
        getDocs(query(collection(db,'contratos'), orderBy('createdAt','desc'))),
        getDocs(collection(db,'trabajadores')),
      ]);
      setContratos(cSnap.docs.map(d=>({id:d.id,...d.data()})));
      setTrabajadores(tSnap.docs.map(d=>({id:d.id,...d.data()})));
    } catch { setContratos([]); setTrabajadores([]); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const openNew  = ()    => { setEditData(null); setModal(true); };
  const openEdit = (row) => { setEditData(row);  setModal(true); };

  const handleDelete = async () => {
    try { await deleteDoc(doc(db,'contratos',confirm.id)); load(); }
    catch(e) { alert('Error: '+e.message); }
    setConfirm(null);
  };

  // Enriquecer contratos con datos del trabajador
  const contratosEnriquecidos = contratos.map(c => {
    const t = trabajadores.find(t=>t.id===c.trabajadorId);
    return { ...c, _trabajador: t };
  });

  // Filtros
  const filtrados = contratosEnriquecidos.filter(c => {
    const q    = busqueda.toLowerCase();
    const full = `${c._trabajador?.nombre||''} ${c._trabajador?.apellidoPaterno||''} ${c._trabajador?.rut||''}`.toLowerCase();
    return (
      (!q           || full.includes(q) || c.cargo?.toLowerCase().includes(q)) &&
      (!filtroTipo  || c.tipoContrato === filtroTipo) &&
      (!filtroEstado|| c.estado       === filtroEstado)
    );
  });

  const totalPag  = Math.ceil(filtrados.length / POR_PAGINA);
  const paginados = filtrados.slice((pagina-1)*POR_PAGINA, pagina*POR_PAGINA);

  // Stats
  const hoy = new Date().toISOString().split('T')[0];
  const porVencer = contratos.filter(c => {
    if (!c.fechaFin || c.estado !== 'vigente') return false;
    const dias = diasEntre(hoy, c.fechaFin);
    return dias >= 0 && dias <= 30;
  }).length;

  const stats = [
    { label:'Total contratos', value: contratos.length,                                         color:'text-purple-600' },
    { label:'Vigentes',        value: contratos.filter(c=>c.estado==='vigente').length,          color:'text-emerald-600' },
    { label:'Por vencer (30d)',value: porVencer,                                                 color: porVencer>0?'text-amber-500':'text-slate-400' },
    { label:'Terminados',      value: contratos.filter(c=>c.estado==='terminado'||c.estado==='vencido').length, color:'text-slate-500' },
  ];

  const estadoBadge = {
    vigente:   'bg-emerald-100 text-emerald-700',
    vencido:   'bg-red-100 text-red-600',
    terminado: 'bg-slate-100 text-slate-500',
  };

  const tipoBadge = {
    'Indefinido':    'bg-blue-100 text-blue-700',
    'Plazo Fijo':    'bg-amber-100 text-amber-700',
    'Obra o Faena':  'bg-orange-100 text-orange-700',
  };

  return (
    <>
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {stats.map(({ label, value, color }) => (
          <div key={label} className="rounded-2xl px-5 py-4" style={{background:"#fff", border:"1px solid rgba(0,0,0,0.06)", boxShadow:"0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(124,58,237,0.04)"}}>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">{label}</p>
            <p className={`text-4xl font-black ${color} mt-1`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Alertas de vencimiento próximo */}
      {porVencer > 0 && (
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4 mb-5">
          <svg className="w-5 h-5 text-amber-500 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div>
            <p className="text-sm font-black text-amber-800">⚠ {porVencer} contrato{porVencer>1?'s':''} vence{porVencer>1?'n':''} en los próximos 30 días</p>
            <p className="text-xs text-amber-600 mt-0.5">Recuerda que 2 renovaciones de plazo fijo consecutivas convierten el contrato en indefinido (Art. 159 N°4 CT).</p>
          </div>
        </div>
      )}

      {/* Tabla */}
      <div className="rounded-2xl overflow-hidden" style={{background:"#fff", border:"1px solid rgba(0,0,0,0.06)", boxShadow:"0 2px 8px rgba(0,0,0,0.05), 0 8px 24px rgba(124,58,237,0.04)"}}>
        {/* Header */}
        <div className="px-5 py-4 flex items-center justify-between" style={{background:"linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)"}}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
              </svg>
            </div>
            <div>
              <h2 className="text-base font-black text-white flex items-center gap-2">
                Contratos
                <span className="text-xs bg-white/20 text-white/90 px-2 py-0.5 rounded-full">{filtrados.length}</span>
              </h2>
              <p className="text-xs text-white/70 mt-0.5">Código del Trabajo · Art. 10, 159, 161, 163</p>
            </div>
          </div>
          <button onClick={openNew} className="flex items-center gap-1.5 px-4 py-2 font-bold text-sm rounded-xl transition-all active:scale-95" style={{background:"rgba(255,255,255,0.12)", color:"#e0d9ff", border:"1px solid rgba(255,255,255,0.15)"}}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/></svg>
            + Nuevo Contrato
          </button>
        </div>

        {/* Filtros */}
        <div className="px-5 py-3 border-b flex flex-wrap gap-2" style={{borderColor:"rgba(0,0,0,0.05)", background:"rgba(248,248,252,0.8)"}}>
          <div className="relative flex-1 min-w-[160px]">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z"/>
            </svg>
            <input className="w-full pl-9 pr-4 py-2 border-2 border-slate-200 rounded-xl text-sm focus:outline-none focus:border-purple-400 bg-white transition-colors" placeholder="Buscar trabajador, RUT, cargo..." value={busqueda} onChange={e=>{setBusqueda(e.target.value);setPagina(1);}} />
          </div>
          <select className="px-3 py-2 border-2 border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:border-purple-400 transition-colors" value={filtroTipo} onChange={e=>{setFiltroTipo(e.target.value);setPagina(1);}}>
            <option value="">Todos los tipos</option>
            {TIPOS_CONTRATO.map(t=><option key={t}>{t}</option>)}
          </select>
          <select className="px-3 py-2 border-2 border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:border-purple-400 transition-colors" value={filtroEstado} onChange={e=>{setFiltroEstado(e.target.value);setPagina(1);}}>
            <option value="">Todos los estados</option>
            <option value="vigente">Vigentes</option>
            <option value="vencido">Vencidos</option>
            <option value="terminado">Terminados</option>
          </select>
        </div>

        {/* Tabla */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 rounded-full animate-spin" style={{border:"2px solid rgba(124,58,237,0.15)", borderTopColor:"#7c3aed"}} />
          </div>
        ) : paginados.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-3" style={{background:"rgba(124,58,237,0.06)", border:"1px solid rgba(124,58,237,0.1)"}}>
              <svg className="w-7 h-7 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
            </div>
            <p className="font-semibold text-sm">{busqueda||filtroTipo||filtroEstado?'Sin resultados':'No hay contratos registrados'}</p>
            {!busqueda && !filtroTipo && !filtroEstado && (
              <button onClick={openNew} className="mt-3 text-sm text-purple-600 font-bold hover:underline">+ Crear el primero</button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px]">
              <thead>
                <tr style={{background:"#1e1b4b"}}>
                  {['Trabajador','Tipo','F. Inicio','F. Término','Cargo','Sueldo Base','Estado','Acciones'].map(h=>(
                    <th key={h} className="px-4 py-3 text-left text-[11px] font-black text-slate-300 uppercase tracking-widest">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {paginados.map(row => {
                  const t     = row._trabajador;
                  const nombre= t ? `${t.nombre} ${t.apellidoPaterno}` : 'Trabajador eliminado';
                  const ini   = t ? `${t.nombre?.[0]||''}${t.apellidoPaterno?.[0]||''}` : '?';
                  const alerta= alertaVencimiento(row.fechaFin);
                  return (
                    <tr key={row.id} className="transition-colors" style={{}} onMouseEnter={e=>e.currentTarget.style.background="#faf9ff"} onMouseLeave={e=>e.currentTarget.style.background=""}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-xl flex items-center justify-center text-white font-black text-xs flex-shrink-0" style={{background:"linear-gradient(135deg, #7c3aed, #4f46e5)", boxShadow:"0 2px 6px rgba(124,58,237,0.25)"}}>{ini}</div>
                          <div>
                            <p className="font-bold text-slate-800 text-sm">{nombre}</p>
                            {t && <p className="text-[11px] text-slate-400">{t.rut}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${tipoBadge[row.tipoContrato]||'bg-slate-100 text-slate-500'}`}>
                          {row.tipoContrato||'—'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">{row.fechaInicio||'—'}</td>
                      <td className="px-4 py-3">
                        {row.fechaFin ? (
                          <div>
                            <p className="text-sm text-slate-600">{row.fechaFin}</p>
                            {alerta && (
                              <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold border mt-0.5 ${alerta.color}`}>
                                {alerta.texto}
                              </span>
                            )}
                          </div>
                        ) : <span className="text-slate-400 text-sm">Indefinido</span>}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-500 max-w-[120px] truncate">{row.cargo||'—'}</td>
                      <td className="px-4 py-3 text-sm font-bold text-slate-700">
                        {row.sueldoBase ? `$${parseInt(row.sueldoBase).toLocaleString('es-CL')}` : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${estadoBadge[row.estado||'vigente']}`}>
                          {row.estado||'vigente'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button onClick={()=>generarPDFContrato(row, row._trabajador)} className="p-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 rounded-lg transition-colors" title="Descargar contrato PDF">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                          </button>
                          <button onClick={()=>openEdit(row)} className="p-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-lg transition-colors" title="Editar">
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

        {/* Paginación */}
        {totalPag > 1 && (
          <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between bg-slate-50/40">
            <p className="text-xs text-slate-400 font-medium">
              Mostrando {(pagina-1)*POR_PAGINA+1}–{Math.min(pagina*POR_PAGINA,filtrados.length)} de <strong>{filtrados.length}</strong>
            </p>
            <div className="flex gap-1">
              <button disabled={pagina===1}       onClick={()=>setPagina(p=>p-1)} className="px-3 py-1.5 text-xs font-bold bg-white border-2 border-slate-200 hover:border-purple-300 hover:text-purple-600 disabled:opacity-40 rounded-xl transition-all">← Ant</button>
              <button disabled={pagina===totalPag} onClick={()=>setPagina(p=>p+1)} className="px-3 py-1.5 text-xs font-bold bg-white border-2 border-slate-200 hover:border-purple-300 hover:text-purple-600 disabled:opacity-40 rounded-xl transition-all">Sig →</button>
            </div>
          </div>
        )}
      </div>

      <ContratoModal isOpen={modal} onClose={()=>setModal(false)} editData={editData} trabajadores={trabajadores} onSaved={load} />
      {confirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={()=>setConfirm(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-3" style={{background:"rgba(239,68,68,0.1)", border:"1px solid rgba(239,68,68,0.2)"}}>
              <svg className="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
            </div>
            <h3 className="text-base font-black text-slate-900 text-center">¿Eliminar contrato?</h3>
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

function RemuneracionesSection() {
  const [liquidaciones, setLiquidaciones] = useState([]);
  const [trabajadores,  setTrabajadores]  = useState([]);
  const [contratos,     setContratos]     = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [modal,         setModal]         = useState(false);
  const [editData,      setEditData]      = useState(null);
  const [confirm,       setConfirm]       = useState(null);
  const [filtroMes,     setFiltroMes]     = useState(String(new Date().getMonth()+1).padStart(2,'0'));
  const [filtroAnio,    setFiltroAnio]    = useState(String(new Date().getFullYear()));
  const [filtroEmpresa, setFiltroEmpresa] = useState('');
  const [busqueda,      setBusqueda]      = useState('');
  const [pagina,        setPagina]        = useState(1);
  const POR_PAGINA = 10;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [lSnap, tSnap, cSnap] = await Promise.all([
        getDocs(query(collection(db,'remuneraciones'), orderBy('createdAt','desc'))),
        getDocs(collection(db,'trabajadores')),
        getDocs(collection(db,'contratos')),
      ]);
      setLiquidaciones(lSnap.docs.map(d=>({id:d.id,...d.data()})));
      setTrabajadores(tSnap.docs.map(d=>({id:d.id,...d.data()})));
      setContratos(cSnap.docs.map(d=>({id:d.id,...d.data()})));
    } catch { setLiquidaciones([]); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const openNew  = ()    => { setEditData(null);  setModal(true); };
  const openEdit = (row) => { setEditData(row);   setModal(true); };

  const handleDelete = async () => {
    try { await deleteDoc(doc(db,'remuneraciones',confirm.id)); load(); }
    catch(e) { alert('Error: '+e.message); }
    setConfirm(null);
  };

  // Enriquecer liquidaciones
  const enriquecidas = liquidaciones.map(l => {
    const trabajador = trabajadores.find(t=>t.id===l.trabajadorId);
    const contrato   = contratos.find(c=>c.id===l.contratoId);
    const calc       = contrato ? calcularLiquidacion({...contrato,...l}) : null;
    return { ...l, _trabajador:trabajador, _contrato:contrato, _calc:calc };
  });

  const filtradas = enriquecidas.filter(l => {
    const q = busqueda.toLowerCase();
    const nombre = `${l._trabajador?.nombre||''} ${l._trabajador?.apellidoPaterno||''}`.toLowerCase();
    return (
      (!filtroMes    || l.mes  === filtroMes) &&
      (!filtroAnio   || l.anio === filtroAnio) &&
      (!filtroEmpresa|| l._contrato?.empresa === filtroEmpresa) &&
      (!q            || nombre.includes(q) || l._trabajador?.rut?.includes(busqueda))
    );
  });

  const totalPag  = Math.ceil(filtradas.length / POR_PAGINA);
  const paginadas = filtradas.slice((pagina-1)*POR_PAGINA, pagina*POR_PAGINA);

  // Stats del período filtrado
  const totalImponible   = filtradas.reduce((s,l)=>s+(l._calc?.imponible||0),0);
  const totalLiquido     = filtradas.reduce((s,l)=>s+(l._calc?.liquido||0),0);
  const totalDescuentos  = filtradas.reduce((s,l)=>s+(l._calc?.totalDescuentos||0),0);
  const pendientes       = filtradas.filter(l=>l.estado==='pendiente').length;

  const stats = [
    { label:'Liquidaciones',    value: filtradas.length,                                  color:'text-purple-600', mono:false },
    { label:'Total imponible',  value: `$${totalImponible.toLocaleString('es-CL')}`,      color:'text-slate-700',  mono:true  },
    { label:'Total cotizaciones',value:`$${totalDescuentos.toLocaleString('es-CL')}`,    color:'text-red-500',    mono:true  },
    { label:'Total líquido',    value: `$${totalLiquido.toLocaleString('es-CL')}`,        color:'text-emerald-600',mono:true  },
  ];

  // Export Previred TXT
  const exportarPrevired = () => {
    const data = filtradas
      .filter(l => l._trabajador && l._contrato && l._calc)
      .map(l => ({ trabajador:l._trabajador, contrato:l._contrato, calc:l._calc }));
    if (!data.length) { alert('No hay liquidaciones con datos completos para exportar.'); return; }
    const txt = generarTXTPrevired(data);
    const blob = new Blob([txt], { type:'text/plain;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `Previred_${filtroAnio}_${MESES[parseInt(filtroMes)-1]||filtroMes}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  // Export Excel simple (CSV)
  const exportarExcel = () => {
    const header = 'RUT;TRABAJADOR;MES;AÑO;EMPRESA;CARGO;SUELDO BASE;BASE IMPONIBLE;AFP;SALUD;SIS;CESANTIA;TOTAL DESC.;NO IMPONIBLE;LIQUIDO;ESTADO\n';
    const rows = filtradas.map(l => {
      const c = l._calc;
      return [
        l._trabajador?.rut||'',
        `${l._trabajador?.apellidoPaterno||''} ${l._trabajador?.nombre||''}`,
        MESES[parseInt(l.mes)-1]||l.mes, l.anio,
        l._contrato?.empresa||'',
        l._contrato?.cargo||'',
        c?.base||0, c?.imponible||0,
        c?.afpM||0, c?.salM||0, c?.sisM||0, c?.cesM||0,
        c?.totalDescuentos||0, c?.noImponible||0, c?.liquido||0,
        l.estado||'pendiente',
      ].join(';');
    }).join('\n');
    const blob = new Blob(['\uFEFF'+header+rows], {type:'text/csv;charset=utf-8'});
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `Nomina_${filtroAnio}_${MESES[parseInt(filtroMes)-1]||filtroMes}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  return (
    <>
      {/* Stats del período */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {stats.map(({ label, value, color, mono }) => (
          <div key={label} className="rounded-2xl px-5 py-4" style={{background:"#fff", border:"1px solid rgba(0,0,0,0.06)", boxShadow:"0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(124,58,237,0.04)"}}>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">{label}</p>
            <p className={`${mono?'text-2xl':'text-4xl'} font-black ${color} mt-1 leading-tight`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Alerta pendientes */}
      {pendientes > 0 && (
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-2xl px-5 py-3 mb-5">
          <svg className="w-5 h-5 text-amber-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <p className="text-sm font-bold text-amber-800">{pendientes} liquidación{pendientes>1?'es':''} pendiente{pendientes>1?'s':''} de pago en el período seleccionado</p>
        </div>
      )}

      {/* Tabla */}
      <div className="rounded-2xl overflow-hidden" style={{background:"#fff", border:"1px solid rgba(0,0,0,0.06)", boxShadow:"0 2px 8px rgba(0,0,0,0.05), 0 8px 24px rgba(124,58,237,0.04)"}}>

        {/* Header */}
        <div className="px-5 py-4 flex items-center justify-between" style={{background:"linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)"}}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"/>
              </svg>
            </div>
            <div>
              <h2 className="text-base font-black text-white flex items-center gap-2">
                Liquidaciones de Sueldo
                <span className="text-xs bg-white/20 text-white/90 px-2 py-0.5 rounded-full">{filtradas.length}</span>
              </h2>
              <p className="text-xs text-white/70 mt-0.5">Art. 54 CT · Previred · Cotizaciones previsionales</p>
            </div>
          </div>
          <button onClick={openNew} className="flex items-center gap-1.5 px-4 py-2 font-bold text-sm rounded-xl transition-all active:scale-95" style={{background:"rgba(255,255,255,0.12)", color:"#e0d9ff", border:"1px solid rgba(255,255,255,0.15)"}}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/></svg>
            + Nueva Liquidación
          </button>
        </div>

        {/* Filtros + exportar */}
        <div className="px-5 py-3 border-b border-slate-100 flex flex-wrap gap-2 items-center bg-slate-50/50">
          <select className="px-3 py-2 border-2 border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:border-purple-400" value={filtroMes} onChange={e=>{setFiltroMes(e.target.value);setPagina(1);}}>
            <option value="">Todos los meses</option>
            {MESES.map((m,i)=><option key={m} value={String(i+1).padStart(2,'0')}>{m}</option>)}
          </select>
          <select className="px-3 py-2 border-2 border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:border-purple-400" value={filtroAnio} onChange={e=>{setFiltroAnio(e.target.value);setPagina(1);}}>
            {[2023,2024,2025,2026].map(y=><option key={y}>{y}</option>)}
          </select>
          <select className="px-3 py-2 border-2 border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:border-purple-400" value={filtroEmpresa} onChange={e=>{setFiltroEmpresa(e.target.value);setPagina(1);}}>
            <option value="">Todas las empresas</option>
            {EMPRESAS.map(e=><option key={e}>{e}</option>)}
          </select>
          <div className="relative flex-1 min-w-[140px]">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z"/></svg>
            <input className="w-full pl-9 pr-4 py-2 border-2 border-slate-200 rounded-xl text-sm focus:outline-none focus:border-purple-400 bg-white" placeholder="Buscar trabajador..." value={busqueda} onChange={e=>{setBusqueda(e.target.value);setPagina(1);}} />
          </div>
          {/* Botones exportar */}
          <div className="flex gap-1.5 ml-auto">
            <button onClick={exportarPrevired} className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl transition-colors">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
              Previred
            </button>
            <button onClick={()=>generarPDFResumenNomina(filtradas.filter(l=>l._calc), `${MESES[parseInt(filtroMes)-1]||'Todos'} ${filtroAnio}`)} className="flex items-center gap-1.5 px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-xl transition-colors">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
              PDF Nómina
            </button>
            <button onClick={exportarExcel} className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition-colors">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
              Excel Nómina
            </button>
          </div>
        </div>

        {/* Tabla */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 rounded-full animate-spin" style={{border:"2px solid rgba(124,58,237,0.15)", borderTopColor:"#7c3aed"}} />
          </div>
        ) : paginadas.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-3" style={{background:"rgba(124,58,237,0.06)", border:"1px solid rgba(124,58,237,0.1)"}}>
              <svg className="w-7 h-7 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"/></svg>
            </div>
            <p className="font-semibold text-sm">No hay liquidaciones para este período</p>
            <button onClick={openNew} className="mt-3 text-sm text-purple-600 font-bold hover:underline">+ Crear liquidación</button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead>
                <tr style={{background:"#1e1b4b"}}>
                  {['Trabajador','Período','Imponible','AFP','Salud','SIS+Ces.','No Imp.','Líquido','Estado','Acciones'].map(h=>(
                    <th key={h} className="px-4 py-3 text-left text-[11px] font-black text-slate-300 uppercase tracking-widest">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {paginadas.map(row => {
                  const c   = row._calc;
                  const ini = `${row._trabajador?.nombre?.[0]||''}${row._trabajador?.apellidoPaterno?.[0]||''}`;
                  const nombre = `${row._trabajador?.nombre||''} ${row._trabajador?.apellidoPaterno||''}`.trim() || '—';
                  return (
                    <tr key={row.id} className="transition-colors" style={{}} onMouseEnter={e=>e.currentTarget.style.background="#faf9ff"} onMouseLeave={e=>e.currentTarget.style.background=""}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-xl flex items-center justify-center text-white font-black text-xs flex-shrink-0" style={{background:"linear-gradient(135deg, #7c3aed, #4f46e5)", boxShadow:"0 2px 6px rgba(124,58,237,0.25)"}}>{ini}</div>
                          <div>
                            <p className="font-bold text-slate-800 text-sm">{nombre}</p>
                            <p className="text-[11px] text-slate-400">{row._trabajador?.afp||'—'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm font-bold text-slate-600">{labelPeriodo(row)}</td>
                      <td className="px-4 py-3 text-sm font-bold text-slate-700">{c?`$${c.imponible.toLocaleString('es-CL')}`:'—'}</td>
                      <td className="px-4 py-3 text-sm text-red-500">-{c?`$${c.afpM.toLocaleString('es-CL')}`:'—'}</td>
                      <td className="px-4 py-3 text-sm text-red-500">-{c?`$${c.salM.toLocaleString('es-CL')}`:'—'}</td>
                      <td className="px-4 py-3 text-sm text-red-500">-{c?`$${(c.sisM+c.cesM).toLocaleString('es-CL')}`:'—'}</td>
                      <td className="px-4 py-3 text-sm text-blue-600">{c&&c.noImponible?`$${c.noImponible.toLocaleString('es-CL')}`:'—'}</td>
                      <td className="px-4 py-3">
                        {c ? (() => {
                          const iutRow = calcularIUT(calcularRentaTributable(c), UTM_DEFAULT);
                          const liqReal = c.liquido - iutRow;
                          return <span className="font-black text-emerald-600 text-sm">${liqReal.toLocaleString('es-CL')}</span>;
                        })() : <span>—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${row.estado==='pagado'?'bg-emerald-100 text-emerald-700':'bg-amber-100 text-amber-700'}`}>
                          {row.estado==='pagado'?'Pagado':'Pendiente'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button onClick={()=>generarPDFLiquidacion(row, row._trabajador, row._contrato)} className="p-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 rounded-lg transition-colors" title="Descargar liquidación PDF">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                          </button>
                          <button onClick={()=>openEdit(row)} className="p-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-lg transition-colors" title="Editar">
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

        {/* Paginación */}
        {totalPag > 1 && (
          <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between bg-slate-50/40">
            <p className="text-xs text-slate-400 font-medium">
              Mostrando {(pagina-1)*POR_PAGINA+1}–{Math.min(pagina*POR_PAGINA, filtradas.length)} de <strong>{filtradas.length}</strong>
            </p>
            <div className="flex gap-1">
              <button disabled={pagina===1}       onClick={()=>setPagina(p=>p-1)} className="px-3 py-1.5 text-xs font-bold bg-white border-2 border-slate-200 hover:border-purple-300 hover:text-purple-600 disabled:opacity-40 rounded-xl transition-all">← Ant</button>
              <button disabled={pagina===totalPag} onClick={()=>setPagina(p=>p+1)} className="px-3 py-1.5 text-xs font-bold bg-white border-2 border-slate-200 hover:border-purple-300 hover:text-purple-600 disabled:opacity-40 rounded-xl transition-all">Sig →</button>
            </div>
          </div>
        )}
      </div>

      <LiquidacionModal isOpen={modal} onClose={()=>setModal(false)} editData={editData} trabajadores={trabajadores} contratos={contratos} onSaved={load} />
      {confirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={()=>setConfirm(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-3" style={{background:"rgba(239,68,68,0.1)", border:"1px solid rgba(239,68,68,0.2)"}}>
              <svg className="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
            </div>
            <h3 className="text-base font-black text-slate-900 text-center">¿Eliminar liquidación?</h3>
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

function FiniquitosSection() {
  const [finiquitos,   setFiniquitos]   = useState([]);
  const [trabajadores, setTrabajadores] = useState([]);
  const [contratos,    setContratos]    = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [modal,        setModal]        = useState(false);
  const [editData,     setEditData]     = useState(null);
  const [confirm,      setConfirm]      = useState(null);
  const [busqueda,     setBusqueda]     = useState('');
  const [filtroCausal, setFiltroCausal] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');
  const [pagina,       setPagina]       = useState(1);
  const POR_PAGINA = 10;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [fSnap, tSnap, cSnap] = await Promise.all([
        getDocs(query(collection(db,'finiquitos'), orderBy('createdAt','desc'))),
        getDocs(collection(db,'trabajadores')),
        getDocs(collection(db,'contratos')),
      ]);
      setFiniquitos(fSnap.docs.map(d=>({id:d.id,...d.data()})));
      setTrabajadores(tSnap.docs.map(d=>({id:d.id,...d.data()})));
      setContratos(cSnap.docs.map(d=>({id:d.id,...d.data()})));
    } catch { setFiniquitos([]); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async () => {
    try { await deleteDoc(doc(db,'finiquitos',confirm.id)); load(); }
    catch(e) { alert('Error: '+e.message); }
    setConfirm(null);
  };

  const enriquecidos = finiquitos.map(f => {
    const trabajador = trabajadores.find(t=>t.id===f.trabajadorId);
    const contrato   = contratos.find(c=>c.id===f.contratoId);
    const calc       = f.fechaTermino && f.ultimaRemuneracion
      ? calcularFiniquito(f, contrato, trabajador) : null;
    return {...f, _trabajador:trabajador, _contrato:contrato, _calc:calc};
  });

  const filtrados = enriquecidos.filter(f => {
    const q = busqueda.toLowerCase();
    const nombre = `${f._trabajador?.nombre||''} ${f._trabajador?.apellidoPaterno||''}`.toLowerCase();
    return (
      (!q           || nombre.includes(q) || f._trabajador?.rut?.includes(busqueda)) &&
      (!filtroCausal|| f.causal === filtroCausal) &&
      (!filtroEstado|| f.estadoFirma === filtroEstado)
    );
  });

  const totalPag  = Math.ceil(filtrados.length / POR_PAGINA);
  const paginados = filtrados.slice((pagina-1)*POR_PAGINA, pagina*POR_PAGINA);

  const pendientesFirma = finiquitos.filter(f=>f.estadoFirma==='pendiente').length;
  const totalPagado     = enriquecidos.reduce((s,f)=>s+(f._calc?.totalFiniquito||0),0);

  const stats = [
    { label:'Total finiquitos',     value: finiquitos.length,                                              color:'text-purple-600', mono:false },
    { label:'Pendientes firma',     value: pendientesFirma,                                                color: pendientesFirma>0?'text-amber-500':'text-slate-400', mono:false },
    { label:'Ratificados',          value: finiquitos.filter(f=>f.estadoFirma==='ratificado').length,      color:'text-emerald-600',mono:false },
    { label:'Total pagado',         value: `$${totalPagado.toLocaleString('es-CL')}`,                     color:'text-slate-700',  mono:true  },
  ];

  const estadoFirmaBadge = {
    pendiente:   'bg-amber-100 text-amber-700',
    firmado:     'bg-blue-100 text-blue-700',
    ratificado:  'bg-emerald-100 text-emerald-700',
  };

  const causalCorta = (cod) => {
    const m = { '159-1':'Mutuo acuerdo','159-2':'Renuncia','159-4':'Vto. plazo','159-5':'Fin obra','161':'Nec. empresa' };
    return m[cod] || cod;
  };

  return (
    <>
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {stats.map(({ label, value, color, mono }) => (
          <div key={label} className="rounded-2xl px-5 py-4" style={{background:"#fff", border:"1px solid rgba(0,0,0,0.06)", boxShadow:"0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(124,58,237,0.04)"}}>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">{label}</p>
            <p className={`${mono?'text-2xl':'text-4xl'} font-black ${color} mt-1 leading-tight`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Alerta pendientes */}
      {pendientesFirma > 0 && (
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4 mb-5">
          <svg className="w-5 h-5 text-amber-500 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
          <div>
            <p className="text-sm font-black text-amber-800">{pendientesFirma} finiquito{pendientesFirma>1?'s':''} pendiente{pendientesFirma>1?'s':''} de firma y/o ratificación</p>
            <p className="text-xs text-amber-600 mt-0.5">Art. 177 CT: sin ratificación ante ministro de fe, el finiquito no extingue las acciones del trabajador.</p>
          </div>
        </div>
      )}

      {/* Tabla */}
      <div className="rounded-2xl overflow-hidden" style={{background:"#fff", border:"1px solid rgba(0,0,0,0.06)", boxShadow:"0 2px 8px rgba(0,0,0,0.05), 0 8px 24px rgba(124,58,237,0.04)"}}>
        <div className="px-5 py-4 flex items-center justify-between" style={{background:"linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)"}}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            </div>
            <div>
              <h2 className="text-base font-black text-white flex items-center gap-2">
                Finiquitos
                <span className="text-xs bg-white/20 text-white/90 px-2 py-0.5 rounded-full">{filtrados.length}</span>
              </h2>
              <p className="text-xs text-white/70 mt-0.5">Art. 159–163 · Art. 177 CT · Ratificación ministro de fe</p>
            </div>
          </div>
          <button onClick={()=>{setEditData(null);setModal(true);}} className="flex items-center gap-1.5 px-4 py-2 font-bold text-sm rounded-xl transition-all active:scale-95" style={{background:"rgba(255,255,255,0.12)", color:"#e0d9ff", border:"1px solid rgba(255,255,255,0.15)"}}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/></svg>
            + Nuevo Finiquito
          </button>
        </div>

        {/* Filtros */}
        <div className="px-5 py-3 border-b flex flex-wrap gap-2" style={{borderColor:"rgba(0,0,0,0.05)", background:"rgba(248,248,252,0.8)"}}>
          <div className="relative flex-1 min-w-[150px]">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z"/></svg>
            <input className="w-full pl-9 pr-4 py-2 border-2 border-slate-200 rounded-xl text-sm focus:outline-none focus:border-purple-400 bg-white" placeholder="Buscar trabajador..." value={busqueda} onChange={e=>{setBusqueda(e.target.value);setPagina(1);}} />
          </div>
          <select className="px-3 py-2 border-2 border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:border-purple-400" value={filtroCausal} onChange={e=>{setFiltroCausal(e.target.value);setPagina(1);}}>
            <option value="">Todas las causales</option>
            {CAUSALES_TERMINO.map(c=><option key={c.codigo} value={c.codigo}>{c.label.split('—')[1]?.trim()||c.label}</option>)}
          </select>
          <select className="px-3 py-2 border-2 border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:border-purple-400" value={filtroEstado} onChange={e=>{setFiltroEstado(e.target.value);setPagina(1);}}>
            <option value="">Todos los estados</option>
            <option value="pendiente">Pendiente</option>
            <option value="firmado">Firmado</option>
            <option value="ratificado">Ratificado</option>
          </select>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 rounded-full animate-spin" style={{border:"2px solid rgba(124,58,237,0.15)", borderTopColor:"#7c3aed"}} />
          </div>
        ) : paginados.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-3" style={{background:"rgba(124,58,237,0.06)", border:"1px solid rgba(124,58,237,0.1)"}}>
              <svg className="w-7 h-7 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            </div>
            <p className="font-semibold text-sm">No hay finiquitos{busqueda||filtroCausal||filtroEstado?' para estos filtros':''}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px]">
              <thead>
                <tr style={{background:"#1e1b4b"}}>
                  {['Trabajador','Causal','F. Término','Antigüedad','Feriado','Indemnización','Total','Estado','Acciones'].map(h=>(
                    <th key={h} className="px-4 py-3 text-left text-[11px] font-black text-slate-300 uppercase tracking-widest">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {paginados.map(row => {
                  const ini    = `${row._trabajador?.nombre?.[0]||''}${row._trabajador?.apellidoPaterno?.[0]||''}`;
                  const nombre = `${row._trabajador?.nombre||''} ${row._trabajador?.apellidoPaterno||''}`.trim()||'—';
                  const c      = row._calc;
                  return (
                    <tr key={row.id} className="transition-colors" style={{}} onMouseEnter={e=>e.currentTarget.style.background="#faf9ff"} onMouseLeave={e=>e.currentTarget.style.background=""}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-red-500 to-rose-500 flex items-center justify-center text-white font-black text-xs flex-shrink-0">{ini}</div>
                          <div>
                            <p className="font-bold text-slate-800 text-sm">{nombre}</p>
                            <p className="text-[11px] text-slate-400">{row._trabajador?.rut||'—'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full">{causalCorta(row.causal)}</span>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">{row.fechaTermino||'—'}</td>
                      <td className="px-4 py-3 text-sm text-slate-600">{c?`${c.anios}a ${c.meses}m`:'—'}</td>
                      <td className="px-4 py-3 text-sm text-slate-700">{c?`$${c.totalFeriado.toLocaleString('es-CL')}`:'—'}</td>
                      <td className="px-4 py-3 text-sm font-bold text-purple-700">{c&&c.tieneIndemnizacion?`$${c.indemMonto.toLocaleString('es-CL')}`:<span className="text-slate-400 font-normal">—</span>}</td>
                      <td className="px-4 py-3"><span className="font-black text-emerald-600 text-sm">{c?`$${c.totalFiniquito.toLocaleString('es-CL')}`:'—'}</span></td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${estadoFirmaBadge[row.estadoFirma||'pendiente']}`}>
                          {row.estadoFirma||'pendiente'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button onClick={()=>generarPDFFiniquito(row, row._trabajador, row._contrato)} className="p-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 rounded-lg transition-colors" title="Descargar PDF finiquito">
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

      <FiniquitoModal isOpen={modal} onClose={()=>setModal(false)} editData={editData} trabajadores={trabajadores} contratos={contratos} onSaved={load} />
      {confirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={()=>setConfirm(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-3" style={{background:"rgba(239,68,68,0.1)", border:"1px solid rgba(239,68,68,0.2)"}}>
              <svg className="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
            </div>
            <h3 className="text-base font-black text-slate-900 text-center">¿Eliminar finiquito?</h3>
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
// ═══════════════════════════════════════════════════════
// PANEL PORTAL TRABAJADORES — Crear cuentas Firebase Auth
// ═══════════════════════════════════════════════════════
function PortalTrabajadoresPanel({ trabajadores }) {
  const [resultados, setResultados] = useState([]); // [{ nombre, rut, email, estado: 'ok'|'existe'|'error', msg }]
  const [procesando,  setProcesando]  = useState(false);
  const [progreso,    setProgreso]    = useState(0);
  const [seleccion,   setSeleccion]   = useState([]); // ids de trabajadores seleccionados
  const [busqueda,    setBusqueda]    = useState('');
  const [mostrarLog,  setMostrarLog]  = useState(false);

  const auth = getAuth();

  function rutToEmail(rut) {
    return rut.replace(/[^0-9kK]/gi, '').toLowerCase() + '@mpf.cl';
  }
  function rutToPass(rut) {
    return rut.replace(/[^0-9kK]/gi, '').toLowerCase();
  }

  const activosFiltrados = trabajadores
    .filter(t => t.estado === 'activo' || !t.estado)
    .filter(t => {
      const q = busqueda.toLowerCase();
      return !q || `${t.nombre} ${t.apellidoPaterno} ${t.rut||''}`.toLowerCase().includes(q);
    });

  const todosSeleccionados = activosFiltrados.length > 0 &&
    activosFiltrados.every(t => seleccion.includes(t.id));

  function toggleTodos() {
    if (todosSeleccionados) {
      setSeleccion(s => s.filter(id => !activosFiltrados.find(t => t.id === id)));
    } else {
      setSeleccion(s => [...new Set([...s, ...activosFiltrados.map(t => t.id)])]);
    }
  }

  function toggleUno(id) {
    setSeleccion(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  }

  async function crearCuentas() {
    if (!seleccion.length) { alert('Selecciona al menos un trabajador.'); return; }
    if (!window.confirm(`¿Crear cuentas de portal para ${seleccion.length} trabajador(es)? La contraseña inicial será el RUT sin puntos ni guión.`)) return;

    setProcesando(true);
    setMostrarLog(true);
    setResultados([]);
    setProgreso(0);

    const trabajadoresSeleccionados = trabajadores.filter(t => seleccion.includes(t.id));
    const logs = [];

    for (let i = 0; i < trabajadoresSeleccionados.length; i++) {
      const t = trabajadoresSeleccionados[i];
      const nombre = `${t.nombre} ${t.apellidoPaterno}`.trim();
      const email  = rutToEmail(t.rut || '');
      const pass   = rutToPass(t.rut  || '');

      if (!t.rut || pass.length < 4) {
        logs.push({ nombre, rut: t.rut||'—', email, estado: 'error', msg: 'RUT inválido o muy corto' });
        setResultados([...logs]);
        setProgreso(Math.round(((i+1)/trabajadoresSeleccionados.length)*100));
        continue;
      }

      try {
        // Crear cuenta en Firebase Auth
        const cred = await createUserWithEmailAndPassword(auth, email, pass);
        const uid  = cred.user.uid;

        // 1. Vincular uid al documento del trabajador
        await updateDoc(doc(db, 'trabajadores', t.id), { portalUid: uid, portalEmail: email });
        // 2. Escribir índice uid→firestoreId para que el portal pueda leer el perfil
        //    (las reglas no permiten query sobre toda la colección desde el trabajador)
        await setDoc(doc(db, 'trabajadores_portal', uid), {
          trabajadorDocId: t.id,
          rut: t.rut || '',
          email,
        });

        logs.push({ nombre, rut: t.rut, email, estado: 'ok', msg: `UID: ${uid.slice(0,8)}...` });
      } catch (err) {
        if (err.code === 'auth/email-already-in-use') {
          logs.push({ nombre, rut: t.rut, email, estado: 'existe', msg: 'Cuenta ya existe' });
        } else {
          logs.push({ nombre, rut: t.rut, email, estado: 'error', msg: err.message });
        }
      }

      setResultados([...logs]);
      setProgreso(Math.round(((i+1)/trabajadoresSeleccionados.length)*100));
      // Pequeña pausa para no saturar Firebase Auth
      await new Promise(r => setTimeout(r, 300));
    }

    setProcesando(false);
    setSeleccion([]);
  }

  const countOk     = resultados.filter(r => r.estado === 'ok').length;
  const countExiste = resultados.filter(r => r.estado === 'existe').length;
  const countError  = resultados.filter(r => r.estado === 'error').length;

  const estadoBadge = {
    ok:     'background:#dcfce7;color:#166534',
    existe: 'background:#fef3c7;color:#92400e',
    error:  'background:#fee2e2;color:#991b1b',
  };
  const estadoLabel = { ok: '✓ Creada', existe: '↩ Ya existe', error: '✗ Error' };

  return (
    <div style={{padding:'0 0 24px'}}>
      {/* Header */}
      <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:20,gap:12,flexWrap:'wrap'}}>
        <div>
          <h3 style={{fontSize:15,fontWeight:800,color:'#1e1b4b',letterSpacing:'-0.3px'}}>
            Portal Trabajadores
          </h3>
          <p style={{fontSize:12,color:'#6b7280',marginTop:3,lineHeight:1.5}}>
            Crea cuentas de acceso al portal para que los trabajadores puedan marcar asistencia.<br/>
            <span style={{fontFamily:'monospace',fontSize:11}}>Contraseña inicial = RUT sin puntos ni guión</span>
          </p>
        </div>
        {seleccion.length > 0 && !procesando && (
          <button
            onClick={crearCuentas}
            style={{
              display:'flex',alignItems:'center',gap:8,padding:'10px 18px',
              background:'linear-gradient(135deg,#1e1b4b,#312e81)',
              color:'#fff',border:'none',borderRadius:10,fontWeight:700,
              fontSize:13,cursor:'pointer',whiteSpace:'nowrap',flexShrink:0,
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
            Crear {seleccion.length} cuenta{seleccion.length > 1 ? 's' : ''}
          </button>
        )}
      </div>

      {/* Barra de progreso */}
      {procesando && (
        <div style={{marginBottom:16}}>
          <div style={{display:'flex',justifyContent:'space-between',marginBottom:4,fontSize:12,color:'#6b7280'}}>
            <span>Creando cuentas...</span>
            <span>{progreso}%</span>
          </div>
          <div style={{height:6,background:'#e5e7eb',borderRadius:99,overflow:'hidden'}}>
            <div style={{height:'100%',width:`${progreso}%`,background:'linear-gradient(90deg,#4f46e5,#7c3aed)',transition:'width 0.3s',borderRadius:99}}/>
          </div>
        </div>
      )}

      {/* Búsqueda */}
      <div style={{position:'relative',marginBottom:12}}>
        <svg style={{position:'absolute',left:10,top:'50%',transform:'translateY(-50%)',color:'#9ca3af'}} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z"/></svg>
        <input
          style={{width:'100%',paddingLeft:32,paddingRight:12,paddingTop:8,paddingBottom:8,border:'1.5px solid #e5e7eb',borderRadius:8,fontSize:13,outline:'none'}}
          placeholder="Buscar trabajador..."
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
        />
      </div>

      {/* Tabla de selección */}
      <div style={{border:'1px solid #e5e7eb',borderRadius:12,overflow:'hidden',marginBottom:16}}>
        {/* Cabecera */}
        <div style={{display:'grid',gridTemplateColumns:'36px 1fr 140px 80px',padding:'8px 14px',background:'#f8f8fc',borderBottom:'1px solid #e5e7eb'}}>
          <input type="checkbox" checked={todosSeleccionados} onChange={toggleTodos} style={{cursor:'pointer'}}/>
          <span style={{fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:'1px',color:'#9ca3af'}}>Trabajador</span>
          <span style={{fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:'1px',color:'#9ca3af'}}>Email portal</span>
          <span style={{fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:'1px',color:'#9ca3af',textAlign:'center'}}>Estado</span>
        </div>

        {activosFiltrados.length === 0 ? (
          <div style={{padding:'24px',textAlign:'center',color:'#9ca3af',fontSize:13}}>
            No hay trabajadores activos
          </div>
        ) : activosFiltrados.map(t => {
          const email    = t.rut ? rutToEmail(t.rut) : '—';
          const tieneCta = !!t.portalUid;
          const nombre   = `${t.nombre} ${t.apellidoPaterno}`.trim();
          const ini      = `${t.nombre?.[0]||''}${t.apellidoPaterno?.[0]||''}`.toUpperCase();
          return (
            <div key={t.id}
              style={{
                display:'grid',gridTemplateColumns:'36px 1fr 140px 80px',
                padding:'10px 14px',borderBottom:'1px solid #f1f1f7',
                alignItems:'center',cursor:'pointer',
                background: seleccion.includes(t.id) ? '#f5f3ff' : 'white',
                transition:'background 0.1s',
              }}
              onClick={() => toggleUno(t.id)}
            >
              <input type="checkbox" checked={seleccion.includes(t.id)} onChange={() => toggleUno(t.id)}
                onClick={e => e.stopPropagation()} style={{cursor:'pointer'}}/>
              <div style={{display:'flex',alignItems:'center',gap:8}}>
                <div style={{
                  width:28,height:28,borderRadius:8,flexShrink:0,
                  background:'linear-gradient(135deg,#7c3aed,#4f46e5)',
                  display:'flex',alignItems:'center',justifyContent:'center',
                  color:'white',fontSize:10,fontWeight:800,
                }}>{ini}</div>
                <div>
                  <div style={{fontSize:13,fontWeight:600,color:'#1e1b4b'}}>{nombre}</div>
                  <div style={{fontSize:11,color:'#9ca3af',fontFamily:'monospace'}}>{t.rut||'—'}</div>
                </div>
              </div>
              <span style={{fontSize:11,color:'#6b7280',fontFamily:'monospace',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                {email}
              </span>
              <div style={{textAlign:'center'}}>
                {tieneCta
                  ? <span style={{fontSize:10,fontWeight:700,padding:'2px 7px',borderRadius:99,background:'#dcfce7',color:'#166534'}}>Activa</span>
                  : <span style={{fontSize:10,fontWeight:700,padding:'2px 7px',borderRadius:99,background:'#f1f5f9',color:'#94a3b8'}}>Sin cuenta</span>
                }
              </div>
            </div>
          );
        })}
      </div>

      {/* Resumen estadísticas */}
      <div style={{display:'flex',gap:8,marginBottom:16,flexWrap:'wrap'}}>
        {[
          { label:'Total activos', value: trabajadores.filter(t=>!t.estado||t.estado==='activo').length, color:'#6b7280' },
          { label:'Con cuenta',    value: trabajadores.filter(t=>t.portalUid).length, color:'#16a34a' },
          { label:'Sin cuenta',    value: trabajadores.filter(t=>(!t.estado||t.estado==='activo')&&!t.portalUid).length, color:'#d97706' },
        ].map(s => (
          <div key={s.label} style={{flex:1,minWidth:100,background:'#f8f8fc',border:'1px solid #e5e7eb',borderRadius:10,padding:'10px 14px'}}>
            <div style={{fontSize:10,color:'#9ca3af',fontWeight:600,textTransform:'uppercase',letterSpacing:'1px',marginBottom:3}}>{s.label}</div>
            <div style={{fontSize:20,fontWeight:800,color:s.color}}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Log de resultados */}
      {mostrarLog && resultados.length > 0 && (
        <div style={{border:'1px solid #e5e7eb',borderRadius:12,overflow:'hidden'}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 14px',background:'#f8f8fc',borderBottom:'1px solid #e5e7eb'}}>
            <span style={{fontSize:12,fontWeight:700,color:'#1e1b4b'}}>
              Resultado — {countOk} creadas · {countExiste} ya existían · {countError} errores
            </span>
            <button onClick={() => setMostrarLog(false)} style={{background:'none',border:'none',cursor:'pointer',color:'#9ca3af',fontSize:18,lineHeight:1}}>×</button>
          </div>
          <div style={{maxHeight:260,overflowY:'auto'}}>
            {resultados.map((r, i) => (
              <div key={i} style={{display:'grid',gridTemplateColumns:'1fr 160px 90px',padding:'9px 14px',borderBottom:'1px solid #f1f1f7',alignItems:'center',gap:8}}>
                <div>
                  <div style={{fontSize:12,fontWeight:600,color:'#1e1b4b'}}>{r.nombre}</div>
                  <div style={{fontSize:11,color:'#9ca3af',fontFamily:'monospace'}}>{r.email}</div>
                </div>
                <span style={{fontSize:11,color:'#6b7280',fontFamily:'monospace',overflow:'hidden',textOverflow:'ellipsis'}}>{r.msg}</span>
                <span style={{
                  fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:99,textAlign:'center',
                  ...Object.fromEntries(estadoBadge[r.estado].split(';').map(s => { const [k,v]=s.split(':'); return [k.trim(),v?.trim()]; }).filter(([k])=>k))
                }}>{estadoLabel[r.estado]}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export { DashboardSection, TrabajadoresSection, ContratosSection, RemuneracionesSection, FiniquitosSection, PortalTrabajadoresPanel };