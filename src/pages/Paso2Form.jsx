import React from "react";

export default function Paso2Form({ formData, setFormData, onBack, onSubmit, isLoading, selectedMachine }) {
  
  // Funciones para manejar actividades efectivas
  const addActividad = () => {
    setFormData({
      ...formData,
      actividadesEfectivas: [...formData.actividadesEfectivas, { actividad: '', horaInicio: '', horaFin: '' }]
    });
  };

  const removeActividad = (index) => {
    const newActividades = formData.actividadesEfectivas.filter((_, i) => i !== index);
    setFormData({ ...formData, actividadesEfectivas: newActividades });
  };

  const updateActividad = (index, field, value) => {
    const newActividades = [...formData.actividadesEfectivas];
    newActividades[index][field] = value;
    setFormData({ ...formData, actividadesEfectivas: newActividades });
  };

  // Funciones para manejar tiempos no efectivos
  const addTiempoNoEfectivo = () => {
    setFormData({
      ...formData,
      tiemposNoEfectivos: [...formData.tiemposNoEfectivos, { motivo: '', horaInicio: '', horaFin: '' }]
    });
  };

  const removeTiempoNoEfectivo = (index) => {
    const newTiempos = formData.tiemposNoEfectivos.filter((_, i) => i !== index);
    setFormData({ ...formData, tiemposNoEfectivos: newTiempos });
  };

  const updateTiempoNoEfectivo = (index, field, value) => {
    const newTiempos = [...formData.tiemposNoEfectivos];
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

      <form onSubmit={onSubmit} className="max-w-4xl mx-auto px-4 space-y-6">
        
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
            {formData.actividadesEfectivas.map((act, idx) => (
              <ActivityCard
                key={idx}
                index={idx}
                data={act}
                onUpdate={updateActividad}
                onRemove={removeActividad}
                canRemove={formData.actividadesEfectivas.length > 1}
                placeholder="Ej: Reperfilado de Plataforma"
                color="green"
              />
            ))}
            
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
          subtitle="Mantención programada o no programada"
          icon={
            <svg className="w-5 h-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          }
        >
          <textarea
            value={formData.mantenciones}
            onChange={(e) => setFormData({ ...formData, mantenciones: e.target.value })}
            placeholder="Describe mantenciones programadas o no programadas realizadas..."
            rows={4}
            className="input-modern w-full text-sm sm:text-base resize-none"
          />
          <p className="text-xs text-slate-500 mt-2">
            Opcional: Detalla cualquier mantención realizada durante el turno
          </p>
        </Section>

        {/* BOTONES DE NAVEGACIÓN */}
        <div className="grid grid-cols-2 gap-4 pt-4">
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
function ActivityCard({ index, data, onUpdate, onRemove, canRemove, placeholder, color = "green", labelActividad = "Actividad" }) {
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
            required
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
              className="input-modern w-full text-sm"
              required
            />
          </div>
          <div>
            <label className="block text-[10px] sm:text-xs font-bold text-slate-700 mb-1">
              Hora Fin
            </label>
            <input
              type="time"
              value={data.horaFin}
              onChange={(e) => onUpdate(index, 'horaFin', e.target.value)}
              className="input-modern w-full text-sm"
              required
            />
          </div>
        </div>

        {/* Duración calculada */}
        {data.horaInicio && data.horaFin && (
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
  
  if (totalMinutos < 0) totalMinutos += 24 * 60; // Si cruza medianoche
  
  const horas = Math.floor(totalMinutos / 60);
  const minutos = totalMinutos % 60;
  
  return `${horas}:${minutos.toString().padStart(2, '0')}`;
}
