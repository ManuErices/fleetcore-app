import React from 'react';

export default function Header({ onLoginClick }) {
  const handleScroll = (e, targetId) => {
    e.preventDefault();
    const element = document.getElementById(targetId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <header 
      className="sticky top-0 z-40 backdrop-blur-md border-b"
      style={{ backgroundColor: 'rgba(10, 22, 40, 0.85)', borderColor: 'rgba(30, 41, 59, 0.5)' }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src="/favicon.svg" alt="FleetCore Logo" className="h-8 w-8 object-contain" />
          <span className="text-xl font-black text-white tracking-tight">
            Fleet<span className="text-blue-400">Core</span>
          </span>
        </div>
        
        <nav className="hidden md:flex items-center gap-8">
          <a 
            href="#modulos" 
            onClick={(e) => handleScroll(e, 'modulos')}
            className="text-slate-300 hover:text-white font-medium text-sm transition-colors"
          >
            Módulos
          </a>
          <a 
            href="#offline" 
            onClick={(e) => handleScroll(e, 'offline')}
            className="text-slate-300 hover:text-white font-medium text-sm transition-colors"
          >
            Modo Offline
          </a>
          <a 
            href="#pricing" 
            onClick={(e) => handleScroll(e, 'pricing')}
            className="text-slate-300 hover:text-white font-medium text-sm transition-colors"
          >
            Precios
          </a>
          <a 
            href="#contacto" 
            onClick={(e) => handleScroll(e, 'contacto')}
            className="text-slate-300 hover:text-white font-medium text-sm transition-colors"
          >
            Soporte
          </a>
        </nav>

        <button
          onClick={onLoginClick}
          className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-xs sm:text-sm transition-all shadow-lg shadow-blue-600/20 hover:scale-[1.02] active:scale-[0.98]"
        >
          Iniciar Sesión
        </button>
      </div>
    </header>
  );
}
