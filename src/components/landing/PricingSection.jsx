import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { MODULES, calculateTotal } from '../../lib/plans';
import { auth, db } from '../../lib/firebase';
import { doc, getDoc } from 'firebase/firestore';

export default function PricingSection({ onAuthRequired, currentUser }) {
  const navigate = useNavigate();
  const [selectedModules, setSelectedModules] = useState(['finanzas']);
  const [ufRate, setUfRate] = useState(38300);
  const [loading, setLoading] = useState(false);
  const [successType, setSuccessType] = useState(null); // null | 'free' | 'webpay'
  const [errorMessage, setErrorMessage] = useState('');

  const [empresaId, setEmpresaId] = useState('');
  const [userRole, setUserRole] = useState(null);

  useEffect(() => {
    if (!currentUser) {
      setUserRole(null);
      setEmpresaId('');
      return;
    }

    // 1. Fetch user doc to get company ID and role
    getDoc(doc(db, 'users', currentUser.uid)).then(userSnap => {
      if (userSnap.exists()) {
        const uData = userSnap.data();
        setUserRole(uData.role || 'operador');
        const empId = uData.empresaId || '';
        setEmpresaId(empId);

        if (empId) {
          // 2. Fetch subscription for this company
          getDoc(doc(db, 'subscriptions', empId)).then(subSnap => {
            if (subSnap.exists()) {
              const data = subSnap.data();
              if (data.modules && Array.isArray(data.modules)) {
                const mods = data.modules.includes('finanzas') ? data.modules : ['finanzas', ...data.modules];
                setSelectedModules(mods);
              } else if (data.planId) {
                const parsed = data.planId.split(',').filter(Boolean);
                const mods = parsed.includes('finanzas') ? parsed : ['finanzas', ...parsed];
                setSelectedModules(mods);
              }
            }
          }).catch(err => console.error('Error loading company subscription:', err));
        }
      }
    }).catch(err => console.error('Error fetching user document:', err));
  }, [currentUser]);

  useEffect(() => {
    // Fetch dynamic UF rate from mindicador.cl
    fetch('https://mindicador.cl/api/uf')
      .then(res => res.json())
      .then(data => {
        if (data?.serie?.[0]?.valor) {
          setUfRate(Math.round(data.serie[0].valor));
        }
      })
      .catch(err => {
        console.warn('CORS or network error fetching UF rate client-side (using fallback 38,300):', err.message);
      });
  }, []);

  const handleToggleModule = (moduleId) => {
    setErrorMessage('');
    if (moduleId === 'finanzas') {
      // Finanzas is the free module and cannot be deselected
      return;
    }

    if (selectedModules.includes(moduleId)) {
      setSelectedModules(selectedModules.filter(id => id !== moduleId));
    } else {
      setSelectedModules([...selectedModules, moduleId]);
    }
  };

  const { totalUf } = calculateTotal(selectedModules);
  const netClp = Math.round(totalUf * ufRate);
  const ivaClp = Math.round(netClp * 0.19);
  const totalClp = netClp + ivaClp;

  const handleCheckout = async () => {
    setErrorMessage('');
    if (!currentUser) {
      // Pass selected modules up to redirect user to registration/login
      onAuthRequired(selectedModules);
      return;
    }

    if (userRole === 'admin_contrato' || userRole === 'superadmin') {
      // Redirigir directamente al panel administrativo para confirmar o pagar la suscripción
      navigate('/admin?tab=mi_plan');
    } else {
      setErrorMessage('Tu rol actual no permite gestionar la suscripción. Comunícate con el Administrador de Contrato de tu empresa.');
    }
  };

  return (
    <section 
      id="pricing" 
      className="py-24 relative overflow-hidden"
    >
      {/* Visual background lights */}
      <div className="absolute top-1/2 left-1/4 -translate-y-1/2 w-[500px] h-[500px] rounded-full bg-blue-500/5 blur-[120px] pointer-events-none" />
      <div className="absolute top-1/3 right-1/4 -translate-y-1/2 w-[400px] h-[400px] rounded-full bg-purple-500/5 blur-[100px] pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
        <div className="text-center mb-16">
          <p className="text-blue-400 font-bold text-xs uppercase tracking-widest mb-3">Precios y Contratación</p>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white">
            Arma tu plan a la{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-400">
              medida de tu empresa
            </span>
          </h2>
          <p className="text-slate-400 text-sm sm:text-base max-w-xl mx-auto mt-4 leading-relaxed">
            Personaliza tus módulos. Cambia de plan, agrega o quita módulos en cualquier momento desde tu panel de control.
          </p>
        </div>

        <div className="grid lg:grid-cols-12 gap-8 items-start">
          {/* List of Modules Selectors */}
          <div className="lg:col-span-8 space-y-4">
            <h3 className="text-lg font-bold text-white mb-2">Selecciona los módulos a activar:</h3>
            
            {Object.values(MODULES).map((mod) => {
              const isSelected = selectedModules.includes(mod.id);
              const isFinanzas = mod.id === 'finanzas';
              
              return (
                <div
                  key={mod.id}
                  onClick={() => handleToggleModule(mod.id)}
                  className={`border-2 rounded-2xl p-5 flex items-start gap-4 transition-all cursor-pointer ${
                    isSelected 
                      ? 'bg-slate-900/80 border-blue-500 shadow-lg shadow-blue-500/5' 
                      : 'bg-slate-900/40 border-slate-800 hover:border-slate-700 hover:bg-slate-900/60'
                  }`}
                >
                  {/* Custom Checkbox */}
                  <div className="mt-1 flex-shrink-0">
                    <div className={`w-6 h-6 rounded-md border flex items-center justify-center transition-all ${
                      isSelected 
                        ? 'bg-blue-600 border-blue-500 text-white' 
                        : 'border-slate-700 bg-slate-950'
                    }`}>
                      {isSelected && (
                        <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between flex-wrap gap-2">
                      <h4 className="text-white font-bold text-base sm:text-lg flex items-center gap-2">
                        {mod.name}
                        {isFinanzas && (
                          <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full uppercase tracking-wider font-extrabold">
                            Gratis por ahora
                          </span>
                        )}
                      </h4>
                      <span className="text-sm font-black text-slate-300">
                        {isFinanzas ? '0 UF' : '3 UF / mes'}
                      </span>
                    </div>
                    <p className="text-slate-400 text-xs sm:text-sm mt-1 leading-relaxed">{mod.description}</p>
                    
                    {/* Feature tags */}
                    <div className="flex flex-wrap gap-2 mt-3">
                      {mod.features.slice(0, 3).map((feat, idx) => (
                        <span key={idx} className="text-[10px] bg-slate-800 text-slate-300 px-2 py-1 rounded-md border border-slate-700">
                          ✓ {feat}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pricing Total Summary Card */}
          <div className="lg:col-span-4">
            <div 
              className="border rounded-3xl p-6 shadow-2xl relative overflow-hidden"
              style={{ 
                backgroundColor: 'rgba(15, 28, 46, 0.95)', 
                borderColor: 'rgba(255, 255, 255, 0.08)' 
              }}
            >
              <h3 className="text-lg font-black text-white mb-4 border-b border-slate-800 pb-3">Resumen de Suscripción</h3>
              
              <div className="space-y-3 mb-6">
                {selectedModules.map(id => (
                  <div key={id} className="flex justify-between items-center text-xs">
                    <span className="text-slate-300 font-medium">{MODULES[id]?.name}</span>
                    <span className="text-white font-bold">{MODULES[id]?.priceUf === 0 ? 'Gratis' : '3 UF'}</span>
                  </div>
                ))}
              </div>

              <div className="border-t border-slate-800 pt-4 space-y-3 mb-8">
                <div className="flex justify-between items-baseline">
                  <span className="text-sm text-slate-400 font-bold">Total Mensual:</span>
                  <span className="text-2xl sm:text-3xl font-black text-white">
                    {totalUf} UF
                  </span>
                </div>

                {totalUf > 0 && (
                  <div className="space-y-1 bg-slate-950/60 p-3 rounded-xl border border-slate-900 text-[11px] text-slate-400 font-semibold">
                    <div className="flex justify-between">
                      <span>Valor Neto:</span>
                      <span>~ {new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(netClp)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>IVA (19%):</span>
                      <span>~ {new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(ivaClp)}</span>
                    </div>
                    <div className="flex justify-between text-white font-bold border-t border-slate-800 pt-1 mt-1 text-xs">
                      <span>Total CLP:</span>
                      <span>~ {new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(totalClp)}</span>
                    </div>
                    <div className="text-[9px] text-slate-500 mt-2 font-medium">
                      * Cifras en CLP calculadas según valor de referencia UF (~${ufRate.toLocaleString('es-CL')}). El cargo final en CLP se calculará al momento del cobro.
                    </div>
                  </div>
                )}

                {totalUf === 0 && (
                  <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 p-3 rounded-xl text-center text-xs font-bold">
                    ¡Tu plan es 100% gratuito! Disfruta del módulo de Finanzas y Contabilidad sin costo.
                  </div>
                )}
              </div>

              {errorMessage && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-400 font-bold text-center mb-4">
                  ⚠️ {errorMessage}
                </div>
              )}

              <button
                onClick={handleCheckout}
                disabled={loading}
                className="w-full py-4 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 text-white font-bold rounded-xl text-sm transition-all active:scale-[0.98] shadow-lg shadow-blue-600/20 disabled:opacity-50"
              >
                {loading ? (
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Procesando...
                  </div>
                ) : !currentUser ? (
                  'Registrarse para contratar'
                ) : (userRole === 'admin_contrato' || userRole === 'superadmin') ? (
                  'Gestionar en mi Panel de Admin'
                ) : (
                  'Gestionar plan (Solo Admin)'
                )}
              </button>

              <div className="mt-4 flex items-center justify-center gap-2 text-[10px] text-slate-500">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                <span>Transacción segura vía Transbank</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Premium feedback loading/success overlay */}
      {successType && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div 
            className="w-full max-w-md border rounded-3xl p-8 text-center space-y-6 animate-scaleIn shadow-2xl relative"
            style={{ 
              backgroundColor: 'rgba(15, 28, 46, 0.95)', 
              borderColor: 'rgba(255, 255, 255, 0.08)' 
            }}
          >
            {successType === 'free' ? (
              <>
                <div className="w-16 h-16 bg-emerald-500/20 border-2 border-emerald-500 text-emerald-400 rounded-full flex items-center justify-center mx-auto animate-bounce">
                  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h3 className="text-2xl font-black text-white">¡Suscripción Actualizada!</h3>
                <p className="text-slate-300 text-sm leading-relaxed">
                  El módulo gratuito de **Finanzas y Contabilidad** ha sido activado con éxito para tu empresa.
                </p>
                <div className="pt-2 flex flex-col items-center gap-2">
                  <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  <span className="text-xs text-slate-500 font-semibold">Cargando tu espacio de trabajo...</span>
                </div>
              </>
            ) : (
              <>
                <div className="w-16 h-16 bg-blue-500/20 border-2 border-blue-500 text-blue-400 rounded-full flex items-center justify-center mx-auto animate-bounce">
                  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h3 className="text-2xl font-black text-white">¡Felicidades por tu compra!</h3>
                <p className="text-slate-300 text-sm leading-relaxed font-medium">
                  Tu plan modular ha sido activado de manera simulada y exitosa. Disfruta de todos tus nuevos módulos contratados.
                </p>
                <div className="pt-2 flex flex-col items-center gap-2">
                  <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  <span className="text-xs text-slate-500 font-semibold">Cargando tu espacio de trabajo...</span>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
