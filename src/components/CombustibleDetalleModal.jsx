import React, { useState } from 'react';

export default function CombustibleDetalleModal({ 
  reporte, 
  onClose, 
  projectName, 
  machineInfo,
  surtidorInfo,
  operadorInfo,
  userRole = 'operador', // 'administrador' o 'operador'
  onSave, // función callback para guardar cambios
  onSign // función callback para firmar el reporte
}) {
  if (!reporte) return null;

  const isAdmin = userRole === 'administrador';
  const [isEditing, setIsEditing] = useState(false);
  const [editedData, setEditedData] = useState({ ...reporte });
  const [showSignModal, setShowSignModal] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');

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

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full max-h-[95vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-orange-600 to-amber-600 text-white p-6 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-black flex items-center gap-2">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Detalle de Reporte de Combustible
            </h2>
            <p className="text-orange-100 text-sm mt-1">
              N° {reporte.numeroReporte} - {reporte.fecha}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full hover:bg-white/20 flex items-center justify-center transition-colors"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Información General del Reporte */}
          <div className="bg-gradient-to-br from-orange-50 to-amber-50 rounded-xl p-6 mb-6 border-2 border-orange-200">
            <h3 className="text-lg font-black text-orange-900 mb-4 flex items-center gap-2">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
              Información General
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <DataField label="Fecha de Registro" value={reporte.fecha} />
              <DataField label="N° de Reporte" value={reporte.numeroReporte} />
              <DataField label="Proyecto" value={projectName || reporte.projectId} />
            </div>
          </div>

          {/* Información de la Máquina */}
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-6 mb-6 border-2 border-blue-200">
            <h3 className="text-lg font-black text-blue-900 mb-4 flex items-center gap-2">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path d="M8 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM15 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
                <path d="M3 4a1 1 0 00-1 1v10a1 1 0 001 1h1.05a2.5 2.5 0 014.9 0H10a1 1 0 001-1V5a1 1 0 00-1-1H3zM14 7a1 1 0 00-1 1v6.05A2.5 2.5 0 0115.95 16H17a1 1 0 001-1v-5a1 1 0 00-.293-.707l-2-2A1 1 0 0015 7h-1z" />
              </svg>
              Información del Vehículo/Máquina
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <DataField label="Patente" value={machineInfo?.patente || reporte.machinePatente} />
              <DataField label="Nombre/Modelo" value={machineInfo?.name || reporte.machineName} />
              {isEditing ? (
                <div>
                  <div className="text-xs font-semibold text-slate-500 mb-1">Horómetro/Odómetro</div>
                  <input
                    type="number"
                    step="0.1"
                    value={editedData.datosEntrega?.horometroOdometro ?? editedData.horometroOdometro ?? ''}
                    onChange={(e) => updateField('datosEntrega', { ...editedData.datosEntrega, horometroOdometro: e.target.value })}
                    className="w-full px-3 py-2 border-2 border-blue-300 rounded-lg focus:outline-none focus:border-blue-500"
                  />
                </div>
              ) : (
                <DataField label="Horómetro/Odómetro" value={reporte.datosEntrega?.horometroOdometro || reporte.horometroOdometro || '-'} />
              )}
            </div>
          </div>

          {/* Información del Combustible */}
          <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl p-6 mb-6 border-2 border-green-200">
            <h3 className="text-lg font-black text-green-900 mb-4 flex items-center gap-2">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M12.395 2.553a1 1 0 00-1.45-.385c-.345.23-.614.558-.822.88-.214.33-.403.713-.57 1.116-.334.804-.614 1.768-.84 2.734a31.365 31.365 0 00-.613 3.58 2.64 2.64 0 01-.945-1.067c-.328-.68-.398-1.534-.398-2.654A1 1 0 005.05 6.05 6.981 6.981 0 003 11a7 7 0 1011.95-4.95c-.592-.591-.98-.985-1.348-1.467-.363-.476-.724-1.063-1.207-2.03zM12.12 15.12A3 3 0 017 13s.879.5 2.5.5c0-1 .5-4 1.25-4.5.5 1 .786 1.293 1.371 1.879A2.99 2.99 0 0113 13a2.99 2.99 0 01-.879 2.121z" clipRule="evenodd" />
              </svg>
              Detalle de Combustible
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {isEditing ? (
                <>
                  <div>
                    <div className="text-xs font-semibold text-slate-500 mb-1">Cantidad (Litros)</div>
                    <input
                      type="number"
                      step="0.01"
                      value={editedData.datosEntrega?.cantidadLitros ?? editedData.cantidadLitros ?? ''}
                      onChange={(e) => updateField('datosEntrega', { ...editedData.datosEntrega, cantidadLitros: e.target.value })}
                      className="w-full px-3 py-2 border-2 border-green-300 rounded-lg focus:outline-none focus:border-green-500"
                    />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-slate-500 mb-1">Empresa</div>
                    <input
                      type="text"
                      value={editedData.datosEntrega?.empresaNombre ?? editedData.datosEntrega?.empresa ?? editedData.empresa ?? ''}
                      onChange={(e) => updateField('datosEntrega', { ...editedData.datosEntrega, empresaNombre: e.target.value })}
                      className="w-full px-3 py-2 border-2 border-green-300 rounded-lg focus:outline-none focus:border-green-500"
                    />
                  </div>
                </>
              ) : (
                <>
                  <div className="bg-white rounded-lg p-4 border-2 border-green-300">
                    <div className="text-xs font-semibold text-green-700 mb-1">Cantidad Suministrada</div>
                    <div className="text-3xl font-black text-green-600 flex items-baseline gap-2">
                      {reporte.datosEntrega?.cantidadLitros ?? reporte.cantidadLitros}
                      <span className="text-lg text-green-500">Litros</span>
                    </div>
                  </div>
                  <DataField label="Empresa Proveedora" value={reporte.datosEntrega?.empresaNombre || reporte.empresaNombre || reporte.datosEntrega?.empresa || reporte.empresa || '-'} />
                </>
              )}
            </div>
          </div>

          {/* Personal Involucrado */}
          <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl p-6 mb-6 border-2 border-purple-200">
            <h3 className="text-lg font-black text-purple-900 mb-4 flex items-center gap-2">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
              </svg>
              Personal Involucrado
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <DataField label="Surtidor" value={surtidorInfo?.nombre || reporte.repartidorNombre || reporte.surtidorNombre || '-'} />
                {(surtidorInfo?.rut || reporte.repartidorRut) && (
                  <p className="text-xs text-slate-500 mt-1">RUT: {surtidorInfo?.rut || reporte.repartidorRut}</p>
                )}
              </div>
              <div>
                <DataField label="Operador" value={operadorInfo?.nombre || reporte.operadorNombre || '-'} />
                {operadorInfo?.rut && (
                  <p className="text-xs text-slate-500 mt-1">RUT: {operadorInfo.rut}</p>
                )}
              </div>
            </div>
          </div>

          {/* Observaciones */}
          {(reporte.observaciones || isEditing) && (
            <div className="bg-gradient-to-br from-slate-50 to-slate-100 rounded-xl p-6 mb-6 border-2 border-slate-200">
              <h3 className="text-lg font-black text-slate-900 mb-4 flex items-center gap-2">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
                Observaciones
              </h3>
              {isEditing ? (
                <textarea
                  value={editedData.observaciones}
                  onChange={(e) => updateField('observaciones', e.target.value)}
                  className="w-full px-4 py-3 border-2 border-slate-300 rounded-lg focus:outline-none focus:border-orange-500 min-h-[100px]"
                  placeholder="Ingrese observaciones adicionales..."
                />
              ) : (
                <p className="text-sm text-slate-700 whitespace-pre-wrap">
                  {reporte.observaciones || 'Sin observaciones'}
                </p>
              )}
            </div>
          )}

          {/* Estado de Firma */}
          {reporte.firmado && (
            <div className="bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50 rounded-xl p-6 border-2 border-emerald-300 relative overflow-hidden">
              {/* Patrón decorativo de fondo superior */}
              <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-emerald-400/10 to-teal-400/10 rounded-full blur-3xl"></div>
              <div className="absolute bottom-0 left-0 w-40 h-40 bg-gradient-to-tr from-cyan-400/10 to-emerald-400/10 rounded-full blur-3xl"></div>

              <div className="relative z-10">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 rounded-full bg-emerald-500 flex items-center justify-center shadow-lg">
                    <svg className="w-7 h-7 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-emerald-900">Reporte Firmado y Validado</h3>
                    <p className="text-sm text-emerald-700">Este documento ha sido revisado y aprobado</p>
                  </div>
                </div>

                <div className="bg-white/80 backdrop-blur-sm rounded-lg p-4 border-2 border-emerald-200">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs font-bold text-emerald-700 mb-1">Firmado por</p>
                      <p className="text-sm font-black text-slate-900">{reporte.firmaAdmin?.nombre}</p>
                    </div>
                    <div>
                      <p className="text-xs font-bold text-emerald-700 mb-1">Fecha y hora de firma</p>
                      <p className="text-sm font-black text-slate-900">
                        {new Date(reporte.firmaAdmin?.timestamp).toLocaleString('es-CL')}
                      </p>
                    </div>
                    <div className="md:col-span-2">
                      <p className="text-xs font-bold text-emerald-700 mb-1">ID de Verificación</p>
                      <div className="flex items-center gap-2">
                        <code className="text-xs font-mono bg-emerald-100 text-emerald-800 px-3 py-1 rounded border border-emerald-300">
                          {reporte.id}
                        </code>
                      </div>
                      <p className="text-xs text-slate-500 mt-2 italic">
                        Este código garantiza la autenticidad e integridad del documento
                      </p>
                    </div>
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
              className="w-full px-6 py-3 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white font-bold rounded-xl transition-all shadow-lg hover:shadow-xl"
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
              Firmar Reporte de Combustible
            </h3>
            <p className="text-slate-600 mb-6">
              Al firmar este reporte, usted valida que toda la información del suministro de combustible es correcta y ha sido revisada.
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

// Componente auxiliar
function DataField({ label, value }) {
  return (
    <div>
      <div className="text-xs font-semibold text-slate-500 mb-1">{label}</div>
      <div className="text-sm font-bold text-slate-900">{value || '-'}</div>
    </div>
  );
}
