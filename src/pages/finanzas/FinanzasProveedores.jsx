import React from "react";

export default function FinanzasProveedores() {
  return (
    <div className="p-4 sm:p-6">
      <div className="glass-card rounded-xl p-8 flex flex-col items-center justify-center text-center gap-3">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-700 to-violet-600 flex items-center justify-center shadow-lg">
          <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
        </div>
        <h2 className="text-lg font-black text-slate-800">Proveedores</h2>
        <p className="text-sm text-slate-500">Próximamente — en desarrollo</p>
      </div>
    </div>
  );
}
