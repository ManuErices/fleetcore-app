/**
 * ReliquidacionModal.jsx — src/pages/rrhh/ReliquidacionModal.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Corrige un mes ya pagado. Se abre desde la liquidación original.
 *
 * Muestra las tres cifras que importan juntas: lo que arroja el mes corregido,
 * lo que ya se transfirió, y la diferencia. Esa última es la que va a la
 * nómina bancaria.
 */

import { useState, useEffect, useMemo } from 'react';
import { useEmpresa } from '../../lib/useEmpresa';
import { Modal, inp, MESES } from './shared';
import { useItemsPago, colorDe, grupoDe, snapshotItem } from './itemsPago';
import {
  borradorDeReliquidacion, montoYaPagado, diferencialDe, guardarReliquidacion,
} from './reliquidacion';

const fmt  = n => `$${Math.round(n || 0).toLocaleString('es-CL')}`;
const num  = v => String(v ?? '').replace(/[^\d]/g, '');
const clp  = v => { const n = num(v); return n ? Number(n).toLocaleString('es-CL') : ''; };

function Campo({ label, children }) {
  return (
    <div>
      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{label}</p>
      {children}
    </div>
  );
}

export default function ReliquidacionModal({
  isOpen, onClose, original, editData, trabajador, contrato,
  anticiposRegistrados, licenciasRegistradas, utm, onSaved,
}) {
  const { empresaId } = useEmpresa();
  const { itemsCustom } = useItemsPago(empresaId);

  const [form, setForm]       = useState(null);
  const [estimado, setEstim]  = useState(false);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState(null);

  useEffect(() => {
    if (!isOpen) return;
    if (editData) { setForm({ ...editData }); setEstim(false); return; }
    if (!original) { setForm(null); return; }
    const { monto, estimado: est } = montoYaPagado(original, trabajador, contrato,
      { utm, anticiposRegistrados, licenciasRegistradas });
    setForm(borradorDeReliquidacion(original, monto));
    setEstim(est);
    setError(null);
  }, [isOpen, original, editData, trabajador, contrato, utm, anticiposRegistrados, licenciasRegistradas]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const itemsForm        = Array.isArray(form?.items) ? form.items : [];
  const idsUsados        = new Set(itemsForm.map(i => i.itemId));
  const itemsDisponibles = itemsCustom.filter(i => !idsUsados.has(i.id));

  const resultado = useMemo(() => {
    if (!form || !contrato) return null;
    return diferencialDe(form, trabajador, contrato, { utm, anticiposRegistrados, licenciasRegistradas });
  }, [form, trabajador, contrato, utm, anticiposRegistrados, licenciasRegistradas]);

  const guardar = async () => {
    if (!form) return;
    setSaving(true); setError(null);
    try {
      await guardarReliquidacion(empresaId, form, editData?.id);
      onSaved?.(); onClose?.();
    } catch (e) { setError(e.message); }
    setSaving(false);
  };

  if (!form) return null;

  const periodo = `${MESES[parseInt(form.mes) - 1] || form.mes} ${form.anio}`;

  return (
    <Modal isOpen={isOpen} onClose={onClose}
      title={editData ? 'Editar reliquidación' : 'Reliquidar período'}
      subtitle={`${trabajador?.nombre || ''} ${trabajador?.apellidoPaterno || ''} · ${periodo}`}
      maxWidth="max-w-3xl">

      <div className="space-y-5">

        {/* ── Explicación del modelo ── */}
        <div className="rounded-xl bg-violet-50 border border-violet-200 px-4 py-3">
          <p className="text-xs text-violet-800 leading-snug">
            Se recalcula <strong>el mes completo</strong> con los datos corregidos, no solo la
            diferencia. El impuesto único es progresivo, así que calcularlo sobre un diferencial
            aislado lo dejaría en un tramo que no corresponde. Lo ya transferido entra como
            descuento y lo que queda es la diferencia por pagar.
          </p>
        </div>

        {estimado && (
          <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3">
            <p className="text-xs text-amber-800 leading-snug">
              La liquidación original no tiene registrado el monto transferido — es anterior al
              registro de nóminas. El valor de abajo está <strong>calculado</strong>, no leído.
              Confírmalo contra la cartola antes de emitir la diferencia.
            </p>
          </div>
        )}

        {/* ── Ya pagado ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Campo label="Ya transferido el día de pago">
            <input className={inp} value={clp(form.pagoAnterior)}
              onChange={e => set('pagoAnterior', Number(num(e.target.value)) || 0)} />
          </Campo>
          <Campo label="Motivo de la reliquidación">
            <input className={inp} value={form.observaciones || ''} maxLength={80}
              placeholder="Ej: faltaron horas extra de la última semana"
              onChange={e => set('observaciones', e.target.value)} />
          </Campo>
        </div>

        {/* ── Haberes corregidos ── */}
        <div>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Haberes imponibles</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              ['sueldoBase', 'Sueldo base'],
              ['bonoProduccion', 'Bono producción'],
              ['otrosImponibles', 'Otros imponibles'],
              ['horasExtra', 'Horas extra (n°)'],
              ['valorHoraExtra', 'Valor hora extra'],
              ['diasTrabajados', 'Días trabajados'],
            ].map(([k, label]) => (
              <Campo key={k} label={label}>
                <input className={inp} value={clp(form[k])}
                  onChange={e => set(k, num(e.target.value))} />
              </Campo>
            ))}
          </div>
        </div>

        <div>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">No imponibles y descuentos</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              ['bonoColacion', 'Colación'],
              ['bonoMovilizacion', 'Movilización'],
              ['viaticos', 'Viáticos'],
              ['otrosNoImponibles', 'Otros no imp.'],
              ['descuentoAdicional', 'Desc. adicional'],
            ].map(([k, label]) => (
              <Campo key={k} label={label}>
                <input className={inp} value={clp(form[k])}
                  onChange={e => set(k, num(e.target.value))} />
              </Campo>
            ))}
          </div>
        </div>

        {/* ── Ítems de la empresa ── */}
        {(itemsForm.length > 0 || itemsCustom.length > 0) && (
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Ítems de la empresa</p>
            <div className="space-y-2">
              {itemsForm.map(it => {
                const c = colorDe(it.tipo);
                return (
                  <div key={it.itemId} className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-lg text-[10px] font-black whitespace-nowrap"
                      style={{ background: c.bg, color: c.text }}>{grupoDe(it.tipo)}</span>
                    <span className="flex-1 text-sm font-bold text-slate-700 truncate">{it.nombre}</span>
                    <input className={inp + ' max-w-[150px]'} value={clp(it.monto)}
                      onChange={e => set('items', itemsForm.map(x =>
                        x.itemId === it.itemId ? { ...x, monto: Number(num(e.target.value)) || 0 } : x))} />
                    <button onClick={() => set('items', itemsForm.filter(x => x.itemId !== it.itemId))}
                      className="w-8 h-8 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 flex items-center justify-center">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                );
              })}
              {itemsDisponibles.length > 0 && (
                <select className={inp} value=""
                  onChange={e => {
                    const cat = itemsCustom.find(i => i.id === e.target.value);
                    if (cat) set('items', [...itemsForm, snapshotItem(cat, 0)]);
                  }}>
                  <option value="">+ Agregar ítem…</option>
                  {itemsDisponibles.map(i => (
                    <option key={i.id} value={i.id}>{i.nombre} — {grupoDe(i.tipo)}</option>
                  ))}
                </select>
              )}
            </div>
          </div>
        )}

        {/* ── Resultado ── */}
        {resultado && (
          <div className="rounded-2xl border border-slate-200 overflow-hidden">
            <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-slate-100">
              <div className="px-4 py-3">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Mes corregido</p>
                <p className="text-base font-black text-slate-700 mt-1">{fmt(resultado.liquidoMesCompleto)}</p>
              </div>
              <div className="px-4 py-3">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Ya transferido</p>
                <p className="text-base font-black text-slate-500 mt-1">-{fmt(form.pagoAnterior)}</p>
              </div>
              <div className="px-4 py-3" style={{ background: resultado.aFavorEmpresa ? '#fef2f2' : '#ecfdf5' }}>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  {resultado.aFavorEmpresa ? 'Pagado de más' : 'Diferencia por pagar'}
                </p>
                <p className={`text-base font-black mt-1 ${resultado.aFavorEmpresa ? 'text-red-600' : 'text-emerald-600'}`}>
                  {fmt(Math.abs(resultado.diferencial))}
                </p>
              </div>
            </div>
            <div className="px-4 py-2 bg-slate-50 border-t border-slate-100 text-[11px] text-slate-500 flex flex-wrap gap-4">
              <span>Imponible: <strong className="text-slate-700">{fmt(resultado.calc.imponible)}</strong></span>
              <span>AFP: <strong className="text-red-500">-{fmt(resultado.calc.afpM)}</strong></span>
              <span>Salud: <strong className="text-red-500">-{fmt(resultado.calc.salM)}</strong></span>
              <span>IUT del mes: <strong className="text-violet-600">-{fmt(resultado.iut)}</strong></span>
            </div>
          </div>
        )}

        {resultado?.aFavorEmpresa && (
          <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3">
            <p className="text-xs text-red-800 leading-snug">
              El mes corregido es <strong>menor</strong> que lo ya transferido. La nómina bancaria
              no admite montos negativos, así que esta diferencia no se puede cobrar por ahí:
              recupérala como descuento en la liquidación del mes siguiente o por acuerdo con el
              trabajador. La reliquidación igual corrige el período para Previred y contabilidad.
            </p>
          </div>
        )}

        {error && <p className="text-xs font-bold text-red-600">{error}</p>}

        <div className="flex justify-between items-center pt-1">
          <p className="text-[11px] text-slate-400 max-w-md leading-snug">
            Al guardar, esta reliquidación reemplaza a la original en los totales del mes:
            Previred, libro de remuneraciones y asientos. La original se conserva como registro
            de lo que se transfirió.
          </p>
          <div className="flex gap-2">
            <button onClick={onClose}
              className="px-4 py-2.5 rounded-xl text-sm font-bold bg-slate-100 hover:bg-slate-200 text-slate-600">
              Cancelar
            </button>
            <button onClick={guardar} disabled={saving}
              className="px-5 py-2.5 rounded-xl text-sm font-bold bg-violet-600 hover:bg-violet-700 text-white disabled:opacity-40">
              {saving ? 'Guardando…' : 'Guardar reliquidación'}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
