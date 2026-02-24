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

  const handleTimelineClick = (e) => {
    if (isDragging) return; // ignore clicks during drag
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = x / rect.width;
    
    const minMinutes = 7 * 60;
    const maxMinutes = 19 * 60;
    const totalMinutes = maxMinutes - minMinutes;
    
    let clicked = minMinutes + (percentage * totalMinutes);
    clicked = roundToNearest15(clicked);
    clicked = Math.max(minMinutes, Math.min(maxMinutes, clicked));
    const clickedTime = minutesToTime(clicked);

    if (!startTime || !endTime) {
      // Primer clic: fijar inicio, dejar fin libre
      setStartTime(clickedTime);
      setEndTime(null);
    } else {
      const sMin = timeToMinutes(startTime);
      if (clicked > sMin) {
        // Clic a la derecha del inicio → ajustar fin
        setEndTime(clickedTime);
      } else {
        // Clic a la izquierda → mover inicio, limpiar fin
        setStartTime(clickedTime);
        setEndTime(null);
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

  const isOverlapping = () => {
    if (!startTime || !endTime) return false;
    const start = timeToMinutes(startTime);
    const end = timeToMinutes(endTime);
    
    return existingSlots.some(slot => {
      const slotStart = timeToMinutes(slot.start);
      const slotEnd = timeToMinutes(slot.end);
      return start < slotEnd && end > slotStart;
    });
  };

  const handleConfirm = () => {
    if (startTime && endTime && timeToMinutes(startTime) < timeToMinutes(endTime)) {
      onConfirm(startTime, endTime);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50">
      <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full sm:max-w-4xl max-h-[95vh] sm:max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="sticky top-0 bg-gradient-to-r from-slate-800 to-slate-900 text-white p-4 sm:p-6 rounded-t-3xl sm:rounded-t-2xl">
          <div className="sm:hidden w-12 h-1.5 bg-white/30 rounded-full mx-auto mb-2 mt-1"></div>
          
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <h2 className="text-xl sm:text-2xl font-bold">{title || "Seleccionar Horario"}</h2>
              <p className="text-slate-300 text-xs sm:text-sm mt-1">Arrastra o toca para establecer</p>
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
              <div className="bg-slate-50 border-2 border-slate-200 rounded-xl p-3 sm:p-4 text-center">
                <div className="text-[10px] sm:text-xs font-semibold text-slate-600 mb-1">DURACIÓN</div>
                <div className="text-lg sm:text-2xl font-bold text-slate-900 leading-tight">{calculateDuration()}</div>
              </div>
              <div className="bg-slate-50 border-2 border-slate-200 rounded-xl p-3 sm:p-4 text-center">
                <div className="text-[10px] sm:text-xs font-semibold text-slate-600 mb-1">FIN</div>
                <div className="text-lg sm:text-2xl font-bold text-slate-900 leading-tight">{formatTime12h(endTime)}</div>
                <div className="text-[9px] text-slate-500 mt-0.5">Ajustable</div>
              </div>
            </div>
          )}

          {isOverlapping() && (
            <div className="bg-slate-50 border-2 border-slate-200 rounded-xl p-3 sm:p-4 flex items-start gap-2 sm:gap-3">
              <svg className="w-5 h-5 sm:w-6 sm:h-6 text-slate-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" />
              </svg>
              <div className="flex-1">
                <div className="font-bold text-slate-900 text-sm sm:text-base">⚠️ Horario Superpuesto</div>
                <div className="text-xs sm:text-sm text-slate-600 mt-0.5">Este horario se superpone con otra actividad</div>
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

              {/* Slots existentes (en gris) */}
              {existingSlots.map((slot, idx) => {
                const slotStart = getPosition(slot.start);
                const slotEnd = getPosition(slot.end);
                const slotWidth = slotEnd - slotStart;
                
                return (
                  <div
                    key={idx}
                    className="absolute top-0 bottom-0 bg-slate-300/60 border-2 border-slate-400 rounded"
                    style={{
                      left: `${slotStart}%`,
                      width: `${slotWidth}%`
                    }}
                  >
                    <div className="absolute inset-0 flex items-center justify-center px-1">
                      <span className="text-[9px] sm:text-xs font-semibold text-slate-600 truncate">
                        {slot.label || 'Ocupado'}
                      </span>
                    </div>
                  </div>
                );
              })}

              {/* Rango seleccionado */}
              {startTime && endTime && width > 0 && (
                <div
                  className="absolute top-0 bottom-0 bg-gradient-to-r from-slate-600 to-slate-800 rounded shadow-lg transition-all"
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
                      {formatTime12h(startTime)} - {formatTime12h(endTime)}
                    </span>
                  </div>

                  {/* Handle de fin (arrastrable) */}
                  <div
                    className="absolute right-0 top-0 bottom-0 w-6 sm:w-3 bg-slate-500 cursor-ew-resize rounded-r hover:bg-slate-500 active:bg-slate-700 transition-colors flex items-center justify-center"
                    onMouseDown={(e) => handleMouseDown(e, 'end')}
                    onTouchStart={(e) => { e.stopPropagation(); handleMouseDown(e.touches[0], 'end'); }}
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
                    setStartTime(newStart || null);
                    // Si el fin actual es menor o igual al nuevo inicio, limpiarlo
                    if (newStart && endTime && timeToMinutes(newStart) >= timeToMinutes(endTime)) {
                      setEndTime(null);
                    }
                  }}
                  className="w-full px-3 sm:px-4 py-3 sm:py-3 text-base border-2 border-slate-200 rounded-lg focus:border-slate-500 focus:ring-2 focus:ring-slate-200 transition-all"
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
                  className="w-full px-3 sm:px-4 py-3 sm:py-3 text-base border-2 border-slate-200 rounded-lg focus:border-slate-500 focus:ring-2 focus:ring-slate-200 transition-all"
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
            disabled={!startTime || !endTime || timeToMinutes(startTime) >= timeToMinutes(endTime)}
            className="order-1 sm:order-2 px-8 py-4 sm:py-3 bg-gradient-to-r from-slate-800 to-slate-900 active:from-slate-700 active:to-slate-800 disabled:from-slate-300 disabled:to-slate-300 text-white font-bold rounded-xl sm:rounded-lg transition-all shadow-lg disabled:shadow-none text-base"
          >
            ✓ Confirmar Horario
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
  const [timelineModal, setTimelineModal] = useState({
    isOpen: false, type: null, index: null, title: '', initialStart: '', initialEnd: ''
  });
  


  // ─── UTILIDADES ────────────────────────────────────────────────────────────

  // Convierte "HH:MM" → minutos desde medianoche
  const toMin = (t) => {
    if (!t || !t.includes(':')) return 0;
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };

  // Convierte minutos → "HH:MM"
  const toTime = (min) => {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
  };

  // Redondea "HH:MM" al múltiplo de 15 más cercano, forzado dentro de [07:00, 19:00]
  const snapTo15 = (t) => {
    if (!t) return t;
    const raw = toMin(t);
    const snapped = Math.round(raw / 15) * 15;
    const clamped = Math.max(7 * 60, Math.min(19 * 60, snapped));
    return toTime(clamped);
  };

  // Devuelve todos los slots ocupados como [{start, end, label}], excluyendo uno opcional
  const getAllSlots = (excludeType = null, excludeIndex = -1) => {
    const slots = [];
    const push = (ini, fin, label, type, idx) => {
      if (ini && fin && !(type === excludeType && idx === excludeIndex)) {
        slots.push({ start: ini, end: fin, label });
      }
    };
    formData.actividadesEfectivas.forEach((a, i) =>
      push(a.horaInicio, a.horaFin, `Act. ${i+1}`, 'actividadEfectiva', i));
    formData.tiemposNoEfectivos.forEach((t, i) =>
      push(t.horaInicio, t.horaFin, `No Efec. ${i+1}`, 'tiempoNoEfectivo', i));
    if (formData.tieneMantenciones) {
      formData.mantenciones.forEach((m, i) =>
        push(m.horaInicio, m.horaFin, `Mant. ${i+1}`, 'mantencion', i));
    }
    const tp = formData.tiemposProgramados;
    push(tp.charlaSegurid?.horaInicio,  tp.charlaSegurid?.horaFin,  'Charla',    'charlaSegurid',    -1);
    push(tp.inspeccionEquipo?.horaInicio, tp.inspeccionEquipo?.horaFin, 'Inspección', 'inspeccionEquipo', -1);
    push(tp.colacion?.horaInicio,       tp.colacion?.horaFin,       'Colación',  'colacion',         -1);
    return slots;
  };

  // Verifica si un rango [s,e] se superpone con algún slot existente
  const overlapsAny = (s, e, slots) =>
    slots.some(sl => toMin(s) < toMin(sl.end) && toMin(e) > toMin(sl.start));

  // ─── INICIO SUGERIDO ────────────────────────────────────────────────────────

  // Calcula el inicio sugerido para una actividad nueva o que se está editando.
  // Regla: el mayor horaFin de todas las actividades existentes (excepto la propia).
  // Si no hay ninguna, usa el fin de Inspección o Charla como punto de arranque.
  const getSuggestedStart = (type, index) => {
    let maxFin = 0;
    let hasAny = false;

    const check = (fin, t, i) => {
      if (fin && !(t === type && i === index)) {
        hasAny = true;
        if (toMin(fin) > maxFin) maxFin = toMin(fin);
      }
    };

    formData.actividadesEfectivas.forEach((a, i) => check(a.horaFin, 'actividadEfectiva', i));
    formData.tiemposNoEfectivos.forEach((t, i) => check(t.horaFin, 'tiempoNoEfectivo', i));
    if (formData.tieneMantenciones) {
      formData.mantenciones.forEach((m, i) => check(m.horaFin, 'mantencion', i));
    }

    if (!hasAny) {
      // Fallback: fin de inspección > fin charla > 08:30
      const tp = formData.tiemposProgramados;
      const candidates = [
        tp.inspeccionEquipo?.horaFin,
        tp.charlaSegurid?.horaFin,
      ].filter(Boolean);
      if (candidates.length) return candidates.sort().at(-1);
      return '08:30';
    }

    return toTime(maxFin);
  };

  // ─── MODAL ──────────────────────────────────────────────────────────────────

  const openTimelineModal = (type, index, title, currentStart, currentEnd) => {
    // Si ya tiene horario confirmado → abrir con esos valores para editar
    // Si no tiene horario → sugerir el siguiente slot libre
    const hasTime = currentStart && currentEnd;
    const suggested = hasTime ? currentStart : getSuggestedStart(type, index);
    setTimelineModal({
      isOpen: true, type, index, title,
      initialStart: suggested,
      initialEnd: hasTime ? currentEnd : suggested,
    });
  };

  const closeTimelineModal = () =>
    setTimelineModal({ isOpen: false, type: null, index: null, title: '', initialStart: '', initialEnd: '' });

  // getExistingSlots: alias para el modal (excluye la actividad que se está editando)
  const getExistingSlots = (type, index = -1) => getAllSlots(type, index);

  // ─── CONFIRMAR HORARIO ──────────────────────────────────────────────────────

  // Lógica al confirmar en el modal:
  // 1. Si el rango toca la colación → dividir automáticamente en 2 partes
  //    Parte A: startTime → inicio colación
  //    Parte B: fin colación → endTime
  //    (solo se crea la parte que tenga duración > 0)
  // 2. Si no toca colación → guardar directamente
  // No se permite guardar si se superpone con otro slot ya ocupado.
  const handleTimelineConfirm = (startTime, endTime) => {
    const { type, index } = timelineModal;

    // Snap a 15 min por seguridad (el modal ya lo hace, pero por doble garantía)
    const s = snapTo15(startTime);
    const e = snapTo15(endTime);

    if (toMin(s) >= toMin(e)) return; // nunca inicio >= fin

    const col = formData.tiemposProgramados.colacion;
    const colIni = col?.horaInicio || null;
    const colFin = col?.horaFin    || null;

    const tiposConSplit = ['actividadEfectiva', 'tiempoNoEfectivo', 'mantencion'];
    const tocaColacion  = colIni && colFin &&
      toMin(s) < toMin(colFin) && toMin(e) > toMin(colIni);

    if (tocaColacion && tiposConSplit.includes(type)) {
      // Calcular las dos partes
      const parteA = toMin(s) < toMin(colIni)
        ? { ini: s, fin: colIni } : null;
      const parteB = toMin(e) > toMin(colFin)
        ? { ini: colFin, fin: e } : null;

      const applyColaSplit = (base, lista, key) => {
        const nueva = [...lista];
        if (parteA && parteB) {
          nueva[index] = { ...base, horaInicio: parteA.ini, horaFin: parteA.fin };
          nueva.splice(index + 1, 0, { ...base, horaInicio: parteB.ini, horaFin: parteB.fin });
        } else if (parteA) {
          nueva[index] = { ...base, horaInicio: parteA.ini, horaFin: parteA.fin };
        } else if (parteB) {
          nueva[index] = { ...base, horaInicio: parteB.ini, horaFin: parteB.fin };
        }
        setFormData({ ...formData, [key]: nueva });
      };

      if      (type === 'actividadEfectiva') applyColaSplit(formData.actividadesEfectivas[index], formData.actividadesEfectivas, 'actividadesEfectivas');
      else if (type === 'tiempoNoEfectivo')  applyColaSplit(formData.tiemposNoEfectivos[index],   formData.tiemposNoEfectivos,   'tiemposNoEfectivos');
      else if (type === 'mantencion')        applyColaSplit(formData.mantenciones[index],          formData.mantenciones,         'mantenciones');

      closeTimelineModal();
      return;
    }

    // Sin colación: guardar ambos campos en un único setFormData para evitar
    // que el segundo setFormData sobreescriba al primero con el estado anterior.
    const saveListItem = (lista, key) => {
      const nueva = [...lista];
      nueva[index] = { ...nueva[index], horaInicio: s, horaFin: e };
      setFormData({ ...formData, [key]: nueva });
    };

    if      (type === 'actividadEfectiva') saveListItem(formData.actividadesEfectivas, 'actividadesEfectivas');
    else if (type === 'tiempoNoEfectivo')  saveListItem(formData.tiemposNoEfectivos,   'tiemposNoEfectivos');
    else if (type === 'mantencion')        saveListItem(formData.mantenciones,          'mantenciones');
    else if (type === 'charlaSegurid')     { updateTiempoProgramado('charlaSegurid', 'horaInicio', s); updateTiempoProgramado('charlaSegurid', 'horaFin', e); }
    else if (type === 'inspeccionEquipo')  { updateTiempoProgramado('inspeccionEquipo', 'horaInicio', s); updateTiempoProgramado('inspeccionEquipo', 'horaFin', e); }
    else if (type === 'colacion')          { updateTiempoProgramado('colacion', 'horaInicio', s); updateTiempoProgramado('colacion', 'horaFin', e); }
  };

  // ─── ESTADO DE ERRORES EN TIEMPO REAL ───────────────────────────────────────

  useEffect(() => {
    const errors = [];
    const allSlots = getAllSlots();

    const checkEntry = (ini, fin, tipo, indice, nombre) => {
      if (!ini || !fin) return;
      const sMin = toMin(ini), eMin = toMin(fin);
      const err = { index: indice, solapamiento: '' };

      if (sMin >= eMin) {
        err.solapamiento = 'La hora de inicio debe ser menor que la hora de fin';
        errors.push({ ...err, nombre });
        return;
      }
      // Verificar superposición con todos los demás slots
      const others = allSlots.filter(sl =>
        !(sl.start === ini && sl.end === fin) // excluir el mismo slot exacto
      );
      if (overlapsAny(ini, fin, others)) {
        err.solapamiento = 'Se superpone con otra actividad';
        errors.push({ ...err, nombre });
      }
    };

    formData.actividadesEfectivas.forEach((a, i) =>
      checkEntry(a.horaInicio, a.horaFin, 'actividadEfectiva', i, `Actividad ${i+1}`));

    setHorariosErrors(errors);
  }, [
    formData.actividadesEfectivas.map(a => a.horaInicio + a.horaFin).join('|'),
    formData.tiemposNoEfectivos.map(t => t.horaInicio + t.horaFin).join('|'),
    formData.mantenciones.map(m => m.horaInicio + m.horaFin).join('|'),
    formData.tiemposProgramados.charlaSegurid.horaInicio,
    formData.tiemposProgramados.inspeccionEquipo.horaInicio,
    formData.tiemposProgramados.colacion.horaInicio,
    formData.tieneMantenciones,
  ]);

  // ─── CRUD ACTIVIDADES ────────────────────────────────────────────────────────

  const calcularHoraInicialInteligente = () => getSuggestedStart('__new__', -1);

  const resetTodasActividades = () => {
    if (!window.confirm('¿Estás seguro? Se eliminarán todas las actividades efectivas, tiempos no efectivos y mantenciones. Los tiempos programados se mantendrán.')) return;
    setFormData({
      ...formData,
      actividadesEfectivas: [{ actividad: '', horaInicio: '', horaFin: '' }],
      tiemposNoEfectivos: [{ motivo: '', horaInicio: '', horaFin: '' }],
      mantenciones: [],
      tieneMantenciones: false,
    });
  };

  const addActividad = () => setFormData({ ...formData, actividadesEfectivas: [
    ...formData.actividadesEfectivas,
    { actividad: '', horaInicio: calcularHoraInicialInteligente(), horaFin: '' }
  ]});

  const removeActividad = (index) => setFormData({ ...formData,
    actividadesEfectivas: formData.actividadesEfectivas.filter((_, i) => i !== index) });

  const clearActividad = (index) => {
    const updated = [...formData.actividadesEfectivas];
    updated[index] = { actividad: '', horaInicio: '', horaFin: '' };
    setFormData({ ...formData, actividadesEfectivas: updated });
  };

  const updateActividad = (index, field, value) => {
    const list = [...formData.actividadesEfectivas];
    list[index] = { ...list[index], [field]: (field === 'horaInicio' || field === 'horaFin') ? snapTo15(value) : value };
    setFormData({ ...formData, actividadesEfectivas: list });
  };

  // ─── CRUD TIEMPOS NO EFECTIVOS ───────────────────────────────────────────────

  const addTiempoNoEfectivo = () => setFormData({ ...formData, tiemposNoEfectivos: [
    ...formData.tiemposNoEfectivos,
    { motivo: '', horaInicio: calcularHoraInicialInteligente(), horaFin: '' }
  ]});

  const removeTiempoNoEfectivo = (index) => setFormData({ ...formData,
    tiemposNoEfectivos: formData.tiemposNoEfectivos.filter((_, i) => i !== index) });

  const clearTiempoNoEfectivo = (index) => {
    const updated = [...formData.tiemposNoEfectivos];
    updated[index] = { motivo: '', horaInicio: '', horaFin: '' };
    setFormData({ ...formData, tiemposNoEfectivos: updated });
  };

  const updateTiempoNoEfectivo = (index, field, value) => {
    const list = [...formData.tiemposNoEfectivos];
    list[index] = { ...list[index], [field]: (field === 'horaInicio' || field === 'horaFin') ? snapTo15(value) : value };
    setFormData({ ...formData, tiemposNoEfectivos: list });
  };

  // ─── CRUD TIEMPOS PROGRAMADOS ────────────────────────────────────────────────

  const updateTiempoProgramado = (tipo, field, value) => {
    setFormData({ ...formData, tiemposProgramados: { ...formData.tiemposProgramados,
      [tipo]: { ...formData.tiemposProgramados[tipo],
        [field]: (field === 'horaInicio' || field === 'horaFin') ? snapTo15(value) : value
      }
    }});
  };

  const clearTiempoProgramado = (key) => {
    setFormData({ ...formData, tiemposProgramados: {
      ...formData.tiemposProgramados, [key]: { horaInicio: '', horaFin: '' }
    }});
  };

  // ─── CRUD MANTENCIONES ───────────────────────────────────────────────────────

  const addMantencion = () => setFormData({ ...formData, mantenciones: [
    ...formData.mantenciones,
    { tipo: '', horaInicio: calcularHoraInicialInteligente(), horaFin: '' }
  ]});

  const removeMantencion = (index) => setFormData({ ...formData,
    mantenciones: formData.mantenciones.filter((_, i) => i !== index) });

  const clearMantencion = (index) => {
    const updated = [...formData.mantenciones];
    updated[index] = { tipo: '', descripcion: '', horaInicio: '', horaFin: '' };
    setFormData({ ...formData, mantenciones: updated });
  };

  const updateMantencion = (index, field, value) => {
    const list = [...formData.mantenciones];
    list[index] = { ...list[index], [field]: (field === 'horaInicio' || field === 'horaFin') ? snapTo15(value) : value };
    setFormData({ ...formData, mantenciones: list });
  };

  // ─── SUBMIT ──────────────────────────────────────────────────────────────────

  const handleSubmit = (e) => {
    e.preventDefault();
    const errores = [];

    // ── Verificar que al menos UNA actividad/tarea de cualquier tipo esté completa ──
    const actividadCompleta = formData.actividadesEfectivas.some(
      a => a.actividad && a.horaInicio && a.horaFin
    );
    const tiempoNoEfectivoCompleto = formData.tiemposNoEfectivos.some(
      t => t.motivo && t.horaInicio && t.horaFin
    );
    const mantencionCompleta = formData.tieneMantenciones && formData.mantenciones.some(
      m => m.tipo && m.horaInicio && m.horaFin
    );

    if (!actividadCompleta && !tiempoNoEfectivoCompleto && !mantencionCompleta) {
      errores.push('❌ Debe registrar al menos una actividad, tiempo no efectivo o mantención completa (con tipo/motivo y horario)');
    }

    // Validar filas de actividades efectivas que estén PARCIALMENTE llenas
    formData.actividadesEfectivas.forEach((act, idx) => {
      const tieneAlgo = act.actividad || act.horaInicio || act.horaFin;
      if (tieneAlgo) {
        if (!act.actividad) errores.push(`Actividad Efectiva ${idx+1}: falta seleccionar la actividad`);
        if (!act.horaInicio || !act.horaFin) errores.push(`Actividad Efectiva ${idx+1}: falta el horario`);
      }
    });

    // Validar tiempos no efectivos que estén PARCIALMENTE llenos
    formData.tiemposNoEfectivos.forEach((t, idx) => {
      const tieneAlgo = t.motivo || t.horaInicio || t.horaFin;
      if (tieneAlgo) {
        if (!t.motivo) errores.push(`Tiempo No Efectivo ${idx+1}: falta el motivo`);
        if (!t.horaInicio || !t.horaFin) errores.push(`Tiempo No Efectivo ${idx+1}: falta el horario`);
      }
    });

    // Tiempos programados: si tiene un lado, debe tener ambos
    const tp = formData.tiemposProgramados;
    [
      ['Charla de Seguridad', tp.charlaSegurid],
      ['Inspección de Equipo', tp.inspeccionEquipo],
      ['Colación', tp.colacion],
    ].forEach(([nombre, val]) => {
      const tieneIni = !!val.horaInicio, tieneFin = !!val.horaFin;
      if (tieneIni !== tieneFin)
        errores.push(`${nombre}: si se registra debe tener hora de inicio y fin`);
    });

    // Mantenciones
    if (formData.tieneMantenciones) {
      formData.mantenciones.forEach((m, idx) => {
        if (!m.tipo) errores.push(`Mantención ${idx+1}: falta el tipo`);
        if (!m.horaInicio || !m.horaFin) errores.push(`Mantención ${idx+1}: falta el horario`);
      });
    }

    // Superposiciones detectadas en tiempo real
    if (horariosErrors.length > 0)
      errores.push('Hay superposiciones en los horarios. Usa el botón "Vaciar" para corregirlas.');

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
        <div className="bg-gradient-to-r from-slate-800 to-slate-900 text-white p-4 sm:p-6 rounded-xl shadow-lg">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-lg bg-white/20 backdrop-blur-sm flex items-center justify-center">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="flex-1">
              <h2 className="text-xl sm:text-2xl font-bold">Paso 2: Registro de Actividades</h2>
              <p className="text-slate-300 text-sm">Máquina: {selectedMachine?.name || 'No seleccionada'}</p>
            </div>
            <button
              type="button"
              onClick={resetTodasActividades}
              className="flex items-center gap-1.5 px-3 py-2 bg-white/10 hover:bg-red-500/80 text-white/70 hover:text-white text-xs font-semibold rounded-lg transition-all border border-white/20 hover:border-red-400"
              title="Vaciar todas las actividades y comenzar de cero"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Vaciar todo
            </button>
          </div>
        </div>

        {/* SECCIÓN 1: Actividades Efectivas */}
        <div className="bg-white rounded-xl shadow-md p-4 sm:p-6 border-2 border-red-200">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <svg className="w-7 h-7 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
              <h3 className="text-lg sm:text-xl font-bold text-slate-900">Actividades Efectivas</h3>
            </div>
            <button
              type="button"
              onClick={addActividad}
              className="px-3 sm:px-4 py-2 bg-red-700 hover:bg-red-800 text-white font-semibold text-sm rounded-lg transition-all shadow-md"
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
                  color="slate"
                  labelActividad="Actividad"
                  placeholder="Ej: Excavación, Carga, etc."
                  onOpenTimeline={() => openTimelineModal(
                    'actividadEfectiva',
                    index,
                    `Actividad Efectiva ${index + 1}`,
                    act.horaInicio,
                    act.horaFin
                  )}
                  onClear={() => clearActividad(index)}
                  existingSlots={existingSlots}
                  opciones={['Trabajos en Plataforma', 'Trabajos en Camino', 'Trabajos en Campamento']}
                />
              );
            })}
          </div>
        </div>

        {/* SECCIÓN 2: Tiempos No Efectivos */}
        <div className="bg-white rounded-xl shadow-md p-4 sm:p-6 border-2 border-amber-300">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <svg className="w-7 h-7 text-amber-600" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>
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
                  color="slate"
                  labelActividad="Motivo"
                  placeholder="Ej: Espera por operador, falla mecánica, etc."
                  onOpenTimeline={() => openTimelineModal(
                    'tiempoNoEfectivo',
                    index,
                    `Tiempo No Efectivo ${index + 1}`,
                    tiempo.horaInicio,
                    tiempo.horaFin
                  )}
                  onClear={() => clearTiempoNoEfectivo(index)}
                  existingSlots={existingSlots}
                  opciones={['Sin Postura', 'Factor climático', 'Traslado de Equipo']}
                />
              );
            })}
          </div>
        </div>

        {/* SECCIÓN 3: Tiempos Programados */}
        <div className="bg-white rounded-xl shadow-md p-4 sm:p-6 border-2 border-blue-200">
          <div className="flex items-center gap-3 mb-4">
            <svg className="w-7 h-7 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9"/><path strokeLinecap="round" d="M12 7v5l3 3"/></svg>
            <h3 className="text-lg sm:text-xl font-bold text-slate-900">Tiempos Programados</h3>
          </div>

          <div className="space-y-3">
            <TiempoProgramadoCard
              title="Charla de Seguridad"
              
              data={formData.tiemposProgramados.charlaSegurid}
              onOpenTimeline={() => openTimelineModal(
                'charlaSegurid',
                null,
                'Charla de Seguridad',
                formData.tiemposProgramados.charlaSegurid.horaInicio,
                formData.tiemposProgramados.charlaSegurid.horaFin
              )}
              onClear={() => clearTiempoProgramado('charlaSegurid')}
              existingSlots={getExistingSlots('charlaSegurid')}
            />
            
            <TiempoProgramadoCard
              title="Inspección de Equipo"
              
              data={formData.tiemposProgramados.inspeccionEquipo}
              onOpenTimeline={() => openTimelineModal(
                'inspeccionEquipo',
                null,
                'Inspección de Equipo',
                formData.tiemposProgramados.inspeccionEquipo.horaInicio,
                formData.tiemposProgramados.inspeccionEquipo.horaFin
              )}
              onClear={() => clearTiempoProgramado('inspeccionEquipo')}
              existingSlots={getExistingSlots('inspeccionEquipo')}
            />
            
            <TiempoProgramadoCard
              title="Colación"
              
              data={formData.tiemposProgramados.colacion}
              onOpenTimeline={() => openTimelineModal(
                'colacion',
                null,
                'Colación',
                formData.tiemposProgramados.colacion.horaInicio,
                formData.tiemposProgramados.colacion.horaFin
              )}
              onClear={() => clearTiempoProgramado('colacion')}
              existingSlots={getExistingSlots('colacion')}
            />
          </div>
        </div>

        {/* SECCIÓN 4: Mantenciones (Opcional) */}
        <div className="bg-white rounded-xl shadow-md p-4 sm:p-6 border-2 border-amber-200">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <svg className="w-7 h-7 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path strokeLinecap="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
              <h3 className="text-lg sm:text-xl font-bold text-slate-900">Mantenciones</h3>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.tieneMantenciones}
                onChange={(e) => setFormData({ ...formData, tieneMantenciones: e.target.checked })}
                className="w-5 h-5 text-slate-600 border-gray-300 rounded focus:ring-slate-400"
              />
              <span className="text-sm font-semibold text-slate-700">¿Hubo mantenciones?</span>
            </label>
          </div>

          {formData.tieneMantenciones && (
            <>
              <button
                type="button"
                onClick={addMantencion}
                className="w-full mb-3 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white font-semibold text-sm rounded-lg transition-all shadow-md"
              >
                + Agregar Mantención
              </button>

              <div className="space-y-3">
                {formData.mantenciones.map((mant, index) => {
                  const existingSlots = getExistingSlots('mantencion', index);
                  
                  return (
                    <div key={index} className="bg-slate-50 border-2 border-slate-200 rounded-xl p-3 sm:p-4">
                      <div className="space-y-3">
                        <div>
                          <label className="block text-[10px] sm:text-xs font-bold text-slate-700 mb-1">
                            Tipo de Mantención
                          </label>
                          <select
                            value={mant.tipo}
                            onChange={(e) => updateMantencion(index, 'tipo', e.target.value)}
                            className="input-modern w-full text-sm"
                          >
                            <option value="">Seleccionar...</option>
                            <option value="Programada">Programada</option>
                            <option value="No Programada">No Programada</option>
                          </select>
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
                            className="flex-1 px-4 py-4 sm:py-3 bg-slate-800 active:bg-slate-700 text-white font-semibold text-sm rounded-xl sm:rounded-lg transition-all shadow-md flex items-center justify-center gap-2"
                          >
                            <svg className="w-6 h-6 sm:w-4 sm:h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <span className="text-base sm:text-sm">Seleccionar Horario</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => clearMantencion(index)}
                            title="Vaciar mantención"
                            className="px-3 py-3 bg-slate-100 hover:bg-red-50 text-slate-400 hover:text-red-500 rounded-xl border-2 border-slate-200 hover:border-red-200 transition-all"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>

                        {mant.horaInicio && mant.horaFin && (
                          <div className="flex gap-2">
                            <div
                              onClick={() => openTimelineModal('mantencion', index, `Mantención ${index + 1}`, mant.horaInicio, mant.horaFin)}
                              className="flex-1 flex items-center justify-between px-4 py-3 bg-slate-100 rounded-xl border-2 border-slate-200 cursor-pointer hover:opacity-80 transition-opacity"
                            >
                              <span className="text-sm font-bold text-slate-600">
                                {mant.horaInicio} - {mant.horaFin} • {calcularDuracion(mant.horaInicio, mant.horaFin)}
                              </span>
                              <span className="text-xs font-semibold text-slate-500 flex items-center gap-1">
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                </svg>
                                Editar
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => clearMantencion(index)}
                              title="Vaciar mantención"
                              className="px-3 py-3 bg-slate-100 hover:bg-red-50 text-slate-400 hover:text-red-500 rounded-xl border-2 border-slate-200 hover:border-red-200 transition-all"
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
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
            className="flex-1 px-6 py-3 bg-gradient-to-r from-slate-800 to-slate-900 hover:from-slate-700 hover:to-slate-800 disabled:from-slate-300 disabled:to-slate-300 text-white font-bold rounded-lg transition-all shadow-lg disabled:shadow-none"
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

// Componente ActivityCard actualizado con botón de timeline y opciones predefinidas
function ActivityCard({ index, data, onUpdate, onRemove, errors, canRemove, color, labelActividad, placeholder, onOpenTimeline, onClear, existingSlots, opciones = [] }) {
  // Calcula duración legible a partir de dos strings "HH:MM"
  const duracion = (ini, fin) => {
    if (!ini || !fin) return '';
    const [h1, m1] = ini.split(':').map(Number);
    const [h2, m2] = fin.split(':').map(Number);
    const diff = (h2 * 60 + m2) - (h1 * 60 + m1);
    if (diff <= 0) return '';
    return diff >= 60 ? `${Math.floor(diff/60)}h ${diff%60}m` : `${diff}m`;
  };

  // Detectar el campo correcto (actividad vs motivo vs tipo)
  const campo = 'actividad' in data ? 'actividad' : 'motivo' in data ? 'motivo' : 'tipo';
  const valorCampo = data[campo] || '';

  const colors = {
    green: { bg: 'bg-red-50',   border: 'border-red-200',   text: 'text-red-700',   button: 'bg-red-700 hover:bg-red-800' },
    amber: { bg: 'bg-amber-50', border: 'border-amber-300', text: 'text-amber-700', button: 'bg-amber-600 hover:bg-amber-700' },
    slate: { bg: 'bg-slate-50', border: 'border-slate-200', text: 'text-slate-600', button: 'bg-slate-800 hover:bg-slate-700' },
  };
  const c = colors[color] || colors.slate;
  const tieneHorario = !!(data.horaInicio && data.horaFin);

  return (
    <div className={`${c.bg} border-2 ${c.border} rounded-xl p-3 sm:p-4`}>
      <div className="space-y-3">

        {/* Campo Actividad / Motivo */}
        <div>
          <label className="block text-[10px] sm:text-xs font-bold text-slate-700 mb-1">
            {labelActividad}
          </label>
          {opciones.length > 0 ? (
            <select
              value={valorCampo}
              onChange={(e) => onUpdate(index, campo, e.target.value)}
              className="input-modern w-full text-sm"
            >
              <option value="">Seleccionar...</option>
              {opciones.map((op, i) => <option key={i} value={op}>{op}</option>)}
            </select>
          ) : (
            <input
              type="text"
              value={valorCampo}
              onChange={(e) => onUpdate(index, campo, e.target.value)}
              placeholder={placeholder}
              className="input-modern w-full text-sm"
            />
          )}
        </div>

        {/* Horario: bloque informativo si está confirmado, botón si no */}
        {tieneHorario ? (
          <div className="flex gap-2">
            <div
              onClick={onOpenTimeline}
              className="flex-1 flex items-center justify-between px-4 py-3 bg-white rounded-xl border-2 border-slate-300 cursor-pointer hover:border-slate-500 transition-all shadow-sm"
            >
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-sm font-bold text-slate-800">{data.horaInicio} – {data.horaFin}</span>
                {duracion(data.horaInicio, data.horaFin) && (
                  <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-medium">
                    {duracion(data.horaInicio, data.horaFin)}
                  </span>
                )}
              </div>
              <span className="text-xs font-semibold text-slate-400 flex items-center gap-1 flex-shrink-0">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
                Editar
              </span>
            </div>
            {onClear && (
              <button type="button" onClick={onClear} title="Vaciar"
                className="px-3 py-3 bg-slate-100 hover:bg-red-50 text-slate-400 hover:text-red-500 rounded-xl border-2 border-slate-200 hover:border-red-200 transition-all">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        ) : (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onOpenTimeline}
              className="flex-1 px-4 py-4 sm:py-3 bg-slate-800 active:bg-slate-700 text-white font-semibold text-sm sm:text-sm rounded-xl sm:rounded-lg transition-all shadow-md flex items-center justify-center gap-2"
            >
              <svg className="w-6 h-6 sm:w-5 sm:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-base sm:text-sm">Seleccionar Horario</span>
            </button>
            {onClear && (
              <button
                type="button"
                onClick={onClear}
                title="Vaciar actividad"
                className="px-3 py-3 bg-slate-100 hover:bg-red-50 text-slate-400 hover:text-red-500 rounded-xl border-2 border-slate-200 hover:border-red-200 transition-all"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
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
          <div className="flex items-center gap-2 p-2 bg-slate-50 border border-slate-200 rounded-lg">
            <svg className="w-4 h-4 text-slate-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" />
            </svg>
            <span className="text-xs font-semibold text-slate-600">{errors.solapamiento}</span>
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
function TiempoProgramadoCard({ title, data, onOpenTimeline, onClear, existingSlots }) {
  return (
    <div className="bg-slate-50 border-2 border-slate-200 rounded-xl p-3 sm:p-4">
      <div className="flex items-center gap-2 mb-3">
        <svg className="w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="9"/><path strokeLinecap="round" d="M12 7v5l3 3"/></svg>
        <div className="font-bold text-sm sm:text-base text-slate-900">{title}</div>
      </div>
      
      {/* Botón timeline o display horario confirmado */}
      {data.horaInicio && data.horaFin ? (
        <div className="flex gap-2">
          <div
            onClick={onOpenTimeline}
            className="flex-1 flex items-center justify-between px-4 py-3 bg-blue-50 rounded-xl border-2 border-blue-200 cursor-pointer hover:opacity-80 transition-opacity"
          >
            <span className="text-sm font-bold text-blue-700">
              {data.horaInicio} - {data.horaFin} • {calcularDuracion(data.horaInicio, data.horaFin)}
            </span>
            <span className="text-xs font-semibold text-blue-600 flex items-center gap-1">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
              Editar
            </span>
          </div>
          {onClear && (
            <button
              type="button"
              onClick={onClear}
              title="Vaciar"
              className="px-3 py-3 bg-slate-100 hover:bg-red-50 text-slate-400 hover:text-red-500 rounded-xl border-2 border-slate-200 hover:border-red-200 transition-all"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={onOpenTimeline}
          className="w-full px-4 py-4 sm:py-3 bg-slate-800 active:bg-slate-700 text-white font-semibold text-sm rounded-xl sm:rounded-lg transition-all shadow-md flex items-center justify-center gap-2"
        >
          <svg className="w-6 h-6 sm:w-5 sm:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-base sm:text-sm">Seleccionar Horario</span>
        </button>
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
