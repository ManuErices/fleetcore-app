import React, { useState, useEffect } from "react";

export default function Paso2FormTimeline({ formData, setFormData, onBack, onSubmit, isLoading, selectedMachine }) {
  
  // Estados
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState(null);
  const [dragEnd, setDragEnd] = useState(null);
  const [showActivitySelector, setShowActivitySelector] = useState(false);
  const [showConflictModal, setShowConflictModal] = useState(false);
  const [conflictInfo, setConflictInfo] = useState(null);
  
  // PALETA PROFESIONAL - Tonos corporativos modernos
  const COLORS = {
    efectiva: {
      primary: '#10b981', light: '#d1fae5', bg: '#ecfdf5', border: '#a7f3d0', text: '#065f46',
      gradient: 'from-emerald-400 via-emerald-500 to-teal-600', icon: '✓', label: 'Productiva'
    },
    noefectiva: {
      primary: '#f59e0b', light: '#fef3c7', bg: '#fffbeb', border: '#fde68a', text: '#78350f',
      gradient: 'from-amber-400 via-amber-500 to-orange-500', icon: '⏸', label: 'Detenida'
    },
    charla: {
      primary: '#3b82f6', light: '#dbeafe', bg: '#eff6ff', border: '#bfdbfe', text: '#1e3a8a',
      gradient: 'from-blue-400 via-blue-500 to-blue-600', icon: '🛡️', label: 'Seguridad'
    },
    inspeccion: {
      primary: '#8b5cf6', light: '#ede9fe', bg: '#f5f3ff', border: '#ddd6fe', text: '#5b21b6',
      gradient: 'from-violet-400 via-violet-500 to-purple-600', icon: '🔧', label: 'Inspección'
    },
    colacion: {
      primary: '#ec4899', light: '#fce7f3', bg: '#fdf2f8', border: '#fbcfe8', text: '#831843',
      gradient: 'from-pink-400 via-pink-500 to-rose-600', icon: '🍽️', label: 'Colación'
    }
  };
  
  const generarFranjasHorarias = () => {
    const franjas = [];
    for (let hora = 7; hora <= 19; hora++) {
      if (hora === 7) {
        franjas.push({ hora, minuto: 30, label: "7:30" });
      } else if (hora < 19) {
        franjas.push({ hora, minuto: 0, label: `${hora}:00` });
        franjas.push({ hora, minuto: 30, label: `${hora}:30` });
      } else {
        franjas.push({ hora, minuto: 0, label: "19:00" });
      }
    }
    return franjas;
  };

  const franjas = generarFranjasHorarias();

  const horaAIndice = (horaStr) => {
    if (!horaStr) return -1;
    const [h, m] = horaStr.split(':').map(Number);
    if (h === 7 && m === 30) return 0;
    if (h < 7 || (h === 7 && m < 30)) return -1;
    if (h > 19) return -1;
    const horaBase = h - 7;
    return horaBase * 2 - 1 + (m >= 30 ? 1 : 0);
  };

  const indiceAHora = (indice) => {
    if (indice < 0 || indice >= franjas.length) return "";
    const franja = franjas[indice];
    return `${String(franja.hora).padStart(2, '0')}:${String(franja.minuto).padStart(2, '0')}`;
  };

  const getColorConfig = (tipo, subTipo) => {
    if (tipo === 'efectiva') return COLORS.efectiva;
    if (tipo === 'noefectivo') return COLORS.noefectiva;
    if (tipo === 'programado') {
      if (subTipo === 'charlaSegurid') return COLORS.charla;
      if (subTipo === 'inspeccionEquipo') return COLORS.inspeccion;
      if (subTipo === 'colacion') return COLORS.colacion;
    }
    return COLORS.efectiva;
  };

  const obtenerActividadesTimeline = () => {
    const actividades = [];
    
    formData.actividadesEfectivas?.forEach((act, idx) => {
      if (act.horaInicio && act.horaFin) {
        const config = getColorConfig('efectiva');
        actividades.push({
          id: `efectiva-${idx}`, tipo: 'efectiva',
          nombre: act.actividad || `Actividad ${idx + 1}`,
          horaInicio: act.horaInicio, horaFin: act.horaFin,
          ...config, indice: idx
        });
      }
    });

    formData.tiemposNoEfectivos?.forEach((tiempo, idx) => {
      if (tiempo.horaInicio && tiempo.horaFin) {
        const config = getColorConfig('noefectivo');
        actividades.push({
          id: `noefectivo-${idx}`, tipo: 'noefectivo',
          nombre: tiempo.razon || `Detención ${idx + 1}`,
          horaInicio: tiempo.horaInicio, horaFin: tiempo.horaFin,
          ...config, indice: idx
        });
      }
    });

    const tp = formData.tiemposProgramados;
    if (tp?.charlaSegurid?.horaInicio && tp?.charlaSegurid?.horaFin) {
      const config = getColorConfig('programado', 'charlaSegurid');
      actividades.push({
        id: 'charla', tipo: 'programado', subTipo: 'charlaSegurid',
        nombre: 'Charla de Seguridad',
        horaInicio: tp.charlaSegurid.horaInicio, horaFin: tp.charlaSegurid.horaFin,
        ...config
      });
    }
    
    if (tp?.inspeccionEquipo?.horaInicio && tp?.inspeccionEquipo?.horaFin) {
      const config = getColorConfig('programado', 'inspeccionEquipo');
      actividades.push({
        id: 'inspeccion', tipo: 'programado', subTipo: 'inspeccionEquipo',
        nombre: 'Inspección de Equipo',
        horaInicio: tp.inspeccionEquipo.horaInicio, horaFin: tp.inspeccionEquipo.horaFin,
        ...config
      });
    }
    
    if (tp?.colacion?.horaInicio && tp?.colacion?.horaFin) {
      const config = getColorConfig('programado', 'colacion');
      actividades.push({
        id: 'colacion', tipo: 'programado', subTipo: 'colacion',
        nombre: 'Colación',
        horaInicio: tp.colacion.horaInicio, horaFin: tp.colacion.horaFin,
        ...config
      });
    }

    return actividades;
  };

  const detectarConflictos = (horaInicio, horaFin) => {
    const inicioNuevo = horaAIndice(horaInicio);
    const finNuevo = horaAIndice(horaFin);
    const actividades = obtenerActividadesTimeline();
    
    return actividades.filter(act => {
      const inicioAct = horaAIndice(act.horaInicio);
      const finAct = horaAIndice(act.horaFin);
      return (inicioNuevo < finAct && finNuevo > inicioAct);
    });
  };

  const eliminarActividad = (actividad) => {
    if (actividad.tipo === 'efectiva') {
      const nuevas = formData.actividadesEfectivas.filter((_, idx) => idx !== actividad.indice);
      setFormData({ ...formData, actividadesEfectivas: nuevas });
    } else if (actividad.tipo === 'noefectivo') {
      const nuevos = formData.tiemposNoEfectivos.filter((_, idx) => idx !== actividad.indice);
      setFormData({ ...formData, tiemposNoEfectivos: nuevos });
    } else if (actividad.tipo === 'programado') {
      const nuevosProgramados = { ...formData.tiemposProgramados };
      nuevosProgramados[actividad.subTipo] = { horaInicio: '', horaFin: '' };
      setFormData({ ...formData, tiemposProgramados: nuevosProgramados });
    }
  };

  const actualizarHoraActividad = (actividad, nuevaHoraInicio, nuevaHoraFin) => {
    if (actividad.tipo === 'efectiva') {
      const nuevas = [...formData.actividadesEfectivas];
      nuevas[actividad.indice] = { ...nuevas[actividad.indice], horaInicio: nuevaHoraInicio, horaFin: nuevaHoraFin };
      setFormData({ ...formData, actividadesEfectivas: nuevas });
    } else if (actividad.tipo === 'noefectivo') {
      const nuevos = [...formData.tiemposNoEfectivos];
      nuevos[actividad.indice] = { ...nuevos[actividad.indice], horaInicio: nuevaHoraInicio, horaFin: nuevaHoraFin };
      setFormData({ ...formData, tiemposNoEfectivos: nuevos });
    } else if (actividad.tipo === 'programado') {
      const nuevosProgramados = { ...formData.tiemposProgramados };
      nuevosProgramados[actividad.subTipo] = { horaInicio: nuevaHoraInicio, horaFin: nuevaHoraFin };
      setFormData({ ...formData, tiemposProgramados: nuevosProgramados });
    }
  };

  const recortarActividad = (actividad, horaInicioNueva, horaFinNueva) => {
    const inicioNuevo = horaAIndice(horaInicioNueva);
    const finNuevo = horaAIndice(horaFinNueva);
    const inicioAct = horaAIndice(actividad.horaInicio);
    const finAct = horaAIndice(actividad.horaFin);

    if (inicioNuevo <= inicioAct && finNuevo >= finAct) {
      eliminarActividad(actividad);
      return;
    }
    if (inicioNuevo > inicioAct && inicioNuevo < finAct) {
      const nuevaHoraFin = indiceAHora(inicioNuevo);
      actualizarHoraActividad(actividad, actividad.horaInicio, nuevaHoraFin);
    }
    if (finNuevo > inicioAct && finNuevo < finAct) {
      const nuevaHoraInicio = indiceAHora(finNuevo);
      actualizarHoraActividad(actividad, nuevaHoraInicio, actividad.horaFin);
    }
  };

  const handleDragStart = (indice) => {
    setIsDragging(true);
    setDragStart(indice);
    setDragEnd(indice);
  };

  const handleDragMove = (indice) => {
    if (isDragging) setDragEnd(indice);
  };

  const handleDragEnd = () => {
    if (isDragging && dragStart !== null && dragEnd !== null) {
      const inicioIndice = Math.min(dragStart, dragEnd);
      const finIndice = Math.max(dragStart, dragEnd);
      const horaInicio = indiceAHora(inicioIndice);
      const horaFin = indiceAHora(finIndice + 1);
      const conflictos = detectarConflictos(horaInicio, horaFin);
      
      if (conflictos.length > 0) {
        setConflictInfo({ horaInicio, horaFin, conflictos });
        setShowConflictModal(true);
      } else {
        window.tempSelection = { horaInicio, horaFin };
        setShowActivitySelector(true);
      }
    }
    setIsDragging(false);
    setDragStart(null);
    setDragEnd(null);
  };

  const confirmarReemplazo = () => {
    const { horaInicio, horaFin, conflictos } = conflictInfo;
    conflictos.forEach(act => recortarActividad(act, horaInicio, horaFin));
    window.tempSelection = { horaInicio, horaFin };
    setShowConflictModal(false);
    setShowActivitySelector(true);
  };

  const agregarActividad = (tipo) => {
    const { horaInicio, horaFin } = window.tempSelection || {};
    if (!horaInicio || !horaFin) return;

    if (tipo === 'efectiva') {
      setFormData({
        ...formData,
        actividadesEfectivas: [...formData.actividadesEfectivas, { actividad: '', horaInicio, horaFin, observaciones: '' }]
      });
    } else if (tipo === 'noefectivo') {
      setFormData({
        ...formData,
        tiemposNoEfectivos: [...formData.tiemposNoEfectivos, { razon: '', horaInicio, horaFin, observaciones: '' }]
      });
    } else if (tipo === 'charla') {
      setFormData({
        ...formData,
        tiemposProgramados: { ...formData.tiemposProgramados, charlaSegurid: { horaInicio, horaFin } }
      });
    } else if (tipo === 'inspeccion') {
      setFormData({
        ...formData,
        tiemposProgramados: { ...formData.tiemposProgramados, inspeccionEquipo: { horaInicio, horaFin } }
      });
    } else if (tipo === 'colacion') {
      setFormData({
        ...formData,
        tiemposProgramados: { ...formData.tiemposProgramados, colacion: { horaInicio, horaFin } }
      });
    }
    setShowActivitySelector(false);
  };

  const renderFranja = (franja, indice) => {
    const actividades = obtenerActividadesTimeline();
    const actividadEnFranja = actividades.find(act => {
      const inicioAct = horaAIndice(act.horaInicio);
      const finAct = horaAIndice(act.horaFin);
      return indice >= inicioAct && indice < finAct;
    });

    const enSeleccion = isDragging && dragStart !== null && dragEnd !== null && 
      indice >= Math.min(dragStart, dragEnd) && indice <= Math.max(dragStart, dragEnd);
    
    // Calcular si es la franja del medio (para mostrar texto)
    const esFranjaMedia = actividadEnFranja ? (() => {
      const inicioAct = horaAIndice(actividadEnFranja.horaInicio);
      const finAct = horaAIndice(actividadEnFranja.horaFin);
      const totalFranjas = finAct - inicioAct;
      const franjaMedio = inicioAct + Math.floor(totalFranjas / 2);
      return indice === franjaMedio;
    })() : false;
    
    const esHoraEnPunto = franja.minuto === 0;

    return (
      <div key={indice} className={`flex items-stretch group ${esHoraEnPunto ? 'border-b-2 border-slate-300/50' : 'border-b border-slate-200/30'}`} data-indice={indice}>
        {/* Hora label - más compacto */}
        <div className={`w-16 flex-shrink-0 flex items-center justify-center transition-all ${esHoraEnPunto ? 'bg-slate-900 text-white' : 'bg-slate-800 text-slate-300'}`}>
          <span className={`block ${esHoraEnPunto ? 'text-xs font-bold' : 'text-[10px] font-medium'}`}>{franja.label}</span>
        </div>

        {/* Franja - altura reducida a 40px */}
        <div
          className={`flex-1 h-10 relative cursor-pointer transition-all duration-150 active:scale-[0.98] ${
            actividadEnFranja ? `bg-gradient-to-r ${actividadEnFranja.gradient}` : 'bg-white active:bg-slate-100'
          } ${enSeleccion ? 'ring-2 ring-inset ring-blue-500 bg-blue-100' : ''} ${!actividadEnFranja && 'border-r border-slate-100'}`}
          style={{ 
            boxShadow: actividadEnFranja ? 'inset 0 1px 3px rgba(0,0,0,0.1)' : 'none',
            touchAction: 'none'
          }}
          onMouseDown={() => handleDragStart(indice)}
          onMouseEnter={() => handleDragMove(indice)}
          onMouseUp={handleDragEnd}
          onTouchStart={(e) => { 
            e.preventDefault(); 
            handleDragStart(indice); 
          }}
          onTouchMove={(e) => {
            e.preventDefault();
            const touch = e.touches[0];
            const element = document.elementFromPoint(touch.clientX, touch.clientY);
            if (element && element.closest('[data-indice]')) {
              const indiceNuevo = parseInt(element.closest('[data-indice]').dataset.indice);
              if (!isNaN(indiceNuevo)) handleDragMove(indiceNuevo);
            }
          }}
          onTouchEnd={(e) => { 
            e.preventDefault(); 
            handleDragEnd(); 
          }}
        >
          {/* Nombre de actividad - mostrar en franja central */}
          {esFranjaMedia && actividadEnFranja && (
            <div className="absolute inset-0 flex items-center justify-center px-2">
              <div className="flex items-center gap-1.5 max-w-full">
                <span className="text-base flex-shrink-0 drop-shadow-md">{actividadEnFranja.icon}</span>
                <span className="text-xs font-bold text-white/90 truncate drop-shadow-lg" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.3)' }}>
                  {actividadEnFranja.nombre}
                </span>
              </div>
            </div>
          )}
          
          {/* Indicador táctil */}
          {!actividadEnFranja && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-1 h-4 bg-slate-200 rounded-full opacity-30"></div>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 -m-6 p-6 space-y-6">
      {/* Header */}
      <div className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden">
        <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-white/10 rounded-xl backdrop-blur-sm flex-shrink-0">
              <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl md:text-2xl font-bold text-white">Actividades</h1>
                <span className="px-2.5 py-1 bg-white/20 text-white text-xs font-semibold rounded-lg backdrop-blur-sm">
                  Paso 2/2
                </span>
              </div>
              <p className="text-slate-300 text-xs md:text-sm mt-1">
                👆 Toca y arrastra para seleccionar horario
              </p>
            </div>
          </div>
        </div>
        
        {/* Indicador de arrastre activo */}
        {isDragging && (
          <div className="bg-blue-500 px-4 py-2.5 flex items-center gap-2 border-t-2 border-blue-400">
            <svg className="w-5 h-5 text-white animate-pulse flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 11.5V14m0-2.5v-6a1.5 1.5 0 113 0m-3 6a1.5 1.5 0 00-3 0v2a7.5 7.5 0 0015 0v-5a1.5 1.5 0 00-3 0m-6-3V11m0-5.5v-1a1.5 1.5 0 013 0v1m0 0V11m0-5.5a1.5 1.5 0 013 0v3m0 0V11" />
            </svg>
            <span className="text-white text-sm font-semibold">
              Seleccionando... Suelta para confirmar
            </span>
          </div>
        )}
      </div>

      {/* Timeline */}
      <div className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden">
        <div className="bg-slate-50 px-6 py-4 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-slate-900 rounded-lg">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <h2 className="font-bold text-slate-900 text-lg">Timeline Diario</h2>
              <p className="text-sm text-slate-500">Desliza para seleccionar • 24 franjas</p>
            </div>
          </div>
        </div>

        {/* Timeline completo visible - SIN scroll */}
        <div className="w-full">
          <div className="flex flex-col">
            {franjas.map((franja, idx) => renderFranja(franja, idx))}
          </div>
        </div>

        <div className="bg-slate-50 px-6 py-4 border-t border-slate-200">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-1 h-4 bg-slate-400 rounded-full"></div>
            <h3 className="font-semibold text-slate-700 text-sm">Tipos de Actividad</h3>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {Object.entries(COLORS).map(([key, config]) => (
              <div key={key} className="flex items-center gap-2 bg-white px-3 py-2 rounded-lg border border-slate-200">
                <div className={`w-10 h-10 bg-gradient-to-br ${config.gradient} rounded-lg flex items-center justify-center text-lg shadow-sm`}>
                  {config.icon}
                </div>
                <div className="text-xs">
                  <div className="font-semibold text-slate-900">{config.label}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Actividades Registradas */}
      <div className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden">
        <div className="bg-slate-50 px-6 py-4 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-slate-900 rounded-lg">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <div>
              <h2 className="font-bold text-slate-900 text-lg">Detalle de Actividades</h2>
              <p className="text-sm text-slate-500">Completa las descripciones</p>
            </div>
          </div>
        </div>
        
        <div className="p-6 space-y-4">
          {formData.actividadesEfectivas?.map((act, idx) => {
            const config = COLORS.efectiva;
            return (
              <div key={idx} style={{ backgroundColor: config.bg, borderColor: config.border }} className="border-2 rounded-xl p-4 hover:shadow-md transition-shadow">
                <div className="flex items-start gap-3 mb-3">
                  <div className={`p-3 bg-gradient-to-br ${config.gradient} rounded-lg flex-shrink-0 shadow-sm`}>
                    <span className="text-white text-xl">{config.icon}</span>
                  </div>
                  <div className="flex-1">
                    <div className="flex justify-between items-start mb-1">
                      <span style={{ color: config.text }} className="font-bold text-sm">Actividad Productiva #{idx + 1}</span>
                      <span style={{ color: config.text, borderColor: config.border }} className="text-xs font-semibold bg-white px-3 py-1 rounded-lg border">
                        {act.horaInicio} - {act.horaFin}
                      </span>
                    </div>
                  </div>
                </div>
                <input
                  type="text"
                  placeholder="Ej: Excavación, Carga de material, Transporte..."
                  value={act.actividad}
                  onChange={(e) => {
                    const nuevas = [...formData.actividadesEfectivas];
                    nuevas[idx].actividad = e.target.value;
                    setFormData({ ...formData, actividadesEfectivas: nuevas });
                  }}
                  style={{ borderColor: config.border }}
                  className="w-full px-4 py-3 border-2 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-400"
                />
              </div>
            );
          })}

          {formData.tiemposNoEfectivos?.map((tiempo, idx) => {
            const config = COLORS.noefectiva;
            return (
              <div key={idx} style={{ backgroundColor: config.bg, borderColor: config.border }} className="border-2 rounded-xl p-4 hover:shadow-md transition-shadow">
                <div className="flex items-start gap-3 mb-3">
                  <div className={`p-3 bg-gradient-to-br ${config.gradient} rounded-lg flex-shrink-0 shadow-sm`}>
                    <span className="text-white text-xl">{config.icon}</span>
                  </div>
                  <div className="flex-1">
                    <div className="flex justify-between items-start mb-1">
                      <span style={{ color: config.text }} className="font-bold text-sm">Tiempo No Productivo #{idx + 1}</span>
                      <span style={{ color: config.text, borderColor: config.border }} className="text-xs font-semibold bg-white px-3 py-1 rounded-lg border">
                        {tiempo.horaInicio} - {tiempo.horaFin}
                      </span>
                    </div>
                  </div>
                </div>
                <input
                  type="text"
                  placeholder="Ej: Falla mecánica, Espera de camión, Clima adverso..."
                  value={tiempo.razon}
                  onChange={(e) => {
                    const nuevos = [...formData.tiemposNoEfectivos];
                    nuevos[idx].razon = e.target.value;
                    setFormData({ ...formData, tiemposNoEfectivos: nuevos });
                  }}
                  style={{ borderColor: config.border }}
                  className="w-full px-4 py-3 border-2 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>
            );
          })}

          {formData.tiemposProgramados?.charlaSegurid?.horaInicio && (
            <div style={{ backgroundColor: COLORS.charla.bg, borderColor: COLORS.charla.border }} className="border-2 rounded-xl p-4">
              <div className="flex items-center gap-3">
                <div className={`p-3 bg-gradient-to-br ${COLORS.charla.gradient} rounded-lg shadow-sm`}>
                  <span className="text-white text-xl">{COLORS.charla.icon}</span>
                </div>
                <div className="flex-1">
                  <span style={{ color: COLORS.charla.text }} className="font-bold text-sm block">Charla de Seguridad</span>
                  <span className="text-xs text-slate-600">
                    {formData.tiemposProgramados.charlaSegurid.horaInicio} - {formData.tiemposProgramados.charlaSegurid.horaFin}
                  </span>
                </div>
              </div>
            </div>
          )}

          {formData.tiemposProgramados?.inspeccionEquipo?.horaInicio && (
            <div style={{ backgroundColor: COLORS.inspeccion.bg, borderColor: COLORS.inspeccion.border }} className="border-2 rounded-xl p-4">
              <div className="flex items-center gap-3">
                <div className={`p-3 bg-gradient-to-br ${COLORS.inspeccion.gradient} rounded-lg shadow-sm`}>
                  <span className="text-white text-xl">{COLORS.inspeccion.icon}</span>
                </div>
                <div className="flex-1">
                  <span style={{ color: COLORS.inspeccion.text }} className="font-bold text-sm block">Inspección de Equipo</span>
                  <span className="text-xs text-slate-600">
                    {formData.tiemposProgramados.inspeccionEquipo.horaInicio} - {formData.tiemposProgramados.inspeccionEquipo.horaFin}
                  </span>
                </div>
              </div>
            </div>
          )}

          {formData.tiemposProgramados?.colacion?.horaInicio && (
            <div style={{ backgroundColor: COLORS.colacion.bg, borderColor: COLORS.colacion.border }} className="border-2 rounded-xl p-4">
              <div className="flex items-center gap-3">
                <div className={`p-3 bg-gradient-to-br ${COLORS.colacion.gradient} rounded-lg shadow-sm`}>
                  <span className="text-white text-xl">{COLORS.colacion.icon}</span>
                </div>
                <div className="flex-1">
                  <span style={{ color: COLORS.colacion.text }} className="font-bold text-sm block">Colación</span>
                  <span className="text-xs text-slate-600">
                    {formData.tiemposProgramados.colacion.horaInicio} - {formData.tiemposProgramados.colacion.horaFin}
                  </span>
                </div>
              </div>
            </div>
          )}

          {formData.actividadesEfectivas?.length === 0 && formData.tiemposNoEfectivos?.length === 0 && 
           !formData.tiemposProgramados?.charlaSegurid?.horaInicio && !formData.tiemposProgramados?.inspeccionEquipo?.horaInicio &&
           !formData.tiemposProgramados?.colacion?.horaInicio && (
            <div className="text-center py-16 bg-slate-50 rounded-xl border-2 border-dashed border-slate-200">
              <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-10 h-10 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
              </div>
              <p className="text-slate-600 font-semibold text-lg mb-2">Sin actividades registradas</p>
              <p className="text-sm text-slate-400">Desliza sobre el timeline para comenzar</p>
            </div>
          )}
        </div>
      </div>

      {/* Modal Conflicto */}
      {showConflictModal && conflictInfo && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full border border-slate-200">
            <div className="bg-gradient-to-r from-orange-500 to-red-500 px-6 py-5 rounded-t-2xl">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white/20 rounded-lg">
                  <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white">Conflicto de Horarios</h3>
                  <p className="text-orange-100 text-sm mt-0.5">Superposición detectada</p>
                </div>
              </div>
            </div>
            
            <div className="p-6 space-y-4">
              <div className="bg-orange-50 border-2 border-orange-200 rounded-xl p-4">
                <p className="font-semibold text-orange-900 mb-1 text-sm">Nuevo rango seleccionado:</p>
                <p className="text-xl font-bold text-orange-700">{conflictInfo.horaInicio} → {conflictInfo.horaFin}</p>
              </div>

              <div>
                <p className="font-semibold text-slate-800 mb-2 text-sm">Actividades afectadas:</p>
                <div className="space-y-2">
                  {conflictInfo.conflictos.map((conflicto, idx) => (
                    <div key={idx} style={{ backgroundColor: conflicto.bg, borderColor: conflicto.border }} className="border-2 rounded-lg p-3">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{conflicto.icon}</span>
                        <div className="flex-1">
                          <p className="font-bold text-sm text-slate-900">{conflicto.nombre}</p>
                          <p className="text-xs text-slate-600">{conflicto.horaInicio} - {conflicto.horaFin}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-900">
                  <strong>¿Continuar?</strong> La nueva actividad reemplazará o recortará las actividades existentes.
                </p>
              </div>

              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowConflictModal(false)} className="flex-1 px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl transition-all">
                  Cancelar
                </button>
                <button onClick={confirmarReemplazo} className="flex-1 px-4 py-3 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white font-semibold rounded-xl transition-all shadow-lg">
                  Sí, reemplazar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Selector */}
      {showActivitySelector && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full border border-slate-200">
            <div className="bg-gradient-to-r from-slate-900 to-slate-800 px-6 py-5 rounded-t-2xl">
              <h3 className="text-xl font-bold text-white">Tipo de Actividad</h3>
              <p className="text-slate-300 text-sm mt-1">Selecciona una opción</p>
            </div>
            
            <div className="p-5 space-y-3">
              {[
                { tipo: 'efectiva', config: COLORS.efectiva, titulo: 'Actividad Productiva', desc: 'Trabajo efectivo realizado' },
                { tipo: 'noefectivo', config: COLORS.noefectiva, titulo: 'Tiempo No Productivo', desc: 'Detención, falla, espera' },
                { tipo: 'charla', config: COLORS.charla, titulo: 'Charla de Seguridad', desc: 'Capacitación diaria' },
                { tipo: 'inspeccion', config: COLORS.inspeccion, titulo: 'Inspección de Equipo', desc: 'Revisión pre-operacional' },
                { tipo: 'colacion', config: COLORS.colacion, titulo: 'Colación', desc: 'Tiempo de alimentación' }
              ].map(({ tipo, config, titulo, desc }) => (
                <button
                  key={tipo}
                  onClick={() => agregarActividad(tipo)}
                  className="w-full flex items-center gap-4 p-4 bg-gradient-to-r hover:shadow-lg border-2 rounded-xl transition-all group"
                  style={{ 
                    backgroundImage: `linear-gradient(to right, ${config.bg}, ${config.light})`,
                    borderColor: config.border
                  }}
                >
                  <div className={`p-3 bg-gradient-to-br ${config.gradient} rounded-lg shadow-md group-hover:scale-110 transition-transform`}>
                    <span className="text-white text-2xl">{config.icon}</span>
                  </div>
                  <div className="text-left flex-1">
                    <div className="font-bold text-slate-900">{titulo}</div>
                    <div className="text-xs text-slate-600">{desc}</div>
                  </div>
                </button>
              ))}

              <button onClick={() => setShowActivitySelector(false)} className="w-full px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl transition-all mt-2">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Botones Navegación */}
      <div className="flex gap-4">
        <button onClick={onBack} className="px-6 py-3 bg-white hover:bg-slate-50 text-slate-700 font-semibold rounded-xl transition-all border-2 border-slate-200 shadow-sm">
          ← Volver
        </button>
        <button
          onClick={onSubmit}
          disabled={isLoading}
          className="flex-1 px-6 py-4 bg-gradient-to-r from-slate-900 to-slate-800 hover:from-slate-800 hover:to-slate-700 disabled:from-slate-300 disabled:to-slate-400 text-white font-bold rounded-xl transition-all shadow-lg disabled:cursor-not-allowed"
        >
          {isLoading ? 'Guardando...' : '✓ Guardar Reporte'}
        </button>
      </div>
    </div>
  );
}
