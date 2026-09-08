/**
 * ItemsPagoModal.jsx — src/pages/rrhh/ItemsPagoModal.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Catálogo de ítems de pago de la empresa: crear bonos y descuentos con nombre
 * propio y decidir si son imponibles, no imponibles o descuentos.
 *
 * Los 10 ítems fijos se muestran para que quede claro qué existe ya y nadie
 * cree un "Colación" duplicado, pero no son editables: tienen campo propio en
 * la liquidación y tratamiento especial en el PDF y en Previred.
 */

import { useState } from 'react';
import { useEmpresa } from '../../lib/useEmpresa';
import { Modal, inp } from './shared';
import {
  TIPOS_ITEM_PAGO, ITEMS_FIJOS, useItemsPago,
  crearItemPago, actualizarItemPago, archivarItemPago, colorDe, grupoDe,
} from './itemsPago';

const TIPOS = Object.values(TIPOS_ITEM_PAGO);

function Chip({ tipo }) {
  const c = colorDe(tipo);
  return (
    <span className="px-2 py-0.5 rounded-lg text-[10px] font-black whitespace-nowrap"
      style={{ background: c.bg, color: c.text }}>
      {grupoDe(tipo)}
    </span>
  );
}

export default function ItemsPagoModal({ isOpen, onClose }) {
  const { empresaId } = useEmpresa();
  const { itemsCustom, loading } = useItemsPago(empresaId);

  const [nombre, setNombre]       = useState('');
  const [tipo, setTipo]           = useState('imponible');
  const [prorratea, setProrratea] = useState(false);
  const [editId, setEditId]       = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError]         = useState(null);
  const [confirmar, setConfirmar] = useState(null);

  const limpiar = () => { setNombre(''); setTipo('imponible'); setProrratea(false); setEditId(null); setError(null); };

  const duplicado = [...ITEMS_FIJOS, ...itemsCustom].some(
    i => i.id !== editId && (i.nombre || i.label).toLowerCase().trim() === nombre.toLowerCase().trim()
  );

  const guardar = async () => {
    if (!nombre.trim() || duplicado) return;
    setGuardando(true); setError(null);
    try {
      if (editId) await actualizarItemPago(empresaId, editId, { nombre, tipo, prorratea });
      else        await crearItemPago(empresaId, { nombre, tipo, prorratea });
      limpiar();
    } catch (e) { setError(e.message); }
    setGuardando(false);
  };

  const editar = (item) => {
    setEditId(item.id); setNombre(item.nombre);
    setTipo(item.tipo); setProrratea(item.prorratea); setError(null);
  };

  const archivar = async (item) => {
    setGuardando(true);
    try { await archivarItemPago(empresaId, item.id); if (editId === item.id) limpiar(); }
    catch (e) { setError(e.message); }
    setConfirmar(null); setGuardando(false);
  };

  const cerrar = () => { limpiar(); setConfirmar(null); onClose?.(); };

  return (
    <Modal isOpen={isOpen} onClose={cerrar}
      title="Ítems de pago"
      subtitle="Bonos y descuentos con nombre propio · clasificación previsional"
      maxWidth="max-w-3xl">

      <div className="space-y-5">

        {/* ── Alta / edición ── */}
        <div className="rounded-2xl border border-violet-100 bg-violet-50/40 p-4 space-y-3">
          <p className="text-[10px] font-black text-violet-500 uppercase tracking-widest">
            {editId ? 'Editando ítem' : 'Nuevo ítem'}
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3">
            <input className={inp} value={nombre} maxLength={40}
              placeholder="Nombre del ítem — ej: Bono Nuevo Cobre"
              onChange={e => setNombre(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') guardar(); }} />
            <div className="flex gap-2">
              <button onClick={guardar} disabled={!nombre.trim() || duplicado || guardando}
                className="px-4 py-2.5 rounded-xl text-sm font-bold bg-violet-600 hover:bg-violet-700 text-white disabled:opacity-40 transition-colors whitespace-nowrap">
                {editId ? 'Guardar' : 'Agregar'}
              </button>
              {editId && (
                <button onClick={limpiar}
                  className="px-3 py-2.5 rounded-xl text-sm font-bold bg-white border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors">
                  Cancelar
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {TIPOS.map(t => {
              const on = t.id === tipo;
              return (
                <button key={t.id} onClick={() => setTipo(t.id)}
                  className="px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all"
                  style={on ? { background: t.text, color: '#fff' } : { background: t.bg, color: t.text }}>
                  {t.label}
                </button>
              );
            })}
          </div>

          <label className="flex items-start gap-2 cursor-pointer">
            <input type="checkbox" checked={prorratea} onChange={e => setProrratea(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded accent-violet-600" />
            <span className="text-[11px] text-slate-500 leading-snug">
              <strong className="text-slate-700">Prorratear por días trabajados.</strong>{' '}
              Actívalo en montos fijos mensuales (bono de zona, responsabilidad). Déjalo apagado
              en bonos variables, que ya vienen calculados sobre lo efectivamente ganado.
            </span>
          </label>

          {duplicado && nombre.trim() && (
            <p className="text-[11px] font-bold text-amber-600">Ya existe un ítem con ese nombre.</p>
          )}
          {error && <p className="text-[11px] font-bold text-red-600">{error}</p>}

          <p className="text-[11px] text-slate-400 leading-snug border-t border-violet-100 pt-2.5">
            La clasificación define si el monto entra a la base imponible (AFP, salud, cesantía,
            gratificación e impuesto) o si se paga libre de cotizaciones. Cambiarla después no
            altera las liquidaciones ya emitidas — solo las que se carguen desde ese momento.
          </p>
        </div>

        {/* ── Ítems de la empresa ── */}
        <div>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
            Ítems de la empresa {itemsCustom.length > 0 && `(${itemsCustom.length})`}
          </p>

          {loading ? (
            <p className="text-xs text-slate-400 py-4 text-center">Cargando…</p>
          ) : itemsCustom.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 py-8 text-center">
              <p className="text-sm font-bold text-slate-400">Todavía no hay ítems propios</p>
              <p className="text-xs text-slate-400 mt-1">
                Crea el primero arriba y aparecerá en la carga masiva y en cada liquidación.
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-slate-100 divide-y divide-slate-50">
              {itemsCustom.map(item => (
                <div key={item.id} className="flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50/70">
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-slate-700 text-sm truncate">{item.nombre}</p>
                    {item.prorratea && (
                      <p className="text-[10px] text-slate-400">Se prorratea por días trabajados</p>
                    )}
                  </div>
                  <Chip tipo={item.tipo} />
                  <button onClick={() => editar(item)}
                    className="text-[11px] font-bold text-violet-600 hover:text-violet-800 px-2 py-1">
                    Editar
                  </button>
                  <button onClick={() => setConfirmar(item)}
                    className="text-[11px] font-bold text-slate-400 hover:text-red-600 px-2 py-1">
                    Archivar
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Ítems del sistema ── */}
        <div>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
            Ítems del sistema — no editables
          </p>
          <div className="flex flex-wrap gap-1.5">
            {ITEMS_FIJOS.map(i => {
              const c = colorDe(i.tipo);
              return (
                <span key={i.id} className="px-2.5 py-1 rounded-lg text-[11px] font-bold"
                  style={{ background: c.bg, color: c.text }}>
                  {i.label}
                </span>
              );
            })}
          </div>
          <p className="text-[11px] text-slate-400 mt-2 leading-snug">
            Tienen campo propio en la liquidación y tratamiento particular en el PDF, en Previred
            y en los asientos contables, por eso no se pueden renombrar ni reclasificar.
          </p>
        </div>

        {/* ── Confirmación de archivado ── */}
        {confirmar && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
            <p className="text-sm font-black text-amber-800">
              ¿Archivar «{confirmar.nombre}»?
            </p>
            <p className="text-xs text-amber-700 mt-1 leading-snug">
              Deja de aparecer al cargar liquidaciones nuevas. Las liquidaciones que ya lo
              tienen no se tocan: conservan el nombre y el monto con que se emitieron.
            </p>
            <div className="flex gap-2 mt-3">
              <button onClick={() => archivar(confirmar)} disabled={guardando}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white disabled:opacity-40">
                Archivar
              </button>
              <button onClick={() => setConfirmar(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-white border border-amber-200 text-amber-700">
                Cancelar
              </button>
            </div>
          </div>
        )}

        <div className="flex justify-end pt-1">
          <button onClick={cerrar}
            className="px-5 py-2.5 rounded-xl text-sm font-bold bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors">
            Cerrar
          </button>
        </div>
      </div>
    </Modal>
  );
}
