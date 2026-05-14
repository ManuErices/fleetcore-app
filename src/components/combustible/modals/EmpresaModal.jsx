import React from "react";

export default function EmpresaModal({
  data, setData,
  onConfirm, onClose,
  loading,
}) {
  return (
    <div className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full">
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-6">
          <h3 className="text-xl font-black">🏢 Nueva Empresa</h3>
          <p className="text-blue-100 text-sm mt-1">Empresa que recibe el combustible</p>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">Nombre de la Empresa <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={data.nombre}
              onChange={(e) => setData({ ...data, nombre: e.target.value })}
              className="w-full px-4 py-2 border-2 border-blue-200 rounded-lg focus:outline-none focus:border-blue-500"
              placeholder="Ej: Constructora ABC Ltda."
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">RUT</label>
            <input
              type="text"
              value={data.rut}
              onChange={(e) => setData({ ...data, rut: e.target.value })}
              className="w-full px-4 py-2 border-2 border-blue-200 rounded-lg focus:outline-none focus:border-blue-500"
              placeholder="Ej: 76.123.456-7"
            />
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
              disabled={loading || !data.nombre}
              className="flex-1 px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:from-slate-300 disabled:to-slate-400 text-white font-bold rounded-xl transition-all shadow-lg disabled:cursor-not-allowed"
            >
              {loading ? 'Creando...' : '✓ Crear Empresa'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
