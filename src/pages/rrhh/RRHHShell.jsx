import React, { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useEmpresa } from "../../lib/useEmpresa";
import UserMenuDropdown from "../../components/UserMenuDropdown";
import RRHH from "./index";

export default function RRHHShell({ user, userRole, onLogout, onBackToSelector, onAdminPanel, onAdminEmpresaPanel }) {
  const { empresa } = useEmpresa();

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-[1400px] mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-600 to-teal-700 flex items-center justify-center shadow">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <div>
              <div className="text-sm font-black text-slate-800 leading-tight">Fleet<span className="text-emerald-600">Core</span></div>
              <div className="text-[9px] font-bold tracking-widest text-slate-400 uppercase leading-tight">Recursos Humanos</div>
            </div>
            {empresa && (
              <div className="hidden sm:flex items-center gap-1.5 ml-2 pl-3 border-l border-slate-200">
                {empresa.logoUrl
                  ? <img src={empresa.logoUrl} alt="" className="w-5 h-5 rounded object-contain" />
                  : <div className="w-5 h-5 rounded bg-slate-200 flex items-center justify-center text-[9px] font-black text-slate-500">{empresa.nombre?.[0]}</div>
                }
                <span className="text-xs font-semibold text-slate-600 max-w-[120px] truncate">{empresa.nombre}</span>
              </div>
            )}
          </div>
          <UserMenuDropdown
            user={user}
            userRole={userRole}
            onLogout={onLogout}
            onBackToSelector={onBackToSelector}
            onAdminPanel={onAdminPanel}
            onAdminEmpresaPanel={onAdminEmpresaPanel}
          />
        </div>
      </header>
      <RRHH />
    </div>
  );
}
