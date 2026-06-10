import React from 'react';

export default function Footer() {
  const handleScroll = (e, targetId) => {
    e.preventDefault();
    const element = document.getElementById(targetId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <footer 
      id="contacto" 
      className="border-t border-slate-800 py-12 relative z-10"
      style={{ backgroundColor: '#070F1C' }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row justify-between items-center gap-6">
        <div className="flex items-center gap-2">
          <img src="/favicon.svg" alt="FleetCore Logo" className="h-6 w-6 object-contain" />
          <span className="font-bold text-slate-300">
            FleetCore by <strong>SAER TI</strong>
          </span>
        </div>
        
        <div className="flex gap-6 text-xs text-slate-400">
          <a href="#modulos" onClick={(e) => handleScroll(e, 'modulos')} className="hover:text-white transition-colors">Módulos</a>
          <a href="#offline" onClick={(e) => handleScroll(e, 'offline')} className="hover:text-white transition-colors">Modo Offline</a>
          <a href="#pricing" onClick={(e) => handleScroll(e, 'pricing')} className="hover:text-white transition-colors">Precios</a>
        </div>

        <p className="text-xs text-slate-500 text-center md:text-right">
          © {new Date().getFullYear()} Todos los derechos reservados. Soporte: <a href="mailto:soporte@mpf.cl" className="text-blue-400 hover:underline">soporte@mpf.cl</a>
        </p>
      </div>
    </footer>
  );
}
