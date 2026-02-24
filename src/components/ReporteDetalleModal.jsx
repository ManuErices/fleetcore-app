import React, { useState } from 'react';

export default function ReporteDetalleModal({ 
  reporte, 
  onClose, 
  projectName, 
  machineInfo, 
  userRole = 'operador',
  currentUserName = '',
  onSave,
  onSign
}) {
  if (!reporte) return null;

  const isAdmin = userRole === 'administrador';
  const [isEditing, setIsEditing] = useState(false);
  const [editedData, setEditedData] = useState({ ...reporte });
  const [showSignModal, setShowSignModal] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');

  const calcularDuracion = (inicio, fin) => {
    if (!inicio || !fin) return '0h 0min';
    const [hInicio, mInicio] = inicio.split(':').map(Number);
    const [hFin, mFin] = fin.split(':').map(Number);
    const minutos = (hFin * 60 + mFin) - (hInicio * 60 + mInicio);
    const horas = Math.floor(minutos / 60);
    const mins = minutos % 60;
    return `${horas}h ${mins}min`;
  };

  // Función para convertir hora "HH:MM" a minutos desde medianoche
  const horaAMinutos = (hora) => {
    if (!hora) return 0;
    const [h, m] = hora.split(':').map(Number);
    return h * 60 + m;
  };

  // Consolidar todas las actividades y tiempos en un solo array
  const consolidarActividades = (data = editedData) => {
    const todasLasActividades = [];

    // Agregar actividades efectivas (verde)
    if (data.actividadesEfectivas && data.actividadesEfectivas.length > 0) {
      data.actividadesEfectivas.forEach((act, index) => {
        todasLasActividades.push({
          tipo: 'Actividad Efectiva',
          titulo: act.actividad,
          horaInicio: act.horaInicio,
          horaFin: act.horaFin,
          color: 'green',
          bgColor: 'bg-green-50',
          borderColor: 'border-green-200',
          textColor: 'text-green-900',
          badgeColor: 'bg-green-200 text-green-700',
          categoria: 'actividadesEfectivas',
          index
        });
      });
    }

    // Agregar tiempos no efectivos (amarillo)
    if (data.tiemposNoEfectivos && data.tiemposNoEfectivos.length > 0) {
      data.tiemposNoEfectivos.forEach((tiempo, index) => {
        todasLasActividades.push({
          tipo: 'Tiempo No Efectivo',
          titulo: tiempo.motivo,
          horaInicio: tiempo.horaInicio,
          horaFin: tiempo.horaFin,
          color: 'yellow',
          bgColor: 'bg-yellow-50',
          borderColor: 'border-yellow-200',
          textColor: 'text-yellow-900',
          badgeColor: 'bg-yellow-200 text-yellow-700',
          categoria: 'tiemposNoEfectivos',
          index
        });
      });
    }

    // Agregar tiempos programados
    if (data.tiemposProgramados) {
      // Charla de Seguridad (azul)
      if (data.tiemposProgramados.charlaSegurid) {
        todasLasActividades.push({
          tipo: 'Tiempo Programado',
          titulo: 'Charla de Seguridad',
          horaInicio: data.tiemposProgramados.charlaSegurid.horaInicio,
          horaFin: data.tiemposProgramados.charlaSegurid.horaFin,
          color: 'blue',
          bgColor: 'bg-blue-50',
          borderColor: 'border-blue-200',
          textColor: 'text-blue-900',
          badgeColor: 'bg-blue-200 text-blue-700',
          categoria: 'tiemposProgramados',
          subcategoria: 'charlaSegurid'
        });
      }

      // Inspección de Equipo (morado)
      if (data.tiemposProgramados.inspeccionEquipo) {
        todasLasActividades.push({
          tipo: 'Tiempo Programado',
          titulo: 'Inspección de Equipo',
          horaInicio: data.tiemposProgramados.inspeccionEquipo.horaInicio,
          horaFin: data.tiemposProgramados.inspeccionEquipo.horaFin,
          color: 'purple',
          bgColor: 'bg-purple-50',
          borderColor: 'border-purple-200',
          textColor: 'text-purple-900',
          badgeColor: 'bg-purple-200 text-purple-700',
          categoria: 'tiemposProgramados',
          subcategoria: 'inspeccionEquipo'
        });
      }

      // Colación (rosa)
      if (data.tiemposProgramados.colacion) {
        todasLasActividades.push({
          tipo: 'Tiempo Programado',
          titulo: 'Colación',
          horaInicio: data.tiemposProgramados.colacion.horaInicio,
          horaFin: data.tiemposProgramados.colacion.horaFin,
          color: 'pink',
          bgColor: 'bg-pink-50',
          borderColor: 'border-pink-200',
          textColor: 'text-pink-900',
          badgeColor: 'bg-pink-200 text-pink-700',
          categoria: 'tiemposProgramados',
          subcategoria: 'colacion'
        });
      }
    }

    // Agregar mantenciones (rojo)
    if (data.mantenciones && data.mantenciones.length > 0) {
      data.mantenciones.forEach((mant, index) => {
        todasLasActividades.push({
          tipo: 'Mantención',
          titulo: mant.descripcion,
          horaInicio: mant.horaInicio,
          horaFin: mant.horaFin,
          color: 'red',
          bgColor: 'bg-red-50',
          borderColor: 'border-red-200',
          textColor: 'text-red-900',
          badgeColor: 'bg-red-200 text-red-700',
          categoria: 'mantenciones',
          index
        });
      });
    }

    // Ordenar por hora de inicio
    return todasLasActividades.sort((a, b) => 
      horaAMinutos(a.horaInicio) - horaAMinutos(b.horaInicio)
    );
  };

  const actividadesOrdenadas = consolidarActividades();

  const handleSaveChanges = () => {
    if (onSave) {
      onSave(editedData);
    }
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setEditedData({ ...reporte });
    setIsEditing(false);
  };

  const handleSignReport = () => {
    if (onSign && adminPassword) {
      const signatureData = {
        adminName: currentUserName,
        timestamp: new Date().toISOString(),
        reportId: reporte.numeroReporte
      };
      onSign(signatureData, adminPassword);
      setShowSignModal(false);
      setAdminPassword('');
    }
  };

  const updateField = (field, value) => {
    setEditedData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const updateNestedField = (category, subcategory, field, value) => {
    setEditedData(prev => ({
      ...prev,
      [category]: {
        ...prev[category],
        [subcategory]: {
          ...prev[category][subcategory],
          [field]: value
        }
      }
    }));
  };

  const updateArrayField = (category, index, field, value) => {
    setEditedData(prev => ({
      ...prev,
      [category]: prev[category].map((item, idx) => 
        idx === index ? { ...item, [field]: value } : item
      )
    }));
  };

  const addActivity = (category) => {
    const newItem = category === 'actividadesEfectivas' 
      ? { actividad: '', horaInicio: '', horaFin: '' }
      : category === 'tiemposNoEfectivos'
      ? { motivo: '', horaInicio: '', horaFin: '' }
      : { descripcion: '', horaInicio: '', horaFin: '' };

    setEditedData(prev => ({
      ...prev,
      [category]: [...(prev[category] || []), newItem]
    }));
  };

  const removeActivity = (category, index) => {
    setEditedData(prev => ({
      ...prev,
      [category]: prev[category].filter((_, idx) => idx !== index)
    }));
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-gradient-to-br from-slate-50 to-slate-100 rounded-2xl shadow-2xl max-w-5xl w-full max-h-[95vh] overflow-hidden my-8">
        
        {/* Header con gradiente teal */}
        <div className="bg-gradient-to-r from-teal-600 via-cyan-600 to-teal-600 text-white p-6 sticky top-0 z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-white flex items-center justify-center p-2">
                <img 
                  src="/Logo_MPF_Morado.png" 
                  alt="MPF Ingeniería Civil" 
                  className="w-full h-full object-contain"
                />
              </div>
              <div>
                <h2 className="text-3xl font-black">Reporte #{reporte.numeroReporte}</h2>
                <div className="flex items-center gap-3 mt-1">
                  <p className="text-teal-100 text-sm">Reporte Detallado - WorkFleet</p>
                  {reporte.firmado && (
                    <span className="px-3 py-1 bg-green-500 text-white text-xs font-bold rounded-full flex items-center gap-1">
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      Firmado
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right mr-4">
                <div className="text-teal-100 text-sm">{projectName || reporte.projectId}</div>
                <div className="text-white font-bold text-base mt-1">{reporte.fecha}</div>
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
        </div>

        {/* Contenido scrolleable */}
        <div className="p-6 pb-24 overflow-y-auto max-h-[calc(95vh-140px)] space-y-6">
          
          {/* Operador y Máquina lado a lado (NO EDITABLES) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Operador */}
            <div className="bg-white rounded-2xl shadow-lg p-6 border-l-4 border-cyan-500">
              <h3 className="text-lg font-black text-slate-900 mb-4 flex items-center gap-2">
                <svg className="w-5 h-5 text-cyan-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                Operador
                {isAdmin && <span className="text-xs text-slate-400 font-normal">(No editable)</span>}
              </h3>
              <div className="space-y-3">
                <DataField label="Nombre" value={reporte.operador} />
                <DataField label="RUT" value={reporte.rut} />
              </div>
            </div>

            {/* Máquina */}
            <div className="bg-white rounded-2xl shadow-lg p-6 border-l-4 border-emerald-500">
              <h3 className="text-lg font-black text-slate-900 mb-4 flex items-center gap-2">
                <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                </svg>
                Máquina
                {isAdmin && <span className="text-xs text-slate-400 font-normal">(No editable)</span>}
              </h3>
              <div className="space-y-3">
                <DataField label="Patente" value={machineInfo?.patente || '-'} />
                <DataField label="Código" value={machineInfo?.code || '-'} />
                <DataField label="Nombre" value={machineInfo?.name || '-'} />
              </div>
            </div>
          </div>

          {/* Métricas */}
          <div className={`grid grid-cols-1 ${machineInfo?.type && (machineInfo.type.toUpperCase().includes('CAMION') || machineInfo.type.toUpperCase().includes('CAMIONETA')) ? 'md:grid-cols-2' : 'md:grid-cols-2'} gap-6`}>
            
            {/* Horómetro */}
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl shadow-lg p-6 border-2 border-blue-200">
              <h3 className="text-lg font-black text-slate-900 mb-4 flex items-center gap-2">
                <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Horómetro
              </h3>
              <div className="space-y-3">
                {isEditing ? (
                  <>
                    <EditableMetricRow 
                      label="Inicial" 
                      value={editedData.horometroInicial || '0'}
                      onChange={(v) => updateField('horometroInicial', v)}
                    />
                    <EditableMetricRow 
                      label="Final" 
                      value={editedData.horometroFinal || '0'}
                      onChange={(v) => updateField('horometroFinal', v)}
                    />
                  </>
                ) : (
                  <>
                    <MetricRow label="Inicial" value={editedData.horometroInicial || '0'} />
                    <MetricRow label="Final" value={editedData.horometroFinal || '0'} />
                  </>
                )}
                <div className="pt-3 border-t-2 border-blue-300 space-y-2">
                  <MetricRow 
                    label="Trabajadas" 
                    value={`${((parseFloat(editedData.horometroFinal) || 0) - (parseFloat(editedData.horometroInicial) || 0)).toFixed(2)} hrs`}
                    highlight
                  />
                  <MetricRow 
                    label="Standby" 
                    value={`${(6 - ((parseFloat(editedData.horometroFinal) || 0) - (parseFloat(editedData.horometroInicial) || 0))).toFixed(2)} hrs`}
                    highlightColor="text-amber-600"
                  />
                </div>
              </div>
            </div>

            {/* Kilometraje - Solo mostrar si el tipo es CAMION o CAMIONETA */}
            {machineInfo?.type && (machineInfo.type.toUpperCase().includes('CAMION') || machineInfo.type.toUpperCase().includes('CAMIONETA')) ? (
              <div className="bg-gradient-to-br from-violet-50 to-purple-50 rounded-2xl shadow-lg p-6 border-2 border-violet-200">
                <h3 className="text-lg font-black text-slate-900 mb-4 flex items-center gap-2">
                  <svg className="w-5 h-5 text-violet-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  Kilometraje
                </h3>
                <div className="space-y-3">
                  {isEditing ? (
                    <>
                      <EditableMetricRow 
                        label="Inicial" 
                        value={editedData.kilometrajeInicial || '0'}
                        onChange={(v) => updateField('kilometrajeInicial', v)}
                      />
                      <EditableMetricRow 
                        label="Final" 
                        value={editedData.kilometrajeFinal || '0'}
                        onChange={(v) => updateField('kilometrajeFinal', v)}
                      />
                    </>
                  ) : (
                    <>
                      <MetricRow label="Inicial" value={editedData.kilometrajeInicial || '0'} />
                      <MetricRow label="Final" value={editedData.kilometrajeFinal || '0'} />
                    </>
                  )}
                  <div className="pt-3 border-t-2 border-violet-300">
                    <MetricRow 
                      label="Recorridos" 
                      value={`${((parseFloat(editedData.kilometrajeFinal) || 0) - (parseFloat(editedData.kilometrajeInicial) || 0)).toFixed(2)} km`}
                      highlight
                    />
                  </div>
                </div>
              </div>
            ) : (
              /* Combustible - Mostrar aquí cuando NO hay Kilometraje */
              <div className="bg-gradient-to-br from-orange-50 to-red-50 rounded-2xl shadow-lg p-6 border-2 border-orange-200">
                <h3 className="text-lg font-black text-slate-900 mb-4 flex items-center gap-2">
                  <svg className="w-5 h-5 text-orange-600" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M12.395 2.553a1 1 0 00-1.45-.385c-.345.23-.614.558-.822.88-.214.33-.403.713-.57 1.116-.334.804-.614 1.768-.84 2.734a31.365 31.365 0 00-.613 3.58 2.64 2.64 0 01-.945-1.067c-.328-.68-.398-1.534-.398-2.654A1 1 0 005.05 6.05 6.981 6.981 0 003 11a7 7 0 1011.95-4.95c-.592-.591-.98-.985-1.348-1.467-.363-.476-.724-1.063-1.207-2.03zM12.12 15.12A3 3 0 017 13s.879.5 2.5.5c0-1 .5-4 1.25-4.5.5 1 .786 1.293 1.371 1.879A2.99 2.99 0 0113 13a2.99 2.99 0 01-.879 2.121z" clipRule="evenodd" />
                  </svg>
                  Combustible
                </h3>
                <div className="text-center py-4">
                  {isEditing ? (
                    <input
                      type="number"
                      value={editedData.cargaCombustible || '0'}
                      onChange={(e) => updateField('cargaCombustible', e.target.value)}
                      className="text-5xl font-black text-orange-600 bg-transparent border-b-2 border-orange-300 text-center w-32 focus:outline-none focus:border-orange-500"
                    />
                  ) : (
                    <div className="text-5xl font-black text-orange-600">{editedData.cargaCombustible || '0'}</div>
                  )}
                  <div className="text-sm text-slate-600 mt-2">Litros cargados</div>
                </div>
              </div>
            )}
          </div>

          {/* Combustible - Solo mostrar aquí cuando HAY Kilometraje (para CAMION/CAMIONETA) */}
          {machineInfo?.type && (machineInfo.type.toUpperCase().includes('CAMION') || machineInfo.type.toUpperCase().includes('CAMIONETA')) && (
            <div className="bg-gradient-to-br from-orange-50 to-red-50 rounded-2xl shadow-lg p-6 border-2 border-orange-200">
              <h3 className="text-lg font-black text-slate-900 mb-4 flex items-center gap-2">
                <svg className="w-5 h-5 text-orange-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M12.395 2.553a1 1 0 00-1.45-.385c-.345.23-.614.558-.822.88-.214.33-.403.713-.57 1.116-.334.804-.614 1.768-.84 2.734a31.365 31.365 0 00-.613 3.58 2.64 2.64 0 01-.945-1.067c-.328-.68-.398-1.534-.398-2.654A1 1 0 005.05 6.05 6.981 6.981 0 003 11a7 7 0 1011.95-4.95c-.592-.591-.98-.985-1.348-1.467-.363-.476-.724-1.063-1.207-2.03zM12.12 15.12A3 3 0 017 13s.879.5 2.5.5c0-1 .5-4 1.25-4.5.5 1 .786 1.293 1.371 1.879A2.99 2.99 0 0113 13a2.99 2.99 0 01-.879 2.121z" clipRule="evenodd" />
                </svg>
                Combustible
              </h3>
              <div className="text-center py-4">
                {isEditing ? (
                  <input
                    type="number"
                    value={editedData.cargaCombustible || '0'}
                    onChange={(e) => updateField('cargaCombustible', e.target.value)}
                    className="text-5xl font-black text-orange-600 bg-transparent border-b-2 border-orange-300 text-center w-32 focus:outline-none focus:border-orange-500"
                  />
                ) : (
                  <div className="text-5xl font-black text-orange-600">{editedData.cargaCombustible || '0'}</div>
                )}
                <div className="text-sm text-slate-600 mt-2">Litros cargados</div>
              </div>
            </div>
          )}

          {/* Actividades y Tiempos Ordenados Cronológicamente */}
          {actividadesOrdenadas.length > 0 && (
            <div className="bg-white rounded-2xl shadow-lg p-6 border-l-4 border-indigo-500">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                  <svg className="w-5 h-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Actividades y Tiempos (Ordenadas Cronológicamente)
                </h3>
                {isEditing && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => addActivity('actividadesEfectivas')}
                      className="px-3 py-1 bg-green-500 hover:bg-green-600 text-white text-xs font-bold rounded-lg transition-colors"
                    >
                      + Actividad
                    </button>
                    <button
                      onClick={() => addActivity('tiemposNoEfectivos')}
                      className="px-3 py-1 bg-yellow-500 hover:bg-yellow-600 text-white text-xs font-bold rounded-lg transition-colors"
                    >
                      + Tiempo No Efectivo
                    </button>
                    <button
                      onClick={() => addActivity('mantenciones')}
                      className="px-3 py-1 bg-red-500 hover:bg-red-600 text-white text-xs font-bold rounded-lg transition-colors"
                    >
                      + Mantención
                    </button>
                  </div>
                )}
              </div>
              <div className="space-y-3">
                {consolidarActividades(editedData).map((actividad, idx) => (
                  <div key={idx} className={`${actividad.bgColor} rounded-xl p-4 border ${actividad.borderColor} relative`}>
                    <div className="absolute top-2 right-2 flex items-center gap-2">
                      <span className="text-xs text-slate-500 font-medium bg-white/70 px-2 py-1 rounded">
                        {actividad.tipo}
                      </span>
                      {isEditing && actividad.categoria !== 'tiemposProgramados' && (
                        <button
                          onClick={() => removeActivity(actividad.categoria, actividad.index)}
                          className="w-6 h-6 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center transition-colors"
                        >
                          ×
                        </button>
                      )}
                    </div>
                    {isEditing ? (
                      <div className="pr-32 space-y-2">
                        <input
                          type="text"
                          value={actividad.titulo}
                          onChange={(e) => {
                            if (actividad.categoria === 'actividadesEfectivas') {
                              updateArrayField(actividad.categoria, actividad.index, 'actividad', e.target.value);
                            } else if (actividad.categoria === 'tiemposNoEfectivos') {
                              updateArrayField(actividad.categoria, actividad.index, 'motivo', e.target.value);
                            } else if (actividad.categoria === 'mantenciones') {
                              updateArrayField(actividad.categoria, actividad.index, 'descripcion', e.target.value);
                            }
                          }}
                          disabled={actividad.categoria === 'tiemposProgramados'}
                          className={`font-bold ${actividad.textColor} bg-transparent border-b border-slate-300 w-full focus:outline-none focus:border-slate-500 ${actividad.categoria === 'tiemposProgramados' ? 'cursor-not-allowed' : ''}`}
                        />
                      </div>
                    ) : (
                      <div className="pr-32">
                        <div className={`font-bold ${actividad.textColor} mb-2`}>{actividad.titulo}</div>
                      </div>
                    )}
                    <div className="flex items-center justify-between gap-4 mt-2">
                      <div className="flex gap-4 text-sm text-slate-600">
                        {isEditing ? (
                          <>
                            <div className="flex items-center gap-1">
                              <span>Inicio:</span>
                              <input
                                type="time"
                                value={actividad.horaInicio}
                                onChange={(e) => {
                                  if (actividad.categoria === 'tiemposProgramados') {
                                    updateNestedField(actividad.categoria, actividad.subcategoria, 'horaInicio', e.target.value);
                                  } else {
                                    updateArrayField(actividad.categoria, actividad.index, 'horaInicio', e.target.value);
                                  }
                                }}
                                className="border border-slate-300 rounded px-2 py-1 text-xs focus:outline-none focus:border-slate-500"
                              />
                            </div>
                            <div className="flex items-center gap-1">
                              <span>Fin:</span>
                              <input
                                type="time"
                                value={actividad.horaFin}
                                onChange={(e) => {
                                  if (actividad.categoria === 'tiemposProgramados') {
                                    updateNestedField(actividad.categoria, actividad.subcategoria, 'horaFin', e.target.value);
                                  } else {
                                    updateArrayField(actividad.categoria, actividad.index, 'horaFin', e.target.value);
                                  }
                                }}
                                className="border border-slate-300 rounded px-2 py-1 text-xs focus:outline-none focus:border-slate-500"
                              />
                            </div>
                          </>
                        ) : (
                          <>
                            <span>Inicio: <strong>{actividad.horaInicio}</strong></span>
                            <span>Fin: <strong>{actividad.horaFin}</strong></span>
                          </>
                        )}
                      </div>
                      <span className={`text-sm px-3 py-1 ${actividad.badgeColor} rounded-full font-semibold whitespace-nowrap`}>
                        {calcularDuracion(actividad.horaInicio, actividad.horaFin)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Observaciones */}
          <div className="bg-white rounded-2xl shadow-lg p-6 border-l-4 border-slate-500">
            <h3 className="text-lg font-black text-slate-900 mb-4 flex items-center gap-2">
              <svg className="w-5 h-5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
              </svg>
              Observaciones
            </h3>
            {isEditing ? (
              <textarea
                value={editedData.observaciones || ''}
                onChange={(e) => updateField('observaciones', e.target.value)}
                className="w-full text-slate-700 bg-slate-50 p-4 rounded-xl border border-slate-300 focus:outline-none focus:border-slate-500 min-h-[100px]"
                placeholder="Ingrese observaciones..."
              />
            ) : (
              <p className="text-slate-700 bg-slate-50 p-4 rounded-xl">{editedData.observaciones || 'Sin observaciones'}</p>
            )}
          </div>

          {/* Firma del Administrador */}
          {reporte.firmado && (
            <div className="bg-white rounded-2xl shadow-2xl p-8 border-2 border-emerald-200 relative overflow-hidden">
              {/* Marca de agua de fondo */}
              <div className="absolute top-0 right-0 w-64 h-64 opacity-5">
                <svg viewBox="0 0 24 24" fill="currentColor" className="w-full h-full text-emerald-600">
                  <path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              </div>

              {/* Encabezado */}
              <div className="flex items-start justify-between mb-6">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg">
                      <svg className="w-7 h-7 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="text-2xl font-black text-slate-900 tracking-tight">Validación Administrativa</h3>
                      <p className="text-sm text-emerald-600 font-semibold">Firma Electrónica Avanzada</p>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <span className="px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-600 text-white text-sm font-black rounded-full shadow-lg flex items-center gap-2">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    DOCUMENTO VALIDADO
                  </span>
                  <span className="text-xs text-slate-500 font-mono">ID: {reporte.numeroReporte}</span>
                </div>
              </div>

              {/* Línea divisoria decorativa */}
              <div className="h-px bg-gradient-to-r from-transparent via-emerald-300 to-transparent mb-6"></div>

              {/* Información de la Firma */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                {/* Firmante */}
                <div className="bg-gradient-to-br from-slate-50 to-slate-100 rounded-xl p-5 border border-slate-200">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center flex-shrink-0 shadow-md">
                      <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Firmante Autorizado</p>
                      <p className="text-lg font-black text-slate-900 truncate">{reporte.firmaAdmin?.nombre}</p>
                      <p className="text-xs text-slate-600 font-medium mt-1">Administrador de Sistema</p>
                    </div>
                  </div>
                </div>

                {/* Fecha y Hora */}
                <div className="bg-gradient-to-br from-slate-50 to-slate-100 rounded-xl p-5 border border-slate-200">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center flex-shrink-0 shadow-md">
                      <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Fecha y Hora de Firma</p>
                      <p className="text-lg font-black text-slate-900">
                        {new Date(reporte.firmaAdmin?.timestamp).toLocaleDateString('es-CL', {
                          day: '2-digit',
                          month: 'long',
                          year: 'numeric'
                        })}
                      </p>
                      <p className="text-xs text-slate-600 font-medium mt-1">
                        {new Date(reporte.firmaAdmin?.timestamp).toLocaleTimeString('es-CL', {
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit'
                        })} CLT
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Hash/ID de verificación */}
              <div className="bg-gradient-to-r from-emerald-50 via-teal-50 to-cyan-50 rounded-xl p-5 border-2 border-emerald-200">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center flex-shrink-0 shadow-md">
                    <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-emerald-700 uppercase tracking-wider mb-2">Código de Verificación Digital</p>
                    <div className="bg-white rounded-lg px-4 py-3 border border-emerald-200">
                      <code className="text-sm font-mono text-slate-700 break-all">
                        {reporte.firmaAdmin?.userId ? 
                          `SHA-256: ${reporte.firmaAdmin.userId.substring(0, 8).toUpperCase()}-${reporte.numeroReporte}-${new Date(reporte.firmaAdmin.timestamp).getTime().toString(16).toUpperCase().substring(0, 8)}` 
                          : 'N/A'}
                      </code>
                    </div>
                    <p className="text-xs text-slate-500 mt-2 italic">
                      Este código garantiza la autenticidad e integridad del documento
                    </p>
                  </div>
                </div>
              </div>

              {/* Footer de certificación */}
              <div className="mt-6 pt-6 border-t-2 border-emerald-200">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <svg className="w-8 h-8 text-emerald-600" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <div>
                      <p className="text-xs font-bold text-slate-700">Certificado por WorkFleet System</p>
                      <p className="text-xs text-slate-500">Plataforma de Gestión Empresarial</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-bold text-slate-600">Documento Electrónico Válido</p>
                    <p className="text-xs text-slate-500">Ley N° 19.799</p>
                  </div>
                </div>
              </div>

              {/* Patrón decorativo de fondo inferior */}
              <div className="absolute bottom-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500"></div>
            </div>
          )}
        </div>

        {/* Footer con botones de acción */}
        <div className="border-t-2 border-slate-200 p-6 bg-slate-50 sticky bottom-0 z-50">
          {isAdmin && !reporte.firmado ? (
            <div className="flex gap-3">
              {isEditing ? (
                <>
                  <button
                    onClick={handleSaveChanges}
                    className="flex-1 px-6 py-3 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white font-bold rounded-xl transition-all shadow-lg hover:shadow-xl"
                  >
                    Guardar Cambios
                  </button>
                  <button
                    onClick={handleCancelEdit}
                    className="flex-1 px-6 py-3 bg-gradient-to-r from-slate-600 to-slate-700 hover:from-slate-500 hover:to-slate-600 text-white font-bold rounded-xl transition-all shadow-lg hover:shadow-xl"
                  >
                    Cancelar
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => setIsEditing(true)}
                    className="flex-1 px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold rounded-xl transition-all shadow-lg hover:shadow-xl"
                  >
                    Editar Reporte
                  </button>
                  <button
                    onClick={() => setShowSignModal(true)}
                    className="flex-1 px-6 py-3 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white font-bold rounded-xl transition-all shadow-lg hover:shadow-xl"
                  >
                    Firmar y Validar
                  </button>
                  <button
                    onClick={onClose}
                    className="px-6 py-3 bg-gradient-to-r from-slate-600 to-slate-700 hover:from-slate-500 hover:to-slate-600 text-white font-bold rounded-xl transition-all shadow-lg hover:shadow-xl"
                  >
                    Cerrar
                  </button>
                </>
              )}
            </div>
          ) : (
            <button
              onClick={onClose}
              className="w-full px-6 py-3 bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 text-white font-bold rounded-xl transition-all shadow-lg hover:shadow-xl"
            >
              Cerrar
            </button>
          )}
        </div>
      </div>

      {/* Modal de Firma */}
      {showSignModal && (
        <div className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
            <h3 className="text-2xl font-black text-slate-900 mb-4 flex items-center gap-2">
              <svg className="w-6 h-6 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              Firmar Reporte
            </h3>
            <p className="text-slate-600 mb-6">
              Al firmar este reporte, usted valida que toda la información es correcta y ha sido revisada.
            </p>
            <div className="space-y-4">

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">PIN de Seguridad</label>
                <input
                  type="password"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  className="w-full px-4 py-2 border-2 border-slate-300 rounded-lg focus:outline-none focus:border-green-500"
                  placeholder="Ingrese su PIN"
                  maxLength="6"
                  pattern="[0-9]*"
                  inputMode="numeric"
                />
                <p className="text-xs text-slate-500 mt-1">PIN numérico de 4-6 dígitos</p>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={handleSignReport}
                disabled={!adminPassword}
                className="flex-1 px-6 py-3 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 disabled:from-slate-300 disabled:to-slate-400 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-all shadow-lg hover:shadow-xl"
              >
                Confirmar Firma
              </button>
              <button
                onClick={() => {
                  setShowSignModal(false);
                              setAdminPassword('');
                }}
                className="px-6 py-3 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-xl transition-all"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Componentes auxiliares
function DataField({ label, value, badge }) {
  return (
    <div>
      <div className="text-xs font-semibold text-slate-500 mb-1">{label}</div>
      <div className="flex items-center gap-2">
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

function MetricRow({ label, value, highlight, highlightColor }) {
  const valueColorClass = highlightColor || (highlight ? 'text-green-600' : 'text-slate-900');
  
  return (
    <div className="flex justify-between items-center">
      <span className={`text-sm ${highlight ? 'font-bold text-slate-900' : 'text-slate-600'}`}>{label}</span>
      <span className={`text-lg font-black ${valueColorClass}`}>{value}</span>
    </div>
  );
}

function EditableMetricRow({ label, value, onChange }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-sm text-slate-600">{label}</span>
      <input
        type="number"
        step="0.01"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="text-lg font-black text-slate-900 bg-transparent border-b-2 border-slate-300 w-24 text-right focus:outline-none focus:border-blue-500"
      />
    </div>
  );
}
