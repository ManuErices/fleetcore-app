import React, { useState, useEffect, useMemo, useCallback } from "react";
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useEmpresa } from "../../lib/useEmpresa";
import { registrarCambio, registrarCambiosDocumento, registrarEliminacion } from "../../lib/deudaAuditoria";

// ─── Utilidades ───────────────────────────────────────────────────────────────
function fmtM(n) {
  if (!n && n !== 0) return "$0";
  const a = Math.abs(n);
  if (a >= 1000000) return (n < 0 ? "-" : "") + "$" + (a / 1000000).toFixed(1).replace(".", ",") + "M";
  return (n < 0 ? "-" : "") + "$" + Math.round(a).toLocaleString("es-CL");
}
function fmt(n) { return "$" + Math.round(Math.abs(n || 0)).toLocaleString("es-CL"); }

function generarMeses(desde, cantidad) {
  // desde: {anio, mes(0-11)}
  const out = [];
  for (let i = 0; i < cantidad; i++) {
    const d = new Date(desde.anio, desde.mes + i, 1);
    out.push({ key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, label: d.toLocaleString("es-CL", { month: "short", year: "2-digit" }) });
  }
  return out;
}

const ESTADO_CUOTA = {
  proyectado: { label: "Proyectado", color: "bg-blue-50 text-blue-600 border-blue-200" },
  pagado:     { label: "Pagado",     color: "bg-emerald-50 text-emerald-600 border-emerald-200" },
  aplazado:   { label: "Aplazado",   color: "bg-amber-50 text-amber-600 border-amber-200" },
};

// ─── Celda de cuota editable ───────────────────────────────────────────────────
function CeldaCuota({ cuota, onUpdate }) {
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(cuota?.montoProyectado || "");

  if (!cuota) {
    return <td className="px-1.5 py-1 text-center"><span className="text-slate-200 text-xs">·</span></td>;
  }

  const cfg = ESTADO_CUOTA[cuota.estado] || ESTADO_CUOTA.proyectado;

  function guardar() {
    const num = parseFloat(valor) || 0;
    onUpdate({ ...cuota, montoProyectado: num });
    setEditando(false);
  }

  function ciclarEstado(e) {
    e.stopPropagation();
    const siguiente = { proyectado: "pagado", pagado: "aplazado", aplazado: "proyectado" }[cuota.estado] || "proyectado";
    onUpdate({ ...cuota, estado: siguiente });
  }

  return (
    <td className="px-1.5 py-1">
      {editando ? (
        <input
          autoFocus type="number" value={valor} onChange={e => setValor(e.target.value)}
          onBlur={guardar} onKeyDown={e => e.key === "Enter" && guardar()}
          className="w-20 px-1 py-1 text-[11px] text-right border-2 border-purple-400 rounded-lg focus:outline-none"
        />
      ) : (
        <button
          onClick={() => setEditando(true)}
          className={`w-full px-1.5 py-1 rounded-lg border text-[11px] font-bold text-right ${cfg.color} hover:shadow-sm transition-all`}
          title="Clic para editar monto · clic derecho para cambiar estado"
          onContextMenu={ciclarEstado}
        >
          {fmtM(cuota.montoProyectado)}
        </button>
      )}
    </td>
  );
}

