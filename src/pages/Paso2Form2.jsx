import React, { useState, useEffect } from "react";

export default function Paso2Form({ formData, setFormData, onBack, onSubmit, isLoading, selectedMachine }) {
  
  // ✅ NUEVO: Estado para errores de validación en tiempo real
  const [horariosErrors, setHorariosErrors] = useState([]);
  const [totalHorasError, setTotalHorasError] = useState('');

  // ✅ Función auxiliar para ajustar minutos a intervalos de 15 (0, 15, 30, 45)
  const ajustarMinutos = (timeValue) => {
    if (!timeValue || !timeValue.includes(':')) return timeValue;
    
    const [horas, minutos] = timeValue.split(':').map(Number);
    
    // Redondear minutos al intervalo de 15 más cercano
    const minutosValidos = [0, 15, 30, 45];
    let minutoAjustado = minutosValidos[0];
    let menorDiferencia = Math.abs(minutos - minutosValidos[0]);
    
    for (let i = 1; i < minutosValidos.length; i++) {
      const diferencia = Math.abs(minutos - minutosValidos[i]);
      if (diferencia < menorDiferencia) {
        menorDiferencia = diferencia;
        minutoAjustado = minutosValidos[i];
      }
    }
    
    // Si el minuto ingresado ya es válido, no hacer nada
    if (minutosValidos.includes(minutos)) {
      return timeValue;
    }
    
    // Devolver la hora ajustada
    return `${String(horas).padStart(2, '0')}:${String(minutoAjustado).padStart(2, '0')}`;
  };

  // ✅ NUEVO: Validar horarios en tiempo real
  useEffect(() => {
    const errors = [];
    
    // Recopilar TODOS los horarios de todas las secciones
    const todosLosHorarios = [];
    
    // Agregar actividades efectivas
    formData.actividadesEfectivas.forEach((act, idx) => {
      if (act.horaInicio && act.horaFin) {
        todosLosHorarios.push({
          inicio: act.horaInicio,
          fin: act.horaFin,
          tipo: 'actividadEfectiva',
          indice: idx,
          nombre: `Actividad Efectiva ${idx + 1}`
        });
      }
    });
    
    // Agregar tiempos no efectivos
    formData.tiemposNoEfectivos.forEach((tiempo, idx) => {
      if (tiempo.horaInicio && tiempo.horaFin) {
        todosLosHorarios.push({
          inicio: tiempo.horaInicio,
          fin: tiempo.horaFin,
          tipo: 'tiempoNoEfectivo',
          indice: idx,
          nombre: `Tiempo No Efectivo ${idx + 1}`
        });
      }
    });
    
    // Agregar tiempos programados
    const tiemposProg = formData.tiemposProgramados;
    if (tiemposProg.charlaSegurid.horaInicio && tiemposProg.charlaSegurid.horaFin) {
      todosLosHorarios.push({
        inicio: tiemposProg.charlaSegurid.horaInicio,
        fin: tiemposProg.charlaSegurid.horaFin,
        tipo: 'tiempoProgramado',
        nombre: 'Charla de Seguridad'
      });
    }
    if (tiemposProg.inspeccionEquipo.horaInicio && tiemposProg.inspeccionEquipo.horaFin) {
      todosLosHorarios.push({
        inicio: tiemposProg.inspeccionEquipo.horaInicio,
        fin: tiemposProg.inspeccionEquipo.horaFin,
        tipo: 'tiempoProgramado',
        nombre: 'Inspección de Equipo'
      });
    }
    if (tiemposProg.colacion.horaInicio && tiemposProg.colacion.horaFin) {
      todosLosHorarios.push({
        inicio: tiemposProg.colacion.horaInicio,
        fin: tiemposProg.colacion.horaFin,
        tipo: 'tiempoProgramado',
        nombre: 'Colación'
      });
    }
    
    // Agregar mantenciones si están activas
    if (formData.tieneMantenciones && Array.isArray(formData.mantenciones)) {
      formData.mantenciones.forEach((mant, idx) => {
        if (mant.horaInicio && mant.horaFin) {
          todosLosHorarios.push({
            inicio: mant.horaInicio,
            fin: mant.horaFin,
            tipo: 'mantencion',
            indice: idx,
            nombre: `Mantención ${idx + 1}`
          });
        }
      });
    }
    
    // Validar cada actividad efectiva
    formData.actividadesEfectivas.forEach((act, idx) => {
      const actErrors = { index: idx, horaInicio: '', horaFin: '', duracion: '', solapamiento: '' };
      
      if (act.horaInicio) {
        // Validar hora inicial: debe ser mayor o igual a 7:00 AM y menor o igual a 7:00 PM
        if (act.horaInicio < "07:00" || act.horaInicio > "19:00") {
          actErrors.horaInicio = 'Debe ser mayor o igual a 7:00 AM y menor o igual a 7:00 PM';
        }
      }
      
      if (act.horaFin) {
        // Validar hora final: debe ser mayor o igual a 7:00 AM y menor o igual a 7:00 PM
        if (act.horaFin < "07:00" || act.horaFin > "19:00") {
          actErrors.horaFin = 'Debe ser mayor o igual a 7:00 AM y menor o igual a 7:00 PM';
        }
      }
      
      // Validar que hora inicial < hora final
      if (act.horaInicio && act.horaFin && act.horaInicio >= act.horaFin) {
        actErrors.duracion = 'La hora inicial debe ser menor que la final';
      }
      
      // ✅ VALIDACIÓN GLOBAL: Verificar superposición con TODOS los horarios
      if (act.horaInicio && act.horaFin) {
        const inicioActual = act.horaInicio;
        const finActual = act.horaFin;
        
        todosLosHorarios.forEach((otroHorario) => {
          // No comparar consigo mismo
          if (otroHorario.tipo === 'actividadEfectiva' && otroHorario.indice === idx) {
            return;
          }
          
          // Verificar si se superponen
          if (inicioActual < otroHorario.fin && finActual > otroHorario.inicio) {
            actErrors.solapamiento = `Se superpone con: ${otroHorario.nombre}`;
          }
        });
      }
      
      if (actErrors.horaInicio || actErrors.horaFin || actErrors.duracion || actErrors.solapamiento) {
        errors.push(actErrors);
      }
    });
    
    setHorariosErrors(errors);
  }, [formData.actividadesEfectivas, formData.tiemposNoEfectivos, formData.tiemposProgramados, formData.mantenciones, formData.tieneMantenciones]);

  // Funciones para manejar actividades efectivas
  const addActividad = () => {
    // Obtener la última actividad
    const ultimaActividad = formData.actividadesEfectivas[formData.actividadesEfectivas.length - 1];
    // La hora inicial de la nueva actividad es la hora final de la anterior
    const horaInicialNueva = ultimaActividad?.horaFin || '';
    
    setFormData({
      ...formData,
      actividadesEfectivas: [
        ...formData.actividadesEfectivas, 
        { actividad: '', horaInicio: horaInicialNueva, horaFin: '' }
      ]
    });
  };

  const removeActividad = (index) => {
    const newActividades = formData.actividadesEfectivas.filter((_, i) => i !== index);
    setFormData({ ...formData, actividadesEfectivas: newActividades });
  };

  const updateActividad = (index, field, value) => {
    const newActividades = [...formData.actividadesEfectivas];
    // Si es un campo de hora, ajustar los minutos
    if ((field === 'horaInicio' || field === 'horaFin') && value) {
      value = ajustarMinutos(value);
    }
    newActividades[index][field] = value;
    setFormData({ ...formData, actividadesEfectivas: newActividades });
  };

  // Funciones para manejar tiempos no efectivos
  const addTiempoNoEfectivo = () => {
    // Obtener el último tiempo no efectivo
    const ultimoTiempo = formData.tiemposNoEfectivos[formData.tiemposNoEfectivos.length - 1];
    // La hora inicial del nuevo tiempo es la hora final del anterior
    const horaInicialNueva = ultimoTiempo?.horaFin || '';
    
    setFormData({
      ...formData,
      tiemposNoEfectivos: [
        ...formData.tiemposNoEfectivos, 
        { motivo: '', horaInicio: horaInicialNueva, horaFin: '' }
      ]
    });
  };

  const removeTiempoNoEfectivo = (index) => {
    const newTiempos = formData.tiemposNoEfectivos.filter((_, i) => i !== index);
    setFormData({ ...formData, tiemposNoEfectivos: newTiempos });
  };

  const updateTiempoNoEfectivo = (index, field, value) => {
    const newTiempos = [...formData.tiemposNoEfectivos];
    // Si es un campo de hora, ajustar los minutos
    if ((field === 'horaInicio' || field === 'horaFin') && value) {
      value = ajustarMinutos(value);
    }
    newTiempos[index][field] = value;
    setFormData({ ...formData, tiemposNoEfectivos: newTiempos });
  };

  // Función para actualizar tiempos programados
  const updateTiempoProgramado = (tipo, field, value) => {
    setFormData({
      ...formData,
      tiemposProgramados: {
        ...formData.tiemposProgramados,
        [tipo]: {
          ...formData.tiemposProgramados[tipo],
          [field]: value
        }
      }
    });
  };

  // ✅ Validar antes de enviar
  const validateHorarios = () => {
    const errors = [];
    
    // Validar rangos de horarios
    formData.actividadesEfectivas.forEach((act, idx) => {
      if (act.horaInicio && act.horaFin) {
        if (act.horaInicio <= "07:00" || act.horaInicio >= "19:00") {
          errors.push(`Actividad ${idx + 1}: La hora inicial debe ser mayor a 7:00 AM y menor a 7:00 PM`);
        }
        
        if (act.horaFin <= "07:00" || act.horaFin >= "19:00") {
          errors.push(`Actividad ${idx + 1}: La hora final debe ser mayor a 7:00 AM y menor a 7:00 PM`);
        }
        
        if (act.horaInicio >= act.horaFin) {
          errors.push(`Actividad ${idx + 1}: La hora inicial debe ser menor que la hora final`);
        }
      }
    });
    
    // Validar suma total
    if (totalHorasError) {
      errors.push(totalHorasError);
    }
    
    // ✅ Validar superposiciones globales
    if (horariosErrors.some(err => err.solapamiento)) {
      errors.push('⚠️ Hay horarios que se superponen entre diferentes secciones. Por favor corrige los horarios.');
    }
    
    return errors;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    const horarioErrors = validateHorarios();
    
    if (horarioErrors.length > 0) {
      alert('Errores de validación:\n\n' + horarioErrors.join('\n'));
      return;
    }
    
    onSubmit(e);
  };

  // ✅ Función para obtener errores de una actividad específica
  const getActividadErrors = (index) => {
    return horariosErrors.find(err => err.index === index) || { horaInicio: '', horaFin: '', duracion: '', solapamiento: '' };
  };

  // ✅ NUEVO: Validar suma total de horas (debe ser 12)
  useEffect(() => {
    let totalMinutos = 0;
    
    // Función auxiliar para verificar si un rango A cubre completamente un rango B
    const rangoCubreCompletamente = (rangoA_inicio, rangoA_fin, rangoB_inicio, rangoB_fin) => {
      const [hA_ini, mA_ini] = rangoA_inicio.split(':').map(Number);
      const [hA_fin, mA_fin] = rangoA_fin.split(':').map(Number);
      const [hB_ini, mB_ini] = rangoB_inicio.split(':').map(Number);
      const [hB_fin, mB_fin] = rangoB_fin.split(':').map(Number);
      
      const minA_ini = hA_ini * 60 + mA_ini;
      const minA_fin = hA_fin * 60 + mA_fin;
      const minB_ini = hB_ini * 60 + mB_ini;
      const minB_fin = hB_fin * 60 + mB_fin;
      
      // Rango A cubre completamente B si A empieza antes o igual y termina después o igual
      return minA_ini <= minB_ini && minA_fin >= minB_fin;
    };
    
    // Verificar si la colación está cubierta completamente por alguna actividad
    let colacionCubierta = false;
    if (formData.tiemposProgramados.colacion?.horaInicio && formData.tiemposProgramados.colacion?.horaFin) {
      colacionCubierta = formData.actividadesEfectivas.some(act => {
        if (act.horaInicio && act.horaFin) {
          return rangoCubreCompletamente(
            act.horaInicio, 
            act.horaFin, 
            formData.tiemposProgramados.colacion.horaInicio, 
            formData.tiemposProgramados.colacion.horaFin
          );
        }
        return false;
      });
    }
    
    // Sumar actividades efectivas
    formData.actividadesEfectivas.forEach(act => {
      if (act.horaInicio && act.horaFin) {
        const [hInicio, mInicio] = act.horaInicio.split(':').map(Number);
        const [hFin, mFin] = act.horaFin.split(':').map(Number);
        const minutos = (hFin * 60 + mFin) - (hInicio * 60 + mInicio);
        if (minutos > 0) totalMinutos += minutos;
      }
    });
    
    // Sumar tiempos no efectivos
    formData.tiemposNoEfectivos.forEach(tiempo => {
      if (tiempo.horaInicio && tiempo.horaFin) {
        const [hInicio, mInicio] = tiempo.horaInicio.split(':').map(Number);
        const [hFin, mFin] = tiempo.horaFin.split(':').map(Number);
        const minutos = (hFin * 60 + mFin) - (hInicio * 60 + mInicio);
        if (minutos > 0) totalMinutos += minutos;
      }
    });
    
    // Sumar tiempos programados (EXCLUYENDO colación si está cubierta)
    Object.entries(formData.tiemposProgramados).forEach(([key, tiempo]) => {
      // Si es colación y está cubierta, no la sumamos
      if (key === 'colacion' && colacionCubierta) {
        return; // Skip colación
      }
      
      if (tiempo.horaInicio && tiempo.horaFin) {
        const [hInicio, mInicio] = tiempo.horaInicio.split(':').map(Number);
        const [hFin, mFin] = tiempo.horaFin.split(':').map(Number);
        const minutos = (hFin * 60 + mFin) - (hInicio * 60 + mInicio);
        if (minutos > 0) totalMinutos += minutos;
      }
    });
    
    // Sumar mantenciones si están activas
    if (formData.tieneMantenciones && Array.isArray(formData.mantenciones)) {
      formData.mantenciones.forEach(mant => {
        if (mant.horaInicio && mant.horaFin) {
          const [hInicio, mInicio] = mant.horaInicio.split(':').map(Number);
          const [hFin, mFin] = mant.horaFin.split(':').map(Number);
          const minutos = (hFin * 60 + mFin) - (hInicio * 60 + mInicio);
          if (minutos > 0) totalMinutos += minutos;
        }
      });
    }
    
    const totalHoras = totalMinutos / 60;
    
    if (totalHoras !== 12) {
      const diff = totalHoras - 12;
      let mensajeExtra = colacionCubierta ? ' (Colación excluida - cubierta por actividad)' : '';
      if (diff > 0) {
        setTotalHorasError(`⚠️ Tienes ${diff.toFixed(2)} horas de más. Total actual: ${totalHoras.toFixed(2)}h (debe ser 12h)${mensajeExtra}`);
      } else {
        setTotalHorasError(`⚠️ Te faltan ${Math.abs(diff).toFixed(2)} horas. Total actual: ${totalHoras.toFixed(2)}h (debe ser 12h)${mensajeExtra}`);
      }
    } else {
      setTotalHorasError('');
    }
  }, [formData.actividadesEfectivas, formData.tiemposNoEfectivos, formData.tiemposProgramados, formData.mantenciones, formData.tieneMantenciones]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 pb-20">
      {/* Header con info de máquina */}
      <div className="sticky top-0 z-10 bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-lg mb-6">
        <div className="max-w-4xl mx-auto p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs sm:text-sm opacity-90">Parte 2 de 2</div>
              <div className="text-lg sm:text-xl font-black">Actividades y Tiempos</div>
            </div>
            {selectedMachine && (
              <div className="text-right">
                <div className="text-xs opacity-90">Máquina</div>
                <div className="font-bold">{selectedMachine.code}</div>
              </div>
            )}
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="max-w-4xl mx-auto px-4 space-y-6">
        
        {/* ACTIVIDADES EFECTIVAS (Tiempo Efectivo) */}
        <Section 
          title="Actividades Efectivas" 
          subtitle="Tiempo productivo de trabajo"
          icon={
            <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        >
          <div className="space-y-3">
            {formData.actividadesEfectivas.map((act, idx) => {
              const errors = getActividadErrors(idx);
              
              return (
                <ActivityCard
                  key={idx}
                  index={idx}
                  data={act}
                  onUpdate={updateActividad}
                  onRemove={removeActividad}
                  canRemove={formData.actividadesEfectivas.length > 1}
                  placeholder="Ej: Reperfilado de Plataforma"
                  color="green"
                  errors={errors}
                />
              );
            })}
            
            <button
              type="button"
              onClick={addActividad}
              className="w-full py-3 border-2 border-dashed border-green-300 rounded-xl text-green-700 font-semibold hover:bg-green-50 transition-all"
            >
              + Agregar Actividad
            </button>
          </div>
        </Section>

        {/* TIEMPOS NO EFECTIVOS */}
        <Section 
          title="Tiempos No Efectivos" 
          subtitle="Tiempo improductivo"
          icon={
            <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        >
          <div className="space-y-3">
            {formData.tiemposNoEfectivos.map((tiempo, idx) => (
              <ActivityCard
                key={idx}
                index={idx}
                data={tiempo}
                onUpdate={updateTiempoNoEfectivo}
                onRemove={removeTiempoNoEfectivo}
                canRemove={formData.tiemposNoEfectivos.length > 1}
                placeholder="Ej: Traslado de Equipo"
                color="amber"
                labelActividad="Motivo"
                errors={{}}
              />
            ))}
            
            <button
              type="button"
              onClick={addTiempoNoEfectivo}
              className="w-full py-3 border-2 border-dashed border-amber-300 rounded-xl text-amber-700 font-semibold hover:bg-amber-50 transition-all"
            >
              + Agregar Tiempo No Efectivo
            </button>
          </div>
        </Section>

        {/* TIEMPOS DE RESERVAS PROGRAMADAS */}
        <Section 
          title="Tiempos de Reservas Programadas" 
          subtitle="Actividades diarias estándar"
          icon={
            <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          }
        >
          <div className="space-y-4">
            {/* Charla de Seguridad */}
            <ProgrammedTimeCard
              title="Charla de Seguridad"
              icon="🛡️"
              horaInicio={formData.tiemposProgramados.charlaSegurid.horaInicio}
              horaFin={formData.tiemposProgramados.charlaSegurid.horaFin}
              onChangeInicio={(val) => updateTiempoProgramado('charlaSegurid', 'horaInicio', val)}
              onChangeFin={(val) => updateTiempoProgramado('charlaSegurid', 'horaFin', val)}
            />

            {/* Inspección de Equipo */}
            <ProgrammedTimeCard
              title="Inspección de Equipo"
              icon="🔧"
              horaInicio={formData.tiemposProgramados.inspeccionEquipo.horaInicio}
              horaFin={formData.tiemposProgramados.inspeccionEquipo.horaFin}
              onChangeInicio={(val) => updateTiempoProgramado('inspeccionEquipo', 'horaInicio', val)}
              onChangeFin={(val) => updateTiempoProgramado('inspeccionEquipo', 'horaFin', val)}
            />

            {/* Colación */}
            <ProgrammedTimeCard
              title="Colación"
              icon="🍽️"
              horaInicio={formData.tiemposProgramados.colacion.horaInicio}
              horaFin={formData.tiemposProgramados.colacion.horaFin}
              onChangeInicio={(val) => updateTiempoProgramado('colacion', 'horaInicio', val)}
              onChangeFin={(val) => updateTiempoProgramado('colacion', 'horaFin', val)}
            />
          </div>
        </Section>

        {/* MANTENCIONES */}
        <Section 
          title="Mantenciones" 
          subtitle="¿Se realizaron mantenciones?"
          icon={
            <svg className="w-5 h-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          }
        >
          {/* Selector Sí/No */}
          <div className="flex gap-3 mb-4">
            <button
              type="button"
              onClick={() => {
                // Siempre agregar la primera mantención automáticamente
                setFormData({ 
                  ...formData, 
                  tieneMantenciones: true,
                  mantenciones: (formData.mantenciones && formData.mantenciones.length > 0) 
                    ? formData.mantenciones 
                    : [{ descripcion: '', horaInicio: '', horaFin: '' }]
                });
              }}
              className={`flex-1 py-3 px-4 rounded-xl font-bold text-sm sm:text-base transition-all ${
                formData.tieneMantenciones 
                  ? 'bg-red-600 text-white shadow-lg' 
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              ✅ Sí
            </button>
            <button
              type="button"
              onClick={() => setFormData({ ...formData, tieneMantenciones: false, mantenciones: [] })}
              className={`flex-1 py-3 px-4 rounded-xl font-bold text-sm sm:text-base transition-all ${
                formData.tieneMantenciones === false
                  ? 'bg-slate-600 text-white shadow-lg' 
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              ❌ No
            </button>
          </div>

          {/* Div desplegable cuando es Sí */}
          {formData.tieneMantenciones && (
            <div className="space-y-3 animate-fadeIn">
              {(Array.isArray(formData.mantenciones) ? formData.mantenciones : []).map((mant, idx) => (
                <div key={idx} className="bg-red-50 border-2 border-red-200 rounded-xl p-3 sm:p-4">
                  <div className="space-y-3">
                    <div>
                      <label className="block text-[10px] sm:text-xs font-bold text-slate-700 mb-1">
                        Descripción de Mantención
                      </label>
                      <input
                        type="text"
                        value={mant.descripcion || ''}
                        onChange={(e) => {
                          const newMants = [...(Array.isArray(formData.mantenciones) ? formData.mantenciones : [])];
                          newMants[idx] = { ...newMants[idx], descripcion: e.target.value };
                          setFormData({ ...formData, mantenciones: newMants });
                        }}
                        placeholder="Ej: Cambio de aceite, Revisión de frenos..."
                        className="input-modern w-full text-sm"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] sm:text-xs font-bold text-slate-700 mb-1">
                          Hora Inicio
                        </label>
                        <input
                          type="time"
                          value={mant.horaInicio || ''}
                          onChange={(e) => {
                            const valorAjustado = ajustarMinutos(e.target.value);
                            const newMants = [...(Array.isArray(formData.mantenciones) ? formData.mantenciones : [])];
                            newMants[idx] = { ...newMants[idx], horaInicio: valorAjustado };
                            setFormData({ ...formData, mantenciones: newMants });
                          }}
                          className="input-modern w-full text-sm"
                          step="900"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] sm:text-xs font-bold text-slate-700 mb-1">
                          Hora Fin
                        </label>
                        <input
                          type="time"
                          value={mant.horaFin || ''}
                          onChange={(e) => {
                            const valorAjustado = ajustarMinutos(e.target.value);
                            const newMants = [...(Array.isArray(formData.mantenciones) ? formData.mantenciones : [])];
                            newMants[idx] = { ...newMants[idx], horaFin: valorAjustado };
                            setFormData({ ...formData, mantenciones: newMants });
                          }}
                          className="input-modern w-full text-sm"
                          step="900"
                        />
                      </div>
                    </div>

                    {mant.horaInicio && mant.horaFin && (
                      <div className="text-center py-1 px-3 bg-red-100 rounded-lg">
                        <span className="text-xs font-bold text-red-700">
                          Duración: {calcularDuracion(mant.horaInicio, mant.horaFin)}
                        </span>
                      </div>
                    )}

                    {(Array.isArray(formData.mantenciones) ? formData.mantenciones : []).length > 1 && (
                      <button
                        type="button"
                        onClick={() => {
                          const newMants = (Array.isArray(formData.mantenciones) ? formData.mantenciones : []).filter((_, i) => i !== idx);
                          setFormData({ ...formData, mantenciones: newMants });
                        }}
                        className="w-full py-2 bg-red-100 hover:bg-red-200 text-red-700 font-semibold text-sm rounded-lg transition-all"
                      >
                        🗑️ Eliminar
                      </button>
                    )}
                  </div>
                </div>
              ))}

              <button
                type="button"
                onClick={() => {
                  const mantenciones = Array.isArray(formData.mantenciones) ? formData.mantenciones : [];
                  // Obtener la última mantención
                  const ultimaMant = mantenciones[mantenciones.length - 1];
                  // La hora inicial de la nueva mantención es la hora final de la anterior
                  const horaInicialNueva = ultimaMant?.horaFin || '';
                  
                  const newMants = [...mantenciones, { descripcion: '', horaInicio: horaInicialNueva, horaFin: '' }];
                  setFormData({ ...formData, mantenciones: newMants });
                }}
                className="w-full py-3 border-2 border-dashed border-red-300 rounded-xl text-red-700 font-semibold hover:bg-red-50 transition-all"
              >
                + Agregar Mantención
              </button>
            </div>
          )}
        </Section>

        {/* BOTONES DE NAVEGACIÓN */}
        <div className="grid grid-cols-2 gap-4 pt-4">
          {/* ✅ NUEVO: Alerta de suma total de horas */}
          {totalHorasError && (
            <div className="col-span-2 mb-4 flex items-start gap-3 p-4 bg-yellow-50 border-2 border-yellow-300 rounded-xl">
              <svg className="w-6 h-6 text-yellow-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" />
              </svg>
              <div>
                <div className="text-sm font-bold text-yellow-800 mb-1">Suma de Horarios Incorrecta</div>
                <div className="text-xs text-yellow-700">{totalHorasError}</div>
              </div>
            </div>
          )}
          
          <button
            type="button"
            onClick={onBack}
            disabled={isLoading}
            className="px-6 py-4 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-base sm:text-lg rounded-xl shadow-lg transition-all disabled:opacity-50"
          >
            ← Atrás
          </button>
          
          <button
            type="submit"
            disabled={isLoading}
            className="px-6 py-4 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold text-base sm:text-lg rounded-xl shadow-lg hover:shadow-xl transition-all disabled:opacity-50"
          >
            {isLoading ? (
              <span className="flex items-center justify-center gap-2">
                <div className="spinner w-5 h-5 border-white" />
                Guardando...
              </span>
            ) : (
              '✓ Guardar Reporte'
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

// Componente Section
function Section({ title, subtitle, icon, children }) {
  return (
    <div className="glass-card rounded-2xl p-4 sm:p-6 shadow-lg border border-slate-200">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-100 to-white flex items-center justify-center shadow-md flex-shrink-0">
          {icon}
        </div>
        <div className="flex-1">
          <h3 className="text-base sm:text-lg font-black text-slate-900">{title}</h3>
          {subtitle && <p className="text-xs sm:text-sm text-slate-600">{subtitle}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}

// Componente ActivityCard (para actividades efectivas y tiempos no efectivos)
function ActivityCard({ index, data, onUpdate, onRemove, canRemove, placeholder, color = "green", labelActividad = "Actividad", errors }) {
  const colors = {
    green: {
      bg: 'bg-green-50',
      border: 'border-green-200',
      text: 'text-green-700',
      button: 'bg-green-600 hover:bg-green-700'
    },
    amber: {
      bg: 'bg-amber-50',
      border: 'border-amber-200',
      text: 'text-amber-700',
      button: 'bg-amber-600 hover:bg-amber-700'
    }
  };

  const c = colors[color];

  return (
    <div className={`${c.bg} border-2 ${c.border} rounded-xl p-3 sm:p-4`}>
      <div className="space-y-3">
        {/* Actividad/Motivo */}
        <div>
          <label className="block text-[10px] sm:text-xs font-bold text-slate-700 mb-1">
            {labelActividad}
          </label>
          <input
            type="text"
            value={data.actividad || data.motivo || ''}
            onChange={(e) => onUpdate(index, data.actividad !== undefined ? 'actividad' : 'motivo', e.target.value)}
            placeholder={placeholder}
            className="input-modern w-full text-sm"
          />
        </div>

        {/* Horas */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[10px] sm:text-xs font-bold text-slate-700 mb-1">
              Hora Inicio
            </label>
            <input
              type="time"
              value={data.horaInicio}
              onChange={(e) => onUpdate(index, 'horaInicio', e.target.value)}
              className={`input-modern w-full text-sm ${errors.horaInicio ? 'border-red-300 bg-red-50' : ''}`}
              min="07:00"
              max="19:00"
              step="900"
            />
            <p className="text-[9px] sm:text-[10px] text-slate-500 mt-1">
              Entre 7:00 AM y 7:00 PM (inclusive)
            </p>
            {/* ✅ Mensaje de error en tiempo real */}
            {errors.horaInicio && (
              <div className="flex items-center gap-1 mt-1">
                <svg className="w-3 h-3 text-red-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" />
                </svg>
                <span className="text-[9px] sm:text-[10px] font-semibold text-red-700">{errors.horaInicio}</span>
              </div>
            )}
          </div>
          <div>
            <label className="block text-[10px] sm:text-xs font-bold text-slate-700 mb-1">
              Hora Fin
            </label>
            <input
              type="time"
              value={data.horaFin}
              onChange={(e) => onUpdate(index, 'horaFin', e.target.value)}
              className={`input-modern w-full text-sm ${errors.horaFin ? 'border-red-300 bg-red-50' : ''}`}
              min="07:00"
              max="19:00"
              step="900"
            />
            <p className="text-[9px] sm:text-[10px] text-slate-500 mt-1">
              Entre 7:00 AM y 7:00 PM (inclusive)
            </p>
            {/* ✅ Mensaje de error en tiempo real */}
            {errors.horaFin && (
              <div className="flex items-center gap-1 mt-1">
                <svg className="w-3 h-3 text-red-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" />
                </svg>
                <span className="text-[9px] sm:text-[10px] font-semibold text-red-700">{errors.horaFin}</span>
              </div>
            )}
          </div>
        </div>

        {/* ✅ Error de duración */}
        {errors.duracion && (
          <div className="flex items-center gap-2 p-2 bg-red-50 border border-red-200 rounded-lg">
            <svg className="w-4 h-4 text-red-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" />
            </svg>
            <span className="text-xs font-semibold text-red-700">{errors.duracion}</span>
          </div>
        )}

        {/* ✅ NUEVO: Error de solapamiento */}
        {errors.solapamiento && (
          <div className="flex items-center gap-2 p-2 bg-orange-50 border border-orange-200 rounded-lg">
            <svg className="w-4 h-4 text-orange-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" />
            </svg>
            <span className="text-xs font-semibold text-orange-700">{errors.solapamiento}</span>
          </div>
        )}

        {/* Duración calculada */}
        {data.horaInicio && data.horaFin && !errors.duracion && (
          <div className={`text-center py-1 px-3 ${c.bg} rounded-lg`}>
            <span className={`text-xs font-bold ${c.text}`}>
              Duración: {calcularDuracion(data.horaInicio, data.horaFin)}
            </span>
          </div>
        )}

        {/* Botón eliminar */}
        {canRemove && (
          <button
            type="button"
            onClick={() => onRemove(index)}
            className="w-full py-2 bg-red-100 hover:bg-red-200 text-red-700 font-semibold text-sm rounded-lg transition-all"
          >
            🗑️ Eliminar
          </button>
        )}
      </div>
    </div>
  );
}

// Componente ProgrammedTimeCard (para tiempos programados fijos)
function ProgrammedTimeCard({ title, icon, horaInicio, horaFin, onChangeInicio, onChangeFin }) {
  return (
    <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-3 sm:p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-2xl">{icon}</span>
        <div className="font-bold text-sm sm:text-base text-slate-900">{title}</div>
      </div>
      
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-[10px] sm:text-xs font-bold text-slate-700 mb-1">
            Hora Inicio
          </label>
          <input
            type="time"
            value={horaInicio}
            onChange={(e) => onChangeInicio(e.target.value)}
            className="input-modern w-full text-sm"
            step="900"
          />
        </div>
        <div>
          <label className="block text-[10px] sm:text-xs font-bold text-slate-700 mb-1">
            Hora Fin
          </label>
          <input
            type="time"
            value={horaFin}
            onChange={(e) => onChangeFin(e.target.value)}
            className="input-modern w-full text-sm"
            step="900"
          />
        </div>
      </div>

      {horaInicio && horaFin && (
        <div className="mt-2 text-center py-1 px-3 bg-blue-100 rounded-lg">
          <span className="text-xs font-bold text-blue-700">
            {calcularDuracion(horaInicio, horaFin)}
          </span>
        </div>
      )}
    </div>
  );
}

// Función helper para calcular duración
function calcularDuracion(inicio, fin) {
  if (!inicio || !fin) return '0:00';
  
  const [hInicio, mInicio] = inicio.split(':').map(Number);
  const [hFin, mFin] = fin.split(':').map(Number);
  
  let totalMinutos = (hFin * 60 + mFin) - (hInicio * 60 + mInicio);
  
  if (totalMinutos < 0) totalMinutos += 24 * 60;
  
  const horas = Math.floor(totalMinutos / 60);
  const minutos = totalMinutos % 60;
  
  return `${horas}:${minutos.toString().padStart(2, '0')}`;
}
