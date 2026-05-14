import React from "react";

export default function TipoStep({ setTipoReporte, setPaso, handleClose }) {
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="bg-orange-50 border-2 border-orange-200 rounded-xl p-4">
        <h3 className="text-lg font-black text-orange-900 mb-1">Tipo de Movimiento</h3>
        <p className="text-sm text-orange-700">Selecciona si estás recibiendo o entregando combustible</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* ENTRADA */}
        <button
          onClick={() => { setTipoReporte('entrada'); setPaso(2); }}
          className="group relative bg-gradient-to-br from-green-50 to-emerald-50 hover:from-green-100 hover:to-emerald-100 border-3 border-green-300 hover:border-green-500 rounded-2xl p-8 transition-all hover:shadow-xl"
        >
          <div className="flex flex-col items-center gap-4">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center group-hover:scale-110 transition-transform shadow-lg shadow-green-200">
              <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
              </svg>
            </div>
            <div className="text-center">
              <h4 className="text-xl font-black text-green-900 mb-2 uppercase">Entrada</h4>
              <p className="text-sm text-green-700">Recepción de combustible al estanque o camión</p>
            </div>
          </div>
        </button>

        {/* ENTREGA */}
        <button
          onClick={() => { setTipoReporte('entrega'); setPaso(2); }}
          className="group relative bg-gradient-to-br from-blue-50 to-indigo-50 hover:from-blue-100 hover:to-indigo-100 border-3 border-blue-300 hover:border-blue-500 rounded-2xl p-8 transition-all hover:shadow-xl"
        >
          <div className="flex flex-col items-center gap-4">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center group-hover:scale-110 transition-transform shadow-lg shadow-blue-200">
              <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
            </div>
            <div className="text-center">
              <h4 className="text-xl font-black text-blue-900 mb-2 uppercase">Salida</h4>
              <p className="text-sm text-blue-700">Entrega de combustible a máquina o equipo</p>
            </div>
          </div>
        </button>
      </div>

      <div className="flex gap-3 pt-4 border-t border-orange-100">
        <button
          type="button"
          onClick={handleClose}
          className="flex-1 px-6 py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-xl transition-all"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