// ─── Modal: crear/editar acuerdo de pago ───────────────────────────────────────
function ModalAcuerdo({ isOpen, onClose, onSave, editando, mesesVisibles }) {
  const [form, setForm] = useState({ acreedorNombre: "", tipoDeuda: "proveedor", montoTotalAcordado: "", pie: "0", notas: "" });

  useEffect(() => {
    if (editando) {
      setForm({
        acreedorNombre: editando.acreedorNombre || "",
        tipoDeuda: editando.tipoDeuda || "proveedor",
        montoTotalAcordado: editando.montoTotalAcordado || "",
        pie: editando.pie || "0",
        notas: editando.notas || "",
      });
    } else {
      setForm({ acreedorNombre: "", tipoDeuda: "proveedor", montoTotalAcordado: "", pie: "0", notas: "" });
    }
  }, [editando, isOpen]);

  if (!isOpen) return null;

  function submit(e) {
    e.preventDefault();
    if (!form.acreedorNombre.trim()) return;
    const cuotasIniciales = editando?.cuotas || mesesVisibles.map(m => ({ mes: m.key, montoProyectado: 0, estado: "proyectado", montoPagadoReal: 0 }));
    onSave({
      ...form,
      montoTotalAcordado: parseFloat(form.montoTotalAcordado) || 0,
      pie: parseFloat(form.pie) || 0,
      cuotas: cuotasIniciales,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <form onSubmit={submit} className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-5 space-y-3">
        <h3 className="text-base font-black text-slate-800">{editando ? "Editar acuerdo" : "Nuevo acuerdo de pago"}</h3>

        <div>
          <label className="text-xs font-bold text-slate-500">Acreedor</label>
          <input required value={form.acreedorNombre} onChange={e => setForm(f => ({ ...f, acreedorNombre: e.target.value }))}
            className="w-full mt-1 px-3 py-2 border-2 border-slate-200 rounded-xl text-sm focus:outline-none focus:border-purple-400" />
        </div>

        <div>
          <label className="text-xs font-bold text-slate-500">Tipo de deuda</label>
          <select value={form.tipoDeuda} onChange={e => setForm(f => ({ ...f, tipoDeuda: e.target.value }))}
            className="w-full mt-1 px-3 py-2 border-2 border-slate-200 rounded-xl text-sm focus:outline-none focus:border-purple-400 bg-white">
            <option value="proveedor">Proveedor</option>
            <option value="factoring">Factoring</option>
            <option value="financiera">Financiera</option>
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-bold text-slate-500">Monto total acordado</label>
            <input type="number" value={form.montoTotalAcordado} onChange={e => setForm(f => ({ ...f, montoTotalAcordado: e.target.value }))}
              className="w-full mt-1 px-3 py-2 border-2 border-slate-200 rounded-xl text-sm focus:outline-none focus:border-purple-400" />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500">Pie / anticipo</label>
            <input type="number" value={form.pie} onChange={e => setForm(f => ({ ...f, pie: e.target.value }))}
              className="w-full mt-1 px-3 py-2 border-2 border-slate-200 rounded-xl text-sm focus:outline-none focus:border-purple-400" />
          </div>
        </div>

        <div>
          <label className="text-xs font-bold text-slate-500">Notas del acuerdo</label>
          <textarea value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))} rows={2}
            className="w-full mt-1 px-3 py-2 border-2 border-slate-200 rounded-xl text-sm focus:outline-none focus:border-purple-400 resize-none" />
        </div>

        <div className="flex gap-2 pt-2">
          <button type="button" onClick={onClose} className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 rounded-xl text-sm font-bold text-slate-600 transition-colors">Cancelar</button>
          <button type="submit" className="flex-1 py-2.5 bg-purple-700 hover:bg-purple-800 rounded-xl text-sm font-bold text-white transition-colors">Guardar</button>
        </div>
      </form>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function FinanzasPlanPagos() {
  const { empresaId } = useEmpresa();
  const [acuerdos, setAcuerdos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editando, setEditando] = useState(null);
  const [mesInicio] = useState({ anio: 2026, mes: 5 }); // jun-26, ajustable luego con selector

  const mesesVisibles = useMemo(() => generarMeses(mesInicio, 12), [mesInicio]);

  const cargar = useCallback(async () => {
    if (!empresaId) { setLoading(false); return; }
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, "empresas", empresaId, "deuda_acuerdos"));
      setAcuerdos(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error("Error cargando deuda_acuerdos:", e);
    }
    setLoading(false);
  }, [empresaId]);

  useEffect(() => { cargar(); }, [cargar]);

  async function guardarAcuerdo(datos) {
    if (!empresaId) return;
    try {
      if (editando) {
        await updateDoc(doc(db, "empresas", empresaId, "deuda_acuerdos", editando.id), datos);
        await registrarCambiosDocumento({
          empresaId,
          documentoId: editando.id,
          coleccion: "deuda_acuerdos",
          documentoAnterior: editando,
          documentoNuevo: { ...editando, ...datos },
          origen: "manual",
        });
      } else {
        const nuevoRef = await addDoc(collection(db, "empresas", empresaId, "deuda_acuerdos"), datos);
        await registrarCambio({
          empresaId,
          documentoId: nuevoRef.id,
          coleccion: "deuda_acuerdos",
          accion: "crear",
          origen: "manual",
        });
      }
      setModalOpen(false);
      setEditando(null);
      cargar();
    } catch (e) {
      console.error("Error guardando acuerdo:", e);
    }
  }

  async function actualizarCuota(acuerdo, cuotaActualizada) {
    const cuotaAnterior = (acuerdo.cuotas || []).find(c => c.mes === cuotaActualizada.mes) || null;
    const nuevasCuotas = (acuerdo.cuotas || []).map(c => c.mes === cuotaActualizada.mes ? cuotaActualizada : c);
    // Si el mes no existía en las cuotas guardadas, lo agregamos
    if (!nuevasCuotas.some(c => c.mes === cuotaActualizada.mes)) nuevasCuotas.push(cuotaActualizada);
    try {
      await updateDoc(doc(db, "empresas", empresaId, "deuda_acuerdos", acuerdo.id), { cuotas: nuevasCuotas });
      setAcuerdos(prev => prev.map(a => a.id === acuerdo.id ? { ...a, cuotas: nuevasCuotas } : a));
      await registrarCambio({
        empresaId,
        documentoId: acuerdo.id,
        coleccion: "deuda_acuerdos",
        accion: "actualizar",
        campo: `cuota_${cuotaActualizada.mes}`,
        valorAnterior: cuotaAnterior ? cuotaAnterior.estado : null,
        valorNuevo: cuotaActualizada.estado,
        origen: "manual",
      });
    } catch (e) {
      console.error("Error actualizando cuota:", e);
    }
  }

  async function eliminarAcuerdo(acuerdo) {
    if (!window.confirm(`¿Eliminar el acuerdo de pago con ${acuerdo.acreedorNombre}? Esta acción no se puede deshacer.`)) return;
    try {
      // Se audita ANTES de borrar, guardando el documento completo:
      // así queda registro de qué tenía el acuerdo si alguien pregunta después.
      await registrarEliminacion({
        empresaId,
        documentoId: acuerdo.id,
        coleccion: "deuda_acuerdos",
        documentoEliminado: acuerdo,
        origen: "manual",
      });
      await deleteDoc(doc(db, "empresas", empresaId, "deuda_acuerdos", acuerdo.id));
      cargar();
    } catch (e) {
      console.error("Error eliminando acuerdo:", e);
    }
  }

  function cuotaDelMes(acuerdo, mesKey) {
    return (acuerdo.cuotas || []).find(c => c.mes === mesKey) || { mes: mesKey, montoProyectado: 0, estado: "proyectado", montoPagadoReal: 0 };
  }

  const totalesPorMes = useMemo(() => {
    const m = {};
    mesesVisibles.forEach(({ key }) => { m[key] = 0; });
    acuerdos.forEach(a => (a.cuotas || []).forEach(c => { if (m[c.mes] !== undefined) m[c.mes] += c.montoProyectado || 0; }));
    return m;
  }, [acuerdos, mesesVisibles]);

  const totalGeneral = useMemo(() => acuerdos.reduce((s, a) => s + (a.cuotas || []).reduce((s2, c) => s2 + (c.montoProyectado || 0), 0) + (a.pie || 0), 0), [acuerdos]);

  return (
    <div className="space-y-4 sm:space-y-5">

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <p className="text-[11px] text-slate-400">
          Clic en una celda para editar el monto · clic derecho para cambiar el estado (proyectado → pagado → aplazado)
        </p>
        <button
          onClick={() => { setEditando(null); setModalOpen(true); }}
          className="px-4 py-2.5 bg-purple-700 hover:bg-purple-800 text-white rounded-xl text-sm font-bold transition-colors flex items-center gap-2 self-end sm:self-auto flex-shrink-0"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
          </svg>
          Nuevo acuerdo
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="spinner w-10 h-10 border-purple-600" />
        </div>
      ) : acuerdos.length === 0 ? (
        <div className="glass-card rounded-xl p-10 flex flex-col items-center justify-center text-center gap-3">
          <span className="text-4xl">🤝</span>
          <p className="text-sm font-black text-slate-700">Sin acuerdos de pago registrados</p>
          <p className="text-xs text-slate-400 max-w-sm">Crea un acuerdo por cada proveedor/acreedor con el que hayas negociado un plan de cuotas.</p>
        </div>
      ) : (
        <div className="glass-card rounded-xl p-2 sm:p-4 overflow-x-auto">
          <table className="w-full min-w-[1100px]">
            <thead>
              <tr className="text-left border-b-2 border-slate-100">
                <th className="py-2 px-3 text-[11px] font-black text-slate-400 uppercase sticky left-0 bg-white z-10 min-w-[180px]">Acreedor</th>
                <th className="py-2 px-2 text-[11px] font-black text-slate-400 uppercase text-right">Pie</th>
                {mesesVisibles.map(m => (
                  <th key={m.key} className="py-2 px-1.5 text-[10px] font-black text-slate-400 uppercase text-center min-w-[70px]">{m.label}</th>
                ))}
                <th className="py-2 px-2"></th>
              </tr>
            </thead>
            <tbody>
              {acuerdos.map(acuerdo => (
                <tr key={acuerdo.id} className="border-b border-slate-50 hover:bg-slate-50/60 group">
                  <td className="py-2 px-3 sticky left-0 bg-white z-10 group-hover:bg-slate-50/60">
                    <p className="text-xs font-bold text-slate-800">{acuerdo.acreedorNombre}</p>
                    <p className="text-[10px] text-slate-400">{acuerdo.tipoDeuda}</p>
                  </td>
                  <td className="py-2 px-2 text-right text-[11px] font-bold text-slate-500">{fmtM(acuerdo.pie)}</td>
                  {mesesVisibles.map(m => (
                    <CeldaCuota key={m.key} cuota={cuotaDelMes(acuerdo, m.key)} onUpdate={c => actualizarCuota(acuerdo, c)} />
                  ))}
                  <td className="py-2 px-2">
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => { setEditando(acuerdo); setModalOpen(true); }} className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                      </button>
                      <button onClick={() => eliminarAcuerdo(acuerdo)} className="p-1.5 rounded-lg bg-slate-100 hover:bg-red-100 text-slate-500 hover:text-red-600">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-200">
                <td className="py-3 px-3 text-xs font-black text-slate-700 sticky left-0 bg-white">TOTAL MES</td>
                <td className="py-3 px-2"></td>
                {mesesVisibles.map(m => (
                  <td key={m.key} className="py-3 px-1.5 text-center text-[10px] font-black text-purple-700">{fmtM(totalesPorMes[m.key])}</td>
                ))}
                <td></td>
              </tr>
            </tfoot>
          </table>
          <div className="mt-3 pt-3 border-t border-slate-100 flex justify-end">
            <p className="text-sm font-black text-slate-700">Total comprometido: <span className="text-purple-700">{fmt(totalGeneral)}</span></p>
          </div>
        </div>
      )}

      <ModalAcuerdo
        isOpen={modalOpen}
        onClose={() => { setModalOpen(false); setEditando(null); }}
        onSave={guardarAcuerdo}
        editando={editando}
        mesesVisibles={mesesVisibles}
      />
    </div>
  );
}
