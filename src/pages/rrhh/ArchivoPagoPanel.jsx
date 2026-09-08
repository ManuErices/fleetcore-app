/**
 * ArchivoPagoPanel.jsx — src/pages/rrhh/ArchivoPagoPanel.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Nómina de transferencias en formato Pago Fácil del Banco de Chile.
 *
 * Reemplaza al CSV genérico que ningún portal aceptaba. Además, generar la
 * nómina ahora ES el acto de pago: deja el registro en `nominas_pago` y marca
 * lo pagado. Antes el estado 'pagado' se leía en la tabla pero no lo escribía
 * nadie, así que la misma gente reaparecía en cada archivo.
 */

import { useState, useMemo, useEffect } from 'react';
import { db } from '../../lib/firebase';
import { useEmpresa } from '../../lib/useEmpresa';
import { collection, onSnapshot } from 'firebase/firestore';
import { MESES, UTM_DEFAULT, codigoBanco, codigoTipoCuenta } from './shared';
import { liquidacionDe, calcularIUT, calcularRentaTributable } from './calculo';
import { useAnticipos, anticiposDe, totalAnticipos } from './anticipos';
import {
  prepararNomina, descargarNominaBancoChile, registrarNomina, nombreDeNomina,
} from './nominaBanco';

const fmt = n => `$${Math.round(n || 0).toLocaleString('es-CL')}`;

