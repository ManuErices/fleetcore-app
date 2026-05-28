import React from "react";

export default function MaquinaModal({
  data, setData,
  empresasLocal, esMPF,
  onConfirm, onClose,
  loading,
}) {
  return (
    <div className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full">
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-6">
          <h3 className="text-xl font-black">🚜 Nueva Maquinaria</h3>
          <p className="text-blue-100 text-sm mt-1">Registrar equipo para la empresa seleccionada</p>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">Empresa Vinculada</label>
            <select
              value={data.empresaId}
              onChange={(e) => setData({ ...data, empresaId: e.target.value })}
              className="w-full px-4 py-2 border-2 border-slate-200 rounded-lg focus:outline-none focus:border-blue-500 text-sm bg-slate-50"
            >
              <option value="">Seleccione empresa...</option>
              <option value="MPF">MPF Ingeniería Civil</option>
              {empresasLocal.filter(e => !esMPF(e.id)).map(emp => (
                <option key={emp.id} value={emp.id}>{emp.nombre}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Patente <span className="text-red-500">*</span></label>
              <input
                type="text"
                placeholder="Ej: ABCD-12"
                value={data.patente}
                onChange={(e) => setData({ ...data, patente: e.target.value.toUpperCase() })}
                className="w-full px-4 py-2 border-2 border-blue-200 rounded-lg focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Tipo <span className="text-red-500">*</span></label>
              <input
                type="text"
                placeholder="Ej: Excavadora, Camión..."
                value={data.tipo}
                onChange={(e) => setData({ ...data, tipo: e.target.value })}
                className="w-full px-4 py-2 border-2 border-blue-200 rounded-lg focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Modelo</label>
              <input
                type="text"
                placeholder="Ej: Caterpillar 320"
                value={data.modelo}
                onChange={(e) => setData({ ...data, modelo: e.target.value })}
                className="w-full px-4 py-2 border-2 border-blue-200 rounded-lg focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>
          <div className="flex gap-3 pt-4 border-t border-blue-200">
            <button
              onClick={onClose}
              className="flex-1 px-6 py-3 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-xl transition-all"
            >
              Cancelar
            </button>
            <button
              onClick={onConfirm}
              disabled={loading || !data.patente || !data.tipo || !data.empresaId}
              className="flex-1 px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:from-slate-300 disabled:to-slate-400 text-white font-bold rounded-xl transition-all shadow-lg disabled:cursor-not-allowed"
            >
              {loading ? 'Creando...' : '✓ Crear Máquina'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
