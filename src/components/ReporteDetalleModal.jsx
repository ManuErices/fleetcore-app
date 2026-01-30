import React from 'react';

export default function ReporteDetalleModal({ reporte, onClose, projectName, machineInfo }) {
  if (!reporte) return null;

  const calcularDuracion = (inicio, fin) => {
    if (!inicio || !fin) return '0h 0min';
    const [hInicio, mInicio] = inicio.split(':').map(Number);
    const [hFin, mFin] = fin.split(':').map(Number);
    const minutos = (hFin * 60 + mFin) - (hInicio * 60 + mInicio);
    const horas = Math.floor(minutos / 60);
    const mins = minutos % 60;
    return `${horas}h ${mins}min`;
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-gradient-to-br from-slate-50 to-slate-100 rounded-2xl shadow-2xl max-w-5xl w-full max-h-[95vh] overflow-hidden my-8">
        
        {/* Header con gradiente teal */}
        <div className="bg-gradient-to-r from-teal-600 via-cyan-600 to-teal-600 text-white p-6 sticky top-0 z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div>
                <h2 className="text-3xl font-black">Reporte #{reporte.numeroReporte}</h2>
                <p className="text-teal-100 text-sm mt-1">Reporte Detallado - WorkFleet</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-12 h-12 rounded-xl hover:bg-white/20 flex items-center justify-center transition-colors"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Contenido scrolleable */}
        <div className="p-6 overflow-y-auto max-h-[calc(95vh-140px)] space-y-6">
          
          {/* Información General */}
          <div className="bg-white rounded-2xl shadow-lg p-6 border-l-4 border-teal-500">
            <h3 className="text-lg font-black text-slate-900 mb-4 flex items-center gap-2">
              <svg className="w-5 h-5 text-teal-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Información General
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <DataField label="Fecha" value={reporte.fecha} icon="📅" />
              <DataField label="Obra" value={projectName || reporte.projectId} icon="🏗️" />
              <DataField label="Estado Máquina" value={reporte.estadoMaquina} icon="⚙️" badge />
            </div>
          </div>

          {/* Operador */}
          <div className="bg-white rounded-2xl shadow-lg p-6 border-l-4 border-cyan-500">
            <h3 className="text-lg font-black text-slate-900 mb-4 flex items-center gap-2">
              <svg className="w-5 h-5 text-cyan-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              Operador
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <DataField label="Nombre" value={reporte.operador} icon="👤" />
              <DataField label="RUT" value={reporte.rut} icon="🆔" />
            </div>
          </div>

          {/* Máquina */}
          <div className="bg-white rounded-2xl shadow-lg p-6 border-l-4 border-emerald-500">
            <h3 className="text-lg font-black text-slate-900 mb-4 flex items-center gap-2">
              <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
              </svg>
              Máquina
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <DataField label="Patente" value={machineInfo?.patente || '-'} icon="🚗" />
              <DataField label="Código" value={machineInfo?.code || '-'} icon="🔢" />
              <DataField label="Nombre" value={machineInfo?.name || '-'} icon="🏷️" />
            </div>
          </div>

          {/* Métricas */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Horómetro */}
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl shadow-lg p-6 border-2 border-blue-200">
              <h3 className="text-lg font-black text-slate-900 mb-4 flex items-center gap-2">
                <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Horómetro
              </h3>
              <div className="space-y-3">
                <MetricRow label="Inicial" value={reporte.horometroInicial || '0'} />
                <MetricRow label="Final" value={reporte.horometroFinal || '0'} />
                <div className="pt-3 border-t-2 border-blue-300">
                  <MetricRow 
                    label="Trabajadas" 
                    value={`${((parseFloat(reporte.horometroFinal) || 0) - (parseFloat(reporte.horometroInicial) || 0)).toFixed(2)} hrs`}
                    highlight
                  />
                </div>
              </div>
            </div>

            {/* Kilometraje */}
            <div className="bg-gradient-to-br from-violet-50 to-purple-50 rounded-2xl shadow-lg p-6 border-2 border-violet-200">
              <h3 className="text-lg font-black text-slate-900 mb-4 flex items-center gap-2">
                <svg className="w-5 h-5 text-violet-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Kilometraje
              </h3>
              <div className="space-y-3">
                <MetricRow label="Inicial" value={reporte.kilometrajeInicial || '0'} />
                <MetricRow label="Final" value={reporte.kilometrajeFinal || '0'} />
                <div className="pt-3 border-t-2 border-violet-300">
                  <MetricRow 
                    label="Recorridos" 
                    value={`${((parseFloat(reporte.kilometrajeFinal) || 0) - (parseFloat(reporte.kilometrajeInicial) || 0)).toFixed(2)} km`}
                    highlight
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Combustible */}
          <div className="bg-gradient-to-br from-orange-50 to-red-50 rounded-2xl shadow-lg p-6 border-2 border-orange-200">
            <h3 className="text-lg font-black text-slate-900 mb-4 flex items-center gap-2">
              <svg className="w-5 h-5 text-orange-600" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M12.395 2.553a1 1 0 00-1.45-.385c-.345.23-.614.558-.822.88-.214.33-.403.713-.57 1.116-.334.804-.614 1.768-.84 2.734a31.365 31.365 0 00-.613 3.58 2.64 2.64 0 01-.945-1.067c-.328-.68-.398-1.534-.398-2.654A1 1 0 005.05 6.05 6.981 6.981 0 003 11a7 7 0 1011.95-4.95c-.592-.591-.98-.985-1.348-1.467-.363-.476-.724-1.063-1.207-2.03zM12.12 15.12A3 3 0 017 13s.879.5 2.5.5c0-1 .5-4 1.25-4.5.5 1 .786 1.293 1.371 1.879A2.99 2.99 0 0113 13a2.99 2.99 0 01-.879 2.121z" clipRule="evenodd" />
              </svg>
              Combustible
            </h3>
            <div className="text-center py-4">
              <div className="text-5xl font-black text-orange-600">{reporte.cargaCombustible || '0'}</div>
              <div className="text-sm text-slate-600 mt-2">Litros cargados</div>
            </div>
          </div>

          {/* Actividades Efectivas */}
          {reporte.actividadesEfectivas && reporte.actividadesEfectivas.length > 0 && (
            <div className="bg-white rounded-2xl shadow-lg p-6 border-l-4 border-green-500">
              <h3 className="text-lg font-black text-slate-900 mb-4 flex items-center gap-2">
                <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Actividades Efectivas
              </h3>
              <div className="space-y-3">
                {reporte.actividadesEfectivas.map((act, idx) => (
                  <div key={idx} className="bg-green-50 rounded-xl p-4 border border-green-200">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-bold text-green-900">{act.actividad}</span>
                      <span className="text-sm px-2 py-1 bg-green-200 text-green-700 rounded-full font-semibold">
                        {calcularDuracion(act.horaInicio, act.horaFin)}
                      </span>
                    </div>
                    <div className="flex gap-4 text-sm text-slate-600">
                      <span>⏰ Inicio: <strong>{act.horaInicio}</strong></span>
                      <span>⏰ Fin: <strong>{act.horaFin}</strong></span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tiempos No Efectivos */}
          {reporte.tiemposNoEfectivos && reporte.tiemposNoEfectivos.length > 0 && (
            <div className="bg-white rounded-2xl shadow-lg p-6 border-l-4 border-yellow-500">
              <h3 className="text-lg font-black text-slate-900 mb-4 flex items-center gap-2">
                <svg className="w-5 h-5 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Tiempos No Efectivos
              </h3>
              <div className="space-y-3">
                {reporte.tiemposNoEfectivos.map((tiempo, idx) => (
                  <div key={idx} className="bg-yellow-50 rounded-xl p-4 border border-yellow-200">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-bold text-yellow-900">{tiempo.motivo}</span>
                      <span className="text-sm px-2 py-1 bg-yellow-200 text-yellow-700 rounded-full font-semibold">
                        {calcularDuracion(tiempo.horaInicio, tiempo.horaFin)}
                      </span>
                    </div>
                    <div className="flex gap-4 text-sm text-slate-600">
                      <span>⏰ Inicio: <strong>{tiempo.horaInicio}</strong></span>
                      <span>⏰ Fin: <strong>{tiempo.horaFin}</strong></span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tiempos Programados */}
          {reporte.tiemposProgramados && (
            <div className="bg-white rounded-2xl shadow-lg p-6 border-l-4 border-indigo-500">
              <h3 className="text-lg font-black text-slate-900 mb-4 flex items-center gap-2">
                <svg className="w-5 h-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                Tiempos Programados
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {reporte.tiemposProgramados.charlaSegurid && (
                  <TiempoProgramadoCard 
                    titulo="Charla de Seguridad"
                    inicio={reporte.tiemposProgramados.charlaSegurid.horaInicio}
                    fin={reporte.tiemposProgramados.charlaSegurid.horaFin}
                    color="blue"
                  />
                )}
                {reporte.tiemposProgramados.inspeccionEquipo && (
                  <TiempoProgramadoCard 
                    titulo="Inspección de Equipo"
                    inicio={reporte.tiemposProgramados.inspeccionEquipo.horaInicio}
                    fin={reporte.tiemposProgramados.inspeccionEquipo.horaFin}
                    color="purple"
                  />
                )}
                {reporte.tiemposProgramados.colacion && (
                  <TiempoProgramadoCard 
                    titulo="Colación"
                    inicio={reporte.tiemposProgramados.colacion.horaInicio}
                    fin={reporte.tiemposProgramados.colacion.horaFin}
                    color="pink"
                  />
                )}
              </div>
            </div>
          )}

          {/* Mantenciones */}
          {reporte.mantenciones && reporte.mantenciones.length > 0 && (
            <div className="bg-white rounded-2xl shadow-lg p-6 border-l-4 border-red-500">
              <h3 className="text-lg font-black text-slate-900 mb-4 flex items-center gap-2">
                <svg className="w-5 h-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Mantenciones
              </h3>
              <div className="space-y-3">
                {reporte.mantenciones.map((mant, idx) => (
                  <div key={idx} className="bg-red-50 rounded-xl p-4 border border-red-200">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-bold text-red-900">{mant.descripcion}</span>
                      <span className="text-sm px-2 py-1 bg-red-200 text-red-700 rounded-full font-semibold">
                        {calcularDuracion(mant.horaInicio, mant.horaFin)}
                      </span>
                    </div>
                    <div className="flex gap-4 text-sm text-slate-600">
                      <span>⏰ Inicio: <strong>{mant.horaInicio}</strong></span>
                      <span>⏰ Fin: <strong>{mant.horaFin}</strong></span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Observaciones */}
          {reporte.observaciones && (
            <div className="bg-white rounded-2xl shadow-lg p-6 border-l-4 border-slate-500">
              <h3 className="text-lg font-black text-slate-900 mb-4 flex items-center gap-2">
                <svg className="w-5 h-5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                </svg>
                Observaciones
              </h3>
              <p className="text-slate-700 bg-slate-50 p-4 rounded-xl">{reporte.observaciones}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t-2 border-slate-200 p-6 bg-slate-50 sticky bottom-0">
          <button
            onClick={onClose}
            className="w-full px-6 py-3 bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 text-white font-bold rounded-xl transition-all shadow-lg hover:shadow-xl"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

// Componentes auxiliares
function DataField({ label, value, icon, badge }) {
  return (
    <div>
      <div className="text-xs font-semibold text-slate-500 mb-1">{label}</div>
      <div className="flex items-center gap-2">
        <span className="text-lg">{icon}</span>
        {badge ? (
          <span className={`px-3 py-1 rounded-full text-sm font-bold ${
            value === 'operativa' ? 'bg-green-100 text-green-700' :
            value === 'mantencion' ? 'bg-yellow-100 text-yellow-700' :
            value === 'reparacion' ? 'bg-orange-100 text-orange-700' :
            'bg-red-100 text-red-700'
          }`}>
            {value}
          </span>
        ) : (
          <span className="text-sm font-bold text-slate-900">{value || '-'}</span>
        )}
      </div>
    </div>
  );
}

function MetricRow({ label, value, highlight }) {
  return (
    <div className="flex justify-between items-center">
      <span className={`text-sm ${highlight ? 'font-bold text-slate-900' : 'text-slate-600'}`}>{label}</span>
      <span className={`text-lg font-black ${highlight ? 'text-green-600' : 'text-slate-900'}`}>{value}</span>
    </div>
  );
}

function TiempoProgramadoCard({ titulo, inicio, fin, color }) {
  const colors = {
    blue: 'bg-blue-50 border-blue-200 text-blue-900',
    purple: 'bg-purple-50 border-purple-200 text-purple-900',
    pink: 'bg-pink-50 border-pink-200 text-pink-900'
  };

  return (
    <div className={`${colors[color]} rounded-xl p-4 border-2`}>
      <div className="font-bold text-sm mb-2">{titulo}</div>
      <div className="text-xs space-y-1">
        <div>Inicio: <strong>{inicio}</strong></div>
        <div>Fin: <strong>{fin}</strong></div>
      </div>
    </div>
  );
}