export default function ArchivoPagoPanel({ liqEnriquecidas = [], trabajadores = [], mes, anio, utm = UTM_DEFAULT, onSaved }) {
  const { empresaId } = useEmpresa();
  const { anticipos } = useAnticipos(empresaId);

  const [tipo, setTipo]         = useState('sueldo');   // 'sueldo' | 'anticipo'
  const [generando, setGen]     = useState(false);
  const [resultado, setResult]  = useState(null);
  const [historial, setHist]    = useState([]);

  const periodo = `${MESES[parseInt(mes) - 1] || mes} ${anio}`;

  // Historial de nóminas ya emitidas
  useEffect(() => {
    if (!empresaId) return;
    return onSnapshot(collection(db, 'empresas', empresaId, 'nominas_pago'), snap => {
      setHist(
        snap.docs.map(d => ({ id: d.id, ...d.data() }))
          .filter(n => n.mes === mes && n.anio === anio)
          .sort((a, b) => String(b.fecha || '').localeCompare(String(a.fecha || '')))
      );
    }, () => {});
  }, [empresaId, mes, anio]);

  // ── Pagos candidatos según el tipo elegido ──
  const pagos = useMemo(() => {
    if (tipo === 'anticipo') {
      return (anticipos || [])
        .filter(a => a.mes === mes && a.anio === anio && a.estado === 'pendiente')
        .map(a => {
          const t = trabajadores.find(x => x.id === a.trabajadorId);
          return {
            key: a.id, anticipoId: a.id, trabajador: t,
            monto: a.monto,
            glosa: a.glosa || `ANTICIPO ${periodo}`,
            descripcion: `Anticipo ${periodo}`,
          };
        })
        .filter(p => p.trabajador);
    }

    // Sueldos: solo lo que no se ha pagado todavía
    return liqEnriquecidas
      .filter(({ liq }) => liq.estado !== 'pagado')
      .map(({ trabajador, contrato, liq }) => {
        const c = liquidacionDe(trabajador, contrato, liq, {
          anticiposRegistrados: anticiposDe(anticipos, trabajador?.id, mes, anio).length
            ? totalAnticipos(anticipos, trabajador?.id, mes, anio)
            : undefined,
        });
        const iut = calcularIUT(calcularRentaTributable(c), utm);
        return {
          key: liq.id, liquidacionId: liq.id, trabajador,
          monto: Math.max(0, c.liquido - iut),
          glosa: `REMUNERACION ${periodo}`,
          descripcion: `Liquidacion ${periodo}`,
        };
      });
  }, [tipo, liqEnriquecidas, anticipos, trabajadores, mes, anio, periodo, utm]);

  const { lineas, errores, total } = useMemo(() => prepararNomina(pagos), [pagos]);

  // Índice para mostrar el monto junto a cada persona sin recalcular
  const montoPorTrabajador = useMemo(() => {
    const m = {};
    pagos.forEach(p => { m[p.trabajador?.id] = (m[p.trabajador?.id] || 0) + p.monto; });
    return m;
  }, [pagos]);

  const generar = async () => {
    if (!lineas.length || !empresaId) return;
    setGen(true); setResult(null);
    try {
      // El registro va primero: si falla, no se descarga nada. Un archivo en
      // el disco del usuario sin su contraparte en Firestore sería plata
      // transferida que el sistema no sabe que salió.
      await registrarNomina(empresaId, {
        tipo, mes, anio, lineas, total,
        glosa: nombreDeNomina(tipo, mes, anio),
        marcarLiq: tipo === 'sueldo'
          ? pagos.filter(p => lineas.some(l => l.trabajadorId === p.trabajador?.id))
              .map(p => ({ id: p.liquidacionId, montoPagado: p.monto }))
          : [],
        marcarAnt: tipo === 'anticipo'
          ? pagos.filter(p => lineas.some(l => l.trabajadorId === p.trabajador?.id))
              .map(p => p.anticipoId)
          : [],
      });
      descargarNominaBancoChile(lineas, nombreDeNomina(tipo, mes, anio));
      setResult({ ok: true, cantidad: lineas.length, total });
      onSaved?.();
    } catch (e) {
      setResult({ ok: false, msg: e.message });
    }
    setGen(false);
  };

  return (
    <div className="space-y-4">

      {/* ── Cabecera ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">
            Nómina de transferencias — {periodo}
          </p>
          <p className="text-xs text-slate-400 mt-0.5">
            Formato Pago Fácil del Banco de Chile (XLSX)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-xl overflow-hidden border border-slate-200">
            {[['sueldo', 'Sueldos'], ['anticipo', 'Anticipos']].map(([id, label]) => (
              <button key={id} onClick={() => { setTipo(id); setResult(null); }}
                className={`px-4 py-2 text-xs font-bold transition-colors ${
                  tipo === id ? 'bg-violet-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}>
                {label}
              </button>
            ))}
          </div>
          <button onClick={generar} disabled={!lineas.length || generando}
            className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold text-sm rounded-xl hover:opacity-90 shadow-sm disabled:opacity-40">
            {generando
              ? <><span className="w-3.5 h-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin inline-block" /> Generando…</>
              : <>Generar nómina ({lineas.length})</>}
          </button>
        </div>
      </div>

      {/* ── Resultado ── */}
      {resultado && (
        <div className={`rounded-xl px-4 py-3 border ${resultado.ok
          ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
          {resultado.ok ? (
            <p className="text-xs font-bold text-emerald-800">
              Nómina emitida: {resultado.cantidad} {resultado.cantidad === 1 ? 'pago' : 'pagos'} por {fmt(resultado.total)}.
              Quedaron marcados como pagados y registrados en el historial.
            </p>
          ) : (
            <p className="text-xs font-bold text-red-700">No se pudo emitir: {resultado.msg}</p>
          )}
        </div>
      )}

      {/* ── Advertencia: descargar es pagar ── */}
      {lineas.length > 0 && (
        <div className="bg-violet-50 border border-violet-200 rounded-xl px-4 py-3">
          <p className="text-xs text-violet-800 leading-snug">
            <strong>Generar la nómina marca estos {lineas.length} pagos como pagados</strong> y los deja
            registrados en el historial. Dejan de aparecer en la próxima nómina del período. Si
            necesitas corregir algo, hazlo antes de generar.
          </p>
        </div>
      )}

      {/* ── Errores de datos bancarios ── */}
      {errores.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <p className="text-xs font-black text-amber-800 mb-1.5">
            {errores.length} {errores.length === 1 ? 'persona queda' : 'personas quedan'} fuera del archivo
          </p>
          <p className="text-[11px] text-amber-700 mb-2 leading-snug">
            El portal rechaza el archivo completo si un registro viene incompleto, así que estas
            líneas no se incluyen. Completa los datos en la ficha del trabajador y vuelve a generar.
          </p>
          <div className="space-y-1">
            {errores.map((e, i) => (
              <div key={i} className="flex items-center gap-2 text-[11px]">
                <span className="font-bold text-amber-900 min-w-[160px]">{e.nombre || '—'}</span>
                <span className="text-amber-600">falta: {e.faltan.join(', ')}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Tabla ── */}
      {pagos.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-slate-400 bg-slate-50 rounded-2xl">
          <span className="text-4xl mb-3">🏦</span>
          <p className="font-semibold">
            {tipo === 'anticipo'
              ? `Sin anticipos por pagar en ${periodo}`
              : `Sin liquidaciones pendientes de pago en ${periodo}`}
          </p>
          <p className="text-xs mt-1">
            {tipo === 'anticipo'
              ? 'Los anticipos se registran en la pestaña Anticipos.'
              : 'Todas las liquidaciones del período ya fueron pagadas.'}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-100">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: '#1e1b4b' }}>
                {['Trabajador', 'RUT', 'Banco', 'Tipo', 'N° Cuenta', 'Monto', ''].map(h => (
                  <th key={h} className="px-3 py-2.5 text-[10px] font-black text-slate-300 uppercase tracking-widest text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {pagos.map(p => {
                const t   = p.trabajador;
                const cod = codigoBanco(t?.banco);
                const tc  = codigoTipoCuenta(t?.tipoCuenta);
                const ok  = cod && tc && t?.nroCuenta && t?.rut;
                return (
                  <tr key={p.key} className={`hover:bg-slate-50 ${!ok ? 'bg-amber-50/40' : ''}`}>
                    <td className="px-3 py-2.5 font-bold text-slate-800">
                      {t?.nombre} {t?.apellidoPaterno}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-slate-500 text-xs">{t?.rut || '—'}</td>
                    <td className="px-3 py-2.5 text-slate-500 text-xs">
                      {cod
                        ? <span className="font-mono">{cod}</span>
                        : <span className="text-amber-600 font-bold">Sin banco</span>}
                    </td>
                    <td className="px-3 py-2.5 text-slate-500 text-xs">
                      {tc || <span className="text-amber-600 font-bold">—</span>}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-slate-500 text-xs">{t?.nroCuenta || '—'}</td>
                    <td className="px-3 py-2.5 font-black text-emerald-600">{fmt(p.monto)}</td>
                    <td className="px-3 py-2.5">
                      {!ok && <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Sin datos</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ background: '#1e1b4b' }}>
                <td colSpan={5} className="px-3 py-2.5 text-right text-xs font-black text-white">
                  TOTAL A TRANSFERIR ({lineas.length} de {pagos.length})
                </td>
                <td className="px-3 py-2.5 font-black text-emerald-300">{fmt(total)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* ── Historial del período ── */}
      <div>
        <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-2">
          Nóminas emitidas en {periodo}
        </p>
        {historial.length === 0 ? (
          <p className="text-xs text-slate-400 py-3">Todavía no se ha emitido ninguna nómina este período.</p>
        ) : (
          <div className="rounded-xl border border-slate-100 divide-y divide-slate-50">
            {historial.map(n => (
              <div key={n.id} className="flex items-center gap-3 px-3 py-2.5 text-xs">
                <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                  n.tipo === 'anticipo' ? 'bg-sky-100 text-sky-700' : 'bg-violet-100 text-violet-700'}`}>
                  {n.tipo === 'anticipo' ? 'Anticipos' : 'Sueldos'}
                </span>
                <span className="text-slate-500 font-mono">
                  {String(n.fecha || '').slice(0, 10)} {String(n.fecha || '').slice(11, 16)}
                </span>
                <span className="flex-1 text-slate-500">
                  {n.cantidad} {n.cantidad === 1 ? 'pago' : 'pagos'}
                </span>
                <span className="font-black text-slate-700">{fmt(n.total)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
