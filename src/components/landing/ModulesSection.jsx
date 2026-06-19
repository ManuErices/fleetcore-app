import React from 'react';
import { MODULES } from '../../lib/plans';

export default function ModulesSection() {
  const getBadgeColor = (price) => {
    if (price === 0) return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
    return 'bg-blue-500/10 text-blue-400 border-blue-500/30';
  };

  return (
    <section 
      id="modulos" 
      className="py-24 border-y"
      style={{ 
        backgroundColor: 'rgba(9, 17, 32, 0.6)', 
        borderColor: 'rgba(30, 41, 59, 0.6)' 
      }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <p className="text-blue-400 font-bold text-xs uppercase tracking-widest mb-3">Modularidad Inteligente</p>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white">
            Arma el sistema según tus{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-400">
              necesidades reales
            </span>
          </h2>
          <p className="text-slate-400 text-sm sm:text-base max-w-xl mx-auto mt-4 leading-relaxed">
            Paga solo por lo que utilizas. El módulo de Finanzas es 100% gratuito para siempre. Agrega cualquier otro módulo por solo 3 UF al mes.
          </p>
        </div>

        {/* Grid de Módulos */}
        <div className="space-y-16">
          {Object.values(MODULES).map((mod, idx) => {
            const isEven = idx % 2 === 0;
            return (
              <div 
                key={mod.id} 
                className={`grid lg:grid-cols-12 gap-8 lg:gap-12 items-center ${
                  isEven ? '' : 'lg:flex-row-reverse'
                }`}
              >
                {/* Contenido descriptivo */}
                <div className={`lg:col-span-6 space-y-6 ${isEven ? 'lg:order-1' : 'lg:order-2'}`}>
                  <div className="flex items-center gap-3">
                    <span 
                      className={`text-xs font-black px-3 py-1 rounded-full border uppercase tracking-wider ${getBadgeColor(mod.priceUf)}`}
                    >
                      {mod.priceUf === 0 ? 'Gratis' : `${mod.priceUf} UF / mes`}
                    </span>
                    <span className="text-slate-500 text-xs font-semibold">Módulo {idx + 1}</span>
                  </div>

                  <h3 className="text-2xl sm:text-3xl font-black text-white">
                    {mod.name}
                  </h3>
                  
                  <p className="text-slate-300 text-sm sm:text-base leading-relaxed">
                    {mod.description}
                  </p>

                  <div className="grid sm:grid-cols-2 gap-3 pt-2">
                    {mod.features.map((feat, fIdx) => (
                      <div key={fIdx} className="flex items-start gap-2">
                        <div className="w-5 h-5 rounded-full bg-blue-500/10 flex items-center justify-center shrink-0 mt-0.5">
                          <svg className="w-3 h-3 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                        <span className="text-slate-400 text-xs sm:text-sm">{feat}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Imagen de referencia */}
                <div className={`lg:col-span-6 ${isEven ? 'lg:order-2' : 'lg:order-1'}`}>
                  <div className="relative group overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 aspect-[16/10] shadow-2xl">
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-transparent opacity-65 z-10" />
                    <img 
                      src={mod.image} 
                      alt={mod.name} 
                      className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                      loading="lazy"
                    />
                    <div className="absolute bottom-4 left-4 z-20">
                      <p className="text-[10px] text-blue-400 font-bold uppercase tracking-wider">Referencia de uso</p>
                      <h4 className="text-white font-bold text-sm sm:text-base mt-0.5">{mod.name}</h4>
                    </div>
                  </div>
                </div>

              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
