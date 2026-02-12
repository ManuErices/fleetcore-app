import React, { useState, useEffect } from "react";

// Componente Timeline Modal
function TimelineModal({ isOpen, onClose, onConfirm, initialStart, initialEnd, title, existingSlots = [] }) {
  const [startTime, setStartTime] = useState(initialStart || null);
  const [endTime, setEndTime] = useState(initialEnd || null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragType, setDragType] = useState(null); // 'start', 'end', or 'move'
  
  useEffect(() => {
    if (isOpen) {
      setStartTime(initialStart || null);
      setEndTime(initialEnd || null);
    }
  }, [isOpen, initialStart, initialEnd]);

  if (!isOpen) return null;

  // Generar slots de 15 minutos desde las 7:00 AM hasta las 7:00 PM
  const generateTimeSlots = () => {
    const slots = [];
    for (let hour = 7; hour <= 19; hour++) {
      for (let minute of [0, 15, 30, 45]) {
        if (hour === 19 && minute > 0) break; // Solo hasta 19:00
        const time = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
        slots.push(time);
      }
    }
    return slots;
  };

  const timeSlots = generateTimeSlots();

  const timeToMinutes = (time) => {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
  };

  const minutesToTime = (minutes) => {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  };

  const roundToNearest15 = (minutes) => {
    return Math.round(minutes / 15) * 15;
  };

  // Función para verificar si un tiempo cae dentro de un slot ocupado
  const isTimeInOccupiedSlot = (timeInMinutes) => {
    return existingSlots.some(slot => {
      const slotStart = timeToMinutes(slot.start);
      const slotEnd = timeToMinutes(slot.end);
      return timeInMinutes >= slotStart && timeInMinutes < slotEnd;
    });
  };

  // Función para calcular espacios disponibles
  const getAvailableSlots = () => {
    const minMinutes = 7 * 60; // 7:00 AM
    const maxMinutes = 19 * 60; // 7:00 PM
    
    // Ordenar slots existentes por hora de inicio
    const sortedSlots = [...existingSlots].sort((a, b) => 
      timeToMinutes(a.start) - timeToMinutes(b.start)
    );
    
    const availableSlots = [];
    let currentStart = minMinutes;
    
    sortedSlots.forEach(slot => {
      const slotStart = timeToMinutes(slot.start);
      const slotEnd = timeToMinutes(slot.end);
      
      // Si hay un espacio antes de este slot
      if (currentStart < slotStart) {
        availableSlots.push({
          start: minutesToTime(currentStart),
          end: minutesToTime(slotStart)
        });
      }
      
      currentStart = Math.max(currentStart, slotEnd);
    });
    
    // Agregar el espacio final si existe
    if (currentStart < maxMinutes) {
      availableSlots.push({
        start: minutesToTime(currentStart),
        end: minutesToTime(maxMinutes)
      });
    }
    
    return availableSlots;
  };

  const handleTimelineClick = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = x / rect.width;
    
    const minMinutes = 7 * 60; // 7:00 AM
    const maxMinutes = 19 * 60; // 7:00 PM
    const totalMinutes = maxMinutes - minMinutes;
    
    let clickedMinutes = minMinutes + (percentage * totalMinutes);
    clickedMinutes = roundToNearest15(clickedMinutes);
    clickedMinutes = Math.max(minMinutes, Math.min(maxMinutes, clickedMinutes));
    
    const clickedTime = minutesToTime(clickedMinutes);
    
    // Si no hay inicio, establecer el inicio y automáticamente el fin 1 minuto después
    if (!startTime) {
      let finalStartMinutes = clickedMinutes;
      let finalEndMinutes = clickedMinutes + 1;
      
      // Si el fin se pasaría del máximo, ajustar el inicio hacia atrás
      if (finalEndMinutes > maxMinutes) {
        finalEndMinutes = maxMinutes;
        finalStartMinutes = maxMinutes - 1;
      }
      
      setStartTime(minutesToTime(finalStartMinutes));
      setEndTime(minutesToTime(finalEndMinutes));
    } 
    // Si hay inicio pero no hay fin, establecer el fin
    else if (!endTime) {
      const startMinutes = timeToMinutes(startTime);
      if (clickedMinutes > startMinutes) {
        setEndTime(clickedTime);
      }
    }
    // Si ambos están establecidos, mover el fin
    else {
      const startMinutes = timeToMinutes(startTime);
      if (clickedMinutes > startMinutes) {
        setEndTime(clickedTime);
      }
    }
  };

  const handleMouseDown = (e, type) => {
    e.stopPropagation();
    setIsDragging(true);
    setDragType(type);
  };

  const handleMouseMove = (e) => {
    if (!isDragging || !startTime) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const percentage = x / rect.width;
    
    const minMinutes = 7 * 60;
    const maxMinutes = 19 * 60;
    const totalMinutes = maxMinutes - minMinutes;
    
    let newMinutes = minMinutes + (percentage * totalMinutes);
    newMinutes = roundToNearest15(newMinutes);
    newMinutes = Math.max(minMinutes, Math.min(maxMinutes, newMinutes));
    
    const newTime = minutesToTime(newMinutes);
    const startMinutes = timeToMinutes(startTime);

    // Solo permitir arrastrar el final
    if (dragType === 'end') {
      if (newMinutes >= startMinutes) {
        setEndTime(newTime);
      }
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    setDragType(null);
  };

  const getPosition = (time) => {
    if (!time) return 0;
    const minMinutes = 7 * 60;
    const maxMinutes = 19 * 60;
    const totalMinutes = maxMinutes - minMinutes;
    const timeMinutes = timeToMinutes(time);
    return ((timeMinutes - minMinutes) / totalMinutes) * 100;
  };

  const startPos = startTime ? getPosition(startTime) : 0;
  const endPos = endTime ? getPosition(endTime) : 0;
  const width = endPos - startPos;

  const formatTime12h = (time24) => {
    if (!time24) return '--:--';
    const [h, m] = time24.split(':').map(Number);
    const period = h >= 12 ? 'PM' : 'AM';
    const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
  };

  const calculateDuration = () => {
    if (!startTime || !endTime) return '0h 0m';
    const start = timeToMinutes(startTime);
    const end = timeToMinutes(endTime);
    const diff = end - start;
    const hours = Math.floor(diff / 60);
    const minutes = diff % 60;
    return `${hours}h ${minutes}m`;
  };

  const getOverlappingSlot = () => {
    if (!startTime || !endTime) return null;
    const start = timeToMinutes(startTime);
    const end = timeToMinutes(endTime);
    
    return existingSlots.find(slot => {
      const slotStart = timeToMinutes(slot.start);
      const slotEnd = timeToMinutes(slot.end);
      return start < slotEnd && end > slotStart;
    });
  };

  const overlappingSlot = getOverlappingSlot();

  const handleConfirm = () => {
    if (startTime && endTime && timeToMinutes(startTime) < timeToMinutes(endTime) && !overlappingSlot) {
      onConfirm(startTime, endTime);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full sm:max-w-4xl max-h-[95vh] sm:max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="sticky top-0 bg-gradient-to-r from-indigo-600 to-purple-600 text-white p-4 sm:p-6 rounded-t-3xl sm:rounded-t-2xl">
          {/* Barra de arrastre en móvil */}
          <div className="sm:hidden w-12 h-1.5 bg-white/30 rounded-full mx-auto mb-3"></div>
          
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <h2 className="text-xl sm:text-2xl font-bold">{title || "Seleccionar Horario"}</h2>
              <p className="text-indigo-100 text-xs sm:text-sm mt-1">Arrastra o toca para establecer</p>
            </div>
            <button
              onClick={onClose}
              className="w-10 h-10 sm:w-10 sm:h-10 rounded-full bg-white/20 hover:bg-white/30 active:bg-white/40 flex items-center justify-center transition-colors flex-shrink-0"
            >
              <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
          {/* Información de tiempo seleccionado */}
          {!startTime && !endTime ? (
            <div className="bg-slate-50 border-2 border-dashed border-slate-300 rounded-xl p-6 text-center">
              <div className="text-slate-400 text-sm sm:text-base font-medium">
                👆 Haz clic en el timeline para seleccionar un horario
              </div>
              <div className="text-slate-400 text-xs mt-1">
                Primer clic: inicio • Segundo clic: fin
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:gap-4">
              <div className="bg-slate-50 border-2 border-slate-300 rounded-xl p-3 sm:p-4 text-center">
                <div className="text-[10px] sm:text-xs font-semibold text-slate-600 mb-1">INICIO</div>
                <div className="text-lg sm:text-2xl font-bold text-slate-700 leading-tight">{formatTime12h(startTime)}</div>
                <div className="text-[9px] text-slate-500 mt-0.5">Seleccionado</div>
              </div>
              <div className="bg-purple-50 border-2 border-purple-200 rounded-xl p-3 sm:p-4 text-center">
                <div className="text-[10px] sm:text-xs font-semibold text-purple-700 mb-1">DURACIÓN</div>
                <div className="text-lg sm:text-2xl font-bold text-purple-900 leading-tight">{calculateDuration()}</div>
              </div>
              <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-3 sm:p-4 text-center">
                <div className="text-[10px] sm:text-xs font-semibold text-blue-700 mb-1">FIN</div>
                <div className="text-lg sm:text-2xl font-bold text-blue-900 leading-tight">{formatTime12h(endTime)}</div>
                <div className="text-[9px] text-blue-600 mt-0.5">Ajustable</div>
              </div>
            </div>
          )}

          {overlappingSlot && (
            <div className="bg-orange-50 border-2 border-orange-300 rounded-xl p-3 sm:p-4 flex items-start gap-2 sm:gap-3">
              <svg className="w-5 h-5 sm:w-6 sm:h-6 text-orange-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" />
              </svg>
              <div className="flex-1">
                <div className="font-bold text-orange-900 text-sm sm:text-base">⚠️ Horario Superpuesto</div>
                <div className="text-xs sm:text-sm text-orange-700 mt-0.5">
                  Se solapa con: <strong>{overlappingSlot.label}</strong> ({overlappingSlot.start} - {overlappingSlot.end})
                </div>
              </div>
            </div>
          )}

          {/* Mensaje informativo de espacios disponibles */}
          {existingSlots.length > 0 && !overlappingSlot && (
            <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-3 sm:p-4">
              <div className="flex items-start gap-2">
                <svg className="w-5 h-5 sm:w-5 sm:h-5 text-blue-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" />
                </svg>
                <div className="flex-1">
                  <div className="font-bold text-blue-900 text-sm">Espacios Disponibles</div>
                  <div className="text-xs text-blue-700 mt-1">
                    {getAvailableSlots().map((slot, idx) => (
                      <span key={idx} className="inline-block bg-blue-100 px-2 py-1 rounded mr-1 mb-1">
                        {slot.start} - {slot.end}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Timeline interactivo */}
          <div className="space-y-2 sm:space-y-3">
            <div className="flex items-center justify-between text-xs sm:text-sm font-semibold text-slate-700 px-1">
              <span>7 AM</span>
              <span className="text-slate-500 text-[10px] sm:text-xs">Toca y arrastra</span>
              <span>7 PM</span>
            </div>
            
            <div
              className="relative h-32 sm:h-24 bg-slate-100 rounded-xl cursor-pointer select-none touch-none"
              onClick={handleTimelineClick}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onTouchMove={(e) => {
                if (isDragging && dragType === 'end' && startTime) {
                  e.preventDefault();
                  const touch = e.touches[0];
                  const rect = e.currentTarget.getBoundingClientRect();
                  const x = Math.max(0, Math.min(touch.clientX - rect.left, rect.width));
                  const percentage = x / rect.width;
                  
                  const minMinutes = 7 * 60;
                  const maxMinutes = 19 * 60;
                  const totalMinutes = maxMinutes - minMinutes;
                  
                  let newMinutes = minMinutes + (percentage * totalMinutes);
                  newMinutes = roundToNearest15(newMinutes);
                  newMinutes = Math.max(minMinutes, Math.min(maxMinutes, newMinutes));
                  
                  const newTime = minutesToTime(newMinutes);
                  const startMinutes = timeToMinutes(startTime);

                  if (newMinutes >= startMinutes) {
                    setEndTime(newTime);
                  }
                }
              }}
              onTouchEnd={handleMouseUp}
            >
              {/* Marcadores de hora */}
              <div className="absolute inset-0 flex">
                {[7, 9, 11, 13, 15, 17, 19].map((hour) => {
                  const pos = ((hour - 7) / 12) * 100;
                  return (
                    <div
                      key={hour}
                      className="absolute top-0 bottom-0 w-px bg-slate-300"
                      style={{ left: `${pos}%` }}
                    >
                      <div className="absolute -top-7 sm:-top-6 left-1/2 -translate-x-1/2 text-[10px] sm:text-xs text-slate-500 font-medium">
                        {hour > 12 ? hour - 12 : hour}{hour >= 12 ? 'p' : 'a'}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Slots existentes (en gris o rojo si hay solapamiento) */}
              {existingSlots.map((slot, idx) => {
                const slotStart = getPosition(slot.start);
                const slotEnd = getPosition(slot.end);
                const slotWidth = slotEnd - slotStart;
                
                // Verificar si este slot está causando el solapamiento actual
                const isConflicting = overlappingSlot && 
                  slot.start === overlappingSlot.start && 
                  slot.end === overlappingSlot.end &&
                  slot.label === overlappingSlot.label;
                
                return (
                  <div
                    key={idx}
                    className={`absolute top-0 bottom-0 rounded border-2 transition-all ${
                      isConflicting 
                        ? 'bg-red-400/70 border-red-600 shadow-lg z-10' 
                        : 'bg-slate-300/60 border-slate-400'
                    }`}
                    style={{
                      left: `${slotStart}%`,
                      width: `${slotWidth}%`
                    }}
                  >
                    <div className="absolute inset-0 flex items-center justify-center px-1">
                      <span className={`text-[9px] sm:text-xs font-semibold truncate ${
                        isConflicting ? 'text-white' : 'text-slate-600'
                      }`}>
                        {isConflicting ? '⚠️ ' : ''}{slot.label || 'Ocupado'}
                      </span>
                    </div>
                  </div>
                );
              })}

              {/* Rango seleccionado */}
              {startTime && endTime && width > 0 && (
                <div
                  className={`absolute top-0 bottom-0 rounded shadow-lg transition-all ${
                    overlappingSlot 
                      ? 'bg-gradient-to-r from-red-500 to-orange-500' 
                      : 'bg-gradient-to-r from-indigo-500 to-purple-500'
                  }`}
                  style={{
                    left: `${startPos}%`,
                    width: `${width}%`
                  }}
                >
                  {/* Indicador de inicio */}
                  <div className="absolute left-0 top-0 bottom-0 w-6 sm:w-3 bg-slate-400 rounded-l flex items-center justify-center cursor-pointer hover:bg-slate-500">
                    <div className="w-1.5 sm:w-1 h-10 sm:h-8 bg-white/60 rounded"></div>
                  </div>

                  {/* Contenido del rango */}
                  <div className="absolute inset-0 flex items-center justify-center px-4">
                    <span className="text-white font-bold text-xs sm:text-sm truncate">
                      {overlappingSlot ? '⚠️ ' : ''}{formatTime12h(startTime)} - {formatTime12h(endTime)}
                    </span>
                  </div>

                  {/* Handle de fin (arrastrable) */}
                  <div
                    className="absolute right-0 top-0 bottom-0 w-6 sm:w-3 bg-blue-500 cursor-ew-resize rounded-r hover:bg-blue-600 active:bg-blue-700 transition-colors flex items-center justify-center"
                    onMouseDown={(e) => handleMouseDown(e, 'end')}
                    onTouchStart={(e) => {
                      e.stopPropagation();
                      setIsDragging(true);
                      setDragType('end');
                    }}
                  >
                    <div className="w-1.5 sm:w-1 h-10 sm:h-8 bg-white rounded"></div>
                  </div>
                </div>
              )}
            </div>

            <div className="text-center text-[10px] sm:text-xs text-slate-500 px-2">
              💡 <span className="hidden sm:inline">Haz clic para seleccionar inicio y fin • Arrastra el extremo azul para ajustar</span>
              <span className="sm:hidden">Toca para seleccionar horario • Arrastra el extremo azul para ajustar</span>
            </div>
          </div>

          {/* Inputs manuales como alternativa */}
          <div className="border-t pt-3 sm:pt-4">
            <div className="text-xs sm:text-sm font-semibold text-slate-700 mb-2 sm:mb-3">O ingresa manualmente:</div>
            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-2">Hora Inicio</label>
                <input
                  type="time"
                  value={startTime || ''}
                  onChange={(e) => {
                    const newStart = e.target.value;
                    // Establecer automáticamente el fin 1 minuto después
                    if (newStart) {
                      const startMinutes = timeToMinutes(newStart);
                      let finalStartMinutes = startMinutes;
                      let endMinutes = startMinutes + 1;
                      const maxMinutes = 19 * 60;
                      
                      // Si el fin se pasaría del máximo, ajustar el inicio hacia atrás
                      if (endMinutes > maxMinutes) {
                        endMinutes = maxMinutes;
                        finalStartMinutes = maxMinutes - 1;
                      }
                      
                      setStartTime(minutesToTime(finalStartMinutes));
                      setEndTime(minutesToTime(endMinutes));
                    } else {
                      setStartTime(newStart);
                    }
                  }}
                  className="w-full px-3 sm:px-4 py-3 sm:py-3 text-base border-2 border-slate-200 rounded-lg focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 transition-all"
                  min="07:00"
                  max="18:59"
                  step="900"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-2">Hora Fin</label>
                <input
                  type="time"
                  value={endTime || ''}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="w-full px-3 sm:px-4 py-3 sm:py-3 text-base border-2 border-slate-200 rounded-lg focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 transition-all"
                  min="07:00"
                  max="19:00"
                  step="900"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-slate-50 p-4 sm:p-6 rounded-b-3xl sm:rounded-b-2xl border-t flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 sm:gap-4">
          <button
            onClick={onClose}
            className="order-2 sm:order-1 px-6 py-4 sm:py-3 bg-slate-200 active:bg-slate-300 text-slate-700 font-semibold rounded-xl sm:rounded-lg transition-colors text-base"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={!startTime || !endTime || timeToMinutes(startTime) >= timeToMinutes(endTime) || overlappingSlot}
            className="order-1 sm:order-2 px-8 py-4 sm:py-3 bg-gradient-to-r from-indigo-600 to-purple-600 active:from-indigo-700 active:to-purple-700 disabled:from-slate-300 disabled:to-slate-300 text-white font-bold rounded-xl sm:rounded-lg transition-all shadow-lg disabled:shadow-none text-base"
          >
            {overlappingSlot ? '⚠️ Horario Superpuesto' : '✓ Confirmar Horario'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Paso2Form({ formData, setFormData, onBack, onSubmit, isLoading, selectedMachine }) {
  
  // ✅ NUEVO: Estado para errores de validación en tiempo real
  const [horariosErrors, setHorariosErrors] = useState([]);
  const [totalHorasError, setTotalHorasError] = useState('');
  
  // Estados para el modal
  const [timelineModal, setTimelineModal] = useState({
    isOpen: false,
    type: null, // 'actividadEfectiva', 'tiempoNoEfectivo', 'tiempoProgramado', 'mantencion'
    index: null,
    title: '',
    initialStart: '',
    initialEnd: ''
  });

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

  // Helper para convertir tiempo a minutos
  const timeToMinutes = (time) => {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
  };

  // Función para obtener la última hora final donde se puede continuar
  // Busca entre TODOS los tipos y retorna la más reciente cronológicamente
  const getUltimaHoraFinal = () => {
    let ultimaHora = '08:30'; // Hora por defecto (después de inspección)
    let ultimaHoraEnMinutos = timeToMinutes(ultimaHora);
    
    // Buscar en Actividades Efectivas
    if (formData.actividadesEfectivas.length > 0) {
      formData.actividadesEfectivas.forEach(act => {
        if (act.horaFin) {
          const finEnMinutos = timeToMinutes(act.horaFin);
          if (finEnMinutos > ultimaHoraEnMinutos) {
            ultimaHora = act.horaFin;
            ultimaHoraEnMinutos = finEnMinutos;
          }
        }
      });
    }
    
    // Buscar en Tiempos No Efectivos
    if (formData.tiemposNoEfectivos.length > 0) {
      formData.tiemposNoEfectivos.forEach(tiempo => {
        if (tiempo.horaFin) {
          const finEnMinutos = timeToMinutes(tiempo.horaFin);
          if (finEnMinutos > ultimaHoraEnMinutos) {
            ultimaHora = tiempo.horaFin;
            ultimaHoraEnMinutos = finEnMinutos;
          }
        }
      });
    }
    
    // Buscar en Mantenciones
    if (formData.tieneMantenciones && formData.mantenciones.length > 0) {
      formData.mantenciones.forEach(mant => {
        if (mant.horaFin) {
          const finEnMinutos = timeToMinutes(mant.horaFin);
          if (finEnMinutos > ultimaHoraEnMinutos) {
            ultimaHora = mant.horaFin;
            ultimaHoraEnMinutos = finEnMinutos;
          }
        }
      });
    }
    
    return ultimaHora;
  };

  // Función para calcular el inicio correcto de una actividad específica
  const getInicioParaActividad = (type, index) => {
    // ✅ SIEMPRE usar la última hora final GLOBAL para evitar solapamientos
    // Esto asegura que cada nueva actividad inicie donde terminó la última,
    // sin importar su tipo
    const ultimaHoraGlobal = getUltimaHoraFinal();
    
    // Aplicar lógica de colación también aquí
    const horaColacionInicio = formData.tiemposProgramados.colacion.horaInicio || '13:00';
    const horaColacionFin = formData.tiemposProgramados.colacion.horaFin || '14:00';
    
    if (ultimaHoraGlobal >= horaColacionInicio && ultimaHoraGlobal < horaColacionFin) {
      return horaColacionFin; // Saltar la colación
    }
    
    return ultimaHoraGlobal;
  };

  // Función para abrir el modal de timeline
  const openTimelineModal = (type, index, title, initialStart, initialEnd) => {
    // SIEMPRE recalcular el inicio correcto basado en la posición
    const horaInicio = getInicioParaActividad(type, index);
    
    setTimelineModal({
      isOpen: true,
      type,
      index,
      title,
      initialStart: horaInicio,
      initialEnd: initialEnd || horaInicio
    });
  };

  // Función para cerrar el modal
  const closeTimelineModal = () => {
    setTimelineModal({
      isOpen: false,
      type: null,
      index: null,
      title: '',
      initialStart: '',
      initialEnd: ''
    });
  };

  // Función para obtener todos los slots existentes (para mostrar en el timeline)
  const getExistingSlots = (excludeType, excludeIndex) => {
    const slots = [];
    
    // Actividades efectivas
    formData.actividadesEfectivas.forEach((act, idx) => {
      if (act.horaInicio && act.horaFin) {
        if (excludeType !== 'actividadEfectiva' || excludeIndex !== idx) {
          slots.push({
            start: act.horaInicio,
            end: act.horaFin,
            label: `Actividad ${idx + 1}`
          });
        }
      }
    });
    
    // Tiempos no efectivos
    formData.tiemposNoEfectivos.forEach((tiempo, idx) => {
      if (tiempo.horaInicio && tiempo.horaFin) {
        if (excludeType !== 'tiempoNoEfectivo' || excludeIndex !== idx) {
          slots.push({
            start: tiempo.horaInicio,
            end: tiempo.horaFin,
            label: `No Efectivo ${idx + 1}`
          });
        }
      }
    });
    
    // Tiempos programados
    const tiemposProg = formData.tiemposProgramados;
    if (tiemposProg.charlaSegurid.horaInicio && tiemposProg.charlaSegurid.horaFin) {
      if (excludeType !== 'charlaSegurid') {
        slots.push({
          start: tiemposProg.charlaSegurid.horaInicio,
          end: tiemposProg.charlaSegurid.horaFin,
          label: 'Charla Seguridad'
        });
      }
    }
    if (tiemposProg.inspeccionEquipo.horaInicio && tiemposProg.inspeccionEquipo.horaFin) {
      if (excludeType !== 'inspeccionEquipo') {
        slots.push({
          start: tiemposProg.inspeccionEquipo.horaInicio,
          end: tiemposProg.inspeccionEquipo.horaFin,
          label: 'Inspección Equipo'
        });
      }
    }
    if (tiemposProg.colacion.horaInicio && tiemposProg.colacion.horaFin) {
      if (excludeType !== 'colacion') {
        slots.push({
          start: tiemposProg.colacion.horaInicio,
          end: tiemposProg.colacion.horaFin,
          label: 'Colación'
        });
      }
    }
    
    // Mantenciones
    if (formData.tieneMantenciones && Array.isArray(formData.mantenciones)) {
      formData.mantenciones.forEach((mant, idx) => {
        if (mant.horaInicio && mant.horaFin) {
          if (excludeType !== 'mantencion' || excludeIndex !== idx) {
            slots.push({
              start: mant.horaInicio,
              end: mant.horaFin,
              label: `Mantención ${idx + 1}`
            });
          }
        }
      });
    }
    
    return slots;
  };

  // Función para confirmar el horario desde el modal
  const handleTimelineConfirm = (startTime, endTime) => {
    const { type, index } = timelineModal;
    
    if (type === 'actividadEfectiva') {
      updateActividad(index, 'horaInicio', startTime);
      updateActividad(index, 'horaFin', endTime);
    } else if (type === 'tiempoNoEfectivo') {
      updateTiempoNoEfectivo(index, 'horaInicio', startTime);
      updateTiempoNoEfectivo(index, 'horaFin', endTime);
    } else if (type === 'charlaSegurid') {
      updateTiempoProgramado('charlaSegurid', 'horaInicio', startTime);
      updateTiempoProgramado('charlaSegurid', 'horaFin', endTime);
    } else if (type === 'inspeccionEquipo') {
      updateTiempoProgramado('inspeccionEquipo', 'horaInicio', startTime);
      updateTiempoProgramado('inspeccionEquipo', 'horaFin', endTime);
    } else if (type === 'colacion') {
      updateTiempoProgramado('colacion', 'horaInicio', startTime);
      updateTiempoProgramado('colacion', 'horaFin', endTime);
    } else if (type === 'mantencion') {
      updateMantencion(index, 'horaInicio', startTime);
      updateMantencion(index, 'horaFin', endTime);
    }
  };

  // ✅ NUEVO: Sincronizar automáticamente los inicios de actividades cuando cambien los finales
  useEffect(() => {
    // Para actividades efectivas: cada inicio debe ser el fin de la anterior
    const actividadesActualizadas = [...formData.actividadesEfectivas];
    let huboChanges = false;
    
    for (let i = 1; i < actividadesActualizadas.length; i++) {
      const actividadAnterior = actividadesActualizadas[i - 1];
      const actividadActual = actividadesActualizadas[i];
      
      if (actividadAnterior.horaFin && actividadActual.horaInicio !== actividadAnterior.horaFin) {
        actividadesActualizadas[i].horaInicio = actividadAnterior.horaFin;
        huboChanges = true;
      }
    }
    
    // Para tiempos no efectivos: cada inicio debe ser el fin del anterior
    const tiemposActualizados = [...formData.tiemposNoEfectivos];
    for (let i = 1; i < tiemposActualizados.length; i++) {
      const tiempoAnterior = tiemposActualizados[i - 1];
      const tiempoActual = tiemposActualizados[i];
      
      if (tiempoAnterior.horaFin && tiempoActual.horaInicio !== tiempoAnterior.horaFin) {
        tiemposActualizados[i].horaInicio = tiempoAnterior.horaFin;
        huboChanges = true;
      }
    }
    
    // Para mantenciones: cada inicio debe ser el fin de la anterior
    if (formData.tieneMantenciones) {
      const mantencionesActualizadas = [...formData.mantenciones];
      for (let i = 1; i < mantencionesActualizadas.length; i++) {
        const mantencionAnterior = mantencionesActualizadas[i - 1];
        const mantencionActual = mantencionesActualizadas[i];
        
        if (mantencionAnterior.horaFin && mantencionActual.horaInicio !== mantencionAnterior.horaFin) {
          mantencionesActualizadas[i].horaInicio = mantencionAnterior.horaFin;
          huboChanges = true;
        }
      }
      
      if (huboChanges) {
        setFormData({
          ...formData,
          actividadesEfectivas: actividadesActualizadas,
          tiemposNoEfectivos: tiemposActualizados,
          mantenciones: mantencionesActualizadas
        });
      }
    } else if (huboChanges) {
      setFormData({
        ...formData,
        actividadesEfectivas: actividadesActualizadas,
        tiemposNoEfectivos: tiemposActualizados
      });
    }
  }, [
    formData.actividadesEfectivas.map(a => a.horaFin).join(','),
    formData.tiemposNoEfectivos.map(t => t.horaFin).join(','),
    formData.mantenciones.map(m => m.horaFin).join(',')
  ]);

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
    
    // ✅ NUEVO: Agregar tiempos programados a la validación
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
  }, [formData.actividadesEfectivas, formData.tiemposNoEfectivos, formData.mantenciones, formData.tieneMantenciones]);

  // ✅ NUEVA: Función inteligente para calcular la hora inicial de nuevas actividades
  const calcularHoraInicialInteligente = () => {
    console.log('🔍 Calculando hora inicial inteligente...');
    
    // Buscar la última hora final entre TODAS las actividades (sin importar si hay vacías)
    let ultimaHoraFinal = null;
    
    // Revisar actividades efectivas
    formData.actividadesEfectivas.forEach((act, idx) => {
      if (act.horaFin) {
        console.log(`📌 Actividad Efectiva ${idx + 1} tiene horaFin: ${act.horaFin}`);
        if (!ultimaHoraFinal || act.horaFin > ultimaHoraFinal) {
          ultimaHoraFinal = act.horaFin;
        }
      }
    });
    
    // Revisar tiempos no efectivos
    formData.tiemposNoEfectivos.forEach((tiempo, idx) => {
      if (tiempo.horaFin) {
        console.log(`📌 Tiempo No Efectivo ${idx + 1} tiene horaFin: ${tiempo.horaFin}`);
        if (!ultimaHoraFinal || tiempo.horaFin > ultimaHoraFinal) {
          ultimaHoraFinal = tiempo.horaFin;
        }
      }
    });
    
    // Revisar mantenciones
    if (formData.tieneMantenciones && Array.isArray(formData.mantenciones)) {
      formData.mantenciones.forEach((mant, idx) => {
        if (mant.horaFin) {
          console.log(`📌 Mantención ${idx + 1} tiene horaFin: ${mant.horaFin}`);
          if (!ultimaHoraFinal || mant.horaFin > ultimaHoraFinal) {
            ultimaHoraFinal = mant.horaFin;
          }
        }
      });
    }

    // Si no encontramos ninguna hora final, usar fin de Inspección (08:30)
    if (!ultimaHoraFinal) {
      console.log('⚠️ No se encontró ninguna horaFin definida, retornando 08:30');
      return formData.tiemposProgramados.inspeccionEquipo.horaFin || '08:30';
    }

    console.log(`✅ Última hora final encontrada: ${ultimaHoraFinal}`);

    // ✅ LÓGICA DE COLACIÓN: Si la última actividad termina a las 13:00 o después (pero antes de 14:00),
    // la siguiente debe empezar a las 14:00 para respetar la colación
    const horaColacionInicio = formData.tiemposProgramados.colacion.horaInicio || '13:00';
    const horaColacionFin = formData.tiemposProgramados.colacion.horaFin || '14:00';
    
    if (ultimaHoraFinal >= horaColacionInicio && ultimaHoraFinal < horaColacionFin) {
      console.log(`🍽️ Última hora (${ultimaHoraFinal}) está en horario de colación, saltando a ${horaColacionFin}`);
      return horaColacionFin; // Empezar después de colación
    }

    console.log(`✅ Retornando última hora final: ${ultimaHoraFinal}`);
    return ultimaHoraFinal;
  };

  // Funciones para manejar actividades efectivas
  const addActividad = () => {
    const horaInicialNueva = calcularHoraInicialInteligente();
    
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
    const horaInicialNueva = calcularHoraInicialInteligente();
    
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

  // Funciones para manejar tiempos programados
  const updateTiempoProgramado = (tipo, field, value) => {
    // Si es un campo de hora, ajustar los minutos
    if ((field === 'horaInicio' || field === 'horaFin') && value) {
      value = ajustarMinutos(value);
    }
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

  // Funciones para manejar mantenciones
  const addMantencion = () => {
    const horaInicialNueva = calcularHoraInicialInteligente();
    
    setFormData({
      ...formData,
      mantenciones: [
        ...formData.mantenciones,
        { tipo: '', horaInicio: horaInicialNueva, horaFin: '' }
      ]
    });
  };

  const removeMantencion = (index) => {
    const newMantenciones = formData.mantenciones.filter((_, i) => i !== index);
    setFormData({ ...formData, mantenciones: newMantenciones });
  };

  const updateMantencion = (index, field, value) => {
    const newMantenciones = [...formData.mantenciones];
    if ((field === 'horaInicio' || field === 'horaFin') && value) {
      value = ajustarMinutos(value);
    }
    newMantenciones[index][field] = value;
    setFormData({ ...formData, mantenciones: newMantenciones });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    // Validaciones antes de enviar...
    let errores = [];
    
    // 1. Validar que cada actividad tenga todos los campos
    formData.actividadesEfectivas.forEach((act, idx) => {
      if (!act.actividad || !act.horaInicio || !act.horaFin) {
        errores.push(`Actividad Efectiva ${idx + 1}: Todos los campos son obligatorios`);
      }
    });
    
    // 2. Validar tiempos no efectivos
    formData.tiemposNoEfectivos.forEach((tiempo, idx) => {
      if (!tiempo.motivo || !tiempo.horaInicio || !tiempo.horaFin) {
        errores.push(`Tiempo No Efectivo ${idx + 1}: Todos los campos son obligatorios`);
      }
    });
    
    // 3. Validar tiempos programados (solo si tienen algún dato)
    const tp = formData.tiemposProgramados;
    
    // Charla de Seguridad: si tiene inicio o fin, debe tener ambos
    if ((tp.charlaSegurid.horaInicio && !tp.charlaSegurid.horaFin) || 
        (!tp.charlaSegurid.horaInicio && tp.charlaSegurid.horaFin)) {
      errores.push('Charla de Seguridad: Si se registra, debe tener hora de inicio y fin');
    }
    
    // Inspección de Equipo: si tiene inicio o fin, debe tener ambos
    if ((tp.inspeccionEquipo.horaInicio && !tp.inspeccionEquipo.horaFin) || 
        (!tp.inspeccionEquipo.horaInicio && tp.inspeccionEquipo.horaFin)) {
      errores.push('Inspección de Equipo: Si se registra, debe tener hora de inicio y fin');
    }
    
    // Colación: si tiene inicio o fin, debe tener ambos
    if ((tp.colacion.horaInicio && !tp.colacion.horaFin) || 
        (!tp.colacion.horaInicio && tp.colacion.horaFin)) {
      errores.push('Colación: Si se registra, debe tener hora de inicio y fin');
    }
    
    // 4. Si hay mantenciones, validar
    if (formData.tieneMantenciones) {
      formData.mantenciones.forEach((mant, idx) => {
        if (!mant.tipo || !mant.horaInicio || !mant.horaFin) {
          errores.push(`Mantención ${idx + 1}: Todos los campos son obligatorios`);
        }
      });
    }
    
    // 5. Validar que no haya errores de horarios
    if (horariosErrors.length > 0) {
      errores.push('Hay errores en los horarios. Por favor corrígelos antes de continuar.');
    }
    
    if (errores.length > 0) {
      alert('Por favor corrige los siguientes errores:\n\n' + errores.join('\n'));
      return;
    }
    
    onSubmit(e);
  };

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Header con máquina seleccionada */}
        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white p-4 sm:p-6 rounded-xl shadow-lg">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-lg bg-white/20 backdrop-blur-sm flex items-center justify-center">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-bold">Paso 2: Registro de Actividades</h2>
              <p className="text-indigo-100 text-sm">Máquina: {selectedMachine?.name || 'No seleccionada'}</p>
            </div>
          </div>
        </div>

        {/* SECCIÓN 1: Actividades Efectivas */}
        <div className="bg-white rounded-xl shadow-md p-4 sm:p-6 border-2 border-green-200">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <span className="text-3xl">✅</span>
              <h3 className="text-lg sm:text-xl font-bold text-slate-900">Actividades Efectivas</h3>
            </div>
            <button
              type="button"
              onClick={addActividad}
              className="px-3 sm:px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-semibold text-sm rounded-lg transition-all shadow-md"
            >
              + Agregar
            </button>
          </div>

          <div className="space-y-3">
            {formData.actividadesEfectivas.map((act, index) => {
              const errors = horariosErrors.find(e => e.index === index) || { horaInicio: '', horaFin: '', duracion: '', solapamiento: '' };
              const existingSlots = getExistingSlots('actividadEfectiva', index);
              
              return (
                <ActivityCard
                  key={index}
                  index={index}
                  data={act}
                  onUpdate={updateActividad}
                  onRemove={removeActividad}
                  errors={errors}
                  canRemove={formData.actividadesEfectivas.length > 1}
                  color="green"
                  labelActividad="Actividad"
                  placeholder="Ej: Excavación, Carga, etc."
                  onOpenTimeline={() => openTimelineModal(
                    'actividadEfectiva',
                    index,
                    `Actividad Efectiva ${index + 1}`,
                    act.horaInicio,
                    act.horaFin
                  )}
                  existingSlots={existingSlots}
                />
              );
            })}
          </div>
        </div>

        {/* SECCIÓN 2: Tiempos No Efectivos */}
        <div className="bg-white rounded-xl shadow-md p-4 sm:p-6 border-2 border-amber-200">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <span className="text-3xl">⏸️</span>
              <h3 className="text-lg sm:text-xl font-bold text-slate-900">Tiempos No Efectivos</h3>
            </div>
            <button
              type="button"
              onClick={addTiempoNoEfectivo}
              className="px-3 sm:px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-semibold text-sm rounded-lg transition-all shadow-md"
            >
              + Agregar
            </button>
          </div>

          <div className="space-y-3">
            {formData.tiemposNoEfectivos.map((tiempo, index) => {
              const existingSlots = getExistingSlots('tiempoNoEfectivo', index);
              
              return (
                <ActivityCard
                  key={index}
                  index={index}
                  data={tiempo}
                  onUpdate={updateTiempoNoEfectivo}
                  onRemove={removeTiempoNoEfectivo}
                  errors={{}}
                  canRemove={formData.tiemposNoEfectivos.length > 1}
                  color="amber"
                  labelActividad="Motivo"
                  placeholder="Ej: Espera por operador, falla mecánica, etc."
                  onOpenTimeline={() => openTimelineModal(
                    'tiempoNoEfectivo',
                    index,
                    `Tiempo No Efectivo ${index + 1}`,
                    tiempo.horaInicio,
                    tiempo.horaFin
                  )}
                  existingSlots={existingSlots}
                />
              );
            })}
          </div>
        </div>

        {/* SECCIÓN 3: Tiempos Programados */}
        <div className="bg-white rounded-xl shadow-md p-4 sm:p-6 border-2 border-blue-200">
          <div className="flex items-center gap-3 mb-4">
            <span className="text-3xl">⏰</span>
            <h3 className="text-lg sm:text-xl font-bold text-slate-900">Tiempos Programados</h3>
          </div>

          <div className="space-y-3">
            <TiempoProgramadoCard
              title="Charla de Seguridad"
              icon="🦺"
              data={formData.tiemposProgramados.charlaSegurid}
              onOpenTimeline={() => openTimelineModal(
                'charlaSegurid',
                null,
                'Charla de Seguridad',
                formData.tiemposProgramados.charlaSegurid.horaInicio,
                formData.tiemposProgramados.charlaSegurid.horaFin
              )}
              existingSlots={getExistingSlots('charlaSegurid')}
            />
            
            <TiempoProgramadoCard
              title="Inspección de Equipo"
              icon="🔍"
              data={formData.tiemposProgramados.inspeccionEquipo}
              onOpenTimeline={() => openTimelineModal(
                'inspeccionEquipo',
                null,
                'Inspección de Equipo',
                formData.tiemposProgramados.inspeccionEquipo.horaInicio,
                formData.tiemposProgramados.inspeccionEquipo.horaFin
              )}
              existingSlots={getExistingSlots('inspeccionEquipo')}
            />
            
            <TiempoProgramadoCard
              title="Colación"
              icon="🍽️"
              data={formData.tiemposProgramados.colacion}
              onOpenTimeline={() => openTimelineModal(
                'colacion',
                null,
                'Colación',
                formData.tiemposProgramados.colacion.horaInicio,
                formData.tiemposProgramados.colacion.horaFin
              )}
              existingSlots={getExistingSlots('colacion')}
            />
          </div>
        </div>

        {/* SECCIÓN 4: Mantenciones (Opcional) */}
        <div className="bg-white rounded-xl shadow-md p-4 sm:p-6 border-2 border-orange-200">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <span className="text-3xl">🔧</span>
              <h3 className="text-lg sm:text-xl font-bold text-slate-900">Mantenciones</h3>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.tieneMantenciones}
                onChange={(e) => setFormData({ ...formData, tieneMantenciones: e.target.checked })}
                className="w-5 h-5 text-orange-600 border-gray-300 rounded focus:ring-orange-500"
              />
              <span className="text-sm font-semibold text-slate-700">¿Hubo mantenciones?</span>
            </label>
          </div>

          {formData.tieneMantenciones && (
            <>
              <button
                type="button"
                onClick={addMantencion}
                className="w-full mb-3 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white font-semibold text-sm rounded-lg transition-all shadow-md"
              >
                + Agregar Mantención
              </button>

              <div className="space-y-3">
                {formData.mantenciones.map((mant, index) => {
                  const existingSlots = getExistingSlots('mantencion', index);
                  
                  return (
                    <div key={index} className="bg-orange-50 border-2 border-orange-200 rounded-xl p-3 sm:p-4">
                      <div className="space-y-3">
                        <div>
                          <label className="block text-[10px] sm:text-xs font-bold text-slate-700 mb-1">
                            Tipo de Mantención
                          </label>
                          <input
                            type="text"
                            value={mant.tipo}
                            onChange={(e) => updateMantencion(index, 'tipo', e.target.value)}
                            placeholder="Ej: Preventiva, Correctiva, etc."
                            className="input-modern w-full text-sm"
                          />
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => openTimelineModal(
                              'mantencion',
                              index,
                              `Mantención ${index + 1}`,
                              mant.horaInicio,
                              mant.horaFin
                            )}
                            className="flex-1 px-4 py-4 sm:py-3 bg-indigo-600 active:bg-indigo-700 text-white font-semibold text-sm rounded-xl sm:rounded-lg transition-all shadow-md flex items-center justify-center gap-2"
                          >
                            <svg className="w-6 h-6 sm:w-4 sm:h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <span className="text-base sm:text-sm">Seleccionar Horario</span>
                          </button>
                        </div>

                        {mant.horaInicio && mant.horaFin && (
                          <div className="text-center py-3 sm:py-2 px-3 bg-orange-100 rounded-xl sm:rounded-lg">
                            <span className="text-sm font-bold text-orange-700">
                              {mant.horaInicio} - {mant.horaFin} ({calcularDuracion(mant.horaInicio, mant.horaFin)})
                            </span>
                          </div>
                        )}

                        {formData.mantenciones.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeMantencion(index)}
                            className="w-full py-2 bg-red-100 hover:bg-red-200 text-red-700 font-semibold text-sm rounded-lg transition-all"
                          >
                            🗑️ Eliminar
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Botones de navegación */}
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            type="button"
            onClick={onBack}
            className="flex-1 px-6 py-3 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold rounded-lg transition-all"
          >
            ← Volver
          </button>
          <button
            type="submit"
            disabled={isLoading || horariosErrors.length > 0}
            className="flex-1 px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 disabled:from-slate-300 disabled:to-slate-300 text-white font-bold rounded-lg transition-all shadow-lg disabled:shadow-none"
          >
            {isLoading ? 'Guardando...' : 'Guardar Registro →'}
          </button>
        </div>
      </form>

      {/* Modal de Timeline */}
      <TimelineModal
        key={`${timelineModal.type}-${timelineModal.index}-${timelineModal.initialStart}`}
        isOpen={timelineModal.isOpen}
        onClose={closeTimelineModal}
        onConfirm={handleTimelineConfirm}
        initialStart={timelineModal.initialStart}
        initialEnd={timelineModal.initialEnd}
        title={timelineModal.title}
        existingSlots={timelineModal.isOpen ? getExistingSlots(timelineModal.type, timelineModal.index) : []}
      />
    </>
  );
}

// Componente ActivityCard actualizado con botón de timeline
function ActivityCard({ index, data, onUpdate, onRemove, errors, canRemove, color, labelActividad, placeholder, onOpenTimeline, existingSlots }) {
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

        {/* Botón para abrir timeline */}
        <button
          type="button"
          onClick={onOpenTimeline}
          className="w-full px-4 py-4 sm:py-3 bg-indigo-600 active:bg-indigo-700 text-white font-semibold text-sm sm:text-sm rounded-xl sm:rounded-lg transition-all shadow-md flex items-center justify-center gap-2"
        >
          <svg className="w-6 h-6 sm:w-5 sm:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-base sm:text-sm">Seleccionar Horario</span>
        </button>

        {/* Mostrar horario seleccionado */}
        {data.horaInicio && data.horaFin && !errors.duracion && (
          <div className={`text-center py-3 sm:py-2 px-3 ${c.bg} rounded-xl sm:rounded-lg border-2 ${c.border}`}>
            <span className={`text-sm sm:text-sm font-bold ${c.text}`}>
              {data.horaInicio} - {data.horaFin} • Duración: {calcularDuracion(data.horaInicio, data.horaFin)}
            </span>
          </div>
        )}

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

// Componente TiempoProgramadoCard (para tiempos programados manuales)
function TiempoProgramadoCard({ title, icon, data, onOpenTimeline, existingSlots }) {
  return (
    <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-3 sm:p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-2xl">{icon}</span>
        <div className="font-bold text-sm sm:text-base text-slate-900">{title}</div>
      </div>
      
      {/* Botón para abrir timeline */}
      <button
        type="button"
        onClick={onOpenTimeline}
        className="w-full px-4 py-4 sm:py-3 bg-indigo-600 active:bg-indigo-700 text-white font-semibold text-sm rounded-xl sm:rounded-lg transition-all shadow-md flex items-center justify-center gap-2"
      >
        <svg className="w-6 h-6 sm:w-5 sm:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span className="text-base sm:text-sm">Seleccionar Horario</span>
      </button>

      {/* Mostrar horario seleccionado */}
      {data.horaInicio && data.horaFin && (
        <div className="text-center py-3 sm:py-2 px-3 bg-blue-100 rounded-xl sm:rounded-lg border-2 border-blue-300 mt-3">
          <span className="text-sm font-bold text-blue-700">
            {data.horaInicio} - {data.horaFin} • Duración: {calcularDuracion(data.horaInicio, data.horaFin)}
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
