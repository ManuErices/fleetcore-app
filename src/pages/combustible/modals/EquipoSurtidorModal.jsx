import React from "react";

export default function EquipoSurtidorModal({
  data, setData,
  onConfirm, onClose,
  loading,
}) {
  return (
    <div className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full">
        <div className="bg-gradient-to-r from-amber-600 to-orange-600 text-white p-6">
          <h3 className="text-xl font-black">🚛 Nuevo Equipo Surtidor</h3>
          <p className="text-amber-100 text-sm mt-1">Camión o equipo que entrega combustible</p>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Patente <span className="text-red-500">*</span></label>
              <input
                type="text"
                value={data.patente}
                onChange={(e) => setData({ ...data, patente: e.target.value.toUpperCase() })}
                className="w-full px-4 py-2 border-2 border-amber-200 rounded-lg focus:outline-none focus:border-amber-500"
                placeholder="Ej: AABB01"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Nombre <span className="text-red-500">*</span></label>
              <input
                type="text"
                value={data.nombre}
                onChange={(e) => setData({ ...data, nombre: e.target.value })}
                className="w-full px-4 py-2 border-2 border-amber-200 rounded-lg focus:outline-none focus:border-amber-500"
                placeholder="Ej: Camión Combustible"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Tipo</label>
              <input
                type="text"
                value={data.tipo}
                onChange={(e) => setData({ ...data, tipo: e.target.value })}
                className="w-full px-4 py-2 border-2 border-amber-200 rounded-lg focus:outline-none focus:border-amber-500"
                placeholder="Ej: Camión, Mochila"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Marca</label>
              <input
                type="text"
                value={data.marca}
                onChange={(e) => setData({ ...data, marca: e.target.value })}
                className="w-full px-4 py-2 border-2 border-amber-200 rounded-lg focus:outline-none focus:border-amber-500"
                placeholder="Ej: Mercedes Benz"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-bold text-slate-700 mb-2">Modelo</label>
              <input
                type="text"
                value={data.modelo}
                onChange={(e) => setData({ ...data, modelo: e.target.value })}
                className="w-full px-4 py-2 border-2 border-amber-200 rounded-lg focus:outline-none focus:border-amber-500"
                placeholder="Ej: Actros 2644"
              />
            </div>
          </div>
          <div className="flex gap-3 pt-4 border-t border-amber-200">
            <button
              onClick={onClose}
              className="flex-1 px-6 py-3 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-xl transition-all"
            >
              Cancelar
            </button>
            <button
              onClick={onConfirm}
              disabled={loading || !data.patente || !data.nombre}
              className="flex-1 px-6 py-3 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 disabled:from-slate-300 disabled:to-slate-400 text-white font-bold rounded-xl transition-all shadow-lg disabled:cursor-not-allowed"
            >
              {loading ? 'Creando...' : '✓ Crear Equipo'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
