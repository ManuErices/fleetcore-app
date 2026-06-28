import React from "react";
import { PillButton } from "../../../components/ui/PillButton";

export default function TipoStep({ setTipoReporte, setPaso, handleClose }) {
  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">

      <div className="grid grid-cols-1 gap-3">
        {/* ENTRADA */}
        <button
          onClick={() => { setTipoReporte('entrada'); setPaso(2); }}
          className="group relative bg-gradient-to-br from-green-50 to-emerald-50 hover:from-green-100 hover:to-emerald-100 border-2 border-green-300 hover:border-green-500 rounded-2xl p-5 transition-all hover:shadow-lg active:scale-95"
        >
          <div className="flex flex-col items-center gap-3">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center group-hover:scale-110 transition-transform shadow-md shadow-green-200">
              <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
              </svg>
            </div>
            <div className="text-center">
              <h4 className="text-lg font-black text-green-900 mb-1 uppercase">Entrada</h4>
              <p className="text-sm text-green-700">Recibes combustible al estanque o camión</p>
            </div>
          </div>
        </button>

        {/* SALIDA */}
        <button
          onClick={() => { setTipoReporte('entrega'); setPaso(2); }}
          className="group relative bg-gradient-to-br from-blue-50 to-indigo-50 hover:from-blue-100 hover:to-indigo-100 border-2 border-blue-300 hover:border-blue-500 rounded-2xl p-5 transition-all hover:shadow-lg active:scale-95"
        >
          <div className="flex flex-col items-center gap-3">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center group-hover:scale-110 transition-transform shadow-md shadow-blue-200">
              <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
            </div>
            <div className="text-center">
              <h4 className="text-lg font-black text-blue-900 mb-1 uppercase">Salida</h4>
              <p className="text-sm text-blue-700">Entregas combustible a máquinas o equipos</p>
            </div>
          </div>
        </button>
      </div>

      <div className="flex gap-3 pt-2 border-t border-orange-100">
        <PillButton
          variant="outline"
          onClick={handleClose}
          className="flex-1"
        >
          Cancelar
        </PillButton>
      </div>
    </div>
  );
}
