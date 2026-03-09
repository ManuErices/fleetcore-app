import React, { useState, useEffect, useCallback } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { printThermalVoucher } from '../utils/voucherThermalGenerator';

/**
 * VoucherHistorialDia
 * Muestra todos los vouchers de entrega generados HOY por el repartidor logueado.
 * Permite reimprimir cualquiera de ellos.
 */
export default function VoucherHistorialDia({ isOpen, onClose, repartidorId, repartidorNombre, userRole = 'operador', projects = [], machines = [], empleados = [] }) {
  const [reportes, setReportes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [imprimiendoId, setImprimiendoId] = useState(null);

  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

  const cargar = useCallback(async () => {
    if (!repartidorId && !repartidorNombre) return;
    setLoading(true);
    try {
      // Query simple — filtramos por tipo en cliente para evitar índices compuestos
      const snap = await getDocs(
        query(
          collection(db, 'reportes_combustible'),
          where('tipo', '==', 'entrega')
        )
      );
      const hoy = today;
      const todos = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const esAdmin = userRole === 'administrador';
      const filtrados = todos.filter(r => {
        // Fecha en múltiples lugares posibles (datosControl se hace spread al nivel raíz)
        const fechaReporte = r.fecha
          || r.datosControl?.fecha
          || r.fechaCreacion?.split('T')[0]
          || '';
        if (fechaReporte !== hoy) return false;
        // Admin ve todos los del día
        if (esAdmin) return true;
        // Operador: filtrar por su repartidorId o nombre
        return (repartidorId && (
          r.repartidorId === repartidorId ||
          r.datosControl?.repartidorId === repartidorId ||
          r.creadoPor === repartidorId
        )) || (repartidorNombre && (
          r.repartidorNombre === repartidorNombre ||
          r.datosControl?.repartidorNombre === repartidorNombre
        ));
      });
      setReportes(filtrados);
    } catch (e) {
      console.error('Error cargando historial:', e);
      setReportes([]);
    }
    setLoading(false);
  }, [repartidorId, repartidorNombre, userRole, today]);

  useEffect(() => {
    if (isOpen) cargar();
  }, [isOpen, cargar]);

  const reimprimir = async (reporte) => {
    setImprimiendoId(reporte.id);
    try {
      const machineId = reporte.datosEntrega?.machineId;
      const operadorId = reporte.datosEntrega?.operadorId;
      const projectId = reporte.projectId || reporte.datosControl?.projectId;

      const machineInfo = machines.find(m => m.id === machineId) || {};
      const operadorInfo = empleados.find(e => e.id === operadorId) || {
        nombre: reporte.datosEntrega?.operadorExterno?.nombre || '',
        rut: reporte.datosEntrega?.operadorExterno?.rut || ''
      };
      const project = projects.find(p => p.id === projectId);
      const projectName = project?.nombre || project?.name || project?.codigo || projectId || '';
      const empresaInfo = { nombre: reporte.datosEntrega?.empresa || '' };
      const repartidorInfoObj = {
        nombre: reporte.repartidorNombre || repartidorNombre || '',
        rut: reporte.repartidorRut || ''
      };
      const equipoSurtidorInfo = reporte.datosControl?.equipoSurtidorId
        ? machines.find(m => m.id === reporte.datosControl.equipoSurtidorId)
        : null;

      printThermalVoucher({
        reportData: {
          fecha: reporte.datosControl?.fecha || reporte.fecha || today,
          cantidadLitros: reporte.datosEntrega?.cantidadLitros || 0,
          numeroReporte: reporte.numeroReporte || ''
        },
        projectName,
        machineInfo: {
          patente: machineInfo.patente || '',
          code: machineInfo.code || machineInfo.patente || '',
          type: machineInfo.type || '',
          nombre: machineInfo.name || machineInfo.nombre || ''
        },
        operadorInfo: {
          nombre: operadorInfo.nombre || '',
          rut: operadorInfo.rut || ''
        },
        empresaInfo,
        repartidorInfo: repartidorInfoObj,
        equipoSurtidorInfo: equipoSurtidorInfo ? {
          patente: equipoSurtidorInfo.patente || '',
          nombre: equipoSurtidorInfo.name || equipoSurtidorInfo.nombre || ''
        } : null,
        numeroGuiaCorrelativo: reporte.numeroGuia || null
      });
    } catch (e) {
      console.error('Error reimprimiendo:', e);
      alert('Error al reimprimir');
    }
    setImprimiendoId(null);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4">
      <div className="w-full sm:max-w-lg bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">

        {/* Header */}
        <div className="bg-gradient-to-r from-orange-500 to-amber-500 px-5 py-4 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-white font-black text-lg">🧾 Vouchers del Día</h2>
            <p className="text-orange-100 text-xs mt-0.5">
              {today} · {repartidorNombre || 'Repartidor'}
            </p>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white font-bold text-lg transition-all">×</button>
        </div>

        {/* Contador */}
        <div className="px-5 py-3 bg-orange-50 border-b border-orange-100 flex-shrink-0">
          <p className="text-sm font-semibold text-orange-700">
            {loading ? 'Cargando...' : `${reportes.length} entrega${reportes.length !== 1 ? 's' : ''} registrada${reportes.length !== 1 ? 's' : ''} hoy`}
          </p>
        </div>

        {/* Lista */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <div className="w-8 h-8 border-2 border-orange-200 border-t-orange-500 rounded-full animate-spin mb-3" />
              <span className="text-sm">Cargando vouchers...</span>
            </div>
          ) : reportes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mb-3">
                <svg className="w-8 h-8 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <p className="text-sm font-semibold text-slate-500">Sin entregas hoy</p>
              <p className="text-xs text-slate-400 mt-1">Los vouchers generados hoy aparecerán aquí</p>
            </div>
          ) : (
            reportes.map((r, idx) => {
              const machineId = r.datosEntrega?.machineId;
              const machine = machines.find(m => m.id === machineId);
              const operadorId = r.datosEntrega?.operadorId;
              const operador = empleados.find(e => e.id === operadorId);
              const operadorNombre = operador?.nombre || r.datosEntrega?.operadorExterno?.nombre || '—';
              const litros = r.datosEntrega?.cantidadLitros || 0;
              const empresa = r.datosEntrega?.empresa || '—';
              const hora = r.fechaCreacion
                ? new Date(r.fechaCreacion).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })
                : '—';
              const guia = r.numeroGuia ? `Guía #${String(r.numeroGuia).padStart(3,'0')}` : r.numeroReporte || `#${idx + 1}`;
              const imprimiendo = imprimiendoId === r.id;

              return (
                <div key={r.id} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between gap-3">
                    {/* Info principal */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs font-black text-orange-600 bg-orange-50 border border-orange-200 px-2 py-0.5 rounded-full">{guia}</span>
                        <span className="text-xs text-slate-400">{hora}</span>
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 text-sm">
                          <svg className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2v-4M9 21H5a2 2 0 01-2-2v-4m0 0h18"/>
                          </svg>
                          <span className="font-bold text-slate-800 truncate">{machine?.patente || machine?.code || '—'}</span>
                          {machine?.name && <span className="text-slate-400 text-xs truncate">{machine.name}</span>}
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <svg className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
                          </svg>
                          <span className="text-slate-600 truncate">{operadorNombre}</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <svg className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16"/>
                          </svg>
                          <span className="text-slate-500 text-xs truncate">{empresa}</span>
                        </div>
                      </div>
                    </div>

                    {/* Litros + botón reimprimir */}
                    <div className="flex flex-col items-end gap-2 flex-shrink-0">
                      <div className="text-right">
                        <div className="text-xl font-black text-green-600">{litros}</div>
                        <div className="text-[10px] text-slate-400 font-medium">LITROS</div>
                      </div>
                      <button
                        onClick={() => reimprimir(r)}
                        disabled={imprimiendo}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white text-xs font-bold rounded-lg transition-all shadow-sm"
                      >
                        {imprimiendo ? (
                          <div className="w-3.5 h-3.5 border border-white border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/>
                          </svg>
                        )}
                        Reimprimir
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        {reportes.length > 0 && (
          <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex-shrink-0">
            <div className="flex justify-between text-sm text-slate-500">
              <span>Total entregado hoy:</span>
              <span className="font-black text-green-600">
                {reportes.reduce((acc, r) => acc + (parseFloat(r.datosEntrega?.cantidadLitros) || 0), 0).toFixed(1)} Lts
              </span>
            </div>
          </div>
        )}

        {/* Botón cerrar */}
        <div className="px-5 py-4 flex-shrink-0">
          <button onClick={onClose} className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl transition-all">
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
