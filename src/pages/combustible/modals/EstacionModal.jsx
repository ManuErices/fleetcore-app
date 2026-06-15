import React from "react";

export default function EstacionModal({
  data, setData,
  onConfirm, onClose,
  loading,
}) {
  return (
    <div className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full">
        <div className="bg-gradient-to-r from-green-600 to-emerald-600 text-white p-6">
          <h3 className="text-xl font-black">⛽ Nueva Estación de Servicio</h3>
          <p className="text-green-100 text-sm mt-1">Estación de combustible para cargar el equipo surtidor</p>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">Nombre de la Estación <span className="text-red-500">*</span></label>
            <input type="text" value={data.nombre} onChange={(e) => setData({ ...data, nombre: e.target.value })}
              className="w-full px-4 py-2 border-2 border-green-200 rounded-lg focus:outline-none focus:border-green-500"
              placeholder="Ej: Estación Centro" />
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">Marca (opcional)</label>
            <input type="text" value={data.marca} onChange={(e) => setData({ ...data, marca: e.target.value })}
              className="w-full px-4 py-2 border-2 border-green-200 rounded-lg focus:outline-none focus:border-green-500"
              placeholder="Ej: Copec, Shell, Petrobras" />
          </div>
          <div className="flex gap-3 pt-4 border-t border-green-200">
            <button onClick={onClose} className="flex-1 px-6 py-3 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-xl transition-all">Cancelar</button>
            <button onClick={onConfirm} disabled={loading || !data.nombre.trim()}
              className="flex-1 px-6 py-3 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 disabled:from-slate-300 disabled:to-slate-400 text-white font-bold rounded-xl transition-all shadow-lg disabled:cursor-not-allowed">
              {loading ? 'Creando...' : '✓ Crear Estación'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
