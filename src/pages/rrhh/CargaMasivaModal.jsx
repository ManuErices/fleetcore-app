/**
 * CargaMasivaModal.jsx — src/pages/rrhh/CargaMasivaModal.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Carga de un ítem de pago para muchas personas de una vez.
 *
 * Hasta ahora la única forma de registrar horas extra o un bono era abrir el
 * LiquidacionModal persona por persona. Con 62 trabajadores eso son 62 modales
 * para un dato que es el mismo concepto repetido.
 *
 * El flujo es: eliges el ítem → filtras a quién aplica → llenas la columna →
 * previsualizas la liquidación resultante → guardas todo en un lote.
 */

import { useState, useMemo, useCallback } from 'react';
import { db } from '../../lib/firebase';
import { useEmpresa } from '../../lib/useEmpresa';
import { collection, doc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { Modal, inp, MESES, UTM_DEFAULT } from './shared';
import { liquidacionDe, calcularIUT, calcularRentaTributable } from './calculo';

// ─── Catálogo de ítems ────────────────────────────────────────────────────────
// Cada ítem apunta al campo que `calcularLiquidacion` ya consume. No se inventan
// campos nuevos: si aparece uno acá es porque el cálculo lo sabe usar.
export const ITEMS_PAGO = [
  { id: 'horasExtra',        label: 'Horas Extra',            campo: 'horasExtra',         grupo: 'Imponible',    unidad: 'horas', auxiliar: { campo: 'valorHoraExtra', label: 'Valor hora', unidad: '$' } },
  { id: 'bonoProduccion',    label: 'Bono de Producción',     campo: 'bonoProduccion',     grupo: 'Imponible',    unidad: '$' },
  { id: 'otrosImponibles',   label: 'Otros Imponibles',       campo: 'otrosImponibles',    grupo: 'Imponible',    unidad: '$' },
  { id: 'bonoColacion',      label: 'Colación',               campo: 'bonoColacion',       grupo: 'No imponible', unidad: '$' },
  { id: 'bonoMovilizacion',  label: 'Movilización',           campo: 'bonoMovilizacion',   grupo: 'No imponible', unidad: '$' },
  { id: 'viaticos',          label: 'Viáticos',               campo: 'viaticos',           grupo: 'No imponible', unidad: '$' },
  { id: 'otrosNoImponibles', label: 'Otros No Imponibles',    campo: 'otrosNoImponibles',  grupo: 'No imponible', unidad: '$' },
  { id: 'anticipo',          label: 'Anticipo',               campo: 'anticipo',           grupo: 'Descuento',    unidad: '$' },
  { id: 'descuentoAdicional',label: 'Descuento Adicional',    campo: 'descuentoAdicional', grupo: 'Descuento',    unidad: '$' },
  { id: 'diasTrabajados',    label: 'Días Trabajados',        campo: 'diasTrabajados',     grupo: 'Base',         unidad: 'días' },
];

const COLOR_GRUPO = {
  'Imponible':    { bg: '#f3f0ff', text: '#6d28d9' },
  'No imponible': { bg: '#ecfdf5', text: '#047857' },
  'Descuento':    { bg: '#fef2f2', text: '#b91c1c' },
  'Base':         { bg: '#f1f5f9', text: '#475569' },
};

const fmt = n => `$${Math.round(n || 0).toLocaleString('es-CL')}`;
const soloNum = v => String(v ?? '').replace(/[^\d]/g, '');

export default function CargaMasivaModal({ isOpen, onClose, trabajadores, contratos, liquidaciones, mes, anio, onSaved }) {
  const { empresaId, subEmpresasNames: EMPRESAS = [] } = useEmpresa();

  const [itemId, setItemId]   = useState('horasExtra');
  const [valores, setValores] = useState({});   // { trabajadorId: valor }
  const [aux, setAux]         = useState({});   // { trabajadorId: valorAuxiliar }
  const [preview, setPreview] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [resultado, setResultado]  = useState(null);

  // Filtros
  const [fArea, setFArea]         = useState('');
  const [fCentro, setFCentro]     = useState('');
  const [fEmpresa, setFEmpresa]   = useState('');
  const [fSucursal, setFSucursal] = useState('');
  const [busqueda, setBusqueda]   = useState('');

  const item = ITEMS_PAGO.find(i => i.id === itemId) || ITEMS_PAGO[0];

  const activos = useMemo(
    () => (trabajadores || []).filter(t => t.estado === 'activo'),
    [trabajadores]
  );

  // Opciones de filtro derivadas de la nómina real, no de una lista fija
  const opciones = useMemo(() => {
    const u = (k) => [...new Set(activos.map(t => t[k]).filter(Boolean))].sort();
    return {
      areas:     u('area'),
      centros:   [...new Set(activos.map(t => t.centroCostoNombre || t.centroCosto).filter(Boolean))].sort(),
      empresas:  EMPRESAS.length ? EMPRESAS : u('empresa'),
      sucursales:u('sucursal'),
    };
  }, [activos, EMPRESAS]);

  const filas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return activos
      .filter(t => {
        if (fArea && t.area !== fArea) return false;
        if (fCentro && (t.centroCostoNombre || t.centroCosto) !== fCentro) return false;
        if (fEmpresa && t.empresa !== fEmpresa) return false;
        if (fSucursal && t.sucursal !== fSucursal) return false;
        if (q && !`${t.nombre} ${t.apellidoPaterno} ${t.apellidoMaterno} ${t.rut} ${t.cargo}`.toLowerCase().includes(q)) return false;
        return true;
      })
      .map(t => {
        const contrato = (contratos || []).find(c => c.trabajadorId === t.id && c.estado === 'vigente');
        const liq = (liquidaciones || []).find(l => l.trabajadorId === t.id && l.mes === mes && l.anio === anio);
        return { ...t, _contrato: contrato, _liq: liq };
      })
      .sort((a, b) => (a.apellidoPaterno || '').localeCompare(b.apellidoPaterno || ''));
  }, [activos, contratos, liquidaciones, mes, anio, fArea, fCentro, fEmpresa, fSucursal, busqueda]);

  // Sin contrato vigente no hay sueldo base del que partir: se muestran, pero
  // deshabilitados y con el motivo a la vista, en vez de desaparecer sin más.
  const elegibles = filas.filter(f => f._contrato);
  const conValor  = elegibles.filter(f => soloNum(valores[f.id]) !== '' && Number(soloNum(valores[f.id])) > 0);

  const setValor = (id, v) => setValores(s => ({ ...s, [id]: soloNum(v) }));
  const setAuxiliar = (id, v) => setAux(s => ({ ...s, [id]: soloNum(v) }));

  /** Aplica el mismo valor a todas las filas visibles con contrato. */
  const aplicarATodos = () => {
    const v = window.prompt(`Valor de "${item.label}" para las ${elegibles.length} personas visibles:`, '');
    if (v === null) return;
    const limpio = soloNum(v);
    if (!limpio) return;
    setValores(s => {
      const n = { ...s };
      elegibles.forEach(f => { n[f.id] = limpio; });
      return n;
    });
  };

  const limpiar = () => { setValores({}); setAux({}); };

  /** Liquidación resultante de aplicar lo escrito, sin guardar nada. */
  const construirRem = useCallback((fila) => {
    const base = fila._liq || {
      trabajadorId: fila.id,
      contratoId:   fila._contrato?.id || '',
      mes, anio,
      tipoPeriodo:  'mensual',
      sueldoBase:   fila._contrato?.sueldoBase || 0,
      bonoColacion: fila._contrato?.bonoColacion || 0,
      bonoMovilizacion: fila._contrato?.bonoMovilizacion || 0,
      estado: 'borrador',
    };
    const extra = { [item.campo]: Number(soloNum(valores[fila.id])) || 0 };
    if (item.auxiliar) extra[item.auxiliar.campo] = Number(soloNum(aux[fila.id])) || 0;
    return { ...base, ...extra };
  }, [item, valores, aux, mes, anio]);

  const abrirPreview = (fila) => {
    const rem = construirRem(fila);
    const calc = liquidacionDe(fila, fila._contrato, rem);
    const trib = calcularRentaTributable(calc);
    const iut  = calcularIUT(trib, UTM_DEFAULT);
    setPreview({ fila, calc, trib, iut, liquido: calc.liquido - iut });
  };

  const guardar = async () => {
    if (!conValor.length || !empresaId) return;
    setGuardando(true);
    try {
      const batch = writeBatch(db);
      let creadas = 0, actualizadas = 0;

      conValor.forEach(fila => {
        const extra = { [item.campo]: Number(soloNum(valores[fila.id])) || 0 };
        if (item.auxiliar) extra[item.auxiliar.campo] = Number(soloNum(aux[fila.id])) || 0;

        if (fila._liq) {
          // Ya existe la liquidación del período: se toca SOLO este campo,
          // el resto de lo que hubiera cargado queda intacto.
          batch.update(doc(db, 'empresas', empresaId, 'remuneraciones', fila._liq.id), {
            ...extra, updatedAt: serverTimestamp(),
          });
          actualizadas++;
        } else {
          const ref = doc(collection(db, 'empresas', empresaId, 'remuneraciones'));
          batch.set(ref, {
            ...construirRem(fila), ...extra,
            createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
          });
          creadas++;
        }
      });

      await batch.commit();
      setResultado({ creadas, actualizadas, item: item.label });
      limpiar();
      onSaved?.();
    } catch (e) {
      alert('Error al guardar: ' + e.message);
    }
    setGuardando(false);
  };

  const cerrar = () => { limpiar(); setResultado(null); setPreview(null); onClose?.(); };

  const g = COLOR_GRUPO[item.grupo] || COLOR_GRUPO.Base;

  return (
    <Modal isOpen={isOpen} onClose={cerrar}
      title="Carga masiva de haberes y descuentos"
      subtitle={`Período ${MESES[parseInt(mes) - 1]} ${anio}`}
      maxWidth="max-w-5xl">

      {resultado ? (
        <div className="space-y-4">
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 px-5 py-6 text-center">
            <div className="w-11 h-11 rounded-2xl bg-emerald-100 flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
            </div>
            <p className="text-sm font-black text-slate-800">{resultado.item} cargado</p>
            <p className="text-xs text-slate-500 mt-1">
              {resultado.creadas} liquidación(es) creada(s) · {resultado.actualizadas} actualizada(s)
            </p>
          </div>
          <div className="flex justify-center gap-3">
            <button onClick={() => setResultado(null)}
              className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm rounded-xl transition-colors">
              Cargar otro ítem
            </button>
            <button onClick={cerrar}
              className="px-5 py-2.5 bg-violet-600 hover:bg-violet-700 text-white font-bold text-sm rounded-xl transition-colors">
              Cerrar
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">

          {/* Ítem */}
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Ítem de pago</p>
            <div className="flex flex-wrap gap-1.5">
              {ITEMS_PAGO.map(i => {
                const c = COLOR_GRUPO[i.grupo];
                const on = i.id === itemId;
                return (
                  <button key={i.id} onClick={() => { setItemId(i.id); limpiar(); }}
                    className="px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all"
                    style={on
                      ? { background: c.text, color: '#fff' }
                      : { background: c.bg, color: c.text }}>
                    {i.label}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-slate-400 mt-1.5">
              <span className="font-bold" style={{ color: g.text }}>{item.grupo}</span>
              {' · se guarda en '}<span className="font-mono">{item.campo}</span>
            </p>
          </div>

          {/* Filtros */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <select className={inp} value={fArea} onChange={e => setFArea(e.target.value)}>
              <option value="">Todas las áreas</option>
              {opciones.areas.map(a => <option key={a}>{a}</option>)}
            </select>
            <select className={inp} value={fCentro} onChange={e => setFCentro(e.target.value)}>
              <option value="">Todos los centros</option>
              {opciones.centros.map(c => <option key={c}>{c}</option>)}
            </select>
            <select className={inp} value={fEmpresa} onChange={e => setFEmpresa(e.target.value)}>
              <option value="">Todas las empresas</option>
              {opciones.empresas.map(e => <option key={e}>{e}</option>)}
            </select>
            <select className={inp} value={fSucursal} onChange={e => setFSucursal(e.target.value)}>
              <option value="">Todas las sucursales</option>
              {opciones.sucursales.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <input className={inp + ' flex-1'} placeholder="Buscar por nombre, RUT o cargo…"
              value={busqueda} onChange={e => setBusqueda(e.target.value)} />
            <button onClick={aplicarATodos} disabled={!elegibles.length}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-600 whitespace-nowrap transition-colors">
              Aplicar a los {elegibles.length} visibles
            </button>
            <button onClick={limpiar}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-500 whitespace-nowrap transition-colors">
              Limpiar
            </button>
          </div>

          {/* Tabla */}
          <div className="overflow-auto rounded-xl border border-slate-100" style={{ maxHeight: 340 }}>
            <table className="w-full text-xs">
              <thead className="sticky top-0">
                <tr style={{ background: '#1e1b4b' }}>
                  {['Trabajador', 'Cargo', 'Centro de costo',
                    `${item.label} (${item.unidad})`,
                    ...(item.auxiliar ? [item.auxiliar.label] : []),
                    ''].map((h, i) => (
                    <th key={i} className="px-3 py-2 text-[10px] font-black text-slate-300 uppercase tracking-widest text-left whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 bg-white">
                {filas.map(f => {
                  const sinContrato = !f._contrato;
                  return (
                    <tr key={f.id} className={sinContrato ? 'bg-slate-50/70' : ''}>
                      <td className="px-3 py-1.5">
                        <p className="font-bold text-slate-700">{f.apellidoPaterno} {f.nombre}</p>
                        <p className="text-[10px] text-slate-400 font-mono">{f.rut}</p>
                      </td>
                      <td className="px-3 py-1.5 text-slate-500 max-w-[150px] truncate">{f.cargo || '—'}</td>
                      <td className="px-3 py-1.5 text-slate-500 max-w-[130px] truncate">
                        {f.centroCostoNombre || f.centroCosto || <span className="text-amber-600">Sin centro</span>}
                      </td>
                      <td className="px-3 py-1.5">
                        {sinContrato ? (
                          <span className="text-[11px] text-slate-400 italic">Sin contrato vigente</span>
                        ) : (
                          <input
                            className="w-24 px-2 py-1 border border-slate-200 rounded-lg text-right font-mono focus:outline-none focus:border-violet-400"
                            value={valores[f.id] || ''} inputMode="numeric"
                            onChange={e => setValor(f.id, e.target.value)}
                            placeholder="0" />
                        )}
                      </td>
                      {item.auxiliar && (
                        <td className="px-3 py-1.5">
                          {!sinContrato && (
                            <input
                              className="w-24 px-2 py-1 border border-slate-200 rounded-lg text-right font-mono focus:outline-none focus:border-violet-400"
                              value={aux[f.id] || ''} inputMode="numeric"
                              onChange={e => setAuxiliar(f.id, e.target.value)}
                              placeholder="0" />
                          )}
                        </td>
                      )}
                      <td className="px-3 py-1.5 text-right">
                        {!sinContrato && (
                          <button onClick={() => abrirPreview(f)} title="Previsualizar liquidación"
                            className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-violet-100 hover:text-violet-700 text-slate-500 inline-flex items-center justify-center transition-all">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {filas.length === 0 && (
                  <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-300">Ningún trabajador con esos filtros</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {filas.length > elegibles.length && (
            <p className="text-[11px] text-amber-600">
              {filas.length - elegibles.length} sin contrato vigente: no se les puede cargar el ítem
              porque no hay sueldo base del cual partir.
            </p>
          )}

          <div className="flex justify-between items-center gap-3 pt-1">
            <p className="text-xs text-slate-500">
              {conValor.length > 0
                ? `${conValor.length} persona${conValor.length !== 1 ? 's' : ''} con valor cargado`
                : 'Escribe los valores en la columna'}
            </p>
            <button onClick={guardar} disabled={!conValor.length || guardando}
              className="px-5 py-2.5 bg-violet-600 hover:bg-violet-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold text-sm rounded-xl transition-colors">
              {guardando ? 'Guardando…' : `Guardar ${item.label}`}
            </button>
          </div>
        </div>
      )}

      {/* Previsualización — mismo cálculo que genera el PDF, sin escribir nada */}
      {preview && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4"
          style={{ background: 'rgba(15,12,41,0.6)' }} onClick={() => setPreview(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4" style={{ background: 'linear-gradient(135deg,#0f0c29,#302b63)' }}>
              <p className="text-[10px] font-black uppercase tracking-widest text-white/40">Previsualización de la liquidación</p>
              <p className="text-base font-black text-white mt-0.5">
                {preview.fila.nombre} {preview.fila.apellidoPaterno}
              </p>
              <p className="text-[11px] text-violet-200/70">{MESES[parseInt(mes) - 1]} {anio} · no guardado</p>
            </div>

            <div className="p-5 space-y-3">
              <div className="grid grid-cols-4 gap-2">
                {[
                  ['Días Trab.', preview.calc.diasTrab],
                  ['Horas Extra', Number(soloNum(valores[preview.fila.id]) || 0)],
                  ['Imponible', Math.round(preview.calc.imponible).toLocaleString('es-CL')],
                  ['Tributable', Math.round(preview.trib).toLocaleString('es-CL')],
                ].map(([l, v]) => (
                  <div key={l} className="rounded-lg px-2 py-1.5 text-center" style={{ background: '#f3f0ff' }}>
                    <p className="text-[9px] font-black uppercase" style={{ color: '#6d28d9' }}>{l}</p>
                    <p className="text-xs font-bold text-slate-700 mt-0.5">{v}</p>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest px-2 py-1.5 rounded-t"
                    style={{ background: '#f3f0ff', color: '#6d28d9' }}>Haberes</p>
                  <table className="w-full text-[11px]">
                    <tbody>
                      {[
                        ['Sueldo Base', preview.calc.base],
                        ['Gratificación', preview.calc.gratMensual],
                        ['Horas Extra', preview.calc.montoHE],
                        ['Bono Producción', preview.calc.bProd],
                        ['Otros Imponibles', preview.calc.otrosImp],
                        ['Colación', preview.calc.bColacion],
                        ['Movilización', preview.calc.bMovil],
                        ['Viáticos', preview.calc.viaticos],
                      ].filter(([, v]) => v > 0).map(([l, v]) => (
                        <tr key={l}><td className="px-2 py-1 border-b border-slate-50 text-slate-600">{l}</td>
                          <td className="px-2 py-1 border-b border-slate-50 text-right font-mono font-semibold">{fmt(v)}</td></tr>
                      ))}
                      <tr style={{ background: '#f3f0ff' }}>
                        <td className="px-2 py-1 font-black text-slate-700">TOTAL</td>
                        <td className="px-2 py-1 text-right font-mono font-black">{fmt(preview.calc.imponible + preview.calc.noImponible)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest px-2 py-1.5 rounded-t"
                    style={{ background: '#f3f0ff', color: '#6d28d9' }}>Descuentos</p>
                  <table className="w-full text-[11px]">
                    <tbody>
                      {[
                        ['AFP', preview.calc.afpM],
                        ['APV', preview.calc.apvM],
                        ['Salud', preview.calc.salM],
                        ['Cesantía', preview.calc.cesM],
                        ['Impuesto', preview.iut],
                        ['Anticipo', preview.calc.anticipo],
                        ['Otros descuentos', preview.calc.descAdicional],
                      ].filter(([, v]) => v > 0).map(([l, v]) => (
                        <tr key={l}><td className="px-2 py-1 border-b border-slate-50 text-slate-600">{l}</td>
                          <td className="px-2 py-1 border-b border-slate-50 text-right font-mono font-semibold">{fmt(v)}</td></tr>
                      ))}
                      <tr style={{ background: '#f3f0ff' }}>
                        <td className="px-2 py-1 font-black text-slate-700">TOTAL</td>
                        <td className="px-2 py-1 text-right font-mono font-black">{fmt(preview.calc.totalDescuentos + preview.iut + preview.calc.descAdicional + preview.calc.anticipo)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="rounded-xl px-4 py-3 flex items-center justify-between" style={{ background: '#5b21b6' }}>
                <span className="text-[11px] font-black uppercase tracking-widest text-violet-200">Alcance líquido</span>
                <span className="text-lg font-black text-white">{fmt(preview.liquido)}</span>
              </div>

              {!preview.calc.afpResuelta && (
                <p className="text-[11px] text-amber-600">
                  Este trabajador no tiene AFP en su ficha: la cotización se calculó con una tasa por defecto.
                </p>
              )}

              <div className="flex justify-end">
                <button onClick={() => setPreview(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-sm rounded-xl transition-colors">
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
