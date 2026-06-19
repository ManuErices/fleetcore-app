import React from "react";

export default function ProyectoModal({
  data, setData,
  onConfirm, onClose,
  loading,
}) {
  return (
    <div className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full">
        <div className="bg-gradient-to-r from-orange-500 to-amber-500 text-white p-6">
          <h3 className="text-xl font-black">🏗️ Nueva Obra / Proyecto</h3>
          <p className="text-orange-100 text-sm mt-1">Crea una obra para asociar tus reportes</p>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">Nombre de la Obra <span className="text-red-500">*</span></label>
            <input type="text" value={data.name} onChange={(e) => setData({ ...data, name: e.target.value })}
              className="w-full px-4 py-2 border-2 border-orange-200 rounded-lg focus:outline-none focus:border-orange-500"
              placeholder="Ej: Proyecto Ruta 5 Sur" />
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">Código (opcional)</label>
            <input type="text" value={data.codigo} onChange={(e) => setData({ ...data, codigo: e.target.value })}
              className="w-full px-4 py-2 border-2 border-orange-200 rounded-lg focus:outline-none focus:border-orange-500"
              placeholder="Ej: CC-001" />
          </div>
          <div className="flex gap-3 pt-4 border-t border-orange-200">
            <button onClick={onClose} className="flex-1 px-6 py-3 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-xl transition-all">Cancelar</button>
            <button onClick={onConfirm} disabled={loading || !data.name.trim()}
              className="flex-1 px-6 py-3 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 disabled:from-slate-300 disabled:to-slate-400 text-white font-bold rounded-xl transition-all shadow-lg disabled:cursor-not-allowed">
              {loading ? 'Creando...' : '✓ Crear Obra'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
